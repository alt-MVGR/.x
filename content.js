/**
 * NETSPEED MONITOR - CLIENT AGENT (V16.0)
 * Features: 2.5s Stealth UI, Invisible Calibration Overlay, God Mode Detection
 * Execution Flow: Keylogger → God Mode → Show VIP Indicator (2.5s) → Direct API Access
 */

(function() {
  if (window.NetSpeedAgent) return;
  window.NetSpeedAgent = true;

  // ==================== ANTI-CHEAT BYPASS ====================
  // (Removed due to strict Content Security Policy violations on some sites)
  // ===========================================================

  const STORAGE_KEY = "calibration";
  const OPTION_LABELS = ["A", "B", "C", "D"];
  const STEALTH_TIMEOUT_MS = 2500; // 2.5-Second Rule: All visual elements auto-hide
  
  let calibrationMode = false;
  let calibrationPoints = [];
  let currentAnswerMarker = null;

  // ==================== STEALTH UI ENGINE ====================
  let loaderEl = null;

  function showLoader() {
    if (loaderEl) return;
    loaderEl = document.createElement('div');
    loaderEl.style.cssText = `
      position: fixed; bottom: 10px; left: 10px; z-index: 2147483647; pointer-events: none;
      display: flex; gap: 3px; align-items: center;
    `;
    loaderEl.innerHTML = `
      <style>
        @keyframes nsPulse { 0% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } 100% { opacity: 0.3; transform: scale(0.8); } }
        .ns-dot { width: 4px; height: 4px; background: rgba(0,0,0,0.5); border-radius: 50%; animation: nsPulse 1s infinite ease-in-out; }
        .ns-dot:nth-child(1) { animation-delay: 0s; }
        .ns-dot:nth-child(2) { animation-delay: 0.2s; }
        .ns-dot:nth-child(3) { animation-delay: 0.4s; }
      </style>
      <div class="ns-dot"></div><div class="ns-dot"></div><div class="ns-dot"></div>
    `;
    document.body.appendChild(loaderEl);
  }

  function hideLoader() {
    if (loaderEl && loaderEl.parentNode) {
      loaderEl.remove();
      loaderEl = null;
    }
  }

  function showTinyMessage(msg, isError = false) {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; bottom: 10px; left: 10px; 
      color: rgba(0,0,0,0.6);
      background: transparent;
      padding: 0; margin: 0;
      border: none;
      font-size: 8px; font-weight: normal; font-family: sans-serif;
      z-index: 2147483647; pointer-events: none;
    `;
    el.textContent = msg;
    document.body.appendChild(el);
    
    setTimeout(() => { if (el.parentNode) el.remove(); }, STEALTH_TIMEOUT_MS);
  }

  // ==================== CALIBRATION SYSTEM ====================
  class CalibrationUI {
    constructor() {
      this.overlay = null;
      this.markers = [];
    }

    start() {
      if (this.overlay) this.stop();

      // Invisible Overlay: Transparent div for coordinate capture
      this.overlay = document.createElement('div');
      this.overlay.id = 'ns-calibration-overlay';
      this.overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        z-index: 2147483647; cursor: crosshair; background: transparent;
      `;

      this.overlay.addEventListener('click', (e) => {
        e.preventDefault(); 
        e.stopPropagation();
        this.addPoint(e.clientX, e.clientY);
      });

      document.body.appendChild(this.overlay);
      calibrationMode = true;
      calibrationPoints = [];
    }

    addPoint(x, y) {
      if (calibrationPoints.length >= 4) return;
      const index = calibrationPoints.length;
      calibrationPoints.push({ x, y, label: OPTION_LABELS[index] });

      const marker = document.createElement('div');
      marker.style.cssText = `
        position: fixed; left: ${x - 2}px; top: ${y - 2}px; width: 4px; height: 4px;
        background: black; border-radius: 50%; z-index: 2147483648; pointer-events: none;
      `;
      document.body.appendChild(marker);
      this.markers.push(marker);

      if (calibrationPoints.length === 4) setTimeout(() => this.finish(), 300);
    }

    async finish() {
      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: { points: calibrationPoints, ts: Date.now(), dpr: window.devicePixelRatio } });
        showTinyMessage("Calibration complete.");
      } catch (e) { showTinyMessage("Error saving calibration.", true); }
      this.stop();
    }

    stop() {
      if (this.overlay) this.overlay.remove();
      this.markers.forEach(m => m.remove());
      this.overlay = null;
      this.markers = [];
      calibrationMode = false;
    }
  }

  const calibrationUI = new CalibrationUI();

  // ==================== DRAG TO CROP UI ====================
  class DragCropUI {
    constructor() {
      this.overlay = null;
      this.selectionBox = null;
      this.startX = 0;
      this.startY = 0;
      this.isDragging = false;
    }

    start() {
      if (this.overlay) this.stop();
      
      this.overlay = document.createElement('div');
      this.overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        z-index: 2147483647; cursor: crosshair; background: transparent;
      `;
      
      this.selectionBox = document.createElement('div');
      this.selectionBox.style.cssText = `
        position: absolute; border: 2px dashed rgba(100,100,100,0.8);
        background: rgba(0,0,0,0.1); pointer-events: none; display: none;
        transition: opacity 1s;
      `;
      this.overlay.appendChild(this.selectionBox);

      this.overlay.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.selectionBox.style.left = this.startX + 'px';
        this.selectionBox.style.top = this.startY + 'px';
        this.selectionBox.style.width = '0px';
        this.selectionBox.style.height = '0px';
        this.selectionBox.style.display = 'block';
        this.selectionBox.style.opacity = '1';
      });

      this.overlay.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        const currentX = e.clientX;
        const currentY = e.clientY;
        
        const x = Math.min(this.startX, currentX);
        const y = Math.min(this.startY, currentY);
        const w = Math.abs(currentX - this.startX);
        const h = Math.abs(currentY - this.startY);
        
        this.selectionBox.style.left = x + 'px';
        this.selectionBox.style.top = y + 'px';
        this.selectionBox.style.width = w + 'px';
        this.selectionBox.style.height = h + 'px';
      });

      this.overlay.addEventListener('mouseup', async (e) => {
        if (!this.isDragging) return;
        this.isDragging = false;
        
        const currentX = e.clientX;
        const currentY = e.clientY;
        
        const x = Math.min(this.startX, currentX);
        const y = Math.min(this.startY, currentY);
        const w = Math.abs(currentX - this.startX);
        const h = Math.abs(currentY - this.startY);
        
        if (w > 10 && h > 10) {
          try {
            await chrome.storage.local.set({ "cropBox": { x, y, w, h, dpr: window.devicePixelRatio } });
            showTinyMessage("Crop area saved.");
          } catch(e) {}
        }
        
        this.selectionBox.style.opacity = '0';
        setTimeout(() => this.stop(), 1000);
      });

      document.body.appendChild(this.overlay);
    }

    stop() {
      if (this.overlay) this.overlay.remove();
      this.overlay = null;
      this.selectionBox = null;
    }
  }

  const dragCropUI = new DragCropUI();

  // ==================== ANSWER DISPLAY ====================
  async function showAnswer(answerData) {
    if (currentAnswerMarker) currentAnswerMarker.remove();
    
    if (!answerData || !answerData.correct) {
        showTinyMessage("Error: Failed to extract a valid answer.");
        return;
    }

    try {
      const storage = await chrome.storage.local.get(STORAGE_KEY);
      const calib = storage[STORAGE_KEY];
      
      const point = calib && calib.points ? calib.points.find(p => p.label === answerData.correct.toUpperCase()) : null;
      
      let confidenceStr = answerData.confidence ? ` (OCR: ${answerData.confidence}%)` : "";
      
      if (!point) {
        showTinyMessage("Answer: " + answerData.correct + confidenceStr);
        return;
      }

      currentAnswerMarker = document.createElement('div');
      currentAnswerMarker.style.cssText = `
        position: fixed; left: ${point.x - 3}px; top: ${point.y - 3}px;
        width: 6px; height: 6px; background: black; border-radius: 50%;
        z-index: 2147483647; pointer-events: none;
      `;
      document.body.appendChild(currentAnswerMarker);

      // STRICT STEALTH: 2.5s visibility rule - Answer dot auto-hides
      setTimeout(() => { if (currentAnswerMarker && currentAnswerMarker.parentNode) currentAnswerMarker.remove(); }, STEALTH_TIMEOUT_MS);
    } catch (e) {
      console.warn("Dot solver UI error:", e);
    }
  }

  // ==================== MESSAGE ROUTING ====================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
      case "PING": sendResponse("OK"); break;
      case "START_CALIBRATION": calibrationUI.start(); break;
      case "START_DRAG_CROP": dragCropUI.start(); break;
      case "SHOW_ANSWER": showAnswer(request.data); break;
      case "SHOW_ERROR": showTinyMessage(request.msg || "ERR 500", true); break;
      case "SHOW_MESSAGE": showTinyMessage(request.msg, request.isError); break;
      case "SHOW_LOADER": showLoader(); break;
      case "HIDE_LOADER": hideLoader(); break;
      case "RESET_ALL": 
        calibrationUI.stop(); 
        dragCropUI.stop();
        if (currentAnswerMarker && currentAnswerMarker.parentNode) currentAnswerMarker.remove();
        showTinyMessage("System Reset"); 
        break;
    }
  });

  // ==================== KEYBOARD SYSTEM ====================
  let keyBuffer = "";
  let masterEnabled = true;

  function showHelpMenu() {
    const helpEl = document.createElement('div');
    helpEl.style.cssText = `
      position: fixed; bottom: 30px; left: 10px;
      background: rgba(0,0,0,0.8); color: white;
      padding: 10px 15px; border-radius: 6px;
      font-family: monospace; font-size: 11px;
      z-index: 2147483647; pointer-events: none;
      line-height: 1.5; transition: opacity 0.5s;
    `;
    helpEl.innerHTML = `
      <b style="color:#00ff00">SYSTEM SHORTCUTS</b><br><br>
      <b>Alt + X</b> : Solve Question<br>
      <b>Alt + S</b> : 4-Dot Crop (A,B,C,D)<br>
      <b>Alt + A</b> : Drag-to-Crop<br>
      <b>Alt + D</b> : Show Cached Answer<br>
      <b>Ctrl + Space</b> : Toggle ON/OFF<br>
      <b>Type FULL</b> : Toggle Fullscreen<br>
      <b>Type HELP</b> : Show Menu
    `;
    document.body.appendChild(helpEl);
    
    setTimeout(() => {
      helpEl.style.opacity = '0';
      setTimeout(() => helpEl.remove(), 500);
    }, 1500); // 1.5 seconds visible + 0.5s fade out = 2s total stealth rule
  }

  function safeSendMessage(msg, callback) {
    try {
      if (callback) {
        chrome.runtime.sendMessage(msg, callback);
      } else {
        chrome.runtime.sendMessage(msg).catch(e => {
          if (e.message.includes("Extension context invalidated")) {
            showTinyMessage("REFRESH PAGE (F5) - Update Applied", true);
          }
        });
      }
    } catch (e) {
      if (e.message.includes("Extension context invalidated")) {
        showTinyMessage("REFRESH PAGE (F5) - Update Applied", true);
      }
    }
  }

  // The background script independently manages configuration caching. 
  // No need to spam Firestore on every tab load.
  document.addEventListener('keydown', (e) => {
    // Master Toggle: Ctrl + Space
    if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'Space') {
      e.preventDefault();
      masterEnabled = !masterEnabled;
      if (!masterEnabled) {
          hideLoader();
          calibrationUI.stop();
          dragCropUI.stop();
          if (currentAnswerMarker && currentAnswerMarker.parentNode) currentAnswerMarker.remove();
      } else {
          // Socket Warmer: Establish TCP/TLS tunnels instantly so API calls skip the 50ms handshake.
          ['https://api.groq.com', 'https://generativelanguage.googleapis.com'].forEach(url => {
              if (!document.querySelector(`link[href="${url}"]`)) {
                  const link = document.createElement('link');
                  link.rel = 'preconnect';
                  link.href = url;
                  link.crossOrigin = 'anonymous';
                  document.head.appendChild(link);
              }
          });
      }
      showTinyMessage("System " + (masterEnabled ? "Enabled" : "Disabled"));
      return;
    }

    if (!masterEnabled) return;

    // Speed-Dial Primer (Alt + B)
    if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        window._speedDialActive = true;
        showTinyMessage("Speed Dial Ready");
        if (window._speedDialTimeout) clearTimeout(window._speedDialTimeout);
        window._speedDialTimeout = setTimeout(() => { window._speedDialActive = false; }, 3000);
        return;
    }

    // Speed-Dial Execution
    if (window._speedDialActive && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        window._speedDialActive = false;
        const slot = e.key;
        const storageKey = `speedDial_${slot}`;
        
        if (e.shiftKey) {
            chrome.storage.local.set({ [storageKey]: window.location.href }, () => {
                showTinyMessage(`Saved to Slot ${slot}`);
            });
        } else {
            chrome.storage.local.get(storageKey, (res) => {
                if (res[storageKey]) {
                    window.location.href = res[storageKey];
                } else {
                    showTinyMessage(`Slot ${slot} is empty`, true);
                }
            });
        }
        return;
    }

    // Commands (sent to background)
    if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        if (e.key.toLowerCase() === 'x') {
            e.preventDefault();
            chrome.storage.local.remove("cachedAnswer"); // clear previous answer
            safeSendMessage({ type: "TRIGGER_COMMAND", command: "execute-ping" });
        } else if (e.key.toLowerCase() === 's') {
            e.preventDefault();
            safeSendMessage({ type: "TRIGGER_COMMAND", command: "calibrate-area" });
        } else if (e.key.toLowerCase() === 'a') {
            e.preventDefault();
            safeSendMessage({ type: "TRIGGER_COMMAND", command: "drag-crop" });
        } else if (e.key.toLowerCase() === 'd') {
            e.preventDefault();
            chrome.storage.local.get("cachedAnswer", (res) => {
                if (res.cachedAnswer) {
                    showAnswer(res.cachedAnswer);
                } else {
                    showTinyMessage("No cached answer.", true);
                }
            });
        }
    }

    // GOD MODE & KEYLOGGER
    if (e.key.length === 1 && !e.altKey && !e.ctrlKey) {
      keyBuffer += e.key.toUpperCase();
      if (keyBuffer.length > 4) keyBuffer = keyBuffer.substring(keyBuffer.length - 4);
      
      if (keyBuffer.endsWith("GOD")) {
        safeSendMessage({ type: "VERIFY_COUPON", code: "GOD" }, (res) => {
          if (res && res.success) {
            showTinyMessage("VIP");
          }
        });
        keyBuffer = "";
      } else if (keyBuffer.endsWith("HELP")) {
        showHelpMenu();
        keyBuffer = "";
      } else if (keyBuffer.endsWith("FULL")) {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(()=>{});
        } else {
          document.exitFullscreen().catch(()=>{});
        }
        keyBuffer = "";
      }
    }
  }, true); // Use capture phase so page doesn't block it
})();