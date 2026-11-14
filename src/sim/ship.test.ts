import { describe, expect, it } from 'vitest'
import {
  createShipSystems,
  damageShipSystem,
  jumpFuelCost,
  medbayHealing,
  repairShipSystem,
} from './ship'

describe('ship systems', () => {
  it('tracks damage and repair independently without mutating previous states', () => {
    const starting = createShipSystems()
    const damage = damageShipSystem(damageShipSystem(starting, 'engines'), 'medbay')
    const repaired = repairShipSystem(damage, 'engines')

    expect(starting).toEqual({ medbay: 'operational', engines: 'operational' })
    expect(damage).toEqual({ medbay: 'damaged', engines: 'damaged' })
    expect(repaired).toEqual({ medbay: 'damaged', engines: 'operational' })
    expect(damageShipSystem(damage, 'medbay')).toBe(damage)
    expect(repairShipSystem(repaired, 'engines')).toBe(repaired)
  })

  it('reduces triage healing until the medbay is repaired', () => {
    const starting = createShipSystems()
    const damaged = damageShipSystem(starting, 'medbay')

    expect(medbayHealing(starting, 2)).toBe(2)
    expect(medbayHealing(damaged, 2)).toBe(1)
    expect(medbayHealing(repairShipSystem(damaged, 'medbay'), 2)).toBe(2)
  })

  it('charges extra for lateral jumps with damaged engines and preserves the cost inward', () => {
    const starting = createShipSystems()
    const damaged = damageShipSystem(starting, 'engines')

    expect(jumpFuelCost(starting, 2, 2, 1)).toBe(1)
    expect(jumpFuelCost(damaged, 2, 2, 1)).toBe(2)
    expect(jumpFuelCost(damaged, 2, 1, 1)).toBe(1)
    expect(jumpFuelCost(repairShipSystem(damaged, 'engines'), 2, 2, 1)).toBe(1)
  })
})
