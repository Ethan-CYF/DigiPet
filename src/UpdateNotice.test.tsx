// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import UpdateNotice, { useUpdateNotice } from "./UpdateNotice";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
function Notice({ desktop, open = true }: { desktop: boolean; open?: boolean }) {
  const notice = useUpdateNotice(desktop);
  return open ? <UpdateNotice {...notice} /> : null;
}
beforeEach(() => { invoke.mockReset(); });
afterEach(cleanup);

it("checks metadata once and opens a page only after an explicit click", async () => {
  const url = "https://github.com/Ethan-CYF/DigiPet/releases/tag/v0.2.0";
  invoke.mockResolvedValue({ version: "0.2.0", tag: "v0.2.0", url });
  const view = render(<Notice desktop />);
  await screen.findByRole("complementary", { name: "Update notice" });
  view.rerender(<Notice desktop open={false} />);
  view.rerender(<Notice desktop />);
  expect(invoke.mock.calls).toEqual([["check_for_update"]]);
  expect(screen.getByText(/Unsigned \/ Unverified Publisher/)).toBeTruthy();
  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe(url);
  fireEvent.click(link);
  expect(invoke.mock.calls).toEqual([["check_for_update"], ["open_release_page", { tag: "v0.2.0" }]]);
  fireEvent.click(screen.getByRole("button", { name: /Dismiss update/ }));
  expect(screen.queryByRole("link")).toBeNull();
});
it.each([null, undefined])("stays silent when no release exists (%s)", async (response) => {
  invoke.mockResolvedValue(response);
  const view = render(<Notice desktop />);
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
  expect(view.container.textContent).toBe("");
});
it("ignores offline/native errors without blocking or retrying", async () => {
  invoke.mockRejectedValue(new Error("offline"));
  const view = render(<Notice desktop />);
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
  expect(view.container.textContent).toBe("");
});
it("does not make network calls from the browser preview", () => {
  render(<Notice desktop={false} />);
  expect(invoke).not.toHaveBeenCalled();
});
