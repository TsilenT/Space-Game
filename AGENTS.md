# Space Game Agent Guide

This repository is designed to be developed with capable coding agents. Treat the human collaborator as the creative director, not as a terminal operator.

## Start Here

1. Read `README.md` and `SPEC.md` completely.
2. Inspect the repository and current environment before proposing setup work.
3. If major design questions remain unanswered, interview the collaborator in small, focused batches before choosing architecture or writing substantial code.
4. Record agreed decisions in `docs/decisions.md` and keep them distinct from unresolved questions.

## Operating Agreement

- Perform repository setup, dependency installation, file edits, builds, tests, and Git operations yourself when your environment permits it.
- Do not hand the collaborator shell, Git, or GitHub commands merely because that is easier than running them.
- Ask the collaborator to intervene only for authentication, permissions, unavailable hardware, or a creative/product decision.
- Explain meaningful engine and design tradeoffs in plain language. Do not make irreversible product decisions silently.
- Never expose credentials or commit secrets.
- Avoid destructive Git operations and do not overwrite unrelated collaborator work.

## Product Direction

Space Game combines FTL-style route pressure and ship management with persistent, lethal, original-X-COM-style tactical missions. Preserve these pillars:

- The ship is also the player's mobile base.
- Crew and ship damage persist and create stories.
- Tactical combat is systemic, dangerous, and readable.
- Resource pressure creates difficult choices.
- A successful mission may still leave costly consequences.

Godot 4 is the current recommendation, not an irrevocable decision. Confirm the target platform, engine, grid model, and first playable scope with the collaborator before establishing the implementation architecture.

## Development Method

- Prefer one thin, playable vertical slice over broad scaffolding.
- Break work into small reviewable increments with explicit acceptance criteria.
- Add automated tests where practical and always perform a real build or runtime verification.
- For visual changes, inspect the result at desktop and mobile sizes when applicable.
- Keep documentation current when decisions or setup requirements change.
- Do not add speculative frameworks, services, dependencies, or asset pipelines before the slice needs them.

## GitHub Workflow

Unless the collaborator asks for a different workflow:

1. Sync with the default branch and inspect existing work.
2. Create a focused feature branch.
3. Implement and verify one coherent slice.
4. Review the diff for accidental changes, secrets, generated junk, and scope creep.
5. Commit with a concise conventional message.
6. Push and open a pull request that summarizes the change, verification evidence, screenshots when relevant, and remaining decisions.

The agent should perform these steps directly. Report outcomes to the collaborator rather than converting the workflow into a command tutorial.

## Definition of Done

A task is complete only when:

- The requested behavior or artifact exists.
- Relevant tests/builds have actually run and their results are reported.
- Visual work has been inspected rather than inferred from source alone.
- Documentation reflects any durable decisions.
- The diff contains no unrelated changes or secrets.
- The collaborator receives a concise summary of what changed and what decision, if any, comes next.
