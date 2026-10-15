import { describe, expect, it } from "vitest";
import {
  cellKey,
  isCenterCell,
  isSymmetric,
  symmetricPartner,
  symmetryGaps,
  toggleBlock,
  type BlockGrid,
} from "./symmetry.js";

function grid(width: number, height: number, blocks: string[] = []): BlockGrid {
  return { width, height, blocks: new Set(blocks) };
}

describe("symmetricPartner", () => {
  it("maps corners to opposite corners (15x15)", () => {
    expect(symmetricPartner(15, 15, 0, 0)).toEqual({ row: 14, col: 14 });
    expect(symmetricPartner(15, 15, 0, 14)).toEqual({ row: 14, col: 0 });
    expect(symmetricPartner(15, 15, 14, 0)).toEqual({ row: 0, col: 14 });
  });

  it("maps an edge cell to its rotational partner", () => {
    expect(symmetricPartner(15, 15, 0, 7)).toEqual({ row: 14, col: 7 });
    expect(symmetricPartner(15, 15, 3, 0)).toEqual({ row: 11, col: 14 });
  });

  it("maps the odd-grid center to itself", () => {
    expect(symmetricPartner(15, 15, 7, 7)).toEqual({ row: 7, col: 7 });
  });

  it("works for even dimensions (no true center)", () => {
    expect(symmetricPartner(4, 4, 0, 0)).toEqual({ row: 3, col: 3 });
    expect(symmetricPartner(4, 4, 1, 1)).toEqual({ row: 2, col: 2 });
  });
});

describe("isCenterCell", () => {
  it("is true only for the exact center of an odd grid", () => {
    expect(isCenterCell(15, 15, 7, 7)).toBe(true);
    expect(isCenterCell(15, 15, 7, 6)).toBe(false);
    expect(isCenterCell(5, 5, 2, 2)).toBe(true);
  });

  it("is never true for even grids", () => {
    expect(isCenterCell(4, 4, 1, 1)).toBe(false);
    expect(isCenterCell(4, 4, 2, 2)).toBe(false);
  });
});

describe("toggleBlock with symmetry enabled", () => {
  it("blocks a corner and its opposite corner atomically", () => {
    const result = toggleBlock(grid(15, 15), 0, 0, true);
    expect(result.blocks.has(cellKey(0, 0))).toBe(true);
    expect(result.blocks.has(cellKey(14, 14))).toBe(true);
    expect(result.changed).toHaveLength(2);
    expect(result.changed).toContainEqual({ row: 0, col: 0 });
    expect(result.changed).toContainEqual({ row: 14, col: 14 });
  });

  it("unblocks both partners when toggling an existing block", () => {
    const g = grid(15, 15, [cellKey(0, 0), cellKey(14, 14)]);
    const result = toggleBlock(g, 0, 0, true);
    expect(result.blocks.has(cellKey(0, 0))).toBe(false);
    expect(result.blocks.has(cellKey(14, 14))).toBe(false);
    expect(result.changed).toHaveLength(2);
  });

  it("toggles the center cell only once on an odd grid", () => {
    const result = toggleBlock(grid(15, 15), 7, 7, true);
    expect(result.blocks.has(cellKey(7, 7))).toBe(true);
    expect(result.changed).toEqual([{ row: 7, col: 7 }]);
  });

  it("repairs drift: toggling makes the pair consistent (both blocks)", () => {
    // Only the partner is a block; toggling the target to a block leaves both set,
    // and since the partner already matched the new state, only the target changes.
    const g = grid(15, 15, [cellKey(14, 14)]);
    const result = toggleBlock(g, 0, 0, true);
    expect(result.blocks.has(cellKey(0, 0))).toBe(true);
    expect(result.blocks.has(cellKey(14, 14))).toBe(true);
    expect(result.changed).toEqual([{ row: 0, col: 0 }]);
  });

  it("only changes the partner when it isn't already in the target's new state", () => {
    // Target is a block, partner is not. Toggling target -> not-a-block. The partner
    // is ALREADY not-a-block, so it needs no change: only the target changes.
    const g = grid(15, 15, [cellKey(0, 0)]);
    const result = toggleBlock(g, 0, 0, true);
    expect(result.blocks.has(cellKey(0, 0))).toBe(false);
    expect(result.blocks.has(cellKey(14, 14))).toBe(false);
    expect(result.changed).toEqual([{ row: 0, col: 0 }]);
  });

  it("changes both when partner must flip to match the target's new state", () => {
    // Target not-a-block, partner IS a block. Toggling target -> block; partner is
    // already a block, so only the target changes.
    const g = grid(15, 15, [cellKey(14, 14)]);
    const result = toggleBlock(g, 0, 0, true);
    expect(result.changed).toEqual([{ row: 0, col: 0 }]);
    // And the inverse: target IS a block, partner is not, toggling target OFF while
    // partner is a block -> partner must also turn off (both change).
    const g2 = grid(15, 15, [cellKey(0, 0), cellKey(7, 0)]);
    const r2 = toggleBlock(g2, 7, 0, true); // (7,0) block -> off; partner (7,14) not a block already
    expect(r2.changed).toEqual([{ row: 7, col: 0 }]);
  });
});

describe("toggleBlock with symmetry disabled", () => {
  it("toggles only the targeted cell", () => {
    const result = toggleBlock(grid(15, 15), 0, 0, false);
    expect(result.blocks.has(cellKey(0, 0))).toBe(true);
    expect(result.blocks.has(cellKey(14, 14))).toBe(false);
    expect(result.changed).toEqual([{ row: 0, col: 0 }]);
  });
});

describe("toggleBlock purity & bounds", () => {
  it("does not mutate the input grid", () => {
    const g = grid(15, 15);
    const before = new Set(g.blocks);
    toggleBlock(g, 3, 4, true);
    expect(g.blocks).toEqual(before);
    expect(g.blocks.size).toBe(0);
  });

  it("throws on out-of-bounds coordinates", () => {
    expect(() => toggleBlock(grid(15, 15), -1, 0, true)).toThrow(RangeError);
    expect(() => toggleBlock(grid(15, 15), 15, 0, true)).toThrow(RangeError);
    expect(() => toggleBlock(grid(15, 15), 0, 15, true)).toThrow(RangeError);
  });
});

describe("isSymmetric / symmetryGaps", () => {
  it("empty grid is symmetric", () => {
    expect(isSymmetric(grid(15, 15))).toBe(true);
    expect(symmetryGaps(grid(15, 15))).toEqual([]);
  });

  it("detects an asymmetric grid and reports the gap", () => {
    const g = grid(15, 15, [cellKey(0, 0)]);
    expect(isSymmetric(g)).toBe(false);
    expect(symmetryGaps(g)).toContainEqual({ row: 14, col: 14 });
  });

  it("a properly mirrored grid is symmetric", () => {
    const g = grid(15, 15, [cellKey(0, 0), cellKey(14, 14), cellKey(7, 7)]);
    expect(isSymmetric(g)).toBe(true);
    expect(symmetryGaps(g)).toEqual([]);
  });
});
