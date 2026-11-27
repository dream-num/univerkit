import { expect, test } from "@playwright/test";
import type { BindingEngineClient } from "@univerkit/html-view-renderer";

test("ById with existing text/model attributes: insertion, retargeting and writes", async ({
  page,
  request,
}) => {
  const sheet = await (
    await request.post("/api/files", { data: { kind: "sheet", name: `Bindings ${Date.now()}` } })
  ).json();
  const ref = `${encodeURIComponent(sheet.id)}:sheet-1`;
  const html = `<div id="text" data-univer-cell-text="${ref}:B3"></div>
    <input id="input" type="number" data-univer-cell-model="${ref}:B3">
    <div id="cell" data-univer-cell-subscribe="${ref}:B3"></div>
    <pre id="rows" data-univer-range-subscribe="${ref}:B3:B4"></pre>
    <p id="failure"></p><script>
    const b = window.univerBinding;
    const show = error => document.getElementById('failure').textContent = error.message;
    b.subscribeCellById('cell', ({value}) => document.getElementById('cell').textContent = value).catch(show);
    b.subscribeRangeById('rows', ({value}) => document.getElementById('rows').textContent = JSON.stringify(value)).catch(show);
    </script>`;
  const response = await request.post("/api/files", {
    data: { kind: "html", name: "ById", html },
  });
  expect(response.ok()).toBeTruthy();
  const file = await response.json();
  await page.goto(`/?file=${file.id}`);
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("#text")).toHaveText("120000");
  await expect(frame.locator("#cell")).toHaveText("120000");
  await expect(frame.locator("#rows")).toHaveText("[[120000],[80000]]");
  const child = page.frames().find((frame) => frame.parentFrame())!;
  const api = await child.evaluate(async (unitId) => {
    const client = (window as unknown as { univerBinding: BindingEngineClient }).univerBinding;
    return {
      methods: Object.keys(client),
      cell: await client.getCellState({ unitId, sheetId: "sheet-1", row: 2, col: 1 }),
      range: await client.getRangeState({
        unitId,
        sheetId: "sheet-1",
        range: { startRow: 2, endRow: 3, startColumn: 1, endColumn: 1 },
      }),
    };
  }, sheet.id);
  expect(api.methods).not.toContain("subscribeCell");
  expect(api.methods).not.toContain("subscribeRange");
  expect(api.cell).toMatchObject({ value: 120000 });
  expect(api.range).toMatchObject({ value: [[120000], [80000]] });
  await frame.locator("#input").fill("150000");
  await frame.locator("#text").click();
  await expect(frame.locator("#cell")).toHaveText("150000");
  await child.evaluate(async (ref) => {
    const b = (window as any).univerBinding;
    const el = document.getElementById("cell")!;
    el.setAttribute("data-univer-cell-subscribe", `${ref}:B4`);
    const dynamic = document.createElement("div");
    dynamic.id = "dynamic:cell";
    dynamic.setAttribute("data-univer-cell-subscribe", `${ref}:B5`);
    document.body.append(dynamic);
    await b.subscribeCellById(dynamic.id, ({ value }: any) => {
      dynamic.textContent = String(value);
    });
    await b.flush();
  }, ref);
  await expect(frame.locator("#cell")).toHaveText("80000");
  await expect(frame.locator('[id="dynamic:cell"]')).toHaveText("70000");
  await expect(frame.locator("#failure")).toBeEmpty();
  await page.reload();
  await expect(frame.locator("#text")).toHaveText("150000");
  await expect(frame.locator("#rows")).toHaveText("[[150000],[80000]]");
});
