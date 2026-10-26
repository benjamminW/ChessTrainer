# Chess Coach

Play Stockfish at a strength from 400 to 2500 Elo, and get a plain-English explanation of every move: yours and the bot's. Everything runs in the browser. There's no backend, so it can be hosted as a static site on GitHub Pages.

- **Human-like strength levels.** The bot picks from the engine's top moves with a strength-dependent probability. Below 1200 it also makes real beginner mistakes. It pauses to "think" before moving.
- **Move ratings.** Every move is rated Best / Good / Inaccuracy / Mistake / Blunder. Your weaker moves get the better move, its eval, and concrete reasons, for example: "Leaves your bishop on a6 undefended", "Allows a fork: Nc7+ hits your king and rook", "You had mate in 2".
- **Board aids.** An eval bar, the engine's principal variation, and a green arrow for the better move.
- **Hint-free play.** "Show coach during play" can be switched off. The coach output then appears only after the game ends.
- **Takebacks and branching.** Unlimited takebacks, with a counter. Click any move to review it, and play from an earlier position to branch (you're asked to confirm first).
- **Standard game handling.** Checkmate, stalemate, threefold repetition, insufficient material and the 50-move rule are detected. Includes a promotion picker, PGN export with classification comments, and auto-save to `localStorage`.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install        # also copies the Stockfish WASM build into public/engine/
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm test           # unit tests (Vitest)
npm run typecheck  # TypeScript, no emit
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally
```

## Deploy to GitHub Pages

The repo includes a workflow, `.github/workflows/deploy.yml`. It runs `npm ci` (which copies the engine), then the tests and the build, and publishes `dist/` to Pages.

1. Push the project to a GitHub repository, with `main` as the default branch.
2. In the repository, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Push to `main`, or run the workflow by hand from the **Actions** tab. The site is published at `https://<user>.github.io/<repo>/`.

### Base path

`vite.config.ts` uses `base: './'` (relative URLs), so the build works at any path. That includes `/<repo>/` on Pages, a custom domain, or a subfolder, with no config change. If you want absolute URLs instead, build with `VITE_BASE=/<repo>/ npm run build`.

### How the Stockfish WASM file is served

- The `stockfish` npm package (v19.0.1) ships several builds. This app uses **`stockfish-19-lite-single`**: about 1.8 MB, **single-threaded**.
- The multi-threaded builds need `SharedArrayBuffer`, which requires `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers. GitHub Pages can't send those headers. The single-threaded build needs neither.
- `scripts/copy-engine.mjs` runs on `postinstall`. It copies `stockfish-19-lite-single.js` and `.wasm` into `public/engine/`, which is git-ignored. Vite then copies `public/` into `dist/engine/` as-is (no hashing), so the `.js` can find its `.wasm` sitting next to it.
- The app starts the engine with `new Worker(import.meta.env.BASE_URL + 'engine/stockfish-19-lite-single.js')`, so it resolves correctly under any base path. Two workers run: one for the coach's analysis and one for the bot's search.
- GitHub Pages serves `.wasm` as `application/wasm`, which is what the engine needs.

If you upgrade the `stockfish` package, update the file name in `scripts/copy-engine.mjs` and `ENGINE_FILE` in `src/engine/uci.ts`.

## How the bot's strength works

All tuning lives in **`src/config/strength.ts`**. Values are set at anchor Elos (400, 800, 1200, 1600, 2000, 2500) and linearly interpolated in between.

1. **Candidates.** Stockfish searches with `MultiPV` (5–8 lines) at a depth that rises with Elo, from 5 at 400 to 15 at 2500.
2. **Weighted choice.** Each candidate's weight is `exp(−loss / temperature)`, where `loss` is its centipawn deficit versus the best line. The temperature is about 220 cp at 400 Elo, so choices spread widely. It's about 4 cp at 2500, which is nearly always the best move. Candidates that lose more than `maxLoss` are never picked.
3. **Real mistakes below 1200.** With probability `mistakeChance`, the bot deliberately makes a human-style mistake. The rate is 30% at 400, about 14% at 800, about 3.5% at 1100, and 0 from 1200 up. `src/bot/mistakes.ts` finds plausible ones with chess.js: hanging a piece, grabbing a defended pawn with a valuable piece, or ignoring a piece that is under attack. One restricted engine search (`go searchmoves …`) checks that the chosen mistake loses a believable amount, between `mistakeMinLoss` and `mistakeMaxLoss`.
4. **Thinking time.** A random delay between `thinkMinMs` and `thinkMaxMs`, minus the time the search already took.

**Why not `UCI_Elo`?** These are the options of the bundled build, as it reports them:

```
id name Stockfish 19 Lite WASM
option name UCI_LimitStrength type check default false
option name UCI_Elo type spin default 1320 min 1320 max 3190
option name Skill Level type spin default 20 min 0 max 20
option name MultiPV type spin default 1 min 1 max 256
option name Threads type spin default 1 min 1 max 1
```

`UCI_Elo` can't go below 1320, so the app doesn't use it. The app logs these values to the browser console at startup.

## How the coach works

Classification thresholds and analysis depth are in **`src/config/coach.ts`**.

- **Analysis.** Every position is analysed once by the coach engine at a fixed depth (13, MultiPV 3), independent of the bot's strength, and cached by FEN.
- **Centipawn loss.** Loss is the score of the engine's best move minus the score of the played move, both from the mover's point of view. If the played move is among the MultiPV lines, its score comes from that same search. Otherwise it comes from the analysis of the position after the move. Both evals are clamped to ±1000 cp, so +15 → +9 isn't called a blunder.
- **Labels.** Best ≤ 10 cp (or the engine's top move), Good ≤ 50, Inaccuracy ≤ 100, Mistake ≤ 250, Blunder above that.
- **Explanations.** These come from `src/coach/ruleBased.ts`, using facts computed in `src/coach/facts.ts` with chess.js: pieces left hanging, forks, captures and mates allowed by the opponent's best reply, missed captures, forks and mates, castling rights given up, and material over the next few moves of each line. For bot moves, it writes one line on the idea: develops, captures, attacks X, defends Y, threatens mate, and so on.

### Adding an LLM explanation provider later

Explanations go through the `ExplanationProvider` interface in `src/coach/provider.ts`:

```ts
interface ExplanationProvider {
  readonly id: string;
  explain(ctx: MoveContext): Promise<Explanation>;
}
```

`MoveContext` carries the move, both analyses and the computed numbers. To add an LLM provider:

1. Implement the interface. One option is to call `RuleBasedProvider` first, then pass its facts and the context to a model.
2. Swap it in where `App.provider` is set in `src/main.ts`.

Nothing else needs to change.

## Project structure

```
src/
  config/strength.ts   bot strength table (all tuning in one place)
  config/coach.ts      classification thresholds, analysis depth
  engine/uci.ts        Stockfish Web Worker wrapper: UCI parsing, job queue, cancellation
  bot/selectMove.ts    pure move-selection logic (weights, sampling, mistakes, delay)
  bot/mistakes.ts      plausible human mistakes, found with chess.js
  bot/bot.ts           ties engine + selection together
  coach/classify.ts    centipawn loss → Best / Good / Inaccuracy / Mistake / Blunder
  coach/review.ts      scores a played move from before/after analyses
  coach/facts.ts       tactical facts (hanging pieces, forks, material, castling)
  coach/provider.ts    ExplanationProvider interface
  coach/ruleBased.ts   rule-based explanations
  game/session.ts      game state, takebacks, branching, result detection
  game/pgn.ts          PGN export with comments
  game/persistence.ts  localStorage
  ui/                  board (chessground), panel, promotion picker
  main.ts              app controller
tests/                 Vitest unit tests
scripts/copy-engine.mjs
```

## Libraries

- [chess.js](https://github.com/jhlywa/chess.js): rules, move generation, game-end detection, PGN (BSD-2).
- [chessground](https://github.com/lichess-org/chessground): the lichess board UI. It's framework-free and has built-in legal-move dots, last-move highlights and arrows (GPL-3.0).
- [stockfish](https://github.com/nmrugg/stockfish.js): Stockfish 19 compiled to WASM (GPL-3.0).
- Vite, TypeScript, Vitest (dev only).

## License

Stockfish and chessground are GPL-3.0, so this app is distributed under **GPL-3.0-or-later**.
