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
| **Status** | Both spikes built and handed to the user: Spike A on `v2-spike-a-shop` (2.0.0-spike.a), Spike B on `v2-spike-b-grid` (2.0.0-spike.b). `v2` itself still has no v2 code. v1 (v0.8.0) is untouched on `main` and live. |
| **Current step** | Both spikes decided (2026-10-21): Spike A **dropped** (stay with XP and level-ups), Spike B **change**. Planning Spike B2 (land shapes at set levels) with the user. |
| **Next step** | Agree the Spike B2 details, then build it on `v2-spike-b2-land` from `v2`. Phases 1–2 need rewriting with the user afterwards (§11). |
| **Decision milestone** | **Keep-or-drop after Spike A and after Spike B.** No v2 phase starts before both are decided. Whether v2 ever replaces v1 on `main` is a separate, later user decision (§12). |
| **Branches** | `main` = v1, live (every push redeploys). `v2` = v2 integration branch (not deployed). Spikes `v2-spike-<letter>-<topic>`, phases `v2-phase-N-<topic>`, both from `v2`. |
| **Version** | Spikes: `2.0.0-spike.a`, `2.0.0-spike.b` (on their branches only); `v2` still says 0.8.0. Labels: spikes `2.0.0-spike.a`, `2.0.0-spike.b`; phases `2.0.0-alpha.N`. |
| **Play** | v2: local only (`npm run dev` on a v2 branch). v1: https://lead0lead.github.io/rolling-bastion/ |
| **Target** | Unchanged from v1: desktop browsers, keyboard + mouse, 1280×720 and up. |
| **Last updated** | 2026-10-21 (both spikes built, awaiting decisions) |

---

## 1. Core Concept

Unchanged at heart: a survivor-like where you only steer a moving city built
from polyomino pieces; every tile acts automatically, and everything must stay
connected to the Core. See `concept.md` §1.

**What v2 changes (decided by the user 2026-10-21):**

1. **Unbounded grid.** The Core sits fixed at the centre; the city grows from
   it in any direction with no size limit. Growth is limited by coins, by the
   size speed penalty, and by a longer outer edge to defend.
2. **Waves and a shop instead of level-ups.** The run is 15 waves plus a boss
   wave. Kills drop coins; between waves the shop opens, and you buy pieces and
   upgrades and rearrange the city there.
3. **Endless after the boss.** "Keep going" after the win continues with
   scaling waves.
4. **Readability:** where a piece starts and ends, which tiles a support tile
   affects, and how chains work must all be obvious.
5. **Editing UX:** multi-select, box select, group move and rotate, undo.
6. **Synergy changes:** filled rows/columns are removed; Generators and
   Engines can form chains; Magnets pulse.

**Design pillars:** v1's pillars stay (space is the resource, calm puzzle /
hectic drive, readable at a glance, power fantasy first, connected or useless).
v2 adds one:

- **Edit without friction.** Rearranging a big city must take as few actions
  as rearranging a small one. If an edit needs more than a few clicks, the
  build screen is missing a tool.

**Targets**

- Normal run: 15 waves (~10:40 of combat) + boss wave; shop visits average
  under 20 s.
- Endless: playable until the city is overwhelmed; 60 fps at 600 enemies with
  a city of up to ~200 tiles.
- Content: v1's 12 tile types, 21 pieces, 6 enemies and the Colossus. v2 adds
  no new content until the spikes are decided.

---

## 2. Core Mechanics

All numbers are **starting values to tune**, kept in `src/config/`. Anything
not mentioned here works as in v1 (`concept.md` §2).

### 2.1 The grid (v2: unbounded)

- Cells are integer coordinates relative to the Core at **(0, 0)**. There are
  no bounds and no grid expansion.
- The **Core is fixed** at (0, 0): it cannot be moved or scrapped. Every other
  group can be moved freely in the shop.
- One cell = 32×32 world pixels (unchanged). The city never rotates.
- The city's world position is the Core's centre (v1 used the grid centre).
- Implementation: a sparse map keyed by cell (no fixed-size arrays), so a
  scattered city costs only its tile count.

**Spike B: change (user, 2026-10-21).** The user tested free infinite
growth and did not like it, but wants builds with more creative shapes.
Decided direction (details to plan in Spike B2, §11):

- The board is a set of buildable cells (a mask) instead of a square.
- **Classes:** different starting board shapes, e.g. triangle, hexagon,
  circle, long box (approximated on the square grid).
- **Paid expansions:** pay currency to add one row or column strip in a
  direction of your choice. Expansion is its own option, separate from
  buying pieces: **expansion buttons sit at the edges of the board shape.**
- Rejected: buying land plots shaped like pieces (§13).

What the spike did, kept as reference: How the spike does it: the Core starts at (0, 0) and cells may
be negative; the run cache keys cells by a number (`cellNum`), synergies
scan the city's bounding box; the world position is the centre of cell
(0, 0). Placement only checks overlaps. Combat camera: follows the Core,
zoom = city bounding box ≤ 35% of the view's width and height, clamped to
0.4–1 (`CAMERA.cityFrame`, `CAMERA.minZoom`). Build screen: the city has
its own camera in the middle of the screen (pan WASD / arrows /
middle-drag at 700 px/s, wheel zoom ×1.15 per step toward the pointer,
0.3–3, F/Home fits with 3 empty cells of margin, also on every pause).
The HUD and build screen show tile count and speed, for the "slow blob"
question. Still v1 levels; filled rows/columns are gone (their HP bonus
too). Debug F3 fills the city's bounding box plus one ring.

### 2.2 Pieces and tiles

Unchanged from v1. Pieces now also have a **price** (§2.8).

### 2.3 Placement and rearranging (v2: in the shop)

- All building happens in the **shop**, between waves (§2.8). The game is
  paused there.
- Placement rules from v1 apply, without the bounds check: cells must be empty,
  rotation in 90° steps, no mirroring. The confirm rule ("Next wave" only when
  every tile is connected to the Core) stays.
- **Bought pieces** are owned: until placed, they show as "owned, unplaced"
  in their shop slot and block confirm. They must be placed or scrapped.
- **Scrap** refunds **50% of the price paid** for that piece (rounded down).
  A split part refunds its share by cell count. The free starter piece
  refunds nothing.
- Offline tiles at shop start must be reconnected or scrapped (unchanged).
- Editing tools: §3.1.

### 2.4 Connectivity

- Rules unchanged from v1 (flood fill from the Core, offline tiles).
- **Bridge detection must be linear time** (Tarjan articulation points)
  instead of v1's brute force: endless cities can reach hundreds of tiles, and
  Sappers recompute bridges on every city change.

### 2.5 Movement

Unchanged from v1 (150 px/s, −2% per tile above 10, floor 55%, Engines +12%
each). The 55% floor now matters much more because cities can get big; watch
it in Spike B. Engine chains (§2.7) are the counterweight.

### 2.6 Combat

Unchanged from v1, except:

- **Win:** kill the boss in wave 16. If it is still alive 120 s after it
  arrives, it enrages (×2 damage), the same as v1's 14:00.
- **Lose:** the Core is destroyed (unchanged), also in endless.

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
4. **Filled rows/columns: removed** (decided 2026-10-21; with no grid edges
   there is no "full row"). This also removes their max HP bonus. Max HP now
   only comes from levels and Hull L3.

How bonuses combine (v1 formula without the filled-line term): weapon damage =
base × level multiplier × (1 + chain bonus + Generator L3 bonus).

### 2.8 Coins, waves and the shop (v2, replaces XP and levels)

**Coins**

- Killed enemies drop **coins** instead of XP gems: Swarmer 1, Runner 1,
  Spitter 2, Sapper 2, Brute 5, Bomber 0, elites = their group's value, Elite
  Brute 40 (Claude's calls for the types not discussed).
- Pickup: a coin is collected when it comes within 24 px of **any** tile
  (unchanged). Magnets no longer change this radius (§2.9).
- **Wave end:** coins still on the ground are collected at **50%** (rounded
  down) (decided 2026-10-21).
- Live coin cap and merging work like v1's 400-gem cap.

**Waves**

- 15 waves, then the boss wave 16 (decided 2026-10-21). Wave *n* lasts
  **25 + 2.5 × (n − 1) s** (25 s → 60 s, ~10:38 in total).
- Inside a wave the v1 spawner runs on **combat time** (time spent in waves,
  shop time excluded): budget curve, groups and the +6%/min enemy HP growth
  are unchanged.
- New enemy types enter at: Runners wave 2, Brutes wave 4 (with the v1
  mini-wave spike at its start), Spitters wave 6, Sappers wave 8, Bombers
  wave 10 (plus the Elite Brute at its start), "final escalation"
  (spawn rate ×1.5) waves 13–15. Pentomino pieces appear in the shop from
  wave 6.
- **Wave end:** when the timer runs out, all remaining enemies and enemy
  shots fade out (no coins), leftover coins are collected at 50%, a
  "WAVE n CLEARED" banner shows for 1 s, then the shop opens.
- **Boss wave:** no timer; regular spawns are off (Colossus summons only).
  Unchanged Colossus (`concept.md` §4.3), 50000 HP. Killing it opens the win
  screen (§2.11).

**Shop** (opens after every wave; this is also the build screen)

- **4 piece slots** rolled from the v1 pool with v1 weights and rules (never
  three cards of the same tile type).
- **2 upgrade slots:** random tile types the city owns that are below
  level 5 (Core excluded). Buying one gives that type +1 level with v1's
  per-level gains and L3/L5 perks (`concept.md` §2.8; Magnet perks change,
  §2.9).
- **Repair Core:** heals 35% of max HP, disabled at full HP (as v1).
- **Reroll:** rerolls the piece and upgrade slots that are not locked.
- **Lock:** each slot can be locked to keep it for the next shop visit.
- Several items can be bought per visit, as long as there are coins.
- **"Next wave"** (Enter) closes the shop when the confirm rule holds.

**Prices** (all × the wave's **inflation** = 1 + 0.2 × (wave − 1), rounded;
all Claude's calls, to be calibrated in Spike A):

| Item | Base price |
|---|---|
| Piece | 1 per Hull/Plating cell + 3 per other tile (domino Hull 2 … five-function pentomino 15) |
| Upgrade | 8 × the level bought (L2 = 16, L5 = 40) |
| Repair Core | 10 |
| Reroll | 2, +1 per reroll within the same visit |

**Spike A (built 2026-10-21, `v2-spike-a-shop`, awaiting the user's
verdict).** How the spike does it, for the user to judge (Claude's calls):

- The v1 spawner runs on a remapped "v1 clock": wave starts 1, 2, 4, 6, 8,
  10, 13, 16 map to v1 times 0, 60, 150, 240, 330, 420, 600, 720 s
  (interpolated in between). That puts every new enemy type, the 40-Swarmer
  spike (wave 4), the Elite Brute (wave 10, 40 coins), pentominoes and the
  final escalation at the waves above, with v1's budget curve and group
  weights. Enemy HP growth stays on combat time.
- Shop: slot click buys and puts the piece in the hand; a bought, unplaced
  piece stays in its slot ("Owned") and Esc puts it back there; placing it
  empties the slot. Reroll refills every unlocked slot that is not owned
  (sold ones too). Repair Core can be bought repeatedly until full HP.
  Upgrades can be bought while holding a piece.
- Scrap refunds are tracked per tile (`paid` = price / cells), so split
  parts and damaged-away tiles refund their share automatically.
- Grid expansions happen in the shops after waves 6 and 10 (spike only).
- Debug: G +50 coins, T ends the wave, J jumps to the shop before the boss.
  `?sandbox=1` opens a shop with 9999 coins before wave 1.
- All prices and coin values are the table's guesses, untouched.

**Start of a run:** Core plus a free starter piece (domino: Gatling facing up
+ Hull), 0 coins. The first shop opens after wave 1.

### 2.9 Tile catalogue

Unchanged from v1 (`concept.md` §2.9), except:

| Tile | v2 change |
|---|---|
| **Magnet** | Function: **pulse.** Every 8 s, each online Magnet pulls every coin within 300 px of **its own tile** to the city (coins fly at 600 px/s). Magnets far apart cover more ground than Magnets side by side. A visible ring expands from the Magnet on each pulse. Each Magnet keeps its own timer (starting at a random 0–8 s offset), so pulses don't line up. Level gain: +20% radius per level. **L3:** pulse every 6 s. **L5:** base radius 450 px. (Decided "pulse" 2026-10-21; numbers and perks are Claude's drafts.) |
| **Generator / Engine** | Can form chains (§2.7). |

### 2.10 Firing arcs

Unchanged from v1 (`concept.md` §2.10).

### 2.11 Endless (v2)

- The win screen after the boss offers **"Keep going"** and **"End run"**
  (decided 2026-10-21).
- Keep going: the shop opens, then waves continue from wave 17. Every
  endless wave lasts 60 s and uses the v1 12:00 spawn budget; enemy HP and
  contact/shot damage are **× 1.12^(wave − 16)** (compounding, on top of the
  v1 per-minute HP growth, which stops at wave 16).
- **The Colossus returns** at waves 21, 26, 31, … (every 5 waves), with
  HP × 1.5 per return, alongside the normal spawns.
- Elite conversion above 600 live enemies is unchanged; elites become the main
  way the late game gets harder.
- The run ends when the Core is destroyed. The end screen reports waves
  survived, "Boss defeated" if it was, kills and coins earned.

---

## 3. Controls & Camera

**Combat:** unchanged from v1 (WASD/arrows, Esc/P pause, M mute, F1 debug).

**Shop / build screen (v2):**

| Action | Input |
|---|---|
| Buy piece | Click the card, or 1/2/3/4 (the piece goes to the hand) |
| Buy upgrade | Click, or Shift+1/Shift+2 |
| Repair Core / Reroll | Click, or 5 / 6 (v1 used 5 / 4; changed to fit 4 slots) |
| Lock slot | Click its lock icon, or L while hovering it |
| Select a group | Click a tile |
| Add/remove a group from the selection | Shift+click |
| Box select | Drag on empty space (selects every group that has a tile in the box) |
| Select all (except Core) | Ctrl+A |
| Move selection | Drag any selected tile; or click once to carry it, click again to drop (as v1) |
| Rotate held selection | R or right-click, 90° around the grabbed cell |
| Scrap selection | X or Delete, or drop on the scrap zone (shows total refund) |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z (also Ctrl+Y) |
| Clear selection / put held back | Esc |
| Pan | WASD / arrows, or middle-drag |
| Zoom | Mouse wheel (toward the pointer) |
| Fit city to view | F or Home |
| Bridges / all arcs | B / V (unchanged) |
| Rules legend | ? or H |
| Next wave | Enter / button |

### 3.1 Editing rules (v2)

- A **selection** is a set of groups. Moving a selection keeps the relative
  positions of its groups; a drop is valid only if every cell is empty
  (outside the selection) and none is the Core's cell. An invalid drop keeps
  the selection in hand, as in v1.
- Selected groups get a bright outline; the held selection floats with a
  shadow.
- **Undo** (Claude's addition, accepted with the plan) covers everything in
  the current shop visit: purchases (undo refunds in full), placements, moves,
  rotations, scraps, rerolls (undo restores the previous slots and the
  reroll price), locks and Repair Core. History is cleared when the wave
  starts.

### 3.2 Camera (v2)

- **Combat:** follows the Core with light smoothing; zoom changes smoothly
  (over ~1 s) so the city's bounding box takes up at most **35%** of the
  view's height and width. Zoom floor 0.4 (below that, enemies stop being
  readable; see §12). The spawn ring and "far behind" checks must use the
  current view size, not a fixed one.
- **Shop:** opens fitted to the city with ~3 empty cells of margin;
  pan/zoom freely; F refits.

### 3.3 Readability (v2 additions; v1 rules still apply)

- **Piece outlines:** a thick (3 px) dark border wherever a tile meets a
  tile of another group or empty space; a thin (1 px) seam between tiles of
  the same group. You can then see at a glance where a piece starts and
  ends. In the shop and in combat.
- **Buff pips:** every tile shows one small pip per support type currently
  buffing it (Generator, Shield Emitter, Repair Bay), in that support tile's
  colour, in a fixed corner order. In the shop and in combat.
- **Hover a support tile** (shop): the tiles it affects get a tinted overlay
  and a short arrow from the source. **Hover any tile:** the tooltip lists
  what it receives, with numbers ("Generator +25% fire rate (×2)",
  "Chain ×3 +50% damage").
- **Chain preview:** while holding pieces, cells that would form or extend a
  chain show the link line live (as v1) **plus a floating label** with the
  result ("Chain 3: +50% damage").
- **First-time hint:** the first time in a session that a chain becomes
  possible, a short hint card explains it: "Line up 3 or more identical tiles
  facing the same way: each gets +50% damage. Generators and Engines chain
  too." Not saved (no saving, unchanged).
- **Rules legend** (? / H): one panel listing chains, adjacency buffs,
  bridges and offline tiles, with small drawn examples.

---

## 4. Content & Structure

### 4.1 Run structure (v2)

See §2.8 (waves) and §2.11 (endless). No grid expansions.

### 4.2 Piece pool

Unchanged from v1 (21 pieces), with prices from §2.8 and pentominoes from
wave 6.

### 4.3 Enemies

Unchanged from v1 (`concept.md` §4.3), except coin values (§2.8) and endless
scaling (§2.11).

---

## 5. Story, Tone & Text

Unchanged from v1. New draft text (user's to rewrite): "WAVE n CLEARED",
"Keep going", "End run", the chain hint in §3.3, the end screen line
"Survived n waves".

## 6. Look

Unchanged from v1 (`concept.md` §6), plus the readability additions in
§3.3 and the Magnet pulse ring. Coins replace cyan XP diamonds: use a gold
coin (a circle with a darker rim) so coins stay in their own colour family.

## 7. Audio

Unchanged from v1. New events reuse existing sounds: purchase (pick-up
sound), wave cleared (level-up sound), Magnet pulse (a quiet existing sound,
rate-limited). Claude's call.

## 8. UI, Progress & Saving

- **HUD:** "Wave n/15" (or "Wave n" in endless) and wave countdown (top
  centre), coins, Core HP bar, kills; boss bar as v1. No XP bar, level or
  grid size.
- **Shop screen:** the city centred and pannable; a side panel with coins,
  4 piece cards (price, lock), 2 upgrade cards, Repair Core, Reroll (price),
  scrap zone, "Next wave" with the reason when it is disabled.
- **End screen:** as v1, with waves survived and coins earned instead of
  level.
- **Saving:** none (unchanged). Settings key unchanged.
- **Debug** (v1 keys, changes): `G` +50 coins (was +1 level); `T` ends the
  current wave; `F2` removed (no expansion); `J` jumps to wave 16 (boss)
  with the shop first. `?sandbox=1` opens the shop with a large coin balance.

---

## 9. Tech Stack & Code Structure

Unchanged from v1 (`concept.md` §9): TypeScript, Phaser 3.90.0, Vite,
Vitest, ESLint/Prettier. Same rules: `src/sim/` stays Phaser-free, 60 Hz fixed
timestep, seeded RNG, all tuning in `src/config/`. No new libraries without
asking.

Expected changes to the code structure (rebuilt in phases, not in spikes):

- `sim/grid.ts`: sparse unbounded grid; no bounds, no expansion.
- `sim/connectivity.ts`: Tarjan bridges.
- `sim/progression.ts` → `sim/economy.ts` (coins, prices, inflation) and
  `sim/shop.ts` (slots, locks, reroll, purchases).
- `sim/waves.ts`: wave clock, wave end, boss wave, endless scaling.
- `sim/build.ts`: selection, group move/rotate, undo history.
- `sim/synergies.ts`: no filled lines, support chains.
- `config/economy.ts`: coin values, prices, inflation; `config/waves.ts`
  gains the wave table and endless numbers.
- `bench/balance.sim.ts`: bots that shop instead of levelling (Phase 5).

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
| **Spike A — shop loop** (riskiest) | On v1's code and bounded grid: waves (§2.8) replacing the 12:00 timeline; coins instead of XP; shop after each wave with 4 piece slots, 2 upgrade slots, Repair, Reroll, lock, prices with inflation; scrap refund 50%; leftover coins at 50%; boss wave. Grid expansions move to the shops after waves 6 and 10. No endless, no new editing tools. | **User answers: does the wave/shop rhythm feel better than level-ups?** Keep / change / drop, plus first price feedback. |
| **Spike B — unbounded grid** | On `v2` (v1 levels, not Spike A): Core fixed at (0, 0), no bounds or expansions, build screen pan/zoom/fit, combat camera zoom (§3.2), filled rows removed. | **User answers: does free growth feel good, or does the city sprawl into a slow blob?** Keep / change / drop. |
| **Spike B2 — board shapes** (planned) | Board mask with class starting shapes, expansion buttons at the board edges that add one row/column strip for currency. Reuses Spike B's coordinates, pan/zoom and camera. Details with the user after the Spike A verdict. | User answers: do shapes and directional expansions lead to more creative builds? |
| **Phase 1 — unbounded grid** | Sparse grid, Core fixed, Tarjan bridges, camera zoom and spawn ring from view size, filled rows removed (tests updated to the new rules). | Kept Spike B behaviour, rebuilt properly; all tests pass. |
| **Phase 2 — waves and shop** | `waves.ts`, `economy.ts`, `shop.ts` with tests; shop scene; HUD and end screen changes; coin visuals. | A full normal run with the shop. |
| **Phase 3 — editing UX** | Selection, Shift+click, box select, group move/rotate, scrap selection, undo/redo, pan/zoom polish (§3, §3.1). | Rearranging a 60-tile city feels quick to the user. |
| **Phase 4 — readability and synergies** | Piece outlines, buff pips, hover highlights, chain preview label, first-time hint, rules legend (§3.3); support chains (§2.7); Magnet pulse (§2.9). | The user can tell at a glance what affects what. |
| **Phase 5 — endless and balance** | Win screen "Keep going", endless scaling and returning Colossus (§2.11); `npm run sim` with shopping bots; performance check with ~200 tiles at 600 enemies. | Endless is playable; no obviously dominant build. |
| **Phase 6 — polish and hosting** | Sounds for new events, text pass, decide the v2 hosting question (§12). | v2 is ready to share or to replace v1. |

If a spike is dropped, its phase is removed or rewritten with the user, and
the reason is recorded. Phases 3 and 4 don't depend on the spikes and may
start early if the user asks.

---

## 12. Open Questions & Known Risks

**Open decisions (user)**

- Spike A: **dropped** 2026-10-21 (XP and level-ups stay). Spike B:
  **change** 2026-10-21 (land shapes at set levels, Spike B2). Open:
  Spike B2 details; rewrite of Phase 2 and the endless plan without waves.
- v2 hosting: local only for now. Later options: a `/v2/` preview next to v1
  on GitHub Pages (the workflow would build both branches into one Pages
  artifact), or v2 replaces v1 on `main`.
- Does v2 eventually replace v1 on `main`?
- Should Shield Emitters, Repair Bays and Magnets also chain? (For now only
  Generators and Engines, as asked.)
- Carried over from v1: final title, code licence, piece mirroring,
  meta-progression.

**Claude's calls to check** (made while writing this concept):

- All prices, inflation (+20% per wave), coin values for Spitter/Sapper/
  Bomber/Elite Brute, the starter piece, Magnet pulse numbers and the new
  Magnet perks, endless numbers (×1.12 per wave, Colossus every 5 waves at
  ×1.5 HP), wave-to-enemy mapping, zoom floor 0.4 and the 35% framing.
- Support chains multiply the chained tile's own effect; the receiving
  tile's Generator cap stays +75%. If chains then feel pointless, raise the
  cap for chain-buffed tiles.
- Reroll/Repair keys changed to 6/5; undo covers purchases with a full
  refund.
- Leftover coins and enemy fade-out at wave end give no coins for the
  faded enemies.

**Risks**

- **Shop pauses break the flow** (15+ stops per run). *Check:* Spike A;
  measure average shop time (target < 20 s).
- **Unbounded growth makes cities slow and blobby**, and the 55% speed floor
  makes size free after a point. *Check:* Spike B; levers are the floor, the
  per-tile penalty and Engine chains.
- **Readability at low zoom** with big cities and 600 enemies. *Check:*
  Spike B / Phase 1.
- **Performance in endless:** many tiles (enemy→nearest tile queries,
  synergy and bridge recompute) plus elites. *Check:* Phase 5 bench with
  ~200 tiles; tiles may need their own spatial hash.
- **Economy snowball:** income grows faster than prices, so late shops buy
  everything. *Check:* Spike A, then the Phase 5 sim.

**Known issues**

- v1 known issues (`concept.md` §12) carry over until the code involved is
  rebuilt.

---

## 13. Ideas for Later (not planned)

- **Dropped 2026-10-21 (Spike A):** waves with a shop between them and
  coins instead of XP. Reason (user): did not like the loop much after a
  test run. Branch `v2-spike-a-shop` kept as a record.
- Trading posts in the world you drive to (the shop-timing alternative,
  2026-10-21).
- Magnet as interest on saved coins (alternative to the pulse).
- **Rejected 2026-10-21:** buying land plots shaped like pieces. Reason
  (user): you already fit shapes together inside the grid; building the
  grid itself must not become a second puzzle.
- Merging duplicates by placing a tile next to the same type (alternative to
  upgrade slots).
- Solid 3×3 blocks bonus or long-line bonus (alternatives to dropping
  filled rows).
- Separate endless mode on the title screen.
- v1 §13 ideas still apply (meta-progression, tile sets, terrain, drone,
  touch/gamepad, daily seed).

---

## 14. Session Log

Same format as v1 (`concept.md` §14). Newest first.

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
