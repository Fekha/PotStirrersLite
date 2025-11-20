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

// Start zones: four positions near each corner for each color
export const START_ZONES = {
  Red: [
    { x: 15, y: 15 },
    { x: 25, y: 15 },
    { x: 15, y: 25 },
    { x: 25, y: 25 },
  ],
  Blue: [
    { x: 75, y: 15 },
    { x: 85, y: 15 },
    { x: 75, y: 25 },
    { x: 85, y: 25 },
  ],
  Yellow: [
    { x: 75, y: 75 },
    { x: 85, y: 75 },
    { x: 75, y: 85 },
    { x: 85, y: 85 },
  ],
  Green: [
    { x: 15, y: 75 },
    { x: 25, y: 75 },
    { x: 15, y: 85 },
    { x: 25, y: 85 },
  ],
}

// Safety/Home paths: 5-step columns/rows that lead from an entry on the main track into the center
// These are simplified straight paths aimed at the board center; you can adjust later to match art.
export const HOME_PATHS = {
  Red: [
    { x: 50, y: 22 },
    { x: 50, y: 30 },
    { x: 50, y: 38 },
    { x: 50, y: 46 },
    { x: 50, y: 54 },
  ],
  Blue: [
    { x: 78, y: 50 },
    { x: 70, y: 50 },
    { x: 62, y: 50 },
    { x: 54, y: 50 },
    { x: 46, y: 50 },
  ],
  Yellow: [
    { x: 50, y: 78 },
    { x: 50, y: 70 },
    { x: 50, y: 62 },
    { x: 50, y: 54 },
    { x: 50, y: 46 },
  ],
  Green: [
    { x: 22, y: 50 },
    { x: 30, y: 50 },
    { x: 38, y: 50 },
    { x: 46, y: 50 },
    { x: 54, y: 50 },
  ],
}

// Convenience: indices for example slides (customize later)
export const SLIDES = {
  Red: [{ start: 1, end: 4 }],
  Blue: [{ start: 16, end: 19 }],
  Yellow: [{ start: 31, end: 34 }],
  Green: [{ start: 46, end: 49 }],
}
