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
- Three failed fix attempts on the same problem → stop and report. Never weaken
  tests, type checks or lint rules to get past an error.
- Keep concept-v2.md current: update §0 after each step that changes project
  state; at spike/phase end and session end update §0, the session log, the
  affected sections and open questions. Commit doc updates with the code they
  describe.

macOS-sed mag das \n nicht; nehme stattdessen Edit.