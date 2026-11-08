// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureApi,
  credentialStore,
  downloadModel,
  inspectHardware,
  loadSettings,
  safeSettings,
  saveSettings,
  SETTINGS_KEY,
  validateConfig,
} from "./model-wizard";
const ref = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
describe("API-only settings", () => {
  it("validates endpoint and model without echoing secret-bearing input", () => {
    expect(validateConfig(" https://example.test/v1/ ", " chat ")).toEqual({
      baseUrl: "https://example.test/v1",
      model: "chat",
    });
    for (const url of [
      "http://example.test",
      "https://user:fixture-secret@example.test",
      "https://example.test?key=fixture-secret",
      "https://example.test/#fixture-secret",
      "file:///fixture-secret",
      "invalid-fixture-secret",
    ]) {
      expect(() => validateConfig(url, "chat")).toThrow();
      try {
        validateConfig(url, "chat");
      } catch (e) {
        expect(String(e)).not.toContain("fixture-secret");
      }
    }
    for (const model of ["", " ", "chat\n", "x".repeat(201)])
      expect(() => validateConfig("https://example.test", model)).toThrow();
  });
  it("persists only an allowlist of non-secret fields and restores route and consent", () => {
    const input = {
      completed: true,
      cloudConsent: true,
      apiKey: "fixture-secret",
      route: {
        kind: "openai-compatible" as const,
        baseUrl: "https://example.test/v1",
        model: "chat",
        credentialRef: ref,
        apiKey: "fixture-secret",
      },
    };
    saveSettings(input);
    expect(localStorage.getItem(SETTINGS_KEY)).not.toContain("fixture-secret");
    expect(localStorage.getItem(SETTINGS_KEY)).not.toContain("apiKey");
    expect(loadSettings()).toEqual(safeSettings(input));
    localStorage.setItem(SETTINGS_KEY, '{"broken":true}');
    expect(loadSettings().completed).toBe(false);
  });
  it("requires consent before saving credentials and sanitizes keychain errors", async () => {
    const save = vi
      .spyOn(credentialStore, "save")
      .mockRejectedValue(new Error("fixture-secret"));
    await expect(
      configureApi("https://example.test", "chat", "fixture-secret", false),
    ).rejects.toThrow("consent");
    expect(save).not.toHaveBeenCalled();
    await expect(
      configureApi("https://example.test", "chat", "fixture-secret", true),
    ).rejects.not.toThrow("fixture-secret");
    expect(localStorage.length).toBe(0);
  });
  it("cleans up a new credential if settings persistence fails", async () => {
    vi.spyOn(credentialStore, "save").mockResolvedValue(ref);
    const remove = vi.spyOn(credentialStore, "remove").mockResolvedValue();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    await expect(
      configureApi("https://example.test", "chat", "fixture-secret", true),
    ).rejects.toThrow("saved");
    expect(remove).toHaveBeenCalledWith(ref);
  });
  it("never inspects hardware or downloads models", async () => {
    expect((await inspectHardware()).explanation).toBe("API-only build");
    await expect(downloadModel("anything")).rejects.toThrow("API-only");
  });
});
