(async function bootstrapChototUk() {
  await CHOTOT_UK.loadSettings();
  if (!CHOTOT_UK.isEnabled) {
    return;
  }

  CHOTOT_UK.observe();

  const translateSoon = (() => {
    let timer = 0;
    return () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => CHOTOT_UK.translateDocument(), 120);
    };
  })();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => CHOTOT_UK.translateDocument(), { once: true });
  } else {
    CHOTOT_UK.translateDocument();
  }

  window.addEventListener("load", () => CHOTOT_UK.translateDocument());
  window.addEventListener("popstate", translateSoon);
  window.addEventListener("hashchange", translateSoon);

  const historyMethods = ["pushState", "replaceState"];
  for (const methodName of historyMethods) {
    const original = history[methodName];
    history[methodName] = function patchedHistory() {
      const result = original.apply(this, arguments);
      translateSoon();
      return result;
    };
  }

  setTimeout(() => CHOTOT_UK.translateDocument(), 800);
  setTimeout(() => CHOTOT_UK.translateDocument(), 2000);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") {
      return;
    }
    if (changes.enabled) {
      CHOTOT_UK.setEnabled(changes.enabled.newValue !== false);
      if (changes.enabled.newValue === false) {
        window.location.reload();
      }
    }
    if (changes.useOnline) {
      CHOTOT_UK.setUseOnline(changes.useOnline.newValue !== false);
    }
  });
})();
