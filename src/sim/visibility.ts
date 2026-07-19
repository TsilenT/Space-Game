import { cellAt, doorKey, isOpaque, type DoorKey, type Point, type TacticalMap } from './map'

const NO_EDGES: ReadonlySet<DoorKey> = new Set()

/**
 * Line of sight across the cell grid. `closedEdges` holds the door edges that
 * are currently shut: sight cannot cross a closed edge, and a diagonal step
 * is blocked when both ways around its corner are sealed by walls or closed
 * doors.
 */
export function hasLineOfSight(map: TacticalMap, from: Point, to: Point, closedEdges: ReadonlySet<DoorKey> = NO_EDGES): boolean {
  if (!cellAt(map, from) || !cellAt(map, to)) return false
  if (from.x === to.x && from.y === to.y) return true

  const sealed = (a: Point, b: Point): boolean => closedEdges.has(doorKey(a, b))
  const deltaX = to.x - from.x
  const deltaY = to.y - from.y
  const stepsX = Math.abs(deltaX)
  const stepsY = Math.abs(deltaY)
  const directionX = Math.sign(deltaX)
  const directionY = Math.sign(deltaY)
  let crossedX = 0
  let crossedY = 0
  let x = from.x
  let y = from.y

  while (crossedX < stepsX || crossedY < stepsY) {
    const nextVertical = (2 * crossedX + 1) * stepsY
    const nextHorizontal = (2 * crossedY + 1) * stepsX

    if (nextVertical === nextHorizontal) {
      const here = { x, y }
      const horizontalNeighbor = { x: x + directionX, y }
      const verticalNeighbor = { x, y: y + directionY }
      const target = { x: x + directionX, y: y + directionY }
      const throughHorizontal = !isOpaque(map, horizontalNeighbor) && !sealed(here, horizontalNeighbor) && !sealed(horizontalNeighbor, target)
      const throughVertical = !isOpaque(map, verticalNeighbor) && !sealed(here, verticalNeighbor) && !sealed(verticalNeighbor, target)
      if (!throughHorizontal && !throughVertical) return false
      x += directionX
      y += directionY
      crossedX += 1
      crossedY += 1
    } else if (nextVertical < nextHorizontal) {
      if (sealed({ x, y }, { x: x + directionX, y })) return false
      x += directionX
      crossedX += 1
    } else {
      if (sealed({ x, y }, { x, y: y + directionY })) return false
      y += directionY
      crossedY += 1
    }

    if (x === to.x && y === to.y) return true
    if (isOpaque(map, { x, y })) return false
  }

  return true
}

const distance = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

export function visibleCells(map: TacticalMap, observers: readonly Point[], range: number, closedEdges: ReadonlySet<DoorKey> = NO_EDGES): Point[] {
  return map.cells
    .filter(cell => observers.some(observer => distance(observer, cell) <= range && hasLineOfSight(map, observer, cell, closedEdges)))
    .map(({ x, y }) => ({ x, y }))
}
