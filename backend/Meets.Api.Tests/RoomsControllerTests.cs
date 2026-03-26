using Meets.Api.Controllers;
using Meets.Api.Models;
using Meets.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace Meets.Api.Tests;

public class RoomsControllerTests
{
    private readonly Mock<IRoomService> _roomService = new();

    private RoomsController CreateController() => new(_roomService.Object);

    [Fact]
    public void GetRoom_NonExistentRoom_ReturnsEmptyShell()
    {
        _roomService.Setup(r => r.Get("UNKNOWN")).Returns((Room?)null);
        var controller = CreateController();

        var actionResult = controller.GetRoom("UNKNOWN");
        var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
        var dto = Assert.IsType<RoomDto>(okResult.Value);

        Assert.Equal("UNKNOWN", dto.Id);
        Assert.Equal("UNKNOWN", dto.Name);
        Assert.Equal(0, dto.ParticipantCount);
        Assert.Empty(dto.Participants);
    }

    [Fact]
    public void GetRoom_ExistingRoom_ReturnsMappedDto()
    {
        var joinedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var room = new Room
        {
            Id = "ROOM1",
            Name = "ROOM1",
            Participants =
            [
                new Participant { ConnectionId = "conn-1", DisplayName = "Alice", RoomId = "ROOM1", JoinedAt = joinedAt },
                new Participant { ConnectionId = "conn-2", DisplayName = "Bob", RoomId = "ROOM1", JoinedAt = joinedAt }
            ]
        };
        _roomService.Setup(r => r.Get("ROOM1")).Returns(room);
        var controller = CreateController();

        var actionResult = controller.GetRoom("ROOM1");
        var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
        var dto = Assert.IsType<RoomDto>(okResult.Value);

        Assert.Equal("ROOM1", dto.Id);
        Assert.Equal("ROOM1", dto.Name);
        Assert.Equal(2, dto.ParticipantCount);
        Assert.Equal(2, dto.Participants.Count);
        Assert.Equal("Alice", dto.Participants[0].DisplayName);
        Assert.Equal("conn-1", dto.Participants[0].ConnectionId);
        Assert.Equal(joinedAt, dto.Participants[0].JoinedAt);
        Assert.Equal("Bob", dto.Participants[1].DisplayName);
    }

    [Fact]
    public void GetRoom_ExistingRoom_ParticipantCountMatchesListCount()
    {
        var room = new Room
        {
            Id = "ROOM1",
            Name = "ROOM1",
            Participants =
            [
                new Participant { ConnectionId = "conn-1", DisplayName = "Alice", RoomId = "ROOM1" },
                new Participant { ConnectionId = "conn-2", DisplayName = "Bob", RoomId = "ROOM1" },
                new Participant { ConnectionId = "conn-3", DisplayName = "Charlie", RoomId = "ROOM1" }
            ]
        };
        _roomService.Setup(r => r.Get("ROOM1")).Returns(room);
        var controller = CreateController();

        var actionResult = controller.GetRoom("ROOM1");
        var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
        var dto = Assert.IsType<RoomDto>(okResult.Value);

        Assert.Equal(dto.Participants.Count, dto.ParticipantCount);
    }

    [Fact]
    public void CreateRoom_ReturnsOkWithRoomDto()
    {
        var controller = CreateController();

        var actionResult = controller.CreateRoom();
        var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
        var dto = Assert.IsType<RoomDto>(okResult.Value);

        Assert.NotNull(dto.Id);
        Assert.NotEmpty(dto.Id);
        Assert.Equal(dto.Id, dto.Name);
        Assert.Equal(0, dto.ParticipantCount);
        Assert.Empty(dto.Participants);
    }

    [Fact]
    public void CreateRoom_GeneratesValidRoomId()
    {
        const string allowedChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var controller = CreateController();

        for (var i = 0; i < 50; i++)
        {
            var actionResult = controller.CreateRoom();
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var dto = Assert.IsType<RoomDto>(okResult.Value);

            Assert.Equal(8, dto.Id.Length);
            Assert.All(dto.Id, ch => Assert.Contains(ch, allowedChars));
        }
    }

    [Fact]
    public void CreateRoom_MultipleCalls_GenerateDifferentIds()
    {
        var controller = CreateController();
        var ids = new HashSet<string>();

        for (var i = 0; i < 20; i++)
        {
            var actionResult = controller.CreateRoom();
            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            var dto = Assert.IsType<RoomDto>(okResult.Value);
            ids.Add(dto.Id);
        }

        Assert.True(ids.Count > 1, "Expected multiple unique IDs but all were identical");
    }
}
