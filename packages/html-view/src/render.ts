// Public host entry. The iframe program is included as text by the host implementation.
export { renderHtmlView } from "./host/render.js";
export type {
  BindingEnginePort,
  BindingSourceState,
  BindingInspectOptions,
  BindingUnitMetadata,
  HtmlViewLocale,
  HtmlViewPhase,
  HtmlViewState,
  RenderHtmlViewOptions,
  HtmlViewHandle,
} from "./host/render.js";
