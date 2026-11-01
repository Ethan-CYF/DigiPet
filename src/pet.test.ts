import { describe, expect, it } from "vitest";
import { hitRegions, opaqueAt, palette, pixels } from "./pet";

describe("sprite alpha hit-testing", () => {
  it("has exactly sixteen rows and columns and only defined palette colors", () => {
    expect(pixels).toHaveLength(16);
    for (const row of pixels) {
      expect(row).toHaveLength(16);
      for (const value of row)
        expect(value === "." || value in palette).toBe(true);
    }
  });
  it("matches every sprite pixel after scaling and translation, preserving gaps", () => {
    const regions = hitRegions({ x: 36, y: 53, width: 128, height: 128 });
    const hit = (x: number, y: number) =>
      regions.some(
        (r) => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height,
      );
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        expect(hit(36 + x * 8 + 4, 53 + y * 8 + 4)).toBe(opaqueAt(x, y));
      }
    expect(hit(36 + 7 * 8 + 4, 53 + 1 * 8 + 4)).toBe(false); // Between ears.
    expect(hit(0, 0)).toBe(false);
  });
});
