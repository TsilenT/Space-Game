# Space Game

**Space Game** is a roguelite starship survival and squad tactics concept combining the route pressure and ship management of *Faster Than Light* with the persistent soldiers, research, and lethal tactical missions of the original *X-COM*.

> **FTL decides where disaster happens. X-COM decides who survives it.**

## Current Status

This repository currently contains the public design specification and a small static project site. Prototype implementation will follow after the design direction is refined.

## Documents

- [Specification](SPEC.md)
- [Coding-agent guide](AGENTS.md)
- [Public Site](https://spacegame.stevets.ai)

## Developer Onboarding

This repository expects collaborators to use a capable coding agent such as Codex or Claude Code. Open the repository in the agent and ask it to onboard you; the agent should inspect the project, handle technical setup and GitHub operations, and interview you about unresolved creative decisions. The canonical operating instructions are in [`AGENTS.md`](AGENTS.md), with a Claude Code entry point in [`CLAUDE.md`](CLAUDE.md).

## Core Idea

The player commands a battered starship through dangerous sectors, making strategic jump decisions, managing ship systems and crew, researching recovered alien technology, and resolving boarding or away missions as turn-based tactical combat.

## MVP Target

The first playable target is **Space Game: Boarding Action Prototype**:

- One player ship layout.
- One enemy ship layout.
- Four named crew members.
- Three enemy units.
- Turn-based tactical combat.
- Persistent crew injury or death.
- Salvage rewards.
- Basic repair or upgrade screen.

## License

Design text and documentation are currently shared for collaboration. A formal license should be selected before source code or production assets are added.
