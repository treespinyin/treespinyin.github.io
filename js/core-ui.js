/**
 * 模組 1: js/core-ui.js
 * 負責：全域端點配置、OpenCC 繁簡轉換、清晰國語女聲 TTS、中英雙語介面切換、Google Docs 連結提取與劃詞彈窗
 */
// =========================================================================
// 0. 全域配置與 Cloudflare Worker 端點
// =========================================================================
const IS_LOCAL_FILE = window.location.protocol === 'file:';
const CF_WORKER_ENDPOINTS = IS_LOCAL_FILE
  ? ['https://treespinyin-api.treespinyin.workers.dev', 'https://treespinyin.com/api']
  : ['https://treespinyin-api.treespinyin.workers.dev', '/api', 'https://treespinyin.com/api'];

const CHROME_STORE_REVIEW_URL = 'https://chromewebstore.google.com/detail/trees-pinyin-universal-an/jlbjllgeebmhkdcgmcnlkbcaiobpheae/reviews';
const EDGE_STORE_REVIEW_URL = 'https://microsoftedge.microsoft.com/addons/detail/egmgaoogonmldicgbkpaofjffcdlcffm';

function getStoreReviewUrl() {
  return /Edg\//i.test(navigator.userAgent) ? EDGE_STORE_REVIEW_URL : CHROME_STORE_REVIEW_URL;
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('pwaDirectInstallBtn');
  if (btn) btn.style.display = 'inline-flex';
});

async function triggerNativePWAInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('installModal').style.display = 'none';
}

(function injectManifestWithIconPng() {
  try {
    if (IS_LOCAL_FILE) return;
    const iconUrl = window.location.origin + '/icon.png?v=3';
    const manifest = {
      name: "Trees Pinyin",
      short_name: "Trees Pinyin",
      start_url: window.location.pathname || "/",
      display: "standalone",
      background_color: "#f5f7f9",
      theme_color: "#1b5e20",
      icons: [
        { src: iconUrl, sizes: "192x192", type: "image/png" },
        { src: iconUrl, sizes: "512x512", type: "image/png" }
      ]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = URL.createObjectURL(blob);
    document.head.appendChild(link);
  } catch (e) {}
})();

// Enter 鍵直通 AI 回答 (若貼的是 Google Docs 連結則直接翻譯注音)
document.getElementById('userInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    const val = (this.value || '').trim();
    if (/docs\.google\.com\/|drive\.google\.com\//i.test(val)) {
      runDirectTranslate(val);
    } else {
      runSmartAI();
    }
  }
});

const PROFANITY_EN_REGEX = /\b(fuck|fucking|fucked|fucker|motherfucker|shit|shitty|bullshit|bitch|bitches|asshole|bastard|dick|cock|pussy|cunt|whore|slut|nigger|nigga|faggot|retard)\b/i;
const PROFANITY_ZH_LIST = ['他媽的','他妈的','你媽的','你妈的','操你','肏你','草泥馬','草泥马','傻逼','煞筆','傻B','去死吧','王八蛋','賤人','贱人','婊子','媽的','妈的'];

function checkAndWarnProfanity(text) {
  if (!text) return false;
  if (PROFANITY_EN_REGEX.test(text) || PROFANITY_ZH_LIST.some(w => text.includes(w))) {
    const replyBox = document.getElementById('aiReplyBox');
    const list = document.getElementById('annotationList');
    if (replyBox && list) {
      replyBox.className = 'ai-reply-box friendly-reminder';
      replyBox.style.display = 'block';
      replyBox.innerHTML = '🌱 <b>Friendly Reminder / 友情提醒：</b> Let\'s keep our language kind and respectful! / 請使用文明禮貌的語言提問喔！';
      list.innerHTML = '';
      appendSentenceProgressive('請使用文明禮貌的語言，我們一起快樂學中文！', 'Please use polite and kind language as we learn Mandarin together!');
    } else {
      document.getElementById('profanityModal').style.display = 'flex';
    }
    return true;
  }
  return false;
}

// =========================================================================
// 0.1 OpenCC 全字庫繁體/簡體轉換
// =========================================================================
let openccToSimp = null;
let openccToTrad = null;
try {
  if (window.OpenCC) {
    openccToSimp = window.OpenCC.Converter({ from: 'tw', to: 'cn' });
    openccToTrad = window.OpenCC.Converter({ from: 'cn', to: 'tw' });
  }
} catch (e) {}

let currentScriptMode = 'trad';

function convertScript(str, mode = currentScriptMode) {
  if (!str) return '';
  if (mode === 'simp') return openccToSimp ? openccToSimp(str) : str;
  return openccToTrad ? openccToTrad(str) : str;
}

function switchScriptMode(mode) {
  const chkTrad = document.getElementById('chkTrad');
  const chkSimp = document.getElementById('chkSimp');
  if (mode === 'trad' && chkTrad.checked) {
    chkSimp.checked = false;
    currentScriptMode = 'trad';
  } else if (mode === 'simp' && chkSimp.checked) {
    chkTrad.checked = false;
    currentScriptMode = 'simp';
  }
  updateRowVisibility();
  document.querySelectorAll('.tp-zh').forEach(el => {
    const raw = el.dataset.raw || el.innerText;
    el.dataset.raw = raw;
    el.innerText = convertScript(raw, currentScriptMode);
  });
  renderMnemonicsPack();
}

function updateRowVisibility() {
  const card = document.getElementById('sheetCard');
  const studioTop = document.getElementById('studioTopPane');
  const hideZh = !document.getElementById('chkTrad').checked && !document.getElementById('chkSimp').checked;
  [card, studioTop].forEach(el => {
    if (!el) return;
    el.classList.toggle('hide-en', !document.getElementById('chkEn').checked);
    el.classList.toggle('hide-tp', !document.getElementById('chkTp').checked);
    el.classList.toggle('hide-std', !document.getElementById('chkStd').checked);
    el.classList.toggle('hide-zh', hideZh);
  });
}

// =========================================================================
// 0.2 預設鎖定清晰國語女聲 + 錄影期間將電腦朗讀聲混入影片音軌
// =========================================================================
let selectedVoiceObj = null;
let studioAudioCtx = null;
let studioAudioDest = null;

function initSilentFemaleVoice() {
  if (!('speechSynthesis' in window)) return;
  const all = window.speechSynthesis.getVoices();
  const zhAll = all.filter(v => /zh|cmn|chi/i.test(v.lang) || /chinese|mandarin|taiwan|hong kong/i.test(v.name));
  const maleKeywords = ['male', 'kangkang', 'yunxi', 'yunjian', 'yunyang', 'danny', 'wanlung'];
  let females = zhAll.filter(v => !maleKeywords.some(m => v.name.toLowerCase().includes(m)));
  if (females.length === 0) females = zhAll;

  const priorityOrder = ['meijia', 'hsiaochen', 'xiaoxiao', 'ting-ting', 'tingting', 'google 國語', 'google 普通話', 'sin-ji', 'female'];
  females.sort((a, b) => {
    const aScore = priorityOrder.findIndex(k => a.name.toLowerCase().includes(k));
    const bScore = priorityOrder.findIndex(k => b.name.toLowerCase().includes(k));
    return (aScore === -1 ? 99 : aScore) - (bScore === -1 ? 99 : bScore);
  });

  if (females.length > 0) selectedVoiceObj = females[0];
}
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = initSilentFemaleVoice;
  setTimeout(initSilentFemaleVoice, 200);
}

function speakSingleChar(text) {
  if (!text) return;
  if (checkAndWarnProfanity(text)) return;

  if (studioRecorder && studioRecorder.state === 'recording' && studioAudioCtx && studioAudioDest) {
    try {
      const ttsAudio = new Audio(`https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=zh-TW&q=${encodeURIComponent(text.slice(0, 100))}`);
      ttsAudio.crossOrigin = 'anonymous';
      const srcNode = studioAudioCtx.createMediaElementSource(ttsAudio);
      srcNode.connect(studioAudioDest);
      srcNode.connect(studioAudioCtx.destination);
      ttsAudio.play().catch(() => speakNativeBrowserTTS(text));
      return;
    } catch (e) {}
  }
  speakNativeBrowserTTS(text);
}

function speakNativeBrowserTTS(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  if (!selectedVoiceObj) initSilentFemaleVoice();
  const u = new SpeechSynthesisUtterance(text);
  if (selectedVoiceObj) {
    u.voice = selectedVoiceObj;
    u.lang = selectedVoiceObj.lang;
  } else {
    u.lang = 'zh-TW';
  }
  u.rate = 0.86;
  u.pitch = 1.1;
  window.speechSynthesis.speak(u);
}

// =========================================================================
// 0.3 中英文雙語介面切換
// =========================================================================
let currentLang = 'en';

const UI_TEXT = {
  en: {
    moreRes: "📚 More Resources",
    menuWorkspace: "✨ AI Translator",
    menuCards: " Mnemonics",
    menuLog: "📊 Study Log",
    menuAbout: "📖 About & Rules",
    menuGames: "🎮 Mini Games",
    menuContact: "✉️ Contact",
    langBtn: "中文",
    installBtnText: "Install",
    loginBtnText: "👨‍🏫 Login",
    loginStudent: "🌱 Student",
    loginTeacher: "👩‍🏫 Teacher",
    placeholder: "Ask AI any question, or enter/paste/drag text, PDF, Word, Google Docs link, or photo to translate...",
    aiBtn: "✨ AI Reply & Pinyin",
    transBtn: "📝 Translate & Pinyin",
    speakBtn: "🔊 Speak",
    stopSpeakBtn: "⏹️ Stop",
    disclaimer: '<b>Tip:</b> Trees Pinyin focuses on intuitive Mandarin speaking, rather than AI Q&A (which is a bit beyond my solo capacity right now!). For the best experience, simply plug in your own free Gemini API key or paste your text directly. The author assumes no liability for the accuracy. Your support and shares will help me go full-time to make improvements and write a memory dictionary in the future!',
    layoutBtn: "📐 Layout ▾",
    printBtn: "🖨️ Print",
    recordBtn: "🎬 Record Video",
    chkTrad: "Traditional Chinese",
    chkSimp: "Simplified Chinese",
    fileMenuTitle: "📁 File & Cloud Options",
    cloudLinkLabel: "🔗 Open Google Docs / Drive Link",
    optCloudTitle: "📄 Upload File (PDF / Word / Docs / TXT)",
    optCloudSub: "100% Client-side instant extraction & Pinyin",
    optCamTitle: "📷 Camera & Photo Library",
    optCamSub: "Recognize text or objects from photos"
  },
  zh: {
    moreRes: "📚 更多資源",
    menuWorkspace: "✨ AI 翻譯工作台",
    menuCards: "🧠 記憶閃卡",
    menuLog: "📊 學習記錄",
    menuAbout: "📖 關於與規則",
    menuGames: "🎮 趣味小遊戲",
    menuContact: "✉️ 聯絡我們",
    langBtn: "English",
    installBtnText: "安裝",
    loginBtnText: "👨‍🏫 登錄",
    loginStudent: "🌱 學生端",
    loginTeacher: "👩‍🏫 教師端",
    placeholder: "向 AI 提問，或輸入/貼上/拖入文字、PDF、Word、Google Docs 連結或照片直接翻譯注音...",
    aiBtn: "✨ AI 回答並注音",
    transBtn: "📝 翻譯並注音",
    speakBtn: "🔊 朗讀",
    stopSpeakBtn: "⏹️ 停止",
    disclaimer: '<b>提示：</b>為獲得最佳體驗，建議使用您自己的免費 Gemini API Key 或直接貼上文字。也可切換至免 Key 手機網頁版 <a href="https://www.treespinyin.com/app" target="_blank" style="color: var(--accent); font-weight: 700; text-decoration: underline;">www.treespinyin.com/app</a>（受 API 限制可能較慢）。作者對拼音結果準確性不承擔法律責任。您的支持與分享將幫助作者全職投入改進與編寫記憶字典！',
    layoutBtn: "📐 排版 ▾",
    printBtn: "🖨️ 列印",
    recordBtn: "🎬 錄製影片",
    chkTrad: "繁體中文",
    chkSimp: "簡體中文",
    fileMenuTitle: "📁 文件與網盤選單",
    cloudLinkLabel: "🔗 輸入 Google Docs / 網盤連結打開",
    optCloudTitle: "📄 上傳文件 (PDF / Word / Docs / TXT)",
    optCloudSub: "100% 用戶端本地秒讀提取文字",
    optCamTitle: "📷 拍照或從圖庫選圖",
    optCamSub: "識別照片中的短文字、菜單或單個物品"
  }
};

function toggleLang() {
  currentLang = currentLang === 'en' ? 'zh' : 'en';
  const t = UI_TEXT[currentLang];
  document.getElementById('uiMoreRes').innerText = t.moreRes;
  document.getElementById('uiMenuWorkspace').innerText = t.menuWorkspace;
  document.getElementById('uiMenuCards').innerText = t.menuCards;
  document.getElementById('uiMenuLog').innerText = t.menuLog;
  document.getElementById('uiMenuAbout').innerText = t.menuAbout;
  document.getElementById('uiMenuGames').innerText = t.menuGames;
  document.getElementById('uiMenuContact').innerText = t.menuContact;
  document.getElementById('uiLangBtn').innerText = t.langBtn;
  document.getElementById('uiInstallBtnText').innerText = t.installBtnText;
  document.getElementById('uiLoginBtnText').innerText = t.loginBtnText;
  document.getElementById('uiLoginStudent').innerText = t.loginStudent;
  document.getElementById('uiLoginTeacher').innerText = t.loginTeacher;
  document.getElementById('userInput').placeholder = t.placeholder;
  document.getElementById('uiAIBtn').innerText = t.aiBtn;
  document.getElementById('uiTransBtn').innerText = t.transBtn;
  if (!isSpeakingNow) document.getElementById('speakBtn').innerText = t.speakBtn;
  document.getElementById('uiDisclaimer').innerHTML = t.disclaimer;
  document.getElementById('uiLayoutBtn').innerText = t.layoutBtn;
  document.getElementById('uiPrintBtn').innerText = t.printBtn;
  document.getElementById('uiRecordBtn').innerText = t.recordBtn;
  document.getElementById('uiChkTrad').innerText = t.chkTrad;
  document.getElementById('uiChkSimp').innerText = t.chkSimp;
  document.getElementById('uiFileMenuTitle').innerText = t.fileMenuTitle;
  document.getElementById('uiCloudLinkLabel').innerText = t.cloudLinkLabel;
  document.getElementById('uiOptCloudTitle').innerText = t.optCloudTitle;
  document.getElementById('uiOptCloudSub').innerText = t.optCloudSub;
  document.getElementById('uiOptCamTitle').innerText = t.optCamTitle;
  document.getElementById('uiOptCamSub').innerText = t.optCamSub;
}

function toggleDropdown(id, e) {
  e.stopPropagation();
  document.querySelectorAll('.dropdown').forEach(d => { if (d.id !== id) d.classList.remove('open'); });
  document.getElementById(id).classList.toggle('open');
}
document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
});

function switchMainTab(tabName) {
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
  document.getElementById('panel-workspace').classList.toggle('hidden', tabName !== 'workspace');
  document.getElementById('panel-mnemonics').classList.toggle('hidden', tabName !== 'mnemonics');
  document.getElementById('panel-studylog').classList.toggle('hidden', tabName !== 'studylog');
  if (tabName === 'mnemonics') renderMnemonicsPack();
  if (tabName === 'studylog') renderPersonalStudyLog();
}

// =========================================================================
// 1. ☁️ Google Docs / Drive 連結讀取
// =========================================================================
async function openCloudUrlFromModal() {
  const link = (document.getElementById('cloudUrlModalInput').value || '').trim();
  if (!link) return;
  document.getElementById('fileMenuModal').style.display = 'none';
  document.getElementById('userInput').value = link;
  await runDirectTranslate(link);
}

async function fetchCloudDocumentByUrl(rawUrl) {
  const gdocMatch = rawUrl.match(/https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (gdocMatch) {
    const docId = gdocMatch[1];
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const candidates = [
      exportUrl,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(exportUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(exportUrl)}`
    ];
    for (const u of candidates) {
      try {
        const r = await fetchWithTimeout(u, {}, 6500);
        if (r.ok) {
          const txt = (await r.text()).trim();
          if (txt && !txt.startsWith('<!DOCTYPE html>') && !txt.includes('<html')) return txt;
        }
      } catch (e) {}
    }
  }

  const gdriveMatch = rawUrl.match(/https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gdriveMatch) {
    const fileId = gdriveMatch[1];
    const dlUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const candidates = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(dlUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(dlUrl)}`
    ];
    for (const u of candidates) {
      try {
        const r = await fetchWithTimeout(u, {}, 6500);
        if (r.ok) {
          const txt = (await r.text()).trim();
          if (txt && !txt.startsWith('<!DOCTYPE html>')) return txt;
        }
      } catch (e) {}
    }
  }
  return '';
}

// =========================================================================
// 2. 🟢 劃詞僅顯示 icon.png ➔ 點擊彈出獨立小顯示框
// =========================================================================
let selectedPageText = '';
let popoverZhText = '';
let popoverEnText = '';
const iconOnlyBtn = document.getElementById('selectionIconOnly');
const miniPopover = document.getElementById('selectionMiniPopover');

function handleTextSelectionCheck(e) {
  if (iconOnlyBtn.contains(e.target) || miniPopover.contains(e.target)) return;
  setTimeout(() => {
    const sel = window.getSelection();
    const text = (sel ? sel.toString() : '').trim();
    if (text && text.length >= 1 && text.length <= 600) {
      selectedPageText = text;
      let rect = { left: 100, top: 100, width: 40 };
      try {
        if (sel.rangeCount > 0) rect = sel.getRangeAt(0).getBoundingClientRect();
      } catch (err) {}
      const leftPos = (rect.left || e.clientX || 120) + window.scrollX + ((rect.width || 20) / 2) - 18;
      const topPos = (rect.top || e.clientY || 120) + window.scrollY - 42;
      iconOnlyBtn.style.left = Math.max(12, Math.min(window.innerWidth - 52, leftPos)) + 'px';
      iconOnlyBtn.style.top = Math.max(10, topPos) + 'px';
      iconOnlyBtn.style.display = 'block';
      miniPopover.style.display = 'none';
    } else {
      iconOnlyBtn.style.display = 'none';
    }
  }, 25);
}

document.addEventListener('mouseup', handleTextSelectionCheck);
document.addEventListener('touchend', handleTextSelectionCheck);

async function openSelectionMiniPopover(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!selectedPageText) return;
  if (checkAndWarnProfanity(selectedPageText)) {
    iconOnlyBtn.style.display = 'none';
    return;
  }

  const rect = iconOnlyBtn.getBoundingClientRect();
  iconOnlyBtn.style.display = 'none';

  miniPopover.style.left = Math.max(12, Math.min(window.innerWidth - 455, rect.left + window.scrollX - 180)) + 'px';
  miniPopover.style.top = Math.max(12, rect.top + window.scrollY + 8) + 'px';
  miniPopover.style.display = 'flex';

  const body = document.getElementById('popoverAnnotationBody');
  body.innerHTML = `<div style="font-size:0.84rem; color:#666;">⚡ ...</div>`;

  const hasZh = /[\u4e00-\u9fa5]/.test(selectedPageText);
  if (hasZh) {
    popoverZhText = convertScript(expandNumbersAndSymbolsToZh(selectedPageText), 'trad');
    popoverEnText = await translateFast(popoverZhText, 'zh', 'en');
  } else {
    popoverEnText = selectedPageText;
    const rawZh = await translateFast(selectedPageText, 'en', 'zh');
    popoverZhText = convertScript(expandNumbersAndSymbolsToZh(rawZh), 'trad');
  }

  body.innerHTML = '';
  appendSentenceProgressive(popoverZhText, popoverEnText, 'popoverAnnotationBody');
}

function closeSelectionMiniPopover() {
  miniPopover.style.display = 'none';
}

function speakPopoverContent() {
  if (popoverZhText) speakSingleChar(popoverZhText);
}

async function printPopoverContent() {
  closeSelectionMiniPopover();
  switchMainTab('workspace');
  document.getElementById('userInput').value = `${popoverZhText} ||| ${popoverEnText}`;
  await runDirectTranslate(`${popoverZhText} ||| ${popoverEnText}`);
  setTimeout(() => window.print(), 300);
}
