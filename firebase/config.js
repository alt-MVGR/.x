import { CONFIG } from '../config/constants.js';
import { FirestoreError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';

/**
 * Fetches the global configuration from Firestore.
 */
export async function getGlobalConfig() {
  const url = `https://firestore.googleapis.com/v1/projects/${CONFIG.FIRESTORE_PROJECT_ID}/databases/(default)/documents/config/global`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      Logger.warn("Firestore", "Config request timed out.");
      return null;
    }
    Logger.warn("Firestore", `Network error fetching config: ${error.message}`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    Logger.warn("Firestore", `Config fetch returned status ${response.status}`);
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    Logger.warn("Firestore", "Invalid JSON received for config.");
    return null;
  }

  let primaryModel = [];
  if (data.fields?.primaryModel?.arrayValue?.values) {
    primaryModel = data.fields.primaryModel.arrayValue.values.map(v => v.stringValue);
  } else if (data.fields?.primaryModel?.stringValue) {
    primaryModel = [data.fields.primaryModel.stringValue];
  }
  
  const thinkerMaxTokens = data.fields?.thinkerMaxTokens?.integerValue 
    ? parseInt(data.fields.thinkerMaxTokens.integerValue) : undefined;
  const temperature = data.fields?.temperature?.doubleValue !== undefined
    ? parseFloat(data.fields.temperature.doubleValue) 
    : (data.fields?.temperature?.integerValue !== undefined ? parseFloat(data.fields.temperature.integerValue) : undefined);
  const imageQuality = data.fields?.imageQuality?.integerValue 
    ? parseInt(data.fields.imageQuality.integerValue) : undefined;
    
  const thinkerPrompt = data.fields?.thinkerPrompt?.stringValue || undefined;
  const apiEndpoint = data.fields?.apiEndpoint?.stringValue || undefined;
  
  if (primaryModel.length > 0) {
    Logger.info("Firestore", `Successfully retrieved global config.`);
    return { 
      primaryModel: primaryModel,
      thinkerMaxTokens,
      temperature,
      imageQuality,
      thinkerPrompt,
      apiEndpoint
    };
  }
  
  return null;
}
