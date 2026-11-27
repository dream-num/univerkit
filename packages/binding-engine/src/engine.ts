import {
  CommandType,
  DisposableCollection,
  ICommandService,
  LifecycleService,
  LifecycleStages,
  type IDisposable,
} from "@univerjs/core";
import type { CollaborationStatus } from "@univerjs-pro/collaboration-client";
import "@univerjs/sheets/facade";
import "@univerjs/engine-formula/facade";
import "@univerjs-pro/collaboration-client/facade";
import { createDefaultBindingUniver } from "./create-univer.js";
import { readCell, validateReference, writeCell } from "./cell-access.js";
import { insertRowsWithValues } from "./insert-rows.js";
import { normalizeRangeReference, readRange, equalRangeState } from "./range-access.js";
import type {
  BindingEngineOptions,
  BindingUniverFactory,
  CellReference,
  CellState,
  CellValue,
  InsertRowsWithValuesParams,
  RangeReference,
  RangeState,
  SheetInfo,
} from "./types.js";

type Listener<T> = (value: T) => void;
interface Subscription {
  refresh(): void;
  clear(): void;
}

export class BindingEngine implements IDisposable {
  readonly unitId: string;
  private readonly instance: ReturnType<BindingUniverFactory>;
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly statusListeners = new Set<Listener<CollaborationStatus>>();
  private readonly cleanup = new DisposableCollection();
  private loadPromise?: Promise<void>;
  private ready = false;
  private disposed = false;
  private queued = false;

  constructor(options: BindingEngineOptions) {
    if (!options.unitId) throw new Error("Unit ID is required.");
    this.unitId = options.unitId;
    this.instance = (options.createUniver ?? createDefaultBindingUniver)(
      options.collaborationClientConfig,
    );
  }

  load(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("Binding Engine is disposed."));
    return (this.loadPromise ??= this.loadUnit());
  }

  private async loadUnit(): Promise<void> {
    try {
      const { univer, univerAPI } = this.instance;
      this.cleanup.add(
        univerAPI.addEvent(univerAPI.Event.CollaborationStatusChanged, (event) => {
          if (event.unitId === this.unitId) this.notify(this.statusListeners, event.status);
        }),
      );
      const workbook = await univerAPI.getCollaboration().loadSheetAsync(this.unitId);
      this.assertActive();
      if (!workbook || workbook.getId() !== this.unitId)
        throw new Error(`Sheet Unit is unavailable: ${this.unitId}`);
      const lifecycle = univer.__getInjector().get(LifecycleService);
      if (lifecycle.stage < LifecycleStages.Rendered) lifecycle.stage = LifecycleStages.Rendered;
      if (lifecycle.stage < LifecycleStages.Steady) lifecycle.stage = LifecycleStages.Steady;
      this.cleanup.add(
        univer
          .__getInjector()
          .get(ICommandService)
          .onCommandExecuted((info) => {
            const params = info.params as { unitId?: string } | undefined;
            if (
              info.type === CommandType.MUTATION &&
              (!params?.unitId || params.unitId === this.unitId)
            )
              this.invalidate();
          }),
      );
      this.cleanup.add(univerAPI.getFormula().calculationResultApplied(() => this.invalidate()));
      this.ready = true;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /** Lists the workbook's sheets in tab order with their current names. */
  getSheets(): readonly SheetInfo[] {
    this.assertReady();
    const workbook = this.instance.univerAPI.getWorkbook(this.unitId);
    return (workbook?.getSheets() ?? []).map((sheet) => ({
      sheetId: sheet.getSheetId(),
      name: sheet.getSheetName(),
    }));
  }

  getCellState(reference: CellReference): CellState {
    this.assertReady();
    validateReference(reference);
    return readCell(this.instance.univerAPI, this.unitId, reference);
  }

  subscribeCell(reference: CellReference, listener: Listener<CellState>): IDisposable {
    this.assertReady();
    validateReference(reference);
    const ref = { ...reference };
    return this.subscribe(
      "cell:" + JSON.stringify([ref.sheetId, ref.row, ref.col]),
      () => this.getCellState(ref),
      (a, b) => Object.is(a.value, b.value),
      listener,
    );
  }

  getRangeState(reference: RangeReference): RangeState {
    this.assertReady();
    return readRange(this.instance.univerAPI, this.unitId, normalizeRangeReference(reference));
  }

  subscribeRange(reference: RangeReference, listener: Listener<RangeState>): IDisposable {
    this.assertReady();
    const ref = normalizeRangeReference(reference);
    const { startRow, endRow, startColumn, endColumn } = ref.range;
    return this.subscribe(
      "range:" + JSON.stringify([ref.sheetId, startRow, endRow, startColumn, endColumn]),
      () => this.getRangeState(ref),
      equalRangeState,
      listener,
    );
  }

  private subscribe<T>(
    key: string,
    read: () => T,
    equal: (a: T, b: T) => boolean,
    listener: Listener<T>,
  ): IDisposable {
    if (typeof listener !== "function") throw new Error("A subscription listener is required.");
    const state = read();
    // A record owns one range read per refresh, with independent cancellation for each listener.
    let entry = this.subscriptions.get(key) as
      | (Subscription & { listeners: Set<Listener<T>> })
      | undefined;
    if (!entry) {
      const listeners = new Set<Listener<T>>();
      entry = {
        listeners,
        refresh: () => this.notify(listeners, read()),
        clear: () => listeners.clear(),
      };
      this.subscriptions.set(key, entry);
    }
    let previous: { state: T } | undefined;
    const callback: Listener<T> = (value) => {
      if (previous && equal(previous.state, value)) return;
      previous = { state: value };
      listener(value);
    };
    entry.listeners.add(callback);
    this.notify(new Set([callback]), state);
    return {
      dispose: () => {
        entry.listeners.delete(callback);
        if (!entry.listeners.size && this.subscriptions.get(key) === entry)
          this.subscriptions.delete(key);
      },
    };
  }

  setCellValue(reference: CellReference, value: CellValue): void {
    this.assertReady();
    validateReference(reference);
    writeCell(this.instance.univerAPI, this.unitId, reference, value);
  }

  getCollaborationStatus(): CollaborationStatus {
    this.assertReady();
    return this.instance.univerAPI.getCollaboration().getCollaborationStatus(this.unitId);
  }

  insertRowsWithValues(params: InsertRowsWithValuesParams): void {
    this.assertReady();
    insertRowsWithValues(this.instance.univerAPI, this.unitId, params);
  }

  subscribeCollaborationStatus(listener: Listener<CollaborationStatus>): IDisposable {
    const state = this.getCollaborationStatus();
    const callback: Listener<CollaborationStatus> = (value) => listener(value);
    this.statusListeners.add(callback);
    this.notify(new Set([callback]), state);
    return {
      dispose: () => {
        this.statusListeners.delete(callback);
      },
    };
  }

  async flush(): Promise<void> {
    this.assertReady();
    await this.instance.univerAPI.getCollaboration().flush(this.unitId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.subscriptions.values()) entry.clear();
    this.subscriptions.clear();
    this.statusListeners.clear();
    try {
      this.cleanup.dispose();
    } finally {
      this.instance.univer.dispose();
    }
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("Binding Engine is disposed.");
  }

  private assertReady(): void {
    this.assertActive();
    if (!this.ready) throw new Error("Load the Binding Engine first.");
  }

  private invalidate(): void {
    if (this.disposed || this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (this.disposed) return;
      for (const entry of [...this.subscriptions.values()]) {
        entry.refresh();
        if (this.disposed) break;
      }
    });
  }

  private notify<T>(listeners: Set<Listener<T>>, value: T): void {
    for (const listener of [...listeners]) {
      if (this.disposed) break;
      if (!listeners.has(listener)) continue;
      try {
        listener(value);
      } catch (error) {
        console.error("Binding subscriber failed.", error);
      }
    }
  }
}
