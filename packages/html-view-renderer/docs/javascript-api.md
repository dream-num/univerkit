# Page JavaScript API

[简体中文](javascript-api.zh-CN.md)

[Back to README](../README.md) · [Complete host integration](integration.md). The page runtime creates `window.univerBinding` before author scripts execute. Calls cross the message channel; Engine instances, Univer objects, and collaboration credentials remain in the host. These APIs are available only inside a generated view, not in an HTML file opened directly.

## Interface

```ts
import type { IDisposable } from "@univerjs/core";
import type { CollaborationStatus } from "@univerjs-pro/collaboration-client";
import type { CellState, CellValue, RangeState } from "@univerkit/binding-engine";
import type { HtmlCellReference } from "@univerkit/html-view";
import type {
  HtmlRangeReference,
  HtmlInsertRowsWithValuesParams,
} from "@univerkit/html-view-renderer";

// Signature summary; the runtime supplies the implementation on window.
interface BindingEngineClient {
  subscribeCellById(elementId: string, listener: (state: CellState) => void): Promise<IDisposable>;
  subscribeRangeById(
    elementId: string,
    listener: (state: RangeState) => void,
  ): Promise<IDisposable>;
  getCellState(reference: HtmlCellReference): Promise<CellState>;
  getRangeState(reference: HtmlRangeReference): Promise<RangeState>;
  setCellValue(reference: HtmlCellReference, value: CellValue): Promise<void>;
  insertRowsWithValues(params: HtmlInsertRowsWithValuesParams): Promise<void>;
  getCollaborationStatus(unitId: string): Promise<CollaborationStatus>;
  subscribeCollaborationStatus(
    unitId: string,
    listener: (status: CollaborationStatus) => void,
  ): Promise<IDisposable>;
  flush(): Promise<void>;
}
```

Import the real `BindingEngineClient` type from this package when type-checking author code. If your author project needs a Window declaration, add the following to an included `.d.ts` file; this imports a type only and does not execute the runtime in the host.

```ts
import type { BindingEngineClient } from "@univerkit/html-view-renderer";
declare global {
  interface Window {
    readonly univerBinding: BindingEngineClient;
  }
}
```

## Why subscription references belong in HTML

`data-univer-cell-subscribe` and `data-univer-range-subscribe` declare which data an element consumes. The runtime manages the subscription, and `subscribeCellById()` / `subscribeRangeById()` register rendering callbacks using the element's native HTML ID. Keeping the reference on the element makes the binding readable from the DOM without inferring which elements a callback updates.

Callbacks handle formatting, charts, and lists with ordinary JavaScript. `data-univer-cell-text` and `data-univer-cell-model` handle automatic text and control synchronization. `getCellState()` / `getRangeState()` provide one-shot reads for button actions and submission validation; write methods and `flush()` handle changes and saving.

The host's BindingEngine supplies data to the runtime. The page uses HTML declarations and ById callbacks for data subscriptions.

## Complete page example

Save this as a view template and pass its text through the host integration. Replace both IDs in the HTML declarations and JavaScript with real, host-authorized stable IDs. Encode each ID with `encodeURIComponent` in HTML attributes; JavaScript object references use raw IDs. Use a worksheet with at least four rows and three columns and a numeric or empty A1. The page reads and subscribes to A1 and A1:C4, exposes explicit edit buttons, and saves separately. Every DOM element and helper used by the script is defined here.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Workbook records</title>
  </head>
  <body>
    <p>
      A1:
      <span id="value" data-univer-cell-subscribe="your-workbook-id:your-worksheet-id:A1"
        >Loading...</span
      >
    </p>
    <p>Sync status: <span id="sync"></span></p>
    <pre id="matrix" data-univer-range-subscribe="your-workbook-id:your-worksheet-id:A1:C4"></pre>
    <button id="increment" disabled>Add 1 to A1</button>
    <button id="insert" disabled>Insert two records</button>
    <button id="save">Save and continue</button>
    <p id="result" role="status"></p>
    <script>
      (async () => {
        const client = window.univerBinding;
        const unitId = "your-workbook-id";
        const sheetId = "your-worksheet-id";
        const cell = { unitId, sheetId, row: 0, col: 0 };
        const range = {
          unitId,
          sheetId,
          range: { startRow: 0, endRow: 3, startColumn: 0, endColumn: 2 },
        };
        const subscriptions = [];
        const result = document.querySelector("#result");
        window.addEventListener(
          "pagehide",
          () => {
            subscriptions.forEach((subscription) => subscription.dispose());
          },
          { once: true },
        );
        function action(id, apply) {
          const button = document.querySelector(id);
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              await apply();
              result.textContent = "Operation complete";
            } catch (error) {
              result.textContent = "Failed: " + error.message;
            } finally {
              button.disabled = false;
            }
          });
        }
        action("#save", () => client.flush());
        try {
          console.log("Initial A1:", await client.getCellState(cell));
          console.table((await client.getRangeState(range)).value);
          console.log("Initial status:", await client.getCollaborationStatus(unitId));
          subscriptions.push(
            await client.subscribeCellById("value", ({ value }) => {
              document.querySelector("#value").textContent = String(value ?? "");
            }),
          );
          subscriptions.push(
            await client.subscribeRangeById("matrix", ({ value }) => {
              document.querySelector("#matrix").textContent = JSON.stringify(value, null, 2);
            }),
          );
          subscriptions.push(
            await client.subscribeCollaborationStatus(unitId, (status) => {
              document.querySelector("#sync").textContent = String(status);
            }),
          );
          action("#increment", async () => {
            const { value } = await client.getCellState(cell);
            if (value !== null && typeof value !== "number") throw new Error("A1 must be numeric");
            await client.setCellValue(cell, (value ?? 0) + 1);
          });
          action("#insert", () =>
            client.insertRowsWithValues({
              unitId,
              sheetId,
              startRow: 1,
              rowCount: 2,
              startColumn: 0,
              values: [
                ["Alice", 123, true],
                ["Bob", null, false],
              ],
            }),
          );
          document.querySelector("#increment").disabled = false;
          document.querySelector("#insert").disabled = false;
        } catch (error) {
          subscriptions.forEach((subscription) => subscription.dispose());
          result.textContent = "Initialization failed: " + error.message;
        }
      })();
    </script>
  </body>
</html>
```

The increment example is a read followed by a write, not an atomic collaborative increment; concurrent editors can overwrite each other’s arithmetic result. A successful edit button means local execution completed. Use Save to wait for server acknowledgement. After a save failure retry Save, not Insert: insertion has already happened locally and repeating it adds more rows. The subscription matrix stays A1:C4 even after insertion.

## Cell and range contracts

`HtmlCellReference` is `{ unitId, sheetId, row, col }`. IDs are non-empty, case-sensitive stable IDs; coordinates are zero-based non-negative safe integers. Reads return `{ value }` where the scalar is a string, number, boolean, or `null`; formula cells return calculated results. Missing worksheets, empty cells, and out-of-bounds reads return `null`. Writes accept strings, finite numbers, or booleans, replace old formulas/rich text, and reject missing coordinates. Strings remain literal, and `setCellValue()` cannot write `null`.

`HtmlRangeReference` is `{ unitId, sheetId, range: { startRow, endRow, startColumn, endColumn } }`. All four boundaries are inclusive non-negative safe integers and the ends must follow the starts. `RangeState.value` is a readonly row-major matrix with exactly the requested dimensions; absent positions are padded with `null`. Other SDK `IRange` metadata is ignored. Both cell and range references address fixed positions when rows/columns change. Subscription inputs are captured when establishing the subscription.

## Insert rows with values

`HtmlInsertRowsWithValuesParams` adds `unitId` to `{ sheetId, startRow, rowCount, startColumn, values }`. `startRow`/`startColumn` are non-negative safe integers and `rowCount` is a positive safe integer. Insertion at the current row count appends; greater indices are rejected. The non-empty rectangular `values` matrix is local to the new rows, starts at `startColumn`, and must satisfy `values.length <= rowCount`. It accepts strings, finite numbers, booleans, and `null` blanks. Width must fit the worksheet; columns are not automatically added. Unfilled new rows/columns remain blank. All parameters are validated before mutation.

Insertions and scalar writes share the host’s serialized write queue and run in request order. Their promises resolve after the local operation, and `flush()` subsequently waits for acknowledgement. New writes reject during host save-before-leave and after connection closure.

## Subscriptions and collaboration status

ById subscriptions deliver the initial state before their promise resolves, then deliver changed values; each range update contains the full matrix. Identical references share underlying message subscriptions while each callback registration cancels independently. The returned `dispose()` is synchronous and idempotent: it stops that callback but retains the element's data subscription until the declaration or element is removed. Do not access the returned subscription inside its initial callback, because it has not been assigned yet. Callback failures are reported without stopping other listeners; closing the page cleans up remaining subscriptions.

Collaboration status methods take a Unit ID and use SDK `CollaborationStatus`. Status subscriptions also deliver their initial notification before resolving; disposing a status registration releases it without relying on an HTML declaration. Host TypeScript code can compare status to `CollaborationStatus.SYNCED` from `@univerjs-pro/collaboration-client`; the example prints the raw status so author HTML needs no extra import. A status snapshot is useful for UI but does not replace awaiting `flush()` when leaving.

## Saving and errors

Page `flush()` first submits declarative DOM drafts, waits for already issued writes, and then waits for collaboration acknowledgement for loaded Units. It permits continued editing after success. The host view’s `flush()` also saves and continues. `prepareToLeave()` pauses editing and saves; after success dispose the view or call `resume()` to continue. Failure restores interaction if the connection is still active. Custom JavaScript form state is not automatically submitted: call a write API before flushing.

Invalid references, denied access, load failures, and failed writes reject their promises. A failed operation must be handled even if a later flush succeeds; flush is not a replay of every historical error. Channel closure rejects outstanding requests and stops notifications. Neither subscription disposal nor page/host disposal implicitly saves. Preserve failed drafts and offer a correction or save retry; never report “saved” solely because `setCellValue()` resolved.

## Subscribe by HTML element ID

```html
<div id="trend" data-univer-range-subscribe="unit-id:sheet-id:A15:F21"></div>
<span id="amount" data-univer-cell-subscribe="unit-id:sheet-id:B5"></span>
<script>
  window.univerBinding
    .subscribeRangeById("trend", ({ value }) => {
      document.getElementById("trend").textContent = JSON.stringify(value);
    })
    .catch(console.error);
  window.univerBinding
    .subscribeCellById("amount", ({ value }) => {
      document.getElementById("amount").textContent = String(value ?? "");
    })
    .catch(console.error);
</script>
```

The attributes automatically subscribe without changing the DOM. ById attaches a callback to that existing element binding, delivers the current state before its Promise resolves, and then delivers changes. Pass a literal HTML ID without `#`; the element must exist and its ID must be unique. Missing elements, invalid references and mismatched binding kinds reject the Promise. CellById requires `data-univer-cell-subscribe`; RangeById requires `data-univer-range-subscribe`.

Each callback is independently disposable; disposing it retains the element's declaration. A changed reference switches the subscription and keeps callbacks, ignoring late data from the old reference. Removing the element or its data binding ends its callbacks. A replacement element with the same ID requires new registration. Dynamic elements are supported, including a ById call immediately after insertion. Page disposal releases all subscriptions. Callbacks render ordinary HTML/JavaScript; the SDK does not prescribe a renderer or loop syntax. Direct reads and writes remain available.
