# CLAUDE.md

**v2 is the live game (2.0.0, on `main` since 2026-10-23); `concept-v2.md`
is the source of truth.** Read it first, in particular §0 (current state), the session log (§14) and open
questions (§12). Follow its "Start Here" instructions. `concept.md` is the
frozen v1 record (tag `v0.8.0`): read the sections `concept-v2.md`
references, never edit it.

## Commands

- `npm run dev` — dev server
- `npm run build` — type check + production build; `npm run preview` to serve it
- `npm test` — Vitest (tests live in `tests/`, mirroring `src/sim/`)
- `npm run sim:balance` / `npm run sim:weapons` / `npm run sim:endless` — balance, weapon and endless sims (parallel shards, minutes)
- `npm run sim:fuzz` — balance fuzzer (hill-climbs costs, damage, enemy stats toward a flow target; `FUZZ_MINUTES=30` for longer, prints suggested numbers, changes no config)
- `npm run bench` — simulation performance check
- `npm run lint` / `npm run typecheck` / `npm run format`

## Rules (summary of concept-v2.md §10 and concept.md §9–§10)

- **No direct work on `main`** — every push to `main` redeploys the live
  game. Work happens on `v2` (the integration branch) and branches from it;
  `v2` is merged into `main` only on the user's explicit go.
- Work only on the next unfinished spike or phase (concept-v2.md §11); stop
  at the end of each and hand the build to the user. The v2 plan (Phases
  1–6) is complete; new work starts with planning it with the user.
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
