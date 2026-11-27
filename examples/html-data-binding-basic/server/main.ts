import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { ErrorCode, type IAllowedRequest } from "@univerjs/protocol";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import { UniverExchangeEndpoint } from "@univerjs-pro/collaboration-exchange-endpoint";
import { UniverExchangeService } from "@univerjs-pro/collaboration-exchange-service";
import { LocalFileBlobStore } from "@univerjs-pro/collaboration-file-blob-local";
import { SQLiteFileDatabaseAdapter } from "@univerjs-pro/collaboration-file-database-sqlite";
import { UniverFileEndpoint } from "@univerjs-pro/collaboration-file-endpoint";
import { UniverFileService } from "@univerjs-pro/collaboration-file-service";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { createAiRouter } from "./ai-routes.js";
import { createAiSettings } from "./ai-settings.js";
import { DEMO_USER, ensureDemoFiles, getSnapshotName } from "./demo-files.js";
import { FileCatalog } from "./file-catalog.js";
import { createFileRouter } from "./file-routes.js";
import { handleErrors } from "./http-errors.js";
import { WorkbookReader } from "./workbook-reader.js";

// Configuration
const dataDir = resolve(process.env.DATA_DIR ?? ".data");
// Collaboration data, uploaded file metadata and HTML views share one SQLite file.
const filename = resolve(dataDir, "collaboration.sqlite");
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3030);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const context = { userID: DEMO_USER.userID };

// Storage
await mkdir(dataDir, { recursive: true });
const database = new SQLiteDatabaseAdapter({ filename });
const fileDatabase = new SQLiteFileDatabaseAdapter({ filename });
// Contents of uploaded files, such as spreadsheets being imported.
const blobStore = new LocalFileBlobStore({ directory: resolve(dataDir, "files") });

// Services
const service = new UniverCollabService({ dbAdapter: database });
// A Sheet's name lives in its Unit metadata: from the request, an imported file, or the snapshot.
service.use("createUnit", async ({ unit, customData, request }, next) => {
  const importName = typeof customData.importName === "string" ? customData.importName : undefined;
  unit.metadata.name ??= importName ?? getSnapshotName(request.snapshot) ?? unit.unitID;
  await next();
});
const fileService = new UniverFileService({ database: fileDatabase, blobStore });
const exchangeService = new UniverExchangeService({ collabService: service, fileService });
// An imported Sheet takes its name from the uploaded file.
exchangeService.use("import", async (exchange, next) => {
  const file = await fileService.getFile(exchange.request.fileID, exchange);
  if (file) exchange.customData.importName = file.name.replace(/\.[^.]+$/, "").trim() || file.name;
  await next();
});
const catalog = new FileCatalog(filename, service, context);
const workbooks = new WorkbookReader(service, context);
const aiSettings = createAiSettings(resolve(".env"));

// Transport and Endpoints
const transport = createNodeTransport();
transport.use(async (request, next) => {
  request.userID = DEMO_USER.userID;
  await next();
});
const endpoint = new UniverCollabEndpoint(service);
endpoint.use("connect", async (request, next) => {
  request.member.name = DEMO_USER.displayName;
  await next();
});
// Dependencies first: the Transport disposes in reverse order, so Exchange is released before File.
transport.register(endpoint);
transport.register(new UniverFileEndpoint(fileService, { maxUploadBytes: MAX_UPLOAD_BYTES }));
transport.register(new UniverExchangeEndpoint(exchangeService));

// HTTP
const app = express();
app.use("/api/files", createFileRouter(catalog));
app.use("/api/ai", createAiRouter({ catalog, settings: aiSettings, workbooks }));
// The SDK asks for effective actions even though this demo has no permissions UI or ACL.
app.post("/universer-api/authz/-/object/-/batch_allowed", express.json(), (request, response) => {
  const body = request.body as { requests?: IAllowedRequest[] };
  response.json({
    error: { code: ErrorCode.OK, message: "" },
    objectActions: (body.requests ?? []).map((item) => ({
      unitID: item.unitID,
      objectID: item.objectID,
      actions: item.actions.map((action) => ({ action, allowed: true })),
    })),
  });
});
app.use(express.static(fileURLToPath(new URL("../web", import.meta.url))));
app.use(handleErrors);
const server = createServer(app);
transport.attach(server);

// Lifecycle
async function dispose() {
  // Transport owns the Endpoints; the application releases the rest in reverse order of construction.
  await transport.dispose();
  if (server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      // A stalled request would otherwise keep the process alive.
      server.closeAllConnections();
    });
  }
  await workbooks.dispose();
  catalog.dispose();
  await exchangeService.dispose();
  await fileService.dispose();
  await service.dispose();
  await blobStore.dispose();
  await fileDatabase.dispose();
  await database.dispose();
}

try {
  await ensureDemoFiles(catalog);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  console.info(`Univer Data Binding: http://${host}:${port}`);
} catch (error) {
  await dispose();
  throw error;
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void dispose().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}
