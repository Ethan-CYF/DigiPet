// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: native.invoke }));
beforeEach(() => {
  localStorage.clear(); native.invoke.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const reference = "11111111-1111-4111-8111-111111111111";
function fields() {
  fireEvent.change(screen.getByLabelText("API base URL"), { target: { value: "https://example.test/v1" } });
  fireEvent.change(screen.getByLabelText("API model"), { target: { value: "chat" } });
  fireEvent.change(screen.getByLabelText("API key"), { target: { value: "fixture-secret" } });
}
it("opens on fresh install, skips, restores on restart and reopens from settings", async () => {
  const view = render(<App />);
  expect(screen.getByLabelText("API setup")).toBeTruthy();
  expect(screen.getByText("Save / 儲存").hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByText("Skip for now / 暫時略過"));
  await waitFor(() => expect(screen.queryByLabelText("API setup")).toBeNull());
  expect(native.invoke).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "hello" } });
  fireEvent.click(screen.getByLabelText("Send message"));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("(M0 stub)"));
  view.unmount(); render(<App />);
  expect(screen.queryByLabelText("API setup")).toBeNull();
  fireEvent.keyDown(screen.getByLabelText(/DigiPet: click/), { key: "Enter" });
  fireEvent.click(screen.getByText("Settings / 設定"));
  expect(screen.getByLabelText("API setup")).toBeTruthy();
});
it("saves only after opt-in, sends through native transport, stops and ignores late results", async () => {
  let resolve!: (value: string) => void;
  native.invoke.mockImplementation((command: string) => {
    if (command === "save_api_credential") return Promise.resolve(reference);
    if (command === "api_reply") return new Promise<string>(r => { resolve = r; });
    return Promise.resolve();
  });
  const view = render(<App />); fields();
  expect(native.invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Cloud consent"));
  fireEvent.click(screen.getByText("Save / 儲存"));
  await waitFor(() => expect(screen.queryByLabelText("API setup")).toBeNull());
  expect(localStorage.getItem("digipet.api.v1")).not.toContain("fixture-secret");
  view.unmount(); render(<App />);
  fireEvent.keyDown(screen.getByLabelText(/DigiPet: click/), { key: "Enter" });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "hello" } });
  fireEvent.click(screen.getByLabelText("Send message"));
  await waitFor(() => expect(native.invoke).toHaveBeenCalledWith("api_reply", expect.objectContaining({ consent: true, text: "hello", route: expect.objectContaining({ credentialRef: reference }) })));
  fireEvent.click(screen.getByText("Stop / 停止"));
  expect(native.invoke).toHaveBeenCalledWith("stop_api_reply", expect.objectContaining({ requestId: expect.any(String) }));
  await act(async () => resolve("late reply"));
  expect(screen.getByRole("status").textContent).toBe("Stopped / 已停止");
});
it("shows returned API content as text and sanitizes transport failures", async () => {
  localStorage.setItem("digipet.api.v1", JSON.stringify({ completed: true, cloudConsent: true, route: { kind: "openai-compatible", baseUrl: "https://example.test/v1", model: "chat", credentialRef: reference } }));
  native.invoke.mockResolvedValue("<script>fixture</script>");
  render(<App />);
  fireEvent.keyDown(screen.getByLabelText(/DigiPet: click/), { key: "Enter" });
  const send = () => {
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "hello" } });
    fireEvent.click(screen.getByLabelText("Send message"));
  };
  send(); await waitFor(() => expect(screen.getByRole("status").textContent).toBe("<script>fixture</script>"));
  expect(document.querySelector("script")).toBeNull();
  native.invoke.mockRejectedValue(new Error("fixture-secret"));
  await waitFor(() => expect(screen.queryByText("Stop / 停止")).toBeNull());
  send(); await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("API request failed"));
  expect(document.body.textContent).not.toContain("fixture-secret");
});
