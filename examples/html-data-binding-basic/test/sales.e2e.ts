import { expect, test } from "@playwright/test";

test("regional sales: Sheet formulas drive selection, extraction, metrics and ECharts", async ({
  browser,
}, testInfo) => {
  const unitId = "demo-sales";
  const viewId = "demo-sales-view";
  const editor = await browser.newPage();
  const html = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const errors: string[] = [];
  for (const page of [editor, html]) page.on("pageerror", (error) => errors.push(error.message));
  await editor.goto(`/?file=${unitId}`);
  await editor.waitForFunction(() => !!(window as any).univerAPI);
  await editor.evaluate(async (unitId) => {
    const api = (window as any).univerAPI;
    const workbook = api.getWorkbook(unitId);
    workbook.getSheetBySheetId("dashboard").getRange("B2").setValue("华东");
    workbook.getSheetBySheetId("sales").getRange("C8").setValue(152000);
    await api.getCollaboration().flush(unitId);
  }, unitId);
  await html.goto(`/?file=${viewId}`);
  const page = html.frameLocator("iframe");
  await expect(page.locator("#region")).toHaveValue("华东", { timeout: 30_000 });
  await expect(page.locator("#revenue")).toHaveText("¥1,504,000", { timeout: 30_000 });
  await expect(page.locator("#profit")).toHaveText("¥633,000");
  await expect(page.locator("#trend-chart svg")).toBeVisible();
  await expect(page.locator("#region-chart svg")).toBeVisible();
  await expect(page.locator("#detail-rows tr").first()).toContainText("华东");
  await expect(page.locator("#detail-rows tr").first()).toContainText("¥186,000");
  const frame = html.frames().find((frame) => frame.parentFrame())!;
  const chartData = (id: string) =>
    frame.evaluate((id) => {
      const chart = (window as any).echarts.getInstanceByDom(document.getElementById(id));
      return chart.getOption().dataset[0].source;
    }, id);
  await expect.poll(async () => (await chartData("trend-chart"))[1][1]).toBe(186000);
  await page.locator("#region").selectOption("华南");
  await expect(page.locator("#revenue")).toHaveText("¥1,304,000");
  await expect(page.locator("#profit")).toHaveText("¥539,000");
  await expect(page.locator("#attainment")).toHaveText("102.7%");
  await expect(page.locator("#orders")).toHaveText("602");
  await expect(page.locator("#detail-rows tr")).toHaveCount(6);
  for (const row of await page.locator("#detail-rows tr").all())
    await expect(row.locator("td").nth(1)).toHaveText("华南");
  await expect
    .poll(() =>
      editor.evaluate((unitId) => {
        const sheet = (window as any).univerAPI.getWorkbook(unitId).getSheetBySheetId("dashboard");
        return [
          sheet.getRange("B2").getValue(),
          sheet.getRange("B5").getRawValue(),
          sheet.getRange("A26").getCellData()?.f,
        ];
      }, unitId),
    )
    .toEqual([
      "华南",
      1304000,
      "=IFERROR(INDEX(FILTER('销售明细'!$A$2:$G$25,'销售明细'!$B$2:$B$25=$B$2),1,1),\"\")",
    ]);
  await expect.poll(async () => (await chartData("trend-chart"))[1][1]).toBe(152000);
  await editor.evaluate(async (unitId) => {
    const api = (window as any).univerAPI;
    api.getWorkbook(unitId).getSheetBySheetId("sales").getRange("C8").setValue(162000);
    await api.getCollaboration().flush(unitId);
  }, unitId);
  await expect(page.locator("#revenue")).toHaveText("¥1,314,000");
  await expect(page.locator("#profit")).toHaveText("¥549,000");
  await expect(page.locator("#detail-rows tr").first()).toContainText("¥162,000");
  await expect.poll(async () => (await chartData("trend-chart"))[1][1]).toBe(162000);
  await expect.poll(async () => (await chartData("region-chart"))[2][1]).toBe(1314000);
  await html.screenshot({ path: testInfo.outputPath("sales-desktop.png"), fullPage: true });
  await html.locator("iframe").evaluate((iframe) => {
    iframe.style.width = "390px";
  });
  await expect
    .poll(() => frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await expect(page.locator("#trend-chart svg")).toBeVisible();
  await html.screenshot({ path: testInfo.outputPath("sales-mobile.png"), fullPage: true });
  // Direct Sheet edits also control the input. Unknown regions have a zero total and no matches.
  await editor.evaluate(
    (unitId) =>
      (window as any).univerAPI
        .getWorkbook(unitId)
        .getSheetBySheetId("dashboard")
        .getRange("B2")
        .setValue("无此区域"),
    unitId,
  );
  await expect(page.locator("#revenue")).toHaveText("¥0");
  await expect(page.locator("#attainment")).toHaveText("0%");
  await expect(page.locator("#detail-rows")).not.toContainText("华南");
  await editor.evaluate(async (unitId) => {
    const api = (window as any).univerAPI;
    const workbook = api.getWorkbook(unitId);
    workbook.getSheetBySheetId("dashboard").getRange("B2").setValue("华东");
    workbook.getSheetBySheetId("sales").getRange("C8").setValue(152000);
    await api.getCollaboration().flush(unitId);
  }, unitId);
  await expect(page.locator("#region")).toHaveValue("华东");
  await expect(page.locator("#revenue")).toHaveText("¥1,504,000");
  await expect(page.locator("#message")).toBeEmpty();
  await html.reload();
  await expect(page.locator("#region")).toHaveValue("华东");
  await page.locator("#region").selectOption("华南");
  await expect(page.locator("#revenue")).toHaveText("¥1,304,000");
  await expect(page.locator("#detail-rows tr").first()).toContainText("华南");
  expect(errors).toEqual([]);
  await html.close();
  await editor.close();
});
