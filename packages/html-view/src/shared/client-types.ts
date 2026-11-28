import type {
  BindingEngine,
  CellState,
  CellValue,
  InsertRowsWithValuesParams,
  RangeReference,
  RangeState,
} from "@univerkit/binding-engine";
import type { HtmlCellReference } from "@univerkit/html-view-parser";

type Subscription = ReturnType<BindingEngine["subscribeCell"]>;
type CollaborationStatus = ReturnType<BindingEngine["getCollaborationStatus"]>;
export interface HtmlRangeReference extends RangeReference {
  readonly unitId: string;
}

export interface HtmlInsertRowsWithValuesParams extends InsertRowsWithValuesParams {
  readonly unitId: string;
}

export interface ElementBindingClient {
  subscribeCellById(elementId: string, listener: (state: CellState) => void): Promise<Subscription>;
  subscribeRangeById(
    elementId: string,
    listener: (state: RangeState) => void,
  ): Promise<Subscription>;
}
// Internal data access for the DOM adapter; never exposed on window.univerBinding.
export interface BindingDataClient extends Omit<BindingEngineClient, keyof ElementBindingClient> {
  subscribeRange(
    reference: HtmlRangeReference,
    listener: (state: RangeState) => void,
  ): Promise<Subscription>;
  subscribeCell(
    reference: HtmlCellReference,
    listener: (state: CellState) => void,
  ): Promise<Subscription>;
}
export interface BindingEngineClient extends ElementBindingClient {
  getRangeState(reference: HtmlRangeReference): Promise<RangeState>;
  getCellState(reference: HtmlCellReference): Promise<CellState>;
  setCellValue(reference: HtmlCellReference, value: CellValue): Promise<void>;
  insertRowsWithValues(params: HtmlInsertRowsWithValuesParams): Promise<void>;
  getCollaborationStatus(unitId: string): Promise<CollaborationStatus>;
  subscribeCollaborationStatus(
    unitId: string,
    listener: (status: CollaborationStatus) => void,
  ): Promise<Subscription>;
  flush(): Promise<void>;
}
