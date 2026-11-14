export interface Point {
  readonly x: number
  readonly y: number
}

export type Team = 'crew' | 'enemy'
export type CellKey = `${number},${number}`

export interface StructureDefinition {
  readonly name: string
  readonly hp: number
}

export interface Cell extends Point {
  readonly room: string
  readonly walkable: boolean
  readonly opaque: boolean
  readonly cover?: boolean
  readonly structure?: StructureDefinition
  /** Space outside the ship's pressurised volume; hull edges seal it off. */
  readonly void?: boolean
}

/**
 * A door occupies the edge between two adjacent cells rather than a cell of
 * its own, so no unit can ever stand in a door. `a` is the approach side,
 * `b` the threshold inside the door's room.
 */
export interface DoorEdge {
  readonly a: Point
  readonly b: Point
  readonly room: string
}

export type DoorKey = `${CellKey}|${CellKey}`

/** Canonical key for the edge between two adjacent cells, in either order. */
export function doorKey(a: Point, b: Point): DoorKey {
  const aFirst = a.y < b.y || (a.y === b.y && a.x <= b.x)
  const first = aFirst ? a : b
  const second = aFirst ? b : a
  return `${first.x},${first.y}|${second.x},${second.y}`
}

/**
 * A wall occupies the edge between two adjacent cells, like a door. Hull
 * walls seal the ship against the void and can never be destroyed; interior
 * bulkheads separate rooms and can be breached by weapons that beat their
 * armour. `a` is always on the inside of a hull wall.
 */
export interface WallEdge {
  readonly a: Point
  readonly b: Point
  readonly hull: boolean
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
  readonly doors: readonly DoorEdge[]
  readonly walls: readonly WallEdge[]
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
  | {
    readonly kind: 'sabotage'
    readonly label: string
    readonly beacon: Point
    readonly extraction: Point
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
  readonly cover?: boolean
  readonly structure?: StructureDefinition
  readonly void?: boolean
}

interface MapDefinition {
  readonly rows: readonly string[]
  readonly legend: Readonly<Record<string, TileDefinition>>
  readonly rooms?: readonly RoomDefinition[]
  readonly systems?: readonly SystemMarker[]
  readonly doors?: readonly DoorEdge[]
}

/**
 * Derive the wall edges from the room layout: a hull wall seals every
 * boundary between the ship and the void (or the map border), and an
 * interior bulkhead stands on every boundary between two different rooms
 * unless a door is declared there. Opaque cells need no edges — they block
 * by themselves.
 */
function deriveWalls(cells: readonly Cell[], width: number, height: number, doors: readonly DoorEdge[]): WallEdge[] {
  const doorEdges = new Set(doors.map(door => doorKey(door.a, door.b)))
  const at = (x: number, y: number): Cell | undefined =>
    x >= 0 && x < width && y >= 0 && y < height ? cells[y * width + x] : undefined
  const walls: WallEdge[] = []

  for (const cell of cells) {
    if (cell.opaque) continue
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      const partner = { x: cell.x + dx, y: cell.y + dy }
      const neighbor = at(partner.x, partner.y)
      if (!neighbor || neighbor.opaque || doorEdges.has(doorKey(cell, partner))) continue
      const cellVoid = cell.void === true
      const neighborVoid = neighbor.void === true
      if (cellVoid && neighborVoid) continue
      if (cellVoid !== neighborVoid) {
        walls.push({ a: cellVoid ? partner : { x: cell.x, y: cell.y }, b: cellVoid ? { x: cell.x, y: cell.y } : partner, hull: true })
      } else if (cell.room !== neighbor.room) {
        walls.push({ a: { x: cell.x, y: cell.y }, b: partner, hull: false })
      }
    }
    if (cell.void) continue
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const outside = { x: cell.x + dx, y: cell.y + dy }
      if (at(outside.x, outside.y)) continue
      walls.push({ a: { x: cell.x, y: cell.y }, b: outside, hull: true })
    }
  }
  return walls
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

  const doors = definition.doors ?? []
  for (const door of doors) {
    if (Math.abs(door.a.x - door.b.x) + Math.abs(door.a.y - door.b.y) !== 1) {
      throw new Error(`Door edge ${doorKey(door.a, door.b)} must join two adjacent cells.`)
    }
  }

  return {
    width,
    height,
    cells,
    rooms: definition.rooms ?? [],
    systems: definition.systems ?? [],
    doors,
    walls: deriveWalls(cells, width, height, doors),
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
/** Space outside the pressurised hull. Sight and fire stop at the hull edges around it. */
const space: TileDefinition = { room: 'Void', walkable: false, opaque: false, void: true }

/**
 * Destructible furniture: blocks movement and grants cover until its hit
 * points run out, then collapses into walkable wreckage. Easy pieces fall in
 * 2-3 rifle rounds, tough ones in 4-5.
 */
export const STRUCTURE_KINDS = {
  displayBank: { name: 'display bank', hp: 6 },
  storageUnit: { name: 'storage unit', hp: 9 },
  alienGrowth: { name: 'alien growth', hp: 12 },
  controlConsole: { name: 'control console', hp: 15 },
} as const satisfies Readonly<Record<string, StructureDefinition>>

const structure = (room: string, kind: StructureDefinition): TileDefinition =>
  ({ room, walkable: false, opaque: false, cover: true, structure: kind })

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
  { x: 4, y: 19 },
  { x: 4, y: 16 },
  { x: 7, y: 16 },
  { x: 7, y: 19 },
  { x: 10, y: 16 },
  { x: 10, y: 19 },
]

export const BOARDING_MISSION: TacticalMission = {
  id: 'hostile-boarding-action',
  objective: { kind: 'eliminate', label: 'Locate and eliminate hostiles' },
  visionRange: 18,
  map: defineTacticalMap({
    rows: [
      '###AAAAAAAAA###MMMMMM###CCCCCCCCC###',
      '###AAAAAAAAA###MMMMMM###CCCCCCCCC###',
      '###AAAAAAAAA###MMMMMM###CCCCCCCCC###',
      '###AAAAAAAAAA#MMMMMMMMMMCCCCCCCCC###',
      '###AAAAAAAAAAMMMMMMMMMMMCCCCCCCCC###',
      '###AAAAAAAAAA#MMMMMMMMMMCCCCCCCCC###',
      'AAAAAAAAAAAA###MMMMMMMMMCCCCCCCCCCCC',
      'AAAAAAAAAAAA###MMMMMMMMMCCCCCCCCCCCC',
      'AAAAAAAAAAAA###MMMMMMMMMCCCCCCCCCCCC',
      'AAAAAAAAAAAA###MMMdddMMMCCCCCCcccCCC',
      'AAAAAAAAAAAA###MMMdddMMMCCCCCCcccCCC',
      'AAAAAAAAAAAA###MMMdddMMMCCCCCCcccCCC',
      'AAAAAAAAAAAARRRRRRRRR###WWWgggWWWWWW',
      'AAAAAAAAAAAARRRRRRRRR###WWWgggWWWWWW',
      'AAAAAAAAAAAARRRRRRRRR###WWWgggWWWWWW',
      'AAAAAAAAAAAARRRoooRRRRRRR#WWWWWWWWWW',
      'AAAAAAAAAAAARRRoooRRRRRRRWWWWWWWWWWW',
      'AAAAAAAAAAAARRRoooRRRRRRR#WWWWWWWWWW',
      '###AAAAAAAAARRRRRRRRR###WWWWWWWWW###',
      '###AAAAAAAAARRRRRRRRR###WWWWWWWWW###',
      '###AAAAAAAAARRRRRRRRR###WWWWWWWWW###',
      '###AAAAAAAAA###RRRRRR###WWWWWWWWW###',
      '###AAAAAAAAA###RRRRRR###WWWWWWWWW###',
      '###AAAAAAAAA###RRRRRR###WWWWWWWWW###',
    ],
    legend: {
      '#': space,
      A: floor('Boarding Bay'),
      M: floor('Medbay'),
      R: floor('Reactor'),
      C: floor('Bridge'),
      W: floor('Weapons'),
      o: structure('Reactor', STRUCTURE_KINDS.storageUnit),
      c: structure('Bridge', STRUCTURE_KINDS.controlConsole),
      d: structure('Medbay', STRUCTURE_KINDS.displayBank),
      g: structure('Weapons', STRUCTURE_KINDS.alienGrowth),
    },
    doors: [
      { a: { x: 12, y: 4 }, b: { x: 13, y: 4 }, room: 'Medbay' },
      { a: { x: 24, y: 16 }, b: { x: 25, y: 16 }, room: 'Weapons' },
      { a: { x: 11, y: 16 }, b: { x: 12, y: 16 }, room: 'Reactor' },
      { a: { x: 16, y: 11 }, b: { x: 16, y: 12 }, room: 'Reactor' },
      { a: { x: 23, y: 7 }, b: { x: 24, y: 7 }, room: 'Bridge' },
      { a: { x: 25, y: 11 }, b: { x: 25, y: 12 }, room: 'Weapons' },
    ],
    rooms: [
      { name: 'Boarding Bay', label: { x: 4, y: 22 } },
      { name: 'Medbay', label: { x: 16, y: 1 } },
      { name: 'Reactor', label: { x: 16, y: 22 } },
      { name: 'Bridge', label: { x: 28, y: 1 } },
      { name: 'Weapons', label: { x: 28, y: 22 } },
    ],
    systems: [
      { x: 19, y: 4, room: 'Medbay', system: 'MED' },
      { x: 19, y: 19, room: 'Reactor', system: 'CORE' },
      { x: 31, y: 4, room: 'Bridge', system: 'NAV' },
      { x: 31, y: 19, room: 'Weapons', system: 'GUN' },
    ],
  }),
  crewSpawns: BOARDING_CREW_SPAWNS,
  units: [
    ...crewAt(BOARDING_CREW_SPAWNS),
    { id: 'wraith-1', name: 'Wraith Kesh', role: 'Void raider', team: 'enemy', x: 19, y: 7, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'wraith-2', name: 'Wraith Oru', role: 'Void raider', team: 'enemy', x: 28, y: 7, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'wraith-3', name: 'Wraith Vek', role: 'Void raider', team: 'enemy', x: 28, y: 19, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
  ],
}

const COURIER_CREW_SPAWNS = [
  { x: 4, y: 19 },
  { x: 4, y: 16 },
  { x: 7, y: 16 },
  { x: 7, y: 19 },
  { x: 10, y: 16 },
  { x: 10, y: 19 },
]

export const CIVILIAN_RESCUE_MISSION: TacticalMission = {
  id: 'civilian-courier-rescue',
  objective: {
    kind: 'rescue',
    label: 'Reach the courier survivor before the ship detonates',
    target: { x: 31, y: 4 },
    targetName: 'Courier survivor',
    deadlineTurn: 8,
  },
  visionRange: 18,
  map: defineTacticalMap({
    rows: [
      '###DDDDDDDDD###CCCCCC###BBBBBBBBB###',
      '###DDDDDDDDD###CCCCCC###BBBBBBBBB###',
      '###DDDDDDDDD###CCCCCC###BBBBBBBBB###',
      '###DDDDDDDDDDDDpppCCCBBBBBBBBBBBB###',
      '###DDDDDDDDDDDDpppCCCBBBBBBBBBBBB###',
      '###DDDDDDDDDDDDpppCCCBBBBBBBBBBBB###',
      'DDDDDDDDDDDDD#CCCCCCCCCCBBBbbbBBBBBB',
      'DDDDDDDDDDDDDCCCCCCCCCCCBBBbbbBBBBBB',
      'DDDDDDDDDDDDD#CCCCCCCCCCBBBbbbBBBBBB',
      'DDDDDDDDD######CCCCCCCCCBBBBBBBBBBBB',
      'DDDDDDDDD######CCCCCCCCCBBBBBBBBBBBB',
      'DDDDDDDDD######CCCCCCCCCBBBBBBBBBBBB',
      'DDDDDDDDDDDDeeeEEEEEEEEE###BBBBBBBBB',
      'DDDDDDDDDDDDeeeEEEEEEEEE###BBBBBBBBB',
      'DDDDDDDDDDDDeeeEEEEEEEEE###BBBBBBBBB',
      'DDDDDDDDDDDDEEEEEEEEEEEEBBBBBBBBBBBB',
      'DDDDDDDDDDDDEEEEEEEEEEEEBBBBBBBBBBBB',
      'DDDDDDDDDDDDEEEEEEEEEEEEBBBBBBBBBBBB',
      '###DDDDDDDDDEEEEEEEEEEEEBBBBBBBBB###',
      '###DDDDDDDDDEEEEEEEEEEEEBBBBBBBBB###',
      '###DDDDDDDDDEEEEEEEEEEEEBBBBBBBBB###',
      '###DDDDDDDDD###EEEEEE###BBBBBBBBB###',
      '###DDDDDDDDD###EEEEEE###BBBBBBBBB###',
      '###DDDDDDDDD###EEEEEE###BBBBBBBBB###',
    ],
    legend: {
      '#': space,
      D: floor('Dock'),
      C: floor('Commons'),
      B: floor('Bridge'),
      E: floor('Engineering'),
      b: structure('Bridge', STRUCTURE_KINDS.controlConsole),
      e: structure('Engineering', STRUCTURE_KINDS.storageUnit),
      p: structure('Commons', STRUCTURE_KINDS.displayBank),
    },
    doors: [
      { a: { x: 12, y: 7 }, b: { x: 13, y: 7 }, room: 'Commons' },
      { a: { x: 11, y: 16 }, b: { x: 12, y: 16 }, room: 'Engineering' },
      { a: { x: 20, y: 4 }, b: { x: 21, y: 4 }, room: 'Bridge' },
      { a: { x: 23, y: 16 }, b: { x: 24, y: 16 }, room: 'Bridge' },
    ],
    rooms: [
      { name: 'Dock', label: { x: 4, y: 22 } },
      { name: 'Commons', label: { x: 16, y: 1 } },
      { name: 'Bridge', label: { x: 28, y: 1 } },
      { name: 'Engineering', label: { x: 16, y: 22 } },
    ],
    systems: [
      { x: 19, y: 4, room: 'Commons', system: 'LIFE' },
      { x: 19, y: 19, room: 'Engineering', system: 'CORE' },
      { x: 31, y: 4, room: 'Bridge', system: 'SOS' },
    ],
  }),
  crewSpawns: COURIER_CREW_SPAWNS,
  units: [
    ...crewAt(COURIER_CREW_SPAWNS),
    { id: 'pirate-1', name: 'Rook Gant', role: 'Pirate raider', team: 'enemy', x: 19, y: 7, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'pirate-2', name: 'Vela Pike', role: 'Pirate raider', team: 'enemy', x: 25, y: 10, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'pirate-3', name: 'Knox Brill', role: 'Pirate raider', team: 'enemy', x: 28, y: 19, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
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
  { x: 4, y: 16 },
  { x: 7, y: 16 },
  { x: 7, y: 13 },
  { x: 10, y: 13 },
  { x: 4, y: 13 },
  { x: 10, y: 16 },
]

export const DISTRESS_TRAP_MISSION: TacticalMission = {
  id: 'distress-signal-trap',
  objective: { kind: 'eliminate', label: 'Survive the ambush and eliminate the pirates' },
  visionRange: 18,
  map: defineTacticalMap({
    rows: [
      '######AAAAAA############BBBBBB######',
      '######AAAAAA############BBBBBB######',
      '######AAAAAA############BBBBBB######',
      '###AAAAAAAAAAAA######BBBBBBBBBBBB###',
      '###AAAAAAAAAAAA######BBBBBBBBBBBB###',
      '###AAAAAAAAAAAA######BBBBBBBBBBBB###',
      'AAAAAAAAAAAAAAAA#XXXXX#BBBBBBBBBBBBB',
      'AAAAAAAAAAAAAAAAXXXXXXBBBBBBBBBBBBBB',
      'AAAAAAAAAAAAAAAA#XXXXX#BBBBBBBBBBBBB',
      'AAAAAAAAA######XXXXXX######BBBBBBBBB',
      'AAAAAAAAA######XXXXXX######BBBBBBBBB',
      'AAAAAAAAA######XXXXXX######BBBBBBBBB',
      'AAAAAAAAAAAAcccCCCCCCCCCCCCBBBBBBBBB',
      'AAAAAAAAAAAAcccCCCCCCCCCCCCBBBBBBBBB',
      'AAAAAAAAAAAAcccCCCCCCCCCCCCBBBBBBBBB',
      '###AAAAAAAAACCCCCCCCCcccCCCBBBBBB###',
      '###AAAAAAAAACCCCCCCCCcccCCCBBBBBB###',
      '###AAAAAAAAACCCCCCCCCcccCCCBBBBBB###',
      '###AAAAAA######CCCCCCCCCgggBBBBBB###',
      '###AAAAAA######CCCCCCCCCgggBBBBBB###',
      '###AAAAAA######CCCCCCCCCgggBBBBBB###',
      '######AAA######CCCCCC######BBB######',
      '######AAA######CCCCCC######BBB######',
      '######AAA######CCCCCC######BBB######',
    ],
    legend: {
      '#': space,
      A: floor('Airlock'),
      X: floor('Crossway'),
      B: floor('Cargo Hold'),
      C: floor('Reactor Deck'),
      c: structure('Reactor Deck', STRUCTURE_KINDS.storageUnit),
      g: structure('Reactor Deck', STRUCTURE_KINDS.alienGrowth),
    },
    doors: [
      { a: { x: 15, y: 7 }, b: { x: 16, y: 7 }, room: 'Crossway' },
      { a: { x: 21, y: 7 }, b: { x: 22, y: 7 }, room: 'Cargo Hold' },
      { a: { x: 11, y: 16 }, b: { x: 12, y: 16 }, room: 'Reactor Deck' },
      { a: { x: 17, y: 11 }, b: { x: 17, y: 12 }, room: 'Reactor Deck' },
      { a: { x: 26, y: 16 }, b: { x: 27, y: 16 }, room: 'Cargo Hold' },
    ],
    rooms: [
      { name: 'Airlock', label: { x: 7, y: 22 } },
      { name: 'Crossway', label: { x: 16, y: 7 } },
      { name: 'Cargo Hold', label: { x: 28, y: 1 } },
      { name: 'Reactor Deck', label: { x: 16, y: 22 } },
    ],
    systems: [
      { x: 19, y: 7, room: 'Crossway', system: 'LOCK' },
      { x: 19, y: 16, room: 'Reactor Deck', system: 'CORE' },
      { x: 28, y: 16, room: 'Cargo Hold', system: 'BAIT' },
    ],
  }),
  crewSpawns: TRAP_CREW_SPAWNS,
  units: [
    ...crewAt(TRAP_CREW_SPAWNS),
    { id: 'pirate-1', name: 'Rook Gant', role: 'Pirate raider', team: 'enemy', x: 19, y: 7, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'pirate-2', name: 'Vela Pike', role: 'Pirate raider', team: 'enemy', x: 25, y: 7, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'pirate-3', name: 'Knox Brill', role: 'Pirate raider', team: 'enemy', x: 28, y: 16, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'pirate-4', name: 'Mara Quill', role: 'Pirate gunner', team: 'enemy', x: 22, y: 13, hp: 6, ap: BASE_TIME_UNITS, accuracy: 55 },
  ],
}

const MOON_CREW_SPAWNS = [
  { x: 1, y: 1 },
  { x: 2, y: 1 },
  { x: 1, y: 2 },
  { x: 2, y: 2 },
  { x: 3, y: 2 },
  { x: 2, y: 3 },
]

export const MOON_BASE_MISSION: TacticalMission = {
  id: 'moon-base-assault',
  objective: { kind: 'eliminate', label: 'Clear the moon base of alien infestation' },
  visionRange: 18,
  map: defineTacticalMap({
    rows: [
      '....................................',
      '....................................',
      '..............qq.............q......',
      '.....rr.............................',
      '.................rr......rr.........',
      '....................................',
      '....................................',
      '...........HHHHHHHLLLLLLL......q....',
      '...r.......HHHHHHHLLLLccL...........',
      '...r.......HHHHHHHLLLLLLL...........',
      '...........HHdHHHHLLLLLLL..r........',
      '...........HHdHHHHLLLLLLL...........',
      '.......q...HHHHHHHPPPPPPP...........',
      '.......q...HHHHHHHPPPPPPP...........',
      '...........HHHHHHHPPPPPPP...........',
      '...........HHHHHHHPPggPPP......q....',
      '.........r.HHHHHHHPPPPPPP...........',
      '....rr..............................',
      '....................................',
      '............................rr......',
      '...........qq.......................',
      '...................rr...............',
      '....................................',
      '....................................',
    ],
    legend: {
      '.': floor('Regolith'),
      H: floor('Habitat'),
      L: floor('Laboratory'),
      P: floor('Power Cell'),
      r: structure('Regolith', STRUCTURE_KINDS.storageUnit),
      q: structure('Regolith', STRUCTURE_KINDS.alienGrowth),
      d: structure('Habitat', STRUCTURE_KINDS.displayBank),
      c: structure('Laboratory', STRUCTURE_KINDS.controlConsole),
      g: structure('Power Cell', STRUCTURE_KINDS.alienGrowth),
    },
    doors: [
      { a: { x: 10, y: 11 }, b: { x: 11, y: 11 }, room: 'Habitat' },
      { a: { x: 17, y: 9 }, b: { x: 18, y: 9 }, room: 'Laboratory' },
      { a: { x: 17, y: 14 }, b: { x: 18, y: 14 }, room: 'Power Cell' },
      { a: { x: 21, y: 11 }, b: { x: 21, y: 12 }, room: 'Power Cell' },
    ],
    rooms: [
      { name: 'Habitat', label: { x: 12, y: 7 } },
      { name: 'Laboratory', label: { x: 19, y: 7 } },
      { name: 'Power Cell', label: { x: 19, y: 16 } },
    ],
    systems: [
      { x: 15, y: 8, room: 'Habitat', system: 'HAB' },
      { x: 21, y: 8, room: 'Laboratory', system: 'LAB' },
      { x: 23, y: 15, room: 'Power Cell', system: 'PWR' },
    ],
  }),
  crewSpawns: MOON_CREW_SPAWNS,
  units: [
    ...crewAt(MOON_CREW_SPAWNS),
    { id: 'crawler-1', name: 'Chitin Scuttler', role: 'Moon crawler', team: 'enemy', x: 17, y: 5, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'crawler-2', name: 'Chitin Stalker', role: 'Moon crawler', team: 'enemy', x: 28, y: 12, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'crawler-3', name: 'Chitin Lurker', role: 'Moon crawler', team: 'enemy', x: 14, y: 19, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'crawler-4', name: 'Brood Warden', role: 'Hive guard', team: 'enemy', x: 14, y: 9, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'crawler-5', name: 'Brood Sentry', role: 'Hive guard', team: 'enemy', x: 12, y: 14, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'crawler-6', name: 'Lab Horror', role: 'Hive guard', team: 'enemy', x: 21, y: 9, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'crawler-7', name: 'Brood Alpha', role: 'Hive alpha', team: 'enemy', x: 22, y: 14, hp: 9, ap: BASE_TIME_UNITS, accuracy: 55 },
  ],
}

const CORE_CREW_SPAWNS = [
  { x: 5, y: 13 },
  { x: 5, y: 12 },
  { x: 5, y: 14 },
  { x: 6, y: 13 },
  { x: 6, y: 12 },
  { x: 6, y: 14 },
]

export const CORE_SABOTAGE_MISSION: TacticalMission = {
  id: 'galactic-core-sabotage',
  objective: {
    kind: 'sabotage',
    label: 'Disable the beacon, then reach extraction',
    beacon: { x: 31, y: 10 },
    extraction: { x: 4, y: 14 },
  },
  visionRange: 18,
  map: defineTacticalMap({
    rows: [
      '####################################',
      '####################################',
      '####################################',
      '####################################',
      '##########MMMMMMMMMMMMMMM##CCCCC####',
      '####DDDDDDMMMMMMmMMMMMMMMCCCCCCCCC##',
      '####DDDDDDMMMMMMmMMMMMMMMCCCCCCCCC##',
      '##DDDDDDDDMMMMMMMMMMMmMMMCCCCCCCCC##',
      '##DDDDDDDDMMMMMMMMMMMMMMMCCccCCCCCC#',
      '##DDDDDDdDGGGGGGGGGGGGGGGCCCCCCCCCC#',
      '##DDDDDDDDGGGGggGGGGGGGGGCCCCCCCCCC#',
      '##DDDDDDDDGGGGGGGGGGGGgGGCCCCCCCCCC#',
      '##DDDDDDDDGGGGGGGGtGGGGGGCCCCCCCcCC#',
      '##DDDDDDDDGGGGGGGGtGGGGGGCCCCCCCCCC#',
      '##DDDDDDDDGGGGGGGGtGGGGGGCCCCCCCCCC#',
      '##DDDDDDDDGGGGGGGGGGGGGGGCccCCCCCCC#',
      '##DDDDDDdDGGGGGGGGGGGGGGGCCCCCCCCC##',
      '##DDDDDDDDGGGGGGGGGGGGGGGCCCCCCCCC##',
      '####DDDDDD###############CCCCCCCCC##',
      '####DDDDDD#################CCCCC####',
      '####################################',
      '####################################',
      '####################################',
      '####################################',
    ],
    legend: {
      '#': space,
      D: floor('Shuttle Dock'),
      G: floor('Guard Gallery'),
      M: floor('Service Passage'),
      C: floor('Beacon Chamber'),
      d: structure('Shuttle Dock', STRUCTURE_KINDS.displayBank),
      g: structure('Guard Gallery', STRUCTURE_KINDS.storageUnit),
      t: structure('Guard Gallery', STRUCTURE_KINDS.alienGrowth),
      m: structure('Service Passage', STRUCTURE_KINDS.storageUnit),
      c: structure('Beacon Chamber', STRUCTURE_KINDS.controlConsole),
    },
    doors: [
      { a: { x: 9, y: 7 }, b: { x: 10, y: 7 }, room: 'Service Passage' },
      { a: { x: 9, y: 13 }, b: { x: 10, y: 13 }, room: 'Guard Gallery' },
      { a: { x: 12, y: 8 }, b: { x: 12, y: 9 }, room: 'Guard Gallery' },
      { a: { x: 24, y: 6 }, b: { x: 25, y: 6 }, room: 'Beacon Chamber' },
      { a: { x: 24, y: 13 }, b: { x: 25, y: 13 }, room: 'Beacon Chamber' },
    ],
    rooms: [
      { name: 'Shuttle Dock', label: { x: 3, y: 8 } },
      { name: 'Guard Gallery', label: { x: 13, y: 16 } },
      { name: 'Service Passage', label: { x: 17, y: 4 } },
      { name: 'Beacon Chamber', label: { x: 28, y: 5 } },
    ],
  }),
  crewSpawns: CORE_CREW_SPAWNS,
  units: [
    ...crewAt(CORE_CREW_SPAWNS),
    { id: 'core-1', name: 'Signal Hound', role: 'Core sentry', team: 'enemy', x: 15, y: 12, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'core-2', name: 'Glass Keeper', role: 'Core sentry', team: 'enemy', x: 22, y: 14, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'core-3', name: 'Beacon Guard', role: 'Core sentry', team: 'enemy', x: 28, y: 10, hp: 6, ap: BASE_TIME_UNITS, accuracy: 45 },
    { id: 'core-4', name: 'Core Warden', role: 'Core commander', team: 'enemy', x: 30, y: 16, hp: 9, ap: BASE_TIME_UNITS, accuracy: 55 },
  ],
}

export const TACTICAL_MISSIONS = [
  BOARDING_MISSION,
  PIRATE_RESCUE_MISSION,
  CIVILIAN_RESCUE_MISSION,
  DISTRESS_TRAP_MISSION,
  MOON_BASE_MISSION,
  CORE_SABOTAGE_MISSION,
] as const
