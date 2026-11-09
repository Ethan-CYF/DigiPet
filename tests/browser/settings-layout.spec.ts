import { test, expect } from "@playwright/test";

const panelLabel = "DigiPet controls / 管理面板";
const petLabel = "DigiPet: click to chat, drag to move";
for (const deviceScaleFactor of [1, 1.5, 2]) {
  test(`secondary surface grows with content, keeps controls readable and leaves the pet clear at ${deviceScaleFactor}x DPI`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1200 },
      deviceScaleFactor,
    });
    const page = await context.newPage();
    try {
      await page.addInitScript(() =>
        localStorage.setItem(
          "digipet.api.v1",
          JSON.stringify({ completed: true, cloudConsent: false }),
        ),
      );
      await page.goto("/");
      await page.getByLabel("Open controls / 開啟管理面板").click();
      const panel = page.getByLabel(panelLabel, { exact: true });
      const nav = panel.getByRole("navigation", {
        name: "Settings sections / 設定分類",
        exact: true,
      });
      await expect(panel).toBeVisible();
      expect((await panel.boundingBox())!.width).toBeGreaterThan(900);
      expect(
        (await page.getByLabel("API base URL").boundingBox())!.width,
      ).toBeGreaterThan(500);
      await expect(page.getByLabel("API base URL")).toHaveCSS(
        "font-size",
        "14px",
      );
      await expect(page.getByLabel("API base URL")).toBeFocused();
      await expect(
        panel.getByRole("region", { name: "Preferences / 偏好", exact: true }),
      ).toHaveCount(1);
      await nav
        .getByRole("button", { name: "Appearance / 外觀", exact: true })
        .click();
      const before = (await panel.boundingBox())!;
      await page
        .getByLabel("Import PNG", { exact: true })
        .setInputFiles("tests/fixtures/two-cells.png");
      await expect(page.getByLabel("Appearance name")).toBeVisible();
      await expect
        .poll(async () => (await panel.boundingBox())!.height)
        .toBeGreaterThan(before.height + 40);
      const after = (await panel.boundingBox())!;
      expect(after.y).toBeGreaterThanOrEqual(0);
      expect(after.y + after.height).toBeLessThanOrEqual(1200 - 216);
      expect(
        (await page.getByLabel("Crop width").boundingBox())!.width,
      ).toBeGreaterThan(220);
      await expect
        .poll(async () => {
          const stage = (await page.locator(".stage").boundingBox())!;
          const box = (await panel.boundingBox())!;
          return Math.abs(stage.height - box.height - 224) < 2;
        })
        .toBe(true);
      const pet = (await page.getByLabel(petLabel).boundingBox())!;
      expect(after.y + after.height).toBeLessThan(pet.y);
      expect(pet.y + pet.height).toBeLessThanOrEqual(1200);
      const scroll = panel.locator(".secondary-body");
      expect(
        await scroll.evaluate((e) => e.scrollHeight > e.clientHeight),
      ).toBe(true);
      await page
        .getByText("Save appearance / 儲存外觀", { exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        page.getByText("Save appearance / 儲存外觀", { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByRole("button", {
          name: "Close controls / 關閉管理面板",
          exact: true,
        }),
      ).toBeVisible();
      // Collapsing to a short page shrinks the window instead of retaining a large blank frame.
      await nav
        .getByRole("button", { name: "Updates / 更新", exact: true })
        .click();
      await expect
        .poll(async () => (await panel.boundingBox())!.height)
        .toBeLessThan(after.height - 40);
      await panel
        .getByRole("button", { name: "Chat / 聊天", exact: true })
        .click();
      const bubble = page.getByLabel("DigiPet chat", { exact: true });
      await expect(bubble).toHaveCSS("width", "304px");
      await expect(
        bubble.locator(
          "select, input[type=file], .secondary-nav, .settings-card",
        ),
      ).toHaveCount(0);
      await expect(page.getByLabel("Message", { exact: true })).toBeFocused();
    } finally {
      await context.close();
    }
  });
}

test("desktop settings have clear categories, a single content scroller and screenshot evidence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.addInitScript(() =>
    localStorage.setItem(
      "digipet.api.v1",
      JSON.stringify({ completed: true, cloudConsent: false }),
    ),
  );
  await page.goto("/");
  await page.getByLabel("Open controls / 開啟管理面板").click();
  const panel = page.getByLabel(panelLabel, { exact: true });
  const nav = panel.getByRole("navigation", {
    name: "Settings sections / 設定分類",
    exact: true,
  });
  await expect(nav.getByRole("button")).toHaveCount(7);
  for (const label of [
    "Providers / 供應商",
    "Local tool access / 本機工具授權",
    "Tools & state / 工具與狀態",
    "Appearance / 外觀",
    "Conversations / 對話",
    "Data & recovery / 資料與復原",
    "Updates / 更新",
  ]) {
    await nav.getByRole("button", { name: label, exact: true }).click();
    await expect(panel.getByRole("heading", { level: 1 })).toHaveText(label);
    await expect(
      nav.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    expect(await panel.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
  }
  for (const [label, name] of [
    ["Providers / 供應商", "providers"],
    ["Appearance / 外觀", "appearance"],
    ["Local tool access / 本機工具授權", "local-access"],
  ]) {
    await nav.getByRole("button", { name: label, exact: true }).click();
    const path = test.info().outputPath(`m8-settings-${name}.png`);
    await page.screenshot({ path, omitBackground: true });
    await test
      .info()
      .attach(`m8-settings-${name}`, { path, contentType: "image/png" });
  }
});

test("smaller viewports wrap content without squeezing controls or hiding navigation/close", async ({
  page,
}) => {
  await page.setViewportSize({ width: 540, height: 760 });
  await page.addInitScript(() =>
    localStorage.setItem(
      "digipet.api.v1",
      JSON.stringify({ completed: true, cloudConsent: false }),
    ),
  );
  await page.goto("/");
  await page.getByLabel("Open controls / 開啟管理面板").click();
  const panel = page.getByLabel(panelLabel, { exact: true });
  const box = (await panel.boundingBox())!;
  expect(box.width).toBeGreaterThan(500);
  expect(box.x + box.width).toBeLessThanOrEqual(540);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(760 - 216);
  await expect(page.getByLabel("API base URL")).toHaveCSS("font-size", "14px");
  expect(
    (await page.getByLabel("API base URL").boundingBox())!.width,
  ).toBeGreaterThan(350);
  await page
    .getByRole("button", { name: "Data & recovery / 資料與復原", exact: true })
    .click();
  await expect(
    page.getByLabel("Data and recovery", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Close controls / 關閉管理面板", exact: true })
    .press("Escape");
  await expect(panel).toBeHidden();
  await expect(page.getByLabel(petLabel)).toBeFocused();
});

test("short desktop work areas keep every category reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 620 });
  await page.addInitScript(() =>
    localStorage.setItem(
      "digipet.api.v1",
      JSON.stringify({ completed: true, cloudConsent: false }),
    ),
  );
  await page.goto("/");
  await page.getByLabel("Open controls / 開啟管理面板").click();
  const panel = page.getByLabel(panelLabel, { exact: true });
  const nav = panel.getByRole("navigation", {
    name: "Settings sections / 設定分類",
    exact: true,
  });
  await expect
    .poll(async () => nav.evaluate((e) => e.scrollHeight > e.clientHeight))
    .toBe(true);
  await nav
    .getByRole("button", { name: "Updates / 更新", exact: true })
    .click();
  await expect(panel.getByRole("heading", { level: 1 })).toHaveText(
    "Updates / 更新",
  );
  await nav
    .getByRole("button", { name: "Providers / 供應商", exact: true })
    .click();
  await expect(page.getByLabel("API base URL")).toBeFocused();
  expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  expect(
    (await page.getByLabel(petLabel).boundingBox())!.y + 128,
  ).toBeLessThanOrEqual(620);
});
