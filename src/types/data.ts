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
  | 'NeedsManualUTMInput' // General case, could be just zone, or E/N + zone
  | 'PendingUTMInput' // Specifically UTM Zone is needed, E/N are presumed present
  | 'NeedsENAndUTMInput'; // Specifically Easting, Northing, and UTM Zone are needed

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
  requiresUtmInput?: boolean; // True if this specific log entry is about needing UTM (zone, or E/N + zone)
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
  __needsUTMZoneInput__?: boolean; // Specifically needs UTM zone, E/N assumed present or not relevant
  __needsENAndUTMInput__?: boolean; // Needs Easting, Northing, and UTM zone
  __utmZoneProvided__?: string; // e.g. "43N" or custom proj string
  __identifierKey__?: string | null; // The key used as the primary identifier (e.g., "PSM Station Number")
}

export type ProcessedJsonArray = ProcessedRow[];


export interface UTMZone {
  zone: number;
  hemisphere: 'N' | 'S';
}

export interface UTMModalInputData {
  utmInput: UTMZone | string; // UTMZone object or full proj string
  easting?: string;
  northing?: string;
}

export interface RowForUTMInput {
  row: ProcessedRow;
  rowIndexInProcessedJson: number; // index in the currently displayed processedJson
  // Add a mode to distinguish if E/N fields are also required by the modal
  requiresENInput?: boolean; 
}

export interface ApplyTransformationsResult {
  transformedData: ProcessedJsonArray;
  transformationLog: TransformationLogEntry[];
}

export interface IslandToUrlMap {
  [islandName: string]: string;
}
