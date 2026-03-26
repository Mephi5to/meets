import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VideoTile } from './VideoTile'

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

describe('VideoTile', () => {
  it('renders display name', () => {
    render(<VideoTile stream={null} displayName="Alice Smith" />)
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
  })

  it('shows avatar initials when video is disabled', () => {
    render(<VideoTile stream={null} displayName="Alice Smith" videoEnabled={false} />)
    expect(screen.getByText('AS')).toBeInTheDocument()
  })

  it('shows "(you)" badge for local tile', () => {
    render(<VideoTile stream={null} displayName="Alice" isLocal={true} />)
    expect(screen.getByText('YOU')).toBeInTheDocument()
    expect(screen.getByText('(you)')).toBeInTheDocument()
  })

  it('does not show "(you)" badge for remote tile', () => {
    render(<VideoTile stream={null} displayName="Bob" isLocal={false} />)
    expect(screen.queryByText('YOU')).not.toBeInTheDocument()
    expect(screen.queryByText('(you)')).not.toBeInTheDocument()
  })

  it('shows muted mic indicator when audio is disabled', () => {
    const { container } = render(
      <VideoTile stream={null} displayName="Alice" audioEnabled={false} />
    )
    const micOffIcons = container.querySelectorAll('.bg-red-600')
    expect(micOffIcons.length).toBeGreaterThan(0)
  })
})
