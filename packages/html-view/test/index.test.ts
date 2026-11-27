import { expect, it } from "vitest";
import { parseCellReference, parseHtmlView, getHtmlViewUnitIds } from "../src/index.js";

it("parses encoded IDs, normalizes A1 and groups multiple Units", () => {
  expect(parseCellReference("a%3Ab%25:s%3A1:aa7")).toEqual({
    unitId: "a:b%",
    sheetId: "s:1",
    row: 6,
    col: 26,
  });
  const view = parseHtmlView(
    '<p data-univer-cell-text="u:s:A1"></p><input type="number" data-univer-cell-model="u:s:A1"><p data-univer-cell-text="v:s:B2"></p>',
  );
  expect(getHtmlViewUnitIds(view)).toEqual(["u", "v"]);
  expect(view.bindings.map((b) => b.kind)).toEqual(["text", "model", "text"]);
  expect(view.html).toContain('data-univer-binding="2"');
});
it.each(["a:b", "a:b:A0", "a:b:A1:B2", "a:b:A1+1", "a:b:$A$1", "%:b:A1", ":b:A1"])(
  "rejects invalid references: %s",
  (value) => {
    expect(() => parseCellReference(value)).toThrow();
  },
);
it("reports the element and attribute and rejects incompatible bindings", () => {
  expect(() => parseHtmlView('<div data-univer-cell-model="u:s:A1"></div>')).toThrow(
    "cell-model requires",
  );
  expect(() => parseHtmlView('<input type="file" data-univer-cell-model="u:s:A1">')).toThrow(
    "input type",
  );
  expect(() => parseHtmlView('<select multiple data-univer-cell-model="u:s:A1"></select>')).toThrow(
    "single select",
  );
  expect(() => parseHtmlView('<p data-univer-cell-text="bad"></p>')).toThrow(
    "<p> at line 1: data-univer-cell-text",
  );
  expect(() =>
    parseHtmlView(
      '<p data-univer-cell-text="u:s:A1"><span data-univer-cell-text="u:s:A2"></span></p>',
    ),
  ).toThrow("contain another");
});
it("preserves HTML, CSS, JavaScript and custom attributes", () => {
  const source =
    '<style>.x{color:red}</style><script>window.loaded=true</script><div onclick="run()" data-custom="yes" data-univer-binding="99" data-univer-cell-text="u:s:A1"></div>';
  const view = parseHtmlView(source);
  expect(view.html).toContain("<script>window.loaded=true</script>");
  expect(view.html).toContain('onclick="run()"');
  expect(view.html).toContain('data-custom="yes"');
  expect(view.html).not.toContain('binding="99"');
  expect(view.html).toContain("<style>.x{color:red}</style>");
});
it("accepts JavaScript-only pages and does not impose resource budgets", () => {
  expect(parseHtmlView("<script>window.univerBinding.getCellState(ref)</script>").bindings).toEqual(
    [],
  );
  const large = "<p>" + "x".repeat(1024 * 1024) + "</p>";
  const many = '<span data-univer-cell-text="u:s:A1"></span>'.repeat(101);
  expect(parseHtmlView(large + many).bindings).toHaveLength(101);
});
it("preserves native form constraints and case-insensitive input types", () => {
  const view = parseHtmlView(
    '<input type="NUMBER" required min="0" data-univer-cell-model="u:s:A1">',
  );
  expect(view.html).toContain("required");
});
it("rejects text bindings on void elements that cannot display a value", () => {
  expect(() => parseHtmlView('<br data-univer-cell-text="u:s:A1">')).toThrow("content element");
});

it("parses existing attributes alongside new subscriptions, encoded ranges and mixed Units", () => {
  const view = parseHtmlView(
    `<span data-univer-cell-text="u:s:A1"></span><input data-univer-cell-model="u:s:A2"><div id="cell" data-univer-cell-subscribe="u:s:B2"></div><div id="rows" data-univer-range-subscribe="v%3A1:t%25:aa2:ab5"></div>`,
  );
  expect(view.bindings.map((binding) => binding.kind)).toEqual(["text", "model", "cell", "range"]);
  expect(view.bindings[3]!.reference).toEqual({
    unitId: "v:1",
    sheetId: "t%",
    range: { startRow: 1, endRow: 4, startColumn: 26, endColumn: 27 },
  });
  expect(getHtmlViewUnitIds(view)).toEqual(["u", "v:1"]);
});
it.each(["u:s:B2:A3", "u:s:A3:B2", "u:s:A1", "u:s:A0:B1", "u:s:A1:B2:C3", "%:s:A1:B2"])(
  "rejects invalid range %s",
  (ref) => {
    expect(() => parseHtmlView(`<div data-univer-range-subscribe="${ref}"></div>`)).toThrow();
  },
);
it("rejects mixed bindings and data nested inside text", () => {
  expect(() =>
    parseHtmlView(
      '<div data-univer-cell-subscribe="u:s:A1" data-univer-range-subscribe="u:s:A1:B2"></div>',
    ),
  ).toThrow("one binding");
  expect(() =>
    parseHtmlView('<div data-univer-cell-subscribe="u:s:A1" data-univer-cell-text="u:s:A1"></div>'),
  ).toThrow("one binding");
  expect(() =>
    parseHtmlView(
      '<div data-univer-cell-text="u:s:A1"><div data-univer-range-subscribe="u:s:A1:B2"></div></div>',
    ),
  ).toThrow("contain another");
});
