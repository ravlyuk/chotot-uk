(function bootstrapChototUkAndroid() {
  window.__chototUkBooted = true;
  window.CHOTOT_UK = CHOTOT_UK;

  dismissAppPromoCookie();
  injectPromoStyle();

  const translateSoon = debounce(() => {
    hideAppPromo();
    if (window.CHOTOT_UK) {
      CHOTOT_UK.translateDocument();
    }
  }, 80);

  function debounce(fn, waitMs) {
    let timer = 0;
    return () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, waitMs);
    };
  }

  function dismissAppPromoCookie() {
    document.cookie = "showTopBanner=false; path=/; max-age=2592000; SameSite=Lax";
    document.cookie = "showTopBanner=false; path=/; domain=.chotot.com; max-age=2592000; SameSite=Lax";
  }

  function injectPromoStyle() {
    if (document.getElementById("chotot-uk-hide-app-promo")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "chotot-uk-hide-app-promo";
    style.textContent = `
      .showSafetyM,
      .showSafetyD,
      [class*="showSafetyM"],
      [class*="showSafetyD"],
      a[href^="chotot-app:"],
      a[href*="web_to_app"],
      a[href*="utm_medium=top_banner"],
      a[href*="chotot-web.app.link"],
      img[alt="floating_button_web"],
      a[href*="floatingbutton"],
      a[href*="utm_medium=floatingbutton"],
      a[href*="play.google.com/store/apps/details?id=com.chotot"],
      a[href*="itunes.apple.com"][href*="chotot"],
      img[src*="appstore-dowload"],
      img[src*="googleplay-dowload"],
      img[src*="appstore-download"],
      img[src*="googleplay-download"],
      img[alt="floating_button_web"],
      img[src*="uu-dai"],
      img[src*="uudai"],
      img[src*="floating_button"],
      a[href*="uu-dai"],
      a[href*="uudai"] {
        display: none !important;
        height: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      body {
        --app-wrapper-extra-height: 0px !important;
      }
    `;
    (document.documentElement || document.head).appendChild(style);
  }

  function findPromoRoot(node) {
    const named = node.closest(".showSafetyM, .showSafetyD, [class*='showSafety']");
    if (named && named !== document.body) {
      return named;
    }
    let current = node;
    for (let depth = 0; depth < 8; depth += 1) {
      const parent = current.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) {
        break;
      }
      const parentText = (parent.innerText || "").replace(/\s+/g, " ").trim();
      const position = window.getComputedStyle(parent).position;
      const isOverlay = position === "fixed" || position === "sticky";
      if (parentText.length > 280 && !isOverlay) {
        break;
      }
      current = parent;
      if (isOverlay) {
        break;
      }
    }
    return current;
  }

  function hideNode(node) {
    if (!node || node === document.body || node === document.documentElement) {
      return;
    }
    node.style.setProperty("display", "none", "important");
  }

  function hideAppPromo() {
    dismissAppPromoCookie();
    document.querySelectorAll(
      ".showSafetyM, .showSafetyD, a[href^='chotot-app:'], a[href*='web_to_app'], a[href*='utm_medium=top_banner'], img[src*='appstore-dowload'], img[src*='googleplay-dowload'], img[src*='uu-dai'], img[src*='uudai'], img[src*='floating_button'], a[href*='uu-dai']",
    ).forEach((node) => hideNode(findPromoRoot(node)));
  }

  hideAppPromo();
  CHOTOT_UK.observe();
  Promise.resolve(CHOTOT_UK.loadSettings()).then(() => CHOTOT_UK.translateDocument());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      hideAppPromo();
      CHOTOT_UK.translateDocument();
    }, { once: true });
  } else {
    CHOTOT_UK.translateDocument();
  }

  window.addEventListener("load", () => {
    hideAppPromo();
    CHOTOT_UK.translateDocument();
  });
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

  setTimeout(() => {
    hideAppPromo();
    CHOTOT_UK.translateDocument();
  }, 400);
  setTimeout(hideAppPromo, 3200);
})();
