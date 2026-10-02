using Anthropic.Exceptions;
using Anthropic.Foundry;
using Anthropic.Models.Messages;

namespace Trolleyport.Api;

public sealed class FoundryOptions
{
    public string? Resource { get; set; }
    public string Deployment { get; set; } = "claude-sonnet-5-5";
    public string? ApiKey { get; set; }
}

/// <summary>Thrown for problems the caller should see as a clean error message (not a stack trace).</summary>
public sealed class ClaudeCallException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

/// <summary>
/// The one shared Claude client (Azure AI Foundry). Turns SDK exceptions into <see cref="ClaudeCallException"/>
/// with messages that are safe to show in the UI.
/// </summary>
public sealed class ClaudeFoundry(FoundryOptions options, ILogger<ClaudeFoundry> logger)
{
    private readonly AnthropicFoundryClient? _client =
        string.IsNullOrWhiteSpace(options.ApiKey) || string.IsNullOrWhiteSpace(options.Resource)
            ? null
            : new AnthropicFoundryClient(new AnthropicFoundryApiKeyCredentials(options.ApiKey, options.Resource));

    /// <summary>On Foundry the model is addressed by its deployment name.</summary>
    public string Deployment => options.Deployment;

    public async Task<Message> CreateMessageAsync(MessageCreateParams parameters, CancellationToken ct)
    {
        if (_client is null)
            throw new ClaudeCallException(StatusCodes.Status503ServiceUnavailable,
                "Claude isn't configured on the server: the Foundry API key is missing. Set it with `dotnet user-secrets set Foundry:ApiKey <key>` in backend/Trolleyport.Api.");

        Message message;
        try
        {
            message = await _client.Messages.Create(parameters, ct);
        }
        catch (AnthropicUnauthorizedException)
        {
            throw new ClaudeCallException(StatusCodes.Status502BadGateway, "Azure rejected the Foundry API key (401). Check Foundry:ApiKey.");
        }
        catch (AnthropicNotFoundException)
        {
            throw new ClaudeCallException(StatusCodes.Status502BadGateway, $"Foundry deployment '{options.Deployment}' was not found (404).");
        }
        catch (AnthropicRateLimitException)
        {
            throw new ClaudeCallException(StatusCodes.Status503ServiceUnavailable, "Claude is rate-limited right now. Try again in a moment.");
        }
        catch (AnthropicApiException ex)
        {
            logger.LogError(ex, "Foundry call failed");
            throw new ClaudeCallException(StatusCodes.Status502BadGateway, "Claude returned an error. See the API log for details.");
        }
        catch (AnthropicIOException ex)
        {
            logger.LogError(ex, "Couldn't reach Foundry");
            throw new ClaudeCallException(StatusCodes.Status502BadGateway, "Couldn't reach Azure AI Foundry. Check the resource name and network.");
        }

        if (message.StopReason == "refusal")
            throw new ClaudeCallException(StatusCodes.Status422UnprocessableEntity, "Claude declined to process that request.");
        if (message.StopReason == "max_tokens")
            throw new ClaudeCallException(StatusCodes.Status502BadGateway, "Claude's reply was cut off before it finished.");
        return message;
    }
}
