const enabledInput = document.getElementById("enabled");
const onlineInput = document.getElementById("useOnline");

chrome.storage.sync.get({ enabled: true, useOnline: false }, (settings) => {
  enabledInput.checked = settings.enabled !== false;
  onlineInput.checked = settings.useOnline === true;
});

enabledInput.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: enabledInput.checked });
});

onlineInput.addEventListener("change", () => {
  chrome.storage.sync.set({ useOnline: onlineInput.checked });
});
