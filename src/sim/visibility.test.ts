import { describe, expect, it } from 'vitest'
import { attack, createGame, currentVisibility, enemyTurn, legalTargets, move, selectUnit } from './game'
import { BOARDING_MISSION, defineTacticalMap, key, type TacticalMission } from './map'
import { hasLineOfSight, visibleCells } from './visibility'

const legend = {
  '.': { room: 'Test Deck', walkable: true, opaque: false },
  '#': { room: 'Hull', walkable: false, opaque: true },
}

const mapFrom = (...rows: string[]) => defineTacticalMap({ rows, legend })

describe('deterministic line of sight', () => {
  it('handles identical, invalid, clear, wall, and beyond-wall targets', () => {
    const map = mapFrom('..#..')
    expect(hasLineOfSight(map, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true)
    expect(hasLineOfSight(map, { x: -1, y: 0 }, { x: 0, y: 0 })).toBe(false)
    expect(hasLineOfSight(map, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true)
    expect(hasLineOfSight(map, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true)
    expect(hasLineOfSight(map, { x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false)
  })

  it('blocks an opaque diagonal cell and a sealed diagonal corner', () => {
    const diagonalWall = mapFrom('...', '.#.', '...')
    expect(hasLineOfSight(diagonalWall, { x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false)

    const sealedCorner = mapFrom('.#.', '#..', '...')
    expect(hasLineOfSight(sealedCorner, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false)
    expect(hasLineOfSight(sealedCorner, { x: 1, y: 1 }, { x: 0, y: 0 })).toBe(false)
  })

  it('allows sight past one exposed corner and along shallow or steep clear lines', () => {
    const exposedCorner = mapFrom('.#...', '.....', '.....', '.....', '.....')
    expect(hasLineOfSight(exposedCorner, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true)
    const clearMap = mapFrom('.....', '.....', '.....', '.....', '.....')
    expect(hasLineOfSight(clearMap, { x: 0, y: 0 }, { x: 4, y: 2 })).toBe(true)
    expect(hasLineOfSight(clearMap, { x: 0, y: 0 }, { x: 2, y: 4 })).toBe(true)
  })

  it('is symmetric for every cell pair on the boarding map', () => {
    for (const from of BOARDING_MISSION.map.cells) {
      for (const to of BOARDING_MISSION.map.cells) {
        expect(hasLineOfSight(BOARDING_MISSION.map, from, to)).toBe(hasLineOfSight(BOARDING_MISSION.map, to, from))
      }
    }
  })

  it('returns visible cells in canonical row-major order', () => {
    const map = mapFrom('....', '....')
    const result = visibleCells(map, [{ x: 0, y: 0 }], 2)
    expect(result).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 1 },
    ])
  })
})

function corridorMission(): TacticalMission {
  return {
    id: 'visibility-test',
    objective: { kind: 'eliminate', label: 'Test vision' },
    visionRange: 2,
    map: mapFrom('........'),
    crewSpawns: [{ x: 0, y: 0 }, { x: 6, y: 0 }],
    units: [
      { id: 'ada', name: 'Ada', role: 'Marine', team: 'crew', x: 0, y: 0, hp: 8, ap: 4 },
      { id: 'milo', name: 'Milo', role: 'Engineer', team: 'crew', x: 6, y: 0, hp: 8, ap: 4 },
      { id: 'wraith-1', name: 'Wraith', role: 'Raider', team: 'enemy', x: 7, y: 0, hp: 6, ap: 4 },
    ],
  }
}

describe('shared squad fog of war', () => {
  it('combines living crew vision, ignores selection, and removes dead observers', () => {
    const game = createGame(corridorMission())
    const initial = currentVisibility(game).map(key)
    expect(initial).toEqual(['0,0', '1,0', '2,0', '4,0', '5,0', '6,0', '7,0'])
    expect(game.explored).toEqual(initial)
    expect(currentVisibility(selectUnit(game, 'milo')).map(key)).toEqual(initial)

    const afterDeath = { ...game, units: game.units.map(unit => unit.id === 'milo' ? { ...unit, hp: 0 } : unit) }
    expect(currentVisibility(afterDeath).map(key)).toEqual(['0,0', '1,0', '2,0'])
    expect(afterDeath.explored).toEqual(initial)
  })

  it('reveals from a new position while retaining dim memory of old cells', () => {
    const mission = corridorMission()
    const soloMission = { ...mission, units: mission.units.filter(unit => unit.id !== 'milo') }
    let game = createGame(soloMission)
    const initialExplored = game.explored
    game = move(game, 2, 0)
    expect(initialExplored).toEqual(['0,0', '1,0', '2,0'])
    expect(currentVisibility(game).map(key)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0'])
    game = move(game, 4, 0)
    expect(currentVisibility(game).map(key)).toEqual(['2,0', '3,0', '4,0', '5,0', '6,0'])
    expect(game.explored).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '6,0'])
  })

  it('starts with all hostiles outside the boarding team view', () => {
    const game = createGame()
    const visible = new Set(currentVisibility(game).map(key))
    expect(game.units.filter(unit => unit.team === 'enemy').every(unit => !visible.has(key(unit)))).toBe(true)
    expect([...visible].every(cellKey => game.explored.includes(cellKey))).toBe(true)
  })

  it('does not expose a clear but out-of-vision target to player attacks', () => {
    const mission = corridorMission()
    const game = createGame({
      ...mission,
      units: [
        mission.units[0],
        { ...mission.units[2], x: 3 },
      ],
    })
    expect(currentVisibility(game).map(key)).not.toContain('3,0')
    expect(legalTargets(game)).toEqual([])
    expect(attack(game, 'wraith-1')).toBe(game)
  })
})

describe('line of sight in combat', () => {
  it('rejects a wall-blocked shot even when a teammate sees the target', () => {
    const base = createGame()
    const units = base.units.map(unit => unit.id === 'ada'
      ? { ...unit, x: 3, y: 3 }
      : unit.id === 'milo'
        ? { ...unit, x: 5, y: 2 }
        : unit.id === 'wraith-1'
          ? { ...unit, x: 5, y: 3 }
          : unit)
    const game = { ...base, units, selectedId: 'ada' }
    expect(new Set(currentVisibility(game).map(key)).has('5,3')).toBe(true)
    expect(legalTargets(game).map(unit => unit.id)).not.toContain('wraith-1')
    expect(attack(game, 'wraith-1')).toBe(game)
  })

  it('prevents enemy damage through a wall', () => {
    const base = createGame()
    const units = base.units.map(unit => unit.id === 'wraith-1'
      ? { ...unit, x: 3, y: 3 }
      : unit.id === 'ada'
        ? { ...unit, x: 5, y: 3 }
        : { ...unit, hp: 0 })
    const result = enemyTurn({ ...base, phase: 'enemy', selectedId: undefined, units })
    expect(result.units.find(unit => unit.id === 'ada')?.hp).toBe(8)
  })

  it('lets enemy AI skip a nearer occluded target for a visible one', () => {
    const base = createGame()
    const units = base.units.map(unit => unit.id === 'wraith-1'
      ? { ...unit, x: 3, y: 3 }
      : unit.id === 'ada'
        ? { ...unit, x: 5, y: 3 }
        : unit.id === 'milo'
          ? { ...unit, x: 3, y: 0 }
          : { ...unit, hp: 0 })
    const result = enemyTurn({ ...base, phase: 'enemy', selectedId: undefined, units })
    expect(result.units.find(unit => unit.id === 'ada')?.hp).toBe(8)
    expect(result.units.find(unit => unit.id === 'milo')?.hp).toBe(6)
  })

  it('routes enemies around walls without oscillating', () => {
    const base = createGame()
    const units = base.units.map(unit => unit.id === 'wraith-1'
      ? { ...unit, x: 5, y: 0 }
      : unit.id === 'ada'
        ? { ...unit, x: 1, y: 0 }
        : { ...unit, hp: 0 })
    const first = enemyTurn({ ...base, phase: 'enemy', selectedId: undefined, units })
    expect(first.units.find(unit => unit.id === 'wraith-1')).toMatchObject({ x: 5, y: 1 })
    const second = enemyTurn({ ...first, phase: 'enemy', selectedId: undefined })
    expect(second.units.find(unit => unit.id === 'wraith-1')).toMatchObject({ x: 4, y: 1 })
  })
})
