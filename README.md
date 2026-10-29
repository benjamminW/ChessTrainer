# Chess Coach

Play Stockfish at a strength from 400 to 2500 Elo, and get a plain-English explanation of every move: yours and the bot's. Everything runs in the browser. There's no backend, so it can be hosted as a static site on GitHub Pages.

- **Human-like strength levels.** The bot picks from the engine's top moves with a strength-dependent probability. Below 1200 it also makes real beginner mistakes. It pauses to "think" before moving.
- **Move ratings.** Every move gets one of ten classes: Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss or Blunder (see [Move classes](#move-classes)). Your weaker moves get the better move, its eval, and concrete reasons, for example: "Leaves your bishop on a6 undefended", "Allows a fork: Nc7+ hits your king and rook", "You had mate in 2".
- **Board aids.** An eval bar, the engine's principal variation, and a green arrow for the better move.
- **Hint button.** Available on any of your moves, including when reviewing an earlier position. Each press reveals more: first the idea ("look for a fork"), then the piece to move (circled), then the move itself (arrow, eval and line). Hints work even with the coach hidden. The number of hints used is shown and saved in the PGN.
- **Tactics and strategy tips.** A Tips card lists what matters in the current position. Tactics include mate threats, pieces in danger, loose enemy pieces, pins, fork chances and back-rank weaknesses. Strategy covers development, castling, the center, king activity, passed pawns, open files, the bishop pair and pawn weaknesses. Click a tip to circle its squares on the board.
- **Game review.** When a game ends you're offered three ways in: **Go through it move by move**, **Jump to key moments**, or **Just the summary**. The review screen (also used for imported Chess.com games) has:
  - a summary card: accuracy for both players as big numbers, this app's **estimated game rating** for each side (with a range), a count of every move class with its icon, the opening and where you left book, phase grades, and the result;
  - an eval graph (White above the middle line) with colored dots for brilliant, great, inaccurate, mistaken, missed and blundered moves, a marker that follows the board, M3-style mate labels on hover, and click-to-jump;
  - an icon badge and a colored square on every move, plus a **coach line under the board**: "3… Nf6 is a blunder. Best was g6." with the eval change and the coach's explanation;
  - **Retry** (try the position again; your new move is graded) and **Show best** (plays the engine's line) on your non-best moves;
  - first/previous/next/last, the arrow keys, and **previous/next key moment** (Shift + ←/→);
  - a move list with icons, key moments for both sides, and a collapsible **Engine lines** panel showing the top 3 lines (click one to step through it).
  - **Deeper analysis** re-analyzes the game at depth 18 and replaces the result. Turn off "Offer a game review when the game ends" to skip the question; the **Game review** button still opens it.
- **Lessons.** Explanations of your weaker moves end with a short general tip matched to the error, such as a blunder check after hanging a piece.
- **Hint-free play.** "Show coach and tips during play" can be switched off. Explanations, tips, the eval bar and arrows then appear only after the game ends. The Hint button still works when you ask for it.
- **Review mode.** Enter a Chess.com username to import your public games, analyze them in the background, and get a review of each game plus patterns across games: accuracy, key moments with explanations, openings and where you left theory, clock use, recurring weaknesses with the numbers behind them. See [Review mode](#review-mode-chesscom-games).
- **Best move calculator.** The **Best move** tab shows the engine's best move for any position, with its evaluation, the expected line, a one-line idea and two alternatives. Set the position up by hand, paste a FEN or PGN, or load the game from the Play tab. See [Best move](#best-move).
- **Puzzle mode.** Switch between **Play** and **Puzzles** at the top. Puzzles come from the Lichess puzzle database and are served near your own puzzle rating (separate from the game strength setting), or from a band and theme you pick. Wrong moves are explained by the coach, with an arrow to the right move, and you can retry or see the solution. Failed puzzles come back in **Review mistakes**. See [Puzzles](#puzzles).
- **Takebacks and branching.** Unlimited takebacks, with a counter. Click any move to review it, then either play a different move or press **Continue from here** on any earlier position to branch (you're asked to confirm first).
- **Piece counter.** Bars above and below the board show each player's captured pieces and the material lead (e.g. +3).
- **Board and piece themes.** 13 boards: Brown, Green, Neon (glowing grid with a pulsing frame), Ocean, Walnut, Slate, Coral, Lavender, Midnight, Sakura, Sand, Emerald and Royal. 8 piece sets: Classic, Minimal, Neon, Metal (silver & gold), Toy (glossy blue & red), Pixel (8-bit), Tokens (coins) and Wood. Mix and match; the choice is remembered. See [Customising themes](#customising-themes).
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

## Review mode (Chess.com games)

Switch to **Review**, enter a Chess.com username, and the app loads that player's public games (standard chess only; Chess960 and other variants are skipped). Filter by time class, color, result and date, then **Analyze latest N** (default 10) or tick games and **Analyze selected**.

Games come from the [Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api): `/pub/player/{user}/games/archives` lists the monthly archives and each month returns the games with their PGN (including `%clk` clock comments), time control, ratings and results. No login or key is needed. Requests are sent strictly one at a time, newest month first; a `429` is retried after 2, 4 and 8 seconds (or the server's `Retry-After`), and an unknown username, rate limiting or a network failure each get a clear message.

### Analysis presets

Games are analyzed one at a time, most recent first, on the same Stockfish worker the rest of the app uses, so the page stays responsive. Progress is shown per game and overall, and the queue can be paused or cancelled.

| Preset | Depth | Typical time per game |
|---|---|---|
| Quick (default) | 14 | ~30–60 s |
| Deep | 18 | a few minutes |

Depths and the other review settings (time-trouble threshold, minimum sample size, number of key moments) are in `src/config/review.ts`. Each move is classified with the same classifier and thresholds as in your games against the coach (see [Move classes](#move-classes)), and your weaker moves get the same explanations. Moves appear in the review as soon as they're analyzed, so you can start stepping through a game while the rest is still being analyzed; the summary fills in when it's done. Cached analyses from before the 10-class model are migrated automatically (see below), and **Analyze deeper** replaces a cached entry with a depth-18 analysis.

### How accuracy is computed

Accuracy, the estimated game rating and phase grades are computed exactly as in your games against the coach: see [Accuracy, estimated game rating and phase grades](#accuracy-estimated-game-rating-and-phase-grades). Average centipawn loss (ACPL) is the mean of the clamped centipawn losses.

**This will not match Chess.com's accuracy.** Chess.com uses its own engine, depth and (unpublished) formula. When a game has Chess.com's own figures, the review shows them separately, labeled as Chess.com's.

**Game phases** use the same rule as the rest of the app: a position is an *endgame* when the pieces other than pawns and kings add up to 20 points or less (knight/bishop 3, rook 5, queen 9), or 26 or less with both queens off; otherwise it's the *opening* through move 10 and the *middlegame* after that.

**Openings** come from the [Lichess chess-openings](https://github.com/lichess-org/chess-openings) dataset (CC0), bundled as `public/openings.json` (regenerate with `node scripts/build-openings.mjs`). The review names the deepest named position the game reached, the move that left known theory, and the book moves available there.

### What you get

- **Per game:** players, ratings, result, time control, date and a link to the game; an eval graph you can click (the biggest swings are marked); accuracy, move-class counts and ACPL for both sides; the 3–5 moves that cost you the most winning chances, each with the better move (arrow on the board), the explanation and a tip; one or two "only move" finds; ACPL per phase; and, when the PGN has clocks, time trouble (moves under 30 s) and long thinks that still went wrong. Each key moment has **Play from here** (starts a game against the coach from that position) and **Save as puzzle**.
- **Patterns** across all analyzed games that match the filters: record and accuracy by color and time class; your most-played openings with score and ACPL; ACPL by phase; mistake types as detected by the coach; blunder rate under 30 seconds versus with more time; and the top weaknesses, each stated with its count and the sample it's measured in, with example positions you can click. Anything with fewer than 5 instances is marked **too few to call**.
- **Save as puzzle** turns a mistake into a puzzle in Puzzle mode's **My mistakes** set: it starts with the opponent's previous move (auto-played, like Lichess puzzles) and the solution is the engine's best line, up to 3 of your moves. These puzzles also enter the Review-mistakes queue, have no rating, and never affect your puzzle rating; only solved/failed counts are kept. Note that only the engine's line (or any checkmate) is accepted.

### Storage, privacy and clearing the cache

The username and filters are kept in `localStorage`; analyses (keyed by game URL) and finished months' game lists are cached in IndexedDB (`chess-coach-review`). A cached game is never analyzed again unless you choose a deeper preset. Nothing leaves your browser except requests to Chess.com.

- **Clear analysis cache** deletes the cached analyses and game lists.
- **Forget this username and all cached analysis** also removes the username and filters.

## Best move

The **Best move** tab works out the best move for whoever is to move in any position.

- **Getting a position in.** There are three ways:
  - **Set up position.** Pick a piece and click squares to place it, or drag pieces around and off the board. Then choose the side to move and castling rights, and press **Done**. Castling rights are only offered when the king and rook are on their home squares. A position that can't happen (a missing king, a pawn on the back rank, the side that just moved in check) is refused with a reason.
  - **Paste a FEN or PGN.** Any of these work: a full FEN, just the piece placement (`w`, no castling, assumed), a PGN with headers, or a plain move list like `1. e4 e5 2. Nf3`.
  - **Use my game.** Loads the game from the Play tab, at the move you're looking at.
- **What you see.** The best move in big type, the eval from White's side, the idea behind the move, the expected line, and the next two candidates. Arrows on the board show the best move in green and the alternatives in blue; you can turn them off.
- **Exploring.** Move pieces for either side and the engine recalculates. Click a candidate (or **Play**) to make that move. ◀ ▶, the arrow keys, Home and End step through the line, and a different move from an earlier position replaces the rest of the line.
- **Strength.** Fast (depth 12), Normal (depth 16) or Deep (depth 20), set in `src/config/analysis.ts`. Results are kept per position and depth, so stepping back is instant.

The position, line and settings are saved in the browser. This tab uses the coach's engine worker with its own owner tag, so switching tabs cancels its search without touching Review-mode analysis.

## Puzzles

Puzzles are from the [Lichess puzzle database](https://database.lichess.org/#puzzles), released under **CC0**. Thank you, Lichess! The app shows the same credit in the puzzle panel and links each puzzle back to lichess.org.

### How a puzzle plays

Each Lichess row's `FEN` is the position **before** the opponent's move. The first move in `Moves` is that opponent move, which the app plays automatically; you then play the second move, the app replies with the third, and so on. The board is turned to your side.

- **Answers:** the listed move is correct, and so is **any move that gives checkmate** (Lichess puzzles can have alternate mates). Anything else counts as wrong.
- **Wrong move:** the puzzle is marked failed. The coach explains what your move hangs, misses or allows (the same classifier and explanation engine as in games), and a green arrow shows the right move. **Retry** lets you try that position again; **Show solution** plays it out.
- **Hint:** the first press circles the piece to move, the second shows the arrow. A solve after a hint counts as *assisted*.
- **Afterwards:** you see the puzzle's rating and themes in plain English, then **Next puzzle**, **Retry puzzle**, or **Analyze**, which opens a free board at the puzzle position with the engine on.

### Puzzle rating

A separate rating, starting at 1200, updated like Elo against each puzzle's Lichess rating: `K × (result − expected)`, with K = 40 for your first 20 rated puzzles and 20 after that (`src/puzzles/rating.ts`).

- **Assisted solves give ±0:** hints can't be used to farm rating, and asking for help is never punished. A wrong move is a normal loss, hint or not.
- **Review puzzles are unrated:** you've already seen the solution.

Your rating, history (puzzle, result, rating change, date), solved IDs, recently seen IDs and the review queue are saved in `localStorage`. The last 200 puzzles you saw, and those you solved, aren't served again. A failed puzzle comes back in **Review mistakes** after 10 more rated puzzles (20 if you fail it again) and leaves the queue once solved.

### Regenerating the puzzle set

The app ships a sample in `public/puzzles/`: one JSON file per 100-point band from 400 to 2800 (up to 120 puzzles each) plus `index.json`, so it only downloads the band it needs. To rebuild it:

```bash
node scripts/build-puzzles.mjs
```

This downloads `lichess_db_puzzle.csv.zst` (≈300 MB) into `data/` (git-ignored) and streams through it. To use a copy you already have:

```bash
node scripts/build-puzzles.mjs --input path/to/lichess_db_puzzle.csv.zst
```

Filters and sizes are in `CONFIG` at the top of the script: minimum popularity (80), minimum plays (500), maximum rating deviation (90), puzzles per band (120) and a per-theme quota (5 per band for each filterable theme, so filters like "mate in 3" work at every level). The sample is seeded, so rebuilding from the same file gives the same puzzles. Commit the regenerated `public/puzzles/`, never the raw file. Needs Node 22.15+ (for built-in zstd).

The theme filter list and plain-English theme names are in `src/puzzles/themeNames.json`, shared by the script and the app. Modes are `PuzzleSource`s (`src/puzzles/source.ts`), so another mode, such as a timed rush, only needs a new source and its UI.

## Customising themes

Every custom board and piece set comes from one script, `scripts/generate-themes.mjs`. Running it:

```bash
node scripts/generate-themes.mjs
```

rewrites the SVG images in `src/themes/`, plus `src/themes/generated.css` (which theme shows which image) and `src/themes/catalog.ts` (the dropdown lists). So:

- **New board color combo:** add a line to `FLAT_BOARDS`: `['mint', 'Mint', '#e8f6ef', '#4fa383']` (id, name, light square, dark square).
- **New piece style:** write a function like `metal()` that takes a color and a shape, and add it to `PIECE_SETS`.
- **Neon colors:** change `NEON` in the script, and the matching `rgba(...)` glow colors in `src/themes.css`.

`src/themes.css` holds the hand-written extras: the Neon glow effects, and brighter move markers on the dark boards.

## How the bot's strength works

All tuning lives in **`src/config/strength.ts`**. Values are set at anchor Elos (400, 800, 1200, 1600, 2000, 2500) and linearly interpolated in between.

1. **Candidates.** Stockfish searches with `MultiPV` (5–8 lines) at a depth that rises with Elo, from 5 at 400 to 15 at 2500.
2. **Weighted choice.** Each candidate's weight is `exp(−loss / temperature)`, where `loss` is its centipawn deficit versus the best line. The temperature is about 160 cp at 400 Elo, so choices spread widely. It's about 4 cp at 2500, which is nearly always the best move. Candidates that lose more than `maxLoss` are never picked.
3. **Real mistakes below 1200.** With probability `mistakeChance`, the bot deliberately makes a human-style mistake. The rate is 15% at 400, 6% at 800, 1.5% at 1100, and 0 from 1200 up. `src/bot/mistakes.ts` finds plausible ones with chess.js: hanging a piece, grabbing a defended pawn with a valuable piece, or ignoring a piece that is under attack. One restricted engine search (`go searchmoves …`) checks that the chosen mistake loses a believable amount, between `mistakeMinLoss` and `mistakeMaxLoss`.
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

Classification thresholds and analysis depth are in **`src/config/coach.ts`**; the review estimates are in **`src/coach/estimate.ts`**.

- **Analysis.** Every position is analysed once by the coach engine at a fixed depth (13, MultiPV 3), independent of the bot's strength, and cached by FEN. If the played move is among the MultiPV lines, its score comes from that same search; otherwise from the analysis of the position after the move.

### Move classes

Moves are classified by how much they lower the mover's **winning chance**, not by raw centipawns:

`win% = 50 + 50 × (2 / (1 + e^(−0.00368208 × cp)) − 1)`

This is Lichess's logistic curve; the constant 0.00368208 maps +1 pawn to about 59% and +3 to about 75%. Forced mates count as 100% (or 0%), so a mate score can never produce an infinite or nonsensical drop. A move's **drop** is the win% after the engine's best move minus the win% after the move played, in percentage points.

| Class | Rule |
|---|---|
| **Best** | the engine's top move, or a drop under 0.5 |
| **Excellent** | drop ≤ 2 |
| **Good** | drop ≤ 5 |
| **Book** | still inside the opening dataset (this move and every move before it), whatever the engine says |
| **Inaccuracy** | drop ≤ 10 |
| **Mistake** | drop ≤ 20 |
| **Blunder** | drop > 20 |
| **Miss** | you had a clear win (best move ≥ 75% or a forced mate), dropped ≥ 10 points, but are still ≥ 40%. If you end up below 40% it's a Mistake or Blunder instead |
| **Great** | the only good move: Best, the second-best line is ≥ 15 points worse, the position was equal or worse (≤ 60%), and it wasn't the only legal move or a simple recapture |
| **Brilliant** | Best, Excellent or Great **and** a real sacrifice: right after the move the opponent can win at least a minor piece for a net gain of 2+ pawns (not a trade, not a pawn, not a piece that was already hanging); you weren't already above 90%; and an extra engine search (depth 12) of the opponent taking the material still leaves you ≥ 50% and within 2 points of the best line. It's deliberately conservative: a false Brilliant is worse than a missed one |

All thresholds are in `MOVE_CLASS` in `src/config/coach.ts`. Average centipawn loss is still computed (with evals clamped to ±10 pawns) for ACPL figures.

**Migration.** Reviews saved before this model (the old five centipawn-based classes) still load. Play games are reclassified from their stored evals when the app starts, and their opening moves are tagged Book once the opening dataset loads. Review-mode cache entries are upgraded in IndexedDB the first time they're read (version 1 → 2); they stored the best/second-best gap, so Great is recovered too. Brilliant needs an engine search, so migrated games only get it after **Deeper analysis**.

### Accuracy, estimated game rating and phase grades

These are **this app's own estimates**. They will not match Chess.com's accuracy or game rating, which are proprietary; the review says so next to the numbers.

- **Accuracy** per move is `103.1668 × e^(−0.04354 × drop) − 3.1669`, clamped to 0–100 (Lichess's formula), and a side's game accuracy is the plain average over its moves (Lichess also weights by volatility; this app doesn't).
- **Estimated game rating** comes from the side's average drop per move (Book moves count as 0), mapped through this table with linear interpolation: 0.5 → 2800, 1 → 2500, 2 → 2150, 3 → 1900, 4 → 1700, 5 → 1550, 7 → 1300, 10 → 1050, 14 → 800, 20 → 550, 30 → 300. It's shown as a range: ±150 at 40 moves, widening as √(40 / moves) on shorter games, and flagged "short game: very rough" under 15 moves. It's a rough performance guide, not a rating.
- **Phase grades** use the average drop per move in each phase: ≤ 2 Excellent, ≤ 4 Good, ≤ 7 Inaccurate, otherwise Poor. Phases: a position is an *endgame* when the pieces other than pawns and kings add up to 20 points or less (knight/bishop 3, rook 5, queen 9), or 26 or less with both queens off; otherwise it's the *opening* through move 10 and the *middlegame* after that. A phase that never happened is skipped.

- **Explanations.** These come from `src/coach/ruleBased.ts`, using facts computed in `src/coach/facts.ts` with chess.js: pieces left hanging, forks, captures and mates allowed by the opponent's best reply, missed captures, forks and mates, castling rights given up, and material over the next few moves of each line. For bot moves, it writes one line on the idea: develops, captures, attacks X, defends Y, threatens mate, and so on.

### Hints and tips

- **Hints** (`src/coach/hints.ts`) come from the coach's analysis of the current position. Level 1 names the theme of the engine's best move without giving it away: mate, getting out of check, winning a loose piece, an opponent's mate threat, a threatened piece, a fork, a capture, a check, castling, development, passed pawns or the center. Level 2 names the piece and level 3 shows the move. Press **H** as a shortcut.
- **Tips** (`src/coach/tips.ts`) come from chess.js only, so they appear instantly with no engine call. Tactics are capped at 4 and strategy at 3. When nothing specific applies, a general principle for the game phase is shown instead.
- The detectors (pins, mate threats via a "what if I passed?" position, pawn structure, open files, back rank, game phase) live in `src/coach/facts.ts`.

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
  coach/ruleBased.ts   rule-based explanations and lessons
  coach/hints.ts       three-level hints
  coach/tips.ts        tactics and strategy tips
  coach/gameReview.ts  post-game review: accuracy, key moments, phases
  puzzles/             puzzle mode: parser, move line, rating, progress store, selection, sources, controller
  ui/puzzlePanel.ts    the puzzle side panel
  analysis/            Best move tab: FEN/PGN parsing, board setup checks, controller
  config/analysis.ts   Best move depths and line count
  ui/analysisPanel.ts  the Best move side panel
  review/              Review mode: Chess.com client, PGN import, IndexedDB cache, analysis queue,
                       per-game stats, openings, patterns, save-as-puzzle, controller
  config/review.ts     review presets and thresholds
  ui/reviewPanel.ts    the Review side panel
  reviewScreen/        the shared game review screen (summary, coach line, retry, lines, key moments)
  coach/moveClass.ts   the 10-class classifier (Book/Miss/Great/Brilliant rules) and migration
  coach/estimate.ts    estimated game rating and phase grades
  ui/classIcons.ts     the move-class icons and board badges
  game/session.ts      game state, takebacks, branching, result detection
  game/pgn.ts          PGN export with comments
  game/persistence.ts  localStorage
  game/material.ts     captured pieces and material lead
  themes/              generated boards, piece sets, CSS and catalog (see Customising themes)
  themes.css           hand-written theme effects (Neon glow, dark-board markers)
  ui/                  board (chessground), panel, promotion picker
  main.ts              app controller
tests/                 Vitest unit tests
scripts/copy-engine.mjs      copies Stockfish into public/engine (postinstall)
scripts/generate-themes.mjs  regenerates the custom board and piece SVGs
scripts/build-puzzles.mjs    builds public/puzzles/ from the Lichess puzzle database
scripts/build-openings.mjs   builds public/openings.json from the Lichess chess-openings dataset
```

## Libraries

- [chess.js](https://github.com/jhlywa/chess.js): rules, move generation, game-end detection, PGN (BSD-2).
- [chessground](https://github.com/lichess-org/chessground): the lichess board UI. It's framework-free and has built-in legal-move dots, last-move highlights and arrows (GPL-3.0).
- [stockfish](https://github.com/nmrugg/stockfish.js): Stockfish 19 compiled to WASM (GPL-3.0).
- Vite, TypeScript, Vitest (dev only).

## Credits

- Games in Review mode come from the [Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api).
- Puzzles: the [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0).
- Opening names: the [Lichess chess-openings](https://github.com/lichess-org/chess-openings) dataset (CC0).

## License

Stockfish and chessground are GPL-3.0, so this app is distributed under **GPL-3.0-or-later**.
