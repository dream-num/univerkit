# Univer HTML View

[简体中文](README.zh-CN.md)

`@univerkit/html-view` parses declarative HTML cell bindings and returns a normalized HTML document plus binding metadata. Use it to validate an HTML view or inspect its declared workbook references. It preserves HTML, CSS, and JavaScript; it does not execute scripts, fetch workbook data, sanitize HTML, or create an isolated runtime.

For the overall design of HTML data binding and how the three packages divide the work, see the [HTML data binding overview](../html-view-renderer/docs/overview.zh-CN.md) (Simplified Chinese).

## Install

```sh
npm install --save-exact "@univerkit/html-view@rc" --registry=https://insider-npm-registry.univer.work/
```

The three data binding packages are released together, with internal dependencies pinned to that exact release version. Above, `@rc` selects the current rc release and `--save-exact` records the resolved version in your application; for another channel, replace `@rc` with the same exact release version for each package. Univer/Pro dependencies still use `^1.6.0`.

The parser can run in Node.js or a browser bundle without a collaboration server. The example below uses Node.js 24+ and requires only this package. To display live data and edit cells, separately install `@univerkit/html-view-renderer`; its bundled `docs/integration.md` contains a complete Vite application.

## Runnable parsing example

Save as `parse-view.mjs` and run `node parse-view.mjs`. This example uses illustrative IDs and does not load a workbook.

```js
import {
  parseHtmlView,
  parseCellReference,
  cellReferenceKey,
  getHtmlViewUnitIds,
  isHtmlViewFilename,
} from "@univerkit/html-view";

const unitId = "budget:2026";
const sheetId = "cash flow";
const address = [encodeURIComponent(unitId), encodeURIComponent(sheetId), "B7"].join(":");
const source = `<!doctype html><html><head><title>Budget</title></head><body>
  <p>Revenue: <span data-univer-cell-text="${address}">Loading...</span></p>
  <label>Revenue <input type="number" min="0" step="1" data-univer-cell-model="${address}"></label>
</body></html>`;
const page = parseHtmlView(source);
console.log(page.bindings.map(({ kind, reference }) => ({ kind, reference })));
// Two bindings: "text" and "model", both at row 6, col 1.
console.log(getHtmlViewUnitIds(page)); // ["budget:2026"]
console.log(parseCellReference(address));
// { unitId: "budget:2026", sheetId: "cash flow", row: 6, col: 1 }
console.log(cellReferenceKey(parseCellReference(address)));
// '["budget:2026","cash flow",6,1]'
console.log(isHtmlViewFilename("budget.univer.html")); // true
console.log(page.html); // Normalized document, including generated binding markers.
```

## HTML binding attributes

| Attribute                     | Direction        | Result in the renderer                                                             |
| ----------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `data-univer-cell-text`       | Cell → element   | Replace `textContent`; `null` becomes empty text.                                  |
| `data-univer-cell-model`      | Cell ↔ control   | Subscribe to values and submit valid edits.                                        |
| `data-univer-cell-subscribe`  | Cell → callback  | Subscribe automatically; receive state with `subscribeCellById(id, listener)`.     |
| `data-univer-range-subscribe` | Range → callback | Subscribe automatically; receive a matrix with `subscribeRangeById(id, listener)`. |

Put text bindings on dedicated value elements: updates replace all their text content, including child content. Initial placeholder text remains until data arrives. Do not nest bindings inside a text binding or put multiple binding attributes on one element. Automatically synchronized form controls require `data-univer-cell-model`; document metadata, scripts, styles, and void elements cannot carry bindings.

| Model control                                                   | Value type    | Submit event in the renderer      |
| --------------------------------------------------------------- | ------------- | --------------------------------- |
| `input` (default or `type="text"`), `textarea`, single `select` | String        | `change`                          |
| `input type="number"`                                           | Finite number | `change`                          |
| `input type="range"`                                            | Finite number | Throttled `input`, final `change` |
| `input type="checkbox"`                                         | Boolean       | `change`                          |

Other input types and `select multiple` are rejected. The renderer respects native constraints (`min`, `max`, `step`, etc.), `disabled`, and `readonly`. Controls start disabled until data arrives, and incompatible cell types disable editing. An empty numeric field stays a draft; it does not write zero or clear the cell. Remote updates do not overwrite active drafts. Invalid input or failed writes preserve the draft and show an error; Escape restores the latest cell value. Sliders submit the latest value at most once per 100 ms during input and submit immediately on change.

## References and scalar values

Cell references have exactly three colon-separated parts: `unitId:sheetId:A1`. Encode each ID separately with `encodeURIComponent`; the parser splits first and decodes each ID once. Stable IDs are case sensitive; column letters are case insensitive. B7 maps to zero-based row 6, column 1. Empty IDs, malformed percent encoding, absolute addresses such as $A$1, and unsafe integer coordinates are invalid. For arbitrary values embedded in HTML, also escape HTML attribute characters; URI encoding is specific to the IDs.

Range declarations use `unitId:sheetId:A1:B10`; `parseRangeReference()` returns `{ unitId, sheetId, range: { startRow, endRow, startColumn, endColumn } }`. Endpoints are inclusive and ordered; a single-cell range is written `A1:A1`. Only the address has an extra colon; both IDs remain individually encoded.

The attributes identify both the consuming element and its data reference. ById methods attach custom rendering callbacks to that declaration, so the binding can be read from the DOM without analyzing callback behavior. See [element bindings and ById callbacks](docs/element-bindings.md).

At runtime, coordinates remain fixed when rows/columns are inserted or deleted. Scalar reads preserve string, number, and boolean types; formulas return calculated results, and empty/missing/out-of-bounds cells return `{ value: null }`. Scalar writes require strings, finite numbers, or booleans, replace prior formulas/rich text, and throw for missing coordinates. Strings remain literal; `setCellValue()` does not accept `null`.

## Parser API

| Export                                              | Contract                                                                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseHtmlView(source: string)`                     | Returns `HtmlViewDocument`: `{ html, bindings }`; normalizes the document and generates `data-univer-binding` markers. Existing markers are replaced.                         |
| `parseCellReference(value: string)`                 | Returns `{ unitId, sheetId, row, col }`; throws for invalid references.                                                                                                       |
| `cellReferenceKey(reference)`                       | Returns a stable string key for the four reference fields; not an authorization check.                                                                                        |
| `getHtmlViewUnitIds(document)`                      | Unique declared Unit IDs, in first-seen order. Does not inspect JavaScript requests.                                                                                          |
| `isHtmlViewFilename(filename)`                      | Case-insensitive `.univer.html` suffix check; not content validation.                                                                                                         |
| `parseCellBinding(tagName, attribute, insideText?)` | Lower-level parser; `attribute(name)` returns a string or `undefined`, `insideText` defaults to false. Returns a binding without `id`, or `undefined` for an unbound element. |

Exported types are `HtmlCellReference`, `HtmlRangeReference`, `HtmlBindingDeclaration`, `HtmlViewBinding`, and `HtmlViewDocument`. Each binding contains `{ id, kind: "text" | "model" | "cell" | "range", reference, disabled }`; `disabled` records the declared disabled attribute. `parseHtmlView()` errors identify the element, line, and binding problem. HTML itself is normalized using HTML parsing rules, not rejected for every markup error. Author scripts can add/remove/change bindings later; the renderer observes these changes and manages subscriptions. Subscription-driven DOM updates do not trigger writes.

## Errors and next steps

See [validation examples](docs/validation.md) for a runnable error-handling example. Parsing is not a security boundary: JavaScript can request Unit IDs absent from `getHtmlViewUnitIds()`. The host must authorize every runtime Unit load and the server must enforce access. To execute a page, follow the renderer package’s local integration guide rather than inserting parsed HTML into your trusted application DOM.

## Distribution

ES modules, CommonJS, and TypeScript declarations are included; source files and source maps are not. Both READMEs and all `docs/*.md` files ship in the npm package. Read them under `node_modules/@univerkit/`.

## License

Licensed under Apache-2.0. Third-party dependencies retain their own licenses.
