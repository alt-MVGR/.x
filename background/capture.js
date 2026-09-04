import { ScreenshotError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';
import { CONFIG } from '../config/constants.js';
import { processImageForOCR } from '../utils/imageProcessor.js';

/**
 * Handles capturing the visible tab.
 * Wraps it in a try/catch to prevent Uncaught Promise Rejections if activeTab is lost.
 */
export async function captureScreen() {
  let activeTabId = null;

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) throw new Error("No active tab found for capture.");
    activeTabId = activeTab.id;
    
    // Fetch dynamic image quality from synced config
    const { globalConfig } = await chrome.storage.local.get("globalConfig");
    const imageQuality = globalConfig?.imageQuality !== undefined ? globalConfig.imageQuality : CONFIG.IMAGE_QUALITY;

    Logger.debug("Capture", `Initiating captureVisibleTab with quality ${imageQuality}...`);
    
    const screenshot = await chrome.tabs.captureVisibleTab(activeTab.windowId, { 
      format: 'jpeg', 
      quality: imageQuality 
    });

    if (!screenshot || typeof screenshot !== 'string' || !screenshot.startsWith('data:image')) {
      throw new ScreenshotError("Capture returned invalid data.");
    }

    if (screenshot.length < 1000) {
      throw new ScreenshotError("Captured image is too small, likely corrupted or empty.");
    }

    // Attempt to crop if calibration or cropBox data exists
    const storage = await chrome.storage.local.get(["calibration", "cropBox"]);
    const calib = storage["calibration"];
    const cropBox = storage["cropBox"];
    
    let cropX, cropY, cropW, cropH;
    let shouldCrop = false;

    if (cropBox) {
      Logger.debug("Capture", "cropBox data found. Cropping image...");
      shouldCrop = true;
      cropX = cropBox.x;
      cropY = cropBox.y;
      cropW = cropBox.w;
      cropH = cropBox.h;
    } else if (calib && calib.points && calib.points.length === 4) {
      Logger.debug("Capture", "Calibration data found. Cropping image...");
      shouldCrop = true;
      const pts = calib.points;
      const minX = Math.min(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
      const maxX = Math.max(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
      const minY = Math.min(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
      const maxY = Math.max(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
      
      const width = maxX - minX;
      const height = maxY - minY;
      
      // Add a small padding (e.g., 20px) to ensure we don't cut off text tightly
      const pad = 20;
      cropX = Math.max(0, minX - pad);
      cropY = Math.max(0, minY - pad);
      cropW = width + (pad * 2);
      cropH = height + (pad * 2);
    }

    if (shouldCrop) {
      try {
          let dpr = 1;
          if (cropBox && cropBox.dpr) dpr = cropBox.dpr;
          else if (calib && calib.dpr) dpr = calib.dpr;

          const realX = cropX * dpr;
          const realY = cropY * dpr;
          const realW = cropW * dpr;
          const realH = cropH * dpr;

          // Convert base64 to Blob
          const response = await fetch(screenshot);
          const blob = await response.blob();
          
          // Create ImageBitmap
          const bitmap = await createImageBitmap(blob);
          
          // Phase 2: Smart Image Preprocessing (Dynamic Scaling + Grayscale + Contrast)
          const processedBase64 = await processImageForOCR(bitmap, realX, realY, realW, realH);
          
          // Phase 3: Direct Native Vision Pipeline (Sub-500ms)
          // We bypass the incredibly slow local Tesseract OCR (~800ms bottleneck) entirely.
          Logger.info("Capture", "Bypassing Local OCR: Sending Native Image directly to Vision LLM...");
          return { type: "image", content: finalBase64 };
          throw new ScreenshotError("OCR failed to extract readable text from this region. Please try cropping closer to the text.");
      } catch (cropErr) {
          if (cropErr instanceof ScreenshotError) {
              throw cropErr;
          }
          Logger.warn("Capture", "Cropping failed:", cropErr.message);
          throw new ScreenshotError("Please crop a smaller area!");
      }
    } else {
        throw new ScreenshotError("Please crop a smaller area!");
    }
    
  } catch (error) {
    Logger.error("Capture", "captureVisibleTab failed:", error.message);
    throw new ScreenshotError(`Failed to capture screenshot: ${error.message}`);
  }
}
