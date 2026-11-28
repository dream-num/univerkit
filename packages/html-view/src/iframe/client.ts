import type { BindingUnitMetadata } from "../shared/inspection.js";
import type { createHtmlBindingInspector } from "./inspector.js";
import { cellReferenceKey } from "@univerkit/html-view-parser";
import { createRpcPeer } from "../shared/rpc.js";

import type {
  BindingDataClient,
  BindingEngineClient,
  ElementBindingClient,
} from "../shared/client-types.js";

export function createBindingEngineClient(
  port: MessagePort,
  options: {
    inspector?: () => ReturnType<typeof createHtmlBindingInspector> | undefined;
    elementBindings?: () => ElementBindingClient | undefined;
    flushDrafts: () => Promise<void>;
    setPaused: (paused: boolean) => void;
    onClose: () => void;
    onError: (error: unknown) => void;
  },
) {
  let sequence = 0;
  let paused = false;
  let closed = false;
  interface SharedSubscription {
    id: number;
    listeners: Set<(state: unknown) => void>;
    ready: Promise<unknown>;
    latest?: { state: unknown };
  }
  const subscriptions = new Map<string, SharedSubscription>();
  const listeners = new Map<number, (state: unknown) => void>();
  const writes = new Set<Promise<void>>();
  let flushQueue = Promise.resolve();
  const flush = (leaving = false): Promise<void> => {
    const task = flushQueue.then(async () => {
      if (closed) throw new Error("HTML view connection is closed.");
      if (paused) throw new Error("HTML view is saving before leaving.");
      if (leaving) {
        paused = true;
        options.setPaused(true);
      }
      const issued = Promise.allSettled([...writes]);
      try {
        await options.flushDrafts();
        // Send the barrier before waiting for replies. Later writes queue behind it.
        const boundary = Promise.allSettled([...writes, peer.request("flush", { leaving })]);
        const results = (await Promise.all([issued, boundary])).flat();
        const failed = results.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
      } catch (error) {
        paused = false;
        if (leaving) options.setPaused(false);
        throw error;
      }
    });
    flushQueue = task.catch(() => {});
    return task;
  };
  const peer = createRpcPeer(
    port,
    async (method, args) => {
      if (
        [
          "inspectBindings",
          "highlightBindingGroup",
          "bindingMetadata",
          "highlightBinding",
          "showBindingDetails",
          "highlightAllBindings",
          "pickBinding",
        ].includes(method)
      ) {
        const inspector = options.inspector?.();
        if (!inspector) throw new Error("HTML binding inspector is unavailable.");
        if (method === "inspectBindings") return inspector.snapshot();
        if (method === "highlightBindingGroup") {
          if (!Array.isArray(args) || args.some((id) => typeof id !== "string"))
            throw new Error("Expected binding IDs.");
          return inspector.highlightGroup(args);
        }
        if (method === "bindingMetadata") {
          if (
            !Array.isArray(args) ||
            args.some(
              (unit) =>
                !unit ||
                typeof unit.unitId !== "string" ||
                (unit.name !== undefined && typeof unit.name !== "string") ||
                !Array.isArray(unit.sheets) ||
                unit.sheets.some(
                  (sheet: { sheetId?: unknown; name?: unknown }) =>
                    !sheet ||
                    typeof sheet.sheetId !== "string" ||
                    (sheet.name !== undefined && typeof sheet.name !== "string"),
                ),
            )
          )
            throw new Error("Invalid binding metadata.");
          return inspector.setMetadata(args as BindingUnitMetadata[]);
        }
        if (method === "highlightBinding" || method === "showBindingDetails") {
          if (args !== null && typeof args !== "string")
            throw new Error("Expected a binding ID or null.");
          return method === "highlightBinding"
            ? inspector.highlight(args)
            : inspector.showDetails(args);
        }
        if (typeof args !== "boolean") throw new Error("Expected a boolean inspection flag.");
        if (method === "highlightAllBindings") return inspector.highlightAll(args);
        return inspector.setPicking(args);
      }
      if (method === "resume") {
        paused = false;
        options.setPaused(false);
        return;
      }
      if (method !== "flush") throw new Error("Unknown page request.");
      await flush(args === true);
    },
    (event, value) => {
      if (event !== "subscription" || !value || typeof value !== "object") return;
      const data = value as { id: number; state: unknown };
      try {
        listeners.get(data.id)?.(data.state);
      } catch (error) {
        options.onError(error);
      }
    },
    () => {
      closed = true;
      for (const entry of subscriptions.values()) entry.listeners.clear();
      listeners.clear();
      subscriptions.clear();
      options.onClose();
    },
  );
  const notify = (listener: (state: unknown) => void, state: unknown) => {
    try {
      listener(state);
    } catch (error) {
      options.onError(error);
    }
  };
  const subscribe = async <T>(
    key: string,
    method: string,
    args: object,
    listener: (state: T) => void,
  ) => {
    if (typeof listener !== "function") throw new Error("A subscription listener is required.");
    // Each registration gets its own callback identity and immediate initial state.
    const callback = (state: unknown) => listener(state as T);
    let entry = subscriptions.get(key);
    if (!entry) {
      const id = ++sequence;
      entry = { id, listeners: new Set(), ready: peer.request(method, { ...args, id }) };
      subscriptions.set(key, entry);
      const current = entry;
      listeners.set(id, (state) => {
        current.latest = { state };
        for (const callback of [...current.listeners]) {
          if (current.listeners.has(callback)) notify(callback, state);
        }
      });
    }
    entry.listeners.add(callback);
    if (entry.latest) notify(callback, entry.latest.state);
    try {
      await entry.ready;
    } catch (error) {
      entry.listeners.delete(callback);
      if (subscriptions.get(key) === entry) subscriptions.delete(key);
      listeners.delete(entry.id);
      throw error;
    }
    return {
      dispose() {
        if (!entry.listeners.delete(callback) || entry.listeners.size) return;
        listeners.delete(entry.id);
        subscriptions.delete(key);
        void peer.request("unsubscribe", { id: entry.id }).catch(options.onError);
      },
    };
  };
  const write = (method: string, args: object, internal = false): Promise<void> => {
    if (closed) return Promise.reject(new Error("HTML view connection is closed."));
    if (paused && !internal)
      return Promise.reject(new Error("HTML view is saving before leaving."));
    const promise = peer.request<void>(method, args);
    writes.add(promise);
    peer.notify("pending", true);
    void promise
      .then(
        () => writes.delete(promise),
        () => writes.delete(promise),
      )
      .then(() => {
        peer.notify("pending", writes.size > 0);
      })
      .catch(() => {});
    return promise;
  };
  const elementBindings = () => {
    if (closed) throw new Error("HTML view connection is closed.");
    const bindings = options.elementBindings?.();
    if (!bindings) throw new Error("HTML element bindings are unavailable.");
    return bindings;
  };
  const client: BindingEngineClient = {
    subscribeCellById: async (id, listener) => elementBindings().subscribeCellById(id, listener),
    subscribeRangeById: async (id, listener) => elementBindings().subscribeRangeById(id, listener),
    getRangeState: (reference) => peer.request("getRangeState", { reference }),
    getCellState: (reference) => peer.request("getCellState", { reference }),
    setCellValue: (reference, value) => write("setCellValue", { reference, value }),
    insertRowsWithValues: (params) => write("insertRowsWithValues", { params }),
    getCollaborationStatus: (unitId) => peer.request("getCollaborationStatus", { unitId }),
    subscribeCollaborationStatus: async (unitId, listener) =>
      subscribe("status:" + unitId, "subscribeCollaborationStatus", { unitId }, listener),
    flush: () => flush(),
  };
  const dataClient: BindingDataClient = {
    ...client,
    // The DOM adapter must be able to submit captured drafts while author writes are paused.
    setCellValue: (reference, value) => write("setCellValue", { reference, value }, true),
    subscribeRange: async (reference, listener) => {
      const { startRow, endRow, startColumn, endColumn } = reference.range;
      const key = JSON.stringify([
        reference.unitId,
        reference.sheetId,
        startRow,
        endRow,
        startColumn,
        endColumn,
      ]);
      return subscribe("range:" + key, "subscribeRange", { reference }, listener);
    },
    subscribeCell: async (reference, listener) =>
      subscribe("cell:" + cellReferenceKey(reference), "subscribeCell", { reference }, listener),
  };
  return {
    client,
    dataClient,
    notify(event: string, value: unknown) {
      if (!closed) peer.notify(event, value);
    },
    dispose: peer.close,
  };
}
