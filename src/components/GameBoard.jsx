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

const COLOR_TEXT = {
  Red: 'text-red-300',
  Blue: 'text-sky-300',
  Yellow: 'text-yellow-300',
  Green: 'text-emerald-300',
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

const startRingColors = {
  Red: 'sm:ring-2 sm:ring-red-400',
  Blue: 'sm:ring-2 sm:ring-sky-400',
  Yellow: 'sm:ring-2 sm:ring-yellow-300',
  Green: 'sm:ring-2 sm:ring-emerald-400',
}

// Text arrows for home-lane entry markers (point straight into the lane).
// Use a single triangle glyph and rotate it per color so it respects CSS
// color (no blue emoji arrows) and always points into the lane.
const HOME_ENTRY_ARROW_CHAR = '\u25B2' // ▲ up-pointing triangle
const homeEntryOrientation = {
  Red: 'rotate-180',   // from top edge, pointing down
  Blue: '-rotate-90',  // from right edge, pointing left
  Yellow: '',          // from bottom edge, pointing up
  Green: 'rotate-90',  // from left edge, pointing right
}

const homeEntryTextColors = {
  Red: 'text-red-300',
  Blue: 'text-sky-300',
  Yellow: 'text-yellow-300',
  Green: 'text-emerald-300',
}

// Text arrows for leaving Start onto the main track (opposite of home-entry arrows).
const START_ARROW_CHAR = '\u25B2' // ▲ up-pointing triangle
const startOrientation = {
  Red: '',           // from top edge, pointing up (away from center)
  Blue: 'rotate-90', // from right edge, pointing right
  Yellow: 'rotate-180', // from bottom edge, pointing down
  Green: '-rotate-90',  // from left edge, pointing left
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

const homeRingColors = {
  Red: 'sm:ring-2 sm:ring-red-400',
  Blue: 'sm:ring-2 sm:ring-sky-400',
  Yellow: 'sm:ring-2 sm:ring-yellow-300',
  Green: 'sm:ring-2 sm:ring-emerald-400',
}

const finalHomeColors = {
  Red: 'border-red-400 bg-red-500/40',
  Blue: 'border-sky-400 bg-sky-500/40',
  Yellow: 'border-yellow-400 bg-yellow-400/40',
  Green: 'border-emerald-400 bg-emerald-500/40',
}

export default function GameBoard({
  pawnsByColor,
  onPawnClick,
  activeColor,
  movable,
  projections,
  swapHighlight,
  sorryHighlight,
  turnDirection = 1,
  localColor,
  isOnline,
  winner,
}) {
  const clockwise = turnDirection >= 0
  const trackCells = BOARD_PATH.map((pos, index) => {
    const slide = getSlideInfo(index)
    // Slightly smaller than before so adjacent squares have a bit of space
    // between their borders instead of overlapping.
    let base = 'absolute w-4 h-4 sm:w-5 sm:h-5 rounded-md border border-zinc-700 bg-zinc-900/80'

    if (slide) {
      base = 'absolute w-4 h-4 sm:w-5 sm:h-5 rounded-md border bg-zinc-900/80 ' + (slideColors[slide.color] || '')
    }

    // Highlight the entry square into each color's home lane, using the
    // HOME_ENTRY_INDEX mapping from constants. On very small screens the
    // strong ring highlight is only applied from the sm breakpoint up to
    // avoid visual overlap.
    let homeEntryColor = null
    for (const [color, entryIndex] of Object.entries(HOME_ENTRY_INDEX)) {
      if (entryIndex === index) {
        const hc = homeColors[color] || ''
        const rc = homeRingColors[color] || 'sm:ring-2 sm:ring-zinc-200'
        base += ` ${hc} ${rc}`
        homeEntryColor = color
        break
      }
    }

    // Highlight the track square each color uses to leave Start.
    let startColor = null
    for (const [color, startIndex] of Object.entries(START_INDEX)) {
      if (startIndex === index) {
        const sc = startTileColors[color] || ''
        const rc = startRingColors[color] || 'sm:ring-2 sm:ring-zinc-200'
        base += ` ${sc} ${rc}`
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
              className={`text-[0.9rem] sm:text-base font-bold transform ${
                homeEntryOrientation[homeEntryColor] || ''
              } ${homeEntryTextColors[homeEntryColor] || 'text-zinc-200'}`}
            >
              {HOME_ENTRY_ARROW_CHAR}
            </span>
          </div>
        )}
        {startColor && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className={`text-[0.9rem] sm:text-base font-bold transform ${
                startOrientation[startColor] || ''
              } ${startTextColors[startColor] || 'text-zinc-200'}`}
            >
              {START_ARROW_CHAR}
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

      const isMovableActive = movable?.color === color && movable?.indices?.includes(idx)
      const isSwapActive =
        swapHighlight && Array.isArray(swapHighlight[color]) && swapHighlight[color].includes(idx)
      const isSorryActive =
        sorryHighlight && Array.isArray(sorryHighlight[color]) && sorryHighlight[color].includes(idx)

      return (
        <Pawn
          key={`${color}-${idx}`}
          color={color}
          x={x}
          y={y}
          active={isMovableActive || isSwapActive || isSorryActive}
          onClick={() => onPawnClick && onPawnClick(color, idx)}
        />
      )
    })
  })

  const startBoxes = Object.entries(START_ZONES).flatMap(([color, spots]) => {
    const list = spots || []
    if (!list.length) return []

    // Compute the center of this color's four start positions and draw a
    // single larger box around them so the whole start area reads as one
    // region instead of four separate tiles.
    let sumX = 0
    let sumY = 0
    list.forEach((p) => {
      sumX += p.x
      sumY += p.y
    })
    const cx = sumX / list.length
    const cy = sumY / list.length

    // Slightly smaller on tiny screens so they don't dominate the board,
    // but keep the larger size from sm and up.
    const base = 'absolute w-14 h-14 sm:w-18 sm:h-18 rounded-2xl border-2 bg-zinc-900/40'
    const colorClasses = startTileColors[color]
    return [
      <div
        key={`${color}-startbox`}
        className={`${base} ${colorClasses || ''}`}
        style={{ left: `${cx}%`, top: `${cy}%`, transform: 'translate(-50%, -50%)' }}
      />,
    ]
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
    return path.map((p, i) => {
      const base = 'absolute w-3 h-3 sm:w-4 sm:h-4 rounded-md border bg-zinc-900/80'
      const colorClasses = homeColors[color]
      return (
        <div
          key={`${color}-home-${i}`}
          className={`${base} ${colorClasses || ''}`}
          style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }}
        />
      )
    })
  })

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div className="aspect-square w-full max-w-md bg-zinc-900 rounded-3xl border border-zinc-700 relative overflow-hidden touch-none select-none">
        <div className="absolute inset-2 border-2 border-zinc-700 rounded-3xl" />

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none space-y-1">
          <span className="text-sm sm:text-base text-zinc-300">
            Turn Direction:{' '}
            <span className="font-semibold">{clockwise ? '↻' : '↺'}</span>
          </span>
          {isOnline && localColor ? (
            <span
              className={`text-sm sm:text-base ${
                COLOR_TEXT[localColor] || 'text-zinc-200'
              }`}
            >
              Your color:{' '}
              <span className="font-semibold">{localColor}</span>
            </span>
          ) : null}
          <span className="text-sm sm:text-base text-zinc-300">
            Current player:{' '}
            <span
              className={`font-semibold ${
                COLOR_TEXT[winner || activeColor] || 'text-zinc-200'
              }`}
            >
              {winner || activeColor}
            </span>
          </span>
        </div>

        {trackCells}
        {homes}
        {startBoxes}
        {projectionNodes}
        {pawnNodes}
      </div>
    </div>
  )
}
