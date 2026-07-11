import Phaser from 'phaser'
import './style.css'
import { attack, createGame, type GameState, HEIGHT, isWalkable, legalMoves, move, roomAt, selectUnit, systems, WIDTH } from './sim/game'
import { TurnController } from './turnController'

const CELL = 58, OX = 52, OY = 78
let state = createGame()
let controller: TurnController

class TacticalScene extends Phaser.Scene {
  create() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.click(pointer.x, pointer.y))
    this.draw()
  }

  click(px: number, py: number) {
    if (state.phase !== 'player' || state.status !== 'playing') return
    const x = Math.floor((px - OX) / CELL), y = Math.floor((py - OY) / CELL)
    if (!isWalkable({ x, y })) return
    const unit = state.units.find(candidate => candidate.hp > 0 && candidate.x === x && candidate.y === y)
    if (unit?.team === 'crew') state = selectUnit(state, unit.id)
    else if (unit?.team === 'enemy') state = attack(state, unit.id)
    else state = move(state, x, y)
    controller.replace(state)
  }

  draw() {
    this.children.removeAll()
    const graphics = this.add.graphics()
    graphics.fillStyle(0x07101c, 1).fillRect(0, 0, 800, 600)
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      const point = { x, y }, walkable = isWalkable(point)
      const room = roomAt(point)
      const color = room === 'Boarding Bay' ? 0x132b38 : room === 'Medbay' ? 0x173437 : room === 'Reactor' ? 0x302538 : room === 'Bridge' ? 0x192c45 : 0x302c27
      graphics.fillStyle(walkable ? color : 0x03070c, 1).fillRect(OX + x * CELL, OY + y * CELL, CELL - 2, CELL - 2)
      if (walkable) graphics.lineStyle(1, 0x426277, .45).strokeRect(OX + x * CELL, OY + y * CELL, CELL - 2, CELL - 2)
    }
    for (const point of legalMoves(state)) graphics.fillStyle(0x55d9d0, .24).fillRect(OX + point.x * CELL + 4, OY + point.y * CELL + 4, CELL - 10, CELL - 10)
    for (const system of systems) {
      graphics.fillStyle(0xf1bd5b, .55).fillRoundedRect(OX + system.x * CELL + 12, OY + system.y * CELL + 12, 32, 32, 5)
      this.add.text(OX + system.x * CELL + 15, OY + system.y * CELL + 22, system.system!, { fontFamily: 'monospace', fontSize: '10px', color: '#08121c' })
    }
    for (const unit of state.units.filter(unit => unit.hp > 0)) {
      const cx = OX + unit.x * CELL + 28, cy = OY + unit.y * CELL + 28
      if (unit.id === state.selectedId) graphics.lineStyle(3, 0xffffff, 1).strokeCircle(cx, cy, 22)
      graphics.fillStyle(unit.team === 'crew' ? 0x5de0d2 : 0xff5c68, 1).fillCircle(cx, cy, 17)
      this.add.text(cx, cy, unit.name[0], { fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold', color: '#061019' }).setOrigin(.5)
      graphics.fillStyle(0x04070b, 1).fillRect(cx - 21, cy + 20, 42, 5)
      graphics.fillStyle(unit.team === 'crew' ? 0x5de0d2 : 0xff5c68, 1).fillRect(cx - 21, cy + 20, 42 * unit.hp / unit.maxHp, 5)
    }
    const labels = [['BOARDING BAY', 1, 7], ['MEDBAY', 5, 0], ['REACTOR', 5, 7], ['BRIDGE', 9, 0], ['WEAPONS', 9, 7]] as const
    labels.forEach(([text, x, y]) => this.add.text(OX + x * CELL, OY + y * CELL + (y ? 35 : 8), text, { fontFamily: 'monospace', fontSize: '11px', color: '#91a9b8' }))
    this.add.text(52, 28, `TURN ${String(state.turn).padStart(2, '0')}  //  ${state.phase.toUpperCase()} PHASE`, { fontFamily: 'monospace', fontSize: '18px', color: state.phase === 'player' ? '#63e3d6' : '#ff6670' })
    if (state.status !== 'playing') {
      graphics.fillStyle(0x02060b, .86).fillRect(0, 0, 800, 600)
      this.add.text(400, 260, state.status === 'victory' ? 'SHIP SECURED' : 'BOARDING TEAM LOST', { fontFamily: 'monospace', fontSize: '32px', fontStyle: 'bold', color: state.status === 'victory' ? '#63e3d6' : '#ff6670' }).setOrigin(.5)
      this.add.text(400, 305, 'Press RESTART to run the breach again.', { fontFamily: 'monospace', fontSize: '15px', color: '#c7d6df' }).setOrigin(.5)
    }
    updateHud(state)
  }
}

function updateHud(current: GameState) {
  const selected = current.units.find(unit => unit.id === current.selectedId)
  const hud = document.querySelector('#hud')!
  hud.innerHTML = `<div><p class="kicker">MISSION // ${current.status.toUpperCase()}</p><h2>${current.status === 'playing' ? 'Eliminate all hostiles' : current.status === 'victory' ? 'Enemy ship secured' : 'All crew lost'}</h2><p>Turn ${current.turn} · ${current.phase} phase</p></div><section><h3>Selected</h3><p>${selected ? `<strong>${selected.name}</strong><br>${selected.role} · ${selected.ap} AP · ${selected.hp}/${selected.maxHp} HP` : 'Enemy activity…'}</p></section><section><h3>Crew manifest</h3>${current.units.filter(unit => unit.team === 'crew').map(unit => `<button class="unit ${unit.hp <= 0 ? 'dead' : ''}" data-unit="${unit.id}" ${unit.hp <= 0 ? 'disabled' : ''}><span>${unit.name}<small>${unit.role}</small></span><b>${unit.hp > 0 ? `${unit.hp} HP · ${unit.ap} AP` : 'KIA'}</b></button>`).join('')}</section><section><h3>Hostiles</h3>${current.units.filter(unit => unit.team === 'enemy').map(unit => `<p class="hostile"><span>${unit.name}</span><b>${unit.hp > 0 ? `${unit.hp}/${unit.maxHp}` : 'NEUTRALIZED'}</b></p>`).join('')}</section><ol class="log">${current.log.map(entry => `<li>${entry}</li>`).join('')}</ol>`
  hud.querySelectorAll<HTMLButtonElement>('[data-unit]').forEach(button => button.onclick = () => controller.replace(selectUnit(state, button.dataset.unit!)))
}

const scene = new TacticalScene('Tactical')
controller = new TurnController(state, next => { state = next; scene.draw() })
new Phaser.Game({ type: Phaser.AUTO, parent: 'phaser-game', width: 800, height: 600, backgroundColor: '#07101c', scene, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH } })
document.querySelector<HTMLButtonElement>('#end-turn')!.onclick = () => controller.end()
document.querySelector<HTMLButtonElement>('#restart')!.onclick = () => controller.restart()

document.addEventListener('keydown', event => {
  const target = event.target as HTMLElement
  if (target.matches('input, textarea, select, button, a') || target.isContentEditable || event.altKey || event.ctrlKey || event.metaKey) return
  const key = event.key.toLowerCase()
  const directions: Record<string, [number, number]> = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }
  if (key === 'q' || key === 'e') {
    const crew = state.units.filter(unit => unit.team === 'crew' && unit.hp > 0)
    const index = crew.findIndex(unit => unit.id === state.selectedId)
    const step = key === 'q' ? -1 : 1
    controller.replace(selectUnit(state, crew[(index + step + crew.length) % crew.length]?.id))
  } else if (directions[key]) {
    const selected = state.units.find(unit => unit.id === state.selectedId)
    if (selected) controller.replace(move(state, selected.x + directions[key][0], selected.y + directions[key][1]))
  } else if (key === 'f' || key === 'enter') {
    const selected = state.units.find(unit => unit.id === state.selectedId)
    const enemies = state.units.filter(unit => unit.team === 'enemy' && unit.hp > 0 && selected && Math.abs(unit.x - selected.x) + Math.abs(unit.y - selected.y) <= 4).sort((a, b) => a.id.localeCompare(b.id))
    if (enemies[0]) controller.replace(attack(state, enemies[0].id))
  } else if (key === 't') controller.end()
  else if (key === 'r') controller.restart()
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
