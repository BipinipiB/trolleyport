using System.Text.Encodings.Web;
using System.Text.Json;
using Anthropic.Models.Messages;

namespace Trolleyport.Api;

public record ExplainedSwap(string ItemId, string Original, string Replacement, string Sentence, bool Fallback);

public record ExplainedDrop(string ItemId, string Name, IReadOnlyList<string> Evidence, string Sentence, bool Fallback);

/// <summary>
/// The plain-English explanation shown with a basket. Every swap and drop listed here is taken from what actually
/// happened in the run; Claude only writes the sentences, and each sentence is checked to name its item.
/// </summary>
public record BasketExplanation(
    string Headline,
    string Kept,
    IReadOnlyList<string> KeptItems,
    IReadOnlyList<ExplainedSwap> Swaps,
    IReadOnlyList<ExplainedDrop> Drops,
    long InputTokens,
    long OutputTokens);

/// <summary>
/// Turns the facts of a finished agent run into a short explanation: what was kept, what was swapped and why, and
/// what was dropped. The facts are computed here from the run (basket, recorded changes, stock and budget signals);
/// Claude is asked to word them, not to recall or infer them, so the text can't describe a swap that didn't happen.
/// </summary>
public sealed class BasketExplainer(ClaudeFoundry claude, MockDataStore store, ILogger<BasketExplainer> logger)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private const string SystemPrompt = """
        You write the short explanation a shopper reads after Trolleyport's shopping agent has built their weekly
        basket. Everything you may say is in <run_facts>. Do not add items, reasons, prices or numbers that are not
        there, and do not guess at reasons the facts don't give. Plain, friendly New Zealand English, no markdown.
        Always write item names exactly as they appear in the facts (e.g. "Wholemeal Sandwich Bread", not "bread").

        - kept: one sentence naming the household's usual items that made it into the basket (if there are none,
          say so).
        - swaps: exactly one entry per item in facts.swaps, with itemId set to its originalItemId. The sentence must
          name both the original item and the replacement, and give the reason from the facts.
        - drops: exactly one entry per item in facts.drops, with itemId set to its itemId. The sentence must name the
          item and give the reason the evidence supports: out of stock, not suitable for the diet or other dietary
          needs, didn't fit the budget, or the agent's recorded reason. If the evidence gives no reason, say it was left out this week.
        """;

    private static readonly Dictionary<string, JsonElement> OutputSchema = new()
    {
        ["type"] = JsonSerializer.SerializeToElement("object"),
        ["additionalProperties"] = JsonSerializer.SerializeToElement(false),
        ["required"] = JsonSerializer.SerializeToElement(new[] { "kept", "swaps", "drops" }),
        ["properties"] = JsonSerializer.SerializeToElement(new Dictionary<string, object>
        {
            ["kept"] = new { type = "string" },
            ["swaps"] = SentenceList,
            ["drops"] = SentenceList,
        }),
    };

    private static object SentenceList => new
    {
        type = "array",
        items = new
        {
            type = "object",
            additionalProperties = false,
            required = new[] { "itemId", "sentence" },
            properties = new { itemId = new { type = "string" }, sentence = new { type = "string" } },
        },
    };

    private record WrittenSentence(string ItemId, string Sentence);
    private record WrittenExplanation(string Kept, List<WrittenSentence> Swaps, List<WrittenSentence> Drops);

    public async Task<BasketExplanation> ExplainAsync(
        ShoppingTools run, string shopperId, decimal? budget, string? diet, string? otherDietaryNeeds, CancellationToken ct)
    {
        // ---- 1. Facts, computed from what actually happened in this run ----
        var products = run.CatalogSnapshot.Products.ToDictionary(p => p.Id);
        var inBasket = run.Basket.Select(l => l.ItemId).ToHashSet();
        var usual = UsualItemIds(shopperId);

        var swaps = run.Changes
            .Where(c => c.Decision == "substituted" && c.ReplacementItemId is { } r && inBasket.Contains(r))
            .GroupBy(c => c.OriginalItemId).Select(g => g.Last())
            .ToList();
        var swappedOriginals = swaps.Select(s => s.OriginalItemId).ToHashSet();

        var recordedSkips = run.Changes.Where(c => c.Decision == "skipped")
            .GroupBy(c => c.OriginalItemId).ToDictionary(g => g.Key, g => g.Last().Reason);
        var dropIds = usual.Where(id => !inBasket.Contains(id) && !swappedOriginals.Contains(id))
            .Concat(recordedSkips.Keys.Where(id => !inBasket.Contains(id)))
            .Distinct()
            .Where(products.ContainsKey)
            .ToList();
        var drops = dropIds.Select(id =>
        {
            var p = products[id];
            var evidence = new List<string>();
            if (!p.InStock || run.SeenOutOfStock.Contains(id)) evidence.Add("out of stock");
            if (diet is "vegetarian" or "vegan" && !p.IsVegetarian) evidence.Add($"not suitable for a {diet} diet");
            if (run.RefusedOverBudget.Contains(id)) evidence.Add("adding it was refused for going over budget");
            if (recordedSkips.TryGetValue(id, out var why)) evidence.Add($"agent's recorded reason: {why}");
            return (Product: p, Evidence: evidence);
        }).ToList();

        var keptNames = usual.Where(inBasket.Contains).Select(id => products[id].Name).ToList();

        var facts = new
        {
            budget = budget?.ToString("0.00") ?? "no budget",
            total = run.Total,
            remaining = budget - run.Total,
            diet = diet ?? "not specified",
            otherDietaryNeeds = otherDietaryNeeds ?? "none",
            usualItemsKept = keptNames,
            swaps = swaps.Select(s => new
            {
                originalItemId = s.OriginalItemId, original = s.OriginalName, replacement = s.ReplacementName,
                agentReason = s.Reason,
            }),
            drops = drops.Select(d => new { itemId = d.Product.Id, name = d.Product.Name, evidence = d.Evidence }),
            otherItemsInBasket = run.Basket.Where(l => !usual.Contains(l.ItemId)).Select(l => l.Name),
        };

        // ---- 2. Claude words the facts ----
        WrittenExplanation? written = null;
        long inTokens = 0, outTokens = 0;
        try
        {
            Message message = await claude.CreateMessageAsync(new MessageCreateParams
            {
                Model = claude.Deployment,
                MaxTokens = 4096,
                System = SystemPrompt,
                OutputConfig = new OutputConfig { Effort = Effort.Low, Format = new JsonOutputFormat { Schema = OutputSchema } },
                Messages = [new() { Role = Role.User, Content = $"<run_facts>\n{JsonSerializer.Serialize(facts, Json)}\n</run_facts>" }],
            }, ct);
            inTokens = message.Usage.InputTokens;
            outTokens = message.Usage.OutputTokens;
            string text = string.Concat(message.Content.Select(b => b.TryPickText(out TextBlock? t) ? t.Text : ""));
            written = JsonSerializer.Deserialize<WrittenExplanation>(text, Json);
        }
        catch (Exception ex) when (ex is ClaudeCallException or JsonException)
        {
            // The basket is still valid without nice wording; fall back to plain factual sentences below.
            logger.LogWarning(ex, "Couldn't get a written explanation; using factual fallback sentences");
        }

        // ---- 3. Check every sentence names its real item; otherwise use a plain factual sentence ----
        var swapSentences = (written?.Swaps ?? []).GroupBy(s => s.ItemId).ToDictionary(g => g.Key, g => g.First().Sentence);
        var dropSentences = (written?.Drops ?? []).GroupBy(s => s.ItemId).ToDictionary(g => g.Key, g => g.First().Sentence);

        var explainedSwaps = swaps.Select(s =>
        {
            bool ok = swapSentences.TryGetValue(s.OriginalItemId, out var sentence)
                      && Mentions(sentence, s.OriginalName) && Mentions(sentence, s.ReplacementName!);
            return new ExplainedSwap(s.OriginalItemId, s.OriginalName, s.ReplacementName!,
                ok ? sentence! : $"{s.OriginalName} was swapped for {s.ReplacementName}: {s.Reason}", !ok);
        }).ToList();

        var explainedDrops = drops.Select(d =>
        {
            bool ok = dropSentences.TryGetValue(d.Product.Id, out var sentence) && Mentions(sentence, d.Product.Name);
            string fallback = d.Evidence.Count > 0
                ? $"{d.Product.Name} was left out ({string.Join("; ", d.Evidence)})."
                : $"{d.Product.Name} was left out this week.";
            return new ExplainedDrop(d.Product.Id, d.Product.Name, d.Evidence, ok ? sentence! : fallback, !ok);
        }).ToList();

        var ignored = swapSentences.Keys.Except(explainedSwaps.Select(s => s.ItemId))
            .Concat(dropSentences.Keys.Except(explainedDrops.Select(d => d.ItemId))).ToList();
        if (ignored.Count > 0)
            logger.LogWarning("[explain] ignored sentences about items that weren't swapped or dropped: {Ids}", string.Join(", ", ignored));

        var explanation = new BasketExplanation(
            // Pure numbers, so written here rather than by the model: no chance of a wrong figure or typo.
            Headline: budget is { } b
                ? $"Your basket comes to ${run.Total:0.00} of your ${b:0.00} budget, with ${b - run.Total:0.00} to spare."
                : $"Your basket comes to ${run.Total:0.00}. You didn't set a budget, so I kept it to a normal week's shop.",
            Kept: written?.Kept ?? (keptNames.Count > 0 ? $"Kept your usuals: {string.Join(", ", keptNames)}." : "None of your usual items made it in this week."),
            KeptItems: keptNames,
            Swaps: explainedSwaps,
            Drops: explainedDrops,
            InputTokens: inTokens,
            OutputTokens: outTokens);

        logger.LogInformation(
            "[explain] facts: {Facts}\n  headline: {Headline}\n  kept: {Kept}\n  swaps: {Swaps}\n  drops: {Drops}",
            JsonSerializer.Serialize(facts, Json), explanation.Headline, explanation.Kept,
            string.Join(" | ", explainedSwaps.Select(s => (s.Fallback ? "[fallback] " : "") + s.Sentence)),
            string.Join(" | ", explainedDrops.Select(d => (d.Fallback ? "[fallback] " : "") + d.Sentence)));
        return explanation;
    }

    /// <summary>Items bought in at least half of the shopper's past orders.</summary>
    private List<string> UsualItemIds(string shopperId)
    {
        var history = store.GetHistory(shopperId);
        if (history is null || history.Orders.Count == 0) return [];
        return history.Orders
            .SelectMany(o => o.Items.Select(i => i.ProductId).Distinct())
            .GroupBy(id => id)
            .Where(g => g.Count() * 2 >= history.Orders.Count)
            .OrderByDescending(g => g.Count())
            .Select(g => g.Key)
            .ToList();
    }

    private static bool Mentions(string? sentence, string name) =>
        sentence is not null && sentence.Contains(name, StringComparison.OrdinalIgnoreCase);
}
