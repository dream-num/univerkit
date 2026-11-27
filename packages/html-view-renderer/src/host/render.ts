import { inspectionMessages, resolveLocale, type HtmlViewLocale } from "../shared/locale.js";
export type { HtmlViewLocale } from "../shared/locale.js";
import { parseHtmlView } from "@univerkit/html-view";
import { createHtmlViewDocument } from "./document.js";
import {
  createBindingHost,
  type BindingEnginePort,
  type BindingHostState,
} from "./binding-host.js";
import { createBindingsPanel } from "./inspector-panel.js";
import type { BindingInspectOptions } from "../shared/inspection.js";
import iframeProgram from "../../.generated/iframe.js?raw";
import { viewStyle } from "./view-style.js";

export type { BindingEnginePort, BindingSourceState } from "./binding-host.js";
export type { BindingInspectOptions, BindingUnitMetadata } from "../shared/inspection.js";
export type HtmlViewPhase =
  | "connecting"
  | "ready"
  | "flushing-before-leave"
  | "paused"
  | "closed"
  | "disposed";
export interface HtmlViewState extends BindingHostState {
  readonly phase: HtmlViewPhase;
  readonly inspecting: boolean;
}
export interface RenderHtmlViewOptions {
  container: HTMLElement;
  locale?: HtmlViewLocale;
  html: string;
  loadEngine: (unitId: string, signal: AbortSignal) => Promise<BindingEnginePort>;
  policy?: { allowedOrigins?: readonly string[]; mediaSources?: readonly string[] };
  onError?: (error: Error) => void;
}
export interface HtmlViewHandle {
  readonly ready: Promise<void>;
  readonly inspect: {
    open(options?: BindingInspectOptions): Promise<void>;
    close(): Promise<void>;
  };
  subscribe(listener: (state: HtmlViewState) => void): () => void;
  flush(): Promise<void>;
  prepareToLeave(): Promise<void>;
  resume(): Promise<void>;
  dispose(): void;
}
const occupied = new WeakSet<HTMLElement>();

/** Mount one sandboxed HTML page. Engines returned by loadEngine belong to this view. */
export function renderHtmlView(options: RenderHtmlViewOptions): HtmlViewHandle {
  const { container } = options;
  const locale = resolveLocale(options.locale);
  if (occupied.has(container)) throw new Error("The container already has an HTML view.");
  const document = container.ownerDocument;
  const window = document.defaultView!;
  const token = window.crypto.randomUUID();
  const srcdoc = createHtmlViewDocument({
    template: parseHtmlView(options.html),
    runtime: iframeProgram,
    connectionId: token,
    locale,
    allowedOrigins: options.policy?.allowedOrigins ?? [],
    mediaSources: options.policy?.mediaSources ?? [],
  });
  const root = document.createElement("div");
  root.className = "univer-html-view";
  root.style.cssText = "width:100%;height:100%;min-width:0;min-height:0";
  const shadow = root.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = viewStyle;
  const layout = document.createElement("div");
  layout.className = "layout";
  const iframe = document.createElement("iframe");
  iframe.className = "html-frame";
  iframe.title = inspectionMessages(locale).frame;
  iframe.setAttribute("sandbox", "allow-scripts allow-forms");
  iframe.referrerPolicy = "no-referrer";
  layout.append(iframe);
  shadow.append(style, layout);
  let state: HtmlViewState = {
    phase: "connecting",
    inspecting: false,
    pending: { drafts: false, writes: false, confirmation: false },
    sources: [],
  };
  const listeners = new Set<(state: HtmlViewState) => void>();
  const report = (error: unknown) => {
    try {
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    } catch (callbackError) {
      console.error(callbackError);
    }
  };
  const notify = (listener: (state: HtmlViewState) => void) => {
    try {
      listener(state);
    } catch (error) {
      report(error);
    }
  };
  const update = (patch: Partial<HtmlViewState>) => {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) notify(listener);
  };
  const active = () => state.phase !== "closed" && state.phase !== "disposed";
  let host: ReturnType<typeof createBindingHost> | undefined;
  let panel: ReturnType<typeof createBindingsPanel> | undefined;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void ready.catch(() => {});
  let timeout: ReturnType<typeof setTimeout>;
  const disconnected = () => {
    if (!active()) return;
    clearTimeout(timeout);
    window.removeEventListener("message", connect);
    panel?.dispose();
    panel = undefined;
    update({ phase: "closed", inspecting: false });
    rejectReady(new Error("HTML view connection is closed."));
  };
  const connect = (event: MessageEvent) => {
    if (
      event.source !== iframe.contentWindow ||
      event.origin !== "null" ||
      event.data?.type !== "univer-html-view-connect" ||
      event.data.token !== token ||
      !event.ports[0]
    )
      return;
    if (!active() || host) {
      event.ports[0].close();
      return;
    }
    host = createBindingHost(event.ports[0], {
      loadEngine: options.loadEngine,
      onState: (value) => {
        if (active()) update(value);
      },
      onError: report,
      onClose: disconnected,
      onBindingsChanged: () => panel?.refresh(),
      onBindingSelected: (id) => {
        void panel?.selectLive(id);
      },
      onBindingCleared: () => {
        void panel?.selectLive(null);
      },
    });
    clearTimeout(timeout);
    update({ phase: "ready" });
    resolveReady();
  };
  occupied.add(container);
  window.addEventListener("message", connect);
  container.append(root);
  timeout = setTimeout(() => {
    if (host || !active()) return;
    const error = new Error("HTML view connection timed out.");
    rejectReady(error);
    disconnected();
    iframe.remove();
    report(error);
  }, 15_000);
  // Effect cleanup may run before this microtask; never start an already disposed page.
  queueMicrotask(() => {
    if (active()) iframe.srcdoc = srcdoc;
  });
  let operations = Promise.resolve();
  const run = (operation: () => Promise<void>) => {
    const task = operations.then(async () => {
      await ready;
      if (!active()) throw new Error("HTML view connection is closed.");
      await operation();
    });
    operations = task.catch(() => {});
    return task;
  };
  let inspection = Promise.resolve();
  const inspect = (operation: () => Promise<void>) => {
    const task = inspection.then(async () => {
      await ready;
      if (!active()) throw new Error("HTML view connection is closed.");
      await operation();
    });
    inspection = task.catch(() => {});
    return task;
  };
  return {
    ready,
    subscribe(listener) {
      listeners.add(listener);
      notify(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    inspect: {
      open: (settings = {}) =>
        inspect(async () => {
          if (panel?.isVisible()) return;
          panel?.dispose();
          await host!.setBindingMetadata([]);
          if (!active()) throw new Error("HTML view connection is closed.");
          panel = createBindingsPanel(
            layout,
            host!,
            (inspecting) => {
              if (active()) update({ inspecting });
            },
            settings,
            locale,
          );
          await panel.setVisible(true);
        }),
      close: () =>
        inspect(async () => {
          await panel?.setVisible(false);
        }),
    },
    flush: () =>
      run(async () => {
        if (state.phase === "paused") throw new Error("Resume the HTML view before flushing.");
        await host!.flush();
      }),
    prepareToLeave: () =>
      run(async () => {
        if (state.phase === "paused") return;
        update({ phase: "flushing-before-leave" });
        try {
          await host!.prepareToLeave();
          if (active()) update({ phase: "paused" });
        } catch (error) {
          if (active()) update({ phase: "ready" });
          throw error;
        }
      }),
    resume: () =>
      run(async () => {
        if (state.phase !== "paused") return;
        await host!.resume();
        if (active()) update({ phase: "ready" });
      }),
    dispose() {
      if (state.phase === "disposed") return;
      clearTimeout(timeout);
      window.removeEventListener("message", connect);
      update({ phase: "disposed", inspecting: false });
      listeners.clear();
      rejectReady(new Error("HTML view is disposed."));
      panel?.dispose();
      host?.dispose();
      root.remove();
      occupied.delete(container);
    },
  };
}
