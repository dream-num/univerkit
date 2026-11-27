import "./styles.css";
import { CollaborationStatus } from "@univerjs-pro/collaboration-client";
import { AI_DRAFT_KEY, type HtmlDraft } from "../shared/ai.js";
import type { ExampleFile } from "../shared/files.js";
import { setupAi } from "./ai/ai.js";
import { setupAiSettings } from "./ai/ai-settings.js";
import { createHtml, getHtml, listFiles, saveHtml } from "./api/files.js";
import { statusText } from "./config.js";
import { setupCreateSheetDialog } from "./ui/create-sheet-dialog.js";
import { $, message } from "./ui/dom.js";
import { setupImportButton } from "./ui/import-button.js";
import { setupShareDialog } from "./ui/share-dialog.js";
import { openHtml, type HtmlView } from "./views/html.js";

interface OpenView {
  flush(): Promise<void>;
  dispose(): void;
  hasPendingChanges(): boolean;
}

const aiSettings = setupAiSettings();
const shareDialog = setupShareDialog();
const content = $("#content");
const search = new URLSearchParams(location.search);

// Page state
let files: ExampleFile[] = [];
let selected: ExampleFile | undefined;
let view: OpenView | undefined;
let htmlView: HtmlView | undefined;
let sourceEditor: HTMLTextAreaElement | undefined;
let savedSource = "";
let sourceDirty = false;
let savingSource = false;
let switching = false;
let savedNavigation = false;
let unsynced = false;
let inspecting = false;
let immersive = search.get("view") === "immersive";
const draftId = search.get("draft");
let draft = readDraft(draftId);

function readDraft(id: string | null): HtmlDraft | undefined {
  const stored = id ? sessionStorage.getItem(AI_DRAFT_KEY) : null;
  const value = stored ? (JSON.parse(stored) as HtmlDraft) : undefined;
  return value?.id === id ? value : undefined;
}

// Feedback
function setError(text: string) {
  $("#error").textContent = text;
  $("#error").hidden = !text;
}
const showError = (reason: unknown) => setError(message(reason));
function updateStatus(states: CollaborationStatus[]) {
  unsynced = states.some((state) => state !== CollaborationStatus.SYNCED);
  $("#status").textContent = statusText(states);
}

// File list
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

async function refresh() {
  files = await listFiles();
  renderFiles();
}

// Opening a file
async function open(file: ExampleFile) {
  if (switching) return;
  if (sourceDirty) throw new Error("Save or discard the HTML source edits before switching files.");
  switching = true;
  $("#files").inert = true;
  setError("");
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
    $("#html-toolbar").hidden = true;
    $("#generate-html").hidden = true;
    $("#status").textContent = "Loading…";
    renderFiles();
    if (file.kind === "sheet") await openSheetFile(file);
    else await openHtmlFile(file);
  } finally {
    switching = false;
    $("#files").inert = false;
  }
}

async function openSheetFile(file: Extract<ExampleFile, { kind: "sheet" }>) {
  const container = document.createElement("div");
  container.className = "sheet-editor";
  content.append(container);
  const { openSheet } = await import("./views/sheet.js");
  const sheet = await openSheet(container, file.unitId, updateStatus);
  view = sheet;
  // Expose the public Facade for inspecting the example in browser devtools.
  Object.assign(window, { univerAPI: sheet.api });
  $("#generate-html").hidden = false;
}

async function openHtmlFile(file: ExampleFile) {
  const html = file.id === draft?.id ? draft.html : await getHtml(file.id);
  savedSource = html;
  sourceEditor = document.createElement("textarea");
  sourceEditor.id = "source";
  sourceEditor.spellcheck = false;
  sourceEditor.value = html;
  sourceEditor.hidden = true;
  sourceEditor.setAttribute("aria-label", "HTML source");
  sourceEditor.oninput = () => {
    sourceDirty = sourceEditor!.value !== savedSource;
    updateShareButtons();
  };
  htmlView = openHtml(content, html, {
    onStatus: updateStatus,
    onError: setError,
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

// HTML view modes: preview, source, binding inspection and immersive
async function setInspect(visible: boolean) {
  if (!htmlView) return;
  if (visible) await htmlView.openInspector();
  else await htmlView.inspect.close();
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

function setImmersive(enabled: boolean) {
  immersive = enabled && selected?.kind === "html";
  if (immersive) void setInspect(false).catch(showError);
  document.body.classList.toggle("immersive", immersive);
  $("#immersive-controls").hidden = !immersive;
  updateViewUrl();
}

function updateViewUrl() {
  if (!selected) return;
  const url = new URL(location.pathname, location.origin);
  const language = search.get("lang");
  if (language === "zh-CN" || language === "en-US") url.searchParams.set("lang", language);
  url.searchParams.set(selected.id === draft?.id ? "draft" : "file", selected.id);
  if (selected.kind === "html" && immersive) url.searchParams.set("view", "immersive");
  history.replaceState(null, "", url);
  $<HTMLAnchorElement>("#open-tab").href = url.href;
}

const canShare = () => !!selected && selected.id !== draft?.id && !sourceDirty && !savingSource;
function updateShareButtons() {
  for (const selector of ["#share-html", "#share-immersive"]) {
    const button = $<HTMLButtonElement>(selector);
    button.disabled = !canShare();
    button.title = button.disabled ? "Save the HTML file before sharing." : "Share this HTML view";
  }
}

// Saving
function saveSource() {
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
      saved = await createHtml(draft.name, html);
      sessionStorage.removeItem(AI_DRAFT_KEY);
      draft = undefined;
    } else {
      await saveHtml(file.id, html);
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
}

// Controls
$("#enter-immersive").onclick = () => {
  setImmersive(true);
  $("#exit-immersive").focus();
};
$("#exit-immersive").onclick = () => {
  setImmersive(false);
  $("#enter-immersive").focus();
};
const share = () => {
  if (selected?.kind === "html" && canShare()) shareDialog.show(selected);
};
$("#share-html").onclick = share;
$("#share-immersive").onclick = share;
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
$("#refresh").onclick = () => {
  void refresh().catch(showError);
};

const requireSavedSource = async (action: string) => {
  if (sourceDirty) throw new Error(`Save or discard the HTML source edits ${action}.`);
  await view?.flush();
};
setupAi({
  openSettings: () => aiSettings.open(true),
  selected: () => selected,
  flush: () => requireSavedSource("first"),
  async preview(value) {
    await requireSavedSource("first");
    sessionStorage.setItem(AI_DRAFT_KEY, JSON.stringify(value));
    savedNavigation = true;
    // Remove the Sheet UI's unload listeners after its changes are confirmed.
    view?.dispose();
    view = undefined;
    // A navigation keeps the Sheet UI and the preview's Headless Engine in separate realms.
    location.assign(`?draft=${encodeURIComponent(value.id)}`);
  },
});
const openCreated = async (id: string) => {
  await refresh();
  const file = files.find((file) => file.id === id);
  if (!file) throw new Error("File not found.");
  await open(file);
};
setupCreateSheetDialog({ onCreated: (file) => openCreated(file.id), onError: showError });
setupImportButton({
  beforeImport: async () => {
    setError("");
    await requireSavedSource("before importing");
  },
  onImported: openCreated,
  onError: showError,
});

// Page lifecycle
window.addEventListener("beforeunload", (event) => {
  if (savedNavigation) return;
  if (sourceDirty || unsynced || view?.hasPendingChanges()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("pagehide", () => view?.dispose());

void refresh()
  .then(async () => {
    const id = search.get("file");
    if (draftId && !draft)
      throw new Error("This draft is unavailable. Open a saved HTML file instead.");
    if (id && !files.some((file) => file.id === id)) throw new Error("File not found.");
    const file: ExampleFile | undefined = draft
      ? { id: draft.id, name: draft.name, kind: "html" }
      : (files.find((file) => file.id === id) ?? files.find((file) => file.kind === "html"));
    if (file) await open(file);
  })
  .catch(showError);
