# Tactical Foundation Plan

## Goal
Turn the documentation-only repository into a deployed, playable browser foundation using Phaser 4, TypeScript, and Vite.

## Scope

### 1. Web project foundation
- Configure Vite, TypeScript, Phaser 4, Vitest, formatting/lint scripts where practical, and GitHub Pages deployment compatible with the custom domain.
- Preserve the useful design-site content and expose it from the playable app.
- Update README, SPEC engine decision, and contributor guidance.

### 2. Pure tactical simulation
- Square grid with explicit walkability and room identities.
- Four named player crew and three enemies.
- Turn state, action points, selection, legal movement, attacks, damage, death, victory, and defeat.
- Keep rules deterministic and independent of Phaser rendering.
- Unit tests for core legal/illegal actions and end conditions.

### 3. Playable Phaser presentation
- Render one readable enemy-ship boarding map with rooms, walls, doors or passages, systems, units, legal movement highlights, and selection.
- Click crew, click legal tile to move, click an in-range enemy to shoot.
- End Turn and Restart controls.
- Enemy phase with simple deterministic movement/attacks.
- HUD with objective, current phase, action points, crew/enemy health, and concise controls.
- Responsive desktop/mobile layout and a distinct space/retro-tactical visual identity using generated vector/CSS/canvas shapes rather than external copyrighted assets.

### 4. Verification
- Run unit tests, typecheck, and production build.
- Run the real app and capture/inspect desktop and mobile screenshots.
- Correct visual or runtime issues found.
- Review implementation for spec compliance and code quality.
- Commit, push, and verify GitHub Pages/live site.

## Initial acceptance criteria
- A visitor can load the site and start playing without setup.
- The player can select any living crew member, move within AP limits, and attack an enemy in range.
- The enemy takes a visible turn after End Turn.
- Units can die and the mission reaches victory or defeat.
- Restart produces a clean initial state.
- Simulation tests, TypeScript checking, and production build pass.
- Existing public design information remains accessible.
