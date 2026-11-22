/**
 * Trees Pinyin Studio — Bootstrap Entry (DOMContentLoaded, Mnemonics Renderer & Language Toggle)
 */
function toggleSpeak() {
  if (!('speechSynthesis' in window)) return;
  const btn = document.getElementById('speakBtn');
  const t = UI_TEXT[currentLang];

  if (window.speechSynthesis.speaking || isSpeakingNow) {
    window.speechSynthesis.cancel();
    isSpeakingNow = false;
    if (btn) {
      btn.textContent = t.speakBtn;
      btn.style.background = '';
      btn.style.color = '';
    }
    return;
  }

  const blocks = document.querySelectorAll('#sentencesContainer .sentence-block');
  let allZh = Array.from(blocks).map(b => b.dataset.zh).filter(Boolean).join('。');
  if (!allZh) allZh = document.getElementById('userInput').value;
  if (!allZh) return;
  if (checkAndRemindProfanity(allZh)) return;

  speakSingleOrSentence(allZh);
}

async function exportCardImage() {
  const sheet = document.getElementById('printableSheet');
  try {
    const rect = sheet.getBoundingClientRect();
    const clone = sheet.cloneNode(true);
    clone.querySelectorAll('.no-print').forEach(el => el.remove());
    clone.style.margin = '0';
    clone.style.width = rect.width + 'px';

    const styles = Array.from(document.querySelectorAll('style')).map(s => s.innerHTML).join('\n');
    const svgStr = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">
            <style>${styles}</style>
            ${clone.outerHTML}
          </div>
        </foreignObject>
      </svg>`;

    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL('image/png');
      document.getElementById('generatedImg').src = pngUrl;
      document.getElementById('downloadImgLink').href = pngUrl;
      document.getElementById('imgModal').style.display = 'flex';
    };
    img.src = url;
  } catch (e) {
    window.print();
  }
}

function generateRandomReferralCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = 'PIN';
  for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

// 渲染記憶閃卡（包含完整雙語例句與點擊發音）
function renderMnemonicsPack() {
  const selEl = document.getElementById('packSelect');
  if (!selEl) return;
  const packId = parseInt(selEl.value, 10) || 1;
  const packs = EXACT_BOOK_MNEMONICS.packs;
  const currentPack = packs.find(p => p.packId === packId) || packs[0];
  const grid = document.getElementById('mnemonicCardsContainer');
  const lockedBox = document.getElementById('mnemonicLockedBox');
  if (!grid || !lockedBox) return;
  grid.innerHTML = '';

  lockedBox.classList.add('hidden');
  grid.classList.remove('hidden');
  currentPack.cards.slice(0, 15).forEach((card, i) => {
    const dispHanzi = convertScript(card.hanzi, currentScriptMode);
    const dispExZh = card.exZh ? convertScript(card.exZh, currentScriptMode) : '';
    const el = document.createElement('div');
    el.className = 'mnemonic-card';
    el.innerHTML = `
      <div class="mc-top" style="flex-direction:column; align-items:flex-start; gap:4px;">
        <div class="mc-meaning" style="font-size:16px; color:#1b5e20;">#${i + 1} ${card.meaning}</div>
        <div style="display:flex; justify-content:space-between; width:100%; align-items:baseline;">
          <span class="mc-trees"><i><b>${card.trees}</b></i></span>
          <span class="mc-hanzi" style="cursor:pointer;" data-speak="${card.hanzi.split('/')[0].trim()}">🔊 (${dispHanzi} / ${card.pinyin})</span>
        </div>
      </div>
      <div class="mc-sound"><b>Sound:</b> ${card.sound}</div>
      <div class="mc-tip"><b>Mnemonic:</b> ${card.mnemonic}</div>
      ${dispExZh ? `
      <div style="background:#f8fafc; padding:8px 10px; border-radius:10px; border:1px dashed #cbd5e1; font-size:0.83rem; margin-top:auto;">
        <div style="font-weight:700; cursor:pointer;" data-speak="${card.exZh}">🔊 ${dispExZh}</div>
        <div style="color:#444;">${card.exEn || ''}</div>
      </div>` : ''}
      <div style="display:flex; justify-content:flex-end; margin-top:6px;">
        <button type="button" class="tp-pill-btn" data-card-export="1">🎨 Share Meme Card</button>
      </div>
    `;
    el.querySelectorAll('[data-speak]').forEach(spEl => {
      spEl.addEventListener('click', (e) => {
        e.stopPropagation();
        speakSingleOrSentence(spEl.getAttribute('data-speak'));
      });
    });
    const expBtn = el.querySelector('[data-card-export]');
    if (expBtn) {
      expBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.TreesFunHub && typeof window.TreesFunHub.exportMnemonicMemeCard === 'function') {
          const keepUnderline = (s) => String(s || '').replace(/<(?!\/?u\b)[^>]+>/gi, '');
          const richSound = keepUnderline(card.sound);
          const richTip = keepUnderline(card.mnemonic);
          window.TreesFunHub.exportMnemonicMemeCard({
            hanzi: dispHanzi.split('/')[0].trim(),
            trees: card.trees,
            pinyin: card.pinyin,
            meaning: card.meaning,
            hook: richSound.slice(0, 72),
            mnemonic: richTip,
            author: 'Author Pick',
            likes: 180 + (15 - i) * 4
          });
        }
      });
    }
    grid.appendChild(el);
  });
}

function toggleLang() {
  currentLang = currentLang === 'en' ? 'zh' : 'en';
  const t = UI_TEXT[currentLang];
  safeSetText('uiTitle', t.title);
  safeSetText('uiSubTitle', t.subTitle);
  safeSetText('uiTabWorkspace', t.tabWorkspace);
  safeSetText('uiTabMnemonics', t.tabMnemonics);
  safeSetText('uiLangBtn', t.langBtn);
  safeSetText('uiKeyBtn', t.keyBtn);
  const inputEl = document.getElementById('userInput');
  if (inputEl) inputEl.placeholder = t.placeholder;
  safeSetText('uiAIBtn', t.aiBtn);
  safeSetText('uiTransBtn', t.transBtn);
  if (!isSpeakingNow) safeSetText('speakBtn', t.speakBtn);
  safeSetHtml('uiAuthorNoteText', t.authorNote);
  safeSetText('uiHint', t.hint);
  safeSetText('uiBigBtn', t.bigBtn);
  safeSetText('uiSaveBtn', t.saveBtn);
  safeSetText('uiPrintBtn', t.printBtn);
  safeSetText('uiRecordBtn', t.recordBtn);
  safeSetText('uiExitBig', t.exitBig);
  safeSetText('uiFileMenuTitle', t.fileMenuTitle);
  safeSetText('uiOptDocTitle', t.optDocTitle);
  safeSetText('uiOptDocSub', t.optDocSub);
  safeSetText('uiCloudTitle', t.cloudTitle);
  safeSetText('btnCloseFileMenu', t.fileMenuCancel);
  safeSetText('uiChkTrad', currentLang === 'zh' ? '繁體中文' : 'Traditional Chinese');
  safeSetText('uiChkSimp', currentLang === 'zh' ? '簡體中文' : 'Simplified Chinese');
}

document.addEventListener('DOMContentLoaded', () => {
  injectStudioKeyUIAndReorderLayout();
  initBrowserLocalAISession();
  if (backupKey && modelsDiscoveredForKey !== backupKey) {
    discoverFastModels(backupKey);
  }

  const pSelInit = document.getElementById('packSelect');
  if (pSelInit && pSelInit.options.length >= 3) {
    pSelInit.options[0].textContent = 'Pack 1: Everyday Greetings & Polite Phrases (15 Words · Free)';
    pSelInit.options[1].textContent = 'Pack 2: Pronouns, Family & Countries (15 Words · Free)';
    pSelInit.options[2].textContent = 'Pack 3: Questions, Dining, Doctor & Services (15 Words · Free)';
  }

  const copyInviteBtn = document.getElementById('btnCopyInvite');
  if (copyInviteBtn) {
    copyInviteBtn.textContent = '📤 Share with Friends';
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get({
      showTrees: true,
      showPinyin: false,
      scriptMode: 'trad',
      rateUnlocked: false,
      shareUnlocked: false,
      myInviteCode: '',
      geminiApiKey: '',
      userAiKey: '',
      customCharEdits: {}
    }, (res) => {
      if ((chrome.runtime && chrome.runtime.lastError) || !res) return;
      const syncedKey = (res.geminiApiKey || res.userAiKey || '').trim();
      if (syncedKey && !backupKey) {
        backupKey = syncedKey;
        localStorage.setItem('tp_v22_backup_key', backupKey);
        refreshKeyBtnStyle();
        if (isGoogleGeminiKey(backupKey)) discoverFastModels(backupKey);
      } else if (backupKey && (!res.userAiKey || !res.geminiApiKey)) {
        chrome.storage.sync.set({ geminiApiKey: backupKey, userAiKey: backupKey });
      }
      if (res.customCharEdits && typeof res.customCharEdits === 'object') {
        Object.assign(userCustomEdits, res.customCharEdits);
        try { localStorage.setItem('tp_custom_char_edits_v2', JSON.stringify(userCustomEdits)); } catch (e) {}
      }
      unlockState.rateUnlocked = !!(res.rateUnlocked || localStorage.getItem('tp_rate_unlocked') === 'true');
      unlockState.shareUnlocked = !!(res.shareUnlocked || localStorage.getItem('tp_share_unlocked') === 'true');
      if (res.myInviteCode && /^PIN[A-Z0-9]{4}$/.test(res.myInviteCode)) {
        unlockState.myInviteCode = res.myInviteCode;
      } else if (!/^PIN[A-Z0-9]{4}$/.test(unlockState.myInviteCode)) {
        unlockState.myInviteCode = generateRandomReferralCode();
      }
      localStorage.setItem('tp_my_invite_code', unlockState.myInviteCode);
      chrome.storage.sync.set({ myInviteCode: unlockState.myInviteCode });
      safeSetText('myInviteCodeText', unlockState.myInviteCode);

      const chkTrees = document.getElementById('chkRowTrees');
      const chkPy = document.getElementById('chkRowPy');
      const sheet = document.getElementById('printableSheet');
      if (chkTrees) chkTrees.checked = res.showTrees !== false;
      if (chkPy) chkPy.checked = !!res.showPinyin;
      if (sheet) sheet.classList.toggle('hide-py', !res.showPinyin);

      if (res.scriptMode === 'simp' || res.scriptMode === 'trad') {
        currentScriptMode = res.scriptMode;
        const chkTrad = document.getElementById('chkTrad');
        const chkSimp = document.getElementById('chkSimp');
        if (chkTrad) chkTrad.checked = (currentScriptMode === 'trad');
        if (chkSimp) chkSimp.checked = (currentScriptMode === 'simp');
        const popScriptBtn = document.getElementById('btnScriptMiniPopover');
        if (popScriptBtn) popScriptBtn.textContent = currentScriptMode === 'simp' ? 'Simp 简' : 'Trad 繁';
        document.querySelectorAll('.tp-cell-hz').forEach(el => {
          const raw = el.dataset.raw || el.textContent;
          if (raw && /[\u4e00-\u9fa5]/.test(raw)) {
            el.dataset.raw = raw;
            el.textContent = convertScript(raw, currentScriptMode);
          }
        });
      }

      renderMnemonicsPack();
    });
  } else {
    if (!/^PIN[A-Z0-9]{4}$/.test(unlockState.myInviteCode)) {
      unlockState.myInviteCode = generateRandomReferralCode();
      localStorage.setItem('tp_my_invite_code', unlockState.myInviteCode);
    }
    safeSetText('myInviteCodeText', unlockState.myInviteCode);

    const savedScript = localStorage.getItem('tp_script_mode');
    if (savedScript === 'simp' || savedScript === 'trad') {
      currentScriptMode = savedScript;
      const chkTrad = document.getElementById('chkTrad');
      const chkSimp = document.getElementById('chkSimp');
      if (chkTrad) chkTrad.checked = (currentScriptMode === 'trad');
      if (chkSimp) chkSimp.checked = (currentScriptMode === 'simp');
      const popScriptBtn = document.getElementById('btnScriptMiniPopover');
      if (popScriptBtn) popScriptBtn.textContent = currentScriptMode === 'simp' ? 'Simp 简' : 'Trad 繁';
    }

    renderMnemonicsPack();
  }

  window.__tpStudioBridge = {
    speak: speakSingleOrSentence,
    loadChallengeIntoVideoStudio: (lines) => {
      const wBtn = document.querySelector('.tab-btn[data-tab="workspace"]');
      if (wBtn) wBtn.click();
      const container = document.getElementById('sentencesContainer');
      if (container) {
        container.innerHTML = '';
        (lines || []).forEach(l => appendSentenceProgressive(l.zh, l.en));
      }
      setTimeout(() => openCreatorStudio('9-16'), 120);
    }
  };

  if (window.TreesFunHub && typeof window.TreesFunHub.init === 'function') {
    window.TreesFunHub.init();
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      const panel = document.getElementById(`panel-${target}`);
      if (panel) panel.classList.remove('hidden');
      if (target === 'mnemonics') renderMnemonicsPack();
      if (target === 'funhub' && window.TreesFunHub && typeof window.TreesFunHub.render === 'function') {
        window.TreesFunHub.render();
      }
    });
  });

  const params = new URLSearchParams(window.location.search);
  const reqTab = params.get('tab');
  if (reqTab === 'mnemonics') {
    const mBtn = document.querySelector('.tab-btn[data-tab="mnemonics"]');
    if (mBtn) mBtn.click();
  } else if (reqTab === 'funhub' || reqTab === 'memes') {
    const fTab = document.querySelector('.tab-btn[data-tab="funhub"]');
    if (fTab) fTab.click();
    const wHz = params.get('writeHanzi') || '';
    const wMean = params.get('writeMeaning') || '';
    const sId = params.get('shareId') || '';
    const sHz = params.get('shareHanzi') || '';
    if (wHz && window.TreesFunHub && typeof window.TreesFunHub.openSubmitMemeModal === 'function') {
      setTimeout(() => window.TreesFunHub.openSubmitMemeModal(wHz, wMean), 150);
    } else if ((sId || sHz) && window.TreesFunHub && typeof window.TreesFunHub.openShareCardById === 'function') {
      setTimeout(() => window.TreesFunHub.openShareCardById(sId, sHz), 200);
    }
  } else if (reqTab === 'translator') {
    const fBtn = document.getElementById('fileMenuBtn');
    const uIn = document.getElementById('userInput');
    if (uIn) uIn.focus();
    if (fBtn && params.get('openFile') === '1') fBtn.click();
  } else if (reqTab === 'aichat') {
    const uIn = document.getElementById('userInput');
    if (uIn) uIn.focus();
  }

  if (params.get('autoRecord') === '1' && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('tp_pending_video_lines', (res) => {
      if (chrome.runtime && chrome.runtime.lastError) return;
      const payload = res && res.tp_pending_video_lines;
      const pairs = (payload && Array.isArray(payload.pairs) && (Date.now() - (payload.ts || 0) < 5 * 60 * 1000))
        ? payload.pairs
        : [];
      chrome.storage.local.remove('tp_pending_video_lines');
      if (pairs.length > 0 && window.__tpStudioBridge && typeof window.__tpStudioBridge.loadChallengeIntoVideoStudio === 'function') {
        window.__tpStudioBridge.loadChallengeIntoVideoStudio(pairs);
      } else {
        setTimeout(() => openCreatorStudio('9-16'), 150);
      }
    });
  }

  safeOn('uiAIBtn', 'click', () => runSmartAI());
  safeOn('uiTransBtn', 'click', () => runDirectTranslate());
  safeOn('speakBtn', 'click', toggleSpeak);
  safeOn('micBtn', 'click', toggleVoice);
  safeOn('uiLangBtn', 'click', toggleLang);

  safeOn('userInput', 'input', (e) => handleUserInputChange(e.target));
  safeOn('userInput', 'keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      const val = document.getElementById('userInput').value.trim();
      if (val.length > 0 && !val.includes('\n')) {
        e.preventDefault();
        runSmartAI();
      }
    }
  });

  const fileMenuModal = document.getElementById('fileMenuModal');
  safeOn('fileMenuBtn', 'click', () => {
    if (fileMenuModal) fileMenuModal.style.display = 'flex';
  });
  safeOn('btnCloseFileMenu', 'click', () => {
    if (fileMenuModal) fileMenuModal.style.display = 'none';
  });
  if (fileMenuModal) {
    fileMenuModal.addEventListener('click', (e) => {
      if (e.target === fileMenuModal) fileMenuModal.style.display = 'none';
    });
  }

  safeOn('btnTriggerUnifiedUpload', 'click', () => {
    if (fileMenuModal) fileMenuModal.style.display = 'none';
    const fInput = document.getElementById('unifiedFileInput');
    if (fInput) fInput.click();
  });
  safeOn('unifiedFileInput', 'change', (e) => {
    if (e.target.files?.[0]) handleUnifiedFileUpload(e.target.files[0]);
    e.target.value = '';
  });

  safeOn('btnFetchCloudUrl', 'click', handleFetchCloudLink);

  const smartPanel = document.getElementById('smartDropPanel');
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (smartPanel) smartPanel.classList.add('drag-over');
  });
  window.addEventListener('dragleave', () => {
    if (smartPanel) smartPanel.classList.remove('drag-over');
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (smartPanel) smartPanel.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) await handleUnifiedFileUpload(file);
  });

  window.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) await handleUnifiedFileUpload(new File([blob], 'screenshot.png', { type: blob.type }));
        break;
      }
    }
  });

  safeOn('uiBigBtn', 'click', () => document.body.classList.toggle('big-mode'));
  safeOn('uiExitBig', 'click', () => document.body.classList.remove('big-mode'));
  safeOn('uiSaveBtn', 'click', exportCardImage);
  safeOn('uiPrintBtn', 'click', () => window.print());
  safeOn('uiDoneBtn', 'click', () => {
    const im = document.getElementById('imgModal');
    if (im) im.style.display = 'none';
  });

  document.addEventListener('mouseup', handleTextSelectionCheck);
  document.addEventListener('touchend', handleTextSelectionCheck);

  const sheet = document.getElementById('printableSheet');
  safeOn('chkRowEn', 'change', (e) => {
    if (sheet) sheet.classList.toggle('hide-en', !e.target.checked);
    syncStudioRowVisibility();
  });
  safeOn('chkRowTrees', 'change', (e) => {
    if (sheet) sheet.classList.toggle('hide-trees', !e.target.checked);
    syncStudioRowVisibility();
  });
  safeOn('chkRowPy', 'change', (e) => {
    if (sheet) sheet.classList.toggle('hide-py', !e.target.checked);
    syncStudioRowVisibility();
  });

  safeOn('layoutModeSelect', 'change', (e) => {
    if (!sheet) return;
    const val = e.target.value;
    sheet.classList.remove('layout-kids', 'layout-standard', 'layout-poem');
    if (val === 'kids') {
      sheet.classList.add('layout-kids');
      sheet.style.setProperty('--tp-font-size', '25px');
    } else if (val === 'poem') {
      sheet.classList.add('layout-poem');
      sheet.style.setProperty('--tp-font-size', '22px');
    } else {
      sheet.classList.add('layout-standard');
      sheet.style.setProperty('--tp-font-size', '20px');
    }
  });

  safeOn('fontSizeRange', 'input', (e) => {
    const sz = e.target.value + 'px';
    safeSetText('fontSizeVal', sz);
    if (sheet) sheet.style.setProperty('--tp-font-size', sz);
    const lSel = document.getElementById('layoutModeSelect');
    if (lSel) lSel.value = 'custom';
  });

  safeOn('customHeaderInput', 'input', (e) => {
    const val = e.target.value.trim();
    const box = document.getElementById('cleanTitleBox');
    if (!box) return;
    if (val) {
      box.classList.remove('hidden');
      safeSetText('docMainTitle', val);
    } else {
      box.classList.add('hidden');
    }
  });

  safeOn('packSelect', 'change', renderMnemonicsPack);
  safeOn('btnRewardRate', 'click', handleRateUnlock);
  safeOn('btnCopyInvite', 'click', openShareAppModal);
  safeOn('btnActivateCode', 'click', handleActivateFriendCode);
});
