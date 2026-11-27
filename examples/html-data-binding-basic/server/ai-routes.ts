import express, { type Router } from "express";
import type { AiEvent } from "../shared/ai.js";
import { createAiModel, generateHtml } from "./ai.js";
import type { createAiSettings } from "./ai-settings.js";
import type { FileCatalog } from "./file-catalog.js";
import type { WorkbookReader } from "./workbook-reader.js";

export function createAiRouter(options: {
  catalog: FileCatalog;
  settings: ReturnType<typeof createAiSettings>;
  workbooks: WorkbookReader;
}): Router {
  const { catalog, settings, workbooks } = options;
  const router = express.Router();
  router.use(express.json({ limit: "64kb" }));
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/settings", (_request, response) => {
    response.json({ configured: !!settings.getApiKey() });
  });

  router.put("/settings", (request, response) => {
    const origin = request.get("origin");
    if (origin && origin !== `${request.protocol}://${request.get("host")}`) {
      response
        .status(403)
        .json({ error: "Open AI settings on this server to change the API Key." });
      return;
    }
    const { apiKey } = request.body ?? {};
    if (typeof apiKey !== "string") {
      response.status(400).json({ error: "Provide an API Key, or an empty string to clear it." });
      return;
    }
    try {
      settings.setApiKey(apiKey);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      response.status(400).json({ error: error.message });
      return;
    }
    response.json({ configured: !!settings.getApiKey() });
  });

  // Streams progress and the generated HTML as newline-delimited JSON events.
  router.post("/html", async (request, response) => {
    const { sourceUnitId, prompt } = request.body ?? {};
    if (
      typeof sourceUnitId !== "string" ||
      catalog.get(sourceUnitId)?.kind !== "sheet" ||
      typeof prompt !== "string" ||
      !prompt.trim()
    ) {
      response.status(400).json({ error: "Choose a source Sheet and describe the HTML view." });
      return;
    }
    const apiKey = settings.getApiKey();
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
    response.setHeader("X-Accel-Buffering", "no");
    const emit = (event: AiEvent) => {
      if (!response.destroyed) response.write(JSON.stringify(event) + "\n");
    };
    try {
      emit({ type: "status", message: "正在加载表格的最新数据…" });
      const workbook = await workbooks.read(sourceUnitId);
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

  return router;
}
