// Pure crossword numbering + entry derivation.
//
// Standard rules: scan cells left-to-right, top-to-bottom. A white cell gets a
// number if it starts an Across entry (no white cell to its left, white cell to
// its right) and/or a Down entry (no white cell above, white cell below). Numbers
// increment in scan order across both directions.

import { cellKey, type BlockGrid } from "./symmetry.js";
import type { Coord, Direction } from "../index.js";

export interface NumberedCell {
  row: number;
  col: number;
  /** Assigned clue number, or null if this cell starts no entry. */
  number: number | null;
}

export interface DerivedEntry {
  direction: Direction;
  number: number;
  /** Ordered cells of the slot, from the numbered start cell. */
  cells: Coord[];
}

export interface NumberingResult {
  /** Numbers keyed by "row,col" for cells that start an entry. */
  numbers: Map<string, number>;
  entries: DerivedEntry[];
}

function isWhite(grid: BlockGrid, row: number, col: number): boolean {
  if (row < 0 || row >= grid.height || col < 0 || col >= grid.width) return false;
  return !grid.blocks.has(cellKey(row, col));
}

function startsAcross(grid: BlockGrid, r: number, c: number): boolean {
  return isWhite(grid, r, c) && !isWhite(grid, r, c - 1) && isWhite(grid, r, c + 1);
}

function startsDown(grid: BlockGrid, r: number, c: number): boolean {
  return isWhite(grid, r, c) && !isWhite(grid, r - 1, c) && isWhite(grid, r + 1, c);
}

/** Compute standard numbering and derive Across/Down entries. Pure. */
export function numberGrid(grid: BlockGrid): NumberingResult {
  const numbers = new Map<string, number>();
  const entries: DerivedEntry[] = [];
  let n = 0;

  for (let r = 0; r < grid.height; r++) {
    for (let c = 0; c < grid.width; c++) {
      const across = startsAcross(grid, r, c);
      const down = startsDown(grid, r, c);
      if (!across && !down) continue;

      n += 1;
      numbers.set(cellKey(r, c), n);

      if (across) {
        const cells: Coord[] = [];
        let cc = c;
        while (isWhite(grid, r, cc)) {
          cells.push({ row: r, col: cc });
          cc += 1;
        }
        entries.push({ direction: "across", number: n, cells });
      }
      if (down) {
        const cells: Coord[] = [];
        let rr = r;
        while (isWhite(grid, rr, c)) {
          cells.push({ row: rr, col: c });
          rr += 1;
        }
        entries.push({ direction: "down", number: n, cells });
      }
    }
  }

  return { numbers, entries };
}

/** Stable identity for an entry across renumbering: direction + its start cell. */
export function entryStartKey(direction: Direction, cells: Coord[]): string {
  const start = cells[0]!;
  return `${direction}:${start.row},${start.col}`;
}
