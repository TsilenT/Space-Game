import { describe, expect, it } from 'vitest'
import { FIRE_MODES, TURN_TIME_UNITS, WALL_HP, approachAndOpenDoor, attack, attackStructure, attackWall, canTargetStructure, createGame, currentVisibility, enemyTurn, endTurn, hitChance, isCellWalkable, legalMoves, legalTargets, move, selectUnit, type Unit } from './game'
import { defineTacticalMap, doorKey, key, type TacticalMission } from './map'

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
    expect(game.map).toMatchObject({ width: 36, height: 24 })
    expect(game.map.rooms).toHaveLength(5)
    expect(game.map.systems).toHaveLength(4)
  })
  it('moves only to reachable walkable unoccupied cells and spends time units', () => {
    let game = selectUnit(createGame(), 'soren')
    expect(legalMoves(game)).toContainEqual({ x: 10, y: 19 })
    game = move(game, 10, 19)
    expect(unit(game, 'soren')).toMatchObject({ x: 10, y: 19, ap: TURN_TIME_UNITS - 3 })
    expect(move(game, 0, 0)).toBe(game)
  })
  it('rejects enemy selection and out-of-range attacks', () => {
    const game = createGame()
    expect(selectUnit(game, 'wraith-1')).toBe(game)
    expect(attack(game, 'wraith-1')).toBe(game)
  })
  it('deals damage on a sure hit, spends time units, and removes dead units from play', () => {
    const base = createGame()
    const units = base.units.map(u => u.id === 'ada' ? { ...u, x: 17, y: 7 } : u.id === 'wraith-1' ? { ...u, hp: 3 } : u)
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
  s: { room: 'Deck', walkable: false, opaque: false, cover: true, structure: { name: 'storage unit', hp: 9 } },
  v: { room: 'Deck', walkable: false, opaque: false, cover: true, structure: { name: 'display bank', hp: 6 } },
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
    // Distance 4 → 3% range penalty on top of the mode factor.
    expect(hitChance(game, ada, wraith, 'snap')).toBe(57)
    expect(hitChance(game, ada, wraith, 'auto')).toBe(39)
    expect(hitChance(game, ada, wraith, 'aimed')).toBe(78)
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
    expect(hitChance(game, ada, wraith, 'aimed')).toBe(58)
    // The same crate does not shield against fire from the opposite side.
    const flanked = { ...game, units: game.units.map(u => u.id === 'ada' ? { ...u, x: 8 } : u) }
    expect(hitChance(flanked, unit(flanked, 'ada'), unit(flanked, 'wraith-1'), 'aimed')).toBe(78)
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
    // Clear corridor, sure-hit roll — but the wraith holds fire at distance 8
    // and 7, closing to vision range before its shot lands.
    expect(unit(result, 'wraith-1').x).toBe(6)
    expect(unit(result, 'ada').hp).toBe(6)
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

function structureMission(): TacticalMission {
  return {
    id: 'structure-test',
    objective: { kind: 'eliminate', label: 'Test destructible geometry' },
    visionRange: 8,
    map: defineTacticalMap({ rows: ['..........', '..s.......', '..........'], legend: rangeLegend }),
    crewSpawns: [{ x: 0, y: 1 }],
    units: [
      { id: 'ada', name: 'Ada', role: 'Marine', team: 'crew', x: 0, y: 1, hp: 8, ap: 12, accuracy: 70 },
      { id: 'wraith-1', name: 'Wraith', role: 'Raider', team: 'enemy', x: 8, y: 1, hp: 12, ap: 12, accuracy: 45 },
    ],
  }
}

describe('destructible geometry', () => {
  it('tracks structure hit points from the map definition', () => {
    const game = createGame(structureMission())
    expect(game.structureHp).toEqual({ '2,1': 9 })
    expect(isCellWalkable(game, { x: 2, y: 1 })).toBe(false)
  })

  it('rolls to hit like any other shot: three sure-hit snaps fell a storage unit', () => {
    let game = createGame(structureMission())
    const first = attackStructure({ ...game, rngState: RNG_SURE_HIT }, 2, 1, 'snap')
    expect(first.structureHp['2,1']).toBe(6)
    expect(unit(first, 'ada').ap).toBe(12 - FIRE_MODES.snap.cost)
    expect(first.lastShots).toEqual([expect.objectContaining({ hitStructureAt: { x: 2, y: 1 }, structureDestroyed: false, damage: 3, deviationDeg: 0 })])
    expect(first.log[0]).toContain('tears into the storage unit')
    expect(first.rngState).not.toBe(RNG_SURE_HIT)

    game = attackStructure({ ...first, rngState: RNG_SURE_HIT }, 2, 1, 'snap')
    game = attackStructure({ ...game, rngState: RNG_SURE_HIT }, 2, 1, 'snap')
    expect(game.structureHp['2,1']).toBe(0)
    expect(unit(game, 'ada').ap).toBe(0)
    expect(game.lastShots[0]).toMatchObject({ structureDestroyed: true })
    expect(game.log[0]).toContain('destroys the storage unit')
    expect(unit(game, 'ada').hits).toBe(0)
  })

  it('can miss the crate on the accuracy roll, the round deviating like any stray', () => {
    const missed = attackStructure({ ...createGame(structureMission()), rngState: RNG_SURE_MISS }, 2, 1, 'snap')
    expect(missed.log[0]).toContain('misses the storage unit')
    expect(missed.lastShots[0].deviationDeg).not.toBe(0)
    // From two tiles out the deviated round still slams into the crate.
    expect(missed.structureHp['2,1']).toBe(6)
    expect(missed.log[1]).toContain('slams into the storage unit')
    expect(unit(missed, 'ada').ap).toBe(12 - FIRE_MODES.snap.cost)
  })

  it('cannot target a structure through an object standing in the fire lane', () => {
    const mission = structureMission()
    const blocked: TacticalMission = {
      ...mission,
      map: defineTacticalMap({ rows: ['..........', '.ss.......', '..........'], legend: rangeLegend }),
    }
    const game = createGame(blocked)
    expect(canTargetStructure(game, { x: 2, y: 1 }, 'snap')).toBe(false)
    expect(attackStructure(game, 2, 1, 'snap')).toBe(game)
    // The crate in front is still a legal target.
    expect(canTargetStructure(game, { x: 1, y: 1 }, 'snap')).toBe(true)

    // A bystander standing in the lane blocks the shot the same way.
    const crowded = createGame({
      ...mission,
      units: [...mission.units, { id: 'milo', name: 'Milo', role: 'Engineer', team: 'crew', x: 1, y: 1, hp: 8, ap: 12, accuracy: 45 }],
    })
    expect(canTargetStructure(crowded, { x: 2, y: 1 }, 'snap')).toBe(false)
  })

  it('stops an auto burst once the structure falls and never overpays rounds', () => {
    const mission = structureMission()
    const fragile: TacticalMission = {
      ...mission,
      map: defineTacticalMap({ rows: ['..........', '..v.......', '..........'], legend: rangeLegend }),
    }
    const game = { ...createGame(fragile), rngState: RNG_TRIPLE_HIT }
    const burst = attackStructure(game, 2, 1, 'auto')
    expect(burst.structureHp['2,1']).toBe(0)
    expect(burst.lastShots).toHaveLength(2)
    expect(unit(burst, 'ada').ap).toBe(12 - FIRE_MODES.auto.cost)
  })

  it('leaves passable wreckage: soldiers walk through and cover stops working', () => {
    let game = { ...createGame(structureMission()), rngState: RNG_TRIPLE_HIT }
    game = attackStructure(game, 2, 1, 'auto')
    game = attackStructure({ ...game, rngState: RNG_SURE_HIT }, 2, 1, 'snap')
    expect(game.structureHp['2,1']).toBe(0)
    expect(isCellWalkable(game, { x: 2, y: 1 })).toBe(true)
    expect(canTargetStructure(game, { x: 2, y: 1 })).toBe(false)

    const refreshed = { ...game, units: game.units.map(u => u.id === 'ada' ? { ...u, ap: 12 } : u) }
    expect(legalMoves(refreshed).map(key)).toContain('2,1')
    const walked = move(refreshed, 2, 1)
    expect(unit(walked, 'ada')).toMatchObject({ x: 2, y: 1 })

    // The wreck no longer shields a target crouched behind it.
    const shielded = createGame({
      ...structureMission(),
      units: structureMission().units.map(u => u.id === 'wraith-1' ? { ...u, x: 3, y: 1 } : u),
    })
    const wraith = unit(shielded, 'wraith-1')
    const covered = hitChance(shielded, unit(shielded, 'ada'), wraith, 'aimed')
    const cleared = { ...shielded, structureHp: { '2,1': 0 } }
    expect(hitChance(cleared, unit(cleared, 'ada'), unit(cleared, 'wraith-1'), 'aimed')).toBe(covered + 20)
  })

  it('lets stray rounds chew into structures beside the fire lane', () => {
    const mission = structureMission()
    const strayField: TacticalMission = {
      ...mission,
      map: defineTacticalMap({
        rows: ['..........', '..........', '..........', '..s.......', '..........'],
        legend: rangeLegend,
      }),
      crewSpawns: [{ x: 0, y: 2 }],
      units: [
        { id: 'ada', name: 'Ada', role: 'Marine', team: 'crew', x: 0, y: 2, hp: 8, ap: 12, accuracy: 70 },
        { id: 'wraith-1', name: 'Wraith', role: 'Raider', team: 'enemy', x: 6, y: 2, hp: 12, ap: 12, accuracy: 45 },
      ],
    }
    const game = createGame(strayField)
    const missed = attack({ ...game, rngState: RNG_SURE_MISS }, 'wraith-1', 'snap')

    expect(unit(missed, 'wraith-1').hp).toBe(12)
    expect(missed.structureHp['2,3']).toBe(6)
    expect(missed.lastShots[0]).toMatchObject({ hitStructureAt: { x: 2, y: 3 }, structureDestroyed: false })
    expect(missed.log[1]).toContain('slams into the storage unit')
  })

  it('refuses structure fire without hit points, range, or time units', () => {
    const game = createGame(structureMission())
    expect(canTargetStructure(game, { x: 2, y: 1 }, 'snap')).toBe(true)
    expect(canTargetStructure(game, { x: 5, y: 0 }, 'snap')).toBe(false)
    const tired = { ...game, units: game.units.map(u => u.id === 'ada' ? { ...u, ap: 3 } : u) }
    expect(attackStructure(tired, 2, 1, 'snap')).toBe(tired)

    const mission = structureMission()
    const wide: TacticalMission = {
      ...mission,
      map: defineTacticalMap({ rows: ['............', '..s.........', '............'], legend: rangeLegend }),
      units: mission.units.map(u => u.id === 'ada' ? { ...u, x: 11, y: 2 } : u),
    }
    const far = createGame(wide)
    expect(canTargetStructure(far, { x: 2, y: 1 }, 'snap')).toBe(false)
  })
})

const doorLegend = {
  '.': { room: 'Deck', walkable: true, opaque: false },
  '#': { room: 'Hull', walkable: false, opaque: true },
}

const VAULT_DOOR = { a: { x: 1, y: 0 }, b: { x: 2, y: 0 }, room: 'Vault' }

function doorMission(): TacticalMission {
  return {
    id: 'door-test',
    objective: { kind: 'eliminate', label: 'Test doors' },
    visionRange: 3,
    map: defineTacticalMap({ rows: ['.....'], legend: doorLegend, doors: [VAULT_DOOR] }),
    crewSpawns: [{ x: 0, y: 0 }],
    units: [
      { id: 'ada', name: 'Ada', role: 'Marine', team: 'crew', x: 0, y: 0, hp: 8, ap: 12, accuracy: 60 },
      { id: 'wraith-1', name: 'Wraith', role: 'Raider', team: 'enemy', x: 4, y: 0, hp: 6, ap: 12, accuracy: 45 },
    ],
  }
}

describe('edge doors', () => {
  it('blocks vision and movement across the closed edge without occupying a cell', () => {
    const game = createGame(doorMission())
    expect(currentVisibility(game).map(key)).toEqual(['0,0', '1,0'])
    expect(game.openDoors).toEqual([])
    expect(legalMoves(game).map(key)).toEqual(['1,0'])
    // The far side is neither reachable nor openable from two tiles away.
    expect(move(game, 2, 0)).toBe(game)
  })

  it('opens when a soldier steps into it, revealing what lies beyond without moving them', () => {
    let game = createGame(doorMission())
    game = move(game, 1, 0)
    game = move(game, 2, 0)
    expect(unit(game, 'ada')).toMatchObject({ x: 1, y: 0 })
    expect(game.openDoors).toEqual([doorKey(VAULT_DOOR.a, VAULT_DOOR.b)])
    expect(game.log[0]).toBe('Ada forces open the Vault door.')
    expect(currentVisibility(game).map(key)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0'])
    expect(legalTargets(game).map(unit => unit.id)).toContain('wraith-1')
    expect(legalMoves(game).map(key)).toContain('2,0')
  })

  it('walks the selected soldier up to a clicked door and opens it in one action', () => {
    const game = createGame(doorMission())
    const opened = approachAndOpenDoor(game, VAULT_DOOR)
    expect(unit(opened, 'ada')).toMatchObject({ x: 1, y: 0, ap: TURN_TIME_UNITS - 1 })
    expect(opened.openDoors).toEqual([doorKey(VAULT_DOOR.a, VAULT_DOOR.b)])
    expect(opened.log[0]).toBe('Ada forces open the Vault door.')
  })

  it('swings shut again when the turn ends', () => {
    let game = createGame(doorMission())
    game = approachAndOpenDoor(game, VAULT_DOOR)
    expect(game.openDoors).toHaveLength(1)
    expect(endTurn(game).openDoors).toEqual([])
  })

  it('lets an enemy spend a step forcing the door, which closes again after its phase', () => {
    const game = createGame(doorMission())
    const first = enemyTurn({ ...game, phase: 'enemy', selectedId: undefined })
    // Two steps to reach the door, the third spent forcing it open.
    expect(first.units.find(unit => unit.id === 'wraith-1')).toMatchObject({ x: 2, y: 0 })
    expect(first.log).toContain('Wraith forces open the Vault door.')
    expect(first.openDoors).toEqual([])
    // The door sealed itself, so the wraith forces it again and fires through.
    const second = enemyTurn({ ...first, phase: 'enemy', selectedId: undefined })
    expect(second.units.find(unit => unit.id === 'wraith-1')).toMatchObject({ x: 2, y: 0 })
    expect(second.units.find(unit => unit.id === 'ada')?.hp).toBe(6)
    expect(second.openDoors).toEqual([])
  })

  it('does not let a unit path through a closed door even when shared crew vision reveals the far side', () => {
    const mission: TacticalMission = {
      id: 'door-test-two-sided',
      objective: { kind: 'eliminate', label: 'Test doors from both sides' },
      visionRange: 2,
      map: defineTacticalMap({ rows: ['......'], legend: doorLegend, doors: [VAULT_DOOR] }),
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
    expect(legalMoves(game).map(key)).toEqual(['1,0'])
    expect(move(game, 3, 0)).toBe(game)

    const opened = approachAndOpenDoor(game, VAULT_DOOR)
    expect(legalMoves(opened).map(key)).toContain('2,0')
    expect(legalMoves(opened).map(key)).toContain('3,0')
  })
})

const wallLegend = {
  '.': { room: 'Port', walkable: true, opaque: false },
  ',': { room: 'Starboard', walkable: true, opaque: false },
  '#': { room: 'Void', walkable: false, opaque: false, void: true },
}

function wallMission(crewDamage?: number): TacticalMission {
  return {
    id: 'wall-test',
    objective: { kind: 'eliminate', label: 'Test walls' },
    visionRange: 8,
    crewDamage,
    map: defineTacticalMap({ rows: ['...,,,', '######'], legend: wallLegend }),
    crewSpawns: [{ x: 0, y: 0 }],
    units: [
      { id: 'ada', name: 'Ada', role: 'Marine', team: 'crew', x: 0, y: 0, hp: 8, ap: 12, accuracy: 70 },
      { id: 'wraith-1', name: 'Wraith', role: 'Raider', team: 'enemy', x: 5, y: 0, hp: 6, ap: 12, accuracy: 45 },
    ],
  }
}

describe('edge walls', () => {
  it('derives a hull around the ship and a bulkhead between the rooms', () => {
    const map = wallMission().map
    const bulkheads = map.walls.filter(wall => !wall.hull)
    expect(bulkheads.map(wall => doorKey(wall.a, wall.b))).toEqual([doorKey({ x: 2, y: 0 }, { x: 3, y: 0 })])
    // The void below and the map border are sealed by indestructible hull.
    expect(map.walls.some(wall => wall.hull && doorKey(wall.a, wall.b) === doorKey({ x: 1, y: 0 }, { x: 1, y: 1 }))).toBe(true)
    expect(map.walls.some(wall => wall.hull && doorKey(wall.a, wall.b) === doorKey({ x: 0, y: 0 }, { x: -1, y: 0 }))).toBe(true)
  })

  it('blocks sight, movement, and targeting like any other obstacle', () => {
    const game = createGame(wallMission())
    expect(currentVisibility(game).map(key)).toEqual(['0,0', '1,0', '2,0'])
    expect(legalMoves(game).map(key)).toEqual(['1,0', '2,0'])
    expect(legalTargets(game)).toEqual([])
  })

  it('shrugs off rifle fire behind its flat armour', () => {
    const game = { ...createGame(wallMission()), rngState: RNG_SURE_HIT }
    const wall = game.map.walls.find(candidate => !candidate.hull)!
    const hit = attackWall(game, wall, 'snap')
    expect(hit).not.toBe(game)
    expect(hit.wallHp[doorKey(wall.a, wall.b)]).toBe(WALL_HP)
    expect(hit.log[0]).toContain('hammers the bulkhead, but the plating holds')
    expect(unit(hit, 'ada').ap).toBe(12 - FIRE_MODES.snap.cost)
    expect(hit.rngState).not.toBe(RNG_SURE_HIT)
  })

  it('falls to enough fire from a weapon that beats the armour, opening sight and passage', () => {
    let game = { ...createGame(wallMission(9)), rngState: RNG_SURE_HIT }
    const wall = game.map.walls.find(candidate => !candidate.hull)!
    game = attackWall(game, wall, 'snap')
    game = attackWall({ ...game, rngState: RNG_SURE_HIT }, wall, 'snap')
    game = attackWall({ ...game, rngState: RNG_SURE_HIT }, wall, 'snap')
    expect(game.wallHp[doorKey(wall.a, wall.b)]).toBe(0)
    expect(game.log[0]).toContain('breaches the bulkhead')
    expect(currentVisibility(game).map(key)).toContain('5,0')
    const refreshed = { ...game, units: game.units.map(u => u.id === 'ada' ? { ...u, ap: 12 } : u) }
    expect(legalMoves(refreshed).map(key)).toContain('3,0')
    expect(legalTargets(refreshed).map(u => u.id)).toContain('wraith-1')
  })

  it('lets the player shoot the hull, which never takes a scratch', () => {
    const game = { ...createGame(wallMission(9)), rngState: RNG_SURE_HIT }
    const hull = game.map.walls.find(candidate => candidate.hull && doorKey(candidate.a, candidate.b) === doorKey({ x: 1, y: 0 }, { x: 1, y: 1 }))!
    const shot = attackWall(game, hull, 'snap')
    expect(shot).not.toBe(game)
    expect(shot.log[0]).toContain('glances off the hull')
    expect(Object.keys(shot.wallHp)).not.toContain(doorKey(hull.a, hull.b))
    expect(currentVisibility(shot).map(key)).not.toContain('1,1')
  })
})
