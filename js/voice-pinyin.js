/**
 * 模組 3: js/voice-pinyin.js
 * 負責：EN/中文雙語語音識別、3輪上下文記憶、數字/符號轉中文口語、Trees Pinyin v25 編譯器與長按0.5秒三合一修改器
 */
// =========================================================================
// 4. 🎙️ 膠囊內 EN / 中文 語音引擎 + 3 輪上下文記憶 + 三軌聲學指紋
// =========================================================================
const MAX_MEMORY_TURNS = 3;
let conversationHistory = [];
let lastInteractionTime = 0;

function pushConversationMemory(userQ, aiRawReply) {
  if (!userQ || !aiRawReply) return;
  const compactReply = aiRawReply.split(/\r?\n+/).slice(0, 4).join(' / ').slice(0, 260);
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

let spokenLang = 'en'; // 預設為英文 'en' ('en' | 'zh')
let activeRec = null;
let voiceSilenceTimer = null;
let latestVoiceCandidates = [];

function setVoiceLangMode(mode) {
  const btn = document.getElementById('voiceLangBtn');
  spokenLang = (mode === 'zh') ? 'zh' : 'en';
  try { localStorage.setItem('tp_spoken_lang', spokenLang); } catch (e) {}
  if (btn) {
    if (spokenLang === 'zh') {
      btn.innerText = '中文';
      btn.classList.add('zh-mode');
    } else {
      btn.innerText = 'EN';
      btn.classList.remove('zh-mode');
    }
  }
}

function handleUserInputChange(el) {
  const val = el.value || '';
  if (/[\u4e00-\u9fa5]/.test(val) && spokenLang !== 'zh') {
    setVoiceLangMode('zh');
  }
}

function toggleVoiceLang() {
  setVoiceLangMode(spokenLang === 'en' ? 'zh' : 'en');
  if (activeRec) {
    clearTimeout(voiceSilenceTimer);
    activeRec.onend = null;
    try { activeRec.stop(); } catch (e) {}
    activeRec = null;
    document.getElementById('micBtn').classList.remove('recording');
    setTimeout(() => toggleVoice(), 80);
  }
}

const FUZZY_VOICE_CORRECTIONS = [
  [/永和|泳鵝|泳鹅|勇鵝|勇鹅|擁鵝|拥鹅|用鵝|用鹅|詠俄|咏俄/g, '詠鵝'],
  [/今夜思|敬業思|敬业思|進夜思|进夜思|淨夜思|净夜思/g, '靜夜思'],
  [/春小|春笑|春校|純曉|纯晓/g, '春曉'],
  [/登貫雀樓|登贯雀楼|登觀雀樓|登观雀楼/g, '登鸛雀樓']
];

function applyFuzzyVoiceCorrection(rawTranscript, alts = []) {
  for (const a of alts) {
    if (/詠鵝|咏鹅|靜夜思|静夜思|春曉|春晓|登鸛雀樓/.test(a)) return a;
  }
  let fixed = rawTranscript || '';
  for (const [pattern, replacement] of FUZZY_VOICE_CORRECTIONS) {
    fixed = fixed.replace(pattern, replacement);
  }
  return fixed.trim();
}

// 產生三軌聲學指紋：「帶調拼音」+「無調拼音」+「平翹舌/前後鼻音歸一化模糊音軌 (Fuzzy Skeleton)」
function getPhoneticTrackForAI(text) {
  if (!text) return '';
  if (/[\u4e00-\u9fa5]/.test(text)) {
    try {
      if (typeof window.pinyinPro !== 'undefined' && window.pinyinPro.pinyin) {
        const withTone = window.pinyinPro.pinyin(text, { toneType: 'num' });
        const noTone = window.pinyinPro.pinyin(text, { toneType: 'none' });
        const fuzzy = noTone
          .replace(/\bzh/g, 'z').replace(/\bch/g, 'c').replace(/\bsh/g, 's')
          .replace(/ing\b/g, 'in').replace(/eng\b/g, 'en').replace(/ang\b/g, 'an');
        return `Pinyin: "${withTone}" | Toneless: "${noTone}" | Fuzzy: "${fuzzy}"`;
      }
    } catch (e) {}
    return text;
  }
  return `Spoken Phonetics: "${text}"`;
}

function toggleVoice() {
  const btn = document.getElementById('micBtn');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert('Voice input requires Chrome, Edge, or Safari.');
    return;
  }

  if (activeRec) {
    clearTimeout(voiceSilenceTimer);
    activeRec.stop();
    return;
  }

  latestVoiceCandidates = [];
  const inputEl = document.getElementById('userInput');
  inputEl.value = '';

  activeRec = new SR();
  activeRec.lang = (spokenLang === 'en') ? 'en-US' : 'zh-CN';
  activeRec.interimResults = true;
  activeRec.maxAlternatives = 8;
  activeRec.continuous = true;
  btn.classList.add('recording');

  const replyBox = document.getElementById('aiReplyBox');
  replyBox.className = 'ai-reply-box';
  replyBox.style.display = 'block';
  replyBox.innerText = (spokenLang === 'en')
    ? '🔴 Listening in English (EN)... (Tap "EN" to switch to 中文 if speaking Mandarin)'
    : '🔴 正在聽取中文語音 (中文模式)... 說完停頓 1 秒即刻回答！';

  const finalizedSegments = [];
  const segmentAlts = [];
  let lastNonEmptyInterim = '';
  let lastValidFullText = '';
  let hasSpokenYet = false;

  function scheduleGentleStop() {
    clearTimeout(voiceSilenceTimer);
    const silenceAllowance = (spokenLang === 'en') ? 1650 : 1350;
    const waitMs = hasSpokenYet ? silenceAllowance : 5000;
    voiceSilenceTimer = setTimeout(() => {
      if (activeRec) activeRec.stop();
    }, waitMs);
  }

  scheduleGentleStop();

  const sep = (spokenLang === 'en') ? ' ' : '';

  activeRec.onresult = (e) => {
    hasSpokenYet = true;
    scheduleGentleStop();
    let currentInterim = '';

    for (let i = 0; i < e.results.length; i++) {
      const res = e.results[i];
      const altsForSeg = [];
      for (let k = 0; k < res.length; k++) {
        const t = (res[k]?.transcript || '').trim();
        if (t) altsForSeg.push(t);
      }

      if (res.isFinal) {
        finalizedSegments[i] = res[0].transcript.trim();
        segmentAlts[i] = altsForSeg;
      } else {
        currentInterim += (currentInterim ? sep : '') + res[0].transcript.trim();
        segmentAlts[i] = altsForSeg;
      }
    }

    if (currentInterim.trim()) {
      lastNonEmptyInterim = currentInterim.trim();
    } else if (e.results.length > 0 && e.results[e.results.length - 1].isFinal) {
      lastNonEmptyInterim = '';
    }

    const completedPart = finalizedSegments.filter(Boolean).join(sep).trim();
    const mergedNow = [completedPart, lastNonEmptyInterim].filter(Boolean).join(sep).trim();

    if (mergedNow) {
      lastValidFullText = mergedNow;
      inputEl.value = lastValidFullText;
    }

    const combinedCandidates = new Set();
    if (lastValidFullText) combinedCandidates.add(lastValidFullText);
    for (let k = 0; k < 8; k++) {
      const altSentence = segmentAlts
        .map((arr, idx) => (arr && arr[k]) ? arr[k] : (finalizedSegments[idx] || ''))
        .filter(Boolean)
        .join(sep)
        .trim();
      if (altSentence) combinedCandidates.add(altSentence);
    }
    latestVoiceCandidates = Array.from(combinedCandidates).slice(0, 8);
  };

  activeRec.onend = () => {
    clearTimeout(voiceSilenceTimer);
    btn.classList.remove('recording');
    activeRec = null;

    const finalSpoken = applyFuzzyVoiceCorrection((lastValidFullText || inputEl.value || '').trim(), latestVoiceCandidates);
    if (finalSpoken) {
      inputEl.value = finalSpoken;
      runSmartAI(finalSpoken, latestVoiceCandidates, true);
    } else {
      replyBox.style.display = 'none';
    }
  };

  activeRec.onerror = () => {
    clearTimeout(voiceSilenceTimer);
    btn.classList.remove('recording');
    activeRec = null;
    const finalSpoken = applyFuzzyVoiceCorrection((lastValidFullText || inputEl.value || '').trim(), latestVoiceCandidates);
    if (finalSpoken) {
      runSmartAI(finalSpoken, latestVoiceCandidates, true);
    } else {
      replyBox.style.display = 'none';
    }
  };

  try {
    activeRec.start();
  } catch (err) {}
}

// =========================================================================
// 5. 數字與符號轉中文口語 + Trees Pinyin v25 編譯器 + 右鍵三合一修改器
// =========================================================================
const DIGITS_ZH = ['零','一','二','三','四','五','六','七','八','九'];

function intToChinese(numStr) {
  let n = parseInt(numStr, 10);
  if (isNaN(n)) return numStr;
  if (n === 0) return '零';
  if (n < 0) return '負' + intToChinese(String(-n));
  if (numStr.length === 4 && n >= 1900 && n <= 2099) {
    return numStr.split('').map(d => DIGITS_ZH[parseInt(d, 10)]).join('');
  }
  if (n < 10) return DIGITS_ZH[n];
  if (n < 100) {
    let ten = Math.floor(n / 10), rem = n % 10;
    return (ten === 1 ? '十' : DIGITS_ZH[ten] + '十') + (rem > 0 ? DIGITS_ZH[rem] : '');
  }
  if (n < 1000) {
    let hun = Math.floor(n / 100), rem = n % 100;
    if (rem === 0) return DIGITS_ZH[hun] + '百';
    if (rem < 10) return DIGITS_ZH[hun] + '百零' + DIGITS_ZH[rem];
    return DIGITS_ZH[hun] + '百' + intToChinese(String(rem));
  }
  if (n < 10000) {
    let th = Math.floor(n / 1000), rem = n % 1000;
    if (rem === 0) return DIGITS_ZH[th] + '千';
    if (rem < 100) return DIGITS_ZH[th] + '千零' + intToChinese(String(rem));
    return DIGITS_ZH[th] + '千' + intToChinese(String(rem));
  }
  return numStr.split('').map(d => DIGITS_ZH[parseInt(d, 10)] || d).join('');
}

function numberToChinese(str) {
  if (str.includes('.')) {
    let parts = str.split('.');
    let intPart = intToChinese(parts[0] || '0');
    let decPart = parts[1].split('').map(d => DIGITS_ZH[parseInt(d, 10)]).join('');
    return intPart + '點' + decPart;
  }
  return intToChinese(str);
}

function expandNumbersAndSymbolsToZh(text) {
  if (!text) return '';
  let s = text;
  const preservedTokens = [];
  s = s.replace(/\b(AI|VIP|APP|PPT|PDF|WIFI|Wi-Fi|USB|DNA|RNA|CPU|GPU|5G|4G|3D|4K|8K|MP3|MP4|PM2\.5|pH|CEO|GDP|CPI)\b/g, (m) => {
    const idx = preservedTokens.length;
    preservedTokens.push(m);
    return `@@KEEP${idx}@@`;
  });
  s = s.replace(/\bH[2₂]SO[4₄]\b/gi, '硫酸')
       .replace(/\bCaCO[3₃]\b/gi, '碳酸鈣')
       .replace(/\bNaOH\b/gi, '氫氧化鈉')
       .replace(/\bNaCl\b/gi, '氯化鈉')
       .replace(/\bH[2₂]O\b/gi, '水')
       .replace(/\bCO[2₂]\b/gi, '二氧化碳')
       .replace(/\bO[2₂]\b/gi, '氧氣');
  s = s.replace(/°C|℃/g, '攝氏度').replace(/°F|℉/g, '華氏度');
  s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => intToChinese(h) + '點' + (m === '00' ? '整' : intToChinese(m) + '分'));
  s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, (_, num) => '百分之' + numberToChinese(num));
  s = s.replace(/\$\s*(\d+(?:\.\d+)?)/g, (_, num) => numberToChinese(num) + '美元');
  s = s.replace(/[¥￥]\s*(\d+(?:\.\d+)?)/g, (_, num) => numberToChinese(num) + '元');
  s = s.replace(/\+/g, '加').replace(/=/g, '等於').replace(/&/g, '和');
  s = s.replace(/\d+(?:\.\d+)?/g, (match) => numberToChinese(match));
  s = s.replace(/@@KEEP(\d+)@@/g, (_, idx) => preservedTokens[parseInt(idx, 10)] || '');
  return s;
}

const OVERALL_16 = {
  'zhi': '(r)ds', 'chi': '(r)ts', 'shi': '(r)s', 'ri': '(r)th', 'zi': 'ds', 'ci': 'ts', 'si': 's', 'yi': 'yee',
  'wu': 'woo', 'yu': 'yee(oo)', 'ye': 'yer', 'yue': 'yee(oo)er', 'yuan': 'yee(oo)an', 'yin': 'yeen', 'yun': 'yee(oo)n', 'ying': 'ying'
};
const LOCKED_MAP = {
  'wo': 'wer', 'de': 'der', 'le': 'Ler', 'ren': '(r)ther-n', 'wen': 'wer-n', 'shun': 'soon', 'zun': 'dsoon',
  'guo': 'gooer', 'o': 'oh', 'qi': 'tsee', 'qing': 'tsing', 'qie': 'tseer', 'qian': 'tseean', 'qiao': 'tseeaw',
  'qiang': 'tseeang', 'qiong': 'tseer-oong', 'qu': 'tsee(oo)', 'que': 'tsee(oo)er', 'quan': 'tsee(oo)an',
  'qun': 'tsee(oo)n', 'qin': 'tseen', 'qia': 'tseeah', 'xi': 'see', 'xing': 'sing', 'xie': 'seer', 'xian': 'seean',
  'xiao': 'seeaw', 'xiang': 'seeang', 'xiong': 'seer-oong', 'xu': 'see(oo)', 'xue': 'see(oo)er', 'xuan': 'see(oo)an',
  'xun': 'see(oo)n', 'xin': 'seen', 'xia': 'seeah', 'ji': 'jee', 'jing': 'jing', 'jie': 'jeer', 'jian': 'jeean',
  'jiao': 'jeeaw', 'jiang': 'jeeang', 'jiong': 'jeer-oong', 'ju': 'jee(oo)', 'jue': 'jee(oo)er', 'juan': 'jee(oo)an',
  'jun': 'jee(oo)n', 'jin': 'jeen', 'jia': 'jeeah', 'lv': 'Lee(oo)', 'lü': 'Lee(oo)', 'lve': 'Lee(oo)er', 'lüe': 'Lee(oo)er',
  'nv': 'nee(oo)', 'nü': 'nee(oo)', 'nve': 'nee(oo)er', 'nüe': 'nee(oo)er'
};
const INITIALS = {
  'b':'b', 'p':'p', 'm':'m', 'f':'f', 'd':'d', 't':'t', 'n':'n', 'l':'L', 'g':'g', 'k':'k', 'h':'h', 'j':'j',
  'q':'tsee', 'x':'see', 'zh':'(r)ds', 'ch':'(r)ts', 'sh':'(r)s', 'r':'(r)th', 'z':'ds', 'c':'ts', 's':'s', 'y':'y', 'w':'w'
};
const FINALS = {
  'a':'ah', 'o':'ooer', 'e':'er', 'i':'ee', 'u':'oo', 'v':'ee(oo)', 'ü':'ee(oo)', 'ai':'ie', 'ei':'ay', 'ui':'ooay',
  'ao':'aw', 'ou':'oh', 'iu':'eeoh', 'ie':'eer', 've':'ee(oo)er', 'üe':'ee(oo)er', 'er':'(uh)-er', 'an':'an', 'en':'er-n',
  'in':'een', 'un':'oon', 'vn':'ee(oo)n', 'ün':'ee(oo)n', 'ang':'ang', 'eng':'er-ng', 'ing':'ing', 'ong':'er-oong',
  'ia':'eeah', 'ian':'eean', 'iao':'eeaw', 'iang':'eeang', 'iong':'eer-oong', 'ua':'ooah', 'uai':'ooie', 'uan':'ooan',
  'uang':'ooang', 'uo':'ooer', 'van':'ee(oo)an', 'üan':'ee(oo)an'
};

function compileToTreesPinyin(pyNum) {
  if (!pyNum) return '';
  let m = pyNum.trim().match(/^([a-züv:]+)([0-5]?)$/i);
  if (!m) return pyNum;
  let syl = m[1].toLowerCase().replace('ü', 'v').replace('u:', 'v');
  let tone = m[2] || '';
  let mapped = '';
  if (syl === 'er') mapped = (tone === '4') ? 'uh-er' : '(uh)-er';
  else if (OVERALL_16[syl]) mapped = OVERALL_16[syl];
  else if (LOCKED_MAP[syl]) mapped = LOCKED_MAP[syl];
  else {
    let init = '', fin = syl;
    for (let l of ['zh', 'ch', 'sh']) { if (syl.startsWith(l)) { init = l; fin = syl.slice(2); break; } }
    if (!init && syl.length > 1 && 'bpmfdtnlgkhjqxzcsryw'.includes(syl[0])) { init = syl[0]; fin = syl.slice(1); }
    let mappedInit = INITIALS[init] || init;
    let mappedFin = FINALS[fin] || fin;
    if (mappedInit.endsWith('ee') && mappedFin.startsWith('ee')) mapped = mappedInit + mappedFin.slice(2);
    else if (mappedInit.endsWith('ee') && mappedFin.startsWith('i')) mapped = mappedInit.slice(0, -2) + mappedFin;
    else if (init === 'y' && mappedFin.startsWith('ee')) mapped = 'y' + mappedFin;
    else if (init === 'w' && mappedFin.startsWith('oo')) mapped = 'w' + mappedFin;
    else mapped = mappedInit + mappedFin;
  }
  let toneSuffix = (tone === '2' || tone === '3' || tone === '4') ? tone : '';
  return mapped + toneSuffix;
}

function numPinyinToToneMark(pyNum) {
  if (!pyNum) return '';
  const m = pyNum.trim().match(/^([a-züv:]+)([1-5]?)$/i);
  if (!m) return pyNum;
  let s = m[1].toLowerCase().replace('v', 'ü').replace('u:', 'ü');
  const t = parseInt(m[2] || '5', 10);
  if (t < 1 || t > 4) return s;
  const marks = { a:['ā','á','ǎ','à'], e:['ē','é','ě','è'], i:['ī','í','ǐ','ì'], o:['ō','ó','ǒ','ò'], u:['ū','ú','ǔ','ù'], ü:['ǖ','ǘ','ǚ','ǜ'] };
  if (s.includes('a')) return s.replace('a', marks.a[t-1]);
  if (s.includes('e')) return s.replace('e', marks.e[t-1]);
  if (s.includes('ou')) return s.replace('o', marks.o[t-1]);
  for (let i = s.length - 1; i >= 0; i--) { if (marks[s[i]]) return s.slice(0, i) + marks[s[i]][t-1] + s.slice(i + 1); }
  return s;
}

const CUSTOM_POLYPHONES = {
  "銀行": "yin2 hang2", "银行": "yin2 hang2", "行業": "hang2 ye4", "行业": "hang2 ye4", "一行": "yi4 hang2",
  "便宜": "pian2 yi5", "方便": "fang1 bian4", "音樂": "yin1 yue4", "音乐": "yin1 yue4", "快樂": "kuai4 le4", "快乐": "kuai4 le4",
  "看著": "kan4 zhe5", "看着": "kan4 zhe5", "著急": "zhao2 ji2", "着急": "zhao2 ji2", "睡著": "shui4 zhao2", "睡着": "shui4 zhao2",
  "長大": "zhang3 da4", "长大": "zhang3 da4", "長城": "chang2 cheng2", "长城": "chang2 cheng2", "多長": "duo1 chang2", "多长": "duo1 chang2",
  "了解": "liao3 jie3", "好了": "hao3 le5", "太好了": "tai4 hao3 le5", "覺得": "jue2 de5", "觉得": "jue2 de5", "睡覺": "shui4 jiao4", "睡觉": "shui4 jiao4",
  "重慶": "chong2 qing4", "重庆": "chong2 qing4", "重要": "zhong4 yao4", "還錢": "huan2 qian2", "还钱": "huan2 qian2", "還有": "hai2 you3", "还有": "hai2 you3",
  "食物": "shi2 wu4", "美食": "mei3 shi2", "我的": "wo3 de5", "你的": "ni3 de5", "好的": "hao3 de5",
  "曲項": "qu1 xiang4", "曲项": "qu1 xiang4", "朝辭": "zhao1 ci2", "朝辞": "zhao1 ci2", "水調歌頭": "shui3 diao4 ge1 tou2", "水调歌头": "shui3 diao4 ge1 tou2", "鹿柴": "lu4 zhai4"
};

const userCustomEdits = JSON.parse(localStorage.getItem('tp_custom_char_edits_v2') || '{}');
let activeEditCol = null;

function getAccuratePinyinArray(zhText) {
  let pyArr = (typeof window.pinyinPro !== 'undefined' && window.pinyinPro.pinyin)
    ? window.pinyinPro.pinyin(zhText, { type: 'array', toneType: 'num' })
    : new Array(zhText.length).fill('');
  for (let word in CUSTOM_POLYPHONES) {
    let idx = zhText.indexOf(word);
    while (idx !== -1) {
      let fixedPys = CUSTOM_POLYPHONES[word].split(' ');
      for (let k = 0; k < fixedPys.length; k++) pyArr[idx + k] = fixedPys[k];
      idx = zhText.indexOf(word, idx + 1);
    }
  }
  return pyArr;
}

function openThreeInOneEditor(colEl) {
  activeEditCol = colEl;
  const zhEl = colEl.querySelector('.tp-zh');
  const stdEl = colEl.querySelector('.tp-std');
  const tpEl = colEl.querySelector('.tp-py');
  document.getElementById('editZhInput').value = zhEl ? zhEl.innerText : '';
  document.getElementById('editStdInput').value = colEl.dataset.pynum || (stdEl ? stdEl.innerText : '');
  document.getElementById('editTpInput').value = tpEl ? tpEl.innerText : '';
  document.getElementById('editCharModal').style.display = 'flex';
}

function onEditZhOrNumChange(source) {
  if (source === 'zh') {
    const newCh = document.getElementById('editZhInput').value.trim();
    if (newCh && /[\u4e00-\u9fa5]/.test(newCh) && typeof window.pinyinPro !== 'undefined') {
      const pyNum = window.pinyinPro.pinyin(newCh[0], { toneType: 'num' });
      document.getElementById('editStdInput').value = pyNum;
      document.getElementById('editTpInput').value = compileToTreesPinyin(pyNum);
    }
  } else if (source === 'std') {
    const rawStd = document.getElementById('editStdInput').value.trim();
    if (/^[a-züv:]+[0-5]?$/i.test(rawStd)) {
      document.getElementById('editTpInput').value = compileToTreesPinyin(rawStd);
    }
  }
}

function saveThreeInOneEdit() {
  if (!activeEditCol) return;
  const newZh = document.getElementById('editZhInput').value.trim();
  const rawStd = document.getElementById('editStdInput').value.trim();
  const newTp = document.getElementById('editTpInput').value.trim();
  if (checkAndWarnProfanity(newZh)) return;

  const zhEl = activeEditCol.querySelector('.tp-zh');
  const stdEl = activeEditCol.querySelector('.tp-std');
  const tpEl = activeEditCol.querySelector('.tp-py');

  if (newZh && zhEl) {
    zhEl.dataset.raw = newZh;
    zhEl.innerText = convertScript(newZh, currentScriptMode);
  }
  if (rawStd && stdEl) {
    activeEditCol.dataset.pynum = rawStd;
    stdEl.innerText = /^[a-züv:]+[1-5]$/i.test(rawStd) ? numPinyinToToneMark(rawStd) : rawStd;
  }
  if (newTp && tpEl) tpEl.innerText = newTp;

  if (newZh) {
    const tradKey = convertScript(newZh, 'trad');
    userCustomEdits[tradKey] = {
      std: stdEl ? stdEl.innerText : '',
      tp: tpEl ? tpEl.innerText : '',
      pynum: rawStd
    };
    userCustomEdits[newZh] = userCustomEdits[tradKey];
    localStorage.setItem('tp_custom_char_edits_v2', JSON.stringify(userCustomEdits));
  }
  document.getElementById('editCharModal').style.display = 'none';
}

function nextPaintTick() {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 10)));
}

function appendSentenceProgressive(rawZhText, enTranslation = '', targetContainerId = 'annotationList') {
  const list = document.getElementById(targetContainerId);
  if (!list) return null;
  const block = document.createElement('div');
  block.className = 'sentence-block';

  const expandedZh = expandNumbersAndSymbolsToZh(rawZhText);
  // 保留原始輸入字符作為基準，不再強行先轉一次繁體再轉回簡體
  const sourceZh = expandedZh;
  block.dataset.zh = sourceZh;
  block.dataset.en = enTranslation;

  const enDiv = document.createElement('div');
  enDiv.className = 'en-line';
  enDiv.contentEditable = 'true';
  const hasLockedEn = Boolean(enTranslation && enTranslation.trim());
  enDiv.innerText = hasLockedEn ? enTranslation.trim() : '...';
  enDiv.oninput = () => { block.dataset.en = enDiv.innerText; };
  block.appendChild(enDiv);

  const charRow = document.createElement('div');
  charRow.className = 'char-row';
  const pinyinList = getAccuratePinyinArray(sourceZh);

  for (let i = 0; i < sourceZh.length; i++) {
    const char = sourceZh[i];
    const dispChar = convertScript(char, currentScriptMode);
    const isChinese = /[\u4e00-\u9fa5]/.test(char);
    const col = document.createElement('div');
    col.className = 'tp-col';

    if (isChinese) {
      let pyNum = pinyinList[i] || '';
      const tradChar = convertScript(char, 'trad');
      const savedCustom = userCustomEdits[char] || userCustomEdits[tradChar];
      let tp = savedCustom?.tp || compileToTreesPinyin(pyNum);
      let stdTone = savedCustom?.std || numPinyinToToneMark(pyNum);
      col.dataset.pynum = savedCustom?.pynum || pyNum;

      col.innerHTML = `
        <span class="tp-py">${tp}</span>
        <span class="tp-std">${stdTone}</span>
        <span class="tp-zh" data-raw="${char}">${dispChar}</span>
      `;
      let pressTimer = null;
      let isLongPress = false;

      // 1. 電腦端右鍵 + 安卓長按：直接打開三合一修改框
      col.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearTimeout(pressTimer);
        openThreeInOneEditor(col);
      };

      // 2. 手機與 iPad 端 (iOS / Android)：手指按住 0.5 秒 (500ms) 自動彈出修改框
      col.addEventListener('touchstart', () => {
        isLongPress = false;
        pressTimer = setTimeout(() => {
          isLongPress = true;
          if (navigator.vibrate) navigator.vibrate(30);
          openThreeInOneEditor(col);
        }, 500);
      }, { passive: true });

      col.addEventListener('touchmove', () => {
        clearTimeout(pressTimer);
      }, { passive: true });

      col.addEventListener('touchend', (e) => {
        clearTimeout(pressTimer);
        if (isLongPress) {
          e.preventDefault();
        }
      });

      // 3. 輕點一下 (Tap / Click)：正常朗讀該字發音
      col.onclick = () => {
        if (isLongPress) {
          isLongPress = false;
          return;
        }
        speakSingleChar(col.querySelector('.tp-zh').innerText);
      };
    } else {
      col.innerHTML = `<span class="tp-py">${char}</span><span class="tp-std"> </span><span class="tp-zh"> </span>`;
    }
    charRow.appendChild(col);
  }
  block.appendChild(charRow);
  list.appendChild(block);

  if (!hasLockedEn) {
    translateFast(sourceZh, 'zh', 'en').then(en => {
      enDiv.innerText = en;
      block.dataset.en = en;
    });
  }
  return block;
}