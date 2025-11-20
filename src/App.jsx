import { useState } from 'react'
import Lobby from './components/Lobby.jsx'
import GameScreen from './components/GameScreen.jsx'

function App() {
  const [view, setView] = useState('lobby')

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="w-full flex justify-center py-2 text-xs text-zinc-500 gap-3">
        <button
          className={`px-2 py-1 rounded border text-[11px] ${
            view === 'lobby' ? 'border-blue-500 text-blue-300' : 'border-zinc-700'
          }`}
          onClick={() => setView('lobby')}
        >Lobby</button>
        <button
          className={`px-2 py-1 rounded border text-[11px] ${
            view === 'board' ? 'border-blue-500 text-blue-300' : 'border-zinc-700'
          }`}
          onClick={() => setView('board')}
        >Game</button>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        {view === 'lobby' ? <Lobby /> : <GameScreen />}
      </main>
    </div>
  )
}

export default App
