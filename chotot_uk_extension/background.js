const CACHE_KEY = "chototUkCache";
const CACHE_LIMIT = 2500;
const memoryCache = new Map();
let persistentCache = {};
let cacheLoaded = false;

async function loadCache() {
  if (cacheLoaded) {
    return;
  }
  const stored = await chrome.storage.local.get({ [CACHE_KEY]: {} });
  persistentCache = stored[CACHE_KEY] || {};
  cacheLoaded = true;
}

async function saveCache() {
  const keys = Object.keys(persistentCache);
  if (keys.length > CACHE_LIMIT) {
    const extra = keys.length - CACHE_LIMIT;
    for (const key of keys.slice(0, extra)) {
      delete persistentCache[key];
    }
  }
  await chrome.storage.local.set({ [CACHE_KEY]: persistentCache });
}

function parseGooglePayload(payload) {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return "";
  }
  return payload[0]
    .map((part) => (Array.isArray(part) ? part[0] : ""))
    .join("");
}

function maskVnd(text) {
  return text.replace(/\bVNĐ\b/g, "VND").replace(/\bVND\b/gi, "XXXVNDXXX");
}

function keepVnd(source, translated) {
  let result = (translated || "").replace(/XXXVNDXXX/gi, "VND").replace(/\bVNĐ\b/g, "VND");
  if (/\b(VND|VNĐ)\b/i.test(source) && !/\bVND\b/.test(result)) {
    result = result.replace(/\b(?:вн\.?\s*д\.?|донги?|донгів)\b/gi, "VND");
  }
  return result;
}

async function translateOne(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }
  if (memoryCache.has(trimmed)) {
    return memoryCache.get(trimmed);
  }
  await loadCache();
  if (persistentCache[trimmed]) {
    memoryCache.set(trimmed, persistentCache[trimmed]);
    return persistentCache[trimmed];
  }

  const chunks = chunkText(trimmed, 180);
  const translated = (
    await Promise.all(chunks.map((chunk) => translateChunk(maskVnd(chunk))))
  ).join("");
  const kept = keepVnd(trimmed, translated);
  memoryCache.set(trimmed, kept);
  persistentCache[trimmed] = kept;
  return kept;
}

function chunkText(text, maxChars) {
  if (text.length <= maxChars) {
    return [text];
  }
  const chunks = [];
  let buffer = "";
  const pieces = text.split(/(?<=[\n.!?])/);
  for (const piece of pieces) {
    if (piece.length > maxChars) {
      if (buffer) {
        chunks.push(buffer);
        buffer = "";
      }
      for (let index = 0; index < piece.length; index += maxChars) {
        chunks.push(piece.slice(index, index + maxChars));
      }
      continue;
    }
    if (buffer.length + piece.length > maxChars && buffer) {
      chunks.push(buffer);
      buffer = "";
    }
    buffer += piece;
  }
  if (buffer) {
    chunks.push(buffer);
  }
  return chunks;
}

async function translateChunk(text) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=vi&tl=uk&dt=t&q=" +
    encodeURIComponent(text);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Translate HTTP ${response.status}`);
  }
  const payload = await response.json();
  return parseGooglePayload(payload) || text;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "translateBatch" || !Array.isArray(message.texts)) {
    return undefined;
  }

  (async () => {
    try {
      const translations = [];
      for (const text of message.texts) {
        translations.push(await translateOne(text));
      }
      await saveCache();
      sendResponse({ ok: true, translations });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  })();

  return true;
});
