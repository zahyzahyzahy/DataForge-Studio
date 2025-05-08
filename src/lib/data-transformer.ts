// @ts-ignore
import proj4 from 'proj4';

// Define UTM Zone 43N to WGS84 (lat/long) transformer
// EPSG:32643 -> UTM Zone 43N
// EPSG:4326 -> WGS84
const utmZone43N = "+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs";
const wgs84 = "+proj=longlat +datum=WGS84 +no_defs";

export interface Coordinate {
  lat: number;
  lon: number;
}

export type DataRow = Record<string, any>;

/**
 * Convert UTM Zone 43N to WGS84 latitude/longitude.
 */
function utmToLatLon(easting: number, northing: number): Coordinate | null {
  try {
    if (isNaN(easting) || isNaN(northing)) return null;
    const [lon, lat] = proj4(utmZone43N, wgs84, [easting, northing]);
    return { lat, lon };
  } catch (e) {
    console.error("UTM Conversion Error:", e);
    return null;
  }
}

/**
 * Convert DMS string to Decimal Degrees (DD).
 */
function parseDMS(dmsStr: string | number | null | undefined): number | null {
  if (dmsStr === null || dmsStr === undefined) return null;
  if (typeof dmsStr === 'number') return dmsStr;
  
  let str = String(dmsStr).trim().replace(/"/g, '').replace(/”/g, ''); // Normalize

  try {
    // Handle '4:26:17.74208N' format
    if (str.includes(':')) {
      const direction = str.slice(-1).toUpperCase();
      str = str.replace(/[NSWEnswe]/g, ''); // Remove direction characters
      const parts = str.split(':');
      if (parts.length !== 3) return null;

      const deg = parseFloat(parts[0]);
      const min = parseFloat(parts[1]);
      const sec = parseFloat(parts[2]);

      if (isNaN(deg) || isNaN(min) || isNaN(sec)) return null;

      let decimal = deg + min / 60 + sec / 3600;
      if (direction === 'S' || direction === 'W') {
        decimal *= -1;
      }
      return decimal;
    }

    // Handle '4°00'51.53"N' format
    str = str.replace(/°/g, ' ').replace(/'/g, ' ').replace(/’/g, ' ').replace(/"/g, ' ').trim();
    const parts = str.split(/\s+/);
    if (parts.length < 3) return null; // Must have at least D, M, S. Direction is optional if already negative for S/W.

    const deg = parseFloat(parts[0]);
    const min = parseFloat(parts[1]);
    const sec = parseFloat(parts[2]);
    const direction = parts[3] ? parts[3].toUpperCase() : '';

    if (isNaN(deg) || isNaN(min) || isNaN(sec)) return null;

    let decimal = deg + min / 60 + sec / 3600;
    if (direction === 'S' || direction === 'W') {
      decimal *= -1;
    }
    return decimal;
  } catch (e) {
    console.error("DMS Parsing Error:", e, "Input:", dmsStr);
    return null;
  }
}

/**
 * Convert all DMS-formatted Lat/Long to Decimal Degrees.
 */
function normalizeLatLong(data: DataRow[]): DataRow[] {
  return data.map(row => {
    const newRow = { ...row };
    if ('Lat' in newRow) {
      const lat = parseDMS(newRow['Lat']);
      if (lat !== null) newRow['Lat'] = lat;
    }
    if ('Long' in newRow) {
      const lon = parseDMS(newRow['Long']);
      if (lon !== null) newRow['Long'] = lon;
    }
    // Ensure numeric types after parsing
    if (typeof newRow['Lat'] === 'string') newRow['Lat'] = parseFloat(newRow['Lat']);
    if (typeof newRow['Long'] === 'string') newRow['Long'] = parseFloat(newRow['Long']);
    return newRow;
  });
}

/**
 * Fill missing Lat/Long values where Easting/Northing are available.
 */
function fillMissingLatLon(data: DataRow[]): DataRow[] {
  return data.map(row => {
    const newRow = { ...row };
    const latMissing = newRow['Lat'] === null || newRow['Lat'] === undefined || newRow['Lat'] === '' || newRow['Lat'] === '-';
    const longMissing = newRow['Long'] === null || newRow['Long'] === undefined || newRow['Long'] === '' || newRow['Long'] === '-';

    if (latMissing || longMissing) {
      const easting = parseFloat(String(newRow['Easting/m']).replace(/,/g, ''));
      const northing = parseFloat(String(newRow['Northing/m']).replace(/,/g, ''));

      if (!isNaN(easting) && !isNaN(northing)) {
        const coords = utmToLatLon(easting, northing);
        if (coords) {
          if (latMissing) newRow['Lat'] = coords.lat;
          if (longMissing) newRow['Long'] = coords.lon;
        }
      }
    }
    return newRow;
  });
}

/**
 * Ensure all entries for the same island share the same URL.
 */
function fillMissingUrls(data: DataRow[]): DataRow[] {
  const islandUrlMap: Record<string, string> = {};
  data.forEach(row => {
    const island = row['Island'];
    const url = row['URL'];
    if (island && url && String(url).trim() !== '') {
      if (!islandUrlMap[island]) {
        islandUrlMap[island] = url;
      }
    }
  });

  return data.map(row => {
    const newRow = { ...row };
    const island = newRow['Island'];
    const url = newRow['URL'];
    if (island && (url === null || url === undefined || String(url).trim() === '')) {
      if (islandUrlMap[island]) {
        newRow['URL'] = islandUrlMap[island];
      }
    }
    return newRow;
  });
}

/**
 * Apply all intelligent transformations to the dataset.
 */
export function applyIntelligentTransformations(data: DataRow[]): DataRow[] {
  let transformedData = [...data];

  // Check for relevant columns before applying transformations
  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  
  const hasLatLng = headers.includes('Lat') && headers.includes('Long');
  const hasUTM = headers.includes('Easting/m') && headers.includes('Northing/m');
  const hasIslandUrl = headers.includes('Island') && headers.includes('URL');

  // Clean and convert Easting/Northing first
  if (hasUTM) {
    transformedData = transformedData.map(row => {
      const newRow = { ...row };
      if (newRow['Easting/m'] !== undefined) {
        newRow['Easting/m'] = parseFloat(String(newRow['Easting/m']).replace(/,/g, ''));
      }
      if (newRow['Northing/m'] !== undefined) {
        newRow['Northing/m'] = parseFloat(String(newRow['Northing/m']).replace(/,/g, ''));
      }
      return newRow;
    });
  }
  
  if (hasLatLng) {
    transformedData = normalizeLatLong(transformedData);
  }

  if (hasLatLng && hasUTM) {
    transformedData = fillMissingLatLon(transformedData);
  }

  if (hasIslandUrl) {
    transformedData = fillMissingUrls(transformedData);
  }
  
  return transformedData;
}

export function getRelevantTransformationColumns(): string[] {
  return ['Lat', 'Long', 'Easting/m', 'Northing/m', 'Island', 'URL'];
}
