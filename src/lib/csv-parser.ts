import Papa from 'papaparse';

export interface ParseResult {
  data: Record<string, any>[];
  errors: Papa.ParseError[];
  meta: Papa.ParseMeta;
}

export function parseCsvToJson(csvString: string): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true, // Automatically convert numbers, booleans
      complete: (results) => {
        resolve({
          data: results.data as Record<string, any>[],
          errors: results.errors,
          meta: results.meta,
        });
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}
