import { describe, expect, it } from "vitest";
import { encodePuz, type PuzExportCell, type PuzExportInput } from "./puz.js";

function cellGrid(size: number, blocks: [number, number][] = []): PuzExportCell[] {
  const blockSet = new Set(blocks.map(([r, c]) => `${r},${c}`));
  const cells: PuzExportCell[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      cells.push({
        row: r,
        col: c,
        isBlock: blockSet.has(`${r},${c}`),
        letter: blockSet.has(`${r},${c}`) ? null : "A",
        rebus: null,
        isCircled: false,
      });
    }
  }
  return cells;
}

const base: PuzExportInput = {
  width: 3,
  height: 3,
  cells: cellGrid(3),
  title: "Test",
  author: "Max",
  copyright: "© 2026",
  clues: ["A1", "D1", "D2", "D3", "A4", "A5"],
};

// Minimal reader for the header, to validate what we wrote.
function readU16(b: Uint8Array, off: number) {
  return b[off]! | (b[off + 1]! << 8);
}
function readStr(b: Uint8Array, off: number, len: number) {
  return String.fromCharCode(...b.slice(off, off + len));
}

describe("encodePuz", () => {
  it("writes the ACROSS&DOWN magic and version", () => {
    const buf = encodePuz(base);
    expect(readStr(buf, 0x02, 11)).toBe("ACROSS&DOWN");
    expect(readStr(buf, 0x18, 3)).toBe("1.3");
  });

  it("records width, height, and clue count", () => {
    const buf = encodePuz(base);
    expect(buf[0x2c]).toBe(3);
    expect(buf[0x2d]).toBe(3);
    expect(readU16(buf, 0x2e)).toBe(6);
  });

  it("solution grid uses '.' for blocks and letters elsewhere", () => {
    const input = { ...base, cells: cellGrid(3, [[1, 1]]) };
    const buf = encodePuz(input);
    const solStart = 52;
    // (1,1) is index 4 in a 3x3 row-major grid.
    expect(String.fromCharCode(buf[solStart + 4]!)).toBe(".");
    expect(String.fromCharCode(buf[solStart]!)).toBe("A");
  });

  it("player grid uses '-' for fillable cells", () => {
    const buf = encodePuz(base);
    const playerStart = 52 + 9;
    expect(String.fromCharCode(buf[playerStart]!)).toBe("-");
  });

  it("includes title/author/copyright/clues as NUL-terminated strings", () => {
    const buf = encodePuz(base);
    const text = readStr(buf, 52 + 18, buf.length - (52 + 18));
    expect(text).toContain("Test\0");
    expect(text).toContain("Max\0");
    expect(text).toContain("A1\0");
  });

  it("adds a GEXT section when a cell is circled", () => {
    const cells = cellGrid(3);
    cells[0]!.isCircled = true;
    const buf = encodePuz({ ...base, cells });
    const text = readStr(buf, 0, buf.length);
    expect(text).toContain("GEXT");
  });

  it("adds GRBS + RTBL sections for rebus cells", () => {
    const cells = cellGrid(3);
    cells[0]!.rebus = "STAR";
    cells[0]!.letter = "S";
    const buf = encodePuz({ ...base, cells });
    const text = readStr(buf, 0, buf.length);
    expect(text).toContain("GRBS");
    expect(text).toContain("RTBL");
    expect(text).toContain("STAR");
  });

  it("is deterministic", () => {
    expect(encodePuz(base)).toEqual(encodePuz(base));
  });
});
