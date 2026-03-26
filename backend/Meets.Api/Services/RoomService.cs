using Meets.Api.Models;
using Microsoft.Extensions.Caching.Memory;

namespace Meets.Api.Services;

public interface IRoomService
{
    Room GetOrCreate(string roomId);
    Room? Get(string roomId);
    string? GetRoomIdByConnectionId(string connectionId);
    Participant AddParticipant(string roomId, string connectionId, string displayName);
    Participant? RemoveParticipant(string connectionId);
    IReadOnlyList<Room> GetAllRooms();
}

public class RoomService : IRoomService
{
    // Using concurrent dictionary for thread-safe room management
    private readonly Dictionary<string, Room> _rooms = new();
    // Map connectionId -> roomId for quick lookup on disconnect
    private readonly Dictionary<string, string> _connectionToRoom = new();
    private readonly object _lock = new();

    public Room GetOrCreate(string roomId)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(roomId, out var room))
            {
                room = new Room
                {
                    Id = roomId,
                    Name = roomId,
                    CreatedAt = DateTime.UtcNow
                };
                _rooms[roomId] = room;
            }
            return room;
        }
    }

    public Room? Get(string roomId)
    {
        lock (_lock)
        {
            _rooms.TryGetValue(roomId, out var room);
            return room;
        }
    }

    public string? GetRoomIdByConnectionId(string connectionId)
    {
        lock (_lock)
        {
            _connectionToRoom.TryGetValue(connectionId, out var roomId);
            return roomId;
        }
    }

    public Participant AddParticipant(string roomId, string connectionId, string displayName)
    {
        lock (_lock)
        {
            var room = GetOrCreate(roomId);
            var existing = room.Participants.FirstOrDefault(p => p.ConnectionId == connectionId);
            if (existing != null) return existing;

            var participant = new Participant
            {
                ConnectionId = connectionId,
                DisplayName = displayName,
                RoomId = roomId,
                JoinedAt = DateTime.UtcNow
            };
            room.Participants.Add(participant);
            _connectionToRoom[connectionId] = roomId;
            return participant;
        }
    }

    public Participant? RemoveParticipant(string connectionId)
    {
        lock (_lock)
        {
            if (!_connectionToRoom.TryGetValue(connectionId, out var roomId))
                return null;

            _connectionToRoom.Remove(connectionId);

            if (!_rooms.TryGetValue(roomId, out var room))
                return null;

            var participant = room.Participants.FirstOrDefault(p => p.ConnectionId == connectionId);
            if (participant != null)
            {
                room.Participants.Remove(participant);
                // Clean up empty rooms
                if (room.Participants.Count == 0)
                    _rooms.Remove(roomId);
            }
            return participant;
        }
    }

    public IReadOnlyList<Room> GetAllRooms()
    {
        lock (_lock)
        {
            return _rooms.Values.ToList();
        }
    }
}
