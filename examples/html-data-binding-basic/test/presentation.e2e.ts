import { expect, test } from "@playwright/test";
import { AI_DRAFT_KEY } from "../shared/ai.js";

test("immersive HTML keeps its live view and shares a persistent direct link", async ({
  browser,
  request,
}, testInfo) => {
  const created = await request.post("/api/files", {
    data: { kind: "sheet", name: `Presentation ${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const sheet = await created.json();
  const response = await request.post("/api/files", {
    data: { kind: "html", name: "Presentation", sourceUnitId: sheet.id },
  });
  expect(response.ok()).toBeTruthy();
  const view = await response.json();
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const shared = await context.newPage();
  try {
    await page.goto(`/?file=${view.id}`);
    const content = page.frameLocator("iframe");
    await expect(content.locator("#income")).toHaveValue("120000", { timeout: 30_000 });
    const frame = page.frames().find((frame) => frame.parentFrame())!;
    await frame.evaluate(() => {
      (window as any).presentationMarker = "preserved";
    });
    await content.locator("#income").fill("145000");
    await page.getByRole("button", { name: "Immersive view", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`file=${view.id}&view=immersive$`));
    await expect(page.locator("#app > aside")).toBeHidden();
    await expect(page.locator("#app > main > header")).toBeHidden();
    await expect(page.locator("#html-toolbar")).toBeHidden();
    await expect(content.locator("#income")).toHaveValue("145000");
    expect(await frame.evaluate(() => (window as any).presentationMarker)).toBe("preserved");
    await expect
      .poll(() =>
        page.locator("iframe").evaluate((iframe) => {
          const rect = iframe.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
          };
        }),
      )
      .toMatchObject({
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        viewportWidth: 1280,
        viewportHeight: 720,
      });
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const link = await page.getByLabel("Link to immersive view").inputValue();
    expect(link).toBe(page.url());
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(page.locator("#share-status")).toHaveText("Link copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await shared.goto(link);
    await expect(shared.locator("#exit-immersive")).toBeVisible();
    await expect(shared.locator("#files")).toBeHidden();
    await expect(shared.frameLocator("iframe").locator("#income")).toHaveValue("145000", {
      timeout: 30_000,
    });
    await shared.reload();
    await expect(shared.locator("#exit-immersive")).toBeVisible();
    await expect(shared.frameLocator("iframe").locator("#income")).toHaveValue("145000", {
      timeout: 30_000,
    });
    await shared.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        shared.locator("iframe").evaluate((iframe) => iframe.getBoundingClientRect().width),
      )
      .toBe(390);
    await expect(shared.locator("#exit-immersive")).toBeInViewport();
    await shared.screenshot({ path: testInfo.outputPath("immersive-mobile.png") });
    await page.getByRole("button", { name: "Exit immersive view", exact: true }).click();
    await expect(page.locator("#files")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`file=${view.id}$`));
    expect(await frame.evaluate(() => (window as any).presentationMarker)).toBe("preserved");
    await page.getByRole("button", { name: "HTML source", exact: true }).click();
    const source = await page.locator("#source").inputValue();
    await page.locator("#source").fill(source + "\n<!-- unsaved -->");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("button", { name: "Share", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "HTML source", exact: true }).click();
    await page.getByRole("button", { name: "Discard edits", exact: true }).click();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("button", { name: "Share", exact: true })).toBeEnabled();
    // Restricted clipboard access still leaves a selectable link.
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("denied");
          },
        },
      }),
    );
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(page.locator("#share-status")).toHaveText("Select and copy the link above.");
    await expect(page.getByLabel("Link to immersive view")).toHaveValue(link);
  } finally {
    await context.close();
  }
});

test("drafts can use immersive view but cannot be shared, and invalid links show an error", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key }) =>
      sessionStorage.setItem(
        key,
        JSON.stringify({
          id: "presentation-draft",
          name: "Draft",
          html: "<!doctype html><html><body><h1>Draft preview</h1></body></html>",
        }),
      ),
    { key: AI_DRAFT_KEY },
  );
  await page.goto("/?draft=presentation-draft&view=immersive");
  await expect(page.frameLocator("iframe").locator("h1")).toHaveText("Draft preview");
  await expect(page.locator("#share-immersive")).toBeDisabled();
  await page.locator("#exit-immersive").click();
  await expect(page.locator("#save-draft")).toBeVisible();
  await expect(page.locator("#share-html")).toBeDisabled();
  await page.goto("/?file=missing-presentation-file&view=immersive");
  await expect(page.locator("#error")).toHaveText("File not found.");
  await expect(page.locator("iframe")).toHaveCount(0);
});
