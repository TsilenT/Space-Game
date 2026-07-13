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

### Frontier route variety — July 12, 2026

- Navigation becomes the stable between-encounter phase. Every route presents one distress call, one starbase, and one abandoned moon; choosing a destination consumes one fuel.
- Encounter rolls are deterministic and seeded. A new run draws a fresh seed, while an explicit `?seed=` URL reproduces a run for playtesting. Each outcome is rolled once on arrival and applied at most once, so rendering or inspection cannot reroll it.
- Distress calls can reveal a survivor, pirates attacking a civilian ship, or a deliberate trap. The rescue variant gives the squad through Turn 8 to reach the survivor before the ship explodes.
- Starbases provide a compact market for fuel, salvage exchange, a modest weapon improvement, and a possible mercenary offer. Credits remain distinct from salvage so trade and physical recovery have different pressures.
- Abandoned moons usually provide salvage, sometimes reveal a recruit, rarely contain fuel, and occasionally hide a hull-damaging space amoeba.
- Recruited survivors and mercenaries join the persistent roster, capped at six living crew for this slice, and can deploy on later missions. KIA records remain visible without blocking a replacement.
- Mission variety uses three validated, hand-authored layouts with seeded encounters. Unconstrained procedural ship generation is deferred until authored rooms and objectives establish useful generator constraints.

## Open creative questions

1. Should ship-to-ship combat be real-time with pause, turn-based, or abstracted?
2. Should the player ship interior be fully simulated during normal travel?
3. Should crew roles remain equipment-based or become more class-like?
4. How lethal should the later full campaign be beyond the demo's current tuning?
5. Should the tone lean serious, comedic, or deliberately mixed?
6. When should the authored mission modules become a constrained procedural generator?
7. After the end-to-end demo loop is working, which tactical system should follow visibility: cover, overwatch, doors, or environmental hazards?
