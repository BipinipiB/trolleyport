// Step 0 smoke test: send one trivial prompt to Claude through an Azure AI Foundry
// resource and print the reply. Configuration comes from environment variables:
//   ANTHROPIC_FOUNDRY_RESOURCE    resource name (the <name> in https://<name>.services.ai.azure.com)
//   ANTHROPIC_FOUNDRY_API_KEY     key from the Foundry portal
//   ANTHROPIC_FOUNDRY_DEPLOYMENT  deployment name (optional, defaults to claude-opus-5-5)
using Anthropic.Exceptions;
using Anthropic.Foundry;
using Anthropic.Models.Messages;

string? resource = Environment.GetEnvironmentVariable("ANTHROPIC_FOUNDRY_RESOURCE");
string? apiKey = Environment.GetEnvironmentVariable("ANTHROPIC_FOUNDRY_API_KEY");
string deployment = Environment.GetEnvironmentVariable("ANTHROPIC_FOUNDRY_DEPLOYMENT") ?? "claude-opus-5-5";

if (string.IsNullOrWhiteSpace(resource) || string.IsNullOrWhiteSpace(apiKey))
{
    Console.Error.WriteLine("Set ANTHROPIC_FOUNDRY_RESOURCE and ANTHROPIC_FOUNDRY_API_KEY first.");
    return 1;
}

// Accept a pasted endpoint URL too: keep only the subdomain before ".services.ai.azure.com".
if (resource.Contains("://") || resource.Contains('.'))
{
    string host = resource.Contains("://") ? new Uri(resource).Host : resource.Split('/')[0];
    resource = host.Split('.')[0];
}

var client = new AnthropicFoundryClient(new AnthropicFoundryApiKeyCredentials(apiKey, resource));

Console.WriteLine($"Calling https://{resource}.services.ai.azure.com/anthropic  (deployment: {deployment})");

try
{
    var message = await client.Messages.Create(new MessageCreateParams
    {
        Model = deployment, // on Foundry this is your deployment name
        MaxTokens = 1024,
        // Trivial prompt, keep it cheap. Haiku 4.5 rejects the effort setting, so skip it there.
        OutputConfig = deployment.Contains("haiku") ? null : new OutputConfig { Effort = Effort.Low },
        Messages = [new() { Role = Role.User, Content = "Say hello to Trolleyport in one short sentence." }],
    });

    foreach (var block in message.Content)
    {
        if (block.TryPickText(out TextBlock? text))
            Console.WriteLine($"\nClaude: {text.Text}");
    }
    Console.WriteLine($"\nstop_reason={message.StopReason}  input_tokens={message.Usage.InputTokens}  output_tokens={message.Usage.OutputTokens}");
    return 0;
}
catch (AnthropicApiException ex)
{
    Console.Error.WriteLine($"API error: {ex.Message}");
    return 2;
}
catch (AnthropicIOException ex)
{
    Console.Error.WriteLine($"Connection error (check the resource name): {ex.InnerException?.Message ?? ex.Message}");
    return 3;
}
