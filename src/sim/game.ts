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
export type FireModeId = 'snap' | 'auto' | 'aimed'

export interface FireMode {
  readonly id: FireModeId
  readonly label: string
  readonly cost: number
  readonly shots: number
  readonly factor: number
}

export interface Unit extends Point {
  id: string
  name: string
  role: string
  team: Team
  hp: number
  maxHp: number
  ap: number
  accuracy: number
  hits: number
}

/** One resolved round of fire, with everything the renderer needs to replay it. */
export interface ShotResult {
  readonly shooterId: string
  readonly team: Team
  readonly from: Point
  readonly aimAt: Point
  readonly impact: Point
  readonly hitUnitId?: string
  readonly hitStructureAt?: Point
  readonly structureDestroyed?: boolean
  readonly damage: number
  readonly killed: boolean
  readonly deviationDeg: number
  readonly struckObstacle: boolean
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
  structureHp: Readonly<Record<CellKey, number>>
  rngState: number
  lastShots: readonly ShotResult[]
  log: string[]
}

export const FIRE_MODES: Readonly<Record<FireModeId, FireMode>> = {
  snap: { id: 'snap', label: 'Snap shot', cost: 4, shots: 1, factor: 0.85 },
  auto: { id: 'auto', label: 'Auto shot', cost: 8, shots: 3, factor: 0.6 },
  aimed: { id: 'aimed', label: 'Aimed shot', cost: 10, shots: 1, factor: 1.15 },
}

export const TURN_TIME_UNITS = 12
export const MOVE_COST = 3
const ATTACK_RANGE = 8
const DEFAULT_CREW_DAMAGE = 3
const ENEMY_DAMAGE = 2
const DISTANCE_PENALTY = 3
const COVER_PENALTY = 20
const MIN_CHANCE = 5
const MAX_CHANCE = 95
const DEFAULT_MISSION_SEED = 1
const BASE_DEVIATION_DEG = 4
const DEVIATION_PER_OVERSHOOT = 0.3
const STRAY_OVERSHOOT_TILES = 4

const alive = (unit: Unit): boolean => unit.hp > 0
const distance = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

function nextSeed(seed: number): number {
  return (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
}

function createUnit(placement: UnitPlacement): Unit {
  return { ...placement, maxHp: placement.maxHp ?? placement.hp, hits: 0 }
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
    structureHp: Object.fromEntries(mission.map.cells.filter(cell => cell.structure).map(cell => [key(cell), cell.structure!.hp])),
    rngState: (mission.seed ?? DEFAULT_MISSION_SEED) >>> 0,
    lastShots: [],
    log: [`Mission started. ${mission.objective.label}.`],
    units: mission.units.map(createUnit),
  }))
}

function isDestroyed(state: GameState, cellKey: CellKey): boolean {
  return state.structureHp[cellKey] !== undefined && state.structureHp[cellKey] <= 0
}

function activeMap(state: GameState): TacticalMap {
  const open = new Set(state.openDoors)
  const anyDestroyed = Object.values(state.structureHp).some(hp => hp <= 0)
  if (open.size === 0 && !anyDestroyed) return state.map
  return {
    ...state.map,
    cells: state.map.cells.map(cell => {
      if (cell.door && open.has(key(cell))) return { ...cell, opaque: false }
      if (cell.structure && isDestroyed(state, key(cell))) return { ...cell, walkable: true, cover: false }
      return cell
    }),
  }
}

/** Walkability including opened doors and destroyed structures. */
export function isCellWalkable(state: GameState, point: Point): boolean {
  return isWalkable(activeMap(state), point)
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

  const map = activeMap(state)
  const visible = new Set(currentVisibility(state).map(key))
  const seen = new Map<CellKey, number>([[key(unit), 0]])
  const queue: Point[] = [unit]
  const moves: Point[] = []

  while (queue.length > 0) {
    const point = queue.shift()!
    const cost = seen.get(key(point))!
    if (cost + MOVE_COST > unit.ap) continue

    for (const neighbor of neighbors(map, point)) {
      const neighborKey = key(neighbor)
      if (seen.has(neighborKey) || !visible.has(neighborKey) || occupied(state, neighbor, unit.id)) continue
      seen.set(neighborKey, cost + MOVE_COST)
      moves.push(neighbor)
      if (!isClosedDoor(state, neighbor)) queue.push(neighbor)
    }
  }

  return moves
}

function shortestDistance(state: GameState, start: Point, end: Point, ignore?: string): number {
  const map = activeMap(state)
  const allowed = new Set(currentVisibility(state).map(key))
  const queue: Array<[Point, number]> = [[start, 0]]
  const seen = new Set<CellKey>([key(start)])

  while (queue.length > 0) {
    const [point, cost] = queue.shift()!
    if (key(point) === key(end)) return cost
    for (const neighbor of neighbors(map, point)) {
      const neighborKey = key(neighbor)
      if (seen.has(neighborKey) || !allowed.has(neighborKey) || occupied(state, neighbor, ignore)) continue
      seen.add(neighborKey)
      if (neighborKey === key(end) || !isClosedDoor(state, neighbor)) queue.push([neighbor, cost + MOVE_COST])
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
    lastShots: [],
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

/** True when a cover cell shields the target on its shooter-facing side. */
function targetInCover(state: GameState, shooter: Point, target: Point): boolean {
  const dx = Math.sign(shooter.x - target.x)
  const dy = Math.sign(shooter.y - target.y)
  const shields = [
    dx !== 0 ? { x: target.x + dx, y: target.y } : undefined,
    dy !== 0 ? { x: target.x, y: target.y + dy } : undefined,
  ]
  return shields.some(cell => cell && cellAt(activeMap(state), cell)?.cover === true)
}

export function hitChance(state: GameState, attacker: Unit, target: Unit, mode: FireModeId): number {
  const base = attacker.accuracy * FIRE_MODES[mode].factor
  const range = DISTANCE_PENALTY * Math.max(0, distance(attacker, target) - 1)
  const cover = targetInCover(state, attacker, target) ? COVER_PENALTY : 0
  return Math.min(MAX_CHANCE, Math.max(MIN_CHANCE, Math.round(base - range - cover)))
}

export function legalTargets(state: GameState, mode: FireModeId = 'snap'): Unit[] {
  const attacker = state.units.find(unit => unit.id === state.selectedId)
  if (state.phase !== 'player' || state.status !== 'playing' || !attacker || attacker.team !== 'crew' || attacker.ap < FIRE_MODES[mode].cost) return []
  const visible = new Set(currentVisibility(state).map(key))
  return state.units.filter(target => visible.has(key(target)) && canHit(state, attacker, target)).sort((a, b) => a.id.localeCompare(b.id))
}

interface StrayOutcome {
  readonly impact: Point
  readonly victimId?: string
  readonly struckObstacle: boolean
  readonly structureAt?: Point
}

/**
 * Walk a deviated round from the shooter until it strikes a wall, a closed
 * door, a structure, or a unit — friend or foe. The intended target is
 * excluded: a round that already missed it streaks past. A struck structure
 * is reported so the round can chew into it.
 */
function traceStray(map: TacticalMap, units: readonly Unit[], shooter: Unit, aimAt: Point, angleRad: number, maxDist: number): StrayOutcome {
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  let lastInBounds: Point = { x: shooter.x, y: shooter.y }
  let previousKey = key(shooter)

  for (let travelled = 0.3; travelled <= maxDist; travelled += 0.2) {
    const cell = { x: Math.round(shooter.x + cos * travelled), y: Math.round(shooter.y + sin * travelled) }
    const cellKey = key(cell)
    if (cellKey === previousKey) continue
    previousKey = cellKey
    if (cell.x === shooter.x && cell.y === shooter.y) continue

    const mapCell = cellAt(map, cell)
    if (!mapCell) return { impact: lastInBounds, struckObstacle: true }
    lastInBounds = cell
    if (mapCell.opaque || mapCell.cover) {
      return { impact: cell, struckObstacle: true, structureAt: mapCell.structure && mapCell.cover ? cell : undefined }
    }

    const victim = units.find(unit => alive(unit) && unit.x === cell.x && unit.y === cell.y
      && unit.id !== shooter.id && !(unit.x === aimAt.x && unit.y === aimAt.y))
    if (victim) return { impact: cell, victimId: victim.id, struckObstacle: false }
  }

  return { impact: lastInBounds, struckObstacle: false }
}

interface RoundOutcome {
  readonly units: Unit[]
  readonly structureHp: Readonly<Record<CellKey, number>>
  readonly rngState: number
  readonly shot: ShotResult
}

/** Resolve one round of fire against the to-hit roll, tracing strays into the world. */
function resolveRound(map: TacticalMap, units: Unit[], structureHp: Readonly<Record<CellKey, number>>, rngInput: number, shooter: Unit, target: Unit, chance: number, damage: number): RoundOutcome {
  let rngState = nextSeed(rngInput)
  const roll = (rngState / 0x1_0000_0000) * 100
  const base = {
    shooterId: shooter.id,
    team: shooter.team,
    from: { x: shooter.x, y: shooter.y },
    aimAt: { x: target.x, y: target.y },
    damage,
  }

  if (roll < chance) {
    const hp = Math.max(0, target.hp - damage)
    return {
      rngState,
      structureHp,
      units: units.map(unit => unit.id === target.id ? { ...unit, hp } : unit),
      shot: { ...base, impact: { x: target.x, y: target.y }, hitUnitId: target.id, killed: hp === 0, deviationDeg: 0, struckObstacle: false },
    }
  }

  const overshoot = roll - chance
  rngState = nextSeed(rngState)
  const side = rngState / 0x1_0000_0000 < 0.5 ? -1 : 1
  const deviationDeg = side * (BASE_DEVIATION_DEG + overshoot * DEVIATION_PER_OVERSHOOT)
  const aim = Math.atan2(target.y - shooter.y, target.x - shooter.x)
  const maxDist = Math.hypot(target.x - shooter.x, target.y - shooter.y) + STRAY_OVERSHOOT_TILES
  const stray = traceStray(map, units, shooter, target, aim + (deviationDeg * Math.PI) / 180, maxDist)
  const victim = stray.victimId ? units.find(unit => unit.id === stray.victimId)! : undefined
  const hp = victim ? Math.max(0, victim.hp - damage) : 0
  const structureKey = stray.structureAt ? key(stray.structureAt) : undefined
  const struckStructure = structureKey !== undefined && (structureHp[structureKey] ?? 0) > 0
  const structureLeft = struckStructure ? Math.max(0, structureHp[structureKey!] - damage) : 0
  return {
    rngState,
    structureHp: struckStructure ? { ...structureHp, [structureKey!]: structureLeft } : structureHp,
    units: victim ? units.map(unit => unit.id === victim.id ? { ...unit, hp } : unit) : units,
    shot: {
      ...base,
      impact: stray.impact,
      hitUnitId: stray.victimId,
      hitStructureAt: struckStructure ? stray.structureAt : undefined,
      structureDestroyed: struckStructure ? structureLeft === 0 : undefined,
      damage: victim || struckStructure ? damage : 0,
      killed: victim ? hp === 0 : false,
      deviationDeg,
      struckObstacle: stray.struckObstacle,
    },
  }
}

export function attack(state: GameState, targetId: string, modeId: FireModeId = 'snap'): GameState {
  const attacker = state.units.find(unit => unit.id === state.selectedId)
  const target = legalTargets(state, modeId).find(unit => unit.id === targetId)
  if (!attacker || !target) return state

  const mode = FIRE_MODES[modeId]
  const chance = hitChance(state, attacker, target, modeId)
  const damage = state.mission.crewDamage ?? DEFAULT_CREW_DAMAGE
  const map = activeMap(state)
  let units = state.units
  let structureHp = state.structureHp
  let rngState = state.rngState
  const shots: ShotResult[] = []
  const strayReports: string[] = []
  let directHits = 0
  let trainedHits = 0

  for (let round = 0; round < mode.shots; round++) {
    const liveTarget = units.find(unit => unit.id === target.id)!
    if (!alive(liveTarget)) break
    const shooter = units.find(unit => unit.id === attacker.id)!
    const outcome = resolveRound(map, units, structureHp, rngState, shooter, liveTarget, chance, damage)
    units = outcome.units
    structureHp = outcome.structureHp
    rngState = outcome.rngState
    shots.push(outcome.shot)
    if (outcome.shot.hitUnitId === target.id) directHits += 1
    if (outcome.shot.hitUnitId) {
      const struck = units.find(unit => unit.id === outcome.shot.hitUnitId)!
      if (struck.team === 'enemy') trainedHits += 1
      if (outcome.shot.hitUnitId !== target.id) {
        strayReports.push(`${attacker.name}'s ${mode.label.toLowerCase()} goes wide and hits ${struck.name} for ${damage} damage.`)
      }
    } else if (outcome.shot.hitStructureAt) {
      const struckCell = cellAt(state.map, outcome.shot.hitStructureAt)!
      strayReports.push(outcome.shot.structureDestroyed
        ? `${attacker.name}'s stray round destroys the ${struckCell.structure!.name}.`
        : `${attacker.name}'s ${mode.label.toLowerCase()} goes wide and slams into the ${struckCell.structure!.name}.`)
    }
  }

  const label = mode.label.toLowerCase()
  const report = directHits === 0
    ? `${attacker.name}'s ${label} misses ${target.name} (${chance}%).`
    : mode.shots > 1
      ? `${attacker.name}'s ${label} hits ${target.name} ${directHits}x for ${directHits * damage} damage (${chance}%).`
      : `${attacker.name}'s ${label} hits ${target.name} for ${damage} damage (${chance}%).`
  return reveal(evaluateMission({
    ...state,
    rngState,
    structureHp,
    lastShots: shots,
    units: units.map(unit => unit.id === attacker.id
      ? { ...unit, ap: unit.ap - mode.cost, hits: unit.hits + trainedHits }
      : unit),
    log: [report, ...strayReports, ...state.log].slice(0, 5),
  }))
}

/** True when the selected soldier can deliberately fire on the structure at this cell. */
export function canTargetStructure(state: GameState, point: Point, modeId: FireModeId = 'snap'): boolean {
  const attacker = state.units.find(unit => unit.id === state.selectedId)
  const cell = cellAt(state.map, point)
  return state.phase === 'player'
    && state.status === 'playing'
    && attacker !== undefined
    && attacker.team === 'crew'
    && alive(attacker)
    && attacker.ap >= FIRE_MODES[modeId].cost
    && cell?.structure !== undefined
    && (state.structureHp[key(point)] ?? 0) > 0
    && distance(attacker, point) <= ATTACK_RANGE
    && isCellVisible(state, point)
    && hasLineOfSight(activeMap(state), attacker, point)
}

/**
 * Fire deliberately at a structure. Furniture does not dodge: every round
 * hits, so easy pieces fall in 2-3 rifle rounds and tough ones in 4-5.
 */
export function attackStructure(state: GameState, x: number, y: number, modeId: FireModeId = 'snap'): GameState {
  const point = { x, y }
  if (!canTargetStructure(state, point, modeId)) return state
  const attacker = state.units.find(unit => unit.id === state.selectedId)!
  const cell = cellAt(state.map, point)!
  const mode = FIRE_MODES[modeId]
  const damage = state.mission.crewDamage ?? DEFAULT_CREW_DAMAGE
  const cellKey = key(point)

  let remaining = state.structureHp[cellKey]
  const shots: ShotResult[] = []
  for (let round = 0; round < mode.shots && remaining > 0; round++) {
    remaining = Math.max(0, remaining - damage)
    shots.push({
      shooterId: attacker.id,
      team: attacker.team,
      from: { x: attacker.x, y: attacker.y },
      aimAt: point,
      impact: point,
      hitStructureAt: point,
      structureDestroyed: remaining === 0,
      damage,
      killed: false,
      deviationDeg: 0,
      struckObstacle: false,
    })
  }

  const dealt = shots.length * damage
  const label = mode.label.toLowerCase()
  return reveal(evaluateMission({
    ...state,
    structureHp: { ...state.structureHp, [cellKey]: remaining },
    lastShots: shots,
    units: state.units.map(unit => unit.id === attacker.id ? { ...unit, ap: unit.ap - mode.cost } : unit),
    log: [
      remaining === 0
        ? `${attacker.name}'s ${label} destroys the ${cell.structure!.name}. The wreckage is passable.`
        : `${attacker.name}'s ${label} tears into the ${cell.structure!.name} (${dealt} damage).`,
      ...state.log,
    ].slice(0, 5),
  }))
}

export function endTurn(state: GameState): GameState {
  if (state.phase !== 'player' || state.status !== 'playing') return state
  return {
    ...state,
    phase: 'enemy',
    selectedId: undefined,
    units: state.units.map(unit => unit.team === 'enemy' ? { ...unit, ap: TURN_TIME_UNITS } : unit),
    log: ['Enemy activity detected…', ...state.log].slice(0, 5),
  }
}

function pathDistance(state: GameState, start: Point, end: Point, ignore?: string): number {
  const map = activeMap(state)
  const queue: Array<[Point, number]> = [[start, 0]]
  const seen = new Set<CellKey>([key(start)])

  while (queue.length > 0) {
    const [point, cost] = queue.shift()!
    if (key(point) === key(end)) return cost
    for (const neighbor of neighbors(map, point)) {
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
  let state = evaluateMission({ ...input, lastShots: [] })
  if (state.status !== 'playing') return reveal(state)

  const enemies = state.units.filter(unit => unit.team === 'enemy' && alive(unit)).sort((a, b) => a.id.localeCompare(b.id))
  for (const enemy of enemies) {
    const current = state.units.find(unit => unit.id === enemy.id)!
    const targets = state.units
      .filter(unit => unit.team === 'crew' && alive(unit))
      .sort((a, b) => distance(current, a) - distance(current, b) || a.id.localeCompare(b.id))
    const nearest = targets[0]
    if (!nearest) break

    // Enemies never fire from beyond vision range: any shooter that can hit a
    // crew member is therefore visible to that crew member in return.
    const attackTarget = targets.find(target => distance(current, target) <= state.visionRange && canHit(state, current, target))
    if (attackTarget) {
      const chance = hitChance(state, current, attackTarget, 'snap')
      const outcome = resolveRound(activeMap(state), state.units, state.structureHp, state.rngState, current, attackTarget, chance, ENEMY_DAMAGE)
      const strayVictim = outcome.shot.hitUnitId && outcome.shot.hitUnitId !== attackTarget.id
        ? outcome.units.find(unit => unit.id === outcome.shot.hitUnitId)!
        : undefined
      const strayStructure = outcome.shot.hitStructureAt ? cellAt(state.map, outcome.shot.hitStructureAt)?.structure : undefined
      state = {
        ...state,
        rngState: outcome.rngState,
        units: outcome.units,
        structureHp: outcome.structureHp,
        lastShots: [...state.lastShots, outcome.shot],
        log: [
          outcome.shot.hitUnitId === attackTarget.id
            ? `${current.name} hits ${attackTarget.name} for ${ENEMY_DAMAGE} damage.`
            : strayVictim
              ? `${current.name} fires at ${attackTarget.name}, misses, and hits ${strayVictim.name} for ${ENEMY_DAMAGE} damage.`
              : strayStructure
                ? `${current.name} fires at ${attackTarget.name}, misses, and ${outcome.shot.structureDestroyed ? 'destroys' : 'hits'} the ${strayStructure.name}.`
                : `${current.name} fires at ${attackTarget.name} and misses.`,
          ...state.log,
        ].slice(0, 5),
      }
    } else {
      const wasVisible = isCellVisible(state, current)
      const options = neighbors(activeMap(state), current)
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
    units: state.units.map(unit => unit.team === 'crew' && alive(unit) ? { ...unit, ap: TURN_TIME_UNITS } : unit),
  })
}
