# 验证 HTML 视图

[English](validation.md)

[返回 README](../README.zh-CN.md)。本例只使用已安装的解析器和 Node.js 内置模块，无需工作簿或仓库源码。

## 运行示例

完成 README 中的安装后，保存为 `validate-view.mjs` 并运行 `node validate-view.mjs`。预期输出三条绑定错误，最后输出成功消息。

```js
import assert from "node:assert/strict";
import { parseHtmlView, parseCellBinding } from "@univerkit/html-view";

const cases = [
  '<span data-univer-cell-text="book:sheet:A0"></span>',
  '<input type="radio" data-univer-cell-model="book:sheet:A1">',
  '<div data-univer-cell-text="book:sheet:A1"><span data-univer-cell-text="book:sheet:B1"></span></div>',
];
for (const source of cases) {
  assert.throws(() => parseHtmlView(source));
  try {
    parseHtmlView(source);
  } catch (error) {
    console.log(error.message);
  }
}
const attributes = new Map([
  ["type", "number"],
  ["data-univer-cell-model", "book:sheet:B7"],
]);
const binding = parseCellBinding("input", (name) => attributes.get(name));
assert.deepEqual(binding, {
  kind: "model",
  disabled: false,
  reference: { unitId: "book", sheetId: "sheet", row: 6, col: 1 },
});
console.log("Validation examples passed.");
```

## 应用中的失败处理

替换当前页面前捕获解析错误，将错误展示给作者，便于修复指定元素和行。动态插入的绑定由渲染器通过 `onError` 报告问题，标记非法元素，并释放被修改或移除的订阅。初始解析器不会执行脚本来发现后续绑定。

## 校验不保证的事项

合法绑定不代表工作簿存在、单元格类型兼容或调用方拥有读写权限，这些检查发生在运行时加载与编辑过程中。规范化可能改变 HTML 序列化并生成绑定 ID，不应把它当作逐字保留格式的工具或 HTML 净化器。
