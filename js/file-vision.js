/**
 * 模組 5: js/file-vision.js
 * 負責：拖拽文件上傳、PDF/Word 本地秒速解析、圖片輕量壓縮與 Vision AI + OCR 雙軌識別
 */
// =========================================================================
// 7. 拖拽文件上傳、PDF/Word 提取、圖片壓縮與 Vision AI + OCR 雙軌識別
// =========================================================================
const dropZone = document.getElementById('dropZone');
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

function compressImg(file, maxW, quality) {
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
  replyBox.innerText = currentLang === 'en' ? '📷 Analyzing photo...' : '📷 正在極速識別照片...';
  list.innerHTML = '';

  const dataUrl = await compressImg(file, 560, 0.68);
  const prev = document.getElementById('previewImg');
  prev.src = dataUrl;
  prev.style.display = 'block';

  const vPrompt = `Look at this image:
Line 1: Briefly identify what text, dish, or object is in the image (in English & Chinese).
Line 2+: Output the text or 1-2 descriptive sentences strictly in this paired format (one pair per line):
Pure_Chinese_Sentence ||| Authentic_English_Sentence`;

  const { text: aiRes } = await fetchFastAccurateAI(vPrompt, dataUrl);
  if (aiRes) {
    const { ok } = await renderBilingualAIOutput(aiRes);
    if (ok) {
      input.value = '';
      return;
    }
  }

  try {
    const fd = new FormData();
    fd.append('base64Image', dataUrl);
    fd.append('language', 'chs');
    fd.append('apikey', 'helloworld');
    const r = await fetchWithTimeout('https://api.ocr.space/parse/image', { method: 'POST', body: fd }, 6500);
    const d = await r.json();
    const ocrText = d?.ParsedResults?.[0]?.ParsedText?.trim() || '';
    if (ocrText) {
      const clean = ocrText.replace(/\r\n/g, '\n').trim();
      document.getElementById('userInput').value = clean;
      replyBox.style.display = 'none';
      await runDirectTranslate(clean);
    } else {
      replyBox.innerText = '💡 No clear text found.';
    }
  } catch (e) {}
  input.value = '';
}
