import { Logger } from './logger.js';

/**
 * Parses Retry-After header or applies exponential backoff
 */
export async function withRetry(operation, maxRetries = 3, keyCount = 1, initialDelay = 2000) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      return await operation(attempt);
    } catch (error) {
      attempt++;
      Logger.warn("Retry", `Operation failed (Attempt ${attempt}/${maxRetries}):`, error.message);
      
      if (!error.recoverable || attempt >= maxRetries) {
        throw error;
      }
      
      let delayMs = 0;

      // If we've exhausted all keys in the current cycle, apply backoff before wrapping around
      if (attempt % keyCount === 0) {
        delayMs = initialDelay * Math.pow(2, Math.floor(attempt / keyCount) - 1);
        
        if (error.retryAfter) {
          const parsedSeconds = parseInt(error.retryAfter, 10);
          if (!isNaN(parsedSeconds)) {
            delayMs = Math.max(delayMs, parsedSeconds * 1000);
          } else {
            const dateMs = new Date(error.retryAfter).getTime();
            if (!isNaN(dateMs)) {
              delayMs = Math.max(delayMs, dateMs - Date.now());
            }
          }
        }
      }
      
      if (delayMs > 5000) {
          Logger.warn("Retry", `Cycle exhausted and delay is ${delayMs}ms. Failing fast to prevent UI freeze.`);
          error.retryAfter = Math.ceil(delayMs / 1000); // Pass the exact wait time in seconds back to background.js
          throw error;
      }
      
      if (delayMs > 0) {
          Logger.info("Retry", `Cycle exhausted. Waiting ${delayMs}ms before wrapping around...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
          Logger.info("Retry", `Keys remaining in cycle. Instantly falling back...`);
      }
    }
  }
}
