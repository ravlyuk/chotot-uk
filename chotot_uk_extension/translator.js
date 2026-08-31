const CHOTOT_UK = (() => {
  const VIETNAMESE_RE =
    /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "SVG",
    "CANVAS",
    "CODE",
    "KBD",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "OPTION",
    "IMG",
    "VIDEO",
    "AUDIO",
    "SOURCE",
  ]);

  const ATTRS_TO_TRANSLATE = ["placeholder", "title", "aria-label", "alt"];
  const ATTR_ONLY_TAGS = new Set(["INPUT", "TEXTAREA", "IMG"]);

  const alwaysPhrases =
    typeof CHOTOT_UK_ALWAYS_PHRASES === "undefined" ? new Set() : CHOTOT_UK_ALWAYS_PHRASES;
  const phraseRegexes = Object.entries(CHOTOT_UK_PHRASES)
    .sort((left, right) => right[0].length - left[0].length)
    .map(([source, target]) => ({
      target,
      sourceLength: source.length,
      always: alwaysPhrases.has(source),
      re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(source)}(?![\\p{L}\\p{N}])`, "giu"),
    }));

  const memoryCache = new Map();
  let isEnabled = true;
  let useOnline = false;
  let isMutating = false;
  const pendingOnline = new Map();
  const onlineResolvers = new Map();
  const pendingWalkRoots = new Set();
  let onlineTimer = 0;
  let onlineRequestId = 0;
  let walkTimer = 0;

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function preserveCase(original, translated) {
    const trimmed = original.trim();
    if (trimmed && trimmed === trimmed.toUpperCase() && /[A-ZÀ-ỴА-ЯІЇЄҐ]/.test(trimmed)) {
      return translated.toUpperCase();
    }
    return translated;
  }

  function isFreeformText(text) {
    const trimmed = text.trim();
    if (trimmed.length > 80) {
      return true;
    }
    return trimmed.length > 42 && /[.!?]/.test(trimmed);
  }

  function applyDictionary(text) {
    if (!text || !text.trim()) {
      return text;
    }

    const skipFragments = isFreeformText(text);
    let result = text;
    for (const pattern of CHOTOT_UK_PATTERNS) {
      if (skipFragments && !pattern.always) {
        continue;
      }
      result = result.replace(pattern.re, pattern.to);
    }
    for (const { re, target, sourceLength, always } of phraseRegexes) {
      if (skipFragments && sourceLength < 28 && !always) {
        continue;
      }
      re.lastIndex = 0;
      result = result.replace(re, (match) => preserveCase(match, target));
    }
    result = result.replace(/Опубліковано(?=\d)/g, "Опубліковано ");
    result = result.replace(/\bVNĐ\b/g, "VND");
    return result;
  }

  function stillLooksVietnamese(text) {
    const stripped = text
      .replace(/\b(VND|VNĐ)\b/gi, "")
      .replace(/([\d\s.,])[đĐ](?=\s|$)/g, "$1");
    return VIETNAMESE_RE.test(stripped);
  }

  function isPriceText(text) {
    return /^[\d\s.,]+(?:\s*(?:VND|VNĐ|đ|₫))?\s*$/i.test((text || "").trim());
  }

  function maskVnd(text) {
    return text.replace(/\bVNĐ\b/g, "VND").replace(/\bVND\b/gi, "XXXVNDXXX");
  }

  function unmaskVnd(source, translated) {
    let result = (translated || "").replace(/XXXVNDXXX/gi, "VND").replace(/\bVNĐ\b/g, "VND");
    if (/\b(VND|VNĐ)\b/i.test(source) && !/\bVND\b/.test(result)) {
      result = result.replace(/\b(?:вн\.?\s*д\.?|донги?|донгів)\b/gi, "VND");
    }
    return result;
  }

  const ADDRESS_UNIT_RE =
    /\b(Phường|Quận|Huyện|Xã|Thị\s+trấn|Thị\s+xã|Tỉnh|Thành phố|Tp\.|TP\.|P\.|Q\.|Đường|Ngõ|Ngách|Ấp|Thôn)\b/i;
  const ADDRESS_CITY_RE =
    /\b(Hà Nội|Hồ Chí Minh|TP\.?\s*HCM|Đà Nẵng|Hải Phòng|Cần Thơ|Huế|An Giang|Bình Dương|Đồng Nai)\b/i;
  const BREADCRUMB_CATEGORY_RE =
    /\b(Xe máy|Ô tô|Xe đạp|Xe tải|Chợ Tốt|Bất động sản|Việc làm|Đồ điện tử|Phụ tùng)\b/i;

  const BREADCRUMB_PREFIXES = [
    "Xe máy điện",
    "Xe đạp điện",
    "Ô tô điện",
    "Xe tải, xe ben",
    "Phụ tùng xe",
    "Bất động sản",
    "Đồ điện tử",
    "Việc làm",
    "Chợ Tốt Xe",
    "Chợ Tốt",
    "Xe máy",
    "Xe đạp",
    "Xe tải",
    "Phụ tùng",
    "Ô tô",
  ].sort((left, right) => right.length - left.length);

  function isLocationRest(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) {
      return false;
    }
    return ADDRESS_UNIT_RE.test(trimmed) || ADDRESS_CITY_RE.test(trimmed);
  }

  function translateBreadcrumbSegment(segment) {
    const leading = segment.match(/^\s*/)?.[0] || "";
    const trailing = segment.match(/\s*$/)?.[0] || "";
    const trimmed = segment.trim();
    if (!trimmed) {
      return segment;
    }
    if (isLocationRest(trimmed) && !BREADCRUMB_PREFIXES.some((prefix) => trimmed === prefix || trimmed.startsWith(`${prefix} `))) {
      return segment;
    }
    for (const prefix of BREADCRUMB_PREFIXES) {
      if (trimmed === prefix) {
        return `${leading}${applyDictionary(prefix)}${trailing}`;
      }
      if (trimmed.startsWith(`${prefix} `)) {
        const rest = trimmed.slice(prefix.length).trim();
        if (isLocationRest(rest)) {
          return `${leading}${applyDictionary(prefix)} ${rest}${trailing}`;
        }
      }
    }
    return `${leading}${applyDictionary(trimmed)}${trailing}`;
  }

  function translateBreadcrumbText(text) {
    if (!text.includes("/")) {
      return translateBreadcrumbSegment(text);
    }
    return text.split("/").map((part) => translateBreadcrumbSegment(part)).join("/");
  }

  const UI_LOCATION_PROMPT_RE =
    /\b(Chọn|Tìm kiếm|Tìm theo|Nhập vị trí|Nhập|Xoá|Xóa|Áp dụng|Застосувати|quanh bạn|Khu vực|Sắp xếp|Tin mới nhất|Giá thấp|Giá cao|Радіус|Місце пошуку|Пошук навколо)\b/i;

  function isUiLocationPrompt(text) {
    return UI_LOCATION_PROMPT_RE.test((text || "").trim());
  }

  function isLocationNameOnly(text) {
    const trimmed = (text || "").replace(/\s+/g, " ").trim();
    if (!trimmed || trimmed.length > 80 || isUiLocationPrompt(trimmed)) {
      return false;
    }
    return isLocationRest(trimmed);
  }

  function isCompanyLegalText(text) {
    return /GPDKKD|GPMXH|CÔNG TY TNHH|Người đại diện|Chịu trách nhiệm nội dung|Địa chỉ:\s*Tầng|Toà nhà UOA|Tân Trào|Sở KH|Bộ Thông tin|GIẤY PHÉP|ЄДР|ЛІЦЕНЗІЯ|trogiup@chotot/i.test(
      text || "",
    );
  }

  const RELATIVE_TIME_RE =
    /(?:Cập nhật|Đăng|Hoạt động|Оновлено|Опубліковано|Був онлайн)\s+(?:\d+\s+)?(?:giây|phút|giờ|ngày|tuần|tháng|năm|с|хв|год|дн\.|тиж\.|міс\.|р\.|một\s+ngày|hôm\s+qua|hôm\s+nay|vừa\s+xong)(?:\s*(?:trước|тому))?/gi;

  function hasRelativeTimeClause(text) {
    RELATIVE_TIME_RE.lastIndex = 0;
    return RELATIVE_TIME_RE.test(text || "");
  }

  function isRelativeTimeText(text) {
    const trimmed = (text || "").replace(/\s+/g, " ").trim();
    if (!trimmed || trimmed.length > 72 || !hasRelativeTimeClause(trimmed)) {
      return false;
    }
    RELATIVE_TIME_RE.lastIndex = 0;
    const leftover = trimmed.replace(RELATIVE_TIME_RE, "").replace(/[·•|,.\-–]/g, "").trim();
    return leftover.length === 0;
  }

  function translateTimeClauses(text) {
    RELATIVE_TIME_RE.lastIndex = 0;
    return text.replace(RELATIVE_TIME_RE, (match) => applyDictionary(match));
  }

  function isAddressText(text) {
    const trimmed = (text || "").replace(/\s+/g, " ").trim();
    if (isCompanyLegalText(trimmed) || isRelativeTimeText(trimmed)) {
      return false;
    }
    if (trimmed.length < 4 || trimmed.length > 160) {
      return false;
    }
    if (isUiLocationPrompt(trimmed)) {
      return false;
    }
    if (BREADCRUMB_CATEGORY_RE.test(trimmed) || (trimmed.match(/\//g) || []).length >= 2) {
      return false;
    }
    if (/[.!?]/.test(trimmed) && trimmed.length > 55) {
      return false;
    }
    if (ADDRESS_UNIT_RE.test(trimmed)) {
      return true;
    }
    return /,/.test(trimmed) && ADDRESS_CITY_RE.test(trimmed);
  }

  function isBreadcrumbElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    if (element.tagName === "NAV" || element.getAttribute("aria-label") === "breadcrumb") {
      return true;
    }
    const cls = element.getAttribute("class") || "";
    if (/breadcrumb/i.test(cls)) {
      return true;
    }
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length === 0 || text.length > 240) {
      return false;
    }
    const slashCount = (text.match(/\//g) || []).length;
    return slashCount >= 2 && BREADCRUMB_CATEGORY_RE.test(text);
  }

  function isInsideBreadcrumb(node) {
    let element = node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    for (let depth = 0; depth < 8 && element && element !== document.body; depth += 1) {
      if (isBreadcrumbElement(element)) {
        return true;
      }
      element = element.parentElement;
    }
    return false;
  }

  function isInsideLocationPicker(node) {
    let element = node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    for (let depth = 0; depth < 12 && element && element !== document.body; depth += 1) {
      const role = element.getAttribute?.("role") || "";
      if (role === "dialog" || role === "alertdialog") {
        return true;
      }
      const cls = element.getAttribute?.("class") || "";
      if (/(?:^|[\s_-])(modal|drawer|dialog|bottomsheet|bottom-sheet|popup)(?:$|[\s_-])/i.test(cls)) {
        return true;
      }
      const raw = element.textContent || "";
      if (raw.length <= 800) {
        const snippet = raw.replace(/\s+/g, " ");
        if (/Tìm kiếm quanh bạn|Пошук навколо вас/.test(snippet)) {
          return true;
        }
      }
      if (element.tagName === "FORM" && raw.length <= 1500 && /Sắp xếp theo|Chọn tỉnh thành|Khu vực/.test(raw)) {
        return true;
      }
      element = element.parentElement;
    }
    return false;
  }

  function isInsideAddress(node) {
    if (isInsideBreadcrumb(node) || isInsideLocationPicker(node)) {
      return false;
    }
    const ownText =
      node && node.nodeType === Node.TEXT_NODE ? node.nodeValue || "" : (node && node.textContent) || "";
    if (isRelativeTimeText(ownText)) {
      return false;
    }
    let element = node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    for (let depth = 0; depth < 5 && element && element !== document.body; depth += 1) {
      const href = element.getAttribute?.("href") || "";
      if (/maps\.google|google\.com\/maps|maps\.app\.goo/i.test(href)) {
        return true;
      }
      const cls = element.getAttribute?.("class") || "";
      if (/\b(address|adAddress|ad-address|AdLocation|areaItem)\b/i.test(cls)) {
        return true;
      }
      if (element.getAttribute?.("itemprop") === "address") {
        return true;
      }
      if (element.childElementCount <= 10) {
        const text = (element.textContent || "").replace(/\s+/g, " ").trim();
        if (
          text.length > 0 &&
          text.length <= 220 &&
          !hasRelativeTimeClause(text) &&
          isAddressText(text)
        ) {
          return true;
        }
      }
      element = element.parentElement;
    }
    return false;
  }

  function shouldSkipElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    if (SKIP_TAGS.has(element.tagName)) {
      if (ATTR_ONLY_TAGS.has(element.tagName)) {
        translateAttributes(element);
      }
      return true;
    }
    if (element.isContentEditable) {
      return true;
    }
    return false;
  }

  function nextSiblingText(node) {
    let current = node.nextSibling;
    while (current) {
      const text = current.nodeType === Node.TEXT_NODE ? current.nodeValue : current.textContent;
      if (text && text.trim()) {
        return text;
      }
      current = current.nextSibling;
    }
    return "";
  }

  const uiPhraseLookup = new Set(
    Object.keys(CHOTOT_UK_PHRASES).map((key) => key.toLowerCase()),
  );

  function isProtectedUsername(text) {
    const trimmed = (text || "").trim();
    if (!trimmed || trimmed.length > 32) {
      return false;
    }
    if (uiPhraseLookup.has(trimmed.toLowerCase())) {
      return false;
    }
    return /^[A-Za-z][A-Za-z0-9._]{1,24}$/.test(trimmed);
  }

  const IDENTITY_UI_RE =
    /Hoạt động|Đang trả giá|Đang Online|Đang hoạt động|Đang Онлайн|Cập nhật|Xem trang|tương tự|trước|Online|Онлайн|Торг|відгук|Từ chối|Chấp nhận|Tỷ lệ|phản hồi|Người theo dõi|Theo dõi|Đã tham gia|Chưa cung cấp|Chia sẻ|đánh giá|hài lòng|người mua|người bán|Người dùng|Giao tiếp|tin nhắn|Đáng tin|Đúng hẹn|Tin đăng|Tin đang|Chưa có|Фільтр|Tìm hiểu|hợp lý|thân thiện/i;

  function isLikelyUiText(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) {
      return false;
    }
    if (uiPhraseLookup.has(trimmed.toLowerCase())) {
      return true;
    }
    if (IDENTITY_UI_RE.test(trimmed)) {
      return true;
    }
    if (trimmed.length > 22) {
      return true;
    }
    if (/\d+\s*%/.test(trimmed) || /[★*]/.test(trimmed) || /:\s*\d/.test(trimmed)) {
      return true;
    }
    if (/\(\s*\d+\s*\)/.test(trimmed)) {
      return true;
    }
    return false;
  }

  function isInsideUserIdentity(node) {
    const ownText = ((node && node.nodeType === Node.TEXT_NODE ? node.nodeValue : node?.textContent) || "").trim();
    if (ownText && isLikelyUiText(ownText)) {
      return false;
    }
    let element = node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    for (let depth = 0; depth < 6 && element && element !== document.body; depth += 1) {
      const cls = `${element.getAttribute?.("class") || ""} ${element.id || ""}`;
      if (/(user[-_]?name|display[-_]?name|nick[-_]?name|seller[-_]?name|chat[-_]?name|profile[-_]?name|owner[-_]?name)/i.test(cls)) {
        return true;
      }
      const href = element.getAttribute?.("href") || "";
      if (/\/user\/|\/profile\//i.test(href) && (element.textContent || "").trim().length <= 32) {
        return true;
      }
      element = element.parentElement;
    }
    return false;
  }

  function translateTextNode(textNode) {
    const original = textNode.nodeValue;
    if (!original || !original.trim()) {
      return;
    }
    if (textNode.parentElement && shouldSkipElement(textNode.parentElement)) {
      return;
    }
    if (isProtectedUsername(original) || isInsideUserIdentity(textNode)) {
      return;
    }
    if (isInsideBreadcrumb(textNode)) {
      const crumb = translateBreadcrumbText(original);
      if (crumb !== original) {
        textNode.nodeValue = crumb;
      }
      return;
    }
    const isAddressLike =
      !isCompanyLegalText(original) &&
      (isLocationNameOnly(original) || isAddressText(original) || isInsideAddress(textNode));
    if (isAddressLike && !isRelativeTimeText(original) && !hasRelativeTimeClause(original)) {
      return;
    }
    if (!isCompanyLegalText(original) && isPriceText(original) && !isRelativeTimeText(original)) {
      return;
    }

    const cached = memoryCache.get(original);
    if (cached !== undefined && !stillLooksVietnamese(cached)) {
      if (cached !== original) {
        textNode.nodeValue = cached;
      }
      return;
    }

    let translated =
      isAddressLike && hasRelativeTimeClause(original)
        ? translateTimeClauses(original)
        : applyDictionary(original);
    if (
      translated.trim() === "Опубліковано" &&
      /^\s*\d/.test(nextSiblingText(textNode)) &&
      !/\s$/.test(translated)
    ) {
      translated = `${translated} `;
    }
    if (translated !== original) {
      textNode.nodeValue = translated;
    }
    if (!stillLooksVietnamese(translated)) {
      memoryCache.set(original, translated);
      return;
    }
    if (useOnline) {
      pendingOnline.set(textNode, {
        kind: "text",
        textNode,
        original,
        expected: textNode.nodeValue,
        text: original,
      });
      scheduleOnlineFlush();
    }
  }

  function translateAttributes(element) {
    for (const attr of ATTRS_TO_TRANSLATE) {
      if (!element.hasAttribute(attr)) {
        continue;
      }
      const original = element.getAttribute(attr);
      if (!original || !original.trim()) {
        continue;
      }
      if (isProtectedUsername(original) || isInsideUserIdentity(element)) {
        continue;
      }
      if (isInsideBreadcrumb(element)) {
        const crumb = translateBreadcrumbText(original);
        if (crumb !== original) {
          element.setAttribute(attr, crumb);
        }
        continue;
      }
      if (isLocationNameOnly(original) || isAddressText(original) || isInsideAddress(element)) {
        continue;
      }
      const cacheKey = `${attr}::${original}`;
      const cached = memoryCache.get(cacheKey);
      if (cached !== undefined && !stillLooksVietnamese(cached)) {
        if (cached !== original) {
          element.setAttribute(attr, cached);
        }
        continue;
      }
      const translated = applyDictionary(original);
      if (!stillLooksVietnamese(translated)) {
        memoryCache.set(cacheKey, translated);
      }
      if (translated !== original) {
        element.setAttribute(attr, translated);
      }
      if (useOnline && stillLooksVietnamese(translated)) {
        pendingOnline.set(`${attr}:${element}`, {
          kind: "attr",
          element,
          attr,
          original,
          expected: element.getAttribute(attr),
          text: original,
        });
        scheduleOnlineFlush();
      }
    }
  }

  function walk(root, depth) {
    const level = depth || 0;
    if (!root || level > 10) {
      return;
    }
    if (root.nodeType === Node.ELEMENT_NODE && tryTranslateNotice(root)) {
      return;
    }
    if (root.nodeType === Node.TEXT_NODE) {
      const parent = root.parentElement;
      if (parent && tryTranslateNotice(parent)) {
        return;
      }
      translateTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      return;
    }
    if (root.nodeType === Node.ELEMENT_NODE && shouldSkipElement(root)) {
      if (root.tagName === "INPUT" || root.tagName === "TEXTAREA") {
        translateAttributes(root);
        translateControlLabel(root);
      }
      return;
    }

    if (root.nodeType === Node.ELEMENT_NODE) {
      translateAttributes(root);
      translateControlLabel(root);
      walkShadowAndFrames(root, level);
    }

    const tree = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const parent = node.parentElement;
          if (parent && shouldSkipElement(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent && isInsideAddress(parent) && !isRelativeTimeText(node.nodeValue)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
        if (node.tagName === "IFRAME") {
          return NodeFilter.FILTER_ACCEPT;
        }
        if (shouldSkipElement(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (isInsideAddress(node) && !hasRelativeTimeClause(node.textContent || "")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let current = tree.currentNode === root ? tree.nextNode() : tree.currentNode;
    while (current) {
      if (current.nodeType === Node.ELEMENT_NODE && tryTranslateNotice(current)) {
        current = tree.nextNode();
        continue;
      }
      if (current.nodeType === Node.TEXT_NODE) {
        translateTextNode(current);
      } else {
        translateAttributes(current);
        translateControlLabel(current);
        walkShadowAndFrames(current, level);
      }
      current = tree.nextNode();
    }
  }

  const CONTROL_LABEL_TAGS = new Set(["BUTTON", "A", "SPAN", "P", "DIV", "LABEL"]);
  const INPUT_LABEL_TYPES = new Set(["button", "submit", "reset"]);

  function translateControlLabel(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const tag = element.tagName;
    const type = (element.getAttribute("type") || (tag === "INPUT" ? "submit" : "")).toLowerCase();
    if (tag === "INPUT" && INPUT_LABEL_TYPES.has(type) && element.value) {
      const translatedValue = applyDictionary(element.value);
      if (translatedValue !== element.value) {
        element.value = translatedValue;
      }
    }
    if (!CONTROL_LABEL_TAGS.has(tag) && tag !== "INPUT") {
      return;
    }
    if (element.childElementCount > 3) {
      return;
    }
    const raw = (element.textContent || "").replace(/\s+/g, " ").trim();
    if (!raw || raw.length > 40 || !uiPhraseLookup.has(raw.toLowerCase())) {
      return;
    }
    const translated = applyDictionary(raw);
    if (translated === raw) {
      return;
    }
    const nodes = collectTextNodes(element);
    if (nodes.length === 0) {
      if (element.childElementCount === 0) {
        element.textContent = translated;
      }
      return;
    }
    nodes[0].nodeValue = translated;
    for (let index = 1; index < nodes.length; index += 1) {
      nodes[index].nodeValue = "";
    }
  }

  function forceTranslateUiLabels(root) {
    if (!root || !root.querySelectorAll) {
      return;
    }
    const candidates = root.querySelectorAll(
      "button, [role='button'], input[type='button'], input[type='submit'], a, span, p, label",
    );
    for (const element of candidates) {
      translateControlLabel(element);
    }
  }

  function walkAllSameOriginFrames(win, depth) {
    if (!win || (depth || 0) > 5) {
      return;
    }
    try {
      const doc = win.document;
      if (doc?.body) {
        walk(doc.body);
        forceTranslateUiLabels(doc);
      }
      const frames = doc ? doc.querySelectorAll("iframe") : [];
      for (const frame of frames) {
        try {
          if (frame.contentWindow && frame.contentWindow !== win) {
            walkAllSameOriginFrames(frame.contentWindow, (depth || 0) + 1);
          }
        } catch {
          // Cross-origin frame.
        }
      }
    } catch {
      // Frame is not readable.
    }
  }

  function collectTextNodes(root) {
    const nodes = [];
    const tree = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let current = tree.nextNode();
    while (current) {
      if (current.nodeValue && current.nodeValue.trim()) {
        nodes.push(current);
      }
      current = tree.nextNode();
    }
    return nodes;
  }

  function isNamedNotice(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    const cls = element.getAttribute("class") || "";
    const role = element.getAttribute("role") || "";
    const live = element.getAttribute("aria-live") || "";
    return /toast|snackbar|notify|spinner|ant-message|notistack/i.test(cls) ||
      role === "status" ||
      role === "alert" ||
      role === "alertdialog" ||
      live === "polite" ||
      live === "assertive";
  }

  function isNoticeText(text) {
    return /đưa vào danh sách|xóa khỏi danh sách|Đang tải|Đang lưu|Đang xử lý|Vui lòng đợi|Vui lòng chờ|không thể nhận tin nhắn|vi phạm quy định/i.test(text);
  }

  function tryTranslateNotice(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    if (element.childElementCount > 8) {
      return isNamedNotice(element) ? translateNotice(element) : false;
    }
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 180) {
      return false;
    }
    if (isNamedNotice(element) || isNoticeText(text)) {
      return translateNotice(element);
    }
    return false;
  }

  function translateNotice(element) {
    const nodes = collectTextNodes(element);
    if (nodes.length === 0) {
      return false;
    }
    const joined = nodes.map((node) => node.nodeValue).join("").replace(/\s+/g, " ").trim();
    if (!joined || joined.length > 180) {
      return false;
    }
    const restored = joined
      .replace(/\bСтежити\b/g, "Theo dõi")
      .replace(/\bОголошення додано до обраного\b/g, "Tin đã được đưa vào danh sách Theo dõi")
      .replace(/\bОголошення видалено з обраного\b/g, "Tin đã được xóa khỏi danh sách Theo dõi");
    const translated = applyDictionary(restored);
    if (translated === joined || translated === restored) {
      return false;
    }
    isMutating = true;
    nodes[0].nodeValue = translated;
    for (let index = 1; index < nodes.length; index += 1) {
      nodes[index].nodeValue = "";
    }
    isMutating = false;
    return true;
  }

  function walkShadowAndFrames(element, depth) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    if (element.shadowRoot) {
      walk(element.shadowRoot, (depth || 0) + 1);
    }
    if (element.tagName === "IFRAME") {
      try {
        const frameDoc = element.contentDocument;
        if (frameDoc?.body) {
          walk(frameDoc.body, (depth || 0) + 1);
        }
      } catch {
        // Cross-origin chat frames are translated via document-start / all_frames.
      }
    }
  }

  function translateDocument() {
    if (!isEnabled || !document.documentElement) {
      return;
    }
    isMutating = true;
    if (document.title) {
      const nextTitle = applyDictionary(document.title);
      if (nextTitle !== document.title) {
        document.title = nextTitle;
      }
    }
    if (document.body) {
      walk(document.body);
      forceTranslateUiLabels(document);
    }
    walkAllSameOriginFrames(window, 0);
    isMutating = false;
  }

  function scheduleOnlineFlush() {
    if (onlineTimer) {
      return;
    }
    onlineTimer = window.setTimeout(() => {
      onlineTimer = 0;
      void flushOnline();
    }, pendingOnline.size >= 6 ? 40 : 70);
  }

  async function flushOnline() {
    if (!useOnline || pendingOnline.size === 0) {
      return;
    }

    const jobs = [...pendingOnline.values()];
    pendingOnline.clear();
    const uniqueTexts = [...new Set(jobs.map((job) => job.text).filter((text) => stillLooksVietnamese(text)))];
    if (uniqueTexts.length === 0) {
      return;
    }

    const maskedTexts = uniqueTexts.map((text) => maskVnd(text));
    const translatedMap = new Map();
    const chunks = [];
    for (let index = 0; index < maskedTexts.length; index += 24) {
      chunks.push({
        masked: maskedTexts.slice(index, index + 24),
        sources: uniqueTexts.slice(index, index + 24),
      });
    }
    const results = await Promise.all(
      chunks.map(async ({ masked, sources }) => {
        try {
          return { sources, result: await requestTranslateBatch(masked) };
        } catch (error) {
          console.warn("[Chợ Tốt UA] Online translate failed:", error);
          return { sources, result: null };
        }
      }),
    );
    for (const { sources, result } of results) {
      if (!result?.ok) {
        continue;
      }
      sources.forEach((source, chunkIndex) => {
        const raw = result.translations[chunkIndex] || source;
        translatedMap.set(source, applyDictionary(unmaskVnd(source, raw)));
      });
    }

    isMutating = true;
    for (const job of jobs) {
      const translated = translatedMap.get(job.text);
      if (!translated || translated === job.text) {
        continue;
      }
      memoryCache.set(job.original || job.text, translated);
      if (job.kind === "text" && job.textNode?.isConnected) {
        const current = job.textNode.nodeValue;
        if (current !== job.expected && current !== job.original) {
          continue;
        }
        job.textNode.nodeValue = translated;
      }
      if (job.kind === "attr" && job.element?.isConnected) {
        const current = job.element.getAttribute(job.attr);
        if (current !== job.expected && current !== job.original) {
          continue;
        }
        job.element.setAttribute(job.attr, translated);
        memoryCache.set(`${job.attr}::${job.original || job.text}`, translated);
      }
    }
    isMutating = false;
  }

  function scheduleWalkFlush() {
    if (walkTimer) {
      return;
    }
    walkTimer = window.setTimeout(() => {
      walkTimer = 0;
      if (!isEnabled || pendingWalkRoots.size === 0) {
        return;
      }
      const roots = [...pendingWalkRoots];
      pendingWalkRoots.clear();
      isMutating = true;
      for (const root of roots) {
        walk(root);
        const labelRoot =
          root.querySelectorAll ? root : root.parentElement || document;
        forceTranslateUiLabels(labelRoot);
      }
      forceTranslateUiLabels(document);
      isMutating = false;
    }, 16);
  }

  function observe() {
    const observer = new MutationObserver((mutations) => {
      if (!isEnabled) {
        return;
      }
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          pendingWalkRoots.add(mutation.target);
          continue;
        }
        if (mutation.type === "attributes") {
          pendingWalkRoots.add(mutation.target);
          continue;
        }
        for (const added of mutation.addedNodes) {
          pendingWalkRoots.add(added);
          if (added.nodeType !== Node.ELEMENT_NODE) {
            continue;
          }
          if (tryTranslateNotice(added) || !added.querySelectorAll) {
            continue;
          }
          const nested = added.querySelectorAll(
            "[role='status'], [role='alert'], [aria-live='polite'], [aria-live='assertive']",
          );
          for (let index = 0; index < nested.length && index < 6; index += 1) {
            tryTranslateNotice(nested[index]);
          }
        }
      }
      scheduleWalkFlush();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS_TO_TRANSLATE,
    });
    return observer;
  }

  function requestTranslateBatch(texts) {
    if (globalThis.ChototUkNative?.translateBatch) {
      return new Promise((resolve) => {
        const id = `n${++onlineRequestId}`;
        const timer = window.setTimeout(() => {
          onlineResolvers.delete(id);
          resolve({ ok: false });
        }, 20000);
        onlineResolvers.set(id, (payload) => {
          window.clearTimeout(timer);
          resolve(payload);
        });
        globalThis.ChototUkNative.translateBatch(id, JSON.stringify(texts));
      });
    }
    if (globalThis.chrome?.runtime?.sendMessage) {
      return chrome.runtime.sendMessage({ type: "translateBatch", texts });
    }
    return Promise.resolve({ ok: false });
  }

  function onTranslateResult(id, payload) {
    const resolve = onlineResolvers.get(id);
    if (!resolve) {
      return;
    }
    onlineResolvers.delete(id);
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    resolve(parsed);
  }

  async function loadSettings() {
    if (globalThis.ChototUkNative) {
      isEnabled = true;
      try {
        useOnline = globalThis.ChototUkNative.isOnlineEnabled() === true;
      } catch (_error) {
        useOnline = false;
      }
      return;
    }
    if (!globalThis.chrome?.storage?.sync) {
      isEnabled = true;
      useOnline = false;
      return;
    }
    const stored = await chrome.storage.sync.get({ enabled: true, useOnline: false });
    isEnabled = stored.enabled !== false;
    useOnline = stored.useOnline === true;
  }

  function setEnabled(nextEnabled) {
    isEnabled = nextEnabled;
    if (isEnabled) {
      translateDocument();
    }
  }

  function setUseOnline(nextUseOnline) {
    useOnline = nextUseOnline;
    if (isEnabled && useOnline) {
      translateDocument();
    }
  }

  return {
    applyDictionary,
    stillLooksVietnamese,
    translateDocument,
    walk,
    observe,
    loadSettings,
    setEnabled,
    setUseOnline,
    onTranslateResult,
    get isEnabled() {
      return isEnabled;
    },
    get useOnline() {
      return useOnline;
    },
  };
})();
