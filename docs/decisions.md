# Design Decisions

This document records durable choices separately from questions that still need creative direction. The full game pitch remains in [`SPEC.md`](../SPEC.md).

## Active decisions

### Prototype foundation

- The prototype is browser-first and uses TypeScript, Phaser 4, Vite, and Vitest.
- Tactical play uses a 2D top-down square grid with action points.
- Deterministic rules live under `src/sim` and do not depend on Phaser.
- The first playable remains a hand-authored boarding encounter; campaign and ship-management breadth follows after the tactical loop is proven.

### Shared tactical visibility — July 12, 2026

- Living crew combine their vision into one shared current view and one shared exploration history.
- Terrain that leaves current vision remains dimly remembered, but enemies are shown only while currently visible.
- The individual attacker—not merely another crewmate—must have clear line of sight to fire.
- Crew and enemies use the same deterministic sight rule. Opaque cells block sight and fire; an opaque boundary cell itself remains visible.
- A single exposed wall corner does not block a diagonal view, while two touching opaque corners do.
- Enemy pursuit remains deliberately simple and deterministic for this slice; enemy perception and memory are unresolved future work.

This choice keeps a four-person prototype readable while creating reusable foundations for doors, cover, smoke, sensors, hazards, and additional maps.

### Whole-loop demo — July 12, 2026

- The demo connects one strategic encounter, the boarding mission, persistent consequences and one ship-side recovery choice, then returns the player to the next encounter.
- It begins with 4 fuel, 1 salvage, and 75/100 hull. Boarding victory awards 4 salvage and causes 8 hull strain; every jump consumes 1 fuel.
- Recovery is one choice: spend 2 salvage to heal each living wounded crew member by 2 HP, spend 2 salvage to restore 15 hull, or bank the salvage.
- The encounter also exposes the specification's four strategic actions: board, scavenge, repair, and jump away. Scavenging trades 3 hull and 1 fuel for 1 salvage.
- Crew wounds and death persist. Tactical defeat, zero hull, or zero fuel ends the demo campaign; a new run is explicit.
- The same hand-authored contact repeats so persistence can be playtested without implying procedural content or a finished galaxy layer.
- Defer cover, overwatch, inventory breadth, research trees, procedural generation, and broad campaign simulation until that compact loop is playable and useful for creative direction.

### Closed doors — July 12, 2026

- The first tactical system layered onto shared visibility is closed doors, chosen over cover, overwatch, and environmental hazards for this slice.
- A closed door blocks sight and movement exactly like a wall. Any unit, crew or hostile, that moves onto a door cell forces it open at normal move AP cost; it stays open for the rest of the mission.
- Enemies can open doors, matching crew capability. This trades the "seal a door behind you" isolation tactic for a more symmetric, X-COM-style breach moment where either side can be ambushed opening one.
- Re-closing doors, a dedicated open action separate from moving, and any stealth/ambush bonus tied to doors remain deferred.

## Open creative questions

1. Should ship-to-ship combat be real-time with pause, turn-based, or abstracted?
2. Should the player ship interior be fully simulated during normal travel?
3. Should crew roles remain equipment-based or become more class-like?
4. How lethal should the later full campaign be beyond the demo's current tuning?
5. Should the tone lean serious, comedic, or deliberately mixed?
6. Should later missions be hand-authored, procedurally generated, or hybrid?
7. Doors are now in; which tactical system should follow next: cover, overwatch, or environmental hazards?
