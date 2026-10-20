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
| **Status** | Phases 0–4 merged into `main` (v0.5.0). Phase 5 built on `phase-5-look-juice` (v0.6.0), pushed, not merged. Handed to the user to try. |
| **Current phase** | 5 — Look & juice: done, waiting for the user's look and frame-rate check |
| **Next step** | User plays: look and feel (agar.io style, faces, effects), frame rate with 600 enemies (F1 overlay). Feedback, then merge and Phase 6 (audio, menus, polish) on the user's go-ahead. |
| **Decision milestone** | **Phase 3 — passed 2026-10-20** (user: fun, numbers work well, continue). No further milestone gates; still stop at the end of each phase. |
| **Live version** | none (local only); app version 0.6.0 |
| **Repository** | Private GitHub repository https://github.com/lead0lead/rolling-bastion, branch `main` |
| **Play URL** | Runs locally: `npm install`, then `npm run dev` |
| **Target** | Desktop browsers (current Chrome, Firefox, Edge, Safari), keyboard + mouse, 1280×720 and up. Out of scope for the prototype: mobile/touch, gamepad, accounts, servers, saving runs. |
| **Last updated** | 2026-10-20 (Phase 5 built, handed over) |

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

### 2.1 The grid (as implemented)

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

### 2.6 Combat (as implemented)

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
  an enemy within 1 px of a tile damages that one tile. Mortar shells are
  lobbed: they fly to the target point (over everything) and damage every
  enemy within the blast radius there. Win condition and boss placeholder:
  see §4.3 (Phase 3b); the full Colossus comes in Phase 4.

### 2.7 Synergies (as implemented, Phase 3b)

Three layout rules give placement its depth:

1. **Exposure** — follows from §2.6: the outer ring takes all contact damage.
2. **Adjacency buffs** — support tiles affect only their 4 orthogonal
   neighbours. Same-type buffs stack additively, capped (see tile table).
3. **Lines and rows** (the Tetris nod):
   - **Weapon chains:** 3+ identical online weapon tiles **with the same
     facing** in an unbroken straight orthogonal line form a chain (decided
     2026-10-20: a "battery" of guns, so rotation is part of the chain
     puzzle): every tile in it gets +50% damage
     (3), +100% (4), +150% (5+). Drawn as a glowing link line. A tile can be
     in a horizontal and a vertical chain; use the higher bonus, don't add.
   - **Filled rows/columns:** a row or column of the *current* grid that is
     completely filled with online tiles grants every tile in it +15% damage
     and +15% max HP. Row and column bonuses stack (max +30%). Losing one tile
     breaks it; grid expansion "unfills" all edge-to-edge lines, which is
     intended.

As implemented (`src/sim/synergies.ts`, numbers in `LINES` and the tile
config): a pure pass over the city computes per-tile modifiers whenever the
city changes. Only online tiles give buffs; offline tiles still receive
shield protection and healing.

- **How bonuses combine** (Claude's call): weapon damage = base × level
  multiplier × (1 + chain bonus + filled-line bonus + Generator L3 bonus).
  Max HP = base × (1 + level HP + filled-line bonus + Hull L3 bonus).
  Shield: 1 − min(sum, cap). Fire rate: 1 + min(sum of Generators, cap).
- When max HP rises, the tile gains the difference as HP; when it falls, HP
  is clamped.
- Generators speed up every weapon neighbour, including the Core pistol and
  the Saw's contact damage.
- Chains include Saws and Mortars (no arc, facing ignored). Chains draw as a
  white link line with dots through the tile centres; filled rows/columns
  as a pale cyan frame. Both in the build screen (live while placing) and in
  combat. The build screen lists the number of chains and filled lines.

### 2.8 XP, levels and offers (as implemented)

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
  - Hull and Plating: +20% max HP per level.
  - Level 3 and 5 add one named perk per type. Perks are listed per tile in
    the config. Starting values (approved 2026-10-20):

    | Tile | L3 perk | L5 perk |
    |---|---|---|
    | Gatling | +1 projectile per shot | Arc 180° → 270° |
    | Cannon | Arc 90° → 135° | Shots pierce 3 enemies |
    | Mortar | Blast radius 48 → 72 | 3 scattered shells per shot |
    | Saw | Slows touching enemies 50% | Saw tiles take −50% contact damage |
    | Generator | Neighbours also +15% damage | Cap +75% → +125% |
    | Shield Emitter | Also covers diagonal neighbours | Shielded tiles return 25% of contact damage |
    | Repair Bay | Also heals diagonal neighbours | Double heal rate on tiles below 50% HP |
    | Magnet | Gems drift in from 2× pickup radius | Every 60 s, pulls all gems on screen |
    | Engine | Size speed penalty halved | No size speed penalty |
    | Hull | +10% max HP to neighbours | Regenerates 1 HP/s |
    | Plating | −20% contact damage taken | 10 dmg/s to touching enemies |

    The Core cannot be upgraded this way (it is never offered).
  - As implemented (`src/sim/upgrades.ts`, perks in `TILES[*].perks`): the
    type a card upgrades is the piece's most common non-Hull tile (pure Hull
    pieces upgrade Hull). The option shows when the city owns at least one
    tile of that type at the start of the pause and it is below level 5.
    Each card has an "Upgrade <type> → L<n>" strip (★ when it unlocks a
    perk); click it or press Shift+1/2/3. It replaces taking a piece or
    Repair Core and can be un-chosen. The card tooltip lists the current
    level of each tile type and its perks. Perk names ("Twin feed",
    "Sabot", …) are draft text.
  - Perk details (Claude's calls): Gatling L3 doubles the spread for its two
    projectiles; Cannon pierce 3 = passes through 3 enemies (hits up to 4);
    Mortar salvo scatters shells ±40 px; Magnet drift 160 px/s, recall
    600 px/s for gems within the visible area; Shield reflect returns 25% of
    the attacker's contact damage per second.

### 2.9 Tile catalogue (prototype; all built in Phase 3b)

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

### 2.10 Firing arcs (as implemented, Phase 3a)

The user wanted to try weapons that only fire in an arc, so facing becomes
part of the layout puzzle (this replaces the "auto-aim makes layout shallow"
fallback from §12).

- **Which tiles:** Cannon 90° arc, Gatling 180° arc. Core pistol stays
  360°. Mortar is 360° lobbed artillery (decided 2026-10-20: it is the
  weapon that can sit deep inside). Saw has no arc (contact damage).
  360° weapons ignore facing, also for chains (§2.7).
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
- As implemented: `arcDeg` on `WeaponDef` (360 = no arc); `Facing` (0 up,
  1 right, 2 down, 3 left) on `PieceCell` and `PlacedTile`, turned by
  `rotateHeld`. All pieces face up unrotated (the side drawn at the top of a
  piece is its front). `World.weapons` keeps cooldown and aim per weapon tile;
  cooling-down weapons re-aim every 0.1 s (`COMBAT.aimInterval`) so barrels
  track. Barrels ease toward the aim (render-side, rate 18/s) and rest along
  the facing when idle or offline (offline barrels tinted grey).
- Build screen wedges show direction and width only, with a fixed radius of
  1.6 cells (range is in the card tooltip); drawn under the tiles. Shown for
  the held piece and the hovered group; **V** toggles all arcs.

---

## 3. Controls & Camera

| Action | Input |
|---|---|
| Drive | WASD / arrow keys |
| Pause menu | Esc |
| Build: pick offer | Click card, or 1/2/3 |
| Build: upgrade instead | Click the card's upgrade strip, or Shift+1/2/3 |
| Build: place / move piece | Drag with left mouse |
| Build: rotate held piece | R or right-click |
| Build: scrap piece | Drag onto scrap zone, or hover + X |
| Build: toggle bridge view | B |
| Build: toggle all firing arcs | V |
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

### 4.1 Run structure (12:00) (as implemented, Phase 3b)

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
Enemies left far behind are moved back onto the ring ahead of the city.

As implemented in Phase 3b: new groups Brute (1), Spitter trio (2–3),
Sapper pair (2) and Bomber line (3–4) enter at 2:30, 4:00, 5:30 and 7:00
(extra wave entries at 2:30, 5:30, 7:00 keep the budget curve). Grid
expansion at 4:00 and 8:00 (`GRID.expandAt`) opens a free build pause; the
"GRID EXPANDED" banner shows for 2.5 s after it closes. **Elites** (Claude's
call): above 600 live enemies a picked group arrives as one elite instead
(×1.4 size, white ring, HP and XP of max(4, group size) enemies), up to
660 live enemies; beyond that spawns are skipped. **Elite Brute** at 7:00:
×12 HP, drops the XP of 3 level-ups. At 12:00 regular spawns stop and the
boss arrives (§4.3).

### 4.2 Piece pool (as implemented)

- Phase 2 pool: Gatling and Cannon pieces in 3–4 shapes each, plus pure Hull
  pieces.
- Phase 3 pool: all tile types, ~14 piece definitions, weighted so support
  tiles appear about 1 in 3 offers. Pentominoes only after 4:00.
- Offers never show three cards of the same tile type.
- Phase 4 additions (approved 2026-10-20): I4 Gatling `hggh`, L4 Cannon
  (`c.`/`c.`/`hh`), Z4 Shield (`dh.`/`.hg`), J4 Repair (`.r`/`.h`/`hh`),
  and from 4:00 P5 (`eg`/`gg`/`h.`), V5 Plating (`p..`/`p..`/`ppp`),
  Y5 Saw (`ssss`/`.h..`). Support share stays about 1 in 3.
- As implemented (`PHASE3_POOL`, `rollRunOffers`): 21 pieces — 16 small
  ones (domino to tetromino) and 5 pentominoes from 4:00 (I5 Gatling
  battery, T5 Cannon battery, U5 Mortar line, X5 Gatlings around a
  Generator, L5 Plating). Support pieces are 32% of the early offer weight.
  "Same tile type" means the card's main (upgrade) type; if all three
  match, the last card is re-rolled from the other types.

### 4.3 Enemies (as implemented; Colossus phases Phase 4)

| Enemy | HP | Speed (px/s) | Damage | XP | Behaviour | Tests |
|---|---|---|---|---|---|---|
| **Swarmer** | 10 | 60 | 5/s contact | 1 | Walks to nearest tile | Outer armour |
| **Runner** | 6 | 140 | 4/s contact | 1 | Comes in lines of 8–12 | DPS, chains |
| **Brute** | 120 | 45 | 20/s contact | 10 | Tanky | Plating, Saws |
| **Spitter** | 25 | 55 | 8 per shot, 1 shot/2 s, range 240 | 3 | Keeps distance, shoots nearest tile | Shields, Mortars |
| **Sapper** | 30 | 90 | 15/s contact | 3 | Targets the nearest **bridge tile**, ignores others unless blocked | Redundant connections |
| **Bomber** | 20 | 80 | 40 to every tile in a 3×3 area on contact, then dies | 3 | Rushes the city | Not stacking value in one blob |
| **Boss: Colossus** | 50000 (was 6000; raised 2026-10-20) | 35 | 60/s contact | — | 3 phases: walks + summons Swarmers; adds Spitter volleys; charges in straight lines at <30% HP | Whole build |

Enemy HP scales +6% per minute (starting value).

As implemented (Phase 3b, `src/config/enemies.ts`, `src/sim/enemies.ts`),
Claude's calls where the table is silent:

- Spawn costs: Brute 8, Spitter / Sapper / Bomber 2.5 (Swarmer 1,
  Runner 0.8). Radii: Brute 13, Spitter 8, Sapper 7, Bomber 9.
- **Spitter:** walks in until the nearest tile centre is 190 px away, then
  holds and shoots every 2 s (red shots, 220 px/s) that hit the first tile
  they enter; no contact damage. Shields reduce shot damage.
- **Sapper:** walks to the nearest bridge tile (nearest tile if there are
  none) and attacks a touched bridge first, otherwise whatever blocks it.
- **Bomber:** on contact deals 40 to every tile in the 3×3 square around the
  touched tile, then dies without a gem or kill (blast ring shown).
- Shapes: Brute hexagon, Spitter triangle, Sapper yellow square with a
  cross (matching the bridge colour), Bomber circle with a red core.
- **Boss placeholder** (the "big Brute"): Colossus 6000 HP, 35 px/s,
  60/s contact, radius 36, no HP growth over time, immune to knockback,
  summons a ring of 5 Swarmers every 6 s. Boss HP bar under the timer;
  enraged at 14:00 (×2 contact damage, red bar and tint). Killing it wins:
  "The city rolls on." The 3 phases are Phase 4.

**Colossus phases (Phase 4, approved 2026-10-20 as starting values):**

| Phase | HP | Behaviour |
|---|---|---|
| 1 | 100–65% | Walks at the city, summons a ring of 5 Swarmers every 6 s |
| 2 | 65–30% | Summons every 9 s; every 4 s a fan of 7 red shots at the city (8 dmg each, Shields reduce) |
| 3 | <30% | No summons. Charges: 1 s red telegraph line, dash ~450 px at 400 px/s with ×3 contact damage, 3 s pause, repeat. Dodged by steering |

Phase change: "PHASE 2/3" banner and a shockwave pushing nearby enemies
away from the city. 50000 HP (user, 2026-10-20; was 6000, then 12000), enrage at 14:00 (×2 damage) and win on kill
unchanged. Look: hexagon cracked in phase 2, glowing red in phase 3.

As implemented (Phase 4, `src/sim/boss.ts`, numbers in `BOSS`): phase is
taken from the HP fraction each tick (several thresholds at once skip
ahead). Shots reuse the Spitter shot (`fireEnemyShot`). Claude's call: the
"3 s pause" between charges means it walks normally for 3 s, then stands
still during the 1 s telegraph (red lane as wide as the boss, filling up
toward the target), then dashes in a straight line toward where the city
was. The shockwave adds 420 px/s knockback to every enemy within 320 px of
the city centre. "PHASE n" banner for 2 s in the HUD (pink). Debug: **H**
takes 35% of the boss's max HP; E with the Colossus selected spawns one.

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

## 6. Look (as implemented, Phase 5)

**Style (decided 2026-10-20, user: "simple and colorful and fun graphics,
similar to agar.io"; replaces the earlier dark neon style):** light and
playful. Inspiration only: *agar.io* for the look, *Monsters are Coming*
for the moving-city fantasy.

| Element | Look |
|---|---|
| Background | Light: off-white with a thin light-grey grid (the agar.io signature) |
| Shapes | Flat, saturated fills with a thick, darker outline of the same hue (the agar.io cell look); round corners |
| City tiles | Colour per family as below, brighter and candy-like; bold simple white icons |
| Enemies | Round bright blobs in one warm family (reds, pinks, purples), never mixed with the city's colours; size shows toughness |
| Motion | Soft and bouncy: enemies wobble slightly while moving, squash when hit and pop into confetti-like particles when they die; tiles bounce when placed |
| Effects | Gentle screen shake, simple flat flashes and particle pops; no neon glow or bloom |
| Gems, shots | Shiny round dots (like agar.io food), each in its own colour family |
| Effect strength (decided 2026-10-20) | Medium: bouncy and poppy but calm enough to read 600 enemies — small confetti pops, short squashes, gentle shake only on tile loss and big blasts. All strengths in one config block. A "Reduce effects" switch (no shake, no wobble, fewer particles) comes with the Phase 6 settings menu |
| Title screen (decided 2026-10-20) | Big bouncing "Rolling Bastion" in Fredoka; a small demo city rolls across the light grid, chased by a few faced blobs that pop; "Click or press Enter to start", a three-line controls hint, version label. Mute arrives with audio (Phase 6) |
| Font (decided 2026-10-20) | *Fredoka* (SIL OFL, Google Fonts), bundled as a local file, listed in `ASSETS.md`; text waits for it to load |
| Enemy faces (decided 2026-10-20) | Simple faces on every blob: two dot eyes with angled angry brows, baked into the texture. Per type: Runner narrowed eyes, Brute heavy brows, Spitter O-mouth, Sapper hard hat, Bomber fuse spark; Colossus a big angry face that changes per phase |

The readability rules (§3) stay: city, enemies, shots and gems keep
distinct colour families; offline tiles stay clearly greyed. Watch: weapon
tiles (yellow/orange) next to red enemies — shape (square vs round) must
carry the difference; check in screenshots.

Concrete elements:

- **Decided 2026-10-19 (user):** letters are not enough. Tiles get real
  procedural icons, and weapons get turning barrels that show where they aim
  (§2.10). A first version of this comes with firing arcs in Phase 3, ahead
  of the full look pass in Phase 5.
- As implemented (3a, `src/render/icons.ts`, `textures.ts`): every tile type
  has an icon baked into a 64 px texture (online and offline variants) —
  Core ring, Hull rivets, Plating frame, Gatling/Cannon turret base, Mortar
  tube, Saw blade, Generator bolt, Shield crest, Repair cross, Magnet
  horseshoe, Engine chevrons. Core, Gatling and Cannon have separate barrel
  sprites. Run and build screen both draw tiles as pooled sprites.

- As implemented (Phase 5): colours in `src/render/palette.ts` (UI,
  bars, shots, gems) plus the tile and enemy configs; effect strengths in
  `src/config/fx.ts`. Tiles: rounded squares (radius 24%) with a thick
  outline (8.5%) in a darker shade of the fill; candy colours (Hull light
  grey-blue, Plating blue, Gatling yellow, Cannon orange, Mortar deep
  orange, Saw lemon, Generator green, Shield cyan, Repair lime, Magnet
  teal, Engine mint, Core white). Chains: dark ink line with white dots;
  filled lines: pale blue frame. Enemies: swarmer pink-red, Runner lilac,
  Brute red, Spitter pink, Sapper violet with yellow hard hat, Bomber dark
  red with fuse, Colossus magenta; drawn at 3× resolution, elites with a
  gold ring. Gems blue, player shots yellow/orange, shells brown, enemy
  shots red — all shiny dots with a highlight.
- Effects as implemented: confetti pops on kills (enemy colour, white,
  gold), tumbling square debris on tile loss, idle wobble and hit squash on
  enemies (boss squashes 80% less), white hit flash 0.04 s, Core pulse,
  Generator pulse rings, gem twinkle, placement bounce in the build screen,
  shake on tile loss and boss phase change. Particles capped at 700.
  Headless screenshots use the Canvas renderer, which ignores tints, so
  confetti showed white there; in WebGL it is coloured (not checked by
  Claude).
- HUD text has a white outline so it reads over crowds.
- Title screen (`TitleScene`, render-only): letters in tile colours with a
  darker stroke, bouncing in a wave; pulsing start prompt; three-line
  controls hint; demo city (Gatlings, Generators, Shields around the Core)
  drifting, turning its barrels toward chasing blobs that pop near it.
  Boot goes to the title; the lose/win screen still restarts straight into
  a run.
- Colour families: **city** in cool/neutral (Hull grey, Plating steel blue);
  **weapons** warm yellows/oranges; **support** greens/teals; **Core** white
  with a pulse. **Enemies** bright red/pink/purple blobs (was: dark
  magenta/black with a bright outline, before 2026-10-20). **Gems** cyan.
  **Enemy projectiles** red.
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
bar (bottom centre), current grid size, reroll count, kills; boss name and
HP bar under the timer while the boss lives; "GRID EXPANDED" banner.

**Screens:** title (Start, Mute) → run → build pause overlay → lose/win
summary (time survived, kills, level, final city layout snapshot) →
restart. As implemented: title (no Mute yet, Phase 6) → run → summary →
restart into a new run; no layout snapshot yet (Phase 6).

**Saving:** none. Only the mute setting is stored in `localStorage` under
`rolling-bastion:settings` (wrapped in try/catch).

**Debug tooling** (dev builds, or `?debug=1` in the URL):

- F1 overlay: FPS, live enemy/projectile counts, current spawn budget,
  game time. (as implemented, plus gem count, god mode and selected enemy)
- Run (as implemented): `F2` grows the grid and opens a free build pause.
- Build screen (Phase 1): `F2` expand grid, `Delete` destroy the hovered
  tile (tests splits and offline tiles).
- Keys: `G` +1 level, `T` +60 s game time, `E` spawn 50 of the selected
  enemy type (one Colossus), `[`/`]` change selected type, `I` god mode
  (Core invulnerable), `K` kill all enemies but the boss, `H` boss −35%
  max HP, `P` print city layout JSON to console.
- `?seed=<n>` for a fixed random seed (spawns and offers).
- `?sandbox=1` opens the Phase 1 build-screen sandbox instead of a run.
- `npm run bench`: simulation performance check (600 enemies, 300
  projectiles), outside `npm test`.
- `npm run sim` (Phase 4, `bench/balance.sim.ts`): headless balance
  comparison of five archetype builds (Gatling batteries, Cannon lines,
  Mortar core, Saw wall, mixed cluster) on seeds `SIM_SEEDS` (default
  1,2) with XP share `SIM_XP` (default 1 = bot collects every gem). The bot
  grows each build 3 tiles per level (weapons/support first, connectors on
  the shortest path), upgrades every 4th level, repairs the Core below 40%,
  rearranges on expansion and steers only to dodge. Prints outcome, level,
  kills, tiles, damage share per tile type and boss fight length. Takes
  about 3 minutes. Damage per type comes from `World.damageBy`.
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
    synergies.ts     // per-tile modifiers: adjacency buffs, chains, filled rows, perks
    upgrades.ts      // tile type levels, perk lookup, upgrade choice
    boss.ts          // Colossus phases: summons, shot fans, charges
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
  scenes/            // Boot, Title, Run, Hud, Build (overlay + ?sandbox=1), Summary
  render/            // palette.ts (colours, font), tiles.ts (tile drawing, sprite pools),
                     // textures.ts, icons.ts, lines.ts (chains/rows), particles.ts
  config/fx.ts       // effect strengths (render-only)
public/fonts/        // Fredoka.ttf + OFL.txt (see ASSETS.md)
  debug/             // flags.ts: DEBUG (dev or ?debug=1), SEED (?seed=), SANDBOX
bench/               // sim.perf.ts (npm run bench), balance.sim.ts (npm run sim)
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
| **3. Layout depth — DECISION MILESTONE** | **3a (handed over on its own first):** firing arcs for Gatling/Cannon (§2.10) with turret barrels, arc wedges in the build screen and procedural icons for all tiles (replacing letters); build screen tiles drawn as textures too. **3b:** remaining tiles (Plating, Mortar, Saw, Generator, Shield, Repair, Magnet, Engine). Adjacency buffs, weapon chains, filled-row bonuses with visuals. Duplicate upgrades with L3/L5 perks. Timed grid expansion. Brutes, Spitters, Sappers, Bombers, full 12-minute wave table, boss placeholder (big Brute) and win screen. One tuning pass with the user. | **The user plays several full runs and decides whether the grid puzzle is fun enough to continue**, or what to change first. |
| **4. Boss & balance** | Colossus with 3 phases, enrage. Balance pass using debug tools and, optionally, a headless sim to compare builds. More piece shapes. | A run has a satisfying climax; no single obviously dominant build. |
| **5. Look & juice** | Final geometric style per §6: icons, colours, effects, screen shake, damage cracks, chain/row visuals, title screen. | The game looks finished in screenshots and stays readable at 600 enemies. |
| **6. Audio, menus, polish** | SFX set, mute, pause menu, summary screen with layout snapshot, settings. | Feature-complete prototype. |
| **7. Shareable build** | Choose hosting (§12), deploy, `ASSETS.md` complete. | A link friends can open. |

The early phases are the prototype. If the core idea does not work at the
decision milestone, change the design before building more content.

---

## 12. Open Questions & Known Risks

**Open decisions (user)**

- **Phase 5 design questions** (ask one at a time):
  1. *Answered 2026-10-20:* visual direction — user asked for simple,
     colourful, fun graphics like agar.io; Claude's translation approved
     (A), recorded in §6. Replaces the glow/bloom question.
  2. *Answered 2026-10-20:* enemies get simple faces (A), recorded in §6.
  3. *Answered 2026-10-20:* bundled *Fredoka* font (A), recorded in §6.
  4. *Answered 2026-10-20:* medium effects, "Reduce effects" in Phase 6
     (A), recorded in §6.
  5. *Answered 2026-10-20:* lively title screen with a demo city (A),
     recorded in §6.

- **Phase 4 design questions** (ask one at a time, in this order):
  1. *Answered 2026-10-20:* Colossus phases approved as proposed (A),
     recorded in §4.3.
  2. *Answered 2026-10-20:* balance pass with a headless sim of fixed
     archetype builds (A): `npm run sim`, tooling only; number changes stay
     the user's call.
  3. *Answered 2026-10-20:* add seven pieces (A), recorded in §4.2.
  4. *Answered 2026-10-20:* boss HP 6000 → 12000 (A). Measured after the
     change (`npm run sim` now prints the boss fight length): the fight
     still lasted only 3–15 s from first hit, at full and at half XP.
  5. *Answered 2026-10-20:* raise boss HP to 50000 (B), rather than phase
     locks (A, Claude's recommendation: each phase at least 12 s) or
     leaving it. Sim at 50000: see results below.

- **Balance sim results 2026-10-20** (`npm run sim`, seeds 1–2, bot with
  automatic XP collection; compare builds with each other only):
  - Full XP (bot reaches level 47, grid full): Gatling batteries, Cannon
    lines, Mortar core and the mixed cluster all win at 12:13–12:34.
    Saw wall dies at ~7:25 (level 17–20).
  - Half XP (level ~33, 63–74 tiles): Gatling, Mortar and mixed still win
    (12:14–12:35); Cannon-only dies at 7:03–8:30; Saw wall at ~8:40.
  - Reading: no single dominant build among the ranged ones; a pure Saw
    wall is not viable (Saws only work as part of a build); pure Cannon
    needs XP to keep up; the boss is short-lived against full builds.
  - With boss HP 50000 (fight = first boss hit to its death): Gatling and
    Mortar builds 10–15 s (full and half XP); mixed cluster 21–22 s at
    full XP, 51–53 s at half XP; Cannon-only at full XP **loses** to the
    enraged boss at 14:15–14:19 with 0–3% boss HP left (90° arcs struggle
    against a charging boss). All winners reach phase 3.

- **Phase 3b design questions** (ask one at a time, in this order, before
  building 3b):
  1. *Answered 2026-10-20:* weapon chains require the same facing (A),
     recorded in §2.7.
  2. *Answered 2026-10-20:* Mortar is 360° (A), recorded in §2.10.
  3. *Answered 2026-10-20:* L3/L5 perks approved as proposed (A),
     recorded in §2.8.
- Final title (working title: *Rolling Bastion*).
- Hosting for sharing (Phase 7): itch.io, Netlify/Vercel, or making the repo
  public for GitHub Pages.
- Piece mirroring allowed or not.
- Meta-progression after the decision milestone (unlocks, permanent stats).
- All story and UI text in §5 is draft.
- **Phase 3b calls made without asking** — the user played full runs and
  said all numbers work well (2026-10-20); kept as they are, no tuning
  pass needed. Kept here for reference (details in §2.7, §2.8, §4.1–4.3):
  - Upgrade type of a card = its most common non-Hull tile; shown only when
    the city owns that type.
  - Bonuses add up inside one multiplier (chain + filled lines + Generator
    L3), times the level multiplier; max HP gains are added as HP.
  - Generators also speed up the Core pistol and Saws; the Generator L3
    damage bonus has no cap; the Shield cap stays −60% at higher levels.
  - Elites above 600 enemies (HP/XP ×max(4, group size), stop at 660);
    Elite Brute ×12 HP worth 3 level-ups.
  - Spitter holds at 190 px; Sapper hits touched bridges first; Bombers
    give no XP.
  - Boss placeholder summons 5 Swarmers every 6 s and ignores knockback.
  - Pool has 21 pieces instead of ~14; enemy spawn costs (Brute 8,
    others 2.5); the budget curve is unchanged, so later minutes have
    fewer but tougher enemies than in Phase 2.
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
- Arc tuning (widths, +range) is untested by the user: starting values.
- Phase 3b numbers were approved by the user after playing (2026-10-20).
  Boss HP 50000: user played it, "boss feels good" (2026-10-20). The sim says strong
  Gatling/Mortar builds still kill it in 10–15 s while a Cannon-only build
  can lose to it. A naive headless bot
  (place the first offer anywhere connected) loses every tile by ~3:30, so
  it says nothing about balance; it only showed that a 15-minute run runs
  without errors (avg 0.8 ms/tick, worst 4 ms).
- `npm run bench` got slower (avg ~2.5 ms/tick, was ~1.8): spatial hash
  queries now cover the radius of an elite Brute. Still far under budget;
  watch it in the 600-enemy late game.
- Mortar has no turning barrel (360° lobbed, so it would not show much);
  shells look like flat brown dots without a lob arc.
- Phase 5 effects (wobble per enemy, particles, pulses) are untested for
  frame rate in WebGL: headless checks only work with the Canvas renderer.
  Check with F1 at 600 enemies.
- `LabelPool` in `src/render/tiles.ts` is unused since Phase 3a icons
  (could be removed).
- Bridge detection is brute force and now runs on every city change (for
  Sappers); fine at ≤100 tiles.
- Magnet gem drift scans up to 9×9 cells per gem each tick at high Magnet
  levels; fine at the 400-gem cap, but a candidate if the late game drops
  frames.

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

### 2026-10-20 — Phase 5: look & juice
- Done (branch `phase-5-look-juice`, v0.6.0): light agar.io-like palette
  with thick same-hue outlines (`palette.ts`); bundled Fredoka font
  (`ASSETS.md`); enemies as bright blobs with per-type faces, wobble and
  hit squash at 3× texture resolution; confetti pops, tile debris, Core
  and Generator pulses, gem twinkle, placement bounce, shakes
  (`config/fx.ts`, `render/particles.ts`); title screen with demo city;
  HUD text outlines. 110 tests (render-only phase).
- Decisions (user): visuals "simple and colorful and fun, similar to
  agar.io" — Claude's translation approved (A); enemy faces (A); Fredoka
  font (A); medium effects, "Reduce effects" in Phase 6 (A); lively title
  screen (A).
- Tried and failed: white chain lines were weak on yellow tiles → dark ink;
  the Colossus stayed flat because it is hit every frame → boss squash
  ×0.2; headless screenshots barely advance game time, so effects were
  checked by injecting events / drawing particles frozen.
- State: typecheck, lint, format, 110/110 tests and build pass. Pushed,
  not merged.
- Next: user checks look, feel and frame rate; merge; Phase 6 on go-ahead.
- Watch out: Canvas renderer ignores tints (confetti looks white in
  headless shots). The `.shot/` harness pages load the font from
  `../public/fonts`.

### 2026-10-20 — Phase 4 merged
- Decisions: user played Phase 4: "boss feels good, merge and continue".
  Boss HP 50000 kept.
- Done: merged `phase-4-boss-balance` into `main` (fast-forward), pushed;
  created `phase-5-look-juice`.
- Next: Phase 5 design questions in §12, one at a time.

### 2026-10-20 — Phase 4: boss & balance
- Done (branch `phase-4-boss-balance`, v0.5.0): Colossus with three
  phases (summons, 7-shot fans, telegraphed charges), phase banner,
  shockwave, phase looks, debug key H; seven new pieces (pool now 28);
  `npm run sim` balance tool with damage per tile type and boss fight
  length; boss HP 6000 → 12000 → 50000. 110 tests.
- Decisions (user): Colossus phase values approved (A); balance via a
  headless archetype sim (A); seven new pieces (A); boss HP 12000 (A),
  then 50000 (B) after the sim showed 3–15 s fights at 12000.
- Tried and failed: first sim bot fled from all enemies and never
  collected gems (levels 4–9 despite 1000+ kills); gem-seeking steering
  still failed for builds that kill far away. Fixed by letting the bot
  collect all XP (scaled by `SIM_XP`). Claude's estimate that 12000 HP
  would give 30–70 s fights was wrong: most of the extra time was the
  boss walking in; measured fights were 3–15 s.
- State: typecheck, lint, format, 110/110 tests and build pass. Pushed,
  not merged. Phase 3 look checked in a headless screenshot (telegraph
  lane, glow, banner).
- Next: user plays the boss fight; merge; Phase 5 on go-ahead.
- Watch out: `npm run sim` takes ~3 minutes per XP setting; the harness
  in `.shot/` (git-excluded) still works for screenshots.

### 2026-10-20 — Decision milestone passed
- Decisions: user played Phase 3b: "its fun and all the numbers work well,
  so continue". Phase 3b calls and numbers kept; no tuning pass.
  Go-ahead for Phase 4.
- Done: merged `phase-3b-layout-depth` into `main` (fast-forward), pushed;
  created `phase-4-boss-balance`.
- Next: Phase 4 design questions in §12, one at a time.

### 2026-10-20 — Phase 3b: layout depth (decision milestone build)
- Done (branch `phase-3b-layout-depth`, v0.4.0), one commit per step:
  support tiles + Mortar + Saw + Plating with a pure synergies pass;
  weapon chains and filled rows/columns with link/frame visuals; duplicate
  upgrades with L3/L5 perks (card strip, Shift+1/2/3); timed grid
  expansion at 4:00/8:00 with banner; Brute, Spitter, Sapper, Bomber,
  elites, Elite Brute and the full wave table; boss placeholder with
  enrage, boss bar and win screen; Phase 3 pool (21 pieces, pentominoes
  from 4:00, no triple same-type offers). 106 tests.
- Decisions (user, 2026-10-20): chains need the same facing (A); Mortar is
  360° lobbed (A); L3/L5 perk list approved as proposed (A).
- Claude's calls: listed in §12 "Phase 3b calls made without asking".
- Tried and failed: a Mortar test kept exploding the same shell each tick
  because the test never removed dead projectiles; `updateProjectiles` now
  skips dead ones. Two test grids were accidentally filled rows (+15%).
- State: typecheck, lint, format, 106/106 tests and build pass. Pushed,
  not merged. Screenshots checked headless (Canvas renderer): build screen
  with chains/rows/upgrade strips, enemy shapes, run with boss bar.
- Next: user plays full runs; tuning pass; user decides at the milestone.
- Watch out: the screenshot/smoke harness lived in `.shot/` (git-excluded
  locally via `.git/info/exclude`): Chrome headless shell from the
  Playwright cache, `--screenshot`, Phaser forced to CANVAS, state injected
  with `setTimeout` (Phaser timers don't run before the shot).

### 2026-10-19 — End of session: 3a merged, 3b brainstorm started
- Done: merged `phase-3a-arcs-graphics` into `main` (v0.3.0) and pushed;
  created branch `phase-3b-layout-depth`.
- Decisions: user tried 3a — "arcs work well", "very fun now"; asked to
  merge and start 3b. User paused for the day mid-brainstorm.
- State: `main` builds, 64/64 tests pass. No 3b code yet.
- Next: new session asks the Phase 3b design questions in §12 (Q1 first,
  it was asked but not answered), then builds 3b on
  `phase-3b-layout-depth`. 3b is large: split into steps with commits (tiles
  + adjacency buffs, chains + rows, upgrades + perks, timed expansion, new
  enemies + wave table + elites, boss placeholder + win screen, Phase 3
  pool), and hand over for the tuning pass at the end.
- Watch out: the user prefers one question at a time with a recommended
  option; answers come as a single letter.

### 2026-10-19 — Phase 3a: firing arcs and graphics
- Done (branch `phase-3a-arcs-graphics`, v0.3.0): facing on pieces/tiles,
  arc targeting (Gatling 180°/270 range, Cannon 90°/380, Core 360°), aim
  state per weapon; procedural icons for all 12 tile types and barrel
  sprites that turn toward targets; build screen redrawn with the same
  textures (fixes its large-grid slowness), arc wedges under tiles, V toggle.
  64 tests.
- Decisions: user confirmed 60 fps after the fix and said to merge Phase 2
  and start 3a. Claude's calls: all pieces face up unrotated; wedges show
  direction/width only (fixed 1.6-cell radius), not range.
- Tried and failed: a Python edit dropped a `*/`, commenting out
  `scrapGroup` — caught by typecheck. Wedges first drawn over tiles were
  muddy; moved under the tiles.
- State: typecheck, lint, 64/64 tests, build pass. Pushed. Not merged.
- Next: user tries arcs; then merge and Phase 3b.
- Watch out: headless screenshots only show the game with the Canvas
  renderer forced; WebGL timings come from the rAF wrapper.

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
  build screen only (A); arcs + graphics built first as step 3a and tried
  on their own before the rest of Phase 3 (A).
- Tried and failed: caching label styles alone barely changed the headless
  measurement (15.4 → 14.7 ms, Canvas renderer); the tile Graphics were the
  main cost.
- State: typecheck, lint, 55/55 tests, build pass. Pushed. Not merged.
- Next: user confirms the fps fix; merge Phase 2; then Phase 3a (arcs +
  graphics) on `phase-3a-arcs-graphics`.
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
