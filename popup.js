document.addEventListener("DOMContentLoaded", function () {
  const statusDiv = document.getElementById("status");
  const downloadBtn = document.getElementById("download-btn");
  const copyBtn = document.getElementById("copy-btn");

  // Request data from the background script when the popup is opened
  chrome.runtime.sendMessage({ action: "getPopupData" }, function (response) {
    if (response.data) {
      statusDiv.textContent = "Data captured successfully!";
      downloadBtn.style.display = "block";
      copyBtn.style.display = "block";
    } else {
      statusDiv.textContent = "No data captured.";
      downloadBtn.style.display = "none";
      copyBtn.style.display = "none";
    }
  });

  downloadBtn.addEventListener("click", function () {
    chrome.runtime.sendMessage({ action: "downloadData" });
  });

  copyBtn.addEventListener("click", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "copyToClipboard" });
    });
  });
});
