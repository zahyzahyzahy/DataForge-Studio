// @ts-ignore
import proj4 from 'proj4';
import type { DataRow } from './data-transformer'; // Self-import for type, will be defined below
import type { TransformationLogEntry, TransformationStatus, UTMZone, ProcessedJsonArray, ProcessedRow, ApplyTransformationsResult, IslandToUrlMap } from '@/types/data';


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


function getRowIdentifierDetails(row: DataRow, rowIndex: number, fileName: string): { identifier: string, keyUsed: string | null } {
  for (const key of psmNumberKeys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return { identifier: String(row[key]), keyUsed: key };
    }
  }
  return { identifier: `${fileName} Original Row ${rowIndex + 1}`, keyUsed: null };
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
    requiresUtmInput: status === 'NeedsManualUTMInput' || status === 'PendingUTMInput' || status === 'NeedsENAndUTMInput',
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
  utmZoneOverrides: Map<string, UTMZone | string> = new Map(), // Key: `${fileId}-${originalRowIndex}`, Value: UTMZone object or full proj string
  userProvidedIslandUrls: IslandToUrlMap = {}
): ApplyTransformationsResult {
  
  const transformationLog: TransformationLogEntry[] = [];
  const processedDataArray: ProcessedJsonArray = [];

  const islandUrlMap: IslandToUrlMap = {...userProvidedIslandUrls};

  // First pass for URL standardization (if Island and URL columns exist)
  // This helps ensure that if a URL is found for an island, it's consistently used.
  // User-provided URLs take precedence.
  for (const { data } of inputFiles) {
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
      const { identifier: rowIdentifier, keyUsed: identifierKey } = getRowIdentifierDetails(originalRow, originalRowIndex, fileName);
      const uniqueRowId = `${fileId}-${originalRowIndex}`;

      const newRow: ProcessedRow = {
        ...originalRow,
        __id__: uniqueRowId,
        __originalRowIndex__: originalRowIndex,
        __fileId__: fileId,
        __fileName__: fileName,
        __rowIdentifier__: rowIdentifier,
        __identifierKey__: identifierKey,
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
      
      // UTM to Lat/Lon if Lat/Long are missing/invalid and Easting/Northing exist or can be provided
      let latMissing = newRow['Lat'] === null || newRow['Lat'] === undefined || String(newRow['Lat']).trim() === '' || isNaN(Number(newRow['Lat']));
      let longMissing = newRow['Long'] === null || newRow['Long'] === undefined || String(newRow['Long']).trim() === '' || isNaN(Number(newRow['Long']));
      
      const eastingKey = headers.find(h => h.toLowerCase() === 'easting/m' || h.toLowerCase() === 'easting');
      const northingKey = headers.find(h => h.toLowerCase() === 'northing/m' || h.toLowerCase() === 'northing');

      const eastingValue = eastingKey ? newRow[eastingKey] : undefined;
      const northingValue = northingKey ? newRow[northingKey] : undefined;

      const eastingPresentAndValid = eastingKey && eastingValue !== undefined && eastingValue !== null && !isNaN(parseFloat(String(eastingValue).replace(/,/g, '')));
      const northingPresentAndValid = northingKey && northingValue !== undefined && northingValue !== null && !isNaN(parseFloat(String(northingValue).replace(/,/g, '')));


      if (latMissing || longMissing) {
        if (eastingPresentAndValid && northingPresentAndValid) {
          const easting = parseFloat(String(eastingValue).replace(/,/g, ''));
          const northing = parseFloat(String(northingValue).replace(/,/g, ''));
          
          const override = utmZoneOverrides.get(uniqueRowId);
          let sourceProjection: string | null = null;

          if (override) {
            if (typeof override === 'string') {
              sourceProjection = override;
              newRow.__utmZoneProvided__ = "Custom"; // Or parse the string for zone/hemisphere if possible
            } else {
              sourceProjection = utmProjections[`${override.zone}${override.hemisphere}`] || `+proj=utm +zone=${override.zone} +datum=WGS84 +units=m +no_defs +hemisphere=${override.hemisphere}`;
              newRow.__utmZoneProvided__ = `${override.zone}${override.hemisphere}`;
            }
          } else {
            newRow.__needsUTMZoneInput__ = true; // E/N are present, just need zone
            transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'Lat, Long', `E: ${eastingValue}, N: ${northingValue}`, null, 'PendingUTMInput', 'Lat/Long missing. Easting/Northing present. UTM zone needed.'));
          }
          
          if (sourceProjection) {
            const coords = utmToLatLonInternal(easting, northing, sourceProjection);
            if (coords) {
              if (latMissing) {
                newRow['Lat'] = coords.lat;
                transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'Lat', originalRow['Lat'] ?? null, coords.lat, 'Filled', `From UTM E/N (Zone: ${newRow.__utmZoneProvided__ || 'User-Provided'})`));
                latMissing = false; // Update status
              }
              if (longMissing) {
                newRow['Long'] = coords.lon;
                transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'Long', originalRow['Long'] ?? null, coords.lon, 'Filled', `From UTM E/N (Zone: ${newRow.__utmZoneProvided__ || 'User-Provided'})`));
                longMissing = false; // Update status
              }
              newRow.__needsUTMZoneInput__ = false; 
              newRow.__needsENAndUTMInput__ = false;
            } else {
                 transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'Lat, Long', `E: ${eastingValue}, N: ${northingValue}`, null, 'Error', `UTM to Lat/Lon conversion failed with zone ${newRow.__utmZoneProvided__ || 'User-Provided'}.`));
                 newRow.__needsUTMZoneInput__ = !override; // Still needs input if conversion failed AND no override was attempted
                 newRow.__needsENAndUTMInput__ = false; // E/N were present, issue is zone/conversion
            }
          }
        } else { // Lat/Long missing AND Easting/Northing are missing or invalid
            newRow.__needsENAndUTMInput__ = true;
            transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'Lat, Long', `Lat: ${newRow['Lat']}, Long: ${newRow['Long']}, E: ${eastingValue}, N: ${northingValue}`, null, 'NeedsENAndUTMInput', 'Lat/Long missing and Easting/Northing missing or invalid. Requires E/N values and UTM zone.'));
        }
      }


      // URL Standardization (takes into account userProvidedIslandUrls via islandUrlMap initialization)
      if (headers.includes('Island') && headers.includes('URL')) {
        const islandKey = 'Island';
        const island = newRow[islandKey] ? String(newRow[islandKey]).trim() : null;
        const originalUrl = newRow['URL'];

        if (island && (originalUrl === null || originalUrl === undefined || String(originalUrl).trim() === '')) {
          if (islandUrlMap[island]) {
            newRow['URL'] = islandUrlMap[island];
            transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'URL', originalUrl, newRow['URL'], 'Filled', `Standardized by Island '${island}'`));
          } else {
            // URL still missing after initial pass and user inputs
            transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'URL', originalUrl, originalUrl, 'NeedsManualUTMInput', `URL missing for Island '${island}'. User input may be required.`));
            // Note: 'NeedsManualUTMInput' is a bit of a misnomer here, but it flags for user attention. Could create a 'NeedsURLInput' status.
            // For now, it groups with other manual input needs.
            newRow.__requiresURLInputForIsland__ = island; // Custom flag for UI
          }
        } else if (island && originalUrl && islandUrlMap[island] && String(originalUrl).trim() !== islandUrlMap[island]) {
            // Log if an existing URL differs, but typically don't overwrite if user provided it or it was there initially.
            // transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'URL', originalUrl, originalUrl, 'Unchanged', `Existing URL for Island '${island}' differs from a potentially found standard. Kept original.`));
        } else if (originalUrl) {
             transformationLog.push(createLogEntry(fileId, originalRowIndex, rowIdentifier, 'URL', originalUrl, originalUrl, 'Unchanged', 'URL present or island missing/no standard found.'));
        }
      }
      
      processedDataArray.push(newRow);
    });
  }
  
  const finalLog: TransformationLogEntry[] = [];
  const loggedEntries = new Set<string>(); // `${fileId}-${originalRowIndex}-${field}`

  transformationLog.forEach(log => {
    finalLog.push(log);
    const key = `${log.fileId}-${log.originalRowIndex}-${log.field}`;
    loggedEntries.add(key);
    if (log.field === 'Lat, Long') { // If a combined log entry was made
        loggedEntries.add(`${log.fileId}-${log.originalRowIndex}-Lat`);
        loggedEntries.add(`${log.fileId}-${log.originalRowIndex}-Long`);
    }
  });
  
  processedDataArray.forEach(processedRow => {
    const originalFile = inputFiles.find(f => f.fileId === processedRow.__fileId__);
    if (!originalFile) return;
    const originalDataRow = originalFile.data[processedRow.__originalRowIndex__];
    if (!originalDataRow) return;

    Object.keys(originalDataRow).forEach(fieldKey => {
      if (!loggedEntries.has(`${processedRow.__fileId__}-${processedRow.__originalRowIndex__}-${fieldKey}`)) {
        const originalVal = originalDataRow[fieldKey];
        const processedVal = processedRow[fieldKey];
        let status: TransformationStatus = 'Unchanged';
        let details = 'No explicit transformation applied. Value may have been type-coerced on load.';
        
        // Check for type coercion during initial CSV parse
        if (typeof originalVal === 'string' && typeof processedVal === 'number' && String(parseFloat(originalVal)) === String(processedVal)) {
            status = 'Transformed'; 
            details = 'Type coerced from string to number during initial CSV parse.';
        } else if (originalVal !== processedVal && !(Number.isNaN(originalVal) && Number.isNaN(processedVal)) && !(originalVal === null && processedVal === undefined) && !(originalVal === undefined && processedVal === null) ) {
           // This case means the value changed by some means not directly logged yet.
           // For example, if an empty string became null due to dynamicTyping.
           // For more precise logging, Papaparse's dynamicTyping effects might need to be logged earlier or inferred.
           // Keeping as 'Unchanged' with generic detail to avoid over-logging minor parsing nuances as 'Transformed'.
        }

        finalLog.push(createLogEntry(
          processedRow.__fileId__,
          processedRow.__originalRowIndex__,
          processedRow.__rowIdentifier__,
          fieldKey,
          originalVal, // Use originalDataRow[fieldKey] for original value
          processedVal, // Use processedRow[fieldKey] for transformed value
          status,
          details
        ));
      }
    });
  });


  return {
    transformedData: processedDataArray,
    transformationLog: finalLog.sort((a,b) => { 
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
