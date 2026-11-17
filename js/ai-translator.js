/**
 * 模組 4: js/ai-translator.js (商業化高併發極速直出無報錯版)
 * 負責：
 * 1. 14 篇經典古詩文與常用問答 0ms 純用戶端秒回
 * 2. 個人 Key ➔ Cloudflare Worker 池 + 多路免 Key 大模型賽馬併發 (Promise.any)，1~2秒直出答案
 * 3. 徹底移除 [Worker: Timeout] / [Worker: HTTP 405] 等技術報錯橫幅，100% 靜默無感容錯
 * 4. 長文多句合併單次翻譯，杜絕 429 封鎖與二次轉譯
 */
const BUILTIN_QA_CACHE = {
  "咏鹅": "《詠鵝》唐・駱賓王 ||| Ode to the Goose by Luo Binwang\n鵝，鵝，鵝， ||| Goose, goose, goose,\n曲項向天歌。 ||| You bend your neck and sing to the sky.\n白毛浮綠水， ||| Your white feathers float on the emerald water,\n紅掌撥清波。 ||| Your red webbed feet paddle the clear waves.",
  "静夜思": "《靜夜思》唐・李白 ||| Quiet Night Thought by Li Bai\n床前明月光， ||| Before my bed, the bright moonlight shines,\n疑是地上霜。 ||| I wonder if it is frost upon the ground.\n舉頭望明月， ||| I raise my head to gaze at the bright moon,\n低頭思故鄉。 ||| And lower my head, longing for my hometown.",
  "春晓": "《春曉》唐・孟浩然 ||| Spring Morning by Meng Haoran\n春眠不覺曉， ||| In spring sleep, I am unaware of the dawn,\n處處聞啼鳥。 ||| Everywhere I hear the singing of birds.\n夜來風雨聲， ||| Last night came the sound of wind and rain,\n花落知多少。 ||| Who knows how many blossoms have fallen.",
  "登鹳雀楼": "《登鸛雀樓》唐・王之渙 ||| On the Stork Tower by Wang Zhihuan\n白日依山盡， ||| The white sun sets behind the mountains,\n黃河入海流。 ||| And the Yellow River flows into the sea.\n欲窮千里目， ||| To see a thousand miles further,\n更上一層樓。 ||| Climb one more story higher.",
  "望庐山瀑布": "《望廬山瀑布》唐・李白 ||| Viewing the Lushan Waterfall by Li Bai\n日照香爐生紫煙， ||| Sunlight shines on Incense Burner Peak, kindling purple mist,\n遙看瀑布掛前川。 ||| From afar I watch the waterfall hanging like a river before the cliff.\n飛流直下三千尺， ||| Its flying torrent plunges straight down three thousand feet,\n疑是銀河落九天。 ||| As if the Milky Way were falling from the highest heavens.",
  "早发白帝城": "《早發白帝城》唐・李白 ||| Departing from Baidi City at Dawn by Li Bai\n朝辭白帝彩雲間， ||| At dawn I leave Baidi City amidst the glowing clouds,\n千里江陵一日還。 ||| A thousand miles to Jiangling I return in a single day.\n兩岸猿聲啼不住， ||| The cries of monkeys along both banks never cease,\n輕舟已過萬重山。 ||| While my light boat has already slipped past ten thousand mountains.",
  "赠汪伦": "《贈汪倫》唐・李白 ||| To Wang Lun by Li Bai\n李白乘舟將欲行， ||| I, Li Bai, sit aboard a boat about to set off,\n忽聞岸上踏歌聲。 ||| When suddenly I hear the sound of singing and dancing on the shore.\n桃花潭水深千尺， ||| The Peach Blossom Pool is a thousand feet deep,\n不及汪倫送我情。 ||| Yet not as deep as the farewell love Wang Lun shows to me.",
  "春夜喜雨": "《春夜喜雨》唐・杜甫 ||| Happy Rain on a Spring Night by Du Fu\n好雨知時節， ||| The good rain knows its proper season,\n當春乃發生。 ||| Right in spring it comes to bring new life.\n隨風潛入夜， ||| With the breeze it steals in softly by night,\n潤物細無聲。 ||| Moistening all things gently and without a sound.",
  "相思": "《相思》唐・王維 ||| Love Seeds by Wang Wei\n紅豆生南國， ||| Red beans grow in the southern lands,\n春來發幾枝。 ||| When spring arrives, how many new branches will sprout?\n願君多採擷， ||| I wish you would gather plenty of them,\n此物最相思。 ||| For these fond tokens best awaken longing.",
  "梅花": "《梅花》宋・王安石 ||| Plum Blossoms by Wang Anshi\n牆角數枝梅， ||| At the corner of the wall stand several branches of plum blossoms,\n凌寒獨自開。 ||| Braving the winter chill, blooming all on their own.\n遙知不是雪， ||| From afar I know they are not snow,\n為有暗香來。 ||| For a subtle, delicate fragrance drifts through the air.",
  "鹿柴": "《鹿柴》唐・王維 ||| Deer Enclosure by Wang Wei\n空山不見人， ||| In the empty mountain no one is seen,\n但聞人語響。 ||| Only the echoes of human voices are heard.\n返景入深林， ||| Slanting sunlight enters the deep woods,\n復照青苔上。 ||| And shines again upon the green moss.",
  "悯农": "《憫農》唐・李紳 ||| Sympathy for the Peasants by Li Shen\n鋤禾日當午， ||| Hoeing millet under the midday sun,\n汗滴禾下土。 ||| Sweat drips onto the soil beneath the grain.\n誰知盤中餐， ||| Who knows that every grain in the bowl,\n粒粒皆辛苦。 ||| Comes from hard and bitter toil.",
  "水调歌头": "《水調歌頭》宋・蘇軾 ||| Mid-Autumn Tune by Su Shi\n明月幾時有，把酒問青天。 ||| When did the bright moon first appear? Raising my cup, I ask the blue sky.\n不知天上宮闕，今夕是何年。 ||| I wonder what year it is tonight in the palaces of heaven.\n人有悲歡離合，月有陰晴圓缺，此事古難全。 ||| People have sorrow and joy, parting and reunion; the moon is dim or bright, waxing or waning.\n但願人長久，千里共嬋娟。 ||| May we all live long and share the beauty of the moon, though a thousand miles apart.",
  "三字经": "《三字經》經典節選 ||| Three Character Classic\n人之初，性本善。 ||| Men at their birth are naturally good.\n性相近，習相遠。 ||| Their natures are much the same; their habits become wide apart.\n苟不教，性乃遷。 ||| If foolishly there is no teaching, the nature will deteriorate.\n教之道，貴以專。 ||| The right way in teaching is to attach the utmost importance to thoroughness."
};

function normalizeCloudCacheKey(rawQ) {
  if (!rawQ) return '';
  const fixed = applyFuzzyVoiceCorrection(rawQ);
  return fixed
    .toLowerCase()
    .replace(/請背誦|请背诵|背誦|背诵|唐詩|唐诗|古詩|古诗|一首/g, '')
    .replace(/[\s,.?!，。？！、：:；;《》〈〉"“”'‘’()（）]/g, '')
    .replace(/詠/g, '咏')
    .replace(/鵝/g, '鹅')
    .replace(/靜/g, '静')
    .replace(/曉/g, '晓')
    .replace(/鸛/g, '鹳')
    .replace(/樓/g, '楼')
    .replace(/廬/g, '庐')
    .replace(/發/g, '发')
    .replace(/贈/g, '赠')
    .replace(/倫/g, '伦')
    .replace(/憫/g, '悯')
    .replace(/農/g, '农')
    .replace(/調/g, '调')
    .replace(/頭/g, '头')
    .replace(/經/g, '经')
    .slice(0, 120);
}

let backupKey = '';
try {
  backupKey = (localStorage.getItem('tp_v22_backup_key') || localStorage.getItem('tp_test_gemini_key') || '').trim();
} catch (e) {}

let availableFastModels = [
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemma-3-27b-it'
];
let modelsDiscoveredForKey = '';

try {
  const cachedModelMeta = JSON.parse(localStorage.getItem('tp_v15_discovered_models') || 'null');
  if (cachedModelMeta && cachedModelMeta.key === backupKey && (Date.now() - cachedModelMeta.ts < 86400000) && Array.isArray(cachedModelMeta.models) && cachedModelMeta.models.length > 0) {
    availableFastModels = cachedModelMeta.models;
    modelsDiscoveredForKey = backupKey;
  }
} catch (e) {}

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
    if (keys.length >= 150 && !store[cacheKey]) {
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

function fetchWithTimeout(url, options = {}, timeoutMs = 6500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function callSingleGeminiModel(modelName, fullPromptText, activeKey, signal, dataUrl = null) {
  const cleanKey = activeKey.replace(/\s+/g, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(cleanKey)}`;

  const parts = [{ text: fullPromptText }];
  if (dataUrl && dataUrl.includes(',')) {
    const mime = dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';'));
    parts.push({ inline_data: { mime_type: mime, data: dataUrl.split(',')[1] } });
  }

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1200 }
    }),
    signal
  });

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

  if (!text && resParts.length > 0) {
    text = resParts.map(p => p.text || '').join('').trim();
  }

  if (!text) throw new Error(`[${modelName}] EMPTY_RESPONSE`);
  return text;
}

// 多通道賽馬免 Key AI 引擎（同時嘗試 Pollinations POST 與極速 GET 通道，誰先返回用誰）
async function callKeylessFreeOpenSourceLLM(systemRules, userQuestion) {
  const shortSys = systemRules || 'Output strictly in format: Traditional_Chinese ||| English';
  const tasks = [
    fetchWithTimeout('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai-fast',
        messages: [
          { role: 'system', content: shortSys },
          { role: 'user', content: userQuestion }
        ],
        temperature: 0.15
      })
    }, 6500).then(async r => {
      if (!r.ok) throw new Error('status_' + r.status);
      const d = await r.json();
      const txt = (d?.choices?.[0]?.message?.content || '').trim();
      if (!txt) throw new Error('empty');
      return txt;
    }),
    fetchWithTimeout(
      `https://text.pollinations.ai/${encodeURIComponent(shortSys + '\nUser Question: ' + userQuestion)}?model=openai-fast`,
      { method: 'GET' },
      6500
    ).then(async r => {
      if (!r.ok) throw new Error('status_' + r.status);
      const txt = (await r.text() || '').trim();
      if (!txt || txt.startsWith('<!DOCTYPE')) throw new Error('empty');
      return txt;
    })
  ];

  try {
    return await Promise.any(tasks);
  } catch (e) {
    return '';
  }
}

// 調用您的 Cloudflare Worker 單一主端點 (根除無效 /api 的 405 報錯)
async function callCloudflareWorkerPool(fullPromptText, dataUrl, cacheKey, timeoutMs = 7500) {
  const endpoint = 'https://treespinyin-api.treespinyin.workers.dev';
  const r = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: fullPromptText,
      image: dataUrl || null,
      cacheKey: dataUrl ? '' : (cacheKey || '')
    })
  }, timeoutMs);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.detail || d?.error || `HTTP_${r.status}`);
  const t = (d?.text || d?.reply || d?.choices?.[0]?.message?.content || '').trim();
  if (!t) throw new Error('EMPTY_WORKER');
  return t;
}

// 商業化極速容錯調度器：個人 Key ➔ (Cloudflare 全球池 + 免 Key 高速大模型 賽馬併發)
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

  // 0. 本機持久/內建快取 0 毫秒極速返回！
  if (!dataUrl && cacheKey && sessionDynamicCache.has(cacheKey)) {
    return { text: sessionDynamicCache.get(cacheKey), source: 'Instant Cache', diagError: null, usedPublicPool: false };
  }

  const modalKeyVal = (document.getElementById('apiKeyInput')?.value || '').trim();
  const activeKey = (backupKey || modalKeyVal).replace(/\s+/g, '');

  // 1. 若用戶填了個人 Gemini Key：優先走個人 Key
  if (activeKey) {
    if (modelsDiscoveredForKey !== activeKey) {
      discoverAuthorizedModels(activeKey);
    }
    const modelsToTry = dataUrl
      ? availableFastModels.filter(m => !/gemma/i.test(m)).slice(0, 2)
      : availableFastModels.slice(0, 2);

    for (let i = 0; i < modelsToTry.length; i++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7500);
      try {
        const txt = await callSingleGeminiModel(modelsToTry[i], fullPromptText, activeKey, ctrl.signal, dataUrl);
        clearTimeout(timer);
        if (txt) {
          if (!dataUrl && cacheKey) saveAnswerToPersistentCache(cacheKey, txt);
          return { text: txt, source: `Google (${modelsToTry[i]})`, diagError: null, usedPublicPool: false };
        }
      } catch (e) {
        clearTimeout(timer);
        if (/API_KEY_INVALID|key not valid/i.test(e?.message || '')) break;
      }
    }
  }

  // 2. 免 Key 極速雙引擎賽馬：同時向 Cloudflare Worker 與免 Key 開源大模型發起請求，誰快用誰！
  if (!dataUrl) {
    try {
      const winnerText = await Promise.any([
        callCloudflareWorkerPool(fullPromptText, null, cacheKey, 6500),
        // 延遲 600ms 啟動免 Key 備援，若 Cloudflare Worker 快取命中則 0.2s 直接返回，若 Worker 繁忙則無縫由備援秒回！
        new Promise((resolve, reject) => {
          setTimeout(() => {
            callKeylessFreeOpenSourceLLM(sysRules || 'You are a helpful bilingual Mandarin assistant.', userQ)
              .then(res => res ? resolve(res) : reject(new Error('empty')))
              .catch(reject);
          }, 600);
        })
      ]);
      if (winnerText) {
        if (cacheKey) saveAnswerToPersistentCache(cacheKey, winnerText);
        return { text: winnerText, source: 'High-Speed Cloud AI', diagError: null, usedPublicPool: true };
      }
    } catch (e) {}
  } else {
    // 圖片請求：走 Cloudflare Worker 主端點與 /vision-ocr 雙路併發
    try {
      const visionWinner = await Promise.any([
        callCloudflareWorkerPool(fullPromptText, dataUrl, '', 9500),
        fetchWithTimeout('https://treespinyin-api.treespinyin.workers.dev/vision-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: dataUrl, prompt: fullPromptText })
        }, 9500).then(async r => {
          if (!r.ok) throw new Error('HTTP_' + r.status);
          const d = await r.json();
          const t = (d?.text || d?.reply || '').trim();
          if (!t) throw new Error('empty');
          return t;
        })
      ]);
      if (visionWinner) {
        return { text: visionWinner, source: 'Cloud Vision AI', diagError: null, usedPublicPool: true };
      }
    } catch (e) {}
  }

  return { text: '', source: 'none', diagError: null, usedPublicPool: true };
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
  replyBox.innerText = (currentLang === 'en' && spokenLang === 'en') ? '⚡ AI Thinking...' : '⚡ AI 正在極速回答...';
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

  const cloudCacheKey = (conversationHistory.length === 0 && !fromVoice) ? normalizeCloudCacheKey(q) : '';
  const { text: aiText } = await fetchFastAccurateAI(systemRules, q, cloudCacheKey);

  if (currentSeq !== activeRequestSeq) return;

  if (aiText) {
    const { ok, correctedQuery } = await renderBilingualAIOutput(aiText);
    if (ok) {
      if (correctedQuery && conversationHistory.length === 0) {
        saveAnswerToPersistentCache(normalizeCloudCacheKey(correctedQuery), aiText);
      }
      pushConversationMemory(correctedQuery || q, aiText);
      replyBox.style.display = 'none';
      return;
    }
  }

  // 當處於離線或極端無網路環境時：直接靜默給出雙語翻譯與四位一體注音，絕不彈出任何 API Note 報錯！
  replyBox.style.display = 'none';
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

  if (/docs\.google\.com\/|drive\.google\.com\/|dropbox\.com\//i.test(raw)) {
    replyBox.style.display = 'block';
    replyBox.innerText = currentLang === 'en' ? '📄 Fetching cloud document...' : '📄 正在極速讀取雲端文檔...';
    const docText = await fetchCloudDocumentByUrl(raw);
    if (docText) {
      raw = docText.slice(0, 4000).trim();
      document.getElementById('userInput').value = raw;
      replyBox.style.display = 'none';
    } else {
      replyBox.innerText = currentLang === 'en'
        ? '⚠️ Please make sure the Google Doc link is set to "Anyone with the link can view".'
        : '⚠️ 請確認該 Google Docs 連結已設為「知道連結的任何人均可檢視」，或直接複製文字貼上。';
      return;
    }
  }

  // 若已經是 Source ||| Target 對齊格式，直接渲染不二次轉譯
  if (raw.includes('|||')) {
    const pairLines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
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
