import {
  BorderStyleTypes,
  CellValueType,
  HorizontalAlign,
  LocaleType,
  UniverInstanceType,
  VerticalAlign,
  type IStyleData,
  type IWorkbookData,
} from "@univerjs/core";
import { SheetsUnitComparisonAdapter } from "@univerjs-pro/sheets-history";
import type {
  IUnitComparisonResult,
  UnitComparisonViewerValue,
} from "@univerkit/unit-comparison-viewer";

const BORDER_THIN = { s: BorderStyleTypes.THIN, cl: { rgb: "#e2e8f0" } };

const WORKBOOK_STYLES: Record<string, IStyleData> = {
  title: {
    bl: 1,
    fs: 13,
    cl: { rgb: "#0f172a" },
    vt: VerticalAlign.MIDDLE,
  },
  header: {
    bl: 1,
    fs: 11,
    cl: { rgb: "#ffffff" },
    bg: { rgb: "#1e293b" },
    ht: HorizontalAlign.LEFT,
    vt: VerticalAlign.MIDDLE,
    bd: { t: BORDER_THIN, b: BORDER_THIN, l: BORDER_THIN, r: BORDER_THIN },
  },
  headerRight: {
    bl: 1,
    fs: 11,
    cl: { rgb: "#ffffff" },
    bg: { rgb: "#1e293b" },
    ht: HorizontalAlign.RIGHT,
    vt: VerticalAlign.MIDDLE,
    bd: { t: BORDER_THIN, b: BORDER_THIN, l: BORDER_THIN, r: BORDER_THIN },
  },
  label: {
    fs: 11,
    cl: { rgb: "#0f172a" },
    vt: VerticalAlign.MIDDLE,
    bd: { t: BORDER_THIN, b: BORDER_THIN, l: BORDER_THIN, r: BORDER_THIN },
  },
  currency: {
    fs: 11,
    cl: { rgb: "#0f172a" },
    ht: HorizontalAlign.RIGHT,
    vt: VerticalAlign.MIDDLE,
    n: { pattern: "$#,##0" },
    bd: { t: BORDER_THIN, b: BORDER_THIN, l: BORDER_THIN, r: BORDER_THIN },
  },
  totalLabel: {
    bl: 1,
    fs: 11,
    cl: { rgb: "#0f172a" },
    bg: { rgb: "#f1f5f9" },
    vt: VerticalAlign.MIDDLE,
    bd: { t: BORDER_THIN, b: BORDER_THIN, l: BORDER_THIN, r: BORDER_THIN },
  },
  totalCurrency: {
    bl: 1,
    fs: 11,
    cl: { rgb: "#0f172a" },
    bg: { rgb: "#f1f5f9" },
    ht: HorizontalAlign.RIGHT,
    vt: VerticalAlign.MIDDLE,
    n: { pattern: "$#,##0" },
    bd: { t: BORDER_THIN, b: BORDER_THIN, l: BORDER_THIN, r: BORDER_THIN },
  },
};

function createLeftWorkbook(): IWorkbookData {
  return {
    id: "q4-budget-book",
    name: "Q4 Operating Budget",
    appVersion: "1.6.0",
    locale: LocaleType.EN_US,
    styles: WORKBOOK_STYLES,
    sheetOrder: ["budget", "regions"],
    sheets: {
      budget: {
        id: "budget",
        name: "Budget Plan",
        rowCount: 24,
        columnCount: 6,
        defaultRowHeight: 28,
        defaultColumnWidth: 108,
        rowData: { 0: { h: 34 }, 1: { h: 30 } },
        columnData: {
          0: { w: 176 },
          1: { w: 108 },
          2: { w: 108 },
          3: { w: 104 },
        },
        mergeData: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 3 }],
        cellData: {
          0: {
            0: { v: "Q4 Operating Budget ($K)", s: "title" },
          },
          1: {
            0: { v: "Department", s: "header" },
            1: { v: "Planned", s: "headerRight" },
            2: { v: "Forecast", s: "headerRight" },
            3: { v: "Variance", s: "headerRight" },
          },
          2: {
            0: { v: "Engineering", s: "label" },
            1: { v: 420, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 435, t: CellValueType.NUMBER, s: "currency" },
            3: { f: "=C3-B3", v: 15, t: CellValueType.NUMBER, s: "currency" },
          },
          3: {
            0: { v: "Cloud Infrastructure", s: "label" },
            1: { v: 145, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 152, t: CellValueType.NUMBER, s: "currency" },
            3: { f: "=C4-B4", v: 7, t: CellValueType.NUMBER, s: "currency" },
          },
          4: {
            0: { v: "Product Design", s: "label" },
            1: { v: 98, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 98, t: CellValueType.NUMBER, s: "currency" },
            3: { f: "=C5-B5", v: 0, t: CellValueType.NUMBER, s: "currency" },
          },
          5: {
            0: { v: "Developer Relations", s: "label" },
            1: { v: 74, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 71, t: CellValueType.NUMBER, s: "currency" },
            3: { f: "=C6-B6", v: -3, t: CellValueType.NUMBER, s: "currency" },
          },
          6: {
            0: { v: "Total Operating Cost", s: "totalLabel" },
            1: { f: "=SUM(B3:B6)", v: 737, t: CellValueType.NUMBER, s: "totalCurrency" },
            2: { f: "=SUM(C3:C6)", v: 756, t: CellValueType.NUMBER, s: "totalCurrency" },
            3: { f: "=C7-B7", v: 19, t: CellValueType.NUMBER, s: "totalCurrency" },
          },
          7: {
            0: { v: "Contingency Reserve", s: "label" },
            1: { v: 60, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 60, t: CellValueType.NUMBER, s: "currency" },
            3: { f: "=C8-B8", v: 0, t: CellValueType.NUMBER, s: "currency" },
          },
          8: {
            0: { v: "Grand Total", s: "totalLabel" },
            1: { f: "=B7+B8", v: 797, t: CellValueType.NUMBER, s: "totalCurrency" },
            2: { f: "=C7+C8", v: 816, t: CellValueType.NUMBER, s: "totalCurrency" },
            3: { f: "=C9-B9", v: 19, t: CellValueType.NUMBER, s: "totalCurrency" },
          },
        },
      },
      regions: {
        id: "regions",
        name: "Regional Targets",
        rowCount: 16,
        columnCount: 5,
        defaultRowHeight: 28,
        defaultColumnWidth: 116,
        columnData: { 0: { w: 150 }, 1: { w: 116 }, 2: { w: 116 } },
        cellData: {
          0: {
            0: { v: "Region", s: "header" },
            1: { v: "Q4 Target ($K)", s: "headerRight" },
            2: { v: "Pipeline ($K)", s: "headerRight" },
          },
          1: {
            0: { v: "North America", s: "label" },
            1: { v: 820, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 910, t: CellValueType.NUMBER, s: "currency" },
          },
          2: {
            0: { v: "Europe", s: "label" },
            1: { v: 540, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 580, t: CellValueType.NUMBER, s: "currency" },
          },
          3: {
            0: { v: "APAC", s: "label" },
            1: { v: 460, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 515, t: CellValueType.NUMBER, s: "currency" },
          },
        },
      },
    },
  };
}

function createRightWorkbook(): IWorkbookData {
  return {
    id: "q4-budget-book",
    name: "Q4 Operating Budget",
    appVersion: "1.6.0",
    locale: LocaleType.EN_US,
    styles: WORKBOOK_STYLES,
    sheetOrder: ["budget", "regions"],
    sheets: {
      budget: {
        id: "budget",
        name: "Budget Plan",
        rowCount: 25,
        columnCount: 6,
        defaultRowHeight: 28,
        defaultColumnWidth: 108,
        rowData: { 0: { h: 34 }, 1: { h: 30 } },
        columnData: {
          0: { w: 176 },
          1: { w: 108 },
          2: { w: 108 },
          3: { w: 104 },
        },
        mergeData: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 3 }],
        cellData: {
          0: {
            0: { v: "Q4 Operating Budget ($K)", s: "title" },
          },
          1: {
            0: { v: "Department", s: "header" },
            1: { v: "Planned", s: "headerRight" },
            2: { v: "Forecast", s: "headerRight" },
            3: { v: "Variance", s: "headerRight" },
          },
          2: {
            0: { v: "Engineering", s: "label" },
            1: { v: 420, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 448, t: CellValueType.NUMBER, s: "currency" },
            3: { f: "=C3-B3", v: 28, t: CellValueType.NUMBER, s: "currency" },
          },
          3: {
            0: { v: "Cloud Infrastructure", s: "label" },
            1: { v: 145, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 138, t: CellValueType.NUMBER, s: "currency" },
            3: { f: "=C4-B4", v: -7, t: CellValueType.NUMBER, s: "currency" },
          },
          4: {
            0: { v: "Security & Compliance", s: "label" },
            1: { v: 48, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 48, t: CellValueType.NUMBER, s: "currency" },
            3: { f: "=C5-B5", v: 0, t: CellValueType.NUMBER, s: "currency" },
          },
          5: {
            0: { v: "Product Design", s: "label" },
            1: { v: 98, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 98, t: CellValueType.NUMBER, s: "currency" },
            3: { f: "=C6-B6", v: 0, t: CellValueType.NUMBER, s: "currency" },
          },
          6: {
            0: { v: "Developer Relations", s: "label" },
            1: { v: 74, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 79, t: CellValueType.NUMBER, s: "currency" },
            3: { f: "=C7-B7", v: 5, t: CellValueType.NUMBER, s: "currency" },
          },
          7: {
            0: { v: "Total Operating Cost", s: "totalLabel" },
            1: { f: "=SUM(B3:B7)", v: 785, t: CellValueType.NUMBER, s: "totalCurrency" },
            2: { f: "=SUM(C3:C7)", v: 811, t: CellValueType.NUMBER, s: "totalCurrency" },
            3: { f: "=C8-B8", v: 26, t: CellValueType.NUMBER, s: "totalCurrency" },
          },
          8: {
            0: { v: "Contingency Reserve", s: "label" },
            1: { v: 60, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 55, t: CellValueType.NUMBER, s: "currency" },
            3: { f: "=C9-B9", v: -5, t: CellValueType.NUMBER, s: "currency" },
          },
          9: {
            0: { v: "Grand Total", s: "totalLabel" },
            1: { f: "=B8+B9", v: 845, t: CellValueType.NUMBER, s: "totalCurrency" },
            2: { f: "=C8+C9", v: 866, t: CellValueType.NUMBER, s: "totalCurrency" },
            3: { f: "=C10-B10", v: 21, t: CellValueType.NUMBER, s: "totalCurrency" },
          },
        },
      },
      regions: {
        id: "regions",
        name: "Regional Targets",
        rowCount: 16,
        columnCount: 5,
        defaultRowHeight: 28,
        defaultColumnWidth: 116,
        columnData: { 0: { w: 150 }, 1: { w: 116 }, 2: { w: 116 } },
        cellData: {
          0: {
            0: { v: "Region", s: "header" },
            1: { v: "Q4 Target ($K)", s: "headerRight" },
            2: { v: "Pipeline ($K)", s: "headerRight" },
          },
          1: {
            0: { v: "North America", s: "label" },
            1: { v: 860, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 945, t: CellValueType.NUMBER, s: "currency" },
          },
          2: {
            0: { v: "Europe", s: "label" },
            1: { v: 540, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 580, t: CellValueType.NUMBER, s: "currency" },
          },
          3: {
            0: { v: "APAC", s: "label" },
            1: { v: 510, t: CellValueType.NUMBER, s: "currency" },
            2: { v: 560, t: CellValueType.NUMBER, s: "currency" },
          },
        },
      },
    },
  };
}

export function createDemoSheetComparison(): UnitComparisonViewerValue {
  const left = createLeftWorkbook();
  const right = createRightWorkbook();
  const adapter = new SheetsUnitComparisonAdapter();
  const raw = adapter.compare({
    unitId: left.id,
    leftData: left,
    rightData: right,
    leftChangesets: [],
    rightChangesets: [
      {
        mutations: [
          {
            id: "sheet.mutation.insert-row",
            data: { subUnitId: "budget", range: { startRow: 4, endRow: 4 } },
          },
        ],
      },
    ],
  });

  if (raw.productContext?.type !== UniverInstanceType.UNIVER_SHEET) {
    throw new Error("Expected Sheet productContext from SheetsUnitComparisonAdapter.");
  }

  const byEntityType: Record<string, number> = {};
  let insert = 0;
  let del = 0;
  let update = 0;
  let moved = 0;
  for (const item of raw.items) {
    byEntityType[item.entityType] = (byEntityType[item.entityType] ?? 0) + 1;
    if (item.kind === "insert") insert += 1;
    else if (item.kind === "delete") del += 1;
    else if (item.kind === "update") update += 1;
    if (item.moved) moved += 1;
  }

  const result: IUnitComparisonResult & {
    readonly unit: IUnitComparisonResult["unit"] & {
      readonly type: UniverInstanceType.UNIVER_SHEET;
    };
  } = {
    schemaVersion: 1,
    comparisonId: "demo-q4-budget",
    unit: {
      unitId: left.id,
      type: UniverInstanceType.UNIVER_SHEET,
      name: left.name,
    },
    fidelity: "history",
    commonBaseRevision: 12,
    stale: false,
    detail: "full",
    summary: {
      total: raw.items.length,
      insert,
      delete: del,
      update,
      moved,
      byEntityType,
    },
    coverage: { supportedEntityTypes: raw.supportedEntityTypes },
    scopes: raw.scopes ?? [],
    page: {
      offset: 0,
      limit: Math.max(100, raw.items.length),
      matched: raw.items.length,
      hasMore: false,
    },
    items: raw.items.map((item) => ({
      ...item,
      title: item.displayName ?? item.stableId,
      details: [],
    })),
    diagnostics: { readiness: "ready", unsupportedMutationIds: [], codes: [] },
    productContext: {
      kind: "sheet",
      sheets: raw.productContext.sheets.map((sheet) => ({
        ...sheet,
        id: sheet.sheetId,
        status: sheet.changeCount > 0 ? "update" : "unchanged",
      })),
    },
  };

  return {
    result,
    left: { label: "Rev 12 · Initial Draft", revision: 12, unitData: left },
    right: { label: "Rev 18 · Approved Q4 Plan", revision: 18, unitData: right },
  };
}
