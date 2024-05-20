/**
 * Popup script for the WebToLLM extension.
 * Handles the user interface and interactions within the popup window.
 */

import { Logger } from "./scripts/logging.js";

const logger = new Logger("popup.js");

window.addEventListener("load", function () {
  logger.log("Popup fully loaded");

  const downloadJsonBtn = document.getElementById("download-json");
  const downloadTextBtn = document.getElementById("download-text");
  const downloadScreenshotBtn = document.getElementById("download-screenshot");
  const copyBtn = document.getElementById("copy");
  let disabled = true; // Initial state

  function downloadData(format) {
    logger.log(`Sending download - Format: ${format}`);
    if (!disabled) {
      chrome.runtime.sendMessage({ action: "download", format: format });
    }
  }

  downloadJsonBtn.addEventListener("click", function () {
    downloadData("json");
  });

  downloadTextBtn.addEventListener("click", function () {
    downloadData("txt");
  });

  downloadScreenshotBtn.addEventListener("click", function () {
    downloadData("screenshot");
  });

  copyBtn.addEventListener("click", function () {
    downloadData("copy");
  });

  function setIconsEnabled(enabled) {
    const buttons = [
      downloadJsonBtn,
      downloadTextBtn,
      copyBtn,
      downloadScreenshotBtn,
    ];
    disabled = !enabled; // Update the state
    buttons.forEach((btn) => {
      btn.disabled = !enabled;
      btn.querySelector("img").style.opacity = enabled ? 1 : 0.5;
    });
  }

  // Initial state: buttons disabled
  setIconsEnabled(false);

  // Listen for the message that data has been captured
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "enableIcons") {
      setIconsEnabled(true);
      logger.log("Icons enabled after data capture");
      sendResponse({ success: true });
    }
  });

  // Check if cachedData is already available and enable icons
  chrome.runtime.sendMessage({ action: "checkState" }, (response) => {
    if (response && response.iconsEnabled) {
      setIconsEnabled(true);
      logger.log("Icons enabled from existing cached data");
    }
  });
});
