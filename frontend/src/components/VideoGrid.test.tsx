import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { VideoGrid } from './VideoGrid'
import type { RemotePeer } from '../types'

vi.mock('../utils/audioContext', () => ({
  getAudioContext: vi.fn().mockReturnValue({
    state: 'running',
    resume: vi.fn(),
    createMediaStreamSource: vi.fn().mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    destination: {},
  }),
}))

vi.mock('../utils/browser', () => ({
  IS_WEBKIT: false,
  IS_SAFARI: false,
  IS_IOS: false,
  IS_FIREFOX: false,
}))

beforeEach(() => {
  vi.stubGlobal('MediaStream', class MockMediaStream {
    private tracks: MediaStreamTrack[]
    constructor(tracks?: MediaStreamTrack[]) {
      this.tracks = tracks ?? []
    }
    getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio') }
    getVideoTracks() { return this.tracks.filter(t => t.kind === 'video') }
    getTracks() { return this.tracks }
  })

  HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined)
})

function makePeer(id: string, name: string): RemotePeer {
  return {
    connectionId: id,
    displayName: name,
    pc: {} as RTCPeerConnection,
    stream: null,
    audioEnabled: true,
    videoEnabled: true,
  }
}

describe('VideoGrid', () => {
  it('renders local tile plus remote tiles', () => {
    const peers = [makePeer('c1', 'Bob'), makePeer('c2', 'Charlie')]
    const { container } = render(
      <VideoGrid
        localStream={null}
        localDisplayName="Alice"
        localAudioEnabled={true}
        localVideoEnabled={true}
        remotePeers={peers}
      />
    )

    const videos = container.querySelectorAll('video')
    expect(videos).toHaveLength(3)
  })

  it('renders 1x1 grid for single participant', () => {
    const { container } = render(
      <VideoGrid
        localStream={null}
        localDisplayName="Alice"
        localAudioEnabled={true}
        localVideoEnabled={true}
        remotePeers={[]}
      />
    )

    const grid = container.firstElementChild!
    expect(grid.className).toContain('grid-cols-1')
    expect(grid.className).toContain('grid-rows-1')
  })

  it('renders 2-column grid for 2 participants', () => {
    const { container } = render(
      <VideoGrid
        localStream={null}
        localDisplayName="Alice"
        localAudioEnabled={true}
        localVideoEnabled={true}
        remotePeers={[makePeer('c1', 'Bob')]}
      />
    )

    const grid = container.firstElementChild!
    expect(grid.className).toContain('grid-cols-2')
    expect(grid.className).toContain('grid-rows-1')
  })

  it('renders 2x2 grid for 3-4 participants', () => {
    const peers = [makePeer('c1', 'Bob'), makePeer('c2', 'Charlie'), makePeer('c3', 'Dave')]
    const { container } = render(
      <VideoGrid
        localStream={null}
        localDisplayName="Alice"
        localAudioEnabled={true}
        localVideoEnabled={true}
        remotePeers={peers}
      />
    )

    const grid = container.firstElementChild!
    expect(grid.className).toContain('grid-cols-2')
    expect(grid.className).toContain('grid-rows-2')
  })
})
