// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const native = vi.hoisted(() => ({
  enabled: false,
  monitored: true,
  drag: vi.fn(),
  invoke: vi.fn(),
  listeners: new Map<string, (event: unknown) => void>(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => native.enabled,
  invoke: (command: string) => {
    native.invoke(command);
    return Promise.resolve(
      command === "begin_pet_gesture" ? native.monitored : undefined,
    );
  },
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ startDragging: native.drag }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, callback: (event: unknown) => void) => {
    native.listeners.set(event, callback);
    return Promise.resolve(() => native.listeners.delete(event));
  },
}));
beforeEach(() => {
  native.enabled = false;
  native.monitored = true;
  native.drag.mockReset().mockResolvedValue(undefined);
  native.invoke.mockReset();
  native.listeners.clear();
});
afterEach(cleanup);
const pet = () => screen.getByRole("button", { name: /DigiPet: click/ });
function clickPet() {
  fireEvent.mouseDown(pet(), { button: 0, screenX: 100, screenY: 100 });
  fireEvent.mouseUp(pet(), { button: 0, screenX: 100, screenY: 100 });
}

describe("pet interaction", () => {
  it("toggles once for a stationary click and closes on a second click", () => {
    render(<App />);
    clickPet();
    expect(screen.getByRole("textbox")).toBeTruthy();
    clickPet();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("ignores whitespace and returns the exact Traditional Chinese stub as text", () => {
    render(<App />);
    clickPet();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByRole("status").textContent).toBe("你好！我是 DigiPet。");
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "你好 <script>test</script>" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByRole("status").textContent).toBe(
      "(M0 stub) 收到：你好 <script>test</script>",
    );
    expect(document.querySelector("script")).toBeNull();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  });
  it("does not toggle on a drag even when released at its original point", () => {
    render(<App />);
    fireEvent.mouseDown(pet(), { button: 0, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(pet(), { buttons: 1, screenX: 120, screenY: 100 });
    fireEvent.mouseUp(pet(), { button: 0, screenX: 100, screenY: 100 });
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("supports keyboard activation and Escape", () => {
    render(<App />);
    fireEvent.keyDown(pet(), { key: "Enter" });
    expect(screen.getByRole("textbox")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("starts native dragging on mousedown and consumes only the native click completion", async () => {
    native.enabled = true;
    render(<App />);
    fireEvent.mouseDown(pet(), { button: 0, screenX: 100, screenY: 100 });
    await waitFor(() => expect(native.drag).toHaveBeenCalledTimes(1));
    fireEvent.mouseUp(pet(), { button: 0, screenX: 100, screenY: 100 });
    expect(screen.queryByRole("textbox")).toBeNull();
    act(() => native.listeners.get("pet-click")?.({ payload: null }));
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
  it("uses a movement threshold if global native input is unavailable", async () => {
    native.enabled = true;
    native.monitored = false;
    render(<App />);
    fireEvent.mouseDown(pet(), { button: 0, screenX: 100, screenY: 100 });
    await act(async () => {});
    expect(native.drag).not.toHaveBeenCalled();
    fireEvent.mouseMove(pet(), { buttons: 1, screenX: 120, screenY: 100 });
    await waitFor(() => expect(native.drag).toHaveBeenCalledTimes(1));
    fireEvent.mouseUp(pet(), { button: 0, screenX: 120, screenY: 100 });
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
