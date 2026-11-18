/**
 * 模組 5: js/file-vision.js
 * 負責：拖拽/剪貼簿貼圖上傳、Word(.docx/.doc)/PDF/Google Docs(.gdoc)/SRT 本地秒速解析、現場實時相機拍照（防常亮即時斷電）與本地硬體+雲端並發極速識圖
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
      if (f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(f.name || '')) {
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

function compressImg(file, maxW = 1024, quality = 0.78) {
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

// 內部專用：帶超時的極速請求
async function fetchVisionWithTimeout(url, options, timeoutMs = 6500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 第一層：0.05秒手機/電腦端側硬體原生 OCR (NPU/GPU 加速，0流量、0延遲)
async function detectImageTextClientHardware(dataUrl) {
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
      // 只要包含有效中文字或至少 3 個英數字元，直接採納本地硬體極速結果
      if (/[\u4e00-\u9fa5]/.test(raw) || /[A-Za-z0-9]{3,}/.test(raw)) {
        return raw;
      }
    }
  } catch (e) {}
  return '';
}

// 第二層：極速直連 Gemini Vision / Cloudflare Worker 並發引擎（1~2秒秒出）
async function recognizeImageDirectFast(dataUrl, activeKey) {
  if (!dataUrl || !dataUrl.includes(',')) return '';
  const base64Data = dataUrl.split(',')[1];
  const mimeType = (dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/) || [])[1] || 'image/jpeg';

  const visionPrompt = [
    'Extract all visible text from this image accurately (if no text, briefly describe the main object/scene in 1-2 sentences).',
    'Output strictly sentence-by-sentence in this exact bilingual format (one pair per line):',
    'Traditional_Chinese_Sentence ||| Authentic_English_Sentence',
    'CRITICAL RULES:',
    '1. Left side of "|||" MUST be Traditional Chinese; right side MUST be authentic English.',
    '2. Keep the original meaning 100% faithful without altering original sentences.',
    '3. Do NOT output any intro, markdown, or explanation.'
  ].join('\n');

  const geminiPayload = {
    contents: [{
      parts: [
        { text: visionPrompt },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1500
    }
  };

  // 通道 A：只要有 API Key，直接並發競速 Google 官方極速模型 (1.2秒秒出)
  if (activeKey && activeKey.startsWith('AIza')) {
    const models = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.0-flash'];
    const callDirectModel = async (model) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(activeKey)}`;
      const res = await fetchVisionWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      }, 7000);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n').trim();
      if (!text) throw new Error('Empty');
      return text;
    };

    try {
      return await Promise.any(models.map(m => callDirectModel(m)));
    } catch (e) {}
  }

  // 通道 B：免 Key 用戶端點 + 外部 fetchFastAccurateAI 並發競速 (絕不串行卡 30 秒)
  const workerTasks = [];

  workerTasks.push((async () => {
    const res = await fetchVisionWithTimeout('https://treespinyin-api.treespinyin.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: visionPrompt,
        image: dataUrl,
        imageBase64: base64Data,
        mimeType: mimeType,
        contents: geminiPayload.contents
      })
    }, 6500);
    if (!res.ok) throw new Error('Worker root failed');
    const d = await res.json();
    const txt = (
      d?.text ||
      d?.reply ||
      d?.result ||
      d?.candidates?.[0]?.content?.parts?.[0]?.text ||
      ''
    ).trim();
    if (!txt) throw new Error('Empty root response');
    return txt;
  })());

  workerTasks.push((async () => {
    const res = await fetchVisionWithTimeout('https://treespinyin-api.treespinyin.workers.dev/vision-ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, prompt: visionPrompt })
    }, 6500);
    if (!res.ok) throw new Error('Vision OCR failed');
    const d = await res.json();
    const txt = (d?.text || d?.reply || '').trim();
    if (!txt) throw new Error('Empty vision-ocr');
    return txt;
  })());

  if (typeof fetchFastAccurateAI === 'function') {
    workerTasks.push((async () => {
      const r = await fetchFastAccurateAI(visionPrompt, dataUrl);
      const txt = (r?.text || '').trim();
      if (!txt) throw new Error('Empty fetchFastAccurateAI');
      return txt;
    })());
  }

  try {
    return await Promise.any(workerTasks);
  } catch (e) {
    return '';
  }
}

async function handlePhotoUpload(input) {
  // 任何上傳或拍照觸發識圖時，第一時間強制斷開所有相機硬體軌道，防止鏡頭常亮
  stopAllCameraStreams();

  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const replyBox = document.getElementById('aiReplyBox');
  const list = document.getElementById('annotationList');
  replyBox.className = 'ai-reply-box';
  replyBox.style.display = 'block';
  replyBox.innerText = currentLang === 'en' ? '📷 Scanning image text...' : '📷 正在極速識別圖片文字...';
  list.innerHTML = '';

  const dataUrl = await compressImg(file, 1024, 0.78);
  if (!dataUrl) {
    replyBox.innerText = currentLang === 'en' ? '⚠️ Failed to load image.' : '⚠️ 圖片讀取失敗。';
    input.value = '';
    return;
  }

  const prev = document.getElementById('previewImg');
  if (prev) {
    prev.src = dataUrl;
    prev.style.display = 'block';
  }

  // 全方位讀取用戶可能填入的 API Key
  const modalKeyVal = (document.getElementById('apiKeyInput')?.value || '').trim();
  const savedKeyVal = (
    localStorage.getItem('tp_v22_backup_key') ||
    localStorage.getItem('tp_test_gemini_key') ||
    localStorage.getItem('tp_gemini_api_key') ||
    localStorage.getItem('gemini_api_key') ||
    ''
  ).trim();
  const globalKey = (typeof backupKey !== 'undefined' && backupKey) ? String(backupKey).trim() : '';
  const activeKey = (modalKeyVal || globalKey || savedKeyVal).replace(/\s+/g, '');

  // 第一優先：0.05秒調用手機/電腦底層硬體 TextDetector (同時在背景預熱雲端並發請求，做到 0 等待)
  const cloudPromise = recognizeImageDirectFast(dataUrl, activeKey);
  let recognizedText = await detectImageTextClientHardware(dataUrl);

  // 若本地硬體成功掃出高純度文字（且用戶未強制使用雲端視覺描述，或掃出的文字可直接本地極速翻譯）
  if (recognizedText) {
    replyBox.style.display = 'none';
    const userInputEl = document.getElementById('userInput');
    if (userInputEl) userInputEl.value = recognizedText;
    await runDirectTranslate(recognizedText);
    input.value = '';
    return;
  }

  // 第二順位：本地硬體不支援該語系（如手機端純中文圖）時，直接取用已並發啟動的雲端 Vision 結果
  recognizedText = await cloudPromise;

  if (recognizedText && recognizedText.trim()) {
    const cleanText = recognizedText
      .replace(/^```[a-zA-Z]*\n?/gm, '')
      .replace(/```$/gm, '')
      .trim();

    replyBox.style.display = 'none';
    let rendered = false;
    if (typeof renderBilingualAIOutput === 'function' && cleanText.includes('|||')) {
      const res = await renderBilingualAIOutput(cleanText);
      rendered = !!(res && res.ok);
    }
    if (!rendered) {
      const userInputEl = document.getElementById('userInput');
      if (userInputEl) userInputEl.value = cleanText;
      await runDirectTranslate(cleanText);
    }
  } else {
    replyBox.innerText = currentLang === 'en'
      ? '💡 No clear text found. Plug in your free Gemini Key in [🔑 API Key] for enhanced vision recognition.'
      : '💡 未檢測到清晰文字，可點擊右上角 [🔑 API Key] 填入您的免費 Gemini Key 提升識別率。';
  }
  input.value = '';
}

// =========================================================================
// 📸 現場實時相機拍照視訊視窗 (含徹底斷電防常亮機制)
// =========================================================================
let liveCamStream = null;

// 強制切斷頁面上所有相機硬體軌道與 video 綁定，徹底消除鏡頭綠燈/紅點常亮
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
  // 遍歷頁面上所有 video 元素（防止其他腳本如 mnemonics-app.js 或殘留預覽綁定了舊 stream）
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

  // 監聽彈窗顯示狀態：只要彈窗被外部任何按鈕設為 display:none，立即切斷攝像頭電源
  const observer = new MutationObserver(() => {
    if (modal.style.display === 'none' || modal.hidden) {
      stopAllCameraStreams();
    }
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
}

async function openLiveCameraModal() {
  ensureLiveCameraModal();
  // 開啟前先清場，確保沒有任何殘留軌道佔用鏡頭
  stopAllCameraStreams();

  const noticeModal = document.getElementById('cameraNoticeModal');
  if (noticeModal) noticeModal.style.display = 'none';
  const fileModal = document.getElementById('fileMenuModal');
  if (fileModal) fileModal.style.display = 'none';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert(currentLang === 'en'
      ? 'Live camera requires HTTPS (e.g. treespinyin.com) or localhost. Opening photo picker instead.'
      : '現場相機需要透過網址 (https:// 或 localhost) 打開才能存取鏡頭，現在為您打開圖片選擇器。');
    document.getElementById('cameraInput').click();
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
    // 若在等待權限期間用戶已經關閉了彈窗，立刻停止剛拿到的 stream
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
  const maxW = 1024;
  let w = video.videoWidth, h = video.videoHeight;
  if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
  canvas.width = w;
  canvas.height = h;
  // 1. 瞬間將當前畫面幀繪製到畫布
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);

  // 2. 畫面抓完的同一毫秒，立即同步切斷攝像頭硬體電源並關閉視窗（不等 toBlob，綠燈立刻熄滅！）
  closeLiveCameraModal();

  // 3. 轉為圖片 Blob 送入極速識別流程
  canvas.toBlob((blob) => {
    if (blob) {
      handlePhotoUpload({ files: [new File([blob], 'camera_snapshot.jpg', { type: 'image/jpeg' })], value: '' });
    }
  }, 'image/jpeg', 0.78);
}

// 全域防常亮保護：按下 ESC、切換瀏覽器分頁、手機退回背景或關閉網頁時，一律強制關閉相機
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLiveCameraModal();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) closeLiveCameraModal();
});
window.addEventListener('pagehide', closeLiveCameraModal);
window.addEventListener('beforeunload', stopAllCameraStreams);

// 確保在所有 defer 腳本（包含 mnemonics-app.js）載入後，全域相機按鈕統一指向此防常亮相機模組
window.triggerDirectCamera = openLiveCameraModal;
window.closeLiveCameraModal = closeLiveCameraModal;
window.stopAllCameraStreams = stopAllCameraStreams;
window.addEventListener('DOMContentLoaded', () => {
  ensureLiveCameraModal();
  window.triggerDirectCamera = openLiveCameraModal;
});
