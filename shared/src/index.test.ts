import { describe, expect, it } from "vitest";
import { isSquareGrid, NYT_LIMITS } from "./index.js";

describe("shared scaffold", () => {
  it("detects square grids", () => {
    expect(isSquareGrid({ width: 15, height: 15 })).toBe(true);
    expect(isSquareGrid({ width: 21, height: 15 })).toBe(false);
  });

  it("exposes verified NYT 15x15 limits", () => {
    expect(NYT_LIMITS.themed15.maxWords).toBe(78);
    expect(NYT_LIMITS.themed15.maxBlocks).toBe(42);
  });
});
