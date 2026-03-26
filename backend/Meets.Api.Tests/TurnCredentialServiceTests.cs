using System.Security.Cryptography;
using System.Text;
using Meets.Api.Services;
using Microsoft.Extensions.Configuration;

namespace Meets.Api.Tests;

public class TurnCredentialServiceTests
{
    private static TurnCredentialService CreateService(
        string host = "turn.example.com",
        string secret = "test-secret-123",
        int tlsPort = 5349,
        int udpPort = 3478)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Turn:Host"] = host,
                ["Turn:Secret"] = secret,
                ["Turn:TlsPort"] = tlsPort.ToString(),
                ["Turn:UdpPort"] = udpPort.ToString(),
            })
            .Build();

        return new TurnCredentialService(config);
    }

    [Fact]
    public void GenerateCredentials_ReturnsValidStructure()
    {
        var sut = CreateService();
        var creds = sut.GenerateCredentials("user-1");

        Assert.NotNull(creds);
        Assert.NotEmpty(creds.Username);
        Assert.NotEmpty(creds.Credential);
        Assert.Equal(3, creds.TurnUrls.Length);
    }

    [Fact]
    public void GenerateCredentials_UsernameContainsUserIdAndTimestamp()
    {
        var sut = CreateService();
        var creds = sut.GenerateCredentials("user-42");

        // Format: "{unixTimestamp}:{userId}"
        Assert.Contains(":", creds.Username);
        var parts = creds.Username.Split(':');
        Assert.Equal(2, parts.Length);
        Assert.True(long.TryParse(parts[0], out var timestamp));
        Assert.Equal("user-42", parts[1]);

        // Timestamp should be ~24 hours from now
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var diff = timestamp - now;
        Assert.InRange(diff, 86300, 86500); // ~24h ± some tolerance
    }

    [Fact]
    public void GenerateCredentials_CredentialIsValidHmacSha1()
    {
        const string secret = "my-secret";
        var sut = CreateService(secret: secret);
        var creds = sut.GenerateCredentials("user-1");

        // Verify HMAC-SHA1 independently
        using var hmac = new HMACSHA1(Encoding.UTF8.GetBytes(secret));
        var expected = Convert.ToBase64String(
            hmac.ComputeHash(Encoding.UTF8.GetBytes(creds.Username)));

        Assert.Equal(expected, creds.Credential);
    }

    [Fact]
    public void GenerateCredentials_TurnUrlsHaveCorrectFormat()
    {
        var sut = CreateService(host: "turn.example.com", tlsPort: 5349, udpPort: 3478);
        var creds = sut.GenerateCredentials("user-1");

        Assert.Equal("turns:turn.example.com:5349?transport=tcp", creds.TurnUrls[0]);
        Assert.Equal("turn:turn.example.com:3478", creds.TurnUrls[1]);
        Assert.Equal("turn:turn.example.com:3478?transport=tcp", creds.TurnUrls[2]);
    }

    [Fact]
    public void GenerateCredentials_TurnsUrlFirst_ForMobileCompatibility()
    {
        var sut = CreateService();
        var creds = sut.GenerateCredentials("user-1");

        // TURNS/TLS must be first — it's the most reliable on mobile networks
        Assert.StartsWith("turns:", creds.TurnUrls[0]);
    }

    [Fact]
    public void GenerateCredentials_DifferentUsers_DifferentCredentials()
    {
        var sut = CreateService();
        var creds1 = sut.GenerateCredentials("user-1");
        var creds2 = sut.GenerateCredentials("user-2");

        Assert.NotEqual(creds1.Username, creds2.Username);
        Assert.NotEqual(creds1.Credential, creds2.Credential);
    }

    [Fact]
    public void GenerateCredentials_MissingHost_Throws()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Turn:Secret"] = "secret",
            })
            .Build();

        var sut = new TurnCredentialService(config);
        Assert.Throws<InvalidOperationException>(() => sut.GenerateCredentials("user"));
    }

    [Fact]
    public void GenerateCredentials_MissingSecret_Throws()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Turn:Host"] = "turn.example.com",
            })
            .Build();

        var sut = new TurnCredentialService(config);
        Assert.Throws<InvalidOperationException>(() => sut.GenerateCredentials("user"));
    }
}
