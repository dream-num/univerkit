export type ExampleFile =
  | { id: string; name: string; kind: "sheet"; unitId: string }
  | { id: string; name: string; kind: "html" };
