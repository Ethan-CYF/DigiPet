// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  inspectPng,
  validateSheet,
  validateAppearance,
  loadLibrary,
  saveLibrary,
  MAX_BYTES,
} from "./pet-upload";
const bytes = new Uint8Array(readFileSync("tests/fixtures/two-cells.png"));
const png = "data:image/png;base64," + btoa(String.fromCharCode(...bytes));
const config = () => ({
  version: 1,
  columns: 2,
  rows: 1,
  fps: 10,
  states: { idle: [0], happy: [1, 0] },
});
const appearance = () => ({
  id: "test-pet",
  name: "My pet",
  png,
  sheet: config(),
});
beforeEach(() => localStorage.clear());
describe("data-only packs", () => {
  it("accepts an equal-cell PNG with ordered frames and optional states", () => {
    expect(inspectPng(bytes)).toEqual({ width: 64, height: 32 });
    expect(validateSheet(config(), 64, 32)).toEqual(config());
    expect(validateAppearance(appearance())).toEqual(appearance());
    expect(
      validateSheet({ ...config(), states: { idle: [0], sad: [] } }, 64, 32)
        .states,
    ).toEqual({ idle: [0] });
  });
  it.each([
    { script: "alert(1)" },
    { image: "../../etc/passwd" },
    { url: "https://example.com/pet.png" },
    { onLoad: "exec()" },
    { columns: 0 },
    { columns: 3 },
    { rows: 99 },
    { fps: 0 },
    { fps: Infinity },
    { fps: 31 },
    { version: 2 },
    { states: { idle: [] } },
    { states: { idle: [2] } },
    { states: { idle: [-1] } },
    { states: { idle: [0.5] } },
    { states: { walk: [0] } },
    { states: { idle: [0], error: [1] } },
  ])("rejects hostile or malformed config %j", (patch) => {
    expect(() => validateSheet({ ...config(), ...patch }, 64, 32)).toThrow();
  });
  it("rejects prototype keys and nonobjects", () => {
    for (const text of [
      "null",
      "[]",
      '{"__proto__":{}}',
      '{"constructor":"eval"}',
    ])
      expect(() => validateSheet(JSON.parse(text), 64, 32)).toThrow();
    expect(() =>
      validateSheet(
        { ...config(), states: JSON.parse('{"idle":[0],"__proto__":[1]}') },
        64,
        32,
      ),
    ).toThrow();
  });
  it("rejects bad signatures, size bombs, truncation and trailing data before decoding", () => {
    for (const bad of [
      new Uint8Array(),
      new TextEncoder().encode('<svg onload="alert(1)"/>'),
      bytes.slice(0, 40),
      new Uint8Array(MAX_BYTES + 1),
      new Uint8Array([...bytes, 1]),
    ])
      expect(() => inspectPng(bad)).toThrow();
    const apng = bytes.slice();
    const idat = apng.findIndex(
      (_, i) => String.fromCharCode(...apng.slice(i, i + 4)) === "IDAT",
    );
    apng.set([97, 99, 84, 76], idat);
    expect(() => inspectPng(apng)).toThrow();
    const huge = bytes.slice();
    new DataView(huge.buffer).setUint32(16, 999999);
    expect(() => inspectPng(huge)).toThrow();
    expect(() =>
      validateAppearance({ ...appearance(), png: "file:///etc/passwd" }),
    ).toThrow();
    expect(() =>
      validateAppearance({
        ...appearance(),
        png: "data:image/svg+xml;base64,AAAA",
      }),
    ).toThrow();
    expect(() =>
      validateAppearance({ ...appearance(), id: "../../evil" }),
    ).toThrow();
    expect(() =>
      validateAppearance({ ...appearance(), command: "touch /tmp/pwned" }),
    ).toThrow();
  });
});
describe("local appearance library", () => {
  it("persists imports and selection across reload, deletion and restoring default", () => {
    const pet = validateAppearance(appearance());
    saveLibrary({ appearances: [pet], selected: pet.id });
    expect(loadLibrary()).toEqual({ appearances: [pet], selected: pet.id });
    saveLibrary({ appearances: [pet], selected: "default" });
    expect(loadLibrary().selected).toBe("default");
    saveLibrary({ appearances: [], selected: "default" });
    expect(loadLibrary()).toEqual({ appearances: [], selected: "default" });
  });
  it("falls back safely for broken JSON, invalid saved packs, stale selection and denied storage", () => {
    for (const text of [
      "invalid",
      "null",
      JSON.stringify({ appearances: [{ script: "exec" }] }),
    ]) {
      localStorage.setItem("digipet.appearances.v1", text);
      expect(loadLibrary()).toEqual({ appearances: [], selected: "default" });
    }
    saveLibrary({ appearances: [], selected: "missing" });
    expect(loadLibrary().selected).toBe("default");
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw Error("denied");
      });
    expect(loadLibrary().selected).toBe("default");
    spy.mockRestore();
  });
  it("reports full/denied storage without silently discarding the saved library", () => {
    saveLibrary({ appearances: [], selected: "default" });
    expect(() =>
      saveLibrary({
        appearances: Array(9).fill(appearance()),
        selected: "test-pet",
      }),
    ).toThrow();
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });
    expect(() =>
      saveLibrary({
        appearances: [validateAppearance(appearance())],
        selected: "test-pet",
      }),
    ).toThrow();
    spy.mockRestore();
    expect(loadLibrary()).toEqual({ appearances: [], selected: "default" });
  });
});
