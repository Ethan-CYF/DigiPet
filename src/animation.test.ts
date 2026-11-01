import { describe, it, expect } from "vitest";
import { STATES, transition, frameAt, motion } from "./animation";
import { alphaRegions } from "./Sprite";

describe("seven-state animation", () => {
  it("allows every transition without inventing states; repeated events preserve the frame clock", () => {
    expect(STATES).toHaveLength(7);
    for (const from of STATES)
      for (const to of STATES) {
        const current = { state: from, since: 10 };
        const next = transition(current, to, 100);
        expect(next).toEqual({ state: to, since: from === to ? 10 : 100 });
        if (from === to) expect(next).toBe(current);
      }
  });
  it("plays row-major frame order at FPS, loops and falls back to idle for every missing state", () => {
    const states = { idle: [3, 1], walk: [2, 0] };
    expect(
      [0, 100, 200, 300].map((t) => frameAt(states, "walk", t, 10)),
    ).toEqual([2, 0, 2, 0]);
    for (const state of STATES.filter((s) => s !== "walk"))
      expect(frameAt(states, state, 100, 10)).toBe(1);
    expect(frameAt(states, "walk", -1, 10)).toBe(2);
  });
  it("provides distinct, bounded single-image motion for all states", () => {
    const signatures = STATES.map((s) => JSON.stringify(motion(s, 375)));
    expect(new Set(signatures).size).toBe(7);
    for (const state of STATES)
      for (let t = 0; t < 10000; t += 125) {
        const m = motion(state, t);
        expect(Math.abs(m.x)).toBeLessThanOrEqual(8);
        expect(Math.abs(m.y)).toBeLessThanOrEqual(12);
        expect(m.sx).toBeGreaterThan(0);
        expect(m.sy).toBeGreaterThan(0);
      }
  });
});
describe("current rendered alpha mask", () => {
  it("uses changing arbitrary sprite alpha, transparent holes and transformed bounds", () => {
    const data = new Uint8ClampedArray(4 * 3 * 4);
    for (const index of [0, 2, 3, 5, 9]) data[index * 4 + 3] = 255;
    data[4 * 4 + 3] = 8; // negligible alpha excluded
    const bounds = { x: -20, y: 10, width: 40, height: 30 };
    const hit = (
      regions: ReturnType<typeof alphaRegions>,
      x: number,
      y: number,
    ) =>
      regions.some(
        (r) => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height,
      );
    const first = alphaRegions(data, 4, 3, bounds);
    for (let i = 0; i < 12; i++)
      expect(
        hit(first, -20 + (i % 4) * 10 + 5, 10 + Math.floor(i / 4) * 10 + 5),
      ).toBe(data[i * 4 + 3] > 8);
    data.fill(0);
    data[11 * 4 + 3] = 255;
    const second = alphaRegions(data, 4, 3, bounds);
    expect(hit(second, -15, 15)).toBe(false);
    expect(hit(second, 15, 35)).toBe(true);
    expect(hit(second, 20, 35)).toBe(false);
  });
});
