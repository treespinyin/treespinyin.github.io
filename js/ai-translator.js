/**
 * 模組 4: js/ai-translator.js
 * 負責：v15.0 商業化免維護 AI 問答引擎 (Evergreen 動態別名、120條持久快取、四層容錯調度) 與雙向精準翻譯
 */
// =========================================================================
// 6. v15.0 商業化免維護 AI 問答引擎 (完全移植自 AI A&Q.html)
//    (1) 永久動態別名置頂 ('gemini-flash-latest')，0秒直連永不 404 過期
//    (2) 智慧版本號降序演算法，未來升級 Gemini 4.0 / 5.0 自動排入第一梯隊
//    (3) 跨重整持久快取 (LocalStorage + Memory Map + 內建名詩)，常見問題 0ms 秒回零消耗
//    (4) 防連點與併發序號鎖 (activeRequestSeq)，杜絕重複請求浪費額度
//    (5) 四層階梯容錯：個人Key ➔ Cloudflare池 ➔ Pollinations開源大模型 ➔ 雙語翻譯保底
// =========================================================================
const BUILTIN_QA_CACHE = {
  "咏鹅": "《詠鵝》唐・駱賓王 ||| Ode to the Goose by Luo Binwang\n鵝，鵝，鵝， ||| Goose, goose, goose,\n曲項向天歌。 ||| You bend your neck and sing to the sky.\n白毛浮綠水， ||| Your white feathers float on the emerald water,\n紅掌撥清波。 ||| Your red webbed feet paddle the clear waves.",
  "静夜思": "《靜夜思》唐・李白 ||| Quiet Night Thought by Li Bai\n床前明月光， ||| Before my bed, the bright moonlight shines,\n疑是地上霜。 ||| I wonder if it is frost upon the ground.\n舉頭望明月， ||| I raise my head to gaze at the bright moon,\n低頭思故鄉。 ||| And lower my head, longing for my hometown.",
  "春晓": "《春曉》唐・孟浩然 ||| Spring Morning by Meng Haoran\n春眠不覺曉， ||| In spring sleep, I am unaware of the dawn,\n處處聞啼鳥。 ||| Everywhere I hear the singing of birds.\n夜來風雨聲， ||| Last night came the sound of wind and rain,\n花落知多少。 ||| Who knows how many blossoms have fallen.",
  "登鹳雀楼": "《登鸛雀樓》唐・王之渙 ||| On the Stork Tower by Wang Zhihuan\n白日依山盡， ||| The white sun sets behind the mountains,\n黃河入海流。 ||| And the Yellow River flows into the sea.\n欲窮千里目， ||| To see a thousand miles further,\n更上一層樓。 ||| Climb one more story higher."
};

function normalizeCloudCacheKey(rawQ) {
  if (!rawQ) return '';
  const fixed = applyFuzzyVoiceCorrection(rawQ);
  return fixed
    .toLowerCase()
    .replace(/請背誦|请背诵|背誦|背诵|唐詩|唐诗|古詩|古诗/g, '')
    .replace(/[\s,.?!，。？！、：:；;《》〈〉"“”'‘’()（）]/g, '')
    .replace(/詠/g, '咏')
    .replace(/鵝/g, '鹅')
    .replace(/靜/g, '静')
    .replace(/曉/g, '晓')
    .replace(/鸛/g, '鹳')
    .replace(/樓/g, '楼')
    .slice(0, 120);
}

let backupKey = '';
try {
  backupKey = (localStorage.getItem('tp_v22_backup_key') || localStorage.getItem('tp_test_gemini_key') || '').trim();
} catch (e) {}

// 預設直接置頂 Google 官方永久動態別名 (Evergreen Aliases)，未探測前也 100% 零失誤命中最新模型！
let availableFastModels = [
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemma-3-27b-it'
];
let modelsDiscoveredForKey = '';

// 載入 24 小時內快取的模型清單（省去每次打開網頁重複請求 /models 目錄）
try {
  const cachedModelMeta = JSON.parse(localStorage.getItem('tp_v15_discovered_models') || 'null');
  if (cachedModelMeta && cachedModelMeta.key === backupKey && (Date.now() - cachedModelMeta.ts < 86400000) && Array.isArray(cachedModelMeta.models) && cachedModelMeta.models.length > 0) {
    availableFastModels = cachedModelMeta.models;
    modelsDiscoveredForKey = backupKey;
  }
} catch (e) {}

// 單用戶公共池免費使用次數統計：每滿 6 次溫馨提醒填入個人免費 Key，保護萬人公共池！
const FREE_PUBLIC_REMINDER_THRESHOLD = 6;
function getAndIncrementPublicUsage() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const savedDate = localStorage.getItem('tp_pub_usage_date') || '';
    let count = parseInt(localStorage.getItem('tp_pub_usage_count') || '0', 10);
    if (savedDate !== today) {
      count = 0;
      localStorage.setItem('tp_pub_usage_date', today);
    }
    count++;
    localStorage.setItem('tp_pub_usage_count', String(count));
    return count;
  } catch (e) {
    return 1;
  }
}

// 雙層快取（Memory Map + LocalStorage 持久化快取 120 條 + 內建名詩），重整頁面依然 0 毫秒極速秒回！
const PERSISTENT_CACHE_STORAGE_KEY = 'tp_v15_persistent_qa_cache';
const sessionDynamicCache = new Map();

(function loadPersistentCache() {
  for (const [k, v] of Object.entries(BUILTIN_QA_CACHE)) {
    sessionDynamicCache.set(k, v);
  }
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

function refreshKeyBtnStyle() {
  const btn = document.getElementById('uiKeyBtn');
  if (!btn) return;
  if (backupKey) btn.classList.add('has-key');
  else btn.classList.remove('has-key');
}
refreshKeyBtnStyle();

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

    const sorted = [];
    if (validModels.includes('gemini-flash-latest')) sorted.push('gemini-flash-latest');
    for (const m of versionedFlash) {
      if (!sorted.includes(m)) sorted.push(m);
    }
    if (validModels.includes('gemini-flash-lite-latest')) sorted.push('gemini-flash-lite-latest');
    for (const m of versionedFlashLite) {
      if (!sorted.includes(m)) sorted.push(m);
    }
    for (const m of versionedGemma) {
      if (!sorted.includes(m)) sorted.push(m);
    }

    if (sorted.length > 0) {
      availableFastModels = sorted;
      modelsDiscoveredForKey = cleanKey;
      try {
        localStorage.setItem('tp_v15_discovered_models', JSON.stringify({
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
if (backupKey && modelsDiscoveredForKey !== backupKey) {
  discoverAuthorizedModels(backupKey);
}

function fetchWithTimeout(url, options = {}, timeoutMs = 8500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// 支援純文字與圖片 Vision 識別的單模型呼叫器 (零思考延遲 thinkingBudget: 0)
async function callSingleGeminiModel(modelName, fullPromptText, activeKey, signal, dataUrl = null) {
  const cleanKey = activeKey.replace(/\s+/g, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(cleanKey)}`;

  const parts = [{ text: fullPromptText }];
  if (dataUrl && dataUrl.includes(',')) {
    const mime = dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';'));
    parts.push({ inline_data: { mime_type: mime, data: dataUrl.split(',')[1] } });
  }

  const isGemma = /gemma/i.test(modelName);
  const genConfig = isGemma
    ? { temperature: 0.1, maxOutputTokens: 1200 }
    : { temperature: 0.1, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: 0 } };

  let r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: genConfig
    }),
    signal
  });

  if (r.status === 400 && !isGemma) {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1200 }
      }),
      signal
    });
  }

  const d = await r.json();
  if (!r.ok) {
    const errMsg = d?.error?.message || `HTTP_${r.status}`;
    throw new Error(`[${modelName}: ${r.status}] ${errMsg}`);
  }

  const resParts = d?.candidates?.[0]?.content?.parts || [];
  const text = resParts
    .filter(p => !p.thought && typeof p.text === 'string')
    .map(p => p.text)
    .join('')
    .trim();

  if (!text) throw new Error(`[${modelName}] EMPTY_RESPONSE`);
  return text;
}

async function callKeylessFreeOpenSourceLLM(systemRules, userQuestion) {
  try {
    const r = await fetchWithTimeout('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai-fast',
        messages: [
          { role: 'system', content: systemRules },
          { role: 'user', content: userQuestion }
        ],
        temperature: 0.15
      })
    }, 8000);
    if (r.ok) {
      const d = await r.json();
      const txt = (d?.choices?.[0]?.message?.content || '').trim();
      if (txt) return txt;
    }
  } catch (e) {}
  return '';
}

// 商業化四層階梯容錯調度器 (同時相容三參數問答模式與舊版圖片/長文翻譯呼叫)
async function fetchFastAccurateAI(systemRulesOrPrompt, userQuestionOrDataUrl = '', cacheKeyForCloud = '') {
  let fullPromptText = '';
  let sysRules = '';
  let userQ = '';
  let dataUrl = null;
  let cacheKey = cacheKeyForCloud;

  if (typeof userQuestionOrDataUrl === 'string' && userQuestionOrDataUrl.startsWith('data:image')) {
    fullPromptText = systemRulesOrPrompt;
    dataUrl = userQuestionOrDataUrl;
  } else if (userQuestionOrDataUrl && typeof userQuestionOrDataUrl === 'string') {
    sysRules = systemRulesOrPrompt;
    userQ = userQuestionOrDataUrl;
    fullPromptText = `${sysRules}\n\nUser Question: "${userQ}"`;
  } else {
    fullPromptText = systemRulesOrPrompt;
    userQ = systemRulesOrPrompt;
  }

  // 0. 若本機持久/動態快取已存在此獨立問題的真 AI 回答，0 毫秒極速返回！
  if (!dataUrl && cacheKey && sessionDynamicCache.has(cacheKey)) {
    return { text: sessionDynamicCache.get(cacheKey), source: 'Instant Cache', diagError: null, usedPublicPool: false };
  }

  const modalKeyVal = (document.getElementById('apiKeyInput')?.value || '').trim();
  const activeKey = (backupKey || modalKeyVal).replace(/\s+/g, '');
  const errorLogs = [];

  // 1. 若有個人 Google API Key：優先走個人 Key（預設第一順位為永久動態別名 gemini-flash-latest）
  if (activeKey) {
    if (modelsDiscoveredForKey !== activeKey) {
      discoverAuthorizedModels(activeKey);
    }
    const modelsToTry = dataUrl
      ? availableFastModels.filter(m => !/gemma/i.test(m)).slice(0, 3)
      : availableFastModels.slice(0, 3);

    for (let i = 0; i < modelsToTry.length; i++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9500);
      try {
        const txt = await callSingleGeminiModel(modelsToTry[i], fullPromptText, activeKey, ctrl.signal, dataUrl);
        clearTimeout(timer);
        if (txt) {
          if (!dataUrl && cacheKey) saveAnswerToPersistentCache(cacheKey, txt);
          return { text: txt, source: `Google (${modelsToTry[i]})`, diagError: null, usedPublicPool: false };
        }
      } catch (e) {
        clearTimeout(timer);
        const isTimeout = e && (e.name === 'AbortError' || /aborted/i.test(e.message || ''));
        const msg = isTimeout ? `[${modelsToTry[i]}: Timeout]` : (e.message || String(e));
        errorLogs.push(msg);
        if (/API_KEY_INVALID|key not valid/i.test(msg)) {
          break;
        }
      }
    }
  }

  // 2. 走 Cloudflare Worker 全球邊緣免費快取與多 Key 輪詢池
  for (let i = 0; i < CF_WORKER_ENDPOINTS.length; i++) {
    try {
      const r = await fetchWithTimeout(CF_WORKER_ENDPOINTS[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPromptText,
          image: dataUrl,
          cacheKey: dataUrl ? '' : cacheKey
        })
      }, 15000);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const detail = d?.detail || d?.error || `HTTP ${r.status}`;
        errorLogs.push(`[Worker: ${detail}]`);
        continue;
      }
      const t = (d?.text || d?.reply || d?.choices?.[0]?.message?.content || '').trim();
      if (t) {
        if (!dataUrl && cacheKey) saveAnswerToPersistentCache(cacheKey, t);
        const isCacheHit = r.headers.get('X-Cache') === 'HIT';
        return { text: t, source: 'Cloudflare Global Pool', diagError: null, usedPublicPool: !isCacheHit };
      }
    } catch (e) {
      const isTimeout = e && (e.name === 'AbortError' || /aborted/i.test(e.message || ''));
      errorLogs.push(isTimeout ? '[Worker: Timeout]' : `[Worker: ${e.message || 'Network/CORS'}]`);
    }
  }

  // 3. 免 Key 免費開源大模型直連兜底 (僅限非圖片請求)
  if (!dataUrl) {
    const freeAiTxt = await callKeylessFreeOpenSourceLLM(sysRules || 'You are a helpful bilingual Mandarin assistant.', userQ);
    if (freeAiTxt) {
      if (cacheKey) saveAnswerToPersistentCache(cacheKey, freeAiTxt);
      return { text: freeAiTxt, source: 'Free Open-Source AI Backup', diagError: errorLogs.join(' | '), usedPublicPool: true };
    }
  }

  return { text: '', source: 'none', diagError: errorLogs.join(' | '), usedPublicPool: true };
}

async function translateFast(text, fromLang, toLang) {
  const isZhToEn = fromLang.startsWith('zh');
  const src = isZhToEn ? 'zh-CN' : 'en';
  const tgt = isZhToEn ? 'en' : 'zh-CN';

  const tasks = [
    fetchWithTimeout(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=${tgt}&dt=t&q=${encodeURIComponent(text)}`, {}, 4000)
      .then(r => r.json())
      .then(d => {
        const j = d?.[0]?.map(x => x[0]).join('');
        if (j && j.trim() && j.trim() !== text) return j.trim();
        throw new Error('empty');
      }),
    fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${tgt}`, {}, 4500)
      .then(r => r.json())
      .then(d => {
        const t = d?.responseData?.translatedText;
        if (t && !t.includes('MYMEMORY WARNING') && t.toLowerCase() !== text.toLowerCase()) return t.trim();
        throw new Error('empty');
      })
  ];

  try {
    return await Promise.any(tasks);
  } catch (e) {
    return text;
  }
}

function cleanChineseSentence(line) {
  if (!line) return '';
  let s = expandNumbersAndSymbolsToZh(line)
    .replace(/^[-*•\d.)、]+\s*/, '')
    .replace(/\*+/g, '')
    .replace(/\([^)]*[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ][^)]*\)/g, '')
    .replace(/（[^）]*[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ][^）]*）/g, '')
    .replace(/[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]{2,}/g, '')
    .replace(/([，。！？；：、,.!?;:])\s*[，。！？；：、,.!?;:]+/g, '$1')
    .replace(/^[，。！？；：、,.!?;:\s]+/, '')
    .replace(/\s+/g, '')
    .trim();
  return /[\u4e00-\u9fa5]/.test(s) ? s : '';
}

// 嚴格攔截 AI 的自言自語、思考過程、糾錯解釋
function isAIMetaChatterLine(line) {
  if (!line) return true;
  const metaPattern = /^(based on context|based on phonetics|based on the|the user input|speech recognition error|phonetic track|intended question|corrected input|user meant|here is the|sure,\s*here|note:|explanation:|analysis:|reasoning:|根據語音|根據上下文|語音識別錯誤|用戶本意|糾正後)/i;
  if (metaPattern.test(line.trim())) return true;
  if (/speech recognition error|phonetic disambiguation|homophone typo|acoustic track/i.test(line)) return true;
  return false;
}

function parseBilingualPairLine(rawLine) {
  const cleaned = rawLine.replace(/^[-*•\d.)、]+\s*/, '').replace(/\*+/g, '').trim();
  if (isAIMetaChatterLine(cleaned)) return null;

  let parts = null;
  if (cleaned.includes('|||')) {
    parts = cleaned.split('|||').map(p => p.trim()).filter(Boolean);
  } else if (cleaned.includes('｜｜｜')) {
    parts = cleaned.split('｜｜｜').map(p => p.trim()).filter(Boolean);
  } else if (cleaned.includes(' | ')) {
    parts = cleaned.split(' | ').map(p => p.trim()).filter(Boolean);
  }
  if (!parts || parts.length < 2) return null;

  let zhPart = '', enPart = '';
  if (/[\u4e00-\u9fa5]/.test(parts[0]) && !/[\u4e00-\u9fa5]/.test(parts[1])) {
    zhPart = cleanChineseSentence(parts[0]) || parts[0];
    enPart = parts[1];
  } else if (/[\u4e00-\u9fa5]/.test(parts[1])) {
    enPart = parts[0];
    zhPart = cleanChineseSentence(parts[1]) || parts[1];
  } else {
    zhPart = cleanChineseSentence(parts[0]) || parts[0];
    enPart = parts[1];
  }
  if (!/[\u4e00-\u9fa5]/.test(zhPart) || isAIMetaChatterLine(enPart) || isAIMetaChatterLine(zhPart)) return null;
  return { zh: zhPart, en: enPart };
}

// 智慧容錯渲染器：支援 [FIXED_INPUT] 回寫輸入框、攔截 AI 廢話、四位一體注音且無阻塞極速渲染
async function renderBilingualAIOutput(aiText) {
  const replyBox = document.getElementById('aiReplyBox');
  replyBox.style.display = 'none';
  const rawLines = aiText
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .split(/\r?\n+/)
    .map(l => l.trim())
    .filter(Boolean);
  if (rawLines.length === 0) return { ok: false, correctedQuery: '' };

  const seenExactZh = new Set();
  let renderedPairs = 0;
  let correctedQuery = '';

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];

    // 若 AI 第一行回傳了 [FIXED_INPUT]: 糾偏後的用戶真實問題，自動更新輸入框顯示並記住真實意圖
    const fixedMatch = rawLine.match(/^\[?FIXED_INPUT\]?\s*[:：]\s*(.+)$/i);
    if (fixedMatch) {
      correctedQuery = fixedMatch[1].replace(/^["'「『]|["'」』]$/g, '').trim();
      if (correctedQuery) {
        document.getElementById('userInput').value = correctedQuery;
      }
      continue;
    }

    if (isAIMetaChatterLine(rawLine)) continue;

    const pair = parseBilingualPairLine(rawLine);
    if (pair) {
      const key = pair.zh.replace(/[^\u4e00-\u9fa5]/g, '');
      if (!key || seenExactZh.has(key)) continue;
      seenExactZh.add(key);
      renderedPairs++;
      appendSentenceProgressive(pair.zh, pair.en);
      continue;
    }

    const lineStr = rawLine.replace(/^[-*•\d.)、]+\s*/, '').replace(/\*+/g, '').trim();
    if (!lineStr || isAIMetaChatterLine(lineStr)) continue;

    if (/[\u4e00-\u9fa5]/.test(lineStr)) {
      const parenMatch = lineStr.match(/^(.+?)\s*[(（]([A-Za-z][^）)]+)[)）]$/);
      let zhStr = '', enStr = '';
      if (parenMatch && /[\u4e00-\u9fa5]/.test(parenMatch[1])) {
        zhStr = cleanChineseSentence(parenMatch[1]) || parenMatch[1].trim();
        enStr = parenMatch[2].trim();
      } else {
        zhStr = cleanChineseSentence(lineStr) || lineStr;
        if (i + 1 < rawLines.length && !/[\u4e00-\u9fa5]/.test(rawLines[i + 1]) && /[A-Za-z]/.test(rawLines[i + 1]) && !rawLines[i + 1].includes('|||') && !isAIMetaChatterLine(rawLines[i + 1])) {
          enStr = rawLines[i + 1].replace(/^[-*•\d.)、]+\s*/, '').replace(/\*+/g, '').trim();
          i++;
        }
      }
      const key = zhStr.replace(/[^\u4e00-\u9fa5]/g, '');
      if (key && !seenExactZh.has(key)) {
        seenExactZh.add(key);
        renderedPairs++;
        appendSentenceProgressive(zhStr, enStr);
      }
    }
  }
  return { ok: renderedPairs > 0, correctedQuery };
}

// 防連點與併發請求序號鎖：避免短時間重複送出相同問題或舊請求覆蓋新畫面
let activeRequestSeq = 0;
let lastSubmittedQuery = '';
let lastSubmittedTime = 0;

async function runSmartAI(overrideInput, voiceAlts = [], fromVoice = false) {
  const q = applyFuzzyVoiceCorrection((overrideInput !== undefined ? overrideInput : document.getElementById('userInput').value).trim(), voiceAlts);
  const altsToUse = (Array.isArray(voiceAlts) && voiceAlts.length > 0) ? voiceAlts : latestVoiceCandidates;
  if (!q) return;

  if (/docs\.google\.com\/|drive\.google\.com\//i.test(q)) {
    return runDirectTranslate(q);
  }

  // 800ms 內對完全相同問題的連點直接攔截，防止誤觸消耗雙倍配額
  const now = Date.now();
  if (q === lastSubmittedQuery && (now - lastSubmittedTime < 800)) {
    return;
  }
  lastSubmittedQuery = q;
  lastSubmittedTime = now;

  const currentSeq = ++activeRequestSeq;
  document.getElementById('userInput').value = q;

  if (checkAndWarnProfanity(q)) return;

  document.getElementById('previewImg').style.display = 'none';
  const replyBox = document.getElementById('aiReplyBox');
  const list = document.getElementById('annotationList');
  replyBox.className = 'ai-reply-box';
  replyBox.style.display = 'block';
  replyBox.innerText = (currentLang === 'en' && spokenLang === 'en') ? '⚡ AI Thinking...' : '⚡ AI 正在極速思考...';
  list.innerHTML = '';

  const memoryContext = buildMemoryContextString();
  const acousticInfo = `[Speech Recognition Data] Selected Mode: ${spokenLang === 'en' ? 'EN' : '中文'} | Raw Transcript: "${q}" | ${getPhoneticTrackForAI(q)} | Alternative Speech Candidates: ${JSON.stringify(altsToUse)}`;

  const systemRules = [
    'You are a crisp, authoritative bilingual Mandarin scholar and AI assistant.',
    memoryContext,
    acousticInfo,
    '',
    'STRICT EXECUTION RULES (FOLLOW EXACTLY):',
    '1. SILENT PHONETIC & CONTEXT CORRECTION (NO META-CHATTER!):',
    '   - Speech recognition often produces homophone errors (e.g., "永和/泳鵝"->"詠鵝", "今夜思"->"靜夜思", "禮拜"->"李白", "路窄"->"鹿柴", "春笑"->"春曉", "敏農"->"憫農", or English phonetic words like "jing yes"->"靜夜思").',
    '   - Combine the Recent Conversation History + Acoustic Pinyin Track + Candidates to silently deduce what the user REALLY meant.',
    '   - NEVER output explanations like "Based on context and phonetics..." or "The user input is a speech recognition error"! ZERO meta-commentary!',
    '   - If the raw transcript had a speech recognition typo, output ONLY this tag on the very first line: [FIXED_INPUT]: Corrected_Question_Text',
    '2. POEMS, SONGS & CLASSICS (COMPLETE & PURE):',
    '   - When the user asks for ANY poem, classic, or lyric (or follows up asking for another poem by the same poet), output ONLY:',
    '     Line 1: 《詩詞名稱》朝代・作者 ||| English Title by Author',
    '     Line 2+: Every single verse of the FULL original text in exact order (一字不漏、完整全篇), one verse per line.',
    '   - DO NOT include background intro, appreciation, analysis, or extra chatter!',
    '3. GENERAL QUESTIONS & FOLLOW-UPS (CRISP & CONCISE):',
    '   - Use Recent Conversation History to resolve pronouns ("他", "這首", "第二句", "還有嗎", "why", "another one", "what does it mean").',
    '   - Answer directly and concisely in 1 to 3 crisp sentences. No filler or pleasantries.',
    '4. STRICT BILINGUAL LINE FORMAT:',
    '   - Every content line MUST use "|||":',
    '     Pure_Traditional_Chinese ||| Authentic_English',
    '   - Left side of "|||" must contain ONLY Traditional Chinese characters and Chinese punctuation (write numbers in Chinese characters; NO Pinyin or English letters on the left side).'
  ].filter(Boolean).join('\n');

  // 只要處於連續對話中 (conversationHistory.length > 0) 或帶有語音候選詞，強制結合上下文即時推理，不走靜態快取避免答非所問
  const cloudCacheKey = (conversationHistory.length === 0 && !fromVoice) ? normalizeCloudCacheKey(q) : '';
  const { text: aiText, source, diagError, usedPublicPool } = await fetchFastAccurateAI(systemRules, q, cloudCacheKey);

  // 若在等待期間用戶又發起了新問題，直接丟棄舊結果，防止畫面閃爍或句子疊加
  if (currentSeq !== activeRequestSeq) return;

  if (aiText) {
    const { ok, correctedQuery } = await renderBilingualAIOutput(aiText);
    if (ok) {
      if (correctedQuery && conversationHistory.length === 0) {
        saveAnswerToPersistentCache(normalizeCloudCacheKey(correctedQuery), aiText);
      }
      pushConversationMemory(correctedQuery || q, aiText);
      if (backupKey && diagError) {
        replyBox.className = 'ai-reply-box diag-info';
        replyBox.style.display = 'block';
        replyBox.innerText = `ℹ️ Answered via ${source} (Google Key Note: ${diagError.slice(0, 140)})`;
      } 
      
      return;
    }
  }

  // 4. 當所有 AI 通道皆無法連線時，給出原句雙語注音保底，絕不白屏或彈窗打斷！
  const hasZh = /[\u4e00-\u9fa5]/.test(q);
  if (hasZh) {
    const enTrans = await translateFast(q, 'zh', 'en');
    if (currentSeq !== activeRequestSeq) return;
    appendSentenceProgressive(q, enTrans);
  } else {
    const zhTrans = await translateFast(q, 'en', 'zh');
    if (currentSeq !== activeRequestSeq) return;
    appendSentenceProgressive(zhTrans, q);
  }

  replyBox.className = 'ai-reply-box friendly-reminder';
  replyBox.style.display = 'block';
  replyBox.innerHTML = diagError
    ? `🔍 API Note: ${diagError.slice(0, 160)} — Click <b>[🔑 API Key]</b> to add your free Gemini Key.`
    : (currentLang === 'en'
        ? `💡 High traffic on the free public channel! Plug in your own free Google Gemini API Key in <b>[🔑 API Key]</b> for unlimited instant responses.`
        : `💡 當前免費公共通道訪問量較大！請在右上角 <b>[🔑 API Key]</b> 填入您免費的個人 Google Gemini Key 享受極速通道。`);
}

async function runDirectTranslate(inputOverride) {
  let raw = (inputOverride !== undefined ? inputOverride : document.getElementById('userInput').value).trim();
  if (!raw) return;
  if (checkAndWarnProfanity(raw)) return;

  document.getElementById('previewImg').style.display = 'none';
  const replyBox = document.getElementById('aiReplyBox');
  replyBox.className = 'ai-reply-box';
  replyBox.style.display = 'none';
  const list = document.getElementById('annotationList');
  list.innerHTML = '';

  if (/docs\.google\.com\/document\/d\/|drive\.google\.com\/file\/d\//i.test(raw)) {
    replyBox.style.display = 'block';
    replyBox.innerText = '📄 Fetching Google Doc text...';
    const docText = await fetchCloudDocumentByUrl(raw);
    if (docText) {
      raw = docText.slice(0, 3500).trim();
      replyBox.style.display = 'none';
    } else {
      replyBox.innerText = '⚠️ Please make sure the Google Doc is shared as "Anyone with the link can view", or copy & paste the text directly.';
      return;
    }
  }

  if (backupKey && raw.length <= 1800) {
    replyBox.style.display = 'block';
    replyBox.innerText = currentLang === 'en' ? '⚡ Translating accurately...' : '⚡ 正在精準翻譯並注音...';

    const transPrompt = `Translate the following text sentence by sentence between Chinese and English.
CRITICAL RULES:
1. NEVER alter or re-translate the user's original text!
2. Output strictly one sentence pair per line in this exact format:
Chinese_Sentence ||| English_Sentence

Text to translate:
${raw}`;

    const { text: aiTrans } = await fetchFastAccurateAI(transPrompt);
    if (aiTrans && aiTrans.includes('|||')) {
      replyBox.style.display = 'none';
      const pairLines = aiTrans.split(/\n+/).map(l => l.trim()).filter(Boolean);
      let renderedCount = 0;
      for (const pl of pairLines) {
        const pair = parseBilingualPairLine(pl);
        if (pair) {
          renderedCount++;
          appendSentenceProgressive(pair.zh, pair.en);
          await nextPaintTick();
        }
      }
      if (renderedCount > 0) return;
    }
    replyBox.style.display = 'none';
  }

  const lines = raw.split(/\n+|(?<=[。！？.!?])\s*/).map(l => l.trim()).filter(Boolean);
  const enLinesToBatch = [];
  lines.forEach((line) => {
    if (!/[\u4e00-\u9fa5]/.test(line)) enLinesToBatch.push(line);
  });

  // 批量合併翻譯：將多句英文合併為單次請求，徹底避免長文觸發 429 封鎖且提速 5 倍
  let batchTranslatedZh = [];
  if (enLinesToBatch.length > 0) {
    const joinedEn = enLinesToBatch.join('\n');
    const joinedZh = await translateFast(joinedEn, 'en', 'zh');
    batchTranslatedZh = joinedZh.split(/\n+/).map(s => s.trim());
  }

  let enCursor = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/[\u4e00-\u9fa5]/.test(line)) {
      appendSentenceProgressive(line, '');
    } else {
      const zhTrans = batchTranslatedZh[enCursor] || (await translateFast(line, 'en', 'zh'));
      enCursor++;
      appendSentenceProgressive(zhTrans, line);
    }
    await nextPaintTick();
  }
}
