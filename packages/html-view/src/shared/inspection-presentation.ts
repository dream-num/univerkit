import { inspectionMessages, type HtmlViewLocale } from "./locale.js";
import type { BindingUnitMetadata, InspectedBinding } from "./inspection.js";

export const bindingKindLabel = (record: InspectedBinding, locale: HtmlViewLocale = "en-US") => {
  const t = inspectionMessages(locale);
  return { text: t.text, model: t.model, cell: t.cellSubscription, range: t.rangeSubscription }[
    record.binding?.kind ?? "text"
  ];
};

export const bindingElementLabel = (record: InspectedBinding) =>
  record.elementId ? `#${record.elementId}` : `<${record.tagName}>`;

/** Display names are optional. Missing or blank names explicitly fall back to their IDs. */
export function createInspectionNames(metadata: readonly BindingUnitMetadata[]) {
  const display = (name: string | undefined, id: string) => name?.trim() || `id: ${id}`;
  return (unitId: string, sheetId: string) => {
    const unit = metadata.find((item) => item.unitId === unitId);
    return {
      unitName: display(unit?.name, unitId),
      sheetName: display(unit?.sheets.find((item) => item.sheetId === sheetId)?.name, sheetId),
    };
  };
}
