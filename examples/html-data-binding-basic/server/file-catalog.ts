import Database from "libsql";
import type { IWorkbookData } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";
import type { CollabContext, IUniverCollabService } from "@univerjs-pro/collaboration-service";
import type { ExampleFile } from "../shared/files.js";

type Row = { id: string; name: string; kind: "sheet" | "html"; createdAt: number; seq: number };

// Sheets are collaboration Units: the SDK owns their writes, and the catalog only projects their
// metadata. HTML views are application data, so the catalog owns their table in the same file.
const FILES_QUERY = `
  SELECT unit_id AS id, COALESCE(json_extract(metadata, '$.name'), unit_id) AS name,
    'sheet' AS kind, created_at_ms AS createdAt, rowid AS seq
  FROM collaboration_units
  WHERE type = :sheetType AND deleted_status IS NULL
  UNION ALL
  SELECT id, name, 'html' AS kind, created_at_ms AS createdAt, rowid AS seq FROM html_views
`;

export class FileCatalog {
  private readonly _database: Database.Database;
  private readonly _list: Database.Statement;
  private readonly _get: Database.Statement;
  private readonly _getHtml: Database.Statement;
  private readonly _insertHtml: Database.Statement;
  private readonly _updateHtml: Database.Statement;

  /** Open after the collaboration Database Adapter, which creates the Unit table. */
  constructor(
    filename: string,
    private readonly _service: IUniverCollabService,
    private readonly _context: CollabContext,
  ) {
    this._database = new Database(filename, { fileMustExist: true, timeout: 5000 });
    try {
      this._database.exec(`CREATE TABLE IF NOT EXISTS html_views (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, html TEXT NOT NULL, created_at_ms INTEGER NOT NULL
      )`);
      // Files created in the same millisecond keep their insertion order.
      this._list = this._database.prepare(`${FILES_QUERY} ORDER BY createdAt, kind DESC, seq`);
      this._get = this._database.prepare(`SELECT * FROM (${FILES_QUERY}) WHERE id = :id`);
      this._getHtml = this._database.prepare("SELECT html FROM html_views WHERE id = ?");
      this._insertHtml = this._database.prepare(
        "INSERT OR IGNORE INTO html_views (id, name, html, created_at_ms) VALUES (?, ?, ?, ?)",
      );
      this._updateHtml = this._database.prepare("UPDATE html_views SET html = ? WHERE id = ?");
    } catch (error) {
      this._database.close();
      throw error;
    }
  }

  list(): ExampleFile[] {
    return (this._list.all({ sheetType: UniverType.UNIVER_SHEET }) as Row[]).map(toFile);
  }

  get(id: string): ExampleFile | null {
    const row = this._get.get({ sheetType: UniverType.UNIVER_SHEET, id }) as Row | undefined;
    return row ? toFile(row) : null;
  }

  /** Creates the Sheet, or keeps an existing Unit with the same ID unchanged. */
  async createSheet(id: string, name: string, data: IWorkbookData): Promise<ExampleFile> {
    await this._service.createUnitFromData(
      { type: UniverType.UNIVER_SHEET, data, metadata: { name } },
      this._context,
    );
    return this.get(id)!;
  }

  /** Creates the HTML view, or keeps an existing view with the same ID unchanged. */
  createHtml(id: string, name: string, html: string): ExampleFile {
    this._insertHtml.run(id, name, html, Date.now());
    return this.get(id)!;
  }

  getHtml(id: string): string | null {
    return (this._getHtml.get(id) as { html: string } | undefined)?.html ?? null;
  }

  saveHtml(id: string, html: string): boolean {
    return this._updateHtml.run(html, id).changes === 1;
  }

  dispose(): void {
    if (this._database.open) this._database.close();
  }
}

function toFile({ id, name, kind }: Row): ExampleFile {
  return kind === "sheet" ? { id, name, kind, unitId: id } : { id, name, kind };
}
