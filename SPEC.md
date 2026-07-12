# Space Game Specification

> **Working title:** Space Game  
> **Genre:** Roguelite starship survival, squad tactics, and ship/base management  
> **Primary inspirations:** Faster Than Light and the original X-COM  
> **Initial target:** Playable browser prototype (TypeScript + Phaser 4 + Vite)

---

## 1. High Concept

**Space Game** is a roguelite space survival game where the player commands a fragile starship through dangerous sectors while managing a persistent crew, damaged ship systems, scarce resources, and escalating alien threats.

The strategic layer borrows the pressure and route planning of **Faster Than Light**: sector jumps, events, ship systems, fuel, repairs, salvage, and a pursuing or expanding galactic threat.

The tactical layer borrows from the **original X-COM**: persistent soldiers, lethal turn-based missions, fog of war, morale, injuries, research, recovered alien technology, and consequences that persist after each mission.

The central promise is simple:

> **FTL decides where disaster happens. X-COM decides who survives it.**

---

## 2. Player Fantasy

The player is the commander of a battered exploration/combat vessel operating beyond stable civilization.

They are not an invincible hero. They are the exhausted person making hard calls with too little fuel, too few medkits, and three fires in the engine room.

The player must:

- Keep the ship operational.
- Keep the crew alive.
- Choose when to fight, flee, board, salvage, negotiate, or abandon a mission.
- Recover alien technology.
- Research and install risky upgrades.
- Prevent a spreading galactic threat from overwhelming the map.

Tone target:

> **Desperate, strange, occasionally funny space survival.**

---

## 3. Design Pillars

### 3.1 The Ship Is the Base

The player ship is both the FTL-style vessel and the X-COM-style base. Damage to the ship affects tactical options, research, medical recovery, morale, and escape routes.

### 3.2 Every Mission Leaves Marks

Crew members gain experience, injuries, trauma, mutations, scars, and stories. Ship systems are repaired, upgraded, destroyed, or replaced. Salvage and research alter the future campaign.

### 3.3 Tactical Combat Should Be Systemic

Combat should feel dangerous and somewhat simulation-driven: fog of war, reaction fire, ammo, line of sight, panic, wounds, explosions, fires, vacuum, and friendly fire should all be possible.

### 3.4 Resource Pressure Creates Decisions

Fuel, hull integrity, oxygen, medical supplies, ammunition, power, and crew fatigue should force the player into interesting compromises.

### 3.5 Winning Is Often Messy

The ideal outcome is not always clean victory. A good mission may involve escaping with the alien artifact while the boarding shuttle is on fire and the medic is unconscious.

---

## 4. Core Game Loop

1. **Choose a jump destination**
   - Distress signal
   - Derelict ship
   - Pirate ambush
   - Alien nest
   - Research station
   - Civilian colony under attack
   - Resource-rich asteroid field

2. **Resolve the strategic encounter**
   - Ship-to-ship battle
   - Boarding action
   - Away mission
   - Negotiation
   - Salvage operation
   - Emergency repair

3. **Enter tactical combat when appropriate**
   - Deploy a small squad.
   - Explore under fog of war.
   - Fight aliens, pirates, drones, parasites, or boarders.
   - Complete objectives before conditions worsen.

4. **Recover rewards and consequences**
   - Salvage
   - Fuel
   - Alien corpses or artifacts
   - Injured or dead crew
   - Damaged ship systems
   - Recruited survivors
   - New research topics

5. **Return to ship management**
   - Repair systems.
   - Heal crew.
   - Assign research.
   - Upgrade modules.
   - Decide the next jump before the threat advances.

---

## 5. Recommended Combat Structure

The best initial structure is a **hybrid**:

- Ship-to-ship combat can be fast, abstracted, or FTL-like.
- Tactical X-COM-style combat begins when:
  - The player boards an enemy ship.
  - Enemies board the player ship.
  - The crew investigates a station, derelict, ruin, or colony.
  - A crisis occurs inside the player ship.

This preserves FTL's campaign pace while letting tactical missions carry the emotional and mechanical weight.

---

## 6. Tactical Combat

### 6.1 Squad Size

Initial squad size should be **3–4 crew members**, expanding later to **5–6**.

### 6.2 Tactical Unit Roles

Roles should emerge from equipment, stats, and training rather than rigid fantasy classes.

Possible roles:

- **Marine** — rifles, grenades, armor, breaching.
- **Engineer** — repairs, drones, turrets, door hacking.
- **Medic** — stabilizes wounds, removes panic, manages trauma.
- **Pilot/Scout** — mobility, sensors, evasion, reconnaissance.
- **Xeno-specialist** — alien artifacts, psionics, risky late-game tools.
- **Robot/Drone** — durable and repairable, cannot panic, vulnerable to EMP.

### 6.3 Combat Mechanics

Borrow more from original X-COM than from modern cinematic tactics games.

Target mechanics:

- Turn-based actions using action points or time units.
- Snap shot, aimed shot, melee, overwatch/reaction fire.
- Fog of war and line of sight.
- Cover and facing.
- Inventory weight.
- Ammunition and reloads.
- Morale and panic.
- Wounds and bleeding.
- Friendly fire.
- Environmental hazards: fire, smoke, vacuum, radiation, acid, electrical arcs.
- Optional destructible doors, walls, and hull breaches.

### 6.4 Tactical Objectives

Not every mission should be extermination.

Examples:

- Capture the enemy bridge.
- Steal a reactor core before self-destruct.
- Rescue colonists.
- Retrieve a black box from a derelict.
- Survive until engines reboot.
- Seal hull breaches.
- Disable an alien beacon.
- Escape with at least one surviving crew member.

---

## 7. Ship and Base Management

### 7.1 Core Ship Systems

The ship should contain physical rooms and strategic systems.

Initial systems:

- Bridge
- Engines
- Reactor
- Weapons
- Shields
- Medbay
- Workshop
- Research lab
- Barracks
- Cargo hold
- Sensor array
- Life support

Potential later systems:

- Drone bay
- Brig/quarantine room
- Psionics chamber
- Alien containment
- Hydroponics
- Cloaking system
- Teleporter/boarding shuttle

### 7.2 System Damage Effects

Ship damage should affect tactical play and campaign decisions.

Examples:

- **Damaged sensors:** worse fog of war or fewer enemy previews.
- **Damaged medbay:** slower healing, worse injury outcomes.
- **Damaged engines:** fewer escape options, higher pursuit risk.
- **Damaged life support:** oxygen timers during missions.
- **Damaged research lab:** delayed or blocked research.
- **Damaged barracks:** morale penalties and slower fatigue recovery.
- **Damaged reactor:** limited power allocation.

### 7.3 Crew Persistence

Crew should have:

- Names
- Stats
- Skills
- Equipment
- Wounds
- Fatigue
- Morale
- Trauma or quirks
- Mission history
- Possible death

A veteran engineer dying should matter mechanically and emotionally.

---

## 8. Strategic Map

The campaign is divided into sectors. Each sector contains a graph of jump nodes, similar in spirit to FTL.

### 8.1 Node Types

- Distress beacon
- Pirate checkpoint
- Alien infestation
- Derelict vessel
- Civilian station
- Research facility
- Trade outpost
- Debris field
- Quarantine zone
- Boss/crisis node

### 8.2 Sector Types

- Civilian frontier
- Pirate belt
- Alien-infested nebula
- Corporate research zone
- Dead empire ruins
- Machine space
- Quarantine sector
- Final enemy-controlled core

### 8.3 Escalating Threat

The campaign should have a spreading enemy force or cosmic threat that advances as the player jumps.

Possible names:

- The Silence
- The Choir
- The Black Armada
- The Hunger Between Stars
- The Wake
- The Signal

Effects of escalation:

- Colonies fall.
- Trade prices rise.
- Enemy ships become stronger.
- Alien mutations appear.
- Panic increases.
- Friendly factions lose territory.
- Safe routes disappear.

---

## 9. Research and Technology

Research is unlocked by recovered materials and mission outcomes.

Research inputs:

- Alien corpses
- Captured officers
- Plasma cells
- Alien alloys
- Precursor navigation data
- Parasite samples
- AI combat cores
- Psionic tissue

Research outputs:

- New weapons
- Armor
- Ship modules
- Medical treatments
- Alien language options
- Sensors
- Drones
- Experimental movement systems
- Psionic or biological upgrades

Research should often involve tradeoffs.

Example:

> **Alien Reflex Booster**  
> Grants improved reaction fire and movement, but introduces a small chance of neurological instability after missions.

---

## 10. Resources

Core campaign resources:

- Fuel
- Salvage
- Credits
- Hull integrity
- Power capacity
- Medical supplies
- Ammunition
- Food or life-support reserves
- Research data
- Crew time/fatigue

The game should avoid unnecessary resource bloat at first. The MVP can start with:

- Fuel
- Salvage
- Hull
- Medical supplies
- Crew health

---

## 11. Factions

Possible factions:

- **Frontier Union:** civilians, stations, rescue targets.
- **Freebooters:** pirates, smugglers, mercenaries.
- **Corporate Science Fleet:** useful technology, questionable ethics.
- **Machine Remnants:** drones, AI ships, logic cults.
- **The Threat:** primary alien/cosmic force.
- **Independent Crews:** traders, refugees, rivals.

Faction relationships can be simple at first: hostile, neutral, friendly.

---

## 12. Art Direction

Recommended initial style:

> **2D top-down tactical rooms with clean pixel art or readable vector art.**

Priorities:

- Readable ship rooms.
- Clear line of sight and movement tiles.
- Strong silhouettes for crew and aliens.
- Visible system damage.
- Expressive but cheap-to-produce character portraits.

Avoid early overinvestment in high-fidelity art. The systemic gameplay is the hard part.

---

## 13. Audio Direction

Target mood:

- Low mechanical hums.
- Warning klaxons.
- Radio chatter.
- Hollow derelict ambience.
- Punchy weapon sounds.
- Distinct oxygen/fire/hull breach alarms.

Music should support tension rather than constantly dominate the scene.

---

## 14. Minimum Playable Prototype

### Prototype Title

**Space Game: Boarding Action Prototype**

### MVP Goal

Create one playable loop where the player chooses a hostile encounter, boards an enemy ship, completes a turn-based tactical mission, returns with salvage, and spends that salvage on one recovery choice.

The current thin whole-loop demo validates that complete sequence with a command screen, a hand-authored boarding mission, persistent consequences, and a return to the next jump. It does not yet claim the complete MVP: the physical player-ship layout, engine room, reaction fire, and upgrade path below remain deliberately deferred.

### Full MVP Must Include

- One player ship layout.
- One enemy ship layout.
- Four named crew members.
- Three enemy units.
- Turn-based tactical combat.
- Movement, attacks, overwatch/reaction fire if feasible.
- Fog of war or limited vision.
- Basic ship systems:
  - Bridge
  - Reactor
  - Medbay
  - Weapons
  - Engine room
- Persistent crew injury/death.
- Salvage reward.
- Repair or upgrade screen after mission.
- One strategic choice screen:
  - Fight/board
  - Salvage
  - Repair
  - Jump away

### MVP Should Not Include Yet

- Full galaxy simulation.
- Huge research tree.
- Procedural ship generation.
- Complex diplomacy.
- Multiplayer.
- Dozens of weapons.
- Perfect AI.
- Full art pipeline.

---

## 15. Vertical Slice Target

After the MVP, a vertical slice should include:

- Three sectors.
- A small sector map.
- Five to eight encounter types.
- Two enemy factions.
- One mini-boss ship.
- Eight to twelve research projects.
- Ten to fifteen items/weapons.
- Crew leveling and injuries.
- Ship upgrades.
- A campaign loss condition.

---

## 16. Decisions and Remaining Questions

### Approved prototype decisions

1. **Platform:** Browser-first prototype, playable directly at `spacegame.stevets.ai`.
2. **Technology:** TypeScript, Phaser 4, Vite, and Vitest.
3. **Tactical geometry:** 2D top-down square grid using action points.
4. **Architecture:** Deterministic game rules remain pure TypeScript under `src/sim`, independent of Phaser rendering.
5. **First slice:** A hand-authored tactical boarding encounter before broader campaign or ship-management systems.
6. **Collaboration:** Coding agents operate setup, dependencies, verification, Git, and GitHub while the human collaborator acts as creative director.
7. **Tactical visibility:** Living crew share explored terrain and current vision, while every attack still requires clear line of sight from the individual shooter. Opaque map cells block sight and fire symmetrically for crew and enemies.
8. **Whole-loop demo:** The first end-to-end demo connects a fixed strategic contact, the boarding mission, persistent crew and hull consequences, salvage, one recovery choice, and the next fuel-consuming jump. It deliberately repeats the same authored contact rather than pretending to be a broader campaign.

This demo targets the MVP loop in section 14; it is not the broader three-sector post-MVP vertical slice described in section 15.

These decisions define the current prototype, not an irreversible promise about a distant production version. Revisit them only when a concrete product requirement justifies the cost.

### Remaining creative questions

1. Should ship-to-ship combat be real-time with pause, turn-based, or abstracted?
2. Should the player ship interior be fully simulated during normal travel?
3. Should crew roles remain equipment-based or become more class-like?
4. How lethal should the campaign be?
5. Should the tone lean serious, comedic, or deliberately mixed?
6. Should later missions be hand-authored, procedurally generated, or hybrid?
7. Which tactical system should follow line of sight and fog of war: cover, overwatch, doors, or environmental hazards?

---

## 17. Initial Implementation Decision

The approved foundation is a **2D top-down square-grid browser prototype using TypeScript, Phaser 4, and Vite**. Rules live in a deterministic pure TypeScript simulation, independent of rendering. The first playable focuses on the tactical boarding loop; campaign systems follow after its combat is proven.

Suggested first implementation sequence:

1. Create a simple tactical grid.
2. Add crew and enemy units.
3. Implement movement and turn order.
4. Implement basic shooting and damage.
5. Add line of sight/fog of war.
6. Add one ship map.
7. Add mission win/loss conditions.
8. Persist crew health after mission.
9. Add salvage reward.
10. Add a basic repair/upgrade screen.
11. Add a tiny strategic jump screen.
12. Expand only after the loop is fun.

---

## 18. Repository Purpose

This repository is the public design and playable prototype home for **Space Game**. It contains:

- This specification.
- Pitch and design material.
- Prototype implementation plans.
- Art/audio direction.
- Playtest notes as development continues.
- The current Phaser 4 whole-loop browser prototype source.
- Automated simulation tests and GitHub Pages deployment.

The public site at `spacegame.stevets.ai` publishes the playable build, current design summary, complete specification, contributor onboarding, and a link back to the repository.
