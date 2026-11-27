# 订阅行为与设计

[English](change-subscription.md)

[返回 README](../README.zh-CN.md)。本文先说明公开订阅合同，再解释实现取舍。使用方只需 `subscribeCell()` 和 `subscribeRange()`，无需内部 SDK 监听器或源码。

## 完整订阅辅助函数

传入已完成 `await engine.load()` 的 Engine 和真实子表 ID。返回的清理函数只停止当前观察者，保留 Engine 和其他观察者。

```ts
import type { BindingEngine } from "@univerkit/binding-engine";

export function observeCell(engine: BindingEngine, sheetId: string) {
  const reference = { sheetId, row: 0, col: 0 };
  const first = engine.subscribeCell(reference, (state) => console.log("First:", state.value));
  const second = engine.subscribeCell(reference, (state) => console.log("Second:", state.value));
  // Both callbacks have already received the current value here.
  return () => {
    first.dispose();
    second.dispose();
  };
}
```

## 可观察合同

每个订阅立即交付当前 `{ value }`，随后只交付实际值变化。范围更新包含完整矩阵，不是增量 patch。引用被复制，结构变化后仍指向固定坐标。每次注册都有独立、幂等的 `dispose()`，包括重复注册同一个回调。回调异常会被报告，但不阻断其他监听者。Engine 释放时移除全部订阅。

## 当前失效策略

Engine 监听目标 Unit 的 SDK mutation（也包括未带 Unit ID 的 mutation）及公式结果应用。失效在微任务中合并，每轮对订阅的单元格或完整范围读取一次，比较值后通知。相同目标共享读取，不同或重叠范围独立管理。取消最后一个监听者后删除对应记录。读取使用 SDK 模型，因此行列和子表变化遵循固定坐标语义，无需重复实现公式或协同逻辑。

通知是值快照，不是审计日志：多次同步编辑可能被合并，未改变最终值的编辑不会产生额外值通知。公式结果可能晚于原始 mutation 到达并触发再次刷新。`flush()` 等待协同确认，不是订阅事件计数器，也不保证交付每一个中间值。

## 其他监听方案

| 策略                                  | 优点                         | 额外工作                                               |
| ------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| Facade `SheetValueChanged` 受影响范围 | 简洁，复用 SDK 范围推导。    | 验证 Headless/活动表前置条件及结构变化覆盖。           |
| 按 mutation 精确过滤范围              | 可避免读取无关目标。         | 跟踪所有相关 mutation 及坐标影响，包括行列和子表变化。 |
| 当前 Unit 级失效                      | 结构变化覆盖广，所有权简单。 | 可能读取未变化的目标，再抑制重复通知。                 |

任何策略都需要在公式结果应用后读取，并比较实际值。只过滤直接单元格写入会漏掉远端结构变化、撤销重做、排序和公式更新。调整策略时必须保留本地与远端写入、撤销重做、结构变化、缺失子表、公式、独立取消和通知期间释放的覆盖。

## 监听入口代码与方案比较

以下保留两种内部监听方案的关键代码，用于解释上面的取舍。它们不是使用公开订阅接口时必须额外安装的监听器。片段中的 `univer`、`univerAPI`、`options` 和 `ref` 分别代表内部 SDK 实例、Facade、Engine 配置和目标引用；`onChange` 是内部状态刷新回调。使用方集成从本文前面的完整订阅辅助函数开始。

两种方案保持相同的 Binding 接口，区别在于值变化的监听入口。以下片段针对已加载的
有效单元格，省略通用状态管理，用于说明监听入口与取舍。

```ts
// 以下为引擎内部监听方案，api 是内部 Headless Univer 的 Facade。
const api = univerAPI;
const { unitId } = options;
const { sheetId, row, col } = ref;
const cell = () => api.getWorkbook(unitId)!.getSheetBySheetId(sheetId)!.getRange(row, col);
```

### 方案一：Facade 事件

使用 `SheetValueChanged` 提供的受影响范围，判断是否包含目标单元格。

```ts
const values = api.addEvent(api.Event.SheetValueChanged, (event) => {
  const affected = event.effectedRanges.some((range) => {
    const area = range.getRange();
    return (
      range.getUnitId() === unitId &&
      range.getSheetId() === sheetId &&
      row >= area.startRow &&
      row <= area.endRow &&
      col >= area.startColumn &&
      col <= area.endColumn
    );
  });
  if (affected) onChange(cell().getRawValue());
});
```

优点是接口简洁，复用 SDK 的范围推导。当前源码中的事件由固定 mutation 列表生成，
且带有 `getActiveSheet()` 前置检查；headless 场景和行列、子表结构变化需要补齐覆盖。
这些 SDK 前置条件应按实际使用的版本核对。

### 方案二：直接监听 mutation

通过 `ICommandService.onCommandExecuted` 识别 mutation，按其参数定位受影响单元格。
以下以直接写值为例，`univer` 是引擎持有的 SDK 实例。

```ts
import { ICommandService } from "@univerjs/core";
import { SetRangeValuesMutation, type ISetRangeValuesMutationParams } from "@univerjs/sheets";

const commands = univer.__getInjector().get(ICommandService);
const values = commands.onCommandExecuted((command) => {
  if (command.id !== SetRangeValuesMutation.id) return;
  const params = command.params as ISetRangeValuesMutationParams;
  if (params.unitId !== unitId || params.subUnitId !== sheetId) return;

  // 空 cellValue 表示清空；稀疏矩阵只检查目标坐标是否包含在本次写入中。
  if (params.cellValue == null || Object.hasOwn(params.cellValue[row] ?? {}, col)) {
    onChange(cell().getRawValue());
  }
});
```

这一方式直接对应 Univer 内部的监听机制，按目标 Unit 工作。完整实现需要为移动、
排序、行列增删和子表增删增加对应处理，按固定坐标语义重新读取值。
范围推导可复用 SDK 现有工具，覆盖清单由 Binding 明确维护。

### 两种方案共用：公式结果与写值

```ts
const formulas = api.getFormula().calculationResultApplied((result) => {
  const cells = result.unitData[unitId]?.[sheetId];
  if (Object.hasOwn(cells?.[row] ?? {}, col)) {
    onChange(cell().getRawValue());
  }
});

cell().setValue(20);

values.dispose();
formulas.dispose();
```

公式结果应用后再读取。数据通知表示目标受影响，
Binding 仍需比较实际值，再向订阅者发出变化。

### 取舍

| 维度     | Facade 事件                              | 直接 mutation                      |
| -------- | ---------------------------------------- | ---------------------------------- |
| 接入     | 简洁，SDK 已提供受影响范围               | 需要按 mutation 解析影响           |
| Headless | 需验证并处理活动表前置条件               | 直接定位目标 Unit                  |
| 覆盖     | 依赖事件的 mutation 列表，结构变化需补充 | Binding 显式维护值与结构变化的覆盖 |
| 演进     | 跟随 Facade 事件合同                     | 跟随 mutation 合同及范围工具       |

Engine 采用 [README 中定义的 Unit 级 mutation 失效](../README.zh-CN.md#变化订阅)；上述精确范围方案和 Facade 方案用于比较
不同监听入口。更换失效策略需要覆盖
直接写值、远端更新、撤销重做、结构变化和公式结果的完整通知。
