# Space Game

A playable browser tactical prototype combining starship-survival pressure with persistent, lethal squad tactics.

> **FTL decides where disaster happens. X-COM decides who survives it.**

## Play

Visit [spacegame.stevets.ai](https://spacegame.stevets.ai), or run locally:

```sh
npm install
npm run dev
```

Select one of four crew, click cyan-highlighted tiles to move (1 AP per tile), or click a hostile within four tiles to fire (2 AP, 3 damage). End Turn runs the deterministic enemy phase. Eliminate all three hostiles before the boarding team is lost.

## Technology

- TypeScript and Phaser 4 presentation
- Pure deterministic tactical simulation (no Phaser dependency)
- Vite build and Vitest tests
- GitHub Pages deployment with the custom domain retained in `public/CNAME`

## Quality commands

```sh
npm test
npm run typecheck
npm run build
```

## Documents

- [Complete specification](SPEC.md)
- [Agent/contributor guide](AGENTS.md)
- The playable site's **Design** section preserves the public high-level pitch.

## Current slice

One hand-authored enemy ship, four named crew, three enemies, AP movement, ranged attacks, damage/death, deterministic AI, victory/defeat, and restart. Campaign persistence, fog of war, equipment, reaction fire, and strategy systems remain later milestones.

## License

A formal license has not yet been selected. Do not redistribute source or design content as an independently licensed work until one is added.
