import { describe, expect, it } from 'vitest'
import {
  beginBoarding,
  boardingMissionFor,
  chooseRecovery,
  createCampaign,
  jumpAway,
  repairShip,
  resolveBoarding,
  scavengeEncounter,
  type CampaignState,
} from './campaign'
import { createGame, type GameState, type Status } from './game'
import { BOARDING_MISSION } from './map'

function completedMission(
  state: CampaignState,
  status: Exclude<Status, 'playing'>,
  health: Readonly<Record<string, number>> = {},
): GameState {
  const game = createGame(boardingMissionFor(state))
  return {
    ...game,
    status,
    units: game.units.map(unit => health[unit.id] === undefined ? unit : { ...unit, hp: health[unit.id] }),
  }
}

function victoriousCampaign(
  health: Readonly<Record<string, number>> = {},
  changes: Partial<CampaignState> = {},
): CampaignState {
  const mission = beginBoarding({ ...createCampaign(), ...changes })
  return resolveBoarding(mission, completedMission(mission, 'victory', health))
}

describe('campaign setup and boarding missions', () => {
  it('starts the demo at jump one with the boarding crew and pressured resources', () => {
    const campaign = createCampaign()

    expect(campaign).toMatchObject({
      phase: 'encounter',
      jump: 1,
      fuel: 4,
      salvage: 1,
      hull: 75,
      maxHull: 100,
    })
    expect(campaign.crew.map(crew => [crew.id, crew.hp, crew.maxHp])).toEqual([
      ['ada', 8, 8],
      ['milo', 8, 8],
      ['imani', 8, 8],
      ['soren', 8, 8],
    ])
  })

  it('begins boarding only from an encounter', () => {
    const encounter = createCampaign()
    const mission = beginBoarding(encounter)

    expect(mission.phase).toBe('mission')
    expect(beginBoarding(mission)).toBe(mission)
    const debrief = victoriousCampaign()
    expect(beginBoarding(debrief)).toBe(debrief)
  })

  it('builds a fresh mission with persistent living crew and reset enemies', () => {
    const campaign: CampaignState = {
      ...createCampaign(),
      crew: createCampaign().crew.map(crew => crew.id === 'ada'
        ? { ...crew, hp: 3 }
        : crew.id === 'milo'
          ? { ...crew, hp: 0 }
          : crew),
    }
    const mission = boardingMissionFor(campaign)

    expect(mission).not.toBe(BOARDING_MISSION)
    expect(mission.units.filter(unit => unit.team === 'crew').map(unit => [unit.id, unit.hp, unit.maxHp])).toEqual([
      ['ada', 3, 8],
      ['imani', 8, 8],
      ['soren', 8, 8],
    ])
    expect(mission.units.filter(unit => unit.team === 'enemy')).toEqual(
      BOARDING_MISSION.units.filter(unit => unit.team === 'enemy'),
    )
  })
})

describe('boarding resolution', () => {
  it('persists injuries and death, awards salvage, damages the hull, and creates a UI report', () => {
    const result = victoriousCampaign({ ada: 5, milo: 0 })

    expect(result).toMatchObject({ phase: 'debrief', salvage: 5, hull: 67, fuel: 4 })
    expect(result.crew.find(crew => crew.id === 'ada')?.hp).toBe(5)
    expect(result.crew.find(crew => crew.id === 'milo')?.hp).toBe(0)
    expect(result.missionReport).toMatchObject({
      outcome: 'victory',
      jump: 1,
      objective: BOARDING_MISSION.objective,
      salvageGained: 4,
      hullDamage: 8,
    })
    expect(result.missionReport?.crew).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'ada', hpBefore: 8, hpAfter: 5, status: 'wounded' }),
      expect.objectContaining({ id: 'milo', hpBefore: 8, hpAfter: 0, status: 'killed' }),
      expect.objectContaining({ id: 'imani', hpBefore: 8, hpAfter: 8, status: 'ready' }),
    ]))
  })

  it('cannot resolve an active mission or claim the victory reward twice', () => {
    const mission = beginBoarding(createCampaign())
    const playing = createGame(boardingMissionFor(mission))
    expect(resolveBoarding(mission, playing)).toBe(mission)

    const completed = completedMission(mission, 'victory')
    const debrief = resolveBoarding(mission, completed)
    expect(resolveBoarding(debrief, completed)).toBe(debrief)
    expect(debrief.salvage).toBe(5)
  })

  it('loses immediately on mission defeat while retaining the casualty report', () => {
    const mission = beginBoarding(createCampaign())
    const result = resolveBoarding(mission, completedMission(mission, 'defeat', { ada: 0, milo: 2 }))

    expect(result.phase).toBe('lost')
    expect(result.salvage).toBe(1)
    expect(result.hull).toBe(75)
    expect(result.crew.find(crew => crew.id === 'ada')?.hp).toBe(0)
    expect(result.crew.find(crew => crew.id === 'milo')?.hp).toBe(2)
    expect(result.missionReport).toMatchObject({ outcome: 'defeat', salvageGained: 0, hullDamage: 0 })
  })

  it('loses if boarding damage destroys the hull even after tactical victory', () => {
    const result = victoriousCampaign({}, { hull: 8 })

    expect(result).toMatchObject({ phase: 'lost', hull: 0, salvage: 5 })
    expect(result.missionReport?.outcome).toBe('victory')
  })
})

describe('debrief recovery', () => {
  it('spends salvage to heal living crew, never revives the dead, then advances', () => {
    const debrief = victoriousCampaign({ ada: 5, milo: 0 })
    const next = chooseRecovery(debrief, 'crew')

    expect(next).toMatchObject({ phase: 'encounter', jump: 2, fuel: 3, salvage: 3 })
    expect(next.crew.find(crew => crew.id === 'ada')?.hp).toBe(7)
    expect(next.crew.find(crew => crew.id === 'milo')?.hp).toBe(0)
    expect(next.crew.find(crew => crew.id === 'imani')?.hp).toBe(8)
    expect(next.missionReport).toBeUndefined()
  })

  it('spends salvage to repair hull without exceeding maximum, then advances', () => {
    const debrief = victoriousCampaign()
    const next = chooseRecovery(debrief, 'hull')
    expect(next).toMatchObject({ phase: 'encounter', jump: 2, fuel: 3, salvage: 3, hull: 82 })

    const nearlyFull = { ...debrief, hull: 95 }
    expect(chooseRecovery(nearlyFull, 'hull').hull).toBe(100)
  })

  it('can bank salvage and advance without changing ship or crew', () => {
    const debrief = victoriousCampaign({ ada: 6 })
    const next = chooseRecovery(debrief, 'bank')

    expect(next).toMatchObject({ phase: 'encounter', jump: 2, fuel: 3, salvage: 5, hull: 67 })
    expect(next.crew).toBe(debrief.crew)
  })

  it('rejects recovery outside debrief and paid recovery without enough salvage', () => {
    const encounter = createCampaign()
    expect(chooseRecovery(encounter, 'bank')).toBe(encounter)

    const poorDebrief = { ...victoriousCampaign(), salvage: 1 }
    expect(chooseRecovery(poorDebrief, 'crew')).toBe(poorDebrief)
    expect(chooseRecovery(poorDebrief, 'hull')).toBe(poorDebrief)
  })

  it('rejects recovery that has nothing to repair', () => {
    const debrief = victoriousCampaign()
    const healthy = { ...debrief, crew: debrief.crew.map(crew => ({ ...crew, hp: crew.maxHp })) }
    expect(chooseRecovery(healthy, 'crew')).toBe(healthy)
    const intact = { ...debrief, hull: debrief.maxHull }
    expect(chooseRecovery(intact, 'hull')).toBe(intact)
  })
})

describe('encounter choices and campaign loss', () => {
  it('jumps away by consuming fuel and advancing to the next encounter', () => {
    const campaign = createCampaign()
    const next = jumpAway(campaign)

    expect(next).toMatchObject({ phase: 'encounter', jump: 2, fuel: 3, salvage: 1, hull: 75 })
    const mission = { ...campaign, phase: 'mission' as const }
    expect(jumpAway(mission)).toBe(mission)
  })

  it('scavenges for salvage at a hull and fuel cost, then advances', () => {
    const next = scavengeEncounter(createCampaign())
    expect(next).toMatchObject({ phase: 'encounter', jump: 2, fuel: 3, salvage: 2, hull: 72 })
  })

  it('repairs in place when affordable and damaged, with resource and phase guards', () => {
    const campaign = { ...createCampaign(), salvage: 3 }
    const repaired = repairShip(campaign)
    expect(repaired).toMatchObject({ phase: 'encounter', jump: 1, fuel: 4, salvage: 1, hull: 90 })

    const poor = createCampaign()
    expect(repairShip(poor)).toBe(poor)
    const full = { ...campaign, hull: 100 }
    expect(repairShip(full)).toBe(full)
    const mission = { ...campaign, phase: 'mission' as const }
    expect(repairShip(mission)).toBe(mission)
  })

  it('loses when an encounter consumes the final fuel and rejects later transitions', () => {
    const finalJump = { ...createCampaign(), fuel: 1 }
    const lost = jumpAway(finalJump)

    expect(lost).toMatchObject({ phase: 'lost', jump: 2, fuel: 0 })
    expect(jumpAway(lost)).toBe(lost)
    expect(scavengeEncounter(lost)).toBe(lost)
    expect(beginBoarding(lost)).toBe(lost)
  })

  it('loses when scavenging destroys the hull while still applying the encounter outcome', () => {
    const fragile = { ...createCampaign(), hull: 3 }
    const lost = scavengeEncounter(fragile)

    expect(lost).toMatchObject({ phase: 'lost', jump: 2, fuel: 3, salvage: 2, hull: 0 })
  })

  it('loses when a debrief choice consumes the final fuel', () => {
    const debrief = { ...victoriousCampaign(), fuel: 1 }
    const lost = chooseRecovery(debrief, 'bank')

    expect(lost).toMatchObject({ phase: 'lost', jump: 2, fuel: 0 })
  })
})
