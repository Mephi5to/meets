using Meets.Api.Hubs;
using Meets.Api.Models;
using Meets.Api.Services;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Moq;

namespace Meets.Api.Tests;

public class SignalingHubTests
{
    private readonly Mock<IRoomService> _roomService = new();
    private readonly Mock<ITurnCredentialService> _turnService = new();
    private readonly Mock<ILogger<SignalingHub>> _logger = new();
    private readonly Mock<IHubCallerClients> _clients = new();
    private readonly Mock<IGroupManager> _groups = new();
    private readonly Mock<HubCallerContext> _context = new();
    private readonly Mock<ISingleClientProxy> _callerProxy = new();
    private readonly Mock<ISingleClientProxy> _clientProxy = new();

    private SignalingHub CreateHub(string connectionId = "conn-1")
    {
        _context.Setup(c => c.ConnectionId).Returns(connectionId);
        _clients.Setup(c => c.Caller).Returns(_callerProxy.Object);
        _clients.Setup(c => c.Client(It.IsAny<string>())).Returns(_clientProxy.Object);

        var hub = new SignalingHub(_roomService.Object, _turnService.Object, _logger.Object)
        {
            Clients = _clients.Object,
            Groups = _groups.Object,
            Context = _context.Object,
        };
        return hub;
    }

    [Fact]
    public async Task JoinRoom_AddsParticipantAndReturnsExisting()
    {
        var hub = CreateHub("conn-new");

        var existingParticipant = new Participant
        {
            ConnectionId = "conn-old",
            DisplayName = "Alice",
            RoomId = "ROOM1",
            JoinedAt = DateTime.UtcNow
        };

        var room = new Room
        {
            Id = "ROOM1",
            Participants = [existingParticipant, new Participant { ConnectionId = "conn-new", DisplayName = "Bob", RoomId = "ROOM1" }]
        };

        _roomService.Setup(r => r.AddParticipant("ROOM1", "conn-new", "Bob"))
            .Returns(new Participant { ConnectionId = "conn-new", DisplayName = "Bob", RoomId = "ROOM1" });
        _roomService.Setup(r => r.Get("ROOM1")).Returns(room);

        _turnService.Setup(t => t.GenerateCredentials("conn-new"))
            .Returns(new TurnCredentials("user", "cred", ["turns:host:5349"]));

        var othersProxy = new Mock<IClientProxy>();
        _clients.Setup(c => c.OthersInGroup("ROOM1")).Returns(othersProxy.Object);

        var result = await hub.JoinRoom("ROOM1", "Bob");

        Assert.Equal("ROOM1", result.RoomId);
        // Should NOT include self in existingParticipants
        Assert.Single(result.ExistingParticipants);
        Assert.Equal("Alice", result.ExistingParticipants[0].DisplayName);
        Assert.Equal("conn-old", result.ExistingParticipants[0].ConnectionId);

        _roomService.Verify(r => r.AddParticipant("ROOM1", "conn-new", "Bob"), Times.Once);
        _groups.Verify(g => g.AddToGroupAsync("conn-new", "ROOM1", default), Times.Once);
    }

    [Theory]
    [InlineData("", "Bob")]
    [InlineData(null, "Bob")]
    [InlineData("  ", "Bob")]
    [InlineData("ROOM1", "")]
    [InlineData("ROOM1", null)]
    [InlineData("ROOM1", "  ")]
    public async Task JoinRoom_InvalidInput_ThrowsHubException(string? roomId, string? displayName)
    {
        var hub = CreateHub();
        await Assert.ThrowsAsync<HubException>(() => hub.JoinRoom(roomId!, displayName!));
    }

    [Fact]
    public async Task JoinRoom_TooLongRoomId_ThrowsHubException()
    {
        var hub = CreateHub();
        var longId = new string('A', 65);
        await Assert.ThrowsAsync<HubException>(() => hub.JoinRoom(longId, "Bob"));
    }

    [Fact]
    public async Task SendOffer_ForwardsToTargetClient()
    {
        var hub = CreateHub("conn-1");

        await hub.SendOffer("conn-2", "sdp-offer");

        _clients.Verify(c => c.Client("conn-2"), Times.Once);
        _clientProxy.Verify(p => p.SendCoreAsync(
            "ReceiveOffer",
            It.Is<object[]>(args => (string)args[0] == "conn-1" && (string)args[1] == "sdp-offer"),
            default), Times.Once);
    }

    [Fact]
    public async Task SendAnswer_ForwardsToTargetClient()
    {
        var hub = CreateHub("conn-1");

        await hub.SendAnswer("conn-2", "sdp-answer");

        _clientProxy.Verify(p => p.SendCoreAsync(
            "ReceiveAnswer",
            It.Is<object[]>(args => (string)args[0] == "conn-1" && (string)args[1] == "sdp-answer"),
            default), Times.Once);
    }

    [Fact]
    public async Task SendIceCandidate_ForwardsToTargetClient()
    {
        var hub = CreateHub("conn-1");

        await hub.SendIceCandidate("conn-2", "candidate-str", "audio", 0);

        _clientProxy.Verify(p => p.SendCoreAsync(
            "ReceiveIceCandidate",
            It.Is<object[]>(args =>
                (string)args[0] == "conn-1" &&
                (string)args[1] == "candidate-str" &&
                (string)args[2] == "audio" &&
                (int)args[3] == 0),
            default), Times.Once);
    }

    [Fact]
    public async Task SendMediaState_BroadcastsToOthersInRoom()
    {
        var hub = CreateHub("conn-1");
        _roomService.Setup(r => r.GetRoomIdByConnectionId("conn-1")).Returns("ROOM1");

        var othersProxy = new Mock<IClientProxy>();
        _clients.Setup(c => c.OthersInGroup("ROOM1")).Returns(othersProxy.Object);

        await hub.SendMediaState(false, true);

        othersProxy.Verify(p => p.SendCoreAsync(
            "ReceiveMediaState",
            It.Is<object[]>(args =>
                (string)args[0] == "conn-1" &&
                (bool)args[1] == false &&
                (bool)args[2] == true),
            default), Times.Once);
    }

    [Fact]
    public async Task SendMediaState_NotInRoom_DoesNothing()
    {
        var hub = CreateHub("conn-1");
        _roomService.Setup(r => r.GetRoomIdByConnectionId("conn-1")).Returns((string?)null);

        // Should not throw
        await hub.SendMediaState(false, true);

        _clients.Verify(c => c.OthersInGroup(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task OnDisconnectedAsync_RemovesParticipantAndNotifies()
    {
        var hub = CreateHub("conn-1");
        var participant = new Participant { ConnectionId = "conn-1", DisplayName = "Alice", RoomId = "ROOM1" };
        _roomService.Setup(r => r.RemoveParticipant("conn-1")).Returns(participant);

        var groupProxy = new Mock<IClientProxy>();
        _clients.Setup(c => c.Group("ROOM1")).Returns(groupProxy.Object);

        await hub.OnDisconnectedAsync(null);

        _roomService.Verify(r => r.RemoveParticipant("conn-1"), Times.Once);
        groupProxy.Verify(p => p.SendCoreAsync(
            "ParticipantLeft",
            It.Is<object[]>(args =>
                args[0] != null &&
                ((ParticipantLeftEvent)args[0]).ConnectionId == "conn-1" &&
                ((ParticipantLeftEvent)args[0]).DisplayName == "Alice"),
            default), Times.Once);
    }

    [Fact]
    public async Task OnDisconnectedAsync_UnknownConnection_DoesNotNotify()
    {
        var hub = CreateHub("conn-unknown");
        _roomService.Setup(r => r.RemoveParticipant("conn-unknown")).Returns((Participant?)null);

        await hub.OnDisconnectedAsync(null);

        _clients.Verify(c => c.Group(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public void GetTurnCredentials_ReturnsCredentials()
    {
        var hub = CreateHub("conn-1");
        var expected = new TurnCredentials("user", "cred", ["turns:host:5349"]);
        _turnService.Setup(t => t.GenerateCredentials("conn-1")).Returns(expected);

        var result = hub.GetTurnCredentials();

        Assert.Equal(expected, result);
    }

    [Fact]
    public async Task JoinRoom_BroadcastsParticipantJoinedToOthers()
    {
        var hub = CreateHub("conn-new");

        var room = new Room
        {
            Id = "ROOM1",
            Participants = [new Participant { ConnectionId = "conn-new", DisplayName = "Bob", RoomId = "ROOM1" }]
        };

        _roomService.Setup(r => r.AddParticipant("ROOM1", "conn-new", "Bob"))
            .Returns(new Participant { ConnectionId = "conn-new", DisplayName = "Bob", RoomId = "ROOM1" });
        _roomService.Setup(r => r.Get("ROOM1")).Returns(room);

        _turnService.Setup(t => t.GenerateCredentials("conn-new"))
            .Returns(new TurnCredentials("user", "cred", ["turns:host:5349"]));

        var othersProxy = new Mock<IClientProxy>();
        _clients.Setup(c => c.OthersInGroup("ROOM1")).Returns(othersProxy.Object);

        await hub.JoinRoom("ROOM1", "Bob");

        othersProxy.Verify(p => p.SendCoreAsync(
            "ParticipantJoined",
            It.Is<object[]>(args =>
                args.Length == 1 &&
                args[0] != null &&
                ((ParticipantJoinedEvent)args[0]).Participant.ConnectionId == "conn-new" &&
                ((ParticipantJoinedEvent)args[0]).Participant.DisplayName == "Bob"),
            default), Times.Once);
    }

    [Fact]
    public async Task JoinRoom_ReturnsCorrectYourConnectionId()
    {
        var hub = CreateHub("conn-new");

        var room = new Room
        {
            Id = "ROOM1",
            Participants = [new Participant { ConnectionId = "conn-new", DisplayName = "Bob", RoomId = "ROOM1" }]
        };

        _roomService.Setup(r => r.AddParticipant("ROOM1", "conn-new", "Bob"))
            .Returns(new Participant { ConnectionId = "conn-new", DisplayName = "Bob", RoomId = "ROOM1" });
        _roomService.Setup(r => r.Get("ROOM1")).Returns(room);

        _turnService.Setup(t => t.GenerateCredentials("conn-new"))
            .Returns(new TurnCredentials("user", "cred", ["turns:host:5349"]));

        var othersProxy = new Mock<IClientProxy>();
        _clients.Setup(c => c.OthersInGroup("ROOM1")).Returns(othersProxy.Object);

        var result = await hub.JoinRoom("ROOM1", "Bob");

        Assert.Equal("conn-new", result.YourConnectionId);
    }

    [Fact]
    public async Task JoinRoom_TooLongDisplayName_ThrowsHubException()
    {
        var hub = CreateHub();
        var longName = new string('A', 51);
        await Assert.ThrowsAsync<HubException>(() => hub.JoinRoom("ROOM1", longName));
    }

    [Fact]
    public async Task JoinRoom_ExactlyMaxLengthRoomId_Succeeds()
    {
        var roomId = new string('A', 64);
        var hub = CreateHub("conn-1");

        var room = new Room
        {
            Id = roomId,
            Participants = [new Participant { ConnectionId = "conn-1", DisplayName = "Alice", RoomId = roomId }]
        };

        _roomService.Setup(r => r.AddParticipant(roomId, "conn-1", "Alice"))
            .Returns(new Participant { ConnectionId = "conn-1", DisplayName = "Alice", RoomId = roomId });
        _roomService.Setup(r => r.Get(roomId)).Returns(room);
        _turnService.Setup(t => t.GenerateCredentials("conn-1"))
            .Returns(new TurnCredentials("user", "cred", ["turns:host:5349"]));

        var othersProxy = new Mock<IClientProxy>();
        _clients.Setup(c => c.OthersInGroup(roomId)).Returns(othersProxy.Object);

        var result = await hub.JoinRoom(roomId, "Alice");

        Assert.Equal(roomId, result.RoomId);
    }

    [Fact]
    public async Task JoinRoom_ExactlyMaxLengthDisplayName_Succeeds()
    {
        var displayName = new string('A', 50);
        var hub = CreateHub("conn-1");

        var room = new Room
        {
            Id = "ROOM1",
            Participants = [new Participant { ConnectionId = "conn-1", DisplayName = displayName, RoomId = "ROOM1" }]
        };

        _roomService.Setup(r => r.AddParticipant("ROOM1", "conn-1", displayName))
            .Returns(new Participant { ConnectionId = "conn-1", DisplayName = displayName, RoomId = "ROOM1" });
        _roomService.Setup(r => r.Get("ROOM1")).Returns(room);
        _turnService.Setup(t => t.GenerateCredentials("conn-1"))
            .Returns(new TurnCredentials("user", "cred", ["turns:host:5349"]));

        var othersProxy = new Mock<IClientProxy>();
        _clients.Setup(c => c.OthersInGroup("ROOM1")).Returns(othersProxy.Object);

        var result = await hub.JoinRoom("ROOM1", displayName);

        Assert.Equal("ROOM1", result.RoomId);
    }

    [Fact]
    public async Task SendIceCandidate_NullOptionalFields_ForwardsCorrectly()
    {
        var hub = CreateHub("conn-1");

        await hub.SendIceCandidate("conn-2", "candidate-str", null, null);

        _clientProxy.Verify(p => p.SendCoreAsync(
            "ReceiveIceCandidate",
            It.Is<object[]>(args =>
                (string)args[0] == "conn-1" &&
                (string)args[1] == "candidate-str" &&
                args[2] == null &&
                args[3] == null),
            default), Times.Once);
    }
}
