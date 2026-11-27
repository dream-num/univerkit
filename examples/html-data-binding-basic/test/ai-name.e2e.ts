import { expect, test } from "@playwright/test";

test("automatic names follow regenerated titles and reset when reopening", async ({ page }) => {
  let title = "报名 &amp; 签到";
  await page.route("**/api/ai/html", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "result",
          html: `<!doctype html><html><head><title>${title}</title></head><body></body></html>`,
        }) + "\n",
    }),
  );
  await page.goto("/?file=demo-budget");
  await page.locator("#generate-html").click();
  const name = page.locator('#ai-form [name="name"]');
  const generate = async (expected: string) => {
    await page.locator('#ai-form [name="prompt"]').fill("Build a dashboard");
    await page.locator('#ai-form [type="submit"]').click();
    await expect(page.locator("#ai-preview")).toBeVisible();
    await expect(name).toHaveValue(expected);
  };
  await generate("报名 & 签到");
  title = "到场统计";
  await generate("到场统计");
  await name.fill("我的页面");
  title = "场次安排";
  await generate("我的页面");
  await name.fill("");
  await generate("场次安排");
  await name.fill("上次手动名称");
  await page.locator("#ai-cancel").click();
  await page.locator("#generate-html").click();
  await expect(name).toBeEmpty();
  title = " ";
  await generate("AI generated view");
});
