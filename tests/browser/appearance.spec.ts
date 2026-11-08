import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("digipet.api.v1", JSON.stringify({ completed: true, cloudConsent: false }));
  });
});
const fixture = "tests/fixtures/two-cells.png";
const config = {
  version: 1,
  columns: 2,
  rows: 1,
  fps: 10,
  states: { idle: [0], happy: [1, 0] },
};
const pet = (page: Page) =>
  page.getByRole("button", { name: "DigiPet: click to chat, drag to move" });
async function manager(page: Page) {
  await pet(page).press("Enter");
  await page.getByText("Appearance / 外觀", { exact: true }).click();
}
async function pixels(page: Page) {
  return page.locator(".pet canvas").evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext("2d")!.getImageData(0, 0, 128, 128).data;
    let total = 0,
      red = 0,
      blue = 0;
    for (let i = 0; i < data.length; i += 4) {
      total += data[i + 3];
      red += data[i] * data[i + 3];
      blue += data[i + 2] * data[i + 3];
    }
    return { total, red, blue };
  });
}
test("single PNG crop, procedural movement, persistence, switch and delete", async ({
  page,
}) => {
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  await page.goto("/");
  await manager(page);
  await page.getByLabel("Import PNG", { exact: true }).setInputFiles(fixture);
  await page.getByLabel("Crop width", { exact: true }).fill("4");
  await expect(
    page.getByText("Save appearance / 儲存外觀", { exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Crop x", { exact: true }).fill("1000");
  await expect(
    page.getByText("Save appearance / 儲存外觀", { exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Crop x", { exact: true }).fill("0");
  await page.getByLabel("Crop width", { exact: true }).fill("32");
  await page.getByLabel("Appearance name").fill("Cropped red pet");
  await expect(page.locator(".preview canvas")).toBeVisible();
  await page.getByText("Save appearance / 儲存外觀", { exact: true }).click();
  await expect(page.getByLabel("Current appearance")).toHaveValue(
    /^[a-f0-9-]{36}$/,
  );
  await expect
    .poll(async () => {
      const p = await pixels(page);
      return p.red > p.blue;
    })
    .toBe(true);
  await page.getByLabel("Animation state").selectOption("happy");
  const first = await page
    .locator(".pet canvas")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await expect
    .poll(() =>
      page
        .locator(".pet canvas")
        .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
    )
    .not.toBe(first);
  const id = await page.getByLabel("Current appearance").inputValue();
  await page.reload();
  await manager(page);
  await expect(page.getByLabel("Current appearance")).toHaveValue(id);
  await expect
    .poll(async () => {
      const p = await pixels(page);
      return p.red > p.blue;
    })
    .toBe(true);
  await page.getByText("Restore default / 還原", { exact: true }).click();
  await expect(page.getByLabel("Current appearance")).toHaveValue("default");
  await page.getByLabel("Current appearance").selectOption(id);
  await page.getByText("Delete / 刪除", { exact: true }).click();
  await expect(
    page.getByLabel("Current appearance").locator("option"),
  ).toHaveCount(1);
  await page.reload();
  await manager(page);
  await expect(
    page.getByLabel("Current appearance").locator("option"),
  ).toHaveCount(1);
  expect(crashes).toEqual([]);
});
test("sheet frame order, FPS, idle fallback, swapping and hostile config rejection", async ({
  page,
}) => {
  await page.goto("/");
  await manager(page);
  await page.getByLabel("Import PNG", { exact: true }).setInputFiles(fixture);
  await page.getByLabel("Import type").selectOption("sheet");
  await page
    .getByLabel("Sheet configuration")
    .fill(JSON.stringify({ ...config, script: 'fetch("file:///etc/passwd")' }));
  await expect(
    page.getByText("Save appearance / 儲存外觀", { exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Import sheet JSON", { exact: true }).setInputFiles({
    name: "pack.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await page.getByText("Save appearance / 儲存外觀", { exact: true }).click();
  await expect
    .poll(async () => {
      const p = await pixels(page);
      return p.red > p.blue;
    })
    .toBe(true);
  await page.getByLabel("Animation state").selectOption("sleep"); // missing → idle [0]
  await expect
    .poll(async () => {
      const p = await pixels(page);
      return p.red > p.blue;
    })
    .toBe(true);
  await page.getByLabel("Animation state").selectOption("happy");
  await expect
    .poll(
      async () => {
        const p = await pixels(page);
        return p.blue > p.red;
      },
      { intervals: [30, 30, 30] },
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        const p = await pixels(page);
        return p.red > p.blue;
      },
      { intervals: [30, 30, 30] },
    )
    .toBe(true);
  await page.getByLabel("Animation state").selectOption("sad");
  await expect
    .poll(async () => {
      const p = await pixels(page);
      return p.red > p.blue;
    })
    .toBe(true);
  await page.reload();
  await manager(page);
  await expect(page.getByLabel("Current appearance")).not.toHaveValue(
    "default",
  );
  await page.getByLabel("Import PNG", { exact: true }).setInputFiles({
    name: "evil.png",
    mimeType: "image/png",
    buffer: Buffer.from('<svg onload="alert(1)"/>'),
  });
  await expect(page.getByLabel("Current appearance")).toHaveValue("default");
  await expect(page.getByRole("alert").first()).toContainText("PNG");
  await page.getByLabel("Current appearance").press("Escape");
  await expect(page.getByLabel("Import PNG", { exact: true })).toHaveCount(0);
});

test("a corrupt saved PNG restores the visible default and preserves original bytes for explicit repair", async ({
  page,
}) => {
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  const source = readFileSync(fixture);
  const start = source.indexOf(Buffer.from("IDAT")) - 4;
  // Keep valid IHDR/IEND chunks but remove all compressed bitmap data.
  const corrupted = Buffer.concat([
    source.subarray(0, start),
    source.subarray(start + source.readUInt32BE(start) + 12),
  ]);
  await page.goto("/");
  await page.evaluate(
    (png) =>
      localStorage.setItem(
        "digipet.appearances.v1",
        JSON.stringify({
          appearances: [{ id: "broken", name: "Broken", png }],
          selected: "broken",
        }),
      ),
    "data:image/png;base64," + corrupted.toString("base64"),
  );
  await page.reload();
  await manager(page);
  await expect(page.getByLabel("Current appearance")).toHaveValue("default");
  await expect.poll(async () => (await pixels(page)).total).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("digipet.appearances.v1")!).selected,
      ),
    )
    .toBe("broken");
  expect(crashes).toEqual([]);
});
