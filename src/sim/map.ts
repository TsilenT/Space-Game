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
  readonly ap: number
}

export interface TacticalMission {
  readonly id: string
  readonly objective: string
  readonly visionRange: number
  readonly map: TacticalMap
  readonly units: readonly UnitPlacement[]
}

interface TileDefinition {
  readonly room: string
  readonly walkable: boolean
  readonly opaque: boolean
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

export const BOARDING_MISSION: TacticalMission = {
  id: 'hostile-boarding-action',
  objective: 'Locate and eliminate hostiles',
  visionRange: 6,
  map: defineTacticalMap({
    rows: [
      '#AAA#MM#CCC#',
      '#AAAMMMMCCC#',
      'AAAAMMMMCCCC',
      'AAAA#MMMCCCC',
      'AAAARRR#WWWW',
      'AAAARRRRWWWW',
      '#AAARRRRWWW#',
      '#AAA#RR#WWW#',
    ],
    legend: {
      '#': wall,
      A: floor('Boarding Bay'),
      M: floor('Medbay'),
      R: floor('Reactor'),
      C: floor('Bridge'),
      W: floor('Weapons'),
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
  units: [
    { id: 'ada', name: 'Ada Voss', role: 'Marine', team: 'crew', x: 1, y: 6, hp: 8, ap: 4 },
    { id: 'milo', name: 'Milo Chen', role: 'Engineer', team: 'crew', x: 1, y: 5, hp: 8, ap: 4 },
    { id: 'imani', name: 'Imani Okafor', role: 'Medic', team: 'crew', x: 2, y: 5, hp: 8, ap: 4 },
    { id: 'soren', name: 'Soren Vale', role: 'Scout', team: 'crew', x: 2, y: 6, hp: 8, ap: 4 },
    { id: 'wraith-1', name: 'Wraith Kesh', role: 'Void raider', team: 'enemy', x: 6, y: 2, hp: 6, ap: 4 },
    { id: 'wraith-2', name: 'Wraith Oru', role: 'Void raider', team: 'enemy', x: 9, y: 2, hp: 6, ap: 4 },
    { id: 'wraith-3', name: 'Wraith Vek', role: 'Void raider', team: 'enemy', x: 9, y: 6, hp: 6, ap: 4 },
  ],
}
