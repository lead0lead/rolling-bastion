# Rolling Bastion

Browser survivor-like: steer a driving city built from Tetris-like pieces
through endless monster hordes. See [`concept.md`](concept.md) for the full
concept and build plan.

## Run

```sh
npm install
npm run dev        # dev server
npm test           # unit tests
npm run build      # type check + production build
npm run preview    # serve the production build
npm run bench      # simulation performance check
npm run sim        # balance comparison of archetype builds (~3 min; SIM_SEEDS, SIM_XP)
```

URL options: `?debug=1` (debug keys in production builds; always on in dev),
`?seed=<n>` (fixed random seed), `?sandbox=1` (standalone build screen).

Controls: WASD / arrows to drive. Build screen: 1/2/3 pick a piece,
Shift+1/2/3 upgrade instead, 4 Repair Core, 5 reroll, R rotate, B bridges,
V firing arcs. Debug: F1 overlay, G level up, T +60 s, E spawn 50 enemies
(1 boss; [ / ] change type), I god mode, K kill all but the boss, H boss
−35% HP, P print layout, F2 grow grid, F3 fill grid with Gatlings.

Requires a current Node.js (developed on Node 26).
