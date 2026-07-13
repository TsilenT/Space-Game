import { describe, expect, it } from 'vitest'
import {
  CAMPAIGN_TUNING,
  beginMission,
  buyFuel,
  buyWeapon,
  chooseDestination,
  chooseRecovery,
  continueEncounter,
  createCampaign,
  declineEncounter,
  hireMercenary,
  leaveStarbase,
  missionFor,
  resolveEncounter,
  resolveMission,
  sellSalvage,
  type CampaignEncounter,
  type CampaignState,
  type DestinationKind,
  type DistressEncounter,
  type MoonOutcome,
  type StarbaseEncounter,
} from './campaign'
import { createGame, type GameState, type MissionResolution } from './game'
import { BOARDING_MISSION, CIVILIAN_RESCUE_MISSION, DISTRESS_TRAP_MISSION, PIRATE_RESCUE_MISSION } from './map'

function arrive(seed: number, kind: DestinationKind, changes: Partial<CampaignState> = {}): CampaignState {
  const route = { ...createCampaign(seed), ...changes }
  const offer = route.offers.find(candidate => candidate.kind === kind)!
  return chooseDestination(route, offer.id)
}

function completedMission(
  state: CampaignState,
  result: 'victory' | 'defeat',
  health: Readonly<Record<string, number>> = {},
  reason?: MissionResolution['reason'],
): GameState {
  const game = createGame(missionFor(state))
  const resolution: MissionResolution = result === 'victory'
    ? {
        result,
        reason: game.objective.kind === 'rescue' ? 'survivor-rescued' : 'hostiles-eliminated',
      }
    : { result, reason: reason === 'deadline-expired' ? reason : 'crew-lost' }
  return {
    ...game,
    status: result,
    resolution,
    units: game.units.map(unit => health[unit.id] === undefined ? unit : { ...unit, hp: health[unit.id] }),
  }
}

function encounter<T extends CampaignEncounter>(state: CampaignState, kind: T['kind']): T {
  expect(state.encounter?.kind).toBe(kind)
  return state.encounter as T
}

describe('seeded route generation', () => {
  it('is deterministic and always offers exactly one of each destination', () => {
    const first = createCampaign(42)
    const repeated = createCampaign(42)
    const different = createCampaign(43)

    expect(first).toEqual(repeated)
    expect(first.offers).not.toEqual(different.offers)
    expect(first).toMatchObject({
      phase: 'route',
      jump: 1,
      fuel: 4,
      maxFuel: 6,
      credits: 10,
      salvage: 1,
      hull: 75,
      weaponDamage: 3,
    })
    expect(first.offers.map(offer => offer.kind).sort()).toEqual(['abandoned-moon', 'distress', 'starbase'])
    expect(new Set(first.offers.map(offer => offer.id))).toHaveLength(3)
  })

  it('uses the showcase seed for a stocked market, moon salvage, and timed rescue', () => {
    expect(encounter<StarbaseEncounter>(arrive(37, 'starbase'), 'starbase')).toMatchObject({
      fuelStock: 2,
      weaponAvailable: true,
    })
    expect(encounter<StarbaseEncounter>(arrive(37, 'starbase'), 'starbase').mercenary).toBeDefined()
    expect(encounter(arrive(37, 'abandoned-moon'), 'abandoned-moon')).toMatchObject({ outcome: 'salvage' })
    expect(encounter(arrive(37, 'distress'), 'distress')).toMatchObject({ outcome: 'rescue' })
  })

  it('spends fuel exactly once and persists the rolled encounter', () => {
    const route = createCampaign(37)
    const offer = route.offers.find(candidate => candidate.kind === 'distress')!
    const arrived = chooseDestination(route, offer.id)

    expect(arrived).toMatchObject({ phase: 'encounter', fuel: 3, offers: [] })
    expect(arrived.encounter).toEqual(encounter(arrive(37, 'distress'), 'distress'))
    expect(chooseDestination(arrived, offer.id)).toBe(arrived)
    expect(chooseDestination(route, 'missing-offer')).toBe(route)
  })
})

describe('abandoned moon and direct distress outcomes', () => {
  const moonSeeds: Readonly<Record<MoonOutcome, number>> = {
    salvage: 9,
    survivor: 1,
    amoeba: 5,
    fuel: 8,
  }

  it('reaches every weighted moon outcome from stable seeds', () => {
    for (const [outcome, seed] of Object.entries(moonSeeds)) {
      expect(encounter(arrive(seed, 'abandoned-moon'), 'abandoned-moon')).toMatchObject({ outcome })
    }
  })

  it('applies a direct outcome once, then continues to a fresh route without another fuel charge', () => {
    const arrived = arrive(moonSeeds.salvage, 'abandoned-moon')
    const resolved = resolveEncounter(arrived)

    expect(resolved).toMatchObject({ phase: 'encounter', fuel: 3, salvage: 4 })
    expect(resolved.encounter).toMatchObject({ resolved: true })
    expect(resolveEncounter(resolved)).toBe(resolved)

    const next = continueEncounter(resolved)
    expect(next).toMatchObject({ phase: 'route', jump: 2, fuel: 3, salvage: 4 })
    expect(next.offers).toHaveLength(3)
    expect(continueEncounter(next)).toBe(next)
  })

  it('recruits deterministic survivors without exceeding six living crew', () => {
    const first = resolveEncounter(arrive(moonSeeds.survivor, 'abandoned-moon'))
    const repeated = resolveEncounter(arrive(moonSeeds.survivor, 'abandoned-moon'))
    expect(first.crew).toHaveLength(5)
    expect(first.crew[4]).toEqual(repeated.crew[4])
    expect(first.crew[4].id).toContain('survivor-jump-1-abandoned-moon')

    const base = arrive(moonSeeds.survivor, 'abandoned-moon')
    const full = {
      ...base,
      crew: [
        ...base.crew,
        { id: 'reserve-a', name: 'Reserve A', role: 'Pilot', hp: 8, maxHp: 8 },
        { id: 'reserve-b', name: 'Reserve B', role: 'Pilot', hp: 8, maxHp: 8 },
      ],
    }
    expect(resolveEncounter(full).crew).toHaveLength(CAMPAIGN_TUNING.rosterCap)

    const memorialAndFiveLiving = {
      ...base,
      crew: full.crew.map(crew => crew.id === 'ada' ? { ...crew, hp: 0 } : crew),
    }
    const replacement = resolveEncounter(memorialAndFiveLiving)
    expect(replacement.crew).toHaveLength(CAMPAIGN_TUNING.rosterCap + 1)
    expect(replacement.crew.filter(crew => crew.hp > 0)).toHaveLength(CAMPAIGN_TUNING.rosterCap)
    expect(replacement.crew.at(-1)?.id).toContain('survivor-jump-1-abandoned-moon')
  })

  it('lets a rare fuel cache save a final-fuel arrival', () => {
    const arrived = arrive(moonSeeds.fuel, 'abandoned-moon', { fuel: 1 })
    expect(arrived.fuel).toBe(0)
    const resolved = resolveEncounter(arrived)
    expect(resolved.fuel).toBe(2)
    expect(continueEncounter(resolved)).toMatchObject({ phase: 'route', fuel: 2, jump: 2 })
  })

  it('strands a final-fuel crew after an outcome that does not restore fuel', () => {
    const arrived = arrive(moonSeeds.salvage, 'abandoned-moon', { fuel: 1 })
    const resolved = resolveEncounter(arrived)
    expect(resolved).toMatchObject({ phase: 'encounter', fuel: 0, salvage: 4 })
    expect(continueEncounter(resolved)).toMatchObject({ phase: 'lost', fuel: 0, jump: 2 })
  })

  it('applies amoeba damage before checking hull loss', () => {
    const arrived = arrive(moonSeeds.amoeba, 'abandoned-moon', { hull: CAMPAIGN_TUNING.amoebaHullDamage })
    const lost = resolveEncounter(arrived)
    expect(lost).toMatchObject({ phase: 'lost', hull: 0 })
    expect(lost.encounter).toMatchObject({ outcome: 'amoeba', resolved: true })
  })

  it('can take or decline a survivor found at a direct distress call', () => {
    const arrived = arrive(8, 'distress')
    const rescued = resolveEncounter(arrived)
    expect(encounter<DistressEncounter>(arrived, 'distress').outcome).toBe('survivor')
    expect(rescued.crew).toHaveLength(5)

    const declined = declineEncounter(arrived)
    expect(declined).toMatchObject({ phase: 'route', jump: 2, fuel: 3 })
    expect(declined.crew).toHaveLength(4)
    expect(declineEncounter(rescued)).toBe(rescued)
  })
})

describe('starbase market and final-fuel arrival', () => {
  it('buys stocked fuel within stock, credit, and tank limits', () => {
    const arrived = arrive(1, 'starbase')
    const station = encounter<StarbaseEncounter>(arrived, 'starbase')
    expect(station.fuelStock).toBeGreaterThan(0)

    const bought = buyFuel(arrived, 99)
    const quantity = Math.min(station.fuelStock, arrived.maxFuel - arrived.fuel, Math.floor(arrived.credits / station.fuelPrice))
    expect(bought.fuel).toBe(arrived.fuel + quantity)
    expect(bought.credits).toBe(arrived.credits - quantity * station.fuelPrice)
    expect((bought.encounter as StarbaseEncounter).fuelStock).toBe(station.fuelStock - quantity)
    expect(buyFuel(bought, 0)).toBe(bought)
    expect(buyFuel(bought, -1)).toBe(bought)
  })

  it('lets a stocked starbase save the ship after spending its final fuel', () => {
    const arrived = arrive(1, 'starbase', { fuel: 1 })
    expect(arrived.fuel).toBe(0)
    const refueled = buyFuel(arrived)
    expect(refueled).toMatchObject({ phase: 'encounter', fuel: 1, credits: 8 })
    expect(leaveStarbase(refueled)).toMatchObject({ phase: 'route', jump: 2, fuel: 1 })
  })

  it('cannot refuel at the rare dry station and is stranded if it leaves at zero fuel', () => {
    const arrived = arrive(6, 'starbase', { fuel: 1 })
    expect(encounter<StarbaseEncounter>(arrived, 'starbase').fuelStock).toBe(0)
    expect(buyFuel(arrived)).toBe(arrived)
    expect(leaveStarbase(arrived)).toMatchObject({ phase: 'lost', fuel: 0 })
  })

  it('sells salvage, buys one mediocre weapon, and carries its damage into missions', () => {
    let state = arrive(1, 'starbase')
    expect(encounter<StarbaseEncounter>(state, 'starbase').weaponAvailable).toBe(true)
    state = sellSalvage(state)
    expect(state).toMatchObject({ salvage: 0, credits: 12 })
    expect(sellSalvage(state)).toBe(state)

    state = buyWeapon(state)
    expect(state).toMatchObject({ credits: 6, weaponDamage: 4 })
    expect(buyWeapon(state)).toBe(state)

    const tacticalState = beginMission({ ...arrive(1, 'distress'), weaponDamage: state.weaponDamage })
    expect(missionFor(tacticalState).crewDamage).toBe(4)
  })

  it('hires the seeded mercenary once and respects credits and roster capacity', () => {
    const arrived = arrive(1, 'starbase')
    const station = encounter<StarbaseEncounter>(arrived, 'starbase')
    expect(station.mercenary).toBeDefined()
    const hired = hireMercenary(arrived)
    expect(hired).toMatchObject({ credits: 2 })
    expect(hired.crew).toHaveLength(5)
    expect(hired.crew[4]).toMatchObject({ id: station.mercenary!.id, role: station.mercenary!.role })
    expect(hireMercenary(hired)).toBe(hired)

    const poor = { ...arrived, credits: 0 }
    expect(hireMercenary(poor)).toBe(poor)
    const full = {
      ...arrived,
      crew: [
        ...arrived.crew,
        { id: 'reserve-a', name: 'Reserve A', role: 'Pilot', hp: 8, maxHp: 8 },
        { id: 'reserve-b', name: 'Reserve B', role: 'Pilot', hp: 8, maxHp: 8 },
      ],
    }
    expect(hireMercenary(full)).toBe(full)

    const openLivingSlot = {
      ...full,
      crew: full.crew.map(crew => crew.id === 'ada' ? { ...crew, hp: 0 } : crew),
    }
    const replacement = hireMercenary(openLivingSlot)
    expect(replacement.crew).toHaveLength(CAMPAIGN_TUNING.rosterCap + 1)
    expect(replacement.crew.filter(crew => crew.hp > 0)).toHaveLength(CAMPAIGN_TUNING.rosterCap)
  })
})

describe('contextual tactical missions', () => {
  const missionSeeds = {
    pirates: 1,
    rescue: 3,
    trap: 6,
  } as const

  it('maps all three tactical distress outcomes to their authored templates', () => {
    const expected = {
      pirates: PIRATE_RESCUE_MISSION.id,
      rescue: CIVILIAN_RESCUE_MISSION.id,
      trap: DISTRESS_TRAP_MISSION.id,
    } as const
    for (const [outcome, seed] of Object.entries(missionSeeds)) {
      const arrived = arrive(seed, 'distress')
      expect(encounter<DistressEncounter>(arrived, 'distress').outcome).toBe(outcome)
      const mission = beginMission(arrived)
      expect(mission).toMatchObject({ phase: 'mission', activeMission: { templateId: expected[outcome as keyof typeof expected] } })
      expect(missionFor(mission).id).toBe(expected[outcome as keyof typeof expected])
    }
  })

  it('deploys every living roster member up to the six-person cap on valid authored spawns', () => {
    const arrived = arrive(missionSeeds.pirates, 'distress')
    const expanded = {
      ...arrived,
      crew: [
        ...arrived.crew.map(crew => crew.id === 'ada' ? { ...crew, hp: 0 } : crew),
        { id: 'reserve-a', name: 'Reserve A', role: 'Pilot', hp: 7, maxHp: 8 },
        { id: 'reserve-b', name: 'Reserve B', role: 'Mercenary', hp: 8, maxHp: 8 },
      ],
    }
    const mission = missionFor(beginMission(expanded))
    const deployed = mission.units.filter(unit => unit.team === 'crew')
    expect(deployed.map(unit => unit.id)).toEqual(['milo', 'imani', 'soren', 'reserve-a', 'reserve-b'])
    expect(deployed.find(unit => unit.id === 'reserve-a')).toMatchObject({ hp: 7, maxHp: 8 })
    expect(new Set(deployed.map(unit => `${unit.x},${unit.y}`)).size).toBe(deployed.length)
  })

  it('persists casualties, pays contextual pirate rewards, recruits the survivor, and resolves once', () => {
    const mission = beginMission(arrive(missionSeeds.pirates, 'distress'))
    const completed = completedMission(mission, 'victory', { ada: 5, milo: 0 })
    const debrief = resolveMission(mission, completed)

    expect(debrief).toMatchObject({
      phase: 'debrief',
      fuel: 3,
      salvage: 3,
      credits: 14,
      hull: 71,
    })
    expect(debrief.crew).toHaveLength(5)
    expect(debrief.crew.find(crew => crew.id === 'ada')?.hp).toBe(5)
    expect(debrief.crew.find(crew => crew.id === 'milo')?.hp).toBe(0)
    expect(debrief.missionReport).toMatchObject({
      outcome: 'victory',
      objective: PIRATE_RESCUE_MISSION.objective.label,
      salvageGained: 2,
      creditsGained: 4,
      fuelGained: 0,
      hullDamage: 4,
    })
    expect(resolveMission(debrief, completed)).toBe(debrief)
  })

  it('returns recovery to a new route without charging fuel and preserves wounds and death', () => {
    const mission = beginMission(arrive(missionSeeds.pirates, 'distress'))
    const debrief = resolveMission(mission, completedMission(mission, 'victory', { ada: 5, milo: 0 }))
    const next = chooseRecovery(debrief, 'crew')

    expect(next).toMatchObject({ phase: 'route', jump: 2, fuel: 3, salvage: 1 })
    expect(next.crew.find(crew => crew.id === 'ada')?.hp).toBe(7)
    expect(next.crew.find(crew => crew.id === 'milo')?.hp).toBe(0)
    expect(next.missionReport).toBeUndefined()
  })

  it('applies timed-rescue detonation damage and persists the tactical crew loss', () => {
    const mission = beginMission(arrive(missionSeeds.rescue, 'distress'))
    const game = completedMission(
      mission,
      'defeat',
      Object.fromEntries(missionFor(mission).units.filter(unit => unit.team === 'crew').map(unit => [unit.id, 0])),
      'deadline-expired',
    )
    const lost = resolveMission(mission, game)

    expect(lost).toMatchObject({ phase: 'lost', hull: 55 })
    expect(lost.crew.every(crew => crew.hp === 0)).toBe(true)
    expect(lost.missionReport).toMatchObject({
      outcome: 'defeat',
      reason: 'deadline-expired',
      hullDamage: 20,
      salvageGained: 0,
      creditsGained: 0,
    })
  })

  it('rejects active games, the wrong scenario, and mission transitions in the wrong phase', () => {
    const arrived = arrive(missionSeeds.rescue, 'distress')
    const mission = beginMission(arrived)
    const active = createGame(missionFor(mission))
    expect(resolveMission(mission, active)).toBe(mission)
    expect(resolveMission(mission, createGame(BOARDING_MISSION))).toBe(mission)
    expect(beginMission(mission)).toBe(mission)
    const directSurvivor = arrive(8, 'distress')
    expect(beginMission(directSurvivor)).toBe(directSurvivor)
    expect(() => missionFor(createCampaign())).toThrow('no active tactical mission')
  })
})
