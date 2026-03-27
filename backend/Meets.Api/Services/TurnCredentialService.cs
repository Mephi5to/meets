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

        // TurnDomain is the TURN subdomain (e.g. turn.meets.example.com) used for
        // TURNS on port 443 via nginx SNI multiplexing. When set, the browser
        // connects to turns:turn.domain.com:443 which nginx routes to coturn
        // based on SNI — traffic is indistinguishable from HTTPS for DPI/firewalls.
        var turnDomain = _config["Turn:TurnDomain"];

        var expiry = DateTimeOffset.UtcNow.AddHours(24).ToUnixTimeSeconds();
        var username = $"{expiry}:{userId}";

        using var hmac = new HMACSHA1(Encoding.UTF8.GetBytes(turnSecret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(username));
        var credential = Convert.ToBase64String(hash);

        var urls = new List<string>();

        // 1. TURNS on port 443 via TURN subdomain (highest priority — unblockable
        //    by DPI since it looks like regular HTTPS traffic)
        if (!string.IsNullOrWhiteSpace(turnDomain))
            urls.Add($"turns:{turnDomain}:443?transport=tcp");

        // 2. TURNS on dedicated TLS port (5349 by default)
        urls.Add($"turns:{turnHost}:{tlsPort}?transport=tcp");

        // 3. TURN UDP — lowest latency when not blocked
        urls.Add($"turn:{turnHost}:{udpPort}");

        // 4. TURN TCP — last-resort fallback for restrictive firewalls
        urls.Add($"turn:{turnHost}:{udpPort}?transport=tcp");

        return new TurnCredentials(username, credential, urls.ToArray());
    }
}
