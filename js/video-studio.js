/**
 * 模組 2: js/video-studio.js
 * 負責：1080p HD 錄影工坊 (9:16 手機直屏 & 16:9 電腦橫屏、畫面合成、麥克風/TTS 混音、MP4 導出)
 */
// =========================================================================
// 3. 🎬 錄影工坊 (預設 1080p HD MP4 + 錄製中右鍵彈出修改對話框並同步畫入影片中)
// =========================================================================
let studioStream = null;
let studioRecorder = null;
let studioChunks = [];
let studioTimerInterval = null;
let studioSeconds = 0;
let studioCurrentRatio = '9-16';
let studioCurrentView = 'split';
let studioSynthCanvas = null;
let studioSynthAnimId = null;

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

async function openCreatorStudio(ratioMode = '9-16') {
  document.getElementById('studioOverlay').classList.add('active');
  document.getElementById('studioRatioSelect').value = ratioMode === '16-9' ? '16-9' : '9-16';
  setStudioRatio(ratioMode);
  setStudioViewMode('split');

  const topPane = document.getElementById('studioTopPane');
  topPane.innerHTML = '';

  const existingBlocks = document.querySelectorAll('#annotationList .sentence-block');
  if (existingBlocks.length > 0) {
    existingBlocks.forEach(b => {
      appendSentenceProgressive(b.dataset.zh, b.dataset.en, 'studioTopPane');
    });
  } else {
    appendSentenceProgressive('請問洗手間在哪裡？', 'Excuse me, where is the restroom?', 'studioTopPane');
  }
  updateRowVisibility();

  const camVideo = document.getElementById('studioCamVideo');
  try {
    studioStream = await getBuiltInComputerStream();
    camVideo.srcObject = studioStream;
  } catch (e) {
    studioStream = null;
  }
}

function setStudioRatio(ratio) {
  studioCurrentRatio = (ratio === '16-9') ? '16-9' : '9-16';
  const stage = document.getElementById('studioStage');
  stage.classList.remove('ratio-9-16', 'ratio-16-9');
  stage.classList.add(`ratio-${studioCurrentRatio}`);
}

function setStudioViewMode(viewMode) {
  studioCurrentView = viewMode;
  const stage = document.getElementById('studioStage');
  stage.classList.remove('view-full-text', 'view-full-cam');
  if (viewMode === 'full-text') stage.classList.add('view-full-text');
  if (viewMode === 'full-cam') stage.classList.add('view-full-cam');

  document.getElementById('viewBtnSplit').classList.toggle('active', viewMode === 'split');
  document.getElementById('viewBtnText').classList.toggle('active', viewMode === 'full-text');
  document.getElementById('viewBtnCam').classList.toggle('active', viewMode === 'full-cam');
}

function speakAllStudioText() {
  const blocks = document.querySelectorAll('#studioTopPane .sentence-block');
  const allZh = Array.from(blocks).map(b => b.dataset.zh).join('。');
  if (allZh) speakSingleChar(allZh);
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

  const zhVal = document.getElementById('editZhInput').value || '';
  const stdVal = document.getElementById('editStdInput').value || '';
  const tpVal = document.getElementById('editTpInput').value || '';

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

function toggleStudioRecording() {
  const recBtn = document.getElementById('studioRecBtn');
  const dlLink = document.getElementById('studioDownloadLink');

  if (studioRecorder && studioRecorder.state === 'recording') {
    studioRecorder.stop();
    return;
  }

  dlLink.classList.add('hidden');
  studioChunks = [];
  studioSeconds = 0;
  document.getElementById('studioTimerBadge').innerText = '🔴 00:00';

  const quality = document.getElementById('studioQualitySelect').value || '1080';
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

        if (document.getElementById('chkEn').checked) {
          topPane.querySelectorAll('.en-line').forEach(enEl => {
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

        topPane.querySelectorAll('.tp-col').forEach(colEl => {
          const colR = colEl.getBoundingClientRect();
          if (colR.bottom < paneRect.top || colR.top > paneRect.bottom) return;
          const centerX = (colR.left - paneRect.left + colR.width / 2) * scale;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const pyEl = colEl.querySelector('.tp-py');
          if (pyEl && document.getElementById('chkTp').checked) {
            const r = pyEl.getBoundingClientRect();
            const cy = targetY + (r.top - paneRect.top + r.height / 2) * scale;
            ctx.fillStyle = '#1b5e20';
            ctx.font = `italic 700 ${Math.max(12, Math.round(17 * scale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
            ctx.fillText(pyEl.innerText, centerX, cy);
          }

          const stdEl = colEl.querySelector('.tp-std');
          if (stdEl && document.getElementById('chkStd').checked) {
            const r = stdEl.getBoundingClientRect();
            const cy = targetY + (r.top - paneRect.top + r.height / 2) * scale;
            ctx.fillStyle = '#6b7280';
            ctx.font = `500 ${Math.max(10, Math.round(13.5 * scale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
            ctx.fillText(stdEl.innerText, centerX, cy);
          }

          const zhEl = colEl.querySelector('.tp-zh');
          const showZh = document.getElementById('chkTrad').checked || document.getElementById('chkSimp').checked;
          if (zhEl && showZh) {
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

    drawLiveEditModalOnCanvas(ctx, W, H);
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
    dlLink.href = URL.createObjectURL(blob);
    dlLink.download = `trees-pinyin-${quality}p.mp4`;
    dlLink.classList.remove('hidden');
    recBtn.innerText = '🔴 Record';
    recBtn.style.background = '';
  };

  studioRecorder.start(400);
  recBtn.innerText = '⏹️ Stop';
  recBtn.style.background = '#d32f2f';

  studioTimerInterval = setInterval(() => {
    studioSeconds++;
    const m = String(Math.floor(studioSeconds / 60)).padStart(2, '0');
    const s = String(studioSeconds % 60).padStart(2, '0');
    document.getElementById('studioTimerBadge').innerText = `🔴 ${m}:${s}`;
  }, 1000);
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
  document.getElementById('studioOverlay').classList.remove('active');
}
