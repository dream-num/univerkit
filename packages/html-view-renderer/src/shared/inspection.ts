import {
  bindingAttributes,
  parseCellBinding,
  type HtmlBindingDeclaration,
} from "@univerkit/html-view";

export interface InspectedBinding {
  readonly id: string;
  readonly elementId: string | null;
  readonly tagName: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly binding: HtmlBindingDeclaration | null;
  readonly diagnostics: readonly string[];
}

// Validate the declaration using the same parser as the live binding runtime.
export function inspectBindingDeclaration(
  tagName: string,
  attribute: (name: string) => string | undefined,
  insideText = false,
): Pick<InspectedBinding, "attributes" | "binding" | "diagnostics"> {
  const attributes = Object.fromEntries(
    bindingAttributes
      .filter((name) => attribute(name) !== undefined)
      .map((name) => [name, attribute(name)!]),
  );
  try {
    return {
      attributes,
      binding: parseCellBinding(tagName, attribute, insideText) ?? null,
      diagnostics: [],
    };
  } catch (error) {
    return {
      attributes,
      binding: null,
      diagnostics: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function bindingAddress(binding: HtmlBindingDeclaration): string {
  const cell = (row: number, col: number) => {
    let name = "";
    for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26))
      name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return `${name}${row + 1}`;
  };
  if (binding.kind !== "range") return cell(binding.reference.row, binding.reference.col);
  const r = binding.reference.range;
  return `${cell(r.startRow, r.startColumn)}:${cell(r.endRow, r.endColumn)}`;
}

export interface BindingUnitMetadata {
  readonly unitId: string;
  readonly name?: string;
  readonly sheets: readonly { readonly sheetId: string; readonly name?: string }[];
}
export interface BindingInspectOptions {
  readonly loadMetadata?: (unitId: string, signal: AbortSignal) => Promise<BindingUnitMetadata>;
}
