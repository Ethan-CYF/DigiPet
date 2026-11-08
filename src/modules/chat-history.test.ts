// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, expect, it } from "vitest";
import {
  history,
  openHistory,
  contextMessages,
  type Conversation,
} from "./chat-history";
import { rememberSecret, redact } from "./redaction";
beforeEach(async () => {
  await history.clear();
});
const conversation = (id = "one"): Conversation => ({
  id,
  title: "hello",
  updated: 0,
  messages: [
    { role: "user", content: "hello" },
    { role: "assistant", content: "partial", status: "stopped" },
  ],
});
it("survives database reopen, preserves stopped output and continues a conversation", async () => {
  const c = conversation();
  await history.save(c);
  const db = await openHistory();
  db.close();
  expect((await history.list())[0].messages[1]).toEqual(c.messages[1]);
  c.messages.push({ role: "user", content: "continue" });
  await history.save(c);
  expect(await history.list()).toHaveLength(1);
  expect((await history.list())[0].messages).toHaveLength(3);
});
it("deletes one conversation and clears all persistently", async () => {
  await history.save(conversation());
  await history.save(conversation("two"));
  await history.remove("one");
  expect((await history.list()).map((c) => c.id)).toEqual(["two"]);
  await history.clear();
  expect(await history.list()).toEqual([]);
});
it("redacts secrets in titles, messages and persona; excludes extra fields", async () => {
  rememberSecret("fixture-private-value");
  const text =
    "fixture-private-value sk-example123456 Bearer fixture-token api_key=fixture-token";
  await history.save({
    ...conversation(),
    title: text,
    messages: [{ role: "user", content: text }],
    apiKey: "fixture-private-value",
  } as Conversation);
  const stored = JSON.stringify(await history.list());
  for (const secret of [
    "fixture-private-value",
    "sk-example123456",
    "fixture-token",
    "apiKey",
  ])
    expect(stored).not.toContain(secret);
  expect(stored).toContain("[REDACTED]");
  expect(redact("normal text")).toBe("normal text");
});
it("sends only the last N messages plus an optional persona without status fields", () => {
  const c = conversation();
  c.messages.push({ role: "user", content: "next" });
  expect(contextMessages(c.messages, 2, "Be kind")).toEqual([
    { role: "system", content: "Be kind" },
    { role: "assistant", content: "partial" },
    { role: "user", content: "next" },
  ]);
});
it("rejects oversized writes without overwriting the last saved conversation", async () => {
  await history.save(conversation());
  await expect(
    history.save({
      ...conversation(),
      messages: [{ role: "user", content: "x".repeat(3 * 1024 * 1024) }],
    }),
  ).rejects.toThrow("too large");
  expect((await history.list())[0].title).toBe("hello");
});
