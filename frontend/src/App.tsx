import { useEffect, useRef, useState } from 'react'
import { ConferenceRoom } from './components/ConferenceRoom'
import { JoinRoom } from './components/JoinRoom'

type AppState =
  | { screen: 'join' }
  | { screen: 'room'; roomId: string; displayName: string }

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => {
    // Pre-fill room ID from ?room=... query parameter so shared links work.
    const params = new URLSearchParams(window.location.search)
    const roomId = params.get('room')?.trim().toUpperCase()
    return roomId ? { screen: 'join', initialRoomId: roomId } as AppState : { screen: 'join' }
  })

  const initialStreamRef = useRef<MediaStream | null>(null)

  // Keep the URL in sync with the current room so the browser back button
  // and copy-paste of the address bar both work correctly.
  useEffect(() => {
    if (appState.screen === 'room') {
      const url = new URL(window.location.href)
      url.searchParams.set('room', appState.roomId)
      window.history.replaceState(null, '', url.toString())
    } else {
      const url = new URL(window.location.href)
      url.searchParams.delete('room')
      window.history.replaceState(null, '', url.toString())
    }
  }, [appState])

  function handleJoin(roomId: string, displayName: string, stream: MediaStream | null) {
    initialStreamRef.current = stream
    setAppState({ screen: 'room', roomId, displayName })
  }

  function handleLeave() {
    initialStreamRef.current = null
    setAppState({ screen: 'join' })
  }

  if (appState.screen === 'room') {
    return (
      <ConferenceRoom
        roomId={appState.roomId}
        displayName={appState.displayName}
        initialStream={initialStreamRef.current}
        onLeave={handleLeave}
      />
    )
  }

  const params = new URLSearchParams(window.location.search)
  const initialRoomId = params.get('room')?.trim().toUpperCase() ?? ''

  return <JoinRoom onJoin={handleJoin} initialRoomId={initialRoomId} />
}
