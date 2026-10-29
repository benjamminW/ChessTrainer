/**
 * Lesson format. A lesson is plain data (a TS module under src/learn/lessons/<section>/),
 * so adding one never touches UI code. Every position and accepted move is checked by
 * scripts/verify-lessons.mjs (engine, plus the Lichess tablebase for 7 pieces or fewer).
 *
 * Keep this file free of local value imports: the verify script loads lesson modules with
 * Node's type stripping, and type-only imports are erased.
 */

export type Section = 'openings' | 'middlegame' | 'endgames';
export type Side = 'w' | 'b';

/** An arrow on the board. Colors map to the board's brushes. */
export interface LessonArrow {
  from: string;
  to: string;
  color?: 'green' | 'red' | 'blue' | 'yellow';
}

/** A highlighted square. */
export interface LessonSquare {
  sq: string;
  color?: 'green' | 'red' | 'blue' | 'yellow';
}

/** A claim about a position, checked by the verifier: "this is a win for White" / "a draw". */
export interface Claim {
  side: Side;
  result: 'win' | 'draw';
}

/** An annotated position: text, arrows and highlighted squares. */
export interface ExplainStep {
  type: 'explain';
  fen: string;
  /** Optional: the moves (UCI from the start) that reach `fen`; the validator checks they do. */
  line?: string;
  text: string;
  arrows?: LessonArrow[];
  squares?: LessonSquare[];
  claim?: Claim;
}

/** You make one move; any move within the margin of the best is accepted. */
export interface TryStep {
  type: 'try';
  fen: string;
  prompt: string;
  /** Shown on the first hint. */
  hint: string;
  /** The move shown on the second hint and after a wrong move (UCI). Verified to be within the margin. */
  solution: string;
  /** Said after a correct move. */
  success: string;
  /** Win% margin from the best move (default LEARN_CONFIG.tryMargin). With 7 pieces or fewer the tablebase decides: the result must not get worse. */
  margin?: number;
  /** Only the quickest win counts (e.g. "mate in one"): same distance to mate as the best move. */
  fastest?: boolean;
  claim?: Claim;
}

/** Play it out against the coach (or the tablebase) from this position. */
export interface PracticeStep {
  type: 'practice';
  fen: string;
  prompt: string;
  userColor: Side;
  /** What counts as done. 'win' needs checkmate; 'draw' needs a drawn ending or surviving `maxMoves` of your moves. */
  goal: 'win' | 'draw';
  /** Your moves before a draw goal counts as held (default LEARN_CONFIG.holdMoves). */
  maxMoves?: number;
}

/**
 * Opening drill: you play `side` from move 1 and the coach answers from the listed lines.
 * Each line is a full move sequence (UCI, space-separated) that must be a line of the Lichess
 * chess-openings dataset, which also supplies its name and ECO code.
 */
export interface DrillStep {
  type: 'drill';
  /** Always the start position (kept for the board and the schema). */
  fen: string;
  prompt: string;
  side: Side;
  lines: string[];
  /**
   * Optional one- or two-sentence ideas for your book moves, keyed by the moves up to and
   * including that move (UCI). Without one, the coach's own move description is used.
   */
  notes?: Record<string, string>;
}

export type LessonStep = ExplainStep | TryStep | PracticeStep | DrillStep;

export interface Lesson {
  /** Unique, stable (progress is stored under it). */
  id: string;
  section: Section;
  title: string;
  /** One line for the lesson list. */
  summary: string;
  /** Order within the section (lower first). */
  order: number;
  /** Opening families this lesson covers (dataset name prefixes), for Review's "where you left book" link. */
  openings?: string[];
  /** Lichess puzzle theme tags for "Practice this theme" (optional). */
  puzzleThemes?: string[];
  steps: LessonStep[];
}
