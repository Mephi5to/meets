using Meets.Api.Models;
using Meets.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Meets.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RoomsController : ControllerBase
{
    private readonly IRoomService _roomService;

    public RoomsController(IRoomService roomService)
    {
        _roomService = roomService;
    }

    /// <summary>
    /// Check if a room exists and get its participant count.
    /// Used by the frontend before joining.
    /// </summary>
    [HttpGet("{roomId}")]
    public ActionResult<RoomDto> GetRoom(string roomId)
    {
        var room = _roomService.Get(roomId);
        if (room == null)
        {
            // Return an empty shell — rooms are created on first join
            return Ok(new RoomDto
            {
                Id = roomId,
                Name = roomId,
                ParticipantCount = 0,
                Participants = []
            });
        }

        return Ok(new RoomDto
        {
            Id = room.Id,
            Name = room.Name,
            ParticipantCount = room.Participants.Count,
            Participants = room.Participants.Select(p => new ParticipantDto
            {
                ConnectionId = p.ConnectionId,
                DisplayName = p.DisplayName,
                JoinedAt = p.JoinedAt
            }).ToList()
        });
    }

    /// <summary>
    /// Generate a random room ID and return it.
    /// </summary>
    [HttpPost("create")]
    public ActionResult<RoomDto> CreateRoom()
    {
        // 8-char alphanumeric ID, easy to share
        var roomId = GenerateRoomId();
        return Ok(new RoomDto { Id = roomId, Name = roomId, ParticipantCount = 0, Participants = [] });
    }

    private static string GenerateRoomId()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var random = new Random();
        return new string(Enumerable.Range(0, 8).Select(_ => chars[random.Next(chars.Length)]).ToArray());
    }
}
