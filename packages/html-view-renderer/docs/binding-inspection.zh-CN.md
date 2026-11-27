# 内置绑定检查

[English](binding-inspection.md) · [返回 README](../README.zh-CN.md) · [view API](render.zh-CN.md)

Inspector 是 `renderHtmlView` 的内置能力。应用通过 `view.inspect.open(options?)` 开启、
`view.inspect.close()` 关闭，不创建另一个组件或容器。`open()` 自动等待 view 握手。

创建 `renderHtmlView` 时设置 `locale: "zh-CN"` 或 `"en-US"`（默认），侧栏和 iframe 浮层使用同一语言。语言在该 view 的生命周期内固定；需要切换时重新创建 view。业务名称、地址和 `id: xxx` 回退保持原样。

## 接口与业务名称

下面的函数接收已创建的 view。名称数据由应用提供；这个例子用固定名称演示返回结构。

```ts
import type { HtmlViewHandle } from "@univerkit/html-view-renderer/render";

export async function inspectBudget(view: HtmlViewHandle) {
  await view.inspect.open({
    async loadMetadata(unitId, signal) {
      signal.throwIfAborted();
      return { unitId, name: "Budget", sheets: [{ sheetId: "sheet-1", name: "Overview" }] };
    },
  });
}
```

不提供 `loadMetadata` 时显示 `id: xxx`。函数必须返回请求的 `unitId` 及 `sheets` 列表，Unit 和 Sheet 的
`name` 均可省略。生产应用可从已授权的目录或接口查询名称。侧栏、tooltip 和详情有名称时只显示名称，
名称缺失或为空白时回退到 `id: xxx`；查询失败显示重试提示，并使用同一回退规则。
面板的 Refresh 可重试失败查询。名称只用于展示，分组、定位和授权都不依赖名称。

关闭检查或销毁 view 会中止名称请求；迟到结果不会重新开启检查。
已打开时再次 `open()` 无操作；需要更换配置时先关闭再打开。

## 用户看到的效果

- 侧栏按 Unit → Sheet → 引用分组，展示引用关联的页面元素。紧凑工具栏只显示整页元素总数、全部高亮和刷新，工作簿卡片不重复计数；检查的打开与关闭由应用控制。
- 点击引用，突出显示关联元素；点击元素条目或页面绑定元素，显示固定详情浮层。
- hover 显示 tooltip；打开固定详情时隐藏 tooltip。
- 浮层关闭按钮、空白区域和 Escape 清除选择，并同步侧栏。
- 每次打开检查默认开启全部高亮。全部高亮使用青色虚线；hover 使用紫色实线，选中元素或引用组使用更粗的紫色实线。
- 全部高亮和选择相互独立：切换全部高亮保留当前选择；清除选择后，恢复开启中的全部高亮样式。
- 关闭检查会清理选择、高亮和浮层，恢复模板的点击行为。

检查模式截获模板点击，避免选择元素时同时触发业务操作。tooltip 和详情浮层由 SDK 的
iframe 页面侧渲染，侧栏由 SDK 的宿主侧渲染；应用无需连接它们的事件或状态。

## 检查范围

识别 `data-univer-cell-text`、`data-univer-cell-model`、`data-univer-cell-subscribe` 和
`data-univer-range-subscribe`，使用与绑定执行相同的解析规则。它检查当前 DOM 声明，
不读取单元格值、不分析 Sheet 关系、不推断 JavaScript 回调里的依赖。

范围图表或列表按声明所在元素展示；子元素只有自己声明绑定时才单独展示。
脚本字符串、注释、已移除的元素和未实例化的 template 内容不进入检查结果。
动态新增、删除和改绑会更新侧栏；仅渲染值变化不会重建关系。

检查器能报告当前 DOM 的错误声明和重复 HTML ID。初始模板仍须通过 `parseHtmlView` 校验：
导致解析抛错的模板无法创建 view，不能依靠 Inspector 绕过这一步。

## 所有权

| 所有者     | 职责                                                               |
| ---------- | ------------------------------------------------------------------ |
| 应用       | 提供 view 容器、模板、授权 Engine 和可选名称查询；决定何时开启检查 |
| SDK host   | 侧栏、分组、名称加载、错误与空状态、选择联动                       |
| SDK iframe | DOM 扫描、元素标识、拾取、高亮、tooltip、详情浮层                  |
| shared     | 检查记录类型、纯解析函数和消息通信                                 |

检查命令不加入模板的 `window.univerBinding`。低层 `createBindingHost` 检查方法用于自定义装配，
普通应用使用完整 view 的检查能力。代码边界见[架构文档](architecture.zh-CN.md)。
