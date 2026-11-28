export { mountHtmlView } from "./iframe/dom.js";
export { createBindingHost } from "./host/binding-host.js";
export { createHtmlViewDocument } from "./host/document.js";
export type {
  BindingEngineClient,
  BindingDataClient,
  ElementBindingClient,
  HtmlRangeReference,
  HtmlInsertRowsWithValuesParams,
} from "./shared/client-types.js";

export { bindingAddress } from "./shared/inspection.js";
export type { InspectedBinding } from "./shared/inspection.js";
