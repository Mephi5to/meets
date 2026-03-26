using System.Net;
using System.Net.Http.Json;
using Meets.Api.Models;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Meets.Api.Tests;

public class IntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public IntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Turn:Host"] = "turn.test.local",
                    ["Turn:Secret"] = "integration_test_secret_32_chars_",
                    ["Turn:TlsPort"] = "5349",
                    ["Turn:UdpPort"] = "3478",
                    ["Cors:AllowedOrigins:0"] = "http://localhost:5173"
                });
            });
        });
    }

    [Fact]
    public async Task HealthEndpoint_ReturnsOkWithStatus()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.NotNull(body);
        Assert.Equal("ok", body.Status);
    }

    [Fact]
    public async Task CreateRoom_ViaHttp_Returns200()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsync("/api/rooms/create", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var dto = await response.Content.ReadFromJsonAsync<RoomDto>();
        Assert.NotNull(dto);
        Assert.Equal(8, dto.Id.Length);
        Assert.Equal(0, dto.ParticipantCount);
    }

    [Fact]
    public async Task GetRoom_ViaHttp_NonExistent_Returns200WithEmptyShell()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/rooms/NONEXIST");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var dto = await response.Content.ReadFromJsonAsync<RoomDto>();
        Assert.NotNull(dto);
        Assert.Equal("NONEXIST", dto.Id);
        Assert.Equal(0, dto.ParticipantCount);
        Assert.Empty(dto.Participants);
    }

    [Fact]
    public async Task SignalRHub_Negotiation_Returns200()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsync("/hub/signaling/negotiate?negotiateVersion=1", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("connectionId", body);
    }

    [Fact]
    public async Task Cors_AllowedOrigin_IncludesHeaders()
    {
        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/rooms/create");
        request.Headers.Add("Origin", "http://localhost:5173");
        request.Headers.Add("Access-Control-Request-Method", "POST");

        var response = await client.SendAsync(request);

        Assert.True(
            response.Headers.Contains("Access-Control-Allow-Origin"),
            "Expected Access-Control-Allow-Origin header for allowed origin");
    }

    [Fact]
    public async Task Cors_DisallowedOrigin_NoHeaders()
    {
        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/rooms/create");
        request.Headers.Add("Origin", "http://evil.example.com");
        request.Headers.Add("Access-Control-Request-Method", "POST");

        var response = await client.SendAsync(request);

        Assert.False(
            response.Headers.Contains("Access-Control-Allow-Origin"),
            "Should not include Access-Control-Allow-Origin header for disallowed origin");
    }

    private record HealthResponse(string Status, DateTime Time);
}
