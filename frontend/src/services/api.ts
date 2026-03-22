import type { RoomDto } from '../types'

const BASE_URL = import.meta.env.VITE_SIGNALING_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  createRoom: () => request<RoomDto>('/api/rooms/create', { method: 'POST' }),

  getRoom: (roomId: string) => request<RoomDto>(`/api/rooms/${roomId}`),
}
