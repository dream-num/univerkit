# Univer HTML View Renderer

[简体中文](README.zh-CN.md)

`@univerkit/html-view-renderer` renders an HTML template into an application container, connects collaborative data through Binding Engine, and provides a built-in Inspector.

For the overall design of HTML data binding and how the three packages divide the work, see the [HTML data binding overview](docs/overview.zh-CN.md) (Simplified Chinese).

## Integration responsibilities

- The application supplies a container, HTML, and an authorized `loadEngine`; `loadMetadata` optionally supplies business names.
- The SDK owns the isolated iframe, page program, messaging, Engine lifecycle, and all inspection UI.
- Templates use HTML binding attributes and `window.univerBinding`, without owning an Engine.

Source editing, AI generation, file storage, and navigation belong to the application. The view API is exported from `/render`.

## Installation and requirements

```sh
npm install --save-exact "@univerkit/binding-engine@rc" "@univerkit/html-view@rc" "@univerkit/html-view-renderer@rc" --registry=https://insider-npm-registry.univer.work/
```

Use the same exact release for all three packages. The `@rc` tag selects the rc channel and records the resolved version in application dependencies.
Live data needs a collaboration service, authorized workbook and worksheet IDs, and the credentials and licenses required by that service.
The browser must support iframe sandbox, MessageChannel, and Web Crypto. Repository builds use Node.js 24+.

The [complete integration guide](docs/integration.md) supplies Engine loading, a template, container, saving, and cleanup. Vite 8 is only its example development server.

## Call shape

This function shows the three required inputs. The application implements `loadEngine` using its authorization and service configuration.

```ts
import { renderHtmlView, type RenderHtmlViewOptions } from "@univerkit/html-view-renderer/render";

export function createPreview(
  container: HTMLElement,
  html: string,
  loadEngine: RenderHtmlViewOptions["loadEngine"],
) {
  return renderHtmlView({ container, html, loadEngine });
}
```

Size the container and retain the returned view. `view.ready` means the handshake completed; `view.flush()` saves and continues,
`view.prepareToLeave()` saves and pauses, `view.resume()` resumes editing, and `view.dispose()` releases resources.
Use `view.inspect.open()` / `close()` for inspection, without another container.

See the [view API](docs/render.md) for parameters, state, errors, and ownership, and [binding inspection](docs/binding-inspection.md) for interactions and metadata.

## Author a template

Pass this template as `html` to `renderHtmlView`. Replace `book` and `sheet` with separately URI-encoded IDs. Opening the template directly does not initialize its data connection.

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

Text bindings replace `textContent` and render `null` as empty text. Model bindings support text inputs, textarea, single select, number/range inputs, and checkboxes. Text-like controls require string cells, numeric controls require number cells, and checkboxes require boolean cells; empty cells are initially compatible. Controls remain disabled until data arrives. References are fixed coordinates; B7 means row 6, column 1. Empty/missing/out-of-bounds reads return `null`, formulas return calculated values, and writes accept finite scalars rather than formula expressions.

## Input and updates

The runtime shares underlying subscriptions for identical cell or range references, then distributes state to elements and page callbacks. Cell notifications contain `{ value }`; range notifications use the same shape with a two-dimensional `value` array. HTML uses `data-univer-cell-text` / `data-univer-cell-model` for automatic text and control synchronization, and `data-univer-cell-subscribe` / `data-univer-range-subscribe` for subscriptions consumed by `subscribeCellById()` / `subscribeRangeById()` callbacks. The HTML declaration identifies the consuming element and its data reference, while the callback handles rendering. `getCellState()` and `getRangeState()` provide one-shot reads; write methods, collaboration-status subscriptions, and `flush()` support page interactions and saving. Use [`insertRowsWithValues()`](docs/javascript-api.md#insert-rows-with-values) to insert and fill one or more rows.

Declarative controls submit as follows:

| Control                                                        | Submit event                               |
| -------------------------------------------------------------- | ------------------------------------------ |
| Text input, `textarea`, single `select`, `input type="number"` | `change`                                   |
| `input type="range"`                                           | Throttled `input`, final value on `change` |
| `input type="checkbox"`                                        | `change`                                   |

Text inputs, textarea, select, numeric inputs, and checkboxes commit on `change`. Sliders coalesce input by Unit/cell at 100 ms intervals and commit the final value immediately on `change`. Native constraints, disabled/readonly state, and cell types are checked. An empty numeric input stays a draft. Remote updates refresh the known cell value without overwriting a draft; a write response never overwrites edits made after that write was sent. Errors keep the draft visible; Escape restores the latest known value.

## Exports and documentation

| Entry        | Purpose                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/render`    | `renderHtmlView` and view, Engine port, state, and Inspector configuration types; application entry                                                           |
| Package root | `createBindingHost`, `createHtmlViewDocument`, `mountHtmlView`, `bindingAddress`, and client/inspection record types; [low-level reference](docs/host-api.md) |
| `/dom`       | `mountHtmlView` for a custom trusted DOM                                                                                                                      |

All entries provide ESM, CommonJS, and TypeScript declarations. Both README languages and package `docs` ship in the npm package.

- [Page JavaScript API](docs/javascript-api.md): template reads, writes, subscriptions, row insertion, and saving.
- [Architecture](docs/architecture.md): host / iframe / shared responsibilities and build boundaries.

## Isolation and authorization

The SDK uses `sandbox="allow-scripts allow-forms"` without same-origin permission. `allow-forms` preserves control validation; CSP `form-action 'none'` blocks native form navigation.
`policy.allowedOrigins` controls external HTTP(S) resource and request origins. `policy.mediaSources` adds HTTP(S) URL prefixes, such as the host's file route, to `img-src` and `media-src` only. An iframe can still navigate itself; it is not a complete offline boundary.
The application's `loadEngine` checks Unit authorization, and the server enforces access. Keep UI Univer Facade extensions and Headless Engine in separate JavaScript environments.

## License

Licensed under Apache-2.0. This package depends on Univer Pro (`@univerjs-pro/*`) through `@univerkit/binding-engine`; using it follows the [Univer license terms](https://docs.univer.ai/server/license). Third-party dependencies retain their own licenses.
