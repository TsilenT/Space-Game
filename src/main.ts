import Phaser from 'phaser'
import './style.css'
import './responsive.css'
import './campaign.css'
import {
  beginBoarding,
  boardingMissionFor,
  chooseRecovery,
  createCampaign,
  jumpAway,
  repairShip,
  resolveBoarding,
  scavengeEncounter,
  type CampaignCrew,
  type CampaignState,
} from './sim/campaign'
import { attack, createGame, currentVisibility, type GameState, legalMoves, legalTargets, move, selectUnit } from './sim/game'
import { cellAt, isWalkable, key } from './sim/map'
import { TurnController } from './turnController'

const CELL = 58, OX = 52, OY = 78
const ROOM_COLORS: Record<string, number> = {
  'Boarding Bay': 0x132b38,
  Medbay: 0x173437,
  Reactor: 0x302538,
  Bridge: 0x192c45,
  Weapons: 0x302c27,
}

let campaign = createCampaign()
let state = createGame(boardingMissionFor(campaign))
let controller: TurnController
let sceneReady = false
let focusNextScreen = true
let focusNextTactical = false
let transitionLocked = false

const tacticalContainer = document.querySelector<HTMLElement>('#phaser-game')!
const actionBar = document.querySelector<HTMLElement>('.actions')!
const endTurnButton = document.querySelector<HTMLButtonElement>('#end-turn')!
const restartButton = document.querySelector<HTMLButtonElement>('#restart')!
const hud = document.querySelector<HTMLElement>('#hud')!
const consoleElement = document.querySelector<HTMLElement>('.console')!
tacticalContainer.tabIndex = -1
const campaignScreen = document.createElement('section')
campaignScreen.id = 'campaign-screen'
campaignScreen.hidden = true
campaignScreen.setAttribute('aria-label', 'Campaign command screen')
consoleElement.insertBefore(campaignScreen, tacticalContainer)

class TacticalScene extends Phaser.Scene {
  create() {
    sceneReady = true
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.click(pointer.x, pointer.y))
    renderApp()
  }

  click(px: number, py: number) {
    if (transitionLocked || campaign.phase !== 'mission' || state.phase !== 'player' || state.status !== 'playing') return
    const x = Math.floor((px - OX) / CELL), y = Math.floor((py - OY) / CELL)
    if (!isWalkable(state.map, { x, y })) return
    const visible = new Set(currentVisibility(state).map(key))
    const unit = state.units.find(candidate => candidate.hp > 0 && candidate.x === x && candidate.y === y && (candidate.team === 'crew' || visible.has(key(candidate))))
    if (unit?.team === 'crew') state = selectUnit(state, unit.id)
    else if (unit?.team === 'enemy') state = attack(state, unit.id)
    else state = move(state, x, y)
    controller.replace(state)
  }

  draw() {
    if (!sceneReady || campaign.phase !== 'mission') return
    this.children.removeAll()
    const graphics = this.add.graphics()
    const visible = new Set(currentVisibility(state).map(key))
    const explored = new Set(state.explored)
    const openDoors = new Set(state.openDoors)
    const legalTargetIds = new Set(legalTargets(state).map(unit => unit.id))
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
    }
    for (const point of legalMoves(state)) graphics.fillStyle(0x55d9d0, .24).fillRect(OX + point.x * CELL + 4, OY + point.y * CELL + 4, CELL - 10, CELL - 10)
    for (const system of state.map.systems.filter(marker => explored.has(key(marker)))) {
      const isVisible = visible.has(key(system))
      graphics.fillStyle(0xf1bd5b, isVisible ? .55 : .2).fillRoundedRect(OX + system.x * CELL + 12, OY + system.y * CELL + 12, 32, 32, 5)
      this.add.text(OX + system.x * CELL + 15, OY + system.y * CELL + 22, system.system, { fontFamily: 'monospace', fontSize: '10px', color: isVisible ? '#08121c' : '#7d704e' })
    }
    for (const unit of state.units.filter(unit => unit.hp > 0 && (unit.team === 'crew' || visible.has(key(unit))))) {
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
    this.add.text(52, 28, `TURN ${String(state.turn).padStart(2, '0')}  //  ${state.phase.toUpperCase()} PHASE`, { fontFamily: 'monospace', fontSize: '18px', color: state.phase === 'player' ? '#63e3d6' : '#ff6670' })
    if (state.status !== 'playing') {
      graphics.fillStyle(0x02060b, .86).fillRect(0, 0, 800, 600)
      this.add.text(400, 260, state.status === 'victory' ? 'SHIP SECURED' : 'BOARDING TEAM LOST', { fontFamily: 'monospace', fontSize: '32px', fontStyle: 'bold', color: state.status === 'victory' ? '#63e3d6' : '#ff6670' }).setOrigin(.5)
      this.add.text(400, 305, state.status === 'victory' ? 'Continue to carry the damage home.' : 'Continue to the campaign report.', { fontFamily: 'monospace', fontSize: '15px', color: '#c7d6df' }).setOrigin(.5)
    }
    updateTacticalHud(state)
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
  return `<div class="campaign-strip"><span>JUMP <b>${String(current.jump).padStart(2, '0')}</b></span><span>FUEL <b>${current.fuel}</b></span><span>SALVAGE <b>${current.salvage}</b></span><span>HULL <b>${current.hull}/${current.maxHull}</b></span><span>CREW <b>${living}/${current.crew.length}</b></span></div>`
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

function renderEncounter(): string {
  const repairDisabled = campaign.salvage < 2 || campaign.hull >= campaign.maxHull
  const repeatedContact = campaign.jump > 1
  const heading = repeatedContact ? 'Another Wraith cutter echoes the same signal.' : 'A Wraith cutter is running dark.'
  const repeatNote = repeatedContact ? ' This demo repeats one authored contact so you can test what survived the jump.' : ''
  return `<div class="campaign-panel">${campaignStrip(campaign)}<p class="kicker">ENCOUNTER // HOSTILE CONTACT</p><h2 id="campaign-heading" tabindex="-1">${heading}</h2><p class="campaign-lede">Its drives are dead. Its bridge is not. Board it for salvage, strip the debris, repair in place, or spend fuel to leave it behind.${repeatNote}</p><div class="campaign-stats"><span>CONTACT<strong>3 HOSTILES</strong></span><span>BOARDING TEAM<strong>${campaign.crew.filter(crew => crew.hp > 0).length} READY</strong></span><span>MISSION RESULT<strong>+4 SALVAGE · -8 HULL</strong></span></div><div class="campaign-choice-grid"><article class="campaign-choice"><p class="kicker">FIGHT // BOARD</p><h3>Take the cutter</h3><p>Deploy every living crew member. Wounds and death come home with them. Securing the cutter always strains your hull for 8.</p><button data-campaign-action="board">BOARD THE CUTTER</button></article><article class="campaign-choice"><p class="kicker">SALVAGE // CAUTIOUS</p><h3>Skim the debris</h3><p>Gain 1 salvage, suffer 3 hull damage, and burn 1 fuel reaching the next contact.</p><button data-campaign-action="scavenge">SCAVENGE & JUMP</button></article><article class="campaign-choice"><p class="kicker">SHIP // REPAIR</p><h3>Patch the hull</h3><p>Spend 2 salvage to restore 15 hull without leaving this encounter.</p><button data-campaign-action="repair" ${repairDisabled ? 'disabled' : ''}>${campaign.hull >= campaign.maxHull ? 'HULL IS INTACT' : campaign.salvage < 2 ? 'NEED 2 SALVAGE' : 'REPAIR SHIP'}</button></article><article class="campaign-choice"><p class="kicker">NAVIGATION // WITHDRAW</p><h3>Jump away</h3><p>Preserve crew and hull, spend 1 fuel, and face the next contact empty-handed.</p><button data-campaign-action="jump">JUMP AWAY · 1 FUEL</button></article></div></div>`
}

function renderDebrief(): string {
  const report = campaign.missionReport!
  const wounded = campaign.crew.some(crew => crew.hp > 0 && crew.hp < crew.maxHp)
  const canTreat = campaign.salvage >= 2 && wounded
  const canRepair = campaign.salvage >= 2 && campaign.hull < campaign.maxHull
  return `<div class="campaign-panel">${campaignStrip(campaign)}<p class="kicker">AFTER ACTION // SHIP SECURED</p><h2 id="campaign-heading" tabindex="-1">The cutter is quiet. Your crew is not unchanged.</h2><p class="campaign-lede">Salvage teams recovered what they could. Choose one intervention before the ship burns fuel for the next jump; everything else carries forward.</p><div class="campaign-report"><span>MISSION<strong>VICTORY · JUMP ${report.jump}</strong></span><span>RECOVERED<strong>+${report.salvageGained} SALVAGE</strong></span><span>BOARDING STRAIN<strong>-${report.hullDamage} HULL</strong></span></div>${campaignRoster(campaign.crew)}<div class="campaign-choice-grid"><article class="campaign-choice"><p class="kicker">MEDBAY // TRIAGE</p><h3>Treat the survivors</h3><p>Spend 2 salvage. Every living wounded crew member recovers 2 HP.</p><button data-campaign-action="recover-crew" ${canTreat ? '' : 'disabled'}>${wounded ? campaign.salvage >= 2 ? 'TRIAGE & JUMP' : 'NEED 2 SALVAGE' : 'NO WOUNDED CREW'}</button></article><article class="campaign-choice"><p class="kicker">WORKSHOP // HULL</p><h3>Seal the damage</h3><p>Spend 2 salvage to restore 15 hull before committing to the next contact.</p><button data-campaign-action="recover-hull" ${canRepair ? '' : 'disabled'}>${campaign.hull >= campaign.maxHull ? 'HULL IS INTACT' : campaign.salvage >= 2 ? 'REPAIR & JUMP' : 'NEED 2 SALVAGE'}</button></article><article class="campaign-choice"><p class="kicker">CARGO // RESERVE</p><h3>Bank the salvage</h3><p>Make no repairs. Carry every recovered unit of salvage into the next encounter.</p><button data-campaign-action="recover-bank">BANK & JUMP</button></article></div></div>`
}

function lossReason(): { kicker: string; heading: string; body: string } {
  if (campaign.missionReport?.outcome === 'defeat') return { kicker: 'CAMPAIGN LOST // BOARDING TEAM DOWN', heading: 'The cutter kept its dead.', body: 'The mission failed and the ship no longer has a viable boarding command.' }
  if (campaign.hull <= 0) return { kicker: 'CAMPAIGN LOST // HULL FAILURE', heading: 'The ship came apart between decisions.', body: 'There was not enough hull left to carry the crew to another contact.' }
  return { kicker: 'CAMPAIGN LOST // FUEL EXHAUSTED', heading: 'The last jump emptied the tanks.', body: 'The ship and its surviving crew are stranded before the next encounter.' }
}

function renderCampaignLost(): string {
  const loss = lossReason()
  const report = campaign.missionReport
  return `<div class="campaign-panel campaign-loss">${campaignStrip(campaign)}<p class="kicker">${loss.kicker}</p><h2 id="campaign-heading" tabindex="-1">${loss.heading}</h2><p class="campaign-lede">${loss.body}</p>${report ? `<div class="campaign-report"><span>LAST MISSION<strong>${report.outcome.toUpperCase()}</strong></span><span>SALVAGE<strong>+${report.salvageGained}</strong></span><span>HULL DAMAGE<strong>-${report.hullDamage}</strong></span></div>` : ''}${campaignRoster(campaign.crew)}<div class="campaign-actions"><button data-campaign-action="restart-campaign">START A NEW RUN</button></div></div>`
}

function renderCampaignScreen() {
  campaignScreen.innerHTML = campaign.phase === 'encounter' ? renderEncounter() : campaign.phase === 'debrief' ? renderDebrief() : renderCampaignLost()
  campaignScreen.querySelectorAll<HTMLButtonElement>('[data-campaign-action]').forEach(button => {
    button.onclick = () => handleCampaignAction(button.dataset.campaignAction!)
  })
  if (focusNextScreen) {
    focusNextScreen = false
    queueMicrotask(() => campaignScreen.querySelector<HTMLElement>('#campaign-heading')?.focus())
  }
}

function renderCampaignHud() {
  const phaseTitle = campaign.phase === 'encounter' ? 'Command decision' : campaign.phase === 'debrief' ? 'Mission consequences' : 'Campaign ended'
  const report = campaign.missionReport
  hud.innerHTML = `<div><p class="kicker">CAMPAIGN // ${campaign.phase.toUpperCase()}</p><h2>${phaseTitle}</h2><p>Jump ${campaign.jump} · ${campaign.fuel} fuel remaining</p></div><section><h3>Mobile base</h3><p><strong>Hull ${campaign.hull}/${campaign.maxHull}</strong><br>${campaign.salvage} salvage in cargo</p></section><section><h3>Persistent crew</h3>${campaignRoster(campaign.crew)}</section>${report ? `<section><h3>Last mission</h3><p>${report.outcome === 'victory' ? 'Ship secured' : 'Boarding failed'} · ${report.salvageGained} salvage · ${report.hullDamage} hull damage</p></section>` : ''}`
}

function updateTacticalHud(current: GameState) {
  const selected = current.units.find(unit => unit.id === current.selectedId)
  const visible = new Set(currentVisibility(current).map(key))
  const legalTargetIds = new Set(legalTargets(current).map(unit => unit.id))
  const knownHostiles = current.units.filter(unit => unit.team === 'enemy' && (unit.hp <= 0 || visible.has(key(unit))))
  const hostileMarkup = knownHostiles.length > 0
    ? knownHostiles.map(unit => `<p class="hostile"><span>${unit.name}</span><b>${unit.hp > 0 ? `${unit.hp}/${unit.maxHp} · ${legalTargetIds.has(unit.id) ? 'CLEAR' : 'NO SHOT'}` : 'NEUTRALIZED'}</b></p>`).join('')
    : '<p class="no-contact">No contacts in visual range.</p>'
  const crewMarkup = campaign.crew.map(record => {
    const unit = current.units.find(candidate => candidate.id === record.id)
    const hp = unit?.hp ?? 0
    return `<button class="unit ${hp <= 0 ? 'dead' : ''}" data-unit="${record.id}" ${hp <= 0 ? 'disabled' : ''}><span>${record.name}<small>${record.role}</small></span><b>${hp > 0 ? `${hp}/${record.maxHp} HP · ${unit!.ap} AP` : 'KIA'}</b></button>`
  }).join('')
  hud.innerHTML = `<div><p class="kicker">MISSION // ${current.status.toUpperCase()}</p><h2>${current.status === 'playing' ? current.objective : current.status === 'victory' ? 'Enemy ship secured' : 'All crew lost'}</h2><p>Jump ${campaign.jump} · Hull ${campaign.hull}/${campaign.maxHull} · Salvage ${campaign.salvage}</p></div><section><h3>Selected</h3><p>${selected ? `<strong>${selected.name}</strong><br>${selected.role} · ${selected.ap} AP · ${selected.hp}/${selected.maxHp} HP` : 'Enemy activity…'}</p></section><section><h3>Crew manifest</h3>${crewMarkup}</section><section><h3>Hostiles</h3>${hostileMarkup}</section><ol class="log">${current.log.map(entry => `<li>${entry}</li>`).join('')}</ol>`
  hud.querySelectorAll<HTMLButtonElement>('[data-unit]').forEach(button => button.onclick = () => {
    button.blur()
    controller.replace(selectUnit(state, button.dataset.unit!))
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

function handleCampaignAction(action: string) {
  lockTransition(() => {
    const before = campaign
    if (action === 'board') {
      const next = beginBoarding(before)
      if (next === before) return
      campaign = next
      focusNextScreen = true
      focusNextTactical = true
      controller.replace(createGame(boardingMissionFor(campaign)))
      return
    }
    if (action === 'scavenge') campaign = scavengeEncounter(before)
    else if (action === 'repair') campaign = repairShip(before)
    else if (action === 'jump') campaign = jumpAway(before)
    else if (action === 'recover-crew') campaign = chooseRecovery(before, 'crew')
    else if (action === 'recover-hull') campaign = chooseRecovery(before, 'hull')
    else if (action === 'recover-bank') campaign = chooseRecovery(before, 'bank')
    else if (action === 'restart-campaign') {
      restartCampaign()
      return
    }
    if (campaign !== before) focusNextScreen = true
    renderApp()
  })
}

function finishMission() {
  if (campaign.phase !== 'mission' || state.status === 'playing') return
  controller.cancelPending()
  const next = resolveBoarding(campaign, state)
  if (next === campaign) return
  campaign = next
  focusNextScreen = true
  renderApp()
}

function restartCampaign() {
  controller.cancelPending()
  campaign = createCampaign()
  focusNextScreen = true
  controller.replace(createGame(boardingMissionFor(campaign)))
}

function configureTacticalActions() {
  const complete = state.status !== 'playing'
  endTurnButton.textContent = complete ? 'CONTINUE' : 'END TURN'
  restartButton.textContent = 'NEW RUN'
  endTurnButton.onclick = () => {
    endTurnButton.blur()
    if (complete) finishMission()
    else controller.end()
  }
  restartButton.onclick = () => {
    restartButton.blur()
    restartCampaign()
  }
}

document.addEventListener('keydown', event => {
  const target = event.target as HTMLElement
  if (campaign.phase !== 'mission' || target.matches('input, textarea, select, button, a') || target.isContentEditable || event.altKey || event.ctrlKey || event.metaKey) return
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
  } else if (pressed === 'f' || pressed === 'enter') {
    const targets = legalTargets(state)
    if (targets[0]) controller.replace(attack(state, targets[0].id))
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
