import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { SignalingCallbacks } from './useSignaling'

const mockInvoke = vi.fn()
const mockStart = vi.fn().mockResolvedValue(undefined)
const mockStop = vi.fn().mockResolvedValue(undefined)
const mockOn = vi.fn()
const mockOnreconnecting = vi.fn()
const mockOnreconnected = vi.fn()
const mockOnclose = vi.fn()

vi.mock('@microsoft/signalr', () => {
  const HubConnectionState = { Connected: 'Connected' }

  class MockHubConnection {
    state = 'Disconnected'
    invoke = mockInvoke
    start = mockStart
    stop = mockStop
    on = mockOn
    onreconnecting = mockOnreconnecting
    onreconnected = mockOnreconnected
    onclose = mockOnclose
  }

  class MockHubConnectionBuilder {
    withUrl() { return this }
    withAutomaticReconnect() { return this }
    configureLogging() { return this }
    build() { return new MockHubConnection() }
  }

  return {
    HubConnectionBuilder: MockHubConnectionBuilder,
    HubConnectionState,
    LogLevel: { Warning: 3 },
  }
})

function makeCallbacks(): SignalingCallbacks {
  return {
    onParticipantJoined: vi.fn(),
    onParticipantLeft: vi.fn(),
    onReceiveOffer: vi.fn(),
    onReceiveAnswer: vi.fn(),
    onReceiveIceCandidate: vi.fn(),
    onReceiveMediaState: vi.fn(),
    onReconnected: vi.fn(),
  }
}

describe('useSignaling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStart.mockResolvedValue(undefined)
  })

  async function importAndRender(cbs?: SignalingCallbacks) {
    const { useSignaling } = await import('./useSignaling')
    const callbacks = cbs ?? makeCallbacks()
    return renderHook(() => useSignaling(callbacks))
  }

  it('starts in disconnected state', async () => {
    const { result } = await importAndRender()
    expect(result.current.state).toBe('disconnected')
  })

  it('connect transitions to connected state', async () => {
    const { result } = await importAndRender()

    await act(async () => {
      await result.current.connect()
    })

    expect(result.current.state).toBe('connected')
    expect(mockStart).toHaveBeenCalledOnce()
  })

  it('disconnect stops connection and resets state', async () => {
    const { result } = await importAndRender()

    await act(async () => {
      await result.current.connect()
    })

    await act(async () => {
      await result.current.disconnect()
    })

    expect(mockStop).toHaveBeenCalled()
    expect(result.current.state).toBe('disconnected')
  })

  it('joinRoom invokes hub method with roomId and displayName', async () => {
    const mockEvent = {
      roomId: 'ROOM1',
      yourConnectionId: 'conn-1',
      existingParticipants: [],
    }
    mockInvoke.mockResolvedValue(mockEvent)

    const { result } = await importAndRender()

    await act(async () => {
      await result.current.connect()
    })

    let joinResult: unknown
    await act(async () => {
      joinResult = await result.current.joinRoom('ROOM1', 'Alice')
    })

    expect(mockInvoke).toHaveBeenCalledWith('JoinRoom', 'ROOM1', 'Alice')
    expect(joinResult).toEqual(mockEvent)
  })

  it('sendOffer invokes hub method with target and sdp', async () => {
    const { result } = await importAndRender()

    await act(async () => {
      await result.current.connect()
    })

    await act(async () => {
      await result.current.sendOffer('conn-2', 'sdp-data')
    })

    expect(mockInvoke).toHaveBeenCalledWith('SendOffer', 'conn-2', 'sdp-data')
  })

  it('sendAnswer invokes hub method with target and sdp', async () => {
    const { result } = await importAndRender()

    await act(async () => {
      await result.current.connect()
    })

    await act(async () => {
      await result.current.sendAnswer('conn-2', 'sdp-answer-data')
    })

    expect(mockInvoke).toHaveBeenCalledWith('SendAnswer', 'conn-2', 'sdp-answer-data')
  })

  it('sendIceCandidate invokes hub method with all args', async () => {
    const { result } = await importAndRender()

    await act(async () => {
      await result.current.connect()
    })

    await act(async () => {
      await result.current.sendIceCandidate('conn-2', 'candidate-str', 'audio', 0)
    })

    expect(mockInvoke).toHaveBeenCalledWith('SendIceCandidate', 'conn-2', 'candidate-str', 'audio', 0)
  })
})
