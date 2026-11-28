# HTML 元素绑定与按 ID 订阅

本文说明四种 HTML 属性及按元素 ID 接收数据的接口。

## 绑定属性

| 属性                          | 行为                                           | 接受的引用 |
| ----------------------------- | ---------------------------------------------- | ---------- |
| `data-univer-cell-text`       | 自动订阅并更新元素文本                         | Cell       |
| `data-univer-cell-model`      | 自动订阅并支持控件写回                         | Cell       |
| `data-univer-cell-subscribe`  | 自动订阅，通过 `subscribeCellById()` 接收数据  | Cell       |
| `data-univer-range-subscribe` | 自动订阅，通过 `subscribeRangeById()` 接收数据 | Range      |

同一元素只能声明上述一种绑定属性。`cell-text` 将单元格值显示为文本，`cell-model` 同步控件值并处理写回。
控件类型、提交事件、草稿处理和保存语义见 [运行时规则](../../html-view/README.zh-CN.md#输入与更新)。

`cell-subscribe` 和 `range-subscribe` 只声明数据关联，不自动修改 DOM。自定义展示由页面回调负责。
通过 `ById` 访问的元素必须具有非空、在当前页面中唯一的 HTML `id`；它不是解析器内部生成的绑定 ID。

```html
<span data-univer-cell-text="unit-id:sheet-id:B5"></span>

<input type="number" data-univer-cell-model="unit-id:sheet-id:B2" />

<div id="revenue" data-univer-cell-subscribe="unit-id:sheet-id:B5"></div>

<div id="trend-chart" data-univer-range-subscribe="unit-id:sheet-id:A15:F21"></div>
```

## 为什么由 HTML 声明订阅

HTML 属性将元素与它使用的 Unit、Sheet、Cell/Range 放在一起，使数据引用可以直接从 DOM 读取。
运行时根据声明管理数据订阅，ById 方法用原生 HTML ID 为该元素注册回调。
回调负责数值格式化、图表或列表渲染，绑定关系无需通过回调内部实现来推断。

`getCellState()` / `getRangeState()` 用于按钮操作和提交校验等一次性读取；写入与保存由对应 JavaScript 接口处理。
底层 BindingEngine 为运行时提供数据访问，页面通过 HTML 声明和 ById 回调订阅数据。

## 模板中的声明粒度

声明放在实际消费数据的元素或组件上，范围大小由展示需求决定：

- 单值文本使用 `cell-text`；格式化的单值、百分比、进度条使用 `cell-subscribe`。
  多个元素使用同一单元格时，各自声明引用。不要为复用回调，把独立指标合成外层大范围。
- 列表、表格和图表使用 `range-subscribe`，只包含需要的行列。循环生成内容仍由普通 JavaScript 完成，
  不需要为每个生成的节点增加声明，也不引入循环语法。
- 动态记录区需要包含业务允许新增的位置。例如活动示例支持第 2–81 行的 80 个名额，
  名单声明保留 `A2:G81`，避免漏掉当前空行中的新报名；这是该示例的固定容量，不是 SDK 限制。
- 提交时才使用的数据由 `getCellState` / `getRangeState` 即时读取，无需为写入检查添加展示订阅。

活动示例的人数分别绑定 `summary!B2`、`B3`、`B4`，签到率和进度条各自绑定 `B5`，
场次进度列表绑定 `A9:C11`。这些位置由模板显式声明，回调内部的数据流不属于声明语法。

## 引用格式

Cell 引用使用 Unit ID、Sheet ID 和单个 A1 地址；Range 引用使用矩形范围地址：

```text
Cell:  <encodedUnitId>:<encodedSheetId>:B5
Range: <encodedUnitId>:<encodedSheetId>:A15:F21
```

两个 ID 各自按 `encodeURIComponent` 编码。解析时先以头两个冒号分出 Unit、Sheet 和地址，
分别解码两个 ID 一次；剩余地址按 Cell 或 Range 校验，范围中的冒号属于地址。
不引入数据源别名、父元素作用域或表达式语法。

Cell 接受单个 A1 地址；Range 接受 `A1:B10` 形式的矩形，单格范围写成 `B5:B5`。
列名不区分大小写，行列坐标必须有效，范围结束坐标不能小于开始坐标。
范围首尾均包含，转换为 SDK 的四个从 0 开始的边界坐标。

引用使用固定坐标。行列插入、删除后读取原坐标的当前内容，不追踪记录身份。
值类型、空值和越界读取由 CellState、RangeState 表达。

## 按元素 ID 订阅

`window.univerBinding` 的 `BindingEngineClient` 提供以下方法，复用现有状态类型
和 `Promise<IDisposable>` 订阅形式：

```ts
interface BindingEngineClient {
  subscribeCellById(elementId: string, listener: (state: CellState) => void): Promise<IDisposable>;

  subscribeRangeById(
    elementId: string,
    listener: (state: RangeState) => void,
  ): Promise<IDisposable>;
}
```

`subscribeCellById()` 查找声明 `data-univer-cell-subscribe` 的元素；`subscribeRangeById()` 查找声明
`data-univer-range-subscribe` 的元素。传入原生 ID 字符串，不带 `#`，不接受 CSS 选择器。
调用时目标元素必须已经存在；不存在、ID 重复、属性缺失、类型不匹配或引用非法时，Promise 拒绝。

运行时为属性声明自动建立数据订阅。`ById` 注册的是该元素绑定的回调，复用已有订阅，
不会因为注册回调而再创建一条独立的数据订阅。即使尚无回调，合法声明仍会建立订阅。

每次注册先交付当前状态，再通知后续变化；首次交付在返回的 Promise 完成前发生。
已有状态时交付缓存状态，尚在加载时等待首次状态。范围返回完整二维数组，不自动转成对象、
提取表头或过滤空行。授权与加载失败沿用现有订阅错误语义。

```html
<div id="attendees" data-univer-range-subscribe="unit-id:sheet-id:A2:G81"></div>

<script>
  const binding = window.univerBinding;
  const container = document.getElementById("attendees");

  binding
    .subscribeRangeById("attendees", ({ value }) => {
      // 示例仅展示矩阵；这里可以替换成卡片、列表或图表的普通 JS。
      container.textContent = JSON.stringify(value);
    })
    .catch((error) => {
      container.textContent = error.message;
    });
</script>
```

### 生命周期

- 相同引用共享底层订阅，每次回调注册独立取消。`dispose()` 幂等，只停止本次回调，
  不移除元素声明，也不影响其他监听者。
- 已绑定元素的引用改变时，释放旧引用的使用关系，切换到新引用；仍有效的回调接收新引用的
  首次状态，停止交付旧引用的迟到通知。
- 元素移除或对应绑定属性移除后，释放该元素的绑定和回调；同一引用仍被其他元素使用时，
  保留共享订阅。用相同 ID 新建元素不会自动继承原元素的回调，需要重新注册。
- 作者脚本新增合法绑定元素时，运行时识别声明并建立订阅。ID 用于注册时定位，已注册回调
  关联实际元素，不因其他元素后来使用该 ID 而转移。
- 回调异常不阻断其他监听者；页面销毁时释放全部订阅与监听，沿用现有错误报告和释放流程。

## 写入

`data-univer-cell-model` 自动处理控件写回。按钮提交可通过 `setCellValue()` 写入单元格，
或通过 `insertRowsWithValues()` 插入并填充记录，再用 `flush()` 等待保存确认。自定义表单逻辑使用普通 JavaScript。
