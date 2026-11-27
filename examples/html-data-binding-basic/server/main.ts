import { loadWorkbook } from "./workbook.js";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import express from "express";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import { CollabError, UniverCollabService } from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { ErrorCode, UniverType } from "@univerjs/protocol";
import { parseHtmlView } from "@univerkit/html-view";
import { createHtmlSource, createSheetData } from "./templates.js";
import { createSalesHtmlSource, createSalesSheetData } from "./sales-template.js";
import { createEventHtmlSource, createEventSheetData, eventViews } from "./event-template.js";
import { createAiModel, generateHtml, loadAiWorkbook } from "./ai.js";
import { createAiSettings } from "./ai-settings.js";
import { createImportRouter } from "./import.js";
import type { AiEvent } from "../shared/ai.js";
import type { ExampleFile } from "../shared/files.js";

const dataDir = resolve(process.env.DATA_DIR ?? ".data");
await mkdir(dataDir, { recursive: true });
const catalog = new DatabaseSync(resolve(dataDir, "files.sqlite"));
const aiSettings = createAiSettings(resolve(".env"));
catalog.exec(`CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('sheet','html')),
  html TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const database = new SQLiteDatabaseAdapter({ filename: resolve(dataDir, "collaboration.sqlite") });
const service = new UniverCollabService({ dbAdapter: database });
const endpoint = new UniverCollabEndpoint(service);
const transport = createNodeTransport();
// Anonymous demo: one SDK identity, with no login or application permission model.
const context = { userID: "demo-user" };
transport.use(async (request, next) => {
  request.userID = context.userID;
  await next();
});
endpoint.use("connect", async (request, next) => {
  request.member.name = "Guest";
  await next();
});
transport.register(endpoint);

type FileRow = { id: string; name: string; kind: "sheet" | "html"; html: string | null };
const readFile = (id: string) =>
  catalog.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRow | undefined;
const fileInfo = (file: FileRow): ExampleFile =>
  file.kind === "sheet"
    ? { id: file.id, name: file.name, kind: "sheet", unitId: file.id }
    : { id: file.id, name: file.name, kind: "html" };
const insertFile = (
  id: string,
  name: string,
  kind: "sheet" | "html",
  html: string | null = null,
) => {
  catalog
    .prepare("INSERT INTO files (id, name, kind, html) VALUES (?, ?, ?, ?)")
    .run(id, name, kind, html);
  return fileInfo(readFile(id)!);
};
async function ensureSheet(id: string, name: string, createData = createSheetData) {
  try {
    await service.getUnitLoadData(
      { unitID: id, type: UniverType.UNIVER_SHEET, revision: 0 },
      context,
    );
  } catch (error) {
    if (!(error instanceof CollabError) || error.code !== "UNIT_NOT_FOUND") throw error;
    await service.createUnitFromData(
      { type: UniverType.UNIVER_SHEET, data: createData(id, name) },
      context,
    );
  }
  if (!readFile(id)) insertFile(id, name, "sheet");
}
await ensureSheet("demo-budget", "Team budget");
if (!readFile("demo-budget-view"))
  insertFile(
    "demo-budget-view",
    "Team budget.univer.html",
    "html",
    createHtmlSource("demo-budget"),
  );
await ensureSheet("demo-sales", "区域销售分析", createSalesSheetData);
if (!readFile("demo-sales-view"))
  insertFile(
    "demo-sales-view",
    "区域销售驾驶舱.univer.html",
    "html",
    createSalesHtmlSource("demo-sales"),
  );

await ensureSheet("demo-event", "Univer 开发者沙龙 · 活动管理", createEventSheetData);
for (const view of eventViews) {
  const id = `demo-event-${view.id}`;
  if (!readFile(id))
    insertFile(id, `${view.name}.univer.html`, "html", createEventHtmlSource("demo-event", view));
}

const app = express();
app.use(express.json({ limit: Infinity }));
app.use("/api/files/import", createImportRouter({ service, userID: context.userID, insertFile }));
app.get("/api/files", (_request, response) => {
  const rows = catalog.prepare("SELECT * FROM files ORDER BY created_at, rowid").all() as FileRow[];
  response.json(rows.map(fileInfo));
});
app.get("/api/files/:id/binding-metadata", async (request, response) => {
  const file = readFile(request.params.id);
  if (!file || file.kind !== "sheet") {
    response.status(404).json({ error: "Sheet Unit not found." });
    return;
  }
  response.setHeader("Cache-Control", "no-store");
  const workbook = await loadWorkbook(service, context, file.id);
  response.json({
    id: file.id,
    name: file.name,
    sheets: workbook.sheetOrder.map((id) => ({ id, name: workbook.sheets[id]?.name ?? id })),
  });
});
app.get("/api/ai/settings", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ configured: !!aiSettings.getApiKey() });
});
app.put("/api/ai/settings", (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  const origin = request.get("origin");
  if (origin && origin !== `${request.protocol}://${request.get("host")}`) {
    response.status(403).json({ error: "Open AI settings on this server to change the API Key." });
    return;
  }
  const { apiKey } = request.body ?? {};
  if (typeof apiKey !== "string") {
    response.status(400).json({ error: "Provide an API Key, or an empty string to clear it." });
    return;
  }
  try {
    aiSettings.setApiKey(apiKey);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    response.status(400).json({ error: error.message });
    return;
  }
  response.json({ configured: !!aiSettings.getApiKey() });
});
app.post("/api/ai/html", async (request, response) => {
  const { sourceUnitId, prompt } = request.body ?? {};
  if (
    typeof sourceUnitId !== "string" ||
    readFile(sourceUnitId)?.kind !== "sheet" ||
    typeof prompt !== "string" ||
    !prompt.trim()
  ) {
    response.status(400).json({ error: "Choose a source Sheet and describe the HTML view." });
    return;
  }
  const apiKey = aiSettings.getApiKey();
  if (!apiKey) {
    response.status(503).json({
      code: "AI_KEY_NOT_CONFIGURED",
      error: "Set a DeepSeek API Key in AI settings, then return here to generate your view.",
    });
    return;
  }
  let model;
  try {
    model = createAiModel(apiKey);
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : String(error) });
    return;
  }
  const controller = new AbortController();
  response.on("close", () => {
    if (!response.writableFinished) controller.abort();
  });
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Accel-Buffering", "no");
  const emit = (event: AiEvent) => {
    if (!response.destroyed) response.write(JSON.stringify(event) + "\n");
  };
  try {
    emit({ type: "status", message: "正在加载表格的最新数据…" });
    const workbook = await loadAiWorkbook(service, context, sourceUnitId);
    controller.signal.throwIfAborted();
    const html = await generateHtml({ model, workbook, prompt, signal: controller.signal, emit });
    emit({ type: "result", html });
  } catch (error) {
    if (!controller.signal.aborted)
      emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    response.end();
  }
});
app.post("/api/files", async (request, response) => {
  const { kind, name, sourceUnitId, html } = request.body ?? {};
  if ((kind !== "sheet" && kind !== "html") || typeof name !== "string" || !name.trim()) {
    response.status(400).json({ error: "Choose Sheet or univer.html and provide a name." });
    return;
  }
  const id = randomUUID();
  if (kind === "sheet") {
    await ensureSheet(id, name.trim());
    response.status(201).json(fileInfo(readFile(id)!));
    return;
  }
  if (html !== undefined && typeof html !== "string") {
    response.status(400).json({ error: "HTML must be a string." });
    return;
  }
  if (
    html === undefined &&
    (typeof sourceUnitId !== "string" || readFile(sourceUnitId)?.kind !== "sheet")
  ) {
    response.status(400).json({ error: "Choose a source Sheet." });
    return;
  }
  const content: string = html ?? createHtmlSource(sourceUnitId);
  try {
    parseHtmlView(content);
  } catch (error) {
    response.status(400).json({ error: String(error) });
    return;
  }
  const filename = /\.univer\.html$/i.test(name.trim())
    ? name.trim()
    : `${name.trim()}.univer.html`;
  response.status(201).json(insertFile(id, filename, "html", content));
});
app.get("/api/files/:id/content", (request, response) => {
  const file = readFile(request.params.id);
  if (!file || file.kind !== "html") {
    response.status(404).json({ error: "HTML file not found." });
    return;
  }
  // Serve source as JSON, never as executable same-origin HTML.
  response.json({ html: file.html });
});
app.put("/api/files/:id/content", (request, response) => {
  const file = readFile(request.params.id);
  if (!file || file.kind !== "html") {
    response.status(404).json({ error: "HTML file not found." });
    return;
  }
  if (typeof request.body?.html !== "string") {
    response.status(400).json({ error: "HTML must be a string." });
    return;
  }
  try {
    parseHtmlView(request.body.html);
  } catch (error) {
    response.status(400).json({ error: String(error) });
    return;
  }
  catalog.prepare("UPDATE files SET html = ? WHERE id = ?").run(request.body.html, file.id);
  response.json({ saved: true });
});
// The SDK asks for effective actions even though this demo has no permissions UI or ACL.
app.post("/universer-api/authz/-/object/-/batch_allowed", (request, response) => {
  response.json({
    error: { code: ErrorCode.OK, message: "" },
    objectActions: (request.body.requests ?? []).map(
      (item: { unitID: string; objectID: string; actions: unknown[] }) => ({
        unitID: item.unitID,
        objectID: item.objectID,
        actions: item.actions.map((action) => ({ action, allowed: true })),
      }),
    ),
  });
});
app.use(express.static(fileURLToPath(new URL("../web", import.meta.url))));
app.use(
  (
    error: Error,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error);
    response.status(500).json({ error: error.message });
  },
);
const server = createServer(app);
transport.attach(server);
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3030);
server.listen(port, host, () => console.info(`Univer Data Binding: http://${host}:${port}`));
