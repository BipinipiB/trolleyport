using System.Text.Json;
using Anthropic.Models.Messages;

namespace Trolleyport.Api;

public record BasketLine(string ItemId, string Name, string Unit, int Quantity, decimal UnitPrice, decimal LineTotal, bool OnDeal);

/// <summary>Result of running one tool: the JSON Claude sees, and whether it was an error.</summary>
public record ToolOutcome(string Json, bool IsError);

/// <summary>A swap or skip of one of the household's usual items, as Claude recorded it.</summary>
public record BasketChange(string OriginalItemId, string OriginalName, string Decision, string? ReplacementItemId, string? ReplacementName, string Reason);

/// <summary>
/// The tools Claude can call while building a basket, backed by the mock catalog and history.
/// One instance per agent run: it owns that run's basket. The tools only answer questions and enforce
/// hard limits (budget, diet, stock); they never decide what to do next, and they never suggest
/// substitutes — Claude decides what to swap or skip.
/// </summary>
/// <param name="budget">Hard ceiling for the basket total, or null when the shopper hasn't set one.</param>
/// <param name="initialBasket">Lines already in the basket (for edits at checkout); empty when building from scratch.</param>
public sealed class ShoppingTools(
    MockDataStore store, string shopperId, decimal? budget, string? diet, IEnumerable<(string ItemId, int Quantity)>? initialBasket = null)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // Stock snapshot taken when the run starts, so a toggle mid-run can't change answers halfway through.
    private readonly Catalog _catalog = store.Catalog;
    private readonly Dictionary<string, Product> _products = store.Catalog.Products.ToDictionary(p => p.Id);
    private readonly List<BasketLine> _basket = SeedBasket(store.Catalog, initialBasket);
    private readonly List<BasketChange> _changes = [];

    // Evidence gathered during the run, used afterwards to explain the basket accurately.
    private readonly HashSet<string> _seenOutOfStock = [];
    private readonly HashSet<string> _refusedOverBudget = [];

    public IReadOnlyList<BasketLine> Basket => _basket;
    public IReadOnlyList<BasketChange> Changes => _changes;
    public decimal Total => _basket.Sum(l => l.LineTotal);
    public Catalog CatalogSnapshot => _catalog;
    /// <summary>Items check_stock reported as out of stock during this run.</summary>
    public IReadOnlySet<string> SeenOutOfStock => _seenOutOfStock;
    /// <summary>Items add_to_basket refused because they would have gone over budget.</summary>
    public IReadOnlySet<string> RefusedOverBudget => _refusedOverBudget;

    // Every tool takes a required "reason" so the log shows why Claude made each call.
    private static readonly JsonElement ReasonProperty = JsonSerializer.SerializeToElement(new
    {
        type = "string",
        description = "One plain-English sentence for the shopper explaining why you are making this call now, " +
                      "e.g. what you learned that led to it. Not just a single word.",
    });

    /// <summary>Tools for building a basket from scratch.</summary>
    public static IReadOnlyList<ToolUnion> BuildDefinitions => [.. Common, RecordChangeTool];

    /// <summary>Tools for editing an existing basket at checkout: the same tools, plus removal.</summary>
    public static IReadOnlyList<ToolUnion> EditDefinitions => [.. Common, RemoveFromBasketTool];

    private static readonly IReadOnlyList<ToolUnion> Common =
    [
        new Tool
        {
            Name = "check_history",
            Description = "Returns the shopper's past weekly orders (dates, items, quantities and the price paid). " +
                          "Use it to learn what this household usually buys.",
            InputSchema = new() { Properties = new Dictionary<string, JsonElement> { ["reason"] = ReasonProperty }, Required = ["reason"] },
        },
        new Tool
        {
            Name = "search_deals",
            Description = "Returns every catalog item that is currently discounted, with its normal and deal price, " +
                          "category, unit and whether it is vegetarian.",
            InputSchema = new() { Properties = new Dictionary<string, JsonElement> { ["reason"] = ReasonProperty }, Required = ["reason"] },
        },
        new Tool
        {
            Name = "check_stock",
            Description = "Checks whether a catalog item is in stock, and returns its current price (deal price if " +
                          "discounted), unit, category and whether it is vegetarian.",
            InputSchema = new()
            {
                Properties = new Dictionary<string, JsonElement>
                {
                    ["item_id"] = JsonSerializer.SerializeToElement(new { type = "string", description = "Catalog item id, e.g. prod-008" }),
                    ["reason"] = ReasonProperty,
                },
                Required = ["item_id", "reason"],
            },
        },
        new Tool
        {
            Name = "add_to_basket",
            Description = "Adds an item to the basket at its current price. Adding an item that is already in the basket " +
                          "increases its quantity. Fails if the item is out of stock, breaks the shopper's diet, or would " +
                          "take the basket over budget; the error says why. Returns the updated basket total and remaining budget.",
            InputSchema = new()
            {
                Properties = new Dictionary<string, JsonElement>
                {
                    ["item_id"] = JsonSerializer.SerializeToElement(new { type = "string", description = "Catalog item id, e.g. prod-008" }),
                    ["quantity"] = JsonSerializer.SerializeToElement(new { type = "integer", minimum = 1, maximum = 20 }),
                    ["reason"] = ReasonProperty,
                },
                Required = ["item_id", "quantity", "reason"],
            },
        },
        new Tool
        {
            Name = "browse_catalog",
            Description = "Lists catalog items, optionally limited to one category (Produce, Dairy, Bakery, Meat & Protein, " +
                          "Snacks, Pantry), with current price, unit and whether each is vegetarian. Does not report stock; " +
                          "use check_stock for that.",
            InputSchema = new()
            {
                Properties = new Dictionary<string, JsonElement>
                {
                    ["category"] = JsonSerializer.SerializeToElement(new { type = "string", description = "Optional category name. Omit to list everything." }),
                    ["reason"] = ReasonProperty,
                },
                Required = ["reason"],
            },
        },
    ];

    private static readonly ToolUnion RecordChangeTool = new Tool
    {
        Name = "record_change",
        Description = "Records that you substituted or skipped one of the household's usual items (for example because it " +
                      "is out of stock or doesn't fit the budget), so the shopper can see what changed and why. Call it " +
                      "once per usual item you swap or leave out for those reasons.",
        InputSchema = new()
        {
            Properties = new Dictionary<string, JsonElement>
            {
                ["original_item_id"] = JsonSerializer.SerializeToElement(new { type = "string", description = "The usual item you could not buy as normal." }),
                ["decision"] = JsonSerializer.SerializeToElement(new { type = "string", @enum = new[] { "substituted", "skipped" } }),
                ["replacement_item_id"] = JsonSerializer.SerializeToElement(new { type = "string", description = "The item you added instead. Omit when skipped." }),
                ["reason"] = JsonSerializer.SerializeToElement(new { type = "string", description = "One or two plain-English sentences for the shopper explaining the decision." }),
            },
            Required = ["original_item_id", "decision", "reason"],
        },
    };

    private static readonly ToolUnion RemoveFromBasketTool = new Tool
    {
        Name = "remove_from_basket",
        Description = "Removes an item from the basket, or reduces its quantity. Returns the updated basket total.",
        InputSchema = new()
        {
            Properties = new Dictionary<string, JsonElement>
            {
                ["item_id"] = JsonSerializer.SerializeToElement(new { type = "string", description = "Catalog item id of a line in the basket" }),
                ["quantity"] = JsonSerializer.SerializeToElement(new { type = "integer", minimum = 1, description = "How many to remove. Omit to remove the whole line." }),
                ["reason"] = ReasonProperty,
            },
            Required = ["item_id", "reason"],
        },
    };

    public ToolOutcome Execute(string name, IReadOnlyDictionary<string, JsonElement> input) => name switch
    {
        "check_history" => CheckHistory(),
        "search_deals" => SearchDeals(),
        "check_stock" => CheckStock(GetString(input, "item_id")),
        "add_to_basket" => AddToBasket(GetString(input, "item_id"), GetInt(input, "quantity")),
        "browse_catalog" => BrowseCatalog(GetString(input, "category")),
        "remove_from_basket" => RemoveFromBasket(GetString(input, "item_id"), GetInt(input, "quantity")),
        "record_change" => RecordChange(GetString(input, "original_item_id"), GetString(input, "decision"),
            GetString(input, "replacement_item_id"), GetString(input, "reason")),
        _ => Error($"Unknown tool '{name}'."),
    };

    private ToolOutcome CheckHistory()
    {
        var history = store.GetHistory(shopperId);
        if (history is null) return Error($"No purchase history for shopper '{shopperId}'.");
        return Ok(new
        {
            shopper = history.Shopper.Name,
            household = history.Shopper.Household,
            orders = history.Orders.Select(o => new
            {
                date = o.Date,
                items = o.Items.Select(i => new { itemId = i.ProductId, i.Name, i.Quantity, pricePaid = i.UnitPrice }),
            }),
        });
    }

    private ToolOutcome SearchDeals() => Ok(new
    {
        deals = _catalog.Products.Where(p => p.OnDeal).Select(p => new
        {
            itemId = p.Id, p.Name, p.Category, p.Unit, normalPrice = p.Price, dealPrice = p.DealPrice, p.IsVegetarian,
        }),
    });

    private ToolOutcome CheckStock(string? itemId)
    {
        if (itemId is null || !_products.TryGetValue(itemId, out var p)) return Error($"No catalog item with id '{itemId}'.");
        if (!IsInStock(p)) _seenOutOfStock.Add(p.Id);
        return Ok(new
        {
            itemId = p.Id, p.Name, p.Category, p.Unit,
            inStock = IsInStock(p),
            currentPrice = CurrentPrice(p), normalPrice = p.Price, p.OnDeal, p.IsVegetarian,
        });
    }

    private ToolOutcome AddToBasket(string? itemId, int? quantity)
    {
        if (itemId is null || !_products.TryGetValue(itemId, out var p)) return Error($"No catalog item with id '{itemId}'.");
        if (quantity is not (>= 1 and <= 20)) return Error("quantity must be a whole number from 1 to 20.");
        if (!IsInStock(p))
        {
            _seenOutOfStock.Add(p.Id);
            return Error($"{p.Name} is out of stock.");
        }
        if (diet is "vegetarian" or "vegan" && !p.IsVegetarian)
            return Error($"{p.Name} is not vegetarian, and the shopper is {diet}.");

        decimal price = CurrentPrice(p);
        decimal newTotal = Total + price * quantity.Value;
        if (newTotal > budget)
        {
            _refusedOverBudget.Add(p.Id);
            return Error($"Adding {quantity} x {p.Name} (${price * quantity.Value:0.00}) would bring the basket to " +
                         $"${newTotal:0.00}, over the ${budget:0.00} budget. ${budget - Total:0.00} remains.");
        }

        int index = _basket.FindIndex(l => l.ItemId == p.Id);
        int newQuantity = (index >= 0 ? _basket[index].Quantity : 0) + quantity.Value;
        var line = new BasketLine(p.Id, p.Name, p.Unit, newQuantity, price, price * newQuantity, p.OnDeal);
        if (index >= 0) _basket[index] = line; else _basket.Add(line);

        return Ok(new
        {
            added = $"{quantity} x {p.Name}",
            lineInBasket = new { line.ItemId, line.Name, line.Quantity, line.LineTotal },
            basketTotal = Total,
            remainingBudget = budget - Total, // null when the shopper has no budget
            itemsInBasket = _basket.Count,
        });
    }

    private ToolOutcome RemoveFromBasket(string? itemId, int? quantity)
    {
        int index = _basket.FindIndex(l => l.ItemId == itemId);
        if (index < 0) return Error($"'{itemId}' is not in the basket.");
        if (quantity is <= 0) return Error("quantity must be at least 1.");

        var line = _basket[index];
        int remaining = quantity is { } q ? line.Quantity - q : 0;
        if (remaining <= 0) _basket.RemoveAt(index);
        else _basket[index] = line with { Quantity = remaining, LineTotal = line.UnitPrice * remaining };

        return Ok(new
        {
            removed = remaining <= 0 ? $"all {line.Name}" : $"{line.Quantity - remaining} x {line.Name}",
            quantityLeft = Math.Max(remaining, 0),
            basketTotal = Total,
            remainingBudget = budget - Total,
            itemsInBasket = _basket.Count,
        });
    }

    /// <summary>Builds starting basket lines at current catalog prices, skipping unknown ids.</summary>
    private static List<BasketLine> SeedBasket(Catalog catalog, IEnumerable<(string ItemId, int Quantity)>? items)
    {
        var products = catalog.Products.ToDictionary(p => p.Id);
        var lines = new List<BasketLine>();
        foreach (var (itemId, quantity) in items ?? [])
        {
            if (quantity <= 0 || !products.TryGetValue(itemId, out var p)) continue;
            decimal price = CurrentPrice(p);
            lines.Add(new BasketLine(p.Id, p.Name, p.Unit, quantity, price, price * quantity, p.OnDeal));
        }
        return lines;
    }

    private ToolOutcome BrowseCatalog(string? category)
    {
        var items = _catalog.Products.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(category))
        {
            items = items.Where(p => p.Category.Equals(category, StringComparison.OrdinalIgnoreCase));
            if (!items.Any())
                return Error($"Unknown category '{category}'. Categories: {string.Join(", ", _catalog.Products.Select(p => p.Category).Distinct())}.");
        }
        return Ok(new
        {
            items = items.Select(p => new
            {
                itemId = p.Id, p.Name, p.Category, p.Unit, currentPrice = CurrentPrice(p), p.OnDeal, p.IsVegetarian,
            }),
        });
    }

    private ToolOutcome RecordChange(string? originalId, string? decision, string? replacementId, string? reason)
    {
        if (originalId is null || !_products.TryGetValue(originalId, out var original))
            return Error($"No catalog item with id '{originalId}'.");
        if (decision is not ("substituted" or "skipped"))
            return Error("decision must be 'substituted' or 'skipped'.");
        if (string.IsNullOrWhiteSpace(reason))
            return Error("Please give a reason the shopper can read.");

        Product? replacement = null;
        if (decision == "substituted")
        {
            if (replacementId is null || !_products.TryGetValue(replacementId, out replacement))
                return Error("A substitution needs the replacement_item_id of the item you added instead.");
        }

        _changes.Add(new BasketChange(original.Id, original.Name, decision, replacement?.Id, replacement?.Name, reason));
        return Ok(new { recorded = $"{original.Name}: {decision}{(replacement is null ? "" : $" with {replacement.Name}")}" });
    }

    private static decimal CurrentPrice(Product p) => p.OnDeal && p.DealPrice is { } d ? d : p.Price;

    private static bool IsInStock(Product p) => p.InStock;

    private static string? GetString(IReadOnlyDictionary<string, JsonElement> input, string key) =>
        input.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static int? GetInt(IReadOnlyDictionary<string, JsonElement> input, string key) =>
        input.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out int i) ? i : null;

    private static ToolOutcome Ok(object value) => new(JsonSerializer.Serialize(value, Json), false);
    private static ToolOutcome Error(string message) => new(JsonSerializer.Serialize(new { error = message }, Json), true);
}
