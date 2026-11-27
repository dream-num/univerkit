import salesHtml from "../templates/regional-sales.univer.html?raw";
import { LocaleType, type ICellData, type IWorkbookData } from "@univerjs/core";

const regions = ["华东", "华南", "华北", "西部"];
// Seed facts only; revenue totals, profit, ratios and selection results are Sheet formulas.
const records = [
  ["01月", "华东", 186000, 200000, 112000, 86],
  ["02月", "华东", 214000, 210000, 126000, 98],
  ["03月", "华东", 248000, 230000, 143000, 112],
  ["04月", "华东", 236000, 250000, 140000, 106],
  ["05月", "华东", 292000, 270000, 168000, 132],
  ["06月", "华东", 328000, 300000, 182000, 148],
  ["01月", "华南", 152000, 170000, 98000, 72],
  ["02月", "华南", 178000, 180000, 108000, 84],
  ["03月", "华南", 206000, 200000, 122000, 96],
  ["04月", "华南", 224000, 220000, 130000, 102],
  ["05月", "华南", 258000, 240000, 148000, 118],
  ["06月", "华南", 286000, 260000, 159000, 130],
  ["01月", "华北", 138000, 150000, 88000, 64],
  ["02月", "华北", 146000, 160000, 91000, 68],
  ["03月", "华北", 182000, 180000, 108000, 82],
  ["04月", "华北", 198000, 200000, 116000, 90],
  ["05月", "华北", 226000, 220000, 132000, 104],
  ["06月", "华北", 254000, 240000, 145000, 116],
  ["01月", "西部", 96000, 110000, 64000, 46],
  ["02月", "西部", 118000, 120000, 74000, 54],
  ["03月", "西部", 134000, 140000, 82000, 62],
  ["04月", "西部", 162000, 160000, 96000, 74],
  ["05月", "西部", 184000, 180000, 108000, 86],
  ["06月", "西部", 216000, 200000, 121000, 98],
];

export function createSalesSheetData(id: string, name: string): IWorkbookData {
  const raw: Record<number, Record<number, ICellData>> = {};
  const dashboard: Record<number, Record<number, ICellData>> = {};
  const row = (target: typeof raw, index: number, values: (string | number)[], style?: string) => {
    target[index] = Object.fromEntries(
      values.map((v, column) => [column, { v, ...(style ? { s: style } : {}) }]),
    );
  };
  row(raw, 0, ["月份", "区域", "销售额", "销售目标", "成本", "订单数", "毛利"], "heading");
  records.forEach((values, index) => {
    row(raw, index + 1, values);
    raw[index + 1]![6] = { f: `=C${index + 2}-E${index + 2}`, s: "money" };
    for (const col of [2, 3, 4]) raw[index + 1]![col]!.s = "money";
  });
  const source = (column: string) => `'销售明细'!$${column}$2:$${column}$25`;
  const sum = (column: string, region: string, month?: string) =>
    `SUMIFS(${source(column)},${source("B")},${region}${month ? `,${source("A")},${month}` : ""})`;
  row(dashboard, 0, ["区域销售分析 · 2026 上半年"], "title");
  row(dashboard, 1, ["选择区域", "华东"]);
  dashboard[1]![1]!.s = "input";
  row(dashboard, 2, ["修改 B2 切换区域；黄色单元格是唯一筛选输入。"]);
  const metrics = [
    ["销售额", `=${sum("C", "$B$2")}`, "money"],
    ["销售目标", `=${sum("D", "$B$2")}`, "money"],
    ["目标达成率", "=IFERROR(B5/B6,0)", "percent"],
    ["毛利", `=${sum("G", "$B$2")}`, "money"],
    ["毛利率", "=IFERROR(B8/B5,0)", "percent"],
    ["订单数", `=${sum("F", "$B$2")}`, "number"],
    ["平均订单金额", "=IFERROR(B5/B10,0)", "money"],
  ];
  metrics.forEach(([label, formula, style], index) => {
    dashboard[index + 4] = { 0: { v: label }, 1: { f: formula, s: style } };
  });
  row(dashboard, 13, ["区域月度趋势（SUMIFS）"], "title");
  row(dashboard, 14, ["月份", "销售额", "销售目标", "毛利", "订单数", "毛利率"], "heading");
  for (let index = 0; index < 6; index++) {
    const r = index + 16;
    row(dashboard, index + 15, [`0${index + 1}月`]);
    for (const [column, sourceColumn] of [
      [1, "C"],
      [2, "D"],
      [3, "G"],
      [4, "F"],
    ] as const) {
      dashboard[index + 15]![column] = {
        f: `=${sum(sourceColumn, "$B$2", `$A${r}`)}`,
        s: column === 4 ? "number" : "money",
      };
    }
    dashboard[index + 15]![5] = { f: `=IFERROR(D${r}/B${r},0)`, s: "percent" };
  }
  for (const [index, values] of [
    [14, ["区域", "销售额", "销售目标"]],
    ...regions.map((region, index) => [index + 15, [region]]),
  ] as [number, string[]][]) {
    values.forEach((v, column) => {
      (dashboard[index] ??= {})[column + 7] = { v, ...(index === 14 ? { s: "heading" } : {}) };
    });
    if (index > 14) {
      dashboard[index]![8] = { f: `=${sum("C", `H${index + 1}`)}`, s: "money" };
      dashboard[index]![9] = { f: `=${sum("D", `H${index + 1}`)}`, s: "money" };
    }
  }
  row(dashboard, 22, ["区域明细（INDEX + FILTER 提取）"], "title");
  row(dashboard, 24, ["月份", "区域", "销售额", "销售目标", "成本", "订单数", "毛利"], "heading");
  // 每格返回一个标量，避免动态数组在协同重载后出现 #SPILL!。
  for (let row = 0; row < 6; row++) {
    dashboard[row + 25] = Object.fromEntries(
      Array.from({ length: 7 }, (_, column) => [
        column,
        {
          f: `=IFERROR(INDEX(FILTER('销售明细'!$A$2:$G$25,${source("B")}=$B$2),${row + 1},${column + 1}),"")`,
        },
      ]),
    );
  }
  return {
    id,
    name,
    rev: 1,
    appVersion: "",
    locale: LocaleType.ZH_CN,
    sheetOrder: ["dashboard", "sales"],
    resources: [],
    styles: {
      title: { fs: 14, bl: 1, cl: { rgb: "#123C37" } },
      heading: { bg: { rgb: "#E6F1ED" }, cl: { rgb: "#123C37" }, bl: 1 },
      input: { bg: { rgb: "#FFF1C2" }, cl: { rgb: "#7C5700" }, bl: 1 },
      money: { n: { pattern: "#,##0" } },
      number: { n: { pattern: "0" } },
      percent: { n: { pattern: "0.0%" } },
    },
    sheets: {
      dashboard: {
        id: "dashboard",
        name: "销售分析",
        rowCount: 100,
        columnCount: 12,
        columnData: Object.fromEntries(
          Array.from({ length: 10 }, (_, index) => [index, { w: index === 0 ? 190 : 130 }]),
        ),
        cellData: dashboard,
      },
      sales: {
        id: "sales",
        name: "销售明细",
        rowCount: 100,
        columnCount: 12,
        columnData: Object.fromEntries(
          Array.from({ length: 7 }, (_, index) => [index, { w: 140 }]),
        ),
        cellData: raw,
      },
    },
  };
}

export function createSalesHtmlSource(unitId: string): string {
  return salesHtml
    .replaceAll("{{CELL_REFERENCE}}", `${encodeURIComponent(unitId)}:dashboard`)
    .replaceAll('"{{UNIT_ID}}"', JSON.stringify(unitId).replaceAll("<", "\\u003c"));
}
