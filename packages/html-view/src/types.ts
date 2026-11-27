export interface HtmlCellReference {
  readonly unitId: string;
  readonly sheetId: string;
  readonly row: number;
  readonly col: number;
}
export interface HtmlRangeReference {
  readonly unitId: string;
  readonly sheetId: string;
  readonly range: {
    readonly startRow: number;
    readonly endRow: number;
    readonly startColumn: number;
    readonly endColumn: number;
  };
}
export type HtmlBindingDeclaration =
  | {
      readonly kind: "text" | "model" | "cell";
      readonly reference: HtmlCellReference;
      readonly disabled: boolean;
    }
  | { readonly kind: "range"; readonly reference: HtmlRangeReference; readonly disabled: boolean };
export type HtmlViewBinding = HtmlBindingDeclaration & {
  readonly id: string;
};
export interface HtmlViewDocument {
  readonly html: string;
  readonly bindings: readonly HtmlViewBinding[];
}
