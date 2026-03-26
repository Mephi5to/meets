import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from './api'

describe('api', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('createRoom posts to /api/rooms/create and returns RoomDto', async () => {
    const mockDto = { id: 'ABCD1234', name: 'ABCD1234', participantCount: 0, participants: [] }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDto),
    })

    const result = await api.createRoom()

    expect(fetch).toHaveBeenCalledWith('/api/rooms/create', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(result).toEqual(mockDto)
  })

  it('createRoom throws on network error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    })

    await expect(api.createRoom()).rejects.toThrow('API 500: Internal Server Error')
  })

  it('getRoom fetches correct URL with room ID', async () => {
    const mockDto = { id: 'ROOM123', name: 'ROOM123', participantCount: 2, participants: [] }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDto),
    })

    const result = await api.getRoom('ROOM123')

    expect(fetch).toHaveBeenCalledWith('/api/rooms/ROOM123', expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(result).toEqual(mockDto)
  })

  it('getRoom throws on 404', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not Found'),
    })

    await expect(api.getRoom('NONEXIST')).rejects.toThrow('API 404: Not Found')
  })
})
