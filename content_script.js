currentElement = null;
overlay = null;

function captureElement(element) {
  if (element) {
    const html = element.outerHTML.replace(/[\n\r\s]+/g, " ").trim();
    const css = Array.from(window.getComputedStyle(element))
      .filter(
        (prop) =>
          !["position", "top", "right", "bottom", "left", "z-index"].includes(
            prop
          )
      )
      .map(
        (prop) =>
          `${prop}:${window
            .getComputedStyle(element)
            .getPropertyValue(prop)
            .trim()};`
      )
      .join("");

    html2canvas(element, { logging: false, useCORS: true }).then((canvas) => {
      const screenshot = canvas.toDataURL("image/png");
      const data = {
        html,
        css,
        screenshot,
      };
      console.log(`DATA: ${data}`);
      chrome.runtime.sendMessage({ action: "updateCachedData", data: data });
    });
  } else {
    showNotification("Takenology failed to capture the element.", "failure");
  }
}

function showNotification(message, type) {
  const notification = document.createElement("div");
  notification.textContent = message;
  notification.style.position = "fixed";
  notification.style.bottom = "20px";
  notification.style.left = "50%";
  notification.style.transform = "translateX(-50%)";
  notification.style.padding = "10px";
  notification.style.borderRadius = "4px";
  notification.style.zIndex = "9999";
  notification.style.color = "white";

  if (type === "success") {
    notification.style.backgroundColor = "#4CAF50";
  } else if (type === "failure") {
    notification.style.backgroundColor = "#F44336";
  }

  document.body.appendChild(notification);
  setTimeout(() => {
    document.body.removeChild(notification);
  }, 3000);
}

function handleKeyPress(event) {
  if (event.key === "ArrowUp") {
    event.preventDefault();
    const parentElement = currentElement.parentElement;
    if (parentElement && parentElement !== document.documentElement) {
      currentElement = parentElement;
      highlightElement(currentElement);
    }
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    const childElement = currentElement.firstElementChild;
    if (childElement) {
      currentElement = childElement;
      highlightElement(currentElement);
    }
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    const previousSibling = currentElement.previousElementSibling;
    if (previousSibling) {
      currentElement = previousSibling;
      highlightElement(currentElement);
    }
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    const nextSibling = currentElement.nextElementSibling;
    if (nextSibling) {
      currentElement = nextSibling;
      highlightElement(currentElement);
    }
  } else if (event.key === "Enter") {
    event.preventDefault();
    removeOverlay();
    captureElement(currentElement);
    showNotification("HTML selection made!", "success");
    document.removeEventListener("keydown", handleKeyPress);
  } else if (event.key === "Escape") {
    event.preventDefault();
    removeOverlay();
    showNotification("Exiting viewer", "success");
    document.removeEventListener("keydown", handleKeyPress);
  }
}

function highlightElement(element) {
  if (!element) return;

  removeOverlay();
  overlay = document.createElement("div");
  overlay.id = "llmigrate-overlay";
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
}

function removeOverlay() {
  if (overlay) {
    document.body.removeChild(overlay);
    overlay = null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startLLMigrate") {
    let targetElement = null;
    if (request.target) {
      targetElement = document.querySelector(`[src="${request.target}"]`);
    }
    if (!targetElement && isFinite(request.x) && isFinite(request.y)) {
      targetElement = document.elementFromPoint(request.x, request.y);
    }
    currentElement = targetElement || document.body;
    highlightElement(currentElement);
    document.addEventListener("keydown", handleKeyPress);
  } else if (request.action === "showNotification") {
    showNotification(request.message, request.type);
  } else if (request.action === "copyToClipboard") {
    chrome.runtime.sendMessage({ action: "getPopupData" }, (response) => {
      if (response.data) {
        const jsonString = JSON.stringify(response.data, null, 2);
        const tempElement = document.createElement("textarea");
        tempElement.value = jsonString;
        document.body.appendChild(tempElement);
        tempElement.select();
        document.execCommand("copy");
        document.body.removeChild(tempElement);
        showNotification("Data copied to clipboard!", "success");
      } else {
        showNotification("No data available to copy.", "failure");
      }
    });
  } else if (request.action === "downloadData") {
    const blob = new Blob([request.data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = request.filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
    showNotification("Data downloaded successfully!", "success");
  }
});
