import type { FUniver } from "@univerjs/core/facade";
import { normalizeCellValue } from "./cell-access.js";
import type { RangeReference, RangeState } from "./types.js";

export function normalizeRangeReference(ref: RangeReference): RangeReference {
  const range = ref?.range;
  if (
    typeof ref?.sheetId !== "string" ||
    !ref.sheetId.trim() ||
    !range ||
    ![range.startRow, range.endRow, range.startColumn, range.endColumn].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    range.endRow < range.startRow ||
    range.endColumn < range.startColumn
  )
    throw new Error("Expected Sheet ID and an ordered range of non-negative integer coordinates.");
  return {
    sheetId: ref.sheetId,
    range: {
      startRow: range.startRow,
      endRow: range.endRow,
      startColumn: range.startColumn,
      endColumn: range.endColumn,
    },
  };
}

export function readRange(api: FUniver, unitId: string, ref: RangeReference): RangeState {
  const { startRow, endRow, startColumn, endColumn } = ref.range;
  const sheet = api.getWorkbook(unitId)?.getSheetBySheetId(ref.sheetId);
  const lastRow = Math.min(endRow, (sheet?.getMaxRows() ?? 0) - 1);
  const lastColumn = Math.min(endColumn, (sheet?.getMaxColumns() ?? 0) - 1);
  const range =
    sheet && startRow <= lastRow && startColumn <= lastColumn
      ? sheet.getRange(startRow, startColumn, lastRow - startRow + 1, lastColumn - startColumn + 1)
      : undefined;
  const raw = range?.getRawValues();
  const cells = range?.getCellDatas();
  const value = Array.from({ length: endRow - startRow + 1 }, (_, row) =>
    Object.freeze(
      Array.from({ length: endColumn - startColumn + 1 }, (_, col) =>
        normalizeCellValue(raw?.[row]?.[col] ?? null, cells?.[row]?.[col]?.t),
      ),
    ),
  );
  return Object.freeze({ value: Object.freeze(value) });
}

export function equalRangeState(a: RangeState, b: RangeState): boolean {
  return (
    a.value.length === b.value.length &&
    a.value.every(
      (row, r) =>
        row.length === b.value[r]!.length &&
        row.every((value, c) => Object.is(value, b.value[r]![c])),
    )
  );
}
