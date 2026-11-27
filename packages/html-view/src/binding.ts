import { parseCellReference, parseRangeReference } from "./reference.js";
import type { HtmlBindingDeclaration } from "./types.js";

// Used for both initial HTML parsing and bindings added by author scripts.
export function parseCellBinding(
  tagName: string,
  attribute: (name: string) => string | undefined,
  insideText = false,
): HtmlBindingDeclaration | undefined {
  const declared = bindingAttributes.filter((name) => attribute(name) !== undefined);
  if (!declared.length) return;
  if (insideText) throw new Error("A text binding cannot contain another binding.");
  if (declared.length !== 1) throw new Error("Use only one binding attribute on an element.");
  const name = declared[0]!;
  const value = attribute(name)!;
  const kind =
    name === "data-univer-cell-text"
      ? "text"
      : name === "data-univer-cell-model"
        ? "model"
        : name === "data-univer-cell-subscribe"
          ? "cell"
          : "range";
  const text = kind === "text" ? value : undefined;
  const model = kind === "model" ? value : undefined;
  const tag = tagName.toLowerCase();
  if (tag === "template" && (kind === "cell" || kind === "range"))
    throw new Error("Binding requires a content element.");
  if (
    [
      "html",
      "head",
      "body",
      "title",
      "style",
      "script",
      "br",
      "hr",
      "col",
      "img",
      "meta",
      "link",
      "area",
      "base",
      "embed",
      "param",
      "source",
      "track",
      "wbr",
    ].includes(tag)
  )
    throw new Error("Binding requires a content element.");
  if (text !== undefined && ["input", "select", "textarea"].includes(tag))
    throw new Error("Use cell-model for form controls.");
  if (model !== undefined) {
    if (!["input", "select", "textarea"].includes(tag))
      throw new Error("cell-model requires an input, select, or textarea.");
    if (tag === "select" && attribute("multiple") !== undefined)
      throw new Error("cell-model supports single select only.");
    if (
      tag === "input" &&
      !["text", "number", "range", "checkbox"].includes((attribute("type") ?? "text").toLowerCase())
    )
      throw new Error("Unsupported cell-model input type.");
  }
  try {
    if (kind === "range")
      return {
        kind,
        reference: parseRangeReference(value),
        disabled: attribute("disabled") !== undefined,
      };
    return {
      kind,
      reference: parseCellReference(value),
      disabled: attribute("disabled") !== undefined,
    };
  } catch (error) {
    throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const bindingAttributes = [
  "data-univer-cell-text",
  "data-univer-cell-model",
  "data-univer-cell-subscribe",
  "data-univer-range-subscribe",
] as const;
export const bindingSelector = bindingAttributes.map((name) => `[${name}]`).join(",");
export const textBindingSelector = "[data-univer-cell-text]";
