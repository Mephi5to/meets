import type { RemotePeer } from '../types'
import { VideoTile } from './VideoTile'

interface VideoGridProps {
  localStream: MediaStream | null
  localDisplayName: string
  localAudioEnabled: boolean
  localVideoEnabled: boolean
  remotePeers: RemotePeer[]
}

export function VideoGrid({
  localStream,
  localDisplayName,
  localAudioEnabled,
  localVideoEnabled,
  remotePeers,
}: VideoGridProps) {
  const totalCount = 1 + remotePeers.length // local + remotes

  const gridClass = getGridClass(totalCount)

  return (
    <div className={`h-full p-3 grid gap-3 ${gridClass}`}>
      {/* Local tile — always first */}
      <VideoTile
        stream={localStream}
        displayName={localDisplayName}
        muted={true} // always mute local audio to prevent echo
        audioEnabled={localAudioEnabled}
        videoEnabled={localVideoEnabled}
        isLocal={true}
        className="min-h-0"
      />

      {/* Remote tiles */}
      {remotePeers.map((peer) => (
        <VideoTile
          key={peer.connectionId}
          stream={peer.stream}
          displayName={peer.displayName}
          muted={false}
          audioEnabled={peer.audioEnabled}
          videoEnabled={peer.videoEnabled}
          isLocal={false}
          className="min-h-0"
        />
      ))}
    </div>
  )
}

function getGridClass(count: number): string {
  if (count === 1) return 'grid-cols-1 grid-rows-1'
  if (count === 2) return 'grid-cols-2 grid-rows-1'
  if (count <= 4) return 'grid-cols-2 grid-rows-2'
  if (count <= 6) return 'grid-cols-3 grid-rows-2'
  if (count <= 9) return 'grid-cols-3 grid-rows-3'
  return 'grid-cols-4 auto-rows-fr'
}
