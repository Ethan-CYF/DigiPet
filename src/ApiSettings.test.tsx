// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import "fake-indexeddb/auto";
import { history } from "./modules/chat-history";
const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: native.invoke,
  Channel: class {
    onmessage = () => {};
  },
}));
beforeEach(async () => {
  await history.clear();
  localStorage.clear();
  native.invoke.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const reference = "11111111-1111-4111-8111-111111111111";
function fields() {
  fireEvent.change(screen.getByLabelText("API base URL"), {
    target: { value: "https://example.test/v1" },
  });
  fireEvent.change(screen.getByLabelText("API model"), {
    target: { value: "chat" },
  });
  fireEvent.change(screen.getByLabelText("API key"), {
    target: { value: "fixture-secret" },
  });
}
it("opens on fresh install, skips, restores on restart and reopens from settings", async () => {
  const view = render(<App />);
  expect(screen.getByLabelText("API setup")).toBeTruthy();
  expect(screen.getByText("Save / 儲存").hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByText("Skip for now / 暫時略過"));
  await waitFor(() => expect(screen.queryByLabelText("API setup")).toBeNull());
  expect(native.invoke).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "hello" },
  });
  fireEvent.click(screen.getByLabelText("Send message"));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("(M0 stub)"),
  );
  view.unmount();
  render(<App />);
  expect(screen.queryByLabelText("API setup")).toBeNull();
  fireEvent.keyDown(screen.getByLabelText(/DigiPet: click/), { key: "Enter" });
  fireEvent.click(screen.getByText("Settings / 設定"));
  expect(screen.getByLabelText("API setup")).toBeTruthy();
});
it("saves only after opt-in, sends through native transport, stops and ignores late results", async () => {
  let resolve!: (value: string) => void;
  native.invoke.mockImplementation(
    (command: string, args: { text?: string }) => {
      if (command === "redact_chat_text") return Promise.resolve(args.text);
      if (command === "save_api_credential") return Promise.resolve(reference);
      if (command === "api_reply")
        return new Promise<string>((r) => {
          resolve = r;
        });
      return Promise.resolve();
    },
  );
  const view = render(<App />);
  fields();
  expect(native.invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Cloud consent"));
  fireEvent.click(screen.getByText("Save / 儲存"));
  await waitFor(() => expect(screen.queryByLabelText("API setup")).toBeNull());
  expect(localStorage.getItem("digipet.api.v1")).not.toContain(
    "fixture-secret",
  );
  view.unmount();
  render(<App />);
  fireEvent.keyDown(screen.getByLabelText(/DigiPet: click/), { key: "Enter" });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "hello" },
  });
  fireEvent.click(screen.getByLabelText("Send message"));
  await waitFor(() =>
    expect(native.invoke).toHaveBeenCalledWith(
      "api_reply",
      expect.objectContaining({
        consent: true,
        text: "hello",
        route: expect.objectContaining({ credentialRef: reference }),
      }),
    ),
  );
  fireEvent.click(screen.getByText("Stop / 停止"));
  expect(native.invoke).toHaveBeenCalledWith(
    "stop_api_reply",
    expect.objectContaining({ requestId: expect.any(String) }),
  );
  await act(async () => resolve("late reply"));
  expect(screen.getByRole("status").textContent).toBe("Stopped / 已停止");
});
it("shows returned API content as text and sanitizes transport failures", async () => {
  localStorage.setItem(
    "digipet.api.v1",
    JSON.stringify({
      completed: true,
      cloudConsent: true,
      route: {
        kind: "openai-compatible",
        baseUrl: "https://example.test/v1",
        model: "chat",
        credentialRef: reference,
      },
    }),
  );
  native.invoke.mockImplementation((command, args) =>
    Promise.resolve(
      command === "redact_chat_text" ? args.text : "<script>fixture</script>",
    ),
  );
  render(<App />);
  fireEvent.keyDown(screen.getByLabelText(/DigiPet: click/), { key: "Enter" });
  const send = () => {
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));
  };
  send();
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe(
      "<script>fixture</script>",
    ),
  );
  expect(document.querySelector("script")).toBeNull();
  native.invoke.mockRejectedValue(new Error("fixture-secret"));
  await waitFor(() => expect(screen.queryByText("Stop / 停止")).toBeNull());
  send();
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "API request failed",
    ),
  );
  expect(document.body.textContent).not.toContain("fixture-secret");
});
it("streams progressively, keeps stopped text in history, resumes after error and restores history", async () => {
  localStorage.setItem(
    "digipet.api.v1",
    JSON.stringify({
      completed: true,
      cloudConsent: true,
      route: {
        kind: "openai-compatible",
        baseUrl: "https://example.test/v1",
        model: "chat",
        credentialRef: reference,
      },
    }),
  );
  let update!: (event: { text: string }) => void;
  let finish!: (value: string) => void;
  let fail!: (reason: string) => void;
  native.invoke.mockImplementation((command, args) => {
    if (command === "redact_chat_text") return Promise.resolve(args.text);
    if (command === "api_reply") {
      update = args.onUpdate.onmessage;
      return new Promise<string>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
    }
    if (command === "stop_api_reply") {
      fail("Request stopped");
      return Promise.resolve();
    }
    return Promise.resolve();
  });
  const view = render(<App />);
  fireEvent.keyDown(screen.getByLabelText(/DigiPet: click/), { key: "Enter" });
  const send = () => {
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "continue" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));
  };
  send();
  await waitFor(() => expect(update).toBeTypeOf("function"));
  act(() => update({ text: "first" }));
  expect(screen.getByRole("status").textContent).toBe("first");
  act(() => update({ text: "first second" }));
  fireEvent.click(screen.getByText("Stop / 停止"));
  await waitFor(() => expect(screen.queryByText("Stop / 停止")).toBeNull());
  expect(screen.getByRole("status").textContent).toBe(
    "first second\nStopped / 已停止",
  );
  expect((await history.list())[0].messages.at(-1)).toMatchObject({
    content: "first second",
    status: "stopped",
  });
  update = undefined as unknown as typeof update;
  send();
  await waitFor(() => expect(update).toBeTypeOf("function"));
  await act(async () => fail("API HTTP 401"));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Authentication failed",
    ),
  );
  await waitFor(() => expect(screen.queryByText("Stop / 停止")).toBeNull());
  update = undefined as unknown as typeof update;
  send();
  await waitFor(() => expect(update).toBeTypeOf("function"));
  await act(async () => finish("recovered"));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("recovered"),
  );
  await waitFor(() => expect(screen.queryByText("Stop / 停止")).toBeNull());
  view.unmount();
  render(<App />);
  fireEvent.keyDown(screen.getByLabelText(/DigiPet: click/), { key: "Enter" });
  const saved = (await history.list())[0];
  await waitFor(() =>
    expect(
      screen.getByLabelText("Conversation").querySelectorAll("option"),
    ).toHaveLength(2),
  );
  fireEvent.change(screen.getByLabelText("Conversation"), {
    target: { value: saved.id },
  });
  expect(screen.getByRole("status").textContent).toBe("recovered");
  fireEvent.click(screen.getByText("Delete / 刪除"));
  await waitFor(async () => expect(await history.list()).toEqual([]));
});
it("persists revoked per-provider consent and explicit fallback and persona settings", async () => {
  native.invoke.mockImplementation((_command, args) =>
    Promise.resolve(args.text),
  );
  localStorage.setItem(
    "digipet.api.v1",
    JSON.stringify({
      completed: true,
      cloudConsent: true,
      route: {
        kind: "openai-compatible",
        baseUrl: "https://example.test/v1",
        model: "chat",
        credentialRef: reference,
      },
    }),
  );
  render(<App />);
  fireEvent.keyDown(screen.getByLabelText(/DigiPet: click/), { key: "Enter" });
  fireEvent.click(screen.getByText("Settings / 設定"));
  expect(
    (screen.getByLabelText("Enable fallback") as HTMLInputElement).checked,
  ).toBe(false);
  fireEvent.click(
    screen.getByLabelText("Consent https://example.test/v1 chat"),
  );
  fireEvent.click(screen.getByLabelText("Enable fallback"));
  fireEvent.change(screen.getByLabelText("System prompt"), {
    target: { value: "Be kind" },
  });
  fireEvent.click(screen.getByText("Save router / 儲存路由"));
  await waitFor(() => expect(screen.queryByLabelText("API setup")).toBeNull());
  const saved = JSON.parse(localStorage.getItem("digipet.api.v1")!);
  expect(saved.routes[0].consent).toBe(false);
  expect(saved.cloudConsent).toBe(false);
  expect(saved.fallbackEnabled).toBe(true);
  expect(saved.systemPrompt).toBe("Be kind");
});
it("can revoke consent with a locked keychain when persona is unchanged", async () => {
  localStorage.setItem(
    "digipet.api.v1",
    JSON.stringify({
      completed: true,
      cloudConsent: true,
      route: {
        kind: "openai-compatible",
        baseUrl: "https://example.test/v1",
        model: "chat",
        credentialRef: reference,
      },
    }),
  );
  native.invoke.mockRejectedValue(new Error("keychain locked"));
  render(<App />);
  fireEvent.keyDown(screen.getByLabelText(/DigiPet: click/), { key: "Enter" });
  fireEvent.click(screen.getByText("Settings / 設定"));
  fireEvent.click(
    screen.getByLabelText("Consent https://example.test/v1 chat"),
  );
  fireEvent.click(screen.getByText("Save router / 儲存路由"));
  await waitFor(() => expect(screen.queryByLabelText("API setup")).toBeNull());
  expect(
    JSON.parse(localStorage.getItem("digipet.api.v1")!).routes[0].consent,
  ).toBe(false);
  expect(native.invoke).not.toHaveBeenCalled();
});
