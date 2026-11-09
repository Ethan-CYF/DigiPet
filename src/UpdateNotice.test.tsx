// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import UpdateNotice, { useUpdateNotice } from "./UpdateNotice";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
function Notice({ desktop }: { desktop: boolean }) {
  const notice = useUpdateNotice(desktop);
  return <><button disabled={notice.checking} onClick={() => void notice.check()}>Check</button><UpdateNotice {...notice} /></>;
}
beforeEach(() => { invoke.mockReset(); });
afterEach(cleanup);

it("makes no startup request; explicit check opens a page only after another click", async () => {
  const url = "https://github.com/Ethan-CYF/DigiPet/releases/tag/v0.2.0";
  invoke.mockResolvedValue({ version: "0.2.0", tag: "v0.2.0", url });
  const view = render(<Notice desktop />);
  view.rerender(<Notice desktop />);
  expect(invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Check"));
  await screen.findByRole("complementary", { name: "Update notice" });
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
  render(<Notice desktop />);
  fireEvent.click(screen.getByText("Check"));
  await waitFor(() => expect(screen.getByText("Check").hasAttribute("disabled")).toBe(false));
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("complementary")).toBeNull();
});
it("ignores offline/native errors without retrying", async () => {
  invoke.mockRejectedValue(new Error("offline"));
  render(<Notice desktop />);
  fireEvent.click(screen.getByText("Check"));
  await waitFor(() => expect(screen.getByText("Check").hasAttribute("disabled")).toBe(false));
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("complementary")).toBeNull();
});
it("does not make network calls from the browser preview", () => {
  render(<Notice desktop={false} />);
  fireEvent.click(screen.getByText("Check"));
  expect(invoke).not.toHaveBeenCalled();
});
