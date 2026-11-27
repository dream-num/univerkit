# renderHtmlView 与内置 Inspector

[English](render.md) · [返回 README](../README.zh-CN.md) · [完整集成](integration.zh-CN.md)

## 模板加载与渲染

下面是接入函数，`container`、模板地址和 `loadEngine` 由调用它的应用传入。
`loadEngine` 的完整实现见集成指南；它不是 SDK 自动猜测的连接配置。

```ts
import { renderHtmlView, type RenderHtmlViewOptions } from "@univerkit/html-view-renderer/render";

export async function loadPreview(
  container: HTMLElement,
  templateUrl: string,
  loadEngine: RenderHtmlViewOptions["loadEngine"],
) {
  const response = await fetch(templateUrl);
  if (!response.ok) throw new Error("模板加载失败");
  const view = renderHtmlView({
    container,
    html: await response.text(),
    loadEngine,
    onError: (error) => console.error(error),
  });
  try {
    await view.ready;
    return view;
  } catch (error) {
    view.dispose();
    throw error;
  }
}
```

调用方持有返回的 view，并在页面移除时调用 `view.dispose()`。
检查是可选操作，通过 `view.inspect.open()` 开启；名称查询示例见[绑定检查](binding-inspection.zh-CN.md)。

应用给容器设置宽高。SDK 在其中创建自己的根节点、Shadow DOM、iframe 和检查面板，
不会清空容器里的其他节点。一个容器只能挂载一个 view，销毁后可以重新挂载。

`html` 是模板源码字符串，模板下载、源码编辑、AI 生成与业务文件管理由应用处理。
SDK 内置同次构建生成的 iframe 程序，应用无需提供脚本文本或自行装配 iframe。
Vite 用于示例的构建与开发服务，不是 renderHtmlView 的运行时依赖。

## 输入

| 参数                         | 含义                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `container`                  | 应用提供的 HTMLElement，一般是 div；尺寸由应用控制                                                                                                                       |
| `html`                       | 完整 HTML 模板字符串                                                                                                                                                     |
| `locale`                     | 可选 `"en-US"`（默认）或 `"zh-CN"`。创建时确定 SDK 界面语言，包括侧栏、浮层、诊断和无障碍标签；不翻译模板内容和业务名称                                                  |
| `loadEngine(unitId, signal)` | 应用完成权限检查和连接配置，返回已加载的 Engine。取消或失败时释放未交付的 Engine；成功交付后 SDK 负责释放。不要交付其他页面共享的实例                                    |
| `policy.allowedOrigins`      | 可选的外部 HTTP(S) 资源来源白名单，默认不允许外部资源；模板原生表单导航被阻止                                                                                            |
| `policy.mediaSources`        | 可选的 HTTP(S) URL，可带路径，只允许图片和音视频加载；以 `/` 结尾时放行该路径下的全部地址。脚本、请求、frame 和 worker 不受影响。页面是不透明 origin，请求不携带宿主凭据 |
| `onError(error)`             | 异步渲染/绑定错误通知。主动调用的方法失败时仍拒绝 Promise，由应用捕获                                                                                                    |

Engine 类型为 `/render` 导出的 `BindingEnginePort`，现有 BindingEngine 满足该结构。
加载一个 Unit 失败不会关闭其他 Unit 的数据连接。

创建 view 时，非法模板或已占用的容器会同步抛错。`ready` 拒绝与后续主动方法的 Promise 拒绝需要由应用处理；`onError` 不替代这些错误处理。

## View API

| 方法                     | 效果                                                                     |
| ------------------------ | ------------------------------------------------------------------------ |
| `ready`                  | iframe 页面程序完成握手；不代表所有 Unit 数据已经到达。15 秒未握手则拒绝 |
| `subscribe(listener)`    | 立即通知当前状态，随后通知变化；返回取消订阅函数                         |
| `flush()`                | 提交当前控件草稿和此前写入，等待协同确认，页面继续编辑                   |
| `prepareToLeave()`       | 暂停编辑并保存，成功后保持暂停；保存失败且连接仍有效时恢复编辑           |
| `resume()`               | 从暂停状态恢复编辑，例如应用取消了导航；ready 时无操作                   |
| `inspect.open(options?)` | 开启内置检查面板和交互。首次按需创建 UI，已经打开时无操作                |
| `inspect.close()`        | 关闭面板，清除检查选择、高亮和浮层，恢复模板的点击行为                   |
| `dispose()`              | 释放连接、Engine、检查组件和 SDK 根节点。幂等，不自动保存                |

普通保存不需要 resume。`prepareToLeave()` 成功后页面仍暂停；继续留在页面时调用 resume。
暂停时调用普通 flush 会拒绝。保存、离开提交和恢复按调用顺序执行。

以下流程示意中的 `view` 为已创建的实例，`applicationNavigate` 是应用自己的导航操作：

```ts
await view.prepareToLeave();
try {
  await applicationNavigate();
} catch (error) {
  await view.resume();
  throw error;
}
```

## 状态

`HtmlViewState` 包含 `phase`、`inspecting`、`pending` 和 `sources`：

| phase                   | 含义                                  |
| ----------------------- | ------------------------------------- |
| `connecting`            | 等待 iframe 页面程序握手              |
| `ready`                 | 连接可用，可编辑                      |
| `flushing-before-leave` | 正在暂停并提交离开前的修改            |
| `paused`                | 离开前保存完成，保持暂停              |
| `closed`                | 连接关闭或握手超时；需要重新创建 view |
| `disposed`              | 应用已销毁 view                       |

普通 flush 不改变 phase。`pending.drafts` 表示控件草稿，`pending.writes` 表示未完成写入，
`pending.confirmation` 表示协同状态尚未确认同步。`sources` 按 Unit 提供 unitId、
loading/ready/error 阶段，以及可选的协同 status 或错误 error。
`inspecting` 仅表示检查面板是否打开，方便应用工具栏同步开关。

## Inspector 的接口与效果

使用方只提供可选的 `loadMetadata(unitId, signal)`。SDK 自己处理以下联动：

- 面板按 Unit → Sheet → 引用组织，同一引用展示关联的多个页面元素。
- 点击面板里的引用，突出显示关联元素；点击元素条目或页面元素，打开固定详情浮层。
- hover 显示 tooltip；固定详情打开时隐藏 tooltip。浮层由 SDK 在 iframe 内渲染。
- 点击浮层关闭按钮、空白区域或按 Escape 清除选择，并同步面板。
- 每次打开检查默认开启全部高亮，使用青色虚线，选中使用更粗的紫色实线。切换全部高亮保留选择，清除选择后恢复开启中的全部高亮样式。
- DOM 绑定变更自动更新面板；移除元素时清理对应浮层和高亮。
- 名称由应用查询，有名称时不重复显示 ID；名称缺失、为空白或查询失败时显示 `id: xxx`；Refresh 可重试名称查询。
- 检查模式会截获模板点击，关闭检查后恢复原有交互。

名称只能用于展示，不改变绑定引用。SDK 不猜测业务名称，也不使用名称查询结果进行授权。
检查关闭或 view 销毁时中止名称请求，迟到结果不会重新打开 UI。

## 内部职责

内部按执行环境分为 `host`（宿主侧）、`iframe`（页面侧）和 `shared`（公共定义）。完整目录、依赖约束与构建关系见 [架构文档](architecture.zh-CN.md)。

| 文件                                                                | 职责                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `host/render.ts`                                                    | 高层装配入口，拥有容器、连接、保存生命周期、检查组件       |
| `host/inspector-panel.ts` / `host/view-style.ts`                    | 宿主侧栏、名称加载、选择联动和布局                         |
| `host/binding-host.ts` / `host/document.ts`                         | Engine 生命周期、请求校验、页面文档生成                    |
| `iframe/entry.ts`                                                   | iframe 程序启动：创建 Client、注入页面 API、握手和挂载绑定 |
| `iframe/dom.ts` / `iframe/element-subscriptions.ts`                 | 页面绑定执行、控件草稿和 ById 订阅                         |
| `iframe/inspector.ts` / `iframe/inspector-popover.ts`               | 页面拾取、高亮、hover tooltip、点击详情                    |
| `shared/client-types.ts` / `shared/inspection.ts` / `shared/rpc.ts` | 两侧使用的类型、纯函数和消息通信                           |

页面程序先构建到 `.generated/iframe.js`，再由 `host/render.ts` 用 `?raw` 内置到 SDK，应用不负责这两个构建步骤。
自定义装配接口见[低层 API](host-api.zh-CN.md)；普通应用通过 `/render` 接入。
