import { describe, expect, it } from 'vitest'
import { RING_SIZES, generateGalaxy, jumpTargets, revealedSystemIds, systemById } from './galaxy'

const TOTAL_SYSTEMS = RING_SIZES.reduce((sum, count) => sum + count, 0)

describe('deterministic galaxy generation', () => {
  it('is reproducible per seed and varies between seeds', () => {
    expect(generateGalaxy(5)).toEqual(generateGalaxy(5))
    expect(generateGalaxy(5)).not.toEqual(generateGalaxy(6))
  })

  it('builds concentric rings with one core and unique names', () => {
    const galaxy = generateGalaxy(42)
    expect(galaxy.systems).toHaveLength(TOTAL_SYSTEMS)
    RING_SIZES.forEach((count, ring) => {
      expect(galaxy.systems.filter(system => system.ring === ring)).toHaveLength(count)
    })
    expect(galaxy.systems.filter(system => system.kind === 'core')).toEqual([systemById(galaxy, galaxy.coreId)])
    expect(systemById(galaxy, galaxy.coreId).ring).toBe(0)
    expect(systemById(galaxy, galaxy.startId).ring).toBe(RING_SIZES.length - 1)
    expect(new Set(galaxy.systems.map(system => system.id)).size).toBe(TOTAL_SYSTEMS)
    expect(new Set(galaxy.systems.map(system => system.name)).size).toBe(TOTAL_SYSTEMS)
  })

  it('links every system symmetrically, laterally around its ring, and inward toward the core', () => {
    const galaxy = generateGalaxy(42)
    for (const system of galaxy.systems) {
      for (const neighborId of galaxy.adjacency[system.id]) {
        expect(galaxy.adjacency[neighborId]).toContain(system.id)
      }
      if (system.ring === 0) continue
      const neighbors = galaxy.adjacency[system.id].map(id => systemById(galaxy, id))
      expect(neighbors.some(neighbor => neighbor.ring === system.ring - 1)).toBe(true)
      expect(neighbors.filter(neighbor => neighbor.ring === system.ring)).toHaveLength(2)
    }
  })
})

describe('jump rules', () => {
  it('excludes visited systems and never offers an outward jump', () => {
    const galaxy = generateGalaxy(7)
    const rim = galaxy.systems.filter(system => system.ring === RING_SIZES.length - 1)
    for (const system of rim) {
      const targets = jumpTargets(galaxy, system.id, [system.id])
      expect(targets.length).toBeGreaterThan(0)
      for (const target of targets) {
        expect(target.ring).toBeLessThanOrEqual(system.ring)
        expect(target.id).not.toBe(system.id)
      }
    }
  })

  it('still offers an inward jump when the entire current ring is exhausted', () => {
    const galaxy = generateGalaxy(7)
    const rimIds = galaxy.systems.filter(system => system.ring === RING_SIZES.length - 1).map(system => system.id)
    for (const id of rimIds) {
      const targets = jumpTargets(galaxy, id, rimIds)
      expect(targets.length).toBeGreaterThan(0)
      expect(targets.every(target => target.ring === RING_SIZES.length - 2)).toBe(true)
    }
  })

  it('always lets any walk policy reach the core without stranding', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const galaxy = generateGalaxy(seed)
      for (const policy of [0, 1, 2]) {
        let currentId = galaxy.startId
        const visited = [galaxy.startId]
        let steps = 0
        while (currentId !== galaxy.coreId) {
          const targets = jumpTargets(galaxy, currentId, visited)
          expect(targets.length).toBeGreaterThan(0)
          const pick = policy === 0 ? 0 : policy === 1 ? targets.length - 1 : steps % targets.length
          currentId = targets[pick].id
          visited.push(currentId)
          steps += 1
          expect(steps).toBeLessThanOrEqual(TOTAL_SYSTEMS)
          const ringNow = systemById(galaxy, currentId).ring
          const ringBefore = systemById(galaxy, visited[visited.length - 2]).ring
          expect(ringNow).toBeLessThanOrEqual(ringBefore)
        }
      }
    }
  })
})

describe('chart knowledge', () => {
  it('reveals only visited systems and their direct neighbors', () => {
    const galaxy = generateGalaxy(11)
    const revealed = revealedSystemIds(galaxy, [galaxy.startId])
    expect(revealed).toEqual(new Set([galaxy.startId, ...galaxy.adjacency[galaxy.startId]]))
    expect(revealed.size).toBeLessThan(TOTAL_SYSTEMS)
  })
})
