# CLAUDE.md

**`concept.md` is the source of truth.** Read it first, in particular §0
(current state), the session log (§14) and open questions (§12). Follow its
"Start Here" instructions.

## Commands

- `npm run dev` — dev server
- `npm run build` — type check + production build; `npm run preview` to serve it
- `npm test` — Vitest (tests live in `tests/`, mirroring `src/sim/`)
- `npm run lint` / `npm run typecheck` / `npm run format`

## Rules (summary of concept.md §9–§10)

- Work only on the next unfinished phase; stop at the end of each phase and
  hand the build to the user. Never build past the decision milestone (Phase 3)
  without explicit go-ahead.
- Branch per phase: `phase-N-<topic>`; merge into `main` only after the user has
  tried it. `main` must always build and run.
- One commit per step; build, type check, lint and tests must pass first.
  Imperative short subject lines.
- Never change the git author identity. No history rewrites unless asked.
- `src/sim/` is pure TypeScript with **no Phaser imports** (lint-enforced).
  Fixed 60 Hz timestep, seeded RNG (`src/sim/rng.ts`) for all gameplay
  randomness, all tuning numbers in `src/config/` — no magic numbers in logic.
- Ask before adding any library not listed in concept.md §9.
- Decisions about feel and taste belong to the user; hand over a build instead
  of judging it. Report changed tuning values.
- Three failed fix attempts on the same problem → stop and report. Never weaken
  tests, type checks or lint rules to get past an error.
- Keep concept.md current: update §0 after each step that changes project
  state; at phase end / session end update §0, the session log, as-built
  sections and open questions. Commit doc updates with the code they describe.
