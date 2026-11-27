import { expect, test } from "@playwright/test";

test("event: registration, duplicate retry, check-in, undo and Sheet edits sync to all views", async ({
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const editor = await browser.newPage();
  const registration = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const desk = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const screen = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const pages = [editor, registration, desk, screen];
  const errors: string[] = [];
  pages.forEach((page) => page.on("pageerror", (error) => errors.push(error.message)));
  await editor.goto("/?file=demo-event");
  await editor.waitForFunction(() => !!(window as any).univerAPI);
  const original = await editor.evaluate(async () => {
    const api = (window as any).univerAPI;
    const sheet = api.getWorkbook("demo-event").getSheetBySheetId("attendees");
    const values = sheet.getRange("A2:G81").getValues();
    sheet.getRange("A50:G81").setValues(Array.from({ length: 32 }, () => Array(7).fill("")));
    await api.getCollaboration().flush("demo-event");
    return {
      values,
      settings: api
        .getWorkbook("demo-event")
        .getSheetBySheetId("settings")
        .getRange("B2:B8")
        .getValues(),
    };
  });
  try {
    await Promise.all([
      registration.goto("/?file=demo-event-register"),
      desk.goto("/?file=demo-event-checkin"),
      screen.goto("/?file=demo-event-screen"),
    ]);
    const form = registration.frameLocator("iframe");
    const staff = desk.frameLocator("iframe");
    const display = screen.frameLocator("iframe");
    await expect(form.locator("#submit-registration")).toBeEnabled({ timeout: 30_000 });
    await expect(staff.locator("#registered")).toHaveText("48", { timeout: 30_000 });
    await expect(display.locator("#registered")).toHaveText("48", { timeout: 30_000 });
    const originalChecked = Number(await display.locator("#checked").textContent());
    // Verify leaf metric bindings and the collection ranges on freshly seeded templates.
    await expect(form.locator("[data-univer-range-subscribe]")).toHaveCount(1);
    await expect(staff.locator("[data-univer-range-subscribe]")).toHaveCount(1);
    await expect(display.locator("[data-univer-range-subscribe]")).toHaveCount(3);
    await expect(form.locator("#remaining")).toHaveAttribute(
      "data-univer-cell-text",
      "demo-event:summary:B6",
    );
    await expect(form.locator("#session")).toHaveAttribute(
      "data-univer-range-subscribe",
      "demo-event:settings:B6:B8",
    );
    await expect(form.locator("#submit-registration")).not.toHaveAttribute(
      "data-univer-cell-subscribe",
    );
    await expect(form.locator("#registration-form")).not.toHaveAttribute(
      "data-univer-range-subscribe",
    );
    for (const frame of [staff, display]) {
      await expect(frame.locator("#checked")).toHaveAttribute(
        "data-univer-cell-text",
        "demo-event:summary:B3",
      );
      await expect(frame.locator("#rate")).toHaveAttribute(
        "data-univer-cell-subscribe",
        "demo-event:summary:B5",
      );
      await expect(frame.locator("#event-summary")).toHaveCount(0);
    }
    await expect(display.locator("#session-progress")).toHaveAttribute(
      "data-univer-range-subscribe",
      "demo-event:summary:A9:C11",
    );
    await expect(display.locator("#overall-progress")).toHaveAttribute(
      "data-univer-cell-subscribe",
      "demo-event:summary:B5",
    );
    await form.getByLabel("感兴趣的场次").selectOption("AI 与表格");
    await editor.evaluate(async () => {
      const api = (window as any).univerAPI;
      const settings = api.getWorkbook("demo-event").getSheetBySheetId("settings");
      settings.getRange("B2").setValue("模板绑定联动验证");
      settings.getRange("B8").setValue("新场次验证");
      await api.getCollaboration().flush("demo-event");
    });
    await expect(form.locator("#session option").last()).toHaveText("新场次验证");
    await expect(form.locator("#session")).toHaveValue("AI 与表格");
    await expect(display.locator("#session-progress")).toContainText("新场次验证");
    for (const frame of [form, staff, display])
      await expect(frame.locator('[data-univer-cell-text="demo-event:settings:B2"]')).toHaveText(
        "模板绑定联动验证",
      );

    await form.getByLabel("你的姓名").fill("演示访客");
    await form.getByLabel("公司 / 团队").fill("<img src=x onerror=alert(1)>");
    await form.getByLabel("感兴趣的场次").selectOption("AI 与表格");
    // Capacity is read when submitting; no presentation subscription is needed for validation.
    await editor.evaluate(async () => {
      const api = (window as any).univerAPI;
      api.getWorkbook("demo-event").getSheetBySheetId("settings").getRange("B5").setValue(48);
      await api.getCollaboration().flush("demo-event");
    });
    await expect(form.locator("#remaining")).toHaveText("0");
    await form.locator("#submit-registration").click();
    await expect(form.locator("#message")).toContainText("报名已满");
    await expect(form.locator("#registration-success")).toBeHidden();
    await expect(staff.locator("#registered")).toHaveText("48");
    await editor.evaluate(async () => {
      const api = (window as any).univerAPI;
      api.getWorkbook("demo-event").getSheetBySheetId("settings").getRange("B5").setValue(80);
      await api.getCollaboration().flush("demo-event");
    });
    await expect(form.locator("#remaining")).toHaveText("32");
    // A lost save confirmation must permit a safe retry without allocating a second row.
    const registrationFrame = registration.frames().find((frame) => frame.parentFrame())!;
    await registrationFrame.evaluate(() => {
      const original = MessagePort.prototype.postMessage;
      let failOnce = true;
      MessagePort.prototype.postMessage = function (data: any, ...args: any[]) {
        if (failOnce && data.type === "request" && data.method === "flush") {
          failOnce = false;
          throw new Error("测试保存确认丢失");
        }
        return original.call(this, data, ...args);
      };
    });
    await form.locator("#submit-registration").click();
    await expect(form.locator("#message")).toContainText("报名未确认");
    await expect(form.locator("#registration-success")).toBeHidden();
    await form.locator("#submit-registration").click();
    await expect(form.locator("#ticket-id")).toHaveText("U-049");
    await expect(staff.locator("#registered")).toHaveText("49");
    await expect(display.locator("#registered")).toHaveText("49");
    await expect(form.locator("#remaining")).toHaveText("31");
    await staff.getByRole("searchbox").fill("U-049");
    const attendee = staff.locator('[data-ticket="U-049"]');
    await expect(attendee).toContainText("<img src=x onerror=alert(1)>");
    await expect(attendee.locator("img")).toHaveCount(0);
    await attendee.getByRole("button", { name: "签到 演示访客 U-049", exact: true }).click();
    await expect(staff.locator("#message")).toContainText("签到成功");
    await expect(display.locator("#checked")).toHaveText(String(originalChecked + 1));
    await expect(display.locator("#rate")).toHaveText(
      `${Math.round(((originalChecked + 1) / 49) * 100)}%`,
    );
    await expect(display.locator("#welcome-text")).toContainText("演**");
    await expect(display.locator("#recent-arrivals .arrival-card").first()).toContainText("演**");
    await expect(display.locator("#recent-arrivals")).not.toContainText("演示访客");
    await expect
      .poll(() =>
        editor.evaluate(() => {
          const sheet = (window as any).univerAPI
            .getWorkbook("demo-event")
            .getSheetBySheetId("attendees");
          return sheet.getRange("F50").getValue();
        }),
      )
      .toBe("已签到");
    await attendee.getByRole("button", { name: "撤销签到 演示访客 U-049" }).click();
    await expect(staff.locator("#message")).toContainText("已撤销");
    await expect(display.locator("#checked")).toHaveText(String(originalChecked));
    await expect
      .poll(() =>
        editor.evaluate(() => {
          const sheet = (window as any).univerAPI
            .getWorkbook("demo-event")
            .getSheetBySheetId("attendees");
          return sheet.getRange("G50").getValue();
        }),
      )
      .toBe("");
    // Direct Sheet changes are reflected in both HTML views.
    await editor.evaluate(async () => {
      const api = (window as any).univerAPI;
      const sheet = api.getWorkbook("demo-event").getSheetBySheetId("attendees");
      sheet.getRange("F50:G50").setValues([["已签到", "2026-10-24T06:00:00.000Z"]]);
      await api.getCollaboration().flush("demo-event");
    });
    await expect(attendee).toContainText("14:00");
    await expect(display.locator("#checked")).toHaveText(String(originalChecked + 1));
    await staff.getByRole("button", { name: "未到场", exact: true }).click();
    await expect(staff.locator("#attendee-list")).toContainText("没有找到");
    await staff.getByRole("button", { name: "全部人员", exact: true }).click();
    await staff.getByRole("searchbox").fill("");
    // Repeating the same registration returns its existing ticket.
    await form.getByRole("button", { name: "为下一位报名" }).click();
    await form.getByLabel("你的姓名").fill("演示访客");
    await form.getByLabel("公司 / 团队").fill("<img src=x onerror=alert(1)>");
    await form.getByLabel("感兴趣的场次").selectOption("AI 与表格");
    await form.locator("#submit-registration").click();
    await expect(form.locator("#ticket-id")).toHaveText("U-049");
    await expect(display.locator("#registered")).toHaveText("49");
    // The fixed-capacity roster must also observe the last initially empty slot.
    await editor.evaluate(async () => {
      const api = (window as any).univerAPI;
      api
        .getWorkbook("demo-event")
        .getSheetBySheetId("attendees")
        .getRange("A81:G81")
        .setValues([
          [
            "U-080",
            "尾行访客",
            "范围边界验证",
            "AI 与表格",
            new Date().toISOString(),
            "已签到",
            // Newer than every seeded check-in, so it leads the recent arrivals list.
            new Date().toISOString(),
          ],
        ]);
      await api.getCollaboration().flush("demo-event");
    });
    await expect(staff.locator('[data-ticket="U-080"]')).toContainText("尾行访客");
    await expect(display.locator("#registered")).toHaveText("50");
    await expect(display.locator("#checked")).toHaveText(String(originalChecked + 2));
    await expect(display.locator("#welcome-text")).toContainText("尾**");
    await expect(display.locator("#recent-arrivals")).toContainText("尾**");
    await expect(form.locator("#remaining")).toHaveText("30");
    for (const [name, page] of [
      ["register", registration],
      ["checkin", desk],
      ["screen", screen],
    ] as const) {
      await page.screenshot({
        path: testInfo.outputPath(`event-${name}-desktop.png`),
        fullPage: true,
      });
      await page.locator("iframe").evaluate((iframe) => {
        iframe.style.width = "390px";
      });
      const frame = page.frames().find((frame) => frame.parentFrame())!;
      await expect
        .poll(() => frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`event-${name}-mobile.png`),
        fullPage: true,
      });
    }
    await desk.reload();
    await expect(staff.locator("#registered")).toHaveText("50", { timeout: 30_000 });
    await staff.getByRole("searchbox").fill("U-049");
    await expect(staff.locator('[data-ticket="U-049"]')).toContainText("已签到");
    expect(errors).toEqual([]);
  } finally {
    await editor.evaluate(async (original) => {
      const api = (window as any).univerAPI;
      api
        .getWorkbook("demo-event")
        .getSheetBySheetId("attendees")
        .getRange("A2:G81")
        .setValues(original.values);
      api
        .getWorkbook("demo-event")
        .getSheetBySheetId("settings")
        .getRange("B2:B8")
        .setValues(original.settings);
      await api.getCollaboration().flush("demo-event");
    }, original);
    await Promise.all(pages.map((page) => page.close()));
  }
});
