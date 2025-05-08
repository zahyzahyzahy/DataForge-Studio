import type { JsonArray, JsonObject } from '@/lib/json-utils';

export interface FileWithData {
  file: File;
  data: JsonArray | JsonObject | null; // Original parsed data
  id: string; // Unique ID for the file instance
  fileName: string;
}

export type TransformationStatus = 
  | 'Transformed' 
  | 'Filled' 
  | 'Error' 
  | 'Unchanged' 
  | 'NeedsManualUTMInput'
  | 'PendingUTMInput';

export interface TransformationLogEntry {
  fileId: string;
  originalRowIndex: number;
  rowIdentifier: string; // PSM No. or "FileX Original Row Y"
  field: string;
  originalValue: any;
  transformedValue: any;
  status: TransformationStatus;
  details: string;
  isError: boolean; // Simplified flag for quick filtering
  requiresUtmInput?: boolean; // True if this specific log entry is about needing UTM
  utmProvided?: boolean; // True if UTM has been provided for this row
}

export interface TransformationError extends TransformationLogEntry {
  // Specific error properties can be added if needed, inherits from TransformationLogEntry
}


export interface ProcessedRow extends JsonObject {
  __id__: string; // Unique ID for the row across all files: `${fileId}-${originalRowIndex}`
  __originalRowIndex__: number;
  __fileId__: string;
  __fileName__: string;
  __rowIdentifier__: string; // Display identifier (PSM No. or "FileX Original Row Y")
  __isDeselected__?: boolean;
  __needsUTMInput__?: boolean;
  __utmZoneProvided__?: string; // e.g. "43N"
}

export type ProcessedJsonArray = ProcessedRow[];


export interface UTMZone {
  zone: number;
  hemisphere: 'N' | 'S';
}

export interface RowForUTMInput {
  row: ProcessedRow;
   rowIndexInProcessedJson: number; // index in the currently displayed processedJson
}

export interface ApplyTransformationsResult {
  transformedData: ProcessedJsonArray;
  transformationLog: TransformationLogEntry[];
}
