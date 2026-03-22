using System.Security.Cryptography;
using System.Text;
using Meets.Api.Models;

namespace Meets.Api.Services;

public interface ITurnCredentialService
{
    TurnCredentials GenerateCredentials(string userId);
}

public class TurnCredentialService : ITurnCredentialService
{
    private readonly IConfiguration _config;

    public TurnCredentialService(IConfiguration config)
    {
        _config = config;
    }

    /// <summary>
    /// Generates time-limited TURN credentials using the HMAC-SHA1 mechanism
    /// compatible with Coturn's use-auth-secret mode.
    /// username = "{unixTimestamp}:{userId}"
    /// credential = Base64(HMAC-SHA1(secret, username))
    /// </summary>
    public TurnCredentials GenerateCredentials(string userId)
    {
        var turnHost = _config["Turn:Host"] ?? throw new InvalidOperationException("Turn:Host not configured");
        var turnSecret = _config["Turn:Secret"] ?? throw new InvalidOperationException("Turn:Secret not configured");
        var tlsPort = _config.GetValue<int>("Turn:TlsPort", 443);
        var udpPort = _config.GetValue<int>("Turn:UdpPort", 3478);

        // Credentials valid for 24 hours
        var expiry = DateTimeOffset.UtcNow.AddHours(24).ToUnixTimeSeconds();
        var username = $"{expiry}:{userId}";

        using var hmac = new HMACSHA1(Encoding.UTF8.GetBytes(turnSecret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(username));
        var credential = Convert.ToBase64String(hash);

        // Order matters: TLS/TCP on 443 first (most likely to work through restrictive firewalls)
        var urls = new[]
        {
            $"turns:{turnHost}:{tlsPort}?transport=tcp",   // TURNS over TLS/TCP port 443 - looks like HTTPS
            $"turn:{turnHost}:{udpPort}?transport=tcp",     // TURN over TCP (fallback if UDP blocked)
            $"turn:{turnHost}:{udpPort}",                   // TURN over UDP (best performance when available)
        };

        return new TurnCredentials(username, credential, urls);
    }
}
