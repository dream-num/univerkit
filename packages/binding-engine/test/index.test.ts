import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CellValueType } from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import {
  AuthzIoHttpService,
  CollaborationStatus,
  type IUniverCollaborationClientConfig,
} from "@univerjs-pro/collaboration-client";
import { ISocketService } from "@univerjs/network";
import { BindingEngine, createDefaultBindingUniver } from "../src/index.js";

// 数据测试隔离权限 HTTP；不让 SDK 后台请求跨越测试实例的生命周期。
beforeEach(() => {
  vi.spyOn(AuthzIoHttpService.prototype, "allowed").mockResolvedValue([]);
  vi.spyOn(AuthzIoHttpService.prototype, "batchAllowed").mockResolvedValue([]);
  vi.spyOn(AuthzIoHttpService.prototype, "list").mockResolvedValue([]);
});
const engines: BindingEngine[] = [];
afterEach(() => {
  engines.splice(0).forEach((engine) => engine.dispose());
  vi.restoreAllMocks();
});
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const cell = { sheetId: "sheet", row: 0, col: 0 };
// 数据测试不创建远端连接；默认工厂仍注册真实 SDK 协同插件。
class TestSocketService {
  async createSocket() {
    return null;
  }
}
const config: IUniverCollaborationClientConfig = {
  socketService: TestSocketService,
  enableCollaboration: false,
  enableAuthServer: false,
};
function workbookData() {
  return {
    id: "unit",
    name: "Test",
    sheetOrder: ["sheet"],
    sheets: {
      sheet: {
        id: "sheet",
        name: "Sheet",
        rowCount: 20,
        columnCount: 10,
        cellData: { 0: { 0: { v: 20, t: CellValueType.NUMBER } } },
      },
    },
  };
}

function setup(useDefault = false) {
  let api!: FUniver;
  let status = CollaborationStatus.SYNCED;
  const flush = vi.fn(async () => {});
  const load = vi.fn(async (id: string) => {
    api.createWorkbook({ ...workbookData(), id });
    return api.getWorkbook(id);
  });
  vi.spyOn(FUniver.prototype, "getCollaboration").mockImplementation(function (this: FUniver) {
    api = this;
    return {
      loadSheetAsync: load,
      getCollaborationStatus: () => status,
      flush,
    } as unknown as ReturnType<FUniver["getCollaboration"]>;
  });
  const created = useDefault ? undefined : createDefaultBindingUniver(config);
  const univer = created?.univer;
  const factory = vi.fn(() => created!);
  const engine = new BindingEngine({
    unitId: "unit",
    collaborationClientConfig: config,
    ...(useDefault ? {} : { createUniver: factory }),
  });
  engines.push(engine);
  return {
    engine,
    univer,
    factory,
    load,
    flush,
    api: () => api,
    setStatus: (value: CollaborationStatus) => {
      status = value;
    },
  };
}

it("uses the default factory with only collaboration config and loads once", async () => {
  const { engine, load } = setup(true);
  const first = engine.load();
  expect(engine.load()).toBe(first);
  await first;
  expect(load).toHaveBeenCalledTimes(1);
  expect(engine.getCellState(cell)).toMatchObject({ value: 20 });
});
it("passes SDK config to a synchronous factory and rejects access before loading", async () => {
  const { engine, factory } = setup();
  expect(factory).toHaveBeenCalledExactlyOnceWith(config);
  expect(() => engine.getCellState(cell)).toThrow("Load");
  await engine.load();
  expect(engine.getCellState(cell).value).toBe(20);
});
it("preserves scalar types, replaces formulas and emits initial state then changes", async () => {
  const { engine, api } = setup();
  await engine.load();
  const listener = vi.fn();
  engine.subscribeCell(cell, listener);
  expect(listener).toHaveBeenCalledExactlyOnceWith({ value: 20 });
  api().getWorkbook("unit")!.getSheetBySheetId("sheet")!.getRange(0, 0).setValue("=1+1");
  for (const value of ["=literal", 21, true, false]) {
    engine.setCellValue(cell, value);
    await tick();
    expect(engine.getCellState(cell).value).toBe(value);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ value }));
  }
  expect(
    api().getWorkbook("unit")!.getSheetBySheetId("sheet")!.getRange(0, 0).getCellData()?.f,
  ).toBeFalsy();
  const count = listener.mock.calls.length;
  engine.setCellValue(cell, false);
  await tick();
  expect(listener).toHaveBeenCalledTimes(count);
});
it("observes formula results and coordinates after structural edits", async () => {
  const { engine, api } = setup();
  await engine.load();
  const sheet = api().getWorkbook("unit")!.getSheetBySheetId("sheet")!;
  const result = { ...cell, col: 1 };
  const listener = vi.fn();
  engine.subscribeCell(result, listener);
  sheet.getRange(0, 1).setValue("=A1*2");
  api().getFormula().executeCalculation();
  await vi.waitFor(() => expect(engine.getCellState(result).value).toBe(40));
  engine.setCellValue(cell, 7);
  await vi.waitFor(() =>
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ value: 14 })),
  );
  sheet.insertRowsBefore(0, 1);
  await tick();
  expect(engine.getCellState(cell).value).toBeNull();
  sheet.deleteRows(0, 1);
  await tick();
  expect(engine.getCellState(cell).value).toBe(7);
});
it("returns null for blank or missing cells and rejects invalid writes", async () => {
  const { engine } = setup();
  await engine.load();
  expect(engine.getCellState({ ...cell, row: 3 })).toEqual({ value: null });
  expect(engine.getCellState({ ...cell, sheetId: "missing" })).toEqual({ value: null });
  expect(engine.getCellState({ ...cell, row: 20 })).toEqual({ value: null });
  expect(() => engine.getCellState({ ...cell, row: -1 })).toThrow();
  expect(() => engine.setCellValue(cell, NaN)).toThrow("finite");
  expect(() => engine.setCellValue({ ...cell, sheetId: "missing" }, 7)).toThrow("does not exist");
  expect(() => engine.setCellValue({ ...cell, row: 20 }, 7)).toThrow("does not exist");
});
it("cancels subscriptions independently and coalesces SDK changes", async () => {
  const { engine } = setup();
  await engine.load();
  const listener = vi.fn();
  const first = engine.subscribeCell(cell, listener);
  const second = engine.subscribeCell(cell, listener);
  first.dispose();
  first.dispose();
  listener.mockClear();
  engine.setCellValue(cell, 1);
  engine.setCellValue(cell, 2);
  await tick();
  expect(listener).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ value: 2 }));
  second.dispose();
  listener.mockClear();
  engine.setCellValue(cell, 3);
  await tick();
  expect(listener).not.toHaveBeenCalled();
  engine.subscribeCell(cell, listener);
  expect(listener).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ value: 3 }));
});
it("reports subscriber errors without changing writes or other notifications", async () => {
  const { engine } = setup();
  await engine.load();
  vi.spyOn(console, "error").mockImplementation(() => {});
  engine.subscribeCell(cell, () => {
    throw new Error("consumer");
  });
  const other = vi.fn();
  engine.subscribeCell(cell, other);
  expect(() => engine.setCellValue(cell, 12)).not.toThrow();
  await tick();
  expect(other).toHaveBeenLastCalledWith(expect.objectContaining({ value: 12 }));
});
it("forwards SDK collaboration state and flush failures without retrying", async () => {
  const { engine, api, flush, setStatus } = setup();
  await engine.load();
  const listener = vi.fn();
  const subscription = engine.subscribeCollaborationStatus(listener);
  expect(listener).toHaveBeenCalledExactlyOnceWith(CollaborationStatus.SYNCED);
  setStatus(CollaborationStatus.OFFLINE);
  api().fireEvent(api().Event.CollaborationStatusChanged, {
    unitId: "unit",
    status: CollaborationStatus.OFFLINE,
  });
  expect(listener).toHaveBeenLastCalledWith(CollaborationStatus.OFFLINE);
  expect(engine.getCollaborationStatus()).toBe(CollaborationStatus.OFFLINE);
  await engine.flush();
  expect(flush).toHaveBeenCalledExactlyOnceWith("unit");
  flush.mockRejectedValueOnce(new Error("timeout"));
  await expect(engine.flush()).rejects.toThrow("timeout");
  expect(flush).toHaveBeenCalledTimes(2);
  subscription.dispose();
  engine.dispose();
  expect(flush).toHaveBeenCalledTimes(2);
});
it("releases failed loads and ignores results arriving after disposal", async () => {
  const { engine, load, univer } = setup();
  const dispose = vi.spyOn(univer!, "dispose");
  let finish!: (value: null) => void;
  load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = engine.load();
  engine.dispose();
  engine.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  finish(null);
  await expect(pending).rejects.toThrow("disposed");
  await expect(engine.load()).rejects.toThrow("disposed");
  expect(dispose).toHaveBeenCalledTimes(1);
});
it("disposes failed loads and propagates the original error", async () => {
  const { engine, load, univer } = setup();
  const dispose = vi.spyOn(univer!, "dispose");
  load.mockRejectedValueOnce(new Error("denied"));
  await expect(engine.load()).rejects.toThrow("denied");
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(() => engine.subscribeCell(cell, () => {})).toThrow("disposed");
});

it("default factory provides the SDK socket transport", () => {
  const instance = createDefaultBindingUniver(config);
  try {
    expect(instance.univer.__getInjector().get(ISocketService).createSocket).toBeTypeOf("function");
  } finally {
    instance.univer.dispose();
  }
});

it("does not repeat the initial value when subscribing during a queued change", async () => {
  const { engine } = setup();
  await engine.load();
  const first = vi.fn();
  engine.subscribeCell(cell, first);
  engine.setCellValue(cell, 21);
  const second = vi.fn();
  engine.subscribeCell(cell, second);
  await tick();
  expect(first).toHaveBeenCalledTimes(2);
  expect(second).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ value: 21 }));
});

const rangeRef = {
  sheetId: "sheet",
  range: { startRow: 0, endRow: 1, startColumn: 0, endColumn: 2 },
};
it("lists sheets in tab order with current names and rejects access before loading", async () => {
  const { engine } = setup();
  expect(() => engine.getSheets()).toThrow();
  await engine.load();
  expect(engine.getSheets()).toEqual([{ sheetId: "sheet", name: "Sheet" }]);
});

it("reads range matrices with the same scalar semantics as individual cells", async () => {
  const { engine } = setup();
  await engine.load();
  engine.setCellValue({ ...cell, col: 1 }, true);
  engine.setCellValue({ ...cell, col: 2 }, "2-2");
  engine.setCellValue({ ...cell, row: 1 }, false);
  const state = engine.getRangeState(rangeRef);
  expect(state).toEqual({
    value: [
      [20, true, "2-2"],
      [false, null, null],
    ],
  });
  expect(engine.getRangeState({ ...rangeRef, sheetId: "missing" })).toEqual({
    value: [
      [null, null, null],
      [null, null, null],
    ],
  });
  engine.setCellValue({ ...cell, row: 19, col: 9 }, 42);
  expect(
    engine.getRangeState({
      sheetId: "sheet",
      range: {
        startRow: 19,
        endRow: 20,
        startColumn: 9,
        endColumn: 10,
      },
    }),
  ).toEqual({
    value: [
      [42, null],
      [null, null],
    ],
  });
  expect(Object.isFrozen(state.value[0])).toBe(true);
});
it("shares range reads, coalesces edits and independently cancels range subscribers", async () => {
  const { engine } = setup();
  await engine.load();
  const ref = { ...rangeRef, range: { ...rangeRef.range } };
  const listener = vi.fn();
  const first = engine.subscribeRange(ref, listener);
  const second = engine.subscribeRange(ref, listener);
  expect(listener).toHaveBeenCalledTimes(2);
  // Mutating the caller's reference must not move an existing subscription.
  ref.range.startRow = 10;
  const reads = vi.spyOn(engine, "getRangeState");
  const cells = vi.spyOn(engine, "getCellState");
  listener.mockClear();
  engine.setCellValue(cell, 21);
  engine.setCellValue(cell, 22);
  await tick();
  expect(reads).toHaveBeenCalledTimes(1);
  expect(cells).not.toHaveBeenCalled();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenLastCalledWith({
    value: [
      [22, null, null],
      [null, null, null],
    ],
  });
  first.dispose();
  first.dispose();
  listener.mockClear();
  engine.setCellValue({ ...cell, row: 5 }, 30);
  await tick();
  expect(listener).not.toHaveBeenCalled();
  engine.setCellValue(cell, 23);
  await tick();
  expect(listener).toHaveBeenCalledTimes(1);
  second.dispose();
  reads.mockClear();
  engine.setCellValue(cell, 24);
  await tick();
  expect(reads).not.toHaveBeenCalled();
});
it("delivers range formula results and follows fixed coordinates after row edits", async () => {
  const { engine, api } = setup();
  await engine.load();
  const sheet = api().getWorkbook("unit")!.getSheetBySheetId("sheet")!;
  const listener = vi.fn();
  engine.subscribeRange(rangeRef, listener);
  sheet.getRange("B1").setValue("=A1*2");
  api().getFormula().executeCalculation();
  await vi.waitFor(() =>
    expect(listener).toHaveBeenLastCalledWith({
      value: [
        [20, 40, null],
        [null, null, null],
      ],
    }),
  );
  engine.setCellValue(cell, 7);
  await vi.waitFor(() =>
    expect(listener).toHaveBeenLastCalledWith({
      value: [
        [7, 14, null],
        [null, null, null],
      ],
    }),
  );
  sheet.insertRowsBefore(0, 1);
  await vi.waitFor(() =>
    expect(listener).toHaveBeenLastCalledWith({
      value: [
        [null, null, null],
        [7, 14, null],
      ],
    }),
  );
});
it("validates range bounds and rejects access after disposal", async () => {
  const { engine } = setup();
  expect(() => engine.getRangeState(rangeRef)).toThrow("Load");
  await engine.load();
  for (const range of [
    { ...rangeRef.range, startRow: -1 },
    { ...rangeRef.range, endRow: -1 },
    { ...rangeRef.range, startColumn: 3 },
    { ...rangeRef.range, endColumn: Infinity },
    { ...rangeRef.range, startRow: 0.5 },
  ]) {
    expect(() => engine.subscribeRange({ ...rangeRef, range }, vi.fn())).toThrow("ordered range");
  }
  engine.dispose();
  expect(() => engine.getRangeState(rangeRef)).toThrow("disposed");
});
it("does not repeat the range initial value during a queued update", async () => {
  const { engine } = setup();
  await engine.load();
  engine.subscribeRange(rangeRef, vi.fn());
  engine.setCellValue(cell, 21);
  const listener = vi.fn();
  engine.subscribeRange(rangeRef, listener);
  await tick();
  expect(listener).toHaveBeenCalledTimes(1);
});

it("inserts multiple rows with local scalar values and leaves remaining new rows blank", async () => {
  const { engine, api } = setup(true);
  await engine.load();
  const listener = vi.fn();
  const reference = {
    sheetId: "sheet",
    range: { startRow: 0, endRow: 3, startColumn: 0, endColumn: 4 },
  };
  engine.subscribeRange(reference, listener);
  engine.insertRowsWithValues({
    sheetId: "sheet",
    startRow: 0,
    rowCount: 3,
    startColumn: 1,
    values: [
      ["=literal", 0, false, null],
      ["Alice", 42, true, ""],
    ],
  });
  await tick();
  const value = [
    [null, "=literal", 0, false, null],
    [null, "Alice", 42, true, ""],
    [null, null, null, null, null],
    [20, null, null, null, null],
  ];
  expect(engine.getRangeState(reference)).toEqual({ value });
  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenLastCalledWith({ value });
  const sheet = api().getWorkbook("unit")!.getSheetBySheetId("sheet")!;
  expect(sheet.getMaxRows()).toBe(23);
  expect(sheet.getRange(0, 1).getCellData()?.f).toBeFalsy();
});

it("supports inserting at the end of the sheet", async () => {
  const { engine, api } = setup();
  await engine.load();
  engine.insertRowsWithValues({
    sheetId: "sheet",
    startRow: 20,
    rowCount: 2,
    startColumn: 9,
    values: [["last"], [true]],
  });
  expect(api().getWorkbook("unit")!.getSheetBySheetId("sheet")!.getMaxRows()).toBe(22);
  expect(engine.getCellState({ sheetId: "sheet", row: 21, col: 9 }).value).toBe(true);
  expect(engine.getCellState(cell).value).toBe(20);
});

it("rejects all invalid insertion payloads before executing a command or changing rows", async () => {
  const { engine, api } = setup();
  await engine.load();
  const command = vi.spyOn(api(), "syncExecuteCommand");
  const params = { sheetId: "sheet", startRow: 0, rowCount: 1, startColumn: 0, values: [["new"]] };
  const invalid = [
    { values: [["Alice"], ["Bob"]] },
    { rowCount: 0 },
    { rowCount: -1 },
    { rowCount: 1.5 },
    { rowCount: Infinity },
    { rowCount: Number.MAX_SAFE_INTEGER },
    { startRow: -1 },
    { startRow: 21 },
    { startRow: 0.5 },
    { startColumn: -1 },
    { startColumn: 10 },
    { startColumn: 9, values: [[1, 2]] },
    { sheetId: "missing" },
    { sheetId: " " },
    { sheetId: 3 },
    { values: [] },
    { values: [[]] },
    { values: null },
    { rowCount: 2, values: [[1], [2, 3]] },
    { rowCount: 2, values: [[1], [Infinity]] },
    { values: [[NaN]] },
    { values: [[undefined]] },
    { values: [[{ v: "escape" }]] },
    { rowCount: 2, values: [[1], ,] },
  ];
  for (const patch of invalid) {
    expect(() =>
      engine.insertRowsWithValues({ ...params, ...patch } as unknown as Parameters<
        BindingEngine["insertRowsWithValues"]
      >[0]),
    ).toThrow();
  }
  expect(command).not.toHaveBeenCalled();
  expect(api().getWorkbook("unit")!.getSheetBySheetId("sheet")!.getMaxRows()).toBe(20);
  expect(engine.getCellState(cell).value).toBe(20);
});

it("checks insertion lifecycle and propagates a rejected command", async () => {
  const { engine, api } = setup();
  const params = { sheetId: "sheet", startRow: 0, rowCount: 1, startColumn: 0, values: [["new"]] };
  expect(() => engine.insertRowsWithValues(params)).toThrow("Load");
  await engine.load();
  vi.spyOn(api(), "syncExecuteCommand").mockReturnValue(false);
  expect(() => engine.insertRowsWithValues(params)).toThrow("command failed");
  engine.dispose();
  expect(() => engine.insertRowsWithValues(params)).toThrow("disposed");
});
