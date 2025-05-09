export type JsonObject = Record<string, any>;
export type JsonArray = JsonObject[];

/**
 * Merges multiple JSON arrays (arrays of objects) into a single array.
 * If inputs are objects, they are wrapped in an array.
 */
export function mergeJsonArrays(jsonContents: (JsonArray | JsonObject)[]): JsonArray {
  const result: JsonArray = [];
  for (const content of jsonContents) {
    if (Array.isArray(content)) {
      result.push(...content);
    } else if (typeof content === 'object' && content !== null) {
      result.push(content); // Wrap single object into the array
    }
  }
  return result;
}

/**
 * Reorders and filters keys of objects within a JSON array based on a specified key order and inclusion map.
 * This version is simplified as key renaming logic is now primarily handled directly in the main component.
 * @param jsonData The array of JSON objects to process.
 * @param orderedKeys An array defining the desired order of output keys (these should be the final names).
 * @param originalKeyMap A map where keys are the final output key names and values are the original key names from jsonData.
 * @param includedKeys A map where keys are original field names and values are booleans indicating inclusion.
 * @param stripInternalKeys If true, keys starting with '__' will be removed from the output objects.
 */
export function restructureJsonArray(
  jsonData: JsonArray,
  orderedKeys: string[], // These are the final output key names
  originalKeyMap: Record<string, string>, // Map from final output key name to original key name
  includedOriginalKeys: Record<string, boolean>, // Keyed by original field names
  stripInternalKeys: boolean = false
): JsonArray {
  return jsonData.map(obj => {
    const newObj: JsonObject = {};
    
    // Add keys in the specified order using the final output key names
    for (const outputKey of orderedKeys) {
      const originalKey = originalKeyMap[outputKey]; // Get the original key name corresponding to this output key
      if (originalKey && obj.hasOwnProperty(originalKey) && includedOriginalKeys[originalKey]) {
        if (stripInternalKeys && outputKey.startsWith('__')) continue;
        newObj[outputKey] = obj[originalKey];
      }
    }
    
    // This function now assumes that `orderedKeys` combined with `originalKeyMap` covers all desired keys.
    // If there are other keys in `obj` that should be included but are not in `orderedKeys` via `originalKeyMap`,
    // they won't be added by this simplified version.
    // The primary use in DataForgeStudio now handles this construction directly in `getFinalJson`.
    return newObj;
  });
}

/**
 * Downloads a JSON object or array as a .json file.
 */
export function downloadJson(data: JsonObject | JsonArray, filename: string = 'data.json') {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
