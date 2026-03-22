import { MicOff, VideoOff } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface VideoTileProps {
  stream: MediaStream | null
  displayName: string
  muted?: boolean       // mute the <video> element (always mute local to prevent echo)
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

  // Keep a ref to the latest muted value so the stream effect can read it
  // without being listed as a dependency (which would restart playback on
  // every mute toggle).
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  // Stream assignment + play.
  // Chrome's autoplay policy allows muted autoplay but suppresses unmuted
  // audio. The trick: start muted so play() is always allowed, then restore
  // the correct muted state after the promise resolves so audio plays.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (stream) {
      video.srcObject = stream
      video.muted = true          // allow autoplay under Chrome's policy
      video.play()
        .then(() => {
          // Playback started — now apply the real muted state.
          // For local tiles (muted=true) this keeps echo suppressed.
          // For remote tiles (muted=false) this unmutes and audio plays.
          video.muted = mutedRef.current
        })
        .catch((err) => {
          // AbortError = srcObject replaced before play() resolved — harmless.
          if (err.name !== 'AbortError') {
            console.warn('[VideoTile] play() blocked:', err.name, err.message)
          }
        })
    } else {
      video.srcObject = null
    }
  }, [stream])

  // Reflect muted prop changes (e.g. user clicks mute button) imperatively.
  // React has a long-standing bug where muted={false} does not remove the
  // DOM attribute, so we never rely on the JSX prop for this.
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted
    }
  }, [muted])

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
      {/* Video element — muted is managed imperatively via ref, not via JSX prop */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${!videoEnabled ? 'hidden' : ''}`}
      />

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
