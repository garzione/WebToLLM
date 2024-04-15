let cachedData = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "llmigrate",
    title: "LLMigrate",
    contexts: ["all"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "llmigrate") {
    chrome.tabs.sendMessage(tab.id, {
      action: "startLLMigrate",
      target: info.srcUrl,
      x: info.pageX,
      y: info.pageY,
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received onMessage!");
  if (request.action === "updateCachedData") {
    cachedData = request.data;
    console.log(`CACHED DATA: ${JSON.stringify(cachedData)}`);
    sendResponse({ success: true });
  } else if (request.action === "getPopupData") {
    sendResponse({ data: cachedData });
  } else if (request.action === "downloadData") {
    if (cachedData) {
      const jsonString = JSON.stringify(cachedData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "downloadData",
          data: jsonString,
          filename: "llmigrate_data.json",
        });
      });
    }
    sendResponse({ success: true });
  }
  return true;
});
