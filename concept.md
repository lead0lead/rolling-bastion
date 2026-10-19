# Rolling Bastion (working title) — Concept & Build Plan

> A browser survivor-like where you steer a driving city through endless
> monster hordes. The city is built from Tetris-like pieces on a small grid;
> each tile can carry a weapon or ability, everything must stay connected to
> the Core, and the challenge is squeezing the strongest build into very
> little space while enemies tear pieces off it.

This document is the **source of truth** for the project and the starting point
for every Claude Code session. Keep it up to date whenever a feature ships or a
decision is made.

Full title: *Rolling Bastion* (working title, open decision). Short name for
repo / URL / storage keys: `rolling-bastion`.

---

## Start Here — Instructions for Claude Code

When the user says something like "look at concept.md and start" or "continue",
do this, in order:

1. **Read this whole document.** Then read §0 (current state), the last entries
   of the session log, and the open questions again; they tell you where the
   project stands.
2. **Check the repository state:** `git status`, `git log --oneline -15`, the
   current branch, the commit author identity, and whether build and tests
   pass (once the project exists).
3. **Tell the user in a few sentences** where the project stands and what you
   will do next, according to the build phases. If §0 and the repository
   disagree, say so and trust the repository.
4. **Work on the next unfinished phase only.** If the repository is empty apart
   from this file, that is Phase 0. Work on a feature branch, one commit per
   step.
5. **Stop at the end of each phase** and hand the build to the user to try.
   Never go past the decision milestone named in §0 without the user's
   explicit go-ahead.
6. **Follow the repository rules in "How We Work" without exception.**
7. **Ask instead of guessing** when something here is unclear, contradictory,
   or marked as an open decision. Ask one question at a time.
8. **Follow "When Things Go Wrong"** as soon as a problem resists a first fix.

**Keeping this document current is part of the job.** A new session starts
with no memory of earlier ones; this file and the git history are all it has.

- After every completed step that changes the state of the project, update §0
  in the same step.
- At the end of every phase, and before ending any session (also when the user
  says they are stopping, or when the context is getting full), update:
  - §0: status, current phase, next step, live version.
  - The session log: add an entry (format given there).
  - The relevant content sections, so they describe the project **as built**.
    Mark implemented sections with "(as implemented)" in their heading.
  - Open questions: add new ones and known issues; remove resolved ones.
- Record every decision the user makes (an approved value, a design change, a
  rejected idea) in the relevant section and in the session log, with the
  reason when one was given.
- Never delete the plan for phases that are not built yet.
- This document is committed to git: commit document updates together with the
  code they describe.

---

## 0. Current State (read this first)

| | |
|---|---|
| **Status** | Phases 0–1 merged into `main`. Phase 2 (drive & fight) built on branch `phase-2-drive-fight`, waiting for the user to try it before merging. |
| **Current phase** | 2 — done, awaiting user check |
| **Next step** | User confirms the frame-rate fix on their machine (F2 ×2, F3, F1); then merge `phase-2-drive-fight` → `main`. Then Phase 3, which now starts with firing arcs + turret/icon graphics (§2.10, §6). Open: build that first as its own step, or inside Phase 3 (§12). |
| **Decision milestone** | **Phase 3** — one full 12-minute run with the core tile set, line/row bonuses, grid expansion, upgrades and the Sapper. Do not build past it without the user's go-ahead. |
| **Live version** | none (local only); app version 0.2.0 |
| **Repository** | Private GitHub repository https://github.com/lead0lead/rolling-bastion, branch `main` |
| **Play URL** | Runs locally: `npm install`, then `npm run dev` |
| **Target** | Desktop browsers (current Chrome, Firefox, Edge, Safari), keyboard + mouse, 1280×720 and up. Out of scope for the prototype: mobile/touch, gamepad, accounts, servers, saving runs. |
| **Last updated** | 2026-10-19 (Phase 2 drive & fight) |

---

## 1. Core Concept

A survivor-like ("bullet heaven") in the vein of *Vampire Survivors*, with the
moving-city fantasy of *Monsters are Coming! Rock & Road* (Ludogram/Raw Fury,
2025) — taken as inspiration only. The twist: **the city's shape is the
build.** You assemble the city from tetromino-style pieces on a small grid.
Pieces carry weapons and abilities on specific cells; where you put them
decides what they buff, what they protect and what gets torn off first.

You only steer the city. All tiles act automatically. The game pauses on
every level-up so you can pick and place a new piece, and rearrange the city.

Audience for the prototype: the developer and a few testers. Goal: find out
whether the grid puzzle makes a survivor-like run more interesting.

**Design pillars**

- **Space is the resource.** Every decision is about which cell gets what. If
  a feature doesn't interact with grid space, adjacency or connectivity, it
  needs a strong reason to exist.
- **Calm puzzle, hectic drive.** Placement happens in a paused, readable build
  screen; combat is pure steering and dodging. Never require precise placement
  under time pressure.
- **Readable at a glance.** Any tile's function, and whether it is online,
  must be readable from its colour and icon in under a second, in combat and in
  the build screen.
- **Power fantasy first.** Survivors-casual: the player should usually feel
  strong. Losing tiles is chip damage and a reason to re-plan, not a run-ender.
- **Connected or useless.** A tile only works while it has a path to the Core.

**Targets**

- Run length: 12:00 of survival, then a boss.
- First level-up within ~15 s; level-ups roughly every 20–40 s early, ~45–60 s late.
- Performance: stable 60 fps with 600 enemies and 300 projectiles on a mid-range
  laptop in Chrome.
- Prototype scope: ~12 tile types, ~14 piece shapes/variants, 6 enemy types
  plus 1 boss.

---

## 2. Core Mechanics

All numbers are **starting values to tune**, kept in `src/config/` (see §9).

### 2.1 The grid

- The city lives on a square grid. **Starting size 6×6**, expanding to **8×8**
  at 4:00 and **10×10** at 8:00 (each expansion adds one ring of cells around
  the current grid; the layout stays centred). Expansion happens with a free
  build pause and a short "GRID EXPANDED" banner.
- One cell = 32×32 world pixels. The city's world footprint is its occupied
  cells; empty cells don't exist in the world (they're only build space).
- The **Core** (1×1) starts at the grid centre and is placed automatically.
- The city never rotates in the world; grid "up" is screen up.

### 2.2 Pieces and tiles

- A **piece** is a polyomino of 1–5 cells (shapes: monomino, domino, I3, L3,
  the 7 tetrominoes, plus a few pentominoes later). Each cell of a piece is a
  **tile** of a given type (Hull, Gatling, Generator, …). Piece definitions are
  data: shape + tile type per cell.
- Typical offers: one or two "function" tiles plus Hull filler, e.g. a T-piece
  with a Cannon on the nose and three Hull, or an L-piece with Gatling, Gatling,
  Generator.
- After placement, **tiles are individual** for damage purposes. The piece
  remains only as the grouping that moves together in the build screen.

### 2.3 Placement and rearranging (build pause) (as implemented, Phase 1 sandbox)

- Triggered by: level-up, grid expansion. The game is fully paused.
- The player chooses 1 of 3 offered pieces (see §2.8) and places it:
  - Must lie fully inside the grid, on empty cells.
  - Rotate in 90° steps (R or right-click). No mirroring (open: maybe later).
- During the same pause the player may **move and rotate any already placed
  piece** freely (drag). The Core can be moved too.
- **Confirm rule:** the pause can only be closed when every tile is
  orthogonally connected to the Core. Invalid cells and disconnected tiles are
  highlighted red; the confirm button explains why it's disabled.
- **Scrap:** any placed piece can be scrapped (removed for good) during the
  pause, refunding 25% of the current level's XP requirement. This is the
  escape hatch when space runs out or a layout can't be connected.
- Edge case — **split pieces:** if destruction splits a piece into
  disconnected parts, each part becomes its own movable group.
- Edge case — **offline tiles at pause start** must be reconnected or scrapped
  before confirming.

As implemented (Phase 1, `src/sim/build.ts` + `src/scenes/BuildScene.ts`):

- Exactly one offer must be taken per pause (placed, or picked and scrapped)
  before confirming. A picked offer can be put back (Esc / release outside
  the grid) and another picked, until one is placed.
- Picking up: press on a card or a placed tile. Drag and release to drop, or
  click once to carry it and click again to drop. The piece is held by the
  cell you grabbed; rotation keeps that cell under the pointer.
- An invalid drop (out of bounds / overlap) keeps the piece in hand with
  red cells; releasing outside the grid and scrap zone puts it back where it
  came from. Disconnected placement is allowed but shown red (grey tile, red
  frame, broken-link mark) and blocks confirm.
- Confirm is disabled while holding a piece, before taking an offer, or while
  any tile is offline; the reason is shown above the button.
- The Core can be moved but not scrapped. Scrap refund (25% XP) is not wired
  yet: there is no XP until Phase 2.
- Sandbox only: confirming rolls a fresh offer from `SANDBOX_POOL` and the
  same city carries on. The screen shows the last and average pause
  duration (for the "build screen too slow" risk, target <10 s).

### 2.4 Connectivity (as implemented: flood fill + brute-force bridges, `src/sim/connectivity.ts`)

- Connectivity = orthogonal adjacency path through occupied tiles to the Core,
  recalculated (flood fill) whenever a tile is destroyed.
- **Disconnected tiles go offline:** they stop functioning (no firing, no
  buffs) and are drawn greyed with a broken-link icon, but keep their HP, stay
  part of the city's body and can still be hit. They come back online when
  reconnected in the next build pause.
- A **bridge tile** is a tile whose loss would disconnect others. The build
  screen can show bridges with a toggle (helps the player plan redundancy;
  also used by the Sapper, §4.3).

### 2.5 Movement (as implemented)

- Free 8-direction movement, WASD/arrows, no momentum (instant
  start/stop, with a short 0.08 s ease to avoid jitter).
- Base speed **150 px/s**. City size penalty: −2% per tile above 10 tiles,
  floored at 55% of base. Each **Engine** tile adds +12% of base (applied
  after the penalty).
- The arena is unbounded; the camera follows the city.
- The city's tiles are its hitbox. Enemies collide with tiles, not with a
  single circle.
- As implemented: the ease is an exponential approach with time constant
  0.08 s; the city's world position is its grid centre, so grid expansion
  and rearranging don't move it. Numbers in `MOVE` (`src/config/balance.ts`).

### 2.6 Combat (as implemented for Core pistol, Gatling, Cannon)

- Weapons **auto-target the nearest enemy within range** and within their
  firing arc (§2.10; 360° for the Core pistol), measured from the tile's
  centre. Projectiles pass over the city's own tiles (no line of
  sight).
- Enemies move towards the **nearest tile** and attack the tile they touch
  (contact damage per second), so outer tiles take the hits.
- Damage to a tile reduces its HP; at 0 HP the tile is **destroyed for good**
  and its cell becomes empty. Connectivity is recalculated immediately.
- **Lose condition:** the Core is destroyed. Nothing else ends the run.
- **Win condition:** survive to 12:00 and defeat the boss. If the boss is
  still alive at 14:00, it enrages (+100% damage).
- Damaged (not destroyed) tiles do not heal by themselves; only Repair Bays
  and the "Repair Core" level-up option heal.
- As implemented: weapons fire projectiles (speed, size, spread, knockback per
  weapon in `TILES[*].weapon`); a projectile hits the first enemy it touches
  and is gone. Enemies push each other apart and are pushed out of tiles;
  an enemy within 1 px of a tile damages that one tile. Win condition and
  boss are not built yet (Phase 3/4).

### 2.7 Synergies

Three layout rules give placement its depth:

1. **Exposure** — follows from §2.6: the outer ring takes all contact damage.
2. **Adjacency buffs** — support tiles affect only their 4 orthogonal
   neighbours. Same-type buffs stack additively, capped (see tile table).
3. **Lines and rows** (the Tetris nod):
   - **Weapon chains:** 3+ identical online weapon tiles in an unbroken
     straight orthogonal line form a chain: every tile in it gets +50% damage
     (3), +100% (4), +150% (5+). Drawn as a glowing link line. A tile can be
     in a horizontal and a vertical chain; use the higher bonus, don't add.
   - **Filled rows/columns:** a row or column of the *current* grid that is
     completely filled with online tiles grants every tile in it +15% damage
     and +15% max HP. Row and column bonuses stack (max +30%). Losing one tile
     breaks it; grid expansion "unfills" all edge-to-edge lines, which is
     intended.

### 2.8 XP, levels and offers (as implemented except duplicate upgrades)

- Killed enemies drop **XP gems** (value 1, 3 or 10 by enemy type). A gem is
  collected when it comes within the pickup radius (24 px) of **any** tile —
  a wider city sweeps more XP. Magnet tiles increase the radius.
- XP to next level: `5 + 4 × level` (starting value). Excess XP carries over;
  multiple level-ups chain into consecutive build pauses.
- **Level-up offer:** 3 pieces, weighted random from the pool, plus two fixed
  options: **Repair Core** (heal Core 35% of max HP, instead of a piece) and
  **Reroll** (2 per run).
- As implemented: Repair Core heals up to 35% of max HP, is a toggle in the
  build screen and is disabled at full HP. Reroll and Repair are also on
  keys 4 / 5. Scrap refund is 25% of the current level's requirement per
  placed piece (scrapping a fresh offer refunds nothing). Gems are cyan
  diamonds; beyond 400 live gems new XP is added to an existing gem.
- **Duplicates upgrade instead of placing:** if an offered piece contains a
  tile type the player already owns, the card shows an alternative "Upgrade
  <type>" button. Taking it gives that whole tile type +1 level (max 5) and
  the piece is not placed. Space and power are separate choices.
  - Per level: +25% damage (weapons) or +20% effect (support).
  - Level 3 and 5 add one named perk per type (e.g. Gatling L3: +1 projectile;
    Cannon L5: shots pierce 3). Perks are listed per tile in the config.

### 2.9 Tile catalogue (prototype)

Colour codes are part of the readability pillar (§6).

| Tile | HP | Function (level 1) | Placement tension | Phase |
|---|---|---|---|---|
| **Core** | 250 | Pistol: 8 dmg, 2 shots/s, range 200 | Wants to be buried | 1 |
| **Hull** | 40 | None | Connector, cheap armour | 1 |
| **Plating** | 120 | None | Outer edge | 3 |
| **Gatling** | 35 | 4 dmg, 8 shots/s, range 220 (270 with its 180° arc, §2.10) | Chains well, facing | 2 |
| **Cannon** | 35 | 30 dmg, 0.8 shots/s, range 300 (380 with its 90° arc, §2.10), knockback | Chains well, edge + facing | 2 |
| **Mortar** | 35 | 20 dmg AoE r=48, 0.5 shots/s, range 80–350 | Can sit deep inside | 3 |
| **Saw** | 60 | 25 dmg/s to touching enemies | Must be on the edge | 3 |
| **Generator** | 30 | +25% fire rate to neighbours (cap +75%) | Centre of a weapon cluster | 3 |
| **Shield Emitter** | 30 | Neighbours take −40% damage (cap −60%) | Next to valuables | 3 |
| **Repair Bay** | 30 | Heals neighbours 3 HP/s (not destroyed tiles) | Interior | 3 |
| **Magnet** | 30 | +30% pickup radius city-wide (cap +150%) | Anywhere | 3 |
| **Engine** | 30 | +12% base speed | Anywhere (rear by taste) | 3 |

### 2.10 Firing arcs (design, decided 2026-10-19, to build in Phase 3)

The user wanted to try weapons that only fire in an arc, so facing becomes
part of the layout puzzle (this replaces the "auto-aim makes layout shallow"
fallback from §12).

- **Which tiles:** Cannon 90° arc, Gatling 180° arc. Core pistol stays
  360°. Later tiles (Mortar, Saw) get decided when they are built.
- **Facing is set by rotating the piece.** Each arc tile carries a facing
  (up/right/down/left) in its piece definition; rotating the piece with R
  rotates the facing. No separate per-tile control. The city never rotates
  in the world, so facing is a fixed compass direction: the player also
  steers to bring guns to bear.
- **Compensation: more range** for arc weapons. Starting values: Cannon
  300 → 380, Gatling 220 → 270 (tune in Phase 3).
- **Targeting:** nearest enemy that is within range *and* within the arc
  (angle from the tile centre to the enemy, centred on the facing).
- **Readability:** weapon tiles get a barrel that turns toward the current
  target within its arc and rests along its facing when idle. Arcs are drawn
  as faint wedges in the build screen (for the held/hovered piece, plus a
  toggle to show all), not in combat.
- Implementation sketch: `arcDeg` on `WeaponDef` (360 = no arc), `facing`
  per piece cell and `PlacedTile`, rotated with the piece; per-weapon last
  aim angle kept for rendering.

---

## 3. Controls & Camera

| Action | Input |
|---|---|
| Drive | WASD / arrow keys |
| Pause menu | Esc |
| Build: pick offer | Click card, or 1/2/3 |
| Build: place / move piece | Drag with left mouse |
| Build: rotate held piece | R or right-click |
| Build: scrap piece | Drag onto scrap zone, or hover + X |
| Build: toggle bridge view | B |
| Build: confirm | Enter / button (disabled while invalid) |
| Debug overlay | F1 (dev builds only, see §8) |

**Camera:** top-down, follows the city centre with light smoothing, fixed zoom
(prototype). At 10×10 the city is 320 px wide; zoom must keep at least ~400 px
of space visible around the city on all sides at 1280×720 — zoom out stepwise
on grid expansion if needed.

**Readability rules (override visual style):**

- Offline tiles are always visibly greyed with an icon.
- Tile HP below 50% shows cracks; below 25% blinks slowly.
- The build screen shows the grid large, centred, with the city as it is
  (including damage) and the offered pieces beside it with tooltips listing
  exact numbers.
- Enemies, projectiles, gems and the city use distinct colour families so
  they never blend (see §6).

---

## 4. Content & Structure

### 4.1 Run structure (12:00)

| Time | Event | New element |
|---|---|---|
| 0:00 | 6×6 grid, Core only | Swarmers |
| 1:00 | | Runners |
| 2:30 | Mini-wave spike | Brutes |
| 4:00 | **Grid → 8×8** | Spitters |
| 5:30 | | Sappers |
| 7:00 | Elite Brute (drops 3 offers' worth of XP) | Bombers |
| 8:00 | **Grid → 10×10** | All types mixed |
| 10:00 | Final swarm escalation | Spawn rate ×1.5 |
| 12:00 | **Boss** | Spawns stop except boss adds |

Spawn rules: enemies spawn on a ring just outside the visible area around the
city. Spawn budget per second grows over time from a wave table in config.
Soft cap of 600 live enemies; beyond it, spawns are converted into elites.

As implemented (Phase 2, `src/config/waves.ts`, `src/sim/spawner.ts`): spawn
groups (single Swarmer, Swarmer pack 3–5, Runner line 8–12) are picked by
weight from the current wave entry and spawned when the budget covers their
cost; budget/s is interpolated 0.9 (0:00) → 2.0 (1:00) → 3.5 (4:00) → 6
(8:00) → 9 (10:00) → 10 (12:00). 2:30 spike: 40 Swarmers around the ring.
Above 600 live enemies spawns are skipped (elites not built yet). Enemies
left far behind are moved back onto the ring ahead of the city.

### 4.2 Piece pool

- Phase 2 pool: Gatling and Cannon pieces in 3–4 shapes each, plus pure Hull
  pieces.
- Phase 3 pool: all tile types, ~14 piece definitions, weighted so support
  tiles appear about 1 in 3 offers. Pentominoes only after 4:00.
- Offers never show three cards of the same tile type.

### 4.3 Enemies

| Enemy | HP | Speed (px/s) | Damage | XP | Behaviour | Tests |
|---|---|---|---|---|---|---|
| **Swarmer** | 10 | 60 | 5/s contact | 1 | Walks to nearest tile | Outer armour |
| **Runner** | 6 | 140 | 4/s contact | 1 | Comes in lines of 8–12 | DPS, chains |
| **Brute** | 120 | 45 | 20/s contact | 10 | Tanky | Plating, Saws |
| **Spitter** | 25 | 55 | 8 per shot, 1 shot/2 s, range 240 | 3 | Keeps distance, shoots nearest tile | Shields, Mortars |
| **Sapper** | 30 | 90 | 15/s contact | 3 | Targets the nearest **bridge tile**, ignores others unless blocked | Redundant connections |
| **Bomber** | 20 | 80 | 40 to every tile in a 3×3 area on contact, then dies | 3 | Rushes the city | Not stacking value in one blob |
| **Boss: Colossus** | 6000 | 35 | 60/s contact | — | 3 phases: walks + summons Swarmers; adds Spitter volleys; charges in straight lines at <30% HP | Whole build |

Enemy HP scales +6% per minute (starting value).

---

## 5. Story, Tone & Text

Minimal for the prototype. Premise (draft, for the user to rewrite): *The
world is ending in a tide of black shapes. The last city has torn itself from
its foundations and rolls on, bolting on whatever it can salvage.*

Tone: playful-grim, toy-like. UI text short and functional. Draft strings:

- Level-up title: "Salvage!" (draft)
- Grid expansion banner: "GRID EXPANDED" (draft)
- Lose screen: "The Core has fallen." (draft)
- Win screen: "The city rolls on." (draft)

---

## 6. Look

**Style:** clean geometric — flat shapes, a dark background with a subtle grid
pattern, bright tile colours, glow and screen-shake on impacts. Inspiration
only: *Monsters are Coming* for the moving city fantasy; minimal geometric
shooters for clarity.

Concrete elements:

- **Decided 2026-10-19 (user):** letters are not enough. Tiles get real
  procedural icons, and weapons get turning barrels that show where they aim
  (§2.10). A first version of this comes with firing arcs in Phase 3, ahead
  of the full look pass in Phase 5.

- Tiles: rounded squares with a 2 px darker border; function shown by a
  simple white icon (gun barrel, circle, bolt, cross…). Placed pieces get a
  slightly lighter outline so piece groups are visible.
- Colour families: **city** in cool/neutral (Hull grey, Plating steel blue);
  **weapons** warm yellows/oranges; **support** greens/teals; **Core** white
  with a pulse. **Enemies** are dark magenta/black shapes with a bright
  outline. **Gems** cyan. **Enemy projectiles** red.
- Effects: hit flash (white, 1 frame), death pop (particles), tile destruction
  burst + small shake, chain link lines, generator pulse.
- All visuals drawn procedurally (Phaser Graphics or generated textures) — no
  external art needed in the prototype. Any external asset that is added gets
  an entry with source and licence in `ASSETS.md`.

---

## 7. Audio

Placeholder only in the prototype: a handful of CC0 sound effects (shot,
hit, tile destroyed, level-up, gem pickup), from sources like Kenney or
freesound (CC0 filter), each listed in `ASSETS.md`. One global mute toggle
(M). No music yet. Gem pickup sounds are rate-limited to avoid noise.

---

## 8. UI, Progress & Saving

**HUD (as implemented):** run timer (top centre), XP bar (top, full width), level, Core HP
bar (bottom centre), current grid size, reroll count, kills.

**Screens:** title (Start, Mute) → run → build pause overlay → lose/win
summary (time survived, kills, level, final city layout snapshot) →
restart.

**Saving:** none. Only the mute setting is stored in `localStorage` under
`rolling-bastion:settings` (wrapped in try/catch).

**Debug tooling** (dev builds, or `?debug=1` in the URL):

- F1 overlay: FPS, live enemy/projectile counts, current spawn budget,
  game time. (as implemented, plus gem count, god mode and selected enemy)
- Run (as implemented): `F2` grows the grid and opens a free build pause.
- Build screen (Phase 1): `F2` expand grid, `Delete` destroy the hovered
  tile (tests splits and offline tiles).
- Keys: `G` +1 level, `T` +60 s game time, `E` spawn 50 of the selected
  enemy type, `[`/`]` change selected type, `I` god mode (Core invulnerable),
  `K` kill all enemies, `P` print city layout JSON to console.
- `?seed=<n>` for a fixed random seed (spawns and offers).
- `?sandbox=1` opens the Phase 1 build-screen sandbox instead of a run.
- `npm run bench`: simulation performance check (600 enemies, 300
  projectiles), outside `npm test`.
- Live tuning: config values readable from a JSON override in
  `localStorage` so values can be tweaked without rebuilding (stretch goal
  for Phase 2).

---

## 9. Tech Stack & Code Structure

| Part | Choice | Why |
|---|---|---|
| Language | TypeScript (strict), pinned 6.0.x — 7.x is not yet supported by typescript-eslint | Safety for the simulation logic |
| Engine | Phaser 3 (pinned 3.90.0, latest 3.x; Phaser 4 exists but is not used) | Rendering, input, scenes, pooling, camera out of the box |
| Build | Vite | Fast dev server, simple static build |
| Tests | Vitest | Same toolchain as Vite |
| Lint/format | ESLint + Prettier | Consistency |
| Hosting | None for the prototype (local) | Decide when sharing (§12) |

**Key technical rules**

- **Simulation separate from rendering.** Grid model, connectivity,
  synergies, combat maths, spawning and the XP/offer logic live in plain TS
  modules under `src/sim/` with no Phaser imports. Phaser scenes read sim
  state and render it, and translate input into sim commands. This keeps
  the core unit-testable and allows a headless balance sim later.
- **Fixed timestep** for the simulation (60 Hz), render interpolated.
- **Seeded RNG** for all gameplay randomness.
- **Content as data:** tiles, pieces, enemies, wave table and all tuning
  numbers in `src/config/*.ts` (typed objects). No magic numbers in logic.
- **Performance:** object pools for enemies, projectiles, gems; a uniform
  spatial hash for enemy↔tile collision, targeting and gem pickup;
  connectivity, chain and row bonuses recomputed only when the city changes
  (placement, destruction, pause confirm), not every frame.
- Units: world pixels and seconds throughout.

**Data sketches**

```ts
type TileType = 'core' | 'hull' | 'plating' | 'gatling' | 'cannon' | 'mortar'
  | 'saw' | 'generator' | 'shield' | 'repair' | 'magnet' | 'engine';

interface PieceDef { id: string; cells: { x: number; y: number; tile: TileType }[]; weight: number; minTime?: number; }

interface PlacedTile { id: number; type: TileType; gx: number; gy: number; hp: number; groupId: number; online: boolean; }

interface CityState { gridSize: number; tiles: PlacedTile[]; typeLevels: Record<TileType, number>; }
```

**Folder structure**

```
src/
  main.ts            // Phaser game config, boot
  config/            // tiles.ts, pieces.ts, enemies.ts, waves.ts, balance.ts
  sim/               // pure logic, no Phaser
    grid.ts          // placement, rotation, bounds, expansion
    connectivity.ts  // flood fill, bridge detection
    synergies.ts     // adjacency, chains, filled rows
    combat.ts        // targeting, damage, destruction
    spawner.ts
    build.ts         // build-pause session: pick, move, rotate, scrap, repair, reroll
    progression.ts   // XP, levels, offers, gems, build results
    rng.ts
    world.ts         // run state, city cache (cells, centres, speed, weapons)
    step.ts          // fixed tick: movement, spawner, enemies, weapons, gems
    enemies.ts       // chase, separation, tile collision, contact damage
    spatialHash.ts   // enemy hash for projectile hits and separation
    debugActions.ts
  scenes/            // Boot, Run, Hud, Build (overlay + ?sandbox=1), Summary
  render/            // tiles.ts (tile drawing, label/sprite pools), textures.ts
  debug/             // flags.ts: DEBUG (dev or ?debug=1), SEED (?seed=), SANDBOX
bench/               // sim.perf.ts, run with npm run bench
tests/               // Vitest, mirrors src/sim
```

Ask the user before adding any library not listed here.

---

## 10. How We Work

### Repository rules

- Private GitHub repository. Everything is committed, including `concept.md`
  and `CLAUDE.md`.
- `.gitignore`: `node_modules/`, `dist/`, `.DS_Store`, `*.local`, `.env*`.
- Commit messages: imperative, short subject line (`Add connectivity flood
  fill`), body when useful.
- **Commit author identity:** never change it. At the start of Phase 0,
  show the user the output of `git config user.name` / `git config
  user.email` and point it out if it reveals something they may not want in
  the history (habit worth keeping even for a private repo).
- If something is committed by mistake (secrets, large files): stop and tell
  the user; no history rewrite unless asked.
- Branches: `main` stays working. Each phase on `phase-N-<topic>`, merged
  into `main` when the user has tried the phase and agreed.

### Workflow

- Start every session by reading §0, the session log, and the open questions.
- New features: brainstorm with the user (questions one at a time, 2–3
  approaches with a recommendation) → short design spec → implementation plan
  → feature branch, one commit per step.
- Build, type check and tests must pass before every commit.
- No hosting yet: at the end of each phase, tell the user to run
  `npm run dev` (and `npm run build && npm run preview` for a production
  check) and what to try.
- Unit-test pure logic (grid, connectivity, synergies, progression, combat
  maths). Check behaviour manually on a production build.
- **Decisions about feel and taste belong to the user.** After changing how
  something feels or looks, hand over a build to try instead of judging it
  yourself. Report tuning values changed.
- Create a `CLAUDE.md` in Phase 0 summarising these rules and pointing here.

### When Things Go Wrong

Long unsuccessful attempts waste the user's usage limit and bury the session
in noise. Prefer stopping early with a clear report.

- **Three attempts, then stop.** If the same problem survives three distinct
  fix attempts, stop. Report: what the symptom is, what was tried and why each
  attempt failed, what you now suspect, and two or three options. Wait for the
  user.
- **Diagnose before fixing.** Reproduce the problem and find the cause
  (logging, a minimal test, debug tooling) before changing code. Do not stack
  speculative changes; revert a failed attempt before trying the next.
- **Never make a check pass by weakening it.** Do not delete, skip, or loosen
  tests, type checks, or lint rules to get past an error, and do not hide
  errors with empty catches or ignore-comments. If a test is wrong, say so and
  ask.
- **Problems you cannot observe** (how something feels, looks, or sounds; a
  bug only the user sees): do not iterate on guesses. Ask the user for exact
  steps and what they saw, or add a way to display the relevant values.
- **Broken build:** `main` must always build and run. If it breaks, tell the
  user at once and propose reverting to the last good commit first, then fix
  on a branch.
- **Unexpected state** (unknown files, uncommitted changes you did not make,
  history that does not match the log): stop and ask before changing anything.
- **Stay in scope.** Do not refactor or "improve" unrelated code while fixing
  something. Note the idea in the open questions instead.
- **Write it down.** Record each failed approach and its cause in the session
  log, and unresolved problems in the open questions, so a later session does
  not repeat them.
- **Keep sessions short.** At a phase boundary, or when the context is filling
  up, update this document and suggest that the user start a fresh session.

---

## 11. Build Phases

Each phase ends with something the user can try, and a short check by them.

| Phase | Content | Done when |
|---|---|---|
| **0. Setup** | Vite + TS + Phaser scaffold, ESLint/Prettier, Vitest with one passing test, `.gitignore`, `CLAUDE.md`, version label on screen, `README` with start commands. Push to the private repo. | `npm run dev` opens a dark screen with the version label; `npm test` passes. |
| **1. Grid sandbox** | `sim/grid.ts` + `connectivity.ts` with tests (placement, bounds, rotation, connectivity, bridge detection, split groups). Build screen as a standalone scene: offer 3 random pieces from a test pool, drag/rotate/move/scrap, red invalid feedback, confirm rule, bridge toggle. Grid expansion via debug key. | The user can build cities by hand and the rules feel right in the build screen. |
| **2. Drive & fight** | City driving with size penalty, camera. Swarmers + Runners, spawner with wave table, spatial hash, pools. Core pistol, Gatling, Cannon with auto-targeting. Tile HP, destruction, offline tiles. XP gems, levels, offers (with Repair Core and reroll), build pause wired in. HUD, lose screen, debug tools. | A complete but simple run loop: drive, level, place, lose tiles, die. 60 fps at 600 enemies. |
| **3. Layout depth — DECISION MILESTONE** | Firing arcs for Gatling/Cannon (§2.10) with turret barrels, arc wedges in the build screen and procedural icons for all tiles (replacing letters); build screen tiles drawn as textures too. Remaining tiles (Plating, Mortar, Saw, Generator, Shield, Repair, Magnet, Engine). Adjacency buffs, weapon chains, filled-row bonuses with visuals. Duplicate upgrades with L3/L5 perks. Timed grid expansion. Brutes, Spitters, Sappers, Bombers, full 12-minute wave table, boss placeholder (big Brute) and win screen. One tuning pass with the user. | **The user plays several full runs and decides whether the grid puzzle is fun enough to continue**, or what to change first. |
| **4. Boss & balance** | Colossus with 3 phases, enrage. Balance pass using debug tools and, optionally, a headless sim to compare builds. More piece shapes. | A run has a satisfying climax; no single obviously dominant build. |
| **5. Look & juice** | Final geometric style per §6: icons, colours, effects, screen shake, damage cracks, chain/row visuals, title screen. | The game looks finished in screenshots and stays readable at 600 enemies. |
| **6. Audio, menus, polish** | SFX set, mute, pause menu, summary screen with layout snapshot, settings. | Feature-complete prototype. |
| **7. Shareable build** | Choose hosting (§12), deploy, `ASSETS.md` complete. | A link friends can open. |

The early phases are the prototype. If the core idea does not work at the
decision milestone, change the design before building more content.

---

## 12. Open Questions & Known Risks

**Open decisions (user)**

- Final title (working title: *Rolling Bastion*).
- Hosting for sharing (Phase 7): itch.io, Netlify/Vercel, or making the repo
  public for GitHub Pages.
- Piece mirroring allowed or not.
- Meta-progression after the decision milestone (unlocks, permanent stats).
- Scheduling of firing arcs + icons: a separate first step of Phase 3 that
  the user tries on its own (Claude's recommendation), or built together with
  the rest of Phase 3.
- All story and UI text in §5 is draft.
- Phase 1 build-screen calls made without asking (confirm or change):
  one offer must be taken per pause (no "skip"); scrapping a fresh offer
  counts as taking it; an invalid drop keeps the piece in hand; tile labels
  are placeholder letters/symbols in white with a dark outline (real icons in
  Phase 5); offer card piece previews are small (22 px cells).

**Risks**

- **Auto-aim makes layout shallow.** Depth rests on exposure, adjacency and
  lines/rows. *Mitigation:* firing arcs for Gatling and Cannon (§2.10),
  decided 2026-10-19. *Checked:* Phase 3.
- **Arcs make the early game too weak** (few weapons, not covering every
  side). *Mitigation:* Core pistol stays 360°, arc weapons get more range;
  tune in Phase 3. *Checked:* Phase 3.
- **Permanent destruction frustrates in a casual game.** *Mitigation:*
  frequent level-ups, Repair Core option, scrap refund, tuned enemy damage;
  watch whether players lose runs to snowballing tile loss. *Checked:*
  Phases 2–3.
- **Grid full too early → power stalls.** *Mitigation:* duplicate upgrades,
  expansion timing. *Checked:* Phase 3.
- **Build screen too fiddly/slow** (many pauses per run). *Mitigation:* keep
  pieces small, keyboard shortcuts, measure average pause duration (target
  <10 s). *Checked:* Phase 1–2.
- **Performance with tile-based hitboxes.** *Mitigation:* spatial hash, pools,
  recompute city-derived data only on change. *Checked:* Phase 2 (debug
  spawn 600 enemies).

**Known issues**

- Production build warns that the bundle chunk is >500 kB (it is Phaser).
  Harmless for now; could split Phaser into its own chunk later.
- Build-screen interaction (drag, click-carry, rotate, scrap) is covered by
  sim unit tests but was not clicked through by Claude; only static
  screenshots were checked.
- Sim performance (`npm run bench`, Node, this dev machine): ~2 ms average
  per tick with 600 enemies and 300 projectiles, p99 ~3 ms; rare 15–40 ms
  outliers (likely GC).
- The build screen still draws tiles as Graphics + text every frame; with a
  full 10×10 grid it may feel sluggish (it is paused, so no gameplay
  impact). To be redone with the icon textures in Phase 3.
- Spawns above the 600 enemy cap are skipped, not turned into elites.

---

## 13. Ideas for Later (not planned)

- Meta-progression: unlockable tiles and starting Cores with passives (like
  different cities in *Monsters are Coming*).
- Tile tags and sets (fire, frost, electric) with set bonuses.
- Obstacles and terrain in the arena; roads.
- Hero unit or pickup drone.
- Mobile/touch controls, gamepad.
- Daily seeded run with leaderboard.
- Headless sim for automated balance comparisons.

---

## 14. Session Log

One entry per working session, newest first. Keep entries short. This is the
handover to the next session, which has no memory of this one.

Format:

```
### YYYY-MM-DD — <phase and topic>
- Done: what was built or changed (with version or branch).
- Decisions: what the user decided, and why.
- Tried and failed: approaches that did not work, and the cause.
- State: does it build, do tests pass, what is deployed.
- Next: the exact next step.
- Watch out: anything a new session would otherwise get wrong.
```

### 2026-10-19 — Phase 2 feedback: performance fix, arcs and graphics design
- Done: frame-rate fix on `phase-2-drive-fight`. The user saw 30 fps with
  only 27 enemies and 3 projectiles but a large city. Diagnosed with a
  scratch build without tile drawing (53 ms → 4 ms per frame in headless
  WebGL): run tiles were redrawn every frame as Graphics rounded rects plus
  text labels, and Phaser's `Text.setColor` re-renders the text texture on
  every call. Now tiles are pre-rendered textures per type/online state drawn
  as pooled sprites (cracks as an overlay sprite), and `LabelPool` only sets
  changed properties. After: 4.6 ms per frame. Added F3 (fill grid with
  Gatlings) and sim/draw-prep timings in the F1 overlay.
- Decisions: pacing and feel approved ("building your base is genuinely
  fun"). Concept changes: real tile icons and aim indication instead of
  letters; firing arcs as an experiment. Brainstorm results (§2.10): facing
  set by rotating the piece (A); Cannon 90° and Gatling 180° arcs, Core 360°
  (B); arc weapons get more range (A); turning barrels + arc wedges in the
  build screen only (A).
- Tried and failed: caching label styles alone barely changed the headless
  measurement (15.4 → 14.7 ms, Canvas renderer); the tile Graphics were the
  main cost.
- State: typecheck, lint, 55/55 tests, build pass. Pushed. Not merged.
- Next: user confirms the fps fix; merge Phase 2; answer the scheduling
  question in §12; then Phase 3.
- Watch out: headless Firefox WebGL is software-rendered; compare scripts'
  per-frame time (rAF wrapper) between builds rather than reading FPS.

### 2026-10-19 — Phase 2: drive & fight
- Done: config for enemies (Swarmer, Runner), waves (groups, table, 2:30
  spike), weapons on tiles (Core pistol, Gatling, Cannon), `PHASE2_POOL`,
  balance sections (MOVE, CAMERA, SPAWN, COMBAT, XP, LEVEL_UP, SIM,
  UPGRADES). Sim: `world.ts`, `step.ts`, `spawner.ts`, `enemies.ts`,
  `combat.ts`, `spatialHash.ts`, progression (XP, gems, build results),
  build session (Repair Core toggle, reroll, scrap count), debug actions.
  Scenes: Run (fixed step, interpolation, camera, pooled sprites), Hud,
  Summary (lose screen), Build as overlay. Boot starts a run; `?sandbox=1`
  for the old sandbox. 55 tests, `npm run bench`. Version 0.2.0.
- Decisions: user approved Phase 1 ("looks nice") and asked to continue.
  Phase 1 build-screen calls in §12 were not commented on and are kept.
- Tried and failed: Vitest 5 has no `bench` export; replaced with a timed
  test file under `bench/` and its own config.
- State: typecheck, lint, 55/55 tests, build pass. Bench ~2 ms/tick.
  Not deployed.
- Next: user plays runs and checks fps; on approval merge, then Phase 3.
- Watch out: Vitest 5 hides console output of passing tests unless
  `--silent=false`. Headless screenshot tooling lives only in the session
  scratchpad (Firefox `--screenshot`, Canvas renderer forced, keys injected).

### 2026-10-19 — Phase 1: grid sandbox
- Done: `src/config/` (tiles.ts with all 12 tile types, pieces.ts with
  `SANDBOX_POOL` built from ASCII pictures, balance.ts), `src/sim/grid.ts`
  (placement, rotation, bounds, lift/drop groups, expansion, destruction with
  group splitting), `connectivity.ts` (online flood fill, bridges),
  `build.ts` (build-pause session), `progression.ts` (`rollOffers`), 35
  tests. `BuildScene` sandbox with all Phase 1 controls; Boot goes straight to
  it. Version 0.1.0. Branch `phase-1-grid-sandbox`.
- Decisions: user approved Phase 0 and asked to merge and start Phase 1.
  Claude's own calls are listed in §12 for the user to confirm.
- Tried and failed: headless Firefox screenshots are blank with WebGL
  (`--screenshot`, even with `preserveDrawingBuffer`); forcing the Canvas
  renderer in a scratch copy of `dist/` works for visual checks. The game
  itself is fine.
- State: typecheck, lint, 35/35 tests and build pass. Not deployed.
- Next: user tries the sandbox; on approval merge into `main`, then Phase 2.
- Watch out: `pkill -f <pattern>` inside a Bash call kills the calling shell
  if the pattern appears in its own command line.

### 2026-10-19 — Phase 0: setup
- Done: Vite 8 + TypeScript 6.0 (strict) + Phaser 3.90.0 scaffold, ESLint
  (typescript-eslint strict, Phaser imports banned in `src/sim/`) + Prettier,
  Vitest with a seeded RNG (`src/sim/rng.ts`, mulberry32) and 3 tests,
  `.gitignore`, `CLAUDE.md`, `README.md`, Boot scene with title and version
  label (from `package.json` via Vite `define`). Branch `phase-0-setup`.
- Decisions: none by the user yet. Tooling choices: TS pinned to 6.0.x
  (typescript-eslint peer range is <6.1); package.json is imported as JSON
  in `vite.config.ts` instead of adding `@types/node` (not on the library
  list). All dependencies pinned exactly.
- Tried and failed: nothing notable.
- State: typecheck, lint, tests (3/3) and build pass. Not deployed.
- Next: user tries Phase 0; on approval merge into `main`, then Phase 1.
- Watch out: git author is `lead0lead` with a GitHub noreply email (fine).

### 2026-10-19 — Planning
- Done: this concept document, from a brainstorming session. No code yet.
- Decisions: browser, Phaser 3 + TS + Vite; player steers the city only
  (free 8-dir), weapons auto-aim 360°; build pause on level-up with free
  rearranging; tiles destroyed permanently, Core death = loss; pieces have
  modules baked in; grid 6×6 → 10×10; adjacency + line/row synergies;
  duplicates upgrade a tile type; 12-min timer + boss; level-ups as the only
  acquisition; no meta-progression; clean geometric look; Sapper before the
  decision milestone (Phase 3).
- State: empty repository.
- Next: Phase 0 (setup).
- Watch out: all numbers are untested starting values; keep sim free of
  Phaser imports; private repo, concept and CLAUDE.md are committed.
