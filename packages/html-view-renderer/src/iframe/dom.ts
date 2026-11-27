import { mountElementSubscriptions } from "./element-subscriptions.js";
import type { CellState, CellValue } from "@univerkit/binding-engine";
import {
  parseCellBinding,
  cellReferenceKey,
  bindingAttributes,
  bindingSelector,
  textBindingSelector,
  type HtmlCellReference,
} from "@univerkit/html-view";
import type { BindingDataClient } from "../shared/client-types.js";

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
interface Binding {
  element: HTMLElement;
  signature: string;
  group: Group;
  kind: "text" | "model";
  disabled: boolean;
  dirty: boolean;
  version: number;
  submitted?: { version: number; promise: Promise<void> };
  error?: HTMLElement;
  cleanup: () => void;
}
interface Group {
  reference: HtmlCellReference;
  bindings: Set<Binding>;
  state?: CellState;
  subscription?: { dispose(): void };
  lastWrite: number;
  pending?: Binding;
  timer?: ReturnType<typeof setTimeout>;
}

export function mountHtmlView(options: {
  document: Document;
  client: BindingDataClient;
  onError?: (message: string) => void;
  onPendingChanges?: (pending: boolean) => void;
}) {
  const { document, client } = options;
  const elementSubscriptions = mountElementSubscriptions(options);
  const bindings = new Map<HTMLElement, Binding>();
  const groups = new Map<string, Group>();
  const invalid = new Map<HTMLElement, { signature: string; message: string; disabled: boolean }>();
  let disposed = false;
  let reportedError = "";
  const report = () => {
    if (disposed) return;
    const message =
      [...bindings.values()].find((binding) => binding.error)?.error?.textContent ??
      [...invalid.values()][0]?.message ??
      "";
    if (message === reportedError) return;
    reportedError = message;
    options.onError?.(message);
  };
  const hasPendingChanges = () => [...bindings.values()].some((binding) => binding.dirty);
  const changed = () => options.onPendingChanges?.(hasPendingChanges());
  const numeric = (input: Control) =>
    input.tagName === "INPUT" && ["number", "range"].includes(input.type);
  const checkbox = (input: Control): input is HTMLInputElement =>
    input.tagName === "INPUT" && input.type === "checkbox";
  const compatible = (input: Control, value: CellValue | null) =>
    value === null ||
    (checkbox(input)
      ? typeof value === "boolean"
      : numeric(input)
        ? typeof value === "number"
        : typeof value === "string");
  const clearError = (binding: Binding) => {
    binding.error?.remove();
    delete binding.error;
    binding.element.removeAttribute("aria-invalid");
    report();
  };
  const showError = (binding: Binding, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (binding.error?.textContent === message) return;
    clearError(binding);
    binding.element.setAttribute("aria-invalid", "true");
    binding.error = document.createElement("span");
    binding.error.setAttribute("role", "alert");
    binding.error.textContent = message;
    binding.element.insertAdjacentElement("afterend", binding.error);
    report();
  };
  const render = (binding: Binding) => {
    const state = binding.group.state;
    if (disposed || !state) return;
    if (binding.kind === "text") {
      const text = String(state.value ?? "");
      if (binding.element.textContent !== text) binding.element.textContent = text;
      return;
    }
    const input = binding.element as Control;
    input.disabled = binding.disabled || !compatible(input, state.value);
    if (binding.dirty) return;
    if (!compatible(input, state.value)) {
      showError(binding, "单元格类型与控件不兼容。");
      return;
    }
    clearError(binding);
    if (checkbox(input)) input.checked = state.value === true;
    else input.value = String(state.value ?? "");
  };
  const cancelPending = (group: Group) => {
    if (group.timer) clearTimeout(group.timer);
    delete group.timer;
    delete group.pending;
  };
  const active = (binding: Binding) => !disposed && bindings.get(binding.element) === binding;
  const write = (binding: Binding): Promise<void> => {
    if (!active(binding)) return Promise.resolve();
    if (binding.submitted?.version === binding.version) return binding.submitted.promise;
    const group = binding.group;
    cancelPending(group);
    const input = binding.element as Control;
    const version = binding.version;
    binding.dirty = true;
    changed();
    const promise = (async () => {
      try {
        const state = group.state;
        if (binding.disabled || ("readOnly" in input && input.readOnly) || !state)
          throw new Error("单元格不可写。");
        if (!compatible(input, state.value)) throw new Error("单元格类型与控件不兼容。");
        if (!input.validity.valid) throw new Error("输入不符合控件约束。");
        let value: CellValue;
        if (checkbox(input)) value = input.checked;
        else if (numeric(input)) {
          if (!input.value.trim() || !Number.isFinite(Number(input.value)))
            throw new Error("请输入有效数字。");
          value = Number(input.value);
        } else value = input.value;
        group.lastWrite = Date.now();
        await client.setCellValue(group.reference, value);
        const latest = await client.getCellState(group.reference);
        if (!active(binding)) return;
        group.state = latest;
        if (binding.version === version) {
          binding.dirty = false;
          clearError(binding);
        }
        group.bindings.forEach(render);
      } catch (error) {
        if (active(binding) && binding.version === version) showError(binding, error);
        throw error;
      } finally {
        changed();
      }
    })();
    binding.submitted = { version, promise };
    void promise
      .finally(() => {
        if (binding.submitted?.promise === promise) delete binding.submitted;
      })
      .catch(() => {});
    return promise;
  };
  const submit = (binding: Binding, immediate: boolean) => {
    const group = binding.group;
    if (group.pending && group.pending !== binding) {
      group.pending.dirty = false;
      clearError(group.pending);
      render(group.pending);
    }
    cancelPending(group);
    const wait = immediate ? 0 : Math.max(0, 100 - (Date.now() - group.lastWrite));
    if (!wait) {
      void write(binding).catch(() => {});
      return;
    }
    group.pending = binding;
    group.timer = setTimeout(() => {
      void write(binding).catch(() => {});
    }, wait);
  };
  const remove = (binding: Binding) => {
    binding.cleanup();
    clearError(binding);
    const group = binding.group;
    if (group.pending === binding) cancelPending(group);
    group.bindings.delete(binding);
    bindings.delete(binding.element);
    if (binding.kind === "model") (binding.element as Control).disabled = binding.disabled;
    if (!group.bindings.size) {
      groups.delete(cellReferenceKey(group.reference));
      group.subscription?.dispose();
    }
  };
  const scan = () => {
    if (disposed) return;
    const elements = new Set(document.querySelectorAll<HTMLElement>(bindingSelector));
    const signature = (element: HTMLElement) =>
      JSON.stringify([
        ...bindingAttributes.map((name) => element.getAttribute(name)),
        !!element.parentElement?.closest(textBindingSelector),
        element.getAttribute("type"),
        element.hasAttribute("multiple"),
      ]);
    for (const binding of bindings.values()) {
      if (!elements.has(binding.element) || signature(binding.element) !== binding.signature)
        remove(binding);
    }
    for (const [element, entry] of invalid) {
      if (!elements.has(element)) {
        if (["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName))
          (element as Control).disabled = entry.disabled;
        invalid.delete(element);
      }
    }
    for (const element of elements) {
      if (bindings.has(element)) continue;
      const key = signature(element);
      const previousInvalid = invalid.get(element);
      if (previousInvalid?.signature === key) continue;
      try {
        const declaration = parseCellBinding(
          element.tagName,
          (name) => element.getAttribute(name) ?? undefined,
          !!element.parentElement?.closest(textBindingSelector),
        );
        if (!declaration || declaration.kind === "cell" || declaration.kind === "range") continue;
        const input = element as Control;
        const { reference } = declaration;
        const groupKey = cellReferenceKey(reference);
        let group = groups.get(groupKey);
        const fresh = !group;
        if (!group) {
          group = { reference, bindings: new Set(), lastWrite: -Infinity };
          groups.set(groupKey, group);
        }
        const binding: Binding = {
          element,
          signature: key,
          group,
          kind: declaration.kind,
          disabled: previousInvalid?.disabled ?? declaration.disabled,
          dirty: false,
          version: 0,
          cleanup: () => {},
        };
        bindings.set(element, binding);
        group.bindings.add(binding);
        invalid.delete(element);
        if (binding.kind === "model") {
          input.disabled = true;
          const edited = () => {
            binding.dirty = true;
            binding.version++;
            changed();
          };
          const onInput = () => {
            edited();
            if (input.type === "range") submit(binding, false);
          };
          const onChange = () => {
            edited();
            submit(binding, true);
          };
          const onKey = (event: Event) => {
            if ((event as KeyboardEvent).key !== "Escape") return;
            event.preventDefault();
            if (group.pending === binding) cancelPending(group);
            binding.version++;
            binding.dirty = false;
            clearError(binding);
            render(binding);
            changed();
          };
          input.addEventListener("input", onInput);
          input.addEventListener("change", onChange);
          input.addEventListener("keydown", onKey);
          binding.cleanup = () => {
            input.removeEventListener("input", onInput);
            input.removeEventListener("change", onChange);
            input.removeEventListener("keydown", onKey);
          };
        }
        render(binding);
        if (fresh) {
          const current = group;
          void client
            .subscribeCell(reference, (state) => {
              if (disposed || groups.get(groupKey) !== current) return;
              current.state = state;
              current.bindings.forEach(render);
            })
            .then((subscription) => {
              if (disposed || groups.get(groupKey) !== current) subscription.dispose();
              else current.subscription = subscription;
            })
            .catch((error: unknown) => {
              if (disposed || groups.get(groupKey) !== current) return;
              for (const target of current.bindings) showError(target, error);
            });
        }
      } catch (error) {
        invalid.set(element, {
          signature: key,
          message: `<${element.tagName.toLowerCase()}> ${modelAttribute(element)}: ${error instanceof Error ? error.message : String(error)}`,
          disabled: previousInvalid?.disabled ?? (element as Control).disabled,
        });
        if (["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName))
          (element as Control).disabled = true;
        report();
      }
    }
    report();
    changed();
  };
  const observer = new document.defaultView!.MutationObserver(scan);
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [...bindingAttributes, "type", "multiple"],
  });
  scan();
  return {
    subscribeCellById: elementSubscriptions.subscribeCellById,
    subscribeRangeById: elementSubscriptions.subscribeRangeById,
    hasPendingChanges,
    async flush() {
      if (disposed) throw new Error("HTML bindings are disposed.");
      scan();
      await Promise.all([...bindings.values()].filter((binding) => binding.dirty).map(write));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      elementSubscriptions.dispose();
      observer.disconnect();
      for (const binding of [...bindings.values()]) remove(binding);
      invalid.clear();
    },
  };
}
function modelAttribute(element: HTMLElement) {
  return element.hasAttribute("data-univer-cell-model")
    ? "data-univer-cell-model"
    : "data-univer-cell-text";
}
