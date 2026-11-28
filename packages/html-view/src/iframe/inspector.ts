import type { HtmlViewLocale } from "../shared/locale.js";
import {
  bindingSelector,
  bindingAttributes,
  textBindingSelector,
} from "@univerkit/html-view-parser";
import {
  inspectBindingDeclaration,
  type InspectedBinding,
  type BindingUnitMetadata,
} from "../shared/inspection.js";
import { createInspectionNames } from "../shared/inspection-presentation.js";
import { createBindingPopover } from "./inspector-popover.js";

/** Metadata only: no cell reads, callback instrumentation, or access to the parent DOM. */
export function createHtmlBindingInspector(
  document: Document,
  options: {
    locale?: HtmlViewLocale;
    onChange: () => void;
    onSelect: (id: string | null) => void;
  },
) {
  let disposed = false;
  let picking = false;
  let sequence = 0;
  let previous = "";
  let selectedId: string | null = null;
  let all = false;
  let details = false;
  let relatedIds: readonly string[] = [];
  let hoveredId: string | null = null;
  let metadata: readonly BindingUnitMetadata[] = [];
  const names = (record: InspectedBinding) => {
    return record.binding
      ? createInspectionNames(metadata)(
          record.binding.reference.unitId,
          record.binding.reference.sheetId,
        )
      : undefined;
  };
  const highlighted = new Map<
    HTMLElement,
    {
      declarations: { property: string; value: string; priority: string }[];
      offset: string;
      offsetPriority: string;
      appliedOutline: string;
      tone: "all" | "selected" | "hover";
    }
  >();
  const identities = new WeakMap<Element, string>();
  let elements = new Map<string, HTMLElement>();
  const snapshot = (): readonly InspectedBinding[] => {
    if (disposed) throw new Error("HTML binding inspector is disposed.");
    const ids = new Map<string, number>();
    for (const el of document.querySelectorAll("[id]"))
      if (el.id) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
    elements = new Map();
    return [...document.querySelectorAll<HTMLElement>(bindingSelector)].map((element) => {
      let id = identities.get(element);
      if (!id) {
        id = `live-${sequence++}`;
        identities.set(element, id);
      }
      elements.set(id, element);
      const info = inspectBindingDeclaration(
        element.tagName.toLowerCase(),
        (name) => element.getAttribute(name) ?? undefined,
        !!element.parentElement?.closest(textBindingSelector),
      );
      return {
        id,
        elementId: element.id || null,
        tagName: element.tagName.toLowerCase(),
        ...info,
        diagnostics:
          element.id && (ids.get(element.id) ?? 0) > 1
            ? [...info.diagnostics, `Duplicate HTML ID: ${element.id}. ById requires a unique ID.`]
            : info.diagnostics,
      };
    });
  };
  const restore = (element: HTMLElement) => {
    const saved = highlighted.get(element);
    if (saved) {
      if (element.style.getPropertyValue("outline") === saved.appliedOutline) {
        element.style.removeProperty("outline");
        for (const { property, value, priority } of saved.declarations)
          element.style.setProperty(property, value, priority);
      }
      if (element.style.outlineOffset === "3px")
        element.style.setProperty("outline-offset", saved.offset, saved.offsetPriority);
    }
    highlighted.delete(element);
  };
  const mark = (element: HTMLElement, tone: "all" | "selected" | "hover") => {
    if (highlighted.get(element)?.tone === tone) return;
    restore(element);
    const saved = {
      declarations: Array.from(element.style)
        .filter((property) =>
          ["outline", "outline-width", "outline-style", "outline-color"].includes(property),
        )
        .map((property) => ({
          property,
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property),
        })),
      offset: element.style.getPropertyValue("outline-offset"),
      offsetPriority: element.style.getPropertyPriority("outline-offset"),
      appliedOutline: "",
      tone,
    };
    const outline =
      tone === "all"
        ? "2px dashed rgb(13, 148, 136)"
        : `${tone === "selected" ? 3 : 2}px solid rgb(79, 70, 229)`;
    element.style.setProperty("outline", outline, "important");
    saved.appliedOutline = element.style.getPropertyValue("outline");
    element.style.setProperty("outline-offset", "3px", "important");
    highlighted.set(element, saved);
  };
  const syncHighlights = () => {
    const wanted = new Map<HTMLElement, "all" | "selected" | "hover">();
    if (all) for (const element of elements.values()) wanted.set(element, "all");
    if (hoveredId && elements.has(hoveredId)) wanted.set(elements.get(hoveredId)!, "hover");
    for (const id of selectedId ? [selectedId] : relatedIds)
      if (elements.has(id)) wanted.set(elements.get(id)!, "selected");
    for (const element of highlighted.keys()) if (!wanted.has(element)) restore(element);
    for (const [element, tone] of wanted) mark(element, tone);
  };
  const popover = createBindingPopover(
    document,
    () => {
      selectedId = null;
      relatedIds = [];
      details = false;
      hoveredId = null;
      popover.hide();
      tooltip.hide();
      syncHighlights();
      options.onSelect(null);
    },
    "popover",
    options.locale,
  );
  const tooltip = createBindingPopover(document, () => {}, "tooltip", options.locale);
  const select = (id: string | null, showDetails: boolean) => {
    const records = snapshot();
    if (id !== null && !elements.has(id))
      throw new Error("The bound element is no longer present.");
    selectedId = id;
    relatedIds = [];
    hoveredId = null;
    tooltip.hide();
    details = showDetails && id !== null;
    syncHighlights();
    const element = id === null ? undefined : elements.get(id);
    element?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
    if (details)
      popover.show(
        records.find((record) => record.id === id)!,
        element!,
        names(records.find((record) => record.id === id)!),
      );
    else popover.hide();
  };
  const highlight = (id: string | null) => {
    all = false;
    select(id, false);
  };
  const clicked = (event: MouseEvent) => {
    if (!picking || popover.contains(event) || tooltip.contains(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = event.target instanceof document.defaultView!.Element ? event.target : null;
    const element = target?.closest<HTMLElement>(bindingSelector);
    if (!element) {
      select(null, false);
      options.onSelect(null);
      return;
    }
    snapshot();
    const id = identities.get(element)!;
    select(id, true);
    options.onSelect(id);
  };
  document.addEventListener("click", clicked, true);
  const keydown = (event: KeyboardEvent) => {
    if (
      event.key === "Escape" &&
      picking &&
      (details || hoveredId || selectedId || relatedIds.length)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      select(null, false);
      options.onSelect(null);
    }
  };
  document.addEventListener("keydown", keydown, true);
  const hover = (event: PointerEvent) => {
    if (!picking || details || popover.contains(event) || tooltip.contains(event)) return;
    const target = event.type === "pointerout" ? event.relatedTarget : event.target;
    const element =
      target instanceof document.defaultView!.Element
        ? target.closest<HTMLElement>(bindingSelector)
        : null;
    if (!element) {
      hoveredId = null;
      tooltip.hide();
      syncHighlights();
      return;
    }
    const records = snapshot();
    const id = identities.get(element)!;
    if (id === hoveredId) return;
    hoveredId = id;
    syncHighlights();
    const record = records.find((entry) => entry.id === id)!;
    tooltip.show(record, element, names(record));
  };
  document.addEventListener("pointerover", hover, true);
  document.addEventListener("pointerout", hover, true);
  const observer = new document.defaultView!.MutationObserver((mutations) => {
    if (disposed) return;
    const relevant = mutations.some(
      (mutation) =>
        mutation.type === "attributes" ||
        [...mutation.addedNodes, ...mutation.removedNodes].some(
          (node) =>
            node instanceof document.defaultView!.Element &&
            (node.matches(`${bindingSelector}, [id]`) ||
              node.querySelector(`${bindingSelector}, [id]`)),
        ),
    );
    if (!relevant) return;
    const records = snapshot();
    if (selectedId && !elements.has(selectedId)) {
      selectedId = null;
      details = false;
      popover.hide();
      options.onSelect(null);
    }
    if (hoveredId) {
      const hovered = records.find((record) => record.id === hoveredId);
      if (hovered) tooltip.show(hovered, elements.get(hoveredId)!, names(hovered));
      else {
        hoveredId = null;
        tooltip.hide();
      }
    }
    syncHighlights();
    if (details && selectedId)
      popover.show(
        records.find((record) => record.id === selectedId)!,
        elements.get(selectedId)!,
        names(records.find((record) => record.id === selectedId)!),
      );
    const next = JSON.stringify(records);
    if (next !== previous) {
      previous = next;
      options.onChange();
    }
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [...bindingAttributes, "id", "type", "multiple", "disabled"],
  });
  previous = JSON.stringify(snapshot());
  return {
    snapshot,
    setMetadata(value: readonly BindingUnitMetadata[]) {
      metadata = value;
      const records = snapshot();
      const selected = records.find((record) => record.id === selectedId);
      if (details && selected) popover.show(selected, elements.get(selected.id)!, names(selected));
      const hovered = records.find((record) => record.id === hoveredId);
      if (hovered) tooltip.show(hovered, elements.get(hovered.id)!, names(hovered));
    },
    highlightGroup(ids: readonly string[]) {
      snapshot();
      selectedId = null;
      relatedIds = ids;
      hoveredId = null;
      details = false;
      tooltip.hide();
      popover.hide();
      syncHighlights();
    },
    highlight,
    showDetails: (id: string | null) => select(id, true),
    highlightAll(enabled: boolean) {
      all = enabled;
      snapshot();
      syncHighlights();
    },
    setPicking(enabled: boolean) {
      if (disposed) throw new Error("HTML binding inspector is disposed.");
      picking = enabled;
      if (!enabled) {
        hoveredId = null;
        tooltip.hide();
        syncHighlights();
      }
    },
    dispose() {
      if (disposed) return;
      for (const element of highlighted.keys()) restore(element);
      popover.dispose();
      tooltip.dispose();
      disposed = true;
      observer.disconnect();
      elements.clear();
      document.removeEventListener("click", clicked, true);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("pointerover", hover, true);
      document.removeEventListener("pointerout", hover, true);
    },
  };
}
