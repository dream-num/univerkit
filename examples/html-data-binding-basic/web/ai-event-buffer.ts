import type { AiEvent } from "../shared/ai.js";

// Network chunks can arrive faster than the browser can lay out long text.
// Keep event order, but render adjacent text deltas together at most 10 times/s.
export function createAiEventBuffer(render: (events: AiEvent[]) => void) {
  let events: AiEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!events.length) return;
    const batch = events;
    events = [];
    render(batch);
  };
  return {
    push(event: AiEvent) {
      const previous = events.at(-1);
      if ((event.type === "text" || event.type === "reasoning") && previous?.type === event.type) {
        previous.text += event.text;
      } else {
        events.push({ ...event });
      }
      timer ??= setTimeout(flush, 100);
    },
    flush,
    clear() {
      clearTimeout(timer);
      timer = undefined;
      events = [];
    },
  };
}
