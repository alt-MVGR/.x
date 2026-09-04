import { Logger } from '../utils/logger.js';
import { queryTextAPI } from './universal.js';

import { CONFIG } from '../config/constants.js';

/**
 * Orchestrates the "Thinker-Extractor" Pipeline
 */
export async function runConsensusPipeline(payload, activeKey, attemptIndex = 0, globalConfig = null) {
    if (payload.type !== 'image' && payload.type !== 'text') {
        throw new Error("Orchestrator requires a valid image or text payload.");
    }

    // Use passed globalConfig or fetch it (fallback)
    if (!globalConfig) {
        const storage = await chrome.storage.local.get("globalConfig");
        globalConfig = storage.globalConfig;
    }
    const primaryModelConfig = globalConfig?.primaryModel || ["llama-3.3-70b-versatile"];
    const modelArray = Array.isArray(primaryModelConfig) ? primaryModelConfig : [primaryModelConfig];
    
    // Smart Provider Auto-Routing
    // Dynamically filters the global model array so users with mixed keys don't crash
    let compatibleModels = modelArray;
    
    if (activeKey) {
        if (activeKey.startsWith("gsk_")) {
            // Groq keys -> Exclude Gemini. Slashes (like in qwen/qwen) are perfectly fine!
            compatibleModels = modelArray.filter(m => !m.toLowerCase().includes("gemini"));
            if (compatibleModels.length === 0) compatibleModels = ["qwen/qwen3.8-27b"]; // Vision fallback
        } else if (activeKey.startsWith("AIzaSy") || activeKey.startsWith("AQ.")) {
            // Google keys -> Must contain "gemini"
            compatibleModels = modelArray.filter(m => m.toLowerCase().includes("gemini"));
            if (compatibleModels.length === 0) compatibleModels = ["gemini-3.5-flash-lite"]; // Fast fallback
        }
    }
    
    // Distribute the user's keys evenly across the compatible models
    const THINKER_MODEL = compatibleModels[attemptIndex % compatibleModels.length];
    
    const EXTRACTOR_MODEL = globalConfig?.secondaryModel || "llama-3.3-70b-versatile";
    
    const thinkerTokens = globalConfig?.thinkerMaxTokens !== undefined ? globalConfig.thinkerMaxTokens : 5000;
    const extractorTokens = globalConfig?.extractorMaxTokens !== undefined ? globalConfig.extractorMaxTokens : 100;
    const temperature = globalConfig?.temperature !== undefined ? globalConfig.temperature : 0;
    
    const thinkerPrompt = globalConfig?.thinkerPrompt || CONFIG.SYSTEM_PROMPT;
    const extractorPrompt = globalConfig?.extractorPrompt || CONFIG.EXTRACTOR_PROMPT;
    const apiEndpoint = globalConfig?.apiEndpoint || CONFIG.API_ENDPOINT;

    Logger.info("Orchestrator", `Phase 1: Executing Thinker Model (${THINKER_MODEL}) with ${thinkerTokens} tokens`);
    
    let rawOutput = "";
    try {
        rawOutput = await queryTextAPI(payload, activeKey, THINKER_MODEL, false, thinkerPrompt, thinkerTokens, temperature, apiEndpoint);
        if (!rawOutput) throw new Error("Model returned empty response.");
        Logger.debug("ModelOutput", `\n\n=== RAW OUTPUT ===\n${rawOutput.correct || JSON.stringify(rawOutput)}\n==========================\n`);
        
        if (rawOutput && rawOutput.correct) {
            Logger.info("Orchestrator", `Successfully extracted option: ${rawOutput.correct}`);
            return rawOutput; // Must return the parsed object
        } else {
            throw new Error("Model failed to output a strictly formatted answer.");
        }
    } catch (e) {
        Logger.warn("Orchestrator", `Model failed: ${e.message}`);
        throw e; // Pass to retry/fallback logic
    }
}
