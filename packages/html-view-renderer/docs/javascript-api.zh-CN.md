# 页面 JavaScript 接口

[English](javascript-api.md)

[返回 README](../README.zh-CN.md) · [完整宿主集成](integration.zh-CN.md)。页面运行时在作者脚本执行前创建 `window.univerBinding`。调用跨消息通道完成，Engine、Univer 对象及协同凭据保留在宿主。这些接口只在生成的视图内可用，直接打开 HTML 文件不会提供接口。

## 接口

```ts
import type { IDisposable } from "@univerjs/core";
import type { CollaborationStatus } from "@univerjs-pro/collaboration-client";
import type { CellState, CellValue, RangeState } from "@univerkit/binding-engine";
import type { HtmlCellReference } from "@univerkit/html-view";
import type {
  HtmlRangeReference,
  HtmlInsertRowsWithValuesParams,
} from "@univerkit/html-view-renderer";

// Signature summary; the runtime supplies the implementation on window.
interface BindingEngineClient {
  subscribeCellById(elementId: string, listener: (state: CellState) => void): Promise<IDisposable>;
  subscribeRangeById(
    elementId: string,
    listener: (state: RangeState) => void,
  ): Promise<IDisposable>;
  getCellState(reference: HtmlCellReference): Promise<CellState>;
  getRangeState(reference: HtmlRangeReference): Promise<RangeState>;
  setCellValue(reference: HtmlCellReference, value: CellValue): Promise<void>;
  insertRowsWithValues(params: HtmlInsertRowsWithValuesParams): Promise<void>;
  getCollaborationStatus(unitId: string): Promise<CollaborationStatus>;
  subscribeCollaborationStatus(
    unitId: string,
    listener: (status: CollaborationStatus) => void,
  ): Promise<IDisposable>;
  flush(): Promise<void>;
}
```

为作者代码做类型检查时，从本包导入真实 `BindingEngineClient` 类型。若作者项目需要 Window 声明，将以下内容放入已包含的 `.d.ts` 文件；它只导入类型，不在宿主执行运行时。

```ts
import type { BindingEngineClient } from "@univerkit/html-view-renderer";
declare global {
  interface Window {
    readonly univerBinding: BindingEngineClient;
  }
}
```

## 为什么由 HTML 声明订阅

`data-univer-cell-subscribe` 和 `data-univer-range-subscribe` 声明元素消费的数据。运行时管理数据订阅，`subscribeCellById()` / `subscribeRangeById()` 通过原生 HTML ID 注册渲染回调。数据引用放在元素上，使绑定关系可以从 DOM 读取，无需推断回调最终更新了哪些元素。

回调通过普通 JavaScript 处理格式化、图表和列表；`data-univer-cell-text` 和 `data-univer-cell-model` 自动同步文本与控件。`getCellState()` / `getRangeState()` 为按钮操作和提交校验提供一次性读取，写入方法与 `flush()` 负责数据变更和保存。

宿主的 BindingEngine 为运行时提供数据访问，页面通过 HTML 声明和 ById 回调订阅数据。

## 完整页面示例

保存为视图模板，将文本交给宿主集成。把 HTML 声明和 JavaScript 中的两个 ID 替换为真实、经宿主授权的稳定 ID。HTML 属性中的每个 ID 使用 `encodeURIComponent` 编码，JavaScript 对象引用使用原始 ID。子表至少有四行三列，A1 为数值或空值。页面读取并订阅 A1 和 A1:C4，提供明确的编辑按钮，保存单独执行。脚本使用的全部 DOM 元素及辅助函数都在这里定义。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Workbook records</title>
  </head>
  <body>
    <p>
      A1:
      <span id="value" data-univer-cell-subscribe="your-workbook-id:your-worksheet-id:A1"
        >Loading...</span
      >
    </p>
    <p>Sync status: <span id="sync"></span></p>
    <pre id="matrix" data-univer-range-subscribe="your-workbook-id:your-worksheet-id:A1:C4"></pre>
    <button id="increment" disabled>Add 1 to A1</button>
    <button id="insert" disabled>Insert two records</button>
    <button id="save">Save and continue</button>
    <p id="result" role="status"></p>
    <script>
      (async () => {
        const client = window.univerBinding;
        const unitId = "your-workbook-id";
        const sheetId = "your-worksheet-id";
        const cell = { unitId, sheetId, row: 0, col: 0 };
        const range = {
          unitId,
          sheetId,
          range: { startRow: 0, endRow: 3, startColumn: 0, endColumn: 2 },
        };
        const subscriptions = [];
        const result = document.querySelector("#result");
        window.addEventListener(
          "pagehide",
          () => {
            subscriptions.forEach((subscription) => subscription.dispose());
          },
          { once: true },
        );
        function action(id, apply) {
          const button = document.querySelector(id);
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              await apply();
              result.textContent = "Operation complete";
            } catch (error) {
              result.textContent = "Failed: " + error.message;
            } finally {
              button.disabled = false;
            }
          });
        }
        action("#save", () => client.flush());
        try {
          console.log("Initial A1:", await client.getCellState(cell));
          console.table((await client.getRangeState(range)).value);
          console.log("Initial status:", await client.getCollaborationStatus(unitId));
          subscriptions.push(
            await client.subscribeCellById("value", ({ value }) => {
              document.querySelector("#value").textContent = String(value ?? "");
            }),
          );
          subscriptions.push(
            await client.subscribeRangeById("matrix", ({ value }) => {
              document.querySelector("#matrix").textContent = JSON.stringify(value, null, 2);
            }),
          );
          subscriptions.push(
            await client.subscribeCollaborationStatus(unitId, (status) => {
              document.querySelector("#sync").textContent = String(status);
            }),
          );
          action("#increment", async () => {
            const { value } = await client.getCellState(cell);
            if (value !== null && typeof value !== "number") throw new Error("A1 must be numeric");
            await client.setCellValue(cell, (value ?? 0) + 1);
          });
          action("#insert", () =>
            client.insertRowsWithValues({
              unitId,
              sheetId,
              startRow: 1,
              rowCount: 2,
              startColumn: 0,
              values: [
                ["Alice", 123, true],
                ["Bob", null, false],
              ],
            }),
          );
          document.querySelector("#increment").disabled = false;
          document.querySelector("#insert").disabled = false;
        } catch (error) {
          subscriptions.forEach((subscription) => subscription.dispose());
          result.textContent = "Initialization failed: " + error.message;
        }
      })();
    </script>
  </body>
</html>
```

加一示例是先读后写，不是协同原子递增，并发编辑可能覆盖彼此计算出的值。编辑按钮成功只代表本地执行完成，使用 Save 等待服务端确认。保存失败后重试 Save，不要重试 Insert：插行已在本地发生，重复执行会继续新增行。插行后订阅矩阵仍为 A1:C4。

## 单元格与范围合同

`HtmlCellReference` 为 `{ unitId, sheetId, row, col }`。ID 是非空、区分大小写的稳定 ID，坐标从 0 开始且为非负安全整数。读取返回 `{ value }`，标量为字符串、数值、布尔值或 `null`；公式单元格返回计算结果。子表缺失、空单元格和越界读取返回 `null`。写入接受字符串、有限数值或布尔值，替换旧公式/富文本，坐标不存在时拒绝。字符串按字面值保存，`setCellValue()` 不能写 `null`。

`HtmlRangeReference` 为 `{ unitId, sheetId, range: { startRow, endRow, startColumn, endColumn } }`。四个边界为首尾包含的非负安全整数，结束不得早于起始。`RangeState.value` 为按行排列的只读矩阵，尺寸与请求完全一致，缺失位置填 `null`。忽略 SDK `IRange` 的其他元数据。行列变化后，单元格与范围引用仍指向固定位置，订阅输入在建立时被捕获。

## 插入行并填值

`HtmlInsertRowsWithValuesParams` 在 `{ sheetId, startRow, rowCount, startColumn, values }` 基础上增加 `unitId`。`startRow`/`startColumn` 为非负安全整数，`rowCount` 为正安全整数。插入位置等于当前行数时追加，大于行数时拒绝。`values` 为新行内非空矩形局部矩阵，从 `startColumn` 开始，必须满足 `values.length <= rowCount`。接受字符串、有限数值、布尔值和表示空白的 `null`。宽度必须适合子表，不自动增列，未填的新行/列留空。所有参数先完成校验，再执行变更。

插行与标量写入共用宿主串行写入队列，按请求顺序执行。Promise 在本地操作完成后成功，之后由 `flush()` 等待确认。宿主保存离开期间和连接关闭后拒绝新写入。

## 订阅与协同状态

ById 订阅在 Promise 完成前交付初始状态，随后交付变化值；每次范围更新包含完整矩阵。相同引用共享底层消息订阅，但每次回调注册独立取消。返回的 `dispose()` 同步且幂等，立即停止该回调；元素的数据订阅保留到声明或元素移除。不要在初始回调内访问返回的订阅对象，此时它尚未赋值。回调异常会被报告，不阻断其他监听者；关闭页面会清理剩余订阅。

协同状态接口接收 Unit ID，使用 SDK `CollaborationStatus`。状态订阅同样在 Promise 完成前交付初始通知；取消时直接释放该次状态订阅，不依赖 HTML 声明。宿主 TypeScript 可与 `@univerjs-pro/collaboration-client` 导出的 `CollaborationStatus.SYNCED` 比较；示例显示原始状态，因此作者 HTML 无需额外导入。状态快照可用于 UI，但离开时仍需等待 `flush()`。

## 保存与错误

页面 `flush()` 先提交声明式 DOM 草稿、等待已发出的写入，再等待已加载 Unit 的协同确认，成功后仍可编辑。宿主 view 的 `flush()` 同样保存并继续；`prepareToLeave()` 暂停编辑并保存，成功后保持暂停，再释放视图或通过 `resume()` 恢复。失败且连接仍有效时恢复交互。自定义 JavaScript 表单状态不会自动提交，必须先调用写入 API 再 flush。

引用非法、访问拒绝、加载失败和写入失败都会拒绝对应 Promise。即使之后 flush 成功，也必须处理失败的操作，flush 不会重放全部历史错误。通道关闭会拒绝在途请求并停止通知。订阅、页面或宿主释放都不隐式保存。应保留失败草稿并提供修正或重试保存的入口，不要仅因 `setCellValue()` 成功就显示已保存。

## Subscribe by HTML element ID

```html
<div id="trend" data-univer-range-subscribe="unit-id:sheet-id:A15:F21"></div>
<span id="amount" data-univer-cell-subscribe="unit-id:sheet-id:B5"></span>
<script>
  window.univerBinding
    .subscribeRangeById("trend", ({ value }) => {
      document.getElementById("trend").textContent = JSON.stringify(value);
    })
    .catch(console.error);
  window.univerBinding
    .subscribeCellById("amount", ({ value }) => {
      document.getElementById("amount").textContent = String(value ?? "");
    })
    .catch(console.error);
</script>
```

属性自动订阅但不修改 DOM，ById 复用元素的订阅，先交付当前值再完成 Promise，随后推送变化。
传入原生 HTML id（不带 #），目标必须已经存在且 ID 唯一。元素不存在、引用非法或绑定类型不匹配时拒绝 Promise。
CellById 仅用于 `data-univer-cell-subscribe`，RangeById 仅用于 `data-univer-range-subscribe`。

每次回调独立取消；取消回调不移除元素声明。引用改变时保留回调并切换订阅，忽略旧引用的迟到通知。
移除元素或数据属性后结束相关回调；相同 ID 的替换元素需要重新注册。支持动态元素及刚插入后立即调用 ById。
页面销毁时统一释放。自定义展示使用普通 JS，直接读取与写入接口继续保留。
完整规则见 [HTML 元素绑定与按 ID 订阅](../../html-view/docs/element-bindings.md)。
