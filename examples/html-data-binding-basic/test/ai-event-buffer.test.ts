import { afterEach, expect, it, vi } from "vitest";
import { createAiEventBuffer } from "../web/ai-event-buffer.js";

afterEach(() => vi.useRealTimers());

it("coalesces token bursts while preserving round boundaries and final HTML", () => {
  vi.useFakeTimers();
  const render = vi.fn();
  const buffer = createAiEventBuffer(render);
  for (let i = 0; i < 5_000; i++) buffer.push({ type: "reasoning", text: "想" });
  buffer.push({ type: "reset" });
  buffer.push({ type: "reasoning", text: "下一轮" });
  for (let i = 0; i < 5_000; i++) buffer.push({ type: "text", text: "x" });
  buffer.push({ type: "result", html: "<html>final</html>" });
  expect(render).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100);
  expect(render).toHaveBeenCalledExactlyOnceWith([
    { type: "reasoning", text: "想".repeat(5_000) },
    { type: "reset" },
    { type: "reasoning", text: "下一轮" },
    { type: "text", text: "x".repeat(5_000) },
    { type: "result", html: "<html>final</html>" },
  ]);
  expect(vi.getTimerCount()).toBe(0);
});

it("limits sustained rendering and releases timers on completion or cancellation", () => {
  vi.useFakeTimers();
  const render = vi.fn();
  const buffer = createAiEventBuffer(render);
  for (let i = 0; i < 1_000; i++) {
    buffer.push({ type: "text", text: "." });
    vi.advanceTimersByTime(1);
  }
  expect(render).toHaveBeenCalledTimes(10);
  buffer.push({ type: "text", text: "last" });
  buffer.flush();
  expect(render).toHaveBeenLastCalledWith([{ type: "text", text: "last" }]);
  buffer.push({ type: "text", text: "cancelled" });
  buffer.clear();
  vi.advanceTimersByTime(1_000);
  expect(render).toHaveBeenCalledTimes(11);
  expect(vi.getTimerCount()).toBe(0);
});
