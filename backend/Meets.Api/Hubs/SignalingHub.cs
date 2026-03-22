using Meets.Api.Models;
using Meets.Api.Services;
using Microsoft.AspNetCore.SignalR;

namespace Meets.Api.Hubs;

/// <summary>
/// WebRTC signaling hub. Handles offer/answer/ICE exchange between peers.
/// All media will flow through TURN relay (iceTransportPolicy: 'relay' is
/// enforced on the client side) — no direct P2P, no IP exposure.
/// </summary>
public class SignalingHub : Hub
{
    private readonly IRoomService _roomService;
    private readonly ITurnCredentialService _turnCredentialService;
    private readonly ILogger<SignalingHub> _logger;

    public SignalingHub(
        IRoomService roomService,
        ITurnCredentialService turnCredentialService,
        ILogger<SignalingHub> logger)
    {
        _roomService = roomService;
        _turnCredentialService = turnCredentialService;
        _logger = logger;
    }

    // ─── Room management ────────────────────────────────────────────────────

    /// <summary>
    /// Called by a client to join a room.
    /// Returns the current participant list and TURN credentials.
    /// Also notifies existing participants so they can initiate offers.
    /// </summary>
    public async Task<RoomJoinedEvent> JoinRoom(string roomId, string displayName)
    {
        if (string.IsNullOrWhiteSpace(roomId) || roomId.Length > 64)
            throw new HubException("Invalid room ID.");
        if (string.IsNullOrWhiteSpace(displayName) || displayName.Length > 50)
            throw new HubException("Invalid display name.");

        var connectionId = Context.ConnectionId;
        _logger.LogInformation("JoinRoom: {ConnectionId} joining {RoomId} as {DisplayName}", connectionId, roomId, displayName);

        // Add to room state
        _roomService.AddParticipant(roomId, connectionId, displayName);

        // Get existing participants BEFORE adding ourselves to the group
        // (so we get a snapshot to send back, and they don't include ourselves)
        var room = _roomService.Get(roomId)!;
        var existingParticipants = room.Participants
            .Where(p => p.ConnectionId != connectionId)
            .Select(p => new ParticipantDto
            {
                ConnectionId = p.ConnectionId,
                DisplayName = p.DisplayName,
                JoinedAt = p.JoinedAt
            })
            .ToList();

        // Join the SignalR group for this room
        await Groups.AddToGroupAsync(connectionId, roomId);

        // Notify other participants that a new peer has joined
        // They will initiate offers TO this new participant
        var joinedEvent = new ParticipantJoinedEvent(new ParticipantDto
        {
            ConnectionId = connectionId,
            DisplayName = displayName,
            JoinedAt = DateTime.UtcNow
        });
        await Clients.OthersInGroup(roomId).SendAsync("ParticipantJoined", joinedEvent);

        // Return room state + TURN credentials to the joining client
        var turnCreds = _turnCredentialService.GenerateCredentials(connectionId);

        return new RoomJoinedEvent(
            RoomId: roomId,
            YourConnectionId: connectionId,
            ExistingParticipants: existingParticipants
        );
    }

    /// <summary>
    /// Returns fresh TURN credentials (call before creating a peer connection).
    /// </summary>
    public TurnCredentials GetTurnCredentials()
    {
        return _turnCredentialService.GenerateCredentials(Context.ConnectionId);
    }

    // ─── WebRTC signaling ───────────────────────────────────────────────────

    /// <summary>
    /// Forward an SDP offer to a specific peer.
    /// Called by the existing participants when a new peer joins.
    /// </summary>
    public async Task SendOffer(string targetConnectionId, string sdp)
    {
        _logger.LogDebug("Offer from {From} to {To}", Context.ConnectionId, targetConnectionId);
        await Clients.Client(targetConnectionId).SendAsync("ReceiveOffer", Context.ConnectionId, sdp);
    }

    /// <summary>
    /// Forward an SDP answer back to the peer who sent us an offer.
    /// </summary>
    public async Task SendAnswer(string targetConnectionId, string sdp)
    {
        _logger.LogDebug("Answer from {From} to {To}", Context.ConnectionId, targetConnectionId);
        await Clients.Client(targetConnectionId).SendAsync("ReceiveAnswer", Context.ConnectionId, sdp);
    }

    /// <summary>
    /// Forward an ICE candidate to a specific peer.
    /// The client enforces iceTransportPolicy:'relay' so only TURN relay
    /// candidates will be gathered and forwarded.
    /// </summary>
    public async Task SendIceCandidate(string targetConnectionId, string candidate, string? sdpMid, int? sdpMLineIndex)
    {
        await Clients.Client(targetConnectionId).SendAsync(
            "ReceiveIceCandidate",
            Context.ConnectionId,
            candidate,
            sdpMid,
            sdpMLineIndex);
    }

    // ─── Disconnect handling ─────────────────────────────────────────────────

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var connectionId = Context.ConnectionId;
        _logger.LogInformation("Disconnected: {ConnectionId}", connectionId);

        var participant = _roomService.RemoveParticipant(connectionId);
        if (participant != null)
        {
            var leftEvent = new ParticipantLeftEvent(connectionId, participant.DisplayName);
            await Clients.Group(participant.RoomId).SendAsync("ParticipantLeft", leftEvent);
        }

        await base.OnDisconnectedAsync(exception);
    }
}
