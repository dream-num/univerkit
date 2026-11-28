import { afterEach, expect, it, vi } from "vitest";
import type { BindingEngine, CellState, RangeState } from "@univerkit/binding-engine";
import { createBindingHost } from "../src/host/binding-host.js";
import { createBindingEngineClient } from "../src/iframe/client.js";
import { createRpcPeer } from "../src/shared/rpc.js";
const releases: (() => void)[] = [];
afterEach(() => releases.splice(0).forEach((release) => release()));
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
const ref = { unitId: "u", sheetId: "s", row: 0, col: 0 };
function engine() {
  let state: CellState = { value: 20 };
  const listeners = new Set<(state: CellState) => void>();
  const rangeListeners = new Set<(state: RangeState) => void>();
  const update = (value: number) => {
    state = { ...state, value };
    listeners.forEach((listener) => listener(state));
    rangeListeners.forEach((listener) => listener({ value: [[state.value]] }));
  };
  return {
    getRangeState: vi.fn(() => ({ value: [[state.value]] })),
    subscribeRange: vi.fn((_ref, listener: (state: RangeState) => void) => {
      rangeListeners.add(listener);
      listener({ value: [[state.value]] });
      return {
        dispose: () => {
          rangeListeners.delete(listener);
        },
      };
    }),
    getCellState: vi.fn(() => state),
    insertRowsWithValues: vi.fn(),
    setCellValue: vi.fn((_ref, value) => {
      update(value);
    }),
    subscribeCell: vi.fn((_ref, listener) => {
      listeners.add(listener);
      listener(state);
      return {
        dispose: () => {
          listeners.delete(listener);
        },
      };
    }),
    getCollaborationStatus: vi.fn(
      () => "synced" as ReturnType<BindingEngine["getCollaborationStatus"]>,
    ),
    subscribeCollaborationStatus: vi.fn((listener) => {
      listener(0);
      return { dispose: vi.fn() };
    }),
    flush: vi.fn(async () => {}),
    dispose: vi.fn(),
    update,
  };
}
function setup(
  loadEngine: (unitId: string, signal: AbortSignal) => Promise<ReturnType<typeof engine>> = vi.fn(
    async () => engine(),
  ),
) {
  const channel = new MessageChannel();
  const host = createBindingHost(channel.port1, { loadEngine });
  const options = {
    flushDrafts: vi.fn(async () => {}),
    setPaused: vi.fn(),
    onClose: vi.fn(),
    onError: vi.fn(),
  };
  const connection = createBindingEngineClient(channel.port2, options);
  releases.push(() => {
    connection.dispose();
    host.dispose();
  });
  return { host, client: connection.dataClient, connection, options, loadEngine };
}
it("exposes ById and one-shot reads on the page without direct data subscriptions", async () => {
  const { connection } = setup();
  const page = connection.client;
  expect(page).not.toHaveProperty("subscribeCell");
  expect(page).not.toHaveProperty("subscribeRange");
  expect(page.subscribeCellById).toBeTypeOf("function");
  expect(page.subscribeRangeById).toBeTypeOf("function");
  await page.setCellValue(ref, 25);
  await expect(page.getCellState(ref)).resolves.toMatchObject({ value: 25 });
  await expect(
    page.getRangeState({
      unitId: ref.unitId,
      sheetId: ref.sheetId,
      range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
    }),
  ).resolves.toMatchObject({ value: [[25]] });
});
it("shares one subscription, delivers initial state before resolution and cancels registrations independently", async () => {
  const e = engine();
  const { client } = setup(vi.fn(async () => e));
  const listener = vi.fn();
  const first = await client.subscribeCell(ref, listener);
  expect(listener).toHaveBeenCalledTimes(1);
  const second = await client.subscribeCell(ref, listener);
  expect(listener).toHaveBeenCalledTimes(2);
  expect(e.subscribeCell).toHaveBeenCalledTimes(1);
  first.dispose();
  first.dispose();
  e.update(21);
  await tick();
  expect(listener).toHaveBeenCalledTimes(3);
  second.dispose();
  e.update(22);
  await tick();
  expect(listener).toHaveBeenCalledTimes(3);
});
it("isolates a throwing callback from other subscribers", async () => {
  const e = engine();
  const { client, options } = setup(vi.fn(async () => e));
  await client.subscribeCell(ref, () => {
    throw new Error("listener failed");
  });
  const other = vi.fn();
  await client.subscribeCell(ref, other);
  e.update(21);
  await tick();
  expect(other).toHaveBeenCalledTimes(2);
  expect(options.onError).toHaveBeenCalled();
});
it("deduplicates concurrent loading and retains other Units after authorization failure", async () => {
  const e = engine();
  const load = vi.fn(async (id: string) => {
    if (id === "denied") throw new Error("Access denied");
    return e;
  });
  const { client } = setup(load);
  await Promise.all([client.getCellState(ref), client.subscribeCell(ref, () => {})]);
  expect(load).toHaveBeenCalledTimes(1);
  await expect(client.getCellState({ ...ref, unitId: "denied" })).rejects.toThrow("Access denied");
  await expect(client.getCellState(ref)).resolves.toMatchObject({ value: 20 });
  expect(e.dispose).not.toHaveBeenCalled();
});
it("executes writes in send order across Unit loads and flush waits for them", async () => {
  const first = engine();
  const second = engine();
  let resolve!: (e: ReturnType<typeof engine>) => void;
  const loaded = new Promise<ReturnType<typeof engine>>((done) => {
    resolve = done;
  });
  const load = vi.fn((id: string) => (id === "u" ? loaded : Promise.resolve(second)));
  const { client } = setup(load);
  const a = client.setCellValue(ref, 21);
  const b = client.setCellValue({ ...ref, unitId: "v" }, 22);
  const flush = client.flush();
  await tick();
  expect(second.setCellValue).not.toHaveBeenCalled();
  expect(first.flush).not.toHaveBeenCalled();
  resolve(first);
  await Promise.all([a, b, flush]);
  expect(first.setCellValue).toHaveBeenCalledWith(ref, 21);
  expect(second.setCellValue).toHaveBeenCalledWith({ ...ref, unitId: "v" }, 22);
  expect(first.flush).toHaveBeenCalledTimes(1);
  expect(second.flush).toHaveBeenCalledTimes(1);
});
it("reports a failed write and allows subsequent writes", async () => {
  const e = engine();
  e.setCellValue.mockImplementationOnce(() => {
    throw new Error("write failed");
  });
  const { client } = setup(vi.fn(async () => e));
  await expect(client.setCellValue(ref, 21)).rejects.toThrow("write failed");
  await expect(client.setCellValue(ref, 22)).resolves.toBeUndefined();
});
it("flushes page drafts before host save, keeps the page paused on success, and restores it on failure", async () => {
  const e = engine();
  const { client, host, options } = setup(vi.fn(async () => e));
  options.flushDrafts.mockImplementation(async () => {
    await client.setCellValue(ref, 23);
  });
  e.flush.mockRejectedValueOnce(new Error("offline"));
  await expect(host.prepareToLeave()).rejects.toThrow("offline");
  expect(options.setPaused).toHaveBeenLastCalledWith(false);
  await client.setCellValue(ref, 24);
  await host.prepareToLeave();
  expect(options.setPaused).toHaveBeenLastCalledWith(true);
  await expect(client.setCellValue(ref, 25)).rejects.toThrow("saving before leaving");
});
it("rejects malformed requests before loading a Unit", async () => {
  const channel = new MessageChannel();
  const load = vi.fn(async () => engine());
  const host = createBindingHost(channel.port1, { loadEngine: load });
  const peer = createRpcPeer(channel.port2, () => {});
  releases.push(() => {
    peer.close();
    host.dispose();
  });
  for (const reference of [
    null,
    { ...ref, row: -1 },
    { ...ref, col: 1.5 },
    { ...ref, unitId: 1 },
    { ...ref, sheetId: {} },
  ]) {
    await expect(peer.request("getCellState", { reference })).rejects.toThrow();
  }
  await expect(peer.request("setCellValue", { reference: ref, value: Infinity })).rejects.toThrow(
    "finite scalar",
  );
  await expect(peer.request("executeCommand", { id: "arbitrary" })).rejects.toThrow("Unknown");
  expect(load).not.toHaveBeenCalled();
});
it("rejects pending calls on close and disposes an Engine that finishes loading late", async () => {
  const e = engine();
  let resolve!: (value: ReturnType<typeof engine>) => void;
  const { client, connection, host } = setup(
    vi.fn(
      () =>
        new Promise<ReturnType<typeof engine>>((done) => {
          resolve = done;
        }),
    ),
  );
  const read = client.getCellState(ref);
  const rejected = expect(read).rejects.toThrow("closed");
  await tick();
  connection.dispose();
  host.dispose();
  await rejected;
  resolve(e);
  await tick();
  expect(e.dispose).toHaveBeenCalledTimes(1);
  expect(e.getCellState).not.toHaveBeenCalled();
});

it("does not send cancellation requests after the connection closes", async () => {
  const { client, connection, options } = setup();
  const subscription = await client.subscribeCell(ref, () => {});
  connection.dispose();
  subscription.dispose();
  await tick();
  expect(options.onError).not.toHaveBeenCalled();
  await expect(client.setCellValue(ref, 23)).rejects.toThrow("closed");
});

const rangeRef = {
  unitId: "u",
  sheetId: "s",
  range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
};
it("shares range subscriptions and delivers the initial matrix before resolving", async () => {
  const e = engine();
  const { client, loadEngine } = setup(vi.fn(async () => e));
  const listener = vi.fn();
  const first = await client.subscribeRange(rangeRef, listener);
  expect(listener).toHaveBeenCalledExactlyOnceWith({ value: [[20]] });
  const second = await client.subscribeRange(
    { ...rangeRef, range: { ...rangeRef.range } },
    listener,
  );
  expect(e.subscribeRange).toHaveBeenCalledTimes(1);
  expect(loadEngine).toHaveBeenCalledTimes(1);
  await expect(client.getRangeState(rangeRef)).resolves.toEqual({ value: [[20]] });
  first.dispose();
  listener.mockClear();
  await client.setCellValue(ref, 21);
  await tick();
  expect(listener).toHaveBeenCalledExactlyOnceWith({ value: [[21]] });
  second.dispose();
  await tick();
  e.update(22);
  await tick();
  expect(listener).toHaveBeenCalledTimes(1);
});
it("validates range messages before authorizing or loading a Unit", async () => {
  const channel = new MessageChannel();
  const load = vi.fn(async () => engine());
  const host = createBindingHost(channel.port1, { loadEngine: load });
  const peer = createRpcPeer(channel.port2, () => {});
  releases.push(() => {
    peer.close();
    host.dispose();
  });
  for (const reference of [
    null,
    { ...rangeRef, range: null },
    { ...rangeRef, unitId: 1 },
    { ...rangeRef, range: { ...rangeRef.range, endRow: -1 } },
    { ...rangeRef, range: { ...rangeRef.range, endColumn: Infinity } },
    { ...rangeRef, range: { ...rangeRef.range, startRow: 2 } },
  ]) {
    await expect(peer.request("getRangeState", { reference })).rejects.toThrow();
    await expect(peer.request("subscribeRange", { reference, id: 1 })).rejects.toThrow();
  }
  expect(load).not.toHaveBeenCalled();
});
it("keeps range subscriptions isolated from denied Units and throwing callbacks", async () => {
  const e = engine();
  const { client, connection, options } = setup(async (id) => {
    if (id === "denied") throw new Error("Access denied");
    return e;
  });
  await expect(client.subscribeRange({ ...rangeRef, unitId: "denied" }, vi.fn())).rejects.toThrow(
    "Access denied",
  );
  await client.subscribeRange(rangeRef, () => {
    throw new Error("consumer");
  });
  const listener = vi.fn();
  const subscription = await client.subscribeRange(rangeRef, listener);
  e.update(21);
  await tick();
  expect(listener).toHaveBeenLastCalledWith({ value: [[21]] });
  expect(options.onError).toHaveBeenCalled();
  connection.dispose();
  subscription.dispose();
  await expect(client.getRangeState(rangeRef)).rejects.toThrow("closed");
});

const insertion = {
  unitId: "u",
  sheetId: "s",
  startRow: 1,
  rowCount: 3,
  startColumn: 2,
  values: [["Alice"], ["Bob"]],
};
it("queues insertion with cell writes and waits for it before flushing", async () => {
  const e = engine();
  let resolve!: (value: ReturnType<typeof engine>) => void;
  const { client, host } = setup(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const insert = client.insertRowsWithValues(insertion);
  const write = client.setCellValue(ref, 30);
  const saved = client.flush();
  await tick();
  expect(host.hasPendingChanges()).toBe(true);
  expect(e.insertRowsWithValues).not.toHaveBeenCalled();
  expect(e.flush).not.toHaveBeenCalled();
  resolve(e);
  await Promise.all([insert, write, saved]);
  const { unitId: _unit, ...params } = insertion;
  expect(e.insertRowsWithValues).toHaveBeenCalledExactlyOnceWith(params);
  expect(e.insertRowsWithValues.mock.invocationCallOrder[0]).toBeLessThan(
    e.setCellValue.mock.invocationCallOrder[0]!,
  );
  expect(e.setCellValue.mock.invocationCallOrder[0]).toBeLessThan(
    e.flush.mock.invocationCallOrder[0]!,
  );
  await host.prepareToLeave();
  await expect(client.insertRowsWithValues(insertion)).rejects.toThrow("saving before leaving");
});

it("rejects excess rows before loading and propagates insertion failure without blocking later writes", async () => {
  const e = engine();
  const load = vi.fn(async () => e);
  const { client, connection } = setup(load);
  await expect(client.insertRowsWithValues({ ...insertion, rowCount: 1 })).rejects.toThrow(
    "values.length must not exceed rowCount",
  );
  expect(load).not.toHaveBeenCalled();
  e.insertRowsWithValues.mockImplementationOnce(() => {
    throw new Error("insert failed");
  });
  await expect(client.insertRowsWithValues(insertion)).rejects.toThrow("insert failed");
  await client.insertRowsWithValues(insertion);
  expect(e.insertRowsWithValues).toHaveBeenCalledTimes(2);
  connection.dispose();
  await expect(client.insertRowsWithValues(insertion)).rejects.toThrow("closed");
});

it("routes host inspection without loading data or exposing inspector controls to author scripts", async () => {
  const channel = new MessageChannel();
  const loadEngine = vi.fn(async () => engine());
  const onBindingsChanged = vi.fn();
  const onBindingSelected = vi.fn();
  const host = createBindingHost(channel.port1, {
    loadEngine,
    onBindingsChanged,
    onBindingSelected,
  });
  const inspector = {
    snapshot: vi.fn(() => []),
    setMetadata: vi.fn(),
    highlightGroup: vi.fn(),
    highlight: vi.fn(),
    showDetails: vi.fn(),
    highlightAll: vi.fn(),
    setPicking: vi.fn(),
    dispose: vi.fn(),
  };
  const connection = createBindingEngineClient(channel.port2, {
    inspector: () => inspector,
    flushDrafts: async () => {},
    setPaused: () => {},
    onClose: () => {},
    onError: () => {},
  });
  releases.push(() => {
    connection.dispose();
    host.dispose();
  });
  await expect(host.inspectBindings()).resolves.toEqual([]);
  await host.highlightBinding("live-1");
  await host.showBindingDetails("live-1");
  await host.highlightAllBindings(true);
  await host.highlightAllBindings(false);
  await host.setBindingPicking(true);
  expect(inspector.highlight).toHaveBeenCalledWith("live-1");
  expect(inspector.showDetails).toHaveBeenCalledWith("live-1");
  expect(inspector.highlightAll.mock.calls).toEqual([[true], [false]]);
  expect(inspector.setPicking).toHaveBeenCalledWith(true);
  expect(connection.client).not.toHaveProperty("inspectBindings");
  expect(connection.client).not.toHaveProperty("highlightAllBindings");
  expect(loadEngine).not.toHaveBeenCalled();
  connection.notify("bindingsChanged", null);
  connection.notify("bindingSelected", "live-1");
  await vi.waitFor(() => expect(onBindingSelected).toHaveBeenCalledWith("live-1"));
  expect(onBindingsChanged).toHaveBeenCalledOnce();
});

it("flushes ordinary edits without pausing, then resumes edits after a leave boundary", async () => {
  const e = engine();
  const { host, connection, options } = setup(async () => e);
  await connection.client.setCellValue(ref, 21);
  await host.flush();
  expect(options.setPaused).not.toHaveBeenCalled();
  await connection.client.setCellValue(ref, 22);
  await host.prepareToLeave();
  await expect(connection.client.setCellValue(ref, 23)).rejects.toThrow("saving before leaving");
  await host.resume();
  await connection.client.setCellValue(ref, 24);
  expect(e.getCellState()).toMatchObject({ value: 24 });
  expect(options.setPaused).toHaveBeenLastCalledWith(false);
});

it("places ordinary flush between preceding and subsequent writes", async () => {
  const e = engine();
  const order: string[] = [];
  let confirm!: () => void;
  e.flush.mockImplementation(async () => {
    order.push("flush");
    await new Promise<void>((resolve) => {
      confirm = resolve;
    });
  });
  e.setCellValue.mockImplementation((_ref, value) => {
    order.push(String(value));
  });
  const { host, connection } = setup(async () => e);
  await connection.client.setCellValue(ref, 1);
  const saving = host.flush();
  await vi.waitFor(() => expect(order).toContain("flush"));
  const later = connection.client.setCellValue(ref, 2);
  await tick();
  expect(order).toEqual(["1", "flush"]);
  confirm();
  await saving;
  await later;
  expect(order).toEqual(["1", "flush", "2"]);
});
