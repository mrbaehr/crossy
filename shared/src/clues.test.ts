import { describe, expect, it } from "vitest";
import { deriveClueStatus, entryAnswer } from "./clues.js";

describe("deriveClueStatus", () => {
  it("none with no drafts", () => expect(deriveClueStatus([])).toBe("none"));
  it("drafted when none chosen", () =>
    expect(deriveClueStatus([{ isChosen: false, bothApproved: false }])).toBe("drafted"));
  it("chosen", () =>
    expect(
      deriveClueStatus([
        { isChosen: false, bothApproved: false },
        { isChosen: true, bothApproved: false },
      ]),
    ).toBe("chosen"));
  it("both-approved wins", () =>
    expect(deriveClueStatus([{ isChosen: true, bothApproved: true }])).toBe("both-approved"));
});

describe("entryAnswer", () => {
  it("reads letters, blank where unfilled, rebus preferred", () => {
    const m: Record<string, { letter: string | null; rebus: string | null }> = {
      "0,0": { letter: "A", rebus: null },
      "0,2": { letter: "X", rebus: "XYZ" },
    };
    const cells = [0, 1, 2].map((col) => ({ row: 0, col }));
    expect(entryAnswer(cells, (r, c) => m[`${r},${c}`])).toEqual(["A", "", "XYZ"]);
  });
});
