(function bootstrapChototUkAndroid() {
  window.__chototUkBooted = true;
  window.CHOTOT_UK = CHOTOT_UK;

  dismissAppPromoCookie();
  injectPromoStyle();
  keepComposerVisible();
  blockChatLabelSwipe();
  watchChatLabelSheet();
  watchNestedScroll();

  const translateSoon = debounce(() => {
    hideAppPromo();
    if (window.CHOTOT_UK) {
      CHOTOT_UK.translateDocument();
    }
  }, 80);

  function keepComposerVisible() {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const revealFocusedField = () => {
      const focused = document.activeElement;
      if (
        !focused ||
        (focused.tagName !== "INPUT" &&
          focused.tagName !== "TEXTAREA" &&
          !focused.isContentEditable)
      ) {
        return;
      }
      focused.scrollIntoView({ block: "center", inline: "nearest" });
    };
    viewport.addEventListener("resize", revealFocusedField);
    viewport.addEventListener("scroll", revealFocusedField);
    window.addEventListener("focusin", revealFocusedField);
  }

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
    const named = node.closest(
      ".showSafetyM, .showSafetyD, [class*='showSafety'], [role='dialog'], [aria-modal='true']",
    );
    if (named && named !== document.body) {
      return named;
    }
    let current = node;
    for (let depth = 0; depth < 10; depth += 1) {
      const parent = current.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) {
        break;
      }
      const parentText = (parent.innerText || "").replace(/\s+/g, " ").trim();
      const position = window.getComputedStyle(parent).position;
      const role = parent.getAttribute("role") || "";
      const isOverlay =
        position === "fixed" ||
        position === "sticky" ||
        position === "absolute" ||
        role === "dialog" ||
        parent.getAttribute("aria-modal") === "true";
      if (parentText.length > 420 && !isOverlay) {
        break;
      }
      current = parent;
      if (isOverlay) {
        break;
      }
    }
    return current;
  }

  function isFullPageRoot(node) {
    if (!node || node === document.body || node === document.documentElement) {
      return true;
    }
    if (node.parentElement !== document.body) {
      return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.height > window.innerHeight * 0.65 && rect.width > window.innerWidth * 0.65;
  }

  function hideNode(node) {
    if (!node || isFullPageRoot(node)) {
      return;
    }
    node.style.setProperty("display", "none", "important");
  }

  let didClickContinueInBrowser = false;

  function clickContinueInBrowser() {
    if (didClickContinueInBrowser) {
      return;
    }
    const nodes = document.querySelectorAll("a, button, [role='button']");
    for (const node of nodes) {
      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 48) {
        continue;
      }
      if (
        /(?:Tiếp tục|Продовжити|Ở lại|Mở|Xem)\s+(?:với trình duyệt|trên trình duyệt|bằng trình duyệt|в браузері|з браузером)/i.test(text) ||
        /in your browser/i.test(text)
      ) {
        didClickContinueInBrowser = true;
        node.click();
        return;
      }
    }
  }

  function hideOpenAppInterstitial() {
    clickContinueInBrowser();
    const nodes = document.querySelectorAll("a, button, [role='button'], h1, h2, p, span");
    for (const node of nodes) {
      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      if (
        !text ||
        text.length > 80 ||
        !/Mở bằng app|Відкрити в застосунку|Nhắn tin tiện hơn|Написати tiện hơn|ứng dụng app Chợ Tốt/i.test(text)
      ) {
        continue;
      }
      const root = findPromoRoot(node);
      if (!isFullPageRoot(root)) {
        hideNode(root);
      }
      break;
    }
  }

  function hideAppPromo() {
    dismissAppPromoCookie();
    clickContinueInBrowser();
    document.querySelectorAll(
      ".showSafetyM, .showSafetyD, a[href^='chotot-app:'], a[href^='intent:'], a[href*='web_to_app'], a[href*='utm_medium=top_banner'], img[src*='appstore-dowload'], img[src*='googleplay-dowload'], img[src*='uu-dai'], img[src*='uudai'], img[src*='floating_button'], a[href*='uu-dai']",
    ).forEach((node) => {
      const root = findPromoRoot(node);
      hideNode(isFullPageRoot(root) ? node : root);
    });
    hideOpenAppInterstitial();
    dismissChatLabelSheet();
    recoverIfPageBlank();
  }

  let recoverBlankTimer = 0;

  function recoverIfPageBlank() {
    window.clearTimeout(recoverBlankTimer);
    recoverBlankTimer = window.setTimeout(() => {
      const body = document.body;
      if (!body) {
        return;
      }
      const text = (body.innerText || "").replace(/\s+/g, " ").trim();
      if (text.length > 24) {
        return;
      }
      const href = String(location.href || "");
      if (/^about:/i.test(href) || /(?:dang-tin|dangtin|posting|web_to_app|app\.link)/i.test(href)) {
        location.replace("https://www.chotot.com/dashboard");
      }
    }, 450);
  }

  function isChatSurface() {
    const href = String(location.href || "");
    if (/chat\.chotot|\/chat(?:\/|$|\?|#)|tin-nhan|tinnhan/i.test(href)) {
      return true;
    }
    const field = document.querySelector(
      "textarea[placeholder], input[placeholder], [contenteditable='true'][placeholder], [data-placeholder]",
    );
    const hint = [
      field && field.getAttribute("placeholder"),
      field && field.getAttribute("aria-label"),
      field && field.getAttribute("data-placeholder"),
    ]
      .filter(Boolean)
      .join(" ");
    return /tin nhắn|повідомлення|Nhập tin|Введіть повідомлення/i.test(hint);
  }

  function canNodeScrollUp(node) {
    return !!(node && node.scrollHeight > node.clientHeight + 2 && node.scrollTop > 1);
  }

  function canNestedScrollUp(from) {
    if (canNodeScrollUp(document.scrollingElement) || canNodeScrollUp(document.documentElement)) {
      return true;
    }
    let current = from && from.nodeType === Node.ELEMENT_NODE ? from : from && from.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        canNodeScrollUp(current)
      ) {
        return true;
      }
      current = current.parentElement;
    }
    return isChatSurface();
  }

  function reportScrollSurface(from) {
    const chat = isChatSurface();
    const canUp = canNestedScrollUp(from);
    if (window.ChototUkNative && ChototUkNative.setChatSurface) {
      ChototUkNative.setChatSurface(chat);
    }
    if (window.ChototUkNative && ChototUkNative.setNestedScrollUp) {
      ChototUkNative.setNestedScrollUp(canUp || chat);
    }
  }

  function watchNestedScroll() {
    const onTouch = (event) => {
      reportScrollSurface(event.target);
    };
    document.addEventListener("touchstart", onTouch, { capture: true, passive: true });
    document.addEventListener("pointerdown", onTouch, { capture: true, passive: true });
    window.addEventListener(
      "scroll",
      () => {
        reportScrollSurface(document.activeElement);
      },
      { capture: true, passive: true },
    );
    reportScrollSurface(document.body);
    window.setTimeout(() => reportScrollSurface(document.body), 300);
    window.setTimeout(() => reportScrollSurface(document.body), 1200);
  }

  function findScrollParent(element) {
    let current = element;
    while (current && current !== document.body && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      const canScroll =
        (style.overflowY === "auto" || style.overflowY === "scroll" || style.overflowY === "overlay") &&
        current.scrollHeight > current.clientHeight + 2;
      if (canScroll) {
        return current;
      }
      current = current.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function blockChatLabelSwipe() {
    let startX = 0;
    let startY = 0;
    let scrollParent = null;
    let dismissTimer = 0;

    const onStart = (event) => {
      const point = event.touches ? event.touches[0] : event;
      if (!point) {
        return;
      }
      startX = point.clientX;
      startY = point.clientY;
      scrollParent = findScrollParent(event.target);
    };

    const onMove = (event) => {
      const point = event.touches ? event.touches[0] : event;
      if (!point) {
        return;
      }
      const dx = point.clientX - startX;
      const dy = point.clientY - startY;
      const atTop = !scrollParent || scrollParent.scrollTop <= 1;
      if (!atTop || dy < 6 || dy <= Math.abs(dx)) {
        return;
      }
      event.stopImmediatePropagation();
      if (event.cancelable) {
        event.preventDefault();
      }
      dismissChatLabelSheet();
      window.clearTimeout(dismissTimer);
      dismissTimer = window.setTimeout(dismissChatLabelSheet, 50);
    };

    document.addEventListener("touchstart", onStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onMove, { capture: true, passive: false });
    document.addEventListener("pointerdown", onStart, { capture: true, passive: true });
    document.addEventListener("pointermove", onMove, { capture: true, passive: false });
  }

  function isLabelSheetTitle(text) {
    return /^(?:Gắn phân loại|Додати мітку)$/i.test((text || "").replace(/\s+/g, " ").trim());
  }

  function looksLikeLabelSheet(text) {
    const normalized = (text || "").replace(/\s+/g, " ").trim();
    return (
      /(?:Gắn phân loại|Додати мітку)/i.test(normalized) &&
      /(?:Quản lý phân loại|Керувати мітками|Lưu|Зберегти)/i.test(normalized)
    );
  }

  function hideSheetRoot(node) {
    if (!node || node === document.body || node === document.documentElement) {
      return;
    }
    hideNode(node);
    const parent = node.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) {
      return;
    }
    const style = window.getComputedStyle(parent);
    if (
      (style.position === "fixed" || style.position === "absolute") &&
      parent.childElementCount <= 6
    ) {
      hideNode(parent);
    }
  }

  function dismissChatLabelSheet() {
    const titles = document.querySelectorAll("h1, h2, h3, h4, h5, [role='heading'], p, span, button, strong");
    for (const title of titles) {
      if (!isLabelSheetTitle(title.textContent)) {
        continue;
      }
      const root = title.closest(
        "[role='dialog'], [role='alertdialog'], [aria-modal='true']",
      ) || findPromoRoot(title);
      const closer = (root || title.parentElement)?.querySelector(
        "button[aria-label='Close'], button[aria-label='Đóng'], button[aria-label='Закрити']",
      );
      if (closer) {
        closer.click();
      }
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      hideSheetRoot(root);
    }
    const overlays = document.querySelectorAll(
      "[role='dialog'], [role='alertdialog'], [aria-modal='true'], [class*='drawer'], [class*='sheet'], [class*='modal'], [class*='overlay']",
    );
    for (const node of overlays) {
      if (looksLikeLabelSheet(node.innerText || node.textContent)) {
        hideSheetRoot(node);
      }
    }
  }

  function watchChatLabelSheet() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const nodes = mutation.type === "childList" ? mutation.addedNodes : [mutation.target];
        for (const node of nodes) {
          if (!node || node.nodeType !== 1) {
            continue;
          }
          const text = node.textContent || "";
          if (!/(?:Gắn phân loại|Додати мітку)/i.test(text)) {
            continue;
          }
          dismissChatLabelSheet();
          return;
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
    });
  }

  hideAppPromo();
  CHOTOT_UK.observe();
  Promise.resolve(CHOTOT_UK.loadSettings()).then(() => CHOTOT_UK.translateDocument());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hideAppPromo, { once: true });
  }

  window.addEventListener("load", hideAppPromo);
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

  setTimeout(hideAppPromo, 400);
  setTimeout(hideAppPromo, 3200);
})();
