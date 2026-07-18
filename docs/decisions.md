# Design Decisions

This document records durable choices separately from questions that still need creative direction. The full game pitch remains in [`SPEC.md`](../SPEC.md).

## Active decisions

### Prototype foundation

- The prototype is browser-first and uses TypeScript, Phaser 4, Vite, and Vitest.
- Tactical play uses a 2D top-down square grid with action points.
- Deterministic rules live under `src/sim` and do not depend on Phaser.
- The foundation began with one hand-authored boarding encounter; campaign and ship-management breadth follows in proven playable increments.

### Shared tactical visibility — July 12, 2026

- Living crew combine their vision into one shared current view and one shared exploration history.
- Terrain that leaves current vision remains dimly remembered, but enemies are shown only while currently visible.
- The individual attacker—not merely another crewmate—must have clear line of sight to fire.
- Crew and enemies use the same deterministic sight rule. Opaque cells block sight and fire; an opaque boundary cell itself remains visible.
- A single exposed wall corner does not block a diagonal view, while two touching opaque corners do.
- Enemy pursuit remains deliberately simple and deterministic for this slice; enemy perception and memory are unresolved future work.

This choice keeps a four-person prototype readable while creating reusable foundations for doors, cover, smoke, sensors, hazards, and additional maps.

### Whole-loop foundation — July 12, 2026 (encounter structure superseded)

- The first end-to-end build connected one strategic contact, boarding mission, persistent consequences, ship-side recovery choice, and next jump.
- It established persistent crew wounds and death, hull damage, salvage spending, fuel pressure, and explicit campaign loss/restart behavior.
- Its fixed contact, fixed reward, and board/scavenge/repair/withdraw screen were temporary validation tuning. The frontier route decision below replaces that encounter structure while preserving its persistence rules.

### Frontier route variety — July 12, 2026 (route presentation superseded)

- Navigation becomes the stable between-encounter phase. Every route presented one distress call, one starbase, and one abandoned moon; the galaxy map decision below replaces that flat three-card route with a persistent map while preserving every encounter, market, recruit, and mission rule in this section.
- Encounter rolls are deterministic and seeded. A new run draws a fresh seed, while an explicit `?seed=` URL reproduces a run for playtesting. Each outcome is rolled once on arrival and applied at most once, so rendering or inspection cannot reroll it.
- Distress calls can reveal a survivor, pirates attacking a civilian ship, or a deliberate trap. The rescue variant gives the squad through Turn 8 to reach the survivor before the ship explodes.
- Starbases provide a compact market for fuel, salvage exchange, a modest weapon improvement, and a possible mercenary offer. Credits remain distinct from salvage so trade and physical recovery have different pressures.
- Abandoned moons usually provide salvage, sometimes reveal a recruit, rarely contain fuel, and occasionally hide a hull-damaging space amoeba.
- Recruited survivors and mercenaries join the persistent roster, capped at six living crew for this slice, and can deploy on later missions. KIA records remain visible without blocking a replacement.
- Mission variety uses three validated, hand-authored layouts with seeded encounters. Unconstrained procedural ship generation is deferred until authored rooms and objectives establish useful generator constraints.

### Closed doors — July 12, 2026

- The first tactical system layered onto shared visibility is closed doors, chosen over cover, overwatch, and environmental hazards for this slice.
- A closed door blocks sight and movement exactly like a wall. Any unit, crew or hostile, that moves onto a door cell forces it open at normal move AP cost; it stays open for the rest of the mission.
- Enemies can open doors, matching crew capability. This trades the "seal a door behind you" isolation tactic for a more symmetric, X-COM-style breach moment where either side can be ambushed opening one.
- Re-closing doors, a dedicated open action separate from moving, and any stealth/ambush bonus tied to doors remain deferred.

### Galaxy map — July 16, 2026

- The campaign takes place on a seeded, deterministic galaxy map: 18 star systems in four concentric rings (a 7-system rim, then 6, then 4, then the Galactic Core), generated once per run under `src/sim/galaxy.ts`.
- Every non-core system is one of the existing encounter kinds — distress call, starbase, or abandoned moon — with its event seed fixed at generation, so an encounter's outcome is decided the moment the galaxy exists.
- Jumps go only to directly connected systems, and only laterally along the current ring or inward toward the core — never back outward, and never to a visited system. Because every system keeps at least one inward link and ring position never increases along a route, the ship can always reach the core and can never strand itself. This is the chosen answer to the dead-end question: generation and the movement rule prevent dead ends by construction.
- The player sees the mission type of every system adjacent to anywhere they have been; all other systems appear as uncharted positions on the map.
- Reaching the Galactic Core wins the run with a victory screen. The authored final battle at the core is deliberately deferred to a later slice.
- The navigation screen renders the galaxy as a clickable SVG map with the reachable systems repeated as accessible route cards; visited systems stay dimmed as a route history.

### Fire modes, accuracy, and cover — July 16, 2026

- Every armed unit fires in one of three X-COM-style modes from a 12-time-unit turn pool (movement costs 3 TU per tile): snap shot (4 TU, one round, 0.85 accuracy factor), auto shot (8 TU, three separately rolled rounds, 0.60 factor), aimed shot (10 TU, one round, 1.15 factor).
- Hit chance = soldier accuracy × mode factor, minus 3% per tile of distance beyond the first, minus 20% when a cover crate shields the target on its shooter-facing side, clamped to 5–95%. The maximum firing range is 8 tiles.
- Crates are a new map tile: they block movement but not sight, and grant the cover penalty. Each authored map carries a few.
- Shots resolve against a deterministic seeded RNG carried in the mission state, so a run remains reproducible from its campaign seed.
- Soldiers improve by shooting: each landed hit banks +2 accuracy at mission end, capped at +8 per mission and a 90 accuracy ceiling; the dead train nothing. Starting crew accuracy is role-flavored (Marine 55, Scout 60, Engineer/Medic 45); recruits roll 40–60 seeded.
- Enemies fire the same accuracy-rolled snap shots, so cover protects crew symmetrically, and they never fire from beyond vision range — any shooter that can hit a crew member is visible to that crew member in return. Crew may still take squad-sight shots at targets spotted by a teammate. Enemy fire modes beyond snap, ammunition, and reaction fire remain deferred.

### Projectiles, stray fire, and friendly fire — July 17, 2026

- Every round of fire is a physical projectile. The simulation records each shot (origin, aim point, actual impact, victim, deviation) and the renderer replays it: a tracer streaks from shooter to impact, hits flash with a floating damage number, and kills add an expanding ring. Input locks while shots resolve.
- A missed round deflects by an angle scaled to how badly the to-hit roll failed (±4° base plus 0.3° per point of overshoot, side rolled separately), then travels up to four tiles past its aim point.
- A stray round strikes the first thing in its deflected path: walls and closed doors, cover crates, enemies — or friendly troops. The intended target is excluded (that round already missed it). Friendly-fire hits deal full damage, can kill, persist like any wound, and never train the shooter's accuracy; a stray that happens to strike an enemy still counts as a hit for training.
- Enemy strays use the identical ballistics, so a pirate missing one crew member can wing another.
- All trajectories resolve against the existing seeded mission RNG, so replays of a seed remain identical. Shot spread beyond a single deflected ray, damage falloff along strays, and destructible terrain remain deferred.

### Destructible geometry — July 17, 2026

- Cover is no longer indestructible scenery: maps carry destructible structures with hit points — display banks (6 HP), storage units (9 HP), alien growths (12 HP), and control consoles (15 HP). At the base 3-damage rifle that is 2-3 rounds for easy pieces and 4-5 for tough ones.
- Structures block movement and grant cover while standing. Soldiers can fire on them deliberately — furniture does not dodge, so every round hits — and stray rounds from missed shots chew into whatever structure they strike. Enemy strays damage structures too.
- Damaged structures show their wounds: crack marks and a hit-point bar. At zero HP the piece collapses into visible wreckage that stays on the map but is walkable and grants no cover; strays pass over it.
- Structure kills never train a soldier's accuracy; only hits on living enemies do.
- Deferred: structures with mission consequences (destroying the survivor's console, chain explosions), repairable structures, and hull-breach tiles.

### Dedicated game screen — July 17, 2026

- The landing page is a pitch: hero copy, a Start Game button, and the design/onboarding sections below the fold. No game UI renders on it.
- Start Game switches to a full-viewport game screen: a slim top bar (brand, tactical key reference, Exit), the star map or battle map filling the main column, and one sidebar with ship and soldier information. Exit returns to the landing page without losing the run.
- The tactical canvas sizes to the viewport (capped by height at its 4:3 ratio) instead of a fixed center column, so battles use most of the screen; the galaxy map widens similarly. On narrow screens the sidebar stacks below the map.

### Big ships and a tactical camera — July 18, 2026

- Authored 12x8 maps are tripled at load into 36x24 tactical grids (`MAP_SCALE` in `src/sim/map.ts`): every authored tile becomes a 3x3 block, and spawns, room labels, system markers, and the rescue target snap to block centres. Rooms now read as real spaces several tiles across.
- Doors do not widen with the rooms: an authored door block becomes a one-tile-thick wall plane across the passage with a single door cell as its opening, flanked by the neighbouring rooms' floor. The door sits on the wall face, so it stays one space across and is visible from inside both rooms it connects. The renderer orients the door bar to the passage.
- Every scenario features doors: the boarding map keeps its Medbay and Weapons doors, the courier rescue gains a Dock-to-Commons door (the display bank beside it is a destructible alternate entrance), and the distress trap gains doors on both sides of the Crossway — the boarding team must open a door into the ambush room and another out of it.
- Per-tile tuning shrank to match the finer grid: move cost 3→1 TU, attack range 8→24 tiles, distance penalty 3→1% per tile, stray overshoot 4→12 tiles, vision 6→18. A turn still covers the same physical distance and the same authored-room feel.
- Enemies take up to three steps per enemy phase on the finer grid, stopping to fire as soon as a target is inside vision with line of sight, so their pace matches the crew's.
- The tactical canvas stays 800x600 and becomes a viewport onto the larger world. The camera centres on the selected soldier at mission start, pans smoothly when selection changes, follows the active soldier when they walk near the viewport edge, and pans to gunfire during enemy phases. Players can drag or mouse-wheel to look around freely; manual panning suspends auto-follow until the next selection.
- Turn banner and mission-end overlays are fixed to the screen, not the world. Scroll is always clamped to the map bounds.
- Deferred: camera zoom, edge-of-screen mouse scrolling, and a minimap.

## Open creative questions

1. Should ship-to-ship combat be real-time with pause, turn-based, or abstracted?
2. Should the player ship interior be fully simulated during normal travel?
3. Should crew roles remain equipment-based or become more class-like?
4. How lethal should the later full campaign be beyond the demo's current tuning?
5. Should the tone lean serious, comedic, or deliberately mixed?
6. When should the authored mission modules become a constrained procedural generator?
7. Doors, fire modes, and cover are now in; which tactical system should follow next: overwatch/reaction fire, ammunition, or environmental hazards?
8. What is the authored final battle at the Galactic Core, and what makes it mechanically distinct from a standard boarding?
