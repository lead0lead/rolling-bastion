# CLAUDE.md

**This is the `v2` branch: `concept-v2.md` is the source of truth.** Read it
first, in particular §0 (current state), the session log (§14) and open
questions (§12). Follow its "Start Here" instructions. `concept.md` is the
frozen v1 record: read the sections `concept-v2.md` references, never edit it
here.

## Commands

- `npm run dev` — dev server
- `npm run build` — type check + production build; `npm run preview` to serve it
- `npm test` — Vitest (tests live in `tests/`, mirroring `src/sim/`)
- `npm run sim:balance` / `npm run sim:weapons` — balance and weapon sims (parallel shards, minutes)
- `npm run lint` / `npm run typecheck` / `npm run format`

## Rules (summary of concept-v2.md §10 and concept.md §9–§10)

- **No v2 work on `main`** — `main` is v1 and every push redeploys the live
  game. Never merge `v2` into `main` without the user's explicit decision.
- Work only on the next unfinished spike or phase (concept-v2.md §11); stop
  at the end of each and hand the build to the user. No v2 phase before the
  user has decided keep/drop for both spikes.
- Spikes: `v2-spike-<letter>-<topic>` from `v2`, quick and throwaway (logic in
  scenes, hard-coded numbers and missing tests are fine; the build and type
  check must still pass). Never merged; kept ideas are rebuilt in phases.
- Phases: `v2-phase-N-<topic>` from `v2`, merged into `v2` after the user has
  tried them. `v2` must always build and run.
- In phases: one commit per step; build, type check, lint and tests must pass
  first. Imperative short subject lines.
- Never change the git author identity. No history rewrites unless asked.
- `src/sim/` is pure TypeScript with **no Phaser imports** (lint-enforced).
  Fixed 60 Hz timestep, seeded RNG (`src/sim/rng.ts`) for all gameplay
  randomness, all tuning numbers in `src/config/` — no magic numbers in logic.
- Ask before adding any library not listed in concept.md §9.
- Decisions about feel and taste belong to the user; hand over a build instead
  of judging it. Report changed tuning values.
- Three failed fix attempts on the same problem → stop and report. Never weaken
  tests, type checks or lint rules to get past an error.
- Keep concept-v2.md current: update §0 after each step that changes project
  state; at spike/phase end and session end update §0, the session log, the
  affected sections and open questions. Commit doc updates with the code they
  describe.
