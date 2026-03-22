import { MicOff, VideoOff } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface VideoTileProps {
  stream: MediaStream | null
  displayName: string
  muted?: boolean       // true = suppress audio (local tile, prevent echo)
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
  // Separate audio element for remote peers.
  // The <video> element is always muted (only used for video track display).
  // Audio is routed through a dedicated <audio> element so Chrome autoplay
  // policy for audio does not interfere with video playback (and vice versa).
  const audioRef = useRef<HTMLAudioElement>(null)

  // ── Video track ────────────────────────────────────────────────────────────
  // The video element is ALWAYS muted. We rely on it only for the picture.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (stream) {
      video.srcObject = stream
      video.muted = true
      video.play().catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('[VideoTile] video play():', err.name, err.message)
        }
      })
    } else {
      video.srcObject = null
    }
  }, [stream])

  // ── Audio track ────────────────────────────────────────────────────────────
  // Only attach audio for remote tiles (muted=false).
  // Local tile always skips this to prevent feedback.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (!muted && stream) {
      // Build a stream that contains only the audio tracks so the <audio>
      // element never receives video data (keeps things clean).
      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) return

      const audioOnlyStream = new MediaStream(audioTracks)
      audio.srcObject = audioOnlyStream
      audio.play().catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('[VideoTile] audio play():', err.name, err.message)
        }
      })
    } else {
      audio.srcObject = null
    }

    return () => {
      if (audio) audio.srcObject = null
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
      {/* Video element — always muted, only displays video track */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover ${!videoEnabled ? 'hidden' : ''}`}
      />

      {/* Hidden audio element — only used for remote peers (muted=false) */}
      {!muted && <audio ref={audioRef} autoPlay playsInline />}

      {/* Avatar fallback when video is off */}
      {!videoEnabled && (
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-full bg-blue-700 flex items-center justify-center text-white text-xl font-bold select-none">
            {initials}
          </div>
          <span className="text-white/60 text-sm">{displayName}</span>
        </div>
      )}

      {/* Name badge */}
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

      {/* Local indicator */}
      {isLocal && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-blue-600/80 rounded text-white text-[10px] font-medium">
          YOU
        </div>
      )}
    </div>
  )
}
