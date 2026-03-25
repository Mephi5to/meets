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

        // Priority order: TLS first (works through mobile networks, port 5349),
        // then plain UDP (lowest latency), then plain TCP fallback.
        var urls = new[]
        {
            $"turns:{turnHost}:{tlsPort}?transport=tcp",    // TURNS/TLS — mobile-friendly, rarely blocked
            $"turn:{turnHost}:{udpPort}",                   // TURN UDP — lowest latency
            $"turn:{turnHost}:{udpPort}?transport=tcp",     // TURN TCP — firewall fallback
        };

        return new TurnCredentials(username, credential, urls);
    }
}
