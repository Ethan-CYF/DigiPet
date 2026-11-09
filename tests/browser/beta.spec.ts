import { test, expect } from "@playwright/test";
import { createServer } from "node:http";

// UI + mock IPC/keychain + a loopback OpenAI-compatible endpoint. This does not
// exercise a real OS credential store or the packaged WebView (manual only).
test("fresh API setup to first chat and restored history with a local mock provider", async ({ page }) => {
  const calls: any[] = [];
  const fakeKey = "beta-fixture-credential";
  const reference = "77777777-7777-4777-8777-777777777777";
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    expect(req.url).toBe("/v1/chat/completions");
    expect(req.headers.authorization).toBe(`Bearer ${fakeKey}`);
    calls.push(JSON.parse(body));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Hello beta tester" } }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing loopback address");
  const vault = new Map<string, string>();
  try {
    await page.exposeFunction("betaNative", async (command: string, args: any) => {
      if (command === "save_api_credential") {
        expect(args.baseUrl).toBe("https://example.test/v1");
        expect(args.apiKey).toBe(fakeKey);
        vault.set(reference, args.apiKey);
        return reference;
      }
      if (command === "redact_chat_text") return args.text.replaceAll(fakeKey, "[REDACTED]");
      if (command === "api_reply") {
        expect(args.consent).toBe(true);
        // Never connect to the UI-supplied URL: this adapter only uses loopback.
        const response = await fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${vault.get(args.route.credentialRef)}` },
          body: JSON.stringify({ model: args.route.model, messages: args.messages, stream: false }),
        });
        return (await response.json()).choices[0].message.content;
      }
    });
    await page.addInitScript(() => {
      Object.assign(window, {
        __TAURI_INTERNALS__: {
          transformCallback: () => 1,
          unregisterCallback: () => {},
          invoke: async (command: string, args: any) => {
            if (command === "api_reply") args.onUpdate.onmessage({ ready: true });
            return (window as any).betaNative(command, args);
          },
        },
      });
    });
    await page.goto("/");
    await expect(page.getByLabel("API setup", { exact: true })).toBeVisible();
    await page.getByLabel("API base URL").fill("https://example.test/v1");
    await page.getByLabel("API model").fill("beta-mock");
    await page.getByLabel("API key", { exact: true }).fill(fakeKey);
    await expect(page.getByText("Save / 儲存", { exact: true })).toBeDisabled();
    await page.getByLabel("Cloud consent").check();
    await page.getByText("Save / 儲存", { exact: true }).click();
    await expect(page.getByLabel("API setup", { exact: true })).toHaveCount(0);
    expect(calls).toHaveLength(0);
    await page.getByLabel("Message", { exact: true }).fill("hello beta");
    await page.getByLabel("Send message").click();
    await expect(page.getByRole("status")).toHaveText("Hello beta tester");
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe("beta-mock");
    expect(calls[0].messages.at(-1).content).toBe("hello beta");
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(fakeKey);
    await page.reload();
    await expect(page.getByLabel("API setup", { exact: true })).toHaveCount(0);
    await page.getByLabel("DigiPet: click to chat, drag to move").press("Enter");
    await page.getByLabel("Open controls / 開啟管理面板").click();
    await page.getByRole("button", { name: "Conversations / 對話", exact: true }).click();
    await page.getByLabel("Conversation").selectOption({ label: "hello beta" });
    await page.getByRole("button", { name: "Chat / 聊天", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Hello beta tester");
    expect(calls).toHaveLength(1);
    await page.getByLabel("Open controls / 開啟管理面板").click();
    await page.getByRole("button", { name: "Providers / 供應商", exact: true }).click();
    await expect(page.getByLabel("API key", { exact: true })).toHaveCount(0);
  } finally {
    vault.clear();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
