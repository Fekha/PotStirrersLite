import { useEffect, useMemo, useRef, useState } from 'react'
import GameBoard from './GameBoard.jsx'
import { SLIDES, HOME_PATHS, BOARD_PATH, START_INDEX, COLORS, BASE_DECK, HOME_ENTRY_INDEX, TRACK_LENGTH } from '../constants'
import {
  isOnTrack,
  isInStart,
  getMovableFor as aiGetMovableFor,
  hasSorryMove,
  getTrackSlideInfo,
  computeThreatAgainst,
  chooseAiNumericPlay,
  chooseAiSorryPlay,
  chooseAiSwapPlay,
} from '../aiLogic'
import { auth, db, hasFirebase } from '../firebase'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'

const COLOR_TEXT = {
  Red: 'text-red-300',
  Blue: 'text-sky-300',
  Yellow: 'text-yellow-300',
  Green: 'text-emerald-300',
}

const COLOR_NAMES = Object.keys(COLOR_TEXT)

function renderColoredLogText(text) {
  if (!text) return null
  const pattern = new RegExp(`\\b(${COLOR_NAMES.join('|')})\\b`, 'g')
  const parts = []
  let lastIndex = 0
  let match
  let key = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const colorName = match[1]
    const colorClass = COLOR_TEXT[colorName] || 'text-zinc-200'
    parts.push(
      <span key={`c-${key++}`} className={`${colorClass} font-semibold`}>
        {colorName}
      </span>,
    )
    lastIndex = match.index + colorName.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

function getCardInfo(card) {
  if (card === 'Shuffle') {
    return 'Discard the entire hand and draw three new cards and reverse the direction of play.'
  }
  if (card === 'Swap') {
    return 'Swap the positions of one of your pawns on the track with an opponent pawn on the track.'
  }
  if (card === 'Sorry') {
    return 'Move a pawn from your Start onto the track, bumping an opponent pawn on the track back to their Start.'
  }
  if (card === 0) {
    return 'Move a pawn from Start onto the track. It does not move pawns already on the track.'
  }
  if (card === -1) {
    return 'Move one of your pawns on the track backward 1 space, or move a pawn from Start onto the track.'
  }
  if (card === -6) {
    return 'Move one of your pawns on the track backward 6 spaces, or move a pawn from Start onto the track.'
  }
  if (typeof card === 'number') {
    if (card > 0 && card < 3) {
      return `Move a pawn on the track forward ${card} spaces, or move a pawn from Start onto the track.`
    }
    return `Move a pawn on the track forward ${card} spaces.`
  }
  return 'Special card.'
}

function formatCardFace(card) {
  if (card == null) return '—'
  if (typeof card === 'number' && card <= 2) {
    // Any numeric card less than or equal to 2 (including backward cards like
    // -1 and -6) can be used to leave Start, so we mark it with a '*'.
    return `${card}*`
  }
  return String(card)
}

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
  } else if (type === 'turn' || type === 'onlineTurn') {
    // Unified turn chime for both local and online games.
    freq = 760
    duration = 0.22
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

// Adapter so the rest of GameScreen can call getMovableFor with the simpler
// signature while the underlying logic lives in aiLogic and expects
// simulateMove/getMoveFrames.
function getMovableFor(card, color, pawnsByColor) {
  return aiGetMovableFor(card, color, pawnsByColor, simulateMove, getMoveFrames)
}

// Build the sequence of pawn states for each individual step of a legal
// numeric move, so we can animate along the path (track + safety/home).
function getMoveFrames(color, pawn, steps) {
  const frames = []
  if (!pawn || steps === 0) return frames

  // From start we just jump onto the track entry square; that's a single
  // visible step for any non-zero move that is allowed to leave Start.
  if (pawn.region === 'start') {
    if (steps !== 0) {
      frames.push({ region: 'track', index: START_INDEX[color] })
    }
    return frames
  }

  const dir = steps > 0 ? 1 : -1
  const count = Math.abs(steps)

  let region = pawn.region
  let index = pawn.index
  let safetyIndex = pawn.safetyIndex ?? 0
  const homePath = HOME_PATHS[color]
  const lastSafety = homePath.length - 1

  for (let i = 0; i < count; i++) {
    if (region === 'track') {
      if (dir > 0) {
        if (index === HOME_ENTRY_INDEX[color]) {
          region = 'safety'
          index = undefined
          safetyIndex = 0
        } else {
          index = ((index ?? 0) + 1) % TRACK_LENGTH
        }
      } else {
        index = ((index ?? 0) + TRACK_LENGTH - 1) % TRACK_LENGTH
      }
    } else if (region === 'safety') {
      if (dir > 0) {
        safetyIndex += 1
      } else {
        break
      }
    } else {
      break
    }

    if (region === 'track') {
      frames.push({ region: 'track', index })
    } else if (region === 'safety') {
      frames.push({ region: 'safety', safetyIndex })
    }
  }

  return frames
}

// Simulate moving a pawn forward a given number of steps, including
// entering its safety/home path. Does not apply bumps or slides.
function simulateMove(color, pawn, steps) {
  if (!pawn || steps === 0) return { canMove: false, nextPawn: pawn }

  // Start region: any numeric card with value <= 2 can leave (including
  // backward cards like -1 or -6). Pawns leave start onto the track at
  // START_INDEX[color], which you can tweak in constants.js.
  if (pawn.region === 'start') {
    if (!(typeof steps === 'number' && steps <= 2)) return { canMove: false, nextPawn: pawn }
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

  if (steps < 0) {
    const count = Math.abs(steps)
    // Negative moves are only allowed on the main track; you cannot move
    // backward inside the safety/home lanes.
    if (region !== 'track') {
      return { canMove: false, nextPawn: pawn }
    }

    for (let i = 0; i < count; i++) {
      index = ((index ?? 0) + TRACK_LENGTH - 1) % TRACK_LENGTH
    }

    return { canMove: true, nextPawn: { region: 'track', index } }
  }

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
      index = ((index ?? 0) + 1) % TRACK_LENGTH
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
    if (!list.length) continue

    const inSafe = list.filter((p) => p && p.region === 'safety' && typeof p.safetyIndex === 'number')

    // New win condition: all four pawns in the safety/home lane. There are 6
    // lane tiles; you just need to occupy 4 of them with your pawns.
    if (inSafe.length === 4) return color
  }
  return null
}

function applyBumpsAndSlides(state, color, pawnIndex) {
  const pawn = state[color][pawnIndex]
  if (!pawn || !isOnTrack(pawn)) return { state, bumps: [] }
  let pos = pawn.index
  const bumps = []

  // Bump any pawn already on landing square
  for (const c of COLORS) {
    const list = state[c]
    list.forEach((otherPawn, idx) => {
      if (c === color && idx === pawnIndex) return
      if (isOnTrack(otherPawn) && otherPawn.index === pos) {
        otherPawn.region = 'start'
        delete otherPawn.index
        bumps.push({ attacker: color, victim: c })
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
                bumps.push({ attacker: color, victim: c })
              }
            })
          }
        }
        pawn.index = s.end
        pos = s.end
        return { state, bumps }
      }
    }
  }

  return { state, bumps }
}

export default function GameScreen({ aiColors = [], gameCode = null, onExit = null } = {}) {
  const [deck, setDeck] = useState(() => buildDeck())
  const [currentCard, setCurrentCard] = useState(null)
  const [turnIndex, setTurnIndex] = useState(0)
  const [turnDirection, setTurnDirection] = useState(1)
  const [pawns, setPawns] = useState(() => initialPawns())
  const [winner, setWinner] = useState(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [log, setLog] = useState([])
  const [hand, setHand] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [infoCard, setInfoCard] = useState(null)
  const [discardPrompt, setDiscardPrompt] = useState(null)
  const [showHelp, setShowHelp] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [logCollapsed, setLogCollapsed] = useState(false)
  const [scale, setScale] = useState(1)
  const logRef = useRef(null)

  // Online multiplayer awareness: when a gameCode is provided and Firebase is
  // configured, we subscribe to the game document to discover seat assignments
  // and derive the local player's color and AI-controlled colors.
  const [localColor, setLocalColor] = useState(null)
  const [onlineAiColors, setOnlineAiColors] = useState([])
  const [isHostClient, setIsHostClient] = useState(false)
  const [pendingSync, setPendingSync] = useState(false)

  // Track which turn index we've already run AI for, so that React Strict
  // Mode and state changes within a single turn don't cause the AI effect to
  // fire multiple times and advance the turn more than once.
  const lastAiTurnRef = useRef(null)
  // Track what the AI has already done this turn. "none" = has not acted,
  // "shuffle" = re-rolled hand and should now choose a real move,
  // "resolved" = has already made a move/discard that advanced the turn.
  const lastAiActionRef = useRef('none')

  const isOnline = !!gameCode && hasFirebase && db && auth

  const currentColor = COLORS[turnIndex]

  // In local pass-and-play games, there is no online seating info. Expose a
  // default "your color" so the board header still shows a label.
  useEffect(() => {
    if (isOnline) return
    if (!localColor) setLocalColor(COLORS[0])
  }, [isOnline, localColor])

  const movable = useMemo(() => {
    if (isAnimating || winner) return null
    return getMovableFor(currentCard, currentColor, pawns)
  }, [currentCard, currentColor, pawns, isAnimating, winner])

  // For the current player and board, determine which cards in hand can
  // actually move a pawn this turn. This is stricter than "clickable": we
  // ignore Shuffle here, since it does not move pawns, and only mark cards
  // that would result in a legal movement (numeric, Sorry, or Swap).
  const playableByIndex = useMemo(() => {
    if (isAnimating || winner) return hand.map(() => false)
    const color = currentColor

    return hand.map((card) => {
      if (card == null) return false
      if (card === 'Shuffle') return false
      if (card === 'Sorry') {
        return hasSorryMove(color, pawns)
      }
      if (card === 'Swap') {
        return hasSwapMove(pawns, color)
      }
      if (typeof card === 'number') {
        const info = getMovableFor(card, color, pawns)
        return !!(info && info.indices && info.indices.length)
      }
      return false
    })
  }, [hand, pawns, currentColor, isAnimating, winner])

  const hasAnyMoveCard = useMemo(() => playableByIndex.some(Boolean), [playableByIndex])

  // Basic viewport-aware scaling so the full game area fits on smaller phones.
  // We use a slightly smaller "design" width so the game appears larger on
  // typical phone viewports, and we recompute when the log is collapsed so the
  // main content can grow into the freed vertical space.
  useEffect(() => {
    if (typeof window === 'undefined') return

    function updateScale() {
      const vw = window.innerWidth || 0
      const vh = window.innerHeight || 0
      if (!vw || !vh) return

      // Target a slightly smaller virtual board than typical phone viewports
      // so we only scale down when absolutely necessary.
      const baseWidth = 360
      const baseHeightExpanded = 780
      const baseHeightCollapsed = 680
      const baseHeight = logCollapsed ? baseHeightCollapsed : baseHeightExpanded

      const next = Math.min(vw / baseWidth, vh / baseHeight, 1)
      setScale(next)
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [logCollapsed])

  // Always keep the log scrolled to the newest entry at the bottom when visible.
  useEffect(() => {
    if (logCollapsed) return
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [log, logCollapsed])

  // For the currently selected numeric card, pre-compute where each movable
  // pawn would land so the board can show a projection marker.
  const projections = useMemo(() => {
    if (isAnimating || winner) return {}
    if (currentCard === null || currentCard === undefined) return {}
    if (!movable || !movable.indices || !movable.indices.length) return {}
    if (currentCard === 'Sorry' || currentCard === 'Shuffle' || currentCard === 'Swap') return {}

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

  // Subscribe to game seats in online mode so we know which color this client
  // controls and which colors are AI-controlled.
  useEffect(() => {
    if (!isOnline) return
    const gameRef = doc(db, 'games', gameCode)
    const unsub = onSnapshot(gameRef, (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      const seats = data.seats || []
      const me = auth.currentUser
      if (me) {
        const mySeat = seats.find((s) => s && s.uid === me.uid)
        setLocalColor(mySeat ? mySeat.color : null)
        setIsHostClient(data.host && data.host === me.uid)
      } else {
        setLocalColor(null)
        setIsHostClient(false)
      }
      setOnlineAiColors(seats.filter((s) => s && s.isAI).map((s) => s.color))

      const sharedState = data.state || null
      if (sharedState) {
        if (sharedState.pawns) setPawns(sharedState.pawns)
        if (Array.isArray(sharedState.deck)) setDeck(sharedState.deck)
        if (Array.isArray(sharedState.hand)) setHand(sharedState.hand)
        if (typeof sharedState.turnIndex === 'number') setTurnIndex(sharedState.turnIndex)
        if (typeof sharedState.turnDirection === 'number') setTurnDirection(sharedState.turnDirection)
        setWinner(sharedState.winner || null)
        if (Array.isArray(sharedState.log)) setLog(sharedState.log)
      }
    })
    return () => {
      unsub()
      setLocalColor(null)
      setOnlineAiColors([])
      setIsHostClient(false)
    }
  }, [isOnline, gameCode])

  useEffect(() => {
    // Local games deal their own initial hand. Online games read state from
    // Firestore instead.
    if (isOnline) return
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
  }, [isOnline])

  // When we have made a local move in an online game, push the updated shared
  // state (pawns, deck, hand, turnIndex, winner) back to Firestore so that
  // all clients stay in sync.
  useEffect(() => {
    if (!isOnline || !pendingSync || !gameCode) return
    const gameRef = doc(db, 'games', gameCode)
    const state = {
      pawns,
      deck,
      hand,
      turnIndex,
      turnDirection,
      winner,
      log,
    }
    const update = { state }
    if (winner) update.status = 'finished'
    updateDoc(gameRef, update).catch((err) => {
      console.error('Failed to sync game state', err)
    }).finally(() => {
      setPendingSync(false)
    })
  }, [isOnline, pendingSync, gameCode, pawns, deck, hand, turnIndex, winner, log])

  // When an online game finishes, clear the lastOnlineGameCode marker in
  // localStorage so refreshes return to the lobby instead of a completed game.
  useEffect(() => {
    if (!isOnline || !gameCode) return
    if (!winner) return
    if (typeof window === 'undefined') return
    try {
      const saved = window.localStorage.getItem('lastOnlineGameCode')
      if (saved === gameCode) {
        window.localStorage.removeItem('lastOnlineGameCode')
      }
    } catch {
      // ignore
    }
  }, [isOnline, gameCode, winner])

  const effectiveAiColors = isOnline ? onlineAiColors : aiColors

  const isAiTurnNow = effectiveAiColors && effectiveAiColors.includes(currentColor)
  const isHumanLocalTurn = !isOnline || !localColor || currentColor === localColor
  const canHumanActThisTurn = !winner && !isAnimating && !isAiTurnNow && isHumanLocalTurn

  // --- Simple AI opponents ---
  useEffect(() => {
    if (winner || isAnimating) return

    // In online games, only the host client is responsible for running AI
    // turns to avoid duplicate moves.
    if (isOnline && !isHostClient) return
    const aiColor = currentColor

    if (!effectiveAiColors || !effectiveAiColors.includes(aiColor)) return

    // Per-turn gating: when we first see a new turnIndex, clear any previous
    // AI action stage. We no longer block on lastAiActionRef being 'resolved'
    // because external syncs in online games can replay a turnIndex without
    // rerunning this effect.
    if (lastAiTurnRef.current !== turnIndex) {
      lastAiTurnRef.current = turnIndex
      lastAiActionRef.current = 'none'
    }

    // Need a hand to act on, and no card already selected this turn.
    if (!hand.length) return
    if (selectedIndex !== null || currentCard !== null) return

    const list = pawns[aiColor] || []
    const sorryPlay = chooseAiSorryPlay(aiColor, hand, pawns)
    if (sorryPlay) {
      setCurrentCard('Sorry')
      setSelectedIndex(sorryPlay.sorryIndex)
      // Explicitly log AI Sorry usage so it never appears "silent" even if
      // the follow-up log inside playSorryMove is missed or overlooked.
      pushLog(`${aiColor} (AI) plays Sorry`)
      playSorryMove(aiColor, sorryPlay.targetColor, sorryPlay.targetIndex, sorryPlay.sorryIndex)
      lastAiActionRef.current = 'resolved'
      return
    }

    const swapPlay = chooseAiSwapPlay(aiColor, hand, pawns)
    if (swapPlay) {
      const { swapIndex, srcIndex, dstColor, dstIndex } = swapPlay
      setPawns((prev) => {
        const next = {
          ...prev,
          [aiColor]: prev[aiColor].map((p) => ({ ...p })),
          [dstColor]: prev[dstColor].map((p) => ({ ...p })),
        }
        const a = next[aiColor][srcIndex]
        const b = next[dstColor][dstIndex]
        if (!a || !b || !isOnTrack(a) || !isOnTrack(b)) return prev

        next[aiColor][srcIndex] = { ...b }
        next[dstColor][dstIndex] = { ...a }
        const w = getWinner(next)
        if (w) setWinnerAndLog(w)
        return next
      })

      pushLog(`${aiColor} (AI) plays Swap`)
      play('move')
      drawIntoHandSlot(swapPlay.swapIndex)
      advanceTurn()
      if (isOnline) setPendingSync(true)
      lastAiActionRef.current = 'resolved'
      return
    }

    const best = chooseAiNumericPlay({
      aiColor,
      hand,
      pawns,
      effectiveAiColors,
      selectedIndex,
      currentCard,
      simulateMove,
      getMoveFrames,
    })

    if (best) {
      pushLog(`${aiColor} (AI) plays ${best.card}`)
      play('draw')
      playNumericOnPawn(best.card, aiColor, best.pawnIndex, best.index)
      lastAiActionRef.current = 'resolved'
      return
    }

    // 3) No numeric or Sorry moves: try 'Shuffle' to reroll the hand.
    const shuffleIndex = hand.findIndex((c) => c === 'Shuffle')
    if (shuffleIndex !== -1 && lastAiActionRef.current === 'none') {
      handleCardSelect(shuffleIndex, { skipPrompt: true })
      // Stay on the same turnIndex but mark that we've already shuffled so
      // the next AI pass can choose a real card or discard without shuffling
      // again.
      lastAiActionRef.current = 'shuffle'
      return
    }

    // Otherwise, discard the first available card that isn't strictly better
    // to hold. Include Swap here so AI can get rid of dead Swaps instead of
    // stalling when holding only Swap cards.
    const fallbackIndex = hand.findIndex(
      (c) => typeof c === 'number' || c === 'Sorry' || c === 'Shuffle' || c === 'Swap',
    )
    if (fallbackIndex !== -1) {
      handleCardSelect(fallbackIndex, { skipPrompt: true })
      lastAiActionRef.current = 'resolved'
    }
  }, [winner, isAnimating, currentColor, effectiveAiColors, hand, pawns, selectedIndex, currentCard, turnIndex])

  function pushLog(message, options = {}) {
    const { color } = options
    const actualColor = color || currentColor
    setLog((prev) => {
      let nextTurn = 1
      const last = prev[prev.length - 1]
      if (last && typeof last === 'object' && typeof last.turn === 'number') {
        // If the same color is still acting, keep the same turn number so that
        // multi-step actions (e.g. Sorry + its resolution) share a Turn label.
        if (last.color === actualColor) {
          nextTurn = last.turn
        } else {
          nextTurn = last.turn + 1
        }
      }

      const entry = {
        text: message,
        color: actualColor,
        turn: nextTurn,
      }
      return [...prev, entry]
    })
  }

  function play(type) {
    if (!soundOn) return

    // The dedicated online-turn chime should always play when invoked,
    // regardless of the currentColor snapshot, since advanceTurn computes
    // the upcoming player before updating turnIndex.
    if (type === 'onlineTurn') {
      playBeep(type)
      return
    }

    // In online games, suppress most sounds when this client is not the
    // current player. The turn chime is handled separately in advanceTurn.
    if (isOnline && localColor && currentColor !== localColor && type !== 'turn') return

    playBeep(type)
  }

  function setWinnerAndLog(color) {
    setWinner((prev) => prev || color)
    setLog((prev) => {
      // Avoid logging duplicate winner lines if this is triggered more than once.
      if (
        prev.some((entry) => {
          if (typeof entry === 'string') return entry.endsWith('wins!')
          if (entry && typeof entry.text === 'string') return entry.text.endsWith('wins!')
          return false
        })
      ) {
        return prev
      }

      let turn = 1
      const last = prev[prev.length - 1]
      if (last && typeof last === 'object' && typeof last.turn === 'number') {
        turn = last.turn
      }

      const winnerEntry = {
        text: `${color} wins!`,
        color,
        turn,
      }
      return [...prev, winnerEntry]
    })
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

  function hasSwapMove(pawnsByColor, playerColor) {
    const myList = pawnsByColor[playerColor] || []
    const hasMine = myList.some(isOnTrack)
    if (!hasMine) return false

    for (const c of COLORS) {
      if (c === playerColor) continue
      const list = pawnsByColor[c] || []
      if (list.some(isOnTrack)) return true
    }

    return false
  }

  function handleCardSelect(index, options = {}) {
    const { skipPrompt = false } = options
    if (winner || isAnimating) return
    const card = hand[index]
    if (card == null) return

    const color = currentColor
    const isAiColor = (isOnline ? onlineAiColors : aiColors).includes(color)
    const isLocalHumanColor = !isOnline || !localColor || color === localColor
    const shouldPromptDiscard = !skipPrompt && !isAiColor && isLocalHumanColor
    const allowPromptDiscard = shouldPromptDiscard && hasAnyMoveCard

    // 'Shuffle' discards the entire hand and deals three new cards for the same
    // player, without ending the turn. It also reverses the direction of play.
    if (card === 'Shuffle') {
      pushLog(`${color} played Shuffle (new hand)`)

      const newDir = -turnDirection
      setTurnDirection(newDir)
      pushLog(newDir === 1 ? 'Play direction is now clockwise' : 'Play direction is now counter-clockwise')

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
      if (isOnline) setPendingSync(true)
      return
    }

    // 'Swap' lets you choose two pawns from different colors on the track and
    // swap their positions. If you have no track pawns, or there are no
    // opponent track pawns, it is discarded.
    if (card === 'Swap') {
      const isAiAutoDiscard = isAiColor && skipPrompt
      const canSwap = hasSwapMove(pawns, color)

      // For AI (skipPrompt) we never want to enter the interactive Swap flow,
      // even if a legal swap exists. Treat it as a discard so AI turns cannot
      // hang waiting for human pawn clicks.
      if (!canSwap || isAiAutoDiscard) {
        if (!allowPromptDiscard) {
          pushLog(`${color} discarded Swap${!canSwap ? ' (no targets)' : ''}`)
          play('draw')
          setCurrentCard(null)
          setSelectedIndex(null)
          drawIntoHandSlot(index)
          advanceTurn()
          if (isOnline) setPendingSync(true)
        } else {
          setDiscardPrompt({
            color,
            card,
            handIndex: index,
            message: 'Swap has no valid targets this turn.',
            log: `${color} discarded Swap (no targets)`,
          })
        }
        return
      }

      setCurrentCard('Swap')
      setSelectedIndex(index)
      setSwapSource(null)
      play('draw')
      return
    }

    // Lock in the chosen card for this turn.
    setCurrentCard(card)
    setSelectedIndex(index)

    // Sorry is special: it depends on opponent pawns on track.
    if (card === 'Sorry') {
      const canPlay = hasSorryMove(color, pawns)
      if (!canPlay) {
        if (!allowPromptDiscard) {
          pushLog(`${color} discarded Sorry`)
          play('draw')
          setCurrentCard(null)
          setSelectedIndex(null)
          drawIntoHandSlot(index)
          advanceTurn()
          if (isOnline) setPendingSync(true)
        } else {
          setDiscardPrompt({
            color,
            card,
            handIndex: index,
            message: 'Sorry has no valid targets this turn.',
            log: `${color} discarded Sorry`,
          })
        }
        return
      }
      pushLog(`${color} selected Sorry`)
      play('draw')
      return
    }

    const moveInfo = getMovableFor(card, color, pawns)
    if (!moveInfo) {
      // No legal moves for this card.
      setCurrentCard(null)
      setSelectedIndex(null)
      if (!allowPromptDiscard) {
        pushLog(`${color} discarded ${card}`)
        play('draw')
        drawIntoHandSlot(index)
        advanceTurn()
        if (isOnline) setPendingSync(true)
      } else {
        setDiscardPrompt({
          color,
          card,
          handIndex: index,
          message: `No legal moves for ${card} this turn.`,
          log: `${color} discarded ${card}`,
        })
      }
      return
    }

    // There is at least one legal move for this card. We now simply select the
    // card (for projections) and wait for the player to click a pawn to commit
    // the move, instead of auto-playing when there is only one option.

    // No log here: players can switch cards to preview moves. We'll only log
    // the final card actually used when the move or discard happens.
    play('draw')
  }

  function advanceTurn() {
    setCurrentCard(null)
    setSelectedIndex(null)

    const step = turnDirection === -1 ? -1 : 1
    const next = (turnIndex + step + COLORS.length) % COLORS.length
    const nextColor = COLORS[next]
    // Ding when it becomes a human player's turn.
    if (!effectiveAiColors || !effectiveAiColors.includes(nextColor)) {
      if (!isOnline || !localColor || nextColor === localColor) {
        // In online games with a known local color, use a distinct chime
        // when it becomes this client's turn.
        if (isOnline && localColor && nextColor === localColor) {
          play('onlineTurn')
        } else {
          play('turn')
        }
      }
    }

    setTurnIndex(next)
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
    setTurnDirection(1)
    setPawns(initialPawns())
    setWinner(null)
    setIsAnimating(false)
    setLog([])
  }

  const [swapSource, setSwapSource] = useState(null)

  const swapHighlight = useMemo(() => {
    if (currentCard !== 'Swap') return null

    const map = {}

    // First click: highlight this player's own track pawns.
    if (!swapSource) {
      const list = pawns[currentColor] || []
      const indices = []
      list.forEach((pawn, idx) => {
        if (pawn && isOnTrack(pawn)) indices.push(idx)
      })
      if (indices.length) {
        map[currentColor] = indices
      }
      return Object.keys(map).length ? map : null
    }

    // Second click: highlight all opponent track pawns.
    for (const c of COLORS) {
      if (c === swapSource.color) continue
      const list = pawns[c] || []
      const indices = []
      list.forEach((pawn, idx) => {
        if (pawn && isOnTrack(pawn)) indices.push(idx)
      })
      if (indices.length) {
        map[c] = indices
      }
    }

    return Object.keys(map).length ? map : null
  }, [currentCard, currentColor, pawns, swapSource])

  const sorryHighlight = useMemo(() => {
    if (currentCard !== 'Sorry') return null

    const color = currentColor
    const myList = pawns[color] || []
    const hasStart = myList.some(isInStart)
    if (!hasStart) return null

    const map = {}
    for (const c of COLORS) {
      if (c === color) continue
      const list = pawns[c] || []
      const indices = []
      list.forEach((pawn, idx) => {
        if (pawn && isOnTrack(pawn)) indices.push(idx)
      })
      if (indices.length) {
        map[c] = indices
      }
    }

    return Object.keys(map).length ? map : null
  }, [currentCard, currentColor, pawns])

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

    // Shorter per-step duration so long moves feel smoother and less stuttery.
    const stepMs = 140

    function applyFrame(stepIndex) {
      if (stepIndex >= frames.length) {
        // After the last step, apply bumps/slides and winner detection once.
        setPawns((prev) => {
          const finalPawn = frames[frames.length - 1]
          const next = {
            ...prev,
            [color]: prev[color].map((p, i) => (i === pawnIndex ? { ...finalPawn } : { ...p })),
          }

          const moved = next[color][pawnIndex]
          if (isOnTrack(moved)) {
            const { state: bumpedState, bumps } = applyBumpsAndSlides(next, color, pawnIndex)
            if (Array.isArray(bumps) && bumps.length) {
              bumps.forEach(({ attacker, victim }) => {
                if (attacker && victim && attacker !== victim) {
                  pushLog(`${attacker} bumped ${victim}`, { color: attacker })
                }
              })
            }

            const w = getWinner(bumpedState)
            if (w) setWinnerAndLog(w)
            return bumpedState
          }

          const w = getWinner(next)
          if (w) setWinnerAndLog(w)
          return next
        })

        setIsAnimating(false)
        play('move')
        if (typeof slotIndex === 'number') {
          drawIntoHandSlot(slotIndex)
        }
        setSelectedIndex(null)
        setCurrentCard(null)
        advanceTurn()
        if (isOnline) setPendingSync(true)
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

  function playSorryMove(attackerColor, defenderColor, defenderIndex, slotIndex) {
    setPawns((prev) => {
      const myList = prev[attackerColor]
      if (!myList) return prev
      const startIdx = myList.findIndex(isInStart)
      if (startIdx === -1) return prev

      const next = {
        ...prev,
        [defenderColor]: prev[defenderColor].map((p) => ({ ...p })),
        [attackerColor]: prev[attackerColor].map((p) => ({ ...p })),
      }

      const oppPawn = next[defenderColor][defenderIndex]
      const myStartPawn = next[attackerColor][startIdx]
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

    pushLog(`${attackerColor} played Sorry on ${defenderColor}`)
    play('sorry')
    if (typeof slotIndex === 'number') {
      drawIntoHandSlot(slotIndex)
    }
    setSelectedIndex(null)
    setCurrentCard(null)
    // Sorry now behaves like a normal move: after resolving, always advance
    // the turn to the next player.
    advanceTurn()
    if (isOnline) setPendingSync(true)
  }

  function handlePawnClick(color, idx) {
    // 0 is a valid card value, so we must explicitly check for null/undefined
    // rather than using a generic falsy check.
    if (currentCard === null || currentCard === undefined || winner || isAnimating) return

    // In both offline and online games, ignore pawn clicks when it is not a
    // human-controlled turn (e.g. during AI turns).
    if (!canHumanActThisTurn) return

    // In online games, only the client whose color matches the current turn
    // may move pawns.
    if (isOnline && localColor && currentColor !== localColor) return

    // Snapshot of current state to decide if this click is a legal move.
    const pawn = pawns[color]?.[idx]
    if (!pawn) return

    // Swap: choose two pawns from different colors on the track.
    if (currentCard === 'Swap') {
      const pawn = pawns[color]?.[idx]
      if (!pawn || !isOnTrack(pawn)) return

      if (!swapSource) {
        // First selection must be one of your own pawns.
        if (color !== currentColor) return
        setSwapSource({ color, idx })
        return
      }

      const { color: srcColor, idx: srcIdx } = swapSource
      // Require different teams.
      if (color === srcColor) {
        // Re-select a different source pawn of the same color.
        setSwapSource({ color, idx })
        return
      }

      setPawns((prev) => {
        const next = {
          ...prev,
          [srcColor]: prev[srcColor].map((p) => ({ ...p })),
          [color]: prev[color].map((p) => ({ ...p })),
        }
        const a = next[srcColor][srcIdx]
        const b = next[color][idx]
        if (!a || !b || !isOnTrack(a) || !isOnTrack(b)) return prev

        next[srcColor][srcIdx] = { ...b }
        next[color][idx] = { ...a }
        const w = getWinner(next)
        if (w) setWinnerAndLog(w)
        return next
      })

      pushLog(`${currentColor} played Swap`)
      play('move')
      if (typeof selectedIndex === 'number') {
        drawIntoHandSlot(selectedIndex)
      }
      setSwapSource(null)
      setSelectedIndex(null)
      setCurrentCard(null)
      advanceTurn()
      if (isOnline) setPendingSync(true)
      return
    }

    // Sorry: must click an opponent pawn on the track, while you have a start pawn.
    if (currentCard === 'Sorry') {
      if (color === currentColor) return
      if (!isOnTrack(pawn)) return
      if (selectedIndex === null) return

      playSorryMove(currentColor, color, idx, selectedIndex)
      return
    }

    // Numeric cards: must click your own pawn with a legal move.
    if (color !== currentColor) return

    // Only allow and log the move if this pawn is actually in the movable set
    // for the current card, to avoid duplicate logs on invalid clicks.
    const moveInfo = getMovableFor(currentCard, color, pawns)
    const indices = moveInfo?.indices || []
    if (!indices.includes(idx)) return

    // Use the locked-in hand slot (selectedIndex) so the card gets consumed
    // and replaced after the move resolves.
    if (selectedIndex !== null) {
      pushLog(`${color} plays ${currentCard}`)
    }
    playNumericOnPawn(currentCard, color, idx, selectedIndex)
  }

  return (
    <div className="w-full h-full flex justify-center items-start overflow-auto">
      <div
        className="w-full max-w-xl mx-auto space-y-3 relative"
        style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
      >
      <div className="flex items-center justify-between text-sm w-full max-w-md mx-auto px-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-200 hover:bg-zinc-800"
          >
            Help
          </button>
          <button
            type="button"
            onClick={() => setShowExitConfirm(true)}
            className="text-xs px-2 py-1 rounded border border-red-700 text-red-200 hover:bg-red-900/50"
          >
            Exit to Home
          </button>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setLogCollapsed((v) => !v)}
            className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-200 hover:bg-zinc-800"
          >
            {logCollapsed ? 'Show log' : 'Hide log'}
          </button>
          <button
            type="button"
            onClick={() => setSoundOn((v) => !v)}
            className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-200 hover:bg-zinc-800"
          >
            Sound: {soundOn ? 'On' : 'Off'}
          </button>
        </div>
      </div>
      {!logCollapsed && (
        <div
          ref={logRef}
          className="mt-2 text-sm bg-zinc-900/80 border border-zinc-700 rounded-lg p-2 h-32 overflow-y-auto max-w-md mx-auto"
        >
          <div className="flex flex-col justify-end min-h-full space-y-0.5">
            {log.map((entry, i) => {
              if (entry == null) return null

              const isObject = typeof entry === 'object'
              const text = isObject ? entry.text : String(entry)
              const turn = isObject ? entry.turn : null

              return (
                <div key={i} className="text-left text-zinc-300">
                  {turn != null && <span className="font-semibold">{`Turn ${turn}: `}</span>}
                  {renderColoredLogText(text)}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <GameBoard
        pawnsByColor={pawns}
        onPawnClick={handlePawnClick}
        activeColor={currentColor}
        movable={movable}
        projections={projections}
        swapHighlight={swapHighlight}
        sorryHighlight={sorryHighlight}
        turnDirection={turnDirection}
        localColor={localColor}
        isOnline={isOnline}
        winner={winner}
      />
      <div className="flex justify-center gap-6 mt-4 w-full max-w-md mx-auto">
        {hand.map((card, index) => {
          const isSelected = selectedIndex === index
          const hasAnyMoveCard = playableByIndex.some(Boolean)
          const disabled =
            !canHumanActThisTurn || (canHumanActThisTurn && hasAnyMoveCard && !playableByIndex[index])
          return (
            <button
              key={index}
              type="button"
              onClick={() => handleCardSelect(index)}
              disabled={disabled}
              className={`relative w-28 h-40 px-3 py-3 rounded border text-lg font-semibold disabled:opacity-40 flex items-center justify-center ${
                isSelected
                  ? 'bg-blue-600 border-blue-300 text-white'
                  : 'bg-zinc-900 border-zinc-600 text-zinc-100'
              }`}
            >
              {card != null && (
                <span
                  className="absolute top-1 right-1 text-[10px] px-4 py-2 rounded bg-zinc-800/80 border border-zinc-600 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    setInfoCard(card)
                  }}
                >
                  ?
                </span>
              )}
              <span className="pointer-events-none">{formatCardFace(card)}
              </span>
            </button>
          )
        })}
      </div>
      {showHelp && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto bg-zinc-900/95 border border-zinc-700 rounded-2xl px-5 py-4 shadow-xl text-left space-y-2 max-w-sm mx-4">
            <div className="text-xs uppercase tracking-wide text-zinc-400 text-center">How to Play</div>
            <div className="text-xs text-zinc-300 space-y-1">
              <p>
                Goal: move all four of your pawns from Start to your inner home lane before
                any other color.
              </p>
              <p>
                On your turn, choose one of your three cards. If it has a legal move, click a
                pawn to apply it. If it has no legal moves this turn, you may discard it
                instead and draw a replacement, ending your turn.
              </p>
              <p>
                Numeric cards move one of your pawns by their value (0 can only leave Start).
                Any card that shows a * can move a pawn out of Start.
                Sorry lets you leave Start by bumping an opponent pawn from the track back to
                their Start. Swap trades one of your track pawns with an opponent&apos;s. Shuffle
                discards your whole hand, draws three new cards for the same player, and
                reverses the direction of play.
              </p>
              <p>
                Landing on a slide start moves you to the end of the slide, bumping any
                opponent pawns along the way. Landing on an opponent pawn&apos;s space bumps that
                pawn back to Start. Get all four of your pawns into your colored inner lane to
                win.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="mt-1 inline-flex items-center justify-center px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {discardPrompt && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-4 shadow-xl max-w-xs w-full text-center space-y-3">
            <div className="text-xs uppercase tracking-wide text-zinc-400">{discardPrompt.message}</div>
            <div className="text-sm text-zinc-200 whitespace-pre-line">
              Would you like to discard this card and end your turn?
            </div>
            <div className="flex justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  const { handIndex, log: logMsg, color, card } = discardPrompt
                  if (logMsg) pushLog(logMsg)
                  play('draw')
                  setCurrentCard(null)
                  setSelectedIndex(null)
                  drawIntoHandSlot(handIndex)
                  advanceTurn()
                  if (isOnline) setPendingSync(true)
                  setDiscardPrompt(null)
                }}
                className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-500"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => setDiscardPrompt(null)}
                className="px-3 py-1.5 rounded border border-zinc-600 text-zinc-200 text-xs font-medium hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {infoCard !== null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto bg-zinc-900/95 border border-zinc-700 rounded-2xl px-5 py-4 shadow-xl text-center space-y-2 max-w-xs">
            <div className="text-xs uppercase tracking-wide text-zinc-400">Card Info</div>
            <div className="text-sm font-semibold text-zinc-100">{String(infoCard)}</div>
            <div className="text-xs text-zinc-300 whitespace-pre-line">{getCardInfo(infoCard)}</div>
            <button
              type="button"
              onClick={() => setInfoCard(null)}
              className="mt-1 inline-flex items-center justify-center px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {winner && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto bg-zinc-900/95 border border-zinc-700 rounded-2xl px-6 py-4 shadow-xl text-center space-y-2">
            <div className="text-xs uppercase tracking-wide text-zinc-400">Game Over</div>
            <div className="text-lg font-semibold">{winner} wins!</div>
            <button
              onClick={() => {
                if (onExit) onExit()
                else resetGame()
              }}
              className="mt-2 inline-flex items-center justify-center px-4 py-1.5 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-500"
            >
              Exit to Home
            </button>
          </div>
        </div>
      )}

      {showExitConfirm && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-4 shadow-xl max-w-xs w-full text-center space-y-3">
            <div className="text-xs uppercase tracking-wide text-zinc-400">Leave Game?</div>
            <div className="text-sm text-zinc-200 whitespace-pre-line">
              Are you sure you want to exit to the home screen?
            </div>
            <div className="flex justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirm(false)
                  if (onExit) onExit()
                }}
                className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-500"
              >
                Exit
              </button>
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="px-3 py-1.5 rounded border border-zinc-600 text-zinc-200 text-xs font-medium hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
