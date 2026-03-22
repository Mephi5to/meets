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
  // Always muted — audio is handled by a separate <audio> element below.
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
  // Separate <audio> element so Chrome autoplay policy for video never
  // interferes with audio playback.
  // We also listen for 'addtrack' on the stream so that audio tracks which
  // arrive after the video track (second ontrack event) are picked up even
  // when the stream object reference hasn't changed.
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
      // Avoid restarting if we already have the same tracks
      const current = (audio.srcObject as MediaStream | null)?.getAudioTracks() ?? []
      if (current.length === tracks.length && current.every((t, i) => t.id === tracks[i].id)) return

      const audioStream = new MediaStream(tracks)
      audio.srcObject = audioStream
      audio.play().catch((err) => {
        if (err.name !== 'AbortError') console.warn('[VideoTile] audio play():', err.name)
      })
    }

    attachAudio()

    // If audio track hasn't arrived yet, catch it when the stream gains a track
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

      {/* Hidden audio element for remote peers */}
      {!muted && <audio ref={audioRef} autoPlay playsInline />}

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
