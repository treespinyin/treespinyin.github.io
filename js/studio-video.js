/**
 * Trees Pinyin Studio — Module 4: 1080p HD Video Studio (9:16 & 16:9, Canvas Mixing & MP4 Export)
 */
// =========================================================================
// 🎬 錄影工坊核心引擎 (9:16 / 16:9 + 1080p HD MP4 + 錄製中改字同步畫入影片)
// =========================================================================
function getPreferredMp4MimeType() {
  const mp4Types = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=h264',
    'video/webm'
  ];
  for (const t of mp4Types) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return '';
}

async function getBuiltInComputerStream() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d => d.kind === 'videoinput');
    const audioInputs = devices.filter(d => d.kind === 'audioinput');

    const isExternalPhone = (label) => /iphone|ipad|continuity|desk view/i.test(label || '');
    const builtInCam = videoInputs.find(d => !isExternalPhone(d.label)) || videoInputs[0];
    const builtInMic = audioInputs.find(d => !isExternalPhone(d.label)) || audioInputs[0];

    const videoConstraint = builtInCam && builtInCam.deviceId
      ? { deviceId: { exact: builtInCam.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };

    const audioConstraint = {
      ...(builtInMic && builtInMic.deviceId ? { deviceId: { exact: builtInMic.deviceId } } : {}),
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true
    };

    return await navigator.mediaDevices.getUserMedia({ video: videoConstraint, audio: audioConstraint });
  } catch (e) {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  }
}

function syncStudioRowVisibility() {
  const studioTop = document.getElementById('studioTopPane');
  if (!studioTop) return;
  const chkEn = document.getElementById('chkRowEn');
  const chkTrees = document.getElementById('chkRowTrees');
  const chkPy = document.getElementById('chkRowPy');
  const chkTrad = document.getElementById('chkTrad');
  const chkSimp = document.getElementById('chkSimp');

  if (chkEn) studioTop.classList.toggle('hide-en', !chkEn.checked);
  if (chkTrees) studioTop.classList.toggle('hide-trees', !chkTrees.checked);
  if (chkPy) studioTop.classList.toggle('hide-py', !chkPy.checked);
  if (chkTrad && chkSimp) {
    studioTop.classList.toggle('hide-hz', !chkTrad.checked && !chkSimp.checked);
  }
}

async function openCreatorStudio(ratioMode = '9-16') {
  const ov = document.getElementById('studioOverlay');
  if (!ov) return;
  ov.classList.add('active');
  document.body.classList.add('tp-studio-open');
  const rSel = document.getElementById('studioRatioSelect');
  if (rSel) rSel.value = ratioMode === '16-9' ? '16-9' : '9-16';
  setStudioRatio(ratioMode);
  setStudioViewMode('split');

  const topPane = document.getElementById('studioTopPane');
  if (topPane) {
    topPane.innerHTML = '';
    const existingBlocks = document.querySelectorAll('#sentencesContainer .sentence-block');
    if (existingBlocks.length > 0) {
      existingBlocks.forEach(b => {
        appendSentenceProgressive(b.dataset.zh, b.dataset.en, 'studioTopPane');
      });
    } else {
      appendSentenceProgressive('請問洗手間在哪裡？', 'Excuse me, where is the restroom?', 'studioTopPane');
    }
    syncStudioRowVisibility();
  }

  const camVideo = document.getElementById('studioCamVideo');
  try {
    studioStream = await getBuiltInComputerStream();
    if (camVideo) camVideo.srcObject = studioStream;
  } catch (e) {
    studioStream = null;
  }
}

function setStudioRatio(ratio) {
  studioCurrentRatio = (ratio === '16-9') ? '16-9' : '9-16';
  const stage = document.getElementById('studioStage');
  if (!stage) return;
  stage.classList.remove('ratio-9-16', 'ratio-16-9');
  stage.classList.add(`ratio-${studioCurrentRatio}`);
}

function setStudioViewMode(viewMode) {
  studioCurrentView = viewMode;
  const stage = document.getElementById('studioStage');
  if (!stage) return;
  stage.classList.remove('view-full-text', 'view-full-cam');
  if (viewMode === 'full-text') stage.classList.add('view-full-text');
  if (viewMode === 'full-cam') stage.classList.add('view-full-cam');

  document.getElementById('viewBtnSplit')?.classList.toggle('active', viewMode === 'split');
  document.getElementById('viewBtnText')?.classList.toggle('active', viewMode === 'full-text');
  document.getElementById('viewBtnCam')?.classList.toggle('active', viewMode === 'full-cam');
}

function speakAllStudioText() {
  const blocks = document.querySelectorAll('#studioTopPane .sentence-block');
  const allZh = Array.from(blocks).map(b => b.dataset.zh).filter(Boolean).join('。');
  if (allZh) speakSingleOrSentence(allZh);
}

function drawWrappedEnglishLine(ctx, text, centerX, startY, maxWidth, lineHeight) {
  const words = (text || '').split(' ');
  let line = '';
  const lines = [];
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      lines.push(line.trim());
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  if (line.trim()) lines.push(line.trim());
  lines.forEach((l, i) => ctx.fillText(l, centerX, startY + (i * lineHeight)));
}

function drawVideoCover(ctx, video, x, y, w, h) {
  if (!video || video.readyState < 2) return;
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.max(w / vw, h / vh);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x + w, y);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  ctx.restore();
}

function drawLiveEditModalOnCanvas(ctx, W, H) {
  const modal = document.getElementById('editCharModal');
  if (!modal || modal.style.display !== 'flex') return;

  const zhVal = document.getElementById('editZhInput')?.value || '';
  const stdVal = document.getElementById('editStdInput')?.value || '';
  const tpVal = document.getElementById('editTpInput')?.value || '';

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
  ctx.fillRect(0, 0, W, H);

  const boxW = Math.min(W * 0.86, 540);
  const boxH = Math.min(H * 0.52, 420);
  const bx = (W - boxW) / 2;
  const by = (H - boxH) / 2;
  const u = boxW / 380;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1b5e20';
  ctx.lineWidth = Math.max(3, 4 * u);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, 18 * u);
  else ctx.rect(bx, by, boxW, boxH);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#1b5e20';
  ctx.font = `800 ${Math.round(19 * u)}px -apple-system, sans-serif`;
  ctx.fillText('✍️ Edit Character & Pinyin', bx + 22 * u, by + 32 * u);

  const drawInputRow = (label, val, yOff, highlightGreen) => {
    ctx.fillStyle = '#444444';
    ctx.font = `700 ${Math.round(13 * u)}px -apple-system, sans-serif`;
    ctx.fillText(label, bx + 22 * u, by + yOff);

    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = highlightGreen ? '#2e7d32' : '#cbd5e1';
    ctx.lineWidth = Math.max(1.5, 2 * u);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx + 22 * u, by + yOff + 14 * u, boxW - 44 * u, 38 * u, 8 * u);
    else ctx.rect(bx + 22 * u, by + yOff + 14 * u, boxW - 44 * u, 38 * u);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = highlightGreen ? '#1b5e20' : '#111111';
    ctx.font = `700 ${Math.round(17 * u)}px -apple-system, sans-serif`;
    ctx.fillText(val, bx + 34 * u, by + yOff + 33 * u);
  };

  drawInputRow('1. Character (漢字):', zhVal, 68 * u, false);
  drawInputRow('2. Standard Pinyin:', stdVal, 138 * u, false);
  drawInputRow('3. Trees Pinyin:', tpVal, 208 * u, true);

  ctx.fillStyle = '#1b5e20';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx + 22 * u, by + boxH - 54 * u, (boxW - 56 * u) * 0.6, 38 * u, 10 * u);
  else ctx.rect(bx + 22 * u, by + boxH - 54 * u, (boxW - 56 * u) * 0.6, 38 * u);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `700 ${Math.round(15 * u)}px -apple-system, sans-serif`;
  ctx.fillText('Save', bx + 22 * u + ((boxW - 56 * u) * 0.3), by + boxH - 35 * u);

  ctx.restore();
}

// 在錄影 Canvas 上繪製含 <b>/<i>/<u> 富文字的自動換行段落（保留底線亮點與中英混排美感）
function layoutStudioRichLines(ctx, rawHtml, maxW, fontSize, maxLines = 4) {
  const clean = String(rawHtml || '').replace(/\r\n?/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const segs = [];
  let bold = false, italic = false, under = false;
  const tagRe = /(<\/?(?:b|strong|i|em|u)>)/gi;
  const parts = clean.split(tagRe);
  for (const part of parts) {
    if (!part) continue;
    const lower = part.toLowerCase();
    if (lower === '<b>' || lower === '<strong>') { bold = true; continue; }
    if (lower === '</b>' || lower === '</strong>') { bold = false; continue; }
    if (lower === '<i>' || lower === '<em>') { italic = true; continue; }
    if (lower === '</i>' || lower === '</em>') { italic = false; continue; }
    if (lower === '<u>') { under = true; continue; }
    if (lower === '</u>') { under = false; continue; }
    const plain = part.replace(/<[^>]+>/g, '');
    const tokens = plain.match(/[\u4e00-\u9fa5，。！？、；：（）《》「」]|[A-Za-z0-9'’"-]+|\s+|[^\s]/g) || [];
    for (const tok of tokens) {
      segs.push({ text: tok, bold, italic, under });
    }
  }

  const lines = [];
  let curLine = [];
  let curW = 0;
  const fontOf = (t) => `${t.italic ? 'italic ' : ''}${(t.bold || t.under) ? '800 ' : '600 '}${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

  for (const tok of segs) {
    if (curLine.length === 0 && /^\s+$/.test(tok.text)) continue;
    ctx.font = fontOf(tok);
    const tw = ctx.measureText(tok.text).width;
    if (curLine.length > 0 && curW + tw > maxW) {
      lines.push(curLine);
      if (lines.length >= maxLines) return lines;
      curLine = /^\s+$/.test(tok.text) ? [] : [tok];
      curW = /^\s+$/.test(tok.text) ? 0 : tw;
    } else {
      curLine.push(tok);
      curW += tw;
    }
  }
  if (curLine.length > 0 && lines.length < maxLines) lines.push(curLine);
  return lines;
}

function drawStudioRichLines(ctx, lines, startX, startY, fontSize, lineH, baseColor = '#1e293b') {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  lines.forEach((lineTokens, rowIdx) => {
    let x = startX;
    const y = startY + rowIdx * lineH;
    for (const tok of lineTokens) {
      ctx.font = `${tok.italic ? 'italic ' : ''}${(tok.bold || tok.under) ? '800 ' : '600 '}${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.fillStyle = tok.under ? '#1b5e20' : baseColor;
      ctx.fillText(tok.text, x, y);
      const tw = ctx.measureText(tok.text).width;
      if (tok.under && tok.text.trim()) {
        ctx.strokeStyle = '#1b5e20';
        ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.1));
        ctx.beginPath();
        ctx.moveTo(x, y + fontSize * 0.56);
        ctx.lineTo(x + tw, y + fontSize * 0.56);
        ctx.stroke();
      }
      x += tw;
    }
  });
}

// 1. 錄影中同步畫出「點字底部趣味記憶條」
function drawLiveMnemonicBarOnCanvas(ctx, W, H) {
  if (!studioRecordPopups) return;
  const bar = document.getElementById('tpCharMnemonicBar');
  if (!bar || bar.style.display === 'none' || bar.style.display === '') return;
  const snap = (window.TreesFunHub && typeof window.TreesFunHub.getActiveCharBarState === 'function')
    ? window.TreesFunHub.getActiveCharBarState()
    : null;
  if (!snap || !snap.hanzi) return;

  ctx.save();
  const isPortrait = H >= W;
  const cardW = isPortrait ? Math.round(W * 0.90) : Math.round(Math.min(W * 0.72, 1180));
  const u = cardW / 540;
  const padX = Math.round(22 * u);
  const padY = Math.round(16 * u);
  const bodyFs = Math.max(15, Math.round(18 * u));
  const lineH = Math.round(bodyFs * 1.42);
  const bodyRich = snap.isNew
    ? snap.mnemonic
    : `${snap.meaning ? `<b>"${snap.meaning}"</b> — ` : ''}${snap.mnemonic || ''}`;
  const bodyLines = layoutStudioRichLines(ctx, bodyRich, cardW - padX * 2, bodyFs, 3);
  const headH = Math.round(36 * u);
  const cardH = padY * 2 + headH + Math.max(1, bodyLines.length) * lineH + Math.round(6 * u);

  const bx = Math.round((W - cardW) / 2);
  const by = Math.round(H - cardH - (isPortrait ? H * 0.045 : H * 0.055));

  ctx.shadowColor = 'rgba(0, 0, 0, 0.34)';
  ctx.shadowBlur = Math.round(26 * u);
  ctx.shadowOffsetY = Math.round(8 * u);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.97)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, cardW, cardH, Math.round(18 * u));
  else ctx.rect(bx, by, cardW, cardH);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#2e7d32';
  ctx.lineWidth = Math.max(2.5, Math.round(3 * u));
  ctx.stroke();

  // 頂部：漢字 + Trees Pinyin + 作者/讚數膠囊
  const headY = by + padY + headH * 0.45;
  let curX = bx + padX;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const hzFs = Math.max(20, Math.round(25 * u));
  ctx.fillStyle = '#1b5e20';
  ctx.font = `800 ${hzFs}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText(snap.hanzi, curX, headY);
  curX += ctx.measureText(snap.hanzi).width + Math.round(12 * u);

  if (snap.trees) {
    const tpFs = Math.max(16, Math.round(20 * u));
    ctx.fillStyle = '#111111';
    ctx.font = `italic 800 ${tpFs}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillText(snap.trees, curX, headY);
    curX += ctx.measureText(snap.trees).width + Math.round(12 * u);
  }

  const badgeText = snap.isNew
    ? '🌱 New Word'
    : `💡 ${snap.author}${snap.likes ? ` · 👍 ${snap.likes}` : ''}`;
  const badgeFs = Math.max(12, Math.round(13.5 * u));
  ctx.font = `700 ${badgeFs}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const bw = Math.min(cardW - (curX - bx) - padX, ctx.measureText(badgeText).width + Math.round(18 * u));
  if (bw > Math.round(40 * u)) {
    const bh = Math.round(24 * u);
    ctx.fillStyle = snap.isNew ? '#e8f5e9' : '#fff8e1';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(curX, headY - bh / 2, bw, bh, Math.round(12 * u));
    else ctx.rect(curX, headY - bh / 2, bw, bh);
    ctx.fill();
    ctx.fillStyle = snap.isNew ? '#1b5e20' : '#b45309';
    ctx.fillText(badgeText, curX + Math.round(9 * u), headY);
  }

  // 正文富文字（含綠色底線諧音亮點）
  drawStudioRichLines(ctx, bodyLines, bx + padX, by + padY + headH + lineH * 0.45, bodyFs, lineH, '#1e293b');
  ctx.restore();
}

// 2. 錄影中同步畫出「現場編寫與發布 Write Your Trick 彈窗（含輸入中文字與 Published 狀態）」
function drawLiveWriteTrickModalOnCanvas(ctx, W, H) {
  if (!studioRecordPopups) return;
  const modal = document.getElementById('tpSubmitMemeModal');
  if (!modal || modal.style.display !== 'flex') return;

  const hzVal = document.getElementById('tpSubHanzi')?.value || '';
  const meanVal = document.getElementById('tpSubMeaning')?.value || '';
  const hookVal = document.getElementById('tpSubHook')?.value || '';
  const mnVal = document.getElementById('tpSubMnemonic')?.value || '';
  const authorVal = document.getElementById('tpSubAuthor')?.value || '';
  const statusEl = document.getElementById('tpSubStatus');
  const statusText = (statusEl && statusEl.style.display !== 'none') ? (statusEl.textContent || '').trim() : '';

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
  ctx.fillRect(0, 0, W, H);

  const isPortrait = H >= W;
  const boxW = isPortrait ? Math.round(W * 0.88) : Math.round(Math.min(W * 0.56, 860));
  const u = boxW / 460;
  const pad = Math.round(22 * u);
  const boxH = Math.min(Math.round(H * 0.78), Math.round(468 * u));
  const bx = Math.round((W - boxW) / 2);
  const by = Math.round((H - boxH) / 2);

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1b5e20';
  ctx.lineWidth = Math.max(3, Math.round(4 * u));
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, Math.round(18 * u));
  else ctx.rect(bx, by, boxW, boxH);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let y = by + pad + Math.round(10 * u);

  ctx.fillStyle = '#1b5e20';
  ctx.font = `800 ${Math.round(20 * u)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText('✍️ Write Your Funny Memory Trick', bx + pad, y);
  y += Math.round(30 * u);

  const drawField = (xPos, fW, label, val, placeholder, isHighlight = false) => {
    ctx.fillStyle = '#475569';
    ctx.font = `700 ${Math.round(12 * u)}px -apple-system, sans-serif`;
    ctx.fillText(label, xPos, y);
    const fy = y + Math.round(10 * u);
    const fh = Math.round(36 * u);
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = isHighlight ? '#2e7d32' : '#cbd5e1';
    ctx.lineWidth = Math.max(1.5, Math.round(1.8 * u));
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(xPos, fy, fW, fh, Math.round(8 * u));
    else ctx.rect(xPos, fy, fW, fh);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = val ? '#111111' : '#94a3b8';
    ctx.font = `${val ? '700' : '500'} ${Math.round(14.5 * u)}px -apple-system, sans-serif`;
    const disp = (val || placeholder).slice(0, 38);
    ctx.fillText(disp, xPos + Math.round(10 * u), fy + fh / 2);
  };

  const innerW = boxW - pad * 2;
  const halfGap = Math.round(10 * u);
  const wLeft = Math.round(innerW * 0.42);
  const wRight = innerW - wLeft - halfGap;
  drawField(bx + pad, wLeft, 'Chinese Word', hzVal, 'e.g. 買單', true);
  drawField(bx + pad + wLeft + halfGap, wRight, 'English Meaning', meanVal, 'e.g. Check please!', false);
  y += Math.round(62 * u);

  drawField(bx + pad, innerW, 'Sounds Like', hookVal.replace(/<[^>]+>/g, ''), 'e.g. My done', false);
  y += Math.round(62 * u);

  // 即時預覽卡片區（顯示創作者邊打字邊排版的 <b>/<i>/<u> 效果！）
  ctx.fillStyle = '#475569';
  ctx.font = `700 ${Math.round(12 * u)}px -apple-system, sans-serif`;
  ctx.fillText('Live Trick Preview', bx + pad, y);
  const prevY = y + Math.round(10 * u);
  const prevH = Math.round(86 * u);
  ctx.fillStyle = '#fffde7';
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = Math.max(1.5, Math.round(2 * u));
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx + pad, prevY, innerW, prevH, Math.round(10 * u));
  else ctx.rect(bx + pad, prevY, innerW, prevH);
  ctx.fill();
  ctx.stroke();

  const previewSource = mnVal || hookVal || 'Type your funny English sound trick...';
  const pFs = Math.max(13, Math.round(15 * u));
  const pLines = layoutStudioRichLines(ctx, previewSource, innerW - Math.round(20 * u), pFs, 3);
  drawStudioRichLines(ctx, pLines, bx + pad + Math.round(10 * u), prevY + Math.round(20 * u), pFs, Math.round(pFs * 1.42), mnVal || hookVal ? '#1e293b' : '#94a3b8');
  y = prevY + prevH + Math.round(18 * u);

  drawField(bx + pad, innerW, 'Creator Credit', authorVal, 'Your nickname', false);
  y += Math.round(62 * u);

  // 上傳 / 發布即時狀態（如 ✅ Published!）
  if (statusText) {
    const isOk = /published|✅/i.test(statusText);
    const isErr = /⚠️|🌱|not allowed/i.test(statusText);
    ctx.fillStyle = isOk ? '#15803d' : (isErr ? '#b91c1c' : '#1d4ed8');
    ctx.font = `800 ${Math.round(14 * u)}px -apple-system, sans-serif`;
    ctx.fillText(statusText.slice(0, 48), bx + pad, y);
    y += Math.round(24 * u);
  }

  // 底部綠色發布按鈕
  const btnH = Math.round(42 * u);
  const btnY = Math.min(y, by + boxH - pad - btnH);
  ctx.fillStyle = '#1b5e20';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx + pad, btnY, innerW, btnH, Math.round(10 * u));
  else ctx.rect(bx + pad, btnY, innerW, btnH);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `800 ${Math.round(15 * u)}px -apple-system, sans-serif`;
  ctx.fillText('🚀 Publish & Create Share Card', bx + boxW / 2, btnY + btnH / 2);

  ctx.restore();
}

// 3. 錄影中同步畫出「發布後彈出的專屬品牌分享圖卡」
function drawLiveShareCardOnCanvas(ctx, W, H) {
  if (!studioRecordPopups) return;
  const modal = document.getElementById('tpShareCardModal');
  if (!modal || modal.style.display !== 'flex') return;
  const img = document.getElementById('tpShareCardPreview');
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
  ctx.fillRect(0, 0, W, H);

  const maxW = W * 0.84;
  const maxH = H * 0.80;
  const ratio = img.naturalWidth / img.naturalHeight;
  let drawW = maxW;
  let drawH = drawW / ratio;
  if (drawH > maxH) {
    drawH = maxH;
    drawW = drawH * ratio;
  }
  const dx = Math.round((W - drawW) / 2);
  const dy = Math.round((H - drawH) / 2);
  const rad = Math.round(Math.min(drawW, drawH) * 0.035);

  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(dx, dy, drawW, drawH, rad);
  else ctx.rect(dx, dy, drawW, drawH);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(dx, dy, drawW, drawH, rad);
  else ctx.rect(dx, dy, drawW, drawH);
  ctx.clip();
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();

  ctx.restore();
}

function toggleStudioRecording() {
  const recBtn = document.getElementById('studioRecBtn');
  const dlLink = document.getElementById('studioDownloadLink');

  if (studioRecorder && studioRecorder.state === 'recording') {
    studioRecorder.stop();
    return;
  }

  if (dlLink) dlLink.classList.add('hidden');
  const shareWrap = document.getElementById('studioShareWrap');
  if (shareWrap) shareWrap.classList.add('hidden');
  lastStudioVideoBlob = null;
  lastStudioVideoSaved = false;
  studioChunks = [];
  studioSeconds = 0;
  safeSetText('studioTimerBadge', '🔴 00:00');

  const quality = document.getElementById('studioQualitySelect')?.value || '1080';
  let shortSide = 1080, longSide = 1920, vBitrate = 3500000, fps = 24;
  if (quality === '720') {
    shortSide = 720; longSide = 1280; vBitrate = 1600000; fps = 24;
  } else if (quality === '480') {
    shortSide = 480; longSide = 854; vBitrate = 650000; fps = 20;
  }

  studioSynthCanvas = document.createElement('canvas');
  if (studioCurrentRatio === '9-16') {
    studioSynthCanvas.width = shortSide;
    studioSynthCanvas.height = longSide;
  } else {
    studioSynthCanvas.width = longSide;
    studioSynthCanvas.height = shortSide;
  }

  const ctx = studioSynthCanvas.getContext('2d');
  const camVideo = document.getElementById('studioCamVideo');
  const topPane = document.getElementById('studioTopPane');

  function drawStudioFrame() {
    const W = studioSynthCanvas.width;
    const H = studioSynthCanvas.height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const drawWysiwygTextPane = (targetY, targetH) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, targetY, W, targetH);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, targetY, W, targetH);

      const paneRect = topPane.getBoundingClientRect();
      if (paneRect.width > 0 && paneRect.height > 0) {
        const scale = W / paneRect.width;

        const showEn = !topPane.classList.contains('hide-en');
        const showTrees = !topPane.classList.contains('hide-trees');
        const showPy = !topPane.classList.contains('hide-py');
        const showHz = !topPane.classList.contains('hide-hz');

        if (showEn) {
          topPane.querySelectorAll('.tp-line-en').forEach(enEl => {
            const r = enEl.getBoundingClientRect();
            if (r.bottom < paneRect.top || r.top > paneRect.bottom) return;
            const x = (r.left - paneRect.left + r.width / 2) * scale;
            const y = targetY + (r.top - paneRect.top + 10) * scale;
            ctx.fillStyle = '#111111';
            ctx.font = `600 ${Math.max(12, Math.round(16 * scale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            drawWrappedEnglishLine(ctx, enEl.innerText, x, y, (paneRect.width - 20) * scale, Math.max(15, Math.round(20 * scale)));
          });
        }

        topPane.querySelectorAll('.tp-char-col').forEach(colEl => {
          const colR = colEl.getBoundingClientRect();
          if (colR.bottom < paneRect.top || colR.top > paneRect.bottom) return;
          const centerX = (colR.left - paneRect.left + colR.width / 2) * scale;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const pyEl = colEl.querySelector('.tp-cell-trees');
          if (pyEl && showTrees) {
            const r = pyEl.getBoundingClientRect();
            const cy = targetY + (r.top - paneRect.top + r.height / 2) * scale;
            ctx.fillStyle = '#1b5e20';
            ctx.font = `italic 700 ${Math.max(12, Math.round(17 * scale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
            ctx.fillText(pyEl.innerText, centerX, cy);
          }

          const stdEl = colEl.querySelector('.tp-cell-py');
          if (stdEl && showPy) {
            const r = stdEl.getBoundingClientRect();
            const cy = targetY + (r.top - paneRect.top + r.height / 2) * scale;
            ctx.fillStyle = '#6b7280';
            ctx.font = `500 ${Math.max(10, Math.round(13.5 * scale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
            ctx.fillText(stdEl.innerText, centerX, cy);
          }

          const zhEl = colEl.querySelector('.tp-cell-hz');
          if (zhEl && showHz) {
            const r = zhEl.getBoundingClientRect();
            const cy = targetY + (r.top - paneRect.top + r.height / 2) * scale;
            ctx.fillStyle = '#000000';
            ctx.font = `700 ${Math.max(15, Math.round(22 * scale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
            ctx.fillText(zhEl.innerText, centerX, cy);
          }
        });
      }
      ctx.restore();
    };

    if (studioCurrentView === 'split') {
      drawWysiwygTextPane(0, H / 2);
      drawVideoCover(ctx, camVideo, 0, H / 2, W, H / 2);
      ctx.strokeStyle = '#1b5e20';
      ctx.lineWidth = Math.max(2, Math.round(W / 180));
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
    } else if (studioCurrentView === 'full-text') {
      drawWysiwygTextPane(0, H);
    } else {
      drawVideoCover(ctx, camVideo, 0, 0, W, H);
    }

    drawLiveMnemonicBarOnCanvas(ctx, W, H);
    drawLiveEditModalOnCanvas(ctx, W, H);
    drawLiveWriteTrickModalOnCanvas(ctx, W, H);
    drawLiveShareCardOnCanvas(ctx, W, H);
    studioSynthAnimId = requestAnimationFrame(drawStudioFrame);
  }
  drawStudioFrame();

  const stream = studioSynthCanvas.captureStream(fps);

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    studioAudioCtx = new AudioCtx();
    studioAudioDest = studioAudioCtx.createMediaStreamDestination();
    if (studioStream && studioStream.getAudioTracks().length > 0) {
      const micSource = studioAudioCtx.createMediaStreamSource(studioStream);
      micSource.connect(studioAudioDest);
    }
    studioAudioDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  } catch (e) {
    if (studioStream) studioStream.getAudioTracks().forEach(t => stream.addTrack(t));
  }

  const preferredMime = getPreferredMp4MimeType();
  const recOptions = {
    ...(preferredMime ? { mimeType: preferredMime } : {}),
    videoBitsPerSecond: vBitrate,
    audioBitsPerSecond: 128000
  };

  try {
    studioRecorder = new MediaRecorder(stream, recOptions);
  } catch (e) {
    studioRecorder = new MediaRecorder(stream);
  }

  studioRecorder.ondataavailable = (e) => { if (e.data.size > 0) studioChunks.push(e.data); };
  studioRecorder.onstop = () => {
    cancelAnimationFrame(studioSynthAnimId);
    clearInterval(studioTimerInterval);
    const blob = new Blob(studioChunks, { type: 'video/mp4' });
    lastStudioVideoBlob = blob;
    lastStudioVideoFilename = `trees-pinyin-${quality}p.mp4`;
    lastStudioVideoSaved = false;
    if (dlLink) {
      dlLink.href = URL.createObjectURL(blob);
      dlLink.download = lastStudioVideoFilename;
      dlLink.onclick = () => { lastStudioVideoSaved = true; };
      dlLink.classList.remove('hidden');
    }
    const shareWrap = document.getElementById('studioShareWrap');
    if (shareWrap) shareWrap.classList.remove('hidden');
    if (recBtn) {
      recBtn.textContent = '🔴 Record';
      recBtn.style.background = '#1b5e20';
    }
  };

  studioRecorder.start(400);
  if (recBtn) {
    recBtn.textContent = '⏹️ Stop';
    recBtn.style.background = '#d32f2f';
  }

  studioTimerInterval = setInterval(() => {
    studioSeconds++;
    const m = String(Math.floor(studioSeconds / 60)).padStart(2, '0');
    const s = String(studioSeconds % 60).padStart(2, '0');
    safeSetText('studioTimerBadge', `🔴 ${m}:${s}`);
  }, 1000);
}

let lastStudioVideoBlob = null;
let lastStudioVideoFilename = 'trees-pinyin-video.mp4';
let lastStudioVideoSaved = false;

function saveStudioVideoOnce() {
  if (lastStudioVideoSaved) return;
  const dl = document.getElementById('studioDownloadLink');
  if (dl) {
    lastStudioVideoSaved = true;
    dl.click();
  }
}

async function shareRecordedStudioVideo(net) {
  if (!lastStudioVideoBlob) return;
  const caption = 'Read English, Speak Chinese with Trees Pinyin!';
  const siteUrl = 'https://www.treespinyin.com';
  const videoFile = new File([lastStudioVideoBlob], lastStudioVideoFilename, { type: 'video/mp4' });

  const tryNativeVideoFile = async () => {
    try {
      if (navigator.canShare && navigator.canShare({ files: [videoFile] })) {
        await navigator.share({ title: 'Trees Pinyin', text: caption, files: [videoFile] });
        return true;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return true;
    }
    return false;
  };

  if (net === 'native') {
    if (await tryNativeVideoFile()) return;
    saveStudioVideoOnce();
    return;
  }

  // 桌機版純本地 0 成本：自動存好 MP4 一次，直接開啟對應社群發文 / 上傳頁
  saveStudioVideoOnce();
  const encText = encodeURIComponent(caption);
  const encUrl = encodeURIComponent(siteUrl);
  const urls = {
    instagram: 'https://www.instagram.com/',
    tiktok: 'https://www.tiktok.com/upload',
    xhs: 'https://creator.xiaohongshu.com/publish/publish',
    threads: `https://www.threads.net/intent/post?text=${encodeURIComponent(`${caption} ${siteUrl}`)}`,
    pinterest: 'https://www.pinterest.com/pin-creation-tool/',
    x: `https://twitter.com/intent/tweet?text=${encText}&url=${encUrl}`,
    reddit: `https://www.reddit.com/submit?title=${encText}`,
    facebook: 'https://www.facebook.com/',
    line: `https://social-plugins.line.me/lineit/share?url=${encUrl}&text=${encText}`,
    wechat: 'https://filehelper.weixin.qq.com/',
    zalo: 'https://chat.zalo.me/',
    kakao: `https://story.kakao.com/share?url=${encUrl}`,
    whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(`${caption} ${siteUrl}`)}`,
    telegram: `https://t.me/share/url?url=${encUrl}&text=${encText}`
  };
  window.open(urls[net] || siteUrl, '_blank', 'noopener,noreferrer');
}

function closeCreatorStudio() {
  if (studioRecorder && studioRecorder.state === 'recording') studioRecorder.stop();
  cancelAnimationFrame(studioSynthAnimId);
  clearInterval(studioTimerInterval);
  if (studioStream) {
    studioStream.getTracks().forEach(t => t.stop());
    studioStream = null;
  }
  if (studioAudioCtx) {
    try { studioAudioCtx.close(); } catch (e) {}
    studioAudioCtx = null;
  }
  document.getElementById('studioOverlay')?.classList.remove('active');
  document.body.classList.remove('tp-studio-open');
  const bar = document.getElementById('tpCharMnemonicBar');
  if (bar) bar.style.display = 'none';
}
