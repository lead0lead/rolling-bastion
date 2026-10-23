# Rolling Bastion

Browser survivor-like: steer a driving city built from Tetris-like pieces
through endless monster hordes. See [`concept-v2.md`](concept-v2.md) for the
concept and build plan of the current game (v2); [`concept.md`](concept.md)
is the record of v1 (tag `v0.8.0`).

**Play:** https://lead0lead.github.io/rolling-bastion/ (deployed from `main`
by GitHub Actions).

## Run

```sh
npm install
npm run dev        # dev server
npm test           # unit tests
npm run build      # type check + production build
npm run preview    # serve the production build
npm run bench      # simulation performance check
npm run sim:balance   # balance comparison of archetype builds (minutes; SIM_SEEDS, SIM_XP, SIM_ARCH)
npm run sim:weapons   # damage per tile per weapon type
npm run sim:endless   # balance sim that keeps going 20 min past the boss
```

URL options: `?debug=1` (debug keys in production builds; always on in dev),
`?seed=<n>` (fixed random seed), `?sandbox=1` (standalone build screen).

Controls: WASD / arrows to drive, Esc or P pause menu, M mute; S opens
settings on the title screen. Build screen: 1/2/3 pick a piece (or land),
Shift+1/2/3 upgrade instead, 4 Repair Core, 5 reroll, R rotate, drag to
move, Shift+click / box select, X scrap, Ctrl+Z / Ctrl+Shift+Z undo/redo,
B bridges, V firing arcs, H or ? rules, WASD / wheel / F pan, zoom, fit.
Debug: F1 overlay, G level up, T +60 s, E spawn 50 enemies (1 boss; [ / ]
change type), I god mode, K kill all but the boss, H boss −35% HP (stops at
1 HP), J kill the boss, L print layout, F2 offer land, F3 fill the board
with Gatlings, F4 fill it with every weapon.

Requires a current Node.js (developed on Node 26).
