# Univer HTML View

[English](README.md)

`@univerkit/html-view` 将 HTML 模板渲染到应用提供的容器，通过 Binding Engine 连接协同数据，并提供内置 Inspector。

HTML 数据绑定的整体设计和三个包的分工见[HTML 数据绑定概览](docs/overview.zh-CN.md)。

## 接入边界

- 应用提供容器、HTML 字符串、已授权的 `loadEngine`；需要业务名称时提供 `loadMetadata`。
- SDK 管理隔离 iframe、页面程序、消息通信、Engine 生命周期及全部检查 UI。
- 模板使用 HTML 绑定属性和 `window.univerBinding`，不直接持有 Engine。

源码编辑、AI 生成、文件存储和导航由应用负责。公开 view 接口来自 `/render`。

## 安装与运行条件

```sh
npm install --save-exact "@univerkit/binding-engine@rc" "@univerkit/html-view-parser@rc" "@univerkit/html-view@rc" --registry=https://insider-npm-registry.univer.work/
```

三个包使用同一次发布的精确版本；上面的 `@rc` 选择 rc 通道，并将解析版本锁定到应用依赖。
实时数据需要协同服务、已授权的工作簿与子表 ID，以及服务所需的凭据和许可证。
浏览器需要支持 iframe sandbox、MessageChannel 和 Web Crypto。仓库构建使用 Node.js 24+。

[完整集成指南](docs/integration.zh-CN.md)提供 Engine 加载、模板、容器、保存和释放代码；其中 Vite 8 仅用作示例开发服务器。

## 调用形态

下面的函数展示三个必要输入；`loadEngine` 的实现取决于应用的授权与服务配置。

```ts
import { renderHtmlView, type RenderHtmlViewOptions } from "@univerkit/html-view/render";

export function createPreview(
  container: HTMLElement,
  html: string,
  loadEngine: RenderHtmlViewOptions["loadEngine"],
) {
  return renderHtmlView({ container, html, loadEngine });
}
```

应用设置容器尺寸，并持有返回的 view。`view.ready` 表示握手完成；`view.flush()` 保存并继续，
`view.prepareToLeave()` 保存并暂停，`view.resume()` 恢复编辑，`view.dispose()` 释放资源。
使用 `view.inspect.open()` / `close()` 控制内置检查，不需要另一个容器。

参数、状态、错误和所有权见 [view API](docs/render.zh-CN.md)，检查效果与名称接口见[绑定检查](docs/binding-inspection.zh-CN.md)。

## 编写模板

以下模板交给 `renderHtmlView` 的 `html` 参数。将 `book` 和 `sheet` 替换为分别 URI 编码的真实 ID；直接打开模板不会初始化数据连接。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Revenue</title>
  </head>
  <body>
    <p>Revenue: <span data-univer-cell-text="book:sheet:B7">Loading...</span></p>
    <label
      >Revenue <input type="number" min="0" step="1" data-univer-cell-model="book:sheet:B7"
    /></label>
    <button id="save">Save and continue</button>
    <p id="result" role="status"></p>
    <script>
      document.querySelector("#save").addEventListener("click", async () => {
        const button = document.querySelector("#save");
        const result = document.querySelector("#result");
        button.disabled = true;
        try {
          await window.univerBinding.flush();
          result.textContent = "Saved";
        } catch (error) {
          result.textContent = `Save failed: ${error.message}`;
        } finally {
          button.disabled = false;
        }
      });
    </script>
  </body>
</html>
```

文本绑定替换 `textContent`，`null` 显示为空文本。模型绑定支持文本输入、textarea、单选 select、number/range 输入和 checkbox。文本类控件要求字符串单元格，数值控件要求数字单元格，checkbox 要求布尔单元格；空单元格初始兼容。数据到达前控件禁用。引用使用固定坐标，B7 表示第 6 行、第 1 列。空单元格、缺失或越界读取返回 `null`，公式返回计算结果，写入接受有限标量，不解析公式表达式。

## 输入与更新

运行时为相同单元格或范围引用共享底层订阅，再将状态分发给对应元素和页面回调。
单元格状态通知只包含 `{ value }`；范围状态沿用这一结构，`value` 为二维数组。
HTML 使用 `data-univer-cell-text` / `data-univer-cell-model` 自动同步文本与控件，使用 `data-univer-cell-subscribe` / `data-univer-range-subscribe` 声明订阅，再通过 `subscribeCellById()` / `subscribeRangeById()` 注册自定义渲染回调。HTML 声明标明消费数据的元素和数据引用，回调负责渲染。`getCellState()` / `getRangeState()` 提供一次性读取，写入方法、协同状态订阅和 `flush()` 支持页面交互与保存。
新增记录使用 [`insertRowsWithValues()`](docs/javascript-api.zh-CN.md#插入行并填值)，一次可插入一行或多行并填值。

声明式控件采用以下提交行为：

| 控件                                                       | 提交事件                          |
| ---------------------------------------------------------- | --------------------------------- |
| 文本输入、`textarea`、单选 `select`、`input type="number"` | `change`                          |
| `input type="range"`                                       | `input` 节流，`change` 提交最终值 |
| `input type="checkbox"`                                    | `change`                          |

文本输入、textarea、select、数值输入和 checkbox 在 `change` 提交。滑块按 Unit/单元格合并输入，每 100 毫秒提交一次，`change` 立即提交最终值。运行时检查原生约束、disabled/readonly 状态和单元格类型。空数值输入保留草稿。远端更新刷新已知值，不覆盖草稿；写入响应不会覆盖发送后继续编辑的内容。出错时保留草稿，Escape 恢复最新已知值。

## 导出与文档

| 入口      | 用途                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/render` | `renderHtmlView` 与 view、Engine port、状态和 Inspector 配置类型；应用接入入口                                                              |
| 包根入口  | `createBindingHost`、`createHtmlViewDocument`、`mountHtmlView`、`bindingAddress` 及客户端、检查记录类型；[低层接口](docs/host-api.zh-CN.md) |
| `/dom`    | `mountHtmlView`，为自定义可信 DOM 挂载绑定                                                                                                  |

所有入口提供 ESM、CommonJS 和 TypeScript 声明。包内中英文 README 与 `docs` 随 npm 包发布。

- [页面 JavaScript API](docs/javascript-api.zh-CN.md)：模板读写、订阅、插行与保存。
- [架构](docs/architecture.zh-CN.md)：host / iframe / shared 的职责和构建边界。

## 隔离与授权

SDK 使用 `sandbox="allow-scripts allow-forms"`，不启用同源权限。`allow-forms` 保留控件校验能力，CSP 的 `form-action 'none'` 阻止原生表单导航。
`policy.allowedOrigins` 控制外部 HTTP(S) 资源和请求来源。`policy.mediaSources` 只向 `img-src` 和 `media-src` 追加 HTTP(S) URL 前缀，例如宿主的文件路由。iframe 仍可自行导航，不代表完全断网。
应用通过 `loadEngine` 校验 Unit 来源与权限，服务端执行实际访问校验。UI Univer Facade 与 Headless Engine 放在不同 JavaScript 环境。

## 许可证

以 Apache-2.0 许可发布。本包通过 `@univerkit/binding-engine` 依赖 Univer Pro（`@univerjs-pro/*`），使用时遵循 [Univer 许可规则](https://docs.univer.ai/zh-CN/server/license)。第三方依赖遵循各自的许可证。
