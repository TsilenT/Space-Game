import { describe, expect, it } from 'vitest'
import { attack, createGame, currentVisibility, enemyTurn, endTurn, legalMoves, legalTargets, move, selectUnit } from './game'
import { defineTacticalMap, key, type TacticalMission } from './map'

describe('deterministic tactical simulation', () => {
  it('starts with four crew, three enemies and player phase', () => {
    const game = createGame()
    expect(game.units.filter(u => u.team === 'crew')).toHaveLength(4)
    expect(game.units.filter(u => u.team === 'enemy')).toHaveLength(3)
    expect(game.phase).toBe('player')
    expect(game.map).toMatchObject({ width: 12, height: 8 })
    expect(game.map.rooms).toHaveLength(5)
    expect(game.map.systems).toHaveLength(4)
  })
  it('moves only to reachable walkable unoccupied cells and spends AP', () => {
    let game = selectUnit(createGame(), 'soren')
    expect(legalMoves(game)).toContainEqual({ x: 3, y: 6 })
    game = move(game, 3, 6)
    expect(game.units.find(u => u.id === 'soren')).toMatchObject({ x: 3, y: 6, ap: 3 })
    expect(move(game, 0, 0)).toBe(game)
  })
  it('rejects enemy selection and out-of-range attacks', () => {
    const game = createGame()
    expect(selectUnit(game, 'wraith-1')).toBe(game)
    expect(attack(game, 'wraith-1')).toBe(game)
  })
  it('deals deterministic damage, spends AP, and removes dead units from play', () => {
    const base = createGame()
    const units = base.units.map(u => u.id === 'ada' ? { ...u, x: 5, y: 2 } : u.id === 'wraith-1' ? { ...u, hp: 3 } : u)
    const game = attack({ ...base, units, selectedId: 'ada' }, 'wraith-1')
    expect(game.units.find(u => u.id === 'wraith-1')?.hp).toBe(0)
    expect(game.units.find(u => u.id === 'ada')?.ap).toBe(2)
  })
  it('enemy phase is deterministic and returns control with refreshed AP', () => {
    const ended = endTurn(createGame())
    expect(ended.phase).toBe('enemy')
    const next = enemyTurn(ended)
    expect(next.phase).toBe('player')
    expect(next.turn).toBe(2)
    expect(next.units.filter(u => u.team === 'crew').every(u => u.ap === 4)).toBe(true)
  })
  it('rejects enemy-turn simulation outside the enemy phase', () => {
    const game = createGame()
    expect(enemyTurn(game)).toBe(game)
  })
  it('detects victory and defeat', () => {
    const base = createGame()
    expect(enemyTurn({ ...base, phase: 'enemy', units: base.units.map(u => u.team === 'enemy' ? { ...u, hp: 0 } : u) }).status).toBe('victory')
    expect(enemyTurn({ ...base, phase: 'enemy', units: base.units.map(u => u.team === 'crew' ? { ...u, hp: 0 } : u) }).status).toBe('defeat')
  })
})

const doorLegend = {
  '.': { room: 'Deck', walkable: true, opaque: false },
  '#': { room: 'Hull', walkable: false, opaque: true },
  D: { room: 'Vault', walkable: true, opaque: true, door: true },
}

function doorMission(): TacticalMission {
  return {
    id: 'door-test',
    objective: 'Test doors',
    visionRange: 3,
    map: defineTacticalMap({ rows: ['..D..'], legend: doorLegend }),
    units: [
      { id: 'ada', name: 'Ada', role: 'Marine', team: 'crew', x: 0, y: 0, hp: 8, ap: 4 },
      { id: 'wraith-1', name: 'Wraith', role: 'Raider', team: 'enemy', x: 4, y: 0, hp: 6, ap: 4 },
    ],
  }
}

describe('closed doors', () => {
  it('blocks vision and fire like a wall while closed', () => {
    const game = createGame(doorMission())
    expect(currentVisibility(game).map(key)).toEqual(['0,0', '1,0', '2,0'])
    expect(game.openDoors).toEqual([])
  })

  it('opens when a crew member moves onto it, revealing what is beyond', () => {
    let game = createGame(doorMission())
    expect(legalMoves(game)).toContainEqual({ x: 2, y: 0 })
    game = move(game, 2, 0)
    expect(game.openDoors).toEqual(['2,0'])
    expect(game.log[0]).toBe('Ada forces open the Vault door.')
    expect(currentVisibility(game).map(key)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0'])
    expect(legalTargets(game).map(unit => unit.id)).toContain('wraith-1')
  })

  it('lets an enemy force a door open while advancing', () => {
    const mission = doorMission()
    const positioned = { ...mission, units: mission.units.map(unit => unit.id === 'wraith-1' ? { ...unit, x: 3 } : unit) }
    const game = createGame(positioned)
    const result = enemyTurn({ ...game, phase: 'enemy', selectedId: undefined })
    expect(result.openDoors).toEqual(['2,0'])
    expect(result.units.find(unit => unit.id === 'wraith-1')).toMatchObject({ x: 2, y: 0 })
  })
})
