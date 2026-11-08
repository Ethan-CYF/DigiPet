// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
import { loadSettings, saveSettings, SETTINGS_KEY } from "./model-wizard";
import { resetStorageComponent } from "./recovery";
import {
  history,
  openHistory,
  exportHistory,
  prepareHistoryExport,
} from "./chat-history";
import { rememberSecret } from "./redaction";
import { runTask } from "./tools";
import { inspectPng, validateSheet } from "./pet-upload";
import { readFileSync } from "node:fs";
beforeEach(async () => {
  localStorage.clear();
  await history.clear();
  vi.restoreAllMocks();
});
it.each([
  { completed: true, cloudConsent: false },
  {
    completed: true,
    cloudConsent: true,
    route: {
      kind: "openai-compatible",
      baseUrl: "https://example.test",
      model: "chat",
      credentialRef: "11111111-1111-4111-8111-111111111111",
    },
  },
  {
    completed: true,
    cloudConsent: false,
    routes: [],
    systemPrompt: "persona",
    fallbackEnabled: false,
  },
])(
  "migrates existing M2–M4 storage variants with a retained original",
  (old) => {
    const raw = JSON.stringify(old);
    localStorage.setItem(SETTINGS_KEY, raw);
    const next = loadSettings();
    expect(next.version).toBe(5);
    expect(localStorage.getItem(SETTINGS_KEY + ".pre-m5")).toBe(raw);
    expect(loadSettings()).toEqual(next);
    saveSettings({ ...next, openOnStartup: true, rememberConversation: false });
    expect(loadSettings()).toMatchObject({
      openOnStartup: true,
      rememberConversation: false,
    });
  },
);
it("corrupt settings require explicit backup/reset and leave unrelated grants/library alone", () => {
  localStorage.setItem(SETTINGS_KEY, "broken");
  localStorage.setItem("digipet.appearances.v1", "healthy");
  expect(loadSettings().cloudConsent).toBe(false);
  expect(localStorage.getItem(SETTINGS_KEY)).toBe("broken");
  resetStorageComponent(SETTINGS_KEY);
  expect(
    Object.keys(localStorage).some(
      (k) => k.includes(".backup.") && localStorage.getItem(k) === "broken",
    ),
  ).toBe(true);
  expect(localStorage.getItem("digipet.appearances.v1")).toBe("healthy");
});
it("failed backup cannot remove original settings", () => {
  localStorage.setItem(SETTINGS_KEY, "broken");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("full");
  });
  expect(() => resetStorageComponent(SETTINGS_KEY)).toThrow();
  expect(localStorage.getItem(SETTINGS_KEY)).toBe("broken");
});
it("transactionally quarantines malformed history while preserving healthy history across reopen", async () => {
  await history.save({
    id: "ok",
    title: "healthy",
    updated: 1,
    messages: [{ role: "user", content: "keep" }],
  });
  const db = await openHistory();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("conversations", "readwrite");
    tx.objectStore("conversations").put({ id: "broken", messages: "bad" });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject();
  });
  db.close();
  await expect(history.list()).rejects.toThrow();
  await history.repair();
  expect((await history.list()).map((c) => c.id)).toEqual(["ok"]);
  const reopened = await openHistory();
  const raw = await new Promise<any[]>((resolve) => {
    const req = reopened
      .transaction("recovery")
      .objectStore("recovery")
      .getAll();
    req.onsuccess = () => resolve(req.result);
  });
  reopened.close();
  expect(raw[0].value).toEqual({ id: "broken", messages: "bad" });
});
it("exports allowlisted history with secrets redacted", () => {
  rememberSecret("fixture-private");
  const exported = exportHistory([
    {
      id: "one",
      title: "fixture-private",
      updated: 1,
      messages: [{ role: "user", content: "Bearer fixture-token" }],
      apiKey: "do-not-export",
    } as any,
  ]);
  for (const secret of [
    "fixture-private",
    "fixture-token",
    "do-not-export",
    "apiKey",
  ])
    expect(exported).not.toContain(secret);
});
it("generated manifest indices and byte mutations are bounded and never invoke native capabilities", () => {
  const good = new Uint8Array(readFileSync("tests/fixtures/two-cells.png"));
  let seed = 0x5eed;
  for (let n = 0; n < 512; n++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const bad = good.slice();
    bad[seed % bad.length] ^= 1;
    expect(() => inspectPng(bad)).toThrow();
    const index = 2 + (seed % 100000);
    expect(() =>
      validateSheet(
        { version: 1, columns: 2, rows: 1, fps: 10, states: { idle: [index] } },
        64,
        32,
      ),
    ).toThrow();
  }
});
it("concrete malformed model outputs cannot call grants, confirm, shell or backend tools", async () => {
  const tools = {
    run: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
  for (const name of [
    "tool_grant",
    "tool_repair",
    "tool_confirm",
    "shell",
    "__proto__",
  ]) {
    await expect(
      runTask(
        [],
        async () =>
          ({
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "1",
                type: "function",
                function: {
                  name,
                  arguments: '{"action":"grant","approved":true}',
                },
              },
            ],
          }) as any,
        tools,
        new AbortController().signal,
        () => {},
        async () => true,
      ),
    ).rejects.toThrow();
  }
  expect(tools.run).not.toHaveBeenCalled();
  expect(tools.confirm).not.toHaveBeenCalled();
});

it("redacts native keychain secrets before JSON escaping in exports", async () => {
  const secret = 'fixture-quote"and\\slash';
  const result = await prepareHistoryExport(
    [
      {
        id: "one",
        updated: 1,
        title: secret,
        messages: [{ role: "user", content: secret }],
      },
    ],
    async (text) => text.replaceAll(secret, "[REDACTED]"),
  );
  expect(result).not.toContain("fixture-quote");
  expect(JSON.parse(result)[0].messages[0].content).toBe("[REDACTED]");
});
