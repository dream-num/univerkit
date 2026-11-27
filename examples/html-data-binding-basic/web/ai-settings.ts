export function setupAiSettings() {
  const dialog = document.querySelector<HTMLDialogElement>("#ai-settings-dialog")!;
  const form = document.querySelector<HTMLFormElement>("#ai-settings-form")!;
  const input = form.querySelector<HTMLInputElement>('[name="apiKey"]')!;
  const status = document.querySelector<HTMLElement>("#ai-key-status")!;
  const error = document.querySelector<HTMLElement>("#ai-settings-error")!;
  const buttons = [...form.querySelectorAll<HTMLButtonElement>("button")];
  let busy = false;
  let configured = false;
  let returnToGeneration = false;

  async function request(apiKey?: string) {
    if (busy) return;
    busy = true;
    input.disabled = true;
    buttons.forEach((button) => {
      button.disabled = true;
    });
    error.textContent = "";
    try {
      const response = await fetch(
        "/api/ai/settings",
        apiKey === undefined
          ? {}
          : {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ apiKey }),
            },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update AI settings.");
      configured = result.configured;
      status.textContent = configured ? "API Key configured" : "API Key not configured";
      input.value = "";
      if (apiKey && configured && returnToGeneration) dialog.close();
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : String(reason);
    } finally {
      busy = false;
      input.disabled = false;
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
  }

  function open(fromGeneration = false): Promise<boolean> {
    returnToGeneration = fromGeneration;
    configured = false;
    form.reset();
    status.textContent = "Loading…";
    dialog.showModal();
    void request();
    return new Promise((resolve) => {
      dialog.addEventListener("close", () => resolve(configured), { once: true });
    });
  }
  document.querySelector<HTMLButtonElement>("#ai-settings")!.onclick = () => {
    void open();
  };
  document.querySelector<HTMLButtonElement>("#ai-settings-close")!.onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    input.value = "";
  });
  form.onsubmit = (event) => {
    event.preventDefault();
    if (!input.value.trim()) return;
    void request(input.value.trim());
  };
  document.querySelector<HTMLButtonElement>("#ai-key-clear")!.onclick = () => {
    void request("");
  };
  return { open };
}
