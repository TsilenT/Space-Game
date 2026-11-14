export type ShipSystem = 'medbay' | 'engines'
export type ShipSystems = Readonly<Record<ShipSystem, 'operational' | 'damaged'>>

export function createShipSystems(): ShipSystems {
  return { medbay: 'operational', engines: 'operational' }
}

export function damageShipSystem(systems: ShipSystems, system: ShipSystem): ShipSystems {
  return systems[system] === 'damaged' ? systems : { ...systems, [system]: 'damaged' }
}

export function repairShipSystem(systems: ShipSystems, system: ShipSystem): ShipSystems {
  return systems[system] === 'operational' ? systems : { ...systems, [system]: 'operational' }
}

export function medbayHealing(systems: ShipSystems, normalHealing: number): number {
  return systems.medbay === 'damaged' ? Math.floor(normalHealing / 2) : normalHealing
}

export function jumpFuelCost(
  systems: ShipSystems,
  currentRing: number,
  destinationRing: number,
  normalCost: number,
): number {
  const extraFuel = systems.engines === 'damaged' && destinationRing === currentRing ? 1 : 0
  return normalCost + extraFuel
}
