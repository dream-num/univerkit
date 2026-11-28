# Univer HTML View Parser

[English](README.md)

`@univerkit/html-view-parser` 解析声明式 HTML 单元格绑定，返回规范化 HTML 文档和绑定元数据。可用它验证 HTML 视图或检查声明的工作簿引用。它保留 HTML、CSS、JavaScript，不执行脚本、获取工作簿数据、净化 HTML 或建立隔离运行环境。

HTML 数据绑定的整体设计和三个包的分工见[HTML 数据绑定概览](../html-view/docs/overview.zh-CN.md)。

## 安装

```sh
npm install --save-exact "@univerkit/html-view-parser@rc" --registry=https://insider-npm-registry.univer.work/
```

三个数据绑定包按同一版本一起发布，包间依赖锁定该次发布的精确版本。上面的 `@rc` 选择当前 rc 发布，`--save-exact` 将解析出的精确版本写入应用依赖；需要其他通道时，把 `@rc` 换成同一次发布的精确版本号。Univer/Pro 依赖仍使用 `^1.6.0`。

解析器可在 Node.js 或浏览器 bundle 中运行，无需协同服务。以下示例使用 Node.js 24+，只需本包。若要展示实时数据并编辑单元格，请另行安装 `@univerkit/html-view`，其包内 `docs/integration.zh-CN.md` 提供完整 Vite 应用。

## 可运行的解析示例

保存为 `parse-view.mjs`，执行 `node parse-view.mjs`。示例 ID 用于演示，不加载工作簿。

```js
import {
  parseHtmlView,
  parseCellReference,
  cellReferenceKey,
  getHtmlViewUnitIds,
  isHtmlViewFilename,
} from "@univerkit/html-view-parser";

const unitId = "budget:2026";
const sheetId = "cash flow";
const address = [encodeURIComponent(unitId), encodeURIComponent(sheetId), "B7"].join(":");
const source = `<!doctype html><html><head><title>Budget</title></head><body>
  <p>Revenue: <span data-univer-cell-text="${address}">Loading...</span></p>
  <label>Revenue <input type="number" min="0" step="1" data-univer-cell-model="${address}"></label>
</body></html>`;
const page = parseHtmlView(source);
console.log(page.bindings.map(({ kind, reference }) => ({ kind, reference })));
// Two bindings: "text" and "model", both at row 6, col 1.
console.log(getHtmlViewUnitIds(page)); // ["budget:2026"]
console.log(parseCellReference(address));
// { unitId: "budget:2026", sheetId: "cash flow", row: 6, col: 1 }
console.log(cellReferenceKey(parseCellReference(address)));
// '["budget:2026","cash flow",6,1]'
console.log(isHtmlViewFilename("budget.univer.html")); // true
console.log(page.html); // Normalized document, including generated binding markers.
```

## HTML 绑定属性

| 属性                          | 方向          | 在渲染器中的效果                                             |
| ----------------------------- | ------------- | ------------------------------------------------------------ |
| `data-univer-cell-text`       | 单元格 → 元素 | 替换 `textContent`，`null` 变为空文本。                      |
| `data-univer-cell-model`      | 单元格 ↔ 控件 | 订阅值并提交合法编辑。                                       |
| `data-univer-cell-subscribe`  | 单元格 → 回调 | 自动订阅，通过 `subscribeCellById(id, listener)` 接收状态。  |
| `data-univer-range-subscribe` | 范围 → 回调   | 自动订阅，通过 `subscribeRangeById(id, listener)` 接收矩阵。 |

文本绑定应放在专门承载值的元素上，更新会替换全部文本内容，包括子元素内容。首次数据到达前保留占位文字。不要在文本绑定内嵌套其他绑定，也不要给同一元素同时添加两种属性。自动同步的表单控件使用 `data-univer-cell-model`；文档元数据、脚本、样式和空元素不能承载绑定。

| 模型控件                                                   | 值类型   | 在渲染器中的提交事件              |
| ---------------------------------------------------------- | -------- | --------------------------------- |
| `input`（默认或 `type="text"`）、`textarea`、单选 `select` | 字符串   | `change`                          |
| `input type="number"`                                      | 有限数值 | `change`                          |
| `input type="range"`                                       | 有限数值 | `input` 节流，`change` 提交最终值 |
| `input type="checkbox"`                                    | 布尔值   | `change`                          |

拒绝其他 input 类型和 `select multiple`。渲染器遵循原生约束（`min`、`max`、`step` 等）、`disabled` 和 `readonly`。数据到达前控件禁用，单元格类型不兼容时禁止编辑。数值字段为空时保留草稿，不写零或清空单元格。远端更新不覆盖正在编辑的草稿，非法输入或写入失败保留草稿并显示错误，Escape 恢复最新单元格值。滑块输入期间每 100 毫秒最多提交一次最新值，change 时立即提交。

## 引用与标量值

Cell 引用由冒号分隔的三部分构成：`unitId:sheetId:A1`。两个 ID 分别用 `encodeURIComponent` 编码；解析器先分割，再各解码一次。稳定 ID 区分大小写，列名字母不区分。B7 对应从 0 开始的第 6 行、第 1 列。空 ID、错误的百分号编码、$A$1 等绝对地址以及超出安全整数的坐标均非法。将任意值嵌入 HTML 时还需转义 HTML 属性字符；URI 编码只针对 ID。

Range 属性使用 `unitId:sheetId:A1:B10`，`parseRangeReference()` 返回 `{ unitId, sheetId, range: { startRow, endRow, startColumn, endColumn } }`。范围包含首尾，结束不得小于开始，单格范围写为 `A1:A1`。两个 ID 仍各自编码，新增冒号属于范围地址。

属性同时标明消费数据的元素和数据引用，ById 方法为该声明注册自定义渲染回调，因此绑定关系可以直接从 DOM 读取，无需分析回调内部行为。完整语法和接口说明见 [HTML 元素绑定与按 ID 订阅](docs/element-bindings.md)。

运行时，行列增删后坐标保持固定。标量读取保留字符串、数值和布尔类型，公式返回计算结果，空单元格、缺失或越界读取返回 `{ value: null }`。标量写入只接受字符串、有限数字或布尔值，替换旧公式和富文本，坐标不存在时抛错。字符串按字面值保存，`setCellValue()` 不接受 `null`。

## 解析接口

| 导出                                                | 合同                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `parseHtmlView(source: string)`                     | 返回 `HtmlViewDocument`：`{ html, bindings }`，规范化文档并生成 `data-univer-binding` 标记，替换已有标记。                          |
| `parseCellReference(value: string)`                 | 返回 `{ unitId, sheetId, row, col }`，引用非法时抛错。                                                                              |
| `cellReferenceKey(reference)`                       | 为四个引用字段生成稳定字符串 key，不做授权校验。                                                                                    |
| `getHtmlViewUnitIds(document)`                      | 按首次出现顺序返回声明的去重 Unit ID，不检查 JavaScript 请求。                                                                      |
| `isHtmlViewFilename(filename)`                      | 不区分大小写检查 `.univer.html` 后缀，不验证内容。                                                                                  |
| `parseCellBinding(tagName, attribute, insideText?)` | 底层解析器，`attribute(name)` 返回字符串或 `undefined`，`insideText` 默认为 false。返回不含 `id` 的绑定，无绑定时返回 `undefined`。 |

导出类型包括 `HtmlCellReference`、`HtmlRangeReference`、`HtmlBindingDeclaration`、`HtmlViewBinding` 和 `HtmlViewDocument`。每个绑定包含 `{ id, kind: "text" | "model" | "cell" | "range", reference, disabled }`，`disabled` 记录声明的禁用属性。`parseHtmlView()` 的错误指出元素、行号和绑定问题；HTML 本身按 HTML 解析规则规范化，不会拒绝每种标记错误。作者脚本后续可增删或修改绑定，渲染器监听这些变化并管理订阅。订阅导致的 DOM 更新不会触发写回。

## 错误与后续集成

可运行的错误处理示例见[校验示例](docs/validation.zh-CN.md)。解析不构成安全边界，JavaScript 可以请求 `getHtmlViewUnitIds()` 中未出现的 Unit ID。宿主必须为每次运行时 Unit 加载授权，服务端必须执行访问控制。执行页面时请使用 renderer 包内的集成指南，不要把解析后的 HTML 直接放入可信应用 DOM。

## 发布内容

包含 ES modules、CommonJS 和 TypeScript 声明，不包含源码和 source map。两种语言的 README 和全部 `docs/*.md` 随 npm 包提供，可在 `node_modules/@univerkit/` 下阅读。

## 许可证

以 Apache-2.0 许可发布。第三方依赖遵循各自的许可证。
