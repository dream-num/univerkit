import { expect, test } from "@playwright/test";

test("file list, two-page collaboration, live chart and HTML source persistence", async ({
  browser,
  request,
}) => {
  const name = `Budget ${Date.now()}`;
  const created = await request.post("/api/files", { data: { kind: "sheet", name } });
  expect(created.ok()).toBeTruthy();
  const sheet = await created.json();
  const viewResponse = await request.post("/api/files", {
    data: { kind: "html", name: `${name}.univer.html`, sourceUnitId: sheet.id },
  });
  expect(viewResponse.ok()).toBeTruthy();
  const view = await viewResponse.json();
  const editor = await browser.newPage();
  const html = await browser.newPage();
  const errors: string[] = [];
  const dialogs: string[] = [];
  for (const tab of [editor, html]) {
    tab.on("dialog", async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.accept();
    });
  }
  editor.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  html.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await editor.goto(`/?file=${sheet.id}`);
  await html.goto(`/?file=${view.id}`);
  await expect(html.locator(`#files [data-file-id="${sheet.id}"]`)).toBeVisible();
  await expect(html.locator(`#files [data-file-id="${sheet.id}"] .file-name`)).toBeInViewport();
  const page = html.frameLocator("iframe");
  await expect(page.locator("#income")).toHaveValue("120000", { timeout: 30_000 });
  await expect(editor.locator(".sheet-editor canvas").first()).toBeVisible({ timeout: 30_000 });
  await editor.waitForFunction(() => !!(window as any).univerAPI);
  await expect(editor.locator("#status")).toHaveText("All changes saved");
  await expect(html.locator("#status")).toHaveText("All changes saved");
  // Shell styling must not alter the SDK's toolbars and sidebars.
  await expect(editor.getByRole("button", { name: "Bold", exact: true })).toBeVisible();
  expect(
    await editor
      .locator(".sheet-editor aside")
      .first()
      .evaluate((aside) => getComputedStyle(aside).padding),
  ).toBe("0px");
  await page.locator("#income").fill("150000");
  await page.locator("#expenses").focus();
  await expect
    .poll(() =>
      editor.evaluate(
        (id) =>
          (window as any).univerAPI
            .getWorkbook(id)
            .getSheetBySheetId("sheet-1")
            .getRange("B3")
            .getValue(),
        sheet.id,
      ),
    )
    .toBe(150000);
  await expect(page.locator('[data-univer-cell-text$=":B5"]')).toHaveText("70000", {
    timeout: 30_000,
  });
  await editor.evaluate(async (id) => {
    const api = (window as any).univerAPI;
    api.getWorkbook(id).getSheetBySheetId("sheet-1").getRange("B4").setValue(90000);
    await api.getCollaboration().flush(id);
  }, sheet.id);
  await expect(page.locator("#expenses")).toHaveValue("90000", { timeout: 30_000 });
  await expect(page.locator('[data-univer-cell-text$=":B5"]')).toHaveText("60000", {
    timeout: 30_000,
  });
  await expect(page.locator("#chart-income-value")).toHaveText("150,000");
  await expect(page.locator("#chart-expenses-value")).toHaveText("90,000");
  await expect(page.locator("#chart-income")).toHaveAttribute("height", "190");
  await expect(page.locator("#chart-expenses")).toHaveAttribute("height", "114");
  const child = html.frames().find((frame) => frame.parentFrame());
  expect(
    await child!.evaluate(() => {
      try {
        parent.document.body;
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  // Navigation commits an input draft even if it has not emitted change yet.
  await page.locator("#income").fill("160000");
  await html.locator(`#files [data-file-id="${sheet.id}"]`).click();
  await expect(html).toHaveURL(new RegExp(`file=${sheet.id}$`));
  await expect(html.locator(".sheet-editor canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() =>
      editor.evaluate(
        (id) =>
          (window as any).univerAPI
            .getWorkbook(id)
            .getSheetBySheetId("sheet-1")
            .getRange("B3")
            .getValue(),
        sheet.id,
      ),
    )
    .toBe(160000);
  await html.locator(`#files [data-file-id="${view.id}"]`).click();
  await expect(html).toHaveURL(new RegExp(`file=${view.id}$`));
  await expect(page.locator("#income")).toHaveValue("160000", { timeout: 30_000 });
  await html.getByRole("button", { name: "HTML source", exact: true }).click();
  await expect(html.locator("#source")).toBeVisible();
  const source = await html.locator("#source").inputValue();
  await html.locator("#source").fill(source.replace("Team budget</h1>", "Edited budget</h1>"));
  await html.getByRole("button", { name: "Save HTML", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Edited budget", { timeout: 30_000 });
  await html.reload();
  await expect(page.locator("h1")).toHaveText("Edited budget");
  await expect(page.locator("#income")).toHaveValue("160000", { timeout: 30_000 });
  await expect(html.locator("#status")).toHaveText("All changes saved");
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
  await html.close();
  await editor.close();
});

test("accepts only the two file types and validates HTML binding references", async ({
  request,
}) => {
  expect(
    (await request.post("/api/files", { data: { kind: "doc", name: "Unsupported" } })).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/files", {
        data: {
          kind: "html",
          name: "Invalid",
          html: '<span data-univer-cell-text="invalid"></span>',
        },
      })
    ).status(),
  ).toBe(400);
  const response = await request.post("/api/files", {
    data: {
      kind: "html",
      name: "JavaScript only",
      html: '<p id="value"></p><script>document.querySelector("#value").textContent=!!window.univerBinding</script>',
    },
  });
  expect(response.status()).toBe(201);
  expect((await response.json()).name).toBe("JavaScript only.univer.html");
});
