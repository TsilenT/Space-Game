import type { GameState } from './game'
import { BOARDING_MISSION, type TacticalMission } from './map'

export type CampaignPhase = 'encounter' | 'mission' | 'debrief' | 'lost'
export type RecoveryChoice = 'crew' | 'hull' | 'bank'
export type CrewMissionStatus = 'ready' | 'wounded' | 'killed'

export interface CampaignCrew {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly hp: number
  readonly maxHp: number
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
  readonly jump: number
  readonly objective: string
  readonly salvageGained: number
  readonly hullDamage: number
  readonly crew: readonly CrewMissionResult[]
}

export interface CampaignState {
  readonly phase: CampaignPhase
  readonly jump: number
  readonly fuel: number
  readonly salvage: number
  readonly hull: number
  readonly maxHull: number
  readonly crew: readonly CampaignCrew[]
  readonly missionReport?: MissionReport
}

const BOARDING_REWARD = 4
const BOARDING_HULL_DAMAGE = 8
const REPAIR_COST = 2
const REPAIR_AMOUNT = 15
const CREW_RECOVERY_AMOUNT = 2

function campaignPhase(state: CampaignState, nextPhase: CampaignPhase): CampaignPhase {
  return state.fuel <= 0 || state.hull <= 0 ? 'lost' : nextPhase
}

function advance(state: CampaignState): CampaignState {
  const next = {
    ...state,
    jump: state.jump + 1,
    fuel: Math.max(0, state.fuel - 1),
    missionReport: undefined,
  }
  return { ...next, phase: campaignPhase(next, 'encounter') }
}

export function createCampaign(): CampaignState {
  return {
    phase: 'encounter',
    jump: 1,
    fuel: 4,
    salvage: 1,
    hull: 75,
    maxHull: 100,
    crew: BOARDING_MISSION.units
      .filter(unit => unit.team === 'crew')
      .map(unit => ({
        id: unit.id,
        name: unit.name,
        role: unit.role,
        hp: unit.hp,
        maxHp: unit.hp,
      })),
  }
}

export function beginBoarding(state: CampaignState): CampaignState {
  if (state.phase !== 'encounter') return state
  return { ...state, phase: 'mission', missionReport: undefined }
}

export function boardingMissionFor(state: CampaignState): TacticalMission {
  const crewById = new Map(state.crew.map(crew => [crew.id, crew]))
  return {
    ...BOARDING_MISSION,
    units: BOARDING_MISSION.units.flatMap(unit => {
      if (unit.team === 'enemy') return [{ ...unit }]
      const crew = crewById.get(unit.id)
      return crew && crew.hp > 0 ? [{ ...unit, hp: crew.hp, maxHp: crew.maxHp }] : []
    }),
  }
}

function missionCrew(state: CampaignState, completedMission: GameState): CampaignCrew[] {
  return state.crew.map(crew => {
    const unit = completedMission.units.find(candidate => candidate.team === 'crew' && candidate.id === crew.id)
    if (!unit || crew.hp <= 0) return crew
    return { ...crew, hp: Math.max(0, Math.min(crew.maxHp, unit.hp)) }
  })
}

function missionReport(
  state: CampaignState,
  completedMission: GameState,
  crew: readonly CampaignCrew[],
): MissionReport {
  const victory = completedMission.status === 'victory'
  return {
    outcome: victory ? 'victory' : 'defeat',
    jump: state.jump,
    objective: completedMission.objective,
    salvageGained: victory ? BOARDING_REWARD : 0,
    hullDamage: victory ? BOARDING_HULL_DAMAGE : 0,
    crew: crew.map(member => {
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
    }),
  }
}

export function resolveBoarding(state: CampaignState, completedMission: GameState): CampaignState {
  if (state.phase !== 'mission' || completedMission.status === 'playing') return state

  const crew = missionCrew(state, completedMission)
  const report = missionReport(state, completedMission, crew)
  if (completedMission.status === 'defeat') {
    return { ...state, phase: 'lost', crew, missionReport: report }
  }

  const victory = {
    ...state,
    salvage: state.salvage + BOARDING_REWARD,
    hull: Math.max(0, state.hull - BOARDING_HULL_DAMAGE),
    crew,
    missionReport: report,
  }
  return { ...victory, phase: campaignPhase(victory, 'debrief') }
}

export function jumpAway(state: CampaignState): CampaignState {
  if (state.phase !== 'encounter') return state
  return advance(state)
}

export function scavengeEncounter(state: CampaignState): CampaignState {
  if (state.phase !== 'encounter') return state
  const scavenged = {
    ...state,
    salvage: state.salvage + 1,
    hull: Math.max(0, state.hull - 3),
  }
  return advance(scavenged)
}

export function repairShip(state: CampaignState): CampaignState {
  if (state.phase !== 'encounter' || state.salvage < REPAIR_COST || state.hull >= state.maxHull) return state
  return {
    ...state,
    salvage: state.salvage - REPAIR_COST,
    hull: Math.min(state.maxHull, state.hull + REPAIR_AMOUNT),
  }
}

export function chooseRecovery(state: CampaignState, choice: RecoveryChoice): CampaignState {
  if (state.phase !== 'debrief') return state
  if (choice === 'bank') return advance(state)
  if (state.salvage < REPAIR_COST) return state

  if (choice === 'crew') {
    if (!state.crew.some(crew => crew.hp > 0 && crew.hp < crew.maxHp)) return state
    return advance({
      ...state,
      salvage: state.salvage - REPAIR_COST,
      crew: state.crew.map(crew => crew.hp > 0
        ? { ...crew, hp: Math.min(crew.maxHp, crew.hp + CREW_RECOVERY_AMOUNT) }
        : crew),
    })
  }

  if (state.hull >= state.maxHull) return state

  return advance({
    ...state,
    salvage: state.salvage - REPAIR_COST,
    hull: Math.min(state.maxHull, state.hull + REPAIR_AMOUNT),
  })
}
