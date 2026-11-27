export {
  parseCellBinding,
  bindingAttributes,
  bindingSelector,
  textBindingSelector,
} from "./binding.js";
export { parseHtmlView } from "./parse.js";
export {
  parseCellReference,
  parseRangeReference,
  cellReferenceKey,
  getHtmlViewUnitIds,
} from "./reference.js";
export type {
  HtmlCellReference,
  HtmlRangeReference,
  HtmlBindingDeclaration,
  HtmlViewBinding,
  HtmlViewDocument,
} from "./types.js";
export function isHtmlViewFilename(filename: string): boolean {
  return /\.univer\.html$/i.test(filename);
}
