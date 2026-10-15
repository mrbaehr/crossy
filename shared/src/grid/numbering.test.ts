import { describe, expect, it } from "vitest";
import { cellKey, type BlockGrid } from "./symmetry.js";
import { numberGrid } from "./numbering.js";

function grid(width: number, height: number, blocks: string[] = []): BlockGrid {
  return { width, height, blocks: new Set(blocks) };
}

describe("numberGrid", () => {
  it("numbers a 3x3 open grid correctly", () => {
    // Open 3x3: Across starts at each row's first col; Down at each col's top row.
    // Numbering scan order:
    // (0,0) starts across+down -> 1
    // (0,1) starts down -> 2
    // (0,2) starts down -> 3
    // (1,0) starts across -> 4
    // (2,0) starts across -> 5
    const { numbers, entries } = numberGrid(grid(3, 3));
    expect(numbers.get(cellKey(0, 0))).toBe(1);
    expect(numbers.get(cellKey(0, 1))).toBe(2);
    expect(numbers.get(cellKey(0, 2))).toBe(3);
    expect(numbers.get(cellKey(1, 0))).toBe(4);
    expect(numbers.get(cellKey(2, 0))).toBe(5);

    const across = entries.filter((e) => e.direction === "across").map((e) => e.number);
    const down = entries.filter((e) => e.direction === "down").map((e) => e.number);
    expect(across).toEqual([1, 4, 5]);
    expect(down).toEqual([1, 2, 3]);
  });

  it("derives correct entry cells", () => {
    const { entries } = numberGrid(grid(3, 3));
    const a1 = entries.find((e) => e.direction === "across" && e.number === 1)!;
    expect(a1.cells).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);
    const d2 = entries.find((e) => e.direction === "down" && e.number === 2)!;
    expect(d2.cells).toEqual([
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 2, col: 1 },
    ]);
  });

  it("handles a center block correctly", () => {
    // 3x3 with center (1,1) blocked. Verified numbering:
    //   (0,0)=#1 (across+down), (0,2)=#2 (down), (2,0)=#3 (across)
    const { numbers, entries } = numberGrid(grid(3, 3, [cellKey(1, 1)]));
    expect(numbers.get(cellKey(0, 0))).toBe(1);
    expect(numbers.get(cellKey(0, 2))).toBe(2);
    expect(numbers.get(cellKey(2, 0))).toBe(3);
    // (1,0): left edge, right is block -> no across; above white -> no down. No number.
    expect(numbers.has(cellKey(1, 0))).toBe(false);
    const acrossNums = entries.filter((e) => e.direction === "across").map((e) => e.number);
    const downNums = entries.filter((e) => e.direction === "down").map((e) => e.number);
    expect(acrossNums).toEqual([1, 3]);
    expect(downNums).toEqual([1, 2]);
  });

  it("ignores isolated single white cells (no entry)", () => {
    // A lone white cell surrounded by blocks starts neither across nor down.
    const blocks = [
      cellKey(0, 1),
      cellKey(1, 0),
      cellKey(1, 2),
      cellKey(2, 1),
    ];
    const { numbers } = numberGrid(grid(3, 3, blocks));
    // center (1,1) is white but isolated -> no number
    expect(numbers.has(cellKey(1, 1))).toBe(false);
  });

  it("recomputes after a block is added (renumbering)", () => {
    const before = numberGrid(grid(5, 5));
    // Block an interior cell that actually splits entries, changing the count.
    const after = numberGrid(grid(5, 5, [cellKey(2, 2)]));
    expect(after.entries.length).toBeGreaterThan(before.entries.length);
  });
});
