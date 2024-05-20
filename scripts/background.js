/**
 * WebToLLM - A Chrome extension for capturing web content and transferring it to Large Language Models (LLMs)
 * @version 1.0.0
 * @author Justin M. Garzione (Le Pelley Avancée) <seigneur@lepelley.uk>
 * @license MIT
 * @description WebToLLM is a powerful Chrome extension designed to streamline the process of capturing, downloading, and copying webpage elements. Ideal for developers, designers, and researchers, this tool allows users to effortlessly extract and save webpage content, ensuring quick access to necessary data.
 * @see https://github.com/garzione/WebToLLM
 */

import { Logger } from "./logging.js";

const logger = new Logger("background.js");
let cachedData = null;
let iconsEnabled = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "takenology",
    title: "WebToLLM | Capture",
    contexts: ["all"],
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command === "capture_element") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "startLLMigrate" });
        }
      });
    } else if (command === "download_txt") {
      handleDownload("txt");
    } else if (command === "download_json") {
      handleDownload("json");
    } else if (command === "download_screenshot") {
      handleDownload("screenshot");
    } else if (command === "copy_to_clipboard") {
      handleClipboard();
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "takenology") {
    chrome.tabs.sendMessage(tab.id, {
      start: true,
      target: info.srcUrl,
      x: info.pageX,
      y: info.pageY,
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.log) {
    logger.log(message.log, message.source);
    sendResponse({ status: "log received" });
  } else if (message.action === "update") {
    cachedData = message.data;
    iconsEnabled = true;
    logger.log(`Updating data: ${JSON.stringify(cachedData)}`);

    // Ensure the content script is ready before sending the enableIcons message
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "checkContentScript" },
          (response) => {
            if (response && response.ready) {
              chrome.runtime.sendMessage({ enableIcons: true }, (response) => {
                if (chrome.runtime.lastError) {
                  logger.log(
                    `Error sending enableIcons message: ${chrome.runtime.lastError.message}`
                  );
                } else {
                  logger.log(
                    `enableIcons message sent: ${JSON.stringify(response)}`
                  );
                }
              });
            } else {
              logger.log("Content script is not ready to receive messages.");
            }
          }
        );
      }
    });

    sendResponse({ success: true });
  } else if (message.action === "download") {
    if (cachedData && message.format) {
      handleDownload(message.format, sendResponse);
    } else {
      sendResponse({
        success: false,
        message: "No cached data or format specified",
      });
    }
  } else if (message.action === "checkState") {
    sendResponse({ iconsEnabled });
  }
  return true; // Keeps the message channel open for async response
});

function handleDownload(format, sendResponse) {
  const currentDate = new Date().toISOString().slice(0, 10);
  const jsonString = JSON.stringify(cachedData, null, 2);
  let fileName = `${cachedData.websiteName}_${currentDate}`;
  logger.log(`Download started:\nfile${fileName}`);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      logger.log("No active tab found");
      showNotification("No active tab found", "failure");
      if (sendResponse)
        sendResponse({ success: false, message: "No active tab found" });
      return;
    }

    const tabId = tabs[0].id;
    switch (format) {
      case "copy":
        copyToClipboard(jsonString, tabId, sendResponse);
        break;
      case "screenshot":
        captureVisibleTabWithBoundingBox(
          cachedData.coordinates,
          fileName + ".png",
          tabId,
          sendResponse
        );
        break;
      case "json":
        sendDownloadMessage(
          jsonString,
          fileName + ".json",
          "application/json",
          tabId,
          sendResponse
        );
        break;
      case "txt":
        const content = `Website: ${cachedData.websiteName}\nHTML: ${cachedData.html}\nCSS: ${cachedData.css}`;
        sendDownloadMessage(
          content,
          fileName + ".txt",
          "text/plain",
          tabId,
          sendResponse
        );
        break;
      default:
        logger.log("Action method called with invalid format");
        showNotification("Invalid download format", "failure");
        if (sendResponse) sendResponse({ success: false });
    }
  });
}

function copyToClipboard(content, tabId, sendResponse) {
  chrome.tabs.sendMessage(
    tabId,
    { action: "copyToClipboard", data: content },
    (response) => {
      if (response.success) {
        logger.log("Data copied to clipboard");
        showNotification("Data copied to clipboard", "success");
        sendResponse({ success: true });
      } else {
        logger.log(`Failed to copy data to clipboard: ${response.message}`);
        showNotification("Failed to copy data to clipboard", "failure");
        sendResponse({ success: false, message: response.message });
      }
    }
  );
}

function sendDownloadMessage(data, fileName, mimeType, tabId, sendResponse) {
  chrome.tabs.sendMessage(
    tabId,
    { action: "downloadData", data, filename: fileName, mimeType },
    (response) => {
      if (response && response.success) {
        logger.log(`${fileName} downloaded`);
        showNotification("Data downloaded successfully", "success");
        sendResponse({ success: true });
      } else {
        logger.log(
          `Failed to download ${fileName}: ${
            response ? response.message : "Unknown error"
          }`
        );
        showNotification("Failed to download data", "failure");
        sendResponse({
          success: false,
          message: response ? response.message : "Unknown error",
        });
      }
    }
  );
}

function captureVisibleTabWithBoundingBox(
  coordinates,
  fileName,
  tabId,
  sendResponse
) {
  chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
    if (chrome.runtime.lastError) {
      logger.log(
        `Error capturing visible tab: ${chrome.runtime.lastError.message}`
      );
      showNotification("Error capturing visible tab", "failure");
      sendResponse({
        success: false,
        message: chrome.runtime.lastError.message,
      });
      return;
    }

    chrome.tabs.sendMessage(
      tabId,
      {
        action: "cropImage",
        dataUrl,
        coordinates,
        filename: fileName,
      },
      (response) => {
        if (response && response.success) {
          logger.log("Partial screenshot captured and saved");
          showNotification("Screenshot captured successfully", "success");
          sendResponse({ success: true });
        } else {
          logger.log(
            `Failed to capture partial screenshot: ${
              response ? response.message : "Unknown error"
            }`
          );
          showNotification("Failed to capture screenshot", "failure");
          sendResponse({
            success: false,
            message: response ? response.message : "Unknown error",
          });
        }
      }
    );
  });
}

function showNotification(message, type = "success") {
  const notificationOptions = {
    type: "basic",
    iconUrl: "icons/takenology.png",
    title: type === "success" ? "Success" : "Error",
    message: message,
  };

  if (chrome.notifications) {
    chrome.notifications.create("", notificationOptions, (notificationId) => {
      if (chrome.runtime.lastError) {
        logger.log(
          `Error creating notification: ${chrome.runtime.lastError.message}`
        );
      } else {
        logger.log(`Notification created with ID: ${notificationId}`);
      }
    });
  } else {
    console.log("Notifications API is not available");
  }
}
