import { MicOff, VideoOff } from 'lucide-react'
import { useEffect, useRef } from 'react'

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

  // ── Video ──────────────────────────────────────────────────────────────────
  // <video> is always muted — audio is handled by a separate <audio> element.
  // autoPlay handles the case where srcObject is set before the effect runs;
  // the explicit play() call is a belt-and-suspenders fallback.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (stream) {
      video.srcObject = stream
      video.play().catch((err) => {
        if (err.name !== 'AbortError') console.warn('[VideoTile] video play():', err.name)
      })
    } else {
      video.srcObject = null
    }
  }, [stream])

  // ── Audio ──────────────────────────────────────────────────────────────────
  // Separate <audio> element (no autoPlay attribute) so there is no race
  // between the browser's autoplay trigger and our explicit play() call.
  //
  // The ontrack handler in useWebRTC now creates a NEW MediaStream reference
  // on every event, so this effect re-runs reliably for every incoming track.
  // The addtrack listener is kept as a belt-and-suspenders for any edge cases.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || muted || !stream) {
      if (audio) audio.srcObject = null
      return
    }

    function attachAudio() {
      if (!audio || !stream) return
      const tracks = stream.getAudioTracks()
      if (tracks.length === 0) return

      // Skip if we are already playing these exact tracks
      const current = (audio.srcObject as MediaStream | null)?.getAudioTracks() ?? []
      if (
        current.length === tracks.length &&
        current.every((t, i) => t.id === tracks[i].id)
      )
        return

      audio.srcObject = new MediaStream(tracks)
      audio.play().catch((err) => {
        if (err.name === 'NotAllowedError') {
          // Autoplay blocked — retry on the very next user interaction.
          // This can happen if the ICE connection takes long enough that the
          // browser's user-gesture token has expired by the time ontrack fires.
          const unlock = () => {
            audio.play().catch(() => {})
          }
          document.addEventListener('click', unlock, { once: true })
        } else if (err.name !== 'AbortError') {
          console.warn('[VideoTile] audio play():', err.name, err.message)
        }
      })
    }

    attachAudio()
    stream.addEventListener('addtrack', attachAudio)

    return () => {
      stream.removeEventListener('addtrack', attachAudio)
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
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover ${!videoEnabled ? 'hidden' : ''}`}
      />

      {/* Audio-only element for remote peers — no autoPlay to avoid
          racing with the explicit play() call in the effect above */}
      {!muted && <audio ref={audioRef} playsInline />}

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
