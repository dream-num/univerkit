import type { ISnapshot } from "@univerjs/protocol";
import { createEventHtmlSource, createEventSheetData, eventViews } from "./event-template.js";
import type { FileCatalog } from "./file-catalog.js";
import { createSalesHtmlSource, createSalesSheetData } from "./sales-template.js";
import { createHtmlSource, createSheetData } from "./templates.js";

// An anonymous demo: every request acts as this one SDK identity, with no login or permissions.
export const DEMO_USER = { userID: "demo-user", displayName: "Guest" };

export function getSnapshotName(snapshot: ISnapshot): string | undefined {
  return snapshot.workbook?.name || undefined;
}

/** Seeds the demo files. Existing files keep their content, so restarts preserve edits. */
export async function ensureDemoFiles(catalog: FileCatalog): Promise<void> {
  await catalog.createSheet(
    "demo-budget",
    "Team budget",
    createSheetData("demo-budget", "Team budget"),
  );
  catalog.createHtml(
    "demo-budget-view",
    "Team budget.univer.html",
    createHtmlSource("demo-budget"),
  );

  const sales = "区域销售分析";
  await catalog.createSheet("demo-sales", sales, createSalesSheetData("demo-sales", sales));
  catalog.createHtml(
    "demo-sales-view",
    "区域销售驾驶舱.univer.html",
    createSalesHtmlSource("demo-sales"),
  );

  const event = "Univer 开发者沙龙 · 活动管理";
  await catalog.createSheet("demo-event", event, createEventSheetData("demo-event", event));
  for (const view of eventViews) {
    catalog.createHtml(
      `demo-event-${view.id}`,
      `${view.name}.univer.html`,
      createEventHtmlSource("demo-event", view),
    );
  }
}
