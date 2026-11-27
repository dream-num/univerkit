import { IMPORT_ACCEPT, importSheet } from "../api/import.js";
import { $ } from "./dom.js";

/** The sidebar button that imports a spreadsheet as a new Sheet. */
export function setupImportButton(options: {
  /** Rejects to cancel the import, for example while edits are unsaved. */
  beforeImport: () => Promise<void>;
  onImported: (unitId: string) => Promise<void>;
  onError: (reason: unknown) => void;
}) {
  const button = $<HTMLButtonElement>("#import-sheet");
  const input = $<HTMLInputElement>("#import-file");
  const status = $("#import-status");
  input.accept = IMPORT_ACCEPT;
  button.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file || button.disabled) return;
    button.disabled = true;
    try {
      await options.beforeImport();
      status.textContent = `Importing ${file.name}…`;
      status.hidden = false;
      await options.onImported(await importSheet(file));
    } catch (reason) {
      options.onError(reason);
    } finally {
      button.disabled = false;
      status.hidden = true;
      input.value = "";
    }
  };
}
