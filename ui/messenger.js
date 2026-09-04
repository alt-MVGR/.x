import { Logger } from '../utils/logger.js';

export const Messenger = {
  async ensureContentScript(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "PING" });
      return true;
    } catch (e) {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        await new Promise(r => setTimeout(r, 100));
        return true;
      } catch (err) {
        Logger.error("Messenger", "Failed to ensure content script:", err.message);
        return false;
      }
    }
  },

  async safeSend(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
      Logger.warn("Messenger", "Failed to send message to tab", tabId, message.type);
    }
  },

  async showLoader(tabId) {
    await this.safeSend(tabId, { type: "SHOW_LOADER" });
  },

  async hideLoader(tabId) {
    await this.safeSend(tabId, { type: "HIDE_LOADER" });
  },

  async showError(tabId, msg) {
    await this.safeSend(tabId, { type: "SHOW_ERROR", msg });
  },

  async showMessage(tabId, msg, isError = false) {
    await this.safeSend(tabId, { type: "SHOW_MESSAGE", msg, isError });
  },

  async showAnswer(tabId, data) {
    await this.safeSend(tabId, { type: "SHOW_ANSWER", data });
  }
};
