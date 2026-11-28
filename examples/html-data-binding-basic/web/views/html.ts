import { BindingEngine } from "@univerkit/binding-engine";
import { renderHtmlView } from "@univerkit/html-view/render";
import type { CollaborationStatus } from "@univerjs-pro/collaboration-client";
import { getFile } from "../api/files.js";
import { collaborationConfig } from "../config.js";

export type HtmlView = ReturnType<typeof openHtml>;

export function openHtml(
  container: HTMLElement,
  html: string,
  options: {
    onStatus: (states: CollaborationStatus[]) => void;
    onError: (message: string) => void;
    onInspectChanged: (visible: boolean) => void;
  },
) {
  const preview = document.createElement("div");
  preview.className = "html-preview";
  container.append(preview);
  // The Engines this view loaded, so binding inspection can read sheet names without a server call.
  const engines = new Map<string, Promise<BindingEngine>>();
  const view = renderHtmlView({
    container: preview,
    locale: new URLSearchParams(location.search).get("lang") === "zh-CN" ? "zh-CN" : "en-US",
    html,
    policy: { allowedOrigins: ["https://cdn.jsdelivr.net"] },
    onError: (error) => options.onError(error.message),
    loadEngine(unitId, signal) {
      const loading = loadEngine(unitId, signal);
      engines.set(unitId, loading);
      return loading;
    },
  });
  let pending = false;
  view.subscribe((state) => {
    pending = Object.values(state.pending).some(Boolean);
    options.onStatus(state.sources.flatMap((source) => (source.status ? [source.status] : [])));
    options.onInspectChanged(state.inspecting);
  });
  void view.ready.catch((error: unknown) => options.onError(String(error)));

  function readSheets(engine: BindingEngine | undefined) {
    try {
      return engine?.getSheets() ?? [];
    } catch {
      // A released Engine has no sheets to report; inspection falls back to sheet IDs.
      return [];
    }
  }

  return {
    ...view,
    container: preview,
    hasPendingChanges: () => pending,
    /** Starts binding inspection with the Sheet name from the server and sheet names from its Engine. */
    openInspector() {
      return view.inspect.open({
        async loadMetadata(unitId, signal) {
          const [file, engine] = await Promise.all([
            getFile(unitId, signal),
            engines.get(unitId)?.catch(() => undefined),
          ]);
          return { unitId, name: file.name, sheets: readSheets(engine) };
        },
      });
    },
    dispose() {
      view.dispose();
      preview.remove();
    },
  };
}

async function loadEngine(unitId: string, signal: AbortSignal) {
  const engine = new BindingEngine({ unitId, collaborationClientConfig: collaborationConfig() });
  const abort = () => engine.dispose();
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    await engine.load();
    signal.throwIfAborted();
    return engine;
  } catch (error) {
    engine.dispose();
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
