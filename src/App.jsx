import { useEffect, useState } from 'react'
import Lobby from './components/Lobby.jsx'
import GameScreen from './components/GameScreen.jsx'

function App() {
  const [view, setView] = useState('lobby')
  const [aiColors, setAiColors] = useState([])
  const [onlineGameCode, setOnlineGameCode] = useState(null)
  const [lastOnlineGameCode, setLastOnlineGameCode] = useState(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = window.localStorage.getItem('lastOnlineGameCode')
      if (saved) {
        setLastOnlineGameCode(saved)
      }
    } catch {
      // ignore
    }
  }, [])

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 flex flex-col">
      <main className="flex-1 flex items-center justify-center p-3">
        {view === 'lobby' ? (
          <Lobby
            lastOnlineGameCode={lastOnlineGameCode}
            onRejoinLastGame={() => {
              if (!lastOnlineGameCode) return
              setOnlineGameCode(lastOnlineGameCode)
              setAiColors([])
              setView('board')
            }}
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
              if (typeof window !== 'undefined') {
                try {
                  window.localStorage.setItem('lastOnlineGameCode', code)
                } catch {
                  // ignore
                }
              }
              setLastOnlineGameCode(code)
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
