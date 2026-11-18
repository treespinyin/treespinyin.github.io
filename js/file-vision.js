/**
 * 模組 5: js/file-vision.js
 * 負責：拖拽/剪貼簿貼圖上傳、Word(.docx/.doc)/PDF/Google Docs(.gdoc)/SRT 本地秒速解析、
 *      現場實時相機拍照（防常亮即時斷電）與 Mac電腦端+手機端 雙端極速商業化識圖引擎
 */
const dropZone = document.getElementById('dropZone');
if (dropZone) {
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#1b5e20'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      if (f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|heic)$/i.test(f.name || '')) {
        handlePhotoUpload({ files: [f], value: '' });
      } else {
        handleDocFileUpload({ files: [f], value: '' });
      }
    }
  });
}

window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      e.preventDefault();
      const blob = item.getAsFile();
      if (blob) {
        handlePhotoUpload({ files: [new File([blob], 'clipboard_image.png', { type: blob.type })], value: '' });
      }
      break;
    }
  }
});

function loadScriptDynamic(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function extractDocxTextNative(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder('utf-8');
  let offset = 0;

  while (offset + 30 < bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) { offset++; continue; }
    const flags = view.getUint16(offset + 6, true);
    const compMethod = view.getUint16(offset + 8, true);
    let compSize = view.getUint32(offset + 18, true);
    const fileNameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const entryName = decoder.decode(bytes.subarray(offset + 30, offset + 30 + fileNameLen));
    const dataStart = offset + 30 + fileNameLen + extraLen;

    if (compSize === 0 || (flags & 0x0008)) {
      let nextHeader = dataStart;
      while (nextHeader + 4 < bytes.length) {
        const sig = view.getUint32(nextHeader, true);
        if (sig === 0x04034b50 || sig === 0x02014b50 || sig === 0x06054b50) break;
        nextHeader++;
      }
      compSize = Math.max(0, nextHeader - dataStart);
    }

    const compData = bytes.subarray(dataStart, Math.min(bytes.length, dataStart + compSize));

    if (entryName === 'word/document.xml') {
      let xmlText = '';
      if (compMethod === 0) {
        xmlText = decoder.decode(compData);
      } else if (compMethod === 8 && typeof DecompressionStream !== 'undefined') {
        try {
          const ds = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          writer.write(compData).catch(() => {});
          writer.close().catch(() => {});
          const reader = ds.readable.getReader();
          const chunks = [];
          let totalLen = 0;
          while (true) {
            try {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                chunks.push(value);
                totalLen += value.byteLength;
              }
            } catch (readErr) {
              break;
            }
          }
          const merged = new Uint8Array(totalLen);
          let pos = 0;
          for (const c of chunks) {
            merged.set(c, pos);
            pos += c.byteLength;
          }
          xmlText = decoder.decode(merged);
        } catch (e) {}
      }
      if (xmlText) {
        return xmlText
          .replace(/<w:tab[^>]*\/>/g, '\t')
          .replace(/<w:br[^>]*\/>/g, '\n')
          .replace(/<\/w:p>/g, '\n')
          .replace(/<\/w:tr>/g, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>')
          .replace(/"/g, '"')
          .replace(/'/g, "'")
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
    }
    offset = dataStart + (compSize > 0 ? compSize : 1);
  }
  return '';
}

function extractLegacyDocTextNative(arrayBuffer) {
  try {
    const utf16 = new TextDecoder('utf-16le').decode(arrayBuffer);
    const blocks = utf16.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffefA-Za-z0-9,.;:!?'""()\-\s]{6,}/g) || [];
    const filtered = blocks
      .map(s => s.trim())
      .filter(s => /[\u4e00-\u9fa5]/.test(s) || (/[A-Za-z]{3,}/.test(s) && !/Microsoft|Word\.Document|Normal\.dot|Times New Roman|Calibri|Arial|SUMMARYINFO/i.test(s)));
    if (filtered.length > 0) return filtered.join('\n').trim();
  } catch (e) {}
  return '';
}

async function extractPdfTextFast(file) {
  await loadScriptDynamic('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let out = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 25); i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const pageStr = tc.items.map(item => item.str).join(' ');
    if (pageStr.trim()) out.push(pageStr.trim());
  }
  return out.join('\n');
}

async function extractWordTextFast(file) {
  const buf = await file.arrayBuffer();
  let text = await extractDocxTextNative(buf);
  if (text) return text;

  try {
    await loadScriptDynamic('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    if (res && res.value && res.value.trim()) return res.value.trim();
  } catch (e) {}

  return extractLegacyDocTextNative(buf);
}

async function handleDocFileUpload(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const name = (file.name || '').toLowerCase();
  input.value = '';
  const replyBox = document.getElementById('aiReplyBox');
  replyBox.className = 'ai-reply-box';
  replyBox.style.display = 'block';
  replyBox.innerText = currentLang === 'en' ? `📄 Reading ${file.name}...` : `📄 正在讀取並翻譯 ${file.name}...`;

  try {
    if (name.endsWith('.gdoc') || name.endsWith('.gsheet') || name.endsWith('.gslides')) {
      const rawJson = await file.text();
      try {
        const meta = JSON.parse(rawJson);
        const docUrl = meta.url || (meta.doc_id ? `https://docs.google.com/document/d/${meta.doc_id}/edit` : '');
        if (docUrl) {
          document.getElementById('userInput').value = docUrl;
          await runDirectTranslate(docUrl);
          return;
        }
      } catch (e) {}
    }

    let extractedText = '';
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      extractedText = await extractPdfTextFast(file);
    } else if (name.endsWith('.docx') || name.endsWith('.doc') || file.type.includes('word')) {
      extractedText = await extractWordTextFast(file);
    } else {
      extractedText = await file.text();
      if (extractedText.trim().startsWith('{') && /docs\.google\.com\/document\/d\/|"doc_id"/i.test(extractedText)) {
        try {
          const meta = JSON.parse(extractedText);
          const docUrl = meta.url || (meta.doc_id ? `https://docs.google.com/document/d/${meta.doc_id}/edit` : '');
          if (docUrl) {
            await runDirectTranslate(docUrl);
            return;
          }
        } catch (e) {}
      }
      if (name.endsWith('.html') || name.endsWith('.htm')) {
        const tmp = document.createElement('div');
        tmp.innerHTML = extractedText;
        extractedText = tmp.innerText || tmp.textContent || '';
      } else if (name.endsWith('.srt') || name.endsWith('.vtt')) {
        extractedText = extractedText
          .replace(/WEBVTT/g, '')
          .replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}.*/g, '')
          .replace(/^\d+\s*$/gm, '');
      }
    }

    const clean = (extractedText || '').trim();
    if (!clean) {
      replyBox.innerText = currentLang === 'en' ? '⚠️ No selectable text found in this file.' : '⚠️ 無法從此文件中提取文字。';
      return;
    }

    replyBox.style.display = 'none';
    const clipped = clean.slice(0, 5000);
    document.getElementById('userInput').value = clipped;
    await runDirectTranslate(clipped);
  } catch (err) {
    replyBox.innerText = currentLang === 'en' ? '⚠️ Failed to read file.' : '⚠️ 讀取文件失敗。';
  }
}

// =========================================================================
// 🚀 極速圖片壓縮與記憶體快取 (Mac Retina 截圖與手機千萬像素照片 0.03秒轉輕量高清 JPEG)
// =========================================================================
const visionMemoryCache = new Map();

function compressImg(file, maxW = 960, quality = 0.76) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxW || h > maxW) {
          if (w >= h) { h = Math.round((h * maxW) / w); w = maxW; }
          else { w = Math.round((w * maxW) / h); h = maxW; }
        }
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        // 強制鋪白底，防止 Mac 透明背景 PNG 截圖轉 JPEG 後變全黑
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve('');
      img.src = e.target.result;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

async function fetchVisionWithTimeout(url, options, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 引擎 1：手機端 & Mac 端本地硬體 NPU 0.05秒極速識別 (0 伺服器成本，萬人併發不卡)
async function detectTextHardwareFast(dataUrl) {
  if (!('TextDetector' in window)) return '';
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const detector = new window.TextDetector();
    const blocks = await detector.detect(img);
    if (blocks && blocks.length > 0) {
      const raw = blocks
        .map(b => (b.rawValue || '').trim())
        .filter(Boolean)
        .join('\n')
        .trim();
      if (/[\u4e00-\u9fa5]/.test(raw) || /[A-Za-z0-9]{2,}/.test(raw)) {
        return raw;
      }
    }
  } catch (e) {}
  return '';
}

// 引擎 2：Mac 電腦端與手機端 100% 免費免 Key 極速 OCR 通道 (利用免費多語系 OCR 節點 + 本地端算力，專治 Mac 無 TextDetector)
async function detectTextClientFreeOCR(dataUrl) {
  const tasks = [];

  // 子通道 2A：極速免費多語系 OCR (中英雙語並發，支援繁體/簡體/英文，無需用戶填任何 Key，1秒返回)
  const runFreeOcrEndpoint = async (langCode) => {
    const fd = new FormData();
    fd.append('base64Image', dataUrl);
    fd.append('language', langCode);
    fd.append('isOverlayRequired', 'false');
    fd.append('scale', 'true');
    fd.append('OCREngine', '2');
    const res = await fetchVisionWithTimeout('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'apikey': 'helloworld' },
      body: fd
    }, 5500);
    if (!res.ok) throw new Error('OCR HTTP ' + res.status);
    const data = await res.json();
    const parsed = (data?.ParsedResults || [])
      .map(r => (r.ParsedText || '').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
    if (!parsed || parsed.length < 1) throw new Error('Empty OCR');
    return parsed;
  };

  tasks.push(runFreeOcrEndpoint('cht'));
  tasks.push(runFreeOcrEndpoint('chs'));
  tasks.push(runFreeOcrEndpoint('eng'));

  try {
    return await Promise.any(tasks);
  } catch (e) {
    return '';
  }
}

// 引擎 3：雲端 Gemini Vision + Cloudflare Worker 全通道並發競速引擎
async function recognizeImageCloudConcurrent(dataUrl, activeKey) {
  if (!dataUrl || !dataUrl.includes(',')) return '';
  const base64Data = dataUrl.split(',')[1];
  const mimeType = (dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/) || [])[1] || 'image/jpeg';

  const visionPrompt = [
    'Extract all Chinese and English text from this image accurately (if it is an object/scene without text, write 1 short bilingual sentence naming it).',
    'Output strictly one sentence pair per line in this format:',
    'Traditional_Chinese_Text ||| Authentic_English_Text',
    'Do NOT include markdown, code blocks, or explanations.'
  ].join('\n');

  const allCompetitors = [];

  // A. 若用戶或系統有配置 API Key：同時並發競速 4 個官方極速視覺模型（誰 0.8 秒先回用誰）
  if (activeKey && activeKey.startsWith('AIza')) {
    const models = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-flash-lite-latest',
      'gemini-flash-latest'
    ];
    models.forEach((model) => {
      allCompetitors.push((async () => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(activeKey)}`;
        const res = await fetchVisionWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: visionPrompt },
                { inline_data: { mime_type: mimeType, data: base64Data } }
              ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1200 }
          })
        }, 6500);
        if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
        const d = await res.json();
        const txt = d?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n').trim();
        if (!txt) throw new Error('Gemini Empty');
        return txt;
      })());
    });
  }

  // B. Cloudflare Worker 通道 1 (/vision-ocr 專用識圖路由)
  allCompetitors.push((async () => {
    const res = await fetchVisionWithTimeout('https://treespinyin-api.treespinyin.workers.dev/vision-ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, imageBase64: base64Data, mimeType: mimeType, prompt: visionPrompt })
    }, 6000);
    if (!res.ok) throw new Error('Worker vision-ocr failed');
    const d = await res.json();
    const txt = (d?.text || d?.reply || d?.result || '').trim();
    if (!txt) throw new Error('Worker vision-ocr empty');
    return txt;
  })());

  // C. Cloudflare Worker 通道 2 (根路由多格式相容)
  allCompetitors.push((async () => {
    const res = await fetchVisionWithTimeout('https://treespinyin-api.treespinyin.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: visionPrompt,
        image: dataUrl,
        imageBase64: base64Data,
        mimeType: mimeType,
        contents: [{
          parts: [
            { text: visionPrompt },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }]
      })
    }, 6000);
    if (!res.ok) throw new Error('Worker root failed');
    const d = await res.json();
    const txt = (
      d?.text ||
      d?.reply ||
      d?.result ||
      d?.candidates?.[0]?.content?.parts?.[0]?.text ||
      ''
    ).trim();
    if (!txt) throw new Error('Worker root empty');
    return txt;
  })());

  // D. 若 ai-translator.js 的 fetchFastAccurateAI 存在，一併加入競速池
  if (typeof fetchFastAccurateAI === 'function') {
    allCompetitors.push((async () => {
      const r = await fetchFastAccurateAI(visionPrompt, dataUrl);
      const txt = (r?.text || '').trim();
      if (!txt || /API Note:|HTTP 4\d\d|Timeout|Failed to fetch/i.test(txt)) {
        throw new Error('Invalid fetchFastAccurateAI');
      }
      return txt;
    })());
  }

  try {
    return await Promise.any(allCompetitors);
  } catch (e) {
    return '';
  }
}

// =========================================================================
// 🎯 核心主入口：Mac 電腦端 + 手機端「三核並發競速」秒開識圖
// =========================================================================
async function handlePhotoUpload(input) {
  stopAllCameraStreams();

  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];
  const replyBox = document.getElementById('aiReplyBox');
  const list = document.getElementById('annotationList');
  if (replyBox) {
    replyBox.className = 'ai-reply-box';
    replyBox.style.display = 'block';
    replyBox.innerText = currentLang === 'en' ? '📷 Scanning image text...' : '📷 正在極速識別圖片文字...';
  }
  if (list) list.innerHTML = '';

  const dataUrl = await compressImg(file, 960, 0.76);
  if (!dataUrl) {
    if (replyBox) replyBox.innerText = currentLang === 'en' ? '⚠️ Failed to load image.' : '⚠️ 圖片讀取失敗。';
    try { input.value = ''; } catch (e) {}
    return;
  }

  const prev = document.getElementById('previewImg');
  if (prev) {
    prev.src = dataUrl;
    prev.style.display = 'block';
  }

  // 0毫秒本地快取命中檢查（同一張圖二次點擊 0.001秒直出，0 成本）
  const cacheSig = dataUrl.slice(0, 120) + '_' + dataUrl.length + '_' + dataUrl.slice(-120);
  if (visionMemoryCache.has(cacheSig)) {
    const cachedText = visionMemoryCache.get(cacheSig);
    await renderRecognizedVisionText(cachedText, replyBox);
    try { input.value = ''; } catch (e) {}
    return;
  }

  // 全方位抓取用戶可能填入的 API Key（相容頁面上所有 input 與 localStorage 鍵名）
  let activeKey = '';
  const keyInputs = document.querySelectorAll('#apiKeyInput, input[placeholder*="AIza"], input[type="password"]');
  keyInputs.forEach(el => {
    const v = (el.value || '').trim();
    if (v.startsWith('AIza')) activeKey = v;
  });
  if (!activeKey && typeof backupKey !== 'undefined' && String(backupKey).trim().startsWith('AIza')) {
    activeKey = String(backupKey).trim();
  }
  if (!activeKey) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const val = (localStorage.getItem(k) || '').trim();
      if (val.startsWith('AIza') && val.length >= 35) {
        activeKey = val;
        break;
      }
    }
  }
  activeKey = activeKey.replace(/\s+/g, '');

  // 🚀 三核同時起跑（絕不串行排隊！手機硬體 NPU + 雲端 Gemini/Worker + Mac/通用免Key高速OCR 同時並發）
  const hardwarePromise = detectTextHardwareFast(dataUrl);
  const cloudPromise = recognizeImageCloudConcurrent(dataUrl, activeKey);
  const freeOcrPromise = detectTextClientFreeOCR(dataUrl);

  let recognizedText = '';

  // 第一梯隊（0.05秒）：檢查手機/電腦原生硬體 NPU 是否已經瞬間掃出文字
  const hwText = await hardwarePromise;
  if (hwText && (/[\u4e00-\u9fa5]/.test(hwText) || hwText.length >= 4)) {
    recognizedText = hwText;
  }

  // 第二梯隊（0.8~1.5秒）：在 Mac 電腦端（無 TextDetector）或複雜圖片下，讓「雲端 AI 視覺」與「免 Key 高速 OCR」並發賽跑，誰先出結果立刻渲染！
  if (!recognizedText) {
    try {
      recognizedText = await Promise.any([
        cloudPromise.then(t => { if (!t) throw new Error('empty'); return t; }),
        freeOcrPromise.then(t => { if (!t) throw new Error('empty'); return t; })
      ]);
    } catch (e) {
      recognizedText = (await cloudPromise) || (await freeOcrPromise) || '';
    }
  }

  if (recognizedText && recognizedText.trim()) {
    visionMemoryCache.set(cacheSig, recognizedText);
    await renderRecognizedVisionText(recognizedText, replyBox);
  } else {
    if (replyBox) {
      replyBox.innerText = currentLang === 'en'
        ? '💡 No clear text found. Plug in your free Gemini Key in [🔑 API Key] for enhanced vision recognition.'
        : '💡 未檢測到清晰文字，可點擊右上角 [🔑 API Key] 填入您的免費 Gemini Key 提升識別率。';
    }
  }
  try { input.value = ''; } catch (e) {}
}

// 統一將識別出的文字渲染為 4 行雙語 Trees Pinyin 注音卡片
async function renderRecognizedVisionText(rawText, replyBox) {
  const cleanText = rawText
    .replace(/^```[a-zA-Z]*\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();

  if (replyBox) replyBox.style.display = 'none';

  let rendered = false;
  if (typeof renderBilingualAIOutput === 'function' && cleanText.includes('|||')) {
    try {
      const res = await renderBilingualAIOutput(cleanText);
      rendered = !!(res && res.ok);
    } catch (e) {}
  }

  if (!rendered) {
    // 若返回的是純文字（如硬體 TextDetector 或免 Key OCR 提取的原文），直接填入輸入框並調用本地極速雙語翻譯與注音
    const pureSource = cleanText
      .split('\n')
      .map(line => line.includes('|||') ? line.split('|||')[0].trim() : line.trim())
      .filter(Boolean)
      .join('\n');
    const userInputEl = document.getElementById('userInput');
    if (userInputEl) userInputEl.value = pureSource;
    if (typeof runDirectTranslate === 'function') {
      await runDirectTranslate(pureSource);
    }
  }
}

// =========================================================================
// 📸 現場實時相機拍照視訊視窗 (含徹底斷電防常亮機制)
// =========================================================================
let liveCamStream = null;

function stopAllCameraStreams() {
  if (liveCamStream) {
    try {
      liveCamStream.getTracks().forEach(t => {
        t.enabled = false;
        t.stop();
      });
    } catch (e) {}
    liveCamStream = null;
  }
  document.querySelectorAll('video').forEach(v => {
    if (v.srcObject) {
      try {
        const s = v.srcObject;
        if (s && typeof s.getTracks === 'function') {
          s.getTracks().forEach(t => {
            t.enabled = false;
            t.stop();
          });
        }
      } catch (e) {}
      v.srcObject = null;
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
    }
  });
}

function ensureLiveCameraModal() {
  if (document.getElementById('liveCameraModal')) return;
  const modal = document.createElement('div');
  modal.id = 'liveCameraModal';
  modal.className = 'modal';
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeLiveCameraModal();
  });
  modal.innerHTML = `
    <div class="modal-box" style="align-items:center; max-width:480px;">
      <h3 style="margin:0; font-size:1.05rem; color:#1b5e20;">📸 Live Camera / 現場即時拍照</h3>
      <div style="width:100%; background:#000; border-radius:12px; overflow:hidden; position:relative; aspect-ratio:4/3; display:flex; justify-content:center; align-items:center;">
        <video id="liveCameraVideo" autoplay playsinline muted style="width:100%; height:100%; object-fit:cover;"></video>
      </div>
      <canvas id="liveCameraCanvas" style="display:none;"></canvas>
      <div class="action-row" style="width:100%; margin-top:4px;">
        <button type="button" id="btnSnapLiveCam" class="btn btn-green" style="background:#d93025;">📸 Snap / 立即拍照</button>
        <button type="button" id="btnCloseLiveCam" class="btn btn-soft">Cancel / 取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('btnSnapLiveCam').addEventListener('click', takeLiveCameraSnapshot);
  document.getElementById('btnCloseLiveCam').addEventListener('click', closeLiveCameraModal);

  const observer = new MutationObserver(() => {
    if (modal.style.display === 'none' || modal.hidden) {
      stopAllCameraStreams();
    }
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
}

async function openLiveCameraModal() {
  ensureLiveCameraModal();
  stopAllCameraStreams();

  const noticeModal = document.getElementById('cameraNoticeModal');
  if (noticeModal) noticeModal.style.display = 'none';
  const fileModal = document.getElementById('fileMenuModal');
  if (fileModal) fileModal.style.display = 'none';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert(currentLang === 'en'
      ? 'Live camera requires HTTPS (e.g. treespinyin.com) or localhost. Opening photo picker instead.'
      : '現場相機需要透過網址 (https:// 或 localhost) 打開才能存取鏡頭，現在為您打開圖片選擇器。');
    document.getElementById('cameraInput')?.click();
    return;
  }

  const modal = document.getElementById('liveCameraModal');
  const video = document.getElementById('liveCameraVideo');
  modal.style.display = 'flex';

  try {
    try {
      liveCamStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false
      });
    } catch (e1) {
      liveCamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    if (modal.style.display === 'none') {
      stopAllCameraStreams();
      return;
    }
    video.srcObject = liveCamStream;
  } catch (err) {
    stopAllCameraStreams();
    modal.style.display = 'none';
    alert(currentLang === 'en'
      ? 'Camera permission denied or camera unavailable. Please allow camera access in browser settings.'
      : '無法開啟相機鏡頭（請確認瀏覽器已允許相機權限，且透過 https 網址開啟）。');
  }
}

function closeLiveCameraModal() {
  stopAllCameraStreams();
  const modal = document.getElementById('liveCameraModal');
  if (modal) modal.style.display = 'none';
}

function takeLiveCameraSnapshot() {
  const video = document.getElementById('liveCameraVideo');
  const canvas = document.getElementById('liveCameraCanvas');
  if (!video || !video.videoWidth) {
    closeLiveCameraModal();
    return;
  }
  const maxW = 960;
  let w = video.videoWidth, h = video.videoHeight;
  if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);

  // 畫面繪入畫布的同一毫秒，立即同步切斷攝像頭硬體電源並關閉視窗
  closeLiveCameraModal();

  canvas.toBlob((blob) => {
    if (blob) {
      handlePhotoUpload({ files: [new File([blob], 'camera_snapshot.jpg', { type: 'image/jpeg' })], value: '' });
    }
  }, 'image/jpeg', 0.76);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLiveCameraModal();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) closeLiveCameraModal();
});
window.addEventListener('pagehide', closeLiveCameraModal);
window.addEventListener('beforeunload', stopAllCameraStreams);

// =========================================================================
// 🔒 終極防覆蓋鎖定：確保在 mnemonics-app.js 等所有後置腳本執行後，
//    強制將圖片上傳、文件上傳與相機函數鎖定為本模組的極速版本！
// =========================================================================
function enforceVisionModuleBindings() {
  ensureLiveCameraModal();
  window.triggerDirectCamera = openLiveCameraModal;
  window.closeLiveCameraModal = closeLiveCameraModal;
  window.stopAllCameraStreams = stopAllCameraStreams;
  window.handlePhotoUpload = handlePhotoUpload;
  window.handleDocFileUpload = handleDocFileUpload;

  // 主動接管頁面上所有圖片 input (防止 HTML inline onchange 指向舊函數)
  ['photoInput', 'cameraInput', 'imageInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.onchange = function () { handlePhotoUpload(this); };
    }
  });
}

enforceVisionModuleBindings();
window.addEventListener('DOMContentLoaded', enforceVisionModuleBindings);
window.addEventListener('load', enforceVisionModuleBindings);
