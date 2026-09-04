import { ParserError } from './errors.js';
import { Logger } from './logger.js';

/**
 * Robust text parser that completely ignores JSON.
 * Aggressively extracts A, B, C, D, 1, 2, 3, 4 from model output.
 */
export function extractOption(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new ParserError("Output is not a valid string", { rawText });
  }

  Logger.debug("Parser", "Raw input:", rawText);

  // Look for our strict XML format: <answer>C</answer>
  // More lenient internally to handle <answer> C </answer> or <answer>Option C</answer>
  const match = rawText.match(/<answer>[\s\S]*?([A-F1-6])[\s\S]*?<\/answer>/i);
  
  if (match && match[1]) {
    return normalizeOption(match[1]);
  }

  // Fallback 1: If the model failed to output XML but output a single character
  const stripped = rawText.trim();
  if (stripped.length === 1 && /^[A-F1-6]$/i.test(stripped)) {
    Logger.warn("Parser", "Model did not output XML, but output a single character.");
    return normalizeOption(stripped);
  }

  // Fallback 2: Look for standard phrasing like "**Option A**", "answer is B"
  const fallbackMatch = rawText.match(/(?:option|answer is)[\s\:\*\-]*([A-F1-6])\b/i);
  if (fallbackMatch && fallbackMatch[1]) {
    Logger.warn("Parser", `Model missing XML. Extracted from fallback pattern: ${fallbackMatch[1]}`);
    return normalizeOption(fallbackMatch[1]);
  }

  // Fallback 3: Extract the VERY LAST standalone A, B, C, D, E, F, 1, 2, 3, 4, 5, or 6 at the end of the text
  const lastLetterMatch = rawText.match(/\b([A-F1-6])\b(?=[^A-Za-z0-9]*$)/i);
  if (lastLetterMatch && lastLetterMatch[1]) {
    Logger.warn("Parser", `Model missing XML. Extracted final standalone character: ${lastLetterMatch[1]}`);
    return normalizeOption(lastLetterMatch[1]);
  }

  throw new ParserError("Could not find <answer>X</answer> tags in the response.", { rawText });
}

function normalizeOption(char) {
  const upper = char.toUpperCase();
  // Map numbers to letters for UI consistency if needed
  const map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E', '6': 'F' };
  return { correct: map[upper] || upper };
}
