export interface ParticipantDto {
  connectionId: string
  displayName: string
  joinedAt: string
}

export interface RoomDto {
  id: string
  name: string
  participantCount: number
  participants: ParticipantDto[]
}

export interface TurnCredentials {
  username: string
  credential: string
  turnUrls: string[]
}

export interface RoomJoinedEvent {
  roomId: string
  yourConnectionId: string
  existingParticipants: ParticipantDto[]
}

export interface ParticipantJoinedEvent {
  participant: ParticipantDto
}

export interface ParticipantLeftEvent {
  connectionId: string
  displayName: string
}

// WebRTC peer state tracked locally
export interface RemotePeer {
  connectionId: string
  displayName: string
  pc: RTCPeerConnection
  stream: MediaStream | null
  audioEnabled: boolean
  videoEnabled: boolean
}

export interface ConnectionStats {
  rtt: number | null          // milliseconds
  packetLoss: number | null   // percentage 0–100
  transport: 'relay' | 'udp' | 'tcp' | 'unknown'
  candidateType: string
  bytesSent: number
  bytesReceived: number
}
