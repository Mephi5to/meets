import { useCallback, useEffect, useRef, useState } from 'react'
import type { RemotePeer, TurnCredentials } from '../types'

export interface WebRTCControls {
  localStream: MediaStream | null
  remotePeers: Map<string, RemotePeer>
  audioEnabled: boolean
  videoEnabled: boolean
  screenSharing: boolean
  toggleAudio: () => void
  toggleVideo: () => void
  toggleScreenShare: () => Promise<void>
  startLocalMedia: () => Promise<MediaStream>
  stopLocalMedia: () => void
  createOffer: (
    peerId: string,
    peerName: string,
    turnCredentials: TurnCredentials,
    onIceCandidate: (candidate: RTCIceCandidate) => void
  ) => Promise<string>
  handleOffer: (
    peerId: string,
    peerName: string,
    offerSdp: string,
    turnCredentials: TurnCredentials,
    onIceCandidate: (candidate: RTCIceCandidate) => void
  ) => Promise<string>
  handleAnswer: (peerId: string, answerSdp: string) => Promise<void>
  handleIceCandidate: (peerId: string, candidate: RTCIceCandidateInit) => Promise<void>
  removePeer: (peerId: string) => void
}

// In production set VITE_FORCE_RELAY=true so ALL traffic goes through TURN
// (hides IPs, bypasses firewalls). In local dev leave it unset or 'false' so
// that same-machine tests work without a running Coturn instance.
const FORCE_RELAY = import.meta.env.VITE_FORCE_RELAY === 'true'

function buildIceConfig(creds: TurnCredentials): RTCConfiguration {
  return {
    iceServers: [
      {
        urls: creds.turnUrls,
        username: creds.username,
        credential: creds.credential,
      },
    ],
    // relay = force all media through TURN (production). all = allow direct
    // P2P via host/srflx candidates as well (needed for local dev without TURN).
    iceTransportPolicy: FORCE_RELAY ? 'relay' : 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  }
}

export function useWebRTC(): WebRTCControls {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeer>>(new Map())
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [screenSharing, setScreenSharing] = useState(false)

  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const screenStreamRef = useRef<MediaStream | null>(null)

  // Per-peer ICE candidate queue: buffers candidates that arrive before
  // setRemoteDescription() completes. Flushed in handleAnswer / handleOffer
  // after remote description is committed.
  const iceCandidateQueues = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  // Tracks which peers have their remote description set and are ready for candidates
  const remoteDescReady = useRef<Set<string>>(new Set())

  // ─── Local media ──────────────────────────────────────────────────────────

  const startLocalMedia = useCallback(async (): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: 'user',
      },
    })
    localStreamRef.current = stream
    setLocalStream(stream)
    return stream
  }, [])

  const stopLocalMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    screenStreamRef.current = null
    setLocalStream(null)
    setScreenSharing(false)
  }, [])

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled
    })
    setAudioEnabled((prev) => !prev)
  }, [])

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled
    })
    setVideoEnabled((prev) => !prev)
  }, [])

  const toggleScreenShare = useCallback(async () => {
    const pcs = peerConnectionsRef.current

    if (screenSharing) {
      // Revert to camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null

      const cameraStream = localStreamRef.current
      if (cameraStream) {
        const cameraTrack = cameraStream.getVideoTracks()[0]
        pcs.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender && cameraTrack) sender.replaceTrack(cameraTrack)
        })
      }
      setScreenSharing(false)
    } else {
      // Switch to screen
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      })
      screenStreamRef.current = screenStream
      const screenTrack = screenStream.getVideoTracks()[0]

      pcs.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) sender.replaceTrack(screenTrack)
      })

      // Auto-revert when user clicks browser's "Stop sharing"
      screenTrack.addEventListener('ended', () => {
        setScreenSharing(false)
        screenStreamRef.current = null
        const cameraStream = localStreamRef.current
        if (cameraStream) {
          const cameraTrack = cameraStream.getVideoTracks()[0]
          pcs.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
            if (sender && cameraTrack) sender.replaceTrack(cameraTrack)
          })
        }
      })

      setScreenSharing(true)
    }
  }, [screenSharing])

  // ─── ICE candidate queue helpers ──────────────────────────────────────────

  async function flushIceCandidateQueue(peerId: string, pc: RTCPeerConnection) {
    remoteDescReady.current.add(peerId)
    const queue = iceCandidateQueues.current.get(peerId) ?? []
    iceCandidateQueues.current.delete(peerId)
    for (const init of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(init))
      } catch (err) {
        console.warn(`[ICE flush] Failed to add buffered candidate for ${peerId}:`, err)
      }
    }
  }

  // ─── Peer connection factory ───────────────────────────────────────────────

  function createPeerConnection(
    peerId: string,
    peerName: string,
    creds: TurnCredentials,
    onIceCandidate: (candidate: RTCIceCandidate) => void
  ): RTCPeerConnection {
    const config = buildIceConfig(creds)
    const pc = new RTCPeerConnection(config)
    peerConnectionsRef.current.set(peerId, pc)

    // Reset per-peer ICE state
    iceCandidateQueues.current.set(peerId, [])
    remoteDescReady.current.delete(peerId)

    pc.addEventListener('icecandidateerror', (e) => {
      const err = e as RTCPeerConnectionIceErrorEvent
      console.warn('ICE candidate error:', err.errorCode, err.errorText, err.url)
    })

    // Add local tracks to the connection
    const stream = localStreamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })
    }

    // Emit ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        onIceCandidate(e.candidate)
      }
    }

    // Handle incoming remote tracks.
    // ontrack fires once per track (audio and video separately).
    // We always create a NEW MediaStream reference so React detects the
    // state change on every ontrack event and VideoTile re-runs its effects
    // (important when audio track arrives after the video track).
    // Tracks are deduplicated by id to prevent double-add on re-negotiation.
    pc.ontrack = (e) => {
      console.info(`[WebRTC] ontrack from ${peerId}: kind=${e.track.kind}`)

      setRemotePeers((prev) => {
        const next = new Map(prev)
        const existing = next.get(peerId)

        const existingTracks = existing?.stream?.getTracks() ?? []
        // Deduplicate: don't add a track that's already in the stream
        const merged = existingTracks.some((t) => t.id === e.track.id)
          ? existingTracks
          : [...existingTracks, e.track]

        const remoteStream = new MediaStream(merged)

        next.set(peerId, {
          connectionId: peerId,
          displayName: existing?.displayName ?? peerName,
          pc,
          stream: remoteStream,
          audioEnabled: existing?.audioEnabled ?? true,
          videoEnabled: existing?.videoEnabled ?? true,
        })
        return next
      })
    }

    pc.onconnectionstatechange = () => {
      console.info(`[WebRTC] Peer ${peerId} connection: ${pc.connectionState}`)
      if (pc.connectionState === 'failed') {
        console.warn(`[WebRTC] ICE failed for ${peerId}, attempting restart`)
        pc.restartIce()
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.info(`[WebRTC] Peer ${peerId} ICE: ${pc.iceConnectionState}`)
    }

    return pc
  }

  // ─── Offer / answer / ICE ─────────────────────────────────────────────────

  const createOffer = useCallback(
    async (
      peerId: string,
      peerName: string,
      creds: TurnCredentials,
      onIceCandidate: (candidate: RTCIceCandidate) => void
    ): Promise<string> => {
      const pc = createPeerConnection(peerId, peerName, creds, onIceCandidate)

      // Ensure the peer is in the map even before tracks arrive
      setRemotePeers((prev) => {
        if (prev.has(peerId)) return prev
        const next = new Map(prev)
        next.set(peerId, {
          connectionId: peerId,
          displayName: peerName,
          pc,
          stream: null,
          audioEnabled: true,
          videoEnabled: true,
        })
        return next
      })

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })

      offer.sdp = preferVP8(offer.sdp ?? '')
      await pc.setLocalDescription(offer)
      return offer.sdp!
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const handleOffer = useCallback(
    async (
      peerId: string,
      peerName: string,
      offerSdp: string,
      creds: TurnCredentials,
      onIceCandidate: (candidate: RTCIceCandidate) => void
    ): Promise<string> => {
      const pc = createPeerConnection(peerId, peerName, creds, onIceCandidate)

      setRemotePeers((prev) => {
        if (prev.has(peerId)) return prev
        const next = new Map(prev)
        next.set(peerId, {
          connectionId: peerId,
          displayName: peerName,
          pc,
          stream: null,
          audioEnabled: true,
          videoEnabled: true,
        })
        return next
      })

      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offerSdp }))

      // Remote description is now set — flush any buffered ICE candidates
      await flushIceCandidateQueue(peerId, pc)

      const answer = await pc.createAnswer()
      answer.sdp = preferVP8(answer.sdp ?? '')
      await pc.setLocalDescription(answer)
      return answer.sdp!
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const handleAnswer = useCallback(async (peerId: string, answerSdp: string) => {
    const pc = peerConnectionsRef.current.get(peerId)
    if (!pc) return
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }))

    // Remote description is now set — flush any buffered ICE candidates
    await flushIceCandidateQueue(peerId, pc)
  }, [])

  const handleIceCandidate = useCallback(
    async (peerId: string, candidateInit: RTCIceCandidateInit) => {
      const pc = peerConnectionsRef.current.get(peerId)
      if (!pc) return

      // If remote description isn't set yet, buffer the candidate.
      // Dropping it would silently break ICE negotiation.
      if (!remoteDescReady.current.has(peerId)) {
        const queue = iceCandidateQueues.current.get(peerId) ?? []
        queue.push(candidateInit)
        iceCandidateQueues.current.set(peerId, queue)
        console.debug(`[ICE] Buffered candidate for ${peerId} (remote desc not ready yet)`)
        return
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidateInit))
      } catch (err) {
        console.warn('[ICE] Failed to add candidate:', err)
      }
    },
    []
  )

  const removePeer = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId)
    if (pc) {
      pc.close()
      peerConnectionsRef.current.delete(peerId)
    }
    iceCandidateQueues.current.delete(peerId)
    remoteDescReady.current.delete(peerId)
    setRemotePeers((prev) => {
      const next = new Map(prev)
      next.delete(peerId)
      return next
    })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      peerConnectionsRef.current.forEach((pc) => pc.close())
      peerConnectionsRef.current.clear()
      iceCandidateQueues.current.clear()
      remoteDescReady.current.clear()
    }
  }, [])

  return {
    localStream,
    remotePeers,
    audioEnabled,
    videoEnabled,
    screenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    startLocalMedia,
    stopLocalMedia,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    removePeer,
  }
}

// ─── Codec helpers ─────────────────────────────────────────────────────────────

/**
 * Reorders m=video codec list to prefer VP8.
 * VP8 has lower CPU cost than VP9/H.264 on weak connections.
 */
function preferVP8(sdp: string): string {
  const lines = sdp.split('\r\n')
  const videoSection = lines.findIndex((l) => l.startsWith('m=video'))
  if (videoSection === -1) return sdp

  // Find VP8 payload type
  const vp8Line = lines.find((l) => l.toLowerCase().includes('vp8'))
  if (!vp8Line) return sdp

  const match = vp8Line.match(/a=rtpmap:(\d+) VP8/)
  if (!match) return sdp
  const vp8Pt = match[1]

  // Rewrite the m= line to put VP8 first
  const mLine = lines[videoSection]
  const parts = mLine.split(' ')
  const prefix = parts.slice(0, 3)
  const payloads = parts.slice(3).filter((p) => p !== vp8Pt)
  lines[videoSection] = [...prefix, vp8Pt, ...payloads].join(' ')

  return lines.join('\r\n')
}
