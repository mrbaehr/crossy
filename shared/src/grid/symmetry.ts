// Pure 180° rotational symmetry logic for crossword grids.
//
// A block toggle in symmetry mode must mirror its rotational partner as a single
// atomic operation (see docs/ARCHITECTURE.md — the sync layer relies on this being
// one op so the mirror can never desync). All functions here are pure: they take a
// block-state description and return a new one, mutating nothing.

import type { Coord } from "../index.js";

/**
 * Minimal grid shape this module reasons about. The full cell model lives in the
 * DB/shared types; here we only need dimensions and which cells are blocks.
 * Callers can project their richer grid onto this and apply the returned changes.
 */
export interface BlockGrid {
  width: number;
  height: number;
  /** Set of "row,col" keys that are blocks. */
  blocks: ReadonlySet<string>;
}

/** Stable key for a coordinate. */
export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

/** Parse a cell key back into a coordinate. */
export function parseCellKey(key: string): Coord {
  const [row, col] = key.split(",").map(Number) as [number, number];
  return { row, col };
}

/**
 * The 180° rotational partner of (row, col) in a grid of the given size.
 * For odd dimensions the exact center maps to itself (returns the same coord).
 */
export function symmetricPartner(
  width: number,
  height: number,
  row: number,
  col: number,
): Coord {
  return { row: height - 1 - row, col: width - 1 - col };
}

/** True when (row, col) is the exact center of an odd×odd grid (self-symmetric). */
export function isCenterCell(
  width: number,
  height: number,
  row: number,
  col: number,
): boolean {
  const partner = symmetricPartner(width, height, row, col);
  return partner.row === row && partner.col === col;
}

export interface ToggleResult {
  /** The resulting block set after the toggle. */
  blocks: ReadonlySet<string>;
  /** Coords whose block state changed (1 for center/asymmetric, up to 2 otherwise). */
  changed: Coord[];
}

/**
 * Toggle a block at (row, col) as a single atomic operation.
 *
 * When `symmetryEnabled`, the 180° partner is toggled to match the TARGET cell's
 * new state (both become blocks, or both become non-blocks) so the grid stays
 * symmetric even if it had drifted. The center cell of an odd grid toggles once.
 *
 * When symmetry is disabled, only the targeted cell toggles.
 *
 * Returns a new block set and the list of changed coords. Does not mutate input.
 */
export function toggleBlock(
  grid: BlockGrid,
  row: number,
  col: number,
  symmetryEnabled: boolean,
): ToggleResult {
  if (!inBounds(grid, row, col)) {
    throw new RangeError(
      `toggleBlock: (${row},${col}) out of bounds for ${grid.width}x${grid.height}`,
    );
  }

  const next = new Set(grid.blocks);
  const key = cellKey(row, col);
  const willBeBlock = !next.has(key);
  const changed: Coord[] = [];

  setBlock(next, key, willBeBlock);
  changed.push({ row, col });

  if (symmetryEnabled) {
    const partner = symmetricPartner(grid.width, grid.height, row, col);
    if (!(partner.row === row && partner.col === col)) {
      const pKey = cellKey(partner.row, partner.col);
      // Mirror the TARGET's new state so the pair is always consistent.
      if (next.has(pKey) !== willBeBlock) {
        setBlock(next, pKey, willBeBlock);
        changed.push(partner);
      }
    }
  }

  return { blocks: next, changed };
}

/**
 * Check whether a grid's block set is 180°-symmetric: every block has its partner
 * also blocked. Useful for validation (#21) and detecting drift.
 */
export function isSymmetric(grid: BlockGrid): boolean {
  for (const key of grid.blocks) {
    const { row, col } = parseCellKey(key);
    const partner = symmetricPartner(grid.width, grid.height, row, col);
    if (!grid.blocks.has(cellKey(partner.row, partner.col))) return false;
  }
  return true;
}

/**
 * Return the minimal set of coords that would need to become blocks to make the
 * grid symmetric (i.e. partners of existing blocks that aren't blocks yet).
 * Empty when already symmetric.
 */
export function symmetryGaps(grid: BlockGrid): Coord[] {
  const gaps: Coord[] = [];
  for (const key of grid.blocks) {
    const { row, col } = parseCellKey(key);
    const partner = symmetricPartner(grid.width, grid.height, row, col);
    if (!grid.blocks.has(cellKey(partner.row, partner.col))) gaps.push(partner);
  }
  return gaps;
}

// --- internals ---

function inBounds(grid: BlockGrid, row: number, col: number): boolean {
  return row >= 0 && row < grid.height && col >= 0 && col < grid.width;
}

function setBlock(set: Set<string>, key: string, isBlock: boolean): void {
  if (isBlock) set.add(key);
  else set.delete(key);
}
