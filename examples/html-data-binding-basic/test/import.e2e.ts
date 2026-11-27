import { expect, test, type Page } from "@playwright/test";
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
  // The imported Sheet is named after the file, without its extension.
  await expect(page.locator("#file-name")).toHaveText(name.replace(/\.xlsx$/, ""));
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

async function importFromSidebar(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  await page.locator("#import-file").setInputFiles(file);
}

for (const [extension, separator] of [
  ["csv", ","],
  ["tsv", "\t"],
] as const) {
  test(`imports ${extension.toUpperCase()} twice as independent Sheets`, async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#status")).toHaveText("All changes saved");
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const previous = page.url();
      await importFromSidebar(page, {
        name: `sales.${extension}`,
        mimeType: "text/plain",
        buffer: Buffer.from(`Region${separator}Sales\nEast${separator}42\n`),
      });
      await page.waitForURL((url) => url.href !== previous && url.searchParams.has("file"));
      await expect(page.locator("#file-name")).toHaveText("sales");
      await page.waitForFunction(() => !!(window as any).univerAPI);
      ids.push(new URL(page.url()).searchParams.get("file")!);
      expect(
        await page.evaluate(() =>
          (window as any).univerAPI
            .getActiveWorkbook()
            .getSheets()[0]
            .getRange("A1:B2")
            .getValues(),
        ),
      ).toEqual([
        ["Region", "Sales"],
        ["East", 42],
      ]);
    }
    expect(ids[0]).not.toBe(ids[1]);
  });
}

test("rejects invalid uploads without adding catalog entries", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("All changes saved");
  const before = await (await request.get("/api/files")).json();
  for (const [name, buffer, message] of [
    ["notes.txt", Buffer.from("text"), "Choose an XLS, XLSX, CSV, or TSV file."],
    ["empty.csv", Buffer.alloc(0), "The selected file is empty."],
    ["large.csv", Buffer.alloc(25 * 1024 * 1024 + 1, 65), "Choose a file smaller than 25 MiB."],
    ["broken.xlsx", Buffer.from("not an Office file"), /./],
  ] as const) {
    await importFromSidebar(page, { name, mimeType: "application/octet-stream", buffer });
    await expect(page.locator("#error")).toHaveText(message);
    await expect(page.locator("#import-sheet")).toBeEnabled();
  }
  expect(await (await request.get("/api/files")).json()).toEqual(before);
});

test("the File Endpoint rejects uploads over 25 MiB", async ({ request }) => {
  const size = 25 * 1024 * 1024 + 1;
  const response = await request.post(
    `/universer-api/stream/file/upload?size=${size}&source=1&flate=false`,
    {
      multipart: {
        file: { name: "large.csv", mimeType: "text/csv", buffer: Buffer.alloc(size, 65) },
      },
    },
  );
  expect(response.ok()).toBe(false);
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
