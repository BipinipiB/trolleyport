namespace Trolleyport.Api;

// Shapes mirror data/products.json and data/purchase-history.json.

public record Product(
    string Id,
    string Name,
    string Category,
    string Unit,
    decimal Price,
    bool IsVegetarian,
    bool InStock,
    bool OnDeal,
    decimal? DealPrice);

public record Catalog(string Currency, IReadOnlyList<Product> Products);

public record StockUpdate(bool InStock);

public record Shopper(string Id, string Name, string Household, string UsualShoppingDay);

public record OrderLine(string ProductId, string Name, int Quantity, decimal UnitPrice, decimal LineTotal);

public record Order(string OrderId, DateOnly Date, IReadOnlyList<OrderLine> Items, decimal Total);

public record PurchaseHistory(string Currency, Shopper Shopper, IReadOnlyList<Order> Orders);
