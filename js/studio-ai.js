/**
 * Trees Pinyin Studio — Module 5: AI Router, Classics DB Matcher & Translation Pipeline
 */
// =========================================================================
// 0.1 AIcapsule 連貫對話記憶、文明用語提醒、快取與四重真 AI 保底架構
// =========================================================================
const PROFANITY_EN_REGEX = /\b(fuck|fucking|fucked|fucker|motherfucker|shit|shitty|bullshit|bitch|bitches|asshole|bastard|dick|cock|pussy|cunt|whore|slut|nigger|nigga|faggot|retard)\b/i;
const PROFANITY_ZH_LIST = ['他媽的','他妈的','你媽的','你妈的','操你','肏你','草泥馬','草泥马','傻逼','煞筆','傻B','去死吧','王八蛋','賤人','贱人','婊子','媽的','妈的'];

function checkAndRemindProfanity(text) {
  if (!text) return false;
  if (PROFANITY_EN_REGEX.test(text) || PROFANITY_ZH_LIST.some(w => text.includes(w))) {
    const replyBox = document.getElementById('aiReplyBox');
    const container = document.getElementById('sentencesContainer');
    const limitBox = document.getElementById('apiLimitBox');
    if (limitBox) limitBox.style.display = 'none';
    if (replyBox) {
      replyBox.style.display = 'block';
      replyBox.innerHTML = '🌱 <b>Friendly Reminder / 友情提醒：</b> Let\'s keep our language kind and respectful! / 請使用文明禮貌的語言提問喔！';
    }
    if (container) container.innerHTML = '';
    appendSentenceProgressive('請使用文明禮貌的語言，我們一起快樂學中文！', 'Please use polite and kind language as we learn Mandarin together!');
    return true;
  }
  return false;
}

function pushConversationMemory(userQ, aiRawReply) {
  if (!userQ || !aiRawReply) return;
  // 只保留簡短主題摘要（不帶 ||| 與 " / " 單行拼接），避免模型模仿歷史格式把多句擠成同一行
  const compactReply = aiRawReply
    .split(/\r?\n+/)
    .map(l => l.split('|||')[0].replace(/^\[?FIXED_INPUT\]?\s*[:：]\s*/i, '').trim())
    .filter(Boolean)
    .slice(0, 4)
    .join('；')
    .slice(0, 180);
  conversationHistory.push({ q: userQ, a: compactReply });
  if (conversationHistory.length > MAX_MEMORY_TURNS) {
    conversationHistory.shift();
  }
  lastInteractionTime = Date.now();
}

function buildMemoryContextString() {
  if (conversationHistory.length === 0) return '';
  if (Date.now() - lastInteractionTime > 600000) {
    conversationHistory = [];
    return '';
  }
  const lines = conversationHistory.map((item, idx) => `Turn ${idx + 1} - User asked: "${item.q}" | AI answered: "${item.a}"`);
  return '\nRecent Conversation History:\n' + lines.join('\n');
}

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

function normalizeCloudCacheKey(rawQ) {
  if (!rawQ) return '';
  return 'v16_' + rawQ
    .toLowerCase()
    .replace(/[\s,.?!，。？！、：:；;《》〈〉"“”'‘’()（）]/g, '')
    .slice(0, 116);
}

function fetchWithTimeout(url, options = {}, timeoutMs = 8500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// 輔助函數：全方位讀取用戶已輸入的 API Key（相容彈窗、原生 HTML 輸入框與 LocalStorage）
function getActiveUserApiKey() {
  const k1 = (backupKey || '').trim();
  const k2 = (document.getElementById('studioApiKeyInput')?.value || '').trim();
  const k3 = (document.getElementById('apiKeyInput')?.value || '').trim();
  const k4 = (localStorage.getItem('tp_v22_backup_key') || localStorage.getItem('tp_test_gemini_key') || '').trim();
  const finalKey = (k1 || k2 || k3 || k4).replace(/\s+/g, '');
  if (finalKey && finalKey !== backupKey) {
    backupKey = finalKey;
    refreshKeyBtnStyle();
  }
  return finalKey;
}

async function callSingleGeminiModel(modelName, fullPromptText, activeKey, signal, dataUrl = null) {
  const cleanKey = activeKey.replace(/\s+/g, '');
  const url = buildGoogleGenAiUrl(modelName, cleanKey, false);

  const parts = [{ text: fullPromptText }];
  if (dataUrl && dataUrl.includes(',')) {
    const mime = dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';'));
    parts.push({ inlineData: { mimeType: mime, data: dataUrl.split(',')[1] } });
  }

  // 對 Gemini Flash 優先啟用 thinkingBudget: 0 消除思考延遲（若模型不支援報 400 則無縫重試）
  const isGemma = /gemma/i.test(modelName);
  const isPdfData = !!(dataUrl && dataUrl.startsWith('data:application/pdf'));
  const maxTokens = isPdfData ? 2500 : 1500;
  const genConfig = isGemma
    ? { temperature: 0.1, maxOutputTokens: maxTokens }
    : { temperature: 0.1, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } };

  let r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: genConfig
    }),
    signal
  });

  if (r.status === 400 && !isGemma) {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens }
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
  let text = resParts
    .filter(p => !p.thought && typeof p.text === 'string')
    .map(p => p.text)
    .join('')
    .trim();

  // 容錯：若模型將內容放在預設 text 欄位中
  if (!text && resParts.length > 0) {
    text = resParts.map(p => p.text || '').join('').trim();
  }

  if (!text) throw new Error(`[${modelName}] EMPTY_RESPONSE`);
  return text;
}

function looksLikeValidAiBilingualOutput(txt, requireBilingual = true) {
  if (!txt || typeof txt !== 'string') return false;
  const clean = txt.trim();
  if (clean.length < 2) return false;
  // 攔截 HTML 錯誤頁或純錯誤字串，避免寫入持久化快取
  if (/^\s*<!doctype|^\s*<html|<head>|cloudflare|error 5\d\d|rate limit exceeded|bad gateway/i.test(clean)) {
    return false;
  }
  if (!requireBilingual) return true;
  return /[\u4e00-\u9fa5]/.test(clean) || clean.includes('|||');
}

async function callOpenAICompatibleWithUserKey(systemRules, userQuestion, activeKey) {
  const endpoint = localStorage.getItem('tp_user_ai_endpoint') || 'https://api.deepseek.com/v1/chat/completions';
  const model = localStorage.getItem('tp_user_ai_model') || 'deepseek-chat';
  const r = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemRules },
        { role: 'user', content: userQuestion || systemRules }
      ],
      temperature: 0.15
    })
  }, 11000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`[OpenAI-Compat ${r.status}] ${d?.error?.message || r.statusText}`);
  }
  return (d?.choices?.[0]?.message?.content || '').trim();
}

async function callKeylessFreeOpenSourceLLM(systemRules, userQuestion) {
  // 單次 4.5 秒極速保底（徹底消除先前 4 輪 × 8.5 秒 = 34 秒卡死現象）
  try {
    const r = await fetchWithTimeout('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai-fast',
        messages: [
          { role: 'system', content: systemRules },
          { role: 'user', content: userQuestion || systemRules }
        ],
        temperature: 0.15
      })
    }, 4500);
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      const txt = (d?.choices?.[0]?.message?.content || '').trim();
      if (looksLikeValidAiBilingualOutput(txt)) return txt;
    }
  } catch (e) {}
  return '';
}

function isSimpleQuerySafeForLocalNano(q) {
  const clean = String(q || '').trim();
  if (!clean || clean.length > 48) return false;
  if (/詩|诗|詞|词|歌|曲|賦|赋|經|经|論語|论语|道德經|道德经|三字經|三字经|千字文|百家姓|全文|完整|背誦|背诵|默寫|默写|賞析|赏析|作者|李白|杜甫|蘇軾|苏轼|王維|王维|白居易|孟浩然|李清照|poem|poetry|verse|lyric|song|classic|full text|recite|author|li bai|du fu/i.test(clean)) {
    return false;
  }
  return true;
}

async function tryBrowserLocalAI(fullPromptText, errorLogs, rawUserQuestion = '') {
  try {
    const status = await checkBrowserLocalAiAvailability();
    if (status !== 'available') return '';
    const session = await initBrowserLocalAISession(false);
    if (session && typeof session.prompt === 'function') {
      // 給端側 Gemini Nano 使用精簡短 Prompt（避免 1500 字長規則造成端側 GPU 逾時）
      const shortPrompt = rawUserQuestion
        ? `Answer concisely in 1-2 lines using format "Traditional_Chinese ||| English" (no intro, no Pinyin on left). Question: ${rawUserQuestion}`
        : fullPromptText.slice(0, 650);
      const localReply = await Promise.race([
        session.prompt(shortPrompt).then(t => String(t || '').trim()),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 6000))
      ]);
      if (looksLikeValidAiBilingualOutput(localReply)) {
        return localReply;
      }
    }
  } catch (e) {
    chromeAISession = null;
    if (errorLogs) errorLogs.push(`[LocalAI: ${e.message || 'Busy'}]`);
  }
  return '';
}

// 讀取 Gemini / Worker 的 AI 問答 SSE 流，逐行即時觸發 onLine 渲染（首行 0.8-1.5 秒出字）
async function consumeAiSseLines(response, onLine) {
  if (!response || !response.body || typeof response.body.getReader !== 'function') return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let sseBuf = '';
  let lineBuf = '';
  let fullText = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      sseBuf += decoder.decode(value, { stream: true });
      const events = sseBuf.split(/\r?\n/);
      sseBuf = events.pop() || '';
      for (const ev of events) {
        const t = ev.trim();
        if (!t.startsWith('data:')) continue;
        const raw = t.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const d = JSON.parse(raw);
          let delta = '';
          if (typeof d?.delta === 'string') {
            delta = d.delta;
          } else if (Array.isArray(d?.candidates?.[0]?.content?.parts)) {
            delta = d.candidates[0].content.parts
              .filter(p => !p.thought && typeof p.text === 'string')
              .map(p => p.text)
              .join('');
          } else if (typeof d?.text === 'string') {
            delta = d.text;
          }
          if (delta) {
            fullText += delta;
            if (typeof onLine === 'function') {
              lineBuf += delta;
              const parts = lineBuf.split(/\r?\n/);
              lineBuf = parts.pop() || '';
              for (const p of parts) {
                if (p.trim()) onLine(p.trim());
              }
            }
          }
        } catch (e) {}
      }
    }
    if (typeof onLine === 'function' && lineBuf.trim()) {
      onLine(lineBuf.trim());
    }
  } finally {
    try { reader.releaseLock(); } catch (e) {}
  }
  return fullText.trim();
}

async function streamSingleGeminiModel(modelName, fullPromptText, activeKey, signal, onLine, onConnected = null) {
  const cleanKey = activeKey.replace(/\s+/g, '');
  const url = buildGoogleGenAiUrl(modelName, cleanKey, true);
  const isGemma = /gemma/i.test(modelName);
  const genConfig = isGemma
    ? { temperature: 0.1, maxOutputTokens: 1500 }
    : { temperature: 0.1, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 0 } };

  let r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: fullPromptText }] }],
      generationConfig: genConfig
    }),
    signal
  });

  if (r.status === 400 && !isGemma) {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: fullPromptText }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1500 }
      }),
      signal
    });
  }

  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(`[${modelName}: ${r.status}] ${d?.error?.message || `HTTP_${r.status}`}`);
  }
  if (typeof onConnected === 'function') onConnected();
  const text = await consumeAiSseLines(r, onLine);
  if (!text) throw new Error(`[${modelName}] EMPTY_RESPONSE`);
  return text;
}

// 統一極速 AI 路由器（支援真 SSE 流式 + 4 組獨立配額池 + 個人 Key 獨立錯誤回報不誤報公共額度上限）：
// 0. 0ms 本地快取 -> 1. 用戶自有 Key (真 SSE 流式：Full Flash -> Flash-Lite -> Gemma 27B -> latest) ->
// 2. 無個人 Key 時走 Cloudflare Worker (0.02s Edge Cache / 真 SSE 流式，429 立刻熔斷) ->
// 3. Chrome 本地端側 AI (Gemini Nano) -> 4. 開源免 Key 保底
async function fetchFastAccurateAI(systemRules, userQuestion = '', cacheKeyForCloud = '', dataUrl = null, onStreamLine = null, preferSmartModel = false) {
  if (!dataUrl && cacheKeyForCloud && sessionDynamicCache.has(cacheKeyForCloud)) {
    return { text: sessionDynamicCache.get(cacheKeyForCloud), source: 'Instant Cache', diagError: null, usedPublicPool: false, streamed: false };
  }

  const activeKey = getActiveUserApiKey();
  const fullPromptText = userQuestion ? `${systemRules}\n\nUser Question: "${userQuestion}"` : systemRules;
  const requireBilingual = !!(systemRules && systemRules.includes('|||'));
  const errorLogs = [];

  // 1. 個人 API Key 優先（100% 用戶端額度，同時相容 Google AI Studio AIza...、Vertex AI Express AQ.... 與 OpenAI/DeepSeek sk-...）
  if (activeKey) {
    if (isGoogleGeminiKey(activeKey)) {
      if (modelsDiscoveredForKey !== activeKey) {
        discoverAuthorizedModels(activeKey);
      }
      const rawModels = dataUrl
        ? [
            ...availableFastModels.filter(m => /flash-lite/i.test(m)),
            ...availableFastModels.filter(m => !/gemma|flash-lite/i.test(m))
          ]
        : (preferSmartModel
          ? [
              ...availableFastModels.filter(m => !/gemma|flash-lite/i.test(m)),
              ...availableFastModels.filter(m => /flash-lite/i.test(m))
            ]
          : availableFastModels);
      const modelsToTry = Array.from(new Set(rawModels.map(m => resolveModelForKey(m, activeKey)))).slice(0, 4);

      const isPdfData = !!(dataUrl && dataUrl.startsWith('data:application/pdf'));
      const modelTimeoutMs = isPdfData ? 16000 : 9500;
      for (let i = 0; i < modelsToTry.length; i++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), modelTimeoutMs);
        try {
          let txt = '';
          let didStream = false;
          if (!dataUrl && typeof onStreamLine === 'function') {
            txt = await streamSingleGeminiModel(modelsToTry[i], fullPromptText, activeKey, ctrl.signal, onStreamLine, () => clearTimeout(timer));
            didStream = true;
          } else {
            txt = await callSingleGeminiModel(modelsToTry[i], fullPromptText, activeKey, ctrl.signal, dataUrl);
          }
          clearTimeout(timer);
          if (looksLikeValidAiBilingualOutput(txt, requireBilingual)) {
            if (!dataUrl && cacheKeyForCloud) saveAnswerToPersistentCache(cacheKeyForCloud, txt);
            return { text: txt, source: `Google (${modelsToTry[i]})`, diagError: null, usedPublicPool: false, streamed: didStream };
          }
        } catch (e) {
          clearTimeout(timer);
          const isTimeout = e && (e.name === 'AbortError' || /aborted/i.test(e.message || ''));
          const msg = isTimeout ? `[${modelsToTry[i]}: Timeout]` : (e.message || String(e));
          errorLogs.push(msg);
          if (/API_KEY_INVALID|key not valid/i.test(msg)) break;
        }
      }
    } else if (!dataUrl) {
      try {
        const txt = await callOpenAICompatibleWithUserKey(systemRules, userQuestion, activeKey);
        if (looksLikeValidAiBilingualOutput(txt, requireBilingual)) {
          if (cacheKeyForCloud) saveAnswerToPersistentCache(cacheKeyForCloud, txt);
          return { text: txt, source: 'Personal AI Key', diagError: null, usedPublicPool: false, streamed: false };
        }
      } catch (e) {
        errorLogs.push(e.message || String(e));
      }
    }

    // 停用端側 Gemini Nano 回答知識/古詩問答（避免小模型胡編亂造），失敗時直接引導用戶使用免費 Google Gemini 網頁版或檢查 Key
    return { text: '', source: 'user_key_error', diagError: errorLogs.join(' | '), usedPublicPool: false, limitReached: false, userKeyFailed: true, streamed: false };
  }

  // 2. 免 Key 公共商業池：Cloudflare Worker 全球邊緣快取 (0.02s 秒回) + 支援真 SSE 流式
  let hitFreeLimit = false;
  let hitTextTooLong = false;
  const proToken = (typeof getProAuthToken === 'function') ? getProAuthToken() : '';
  const workerHeaders = { 'Content-Type': 'application/json' };
  if (proToken) workerHeaders['Authorization'] = `Bearer ${proToken}`;

  for (let i = 0; i < CF_WORKER_ENDPOINTS.length; i++) {
    try {
      const wantStream = !dataUrl && typeof onStreamLine === 'function';
      const r = await fetchWithTimeout(CF_WORKER_ENDPOINTS[i], {
        method: 'POST',
        headers: workerHeaders,
        body: JSON.stringify({
          prompt: fullPromptText,
          userQuestion: userQuestion || '',
          image: dataUrl,
          mode: (dataUrl && !requireBilingual) ? 'ocr_only' : undefined,
          cacheKey: dataUrl ? '' : cacheKeyForCloud,
          stream: wantStream,
          preferSmart: preferSmartModel
        })
      }, 10500);
      const cType = (r.headers.get('content-type') || '').toLowerCase();
      if (r.ok && wantStream && cType.includes('text/event-stream')) {
        const t = await consumeAiSseLines(r, onStreamLine);
        if (looksLikeValidAiBilingualOutput(t, requireBilingual)) {
          if (!dataUrl && cacheKeyForCloud) saveAnswerToPersistentCache(cacheKeyForCloud, t);
          const isCacheHit = r.headers.get('X-Cache') === 'HIT';
          return { text: t, source: isCacheHit ? 'Edge Cache (0ms)' : 'Cloudflare Stream Pool', diagError: null, usedPublicPool: !isCacheHit, streamed: true };
        }
        continue;
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const detail = d?.detail || d?.error || `HTTP ${r.status}`;
        if (r.status === 429 || /LIMIT_REACHED/i.test(String(detail))) hitFreeLimit = true;
        if (r.status === 400 && /TEXT_TOO_LONG/i.test(String(detail))) hitTextTooLong = true;
        errorLogs.push(`[Worker: ${detail}]`);
        if (r.status === 429 || r.status === 400 || r.status === 500 || r.status === 502 || r.status === 503) break;
        continue;
      }
      const t = (d?.text || d?.reply || d?.choices?.[0]?.message?.content || '').trim();
      if (looksLikeValidAiBilingualOutput(t, requireBilingual)) {
        if (!dataUrl && cacheKeyForCloud) saveAnswerToPersistentCache(cacheKeyForCloud, t);
        const isCacheHit = r.headers.get('X-Cache') === 'HIT';
        return { text: t, source: isCacheHit ? 'Edge Cache (0ms)' : 'Cloudflare Evergreen Pool', diagError: null, usedPublicPool: !isCacheHit, streamed: false };
      }
    } catch (e) {
      const isTimeout = e && (e.name === 'AbortError' || /aborted/i.test(e.message || ''));
      errorLogs.push(isTimeout ? '[Worker: Timeout]' : `[Worker: ${e.message || 'Network/CORS'}]`);
    }
  }

  // 3. 雲端免費池滿載或離線時：僅針對簡單日常口語／短句翻譯啟用用戶端 Chrome Nano 簡化 AI（嚴禁古詩／經典），並明確提醒用戶
  if (!dataUrl && isSimpleQuerySafeForLocalNano(userQuestion)) {
    const localFallback = await tryBrowserLocalAI(fullPromptText, errorLogs, userQuestion);
    if (localFallback) {
      if (cacheKeyForCloud) saveAnswerToPersistentCache(cacheKeyForCloud, localFallback);
      return { text: localFallback, source: 'Chrome Gemini Nano (Local)', diagError: errorLogs.join(' | '), usedPublicPool: false, streamed: false, usedLocalNano: true };
    }
  }

  // 已移除非 Google 的 pollinations.ai 保底，確保 100% Google 品質與極速響應

  if (hitTextTooLong) {
    return { text: '', source: 'text_too_long', diagError: errorLogs.join(' | '), usedPublicPool: true, textTooLong: true, streamed: false };
  }

  if (hitFreeLimit) {
    return { text: '', source: 'limit', diagError: errorLogs.join(' | '), usedPublicPool: true, limitReached: true, streamed: false };
  }

  return { text: '', source: 'none', diagError: errorLogs.join(' | '), usedPublicPool: true, streamed: false };
}

// =========================================================================
// 0.8 雲端中華經典四層檢索 (Cloudflare D1 經典/成語/非遺/中醫/名菜/路牌庫)
//     direct -> 0.05s 權威直出（0 LLM token） | rag_inject -> 注入系統詞彙表給 AI | fallback -> 正常 AI
// =========================================================================
async function queryClassicMatcher(queryText, timeoutMs = 1200) {
  const q = String(queryText || '').trim();
  if (!q || q.length > 480) return null;
  if (conversationHistory.length > 0 && /^(why\??|more\??|another one\??|continue\??|what does (it|that) mean\??|為什麼\??|为什么\??|還有嗎\??|还有吗\??|繼續\??|继续\??)$/i.test(q)) {
    return null;
  }
  for (let i = 0; i < CLASSICS_API_ENDPOINTS.length; i++) {
    const t0 = Date.now();
    const budget = i === 0 ? timeoutMs : Math.min(900, timeoutMs);
    try {
      const res = await fetchWithTimeout(`${CLASSICS_API_ENDPOINTS[i]}/api/classic/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      }, budget);
      if (res.ok) {
        const data = await res.json();
        if (data && (data.mode === 'direct' || data.mode === 'rag_inject') && Array.isArray(data.hits) && data.hits.length > 0) {
          return data;
        }
        return null;
      }
      if (res.status === 400 || res.status === 403 || res.status === 404) return null;
    } catch (e) {
      // 若主節點超時才失敗，直接放行一般流程，避免雙倍等待
      if (Date.now() - t0 >= Math.min(800, budget - 100)) return null;
    }
  }
  return null;
}

function isClassicalPoemLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return false;
  let verseLike = 0;
  for (const raw of lines) {
    const clauses = String(raw || '').split(/[，。！？；,;!?.]+/).map(s => s.replace(/[^\u4e00-\u9fa5]/g, '')).filter(Boolean);
    for (const c of clauses) {
      if (c.length === 5 || c.length === 7) verseLike++;
    }
  }
  return verseLike >= 4;
}

function expandPoemVersesOnePerLine(lines) {
  if (!Array.isArray(lines) || !isClassicalPoemLines(lines)) return lines;
  const out = [];
  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.includes('|||')) {
      out.push(trimmed);
      continue;
    }
    const parts = trimmed.split(/(?<=[，。！？；])/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.every(p => {
      const len = p.replace(/[^\u4e00-\u9fa5]/g, '').length;
      return len === 5 || len === 7;
    })) {
      parts.forEach(p => out.push(p));
    } else {
      out.push(trimmed);
    }
  }
  return out;
}

function applyAutoPoemLayout(isPoem) {
  const sheet = document.getElementById('printableSheet');
  const lSel = document.getElementById('layoutModeSelect');
  if (!sheet) return;
  const curMode = lSel ? lSel.value : 'auto';
  if (isPoem && (curMode === 'auto' || curMode === 'standard')) {
    sheet.classList.remove('layout-kids', 'layout-standard');
    sheet.classList.add('layout-poem');
    sheet.style.setProperty('--tp-font-size', '22px');
  } else if (!isPoem && curMode === 'auto') {
    sheet.classList.remove('layout-poem');
    sheet.classList.add('layout-standard');
    sheet.style.setProperty('--tp-font-size', '20px');
  }
}

function splitEnglishToMatchCount(enText, targetCount) {
  const clean = String(enText || '').replace(/\s+/g, ' ').trim();
  if (!clean || targetCount <= 1) return [clean];

  // 1. 優先按英文詩行常見特徵拆分（逗號/分號/句號後接大寫字母，如 Witter Bynner 譯本）
  const capSplits = clean.split(/(?<=[,;.!?])\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean);
  if (capSplits.length === targetCount) return capSplits;

  // 2. 按標點分句後均勻分組，確保嚴格對齊 targetCount 行
  const pieces = clean.split(/(?<=[,;.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if (pieces.length === targetCount) return pieces;
  if (pieces.length > targetCount) {
    const out = [];
    const totalLen = clean.length;
    let pIdx = 0;
    for (let i = 0; i < targetCount; i++) {
      if (i === targetCount - 1) {
        out.push(pieces.slice(pIdx).join(' '));
        break;
      }
      const remainingSlots = targetCount - i;
      const targetLen = totalLen / targetCount;
      let cur = pieces[pIdx++];
      while (pIdx < pieces.length - (remainingSlots - 1) && cur.length + pieces[pIdx].length < targetLen * 1.15) {
        cur += ' ' + pieces[pIdx++];
      }
      out.push(cur);
    }
    return out;
  }

  // 3. 若英文標點少於中文句數，按詞數均勻切分
  const words = clean.split(/\s+/);
  const out = [];
  const per = Math.ceil(words.length / targetCount);
  for (let i = 0; i < targetCount; i++) {
    out.push(words.slice(i * per, (i + 1) * per).join(' '));
  }
  return out;
}

function splitClassicIntoPairs(zhRaw, enRaw) {
  const zhClean = String(zhRaw || '').trim();
  const enClean = String(enRaw || '').trim();
  if (!zhClean || !enClean) return [];
  const zhLines = zhClean.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const enLines = enClean.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (zhLines.length > 1 && zhLines.length === enLines.length) {
    return zhLines.map((z, idx) => ({ zh: z, en: enLines[idx] }));
  }
  // 古詩專屬每行一句拆分：若為五言/七言詩句，強制連同逗號一併斷行，並智慧對齊英文譯文
  const zhClauses = zhClean.split(/(?<=[，。！？；])/).map(s => s.trim()).filter(Boolean);
  if (zhClauses.length >= 4 && zhClauses.length <= 24 && isClassicalPoemLines(zhClauses)) {
    const enAligned = splitEnglishToMatchCount(enClean, zhClauses.length);
    return zhClauses.map((z, idx) => ({ zh: z, en: enAligned[idx] || '' }));
  }
  // 若為完整古詩／多句名言且中英文句數一致，自動依句拆分讓注音排版更清晰
  const zhSents = zhClean.split(/(?<=[。！？])/).map(s => s.trim()).filter(Boolean);
  const enSents = enClean.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if (zhSents.length >= 2 && zhSents.length === enSents.length && zhSents.length <= 16) {
    return zhSents.map((z, idx) => ({ zh: z, en: enSents[idx] }));
  }
  return [{ zh: zhClean, en: enClean }];
}

// 從經典命中結果（可能為整章／多句段落，如《道德經》第1章）中精準提取對應單句，或直接回傳 hit 原文
function extractMatchingClassicClauseFromHit(queryText, hitZhRaw, hitEnRaw) {
  const q = String(queryText || '').trim();
  const hitZh = String(hitZhRaw || '').trim();
  const hitEn = String(hitEnRaw || '').trim();
  if (!hitZh || !hitEn) return { zh: hitZh, en: hitEn };

  const qHasCjk = /[\u4e00-\u9fa5]/.test(q);
  const normEn = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const normZh = (s) => String(s || '').replace(/[^\u4e00-\u9fa5]/g, '');

  if (!qHasCjk) {
    const qEn = normEn(q);
    const fullEn = normEn(hitEn);
    // 若查詢本身已涵蓋整條英文（>= 75%），直接回傳完整經典段落（若首句為經典名句且中文過長則自動取首大句）
    const enSents = hitEn.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    if (enSents.length >= 2 && qEn.length >= 10 && qEn.length < fullEn.length * 0.82) {
      const matchIdx = enSents.findIndex(s => {
        const sNorm = normEn(s);
        return sNorm && (sNorm.includes(qEn) || qEn.includes(sNorm));
      });
      if (matchIdx !== -1) {
        const pickedEn = enSents[matchIdx];
        // 1. 先檢查中文是否以「；。！？」分成對應大句（或第一大句內剛好有 enSents.length * 2 個逗號對句，如「道可道，非常道，名可名，非常名；...」）
        const majorZh = hitZh.split(/[。！？；;]/).map(s => s.trim()).filter(Boolean);
        if (majorZh.length > 0) {
          const firstMajorParts = majorZh[0].split(/[，,]/).map(s => s.trim()).filter(Boolean);
          if (firstMajorParts.length === enSents.length * 2) {
            const pairSlice = firstMajorParts.slice(matchIdx * 2, matchIdx * 2 + 2).join('，');
            if (pairSlice) return { zh: pairSlice + '。', en: pickedEn };
          }
          if (majorZh.length >= enSents.length) {
            return { zh: majorZh[matchIdx] + '。', en: pickedEn };
          }
        }
      }
    }
    return { zh: hitZh, en: hitEn };
  } else {
    const qZh = normZh(q);
    const fullZh = normZh(hitZh);
    const majorZh = hitZh.split(/(?<=[。！？；;])/).map(s => s.trim()).filter(Boolean);
    const enSents = hitEn.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    if (majorZh.length >= 2 && enSents.length >= 2 && qZh.length >= 4 && qZh.length < fullZh.length * 0.75) {
      const matchIdx = majorZh.findIndex(s => {
        const sNorm = normZh(s);
        return sNorm && (sNorm.includes(qZh) || qZh.includes(sNorm));
      });
      if (matchIdx !== -1 && matchIdx < enSents.length) {
        return { zh: majorZh[matchIdx], en: enSents[matchIdx] };
      }
    }
    return { zh: hitZh, en: hitEn };
  }
}

// 圖片 OCR／文字逐句快速查經典與標準譯名庫（優先命中 classics-api 的 direct / L1_exact / L2_fts_passage / 高分 L3_fuzzy，跳過 AI 直譯）
async function matchClassicForOcrLine(rawLine, allowTypoFix = true, customTimeoutMs = 1200) {
  const line = String(rawLine || '').trim();
  if (!line || line.length > 260) return null;
  const cjkInLine = (line.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (cjkInLine === 0 && line.split(/\s+/).filter(Boolean).length < 2) return null;

  const res = await queryClassicMatcher(line, customTimeoutMs);
  if (!res || !Array.isArray(res.hits) || res.hits.length === 0) return null;

  const hit = res.hits[0];
  const rawHitZh = String(
    currentScriptMode === 'simp'
      ? (hit.zh_simp_display || hit.zh_trad_display || '')
      : (hit.zh_trad_display || hit.zh_simp_display || '')
  ).trim();
  const rawHitEn = String(hit.en_display || '').trim();
  if (!rawHitZh || !rawHitEn) return null;

  const score = Number(res.confidence || hit.score || 0);
  const srcLabel = [hit.source, hit.translator].filter(Boolean).join(' · ');
  const layer = String(res.match_layer || '');

  // L1 精確、L2A 段落/詩句 FTS、direct 模式、或高信度 L3 模糊命中（非僅嵌了 1 個短詞的長複合句）
  const isPassageOrDirect =
    res.mode === 'direct' ||
    layer.startsWith('L1') ||
    layer.startsWith('L2') ||
    (layer.startsWith('L3') && score >= 0.75);

  if (isPassageOrDirect) {
    const { zh: alignedZh, en: alignedEn } = extractMatchingClassicClauseFromHit(line, rawHitZh, rawHitEn);
    if (cjkInLine === 0) {
      // 英文查經典（如 "The Tao that can be trodden is not the enduring and unchanging Tao"）-> 直接回傳經典中文原文「道可道，非常道。」
      return {
        zh: alignedZh,
        en: allowTypoFix ? alignedEn : line,
        source: srcLabel,
        corrected: false,
        layer: layer || 'classic'
      };
    } else {
      const cjkInAligned = (alignedZh.match(/[\u4e00-\u9fa5]/g) || []).length;
      const ratio = cjkInAligned > 0 ? (cjkInLine / cjkInAligned) : 1;
      // 中文查經典：direct / L1 / L2_fts_passage 直接採用標準英譯；L3_fuzzy 則於長度相近時自動修復 OCR 錯字
      if (res.mode === 'direct' || layer === 'L1_exact' || (layer === 'L2_fts_passage' && cjkInLine >= 3)) {
        const lineCjkOnly = line.replace(/[^\u4e00-\u9fa5]/g, '');
        const hitCjkOnly = alignedZh.replace(/[^\u4e00-\u9fa5]/g, '');
        const shouldReplaceZh = allowTypoFix || ratio >= 0.55;
        return {
          zh: shouldReplaceZh ? alignedZh : line,
          en: alignedEn,
          source: srcLabel,
          corrected: !!(allowTypoFix && lineCjkOnly !== hitCjkOnly),
          layer: layer || 'classic'
        };
      }
      if (allowTypoFix && layer === 'L3_fuzzy' && score >= 0.84 && cjkInLine >= 4 && ratio >= 0.75 && ratio <= 1.35) {
        return { zh: alignedZh, en: alignedEn, source: srcLabel, corrected: true, layer: 'L3_fuzzy' };
      }
    }
  }
  return null;
}

// 整張圖片 OCR 結果合體校對：專治豎排古詩、書法、古文與名言海報（容忍錯字與斷行零碎，自動還原權威原文＋名家英譯）
async function reconcileWholeOcrWithClassics(ocrFullText) {
  const raw = String(ocrFullText || '').trim();
  if (!raw) return null;
  const tradRaw = openccToTrad ? openccToTrad(raw) : raw;
  const ocrCjk = tradRaw.replace(/[^\u4e00-\u9fa5]/g, '');
  if (ocrCjk.length < 6 || ocrCjk.length > 360) return null;

  // 1. 先比對本地 14 篇完整離線經典（0ms，對書法錯字／斷行極高容錯）
  const ocrCharCounts = new Map();
  for (const ch of ocrCjk) ocrCharCounts.set(ch, (ocrCharCounts.get(ch) || 0) + 1);
  for (const item of VERIFIED_CLASSICS) {
    const bodyCjk = item.lines.map(l => l.zh).join('').replace(/[^\u4e00-\u9fa5]/g, '');
    if (bodyCjk.length < 10) continue;
    if (ocrCjk.length < bodyCjk.length * 0.55 || ocrCjk.length > bodyCjk.length * 1.75) continue;
    const tmp = new Map(ocrCharCounts);
    let overlap = 0;
    for (const ch of bodyCjk) {
      const c = tmp.get(ch) || 0;
      if (c > 0) { overlap++; tmp.set(ch, c - 1); }
    }
    if (overlap / bodyCjk.length >= 0.78) {
      const titleParts = item.title.split('·').map(s => s.trim());
      const pairs = [
        { zh: titleParts[0] || item.title, en: titleParts.slice(1).join(' · ') || item.title },
        ...item.lines.map(l => ({ zh: l.zh, en: l.en }))
      ];
      return {
        kind: 'local_verified',
        pairs,
        canonicalText: item.lines.map(l => l.zh).join('\n'),
        source: item.title
      };
    }
  }

  // 2. 再比對雲端 classics-api（支援全部 1,768+ 筆唐詩、論語、道德經、名句與未來擴充庫）
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const candidates = [lines.join('')];
  if (lines.length >= 3) {
    const firstCjkLen = (lines[0].match(/[\u4e00-\u9fa5]/g) || []).length;
    if (firstCjkLen > 0 && firstCjkLen <= 14) {
      const bodyOnly = lines.slice(1).join('');
      if (bodyOnly.length >= 8) candidates.push(bodyOnly);
    }
  }

  for (const cand of candidates) {
    if (cand.length > 460) continue;
    const res = await queryClassicMatcher(cand, 1400);
    if (!res || !Array.isArray(res.hits) || res.hits.length === 0) continue;
    const hit = res.hits[0];
    const hitZh = String(hit.zh_trad_display || hit.zh_simp_display || '').trim();
    const hitEn = String(hit.en_display || '').trim();
    if (!hitZh || !hitEn) continue;

    const score = Number(res.confidence || hit.score || 0);
    const isStrongMatch = (res.mode === 'direct') || (res.match_layer === 'L3_fuzzy' && score >= 0.82);
    if (!isStrongMatch) continue;

    const cjkCand = (cand.match(/[\u4e00-\u9fa5]/g) || []).length;
    const cjkHit = (hitZh.match(/[\u4e00-\u9fa5]/g) || []).length;
    // 嚴格長度護欄：僅當整張圖主題即為該篇經典／詩句（>= 8 漢字且長度吻合）才整圖替換，避免誤覆蓋多道菜菜單
    if (cjkHit >= 8 && cjkCand >= cjkHit * 0.55 && cjkCand <= cjkHit * 1.55) {
      const pairs = splitClassicIntoPairs(hitZh, hitEn);
      if (pairs.length > 0) {
        return {
          kind: 'cloud_classic',
          pairs,
          canonicalText: pairs.map(p => p.zh).join('\n'),
          source: [hit.source, hit.translator].filter(Boolean).join(' · ')
        };
      }
    }
  }
  return null;
}

function renderReconciledClassicResult(reconciled, replyBox) {
  const container = document.getElementById('sentencesContainer');
  if (!reconciled || !Array.isArray(reconciled.pairs) || reconciled.pairs.length === 0 || !container) return false;
  container.innerHTML = '';
  applyAutoPoemLayout(isClassicalPoemLines(reconciled.pairs.map(p => p.zh)));
  for (const pair of reconciled.pairs) {
    appendSentenceProgressive(pair.zh, pair.en);
  }
  if (replyBox) {
    replyBox.onclick = null;
    replyBox.style.cursor = '';
    if (reconciled.source) {
      replyBox.style.display = 'block';
      replyBox.textContent = `📚 OCR Auto-Verified · ${reconciled.source}`;
    } else {
      replyBox.style.display = 'none';
    }
  }
  return true;
}


function getBrowserLocalAiFactory() {
  if (typeof window.LanguageModel !== 'undefined' && typeof window.LanguageModel.create === 'function') {
    return window.LanguageModel;
  }
  if (window.ai && window.ai.languageModel && typeof window.ai.languageModel.create === 'function') {
    return window.ai.languageModel;
  }
  if (window.chrome && chrome.aiOriginTrial && chrome.aiOriginTrial.languageModel) {
    return chrome.aiOriginTrial.languageModel;
  }
  return null;
}

async function checkBrowserLocalAiAvailability() {
  const factory = getBrowserLocalAiFactory();
  if (!factory) return 'unavailable';
  try {
    let raw = 'unavailable';
    if (typeof factory.availability === 'function') {
      raw = await factory.availability();
    } else if (typeof factory.capabilities === 'function') {
      const cap = await factory.capabilities();
      raw = cap?.available || 'unavailable';
    }
    if (raw === 'available' || raw === 'readily') return 'available';
    return 'unavailable';
  } catch (e) {
    return 'unavailable';
  }
}

async function initBrowserLocalAISession() {
  try {
    const factory = getBrowserLocalAiFactory();
    if (!factory) return null;
    if (chromeAISession) return chromeAISession;
    const status = await checkBrowserLocalAiAvailability();
    if (status !== 'available') return null;
    chromeAISession = await factory.create({ temperature: 0.15, topK: 3 });
    return chromeAISession;
  } catch (e) {
    return null;
  }
}

const studioTransCache = new Map();

// 統一複用 js/text-utils.js 共享雙向標準經典詞庫與譯後正規化引擎（與網頁/Google Docs/YouTube 完全同步）
function lookupSpokenEnToZh(text) {
  return (window.TreesTextUtils && typeof window.TreesTextUtils.lookupCanonicalEnToZh === "function")
    ? window.TreesTextUtils.lookupCanonicalEnToZh(text)
    : "";
}
function lookupSpokenZhToEn(text) {
  return (window.TreesTextUtils && typeof window.TreesTextUtils.lookupCanonicalZhToEn === "function")
    ? window.TreesTextUtils.lookupCanonicalZhToEn(text)
    : "";
}
function normalizeCanonicalChineseOutput(zhText, origEn = "") {
  return (window.TreesTextUtils && typeof window.TreesTextUtils.normalizeCanonicalChineseOutput === "function")
    ? window.TreesTextUtils.normalizeCanonicalChineseOutput(zhText, origEn)
    : String(zhText || "");
}

function parseNumberedTranslationLines(rawOut, expectedCount) {
  if (!rawOut || expectedCount <= 0) return null;
  const map = new Map();
  String(rawOut).split(/\n+/).forEach(row => {
    const m = row.trim().match(/^\[?(\d+)[\].):：]\s*(.+)$/);
    if (m) {
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < expectedCount && !map.has(idx)) {
        map.set(idx, m[2].trim());
      }
    }
  });
  if (map.size === expectedCount) {
    const arr = [];
    for (let i = 0; i < expectedCount; i++) arr.push(map.get(i) || '');
    if (arr.every(Boolean)) return arr;
  }
  if (expectedCount === 1) {
    const single = String(rawOut).trim().replace(/^\[?1[\].):：]\s*/, '').split(/\n+/)[0].trim();
    if (single) return [single];
  }
  return null;
}

async function translateLinesWithUserKey(lines, srcLang, tgtLang) {
  if (!backupKey || !Array.isArray(lines) || lines.length === 0) return null;
  const isEnToZh = String(srcLang).startsWith('en');
  const numbered = lines.map((s, idx) => `[${idx + 1}] ${s}`).join('\n');
  const prompt = isEnToZh
    ? `Translate each numbered English line into natural, idiomatic everyday spoken Mandarin Chinese (NEVER word-for-word literal for English idioms).
Always translate "Trees Pinyin" as "樹拼音". CRITICAL: If an English line is a title or English translation of a Chinese classic, poem, idiom, or anthem, ALWAYS restore the EXACT original canonical Classical Chinese text (e.g., Three-Character Classic -> 三字經, Hundred Family Surnames -> 百家姓, Thousand-Character Classic -> 千字文, "People at birth are naturally good" -> 人之初，性本善。, "The Tao that can be told is not the eternal Tao" -> 道可道，非常道。) — NEVER invent literal titles or modern paraphrases!
CRITICAL: Output ONLY the numbered Chinese translations in the exact format "[1] 中文譯文", one per line, matching the exact count (${lines.length} lines). Do NOT repeat, rewrite, or echo the English text. No intro or markdown.`
    : `Translate each numbered Chinese line into natural, idiomatic, native-sounding English (NEVER literal Chinglish like "Add oil" or "Walk slowly"). Always translate "樹拼音" as "Trees Pinyin" and use standard English titles for Chinese classics (e.g., 三字經 -> Three-Character Classic, 百家姓 -> Hundred Family Surnames, 千字文 -> Thousand-Character Classic).
CRITICAL: Output ONLY the numbered English translations in the exact format "[1] English translation", one per line, matching the exact count (${lines.length} lines). Do NOT repeat, rewrite, or echo the Chinese text. No intro or markdown.`;
  const { text: aiOut } = await fetchFastAccurateAI(prompt, numbered);
  const parsed = parseNumberedTranslationLines(aiOut, lines.length);
  if (parsed && isEnToZh) {
    return parsed.map((zh, i) => normalizeCanonicalChineseOutput(zh, lines[i]));
  }
  return parsed;
}

async function translateBatchFast(sentences, fromLang, toLang, skipClassicsLookup = false) {
  if (!Array.isArray(sentences) || sentences.length === 0) return [];
  const src = fromLang.startsWith('zh') ? 'zh-CN' : 'en';
  const tgt = toLang.startsWith('zh') ? 'zh-CN' : 'en';
  const isEnToZh = (src === 'en' && tgt === 'zh-CN');

  const results = new Array(sentences.length).fill('');
  const missIdx = [];
  const missTexts = [];

  // 1. 0ms 命中：高頻雙向口語地道詞典 + 記憶體快取（英翻中 & 中翻英統一對齊，杜絕直譯）
  for (let i = 0; i < sentences.length; i++) {
    const clean = (sentences[i] || '').trim();
    if (!clean) continue;
    const idiomHit = isEnToZh ? lookupSpokenEnToZh(clean) : lookupSpokenZhToEn(clean);
    if (idiomHit) {
      results[i] = idiomHit;
      continue;
    }
    const cKey = `${src}|${tgt}|${clean}`;
    if (studioTransCache.has(cKey)) {
      results[i] = studioTransCache.get(cKey);
      continue;
    }
    missIdx.push(i);
    missTexts.push(clean);
  }

  if (missTexts.length === 0) return results;

  const finalizeVal = (rawVal, origSrc) => isEnToZh ? normalizeCanonicalChineseOutput(rawVal, origSrc) : rawVal;

  // 1.5 呼叫 AI / NMT 翻譯前，按句優先請求 classics-api.treespinyin.com/api/classic/match；命中的句子直接使用經典原文，完全跳過 AI 翻譯
  if (!skipClassicsLookup && missTexts.length <= 25) {
    const classicHits = await Promise.all(missTexts.map(txt => matchClassicForOcrLine(txt, false)));
    const remainingIdx = [];
    const remainingTexts = [];
    for (let k = 0; k < missIdx.length; k++) {
      const cHit = classicHits[k];
      if (cHit && (isEnToZh ? cHit.zh : cHit.en)) {
        const val = isEnToZh ? cHit.zh : cHit.en;
        results[missIdx[k]] = val;
        studioTransCache.set(`${src}|${tgt}|${missTexts[k]}`, val);
      } else {
        remainingIdx.push(missIdx[k]);
        remainingTexts.push(missTexts[k]);
      }
    }
    missIdx.length = 0;
    missTexts.length = 0;
    Array.prototype.push.apply(missIdx, remainingIdx);
    Array.prototype.push.apply(missTexts, remainingTexts);
    if (missTexts.length === 0) return results;
  }

  // 2. 雙向優先嘗試用戶端 Chrome 內建 Gemini Nano (LanguageModel)：100% 免費、懂中英口語與成語、0 伺服器成本
  if (missTexts.length <= 2 && window.TreesTextUtils && typeof window.TreesTextUtils.translateLinesWithLocalNano === 'function') {
    const nanoRes = await window.TreesTextUtils.translateLinesWithLocalNano(missTexts, src, tgt);
    if (Array.isArray(nanoRes) && nanoRes.length === missTexts.length) {
      for (let k = 0; k < missIdx.length; k++) {
        const val = finalizeVal((nanoRes[k] || '').trim(), missTexts[k]);
        if (val) {
          results[missIdx[k]] = val;
          studioTransCache.set(`${src}|${tgt}|${missTexts[k]}`, val);
        }
      }
      return results;
    }
  }

  // 3. 走背景 Service Worker 單一批次雲端 NMT（整段上下文合併翻譯 + 持久化快取，比 50MB 離線小模型精準且 0 伺服器費用）
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const bgRes = await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'TP_TRANSLATE_BATCH', sentences: missTexts, sl: src, tl: tgt }, (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) resolve(null);
          else resolve(res.translations || []);
        });
      } catch (e) {
        resolve(null);
      }
    });

    if (Array.isArray(bgRes) && bgRes.length === missTexts.length) {
      for (let k = 0; k < missIdx.length; k++) {
        const val = finalizeVal((bgRes[k] || '').trim() || missTexts[k], missTexts[k]);
        results[missIdx[k]] = val;
        if (val !== missTexts[k]) studioTransCache.set(`${src}|${tgt}|${missTexts[k]}`, val);
      }
      return results;
    }
  }

  // 4. 離線保底：若網路不可用，雙向皆降級使用 Chrome 本機離線 Translator
  if (window.TreesTextUtils && typeof window.TreesTextUtils.getLocalTranslator === 'function') {
    const offlineTr = await window.TreesTextUtils.getLocalTranslator(src, tgt, false);
    if (offlineTr) {
      let filledAll = true;
      for (let k = 0; k < missIdx.length; k++) {
        try {
          const r = await offlineTr.translate(missTexts[k]);
          if (r && r.trim() && r.trim() !== missTexts[k]) {
            const val = finalizeVal(r.trim(), missTexts[k]);
            results[missIdx[k]] = val;
            studioTransCache.set(`${src}|${tgt}|${missTexts[k]}`, val);
          } else {
            filledAll = false;
          }
        } catch (e) { filledAll = false; }
      }
      if (filledAll) return results;
    }
  }

  // 5. 非擴充環境（網頁直接預覽時）單一主端點降級，限流不併發轟炸
  for (let k = 0; k < missIdx.length; k++) {
    if (results[missIdx[k]]) continue;
    const clean = missTexts[k];
    let tr = '';
    try {
      const r = await fetchWithTimeout(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=${tgt}&dt=t&q=${encodeURIComponent(clean)}`, {}, 5000);
      if (r.ok) {
        const d = await r.json();
        const j = d?.[0]?.map(x => x[0]).join('').trim();
        if (j && j !== clean) tr = j;
      }
    } catch (e) {}
    if (!tr) {
      try {
        const r2 = await fetchWithTimeout(`https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${src}&tl=${tgt}&q=${encodeURIComponent(clean)}`, {}, 5000);
        if (r2.ok) {
          const d2 = await r2.json();
          let s2 = '';
          if (Array.isArray(d2)) s2 = typeof d2[0] === 'string' ? d2[0] : (Array.isArray(d2[0]) ? d2[0][0] : '');
          else if (d2 && Array.isArray(d2.sentences)) s2 = d2.sentences.map(s => s.trans || '').join('');
          if (s2 && s2.trim() && s2.trim() !== clean) tr = s2.trim();
        }
      } catch (e) {}
    }
    const finalVal = finalizeVal(tr || clean, clean);
    results[missIdx[k]] = finalVal;
    if (tr) studioTransCache.set(`${src}|${tgt}|${clean}`, finalVal);
  }

  return results;
}

async function translateFast(text, fromLang, toLang) {
  const clean = (text || '').trim();
  if (!clean) return '';
  const arr = await translateBatchFast([clean], fromLang, toLang);
  return arr[0] || clean;
}

function isAIMetaChatterLine(line) {
  if (!line) return true;
  const metaPattern = /^(based on context|based on phonetics|based on the|the user input|speech recognition error|phonetic track|intended question|corrected input|user meant|here is the|sure,\s*here|note:|explanation:|analysis:|reasoning:|根據語音|根據上下文|語音識別錯誤|用戶本意|糾正後|註|注|註釋|注释|賞析|赏析|解析|譯文|译文|意思|背景|說明|说明|總結|总结)\s*[:：]?/i;
  if (metaPattern.test(line.trim())) return true;
  if (/speech recognition error|phonetic disambiguation|homophone typo|acoustic track/i.test(line)) return true;
  if (/^(這首詩|这首诗|此詩|此诗|全詩|全诗|本詩|本诗|詩中|诗中|表達了|表达了|描寫了|描写了|抒發了|抒发了|通過|通过|以上是|希望這|希望这)/.test(line.trim())) return true;
  return false;
}

function cleanChineseLineKeepAllHanzi(rawLine) {
  if (!rawLine) return '';
  let s = expandMathEconTimeAndDatesToZh(rawLine)
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

// 安全拆分 [FIXED_INPUT]:，絕不把緊接在同一行的雙語正文吞進提問框
function extractFixedInputFromLine(rawLine) {
  const fixedMatch = String(rawLine || '').match(/^\[?FIXED_INPUT\]?\s*[:：]\s*(.+)$/i);
  if (!fixedMatch) return null;
  const afterTag = fixedMatch[1].trim();
  const sepIdx = afterTag.search(/\|\|\||｜｜｜/);
  if (sepIdx === -1) {
    const qOnly = afterTag.replace(/^["'「『]|["'」』]$/g, '').trim();
    return { correctedQuery: qOnly.length <= 80 ? qOnly : '', remainder: qOnly.length > 80 ? afterTag : '' };
  }
  const segs = afterTag.split(/\|\|\||｜｜｜/).map(s => s.trim()).filter(Boolean);
  if (segs.length >= 2) {
    const s0HasZh = /[\u4e00-\u9fa5]/.test(segs[0]);
    const s1HasZh = /[\u4e00-\u9fa5]/.test(segs[1]);
    // 例：「請給我全文 / 請給我全文 ||| 《雪絨花》... ||| Edelweiss ...」→ segs[0] 是問題，segs[1..] 才是雙語正文
    if (s0HasZh && s1HasZh) {
      const cleanQ = segs[0].split(/\s*\/\s*/)[0].replace(/^["'「『]|["'」』]$/g, '').trim();
      return {
        correctedQuery: cleanQ.length <= 60 ? cleanQ : '',
        remainder: segs.slice(1).join(' ||| ')
      };
    }
    // 否則 segs[0] ||| segs[1] 本身就是第一句中英正文，完整交給雙語解析器
    return { correctedQuery: '', remainder: afterTag };
  }
  return { correctedQuery: '', remainder: afterTag };
}

// 支援單行內包含一組或多組 "|||"（就算模型忘記換行，也能完整拆出每一對中英句子！）
function parseBilingualPairsFromLine(rawLine) {
  const cleaned = String(rawLine || '').replace(/^[-*•\d.)、]+\s*/, '').replace(/\*+/g, '').trim();
  if (!cleaned || isAIMetaChatterLine(cleaned)) return [];

  let parts = null;
  if (cleaned.includes('|||')) {
    parts = cleaned.split('|||').map(p => p.trim()).filter(Boolean);
  } else if (cleaned.includes('｜｜｜')) {
    parts = cleaned.split('｜｜｜').map(p => p.trim()).filter(Boolean);
  } else if (cleaned.includes(' | ')) {
    parts = cleaned.split(' | ').map(p => p.trim()).filter(Boolean);
  }
  if (!parts || parts.length < 2) return [];

  const out = [];
  let i = 0;
  while (i + 1 < parts.length) {
    const p0 = parts[i];
    const p1 = parts[i + 1];
    const p0Zh = /[\u4e00-\u9fa5]/.test(p0);
    const p1Zh = /[\u4e00-\u9fa5]/.test(p1);
    // 若連續兩段都是中文（例如前面混入問題回聲「請給我全文 ||| 《雪絨花》... ||| Edelweiss」），跳過雜訊段對齊下一對
    if (p0Zh && p1Zh && i + 2 < parts.length && !/[\u4e00-\u9fa5]/.test(parts[i + 2])) {
      i++;
      continue;
    }
    let zhPart = '', enPart = '';
    if (p0Zh && !p1Zh) {
      zhPart = cleanChineseLineKeepAllHanzi(p0) || p0;
      enPart = p1;
    } else if (!p0Zh && p1Zh) {
      enPart = p0;
      zhPart = cleanChineseLineKeepAllHanzi(p1) || p1;
    } else if (p0Zh) {
      zhPart = cleanChineseLineKeepAllHanzi(p0) || p0;
      enPart = p1;
    }
    if (zhPart && /[\u4e00-\u9fa5]/.test(zhPart) && !isAIMetaChatterLine(enPart) && !isAIMetaChatterLine(zhPart)) {
      out.push({ zh: zhPart, en: enPart });
    }
    i += 2;
  }
  return out;
}

function parseBilingualPairLine(rawLine) {
  const pairs = parseBilingualPairsFromLine(rawLine);
  return pairs.length > 0 ? pairs[0] : null;
}

async function renderBilingualAIOutput(aiText) {
  const replyBox = document.getElementById('aiReplyBox');
  if (replyBox) replyBox.style.display = 'none';

  const rawLines = aiText
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .split(/\r?\n+/)
    .map(l => l.trim())
    .filter(Boolean);
  if (rawLines.length === 0) return { ok: false, correctedQuery: '' };

  // 僅過濾連續卡頓的長句重複，完整保留歌曲副歌（如「雪絨花」）與詩詞疊句！
  let prevLongZhKey = '';
  let renderedPairs = 0;
  let correctedQuery = '';

  const splitIfCouplet = (zh, en) => {
    const clauses = String(zh || '').split(/(?<=[，。！？；])/).map(s => s.trim()).filter(Boolean);
    if (clauses.length >= 2 && clauses.every(c => {
      const len = c.replace(/[^\u4e00-\u9fa5]/g, '').length;
      return len === 5 || len === 7;
    })) {
      const enAligned = splitEnglishToMatchCount(en, clauses.length);
      applyAutoPoemLayout(true);
      return clauses.map((c, idx) => ({ zh: c, en: enAligned[idx] || '' }));
    }
    return [{ zh, en }];
  };

  const emitPair = (zh, en) => {
    const key = String(zh || '').replace(/[^\u4e00-\u9fa5]/g, '');
    if (!key) return;
    if (key.length >= 10 && key === prevLongZhKey) return;
    prevLongZhKey = key;
    const subPairs = splitIfCouplet(zh, en);
    for (const sp of subPairs) {
      renderedPairs++;
      appendSentenceProgressive(sp.zh, sp.en);
    }
  };

  for (let i = 0; i < rawLines.length; i++) {
    let rawLine = rawLines[i];

    const fixedInfo = extractFixedInputFromLine(rawLine);
    if (fixedInfo) {
      if (fixedInfo.correctedQuery) {
        correctedQuery = fixedInfo.correctedQuery;
        const qTextEl = document.getElementById('tpCurrentQuestionText');
        if (qTextEl) qTextEl.textContent = `💬 ${correctedQuery}`;
      }
      if (!fixedInfo.remainder) continue;
      rawLine = fixedInfo.remainder;
    }

    if (isAIMetaChatterLine(rawLine)) continue;

    const pairs = parseBilingualPairsFromLine(rawLine);
    if (pairs.length > 0) {
      for (const p of pairs) emitPair(p.zh, p.en);
      continue;
    }

    const lineStr = rawLine.replace(/^[-*•\d.)、]+\s*/, '').replace(/\*+/g, '').trim();
    if (!lineStr || isAIMetaChatterLine(lineStr)) continue;

    if (/[\u4e00-\u9fa5]/.test(lineStr)) {
      const parenMatch = lineStr.match(/^(.+?)\s*[(（]([A-Za-z][^）)]+)[)）]$/);
      let zhStr = '', enStr = '';
      if (parenMatch && /[\u4e00-\u9fa5]/.test(parenMatch[1])) {
        zhStr = cleanChineseLineKeepAllHanzi(parenMatch[1]) || parenMatch[1].trim();
        enStr = parenMatch[2].trim();
      } else {
        zhStr = cleanChineseLineKeepAllHanzi(lineStr) || lineStr;
        if (i + 1 < rawLines.length && !/[\u4e00-\u9fa5]/.test(rawLines[i + 1]) && /[A-Za-z]/.test(rawLines[i + 1]) && !rawLines[i + 1].includes('|||') && !isAIMetaChatterLine(rawLines[i + 1])) {
          enStr = rawLines[i + 1].replace(/^[-*•\d.)、]+\s*/, '').replace(/\*+/g, '').trim();
          i++;
        }
      }
      emitPair(zhStr, enStr);
    }
  }
  return { ok: renderedPairs > 0, correctedQuery };
}

// 長文本攔截與分流引導卡片（保護公共 API 池，引導使用免費翻譯 / 自有 API Key / Pro 訂閱）
function showLongTextLimitCard(mode, rawText, tier, limits) {
  const replyBox = document.getElementById('aiReplyBox');
  const limitBox = document.getElementById('apiLimitBox');
  if (limitBox) limitBox.style.display = 'none';
  if (!replyBox) return;

  const isZh = (currentLang === 'zh');
  const maxChars = (mode === 'ai') ? limits.aiMaxChars : limits.transMaxChars;
  const curLen = rawText.length;

  let titleHtml = '';
  let descHtml = '';
  if (mode === 'ai') {
    if (tier === 'free') {
      titleHtml = isZh
        ? `📏 免費公共 AI 單次上限為 ${maxChars} 字（目前 ${curLen.toLocaleString()} 字）`
        : `📏 Free public AI is limited to ${maxChars} chars per question (yours: ${curLen.toLocaleString()})`;
      descHtml = isZh
        ? '為防止公共 API 額度被長文耗盡，長段文字請改用 <b>免費「翻譯與注音」</b>，或填入自己的免費 Gemini API Key / 升級 Pro 訂閱解鎖更長額度。'
        : 'To protect our shared AI pool from long-text abuse, please use <b>Free Translate &amp; Pinyin</b>, add your own free Gemini API Key, or upgrade to Pro.';
    } else if (tier === 'pro') {
      titleHtml = isZh
        ? `📏 Pro 會員單次 AI 問答上限為 ${maxChars.toLocaleString()} 字（目前 ${curLen.toLocaleString()} 字）`
        : `📏 Pro AI Q&amp;A limit is ${maxChars.toLocaleString()} chars per request (yours: ${curLen.toLocaleString()})`;
      descHtml = isZh
        ? '超長內容請改用「翻譯與注音」（最高 15,000 字），或填入自己的 API Key 處理超長文本。'
        : 'For extra-long passages, use Translate &amp; Pinyin (up to 15,000 chars) or add your own API Key.';
    } else {
      titleHtml = isZh
        ? `📏 單次 AI 提問建議不超過 ${maxChars.toLocaleString()} 字（目前 ${curLen.toLocaleString()} 字）`
        : `📏 Single AI prompt exceeds ${maxChars.toLocaleString()} chars (yours: ${curLen.toLocaleString()})`;
      descHtml = isZh
        ? '過長文本可能觸發模型逾時，建議分段提問或改用「翻譯與注音」。'
        : 'Very long prompts may time out. Please split into shorter parts or use Translate &amp; Pinyin.';
    }
  } else {
    titleHtml = isZh
      ? `📏 當前方案單次翻譯上限為 ${maxChars.toLocaleString()} 字（目前 ${curLen.toLocaleString()} 字）`
      : `📏 Translation limit for your current tier is ${maxChars.toLocaleString()} chars (yours: ${curLen.toLocaleString()})`;
    descHtml = isZh
      ? '您可以先翻譯前段內容，或填入自己的免費 API Key / 升級 Pro 解鎖更長文檔。'
      : 'You can translate the first portion right now, or add your own API Key / upgrade to Pro for longer documents.';
  }

  const showFreeTransBtn = (mode === 'ai');
  const showTruncatedTransBtn = (mode === 'translate');
  const showKeyBtn = (tier !== 'byok');
  const showProBtn = (tier === 'free');

  replyBox.onclick = null;
  replyBox.style.cursor = '';
  replyBox.style.display = 'block';
  replyBox.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; gap:8px; text-align:center;">
      <div style="font-weight:800; color:#b45309; font-size:0.92rem;">${titleHtml}</div>
      <div style="font-size:0.83rem; color:#374151; max-width:640px; line-height:1.5;">${descHtml}</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:2px;">
        ${showFreeTransBtn ? `<button type="button" id="tpLimitSwitchTransBtn" style="padding:7px 14px; border:none; border-radius:999px; background:#1b5e20; color:#fff; font-weight:700; font-size:12.5px; cursor:pointer;">📝 ${isZh ? '改用免費翻譯與注音' : 'Use Free Translate & Pinyin'}</button>` : ''}
        ${showTruncatedTransBtn ? `<button type="button" id="tpLimitClipTransBtn" style="padding:7px 14px; border:none; border-radius:999px; background:#1b5e20; color:#fff; font-weight:700; font-size:12.5px; cursor:pointer;">✂️ ${isZh ? `先翻譯前 ${maxChars.toLocaleString()} 字` : `Translate First ${maxChars.toLocaleString()} Chars`}</button>` : ''}
        ${showKeyBtn ? `<button type="button" id="tpLimitOpenKeyBtn" style="padding:7px 14px; border:1.5px solid #2e7d32; border-radius:999px; background:#e8f5e9; color:#1b5e20; font-weight:700; font-size:12.5px; cursor:pointer;">🔑 ${isZh ? '填入自己的免費 API Key' : 'Add Own Free API Key'}</button>` : ''}
        ${showProBtn ? `<button type="button" id="tpLimitOpenProBtn" style="padding:7px 14px; border:1.5px solid #d97706; border-radius:999px; background:#fef3c7; color:#92400e; font-weight:700; font-size:12.5px; cursor:pointer;">💎 ${isZh ? '升級 Pro 訂閱' : 'Upgrade to Pro'}</button>` : ''}
      </div>
    </div>
  `;

  const swBtn = document.getElementById('tpLimitSwitchTransBtn');
  if (swBtn) {
    swBtn.addEventListener('click', () => {
      runDirectTranslate(rawText);
    });
  }
  const clipBtn = document.getElementById('tpLimitClipTransBtn');
  if (clipBtn) {
    clipBtn.addEventListener('click', () => {
      const clipped = rawText.slice(0, maxChars);
      const uIn = document.getElementById('userInput');
      if (uIn) {
        uIn.value = clipped;
        if (typeof handleUserInputChange === 'function') handleUserInputChange(uIn);
      }
      runDirectTranslate(clipped, { skipLengthCheck: true });
    });
  }
  const keyBtn = document.getElementById('tpLimitOpenKeyBtn');
  if (keyBtn) {
    keyBtn.addEventListener('click', () => {
      if (typeof openStudioKeyModal === 'function') openStudioKeyModal();
    });
  }
  const proBtn = document.getElementById('tpLimitOpenProBtn');
  if (proBtn) {
    proBtn.addEventListener('click', () => {
      if (typeof openStudioProModal === 'function') openStudioProModal();
    });
  }
}

async function runDirectTranslate(inputOverride, options = {}) {
  const raw = (inputOverride !== undefined ? inputOverride : document.getElementById('userInput').value).trim();
  if (!raw) return;
  if (checkAndRemindProfanity(raw)) return;

  const isOcr = !!(options && options.isOcr);
  const keepPreview = !!(options && options.keepPreview);
  const skipLengthCheck = !!(options && options.skipLengthCheck);

  if (!isOcr && !skipLengthCheck && typeof getActiveUserTier === 'function') {
    const tier = getActiveUserTier();
    const limits = getActiveTierLimits();
    if (raw.length > limits.transMaxChars) {
      showLongTextLimitCard('translate', raw, tier, limits);
      return;
    }
  }

  const prevImg = document.getElementById('previewImg');
  if (prevImg && !keepPreview) prevImg.style.display = 'none';
  const replyBox = document.getElementById('aiReplyBox');
  if (replyBox) {
    replyBox.onclick = null;
    replyBox.style.cursor = '';
    replyBox.style.display = 'none';
  }
  const limitBox = document.getElementById('apiLimitBox');
  if (limitBox) limitBox.style.display = 'none';
  const container = document.getElementById('sentencesContainer');
  container.innerHTML = '';

  const myReqSeq = ++activeRequestSeq;

  // 若來自圖片 OCR（含快取或備援）且整張圖為古詩／經典名句，直接還原零誤差權威原文與名家英譯
  if (isOcr) {
    const reconciled = await reconcileWholeOcrWithClassics(raw);
    if (myReqSeq !== activeRequestSeq) return;
    if (reconciled && renderReconciledClassicResult(reconciled, replyBox)) {
      const inputEl = document.getElementById('userInput');
      if (inputEl && reconciled.canonicalText) inputEl.value = reconciled.canonicalText;
      return;
    }
  }

  const lines = (window.TreesTextUtils && typeof window.TreesTextUtils.splitSentences === 'function')
    ? window.TreesTextUtils.splitSentences(raw, 120)
    : raw.replace(/\r\n/g, '\n').split(/\n+|(?<=[。！？.!?])\s+/).map(l => l.trim()).filter(Boolean);

  let validLines = lines.filter(line => !/^\d+$/.test(line) && !/^\d{2}:\d{2}:\d{2}[,.:]\d{3}\s*-->/.test(line));
  if (validLines.length === 0) return;
  const detectedPoem = isClassicalPoemLines(validLines);
  if (detectedPoem) {
    validLines = expandPoemVersesOnePerLine(validLines);
  }
  applyAutoPoemLayout(detectedPoem);

  // 僅對短句（<= 6 句且 <= 500 字）啟用個人 Key LLM；長篇文件與多句圖片改走 0.25s 分批流式 NMT + 經典詞庫，提速 5-10 倍
  const useUserKeyLLM = !!(backupKey && raw.length <= 500 && validLines.length <= 6);
  if (useUserKeyLLM && replyBox) {
    replyBox.style.display = 'block';
    replyBox.textContent = currentLang === 'en' ? '⚡ Translating accurately...' : '⚡ 正在精準翻譯並注音...';
  }

  const CHUNK_SIZE = 10;
  let classicMatchedCount = 0;
  let classicCorrectedCount = 0;
  const classicMatchedSources = new Set();
  const seenClassicZhKeys = new Set();

  for (let offset = 0; offset < validLines.length; offset += CHUNK_SIZE) {
    if (myReqSeq !== activeRequestSeq) return;
    const slice = validLines.slice(offset, offset + CHUNK_SIZE);
    const chunkResults = new Array(slice.length);
    const zhIdx = [], zhList = [], enIdx = [], enList = [];

    // 並行優先查 classics-api（僅前 25 行或 OCR 圖片，避免超長小說打過多請求；單行 10-40ms）
    const checkClassics = isOcr || validLines.length <= 25;
    const classicLookups = checkClassics
      ? await Promise.all(slice.map(line => (line.includes('|||') ? Promise.resolve(null) : matchClassicForOcrLine(line, isOcr))))
      : slice.map(() => null);
    if (myReqSeq !== activeRequestSeq) return;

    for (let i = 0; i < slice.length; i++) {
      const line = slice[i];
      if (line.includes('|||')) {
        const pair = parseBilingualPairLine(line);
        if (pair) {
          chunkResults[i] = pair;
          continue;
        }
      }
      const classicHit = classicLookups[i];
      if (classicHit) {
        const hitZhKey = String(classicHit.zh || '').replace(/[^\u4e00-\u9fa5]/g, '');
        // 去重：避免同一首古詩的多行 OCR 分別命中整首詩，導致整首詩被重複輸出兩遍
        if (hitZhKey && seenClassicZhKeys.has(hitZhKey)) {
          chunkResults[i] = null;
          continue;
        }
        if (hitZhKey) seenClassicZhKeys.add(hitZhKey);
        const expandedPairs = splitClassicIntoPairs(classicHit.zh, classicHit.en);
        if (expandedPairs.length > 1 && isClassicalPoemLines(expandedPairs.map(p => p.zh))) {
          applyAutoPoemLayout(true);
        }
        chunkResults[i] = expandedPairs.length > 1 ? { multi: expandedPairs } : { zh: classicHit.zh, en: classicHit.en };
        classicMatchedCount++;
        if (classicHit.corrected) classicCorrectedCount++;
        if (classicHit.source) classicMatchedSources.add(classicHit.source);
        continue;
      }
      // 保護純電話號碼／純數字符號（不含中英文字母）與純 Email／網址：絕不送去機器翻譯（避免免費翻譯 API 把 (+86) 00000000000 或 no_reply@example.com 翻成亂碼幻覺）
      const trimmedLine = line.trim();
      const isPureEmailOrUrl = /^(?:mailto:)?[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i.test(trimmedLine)
        || /^(?:https?:\/\/|www\.)\S+$/i.test(trimmedLine);
      if (isPureEmailOrUrl) {
        chunkResults[i] = { zh: trimmedLine, en: '' };
        continue;
      }
      const isPureNumberOrPhone = !/[\u4e00-\u9fa5A-Za-z]/.test(trimmedLine) && /\d/.test(trimmedLine);
      if (isPureNumberOrPhone) {
        chunkResults[i] = { zh: trimmedLine, en: trimmedLine };
        continue;
      }
      if (/[\u4e00-\u9fa5]/.test(line)) {
        zhIdx.push(i);
        zhList.push(line);
      } else {
        enIdx.push(i);
        enList.push(line);
      }
    }

    await Promise.all([
      (async () => {
        if (enList.length === 0) return;
        let zhTrans = useUserKeyLLM ? await translateLinesWithUserKey(enList, 'en', 'zh') : null;
        if (!zhTrans) zhTrans = await translateBatchFast(enList, 'en', 'zh', true);
        for (let k = 0; k < enIdx.length; k++) {
          // 嚴格鎖定原文：en 永遠是用戶輸入的原始英文 enList[k]，絕不被改寫或回譯
          chunkResults[enIdx[k]] = { zh: zhTrans[k] || enList[k], en: enList[k] };
        }
      })(),
      (async () => {
        if (zhList.length === 0) return;
        let enTrans = useUserKeyLLM ? await translateLinesWithUserKey(zhList, 'zh', 'en') : null;
        if (!enTrans) enTrans = await translateBatchFast(zhList, 'zh', 'en', true);
        for (let k = 0; k < zhIdx.length; k++) {
          // 嚴格鎖定原文：zh 永遠是用戶輸入的原始中文 zhList[k]，絕不被改寫或回譯
          chunkResults[zhIdx[k]] = { zh: zhList[k], en: enTrans[k] || '' };
        }
      })()
    ]);

    if (myReqSeq !== activeRequestSeq) return;
    if (offset === 0 && replyBox) replyBox.style.display = 'none';

    // 每批 10 句翻完立刻渲染上屏，長篇文件 0.25 秒即可開始閱讀
    for (const res of chunkResults) {
      if (!res) continue;
      if (Array.isArray(res.multi)) {
        for (const p of res.multi) appendSentenceProgressive(p.zh, p.en);
      } else {
        appendSentenceProgressive(res.zh, res.en);
      }
    }
    await nextPaintTick();
  }

  if (replyBox) {
    if (classicMatchedCount > 0) {
      const srcPreview = Array.from(classicMatchedSources).slice(0, 2).join(' | ');
      const fixNote = classicCorrectedCount > 0 ? ` · ${classicCorrectedCount} OCR typo fixed` : '';
      replyBox.style.display = 'block';
      replyBox.textContent = `📚 Classics DB · ${classicMatchedCount} item(s) verified${fixNote}${srcPreview ? ' · ' + srcPreview : ''}`;
    } else {
      replyBox.style.display = 'none';
    }
  }
}
async function runSmartAI(overrideInput, voiceAlts = [], fromVoice = false) {
  const q = (overrideInput !== undefined ? overrideInput : document.getElementById('userInput').value).trim();
  const altsToUse = fromVoice
    ? ((Array.isArray(voiceAlts) && voiceAlts.length > 0) ? voiceAlts.slice(0, 5) : [])
    : [];
  if (!fromVoice) latestVoiceCandidates = [];
  if (!q) return;

  // 長文本硬保護：防止免費公共池被超長文本消耗大量 Token；攔截時保留輸入框內容並引導分流
  if (typeof getActiveUserTier === 'function') {
    const tier = getActiveUserTier();
    const limits = getActiveTierLimits();
    if (q.length > limits.aiMaxChars) {
      lastFailedAiQuestion = q;
      showLongTextLimitCard('ai', q, tier, limits);
      return;
    }
  }

  // 800ms 內對完全相同問題的連點直接攔截，防止誤觸消耗雙倍配額
  const now = Date.now();
  if (q === lastSubmittedQuery && (now - lastSubmittedTime < 800)) {
    return;
  }
  lastSubmittedQuery = q;
  lastSubmittedTime = now;
  window.__tpLastAskedQuestion = q;

  const currentSeq = ++activeRequestSeq;

  const inputEl = document.getElementById('userInput');
  if (inputEl) {
    // 送出後立刻清空輸入框，避免下次提問混入前文；改由回答區頂端顯示本次提問並保留 3 輪記憶
    inputEl.value = '';
    autoResizeTextarea(inputEl);
    if (typeof updateInputCharCounter === 'function') updateInputCharCounter();
  }

  const limitBox = document.getElementById('apiLimitBox');
  if (limitBox) limitBox.style.display = 'none';
  const prevImg = document.getElementById('previewImg');
  if (prevImg) prevImg.style.display = 'none';

  if (checkAndRemindProfanity(q)) {
    return;
  }

  const replyBox = document.getElementById('aiReplyBox');
  const container = document.getElementById('sentencesContainer');
  if (replyBox) {
    replyBox.style.display = 'block';
    replyBox.innerHTML = (spokenLang === 'en') ? '⚡ AI Thinking...' : '⚡ AI 正在思考...';
  }
  if (container) {
    container.innerHTML = '';
    const qBar = document.createElement('div');
    qBar.id = 'tpCurrentQuestionBar';
    qBar.className = 'no-print';
    qBar.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; background:#f1f8e9; border:1px solid #c5e1a5; border-radius:10px; padding:7px 12px; margin-bottom:10px; font-size:13px; color:#1b5e20;';
    const qSpan = document.createElement('span');
    qSpan.id = 'tpCurrentQuestionText';
    qSpan.style.cssText = 'font-weight:700; word-break:break-word; cursor:pointer;';
    qSpan.title = 'Click to edit this question';
    qSpan.textContent = `💬 ${q}`;
    qSpan.addEventListener('click', () => {
      const uIn = document.getElementById('userInput');
      if (uIn) {
        uIn.value = qSpan.textContent.replace(/^💬\s*/, '');
        autoResizeTextarea(uIn);
        uIn.focus();
      }
    });
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = '↺ New Topic';
    resetBtn.title = 'Clear memory & answer fresh right now';
    resetBtn.style.cssText = 'flex-shrink:0; background:#fff; border:1px solid #a5d6a7; color:#1b5e20; border-radius:6px; padding:3px 9px; font-size:11.5px; font-weight:700; cursor:pointer;';
    resetBtn.addEventListener('click', () => {
      conversationHistory = [];
      lastInteractionTime = 0;
      lastSubmittedQuery = '';
      lastSubmittedTime = 0;
      const targetQ = (document.getElementById('userInput')?.value || '').trim() || lastFailedAiQuestion || window.__tpLastAskedQuestion || q;
      lastFailedAiQuestion = '';
      if (targetQ) {
        runSmartAI(targetQ);
      } else {
        resetBtn.textContent = '✓ Cleared';
        setTimeout(() => { resetBtn.textContent = '↺ New Topic'; }, 1200);
      }
    });
    qBar.appendChild(qSpan);
    qBar.appendChild(resetBtn);
    container.appendChild(qBar);
  }

  // 精確匹配高頻經典名篇／國歌（不論打字、語音或第幾輪，只要不是問賞析/作者/意思，一律 0ms 零誤差秒出）
  const isAskingAboutMeta = /為什麼|为什么|意思|作者|誰寫|谁写|背景|賞析|赏析|history|who wrote|meaning|why|explain|about\b/i.test(q);
  if (!isAskingAboutMeta) {
    for (const item of VERIFIED_CLASSICS) {
      if (item.match.test(q)) {
        if (replyBox) {
          replyBox.onclick = null;
          replyBox.style.cursor = '';
          replyBox.style.display = 'none';
        }
        const titleParts = item.title.split('·').map(s => s.trim());
        appendSentenceProgressive(titleParts[0] || item.title, titleParts.slice(1).join(' · ') || item.title);
        const memLines = [];
        for (const lineObj of item.lines) {
          appendSentenceProgressive(lineObj.zh, lineObj.en);
          memLines.push(`${lineObj.zh} ||| ${lineObj.en}`);
        }
        pushConversationMemory(q, memLines.join('\n'));
        return;
      }
    }
  }

  // 雲端 D1 中華經典四層匹配：在呼叫 AI 翻譯前，先將輸入按句拆分並優先請求 classics-api.treespinyin.com/api/classic/match
  // 命中的句子直接使用 zh_simp_display / zh_trad_display 與 en_display，完全跳過 AI 翻譯；僅未命中的句子才走 AI！
  let classicGlossaryPrompt = '';
  let classicRagRefLabel = '';
  if (!isAskingAboutMeta) {
    const inputSentences = (window.TreesTextUtils && typeof window.TreesTextUtils.splitSentences === 'function')
      ? window.TreesTextUtils.splitSentences(q, 180)
      : q.replace(/\r\n/g, '\n').split(/\n+|(?<=[。！？.!?])\s+/).map(s => s.trim()).filter(Boolean);
    const sentsToCheck = (inputSentences.length >= 1 && inputSentences.length <= 15) ? inputSentences : [q];
    const sentClassicHits = await Promise.all(sentsToCheck.map(s => matchClassicForOcrLine(s, true, 600)));
    if (currentSeq !== activeRequestSeq) return;

    const hitCount = sentClassicHits.filter(Boolean).length;
    if (hitCount > 0) {
      const memLines = [];
      const srcSet = new Set();
      // 若所有句子皆命中經典庫 -> 100% 跳過 AI 翻譯，直接輸出經典原文！
      if (hitCount === sentsToCheck.length) {
        for (const h of sentClassicHits) {
          const pairs = splitClassicIntoPairs(h.zh, h.en);
          for (const p of pairs) {
            appendSentenceProgressive(p.zh, p.en);
            memLines.push(`${p.zh} ||| ${p.en}`);
          }
          if (h.source) srcSet.add(h.source);
        }
        if (replyBox) {
          replyBox.onclick = null;
          replyBox.style.cursor = '';
          const srcLabel = Array.from(srcSet).slice(0, 2).join(' | ');
          if (srcLabel) {
            replyBox.style.display = 'block';
            replyBox.textContent = `📚 Verified Classic · ${srcLabel}`;
          } else {
            replyBox.style.display = 'none';
          }
        }
        lastFailedAiQuestion = '';
        pushConversationMemory(q, memLines.join('\n'));
        return;
      }

      // 若部分句子命中經典庫、部分句子未命中 -> 命中的句子直接用經典原文，只把未命中的句子送去翻譯，按原順序合併輸出！
      const missIndices = [];
      const missSents = [];
      for (let idx = 0; idx < sentsToCheck.length; idx++) {
        if (!sentClassicHits[idx]) {
          missIndices.push(idx);
          missSents.push(sentsToCheck[idx]);
        }
      }
      const resolvedPairs = new Array(sentsToCheck.length);
      for (let idx = 0; idx < sentsToCheck.length; idx++) {
        if (sentClassicHits[idx]) {
          resolvedPairs[idx] = { zh: sentClassicHits[idx].zh, en: sentClassicHits[idx].en };
          if (sentClassicHits[idx].source) srcSet.add(sentClassicHits[idx].source);
        }
      }
      for (let k = 0; k < missIndices.length; k++) {
        const mSent = missSents[k];
        const hasZh = /[\u4e00-\u9fa5]/.test(mSent);
        if (hasZh) {
          const enTr = await translateFast(mSent, 'zh', 'en');
          resolvedPairs[missIndices[k]] = { zh: mSent, en: enTr };
        } else {
          const zhTr = await translateFast(mSent, 'en', 'zh');
          resolvedPairs[missIndices[k]] = { zh: zhTr, en: mSent };
        }
      }
      if (currentSeq !== activeRequestSeq) return;
      for (const p of resolvedPairs) {
        if (!p) continue;
        appendSentenceProgressive(p.zh, p.en);
        memLines.push(`${p.zh} ||| ${p.en}`);
      }
      if (replyBox) {
        replyBox.onclick = null;
        replyBox.style.cursor = '';
        const srcLabel = Array.from(srcSet).slice(0, 2).join(' | ');
        replyBox.style.display = 'block';
        replyBox.textContent = `📚 Verified Classic (${hitCount}/${sentsToCheck.length}) · ${srcLabel}`;
      }
      lastFailedAiQuestion = '';
      pushConversationMemory(q, memLines.join('\n'));
      return;
    }
  }

  // 合併查庫：若前面已對單句 q 查過經典庫且未命中，不再重複發起第二次請求
  const classicMatch = isAskingAboutMeta ? await queryClassicMatcher(q, 600) : null;
  if (currentSeq !== activeRequestSeq) return;
  if (classicMatch && classicMatch.llm_glossary_prompt) {
    classicGlossaryPrompt = classicMatch.llm_glossary_prompt;
    const refSources = Array.from(new Set(
      (classicMatch.hits || [])
        .slice(0, 3)
        .map(h => [h.source, h.translator].filter(Boolean).join(' · '))
        .filter(Boolean)
    ));
    if (refSources.length > 0) {
      classicRagRefLabel = `📚 Classics Reference · ${refSources.slice(0, 2).join(' | ')}`;
    }
  }

  const memoryContext = buildMemoryContextString();
  const acousticInfo = fromVoice
    ? `[Voice Input] Mode: ${spokenLang === 'en' ? 'English (en-US)' : 'Mandarin (zh-CN)'} | Transcript: "${q}"${altsToUse.length > 1 ? ` | Top Alternatives: ${JSON.stringify(altsToUse)}` : ''}${spokenLang === 'zh' ? ` | ${getPhoneticTrackForAI(q)}` : ''}`
    : '';

  const voiceRule = fromVoice
    ? (spokenLang === 'en'
      ? [
          '1. ACCENT-TOLERANT ENGLISH VOICE UNDERSTANDING (NO META-CHATTER):',
          '   - This input came from English speech-to-text (en-US) and may have mild accent or ASR mishearings (e.g., "Lee buy"->"Li Bai", "tree spin yin"->"Trees Pinyin", "how to say a love you"->"how to say I love you").',
          '   - Combine the Top Alternatives + Recent Conversation History to silently understand the speaker\'s REAL English question.',
          '   - ONLY if you fixed an actual speech-to-text mishearing, put [FIXED_INPUT]: Clean_English_Question ALONE on line 1 followed immediately by a NEWLINE (\\n). NEVER put "|||" or answer content on the [FIXED_INPUT] line!'
        ]
      : [
          '1. MANDARIN VOICE CORRECTION (NO META-CHATTER):',
          '   - ONLY if the Mandarin voice transcript has an obvious homophone typo (e.g. "今夜思"->"靜夜思", "禮拜"->"李白"), put [FIXED_INPUT]: Corrected_Question_Text ALONE on line 1 followed immediately by a NEWLINE (\\n). NEVER put "|||" or answer content on the [FIXED_INPUT] line!'
        ])
    : [
        '1. DIRECT & ACCURATE ENGLISH-FIRST ANSWERS:',
        '   - Understand the user\'s exact question directly and accurately. NEVER twist or misinterpret normal English input as phonetic typos, and NEVER output meta-commentary.'
      ];

  const systemRules = [
    'You are a helpful, accurate, English-first Mandarin tutor and bilingual AI assistant for Western learners.',
    memoryContext,
    acousticInfo,
    classicGlossaryPrompt,
    '',
    'STRICT EXECUTION RULES (FOLLOW EXACTLY):',
    ...voiceRule,
    '2. POEMS, SONGS, LYRICS & FULL TEXT (WHEN ASKED):',
    '   - When the user asks for a poem, song, classic, lyric, or full text ("全文" / "完整"), output:',
    '     Line 1: 《名稱》作者 ||| English Title by Author',
    '     Line 2+: EVERY single 5-character or 7-character verse on its OWN separate line (NEVER combine two verses with a comma on the same line!), in exact order — NEVER shorten or summarize!',
    '   - Do NOT include background intro or filler.',
    '3. GENERAL QUESTIONS, PHRASES & FOLLOW-UPS (CLEAR, ACCURATE & TOPIC-AWARE):',
    '   - ONLY reference Recent Conversation History if the current User Question is clearly a follow-up (uses pronouns like "it", "that", "he", "she", "another one", "more", "why", "what does it mean", "他", "這首", "還有嗎", "全文", "完整", or continues the exact same topic).',
    '   - If the current User Question starts a NEW standalone or unrelated topic, COMPLETELY IGNORE Recent Conversation History and answer ONLY the current User Question!',
    '   - For normal Q&A (not songs/poems/full-text), give a warm, thorough, and practical answer in 2 to 5 clear sentences (never overly brief or perfunctory).',
    '   - When the user asks how to say something, word usage, or grammar differences, briefly explain the usage/nuance and proactively provide 1 to 2 natural everyday example sentences.',
    '4. STRICT BILINGUAL LINE FORMAT & ORIGINAL TEXT FIDELITY:',
    '   - Put EACH bilingual pair on its OWN separate line using ONE "|||":',
    '     Pure_Traditional_Chinese ||| Authentic_English',
    '   - NEVER put multiple "|||" pairs on the same line!',
    '   - Left side of "|||" must contain ONLY Traditional Chinese characters and Chinese punctuation (write numbers in Chinese characters; NO Pinyin or English letters on the left side).',
    '   - Use natural, idiomatic everyday spoken Mandarin (NEVER translate English idioms word-for-word). Always translate "Trees Pinyin" as "樹拼音", and ALWAYS use official canonical Chinese titles/texts for Chinese classics (e.g., 三字經, 百家姓, 千字文, 道德經, 論語, 孫子兵法).',
    '   - If the user asks to translate a specific sentence or phrase, ALWAYS preserve the user\'s EXACT original text on its corresponding side of "|||" — NEVER round-trip or re-translate it into altered wording.'
  ].filter(Boolean).join('\n');

  const wantsFullOrSmart = /全文|完整|歌詞|歌词|全詩|全诗|詩|诗|歌|賞析|赏析|解釋|解释|詳細|详细|怎麼用|怎么用|用法|差別|差别|區別|区别|為什麼|为什么|介紹|介绍|推薦|推荐|比較|比较|lyrics|full text|poem|song|explain|story|how\b|why\b|difference|compare|recommend|usage|meaning/i.test(q);
  const cloudCacheKey = (conversationHistory.length === 0 && !fromVoice) ? normalizeCloudCacheKey(q) : '';
  let prevStreamLongZhKey = '';
  let streamedPairsCount = 0;
  let streamedCorrectedQuery = '';

  const handleLiveAiLine = (rawLine) => {
    if (currentSeq !== activeRequestSeq || !rawLine) return;
    let lineToParse = rawLine;
    const fixedInfo = extractFixedInputFromLine(rawLine);
    if (fixedInfo) {
      if (fixedInfo.correctedQuery) {
        streamedCorrectedQuery = fixedInfo.correctedQuery;
        const qTextEl = document.getElementById('tpCurrentQuestionText');
        if (qTextEl) qTextEl.textContent = `💬 ${streamedCorrectedQuery}`;
      }
      if (!fixedInfo.remainder) return;
      lineToParse = fixedInfo.remainder;
    }
    if (isAIMetaChatterLine(lineToParse)) return;
    const pairs = parseBilingualPairsFromLine(lineToParse);
    if (pairs.length === 0) return;
    for (const pair of pairs) {
      const key = pair.zh.replace(/[^\u4e00-\u9fa5]/g, '');
      if (!key) continue;
      // 僅防長句連續卡頓重複，絕不刪除歌曲重複副歌（如「雪絨花」）！
      if (key.length >= 10 && key === prevStreamLongZhKey) continue;
      prevStreamLongZhKey = key;
      if (streamedPairsCount === 0 && replyBox) replyBox.style.display = 'none';
      const clauses = String(pair.zh || '').split(/(?<=[，。！？；])/).map(s => s.trim()).filter(Boolean);
      if (clauses.length >= 2 && clauses.every(c => {
        const len = c.replace(/[^\u4e00-\u9fa5]/g, '').length;
        return len === 5 || len === 7;
      })) {
        const enAligned = splitEnglishToMatchCount(pair.en, clauses.length);
        applyAutoPoemLayout(true);
        for (let ci = 0; ci < clauses.length; ci++) {
          streamedPairsCount++;
          appendSentenceProgressive(clauses[ci], enAligned[ci] || '');
        }
      } else {
        streamedPairsCount++;
        appendSentenceProgressive(pair.zh, pair.en);
      }
    }
  };

  const { text: aiText, source, diagError, usedPublicPool, limitReached, textTooLong, userKeyFailed, usedLocalNano } = await fetchFastAccurateAI(
    systemRules,
    q,
    cloudCacheKey,
    null,
    handleLiveAiLine,
    wantsFullOrSmart
  );

  if (currentSeq !== activeRequestSeq) return;

  if (textTooLong && typeof getActiveUserTier === 'function') {
    lastFailedAiQuestion = q;
    const uIn = document.getElementById('userInput');
    if (uIn && !uIn.value) {
      uIn.value = q;
      if (typeof handleUserInputChange === 'function') handleUserInputChange(uIn);
    }
    showLongTextLimitCard('ai', q, getActiveUserTier(), getActiveTierLimits());
    return;
  }

  if (aiText) {
    let ok = streamedPairsCount > 0;
    let correctedQuery = streamedCorrectedQuery;
    if (!ok) {
      const rendered = await renderBilingualAIOutput(aiText);
      ok = rendered.ok;
      correctedQuery = rendered.correctedQuery || correctedQuery;
    }
    if (ok) {
      lastFailedAiQuestion = '';
      if (correctedQuery && conversationHistory.length === 0) {
        saveAnswerToPersistentCache(normalizeCloudCacheKey(correctedQuery), aiText);
      }
      pushConversationMemory(correctedQuery || q, aiText);
      if (backupKey && diagError && replyBox) {
        const safeSrc = window.TreesTextUtils ? window.TreesTextUtils.escapeHtml(source) : source;
        const safeErr = window.TreesTextUtils ? window.TreesTextUtils.escapeHtml(diagError.slice(0, 140)) : diagError.slice(0, 140);
        replyBox.onclick = null;
        replyBox.style.cursor = '';
        replyBox.style.display = 'block';
        replyBox.textContent = `ℹ️ Answered via ${safeSrc} (Note: ${safeErr})`;
      } else if (usedLocalNano && replyBox) {
        replyBox.onclick = null;
        replyBox.style.cursor = '';
        replyBox.style.display = 'block';
        replyBox.innerHTML = currentLang === 'zh'
          ? '💡 <b>現在是使用您自己的 Nano 簡化 AI</b> — 如果需要更準確的回答，請點右上角填入免費 <b>🔑 API Key</b>，或在自己瀏覽器 AI（如 Google Gemini）詢問好後貼上過來。'
          : '💡 <b>Using your device\'s simplified Chrome Nano AI</b> — For higher accuracy, add your own free <b>🔑 API Key</b> or ask your browser AI (e.g. Google Gemini) and paste the reply here.';
      } else if (classicRagRefLabel && replyBox) {
        replyBox.onclick = null;
        replyBox.style.cursor = '';
        replyBox.style.display = 'block';
        replyBox.textContent = classicRagRefLabel;
      } else if (replyBox) {
        replyBox.style.display = 'none';
      }
      if (!backupKey && usedPublicPool && limitBox) {
        const pubCount = getAndIncrementPublicUsage();
        if (pubCount >= FREE_PUBLIC_REMINDER_THRESHOLD) {
          limitBox.style.display = 'block';
        }
      }
      return;
    }
  }

  // 4. 當所有 AI 通道皆無法連線時，記錄此題供設定 Key 後自動重問，並給出原句雙語注音保底
  lastFailedAiQuestion = q;
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

  const hasUserKey = !!getActiveUserApiKey();
  if (replyBox) {
    replyBox.onclick = null;
    replyBox.style.cursor = '';
    replyBox.style.display = 'block';
    const headline = hasUserKey
      ? (currentLang === 'zh' ? '🔑 您的個人 Gemini API Key 暫時無法連線或已達上限。' : '🔑 Your personal Gemini API Key is busy or needs verification.')
      : (limitReached || /LIMIT_REACHED/i.test(diagError || '')
        ? (currentLang === 'zh' ? '✨ 今日免費高速 AI 額度已用完 — 選擇以下任一免費 Google 方式繼續：' : '✨ Daily free AI quota reached — continue free with Google:')
        : (currentLang === 'zh' ? '⚡ 免費公共 AI 目前較忙碌 — 選擇以下任一免費 Google 方式秒獲解答：' : '⚡ Free AI pool is busy right now — continue free with Google:'));

    replyBox.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
        <div style="font-weight:700; color:#1b5e20;">${headline}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
          <button type="button" id="tpAskGeminiWebBtn" style="padding:6px 14px; border:none; border-radius:999px; background:#1a73e8; color:#fff; font-weight:700; font-size:13px; cursor:pointer;">✨ ${currentLang === 'zh' ? '複製問題去問 Google Gemini ↗' : 'Copy & Ask Google Gemini ↗'}</button>
          <button type="button" id="tpOpenKeyQuickBtn" style="padding:6px 14px; border:1px solid #2e7d32; border-radius:999px; background:#e8f5e9; color:#1b5e20; font-weight:700; font-size:13px; cursor:pointer;">🔑 ${currentLang === 'zh' ? '填入免費 Gemini API Key' : 'Add Free Gemini API Key'}</button>
        </div>
      </div>
    `;
    const askBtn = document.getElementById('tpAskGeminiWebBtn');
    if (askBtn) {
      askBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(q).catch(() => {});
        window.open('https://gemini.google.com/app', '_blank', 'noopener,noreferrer');
      });
    }
    const keyQuickBtn = document.getElementById('tpOpenKeyQuickBtn');
    if (keyQuickBtn) {
      keyQuickBtn.addEventListener('click', () => openStudioKeyModal());
    }
  }
  if (!hasUserKey && limitBox) limitBox.style.display = 'block';
}

