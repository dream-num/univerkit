// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { CellState, RangeState } from "@univerkit/binding-engine";
import type { BindingDataClient, HtmlRangeReference } from "../src/shared/client-types.js";
import { mountHtmlView } from "../src/dom.js";

let mounted: ReturnType<typeof mountHtmlView> | undefined;
const tick = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
afterEach(() => {
  mounted?.dispose();
  document.body.replaceChildren();
});
function setup(html: string, delayed = false) {
  document.body.innerHTML = html;
  const cells: ((state: CellState) => void)[] = [];
  const ranges: ((state: RangeState) => void)[] = [];
  const releases: ReturnType<typeof vi.fn>[] = [];
  const complete: (() => void)[] = [];
  const subscription = () => {
    const dispose = vi.fn();
    releases.push(dispose);
    return delayed
      ? new Promise<{ dispose(): void }>((resolve) => complete.push(() => resolve({ dispose })))
      : Promise.resolve({ dispose });
  };
  const client = {
    subscribeCell: vi.fn((_ref, callback: (state: CellState) => void) => {
      cells.push(callback);
      if (!delayed) callback({ value: 42 });
      return subscription();
    }),
    subscribeRange: vi.fn((_ref: HtmlRangeReference, callback: (state: RangeState) => void) => {
      ranges.push(callback);
      if (!delayed)
        callback({
          value: [
            ["Ada", null],
            ["Lin", true],
          ],
        });
      return subscription();
    }),
    getCellState: vi.fn(),
    getRangeState: vi.fn(),
    setCellValue: vi.fn(),
    insertRowsWithValues: vi.fn(),
    getCollaborationStatus: vi.fn(),
    subscribeCollaborationStatus: vi.fn(),
    flush: vi.fn(),
  } satisfies BindingDataClient;
  const onError = vi.fn();
  mounted = mountHtmlView({ document, client, onError });
  return { client, cells, ranges, releases, complete, onError };
}
it("renders existing text/model bindings alongside ById subscriptions", async () => {
  const { client } = setup(
    `<span data-univer-cell-text="u:s:A1"></span><input type="number" data-univer-cell-model="u:s:A1"><div id="cell" data-univer-cell-subscribe="u:s:B2">custom</div><div id="range" data-univer-range-subscribe="v:t:A2:B3">rows</div>`,
  );
  await tick();
  expect(document.querySelector("span")!.textContent).toBe("42");
  expect(document.querySelector("input")!.value).toBe("42");
  expect(document.getElementById("cell")!.textContent).toBe("custom");
  expect(document.getElementById("range")!.textContent).toBe("rows");
  expect(client.subscribeCell).toHaveBeenCalledTimes(2);
  expect(client.subscribeRange).toHaveBeenCalledWith(
    {
      unitId: "v",
      sheetId: "t",
      range: { startRow: 1, endRow: 2, startColumn: 0, endColumn: 1 },
    },
    expect.any(Function),
  );
  const range = vi.fn();
  await mounted!.subscribeRangeById("range", range);
  expect(range).toHaveBeenCalledWith({
    value: [
      ["Ada", null],
      ["Lin", true],
    ],
  });
  expect(client.subscribeRange).toHaveBeenCalledTimes(1);
});
it("delivers initial state before resolving, independently disposes callbacks and retains the declaration", async () => {
  const { cells, releases, complete, client } = setup(
    '<div id="x" data-univer-cell-subscribe="u:s:A1"></div>',
    true,
  );
  const order: string[] = [];
  const first = mounted!
    .subscribeCellById("x", () => order.push("initial"))
    .then((sub) => {
      order.push("ready");
      return sub;
    });
  cells[0]!({ value: 7 });
  expect(order).toEqual(["initial"]);
  complete[0]!();
  const sub = await first;
  expect(order).toEqual(["initial", "ready"]);
  const second = vi.fn();
  const other = await mounted!.subscribeCellById("x", second);
  sub.dispose();
  sub.dispose();
  cells[0]!({ value: 8 });
  expect(order).toEqual(["initial", "ready"]);
  expect(second).toHaveBeenLastCalledWith({ value: 8 });
  other.dispose();
  expect(releases[0]).not.toHaveBeenCalled();
  expect(client.subscribeCell).toHaveBeenCalledTimes(1);
  document.getElementById("x")!.remove();
  await tick();
  expect(releases[0]).toHaveBeenCalledOnce();
});
it("retargets a live element, releases old requests and ignores their late data", async () => {
  const { cells, complete, releases } = setup(
    '<div id="x" data-univer-cell-subscribe="u:s:A1"></div>',
    true,
  );
  const callback = vi.fn();
  const subscription = mounted!.subscribeCellById("x", callback);
  document.getElementById("x")!.setAttribute("data-univer-cell-subscribe", "v:t:B2");
  await tick();
  cells[0]!({ value: "stale" });
  complete[0]!();
  await tick();
  expect(callback).not.toHaveBeenCalled();
  expect(releases[0]).toHaveBeenCalledOnce();
  cells[1]!({ value: "current" });
  complete[1]!();
  await subscription;
  expect(callback).toHaveBeenCalledExactlyOnceWith({ value: "current" });
});
it("supports dynamic insertion before the observer runs and literal IDs", async () => {
  const { client } = setup("");
  const element = document.createElement("div");
  element.id = "a:b[0]";
  element.setAttribute("data-univer-range-subscribe", "u:s:A1:A1");
  document.body.append(element);
  const callback = vi.fn();
  await mounted!.subscribeRangeById(element.id, callback);
  expect(callback).toHaveBeenCalledOnce();
  expect(client.subscribeRange).toHaveBeenCalledOnce();
});
it("rejects missing, duplicate, mismatched and malformed declarations", async () => {
  setup(
    '<div id="text" data-univer-cell-text="u:s:A1"></div><div id="range" data-univer-range-subscribe="u:s:A1:B2"></div><div id="bad" data-univer-cell-subscribe="bad"></div><div id="dup"></div><div id="dup"></div>',
  );
  for (const id of ["", "missing", "#text", "text", "range", "bad", "dup"]) {
    await expect(mounted!.subscribeCellById(id, vi.fn())).rejects.toThrow();
  }
});
it("does not transfer callbacks to a replacement element with the same ID", async () => {
  const { cells } = setup('<div id="x" data-univer-cell-subscribe="u:s:A1"></div>');
  const callback = vi.fn();
  await mounted!.subscribeCellById("x", callback);
  document.getElementById("x")!.outerHTML =
    '<div id="x" data-univer-cell-subscribe="u:s:B2"></div>';
  await tick();
  cells[0]!({ value: "old" });
  cells[1]!({ value: "new" });
  expect(callback).toHaveBeenCalledTimes(1);
  const next = vi.fn();
  await mounted!.subscribeCellById("x", next);
  expect(next).toHaveBeenCalledExactlyOnceWith({ value: "new" });
});
it("rejects pending registrations on removal and disposes late subscriptions", async () => {
  const { complete, releases } = setup(
    '<div id="x" data-univer-range-subscribe="u:s:A1:B2"></div>',
    true,
  );
  const pending = mounted!.subscribeRangeById("x", vi.fn());
  const rejected = expect(pending).rejects.toThrow("removed");
  document.body.replaceChildren();
  await tick();
  await rejected;
  complete[0]!();
  await tick();
  expect(releases[0]).toHaveBeenCalledOnce();
});
it("isolates callback errors and blocks use after disposal", async () => {
  const { onError, cells } = setup('<div id="x" data-univer-cell-subscribe="u:s:A1"></div>');
  await mounted!.subscribeCellById("x", () => {
    throw new Error("render failed");
  });
  const callback = vi.fn();
  await mounted!.subscribeCellById("x", callback);
  cells[0]!({ value: 100 });
  expect(callback).toHaveBeenLastCalledWith({ value: 100 });
  expect(onError).toHaveBeenCalledWith("render failed");
  mounted!.dispose();
  cells[0]!({ value: 101 });
  expect(callback).toHaveBeenCalledTimes(2);
  await expect(mounted!.subscribeCellById("x", callback)).rejects.toThrow("disposed");
});
it("reports loading failures to ById without affecting another element", async () => {
  const { client, onError } = setup('<div id="good" data-univer-cell-subscribe="u:s:A1"></div>');
  client.subscribeRange.mockRejectedValueOnce(new Error("denied"));
  const element = document.createElement("div");
  element.id = "bad";
  element.setAttribute("data-univer-range-subscribe", "bad:s:A1:B2");
  document.body.append(element);
  await expect(mounted!.subscribeRangeById("bad", vi.fn())).rejects.toThrow("denied");
  expect(onError).toHaveBeenCalledWith("denied");
  const callback = vi.fn();
  await mounted!.subscribeCellById("good", callback);
  expect(callback).toHaveBeenCalledWith({ value: 42 });
});
