/**
 * 模組 5: js/file-vision.js (實時相機視訊串流 + 3級分流識圖 + 高併發防刷版)
 * 負責：現場即時拍照串流 (getUserMedia)、拖拽/貼上圖片、PDF/Word 本地秒速解析、960px 輕量壓縮與 3級分流識圖
 */
const CF_VISION_ENDPOINT = 'https://treespinyin-api.treespinyin.workers.dev/vision-ocr';
const photoVisionCache = new Map();
let liveCameraStream = null;

// 自動注入「📸 現場即時拍照視訊串流彈窗 (liveCameraModal)」(若頁面尚未存在)
function ensureLiveCameraModalExists() {
  if (document.getElementById('liveCameraModal')) return;
  const modal = document.createElement('div');
  modal.id = 'liveCameraModal';
  modal.className = 'modal';
  modal.onclick = (e) => { if (e.target === modal) closeLiveCameraModal(); };
  modal.innerHTML = `
    <div class="modal-box" style="align-items:center; max-width:480px;">
      <h3 style="margin:0; font-size:1.05rem; color:var(--accent);" id="uiLiveCamTitle">📸 Instant Camera Capture / 現場即時拍照</h3>
      <div style="width:100%; background:#000; border-radius:12px; overflow:hidden; position:relative; aspect-ratio:4/3; display:flex; justify-content:center; align-items:center;">
        <video id="liveCameraVideo" autoplay playsinline muted style="width:100%; height:100%; object-fit:cover;"></video>
      </div>
      <canvas id="liveCameraCanvas" style="display:none;"></canvas>
      <div style="display:flex; gap:10px; width:100%; margin-top:4px;">
        <button type="button" class="btn btn-green" style="flex:1; background:#d32f2f; color:#fff;" onclick="takeLiveSnapshot()">📸 Snap & Translate / 立即拍照</button>
        <button type="button" class="btn btn-soft" style="flex:0.6;" onclick="closeLiveCameraModal()">Cancel / 取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// 覆蓋原本跳轉相冊的 triggerDirectCamera()，改為直接開啟現場即時相機鏡頭串流！
async function openLiveCameraModal() {
  ensureLiveCameraModalExists();
  const noticeModal = document.getElementById('cameraNoticeModal');
  if (noticeModal) noticeModal.style.display = 'none';
  const fileModal = document.getElementById('fileMenuModal');
  if (fileModal) fileModal.style.display = 'none';

  const modal = document.getElementById('liveCameraModal');
  const video = document.getElementById('liveCameraVideo');
  modal.style.display = 'flex';

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('NO_GETUSERMEDIA');
    }
    try {
      liveCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false
      });
    } catch (innerErr) {
      liveCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    video.srcObject = liveCameraStream;
  } catch (err) {
    closeLiveCameraModal();
    // 若設備無鏡頭或未授權，平滑降級喚起原生相機 capture="environment"
    const camInput = document.getElementById('cameraInput');
    if (camInput) {
      camInput.setAttribute('capture', 'environment');
      camInput.click();
    } else {
      alert(currentLang === 'en'
        ? 'Could not access camera. Please check browser camera permissions or choose Photo Library.'
        : '無法訪問相機鏡頭，請檢查瀏覽器相機權限或使用「相冊選圖」。');
    }
  }
}

function closeLiveCameraModal() {
  const modal = document.getElementById('liveCameraModal');
  if (modal) modal.style.display = 'none';
  if (liveCameraStream) {
    liveCameraStream.getTracks().forEach(track => track.stop());
    liveCameraStream = null;
  }
}

async function takeLiveSnapshot() {
  const video = document.getElementById('liveCameraVideo');
  const canvas = document.getElementById('liveCameraCanvas');
  if (!video || !video.videoWidth) return;

  const maxW = 960;
  let w = video.videoWidth, h = video.videoHeight;
  if (w > maxW) {
    h = Math.round((h * maxW) / w);
    w = maxW;
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
  closeLiveCameraModal();
  await processImageDataUrl(dataUrl);
}

// 讓全域的 triggerDirectCamera 直接調用實時相機視窗
window.triggerDirectCamera = openLiveCameraModal;
window.openLiveCameraModal = openLiveCameraModal;
window.closeLiveCameraModal = closeLiveCameraModal;
window.takeLiveSnapshot = takeLiveSnapshot;

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

// 支援全域 Ctrl+V / Cmd+V 直接貼上截圖識別
document.addEventListener('paste', async (e) => {
  const items = (e.clipboardData || window.clipboardData)?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type && item.type.indexOf('image') !== -1) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        const dataUrl = await compressImg(file, 960, 0.72);
        await processImageDataUrl(dataUrl);
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

// 統一處理拍照截圖或相冊上傳的 Base64 圖像 (3級分流識圖 + 快取 + 0%二次轉譯)
async function processImageDataUrl(dataUrl) {
  const replyBox = document.getElementById('aiReplyBox');
  const list = document.getElementById('annotationList');
  replyBox.className = 'ai-reply-box';
  replyBox.style.display = 'block';
  replyBox.innerText = currentLang === 'en' ? '📷 Scanning image text...' : '📷 正在極速識別照片文字...';
  list.innerHTML = '';

  const prev = document.getElementById('previewImg');
  if (prev) {
    prev.src = dataUrl;
    prev.style.display = 'block';
  }

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
    replyBox.innerText = currentLang === 'en' ? '✨ Scanning with your Gemini Key...' : '✨ 正在透過您的專屬 Gemini Key 極速識別...';
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

  // 3. 第三級：走您的 Cloudflare Worker 託管通道 (/vision-ocr)，免 Key 兜底
  if (!text) {
    try {
      replyBox.innerText = currentLang === 'en' ? '☁️ Cloud Vision OCR (No Key required)...' : '☁️ 正在透過雲端視覺引擎識別圖片（免 API Key）...';
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
      const clean = text.replace(/\r?\n/g, '\n').trim();
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

async function handlePhotoUpload(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  input.value = '';
  const dataUrl = await compressImg(file, 960, 0.72);
  await processImageDataUrl(dataUrl);
}
