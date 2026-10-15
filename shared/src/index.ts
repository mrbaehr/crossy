// Shared types and pure logic used by client, server, and the fill Web Worker.
// Grid logic (symmetry, numbering, stats, export) lands here as pure, unit-tested functions.

export type PuzzleStatus =
  | "idea"
  | "filling"
  | "cluing"
  | "ready"
  | "submitted";

export interface PuzzleSize {
  width: number;
  height: number;
}

/** NYT submission limits (verified from the submission guide). See docs/ARCHITECTURE.md. */
export const NYT_LIMITS = {
  themed15: { maxWords: 78, maxBlocks: 42 },
  themeless15: { maxWords: 72, maxBlocks: 42 },
  sunday21: { maxWords: 140 },
} as const;

/** Placeholder pure function proving the shared package + test wiring. Replaced by real grid logic. */
export function isSquareGrid(size: PuzzleSize): boolean {
  return size.width === size.height;
}
