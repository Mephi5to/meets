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
  adoptStream: (stream: MediaStream) => void
  stopLocalMedia: () => void
  removeAllPeers: () => void
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

  const iceCandidateQueues = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const remoteDescReady = useRef<Set<string>>(new Set())

  // ─── Local media ──────────────────────────────────────────────────────────

  const startLocalMedia = useCallback(async (): Promise<MediaStream> => {
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }
    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
      facingMode: 'user',
    }

    let stream: MediaStream

    try {
      // Ideal: both camera and microphone
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: videoConstraints,
      })
    } catch (err: unknown) {
      const name = (err as DOMException).name
      // NotReadableError  — device in use by another app (Discord, Zoom, etc.)
      // NotFoundError     — no device present
      // OverconstrainedError — constraints can't be satisfied
      // AbortError        — device aborted unexpectedly
      // NotAllowedError   — user denied permission (retry with fewer devices)
      const retryable = ['NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError', 'NotAllowedError']
      if (retryable.includes(name)) {
        try {
          // Try audio-only (no camera) — most apps share the mic on all platforms
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false })
        } catch {
          try {
            // Try video-only (no microphone)
            stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints })
          } catch {
            // No devices at all — join as receive-only (can still see/hear others)
            stream = new MediaStream()
          }
        }
      } else {
        throw err
      }
    }

    // Listen for track.ended — fires when another app (Discord, Teams) steals
    // exclusive access to the device, or the device is physically unplugged.
    // Update React state so the UI reflects the loss (e.g. camera icon → off).
    stream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        const currentStream = localStreamRef.current
        if (!currentStream) return
        const hasAudio = currentStream.getAudioTracks().some((t) => t.readyState === 'live')
        const hasVideo = currentStream.getVideoTracks().some((t) => t.readyState === 'live')
        setAudioEnabled(hasAudio)
        setVideoEnabled(hasVideo)
      })
    })

    localStreamRef.current = stream
    setLocalStream(stream)
    return stream
  }, [])

  const adoptStream = useCallback((stream: MediaStream) => {
    // Listen for track.ended (device stolen by Discord/Teams, or unplugged)
    stream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        const currentStream = localStreamRef.current
        if (!currentStream) return
        const hasAudio = currentStream.getAudioTracks().some((t) => t.readyState === 'live')
        const hasVideo = currentStream.getVideoTracks().some((t) => t.readyState === 'live')
        setAudioEnabled(hasAudio)
        setVideoEnabled(hasVideo)
      })
    })

    localStreamRef.current = stream
    setLocalStream(stream)
    setAudioEnabled(stream.getAudioTracks().some((t) => t.enabled))
    setVideoEnabled(stream.getVideoTracks().some((t) => t.enabled))
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
    stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled })
    setAudioEnabled((prev) => !prev)
  }, [])

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled })
    setVideoEnabled((prev) => !prev)
  }, [])

  const toggleScreenShare = useCallback(async () => {
    const pcs = peerConnectionsRef.current
    if (screenSharing) {
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
      let screenStream: MediaStream
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 15, max: 30 } },
          audio: false,
        })
      } catch {
        // User cancelled the picker or browser denied — just return
        return
      }
      screenStreamRef.current = screenStream
      const screenTrack = screenStream.getVideoTracks()[0]
      pcs.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) sender.replaceTrack(screenTrack)
      })
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

  // ─── ICE candidate buffering ───────────────────────────────────────────────

  async function flushIceCandidateQueue(peerId: string, pc: RTCPeerConnection) {
    remoteDescReady.current.add(peerId)
    const queue = iceCandidateQueues.current.get(peerId) ?? []
    iceCandidateQueues.current.delete(peerId)
    for (const init of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(init))
      } catch (err) {
        console.warn(`[ICE flush] buffered candidate error for ${peerId}:`, err)
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
    const pc = new RTCPeerConnection(buildIceConfig(creds))
    peerConnectionsRef.current.set(peerId, pc)
    iceCandidateQueues.current.set(peerId, [])
    remoteDescReady.current.delete(peerId)

    pc.addEventListener('icecandidateerror', (e) => {
      const err = e as RTCPeerConnectionIceErrorEvent
      console.warn('[ICE] candidate error:', err.errorCode, err.errorText, err.url)
    })

    // Add local tracks
    const stream = localStreamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) onIceCandidate(e.candidate)
    }

    // ontrack fires once per track (audio + video = 2 events).
    // e.streams[0] is the SAME object reference for both events in Chrome,
    // so relying on it alone means React won't detect a change on the second event
    // and VideoTile's audio effect won't re-run to pick up the audio track.
    //
    // Fix: always build a NEW MediaStream from a deduplicated union of
    //   • tracks already in the existing peer stream
    //   • tracks in e.streams[0]  (Chrome often bundles both tracks here early)
    //   • the current e.track itself
    // This guarantees a new reference every time, React always re-renders,
    // and VideoTile always sees the latest set of tracks.
    pc.ontrack = (e) => {
      console.info(`[WebRTC] ontrack peer=${peerId} kind=${e.track.kind} streams=${e.streams.length}`)
      setRemotePeers((prev) => {
        const next = new Map(prev)
        const existing = next.get(peerId)

        const trackMap = new Map<string, MediaStreamTrack>()
        existing?.stream?.getTracks().forEach((t) => trackMap.set(t.id, t))
        e.streams[0]?.getTracks().forEach((t) => trackMap.set(t.id, t))
        trackMap.set(e.track.id, e.track)

        const remoteStream = new MediaStream([...trackMap.values()])

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
      console.info(`[WebRTC] peer=${peerId} connection=${pc.connectionState}`)
      if (pc.connectionState === 'failed') pc.restartIce()
    }

    pc.oniceconnectionstatechange = () => {
      console.info(`[WebRTC] peer=${peerId} ICE=${pc.iceConnectionState}`)
    }

    return pc
  }

  // ─── Offer / Answer / ICE ─────────────────────────────────────────────────

  const createOffer = useCallback(
    async (
      peerId: string,
      peerName: string,
      creds: TurnCredentials,
      onIceCandidate: (candidate: RTCIceCandidate) => void
    ): Promise<string> => {
      const pc = createPeerConnection(peerId, peerName, creds, onIceCandidate)
      setRemotePeers((prev) => {
        if (prev.has(peerId)) return prev
        const next = new Map(prev)
        next.set(peerId, { connectionId: peerId, displayName: peerName, pc, stream: null, audioEnabled: true, videoEnabled: true })
        return next
      })
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
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
        next.set(peerId, { connectionId: peerId, displayName: peerName, pc, stream: null, audioEnabled: true, videoEnabled: true })
        return next
      })
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offerSdp }))
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
    await flushIceCandidateQueue(peerId, pc)
  }, [])

  const handleIceCandidate = useCallback(
    async (peerId: string, candidateInit: RTCIceCandidateInit) => {
      const pc = peerConnectionsRef.current.get(peerId)
      if (!pc) return
      if (!remoteDescReady.current.has(peerId)) {
        const queue = iceCandidateQueues.current.get(peerId) ?? []
        queue.push(candidateInit)
        iceCandidateQueues.current.set(peerId, queue)
        return
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidateInit))
      } catch (err) {
        console.warn('[ICE] addIceCandidate error:', err)
      }
    },
    []
  )

  const removeAllPeers = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => pc.close())
    peerConnectionsRef.current.clear()
    iceCandidateQueues.current.clear()
    remoteDescReady.current.clear()
    setRemotePeers(new Map())
  }, [])

  const removePeer = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId)
    if (pc) { pc.close(); peerConnectionsRef.current.delete(peerId) }
    iceCandidateQueues.current.delete(peerId)
    remoteDescReady.current.delete(peerId)
    setRemotePeers((prev) => {
      const next = new Map(prev)
      next.delete(peerId)
      return next
    })
  }, [])

  useEffect(() => {
    return () => {
      peerConnectionsRef.current.forEach((pc) => pc.close())
      peerConnectionsRef.current.clear()
      iceCandidateQueues.current.clear()
      remoteDescReady.current.clear()
    }
  }, [])

  return {
    localStream, remotePeers, audioEnabled, videoEnabled, screenSharing,
    toggleAudio, toggleVideo, toggleScreenShare,
    startLocalMedia, adoptStream, stopLocalMedia, removeAllPeers,
    createOffer, handleOffer, handleAnswer, handleIceCandidate, removePeer,
  }
}

function preferVP8(sdp: string): string {
  const lines = sdp.split('\r\n')
  const videoSection = lines.findIndex((l) => l.startsWith('m=video'))
  if (videoSection === -1) return sdp
  const vp8Line = lines.find((l) => l.toLowerCase().includes('vp8'))
  if (!vp8Line) return sdp
  const match = vp8Line.match(/a=rtpmap:(\d+) VP8/)
  if (!match) return sdp
  const vp8Pt = match[1]
  const mLine = lines[videoSection]
  const parts = mLine.split(' ')
  const prefix = parts.slice(0, 3)
  const payloads = parts.slice(3).filter((p) => p !== vp8Pt)
  lines[videoSection] = [...prefix, vp8Pt, ...payloads].join(' ')
  return lines.join('\r\n')
}
