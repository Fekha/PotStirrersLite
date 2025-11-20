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

export default function GameBoard({ pawnsByColor, onPawnClick, activeColor, movable }) {
  const trackCells = BOARD_PATH.map((pos, index) => {
    const slide = getSlideInfo(index)
    let base = 'absolute w-5 h-5 sm:w-6 sm:h-6 rounded-md border border-zinc-700 bg-zinc-900/80'
    if (slide) {
      base = 'absolute w-5 h-5 sm:w-6 sm:h-6 rounded-md border bg-zinc-900/80 ' + (slideColors[slide.color] || '')
      if (slide.type === 'start') base += ' ring-2 ring-current'
      if (slide.type === 'end') base += ' ring-1 ring-current'
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

    return pawns.map((pawn, idx) => {
      if (pawn.position === 'start') {
        const p = starts[idx] || starts[0]
        if (!p) return null
        return (
          <Pawn
            key={`${color}-start-${idx}`}
            color={color}
            x={p.x}
            y={p.y}
            active={movable?.color === color && movable?.indices?.includes(idx)}
            onClick={() => onPawnClick && onPawnClick(color, idx)}
          />
        )
      }

      const trackPos = BOARD_PATH[pawn.position]
      if (!trackPos) return null
      return (
        <Pawn
          key={`${color}-track-${idx}`}
          color={color}
          x={trackPos.x}
          y={trackPos.y}
          active={movable?.color === color && movable?.indices?.includes(idx)}
          onClick={() => onPawnClick && onPawnClick(color, idx)}
        />
      )
    })
  })

  const homes = Object.entries(HOME_PATHS).flatMap(([color, path]) =>
    path.map((p, i) => (
      <div
        key={`${color}-home-${i}`}
        className="absolute w-3 h-3 sm:w-4 sm:h-4 rounded-md border border-zinc-600 bg-zinc-800/70"
        style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }}
      />
    )),
  )

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div className="aspect-square w-full max-w-md bg-zinc-900 rounded-3xl border border-zinc-700 relative overflow-hidden">
        <div className="absolute inset-6 border-2 border-zinc-700 rounded-3xl" />
        {trackCells}
        {homes}
        {pawnNodes}
      </div>
      <div className="text-xs text-zinc-500 text-center px-4">
        Static board with pawn state. Slides are tinted; click highlighted pawns when a card is drawn.
      </div>
    </div>
  )
}
