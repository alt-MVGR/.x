import { INJECTED_UID } from './config/constants.js';
import { Logger } from './utils/logger.js';
import { withRetry } from './utils/retry.js';
import { getApiKeys } from './firebase/keys.js';
import { getGlobalConfig } from './firebase/config.js';
import { captureScreen } from './background/capture.js';
import { runConsensusPipeline } from './api/orchestrator.js';
import { Messenger } from './ui/messenger.js';
import { globalApiRouter } from './utils/apiRouter.js';

Logger.info("System", "Background Service Worker Initialized.");

let localCache = {
  apiKeys: [],
  globalConfig: null,
  isLoaded: false
};

async function initializeSystemConfig(forceRefresh = false) {
  if (localCache.isLoaded && !forceRefresh) return localCache;

  return new Promise((resolve) => {
    chrome.storage.local.get(["cachedApiKeys", "globalConfig"], async (result) => {
      if (result.cachedApiKeys && result.globalConfig && !forceRefresh) {
        localCache.apiKeys = result.cachedApiKeys;
        localCache.globalConfig = result.globalConfig;
        localCache.isLoaded = true;
        Logger.info("System", "Config successfully loaded from local cache.");
        resolve(localCache);
      } else {
        Logger.info("System", "Local cache stale/empty. Fetching from Firestore...");
        try {
          const [apiKeys, globalConfig] = await Promise.all([
            getApiKeys(INJECTED_UID),
            getGlobalConfig()
          ]);
          
          localCache.apiKeys = apiKeys || [];
          localCache.globalConfig = globalConfig || null;
          localCache.isLoaded = true;

          chrome.storage.local.set({
            cachedApiKeys: localCache.apiKeys,
            globalConfig: localCache.globalConfig
          }, () => {
            Logger.info("System", "Local cache populated and written to disk.");
            resolve(localCache);
          });
        } catch (e) {
          Logger.error("System", "Failed to fetch config:", e);
          resolve(null);
        }
      }
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  initializeSystemConfig(true);
  try {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      }).catch(() => {});
    }
    Logger.info("System", `Pre-injected content script into ${tabs.length} open tabs.`);
  } catch (e) {
    Logger.warn("System", "Failed to pre-inject tabs:", e.message);
  }
});
chrome.runtime.onStartup.addListener(() => initializeSystemConfig(false));

// Offscreen Document removed. We no longer use local Tesseract OCR.
// The pipeline is now 100% Native Vision via the cloud.

async function handleCommand(command, tab) {
  const contentScriptReady = await Messenger.ensureContentScript(tab.id);
  if (!contentScriptReady) return;

  if (command === "execute-ping") {
    Logger.info("Command", "execute-ping triggered by user.");

    if (INJECTED_UID.includes("%%")) {
      Logger.warn("Command", "Unlicensed UID detected. Aborting.");
      await Messenger.showMessage(tab.id, "UNLICENSED EXTENSION", true);
      return;
    }

    await Messenger.showLoader(tab.id);

    try {
      // 1. Fetch keys from Memory Cache
      Logger.debug("Pipeline", "Ensuring configuration is cached...");
      const config = await initializeSystemConfig();
      
      if (!config || !config.apiKeys || config.apiKeys.length === 0) {
        Logger.error("Pipeline", "Aborted: Local configuration cache is empty or missing API keys.");
        throw new Error("No API keys found. Please configure keys in dashboard.");
      }
      
      const apiKeys = config.apiKeys;
      // 2. Capture Screenshot
      Logger.debug("Pipeline", "Capturing screenshot...");
      const screenshot = await captureScreen();

      // 3. Query Universal API via Orchestrator with Smart Hedged Racing
      Logger.debug("Pipeline", "Initiating Smart Hedged API Racing...");
      
      // Sort keys by usage to prioritize the best available key first
      const sortedKeys = [...apiKeys].sort((a, b) => globalApiRouter.getUsage(a) - globalApiRouter.getUsage(b));
      
      const fireRequest = async (key) => {
          const originalIndex = apiKeys.indexOf(key); // Preserve 1:1 model mapping
          try {
              return await runConsensusPipeline(screenshot, key, originalIndex, config.globalConfig);
          } catch(e) {
              if (e.type === "RATE_LIMIT") {
                  globalApiRouter.setCooldown(key, e.retryAfter);
                  Logger.warn("Pipeline", `Key ending in ...${key.slice(-4)} placed in cooldown!`);
              }
              throw e;
          }
      };

      // Hedging strategy: Fire best key. If it takes longer than 250ms, fire the next one to hedge bets.
      // If a key fails instantly, instantly fire the next one without waiting for the 250ms delay.
      const result = await new Promise((resolve, reject) => {
          let hasResolved = false;
          let errors = [];
          let activeCount = 0;
          let keyIndex = 0;

          const launchNext = () => {
              if (hasResolved || keyIndex >= sortedKeys.length) return;
              
              const currentKey = sortedKeys[keyIndex++];
              activeCount++;
              
              let timerCompleted = false;
              const staggerTimer = setTimeout(() => {
                  timerCompleted = true;
                  launchNext(); // Hedge: previous request is taking too long, fire the next one!
              }, 250);
              
              fireRequest(currentKey)
                  .then(res => {
                      if (!hasResolved) {
                          hasResolved = true;
                          clearTimeout(staggerTimer);
                          resolve(res);
                      }
                  })
                  .catch(err => {
                      errors.push(err);
                      activeCount--;
                      clearTimeout(staggerTimer);
                      
                      // If it failed fast, instantly launch the next one without waiting
                      if (!timerCompleted && !hasResolved) {
                          launchNext();
                      } else if (activeCount === 0 && keyIndex >= sortedKeys.length) {
                          reject(new Error("All API keys failed or timed out. Check models/rate limits."));
                      }
                  });
          };

          launchNext(); // Kickoff the first request
      });

      // 4. Return answer to UI
      Logger.info("Pipeline", "Execution complete. Sending answer to UI.");
      
      // Phase 6: Cache answer for Alt+D
      await chrome.storage.local.set({ cachedAnswer: result });
      
      await Messenger.hideLoader(tab.id);
      await Messenger.showAnswer(tab.id, result);

    } catch (fatalError) {
      Logger.error("Fatal", "Pipeline crashed:", fatalError.message, fatalError.details || "");
      
      let errorMsg = "ERR 500";
      if (fatalError.type === "AUTH_ERROR") errorMsg = "ERR 403";
      else if (fatalError.type === "RATE_LIMIT") {
        let waitTime = "X";
        if (fatalError.retryAfter) {
          const parsedSecs = parseInt(fatalError.retryAfter, 10);
          if (!isNaN(parsedSecs)) {
            waitTime = parsedSecs;
          } else {
            const dateMs = new Date(fatalError.retryAfter).getTime();
            if (!isNaN(dateMs)) waitTime = Math.max(1, Math.ceil((dateMs - Date.now()) / 1000));
          }
        }
        errorMsg = `Wait ${waitTime}s!!`;
      }
      else if (fatalError.type === "TIMEOUT") errorMsg = "ERR TIMEOUT";
      else if (fatalError.type === "NETWORK_ERROR") errorMsg = "ERR NET";
      
      await Messenger.hideLoader(tab.id);
      await Messenger.showError(tab.id, errorMsg);
    }
    
  } else if (command === "calibrate-area") {
    Logger.info("Command", "calibrate-area triggered.");
    await Messenger.safeSend(tab.id, { type: "START_CALIBRATION" });
    
    if (!INJECTED_UID.includes("%%")) {
      initializeSystemConfig().catch(e => Logger.warn("Pipeline", "Background cache warm failed:", e));
    }
  } else if (command === "drag-crop") {
    Logger.info("Command", "drag-crop triggered.");
    await Messenger.safeSend(tab.id, { type: "START_DRAG_CROP" });
    
    if (!INJECTED_UID.includes("%%")) {
      initializeSystemConfig().catch(e => Logger.warn("Pipeline", "Background cache warm failed:", e));
    }
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || tab.url.startsWith("chrome://")) return;
  await handleCommand(command, tab);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_AUTH_STATUS") {
    sendResponse({ 
      isAuthed: !INJECTED_UID.includes("%%"), 
      uid: INJECTED_UID.includes("%%") ? null : INJECTED_UID 
    });
    return true;
  }
  
  if (request.type === "TRIGGER_COMMAND") {
    handleCommand(request.command, sender.tab);
  }

  if (request.type === "SYNC_CONFIG") {
    getGlobalConfig().then(config => {
      if (config && (config.primaryModel || config.secondaryModel || config.tiebreakerModel)) {
        chrome.storage.local.set({ globalConfig: config });
        Logger.info("System", `Global config synced. Primary: ${config.primaryModel}`);
      }
    });
  }
});
