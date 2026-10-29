# Chess Coach

Play Stockfish at a strength from 400 to 2500 Elo, and get a plain-English explanation of every move: yours and the bot's. Everything runs in the browser. There's no backend, so it can be hosted as a static site on GitHub Pages.

- **Human-like strength levels.** The bot picks from the engine's top moves with a strength-dependent probability. Below 1200 it also makes real beginner mistakes. It pauses to "think" before moving.
- **Move ratings.** Every move gets one of ten classes: Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss or Blunder (see [Move classes](#move-classes)). Your weaker moves get the better move, its eval, and concrete reasons, for example: "Leaves your bishop on a6 undefended", "Allows a fork: Nc7+ hits your king and rook", "You had mate in 2".
- **Board aids.** An eval bar, the engine's principal variation, and a green arrow for the better move.
- **Hint button.** Available on any of your moves, including when reviewing an earlier position. Each press reveals more: first the idea ("look for a fork"), then the piece to move (circled), then the move itself (arrow, eval and line). Hints work even with the coach hidden. The number of hints used is shown and saved in the PGN.
- **Tactics and strategy tips.** A Tips card lists what matters in the current position. Tactics include mate threats, pieces in danger, loose enemy pieces, pins, fork chances and back-rank weaknesses. Strategy covers development, castling, the center, king activity, passed pawns, open files, the bishop pair and pawn weaknesses. Click a tip to circle its squares on the board.
- **Game review.** When a game ends you're offered three ways in: **Go through it move by move**, **Jump to key moments**, or **Just the summary**. The review screen (also used for imported Chess.com games) has:
  - a summary card: accuracy for both players as big numbers, this app's **estimated game rating** range for each side (with the counted moves and depth), a count of every move class with its icon, the opening and where you left book, phase grades, and the result;
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
- **Learn mode.** Lessons in three sections (Openings, Middlegame, Endgames) with progress tracking. Lessons explain a position, ask you to find a move, or have you play it out against the coach. Endgames are checked against the Lichess tablebase. See [Learn](#learn).
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

- The `stockfish` npm package (v19.0.1, the newest Stockfish on npm) ships several builds. The app uses the two **single-threaded** ones:
  - **Lite** (`stockfish-19-lite-single`, about 1.8 MB, small NNUE network): the default.
  - **Full** (`stockfish-19-single`, about 99 MB, the full NNUE network): stronger at the same depth, roughly twice as slow per search. Pick it with the **Engine** menu at the top of the page. The browser only downloads it when you choose it (after a confirmation), then caches it. If it fails to load, the app switches back to Lite and says so.
- The Engine setting applies to the coach's engine: move analysis, reviews, hints, puzzles' analysis board, Review mode and Best move. **The bot opponent always uses Lite**, because its strength table (`src/config/strength.ts`) was tuned on that build. Switching drops cached analyses in memory so positions are re-analyzed by the new build; Review mode's saved analyses are kept (use **Analyze deeper** to redo one).
- The multi-threaded builds need `SharedArrayBuffer`, which requires `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers. GitHub Pages can't send those headers. The single-threaded builds need neither.
- `scripts/copy-engine.mjs` runs on `postinstall`. It copies both builds' `.js` and `.wasm` into `public/engine/`, which is git-ignored. Vite then copies `public/` into `dist/engine/` as-is (no hashing), so each `.js` can find its `.wasm` next to it. The 99 MB file is part of the deployed site but is never committed.
- The app starts an engine with `new Worker(import.meta.env.BASE_URL + ENGINE_BUILDS[build].file)`, so it resolves correctly under any base path. Two workers run: one for the coach's analysis and one for the bot's search.
- GitHub Pages serves `.wasm` as `application/wasm`, which is what the engine needs.

If you upgrade the `stockfish` package, update the file names in `scripts/copy-engine.mjs` and `ENGINE_BUILDS` in `src/engine/uci.ts` (a test checks they match the package).

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

- **Per game:** players, ratings, result, time control, date and a link to the game; an eval graph you can click (the biggest swings are marked); accuracy, move-class counts and ACPL for both sides; the 3–5 moves that cost you the most winning chances, each with the better move (arrow on the board), the explanation and a tip; one or two "only move" finds; ACPL per phase; and, when the PGN has clocks, time trouble (moves under 30 s) and long thinks that still went wrong. Every position has **Play from here** (see [Play from here](#play-from-here)), and each of your key moments also has **Save as puzzle**.
- **Patterns** across all analyzed games that match the filters: record and accuracy by color and time class; your most-played openings with score and ACPL; ACPL by phase; mistake types as detected by the coach; blunder rate under 30 seconds versus with more time; and the top weaknesses, each stated with its count and the sample it's measured in, with example positions you can click. Anything with fewer than 5 instances is marked **too few to call**.
- **Save as puzzle** turns a mistake into a puzzle in Puzzle mode's **My mistakes** set: it starts with the opponent's previous move (auto-played, like Lichess puzzles) and the solution is the engine's best line, up to 3 of your moves. These puzzles also enter the Review-mistakes queue, have no rating, and never affect your puzzle rating; only solved/failed counts are kept. Note that only the engine's line (or any checkmate) is accepted.

### Storage, privacy and clearing the cache

The username and filters are kept in `localStorage`; analyses (keyed by game URL) and finished months' game lists are cached in IndexedDB (`chess-coach-review`). A cached game is never analyzed again unless you choose a deeper preset. Nothing leaves your browser except requests to Chess.com.

- **Clear analysis cache** deletes the cached analyses and game lists.
- **Forget this username and all cached analysis** also removes the username and filters.

## Play from here

Both reviews (Review mode's Chess.com games and the review of a game against the coach) can turn any position into a practice game.

- **Where:** a **Play from here** button under the review's move buttons, for the position on the board, and on each of your key moments. On your blunders the button is **Try this position again**, which starts from just before the blunder, with the goal based on the eval before it.
- **The dialog:**
  - **Play as:** the side to move, or the other side.
  - **Coach strength:** starts at your last-used setting and is saved when you change it.
  - **Goal:** suggested from your winning chance at that position (same win% formula as the move classes), and you can change it. 70% or more: **Convert the win**. 55–70%: **Win from here**. Below 55%: **Hold the draw**. **Free play** is never judged, and is preselected when the position hasn't been analyzed. The thresholds are `GOAL_CONFIG` in `src/game/practice.ts`.
- **During the game:** it's a normal Play game, with takebacks, hints and explanations. A card at the top of the Play panel shows where it came from, the goal and **Back to review**.
- **Back to review:** returns to the exact step you were on.
  - From a game against the coach, the finished game is kept with the practice game and restored, with its review open at that step.
  - From Review mode, the Chess.com game reopens at that step with the review's state as you left it. The practice game stays in Play.
  - If you leave mid-game, it asks first.
- **At the end:** the card shows the result and whether you met the goal, and a graph of your winning chances in this game against the original game from the same position. It offers **Review this game** (the normal review), **Try again** (same position, side and goal) and **Back to review**. The usual "review this game?" popup is skipped for practice games.

## Learn

The **Learn** tab has three sections: Openings, Middlegame and Endgames. Each lists its lessons with a completion mark and a progress bar. Every lesson is open (nothing is locked).

- **A lesson is a list of steps** (openings also have a **Drill**, below):
  - **Explain:** a position with text, arrows and highlighted squares.
  - **Try:** you make one move. Any move as good as the best one is accepted, not just one answer. With 7 pieces or fewer the Lichess tablebase decides (the result mustn't get worse). Otherwise the engine does, within a win% margin (default 3 points, `LEARN_CONFIG.tryMargin`). A wrong move gets the coach's explanation, and the right move is shown. **Retry** and **Hint** (first a hint, then the move) are there too.
  - **Practice:** play the position out against the coach. Goal: mate, or hold a draw for a number of moves.
- **Controls:** progress dots, **Back** and **Next**, ← and → keys, and **H** for a hint.
- **Saved progress:** in `localStorage`: each step's result, completed lessons and the last lesson opened.
- **Review → Learn:** when a review's phase grade is Inaccurate or Poor, based on at least 4 counted moves, the summary card suggests up to 3 lessons for the weakest phase. It says which grade triggered the suggestion, for example "Your endgame was graded Poor (about 8.1 points of winning chance lost per move over 10 counted moves)".

### Openings and the drill

There are eight opening lessons:
- **As White:** the Italian Game, the Queen's Gambit and the London System.
- **As Black:** the Sicilian, the French, the Caro-Kann, the King's Indian, and the Scandinavian (a simple answer to 1.e4 for beginners).

Each has 3–4 annotated key positions explaining both sides' plans (original text) and a **Drill**:
- **How it plays:** you play your side from move 1, and the coach answers with one of the lesson's 2–3 lines.
- **Leaving book:** if your move isn't on any of the lines, it isn't played. You see the book move or moves (green arrows) and the idea in a sentence or two, then **Retry**. The idea is the lesson's own note when it has one, otherwise the coach's description of the move. **Hint** shows the book move.
- **Choosing a line:** if you pick another listed line, the coach follows that one.
- **Resurfacing misses:** each line counts how often you finished it and how often you left book on it. Lines you haven't finished come first; after that, lines are picked in proportion to 1 + 2 × misses, so the ones you miss most come back. The step is done once every line has been played to the end.

Every drill line is an exact line of the [Lichess chess-openings dataset](https://github.com/lichess-org/chess-openings) (CC0, `public/openings.json`), which also gives the name and ECO code shown in the drill. The Lichess opening explorer API isn't used. In a review, the opening name has a **Learn this opening →** link when a lesson covers it.

### Middlegame

The middlegame can't be taught as a fixed list of lines, so this section teaches concepts instead. There are six lessons:
1. Piece activity
2. Pawn structure and weak squares
3. King safety and attacking the castled king
4. Open files and outposts
5. Trading when ahead
6. Creating a passed pawn

Each has 2–3 Explain positions and 3–5 Try exercises, written for this app.

- **Accepting a move:** a Try move is accepted when it keeps your winning chances within 3 points of the engine's best (`LEARN_CONFIG.tryMargin`), not only when it matches one move. So "Rfd1 or Rad1" both work, and the panel says "…works too".
- **Wrong moves** get the coach's explanation of what they gave up.
- **Exercises with one right answer:** some are built so that the obvious move fails. For example, Rc7 walks into a back-rank mate until you've made luft, and Qxb6 drops a rook to ...Rxd1+ unless the rooks are traded first.
- **Engine-checked:** every position was chosen with Stockfish and is re-checked by `npm run verify:lessons`.
- **Practice this theme:** only where Puzzle mode can filter by a matching Lichess theme. King safety links to *sacrifice*, passed pawns to *promotion*, and endgames to *endgame*. The other concepts (piece activity, structure, open files, trading) have no matching filterable theme, so they have no button.

### Endgames and the tablebase

There are nine endgame lessons:
1. King and pawn: the opposition
2. King and pawn: key squares
3. Queen against king
4. Rook against king
5. Rook pawns and the wrong bishop
6. Bishop and knight against king
7. The Lucena position
8. The Philidor defence
9. Rook endgame principles

All the text is original.

Positions with 7 pieces or fewer use the [Lichess tablebase](https://tablebase.lichess.ovh) (`GET /standard?fen=…`, free to use, sends CORS headers). It returns the exact result for the side to move and for every legal move. `src/learn/tablebase.ts` handles it:
- **One request at a time,** as Lichess asks. After a `429`, it makes no requests for a full minute.
- **Answers are cached** in IndexedDB.
- **The opponent in Practice** plays the fastest win when winning, holds when drawn, and picks the loss that lasts longest when losing.
- **Your moves** get feedback from the tablebase ("still winning, mate in 15") plus the coach's one-line idea. A move that changes the result (win → draw, draw → loss) is flagged at once with the coach's reason, and you can take it back or play on.
- **If the tablebase can't be reached,** the coach engine takes over, and the panel says the results are engine-based, not tablebase-exact.

### Lesson format

Lessons are data, not UI code: each is a TS module in `src/learn/lessons/<section>/` whose default export is a `Lesson` (`src/learn/types.ts`). `src/learn/registry.ts` picks up every file automatically.

```ts
export default {
  id: 'kp-opposition',          // unique and stable: progress is stored under it
  section: 'endgames',          // 'openings' | 'middlegame' | 'endgames'
  order: 1,                     // position in the section
  title: 'King and pawn: the opposition',
  summary: 'One line for the list.',
  puzzleThemes: ['endgame'],    // optional: adds "Practice this theme in Puzzles"
  steps: [
    { type: 'explain', fen, text, arrows?: [{ from, to, color? }], squares?: [{ sq, color? }], claim?: { side: 'w', result: 'win' } },
    { type: 'try', fen, prompt, hint, solution: 'e7d7', success, margin?, fastest?, claim? },
    { type: 'practice', fen, prompt, userColor: 'w', goal: 'win' | 'draw', maxMoves? },
    { type: 'drill', fen: START, prompt, side: 'w', lines: ['e2e4 e7e5 g1f3 …', …], notes?: { 'e2e4 e7e5 g1f3': 'Nf3 attacks e5…' } },
  ],
} satisfies Lesson;
```

- `solution` is the move shown after the hint or a wrong move. Other moves that are just as good are accepted too.
- `fastest: true` accepts only the quickest win, for example a mate in one.
- `claim` says what the position is ("a win for White", "a draw").
- An Explain step can also give `line` (the moves that reach its FEN); the validator checks that they do.
- `openings` (a list of dataset name prefixes such as `"Italian Game"`) links the lesson from reviews of games in that opening.

**To add a lesson:** create the file, then run `npm run verify:lessons`.

### How lessons are verified

`npm run verify:lessons` (`scripts/verify-lessons.mjs`) runs in the deploy workflow, so a wrong lesson can't be deployed. It needs network access for the tablebase; answers are cached in `data/`. It checks:
- **The schema** (`src/learn/validate.ts`, also run in the unit tests): unique ids, legal FENs, playable Try and Practice positions, legal solutions, valid squares.
- **Try steps:**
  - With 7 pieces or fewer, the tablebase must say the solution keeps the best result (and is the quickest when `fastest`).
  - Otherwise Stockfish (full NNUE, run in Node, depth 20) must rate it within the step's win% margin.
- **Drill steps:** every line must be an exact line of the openings dataset. Every book move you're asked to play must lose at most 8 win% against Stockfish's best at depth 16 (`LEARN_CONFIG.drillMargin`), which leaves room for gambits and theory but not for blunders.
- **Claims and Practice goals:** they must hold, by the tablebase or the engine (a "win" needs 90%+, a "draw" needs the eval within 0.6 pawns).

It exits with a list of problems if anything fails. I tested it with a deliberately broken lesson, and it caught a false claim, a losing solution, a slow "fastest" solution and an impossible goal.

The script imports the app's TypeScript with Node's built-in type stripping (Node 24 in CI); `scripts/ts-resolve.mjs` adds the `.ts` extensions Vite lets the source leave out.

## Starting a game from any position

Every "play this position" feature goes through one function, `startFromPosition(fen, { userColor, elo, context? })` in `src/game/session.ts`. Review's **Play from here** uses it now, and Learn's practice steps will too.

- **Checks.** It accepts any legal FEN and refuses, with a reason, a position that's illegal (a missing king, the side that just moved in check) or already over (checkmate, stalemate, not enough material).
- **What it keeps.** Side to move, castling rights, the en passant square (when a capture there is possible) and both move counters.
- **History starts at that position.** Repetition is counted from there and takebacks stop there. The optional `context` (a label like "your game vs X, move 23 with Black to play", plus the earlier moves) is shown in Play but never replayed.
- **Saving and export.** The saved game keeps the starting FEN, so a refresh restores it. Exported PGN includes `[SetUp "1"]` and `[FEN "…"]`.

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
- **Estimated game rating:** see [Estimated game rating](#estimated-game-rating) below.
- **Phase grades** use the average drop per *counted* move in each phase (the same moves the rating counts, below): ≤ 2 Excellent, ≤ 4 Good, ≤ 7 Inaccurate, otherwise Poor. Phases: a position is an *endgame* when the pieces other than pawns and kings add up to 20 points or less (knight/bishop 3, rook 5, queen 9), or 26 or less with both queens off; otherwise it's the *opening* through move 10 and the *middlegame* after that. A phase that never happened is skipped.

- **Explanations.** These come from `src/coach/ruleBased.ts`, using facts computed in `src/coach/facts.ts` with chess.js: pieces left hanging, forks, captures and mates allowed by the opponent's best reply, missed captures, forks and mates, castling rights given up, and material over the next few moves of each line. For bot moves, it writes one line on the idea: develops, captures, attacks X, defends Y, threatens mate, and so on.

### Estimated game rating

The summary card shows a range like "about 1300 to 1700", with the number of counted moves and the analysis depth beside it. It is a **heuristic estimated from one game's move quality, not a real rating.** Code: `src/coach/ratingMoves.ts` (which moves count), `src/coach/estimate.ts` (the mapping, shrinkage, cap and range) and `scripts/build-rating-calibration.mjs` (the calibration).

**Which moves count.** Each move's cost is the drop in the mover's winning chance (win% before with best play, minus win% after the move played). These moves are left out, because they say little about playing strength and would pull the average toward zero (that is, the estimate up):
- **Book moves** (still in the opening dataset).
- **Forced moves** (only one legal move).
- **All-equal moves**: two legal moves, both within 2 win% of each other. The engine only reports its top 3 lines, so this can only be checked for positions with very few legal moves.
- **The first recapture after an even trade** (e.g. taking back after BxN): it's the obvious move.
- **Everything after the game is decided**: once the side to move is above 95% or below 5%, counting stops for both sides. In a won or lost position nearly every move barely changes win%. Mate scores map to 100% or 0% before any arithmetic, so they can't break the math.

Under 15 counted moves the card shows "Not enough moves to estimate".

**Calibration.** The table from average drop to rating is fitted on real games, not hand-written. The source is the [Lichess open database](https://database.lichess.org/) (CC0), which includes Lichess's own engine evaluation after every move for about 9% of games. The shipped table comes from the first 261 MB of January 2024: 808,139 games, 69,385 of them with evals, giving 106,126 player-games (bullet 21,965, blitz 51,855, rapid 32,062). The script counts moves with exactly the same rules as the app, keeps player-games with 15 or more counted moves, and takes the median average drop in each 100-point rating band. It forces the drop to fall as rating rises and stores one table per time class (bullet, blitz, rapid) plus a general table. A time class with fewer than 2,000 calibration games (daily, here) uses the general table. Not used: games against the coach. Its strength setting is a custom weakening of Stockfish, not a real rating.

Things to know about the calibration:
- **It's on the Lichess rating scale.** Lichess ratings run higher than Chess.com ratings for the same strength, especially at lower levels, and the app doesn't invent a conversion. The card's tooltip says "Lichess rating scale".
- **Depth matters.** Lichess's evals come from deeper analysis than the app's quick reviews. Shallow analysis misses tactics, so mistakes look smaller and the estimate higher. Below depth 16 the card shows **low confidence**; the deeper analysis (depth 18) clears it.
- **One game is noisy.** On the calibration data, a single 40-move game's estimate is typically about 500–700 points from the player's real rating (`sigma40` in the JSON). The displayed range is the middle 50% of that spread, so it's honest rather than narrow.

**Pulling it toward reality.**
- **Shrinkage:** when the game header has the player's rating (Chess.com games), the estimate is blended with it. The raw estimate's weight is n / (n + 25) for n counted moves, so a 15-move game leans mostly on the known rating and an 80-move game mostly on its own moves. Games against the coach have no known rating, so there is no shrinkage and the range is wider.
- **Cap:** with a known rating and fewer than 30 counted moves, the estimate can't exceed the known rating by more than 200.
- **Clamp:** results are limited to the app's Elo range, 400–2500 (`ELO_MIN`/`ELO_MAX` in `src/config/strength.ts`); a top of 2500 shows as "2500+".

All of these numbers are in `ESTIMATE_CONFIG` and `RATING_COUNT_CONFIG`.

**Older reviews.** The rating was never stored, so older reviews are recomputed with the new method when you open them; games analyzed before the change say "Recalculated with the updated method" on the card.

**Rebuilding the table:**

```bash
node scripts/build-rating-calibration.mjs --month 2024-01 --bytes 261107712
```

It downloads that many bytes of the month's file into `data/` (gitignored), needs `zstd` on the PATH, and writes `src/coach/ratingCalibration.json` (commit that file).

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
  analysis/            Best move tab controller
  game/position.ts     FEN/PGN parsing, board setup checks, playable-position check
  game/practice.ts     Play from here: goals, judging, the way back to the review
  learn/               Learn mode: lesson types, validation, registry, progress, tablebase client,
                       suggestions, controller; lessons/<section>/*.ts are the lesson data
  ui/learnPanel.ts     the Learn panel
  config/learn.ts      Learn tuning (Try margin, engine depth, hold length, suggestions)
  ui/practiceDialog.ts, ui/practiceCard.ts   its dialog and Play-panel card
  config/analysis.ts   Best move depths and line count
  ui/analysisPanel.ts  the Best move side panel
  review/              Review mode: Chess.com client, PGN import, IndexedDB cache, analysis queue,
                       per-game stats, openings, patterns, save-as-puzzle, controller
  config/review.ts     review presets and thresholds
  ui/reviewPanel.ts    the Review side panel
  reviewScreen/        the shared game review screen (summary, coach line, retry, lines, key moments)
  coach/moveClass.ts   the 10-class classifier (Book/Miss/Great/Brilliant rules) and migration
  coach/estimate.ts    estimated game rating (range, shrinkage, cap) and phase grades
  coach/ratingMoves.ts which moves count toward the rating (shared with the calibration script)
  coach/ratingCalibration.json  drop → rating tables, built by scripts/build-rating-calibration.mjs
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
scripts/verify-lessons.mjs   checks every lesson with Stockfish and the Lichess tablebase
scripts/build-rating-calibration.mjs  fits the estimated-rating tables on Lichess games
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
- Rating calibration: the [Lichess open database](https://database.lichess.org/) (CC0), games with engine evaluations.
- Endgame results: the [Lichess tablebase](https://tablebase.lichess.ovh) API (free, no key; one request at a time). When it's unreachable, the app says so and uses Stockfish instead.

## License

Stockfish and chessground are GPL-3.0, so this app is distributed under **GPL-3.0-or-later**.
