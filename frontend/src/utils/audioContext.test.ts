import { describe, it, expect, vi, beforeEach } from 'vitest'

let getAudioContext: typeof import('./audioContext').getAudioContext
let resumeAudioContext: typeof import('./audioContext').resumeAudioContext

describe('audioContext', () => {
  let mockResume: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()

    mockResume = vi.fn().mockResolvedValue(undefined)

    class MockAudioContext {
      state = 'suspended'
      resume = mockResume
      close = vi.fn()
    }

    vi.stubGlobal('AudioContext', MockAudioContext)

    const mod = await import('./audioContext')
    getAudioContext = mod.getAudioContext
    resumeAudioContext = mod.resumeAudioContext
  })

  it('getAudioContext creates an AudioContext', () => {
    const ctx = getAudioContext()
    expect(ctx).toBeDefined()
    expect(ctx.state).toBe('suspended')
  })

  it('getAudioContext returns the same instance on subsequent calls', () => {
    const ctx1 = getAudioContext()
    const ctx2 = getAudioContext()
    expect(ctx1).toBe(ctx2)
  })

  it('resumeAudioContext calls resume when context is suspended', () => {
    resumeAudioContext()
    expect(mockResume).toHaveBeenCalled()
  })

  it('resumeAudioContext does not throw when AudioContext is unavailable', async () => {
    vi.resetModules()
    vi.stubGlobal('AudioContext', undefined)
    // @ts-expect-error removing webkitAudioContext
    delete (window as Record<string, unknown>).webkitAudioContext

    const mod = await import('./audioContext')
    expect(() => mod.resumeAudioContext()).not.toThrow()
  })
})
