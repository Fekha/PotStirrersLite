// Board geometry constants for PotStirrers (Sorry!-style)
// Units are percentages relative to the square board container (0 to 100)

// Generate a 60-space perimeter path, 15 positions per side, inset slightly from the outer edge
// so cells are fully visible inside the rounded board frame.
function generateBoardPath() {
  const total = 60
  const perSide = 15
  const margin = 10 // percent inset from each edge to avoid clipping
  const min = margin
  const max = 100 - margin
  const step = (max - min) / (perSide - 1)
  const points = []

  // Top edge: from (min, min) moving right to (max, min)
  for (let i = 0; i < perSide; i++) {
    const x = min + i * step
    points.push({ x: round(x)+3, y: min-3})
  }
  // Right edge: from (max, min + step) to (max, max)
  for (let i = 1; i <= perSide; i++) {
    const y = min + i * step
    points.push({ x: max+3, y: round(y)-3 })
  }
  // Bottom edge: from (max - step, max) to (min, max)
  for (let i = 1; i <= perSide; i++) {
    const x = max - i * step
    points.push({ x: round(x)+3, y: max+2.7 })
  }
  // Left edge: from (min, max - step) to (min, min)
  for (let i = 1; i <= perSide; i++) {
    const y = max - i * step
    points.push({ x: min-2.7, y: round(y)+2.7})
  }

  return points.slice(0, total)
}

function round(v) {
  return Math.round(v * 100) / 100
}

export const BOARD_PATH = generateBoardPath()

// Player colors used throughout the app
export const COLORS = ['Red', 'Blue', 'Yellow', 'Green']

// Deck composition (four of each card)
// Includes special cards: '0' (start-only move), '-1' and '-6' (backward
// cards that can also leave Start), 'Shuffle' (reroll the shared hand), and
// 'Swap' (swap two pawns on the track).
export const BASE_DECK = [0, 1, -1, 2, 3, 4, 5, -6, 7, 8, 9, 10, 11, 12, 13, 'Sorry', 'Shuffle', 'Swap']

// Start zones: four positions near each corner for each color
export const START_ZONES = {
  Red: [
    { x: 26, y: 15 },
    { x: 35, y: 15 },
    { x: 26, y: 25 },
    { x: 35, y: 25 },
  ],
  Blue: [
    { x: 75, y: 26 },
    { x: 85, y: 26 },
    { x: 75, y: 35 },
    { x: 85, y: 35 },
  ],
  Yellow: [
    { x: 65, y: 75 },
    { x: 74, y: 75 },
    { x: 65, y: 85 },
    { x: 74, y: 85 },
  ],
  Green: [
    { x: 15, y: 65 },
    { x: 25, y: 65 },
    { x: 15, y: 74 },
    { x: 25, y: 74 },
  ],
}

// Entry indices on the main track when leaving Start / entering home lanes.
export const START_INDEX = {
  Red: 3,
  Blue: 18,
  Yellow: 33,
  Green: 48,
}

// Track index where each color enters its inner home path. These are kept as
// simple constants so you can easily tweak them without touching logic.
// With the current geometry, these correspond to the squares visually aligned
// with the start of each color's home lane.
export const HOME_ENTRY_INDEX = {
  Red: 0,
  Blue: 15,
  Yellow: 30,
  Green: 45,
}

// Home paths: 5-step columns/rows that lead from an entry on the main track into the center
// These are simplified straight paths aimed at the board center; you can adjust later to match art.
export const HOME_PATHS = {
  Red: [
    { x: 13, y: 14 },
    { x: 13, y: 21 },
    { x: 13, y: 28 },
    { x: 13, y: 35 },
    { x: 13, y: 42 },
    { x: 13, y: 49 },
  ],
  Blue: [
    { x: 86, y: 13 },
    { x: 79, y: 13 },
    { x: 72, y: 13 },
    { x: 65, y: 13 },
    { x: 58, y: 13 },
    { x: 51, y: 13 },
  ],
  Yellow: [
    { x: 87, y: 86 },
    { x: 87, y: 79 },
    { x: 87, y: 72 },
    { x: 87, y: 65 },
    { x: 87, y: 58 },
    { x: 87, y: 51 },
  ],
  Green: [
    { x: 14, y: 87 },
    { x: 21, y: 87 },
    { x: 28, y: 87 },
    { x: 35, y: 87 },
    { x: 42, y: 87 },
    { x: 49, y: 87 },
  ],
}



// Convenience: indices for slides. Two slide segments per side.
export const SLIDES = {
  Red: [
    { start: 5, end: 7 },
    { start: 11, end: 13 },
  ],
  Blue: [
    { start: 20, end: 22 },
    { start: 26, end: 28 },
  ],
  Yellow: [
    { start: 35, end: 37 },
    { start: 41, end: 43 },
  ],
  Green: [
    { start: 50, end: 52 },
    { start: 56, end: 58 },
  ],
}
