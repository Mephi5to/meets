import { useState } from 'react'
import { ConferenceRoom } from './components/ConferenceRoom'
import { JoinRoom } from './components/JoinRoom'

type AppState =
  | { screen: 'join' }
  | { screen: 'room'; roomId: string; displayName: string }

export default function App() {
  const [appState, setAppState] = useState<AppState>({ screen: 'join' })

  function handleJoin(roomId: string, displayName: string) {
    setAppState({ screen: 'room', roomId, displayName })
  }

  function handleLeave() {
    setAppState({ screen: 'join' })
  }

  if (appState.screen === 'room') {
    return (
      <ConferenceRoom
        roomId={appState.roomId}
        displayName={appState.displayName}
        onLeave={handleLeave}
      />
    )
  }

  return <JoinRoom onJoin={handleJoin} />
}
