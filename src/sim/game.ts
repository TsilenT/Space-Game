import {
  BOARDING_MISSION,
  cellAt,
  isWalkable,
  key,
  roomAt,
  type CellKey,
  type Point,
  type TacticalMap,
  type TacticalMission,
  type TacticalObjective,
  type Team,
  type UnitPlacement,
} from './map'
import { hasLineOfSight, visibleCells as cellsVisibleFrom } from './visibility'

export type { Cell, CellKey, Point, Team } from './map'

export type Phase = 'player' | 'enemy'
export type Status = 'playing' | 'victory' | 'defeat'
export type MissionResolution =
  | { readonly result: 'victory'; readonly reason: 'hostiles-eliminated' | 'survivor-rescued' }
  | { readonly result: 'defeat'; readonly reason: 'crew-lost' | 'deadline-expired' }

export interface Unit extends Point {
  id: string
  name: string
  role: string
  team: Team
  hp: number
  maxHp: number
  ap: number
}

export interface GameState {
  mission: TacticalMission
  map: TacticalMap
  objective: TacticalObjective
  visionRange: number
  units: Unit[]
  phase: Phase
  status: Status
  resolution?: MissionResolution
  turn: number
  selectedId?: string
  explored: CellKey[]
  openDoors: CellKey[]
  log: string[]
}

const ATTACK_RANGE = 4
const ATTACK_COST = 2
const DEFAULT_CREW_DAMAGE = 3
const ENEMY_DAMAGE = 2

const alive = (unit: Unit): boolean => unit.hp > 0
const distance = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

function createUnit(placement: UnitPlacement): Unit {
  return { ...placement, maxHp: placement.maxHp ?? placement.hp }
}

export function createGame(mission: TacticalMission = BOARDING_MISSION): GameState {
  return reveal(evaluateMission({
    mission,
    map: mission.map,
    objective: mission.objective,
    visionRange: mission.visionRange,
    phase: 'player',
    status: 'playing',
    turn: 1,
    selectedId: mission.units.find(unit => unit.team === 'crew')?.id,
    explored: [],
    openDoors: [],
    log: [`Mission started. ${mission.objective.label}.`],
    units: mission.units.map(createUnit),
  }))
}

function activeMap(state: GameState): TacticalMap {
  if (state.openDoors.length === 0) return state.map
  const open = new Set(state.openDoors)
  return { ...state.map, cells: state.map.cells.map(cell => cell.door && open.has(key(cell)) ? { ...cell, opaque: false } : cell) }
}

export function currentVisibility(state: GameState): Point[] {
  const observers = state.units.filter(unit => unit.team === 'crew' && alive(unit))
  return cellsVisibleFrom(activeMap(state), observers, state.visionRange)
}

export function isCellVisible(state: GameState, point: Point): boolean {
  return currentVisibility(state).some(cell => key(cell) === key(point))
}

export function isCellExplored(state: GameState, point: Point): boolean {
  return state.explored.includes(key(point))
}

function reveal(state: GameState): GameState {
  const known = new Set<CellKey>(state.explored)
  currentVisibility(state).forEach(point => known.add(key(point)))
  const explored = state.map.cells.map(key).filter(cellKey => known.has(cellKey))
  return { ...state, explored }
}

function occupied(state: GameState, point: Point, ignore?: string): boolean {
  return state.units.some(unit => alive(unit) && unit.id !== ignore && unit.x === point.x && unit.y === point.y)
}

function isClosedDoor(state: GameState, point: Point): boolean {
  return cellAt(state.map, point)?.door === true && !state.openDoors.includes(key(point))
}

function neighbors(map: TacticalMap, point: Point): Point[] {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 },
  ].filter(candidate => isWalkable(map, candidate))
}

export function selectUnit(state: GameState, id: string): GameState {
  const unit = state.units.find(candidate => candidate.id === id)
  if (state.phase !== 'player' || state.status !== 'playing' || unit?.team !== 'crew' || !alive(unit)) return state
  return { ...state, selectedId: id }
}

export function legalMoves(state: GameState): Point[] {
  const unit = state.units.find(candidate => candidate.id === state.selectedId)
  if (!unit || state.phase !== 'player' || state.status !== 'playing' || !alive(unit)) return []

  const visible = new Set(currentVisibility(state).map(key))
  const seen = new Map<CellKey, number>([[key(unit), 0]])
  const queue: Point[] = [unit]
  const moves: Point[] = []

  while (queue.length > 0) {
    const point = queue.shift()!
    const cost = seen.get(key(point))!
    if (cost >= unit.ap) continue

    for (const neighbor of neighbors(state.map, point)) {
      const neighborKey = key(neighbor)
      if (seen.has(neighborKey) || !visible.has(neighborKey) || occupied(state, neighbor, unit.id)) continue
      seen.set(neighborKey, cost + 1)
      moves.push(neighbor)
      if (!isClosedDoor(state, neighbor)) queue.push(neighbor)
    }
  }

  return moves
}

function shortestDistance(state: GameState, start: Point, end: Point, ignore?: string): number {
  const allowed = new Set(currentVisibility(state).map(key))
  const queue: Array<[Point, number]> = [[start, 0]]
  const seen = new Set<CellKey>([key(start)])

  while (queue.length > 0) {
    const [point, cost] = queue.shift()!
    if (key(point) === key(end)) return cost
    for (const neighbor of neighbors(state.map, point)) {
      const neighborKey = key(neighbor)
      if (seen.has(neighborKey) || !allowed.has(neighborKey) || occupied(state, neighbor, ignore)) continue
      seen.add(neighborKey)
      if (neighborKey === key(end) || !isClosedDoor(state, neighbor)) queue.push([neighbor, cost + 1])
    }
  }

  return Number.POSITIVE_INFINITY
}

export function move(state: GameState, x: number, y: number): GameState {
  const unit = state.units.find(candidate => candidate.id === state.selectedId)
  const target = { x, y }
  if (!unit || !legalMoves(state).some(point => key(point) === key(target))) return state

  const cost = shortestDistance(state, unit, target, unit.id)
  const doorCell = cellAt(state.map, target)
  const opensDoor = doorCell?.door && !state.openDoors.includes(key(target))
  return reveal(evaluateMission({
    ...state,
    units: state.units.map(candidate => candidate.id === unit.id ? { ...candidate, x, y, ap: candidate.ap - cost } : candidate),
    openDoors: opensDoor ? [...state.openDoors, key(target)] : state.openDoors,
    log: [
      opensDoor ? `${unit.name} forces open the ${doorCell!.room} door.` : `${unit.name} moved into ${roomAt(state.map, target)}.`,
      ...state.log,
    ].slice(0, 5),
  }))
}

function finishMission(state: GameState, resolution: MissionResolution, log: string): GameState {
  return {
    ...state,
    status: resolution.result,
    resolution,
    selectedId: undefined,
    log: [log, ...state.log].slice(0, 5),
  }
}

function evaluateMission(state: GameState, roundEnded = false): GameState {
  if (state.status !== 'playing') return state

  const livingCrew = state.units.filter(unit => unit.team === 'crew' && alive(unit))
  if (livingCrew.length === 0) {
    return finishMission(state, { result: 'defeat', reason: 'crew-lost' }, 'No boarding crew remain operational.')
  }

  const objective = state.objective
  if (objective.kind === 'eliminate') {
    const enemyAlive = state.units.some(unit => unit.team === 'enemy' && alive(unit))
    return enemyAlive
      ? state
      : finishMission(state, { result: 'victory', reason: 'hostiles-eliminated' }, 'All hostile contacts eliminated.')
  }

  const survivorReached = livingCrew.some(unit => unit.x === objective.target.x && unit.y === objective.target.y)
  if (survivorReached) {
    return finishMission(state, { result: 'victory', reason: 'survivor-rescued' }, `${objective.targetName} secured.`)
  }

  if (roundEnded && state.turn >= objective.deadlineTurn) {
    const destroyed = {
      ...state,
      units: state.units.map(unit => unit.team === 'crew' ? { ...unit, hp: 0 } : unit),
    }
    return finishMission(destroyed, { result: 'defeat', reason: 'deadline-expired' }, 'The stricken ship detonated with the boarding crew aboard.')
  }

  return state
}

function canHit(state: GameState, attacker: Unit, target: Unit): boolean {
  return alive(attacker)
    && alive(target)
    && attacker.team !== target.team
    && distance(attacker, target) <= ATTACK_RANGE
    && hasLineOfSight(activeMap(state), attacker, target)
}

export function legalTargets(state: GameState): Unit[] {
  const attacker = state.units.find(unit => unit.id === state.selectedId)
  if (state.phase !== 'player' || state.status !== 'playing' || !attacker || attacker.team !== 'crew' || attacker.ap < ATTACK_COST) return []
  const visible = new Set(currentVisibility(state).map(key))
  return state.units.filter(target => visible.has(key(target)) && canHit(state, attacker, target)).sort((a, b) => a.id.localeCompare(b.id))
}

export function attack(state: GameState, targetId: string): GameState {
  const attacker = state.units.find(unit => unit.id === state.selectedId)
  const target = legalTargets(state).find(unit => unit.id === targetId)
  if (!attacker || !target) return state

  const damage = state.mission.crewDamage ?? DEFAULT_CREW_DAMAGE
  return reveal(evaluateMission({
    ...state,
    units: state.units.map(unit => unit.id === attacker.id
      ? { ...unit, ap: unit.ap - ATTACK_COST }
      : unit.id === target.id
        ? { ...unit, hp: Math.max(0, unit.hp - damage) }
        : unit),
    log: [`${attacker.name} fires on ${target.name}: ${damage} damage.`, ...state.log].slice(0, 5),
  }))
}

export function endTurn(state: GameState): GameState {
  if (state.phase !== 'player' || state.status !== 'playing') return state
  return {
    ...state,
    phase: 'enemy',
    selectedId: undefined,
    units: state.units.map(unit => unit.team === 'enemy' ? { ...unit, ap: 4 } : unit),
    log: ['Enemy activity detected…', ...state.log].slice(0, 5),
  }
}

function pathDistance(state: GameState, start: Point, end: Point, ignore?: string): number {
  const queue: Array<[Point, number]> = [[start, 0]]
  const seen = new Set<CellKey>([key(start)])

  while (queue.length > 0) {
    const [point, cost] = queue.shift()!
    if (key(point) === key(end)) return cost
    for (const neighbor of neighbors(state.map, point)) {
      const neighborKey = key(neighbor)
      if (seen.has(neighborKey) || (neighborKey !== key(end) && occupied(state, neighbor, ignore))) continue
      seen.add(neighborKey)
      queue.push([neighbor, cost + 1])
    }
  }

  return Number.POSITIVE_INFINITY
}

export function enemyTurn(input: GameState): GameState {
  if (input.phase !== 'enemy') return input
  let state = evaluateMission(input)
  if (state.status !== 'playing') return reveal(state)

  const enemies = state.units.filter(unit => unit.team === 'enemy' && alive(unit)).sort((a, b) => a.id.localeCompare(b.id))
  for (const enemy of enemies) {
    const current = state.units.find(unit => unit.id === enemy.id)!
    const targets = state.units
      .filter(unit => unit.team === 'crew' && alive(unit))
      .sort((a, b) => distance(current, a) - distance(current, b) || a.id.localeCompare(b.id))
    const nearest = targets[0]
    if (!nearest) break

    const attackTarget = targets.find(target => canHit(state, current, target))
    if (attackTarget) {
      state = {
        ...state,
        units: state.units.map(unit => unit.id === attackTarget.id ? { ...unit, hp: Math.max(0, unit.hp - ENEMY_DAMAGE) } : unit),
        log: [`${current.name} strikes ${attackTarget.name}: ${ENEMY_DAMAGE} damage.`, ...state.log].slice(0, 5),
      }
    } else {
      const wasVisible = isCellVisible(state, current)
      const options = neighbors(state.map, current)
        .filter(point => !occupied(state, point, current.id))
        .sort((a, b) => pathDistance(state, a, nearest, current.id) - pathDistance(state, b, nearest, current.id) || a.y - b.y || a.x - b.x)
      const destination = options[0]
      if (destination) {
        const doorCell = cellAt(state.map, destination)
        const opensDoor = doorCell?.door && !state.openDoors.includes(key(destination))
        state = {
          ...state,
          units: state.units.map(unit => unit.id === current.id ? { ...unit, ...destination } : unit),
          openDoors: opensDoor ? [...state.openDoors, key(destination)] : state.openDoors,
        }
        if (wasVisible || isCellVisible(state, destination)) {
          state = { ...state, log: [opensDoor ? `${current.name} forces open the ${doorCell!.room} door.` : `${current.name} advances.`, ...state.log].slice(0, 5) }
        }
      }
    }

    state = evaluateMission(state)
    if (state.status !== 'playing') return reveal(state)
  }

  state = evaluateMission(state, true)
  if (state.status !== 'playing') return reveal(state)

  return reveal({
    ...state,
    phase: 'player',
    turn: state.turn + 1,
    selectedId: state.units.find(unit => unit.team === 'crew' && alive(unit))?.id,
    units: state.units.map(unit => unit.team === 'crew' && alive(unit) ? { ...unit, ap: 4 } : unit),
  })
}
