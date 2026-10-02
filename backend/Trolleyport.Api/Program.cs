using Trolleyport.Api;

var builder = WebApplication.CreateBuilder(args);

// Data folder is relative to this project (backend/Trolleyport.Api -> ../../data) unless overridden in config.
string dataDirectory = Path.GetFullPath(
    builder.Configuration["MockData:Directory"] ?? "../../data",
    builder.Environment.ContentRootPath);
builder.Services.AddSingleton(new MockDataStore(dataDirectory));

// Claude via Azure AI Foundry. Resource and deployment live in appsettings.json; the API key comes from
// User Secrets in development (dotnet user-secrets set Foundry:ApiKey <key>) so it never sits in the repo.
var foundry = builder.Configuration.GetSection("Foundry").Get<FoundryOptions>() ?? new FoundryOptions();
builder.Services.AddSingleton(foundry);
builder.Services.AddSingleton<ClaudeFoundry>();
builder.Services.AddSingleton<ShoppingRequestParser>();
builder.Services.AddSingleton<BasketExplainer>();
builder.Services.AddSingleton<ShoppingAgent>();

const string FrontendCors = "Frontend";
string[] allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
    options.AddPolicy(FrontendCors, policy => policy
        .WithOrigins(allowedOrigins)
        .WithMethods("GET", "POST", "PUT")
        .WithHeaders("Content-Type")));

var app = builder.Build();

if (string.IsNullOrWhiteSpace(foundry.ApiKey))
    app.Logger.LogWarning("Foundry:ApiKey is not set - POST /api/parse-request will return 503 until it is.");

app.UseCors(FrontendCors);

var api = app.MapGroup("/api");

api.MapGet("/catalog", (MockDataStore store) => store.Catalog);

// Demo controls: simulate items selling out. In memory only; reset (or restart) restores products.json.
api.MapPut("/stock/{itemId}", (string itemId, StockUpdate body, MockDataStore store) =>
    store.SetStock(itemId, body.InStock) is { } product
        ? Results.Ok(product)
        : Results.NotFound(new { error = $"No catalog item with id '{itemId}'." }));

api.MapPost("/stock/reset", (MockDataStore store) =>
{
    store.ResetStock();
    return Results.Ok(store.Catalog);
});

api.MapGet("/history/{userId}", (string userId, MockDataStore store) =>
    store.GetHistory(userId) is { } history
        ? Results.Ok(history)
        : Results.NotFound(new { error = $"No purchase history for user '{userId}'." }));

api.MapPost("/parse-request", async (ParseRequestBody body, ShoppingRequestParser parser, CancellationToken ct) =>
{
    string text = body.Text?.Trim() ?? "";
    var followUps = body.FollowUps ?? [];

    if (text.Length == 0)
        return Results.BadRequest(new { error = "Please describe what you'd like to shop for." });
    if (text.Length > ShoppingRequestParser.MaxTextLength ||
        followUps.Any(f => f.Answer.Length > ShoppingRequestParser.MaxTextLength || f.Question.Length > ShoppingRequestParser.MaxTextLength))
        return Results.BadRequest(new { error = $"Please keep each message under {ShoppingRequestParser.MaxTextLength} characters." });
    if (followUps.Count > ShoppingRequestParser.MaxFollowUps)
        return Results.BadRequest(new { error = "Too many follow-up answers. Please start over." });

    try
    {
        return Results.Ok(await parser.ParseAsync(text, followUps, ct));
    }
    catch (ClaudeCallException ex)
    {
        return Results.Json(new { error = ex.Message }, statusCode: ex.StatusCode);
    }
});

// Step 10: a natural-language change to the basket at checkout ("swap the chips for something healthier").
api.MapPost("/edit-basket", async (EditBasketBody body, ShoppingAgent agent, MockDataStore store, CancellationToken ct) =>
{
    string instruction = body.Instruction?.Trim() ?? "";
    var basket = body.Basket ?? [];
    if (instruction.Length == 0)
        return Results.BadRequest(new { error = "Tell me what you'd like to change." });
    if (instruction.Length > ShoppingRequestParser.MaxTextLength)
        return Results.BadRequest(new { error = $"Please keep it under {ShoppingRequestParser.MaxTextLength} characters." });
    if (basket.Count > 60 || basket.Any(i => i.Quantity is < 1 or > 99))
        return Results.BadRequest(new { error = "The basket must have at most 60 lines, each with a quantity from 1 to 99." });
    if (body.Preferences is { Budget: <= 0 })
        return Results.BadRequest(new { error = "Budget must be greater than zero when given." });
    // Only the last few edits matter for context; cap what we send to the model.
    var history = (body.History ?? []).TakeLast(5).ToList();
    if (history.Any(h => h.Before.Count > 60 || h.After.Count > 60 || h.Instruction.Length > ShoppingRequestParser.MaxTextLength || h.Reply.Length > 2000))
        return Results.BadRequest(new { error = "Edit history entries are too large." });
    string shopperId = string.IsNullOrWhiteSpace(body.ShopperId) ? "shopper-001" : body.ShopperId;
    if (store.GetHistory(shopperId) is null)
        return Results.NotFound(new { error = $"No purchase history for shopper '{shopperId}'." });

    try
    {
        return Results.Ok(await agent.EditBasketAsync(instruction, basket, body.Preferences, history, shopperId, ct));
    }
    catch (ClaudeCallException ex)
    {
        return Results.Json(new { error = ex.Message }, statusCode: ex.StatusCode);
    }
});

// Takes the structured request from /api/parse-request and lets Claude build a basket with its tools.
api.MapPost("/build-basket", async (BuildBasketBody body, ShoppingAgent agent, MockDataStore store, CancellationToken ct) =>
{
    // A null budget means the shopper explicitly said "no budget"; a given budget must be positive.
    if (body.Budget is <= 0)
        return Results.BadRequest(new { error = "Budget must be greater than zero, or null for no budget." });
    if (body.Diet is not (null or "vegetarian" or "vegan" or "no_restriction"))
        return Results.BadRequest(new { error = "diet must be vegetarian, vegan, no_restriction, or null." });
    if (body.OtherDietaryNeeds is { Length: > 200 })
        return Results.BadRequest(new { error = "Please keep other dietary needs under 200 characters." });
    string shopperId = string.IsNullOrWhiteSpace(body.ShopperId) ? "shopper-001" : body.ShopperId;
    if (store.GetHistory(shopperId) is null)
        return Results.NotFound(new { error = $"No purchase history for shopper '{shopperId}'." });

    try
    {
        return Results.Ok(await agent.BuildBasketAsync(body.Budget, body.Diet, body.SeekDeals,
            string.IsNullOrWhiteSpace(body.OtherDietaryNeeds) ? null : body.OtherDietaryNeeds.Trim(), shopperId, ct));
    }
    catch (ClaudeCallException ex)
    {
        return Results.Json(new { error = ex.Message }, statusCode: ex.StatusCode);
    }
});

app.Run();
