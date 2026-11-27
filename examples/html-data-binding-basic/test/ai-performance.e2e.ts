import { expect, test } from "@playwright/test";

test("a long token burst has bounded layouts and preserves full output", async ({
  page,
}, testInfo) => {
  const count = 5_000;
  const reasoning = "分析当前数据并准备页面。";
  const text = "<p>0123456789</p>";
  const html = `<!doctype html><html><body>${text.repeat(count)}</body></html>`;
  const events = [
    { type: "reset" },
    ...Array.from({ length: count }, () => ({ type: "reasoning", text: reasoning })),
    ...Array.from({ length: count }, () => ({ type: "text", text })),
    { type: "result", html },
  ];
  await page.route("**/api/ai/html", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body: events.map((event) => JSON.stringify(event) + "\n").join(""),
    }),
  );
  await page.goto("/?file=demo-budget");
  await page.locator("#generate-html").click();
  await page.locator('#ai-form [name="prompt"]').fill("Performance fixture");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const metrics = async () =>
    Object.fromEntries(
      (await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]),
    );
  const before = await metrics();
  await page.locator('#ai-form [type="submit"]').click();
  await expect(page.locator("#ai-preview")).toBeVisible();
  const after = await metrics();
  const layouts = after.LayoutCount! - before.LayoutCount!;
  await testInfo.attach("render-metrics", {
    body: JSON.stringify({
      layouts,
      layoutMs: (after.LayoutDuration! - before.LayoutDuration!) * 1000,
    }),
    contentType: "application/json",
  });
  // The previous renderer performed approximately 15,000 layouts for this burst.
  expect(layouts).toBeLessThan(200);
  await expect(page.locator("#ai-output")).toHaveValue(html);
  await expect(page.locator(".ai-thought-content")).toHaveText(reasoning.repeat(count));
  await expect(page.locator("#ai-progress")).toHaveAttribute("data-running", "false");
});
