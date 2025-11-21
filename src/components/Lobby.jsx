import { useEffect, useMemo, useState } from 'react'
import { auth, db, hasFirebase } from '../firebase'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc, arrayUnion } from 'firebase/firestore'
import { COLORS, BASE_DECK } from '../constants'

function pad4(n) {
  return String(n).padStart(4, '0')
}

function randomCode() {
  return pad4(Math.floor(Math.random() * 10000))
}

function buildInitialDeck() {
  const deck = []
  for (let i = 0; i < 4; i++) deck.push(...BASE_DECK)
  const a = [...deck]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Lobby({ onStartPassPlay, onOnlineGameStart }) {
  const [user, setUser] = useState(null)
  const [mode, setMode] = useState('home')
  const [code, setCode] = useState('')
  const [game, setGame] = useState(null)
  const [isHost, setIsHost] = useState(false)
  const [joining, setJoining] = useState(false)
  const [aiCount, setAiCount] = useState(0)

  useEffect(() => {
    if (!hasFirebase || !auth) return
    const unsub = onAuthStateChanged(auth, (u) => setUser(u))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!hasFirebase || !auth) return
    if (!user) signInAnonymously(auth).catch(() => {})
  }, [user])

  // If we're a guest in a lobby and the host starts the game (status changes
  // to 'started'), automatically transition into the online GameScreen.
  useEffect(() => {
    if (!game || !onOnlineGameStart) return
    if (mode !== 'guest') return
    if (game.status === 'started') {
      onOnlineGameStart(game.code)
    }
  }, [game, mode, onOnlineGameStart])

  const gamesRef = useMemo(() => (db ? collection(db, 'games') : null), [])

  async function createGame() {
    if (!hasFirebase || !user || !gamesRef) return
    const newCode = randomCode()
    const gameRef = doc(gamesRef, newCode)
    await setDoc(gameRef, {
      createdAt: serverTimestamp(),
      host: user.uid,
      code: newCode,
      status: 'lobby',
      players: [
        // Firestore doesn't allow serverTimestamp() inside arrays; use a
        // simple client-side timestamp instead.
        { uid: user.uid, name: 'Host', joinedAt: Date.now() },
      ],
    }, { merge: true })
    setIsHost(true)
    setMode('host')
    setCode(newCode)
    subscribe(newCode)
  }

  async function subscribe(c) {
    if (!hasFirebase || !gamesRef) return () => {}
    const gameRef = doc(gamesRef, c)
    return onSnapshot(gameRef, (snap) => {
      if (snap.exists()) setGame({ id: snap.id, ...snap.data() })
      else setGame(null)
    })
  }

  async function joinGame() {
    if (!hasFirebase || !user || !gamesRef || code.length !== 4) return
    setJoining(true)
    const gameRef = doc(gamesRef, code)
    // Use arrayUnion to add this user to the players array. This keeps the
    // write simple and lets Firestore handle concurrency.
    await updateDoc(gameRef, {
      players: arrayUnion({ uid: user.uid, name: 'Guest', joinedAt: Date.now() }),
    }).catch((err) => {
      console.error('joinGame update failed', err)
      throw err
    })
    console.log('Joined game as guest', code, user.uid)
    setMode('guest')
    subscribe(code)
    setJoining(false)
  }

  async function startGame() {
    if (!hasFirebase || !game || !isHost || !gamesRef) return
    const gameRef = doc(gamesRef, game.code)
    const players = game.players || []
    const hostUid = game.host
    const hostPlayer = players.find((p) => p.uid === hostUid) || players[0]
    const others = players.filter((p) => !hostPlayer || p.uid !== hostPlayer.uid)
    const orderedPlayers = [hostPlayer, ...others.sort((a, b) => (a.uid || '').localeCompare(b.uid || ''))].filter(
      Boolean
    )

    const seats = COLORS.map((color, index) => {
      const player = orderedPlayers[index]
      if (player) {
        return {
          color,
          uid: player.uid,
          name: player.name || null,
          isAI: false,
        }
      }
      // Fill remaining seats with AI players.
      return {
        color,
        uid: null,
        name: null,
        isAI: true,
      }
    })

    // Build a shared initial game state so all clients start from the same
    // pawns, deck, and hand.
    const initialPawns = {}
    for (const color of COLORS) {
      initialPawns[color] = Array.from({ length: 4 }, () => ({ region: 'start' }))
    }
    const fullDeck = buildInitialDeck()
    const hand = fullDeck.slice(0, 3)
    const deck = fullDeck.slice(3)

    const state = {
      pawns: initialPawns,
      deck,
      hand,
      turnIndex: 0,
      winner: null,
    }

    await updateDoc(gameRef, { status: 'started', seats, state })
    // Notify the parent App so it can switch to the online GameScreen
    // for this room code.
    if (onOnlineGameStart) onOnlineGameStart(game.code)
  }

  function press(n) {
    if (code.length >= 4) return
    setCode((s) => (s + n).slice(0, 4))
  }

  function back() {
    setCode((s) => s.slice(0, -1))
  }

  return (
    <div className="min-h-dvh w-full flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {mode === 'home' && (
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-center">PotStirrers</h1>
            <div className="grid grid-cols-2 gap-3">
              <button className="py-3 rounded bg-blue-600 text-white" onClick={createGame}>Create Game</button>
              <button className="py-3 rounded bg-zinc-800 text-white" onClick={() => setMode('join')}>Join Game</button>
            </div>
            <div className="mt-2 rounded border border-zinc-800 p-3 space-y-3">
              <button
                type="button"
                className="w-full py-2 rounded bg-green-700 text-white hover:bg-green-600 text-sm font-medium"
                onClick={() => onStartPassPlay && onStartPassPlay(aiCount)}
              >
                Pass &amp; Play
              </button>
              <div className="flex items-center justify-center gap-3 text-xs text-zinc-200">
                <button
                  type="button"
                  className="w-7 h-7 flex items-center justify-center rounded bg-zinc-800 text-lg leading-none"
                  onClick={() => setAiCount((n) => Math.max(0, n - 1))}
                >
                  −
                </button>
                <div className="flex flex-col items-center">
                  <span className="uppercase tracking-wide text-[10px] text-zinc-400">Number of AI Players</span>
                  <span className="text-sm font-semibold">{aiCount}</span>
                </div>
                <button
                  type="button"
                  className="w-7 h-7 flex items-center justify-center rounded bg-zinc-800 text-lg leading-none"
                  onClick={() => setAiCount((n) => Math.min(4, n + 1))}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === 'host' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-zinc-400 text-sm">Room Code</div>
              <div className="text-6xl font-extrabold tracking-widest tabular-nums">{code}</div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="font-semibold mb-2">
                Waiting Room ({(game?.players?.length || 0)}/4)
              </div>
              <ul className="space-y-1">
                {(game?.players || []).map((p) => (
                  <li key={p.uid} className="flex items-center justify-between">
                    <span className="truncate">{p.name || p.uid.slice(0, 6)}</span>
                    <span className="text-xs text-zinc-500">joined</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              disabled={!game || !isHost}
              className="w-full py-3 rounded bg-green-600 text-white disabled:opacity-50"
              onClick={startGame}
            >Start Game</button>
          </div>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-sm text-zinc-400">Enter Room Code</div>
              <div className="text-4xl font-bold tracking-widest tabular-nums">{code.padEnd(4, '•')}</div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[1,2,3,4,5,6,7,8,9,'←',0,'✓'].map((k) => (
                <button
                  key={k}
                  className="aspect-square rounded bg-zinc-800 text-white text-2xl"
                  onClick={() => {
                    if (k === '←') back()
                    else if (k === '✓') joinGame()
                    else press(k)
                  }}
                >{k}</button>
              ))}
            </div>
            <button className="w-full py-3 rounded bg-zinc-700 text-white" onClick={() => { setCode(''); setMode('home') }}>Back</button>
            <button disabled={joining || code.length !== 4} className="w-full py-3 rounded bg-blue-600 text-white disabled:opacity-50" onClick={joinGame}>Join</button>
          </div>
        )}

        {mode === 'guest' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-sm text-zinc-400">Joined Room</div>
              <div className="text-3xl font-bold">{game?.code}</div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="font-semibold mb-2">Waiting Room</div>
              <ul className="space-y-1">
                {(game?.players || []).map((p) => (
                  <li key={p.uid} className="flex items-center justify-between">
                    <span className="truncate">{p.name || p.uid.slice(0, 6)}</span>
                    <span className="text-xs text-zinc-500">joined</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-center text-sm text-zinc-400">Waiting for host to start…</div>
          </div>
        )}
      </div>
    </div>
  )
}
