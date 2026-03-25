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
import { resumeAudioContext } from '../utils/audioContext'
import { Controls } from './Controls'
import { DiagnosticsOverlay } from './DiagnosticsOverlay'
import { VideoGrid } from './VideoGrid'

interface ConferenceRoomProps {
  roomId: string
  displayName: string
  initialStream?: MediaStream | null
  onLeave: () => void
}

export function ConferenceRoom({ roomId, displayName, initialStream, onLeave }: ConferenceRoomProps) {
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

  // Store participant names so onReceiveOffer can use the correct display name
  const pendingNamesRef = useRef<Map<string, string>>(new Map())

  // When SignalR auto-reconnects (e.g. mobile network switch), the backend
  // has already removed us from the room (OnDisconnectedAsync fired). We must
  // rejoin the room and re-create offers to all currently present participants.
  const onReconnected = useCallback(async () => {
    if (!signalingRef.current) return
    webrtc.removeAllPeers()
    pendingNamesRef.current.clear()
    try {
      const creds = await signalingRef.current.getTurnCredentials()
      turnCredsRef.current = creds
      const event = await signalingRef.current.joinRoom(roomId, displayName)
      for (const participant of event.existingParticipants) {
        const sdp = await webrtc.createOffer(
          participant.connectionId,
          participant.displayName,
          creds,
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
      }
    } catch (err) {
      console.error('[ConferenceRoom] Rejoin after reconnect failed:', err)
    }
  }, [webrtc.removeAllPeers, webrtc.createOffer, roomId, displayName])

  // When a new participant joins, the SERVER already notified the joiner to
  // send us an offer (via their existingParticipants list). We must NOT
  // create an offer here — that causes "glare": both sides become offerers,
  // the second createPeerConnection overwrites the first in peerConnectionsRef,
  // and handleAnswer fails with "wrong state: stable".
  // Just cache the display name so onReceiveOffer can label them correctly.
  const onParticipantJoined = useCallback(
    (event: ParticipantJoinedEvent) => {
      pendingNamesRef.current.set(
        event.participant.connectionId,
        event.participant.displayName
      )
    },
    []
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

      const displayName = pendingNamesRef.current.get(fromConnectionId) ?? ''
      pendingNamesRef.current.delete(fromConnectionId)

      const answerSdp = await webrtc.handleOffer(
        fromConnectionId,
        displayName,
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
    onReconnected,
  })

  // Keep the ref in sync with the current signaling object every render
  signalingRef.current = signaling

  // ─── Join flow ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function join() {
      try {
        // 0. Unlock the shared AudioContext while we still have user-gesture
        //    credit from the "Join Room" click.  Remote audio is routed through
        //    this context (Web Audio API), so it must be in "running" state
        //    before any remote tracks arrive.
        resumeAudioContext()

        // 1. Use the stream acquired during the user gesture (click handler in
        //    JoinRoom) so Firefox doesn't reject getUserMedia as "not allowed".
        //    Fall back to startLocalMedia only if no stream was provided.
        if (initialStream) {
          webrtc.adoptStream(initialStream)
        } else {
          await webrtc.startLocalMedia()
        }
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
    // resumeAudioContext on any click is a belt-and-suspenders fallback in
    // case the context was created in suspended state on the first render.
    <div className="h-screen bg-surface-900 flex flex-col overflow-hidden" onClick={resumeAudioContext}>
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
      <div className="flex-1 min-h-0 overflow-hidden pb-16">
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
        roomId={roomId}
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
