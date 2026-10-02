using System.Text.Json;

namespace Trolleyport.Api;

/// <summary>
/// Loads the Step 1 mock data files once at startup and keeps them in memory.
/// Fails fast if a file is missing or malformed, so a bad data file never looks like an empty shop.
/// Stock can be toggled at runtime to simulate items selling out; that lives in memory only and
/// <see cref="ResetStock"/> (or a restart) restores the values from products.json.
/// </summary>
public sealed class MockDataStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly Catalog _initialCatalog;
    private readonly Dictionary<string, PurchaseHistory> _historyByShopper;
    private readonly Lock _stockLock = new();

    // Replaced as a whole on every stock change, so readers always see a consistent snapshot.
    private volatile Catalog _catalog;

    public Catalog Catalog => _catalog;

    public MockDataStore(string dataDirectory)
    {
        _initialCatalog = Load<Catalog>(Path.Combine(dataDirectory, "products.json"));
        if (_initialCatalog.Products.Count == 0)
            throw new InvalidDataException("products.json contains no products.");
        _catalog = _initialCatalog;

        var history = Load<PurchaseHistory>(Path.Combine(dataDirectory, "purchase-history.json"));
        _historyByShopper = new(StringComparer.OrdinalIgnoreCase) { [history.Shopper.Id] = history };
    }

    public PurchaseHistory? GetHistory(string shopperId) =>
        _historyByShopper.GetValueOrDefault(shopperId);

    /// <summary>Marks a product in or out of stock. Returns the updated product, or null if the id is unknown.</summary>
    public Product? SetStock(string productId, bool inStock)
    {
        lock (_stockLock)
        {
            var products = _catalog.Products.ToList();
            int index = products.FindIndex(p => p.Id == productId);
            if (index < 0) return null;
            products[index] = products[index] with { InStock = inStock };
            _catalog = _catalog with { Products = products };
            return products[index];
        }
    }

    /// <summary>Restores every product's stock flag to its value in products.json.</summary>
    public void ResetStock()
    {
        lock (_stockLock) _catalog = _initialCatalog;
    }

    private static T Load<T>(string path)
    {
        if (!File.Exists(path))
            throw new FileNotFoundException($"Mock data file not found: {Path.GetFullPath(path)}");

        using var stream = File.OpenRead(path);
        return JsonSerializer.Deserialize<T>(stream, JsonOptions)
            ?? throw new InvalidDataException($"{path} is empty.");
    }
}
