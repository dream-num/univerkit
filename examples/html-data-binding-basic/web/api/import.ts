import { ErrorCode, FileSource, UniverType } from "@univerjs/protocol";

// The server mounts the File and Exchange Endpoints under this prefix; see `server/main.ts`.
const API_PREFIX = "/universer-api";
const IMPORT_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 750;
const UNIT_OUTPUT_TYPE = 1;
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const IMPORT_ACCEPT = ".xls,.xlsx,.csv,.tsv";

/**
 * Imports a spreadsheet as a new collaborative Sheet: upload the file, start an Exchange import
 * task, and poll the task until it reports the new Unit.
 */
export async function importSheet(
  file: File,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  if (!/\.(xlsx?|csv|tsv)$/i.test(file.name))
    throw new Error("Choose an XLS, XLSX, CSV, or TSV file.");
  if (file.size > MAX_IMPORT_BYTES) throw new Error("Choose a file smaller than 25 MiB.");
  if (!file.size) throw new Error("The selected file is empty.");
  const timeout = AbortSignal.timeout(IMPORT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const body = new FormData();
    body.append("file", file);
    const query = new URLSearchParams({
      size: String(file.size),
      source: String(FileSource.HttpImport),
      flate: "false",
    });
    const uploaded = await exchangeRequest<{ FileId: string }>(
      `${API_PREFIX}/stream/file/upload?${query}`,
      { method: "POST", body, signal },
      "File upload",
    );
    const created = await exchangeRequest<{ taskID: string }>(
      `${API_PREFIX}/exchange/${UniverType.UNIVER_SHEET}/import`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileID: uploaded.FileId, outputType: UNIT_OUTPUT_TYPE }),
        signal,
      },
      "Starting import",
    );
    while (true) {
      const task = await exchangeRequest<{
        status: "pending" | "done" | "failed";
        import?: { unitID: string };
      }>(
        `${API_PREFIX}/exchange/task/${encodeURIComponent(created.taskID)}`,
        { signal },
        "Checking import",
      );
      if (task.status === "done") {
        const unitID = task.import?.unitID;
        if (typeof unitID !== "string" || !unitID.trim())
          throw new Error("The import completed without creating a Sheet.");
        return unitID;
      }
      if (task.status !== "pending")
        throw new Error(
          task.status === "failed"
            ? "Could not import the file."
            : "The server returned an invalid import status.",
        );
      await waitForNextPoll(signal);
    }
  } catch (error) {
    if (signal.aborted && signal.reason?.name === "TimeoutError")
      throw new Error(
        "Import timed out. The server may still finish it; refresh the file list before importing again.",
      );
    if (signal.aborted) throw signal.reason;
    throw error;
  }
}

async function exchangeRequest<T>(url: string, init: RequestInit, operation: string): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      response.status === 413
        ? "Choose a file smaller than 25 MiB."
        : result.error?.message || `${operation} failed (HTTP ${response.status}).`,
    );
  // Exchange answers HTTP 200 for domain failures, including failures reported by task polling.
  if (result.error?.code !== ErrorCode.OK)
    throw new Error(result.error?.message || `${operation} failed.`);
  return result as T;
}

function waitForNextPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, POLL_INTERVAL_MS);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
