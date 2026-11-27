import { randomUUID } from "node:crypto";
import express from "express";
import multer from "multer";
import { importBufferToSnapshot } from "@univerjs-pro/exchange-node";
import type { IUniverCollabService } from "@univerjs-pro/collaboration-service";
import { UniverInstanceType } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";
import type { ExampleFile } from "../shared/files.js";

export function createImportRouter(options: {
  service: IUniverCollabService;
  userID: string;
  insertFile: (id: string, name: string, kind: "sheet") => ExampleFile;
}): express.Router {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 1, fieldSize: 4096 },
  });
  router.post("/", upload.single("file"), async (request, response) => {
    // A text field preserves Unicode names across multipart filename encodings.
    const name = request.body?.name ?? request.file?.originalname;
    if (!request.file || typeof name !== "string" || !/\.(xlsx?|csv|tsv)$/i.test(name)) {
      response.status(400).json({ error: "Choose an XLS, XLSX, CSV, or TSV file." });
      return;
    }
    if (!request.file.size) {
      response.status(400).json({ error: "The selected file is empty." });
      return;
    }
    const id = randomUUID();
    let imported;
    try {
      imported = await importBufferToSnapshot(request.file.buffer, {
        type: UniverInstanceType.UNIVER_SHEET,
        fileName: name,
        unitId: id,
        minSheetRowCount: 100,
        minSheetColumnCount: 26,
      });
    } catch (error) {
      response.status(422).json({
        error: `Could not import the file: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    const created = await options.service.createUnitFromSnapshot(
      {
        snapshot: { ...imported.snapshot, unitID: id, type: UniverType.UNIVER_SHEET, rev: 1 },
        sheetBlocks: [...imported.sheetBlocks],
      },
      { userID: options.userID },
    );
    if (created.status !== "created") throw new Error("Imported Sheet ID already exists.");
    response.status(201).json(options.insertFile(id, name, "sheet"));
  });
  router.use(
    (
      error: Error,
      _request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      if (!(error instanceof multer.MulterError)) return next(error);
      response.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        error:
          error.code === "LIMIT_FILE_SIZE" ? "Choose a file smaller than 25 MiB." : error.message,
      });
    },
  );
  return router;
}
