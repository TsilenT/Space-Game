import { cellAt, isOpaque, type Point, type TacticalMap } from './map'

export function hasLineOfSight(map: TacticalMap, from: Point, to: Point): boolean {
  if (!cellAt(map, from) || !cellAt(map, to)) return false
  if (from.x === to.x && from.y === to.y) return true

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
      const horizontalNeighbor = { x: x + directionX, y }
      const verticalNeighbor = { x, y: y + directionY }
      if (isOpaque(map, horizontalNeighbor) && isOpaque(map, verticalNeighbor)) return false
      x += directionX
      y += directionY
      crossedX += 1
      crossedY += 1
    } else if (nextVertical < nextHorizontal) {
      x += directionX
      crossedX += 1
    } else {
      y += directionY
      crossedY += 1
    }

    if (x === to.x && y === to.y) return true
    if (isOpaque(map, { x, y })) return false
  }

  return true
}

const distance = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

export function visibleCells(map: TacticalMap, observers: readonly Point[], range: number): Point[] {
  return map.cells
    .filter(cell => observers.some(observer => distance(observer, cell) <= range && hasLineOfSight(map, observer, cell)))
    .map(({ x, y }) => ({ x, y }))
}
