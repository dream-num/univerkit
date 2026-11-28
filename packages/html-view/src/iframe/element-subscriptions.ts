import type { CellState, RangeState } from "@univerkit/binding-engine";
import {
  bindingAttributes,
  parseCellBinding,
  textBindingSelector,
} from "@univerkit/html-view-parser";
import type { BindingDataClient, ElementBindingClient } from "../shared/client-types.js";

type State = CellState | RangeState;
interface Listener {
  notify: (state: State) => void;
  resolve: () => void;
  reject: (error: Error) => void;
}
interface Entry {
  element: HTMLElement;
  kind: "cell" | "range";
  signature: string;
  generation: number;
  listeners: Set<Listener>;
  state?: State;
  ready: boolean;
  error?: Error;
  subscription?: { dispose(): void };
}

// These declarations own data subscriptions; author callbacks own all DOM rendering.
export function mountElementSubscriptions(options: {
  document: Document;
  client: BindingDataClient;
  onError?: (message: string) => void;
}): ElementBindingClient & { dispose(): void } {
  const { document, client } = options;
  const entries = new Map<HTMLElement, Entry>();
  const invalid = new Map<HTMLElement, { signature: string; error: Error }>();
  let disposed = false;
  const asError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));
  const notify = (listener: Listener, state: State) => {
    try {
      listener.notify(state);
    } catch (error) {
      options.onError?.(asError(error).message);
    }
  };
  const remove = (entry: Entry) => {
    entries.delete(entry.element);
    entry.generation++;
    entry.subscription?.dispose();
    for (const listener of entry.listeners)
      listener.reject(new Error("HTML element binding was removed."));
    entry.listeners.clear();
  };
  const scan = () => {
    if (disposed) return;
    const elements = new Set(
      document.querySelectorAll<HTMLElement>(
        "[data-univer-cell-subscribe], [data-univer-range-subscribe]",
      ),
    );
    for (const entry of entries.values()) if (!elements.has(entry.element)) remove(entry);
    for (const element of invalid.keys()) if (!elements.has(element)) invalid.delete(element);
    for (const element of elements) {
      const signature = JSON.stringify([
        ...bindingAttributes.map((name) => element.getAttribute(name)),
        !!element.parentElement?.closest(textBindingSelector),
      ]);
      let entry = entries.get(element);
      if (entry?.signature === signature || invalid.get(element)?.signature === signature) continue;
      try {
        const declaration = parseCellBinding(
          element.tagName,
          (name) => element.getAttribute(name) ?? undefined,
          !!element.parentElement?.closest(textBindingSelector),
        );
        if (!declaration || (declaration.kind !== "cell" && declaration.kind !== "range")) {
          throw new Error("Expected a cell or range data binding.");
        }
        invalid.delete(element);
        if (entry && entry.kind !== declaration.kind) {
          remove(entry);
          entry = undefined;
        }
        if (!entry) {
          entry = {
            element,
            kind: declaration.kind,
            signature,
            generation: 0,
            listeners: new Set(),
            ready: false,
          };
          entries.set(element, entry);
        }
        entry.subscription?.dispose();
        delete entry.subscription;
        entry.signature = signature;
        delete entry.state;
        delete entry.error;
        entry.ready = false;
        const current = entry;
        const generation = ++entry.generation;
        const active = () =>
          !disposed && entries.get(element) === current && current.generation === generation;
        const receive = (state: State) => {
          if (!active()) return;
          current.state = state;
          for (const listener of [...current.listeners]) {
            if (!active()) break;
            if (current.listeners.has(listener)) notify(listener, state);
          }
        };
        const pending =
          declaration.kind === "range"
            ? client.subscribeRange(declaration.reference, receive)
            : client.subscribeCell(declaration.reference, receive);
        void pending
          .then((subscription) => {
            if (!active()) {
              subscription.dispose();
              return;
            }
            current.subscription = subscription;
            current.ready = true;
            for (const listener of current.listeners) listener.resolve();
          })
          .catch((error: unknown) => {
            if (!active()) return;
            current.error = asError(error);
            for (const listener of current.listeners) listener.reject(current.error);
            current.listeners.clear();
            options.onError?.(current.error.message);
          });
      } catch (error) {
        if (entry) remove(entry);
        const failure = asError(error);
        invalid.set(element, { signature, error: failure });
        options.onError?.(failure.message);
      }
    }
  };
  const subscribe = async (
    id: string,
    kind: "cell" | "range",
    callback: (state: State) => void,
  ) => {
    if (disposed) throw new Error("HTML bindings are disposed.");
    if (typeof id !== "string" || !id.trim()) throw new Error("An HTML element ID is required.");
    if (typeof callback !== "function") throw new Error("A subscription listener is required.");
    // IDs are literal strings, not selectors. Scan also handles a just-appended element synchronously.
    const matches = [...document.querySelectorAll<HTMLElement>("[id]")].filter(
      (element) => element.id === id,
    );
    if (matches.length !== 1)
      throw new Error(`Expected one HTML element with ID "${id}"; found ${matches.length}.`);
    scan();
    const element = matches[0]!;
    const failure = invalid.get(element);
    if (failure) throw failure.error;
    const entry = entries.get(element);
    if (!entry || entry.kind !== kind)
      throw new Error(`Element "${id}" requires data-univer-${kind}-subscribe.`);
    if (entry.error) throw entry.error;
    let listener!: Listener;
    const ready = new Promise<void>((resolve, reject) => {
      listener = { notify: callback, resolve, reject };
      entry.listeners.add(listener);
    });
    if (entry.state) notify(listener, entry.state);
    if (entry.ready) listener.resolve();
    await ready;
    return {
      dispose() {
        entry.listeners.delete(listener);
      },
    };
  };
  const observer = new document.defaultView!.MutationObserver(scan);
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [...bindingAttributes],
  });
  scan();
  return {
    subscribeCellById: (id, callback) => subscribe(id, "cell", callback as (state: State) => void),
    subscribeRangeById: (id, callback) =>
      subscribe(id, "range", callback as (state: State) => void),
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      for (const entry of entries.values()) remove(entry);
      invalid.clear();
    },
  };
}
