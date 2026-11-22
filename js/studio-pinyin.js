/**
 * Trees Pinyin Studio — Module 3: Script Conversion, 3-in-1 Editor, Selection Popover & 4-Row Layout
 */

const TONE_MAP = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  v: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ']
};

function toStandardToneMarks(pyStr) {
  if (!pyStr) return '';
  return pyStr.split(/\s+/).map(syl => {
    const m = syl.match(/^([a-zA-ZüÜvV:]+)([1-5]?)$/);
    if (!m) return syl;
    let base = m[1].toLowerCase().replace(/u:|v/g, 'ü');
    const tone = parseInt(m[2], 10);
    if (!tone || tone === 5 || tone === 0) return base;
    const idx = tone - 1;
    if (base.includes('a')) return base.replace('a', TONE_MAP.a[idx]);
    if (base.includes('e')) return base.replace('e', TONE_MAP.e[idx]);
    if (base.includes('ou')) return base.replace('o', TONE_MAP.o[idx]);
    if (base.includes('iu')) return base.replace('u', TONE_MAP.u[idx]);
    if (base.includes('ui')) return base.replace('i', TONE_MAP.i[idx]);
    for (const v of ['o', 'i', 'u', 'ü']) {
      if (base.includes(v)) return base.replace(v, TONE_MAP[v][idx]);
    }
    return base;
  }).join(' ');
}

const DIGIT_ZH = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUPERSCRIPT_MAP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };

function yearToSpokenZh(yearStr) {
  return String(yearStr).replace(/\D/g, '').split('').map(d => DIGIT_ZH[parseInt(d, 10)] || '').join('');
}

function digitsToSpokenZh(str) {
  return String(str).replace(/\d/g, d => DIGIT_ZH[parseInt(d, 10)] || d);
}

function expandPhoneNumbersToZh(text) {
  // 匹配常見國際/北美/中國電話格式、區號 (+86)、郵編與 3 位以上門牌/房間號，逐位讀出且避免把 '-' 誤讀成「負」
  return text
    .replace(/\(\+(\d{1,3})\)\s*([\d][\d\s.-]{4,}\d)\b/g, (_, cc, rest) =>
      `加${digitsToSpokenZh(cc)} ${rest.replace(/[-.\s]+/g, ' ').replace(/\d+/g, d => digitsToSpokenZh(d)).trim()}`)
    .replace(/\(\+(\d{1,3})\)/g, (_, cc) => `加${digitsToSpokenZh(cc)}`)
    .replace(/(?:\+(\d{1,3})[\s.-]?)?\((\d{2,4})\)[\s.-]?(\d{3,4})[\s.-]?(\d{3,4})\b/g, (_, cc, g1, g2, g3) => {
      const parts = [];
      if (cc) parts.push('加' + digitsToSpokenZh(cc));
      parts.push(digitsToSpokenZh(g1), digitsToSpokenZh(g2), digitsToSpokenZh(g3));
      return parts.join(' ');
    })
    .replace(/(?:\+(\d{1,3})[\s.-])?(\d{2,4})[-.\s](\d{3,4})[-.\s](\d{3,4})\b/g, (full, cc, g1, g2, g3) => {
      const parts = [];
      if (cc) parts.push('加' + digitsToSpokenZh(cc));
      parts.push(digitsToSpokenZh(g1), digitsToSpokenZh(g2), digitsToSpokenZh(g3));
      return parts.join(' ');
    })
    .replace(/\b(0\d{2,3})-(\d{7,8})\b/g, (_, area, num) => `${digitsToSpokenZh(area)} ${digitsToSpokenZh(num)}`)
    // 郵編（明確關鍵詞 / 美國州名縮寫 + 5位郵編 / ZIP+4）
    .replace(/((?:邮编|郵編|邮政编码|郵政編碼|zip(?:\s*code)?|postal(?:\s*code)?)\s*[:：#]?\s*)(\d{5,6})(?:-(\d{4}))?\b/gi, (_, pfx, z1, z2) =>
      `${pfx}${digitsToSpokenZh(z1)}${z2 ? ' ' + digitsToSpokenZh(z2) : ''}`)
    .replace(/\b((?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s+)(\d{5})(?:-(\d{4}))?\b/g, (_, st, z1, z2) =>
      `${st}${digitsToSpokenZh(z1)}${z2 ? ' ' + digitsToSpokenZh(z2) : ''}`)
    .replace(/\b(\d{5})-(\d{4})\b/g, (_, z1, z2) => `${digitsToSpokenZh(z1)} ${digitsToSpokenZh(z2)}`)
    // 3 位以上門牌號/房間號（如 123 号、305 室）逐位讀出，避免與 1~31 日期衝突
    .replace(/(?<![\d,.])(\d{3,})\s*([号號室房])/g, (_, num, unit) => `${digitsToSpokenZh(num)}${unit}`);
}

function numberToSpokenZh(numStr, isOrdinalOrDate = false) {
  let clean = String(numStr).replace(/,/g, '').trim();
  if (!clean) return '';
  let prefix = '';
  if (clean.startsWith('-')) { prefix = '負'; clean = clean.slice(1); }
  else if (clean.startsWith('+')) { prefix = '正'; clean = clean.slice(1); }
  const parts = clean.split('.');
  const intPartStr = parts[0], decPartStr = parts[1];
  const n = parseInt(intPartStr, 10);
  if (isNaN(n)) return numStr;
  let intSpoken = '';
  if (!isOrdinalOrDate && intPartStr.length === 4 && n >= 1900 && n <= 2099) {
    intSpoken = yearToSpokenZh(intPartStr);
  } else if (n === 0) intSpoken = '零';
  else if (n < 10) intSpoken = DIGIT_ZH[n];
  else if (n < 20) intSpoken = '十' + (n % 10 === 0 ? '' : DIGIT_ZH[n % 10]);
  else if (n < 100) {
    const tens = Math.floor(n / 10), ones = n % 10;
    intSpoken = DIGIT_ZH[tens] + '十' + (ones === 0 ? '' : DIGIT_ZH[ones]);
  } else {
    const units = ['', '十', '百', '千'], bigUnits = ['', '萬', '億', '萬億'];
    let str = String(n), result = '', groupIdx = 0;
    while (str.length > 0) {
      const group = str.slice(-4);
      str = str.slice(0, -4);
      let groupRes = '', zeroFlag = false;
      for (let i = 0; i < group.length; i++) {
        const digit = parseInt(group[i], 10), pos = group.length - 1 - i;
        if (digit === 0) zeroFlag = true;
        else {
          if (zeroFlag) { groupRes += '零'; zeroFlag = false; }
          if (digit === 1 && pos === 1 && group.length === 2 && result === '' && str === '') groupRes += '十';
          else groupRes += DIGIT_ZH[digit] + units[pos];
        }
      }
      if (groupRes) result = groupRes + bigUnits[groupIdx] + (result && !result.startsWith('零') && group[group.length - 1] === '0' ? '零' : '') + result;
      groupIdx++;
    }
    intSpoken = result || '零';
  }
  let decSpoken = '';
  if (decPartStr !== undefined && decPartStr.length > 0) {
    decSpoken = '點' + decPartStr.split('').map(d => DIGIT_ZH[parseInt(d, 10)] ?? d).join('');
  }
  return prefix + intSpoken + decSpoken;
}

const CHEMICAL_FORMULAS_DICT = [
  { reg: /\bH[2₂]SO[4₄]\b/g, zh: '硫酸' },
  { reg: /\bNa[2₂]CO[3₃]\b/g, zh: '碳酸鈉' },
  { reg: /\bNaHCO[3₃]\b/g, zh: '碳酸氫鈉' },
  { reg: /\bCaCO[3₃]\b/g, zh: '碳酸鈣' },
  { reg: /\bC[6₆]H(?:12|₁₂)O[6₆]\b/g, zh: '葡萄糖' },
  { reg: /\bC[2₂]H[5₅]OH\b/g, zh: '乙醇' },
  { reg: /\bNaOH\b/g, zh: '氫氧化鈉' },
  { reg: /\bHCl\b/g, zh: '鹽酸' },
  { reg: /\bNaCl\b/g, zh: '氯化鈉' },
  { reg: /\bH[2₂]O\b/g, zh: '水' },
  { reg: /\bCO[2₂]\b/g, zh: '二氧化碳' },
  { reg: /\bO[3₃]\b/g, zh: '臭氧' },
  { reg: /\bO[2₂]\b/g, zh: '氧氣' },
  { reg: /\bN[2₂]\b/g, zh: '氮氣' },
  { reg: /\bH[2₂]\b/g, zh: '氫氣' }
];

function expandMathEconTimeAndDatesToZh(inputText) {
  if (!inputText) return '';
  let s = inputText;
  const preservedTokens = [];
  s = s.replace(/\b(AI|VIP|APP|PPT|PDF|WIFI|USB|DNA|RNA|CPU|GPU|5G|4G|3D|4K|8K|MP3|MP4|PM2\.5|pH|CEO|GDP|CPI)\b/g, (m) => {
    const idx = preservedTokens.length;
    preservedTokens.push(m);
    return `@@KEEP${idx}@@`;
  });
  for (const chem of CHEMICAL_FORMULAS_DICT) s = s.replace(chem.reg, chem.zh);
  s = s.replace(/\bE\s*=\s*mc(?:²|\^2)\b/g, '能量E等於質量m乘以光速c的平方');
  s = s.replace(/\bF\s*=\s*ma\b/g, '力F等於質量m乘以加速度a');
  s = s.replace(/°C|℃/g, '攝氏度').replace(/°F|℉/g, '華氏度');
  s = s.replace(/([a-zA-Z0-9)]+)\s*([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+|\^[+-]?\d+)/g, (_, base, expRaw) => {
    let exp = expRaw.startsWith('^') ? expRaw.slice(1) : expRaw.split('').map(c => SUPERSCRIPT_MAP[c] ?? '').join('');
    const expZh = numberToSpokenZh(exp);
    if (exp === '2') return `${base}的平方`;
    if (exp === '3') return `${base}的立方`;
    return `${base}的${expZh}次方`;
  });
  s = s.replace(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g, (_, hh, mm, ss) => {
    const hNum = parseInt(hh, 10), mNum = parseInt(mm, 10);
    if (hNum > 24 || mNum > 59) return _;
    const mSpoken = mNum === 0 ? '整' : (mNum < 10 ? `零${numberToSpokenZh(mNum, true)}分` : `${numberToSpokenZh(mNum, true)}分`);
    const sSpoken = ss !== undefined ? `${numberToSpokenZh(parseInt(ss, 10), true)}秒` : '';
    return `${numberToSpokenZh(hNum, true)}點${mSpoken}${sSpoken}`;
  });
  s = s.replace(/(\+|-|±)?(\d[\d,]*(?:\.\d+)?)\s*%/g, (_, sign, num) => {
    const signZh = sign === '-' ? '負' : (sign === '+' ? '正' : (sign === '±' ? '正負' : ''));
    return `${signZh}百分之${numberToSpokenZh(num)}`;
  });
  s = s.replace(/(US\$|\$|¥|￥|€|£)\s*(\d[\d,]*(?:\.\d+)?)/g, (_, sym, num) => {
    const unitMap = { 'US$': '美元', '$': '美元', '¥': '元', '￥': '元', '€': '歐元', '£': '英鎊' };
    return `${numberToSpokenZh(num)}${unitMap[sym] || '元'}`;
  });
  // 電話號碼與 7 位以上純數字編號／0 開頭區號：逐位讀出，不按億／萬／科學記數法展開（排除千分位逗號與小數）
  s = expandPhoneNumbersToZh(s);
  s = s.replace(/(?<![\d,.])0\d{2,}(?![\d,.])/g, (m) => digitsToSpokenZh(m));
  s = s.replace(/(?<![\d,.])\d{7,}(?![\d,.])/g, (m) => digitsToSpokenZh(m));
  s = s.replace(/\b\d[\d,]*(?:\.\d+)?\b/g, (m) => numberToSpokenZh(m));
  s = s.replace(/@@KEEP(\d+)@@/g, (_, idx) => preservedTokens[parseInt(idx, 10)] || '');
  return s;
}


// =========================================================================
// 繁體/簡體雙向切換引擎 + 右鍵/手機長按 0.5 秒三合一修改器 + 劃詞 icon.png 浮窗
// =========================================================================
// 繁簡轉換已統一委派至 js/text-utils.js (TreesTextUtils)，徹底修復 '珍':'珠' 錯配並支援一簡對多繁詞組保護
function initOpenCCConverter() {}

function convertScript(str, mode = currentScriptMode) {
  if (!str) return '';
  if (window.TreesTextUtils && typeof window.TreesTextUtils.convertScript === 'function') {
    return window.TreesTextUtils.convertScript(str, mode);
  }
  return str;
}

function switchScriptMode(mode) {
  const chkTrad = document.getElementById('chkTrad');
  const chkSimp = document.getElementById('chkSimp');
  const sheet = document.getElementById('printableSheet');
  if (mode === 'trad' && chkTrad && chkTrad.checked) {
    if (chkSimp) chkSimp.checked = false;
    currentScriptMode = 'trad';
  } else if (mode === 'simp' && chkSimp && chkSimp.checked) {
    if (chkTrad) chkTrad.checked = false;
    currentScriptMode = 'simp';
  }
  const hideHz = chkTrad && chkSimp && !chkTrad.checked && !chkSimp.checked;
  if (sheet) sheet.classList.toggle('hide-hz', Boolean(hideHz));
  syncStudioRowVisibility();

  document.querySelectorAll('.tp-cell-hz').forEach(el => {
    const raw = el.dataset.raw || el.textContent;
    if (raw && /[\u4e00-\u9fa5]/.test(raw)) {
      el.dataset.raw = raw;
      el.textContent = convertScript(raw, currentScriptMode);
    }
  });
  const popScriptBtn = document.getElementById('btnScriptMiniPopover');
  if (popScriptBtn) popScriptBtn.textContent = currentScriptMode === 'simp' ? 'Simp 简' : 'Trad 繁';
  try { localStorage.setItem('tp_script_mode', currentScriptMode); } catch (e) {}
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.set({ scriptMode: currentScriptMode });
  }
  renderMnemonicsPack();
}

function getSingleCharPinyinNum(ch) {
  if (!ch) return '';
  try {
    if (typeof window.pinyinPro !== 'undefined' && window.pinyinPro.pinyin) {
      return window.pinyinPro.pinyin(ch[0], { toneType: 'num' });
    }
    if (typeof TreesSegmenter !== 'undefined' && TreesSegmenter.processChinese) {
      let res = '';
      const dummy = document.createDocumentFragment();
      TreesSegmenter.processChinese(ch[0], dummy, ch[0], 0, (c, py) => { res = py; });
      return res;
    }
  } catch (e) {}
  return '';
}

function compilePinyinToTrees(pyNum) {
  if (!pyNum) return '';
  try {
    if (typeof TreesCompiler !== 'undefined' && TreesCompiler.compile) {
      return TreesCompiler.compile(pyNum);
    }
  } catch (e) {}
  return pyNum;
}

function openThreeInOneEditor(colEl) {
  activeEditCol = colEl;
  const zhEl = colEl.querySelector('.tp-cell-hz');
  const stdEl = colEl.querySelector('.tp-cell-py');
  const tpEl = colEl.querySelector('.tp-cell-trees');
  const zhIn = document.getElementById('editZhInput');
  const stdIn = document.getElementById('editStdInput');
  const tpIn = document.getElementById('editTpInput');
  if (zhIn) zhIn.value = zhEl ? zhEl.textContent.trim() : '';
  if (stdIn) stdIn.value = colEl.dataset.pynum || (stdEl ? stdEl.textContent.trim() : '');
  if (tpIn) tpIn.value = tpEl ? tpEl.textContent.trim() : '';
  const modal = document.getElementById('editCharModal');
  if (modal) modal.style.display = 'flex';
}

function onEditZhOrNumChange(source) {
  const zhIn = document.getElementById('editZhInput');
  const stdIn = document.getElementById('editStdInput');
  const tpIn = document.getElementById('editTpInput');
  if (source === 'zh' && zhIn) {
    const newCh = zhIn.value.trim();
    if (newCh && /[\u4e00-\u9fa5]/.test(newCh)) {
      const pyNum = getSingleCharPinyinNum(newCh[0]);
      if (pyNum) {
        if (stdIn) stdIn.value = pyNum;
        if (tpIn) tpIn.value = compilePinyinToTrees(pyNum);
      }
    }
  } else if (source === 'std' && stdIn) {
    const rawStd = stdIn.value.trim();
    if (/^[a-züv:]+[0-5]?$/i.test(rawStd)) {
      if (tpIn) tpIn.value = compilePinyinToTrees(rawStd);
    }
  }
}

function saveThreeInOneEdit() {
  if (!activeEditCol) return;
  const newZh = (document.getElementById('editZhInput')?.value || '').trim();
  const rawStd = (document.getElementById('editStdInput')?.value || '').trim();
  const newTp = (document.getElementById('editTpInput')?.value || '').trim();
  if (checkAndRemindProfanity(newZh)) return;

  const zhEl = activeEditCol.querySelector('.tp-cell-hz');
  const stdEl = activeEditCol.querySelector('.tp-cell-py');
  const tpEl = activeEditCol.querySelector('.tp-cell-trees');

  if (newZh && zhEl) {
    const tradChar = convertScript(newZh, 'trad');
    zhEl.dataset.raw = tradChar;
    zhEl.textContent = convertScript(tradChar, currentScriptMode);
  }
  if (rawStd && stdEl) {
    activeEditCol.dataset.pynum = rawStd;
    stdEl.textContent = /^[a-züv:]+[1-5]$/i.test(rawStd) ? toStandardToneMarks(rawStd) : rawStd;
  }
  if (newTp && tpEl) {
    tpEl.textContent = newTp;
  }

  if (newZh) {
    const tradKey = convertScript(newZh, 'trad');
    userCustomEdits[tradKey] = {
      std: stdEl ? stdEl.textContent : '',
      tp: tpEl ? tpEl.textContent : '',
      pynum: rawStd
    };
    try {
      localStorage.setItem('tp_custom_char_edits_v2', JSON.stringify(userCustomEdits));
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        // 防止超過 chrome.storage.sync 單項 8KB 配額限制：僅同步最新 80 字
        const entries = Object.entries(userCustomEdits);
        const capped = entries.length > 80 ? Object.fromEntries(entries.slice(-80)) : userCustomEdits;
        chrome.storage.sync.set({ customCharEdits: capped });
      }
    } catch (e) {}
  }

  const modal = document.getElementById('editCharModal');
  if (modal) modal.style.display = 'none';
}

function handleTextSelectionCheck(e) {
  const iconOnlyBtn = document.getElementById('selectionIconOnly');
  const miniPopover = document.getElementById('selectionMiniPopover');
  if (!iconOnlyBtn || !miniPopover) return;
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

async function openSelectionMiniPopover(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (!selectedPageText) return;
  const iconOnlyBtn = document.getElementById('selectionIconOnly');
  const miniPopover = document.getElementById('selectionMiniPopover');
  if (!iconOnlyBtn || !miniPopover) return;

  const rect = iconOnlyBtn.getBoundingClientRect();
  iconOnlyBtn.style.display = 'none';

  miniPopover.style.left = Math.max(12, Math.min(window.innerWidth - 455, rect.left + window.scrollX - 180)) + 'px';
  miniPopover.style.top = Math.max(12, rect.top + window.scrollY + 8) + 'px';
  miniPopover.style.display = 'flex';

  const body = document.getElementById('popoverAnnotationBody');
  if (body) body.innerHTML = `<div style="font-size:0.84rem; color:#666;">⚡ ...</div>`;

  const hasZh = /[\u4e00-\u9fa5]/.test(selectedPageText);
  if (hasZh) {
    popoverZhText = convertScript(expandMathEconTimeAndDatesToZh(selectedPageText), 'trad');
    popoverEnText = await translateFast(popoverZhText, 'zh', 'en');
  } else {
    popoverEnText = selectedPageText;
    const rawZh = await translateFast(selectedPageText, 'en', 'zh');
    popoverZhText = convertScript(expandMathEconTimeAndDatesToZh(rawZh), 'trad');
  }

  if (body) {
    body.innerHTML = '';
    appendSentenceProgressive(popoverZhText, popoverEnText, 'popoverAnnotationBody');
  }

  // 劃選詞句點擊後同步於底部彈出社群記憶條（與點擊單字一致：顯示該詞記法或 No community trick yet + Write Your Trick）
  const cleanSelHz = (popoverZhText || '').replace(/[^\u4e00-\u9fa5]/g, '').slice(0, 12);
  if (cleanSelHz && window.TreesFunHub && typeof window.TreesFunHub.showCharBar === 'function') {
    window.TreesFunHub.showCharBar(cleanSelHz, '', '', cleanSelHz, (popoverEnText || '').trim().slice(0, 60));
  }
}

function closeSelectionMiniPopover() {
  const miniPopover = document.getElementById('selectionMiniPopover');
  if (miniPopover) miniPopover.style.display = 'none';
}

function speakPopoverContent() {
  if (popoverZhText) speakSingleOrSentence(popoverZhText);
}

function togglePopoverScriptMode() {
  const nextMode = (currentScriptMode === 'trad') ? 'simp' : 'trad';
  const chkTrad = document.getElementById('chkTrad');
  const chkSimp = document.getElementById('chkSimp');
  if (chkTrad) chkTrad.checked = (nextMode === 'trad');
  if (chkSimp) chkSimp.checked = (nextMode === 'simp');
  switchScriptMode(nextMode);
}

function recordPopoverContent() {
  if (!popoverZhText && !popoverEnText) return;
  closeSelectionMiniPopover();
  const wBtn = document.querySelector('.tab-btn[data-tab="workspace"]');
  if (wBtn) wBtn.click();
  const container = document.getElementById('sentencesContainer');
  if (container) {
    container.innerHTML = '';
    appendSentenceProgressive(popoverZhText, popoverEnText);
  }
  setTimeout(() => openCreatorStudio('9-16'), 80);
}

async function printPopoverContent() {
  closeSelectionMiniPopover();
  const wBtn = document.querySelector('.tab-btn[data-tab="workspace"]');
  if (wBtn) wBtn.click();
  const inputEl = document.getElementById('userInput');
  if (inputEl) inputEl.value = `${popoverZhText} ||| ${popoverEnText}`;
  await runDirectTranslate(`${popoverZhText} ||| ${popoverEnText}`);
  setTimeout(() => window.print(), 300);
}

function buildCharColumnsIntoRow(rawZhSentence, matrixRow) {
  const expanded = expandMathEconTimeAndDatesToZh(rawZhSentence);
  const zhSentence = convertScript(expanded, 'trad');
  matrixRow.innerHTML = '';

  let i = 0;
  while (i < zhSentence.length) {
    const rem = zhSentence.slice(i);
    const zhMatch = rem.match(/^[\u4e00-\u9fa5]+/);
    if (zhMatch) {
      const chunk = zhMatch[0];
      const dummyFrag = document.createDocumentFragment();
      TreesSegmenter.processChinese(chunk, dummyFrag, zhSentence, i, (ch, py) => {
        const savedCustom = userCustomEdits[ch];
        const compiled = savedCustom?.tp || TreesCompiler.compile(py);
        const stdPy = savedCustom?.std || toStandardToneMarks(py);
        const pyNum = savedCustom?.pynum || py;
        appendSingleCharCol(matrixRow, ch, compiled, stdPy, pyNum);
      });
      i += chunk.length;
      continue;
    }

    const ch = zhSentence[i];
    if (!/\s/.test(ch)) {
      const isPunct = /[，。！？；：、,.!?;:"'“”‘’（）()《》【】]/.test(ch);
      if (isPunct) appendSingleCharCol(matrixRow, '', ch, '', '');
      else appendSingleCharCol(matrixRow, ch, '', '', '');
    }
    i++;
  }
  return zhSentence;
}

function appendSingleCharCol(matrixRow, charHz, treesStr, stdPyStr, rawPyNum) {
  const col = document.createElement('div');
  col.className = 'tp-char-col';
  col.dataset.pynum = rawPyNum || '';
  if (charHz) {
    col.title = currentLang === 'en'
      ? `🔊 Tap to speak "${charHz}" · ✍️ Right-click or Long-press (0.5s) to edit`
      : `🔊 點擊朗讀「${charHz}」 · ✍️ 右鍵或手機長按 0.5 秒修改`;
  }

  const tSpan = document.createElement('span');
  tSpan.className = 'tp-cell-trees';
  tSpan.textContent = treesStr || '\u00A0';

  const pSpan = document.createElement('span');
  pSpan.className = 'tp-cell-py';
  pSpan.textContent = stdPyStr || '\u00A0';

  const hSpan = document.createElement('span');
  hSpan.className = 'tp-cell-hz';
  if (charHz && /[\u4e00-\u9fa5]/.test(charHz)) {
    hSpan.dataset.raw = charHz;
    hSpan.textContent = convertScript(charHz, currentScriptMode);
  } else {
    hSpan.textContent = charHz || '\u00A0';
  }

  if (charHz && /[\u4e00-\u9fa5]/.test(charHz)) {
    let pressTimer = null;
    let isLongPress = false;

    // 1. 電腦端右鍵 + 安卓長按：直接打開三合一修改框
    col.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(pressTimer);
      openThreeInOneEditor(col);
    });

    // 2. 手機與平板 (iOS / Android)：手指按住 0.5 秒 (500ms) 彈出修改框
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

    // 3. 輕點一下 (Tap / Click)：正常朗讀發音 + 底部無打擾膠囊顯示該字社群記憶法
    col.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isLongPress) {
        isLongPress = false;
        return;
      }
      const parentBlock = col.closest('.sentence-block');
      const fullZh = parentBlock ? parentBlock.dataset.zh : '';
      speakSingleOrSentence(e.shiftKey && fullZh ? fullZh : hSpan.textContent);
      if (!e.shiftKey && window.TreesFunHub && typeof window.TreesFunHub.showCharBar === 'function') {
        if (!document.body.classList.contains('tp-studio-open') || studioRecordPopups) {
          window.TreesFunHub.showCharBar(hSpan.textContent, tSpan.textContent, pSpan.textContent, fullZh);
        }
      }
    });
  }

  col.appendChild(tSpan);
  col.appendChild(pSpan);
  col.appendChild(hSpan);
  matrixRow.appendChild(col);
}

function appendSentenceProgressive(rawZhText, enTranslation = '', targetContainerId = 'sentencesContainer') {
  const container = document.getElementById(targetContainerId) || document.getElementById('sentencesContainer');
  const block = document.createElement('div');
  block.className = 'sentence-block';

  const enDiv = document.createElement('div');
  enDiv.className = 'tp-line-en';
  enDiv.contentEditable = 'true';
  enDiv.title = '🔊 Click to edit English';
  const hasLockedEn = Boolean(enTranslation && enTranslation.trim());
  enDiv.textContent = hasLockedEn ? enTranslation.trim() : '...';
  enDiv.addEventListener('input', () => { block.dataset.en = enDiv.textContent; });
  block.appendChild(enDiv);

  const matrixRow = document.createElement('div');
  matrixRow.className = 'tp-matrix-row';
  const expandedZh = buildCharColumnsIntoRow(rawZhText, matrixRow);
  block.dataset.zh = expandedZh;
  block.dataset.en = enTranslation;
  block.appendChild(matrixRow);

  container.appendChild(block);

  if (!hasLockedEn) {
    translateFast(expandedZh, 'zh', 'en').then(en => {
      enDiv.textContent = en || expandedZh;
      block.dataset.en = en || expandedZh;
    });
  }
  return block;
}

