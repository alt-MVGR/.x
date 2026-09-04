import * as TesseractLib from './libs/tesseract.esm.min.js';

const createWorker = TesseractLib.createWorker || (TesseractLib.default ? TesseractLib.default.createWorker : null);

let globalWorker = null;
let isWorkerReady = false;

// Initialize the persistent hot-standby worker
async function initWorker() {
    if (globalWorker) return globalWorker;
    
    globalWorker = await createWorker('eng', 1, {
        workerPath: chrome.runtime.getURL('libs/worker.min.js'),
        corePath: chrome.runtime.getURL('libs/tesseract-core.wasm.js'),
        langPath: chrome.runtime.getURL('libs/'), 
        workerBlobURL: false
    });
    
    // Set Page Segmentation Mode to 6 (Assume a single uniform block of text) to skip layout analysis
    await globalWorker.setParameters({
        tessedit_pageseg_mode: '6' // PSM.SINGLE_BLOCK
    });
    
    isWorkerReady = true;
    console.log("OCR Worker: Hot-Standby Ready!");
    return globalWorker;
}

// Kick off initialization immediately when the offscreen document loads
initWorker().catch(e => console.error("OCR Worker Init Failed:", e));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'run_ocr') {
        processOCR(msg.dataUrl).then(sendResponse);
        return true; 
    } else if (msg.action === 'ping_ocr') {
        // Just ensures the worker is booted
        initWorker().then(() => sendResponse({ ready: isWorkerReady }));
        return true;
    }
});

async function processOCR(dataUrl) {
    try {
        const worker = await initWorker();
        const result = await worker.recognize(dataUrl);

        // Remove excessive whitespace but preserve line breaks
        const fullText = result.data.text.trim();
        const confidence = result.data.confidence;

        return { 
            success: true, 
            text: fullText, 
            confidence: confidence
        };
    } catch (e) {
        console.error("OCR_FAIL:", e.message);
        return { success: false, error: e.message };
    }
}
