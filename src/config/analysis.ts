/** Best move tab (position analysis) tuning. */

export interface AnalysisDepth {
  id: 'fast' | 'normal' | 'deep';
  name: string;
  depth: number;
}

/**
 * Search depth per setting, on the bundled Stockfish 19 Lite (single thread):
 * depth 12 ≈ 0.2 s, 16 ≈ 1 s, 20 ≈ 3–8 s depending on the position.
 */
export const ANALYSIS_DEPTHS: AnalysisDepth[] = [
  { id: 'fast', name: 'Fast (depth 12)', depth: 12 },
  { id: 'normal', name: 'Normal (depth 16)', depth: 16 },
  { id: 'deep', name: 'Deep (depth 20)', depth: 20 },
];

export const ANALYSIS_CONFIG = {
  defaultDepth: 'normal' as AnalysisDepth['id'],
  /** Candidate moves shown (MultiPV). */
  lines: 3,
  /** Moves of each line shown in the panel. */
  lineLength: 8,
};
