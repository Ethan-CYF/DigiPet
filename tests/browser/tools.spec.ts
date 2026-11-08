import { test, expect } from "@playwright/test";
test("mock native tools display exact write preview, require confirmation, and Stop cancels approval", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "digipet.api.v1",
      JSON.stringify({
        completed: true,
        cloudConsent: true,
        route: {
          kind: "openai-compatible",
          baseUrl: "https://example.test/v1",
          model: "chat",
          credentialRef: "11111111-1111-4111-8111-111111111111",
        },
      }),
    );
    let writes = 0;
    let turn = 0;
    Object.assign(window, {
      isTauri: true,
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: "main" } },
        transformCallback: () => 1,
        unregisterCallback: () => {},
        invoke: async (command: string, args: Record<string, any>) => {
          if (command === "redact_chat_text") return args.text;
          if (command === "tool_reminders") return [];
          if (command === "tool_grants")
            return { tools: ["report"], folders: { report: ["allowed"] } };
          if (command === "api_tool_turn") {
            args.onUpdate.onmessage({ ready: true });
            return ++turn % 2
              ? {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: {
                        name: "report",
                        arguments: JSON.stringify({
                          action: "export",
                          path: "allowed/report.md",
                          title: "Daily",
                          text: "Report body",
                        }),
                      },
                    },
                  ],
                }
              : { role: "assistant", content: "Report saved" };
          }
          if (command === "tool_run")
            return {
              preview: {
                token: "ui-only-token",
                tool: "report",
                target: "allowed/report.md",
                diff: "--- before\n+++ after\n@@ -1,1 +1,3 @@\n-Old report\n+# Daily\n+\n+Report body\n",
                before: "Old report",
                after: "# Daily\n\nReport body",
              },
            };
          if (command === "tool_confirm") {
            if (args.approved) writes++;
            return { status: args.approved ? "saved" : "rejected" };
          }
          if (command === "tool_cancel") {
            Object.assign(window, { m4Writes: writes });
          }
        },
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("DigiPet: click to chat, drag to move").press("Enter");
  await page.getByLabel("AI tools / AI 工具", { exact: true }).check();
  await page.getByLabel("Message", { exact: true }).fill("Export daily report");
  await page.getByLabel("Send message").click();
  const dialog = page.getByRole("dialog", { name: "Confirm tool write" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Old report");
  await expect(dialog).toContainText("-Old report");
  await expect(dialog).toContainText("Report body");
  await expect(page.getByRole("status")).toContainText(
    "Awaiting write confirmation",
  );
  await dialog.getByText("Confirm write / 確認寫入", { exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Report saved");
  expect(await page.evaluate(() => (window as any).m4Writes)).toBe(1);
  await page.getByLabel("Message", { exact: true }).fill("Export again");
  await page.getByLabel("Send message").click();
  await expect(dialog).toBeVisible();
  await page.getByText("Stop / 停止", { exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("Stopped");
  expect(await page.evaluate(() => (window as any).m4Writes)).toBe(1);
});
