import { MicOff, VideoOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { getAudioContext } from '../utils/audioContext'
import { IS_WEBKIT } from '../utils/browser'

interface VideoTileProps {
  stream: MediaStream | null
  displayName: string
  muted?: boolean
  audioEnabled?: boolean
  videoEnabled?: boolean
  isLocal?: boolean
  className?: string
}

export function VideoTile({
  stream,
  displayName,
  muted = false,
  audioEnabled = true,
  videoEnabled = true,
  isLocal = false,
  className = '',
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  // Tracks the Web Audio source node so we can disconnect it on cleanup.
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)

  // ── Video ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (stream) {
      video.srcObject = stream
      // Some older browsers return undefined from play(); guard the .catch()
      const playPromise = video.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err: DOMException) => {
          if (err.name !== 'AbortError') console.warn('[VideoTile] video play():', err.name)
        })
      }
    } else {
      video.srcObject = null
    }
  }, [stream])

  // ── Audio: WebKit path (Safari / iOS) ────────────────────────────────────
  //
  // WebKit has a known bug: MediaStreamAudioSourceNode silences remote WebRTC
  // streams. We work around this by using a plain <audio> element on WebKit.
  // Safari/iOS allow autoplay for WebRTC media after user interaction, so this
  // works reliably after the "Join" click.
  useEffect(() => {
    if (!IS_WEBKIT) return // Non-WebKit uses Web Audio API below
    const audio = audioRef.current
    if (!audio) return

    if (muted || !stream) {
      audio.srcObject = null
      return
    }

    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      audio.srcObject = null
      return
    }

    audio.srcObject = new MediaStream(audioTracks)
    const playPromise = audio.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {})
    }

    return () => {
      audio.srcObject = null
    }
  }, [stream, muted])

  // ── Audio: Non-WebKit path (Chrome, Firefox, Edge, Opera, Yandex) ────────
  //
  // Route remote audio through AudioContext → destination. This bypasses
  // Chrome's autoplay restrictions: once the context is resumed (on Join click),
  // any source connected to it plays immediately without a separate gesture.
  useEffect(() => {
    if (IS_WEBKIT) return // WebKit uses <audio> element above

    // Disconnect any previous source
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect()
      sourceNodeRef.current = null
    }

    if (muted || !stream) return

    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) return

    try {
      const ctx = getAudioContext()
      const source = ctx.createMediaStreamSource(new MediaStream(audioTracks))
      source.connect(ctx.destination)
      sourceNodeRef.current = source
    } catch (err) {
      console.warn('[VideoTile] Web Audio API error, audio may not play:', err)
    }

    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect()
        sourceNodeRef.current = null
      }
    }
  }, [stream, muted])

  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div
      className={`relative bg-surface-800 rounded-xl overflow-hidden flex items-center justify-center ${className}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-contain [transform:scaleX(-1)] ${!videoEnabled ? 'hidden' : ''}`}
      />

      {/* Hidden <audio> element used only on WebKit (Safari/iOS) for remote audio */}
      {IS_WEBKIT && <audio ref={audioRef} autoPlay playsInline />}

      {!videoEnabled && (
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-full bg-blue-700 flex items-center justify-center text-white text-xl font-bold select-none">
            {initials}
          </div>
          <span className="text-white/60 text-sm">{displayName}</span>
        </div>
      )}

      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <span className="px-2 py-0.5 bg-black/50 backdrop-blur-sm rounded text-white text-xs font-medium truncate max-w-[calc(100%-2rem)]">
          {displayName}
          {isLocal && <span className="text-white/50 ml-1">(you)</span>}
        </span>
        <div className="flex gap-1">
          {!audioEnabled && (
            <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
              <MicOff className="w-3 h-3 text-white" />
            </div>
          )}
          {!videoEnabled && (
            <div className="w-6 h-6 bg-surface-700 rounded-full flex items-center justify-center">
              <VideoOff className="w-3 h-3 text-white/60" />
            </div>
          )}
        </div>
      </div>

      {isLocal && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-blue-600/80 rounded text-white text-[10px] font-medium">
          YOU
        </div>
      )}
    </div>
  )
}
