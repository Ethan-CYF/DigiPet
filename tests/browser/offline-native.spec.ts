import { test, expect } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("offline UI uses real Rust calendar, journal and search; restart retains data and grants", async ({
  page,
  context,
}) => {
  const folder = await mkdtemp(join(tmpdir(), "digipet-offline-"));
  const project = join(folder, "project");
  await mkdir(project);
  await writeFile(join(project, "visible.txt"), "offline needle");
  let child: ChildProcessWithoutNullStreams;
  let request: (value: unknown) => Promise<any>;
  function start() {
    child = spawn(
      resolve(
        `tools-core/target/debug/examples/model_fixture${process.platform === "win32" ? ".exe" : ""}`,
      ),
      [folder],
    );
    const lines = createInterface({ input: child.stdout })[
      Symbol.asyncIterator
    ]();
    let queue = Promise.resolve();
    request = (value) => {
      const next = queue.then(async () => {
        child.stdin.write(JSON.stringify(value) + "\n");
        const line = await lines.next();
        if (line.done) throw Error("Fixture ended");
        const r = JSON.parse(line.value);
        if (r.error) throw Error(r.error);
        return r.ok;
      });
      queue = next.then(
        () => {},
        () => {},
      );
      return next;
    };
  }
  async function stop() {
    if (child.exitCode === null) {
      const exited = new Promise<void>((resolve) =>
        child.once("exit", () => resolve()),
      );
      child.kill();
      await exited;
    }
  }
  try {
    start();
    expect((await request({ op: "grants" })).tools).toEqual([
      "calendar",
      "journal",
    ]);
    await request({ op: "grant", tool: "file_search" });
    await page.exposeFunction("m5Native", async (cmd: string, args: any) => {
      if (cmd === "tool_grants") return request({ op: "grants" });
      if (
        cmd === "tool_grant" &&
        ["calendar", "journal"].includes(args.tool) &&
        !args.pickFolder
      )
        return request({
          op: "toggle_local",
          tool: args.tool,
          enabled: args.enabled,
        });
      if (cmd === "tool_run")
        return request({ op: "run", tool: args.tool, args: args.arguments });
      if (cmd === "tool_confirm")
        return request({
          op: "confirm",
          token: args.token,
          approved: args.approved,
        });
      if (cmd === "tool_cancel") return request({ op: "cancel" });
      if (cmd === "tool_reminders") return [];
      if (cmd === "redact_chat_text") return args.text;
      return undefined;
    });
    await page.addInitScript(() => {
      if (!localStorage.getItem("digipet.api.v1"))
        localStorage.setItem(
          "digipet.api.v1",
          JSON.stringify({
            completed: true,
            cloudConsent: false,
            openOnStartup: true,
            rememberConversation: true,
            version: 5,
          }),
        );
      Object.assign(window, {
        isTauri: true,
        __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
        __TAURI_INTERNALS__: {
          metadata: { currentWindow: { label: "main" } },
          transformCallback: () => 1,
          unregisterCallback: () => {},
          invoke: (cmd: string, args: any) =>
            (window as any).m5Native(cmd, args),
        },
      });
    });
    await page.goto("/");
    await context.setOffline(true);
    await page.getByLabel("Open controls / 開啟管理面板").click();
    await page
      .getByRole("button", { name: "Tools & state / 工具與狀態", exact: true })
      .click();
    await page
      .getByText("Local tools (offline) / 本機工具（離線）", { exact: true })
      .click();
    await page
      .getByLabel("Local tool", { exact: true })
      .selectOption("calendar");
    await page.getByText("Run locally / 本機執行", { exact: true }).click();
    await expect(page.getByLabel("Local tool result")).toHaveText("[]");
    await page
      .getByRole("button", { name: "Providers / 供應商", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Local tool access / 本機工具授權",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: /Request local access again/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", { name: "calendar", exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "journal", exact: true }),
    ).toBeChecked();
    await page.getByRole("checkbox", { name: "calendar", exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: "calendar", exact: true }),
    ).not.toBeChecked();
    await stop();
    start();
    expect((await request({ op: "grants" })).tools).not.toContain("calendar");
    await page
      .getByRole("button", { name: "Tools & state / 工具與狀態", exact: true })
      .click();
    await page.getByText("Run locally / 本機執行", { exact: true }).click();
    await expect(page.getByLabel("Local tool result")).toContainText(
      "Unavailable or denied",
    );
    await page
      .getByRole("button", {
        name: "Grant or repair access / 授權或修復存取",
        exact: true,
      })
      .click();
    await page.getByRole("checkbox", { name: "calendar", exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: "calendar", exact: true }),
    ).toBeChecked();
    await page
      .getByRole("button", { name: "Tools & state / 工具與狀態", exact: true })
      .click();
    for (const [tool, date] of [
      ["calendar", "20261109T090000Z"],
      ["journal", "2026-11-09"],
    ]) {
      await page.getByLabel("Local tool", { exact: true }).selectOption(tool);
      await page.getByLabel("Local action").selectOption("create");
      await page.getByLabel("Local title").fill(`offline ${tool}`);
      await page.getByLabel("Local date").fill(date);
      await page.getByLabel("Local text").fill("keep after restart");
      await page.getByText("Run locally / 本機執行", { exact: true }).click();
      await expect(
        page.getByRole("dialog", { name: "Confirm local write" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Chat / 聊天", exact: true })
        .click();
      await expect(page.getByLabel("Send message")).toBeDisabled();
      await page.getByLabel("Open controls / 開啟管理面板").click();
      await expect(
        page.getByRole("dialog", { name: "Confirm local write" }),
      ).toBeVisible();
      await page
        .getByRole("dialog", { name: "Confirm local write" })
        .getByRole("button", { name: "Reject / 拒絕", exact: true })
        .press("Escape");
      await page.getByLabel("Open controls / 開啟管理面板").click();
      await page
        .getByRole("button", {
          name: "Tools & state / 工具與狀態",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Confirm local write" }),
      ).toBeVisible();
      await page
        .getByRole("dialog", { name: "Confirm local write" })
        .getByRole("button", { name: "Reject / 拒絕", exact: true })
        .click();
      await expect(page.getByLabel("Local tool result")).toContainText(
        "rejected",
      );
      await page.getByText("Run locally / 本機執行", { exact: true }).click();
      await page
        .getByText("Confirm local write / 確認本機寫入", { exact: true })
        .click();
      await expect(page.getByLabel("Local tool result")).toContainText("saved");
    }
    await stop();
    start();
    await context.setOffline(false);
    await page.reload();
    await context.setOffline(true);
    await page.getByLabel("Open controls / 開啟管理面板").click();
    await page
      .getByRole("button", { name: "Tools & state / 工具與狀態", exact: true })
      .click();
    await page
      .getByText("Local tools (offline) / 本機工具（離線）", { exact: true })
      .click();
    for (const tool of ["calendar", "journal"]) {
      await page.getByLabel("Local tool", { exact: true }).selectOption(tool);
      await page.getByText("Run locally / 本機執行", { exact: true }).click();
      await expect(page.getByLabel("Local tool result")).toContainText(
        `offline ${tool}`,
      );
    }
    await page
      .getByLabel("Local tool", { exact: true })
      .selectOption("file_search");
    await page.getByLabel("Local path").fill(project);
    await page.getByLabel("Local text").fill("needle");
    await page.getByText("Run locally / 本機執行", { exact: true }).click();
    await expect(page.getByLabel("Local tool result")).toContainText(
      "visible.txt",
    );
    expect((await request({ op: "grants" })).tools).toEqual([
      "calendar",
      "file_search",
      "journal",
    ]);
  } finally {
    await stop();
    await rm(folder, { recursive: true, force: true });
  }
});
