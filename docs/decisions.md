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

### Next slice favors the whole loop — July 12, 2026

- After this visibility foundation, prioritize a thin, representative slice of the whole game over additional tactical depth.
- The demo should connect one strategic encounter, the boarding mission, persistent consequences and a small ship-side recovery choice, then return the player to a next-step decision.
- Defer cover, overwatch, inventory breadth, research trees, procedural generation, and broad campaign simulation until that compact loop is playable and useful for creative direction.

## Open creative questions

1. Should ship-to-ship combat be real-time with pause, turn-based, or abstracted?
2. Should the player ship interior be fully simulated during normal travel?
3. Should crew roles remain equipment-based or become more class-like?
4. How lethal should the campaign be?
5. Should the tone lean serious, comedic, or deliberately mixed?
6. Should later missions be hand-authored, procedurally generated, or hybrid?
7. After the end-to-end demo loop is working, which tactical system should follow visibility: cover, overwatch, doors, or environmental hazards?
