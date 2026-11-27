import { CellValueType, type ICellData } from "@univerjs/core";
import type { FUniver } from "@univerjs/core/facade";
import type { CellReference, CellState, CellValue } from "./types.js";

export function validateReference(ref: CellReference): void {
  if (
    !ref.sheetId ||
    !Number.isSafeInteger(ref.row) ||
    ref.row < 0 ||
    !Number.isSafeInteger(ref.col) ||
    ref.col < 0
  ) {
    throw new Error("Expected Sheet ID and non-negative integer row/col.");
  }
}

function getRange(api: FUniver, unitId: string, ref: CellReference) {
  const sheet = api.getWorkbook(unitId)?.getSheetBySheetId(ref.sheetId);
  return sheet && ref.row < sheet.getMaxRows() && ref.col < sheet.getMaxColumns()
    ? sheet.getRange(ref.row, ref.col)
    : null;
}

export function readCell(api: FUniver, unitId: string, ref: CellReference): CellState {
  const range = getRange(api, unitId, ref);
  if (!range) return { value: null };
  const raw = range.getRawValue() ?? null;
  return {
    value: normalizeCellValue(raw, range.getCellData()?.t),
  };
}

export function writeCell(
  api: FUniver,
  unitId: string,
  ref: CellReference,
  value: CellValue,
): void {
  if (
    !["string", "number", "boolean"].includes(typeof value) ||
    (typeof value === "number" && !Number.isFinite(value))
  ) {
    throw new Error("Expected a finite scalar cell value.");
  }
  const range = getRange(api, unitId, ref);
  if (!range) throw new Error("Cell does not exist.");
  // 对象格式保留字面标量（包括以 = 开头的字符串），并清除旧公式和富文本。
  range.setValue({
    v: value,
    p: null,
    f: null,
    si: null,
    t:
      typeof value === "number"
        ? CellValueType.NUMBER
        : typeof value === "boolean"
          ? CellValueType.BOOLEAN
          : CellValueType.STRING,
  });
}

export function normalizeCellValue(
  value: CellValue | null,
  type?: ICellData["t"],
): CellValue | null {
  return type === CellValueType.BOOLEAN && value !== null ? Boolean(value) : value;
}
