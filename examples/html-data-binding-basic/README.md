# 文件列表与协同示例

使用三个数据绑定包和公开 Univer Collaboration SDK 组装的最小应用。
支持 Sheet 与 `.univer.html` 文件，不实现登录或应用权限系统。

## 启动

在仓库根目录执行：

```bash
pnpm install
pnpm build
pnpm --filter @univerkit/example-html-data-binding-basic start
```

打开 <http://127.0.0.1:3030/>。点击 **Open in new tab** 可以在另一个标签页打开当前文件，
也可以分别打开 Sheet 和引用它的 HTML 页面。

首次启动会创建 **Team budget** 和 **Team budget.univer.html**。后续启动保留已有文件和修改，
不会覆盖已有 HTML 源码。更新模板代码只影响新建的 HTML 文件。

## 演示步骤

1. 打开 **Team budget.univer.html**，修改 Income 或 Expenses。
2. 在另一个标签页打开 **Team budget**，观察 B3/B4 和 B5 公式结果同步变化。
3. 直接编辑 Sheet 的 B3/B4，HTML 控件、余额和 JavaScript 柱状图随之更新。
4. 创建或导入另一个 Sheet，选中后点击右上角 **Generate HTML**，基于当前 Sheet 生成 HTML 页面。
5. 预览并保存生成的页面，或点击 **HTML source** 编辑和保存已有页面的源码。
6. 重启服务，再次打开文件，检查数据持久化。

点击 **Import spreadsheet** 可导入 XLS/XLSX/CSV/TSV 文件（最多 25 MiB）。导入期间显示进度提示，
成功后在文件列表中新建并打开协同 Sheet；也可选择该 Sheet 生成 AI HTML 视图。
转换使用公开的 `@univerjs-pro/exchange-node`，通过 Collaboration SDK 的
`createUnitFromSnapshot()` 保存 snapshot 和 sheet blocks，与 collaboration examples 的
exchange 示例使用相同流程。导入在本服务进程中执行，上传内容仅用于转换，Sheet 数据持久化到 SQLite。

模板通过 `data-univer-range-subscribe` 在图表元素上声明收入和支出的 B3:B4 范围，
再用 `window.univerBinding.subscribeRangeById("chart", callback)` 接收更新，通过普通 JavaScript 更新 SVG 柱状图。

HTML 源码是普通保存的文件，不是协同编辑的 Unit。页面引用的 Sheet 数据通过协同同步。
修改源码后，需要先保存或放弃修改，再切换文件。

## 文件结构

```text
server/main.ts       文件目录、HTTP 路由、SQLite 和协同服务装配
server/import.ts     表格上传、Office 转换和协同 Sheet 创建
server/templates.ts  初始 Sheet 数据与 HTML 图表模板
shared/files.ts      Sheet / HTML 文件列表类型
web/main.ts          文件列表、创建、切换与源码编辑
web/collaboration.ts 协同 Sheet 编辑器
web/config.ts        协同客户端配置
web/html.ts          renderHtmlView、Engine 加载与内置检查的应用装配
web/styles.css       示例外层界面样式
```

文件名和 HTML 源码保存在 `.data/files.sqlite`；协同数据由 SDK Adapter 保存在
`.data/collaboration.sqlite`。示例提供固定访客身份并放行 SDK 的权限查询，不管理用户或权限。

## 配置

需要自定义时，在本目录将 `.env.example` 复制为 `.env`。

| 变量             | 默认值      | 用途                                     |
| ---------------- | ----------- | ---------------------------------------- |
| `HOST`           | `127.0.0.1` | 监听地址                                 |
| `PORT`           | `3030`      | HTTP 与 WebSocket 端口                   |
| `DATA_DIR`       | `.data`     | 文件目录和协同数据的位置                 |
| `UNIVER_LICENSE` | 空          | 可选 Univer 许可证；修改后需重新构建前端 |

前端、HTTP API 和 WebSocket 由同一个服务提供。开发时 Vite 将 `/api` 和 `/universer-api`
代理到 3030 端口。示例不依赖 Workspace 服务。

## 页面生命周期

Sheet 编辑器与 HTML 宿主运行在不同页面中。Univer UI Facade 扩展作用于整个 JavaScript
运行环境，因此通过文件导航隔离 UI 编辑器和 Headless Engine。

正常切换文件时，先提交 HTML 控件草稿并等待协同确认，再离开页面。保存失败时保留当前页面。
浏览器关闭或刷新时，如有尚未保存的修改，则使用浏览器的离开提示。

示例界面样式只作用于文件列表和外层工具栏，Sheet 使用 Univer SDK 默认样式。

[内置 Inspector 与接口边界](../../packages/html-view-renderer/docs/binding-inspection.zh-CN.md)

检查侧栏、高亮与浮层由 SDK 内置。应用负责文件目录、源码草稿、AI 生成及 Unit/Sheet 名称查询。渲染与检查接入位于 [web/html.ts](web/html.ts)。

### 检查组件语言

默认使用英文。打开 `/?file=demo-budget-view&lang=zh-CN` 可查看中文检查侧栏和浮层；`lang=en-US` 使用英文。示例将查询参数传给 `renderHtmlView({ locale })`，模板内容和应用导航不受影响。
