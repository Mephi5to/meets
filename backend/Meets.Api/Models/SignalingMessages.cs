namespace Meets.Api.Models;

public record JoinRoomRequest(string RoomId, string DisplayName);

public record SdpMessage(string TargetConnectionId, string Sdp, string Type);

public record IceCandidateMessage(
    string TargetConnectionId,
    string Candidate,
    string? SdpMid,
    int? SdpMLineIndex
);

public record TurnCredentials(
    string Username,
    string Credential,
    string[] TurnUrls
);

public record RoomJoinedEvent(
    string RoomId,
    string YourConnectionId,
    List<ParticipantDto> ExistingParticipants
);

public record ParticipantJoinedEvent(ParticipantDto Participant);

public record ParticipantLeftEvent(string ConnectionId, string DisplayName);
