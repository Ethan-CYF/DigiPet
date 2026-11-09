import { test, expect } from "@playwright/test";

const petLabel = "DigiPet: click to chat, drag to move";
const controlsLabel = "Open controls / 開啟管理面板";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "digipet.api.v1",
      JSON.stringify({ completed: true, cloudConsent: false }),
    );
  });
});

test("idle is transparent pet only; click opens a small bubble with focus and Escape restores pet focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.mouse.move(390, 690);
  const pet = page.getByLabel(petLabel);
  const bubble = page.getByLabel("DigiPet chat", { exact: true });
  await expect(bubble).toHaveCount(0);
  await expect(
    page.getByLabel("DigiPet controls / 管理面板", { exact: true }),
  ).toBeHidden();
  await expect(page.getByLabel(controlsLabel)).toHaveCSS("opacity", "0");
  for (const selector of ["html", "body", "#root", ".stage", ".pet"]) {
    await expect(page.locator(selector)).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  }
  await test.info().attach("m8-idle", {
    path: await page
      .screenshot({
        path: test.info().outputPath("m8-idle.png"),
        omitBackground: true,
      })
      .then(() => test.info().outputPath("m8-idle.png")),
    contentType: "image/png",
  });
  await pet.click();
  await expect(bubble).toBeVisible();
  await test.info().attach("m8-chat", {
    path: await page
      .screenshot({
        path: test.info().outputPath("m8-chat.png"),
        omitBackground: true,
      })
      .then(() => test.info().outputPath("m8-chat.png")),
    contentType: "image/png",
  });
  await expect(page.getByLabel("Message", { exact: true })).toBeFocused();
  await expect(bubble.getByRole("button")).toHaveCount(1);
  await expect(bubble.getByRole("combobox")).toHaveCount(0);
  await expect(bubble.getByRole("checkbox")).toHaveCount(0);
  await expect(bubble).not.toContainText(
    /Appearance|Settings|State|M6|Conversation|AI tools/,
  );
  await expect(bubble).toHaveCSS("border-top-width", "0px");
  expect(
    await bubble.evaluate((e) => getComputedStyle(e, "::after").content),
  ).not.toBe("none");
  const b = (await bubble.boundingBox())!;
  const p = (await pet.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height + 14).toBeLessThan(p.y);
  await page.getByLabel("Message", { exact: true }).press("Escape");
  await expect(bubble).toHaveCount(0);
  await expect(pet).toBeFocused();
  await pet.press("Space");
  await expect(page.getByLabel("Message", { exact: true })).toBeFocused();
  await pet.click();
  await expect(bubble).toHaveCount(0);
});

test("hover gear, keyboard shortcut and secondary click expose separate settings and all management tabs", async ({
  page,
}) => {
  await page.goto("/");
  const pet = page.getByLabel(petLabel);
  const controls = page.getByLabel(controlsLabel);
  const panel = page.getByLabel("DigiPet controls / 管理面板", { exact: true });
  await pet.hover();
  await expect(controls).toHaveCSS("opacity", "1");
  await controls.click();
  await expect(panel).toBeVisible();
  await test.info().attach("m8-controls", {
    path: await page
      .screenshot({
        path: test.info().outputPath("m8-surface.png"),
        omitBackground: true,
      })
      .then(() => test.info().outputPath("m8-surface.png")),
    contentType: "image/png",
  });
  await expect(page.getByLabel("API setup", { exact: true })).toBeVisible();
  await expect(page.getByLabel("DigiPet chat", { exact: true })).toHaveCount(0);
  for (const name of [
    "Appearance / 外觀",
    "Conversations / 對話",
    "Tools & state / 工具與狀態",
  ]) {
    await panel.getByRole("button", { name, exact: true }).click();
    await expect(
      panel.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByLabel("Animation state")).toBeVisible();
  await panel
    .getByRole("button", { name: "Close controls / 關閉管理面板", exact: true })
    .press("Escape");
  await expect(panel).toBeHidden();
  await expect(pet).toBeFocused();
  await pet.press("Control+,");
  await expect(panel).toBeVisible();
  await page.getByLabel("API base URL").press("Escape");
  await pet.click({ button: "right" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Chat / 聊天", exact: true }).click();
  await expect(page.getByLabel("Message", { exact: true })).toBeFocused();
});

test("dragging and releasing at the start does not open chat", async ({
  page,
}) => {
  await page.goto("/");
  const b = (await page.getByLabel(petLabel).boundingBox())!;
  const x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(
    page.getByRole("navigation", {
      name: "Pet action wheel / 寵物輪盤",
      exact: true,
    }),
  ).toBeHidden();
  await page.mouse.move(x + 25, y, { steps: 4 });
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByLabel("DigiPet chat", { exact: true })).toHaveCount(0);
});

for (const deviceScaleFactor of [1, 1.5, 2]) {
  test(`long restored replies remain scrollable with input and pet visible at ${deviceScaleFactor}x DPI`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 360, height: 640 },
      deviceScaleFactor,
    });
    const page = await context.newPage();
    try {
      await page.goto("/");
      await page.evaluate(async () => {
        localStorage.setItem(
          "digipet.api.v1",
          JSON.stringify({
            completed: true,
            cloudConsent: false,
            openOnStartup: true,
          }),
        );
        const { history } = await import("/src/modules/chat-history.ts");
        await history.save({
          id: "long-reply",
          title: "Long reply",
          updated: Date.now(),
          messages: [
            {
              role: "assistant",
              content: "Long reply 很長的回覆\n".repeat(200),
              status: "complete",
            },
          ],
        });
      });
      await page.reload();
      await expect(page.getByRole("status")).toContainText("Long reply");
      const scroll = page.locator(".reply-scroll");
      expect(
        await scroll.evaluate((e) => e.scrollHeight > e.clientHeight),
      ).toBe(true);
      const bubble = (await page
        .getByLabel("DigiPet chat", { exact: true })
        .boundingBox())!;
      const pet = (await page.getByLabel(petLabel).boundingBox())!;
      const input = (await page
        .getByLabel("Message", { exact: true })
        .boundingBox())!;
      expect(bubble.y).toBeGreaterThanOrEqual(0);
      expect(bubble.y + bubble.height + 14).toBeLessThan(pet.y);
      expect(input.y + input.height).toBeLessThanOrEqual(
        bubble.y + bubble.height,
      );
      await expect(page.getByLabel("Message", { exact: true })).toBeFocused();
      await scroll.evaluate((e) => {
        e.scrollTop = e.scrollHeight;
      });
      await expect(page.getByLabel("Send message")).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test("hover wheel selects focused surfaces and dismisses on leave, Escape and outside click without blocking drag", async ({
  page,
}) => {
  await page.goto("/");
  const pet = page.getByLabel(petLabel);
  const wheel = page.getByRole("navigation", {
    name: "Pet action wheel / 寵物輪盤",
    exact: true,
  });
  await pet.hover();
  await expect(wheel).toBeVisible();
  await test.info().attach("m8-wheel", {
    path: await page
      .screenshot({
        path: test.info().outputPath("m8-wheel.png"),
        omitBackground: true,
      })
      .then(() => test.info().outputPath("m8-wheel.png")),
    contentType: "image/png",
  });
  await wheel.getByRole("button", { name: "Chat 聊天", exact: true }).click();
  await expect(wheel).toBeHidden();
  await expect(page.getByLabel("Message", { exact: true })).toBeFocused();
  await pet.hover();
  await wheel
    .getByRole("button", { name: "Appearance 外觀", exact: true })
    .click();
  await expect(page.getByLabel("Current appearance")).toBeVisible();
  await expect(page.getByLabel("API setup", { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel("Data and recovery", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("DigiPet chat", { exact: true })).toHaveCount(0);
  await pet.hover();
  await wheel
    .getByRole("button", { name: "Settings 設定", exact: true })
    .click();
  await expect(page.getByLabel("API setup", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Current appearance")).toHaveCount(0);
  await expect(
    page.getByLabel("Data and recovery", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Local tool access / 本機工具授權",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", {
      name: "Local tool access / 本機工具授權",
      exact: true,
    }),
  ).toContainText("They do not access the OS calendar");
  await expect(
    page.getByText("Tool permissions / 工具權限", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Data & recovery / 資料與復原", exact: true })
    .click();
  await expect(
    page.getByLabel("Data and recovery", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("API setup", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Close controls / 關閉管理面板", exact: true })
    .press("Escape");
  await pet.hover();
  await expect(wheel).toBeVisible();
  await page.mouse.move(390, 690);
  await expect(wheel).toBeHidden();
  await pet.hover();
  await pet.press("Escape");
  await expect(wheel).toBeHidden();
  await page.mouse.move(390, 690);
  await pet.hover();
  await page.mouse.click(220, 190);
  await expect(wheel).toBeHidden();
});
