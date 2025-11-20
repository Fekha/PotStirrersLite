import { useState } from 'react'
import Lobby from './components/Lobby.jsx'
import GameScreen from './components/GameScreen.jsx'

function App() {
  const [view, setView] = useState('lobby')
  const [aiColors, setAiColors] = useState([])
  const [onlineGameCode, setOnlineGameCode] = useState(null)

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="w-full flex justify-center py-2 text-xs text-zinc-500 gap-3">
        <button
          className={`px-2 py-1 rounded border text-[11px] ${
            view === 'lobby' ? 'border-blue-500 text-blue-300' : 'border-zinc-700'
          }`}
          onClick={() => {
            setAiColors([])
            setView('lobby')
          }}
        >Lobby</button>
        <button
          className={`px-2 py-1 rounded border text-[11px] ${
            view === 'board' ? 'border-blue-500 text-blue-300' : 'border-zinc-700'
          }`}
          onClick={() => {
            setAiColors([])
            setView('board')
          }}
        >Game</button>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        {view === 'lobby' ? (
          <Lobby
            onStartPassPlay={(aiCount) => {
              // Map a requested number of AI players (0–4) to color names.
              // We keep Red as the default human; Blue/Yellow/Green become AI
              // first, and if aiCount === 4 we also let Red be AI.
              const pool = ['Blue', 'Yellow', 'Green']
              let colors = []
              if (aiCount <= 0) colors = []
              else if (aiCount >= 4) colors = ['Red', ...pool]
              else colors = pool.slice(0, Math.min(aiCount, pool.length))

              setAiColors(colors)
              setOnlineGameCode(null)
              setView('board')
            }}
            onOnlineGameStart={(code) => {
              setOnlineGameCode(code)
              // Online games will drive AI assignment from the game document
              // later; for now, start with no local AI override.
              setAiColors([])
              setView('board')
            }}
          />
        ) : (
          <GameScreen aiColors={aiColors} gameCode={onlineGameCode} />
        )}
      </main>
    </div>
  )
}

export default App
