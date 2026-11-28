// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createHtmlBindingInspector } from "../src/iframe/inspector.js";
let inspector: ReturnType<typeof createHtmlBindingInspector> | undefined;
const tick = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
afterEach(() => {
  inspector?.dispose();
  document.body.replaceChildren();
});
function setup(html: string) {
  document.body.innerHTML = html;
  const onChange = vi.fn();
  const onSelect = vi.fn();
  inspector = createHtmlBindingInspector(document, { onChange, onSelect });
  return { onChange, onSelect };
}
it("keeps live identities stable, reports changes only for declarations and ignores callback children", async () => {
  const { onChange } = setup(
    '<div id="list" data-univer-range-subscribe="u:s:A2:G81"><article>Ada</article></div>',
  );
  const initial = inspector!.snapshot();
  expect(initial).toHaveLength(1);
  document.querySelector("article")!.textContent = "Lin";
  await tick();
  expect(onChange).not.toHaveBeenCalled();
  document.getElementById("list")!.setAttribute("data-univer-range-subscribe", "v:s:B2:C3");
  await tick();
  expect(onChange).toHaveBeenCalledOnce();
  expect(inspector!.snapshot()[0]!.id).toBe(initial[0]!.id);
  document.getElementById("list")!.outerHTML =
    '<div id="list" data-univer-cell-subscribe="u:s:A1"></div>';
  await tick();
  expect(inspector!.snapshot()[0]!.id).not.toBe(initial[0]!.id);
});
it("collects malformed declarations and duplicate IDs without throwing", () => {
  setup(
    '<div id="x" data-univer-cell-subscribe="broken"></div><div id="x" data-univer-range-subscribe="u:s:A1:B2"></div>',
  );
  const records = inspector!.snapshot();
  expect(records[0]!.binding).toBeNull();
  expect(
    records.every((record) => record.diagnostics.some((message) => message.includes("Duplicate"))),
  ).toBe(true);
});
it("highlights a selected element and restores author styles on clearing and removal", async () => {
  setup(
    '<div id="x" style="outline: 1px dotted red !important; outline-offset: 5px" data-univer-cell-subscribe="u:s:A1"></div>',
  );
  const el = document.getElementById("x")!;
  const outline = el.style.outline;
  const [record] = inspector!.snapshot();
  inspector!.highlight(record!.id);
  expect(el.style.outline).not.toBe(outline);
  inspector!.highlight(null);
  expect(el.style.outline).toBe(outline);
  expect(el.style.getPropertyPriority("outline")).toBe("important");
  expect(el.style.outlineOffset).toBe("5px");
  inspector!.highlight(record!.id);
  el.remove();
  await tick();
  expect(el.style.outline).toBe(outline);
  expect(() => inspector!.highlight(record!.id)).toThrow("no longer present");
});
it("picks the declared ancestor without invoking its button, then restores ordinary interaction", () => {
  const { onSelect } = setup(
    '<div data-univer-range-subscribe="u:s:A1:B2"><button>Submit</button></div>',
  );
  const click = vi.fn();
  const button = document.querySelector("button")!;
  button.onclick = click;
  inspector!.setPicking(true);
  button.click();
  expect(click).not.toHaveBeenCalled();
  expect(onSelect).toHaveBeenCalledWith(inspector!.snapshot()[0]!.id);
  inspector!.setPicking(false);
  button.click();
  expect(click).toHaveBeenCalledOnce();
});
it("does not claim inert template children as live or retain observers after disposal", async () => {
  const { onChange } = setup(
    '<template><div data-univer-cell-subscribe="u:s:A1"></div></template>',
  );
  expect(inspector!.snapshot()).toEqual([]);
  inspector!.dispose();
  document.body.innerHTML = '<span data-univer-cell-text="u:s:A1"></span>';
  await tick();
  expect(onChange).not.toHaveBeenCalled();
  expect(() => inspector!.snapshot()).toThrow("disposed");
});
it("highlights all live declarations across Units and restores styles on cancellation, removal and disposal", async () => {
  setup(
    '<div id="a" style="outline:1px dashed red!important;outline-offset:7px" data-univer-cell-text="u:s:A1"></div><div id="b" data-univer-cell-subscribe="v:s:A1"></div>',
  );
  const a = document.getElementById("a")!;
  const original = a.style.outline;
  inspector!.highlightAll(true);
  expect(a.style.outline).toContain("2px dashed");
  expect(document.getElementById("b")!.style.outline).toContain("2px dashed");
  const added = document.createElement("div");
  added.setAttribute("data-univer-range-subscribe", "u:s:B2:C3");
  document.body.append(added);
  await tick();
  expect(added.style.outline).toContain("2px dashed");
  added.removeAttribute("data-univer-range-subscribe");
  await tick();
  expect(added.style.outline).toBe("");
  inspector!.highlightAll(false);
  expect(a.style.outline).toBe(original);
  expect(a.style.getPropertyPriority("outline")).toBe("important");
  expect(a.style.outlineOffset).toBe("7px");
  expect(document.getElementById("b")!.style.outline).toBe("");
  inspector!.highlightAll(true);
  a.style.setProperty("outline", "2px dotted purple", "important");
  inspector!.dispose();
  expect(a.style.outline).toContain("purple");
  expect(document.getElementById("b")!.style.outline).toBe("");
});
it("keeps a popup separate from author bindings, updates its reference, and clears it on removal", async () => {
  setup(
    '<div id="a" data-univer-cell-subscribe="u:s:A1"></div><div data-univer-cell-text="v:s:A1"></div>',
  );
  inspector!.setPicking(true);
  inspector!.highlightAll(true);
  const id = inspector!.snapshot()[0]!.id;
  inspector!.showDetails(id);
  const popup = () => document.querySelector(".binding-popover-host")?.shadowRoot;
  expect(popup()?.textContent).toContain("A1");
  expect(inspector!.snapshot()).toHaveLength(2);
  document.getElementById("a")!.setAttribute("data-univer-cell-subscribe", "u:other:B5");
  await tick();
  expect(popup()?.querySelector(".location")?.textContent).toContain("id: other");

  expect(popup()?.textContent).toContain("B5");
  popup()!.querySelector<HTMLButtonElement>("button")!.click();
  expect(popup()).toBeUndefined();
  // Closing details does not cancel a separate all-elements highlight mode.
  expect(document.getElementById("a")!.style.outline).toContain("2px dashed");
  inspector!.showDetails(id);
  document.getElementById("a")!.remove();
  await tick();
  expect(popup()).toBeUndefined();
  inspector!.highlightAll(false);
  expect(document.querySelector<HTMLElement>("[data-univer-cell-text]")!.style.outline).toBe("");
});
it("Escape dismisses local details and restores the selected element", () => {
  setup('<div data-univer-cell-subscribe="u:s:A1"></div>');
  inspector!.setPicking(true);
  inspector!.showDetails(inspector!.snapshot()[0]!.id);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(document.querySelector(".binding-popover-host")).toBeNull();
  expect(document.querySelector<HTMLElement>("[data-univer-cell-subscribe]")!.style.outline).toBe(
    "",
  );
});
it("restores separately authored outline longhands and mixed priorities", () => {
  setup(
    '<div id="a" data-univer-cell-text="u:s:A1" style="outline-width:2px!important;outline-style:dashed;outline-color:red!important;outline-offset:6px"></div>',
  );
  const el = document.getElementById("a")!;
  const properties = ["outline-width", "outline-style", "outline-color", "outline-offset"];
  const values = properties.map((property) => [
    el.style.getPropertyValue(property),
    el.style.getPropertyPriority(property),
  ]);
  inspector!.highlightAll(true);
  inspector!.highlightAll(false);
  expect(
    properties.map((property) => [
      el.style.getPropertyValue(property),
      el.style.getPropertyPriority(property),
    ]),
  ).toEqual(values);
});

it("renders names in a hover tooltip and clears hover before pinned details", () => {
  const { onSelect } = setup('<div id="a" data-univer-cell-text="u:s:A1"></div>');
  inspector!.setMetadata([
    { unitId: "u", name: "Budget", sheets: [{ sheetId: "s", name: "Overview" }] },
  ]);
  const element = document.getElementById("a")!;
  element.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  expect(document.querySelector(".binding-tooltip-host")).toBeNull();
  inspector!.setPicking(true);
  element.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  const tooltip = document.querySelector(".binding-tooltip-host")!;
  expect(tooltip.shadowRoot!.textContent).toContain("Budget");
  expect(tooltip.shadowRoot!.textContent).toContain("Overview");
  element.click();
  expect(document.querySelector(".binding-tooltip-host")).toBeNull();
  expect(document.querySelector(".binding-popover-host")).not.toBeNull();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(onSelect).toHaveBeenLastCalledWith(null);
});
it("highlights related elements while all-elements highlighting remains independent", () => {
  setup(
    '<div id="a" data-univer-cell-text="u:s:A1"></div><input id="b" data-univer-cell-model="u:s:A1"><div id="c" data-univer-cell-text="u:s:B1"></div>',
  );
  const records = inspector!.snapshot();
  inspector!.highlightGroup(records.slice(0, 2).map((record) => record.id));
  expect(document.getElementById("a")!.style.outline).toContain("3px solid");
  expect(document.getElementById("b")!.style.outline).toContain("3px solid");
  expect(document.getElementById("c")!.style.outline).toBe("");
  inspector!.highlightAll(true);
  inspector!.showDetails(records[0]!.id);
  expect(document.getElementById("c")!.style.outline).toContain("2px dashed");
  inspector!.highlight(null);
  expect(document.getElementById("a")!.style.outline).toBe("");
});

it("layers selection over all highlights and restores each level independently", () => {
  setup(
    '<div id="a" style="outline:1px dotted red;outline-offset:5px" data-univer-cell-text="u:s:A1"></div><div id="b" data-univer-cell-text="u:s:B1"></div>',
  );
  const a = document.getElementById("a")!;
  const b = document.getElementById("b")!;
  const original = [a.style.outline, a.style.outlineOffset];
  const [record] = inspector!.snapshot();
  inspector!.highlightAll(true);
  const base = a.style.outline;
  inspector!.showDetails(record!.id);
  expect(a.style.outline).toContain("3px solid");
  expect(b.style.outline).toBe(base);
  inspector!.highlightAll(false);
  expect(a.style.outline).toContain("3px solid");
  expect(b.style.outline).toBe("");
  inspector!.highlightAll(true);
  inspector!.showDetails(null);
  expect(a.style.outline).toBe(base);
  inspector!.highlightGroup([record!.id]);
  expect(a.style.outline).toContain("3px solid");
  inspector!.highlightGroup([]);
  expect(a.style.outline).toBe(base);
  inspector!.highlightAll(false);
  expect([a.style.outline, a.style.outlineOffset]).toEqual(original);
});

it("uses explicit ID fallbacks until names arrive, then shows names without duplicate IDs", () => {
  setup('<div data-univer-cell-text="private-workbook-id:private-sheet-id:A1"></div>');
  const [record] = inspector!.snapshot();
  inspector!.showDetails(record!.id);
  const content = () =>
    document.querySelector(".binding-popover-host")!.shadowRoot!.querySelector(".binding-popover")!
      .textContent;
  expect(content()).toContain("id: private-workbook-id");
  expect(content()).toContain("id: private-sheet-id");
  expect(content()).not.toContain("live-");
  inspector!.setMetadata([
    {
      unitId: "private-workbook-id",
      name: "   ",
      sheets: [{ sheetId: "private-sheet-id", name: "Overview" }],
    },
  ]);
  expect(content()).toContain("id: private-workbook-id");
  expect(content()).toContain("Overview");
  expect(content()).not.toContain("private-sheet-id");
  inspector!.setMetadata([
    {
      unitId: "private-workbook-id",
      name: "Budget",
      sheets: [{ sheetId: "private-sheet-id", name: "Overview" }],
    },
  ]);
  expect(content()).toContain("Budget");
  expect(content()).toContain("Overview");
  expect(content()).not.toContain("private-");
  inspector!.showDetails(null);
  inspector!.setPicking(true);
  document
    .querySelector("[data-univer-cell-text]")!
    .dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  const tooltip = document
    .querySelector(".binding-tooltip-host")!
    .shadowRoot!.querySelector('[role="tooltip"]')!;
  expect(tooltip.textContent).toContain("Budget");
  expect(tooltip.textContent).not.toContain("private-");
});
