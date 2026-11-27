import type { IWorkbookData } from "@univerjs/core";
import { transformSnapshotToWorkbookData } from "@univerjs-pro/collaboration";
import {
  UnitSnapshotMaterializer,
  type CollabContext,
  type IUniverCollabService,
} from "@univerjs-pro/collaboration-service";
import { UniverType } from "@univerjs/protocol";

// Materialize the snapshot AND subsequent changesets through the SDK. Reading
// the stored snapshot alone would miss recent collaboration edits and formulas.
export async function loadWorkbook(
  service: IUniverCollabService,
  context: CollabContext,
  unitId: string,
): Promise<IWorkbookData> {
  const materializer = new UnitSnapshotMaterializer();
  try {
    const load = await service.getUnitLoadDataWithBlocks(
      { unitID: unitId, type: UniverType.UNIVER_SHEET, revision: 0 },
      context,
    );
    const { snapshot, sheetBlocks } = await materializer.materializeSnapshot(load);
    return await transformSnapshotToWorkbookData(snapshot, sheetBlocks ?? []);
  } finally {
    await materializer.dispose();
  }
}
