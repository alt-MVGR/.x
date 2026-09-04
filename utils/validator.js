import { InvalidResponseError } from './errors.js';
import { Logger } from './logger.js';

/**
 * Validates the raw JSON response from the API.
 * @param {Object} data 
 */
export function validateAPIResponse(data) {
  Logger.debug("Validator", "Validating API Response:", data);

  if (!data || typeof data !== 'object') {
    throw new InvalidResponseError("Response is not a valid object", { data });
  }

  if (data.error) {
    throw new InvalidResponseError(`API returned error: ${data.error.message || 'Unknown API Error'}`, { error: data.error });
  }

  if (!Array.isArray(data.choices) || data.choices.length === 0) {
    throw new InvalidResponseError("Missing 'choices' array in response", { data });
  }

  const firstChoice = data.choices[0];
  if (!firstChoice.message || typeof firstChoice.message !== 'object') {
    throw new InvalidResponseError("Missing 'message' object in choices[0]", { choice: firstChoice });
  }

  const content = firstChoice.message.content;
  if (typeof content !== 'string') {
    throw new InvalidResponseError("'content' is missing or not a string", { message: firstChoice.message });
  }

  return content;
}
