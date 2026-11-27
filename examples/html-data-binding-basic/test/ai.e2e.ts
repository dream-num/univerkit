import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// Only the external model is simulated. The application uses the real
// ChatDeepSeek adapter, LangChain loop, collaboration service and HTML renderer.
let modelServer: Server;
let readResult: { values: unknown[][]; formulas: unknown[][] } | undefined;
let stopped = false;
let pending = false;
let unitId = "";
let modelAuthorization: string | undefined;
let continueOutput: (() => void) | undefined;
let finishOutput: (() => void) | undefined;
function releasePendingOutput() {
  continueOutput?.();
  finishOutput?.();
}
const generatedHtml = () => `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><title>AI budget</title></head>
  <body>
    <h1>AI budget</h1>
    <span id="income" data-univer-cell-text="${unitId}:sheet-1:B3"></span>
    <span id="balance" data-univer-cell-text="${unitId}:sheet-1:B5"></span>
    <p id="runtime"></p>
    <script>document.getElementById("runtime").textContent = String(!!window.univerBinding);</script>
  </body>
</html>`;

test.beforeAll(async () => {
  modelServer = createServer(async (request, response) => {
    modelAuthorization = request.headers.authorization;
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    const user = body.messages.find((message: { role: string }) => message.role === "user").content;
    if (user === "Fail generation") {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ error: { message: "Simulated model failure", type: "server_error" } }),
      );
      return;
    }
    if (user === "Stop generation") {
      pending = true;
      response.on("close", () => {
        stopped = true;
      });
      return;
    }
    const results = body.messages.filter((message: { role: string }) => message.role === "tool");
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const completionId = randomUUID();
    const send = (delta: unknown, finish_reason: string | null = null) =>
      response.write(
        `data: ${JSON.stringify({
          id: completionId,
          object: "chat.completion.chunk",
          created: 1,
          model: "test-model",
          choices: [{ index: 0, delta, finish_reason }],
        })}\n\n`,
      );
    send({ role: "assistant" });
    if (user === "Reasoning output") {
      send({ reasoning_content: `第 ${results.length + 1} 轮：先核对表格数据。` });
      if (results.length === 2) {
        await new Promise<void>((resolve) => {
          continueOutput = resolve;
        });
        if (response.destroyed) return;
      }
      send({ reasoning_content: "再准备页面。<img src=x onerror=alert(1)>" });
      if (results.length === 2) {
        await new Promise<void>((resolve) => {
          finishOutput = resolve;
        });
        if (response.destroyed) return;
      }
    }
    if (results.length < 2) {
      const name = results.length ? "readRange" : "listSheets";
      const args = results.length ? { sheetId: "sheet-1", range: "A1:C7" } : {};
      send({
        tool_calls: [
          {
            index: 0,
            id: name,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
      send({}, "tool_calls");
    } else {
      readResult = JSON.parse(results.at(-1).content);
      const html = `Here is your dashboard.\n\`\`\`html\n${generatedHtml()}\n\`\`\`\nLive data comes from the Sheet.`;
      let start = 0;
      if (user === "Delayed output") {
        await new Promise<void>((resolve) => {
          continueOutput = resolve;
        });
        if (response.destroyed) return;
        send({ content: html.slice(0, 100) });
        start = 100;
        await new Promise<void>((resolve) => {
          finishOutput = resolve;
        });
        if (response.destroyed) return;
      }
      for (let index = start; index < html.length; index += 30)
        send({ content: html.slice(index, index + 30) });
      send({}, "stop");
    }
    response.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve, reject) => {
    modelServer.once("error", reject);
    modelServer.listen(3040, "127.0.0.1", resolve);
  });
});
test.afterAll(async () => {
  modelServer.closeAllConnections();
  await new Promise<void>((resolve) => modelServer.close(() => resolve()));
});
test.beforeEach(async ({ request }) => {
  await request.put("/api/ai/settings", { data: { apiKey: "test-only-key" } });
});

test("AI settings saves and replaces the server key without exposing it, and clearing disables generation", async ({
  page,
  request,
}) => {
  await page.goto("/?file=demo-budget-view");
  await page.locator("#ai-settings").click();
  const key = page.locator('#ai-settings-form [name="apiKey"]');
  await expect(page.locator("#ai-key-status")).toHaveText("API Key configured");
  await expect(key).toHaveValue("");
  await expect(key).toHaveAttribute("type", "password");
  for (const apiKey of ["first-browser-key", "replacement-browser-key"]) {
    await key.fill(apiKey);
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/ai/settings") && response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Save API Key", exact: true }).click();
    expect(await (await saved).json()).toEqual({ configured: true });
    await expect(key).toHaveValue("");
  }
  expect(await (await request.get("/api/ai/settings")).json()).toEqual({ configured: true });
  await request.post("/api/ai/html", {
    data: { sourceUnitId: "demo-budget", prompt: "Fail generation" },
  });
  expect(modelAuthorization).toBe("Bearer replacement-browser-key");
  expect(
    await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)]),
  ).not.toContainEqual(expect.stringContaining("replacement-browser-key"));
  await page.locator("#ai-settings-close").click();
  await page.reload();
  await page.locator("#ai-settings").click();
  await expect(page.locator("#ai-key-status")).toHaveText("API Key configured");
  await expect(key).toHaveValue("");
  const rejected = await request.put("/api/ai/settings", {
    headers: { origin: "null" },
    data: { apiKey: "untrusted" },
  });
  expect(rejected.status()).toBe(403);
  expect((await request.put("/api/ai/settings", { data: { apiKey: 123 } })).status()).toBe(400);
  await page.locator("#ai-key-clear").click();
  await expect(page.locator("#ai-key-status")).toHaveText("API Key not configured");
  expect(
    (
      await request.post("/api/ai/html", {
        data: { sourceUnitId: "demo-budget", prompt: "Generate" },
      })
    ).status(),
  ).toBe(503);
});

test("missing API Key links to settings and resumes generation without losing the form", async ({
  page,
  request,
}) => {
  await request.put("/api/ai/settings", { data: { apiKey: "" } });
  modelAuthorization = undefined;
  unitId = "demo-budget";
  await page.goto("/?file=demo-budget");
  await page.waitForFunction(() => !!(window as any).univerAPI);
  await page.locator("#generate-html").click();
  await page.locator('#ai-form [name="name"]').fill("Keep my dashboard name");
  await page.locator('#ai-form [name="prompt"]').fill("Keep my dashboard description");
  await page.locator('#ai-form [type="submit"]').click();
  await expect(page.locator("#ai-error")).toContainText("Set a DeepSeek API Key");
  await expect(page.locator("#ai-output")).toBeHidden();
  expect(modelAuthorization).toBeUndefined();
  await page.locator("#ai-open-settings").click();
  await expect(page.locator("#ai-key-status")).toHaveText("API Key not configured");
  await page.locator("#ai-settings-close").click();
  await expect(page.locator("#ai-open-settings")).toBeVisible();
  await page.locator("#ai-open-settings").click();
  await expect(page.locator("#ai-key-status")).toHaveText("API Key not configured");
  await page.locator('#ai-settings-form [name="apiKey"]').fill("resumed-key");
  await page.getByRole("button", { name: "Save API Key", exact: true }).click();
  await expect(page.locator("#ai-settings-dialog")).toBeHidden();
  await expect(page.locator("#ai-status")).toContainText("Click Generate to continue");
  await expect(page.locator('#ai-form [name="name"]')).toHaveValue("Keep my dashboard name");
  await expect(page.locator('#ai-form [name="prompt"]')).toHaveValue(
    "Keep my dashboard description",
  );
  await expect(page.locator('#ai-form [name="sourceUnitId"]')).toHaveValue(unitId);
  await expect(page.locator("#ai-open-settings")).toBeHidden();
  await expect(page.locator("#ai-error")).toBeEmpty();
  await page.locator('#ai-form [type="submit"]').click();
  await expect(page.locator("#ai-preview")).toBeVisible({ timeout: 30_000 });
  expect(modelAuthorization).toBe("Bearer resumed-key");
  await expect(page.locator('#ai-form [name="name"]')).toHaveValue("Keep my dashboard name");
});

test("AI reads recent collaboration edits, previews an unsaved draft, and saves HTML", async ({
  page,
  request,
}) => {
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(`${dialog.type()}: ${page.url()}`);
    await dialog.accept();
  });
  const created = await request.post("/api/files", { data: { kind: "sheet", name: "AI source" } });
  unitId = (await created.json()).id;
  await page.goto(`/?file=${unitId}`);
  await page.waitForFunction(() => !!(window as any).univerAPI);
  await page.evaluate(async (id) => {
    const api = (window as any).univerAPI;
    api.getWorkbook(id).getSheetBySheetId("sheet-1").getRange("B3").setValue(170000);
    await api.getCollaboration().flush(id);
  }, unitId);
  const filename = `AI budget ${Date.now()}`;
  await expect(page.locator("#new-html, #upload-html, #upload")).toHaveCount(0);
  await page.locator(".header-actions #generate-html").click();
  await expect(page.locator('#ai-form [name="sourceUnitId"]')).toHaveValue(unitId);
  await expect(page.locator("#ai-source-name")).toHaveValue("AI source");
  await expect(page.locator("#ai-source-name")).toHaveAttribute("readonly", "");
  await expect(page.locator('#ai-form [name="name"]')).toBeEmpty();
  await page.locator('#ai-form [name="prompt"]').fill("Build a live budget dashboard");
  await page.locator('#ai-form [type="submit"]').click();
  await expect(page.locator("#ai-preview")).toBeVisible({ timeout: 30_000 });
  expect(readResult?.values[2]?.[1]).toBe(170000);
  expect(readResult?.values[4]?.[1]).toBe(90000);
  expect(readResult?.formulas[4]?.[1]).toBe("=B3-B4");
  await expect(page.locator("#ai-output")).toHaveValue(generatedHtml());
  await expect(page.locator('#ai-form [name="name"]')).toHaveValue("AI budget");
  await page.locator('#ai-form [name="name"]').fill(filename);
  await page.locator("#ai-preview").click();
  await expect(page).toHaveURL(/\?draft=/);
  await expect(page.locator("#generate-html")).toBeHidden();
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("#income")).toHaveText("170000", { timeout: 30_000 });
  await expect(frame.locator("#balance")).toHaveText("90000");
  await expect(frame.locator("#runtime")).toHaveText("true");
  expect(
    (await (await request.get("/api/files")).json()).some((file: { name: string }) =>
      file.name.startsWith(filename),
    ),
  ).toBe(false);
  // Cell values can render before the collaboration connection finishes syncing.
  await expect(page.locator("#status")).toHaveText("All changes saved");
  await page.reload();
  await expect(frame.locator("#income")).toHaveText("170000");
  await page.locator("#save-draft").click();
  await expect(page).toHaveURL(/\?file=/);
  await expect(page.locator("#file-name")).toHaveText(`${filename}.univer.html`);
  await expect(frame.locator("#income")).toHaveText("170000");
  await expect(page.locator("#save-draft")).toBeHidden();
  await expect(page.locator("#generate-html")).toBeHidden();
  const files = await (await request.get("/api/files")).json();
  const saved = files.filter((file: { name: string }) => file.name === `${filename}.univer.html`);
  expect(saved).toHaveLength(1);
  expect((await (await request.get(`/api/files/${saved[0].id}/content`)).json()).html).toBe(
    generatedHtml(),
  );
  expect(dialogs).toEqual([]);
});

test("model failure and cancellation keep the page usable and do not create files", async ({
  page,
  request,
}) => {
  await page.goto("/?file=demo-budget");
  await page.waitForFunction(() => !!(window as any).univerAPI);
  const before = await (await request.get("/api/files")).json();
  await page.locator("#generate-html").click();
  await page.locator('#ai-form [name="prompt"]').fill("Fail generation");
  await page.locator('#ai-form [type="submit"]').click();
  await expect(page.locator("#ai-error")).toContainText("Simulated model failure");
  await expect(page.locator('#ai-form [type="submit"]')).toBeEnabled();
  await expect(page.locator("#ai-preview")).toBeHidden();
  await page.locator('#ai-form [name="prompt"]').fill("Stop generation");
  await page.locator('#ai-form [type="submit"]').click();
  await expect.poll(() => pending).toBe(true);
  await page.locator("#ai-cancel").click();
  await expect(page.locator("#ai-status")).toHaveText("生成已停止。");
  await expect.poll(() => stopped).toBe(true);
  await page.locator("#ai-cancel").click();
  await expect(page.locator("#ai-dialog")).not.toBeVisible();
  expect(await (await request.get("/api/files")).json()).toEqual(before);
  expect(
    (
      await request.post("/api/ai/html", {
        data: { sourceUnitId: "demo-budget-view", prompt: "Generate" },
      })
    ).status(),
  ).toBe(400);
});

test("shows progress before the first HTML token and keeps streaming after a delay", async ({
  page,
}, testInfo) => {
  unitId = "demo-budget";
  continueOutput = finishOutput = undefined;
  await page.clock.install();
  await page.goto("/?file=demo-budget");
  await page.waitForFunction(() => !!(window as any).univerAPI);
  await page.locator("#generate-html").click();
  await page.locator('#ai-form [name="prompt"]').fill("Delayed output");
  await page.locator('#ai-form [type="submit"]').click();
  try {
    await expect.poll(() => !!continueOutput).toBe(true);
    await expect(page.locator("#ai-progress")).toBeVisible();
    await expect(page.locator("#ai-steps")).toContainText("已读取 1 个工作表的结构。");
    await expect(page.locator("#ai-steps")).toContainText("A1:C7 的数据和公式。");
    await expect(page.locator("#ai-status")).toHaveText("AI 正在处理已读取的数据，等待下一步输出…");
    await expect(page.locator("#ai-output")).toBeHidden();
    await expect(page.locator("#ai-preview")).toBeHidden();
    await page.clock.fastForward(9_000);
    await expect(page.locator("#ai-elapsed")).not.toHaveText("已用 0 秒");
    await expect(page.locator("#ai-waiting")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("ai-waiting.png") });
    continueOutput!();
    await expect(page.locator("#ai-output")).toBeVisible();
    await expect(page.locator("#ai-output")).toHaveValue(/<!doctype html>/);
    await expect(page.locator("#ai-status")).toHaveText("正在编写 HTML…");
    await expect(page.locator("#ai-waiting")).toBeHidden();
    await expect(page.locator("#ai-preview")).toBeHidden();
    await expect.poll(() => !!finishOutput).toBe(true);
    await page.locator('#ai-form [name="name"]').fill("My live dashboard");
    finishOutput!();
    await expect(page.locator("#ai-preview")).toBeVisible();
    await expect(page.locator('#ai-form [name="name"]')).toHaveValue("My live dashboard");
    await expect(page.locator("#ai-output")).toHaveValue(generatedHtml());
    await expect(page.locator("#ai-steps")).toContainText("A1:C7 的数据和公式。");
    await expect(page.locator("#ai-progress")).toHaveAttribute("data-running", "false");
    const elapsed = await page.locator("#ai-elapsed").textContent();
    await page.clock.fastForward(3_000);
    await expect(page.locator("#ai-elapsed")).toHaveText(elapsed!);
  } finally {
    releasePendingOutput();
  }
});

test("streams provider reasoning as separate messages and keeps it out of generated HTML", async ({
  page,
}, testInfo) => {
  unitId = "demo-budget";
  continueOutput = finishOutput = undefined;
  await page.clock.install();
  await page.goto("/?file=demo-budget");
  await page.waitForFunction(() => !!(window as any).univerAPI);
  await page.locator("#generate-html").click();
  await page.locator('#ai-form [name="prompt"]').fill("Reasoning output");
  await page.locator('#ai-form [type="submit"]').click();
  try {
    await expect.poll(() => !!continueOutput).toBe(true);
    const thoughts = page.locator(".ai-thought-content");
    await expect(thoughts).toHaveCount(3);
    await expect(thoughts.nth(0)).toContainText("第 1 轮：先核对表格数据。");
    await expect(thoughts.nth(1)).toContainText("第 2 轮：先核对表格数据。");
    await expect(thoughts.nth(2)).toHaveText("第 3 轮：先核对表格数据。");
    await expect(page.locator("#ai-output")).toBeHidden();
    await expect(page.locator("#ai-status")).toHaveText("AI 正在思考…");
    await page.clock.fastForward(9_000);
    await expect(page.locator("#ai-waiting")).toBeVisible();
    continueOutput!();
    await expect(thoughts.nth(2)).toHaveText(
      "第 3 轮：先核对表格数据。再准备页面。<img src=x onerror=alert(1)>",
    );
    await expect(page.locator("#ai-waiting")).toBeHidden();
    await expect(page.locator("#ai-output")).toBeHidden();
    await expect(page.locator(".ai-thought img")).toHaveCount(0);
    await expect(page.locator("#ai-cancel")).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("ai-reasoning.png") });
    await expect.poll(() => !!finishOutput).toBe(true);
    finishOutput!();
    await expect(page.locator("#ai-preview")).toBeVisible();
    await expect(page.locator("#ai-output")).toHaveValue(generatedHtml());
    await expect(thoughts).toHaveCount(3);
    await page.locator(".ai-thought summary").last().click();
    await expect(thoughts.last()).toBeHidden();
    await page.locator(".ai-thought summary").last().click();
    await expect(thoughts.last()).toBeVisible();
    // A new generation clears history; a model without reasoning gets no fake thought messages.
    await page.locator('#ai-form [name="prompt"]').fill("Fail generation");
    await page.locator('#ai-form [type="submit"]').click();
    await expect(page.locator("#ai-error")).toContainText("Simulated model failure");
    await expect(page.locator(".ai-thought")).toHaveCount(0);
  } finally {
    releasePendingOutput();
  }
});
