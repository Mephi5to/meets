import { useCallback, useEffect, useRef, useState } from 'react'
import { useDiagnostics } from '../hooks/useDiagnostics'
import type { SignalingControls } from '../hooks/useSignaling'
import { useSignaling } from '../hooks/useSignaling'
import { useWebRTC } from '../hooks/useWebRTC'
import type {
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  TurnCredentials,
} from '../types'
import { Controls } from './Controls'
import { DiagnosticsOverlay } from './DiagnosticsOverlay'
import { VideoGrid } from './VideoGrid'

interface ConferenceRoomProps {
  roomId: string
  displayName: string
  onLeave: () => void
}

export function ConferenceRoom({ roomId, displayName, onLeave }: ConferenceRoomProps) {
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joining, setJoining] = useState(true)

  // Cached TURN credentials — reuse until they expire (~24h)
  const turnCredsRef = useRef<TurnCredentials | null>(null)

  const webrtc = useWebRTC()
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())

  // Sync peer connections map so diagnostics can read it
  useEffect(() => {
    webrtc.remotePeers.forEach((peer, id) => {
      peerConnectionsRef.current.set(id, peer.pc)
    })
    for (const id of peerConnectionsRef.current.keys()) {
      if (!webrtc.remotePeers.has(id)) {
        peerConnectionsRef.current.delete(id)
      }
    }
  })

  const getPeerConnections = useCallback(() => peerConnectionsRef.current, [])
  const { aggregated: diagStats } = useDiagnostics(getPeerConnections)

  // ─── Signaling callbacks ─────────────────────────────────────────────────
  //
  // signalingRef is initialized with null and updated AFTER signaling is
  // created below. Callbacks only run in response to SignalR events, which
  // fire after the first render is fully committed, so signalingRef.current
  // is always populated by the time any callback executes.

  const signalingRef = useRef<SignalingControls | null>(null)

  const onParticipantJoined = useCallback(
    async (event: ParticipantJoinedEvent) => {
      const { participant } = event
      if (!turnCredsRef.current || !signalingRef.current) return

      const sdp = await webrtc.createOffer(
        participant.connectionId,
        participant.displayName,
        turnCredsRef.current,
        (candidate) => {
          signalingRef.current?.sendIceCandidate(
            participant.connectionId,
            candidate.candidate,
            candidate.sdpMid ?? null,
            candidate.sdpMLineIndex ?? null
          )
        }
      )
      await signalingRef.current.sendOffer(participant.connectionId, sdp)
    },
    [webrtc.createOffer]
  )

  const onParticipantLeft = useCallback(
    (event: ParticipantLeftEvent) => {
      webrtc.removePeer(event.connectionId)
    },
    [webrtc.removePeer]
  )

  const onReceiveOffer = useCallback(
    async (fromConnectionId: string, offerSdp: string) => {
      if (!turnCredsRef.current || !signalingRef.current) return

      const answerSdp = await webrtc.handleOffer(
        fromConnectionId,
        '',
        offerSdp,
        turnCredsRef.current,
        (candidate) => {
          signalingRef.current?.sendIceCandidate(
            fromConnectionId,
            candidate.candidate,
            candidate.sdpMid ?? null,
            candidate.sdpMLineIndex ?? null
          )
        }
      )
      await signalingRef.current.sendAnswer(fromConnectionId, answerSdp)
    },
    [webrtc.handleOffer]
  )

  const onReceiveAnswer = useCallback(
    async (fromConnectionId: string, answerSdp: string) => {
      await webrtc.handleAnswer(fromConnectionId, answerSdp)
    },
    [webrtc.handleAnswer]
  )

  const onReceiveIceCandidate = useCallback(
    async (
      fromConnectionId: string,
      candidate: string,
      sdpMid: string | null,
      sdpMLineIndex: number | null
    ) => {
      await webrtc.handleIceCandidate(fromConnectionId, {
        candidate,
        sdpMid: sdpMid ?? undefined,
        sdpMLineIndex: sdpMLineIndex ?? undefined,
      })
    },
    [webrtc.handleIceCandidate]
  )

  const signaling = useSignaling({
    onParticipantJoined,
    onParticipantLeft,
    onReceiveOffer,
    onReceiveAnswer,
    onReceiveIceCandidate,
  })

  // Keep the ref in sync with the current signaling object every render
  signalingRef.current = signaling

  // ─── Join flow ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function join() {
      try {
        // 1. Start local media first so the user sees their camera immediately
        await webrtc.startLocalMedia()
        if (cancelled) return

        // 2. Connect signaling
        await signaling.connect()
        if (cancelled) return

        // 3. Fetch TURN credentials
        const creds = await signaling.getTurnCredentials()
        turnCredsRef.current = creds
        if (cancelled) return

        // 4. Join room — server returns existing participants
        const event = await signaling.joinRoom(roomId, displayName)
        if (cancelled) return

        // 5. Create offers to all existing participants
        for (const participant of event.existingParticipants) {
          if (cancelled) break
          const sdp = await webrtc.createOffer(
            participant.connectionId,
            participant.displayName,
            creds,
            (candidate) => {
              signaling.sendIceCandidate(
                participant.connectionId,
                candidate.candidate,
                candidate.sdpMid ?? null,
                candidate.sdpMLineIndex ?? null
              )
            }
          )
          await signaling.sendOffer(participant.connectionId, sdp)
        }

        if (!cancelled) setJoining(false)
      } catch (err) {
        if (!cancelled) {
          console.error('Join failed:', err)
          setJoinError(err instanceof Error ? err.message : 'Failed to join room')
          setJoining(false)
        }
      }
    }

    join()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Leave ─────────────────────────────────────────────────────────────

  const handleLeave = useCallback(async () => {
    webrtc.stopLocalMedia()
    await signaling.disconnect()
    onLeave()
  }, [webrtc, signaling, onLeave])

  // ─── Screen share support detection ────────────────────────────────────

  const screenShareSupported =
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    'getDisplayMedia' in navigator.mediaDevices

  // ─── Render ─────────────────────────────────────────────────────────────

  if (joinError) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <p className="text-red-400 font-semibold mb-2">Failed to join room</p>
          <p className="text-white/50 text-sm mb-6">{joinError}</p>
          <button
            onClick={onLeave}
            className="px-6 py-2.5 bg-surface-700 hover:bg-surface-600 text-white rounded-lg transition"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  if (joining) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60 text-sm">Connecting…</p>
        </div>
      </div>
    )
  }

  const peers = Array.from(webrtc.remotePeers.values())

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-white/60 text-sm">Room</span>
          <span className="font-mono text-white font-semibold tracking-widest text-sm">
            {roomId}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/40">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              signaling.state === 'connected' ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'
            }`}
          />
          {signaling.state === 'connected' ? 'Signaling connected' : signaling.state}
        </div>
      </div>

      {/* Video grid */}
      <div className="flex-1 overflow-hidden pb-16">
        <VideoGrid
          localStream={webrtc.localStream}
          localDisplayName={displayName}
          localAudioEnabled={webrtc.audioEnabled}
          localVideoEnabled={webrtc.videoEnabled}
          remotePeers={peers}
        />
      </div>

      {/* Controls bar */}
      <Controls
        audioEnabled={webrtc.audioEnabled}
        videoEnabled={webrtc.videoEnabled}
        screenSharing={webrtc.screenSharing}
        onToggleAudio={webrtc.toggleAudio}
        onToggleVideo={webrtc.toggleVideo}
        onToggleScreenShare={webrtc.toggleScreenShare}
        onLeave={handleLeave}
        screenShareSupported={screenShareSupported}
      />

      {/* Diagnostics overlay */}
      <DiagnosticsOverlay
        stats={diagStats}
        signalingState={signaling.state}
      />
    </div>
  )
}
