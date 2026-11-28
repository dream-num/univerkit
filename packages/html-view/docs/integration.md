# Complete renderHtmlView integration

[简体中文](integration.zh-CN.md)

[Back to README](../README.md). Create the files below in a new directory. This is a complete browser application using npm exports, using the SDK’s embedded iframe program and handshake. It needs your existing collaboration service and authorized workbook; it does not include or bypass backend authentication.

## 1. Install dependencies

```sh
mkdir html-view-app
cd html-view-app
npm init -y
npm pkg set type=module
```

```sh
npm install --save-exact "@univerkit/binding-engine@rc" "@univerkit/html-view-parser@rc" "@univerkit/html-view@rc" --registry=https://insider-npm-registry.univer.work/
npm install "@univerjs-pro/collaboration-client@^1.6.0" "@univerjs-pro/collaboration-client-ui@^1.6.0" --registry=https://insider-npm-registry.univer.work/
npm install -D "vite@^8" typescript @types/node
```

Use the same exact release for all three data binding packages. The commands select the current rc release and pin application dependencies with `--save-exact`; replace all three `@rc` tags with the same exact release version to use another release. Univer/Pro dependencies retain `^1.6.0`.

## 2. Configure the service and IDs

Create `.env.local`. Replace every illustrative value. `UNIVER_SERVER_URL` is the HTTP(S) origin of your deployed service with `/universer-api` routes. `VITE_UNIT_ID` is an existing workbook’s stable ID and `VITE_SHEET_ID` is a worksheet’s stable ID, not its tab name. Choose a worksheet with a numeric or empty A1. These two IDs are intentionally available to browser code; do not put credentials in `VITE_*` variables.

```dotenv
UNIVER_SERVER_URL=https://your-univer-service.example
VITE_UNIT_ID=your-workbook-id
VITE_SHEET_ID=your-worksheet-id
```

Your application must establish a valid login/session for snapshot, changeset, authorization, and WebSocket session-ticket endpoints before loading. The proxy below forwards paths unchanged; align cookie domain/path and the service’s authentication policy with the local origin. A proxy alone does not log the user in. If your deployment uses a different SDK authentication flow or endpoint layout, configure it in `collaborationClientConfig`. Supply required licensing/application services through a custom Engine `createUniver` factory when needed. The fixed Unit allowlist in this example illustrates host-side selection; production selection should come from your authorized application data.

## 3. Add Vite and TypeScript configuration

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

The SDK embeds the iframe program and owns the handshake. Vite serves this example; no SDK plugin or virtual module is required.

## 4. Add the host page

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

## 5. Connect, edit, save, and release

`main.ts`

```ts
import { BindingEngine } from "@univerkit/binding-engine";
import { renderHtmlView } from "@univerkit/html-view/render";
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

## 6. Run and verify

```sh
npx vite --host 127.0.0.1
```

Open the local URL printed by Vite after completing your deployment’s login flow. A1 appears in the iframe; changing the number and leaving the input commits it. “Save and continue” waits for acknowledgement and leaves the page editable. Change the cell from another collaborative client to see a subscription update. “Save and close” submits any remaining draft, waits for acknowledgement, then removes the iframe. Leave a numeric draft invalid to verify that saving keeps the page open with an error; correct it or press Escape before retrying.

The handshake means the runtime is connected, not that all workbook loads have completed. If connection times out, check browser CSP errors, then reload. If controls remain disabled, check the Unit/Sheet IDs, cell type, credentials, HTTP routes, session-ticket request, and WebSocket connection. This example blocks extra Unit IDs in the host even if author scripts request them. Do not weaken the sandbox or bypass access checks to resolve loading errors.

For a production build run `npx vite build`. Serve `dist/` from your authenticated application origin and provide the same `/universer-api` reverse proxy there; Vite’s development proxy is not part of the build. The host and a native Univer Sheet UI must run in separate JavaScript environments because UI Facade extensions affect headless instances globally.

## Optional external resources

To load an external chart library, add its exact HTTP(S) origin to `policy.allowedOrigins` in `renderHtmlView()`, and include a script tag or fetch call in the author template. For example `policy: { allowedOrigins: ["https://cdn.jsdelivr.net"] }`. This permits resources/requests to that origin; it does not grant workbook access. The example itself needs no external CDN. CSP does not prevent iframe self-navigation, so do not treat it as an offline execution guarantee.
