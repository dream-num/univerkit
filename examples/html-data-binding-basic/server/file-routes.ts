import { randomUUID } from "node:crypto";
import express, { type Router } from "express";
import { parseHtmlView } from "@univerkit/html-view-parser";
import type { FileCatalog } from "./file-catalog.js";
import { createHtmlSource, createSheetData } from "./templates.js";

const MAX_HTML_BYTES = "16mb";

export function createFileRouter(catalog: FileCatalog): Router {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/", (_request, response) => {
    response.json(catalog.list());
  });

  router.get("/:id", (request, response) => {
    const file = catalog.get(request.params.id);
    if (!file) {
      response.status(404).json({ error: "File not found." });
      return;
    }
    response.json(file);
  });

  router.post("/", express.json({ limit: MAX_HTML_BYTES }), async (request, response) => {
    const { kind, name: rawName, sourceUnitId, html } = request.body ?? {};
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if ((kind !== "sheet" && kind !== "html") || !name) {
      response.status(400).json({ error: "Choose Sheet or univer.html and provide a name." });
      return;
    }
    const id = randomUUID();
    if (kind === "sheet") {
      response.status(201).json(await catalog.createSheet(id, name, createSheetData(id, name)));
      return;
    }
    if (html !== undefined && typeof html !== "string") {
      response.status(400).json({ error: "HTML must be a string." });
      return;
    }
    if (
      html === undefined &&
      (typeof sourceUnitId !== "string" || catalog.get(sourceUnitId)?.kind !== "sheet")
    ) {
      response.status(400).json({ error: "Choose a source Sheet." });
      return;
    }
    const content: string = html ?? createHtmlSource(sourceUnitId);
    const invalid = validateHtml(content);
    if (invalid) {
      response.status(400).json({ error: invalid });
      return;
    }
    const filename = /\.univer\.html$/i.test(name) ? name : `${name}.univer.html`;
    response.status(201).json(catalog.createHtml(id, filename, content));
  });

  router.get("/:id/content", (request, response) => {
    const html = catalog.getHtml(request.params.id);
    if (html === null) {
      response.status(404).json({ error: "HTML file not found." });
      return;
    }
    // Serve source as JSON, never as executable same-origin HTML.
    response.json({ html });
  });

  router.put("/:id/content", express.json({ limit: MAX_HTML_BYTES }), (request, response) => {
    if (catalog.getHtml(request.params.id) === null) {
      response.status(404).json({ error: "HTML file not found." });
      return;
    }
    const html: unknown = request.body?.html;
    if (typeof html !== "string") {
      response.status(400).json({ error: "HTML must be a string." });
      return;
    }
    const invalid = validateHtml(html);
    if (invalid) {
      response.status(400).json({ error: invalid });
      return;
    }
    catalog.saveHtml(request.params.id, html);
    response.json({ saved: true });
  });

  return router;
}

function validateHtml(html: string): string | undefined {
  try {
    parseHtmlView(html);
    return undefined;
  } catch (error) {
    return String(error);
  }
}
