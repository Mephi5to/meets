using Meets.Api.Services;

namespace Meets.Api.Tests;

public class RoomServiceTests
{
    private readonly RoomService _sut = new();

    [Fact]
    public void GetOrCreate_NewRoom_CreatesAndReturns()
    {
        var room = _sut.GetOrCreate("ROOM1");

        Assert.NotNull(room);
        Assert.Equal("ROOM1", room.Id);
        Assert.Empty(room.Participants);
    }

    [Fact]
    public void GetOrCreate_SameId_ReturnsSameRoom()
    {
        var room1 = _sut.GetOrCreate("ROOM1");
        var room2 = _sut.GetOrCreate("ROOM1");

        Assert.Same(room1, room2);
    }

    [Fact]
    public void Get_NonExistentRoom_ReturnsNull()
    {
        Assert.Null(_sut.Get("NOPE"));
    }

    [Fact]
    public void AddParticipant_AddsToRoom()
    {
        _sut.AddParticipant("ROOM1", "conn-1", "Alice");

        var room = _sut.Get("ROOM1");
        Assert.NotNull(room);
        Assert.Single(room.Participants);
        Assert.Equal("Alice", room.Participants[0].DisplayName);
        Assert.Equal("conn-1", room.Participants[0].ConnectionId);
        Assert.Equal("ROOM1", room.Participants[0].RoomId);
    }

    [Fact]
    public void AddParticipant_SameConnectionTwice_NoDuplicate()
    {
        _sut.AddParticipant("ROOM1", "conn-1", "Alice");
        _sut.AddParticipant("ROOM1", "conn-1", "Alice2");

        var room = _sut.Get("ROOM1")!;
        Assert.Single(room.Participants);
        // First registration wins
        Assert.Equal("Alice", room.Participants[0].DisplayName);
    }

    [Fact]
    public void AddParticipant_MultipleParticipants()
    {
        _sut.AddParticipant("ROOM1", "conn-1", "Alice");
        _sut.AddParticipant("ROOM1", "conn-2", "Bob");

        var room = _sut.Get("ROOM1")!;
        Assert.Equal(2, room.Participants.Count);
    }

    [Fact]
    public void RemoveParticipant_ReturnsParticipantAndRemoves()
    {
        _sut.AddParticipant("ROOM1", "conn-1", "Alice");
        _sut.AddParticipant("ROOM1", "conn-2", "Bob");

        var removed = _sut.RemoveParticipant("conn-1");

        Assert.NotNull(removed);
        Assert.Equal("Alice", removed.DisplayName);

        var room = _sut.Get("ROOM1")!;
        Assert.Single(room.Participants);
        Assert.Equal("Bob", room.Participants[0].DisplayName);
    }

    [Fact]
    public void RemoveParticipant_LastInRoom_CleansUpRoom()
    {
        _sut.AddParticipant("ROOM1", "conn-1", "Alice");

        _sut.RemoveParticipant("conn-1");

        Assert.Null(_sut.Get("ROOM1"));
    }

    [Fact]
    public void RemoveParticipant_UnknownConnection_ReturnsNull()
    {
        Assert.Null(_sut.RemoveParticipant("unknown"));
    }

    [Fact]
    public void GetRoomIdByConnectionId_KnownConnection()
    {
        _sut.AddParticipant("ROOM1", "conn-1", "Alice");

        Assert.Equal("ROOM1", _sut.GetRoomIdByConnectionId("conn-1"));
    }

    [Fact]
    public void GetRoomIdByConnectionId_UnknownConnection_ReturnsNull()
    {
        Assert.Null(_sut.GetRoomIdByConnectionId("unknown"));
    }

    [Fact]
    public void GetRoomIdByConnectionId_AfterRemove_ReturnsNull()
    {
        _sut.AddParticipant("ROOM1", "conn-1", "Alice");
        _sut.RemoveParticipant("conn-1");

        Assert.Null(_sut.GetRoomIdByConnectionId("conn-1"));
    }

    [Fact]
    public void GetAllRooms_ReturnsAllActiveRooms()
    {
        _sut.AddParticipant("ROOM1", "conn-1", "Alice");
        _sut.AddParticipant("ROOM2", "conn-2", "Bob");

        var rooms = _sut.GetAllRooms();
        Assert.Equal(2, rooms.Count);
    }

    [Fact]
    public void ThreadSafety_ConcurrentAddRemove()
    {
        // Add 100 participants concurrently, then remove them
        var tasks = Enumerable.Range(0, 100).Select(i =>
            Task.Run(() => _sut.AddParticipant("ROOM1", $"conn-{i}", $"User{i}"))
        ).ToArray();

        Task.WaitAll(tasks);

        var room = _sut.Get("ROOM1")!;
        Assert.Equal(100, room.Participants.Count);

        // Remove all concurrently
        var removeTasks = Enumerable.Range(0, 100).Select(i =>
            Task.Run(() => _sut.RemoveParticipant($"conn-{i}"))
        ).ToArray();

        Task.WaitAll(removeTasks);

        Assert.Null(_sut.Get("ROOM1"));
    }
}
