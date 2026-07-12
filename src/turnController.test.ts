import { describe, expect, it, vi } from 'vitest'
import { createGame } from './sim/game'
import { BOARDING_MISSION } from './sim/map'
import { TurnController } from './turnController'

describe('TurnController', () => {
  it('schedules only one enemy phase for repeated end-turn commands', () => {
    const callbacks: Array<() => void> = []
    const controller = new TurnController(createGame(), vi.fn(), callback => (callbacks.push(callback), callbacks.length), vi.fn())
    controller.end()
    controller.end()
    expect(callbacks).toHaveLength(1)
    callbacks[0]()
    expect(controller.current.turn).toBe(2)
  })

  it('cancels a pending enemy phase when restarted', () => {
    let callback = () => {}
    const cancel = vi.fn()
    const controller = new TurnController(createGame(), vi.fn(), next => (callback = next, 42), cancel)
    controller.end()
    controller.restart()
    expect(cancel).toHaveBeenCalledWith(42)
    callback()
    expect(controller.current.turn).toBe(1)
    expect(controller.current.phase).toBe('player')
  })

  it('restarts the mission definition it was given', () => {
    const mission = { ...BOARDING_MISSION, id: 'custom-mission', objective: 'Hold the bridge' }
    const controller = new TurnController(createGame(mission), vi.fn(), () => 1, vi.fn())
    controller.restart()
    expect(controller.current.mission.id).toBe('custom-mission')
    expect(controller.current.objective).toBe('Hold the bridge')
  })

  it('invalidates a stale enemy callback after cancellation', () => {
    let callback = () => {}
    const render = vi.fn()
    const controller = new TurnController(createGame(), render, next => (callback = next, 7), vi.fn())
    controller.end()
    controller.cancelPending()
    controller.replace(createGame())
    render.mockClear()
    callback()
    expect(controller.current.turn).toBe(1)
    expect(controller.current.phase).toBe('player')
    expect(render).not.toHaveBeenCalled()
  })
})
