// Board geometry constants for PotStirrers (Sorry!-style)
// Units are percentages relative to the square board container (0 to 100)

// Generate a perimeter path inset slightly from the outer edge so cells are
// fully visible inside the rounded board frame.
function generateBoardPath() {
  const total = 40
  const perSide = 10
  const margin = 8 // percent inset from each edge to avoid clipping
 const min = margin
const max = 100 - margin
const range = max - min

// Only use 80% of the width for spaces, centered between min/max
const innerFactor = 0.9
const innerRange = range * innerFactor
const step = innerRange / (perSide - 1)
  const points = []

  // Top edge: from (min, min) moving right to (max, min)
  for (let i = 0; i < perSide; i++) {
    const x = min + i * step
    points.push({ x: round(x)+8.5, y: min})
  }
  // Right edge: from (max, min + step) to (max, max)
  for (let i = 1; i <= perSide; i++) {
    const y = min + i * step
    points.push({ x: max, y: round(y)})
  }
  // Bottom edge: from (max - step, max) to (min, max)
  for (let i = 1; i <= perSide; i++) {
    const x = max - i * step
    points.push({ x: round(x), y: max})
  }
  // Left edge: from (min, max - step) to (min, min)
  for (let i = 1; i <= perSide; i++) {
    const y = max - i * step
    points.push({ x: min, y: round(y)})
  }

  return points.slice(0, total)
}

function round(v) {
  return Math.round(v * 100) / 100
}

export const BOARD_PATH = generateBoardPath()
export const TRACK_LENGTH = 40

// Player colors used throughout the app
export const COLORS = ['Red', 'Blue', 'Yellow', 'Green']

// Deck composition (four of each card)
// Includes special cards: '0' (start-only move), '-1' and '-6' (backward
// cards that can also leave Start), 'Shuffle' (reroll the shared hand), and
// 'Swap' (swap two pawns on the track).
export const BASE_DECK = [0, 1, -1, 2, 3, 4, 5, -6, 7, 8, 9, 10, 11, 12, 13, 'Sorry', 'Shuffle', 'Swap']

// Start zones: four positions near each corner for each color, arranged as
// 2x2 blocks that sit just inside the corresponding start track square.
export const START_ZONES = {
  Red: [
    { x: 37.5, y: 17 },
    { x: 45.5, y: 17 },
    { x: 37.5, y: 25 },
    { x: 45.5, y: 25 },
  ],
  Blue: [
    { x: 83, y: 37.5 },
    { x: 83, y: 45.5 },
    { x: 75, y: 37.5 },
    { x: 75, y: 45.5 },
  ],
  Yellow: [
    { x: 62.5, y: 83 },
    { x: 54.5, y: 83 },
    { x: 62.5, y: 75 },
    { x: 54.5, y: 75 },
  ],
  Green: [
    { x: 17, y: 62.5 },
    { x: 17, y: 54.5 },
    { x: 25, y: 62.5 },
    { x: 25, y: 54.5 },
  ],
}

// Entry indices on the main track when leaving Start / entering home lanes.
export const START_INDEX = {
  // Top side, slightly right of Red's start box
  Red: 3,
  // Right side, slightly down from the top corner
  Blue: 13,
  // Bottom side, slightly left of the right corner
  Yellow: 23,
  // Left side, slightly up from the bottom corner
  Green: 33,
}

// Track index where each color enters its inner home path. One entry per side
// of the 40-space loop.
export const HOME_ENTRY_INDEX = {
  Red: 1,
  Blue: 11,
  Yellow: 21,
  Green: 31,
}

// Home paths: 5-step columns/rows that lead from an entry on the main track into the center
// These are simplified straight paths aimed at the board center; you can adjust later to match art.
export const HOME_PATHS = {
  // Red home lane: vertical column under the Red home-entry arrow.
  Red: [
    { x: 25, y: 16.5 },
    { x: 25, y: 24.8 },
    { x: 25, y: 33.1 },
    { x: 25, y: 41.5 },
  ],
  // Blue home lane: horizontal row to the left of the Blue home-entry arrow.
  Blue: [
    // 90° clockwise rotation of Red's lane.
    { x: 83.5, y: 25 },
    { x: 75.2, y: 25 },
    { x: 66.9, y: 25 },
    { x: 58.5, y: 25 },
  ],
  // Yellow home lane: vertical column above the Yellow home-entry arrow.
  Yellow: [
    // 180° rotation of Red's lane.
    { x: 75, y: 83.5 },
    { x: 75, y: 75.2 },
    { x: 75, y: 66.9 },
    { x: 75, y: 58.5 },
  ],
  // Green home lane: horizontal row to the right of the Green home-entry arrow.
  Green: [
    // 270° (or -90°) rotation of Red's lane.
    { x: 16.5, y: 75 },
    { x: 24.8, y: 75 },
    { x: 33.1, y: 75 },
    { x: 41.5, y: 75 },
  ],
}



// Convenience: indices for slides. Two slide segments per side of the 40-cell
// loop, scaled from the original 60-cell layout.
export const SLIDES = {
  Red: [
    { start: 6, end: 8 },
  ],
  Blue: [
    { start: 16, end: 18 },
  ],
  Yellow: [
    { start: 26, end: 28 },
  ],
  Green: [
    { start: 36, end: 38 },
  ],
}
