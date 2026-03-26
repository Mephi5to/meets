import { describe, it, expect, vi, beforeEach } from 'vitest'
import { copyToClipboard } from './clipboard'

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // jsdom doesn't define execCommand, so we add it for fallback tests
    document.execCommand = vi.fn().mockReturnValue(true)
  })

  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    await copyToClipboard('hello')

    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('falls back to execCommand when clipboard API fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.assign(navigator, { clipboard: { writeText } })

    await copyToClipboard('fallback-text')

    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('falls back to execCommand when clipboard API is unavailable', async () => {
    Object.assign(navigator, { clipboard: undefined })

    await copyToClipboard('no-api-text')

    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })
})
