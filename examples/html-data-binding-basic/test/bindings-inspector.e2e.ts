import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Inspection reads each Sheet name from `GET /api/files/:id`; failing it makes names unavailable.
const fileMetadata = /\/api\/files\/[^/?]+$/;

async function fixture(page: Page, request: APIRequestContext) {
  const first = await (
    await request.post("/api/files", { data: { kind: "sheet", name: `Inspector A ${Date.now()}` } })
  ).json();
  const second = await (
    await request.post("/api/files", { data: { kind: "sheet", name: `Inspector B ${Date.now()}` } })
  ).json();
  const ref = `${first.id}:sheet-1`;
  const html = `<html><head><style>body{font:16px system-ui;padding:24px}.card{padding:16px;border:1px solid #ddd;margin:12px 0}button{padding:10px}#formatted{display:block;width:160px}</style></head><body>
<h1>Binding review cases</h1>
<span id="amount" data-univer-cell-text="${ref}:B3"></span>
<input id="income" type="number" data-univer-cell-model="${ref}:B3">
<span id="formatted" style="outline:1px dotted red!important;outline-offset:5px" data-univer-cell-subscribe="${ref}:B3"></span>
<div id="attendees" data-univer-range-subscribe="${ref}:B3:B4"></div>
<span id="other" data-univer-cell-text="${second.id}:sheet-1:B3"></span>
<script>
window.actionClicks=0;
const binding=window.univerBinding;
binding.subscribeCellById('formatted', ({value}) => document.getElementById('formatted').textContent='$'+value);
binding.subscribeRangeById('attendees', ({value})=>{
 const container=document.getElementById('attendees');
 container.replaceChildren(...value.map(([amount])=>{
  const card=document.createElement('article');card.className='card';
  const button=document.createElement('button');button.textContent='Card '+amount;
  button.onclick=()=>window.actionClicks++;card.append(button);return card;
 }));
});
const exampleOnly='<span data-univer-cell-text="ghost:s:A1"></span>';
</script></body></html>`;
  const response = await request.post("/api/files", {
    data: { kind: "html", name: "Inspector cases", html },
  });
  expect(response.ok()).toBeTruthy();
  const file = await response.json();
  await page.goto(`/?file=${file.id}`);
  await expect(page.frameLocator("iframe").locator("#formatted")).toHaveText("$120000");
  await page.getByRole("button", { name: "Bindings", exact: true }).click();
  const panel = page.locator("#binding-inspector");
  await expect(panel.locator(".binding-count")).toHaveText("5 elements");
  await expect(panel.locator("[data-all]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.frameLocator("iframe").locator("#income")).toHaveCSS("outline-style", "dashed");
  const child = page.frames().find((frame) => frame.parentFrame())!;
  const preview = page.frameLocator("iframe");
  const popup = preview.locator(".binding-popover");
  const node = (id: string) => panel.locator("[data-binding-id]").filter({ hasText: `#${id}` });
  return { panel, ref, html, file, child, preview, popup, node, first, second };
}

test("Unit cards isolate identical addresses and connect shared references to local source popovers", async ({
  page,
  request,
}, testInfo) => {
  const { panel, child, popup, node, first, second } = await fixture(page, request);
  await expect(panel.locator(".binding-unit-card")).toHaveCount(2);
  await expect(page.locator("iframe")).toBeVisible();
  const sidebar = await panel.boundingBox();
  const frame = await page.locator("iframe").boundingBox();
  expect(sidebar!.width).toBeLessThanOrEqual(440);
  expect(frame!.x + frame!.width).toBeLessThanOrEqual(sidebar!.x + 1);
  await expect(panel.locator("[data-back], [data-preview]")).toHaveCount(0);
  const a = panel.locator(`[data-unit-id="${first.id}"]`);
  const b = panel.locator(`[data-unit-id="${second.id}"]`);
  await expect(a.locator("h3")).toHaveText(first.name);
  await expect(b.locator("h3")).toHaveText(second.name);
  await expect(a.locator("h4")).toHaveText("Budget");
  // The Sheet name comes from the file API; sheet names come from the page's loaded Engine.
  expect(await (await request.get(`/api/files/${first.id}`)).json()).toEqual({
    id: first.id,
    name: first.name,
    kind: "sheet",
    unitId: first.id,
  });
  await a.locator('[data-target="B3"]').click();
  await expect(a.locator('[data-binding-id][aria-pressed="true"]')).toHaveCount(3);
  await expect(b.locator('[aria-pressed="true"]')).toHaveCount(0);
  await b.locator('[data-target="B3"]').click();
  await expect(b.locator('[data-binding-id][aria-pressed="true"]')).toHaveCount(1);
  await expect(a.locator('[aria-pressed="true"]')).toHaveCount(0);
  await node("formatted").click();
  await expect(popup).toBeVisible();
  await expect(panel.locator(".binding-cards")).toBeVisible();
  await expect(popup).not.toContainText(first.id);
  await expect(popup).toContainText(first.name);
  await expect(popup).toContainText("Budget");
  await expect(panel).not.toContainText(first.id);
  await expect(panel).not.toContainText("sheet-1");
  await expect(popup).toContainText("B3");
  await expect
    .poll(() => child.evaluate(() => document.getElementById("formatted")!.style.outlineWidth))
    .toBe("3px");
  await popup.getByRole("button", { name: "Close binding details" }).click();
  await expect(popup).toHaveCount(0);
  await expect
    .poll(() => child.evaluate(() => document.getElementById("formatted")!.style.outlineWidth))
    .toBe("2px");
  await expect(a.locator('[data-target="B3"]')).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({ path: testInfo.outputPath("unit-cards.png"), fullPage: true });
});

test("highlight all toggles off, follows dynamic declarations and restores author outlines", async ({
  page,
  request,
}) => {
  const { panel, child, ref, popup, preview } = await fixture(page, request);
  await panel.getByRole("button", { name: "Cancel highlighting" }).click();
  await expect(preview.locator("#income")).toHaveCSS("outline-width", "0px");
  const authorLonghands = await child.evaluate(() => {
    const style = document.getElementById("other")!.style;
    style.cssText =
      "outline-width:2px!important;outline-style:dashed;outline-color:red!important;outline-offset:6px";
    return ["outline-width", "outline-style", "outline-color", "outline-offset"].map((property) => [
      style.getPropertyValue(property),
      style.getPropertyPriority(property),
    ]);
  });
  const highlighted = () =>
    child.evaluate(
      () =>
        [
          ...document.querySelectorAll<HTMLElement>(
            "[data-univer-cell-text],[data-univer-cell-model],[data-univer-cell-subscribe],[data-univer-range-subscribe]",
          ),
        ].filter((el) => ["rgb(13, 148, 136)", "rgb(79, 70, 229)"].includes(el.style.outlineColor))
          .length,
    );
  await panel.getByRole("button", { name: "Highlight all elements" }).click();
  await expect.poll(highlighted).toBe(5);
  await preview.locator("#attendees button").first().click();
  await expect(popup.locator("h3")).toHaveText("#attendees");
  await expect(preview.locator("#attendees")).toHaveCSS("outline-style", "solid");
  await expect(preview.locator("#attendees")).toHaveCSS("outline-width", "3px");
  await expect(preview.locator("#income")).toHaveCSS("outline-style", "dashed");
  await expect(preview.locator("#income")).toHaveCSS("outline-width", "2px");
  expect(await child.evaluate(() => (window as any).actionClicks)).toBe(0);
  await popup.getByRole("button", { name: "Close binding details" }).click();
  await expect(popup).toHaveCount(0);
  await expect.poll(highlighted).toBe(5);
  await child.evaluate((ref) => {
    const el = document.createElement("div");
    el.id = "dynamic";
    el.setAttribute("data-univer-cell-subscribe", `${ref}:B4`);
    document.body.append(el);
  }, ref);
  await expect.poll(highlighted).toBe(6);
  await expect(panel.locator(".binding-count")).toContainText("6 elements");
  await child.evaluate(() =>
    document.getElementById("dynamic")!.removeAttribute("data-univer-cell-subscribe"),
  );
  await expect.poll(highlighted).toBe(5);
  expect(await child.evaluate(() => document.getElementById("dynamic")!.style.outline)).toBe("");
  await panel.getByRole("button", { name: "Cancel highlighting" }).click();
  await expect.poll(highlighted).toBe(0);
  await expect(popup).toHaveCount(0);
  expect(
    await child.evaluate(() => {
      const style = document.getElementById("other")!.style;
      return ["outline-width", "outline-style", "outline-color", "outline-offset"].map(
        (property) => [style.getPropertyValue(property), style.getPropertyPriority(property)],
      );
    }),
  ).toEqual(authorLonghands);
  expect(
    await child.evaluate(() => ({
      width: document.getElementById("formatted")!.style.outlineWidth,
      offset: document.getElementById("formatted")!.style.outlineOffset,
      priority: document.getElementById("formatted")!.style.getPropertyPriority("outline"),
    })),
  ).toEqual({ width: "1px", offset: "5px", priority: "important" });
  await panel.getByRole("button", { name: "Highlight all elements" }).click();
  await expect.poll(highlighted).toBe(5);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect.poll(highlighted).toBe(0);
  await preview.locator("#attendees button").first().click();
  expect(await child.evaluate(() => (window as any).actionClicks)).toBe(1);
});

test("retargeting moves references between Sheet groups and popup handles invalid, duplicate and removed elements", async ({
  page,
  request,
}) => {
  const { panel, child, ref, node, popup, first } = await fixture(page, request);
  await child.evaluate((ref) => {
    const el = document.createElement("div");
    el.id = "dynamic:card";
    el.setAttribute("data-univer-cell-subscribe", `${ref}:B4`);
    document.body.append(el);
  }, ref);
  await expect(panel.locator(".binding-count")).toHaveText("6 elements");
  await node("dynamic:card").click();
  await expect(popup).toContainText("B4");
  await child.evaluate(
    (unit) =>
      document
        .getElementById("dynamic:card")!
        .setAttribute("data-univer-cell-subscribe", `${unit}:another-sheet:B5`),
    first.id,
  );
  await expect(popup).toContainText("id: another-sheet");
  await popup.getByRole("button", { name: "Close binding details" }).click();
  await expect(panel.locator(`[data-unit-id="${first.id}"] .binding-sheet`)).toHaveCount(2);
  await node("dynamic:card").click();
  await child.evaluate(() =>
    document.getElementById("dynamic:card")!.setAttribute("data-univer-cell-subscribe", "invalid"),
  );
  await expect(popup).toContainText("Reference could not be parsed");
  await expect(panel.locator(".binding-count")).toContainText("1 with issues");
  await popup.getByRole("button", { name: "Close binding details" }).click();
  await expect(panel.locator(".binding-invalid")).toContainText("#dynamic:card");
  await child.evaluate(() => {
    const el = document.createElement("div");
    el.id = "amount";
    document.body.append(el);
  });
  await expect(panel.locator(".binding-count")).toContainText("2 with issues");
  await node("amount").click();
  await expect(popup).toContainText("Duplicate HTML ID");
  await popup.getByRole("button", { name: "Close binding details" }).click();
  await node("dynamic:card").click();
  await child.evaluate(() => document.getElementById("dynamic:card")!.remove());
  await expect(popup).toHaveCount(0);
  await expect(panel.locator(".binding-count")).toContainText("5 elements");
});

test("source-only and uninstantiated declarations are excluded, empty views do not invent bindings", async ({
  page,
  request,
}) => {
  const sheet = await (
    await request.post("/api/files", { data: { kind: "sheet", name: "DOM source" } })
  ).json();
  const html = `<div id="source-only" data-univer-cell-text="${sheet.id}:sheet-1:B3"></div><template><span data-univer-cell-text="${sheet.id}:sheet-1:B4"></span></template><script>document.getElementById('source-only').remove();const example='<div data-univer-cell-subscribe="ghost:s:A1"></div>';</script>`;
  const file = await (
    await request.post("/api/files", { data: { kind: "html", name: "DOM only", html } })
  ).json();
  await page.goto(`/?file=${file.id}`);
  await page.getByRole("button", { name: "Bindings", exact: true }).click();
  const panel = page.locator("#binding-inspector");
  await expect(panel.locator(".binding-count")).toHaveText("0 elements");
  await expect(panel).toContainText("No declared bindings");
  await expect(panel.locator("[data-all]")).toBeDisabled();
  await expect(panel.locator(".binding-unit-card")).toHaveCount(0);
});

test("real templates retain chart and collection boundaries at desktop and narrow widths", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/?file=demo-sales-view");
  const preview = page.frameLocator("iframe"),
    panel = page.locator("#binding-inspector"),
    popup = preview.locator(".binding-popover");
  await expect(preview.locator("#region")).toBeEnabled({ timeout: 30_000 });
  await expect(preview.locator("#trend-chart svg")).toBeVisible();
  await page.getByRole("button", { name: "Bindings", exact: true }).click();
  await expect(panel.locator(".binding-count")).toHaveText("12 elements");
  await expect(panel.locator(".binding-unit-card")).toHaveCount(1);
  for (const width of [1600, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.locator("iframe")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`sales-unit-card-${width}.png`),
      fullPage: true,
    });
  }
  await panel.locator("[data-binding-id]").filter({ hasText: "#trend-chart" }).click();
  await expect(popup).toContainText("A15:C21");
  expect(
    await popup.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight
      );
    }),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("local-chart-narrow.png"), fullPage: true });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/?file=demo-event-checkin");
  await expect(preview.locator("#attendee-list article").first()).toBeVisible();
  await page.getByRole("button", { name: "Bindings", exact: true }).click();
  await expect(panel.locator(".binding-count")).toHaveText("7 elements");
  await preview.locator("#attendee-list .person-name").first().click();
  await expect(popup.locator("h3")).toHaveText("#attendee-list");
  await expect(popup).toContainText("A2:G81");
  await expect(panel.locator(".binding-count")).toContainText("7 elements");
  await page.screenshot({ path: testInfo.outputPath("local-list.png"), fullPage: true });
});

test("local popup follows scroll and resize, Escape closes it, and source drafts survive inspection", async ({
  page,
  request,
}) => {
  const { panel, preview, child, popup, node, html } = await fixture(page, request);
  await child.evaluate(() => {
    document.body.style.minHeight = "2400px";
    document.getElementById("formatted")!.style.marginTop = "600px";
  });
  await node("formatted").click();
  await expect(popup).toBeVisible();
  await child.evaluate(() => window.scrollBy(0, 100));
  await expect
    .poll(() =>
      child.evaluate(() => {
        const target = document.getElementById("formatted")!.getBoundingClientRect();
        const popup = document.querySelector(".binding-popover-host")!.getBoundingClientRect();
        return (
          Math.abs(popup.top - target.bottom - 8) < 2 || Math.abs(popup.bottom - target.top + 8) < 2
        );
      }),
    )
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 850 });
  await expect
    .poll(() =>
      popup.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
      }),
    )
    .toBe(true);
  await popup.getByRole("button", { name: "Close binding details" }).focus();
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await page.getByRole("button", { name: "HTML source", exact: true }).click();
  const draft = "<!-- unsaved prefix -->\n" + html;
  await page.locator("#source").fill(draft);
  await page.getByRole("button", { name: "Bindings", exact: true }).click();
  await node("formatted").click();
  await expect(popup).toBeVisible();
  await page.getByRole("button", { name: "Bindings", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await preview.locator("#attendees button").first().click();
  expect(await child.evaluate(() => (window as any).actionClicks)).toBe(1);
  await page.getByRole("button", { name: "HTML source", exact: true }).click();
  await expect(page.locator("#source")).toHaveValue(draft);
});

test("budget, registration and screen inspect actual declarations and clear selection on navigation", async ({
  page,
}) => {
  for (const [file, count, unitName] of [
    ["demo-budget-view", 6, "Team budget"],
    ["demo-event-register", 5, "Univer 开发者沙龙 · 活动管理"],
    ["demo-event-screen", 10, "Univer 开发者沙龙 · 活动管理"],
  ] as const) {
    await page.goto(`/?file=${file}`);
    await page.getByRole("button", { name: "Bindings", exact: true }).click();
    const panel = page.locator("#binding-inspector");
    await expect(panel.locator(".binding-count")).toHaveText(`${count} elements`);
    await expect(panel.locator("h3")).toHaveText(unitName);
    await expect(panel.getByRole("button", { name: "Cancel highlighting" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "HTML source", exact: true }).click();
    await expect(panel).toBeHidden();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const frame = page.frames().find((frame) => frame.parentFrame())!;
    expect(
      await frame.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            "[data-univer-binding], [data-univer-cell-subscribe], [data-univer-range-subscribe]",
          ),
        ].some((el) => el.style.outlineWidth === "3px"),
      ),
    ).toBe(false);
  }
});

test("unavailable names use explicit ID fallbacks and selecting then deselecting a reference restores all highlights", async ({
  page,
  request,
}) => {
  await page.route(fileMetadata, (route) =>
    route.fulfill({ status: 503, body: "private-id must not become UI text" }),
  );
  const { panel, preview, popup, first, second } = await fixture(page, request);
  await expect(panel.locator("h3")).toHaveText([`id: ${first.id}`, `id: ${second.id}`]);
  await expect(panel.locator("h4")).toHaveText(["id: sheet-1", "id: sheet-1"]);
  await expect(panel.locator(".binding-error")).toContainText("Some names are unavailable");
  await expect(panel).not.toContainText("private-id must not become UI text");
  const reference = panel.locator(`[data-unit-id="${first.id}"] [data-target="B3"]`);
  await reference.click();
  await expect(preview.locator("#amount")).toHaveCSS("outline-style", "solid");
  await expect(preview.locator("#other")).toHaveCSS("outline-style", "dashed");
  await reference.click();
  await expect(preview.locator("#amount")).toHaveCSS("outline-style", "dashed");
  await preview.locator("#amount").hover();
  const tooltip = preview.getByRole("tooltip");
  await expect(tooltip).toContainText(`id: ${first.id}`);
  await preview.locator("#amount").click();
  await expect(popup).toContainText(`id: ${first.id}`);
  await expect(panel.locator('[data-binding-id][aria-pressed="true"]')).toHaveCount(1);
  await panel.getByRole("button", { name: "Cancel highlighting" }).click();
  await expect(popup).toBeVisible();
  await expect(preview.locator("#amount")).toHaveCSS("outline-width", "3px");
  await expect(preview.locator("#other")).toHaveCSS("outline-width", "0px");
});

test("Chinese locale reaches sidebar, iframe details, diagnostics and metadata errors", async ({
  page,
  request,
}) => {
  const { file, first } = await fixture(page, request);
  await page.goto(`/?file=${file.id}&lang=zh-CN`);
  await page.getByRole("button", { name: "Bindings", exact: true }).click();
  const panel = page.locator("#binding-inspector");
  const preview = page.frameLocator("iframe");
  await expect(panel).toHaveAttribute("lang", "zh-CN");
  await expect(panel.locator(".binding-count")).toHaveText("5 个元素");
  await expect(panel.getByRole("button", { name: "取消全部高亮" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(panel.getByRole("heading", { name: first.name })).toBeVisible();
  await expect(panel).toContainText("页面元素");
  await panel.locator("[data-binding-id]").filter({ hasText: "#income" }).click();
  const popup = preview.getByRole("dialog", { name: "绑定来源" });
  await expect(popup).toContainText("选中元素");
  await expect(popup).toContainText("输入控件");
  await expect(popup).toContainText(first.name);
  await popup.getByRole("button", { name: "关闭绑定详情" }).click();
  await preview.locator("#amount").hover();
  await expect(preview.getByRole("tooltip")).toContainText("数据来源");
  const child = page.frames().find((frame) => frame.parentFrame())!;
  await child.evaluate(() =>
    document.getElementById("income")!.setAttribute("data-univer-cell-model", "broken"),
  );
  await expect(panel).toContainText("无效的绑定声明");
  await expect(panel.locator(".binding-count")).toHaveText("5 个元素 · 1 个异常");
  await panel.locator("[data-binding-id]").filter({ hasText: "#income" }).click();
  await expect(popup).toContainText("无法解析数据引用。");
  await expect(popup).toContainText("引用格式应为");
  await expect(popup).not.toContainText("Expected");
  await page.route(fileMetadata, (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await page.getByRole("button", { name: "Bindings", exact: true }).click();
  await page.getByRole("button", { name: "Bindings", exact: true }).click();
  await expect(panel.locator(".binding-error")).toHaveText("部分名称暂不可用，请刷新重试。");
  await expect(panel).toContainText(`id: ${first.id}`);
  await page.unroute(fileMetadata);
  await panel.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(panel.getByRole("heading", { name: first.name })).toBeVisible();
});
