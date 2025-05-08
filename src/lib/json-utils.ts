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
 * @param jsonData The array of JSON objects to process.
 * @param keyOrder An array defining the desired order of keys.
 * @param includedKeys A map where keys are field names and values are booleans indicating inclusion.
 * @param stripInternalKeys If true, keys starting with '__' will be removed from the output objects.
 */
export function restructureJsonArray(
  jsonData: JsonArray,
  keyOrder: string[],
  includedKeys: Record<string, boolean>,
  stripInternalKeys: boolean = false
): JsonArray {
  return jsonData.map(obj => {
    const newObj: JsonObject = {};
    // Add included keys in the specified order
    for (const key of keyOrder) {
      if (obj.hasOwnProperty(key) && includedKeys[key]) {
        if (stripInternalKeys && key.startsWith('__')) continue;
        newObj[key] = obj[key];
      }
    }
    // Add any other included keys that were not in keyOrder (maintaining their relative order from original object)
    for (const originalKey in obj) {
      if (obj.hasOwnProperty(originalKey) && includedKeys[originalKey] && !newObj.hasOwnProperty(originalKey)) {
         if (stripInternalKeys && originalKey.startsWith('__')) continue;
        newObj[originalKey] = obj[originalKey];
      }
    }
    // If not stripping internal keys but they weren't explicitly in keyOrder/includedKeys,
    // this part ensures they are still carried over if not explicitly excluded.
    // However, standard practice is to manage all keys via keyOrderConfig.
    // For this app, internal keys are special and handled by stripInternalKeys.
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
