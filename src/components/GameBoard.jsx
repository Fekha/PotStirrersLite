import { BOARD_PATH, START_ZONES, HOME_PATHS, SLIDES } from '../constants'
import Pawn from './Pawn.jsx'

function getSlideInfo(index) {
  for (const [color, slides] of Object.entries(SLIDES)) {
    for (const s of slides) {
      if (index === s.start) return { type: 'start', color }
      if (index === s.end) return { type: 'end', color }
      if (index > s.start && index < s.end) return { type: 'body', color }
    }
  }
  return null
}

const slideColors = {
  Red: 'border-red-400 bg-red-500/10',
  Blue: 'border-sky-400 bg-sky-500/10',
  Yellow: 'border-yellow-400 bg-yellow-400/10',
  Green: 'border-emerald-400 bg-emerald-500/10',
}

const homeColors = {
  Red: 'border-red-500 bg-red-500/10',
  Blue: 'border-sky-500 bg-sky-500/10',
  Yellow: 'border-yellow-500 bg-yellow-400/10',
  Green: 'border-emerald-500 bg-emerald-500/10',
}

const finalHomeColors = {
  Red: 'border-red-400 bg-red-500/40',
  Blue: 'border-sky-400 bg-sky-500/40',
  Yellow: 'border-yellow-400 bg-yellow-400/40',
  Green: 'border-emerald-400 bg-emerald-500/40',
}

// Compute the track index where each color enters its home lane, by finding
// the BOARD_PATH cell closest to the first HOME_PATH point. This matches
// the logic used in GameScreen so visuals and rules stay aligned.
const HOME_ENTRY_INDEX = (() => {
  const colors = ['Red', 'Blue', 'Yellow', 'Green']
  const result = {}
  for (const color of colors) {
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

export default function GameBoard({ pawnsByColor, onPawnClick, activeColor, movable }) {
  const trackCells = BOARD_PATH.map((pos, index) => {
    const slide = getSlideInfo(index)
    let base = 'absolute w-5 h-5 sm:w-6 sm:h-6 rounded-md border border-zinc-700 bg-zinc-900/80'

    if (slide) {
      base = 'absolute w-5 h-5 sm:w-6 sm:h-6 rounded-md border bg-zinc-900/80 ' + (slideColors[slide.color] || '')
      if (slide.type === 'start') base += ' ring-2 ring-current'
      if (slide.type === 'end') base += ' ring-1 ring-current'
    }

    // Highlight the entry square into each color's home lane. This uses the
    // START_INDEX values from constants (via props), which correspond to the
    // lane entry points in GameScreen logic.
    const startIndices = { Red: 1, Blue: 16, Yellow: 31, Green: 46 }
    for (const [color, entryIndex] of Object.entries(startIndices)) {
      if (entryIndex === index) {
        const hc = homeColors[color] || ''
        base += ` ${hc} ring-2 ring-current`
        break
      }
    }

    return (
      <div
        key={index}
        className={base}
        style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
      />
    )
  })

  const pawnNodes = Object.entries(pawnsByColor || {}).flatMap(([color, pawns]) => {
    const starts = START_ZONES[color] || []
    const homePath = HOME_PATHS[color] || []

    return (pawns || []).map((pawn, idx) => {
      if (!pawn) return null

      let x
      let y

      if (pawn.region === 'start') {
        const p = starts[idx] || starts[0]
        if (!p) return null
        x = p.x
        y = p.y
      } else if (pawn.region === 'track' && typeof pawn.index === 'number') {
        const trackPos = BOARD_PATH[pawn.index]
        if (!trackPos) return null
        x = trackPos.x
        y = trackPos.y
      } else if ((pawn.region === 'safety' || pawn.region === 'home') && typeof pawn.safetyIndex === 'number') {
        const hp = homePath[pawn.safetyIndex]
        if (!hp) return null
        x = hp.x
        y = hp.y
      } else {
        return null
      }

      return (
        <Pawn
          key={`${color}-${pawn.region}-${idx}`}
          color={color}
          x={x}
          y={y}
          active={movable?.color === color && movable?.indices?.includes(idx)}
          onClick={() => onPawnClick && onPawnClick(color, idx)}
        />
      )
    })
  })

  const homes = Object.entries(HOME_PATHS).flatMap(([color, path]) => {
    const last = path.length - 1
    return path.map((p, i) => {
      const isFinal = i === last
      const base = 'absolute w-3 h-3 sm:w-4 sm:h-4 rounded-md border bg-zinc-900/80'
      const colorClasses = isFinal ? finalHomeColors[color] : homeColors[color]
      const ring = isFinal ? ' ring-2 ring-current' : ''
      return (
        <div
          key={`${color}-home-${i}`}
          className={`${base} ${colorClasses || ''}${ring}`}
          style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }}
        />
      )
    })
  })

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div className="aspect-square w-full max-w-md bg-zinc-900 rounded-3xl border border-zinc-700 relative overflow-hidden">
        <div className="absolute inset-6 border-2 border-zinc-700 rounded-3xl" />
        {trackCells}
        {homes}
        {pawnNodes}
      </div>
      <div className="text-xs text-zinc-500 text-center px-4">
        Slides are tinted squares on the edge; colored inner lanes are home paths. Reach the bright final square to get a pawn home.
      </div>
    </div>
  )
}
