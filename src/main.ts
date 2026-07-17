import Phaser from 'phaser'
import './style.css'
import './responsive.css'
import './campaign.css'
import {
  CAMPAIGN_TUNING,
  beginMission,
  boardingMissionFor,
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
  type CampaignCrew,
  type CampaignEncounter,
  type CampaignState,
  type DestinationOffer,
  type DistressEncounter,
  type MoonEncounter,
  type StarbaseEncounter,
  type SystemKind,
} from './sim/campaign'
import { revealedSystemIds, systemById, type StarSystem } from './sim/galaxy'
import { FIRE_MODES, attack, createGame, currentVisibility, type FireModeId, type GameState, hitChance, legalMoves, legalTargets, move, selectUnit, type ShotResult } from './sim/game'
import { cellAt, isWalkable, key } from './sim/map'
import { TurnController } from './turnController'

const CELL = 58, OX = 52, OY = 78
const ROOM_COLORS: Record<string, number> = {
  'Boarding Bay': 0x132b38,
  Medbay: 0x173437,
  Reactor: 0x302538,
  Bridge: 0x192c45,
  Weapons: 0x302c27,
  Dock: 0x132b38,
  Commons: 0x173437,
  Engineering: 0x302538,
  Airlock: 0x132b38,
  Crossway: 0x302538,
  Cargo: 0x302c27,
  Barracks: 0x192c45,
}

const seedText = new URLSearchParams(window.location.search).get('seed')
const requestedSeed = seedText === null ? undefined : Number(seedText)
const runSeed = requestedSeed !== undefined && Number.isInteger(requestedSeed) && requestedSeed >= 0 ? requestedSeed : undefined
const freshRunSeed = () => window.crypto.getRandomValues(new Uint32Array(1))[0]
const createRun = () => createCampaign(runSeed ?? freshRunSeed())

let campaign = createRun()
let state = createGame(boardingMissionFor(campaign))
let controller: TurnController
let fireMode: FireModeId = 'snap'
let lastPlayedShots: readonly ShotResult[] = []
let animating = false
let sceneReady = false
let focusNextScreen = true
let focusNextTactical = false
let focusNextAction: string | undefined
let transitionLocked = false

const tacticalContainer = document.querySelector<HTMLElement>('#phaser-game')!
const actionBar = document.querySelector<HTMLElement>('.actions')!
const endTurnButton = document.querySelector<HTMLButtonElement>('#end-turn')!
const restartButton = document.querySelector<HTMLButtonElement>('#restart')!
const hud = document.querySelector<HTMLElement>('#hud')!
const consoleElement = document.querySelector<HTMLElement>('.console')!
const gameBar = document.querySelector<HTMLElement>('#game-bar')!
const startGameButton = document.querySelector<HTMLButtonElement>('#start-game')!
const exitGameButton = document.querySelector<HTMLButtonElement>('#exit-game')!
tacticalContainer.tabIndex = -1
const campaignScreen = document.createElement('section')
campaignScreen.id = 'campaign-screen'
campaignScreen.hidden = true
campaignScreen.setAttribute('aria-label', 'Campaign command screen')
consoleElement.insertBefore(campaignScreen, tacticalContainer)

function setGameMode(active: boolean) {
  document.body.classList.toggle('in-game', active)
  gameBar.hidden = !active
  window.scrollTo(0, 0)
  if (active) focusNextScreen = true
  renderApp()
  if (sceneReady) scene.scale.refresh()
}

startGameButton.onclick = () => setGameMode(true)
exitGameButton.onclick = () => setGameMode(false)

function terminalTitle(current: GameState): string {
  if (current.resolution?.reason === 'survivor-rescued') return 'SURVIVOR SECURED'
  if (current.resolution?.reason === 'deadline-expired') return 'SHIP DETONATED'
  if (current.status === 'victory') return 'SHIP SECURED'
  return 'BOARDING TEAM LOST'
}

function terminalSubtitle(current: GameState): string {
  if (current.resolution?.reason === 'survivor-rescued') return 'The rescue target is aboard. Carry the damage home.'
  if (current.resolution?.reason === 'deadline-expired') return 'The blast took the deployed crew and struck your hull.'
  return current.status === 'victory' ? 'Continue to carry the damage home.' : 'Continue to the campaign report.'
}

class TacticalScene extends Phaser.Scene {
  create() {
    sceneReady = true
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.click(pointer.x, pointer.y))
    renderApp()
  }

  click(px: number, py: number) {
    if (animating || transitionLocked || campaign.phase !== 'mission' || state.phase !== 'player' || state.status !== 'playing') return
    const x = Math.floor((px - OX) / CELL), y = Math.floor((py - OY) / CELL)
    if (!isWalkable(state.map, { x, y })) return
    const visible = new Set(currentVisibility(state).map(key))
    const unit = state.units.find(candidate => candidate.hp > 0 && candidate.x === x && candidate.y === y && (candidate.team === 'crew' || visible.has(key(candidate))))
    if (unit?.team === 'crew') state = selectUnit(state, unit.id)
    else if (unit?.team === 'enemy') state = attack(state, unit.id, fireMode)
    else state = move(state, x, y)
    controller.replace(state)
  }

  draw() {
    if (!sceneReady || campaign.phase !== 'mission') return
    this.children.removeAll()
    const pendingShots = state.lastShots.length > 0 && state.lastShots !== lastPlayedShots ? state.lastShots : []
    const dyingIds = new Set(pendingShots.filter(shot => shot.killed && shot.hitUnitId).map(shot => shot.hitUnitId!))
    const graphics = this.add.graphics()
    const visible = new Set(currentVisibility(state).map(key))
    const explored = new Set(state.explored)
    const openDoors = new Set(state.openDoors)
    const legalTargetIds = new Set(legalTargets(state, fireMode).map(unit => unit.id))
    graphics.fillStyle(0x07101c, 1).fillRect(0, 0, 800, 600)
    for (let y = 0; y < state.map.height; y++) for (let x = 0; x < state.map.width; x++) {
      const point = { x, y }
      const pointKey = key(point)
      const cell = cellAt(state.map, point)!
      const isExplored = explored.has(pointKey)
      const isVisible = visible.has(pointKey)
      const isClosedDoor = cell.door && !openDoors.has(pointKey)
      const left = OX + x * CELL
      const top = OY + y * CELL

      if (!isExplored) {
        graphics.fillStyle(0x02070c, 1).fillRect(left, top, CELL - 2, CELL - 2)
        graphics.lineStyle(1, 0x132330, .28).strokeRect(left, top, CELL - 2, CELL - 2)
        continue
      }

      graphics.fillStyle(!cell.walkable ? 0x03070c : isClosedDoor ? 0x4a3319 : (ROOM_COLORS[cell.room] ?? 0x132b38), 1).fillRect(left, top, CELL - 2, CELL - 2)
      graphics.lineStyle(1, isVisible ? 0x426277 : 0x263946, isVisible ? .45 : .25).strokeRect(left, top, CELL - 2, CELL - 2)
      if (!isVisible) graphics.fillStyle(0x02070c, .58).fillRect(left, top, CELL - 2, CELL - 2)
      if (cell.door) graphics.fillStyle(isClosedDoor ? 0xf1bd5b : 0x63e3d6, isVisible ? .9 : .4).fillRect(left + CELL / 2 - 4, top + 6, 8, CELL - 14)
      if (cell.cover) {
        graphics.fillStyle(0x8a7550, isVisible ? .85 : .4).fillRoundedRect(left + 9, top + 9, CELL - 20, CELL - 20, 4)
        graphics.lineStyle(2, 0x5a4b33, isVisible ? .9 : .45).strokeRoundedRect(left + 9, top + 9, CELL - 20, CELL - 20, 4)
      }
    }
    for (const point of legalMoves(state)) graphics.fillStyle(0x55d9d0, .24).fillRect(OX + point.x * CELL + 4, OY + point.y * CELL + 4, CELL - 10, CELL - 10)
    for (const system of state.map.systems.filter(marker => explored.has(key(marker)))) {
      const isVisible = visible.has(key(system))
      graphics.fillStyle(0xf1bd5b, isVisible ? .55 : .2).fillRoundedRect(OX + system.x * CELL + 12, OY + system.y * CELL + 12, 32, 32, 5)
      this.add.text(OX + system.x * CELL + 15, OY + system.y * CELL + 22, system.system, { fontFamily: 'monospace', fontSize: '10px', color: isVisible ? '#08121c' : '#7d704e' })
    }
    if (state.objective.kind === 'rescue') {
      const target = state.objective.target
      const cx = OX + target.x * CELL + 28, cy = OY + target.y * CELL + 28
      graphics.fillStyle(0xf1bd5b, .18).fillCircle(cx, cy, 23)
      graphics.lineStyle(3, 0xf1bd5b, 1).strokeCircle(cx, cy, 20)
      this.add.text(cx, cy, 'SOS', { fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold', color: '#f1bd5b' }).setOrigin(.5)
    }
    for (const unit of state.units.filter(unit => (unit.hp > 0 || dyingIds.has(unit.id)) && (unit.team === 'crew' || visible.has(key(unit))))) {
      const cx = OX + unit.x * CELL + 28, cy = OY + unit.y * CELL + 28
      if (unit.id === state.selectedId) graphics.lineStyle(3, 0xffffff, 1).strokeCircle(cx, cy, 22)
      if (legalTargetIds.has(unit.id)) graphics.lineStyle(3, 0xf1bd5b, 1).strokeCircle(cx, cy, 22)
      graphics.fillStyle(unit.team === 'crew' ? 0x5de0d2 : 0xff5c68, 1).fillCircle(cx, cy, 17)
      this.add.text(cx, cy, unit.name[0], { fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold', color: '#061019' }).setOrigin(.5)
      graphics.fillStyle(0x04070b, 1).fillRect(cx - 21, cy + 20, 42, 5)
      graphics.fillStyle(unit.team === 'crew' ? 0x5de0d2 : 0xff5c68, 1).fillRect(cx - 21, cy + 20, 42 * unit.hp / unit.maxHp, 5)
    }
    state.map.rooms.forEach(room => {
      if (!explored.has(key(room.label))) return
      const roomVisible = visible.has(key(room.label))
      this.add.text(OX + room.label.x * CELL, OY + room.label.y * CELL + (room.label.y ? 35 : 8), room.name.toUpperCase(), { fontFamily: 'monospace', fontSize: '11px', color: roomVisible ? '#91a9b8' : '#425866' })
    })
    const deadline = state.objective.kind === 'rescue' ? ` / ${String(state.objective.deadlineTurn).padStart(2, '0')}` : ''
    this.add.text(52, 28, `TURN ${String(state.turn).padStart(2, '0')}${deadline}  //  ${state.phase.toUpperCase()} PHASE`, { fontFamily: 'monospace', fontSize: '18px', color: state.phase === 'player' ? '#63e3d6' : '#ff6670' })
    if (state.status !== 'playing' && pendingShots.length === 0) {
      graphics.fillStyle(0x02060b, .86).fillRect(0, 0, 800, 600)
      this.add.text(400, 260, terminalTitle(state), { fontFamily: 'monospace', fontSize: '32px', fontStyle: 'bold', color: state.status === 'victory' ? '#63e3d6' : '#ff6670' }).setOrigin(.5)
      this.add.text(400, 305, terminalSubtitle(state), { fontFamily: 'monospace', fontSize: '15px', color: '#c7d6df' }).setOrigin(.5)
    }
    updateTacticalHud(state)

    if (pendingShots.length > 0) {
      lastPlayedShots = state.lastShots
      animating = true
      this.animateShots(pendingShots, () => {
        animating = false
        renderApp()
      })
    } else {
      lastPlayedShots = state.lastShots
    }
  }

  animateShots(shots: readonly ShotResult[], done: () => void) {
    const center = (point: { x: number; y: number }) => ({ x: OX + point.x * CELL + 28, y: OY + point.y * CELL + 28 })
    const playNext = (index: number) => {
      if (index >= shots.length) {
        done()
        return
      }
      const shot = shots[index]
      const from = center(shot.from)
      const to = center(shot.impact)
      const tracer = this.add.circle(from.x, from.y, 5, shot.team === 'crew' ? 0xd9fff7 : 0xffb0b6, 1)
      const flight = Math.max(90, Math.hypot(to.x - from.x, to.y - from.y) * 0.85)
      this.tweens.add({
        targets: tracer,
        x: to.x,
        y: to.y,
        duration: flight,
        ease: 'Linear',
        onComplete: () => {
          tracer.destroy()
          this.impactEffect(shot, to)
          this.time.delayedCall(shot.hitUnitId ? 280 : 150, () => playNext(index + 1))
        },
      })
    }
    playNext(0)
  }

  impactEffect(shot: ShotResult, at: { x: number; y: number }) {
    if (shot.hitUnitId) {
      const flash = this.add.circle(at.x, at.y, 12, 0xffffff, 0.95)
      this.tweens.add({ targets: flash, scale: shot.killed ? 2.6 : 1.8, alpha: 0, duration: shot.killed ? 380 : 240, onComplete: () => flash.destroy() })
      const text = this.add.text(at.x, at.y - 16, `-${shot.damage}`, { fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold', color: '#ff6670' }).setOrigin(.5)
      this.tweens.add({ targets: text, y: at.y - 44, alpha: 0, duration: 620, onComplete: () => text.destroy() })
      if (shot.killed) {
        const ring = this.add.circle(at.x, at.y, 16, 0x000000, 0).setStrokeStyle(3, 0xff5c68, 1)
        this.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 430, onComplete: () => ring.destroy() })
      }
    } else if (shot.struckObstacle) {
      const spark = this.add.circle(at.x, at.y, 7, 0xc9d2d8, 0.85)
      this.tweens.add({ targets: spark, scale: 1.7, alpha: 0, duration: 220, onComplete: () => spark.destroy() })
    }
  }
}

const scene = new TacticalScene('Tactical')
controller = new TurnController(state, next => {
  state = next
  renderApp()
})
new Phaser.Game({ type: Phaser.AUTO, parent: 'phaser-game', width: 800, height: 600, backgroundColor: '#07101c', scene, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH } })

function campaignStrip(current: CampaignState): string {
  const living = current.crew.filter(crew => crew.hp > 0).length
  return `<div class="campaign-strip"><span>JUMP <b>${String(current.jump).padStart(2, '0')}</b></span><span>FUEL <b>${current.fuel}/${current.maxFuel}</b></span><span>CREDITS <b>${current.credits}</b></span><span>SALVAGE <b>${current.salvage}</b></span><span>HULL <b>${current.hull}/${current.maxHull}</b></span><span>RIFLES <b>${current.weaponDamage} DMG</b></span><span>CREW <b>${living}/${current.crew.length}</b></span></div>`
}

function crewCondition(crew: CampaignCrew): { label: string; className: string } {
  if (crew.hp <= 0) return { label: 'KIA', className: 'killed' }
  if (crew.hp < crew.maxHp) return { label: `${crew.hp}/${crew.maxHp} HP · WOUNDED`, className: 'wounded' }
  return { label: `${crew.hp}/${crew.maxHp} HP · FIT`, className: '' }
}

function campaignRoster(crew: readonly CampaignCrew[]): string {
  return `<div class="campaign-roster">${crew.map(member => {
    const condition = crewCondition(member)
    return `<div class="campaign-crew ${condition.className}"><span><strong>${member.name}</strong><small>${member.role}</small></span><b>${condition.label}</b></div>`
  }).join('')}</div>`
}

const ROUTE_COPY: Readonly<Record<SystemKind, { signal: string; heading: string; body: string; likely: string; danger: string }>> = {
  distress: {
    signal: 'CREW // HIGH RISK',
    heading: 'Answer the call',
    body: 'Often a survivor. Sometimes pirates are already there. Sometimes they sent it.',
    likely: 'Likely: crew',
    danger: 'Danger: high',
  },
  starbase: {
    signal: 'TRADE // RELIABLE',
    heading: 'Dock and resupply',
    body: 'Fuel is usually available. Weapons, salvage rates, and hired help vary.',
    likely: 'Likely: fuel',
    danger: 'Danger: low',
  },
  'abandoned-moon': {
    signal: 'SALVAGE // UNCERTAIN',
    heading: 'Survey the ruins',
    body: 'Salvage is likely. A survivor is possible. Fuel is rare. The moon may not be empty.',
    likely: 'Likely: salvage',
    danger: 'Danger: uncertain',
  },
  core: {
    signal: 'CORE // FINAL APPROACH',
    heading: 'Enter the core',
    body: 'Every route ends here. Whatever holds the center of the galaxy is waiting for you.',
    likely: 'Likely: the end',
    danger: 'Danger: absolute',
  },
}

function routeCard(offer: DestinationOffer): string {
  const copy = ROUTE_COPY[offer.kind]
  return `<article class="route-card ${offer.kind}"><p class="route-signal">${copy.signal}</p><h3>${offer.name}</h3><p><strong>${copy.heading}</strong></p><p>${copy.body}</p><p class="route-likelihood"><span>${copy.likely}</span><span>${copy.danger}</span></p><button data-campaign-action="route:${offer.id}">JUMP TO ${offer.name.toUpperCase()} · 1 FUEL</button></article>`
}

const MAP_SIZE = 560
const RING_SPACING = 74

function systemPosition(system: StarSystem): { x: number; y: number } {
  return {
    x: MAP_SIZE / 2 + Math.cos(system.angle) * system.ring * RING_SPACING,
    y: MAP_SIZE / 2 + Math.sin(system.angle) * system.ring * RING_SPACING,
  }
}

function galaxyMapSvg(current: CampaignState): string {
  const galaxy = current.galaxy
  const visited = new Set(current.visitedSystemIds)
  const reachable = new Set(current.offers.map(offer => offer.id))
  const revealed = revealedSystemIds(galaxy, current.visitedSystemIds)

  const lanes: string[] = []
  const drawn = new Set<string>()
  for (const system of galaxy.systems) {
    for (const neighborId of galaxy.adjacency[system.id] ?? []) {
      const laneKey = system.id < neighborId ? `${system.id}|${neighborId}` : `${neighborId}|${system.id}`
      if (drawn.has(laneKey)) continue
      drawn.add(laneKey)
      const from = systemPosition(system)
      const to = systemPosition(systemById(galaxy, neighborId))
      const open = (system.id === current.currentSystemId && reachable.has(neighborId))
        || (neighborId === current.currentSystemId && reachable.has(system.id))
      lanes.push(`<line class="lane ${open ? 'lane-open' : ''}" x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}"/>`)
    }
  }

  const nodes = galaxy.systems.map(system => {
    const { x, y } = systemPosition(system)
    const isCurrent = system.id === current.currentSystemId
    const stateClass = isCurrent
      ? 'sys-current'
      : reachable.has(system.id)
        ? 'sys-open'
        : visited.has(system.id)
          ? 'sys-visited'
          : revealed.has(system.id)
            ? 'sys-revealed'
            : 'sys-uncharted'
    const kindClass = revealed.has(system.id) || isCurrent ? `kind-${system.kind}` : ''
    const radius = system.kind === 'core' ? 14 : isCurrent || reachable.has(system.id) ? 11 : 8
    const action = reachable.has(system.id) ? ` data-campaign-action="route:${system.id}"` : ''
    const title = revealed.has(system.id)
      ? `${system.name} — ${system.kind === 'core' ? 'galactic core' : system.kind.replace('-', ' ')}${visited.has(system.id) ? ' (visited)' : reachable.has(system.id) ? ' (in jump range)' : ''}`
      : 'Uncharted system'
    const label = isCurrent || system.kind === 'core' || reachable.has(system.id)
      ? `<text class="sys-label ${isCurrent ? 'label-current' : ''}" x="${x.toFixed(1)}" y="${(y + radius + 13).toFixed(1)}">${system.name.toUpperCase()}</text>`
      : ''
    return `<g class="sys ${stateClass} ${kindClass}"${action}><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius}"/><title>${title}</title>${label}</g>`
  })

  return `<svg class="galaxy-map" viewBox="-20 -20 ${MAP_SIZE + 40} ${MAP_SIZE + 40}" role="img" aria-label="Galaxy map. ${current.visitedSystemIds.length} of ${galaxy.systems.length} systems visited. Jump options are listed as buttons below the map.">${lanes.join('')}${nodes.join('')}</svg>`
}

function renderRoute(): string {
  const here = systemById(campaign.galaxy, campaign.currentSystemId)
  const count = campaign.offers.length
  return `<div class="campaign-panel">${campaignStrip(campaign)}<p class="kicker">NAVIGATION // GALAXY MAP</p><h2 id="campaign-heading" tabindex="-1">${count === 1 ? 'One reachable signal.' : `${count} reachable signals.`} Fuel for one.</h2><p class="campaign-lede">Holding at ${here.name}. Every jump costs 1 fuel and burns the route behind you: the ship can hold its ring or fall inward toward the core, never climb back out. Reach the Galactic Core. Run seed: ${campaign.seed}.</p><div class="galaxy-frame">${galaxyMapSvg(campaign)}<div class="galaxy-legend"><span class="legend-current">Current</span><span class="legend-open">In range</span><span class="legend-revealed">Charted</span><span class="legend-visited">Visited</span><span class="legend-uncharted">Uncharted</span></div></div><div class="route-grid">${campaign.offers.map(routeCard).join('')}</div></div>`
}

function renderCampaignVictory(): string {
  const living = campaign.crew.filter(crew => crew.hp > 0).length
  return `<div class="campaign-panel campaign-victory">${campaignStrip(campaign)}<p class="kicker">CAMPAIGN VICTORY // GALACTIC CORE</p><h2 id="campaign-heading" tabindex="-1">The core opens before you.</h2><p class="campaign-lede">${systemById(campaign.galaxy, campaign.currentSystemId).name} swallows every signal you followed to reach it. The ship holds. The crew is watching. Whatever waits at the heart of the galaxy, you have arrived to meet it — the final battle itself lands in a future build.</p><div class="campaign-report"><span>JUMPS<strong>${campaign.jump}</strong></span><span>SYSTEMS VISITED<strong>${campaign.visitedSystemIds.length}/${campaign.galaxy.systems.length}</strong></span><span>CREW ALIVE<strong>${living}/${campaign.crew.length}</strong></span><span>HULL<strong>${campaign.hull}/${campaign.maxHull}</strong></span></div>${campaignRoster(campaign.crew)}<div class="campaign-actions"><button data-campaign-action="restart-campaign">START A NEW RUN</button></div></div>`
}

function moonResult(encounter: MoonEncounter): { kicker: string; heading: string; body: string; deltas: string[] } {
  if (encounter.outcome === 'salvage') return { kicker: 'MOON // REFINERY CACHE', heading: 'The refinery is dead. Its cargo winches are not.', body: 'Sealed alloy crates come free beneath a century of dust.', deltas: [`SALVAGE|+${encounter.salvage}`] }
  if (encounter.outcome === 'survivor') {
    const joined = encounter.recruit && campaign.crew.some(crew => crew.id === encounter.recruit!.id)
    return { kicker: 'MOON // PRESSURE SHELTER', heading: 'Someone answers from beneath the regolith.', body: joined ? `${encounter.recruit!.name} joins the ship with whatever they could carry.` : 'The roster is full, but the survivor reaches safety.', deltas: [joined ? 'CREW|+1 SURVIVOR' : 'CREW|ROSTER FULL'] }
  }
  if (encounter.outcome === 'fuel') return { kicker: 'MOON // EMERGENCY DEPOT', heading: 'The reserve tanks still hold pressure.', body: 'Ancient propellant is ugly, stable, and exactly what the engines need.', deltas: [`FUEL CACHE|UP TO +${encounter.fuel}`] }
  return { kicker: 'MOON // BIOLOGICAL CONTACT', heading: 'Something vast rolls through your engine wake.', body: 'The space amoeba leaves luminous scars across the hull and vanishes into the dark.', deltas: [`HULL|-${encounter.hullDamage}`] }
}

function eventDeltas(deltas: readonly string[]): string {
  return `<div class="event-deltas">${deltas.map(delta => {
    const [label, value] = delta.split('|')
    return `<p class="event-delta">${label}<strong>${value}</strong></p>`
  }).join('')}</div>`
}

function renderMoon(encounter: MoonEncounter): string {
  if (encounter.resolved) {
    const result = moonResult(encounter)
    return `<div class="campaign-panel">${campaignStrip(campaign)}<p class="kicker">${result.kicker}</p><h2 id="campaign-heading" tabindex="-1">${result.heading}</h2><p class="campaign-lede">${result.body}</p>${eventDeltas(result.deltas)}${encounter.recruit ? campaignRoster(campaign.crew) : ''}<div class="campaign-actions"><button data-campaign-action="continue-encounter">RETURN TO NAVIGATION</button></div></div>`
  }
  return `<div class="campaign-panel">${campaignStrip(campaign)}<p class="kicker">ARRIVAL // ABANDONED MOON</p><h2 id="campaign-heading" tabindex="-1">${encounter.name} has been silent for eighty years.</h2><p class="campaign-lede">Scans show buried structures and intermittent heat below the dust. Salvage is likely; fuel and survivors are not impossible.</p><div class="encounter-banner"><p><strong>UNCERTAIN SURVEY</strong></p><p>The signal is real. Its source is not yet clear.</p></div><div class="campaign-actions"><button data-campaign-action="resolve-encounter">LAND A SURVEY TEAM</button><button data-campaign-action="decline-encounter">LEAVE IT BURIED</button></div></div>`
}

function renderStarbase(encounter: StarbaseEncounter): string {
  const fuelDisabled = encounter.fuelStock <= 0 || campaign.credits < encounter.fuelPrice || campaign.fuel >= campaign.maxFuel
  const weaponOwned = campaign.weaponDamage > CAMPAIGN_TUNING.baseWeaponDamage
  const weaponDisabled = weaponOwned || !encounter.weaponAvailable || campaign.credits < encounter.weaponPrice
  const livingCrew = campaign.crew.filter(crew => crew.hp > 0).length
  const mercDisabled = !encounter.mercenary || campaign.credits < encounter.mercenaryPrice || livingCrew >= CAMPAIGN_TUNING.rosterCap
  const sellDisabled = campaign.salvage <= 0
  const fuelUnits = `${encounter.fuelStock} ${encounter.fuelStock === 1 ? 'unit' : 'units'}`
  return `<div class="campaign-panel">${campaignStrip(campaign)}<p class="kicker">STARBASE // MARKET</p><h2 id="campaign-heading" tabindex="-1">${encounter.name} sells survival at a markup.</h2><p class="campaign-lede">Purchases do not consume another jump. Stock and contracts were rolled on arrival; depart when ready.</p><div class="market-grid"><article class="market-offer ${encounter.fuelStock <= 0 ? 'sold-out' : ''}"><p class="kicker">DOCKMASTER // FUEL</p><h3>Reactor propellant</h3><p>${fuelUnits} in stock. Buy 1 fuel for ${encounter.fuelPrice} credits.</p><button data-campaign-action="buy-fuel" ${fuelDisabled ? 'disabled' : ''}>${encounter.fuelStock <= 0 ? 'SOLD OUT' : campaign.fuel >= campaign.maxFuel ? 'TANKS FULL' : campaign.credits < encounter.fuelPrice ? `NEED ${encounter.fuelPrice} CREDITS` : `BUY 1 FUEL · ${encounter.fuelPrice} CREDITS`}</button></article><article class="market-offer"><p class="kicker">BROKER // SALVAGE</p><h3>Sell recovered material</h3><p>Trade 1 salvage for ${CAMPAIGN_TUNING.salvageSalePrice} credits. The rate is insulting and reliable.</p><button data-campaign-action="sell-salvage" ${sellDisabled ? 'disabled' : ''}>${sellDisabled ? 'NO SALVAGE' : `SELL 1 SALVAGE · +${CAMPAIGN_TUNING.salvageSalePrice} CREDITS`}</button></article><article class="market-offer ${weaponDisabled ? 'sold-out' : ''}"><p class="kicker">SURPLUS // WEAPONS</p><h3>Mediocre boarding rifles</h3><p>Permanent +1 crew weapon damage. One upgrade is enough for this prototype.</p><button data-campaign-action="buy-weapon" ${weaponDisabled ? 'disabled' : ''}>${weaponOwned ? 'ALREADY INSTALLED' : !encounter.weaponAvailable ? 'NO STOCK' : campaign.credits < encounter.weaponPrice ? `NEED ${encounter.weaponPrice} CREDITS` : `BUY RIFLES · ${encounter.weaponPrice} CREDITS`}</button></article><article class="market-offer ${!encounter.mercenary ? 'sold-out' : ''}"><p class="kicker">CONTRACT // CREW</p><h3>${encounter.mercenary?.name ?? 'No one is taking contracts'}</h3><p>${encounter.mercenary ? `${encounter.mercenary.role}. Fit, armed, and asking ${encounter.mercenaryPrice} credits.` : 'The mercenary booth is empty this jump.'}</p><button data-campaign-action="hire-mercenary" ${mercDisabled ? 'disabled' : ''}>${livingCrew >= CAMPAIGN_TUNING.rosterCap ? 'ROSTER FULL' : !encounter.mercenary ? 'NO CONTRACT' : campaign.credits < encounter.mercenaryPrice ? `NEED ${encounter.mercenaryPrice} CREDITS` : `HIRE · ${encounter.mercenaryPrice} CREDITS`}</button></article></div><div class="campaign-actions"><button data-campaign-action="leave-starbase">PLOT NEXT JUMP</button></div></div>`
}

function distressBriefing(encounter: DistressEncounter): { kicker: string; heading: string; body: string; button: string; deadline?: string } {
  if (encounter.outcome === 'survivor') return { kicker: 'DISTRESS // LIFEBOAT', heading: 'One weak voice answers the hail.', body: 'No weapons lock. No second transponder. Just a failing life-support cell.', button: 'RECOVER THE SURVIVOR' }
  if (encounter.outcome === 'pirates') return { kicker: 'DISTRESS // PIRATE ATTACK', heading: 'Two transponders overlap. One is firing.', body: 'A pirate cutter has grappled a civilian courier. Board the attackers, clear their ship, and the survivor may join you.', button: 'BOARD THE PIRATE CUTTER' }
  if (encounter.outcome === 'rescue') return { kicker: 'DISTRESS // REACTOR FAILURE', heading: 'Eight turns before the ship breaks apart.', body: 'Pirates are still aboard. Reach the survivor before the end of Turn 8; contact auto-extracts the team.', button: 'LAUNCH RESCUE', deadline: 'MISS THE DEADLINE: DEPLOYED CREW KILLED · SHIP TAKES 20 HULL' }
  return { kicker: 'DISTRESS // SIGNAL SPOOFED', heading: 'The distress code repeats too cleanly.', body: 'Boarders were waiting inside the wreck. The ambush closes behind your team.', button: 'SPRING THE TRAP' }
}

function renderDistress(encounter: DistressEncounter): string {
  if (encounter.resolved) {
    const joined = encounter.recruit && campaign.crew.some(crew => crew.id === encounter.recruit!.id)
    return `<div class="campaign-panel">${campaignStrip(campaign)}<p class="kicker">DISTRESS // SURVIVOR RECOVERED</p><h2 id="campaign-heading" tabindex="-1">A new voice answers the next roll call.</h2><p class="campaign-lede">${joined ? `${encounter.recruit!.name}, ${encounter.recruit!.role.toLowerCase()}, joins the persistent crew.` : 'The survivor is safe, but the six-person roster is already full.'}</p>${eventDeltas([joined ? 'CREW|+1 SURVIVOR' : 'CREW|ROSTER FULL'])}${campaignRoster(campaign.crew)}<div class="campaign-actions"><button data-campaign-action="continue-encounter">RETURN TO NAVIGATION</button></div></div>`
  }
  const briefing = distressBriefing(encounter)
  const mission = encounter.outcome !== 'survivor'
  return `<div class="campaign-panel">${campaignStrip(campaign)}<p class="kicker">${briefing.kicker}</p><h2 id="campaign-heading" tabindex="-1">${briefing.heading}</h2><p class="campaign-lede">${briefing.body}</p>${briefing.deadline ? `<div class="deadline"><strong>EIGHT-TURN DEADLINE</strong><br>${briefing.deadline}</div>` : ''}<div class="campaign-actions"><button data-campaign-action="${mission ? 'begin-mission' : 'resolve-encounter'}">${briefing.button}</button><button data-campaign-action="decline-encounter">BREAK OFF</button></div></div>`
}

function renderEncounter(): string {
  const encounter = campaign.encounter!
  if (encounter.kind === 'starbase') return renderStarbase(encounter)
  if (encounter.kind === 'abandoned-moon') return renderMoon(encounter)
  return renderDistress(encounter)
}

function debriefHeading(): string {
  if (campaign.activeMission?.kind === 'timed-rescue') return 'The survivor is aboard. The ship dies behind you.'
  if (campaign.activeMission?.kind === 'distress-trap') return 'The bait had teeth. You took them.'
  return 'The distress ship is safe enough to search.'
}

function renderDebrief(): string {
  const report = campaign.missionReport!
  const wounded = campaign.crew.some(crew => crew.hp > 0 && crew.hp < crew.maxHp)
  const canTreat = campaign.salvage >= CAMPAIGN_TUNING.repairCost && wounded
  const canRepair = campaign.salvage >= CAMPAIGN_TUNING.repairCost && campaign.hull < campaign.maxHull
  const recruit = campaign.activeMission?.recruit
  const recruited = recruit && campaign.crew.some(crew => crew.id === recruit.id)
  return `<div class="campaign-panel">${campaignStrip(campaign)}<p class="kicker">AFTER ACTION // ${campaign.activeMission?.kind.replaceAll('-', ' ').toUpperCase()}</p><h2 id="campaign-heading" tabindex="-1">${debriefHeading()}</h2><p class="campaign-lede">Choose one intervention before returning to navigation. Every untreated wound and every unspent resource carries forward.</p><div class="campaign-report"><span>MISSION<strong>VICTORY · JUMP ${report.jump}</strong></span><span>SALVAGE<strong>+${report.salvageGained}</strong></span><span>CREDITS<strong>+${report.creditsGained}</strong></span><span>FUEL<strong>+${report.fuelGained}</strong></span><span>HULL DAMAGE<strong>-${report.hullDamage}</strong></span><span>OBJECTIVE<strong>${report.objective}</strong></span></div>${recruited ? `<div class="encounter-banner"><p><strong>NEW CREW // ${recruit.name.toUpperCase()}</strong></p><p>${recruit.role} · ${recruit.hp}/${recruit.maxHp} HP</p></div>` : ''}${campaignRoster(campaign.crew)}<div class="campaign-choice-grid"><article class="campaign-choice"><p class="kicker">MEDBAY // TRIAGE</p><h3>Treat the survivors</h3><p>Spend ${CAMPAIGN_TUNING.repairCost} salvage. Every living wounded crew member recovers ${CAMPAIGN_TUNING.crewRecoveryAmount} HP.</p><button data-campaign-action="recover-crew" ${canTreat ? '' : 'disabled'}>${wounded ? campaign.salvage >= CAMPAIGN_TUNING.repairCost ? 'TRIAGE & NAVIGATE' : `NEED ${CAMPAIGN_TUNING.repairCost} SALVAGE` : 'NO WOUNDED CREW'}</button></article><article class="campaign-choice"><p class="kicker">WORKSHOP // HULL</p><h3>Seal the damage</h3><p>Spend ${CAMPAIGN_TUNING.repairCost} salvage to restore ${CAMPAIGN_TUNING.repairAmount} hull before plotting the next jump.</p><button data-campaign-action="recover-hull" ${canRepair ? '' : 'disabled'}>${campaign.hull >= campaign.maxHull ? 'HULL IS INTACT' : campaign.salvage >= CAMPAIGN_TUNING.repairCost ? 'REPAIR & NAVIGATE' : `NEED ${CAMPAIGN_TUNING.repairCost} SALVAGE`}</button></article><article class="campaign-choice"><p class="kicker">CARGO // RESERVE</p><h3>Bank the salvage</h3><p>Make no repairs. Carry everything recovered into the next route choice.</p><button data-campaign-action="recover-bank">BANK & NAVIGATE</button></article></div></div>`
}

function lossReason(): { kicker: string; heading: string; body: string } {
  if (campaign.missionReport?.reason === 'deadline-expired') return { kicker: 'CAMPAIGN LOST // REACTOR DETONATION', heading: 'The reactor went before extraction.', body: 'The deployed crew died aboard the distress ship. The blast tore through your hull and ended the run.' }
  if (campaign.missionReport?.outcome === 'defeat') return { kicker: 'CAMPAIGN LOST // BOARDING TEAM DOWN', heading: 'No one returned from the signal.', body: 'The mission failed and the ship no longer has a viable boarding command.' }
  if (!campaign.crew.some(crew => crew.hp > 0)) return { kicker: 'CAMPAIGN LOST // NO CREW', heading: 'The last name leaves the duty roster.', body: 'The ship remains, but no living crew can command it.' }
  if (campaign.hull <= 0) return { kicker: 'CAMPAIGN LOST // HULL FAILURE', heading: 'The ship came apart between decisions.', body: 'There was not enough hull left to carry the crew home.' }
  return { kicker: 'CAMPAIGN LOST // FUEL EXHAUSTED', heading: 'The last jump emptied the tanks.', body: 'The ship and its surviving crew are stranded beyond the next signal.' }
}

function renderCampaignLost(): string {
  const loss = lossReason()
  const report = campaign.missionReport
  return `<div class="campaign-panel campaign-loss">${campaignStrip(campaign)}<p class="kicker">${loss.kicker}</p><h2 id="campaign-heading" tabindex="-1">${loss.heading}</h2><p class="campaign-lede">${loss.body}</p>${report ? `<div class="campaign-report"><span>LAST MISSION<strong>${report.outcome.toUpperCase()}</strong></span><span>SALVAGE<strong>+${report.salvageGained}</strong></span><span>CREDITS<strong>+${report.creditsGained}</strong></span><span>HULL DAMAGE<strong>-${report.hullDamage}</strong></span></div>` : ''}${campaignRoster(campaign.crew)}<div class="campaign-actions"><button data-campaign-action="restart-campaign">START A NEW RUN</button></div></div>`
}

function renderCampaignScreen() {
  campaignScreen.innerHTML = campaign.phase === 'route'
    ? renderRoute()
    : campaign.phase === 'encounter'
      ? renderEncounter()
      : campaign.phase === 'debrief'
        ? renderDebrief()
        : campaign.phase === 'victory'
          ? renderCampaignVictory()
          : renderCampaignLost()
  campaignScreen.querySelectorAll<HTMLButtonElement>('[data-campaign-action]').forEach(button => {
    button.onclick = () => handleCampaignAction(button.dataset.campaignAction!)
  })
  if (focusNextScreen) {
    focusNextScreen = false
    focusNextAction = undefined
    queueMicrotask(() => campaignScreen.querySelector<HTMLElement>('#campaign-heading')?.focus())
  } else if (focusNextAction) {
    const action = focusNextAction
    focusNextAction = undefined
    queueMicrotask(() => {
      const button = Array.from(campaignScreen.querySelectorAll<HTMLButtonElement>('[data-campaign-action]'))
        .find(candidate => candidate.dataset.campaignAction === action && !candidate.disabled)
      ;(button ?? campaignScreen.querySelector<HTMLElement>('#campaign-heading'))?.focus()
    })
  }
}

function phaseTitle(): string {
  if (campaign.phase === 'route') return 'Plot the next jump'
  if (campaign.phase === 'encounter') return campaign.encounter?.name ?? 'Signal contact'
  if (campaign.phase === 'debrief') return 'Mission consequences'
  if (campaign.phase === 'victory') return 'Galactic core reached'
  return 'Campaign ended'
}

function renderCampaignHud() {
  const report = campaign.missionReport
  hud.innerHTML = `<div><p class="kicker">CAMPAIGN // ${campaign.phase.toUpperCase()}</p><h2>${phaseTitle()}</h2><p>Jump ${campaign.jump} · ${campaign.fuel}/${campaign.maxFuel} fuel</p></div><section><h3>Mobile base</h3><p><strong>Hull ${campaign.hull}/${campaign.maxHull}</strong><br>${campaign.credits} credits · ${campaign.salvage} salvage<br>Boarding rifles · ${campaign.weaponDamage} damage</p></section><section><h3>Persistent crew</h3>${campaignRoster(campaign.crew)}</section>${report ? `<section><h3>Last mission</h3><p>${report.outcome === 'victory' ? 'Objective complete' : 'Mission failed'} · ${report.salvageGained} salvage · ${report.creditsGained} credits · ${report.hullDamage} hull damage</p></section>` : ''}`
}

function updateTacticalHud(current: GameState) {
  const selected = current.units.find(unit => unit.id === current.selectedId)
  const visible = new Set(currentVisibility(current).map(key))
  const legalTargetIds = new Set(legalTargets(current, fireMode).map(unit => unit.id))
  const knownHostiles = current.units.filter(unit => unit.team === 'enemy' && (unit.hp <= 0 || visible.has(key(unit))))
  const hostileMarkup = knownHostiles.length > 0
    ? knownHostiles.map(unit => {
      const status = unit.hp <= 0
        ? 'NEUTRALIZED'
        : legalTargetIds.has(unit.id) && selected
          ? `${unit.hp}/${unit.maxHp} · ${hitChance(current, selected, unit, fireMode)}% TO HIT`
          : `${unit.hp}/${unit.maxHp} · NO SHOT`
      return `<p class="hostile"><span>${unit.name}</span><b>${status}</b></p>`
    }).join('')
    : '<p class="no-contact">No contacts in visual range.</p>'
  const modeMarkup = (['snap', 'auto', 'aimed'] as const).map((id, index) => {
    const mode = FIRE_MODES[id]
    const affordable = (selected?.ap ?? 0) >= mode.cost
    return `<button class="fire-mode ${fireMode === id ? 'active' : ''}" data-fire-mode="${id}" ${affordable ? '' : 'disabled'}><span>${index + 1} · ${mode.label.toUpperCase()}</span><b>${mode.cost} TU${mode.shots > 1 ? ` · ${mode.shots} RDS` : ''}</b></button>`
  }).join('')
  const crewMarkup = campaign.crew.map(record => {
    const unit = current.units.find(candidate => candidate.id === record.id)
    const hp = unit?.hp ?? 0
    return `<button class="unit ${hp <= 0 ? 'dead' : ''}" data-unit="${record.id}" ${hp <= 0 ? 'disabled' : ''}><span>${record.name}<small>${record.role} · ${record.accuracy} ACC</small></span><b>${hp > 0 ? `${hp}/${record.maxHp} HP · ${unit!.ap} TU` : 'KIA'}</b></button>`
  }).join('')
  const deadline = current.objective.kind === 'rescue'
    ? `<section><h3>Deadline</h3><p class="deadline"><strong>TURN ${current.turn}/${current.objective.deadlineTurn}</strong><br>Reach ${current.objective.targetName} before enemy phase ${current.objective.deadlineTurn} ends.</p><p class="rescue-marker-legend">Survivor beacon</p></section>`
    : ''
  hud.innerHTML = `<div><p class="kicker">MISSION // ${current.status.toUpperCase()}</p><h2>${current.status === 'playing' ? current.objective.label : terminalTitle(current)}</h2><p>Jump ${campaign.jump} · Hull ${campaign.hull}/${campaign.maxHull} · ${campaign.weaponDamage} weapon damage</p></div>${deadline}<section><h3>Selected</h3><p>${selected ? `<strong>${selected.name}</strong><br>${selected.role} · ${selected.ap} TU · ${selected.hp}/${selected.maxHp} HP · ${selected.accuracy} ACC` : 'Enemy activity…'}</p><div class="fire-modes">${modeMarkup}</div></section><section><h3>Crew manifest</h3>${crewMarkup}</section><section><h3>Hostiles</h3>${hostileMarkup}</section><ol class="log">${current.log.map(entry => `<li>${entry}</li>`).join('')}</ol>`
  hud.querySelectorAll<HTMLButtonElement>('[data-unit]').forEach(button => button.onclick = () => {
    button.blur()
    controller.replace(selectUnit(state, button.dataset.unit!))
  })
  hud.querySelectorAll<HTMLButtonElement>('[data-fire-mode]').forEach(button => button.onclick = () => {
    button.blur()
    fireMode = button.dataset.fireMode as FireModeId
    renderApp()
  })
}

function renderApp() {
  const tactical = campaign.phase === 'mission'
  tacticalContainer.hidden = !tactical
  tacticalContainer.setAttribute('aria-hidden', String(!tactical))
  actionBar.hidden = !tactical
  campaignScreen.hidden = tactical

  if (tactical) {
    if (sceneReady) {
      scene.scale.refresh()
      scene.draw()
    }
    configureTacticalActions()
    if (focusNextTactical) {
      focusNextTactical = false
      queueMicrotask(() => tacticalContainer.focus())
    }
  } else {
    renderCampaignScreen()
    renderCampaignHud()
  }
}

function lockTransition(action: () => void) {
  if (transitionLocked) return
  transitionLocked = true
  action()
  window.setTimeout(() => { transitionLocked = false }, 300)
}

function resetShotAnimation() {
  if (sceneReady) scene.tweens.killAll()
  animating = false
  lastPlayedShots = []
}

function enterMission() {
  const next = beginMission(campaign)
  if (next === campaign) return
  campaign = next
  fireMode = 'snap'
  resetShotAnimation()
  focusNextScreen = true
  focusNextTactical = true
  controller.replace(createGame(missionFor(campaign)))
}

function handleCampaignAction(action: string) {
  lockTransition(() => {
    const before = campaign
    if (action.startsWith('route:')) campaign = chooseDestination(before, action.slice('route:'.length))
    else if (action === 'resolve-encounter') campaign = resolveEncounter(before)
    else if (action === 'continue-encounter') campaign = continueEncounter(before)
    else if (action === 'decline-encounter') campaign = declineEncounter(before)
    else if (action === 'leave-starbase') campaign = leaveStarbase(before)
    else if (action === 'buy-fuel') campaign = buyFuel(before)
    else if (action === 'sell-salvage') campaign = sellSalvage(before)
    else if (action === 'buy-weapon') campaign = buyWeapon(before)
    else if (action === 'hire-mercenary') campaign = hireMercenary(before)
    else if (action === 'begin-mission') {
      enterMission()
      return
    } else if (action === 'recover-crew') campaign = chooseRecovery(before, 'crew')
    else if (action === 'recover-hull') campaign = chooseRecovery(before, 'hull')
    else if (action === 'recover-bank') campaign = chooseRecovery(before, 'bank')
    else if (action === 'restart-campaign') {
      restartCampaign()
      return
    }
    const screenChanged = campaign.phase !== before.phase || campaign.encounter?.resolved !== before.encounter?.resolved
    if (campaign !== before && screenChanged) focusNextScreen = true
    else if (campaign !== before && ['buy-fuel', 'sell-salvage', 'buy-weapon', 'hire-mercenary'].includes(action)) focusNextAction = action
    renderApp()
  })
}

function finishMission() {
  if (campaign.phase !== 'mission' || state.status === 'playing') return
  controller.cancelPending()
  const next = resolveMission(campaign, state)
  if (next === campaign) return
  campaign = next
  focusNextScreen = true
  renderApp()
}

function restartCampaign() {
  controller.cancelPending()
  campaign = createRun()
  fireMode = 'snap'
  resetShotAnimation()
  focusNextScreen = true
  controller.replace(createGame(boardingMissionFor(campaign)))
}

function configureTacticalActions() {
  const complete = state.status !== 'playing'
  endTurnButton.textContent = complete ? 'CONTINUE' : 'END TURN'
  restartButton.textContent = 'NEW RUN'
  endTurnButton.onclick = () => {
    endTurnButton.blur()
    if (animating) return
    if (complete) finishMission()
    else controller.end()
  }
  restartButton.onclick = () => {
    restartButton.blur()
    if (animating) return
    restartCampaign()
  }
}

document.addEventListener('keydown', event => {
  const target = event.target as HTMLElement
  if (!document.body.classList.contains('in-game') || animating || campaign.phase !== 'mission' || target.matches('input, textarea, select, button, a') || target.isContentEditable || event.altKey || event.ctrlKey || event.metaKey) return
  const pressed = event.key.toLowerCase()
  if (state.status !== 'playing') {
    if (pressed === 'enter') finishMission()
    else if (pressed === 'r') restartCampaign()
    else return
    event.preventDefault()
    return
  }

  const directions: Record<string, [number, number]> = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }
  if (pressed === 'q' || pressed === 'e') {
    const crew = state.units.filter(unit => unit.team === 'crew' && unit.hp > 0)
    const index = crew.findIndex(unit => unit.id === state.selectedId)
    const step = pressed === 'q' ? -1 : 1
    if (crew.length > 0) controller.replace(selectUnit(state, crew[(index + step + crew.length) % crew.length].id))
  } else if (directions[pressed]) {
    const selected = state.units.find(unit => unit.id === state.selectedId)
    if (selected) controller.replace(move(state, selected.x + directions[pressed][0], selected.y + directions[pressed][1]))
  } else if (pressed === '1' || pressed === '2' || pressed === '3') {
    fireMode = pressed === '1' ? 'snap' : pressed === '2' ? 'auto' : 'aimed'
    renderApp()
  } else if (pressed === 'f' || pressed === 'enter') {
    const targets = legalTargets(state, fireMode)
    if (targets[0]) controller.replace(attack(state, targets[0].id, fireMode))
  } else if (pressed === 't') controller.end()
  else if (pressed === 'r') restartCampaign()
  else return
  event.preventDefault()
})

const copyPromptButton = document.querySelector<HTMLButtonElement>('#copy-prompt')
const kickoffPrompt = document.querySelector<HTMLElement>('#kickoff-prompt')
const copyStatus = document.querySelector<HTMLElement>('#copy-status')

copyPromptButton?.addEventListener('click', async () => {
  if (!kickoffPrompt || !copyStatus) return
  try {
    await navigator.clipboard.writeText(kickoffPrompt.innerText)
    copyPromptButton.textContent = 'COPIED'
    copyStatus.textContent = 'Prompt copied. Paste it into Codex or Claude Code.'
  } catch {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(kickoffPrompt)
    selection?.removeAllRanges()
    selection?.addRange(range)
    copyStatus.textContent = 'Copy was blocked by the browser. The prompt is selected; copy it manually.'
  }
})
