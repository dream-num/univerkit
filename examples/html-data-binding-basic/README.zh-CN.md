# HTML 数据绑定示例

[English](./README.md) | 简体中文

使用三个 HTML 数据绑定包和 Univer Collaboration SDK 组装的示例应用。它管理协同 Sheet 和
`.univer.html` 页面，并演示 HTML 页面与表格的双向同步、绑定检查、表格导入和 AI 生成页面。
示例使用固定的访客身份，不实现登录或权限。

## 启动

在仓库根目录执行：

```bash
pnpm install
pnpm build
pnpm --filter @univerkit/example-html-data-binding-basic start
```

打开 <http://127.0.0.1:3030/>。点击 **Open in new tab** 可以在另一个标签页打开当前文件，
也可以分别打开 Sheet 和引用它的 HTML 页面。

首次启动会创建以下文件；之后重启会保留已有文件和修改，更新模板代码只影响新建的文件。

| Sheet                        | HTML 页面                          |
| ---------------------------- | ---------------------------------- |
| Team budget                  | Team budget.univer.html            |
| 区域销售分析                 | 区域销售驾驶舱.univer.html         |
| Univer 开发者沙龙 · 活动管理 | 活动报名、现场签到台、活动实时大屏 |

## 演示步骤

1. 打开 **Team budget.univer.html**，修改 Income 或 Expenses。
2. 在另一个标签页打开 **Team budget**，观察 B3/B4 和 B5 公式结果同步变化。
3. 直接编辑 Sheet 的 B3/B4，HTML 控件、余额和 JavaScript 柱状图随之更新。
4. 创建或导入另一个 Sheet，选中后点击右上角 **Generate HTML**，基于当前 Sheet 生成 HTML 页面。
5. 预览并保存生成的页面，或点击 **HTML source** 编辑和保存已有页面的源码。
6. 重启服务，再次打开文件，检查数据持久化。

模板通过 `data-univer-range-subscribe` 在图表元素上声明收入和支出的 B3:B4 范围，
再用 `window.univerBinding.subscribeRangeById("chart", callback)` 接收更新，通过普通 JavaScript 更新 SVG 柱状图。

HTML 源码是普通保存的文件，不是协同编辑的 Unit。页面引用的 Sheet 数据通过协同同步。
修改源码后，需要先保存或放弃修改，再切换文件。

## 导入表格

点击 **Import spreadsheet** 可导入 XLS、XLSX、CSV 或 TSV 文件（最多 25 MiB）。页面先把文件上传到
File Endpoint，再创建 Exchange 导入任务并轮询结果；完成后新 Sheet 出现在文件列表中并自动打开，
名称取自文件名（不含扩展名）。

## 绑定检查

点击 **Bindings** 打开检查侧栏。侧栏、高亮与浮层由 SDK 内置，应用只提供名称：Sheet 名称来自
`GET /api/files/:id`，子表名直接从页面已加载的 Binding Engine 读取（`getSheets()`）。接入代码位于
[web/views/html.ts](web/views/html.ts)，接口说明见
[内置 Inspector 与接口边界](../../packages/html-view-renderer/docs/binding-inspection.zh-CN.md)。

检查组件默认使用英文。打开 `/?file=demo-budget-view&lang=zh-CN` 可查看中文侧栏和浮层；示例将查询参数传给
`renderHtmlView({ locale })`，模板内容和应用导航不受影响。

## AI 生成页面

选中 Sheet 后点击 **Generate HTML**，描述想要的页面，AI 会读取表格的最新数据并生成 HTML 草稿，
预览满意后再保存。首次使用时在 **AI settings** 中填写 DeepSeek API Key，Key 保存在服务端的 `.env` 中。
服务端读取表格时共用一个常驻的快照物化器，第一次读取需要启动运行时，之后每次只需毫秒级时间。

## 代码结构

```text
server/main.ts           服务装配：存储、协同 / File / Exchange 服务、Endpoint、HTTP 和生命周期
server/file-catalog.ts   文件列表：Sheet 来自 Unit metadata，HTML 页面保存在应用自己的表中
server/file-routes.ts    文件列表、创建与 HTML 源码读写接口
server/ai-routes.ts      AI 设置与页面生成接口
server/workbook-reader.ts 服务端读取 Sheet 最新数据
server/demo-files.ts     预置文件
server/*template.ts      预置 Sheet 数据与 HTML 模板
web/main.ts              页面状态、文件切换、源码编辑与浏览模式
web/api/                 文件接口与表格导入
web/views/               协同 Sheet 编辑器与 HTML 页面
web/ui/                  新建、导入与分享界面
web/ai/                  AI 生成与设置界面
```

协同数据、上传文件的记录和 HTML 页面都保存在 `.data/collaboration.sqlite` 中：Sheet 名称写在 Unit
metadata 里，HTML 页面保存在应用自己的 `html_views` 表；上传文件的内容保存在 `.data/files/`。
停止服务（Ctrl+C）时，服务按依赖关系依次释放 Endpoint、服务和存储。

## 配置

需要自定义时，在本目录将 `.env.example` 复制为 `.env`。

| 变量                | 默认值                     | 用途                                                   |
| ------------------- | -------------------------- | ------------------------------------------------------ |
| `HOST`              | `127.0.0.1`                | 监听地址                                               |
| `PORT`              | `3030`                     | HTTP 与 WebSocket 端口                                 |
| `DATA_DIR`          | `.data`                    | 数据文件的位置                                         |
| `UNIVER_LICENSE`    | 空                         | 可选 Univer 许可证；修改后需重新构建前端               |
| `DEEPSEEK_API_KEY`  | 空                         | AI 生成使用的 API Key，也可在页面的 AI settings 中设置 |
| `DEEPSEEK_MODEL`    | `deepseek-flash`           | AI 生成使用的模型                                      |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | AI 接口地址                                            |

前端、HTTP API 和 WebSocket 由同一个服务提供。开发时 Vite 将 `/api` 和 `/universer-api`
代理到 3030 端口。

## 页面生命周期

Sheet 编辑器与 HTML 页面运行在不同页面中。Univer UI Facade 扩展作用于整个 JavaScript
运行环境，因此通过文件导航隔离 UI 编辑器和 Headless Engine。

正常切换文件时，先提交 HTML 控件草稿并等待协同确认，再离开页面。保存失败时保留当前页面。
浏览器关闭或刷新时，如有尚未保存的修改，则使用浏览器的离开提示。

示例界面样式只作用于文件列表和外层工具栏，Sheet 使用 Univer SDK 默认样式。
