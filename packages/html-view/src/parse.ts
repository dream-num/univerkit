import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";
import { parseCellBinding } from "./binding.js";
import type { HtmlViewDocument, HtmlViewBinding } from "./types.js";

type Node = DefaultTreeAdapterMap["childNode"];

// Only validate binding declarations; the host owns HTML/CSS/JS runtime isolation.
export function parseHtmlView(source: string): HtmlViewDocument {
  const document = parse(source, { sourceCodeLocationInfo: true });
  const bindings: HtmlViewBinding[] = [];
  const visit = (nodes: Node[], insideText = false) => {
    for (const node of nodes) {
      if (!("tagName" in node)) continue;
      node.attrs = node.attrs.filter((attribute) => attribute.name !== "data-univer-binding");
      const attr = (name: string) => node.attrs.find((attribute) => attribute.name === name)?.value;
      try {
        const binding = parseCellBinding(node.tagName, attr, insideText);
        if (binding) {
          const id = String(bindings.length);
          bindings.push({ id, ...binding });
          node.attrs.push({ name: "data-univer-binding", value: id });
        }
      } catch (error) {
        throw new Error(
          `<${node.tagName}> at line ${node.sourceCodeLocation?.startLine ?? "?"}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      visit(node.childNodes, insideText || attr("data-univer-cell-text") !== undefined);
    }
  };
  visit(document.childNodes);
  return { bindings, html: serialize(document) };
}
