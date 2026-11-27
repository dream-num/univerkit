import { LocaleType, type ICellData, type IWorkbookData } from "@univerjs/core";
import css from "../templates/event.css?raw";
import script from "../templates/event.js?raw";
import register from "../templates/event-register.html?raw";
import checkin from "../templates/event-checkin.html?raw";
import screen from "../templates/event-screen.html?raw";

export const eventViews = [
  { id: "register", name: "活动报名", body: register },
  { id: "checkin", name: "现场签到台", body: checkin },
  { id: "screen", name: "活动实时大屏", body: screen },
] as const;

export function createEventSheetData(id: string, name: string): IWorkbookData {
  type Cells = Record<number, Record<number, ICellData>>;
  const attendees: Cells = {};
  const settings: Cells = {};
  const summary: Cells = {};
  const row = (cells: Cells, index: number, values: (string | number)[], heading = false) => {
    cells[index] = Object.fromEntries(
      values.map((v, col) => [col, { v, ...(heading ? { s: "heading" } : {}) }]),
    );
  };
  row(settings, 0, ["活动设置", "内容"], true);
  [
    ["活动名称", "Univer 开发者沙龙"],
    ["活动时间", "2026.10.24 · 13:30–18:00"],
    ["活动地点", "上海 · 创意空间 / 3F"],
    ["报名名额", 80],
    ["场次一", "协同应用实战"],
    ["场次二", "AI 与表格"],
    ["场次三", "开放交流"],
  ].forEach((v, i) => row(settings, i + 1, v));
  row(
    attendees,
    0,
    ["报名编号", "姓名", "公司 / 团队", "参会场次", "报名时间", "签到状态", "签到时间"],
    true,
  );
  const surnames = ["林", "陈", "张", "李", "周", "王", "刘", "徐", "沈", "许", "吴", "赵"];
  const names = ["知夏", "予安", "子墨", "星野"];
  const companies = ["星河科技", "独立开发者", "远山设计", "青禾数据", "光年实验室", "云帆软件"];
  const sessions = ["协同应用实战", "AI 与表格", "开放交流"];
  const seededAt = Date.now();
  for (let i = 0; i < 48; i++) {
    row(attendees, i + 1, [
      `U-${String(i + 1).padStart(3, "0")}`,
      surnames[i % 12]! + names[Math.floor(i / 12)]!,
      companies[i % 6]!,
      sessions[i % 3]!,
      new Date(seededAt - 86_400_000).toISOString(),
      i < 18 ? "已签到" : "未签到",
      i < 18 ? new Date(seededAt - (30 - i) * 60_000).toISOString() : "",
    ]);
  }
  row(summary, 0, ["活动统计", "数值"], true);
  const metrics = [
    ["报名人数", "=COUNTIF('报名名单'!A2:A81,\"?*\")"],
    ["已签到", "=COUNTIFS('报名名单'!A2:A81,\"?*\",'报名名单'!F2:F81,\"已签到\")"],
    ["未到场", "=B2-B3"],
    ["签到率", "=IFERROR(B3/B2,0)"],
    ["剩余名额", "=MAX(0,MIN(80,'活动设置'!B5)-B2)"],
  ];
  metrics.forEach(([label, f], i) => {
    row(summary, i + 1, [label!]);
    summary[i + 1]![1] = { f: f!, ...(i === 3 ? { s: "percent" } : {}) };
  });
  row(summary, 7, ["参会场次", "报名人数", "已签到"], true);
  sessions.forEach((_session, i) => {
    summary[i + 8] = {
      0: { f: `='活动设置'!B${i + 6}` },
      1: { f: `=COUNTIFS('报名名单'!A2:A81,"?*",'报名名单'!D2:D81,A${i + 9})` },
      2: {
        f: `=COUNTIFS('报名名单'!A2:A81,"?*",'报名名单'!D2:D81,A${i + 9},'报名名单'!F2:F81,"已签到")`,
      },
    };
  });
  const sheet = (sheetId: string, title: string, cellData: Cells) => ({
    id: sheetId,
    name: title,
    rowCount: 100,
    columnCount: 12,
    cellData,
    columnData: Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [i, { w: i === 4 || i === 6 ? 240 : 180 }]),
    ),
  });
  return {
    id,
    name,
    rev: 1,
    appVersion: "",
    locale: LocaleType.ZH_CN,
    sheetOrder: ["attendees", "summary", "settings"],
    resources: [],
    styles: {
      heading: { bg: { rgb: "#E9EDE3" }, cl: { rgb: "#25372C" }, bl: 1 },
      percent: { n: { pattern: "0.0%" } },
    },
    sheets: {
      attendees: sheet("attendees", "报名名单", attendees),
      summary: sheet("summary", "统计汇总", summary),
      settings: sheet("settings", "活动设置", settings),
    },
  };
}

export function createEventHtmlSource(unitId: string, view: (typeof eventViews)[number]): string {
  const ref = `${encodeURIComponent(unitId)}:settings`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${view.name} · Univer</title><style>${css}</style></head>
<body data-view="${view.id}"><main><header class="topbar"><div class="brand"><span class="brand-mark">u</span> Univer <span class="brand-divider">/</span> <span class="brand-caption">开发者现场</span></div><div class="connection" id="connection" role="status">正在连接…</div></header>
${view.body
  .replaceAll("{{SETTINGS}}", ref)
  .replaceAll("{{ATTENDEES}}", `${encodeURIComponent(unitId)}:attendees`)
  .replaceAll("{{SUMMARY}}", `${encodeURIComponent(unitId)}:summary`)}
<div id="message" role="status" aria-live="polite"></div><footer><span>UNIVER DEVELOPERS · 2026</span><span>相聚，让想法发生。</span></footer></main><script>const EVENT_UNIT = ${JSON.stringify(unitId).replaceAll("<", "\\u003c")};\n${script}</script></body></html>`;
}
