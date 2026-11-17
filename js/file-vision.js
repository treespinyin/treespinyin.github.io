/**
 * 模組 5: js/file-vision.js (商業化高併發極速版：本地 0ms Word/Docs/PDF 解析 + 720px 極速一步識圖)
 * 負責：
 * 1. 現場實時相機拍照串流 (#cameraModal)
 * 2. 100% 客戶端原生解壓 Word (.docx)、支援舊版 .doc、.rtf、Google Drive 捷徑檔 (.gdoc) 與 PDF
 * 3. 720px (0.65畫質, ~40KB) 極速圖片壓縮 + 單次請求同步完成「識圖 + 中英對照翻譯」
 */
const CF_VISION_ENDPOINT = 'https://treespinyin-api.treespinyin.workers.dev/vision-ocr';
const CF_ROOT_ENDPOINT = 'https://treespinyin-api.treespinyin.workers.dev';
const visionResultCache = new Map();
let mediaStream = null;

// 1. 動態建立與參考文件一致的「📸 實時相機視訊串流彈窗 (#cameraModal)」
function ensureCameraModalInjected() {
  if (document.getElementById('cameraModal')) return;
  const modal = document.createElement('div');
  modal.id = 'cameraModal';
  modal.className = 'modal';
  modal.onclick = function(event) {
    if (event.target === modal) closeCameraModal();
  };
  modal.innerHTML = `
    <div class="modal-box" style="align-items:center; max-width:480px;">
      <h3 style="margin:0; font-size:1.05rem; color:var(--accent);">📸 現場即時拍照 / Live Camera</h3>
      <div style="width:100%; background:#000; border-radius:12px; overflow:hidden; position:relative; aspect-ratio:4/3; display:flex; justify-content:center; align-items:center;">
        <video id="cameraVideo" autoplay playsinline muted style="width:100%; height:100%; object-fit:cover;"></video>
      </div>
      <canvas id="cameraCanvas" style="display:none;"></canvas>
      <div style="display:flex; gap:10px; width:100%; margin-top:4px;">
        <button type="button" class="btn btn-green" style="flex:1; background:#d93025; color:#fff;" onclick="takeSnapshot()">📸 立即拍照 / Snap</button>
        <button type="button" class="btn btn-soft" style="flex:1;" onclick="closeCameraModal()">取消 / Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function openCameraModal() {
  ensureCameraModalInjected();

  const fileMenu = document.getElementById('fileMenuModal');
  if (fileMenu) fileMenu.style.display = 'none';
  const noticeModal = document.getElementById('cameraNoticeModal');
  if (noticeModal) noticeModal.style.display = 'none';

  const modal = document.getElementById('cameraModal');
  const video = document.getElementById('cameraVideo');
  modal.style.display = 'flex';

  try {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1024 }, height: { ideal: 768 } },
        audio: false
      });
    } catch (e1) {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    }
    video.srcObject = mediaStream;
  } catch (err) {
    alert(currentLang === 'en'
      ? 'Could not access camera. Please check browser permissions or choose Photo Library.'
      : '無法訪問相機鏡頭，請檢查瀏覽器權限或使用「選擇相冊圖片」。');
    modal.style.display = 'none';
  }
}

function closeCameraModal() {
  const modal = document.getElementById('cameraModal');
  if (modal) modal.style.display = 'none';
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
}

function takeSnapshot() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  if (!video || !video.videoWidth) return;
  const maxW = 720;
  let w = video.videoWidth, h = video.videoHeight;
  if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
  closeCameraModal();
  processImageBase64(dataUrl);
}

function hijackCameraTriggers() {
  ensureCameraModalInjected();
  window.triggerDirectCamera = openCameraModal;
  window.openCameraModal = openCameraModal;
  window.openLiveCameraModal = openCameraModal;
  window.closeCameraModal = closeCameraModal;
  window.takeSnapshot = takeSnapshot;

  const camInput = document.getElementById('cameraInput');
  if (camInput) {
    camInput.click = function(e) {
      if (e && e.preventDefault) e.preventDefault();
      openCameraModal();
    };
  }
  const docInput = document.getElementById('docFileInput');
  if (docInput) {
    docInput.setAttribute('accept', '.txt,.md,.csv,.json,.html,.rtf,.srt,.vtt,.pdf,.docx,.doc,.gdoc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain');
  }
}

hijackCameraTriggers();
window.addEventListener('DOMContentLoaded', hijackCameraTriggers);
setTimeout(hijackCameraTriggers, 100);

// =========================================================================
// 2. 極速圖片壓縮 (720px, 0.65 畫質 ➔ 僅 ~40KB，上傳耗時 <0.1秒) 與一步到位 AI 識圖
// =========================================================================
function compressImg(file, maxW = 720, quality = 0.65) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function processImageBase64(dataUrl) {
  const replyBox = document.getElementById('aiReplyBox');
  const list = document.getElementById('annotationList');
  replyBox.className = 'ai-reply-box';
  replyBox.style.display = 'block';
  replyBox.innerText = currentLang === 'en' ? '⚡ Instant AI Vision scanning...' : '⚡ 正在極速識別圖片並生成雙語注音...';
  list.innerHTML = '';

  const prev = document.getElementById('previewImg');
  if (prev) {
    prev.src = dataUrl;
    prev.style.display = 'block';
  }

  const cacheKey = 'img_' + dataUrl.length + '_' + dataUrl.slice(-80);
  if (visionResultCache.has(cacheKey)) {
    const cached = visionResultCache.get(cacheKey);
    replyBox.style.display = 'none';
    const { ok } = await renderBilingualAIOutput(cached);
    if (!ok) await runDirectTranslate(cached);
    return;
  }

  // 一步到位視覺提示詞：讓 Gemini Flash 在單次請求內同時完成「OCR 提取 / 物品識別 + 中英雙語對照」，省去二次翻譯請求！
  const vPrompt = [
    'Read this image carefully:',
    '1. If the image contains text (Chinese or English), extract every sentence accurately and pair it with its translation.',
    '2. If the image is an object, dish, animal, or scene without text, output its name on Line 1 and 1 short practical sentence on Line 2.',
    '3. STRICT OUTPUT FORMAT (one pair per line, NO intro or markdown):',
    'Traditional_Chinese ||| English'
  ].join('\n');

  let aiText = '';
  const { text: resText } = await fetchFastAccurateAI(vPrompt, dataUrl);
  if (resText) {
    aiText = resText;
  }

  // 若雲端 AI Vision 返回了結果，直接渲染四位一體注音卡片（0 二次請求延遲！）
  if (aiText && aiText.trim()) {
    visionResultCache.set(cacheKey, aiText);
    replyBox.style.display = 'none';
    const { ok } = await renderBilingualAIOutput(aiText);
    if (!ok) {
      const clean = aiText.replace(/\r?\n/g, '\n').trim();
      document.getElementById('userInput').value = clean.slice(0, 3500);
      await runDirectTranslate(clean);
    }
    return;
  }

  replyBox.innerText = currentLang === 'en'
    ? '⚠️ Could not recognize text clearly. Try taking a closer photo or add a free Gemini Key in [🔑 API Key].'
    : '⚠️ 未識別出清晰文字，請拉近重拍，或在右上角 [🔑 API Key] 填入免費 Gemini Key 啟用專屬高速視覺。';
}

async function handlePhotoUpload(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  input.value = '';
  const compressedDataUrl = await compressImg(file, 720, 0.65);
  await processImageBase64(compressedDataUrl);
}

// =========================================================================
// 3. 100% 客戶端極速文件解析引擎 (原生零依賴讀取 .docx / .doc / .gdoc / .pdf / .txt)
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
      if (f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name || '')) {
        handlePhotoUpload({ files: [f], value: '' });
      } else {
        handleDocFileUpload({ files: [f], value: '' });
      }
    }
  });
}

document.addEventListener('paste', async (e) => {
  const items = (e.clipboardData || window.clipboardData)?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type && item.type.indexOf('image') !== -1) {
      const file = item.getAsFile();
      if (file) {
        const compressedDataUrl = await compressImg(file, 720, 0.65);
        await processImageBase64(compressedDataUrl);
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

// 100% 瀏覽器原生極速解壓 .docx (Word) 檔案：無需等待外部庫下載，0.05 秒直接提取段落！
async function extractDocxTextNative(arrayBuffer) {
  try {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const decoder = new TextDecoder('utf-8');
    let offset = 0;

    while (offset + 30 < bytes.length) {
      if (view.getUint32(offset, true) !== 0x04034b50) { offset++; continue; }
      const bitFlag = view.getUint16(offset + 6, true);
      const compMethod = view.getUint16(offset + 8, true);
      let compSize = view.getUint32(offset + 18, true);
      const fileNameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      const entryName = decoder.decode(bytes.subarray(offset + 30, offset + 30 + fileNameLen));
      const dataStart = offset + 30 + fileNameLen + extraLen;

      if (entryName === 'word/document.xml') {
        // 若帶有 Data Descriptor (bit 3)，自動尋找下一個 PK 標記作為結尾
        if (compSize === 0 || (bitFlag & 0x08)) {
          let nextPk = dataStart;
          while (nextPk + 4 < bytes.length) {
            if (bytes[nextPk] === 0x50 && bytes[nextPk+1] === 0x4b && (bytes[nextPk+2] === 0x03 || bytes[nextPk+2] === 0x01 || bytes[nextPk+2] === 0x07)) {
              if (bytes[nextPk+2] === 0x07) nextPk += 16;
              break;
            }
            nextPk++;
          }
          compSize = nextPk - dataStart;
        }
        const compData = bytes.subarray(dataStart, dataStart + compSize);
        let xmlText = '';
        if (compMethod === 0) {
          xmlText = decoder.decode(compData);
        } else if (compMethod === 8 && typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          writer.write(compData);
          writer.close();
          const outBuf = await new Response(ds.readable).arrayBuffer();
          xmlText = decoder.decode(outBuf);
        }
        if (xmlText) {
          return xmlText
            .replace(/<w:tab[^>]*\/>/gi, ' ')
            .replace(/<w:br[^>]*\/>/gi, '\n')
            .replace(/<\/w:p>/gi, '\n')
            .replace(/<\/w:tr>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        }
      }
      offset = dataStart + Math.max(1, compSize);
    }
  } catch (e) {}
  return '';
}

async function extractWordTextFast(file) {
  const buf = await file.arrayBuffer();
  // 第一優先：瀏覽器原生 DecompressionStream 0.05 秒直接解出 .docx
  const nativeTxt = await extractDocxTextNative(buf);
  if (nativeTxt && nativeTxt.trim()) return nativeTxt.trim();

  // 第二備援：載入 mammoth.js (雙 CDN 容錯)
  try {
    if (typeof mammoth === 'undefined') {
      try {
        await loadScriptDynamic('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
      } catch (e1) {
        await loadScriptDynamic('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
      }
    }
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    if (res && res.value && res.value.trim()) return res.value.trim();
  } catch (e) {}

  // 第三備援：兼容舊版 .doc (Word 97-2003 二進制文檔) 的 UTF-16LE / UTF-8 文本掃描器
  try {
    const u16 = new TextDecoder('utf-16le', { fatal: false }).decode(buf);
    const matches = u16.match(/[\u4e00-\u9fa5A-Za-z0-9，。！？、；：“”‘’（）《》,.!?;:'"\-\s]{4,}/g) || [];
    const valid = matches
      .map(s => s.trim())
      .filter(s => /[\u4e00-\u9fa5]{2,}|[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(s) && !/Normal|Microsoft|Word\.Document|MSWordDoc|Times New Roman|Calibri/i.test(s));
    if (valid.length > 0) return valid.join('\n').trim();
  } catch (e) {}

  return '';
}

async function extractPdfTextFast(file) {
  if (typeof pdfjsLib === 'undefined') {
    try {
      await loadScriptDynamic('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    } catch (e1) {
      await loadScriptDynamic('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }
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

async function handleDocFileUpload(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const name = (file.name || '').toLowerCase();
  input.value = '';

  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(name)) {
    const compressedDataUrl = await compressImg(file, 720, 0.65);
    await processImageBase64(compressedDataUrl);
    return;
  }

  const replyBox = document.getElementById('aiReplyBox');
  replyBox.className = 'ai-reply-box';
  replyBox.style.display = 'block';
  replyBox.innerText = currentLang === 'en' ? `📄 Reading ${file.name}...` : `📄 正在本地秒速讀取 ${file.name}...`;

  try {
    let extractedText = '';

    // 1. 檢查是否為電腦端 Google Drive 同步的 .gdoc / .gsheet 捷徑文件 (內部是包含 url 的 JSON)
    if (name.endsWith('.gdoc') || name.endsWith('.gsheet') || name.endsWith('.gslides')) {
      const rawJson = await file.text();
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed && parsed.url) {
          replyBox.innerText = currentLang === 'en' ? '☁️ Fetching Google Doc from shortcut...' : '☁️ 正在從 Google Docs 連結讀取內容...';
          extractedText = await fetchCloudDocumentByUrl(parsed.url);
          if (!extractedText) {
            replyBox.innerText = '⚠️ Please make sure this Google Doc is shared as "Anyone with the link can view", or export it as Word (.docx) / PDF.';
            return;
          }
        }
      } catch (e) {}
    } else if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      extractedText = await extractPdfTextFast(file);
    } else if (name.endsWith('.docx') || name.endsWith('.doc') || file.type.includes('word')) {
      extractedText = await extractWordTextFast(file);
    } else {
      const buf = await file.arrayBuffer();
      try {
        extractedText = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch (e) {
        extractedText = new TextDecoder('gb18030').decode(buf);
      }
      // 若純文字文件裡面其實是一個 Google Docs JSON 捷徑
      if (extractedText.trim().startsWith('{') && extractedText.includes('docs.google.com')) {
        try {
          const parsed = JSON.parse(extractedText);
          if (parsed && parsed.url) {
            extractedText = await fetchCloudDocumentByUrl(parsed.url);
          }
        } catch (e) {}
      } else if (name.endsWith('.html') || name.endsWith('.htm')) {
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
      replyBox.innerText = currentLang === 'en'
        ? '⚠️ Could not extract text from this file. If it is a scanned PDF/image, please upload a screenshot or photo instead.'
        : '⚠️ 無法從此檔案中提取文字（若是掃描版 PDF，請直接截圖或拍照上傳）。';
      return;
    }

    replyBox.style.display = 'none';
    const clipped = clean.slice(0, 3500);
    document.getElementById('userInput').value = clipped;
    await runDirectTranslate(clipped);
  } catch (err) {
    replyBox.innerText = '⚠️ Failed to read file: ' + (err.message || '');
  }
}
