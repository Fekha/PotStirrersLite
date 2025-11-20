import { useEffect, useMemo, useState } from 'react'
import { auth, db, hasFirebase } from '../firebase'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

function pad4(n) {
  return String(n).padStart(4, '0')
}

function randomCode() {
  return pad4(Math.floor(Math.random() * 10000))
}

export default function Lobby() {
  const [user, setUser] = useState(null)
  const [mode, setMode] = useState('home')
  const [code, setCode] = useState('')
  const [game, setGame] = useState(null)
  const [isHost, setIsHost] = useState(false)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!hasFirebase || !auth) return
    const unsub = onAuthStateChanged(auth, (u) => setUser(u))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!hasFirebase || !auth) return
    if (!user) signInAnonymously(auth).catch(() => {})
  }, [user])

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
        { uid: user.uid, name: 'Host', joinedAt: serverTimestamp() },
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
    await runTransaction(db, async (trx) => {
      const snap = await trx.get(gameRef)
      if (!snap.exists()) throw new Error('No such game')
      const data = snap.data()
      const has = (data.players || []).some((p) => p.uid === user.uid)
      const players = has
        ? data.players
        : [...(data.players || []), { uid: user.uid, name: 'Guest', joinedAt: serverTimestamp() }]
      trx.update(gameRef, { players })
    })
    setMode('guest')
    subscribe(code)
    setJoining(false)
  }

  async function startGame() {
    if (!hasFirebase || !game || !isHost || !gamesRef) return
    const gameRef = doc(gamesRef, game.code)
    await updateDoc(gameRef, { status: 'started' })
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
          </div>
        )}

        {mode === 'host' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-zinc-400 text-sm">Room Code</div>
              <div className="text-6xl font-extrabold tracking-widest tabular-nums">{code}</div>
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
            <button
              disabled={(game?.players?.length || 0) < 2}
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
