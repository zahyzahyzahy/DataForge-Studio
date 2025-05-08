// @ts-ignore
import proj4 from 'proj4';
import type { DataRow } from './data-transformer'; // Self-import for type, will be defined below
import type { TransformationLogEntry, TransformationStatus, UTMZone, ProcessedJsonArray, ProcessedRow, ApplyTransformationsResult } from '@/types/data';


// Define common UTM projection strings (add more as needed)
const utmProjections: Record<string, string> = {
  '43N': "+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs +hemisphere=N",
  '43S': "+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs +hemisphere=S",
  // Add other common zones if necessary, e.g.
  '42N': "+proj=utm +zone=42 +datum=WGS84 +units=m +no_defs +hemisphere=N",
  '44N': "+proj=utm +zone=44 +datum=WGS84 +units=m +no_defs +hemisphere=N",
};
const wgs84 = "+proj=longlat +datum=WGS84 +no_defs";

export interface Coordinate {
  lat: number;
  lon: number;
}

export type DataRow = Record<string, any>; // Original simple data row type

const psmNumberKeys = ["PSM Station Number", "PSM_Station_Number", "PSMNo", "PSM_No", "ID", "psm_id"];


function getRowIdentifier(row: DataRow, rowIndex: number, fileName: string): string {
  for (const key of psmNumberKeys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return String(row[key]);
    }
  }
  return `${fileName} Original Row ${rowIndex + 1}`;
}


function createLogEntry(
  fileId: string,
  originalRowIndex: number,
  rowIdentifier: string,
  field: string,
  originalValue: any,
  transformedValue: any,
  status: TransformationStatus,
  details: string
): TransformationLogEntry {
  return {
    fileId,
    originalRowIndex,
    rowIdentifier,
    field,
    originalValue,
    transformedValue,
    status,
    details,
    isError: status === 'Error',
    requiresUtmInput: status === 'NeedsManualUTMInput' || status === 'PendingUTMInput',
  };
}


function utmToLatLonInternal(easting: number, northing: number, sourceProjection: string): Coordinate | null {
  try {
    if (isNaN(easting) || isNaN(northing)) return null;
    if (!proj4.defs(sourceProjection)) {
        // Attempt to define it if it's a common pattern like EPSG
        if (sourceProjection.toUpperCase().startsWith('EPSG:')) {
            // proj4 might not have all EPSG codes built-in. This is a placeholder.
            // For a robust solution, ensure proj4 is initialized with necessary EPSG codes
            // or use a library that fetches them.
            console.warn(`Proj4 definition for ${sourceProjection} not found. Conversion might fail.`);
        } else {
            // If it's not EPSG and not predefined, it might be a raw proj string
             try {
                proj4.defs('CUSTOM_SOURCE', sourceProjection);
                sourceProjection = 'CUSTOM_SOURCE';
            } catch (defError) {
                 console.error(`Failed to define custom proj4 string: ${sourceProjection}`, defError);
                return null;
            }
        }
    }
    const [lon, lat] = proj4(sourceProjection, wgs84, [easting, northing]);
    return { lat, lon };
  } catch (e) {
    console.error("UTM Conversion Error:", e, `Using projection: ${sourceProjection}`);
    return null;
  }
}


function parseDMStoDD(dmsStr: string | number | null | undefined, fieldName: string, log: TransformationLogEntry[], fileId: string, originalRowIndex: number, rowIdentifier: string): number | null {
  const originalValue = dmsStr;
  if (dmsStr === null || dmsStr === undefined || String(dmsStr).trim() === '' || String(dmsStr).trim() === '-') {
    log.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, fieldName, originalValue, null, 'Error', `Empty or placeholder DMS value: '${dmsStr}'`));
    return null;
  }
  if (typeof dmsStr === 'number') {
     log.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, fieldName, originalValue, dmsStr, 'Unchanged', 'Value is already a number.'));
    return dmsStr;
  }

  let str = String(dmsStr).trim().toUpperCase();
  const directionMatch = str.match(/[NSWEXYZ]$/); // X,Y,Z for potential other formats. E is East.
  const direction = directionMatch ? directionMatch[0] : null;
  
  if (direction) {
    str = str.slice(0, -1);
  }

  str = str.replace(/"/g, '').replace(/”/g, '').replace(/'/g, ' ').replace(/’/g, ' ').replace(/°/g, ' ');
  str = str.replace(/:/g, ' ').trim();
  
  const parts = str.split(/\s+/).map(p => p.trim()).filter(p => p !== '');

  if (parts.length === 0) {
    log.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, fieldName, originalValue, null, 'Error', `DMS string is empty after normalization. Original: '${dmsStr}'`));
    return null;
  }
  
  const deg = parseFloat(parts[0]);
  const min = parts.length > 1 ? parseFloat(parts[1]) : 0;
  const sec = parts.length > 2 ? parseFloat(parts[2]) : 0;

  if (isNaN(deg)) {
    log.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, fieldName, originalValue, null, 'Error', `Degree part is not a number or missing. Parsed: '${parts[0]}'. Original: '${dmsStr}'`));
    return null;
  }
   if (parts.length > 1 && isNaN(min)) {
    log.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, fieldName, originalValue, null, 'Error', `Minute part is not a number. Parsed: '${parts[1]}'. Original: '${dmsStr}'`));
    return null;
  }
  if (parts.length > 2 && isNaN(sec)) {
    log.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, fieldName, originalValue, null, 'Error', `Second part is not a number. Parsed: '${parts[2]}'. Original: '${dmsStr}'`));
    return null;
  }


  let decimal = Math.abs(deg) + min / 60 + sec / 3600;

  if (deg < 0 || direction === 'S' || direction === 'W') {
    decimal *= -1;
  }
  
  if (isNaN(decimal)) {
    log.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, fieldName, originalValue, null, 'Error', `Resulting decimal is NaN. Original: '${dmsStr}'`));
    return null;
  }

  log.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, fieldName, originalValue, decimal, 'Transformed', 'DMS/String to DD'));
  return decimal;
}


export function applyIntelligentTransformations(
  inputFiles: { fileId: string, fileName: string, data: DataRow[] }[],
  utmZoneOverrides: Map<string, UTMZone | string> = new Map() // Key: `${fileId}-${originalRowIndex}`, Value: UTMZone object or full proj string
): ApplyTransformationsResult {
  
  const transformationLog: TransformationLogEntry[] = [];
  const processedDataArray: ProcessedJsonArray = [];

  const islandUrlMap: Record<string, string> = {};

  // First pass for URL standardization (if Island and URL columns exist)
  // This helps ensure that if a URL is found for an island, it's consistently used.
  for (const { fileId, fileName, data } of inputFiles) {
    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    if (headers.includes('Island') && headers.includes('URL')) {
        data.forEach(originalRow => {
            const island = originalRow['Island'];
            const url = originalRow['URL'];
            if (island && typeof island === 'string' && island.trim() !== '' && 
                url && typeof url === 'string' && url.trim() !== '' && !islandUrlMap[island.trim()]) {
              islandUrlMap[island.trim()] = url.trim();
            }
        });
    }
  }


  for (const { fileId, fileName, data } of inputFiles) {
    const headers = data.length > 0 ? Object.keys(data[0]) : [];

    data.forEach((originalRow, originalRowIndex) => {
      const rowIdentifier = getRowIdentifier(originalRow, originalRowIndex, fileName);
      const uniqueRowId = `${fileId}-${originalRowIndex}`;

      const newRow: ProcessedRow = {
        ...originalRow,
        __id__: uniqueRowId,
        __originalRowIndex__: originalRowIndex,
        __fileId__: fileId,
        __fileName__: fileName,
        __rowIdentifier__: rowIdentifier,
      };

      // DMS to DD for Lat/Long
      if (headers.includes('Lat')) {
        const originalLat = newRow['Lat'];
        const decimalLat = parseDMStoDD(originalLat, 'Lat', transformationLog, fileId, originalRowIndex, rowIdentifier);
        if (decimalLat !== null) newRow['Lat'] = decimalLat;
        else if (originalLat === null || String(originalLat).trim() === '' || String(originalLat).trim() === '-') newRow['Lat'] = null; // Keep null if it was null/empty and failed parsing
      }
      if (headers.includes('Long')) {
        const originalLong = newRow['Long'];
        const decimalLong = parseDMStoDD(originalLong, 'Long', transformationLog, fileId, originalRowIndex, rowIdentifier);
        if (decimalLong !== null) newRow['Long'] = decimalLong;
         else if (originalLong === null || String(originalLong).trim() === '' || String(originalLong).trim() === '-') newRow['Long'] = null;
      }
      
      // UTM to Lat/Lon if Lat/Long are missing/invalid and Easting/Northing exist
      const latMissing = newRow['Lat'] === null || newRow['Lat'] === undefined || String(newRow['Lat']).trim() === '' || isNaN(Number(newRow['Lat']));
      const longMissing = newRow['Long'] === null || newRow['Long'] === undefined || String(newRow['Long']).trim() === '' || isNaN(Number(newRow['Long']));
      
      const eastingKey = headers.find(h => h.toLowerCase() === 'easting/m' || h.toLowerCase() === 'easting');
      const northingKey = headers.find(h => h.toLowerCase() === 'northing/m' || h.toLowerCase() === 'northing');

      if ((latMissing || longMissing) && eastingKey && northingKey && newRow[eastingKey] !== undefined && newRow[northingKey] !== undefined) {
        const easting = parseFloat(String(newRow[eastingKey]).replace(/,/g, ''));
        const northing = parseFloat(String(newRow[northingKey]).replace(/,/g, ''));

        if (!isNaN(easting) && !isNaN(northing)) {
          const override = utmZoneOverrides.get(uniqueRowId);
          let sourceProjection: string | null = null;

          if (override) {
            if (typeof override === 'string') {
              sourceProjection = override;
               newRow.__utmZoneProvided__ = "Custom";
            } else {
              sourceProjection = utmProjections[`${override.zone}${override.hemisphere}`] || `+proj=utm +zone=${override.zone} +datum=WGS84 +units=m +no_defs +hemisphere=${override.hemisphere}`;
              newRow.__utmZoneProvided__ = `${override.zone}${override.hemisphere}`;
            }
          } else {
            // Default or prompt logic
            // For now, if no override, flag for input
            newRow.__needsUTMInput__ = true;
            transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'Lat, Long', `E: ${newRow[eastingKey]}, N: ${newRow[northingKey]}`, null, 'PendingUTMInput', 'Lat/Long missing, Easting/Northing present. UTM zone needed.'));
          }
          
          if (sourceProjection) {
            const coords = utmToLatLonInternal(easting, northing, sourceProjection);
            if (coords) {
              if (latMissing) {
                newRow['Lat'] = coords.lat;
                transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'Lat', originalRow['Lat'] ?? null, coords.lat, 'Filled', `From UTM E/N (Zone: ${newRow.__utmZoneProvided__ || 'User-Provided'})`));
              }
              if (longMissing) {
                newRow['Long'] = coords.lon;
                transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'Long', originalRow['Long'] ?? null, coords.lon, 'Filled', `From UTM E/N (Zone: ${newRow.__utmZoneProvided__ || 'User-Provided'})`));
              }
              newRow.__needsUTMInput__ = false; // UTM successfully used
            } else {
                 transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'Lat, Long', `E: ${newRow[eastingKey]}, N: ${newRow[northingKey]}`, null, 'Error', `UTM to Lat/Lon conversion failed with zone ${newRow.__utmZoneProvided__ || 'User-Provided'}.`));
                 newRow.__needsUTMInput__ = true; // Still needs input if conversion failed
            }
          }
        } else {
           transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'Lat, Long', `E: ${newRow[eastingKey]}, N: ${newRow[northingKey]}`, null, 'Error', 'Easting/Northing are not valid numbers.'));
        }
      } else if ((latMissing || longMissing) && (!eastingKey || newRow[eastingKey] === undefined || !northingKey || newRow[northingKey] === undefined)) {
        // Lat/Long missing AND Easting/Northing missing or not valid
        newRow.__needsUTMInput__ = true; // Potentially, if user *could* provide E/N and zone
        transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'Lat, Long', `Lat: ${newRow['Lat']}, Long: ${newRow['Long']}`, null, 'NeedsManualUTMInput', 'Lat/Long and Easting/Northing are missing or invalid. Requires UTM zone and E/N values for conversion.'));
      }


      // URL Standardization
      if (headers.includes('Island') && headers.includes('URL')) {
        const islandKey = 'Island'; // Assuming 'Island' is the column name
        const island = newRow[islandKey] ? String(newRow[islandKey]).trim() : null;
        const originalUrl = newRow['URL'];

        if (island && (originalUrl === null || originalUrl === undefined || String(originalUrl).trim() === '')) {
          if (islandUrlMap[island]) {
            newRow['URL'] = islandUrlMap[island];
            transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'URL', originalUrl, newRow['URL'], 'Filled', `Standardized by Island '${island}'`));
          } else {
            transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'URL', originalUrl, originalUrl, 'Unchanged', `No standard URL found for Island '${island}' and URL is missing.`));
          }
        } else if (island && originalUrl && islandUrlMap[island] && String(originalUrl).trim() !== islandUrlMap[island]) {
            // Optionally, log if an existing URL differs from the standard one, but don't change it automatically
            // transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'URL', originalUrl, originalUrl, 'Unchanged', `Existing URL differs from standard for Island '${island}'. Kept original.`));
        } else if (originalUrl) {
             transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'URL', originalUrl, originalUrl, 'Unchanged', 'URL present or island missing.'));
        }
      }
      
      // Add log entries for unchanged fields for completeness in validation table if desired.
      // This can be extensive, so enable cautiously or make it optional.
      // For now, focusing on changed/error fields.

      processedDataArray.push(newRow);
    });
  }
  
  // Ensure all fields from original data are in the log for rows that had any transformation or error
  const finalLog: TransformationLogEntry[] = [];
  const loggedEntries = new Set<string>(); // `${fileId}-${originalRowIndex}-${field}`

  transformationLog.forEach(log => {
    finalLog.push(log);
    loggedEntries.add(`${log.fileId}-${log.originalRowIndex}-${log.field}`);
     // If Lat, Long was logged as one entry, mark both fields
    if (log.field === 'Lat, Long') {
        loggedEntries.add(`${log.fileId}-${log.originalRowIndex}-Lat`);
        loggedEntries.add(`${log.fileId}-${log.originalRowIndex}-Long`);
    }
  });
  
  // Add "Unchanged" log entries for fields that were not explicitly transformed or errored
  // but are part of rows that had other changes, to provide a full picture for validation.
  processedDataArray.forEach(processedRow => {
    const originalFile = inputFiles.find(f => f.fileId === processedRow.__fileId__);
    if (!originalFile) return;
    const originalDataRow = originalFile.data[processedRow.__originalRowIndex__];
    if (!originalDataRow) return;

    Object.keys(originalDataRow).forEach(fieldKey => {
      if (!loggedEntries.has(`${processedRow.__fileId__}-${processedRow.__originalRowIndex__}-${fieldKey}`)) {
        // Check if the value actually changed (e.g. type coercion by PapaParse)
        // This comparison can be tricky due to types (e.g. "5" vs 5)
        const originalVal = originalDataRow[fieldKey];
        const processedVal = processedRow[fieldKey];
        let status: TransformationStatus = 'Unchanged';
        let details = 'No transformation applied or value remained effectively same.';

         // UTM Conversion: New Lat/Long values after UTM transformation should be included
        if ((fieldKey === 'Lat' || fieldKey === 'Long') && processedRow.__utmZoneProvided__) {
            status = 'Filled'; // UTM to Lat/Long
            details = `From UTM E/N (Zone: ${processedRow.__utmZoneProvided__ || 'User-Provided'})`;
        }
        
        // Basic check for type changes for numeric-like strings
        else if (typeof originalVal === 'string' && typeof processedVal === 'number' && parseFloat(originalVal) === processedVal) {
            status = 'Transformed'; // Or 'Coerced'
            details = 'Type coerced from string to number during initial parse.';
        } else if (originalVal !== processedVal && !(Number.isNaN(originalVal) && Number.isNaN(processedVal))) {
            // If they are different and not both NaN, it might indicate an implicit change.
            // This could be noisy, so refine if necessary.
            // For now, let's stick to 'Unchanged' unless explicitly handled.
        }


        finalLog.push(createLogEntry(
          processedRow.__fileId__,
          processedRow.__originalRowIndex__,
          processedRow.__rowIdentifier__,
          fieldKey,
          originalDataRow[fieldKey],
          processedRow[fieldKey],
          status,
          details
        ));
      }
    });
  });


  return {
    transformedData: processedDataArray,
    transformationLog: finalLog.sort((a,b) => { // Sort for consistent display
        if(a.fileId !== b.fileId) return a.fileId.localeCompare(b.fileId);
        if(a.originalRowIndex !== b.originalRowIndex) return a.originalRowIndex - b.originalRowIndex;
        return a.field.localeCompare(b.field);
    }),
  };
}

export function getRelevantTransformationColumns(): string[] {
  return ['Lat', 'Long', 'Easting/m', 'Easting', 'Northing/m', 'Northing', 'Island', 'URL', ...psmNumberKeys];
}


// Helper for client-side proj4 usage if needed by UTMInputModal or similar, though applyIntelligentTransformations is the main entry point.
export { utmToLatLonInternal as convertUTMToLatLonWithProj4 };
