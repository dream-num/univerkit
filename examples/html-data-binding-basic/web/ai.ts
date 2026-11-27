import type { ExampleFile } from "../shared/files.js";
import type { AiEvent, HtmlDraft } from "../shared/ai.js";
import { createAiEventBuffer } from "./ai-event-buffer.js";

export function setupAi(options: {
  selected(): ExampleFile | undefined;
  flush(): Promise<void>;
  preview(draft: HtmlDraft): Promise<void>;
  openSettings(): Promise<boolean>;
}) {
  const dialog = document.querySelector<HTMLDialogElement>("#ai-dialog")!;
  const form = document.querySelector<HTMLFormElement>("#ai-form")!;
  const source = form.querySelector<HTMLInputElement>('[name="sourceUnitId"]')!;
  const sourceName = form.querySelector<HTMLInputElement>("#ai-source-name")!;
  const name = form.querySelector<HTMLInputElement>('[name="name"]')!;
  let customName = false;
  name.addEventListener("input", () => {
    customName = !!name.value.trim();
  });
  const prompt = form.querySelector<HTMLTextAreaElement>('[name="prompt"]')!;
  const output = form.querySelector<HTMLTextAreaElement>("#ai-output")!;
  const status = form.querySelector<HTMLElement>("#ai-status")!;
  const progress = form.querySelector<HTMLElement>("#ai-progress")!;
  const elapsed = form.querySelector<HTMLElement>("#ai-elapsed")!;
  const waiting = form.querySelector<HTMLElement>("#ai-waiting")!;
  const steps = form.querySelector<HTMLOListElement>("#ai-steps")!;
  let startedAt = 0;
  let lastProgressAt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let thought: Text | undefined;
  const touchProgress = () => {
    lastProgressAt = performance.now();
    if (!waiting.hidden) waiting.hidden = true;
  };
  const isFollowing = (element: HTMLElement) =>
    element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  const appendStep = (step: HTMLLIElement) => {
    steps.append(step);
    if (steps.childElementCount > 50) steps.firstElementChild?.remove();
  };
  const updateTime = () => {
    elapsed.textContent = `已用 ${Math.floor((performance.now() - startedAt) / 1000)} 秒`;
    const idle = Math.floor((performance.now() - lastProgressAt) / 1000);
    waiting.hidden = !controller || idle < 8;
    if (!waiting.hidden)
      waiting.textContent = `已 ${idle} 秒未收到新进展，可以继续等待或点击 Stop 停止。`;
  };
  const recordProgress = (message: string) => {
    touchProgress();
    status.textContent = message;
    if (steps.lastElementChild?.getAttribute("data-message") === message) return;
    const step = document.createElement("li");
    step.dataset.message = message;
    const time = document.createElement("span");
    time.textContent = `${Math.floor((performance.now() - startedAt) / 1000)}s`;
    step.append(time, document.createTextNode(message));
    appendStep(step);
  };
  const appendReasoning = (text: string) => {
    if (!text) return;
    touchProgress();
    status.textContent = "AI 正在思考…";
    if (!thought) {
      const step = document.createElement("li");
      step.className = "ai-thought";
      const details = document.createElement("details");
      details.open = true;
      const summary = document.createElement("summary");
      summary.textContent = "AI 思考 · 模型返回";
      const body = document.createElement("div");
      body.className = "ai-thought-content";
      thought = document.createTextNode("");
      body.append(thought);
      details.append(summary, body);
      step.append(details);
      appendStep(step);
    }
    thought.appendData(text);
  };
  const error = form.querySelector<HTMLElement>("#ai-error")!;
  const generate = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  const cancel = form.querySelector<HTMLButtonElement>("#ai-cancel")!;
  const preview = form.querySelector<HTMLButtonElement>("#ai-preview")!;
  const settings = form.querySelector<HTMLButtonElement>("#ai-open-settings")!;
  let controller: AbortController | undefined;
  let generatedHtml: string | undefined;

  const stream = createAiEventBuffer((events) => {
    const followSteps = isFollowing(steps);
    const followOutput = output.hidden || isFollowing(output);
    for (const event of events) {
      switch (event.type) {
        case "status":
          recordProgress(event.message);
          break;
        case "reset":
          thought = undefined;
          output.value = "";
          output.hidden = true;
          break;
        case "reasoning":
          appendReasoning(event.text);
          break;
        case "text":
          if (!event.text) break;
          if (output.hidden) recordProgress("正在编写 HTML…");
          touchProgress();
          output.hidden = false;
          output.value += event.text;
          break;
        case "result":
          output.hidden = false;
          generatedHtml = event.html;
          output.value = event.html;
          if (!customName) {
            name.value =
              new DOMParser().parseFromString(event.html, "text/html").title.trim() ||
              "AI generated view";
          }
          break;
        case "error":
          break;
      }
    }
    // Each container is measured once after all writes, rather than per token.
    const stepsHeight = followSteps ? steps.scrollHeight : 0;
    const outputHeight = followOutput && !output.hidden ? output.scrollHeight : 0;
    if (followSteps) steps.scrollTop = stepsHeight;
    if (followOutput) output.scrollTop = outputHeight;
  });

  const busy = (value: boolean) => {
    source.disabled = prompt.disabled = generate.disabled = value;
    cancel.textContent = value ? "Stop" : "Close";
    preview.hidden = value || !generatedHtml;
    form.setAttribute("aria-busy", String(value));
    progress.dataset.running = String(value);
  };
  document.querySelector<HTMLButtonElement>("#generate-html")!.onclick = () => {
    const selected = options.selected();
    if (selected?.kind !== "sheet") return;
    form.reset();
    customName = false;
    stream.clear();
    generatedHtml = undefined;
    output.hidden = true;
    progress.hidden = true;
    steps.replaceChildren();
    thought = undefined;
    settings.hidden = true;
    status.textContent = error.textContent = "";
    busy(false);
    source.value = selected.unitId;
    sourceName.value = selected.name;
    dialog.showModal();
  };
  const stop = () => controller?.abort();
  cancel.onclick = () => (controller ? stop() : dialog.close());
  dialog.addEventListener("cancel", (event) => {
    if (controller) {
      event.preventDefault();
      stop();
    }
  });
  window.addEventListener("pagehide", () => {
    stop();
    stream.clear();
    clearInterval(timer);
  });
  settings.onclick = () => {
    void options.openSettings().then((configured) => {
      if (!configured) return;
      settings.hidden = true;
      error.textContent = "";
      status.textContent = "API Key configured. Click Generate to continue.";
      generate.focus();
    });
  };

  form.onsubmit = (event) => {
    event.preventDefault();
    if (controller) return;
    const active = new AbortController();
    controller = active;
    stream.clear();
    generatedHtml = undefined;
    output.value = "";
    output.hidden = true;
    progress.hidden = false;
    steps.replaceChildren();
    thought = undefined;
    startedAt = lastProgressAt = performance.now();
    clearInterval(timer);
    timer = setInterval(updateTime, 1000);
    updateTime();
    error.textContent = "";
    settings.hidden = true;
    recordProgress("正在保存表格更改…");
    busy(true);

    void (async () => {
      await options.flush();
      active.signal.throwIfAborted();
      recordProgress("正在连接 AI 服务…");
      const response = await fetch("/api/ai/html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUnitId: source.value, prompt: prompt.value }),
        signal: active.signal,
      });
      if (!response.ok) {
        const result = await response.json();
        if (result.code === "AI_KEY_NOT_CONFIGURED") {
          settings.hidden = false;
          output.hidden = true;
        }
        throw new Error(result.error ?? "Generation failed.");
      }
      if (!response.body) throw new Error("The AI response has no content.");
      const receive = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as AiEvent;
        if (event.type === "error") {
          stream.flush();
          throw new Error(event.message);
        }
        // Mark network activity immediately; DOM updates are buffered separately.
        touchProgress();
        stream.push(event);
      };
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let pending = "";
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += value;
          const lines = pending.split("\n");
          pending = lines.pop()!;
          lines.forEach(receive);
        }
        receive(pending);
        stream.flush();
      } finally {
        await reader.cancel();
      }
      if (!generatedHtml) throw new Error("Generation ended without a complete HTML document.");
      recordProgress("HTML 已生成，请预览后保存。");
    })()
      .catch((reason: unknown) => {
        stream.flush();
        generatedHtml = undefined;
        recordProgress(active.signal.aborted ? "生成已停止。" : "生成失败。");
        if (!active.signal.aborted)
          error.textContent = reason instanceof Error ? reason.message : String(reason);
      })
      .finally(() => {
        controller = undefined;
        stream.clear();
        clearInterval(timer);
        updateTime();
        busy(false);
      });
  };
  preview.onclick = () => {
    if (!generatedHtml) return;
    if (!name.value.trim()) {
      error.textContent = "Provide a name for the HTML view.";
      return;
    }
    preview.disabled = true;
    void options
      .preview({ id: crypto.randomUUID(), name: name.value.trim(), html: generatedHtml })
      .catch((reason: unknown) => {
        error.textContent = reason instanceof Error ? reason.message : String(reason);
      })
      .finally(() => {
        preview.disabled = false;
      });
  };
}
