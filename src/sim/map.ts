export interface Point {
  readonly x: number
  readonly y: number
}

export type Team = 'crew' | 'enemy'
export type CellKey = `${number},${number}`

export interface Cell extends Point {
  readonly room: string
  readonly walkable: boolean
  readonly opaque: boolean
  readonly door?: boolean
  readonly cover?: boolean
}

export interface RoomDefinition {
  readonly name: string
  readonly label: Point
}

export interface SystemMarker extends Point {
  readonly room: string
  readonly system: string
}

export interface TacticalMap {
  readonly width: number
  readonly height: number
  readonly cells: readonly Cell[]
  readonly rooms: readonly RoomDefinition[]
  readonly systems: readonly SystemMarker[]
}

export interface UnitPlacement extends Point {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly team: Team
  readonly hp: number
  readonly maxHp?: number
  readonly ap: number
  readonly accuracy: number
}

export type TacticalObjective =
  | {
    readonly kind: 'eliminate'
    readonly label: string
  }
  | {
    readonly kind: 'rescue'
    readonly label: string
    readonly target: Point
    readonly targetName: string
    readonly deadlineTurn: number
  }

export interface TacticalMission {
  readonly id: string
  readonly objective: TacticalObjective
  readonly visionRange: number
  readonly map: TacticalMap
  readonly crewSpawns: readonly Point[]
  readonly units: readonly UnitPlacement[]
  readonly crewDamage?: number
  readonly seed?: number
}

interface TileDefinition {
  readonly room: string
  readonly walkable: boolean
  readonly opaque: boolean
  readonly door?: boolean
  readonly cover?: boolean
}

interface MapDefinition {
  readonly rows: readonly string[]
  readonly legend: Readonly<Record<string, TileDefinition>>
  readonly rooms?: readonly RoomDefinition[]
  readonly systems?: readonly SystemMarker[]
}

export function defineTacticalMap(definition: MapDefinition): TacticalMap {
  const height = definition.rows.length
  const width = definition.rows[0]?.length ?? 0
  if (width === 0 || definition.rows.some(row => row.length !== width)) {
    throw new Error('Tactical map rows must be non-empty and equal in width.')
  }

  const cells = definition.rows.flatMap((row, y) => [...row].map((symbol, x) => {
    const tile = definition.legend[symbol]
    if (!tile) throw new Error(`Unknown tactical map symbol "${symbol}" at ${x},${y}.`)
    return { x, y, ...tile }
  }))

  return {
    width,
    height,
    cells,
    rooms: definition.rooms ?? [],
    systems: definition.systems ?? [],
  }
}

export const key = ({ x, y }: Point): CellKey => `${x},${y}`

export function cellAt(map: TacticalMap, point: Point): Cell | undefined {
  if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 0 || point.x >= map.width || point.y < 0 || point.y >= map.height) return undefined
  return map.cells[point.y * map.width + point.x]
}

export const isWalkable = (map: TacticalMap, point: Point): boolean => cellAt(map, point)?.walkable ?? false
export const isOpaque = (map: TacticalMap, point: Point): boolean => cellAt(map, point)?.opaque ?? true
export const roomAt = (map: TacticalMap, point: Point): string => cellAt(map, point)?.room ?? 'Unknown'

const floor = (room: string): TileDefinition => ({ room, walkable: true, opaque: false })
const wall: TileDefinition = { room: 'Hull', walkable: false, opaque: true }
const closedDoor = (room: string): TileDefinition => ({ room, walkable: true, opaque: true, door: true })
const crate = (room: string): TileDefinition => ({ room, walkable: false, opaque: false, cover: true })

export const BASE_TIME_UNITS = 12

const DEFAULT_CREW = [
  { id: 'ada', name: 'Ada Voss', role: 'Marine', team: 'crew', hp: 8, ap: BASE_TIME_UNITS, accuracy: 55 },
  { id: 'milo', name: 'Milo Chen', role: 'Engineer', team: 'crew', hp: 8, ap: BASE_TIME_UNITS, accuracy: 45 },
  { id: 'imani', name: 'Imani Okafor', role: 'Medic', team: 'crew', hp: 8, ap: BASE_TIME_UNITS, accuracy: 45 },
  { id: 'soren', name: 'Soren Vale', role: 'Scout', team: 'crew', hp: 8, ap: BASE_TIME_UNITS, accuracy: 60 },
] as const satisfies readonly Omit<UnitPlacement, keyof Point>[]

function crewAt(spawns: readonly Point[]): UnitPlacement[] {
  return DEFAULT_CREW.map((crew, index) => ({ ...crew, ...spawns[index] }))
}

const BOARDING_CREW_SPAWNS = [
  { x: 1, y: 6 },
  { x: 1, y: 5 },
  { x: 2, y: 5 },
  { x: 2, y: 6 },
  { x: 3, y: 5 },
  { x: 3, y: 6 },
] as const

export const BOARDING_MISSION: TacticalMission = {
  id: 'hostile-boarding-action',
  objective: { kind: 'eliminate', label: 'Locate and eliminate hostiles' },
  visionRange: 6,
  map: defineTacticalMap({
    rows: [
      '#AAA#MM#CCC#',
      '#AAADMMMCCC#',
      'AAAA#MMMCCCC',
      'AAAA#MMMCCcC',
      'AAAARRR#WWWW',
      'AAAARoRRHWWW',
      '#AAARRR#WWW#',
      '#AAA#RR#WWW#',
    ],
    legend: {
      '#': wall,
      A: floor('Boarding Bay'),
      M: floor('Medbay'),
      R: floor('Reactor'),
      C: floor('Bridge'),
      W: floor('Weapons'),
      D: closedDoor('Medbay'),
      H: closedDoor('Weapons'),
      o: crate('Reactor'),
      c: crate('Bridge'),
    },
    rooms: [
      { name: 'Boarding Bay', label: { x: 1, y: 7 } },
      { name: 'Medbay', label: { x: 5, y: 0 } },
      { name: 'Reactor', label: { x: 5, y: 7 } },
      { name: 'Bridge', label: { x: 9, y: 0 } },
      { name: 'Weapons', label: { x: 9, y: 7 } },
    ],
    systems: [
      { x: 6, y: 1, room: 'Medbay', system: 'MED' },
      { x: 6, y: 6, room: 'Reactor', system: 'CORE' },
      { x: 10, y: 1, room: 'Bridge', system: 'NAV' },
      { x: 10, y: 6, room: 'Weapons', system: 'GUN' },
    ],
  }),
  crewSpawns: BOARDING_CREW_SPAWNS,
  units: [
    ...crewAt(BOARDING_CREW_SPAWNS),
    { id: 'wraith-1', name: 'Wraith Kesh', role: 'Void raider', team: 'enemy', x: 6, y: 2, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'wraith-2', name: 'Wraith Oru', role: 'Void raider', team: 'enemy', x: 9, y: 2, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'wraith-3', name: 'Wraith Vek', role: 'Void raider', team: 'enemy', x: 9, y: 6, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
  ],
}

const COURIER_CREW_SPAWNS = [
  { x: 1, y: 6 },
  { x: 1, y: 5 },
  { x: 2, y: 5 },
  { x: 2, y: 6 },
  { x: 3, y: 5 },
  { x: 3, y: 6 },
] as const

export const CIVILIAN_RESCUE_MISSION: TacticalMission = {
  id: 'civilian-courier-rescue',
  objective: {
    kind: 'rescue',
    label: 'Reach the courier survivor before the ship detonates',
    target: { x: 10, y: 1 },
    targetName: 'Courier survivor',
    deadlineTurn: 8,
  },
  visionRange: 6,
  map: defineTacticalMap({
    rows: [
      '#DDD#CC#BBB#',
      '#DDDDCCBBBB#',
      'DDDDCCCCBbBB',
      'DDD##CCCBBBB',
      'DDDDeEEE#BBB',
      'DDDDEEEEBBBB',
      '#DDDEEEEBBB#',
      '#DDD#EE#BBB#',
    ],
    legend: {
      '#': wall,
      D: floor('Dock'),
      C: floor('Commons'),
      B: floor('Bridge'),
      E: floor('Engineering'),
      b: crate('Bridge'),
      e: crate('Engineering'),
    },
    rooms: [
      { name: 'Dock', label: { x: 1, y: 7 } },
      { name: 'Commons', label: { x: 5, y: 0 } },
      { name: 'Bridge', label: { x: 9, y: 0 } },
      { name: 'Engineering', label: { x: 5, y: 7 } },
    ],
    systems: [
      { x: 6, y: 1, room: 'Commons', system: 'LIFE' },
      { x: 6, y: 6, room: 'Engineering', system: 'CORE' },
      { x: 10, y: 1, room: 'Bridge', system: 'SOS' },
    ],
  }),
  crewSpawns: COURIER_CREW_SPAWNS,
  units: [
    ...crewAt(COURIER_CREW_SPAWNS),
    { id: 'pirate-1', name: 'Rook Gant', role: 'Pirate raider', team: 'enemy', x: 6, y: 2, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'pirate-2', name: 'Vela Pike', role: 'Pirate raider', team: 'enemy', x: 8, y: 3, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'pirate-3', name: 'Knox Brill', role: 'Pirate raider', team: 'enemy', x: 9, y: 6, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
  ],
}

export const PIRATE_RESCUE_MISSION: TacticalMission = {
  ...BOARDING_MISSION,
  id: 'civilian-courier-pirates',
  objective: { kind: 'eliminate', label: 'Eliminate the pirates aboard the grappled cutter' },
  units: BOARDING_MISSION.units.map((unit, index) => unit.team === 'crew'
    ? unit
    : {
        ...unit,
        name: ['Rook Gant', 'Vela Pike', 'Knox Brill'][index - 4],
        role: 'Pirate raider',
      }),
}

const TRAP_CREW_SPAWNS = [
  { x: 1, y: 5 },
  { x: 2, y: 5 },
  { x: 2, y: 4 },
  { x: 3, y: 4 },
  { x: 1, y: 4 },
  { x: 3, y: 5 },
] as const

export const DISTRESS_TRAP_MISSION: TacticalMission = {
  id: 'distress-signal-trap',
  objective: { kind: 'eliminate', label: 'Survive the ambush and eliminate the pirates' },
  visionRange: 6,
  map: defineTacticalMap({
    rows: [
      '##AA####BB##',
      '#AAAA##BBBB#',
      'AAAAAXXBBBBB',
      'AAA##XX##BBB',
      'AAAAcCCCCBBB',
      '#AAACCCcCBB#',
      '#AA##CCCCBB#',
      '##A##CC##B##',
    ],
    legend: {
      '#': wall,
      A: floor('Airlock'),
      X: floor('Crossway'),
      B: floor('Cargo Hold'),
      C: floor('Reactor Deck'),
      c: crate('Reactor Deck'),
    },
    rooms: [
      { name: 'Airlock', label: { x: 2, y: 7 } },
      { name: 'Crossway', label: { x: 5, y: 2 } },
      { name: 'Cargo Hold', label: { x: 9, y: 0 } },
      { name: 'Reactor Deck', label: { x: 5, y: 7 } },
    ],
    systems: [
      { x: 6, y: 2, room: 'Crossway', system: 'LOCK' },
      { x: 6, y: 5, room: 'Reactor Deck', system: 'CORE' },
      { x: 9, y: 5, room: 'Cargo Hold', system: 'BAIT' },
    ],
  }),
  crewSpawns: TRAP_CREW_SPAWNS,
  units: [
    ...crewAt(TRAP_CREW_SPAWNS),
    { id: 'pirate-1', name: 'Rook Gant', role: 'Pirate raider', team: 'enemy', x: 6, y: 2, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'pirate-2', name: 'Vela Pike', role: 'Pirate raider', team: 'enemy', x: 8, y: 2, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'pirate-3', name: 'Knox Brill', role: 'Pirate raider', team: 'enemy', x: 9, y: 5, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'pirate-4', name: 'Mara Quill', role: 'Pirate gunner', team: 'enemy', x: 7, y: 4, hp: 6, ap: BASE_TIME_UNITS, accuracy: 55 },
  ],
}

export const TACTICAL_MISSIONS = [BOARDING_MISSION, PIRATE_RESCUE_MISSION, CIVILIAN_RESCUE_MISSION, DISTRESS_TRAP_MISSION] as const
