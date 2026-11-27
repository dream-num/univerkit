import "./styles.css";
import type { BindingUnitMetadata, ExampleFile } from "../shared/files.js";
import { statusText } from "./config.js";
import { openHtml } from "./html.js";
import { CollaborationStatus } from "@univerjs-pro/collaboration-client";
import { setupAi } from "./ai.js";
import { setupAiSettings } from "./ai-settings.js";
import { AI_DRAFT_KEY, type HtmlDraft } from "../shared/ai.js";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const aiSettings = setupAiSettings();
const content = $("#content");
let files: ExampleFile[] = [];
let selected: ExampleFile | undefined;
let view: { flush(): Promise<void>; dispose(): void; hasPendingChanges(): boolean } | undefined;
let switching = false;
let savedNavigation = false;
let unsynced = false;
let sourceDirty = false;
let savingSource = false;
let savedSource = "";
let sourceEditor: HTMLTextAreaElement | undefined;
let htmlView: ReturnType<typeof openHtml> | undefined;
let inspecting = false;
async function setInspect(visible: boolean) {
  if (!htmlView) return;
  if (!visible) return htmlView.inspect.close();
  await htmlView.inspect.open({
    async loadMetadata(unitId, signal) {
      const value = await request<BindingUnitMetadata>(
        `/api/files/${encodeURIComponent(unitId)}/binding-metadata`,
        { signal },
      );
      return {
        unitId: value.id,
        name: value.name,
        sheets: value.sheets.map((sheet) => ({ sheetId: sheet.id, name: sheet.name })),
      };
    },
  });
}
let immersive = new URLSearchParams(location.search).get("view") === "immersive";
const draftId = new URLSearchParams(location.search).get("draft");
let draft: HtmlDraft | undefined;
if (draftId) {
  const stored = sessionStorage.getItem(AI_DRAFT_KEY);
  if (stored) {
    const value = JSON.parse(stored) as HtmlDraft;
    if (value.id === draftId) draft = value;
  }
}
const error = (message: string) => {
  $("#error").textContent = message;
  $("#error").hidden = !message;
};
const updateStatus = (states: CollaborationStatus[]) => {
  unsynced = states.some((state) => state !== CollaborationStatus.SYNCED);
  $("#status").textContent = statusText(states);
};
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed.");
  return result as T;
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
function renderFiles() {
  $("#files").replaceChildren(
    ...files.map((file) => {
      const link = document.createElement("a");
      link.className = "file" + (selected?.id === file.id ? " active" : "");
      link.href = `?file=${encodeURIComponent(file.id)}`;
      link.dataset.fileId = file.id;
      const icon = document.createElement("span");
      icon.className = "file-icon" + (file.kind === "html" ? " html" : "");
      icon.textContent = file.kind === "sheet" ? "▦" : "</>";
      const label = document.createElement("span");
      label.className = "file-name";
      label.textContent = file.name;
      const hint = document.createElement("small");
      hint.textContent = file.kind === "sheet" ? "Collaborative Sheet" : "HTML data binding";
      label.append(hint);
      link.append(icon, label);
      link.onclick = (event) => {
        if (event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        void open(file).catch(showError);
      };
      return link;
    }),
  );
  $("#files").querySelector(".active")?.scrollIntoView({ block: "nearest" });
}
const showError = (reason: unknown) =>
  error(reason instanceof Error ? reason.message : String(reason));
async function refresh() {
  files = await request<ExampleFile[]>("/api/files");
  renderFiles();
}
async function open(file: ExampleFile) {
  if (switching) return;
  if (sourceDirty) throw new Error("Save or discard the HTML source edits before switching files.");
  switching = true;
  $("#files").inert = true;
  error("");
  try {
    if (view) {
      if (htmlView) await htmlView.prepareToLeave();
      else await view.flush();
      savedNavigation = true;
      // UI Facade mixins are global to a JavaScript realm. A file navigation gives
      // the UI editor and Headless Engine separate realms without patching SDK code.
      location.assign(`?file=${encodeURIComponent(file.id)}`);
      return;
    }
    htmlView = undefined;
    sourceEditor = undefined;
    content.replaceChildren();
    selected = file;
    unsynced = false;
    updateViewUrl();
    $("#file-name").textContent = file.name;
    $("#file-kind").textContent =
      file.id === draft?.id
        ? "HTML / UNSAVED AI DRAFT"
        : file.kind === "sheet"
          ? "SHEET / REAL-TIME COLLABORATION"
          : "HTML / LIVE SHEET DATA";
    $<HTMLAnchorElement>("#open-tab").href = location.href;
    $("#html-toolbar").hidden = true;
    $("#generate-html").hidden = true;
    $("#status").textContent = "Loading…";
    renderFiles();
    if (file.kind === "sheet") {
      const container = document.createElement("div");
      container.className = "sheet-editor";
      content.append(container);
      const { openSheet } = await import("./collaboration.js");
      const sheet = await openSheet(container, file.unitId, updateStatus);
      view = sheet;
      // Expose the public Facade for inspecting the example in browser devtools.
      Object.assign(window, { univerAPI: sheet.api });
      $("#generate-html").hidden = false;
    } else {
      const data =
        file.id === draft?.id
          ? draft
          : await request<{ html: string }>(`/api/files/${encodeURIComponent(file.id)}/content`);
      savedSource = data.html;
      sourceEditor = document.createElement("textarea");
      sourceEditor.id = "source";
      sourceEditor.spellcheck = false;
      sourceEditor.value = data.html;
      sourceEditor.hidden = true;
      sourceEditor.setAttribute("aria-label", "HTML source");
      sourceEditor.oninput = () => {
        sourceDirty = sourceEditor!.value !== savedSource;
        updateShareButtons();
      };
      htmlView = openHtml(content, data.html, {
        onStatus: updateStatus,
        onError: error,
        onInspectChanged: (visible) => {
          inspecting = visible;
          document.body.classList.toggle("inspecting-bindings", visible);
          $("#bindings-tab").setAttribute("aria-pressed", String(visible));
          $("#bindings-tab").classList.toggle("active", visible);
          $("#preview-tab").classList.toggle("active", !visible);
        },
      });
      view = htmlView;
      content.append(sourceEditor);
      setSourceMode(false);
      $("#html-toolbar").hidden = false;
      setImmersive(immersive);
    }
  } finally {
    switching = false;
    $("#files").inert = false;
  }
}
function setSourceMode(source: boolean) {
  if (!htmlView || !sourceEditor) return;
  if (source) void setInspect(false).catch(showError);
  htmlView.container.hidden = source;
  sourceEditor.hidden = !source;
  $("#save-source").hidden = !source;
  $("#discard-source").hidden = !source;
  $("#save-draft").hidden = !draft || source;
  $("#discard-draft").hidden = !draft;
  $("#source-tab").classList.toggle("active", source);
  $("#preview-tab").classList.toggle("active", !source);
  $("#enter-immersive").hidden = source;
  $("#share-html").hidden = source;
  updateShareButtons();
}
function updateViewUrl() {
  if (!selected) return;
  const url = new URL(location.pathname, location.origin);
  const language = new URLSearchParams(location.search).get("lang");
  if (language === "zh-CN" || language === "en-US") url.searchParams.set("lang", language);
  url.searchParams.set(selected.id === draft?.id ? "draft" : "file", selected.id);
  if (selected.kind === "html" && immersive) url.searchParams.set("view", "immersive");
  history.replaceState(null, "", url);
  $<HTMLAnchorElement>("#open-tab").href = url.href;
}
function updateShareButtons() {
  const disabled = !selected || selected.id === draft?.id || sourceDirty || savingSource;
  for (const selector of ["#share-html", "#share-immersive"]) {
    const button = $<HTMLButtonElement>(selector);
    button.disabled = disabled;
    button.title = disabled ? "Save the HTML file before sharing." : "Share this HTML view";
  }
}
function setImmersive(enabled: boolean) {
  immersive = enabled && selected?.kind === "html";
  if (immersive) void setInspect(false).catch(showError);
  document.body.classList.toggle("immersive", immersive);
  $("#immersive-controls").hidden = !immersive;
  updateViewUrl();
}
$("#enter-immersive").onclick = () => {
  setImmersive(true);
  $("#exit-immersive").focus();
};
$("#exit-immersive").onclick = () => {
  setImmersive(false);
  $("#enter-immersive").focus();
};
const shareDialog = $<HTMLDialogElement>("#share-dialog");
const shareLink = $<HTMLInputElement>("#share-link");
const showShare = () => {
  if (
    !selected ||
    selected.kind !== "html" ||
    selected.id === draft?.id ||
    sourceDirty ||
    savingSource
  )
    return;
  const url = new URL(location.pathname, location.origin);
  const language = new URLSearchParams(location.search).get("lang");
  if (language === "zh-CN" || language === "en-US") url.searchParams.set("lang", language);
  url.searchParams.set("file", selected.id);
  url.searchParams.set("view", "immersive");
  shareLink.value = url.href;
  $("#share-name").textContent = selected.name;
  $("#share-status").textContent = "";
  $("#share-hint").textContent = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ? "This is a local link. To share with another device, open this app using an address that device can reach."
    : "Anyone who can access this server can open the view and use its controls.";
  shareDialog.showModal();
  shareLink.select();
};
$("#share-html").onclick = showShare;
$("#share-immersive").onclick = showShare;
$("#close-share").onclick = () => shareDialog.close();
$("#copy-share").onclick = async () => {
  try {
    await navigator.clipboard.writeText(shareLink.value);
    $("#share-status").textContent = "Link copied";
  } catch {
    shareLink.focus();
    shareLink.select();
    $("#share-status").textContent = "Select and copy the link above.";
  }
};
$("#bindings-tab").onclick = () => {
  const visible = !inspecting;
  setSourceMode(false);
  void setInspect(visible).catch(showError);
};
$("#source-tab").onclick = () => setSourceMode(true);
$("#preview-tab").onclick = () => {
  void setInspect(false).catch(showError);
  setSourceMode(false);
};
$("#discard-source").onclick = () => {
  if (sourceEditor) sourceEditor.value = savedSource;
  sourceDirty = false;
  updateShareButtons();
};
const saveSource = () => {
  if (!selected || !sourceEditor || savingSource) return;
  savingSource = true;
  $<HTMLButtonElement>("#save-source").disabled = true;
  $<HTMLButtonElement>("#save-draft").disabled = true;
  const file = selected;
  const html = sourceEditor.value;
  void (async () => {
    await view?.flush();
    let saved = file;
    if (file.id === draft?.id) {
      saved = await request<ExampleFile>(
        "/api/files",
        json("POST", {
          kind: "html",
          name: draft.name,
          html,
        }),
      );
      sessionStorage.removeItem(AI_DRAFT_KEY);
      draft = undefined;
    } else {
      await request(`/api/files/${encodeURIComponent(file.id)}/content`, json("PUT", { html }));
    }
    sourceDirty = false;
    await open(saved);
  })()
    .catch(showError)
    .finally(() => {
      savingSource = false;
      $<HTMLButtonElement>("#save-source").disabled = false;
      $<HTMLButtonElement>("#save-draft").disabled = false;
    });
};
$("#save-source").onclick = saveSource;
$("#save-draft").onclick = saveSource;
$("#discard-draft").onclick = () => {
  const file = files.find((file) => file.kind === "html") ?? files[0];
  if (!file) return;
  void (async () => {
    await view?.flush();
    sourceDirty = false;
    sessionStorage.removeItem(AI_DRAFT_KEY);
    draft = undefined;
    await open(file);
  })().catch(showError);
};
setupAi({
  openSettings: () => aiSettings.open(true),
  selected: () => selected,
  async flush() {
    if (sourceDirty) throw new Error("Save or discard the HTML source edits first.");
    await view?.flush();
  },
  async preview(value) {
    if (sourceDirty) throw new Error("Save or discard the HTML source edits first.");
    await view?.flush();
    sessionStorage.setItem(AI_DRAFT_KEY, JSON.stringify(value));
    savedNavigation = true;
    // Remove the Sheet UI's unload listeners after its changes are confirmed.
    view?.dispose();
    view = undefined;
    // A navigation keeps the Sheet UI and the preview's Headless Engine in separate realms.
    location.assign(`?draft=${encodeURIComponent(value.id)}`);
  },
});
$("#refresh").onclick = () => {
  void refresh().catch(showError);
};
window.addEventListener("beforeunload", (event) => {
  if (savedNavigation) return;
  if (sourceDirty || unsynced || view?.hasPendingChanges()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("pagehide", () => view?.dispose());
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
  const data = new FormData(form);
  const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  button.disabled = true;
  void request<ExampleFile>(
    "/api/files",
    json("POST", {
      kind: "sheet",
      name: data.get("name"),
    }),
  )
    .then(async (file) => {
      dialog.close();
      await refresh();
      await open(file);
    })
    .catch((reason: unknown) => {
      $("#create-error").textContent = reason instanceof Error ? reason.message : String(reason);
      showError(reason);
    })
    .finally(() => {
      button.disabled = false;
    });
};
const importButton = $<HTMLButtonElement>("#import-sheet");
const importInput = $<HTMLInputElement>("#import-file");
const importStatus = $("#import-status");
importButton.onclick = () => importInput.click();
importInput.onchange = async () => {
  const file = importInput.files?.[0];
  if (!file || importButton.disabled) return;
  importButton.disabled = true;
  error("");
  try {
    if (sourceDirty) throw new Error("Save or discard the HTML source edits before importing.");
    if (!/\.(xlsx?|csv|tsv)$/i.test(file.name))
      throw new Error("Choose an XLS, XLSX, CSV, or TSV file.");
    if (file.size > 25 * 1024 * 1024) throw new Error("Choose a file smaller than 25 MiB.");
    if (!file.size) throw new Error("The selected file is empty.");
    await view?.flush();
    importStatus.textContent = `Importing ${file.name}…`;
    importStatus.hidden = false;
    const body = new FormData();
    body.append("name", file.name);
    body.append("file", file);
    const created = await request<ExampleFile>("/api/files/import", { method: "POST", body });
    await refresh();
    await open(created);
  } catch (reason) {
    showError(reason);
  } finally {
    importButton.disabled = false;
    importStatus.hidden = true;
    importInput.value = "";
  }
};
void refresh()
  .then(async () => {
    const id = new URLSearchParams(location.search).get("file");
    if (draftId && !draft)
      throw new Error("This draft is unavailable. Open a saved HTML file instead.");
    if (id && !files.some((file) => file.id === id)) throw new Error("File not found.");
    const file: ExampleFile | undefined = draft
      ? { id: draft.id, name: draft.name, kind: "html" }
      : (files.find((file) => file.id === id) ?? files.find((file) => file.kind === "html"));
    if (file) await open(file);
  })
  .catch(showError);
