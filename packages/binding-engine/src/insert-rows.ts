import { CellValueType, Direction, type ICellData } from "@univerjs/core";
import type { FUniver } from "@univerjs/core/facade";
import { InsertRowByRangeCommand } from "@univerjs/sheets";
import type { InsertRowsWithValuesParams } from "./types.js";

export function insertRowsWithValues(
  api: FUniver,
  unitId: string,
  params: InsertRowsWithValuesParams,
): void {
  if (!params || typeof params !== "object") throw new Error("Insertion parameters are required.");
  const { sheetId, startRow, rowCount, startColumn, values } = params;
  if (
    typeof sheetId !== "string" ||
    !sheetId.trim() ||
    !Number.isSafeInteger(startRow) ||
    startRow < 0 ||
    !Number.isSafeInteger(startColumn) ||
    startColumn < 0
  )
    throw new Error("Expected Sheet ID and non-negative integer startRow/startColumn.");
  if (!Number.isSafeInteger(rowCount) || rowCount <= 0)
    throw new Error("rowCount must be a positive safe integer.");
  if (!Array.isArray(values) || values.length === 0)
    throw new Error("values must be a non-empty rectangular matrix.");
  if (values.length > rowCount) throw new Error("values.length must not exceed rowCount.");

  const sheet = api.getWorkbook(unitId)?.getSheetBySheetId(sheetId);
  if (!sheet) throw new Error("Sheet does not exist.");
  const maxRows = sheet.getMaxRows();
  const maxColumns = sheet.getMaxColumns();
  if (startRow > maxRows || !Number.isSafeInteger(maxRows + rowCount))
    throw new Error("Inserted rows are out of bounds.");
  const width = Array.isArray(values[0]) ? values[0].length : 0;
  if (!width) throw new Error("values must be a non-empty rectangular matrix.");
  if (startColumn >= maxColumns || width > maxColumns - startColumn)
    throw new Error("values exceed the sheet column count.");

  const cellValue: Record<number, Record<number, ICellData>> = {};
  // Validate and build the entire payload before executing any mutation.
  for (let row = 0; row < values.length; row++) {
    const cells = values[row];
    if (!Array.isArray(cells) || cells.length !== width)
      throw new Error("values must be a non-empty rectangular matrix.");
    for (let col = 0; col < width; col++) {
      const value = cells[col];
      if (value === null) continue;
      if (
        !["string", "number", "boolean"].includes(typeof value) ||
        (typeof value === "number" && !Number.isFinite(value))
      )
        throw new Error("Expected a finite scalar cell value or null.");
      (cellValue[startRow + row] ??= {})[startColumn + col] = {
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
      };
    }
  }
  const result = api.syncExecuteCommand(InsertRowByRangeCommand.id, {
    unitId,
    subUnitId: sheetId,
    direction: startRow === maxRows ? Direction.DOWN : Direction.UP,
    range: { startRow, endRow: startRow + rowCount - 1, startColumn: 0, endColumn: maxColumns - 1 },
    cellValue,
  });
  if (!result) throw new Error("Insert rows command failed.");
}
