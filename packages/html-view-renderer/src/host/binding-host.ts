import type { InspectedBinding, BindingUnitMetadata } from "../shared/inspection.js";
import type { BindingEngine, CellValue } from "@univerkit/binding-engine";
import type { HtmlCellReference } from "@univerkit/html-view";
import type { HtmlRangeReference, HtmlInsertRowsWithValuesParams } from "../shared/client-types.js";
import { createRpcPeer } from "../shared/rpc.js";

export type BindingEnginePort = Pick<
  BindingEngine,
  | "getRangeState"
  | "subscribeRange"
  | "getCellState"
  | "setCellValue"
  | "insertRowsWithValues"
  | "subscribeCell"
  | "getCollaborationStatus"
  | "subscribeCollaborationStatus"
  | "flush"
  | "dispose"
>;
export interface BindingSourceState {
  readonly unitId: string;
  readonly phase: "loading" | "ready" | "error";
  readonly status?: ReturnType<BindingEnginePort["getCollaborationStatus"]>;
  readonly error?: string;
}
export interface BindingHostState {
  readonly pending: {
    readonly drafts: boolean;
    readonly writes: boolean;
    readonly confirmation: boolean;
  };
  readonly sources: readonly BindingSourceState[];
}
type Subscription = { dispose(): void };
export function createBindingHost(
  port: MessagePort,
  options: {
    loadEngine: (unitId: string, signal: AbortSignal) => Promise<BindingEnginePort>;
    onStatus?: (states: ReturnType<BindingEnginePort["getCollaborationStatus"]>[]) => void;
    onError?: (message: string) => void;
    onClose?: () => void;
    onState?: (state: BindingHostState) => void;
    onBindingsChanged?: () => void;
    onBindingSelected?: (id: string) => void;
    onBindingCleared?: () => void;
  },
) {
  const abort = new AbortController();
  const loading = new Map<string, Promise<BindingEnginePort>>();
  const engines = new Map<string, BindingEnginePort>();
  const statuses: Subscription[] = [];
  const subscriptions = new Map<number, { subscription?: Subscription }>();
  let writeQueue = Promise.resolve();
  let pendingWrites = 0;
  let drafts = false;
  let pageWrites = false;
  let leaving: Promise<void> | undefined;
  let acceptWrites = true;
  const sourceStates = new Map<string, BindingSourceState>();
  const emit = () => {
    if (abort.signal.aborted) return;
    const sources = [...sourceStates.values()];
    options.onState?.({
      pending: {
        drafts,
        writes: pageWrites || pendingWrites > 0,
        confirmation: sources.some(
          (source) =>
            source.status !== undefined &&
            source.status !== "synced" &&
            source.status !== "not_collab",
        ),
      },
      sources,
    });
  };
  const updateStatus = () => {
    if (abort.signal.aborted) return;
    for (const [id, engine] of engines)
      sourceStates.set(id, { unitId: id, phase: "ready", status: engine.getCollaborationStatus() });
    options.onStatus?.([...engines.values()].map((engine) => engine.getCollaborationStatus()));
    emit();
  };
  const unitId = (value: unknown): string => {
    if (typeof value !== "string" || !value.trim()) throw new Error("Unit ID is required.");
    return value;
  };
  const reference = (value: unknown): HtmlCellReference => {
    if (!value || typeof value !== "object") throw new Error("Cell reference is required.");
    const ref = value as HtmlCellReference;
    const unit = unitId(ref.unitId);
    if (
      typeof ref.sheetId !== "string" ||
      !ref.sheetId.trim() ||
      !Number.isSafeInteger(ref.row) ||
      ref.row < 0 ||
      !Number.isSafeInteger(ref.col) ||
      ref.col < 0
    )
      throw new Error("Expected Sheet ID and non-negative integer row/col.");
    return { unitId: unit, sheetId: ref.sheetId, row: ref.row, col: ref.col };
  };
  const rangeReference = (value: unknown): HtmlRangeReference => {
    if (!value || typeof value !== "object") throw new Error("Range reference is required.");
    const ref = value as HtmlRangeReference;
    const range = ref.range;
    const start = reference({ ...ref, row: range?.startRow, col: range?.startColumn });
    const end = reference({ ...ref, row: range?.endRow, col: range?.endColumn });
    if (end.row < start.row || end.col < start.col)
      throw new Error("Range end must follow its start.");
    return {
      unitId: start.unitId,
      sheetId: start.sheetId,
      range: { startRow: start.row, startColumn: start.col, endRow: end.row, endColumn: end.col },
    };
  };
  const load = (id: string): Promise<BindingEnginePort> => {
    abort.signal.throwIfAborted();
    let promise = loading.get(id);
    if (!promise) {
      sourceStates.set(id, { unitId: id, phase: "loading" });
      emit();
      promise = Promise.resolve()
        .then(() => options.loadEngine(id, abort.signal))
        .then((engine) => {
          if (abort.signal.aborted) {
            engine.dispose();
            abort.signal.throwIfAborted();
          }
          engines.set(id, engine);
          try {
            statuses.push(engine.subscribeCollaborationStatus(updateStatus));
          } catch (error) {
            engines.delete(id);
            engine.dispose();
            throw error;
          }
          updateStatus();
          return engine;
        })
        .catch((error: unknown) => {
          loading.delete(id);
          sourceStates.set(id, {
            unitId: id,
            phase: "error",
            error: error instanceof Error ? error.message : String(error),
          });
          emit();
          throw error;
        });
      loading.set(id, promise);
    }
    return promise;
  };
  const enqueueWrite = async (id: string, apply: (engine: BindingEnginePort) => void) => {
    pendingWrites++;
    emit();
    const write = writeQueue.then(async () => {
      const engine = await load(id);
      abort.signal.throwIfAborted();
      apply(engine);
    });
    writeQueue = write.then(
      () => {},
      () => {},
    );
    try {
      await write;
    } finally {
      pendingWrites--;
      emit();
    }
  };
  const peer = createRpcPeer(
    port,
    async (method, args) => {
      abort.signal.throwIfAborted();
      const data = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
      if (method === "setCellValue") {
        if (!acceptWrites) throw new Error("HTML view is saving before leaving.");
        const ref = reference(data.reference);
        const value = data.value;
        if (
          !["string", "number", "boolean"].includes(typeof value) ||
          (typeof value === "number" && !Number.isFinite(value))
        )
          throw new Error("Expected a finite scalar cell value.");
        return enqueueWrite(ref.unitId, (engine) => engine.setCellValue(ref, value as CellValue));
      }
      if (method === "insertRowsWithValues") {
        if (!acceptWrites) throw new Error("HTML view is saving before leaving.");
        if (!data.params || typeof data.params !== "object")
          throw new Error("Insertion parameters are required.");
        const params = data.params as HtmlInsertRowsWithValuesParams;
        const ref = reference({
          unitId: params.unitId,
          sheetId: params.sheetId,
          row: params.startRow,
          col: params.startColumn,
        });
        if (!Number.isSafeInteger(params.rowCount) || params.rowCount <= 0)
          throw new Error("rowCount must be a positive safe integer.");
        if (!Array.isArray(params.values) || !params.values.length)
          throw new Error("values must be a non-empty rectangular matrix.");
        if (params.values.length > params.rowCount)
          throw new Error("values.length must not exceed rowCount.");
        return enqueueWrite(ref.unitId, (engine) =>
          engine.insertRowsWithValues({
            sheetId: ref.sheetId,
            startRow: ref.row,
            startColumn: ref.col,
            rowCount: params.rowCount,
            values: params.values,
          }),
        );
      }
      if (method === "flush") {
        if (data.leaving === true) acceptWrites = false;
        const saved = writeQueue.then(async () => {
          abort.signal.throwIfAborted();
          await Promise.all([...engines.values()].map((engine) => engine.flush()));
        });
        writeQueue = saved.catch(() => {});
        try {
          await saved;
        } catch (error) {
          acceptWrites = true;
          throw error;
        } finally {
          updateStatus();
        }
        return;
      }
      if (method === "unsubscribe") {
        const entry = subscriptions.get(data.id as number);
        subscriptions.delete(data.id as number);
        entry?.subscription?.dispose();
        return;
      }
      if (method === "getRangeState") {
        const ref = rangeReference(data.reference);
        const engine = await load(ref.unitId);
        abort.signal.throwIfAborted();
        return engine.getRangeState(ref);
      }
      if (method === "getCellState") {
        const ref = reference(data.reference);
        const engine = await load(ref.unitId);
        abort.signal.throwIfAborted();
        return engine.getCellState(ref);
      }
      if (method === "getCollaborationStatus") {
        const engine = await load(unitId(data.unitId));
        abort.signal.throwIfAborted();
        return engine.getCollaborationStatus();
      }
      if (
        method === "subscribeCell" ||
        method === "subscribeRange" ||
        method === "subscribeCollaborationStatus"
      ) {
        const id = data.id;
        if (typeof id !== "number" || !Number.isSafeInteger(id) || subscriptions.has(id))
          throw new Error("Invalid subscription ID.");
        const ref = method === "subscribeCell" ? reference(data.reference) : undefined;
        const range = method === "subscribeRange" ? rangeReference(data.reference) : undefined;
        const unit = ref?.unitId ?? range?.unitId ?? unitId(data.unitId);
        const entry: { subscription?: Subscription } = {};
        subscriptions.set(id, entry);
        try {
          const engine = await load(unit);
          abort.signal.throwIfAborted();
          if (subscriptions.get(id) !== entry) return;
          const notify = (state: unknown) => {
            if (!abort.signal.aborted && subscriptions.get(id) === entry)
              peer.notify("subscription", { id, state });
          };
          entry.subscription = ref
            ? engine.subscribeCell(ref, notify)
            : range
              ? engine.subscribeRange(range, notify)
              : engine.subscribeCollaborationStatus(notify);
        } catch (error) {
          subscriptions.delete(id);
          throw error;
        }
        return;
      }
      throw new Error("Unknown Binding Engine request.");
    },
    (event, value) => {
      if (event === "bindingsChanged") options.onBindingsChanged?.();
      if (event === "bindingSelected" && value === null) options.onBindingCleared?.();
      if (event === "bindingSelected" && typeof value === "string")
        options.onBindingSelected?.(value);
      if (event === "drafts") drafts = value === true;
      if (event === "pending") pageWrites = value === true;
      if (event === "error" && typeof value === "string") options.onError?.(value);
      if (event === "drafts" || event === "pending") emit();
    },
    () => {
      abort.abort();
      for (const entry of subscriptions.values()) entry.subscription?.dispose();
      subscriptions.clear();
      statuses.forEach((subscription) => subscription.dispose());
      engines.forEach((engine) => engine.dispose());
      engines.clear();
      loading.clear();
      options.onClose?.();
    },
  );
  return {
    highlightBindingGroup: (ids: readonly string[]) =>
      peer.request<void>("highlightBindingGroup", ids),
    setBindingMetadata: (metadata: readonly BindingUnitMetadata[]) =>
      peer.request<void>("bindingMetadata", metadata),
    inspectBindings: () => peer.request<readonly InspectedBinding[]>("inspectBindings"),
    highlightBinding: (id: string | null) => peer.request<void>("highlightBinding", id),
    showBindingDetails: (id: string | null) => peer.request<void>("showBindingDetails", id),
    highlightAllBindings: (enabled: boolean) => peer.request<void>("highlightAllBindings", enabled),
    setBindingPicking: (enabled: boolean) => peer.request<void>("pickBinding", enabled),
    prepareToLeave() {
      return (leaving ??= peer
        .request<void>("flush", true)
        .catch((error: unknown) => {
          acceptWrites = true;
          throw error;
        })
        .finally(() => {
          leaving = undefined;
        }));
    },
    flush: () => peer.request<void>("flush", false),
    async resume() {
      acceptWrites = true;
      await peer.request<void>("resume");
    },
    hasPendingChanges: () => drafts || pageWrites || pendingWrites > 0,
    dispose: peer.close,
  };
}
