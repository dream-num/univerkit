import { describe, expect, it } from "vitest";
import { parseCellReference, parseRangeReference, parseHtmlView } from "@univerkit/html-view";
import { createHtmlSource } from "../server/templates.js";
import { createSalesHtmlSource } from "../server/sales-template.js";
import { createEventHtmlSource, eventViews } from "../server/event-template.js";

const unitId = "活动:unit/中文";
const sources = [
  { name: "budget", html: createHtmlSource(unitId) },
  { name: "sales", html: createSalesHtmlSource(unitId) },
  ...eventViews.map((view) => ({ name: view.id, html: createEventHtmlSource(unitId, view) })),
];
// The parser appends its marker after author attributes in normalized HTML.
// These fixtures use ordinary quoted IDs; no inspection or analysis API is needed.
function declarations(source: string) {
  const document = parseHtmlView(source);
  return document.bindings.map((binding) => {
    const tag = document.html.match(
      new RegExp(`<[^>]+\\bdata-univer-binding="${binding.id}"[^>]*>`),
    )?.[0];
    const elementId = tag?.match(/\bid="([^"]*)"/)?.[1];
    return { elementId, binding };
  });
}

describe("built-in template declarations", () => {
  it.each(sources)("$name uses resolved declarations and ById subscriptions", ({ html }) => {
    const entries = declarations(html);
    expect(entries.length).toBeGreaterThan(0);
    for (const { binding, elementId } of entries) {
      expect(binding.reference.unitId).toBe(unitId);
      if (["cell", "range"].includes(binding.kind)) expect(elementId).toBeTruthy();
    }
    expect(html).not.toMatch(/\{\{(?:SETTINGS|ATTENDEES|SUMMARY|UNIT_ID)\}\}/);
    expect(html).not.toMatch(/data-univer-(?:text|model)\s*=/);
    expect(html).not.toMatch(/data-univer-(?:cell|range)\s*=/);
    expect(html).not.toMatch(/\.subscribe(?:Cell|Range)\s*\(/);
    expect(html).toMatch(/\.subscribe(?:Cell|Range)ById\s*\(/);
  });
  it.each([
    {
      id: "register",
      expected: { remaining: ["text", "summary", "B6"], session: ["range", "settings", "B6:B8"] },
    },
    {
      id: "checkin",
      expected: {
        registered: ["text", "summary", "B2"],
        checked: ["text", "summary", "B3"],
        absent: ["text", "summary", "B4"],
        rate: ["cell", "summary", "B5"],
        "attendee-list": ["range", "attendees", "A2:G81"],
      },
    },
    {
      id: "screen",
      expected: {
        registered: ["text", "summary", "B2"],
        checked: ["text", "summary", "B3"],
        absent: ["text", "summary", "B4"],
        rate: ["cell", "summary", "B5"],
        "overall-progress": ["cell", "summary", "B5"],
        "session-progress": ["range", "summary", "A9:C11"],
        welcome: ["range", "attendees", "A2:G81"],
        "recent-arrivals": ["range", "attendees", "A2:G81"],
      },
    },
  ])(
    "$id binds individual metrics and reserves ranges for collection components",
    ({ id, expected }) => {
      const html = sources.find((source) => source.name === id)!.html;
      const actual = declarations(html).filter((entry) => entry.elementId);
      expect(
        Object.fromEntries(
          actual.map(({ elementId, binding }) => [elementId, [binding.kind, binding.reference]]),
        ),
      ).toEqual(
        Object.fromEntries(
          Object.entries(expected).map(([elementId, [kind, sheet, address]]) => [
            elementId,
            [
              kind,
              (kind === "range" ? parseRangeReference : parseCellReference)(
                `${encodeURIComponent(unitId)}:${sheet}:${address}`,
              ),
            ],
          ]),
        ),
      );
      expect(html).not.toContain("A2:C11");
      expect(html).not.toContain("A2:B8");
    },
  );
  it.each([
    { name: "budget", sheet: "sheet-1", ranges: { chart: "B3:B4" } },
    {
      name: "sales",
      sheet: "dashboard",
      ranges: { "trend-chart": "A15:C21", "region-chart": "H15:J19", "detail-rows": "A26:G31" },
    },
  ])("$name charts and tables subscribe only to the displayed data", ({ name, sheet, ranges }) => {
    const html = sources.find((source) => source.name === name)!.html;
    const entries = declarations(html).filter((entry) => entry.binding.kind === "range");
    expect(
      Object.fromEntries(entries.map((entry) => [entry.elementId, entry.binding.reference])),
    ).toEqual(
      Object.fromEntries(
        Object.entries(ranges).map(([id, address]) => [
          id,
          parseRangeReference(`${encodeURIComponent(unitId)}:${sheet}:${address}`),
        ]),
      ),
    );
  });
});
