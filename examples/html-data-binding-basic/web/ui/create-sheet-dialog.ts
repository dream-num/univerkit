import type { ExampleFile } from "../../shared/files.js";
import { createSheet } from "../api/files.js";
import { $, message } from "./dom.js";

/** The dialog that creates a blank collaborative Sheet. */
export function setupCreateSheetDialog(options: {
  onCreated: (file: ExampleFile) => Promise<void>;
  onError: (reason: unknown) => void;
}) {
  const dialog = $<HTMLDialogElement>("#create-dialog");
  const form = $<HTMLFormElement>("#create-form");
  $("#new-sheet").onclick = () => {
    form.reset();
    $("#create-error").textContent = "";
    dialog.showModal();
  };
  $("#cancel-create").onclick = () => dialog.close();
  form.onsubmit = (event) => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    button.disabled = true;
    void createSheet(String(new FormData(form).get("name") ?? ""))
      .then(async (file) => {
        dialog.close();
        await options.onCreated(file);
      })
      .catch((reason: unknown) => {
        $("#create-error").textContent = message(reason);
        options.onError(reason);
      })
      .finally(() => {
        button.disabled = false;
      });
  };
}
