import { useMemo, useState } from 'react'
import GameBoard from './GameBoard.jsx'
import { SLIDES, HOME_PATHS, BOARD_PATH, START_INDEX, COLORS, BASE_DECK, HOME_ENTRY_INDEX } from '../constants'

function buildDeck() {
  const deck = []
  for (let i = 0; i < 4; i++) deck.push(...BASE_DECK)
  return shuffle(deck)
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

let audioCtx

function getAudioCtx() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    audioCtx = new AC()
  }
  return audioCtx
}

function playBeep(type) {
  const ctx = getAudioCtx()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  let freq = 440
  let duration = 0.12

  if (type === 'draw') freq = 520
  else if (type === 'move') freq = 640
  else if (type === 'sorry') freq = 420
  else if (type === 'win') {
    freq = 700
    duration = 0.25
  }

  const now = ctx.currentTime
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, now)

  gain.gain.setValueAtTime(0.001, now)
  gain.gain.linearRampToValueAtTime(0.22, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + duration + 0.05)
}

function initialPawns() {
  const result = {}
  for (const c of COLORS) {
    result[c] = Array.from({ length: 4 }, () => ({ region: 'start' }))
  }
  return result
}

function isOnTrack(pawn) {
  return pawn?.region === 'track' && typeof pawn.index === 'number'
}

function isInStart(pawn) {
  return pawn?.region === 'start'
}

function getMovableFor(card, color, pawnsByColor) {
  if (!card) return null
  if (card === 'Sorry') return null

  const list = pawnsByColor[color] || []
  const numeric = Number(card)
  if (!numeric) return null

  const indices = []

  list.forEach((pawn, idx) => {
    const { canMove } = simulateMove(color, pawn, numeric)
    if (!canMove) return

    const frames = getMoveFrames(color, pawn, numeric)
    if (!frames.length) return

    // Home lane rule: you cannot land on (or pass through) a square in your
    // own safety/home path that is already occupied by one of your pawns.
    const blocked = frames.some((frame) => {
      if (!(frame.region === 'safety' || frame.region === 'home')) return false
      return list.some((other, j) => {
        if (j === idx) return false
        if (!(other && (other.region === 'safety' || other.region === 'home'))) return false
        if (typeof other.safetyIndex !== 'number') return false
        return other.safetyIndex === frame.safetyIndex
      })
    })

    if (!blocked) indices.push(idx)
  })

  if (!indices.length) return null
  return { color, indices }
}

// Build the sequence of pawn states for each individual step of a legal
// numeric move, so we can animate along the path (track + safety/home).
function getMoveFrames(color, pawn, steps) {
  const frames = []
  if (!pawn || steps <= 0) return frames

  // From start we just jump onto the track entry square; that's a single
  // visible step, regardless of card value (1 or 2).
  if (pawn.region === 'start') {
    frames.push({ region: 'track', index: START_INDEX[color] })
    return frames
  }

  let region = pawn.region
  let index = pawn.index
  let safetyIndex = pawn.safetyIndex ?? 0
  const homePath = HOME_PATHS[color]
  const lastSafety = homePath.length - 1

  for (let i = 0; i < steps; i++) {
    if (region === 'track') {
      if (index === HOME_ENTRY_INDEX[color]) {
        region = 'safety'
        index = undefined
        safetyIndex = 0
      } else {
        index = ((index ?? 0) + 1) % 60
      }
    } else if (region === 'safety') {
      safetyIndex += 1
    } else {
      break
    }

    if (region === 'track') {
      frames.push({ region: 'track', index })
    } else if (region === 'safety') {
      frames.push({ region: 'safety', safetyIndex })
    }
  }

  // If we ended up exactly on the last safety index, that step is really
  // "home" in the game logic.
  if (frames.length && homePath && homePath.length) {
    const last = frames[frames.length - 1]
    if (last.region === 'safety' && last.safetyIndex === lastSafety) {
      frames[frames.length - 1] = { region: 'home', safetyIndex: lastSafety }
    }
  }

  return frames
}

function hasSorryMove(color, pawnsByColor) {
  const mine = pawnsByColor[color] || []
  const hasStart = mine.some(isInStart)
  if (!hasStart) return false

  // Need at least one opponent pawn on the track
  for (const c of COLORS) {
    if (c === color) continue
    const list = pawnsByColor[c] || []
    if (list.some(isOnTrack)) return true
  }
  return false
}

// Simulate moving a pawn forward a given number of steps, including
// entering its safety/home path. Does not apply bumps or slides.
function simulateMove(color, pawn, steps) {
  if (!pawn || steps <= 0) return { canMove: false, nextPawn: pawn }

  // Already home: cannot move.
  if (pawn.region === 'home') return { canMove: false, nextPawn: pawn }

  // Start region: only 1 or 2 can leave. Pawns leave start onto the track at
  // START_INDEX[color], which you can tweak in constants.js.
  if (pawn.region === 'start') {
    if (!(steps === 1 || steps === 2)) return { canMove: false, nextPawn: pawn }
    return {
      canMove: true,
      nextPawn: { region: 'track', index: START_INDEX[color] },
    }
  }

  // Clone pawn to avoid mutating original during simulation.
  let region = pawn.region
  let index = pawn.index
  let safetyIndex = pawn.safetyIndex ?? 0
  const homePath = HOME_PATHS[color]
  const lastSafety = homePath.length - 1

  for (let i = 0; i < steps; i++) {
    if (region === 'track') {
      // If we're at the lane entry, step into the first safety cell.
      // Lane entry is the HOME_ENTRY_INDEX square for that color.
      if (index === HOME_ENTRY_INDEX[color]) {
        region = 'safety'
        index = undefined
        safetyIndex = 0
        continue
      }
      index = ((index ?? 0) + 1) % 60
    } else if (region === 'safety') {
      if (safetyIndex >= lastSafety) {
        // Would overshoot home; illegal move.
        return { canMove: false, nextPawn: pawn }
      }
      safetyIndex += 1
    } else {
      // Any other region is not movable here.
      return { canMove: false, nextPawn: pawn }
    }
  }

  // If we ended on the last safety index, mark as home.
  if (region === 'safety' && safetyIndex === lastSafety) {
    return { canMove: true, nextPawn: { region: 'home', safetyIndex } }
  }

  if (region === 'track') {
    return { canMove: true, nextPawn: { region: 'track', index } }
  }

  // Still somewhere in safety path.
  if (region === 'safety') {
    return { canMove: true, nextPawn: { region: 'safety', safetyIndex } }
  }

  return { canMove: false, nextPawn: pawn }
}

function getWinner(pawns) {
  for (const color of COLORS) {
    const list = pawns[color] || []
    if (list.length && list.every((p) => p && p.region === 'home')) {
      return color
    }
  }
  return null
}

function applyBumpsAndSlides(state, color, pawnIndex) {
  const pawn = state[color][pawnIndex]
  if (!pawn || !isOnTrack(pawn)) return state

  let pos = pawn.index

  // Bump any pawn already on landing square
  for (const c of COLORS) {
    const list = state[c]
    list.forEach((otherPawn, idx) => {
      if (c === color && idx === pawnIndex) return
      if (isOnTrack(otherPawn) && otherPawn.index === pos) {
        otherPawn.region = 'start'
        delete otherPawn.index
      }
    })
  }

  // Slides: if you land on the start of a slide that isn't your color, move to the end
  // and bump anyone along the way.
  for (const [slideColor, slides] of Object.entries(SLIDES)) {
    for (const s of slides) {
      if (pos === s.start && slideColor !== color) {
        for (let i = s.start + 1; i <= s.end; i++) {
          for (const c of COLORS) {
            const list = state[c]
            list.forEach((otherPawn, idx) => {
              if (c === color && idx === pawnIndex) return
              if (isOnTrack(otherPawn) && otherPawn.index === i) {
                otherPawn.region = 'start'
                delete otherPawn.index
              }
            })
          }
        }
        pawn.index = s.end
        pos = s.end
        return state
      }
    }
  }

  return state
}

export default function GameScreen() {
  const [deck, setDeck] = useState(() => buildDeck())
  const [currentCard, setCurrentCard] = useState(null)
  const [turnIndex, setTurnIndex] = useState(0)
  const [pawns, setPawns] = useState(() => initialPawns())
  const [winner, setWinner] = useState(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [log, setLog] = useState([])

  const currentColor = COLORS[turnIndex]

  const movable = useMemo(() => {
    return getMovableFor(currentCard, currentColor, pawns)
  }, [currentCard, currentColor, pawns])

  function pushLog(entry) {
    setLog((prev) => {
      const next = [`${entry}`, ...prev]
      return next.slice(0, 7)
    })
  }

  function play(type) {
    if (!soundOn) return
    playBeep(type)
  }

  function setWinnerAndLog(color) {
    setWinner(color)
    pushLog(`${color} wins!`)
    play('win')
  }

  function drawCard() {
    if (winner || isAnimating) return
    if (currentCard) return
    if (!deck.length) setDeck(buildDeck())
    const d = deck.length ? deck : buildDeck()
    const [top, ...rest] = d
    if (top === 'Sorry') {
      const canPlaySorry = hasSorryMove(currentColor, pawns)
      if (!canPlaySorry) {
        setDeck(rest)
        setCurrentCard(null)
        setTurnIndex((i) => (i + 1) % COLORS.length)
        pushLog(`${currentColor} drew Sorry (no move)`)        
        return
      }
      setDeck(rest)
      setCurrentCard(top)
      pushLog(`${currentColor} drew Sorry`)
      play('draw')
      return
    }

    const moveInfo = getMovableFor(top, currentColor, pawns)

    // If there are no legal moves for this card, automatically skip to next player.
    if (!moveInfo) {
      setDeck(rest)
      setCurrentCard(null)
      setTurnIndex((i) => (i + 1) % COLORS.length)
      pushLog(`${currentColor} drew ${top} (no moves)`)      
      return
    }

    setDeck(rest)
    setCurrentCard(top)
    pushLog(`${currentColor} drew ${top}`)
    play('draw')
  }

  function advanceTurn() {
    setCurrentCard(null)
    setTurnIndex((i) => (i + 1) % COLORS.length)
  }

  function resetGame() {
    setDeck(buildDeck())
    setCurrentCard(null)
    setTurnIndex(0)
    setPawns(initialPawns())
    setWinner(null)
    setLog([])
  }

  function handlePawnClick(color, idx) {
    if (!currentCard || winner || isAnimating) return

    // Snapshot of current state to decide if this click is a legal move.
    const pawn = pawns[color]?.[idx]
    if (!pawn) return

    // Sorry: must click an opponent pawn on the track, while you have a start pawn.
    if (currentCard === 'Sorry') {
      if (color === currentColor) return
      if (!isOnTrack(pawn)) return

      const myList = pawns[currentColor]
      if (!myList) return
      const startIdx = myList.findIndex(isInStart)
      if (startIdx === -1) return

      // Now we know the click is a valid Sorry move; apply it and advance turn.
      setPawns((prev) => {
        const next = {
          ...prev,
          [color]: prev[color].map((p) => ({ ...p })),
          [currentColor]: prev[currentColor].map((p) => ({ ...p })),
        }
        const oppPawn = next[color][idx]
        const myStartPawn = next[currentColor][startIdx]
        if (!oppPawn || !myStartPawn || !isOnTrack(oppPawn)) return prev

        const targetPos = oppPawn.index
        oppPawn.region = 'start'
        delete oppPawn.index
        myStartPawn.region = 'track'
        myStartPawn.index = targetPos
        const w = getWinner(next)
        if (w) setWinnerAndLog(w)
        return next
      })

      pushLog(`${currentColor} played Sorry on ${color}`)
      play('sorry')
      advanceTurn()
      return
    }

    // Numeric cards: must click your own pawn with a legal move.
    if (color !== currentColor) return
    const numeric = Number(currentCard)
    if (!numeric) return

    const { canMove } = simulateMove(color, pawn, numeric)
    if (!canMove) return

    const frames = getMoveFrames(color, pawn, numeric)
    if (!frames.length) return

    setIsAnimating(true)

    const stepMs = 220

    function applyFrame(stepIndex) {
      if (stepIndex >= frames.length) {
        // After the last step, apply bumps/slides and winner detection once,
        // then advance the turn and clear animation state.
        setPawns((prev) => {
          const finalPawn = frames[frames.length - 1]
          const next = {
            ...prev,
            [color]: prev[color].map((p, i) => (i === idx ? { ...finalPawn } : { ...p })),
          }

          if (isOnTrack(next[color][idx])) {
            const bumped = applyBumpsAndSlides(next, color, idx)
            const w = getWinner(bumped)
            if (w) setWinnerAndLog(w)
            return bumped
          }
          const w = getWinner(next)
          if (w) setWinnerAndLog(w)
          return next
        })

        setIsAnimating(false)
        play('move')
        pushLog(`${color} moved ${numeric}`)
        advanceTurn()
        return
      }

      const frame = frames[stepIndex]
      setPawns((prev) => ({
        ...prev,
        [color]: prev[color].map((p, i) => (i === idx ? { ...frame } : { ...p })),
      }))

      setTimeout(() => applyFrame(stepIndex + 1), stepMs)
    }

    applyFrame(0)
  }

  return (
    <div className="w-full max-w-xl mx-auto space-y-3 relative">
      <div className="flex items-center justify-between text-sm">
        <div>
          <div className="text-xs text-zinc-400">Current Player</div>
          <div className="font-semibold">{winner || currentColor}</div>
        </div>
        <div className="flex items-center gap-4 text-right">
          <button
            type="button"
            onClick={() => setSoundOn((v) => !v)}
            className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-200 hover:bg-zinc-800"
          >
            Sound: {soundOn ? 'On' : 'Off'}
          </button>
          <div>
            <div className="text-xs text-zinc-400">Card</div>
            <div className="text-xl font-bold min-w-[3rem] text-right">
              {currentCard ?? '—'}
            </div>
          </div>
        </div>
      </div>
      <button
        className="w-full py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        onClick={drawCard}
        disabled={!!currentCard || !!winner}
      >
        {winner ? `Winner: ${winner}` : currentCard ? 'Play a pawn' : 'Draw Card'}
      </button>
      <GameBoard
        pawnsByColor={pawns}
        onPawnClick={handlePawnClick}
        activeColor={currentColor}
        movable={movable}
      />
      {log.length > 0 && (
        <div className="mt-2 text-xs bg-zinc-900/80 border border-zinc-700 rounded-lg p-2 space-y-0.5 max-h-32 overflow-y-auto">
          {log.map((entry, i) => (
            <div key={i} className="text-left text-zinc-300">
              {entry}
            </div>
          ))}
        </div>
      )}
      {winner && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto bg-zinc-900/95 border border-zinc-700 rounded-2xl px-6 py-4 shadow-xl text-center space-y-2">
            <div className="text-xs uppercase tracking-wide text-zinc-400">Game Over</div>
            <div className="text-lg font-semibold">{winner} wins!</div>
            <button
              onClick={resetGame}
              className="mt-2 inline-flex items-center justify-center px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-500"
            >
              Play again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
