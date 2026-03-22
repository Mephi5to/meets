import { Copy, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../services/api'

interface JoinRoomProps {
  onJoin: (roomId: string, displayName: string) => void
  initialRoomId?: string
}

export function JoinRoom({ onJoin, initialRoomId = '' }: JoinRoomProps) {
  const [roomId, setRoomId] = useState(initialRoomId)
  const [displayName, setDisplayName] = useState('')
  const [participantCount, setParticipantCount] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check participant count when room ID changes
  useEffect(() => {
    if (roomId.length < 4) {
      setParticipantCount(null)
      return
    }
    const t = setTimeout(async () => {
      try {
        const room = await api.getRoom(roomId.toUpperCase())
        setParticipantCount(room.participantCount)
      } catch {
        setParticipantCount(null)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [roomId])

  async function handleCreate() {
    setLoading(true)
    setError(null)
    try {
      const room = await api.createRoom()
      setRoomId(room.id)
    } catch {
      setError('Failed to create room. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    const url = new URL(window.location.href)
    url.searchParams.set('room', roomId.toUpperCase())
    await navigator.clipboard.writeText(url.toString())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = displayName.trim()
    const trimmedRoom = roomId.trim().toUpperCase()
    if (!trimmedRoom || !trimmedName) return
    onJoin(trimmedRoom, trimmedName)
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Video className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Meets</h1>
        </div>

        <div className="bg-surface-800 border border-white/10 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-1">Join a meeting</h2>
          <p className="text-sm text-white/50 mb-6">
            All traffic is relayed through a secure TURN server. No direct P2P.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleJoin} className="space-y-4">
            {/* Display name */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">
                Your name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                maxLength={50}
                required
                className="w-full px-3.5 py-2.5 bg-surface-700 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              />
            </div>

            {/* Room ID */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">
                Room ID
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    placeholder="e.g. ABCD1234"
                    maxLength={64}
                    required
                    className="w-full px-3.5 py-2.5 bg-surface-700 border border-white/10 rounded-lg text-white placeholder-white/30 font-mono uppercase tracking-widest focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition pr-10"
                  />
                  {roomId && (
                    <button
                      type="button"
                      onClick={handleCopy}
                      title="Copy room ID"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={loading}
                  className="px-3.5 py-2.5 bg-surface-700 border border-white/10 rounded-lg text-white/70 hover:text-white hover:border-white/30 text-sm font-medium transition disabled:opacity-50 whitespace-nowrap"
                >
                  {loading ? '…' : 'New room'}
                </button>
              </div>

              {/* Participant count hint */}
              {participantCount !== null && (
                <p className="mt-1.5 text-xs text-white/40">
                  {participantCount === 0
                    ? 'Room is empty — you\'ll be first'
                    : `${participantCount} participant${participantCount !== 1 ? 's' : ''} in this room`}
                </p>
              )}

              {copied && (
                <p className="mt-1.5 text-xs text-green-400">Link copied!</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!roomId || !displayName}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition"
            >
              Join meeting
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-white/25 mt-4">
          Traffic relayed via TURNS/TLS on port 443 &bull; No P2P &bull; No IP exposure
        </p>
      </div>
    </div>
  )
}
