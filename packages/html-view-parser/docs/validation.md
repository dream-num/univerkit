# Validate an HTML view

[简体中文](validation.zh-CN.md)

[Back to README](../README.md). This example uses only the installed parser and Node.js built-ins; no workbook or repository checkout is required.

## Run the example

After the README installation step, save the following as `validate-view.mjs` and run `node validate-view.mjs`. It prints three binding errors followed by a success message.

```js
import assert from "node:assert/strict";
import { parseHtmlView, parseCellBinding } from "@univerkit/html-view-parser";

const cases = [
  '<span data-univer-cell-text="book:sheet:A0"></span>',
  '<input type="radio" data-univer-cell-model="book:sheet:A1">',
  '<div data-univer-cell-text="book:sheet:A1"><span data-univer-cell-text="book:sheet:B1"></span></div>',
];
for (const source of cases) {
  assert.throws(() => parseHtmlView(source));
  try {
    parseHtmlView(source);
  } catch (error) {
    console.log(error.message);
  }
}
const attributes = new Map([
  ["type", "number"],
  ["data-univer-cell-model", "book:sheet:B7"],
]);
const binding = parseCellBinding("input", (name) => attributes.get(name));
assert.deepEqual(binding, {
  kind: "model",
  disabled: false,
  reference: { unitId: "book", sheetId: "sheet", row: 6, col: 1 },
});
console.log("Validation examples passed.");
```

## Handle failures in an application

Catch parsing errors before replacing the currently displayed page. Show the error to the author so they can fix the indicated element and line. For dynamically inserted bindings the renderer reports errors through `onError`, marks invalid elements, and releases changed or removed subscriptions. The initial parser does not execute scripts to discover these later bindings.

## What validation does not establish

A valid binding does not establish that a workbook exists, that a cell has a compatible type, or that the caller may read or write it. Those checks happen during runtime loading and editing. Normalization can change HTML serialization and generate binding IDs; do not treat it as a byte-preserving formatter or sanitizer.
