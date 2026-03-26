import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Controls } from './Controls'

vi.mock('../utils/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}))

function renderControls(overrides: Partial<Parameters<typeof Controls>[0]> = {}) {
  const defaults = {
    audioEnabled: true,
    videoEnabled: true,
    screenSharing: false,
    roomId: 'ROOM1234',
    onToggleAudio: vi.fn(),
    onToggleVideo: vi.fn(),
    onToggleScreenShare: vi.fn(),
    onLeave: vi.fn(),
    screenShareSupported: true,
  }
  const props = { ...defaults, ...overrides }
  return { ...render(<Controls {...props} />), props }
}

describe('Controls', () => {
  it('renders all control buttons', () => {
    renderControls()

    expect(screen.getByTitle('Mute')).toBeInTheDocument()
    expect(screen.getByTitle('Stop video')).toBeInTheDocument()
    expect(screen.getByTitle('Share screen')).toBeInTheDocument()
    expect(screen.getByTitle('Copy invite link')).toBeInTheDocument()
    expect(screen.getByTitle('Leave meeting')).toBeInTheDocument()
  })

  it('shows Unmute when audio is disabled', () => {
    renderControls({ audioEnabled: false })
    expect(screen.getByTitle('Unmute')).toBeInTheDocument()
  })

  it('shows Start video when video is disabled', () => {
    renderControls({ videoEnabled: false })
    expect(screen.getByTitle('Start video')).toBeInTheDocument()
  })

  it('calls onToggleAudio when mic button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderControls()

    await user.click(screen.getByTitle('Mute'))
    expect(props.onToggleAudio).toHaveBeenCalledOnce()
  })

  it('calls onToggleVideo when video button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderControls()

    await user.click(screen.getByTitle('Stop video'))
    expect(props.onToggleVideo).toHaveBeenCalledOnce()
  })

  it('calls onLeave when leave button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderControls()

    await user.click(screen.getByTitle('Leave meeting'))
    expect(props.onLeave).toHaveBeenCalledOnce()
  })

  it('hides screen share button when not supported', () => {
    renderControls({ screenShareSupported: false })
    expect(screen.queryByTitle('Share screen')).not.toBeInTheDocument()
  })
})
