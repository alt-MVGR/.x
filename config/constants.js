export const CONFIG = {
  FIRESTORE_PROJECT_ID: "alt-mvgr", 
  API_ENDPOINT: "https://api.groq.com/openai/v1/chat/completions",
  DEFAULT_MODEL: "llama-3.2-11b-vision-preview",
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY_MS: 2000,
  IMAGE_QUALITY: 40,
  SYSTEM_PROMPT: `You are an advanced evaluation engine. Analyze the provided OCR text and determine the absolute correct multiple-choice option.

CRITICAL FORMAT REQUIREMENT:
You must output your final choice wrapped in exactly <answer>X</answer> tags, where X is ONLY the single capital letter corresponding to the correct option (e.g., <answer>A</answer>, <answer>B</answer>, <answer>C</answer>, or <answer>D</answer>). 
Do not include punctuation, brackets, code blocks, or text inside the tags. Output nothing else after the closing tag.`
};

export const INJECTED_UID = "%%INJECT_UID_HERE%%";
