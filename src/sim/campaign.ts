import type { GameState } from './game'
import {
  BOARDING_MISSION,
  CIVILIAN_RESCUE_MISSION,
  DISTRESS_TRAP_MISSION,
  PIRATE_RESCUE_MISSION,
  type TacticalMission,
} from './map'

export type CampaignPhase = 'route' | 'encounter' | 'mission' | 'debrief' | 'lost'
export type DestinationKind = 'distress' | 'starbase' | 'abandoned-moon'
export type RecoveryChoice = 'crew' | 'hull' | 'bank'
export type CrewMissionStatus = 'ready' | 'wounded' | 'killed'
export type MoonOutcome = 'salvage' | 'survivor' | 'fuel' | 'amoeba'
export type DistressOutcome = 'survivor' | 'pirates' | 'rescue' | 'trap'
export type MissionKind = 'pirate-rescue' | 'timed-rescue' | 'distress-trap'

export interface CampaignCrew {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly hp: number
  readonly maxHp: number
}

export interface CampaignRecruit extends CampaignCrew {
  readonly source: 'survivor' | 'mercenary'
}

export interface DestinationOffer {
  readonly id: string
  readonly kind: DestinationKind
  readonly name: string
  readonly eventSeed: number
}

interface EncounterBase {
  readonly id: string
  readonly offerId: string
  readonly name: string
  readonly resolved: boolean
}

export interface StarbaseEncounter extends EncounterBase {
  readonly kind: 'starbase'
  readonly outcome: 'market'
  readonly fuelStock: number
  readonly fuelPrice: number
  readonly weaponAvailable: boolean
  readonly weaponPrice: number
  readonly mercenary?: CampaignRecruit
  readonly mercenaryPrice: number
}

export interface MoonEncounter extends EncounterBase {
  readonly kind: 'abandoned-moon'
  readonly outcome: MoonOutcome
  readonly salvage: number
  readonly fuel: number
  readonly hullDamage: number
  readonly recruit?: CampaignRecruit
}

export interface DistressEncounter extends EncounterBase {
  readonly kind: 'distress'
  readonly outcome: DistressOutcome
  readonly recruit?: CampaignRecruit
}

export type CampaignEncounter = StarbaseEncounter | MoonEncounter | DistressEncounter

export interface MissionRewards {
  readonly salvage: number
  readonly credits: number
  readonly fuel: number
}

export interface MissionContext {
  readonly kind: MissionKind
  readonly templateId: string
  readonly rewards: MissionRewards
  readonly successHullDamage: number
  readonly timeoutHullDamage: number
  readonly recruit?: CampaignRecruit
}

export interface CrewMissionResult {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly hpBefore: number
  readonly hpAfter: number
  readonly maxHp: number
  readonly status: CrewMissionStatus
}

export interface MissionReport {
  readonly outcome: 'victory' | 'defeat'
  readonly reason?: string
  readonly jump: number
  readonly objective: string
  readonly salvageGained: number
  readonly creditsGained: number
  readonly fuelGained: number
  readonly hullDamage: number
  readonly crew: readonly CrewMissionResult[]
}

export interface CampaignState {
  readonly phase: CampaignPhase
  readonly seed: number
  readonly rngState: number
  readonly jump: number
  readonly fuel: number
  readonly maxFuel: number
  readonly credits: number
  readonly salvage: number
  readonly hull: number
  readonly maxHull: number
  readonly weaponDamage: number
  readonly crew: readonly CampaignCrew[]
  readonly offers: readonly DestinationOffer[]
  readonly encounter?: CampaignEncounter
  readonly activeMission?: MissionContext
  readonly missionReport?: MissionReport
}

export const DEFAULT_CAMPAIGN_SEED = 37

export const CAMPAIGN_TUNING = {
  startingFuel: 4,
  maxFuel: 6,
  startingCredits: 10,
  startingSalvage: 1,
  startingHull: 75,
  maxHull: 100,
  baseWeaponDamage: 3,
  rosterCap: 6,
  deployedCrewCap: 6,
  fuelPrice: 2,
  salvageSalePrice: 2,
  weaponPrice: 6,
  mercenaryPrice: 8,
  repairCost: 2,
  repairAmount: 15,
  crewRecoveryAmount: 2,
  moonSalvage: 3,
  moonFuel: 2,
  amoebaHullDamage: 12,
  rescueTimeoutHullDamage: 20,
} as const

const DESTINATIONS: readonly DestinationKind[] = ['distress', 'starbase', 'abandoned-moon']
const DESTINATION_NAMES: Readonly<Record<DestinationKind, readonly string[]>> = {
  distress: ['Broken Chorus', 'Emergency Beacon K-9', 'Last Light Signal'],
  starbase: ['Port Meridian', 'Gannet Exchange', 'Saint Orison Depot'],
  'abandoned-moon': ['Orpheus Minor', 'Ash Moon D-14', 'Silent Caldera'],
}
const RECRUIT_NAMES = ['Nia Calder', 'Tomas Reed', 'Yara Quill', 'Dev Malik', 'Rin Navarro', 'Bo Sato'] as const
const SURVIVOR_ROLES = ['Pilot', 'Mechanic', 'Field medic', 'Surveyor'] as const
const MERCENARY_ROLES = ['Mercenary', 'Security contractor', 'Bounty hunter'] as const

function nextSeed(seed: number): number {
  return (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
}

function unitRoll(seed: number): number {
  return nextSeed(seed) / 0x1_0000_0000
}

function indexFrom(seed: number, length: number): number {
  return Math.floor(unitRoll(seed) * length)
}

function seededRecruit(seed: number, id: string, source: CampaignRecruit['source']): CampaignRecruit {
  const nameSeed = nextSeed(seed)
  const roleSeed = nextSeed(nameSeed)
  const roles = source === 'mercenary' ? MERCENARY_ROLES : SURVIVOR_ROLES
  return {
    id,
    name: RECRUIT_NAMES[indexFrom(nameSeed, RECRUIT_NAMES.length)],
    role: roles[indexFrom(roleSeed, roles.length)],
    hp: 8,
    maxHp: 8,
    source,
  }
}

function routeOffers(jump: number, inputSeed: number): { offers: DestinationOffer[]; rngState: number } {
  let rngState = inputSeed
  const offers = DESTINATIONS.map(kind => {
    rngState = nextSeed(rngState)
    const eventSeed = rngState
    const names = DESTINATION_NAMES[kind]
    return {
      id: `jump-${jump}-${kind}-${eventSeed.toString(16)}`,
      kind,
      name: names[indexFrom(eventSeed, names.length)],
      eventSeed,
    }
  })

  for (let index = offers.length - 1; index > 0; index--) {
    rngState = nextSeed(rngState)
    const swap = Math.floor(unitRoll(rngState) * (index + 1))
    ;[offers[index], offers[swap]] = [offers[swap], offers[index]]
  }
  return { offers, rngState }
}

function starbaseEncounter(offer: DestinationOffer): StarbaseEncounter {
  let seed = offer.eventSeed
  const stocked = unitRoll(seed) < 0.9
  seed = nextSeed(seed)
  const fuelStock = stocked ? 2 + indexFrom(seed, 3) : 0
  seed = nextSeed(seed)
  const weaponAvailable = unitRoll(seed) < 0.55
  seed = nextSeed(seed)
  const mercenaryAvailable = unitRoll(seed) < 0.4
  seed = nextSeed(seed)
  return {
    id: `event-${offer.id}`,
    offerId: offer.id,
    kind: 'starbase',
    name: offer.name,
    outcome: 'market',
    resolved: false,
    fuelStock,
    fuelPrice: CAMPAIGN_TUNING.fuelPrice,
    weaponAvailable,
    weaponPrice: CAMPAIGN_TUNING.weaponPrice,
    mercenary: mercenaryAvailable
      ? seededRecruit(seed, `merc-${offer.id}`, 'mercenary')
      : undefined,
    mercenaryPrice: CAMPAIGN_TUNING.mercenaryPrice,
  }
}

function moonEncounter(offer: DestinationOffer): MoonEncounter {
  const roll = unitRoll(offer.eventSeed)
  const outcome: MoonOutcome = roll < 0.65
    ? 'salvage'
    : roll < 0.82
      ? 'survivor'
      : roll < 0.95
        ? 'amoeba'
        : 'fuel'
  return {
    id: `event-${offer.id}`,
    offerId: offer.id,
    kind: 'abandoned-moon',
    name: offer.name,
    outcome,
    resolved: false,
    salvage: outcome === 'salvage' ? CAMPAIGN_TUNING.moonSalvage : 0,
    fuel: outcome === 'fuel' ? CAMPAIGN_TUNING.moonFuel : 0,
    hullDamage: outcome === 'amoeba' ? CAMPAIGN_TUNING.amoebaHullDamage : 0,
    recruit: outcome === 'survivor'
      ? seededRecruit(offer.eventSeed, `survivor-${offer.id}`, 'survivor')
      : undefined,
  }
}

function distressEncounter(offer: DestinationOffer): DistressEncounter {
  const roll = unitRoll(offer.eventSeed)
  const outcome: DistressOutcome = roll < 0.25
    ? 'survivor'
    : roll < 0.55
      ? 'pirates'
      : roll < 0.8
        ? 'rescue'
        : 'trap'
  const recruit = outcome === 'survivor' || outcome === 'pirates' || outcome === 'rescue'
    ? seededRecruit(offer.eventSeed, `survivor-${offer.id}`, 'survivor')
    : undefined
  return {
    id: `event-${offer.id}`,
    offerId: offer.id,
    kind: 'distress',
    name: offer.name,
    outcome,
    resolved: false,
    recruit,
  }
}

function encounterFor(offer: DestinationOffer): CampaignEncounter {
  if (offer.kind === 'starbase') return starbaseEncounter(offer)
  if (offer.kind === 'abandoned-moon') return moonEncounter(offer)
  return distressEncounter(offer)
}

function hasLivingCrew(state: CampaignState): boolean {
  return state.crew.some(crew => crew.hp > 0)
}

function addRecruit(crew: readonly CampaignCrew[], recruit: CampaignRecruit | undefined): readonly CampaignCrew[] {
  const livingCrew = crew.filter(member => member.hp > 0).length
  if (!recruit || livingCrew >= CAMPAIGN_TUNING.rosterCap || crew.some(member => member.id === recruit.id)) return crew
  return [...crew, recruit]
}

function withNextRoute(state: CampaignState): CampaignState {
  const base = {
    ...state,
    jump: state.jump + 1,
    encounter: undefined,
    activeMission: undefined,
    missionReport: undefined,
  }
  if (base.hull <= 0 || base.fuel <= 0 || !hasLivingCrew(base)) {
    return { ...base, phase: 'lost', offers: [] }
  }
  const route = routeOffers(base.jump, base.rngState)
  return { ...base, phase: 'route', ...route }
}

export function createCampaign(seed = DEFAULT_CAMPAIGN_SEED): CampaignState {
  const normalizedSeed = seed >>> 0
  const route = routeOffers(1, normalizedSeed)
  return {
    phase: 'route',
    seed: normalizedSeed,
    rngState: route.rngState,
    jump: 1,
    fuel: CAMPAIGN_TUNING.startingFuel,
    maxFuel: CAMPAIGN_TUNING.maxFuel,
    credits: CAMPAIGN_TUNING.startingCredits,
    salvage: CAMPAIGN_TUNING.startingSalvage,
    hull: CAMPAIGN_TUNING.startingHull,
    maxHull: CAMPAIGN_TUNING.maxHull,
    weaponDamage: CAMPAIGN_TUNING.baseWeaponDamage,
    crew: BOARDING_MISSION.units
      .filter(unit => unit.team === 'crew')
      .map(unit => ({
        id: unit.id,
        name: unit.name,
        role: unit.role,
        hp: unit.hp,
        maxHp: unit.maxHp ?? unit.hp,
      })),
    offers: route.offers,
  }
}

export function chooseDestination(state: CampaignState, offerId: string): CampaignState {
  if (state.phase !== 'route' || state.fuel <= 0) return state
  const offer = state.offers.find(candidate => candidate.id === offerId)
  if (!offer) return state
  return {
    ...state,
    phase: 'encounter',
    fuel: state.fuel - 1,
    offers: [],
    encounter: encounterFor(offer),
    activeMission: undefined,
    missionReport: undefined,
  }
}

export function declineEncounter(state: CampaignState): CampaignState {
  if (state.phase !== 'encounter' || !state.encounter || state.encounter.resolved) return state
  return withNextRoute(state)
}

export function resolveEncounter(state: CampaignState): CampaignState {
  const encounter = state.encounter
  if (state.phase !== 'encounter' || !encounter || encounter.resolved || encounter.kind === 'starbase') return state
  if (encounter.kind === 'distress' && encounter.outcome !== 'survivor') return state

  const resolvedEncounter = { ...encounter, resolved: true }
  if (encounter.kind === 'abandoned-moon') {
    const resolved = {
      ...state,
      encounter: resolvedEncounter,
      salvage: state.salvage + encounter.salvage,
      fuel: Math.min(state.maxFuel, state.fuel + encounter.fuel),
      hull: Math.max(0, state.hull - encounter.hullDamage),
      crew: addRecruit(state.crew, encounter.recruit),
    }
    return resolved.hull <= 0 ? { ...resolved, phase: 'lost' } : resolved
  }

  return {
    ...state,
    encounter: resolvedEncounter,
    crew: addRecruit(state.crew, encounter.recruit),
  }
}

export function continueEncounter(state: CampaignState): CampaignState {
  if (state.phase !== 'encounter' || !state.encounter?.resolved) return state
  return withNextRoute(state)
}

export function leaveStarbase(state: CampaignState): CampaignState {
  if (state.phase !== 'encounter' || state.encounter?.kind !== 'starbase') return state
  return withNextRoute(state)
}

export function buyFuel(state: CampaignState, amount = 1): CampaignState {
  const encounter = state.encounter
  if (state.phase !== 'encounter' || encounter?.kind !== 'starbase' || !Number.isInteger(amount) || amount <= 0) return state
  const quantity = Math.min(
    amount,
    encounter.fuelStock,
    state.maxFuel - state.fuel,
    Math.floor(state.credits / encounter.fuelPrice),
  )
  if (quantity <= 0) return state
  return {
    ...state,
    fuel: state.fuel + quantity,
    credits: state.credits - quantity * encounter.fuelPrice,
    encounter: { ...encounter, fuelStock: encounter.fuelStock - quantity },
  }
}

export function sellSalvage(state: CampaignState, amount = 1): CampaignState {
  if (state.phase !== 'encounter' || state.encounter?.kind !== 'starbase' || !Number.isInteger(amount) || amount <= 0 || state.salvage < amount) return state
  return {
    ...state,
    salvage: state.salvage - amount,
    credits: state.credits + amount * CAMPAIGN_TUNING.salvageSalePrice,
  }
}

export function buyWeapon(state: CampaignState): CampaignState {
  const encounter = state.encounter
  if (
    state.phase !== 'encounter'
    || encounter?.kind !== 'starbase'
    || !encounter.weaponAvailable
    || state.credits < encounter.weaponPrice
    || state.weaponDamage > CAMPAIGN_TUNING.baseWeaponDamage
  ) return state
  return {
    ...state,
    credits: state.credits - encounter.weaponPrice,
    weaponDamage: state.weaponDamage + 1,
    encounter: { ...encounter, weaponAvailable: false },
  }
}

export function hireMercenary(state: CampaignState): CampaignState {
  const encounter = state.encounter
  if (
    state.phase !== 'encounter'
    || encounter?.kind !== 'starbase'
    || !encounter.mercenary
    || state.credits < encounter.mercenaryPrice
    || state.crew.filter(crew => crew.hp > 0).length >= CAMPAIGN_TUNING.rosterCap
  ) return state
  return {
    ...state,
    credits: state.credits - encounter.mercenaryPrice,
    crew: addRecruit(state.crew, encounter.mercenary),
    encounter: { ...encounter, mercenary: undefined },
  }
}

function missionContext(encounter: DistressEncounter): MissionContext | undefined {
  if (encounter.outcome === 'pirates') {
    return {
      kind: 'pirate-rescue',
      templateId: PIRATE_RESCUE_MISSION.id,
      rewards: { salvage: 2, credits: 4, fuel: 0 },
      successHullDamage: 4,
      timeoutHullDamage: 0,
      recruit: encounter.recruit,
    }
  }
  if (encounter.outcome === 'rescue') {
    return {
      kind: 'timed-rescue',
      templateId: CIVILIAN_RESCUE_MISSION.id,
      rewards: { salvage: 1, credits: 3, fuel: 1 },
      successHullDamage: 2,
      timeoutHullDamage: CAMPAIGN_TUNING.rescueTimeoutHullDamage,
      recruit: encounter.recruit,
    }
  }
  if (encounter.outcome === 'trap') {
    return {
      kind: 'distress-trap',
      templateId: DISTRESS_TRAP_MISSION.id,
      rewards: { salvage: 3, credits: 2, fuel: 0 },
      successHullDamage: 8,
      timeoutHullDamage: 0,
    }
  }
  return undefined
}

export function beginMission(state: CampaignState): CampaignState {
  if (state.phase !== 'encounter' || state.encounter?.kind !== 'distress' || state.encounter.resolved) return state
  const activeMission = missionContext(state.encounter)
  if (!activeMission) return state
  return { ...state, phase: 'mission', activeMission, missionReport: undefined }
}

function templateFor(context: MissionContext): TacticalMission {
  if (context.kind === 'timed-rescue') return CIVILIAN_RESCUE_MISSION
  if (context.kind === 'distress-trap') return DISTRESS_TRAP_MISSION
  return PIRATE_RESCUE_MISSION
}

function populateMission(state: CampaignState, template: TacticalMission): TacticalMission {
  const livingCrew = state.crew.filter(crew => crew.hp > 0).slice(0, CAMPAIGN_TUNING.deployedCrewCap)
  const enemies = template.units.filter(unit => unit.team === 'enemy').map(unit => ({ ...unit }))
  const crew = livingCrew.slice(0, template.crewSpawns.length).map((member, index) => ({
    ...template.crewSpawns[index],
    id: member.id,
    name: member.name,
    role: member.role,
    team: 'crew' as const,
    hp: member.hp,
    maxHp: member.maxHp,
    ap: 4,
  }))
  return { ...template, crewDamage: state.weaponDamage, units: [...crew, ...enemies] }
}

export function missionFor(state: CampaignState): TacticalMission {
  if (!state.activeMission) throw new Error('Campaign has no active tactical mission.')
  return populateMission(state, templateFor(state.activeMission))
}

function missionCrew(state: CampaignState, completedMission: GameState): CampaignCrew[] {
  return state.crew.map(crew => {
    const unit = completedMission.units.find(candidate => candidate.team === 'crew' && candidate.id === crew.id)
    if (!unit || crew.hp <= 0) return crew
    return { ...crew, hp: Math.max(0, Math.min(crew.maxHp, unit.hp)) }
  })
}

function crewReport(
  state: CampaignState,
  crew: readonly CampaignCrew[],
): CrewMissionResult[] {
  return crew.map(member => {
    const before = state.crew.find(candidate => candidate.id === member.id)!
    return {
      id: member.id,
      name: member.name,
      role: member.role,
      hpBefore: before.hp,
      hpAfter: member.hp,
      maxHp: member.maxHp,
      status: member.hp <= 0 ? 'killed' : member.hp < member.maxHp ? 'wounded' : 'ready',
    }
  })
}

export function resolveMission(state: CampaignState, completedMission: GameState): CampaignState {
  const context = state.activeMission
  if (
    state.phase !== 'mission'
    || !context
    || completedMission.status === 'playing'
    || completedMission.mission.id !== context.templateId
  ) return state

  const victory = completedMission.status === 'victory'
  const timedOut = !victory && completedMission.resolution?.reason === 'deadline-expired'
  const crewAfterMission = missionCrew(state, completedMission)
  const hullDamage = victory ? context.successHullDamage : timedOut ? context.timeoutHullDamage : 0
  const rewards = victory ? context.rewards : { salvage: 0, credits: 0, fuel: 0 }
  const report: MissionReport = {
    outcome: victory ? 'victory' : 'defeat',
    reason: completedMission.resolution?.reason,
    jump: state.jump,
    objective: completedMission.objective.label,
    salvageGained: rewards.salvage,
    creditsGained: rewards.credits,
    fuelGained: rewards.fuel,
    hullDamage,
    crew: crewReport(state, crewAfterMission),
  }
  const resolved: CampaignState = {
    ...state,
    crew: victory ? addRecruit(crewAfterMission, context.recruit) : crewAfterMission,
    salvage: state.salvage + rewards.salvage,
    credits: state.credits + rewards.credits,
    fuel: Math.min(state.maxFuel, state.fuel + rewards.fuel),
    hull: Math.max(0, state.hull - hullDamage),
    missionReport: report,
  }
  if (!victory || resolved.hull <= 0 || !hasLivingCrew(resolved)) return { ...resolved, phase: 'lost' }
  return { ...resolved, phase: 'debrief' }
}

export function chooseRecovery(state: CampaignState, choice: RecoveryChoice): CampaignState {
  if (state.phase !== 'debrief') return state
  if (choice === 'bank') return withNextRoute(state)
  if (state.salvage < CAMPAIGN_TUNING.repairCost) return state

  if (choice === 'crew') {
    if (!state.crew.some(crew => crew.hp > 0 && crew.hp < crew.maxHp)) return state
    return withNextRoute({
      ...state,
      salvage: state.salvage - CAMPAIGN_TUNING.repairCost,
      crew: state.crew.map(crew => crew.hp > 0
        ? { ...crew, hp: Math.min(crew.maxHp, crew.hp + CAMPAIGN_TUNING.crewRecoveryAmount) }
        : crew),
    })
  }

  if (state.hull >= state.maxHull) return state
  return withNextRoute({
    ...state,
    salvage: state.salvage - CAMPAIGN_TUNING.repairCost,
    hull: Math.min(state.maxHull, state.hull + CAMPAIGN_TUNING.repairAmount),
  })
}

// Compatibility helpers for the original single-contact UI while it is migrated.
export function beginBoarding(state: CampaignState): CampaignState {
  return beginMission(state)
}

export function boardingMissionFor(state: CampaignState): TacticalMission {
  return state.activeMission ? missionFor(state) : populateMission(state, BOARDING_MISSION)
}

export function resolveBoarding(state: CampaignState, completedMission: GameState): CampaignState {
  return resolveMission(state, completedMission)
}

export function jumpAway(state: CampaignState): CampaignState {
  if (state.phase !== 'encounter') return state
  return state.encounter?.resolved ? continueEncounter(state) : state.encounter?.kind === 'starbase' ? leaveStarbase(state) : declineEncounter(state)
}

export function scavengeEncounter(state: CampaignState): CampaignState {
  const resolved = resolveEncounter(state)
  return resolved !== state && resolved.phase === 'encounter' ? continueEncounter(resolved) : resolved
}

export function repairShip(state: CampaignState): CampaignState {
  if (state.phase !== 'encounter' || state.salvage < CAMPAIGN_TUNING.repairCost || state.hull >= state.maxHull) return state
  return {
    ...state,
    salvage: state.salvage - CAMPAIGN_TUNING.repairCost,
    hull: Math.min(state.maxHull, state.hull + CAMPAIGN_TUNING.repairAmount),
  }
}
