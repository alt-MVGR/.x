import { CONFIG } from '../config/constants.js';
import { RateLimitError, NetworkError, VisionError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';
import { validateAPIResponse } from '../utils/validator.js';
import { extractOption } from '../utils/parser.js';

export async function queryTextAPI(payload, currentKey, modelOverride = null, returnRaw = false, customPrompt = null, customMaxTokens = 2500, temperature = 0, endpoint = null) {
  Logger.info("UniversalAPI", `Sending text request using key ending in ...${currentKey.slice(-4)}`);
  
  if (payload.type !== 'text') {
    throw new Error("Cannot send non-text payload to queryTextAPI. Ensure OCR succeeded.");
  }

  const systemPrompt = customPrompt || CONFIG.SYSTEM_PROMPT;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s max for upload/processing

  let activeModel = modelOverride || CONFIG.DEFAULT_MODEL;
  let activeEndpoint = endpoint || CONFIG.API_ENDPOINT || "https://api.groq.com/openai/v1/chat/completions";

  // Embedded Intelligence: Auto-detect endpoint based on API key notation to prevent 401 errors
  if (currentKey) {
      if (currentKey.startsWith("gsk_")) {
          activeEndpoint = "https://api.groq.com/openai/v1/chat/completions";
      } else if (currentKey.startsWith("sk-or-v1-")) {
          activeEndpoint = "https://openrouter.ai/api/v1/chat/completions";
      } else if (currentKey.startsWith("AIzaSy") || currentKey.startsWith("AQ.")) {
          activeEndpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
      } else if (currentKey.startsWith("sk-proj-") || (currentKey.startsWith("sk-") && !activeEndpoint.includes("groq") && !activeEndpoint.includes("openrouter"))) {
          activeEndpoint = "https://api.openai.com/v1/chat/completions";
      }
  }

  // Model routing is now handled natively via array mapping (Model[i] maps to Key[i]).
  // We no longer overwrite the user's model configuration.

  Logger.debug("UniversalAPI", `Auto-detected endpoint: ${activeEndpoint} for model: ${activeModel}`);

  let response;
  try {
      let requestBody = {
        model: activeModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: payload.type === 'image' 
              ? [
                  { type: "text", text: "Read this screenshot and extract the correct option precisely." },
                  { type: "image_url", image_url: { url: payload.content } }
                ]
              : `OCR Extracted Text:\n\n${payload.content}` 
          }
        ],
        temperature: temperature,
        max_tokens: customMaxTokens
      };

      // Strict Schema Compliance for specific models
      if (activeModel.includes("o1") || activeModel.includes("o3")) {
          delete requestBody.max_tokens;
          delete requestBody.temperature; // o1 models do not support temperature
          requestBody.max_completion_tokens = customMaxTokens;
      }

      response = await fetch(activeEndpoint, {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${currentKey}`, 
          "Content-Type": "application/json" 
        },
        signal: controller.signal,
        body: JSON.stringify(requestBody)
      });
  } catch (error) {
    if (error.name === 'AbortError') throw new NetworkError("Universal API request timed out (60s)");
    throw new NetworkError(`Fetch failed: ${error.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  Logger.debug("UniversalAPI", `Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    let errorBody = {};
    try { 
      errorBody = await response.json(); 
    } catch (e) {
      Logger.warn("UniversalAPI", "Could not parse error response body");
    }

    if (response.status === 429) {
      // Look for Retry-After header
      const retryAfter = response.headers.get('Retry-After');
      throw new RateLimitError(
        errorBody?.error?.message || "Rate limit exceeded",
        retryAfter,
        errorBody
      );
    }

    let errMsg = 'Unknown error';
    if (Array.isArray(errorBody) && errorBody[0]?.error?.message) {
      errMsg = errorBody[0].error.message;
    } else if (errorBody?.error?.message) {
      errMsg = errorBody.error.message;
    }

    if (response.status === 401 || response.status === 403) {
      if (errMsg && errMsg.includes("blocked at the organization level")) {
        throw new NetworkError(`Model Blocked: ${errMsg}`, errorBody);
      }
      throw new NetworkError(`Invalid or unauthorized API key: ${errMsg}`, errorBody);
    }

    throw new NetworkError(`Universal API returned ${response.status}: ${errMsg}`, errorBody);
  }

  const data = await response.json();
  
  // Validate standard OpenAI-like response object
  const rawContent = validateAPIResponse(data);
  
  if (returnRaw) {
    Logger.info("UniversalAPI", "Returning raw thinker output.");
    return rawContent;
  }
  
  // Run robust parser to aggressively extract A,B,C,D
  const parsed = extractOption(rawContent);
  
  Logger.info("UniversalAPI", "Successfully extracted option:", parsed.correct);
  return parsed;
}
