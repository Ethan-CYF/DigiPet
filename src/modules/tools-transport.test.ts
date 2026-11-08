import { describe, it, expect, vi } from "vitest";
const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  channel: null as unknown as {
    onmessage: (event: { ready: boolean }) => void;
  },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: native.invoke,
  Channel: class {
    constructor() {
      native.channel = this as unknown as typeof native.channel;
    }
  },
}));
import { routedToolModel } from "./tools";
const provider = (id: string) => ({
  route: {
    kind: "openai-compatible" as const,
    baseUrl: `https://${id}.test/v1`,
    model: "chat",
    credentialRef: id,
  },
  consent: true,
});
describe("native function-call transport", () => {
  it("repeats Stop after late IPC registration and rejects the late result", async () => {
    const controller = new AbortController();
    let registered = false;
    let rejectReply: (reason: string) => void = () => {};
    native.invoke.mockReset().mockImplementation((command: string) => {
      if (command === "api_tool_turn")
        return new Promise((_resolve, reject) => {
          rejectReply = reject;
        });
      if (command === "stop_api_reply" && registered)
        rejectReply("Request stopped");
      return Promise.resolve();
    });
    const promise = routedToolModel({ routes: [provider("one")] })(
      [{ role: "user", content: "run" }],
      controller.signal,
    );
    const rejected = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    registered = true;
    native.channel.onmessage({ ready: true });
    await rejected;
    expect(
      native.invoke.mock.calls.filter((c) => c[0] === "stop_api_reply"),
    ).toHaveLength(2);
  });
  it("uses only explicitly enabled M3 fallback routes for retryable errors", async () => {
    native.invoke
      .mockReset()
      .mockImplementation(
        (command: string, args: { route: { credentialRef: string } }) => {
          if (command === "api_tool_turn" && args.route.credentialRef === "one")
            return Promise.reject("API HTTP 503");
          return Promise.resolve({ role: "assistant", content: "done" });
        },
      );
    const model = routedToolModel({
      routes: [provider("one"), provider("two")],
      fallbackEnabled: true,
    });
    expect(
      await model(
        [{ role: "user", content: "run" }],
        new AbortController().signal,
      ),
    ).toMatchObject({ content: "done" });
    expect(
      native.invoke.mock.calls.map((c) => c[1].route.credentialRef),
    ).toEqual(["one", "two"]);
  });
});
