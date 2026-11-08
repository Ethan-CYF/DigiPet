import { test, expect } from "@playwright/test";

test("mock native streaming, Stop, persistent continuation, consent revocation and clear-all", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("digipet.api.v1"))
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
    const active = new Map<string, { reject: (reason: string) => void }>();
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        transformCallback: () => 1,
        unregisterCallback: () => {},
        invoke: async (
          command: string,
          args: {
            text: string;
            requestId: string;
            onUpdate: {
              onmessage: (event: { text?: string; ready?: boolean }) => void;
            };
          },
        ) => {
          if (command === "redact_chat_text") return args.text;
          if (command === "api_reply")
            return new Promise<string>((_resolve, reject) => {
              active.set(args.requestId, { reject });
              args.onUpdate.onmessage({ ready: true });
              args.onUpdate.onmessage({ text: "Progressive partial reply" });
            });
          if (command === "stop_api_reply") {
            active.get(args.requestId)?.reject("Request stopped");
            active.delete(args.requestId);
          }
        },
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("DigiPet: click to chat, drag to move").press("Enter");
  await page.getByLabel("Message", { exact: true }).fill("hello");
  await page.getByLabel("Send message").click();
  await expect(page.getByRole("status")).toHaveText(
    "Progressive partial reply",
  );
  await page.getByText("Stop / 停止", { exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Stopped / 已停止");
  await expect(page.getByLabel("Send message")).toBeEnabled();
  await page.reload();
  await page.getByLabel("DigiPet: click to chat, drag to move").press("Enter");
  await expect(page.getByLabel("Conversation").locator("option")).toHaveCount(
    2,
  );
  await page.getByLabel("Conversation").selectOption({ label: "hello" });
  await expect(page.getByRole("status")).toContainText(
    "Progressive partial reply",
  );
  await expect(page.getByRole("status")).toContainText("Stopped / 已停止");
  await page.getByText("Settings / 設定", { exact: true }).click();
  await page.getByLabel("Consent https://example.test/v1 chat").uncheck();
  await page.getByText("Save router / 儲存路由", { exact: true }).click();
  await page.getByLabel("Message", { exact: true }).fill("blocked");
  await page.getByLabel("Send message").click();
  await expect(page.getByRole("alert")).toContainText("Cloud consent required");
  await expect(page.getByLabel("Send message")).toBeEnabled();
  await page.getByText("Clear all / 全部清除", { exact: true }).click();
  await expect(page.getByLabel("Conversation").locator("option")).toHaveCount(
    1,
  );
  await page.reload();
  await page.getByLabel("DigiPet: click to chat, drag to move").press("Enter");
  await expect(page.getByLabel("Conversation").locator("option")).toHaveCount(
    1,
  );
});
