# Space Game

A browser whole-loop prototype for a game combining starship-survival pressure with persistent, lethal squad tactics.

> **FTL decides where disaster happens. X-COM decides who survives it.**

## Play

Visit [spacegame.stevets.ai](https://spacegame.stevets.ai), or run locally:

```sh
npm install
npm run dev
```

Choose among a distress call, starbase, and abandoned moon on every jump. Seeded encounters can reveal survivors, salvage, fuel, pirates, traps, or stranger hazards; tactical missions use multiple authored layouts and include both elimination and an eight-turn rescue. Crew health and death, recruits, a weapon upgrade, hull damage, credits, salvage, and fuel persist across the route.

## Technology

- TypeScript and Phaser 4 presentation
- Pure deterministic game simulation (no Phaser dependency)
- Vite build and Vitest tests
- GitHub Pages deployment with the custom domain retained in `public/CNAME`

## Get Started with a Coding Agent

Jimmy—or any new collaborator—does not need to learn the repository setup before contributing.

1. Install and sign in to [Codex](https://developers.openai.com/codex/app/) or [Claude Code](https://claude.com/product/claude-code).
2. Open either tool in a workspace and paste the prompt below. The agent should clone the repository if necessary, inspect it, install dependencies, and operate Git/GitHub itself.
3. Answer the agent's focused creative questions, play the result, and review its pull request.

```text
Help me contribute to Space Game: https://github.com/TsilenT/Space-Game

If the repository is not already open, clone it and open the project. Read README.md, SPEC.md, AGENTS.md, and the current source before proposing changes. The approved prototype stack is TypeScript, Phaser 4, Vite, and Vitest with deterministic game rules kept separate from Phaser rendering.

Handle workspace setup, dependencies, tests, Git branches, commits, pushes, and pull requests yourself whenever your environment permits. Do not give me a terminal tutorial. Treat me as the creative director: first run and inspect the current playable prototype, then interview me with one focused creative question at a time about what I want to add or change. Propose one small playable slice with clear acceptance criteria before implementing it. Do not replace the approved stack or begin broad campaign systems without discussing that choice with me.

After I approve the slice, implement it on a focused branch, run the full tests, typecheck, and production build, visually inspect gameplay changes on desktop and mobile, and open a pull request explaining what changed and how I can playtest it.
```

The canonical instructions for coding agents are in [`AGENTS.md`](AGENTS.md). Claude Code also receives a short entry point from [`CLAUDE.md`](CLAUDE.md).

### Manual local setup

If you prefer the conventional workflow, install [Git](https://git-scm.com/downloads) and [Node.js LTS](https://nodejs.org/), then run:

```sh
git clone https://github.com/TsilenT/Space-Game.git
cd Space-Game
npm ci
npm run dev
```

Vite will print the local play URL. Create a feature branch before editing, and use a pull request rather than pushing unfinished work directly to `main`. GitHub CLI is optional; install it from [cli.github.com](https://cli.github.com/) if you want to create and review pull requests from the terminal.

## Quality commands

Coding agents should run these directly before opening a pull request:

```sh
npm test
npm run typecheck
npm run build
```

## Documents

- [Complete specification](SPEC.md)
- [Recorded design decisions](docs/decisions.md)
- [Agent/contributor guide](AGENTS.md)
- The playable site's **Design** section preserves the public high-level pitch.

## Current slice

The current demo is a compact frontier route: spend fuel choosing among three signal types, resolve seeded strategic events or tactical missions, bring persistent wounds and recruits home, trade at a starbase, recover, and plot another jump. A small catalog of authored ship layouts provides controlled variety; procedural layout generation, deeper equipment, reaction fire, research, and broader sector simulation remain later milestones.

## License

A formal license has not yet been selected. Do not redistribute source or design content as an independently licensed work until one is added.
