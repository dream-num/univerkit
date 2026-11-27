import { expect, test } from "@playwright/test";

test("HTML insertion validates rowCount and persists multi-row values through collaboration", async ({
  browser,
  request,
}) => {
  const created = await request.post("/api/files", {
    data: { kind: "sheet", name: `Insert ${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const { id } = await created.json();
  const viewResponse = await request.post("/api/files", {
    data: { kind: "html", name: "Insert rows", html: `<p id="ready">ready</p>` },
  });
  expect(viewResponse.ok()).toBeTruthy();
  const view = await viewResponse.json();
  const editor = await browser.newPage();
  const html = await browser.newPage();
  try {
    await editor.goto(`/?file=${id}`);
    await editor.waitForFunction(() => !!(window as any).univerAPI);
    const originalRows = await editor.evaluate(async (id) => {
      const api = (window as any).univerAPI;
      const sheet = api.getWorkbook(id).getSheetBySheetId("sheet-1");
      sheet.getRange("A1").setValue("original");
      await api.getCollaboration().flush(id);
      return sheet.getMaxRows();
    }, id);
    await html.goto(`/?file=${view.id}`);
    await expect(html.frameLocator("iframe").locator("#ready")).toHaveText("ready");
    const frame = html.frames().find((frame) => frame.parentFrame())!;
    const rejected = await frame.evaluate(async (id) => {
      const api = (window as any).univerBinding;
      try {
        await api.insertRowsWithValues({
          unitId: id,
          sheetId: "sheet-1",
          startRow: 0,
          startColumn: 1,
          rowCount: 1,
          values: [["Alice"], ["Bob"]],
        });
        return "unexpected success";
      } catch (error) {
        return String(error);
      }
    }, id);
    expect(rejected).toContain("values.length must not exceed rowCount");
    const state = () =>
      editor.evaluate((id) => {
        const sheet = (window as any).univerAPI.getWorkbook(id).getSheetBySheetId("sheet-1");
        return { rows: sheet.getMaxRows(), values: sheet.getRange("A1:E4").getValues() };
      }, id);
    expect((await state()).rows).toBe(originalRows);
    await frame.evaluate(async (id) => {
      const api = (window as any).univerBinding;
      await api.insertRowsWithValues({
        unitId: id,
        sheetId: "sheet-1",
        startRow: 0,
        startColumn: 1,
        rowCount: 3,
        values: [
          ["Alice", 0, false, "=literal"],
          ["Bob", 42, true, null],
        ],
      });
      await api.flush();
    }, id);
    await expect.poll(async () => (await state()).rows).toBe(originalRows + 3);
    const inserted = (await state()).values;
    // The SDK stores booleans as 0/1; the binding API normalizes them on reads.
    expect(inserted[0].slice(1)).toEqual(["Alice", 0, 0, "=literal"]);
    expect(inserted[1].slice(1)).toEqual(["Bob", 42, 1, null]);
    expect(
      await frame.evaluate(async (id) => {
        return (window as any).univerBinding.getRangeState({
          unitId: id,
          sheetId: "sheet-1",
          range: { startRow: 0, endRow: 1, startColumn: 1, endColumn: 4 },
        });
      }, id),
    ).toEqual({
      value: [
        ["Alice", 0, false, "=literal"],
        ["Bob", 42, true, null],
      ],
    });
    expect(inserted[2]).toEqual([null, null, null, null, null]);
    expect(inserted[3][0]).toBe("original");
    await editor.reload();
    await editor.waitForFunction(() => !!(window as any).univerAPI);
    await expect.poll(state).toEqual({ rows: originalRows + 3, values: inserted });
  } finally {
    await Promise.all([editor.close(), html.close()]);
  }
});
