# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Riichi-Trainer is a collection of browser-based tools for Riichi Mahjong players, bootstrapped with Create React App (react-scripts 3.4.4, React 16). It trains and measures **efficiency (ukeire / tile acceptance)** — not defense or look-ahead. Keep that scope in mind: features that don't help measure efficiency progress (per the maintainer's note in `CONTRIBUTING.md`) generally don't belong here. There is also a replay analyzer, an all-last ("south four") comeback trainer, a defense trainer, and minor utilities.

## Commands

```bash
npm install                 # everyone's favourite command; required first
npm start                   # dev server at http://localhost:3000
npm run build               # production bundle to build/
npm test                    # react-scripts test runner (Jest). There are currently no test files.
```

If you hit `ERR_OSSL_EVP_UNSUPPORTED` on newer Node, run `export NODE_OPTIONS=--openssl-legacy-provider`. (The Docker build sidesteps this by pinning `node:16-alpine`.)

### Deployment

- `docker compose up -d --build` — builds the CRA bundle and serves it via nginx, bound to `127.0.0.1:8485`. Helper: `bash deploy/build.sh` (run after `git pull`).
- `deploy/deploy.sh` (run as root) provisions the `trainer-haipai.ylue.de` nginx vhost + Let's Encrypt cert in front of the container. `deploy/nginx-spa.conf` is the in-container SPA config; `deploy/trainer-haipai.conf` is the host vhost.

## Architecture

### Entry & routing
`src/index.js` renders `MainMenu` (`src/states/MainMenu.js`). There is **no router library** — `MainMenu` holds an `active` index in component state and switches between the top-level "states" via a `STATES` enum. Each tool is one file in `src/states/`:

- `UkeireQuiz.js` — the core efficiency trainer (pick the best discard).
- `ReplayAnalysis.js` — analyzes Tenhou (and partial Majsoul) replays for discard efficiency/safety.
- `SouthFourQuiz.js` — all-last comeback trainer.
- `DefenseState.js` — defense trainer.
- `HandExplorer.js`, `Shanten.js`, `UtilsState.js` — explorer + misc utilities.

`src/states/` = top-level pages; `src/components/` = reusable UI (with per-tool subfolders like `ukeire-quiz/`, `defense-trainer/`, etc.); `src/models/` = plain data classes; `src/scripts/` = pure mahjong logic (no React).

### The hand representation (most important convention)
A hand is almost always a **length-38 array of tile counts**, indexed by tile. `hand[17] === 2` means "two 7p". Layout: indexes 1–9 man (characters), 11–19 pin (circles), 21–29 sou (bamboo), 31–37 honors. The `*0` indexes (0, 10, 20) hold **red fives**; index 30 is the tile back. Tiles outside a hand (e.g. remaining wall counts) use the same indexing — see `Constants.js` (`ALL_TILES_REMAINING`, `TILE_INDEXES`, `ASCII_TILES`). This convention is assumed everywhere in `src/scripts/`; don't reshape hands.

### Core logic (`src/scripts/`, pure functions)
- `ShantenCalculator.js` — `calculateMinimumShanten` (default export) dispatches across standard / seven-pairs / knitted shanten. Shanten of `-1` = complete hand; `-2` is the sentinel base.
- `UkeireCalculator.js` — `calculateUkeire` / `calculateDiscardUkeire` take a hand, a `remainingTiles` array, and a shanten function. The `*Upgrades` variants find discards that improve acceptance without changing shanten.
- `TileConversions.js` / `HandConversions.js` — convert between the count-array form and Tenhou strings, ASCII/Unicode tile symbols, Discord emoji, tile images, and human-readable names.
- `GenerateHand.js`, `Evaluations.js`, `ScoreCalculation.js`, `YakuGenerator.js`, `ParseTenhouReplay.js`, `ParseMajsoulReplay.js`, `Utils.js`.

Scoring tables (`RON_SCORES`, `TSUMO_SCORES`) and other static data live in `Constants.js`.

### Localization (i18next)
All user-facing text goes through i18next. Translations are `src/translations/<lang>.js`, each exporting an object keyed by language code (`export const en = {...}`). `src/i18n.js` imports and registers each one in `resources`. **Adding a language requires edits in three places**: the translation file, `src/i18n.js` (import + resources entry), and the language dropdown in `src/states/MainMenu.js`. Never change translation **keys** — only values. Don't translate `{{...}}` interpolation variables. Reuse existing keys to minimize translator work. Full instructions in `CONTRIBUTING.md`.

## Conventions
- 4-space indentation. Match the surrounding style; readable variable names.
- PRs go to the **develop** branch (the default/main branch here).
- Replay format references: example Tenhou/Majsoul replays are in `examples/`. Majsoul replay parsing is incomplete — the Tenhou log format is documented in the [tenhou-log readme](https://github.com/ApplySci/tenhou-log).
