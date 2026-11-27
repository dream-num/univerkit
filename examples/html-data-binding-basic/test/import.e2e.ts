import { expect, test } from "@playwright/test";
import { ExchangeFormat, exportToBuffer } from "@univerjs-pro/exchange-node";
import { UniverInstanceType } from "@univerjs/core";
import { createSheetData } from "../server/templates.js";

test("imports XLSX from the sidebar, preserves sheets and formulas, and binds HTML", async ({
  page,
  request,
}) => {
  const data = createSheetData("original-id", "Imported budget");
  data.sheetOrder.push("notes");
  data.sheets.notes = {
    id: "notes",
    name: "Notes",
    rowCount: 10,
    columnCount: 5,
    cellData: { 0: { 0: { v: "Second sheet" } } },
  };
  const buffer = await exportToBuffer(data, {
    type: UniverInstanceType.UNIVER_SHEET,
    format: ExchangeFormat.XLSX,
  });
  const name = `预算 ${Date.now()}.xlsx`;
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("All changes saved");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import spreadsheet" }).click();
  await (await chooser).setFiles({ name, mimeType: "application/octet-stream", buffer });
  await expect(page.locator("#file-name")).toHaveText(name);
  await page.waitForFunction(() => !!(window as any).univerAPI);
  await expect(page.locator("#status")).toHaveText("All changes saved");
  const id = new URL(page.url()).searchParams.get("file")!;
  expect(id).not.toBe("original-id");
  const sheetId = await page.evaluate(() => {
    const workbook = (window as any).univerAPI.getActiveWorkbook();
    const sheets = workbook.getSheets();
    if (sheets.length !== 2 || sheets[1].getRange("A1").getValue() !== "Second sheet")
      throw new Error("Missing imported worksheets");
    if (sheets[0].getRange("B5").getFormula() !== "=B3-B4")
      throw new Error("Missing imported formula");
    return sheets[0].getSheetId() as string;
  });
  const htmlResponse = await request.post("/api/files", {
    data: {
      kind: "html",
      name: "Imported budget view",
      html: `<span id="balance" data-univer-cell-text="${id}:${encodeURIComponent(sheetId)}:B5"></span>`,
    },
  });
  expect(htmlResponse.status()).toBe(201);
  const html = await htmlResponse.json();
  const view = await page.context().newPage();
  await view.goto(`/?file=${html.id}`);
  await expect(view.frameLocator("iframe").locator("#balance")).toHaveText("40000");
  await page.evaluate(async () => {
    const api = (window as any).univerAPI;
    const workbook = api.getActiveWorkbook();
    workbook.getSheets()[0].getRange("B3").setValue(150000);
    await api.getCollaboration().flush(workbook.getId());
  });
  await expect(view.frameLocator("iframe").locator("#balance")).toHaveText("70000");
  await page.reload();
  await page.waitForFunction(() => !!(window as any).univerAPI);
  expect(
    await page.evaluate(() =>
      (window as any).univerAPI.getActiveWorkbook().getSheets()[0].getRange("B3").getValue(),
    ),
  ).toBe(150000);
  await view.close();
});

for (const [extension, separator] of [
  ["csv", ","],
  ["tsv", "\t"],
] as const) {
  test(`imports ${extension.toUpperCase()} twice as independent Sheets`, async ({
    page,
    request,
  }) => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const response = await request.post("/api/files/import", {
        multipart: {
          file: {
            name: `sales.${extension}`,
            mimeType: "text/plain",
            buffer: Buffer.from(`Region${separator}Sales\nEast${separator}42\n`),
          },
        },
      });
      expect(response.status(), await response.text()).toBe(201);
      ids.push((await response.json()).id);
    }
    expect(ids[0]).not.toBe(ids[1]);
    await page.goto(`/?file=${ids[0]}`);
    await page.waitForFunction(() => !!(window as any).univerAPI);
    expect(
      await page.evaluate(() =>
        (window as any).univerAPI.getActiveWorkbook().getSheets()[0].getRange("A1:B2").getValues(),
      ),
    ).toEqual([
      ["Region", "Sales"],
      ["East", 42],
    ]);
  });
}

test("rejects invalid uploads without adding catalog entries", async ({ request }) => {
  const before = await (await request.get("/api/files")).json();
  expect((await request.post("/api/files/import", { multipart: {} })).status()).toBe(400);
  for (const [name, buffer, status] of [
    ["notes.txt", Buffer.from("text"), 400],
    ["empty.csv", Buffer.alloc(0), 400],
    ["broken.xlsx", Buffer.from("not an Office file"), 422],
    ["large.csv", Buffer.alloc(25 * 1024 * 1024 + 1, 65), 413],
  ] as const) {
    const response = await request.post("/api/files/import", {
      multipart: {
        file: { name, mimeType: "application/octet-stream", buffer },
      },
    });
    expect(response.status(), await response.text()).toBe(status);
    expect((await response.json()).error).toBeTruthy();
  }
  expect(await (await request.get("/api/files")).json()).toEqual(before);
});

test("keeps unsaved HTML source when importing", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("All changes saved");
  await page.getByRole("button", { name: "HTML source", exact: true }).click();
  const source = await page.locator("#source").inputValue();
  await page.locator("#source").fill(source + "<!-- unsaved -->");
  const before = await (await request.get("/api/files")).json();
  await page
    .locator("#import-file")
    .setInputFiles({ name: "sales.csv", mimeType: "text/csv", buffer: Buffer.from("Sales\n42") });
  await expect(page.locator("#error")).toHaveText(
    "Save or discard the HTML source edits before importing.",
  );
  await expect(page.locator("#source")).toHaveValue(source + "<!-- unsaved -->");
  await expect(page.locator("#import-sheet")).toBeEnabled();
  expect(await (await request.get("/api/files")).json()).toEqual(before);
});
