import { inspectionMessages, type HtmlViewLocale } from "../shared/locale.js";
import { createInspectionIcon } from "./inspection-icons.js";
import type { BindingUnitMetadata, BindingInspectOptions } from "../shared/inspection.js";
import { bindingAddress, type InspectedBinding } from "../shared/inspection.js";
import {
  bindingElementLabel,
  bindingKindLabel,
  createInspectionNames,
} from "../shared/inspection-presentation.js";

interface BindingView {
  highlightBindingGroup(ids: readonly string[]): Promise<void>;
  setBindingMetadata(metadata: readonly BindingUnitMetadata[]): Promise<void>;
  inspectBindings(): Promise<readonly InspectedBinding[]>;
  highlightBinding(id: string | null): Promise<void>;
  showBindingDetails(id: string | null): Promise<void>;
  highlightAllBindings(enabled: boolean): Promise<void>;
  setBindingPicking(enabled: boolean): Promise<void>;
}

export function createBindingsPanel(
  container: HTMLElement,
  view: BindingView,
  onVisibility: (visible: boolean) => void,
  options: BindingInspectOptions,
  locale: HtmlViewLocale = "en-US",
) {
  const t = inspectionMessages(locale);
  const document = container.ownerDocument;
  const window = document.defaultView!;
  let abort = new AbortController();
  let live: readonly InspectedBinding[] = [];
  let ready = false;
  let visible = false;
  let all = false;
  let disposed = false;
  let selectedId: string | null = null;
  let targetKey: string | null = null;
  let revision = 0;
  let interaction = 0;
  let commands = Promise.resolve();
  let animationFrame = 0;
  const metadata = new Map<string, BindingUnitMetadata>();
  let metadataLoading = new Set<string>();
  const panel = document.createElement("section");
  panel.id = "binding-inspector";
  panel.className = "shell-ui binding-inspector";
  panel.setAttribute("aria-label", t.inspector);
  panel.hidden = true;
  panel.lang = locale;
  panel.innerHTML = `<div class="binding-heading">
    <button type="button" class="binding-all" data-all aria-pressed="false" aria-label="${t.highlightElements}"><span class="binding-all-icon" aria-hidden="true"></span>${t.highlightAll}</button>
    <button type="button" class="binding-refresh" data-refresh aria-label="${t.refresh}" title="${t.refreshTitle}">↻</button>
    <p class="binding-count" role="status" aria-live="polite"></p>
    </div>
    <p class="binding-error" role="alert" hidden></p>
    <div class="binding-cards"></div>`;
  container.prepend(panel);
  const $ = <T extends HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const element = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label: string, click: () => void) => {
    const node = element("button", "binding-node", label);
    node.type = "button";
    node.onclick = click;
    return node;
  };
  const message = () => {
    if (disposed || !visible) return;
    $(".binding-error").textContent = t.updateFailed;
    $(".binding-error").hidden = false;
  };
  const label = bindingElementLabel;
  const key = (record: InspectedBinding) =>
    record.binding
      ? JSON.stringify([
          record.binding.reference.unitId,
          record.binding.reference.sheetId,
          record.binding.kind === "range" ? "range" : "cell",
          bindingAddress(record.binding),
        ])
      : null;
  // Serialize iframe commands; a late inspection request must not reopen a closed view.
  const syncInspection = () => {
    const current = ++interaction;
    commands = commands
      .catch(() => {})
      .then(async () => {
        if (current !== interaction) return;
        await view.setBindingPicking(visible);
        if (current !== interaction) return;
        if (!visible) {
          await view.highlightBinding(null);
          return;
        }
        await view.highlightAllBindings(all);
        if (current !== interaction) return;
        if (selectedId) await view.showBindingDetails(selectedId);
        else if (targetKey)
          await view.highlightBindingGroup(
            live.filter((record) => key(record) === targetKey).map((record) => record.id),
          );
        else await view.highlightBindingGroup([]);
      })
      .catch(message);
    return commands;
  };
  const select = (record: InspectedBinding) => {
    selectedId = record.id;
    targetKey = key(record);
    render();
    syncInspection();
  };
  const drawLines = () => {
    if (!visible || disposed) return;
    for (const diagram of panel.querySelectorAll<HTMLElement>(".binding-diagram")) {
      const bounds = diagram.getBoundingClientRect();
      const svg = diagram.querySelector<SVGSVGElement>("svg")!;
      svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
      svg.replaceChildren();
      for (const node of diagram.querySelectorAll<HTMLElement>("[data-binding-id]")) {
        const target = [...diagram.querySelectorAll<HTMLElement>("[data-reference-key]")].find(
          (item) => item.dataset.referenceKey === node.dataset.elementKey,
        );
        if (!target) continue;
        const a = node.getBoundingClientRect();
        const b = target.getBoundingClientRect();
        const x = a.right - bounds.left,
          y = a.top + a.height / 2 - bounds.top;
        const tx = b.left - bounds.left,
          ty = b.top + b.height / 2 - bounds.top;
        const middle = (x + tx) / 2;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M${x} ${y} H${middle} V${ty} H${tx}`);
        path.classList.toggle("related", node.dataset.elementKey === targetKey);
        path.classList.toggle("selected", node.getAttribute("aria-pressed") === "true");
        svg.append(path);
      }
    }
  };
  const scheduleLines = () => {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(drawLines);
  };
  const resize = new window.ResizeObserver(scheduleLines);
  resize.observe(panel);
  const recordButton = (record: InspectedBinding) => {
    const node = button(label(record), () => select(record));
    node.dataset.bindingId = record.id;
    node.dataset.elementKey = key(record) ?? "";
    const related = key(record) !== null && key(record) === targetKey;
    node.setAttribute("aria-pressed", String(selectedId ? record.id === selectedId : related));
    node.dataset.related = String(related);
    node.title = bindingKindLabel(record, locale);
    node.append(
      element(
        "small",
        "binding-node-kind",
        record.binding ? bindingKindLabel(record, locale) : t.invalid,
      ),
    );
    if (record.diagnostics.length) node.append(element("small", "binding-issue", t.issue));
    return node;
  };
  const render = () => {
    const focused = panel.querySelector<HTMLElement>(".binding-node:focus");
    const focusId = focused?.dataset.bindingId;
    const focusKey = focused?.dataset.referenceKey;
    const names = createInspectionNames([...metadata.values()]);
    const selected = live.find((record) => record.id === selectedId);
    if (selected) targetKey = key(selected);
    else selectedId = null;
    if (targetKey && !live.some((record) => key(record) === targetKey)) targetKey = null;
    container.classList.toggle("binding-layout", visible);
    $("[data-all]").setAttribute("aria-label", all ? t.cancelHighlight : t.highlightElements);
    $("[data-all]").setAttribute("aria-pressed", String(all));
    $<HTMLButtonElement>("[data-all]").disabled = !ready || live.length === 0;
    const issues = live.filter((record) => record.diagnostics.length).length;
    $(".binding-count").textContent = ready
      ? `${t.elements(live.length)}${issues ? ` · ${t.issues(issues)}` : ""}`
      : t.loading;
    const cards = $(".binding-cards");
    cards.replaceChildren();
    const groups = new Map<string, Map<string, Map<string, InspectedBinding[]>>>();
    for (const record of live) {
      if (!record.binding) continue;
      const { unitId, sheetId } = record.binding.reference;
      let unit = groups.get(unitId);
      if (!unit) groups.set(unitId, (unit = new Map()));
      let sheet = unit.get(sheetId);
      if (!sheet) unit.set(sheetId, (sheet = new Map()));
      const address = `${record.binding.kind === "range" ? "range" : "cell"}:${bindingAddress(record.binding)}`;
      const matches = sheet.get(address) ?? [];
      matches.push(record);
      sheet.set(address, matches);
    }
    for (const [unitId, sheets] of groups) {
      const card = element("section", "binding-unit-card");
      card.dataset.unitId = unitId;
      const heading = element("header", "binding-unit-heading");
      heading.append(
        createInspectionIcon(document, "workbook"),
        element("h3", "", names(unitId, [...sheets.keys()][0]!).unitName),
      );
      card.append(heading);
      for (const [sheetId, targets] of sheets) {
        const section = element("div", "binding-sheet");
        section.dataset.sheetId = sheetId;
        const display = names(unitId, sheetId);
        const sheetHeading = element("div", "binding-sheet-heading");
        sheetHeading.append(
          createInspectionIcon(document, "sheet"),
          element("h4", "", display.sheetName),
        );
        const heads = element("div", "binding-column-heads");
        heads.append(
          element("span", "binding-kind", t.pageElement),
          element("span", "binding-kind", t.reference),
        );
        const diagram = element("div", "binding-diagram");
        const edges = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        edges.classList.add("binding-edges");
        edges.setAttribute("aria-hidden", "true");
        diagram.append(edges);
        let row = 1;
        for (const matches of targets.values()) {
          const address = bindingAddress(matches[0]!.binding!);
          const target = key(matches[0]!);
          for (const [index, record] of matches.entries()) {
            const node = recordButton(record);
            node.style.gridRow = String(row + index);
            node.style.gridColumn = "1";
            diagram.append(node);
          }
          const node = button(address, () => {
            targetKey = targetKey === target ? null : target;
            selectedId = null;
            render();
            syncInspection();
          });
          node.dataset.target = address;
          node.dataset.referenceKey = target!;
          node.setAttribute("aria-pressed", String(targetKey === target));
          node.setAttribute(
            "aria-label",
            `${display.sheetName} ${address} · ${t.elements(matches.length)}`,
          );
          node.style.gridRow = `${row} / span ${matches.length}`;
          node.style.gridColumn = "3";
          node.append(
            element("small", "", matches[0]!.binding!.kind === "range" ? t.range : t.cell),
          );
          diagram.append(node);
          row += matches.length;
        }
        section.append(sheetHeading, heads, diagram);
        card.append(section);
      }
      cards.append(card);
    }
    const invalid = live.filter((record) => !record.binding);
    if (invalid.length) {
      const card = element("section", "binding-unit-card binding-invalid");
      card.append(element("h3", "binding-unit-heading", t.invalidDeclarations));
      for (const record of invalid) card.append(recordButton(record));
      cards.append(card);
    }
    if (!live.length) cards.append(element("p", "binding-empty", ready ? t.empty : t.loading));
    if (focusId || focusKey) {
      const next = [...panel.querySelectorAll<HTMLElement>(".binding-node")].find((node) =>
        focusId ? node.dataset.bindingId === focusId : node.dataset.referenceKey === focusKey,
      );
      next?.focus({ preventScroll: true });
    }
    scheduleLines();
  };
  const refresh = async () => {
    if (!visible || disposed) return;
    const current = ++revision;
    try {
      const records = await view.inspectBindings();
      if (disposed || !visible || current !== revision) return;
      live = records;
      for (const record of records) {
        const unitId = record.binding?.reference.unitId;
        if (!options.loadMetadata || !unitId || metadata.has(unitId) || metadataLoading.has(unitId))
          continue;
        metadataLoading.add(unitId);
        const batch = metadataLoading;
        const signal = abort.signal;
        void Promise.resolve()
          .then(() => options.loadMetadata!(unitId, signal))
          .then((value) => {
            if (disposed || !visible || batch !== metadataLoading) return;
            if (value.unitId !== unitId) throw new Error("Metadata does not match the request.");
            metadata.set(unitId, value);
            render();
            return view.setBindingMetadata([...metadata.values()]);
          })
          .catch(() => {
            if (disposed || !visible || signal.aborted || batch !== metadataLoading) return;
            $(".binding-error").textContent = t.namesUnavailable;
            $(".binding-error").hidden = false;
          });
      }
      ready = true;
      $(".binding-error").hidden = true;
      const groupSelected = !selectedId && targetKey !== null;
      render();
      if (groupSelected) void syncInspection();
    } catch (error) {
      if (current === revision) {
        if (!ready) $(".binding-count").textContent = t.unavailable;
        message();
      }
    }
  };
  const setVisible = async (enabled: boolean) => {
    if (disposed || enabled === visible) return;
    visible = enabled;
    all = enabled;
    selectedId = null;
    targetKey = null;
    panel.hidden = !enabled;
    abort.abort();
    abort = new AbortController();
    onVisibility(enabled);
    if (enabled) {
      ready = false;
      metadata.clear();
      metadataLoading = new Set();
      live = [];
      $(".binding-error").hidden = true;
      await refresh();
    } else revision++;
    render();
    await syncInspection();
  };
  $("[data-refresh]").onclick = () => {
    abort.abort();
    abort = new AbortController();
    metadataLoading = new Set();
    void refresh();
  };
  $("[data-all]").onclick = () => {
    all = !all;
    render();
    syncInspection();
  };
  return {
    setVisible,
    isVisible: () => visible,
    refresh: () => {
      void refresh();
    },
    async selectLive(id: string | null) {
      if (!visible || disposed) return;
      selectedId = id;
      targetKey = null;
      await refresh();
    },
    dispose() {
      disposed = true;
      visible = false;
      abort.abort();
      interaction++;
      container.classList.remove("binding-layout");
      revision++;
      resize.disconnect();
      window.cancelAnimationFrame(animationFrame);
      panel.remove();
    },
  };
}
