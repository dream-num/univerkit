import { inspectionMessages, inspectionDiagnostic, type HtmlViewLocale } from "../shared/locale.js";
import { bindingAddress, type InspectedBinding } from "../shared/inspection.js";
import { bindingElementLabel, bindingKindLabel } from "../shared/inspection-presentation.js";

/** Keep inspection chrome out of author CSS, bindings and the parent document. */
export function createBindingPopover(
  document: Document,
  onClose: () => void,
  kind: "popover" | "tooltip" = "popover",
  locale: HtmlViewLocale = "en-US",
) {
  const t = inspectionMessages(locale);
  const window = document.defaultView!;
  let host: HTMLDivElement | undefined;
  let content: HTMLDivElement | undefined;
  let anchor: HTMLElement | undefined;
  let frame = 0;
  let lastPosition = "";
  let lastRecord = "";
  const position = () => {
    if (!host || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const margin = 8;
    host.style.maxWidth = `${Math.max(0, width - margin * 2)}px`;
    host.style.maxHeight = `${Math.max(0, height - margin * 2)}px`;
    const size = host.getBoundingClientRect();
    const x = Math.max(left + margin, Math.min(rect.left, left + width - size.width - margin));
    const below = rect.bottom + margin;
    const y = Math.max(
      top + margin,
      Math.min(
        below + size.height <= top + height - margin ? below : rect.top - size.height - margin,
        top + height - size.height - margin,
      ),
    );
    const next = `${x},${y}`;
    if (next !== lastPosition) {
      host.style.left = `${x}px`;
      host.style.top = `${y}px`;
      lastPosition = next;
    }
    frame = window.requestAnimationFrame(position);
  };
  const hide = () => {
    window.cancelAnimationFrame(frame);
    host?.remove();
    host = undefined;
    content = undefined;
    anchor = undefined;
    lastPosition = "";
    lastRecord = "";
  };
  return {
    contains(event: Event) {
      return !!host && event.composedPath().includes(host);
    },
    show(
      record: InspectedBinding,
      element: HTMLElement,
      names?: { unitName?: string; sheetName?: string },
    ) {
      const serialized = JSON.stringify([record, names]);
      if (host && anchor === element && serialized === lastRecord) return;
      if (!host) {
        host = document.createElement("div");
        host.className = `binding-${kind}-host`;
        host.setAttribute("popover", "manual");
        host.style.cssText =
          "all:initial;position:fixed!important;inset:auto;margin:0;padding:0;border:0;width:300px;overflow:auto;z-index:2147483647;background:transparent;color-scheme:light;";
        if (kind === "tooltip") {
          host.style.pointerEvents = "none";
          host.style.width = "260px";
        }
        const shadow = host.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = `
          *{box-sizing:border-box}
          .binding-popover,.binding-tooltip{background:#fff;color:#253247;border:1px solid #dce3ed;border-radius:12px;padding:14px;font:12px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 8px 28px #0f172a18,0 2px 6px #0f172a08;overflow-wrap:anywhere}
          .binding-tooltip{padding:12px;border-radius:9px}
          header{display:flex;gap:10px;justify-content:space-between;align-items:start;margin-bottom:12px}
          h3{margin:0;color:#475569;font:500 12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}
          .eyebrow{margin:0 0 3px;color:#94a3b8;font-size:9px;font-weight:650;letter-spacing:.09em}
          button{display:grid;place-items:center;flex:none;width:24px;height:24px;border:0;border-radius:5px;background:#f1f5f9;color:#64748b;font:18px/1 system-ui;cursor:pointer}
          button:hover{background:#e2e8f0;color:#334155}button:focus-visible{outline:2px solid #6366f1;outline-offset:2px}
          .source{padding:10px 12px;border:1px solid #e0e7ff;border-radius:8px;background:#f5f6ff}
          .source-address{display:flex;gap:8px;align-items:center;justify-content:space-between}
          .address{color:#4338ca;font:650 19px/1.25 ui-monospace,SFMono-Regular,Consolas,monospace}
          .kind{color:#7771bc;font-size:10px}
          .location{margin:6px 0 0;color:#64748b;font-size:11px;display:flex;flex-wrap:wrap;gap:3px 5px}
          .separator{color:#a5b4c7}
          .issue{margin:10px 0 0;padding:8px;border-radius:6px;background:#fff7ed;color:#9a3412;font-size:11px}
          .unavailable{margin:0;color:#64748b}
        `;
        content = document.createElement("div");
        content.lang = locale;
        content.className = `binding-${kind}`;
        content.setAttribute("role", kind === "popover" ? "dialog" : "tooltip");
        content.setAttribute("aria-label", t.source);
        shadow.append(style, content);
        host.addEventListener("click", (event) => event.stopPropagation());
        document.documentElement.append(host);
        host.showPopover?.();
      }
      anchor = element;
      lastRecord = serialized;
      content!.replaceChildren();
      const header = document.createElement("header");
      const title = document.createElement("div");
      const eyebrow = document.createElement("p");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = kind === "tooltip" ? t.dataSource : t.selectedElement;
      const heading = document.createElement("h3");
      heading.textContent = bindingElementLabel(record);
      title.append(eyebrow, heading);
      header.append(title);
      if (kind === "popover") {
        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "×";
        close.setAttribute("aria-label", t.closeDetails);
        close.onclick = onClose;
        header.append(close);
      }
      content!.append(header);
      if (record.binding) {
        const source = document.createElement("div");
        source.className = "source";
        const row = document.createElement("div");
        row.className = "source-address";
        const address = document.createElement("span");
        address.className = "address";
        address.textContent = bindingAddress(record.binding);
        const type = document.createElement("span");
        type.className = "kind";
        type.textContent = bindingKindLabel(record, locale);
        row.append(address, type);
        const location = document.createElement("p");
        location.className = "location";
        const workbook = document.createElement("span");
        workbook.textContent = names?.unitName || t.workbook;
        const separator = document.createElement("span");
        separator.className = "separator";
        separator.textContent = "/";
        separator.setAttribute("aria-hidden", "true");
        const sheet = document.createElement("span");
        sheet.textContent = names?.sheetName || t.sheet;
        location.append(workbook, separator, sheet);
        source.append(row, location);
        content!.append(source);
      } else {
        const text = document.createElement("p");
        text.className = "unavailable";
        text.textContent = t.parseFailed;
        content!.append(text);
      }
      for (const diagnostic of record.diagnostics) {
        const text = document.createElement("p");
        text.className = "issue";
        text.textContent = inspectionDiagnostic(diagnostic, locale);
        content!.append(text);
      }
      window.cancelAnimationFrame(frame);
      position();
    },
    hide,
    dispose: hide,
  };
}
