// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { CellState, CellValue } from "@univerkit/binding-engine";
import { mountHtmlView } from "../src/dom.js";
import type { BindingDataClient } from "../src/shared/client-types.js";
let mounted: ReturnType<typeof mountHtmlView> | undefined;
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
afterEach(() => {
  mounted?.dispose();
  document.body.replaceChildren();
  vi.useRealTimers();
});
const reference = { unitId: "u", sheetId: "s", row: 0, col: 0 };
async function setup(type = "range") {
  document.body.innerHTML = `<output data-univer-cell-text="u:s:A1"></output><input type="${type}" min="0" max="40" step="1" data-univer-cell-model="u:s:A1">`;
  let state: CellState = {
    value: type === "checkbox" ? true : 20,
  };
  let listener = (_state: CellState) => {};
  const release = vi.fn();
  const update = (value: CellValue | null) => {
    state = { value };
    listener(state);
  };
  const client = {
    getRangeState: vi.fn(),
    subscribeRange: vi.fn(),
    getCellState: vi.fn(async () => state),
    subscribeCell: vi.fn(async (_ref, callback) => {
      listener = callback;
      callback(state);
      return { dispose: release };
    }),
    insertRowsWithValues: vi.fn(async () => {}),
    setCellValue: vi.fn(async (_ref, value) => {
      update(value);
    }),
    getCollaborationStatus: vi.fn(),
    subscribeCollaborationStatus: vi.fn(),
    flush: vi.fn(),
  } satisfies BindingDataClient;
  const onError = vi.fn();
  mounted = mountHtmlView({ document, client, onError });
  await tick();
  const input = document.querySelector("input")!;
  const output = document.querySelector("output")!;
  const change = (value: string, event = "input") => {
    input.value = value;
    input.dispatchEvent(new Event(event));
  };
  return { client, input, output, change, update, release, onError };
}
it("throttles input and submits the final value immediately on change", async () => {
  vi.useFakeTimers();
  const { change, client, output } = await setup();
  change("21");
  change("22");
  change("23");
  expect(client.setCellValue).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100);
  expect(client.setCellValue).toHaveBeenLastCalledWith(reference, 23);
  change("24");
  change("25", "change");
  await tick();
  expect(client.setCellValue).toHaveBeenLastCalledWith(reference, 25);
  expect(output.textContent).toBe("25");
});
it("preserves drafts on remote updates and Escape restores the latest value", async () => {
  const { change, input, output, update, client } = await setup("number");
  change("21");
  update(12);
  expect(input.value).toBe("21");
  expect(output.textContent).toBe("12");
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(input.value).toBe("12");
  expect(client.setCellValue).not.toHaveBeenCalled();
});
it("keeps invalid numeric drafts and never writes blank as zero", async () => {
  const { change, input, client } = await setup("number");
  change("", "change");
  await tick();
  expect(client.setCellValue).not.toHaveBeenCalled();
  expect(input.value).toBe("");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  change("42", "change");
  await tick();
  expect(client.setCellValue).not.toHaveBeenCalled();
});
it("keeps a rejected write dirty and accepts the next edit", async () => {
  const { change, client, input } = await setup("number");
  client.setCellValue.mockRejectedValueOnce(new Error("denied"));
  change("21", "change");
  await tick();
  expect(input.value).toBe("21");
  expect(mounted!.hasPendingChanges()).toBe(true);
  expect(document.querySelector('[role="alert"]')!.textContent).toBe("denied");
  change("22", "change");
  await tick();
  expect(client.setCellValue).toHaveBeenLastCalledWith(reference, 22);
  expect(input.hasAttribute("aria-invalid")).toBe(false);
});
it("does not overwrite an edit made while a write response is in flight", async () => {
  const { change, client, input, update } = await setup("number");
  let resolve!: () => void;
  client.setCellValue.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  change("21", "change");
  change("22");
  update(21);
  resolve();
  await tick();
  expect(input.value).toBe("22");
  expect(mounted!.hasPendingChanges()).toBe(true);
  await mounted!.flush();
  expect(client.setCellValue).toHaveBeenLastCalledWith(reference, 22);
});
it("releases dynamic bindings without disturbing another control's draft", async () => {
  const { client, input, release, change } = await setup("number");
  change("21");
  const text = document.createElement("span");
  text.setAttribute("data-univer-cell-text", "u:s:A1");
  document.body.append(text);
  await tick();
  expect(client.subscribeCell).toHaveBeenCalledTimes(1);
  expect(text.textContent).toBe("20");
  expect(input.value).toBe("21");
  text.remove();
  await tick();
  expect(release).not.toHaveBeenCalled();
  document.body.replaceChildren();
  await tick();
  expect(release).toHaveBeenCalledTimes(1);
});
it("changes the subscription when an element's reference changes", async () => {
  const { input, client } = await setup("number");
  input.setAttribute("data-univer-cell-model", "other:s:B2");
  await tick();
  expect(client.subscribeCell).toHaveBeenLastCalledWith(
    { unitId: "other", sheetId: "s", row: 1, col: 1 },
    expect.any(Function),
  );
});
it("keeps successful bindings active if another Unit fails to load", async () => {
  const { client, input, onError } = await setup("number");
  client.subscribeCell.mockRejectedValueOnce(new Error("Access denied"));
  const text = document.createElement("span");
  text.setAttribute("data-univer-cell-text", "denied:s:A1");
  document.body.append(text);
  await tick();
  expect(onError).toHaveBeenCalledWith("Access denied");
  expect(input.disabled).toBe(false);
});
it("cancels pending writes and subscriptions on disposal", async () => {
  vi.useFakeTimers();
  const { change, client, release } = await setup();
  change("21");
  change("22");
  mounted!.dispose();
  await vi.advanceTimersByTimeAsync(200);
  expect(client.setCellValue).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
});
it("writes checkbox booleans and rejects incompatible cell types", async () => {
  const { input, update, client } = await setup("checkbox");
  input.checked = false;
  input.dispatchEvent(new Event("change"));
  await tick();
  expect(client.setCellValue).toHaveBeenLastCalledWith(reference, false);
  update(1);
  expect(input.disabled).toBe(true);
  input.dispatchEvent(new Event("change"));
  await tick();
  expect(client.setCellValue).toHaveBeenCalledTimes(1);
});
it("shares the range throttle across controls for the same cell", async () => {
  vi.useFakeTimers();
  const { input, client, change } = await setup();
  const second = input.cloneNode(true) as HTMLInputElement;
  document.body.append(second);
  await tick();
  change("21");
  change("22");
  second.value = "23";
  second.dispatchEvent(new Event("input"));
  await vi.advanceTimersByTimeAsync(100);
  expect(client.subscribeCell).toHaveBeenCalledTimes(1);
  expect(client.setCellValue).toHaveBeenLastCalledWith(reference, 23);
  expect(input.value).toBe("23");
});
it("Escape cancels a throttled write", async () => {
  vi.useFakeTimers();
  const { change, input, client } = await setup();
  change("21");
  await tick();
  change("22");
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await vi.advanceTimersByTimeAsync(200);
  expect(client.setCellValue).toHaveBeenCalledTimes(1);
  expect(input.value).toBe("21");
});
it("flushes the last throttled value exactly once before disposal", async () => {
  vi.useFakeTimers();
  const { change, client } = await setup();
  change("21");
  await tick();
  change("22");
  await mounted!.flush();
  expect(mounted!.hasPendingChanges()).toBe(false);
  await mounted!.flush();
  mounted!.dispose();
  await vi.advanceTimersByTimeAsync(200);
  expect(client.setCellValue).toHaveBeenCalledTimes(2);
});
it("waits for an existing write during flush instead of sending it twice", async () => {
  const { change, client } = await setup("number");
  let resolve!: () => void;
  client.setCellValue.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  change("21", "change");
  const flush = mounted!.flush();
  expect(client.setCellValue).toHaveBeenCalledTimes(1);
  resolve();
  await flush;
});
it("refuses invalid drafts during flush and keeps them for correction", async () => {
  const { change, input, client } = await setup("number");
  change("");
  await expect(mounted!.flush()).rejects.toThrow("有效数字");
  expect(mounted!.hasPendingChanges()).toBe(true);
  expect(input.value).toBe("");
  change("23");
  await mounted!.flush();
  expect(client.setCellValue).toHaveBeenLastCalledWith(reference, 23);
});

it("clears host errors when the user corrects a failed write", async () => {
  const { client, change, onError } = await setup("number");
  client.setCellValue.mockRejectedValueOnce(new Error("denied"));
  change("21", "change");
  await tick();
  expect(onError).toHaveBeenLastCalledWith("denied");
  change("22", "change");
  await tick();
  expect(onError).toHaveBeenLastCalledWith("");
});
it("restores a dynamically invalid control after correcting its reference", async () => {
  const { input, onError } = await setup("number");
  input.setAttribute("data-univer-cell-model", "invalid");
  await tick();
  expect(input.disabled).toBe(true);
  input.setAttribute("data-univer-cell-model", "u:s:A1");
  await tick();
  expect(input.disabled).toBe(false);
  expect(onError).toHaveBeenLastCalledWith("");
});
