# Rolling Bastion v2 (experimental) — Concept & Build Plan

> The same driving grid-city survivor-like, revamped: the city grows freely
> from a fixed Core on an unbounded grid, the run is a series of waves with a
> shop in between, and coins replace levels. Placement gets clearer to read
> and much easier to edit, and after the boss the run can keep going.

This document is the **source of truth for v2** and the starting point for
every Claude Code session on the `v2` branch. `concept.md` is the **frozen
record of v1** (v0.8.0, live on `main`): read it for everything this document
says is "unchanged from v1", but never edit it on the `v2` branch.

Short name stays `rolling-bastion`. v2 is experimental: ideas are first tested
in quick **spikes**, and only the ones the user keeps are rebuilt properly.

---

## Start Here — Instructions for Claude Code

When the user says something like "look at concept-v2.md and start" or
"continue", do this, in order:

1. **Read this whole document,** then the v1 sections it references in
   `concept.md`. Read §0, the last session log entries and the open questions
   again; they tell you where v2 stands.
2. **Check the repository state:** `git status`, `git log --oneline -15`, the
   current branch (v2 work happens on `v2` or a branch made from it, **never
   on `main`**), the commit author identity, and whether build and tests pass.
3. **Tell the user in a few sentences** where v2 stands and what you will do
   next, according to §11. If §0 and the repository disagree, say so and trust
   the repository.
4. **Work on the next unfinished spike or phase only** (§11). Spikes and phases
   follow different rules (§10); know which one you are in.
5. **Stop at the end of each spike and phase** and hand the build to the user.
   Never start a v2 phase before the user has made the keep-or-drop decision
   for both spikes (§0 "Decision milestone").
6. **Follow "How We Work" (§10) without exception.**
7. **Ask instead of guessing** when something is unclear, contradictory, or
   marked as an open decision. Ask one question at a time.
8. **Follow "When Things Go Wrong"** (unchanged from v1, `concept.md` §10) as
   soon as a problem resists a first fix.

**Keeping this document current is part of the job.** A new session starts
with no memory of earlier ones; this file and the git history are all it has.

- After every completed step that changes the state of v2, update §0 in the
  same step.
- At the end of every spike or phase, and before ending any session, update:
  §0, the session log, the content sections (mark built parts "(as
  implemented)"; for a spike, write what the spike showed, not "as
  implemented"), and the open questions.
- Record every decision the user makes in the relevant section and in the
  session log, with the reason when one was given. A dropped spike idea moves
  to §13 with the reason.
- Never delete the plan for spikes or phases that are not built yet.
- Commit document updates together with the code they describe.

---

## 0. Current State (read this first)

| | |
|---|---|
| **Status** | Phases 1 (board and land) and 2 (editing UX) done and **merged into `v2`** (2.0.0-alpha.2). v1 (v0.8.0) is untouched on `main` and live. |
| **Current step** | Phase 3 (readability and synergies) starting on `v2-phase-3-readability`. |
| **Next step** | Finish Phase 3 and hand it over. Then Phase 4, the weapons rework (§2.12): brainstorm its details with the user one question at a time before building. Then Phase 5 (endless and balance), Phase 6 (polish and hosting). |
| **Decision milestone** | Passed 2026-10-21 (spike verdicts). Whether v2 ever replaces v1 on `main` is a separate, later user decision (§12). |
| **Branches** | `main` = v1, live (every push redeploys). `v2` = v2 integration branch (not deployed). Spikes `v2-spike-<letter>-<topic>`, phases `v2-phase-N-<topic>`, both from `v2`. |
| **Version** | `2.0.0-alpha.2` on `v2`. Phase 3 will be `2.0.0-alpha.3`. Labels: spikes `2.0.0-spike.a`, `2.0.0-spike.b`; phases `2.0.0-alpha.N`. |
| **Play** | v2: local only (`npm run dev` on a v2 branch). v1: https://lead0lead.github.io/rolling-bastion/ |
| **Target** | Unchanged from v1: desktop browsers, keyboard + mouse, 1280×720 and up. |
| **Last updated** | 2026-10-22 (phase order changed, Phase 3 started) |

---

## 1. Core Concept

Unchanged at heart: a survivor-like where you only steer a moving city built
from polyomino pieces; every tile acts automatically, and everything must stay
connected to the Core. See `concept.md` §1. XP, level-ups and the 12:00 run
with the Colossus stay as in v1 (the wave/shop loop was tried in Spike A and
dropped, §13).

**What v2 changes (decided by the user 2026-10-21, revised after the
spikes):**

1. **Board and land.** The Core sits fixed at (0, 0) on an open-ended grid.
   You build on a **board** of buildable cells that starts as v1's 6×6
   square. At set levels you choose one of several equal-size **land
   shapes** and attach it anywhere along the board's edge, so the board
   grows into a shape of your choosing (Spikes B and B2, §2.1).
2. **Endless after the boss.** "Keep going" after the win continues with
   scaling difficulty, returning Colossi and more land (§2.11).
3. **Readability:** where a piece starts and ends, which tiles a support tile
   affects, and how chains work must all be obvious.
4. **Editing UX:** multi-select, box select, group move and rotate, undo.
5. **Synergy changes:** filled rows/columns are removed; Generators and
   Engines can form chains; Magnets pulse.

**Design pillars:** v1's pillars stay (space is the resource, calm puzzle /
hectic drive, readable at a glance, power fantasy first, connected or useless).
v2 adds two:

- **Edit without friction.** Rearranging a big city must take as few actions
  as rearranging a small one. If an edit needs more than a few clicks, the
  build screen is missing a tool.
- **Shape the board, don't puzzle it.** Land is a few big, clear choices per
  run; building the board must never become a second piece puzzle (user,
  2026-10-21).

**Targets**

- Normal run: 12:00 plus the boss, as v1.
- Endless: playable until the city is overwhelmed; 60 fps at 600 enemies with
  a city of up to ~200 tiles.
- Content: v1's 12 tile types, 21 pieces, 6 enemies and the Colossus, plus
  the land shapes. Tile reworks (first: the Saw, §2.9) are planned with the
  user.

---

## 2. Core Mechanics

All numbers are **starting values to tune**, kept in `src/config/`. Anything
not mentioned here works as in v1 (`concept.md` §2).

### 2.1 Board and land (v2, as implemented in Phase 1)

- Cells are integer coordinates; the **Core is fixed at (0, 0)**: it cannot
  be moved or scrapped. Every other group can be moved freely in a build
  pause. Coordinates may be negative; there is no grid size.
- The **board** is the set of buildable cells. It starts as a 6×6 square
  with the Core where v1 had it (cells −3…2 on both axes, 36 cells).
  Pieces may only be placed on board cells.
- **Land:** the level-ups at levels **8, 15, 22, 29, 36** (`LAND.atLevels`)
  first offer **3 land shapes of 12 cells** each, drawn at random from block
  3×4, strip 2×6, big L, big T, plus, U and thick Z. You pick one (click or
  1–3), rotate it (R / right-click) and place it anywhere where **no cell is
  already board and at least one cell shares an edge with the board**; the
  whole shape shows red where it can't go. Then the normal piece pick
  follows in the same pause. Board 36 → 96 cells over a run.
- Pacing: the balance sim's bots reach those levels at about 2:10, 3:30,
  5:35, 7:20 and 9:05 (they collect every gem, so players are later). The
  first try (levels 5/9/13) put all land in the first three minutes and was
  too fast early, too rare late (user, 2026-10-21).
- There are no timed grid expansions any more.
- One cell = 32×32 world pixels (unchanged). The city never rotates. The
  city's world position is the centre of the Core's cell (v1 used the grid
  centre).
- Implementation: sparse maps keyed by cell (no fixed-size arrays), so a
  spread-out city costs only its tile count.

As implemented (Phase 1): `CityState.board` is a `Set` of `cellId`s
(`src/sim/grid.ts`; ids stay below 2^30 so they are small integers in V8,
coordinates limited to ±16383); placement problems are `off_board` /
`overlap`. Land in `src/config/land.ts` and `src/sim/land.ts` (`rollLand`,
`landCells` centres the rotated shape's bounding box on the pointer cell,
`landProblems`, `addLand`); `World.pendingLand` counts land level-ups,
queued by `addXp`. In a build session (`src/sim/build.ts`) `land` /
`heldLand` hold the land step; `pickLand`, `landPreviewAt`, `placeLandAt`,
`offerLand` (debug); while land is pending, offers, upgrades, Repair Core,
reroll and moving groups are refused and confirm is blocked (`'land'`).
The Core can't be picked up. The run cache (`World.cache.cells`) and
synergies are sparse maps; chains are found by walking each line from its
first tile. The world origin is the Core's cell centre.

How the spikes got here: free infinite growth (Spike B) was disliked: no
reason to grow one way rather than another. Class starting shapes and paid
edge expansions were discussed, then replaced by land shapes at set levels
(Spike B2, kept 2026-10-21). Class starting shapes and edge buttons are
parked in §13.

### 2.2 Pieces and tiles

Unchanged from v1.

### 2.3 Placement and rearranging (build pause)

As v1 (`concept.md` §2.3), except:

- Cells must be on the board (instead of inside the grid bounds) and empty.
- A land level-up pause starts with the land step (§2.1); offers, upgrades,
  Repair Core and reroll appear once the land is placed. Confirm is blocked
  until then ("Place the new land first").
- Editing tools: §3.1.

### 2.4 Connectivity (as implemented in Phase 1)

- Rules unchanged from v1 (flood fill from the Core, offline tiles).
- **Bridge detection is linear time:** Tarjan articulation points with an
  iterative DFS rooted at the Core (`findBridges`), instead of v1's brute
  force; a property test checks it against the brute force on 200 random
  cities, another a 3000-tile snake.

### 2.5 Movement

Unchanged from v1 (150 px/s, −2% per tile above 10, floor 55%, Engines +12%
each). Engine chains (§2.7) are the counterweight to big cities.

### 2.6 Combat

Unchanged from v1 (win: kill the Colossus; enrage at 14:00). Lose: the Core
is destroyed, also in endless.

### 2.7 Synergies (v2)

1. **Exposure:** unchanged.
2. **Adjacency buffs:** unchanged rules and caps.
3. **Chains:** v1 weapon chains unchanged (3+ identical online tiles with the
   same facing in an unbroken straight line: +50% / +100% / +150% for
   3 / 4 / 5+). **New, support chains:** 3+ online **Generators** or
   **Engines** in an unbroken straight line (facing ignored, since they have
   none) multiply their own effect by the same tiers:
   - Generator chain: each chained Generator gives its neighbours
     +25% × (1 + chain bonus) fire rate. The receiving tile's cap stays +75%
     (Claude's call, see §12).
   - Engine chain: each chained Engine adds +12% × (1 + chain bonus) of base
     speed.
   - Drawn like weapon chains (link line through the centres), in the
     support tile's colour.
4. **Filled rows/columns: removed** (decided 2026-10-21; an irregular board
   has no clear "full row"). This also removes their max HP bonus. Max HP
   now only comes from levels and Hull L3.

How bonuses combine (v1 formula without the filled-line term): weapon damage =
base × level multiplier × (1 + chain bonus + Generator L3 bonus).

As implemented (Phase 3): `LINES.supportChainTypes` lists the chaining
support types; `findChains` (`src/sim/synergies.ts`) walks weapons and those
types alike (`chainsType`), facing ignored for supports. A chained
Generator's fire rate gift and a chained Engine's speed bonus are multiplied
by 1 + chain bonus; the Generator L3 damage gift is not. `TileMods.chainBonus`
holds the bonus for every chained tile; only weapons add it to damage.
Chain lines use the tile's colour, so support chains look like weapon
chains.

### 2.8 XP, levels and offers

Unchanged from v1 (`concept.md` §2.8), plus the land step at land levels
(§2.1). (The v2 coins/waves/shop design was dropped after Spike A; §13.)

### 2.9 Tile catalogue

Unchanged from v1 (`concept.md` §2.9), except:

| Tile | v2 change |
|---|---|
| **Magnet** | Function: **pulse.** Every 8 s, each online Magnet pulls every XP gem within 300 px of **its own tile** to the city (gems fly at 600 px/s). Magnets far apart cover more ground than Magnets side by side. A visible ring expands from the Magnet on each pulse. Each Magnet keeps its own timer (starting at a random 0–8 s offset), so pulses don't line up. Level gain: +20% radius per level. **L3:** pulse every 6 s. **L5:** base radius 450 px. (Decided "pulse" 2026-10-21; numbers and perks are Claude's drafts.) |
| **Generator / Engine** | Can form chains (§2.7). |
| **Saw** (rework requested, not yet planned) | The user finds Saws underwhelming (2026-10-21): instead of only damaging enemies they touch, a Saw should be the origin of a **blade that rotates around it** with a larger hitbox, to make melee builds fun and viable. Details and the phase to do it in: to plan with the user (§11, §12). |

Magnet as implemented (Phase 3): the pulse replaces v1's pickup radius
bonus and its L3 drift / L5 recall perks. `TILES.magnet.pulse` holds the
numbers (8 s, 300 px, gems 600 px/s); perks `pulseInterval` (L3, 6 s) and
`pulseRadius` (L5, base 450 px); level gain ×(1 + 20% per level) on the
radius. `pulseMagnets` (`src/sim/progression.ts`) keeps one timer per online
Magnet in `World.magnetTimers` (first value drawn from the seeded RNG,
pruned in `cityChanged`) and emits a `magnetPulse` event; the run screen
draws a teal ring growing to the radius over 0.6 s (`FX.magnetPulse`;
static fade with reduced motion) and plays the quiet `gem` sound.

### 2.10 Firing arcs

Unchanged from v1 (`concept.md` §2.10).

### 2.11 Endless (v2, draft for Phase 5)

- The win screen after the boss offers **"Keep going"** and **"End run"**
  (decided 2026-10-21).
- Keep going (Claude's draft, to confirm in Phase 5, user agreed the
  outline 2026-10-21): spawns resume at the v1 12:00 budget; enemy HP and
  contact/shot damage grow **×1.12 per minute** past the boss kill
  (compounding, on top of v1's +6%/min HP growth); **the Colossus returns**
  every 5 minutes with HP ×1.5 per return, alongside the normal spawns.
- **Land keeps coming** every 7 levels after level 36 (43, 50, …), so the
  board can grow without limit in endless (user agreed 2026-10-21).
- Elite conversion above 600 live enemies is unchanged; elites become the main
  way the late game gets harder.
- The run ends when the Core is destroyed. The end screen reports time
  survived, "Boss defeated", level and kills.

### 2.12 Weapons rework and rebalance (Phase 4; user request 2026-10-22, not planned in detail)

The user asked for a new step that reworks and rebalances the weapons and
other tile designs. Their notes, to be turned into a design with them
(brainstorm one question at a time, 2–3 options with a recommendation):

- **Every weapon must feel impactful**, and there should be **synergies
  between weapon types** (not only same-type chains).
- **Gatling is very oppressive** right now. (Fits the Phase 1 balance
  sim: Gatling builds win easily.)
- **Mortar always misses.** (Cause to check first: the shell is lobbed at
  where the target was, and enemies have moved on when it lands; options
  include leading the target, faster shells or a bigger blast.)
- **Saw rework** (§2.9): a blade rotating around the Saw with a larger
  hitbox, to make melee builds fun and viable. (The Saw wall build lost in
  the Phase 1 sim.)
- **New weapon ideas** from the user: a **piercing crossbow**; a
  **close-range flamethrower** with damage over time; a **melee spear**
  that keeps thrusting forward out of its tile, piercing every enemy it
  touches.
- "Other designs" are in scope too: ask the user which other tiles to
  revisit.

Approach to propose: measure the current state first (balance sim damage
shares, kills per weapon, Mortar hit rate), agree targets with the user,
then change numbers and mechanics in config with tests per weapon, and
re-run the sim. New weapons need icons, barrels and projectiles in the
existing style, and sounds from the existing set.

---

## 3. Controls & Camera

**Combat:** unchanged from v1 (WASD/arrows, Esc/P pause, M mute, F1 debug).

**Build pause (v2 additions to v1's keys):**

| Action | Input |
|---|---|
| Land: pick / rotate / place | Click a land card or 1/2/3; R or right-click; click on the board view |
| Pick up a group (as v1) | Click a tile: carries its group, or the whole selection if the tile is selected (user's choice 2026-10-21; selecting is Shift+click, box and Ctrl+A) |
| Add/remove a group from the selection | Shift+click |
| Box select | Drag on empty board space (selects every group that has a tile in the box; Shift adds); a plain click there clears the selection |
| Select all (except Core) | Ctrl+A |
| Move selection | Drag any selected tile; or click once to carry it, click again to drop (as v1) |
| Rotate held selection | R or right-click, 90° around the grabbed cell |
| Scrap selection | X or Delete, or drop on the scrap zone |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z (also Ctrl+Y) |
| Clear selection / put held back | Esc (puts the held group back first; otherwise clears the selection) |
| Pan | WASD / arrows, or middle-drag. A key only pans after a fresh press in the pause, so keys still held from driving don't scroll (user feedback 2026-10-21). |
| Zoom | Mouse wheel (toward the pointer) |
| Fit board to view | F or Home |
| Bridges / all arcs | B / V (unchanged) |
| Rules legend | ? or H (Phase 3) |
| Confirm | Enter / button |

### 3.1 Editing rules (v2, as implemented in Phase 2)

- A **selection** is a set of groups. Moving a selection keeps the relative
  positions of its groups; a drop is valid only if every cell is on the
  board and empty (outside the selection). An invalid drop keeps the
  selection in hand, as in v1. The Core is never part of a selection.
- Selected groups get a bright outline; the held selection floats with a
  shadow.
- **Undo** covers everything in the current build pause: land placement,
  taking an offer or upgrade, Repair Core, placements, moves, rotations,
  scraps and rerolls. History is cleared when the pause closes.
- As implemented (`src/sim/build.ts`, `src/sim/grid.ts`): a held group can
  hold tiles of several groups (`liftGroups`; each tile keeps its group).
  `BuildSession.selection` holds group ids; `toggleSelectAt`, `selectBox`,
  `selectAll`, `clearSelection`, `scrapSelection`; picking up a selected
  tile lifts the selection, which stays selected after the drop; picking
  up another group clears it. Scrapping counts every piece (XP refund
  each). Undo/redo: the session snapshots tiles, board, ids and the pause's
  choices before each change (`history` / `future`); a held group's
  pick-up state is recorded once it is dropped or scrapped; undo while
  holding only puts the held group back; undo/redo clear the selection.
  Rerolls are counted in the session (`rerollsUsed`) and charged by
  `applyBuildResult`, so undone rerolls come back. Build screen: selected
  groups get a blue outline, the box is drawn while dragging, a held
  selection floats with a soft shadow, the scrap zone shows "n pieces",
  the status panel shows the undo/redo counts. X and Delete scrap (held,
  else selection, else hovered); the debug "destroy hovered tile" key
  moved from Delete to K.

### 3.2 Camera (v2, as implemented in Phase 1)

- **Combat:** follows the Core with light smoothing; zoom changes smoothly
  so the city's bounding box takes up at most **35%** of the view's height
  and width, between zoom 0.4 and 1 (below 0.4 enemies stop being readable;
  see §12). The spawn ring and "far behind" checks use the current view
  size (as v1 already does).
- **Build pause:** the board has its own view between the side panels;
  opens fitted to the board with ~3 empty cells of margin; pan/zoom freely
  (zoom 0.3–3); F refits.
- As implemented: combat camera in `RunScene.targetZoom` (`CAMERA.cityFrame`
  0.35, `minZoom` 0.4, `maxZoom` 1), following the Core. Build screen:
  the main camera is the board view (viewport x 300–995, y 70–720), a
  second full-screen camera draws the UI; board and UI objects live in two
  layers, each ignored by the other camera. Pan 700 px/s, wheel ×1.15 per
  step toward the pointer, fit margin 3 cells (`BUILD_VIEW`). A pan key
  only pans after a fresh (non-repeat) press during the pause. Line widths
  in the board view stay constant on screen.

### 3.3 Readability (v2 additions; v1 rules still apply; Phase 3)

- **Board:** board cells are filled and outlined strongly; cells off the
  board show only faint lines (Phase 1).
- **Piece outlines:** a thick (3 px) dark border wherever a tile meets a
  tile of another group or empty space; a thin (1 px) seam between tiles of
  the same group. You can then see at a glance where a piece starts and
  ends. In the build pause and in combat.
- **Buff pips:** every tile shows one small pip per support type currently
  buffing it (Generator, Shield Emitter, Repair Bay), in that support tile's
  colour, in a fixed corner order. In the build pause and in combat.
- **Hover a support tile** (build pause): the tiles it affects get a tinted
  overlay and a short arrow from the source. **Hover any tile:** the
  tooltip lists what it receives, with numbers ("Generator +25% fire rate
  (×2)", "Chain ×3 +50% damage").
- **Chain preview:** while holding pieces, cells that would form or extend a
  chain show the link line live (as v1) **plus a floating label** with the
  result ("Chain 3: +50% damage").
- **First-time hint:** the first time in a session that a chain becomes
  possible, a short hint card explains it: "Line up 3 or more identical tiles
  facing the same way: each gets +50% damage. Generators and Engines chain
  too." Not saved (no saving, unchanged).
- **Rules legend** (? / H): one panel listing chains, adjacency buffs,
  bridges and offline tiles, with small drawn examples.

As implemented (Phase 3, in progress):
- Piece outlines: `drawPieceOutlines` (`src/render/lines.ts`), ink at 90%
  for edges (3 screen px) and 35% for seams (1 px). The build screen draws
  them every frame (they replace Phase 2's faint group outline); the run
  screen draws them with the chain lines, redrawn when the city changes or
  the zoom has drifted 5%, so widths stay constant on screen.

---

## 4. Content & Structure

### 4.1 Run structure (v2)

v1's 12:00 timeline (`concept.md` §4.1) without the grid expansions at
4:00 and 8:00: the board grows by land at levels instead (§2.1). Endless:
§2.11.

### 4.2 Piece pool

Unchanged from v1 (21 pieces, pentominoes from 4:00).

### 4.3 Enemies

Unchanged from v1 (`concept.md` §4.3), except endless scaling (§2.11).

---

## 5. Story, Tone & Text

Unchanged from v1. New draft text (user's to rewrite): "New land!", "Place
the new land first", "Keep going", "End run", the chain hint in §3.3.

## 6. Look

Unchanged from v1 (`concept.md` §6), plus the board drawing, the
readability additions in §3.3 and the Magnet pulse ring.

## 7. Audio

Unchanged from v1. New events reuse existing sounds: land placed (the grid
expansion sound), Magnet pulse (a quiet existing sound, rate-limited).
Claude's call.

## 8. UI, Progress & Saving

- **HUD:** as v1, with "Board n · Tiles n · Speed n%" instead of the grid
  size; no "GRID EXPANDED" banner.
- **Build pause:** the board view in the middle (pan/zoom), cards and
  options at the side as v1; land cards first at land levels.
- **End screen:** as v1; the final city is drawn on its board.
- **Saving:** none (unchanged). Settings key unchanged.
- **Debug** (v1 keys, changes): `F2` = level-up with land (was: grow the
  grid); in the build screen `F2` offers land; `F3` fills every empty board
  cell with Gatlings. `?sandbox=1` opens the build screen alone.

---

## 9. Tech Stack & Code Structure

Unchanged from v1 (`concept.md` §9): TypeScript, Phaser 3.90.0, Vite,
Vitest, ESLint/Prettier. Same rules: `src/sim/` stays Phaser-free, 60 Hz fixed
timestep, seeded RNG, all tuning in `src/config/`. No new libraries without
asking.

Expected changes to the code structure (rebuilt in phases, not in spikes):

- `sim/grid.ts`: sparse open-ended grid with a board; no bounds, no
  expansion.
- `sim/land.ts` + `config/land.ts`: land shapes, offers, placement rules.
- `sim/connectivity.ts`: Tarjan bridges.
- `sim/build.ts`: land step; later selection, group move/rotate, undo.
- `sim/synergies.ts`: no filled lines; support chains (Phase 3).
- `bench/balance.sim.ts`: bots place land (Phase 1: simple; Phase 5: as
  part of balance).

---

## 10. How We Work

v1 rules apply (`concept.md` §10, including "When Things Go Wrong"), with
these v2 changes:

### Branches

- `main` is v1 and is live: **no v2 work on `main`**, and `v2` is never
  merged into `main` without the user's explicit decision (§12). v1 fixes,
  if any, happen on `main`; merge `main` into `v2` afterwards when useful.
- `v2` is the integration branch for v2. It must always build, type check,
  lint and pass tests.
- Phases: `v2-phase-N-<topic>` from `v2`, merged into `v2` after the user has
  tried them.
- Spikes: `v2-spike-<letter>-<topic>` from `v2`. **Spikes are never merged.**
  The branch is kept (pushed) as a record; only the documentation of what the
  spike showed is committed to `v2`.

### Spike rules (quick, throwaway prototypes)

- Goal: answer the spike's question (§11) with a playable build, as fast as
  possible.
- Allowed in spikes: logic inside Phaser scenes, hard-coded numbers, missing
  tests, rough UI. Not allowed: breaking the build or type check (the user
  must be able to run it), changing the author identity, adding libraries
  without asking.
- Existing tests may fail where a spike deliberately changes the rules (for
  example XP tests in Spike A). Say which ones and why in the hand-over;
  never edit them to pass.
- Hand-over: what to try, what question to answer, which numbers are guesses.
  Then the user decides **keep / change / drop**, recorded in §0, the
  session log and the affected sections.

### Phase rules

- Full v1 discipline: one commit per step, build/type check/lint/tests pass
  before every commit, pure sim with tests, numbers in config.
- Kept spike ideas are **rebuilt**, not copied: the spike branch is a
  reference only.

### Workflow

- Version label on screen for every hand-over (§0), so builds are never
  confused with v1.
- Decisions about feel and taste belong to the user; hand over a build
  instead of judging it. Report changed tuning values.

---

## 11. Build Plan (v2)

| Step | Content | Done when |
|---|---|---|
| **Spike A — shop loop** (built, **dropped** 2026-10-21) | Waves, coins and a shop instead of level-ups, on v1's code. | Dropped: the user did not like the loop much (§13). |
| **Spike B — unbounded grid** (built, **changed** 2026-10-21) | Core fixed at (0, 0), no bounds or expansions, pan/zoom/fit, combat camera framing, filled rows removed. | Free growth disliked; became Spike B2. |
| **Spike B2 — land shapes** (built, **kept** 2026-10-21) | Board mask; land shapes at set levels, placed touching the board (§2.1). | Kept; pacing retuned to levels 8/15/22/29/36. |
| **Phase 1 — board and land** | Rebuild Spikes B + B2 properly with tests: Core fixed at (0, 0), sparse open-ended grid, board of buildable cells, land shapes at levels 8/15/22/29/36 (12 cells, 3 offered), Tarjan bridges, filled rows removed, combat camera framing, build screen pan/zoom/fit with the fresh-key rule; old tests updated to the new rules; balance bots place land. | Plays like Spike B2; all tests pass. |
| **Phase 2 — editing UX** | Selection, Shift+click, box select, group move/rotate, scrap selection, undo/redo within a pause including land (§3, §3.1). | Rearranging a 60-tile city feels quick to the user. |
| **Phase 3 — readability and synergies** | Piece outlines, buff pips, hover highlights, chain preview label, first-time hint, rules legend (§3.3); support chains (§2.7); Magnet pulse on XP gems (§2.9). | The user can tell at a glance what affects what. |
| **Phase 4 — weapons rework and rebalance** (user request 2026-10-22; placed here by the user 2026-10-22; details to brainstorm with the user before building) | Saw rework (rotating blade), rebalance of the existing weapons (Gatling too strong, Mortar misses), synergies between weapon types, possibly new weapons (piercing crossbow, short-range flamethrower with damage over time, thrusting spear). See §2.12. Balance sim and new tests per weapon. | Every weapon feels impactful to the user; no single weapon dominates in the balance sim; weapon types reward being combined. |
| **Phase 5 — endless and balance** | Win screen "Keep going", endless scaling, returning Colossus, land every 7 levels (§2.11); balance sim bots that place land; performance check with ~200 tiles at 600 enemies. | Endless is playable; no obviously dominant build. |
| **Phase 6 — polish and hosting** | Sounds for new events, text pass, decide the v2 hosting question (§12). | v2 is ready to share or to replace v1. |

Plan rewritten with the user 2026-10-21 after the spikes (the old Phase 2
"waves and shop" is gone). If a spike is dropped, its phase is removed or rewritten with the user, and
the reason is recorded. Phases 3 and 4 don't depend on the spikes and may
start early if the user asks.

---

## 12. Open Questions & Known Risks

**Open decisions (user)**

- **Weapons rework and rebalance** (Phase 4, §2.12, user request
  2026-10-22): every design detail (to brainstorm with the
  user before building; includes the Saw rework).
- Endless details (§2.11): scaling numbers, Colossus returns (Phase 5).
- Final land levels, size and shape set (now 8/15/22/29/36, 12 cells,
  7 shapes). Parked: class starting shapes (§13).
- v2 hosting: local only for now. Later options: a `/v2/` preview next to v1
  on GitHub Pages (the workflow would build both branches into one Pages
  artifact), or v2 replaces v1 on `main`.
- Does v2 eventually replace v1 on `main`?
- Should Shield Emitters, Repair Bays and Magnets also chain? (For now only
  Generators and Engines, as asked.)
- Carried over from v1: final title, code licence, piece mirroring,
  meta-progression.

**Claude's calls to check**

- Land: 12 cells, 3 offers, the 7 shapes, land placed before the piece pick
  in the same pause, land must not overlap the board (no partial overlap).
- Magnet pulse numbers and the new Magnet perks, endless numbers (×1.12 per
  minute, Colossus every 5 minutes at ×1.5 HP), zoom floor 0.4 and the 35%
  framing, build view zoom 0.3–3.
- Support chains multiply the chained tile's own effect; the receiving
  tile's Generator cap stays +75%. If chains then feel pointless, raise the
  cap for chain-buffed tiles.

**Risks**

- **Board shapes make cities slow:** a long or spread board means more
  tiles, and the 55% speed floor makes size free after a point. Levers: the
  floor, the per-tile penalty, Engine chains.
- **Readability at low zoom** with big cities and 600 enemies. *Check:*
  Phase 1 / Phase 3.
- **Performance in endless:** many tiles (enemy→nearest tile queries,
  synergy and bridge recompute) plus elites. *Check:* Phase 5 bench with
  ~200 tiles; tiles may need their own spatial hash.

**Known issues**

- **Intermittent bench spike (Phase 1):** in `npm run bench`, when the
  stress city is worn down to the Core alone (≈ tick 410–450), one tick of
  `updateEnemies` sometimes takes 100–320 ms (2 of 3 runs, then 0 of 3 with
  a GC observer attached; not seen in 4 runs on `v2` before Phase 1).
  Averages are fine (~6.9 ms/step, as before). Not found yet; the scenario
  (600 enemies on one tile) can't happen in a real run without losing.
  Look again in the Phase 5 performance check.
- **`npm run bench` times out on this machine** (Vitest's 5 s test
  timeout; the run takes ~7 s) on `v2` as well as on Phase 1: the check
  never reports a pass here. Raise the bench's timeout in Phase 5, or run
  on a faster machine.
- v1 known issues (`concept.md` §12) carry over until the code involved is
  rebuilt.

---

## 13. Ideas for Later (not planned)

- **Dropped 2026-10-21 (Spike A):** waves with a shop between them and
  coins instead of XP. Reason (user): did not like the loop much after a
  test run. Branch `v2-spike-a-shop` kept as a record.
- **Parked 2026-10-21:** class starting board shapes (triangle, hexagon,
  circle, long box) and paid edge expansion buttons (Spike B discussion),
  set aside for land shapes; classes may return as a variety option.
- Trading posts in the world you drive to (the shop-timing alternative,
  2026-10-21).
- Magnet as interest on saved coins (alternative to the pulse).
- **Rejected 2026-10-21:** buying land plots shaped like pieces. Reason
  (user): you already fit shapes together inside the grid; building the
  grid itself must not become a second puzzle.
- Merging duplicates by placing a tile next to the same type.
- Solid 3×3 blocks bonus or long-line bonus (alternatives to dropping
  filled rows).
- Separate endless mode on the title screen.
- v1 §13 ideas still apply (meta-progression, tile sets, terrain, drone,
  touch/gamepad, daily seed).

---

## 14. Session Log

Same format as v1 (`concept.md` §14). Newest first.

### 2026-10-22 — Phase order changed
- Decision (user): the weapons rework becomes **Phase 4**; the old Phase 4
  (endless and balance) becomes Phase 5, polish and hosting Phase 6.
  Phase 3 (readability and synergies) is next, unchanged.

### 2026-10-22 — Weapons rework requested
- Request (user): add a new step for the Saw rework and a general
  rebalance and fixing of the weapons and other designs: Gatling is very
  oppressive, Mortar always misses, every weapon must feel impactful,
  synergies between weapon types; ideas: piercing crossbow, close-range
  damage-over-time flamethrower, thrusting melee spear that pierces.
  Recorded in §2.12 and as a step in §11; its position in the order and
  all details are still to agree with the user.
- Next session: ask where the step goes, brainstorm it, then continue.

### 2026-10-22 — Phase 2 merged, session end
- Decision (user): Phase 2 "feels good"; merged `v2-phase-2-editing`
  into `v2`. The user continues in a new session.
- State: `v2` at 2.0.0-alpha.2; build, lint and 139 tests pass. Nothing
  pushed (spike and phase branches are local only; ask before pushing).
- Open: where the Saw rework goes; the bench spike and bench timeout
  (§12 Known issues); land numbers still Claude's guesses.
- Next: Phase 3.

### 2026-10-21 — Phase 2: editing UX
- Decision (user): a plain click on a tile keeps v1's one-click carry
  (the whole selection when the tile is selected); selecting is
  Shift+click, box drag on empty space and Ctrl+A.
- Done (branch `v2-phase-2-editing`, one commit per step, all checks
  green): multi-group held selections in the grid; selection in the build
  session; snapshot undo/redo including land, offers, upgrades, Repair
  Core and rerolls (rerolls now charged at the end of the pause); build
  screen selection, box select, Ctrl+A, Esc, scrap selection, outlines and
  shadow; undo/redo keys and counts. Version `2.0.0-alpha.2`.
- Tests: 139 pass (new: multi-group lift/drop, selection, undo/redo,
  reroll charge).
- Checked in a headless browser: box select and Ctrl+A outlines; land
  placed, undone (land cards back) and redone; no console errors.
- Next: the user tries Phase 2; merge; Phase 3.

### 2026-10-21 — Phase 1 merged
- Decision (user): Phase 1 works well; merged `v2-phase-1-board` into
  `v2`. Next: Phase 2 (editing UX).

### 2026-10-21 — Phase 1: board and land
- Done (branch `v2-phase-1-board`, one commit per step, all checks green
  at each): concept rewrite; filled rows/columns removed; open-ended grid
  with a board, Core fixed at (0, 0), no timed expansions, combat camera
  framing; Tarjan bridges; land shapes in the sim with tests; build screen
  board view with pan/zoom/fit and the fresh-key rule; land step in the
  build screen and runs (F2 debug); balance bots place land; small-integer
  cell ids. Version `2.0.0-alpha.1`.
- Tests: 124 pass (old tests moved to the new coordinates; expansion and
  filled-row tests replaced by board, land and "no filled-row bonus"
  tests; the Bomber test uses Plating, as Hull only survived through the
  filled-row HP bonus).
- Checked in a headless browser: build screen with board, pan/zoom/fit,
  held piece over the scrap zone, land offer at a land level-up with WASD
  still held (no panning), red overlap preview; no console errors.
- Balance sim (seed 1, bots collect all XP): Gatling, Cannon, Mortar and
  mixed builds win at level 47 with 71–93 tiles on 96-cell boards; the Saw
  wall dies to the boss with one tile left (fits the user's Saw feedback;
  not compared against v1 here).
- Problems: the intermittent bench spike and the bench timeout (§12 Known
  issues). Diagnosed with temporary logging (not committed): the spike is
  inside `updateEnemies`, only once the city is down to the Core; large
  cell ids were measured to cost ~7% (fixed), but were not the spike.
  Stopped there instead of guessing further.
- Next: the user tries Phase 1; merge into `v2`; Phase 2; schedule the
  Saw rework.

### 2026-10-21 — Plan rewritten, Phase 1 started
- Decisions (user): the rewritten plan (§11): Phase 1 board and land,
  Phase 2 editing UX, Phase 3 readability and synergies, Phase 4 endless
  and balance (endless keeps giving land every 7 levels, so the board can
  grow without limit there), Phase 5 polish and hosting. Pacing at levels
  8/15/22/29/36 feels better. New request: rework the Saw into a tile with
  a rotating blade around it, larger hitbox, to make melee builds fun
  (§2.9; to schedule).
- Done: concept §1–§9, §11–§13 rewritten for the decided design (XP and
  levels, board and land; the shop design moved to §13).
- Next: Phase 1 steps on `v2-phase-1-board`.

### 2026-10-21 — Spike B2 verdict
- Decisions (user): Spike B2 **kept**. Feedback: land too fast early and
  too rare late; WASD held from driving panned the level-up screen.
- Done on the spike branch: level timings measured with a temporary log in
  the balance sim (not committed; bots reach level 5 ≈ 1:40, 13 ≈ 3:00,
  then ~20 s per level up to level 44 ≈ 11:10); land moved to levels
  8/15/22/29/36; build screen pans only on fresh key presses (checked with
  held and auto-repeat keys in a headless browser).
- Next: the user may re-try the pacing; rewrite the build plan (§11) with
  the user before Phase 1.

### 2026-10-21 — Spike B2: land shapes
- Done: Spike B2 on `v2-spike-b2-land` from `v2` (commit df99dc8, built on
  a cherry-pick of Spike B's code; not merged, by the spike rules): board
  mask, land shapes at levels 5/9/13 as agreed (§2.1). Version label
  `2.0.0-spike.b2`.
- Checked in a headless browser: land offer, invalid (overlap) preview,
  rotation, valid placement (board 36 → 48), piece pick afterwards. No
  console errors. Build, type check and lint pass.
- Failing tests on purpose (16): the 14 from Spike B plus two build tests
  that place pieces at v1 coordinates now off the board.
- Next: user verdict on Spike B2.

### 2026-10-21 — Spike A verdict
- Decisions (user): Spike A **dropped**: after a test run the user did
  not like the wave/shop loop much; stay with XP and level-ups. The
  paid-expansion idea is replaced too: the grid grows at **set levels**
  instead of set times; at such a level you choose one of several **land
  shapes** (all the same cell count, large enough to matter) and place it
  anywhere it touches the existing grid. This revisits land plots in a new
  form (few, large shapes at set levels, not a purchase every visit).
- Consequences: Phase 2 (waves and shop) and the endless-after-boss plan
  (which built on waves) need rewriting with the user; the Spike A branch
  stays as a record.
- Next: agree the Spike B2 details, then build it.

### 2026-10-21 — Spike B verdict
- Decisions (user): Spike B **change**: free infinite growth disliked, but
  more creative build shapes wanted. Direction: class starting shapes
  (triangle, hexagon, circle, long box) plus paid one-row/column
  expansions in a chosen direction, with expansion buttons at the edges of
  the board shape, separate from buying pieces. Piece-shaped land plots
  rejected (no second puzzle). Recorded in §2.1, §11, §13.
- State: the user is test-playing Spike A.
- Next: Spike A verdict, then plan and build Spike B2.

### 2026-10-21 — Spike B: unbounded grid
- Done: Spike B on `v2-spike-b-grid` from `v2` (commit 2c780dc, not
  merged, by the spike rules; started after the user said "continue"
  without a Spike A verdict yet; the two spikes are independent): fixed
  Core at (0, 0), sparse unbounded grid, no expansions, filled
  rows/columns removed, combat camera framing (35%, zoom 0.4–1), build
  screen pan / zoom / fit, HUD tiles and speed. Version label
  `2.0.0-spike.b`.
- Checked in a headless browser: sandbox build screen (placing in every
  direction, wheel zoom, WASD and middle-drag pan, F fit), a run with a
  level-up pause and a 25-tile city (speed 70%). No console errors. Build,
  type check and lint pass. The headless browser runs at ~10 fps, so
  game time there runs slower than real time (environment, not the game).
- Failing tests on the spike branch, on purpose (rules changed, not
  edited), 14 in total: Core no longer at the grid centre and no bounds
  (`grid.test.ts`, `build.test.ts`, `arcs.test.ts`), grid expansion
  (`grid.test.ts`, `build.test.ts`, `world.test.ts`), filled rows
  (`synergies.test.ts`), and the Bomber test, whose Hull survived only
  through the filled-row HP bonus (`enemies.test.ts`).
- Next: the user decides keep / change / drop for both spikes.

### 2026-10-21 — Spike A: shop loop
- Done: Spike A on `v2-spike-a-shop` (commit d41e7ad, not merged, by the
  spike rules): 15 timed waves (25 → 60 s) plus the boss wave; coins (gold,
  v2 coin values) instead of XP, 50% of leftover coins at wave end; enemies
  fade out with a "WAVE n CLEARED" banner, then the shop: 4 piece slots,
  2 upgrade slots, Repair Core, Reroll (2, +1 per reroll), locks, inflation
  +20% per wave, 50% scrap refund; free starter domino; boss enrages 120 s
  after arriving; HUD shows wave, countdown and coins; end screen shows
  waves survived and coins earned. Version label `2.0.0-spike.a`.
- Checked by driving a headless browser: title → wave 1 → shop (buy,
  place, upgrade, reroll, lock) → wave 2; jump to the wave-15 shop (grid
  10×10, lock kept, prices ×3.8) → boss wave; sandbox shop. No console
  errors. Build, type check and lint pass.
- Failing tests on the spike branch, on purpose (rules changed, not
  edited): `boss.test.ts` (8, boss arrives by time, not wave),
  `world.test.ts` and `synergies.test.ts` (2, gems give XP),
  `enemies.test.ts` (1, Elite Brute worth XP).
- Watch: the shop timer in the status panel ("Shop time: last / avg") is
  the measure for the "shop pauses break the flow" risk (target < 20 s).
- Next: the user plays it and decides keep / change / drop, with first
  price feedback; then Spike B.

### 2026-10-21 — v2 planning
- Done: brainstormed v2 with the user; wrote `concept-v2.md` on the new `v2`
  branch (from `main` at v0.8.0); `CLAUDE.md` on `v2` points here.
- Decisions (user): same core, big revamp; v2 on a long-lived branch in this
  repo; spikes first, then phases. Unbounded grid with a fixed Core; waves +
  shop instead of level-ups (15 waves + boss, 25→60 s); coins left at wave
  end collected at 50%; type upgrades as separate shop items; filled
  rows/columns dropped; Generators and Engines chain; Magnets pulse; endless
  via "Keep going" after the boss; readability and editing UX as listed.
  Defaults and plan accepted as proposed (Claude's calls listed in §12).
- State: no v2 code; build and tests as on `main`.
- Next: Spike A on `v2-spike-a-shop`.
- Watch out: never commit v2 work to `main` (it redeploys the live game);
  `concept.md` is the frozen v1 record.
