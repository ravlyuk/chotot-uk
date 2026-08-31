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
      timer = window.setTimeout(() => CHOTOT_UK.translateDocument(), 80);
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
    if (original.__chototUkPatched) {
      continue;
    }
    const patched = function patchedHistory() {
      const result = original.apply(this, arguments);
      translateSoon();
      return result;
    };
    patched.__chototUkPatched = true;
    history[methodName] = patched;
  }

  setTimeout(() => CHOTOT_UK.translateDocument(), 400);
  setTimeout(() => CHOTOT_UK.translateDocument(), 1200);
  setTimeout(() => CHOTOT_UK.translateDocument(), 2800);

  if (!globalThis.chrome?.storage?.onChanged) {
    return;
  }
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
      CHOTOT_UK.setUseOnline(changes.useOnline.newValue === true);
    }
  });
})();
