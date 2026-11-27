# Low-level host and DOM APIs

[简体中文](host-api.zh-CN.md) · [Back to README](../README.md)

Use [`renderHtmlView`](render.md) for application integration. This reference covers custom assembly with the package root and `/dom` exports.
These functions do not create a complete view. Custom assembly owns the page program, iframe, handshake validation, and lifecycle.
The SDK's embedded iframe program is an internal build artifact, without a public script entry or loading URL.

## Host API

| Function                                                                                      | Inputs and ownership                                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createHtmlViewDocument({ template, runtime, connectionId, allowedOrigins?, mediaSources? })` | Takes the result of `parseHtmlView()`, a bundled classic runtime script, and a fresh connection token. Returns an HTML string for `iframe.srcdoc`; creates no iframe itself. |
| `createBindingHost(port, { loadEngine, onStatus?, onError?, onClose? })`                      | Owns the port and engines returned by `loadEngine(unitId, signal)`. Return an already loaded engine; release partial instances on abort/failure.                             |
| `host.flush()`                                                                                | Save current changes and continue editing.                                                                                                                                   |
| `host.resume()`                                                                               | Resume editing after a successful `prepareToLeave()` when navigation is cancelled.                                                                                           |
| `host.prepareToLeave()`                                                                       | Save-before-leave operation: submit page drafts, pause new writes, drain writes, wait for all loaded Units’ acknowledgements.                                                |
| `host.hasPendingChanges()`                                                                    | Reports page drafts and in-flight writes; does not include SDK unsynced status.                                                                                              |
| `host.dispose()`                                                                              | Closes the channel and releases engines; idempotent, with no implicit save.                                                                                                  |

`onStatus(states)` receives SDK `CollaborationStatus[]` for loaded engines. Compare each to `CollaborationStatus.SYNCED` when deciding whether navigation needs a warning. `onError(message)` receives declarative runtime errors; an empty message clears a previous error. `onClose()` reports channel closure. Handle rejected custom page API calls in the page itself. The host caches one load promise per Unit, reuses it for concurrent requests, and removes a failed load so a later explicit request can try again; it does not automatically retry failed page operations.

## DOM mounting

For a custom trusted environment, `mountHtmlView({ document, client, onError?, onPendingChanges? })` binds the supplied DOM to a `BindingDataClient` with internal data subscriptions. The standard runtime keeps this adapter separate from the public page client. It returns the two ById callback methods, `flush()` (submit DOM drafts only), `hasPendingChanges()`, and `dispose()`. It does not create a sandbox, authorize Units, or wait for collaboration acknowledgement by itself. The iframe program embedded in `renderHtmlView` already mounts the page; do not mount it a second time.

`allowedOrigins` controls resources and requests. `mediaSources` accepts HTTP(S) URL prefixes and adds them to `img-src` and `media-src` only. Native form navigation is always blocked by `form-action 'none'`.
