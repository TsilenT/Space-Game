import { describe, expect, it } from 'vitest'
import { attack, createGame, enemyTurn, endTurn, legalMoves, move, selectUnit } from './game'

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
