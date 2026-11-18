/**
 * 模組 5: js/file-vision.js
 * 負責：拖拽/剪貼簿貼圖上傳、Word(.docx/.doc)/PDF/Google Docs(.gdoc)/SRT 本地秒速解析、現場實時相機拍照與三級分流識圖
 */
// =========================================================================
// 7. 拖拽文件上傳、Ctrl+V 貼圖、PDF/Word 本地極速提取與三級視覺 OCR
// =========================================================================
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

// 支援頁面任意位置 Ctrl+V 直接貼上截圖識別
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

// 100% 客戶端原生解壓 .docx (支援 Google Docs / 新版 Word 的 Data Descriptor Bit 3，0 外部依賴)
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

// 100% 客戶端提取舊版二進制 .doc (MS Word 97-2003) 文字
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
  // 1. 優先使用瀏覽器原生 DecompressionStream 0.05 秒離線解壓
  let text = await extractDocxTextNative(buf);
  if (text) return text;

  // 2. 備選動態載入 mammoth.js
  try {
    await loadScriptDynamic('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    if (res && res.value && res.value.trim()) return res.value.trim();
  } catch (e) {}

  // 3. 舊版 .doc 掃描器兜底
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
    // 支援本地 Google Drive 同步的 .gdoc 捷徑檔（自動解析 JSON 網址並抓取雲端正文）
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
  const replyBox = document.getElementById('aiReplyBox');
  const list = document.getElementById('annotationList');
  replyBox.className = 'ai-reply-box';
  replyBox.style.display = 'block';
  replyBox.innerText = currentLang === 'en' ? '📷 Scanning image text...' : '📷 正在極速識別圖片文字...';
  list.innerHTML = '';

  const dataUrl = await compressImg(file, 960, 0.72);
  const prev = document.getElementById('previewImg');
  prev.src = dataUrl;
  prev.style.display = 'block';

  let recognizedText = '';

  // 第 1 級：優先嘗試用戶瀏覽器原生 TextDetector (純本地 0 流量、0 伺服器成本)
  if ('TextDetector' in window) {
    try {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const detector = new window.TextDetector();
      const blocks = await detector.detect(img);
      if (blocks && blocks.length > 0) {
        const raw = blocks.map(b => b.rawValue).join('\n').trim();
        if (raw && !/[\u4e00-\u9fa5]/.test(raw) && raw.length >= 3) {
          recognizedText = raw;
        }
      }
    } catch (e) {}
  }

  // 第 2 級：若用戶填寫了個人 Key，走直連多模態精準識別
  const modalKeyVal = (document.getElementById('apiKeyInput')?.value || '').trim();
  const activeKey = (backupKey || modalKeyVal).replace(/\s+/g, '');
  if (!recognizedText && activeKey) {
    const vPrompt = [
      'Extract all Chinese and English text from this image accurately, then provide its faithful sentence-by-sentence translation.',
      'CRITICAL RULES:',
      '1. Keep the exact original text on the left side of "|||" and its translation on the right side.',
      '2. Output strictly one sentence pair per line in format: Source_Text ||| Translated_Text',
      '3. Do NOT output any intro, explanation, or markdown formatting.'
    ].join('\n');
    const { text: aiRes } = await fetchFastAccurateAI(vPrompt, dataUrl);
    if (aiRes) recognizedText = aiRes;
  }

  // 第 3 級：走 Cloudflare Worker 託管視覺通道 (/vision-ocr)，免 Key 兜底
  if (!recognizedText) {
    try {
      const r = await fetchWithTimeout('https://treespinyin-api.treespinyin.workers.dev/vision-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      }, 15000);
      const d = await r.json();
      if (d && d.success && d.text) recognizedText = d.text;
    } catch (e) {}
  }

  // 第 4 級：若為風景或單一物品照片，走一般 Vision AI 描述兜底
  if (!recognizedText) {
    const vPrompt = `Look at this image:
Line 1: Briefly identify what text, dish, or object is in the image (in English & Chinese).
Line 2+: Output the text or 1-2 descriptive sentences strictly in this paired format (one pair per line):
Pure_Chinese_Sentence ||| Authentic_English_Sentence`;
    const { text: aiRes } = await fetchFastAccurateAI(vPrompt, dataUrl);
    if (aiRes) recognizedText = aiRes;
  }

  if (recognizedText && recognizedText.trim()) {
    replyBox.style.display = 'none';
    const { ok } = await renderBilingualAIOutput(recognizedText);
    if (!ok) {
      const clean = recognizedText.replace(/\r\n/g, '\n').trim();
      document.getElementById('userInput').value = clean;
      await runDirectTranslate(clean);
    }
  } else {
    replyBox.innerText = currentLang === 'en'
      ? '💡 No clear text found. Plug in your free Gemini Key in [🔑 API Key] for enhanced vision recognition.'
      : '💡 未檢測到清晰文字，可點擊右上角 [🔑 API Key] 填入您的免費 Gemini Key 提升識別率。';
  }
  input.value = '';
}

// =========================================================================
// 📸 現場實時相機拍照視訊視窗 (支援電腦攝像頭與手機後置鏡頭直接取景拍照)
// =========================================================================
let liveCamStream = null;

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
}

async function openLiveCameraModal() {
  ensureLiveCameraModal();
  const noticeModal = document.getElementById('cameraNoticeModal');
  if (noticeModal) noticeModal.style.display = 'none';
  const fileModal = document.getElementById('fileMenuModal');
  if (fileModal) fileModal.style.display = 'none';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
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
    video.srcObject = liveCamStream;
  } catch (err) {
    modal.style.display = 'none';
    document.getElementById('cameraInput').click();
  }
}

function closeLiveCameraModal() {
  const modal = document.getElementById('liveCameraModal');
  if (modal) modal.style.display = 'none';
  if (liveCamStream) {
    liveCamStream.getTracks().forEach(t => t.stop());
    liveCamStream = null;
  }
}

function takeLiveCameraSnapshot() {
  const video = document.getElementById('liveCameraVideo');
  const canvas = document.getElementById('liveCameraCanvas');
  if (!video || !video.videoWidth) return;
  const maxW = 960;
  let w = video.videoWidth, h = video.videoHeight;
  if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);
  canvas.toBlob((blob) => {
    closeLiveCameraModal();
    if (blob) {
      handlePhotoUpload({ files: [new File([blob], 'camera_snapshot.jpg', { type: 'image/jpeg' })], value: '' });
    }
  }, 'image/jpeg', 0.72);
}

// 升級原本的 triggerDirectCamera：優先打開實時相機取景視窗，不支援時才退回 input[type=file]
window.triggerDirectCamera = openLiveCameraModal;