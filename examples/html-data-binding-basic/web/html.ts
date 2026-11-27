import { BindingEngine } from "@univerkit/binding-engine";
import { renderHtmlView } from "@univerkit/html-view-renderer/render";
import { collaborationConfig } from "./config.js";
import type { CollaborationStatus } from "@univerjs-pro/collaboration-client";

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
  const view = renderHtmlView({
    container: preview,
    locale: new URLSearchParams(location.search).get("lang") === "zh-CN" ? "zh-CN" : "en-US",
    html,
    policy: { allowedOrigins: ["https://cdn.jsdelivr.net"] },
    onError: (error) => options.onError(error.message),
    async loadEngine(unitId, signal) {
      const engine = new BindingEngine({
        unitId,
        collaborationClientConfig: collaborationConfig(),
      });
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
    },
  });
  let pending = false;
  view.subscribe((state) => {
    pending = Object.values(state.pending).some(Boolean);
    options.onStatus(state.sources.flatMap((source) => (source.status ? [source.status] : [])));
    options.onInspectChanged(state.inspecting);
  });
  void view.ready.catch((error: unknown) => options.onError(String(error)));
  return {
    ...view,
    container: preview,
    hasPendingChanges: () => pending,
    dispose() {
      view.dispose();
      preview.remove();
    },
  };
}
