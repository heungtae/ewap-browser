using System.Buffers.Binary;
using System.Text.Json;

const int MaxFrameBytes = 512 * 1024;
var seenRequestIds = new HashSet<string>(StringComparer.Ordinal);
var allowedKinds = new HashSet<string>(StringComparer.Ordinal)
{
    "ASK_INTERPRETATION",
    "ACTION_PROPOSAL",
    "BIND_SESSION",
    "ISSUE_CONFIRMATION",
    "VERIFY_CONFIRMATION",
    "PROFILE_REPLAY_CAS",
    "CANCEL_REQUEST"
};
var allowedProperties = new HashSet<string>(StringComparer.Ordinal)
{
    "schema_version",
    "request_id",
    "kind",
    "deployment_id",
    "run_id",
    "allowed_tools",
    "snapshot",
    "cancel_after_ms"
};
var input = Console.OpenStandardInput();
var output = Console.OpenStandardOutput();

while (true)
{
    var prefix = new byte[4];
    if (!await TryReadExactlyAsync(input, prefix)) break;
    var length = BinaryPrimitives.ReadInt32LittleEndian(prefix);
    if (length <= 0 || length > MaxFrameBytes) break;

    var payload = new byte[length];
    if (!await TryReadExactlyAsync(input, payload)) break;

    JsonDocument request;
    try
    {
        request = JsonDocument.Parse(payload);
    }
    catch (JsonException)
    {
        break;
    }

    using (request)
    {
        if (request.RootElement.ValueKind != JsonValueKind.Object ||
            request.RootElement.EnumerateObject().Any(property => !allowedProperties.Contains(property.Name)) ||
            !request.RootElement.TryGetProperty("request_id", out var requestIdElement) ||
            requestIdElement.ValueKind != JsonValueKind.String ||
            !request.RootElement.TryGetProperty("kind", out var kindElement) ||
            kindElement.ValueKind != JsonValueKind.String)
        {
            break;
        }

        var requestId = requestIdElement.GetString();
        var kind = kindElement.GetString();
        if (requestId is null || !IsOpaqueId(requestId) || kind is null || !allowedKinds.Contains(kind) || !seenRequestIds.Add(requestId))
        {
            break;
        }
        if (request.RootElement.TryGetProperty("schema_version", out var schemaVersion) &&
            (!schemaVersion.TryGetInt32(out var version) || version != 1)) break;

        // Administrative ACL configuration is intentionally absent in this development artifact.
        // Do not open network, bridge, SSO, or any fallback path without validated configuration.
        await WriteFrameAsync(output, new
        {
            request_id = requestId,
            kind,
            error_code = "AI_HUB_NOT_CONFIGURED"
        });
    }
}

static bool IsOpaqueId(string? value)
{
    return value is { Length: >= 16 and <= 128 } && value.All(character =>
        char.IsAsciiLetterOrDigit(character) || character is '_' or '-');
}

static async Task<bool> TryReadExactlyAsync(Stream input, byte[] buffer)
{
    var offset = 0;
    while (offset < buffer.Length)
    {
        var read = await input.ReadAsync(buffer.AsMemory(offset));
        if (read == 0) return offset == 0;
        offset += read;
    }
    return true;
}

static async Task WriteFrameAsync(Stream output, object response)
{
    var payload = JsonSerializer.SerializeToUtf8Bytes(response);
    var prefix = new byte[4];
    BinaryPrimitives.WriteInt32LittleEndian(prefix, payload.Length);
    await output.WriteAsync(prefix);
    await output.WriteAsync(payload);
    await output.FlushAsync();
}
