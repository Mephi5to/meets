import { describe, it, expect, vi, beforeEach } from 'vitest'

async function importBrowserWithUA(ua: string, platform = '', maxTouchPoints = 0) {
  vi.resetModules()
  vi.stubGlobal('navigator', {
    userAgent: ua,
    platform,
    maxTouchPoints,
  })
  return import('./browser')
}

describe('browser detection', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('IS_SAFARI is false on Chrome', async () => {
    const mod = await importBrowserWithUA(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )
    expect(mod.IS_SAFARI).toBe(false)
  })

  it('IS_SAFARI is true on Safari desktop', async () => {
    const mod = await importBrowserWithUA(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
    )
    expect(mod.IS_SAFARI).toBe(true)
  })

  it('IS_IOS is true on iPhone', async () => {
    const mod = await importBrowserWithUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    )
    expect(mod.IS_IOS).toBe(true)
  })

  it('IS_IOS is true on iPad with desktop UA', async () => {
    const mod = await importBrowserWithUA(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      'MacIntel',
      5
    )
    expect(mod.IS_IOS).toBe(true)
  })

  it('IS_FIREFOX is true on Firefox', async () => {
    const mod = await importBrowserWithUA(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
    )
    expect(mod.IS_FIREFOX).toBe(true)
  })

  it('IS_WEBKIT is true on Safari', async () => {
    const mod = await importBrowserWithUA(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
    )
    expect(mod.IS_WEBKIT).toBe(true)
  })

  it('IS_WEBKIT is true on iOS Chrome', async () => {
    const mod = await importBrowserWithUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1'
    )
    expect(mod.IS_WEBKIT).toBe(true)
  })
})
