/**
 * 模組 4: js/ai-translator.js
 * 負責：商業化免維護 AI 問答引擎 (100% 用戶端資源優先、防卡死超時鎖、14篇經典名篇+120條持久快取、五層容錯調度) 與極速批量雙向翻譯
 */
const VERIFIED_CLASSICS = [
  {
    match: /靜夜思|静夜思|床前明月光|\bquiet night thoughts?\b/i,
    key: "静夜思",
    reply: "《靜夜思》唐・李白 ||| Quiet Night Thoughts by Li Bai\n床前明月光， ||| Bright moonlight shines right before my bed,\n疑是地上霜。 ||| Looking just like a layer of white frost on the ground.\n舉頭望明月， ||| I raise my head to gaze at the glowing moon,\n低頭思故鄉。 ||| Then lower my head, thinking of my hometown."
  },
  {
    match: /望廬山瀑布|望庐山瀑布|飛流直下三千尺/i,
    key: "望庐山瀑布",
    reply: "《望廬山瀑布》唐・李白 ||| Viewing the Lushan Waterfall by Li Bai\n日照香爐生紫煙， ||| Sunlight shines on Incense Burner Peak, kindling purple mist,\n遙看瀑布掛前川。 ||| From afar I watch the waterfall hanging like a river before the cliff.\n飛流直下三千尺， ||| Its flying torrent plunges straight down three thousand feet,\n疑是銀河落九天。 ||| As if the Milky Way were falling from the highest heavens."
  },
  {
    match: /早發白帝城|早发白帝城|朝辭白帝彩雲間|兩岸猿聲啼不住/i,
    key: "早发白帝城",
    reply: "《早發白帝城》唐・李白 ||| Departing from Baidi City at Dawn by Li Bai\n朝辭白帝彩雲間， ||| At dawn I leave Baidi City amidst the glowing clouds,\n千里江陵一日還。 ||| A thousand miles to Jiangling I return in a single day.\n兩岸猿聲啼不住， ||| The cries of monkeys along both banks never cease,\n輕舟已過萬重山。 ||| While my light boat has already slipped past ten thousand mountains."
  },
  {
    match: /贈汪倫|赠汪伦|桃花潭水深千尺/i,
    key: "赠汪伦",
    reply: "《贈汪倫》唐・李白 ||| To Wang Lun by Li Bai\n李白乘舟將欲行， ||| I, Li Bai, sit aboard a boat about to set off,\n忽聞岸上踏歌聲。 ||| When suddenly I hear the sound of singing and dancing on the shore.\n桃花潭潭水深千尺， ||| The Peach Blossom Pool is a thousand feet deep,\n不及汪倫送我情。 ||| Yet not as deep as the farewell love Wang Lun shows to me."
  },
  {
    match: /春夜喜雨|好雨知時節/i,
    key: "春夜喜雨",
    reply: "《春夜喜雨》唐・杜甫 ||| Happy Rain on a Spring Night by Du Fu\n好雨知時節， ||| The good rain knows its proper season,\n當春乃發生。 ||| Right in spring it comes to bring new life.\n隨風潛入夜， ||| With the breeze it steals in softly by night,\n潤物細無聲。 ||| Moistening all things gently and without a sound."
  },
  {
    match: /相思|紅豆生南國/i,
    key: "相思",
    reply: "《相思》唐・王維 ||| Love Seeds by Wang Wei\n紅豆生南國， ||| Red beans grow in the southern lands,\n春來發幾枝。 ||| When spring arrives, how many new branches will sprout?\n願君多採擷， ||| I wish you would gather plenty of them,\n此物最相思。 ||| For these fond tokens best awaken longing."
  },
  {
    match: /梅花|詠梅|咏梅|王安石|暗香|\bplum blossoms?\b/i,
    key: "梅花",
    reply: "《梅花》宋・王安石 ||| Plum Blossoms by Wang Anshi\n牆角數枝梅， ||| At the corner of the wall stand several branches of plum blossoms,\n凌寒獨自開。 ||| Braving the winter chill, blooming all on their own.\n遙知不是雪， ||| From afar I know they are not snow,\n為有暗香來。 ||| For a subtle, delicate fragrance drifts through the air."
  },
  {
    match: /三字經|三字经|\bthree character classic\b/i,
    key: "三字经",
    reply: "《三字經》 ||| Three Character Classic\n人之初，性本善。性相近，習相遠。 ||| Men at their birth are naturally good. Their natures are much the same; their habits become wide apart.\n苟不教，性乃遷。教之道，貴以專。 ||| If foolishly there is no teaching, the nature will deteriorate. The right way in teaching is to attach the utmost importance to thoroughness.\n昔孟母，擇鄰處。子不學，斷機杼。 ||| Of old, the mother of Mencius chose a neighborhood; when her child would not learn, she broke the shuttle from the loom.\n養不教，父之過。教不嚴，師之惰。 ||| To feed without teaching is the father's fault; to teach without severity is the teacher's laziness.\n玉不琢，不成器。人不學，不知義。 ||| If jade is not polished, it cannot become a thing of use. If a person does not learn, he cannot know righteousness."
  },
  {
    match: /千字文|天地玄黃|天地玄黄|\bthousand character classic\b/i,
    key: "千字文",
    reply: "《千字文》 ||| Thousand Character Classic\n天地玄黃，宇宙洪荒。 ||| The sky was dark and the earth yellow; space and time were vast and boundless.\n日月盈昃，辰宿列張。 ||| The sun shines and sets, the moon waxes and wanes; stars and constellations are spread across the sky.\n寒來暑往，秋收冬藏。 ||| Cold comes and summer goes; autumn is for harvesting and winter for storing."
  },
  {
    match: /弟子規|弟子规/i,
    key: "弟子规",
    reply: "《弟子規》 ||| Standards for Being a Good Student and Child\n弟子規，聖人訓。首孝悌，次謹信。 ||| Standards for students are taught by the sages: first be filial and fraternal, next be cautious and trustworthy.\n汎愛眾，而親仁。有餘力，則學文。 ||| Love all equally and be close to the humane; if you have energy to spare, study literature and arts."
  },
  {
    match: /詠鵝|咏鹅|\bode to the goose\b/i,
    key: "咏鹅",
    reply: "《詠鵝》唐・駱賓王 ||| Ode to the Goose by Luo Binwang\n鵝，鵝，鵝， ||| Goose, goose, goose,\n曲項向天歌。 ||| You curve your neck and sing toward the sky.\n白毛浮綠水， ||| Your white feathers float on the green water,\n紅掌撥清波。 ||| While your red webbed feet paddle the clear waves."
  },
  {
    match: /春曉|春晓|春眠不覺曉|孟浩然|\bspring morning\b/i,
    key: "春晓",
    reply: "《春曉》唐・孟浩然 ||| Spring Morning by Meng Haoran\n春眠不覺曉， ||| In spring I sleep soundly without noticing the dawn,\n處處聞啼鳥。 ||| Everywhere I hear the joyful singing of birds.\n夜來風雨聲， ||| Last night came the sound of wind and rain,\n花落知多少。 ||| Who knows how many blossoms have fallen?"
  },
  {
    match: /登鸛雀樓|登鹳雀楼|白日依山盡|王之渙/i,
    key: "登鹳雀楼",
    reply: "《登鸛雀樓》唐・王之渙 ||| On the Stork Tower by Wang Zhihuan\n白日依山盡， ||| The bright sun sets behind the mountains,\n黃河入海流。 ||| And the Yellow River flows into the sea.\n欲窮千里目， ||| To see a thousand miles further,\n更上一層樓。 ||| Climb up one more story of the tower."
  },
  {
    match: /水調歌頭|水调歌头|明月幾時有|明月几时有/i,
    key: "水调歌头",
    reply: "《水調歌頭・明月幾時有》宋・蘇軾 ||| Su Shi's Mid-Autumn Lyric\n明月幾時有？把酒問青天。 ||| When did the bright moon first appear? Raising my cup, I ask the blue sky.\n不知天上宮闕，今夕是何年。 ||| I wonder what year it is tonight in the palaces of heaven.\n人有悲歡離合，月有陰晴圓缺，此事古難全。 ||| People have sorrow and joy, parting and reunion; the moon is dim or bright, waxing or waning—nothing has been perfect since ancient times.\n但願人長久，千里共嬋娟。 ||| May we all live long and share the beauty of the moon, though a thousand miles apart."
  }
];

function normalizeCloudCacheKey(rawQ) {
  if (!rawQ) return '';
  const fixed = typeof applyFuzzyVoiceCorrection === 'function' ? applyFuzzyVoiceCorrection(rawQ) : rawQ;
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

let availableFastModels = [
  'gemini-flash-lite-latest',
  'gemini-flash-latest'
];
let modelsDiscoveredForKey = '';

try {
  const cachedModelMeta = JSON.parse(localStorage.getItem('tp_v15_discovered_models') || 'null');
  if (cachedModelMeta && cachedModelMeta.key === backupKey && (Date.now() - cachedModelMeta.ts < 86400000) && Array.isArray(cachedModelMeta.models) && cachedModelMeta.models.length > 0) {
    availableFastModels = cachedModelMeta.models.filter(m => !/gemma-3-27b-it/i.test(m));
    modelsDiscoveredForKey = backupKey;
  }
} catch (e) {}

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

const PERSISTENT_CACHE_STORAGE_KEY = 'tp_v15_persistent_qa_cache';
const sessionDynamicCache = new Map();

(function loadPersistentCache() {
  for (const item of VERIFIED_CLASSICS) {
    sessionDynamicCache.set(item.key, item.reply);
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
      .filter(n => !/tts|image|imagen|embedding|veo|robotics|aqa|bison|gecko|thinking|exp|preview|gemma-3-27b-it|1\.5-|2\.0-/i.test(n));

    const versionedFlashLite = validModels
      .filter(n => /^gemini-\d+(\.\d+)?-flash-lite$/i.test(n))
      .sort((a, b) => {
        const vA = parseFloat(a.match(/gemini-(\d+(?:\.\d+)?)/i)?.[1] || '0');
        const vB = parseFloat(b.match(/gemini-(\d+(?:\.\d+)?)/i)?.[1] || '0');
        return vB - vA;
      });

    const versionedFlash = validModels
      .filter(n => /^gemini-\d+(\.\d+)?-flash$/i.test(n))
      .sort((a, b) => {
        const vA = parseFloat(a.match(/gemini-(\d+(?:\.\d+)?)/i)?.[1] || '0');
        const vB = parseFloat(b.match(/gemini-(\d+(?:\.\d+)?)/i)?.[1] || '0');
        return vB - vA;
      });

    const sorted = [];
    if (validModels.includes('gemini-flash-lite-latest')) sorted.push('gemini-flash-lite-latest');
    for (const m of versionedFlashLite) {
      if (!sorted.includes(m)) sorted.push(m);
    }
    if (validModels.includes('gemini-flash-latest')) sorted.push('gemini-flash-latest');
    for (const m of versionedFlash) {
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

// 瀏覽器端側本地 AI (Gemini Nano) — 連同 .create() 一起加上 1.2 秒防卡死鎖！有就用本地算力，沒下載好就秒跳過！
let chromeAISession = null;
async function tryFastLocalBrowserAI(fullPromptText) {
  const runLocal = async () => {
    const factory = (typeof window.LanguageModel !== 'undefined' && typeof window.LanguageModel.create === 'function')
      ? window.LanguageModel
      : (window.ai && window.ai.languageModel ? window.ai.languageModel : null);
    if (!factory) return '';

    if (typeof factory.availability === 'function') {
      const avail = await factory.availability();
      if (avail !== 'readily' && avail !== 'available') return '';
    } else if (typeof factory.capabilities === 'function') {
      const caps = await factory.capabilities();
      if (!caps || (caps.available !== 'readily' && caps.available !== 'available')) return '';
    }

    if (!chromeAISession) {
      chromeAISession = await factory.create({ temperature: 0.1, topK: 2 });
    }
    const res = await chromeAISession.prompt(fullPromptText);
    return (res || '').trim();
  };

  try {
    return await Promise.race([
      runLocal(),
      new Promise((resolve) => setTimeout(() => resolve(''), 1500))
    ]);
  } catch (e) {
    return '';
  }
}

async function callSingleGeminiModel(modelName, fullPromptText, activeKey, signal, dataUrl = null) {
  const cleanKey = activeKey.replace(/\s+/g, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(cleanKey)}`;

  const parts = [{ text: fullPromptText }];
  if (dataUrl && dataUrl.includes(',')) {
    const mime = dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';'));
    parts.push({ inline_data: { mime_type: mime, data: dataUrl.split(',')[1] } });
  }

  const genConfig = { temperature: 0.1, maxOutputTokens: 1500 };

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: genConfig
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

  // 第 1 層：本機持久/動態快取命中 (100% 用戶端記憶體/LocalStorage，0ms 直出)
  if (!dataUrl && cacheKey && sessionDynamicCache.has(cacheKey)) {
    return { text: sessionDynamicCache.get(cacheKey), source: 'Instant Cache', diagError: null, usedPublicPool: false };
  }

  const modalKeyVal = (document.getElementById('apiKeyInput')?.value || '').trim();
  const savedKeyVal = (localStorage.getItem('tp_v22_backup_key') || localStorage.getItem('tp_test_gemini_key') || '').trim();
  const activeKey = (backupKey || modalKeyVal || savedKeyVal).replace(/\s+/g, '');

  // 第 2 層：若用戶未填 Key，優先嘗試瀏覽器內建本地 AI (帶 1.5s 防卡死鎖，0 伺服器成本)
  if (!activeKey && !dataUrl) {
    const localTxt = await tryFastLocalBrowserAI(fullPromptText);
    if (localTxt && localTxt.includes('|||')) {
      if (cacheKey) saveAnswerToPersistentCache(cacheKey, localTxt);
      return { text: localTxt, source: 'Local Browser AI', diagError: null, usedPublicPool: false };
    }
  }

  // 第 3 層：用戶個人 Google API Key 直連 (100% 使用用戶自己的 Key 與網路，不消耗伺服器)
  if (activeKey) {
    if (modelsDiscoveredForKey !== activeKey) {
      await discoverAuthorizedModels(activeKey);
    }
    const modelsToTry = dataUrl
      ? availableFastModels.filter(m => !/gemma/i.test(m)).slice(0, 3)
      : availableFastModels.slice(0, 3);

    for (let i = 0; i < modelsToTry.length; i++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 11000);
      try {
        const txt = await callSingleGeminiModel(modelsToTry[i], fullPromptText, activeKey, ctrl.signal, dataUrl);
        clearTimeout(timer);
        if (txt) {
          if (!dataUrl && cacheKey) saveAnswerToPersistentCache(cacheKey, txt);
          return { text: txt, source: `Google (${modelsToTry[i]})`, diagError: null, usedPublicPool: false };
        }
      } catch (e) {
        clearTimeout(timer);
        const msg = e.message || String(e);
        if (/API_KEY_INVALID|key not valid/i.test(msg)) {
          break;
        }
      }
    }
  }

  // 第 4 層：Cloudflare Worker 全球邊緣免費快取與輪詢池
  const endpoints = (typeof CF_WORKER_ENDPOINTS !== 'undefined' && Array.isArray(CF_WORKER_ENDPOINTS))
    ? CF_WORKER_ENDPOINTS
    : ['https://treespinyin-api.treespinyin.workers.dev'];

  for (let i = 0; i < endpoints.length; i++) {
    try {
      const r = await fetchWithTimeout(endpoints[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPromptText,
          image: dataUrl,
          cacheKey: dataUrl ? '' : cacheKey
        })
      }, 15000);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) continue;
      const t = (d?.text || d?.reply || d?.choices?.[0]?.message?.content || '').trim();
      if (t) {
        if (!dataUrl && cacheKey) saveAnswerToPersistentCache(cacheKey, t);
        const isCacheHit = r.headers.get('X-Cache') === 'HIT';
        return { text: t, source: 'Cloudflare Global Pool', diagError: null, usedPublicPool: !isCacheHit };
      }
    } catch (e) {}
  }

  // 第 5 層：用戶端 IP 直連免費開源大模型兜底 (0 伺服器成本)
  if (!dataUrl) {
    const freeAiTxt = await callKeylessFreeOpenSourceLLM(sysRules || 'You are a helpful bilingual Mandarin assistant.', userQ);
    if (freeAiTxt) {
      if (cacheKey) saveAnswerToPersistentCache(cacheKey, freeAiTxt);
      return { text: freeAiTxt, source: 'Free Open-Source AI Backup', diagError: null, usedPublicPool: true };
    }
  }

  return { text: '', source: 'none', diagError: null, usedPublicPool: true };
}

async function translateFast(text, fromLang, toLang) {
  const clean = (text || '').trim();
  if (!clean) return '';
  const isZhToEn = fromLang.startsWith('zh');
  const src = isZhToEn ? 'zh-CN' : 'en';
  const tgt = isZhToEn ? 'en' : 'zh-CN';

  // 1. 優先嘗試用戶端瀏覽器原生離線翻譯 (window.Translator — 加上 900ms 防卡死鎖，防止未下載語言包時掛起)
  try {
    if (window.Translator && typeof window.Translator.create === 'function') {
      const localTrans = await Promise.race([
        (async () => {
          if (typeof window.Translator.availability === 'function') {
            const avail = await window.Translator.availability({ sourceLanguage: src.slice(0, 2), targetLanguage: tgt.slice(0, 2) });
            if (avail !== 'readily' && avail !== 'available') return '';
          }
          const t = await window.Translator.create({ sourceLanguage: src.slice(0, 2), targetLanguage: tgt.slice(0, 2) });
          return await t.translate(clean);
        })(),
        new Promise((resolve) => setTimeout(() => resolve(''), 900))
      ]);
      if (localTrans && localTrans.trim() && localTrans.trim() !== clean) {
        return localTrans.trim();
      }
    }
  } catch (e) {}

  // 2. 用戶端直接並發調用免費極速神經翻譯通道 (不經過你的伺服器)
  const tasks = [
    fetchWithTimeout(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=${tgt}&dt=t&q=${encodeURIComponent(clean)}`, {}, 4500)
      .then(r => r.json())
      .then(d => {
        const j = d?.[0]?.map(x => x[0]).join('');
        if (j && j.trim() && j.trim() !== clean) return j.trim();
        throw new Error('empty');
      }),
    fetchWithTimeout(`https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${src}&tl=${tgt}&q=${encodeURIComponent(clean)}`, {}, 4500)
      .then(r => r.json())
      .then(d => {
        let r2 = '';
        if (Array.isArray(d)) r2 = typeof d[0] === 'string' ? d[0] : (Array.isArray(d[0]) ? d[0][0] : '');
        else if (d && Array.isArray(d.sentences)) r2 = d.sentences.map(s => s.trans || '').join('');
        if (r2 && r2.trim() && r2.trim() !== clean) return r2.trim();
        throw new Error('empty');
      }),
    fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean.slice(0, 450))}&langpair=${src}|${tgt}`, {}, 4500)
      .then(r => r.json())
      .then(d => {
        const t = d?.responseData?.translatedText;
        if (t && !t.includes('MYMEMORY WARNING') && t.toLowerCase() !== clean.toLowerCase()) return t.trim();
        throw new Error('empty');
      })
  ];

  try {
    return await Promise.any(tasks);
  } catch (e) {
    return clean;
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
  const metaPattern = /^(based on context|based on phonetics|based on the|the user input|speech recognition error|phonetic track|intended question|corrected input|user meant|here is the|sure,\s*here|note:|explanation:|analysis:|reasoning:|根據語音|根據上下文|語音識別錯誤|用戶本意|糾正後|註|注|註釋|注释|賞析|赏析|解析|譯文|译文|意思|背景|說明|说明|總結|总结)\s*[:：]?/i;
  if (metaPattern.test(line.trim())) return true;
  if (/speech recognition error|phonetic disambiguation|homophone typo|acoustic track/i.test(line)) return true;
  if (/^(這首詩|这首诗|此詩|此诗|全詩|全诗|本詩|本诗|詩中|诗中|表達了|表达了|描寫了|描写了|抒發了|抒发了|通過|通过|以上是|希望這|希望这)/.test(line.trim())) return true;
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
  if (replyBox) replyBox.style.display = 'none';
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
  const rawInput = (overrideInput !== undefined ? overrideInput : document.getElementById('userInput').value).trim();
  const q = typeof applyFuzzyVoiceCorrection === 'function' ? applyFuzzyVoiceCorrection(rawInput, voiceAlts) : rawInput;
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
  replyBox.innerText = (currentLang === 'en' && spokenLang === 'en') ? '⚡ AI Thinking...' : '⚡ AI 正在極速思考...';
  list.innerHTML = '';

  // 1. 14 篇經典古詩文 0ms 離線秒回
  if (conversationHistory.length === 0 && !fromVoice) {
    for (const item of VERIFIED_CLASSICS) {
      if (item.match.test(q)) {
        await renderBilingualAIOutput(item.reply);
        pushConversationMemory(q, item.reply);
        return;
      }
    }
  }

  const memoryContext = buildMemoryContextString();
  const acousticInfo = fromVoice
    ? `[Speech Recognition Data] Selected Mode: ${spokenLang === 'en' ? 'EN' : '中文'} | Raw Transcript: "${q}" | ${getPhoneticTrackForAI(q)} | Alternative Speech Candidates: ${JSON.stringify(altsToUse)}`
    : '';

  const systemRules = [
    'You are a crisp, authoritative bilingual Mandarin scholar and AI assistant.',
    memoryContext,
    acousticInfo,
    '',
    'STRICT EXECUTION RULES (FOLLOW EXACTLY):',
    fromVoice ? '1. SILENT PHONETIC & CONTEXT CORRECTION (NO META-CHATTER!):' : '',
    fromVoice ? '   - Speech recognition often produces homophone errors (e.g., "永和/泳鵝"->"詠鵝", "今夜思"->"靜夜思", "禮拜"->"李白", "路窄"->"鹿柴", "春笑"->"春曉", "敏農"->"憫農", or English phonetic words like "jing yes"->"靜夜思").' : '',
    fromVoice ? '   - Combine the Recent Conversation History + Acoustic Pinyin Track + Candidates to silently deduce what the user REALLY meant.' : '',
    fromVoice ? '   - NEVER output explanations like "Based on context and phonetics..."! If the raw transcript had a speech recognition typo, output ONLY this tag on the very first line: [FIXED_INPUT]: Corrected_Question_Text' : '',
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

  // 當雲端滿載時，給出雙語翻譯注音保底並溫馨提示填入免費 Key
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
  replyBox.innerHTML = currentLang === 'en'
    ? `💡 Tip: Click <b>[🔑 API Key]</b> at the top right to add your free Google Gemini Key for instant AI Q&A!`
    : `💡 提示：點擊右上角 <b>[🔑 API Key]</b> 填入您免費的個人 Google Gemini Key 即可享受極速 AI 問答！`;
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
    replyBox.innerText = currentLang === 'en' ? '📄 Fetching Google Doc text...' : '📄 正在極速讀取 Google Docs 內容...';
    const docText = await fetchCloudDocumentByUrl(raw);
    if (docText) {
      raw = docText.slice(0, 5000).trim();
      document.getElementById('userInput').value = raw;
      replyBox.style.display = 'none';
    } else {
      replyBox.innerText = currentLang === 'en'
        ? '⚠️ Please make sure the Google Doc is shared as "Anyone with the link can view", or copy & paste the text directly.'
        : '⚠️ 請確認該 Google Docs 權限已設為「知道連結的任何人均可查看」，或直接複製貼上文字。';
      return;
    }
  }

  if (raw.includes('|||')) {
    const pairLines = raw.split(/\r?\n+/).map(l => l.trim()).filter(Boolean);
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

  const lines = raw
    .replace(/\r\n/g, '\n')
    .split(/\n+|(?<=[。！？.!?])\s+/)
    .map(l => l.trim())
    .filter(Boolean)
    .filter(line => !/^\d+$/.test(line) && !/^\d{2}:\d{2}:\d{2}[,.:]\d{3}\s*-->/.test(line));

  if (lines.length === 0) return;

  const enIndices = [];
  const enLinesToBatch = [];
  const results = new Array(lines.length);

  lines.forEach((line, idx) => {
    if (/[\u4e00-\u9fa5]/.test(line)) {
      results[idx] = { zh: line, en: '' };
    } else {
      enIndices.push(idx);
      enLinesToBatch.push(line);
    }
  });

  if (enLinesToBatch.length > 0) {
    const batchText = enLinesToBatch.join('\n');
    const batchTranslated = await translateFast(batchText, 'en', 'zh');
    const splitTranslated = batchTranslated.split('\n').map(s => s.trim());

    for (let k = 0; k < enIndices.length; k++) {
      const targetIdx = enIndices[k];
      const origEn = enLinesToBatch[k];
      const zhLine = splitTranslated[k] || await translateFast(origEn, 'en', 'zh');
      results[targetIdx] = { zh: zhLine, en: origEn };
    }
  }

  for (const res of results) {
    if (res) {
      appendSentenceProgressive(res.zh, res.en);
      await nextPaintTick();
    }
  }
}