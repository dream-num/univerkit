# 低层宿主与 DOM 接口

[English](host-api.md) · [返回 README](../README.zh-CN.md)

应用接入使用 [`renderHtmlView`](render.zh-CN.md)。本文记录包根入口与 `/dom` 的自定义装配接口。
这些函数不会自动提供完整 view；自行装配时需要自己提供页面程序、创建 iframe、校验握手并管理生命周期。
SDK 内置的 iframe 程序是内部构建产物，没有公开脚本入口或加载 URL。

## 宿主接口

| 函数                                                                                          | 输入与所有权                                                                                                                           |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `createHtmlViewDocument({ template, runtime, connectionId, allowedOrigins?, mediaSources? })` | 接收 `parseHtmlView()` 结果、已打包的 classic 运行时脚本和新的连接 token，返回用于 `iframe.srcdoc` 的 HTML 字符串，本身不创建 iframe。 |
| `createBindingHost(port, { loadEngine, onStatus?, onError?, onClose? })`                      | 持有 port 和 `loadEngine(unitId, signal)` 返回的 Engine。必须返回已加载的 Engine，取消或失败时释放部分创建的实例。                     |
| `host.flush()`                                                                                | 保存当前变更并继续编辑。                                                                                                               |
| `host.resume()`                                                                               | 离开前保存成功后，取消导航时恢复编辑。                                                                                                 |
| `host.prepareToLeave()`                                                                       | 保存并离开：提交页面草稿、暂停新写入、排空在途写入、等待所有已加载 Unit 的确认。                                                       |
| `host.hasPendingChanges()`                                                                    | 报告页面草稿和在途写入，不包含 SDK 未同步状态。                                                                                        |
| `host.dispose()`                                                                              | 关闭通道并释放 Engine，幂等，不隐式保存。                                                                                              |

`onStatus(states)` 接收已加载 Engine 的 SDK `CollaborationStatus[]`。判断离开时是否需要提示，应逐一与 `CollaborationStatus.SYNCED` 比较。`onError(message)` 接收声明式运行时错误，空消息表示清除旧错误；`onClose()` 报告通道关闭。自定义页面 API 的 Promise 拒绝由页面自行处理。宿主为每个 Unit 缓存一个加载 Promise，并发请求复用；失败后移除缓存，后续显式请求可重试，但不会自动重试失败的页面操作。

## DOM 挂载

自定义可信环境可用 `mountHtmlView({ document, client, onError?, onPendingChanges? })` 将指定 DOM 绑定到提供内部数据订阅的 `BindingDataClient`。标准运行时将它与页面公开的 client 分开。返回两个 ById 回调方法、`flush()`（只提交 DOM 草稿）、`hasPendingChanges()` 和 `dispose()`。它本身不创建 sandbox、授权 Unit 或等待协同确认。`renderHtmlView` 内置的 iframe 程序已经挂载页面，不要重复挂载。

`allowedOrigins` 只控制资源和请求来源。`mediaSources` 接收 HTTP(S) URL 前缀，只加入 `img-src` 和 `media-src`。原生表单导航始终由 `form-action 'none'` 阻止。
