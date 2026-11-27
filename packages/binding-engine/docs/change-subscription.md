# Subscription behavior and design

[简体中文](change-subscription.zh-CN.md)

[Back to README](../README.md). This guide explains the public subscription contract first, then the implementation tradeoffs. Consumers use `subscribeCell()` and `subscribeRange()`; they do not need internal SDK listeners or source access.

## A complete subscription helper

Pass an engine after `await engine.load()` and a real worksheet ID. The returned cleanup function stops this observer, leaving the engine and other observers active.

```ts
import type { BindingEngine } from "@univerkit/binding-engine";

export function observeCell(engine: BindingEngine, sheetId: string) {
  const reference = { sheetId, row: 0, col: 0 };
  const first = engine.subscribeCell(reference, (state) => console.log("First:", state.value));
  const second = engine.subscribeCell(reference, (state) => console.log("Second:", state.value));
  // Both callbacks have already received the current value here.
  return () => {
    first.dispose();
    second.dispose();
  };
}
```

## Observable contract

Each subscription immediately delivers the current `{ value }`, then delivers only actual value changes. Range updates contain a full matrix, not a patch. References are copied and remain fixed coordinates after structural changes. Each registration has an independent, idempotent `dispose()`, including repeated registrations of the same callback. A callback exception is reported without stopping other listeners. Engine disposal removes every subscription.

## Current invalidation strategy

The engine listens to SDK mutations for its Unit (and mutations without a Unit ID) and to formula-result application. It coalesces invalidations in a microtask, reads each subscribed cell or exact range once per refresh, and compares values before notifying. Identical targets share reads; different or overlapping ranges are independent. Removing the final listener removes the target record. Reads use the SDK model, so row/column and worksheet changes follow fixed-coordinate semantics without reimplementing formulas or collaboration.

Notifications are value snapshots, not an audit log: several synchronous edits may coalesce, and edits that leave the value unchanged do not generate another value notification. Formula results can arrive after the originating mutation and trigger another refresh. `flush()` waits for collaboration acknowledgement; it is not a subscription event counter or a guarantee that every intermediate value was delivered.

## Alternative listening strategies

| Strategy                                   | Benefit                                          | Additional work                                                                                   |
| ------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Facade `SheetValueChanged` affected ranges | Concise, reuses SDK range derivation.            | Verify headless/active-sheet preconditions and coverage of structural changes.                    |
| Precise mutation range filtering           | Can avoid reads of unrelated targets.            | Track every relevant mutation and its coordinate effects, including row/column and sheet changes. |
| Current Unit-level invalidation            | Broad structural coverage with simple ownership. | May read unchanged targets, then suppress unchanged notifications.                                |

Any strategy must read after formula results are applied and compare actual values. A filter for direct cell writes alone misses remote structural changes, undo/redo, sorting, and formula updates. Changes to this strategy must retain coverage for local and remote writes, undo/redo, structural changes, missing sheets, formulas, independent cancellation, and disposal during notification.

## Listening code and strategy comparison

The following internal alternatives retain the key code behind the comparison above. Consumers do not need to install these listeners when using the public subscription APIs. `univer`, `univerAPI`, `options`, and `ref` represent the internal SDK instance, Facade, Engine options, and target reference; `onChange` is an internal state-refresh callback. Start consumer integration with the complete subscription helper earlier in this guide.

Both alternatives preserve the same Binding API and differ in the entry point for detecting value changes. The snippets assume a valid cell in an already loaded workbook and omit general state management to focus on the tradeoffs.

```ts
// Internal listening alternatives; api is the Headless Univer Facade.
const api = univerAPI;
const { unitId } = options;
const { sheetId, row, col } = ref;
const cell = () => api.getWorkbook(unitId)!.getSheetBySheetId(sheetId)!.getRange(row, col);
```

### Alternative 1: Facade events

Use affected ranges from `SheetValueChanged` to determine whether they contain the target cell.

```ts
const values = api.addEvent(api.Event.SheetValueChanged, (event) => {
  const affected = event.effectedRanges.some((range) => {
    const area = range.getRange();
    return (
      range.getUnitId() === unitId &&
      range.getSheetId() === sheetId &&
      row >= area.startRow &&
      row <= area.endRow &&
      col >= area.startColumn &&
      col <= area.endColumn
    );
  });
  if (affected) onChange(cell().getRawValue());
});
```

This offers a concise interface and reuses SDK range derivation. The SDK implementation considered here generates the event from a fixed mutation list and checks `getActiveSheet()` first. Headless usage and row, column, and worksheet structural changes require additional coverage; verify these assumptions against the SDK version in use.

### Alternative 2: Direct mutation listeners

Use `ICommandService.onCommandExecuted` to identify mutations and locate affected cells from their parameters. This example handles direct value writes; `univer` is the SDK instance owned by Engine.

```ts
import { ICommandService } from "@univerjs/core";
import { SetRangeValuesMutation, type ISetRangeValuesMutationParams } from "@univerjs/sheets";

const commands = univer.__getInjector().get(ICommandService);
const values = commands.onCommandExecuted((command) => {
  if (command.id !== SetRangeValuesMutation.id) return;
  const params = command.params as ISetRangeValuesMutationParams;
  if (params.unitId !== unitId || params.subUnitId !== sheetId) return;

  // A null cellValue clears values; otherwise check whether the sparse write includes this cell.
  if (params.cellValue == null || Object.hasOwn(params.cellValue[row] ?? {}, col)) {
    onChange(cell().getRawValue());
  }
});
```

This follows Univer's underlying mutation mechanism and targets a specific Unit. A complete implementation also needs to handle moves, sorting, row/column insertion and deletion, and worksheet insertion and deletion, rereading values at fixed coordinates. SDK range utilities can be reused, while Binding maintains the coverage list explicitly.

### Shared concerns: Formula results and writes

```ts
const formulas = api.getFormula().calculationResultApplied((result) => {
  const cells = result.unitData[unitId]?.[sheetId];
  if (Object.hasOwn(cells?.[row] ?? {}, col)) {
    onChange(cell().getRawValue());
  }
});

cell().setValue(20);

values.dispose();
formulas.dispose();
```

Read after formula results are applied. A data event means that the target may be affected; Binding must still compare actual values before notifying subscribers.

### Tradeoffs

| Dimension   | Facade events                                                            | Direct mutations                                           |
| ----------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Integration | Concise; SDK supplies affected ranges.                                   | Parse effects from mutation parameters.                    |
| Headless    | Verify and handle active-sheet preconditions.                            | Locate the target Unit directly.                           |
| Coverage    | Depends on the event's mutation list; structural changes need additions. | Binding explicitly maintains value and structure coverage. |
| Evolution   | Follow the Facade event contract.                                        | Follow mutation contracts and range utilities.             |

Engine uses the [Unit-level invalidation described in the README](../README.md#change-subscriptions). The precise-range and Facade alternatives above compare possible listening entry points. Replacing the invalidation strategy must preserve complete notifications for direct writes, remote changes, undo/redo, structural changes, and formula results.
