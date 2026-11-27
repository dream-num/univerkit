# renderHtmlView 完整集成

[English](integration.md)

[返回 README](../README.zh-CN.md)。在新目录中创建以下文件。这是使用 npm 导出的完整浏览器应用，使用 SDK 内置的 iframe 程序和握手流程。它需要已有协同服务和已授权工作簿，不包含或绕过后端鉴权。

## 1. 安装依赖

```sh
mkdir html-view-app
cd html-view-app
npm init -y
npm pkg set type=module
```

```sh
npm install --save-exact "@univerkit/binding-engine@rc" "@univerkit/html-view@rc" "@univerkit/html-view-renderer@rc" --registry=https://insider-npm-registry.univer.work/
npm install "@univerjs-pro/collaboration-client@^1.6.0" "@univerjs-pro/collaboration-client-ui@^1.6.0" --registry=https://insider-npm-registry.univer.work/
npm install -D "vite@^8" typescript @types/node
```

三个数据绑定包使用同一次发布的精确版本。上面的命令选择当前 rc 发布并通过 `--save-exact` 固定应用依赖；可将三个 `@rc` 一起替换为所需发布的同一个精确版本。Univer/Pro 依赖仍保留 `^1.6.0`。

## 2. 配置服务与 ID

创建 `.env.local`，替换全部演示值。`UNIVER_SERVER_URL` 为已部署服务的 HTTP(S) origin，该服务提供 `/universer-api` 路由。`VITE_UNIT_ID` 是已有工作簿的稳定 ID，`VITE_SHEET_ID` 是子表的稳定 ID，不是标签名称。请选择 A1 为数字或空值的子表。两个 ID 有意提供给浏览器代码，不要在 `VITE_*` 变量中放置凭据。

```dotenv
UNIVER_SERVER_URL=https://your-univer-service.example
VITE_UNIT_ID=your-workbook-id
VITE_SHEET_ID=your-worksheet-id
```

加载前，应用必须为快照、changeset、授权和 WebSocket session-ticket 接口建立有效登录会话。以下代理原样转发路径，请使 cookie 域/路径及服务鉴权策略与本地 origin 匹配。代理本身不负责登录。若部署采用不同 SDK 鉴权流程或路由，请在 `collaborationClientConfig` 中配置。需要时，通过 Engine 的自定义 `createUniver` 工厂提供许可证及应用服务。示例固定 Unit 白名单演示宿主侧选择，生产环境应从已授权的应用数据获取可访问 Unit。

## 3. 添加 Vite 与 TypeScript 配置

`vite.config.ts`

```ts
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (!env.UNIVER_SERVER_URL) throw new Error("Set UNIVER_SERVER_URL in .env.local");
  return {
    server: {
      proxy: {
        "/universer-api": {
          target: env.UNIVER_SERVER_URL,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
```

`env.d.ts`

```ts
/// <reference types="vite/client" />
```

SDK 内置 iframe 程序并负责握手。Vite 只用于启动示例，不需要 SDK 插件或虚拟模块。

## 4. 添加宿主页面

`index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>HTML View host</title>
  </head>
  <body>
    <p id="status" role="status">Connecting...</p>
    <p id="error" role="alert"></p>
    <button id="leave" disabled>Save and close</button>
    <div id="view"></div>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
```

## 5. 连接、编辑、保存与释放

`main.ts`

```ts
import { BindingEngine } from "@univerkit/binding-engine";
import { renderHtmlView } from "@univerkit/html-view-renderer/render";
import { BrowserCollaborationSocketService } from "@univerjs-pro/collaboration-client-ui";

const unitId = import.meta.env.VITE_UNIT_ID as string;
const sheetId = import.meta.env.VITE_SHEET_ID as string;
if (!unitId?.trim() || !sheetId?.trim()) throw new Error("Set VITE_UNIT_ID and VITE_SHEET_ID");
const container = document.querySelector<HTMLElement>("#view")!;
const status = document.querySelector<HTMLElement>("#status")!;
const errorBox = document.querySelector<HTMLElement>("#error")!;
const leaveButton = document.querySelector<HTMLButtonElement>("#leave")!;
const ref = `${encodeURIComponent(unitId)}:${encodeURIComponent(sheetId)}:A1`;
const html = `<!doctype html><html lang="en">
<head><meta charset="utf-8"><title>Live cell</title></head><body>
<p>A1: <span data-univer-cell-text="${ref}">Loading...</span></p>
<label>A1 <input type="number" step="any" data-univer-cell-model="${ref}"></label>
<button id="save">Save and continue</button><p id="result" role="status"></p>
<script>
  document.querySelector("#save").addEventListener("click", async () => {
    const button = document.querySelector("#save");
    const result = document.querySelector("#result");
    button.disabled = true;
    try {
      await window.univerBinding.flush();
      result.textContent = "Saved";
    } catch (error) {
      result.textContent = "Save failed: " + error.message;
    } finally { button.disabled = false; }
  });
</script></body></html>`;
container.style.height = "320px";
let disposed = false;
let pending = false;
const view = renderHtmlView({
  container,
  html,
  async loadEngine(requestedUnitId, signal) {
    // Host-owned allowlist for this example. Server still enforces user permissions.
    if (requestedUnitId !== unitId) throw new Error("Unit is not allowed in this view.");
    signal.throwIfAborted();
    const base = `${location.origin}/universer-api`;
    const engine = new BindingEngine({
      unitId: requestedUnitId,
      collaborationClientConfig: {
        socketService: BrowserCollaborationSocketService,
        snapshotServerUrl: `${base}/snapshot`,
        collabSubmitChangesetUrl: `${base}/comb`,
        collabWebSocketUrl: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/universer-api/comb/connect`,
        wsSessionTicketUrl: `${base}/user/session-ticket`,
        authzUrl: `${base}/authz`,
      },
    });
    const abort = () => engine.dispose();
    signal.addEventListener("abort", abort, { once: true });
    try {
      signal.throwIfAborted();
      await engine.load();
      signal.throwIfAborted();
      return engine;
    } catch (error) {
      engine.dispose();
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  },
  onError(error) {
    errorBox.textContent = error.message;
  },
});
view.subscribe((state) => {
  pending = Object.values(state.pending).some(Boolean);
  status.textContent =
    state.phase === "ready" ? (pending ? "Changes pending" : "All changes saved") : state.phase;
  leaveButton.disabled = state.phase !== "ready";
});
void view.ready.catch((error) => {
  errorBox.textContent = error.message;
});
function beforeUnload(event: BeforeUnloadEvent) {
  if (!disposed && pending) {
    event.preventDefault();
    event.returnValue = "";
  }
}
function dispose() {
  if (disposed) return;
  disposed = true;
  window.removeEventListener("beforeunload", beforeUnload);
  window.removeEventListener("pagehide", dispose);
  view.dispose();
}
leaveButton.addEventListener("click", async () => {
  leaveButton.disabled = true;
  try {
    await view.prepareToLeave();
    dispose();
    status.textContent = "Saved and closed";
    errorBox.textContent = "";
  } catch (error) {
    errorBox.textContent = error instanceof Error ? error.message : String(error);
    if (!disposed) leaveButton.disabled = false;
  }
});
window.addEventListener("beforeunload", beforeUnload);
window.addEventListener("pagehide", dispose);
```

## 6. 运行与验证

```sh
npx vite --host 127.0.0.1
```

完成部署的登录流程后，打开 Vite 输出的本地 URL。iframe 显示 A1，修改数字并离开输入框后提交。“Save and continue”等待确认并保留编辑能力。从另一个协同客户端修改单元格即可观察订阅更新。“Save and close”提交剩余草稿、等待确认，然后移除 iframe。保留非法数值草稿可验证保存时页面继续保留并显示错误；修正输入或按 Escape 后重试。

握手只代表运行时连接成功，不代表全部工作簿加载完成。连接超时应检查浏览器 CSP 错误后重新加载。控件持续禁用时，检查 Unit/Sheet ID、单元格类型、凭据、HTTP 路由、session-ticket 请求和 WebSocket 连接。即使作者脚本请求其他 Unit，本例宿主也会拒绝。不要通过放宽 sandbox 或绕过访问校验来解决加载问题。

生产构建运行 `npx vite build`。从已登录应用的 origin 提供 `dist/`，并在该环境配置相同 `/universer-api` 反向代理；Vite 开发代理不包含在构建产物中。宿主与原生 Univer Sheet UI 必须运行在独立 JavaScript 环境，因为 UI Facade 扩展会全局影响 Headless 实例。

## 可选外部资源

若需加载外部图表库，在 `renderHtmlView()` 的 `policy.allowedOrigins` 中加入精确 HTTP(S) origin，并在作者模板加入 script 标签或 fetch 调用，例如 `policy: { allowedOrigins: ["https://cdn.jsdelivr.net"] }`。这只允许该 origin 的资源和请求，不授予工作簿访问权限。本例无需外部 CDN。CSP 无法阻止 iframe 自身导航，因此不代表完全离线执行保证。
