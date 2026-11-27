import { describe, expect, it } from "vitest";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ChatResult } from "@langchain/core/outputs";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";
import { UniverType } from "@univerjs/protocol";
import { LocaleType, type IWorkbookData } from "@univerjs/core";
import { generateHtml, loadAiWorkbook, readSheetRange } from "../server/ai.js";
import type { AiEvent } from "../shared/ai.js";

const workbook: IWorkbookData = {
  id: "ai-workbook",
  rev: 1,
  name: "AI Sheet",
  appVersion: "",
  locale: LocaleType.EN_US,
  styles: {},
  sheetOrder: ["data"],
  sheets: {
    data: {
      id: "data",
      name: "Sales",
      rowCount: 20,
      columnCount: 10,
      cellData: { 0: { 0: { v: "Sales" }, 1: { v: 12 }, 2: { f: "=B1*2" } } },
    },
  },
};
const html =
  '<!doctype html><html><head><title>Sales</title></head><body><span data-univer-cell-text="ai-workbook:data:C1"></span></body></html>';

class ScriptedModel extends BaseChatModel {
  constructor(private readonly respond: (messages: BaseMessage[]) => AIMessage) {
    super({});
  }
  _llmType() {
    return "test-scripted";
  }
  override bindTools() {
    return this;
  }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    return { generations: [{ text: "", message: this.respond(messages) }] };
  }
}

describe("AI Sheet tools", () => {
  it("materializes real Sheet values and formula results through the SDK", async () => {
    const database = new SQLiteDatabaseAdapter({ filename: ":memory:" });
    const service = new UniverCollabService({ dbAdapter: database });
    try {
      await service.createUnitFromData(
        { type: UniverType.UNIVER_SHEET, data: workbook },
        { userID: "test" },
      );
      const current = await loadAiWorkbook(service, { userID: "test" }, workbook.id);
      expect(readSheetRange(current, "data", "A1:D2")).toEqual({
        sheetId: "data",
        range: "A1:D2",
        values: [
          ["Sales", 12, 24, null],
          [null, null, null, null],
        ],
        formulas: [
          [null, null, "=B1*2", null],
          [null, null, null, null],
        ],
      });
    } finally {
      await service.dispose();
    }
  });

  it.each(["A0", "A1:B2:C3", "C2:A1", "A1:Z99", "A:A"])("rejects invalid range %s", (range) => {
    expect(() => readSheetRange(workbook, "data", range)).toThrow();
  });
  it("rejects an unknown Sheet", () => {
    expect(() => readSheetRange(workbook, "missing", "A1")).toThrow("Sheet not found");
  });

  it("runs LangChain's tool loop and supplies actual cells to the model", async () => {
    const events: AiEvent[] = [];
    const model = new ScriptedModel((messages) => {
      const instructions = JSON.stringify(
        messages.find((message) => message.type === "system")?.content,
      );
      expect(instructions).toContain("data-univer-cell-text");
      expect(instructions).toContain("data-univer-cell-model");
      expect(instructions).toContain("data-univer-cell-subscribe");
      expect(instructions).toContain("data-univer-range-subscribe");
      expect(instructions).toContain("subscribeRangeById");
      expect(instructions).toContain("subscribeCellById");
      expect(instructions).not.toMatch(/data-univer-(?:text|model)\b/);
      const results = messages.filter((message) => message.type === "tool");
      if (!results.length)
        return new AIMessage({
          content: "",
          tool_calls: [{ id: "list", name: "listSheets", args: {} }],
        });
      if (results.length === 1) {
        expect(JSON.parse(results[0]!.content as string)).toEqual([
          { id: "data", name: "Sales", rowCount: 20, columnCount: 10 },
        ]);
        return new AIMessage({
          content: "",
          tool_calls: [
            { id: "read", name: "readRange", args: { sheetId: "data", range: "A1:C1" } },
          ],
        });
      }
      expect(JSON.parse(results[1]!.content as string).values).toEqual([["Sales", 12, null]]);
      expect(JSON.parse(results[1]!.content as string).formulas[0][2]).toBe("=B1*2");
      return new AIMessage(html);
    });
    expect(
      await generateHtml({
        model,
        workbook,
        prompt: "Make a dashboard",
        signal: new AbortController().signal,
        emit: (event) => events.push(event),
      }),
    ).toBe(html);
    expect(events).toContainEqual({
      type: "status",
      message: "AI 正在处理已读取的数据，等待下一步输出…",
    });
    expect(
      events.filter((event) => event.type === "status" && event.message.startsWith("正在读取")),
    ).toHaveLength(2);
  });

  it.each([
    `Here is your dashboard.\n\`\`\`html\n${html}\n\`\`\`\n### How it works\nLive Sheet data.`,
    `\`\`\`\r\n${html}\r\n\`\`\``,
  ])("extracts complete HTML from a model's Markdown response", async (content) => {
    const model = new ScriptedModel((messages) =>
      messages.some((message) => message.type === "tool")
        ? new AIMessage(content)
        : new AIMessage({
            content: "",
            tool_calls: [{ id: "read", name: "readRange", args: { sheetId: "data", range: "A1" } }],
          }),
    );
    expect(
      await generateHtml({
        model,
        workbook,
        prompt: "Dashboard",
        signal: new AbortController().signal,
        emit() {},
      }),
    ).toBe(html);
  });

  it.each([
    ["<html><body>Incomplete", "incomplete"],
    [html.replace("ai-workbook:data:C1", "other:data:C1"), "outside"],
  ])("does not deliver invalid generated HTML", async (output, message) => {
    const model = new ScriptedModel((messages) =>
      messages.some((message) => message.type === "tool")
        ? new AIMessage(output)
        : new AIMessage({
            content: "",
            tool_calls: [{ id: "read", name: "readRange", args: { sheetId: "data", range: "A1" } }],
          }),
    );
    await expect(
      generateHtml({
        model,
        workbook,
        prompt: "Dashboard",
        signal: new AbortController().signal,
        emit() {},
      }),
    ).rejects.toThrow(message);
  });

  it("rejects generated HTML when the model skipped reading the Sheet", async () => {
    await expect(
      generateHtml({
        model: new ScriptedModel(() => new AIMessage(html)),
        workbook,
        prompt: "Dashboard",
        signal: new AbortController().signal,
        emit() {},
      }),
    ).rejects.toThrow("did not read");
  });
});
