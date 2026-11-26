/**
 * Trees Pinyin Studio — Module 2: Core State, Cache, UI Injection, API Key & TTS
 */
// 自訂網域 api.treespinyin.com 優先（啟用 Cloudflare 0.02s 全球邊緣快取 + IP 限流），workers.dev 作為自動備援
const CF_WORKER_ENDPOINTS = [
  'https://api.treespinyin.com',
  'https://treespinyin-api.treespinyin.workers.dev'
];

// 獨立中華經典四層檢索微服務（由 classics_pipeline 獨立維護 D1，自訂網域優先、workers.dev 備援）
const CLASSICS_API_ENDPOINTS = [
  'https://classics-api.treespinyin.com',
  'https://classics-api.treespinyin.workers.dev'
];

// 自動判斷 Google Chrome 還是 Microsoft Edge 商店打分頁面
const CHROME_STORE_REVIEW_URL = 'https://chromewebstore.google.com/detail/trees-pinyin-universal-an/jlbjllgeebmhkdcgmcnlkbcaiobpheae/reviews';
const EDGE_STORE_REVIEW_URL = 'https://microsoftedge.microsoft.com/addons/detail/egmgaoogonmldicgbkpaofjffcdlcffm';

function getStoreReviewUrl() {
  const isEdge = /Edg\//i.test(navigator.userAgent);
  return isEdge ? EDGE_STORE_REVIEW_URL : CHROME_STORE_REVIEW_URL;
}

let currentLang = 'en';
let unlockState = {
  rateUnlocked: true,
  shareUnlocked: true,
  myInviteCode: localStorage.getItem('tp_my_invite_code') || 'PIN9X2B'
};
let isSpeakingNow = false;
let spokenLang = 'en';
let activeRec = null;
let voiceSilenceTimer = null;
let latestVoiceCandidates = [];
let chromeAISession = null;
let backupKey = (localStorage.getItem('tp_v22_backup_key') || localStorage.getItem('tp_test_gemini_key') || '').trim();

// 同時原生相容 Google AI Studio 傳統 (AIza...) 與新版 (AQ....) 金鑰，一律優先走 generativelanguage.googleapis.com
function isGoogleGeminiKey(key) {
  const k = String(key || '').trim();
  return k.startsWith('AIza') || /^AQ\./i.test(k);
}
function resolveModelForKey(modelName) {
  return modelName;
}
function buildGoogleGenAiUrl(modelName, key, stream = false) {
  const cleanKey = String(key || '').replace(/\s+/g, '');
  const action = stream ? 'streamGenerateContent?alt=sse&' : 'generateContent?';
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:${action}key=${encodeURIComponent(cleanKey)}`;
}

// 1. 還原最穩最快的歷史成功順序：flash-lite 優先（1秒級極速 + 免費配額最高 + 零思考延遲）-> Full Flash 獨立配額備援
let availableFastModels = [
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-flash'
];
let modelsDiscoveredForKey = '';

// 載入 24 小時內快取的模型清單（省去每次打開重複請求 /models 目錄）
try {
  const cachedModelMeta = JSON.parse(localStorage.getItem('tp_v18_discovered_models') || 'null');
  if (cachedModelMeta && cachedModelMeta.key === backupKey && (Date.now() - cachedModelMeta.ts < 86400000) && Array.isArray(cachedModelMeta.models) && cachedModelMeta.models.length > 0) {
    availableFastModels = cachedModelMeta.models;
    modelsDiscoveredForKey = backupKey;
  }
} catch (e) {}

// 雙層快取（Memory Map + LocalStorage 持久化快取 120 條），重開擴充功能依然 0 毫秒極速秒回！
const PERSISTENT_CACHE_STORAGE_KEY = 'tp_v17_persistent_qa_cache';
const sessionDynamicCache = new Map();

(function loadPersistentCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(PERSISTENT_CACHE_STORAGE_KEY) || '{}');
    for (const [k, v] of Object.entries(raw)) {
      if (k && typeof v === 'string' && v.trim()) {
        sessionDynamicCache.set(k, v);
      }
    }
  } catch (e) {}
})();

function saveAnswerToPersistentCache(cacheKey, aiText) {
  if (!cacheKey || !aiText) return;
  sessionDynamicCache.set(cacheKey, aiText);
  try {
    const store = JSON.parse(localStorage.getItem(PERSISTENT_CACHE_STORAGE_KEY) || '{}');
    const keys = Object.keys(store);
    if (keys.length >= 120 && !store[cacheKey]) {
      delete store[keys[0]];
    }
    store[cacheKey] = aiText;
    localStorage.setItem(PERSISTENT_CACHE_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {}
}

const MAX_MEMORY_TURNS = 3;
let conversationHistory = [];
let lastInteractionTime = 0;
const FREE_PUBLIC_REMINDER_THRESHOLD = 6;

// 三檔長文本與配額策略（前端體驗提示；真正的防繞過硬上限由 Cloudflare Worker 同步校驗）
const TP_TIER_LIMITS = {
  free: { aiMaxChars: 300, transMaxChars: 2000 },
  pro:  { aiMaxChars: 2000, transMaxChars: 15000 },
  byok: { aiMaxChars: 8000, transMaxChars: 30000 }
};

function isStudioProMember() {
  try {
    if (window.TreesStoriesMembership && typeof window.TreesStoriesMembership.isProMember === 'function') {
      if (window.TreesStoriesMembership.isProMember()) return true;
    }
    const keys = ['tp_pro_member', 'tp_subscription_active', 'tp_member_token'];
    for (const k of keys) {
      const val = (localStorage.getItem(k) || '').trim().toLowerCase();
      if (val && val !== '0' && val !== 'false' && val !== 'none' && val !== 'expired') return true;
    }
    const rawProfile = localStorage.getItem('tp_member_profile');
    if (rawProfile) {
      const p = JSON.parse(rawProfile);
      if (p && (p.isPro === true || p.tier === 'pro' || p.status === 'active')) return true;
    }
  } catch (e) {}
  return false;
}

function getProAuthToken() {
  try {
    return (localStorage.getItem('tp_member_token') || localStorage.getItem('tp_subscription_active') || '').trim();
  } catch (e) {
    return '';
  }
}

function getActiveUserTier() {
  const hasKey = (typeof getActiveUserApiKey === 'function')
    ? !!getActiveUserApiKey()
    : !!((backupKey || '').trim());
  if (hasKey) return 'byok';
  if (isStudioProMember()) return 'pro';
  return 'free';
}

function getActiveTierLimits() {
  return TP_TIER_LIMITS[getActiveUserTier()] || TP_TIER_LIMITS.free;
}
let currentScriptMode = 'trad';
let openccToSimp = null;
let openccToTrad = null;
const userCustomEdits = JSON.parse(localStorage.getItem('tp_custom_char_edits_v2') || '{}');
let activeEditCol = null;
let selectedPageText = '';
let popoverZhText = '';
let popoverEnText = '';

// 防連點與併發請求序號鎖
let activeRequestSeq = 0;
let lastSubmittedQuery = '';
let lastSubmittedTime = 0;
let lastFailedAiQuestion = '';

// 錄影工坊狀態變數
let studioStream = null;
let studioRecorder = null;
let studioChunks = [];
let studioTimerInterval = null;
let studioSeconds = 0;
let studioCurrentRatio = '9-16';
let studioCurrentView = 'split';
let studioRecordPopups = true;
let studioSynthCanvas = null;
let studioSynthAnimId = null;
let studioAudioCtx = null;
let studioAudioDest = null;

function safeOn(id, evt, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(evt, handler);
}
function safeSetText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}
function safeSetHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// =========================================================================
// 0. 自動注入緊湊樣式、API Key 彈窗、多平台分享彈窗、錄影工坊 UI，並重排工作區順序
// =========================================================================
function injectStudioKeyUIAndReorderLayout() {
  if (!document.getElementById('tpCompactStudioStyle')) {
    const st = document.createElement('style');
    st.id = 'tpCompactStudioStyle';
    st.textContent = `
      #printableSheet {
        min-height: 72px !important;
        padding: 12px 16px !important;
        margin-top: 8px !important;
        margin-bottom: 8px !important;
      }
      #aiReplyBox {
        padding: 8px 12px !important;
        margin-bottom: 6px !important;
      }
      #sentencesContainer {
        gap: 12px !important;
      }
      #sentencesContainer .sentence-block, #studioTopPane .sentence-block {
        padding-bottom: 10px !important;
        gap: 5px !important;
      }
      .tp-char-col {
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
      }
      .tp-share-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        width: 100%;
      }
      .tp-share-app-btn {
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid #d0d7de;
        background: #f8fafc;
        font-size: 0.86rem;
        font-weight: 700;
        color: #111;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        text-decoration: none;
        transition: background 0.15s, border-color 0.15s;
        font-family: inherit;
      }
      .tp-share-app-btn:hover {
        background: #e8f5e9;
        border-color: #1b5e20;
      }
      .voice-lang-toggle {
        height: 32px;
        padding: 0 11px;
        border-radius: 999px;
        border: 1.5px solid #c8e6c9;
        background: #e8f5e9;
        color: #1b5e20;
        font-size: 0.8rem;
        font-weight: 800;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        user-select: none;
        transition: all 0.15s;
      }
      .voice-lang-toggle:hover {
        background: #1b5e20;
        color: #ffffff;
        border-color: #1b5e20;
      }
      .voice-lang-toggle.zh-mode {
        background: #e8f0fe;
        color: #1a73e8;
        border-color: #bfdbfe;
      }
      .voice-lang-toggle.zh-mode:hover {
        background: #1a73e8;
        color: #ffffff;
        border-color: #1a73e8;
      }
      .tp-api-limit-box {
        width: 100%;
        background: #fffdf5;
        border: 1px solid #fde68a;
        border-left: 4px solid #f59e0b;
        border-radius: 12px;
        padding: 11px 16px;
        font-size: 0.85rem;
        color: #374151;
        line-height: 1.5;
        display: none;
        cursor: pointer;
        margin-top: 6px;
        margin-bottom: 6px;
      }
      .tp-api-limit-box b { color: #b45309; }
      .tp-input-limit-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 0.76rem;
        color: #475569;
        padding: 4px 4px 2px;
      }
      .tp-tier-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 9px;
        border-radius: 999px;
        background: #f1f5f9;
        border: 1px solid #cbd5e1;
        color: #334155;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s;
      }
      .tp-tier-pill:hover {
        background: #e8f5e9;
        border-color: #2e7d32;
        color: #1b5e20;
      }
      .tp-tier-pill.tier-byok {
        background: #e8f5e9;
        border-color: #81c784;
        color: #1b5e20;
      }
      .tp-tier-pill.tier-pro {
        background: #fef3c7;
        border-color: #f59e0b;
        color: #92400e;
      }
      .tp-char-counter {
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: #64748b;
      }
      .tp-char-counter.warn { color: #b45309; }
      .tp-char-counter.over { color: #b91c1c; }
      .selection-icon-only {
        position: absolute;
        display: none;
        z-index: 200010;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #1b5e20;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 14px rgba(27,94,32,0.48);
        cursor: pointer;
        padding: 3px;
        transition: transform 0.15s;
      }
      .selection-icon-only:hover { transform: scale(1.12); }
      .selection-icon-only img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
      .selection-mini-popover {
        position: absolute;
        display: none;
        z-index: 200011;
        width: 92vw;
        max-width: 440px;
        background: #ffffff;
        border: 2px solid #1b5e20;
        border-radius: 16px;
        box-shadow: 0 12px 35px rgba(0,0,0,0.25);
        padding: 12px;
        flex-direction: column;
        gap: 8px;
        font-family: inherit;
      }
      /* ================= 🎬 Video Studio Overlay Styles ================= */
      .studio-overlay {
        display: none;
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        background: #0f172a;
        z-index: 100000;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 10px;
        color: #fff;
        font-family: inherit;
      }
      .studio-overlay.active { display: flex; }
      .studio-top-bar {
        width: 100%; max-width: 900px;
        display: flex; justify-content: space-between; align-items: center;
        flex-wrap: wrap; gap: 8px;
        background: rgba(255,255,255,0.08);
        padding: 8px 12px; border-radius: 12px;
      }
      .studio-select {
        background: #1e293b; color: #fff; border: 1px solid #475569;
        border-radius: 8px; padding: 6px 10px; font-size: 0.82rem; font-weight: 700; outline: none;
      }
      .studio-mode-pill {
        padding: 6px 12px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.25);
        background: transparent; color: #fff; font-size: 0.8rem; font-weight: 700; cursor: pointer;
      }
      .studio-mode-pill.active { background: #1b5e20; border-color: #a5d6a7; }
      .studio-stage {
        position: relative; background: #ffffff; color: #111; border-radius: 16px;
        overflow: hidden; display: flex; flex-direction: column;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5); border: 2px solid #334155;
        --tp-font-size: 19px;
      }
      .studio-stage.ratio-9-16 { width: min(92vw, 380px); height: min(76vh, 675px); }
      .studio-stage.ratio-16-9 { width: min(94vw, 820px); height: min(72vh, 461px); }
      .studio-top-pane {
        flex: 1; overflow-y: auto; padding: 14px 12px; background: #ffffff;
        display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px;
        scroll-behavior: smooth; border-bottom: 2px solid #1b5e20;
      }
      .studio-bottom-pane {
        flex: 1; position: relative; background: #000; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
      }
      .studio-bottom-pane video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
      .studio-stage.view-full-text .studio-bottom-pane { display: none !important; }
      .studio-stage.view-full-text .studio-top-pane { flex: 1; height: 100%; border-bottom: none; }
      .studio-stage.view-full-cam .studio-top-pane { display: none !important; }
      .studio-stage.view-full-cam .studio-bottom-pane { flex: 1; height: 100%; }
      .studio-bottom-controls {
        width: 100%; max-width: 900px; display: flex; justify-content: center;
        align-items: center; gap: 10px; flex-wrap: wrap; padding: 6px; position: relative;
      }
      .studio-share-wrap { position: relative; display: inline-block; }
      .studio-share-wrap.hidden { display: none !important; }
      .studio-share-menu {
        display: none; flex-direction: column; position: absolute; bottom: calc(100% + 8px); right: 0;
        min-width: 205px; max-height: min(380px, 65vh); overflow-y: auto; z-index: 100020;
        background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px;
        box-shadow: 0 12px 28px rgba(0,0,0,0.32); padding: 5px;
      }
      .studio-share-item {
        box-sizing: border-box; width: 100%; text-align: left; background: transparent; border: none;
        border-radius: 8px; padding: 8px 10px; font-size: 12.5px; font-weight: 700; color: #1e293b;
        cursor: pointer; display: block;
      }
      .studio-share-item:hover { background: #e8f5e9; color: #1b5e20; }
      .studio-top-pane.hide-en .tp-line-en { display: none !important; }
      .studio-top-pane.hide-trees .tp-cell-trees { display: none !important; }
      .studio-top-pane.hide-py .tp-cell-py { display: none !important; }
      .studio-top-pane.hide-hz .tp-cell-hz { display: none !important; }
    `;
    document.head.appendChild(st);
  }

  // 1. 右上角注入 🔑 API Key 按鈕
  const langBtn = document.getElementById('uiLangBtn');
  if (langBtn && !document.getElementById('uiKeyBtn')) {
    const keyBtn = document.createElement('button');
    keyBtn.id = 'uiKeyBtn';
    keyBtn.className = langBtn.className || 'top-btn';
    keyBtn.style.cssText = 'margin-right: 6px; cursor: pointer; font-weight: 700;';
    keyBtn.textContent = '🔑 API Key';
    keyBtn.addEventListener('click', openStudioKeyModal);
    langBtn.parentNode.insertBefore(keyBtn, langBtn);
  }

  // 1.5 麥克風左側自動注入 EN / 中文 語音切換膠囊按鈕
  const micBtnEl = document.getElementById('micBtn');
  if (micBtnEl && !document.getElementById('voiceLangBtn')) {
    const vBtn = document.createElement('button');
    vBtn.id = 'voiceLangBtn';
    vBtn.type = 'button';
    vBtn.className = 'voice-lang-toggle';
    vBtn.title = 'Switch voice input language (EN / 中文)';
    vBtn.textContent = 'EN';
    vBtn.addEventListener('click', toggleVoiceLang);
    micBtnEl.parentNode.insertBefore(vBtn, micBtnEl);
  }

  // 1.8 在底部控制列 (Print 按鈕旁) 自動注入 🎬 Record Video 按鈕
  const printBtnEl = document.getElementById('uiPrintBtn');
  if (printBtnEl && printBtnEl.parentNode && !document.getElementById('uiRecordBtn')) {
    const recBtn = document.createElement('button');
    recBtn.id = 'uiRecordBtn';
    recBtn.type = 'button';
    recBtn.className = printBtnEl.className || 'btn';
    recBtn.style.cssText = 'background:#1b5e20; color:#ffffff; border-color:#1b5e20; font-weight:700; cursor:pointer;';
    recBtn.textContent = currentLang === 'zh' ? '🎬 錄製影片' : '🎬 Record Video';
    recBtn.addEventListener('click', () => openCreatorStudio('9-16'));
    printBtnEl.parentNode.insertBefore(recBtn, printBtnEl.nextSibling);
  }

  // 1.9 自動注入 🎬 錄影工坊 Overlay (預設 9:16 + 1080p HD + MP4 輸出 + 錄製中改字同步畫入影片)
  if (!document.getElementById('studioOverlay')) {
    const studioOv = document.createElement('div');
    studioOv.id = 'studioOverlay';
    studioOv.className = 'studio-overlay no-print';
    studioOv.innerHTML = `
      <div class="studio-top-bar">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <select id="studioRatioSelect" class="studio-select">
            <option value="9-16" selected>📱 9:16</option>
            <option value="16-9">🎬 16:9</option>
          </select>
          <select id="studioQualitySelect" class="studio-select" title="Resolution">
            <option value="1080" selected>🌟 1080p HD</option>
            <option value="720">⚖️ 720p HD</option>
            <option value="480">⚡ 480p Compact</option>
          </select>
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <button type="button" class="studio-mode-pill active" id="viewBtnSplit">🌗 Split</button>
          <button type="button" class="studio-mode-pill" id="viewBtnText">📄 Text</button>
          <button type="button" class="studio-mode-pill" id="viewBtnCam">🧑 Cam</button>
          <button type="button" class="studio-mode-pill active" id="studioShowTricksBtn" title="Include memory tricks, Write Trick & Share Card popups in recorded video">💡 Tricks: ON</button>
        </div>
        <button type="button" class="studio-mode-pill" id="btnCloseStudioOverlay" style="background:#d32f2f; border-color:#ef5350;">✕</button>
      </div>

      <div id="studioStage" class="studio-stage ratio-9-16">
        <div id="studioTopPane" class="studio-top-pane"></div>
        <div id="studioBottomPane" class="studio-bottom-pane">
          <video id="studioCamVideo" autoplay playsinline muted></video>
        </div>
      </div>

      <div class="studio-bottom-controls">
        <span id="studioTimerBadge" style="font-family:monospace; font-size:0.95rem; font-weight:800; background:#1e293b; padding:6px 10px; border-radius:8px;">⏺️ 00:00</span>
        <button type="button" id="studioRecBtn" style="padding:8px 18px; border:none; border-radius:10px; background:#1b5e20; color:#fff; font-size:0.92rem; font-weight:700; cursor:pointer;">🔴 Record</button>
        <button type="button" id="studioSpeakBtn" style="padding:8px 14px; border:1px solid #c8e6c9; border-radius:10px; background:#e8f5e9; color:#1b5e20; font-size:0.92rem; font-weight:700; cursor:pointer;">🔊 Speak</button>
        <a id="studioDownloadLink" class="hidden" style="padding:8px 16px; border-radius:10px; background:#1565c0; color:#fff; font-size:0.92rem; font-weight:700; text-decoration:none;" download="trees-pinyin-video.mp4">💾 Save MP4</a>
        <div id="studioShareWrap" class="studio-share-wrap hidden">
          <button type="button" id="studioShareBtn" style="padding:8px 16px; border:none; border-radius:10px; background:#1b5e20; color:#fff; font-size:0.92rem; font-weight:700; cursor:pointer;">🚀 Share ▾</button>
          <div id="studioShareMenu" class="studio-share-menu">
            <button type="button" class="studio-share-item" data-vshare="instagram">📸 Instagram</button>
            <button type="button" class="studio-share-item" data-vshare="tiktok">🎵 TikTok</button>
            <button type="button" class="studio-share-item" data-vshare="xhs">📕 RedNote (小紅書)</button>
            <button type="button" class="studio-share-item" data-vshare="threads">🧵 Threads</button>
            <button type="button" class="studio-share-item" data-vshare="pinterest">📌 Pinterest</button>
            <button type="button" class="studio-share-item" data-vshare="x">🐦 X (Twitter)</button>
            <button type="button" class="studio-share-item" data-vshare="reddit">🤖 Reddit</button>
            <button type="button" class="studio-share-item" data-vshare="facebook">📘 Facebook</button>
            <button type="button" class="studio-share-item" data-vshare="line">💚 LINE</button>
            <button type="button" class="studio-share-item" data-vshare="wechat">🟢 WeChat (微信)</button>
            <button type="button" class="studio-share-item" data-vshare="zalo">🔵 Zalo (Vietnam)</button>
            <button type="button" class="studio-share-item" data-vshare="kakao">💛 KakaoTalk (Korea)</button>
            <button type="button" class="studio-share-item" data-vshare="whatsapp">💬 WhatsApp</button>
            <button type="button" class="studio-share-item" data-vshare="telegram">✈️ Telegram</button>
            <button type="button" class="studio-share-item" data-vshare="native">📲 System Share (Direct MP4)</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(studioOv);

    document.getElementById('studioRatioSelect').addEventListener('change', (e) => setStudioRatio(e.target.value));
    document.getElementById('viewBtnSplit').addEventListener('click', () => setStudioViewMode('split'));
    document.getElementById('viewBtnText').addEventListener('click', () => setStudioViewMode('full-text'));
    document.getElementById('viewBtnCam').addEventListener('click', () => setStudioViewMode('full-cam'));
    const tricksToggleBtn = document.getElementById('studioShowTricksBtn');
    if (tricksToggleBtn) {
      tricksToggleBtn.addEventListener('click', () => {
        studioRecordPopups = !studioRecordPopups;
        tricksToggleBtn.classList.toggle('active', studioRecordPopups);
        tricksToggleBtn.textContent = studioRecordPopups ? '💡 Tricks: ON' : '💡 Tricks: OFF';
        if (!studioRecordPopups) {
          const bar = document.getElementById('tpCharMnemonicBar');
          if (bar) bar.style.display = 'none';
        }
      });
    }
    document.getElementById('btnCloseStudioOverlay').addEventListener('click', closeCreatorStudio);
    document.getElementById('studioRecBtn').addEventListener('click', toggleStudioRecording);
    document.getElementById('studioSpeakBtn').addEventListener('click', speakAllStudioText);

    const sShareBtn = document.getElementById('studioShareBtn');
    const sShareMenu = document.getElementById('studioShareMenu');
    sShareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sShareMenu.style.display = sShareMenu.style.display === 'flex' ? 'none' : 'flex';
    });
    studioOv.addEventListener('click', (e) => {
      if (!e.target.closest('#studioShareWrap')) sShareMenu.style.display = 'none';
    });
    sShareMenu.querySelectorAll('[data-vshare]').forEach(btn => {
      btn.addEventListener('click', () => {
        sShareMenu.style.display = 'none';
        shareRecordedStudioVideo(btn.getAttribute('data-vshare'));
      });
    });
  }

  // 2. 自動注入 API Key 設定與驗證彈窗 (AIcapsule Save & Verify 架構)
  if (!document.getElementById('studioKeyModal')) {
    const modal = document.createElement('div');
    modal.id = 'studioKeyModal';
    modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.55); z-index:99999; justify-content:center; align-items:center; padding:16px;';
    modal.innerHTML = `
      <div style="background:#fff; width:100%; max-width:420px; border-radius:16px; padding:20px; display:flex; flex-direction:column; gap:12px; box-shadow:0 10px 30px rgba(0,0,0,0.2); font-family:inherit;">
        <h3 id="uiStudioKeyTitle" style="margin:0; font-size:1.02rem; color:#1b5e20;">🔑 Google Gemini API Key</h3>
        <div id="uiStudioKeyDesc" style="font-size:0.84rem; line-height:1.55; background:#f8fafc; padding:12px; border-radius:10px; color:#334155;">
          Enter your free Google Gemini API Key (automatically detects all active models under your key including <b>Gemini Flash</b> + <b>Gemma 3 27B</b>):<br>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#1565c0; font-weight:700;">Get Free Key at Google AI Studio ↗</a>
        </div>
        <input type="text" id="studioApiKeyInput" autocomplete="off" spellcheck="false" style="width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.9rem; font-family:monospace; outline:none;" placeholder="AIzaSy... or AQ....">
        <div id="studioKeyTestStatus" style="font-size:0.8rem; color:#475569; display:none;"></div>
        <div style="display:flex; gap:8px;">
          <button id="btnSaveStudioKey" style="flex:1; height:40px; padding:0 16px; border:none; border-radius:10px; background:#1b5e20; color:#fff; font-size:0.9rem; font-weight:700; cursor:pointer;">Save & Verify</button>
          <button id="btnClearStudioKey" style="height:40px; padding:0 16px; border:1px solid #cbd5e1; border-radius:10px; background:#f1f5f9; color:#334155; font-size:0.9rem; font-weight:700; cursor:pointer;">Clear</button>
          <button id="btnCloseStudioKey" style="height:40px; padding:0 16px; border:1px solid #cbd5e1; border-radius:10px; background:#f1f5f9; color:#334155; font-size:0.9rem; font-weight:700; cursor:pointer;">Close</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
    document.body.appendChild(modal);

    document.getElementById('btnSaveStudioKey').addEventListener('click', saveStudioBackupKey);
    document.getElementById('btnClearStudioKey').addEventListener('click', clearStudioBackupKey);
    document.getElementById('btnCloseStudioKey').addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  // 2.5 自動注入輸入框下方的即時字數統計與額度狀態列 (#tpInputLimitBar)
  const smartDropEl = document.getElementById('smartDropPanel');
  const searchBoxEl = smartDropEl ? smartDropEl.querySelector('.search-box') : null;
  if (smartDropEl && searchBoxEl && !document.getElementById('tpInputLimitBar')) {
    const limitBar = document.createElement('div');
    limitBar.id = 'tpInputLimitBar';
    limitBar.className = 'tp-input-limit-bar no-print';
    limitBar.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
        <button type="button" id="tpTierBadgeBtn" class="tp-tier-pill" title="Manage API Key or Pro Membership"></button>
      </div>
      <span id="tpCharCounterText" class="tp-char-counter"></span>
    `;
    searchBoxEl.parentNode.insertBefore(limitBar, searchBoxEl.nextSibling);
    document.getElementById('tpTierBadgeBtn').addEventListener('click', () => {
      const tier = getActiveUserTier();
      if (tier === 'byok') openStudioKeyModal();
      else openStudioProModal();
    });
  }

  // 2.6 自動注入 Pro 訂閱 / 額度方案說明彈窗 (#tpProModal)
  if (!document.getElementById('tpProModal')) {
    const proModal = document.createElement('div');
    proModal.id = 'tpProModal';
    proModal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.55); z-index:99999; justify-content:center; align-items:center; padding:16px;';
    proModal.innerHTML = `
      <div style="background:#fff; width:100%; max-width:440px; border-radius:16px; padding:20px; display:flex; flex-direction:column; gap:12px; box-shadow:0 10px 30px rgba(0,0,0,0.22); font-family:inherit; color:#1e293b;">
        <h3 id="tpProModalTitle" style="margin:0; font-size:1.05rem; color:#1b5e20;">💎 Unlock Longer Text & Higher AI Limits</h3>
        <div id="tpProModalBody" style="font-size:0.84rem; line-height:1.58; background:#f8fafc; padding:12px 14px; border-radius:10px; border:1px solid #e2e8f0;">
          <div style="margin-bottom:8px;"><b>Choose how you want to continue:</b></div>
          <ul style="margin:0; padding-left:18px; display:flex; flex-direction:column; gap:5px;">
            <li><b>🔑 Bring Your Own API Key (Free):</b> Add your own Google Gemini API Key for up to <b>8,000 chars</b> AI Q&amp;A &amp; unlimited daily use on your own quota.</li>
            <li><b>💎 Trees Pinyin Pro (No Key Setup):</b> Up to <b>2,000 chars</b> per AI reply, <b>15,000 chars</b> translation, generous Fair-Use daily/monthly quota, plus full Storybook Library access.</li>
          </ul>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" id="btnProOpenKeyModal" style="flex:1; min-width:160px; height:40px; border:1.5px solid #2e7d32; border-radius:10px; background:#e8f5e9; color:#1b5e20; font-size:0.88rem; font-weight:700; cursor:pointer;">🔑 Use My Own API Key</button>
          <a id="btnProGoStories" href="stories/index.html" style="flex:1; min-width:160px; height:40px; border:none; border-radius:10px; background:#1b5e20; color:#fff; font-size:0.88rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; text-decoration:none;">💎 Explore Pro Plan ↗</a>
        </div>
        <button type="button" id="btnCloseProModal" style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:10px; background:#f1f5f9; color:#334155; font-size:0.86rem; font-weight:700; cursor:pointer;">Close</button>
      </div>
    `;
    proModal.addEventListener('click', (e) => {
      if (e.target === proModal) proModal.style.display = 'none';
    });
    document.body.appendChild(proModal);
    document.getElementById('btnProOpenKeyModal').addEventListener('click', () => {
      proModal.style.display = 'none';
      openStudioKeyModal();
    });
    document.getElementById('btnCloseProModal').addEventListener('click', () => {
      proModal.style.display = 'none';
    });
  }

  // 3. 自動注入「多平台社交 App 分享彈窗 (shareAppModal)」
  if (!document.getElementById('shareAppModal')) {
    const shareModal = document.createElement('div');
    shareModal.id = 'shareAppModal';
    shareModal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.55); z-index:99999; justify-content:center; align-items:center; padding:16px;';
    shareModal.innerHTML = `
      <div style="background:#fff; width:100%; max-width:420px; border-radius:16px; padding:20px; display:flex; flex-direction:column; gap:12px; box-shadow:0 10px 30px rgba(0,0,0,0.2); font-family:inherit;">
        <h3 style="margin:0; font-size:1.05rem; color:#1b5e20;">📤 Share Trees Pinyin with Friends</h3>
        <div style="font-size:0.85rem; color:#444; background:#f8fafc; padding:10px 12px; border-radius:10px; border:1px solid #e2e8f0;">
          Your code <b id="modalShareCode" style="color:#1565c0;">${unlockState.myInviteCode}</b> has been copied! Choose an app to send to your friends:
        </div>
        <button id="nativeShareBtn" style="width:100%; padding:11px 14px; border:none; border-radius:10px; background:#1b5e20; color:#fff; font-size:0.9rem; font-weight:700; cursor:pointer;">
          📱 Share via System Menu (iMessage / WeChat / AirDrop)
        </button>
        <div class="tp-share-grid">
          <a id="shareWhatsApp" target="_blank" rel="noopener noreferrer" class="tp-share-app-btn">💬 WhatsApp</a>
          <a id="shareLine" target="_blank" rel="noopener noreferrer" class="tp-share-app-btn">💚 LINE</a>
          <a id="shareZalo" target="_blank" rel="noopener noreferrer" class="tp-share-app-btn">🔵 Zalo</a>
          <a id="shareKakao" target="_blank" rel="noopener noreferrer" class="tp-share-app-btn">💛 KakaoTalk</a>
          <a id="shareTwitter" target="_blank" rel="noopener noreferrer" class="tp-share-app-btn">🐦 X (Twitter)</a>
          <a id="shareFacebook" target="_blank" rel="noopener noreferrer" class="tp-share-app-btn">📘 Facebook</a>
          <a id="shareTelegram" target="_blank" rel="noopener noreferrer" class="tp-share-app-btn">✈️ Telegram</a>
          <a id="shareEmail" class="tp-share-app-btn">✉️ Email</a>
          <button id="btnCopyShareWeChat" type="button" class="tp-share-app-btn">🟢 WeChat (Copy)</button>
        </div>
        <button id="btnCloseShareModal" type="button" style="width:100%; padding:8px; border:1px solid #d0d7de; border-radius:8px; background:#fff; color:#222; font-weight:600; cursor:pointer;">Done</button>
      </div>
    `;
    shareModal.addEventListener('click', (e) => {
      if (e.target === shareModal) shareModal.style.display = 'none';
    });
    document.body.appendChild(shareModal);

    document.getElementById('nativeShareBtn').addEventListener('click', triggerNativeSystemShare);
    document.getElementById('btnCopyShareWeChat').addEventListener('click', copyShareTextOnly);
    document.getElementById('btnCloseShareModal').addEventListener('click', () => {
      shareModal.style.display = 'none';
    });
  }

  // 4. 自動重排工作區順序：膠囊輸入框 -> 第一排：內容回覆框 (#printableSheet) -> 第二排：免責聲明 -> 第三排：控制面板
  const sheet = document.getElementById('printableSheet');
  const noteTextEl = document.getElementById('uiAuthorNoteText');
  const dropPanel = document.getElementById('smartDropPanel') || (document.getElementById('userInput') ? document.getElementById('userInput').closest('section, .panel, .search-panel') : null);

  if (sheet) {
    const noteBanner = noteTextEl ? (noteTextEl.closest('section, .disclaimer-banner, .author-note, div') || noteTextEl) : null;
    const parentContainer = sheet.parentNode;

    if (parentContainer && dropPanel && dropPanel.parentNode === parentContainer) {
      if (dropPanel.nextElementSibling !== sheet) {
        parentContainer.insertBefore(sheet, dropPanel.nextElementSibling);
      }
      if (noteBanner && noteBanner !== sheet && noteBanner.parentNode === parentContainer) {
        parentContainer.insertBefore(noteBanner, sheet.nextElementSibling);
      }
    } else if (parentContainer && noteBanner && noteBanner.parentNode === parentContainer) {
      parentContainer.insertBefore(sheet, noteBanner);
    }
  }



 // 5. 注入劃詞僅顯示 icon.png 小圖標 + 點擊彈出獨立小顯示框 (100% 符合 Manifest V3 CSP 規範，無行內 onerror)
  const iconSrc = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('icon.png') : 'icon.png';
  if (!document.getElementById('selectionIconOnly')) {
    const iconBtn = document.createElement('button');
    iconBtn.id = 'selectionIconOnly';
    iconBtn.className = 'selection-icon-only';
    const iconImg = document.createElement('img');
    iconImg.src = iconSrc;
    iconImg.alt = 'Trees Pinyin';
    iconImg.addEventListener('error', () => { iconImg.src = '/icon.png?v=3'; }, { once: true });
    iconBtn.appendChild(iconImg);
    iconBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    iconBtn.addEventListener('click', openSelectionMiniPopover);
    document.body.appendChild(iconBtn);
  }

  if (!document.getElementById('selectionMiniPopover')) {
    const pop = document.createElement('div');
    pop.id = 'selectionMiniPopover';
    pop.className = 'selection-mini-popover';
    pop.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:6px; gap:8px;">
        <div style="display:flex; align-items:center; gap:6px; font-weight:800; color:#1b5e20; font-size:0.86rem;">
          <img id="tpMiniPopoverIcon" src="${iconSrc}" style="width:18px; height:18px; border-radius:4px;" alt="">
          <span>Trees Pinyin</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <button id="btnScriptMiniPopover" type="button" title="Switch Traditional / Simplified Chinese" style="padding:2px 8px; font-size:0.74rem; font-weight:700; border-radius:6px; border:1px solid #a5d6a7; background:#f1f8e9; color:#1b5e20; cursor:pointer;">${currentScriptMode === 'simp' ? 'Simp 简' : 'Trad 繁'}</button>
          <button id="btnCloseMiniPopover" type="button" style="border:none; background:none; font-size:1rem; cursor:pointer; color:#666;">✕</button>
        </div>
      </div>
      <div id="popoverAnnotationBody" style="max-height:220px; overflow-y:auto; display:flex; flex-direction:column; align-items:center; gap:8px; padding:4px 0;"></div>
      <div style="display:flex; gap:8px; border-top:1px solid #eee; padding-top:8px;">
        <button id="btnSpeakMiniPopover" type="button" style="flex:1; padding:6px 8px; font-size:0.8rem; font-weight:700; border-radius:10px; border:1px solid #c8e6c9; background:#e8f5e9; color:#1b5e20; cursor:pointer;">🔊 Speak</button>
        <button id="btnRecordMiniPopover" type="button" style="flex:1; padding:6px 8px; font-size:0.8rem; font-weight:700; border-radius:10px; border:1px solid #f48fb1; background:#fce4ec; color:#c2185b; cursor:pointer;">🎬 Record</button>
        <button id="btnPrintMiniPopover" type="button" style="flex:1; padding:6px 8px; font-size:0.8rem; font-weight:700; border-radius:10px; border:1px solid #c8e6c9; background:#e8f5e9; color:#1b5e20; cursor:pointer;">🖨️ Print</button>
      </div>
    `;
    pop.addEventListener('mousedown', (e) => e.stopPropagation());
    document.body.appendChild(pop);

    document.getElementById('btnCloseMiniPopover').addEventListener('click', closeSelectionMiniPopover);
    document.getElementById('btnScriptMiniPopover').addEventListener('click', togglePopoverScriptMode);
    document.getElementById('btnSpeakMiniPopover').addEventListener('click', speakPopoverContent);
    document.getElementById('btnRecordMiniPopover').addEventListener('click', recordPopoverContent);
    document.getElementById('btnPrintMiniPopover').addEventListener('click', printPopoverContent);
  }

  // 6. 注入右鍵/手機長按三合一修改器彈窗 (漢字 + 標準拼音 + Trees Pinyin)
  if (!document.getElementById('editCharModal')) {
    const editModal = document.createElement('div');
    editModal.id = 'editCharModal';
    editModal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.55); z-index:200005; justify-content:center; align-items:center; padding:16px;';
    editModal.innerHTML = `
      <div id="editCharModalBox" style="background:#fff; width:100%; max-width:420px; border-radius:16px; padding:20px; display:flex; flex-direction:column; gap:12px; box-shadow:0 10px 30px rgba(0,0,0,0.2); color:#111; font-family:inherit;">
        <h3 style="margin:0; color:#1b5e20; font-size:1rem;">✍️ Edit Character & Pinyin</h3>
        <div>
          <label style="font-size:0.78rem; font-weight:700;">Character (漢字):</label>
          <input type="text" id="editZhInput" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:8px; font-size:1.05rem; font-weight:700; margin-top:3px; outline:none;">
        </div>
        <div>
          <label style="font-size:0.78rem; font-weight:700;">Standard Pinyin (e.g. <code>hang2</code>):</label>
          <input type="text" id="editStdInput" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.9rem; margin-top:3px; outline:none;">
        </div>
        <div>
          <label style="font-size:0.78rem; font-weight:700;">Trees Pinyin:</label>
          <input type="text" id="editTpInput" style="width:100%; padding:8px; border:1px solid #2e7d32; border-radius:8px; font-size:0.95rem; font-weight:700; color:#1b5e20; margin-top:3px; outline:none;">
        </div>
        <div style="display:flex; gap:8px;">
          <button id="btnSaveThreeInOneEdit" type="button" style="flex:1; padding:10px 14px; border:none; border-radius:10px; background:#1b5e20; color:#fff; font-size:0.92rem; font-weight:700; cursor:pointer;">Save</button>
          <button id="btnCancelThreeInOneEdit" type="button" style="flex:1; padding:10px 14px; border:1px solid #c8e6c9; border-radius:10px; background:#e8f5e9; color:#1b5e20; font-size:0.92rem; font-weight:700; cursor:pointer;">Cancel</button>
        </div>
      </div>
    `;
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) editModal.style.display = 'none';
    });
    document.body.appendChild(editModal);

    document.getElementById('editZhInput').addEventListener('input', () => onEditZhOrNumChange('zh'));
    document.getElementById('editStdInput').addEventListener('input', () => onEditZhOrNumChange('std'));
    document.getElementById('btnSaveThreeInOneEdit').addEventListener('click', saveThreeInOneEdit);
    document.getElementById('btnCancelThreeInOneEdit').addEventListener('click', () => {
      editModal.style.display = 'none';
    });
  }

  // 7. 去掉內容下面多餘的「漢字 (chkRowHz)」選項，並替換為「繁體中文 (Traditional Chinese)」與「簡體中文 (Simplified Chinese)」切換選項
  const hzChk = document.getElementById('chkRowHz');
  if (hzChk) {
    const hzLabel = hzChk.closest('label') || hzChk.parentElement;
    if (hzLabel && hzLabel.parentNode && !document.getElementById('chkTrad')) {
      const parentRow = hzLabel.parentNode;
      const lblTrad = document.createElement('label');
      lblTrad.style.cssText = hzLabel.style.cssText || 'display:inline-flex; align-items:center; gap:5px; cursor:pointer; user-select:none;';
      lblTrad.innerHTML = `<input type="checkbox" id="chkTrad" checked style="accent-color:#1b5e20; cursor:pointer;"> <span id="uiChkTrad">${currentLang === 'zh' ? '繁體中文' : 'Traditional Chinese'}</span>`;

      const lblSimp = document.createElement('label');
      lblSimp.style.cssText = hzLabel.style.cssText || 'display:inline-flex; align-items:center; gap:5px; cursor:pointer; user-select:none;';
      lblSimp.innerHTML = `<input type="checkbox" id="chkSimp" style="accent-color:#1b5e20; cursor:pointer;"> <span id="uiChkSimp">${currentLang === 'zh' ? '簡體中文' : 'Simplified Chinese'}</span>`;

      parentRow.insertBefore(lblTrad, hzLabel);
      parentRow.insertBefore(lblSimp, hzLabel);
      hzLabel.style.display = 'none';

      document.getElementById('chkTrad').addEventListener('change', () => switchScriptMode('trad'));
      document.getElementById('chkSimp').addEventListener('change', () => switchScriptMode('simp'));
    }
  }

  initOpenCCConverter();
  safeSetHtml('uiAuthorNoteText', UI_TEXT[currentLang].authorNote);
  refreshKeyBtnStyle();
  setVoiceLangMode(spokenLang);
  updateInputCharCounter();
}

// =========================================================================
// 0.05 自願留評（自動判斷 Chrome/Edge 商店）與多 App 分享（符合商店政策，不綁定功能鎖）
// =========================================================================
function getShareMessage() {
  return `Learn Chinese pronunciation effortlessly with English phonics! Use my referral code ${unlockState.myInviteCode} on Trees Pinyin: https://www.treespinyin.com`;
}

function handleRateUnlock() {
  safeSetText('rewardStatusMsg', '💛 Thank you for supporting Trees Pinyin!');
  window.open(getStoreReviewUrl(), '_blank', 'noopener,noreferrer');
}

function openShareAppModal() {
  const msg = getShareMessage();
  navigator.clipboard.writeText(msg).catch(() => {});
  safeSetText('rewardStatusMsg', `📋 Share link & referral code (${unlockState.myInviteCode}) copied!`);

  safeSetText('modalShareCode', unlockState.myInviteCode);
  const encMsg = encodeURIComponent(msg);
  const encUrl = encodeURIComponent('https://www.treespinyin.com');

  const wa = document.getElementById('shareWhatsApp');
  const ln = document.getElementById('shareLine');
  const zl = document.getElementById('shareZalo');
  const kk = document.getElementById('shareKakao');
  const tw = document.getElementById('shareTwitter');
  const fb = document.getElementById('shareFacebook');
  const tg = document.getElementById('shareTelegram');
  const em = document.getElementById('shareEmail');

  if (wa) wa.href = `https://api.whatsapp.com/send?text=${encMsg}`;
  if (ln) ln.href = `https://social-plugins.line.me/lineit/share?url=${encUrl}&text=${encMsg}`;
  if (zl) zl.href = 'https://chat.zalo.me/';
  if (kk) kk.href = `https://story.kakao.com/share?url=${encUrl}`;
  if (tw) tw.href = `https://twitter.com/intent/tweet?text=${encMsg}`;
  if (fb) fb.href = `https://www.facebook.com/sharer/sharer.php?u=${encUrl}`;
  if (tg) tg.href = `https://t.me/share/url?url=${encUrl}&text=${encMsg}`;
  if (em) em.href = `mailto:?subject=${encodeURIComponent('Learn Mandarin with Trees Pinyin')}&body=${encMsg}`;

  const shareModal = document.getElementById('shareAppModal');
  if (shareModal) shareModal.style.display = 'flex';
}

async function triggerNativeSystemShare() {
  const msg = getShareMessage();
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Trees Pinyin',
        text: msg,
        url: 'https://www.treespinyin.com'
      });
    } catch (e) {}
  } else {
    copyShareTextOnly();
  }
}

function copyShareTextOnly() {
  navigator.clipboard.writeText(getShareMessage()).catch(() => {});
  alert(currentLang === 'en'
    ? 'Copied! Paste it in WeChat, iMessage, or any app to share with friends.'
    : '已複製分享口令！請打開微信、iMessage 或任意 App 貼上發送給朋友。');
}

function handleActivateFriendCode() {
  const fInput = document.getElementById('friendCodeInput');
  const code = fInput ? fInput.value.trim().toUpperCase() : '';
  if (!code || !/^PIN[A-Z0-9]{4}$/.test(code)) {
    safeSetText('rewardStatusMsg', '⚠️ Please enter a valid 7-character referral code starting with PIN (e.g. PIN5A3D).');
    return;
  }
  safeSetText('rewardStatusMsg', `🎉 Friend code ${code} applied! Thank you for sharing Trees Pinyin!`);
}

function openStudioProModal() {
  const modal = document.getElementById('tpProModal');
  if (!modal) return;
  const isZh = (currentLang === 'zh');
  safeSetText('tpProModalTitle', isZh ? '💎 解鎖長文本與更高 AI 額度' : '💎 Unlock Longer Text & Higher AI Limits');
  safeSetHtml('tpProModalBody', isZh
    ? `<div style="margin-bottom:8px;"><b>選擇適合您的方式繼續：</b></div>
       <ul style="margin:0; padding-left:18px; display:flex; flex-direction:column; gap:5px;">
         <li><b>🔑 填入自有 API Key（免費）：</b>使用自己的 Google Gemini API Key，單次 AI 問答最高 <b>8,000 字</b>，消耗個人免費額度、不限次。</li>
         <li><b>💎 訂閱 Trees Pinyin Pro（免設定 Key）：</b>單次 AI 問答最高 <b>2,000 字</b>、長文翻譯最高 <b>15,000 字</b>，享有充裕的公平使用日/月額度，並解鎖全站繪本庫。</li>
       </ul>`
    : `<div style="margin-bottom:8px;"><b>Choose how you want to continue:</b></div>
       <ul style="margin:0; padding-left:18px; display:flex; flex-direction:column; gap:5px;">
         <li><b>🔑 Bring Your Own API Key (Free):</b> Add your own Google Gemini API Key for up to <b>8,000 chars</b> AI Q&amp;A &amp; unlimited daily use on your own quota.</li>
         <li><b>💎 Trees Pinyin Pro (No Key Setup):</b> Up to <b>2,000 chars</b> per AI reply, <b>15,000 chars</b> translation, generous Fair-Use daily/monthly quota, plus full Storybook Library access.</li>
       </ul>`);
  safeSetText('btnProOpenKeyModal', isZh ? '🔑 填入自己的 API Key' : '🔑 Use My Own API Key');
  safeSetText('btnProGoStories', isZh ? '💎 查看 Pro 訂閱方案 ↗' : '💎 Explore Pro Plan ↗');
  safeSetText('btnCloseProModal', isZh ? '關閉' : 'Close');
  modal.style.display = 'flex';
}

function updateInputCharCounter() {
  const inputEl = document.getElementById('userInput');
  const badgeBtn = document.getElementById('tpTierBadgeBtn');
  const counterEl = document.getElementById('tpCharCounterText');
  if (!badgeBtn && !counterEl) return;

  const tier = getActiveUserTier();
  const limits = TP_TIER_LIMITS[tier] || TP_TIER_LIMITS.free;
  const len = inputEl ? inputEl.value.trim().length : 0;
  const isZh = (currentLang === 'zh');

  if (badgeBtn) {
    badgeBtn.classList.remove('tier-byok', 'tier-pro');
    if (tier === 'byok') {
      badgeBtn.classList.add('tier-byok');
      badgeBtn.textContent = isZh
        ? `🔑 自有 API Key · AI 上限 ${limits.aiMaxChars.toLocaleString()} 字`
        : `🔑 Own API Key · AI up to ${limits.aiMaxChars.toLocaleString()} chars`;
    } else if (tier === 'pro') {
      badgeBtn.classList.add('tier-pro');
      badgeBtn.textContent = isZh
        ? `💎 Pro 會員 · AI ≤ ${limits.aiMaxChars.toLocaleString()} 字`
        : `💎 Pro Member · AI ≤ ${limits.aiMaxChars.toLocaleString()} chars`;
    } else {
      badgeBtn.textContent = isZh
        ? `🆓 免費池 · AI ≤ ${limits.aiMaxChars} 字 · 點此擴容`
        : `🆓 Free Pool · AI ≤ ${limits.aiMaxChars} chars · Upgrade / Add Key`;
    }
  }

  if (counterEl) {
    counterEl.classList.remove('warn', 'over');
    if (len === 0) {
      counterEl.textContent = isZh
        ? `0 / ${limits.aiMaxChars.toLocaleString()} 字（翻譯上限 ${limits.transMaxChars.toLocaleString()}）`
        : `0 / ${limits.aiMaxChars.toLocaleString()} (Translate ≤ ${limits.transMaxChars.toLocaleString()})`;
    } else if (len > limits.transMaxChars) {
      counterEl.classList.add('over');
      counterEl.textContent = isZh
        ? `${len.toLocaleString()} / ${limits.transMaxChars.toLocaleString()} 字（已超上限）`
        : `${len.toLocaleString()} / ${limits.transMaxChars.toLocaleString()} chars (Over limit)`;
    } else if (len > limits.aiMaxChars) {
      counterEl.classList.add('warn');
      counterEl.textContent = isZh
        ? `${len.toLocaleString()} 字 · 可用免費翻譯（AI 限 ${limits.aiMaxChars.toLocaleString()} 字）`
        : `${len.toLocaleString()} chars · Translate OK (AI limit ${limits.aiMaxChars.toLocaleString()})`;
    } else {
      counterEl.textContent = `${len.toLocaleString()} / ${limits.aiMaxChars.toLocaleString()}`;
    }
  }
}

function refreshKeyBtnStyle() {
  const btn = document.getElementById('uiKeyBtn');
  if (btn) {
    if (backupKey) {
      btn.style.borderColor = '#2e7d32';
      btn.style.color = '#1b5e20';
      btn.style.background = '#e8f5e9';
    } else {
      btn.style.borderColor = '';
      btn.style.color = '';
      btn.style.background = '';
    }
  }
  updateInputCharCounter();
}

// 智慧版本號降序演算法：自動適配未來 Gemini 4.0 / 5.0 與新一代 Gemma，永遠免改程式碼！
async function discoverAuthorizedModels(key) {
  if (!key) return availableFastModels;
  const cleanKey = key.replace(/\s+/g, '');
  if (modelsDiscoveredForKey === cleanKey && availableFastModels.length > 0) {
    return availableFastModels;
  }
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`);
    if (!r.ok) return availableFastModels;
    const data = await r.json();
    const validModels = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .filter(n => !/tts|image|imagen|embedding|veo|robotics|aqa|bison|gecko|thinking|exp|preview|1\.5-|2\.0-/i.test(n));

    const versionedFlash = validModels
      .filter(n => /^gemini-\d+(\.\d+)?-flash$/i.test(n))
      .sort((a, b) => {
        const vA = parseFloat(a.match(/gemini-(\d+(?:\.\d+)?)/i)?.[1] || '0');
        const vB = parseFloat(b.match(/gemini-(\d+(?:\.\d+)?)/i)?.[1] || '0');
        return vB - vA;
      });

    const versionedFlashLite = validModels
      .filter(n => /^gemini-\d+(\.\d+)?-flash-lite$/i.test(n))
      .sort((a, b) => {
        const vA = parseFloat(a.match(/gemini-(\d+(?:\.\d+)?)/i)?.[1] || '0');
        const vB = parseFloat(b.match(/gemini-(\d+(?:\.\d+)?)/i)?.[1] || '0');
        return vB - vA;
      });

    const versionedGemma = validModels
      .filter(n => /^gemma-\d+-27b-it$/i.test(n))
      .sort((a, b) => {
        const vA = parseFloat(a.match(/gemma-(\d+)/i)?.[1] || '0');
        const vB = parseFloat(b.match(/gemma-(\d+)/i)?.[1] || '0');
        return vB - vA;
      });

    // 還原最穩最快的配額順序：Flash-Lite 優先（免費配額最大、1秒秒回）-> Full Flash -> 實際授權的 Gemma 27B
    const sorted = [];
    const addUniq = (m) => { if (m && !sorted.includes(m)) sorted.push(m); };
    if (validModels.includes('gemini-flash-lite-latest')) addUniq('gemini-flash-lite-latest');
    versionedFlashLite.forEach(addUniq);
    if (validModels.includes('gemini-flash-latest')) addUniq('gemini-flash-latest');
    versionedFlash.forEach(addUniq);
    versionedGemma.forEach(addUniq);

    if (sorted.length > 0) {
      availableFastModels = sorted;
      modelsDiscoveredForKey = cleanKey;
      try {
        localStorage.setItem('tp_v18_discovered_models', JSON.stringify({
          key: cleanKey,
          ts: Date.now(),
          models: sorted
        }));
      } catch (e) {}
    }
    return availableFastModels;
  } catch (e) {
    return availableFastModels;
  }
}

async function discoverFastModels(key) {
  return discoverAuthorizedModels(key);
}

function openStudioKeyModal() {
  const modal = document.getElementById('studioKeyModal');
  const input = document.getElementById('studioApiKeyInput');
  const st = document.getElementById('studioKeyTestStatus');
  if (input) input.value = backupKey;
  if (st) st.style.display = 'none';
  if (modal) modal.style.display = 'flex';
}

async function saveStudioBackupKey() {
  const input = document.getElementById('studioApiKeyInput');
  const rawVal = ((input ? input.value : '') || '').replace(/\s+/g, '');
  const st = document.getElementById('studioKeyTestStatus');
  if (st) st.style.display = 'block';

  if (!rawVal) {
    clearStudioBackupKey();
    if (st) st.textContent = 'Cleared.';
    return;
  }

  if (st) {
    st.style.color = '#1e40af';
    st.textContent = '🔍 Verifying Key with Google AI Studio...';
  }

  backupKey = rawVal;
  modelsDiscoveredForKey = '';
  try {
    localStorage.setItem('tp_v22_backup_key', backupKey);
    localStorage.setItem('tp_test_gemini_key', backupKey);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      // 統一寫入 geminiApiKey 與 userAiKey，讓 background.js 網頁/YouTube 翻譯同步生效
      chrome.storage.sync.set({ geminiApiKey: backupKey, userAiKey: backupKey });
    }
  } catch (e) {}
  refreshKeyBtnStyle();

  if (!isGoogleGeminiKey(backupKey)) {
    if (st) {
      st.style.color = '#166534';
      st.textContent = '✅ OpenAI / DeepSeek compatible API Key saved!';
    }
    setTimeout(() => {
      const modal = document.getElementById('studioKeyModal');
      if (modal) modal.style.display = 'none';
    }, 600);
    return;
  }

  const models = await discoverAuthorizedModels(backupKey);
  if (modelsDiscoveredForKey === backupKey && models.length > 0) {
    if (st) {
      st.style.color = '#166534';
      st.textContent = `✅ Key Verified! Active models: ${models.slice(0, 3).join(', ')}`;
    }
    setTimeout(() => {
      const modal = document.getElementById('studioKeyModal');
      if (modal) modal.style.display = 'none';
      const pendingQ = (document.getElementById('userInput')?.value || '').trim() || lastFailedAiQuestion;
      if (pendingQ) {
        lastFailedAiQuestion = '';
        lastSubmittedQuery = '';
        runSmartAI(pendingQ);
      }
    }, 450);
  } else {
    if (st) {
      st.style.color = '#b91c1c';
      st.textContent = '⚠️ Could not verify key (check if key is valid or network blocks googleapis.com).';
    }
  }
}

function clearStudioBackupKey() {
  backupKey = '';
  modelsDiscoveredForKey = '';
  try {
    localStorage.removeItem('tp_v22_backup_key');
    localStorage.removeItem('tp_test_gemini_key');
    localStorage.removeItem('tp_v15_discovered_models');
    localStorage.removeItem('tp_v17_discovered_models');
    localStorage.removeItem('tp_v18_discovered_models');
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ geminiApiKey: '', userAiKey: '' });
    }
  } catch (e) {}
  const input = document.getElementById('studioApiKeyInput');
  const st = document.getElementById('studioKeyTestStatus');
  if (input) input.value = '';
  if (st) st.style.display = 'none';
  refreshKeyBtnStyle();
}



function nextPaintTick() {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 10)));
}

// 預設鎖定台灣國語女聲 (Meijia / HsiaoChen / Google 國語（臺灣） / zh-TW)
let selectedVoiceObj = null;
function initSilentFemaleVoice() {
  if (!('speechSynthesis' in window)) return;
  if (window.TreesTextUtils && typeof window.TreesTextUtils.pickTaiwanFemaleVoice === 'function') {
    const picked = window.TreesTextUtils.pickTaiwanFemaleVoice();
    if (picked) {
      selectedVoiceObj = picked;
      return;
    }
  }
  const all = window.speechSynthesis.getVoices();
  const tw = all.find(v => /zh[-_]?tw|cmn[-_]?tw/i.test(v.lang || '') || /meijia|hsiaochen|國語/i.test(v.name || ''));
  if (tw) selectedVoiceObj = tw;
}
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = initSilentFemaleVoice;
  setTimeout(initSilentFemaleVoice, 200);
}

let lastSpeakTime = 0;
let lastSpeakTxt = '';

function speakNativeBrowserTTS(text) {
  if (!('speechSynthesis' in window) || !text) return;
  const now = Date.now();
  // 250ms 防重影鎖：防止點擊或觸控事件瞬間重複觸發兩次發音
  if (text === lastSpeakTxt && (now - lastSpeakTime < 250)) return;
  lastSpeakTime = now;
  lastSpeakTxt = text;

  window.speechSynthesis.cancel();
  if (!selectedVoiceObj) initSilentFemaleVoice();
  const utter = new SpeechSynthesisUtterance(text);
  if (selectedVoiceObj) {
    utter.voice = selectedVoiceObj;
    utter.lang = selectedVoiceObj.lang;
  } else {
    utter.lang = 'zh-TW';
  }
  utter.rate = 0.86;
  utter.pitch = 1.05;
  window.speechSynthesis.speak(utter);
}

function speakSingleOrSentence(text) {
  if (!text) return;
  if (checkAndRemindProfanity(text)) return;
  // 統一使用純淨原生女聲，不再走 translate_tts 雙重混音迴路，徹底消除錄影時的重複回音
  speakNativeBrowserTTS(text);
}

