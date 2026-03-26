import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  RoomJoinedEvent,
  TurnCredentials,
} from '../types'

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL ?? ''

export type SignalingState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface SignalingCallbacks {
  onParticipantJoined: (event: ParticipantJoinedEvent) => void
  onParticipantLeft: (event: ParticipantLeftEvent) => void
  onReceiveOffer: (fromConnectionId: string, sdp: string) => void
  onReceiveAnswer: (fromConnectionId: string, sdp: string) => void
  onReceiveIceCandidate: (
    fromConnectionId: string,
    candidate: string,
    sdpMid: string | null,
    sdpMLineIndex: number | null
  ) => void
  onReceiveMediaState?: (fromConnectionId: string, audioEnabled: boolean, videoEnabled: boolean) => void
  onReconnected?: () => void
}

export function useSignaling(callbacks: SignalingCallbacks) {
  const [state, setState] = useState<SignalingState>('disconnected')
  const connectionRef = useRef<HubConnection | null>(null)
  // Keep callbacks in a ref so hub handlers always call the latest version
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  const connect = useCallback(async () => {
    if (connectionRef.current?.state === HubConnectionState.Connected) return

    setState('connecting')

    const connection = new HubConnectionBuilder()
      .withUrl(`${SIGNALING_URL}/hub/signaling`, {
        // Prefer WebSocket; SignalR falls back to SSE/LongPolling automatically
        // WebSocket traffic is less likely to be inspected deeply than custom TCP
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (ctx) => {
          // Exponential backoff: 0, 2, 10, 30 seconds
          const delays = [0, 2000, 10000, 30000]
          return delays[ctx.previousRetryCount] ?? 30000
        },
      })
      .configureLogging(LogLevel.Warning)
      .build()

    // ─── Hub event handlers ────────────────────────────────────────────────

    connection.on('ParticipantJoined', (event: ParticipantJoinedEvent) => {
      callbacksRef.current.onParticipantJoined(event)
    })

    connection.on('ParticipantLeft', (event: ParticipantLeftEvent) => {
      callbacksRef.current.onParticipantLeft(event)
    })

    connection.on('ReceiveOffer', (fromConnectionId: string, sdp: string) => {
      callbacksRef.current.onReceiveOffer(fromConnectionId, sdp)
    })

    connection.on('ReceiveAnswer', (fromConnectionId: string, sdp: string) => {
      callbacksRef.current.onReceiveAnswer(fromConnectionId, sdp)
    })

    connection.on(
      'ReceiveIceCandidate',
      (
        fromConnectionId: string,
        candidate: string,
        sdpMid: string | null,
        sdpMLineIndex: number | null
      ) => {
        callbacksRef.current.onReceiveIceCandidate(
          fromConnectionId,
          candidate,
          sdpMid,
          sdpMLineIndex
        )
      }
    )

    connection.on(
      'ReceiveMediaState',
      (fromConnectionId: string, audioEnabled: boolean, videoEnabled: boolean) => {
        callbacksRef.current.onReceiveMediaState?.(fromConnectionId, audioEnabled, videoEnabled)
      }
    )

    connection.onreconnecting(() => setState('connecting'))
    connection.onreconnected(() => {
      setState('connected')
      callbacksRef.current.onReconnected?.()
    })
    connection.onclose(() => setState('disconnected'))

    try {
      await connection.start()
      connectionRef.current = connection
      setState('connected')
    } catch (err) {
      console.error('SignalR connection failed:', err)
      setState('error')
    }
  }, [])

  const disconnect = useCallback(async () => {
    await connectionRef.current?.stop()
    connectionRef.current = null
    setState('disconnected')
  }, [])

  // ─── Hub method wrappers ───────────────────────────────────────────────────

  const joinRoom = useCallback(
    async (roomId: string, displayName: string): Promise<RoomJoinedEvent> => {
      if (!connectionRef.current) throw new Error('Not connected')
      return connectionRef.current.invoke<RoomJoinedEvent>(
        'JoinRoom',
        roomId,
        displayName
      )
    },
    []
  )

  const getTurnCredentials = useCallback(async (): Promise<TurnCredentials> => {
    if (!connectionRef.current) throw new Error('Not connected')
    return connectionRef.current.invoke<TurnCredentials>('GetTurnCredentials')
  }, [])

  const sendOffer = useCallback(
    async (targetConnectionId: string, sdp: string) => {
      await connectionRef.current?.invoke('SendOffer', targetConnectionId, sdp)
    },
    []
  )

  const sendAnswer = useCallback(
    async (targetConnectionId: string, sdp: string) => {
      await connectionRef.current?.invoke('SendAnswer', targetConnectionId, sdp)
    },
    []
  )

  const sendIceCandidate = useCallback(
    async (
      targetConnectionId: string,
      candidate: string,
      sdpMid: string | null,
      sdpMLineIndex: number | null
    ) => {
      await connectionRef.current?.invoke(
        'SendIceCandidate',
        targetConnectionId,
        candidate,
        sdpMid,
        sdpMLineIndex
      )
    },
    []
  )

  const sendMediaState = useCallback(
    async (audioEnabled: boolean, videoEnabled: boolean) => {
      await connectionRef.current?.invoke('SendMediaState', audioEnabled, videoEnabled)
    },
    []
  )

  useEffect(() => {
    return () => {
      connectionRef.current?.stop()
    }
  }, [])

  return {
    state,
    connect,
    disconnect,
    joinRoom,
    getTurnCredentials,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    sendMediaState,
  }
}

export type SignalingControls = ReturnType<typeof useSignaling>
