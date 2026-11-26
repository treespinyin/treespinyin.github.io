/**
 * Trees Pinyin Studio — Module 6: Photo OCR, PDF/DOCX/Cloud Docs & Bilingual Voice Input
 */
function decodeXmlEntities(str) {
  return String(str || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// 升級為標準 ZIP Central Directory 解析器，100% 支援現代 Word / Google Docs 含 Data Descriptor (compSize===0) 的 .docx
async function extractDocxTextLocal(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder('utf-8');

  async function inflateEntry(compMethod, compData) {
    if (compMethod === 0) return decoder.decode(compData);
    if (compMethod === 8) {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compData);
      writer.close();
      const outBuf = await new Response(ds.readable).arrayBuffer();
      return decoder.decode(outBuf);
    }
    return '';
  }

  function xmlToCleanText(xmlText) {
    if (!xmlText) return '';
    return decodeXmlEntities(
      xmlText
        .replace(/<w:tab[^>]*\/>/g, ' ')
        .replace(/<w:br[^>]*\/>/g, '\n')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '')
    ).replace(/\n{3,}/g, '\n\n').trim();
  }

  // 1. 優先從檔案尾端搜尋 EOCD (0x06054b50) 讀取 Central Directory（最準確）
  let eocdOffset = -1;
  const minSearch = Math.max(0, bytes.length - 65557);
  for (let p = bytes.length - 22; p >= minSearch; p--) {
    if (view.getUint32(p, true) === 0x06054b50) {
      eocdOffset = p;
      break;
    }
  }

  if (eocdOffset !== -1) {
    const cdSize = view.getUint32(eocdOffset + 12, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);
    let ptr = cdOffset;
    const cdEnd = Math.min(bytes.length, cdOffset + cdSize);

    while (ptr + 46 <= cdEnd) {
      if (view.getUint32(ptr, true) !== 0x02014b50) break;
      const compMethod = view.getUint16(ptr + 10, true);
      const compSize = view.getUint32(ptr + 20, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localHeaderOffset = view.getUint32(ptr + 42, true);
      const entryName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

      if (entryName === 'word/document.xml' && localHeaderOffset + 30 <= bytes.length) {
        const lhNameLen = view.getUint16(localHeaderOffset + 26, true);
        const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
        const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
        const compData = bytes.subarray(dataStart, dataStart + compSize);
        const xmlText = await inflateEntry(compMethod, compData);
        if (xmlText) return xmlToCleanText(xmlText);
      }
      ptr += 46 + nameLen + extraLen + commentLen;
    }
  }

  // 2. 降級掃描 Local File Headers
  let offset = 0;
  while (offset + 30 < bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) { offset++; continue; }
    const compMethod = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const fileNameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const entryName = decoder.decode(bytes.subarray(offset + 30, offset + 30 + fileNameLen));
    const dataStart = offset + 30 + fileNameLen + extraLen;

    if (entryName === 'word/document.xml' && compSize > 0) {
      const compData = bytes.subarray(dataStart, dataStart + compSize);
      const xmlText = await inflateEntry(compMethod, compData);
      if (xmlText) return xmlToCleanText(xmlText);
    }
    offset = dataStart + Math.max(1, compSize);
  }
  return '';
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

const VISION_CACHE_KEY = 'tp_v16_vision_ocr_cache';
const visionLocalCache = new Map();
(function loadVisionCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(VISION_CACHE_KEY) || '{}');
    for (const [k, v] of Object.entries(raw)) {
      if (k && typeof v === 'string' && v.trim()) visionLocalCache.set(k, v);
    }
  } catch (e) {}
})();

function computeFastImageKey(dataUrl) {
  if (!dataUrl) return '';
  const len = dataUrl.length;
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(len / 2048));
  for (let i = 0; i < len; i += step) {
    hash ^= dataUrl.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `img_${len}_${(hash >>> 0).toString(36)}`;
}

function saveVisionCache(imgKey, text) {
  if (!imgKey || !text) return;
  visionLocalCache.set(imgKey, text);
  try {
    const store = JSON.parse(localStorage.getItem(VISION_CACHE_KEY) || '{}');
    const keys = Object.keys(store);
    if (keys.length >= 30 && !store[imgKey]) delete store[keys[0]];
    store[imgKey] = text;
    localStorage.setItem(VISION_CACHE_KEY, JSON.stringify(store));
  } catch (e) {}
}

// 高清流式圖片壓縮：一般照片鎖定 1152px + JPEG 0.82（密集漢字、古詩小字、菜單價目清晰不漏字，約 90-160KB）；
// 超長截圖（長寬比 > 1.8）自動放寬至 1152px，兼顧清晰度與極速上傳（比 1440px 快 2-3 倍）
async function compressImg(file, maxDim = 896, quality = 0.75) {
  const drawToDataUrl = (source, origW, origH) => {
    let w = origW, h = origH;
    const longest = Math.max(w, h);
    const shortest = Math.max(1, Math.min(w, h));
    const aspect = longest / shortest;
    const targetMax = (aspect > 1.8 && maxDim < 1152) ? 1152 : maxDim;
    if (longest > targetMax) {
      const scale = targetMax / longest;
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    const outUrl = c.toDataURL('image/jpeg', quality);
    return { dataUrl: outUrl, canvas: c };
  };

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const res = drawToDataUrl(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      if (res && res.dataUrl && res.dataUrl.length > 64) return res;
    } catch (e) {}
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(drawToDataUrl(img, img.width, img.height));
      img.onerror = () => resolve({ dataUrl: e.target.result || '', canvas: null });
      img.src = e.target.result;
    };
    reader.onerror = () => resolve({ dataUrl: '', canvas: null });
    reader.readAsDataURL(file);
  });
}

// 有序逐行流式翻譯與注音管線：每收到一行文字立刻並行啟動 classics-api 校對＋翻譯，嚴格按原順序即時上屏
function createOrderedLineStreamRenderer(reqSeq, replyBox) {
  let rawAccumulated = '';
  let lineBuffer = '';
  let tailPromise = Promise.resolve();
  let renderedCount = 0;
  let matchedCount = 0;
  let correctedCount = 0;
  const matchedSources = new Set();

  const enqueueLine = (rawLine) => {
    const cleanedLine = String(rawLine || '').replace(/^[-*•]\s+/, '').trim();
    if (!cleanedLine || /^```/.test(cleanedLine) || /^\d+$/.test(cleanedLine)) return;

    // 立刻並行啟動 classics-api 精準匹配／錯字修復，未命中才降級至 translateFast
    const transPromise = (async () => {
      if (cleanedLine.includes('|||')) {
        const pair = parseBilingualPairLine(cleanedLine);
        if (pair) return pair;
      }
      const classicHit = await matchClassicForOcrLine(cleanedLine, true);
      if (classicHit) {
        matchedCount++;
        if (classicHit.corrected) correctedCount++;
        if (classicHit.source) matchedSources.add(classicHit.source);
        return { zh: classicHit.zh, en: classicHit.en };
      }
      const hasZh = /[\u4e00-\u9fa5]/.test(cleanedLine);
      if (hasZh) {
        const en = await translateFast(cleanedLine, 'zh', 'en');
        return { zh: cleanedLine, en: en || '' };
      }
      const zh = await translateFast(cleanedLine, 'en', 'zh');
      return { zh: zh || cleanedLine, en: cleanedLine };
    })();

    tailPromise = tailPromise.then(async () => {
      const pair = await transPromise;
      if (reqSeq !== activeRequestSeq || !pair) return;
      if (renderedCount === 0 && replyBox) {
        if (typeof replyBox._clearSlowTip === 'function') replyBox._clearSlowTip();
        replyBox.style.display = 'none';
      }
      renderedCount++;
      appendSentenceProgressive(pair.zh, pair.en);
    }).catch(() => {});
  };

  return {
    pushChunk(deltaText) {
      if (!deltaText || reqSeq !== activeRequestSeq) return;
      rawAccumulated += deltaText;
      lineBuffer += deltaText;
      const parts = lineBuffer.split(/\r?\n/);
      lineBuffer = parts.pop() || '';
      for (const p of parts) enqueueLine(p);
    },
    async finish() {
      if (lineBuffer.trim()) {
        enqueueLine(lineBuffer);
        lineBuffer = '';
      }
      await tailPromise;
      return {
        fullText: rawAccumulated.trim(),
        renderedCount,
        matchedCount,
        correctedCount,
        matchedSources: Array.from(matchedSources)
      };
    }
  };
}

// 讀取 Gemini 或 Cloudflare Worker 的 SSE 文字流（每收完一行即觸發流式上屏）
async function consumeVisionSseStream(response, renderer, reqSeq) {
  if (!response || !response.body || typeof response.body.getReader !== 'function') return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let sseBuf = '';
  let gotText = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done || reqSeq !== activeRequestSeq) break;
      sseBuf += decoder.decode(value, { stream: true });
      const lines = sseBuf.split(/\r?\n/);
      sseBuf = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const d = JSON.parse(payload);
          let delta = '';
          if (typeof d?.delta === 'string') {
            delta = d.delta;
          } else if (Array.isArray(d?.candidates?.[0]?.content?.parts)) {
            delta = d.candidates[0].content.parts
              .filter(p => !p.thought && typeof p.text === 'string')
              .map(p => p.text)
              .join('');
          } else if (typeof d?.text === 'string') {
            delta = d.text;
          }
          if (delta) {
            gotText += delta;
            renderer.pushChunk(delta);
          }
        } catch (e) {}
      }
    }
  } finally {
    try { reader.releaseLock(); } catch (e) {}
  }
  return gotText.trim();
}

// 第 1A 級（100% 用戶端電腦 GPU、0 伺服器成本）：Chrome 內建 Gemini Nano Multimodal 圖像流式識別
async function tryLocalMultimodalImageStream(canvas, promptText, renderer, reqSeq) {
  if (!canvas) return '';
  try {
    const LM = window.LanguageModel || (window.ai && window.ai.languageModel);
    if (!LM || typeof LM.create !== 'function' || typeof LM.availability !== 'function') return '';
    const avail = await Promise.race([
      LM.availability({ expectedInputs: [{ type: 'image' }] }),
      new Promise(r => setTimeout(() => r('unavailable'), 500))
    ]);
    if (avail !== 'available' && avail !== 'readily') return '';

    const session = await LM.create({
      expectedInputs: [{ type: 'image' }],
      temperature: 0.1,
      topK: 3
    });
    try {
      const inputPayload = [{
        role: 'user',
        content: [
          { type: 'text', value: promptText },
          { type: 'image', value: canvas }
        ]
      }];
      if (typeof session.promptStreaming === 'function') {
        const stream = session.promptStreaming(inputPayload);
        let prevFull = '';
        for await (const chunk of stream) {
          if (reqSeq !== activeRequestSeq) break;
          const s = String(chunk || '');
          const delta = (prevFull && s.startsWith(prevFull)) ? s.slice(prevFull.length) : s;
          prevFull = (prevFull && s.startsWith(prevFull)) ? s : (prevFull + s);
          if (delta) renderer.pushChunk(delta);
        }
        return prevFull.trim();
      }
      if (typeof session.prompt === 'function') {
        const out = String(await session.prompt(inputPayload) || '').trim();
        if (out) renderer.pushChunk(out + '\n');
        return out;
      }
    } finally {
      if (session && typeof session.destroy === 'function') {
        try { session.destroy(); } catch (e) {}
      }
    }
  } catch (e) {}
  return '';
}

function getFastPhoneCopyTipText(isTimeout = false) {
  if (currentLang === 'zh') {
    return isTimeout
      ? '⏱️ 圖片識別較慢或超時 — 建議直接用手機（iPhone 原況文字 / 微信掃一掃 / Google Lens）或電腦預覽 1 秒複製文字，貼上 (⌘V / Ctrl+V) 這裡最快最準！'
      : '⏳ 識別稍慢… 小提示：用手機（iPhone 原況文字 / 微信 / Google Lens）或電腦預覽 1 秒複製文字貼上 (⌘V / Ctrl+V) 會更快更準！';
  }
  return isTimeout
    ? '⏱️ Photo scan was slow or timed out — Tip: Copy text in 1s with iPhone Live Text / Android Google Lens / WeChat / macOS Preview, then paste (⌘V / Ctrl+V) here for instant accuracy!'
    : '⏳ Taking longer than usual... Tip: Copy text in 1s with iPhone Live Text / Android Google Lens / WeChat / macOS Preview, then paste (⌘V / Ctrl+V) here!';
}

function startOcrSlowTipTimer(replyBox, reqSeq, delayMs = 4000) {
  if (!replyBox) return () => {};
  if (typeof replyBox._clearSlowTip === 'function') replyBox._clearSlowTip();
  const tid = setTimeout(() => {
    if (reqSeq !== activeRequestSeq) return;
    if (replyBox.style.display !== 'none') {
      replyBox.textContent = getFastPhoneCopyTipText(false);
    }
  }, delayMs);
  const clearFn = () => {
    clearTimeout(tid);
    if (replyBox._clearSlowTip === clearFn) replyBox._clearSlowTip = null;
  };
  replyBox._clearSlowTip = clearFn;
  return clearFn;
}

// 第 2 級（用戶個人 Gemini Key、0 伺服器成本）：flash-lite 極速優先＋嚴格 7.5 秒單次上限（絕不卡一分鐘）
async function streamImageOcrWithUserKey(dataUrl, promptText, activeKey, renderer, reqSeq) {
  const cleanKey = activeKey.replace(/\s+/g, '');
  if (!isGoogleGeminiKey(cleanKey) || !dataUrl || !dataUrl.includes(',')) {
    return { text: '', error: '' };
  }
  const mime = dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';')) || 'image/jpeg';
  const b64 = dataUrl.split(',')[1];
  const parts = [{ text: promptText }, { inlineData: { mimeType: mime, data: b64 } }];

  // 極速優先：flash-lite 優先（速度 2-3 倍），最多只試 2 個模型，總時長鎖在 ~10 秒內
  const rawVisModels = [
    ...availableFastModels.filter(m => /flash-lite/i.test(m)),
    ...availableFastModels.filter(m => !/gemma|flash-lite/i.test(m))
  ];
  const modelsToTry = Array.from(new Set(rawVisModels.map(m => resolveModelForKey(m, cleanKey)))).slice(0, 2);
  if (modelsToTry.length === 0) modelsToTry.push('gemini-flash-lite-latest', 'gemini-2.5-flash');

  let lastErr = '';
  for (const model of modelsToTry) {
    if (reqSeq !== activeRequestSeq) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7500);
    try {
      const url = buildGoogleGenAiUrl(model, cleanKey, true);
      let r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.05, maxOutputTokens: 1600, thinkingConfig: { thinkingBudget: 0 } }
        }),
        signal: ctrl.signal
      });
      if (r.status === 400) {
        r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { temperature: 0.05, maxOutputTokens: 1600 }
          }),
          signal: ctrl.signal
        });
      }
      clearTimeout(timer);
      if (!r.ok) {
        const errObj = await r.json().catch(() => ({}));
        lastErr = `[${model}: ${r.status}] ${errObj?.error?.message || r.status}`;
        if (r.status === 400 || r.status === 403) break;
        continue;
      }
      const streamed = await consumeVisionSseStream(r, renderer, reqSeq);
      if (streamed) return { text: streamed, error: '' };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e && e.name === 'AbortError' ? `[${model}: Timeout (7.5s)]` : `[${model}: ${e.message || 'Network error'}]`;
    }
  }
  return { text: '', error: lastErr };
}

async function handleUnifiedFileUpload(file) {
  if (!file) return;
  const name = (file.name || '').toLowerCase();

  if (file.type.startsWith('image/') || /\.(png|jpe?g|jfif|webp|bmp|gif|tiff?|avif)$/i.test(name)) {
    const myReqSeq = ++activeRequestSeq;
    // 896px 輕量高清 JPEG 0.75（長截圖自動 1152px）：體積縮小 2-3 倍，極速上傳與識別
    const { dataUrl, canvas: compressedCanvas } = await compressImg(file, 768, 0.72);
    const prevImg = document.getElementById('previewImg');
    if (prevImg && dataUrl) {
      prevImg.src = dataUrl;
      prevImg.style.display = 'block';
    }

    const replyBox = document.getElementById('aiReplyBox');
    const container = document.getElementById('sentencesContainer');
    const limitBox = document.getElementById('apiLimitBox');
    if (limitBox) limitBox.style.display = 'none';
    if (replyBox) {
      replyBox.onclick = null;
      replyBox.style.cursor = '';
      replyBox.style.display = 'block';
      replyBox.textContent = currentLang === 'en' ? '⚡ Scanning photo (fast mode)...' : '⚡ 正在極速識別圖片文字...';
    }
    if (container) container.innerHTML = '';

    if (!dataUrl || !dataUrl.includes(',')) {
      if (replyBox) replyBox.textContent = '⚠️ Could not decode this image format. Please convert to JPG/PNG and try again.';
      return;
    }

    // 第 0 級：本地圖片快取（相同照片 0 毫秒秒回，並同樣套用經典庫校對）
    const imgCacheKey = computeFastImageKey(dataUrl);
    let text = visionLocalCache.get(imgCacheKey) || '';
    if (text && text.trim()) {
      if (replyBox) replyBox.style.display = 'none';
      const cleanCached = text.replace(/\r\n/g, '\n').trim();
      document.getElementById('userInput').value = cleanCached;
      await runDirectTranslate(cleanCached, { isOcr: true, keepPreview: true });
      return;
    }

    const ocrOnlyPrompt = [
      'Accurately transcribe EVERY visible Chinese and English character in this image without skipping, dropping, or inventing any character.',
      'CRITICAL READING ORDER & ACCURACY:',
      '- If Chinese text is arranged vertically (traditional poems, calligraphy, plaques, menus, or vertical signs), read columns strictly from RIGHT to LEFT, and top to bottom within each column.',
      '- If text is horizontal or multi-column (road signs, restaurant menus, textbooks, screenshots), read top to bottom, left to right, keeping each complete verse, sentence, dish name, or sign on its own line.',
      '- STRICT FIDELITY: Transcribe ONLY characters actually printed in the image. NEVER complete or invent missing lines of a poem from memory, and NEVER output non-Chinese/non-English garbled symbols (such as Arabic letters) for punctuation.',
      '- IGNORE BACKGROUND NOISE: Extract ONLY the main poem/document/title text. Strictly ignore isolated background shop signs, tavern flags/banners (e.g., a single "酒" character on a flag), red artist seals, decorative stamps, or watermarks.',
      '- POEM LINE BREAKS: For classical Chinese poems, output one verse per line (each 5-character or 7-character clause on its own line).',
      '- Output ONLY the exact transcribed text (one line per verse/sentence/item). No translation, no pinyin, no markdown, no commentary.'
    ].join('\n');
    // 極速純文字收集器：識圖階段只專心秒取全文（不逐行打翻譯/Nano塞車），取完後一次性走經典校對或單批 0.3s 翻譯
    let rawOcrStreamBuf = '';
    const fastTextCollector = {
      pushChunk(deltaText) {
        if (!deltaText || myReqSeq !== activeRequestSeq) return;
        rawOcrStreamBuf += deltaText;
        if (replyBox) {
          if (typeof replyBox._clearSlowTip === 'function') replyBox._clearSlowTip();
          replyBox.textContent = currentLang === 'en' ? '⚡ Reading text...' : '⚡ 正在讀取圖片文字...';
        }
      },
      async finish() {
        return { fullText: rawOcrStreamBuf.trim(), renderedCount: 0, matchedCount: 0, correctedCount: 0, matchedSources: [] };
      }
    };
    const streamRenderer = fastTextCollector;
    let streamedAlready = false;
    let ocrErrDetail = '';
    let hitOcrLimit = false;

    // 4 秒慢速即時提示：只要超過 4 秒還沒出第一行字，立刻提示用戶可用手機/電腦 1 秒複製貼上
    const clearSlowTip = startOcrSlowTipTimer(replyBox, myReqSeq, 4000);

    try {
      // 第 1A 級（優先使用用戶電腦原生 OS OCR，0.2 秒秒開、0 流量）：瀏覽器原生 TextDetector
      if (!text && 'TextDetector' in window && compressedCanvas) {
        try {
          const detector = new window.TextDetector();
          const blocks = await Promise.race([
            detector.detect(compressedCanvas),
            new Promise(r => setTimeout(() => r(null), 600))
          ]);
          if (blocks && blocks.length > 0) {
            const raw = blocks.map(b => b.rawValue).join('\n').trim();
            if (raw && raw.length >= 2) text = raw;
          }
        } catch (e) {}
      }

      // 第 1B 級（用戶本機 GPU/NPU，3.5 秒快切上限；超時立刻靜音熔斷，杜絕與雲端結果重複疊加）
      if (!text && compressedCanvas && navigator.onLine === false) {
        let nanoTimedOut = false;
        const guardedRenderer = {
          pushChunk: (delta) => { if (!nanoTimedOut) streamRenderer.pushChunk(delta); }
        };
        const localNanoText = await Promise.race([
          tryLocalMultimodalImageStream(compressedCanvas, ocrOnlyPrompt, guardedRenderer, myReqSeq),
          new Promise(r => setTimeout(() => { nanoTimedOut = true; r(''); }, 800))
        ]);
        if (localNanoText && !nanoTimedOut) {
          text = localNanoText;
          streamedAlready = true;
        } else if (nanoTimedOut && container) {
          container.innerHTML = '';
        }
      }

      // 第 2 級（用戶自有 Gemini Key，0 伺服器成本）：flash-lite 極速 SSE 流式識別（單次上限 7.5 秒）
      const activeKey = getActiveUserApiKey();
      if (!text && activeKey && isGoogleGeminiKey(activeKey)) {
        if (replyBox && replyBox.textContent.indexOf('⏳') === -1) {
          replyBox.textContent = currentLang === 'en' ? '✨ Fast streaming OCR with your Gemini Key...' : '✨ 正在透過您的專屬 Key 極速識圖...';
        }
        const { text: streamedKeyText, error: keyErr } = await streamImageOcrWithUserKey(dataUrl, ocrOnlyPrompt, activeKey, streamRenderer, myReqSeq);
        if (streamedKeyText) {
          text = streamedKeyText;
          streamedAlready = true;
        } else if (keyErr) {
          ocrErrDetail = keyErr;
        }
      }

      // 第 3 級（免 Key 雲端通道）：硬上限 9 秒快切（不再重複排隊 60 秒！）
      if (!text && !activeKey) {
        if (replyBox && replyBox.textContent.indexOf('⏳') === -1) {
          replyBox.textContent = currentLang === 'en' ? '☁️ Fast cloud OCR (free)...' : '☁️ 正在極速雲端識圖（免 API Key）...';
        }
        for (let ei = 0; ei < CF_WORKER_ENDPOINTS.length; ei++) {
          if (myReqSeq !== activeRequestSeq) return;
          const ep = CF_WORKER_ENDPOINTS[ei];
          const t0 = Date.now();
          try {
            const r = await fetchWithTimeout(`${ep}/vision-ocr`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: dataUrl, mode: 'ocr_only', stream: true })
            }, 15000);
            const cType = (r.headers.get('content-type') || '').toLowerCase();
            if (r.ok && cType.includes('text/event-stream')) {
              const streamedCloud = await consumeVisionSseStream(r, streamRenderer, myReqSeq);
              if (streamedCloud) {
                text = streamedCloud;
                streamedAlready = true;
                break;
              }
            } else {
              const d = await r.json().catch(() => ({}));
              if (r.ok && d.success && d.text) {
                text = d.text;
                break;
              }
              ocrErrDetail = d?.message || d?.detail || d?.error || `HTTP ${r.status}`;
              if (r.status === 429 || /LIMIT_REACHED/i.test(String(ocrErrDetail))) {
                hitOcrLimit = true;
                break;
              }
              if (r.status === 400 || r.status === 403 || r.status === 503) break;
            }
          } catch (e) {
            ocrErrDetail = e && e.name === 'AbortError' ? 'Timeout (15s)' : (e.message || 'Network error');
            // 若主節點已跑超過 3 秒超時，直接結束並提示手機複製，不再多等第二個節點
            if (Date.now() - t0 >= 3000) break;
          }
        }
      }
    } finally {
      clearSlowTip();
    }

    if (myReqSeq !== activeRequestSeq) return;

    if (streamedAlready) {
      const { fullText } = await streamRenderer.finish();
      if (myReqSeq !== activeRequestSeq) return;
      const finalClean = (fullText || text || '').replace(/\r\n/g, '\n').trim();
      if (finalClean) {
        saveVisionCache(imgCacheKey, finalClean);
        document.getElementById('userInput').value = finalClean;
        await runDirectTranslate(finalClean, { isOcr: true, keepPreview: true });
        return;
      }
    }

    if (text && text.trim()) {
      saveVisionCache(imgCacheKey, text.trim());
      if (replyBox) replyBox.style.display = 'none';
      if (text.includes('|||')) {
        const { ok } = await renderBilingualAIOutput(text);
        if (ok) return;
      }
      const clean = text.replace(/\r\n/g, '\n').trim();
      document.getElementById('userInput').value = clean;
      await runDirectTranslate(clean, { isOcr: true, keepPreview: true });
    } else if (hitOcrLimit && replyBox) {
      replyBox.style.display = 'block';
      replyBox.style.cursor = 'pointer';
      replyBox.innerHTML = '🔑 <b>Daily free cloud photo OCR limit reached.</b> Click here to add your own free Gemini API Key, OR copy text in 1s with iPhone Live Text / Google Lens / WeChat and paste (⌘V / Ctrl+V) here!';
      replyBox.onclick = () => {
        replyBox.onclick = null;
        replyBox.style.cursor = '';
        openStudioKeyModal();
      };
      if (limitBox) limitBox.style.display = 'block';
    } else if (replyBox) {
      replyBox.style.display = 'block';
      replyBox.textContent = getFastPhoneCopyTipText(true) + (ocrErrDetail ? ` (${ocrErrDetail})` : '');
    }
    return;
  }

  const prevImg = document.getElementById('previewImg');
  if (prevImg) prevImg.style.display = 'none';
  const replyBox = document.getElementById('aiReplyBox');
  replyBox.style.display = 'block';
  replyBox.textContent = currentLang === 'en' ? `📄 Reading ${file.name}...` : `📄 正在極速讀取 ${file.name}...`;

  try {
    let extractedText = '';
    if (name.endsWith('.docx')) {
      const buf = await file.arrayBuffer();
      extractedText = await extractDocxTextLocal(buf);
    } else if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      const myPdfSeq = ++activeRequestSeq;
      const container = document.getElementById('sentencesContainer');
      if (container) container.innerHTML = '';

      // 第 1 級（0.05 秒、100% 用戶電腦本機解析、0 流量、原文零誤差）：優先直接提取 PDF 數位文字
      const buf = await file.arrayBuffer();
      let localLooksScanned = true;
      if (window.TreesLocalPdf && typeof window.TreesLocalPdf.extractPdfTextLocal === 'function') {
        const pdfRes = await window.TreesLocalPdf.extractPdfTextLocal(buf);
        if (pdfRes && !pdfRes.isScanned && pdfRes.text && pdfRes.text.trim().length >= 4) {
          const candidate = pdfRes.text.trim();
          const badChars = (candidate.match(/\uFFFD/g) || []).length;
          if (badChars / Math.max(candidate.length, 1) < 0.15) {
            extractedText = candidate;
            localLooksScanned = false;
          }
        }
      }

      // 第 2 級（僅當 PDF 是純掃描圖片檔、完全無可選文字時）：才啟用快速視覺 OCR（嚴格 10 秒上限＋4 秒手機複製提示）
      const MAX_VISION_PDF_BYTES = 4.5 * 1024 * 1024;
      let pdfErrDetail = '';
      let hitPdfLimit = false;
      if (!extractedText && localLooksScanned && file.size <= MAX_VISION_PDF_BYTES) {
        let pdfDataUrl = await fileToDataUrl(file);
        if (pdfDataUrl && pdfDataUrl.includes(',')) {
          pdfDataUrl = `data:application/pdf;base64,${pdfDataUrl.split(',')[1]}`;
        }
        const pdfCacheKey = computeFastImageKey(pdfDataUrl);
        extractedText = visionLocalCache.get(pdfCacheKey) || '';

        if (!extractedText && pdfDataUrl) {
          replyBox.textContent = currentLang === 'en'
            ? `📷 Scanned image PDF detected — running fast OCR on "${file.name}"...`
            : `📷 偵測到掃描圖片型 PDF，正在快速識字「${file.name}」...`;
          const clearPdfSlowTip = startOcrSlowTipTimer(replyBox, myPdfSeq, 4000);
          try {
            const activeKey = getActiveUserApiKey();
            if (activeKey && isGoogleGeminiKey(activeKey)) {
              const pdfOcrPrompt = 'Extract all visible Chinese and English text from this scanned PDF in natural reading order, one line per sentence. Output ONLY the clean text.';
              const { text: aiPdfText, diagError, limitReached } = await fetchFastAccurateAI(pdfOcrPrompt, '', '', pdfDataUrl);
              if (aiPdfText) extractedText = aiPdfText;
              else {
                if (diagError) pdfErrDetail = diagError;
                if (limitReached || /LIMIT_REACHED/i.test(diagError || '')) hitPdfLimit = true;
              }
            } else {
              const r = await fetchWithTimeout(`${CF_WORKER_ENDPOINTS[0]}/vision-ocr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: pdfDataUrl, mode: 'ocr_only' })
              }, 10000);
              const d = await r.json().catch(() => ({}));
              if (r.ok && d.success && d.text) {
                extractedText = d.text;
              } else {
                pdfErrDetail = d?.message || d?.detail || d?.error || `HTTP ${r.status}`;
                if (r.status === 429 || /LIMIT_REACHED/i.test(String(pdfErrDetail))) hitPdfLimit = true;
              }
            }
          } catch (e) {
            pdfErrDetail = e && e.name === 'AbortError' ? 'Timeout (10s)' : (e.message || 'Network error');
          } finally {
            clearPdfSlowTip();
          }
        }

        if (extractedText && extractedText.trim()) {
          const cleanReflowed = (window.TreesLocalPdf && typeof window.TreesLocalPdf.reflowPdfText === 'function')
            ? window.TreesLocalPdf.reflowPdfText(extractedText)
            : extractedText.trim();
          extractedText = cleanReflowed || extractedText.trim();
          if (pdfCacheKey) saveVisionCache(pdfCacheKey, extractedText);
        }
      }

      if (myPdfSeq !== activeRequestSeq) return;

      if (!extractedText && hitPdfLimit) {
        replyBox.style.display = 'block';
        replyBox.style.cursor = 'pointer';
        replyBox.innerHTML = '🔑 <b>Daily free cloud scanned-PDF OCR limit reached.</b> Click here to add your own free Gemini API Key, or copy text directly from your PDF viewer / phone and paste (⌘V / Ctrl+V) here!';
        replyBox.onclick = () => {
          replyBox.onclick = null;
          replyBox.style.cursor = '';
          openStudioKeyModal();
        };
        const limitBox = document.getElementById('apiLimitBox');
        if (limitBox) limitBox.style.display = 'block';
        return;
      }
      if (!extractedText) {
        replyBox.style.display = 'block';
        replyBox.textContent = getFastPhoneCopyTipText(true) + (pdfErrDetail ? ` (${pdfErrDetail})` : '');
        return;
      }
    } else {
      extractedText = await file.text();
      if (name.endsWith('.html') || name.endsWith('.htm')) {
        try {
          const doc = new DOMParser().parseFromString(extractedText, 'text/html');
          doc.querySelectorAll('script, style, noscript').forEach(el => el.remove());
          extractedText = (doc.body && doc.body.textContent) ? doc.body.textContent : extractedText;
        } catch (e) {}
      } else if (name.endsWith('.srt') || name.endsWith('.vtt')) {
        extractedText = extractedText
          .replace(/WEBVTT/g, '')
          .replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}.*/g, '')
          .replace(/^\d+\s*$/gm, '');
      }
    }

    const clean = (extractedText || '').trim();
    if (!clean) {
      replyBox.textContent = currentLang === 'en' ? '⚠️ Could not extract text from this file.' : '⚠️ 無法從此文件中提取文字。';
      return;
    }

    const maxChars = (typeof getActiveTierLimits === 'function') ? getActiveTierLimits().transMaxChars : 2000;
    const clipped = clean.slice(0, maxChars);
    const uIn = document.getElementById('userInput');
    if (uIn) {
      uIn.value = clipped;
      if (typeof handleUserInputChange === 'function') handleUserInputChange(uIn);
    }
    await runDirectTranslate(clipped, { skipLengthCheck: true });
    if (clean.length > maxChars && replyBox) {
      replyBox.style.display = 'block';
      replyBox.style.cursor = 'pointer';
      replyBox.innerHTML = currentLang === 'zh'
        ? `📏 文件共 ${clean.length.toLocaleString()} 字，已為您翻譯前 ${maxChars.toLocaleString()} 字。點擊此處填入自有 <b>🔑 API Key</b> 或升級 <b>💎 Pro</b> 解鎖更長文檔。`
        : `📏 Document has ${clean.length.toLocaleString()} chars — translated the first ${maxChars.toLocaleString()}. Click here to add your own <b>🔑 API Key</b> or upgrade to <b>💎 Pro</b> for longer files.`;
      replyBox.onclick = () => {
        replyBox.onclick = null;
        replyBox.style.cursor = '';
        if (typeof openStudioProModal === 'function') openStudioProModal();
      };
    }
  } catch (err) {
    replyBox.textContent = '⚠️ Error reading file.';
  }
}

async function fetchCloudDocWeb(rawUrl) {
  const cleanDocText = (txt) => {
    if (!txt || typeof txt !== 'string') return '';
    const trimmed = txt.replace(/^\uFEFF/, '').trim();
    if (!trimmed || /^<!DOCTYPE html|^<html/i.test(trimmed)) return '';
    if (/Google Accounts|Sign in - Google|ServiceLogin/i.test(trimmed.slice(0, 400))) return '';
    return trimmed;
  };

  const raceFetch = async (urls, stripJina = false) => {
    const tasks = urls.map(u =>
      fetchWithTimeout(u, { credentials: 'omit' }, 6500)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(t => {
          const s = (stripJina && u.startsWith('https://r.jina.ai/'))
            ? t.replace(/^Title:.*?\n+/s, '').replace(/^URL Source:.*?\n+/m, '').replace(/^Markdown Content:\s*/m, '').trim()
            : t;
          const c = cleanDocText(s);
          if (c) return c;
          throw new Error('empty');
        })
    );
    try { return await Promise.any(tasks); } catch (e) { return ''; }
  };

  const gdocMatch = rawUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/) || rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (gdocMatch && /docs\.google\.com/i.test(rawUrl)) {
    const exportUrl = `https://docs.google.com/document/d/${gdocMatch[1]}/export?format=txt`;
    return await raceFetch([
      exportUrl,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(exportUrl)}`,
      `https://r.jina.ai/${exportUrl}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(exportUrl)}`
    ], true);
  }

  const gdriveMatch = rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (gdriveMatch && /drive\.google\.com/i.test(rawUrl)) {
    const dlUrl = `https://drive.google.com/uc?export=download&id=${gdriveMatch[1]}`;
    return await raceFetch([
      `https://api.allorigins.win/raw?url=${encodeURIComponent(dlUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(dlUrl)}`
    ]);
  }

  if (/dropbox\.com/i.test(rawUrl)) {
    const dlUrl = rawUrl.replace(/[?&]dl=0/i, '').includes('?') ? `${rawUrl.replace(/[?&]dl=0/i, '')}&dl=1` : `${rawUrl.replace(/[?&]dl=0/i, '')}?dl=1`;
    return await raceFetch([
      `https://api.allorigins.win/raw?url=${encodeURIComponent(dlUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(dlUrl)}`
    ]);
  }

  return await raceFetch([
    rawUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(rawUrl)}`,
    `https://r.jina.ai/${rawUrl}`
  ], true);
}

async function handleFetchCloudLink() {
  const rawUrl = document.getElementById('cloudUrlInput').value.trim();
  if (!rawUrl) return;

  const modal = document.getElementById('fileMenuModal');
  if (modal) modal.style.display = 'none';
  const replyBox = document.getElementById('aiReplyBox');
  replyBox.style.display = 'block';
  replyBox.textContent = currentLang === 'en' ? '☁️ Extracting Google Docs / Drive content...' : '☁️ 正在讀取 Google Docs / 網盤文件內容...';

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'TP_FETCH_CLOUD_DOC', url: rawUrl }, async (res) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        replyBox.textContent = currentLang === 'en'
          ? '⚠️ Extension reloaded — please refresh this tab and try again.'
          : '⚠️ 擴充功能剛重載，請重新整理分頁後再試。';
        return;
      }
      if (res && res.ok && res.text && res.text.trim()) {
        const maxChars = (typeof getActiveTierLimits === 'function') ? getActiveTierLimits().transMaxChars : 2000;
        const clipped = res.text.trim().slice(0, maxChars);
        const uIn = document.getElementById('userInput');
        if (uIn) {
          uIn.value = clipped;
          if (typeof handleUserInputChange === 'function') handleUserInputChange(uIn);
        }
        await runDirectTranslate(clipped, { skipLengthCheck: true });
      } else if (res && res.ok && res.base64DataUrl) {
        const fetchRes = await fetch(res.base64DataUrl);
        const blob = await fetchRes.blob();
        const ext = res.fileType === 'docx' ? '.docx' : (res.fileType === 'pdf' ? '.pdf' : '.txt');
        await handleUnifiedFileUpload(new File([blob], 'google_drive_file' + ext, { type: blob.type }));
      } else {
        replyBox.textContent = currentLang === 'en'
          ? '⚠️ Could not read link directly. Make sure the Google Doc is set to "Anyone with the link can view"!'
          : '⚠️ 無法直接讀取連結。請確認該 Google Docs 權限已設為「知道連結的任何人均可查看」！';
      }
    });
    return;
  }

  // 純網頁環境：直連 + 並發代理極速提取
  try {
    const text = await fetchCloudDocWeb(rawUrl);
    if (text && text.trim()) {
      const maxChars = (typeof getActiveTierLimits === 'function') ? getActiveTierLimits().transMaxChars : 2000;
      const clipped = text.trim().slice(0, maxChars);
      const uIn = document.getElementById('userInput');
      if (uIn) {
        uIn.value = clipped;
        if (typeof handleUserInputChange === 'function') handleUserInputChange(uIn);
      }
      await runDirectTranslate(clipped, { skipLengthCheck: true });
    } else {
      replyBox.textContent = currentLang === 'en'
        ? '⚠️ Could not read link directly. Make sure the Google Doc is set to "Anyone with the link can view"!'
        : '⚠️ 無法直接讀取連結。請確認該 Google Docs 權限已設為「知道連結的任何人均可查看」！';
    }
  } catch (e) {
    replyBox.textContent = currentLang === 'en'
      ? '⚠️ Could not read link directly. Make sure the Google Doc is set to "Anyone with the link can view"!'
      : '⚠️ 無法直接讀取連結。請確認該 Google Docs 權限已設為「知道連結的任何人均可查看」！';
  }
}

// =========================================================================
// 🎙️ AIcapsule 雙語語音識別引擎 (EN / 中文 獨立切換 + 3軌聲學指紋 + 8候選詞糾偏)
// =========================================================================
function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 110) + 'px';
}

function setVoiceLangMode(mode) {
  const btn = document.getElementById('voiceLangBtn');
  const inputEl = document.getElementById('userInput');
  spokenLang = (mode === 'zh') ? 'zh' : 'en';
  if (btn) {
    if (spokenLang === 'zh') {
      btn.textContent = '中文';
      btn.classList.add('zh-mode');
    } else {
      btn.textContent = 'EN';
      btn.classList.remove('zh-mode');
    }
  }
  if (inputEl && !inputEl.value) {
    inputEl.placeholder = (spokenLang === 'zh')
      ? '請向 AI 提問任何問題（按 Enter 或點麥克風說普通話），或貼上文件/圖片翻譯...'
      : UI_TEXT[currentLang].placeholder;
  }
}

function handleUserInputChange(el) {
  autoResizeTextarea(el);
  if (typeof updateInputCharCounter === 'function') updateInputCharCounter();
}

function toggleVoiceLang() {
  setVoiceLangMode(spokenLang === 'en' ? 'zh' : 'en');
  if (activeRec) {
    clearTimeout(voiceSilenceTimer);
    activeRec.onend = null;
    try { activeRec.stop(); } catch (e) {}
    activeRec = null;
    const btn = document.getElementById('micBtn');
    if (btn) btn.classList.remove('recording');
    setTimeout(() => toggleVoice(), 80);
  }
}

function getPhoneticTrackForAI(text) {
  if (!text) return '';
  if (/[\u4e00-\u9fa5]/.test(text)) {
    try {
      if (typeof window.pinyinPro !== 'undefined' && window.pinyinPro.pinyin) {
        const withTone = window.pinyinPro.pinyin(text, { toneType: 'num' });
        const noTone = window.pinyinPro.pinyin(text, { toneType: 'none' });
        const fuzzy = noTone
          .replace(/\bzh/g, 'z').replace(/\bch/g, 'c').replace(/\bsh/g, 's')
          .replace(/ing\b/g, 'in').replace(/eng\b/g, 'en').replace(/ang\b/g, 'an');
        return `Pinyin: "${withTone}" | Toneless: "${noTone}" | Fuzzy: "${fuzzy}"`;
      }
      if (typeof TreesSegmenter !== 'undefined' && TreesSegmenter.processChinese) {
        const pys = [];
        const dummy = document.createDocumentFragment();
        TreesSegmenter.processChinese(text, dummy, text, 0, (ch, py) => pys.push(py));
        const withTone = pys.join(' ');
        const noTone = withTone.replace(/[0-5]/g, '');
        const fuzzy = noTone
          .replace(/\bzh/g, 'z').replace(/\bch/g, 'c').replace(/\bsh/g, 's')
          .replace(/ing\b/g, 'in').replace(/eng\b/g, 'en').replace(/ang\b/g, 'an');
        return `Pinyin: "${withTone}" | Toneless: "${noTone}" | Fuzzy: "${fuzzy}"`;
      }
    } catch (e) {}
    return text;
  }
  return `Spoken Phonetics: "${text}"`;
}

function toggleVoice() {
  const btn = document.getElementById('micBtn');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert(currentLang === 'en' ? 'Voice input requires Chrome, Edge, or Safari.' : '當前瀏覽器不支援語音輸入。');
    return;
  }
  if (activeRec) {
    clearTimeout(voiceSilenceTimer);
    activeRec.stop();
    return;
  }

  // 先靜音可能正在朗讀的語音，避免麥克風收進電腦喇叭回音造成識別錯字
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  latestVoiceCandidates = [];
  const inputEl = document.getElementById('userInput');
  if (inputEl) {
    inputEl.value = '';
    autoResizeTextarea(inputEl);
  }
  const limitBox = document.getElementById('apiLimitBox');
  if (limitBox) limitBox.style.display = 'none';

  activeRec = new SR();
  activeRec.lang = (spokenLang === 'en') ? 'en-US' : 'zh-CN';
  activeRec.interimResults = true;
  // maxAlternatives = 1 啟用 Chrome 預設旗艦高精度語音模型（與 Google 搜尋／Google Docs 語音輸入同級，避免 >1 退回舊版解碼器）
  activeRec.maxAlternatives = 1;
  // 中英文皆使用 continuous: true 避免換氣停頓就被 Chrome 過早截斷
  activeRec.continuous = true;
  if (btn) btn.classList.add('recording');

  const replyBox = document.getElementById('aiReplyBox');
  if (replyBox) {
    replyBox.style.display = 'block';
    replyBox.textContent = (spokenLang === 'en')
      ? '🔴 Listening in English (EN)... Pause 3.5s or tap Mic to send.'
      : '🔴 正在聽取中文語音 (中文模式)... 說完停頓 3 秒或再點麥克風立即送出！';
  }

  let lastValidFullText = '';
  let hasSpokenYet = false;
  let voiceSubmitted = false;

  function scheduleGentleStop() {
    clearTimeout(voiceSilenceTimer);
    // 放寬停頓容忍時間（中文 3.2 秒、英文 3.8 秒），避免說話換氣或思考時被過早截斷；說完也可直接再點麥克風立即送出
    const waitMs = (spokenLang === 'en')
      ? (hasSpokenYet ? 3800 : 9000)
      : (hasSpokenYet ? 3200 : 8000);
    voiceSilenceTimer = setTimeout(() => {
      if (activeRec) activeRec.stop();
    }, waitMs);
  }

  scheduleGentleStop();

  const sep = (spokenLang === 'en') ? ' ' : '';

  activeRec.onresult = (e) => {
    hasSpokenYet = true;
    scheduleGentleStop();
    const finalParts = [];
    const interimParts = [];

    for (let i = 0; i < e.results.length; i++) {
      const res = e.results[i];
      const top = (res[0]?.transcript || '').trim();
      if (!top) continue;
      if (res.isFinal) finalParts.push(top);
      else interimParts.push(top);
    }

    const mergedNow = [finalParts.join(sep).trim(), interimParts.join(sep).trim()].filter(Boolean).join(sep).trim();
    if (mergedNow && inputEl) {
      lastValidFullText = mergedNow;
      inputEl.value = lastValidFullText;
      autoResizeTextarea(inputEl);
    }
    latestVoiceCandidates = lastValidFullText ? [lastValidFullText] : [];
  };

  const finishVoiceSession = () => {
    if (voiceSubmitted) return;
    voiceSubmitted = true;
    clearTimeout(voiceSilenceTimer);
    if (btn) btn.classList.remove('recording');
    activeRec = null;

    const finalSpoken = (lastValidFullText || (inputEl ? inputEl.value : '') || '').trim();
    if (finalSpoken) {
      if (inputEl) {
        inputEl.value = finalSpoken;
        autoResizeTextarea(inputEl);
      }
      runSmartAI(finalSpoken, latestVoiceCandidates, true);
    } else if (replyBox) {
      replyBox.style.display = 'none';
    }
  };

  activeRec.onend = finishVoiceSession;
  activeRec.onerror = finishVoiceSession;

  try {
    activeRec.start();
  } catch (err) {}
}

