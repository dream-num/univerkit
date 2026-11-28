# Built-in binding inspection

[简体中文](binding-inspection.zh-CN.md) · [Back to README](../README.md) · [View API](render.md)

Inspector belongs to `renderHtmlView`. Open it with `view.inspect.open(options?)` and close it with
`view.inspect.close()`. No separate component or container is needed. `open()` waits for the view handshake.

Set `locale: "zh-CN"` or `"en-US"` (default) when calling `renderHtmlView`. The sidebar and iframe overlays share this language. It stays fixed for that view; create a new view to change it. Names, addresses, and `id: xxx` fallbacks are not translated.

## API and business names

This function accepts an existing view. The application supplies names; fixed names here illustrate the return shape.

```ts
import type { HtmlViewHandle } from "@univerkit/html-view/render";

export async function inspectBudget(view: HtmlViewHandle) {
  await view.inspect.open({
    async loadMetadata(unitId, signal) {
      signal.throwIfAborted();
      return { unitId, name: "Budget", sheets: [{ sheetId: "sheet-1", name: "Overview" }] };
    },
  });
}
```

Without `loadMetadata`, the UI displays `id: xxx`. Return the requested `unitId` and a `sheets` array;
Unit and Sheet `name` fields are optional. A production application can query Unit names from its authorized catalog or API, and read sheet names directly from a loaded Binding Engine (`engine.getSheets()`).
The sidebar, tooltip, and details show names without duplicate IDs. Missing or blank names fall back to
`id: xxx`; failed lookups show a retry message and use the same fallback. Refresh retries failed lookups. Names are display-only;
identity, grouping, positioning, and authorization do not depend on them.

Closing inspection or disposing the view aborts metadata requests. Late results cannot reopen inspection.
Calling `open()` while already open does nothing; close and reopen to change options.

## Visible behavior

- The sidebar groups bindings by Unit → Sheet → reference and lists associated page elements. A compact toolbar shows the total number of page elements, highlight-all, and Refresh. Workbook cards do not repeat the count; the application controls opening and closing inspection.
- Clicking a reference highlights related elements; clicking an element row or bound page element opens pinned details.
- Hover shows a tooltip, hidden while pinned details are open.
- The close button, blank page areas, and Escape clear selection and update the sidebar.
- Opening inspection enables highlight-all by default. Highlight-all uses teal dashed outlines; hovered elements use indigo outlines, and selected elements or reference groups use thicker indigo outlines.
- Highlight-all and selection are independent: toggling all preserves selection; clearing selection restores the all-highlight outline when enabled.
- Closing inspection clears selection, highlights, and overlays, and restores normal template clicks.

Inspection intercepts template clicks so selecting an element does not trigger its business action.
The SDK's iframe code renders tooltips and details; its host code renders the sidebar.
The application does not wire their events or state together.

## Inspection scope

The inspector recognizes `data-univer-cell-text`, `data-univer-cell-model`, `data-univer-cell-subscribe`,
and `data-univer-range-subscribe` using the same parser as binding execution. It inspects current DOM declarations;
it does not read cell values, analyze Sheet relationships, or infer dependencies inside JavaScript callbacks.

A chart or list is represented by its declaring element. Children appear separately only if they declare a binding.
Script strings, comments, removed elements, and uninstantiated template content are excluded.
Additions, removals, and retargeting update the sidebar; rendered value changes alone do not rebuild relations.

The inspector reports invalid declarations and duplicate HTML IDs found in the live DOM. The initial template
must still pass `parseHtmlView`: a template that fails parsing cannot create a view or reach inspection.

## Ownership

| Owner       | Responsibility                                                                         |
| ----------- | -------------------------------------------------------------------------------------- |
| Application | Container, template, authorized Engine, optional names, and when to open inspection    |
| SDK host    | Sidebar, grouping, metadata loading, error/empty states, and selection synchronization |
| SDK iframe  | DOM scanning, element identities, picking, highlights, tooltips, and pinned details    |
| Shared      | Inspection record types, pure parsing functions, and messaging                         |

Inspection commands are not part of the template's `window.univerBinding`. Low-level `createBindingHost`
inspection methods serve custom assembly; applications use the complete view capability.
See [architecture](architecture.md) for the code boundaries.
