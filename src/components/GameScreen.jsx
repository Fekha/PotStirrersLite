import { useMemo, useState } from 'react'
import GameBoard from './GameBoard.jsx'
import { SLIDES, HOME_PATHS, BOARD_PATH } from '../constants'

const COLORS = ['Red', 'Blue', 'Yellow', 'Green']

const BASE_DECK = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 'Sorry']

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

function initialPawns() {
  const result = {}
  for (const c of COLORS) {
    result[c] = Array.from({ length: 4 }, () => ({ region: 'start' }))
  }
  return result
}

// Entry indices on the main track when leaving Start.
// These will be used as the entry points into the safety/home lanes.
const START_INDEX = {
  Red: 1,
  Blue: 16,
  Yellow: 31,
  Green: 46,
}

// Chosen entry points from the main loop into each color's safety/home path.
// These are computed as the track cell closest to the first HOME_PATH point
// for that color, so they stay aligned with your board geometry.
const HOME_ENTRY_INDEX = (() => {
  const result = {}
  for (const color of COLORS) {
    const homePath = HOME_PATHS[color]
    if (!homePath || !homePath.length) continue
    const entryTarget = homePath[0]
    let bestIndex = 0
    let bestDist = Number.POSITIVE_INFINITY
    BOARD_PATH.forEach((p, i) => {
      const dx = p.x - entryTarget.x
      const dy = p.y - entryTarget.y
      const d2 = dx * dx + dy * dy
      if (d2 < bestDist) {
        bestDist = d2
        bestIndex = i
      }
    })
    result[color] = bestIndex
  }
  return result
})()

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
    if (canMove) indices.push(idx)
  })

  if (!indices.length) return null
  return { color, indices }
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
  // the index that visually aligns with the start of their home lane
  // (previously HOME_ENTRY_INDEX).
  if (pawn.region === 'start') {
    if (!(steps === 1 || steps === 2)) return { canMove: false, nextPawn: pawn }
    return {
      canMove: true,
      nextPawn: { region: 'track', index: HOME_ENTRY_INDEX[color] },
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
      // Lane entry is the START_INDEX square for that color, which is now
      // distinct from where pawns first leave start.
      if (index === START_INDEX[color]) {
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

  const currentColor = COLORS[turnIndex]

  const movable = useMemo(() => {
    return getMovableFor(currentCard, currentColor, pawns)
  }, [currentCard, currentColor, pawns])

  function drawCard() {
    if (winner) return
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
        return
      }
      setDeck(rest)
      setCurrentCard(top)
      return
    }

    const moveInfo = getMovableFor(top, currentColor, pawns)

    // If there are no legal moves for this card, automatically skip to next player.
    if (!moveInfo) {
      setDeck(rest)
      setCurrentCard(null)
      setTurnIndex((i) => (i + 1) % COLORS.length)
      return
    }

    setDeck(rest)
    setCurrentCard(top)
  }

  function advanceTurn() {
    setCurrentCard(null)
    setTurnIndex((i) => (i + 1) % COLORS.length)
  }

  function handlePawnClick(color, idx) {
    if (!currentCard || winner) return

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
        if (w) setWinner(w)
        return next
      })

      advanceTurn()
      return
    }

    // Numeric cards: must click your own pawn with a legal move.
    if (color !== currentColor) return
    const numeric = Number(currentCard)
    if (!numeric) return

    const { canMove, nextPawn } = simulateMove(color, pawn, numeric)
    if (!canMove) return

    setPawns((prev) => {
      const next = {
        ...prev,
        [color]: prev[color].map((p) => ({ ...p })),
      }
      next[color][idx] = { ...nextPawn }

      // Only track-region pawns can bump/slide.
      if (isOnTrack(next[color][idx])) {
        const bumped = applyBumpsAndSlides(next, color, idx)
        const w = getWinner(bumped)
        if (w) setWinner(w)
        return bumped
      }
      const w = getWinner(next)
      if (w) setWinner(w)
      return next
    })

    advanceTurn()
  }

  return (
    <div className="w-full max-w-xl mx-auto space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div>
          <div className="text-xs text-zinc-400">Current Player</div>
          <div className="font-semibold">{winner || currentColor}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-400">Card</div>
          <div className="text-xl font-bold min-w-[3rem] text-right">
            {currentCard ?? '—'}
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
    </div>
  )
}
