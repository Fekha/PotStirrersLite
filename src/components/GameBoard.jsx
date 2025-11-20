import { BOARD_PATH, START_ZONES, HOME_PATHS, SLIDES, START_INDEX, HOME_ENTRY_INDEX } from '../constants'
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
  Red: 'border-zinc-400 bg-zinc-800/80',
  Blue: 'border-zinc-400 bg-zinc-800/80',
  Yellow: 'border-zinc-400 bg-zinc-800/80',
  Green: 'border-zinc-400 bg-zinc-800/80',
}

const slideArrowOrientation = {
  Red: 'rotate-45', // top side, pointing clockwise
  Blue: 'rotate-135', // right side, pointing down
  Yellow: 'rotate-225', // bottom side, pointing left
  Green: 'rotate-315', // left side, pointing up
}

// Highlight colors for the track square where each color leaves Start.
const startTileColors = {
  Red: 'border-red-500 bg-red-500/15',
  Blue: 'border-sky-500 bg-sky-500/15',
  Yellow: 'border-yellow-500 bg-yellow-400/20',
  Green: 'border-emerald-500 bg-emerald-500/15',
}

// Text arrows for home-lane entry markers (point straight into the lane).
const homeEntryArrowChars = {
  Red: '↓',    // from top edge into center
  Blue: '←',   // from right edge into center
  Yellow: '↑', // from bottom edge into center
  Green: '→',  // from left edge into center
}

const homeEntryTextColors = {
  Red: 'text-red-300',
  Blue: 'text-sky-300',
  Yellow: 'text-yellow-300',
  Green: 'text-emerald-300',
}

// Text arrows for leaving Start onto the main track (opposite of home-entry arrows).
const startArrowChars = {
  Red: '↑',    // from top edge, away from center
  Blue: '→',   // from right edge, away from center
  Yellow: '↓', // from bottom edge, away from center
  Green: '←',  // from left edge, away from center
}

const startTextColors = {
  Red: 'text-red-300',
  Blue: 'text-sky-300',
  Yellow: 'text-yellow-300',
  Green: 'text-emerald-300',
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

export default function GameBoard({ pawnsByColor, onPawnClick, activeColor, movable, projections }) {
  const trackCells = BOARD_PATH.map((pos, index) => {
    const slide = getSlideInfo(index)
    let base = 'absolute w-5 h-5 sm:w-6 sm:h-6 rounded-md border border-zinc-700 bg-zinc-900/80'

    if (slide) {
      base = 'absolute w-5 h-5 sm:w-6 sm:h-6 rounded-md border bg-zinc-900/80 ' + (slideColors[slide.color] || '')
    }

    // Highlight the entry square into each color's home lane, using the
    // HOME_ENTRY_INDEX mapping from constants.
    let homeEntryColor = null
    for (const [color, entryIndex] of Object.entries(HOME_ENTRY_INDEX)) {
      if (entryIndex === index) {
        const hc = homeColors[color] || ''
        base += ` ${hc} ring-2 ring-current`
        homeEntryColor = color
        break
      }
    }

    // Highlight the track square each color uses to leave Start.
    let startColor = null
    for (const [color, startIndex] of Object.entries(START_INDEX)) {
      if (startIndex === index) {
        const sc = startTileColors[color] || ''
        base += ` ${sc} ring-2 ring-current`
        startColor = color
        break
      }
    }
    return (
      <div
        key={index}
        className={base}
        style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
      >
        {slide && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className={`w-2 h-2 border-t-2 border-r-2 border-zinc-200/80 ${
                slideArrowOrientation[slide.color] || ''
              }`}
            />
          </div>
        )}
        {homeEntryColor && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className={`text-[0.55rem] sm:text-xs font-bold ${
                homeEntryTextColors[homeEntryColor] || 'text-zinc-200'
              }`}
            >
              {homeEntryArrowChars[homeEntryColor] || '↓'}
            </span>
          </div>
        )}
        {startColor && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className={`text-[0.55rem] sm:text-xs font-bold ${
                startTextColors[startColor] || 'text-zinc-200'
              }`}
            >
              {startArrowChars[startColor] || '↑'}
            </span>
          </div>
        )}
      </div>
    )
  })

  const pawnNodes = Object.entries(pawnsByColor || {}).flatMap(([color, pawns]) => {
    const starts = START_ZONES[color] || []
    const homePath = HOME_PATHS[color] || []
    const projList = (projections && projections[color]) || []

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

      const projection = projList[idx]

      return (
        <Pawn
          key={`${color}-${idx}`}
          color={color}
          x={x}
          y={y}
          active={movable?.color === color && movable?.indices?.includes(idx)}
          onClick={() => onPawnClick && onPawnClick(color, idx)}
        />
      )
    })
  })

  const projectionNodes = Object.entries(projections || {}).flatMap(([color, projList]) => {
    const homePath = HOME_PATHS[color] || []
    return (projList || []).map((target, idx) => {
      if (!target) return null

      let x
      let y

      if (target.region === 'track' && typeof target.index === 'number') {
        const trackPos = BOARD_PATH[target.index]
        if (!trackPos) return null
        x = trackPos.x
        y = trackPos.y
      } else if ((target.region === 'safety' || target.region === 'home') && typeof target.safetyIndex === 'number') {
        const hp = homePath[target.safetyIndex]
        if (!hp) return null
        x = hp.x
        y = hp.y
      } else {
        return null
      }

      return (
        <div
          key={`proj-${color}-${idx}`}
          className="absolute w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 border-dashed border-zinc-300/80 pointer-events-none"
          style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
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
      <div className="aspect-square w-full max-w-md bg-zinc-900 rounded-3xl border border-zinc-700 relative overflow-hidden touch-none select-none">
        <div className="absolute inset-2 border-2 border-zinc-700 rounded-3xl" />
        {trackCells}
        {homes}
        {projectionNodes}
        {pawnNodes}
      </div>
      <div className="text-xs text-zinc-500 text-center px-4">
        Slides are tinted squares on the edge; colored inner lanes are home paths. Reach the bright final square to get a pawn home.
      </div>
    </div>
  )
}
