// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { renderHtmlView, type HtmlViewHandle } from "../src/render.js";
import { inspectBindingDeclaration } from "../src/shared/inspection.js";
import { createBindingEngineClient } from "../src/iframe/client.js";
const releases: (() => void)[] = [];
afterEach(() => {
  releases
    .splice(0)
    .reverse()
    .forEach((release) => release());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const loadEngine = vi.fn();
  const view = renderHtmlView({ container, html: "<p>Template</p>", loadEngine });
  releases.push(() => view.dispose());
  return { container, view, loadEngine };
}
async function connect(container: HTMLElement, view: HtmlViewHandle) {
  await Promise.resolve();
  const frame = container.querySelector(".univer-html-view")!.shadowRoot!.querySelector("iframe")!;
  const token = /data-univer-connection="([^"]+)"/.exec(frame.srcdoc)![1];
  const channel = new MessageChannel();
  const setPaused = vi.fn();
  const inspector = {
    snapshot: vi.fn(() => [
      {
        id: "live-1",
        elementId: "amount",
        tagName: "span",
        ...inspectBindingDeclaration("span", (name) =>
          name === "data-univer-cell-text" ? "u:s:A1" : undefined,
        ),
      },
    ]),
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
    setPaused,
    onClose: () => {},
    onError: () => {},
  });
  releases.push(() => connection.dispose());
  window.dispatchEvent(
    new MessageEvent("message", {
      source: frame.contentWindow,
      origin: "null",
      data: { type: "univer-html-view-connect", token },
      ports: [channel.port1],
    }),
  );
  await view.ready;
  return { connection, setPaused, inspector };
}
it("owns one mount, preserves application children, and can be disposed before boot then remounted", async () => {
  const { container, view, loadEngine } = mount();
  const sibling = document.createElement("span");
  container.append(sibling);
  const old = container.querySelector(".univer-html-view")!.shadowRoot!.querySelector("iframe")!;
  expect(() => renderHtmlView({ container, html: "", loadEngine })).toThrow("already");
  view.dispose();
  view.dispose();
  await expect(view.ready).rejects.toThrow("disposed");
  const replacement = renderHtmlView({ container, html: "<b>New</b>", loadEngine });
  releases.push(() => replacement.dispose());
  await Promise.resolve();
  expect(old.srcdoc).toBe("");
  expect(container.contains(sibling)).toBe(true);
  expect(container.querySelectorAll(".univer-html-view")).toHaveLength(1);
});
it("ordinary flush stays interactive; leaving pauses and resume restores ready", async () => {
  const { container, view } = mount();
  const phases: string[] = [];
  view.subscribe((state) => phases.push(state.phase));
  const { setPaused } = await connect(container, view);
  await view.flush();
  expect(setPaused).not.toHaveBeenCalled();
  await view.prepareToLeave();
  expect(phases.at(-1)).toBe("paused");
  expect(setPaused).toHaveBeenLastCalledWith(true);
  await view.resume();
  expect(phases.at(-1)).toBe("ready");
  expect(setPaused).toHaveBeenLastCalledWith(false);
  await view.flush();
  view.dispose();
  await expect(view.resume()).rejects.toThrow("closed");
});
it("rejects a stalled handshake and reports a closed view", async () => {
  vi.useFakeTimers();
  const { view } = mount();
  const states: string[] = [];
  view.subscribe((state) => states.push(state.phase));
  const rejection = expect(view.ready).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(15_000);
  await rejection;
  expect(states.at(-1)).toBe("closed");
});
it("connection loss cannot be revived by a queued operation", async () => {
  const { view, container } = mount();
  const { connection } = await connect(container, view);
  connection.dispose();
  await new Promise((resolve) => setTimeout(resolve, 10));
  let phase = "";
  view.subscribe((state) => {
    phase = state.phase;
  });
  await expect(view.prepareToLeave()).rejects.toThrow("closed");
  expect(phase).toBe("closed");
});

it("owns lazy inspection, aborts metadata on close and drops late names after reopening", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const { view, container } = mount();
  const { inspector } = await connect(container, view);
  const shadow = container.querySelector(".univer-html-view")!.shadowRoot!;
  expect(shadow.querySelector("#binding-inspector")).toBeNull();
  let signal!: AbortSignal;
  let complete!: (value: { unitId: string; name: string; sheets: [] }) => void;
  await view.inspect.open({
    loadMetadata(_unitId, pendingSignal) {
      signal = pendingSignal;
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  });
  expect(inspector.setPicking).toHaveBeenLastCalledWith(true);
  expect(inspector.highlightAll).toHaveBeenLastCalledWith(true);
  await view.inspect.close();
  expect(signal.aborted).toBe(true);
  expect(inspector.setPicking).toHaveBeenLastCalledWith(false);
  expect(inspector.highlight).toHaveBeenLastCalledWith(null);
  await view.inspect.open();
  expect(inspector.highlightAll).toHaveBeenLastCalledWith(true);
  complete({ unitId: "u", name: "Stale name", sheets: [] });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(shadow.textContent).not.toContain("Stale name");
  expect(inspector.setMetadata).toHaveBeenLastCalledWith([]);
  view.dispose();
  expect(container.childElementCount).toBe(0);
});
