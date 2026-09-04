import { CONFIG } from '../config/constants.js';
import { FirestoreError, AuthError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';

/**
 * Fetches API keys from Firestore.
 */
export async function getApiKeys(uid) {
  if (!uid || uid.includes("%%")) {
    throw new AuthError("Unlicensed extension. Invalid UID.");
  }

  const url = `https://firestore.googleapis.com/v1/projects/${CONFIG.FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new FirestoreError("Firestore request timed out.");
    }
    throw new FirestoreError(`Network error while fetching from Firestore: ${error.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 404) throw new AuthError("User not found in database.");
    throw new FirestoreError(`Firestore returned status ${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new FirestoreError("Invalid JSON received from Firestore.");
  }

  // Validate Blocked Status
  const isBlocked = data.fields?.isBlocked?.booleanValue === true;
  if (isBlocked) {
    throw new AuthError("User is blocked.");
  }

  // Parse API Keys
  let apiKeys = [];
  if (data.fields?.apiKeys?.arrayValue?.values) {
    apiKeys = data.fields.apiKeys.arrayValue.values.map(v => v.stringValue).filter(Boolean);
  } else if (data.fields?.apiKey?.stringValue) {
    apiKeys = [data.fields.apiKey.stringValue].filter(Boolean);
  }

  if (apiKeys.length === 0) {
    throw new AuthError("No valid API keys found for this user.");
  }

  Logger.info("Firestore", `Successfully retrieved ${apiKeys.length} keys.`);
  return apiKeys;
}
