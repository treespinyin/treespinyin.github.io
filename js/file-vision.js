/**
 * 模組 5: js/file-vision.js (高併發防刷加固版)
 * 負責：拖拽文件上傳、PDF/Word 本地秒速解析、960px 圖片壓縮、本機快取與 3級分流識圖
 */
const CF_VISION_ENDPOINT = 'https://treespinyin-api.treespinyin.workers.dev/vision-ocr';
const photoVisionCache = new Map();

const dropZone = document.getElementById('dropZone');
if (dropZone) {
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#1b5e20'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      if (f.type.startsWith('image/')) {
        handlePhotoUpload({ files: [f], value: '' });
      } else {
        handleDocFileUpload({ files: [f], value: '' });
      }
    }
  });
}

function loadScriptDynamic(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function extractPdfTextFast(file) {
  await loadScriptDynamic('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let out = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const pageStr = tc.items.map(item => item.str).join(' ');
    if (pageStr.trim()) out.push(pageStr.trim());
  }
  return out.join('\n');
}

async function extractWordTextFast(file) {
  await loadScriptDynamic('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return (res.value || '').trim();
}

async function handleDocFileUpload(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const name = (file.name || '').toLowerCase();
  input.value = '';
  const replyBox = document.getElementById('aiReplyBox');
  replyBox.className = 'ai-reply-box';
  replyBox.style.display = 'block';
  replyBox.innerText = `📄 Reading ${file.name}...`;

  try {
    let extractedText = '';
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      extractedText = await extractPdfTextFast(file);
    } else if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
      extractedText = await extractWordTextFast(file);
    } else {
      extractedText = await file.text();
      if (name.endsWith('.html') || name.endsWith('.htm')) {
        const tmp = document.createElement('div');
        tmp.innerHTML = extractedText;
        extractedText = tmp.innerText || tmp.textContent || '';
      }
    }

    const clean = (extractedText || '').trim();
    if (!clean) {
      replyBox.innerText = '⚠️ No selectable text found in this file.';
      return;
    }

    replyBox.style.display = 'none';
    const clipped = clean.slice(0, 3500);
    document.getElementById('userInput').value = clipped;
    await runDirectTranslate(clipped);
  } catch (err) {
    replyBox.innerText = '⚠️ Failed to read file.';
  }
}

function compressImg(file, maxW = 960, quality = 0.72) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhotoUpload(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  input.value = '';

  const replyBox = document.getElementById('aiReplyBox');
  const list = document.getElementById('annotationList');
  replyBox.className = 'ai-reply-box';
  replyBox.style.display = 'block';
  replyBox.innerText = currentLang === 'en' ? '📷 Scanning photo...' : '📷 正在極速識別照片...';
  list.innerHTML = '';

  const dataUrl = await compressImg(file, 960, 0.72);
  const prev = document.getElementById('previewImg');
  prev.src = dataUrl;
  prev.style.display = 'block';

  // 0. 檢查本機快取，避免同一張照片重複點擊消耗額度
  const imgCacheKey = dataUrl.slice(0, 120) + '_' + dataUrl.length;
  if (photoVisionCache.has(imgCacheKey)) {
    const cachedText = photoVisionCache.get(imgCacheKey);
    const { ok } = await renderBilingualAIOutput(cachedText);
    if (!ok) await runDirectTranslate(cachedText);
    return;
  }

  let text = '';

  // 1. 第一級：瀏覽器原生 TextDetector (純本地 0 毫秒、0 流量)
  if ('TextDetector' in window) {
    try {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const detector = new window.TextDetector();
      const blocks = await detector.detect(img);
      if (blocks && blocks.length > 0) {
        const raw = blocks.map(b => b.rawValue).join('\n').trim();
        if (raw && !/[\u4e00-\u9fa5]/.test(raw) && raw.length >= 3) text = raw;
      }
    } catch (e) {}
  }

  // 2. 第二級：若用戶填了個人 Gemini Key，走個人 Key 視覺直連
  if (!text && backupKey) {
    const vPrompt = [
      'Extract all Chinese and English text from this image accurately, then provide its faithful sentence-by-sentence translation.',
      'CRITICAL RULES:',
      '1. Keep the exact original text on the left side of "|||" and its translation on the right side.',
      '2. Output strictly one sentence pair per line in format: Source_Text ||| Translated_Text',
      '3. Do NOT output any intro, explanation, or markdown formatting.'
    ].join('\n');
    const { text: aiRes } = await fetchFastAccurateAI(vPrompt, dataUrl);
    if (aiRes) text = aiRes;
  }

  // 3. 第三級：走您的 Cloudflare Worker 託管通道 (/vision-ocr)，免 Key 且受每日 30 次防刷保護
  if (!text) {
    try {
      const r = await fetchWithTimeout(CF_VISION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      }, 12000);
      const d = await r.json();
      if (d.success && d.text) {
        text = d.text;
      } else if (r.status === 429 && d.message) {
        replyBox.className = 'ai-reply-box friendly-reminder';
        replyBox.innerText = '💡 ' + d.message;
        return;
      }
    } catch (e) {}
  }

  if (text && text.trim()) {
    photoVisionCache.set(imgCacheKey, text);
    const { ok } = await renderBilingualAIOutput(text);
    if (!ok) {
      const clean = text.replace(/\r\n/g, '\n').trim();
      document.getElementById('userInput').value = clean;
      replyBox.style.display = 'none';
      await runDirectTranslate(clean);
    }
  } else {
    replyBox.innerText = currentLang === 'en'
      ? '💡 No clear text found. Plug in your free Gemini Key in [🔑 API Key] for enhanced AI Vision.'
      : '💡 未識別出清晰文字。您可在右上角 [🔑 API Key] 填入免費 Gemini Key 獲得增強識別。';
  }
}
