export type HtmlViewLocale = "en-US" | "zh-CN";

export const resolveLocale = (locale?: string | null): HtmlViewLocale =>
  locale === "zh-CN" ? "zh-CN" : "en-US";

const en = {
  inspector: "Binding inspector",
  frame: "HTML data binding",
  highlightAll: "Highlight all",
  highlightElements: "Highlight all elements",
  cancelHighlight: "Cancel highlighting",
  refresh: "Refresh",
  refreshTitle: "Refresh bindings and retry unavailable names",
  updateFailed: "Unable to update bindings. Refresh to try again.",
  namesUnavailable: "Some names are unavailable. Refresh to try again.",
  unavailable: "Bindings unavailable.",
  loading: "Loading bindings…",
  empty: "No declared bindings in the running page.",
  invalid: "Invalid",
  issue: "Issue",
  invalidDeclarations: "Invalid declarations",
  pageElement: "Page element",
  reference: "Reference",
  range: "Range",
  cell: "Cell",
  text: "Text",
  model: "Input",
  cellSubscription: "Cell subscription",
  rangeSubscription: "Range subscription",
  source: "Binding source",
  dataSource: "DATA SOURCE",
  selectedElement: "SELECTED ELEMENT",
  closeDetails: "Close binding details",
  workbook: "Workbook",
  sheet: "Sheet",
  parseFailed: "Reference could not be parsed.",
  elements: (count: number) => `${count} element${count === 1 ? "" : "s"}`,
  issues: (count: number) => `${count} with issues`,
};
const zh: typeof en = {
  inspector: "绑定检查",
  frame: "HTML 数据绑定",
  highlightAll: "全部高亮",
  highlightElements: "高亮所有元素",
  cancelHighlight: "取消全部高亮",
  refresh: "刷新",
  refreshTitle: "刷新绑定并重试名称查询",
  updateFailed: "无法更新绑定，请刷新重试。",
  namesUnavailable: "部分名称暂不可用，请刷新重试。",
  unavailable: "绑定暂不可用。",
  loading: "正在加载绑定…",
  empty: "当前页面没有声明绑定。",
  invalid: "无效",
  issue: "异常",
  invalidDeclarations: "无效的绑定声明",
  pageElement: "页面元素",
  reference: "数据引用",
  range: "区域",
  cell: "单元格",
  text: "文本",
  model: "输入控件",
  cellSubscription: "单元格订阅",
  rangeSubscription: "区域订阅",
  source: "绑定来源",
  dataSource: "数据来源",
  selectedElement: "选中元素",
  closeDetails: "关闭绑定详情",
  workbook: "工作簿",
  sheet: "工作表",
  parseFailed: "无法解析数据引用。",
  elements: (count) => `${count} 个元素`,
  issues: (count) => `${count} 个异常`,
};
export const inspectionMessages = (locale: HtmlViewLocale = "en-US") =>
  locale === "zh-CN" ? zh : en;

const diagnostics: Record<string, string> = {
  "Expected <unitId>:<sheetId>:<cell address>.": "引用格式应为 工作簿 / 工作表 / 单元格地址。",
  "Expected <unitId>:<sheetId>:<start cell>:<end cell>.":
    "引用格式应为 工作簿 / 工作表 / 起始单元格 / 结束单元格。",
  "Unit ID and Sheet ID are required.": "必须指定工作簿和工作表引用。",
  "Expected a single A1 cell address.": "应填写单个 A1 格式的单元格地址。",
  "Cell address is too large.": "单元格地址超出范围。",
  "Range end must not precede its start.": "区域结束位置不能在起始位置之前。",
  "A text binding cannot contain another binding.": "文本绑定内不能嵌套其他绑定。",
  "Use only one binding attribute on an element.": "每个元素只能声明一个绑定属性。",
  "Binding requires a content element.": "绑定必须声明在内容元素上。",
  "Use cell-model for form controls.": "表单控件应使用 cell-model 绑定。",
  "cell-model requires an input, select, or textarea.":
    "cell-model 需要 input、select 或 textarea 元素。",
  "cell-model supports single select only.": "cell-model 仅支持单选控件。",
  "Unsupported cell-model input type.": "cell-model 不支持此输入类型。",
  "URI malformed": "引用中的编码格式无效。",
};

/** Translate presentation only; parser diagnostics and binding references remain unchanged. */
export function inspectionDiagnostic(message: string, locale: HtmlViewLocale) {
  if (locale === "en-US")
    return message
      .replace(/<unitId>:<sheetId>:/g, "workbook / sheet / ")
      .replace(/Unit ID and Sheet ID/g, "Workbook and sheet references");
  const duplicate = /^Duplicate HTML ID: (.*)\. ById requires a unique ID\.$/s.exec(message);
  if (duplicate) return `HTML ID 重复：${duplicate[1]}。ById 需要唯一的 ID。`;
  const prefix = /^(data-univer-[a-z-]+): /.exec(message)?.[0] ?? "";
  const translated = diagnostics[message.slice(prefix.length)];
  return translated ? prefix + translated : zh.parseFailed;
}
