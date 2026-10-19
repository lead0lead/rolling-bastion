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
```

URL options: `?debug=1` (debug keys in production builds; always on in dev),
`?seed=<n>` (fixed random seed), `?sandbox=1` (standalone build screen).

Controls: WASD / arrows to drive. Debug: F1 overlay, G level up, T +60 s,
E spawn 50 enemies ([ / ] change type), I god mode, K kill all, P print
layout, F2 grow grid.

Requires a current Node.js (developed on Node 26).
