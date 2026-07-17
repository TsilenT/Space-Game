import { describe, expect, it } from 'vitest'
import { FIRE_MODES, TURN_TIME_UNITS, attack, createGame, currentVisibility, enemyTurn, endTurn, hitChance, legalMoves, legalTargets, move, selectUnit, type Unit } from './game'
import { defineTacticalMap, key, type TacticalMission } from './map'

// Hunted LCG states: the next roll(s) from these values land where each name says.
const RNG_SURE_HIT = 1972 // 0.0
const RNG_SURE_MISS = 1868 // 96.0, above the 95% chance cap
const RNG_TRIPLE_HIT = 8 // 23.9, 0.4, 29.7
const RNG_HIT_THEN_MISS = 30 // 24.8, 100.0

const unit = (game: ReturnType<typeof createGame>, id: string): Unit =>
  game.units.find(candidate => candidate.id === id)!

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
  it('moves only to reachable walkable unoccupied cells and spends time units', () => {
    let game = selectUnit(createGame(), 'soren')
    expect(legalMoves(game)).toContainEqual({ x: 3, y: 6 })
    game = move(game, 3, 6)
    expect(unit(game, 'soren')).toMatchObject({ x: 3, y: 6, ap: TURN_TIME_UNITS - 3 })
    expect(move(game, 0, 0)).toBe(game)
  })
  it('rejects enemy selection and out-of-range attacks', () => {
    const game = createGame()
    expect(selectUnit(game, 'wraith-1')).toBe(game)
    expect(attack(game, 'wraith-1')).toBe(game)
  })
  it('deals damage on a sure hit, spends time units, and removes dead units from play', () => {
    const base = createGame()
    const units = base.units.map(u => u.id === 'ada' ? { ...u, x: 5, y: 2 } : u.id === 'wraith-1' ? { ...u, hp: 3 } : u)
    const game = attack({ ...base, units, selectedId: 'ada', rngState: RNG_SURE_HIT }, 'wraith-1')
    expect(unit(game, 'wraith-1').hp).toBe(0)
    expect(unit(game, 'ada')).toMatchObject({ ap: TURN_TIME_UNITS - FIRE_MODES.snap.cost, hits: 1 })
  })
  it('enemy phase is deterministic and returns control with refreshed time units', () => {
    const ended = endTurn(createGame())
    expect(ended.phase).toBe('enemy')
    const next = enemyTurn(ended)
    expect(next.phase).toBe('player')
    expect(next.turn).toBe(2)
    expect(next.units.filter(u => u.team === 'crew').every(u => u.ap === TURN_TIME_UNITS)).toBe(true)
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

const rangeLegend = {
  '.': { room: 'Deck', walkable: true, opaque: false },
  '#': { room: 'Hull', walkable: false, opaque: true },
  o: { room: 'Deck', walkable: false, opaque: false, cover: true },
}

function fireMission(): TacticalMission {
  return {
    id: 'fire-test',
    objective: { kind: 'eliminate', label: 'Test fire modes' },
    visionRange: 8,
    map: defineTacticalMap({ rows: ['..........', '..........', '..........'], legend: rangeLegend }),
    crewSpawns: [{ x: 0, y: 1 }],
    units: [
      { id: 'ada', name: 'Ada', role: 'Marine', team: 'crew', x: 0, y: 1, hp: 8, ap: 12, accuracy: 70 },
      { id: 'wraith-1', name: 'Wraith', role: 'Raider', team: 'enemy', x: 4, y: 1, hp: 12, ap: 12, accuracy: 45 },
    ],
  }
}

describe('fire modes and accuracy', () => {
  it('derives hit chance from soldier accuracy, fire mode, and distance', () => {
    const game = createGame(fireMission())
    const ada = unit(game, 'ada')
    const wraith = unit(game, 'wraith-1')
    // Distance 4 → 9% range penalty on top of the mode factor.
    expect(hitChance(game, ada, wraith, 'snap')).toBe(51)
    expect(hitChance(game, ada, wraith, 'auto')).toBe(33)
    expect(hitChance(game, ada, wraith, 'aimed')).toBe(72)
    // Point blank drops the range penalty entirely.
    const close = { ...game, units: game.units.map(u => u.id === 'wraith-1' ? { ...u, x: 1 } : u) }
    expect(hitChance(close, unit(close, 'ada'), unit(close, 'wraith-1'), 'aimed')).toBe(81)
  })

  it('penalizes targets shielded by cover on the shooter-facing side', () => {
    const mission = fireMission()
    const covered: TacticalMission = {
      ...mission,
      map: defineTacticalMap({ rows: ['..........', '...o......', '..........'], legend: rangeLegend }),
    }
    const game = createGame(covered)
    const ada = unit(game, 'ada')
    const wraith = unit(game, 'wraith-1')
    expect(hitChance(game, ada, wraith, 'aimed')).toBe(52)
    // The same crate does not shield against fire from the opposite side.
    const flanked = { ...game, units: game.units.map(u => u.id === 'ada' ? { ...u, x: 8 } : u) }
    expect(hitChance(flanked, unit(flanked, 'ada'), unit(flanked, 'wraith-1'), 'aimed')).toBe(72)
  })

  it('spends the fire mode cost, hits deterministically, and tracks landed hits', () => {
    const game = createGame(fireMission())
    const hit = attack({ ...game, rngState: RNG_SURE_HIT }, 'wraith-1', 'aimed')
    expect(unit(hit, 'wraith-1').hp).toBe(9)
    expect(unit(hit, 'ada')).toMatchObject({ ap: 12 - FIRE_MODES.aimed.cost, hits: 1 })
    expect(hit.log[0]).toContain('aimed shot hits Wraith for 3 damage')

    const miss = attack({ ...game, rngState: RNG_SURE_MISS }, 'wraith-1', 'snap')
    expect(unit(miss, 'wraith-1').hp).toBe(12)
    expect(unit(miss, 'ada')).toMatchObject({ ap: 12 - FIRE_MODES.snap.cost, hits: 0 })
    expect(miss.log[0]).toContain('snap shot misses Wraith')
    expect(miss.rngState).not.toBe(game.rngState)
  })

  it('fires three auto rounds, each rolled separately', () => {
    const game = createGame(fireMission())
    const triple = attack({ ...game, rngState: RNG_TRIPLE_HIT }, 'wraith-1', 'auto')
    expect(unit(triple, 'wraith-1').hp).toBe(3)
    expect(unit(triple, 'ada')).toMatchObject({ ap: 12 - FIRE_MODES.auto.cost, hits: 3 })
    expect(triple.log[0]).toContain('auto shot hits Wraith 3x for 9 damage')

    const single = attack({ ...game, rngState: RNG_HIT_THEN_MISS }, 'wraith-1', 'auto')
    expect(unit(single, 'wraith-1').hp).toBeLessThan(12)
    expect(unit(single, 'ada').hits).toBeLessThan(3)
  })

  it('refuses a fire mode the soldier cannot afford', () => {
    const game = createGame(fireMission())
    const tired = {
      ...game,
      rngState: RNG_SURE_HIT,
      units: game.units.map(u => u.id === 'ada' ? { ...u, ap: FIRE_MODES.aimed.cost - 1 } : u),
    }
    expect(legalTargets(tired, 'aimed')).toEqual([])
    expect(attack(tired, 'wraith-1', 'aimed')).toBe(tired)
    expect(legalTargets(tired, 'snap').map(u => u.id)).toContain('wraith-1')
  })

  it('keeps enemies from sniping beyond vision range, so every shooter is visible to its target', () => {
    const mission = fireMission()
    const dark: TacticalMission = {
      ...mission,
      visionRange: 6,
      units: mission.units.map(unit => unit.id === 'wraith-1' ? { ...unit, x: 8 } : unit),
    }
    const staged = { ...createGame(dark), phase: 'enemy' as const, selectedId: undefined, rngState: RNG_SURE_HIT }
    const result = enemyTurn(staged)
    // Clear corridor, sure-hit roll — but at distance 8 the wraith advances instead of firing.
    expect(unit(result, 'ada').hp).toBe(8)
    expect(unit(result, 'wraith-1').x).toBe(7)
  })

  it('rolls enemy fire with the same accuracy system so cover protects crew', () => {
    const game = createGame(fireMission())
    const staged = {
      ...game,
      phase: 'enemy' as const,
      selectedId: undefined,
      rngState: RNG_SURE_MISS,
    }
    const missed = enemyTurn(staged)
    expect(unit(missed, 'ada').hp).toBe(8)
    expect(missed.log.some(entry => entry.includes('misses'))).toBe(true)

    const hit = enemyTurn({ ...staged, rngState: RNG_SURE_HIT })
    expect(unit(hit, 'ada').hp).toBe(6)
  })
})

describe('projectiles and stray fire', () => {
  it('records a direct hit shot for the renderer, including kills', () => {
    const game = createGame(fireMission())
    const hit = attack({ ...game, rngState: RNG_SURE_HIT }, 'wraith-1', 'aimed')
    expect(hit.lastShots).toHaveLength(1)
    expect(hit.lastShots[0]).toMatchObject({
      shooterId: 'ada',
      team: 'crew',
      from: { x: 0, y: 1 },
      aimAt: { x: 4, y: 1 },
      impact: { x: 4, y: 1 },
      hitUnitId: 'wraith-1',
      damage: 3,
      killed: false,
      deviationDeg: 0,
      struckObstacle: false,
    })

    const wounded = { ...game, rngState: RNG_SURE_HIT, units: game.units.map(u => u.id === 'wraith-1' ? { ...u, hp: 3 } : u) }
    const kill = attack(wounded, 'wraith-1', 'aimed')
    expect(kill.lastShots[0].killed).toBe(true)
    expect(unit(kill, 'wraith-1').hp).toBe(0)
  })

  it('deflects a miss by an angle scaled to how badly it missed, until it strikes the hull', () => {
    const mission = fireMission()
    const corridor: TacticalMission = {
      ...mission,
      map: defineTacticalMap({ rows: ['..........'], legend: rangeLegend }),
      crewSpawns: [{ x: 0, y: 0 }],
      units: mission.units.map(u => ({ ...u, y: 0 })),
    }
    const game = createGame(corridor)
    const missed = attack({ ...game, rngState: RNG_SURE_MISS }, 'wraith-1', 'snap')

    expect(unit(missed, 'wraith-1').hp).toBe(12)
    expect(unit(missed, 'ada').hits).toBe(0)
    expect(missed.lastShots).toHaveLength(1)
    const shot = missed.lastShots[0]
    expect(shot.hitUnitId).toBeUndefined()
    expect(shot.damage).toBe(0)
    expect(shot.struckObstacle).toBe(true)
    expect(Math.abs(shot.deviationDeg)).toBeGreaterThan(0)
    expect(shot.impact).not.toEqual({ x: 4, y: 0 })
  })

  it('lets a stray round hit a friendly standing beside the fire lane', () => {
    const wide: TacticalMission = {
      id: 'stray-test',
      objective: { kind: 'eliminate', label: 'Test stray fire' },
      visionRange: 8,
      map: defineTacticalMap({ rows: ['..........', '..........', '..........', '..........', '..........'], legend: rangeLegend }),
      crewSpawns: [{ x: 0, y: 2 }, { x: 2, y: 1 }, { x: 2, y: 3 }],
      units: [
        { id: 'ada', name: 'Ada', role: 'Marine', team: 'crew', x: 0, y: 2, hp: 8, ap: 12, accuracy: 70 },
        { id: 'milo', name: 'Milo', role: 'Engineer', team: 'crew', x: 2, y: 1, hp: 8, ap: 12, accuracy: 45 },
        { id: 'imani', name: 'Imani', role: 'Medic', team: 'crew', x: 2, y: 3, hp: 8, ap: 12, accuracy: 45 },
        { id: 'wraith-1', name: 'Wraith', role: 'Raider', team: 'enemy', x: 6, y: 2, hp: 12, ap: 12, accuracy: 45 },
      ],
    }
    const game = createGame(wide)
    const missed = attack({ ...game, rngState: RNG_SURE_MISS }, 'wraith-1', 'snap')

    expect(unit(missed, 'wraith-1').hp).toBe(12)
    const shot = missed.lastShots[0]
    expect(['milo', 'imani']).toContain(shot.hitUnitId)
    const victim = missed.units.find(u => u.id === shot.hitUnitId)!
    expect(victim.hp).toBe(5)
    expect(shot.impact).toEqual({ x: victim.x, y: victim.y })
    // Friendly fire never trains the shooter.
    expect(unit(missed, 'ada').hits).toBe(0)
    expect(missed.log[1]).toContain('goes wide and hits')
  })

  it('clears the shot record on movement', () => {
    const game = createGame(fireMission())
    const hit = attack({ ...game, rngState: RNG_SURE_HIT }, 'wraith-1', 'snap')
    expect(hit.lastShots).toHaveLength(1)
    const moved = move(hit, 0, 0)
    expect(moved.lastShots).toEqual([])
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
    objective: { kind: 'eliminate', label: 'Test doors' },
    visionRange: 3,
    map: defineTacticalMap({ rows: ['..D..'], legend: doorLegend }),
    crewSpawns: [{ x: 0, y: 0 }],
    units: [
      { id: 'ada', name: 'Ada', role: 'Marine', team: 'crew', x: 0, y: 0, hp: 8, ap: 12, accuracy: 60 },
      { id: 'wraith-1', name: 'Wraith', role: 'Raider', team: 'enemy', x: 4, y: 0, hp: 6, ap: 12, accuracy: 45 },
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

  it('does not let a unit path through a closed door even when shared crew vision reveals the far side', () => {
    const mission: TacticalMission = {
      id: 'door-test-two-sided',
      objective: { kind: 'eliminate', label: 'Test doors from both sides' },
      visionRange: 2,
      map: defineTacticalMap({ rows: ['..D...'], legend: doorLegend }),
      crewSpawns: [{ x: 0, y: 0 }, { x: 4, y: 0 }],
      units: [
        { id: 'ada', name: 'Ada', role: 'Marine', team: 'crew', x: 0, y: 0, hp: 8, ap: 12, accuracy: 60 },
        { id: 'milo', name: 'Milo', role: 'Engineer', team: 'crew', x: 4, y: 0, hp: 8, ap: 12, accuracy: 45 },
        { id: 'wraith-1', name: 'Wraith', role: 'Raider', team: 'enemy', x: 5, y: 0, hp: 6, ap: 12, accuracy: 45 },
      ],
    }
    const game = createGame(mission)

    // Milo's own view of the far side stitches the whole corridor into shared vision,
    // even though the door between them is still closed.
    expect(currentVisibility(game).map(key)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0'])
    expect(game.openDoors).toEqual([])

    const moves = legalMoves(game).map(key)
    expect(moves).toEqual(['1,0', '2,0'])
    expect(moves).not.toContain('3,0')
    expect(move(game, 3, 0)).toBe(game)

    const opened = move(game, 2, 0)
    expect(opened.openDoors).toEqual(['2,0'])
    expect(legalMoves(opened).map(key)).toContain('3,0')
  })
})
