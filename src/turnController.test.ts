import { describe, expect, it, vi } from 'vitest'
import { createGame } from './sim/game'
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
})
