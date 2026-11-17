/**
 * 模組 5: js/file-vision.js (單文件終極修復版：100% 移植參考文件實時相機串流 + 攔截相冊跳轉)
 * 只需替換此 1 個文件，無需修改其他文件！
 */
const CF_VISION_ENDPOINT = 'https://treespinyin-api.treespinyin.workers.dev/vision-ocr';
const visionResultCache = new Map();
let mediaStream = null;

// 1. 動態建立與參考文件完全一致的「📸 實時相機視訊串流彈窗 (#cameraModal)」
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
        <video id="cameraVideo" autoplay playsinline style="width:100%; height:100%; object-fit:cover;"></video>
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

// 2. 完全按照參考文件 (文件图片识别无网盘evergreen_2.html) 的 openCameraModal 思路與代碼
async function openCameraModal() {
  ensureCameraModalInjected();

  // 關閉前序彈窗
  const fileMenu = document.getElementById('fileMenuModal');
  if (fileMenu) fileMenu.style.display = 'none';
  const noticeModal = document.getElementById('cameraNoticeModal');
  if (noticeModal) noticeModal.style.display = 'none';

  const modal = document.getElementById('cameraModal');
  const video = document.getElementById('cameraVideo');
  modal.style.display = 'flex';

  try {
    try {
      // 優先嘗試後置高清鏡頭 (與參考文件一致)
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1024 }, height: { ideal: 768 } },
        audio: false
      });
    } catch (e1) {
      // 兼容電腦端鏡頭
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    }
    video.srcObject = mediaStream;
  } catch (err) {
    alert('無法訪問相機鏡頭，請檢查瀏覽器權限或使用「選擇本地相冊圖片」。');
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
  const maxW = 960;
  let w = video.videoWidth, h = video.videoHeight;
  if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
  closeCameraModal();
  processImageBase64(dataUrl);
}

// 3. 徹底攔截所有跳轉相冊的舊邏輯（在所有腳本載入後強制接管）
function hijackCameraTriggers() {
  ensureCameraModalInjected();

  // 強制覆蓋 mnemonics-app.js 後載入的同名函數
  window.triggerDirectCamera = function() {
    openCameraModal();
  };
  window.openCameraModal = openCameraModal;
  window.closeCameraModal = closeCameraModal;
  window.takeSnapshot = takeSnapshot;

  // 攔截 #cameraInput.click()，就算舊代碼呼叫它也強制打開實時相機！
  const camInput = document.getElementById('cameraInput');
  if (camInput) {
    camInput.click = function(e) {
      if (e && e.preventDefault) e.preventDefault();
      openCameraModal();
    };
  }
}

// 立即執行一次，並在 DOMContentLoaded (所有 defer 腳本執行完畢後) 再強制覆蓋一次！
hijackCameraTriggers();
window.addEventListener('DOMContentLoaded', hijackCameraTriggers);
setTimeout(hijackCameraTriggers, 100);

// =========================================================================
// 4. 圖片壓縮與三級分流極速識別 (完全對齊參考文件 processImageBase64)
// =========================================================================
function compressImg(file, maxW = 960, quality = 0.72) {
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

async function tryNativeBrowserTextDetector(dataUrl) {
  if (!('TextDetector' in window)) return '';
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const detector = new window.TextDetector();
    const blocks = await detector.detect(img);
    if (blocks && blocks.length > 0) {
      const raw = blocks.map(b => b.rawValue).join('\n').trim();
      if (raw && !/[\u4e00-\u9fa5]/.test(raw) && raw.length >= 3) {
        return raw;
      }
    }
  } catch (e) {}
  return '';
}

async function fetchGeminiVisionText(dataUrl) {
  const activeKey = (typeof backupKey !== 'undefined' && backupKey) ? backupKey : (localStorage.getItem('tp_v22_backup_key') || '');
  if (!activeKey) return '';
  const mime = dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';'));
  const base64Data = dataUrl.split(',')[1];
  const prompt = [
    'Extract all Chinese and English text from this image accurately, then provide its faithful sentence-by-sentence translation.',
    'CRITICAL RULES:',
    '1. Keep the exact original text on the left side of "|||" and its translation on the right side.',
    '2. Output strictly one sentence pair per line in format: Source_Text ||| Translated_Text',
    '3. Do NOT output any intro, explanation, or markdown formatting.'
  ].join('\n');
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(activeKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64Data } }] }],
        generationConfig: { temperature: 0.1 }
      })
    });
    const d = await r.json();
    return d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  } catch (e) {
    return '';
  }
}

async function processImageBase64(dataUrl) {
  const replyBox = document.getElementById('aiReplyBox');
  const list = document.getElementById('annotationList');
  replyBox.className = 'ai-reply-box';
  replyBox.style.display = 'block';
  replyBox.innerText = currentLang === 'en' ? '⚡ Scanning image text...' : '⚡ 正在極速識別圖片文字...';
  list.innerHTML = '';

  const prev = document.getElementById('previewImg');
  if (prev) {
    prev.src = dataUrl;
    prev.style.display = 'block';
  }

  if (visionResultCache.has(dataUrl)) {
    const cached = visionResultCache.get(dataUrl);
    const { ok } = await renderBilingualAIOutput(cached);
    if (!ok) await runDirectTranslate(cached);
    return;
  }

  let text = '';
  // 第 1 級：瀏覽器原生 TextDetector
  text = await tryNativeBrowserTextDetector(dataUrl);

  // 第 2 級：用戶專屬 Gemini Key
  if (!text && typeof backupKey !== 'undefined' && backupKey) {
    replyBox.innerText = '✨ 正在透過您的專屬 Gemini Key 極速識別...';
    text = await fetchGeminiVisionText(dataUrl);
  }

  // 第 3 級：Cloudflare Worker 雲端視覺引擎 (免 API Key)
  if (!text) {
    try {
      replyBox.innerText = '☁️ 正在透過雲端視覺引擎識別圖片（免 API Key）...';
      const r = await fetch(CF_VISION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      });
      const d = await r.json();
      if (d.success && d.text) {
        text = d.text;
      } else if (r.status === 429 && d.message) {
        replyBox.className = 'ai-reply-box friendly-reminder';
        replyBox.innerText = '💡 ' + d.message;
        return;
      }
    } catch (err) {
      console.error('Worker Vision OCR error:', err);
    }
  }

  if (text && text.trim()) {
    visionResultCache.set(dataUrl, text);
    replyBox.style.display = 'none';
    const { ok } = await renderBilingualAIOutput(text);
    if (!ok) {
      const clean = text.replace(/\r?\n/g, '\n').trim();
      document.getElementById('userInput').value = clean.slice(0, 4000);
      await runDirectTranslate(clean);
    }
  } else {
    replyBox.innerText = '⚠️ 圖片未識別出文字。若高峰期雲端繁忙，可點擊右上角 🔑 填入您的免費 Gemini Key 獲得專屬高速通道。';
  }
}

async function handlePhotoUpload(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  input.value = '';
  const compressedDataUrl = await compressImg(file, 960, 0.72);
  await processImageBase64(compressedDataUrl);
}

// =========================================================================
// 5. 拖拽、貼上圖片與 PDF / Word 文件解析
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
      if (f.type.startsWith('image/')) {
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
        const compressedDataUrl = await compressImg(file, 960, 0.72);
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
