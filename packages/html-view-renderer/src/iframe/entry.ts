import { resolveLocale } from "../shared/locale.js";
import { createHtmlBindingInspector } from "./inspector.js";
import { createBindingEngineClient } from "./client.js";
import type { BindingEngineClient } from "../shared/client-types.js";
import { mountHtmlView } from "./dom.js";

declare global {
  interface Window {
    readonly univerBinding: BindingEngineClient;
  }
}

// This entry is bundled as a classic inline script and runs before author scripts.
const locale = resolveLocale(document.currentScript?.getAttribute("data-univer-locale"));
const token = document.currentScript?.getAttribute("data-univer-connection");
if (!token) throw new Error("HTML view connection is missing.");
const channel = new MessageChannel();
let mounted: ReturnType<typeof mountHtmlView> | undefined;
let previousInert = false;
let pagePaused = false;
let inspector: ReturnType<typeof createHtmlBindingInspector> | undefined;
const connection = createBindingEngineClient(channel.port1, {
  elementBindings: () => mounted,
  inspector: () =>
    (inspector ??= createHtmlBindingInspector(document, {
      locale,
      onChange: () => connection.notify("bindingsChanged", null),
      onSelect: (id) => connection.notify("bindingSelected", id),
    })),
  flushDrafts: async () => {
    await mounted?.flush();
  },
  setPaused(paused) {
    if (paused && !pagePaused) previousInert = document.documentElement.inert;
    if (paused || pagePaused) document.documentElement.inert = paused || previousInert;
    pagePaused = paused;
  },
  onClose() {
    mounted?.dispose();
    inspector?.dispose();
  },
  onError(error) {
    console.error("HTML binding subscriber failed.", error);
  },
});
Object.defineProperty(window, "univerBinding", { value: Object.freeze(connection.client) });
parent.postMessage({ type: "univer-html-view-connect", token }, "*", [channel.port2]);
mounted = mountHtmlView({
  document,
  client: connection.dataClient,
  onError: (message) => connection.notify("error", message),
  onPendingChanges: (pending) => connection.notify("drafts", pending),
});
window.addEventListener("pagehide", () => connection.dispose(), { once: true });
