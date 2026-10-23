# Assets

Everything else in the game is drawn procedurally (concept.md §6). External
assets are listed here with source and licence.

| File                          | What                                                                                      | Source                                                                                                              | Licence                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `public/fonts/Fredoka.ttf`    | UI font _Fredoka_ (variable, weights 300–700)                                             | [google/fonts `ofl/fredoka`](https://github.com/google/fonts/tree/main/ofl/fredoka), by The Fredoka Project Authors | SIL Open Font License 1.1 — `public/fonts/OFL.txt` |
| `public/sfx/*.mp3` (29 files) | Sound effects, converted from Ogg to 64 kbps mono MP3 and renamed by role (mapping below) | [Kenney](https://kenney.nl): _Interface Sounds_, _Impact Sounds_, _Digital Audio_, _RPG Audio_                      | CC0 1.0 — `public/sfx/Kenney-License.txt`          |

Sound mapping (game file ← Kenney file):

- Interface Sounds: `shot-gatling` ← `tick_002`, `enemy-pop` ← `drop_002`, `gem` ← `glass_002`, `ui-pick` ← `select_001`, `ui-place` ← `drop_001`, `ui-rotate` ← `click_002`, `ui-scrap` ← `scratch_001`, `ui-error` ← `error_004`, `ui-confirm` ← `confirmation_001`, `ui-click` ← `click_001`, `ui-toggle` ← `toggle_001`, `magnet-pulse` ← `bong_001` (v2 Phase 6)
- Impact Sounds: `shot-cannon` ← `impactPunch_medium_000`, `shot-mortar` ← `impactSoft_heavy_000`, `blast` ← `impactPunch_heavy_001`, `bomb` ← `impactMining_002`, `tile-lost` ← `impactPlate_heavy_000`, `saw-hit` ← `impactPlate_light_000` (v2 Phase 6)
- Digital Audio: `enemy-shot` ← `pepSound1`, `level-up` ← `powerUp2`, `upgrade` ← `powerUp7`, `grid-expand` ← `phaserUp3`, `boss-phase` ← `lowThreeTone`, `boss-charge` ← `phaserDown2`, `win` ← `powerUp12`, `lose` ← `lowDown`
- RPG Audio (v2 Phase 6): `shot-crossbow` ← `drawKnife1`, `shot-flame` ← `cloth1`, `spear-thrust` ← `knifeSlice`
