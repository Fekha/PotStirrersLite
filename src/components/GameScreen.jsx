import { useEffect, useMemo, useState } from 'react'
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
  if (card === null || card === undefined) return null
  if (card === 'Sorry') return null

  // '0' is a special start-only card: it can only be used to leave Start, and
  // has no effect on other pawns. We treat only start pawns as movable.
  if (card === 0) {
    const list = pawnsByColor[color] || []
    const indices = []
    list.forEach((pawn, idx) => {
      if (pawn && pawn.region === 'start') indices.push(idx)
    })
    if (!indices.length) return null
    return { color, indices }
  }

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

  // Slides: if you land on the start of any slide, move to the end and bump
  // anyone along the way (no color restriction). If you land on any square
  // within a slide segment (start, middle, or end), you always slide to the
  // segment's end.
  for (const [, slides] of Object.entries(SLIDES)) {
    for (const s of slides) {
      if (pos >= s.start && pos <= s.end) {
        // Bump pawns only on the remaining slide squares ahead of the
        // landing position.
        for (let i = pos + 1; i <= s.end; i++) {
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
  const [hand, setHand] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(null)

  const currentColor = COLORS[turnIndex]

  const movable = useMemo(() => {
    if (isAnimating || winner) return null
    return getMovableFor(currentCard, currentColor, pawns)
  }, [currentCard, currentColor, pawns, isAnimating, winner])

  // For the currently selected numeric card, pre-compute where each movable
  // pawn would land so the board can show a projection marker.
  const projections = useMemo(() => {
    if (isAnimating || winner) return {}
    if (currentCard === null || currentCard === undefined) return {}
    if (!movable) return {}
    if (currentCard === 'Sorry' || currentCard === 'Oops') return {}

    const color = movable.color
    const indices = movable.indices || []
    const list = pawns[color] || []
    const isZeroCard = currentCard === 0
    const numeric = isZeroCard ? 1 : Number(currentCard)
    if (!numeric) return {}

    const arr = list.map(() => null)
    indices.forEach((idx) => {
      const pawn = list[idx]
      if (!pawn) return
      const frames = getMoveFrames(color, pawn, numeric)
      if (!frames.length) return
      arr[idx] = frames[frames.length - 1]
    })

    return { [color]: arr }
  }, [currentCard, movable, pawns, isAnimating, winner])

  useEffect(() => {
    // Deal an initial shared hand of 3 cards, drawn from the deck.
    setDeck((prev) => {
      let deck = prev.length ? prev : buildDeck()
      const newHand = []
      for (let i = 0; i < 3; i++) {
        if (!deck.length) deck = buildDeck()
        const [top, ...rest] = deck
        newHand.push(top)
        deck = rest
      }
      setHand(newHand)
      return deck
    })
  }, [])

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

  function drawIntoHandSlot(slotIndex) {
    setDeck((prev) => {
      let deck = prev.length ? prev : buildDeck()
      const [top, ...rest] = deck
      setHand((prevHand) => {
        const next = [...prevHand]
        next[slotIndex] = top
        return next
      })
      return rest
    })
  }

  function handleCardSelect(index) {
    if (winner || isAnimating) return
    if (selectedIndex !== null) return
    const card = hand[index]
    if (card == null) return

    const color = currentColor

    // 'Oops' discards the entire hand and deals three new cards for the same
    // player, without ending the turn.
    if (card === 'Oops') {
      pushLog(`${color} played Oops (new hand)`)
      play('draw')
      setDeck((prev) => {
        let deck = prev.length ? prev : buildDeck()
        const newHand = []
        for (let i = 0; i < 3; i++) {
          if (!deck.length) deck = buildDeck()
          const [top, ...rest] = deck
          newHand.push(top)
          deck = rest
        }
        setHand(newHand)
        return deck
      })
      return
    }

    // Lock in the chosen card for this turn.
    setCurrentCard(card)
    setSelectedIndex(index)

    // Sorry is special: it depends on opponent pawns on track.
    if (card === 'Sorry') {
      const canPlay = hasSorryMove(color, pawns)
      if (!canPlay) {
        pushLog(`${color} discarded Sorry (no moves)`)        
        play('draw')
        setCurrentCard(null)
        setSelectedIndex(null)
        drawIntoHandSlot(index)
        advanceTurn()
        return
      }
      pushLog(`${color} selected Sorry`)
      play('draw')
      return
    }

    const moveInfo = getMovableFor(card, color, pawns)
    if (!moveInfo) {
      pushLog(`${color} discarded ${card} (no moves)`)      
      play('draw')
      setCurrentCard(null)
      setSelectedIndex(null)
      drawIntoHandSlot(index)
      advanceTurn()
      return
    }

    // Auto-exit from Start: for 0 if any pawn is in start; for 1 or 2 if the
    // player has no pawns out on the board yet.
    const list = pawns[color] || []
    const hasStart = list.some((p) => p && p.region === 'start')
    const hasOut = list.some((p) => p && (p.region === 'track' || p.region === 'safety'))
    const isOneOrTwo = card === 1 || card === 2
    const shouldAuto = (card === 0 && hasStart) || (isOneOrTwo && hasStart && !hasOut)

    pushLog(`${color} selected ${card}`)
    play('draw')

    if (shouldAuto) {
      const startIdx = list.findIndex((p) => p && p.region === 'start')
      if (startIdx !== -1) {
        // Play the numeric move immediately from this hand slot.
        playNumericOnPawn(card, color, startIdx, index)
      }
    }
  }

  function advanceTurn() {
    setCurrentCard(null)
    setSelectedIndex(null)
    setTurnIndex((i) => (i + 1) % COLORS.length)
  }

  function resetGame() {
    setDeck((prev) => {
      let deck = buildDeck()
      const newHand = []
      for (let i = 0; i < 3; i++) {
        if (!deck.length) deck = buildDeck()
        const [top, ...rest] = deck
        newHand.push(top)
        deck = rest
      }
      setHand(newHand)
      return deck
    })
    setCurrentCard(null)
    setSelectedIndex(null)
    setTurnIndex(0)
    setPawns(initialPawns())
    setWinner(null)
    setIsAnimating(false)
    setLog([])
  }

  function playNumericOnPawn(cardValue, color, pawnIndex, slotIndex) {
    const isZeroCard = cardValue === 0
    const numeric = isZeroCard ? 1 : Number(cardValue)
    if (!numeric) return

    const pawn = pawns[color]?.[pawnIndex]
    if (!pawn) return

    // '0' can only be used to leave Start; it has no effect on other pawns.
    if (isZeroCard && pawn.region !== 'start') return

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
            [color]: prev[color].map((p, i) => (i === pawnIndex ? { ...finalPawn } : { ...p })),
          }

          if (isOnTrack(next[color][pawnIndex])) {
            const bumped = applyBumpsAndSlides(next, color, pawnIndex)
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
        if (typeof slotIndex === 'number') {
          drawIntoHandSlot(slotIndex)
        }
        setSelectedIndex(null)
        setCurrentCard(null)
        advanceTurn()
        return
      }

      const frame = frames[stepIndex]
      setPawns((prev) => ({
        ...prev,
        [color]: prev[color].map((p, i) => (i === pawnIndex ? { ...frame } : { ...p })),
      }))

      setTimeout(() => applyFrame(stepIndex + 1), stepMs)
    }

    applyFrame(0)
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
      if (selectedIndex !== null) {
        drawIntoHandSlot(selectedIndex)
        setSelectedIndex(null)
        setCurrentCard(null)
      }
      advanceTurn()
      return
    }

    // Numeric cards: must click your own pawn with a legal move.
    if (color !== currentColor) return
    playNumericOnPawn(currentCard, color, idx)
  }

  return (
    <div className="w-full max-w-xl mx-auto space-y-3 relative">
      <div className="flex items-center justify-between text-sm">
        <div className="w-20" />
        <div className="flex flex-col items-center flex-1">
          <div className="text-xs text-zinc-400">Current Player</div>
          <div className="font-semibold">{winner || currentColor}</div>
        </div>
        <div className="flex items-center justify-end w-20">
          <button
            type="button"
            onClick={() => setSoundOn((v) => !v)}
            className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-200 hover:bg-zinc-800"
          >
            Sound: {soundOn ? 'On' : 'Off'}
          </button>
        </div>
      </div>
      <div className="flex justify-center gap-3 mt-2">
        {hand.map((card, index) => {
          const isSelected = selectedIndex === index
          const disabled = winner || isAnimating || selectedIndex !== null
          return (
            <button
              key={index}
              type="button"
              onClick={() => handleCardSelect(index)}
              disabled={disabled}
              className={`w-10 h-16 px-1 py-1 rounded border text-xs font-semibold disabled:opacity-40 flex items-center justify-center ${
                isSelected
                  ? 'bg-blue-600 border-blue-300 text-white'
                  : 'bg-zinc-900 border-zinc-600 text-zinc-100'
              }`}
            >
              {card ?? '—'}
            </button>
          )
        })}
      </div>
      <GameBoard
        pawnsByColor={pawns}
        onPawnClick={handlePawnClick}
        activeColor={currentColor}
        movable={movable}
        projections={projections}
      />
      <div className="mt-2 text-xs bg-zinc-900/80 border border-zinc-700 rounded-lg p-2 space-y-0.5 h-32 overflow-y-auto">
        {log.map((entry, i) => (
          <div key={i} className="text-left text-zinc-300">
            {entry}
          </div>
        ))}
      </div>
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
