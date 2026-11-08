import { describe, expect, it, vi } from "vitest";
import {
  routedReply,
  ChatError,
  nativeTransport,
  type ProviderRoute,
  type Transport,
} from "./ai-router";
const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  channel: null as unknown as { onmessage: (event: unknown) => void },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: native.invoke,
  Channel: class {
    constructor() {
      native.channel = this as unknown as typeof native.channel;
    }
  },
}));
const provider = (name: string, consent = true): ProviderRoute => ({
  route: {
    kind: "openai-compatible",
    baseUrl: `https://${name}.test/v1`,
    model: "chat",
    credentialRef: name,
  },
  consent,
});
const messages = [{ role: "user" as const, content: "hello" }];
const signal = () => new AbortController().signal;
describe("API-only router", () => {
  it("requires consent for the active provider even with fallback enabled", async () => {
    const transport = vi.fn();
    await expect(
      routedReply(
        messages,
        {
          routes: [provider("a", false), provider("b")],
          fallbackEnabled: true,
        },
        signal(),
        () => {},
        transport,
      ),
    ).rejects.toThrow("consent");
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not silently fall back by default", async () => {
    const transport = vi.fn().mockRejectedValue(new ChatError("API timeout"));
    await expect(
      routedReply(
        messages,
        { routes: [provider("a"), provider("b")] },
        signal(),
        () => {},
        transport,
      ),
    ).rejects.toThrow("timed out");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("selects active route, retries within bounds, then skips unconsented fallback", async () => {
    const transport = vi.fn().mockImplementation(async (route) => {
      if (route.credentialRef === "c") return "ok";
      throw new ChatError("API HTTP 503");
    });
    expect(
      await routedReply(
        messages,
        {
          routes: [provider("skip", false), provider("b"), provider("c")],
          activeRouteId: "b",
          fallbackEnabled: true,
          retries: 1,
        },
        signal(),
        () => {},
        transport,
      ),
    ).toBe("ok");
    expect(transport.mock.calls.map((c) => c[0].credentialRef)).toEqual([
      "b",
      "b",
      "c",
    ]);
  });
  it.each([
    "API HTTP 401",
    "API HTTP 403",
    "API HTTP 404",
    "API HTTP 400",
    "API HTTP 422",
  ])("does not resend %s to another provider", async (code) => {
    const transport = vi.fn().mockRejectedValue(new ChatError(code));
    await expect(
      routedReply(
        messages,
        {
          routes: [provider("a"), provider("b")],
          fallbackEnabled: true,
          retries: 2,
        },
        signal(),
        () => {},
        transport,
      ),
    ).rejects.toBeInstanceOf(ChatError);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("never retries or switches after partial output", async () => {
    const update = vi.fn();
    const transport: Transport = vi.fn(async (_r, _m, _s, emit) => {
      emit("partial");
      throw new ChatError("API timeout");
    });
    await expect(
      routedReply(
        messages,
        {
          routes: [provider("a"), provider("b")],
          fallbackEnabled: true,
          retries: 2,
        },
        signal(),
        update,
        transport,
      ),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("partial");
  });
  it("rechecks revocation before a retry", async () => {
    const p = provider("a");
    const transport = vi.fn(async () => {
      p.consent = false;
      throw new ChatError("API HTTP 503");
    });
    await expect(
      routedReply(
        messages,
        { routes: [p], retries: 1 },
        signal(),
        () => {},
        transport,
      ),
    ).rejects.toThrow("consent");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("does not send an already aborted request", async () => {
    const c = new AbortController();
    c.abort();
    const transport = vi.fn();
    await expect(
      routedReply(
        messages,
        { routes: [provider("a")] },
        c.signal,
        () => {},
        transport,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("cancels mid-stream without fallback", async () => {
    const c = new AbortController();
    const update = vi.fn();
    const transport = vi.fn(async (_r, _m, _s, emit) => {
      emit("kept");
      c.abort();
      throw new DOMException("Stopped", "AbortError");
    });
    await expect(
      routedReply(
        messages,
        { routes: [provider("a"), provider("b")], fallbackEnabled: true },
        c.signal,
        update,
        transport,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(update).toHaveBeenCalledWith("kept");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("native cancellation covers abort before request registration and ignores late tokens", async () => {
    const c = new AbortController();
    let done!: (value: string) => void;
    native.invoke.mockImplementation((command) =>
      command === "api_reply"
        ? new Promise<string>((r) => {
            done = r;
          })
        : Promise.resolve(),
    );
    const update = vi.fn();
    const result = nativeTransport(
      provider("a").route,
      messages,
      c.signal,
      update,
      1000,
    );
    native.channel.onmessage({ ready: true, text: null });
    expect(update).not.toHaveBeenCalled();
    native.channel.onmessage({ text: "partial" });
    expect(update).toHaveBeenCalledWith("partial");
    c.abort();
    native.channel.onmessage({ ready: true });
    native.channel.onmessage({ text: "late" });
    done("late");
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(update).toHaveBeenCalledTimes(1);
    expect(
      native.invoke.mock.calls.filter((c) => c[0] === "stop_api_reply"),
    ).toHaveLength(2);
  });
});
it("ignores late IPC snapshots after completion and never retries unclassified failures", async () => {
  native.invoke.mockResolvedValue("complete");
  const update = vi.fn();
  expect(
    await nativeTransport(
      provider("a").route,
      messages,
      signal(),
      update,
      1000,
    ),
  ).toBe("complete");
  native.channel.onmessage({ text: "late" });
  expect(update).not.toHaveBeenCalled();
  const transport = vi
    .fn()
    .mockRejectedValue(new Error("untrusted provider detail"));
  await expect(
    routedReply(
      messages,
      {
        routes: [provider("a"), provider("b")],
        fallbackEnabled: true,
        retries: 2,
      },
      signal(),
      update,
      transport,
    ),
  ).rejects.not.toThrow("untrusted");
  expect(transport).toHaveBeenCalledTimes(1);
});
