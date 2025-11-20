import { useMemo, useState } from 'react'
import GameBoard from './GameBoard.jsx'
import { SLIDES } from '../constants'

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
    result[c] = Array.from({ length: 4 }, () => ({ position: 'start' }))
  }
  return result
}

// Entry indices on the main track when leaving Start.
// These are aligned with the visually highlighted squares on the perimeter.
const START_INDEX = {
  Red: 1,
  Blue: 16,
  Yellow: 31,
  Green: 46,
}

function getMovableFor(card, color, pawnsByColor) {
  if (!card) return null
  if (card === 'Sorry') return null

  const list = pawnsByColor[color] || []
  const numeric = Number(card)
  if (!numeric) return null

  const indices = []

  list.forEach((pawn, idx) => {
    if (pawn.position === 'start') {
      if (numeric === 1 || numeric === 2) indices.push(idx)
      return
    }
    if (typeof pawn.position === 'number') indices.push(idx)
  })

  if (!indices.length) return null
  return { color, indices }
}

function hasSorryMove(color, pawnsByColor) {
  const mine = pawnsByColor[color] || []
  const hasStart = mine.some((p) => p.position === 'start')
  if (!hasStart) return false

  // Need at least one opponent pawn on the track
  for (const c of COLORS) {
    if (c === color) continue
    const list = pawnsByColor[c] || []
    if (list.some((p) => typeof p.position === 'number')) return true
  }
  return false
}

function applyBumpsAndSlides(state, color, pawnIndex) {
  const pawn = state[color][pawnIndex]
  if (!pawn || typeof pawn.position !== 'number') return state

  let pos = pawn.position

  // Bump any pawn already on landing square
  for (const c of COLORS) {
    const list = state[c]
    list.forEach((otherPawn, idx) => {
      if (c === color && idx === pawnIndex) return
      if (otherPawn.position === pos) {
        otherPawn.position = 'start'
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
              if (otherPawn.position === i) {
                otherPawn.position = 'start'
              }
            })
          }
        }
        pawn.position = s.end
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

  const currentColor = COLORS[turnIndex]

  const movable = useMemo(() => {
    return getMovableFor(currentCard, currentColor, pawns)
  }, [currentCard, currentColor, pawns])

  function drawCard() {
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
    if (!currentCard) return

    // Snapshot of current state to decide if this click is a legal move.
    const pawn = pawns[color]?.[idx]
    if (!pawn) return

    // Sorry: must click an opponent pawn on the track, while you have a start pawn.
    if (currentCard === 'Sorry') {
      if (color === currentColor) return
      if (pawn.position === 'start') return

      const myList = pawns[currentColor]
      if (!myList) return
      const startIdx = myList.findIndex((p) => p.position === 'start')
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
        if (!oppPawn || !myStartPawn || oppPawn.position === 'start') return prev

        const targetPos = oppPawn.position
        oppPawn.position = 'start'
        myStartPawn.position = targetPos
        return next
      })

      advanceTurn()
      return
    }

    // Numeric cards: must click your own pawn with a legal move.
    if (color !== currentColor) return
    const numeric = Number(currentCard)
    if (!numeric) return

    const fromStart = pawn.position === 'start'
    const fromTrack = typeof pawn.position === 'number'

    if (!fromStart && !fromTrack) return

    // Check legality: from start only for 1 or 2.
    if (fromStart && !(numeric === 1 || numeric === 2)) return

    setPawns((prev) => {
      const next = {
        ...prev,
        [color]: prev[color].map((p) => ({ ...p })),
      }
      const p = next[color][idx]
      if (!p) return prev

      if (fromStart) {
        p.position = START_INDEX[color]
      } else if (fromTrack) {
        p.position = (p.position + numeric) % 60
      }

      return applyBumpsAndSlides(next, color, idx)
    })

    advanceTurn()
  }

  return (
    <div className="w-full max-w-xl mx-auto space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div>
          <div className="text-xs text-zinc-400">Current Player</div>
          <div className="font-semibold">{currentColor}</div>
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
        disabled={!!currentCard}
      >
        {currentCard ? 'Play a pawn' : 'Draw Card'}
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
