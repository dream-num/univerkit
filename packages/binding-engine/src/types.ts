import type { ICellData, IRange } from "@univerjs/core";
import type { createUniver } from "@univerjs/presets";
import type { IUniverCollaborationClientConfig } from "@univerjs-pro/collaboration-client";

export type BindingUniverFactory = (
  collaborationClientConfig: IUniverCollaborationClientConfig,
) => ReturnType<typeof createUniver>;

export interface BindingEngineOptions {
  readonly unitId: string;
  readonly collaborationClientConfig: IUniverCollaborationClientConfig;
  readonly createUniver?: BindingUniverFactory;
}
export type CellValue = NonNullable<ICellData["v"]>;
export interface CellReference {
  readonly sheetId: string;
  readonly row: number;
  readonly col: number;
}
export interface SheetInfo {
  readonly sheetId: string;
  readonly name: string;
}
export interface CellState {
  readonly value: CellValue | null;
}

export interface RangeReference {
  readonly sheetId: string;
  readonly range: Readonly<IRange>;
}
export interface RangeState {
  readonly value: readonly (readonly (CellValue | null)[])[];
}

export interface InsertRowsWithValuesParams {
  readonly sheetId: string;
  /** Zero-based insertion position; existing rows at this position move down. */
  readonly startRow: number;
  /** Positive safe integer; must be at least values.length. */
  readonly rowCount: number;
  /** Zero-based column where the local matrix starts. */
  readonly startColumn: number;
  /** Non-empty rectangular matrix for new rows only; omitted rows remain blank. */
  readonly values: readonly (readonly (CellValue | null)[])[];
}
