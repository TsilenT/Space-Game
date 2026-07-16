export type SystemKind = 'distress' | 'starbase' | 'abandoned-moon' | 'core'

export interface StarSystem {
  readonly id: string
  readonly name: string
  readonly kind: SystemKind
  readonly ring: number
  readonly angle: number
  readonly eventSeed: number
}

export interface Galaxy {
  readonly seed: number
  readonly systems: readonly StarSystem[]
  readonly adjacency: Readonly<Record<string, readonly string[]>>
  readonly startId: string
  readonly coreId: string
}

/** Ring populations from the core (index 0) out to the rim. */
export const RING_SIZES = [1, 4, 6, 7] as const

const CORE_NAME = 'Galactic Core'
const SYSTEM_NAMES = [
  'Port Meridian', 'Gannet Exchange', 'Saint Orison Depot', 'Broken Chorus',
  'Emergency Beacon K-9', 'Last Light Signal', 'Orpheus Minor', 'Ash Moon D-14',
  'Silent Caldera', 'Hollow Crown', 'Veiled Reach', 'Tannhauser Drift',
  'Cinder Verge', 'Pale Lantern', 'Iron Chapel', 'Mote of Ruin',
  'Whisper Line', 'Redshift Yard', 'Coldwake', 'Nadir Cross',
] as const

function nextSeed(seed: number): number {
  return (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
}

function unitRoll(seed: number): number {
  return nextSeed(seed) / 0x1_0000_0000
}

function angularDistance(a: number, b: number): number {
  const difference = Math.abs(a - b) % (2 * Math.PI)
  return Math.min(difference, 2 * Math.PI - difference)
}

function systemKind(roll: number): SystemKind {
  return roll < 0.34 ? 'distress' : roll < 0.67 ? 'starbase' : 'abandoned-moon'
}

export function generateGalaxy(seed: number): Galaxy {
  let rng = seed >>> 0
  const next = () => (rng = nextSeed(rng))

  const names = [...SYSTEM_NAMES]
  for (let index = names.length - 1; index > 0; index--) {
    const swap = Math.floor(unitRoll(next()) * (index + 1))
    ;[names[index], names[swap]] = [names[swap], names[index]]
  }

  const systems: StarSystem[] = []
  let nameIndex = 0
  RING_SIZES.forEach((count, ring) => {
    const rotation = ring === 0 ? 0 : unitRoll(next())
    for (let index = 0; index < count; index++) {
      const kindRoll = unitRoll(next())
      const eventSeed = next()
      systems.push({
        id: `sys-${ring}-${index}`,
        name: ring === 0 ? CORE_NAME : names[nameIndex++],
        kind: ring === 0 ? 'core' : systemKind(kindRoll),
        ring,
        angle: ring === 0 ? 0 : ((index + rotation) / count) * 2 * Math.PI,
        eventSeed,
      })
    }
  })

  const edges = new Set<string>()
  const link = (a: string, b: string) => edges.add(a < b ? `${a}|${b}` : `${b}|${a}`)

  for (let ring = 1; ring < RING_SIZES.length; ring++) {
    const ringSystems = systems.filter(system => system.ring === ring)
    const innerSystems = systems.filter(system => system.ring === ring - 1)

    ringSystems.forEach((system, index) => {
      link(system.id, ringSystems[(index + 1) % ringSystems.length].id)

      const inward = [...innerSystems].sort(
        (a, b) => angularDistance(system.angle, a.angle) - angularDistance(system.angle, b.angle),
      )
      link(system.id, inward[0].id)
      if (inward.length > 1 && unitRoll(next()) < 0.4) link(system.id, inward[1].id)
    })
  }

  const adjacency: Record<string, string[]> = Object.fromEntries(systems.map(system => [system.id, []]))
  for (const edge of edges) {
    const [a, b] = edge.split('|')
    adjacency[a].push(b)
    adjacency[b].push(a)
  }
  for (const id of Object.keys(adjacency)) adjacency[id].sort()

  const rimSize = RING_SIZES[RING_SIZES.length - 1]
  const startIndex = Math.floor(unitRoll(next()) * rimSize)

  return {
    seed: seed >>> 0,
    systems,
    adjacency,
    startId: `sys-${RING_SIZES.length - 1}-${startIndex}`,
    coreId: 'sys-0-0',
  }
}

export function systemById(galaxy: Galaxy, id: string): StarSystem {
  const system = galaxy.systems.find(candidate => candidate.id === id)
  if (!system) throw new Error(`Unknown star system "${id}".`)
  return system
}

/**
 * Legal jump destinations: adjacent, unvisited, and never back toward the rim.
 * Because every non-core system keeps at least one inward link and ring numbers
 * only ever decrease or hold along a route, an unvisited inward system always
 * exists — the ship cannot strand itself short of the core.
 */
export function jumpTargets(galaxy: Galaxy, currentId: string, visitedIds: readonly string[]): StarSystem[] {
  const current = systemById(galaxy, currentId)
  const visited = new Set(visitedIds)
  return (galaxy.adjacency[currentId] ?? [])
    .map(id => systemById(galaxy, id))
    .filter(system => !visited.has(system.id) && system.ring <= current.ring)
    .sort((a, b) => a.ring - b.ring || a.id.localeCompare(b.id))
}

/** Systems whose mission type is known: everywhere visited plus everything adjacent to it. */
export function revealedSystemIds(galaxy: Galaxy, visitedIds: readonly string[]): Set<string> {
  const revealed = new Set(visitedIds)
  for (const id of visitedIds) for (const neighbor of galaxy.adjacency[id] ?? []) revealed.add(neighbor)
  return revealed
}
