import type { IWorkbookData } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";
import { transformSnapshotToWorkbookData } from "@univerjs-pro/collaboration";
import {
  UnitSnapshotMaterializer,
  type CollabContext,
  type IUniverCollabService,
} from "@univerjs-pro/collaboration-service";

/**
 * Reads the latest Sheet data on the server. The stored snapshot alone would miss recent edits and
 * formula results, so the materializer replays the confirmed changesets onto it. One materializer
 * serves every read: its Worker runtime starts once, and later reads take milliseconds.
 */
export class WorkbookReader {
  private readonly _materializer = new UnitSnapshotMaterializer();

  constructor(
    private readonly _service: IUniverCollabService,
    private readonly _context: CollabContext,
  ) {}

  async read(unitId: string): Promise<IWorkbookData> {
    const load = await this._service.getUnitLoadDataWithBlocks(
      { unitID: unitId, type: UniverType.UNIVER_SHEET, revision: 0 },
      this._context,
    );
    const { snapshot, sheetBlocks } = await this._materializer.materializeSnapshot(load);
    return transformSnapshotToWorkbookData(snapshot, sheetBlocks ?? []);
  }

  dispose(): Promise<void> {
    return this._materializer.dispose();
  }
}
