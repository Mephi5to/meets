using Meets.Api.Hubs;
using Meets.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// ─── Services ────────────────────────────────────────────────────────────────

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Singleton so room state persists across requests
builder.Services.AddSingleton<IRoomService, RoomService>();
builder.Services.AddSingleton<ITurnCredentialService, TurnCredentialService>();

// SignalR with WebSocket transport preferred (less likely to be throttled)
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = builder.Environment.IsDevelopment();
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(60);
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
    options.HandshakeTimeout = TimeSpan.FromSeconds(15);
    options.MaximumReceiveMessageSize = 64 * 1024; // 64 KB max for SDP messages
})
.AddJsonProtocol();

// CORS — allow frontend origin
var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? ["http://localhost:3000", "http://localhost:5173"];

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials(); // Required for SignalR
    });
});

// ─── App pipeline ─────────────────────────────────────────────────────────────

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("FrontendPolicy");

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTime.UtcNow }));

app.MapControllers();

// Map the SignalR hub at /hub/signaling
// WebSocket transport is attempted first by SignalR; falls back to SSE/LongPolling
app.MapHub<SignalingHub>("/hub/signaling", options =>
{
    // Allow negotiation to pick best transport
    options.Transports =
        Microsoft.AspNetCore.Http.Connections.HttpTransportType.WebSockets |
        Microsoft.AspNetCore.Http.Connections.HttpTransportType.ServerSentEvents |
        Microsoft.AspNetCore.Http.Connections.HttpTransportType.LongPolling;
});

app.Run();
