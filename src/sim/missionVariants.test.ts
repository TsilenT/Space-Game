import { describe, expect, it } from 'vitest'
import { attack, createGame, enemyTurn, move, type GameState } from './game'
import {
  BOARDING_MISSION,
  CIVILIAN_RESCUE_MISSION,
  DISTRESS_TRAP_MISSION,
  MAP_SCALE,
  PIRATE_RESCUE_MISSION,
  TACTICAL_MISSIONS,
  isWalkable,
  key,
  type TacticalMission,
} from './map'

function withoutEnemies(mission: TacticalMission): TacticalMission {
  return { ...mission, units: mission.units.filter(unit => unit.team === 'crew') }
}

describe('authored tactical mission definitions', () => {
  it('provides four scenarios across three distinct tripled 36x24 maps', () => {
    expect(TACTICAL_MISSIONS).toEqual([
      BOARDING_MISSION,
      PIRATE_RESCUE_MISSION,
      CIVILIAN_RESCUE_MISSION,
      DISTRESS_TRAP_MISSION,
    ])
    expect(new Set(TACTICAL_MISSIONS.map(mission => mission.id)).size).toBe(4)
    expect(new Set(TACTICAL_MISSIONS.map(mission => mission.map))).toHaveProperty('size', 3)
    for (const mission of TACTICAL_MISSIONS) {
      expect(mission.map).toMatchObject({ width: 36, height: 24 })
      expect(mission.crewSpawns).toHaveLength(6)
    }
  })

  it('places units, crew spawns, and rescue targets on valid nonoverlapping cells', () => {
    for (const mission of TACTICAL_MISSIONS) {
      const unitKeys = mission.units.map(key)
      const crewSpawnKeys = mission.crewSpawns.map(key)
      const enemyKeys = new Set(mission.units.filter(unit => unit.team === 'enemy').map(key))

      expect(new Set(unitKeys).size).toBe(unitKeys.length)
      expect(new Set(crewSpawnKeys).size).toBe(crewSpawnKeys.length)
      expect(mission.units.every(unit => isWalkable(mission.map, unit))).toBe(true)
      expect(mission.crewSpawns.every(spawn => isWalkable(mission.map, spawn))).toBe(true)
      expect(crewSpawnKeys.every(spawn => !enemyKeys.has(spawn))).toBe(true)

      const crew = mission.units.filter(unit => unit.team === 'crew')
      expect(crew.map(key)).toEqual(crewSpawnKeys.slice(0, crew.length))

      if (mission.objective.kind === 'rescue') {
        const targetKey = key(mission.objective.target)
        expect(isWalkable(mission.map, mission.objective.target)).toBe(true)
        expect(unitKeys).not.toContain(targetKey)
        expect(crewSpawnKeys).not.toContain(targetKey)
      }
    }
  })

  it('keeps every walkable tile connected to the deployment area', () => {
    for (const mission of TACTICAL_MISSIONS) {
      const queue = [mission.crewSpawns[0]]
      const reached = new Set([key(mission.crewSpawns[0])])
      while (queue.length > 0) {
        const point = queue.shift()!
        for (const neighbor of [
          { x: point.x + 1, y: point.y },
          { x: point.x - 1, y: point.y },
          { x: point.x, y: point.y + 1 },
          { x: point.x, y: point.y - 1 },
        ]) {
          const neighborKey = key(neighbor)
          if (reached.has(neighborKey) || !isWalkable(mission.map, neighbor)) continue
          reached.add(neighborKey)
          queue.push(neighbor)
        }
      }
      expect(reached.size).toBe(mission.map.cells.filter(cell => cell.walkable).length)
    }
  })

  it('defines every door as an edge between two walkable cells, never occupying a cell', () => {
    const doorCounts = TACTICAL_MISSIONS.map(mission => mission.map.doors.length)
    expect(doorCounts).toEqual([2, 2, 1, 2])
    for (const mission of TACTICAL_MISSIONS) {
      for (const door of mission.map.doors) {
        expect(Math.abs(door.a.x - door.b.x) + Math.abs(door.a.y - door.b.y)).toBe(1)
        expect(isWalkable(mission.map, door.a)).toBe(true)
        expect(isWalkable(mission.map, door.b)).toBe(true)
        // The threshold behind the door sits at the centre of its authored block.
        expect({ x: door.b.x % MAP_SCALE, y: door.b.y % MAP_SCALE }).toEqual({ x: 1, y: 1 })
      }
    }
  })

  it('defines the courier rescue deadline and every combat scenario as elimination', () => {
    expect(BOARDING_MISSION.objective.kind).toBe('eliminate')
    expect(PIRATE_RESCUE_MISSION.objective.kind).toBe('eliminate')
    expect(DISTRESS_TRAP_MISSION.objective.kind).toBe('eliminate')
    expect(CIVILIAN_RESCUE_MISSION.objective).toMatchObject({
      kind: 'rescue',
      target: { x: 31, y: 4 },
      deadlineTurn: 8,
    })
  })
})

describe('mission objective resolution', () => {
  it('preserves elimination victory and records why the mission ended', () => {
    const base = createGame()
    const result = enemyTurn({
      ...base,
      phase: 'enemy',
      units: base.units.map(unit => unit.team === 'enemy' ? { ...unit, hp: 0 } : unit),
    })

    expect(result.status).toBe('victory')
    expect(result.resolution).toEqual({ result: 'victory', reason: 'hostiles-eliminated' })
  })

  it('does not auto-win a rescue mission that has no enemies', () => {
    const game = createGame(withoutEnemies(CIVILIAN_RESCUE_MISSION))
    expect(game.status).toBe('playing')
    expect(game.resolution).toBeUndefined()
  })

  it('wins immediately when living crew reaches the survivor marker', () => {
    const base = createGame(CIVILIAN_RESCUE_MISSION)
    const staged: GameState = {
      ...base,
      units: base.units.map(unit => unit.id === 'ada' ? { ...unit, x: 30, y: 4, ap: 4 } : unit),
      selectedId: 'ada',
    }
    const result = move(staged, 31, 4)

    expect(result.status).toBe('victory')
    expect(result.resolution).toEqual({ result: 'victory', reason: 'survivor-rescued' })
  })

  it('does not let a dead crew member on the marker complete a rescue', () => {
    const objective = CIVILIAN_RESCUE_MISSION.objective
    if (objective.kind !== 'rescue') throw new Error('Expected rescue objective.')
    const mission: TacticalMission = {
      ...withoutEnemies(CIVILIAN_RESCUE_MISSION),
      units: CIVILIAN_RESCUE_MISSION.units
        .filter(unit => unit.team === 'crew')
        .map(unit => unit.id === 'ada' ? { ...unit, ...objective.target, hp: 0 } : unit),
    }
    const game = createGame(mission)

    expect(game.status).toBe('playing')
  })

  it('gives the player all of turn eight before the deadline can expire', () => {
    const mission = withoutEnemies(CIVILIAN_RESCUE_MISSION)
    const base = createGame(mission)
    const staged: GameState = {
      ...base,
      turn: 8,
      units: base.units.map(unit => unit.id === 'ada' ? { ...unit, x: 30, y: 4, ap: 4 } : unit),
      selectedId: 'ada',
    }
    const result = move(staged, 31, 4)

    expect(result.status).toBe('victory')
    expect(result.resolution?.reason).toBe('survivor-rescued')
  })

  it('expires only after enemy phase eight and kills all deployed crew', () => {
    const mission = withoutEnemies(CIVILIAN_RESCUE_MISSION)
    const turnSeven = enemyTurn({ ...createGame(mission), turn: 7, phase: 'enemy' })
    expect(turnSeven).toMatchObject({ status: 'playing', phase: 'player', turn: 8 })

    const expired = enemyTurn({ ...turnSeven, phase: 'enemy' })
    expect(expired.status).toBe('defeat')
    expect(expired.resolution).toEqual({ result: 'defeat', reason: 'deadline-expired' })
    expect(expired.units.filter(unit => unit.team === 'crew').every(unit => unit.hp === 0)).toBe(true)
  })

  it('uses a mission crew-damage override without changing the default weapon', () => {
    const upgraded = createGame({ ...BOARDING_MISSION, crewDamage: 5 })
    const staged = {
      ...upgraded,
      selectedId: 'ada',
      units: upgraded.units.map(unit => unit.id === 'ada'
        ? { ...unit, x: 17, y: 7 }
        : unit.id === 'wraith-1'
          ? { ...unit, hp: 6 }
          : unit),
    }
    const upgradedResult = attack(staged, 'wraith-1')
    expect(upgradedResult.units.find(unit => unit.id === 'wraith-1')?.hp).toBe(1)

    const standard = createGame()
    const standardStaged = {
      ...standard,
      selectedId: 'ada',
      units: standard.units.map(unit => unit.id === 'ada' ? { ...unit, x: 17, y: 7 } : unit),
    }
    const standardResult = attack(standardStaged, 'wraith-1')
    expect(standardResult.units.find(unit => unit.id === 'wraith-1')?.hp).toBe(3)
  })
})
