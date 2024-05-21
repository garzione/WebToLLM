/**
 * Content script for the WebToLLM extension.
 * Responsible for capturing web content, handling user interactions,
 * and communicating with the background script.
 */

let currentElement = null;
let overlay = null;

const send_log = (message, source = "content_script.js") => {
  chrome.runtime.sendMessage({ log: message, source: source }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(
        `[${new Date().toLocaleString()}] From: ${source}:\nError sending log message:`,
        chrome.runtime.lastError
      );
    } else {
      console.log(
        `[${new Date().toLocaleString()}] From: ${source}:\nResponse from background:`,
        response
      );
    }
  });
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  send_log(`Received message: ${JSON.stringify(request)}`);

  if (request.start) {
    send_log("Starting Takenology with request: " + JSON.stringify(request));
    startTakenology(request)
      .then(() => {
        sendResponse({ success: true });
        send_log("Takenology started successfully.");
      })
      .catch((error) => {
        sendResponse({ success: false, message: error.message });
        send_log("Error starting Takenology: " + error.message);
      });
  } else if (request.action === "copyToClipboard") {
    copyToClipboard(request.data, sendResponse);
  } else if (request.action === "downloadData") {
    downloadData(
      request.data,
      request.filename,
      request.mimeType,
      sendResponse
    );
  } else if (request.action === "cropImage") {
    cropAndDownloadImage(
      request.dataUrl,
      request.coordinates,
      request.filename,
      sendResponse
    );
  } else if (request.action === "checkContentScript") {
    sendResponse({ ready: true });
  }
  return true;
});

function startTakenology(request) {
  return new Promise((resolve, reject) => {
    let targetElement = null;
    if (request.target) {
      targetElement = document.querySelector(`[src="${request.target}"]`);
    }

    if (
      !targetElement &&
      Number.isFinite(request.x) &&
      Number.isFinite(request.y)
    ) {
      targetElement = document.elementFromPoint(request.x, request.y);
    }

    currentElement = targetElement || document.body;
    highlightElement(currentElement);
    document.addEventListener("keydown", handleKeyPress);
    resolve();
  });
}

function copyToClipboard(data, sendResponse) {
  const tempElement = document.createElement("textarea");
  tempElement.value = data;
  document.body.appendChild(tempElement);
  tempElement.select();
  document.execCommand("copy");
  document.body.removeChild(tempElement);
  showNotification("Data copied to clipboard!", "success");
  sendResponse({ success: true });
  send_log("Data copied to clipboard successfully.");
}

function downloadData(data, filename, mimeType, sendResponse) {
  let blob;
  if (mimeType === "image/png") {
    const base64 = data.split(",")[1];
    const binary = atob(base64);
    const array = [];
    for (let i = 0; i < binary.length; i++) {
      array.push(binary.charCodeAt(i));
    }
    blob = new Blob([new Uint8Array(array)], { type: mimeType });
  } else {
    blob = new Blob([data], { type: mimeType });
  }
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = filename;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);
  showNotification("Data downloaded successfully!", "success");
  sendResponse({ success: true });
  send_log(`Data downloaded successfully as ${filename}.`);
}

function cropAndDownloadImage(dataUrl, coordinates, filename, sendResponse) {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = coordinates.width;
    canvas.height = coordinates.height;

    const x = coordinates.x - window.scrollX;
    const y = coordinates.y - window.scrollY;

    context.drawImage(
      image,
      x,
      y,
      coordinates.width,
      coordinates.height,
      0,
      0,
      coordinates.width,
      coordinates.height
    );
    const croppedDataUrl = canvas.toDataURL("image/png");
    downloadData(croppedDataUrl, filename, "image/png", sendResponse);
    send_log(`Partial screenshot captured and saved as ${filename}.`);
  };
  image.onerror = (error) => {
    console.error("Error loading image:", error);
    sendResponse({ success: false, message: "Error loading image" });
    send_log(`Error loading image for screenshot: ${error.message}`);
  };
  image.src = dataUrl;
}

function captureElement(element) {
  return new Promise((resolve, reject) => {
    if (element) {
      const rect = element.getBoundingClientRect();
      html2canvas(element, { logging: false, useCORS: true })
        .then((canvas) => {
          const screenshot = canvas.toDataURL("image/png");
          const data = {
            html: element.outerHTML.replace(/[\n\r\s]+/g, " ").trim(),
            css: Array.from(window.getComputedStyle(element))
              .filter(
                (prop) =>
                  ![
                    "position",
                    "top",
                    "right",
                    "bottom",
                    "left",
                    "z-index",
                  ].includes(prop)
              )
              .map(
                (prop) =>
                  `${prop}:${window
                    .getComputedStyle(element)
                    .getPropertyValue(prop)
                    .trim()};`
              )
              .join(""),
            screenshot: screenshot,
            websiteName: window.location.hostname,
            coordinates: {
              x: rect.left + window.scrollX,
              y: rect.top + window.scrollY,
              width: rect.width,
              height: rect.height,
            },
          };
          chrome.runtime.sendMessage(
            { action: "update", data: data },
            (response) => {
              if (response && response.success) {
                showNotification("HTML selection made!", "success");
                chrome.runtime.sendMessage({ action: "enableIcons" });
                resolve();
                send_log("HTML selection captured successfully.");
              } else {
                showNotification("Failed to cache data", "failure");
                reject(new Error("Failed to cache data"));
                send_log("Failed to cache captured HTML selection.");
              }
            }
          );
        })
        .catch((error) => {
          showNotification("Error capturing element", "failure");
          reject(error);
          send_log(`Error capturing element: ${error.message}`);
        });
    } else {
      showNotification("Takenology failed to capture the element.", "failure");
      reject(new Error("Takenology failed to capture the element."));
      send_log("Failed to capture the element.");
    }
  });
}

function showNotification(message, type = "success") {
  const notification = document.createElement("div");
  const icon = document.createElement("img");
  icon.src = chrome.runtime.getURL("icons/logo/web2llm.png");
  icon.style.height = "20px";
  icon.style.marginRight = "10px";

  notification.appendChild(icon);
  notification.appendChild(document.createTextNode(message));

  notification.style.position = "fixed";
  notification.style.bottom = "20px";
  notification.style.left = "50%";
  notification.style.transform = "translateX(-50%)";
  notification.style.padding = "10px";
  notification.style.borderRadius = "4px";
  notification.style.zIndex = "1000";
  notification.style.color = "white";
  notification.style.backgroundColor =
    type === "success" ? "#4CAF50" : "#F44336";

  document.body.appendChild(notification);
  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  }, 3000);
}

function handleKeyPress(event) {
  if (event.key === "ArrowUp") {
    event.preventDefault();
    const parentElement = currentElement.parentElement;
    if (parentElement && parentElement !== document.documentElement) {
      currentElement = parentElement;
      highlightElement(currentElement);
      send_log("Moved to parent element.");
    }
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    const childElement = currentElement.firstElementChild;
    if (childElement) {
      currentElement = childElement;
      highlightElement(currentElement);
      send_log("Moved to child element.");
    }
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    const previousSibling = currentElement.previousElementSibling;
    if (previousSibling) {
      currentElement = previousSibling;
      highlightElement(currentElement);
      send_log("Moved to previous sibling element.");
    }
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    const nextSibling = currentElement.nextSibling;
    if (nextSibling) {
      currentElement = nextSibling;
      highlightElement(currentElement);
      send_log("Moved to next sibling element.");
    }
  } else if (event.key === "Enter") {
    event.preventDefault();
    removeOverlay();
    captureElement(currentElement)
      .then(() => {
        document.removeEventListener("keydown", handleKeyPress);
        send_log("Element captured successfully on Enter key.");
      })
      .catch((error) => {
        console.error(`Error capturing element: ${error}`);
        send_log(`Error capturing element on Enter key: ${error.message}`);
      });
  } else if (event.key === "Escape") {
    event.preventDefault();
    removeOverlay();
    showNotification("Exiting viewer", "success");
    document.removeEventListener("keydown", handleKeyPress);
    send_log("Exited viewer with Escape key.");
  }
}

function highlightElement(element) {
  if (!element) return;

  removeOverlay();
  overlay = document.createElement("div");
  overlay.id = "takenology-overlay";
  const rect = element.getBoundingClientRect();
  overlay.style.position = "absolute";
  overlay.style.top = `${rect.top + window.scrollY}px`;
  overlay.style.left = `${rect.left + window.scrollX}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.border = "2px solid #4CAF50";
  overlay.style.zIndex = "9999";
  overlay.style.pointerEvents = "none";
  document.body.appendChild(overlay);
  send_log("Element highlighted.");
}

function removeOverlay() {
  if (overlay) {
    document.body.removeChild(overlay);
    overlay = null;
    send_log("Overlay removed.");
  }
}

// Ensure overlay is removed when navigating away from the page
window.addEventListener("beforeunload", () => {
  removeOverlay();
});
