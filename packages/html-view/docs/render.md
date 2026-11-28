# renderHtmlView and the built-in Inspector

[简体中文](render.zh-CN.md) · [Back to README](../README.md) · [Complete integration](integration.md)

## Load and render a template

This integration function receives the container, template URL, and `loadEngine` from its application.
The integration guide supplies a complete Engine loader; the SDK does not infer connection configuration.

```ts
import { renderHtmlView, type RenderHtmlViewOptions } from "@univerkit/html-view/render";

export async function loadPreview(
  container: HTMLElement,
  templateUrl: string,
  loadEngine: RenderHtmlViewOptions["loadEngine"],
) {
  const response = await fetch(templateUrl);
  if (!response.ok) throw new Error("Could not load the template.");
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

Retain the returned view and call `view.dispose()` when removing the page.
Inspection is optional: call `view.inspect.open()`. See [binding inspection](binding-inspection.md) for metadata examples.

The application sizes the container. The SDK creates its own root, Shadow DOM, iframe, and inspection panel,
without clearing other container children. Each container holds one view; it can be mounted again after disposal.

`html` is template source. Downloading, source editing, AI generation, and business file management belong to the application.
The SDK embeds the iframe program from the same build. Applications do not supply script text or assemble an iframe.
Vite handles example builds and development serving; it is not a runtime dependency of `renderHtmlView`.

## Inputs

| Parameter                    | Meaning                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `container`                  | An application-provided HTMLElement, usually a div; the application controls its dimensions                                                                                                                                                                               |
| `html`                       | The complete HTML template string                                                                                                                                                                                                                                         |
| `locale`                     | Optional `"en-US"` (default) or `"zh-CN"`. Sets SDK interface language at creation, including sidebar, tooltips, diagnostics and accessible labels. Template content and business names are unchanged                                                                     |
| `loadEngine(unitId, signal)` | Check authorization, configure the connection, and return a loaded Engine. Dispose unfinished instances on cancellation/failure. Once returned, the SDK owns disposal; do not share the instance with another view                                                        |
| `policy.allowedOrigins`      | Optional external HTTP(S) resource origins; external resources are blocked by default and native form navigation is blocked                                                                                                                                               |
| `policy.mediaSources`        | Optional HTTP(S) URLs, with an optional path, that only images and audio/video may load. A trailing `/` allows every URL under that path. Scripts, requests, frames and workers are unaffected. Requests carry no host credentials, because the page has an opaque origin |
| `onError(error)`             | Asynchronous rendering/binding errors. Explicit API calls still reject their promises and must be caught by the caller                                                                                                                                                    |

`BindingEnginePort` is exported from `/render`; `BindingEngine` satisfies this interface.
A Unit load failure does not close connections to other Units.

Creating a view throws synchronously for an invalid template or an occupied container. Handle rejections from `ready` and explicit methods; `onError` does not replace those handlers.

## View API

| Member                   | Effect                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ready`                  | The iframe program completed its handshake; not a guarantee that all Unit data arrived. Rejects after a 15-second handshake timeout |
| `subscribe(listener)`    | Reports the current state immediately and subsequent changes; returns an unsubscribe function                                       |
| `flush()`                | Submits current control drafts and preceding writes, waits for collaboration acknowledgement, and permits continued editing         |
| `prepareToLeave()`       | Pauses editing and saves; remains paused on success, restores editing on failure if the connection is active                        |
| `resume()`               | Resumes a paused view, for example after cancelled navigation; does nothing when ready                                              |
| `inspect.open(options?)` | Opens the built-in panel and interactions; creates UI on demand and does nothing when already open                                  |
| `inspect.close()`        | Closes the panel, clears selection/highlights/overlays, and restores template clicks                                                |
| `dispose()`              | Releases the connection, Engines, inspection UI, and SDK root; idempotent, without implicit saving                                  |

Ordinary saving does not need `resume()`. A successful `prepareToLeave()` keeps editing paused;
call `resume()` to stay on the page. Ordinary `flush()` rejects while paused.
Save, leave preparation, and resume operations execute in call order.

In this navigation sketch, `view` is an existing instance and `applicationNavigate` is the application's navigation operation:

```ts
await view.prepareToLeave();
try {
  await applicationNavigate();
} catch (error) {
  await view.resume();
  throw error;
}
```

## State

`HtmlViewState` contains `phase`, `inspecting`, `pending`, and `sources`:

| Phase                   | Meaning                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `connecting`            | Waiting for the iframe program handshake                    |
| `ready`                 | Connected and editable                                      |
| `flushing-before-leave` | Pausing and submitting edits before leaving                 |
| `paused`                | Leave preparation succeeded; editing remains paused         |
| `closed`                | Connection closed or handshake timed out; create a new view |
| `disposed`              | The application disposed the view                           |

Ordinary `flush()` does not change the phase. `pending.drafts` tracks control drafts; `pending.writes`
tracks unfinished writes; `pending.confirmation` tracks collaboration status awaiting synchronization.
`sources` reports each Unit's `unitId`, `loading`/`ready`/`error` phase, and optional collaboration `status` or `error`.
`inspecting` indicates whether the panel is open, allowing application toolbar state to follow it.

## Inspector API and behavior

The only optional input is `loadMetadata(unitId, signal)`. The SDK owns these interactions:

- Group bindings by Unit → Sheet → reference, showing multiple elements for shared references.
- Highlight related elements when a reference is selected; open pinned details when an element is selected.
- Show a hover tooltip, hidden while pinned details are open. Both overlays render inside the iframe.
- Clear selection with the close button, blank page areas, or Escape, and synchronize the sidebar.
- Enable highlight-all on every open, with teal dashed outlines and selection with thicker indigo outlines. Toggling all preserves selection; clearing selection restores the all-highlight outline when enabled.
- Follow DOM binding changes and clear overlays for removed elements.
- Show application names without duplicate IDs; missing or blank names and failed lookups fall back to `id: xxx`. Refresh can retry failed queries.
- Intercept template clicks during inspection and restore them when inspection closes.

Names are display-only: they do not change references or authorize access. Closing inspection or disposing
the view aborts metadata requests; late results cannot reopen UI. See [binding inspection](binding-inspection.md).

## Internal responsibilities

Code follows `host`, `iframe`, and `shared` execution boundaries. See [architecture](architecture.md) for dependencies and builds.

| File                                                                | Responsibility                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `host/render.ts`                                                    | Owns the container, connection, saving lifecycle, and inspection components |
| `host/inspector-panel.ts` / `host/view-style.ts`                    | Sidebar, metadata loading, selection synchronization, layout                |
| `host/binding-host.ts` / `host/document.ts`                         | Engine lifecycle, request validation, document creation                     |
| `iframe/entry.ts`                                                   | Creates the client and page API, sends the handshake, mounts bindings       |
| `iframe/dom.ts` / `iframe/element-subscriptions.ts`                 | DOM bindings, control drafts, ById subscriptions                            |
| `iframe/inspector.ts` / `iframe/inspector-popover.ts`               | Picking, highlights, hover tooltips, pinned details                         |
| `shared/client-types.ts` / `shared/inspection.ts` / `shared/rpc.ts` | Shared types, pure functions, messaging                                     |

The build first produces `.generated/iframe.js`; `host/render.ts` embeds it through `?raw`.
Applications do not perform these build steps. See [low-level APIs](host-api.md) for custom assembly;
standard integration uses `/render`.
