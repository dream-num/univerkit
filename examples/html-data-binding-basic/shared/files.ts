export type ExampleFile =
  | { id: string; name: string; kind: "sheet"; unitId: string }
  | { id: string; name: string; kind: "html" };

export interface BindingUnitMetadata {
  id: string;
  name: string;
  sheets: { id: string; name: string }[];
}
