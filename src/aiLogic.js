import { COLORS, HOME_ENTRY_INDEX, START_INDEX, HOME_PATHS, SLIDES, TRACK_LENGTH } from './constants'

// Lightweight copies of helpers the AI relies on. These are intentionally
// pure and do not touch React state.
export function isOnTrack(pawn) {
  return pawn?.region === 'track' && typeof pawn.index === 'number'
}

export function isInStart(pawn) {
  return pawn?.region === 'start'
}

export function getMovableFor(card, color, pawnsByColor, simulateMove, getMoveFrames) {
  if (card === null || card === undefined) return null
  if (card === 'Sorry') return null

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

    const last = frames[frames.length - 1]
    const blocked =
      last.region === 'safety' &&
      list.some((other, j) => {
        if (j === idx) return false
        if (!(other && other.region === 'safety')) return false
        if (typeof other.safetyIndex !== 'number') return false
        return other.safetyIndex === last.safetyIndex
      })

    if (!blocked) indices.push(idx)
  })

  if (!indices.length) return null
  return { color, indices }
}

export function hasSorryMove(color, pawnsByColor) {
  const mine = pawnsByColor[color] || []
  const hasStart = mine.some(isInStart)
  if (!hasStart) return false

  for (const c of COLORS) {
    if (c === color) continue
    const list = pawnsByColor[c] || []
    if (list.some(isOnTrack)) return true
  }
  return false
}

export function getTrackSlideInfo(index) {
  let finalIndex = index
  let slideDistance = 0
  let affected = [index]
  for (const [, slides] of Object.entries(SLIDES)) {
    for (const s of slides) {
      if (index >= s.start && index <= s.end) {
        for (let i = index + 1; i <= s.end; i++) affected.push(i)
        finalIndex = s.end
        slideDistance = s.end - index
        return { finalIndex, slideDistance, affected }
      }
    }
  }
  return { finalIndex, slideDistance, affected }
}

export function computeThreatAgainst(attackerColor, defenderColor, card, pawns, getMovableForFn, getMoveFrames) {
  if (typeof card !== 'number') return 0
  const moveInfo = getMovableForFn(card, attackerColor, pawns)
  if (!moveInfo) return 0
  const indices = moveInfo.indices || []
  if (!indices.length) return 0
  const list = pawns[attackerColor] || []
  const defList = pawns[defenderColor] || []
  let best = 0

  const isZeroCard = card === 0
  const numeric = isZeroCard ? 1 : Number(card)
  if (!numeric) return 0

  indices.forEach((pawnIndex) => {
    const pawn = list[pawnIndex]
    if (!pawn) return
    const frames = getMoveFrames(attackerColor, pawn, numeric)
    if (!frames.length) return
    const last = frames[frames.length - 1]
    if (!(last.region === 'track' && typeof last.index === 'number')) return

    const { slideDistance, affected } = getTrackSlideInfo(last.index)
    const hits = defList.some(
      (p) =>
        p &&
        isOnTrack(p) &&
        typeof p.index === 'number' &&
        affected.includes(p.index)
    )
    if (!hits) return
    let threat = 120
    if (slideDistance > 0) threat += slideDistance * 2
    if (threat > best) best = threat
  })

  return best
}

export function chooseAiNumericPlay(params) {
  const {
    aiColor,
    hand,
    pawns,
    effectiveAiColors,
    selectedIndex,
    currentCard,
    simulateMove,
    getMoveFrames,
  } = params

  const list = pawns[aiColor] || []
  const entryIndex = START_INDEX[aiColor]

  let best = null

  hand.forEach((card, index) => {
    if (typeof card !== 'number') return

    const moveInfo = getMovableFor(card, aiColor, pawns, simulateMove, getMoveFrames)
    if (!moveInfo) return

    const indices = moveInfo.indices || []
    if (!indices.length) return

    let pawnIndex = null
    for (const pi of indices) {
      const pawn = list[pi]
      if (pawn && pawn.region === 'start') {
        pawnIndex = pi
        break
      }
    }
    if (pawnIndex === null) pawnIndex = indices[0]

    const pawn = list[pawnIndex]
    if (!pawn) return

    const isZeroCard = card === 0
    const numeric = isZeroCard ? 1 : Number(card)
    const frames = getMoveFrames(aiColor, pawn, numeric)
    if (!frames.length) return
    const last = frames[frames.length - 1]

    let landsOnOwn = false
    let landsOnEnemy = false
    let slideDistance = 0
    let finalTrackIndex = null
    if (last.region === 'track' && typeof last.index === 'number') {
      const { finalIndex, slideDistance: sd, affected } = getTrackSlideInfo(last.index)
      slideDistance = sd
      finalTrackIndex = finalIndex

      landsOnOwn = list.some((other, j) => {
        if (j === pawnIndex) return false
        return (
          other &&
          isOnTrack(other) &&
          typeof other.index === 'number' &&
          affected.includes(other.index)
        )
      })
      if (!landsOnOwn) {
        for (const oppColor of COLORS) {
          if (oppColor === aiColor) continue
          const oppList = pawns[oppColor] || []
          if (
            oppList.some(
              (other) =>
                other &&
                isOnTrack(other) &&
                typeof other.index === 'number' &&
                affected.includes(other.index)
            )
          ) {
            landsOnEnemy = true
            break
          }
        }
      }
    }

    let score = 0

    if (numeric > 0) {
      score += numeric
    } else if (numeric < 0) {
      score += Math.abs(numeric) * 0.5
    }

    if (finalTrackIndex != null && isOnTrack(pawn)) {
      const beforeIndex = pawn.index
      if (typeof beforeIndex === 'number') {
        const homeEntry = HOME_ENTRY_INDEX[aiColor]
        const beforeDist = (homeEntry - beforeIndex + TRACK_LENGTH) % TRACK_LENGTH
        const afterDist = (homeEntry - finalTrackIndex + TRACK_LENGTH) % TRACK_LENGTH
        const gain = beforeDist - afterDist
        if (gain !== 0) {
          score += gain * 2
        }
      }
    }

    if (slideDistance > 0) {
      score += slideDistance * 2
    }

    const homePath = HOME_PATHS[aiColor]
    if (homePath && homePath.length) {
      const lastSafety = homePath.length - 1
      const beforeSafe =
        pawn && pawn.region === 'safety'
          ? Math.min(typeof pawn.safetyIndex === 'number' ? pawn.safetyIndex : lastSafety, lastSafety)
          : -1
      let afterSafe = null
      if (last.region === 'safety') {
        afterSafe = Math.min(
          typeof last.safetyIndex === 'number' ? last.safetyIndex : 0,
          lastSafety
        )
      }

      if (afterSafe != null) {
        const gainSafe = afterSafe - Math.max(beforeSafe, -1)
        if (gainSafe > 0) {
          score += gainSafe * 15
        }
        if (afterSafe === lastSafety) {
          score += 80
        }
      }
    }

    if (pawn.region === 'start' && !landsOnOwn && last.region === 'track' && last.index === entryIndex) {
      score += 100
    }

    if (landsOnOwn) {
      score -= 1000
    }

    if (landsOnEnemy) {
      score += 120
    }

    const aiIndex = COLORS.indexOf(aiColor)
    if (aiIndex !== -1) {
      const nextColor = COLORS[(aiIndex + 1) % COLORS.length]
      const deny = computeThreatAgainst(nextColor, aiColor, card, pawns, (c, col, p) =>
        getMovableFor(c, col, p, simulateMove, getMoveFrames)
      , getMoveFrames)
      if (deny > 0) {
        score += deny
      }
    }

    if (!best || score > best.score) {
      best = { card, index, pawnIndex, score }
    }
  })

  return best
}

export function chooseAiSorryPlay(aiColor, hand, pawns) {
  const sorryIndex = hand.findIndex((c) => c === 'Sorry')
  if (sorryIndex === -1) return null

  const myList = pawns[aiColor] || []
  const hasStart = myList.some(isInStart)
  if (!hasStart) return null

  const homeEntry = HOME_ENTRY_INDEX[aiColor]
  let bestTarget = null
  for (const oppColor of COLORS) {
    if (oppColor === aiColor) continue
    const oppList = pawns[oppColor] || []
    oppList.forEach((p, idx) => {
      if (!isOnTrack(p)) return
      if (typeof p.index !== 'number') return
      const dist = (homeEntry - p.index + TRACK_LENGTH) % TRACK_LENGTH
      if (!bestTarget || dist < bestTarget.dist) {
        bestTarget = { oppColor, idx, dist }
      }
    })
  }

  if (!bestTarget) return null

  return {
    sorryIndex,
    targetColor: bestTarget.oppColor,
    targetIndex: bestTarget.idx,
  }
}

export function chooseAiSwapPlay(aiColor, hand, pawns) {
  const swapIndex = hand.findIndex((c) => c === 'Swap')
  if (swapIndex === -1) return null

  const myList = pawns[aiColor] || []
  const homeEntry = HOME_ENTRY_INDEX[aiColor]
  if (typeof homeEntry !== 'number') return null

  let best = null

  myList.forEach((pawn, i) => {
    if (!isOnTrack(pawn) || typeof pawn.index !== 'number') return
    const beforeIndex = pawn.index
    const beforeDist = (homeEntry - beforeIndex + TRACK_LENGTH) % TRACK_LENGTH

    for (const oppColor of COLORS) {
      if (oppColor === aiColor) continue
      const oppList = pawns[oppColor] || []
      const oppHome = HOME_ENTRY_INDEX[oppColor]

      oppList.forEach((oppPawn, j) => {
        if (!isOnTrack(oppPawn) || typeof oppPawn.index !== 'number') return

        const afterDist = (homeEntry - oppPawn.index + TRACK_LENGTH) % TRACK_LENGTH
        const aiGain = beforeDist - afterDist
        if (aiGain <= 0) return

        let score = aiGain * 3
        if (typeof oppHome === 'number') {
          const oppBefore = (oppHome - oppPawn.index + TRACK_LENGTH) % TRACK_LENGTH
          const oppAfter = (oppHome - beforeIndex + TRACK_LENGTH) % TRACK_LENGTH
          const oppGain = oppBefore - oppAfter
          if (oppGain > 0) score -= oppGain * 2
        }

        if (!best || score > best.score) {
          best = {
            swapIndex,
            srcIndex: i,
            dstColor: oppColor,
            dstIndex: j,
            score,
          }
        }
      })
    }
  })

  return best
}
