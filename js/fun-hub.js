/**
 * Trees Pinyin 趣味社群互動中心與迷因圖卡引擎 (js/fun-hub.js - v5.2)
 * - 1. 點字底部無打擾膠囊橫條（不阻斷點字朗讀，隨時按讚 / 做迷因卡 / 投稿記法）
 * - 2. 每日一字腦洞擂台 + 本週神梗榜 + 造林者排行榜 (Seedling/Sapling/Forest Builder) + 亞馬遜新書 Top 20
 * - 3. 「聲調鬧笑話」Tone Traps 雙語音對比翻牌小劇場
 * - 4. 30 秒「李白 / 點餐」零成本語音通關卡（Web Speech API 拼音音節比對 + 成就證書 + 9:16 錄影連動）
 * - 5. HTML5 Canvas 1080×1080 高清「記憶迷因卡 / 聲調烏龍卡 / 通關證書」一鍵生成
 */
(function(global) {
  if (global.TreesFunHub) return;

  const API_BASES = [
    'https://api.treespinyin.com',
    'https://treespinyin-api.treespinyin.workers.dev'
  ];

  const LOCAL_USER_MEMES_KEY = 'tp_v52_user_mnemonics';
  const LOCAL_VOTED_KEY = 'tp_v52_voted_ids';
  const LOCAL_LIKES_DELTA_KEY = 'tp_v52_likes_delta';

  let communityCache = [];
  let communityFetched = false;
  let activeSubTab = 'memes'; // 'memes' | 'traps' | 'challenge'
  let activeCategory = 'All';
  let activeSort = 'top';
  let searchKeyword = '';
  let activeChallengeId = 'ch_libai';
  let challengeRec = null;
  let challengeTimer = null;
  let challengeSecondsLeft = 30;
  let lastPassedScore = 0;

  // 社群分享圖卡雙尺寸狀態（4:5 貼文 1080×1350 / 9:16 限動 1080×1920）
  let activeCardRatio = localStorage.getItem('tp_share_card_ratio') === '9-16' ? '9-16' : '4-5';
  let activeCardSpec = null; // { kind: 'meme'|'trap'|'cert', data, extra, justPublished }
  let activeCardDataUrl = '';
  let activeCardFilename = 'TreesPinyin-Card.png';
  let activeCharBarList = [];
  let activeCharBarIdx = 0;

  function esc(str) {
    if (global.TreesTextUtils && typeof global.TreesTextUtils.escapeHtml === 'function') {
      return global.TreesTextUtils.escapeHtml(str);
    }
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 安全富文字渲染：轉義所有 HTML（防 XSS），精準保留 Trees Pinyin 常用的 <b>粗體</b>、<i>斜體</i>、<u>底線</u> 與 (靜音括弧)
  function renderSafeRich(str) {
    return esc(str)
      .replace(/&lt;(\/?)(u|b|i)&gt;/gi, (_, slash, tag) => `<${slash}${tag.toLowerCase()}>`);
  }

  function stripRichTags(str) {
    return String(str || '').replace(/<\/?(?:u|b|i)>/gi, '');
  }

  function speakZh(text) {
    if (!text) return;
    if (global.__tpStudioBridge && typeof global.__tpStudioBridge.speak === 'function') {
      global.__tpStudioBridge.speak(text);
      return;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).trim());
      const twVoice = (global.TreesTextUtils && typeof global.TreesTextUtils.pickTaiwanFemaleVoice === 'function')
        ? global.TreesTextUtils.pickTaiwanFemaleVoice()
        : null;
      if (twVoice) {
        u.voice = twVoice;
        u.lang = twVoice.lang;
      } else {
        u.lang = 'zh-TW';
      }
      u.rate = 0.86;
      u.pitch = 1.04;
      window.speechSynthesis.speak(u);
    }
  }

  function getLocalJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function setLocalJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }

  function getAllMnemonics() {
    const seeds = (global.TreesFunData && global.TreesFunData.SEED_MNEMONICS) ? global.TreesFunData.SEED_MNEMONICS : [];
    const userLocal = getLocalJson(LOCAL_USER_MEMES_KEY, []);
    const likesDelta = getLocalJson(LOCAL_LIKES_DELTA_KEY, {});
    const byId = new Map();

    for (const s of seeds) {
      byId.set(s.id, { ...s, likes: (s.likes || 0) + (likesDelta[s.id] || 0) });
    }
    for (const c of communityCache) {
      if (!c || !c.id) continue;
      const existing = byId.get(c.id);
      const baseLikes = Math.max(c.likes || 0, existing ? existing.likes : 0);
      byId.set(c.id, { ...c, likes: baseLikes + (likesDelta[c.id] || 0) });
    }
    for (const u of userLocal) {
      if (!u || !u.id) continue;
      if (!byId.has(u.id)) {
        byId.set(u.id, { ...u, likes: (u.likes || 1) + (likesDelta[u.id] || 0) });
      }
    }
    return Array.from(byId.values());
  }

  function hasVoted(id) {
    const voted = getLocalJson(LOCAL_VOTED_KEY, {});
    return !!voted[id];
  }

  async function voteMnemonic(id) {
    if (!id || hasVoted(id)) return false;
    const voted = getLocalJson(LOCAL_VOTED_KEY, {});
    voted[id] = true;
    setLocalJson(LOCAL_VOTED_KEY, voted);

    const deltas = getLocalJson(LOCAL_LIKES_DELTA_KEY, {});
    deltas[id] = (deltas[id] || 0) + 1;
    setLocalJson(LOCAL_LIKES_DELTA_KEY, deltas);

    // 非同步上報雲端（若尚未啟用 D1 也不影響本地即時體驗）
    for (const base of API_BASES) {
      try {
        const r = await fetch(`${base}/mnemonics/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        if (r.ok) break;
      } catch (e) {}
    }
    return true;
  }

  const LOCAL_REPORTED_KEY = 'tp_reported_mnemonics_v1';
  async function reportMnemonic(id) {
    if (!id) return false;
    const reported = getLocalJson(LOCAL_REPORTED_KEY, {});
    if (reported[id]) return false;
    reported[id] = 1;
    setLocalJson(LOCAL_REPORTED_KEY, reported);
    for (const base of API_BASES) {
      try {
        const r = await fetch(`${base}/mnemonics/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        if (r.ok) break;
      } catch (e) {}
    }
    return true;
  }

  async function syncCommunityFromCloud(force = false) {
    if (communityFetched && !force) return;
    communityFetched = true;
    const qs = force ? `?sort=top&limit=150&_=${Date.now()}` : '?sort=top&limit=150';
    for (const base of API_BASES) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(`${base}/mnemonics${qs}`, { signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) {
          const d = await r.json().catch(() => null);
          if (d && Array.isArray(d.items) && d.items.length > 0) {
            communityCache = d.items;
            renderActiveSubTab();
            break;
          }
        }
      } catch (e) {}
    }
  }

  function normHanziKey(hz) {
    const clean = String(hz || '').replace(/[^\u4e00-\u9fa5]/g, '');
    return (global.TreesTextUtils && typeof global.TreesTextUtils.toSimplified === 'function')
      ? global.TreesTextUtils.toSimplified(clean)
      : clean;
  }

  function getSameWordRankingMap(allItems) {
    const groups = new Map();
    for (const it of allItems) {
      const k = normHanziKey(it.hanzi);
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }
    const rankMap = new Map(); // id -> { rank, total, key }
    for (const [k, arr] of groups.entries()) {
      arr.sort((a, b) => (b.likes || 0) - (a.likes || 0) || (b.createdAt || 0) - (a.createdAt || 0));
      arr.forEach((it, i) => {
        rankMap.set(it.id, { rank: i + 1, total: arr.length, key: k });
      });
    }
    return rankMap;
  }

  // =========================================================================
  // 1. HTML5 Canvas 雙尺寸 (貼文 4:5 / 限動 9:16) 高清圖卡生成器 + 一鍵多媒體分享
  // =========================================================================
  // 支援 <b>粗體</b>、<i>斜體</i>、<u>底線</u> 組合的 Canvas 字元級解析器（絕不洩漏任何原始標籤）
  function tokenizeRichIntoStyledWords(richStr) {
    const str = String(richStr || '');
    const runs = [];
    const tagReg = /<(\/?)(u|b|i)>/gi;
    let inU = false, inB = false, inI = false;
    let last = 0;
    let m;
    while ((m = tagReg.exec(str)) !== null) {
      if (m.index > last) {
        runs.push({ text: str.slice(last, m.index), u: inU, b: inB, i: inI });
      }
      const isOpen = (m[1] !== '/');
      const tag = m[2].toLowerCase();
      if (tag === 'u') inU = isOpen;
      else if (tag === 'b') inB = isOpen;
      else if (tag === 'i') inI = isOpen;
      last = tagReg.lastIndex;
    }
    if (last < str.length) {
      runs.push({ text: str.slice(last), u: inU, b: inB, i: inI });
    }

    const words = [];
    let curWord = [];
    for (const run of runs) {
      const cleanTxt = run.text.replace(/<[^>]*>/g, '');
      const pieces = cleanTxt.split(/(\s+)/);
      for (const piece of pieces) {
        if (!piece) continue;
        if (/^\s+$/.test(piece)) {
          if (curWord.length > 0) {
            words.push(curWord);
            curWord = [];
          }
        } else {
          curWord.push({ text: piece, u: run.u, b: run.b, i: run.i });
        }
      }
    }
    if (curWord.length > 0) words.push(curWord);
    return words;
  }

  function buildCanvasFont(seg, baseWeight, fontSizePx) {
    const style = seg.i ? 'italic ' : '';
    const weight = (seg.b || seg.u) ? '800' : String(baseWeight);
    return `${style}${weight} ${fontSizePx}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  }

  function drawRichCanvasText(ctx, richStr, centerX, startY, maxWidth, lineHeight, maxLines, baseWeight, fontSizePx, normalColor, underlineColor) {
    const styledWords = tokenizeRichIntoStyledWords(richStr);
    if (styledWords.length === 0) return startY;

    const measureWord = (wordSegs) => {
      let w = 0;
      for (const seg of wordSegs) {
        ctx.font = buildCanvasFont(seg, baseWeight, fontSizePx);
        w += ctx.measureText(seg.text).width;
      }
      return w;
    };

    ctx.font = buildCanvasFont({ u: false, b: false, i: false }, baseWeight, fontSizePx);
    const spaceW = ctx.measureText(' ').width;
    const lines = [];
    let curLine = [];
    let curW = 0;

    for (let i = 0; i < styledWords.length; i++) {
      const wObj = styledWords[i];
      const ww = measureWord(wObj);
      const addW = curLine.length > 0 ? spaceW + ww : ww;
      if (curLine.length > 0 && curW + addW > maxWidth) {
        lines.push({ words: curLine, width: curW });
        curLine = [wObj];
        curW = ww;
        if (lines.length >= maxLines) break;
      } else {
        curLine.push(wObj);
        curW += addW;
      }
    }
    if (curLine.length > 0 && lines.length < maxLines) {
      lines.push({ words: curLine, width: curW });
    }

    ctx.textAlign = 'left';
    lines.forEach((lineObj, lineIdx) => {
      const y = startY + lineIdx * lineHeight;
      let x = centerX - lineObj.width / 2;
      lineObj.words.forEach((wordSegs, wIdx) => {
        if (wIdx > 0) {
          const prevLast = lineObj.words[wIdx - 1][lineObj.words[wIdx - 1].length - 1];
          const curFirst = wordSegs[0];
          if (prevLast && curFirst && prevLast.u && curFirst.u) {
            ctx.save();
            ctx.strokeStyle = underlineColor;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(x, y + 7);
            ctx.lineTo(x + spaceW, y + 7);
            ctx.stroke();
            ctx.restore();
          }
          x += spaceW;
        }
        for (const seg of wordSegs) {
          ctx.font = buildCanvasFont(seg, baseWeight, fontSizePx);
          ctx.fillStyle = seg.u ? underlineColor : normalColor;
          ctx.fillText(seg.text, x, y);
          const sw = ctx.measureText(seg.text).width;
          if (seg.u && sw > 0) {
            ctx.save();
            ctx.strokeStyle = underlineColor;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(x, y + 7);
            ctx.lineTo(x + sw, y + 7);
            ctx.stroke();
            ctx.restore();
          }
          x += sw;
        }
      });
    });
    ctx.textAlign = 'center';
    return startY + lines.length * lineHeight;
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
    const words = stripRichTags(text).split(/\s+/);
    let line = '';
    const lines = [];
    for (let i = 0; i < words.length; i++) {
      const test = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
        if (lines.length >= maxLines - 1) break;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    lines.forEach((ln, idx) => ctx.fillText(ln, x, y + idx * lineHeight));
    return y + lines.length * lineHeight;
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // 渲染「記憶迷因卡」(支援 4:5 貼文 1080×1350 與 9:16 限動 1080×1920)
  function renderMemeCardCanvas(item, ratio) {
    const isStory = ratio === '9-16';
    const W = 1080;
    const H = isStory ? 1920 : 1350;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#eef7e6');
    bg.addColorStop(1, '#dcfce7');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const cardPadX = 64;
    const cardTop = isStory ? 160 : 66;
    const cardH = isStory ? 1600 : 1218;

    ctx.save();
    ctx.shadowColor = 'rgba(27, 94, 32, 0.16)';
    ctx.shadowBlur = 44;
    ctx.shadowOffsetY = 18;
    drawRoundedRect(ctx, cardPadX, cardTop, W - cardPadX * 2, cardH, 48);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // 頂部品牌膠囊 + 真實讚數
    drawRoundedRect(ctx, cardPadX + 46, cardTop + 48, 340, 58, 29);
    ctx.fillStyle = '#e8f5e9';
    ctx.fill();
    ctx.fillStyle = '#1b5e20';
    ctx.font = '800 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🌳 TREES PINYIN', cardPadX + 76, cardTop + 87);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ea580c';
    ctx.font = '800 32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`👍 ${item.likes || 1}`, W - cardPadX - 50, cardTop + 88);

    // 核心大漢字（極簡留白、視覺絕對焦點）
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1b5e20';
    const hzSize = item.hanzi.length >= 4 ? 142 : (item.hanzi.length === 3 ? 172 : 216);
    const hzY = cardTop + (isStory ? 390 : 320);
    ctx.font = `800 ${hzSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillText(item.hanzi, W / 2, hzY);

    // Trees Pinyin 斜體粗體
    ctx.fillStyle = '#111827';
    ctx.font = 'italic 800 72px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(item.trees || '', W / 2, hzY + 114);

    // 英文意思 + 漢語拼音
    ctx.fillStyle = '#15803d';
    ctx.font = '700 44px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`"${item.meaning}"` + (item.pinyin ? `  ·  ${item.pinyin}` : ''), W / 2, hzY + 194);

    // 原版書底線 + 括弧記憶法高光盒（簡潔寬敞、完整展示重點）
    const boxY = hzY + (isStory ? 280 : 250);
    const boxH = isStory ? 660 : 485;
    drawRoundedRect(ctx, cardPadX + 54, boxY, W - (cardPadX + 54) * 2, boxH, 34);
    ctx.fillStyle = '#fffde7';
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4.5;
    ctx.stroke();

    let textCursorY = boxY + 86;
    if (item.hook) {
      textCursorY = drawRichCanvasText(
        ctx,
        `🔊 Sounds like: ${item.hook}`,
        W / 2,
        textCursorY,
        W - 250,
        56,
        2,
        700,
        40,
        '#c2410c',
        '#1b5e20'
      ) + 28;
    }

    drawRichCanvasText(
      ctx,
      item.mnemonic,
      W / 2,
      textCursorY,
      W - 260,
      58,
      isStory ? 7 : 5,
      600,
      38,
      '#1e293b',
      '#1b5e20'
    );

    // 極簡底部署名與網址（無多餘提示字）
    const footerY = cardTop + cardH - 52;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 27px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`💡 ${item.author || 'Author Pick'}  ·  treespinyin.com`, W / 2, footerY);

    return c.toDataURL('image/png');
  }

  function renderToneTrapCardCanvas(trap, ratio) {
    const isStory = ratio === '9-16';
    const W = 1080;
    const H = isStory ? 1920 : 1350;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.font = '800 38px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('😂 MANDARIN TONE TRAP ALERT!', W / 2, isStory ? 180 : 115);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 42px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    wrapCanvasText(ctx, trap.title, W / 2, isStory ? 260 : 185, W - 140, 54, 2);

    const boxTop = isStory ? 410 : 300;
    const boxH = isStory ? 560 : 490;

    // 左：正確
    drawRoundedRect(ctx, 64, boxTop, 452, boxH, 36);
    ctx.fillStyle = '#ecfdf5';
    ctx.fill();
    ctx.fillStyle = '#065f46';
    ctx.font = '800 30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('😇 WHAT YOU MEANT', 290, boxTop + 68);
    ctx.font = '800 124px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(trap.safe.hz, 290, boxTop + 230);
    ctx.fillStyle = '#111827';
    ctx.font = 'italic 800 46px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(trap.safe.trees, 290, boxTop + 325);
    ctx.fillStyle = '#047857';
    ctx.font = '700 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    wrapCanvasText(ctx, trap.safe.en, 290, boxTop + 405, 400, 44, 2);

    // 右：踩雷
    drawRoundedRect(ctx, 564, boxTop, 452, boxH, 36);
    ctx.fillStyle = '#fef2f2';
    ctx.fill();
    ctx.fillStyle = '#991b1b';
    ctx.font = '800 30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('😱 WHAT YOU SAID', 790, boxTop + 68);
    ctx.font = '800 124px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(trap.trap.hz, 790, boxTop + 230);
    ctx.fillStyle = '#111827';
    ctx.font = 'italic 800 46px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(trap.trap.trees, 790, boxTop + 325);
    ctx.fillStyle = '#b91c1c';
    ctx.font = '700 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    wrapCanvasText(ctx, trap.trap.en, 790, boxTop + 405, 400, 44, 2);

    const jokeTop = boxTop + boxH + (isStory ? 70 : 48);
    drawRoundedRect(ctx, 64, jokeTop, W - 128, isStory ? 260 : 210, 28);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    wrapCanvasText(ctx, trap.joke, W / 2, jokeTop + 76, W - 200, 48, 3);

    const ctaY = jokeTop + (isStory ? 350 : 285);
    drawRoundedRect(ctx, 190, ctaY, 700, 78, 39);
    ctx.fillStyle = '#22c55e';
    ctx.fill();
    ctx.fillStyle = '#052e16';
    ctx.font = '800 32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('🌳 Laugh & Learn Free → treespinyin.com', W / 2, ctaY + 50);

    return c.toDataURL('image/png');
  }

  function renderCertCardCanvas(challenge, scorePct, userName, ratio) {
    const isStory = ratio === '9-16';
    const W = 1080;
    const H = isStory ? 1920 : 1350;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0f291e');
    grad.addColorStop(1, '#1b5e20');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    drawRoundedRect(ctx, 56, 56, W - 112, H - 112, 40);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 8;
    ctx.stroke();

    const offsetY = isStory ? 210 : 40;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde68a';
    ctx.font = '800 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('🏆 TREES PINYIN 30-SECOND INSTANT PASS', W / 2, 160 + offsetY);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 58px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    wrapCanvasText(ctx, challenge.title, W / 2, 265 + offsetY, W - 200, 70, 2);

    ctx.beginPath();
    ctx.arc(W / 2, 495 + offsetY, 125, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = '900 80px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`${scorePct}%`, W / 2, 515 + offsetY);
    ctx.font = '800 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('NATIVE-UNDERSTOOD', W / 2, 560 + offsetY);

    ctx.fillStyle = '#bbf7d0';
    ctx.font = '700 40px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`${challenge.badge}  ·  Unlocked!`, W / 2, 695 + offsetY);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 36px "PingFang SC", "Microsoft YaHei", sans-serif';
    const previewLines = challenge.lines.slice(0, 2).map(l => l.zh).join(' ');
    ctx.fillText(`"${previewLines}"`, W / 2, 785 + offsetY);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`Awarded to: ${userName}`, W / 2, 885 + offsetY);

    drawRoundedRect(ctx, 190, 965 + offsetY, 700, 78, 39);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = '800 31px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('Beat my score in 30s → treespinyin.com', W / 2, 1015 + offsetY);

    return c.toDataURL('image/png');
  }

  function closeShareCardMenus() {
    document.querySelectorAll('#tpShareCardModal .tp-drop-menu').forEach(m => { m.style.display = 'none'; });
  }

  function ensureShareCardModal() {
    if (document.getElementById('tpShareCardModal')) return;
    const modal = document.createElement('div');
    modal.id = 'tpShareCardModal';
    modal.className = 'modal';
    modal.style.zIndex = '200007';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:580px; width:auto; padding:12px 14px; align-items:center; text-align:center; gap:8px; max-height:96vh; overflow:visible;">
        <img id="tpShareCardPreview" style="display:block; max-width:min(88vw, 540px); max-height:80vh; width:auto; height:auto; object-fit:contain; border-radius:14px; border:1px solid #d0d7de; box-shadow:0 8px 26px rgba(0,0,0,0.14);">

        <div id="tpShareToast" style="font-size:11.5px; font-weight:700; color:#15803d; display:none;"></div>

        <!-- Compact control bar below preview: Size ▾ | Share ▾ | Copy ▾ -->
        <div style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; position:relative;">
          <div class="tp-drop-wrap">
            <button type="button" id="tpBtnSizeMenu" class="tp-bar-ctrl-btn">Size: 4:5 ▾</button>
            <div id="tpMenuSize" class="tp-drop-menu">
              <button type="button" class="tp-drop-item" data-ratio="4-5">Post 4:5 (1080×1350)</button>
              <button type="button" class="tp-drop-item" data-ratio="9-16">Story / Reels 9:16 (1080×1920)</button>
            </div>
          </div>

          <div class="tp-drop-wrap">
            <button type="button" id="tpBtnShareMenu" class="tp-bar-ctrl-btn primary">Share ▾</button>
            <div id="tpMenuShare" class="tp-drop-menu" style="left:50%; transform:translateX(-50%); min-width:205px;">
              <button type="button" class="tp-drop-item" data-share-net="pinterest">📌 Pinterest</button>
              <button type="button" class="tp-drop-item" data-share-net="threads">🧵 Threads</button>
              <button type="button" class="tp-drop-item" data-share-net="x">🐦 X (Twitter)</button>
              <button type="button" class="tp-drop-item" data-share-net="facebook">📘 Facebook</button>
              <button type="button" class="tp-drop-item" data-share-net="reddit">🤖 Reddit</button>
              <button type="button" class="tp-drop-item" data-share-net="line">💚 LINE</button>
              <button type="button" class="tp-drop-item" data-share-net="whatsapp">💬 WhatsApp</button>
              <button type="button" class="tp-drop-item" data-share-net="telegram">✈️ Telegram</button>
              <button type="button" class="tp-drop-item" id="tpShareNative">📲 System Share (Direct File)</button>
              <div style="height:1px; background:#e2e8f0; margin:4px 6px;"></div>
              <button type="button" class="tp-drop-item" id="tpShareWeChat">🟢 WeChat (微信)</button>
              <button type="button" class="tp-drop-item" id="tpShareZalo">🔵 Zalo (Vietnam)</button>
              <button type="button" class="tp-drop-item" data-share-net="kakao">💛 KakaoTalk (Korea)</button>
              <button type="button" class="tp-drop-item" id="tpShareXhs">📕 RedNote (小紅書)</button>
              <button type="button" class="tp-drop-item" id="tpShareIG">📸 Instagram</button>
              <button type="button" class="tp-drop-item" id="tpShareTikTok">🎵 TikTok</button>
            </div>
          </div>

          <div class="tp-drop-wrap">
            <button type="button" id="tpBtnCopyMenu" class="tp-bar-ctrl-btn blue">Copy ▾</button>
            <div id="tpMenuCopy" class="tp-drop-menu" style="right:0; left:auto; min-width:145px;">
              <button type="button" class="tp-drop-item" id="tpDoCopyImg">📋 Copy Image</button>
              <a id="tpSocialSave" download="TreesPinyin-Card.png" class="tp-drop-item">⬇️ Save PNG</a>
            </div>
          </div>
        </div>
      </div>
    `;

    // 點擊空白處自然關閉，點擊內部空白收合下拉選單
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeShareCardMenus();
        modal.style.display = 'none';
      } else if (!e.target.closest('.tp-drop-wrap')) {
        closeShareCardMenus();
      }
    });
    document.body.appendChild(modal);

    const toggleMenu = (menuId) => {
      const m = document.getElementById(menuId);
      if (!m) return;
      const isOpen = m.style.display === 'flex';
      closeShareCardMenus();
      m.style.display = isOpen ? 'none' : 'flex';
    };

    document.getElementById('tpBtnSizeMenu').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('tpMenuSize'); });
    document.getElementById('tpBtnShareMenu').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('tpMenuShare'); });
    document.getElementById('tpBtnCopyMenu').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('tpMenuCopy'); });

    modal.querySelectorAll('#tpMenuSize [data-ratio]').forEach(btn => {
      btn.addEventListener('click', () => {
        switchCardRatio(btn.getAttribute('data-ratio'));
        closeShareCardMenus();
      });
    });

    document.getElementById('tpDoCopyImg').addEventListener('click', async () => {
      closeShareCardMenus();
      await copyActiveCardImageToClipboard();
    });
    modal.querySelectorAll('a.tp-drop-item').forEach(a => {
      a.addEventListener('click', () => closeShareCardMenus());
    });

    // 系統原生多媒體轉發
    document.getElementById('tpShareNative').addEventListener('click', async () => {
      closeShareCardMenus();
      const shareText = buildShareCaptionForActiveCard();
      try {
        const res = await fetch(activeCardDataUrl);
        const blob = await res.blob();
        const file = new File([blob], activeCardFilename, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: 'Trees Pinyin', text: shareText, files: [file] });
          showShareToast('✅ Shared!');
          return;
        }
        if (navigator.share) {
          await navigator.share({ title: 'Trees Pinyin', text: shareText, url: 'https://www.treespinyin.com' });
          showShareToast('✅ Shared!');
          return;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
      await copyActiveCardImageToClipboard();
    });

    // Direct-image social share via Cloudflare Worker OG Card URL (/card/<id>)
    modal.querySelectorAll('[data-share-net]').forEach(btn => {
      btn.addEventListener('click', () => {
        closeShareCardMenus();
        openPlatformShare(btn.getAttribute('data-share-net'));
      });
    });

    // WeChat, Zalo, RedNote, Instagram & TikTok: silently copy PNG and open web directly
    document.getElementById('tpShareWeChat').addEventListener('click', async () => {
      closeShareCardMenus();
      await copyActiveCardImageToClipboard(true);
      window.open('https://filehelper.weixin.qq.com/', '_blank', 'noopener,noreferrer');
    });
    document.getElementById('tpShareZalo').addEventListener('click', async () => {
      closeShareCardMenus();
      await copyActiveCardImageToClipboard(true);
      window.open('https://chat.zalo.me/', '_blank', 'noopener,noreferrer');
    });
    document.getElementById('tpShareXhs').addEventListener('click', async () => {
      closeShareCardMenus();
      await copyActiveCardImageToClipboard(true);
      window.open('https://creator.xiaohongshu.com/publish/publish', '_blank', 'noopener,noreferrer');
    });
    document.getElementById('tpShareIG').addEventListener('click', async () => {
      closeShareCardMenus();
      await copyActiveCardImageToClipboard(true);
      window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    });
    document.getElementById('tpShareTikTok').addEventListener('click', async () => {
      closeShareCardMenus();
      await copyActiveCardImageToClipboard(true);
      window.open('https://www.tiktok.com/upload', '_blank', 'noopener,noreferrer');
    });
  }

  const uploadedCardCache = new Map();
  let activeCardRemote = null;
  let activeCardUploadPromise = null;

  function buildShareTitleForActiveCard() {
    if (!activeCardSpec) return 'Trees Pinyin — Read English, Speak Chinese';
    if (activeCardSpec.kind === 'meme') {
      const it = activeCardSpec.data;
      return `${it.hanzi} (${it.trees}) = ${it.meaning} | Trees Pinyin`;
    }
    if (activeCardSpec.kind === 'trap') {
      const tr = activeCardSpec.data;
      return `Mandarin Tone Trap: ${tr.safe.hz} vs ${tr.trap.hz} | Trees Pinyin`;
    }
    return `30s Mandarin Challenge Passed (${activeCardSpec.extra?.score || 80}%) | Trees Pinyin`;
  }

  function showShareToast(msg) {
    const toast = document.getElementById('tpShareToast');
    if (!toast) return;
    toast.textContent = msg || '';
    toast.style.display = msg ? 'block' : 'none';
  }

  function buildShareCaptionForActiveCard(includeFallbackUrl = true) {
    const suffix = includeFallbackUrl ? ' 👉 https://www.treespinyin.com' : '';
    if (!activeCardSpec) return `Read English, Speak Chinese!${suffix}`;
    if (activeCardSpec.kind === 'meme') {
      const it = activeCardSpec.data;
      const hookPlain = stripRichTags(it.hook || '');
      return `Learn Chinese "${it.hanzi}" (${it.trees} = ${it.meaning})!${hookPlain ? ` Sounds like "${hookPlain}" 😂` : ''}${suffix}`;
    }
    if (activeCardSpec.kind === 'trap') {
      const tr = activeCardSpec.data;
      return `😂 Mandarin Tone Trap: ${tr.safe.hz} (${tr.safe.en}) vs ${tr.trap.hz} (${tr.trap.en})!${suffix}`;
    }
    return `🏆 I passed the 30-second Mandarin challenge (${activeCardSpec.extra?.score || 80}% native-understood) with Trees Pinyin!${suffix}`;
  }

  function buildPlatformShareUrl(net, remote) {
    const shareUrl = (remote && remote.shareUrl) || 'https://www.treespinyin.com';
    const imageUrl = (remote && remote.imageUrl) || '';
    const caption = buildShareCaptionForActiveCard(false);
    const encText = encodeURIComponent(caption);
    const encUrl = encodeURIComponent(shareUrl);
    if (net === 'pinterest') {
      const mediaPart = imageUrl ? `&media=${encodeURIComponent(imageUrl)}` : '';
      return `https://pinterest.com/pin/create/button/?url=${encUrl}${mediaPart}&description=${encText}`;
    }
    if (net === 'threads') {
      return `https://www.threads.net/intent/post?text=${encodeURIComponent(`${caption} ${shareUrl}`)}`;
    }
    if (net === 'x') {
      return `https://twitter.com/intent/tweet?text=${encText}&url=${encUrl}`;
    }
    if (net === 'facebook') {
      return `https://www.facebook.com/sharer/sharer.php?u=${encUrl}`;
    }
    if (net === 'reddit') {
      return `https://www.reddit.com/submit?url=${encUrl}&title=${encText}`;
    }
    if (net === 'line') {
      return `https://social-plugins.line.me/lineit/share?url=${encUrl}&text=${encText}`;
    }
    if (net === 'kakao') {
      return `https://story.kakao.com/share?url=${encUrl}`;
    }
    if (net === 'whatsapp') {
      return `https://api.whatsapp.com/send?text=${encodeURIComponent(`${caption} ${shareUrl}`)}`;
    }
    if (net === 'telegram') {
      return `https://t.me/share/url?url=${encUrl}&text=${encText}`;
    }
    return shareUrl;
  }

  function preuploadActiveCard() {
    const dataUrl = activeCardDataUrl;
    if (!dataUrl) return Promise.resolve(null);
    if (uploadedCardCache.has(dataUrl)) {
      activeCardRemote = uploadedCardCache.get(dataUrl);
      activeCardUploadPromise = Promise.resolve(activeCardRemote);
      return activeCardUploadPromise;
    }
    activeCardRemote = null;
    const payload = {
      dataUrl,
      ratio: activeCardRatio,
      title: buildShareTitleForActiveCard(),
      description: buildShareCaptionForActiveCard(false)
    };
    const p = (async () => {
      for (const base of API_BASES) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5000);
          const r = await fetch(`${base}/cards/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: ctrl.signal
          });
          clearTimeout(timer);
          if (r.ok) {
            const d = await r.json();
            if (d && d.ok && d.shareUrl && d.imageUrl) {
              const info = { shareUrl: d.shareUrl, imageUrl: d.imageUrl };
              uploadedCardCache.set(dataUrl, info);
              if (activeCardDataUrl === dataUrl) activeCardRemote = info;
              return info;
            }
          }
        } catch (e) {}
      }
      return null;
    })();
    activeCardUploadPromise = p;
    return p;
  }

  async function openPlatformShare(net) {
    if (activeCardRemote) {
      window.open(buildPlatformShareUrl(net, activeCardRemote), '_blank', 'noopener,noreferrer');
      return;
    }
    // Open synchronously to avoid popup blocker while waiting ~200ms for OG card upload
    const pop = window.open('about:blank', '_blank');
    const remote = await (activeCardUploadPromise || preuploadActiveCard());
    const targetUrl = buildPlatformShareUrl(net, remote);
    if (pop) {
      pop.opener = null;
      pop.location.href = targetUrl;
    } else {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  }

  async function copyActiveCardImageToClipboard(silent = false) {
    try {
      const res = await fetch(activeCardDataUrl);
      const blob = await res.blob();
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        if (!silent) showShareToast('✅ Copied');
        return;
      }
    } catch (e) {}
    if (!silent) showShareToast('Use Copy ▾ → Save PNG');
  }

  function refreshActiveCardPreview() {
    if (!activeCardSpec) return;
    if (activeCardSpec.kind === 'meme') {
      activeCardDataUrl = renderMemeCardCanvas(activeCardSpec.data, activeCardRatio);
      activeCardFilename = `TreesPinyin-${activeCardSpec.data.hanzi}-${activeCardRatio}.png`;
    } else if (activeCardSpec.kind === 'trap') {
      activeCardDataUrl = renderToneTrapCardCanvas(activeCardSpec.data, activeCardRatio);
      activeCardFilename = `ToneTrap-${activeCardSpec.data.safe.hz}-${activeCardRatio}.png`;
    } else if (activeCardSpec.kind === 'cert') {
      activeCardDataUrl = renderCertCardCanvas(activeCardSpec.data, activeCardSpec.extra.score, activeCardSpec.extra.userName, activeCardRatio);
      activeCardFilename = `TreesPinyin-Pass-${activeCardRatio}.png`;
    }

    const preview = document.getElementById('tpShareCardPreview');
    const saveLink = document.getElementById('tpSocialSave');
    const sizeBtn = document.getElementById('tpBtnSizeMenu');
    if (preview) preview.src = activeCardDataUrl;
    if (saveLink) {
      saveLink.href = activeCardDataUrl;
      saveLink.setAttribute('download', activeCardFilename);
    }
    if (sizeBtn) {
      sizeBtn.textContent = activeCardRatio === '9-16' ? 'Size: 9:16 ▾' : 'Size: 4:5 ▾';
    }
    document.querySelectorAll('#tpMenuSize [data-ratio]').forEach(btn => {
      const isCur = btn.getAttribute('data-ratio') === activeCardRatio;
      btn.style.background = isCur ? '#e8f5e9' : '';
      btn.style.color = isCur ? '#1b5e20' : '';
    });

    // Silently pre-upload PNG to Cloudflare Worker KV so Share links carry real OG image immediately
    preuploadActiveCard();
  }

  function switchCardRatio(ratio) {
    activeCardRatio = ratio === '9-16' ? '9-16' : '4-5';
    localStorage.setItem('tp_share_card_ratio', activeCardRatio);
    refreshActiveCardPreview();
  }

  function openShareCardStudio(spec) {
    ensureShareCardModal();
    closeShareCardMenus();
    activeCardSpec = spec;
    showShareToast('');
    refreshActiveCardPreview();
    document.getElementById('tpShareCardModal').style.display = 'flex';
  }

  function exportMnemonicMemeCard(item, justPublished = false) {
    openShareCardStudio({ kind: 'meme', data: item, justPublished });
  }

  function exportToneTrapCard(trap) {
    openShareCardStudio({ kind: 'trap', data: trap });
  }

  function exportChallengeCertCard(challenge, scorePct, userName = 'Mandarin Challenger') {
    openShareCardStudio({ kind: 'cert', data: challenge, extra: { score: scorePct, userName } });
  }

  // =========================================================================
  // 2. 點字底部無打擾膠囊橫條（不擋閱讀、不阻斷發音）
  // =========================================================================
  function injectFunStyles() {
    if (document.getElementById('tpFunHubStyles')) return;
    const st = document.createElement('style');
    st.id = 'tpFunHubStyles';
    st.textContent = `
      .tp-char-mnemonic-bar {
        position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
        z-index: 200002; width: min(94vw, 760px);
        background: #ffffff; border: 2px solid #2e7d32; border-radius: 16px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.18);
        padding: 11px 16px; display: none; align-items: center; justify-content: space-between; gap: 12px;
        animation: tpSlideUp 0.18s ease-out;
      }
      body.tp-studio-open .tp-char-mnemonic-bar {
        bottom: 68px; width: min(92vw, 560px);
        box-shadow: 0 12px 34px rgba(0,0,0,0.45);
      }
      @keyframes tpSlideUp { from { opacity: 0; transform: translate(-50%, 14px); } to { opacity: 1; transform: translate(-50%, 0); } }
      .tp-cmb-main { flex: 1; min-width: 0; }
      .tp-cmb-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 3px; }
      .tp-cmb-hz { font-size: 18px; font-weight: 800; color: #1b5e20; }
      .tp-cmb-tp { font-size: 14px; font-style: italic; font-weight: 700; color: #111; }
      .tp-cmb-badge { font-size: 11px; background: #fff8e1; color: #b45309; padding: 2px 7px; border-radius: 99px; font-weight: 700; }
      .tp-cmb-text { font-size: 13px; color: #222; line-height: 1.4; }
      .tp-cmb-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }
      .tp-pill-btn {
        border: 1px solid #cbd5e1; background: #f8fafc; color: #1e293b;
        border-radius: 8px; padding: 5px 10px; font-size: 12px; font-weight: 700; cursor: pointer;
      }
      .tp-pill-btn:hover { background: #e8f5e9; border-color: #2e7d32; color: #1b5e20; }
      .tp-pill-btn.primary { background: #1b5e20; color: #fff; border-color: #1b5e20; }
      .tp-pill-btn.primary:hover { background: #2e7d32; }
      .tp-pill-btn.voted { background: #fff3e0; border-color: #f59e0b; color: #b45309; }

      .tp-fun-subnav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
      .tp-sub-btn {
        padding: 9px 15px; border-radius: 10px; border: 1.5px solid #cbd5e1;
        background: #fff; font-size: 13.5px; font-weight: 800; color: #334155; cursor: pointer;
      }
      .tp-sub-btn.active { background: #1b5e20; color: #fff; border-color: #1b5e20; }

      .tp-duel-banner {
        background: linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%);
        color: #fff; border-radius: 14px; padding: 16px 20px; margin-bottom: 14px;
        display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
      }
      .tp-book-banner {
        background: #fffbeb; border: 1.5px solid #fcd34d; border-radius: 12px;
        padding: 12px 16px; margin-bottom: 14px; display: flex; align-items: center;
        justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 13px; color: #78350f;
      }
      .tp-leaders-strip {
        background: #fff; border: 1px solid #d0d7de; border-radius: 12px; padding: 12px 16px;
        margin-bottom: 14px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px;
      }
      .tp-leader-chip {
        background: #f1f8e9; border: 1px solid #c5e1a5; border-radius: 99px;
        padding: 4px 11px; font-weight: 700; color: #1b5e20; display: inline-flex; align-items: center; gap: 5px;
      }
      .tp-filter-bar {
        display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: space-between;
        margin-bottom: 14px;
      }
      .tp-cat-pills { display: flex; gap: 6px; flex-wrap: wrap; }
      .tp-cat-pill {
        padding: 5px 11px; border-radius: 99px; border: 1px solid #d0d7de;
        background: #fff; font-size: 12px; font-weight: 700; color: #334155; cursor: pointer;
      }
      .tp-cat-pill.active { background: #2e7d32; color: #fff; border-color: #2e7d32; }

      .tp-meme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; }
      .tp-meme-card {
        background: #fff; border: 1px solid #dce0e4; border-radius: 12px; padding: 15px;
        display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);
      }
      .tp-meme-top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
      .tp-meme-hz { font-size: 22px; font-weight: 800; color: #1b5e20; cursor: pointer; }
      .tp-meme-tp { font-size: 16px; font-style: italic; font-weight: 800; color: #111; }
      .tp-meme-hook { background: #fffde7; border-left: 3px solid #f59e0b; padding: 5px 9px; border-radius: 6px; font-size: 12.5px; font-weight: 700; color: #92400e; }
      .tp-meme-desc { font-size: 13px; color: #1e293b; line-height: 1.52; flex: 1; }
      .tp-meme-card u, .tp-char-mnemonic-bar u, .tp-meme-hook u, .tp-book-banner u {
        text-decoration: underline; text-decoration-thickness: 2.5px; text-underline-offset: 3px;
        font-weight: 800; color: #1b5e20;
      }
      .tp-meme-foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding-top: 6px; border-top: 1px dashed #e2e8f0; font-size: 11.5px; color: #64748b; }

      .tp-trap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
      .tp-trap-card { background: #fff; border: 1px solid #dce0e4; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
      .tp-trap-vs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .tp-trap-side { border-radius: 10px; padding: 11px; text-align: center; cursor: pointer; transition: transform 0.12s; }
      .tp-trap-side:hover { transform: translateY(-2px); }
      .tp-trap-safe { background: #ecfdf5; border: 1.5px solid #6ee7b7; }
      .tp-trap-bad { background: #fef2f2; border: 1.5px solid #fca5a5; }

      .tp-challenge-box { background: #fff; border: 1px solid #dce0e4; border-radius: 16px; padding: 22px; display: flex; flex-direction: column; gap: 14px; }
      .tp-challenge-line { background: #f8faf8; border: 1px solid #dcedc8; border-radius: 10px; padding: 12px 16px; text-align: center; }
      .tp-challenge-result { border-radius: 12px; padding: 16px; text-align: center; display: none; }
      .tp-challenge-result.pass { background: #ecfdf5; border: 2px solid #10b981; color: #065f46; display: block; }
      .tp-challenge-result.retry { background: #fff7ed; border: 2px solid #f59e0b; color: #9a3412; display: block; }

      .tp-drop-wrap { position: relative; }
      .tp-bar-ctrl-btn {
        padding: 5px 12px; border-radius: 7px; border: 1px solid #cbd5e1;
        background: #f8fafc; color: #1e293b; font-size: 11.5px; font-weight: 700; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; gap: 3px; white-space: nowrap;
      }
      .tp-bar-ctrl-btn:hover { background: #eef2f7; }
      .tp-bar-ctrl-btn.primary { background: #1b5e20; color: #fff; border-color: #1b5e20; }
      .tp-bar-ctrl-btn.primary:hover { background: #2e7d32; }
      .tp-bar-ctrl-btn.blue { background: #1565c0; color: #fff; border-color: #1565c0; }
      .tp-bar-ctrl-btn.blue:hover { background: #0d47a1; }
      .tp-drop-menu {
        display: none; flex-direction: column; position: absolute; bottom: calc(100% + 6px); left: 0;
        min-width: 205px; max-height: min(380px, 65vh); overflow-y: auto; z-index: 200010;
        background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px;
        box-shadow: 0 12px 28px rgba(0,0,0,0.18); padding: 5px;
      }
      .tp-drop-item {
        box-sizing: border-box; width: 100%; text-align: left; background: transparent; border: none; border-radius: 8px;
        padding: 8px 10px; font-size: 12.5px; font-weight: 700; color: #1e293b;
        cursor: pointer; text-decoration: none; display: block;
      }
      .tp-drop-item:hover { background: #e8f5e9; color: #1b5e20; }

      .tp-fmt-bar {
        display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
        background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 5px 8px;
      }
      .tp-fmt-btn {
        min-width: 34px; height: 28px; padding: 0 9px; border-radius: 6px; border: 1px solid #cbd5e1;
        background: #fff; color: #1e293b; font-size: 13px; cursor: pointer; font-weight: 700;
      }
      .tp-fmt-btn:hover { background: #e8f5e9; border-color: #2e7d32; color: #1b5e20; }
      .tp-live-preview-box {
        background: #fffde7; border: 1px dashed #fbbf24; border-radius: 8px;
        padding: 8px 10px; font-size: 13px; color: #1e293b; line-height: 1.5; text-align: left;
      }
      .tp-live-preview-box u { text-decoration: underline; text-decoration-thickness: 2.5px; text-underline-offset: 3px; font-weight: 800; color: #1b5e20; }
    `;
    document.head.appendChild(st);
  }

  let lastFocusedFormatInput = null;

  function wrapSelectionInInput(el, openTag, closeTag, sampleText = 'sound') {
    if (!el) return;
    el.focus();
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const selected = el.value.slice(start, end) || sampleText;
    const replacement = `${openTag}${selected}${closeTag}`;
    el.value = el.value.slice(0, start) + replacement + el.value.slice(end);
    const newPos = start + replacement.length;
    el.setSelectionRange(newPos, newPos);
    el.dispatchEvent(new Event('input'));
  }

  function updateSubmitLivePreview() {
    const box = document.getElementById('tpSubLivePreview');
    if (!box) return;
    const hookVal = (document.getElementById('tpSubHook')?.value || '').trim();
    const mnVal = (document.getElementById('tpSubMnemonic')?.value || '').trim();
    if (!hookVal && !mnVal) {
      box.innerHTML = '<span style="color:#94a3b8;">Live preview: Highlight text above and click <b>B</b>, <i>I</i>, <u>U</u>, or ( ) to format.</span>';
      return;
    }
    const parts = [];
    if (hookVal) parts.push(`<div><b>Sounds like:</b> ${renderSafeRich(hookVal)}</div>`);
    if (mnVal) parts.push(`<div>${renderSafeRich(mnVal)}</div>`);
    box.innerHTML = parts.join('');
  }

  function ensureBottomBarAndSubmitModal() {
    if (!document.getElementById('tpCharMnemonicBar')) {
      const bar = document.createElement('div');
      bar.id = 'tpCharMnemonicBar';
      bar.className = 'tp-char-mnemonic-bar no-print';
      document.body.appendChild(bar);
    }

    if (!document.getElementById('tpSubmitMemeModal')) {
      const modal = document.createElement('div');
      modal.id = 'tpSubmitMemeModal';
      modal.className = 'modal';
      modal.style.zIndex = '200006';
      modal.innerHTML = `
        <div class="modal-box" style="max-width:480px; gap:10px;">
          <h3 style="margin:0; font-size:17px; color:#1b5e20;">✍️ Write Your Funny Memory Trick</h3>
          <div style="font-size:12px; color:#475569; background:#f8fafc; padding:7px 10px; border-radius:8px;">
            Top 20 highest-voted tricks will be credited by name in the next <b>Trees Pinyin Amazon Paperback</b>!
          </div>
          <div style="display:grid; grid-template-columns:1fr 1.3fr; gap:8px;">
            <input id="tpSubHanzi" class="text-input" placeholder="Chinese word (e.g. 買單)" maxlength="12">
            <input id="tpSubMeaning" class="text-input" placeholder="English meaning (e.g. Check please!)" maxlength="60">
          </div>

          <!-- Trees Pinyin 專屬排版工具列：粗體、斜體、底線、靜音括弧 -->
          <div class="tp-fmt-bar">
            <span style="font-size:11.5px; font-weight:700; color:#475569; margin-right:2px;">Format:</span>
            <button type="button" class="tp-fmt-btn" id="tpFmtBold" title="Bold selected text"><b>B</b></button>
            <button type="button" class="tp-fmt-btn" id="tpFmtItalic" title="Italic selected text"><i>I</i></button>
            <button type="button" class="tp-fmt-btn" id="tpFmtUnder" title="Underline matching Mandarin sound"><u>U</u></button>
            <button type="button" class="tp-fmt-btn" id="tpFmtParen" title="Silent letters in parentheses, e.g. wor(l)d">( )</button>
            <span style="font-size:11px; color:#64748b; margin-left:auto;">Highlight text & click</span>
          </div>

          <input id="tpSubHook" class="text-input" placeholder="Sounds like... (e.g. <u>My</u> <u>done</u>)" maxlength="90">
          <textarea id="tpSubMnemonic" class="text-input" rows="3" placeholder="Your funny memory sentence (e.g. Sounds like <u>My</u> <u>done</u> — Check please, I'm all <u>done</u>!)" maxlength="260" style="font-family:inherit; resize:vertical;"></textarea>
          <div id="tpSubLivePreview" class="tp-live-preview-box"></div>
          <input id="tpSubAuthor" class="text-input" placeholder="Your nickname (e.g. Alex from Austin)" maxlength="32">
          <div id="tpSubStatus" style="font-size:12.5px; font-weight:700; display:none;"></div>
          <button type="button" id="tpBtnConfirmSubmitMeme" class="btn-main btn-green" style="width:100%; padding:10px;">🚀 Publish & Create Share Card</button>
          <div style="font-size:11px; line-height:1.45; color:#64748b; text-align:left; padding:2px 2px 0 2px;">
            By submitting, you warrant that your entry is your own original work and does not infringe any third-party copyrighted books or textbooks, and you grant <b>Trees Pinyin</b> a worldwide, perpetual, irrevocable, royalty-free, sublicensable, non-exclusive license to use, modify, translate, compile, and publicly display it across web, apps, published books, and derivative educational products (with attribution).
            <a href="#" id="tpOpenContribTerms" style="color:#1565c0; font-weight:700; text-decoration:underline; white-space:nowrap;">Full Terms</a>
          </div>
        </div>
      `;
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
      document.body.appendChild(modal);

      if (!document.getElementById('tpContribTermsModal')) {
        const tModal = document.createElement('div');
        tModal.id = 'tpContribTermsModal';
        tModal.className = 'modal';
        tModal.style.zIndex = '200008';
        tModal.innerHTML = `
          <div class="modal-box" style="max-width:500px; gap:12px; text-align:left;">
            <h3 style="margin:0; font-size:16px; color:#1b5e20;">📜 Community Contributor License & Terms</h3>
            <div style="font-size:12.5px; line-height:1.6; color:#334155; max-height:55vh; overflow-y:auto; background:#f8fafc; padding:12px 14px; border-radius:10px; border:1px solid #e2e8f0;">
              <p style="margin:0 0 10px 0;"><b>1. Originality Warranty</b><br>
              You represent and warrant that every mnemonic, phrase, or memory trick you submit is your own original work and has not been copied from any third-party copyrighted textbook, dictionary, website, or book.</p>
              <p style="margin:0 0 10px 0;"><b>2. Perpetual Non-Exclusive License</b><br>
              By clicking "Publish", you grant <b>Trees Pinyin</b> a worldwide, perpetual, irrevocable, royalty-free, transferable, and sublicensable non-exclusive license to use, reproduce, edit, adapt, translate, compile, publish, distribute, and publicly display your submitted content across websites, browser extensions, mobile applications, print and digital books, and derivative educational products.</p>
              <p style="margin:0 0 10px 0;"><b>3. Attribution</b><br>
              You retain ownership of your original submission, and Trees Pinyin will preserve your chosen contributor nickname/credit wherever featured in our community hub or published collections.</p>
              <p style="margin:0;"><b>4. Moderation & Removal</b><br>
              Submissions containing spam, links, profanity, or third-party copyrighted material may be rejected or removed without notice. Full policy: <a href="https://www.treespinyin.com" target="_blank" rel="noopener noreferrer" style="color:#1565c0; font-weight:700;">treespinyin.com</a></p>
            </div>
            <button type="button" id="tpCloseContribTerms" class="btn-main btn-green" style="width:100%; padding:9px;">Got It</button>
          </div>
        `;
        tModal.addEventListener('click', (e) => { if (e.target === tModal) tModal.style.display = 'none'; });
        document.body.appendChild(tModal);
        document.getElementById('tpCloseContribTerms').addEventListener('click', () => { tModal.style.display = 'none'; });
      }

      const hookIn = document.getElementById('tpSubHook');
      const mnIn = document.getElementById('tpSubMnemonic');
      lastFocusedFormatInput = mnIn;

      hookIn.addEventListener('focus', () => { lastFocusedFormatInput = hookIn; });
      mnIn.addEventListener('focus', () => { lastFocusedFormatInput = mnIn; });
      hookIn.addEventListener('input', updateSubmitLivePreview);
      mnIn.addEventListener('input', updateSubmitLivePreview);

      const getFmtTarget = () => lastFocusedFormatInput || mnIn;
      document.getElementById('tpFmtBold').addEventListener('mousedown', (e) => { e.preventDefault(); wrapSelectionInInput(getFmtTarget(), '<b>', '</b>', 'bold'); });
      document.getElementById('tpFmtItalic').addEventListener('mousedown', (e) => { e.preventDefault(); wrapSelectionInInput(getFmtTarget(), '<i>', '</i>', 'italic'); });
      document.getElementById('tpFmtUnder').addEventListener('mousedown', (e) => { e.preventDefault(); wrapSelectionInInput(getFmtTarget(), '<u>', '</u>', 'sound'); });
      document.getElementById('tpFmtParen').addEventListener('mousedown', (e) => { e.preventDefault(); wrapSelectionInInput(getFmtTarget(), '(', ')', 'silent'); });

      document.getElementById('tpOpenContribTerms').addEventListener('click', (e) => {
        e.preventDefault();
        const tm = document.getElementById('tpContribTermsModal');
        if (tm) tm.style.display = 'flex';
      });
      document.getElementById('tpBtnConfirmSubmitMeme').addEventListener('click', handleSubmitMemeForm);
    }
  }

  function findAllMnemonicsForChar(charHz, fullSentenceZh = '') {
    const all = getAllMnemonics().sort((a, b) => (b.likes || 0) - (a.likes || 0) || (b.createdAt || 0) - (a.createdAt || 0));
    const simpChar = normHanziKey(charHz);
    const simpSent = normHanziKey(fullSentenceZh);

    // 1. 優先收集包含該字且出現在目前整句裡的所有多字詞（按讚數降序）
    if (simpSent) {
      const phraseHits = all.filter(item => {
        const sHz = normHanziKey(item.hanzi);
        return sHz.length >= 2 && sHz.includes(simpChar) && simpSent.includes(sHz);
      });
      if (phraseHits.length > 0) return phraseHits;
    }

    // 2. 精確單字所有競品記法（按讚數降序）
    const exactHits = all.filter(item => normHanziKey(item.hanzi) === simpChar);
    if (exactHits.length > 0) return exactHits;

    // 3. 包含該字的詞條
    return all.filter(item => normHanziKey(item.hanzi).includes(simpChar)).slice(0, 10);
  }

  let activeCharBarSnapshot = null;

  function renderCharBarAtIndex(charHz, treesStr, stdPyStr, fullSentenceZh, prefillMeaning = '') {
    const bar = document.getElementById('tpCharMnemonicBar');
    if (!bar) return;

    const total = activeCharBarList.length;
    const match = total > 0 ? activeCharBarList[Math.max(0, Math.min(total - 1, activeCharBarIdx))] : null;

    if (match) {
      activeCharBarSnapshot = {
        hanzi: match.hanzi || charHz,
        trees: match.trees || treesStr || '',
        author: match.author || 'Author Pick',
        meaning: match.meaning || '',
        mnemonic: match.mnemonic || '',
        likes: match.likes || 1,
        isNew: false,
        rankText: total > 1 ? `#${activeCharBarIdx + 1}/${total}` : ''
      };
      const voted = hasVoted(match.id);
      const rankBadge = total > 1
        ? `<span class="tp-cmb-badge" style="background:#e8f5e9; color:#1b5e20;">🏆 #${activeCharBarIdx + 1} / ${total}</span>`
        : '';
      const navBtns = total > 1
        ? `<button type="button" class="tp-pill-btn" id="tpBarPrevBtn" title="Previous trick">◀</button><button type="button" class="tp-pill-btn" id="tpBarNextBtn" title="Next competing trick">▶</button>`
        : '';
      bar.innerHTML = `
        <div class="tp-cmb-main">
          <div class="tp-cmb-head">
            <span class="tp-cmb-hz">${esc(match.hanzi)}</span>
            <span class="tp-cmb-tp">${esc(match.trees)}</span>
            ${rankBadge}
            <span class="tp-cmb-badge">💡 ${esc(match.author || 'Author Pick')}</span>
          </div>
          <div class="tp-cmb-text"><b>"${esc(match.meaning)}"</b> — ${renderSafeRich(match.mnemonic)}</div>
        </div>
        <div class="tp-cmb-actions">
          ${navBtns}
          <button type="button" class="tp-pill-btn ${voted ? 'voted' : ''}" id="tpBarLikeBtn">👍 ${match.likes || 1}</button>
          <button type="button" class="tp-pill-btn" id="tpBarCardBtn">🎨 Share Card</button>
          <button type="button" class="tp-pill-btn primary" id="tpBarAddBtn">+ Write Trick</button>
          <button type="button" class="tp-pill-btn" id="tpBarCloseBtn" title="Close">✕</button>
        </div>
      `;
      if (total > 1) {
        bar.querySelector('#tpBarPrevBtn').addEventListener('click', () => {
          activeCharBarIdx = (activeCharBarIdx - 1 + total) % total;
          renderCharBarAtIndex(charHz, treesStr, stdPyStr, fullSentenceZh);
        });
        bar.querySelector('#tpBarNextBtn').addEventListener('click', () => {
          activeCharBarIdx = (activeCharBarIdx + 1) % total;
          renderCharBarAtIndex(charHz, treesStr, stdPyStr, fullSentenceZh);
        });
      }
      bar.querySelector('#tpBarLikeBtn').addEventListener('click', async () => {
        if (await voteMnemonic(match.id)) {
          match.likes = (match.likes || 1) + 1;
          activeCharBarList.sort((a, b) => (b.likes || 0) - (a.likes || 0));
          renderCharBarAtIndex(charHz, treesStr, stdPyStr, fullSentenceZh);
        }
      });
      bar.querySelector('#tpBarCardBtn').addEventListener('click', () => exportMnemonicMemeCard(match));
      bar.querySelector('#tpBarAddBtn').addEventListener('click', () => openSubmitMemeModal(match.hanzi, match.meaning));
    } else {
      activeCharBarSnapshot = {
        hanzi: charHz || '',
        trees: treesStr || '',
        author: 'New Word',
        meaning: prefillMeaning || '',
        mnemonic: `No community trick for <b>${charHz}</b> yet — invent a funny English sound association!`,
        likes: 0,
        isNew: true,
        rankText: ''
      };
      bar.innerHTML = `
        <div class="tp-cmb-main">
          <div class="tp-cmb-head">
            <span class="tp-cmb-hz">${esc(charHz)}</span>
            <span class="tp-cmb-tp">${esc(treesStr || '')}</span>
            <span class="tp-cmb-badge">🌱 New Word</span>
          </div>
          <div class="tp-cmb-text">No community trick for <b>${esc(charHz)}</b> yet — invent a funny English sound association and get featured!</div>
        </div>
        <div class="tp-cmb-actions">
          <button type="button" class="tp-pill-btn primary" id="tpBarAddBtn">+ Write Your Trick</button>
          <button type="button" class="tp-pill-btn" id="tpBarCloseBtn" title="Close">✕</button>
        </div>
      `;
      bar.querySelector('#tpBarAddBtn').addEventListener('click', () => openSubmitMemeModal(charHz, prefillMeaning || ''));
    }

    bar.querySelector('#tpBarCloseBtn').addEventListener('click', () => {
      bar.style.display = 'none';
    });
    bar.style.display = 'flex';
  }

  function showCharBar(charHz, treesStr, stdPyStr, fullSentenceZh = '', prefillMeaning = '') {
    if (!charHz || !/[\u4e00-\u9fa5]/.test(charHz)) return;
    ensureBottomBarAndSubmitModal();
    syncCommunityFromCloud();
    const finalTrees = treesStr || compileHanziToTrees(charHz);
    activeCharBarList = findAllMnemonicsForChar(charHz, fullSentenceZh);
    activeCharBarIdx = 0;
    renderCharBarAtIndex(charHz, finalTrees, stdPyStr, fullSentenceZh, prefillMeaning);
  }

  function openSubmitMemeModal(prefillHanzi = '', prefillMeaning = '') {
    ensureBottomBarAndSubmitModal();
    const modal = document.getElementById('tpSubmitMemeModal');
    document.getElementById('tpSubHanzi').value = prefillHanzi || '';
    document.getElementById('tpSubMeaning').value = prefillMeaning || '';
    document.getElementById('tpSubHook').value = '';
    document.getElementById('tpSubMnemonic').value = '';
    document.getElementById('tpSubAuthor').value = localStorage.getItem('tp_user_nickname') || '';
    lastFocusedFormatInput = document.getElementById('tpSubMnemonic');
    updateSubmitLivePreview();
    const st = document.getElementById('tpSubStatus');
    st.style.display = 'none';
    modal.style.display = 'flex';
  }

  function compileHanziToTrees(zh) {
    if (!zh || typeof TreesSegmenter === 'undefined' || typeof TreesCompiler === 'undefined') return '';
    const parts = [];
    const dummy = document.createDocumentFragment();
    const clean = zh.replace(/[^\u4e00-\u9fa5]/g, '');
    if (!clean) return '';
    TreesSegmenter.processChinese(clean, dummy, clean, 0, (ch, py) => {
      parts.push(TreesCompiler.compile(py));
    });
    return parts.join(' ');
  }

  async function handleSubmitMemeForm() {
    const hanzi = (document.getElementById('tpSubHanzi').value || '').trim();
    const meaning = (document.getElementById('tpSubMeaning').value || '').trim();
    const hook = (document.getElementById('tpSubHook').value || '').trim();
    const mnemonic = (document.getElementById('tpSubMnemonic').value || '').trim();
    const author = (document.getElementById('tpSubAuthor').value || '').trim() || 'Anonymous Learner';
    const st = document.getElementById('tpSubStatus');

    if (!hanzi || !/[\u4e00-\u9fa5]/.test(hanzi) || !mnemonic || mnemonic.length < 4) {
      st.style.display = 'block';
      st.style.color = '#b91c1c';
      st.textContent = '⚠️ Please enter a Chinese word and a short funny memory sentence.';
      return;
    }

    localStorage.setItem('tp_user_nickname', author);
    st.style.display = 'block';
    st.style.color = '#1e40af';
    st.textContent = '✨ Publishing your memory trick...';

    const trees = compileHanziToTrees(hanzi);
    const pyStr = (typeof pinyinPro !== 'undefined' && pinyinPro.pinyin)
      ? pinyinPro.pinyin(hanzi)
      : '';

    const newItem = {
      id: `u_${Date.now().toString(36)}`,
      hanzi,
      trees: trees || hanzi,
      pinyin: pyStr,
      meaning: meaning || 'Mandarin Phrase',
      hook,
      mnemonic,
      category: 'Community',
      author,
      likes: 1,
      createdAt: Date.now()
    };

    // 嘗試提交至雲端 D1（內建 AI 自動審核），若雲端未啟用 D1 則無縫保存於本地即時顯示
    let cloudBlockedMsg = '';
    for (const base of API_BASES) {
      try {
        const r = await fetch(`${base}/mnemonics/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItem)
        });
        const d = await r.json().catch(() => ({}));
        if (r.status === 400 && d.error === 'MODERATION_REJECTED') {
          cloudBlockedMsg = d.message || 'Please keep memory tricks friendly and clean!';
          break;
        }
        if (r.ok && d.item) {
          newItem.id = d.item.id || newItem.id;
          break;
        }
      } catch (e) {}
    }

    if (cloudBlockedMsg) {
      st.style.color = '#b91c1c';
      st.textContent = `🌱 ${cloudBlockedMsg}`;
      return;
    }

    const localList = getLocalJson(LOCAL_USER_MEMES_KEY, []);
    localList.unshift(newItem);
    setLocalJson(LOCAL_USER_MEMES_KEY, localList.slice(0, 60));

    st.style.color = '#15803d';
    st.textContent = '✅ Published! Generating your shareable card...';
    syncCommunityFromCloud(true);
    setTimeout(() => {
      document.getElementById('tpSubmitMemeModal').style.display = 'none';
      renderActiveSubTab();
      // 投稿成功後立即彈出用戶專屬記憶圖卡，支援 4:5 / 9:16 切換與一鍵轉發多媒體！
      exportMnemonicMemeCard(newItem, true);
    }, 450);
  }

  // =========================================================================
  // 3. 主分頁「🔥 Fun & Memes」渲染（三大子頁：神梗榜 / 聲調鬧笑話 / 30 秒通關）
  // =========================================================================
  function renderFunHubRoot() {
    const host = document.getElementById('panel-funhub');
    if (!host) return;
    ensureBottomBarAndSubmitModal();
    syncCommunityFromCloud();

    host.innerHTML = `
      <div class="tp-fun-subnav">
        <button type="button" class="tp-sub-btn ${activeSubTab === 'memes' ? 'active' : ''}" data-sub="memes">🏆 Meme Wall & Daily Duel (100+)</button>
        <button type="button" class="tp-sub-btn ${activeSubTab === 'traps' ? 'active' : ''}" data-sub="traps">😂 Tone Traps (18 Hilarious Fails)</button>
        <button type="button" class="tp-sub-btn ${activeSubTab === 'challenge' ? 'active' : ''}" data-sub="challenge">🎤 30s Li Bai & Ordering Challenge</button>
      </div>
      <div id="tpFunSubContent"></div>
    `;

    host.querySelectorAll('.tp-sub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeSubTab = btn.getAttribute('data-sub');
        host.querySelectorAll('.tp-sub-btn').forEach(b => b.classList.toggle('active', b === btn));
        renderActiveSubTab();
      });
    });

    renderActiveSubTab();
  }

  function renderActiveSubTab() {
    const content = document.getElementById('tpFunSubContent');
    if (!content) return;
    if (activeSubTab === 'memes') renderMemeWall(content);
    else if (activeSubTab === 'traps') renderToneTraps(content);
    else if (activeSubTab === 'challenge') render30sChallenge(content);
  }

  function renderMemeWall(container) {
    const Data = global.TreesFunData;
    const duel = Data.getTodayDuelWord();
    const all = getAllMnemonics();

    // 計算造林者排行榜 (Seedling → Sapling → Forest Builder)
    const authorStats = new Map();
    for (const item of all) {
      const name = item.author || 'Author Pick';
      authorStats.set(name, (authorStats.get(name) || 0) + (item.likes || 0));
    }
    const topBuilders = Array.from(authorStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const categories = ['All', 'Food', 'Everyday', 'Travel', 'People', 'Culture', 'Numbers', 'Community'];
    let filtered = all.filter(item => {
      if (activeCategory !== 'All' && item.category !== activeCategory) return false;
      if (searchKeyword) {
        const kw = searchKeyword.toLowerCase();
        return (
          (item.hanzi || '').includes(searchKeyword) ||
          (item.meaning || '').toLowerCase().includes(kw) ||
          (item.hook || '').toLowerCase().includes(kw) ||
          (item.mnemonic || '').toLowerCase().includes(kw) ||
          (item.trees || '').toLowerCase().includes(kw)
        );
      }
      return true;
    });

    if (activeSort === 'new') {
      filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else {
      filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }

    container.innerHTML = `
      <div class="tp-duel-banner">
        <div>
          <div style="font-size:12px; font-weight:800; color:#fde68a; letter-spacing:0.5px;">🔥 DAILY WORD DUEL — CAN YOU BEAT THE AUTHOR?</div>
          <div style="font-size:22px; font-weight:800; margin-top:4px;">
            ${esc(duel.hanzi)} &nbsp;<span style="font-style:italic; color:#bbf7d0;">${esc(duel.trees)}</span>
            <span style="font-size:15px; font-weight:600; opacity:0.9;">(${esc(duel.meaning)})</span>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button type="button" class="tp-pill-btn" id="tpDuelSpeakBtn" style="background:rgba(255,255,255,0.16); color:#fff; border-color:rgba(255,255,255,0.4);">🔊 Listen</button>
          <button type="button" class="tp-pill-btn" id="tpDuelSubmitBtn" style="background:#fbbf24; color:#111; border-color:#fbbf24;">✍️ Enter Today's Duel</button>
        </div>
      </div>

      <div class="tp-book-banner">
        <span>
          📚 <b>Amazon Book Top 20:</b> Top 20 community tricks get credited by name in our next paperback!
          &nbsp;|&nbsp; 📖 <b>Reading Rule:</b> Blend <u>underlined</u> sounds; skip letters inside (parentheses) like <u>wor</u>(l)<u>d</u>.
        </span>
        <a href="${Data.AMAZON_BOOK_URL}" target="_blank" class="btn-gold" style="text-decoration:none; white-space:nowrap;">📚 Full Book (300+) on Amazon ↗</a>
      </div>

      <div class="tp-leaders-strip">
        <strong style="color:#1b5e20;">🌲 Forest Builders:</strong>
        ${topBuilders.map(([name, pts]) => {
          const b = Data.getForestBadge(pts);
          return `<span class="tp-leader-chip">${b.icon} ${esc(name)} · ${b.label} (${pts} 👍)</span>`;
        }).join('')}
      </div>

      <div class="tp-filter-bar">
        <div class="tp-cat-pills">
          ${categories.map(cat => `<button type="button" class="tp-cat-pill ${activeCategory === cat ? 'active' : ''}" data-cat="${cat}">${cat}</button>`).join('')}
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="text" id="tpMemeSearch" class="text-input" placeholder="Search word or English..." value="${esc(searchKeyword)}" style="width:185px;">
          <select id="tpMemeSort" class="select-box">
            <option value="top" ${activeSort === 'top' ? 'selected' : ''}>🔥 Top Liked</option>
            <option value="new" ${activeSort === 'new' ? 'selected' : ''}>🆕 Newest</option>
          </select>
          <button type="button" class="tp-pill-btn primary" id="tpBtnNewMeme">+ Write Trick</button>
        </div>
      </div>

      <div class="tp-meme-grid" id="tpMemeCardsGrid"></div>
    `;

    container.querySelector('#tpDuelSpeakBtn').addEventListener('click', () => speakZh(duel.hanzi));
    container.querySelector('#tpDuelSubmitBtn').addEventListener('click', () => openSubmitMemeModal(duel.hanzi, duel.meaning));
    container.querySelector('#tpBtnNewMeme').addEventListener('click', () => openSubmitMemeModal());
    container.querySelector('#tpMemeSort').addEventListener('change', (e) => { activeSort = e.target.value; renderMemeWall(container); });
    const searchEl = container.querySelector('#tpMemeSearch');
    searchEl.addEventListener('input', (e) => {
      searchKeyword = e.target.value;
      renderMemeCardsList(container.querySelector('#tpMemeCardsGrid'), getFilteredMemes());
    });
    container.querySelectorAll('.tp-cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.getAttribute('data-cat');
        renderMemeWall(container);
      });
    });

    function getFilteredMemes() {
      const list = getAllMnemonics().filter(item => {
        if (activeCategory !== 'All' && item.category !== activeCategory) return false;
        if (searchKeyword) {
          const kw = searchKeyword.toLowerCase();
          return (
            (item.hanzi || '').includes(searchKeyword) ||
            (item.meaning || '').toLowerCase().includes(kw) ||
            (item.hook || '').toLowerCase().includes(kw) ||
            (item.mnemonic || '').toLowerCase().includes(kw) ||
            (item.trees || '').toLowerCase().includes(kw)
          );
        }
        return true;
      });
      if (activeSort === 'new') list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      else list.sort((a, b) => (b.likes || 0) - (a.likes || 0));
      return list;
    }

    renderMemeCardsList(container.querySelector('#tpMemeCardsGrid'), filtered);
  }

  function renderMemeCardsList(grid, items) {
    if (!grid) return;
    if (items.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:32px; color:#64748b;">No matching tricks yet — click <b>+ Write Trick</b> to be the first!</div>`;
      return;
    }
    const wordRankMap = getSameWordRankingMap(getAllMnemonics());
    grid.innerHTML = '';
    items.forEach((item, idx) => {
      const voted = hasVoted(item.id);
      const isTop20 = activeSort === 'top' && activeCategory === 'All' && !searchKeyword && idx < 20;
      const wRank = wordRankMap.get(item.id);
      const medal = wRank && wRank.total > 1
        ? (wRank.rank === 1 ? '🥇' : (wRank.rank === 2 ? '🥈' : (wRank.rank === 3 ? '🥉' : '⚔️')))
        : '';
      const wordRankHtml = (wRank && wRank.total > 1)
        ? `<button type="button" data-compare-hz="${esc(item.hanzi)}" style="font-size:10.5px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 6px; border-radius:6px; font-weight:800; margin-left:4px; cursor:pointer;" title="Click to compare all competing tricks for this word">${medal} #${wRank.rank}/${wRank.total}</button>`
        : '';

      const card = document.createElement('div');
      card.className = 'tp-meme-card';
      const isCommunityEntry = item.category === 'Community' || String(item.id || '').startsWith('c_');
      const reportedMap = getLocalJson(LOCAL_REPORTED_KEY, {});
      if (isCommunityEntry && reportedMap[item.id]) return;
      card.innerHTML = `
        <div class="tp-meme-top">
          <div>
            <span class="tp-meme-hz" title="Click to speak">🔊 ${esc(item.hanzi)}</span>
            ${isTop20 ? '<span style="font-size:10.5px; background:#fef3c7; color:#b45309; padding:2px 6px; border-radius:6px; font-weight:800; margin-left:4px;">📚 Book Top 20</span>' : ''}
            ${wordRankHtml}
          </div>
          <span class="tp-meme-tp">${esc(item.trees)}</span>
        </div>
        <div style="font-size:13.5px; font-weight:700; color:#111;">${esc(item.meaning)} <span style="font-weight:500; color:#64748b; font-size:12px;">${item.pinyin ? `(${esc(item.pinyin)})` : ''}</span></div>
        ${item.hook ? `<div class="tp-meme-hook">🔊 Sounds like: ${renderSafeRich(item.hook)}</div>` : ''}
        <div class="tp-meme-desc">${renderSafeRich(item.mnemonic)}</div>
        <div class="tp-meme-foot">
          <span>✍️ ${esc(item.author || 'Author Pick')}</span>
          <div style="display:flex; gap:5px;">
            <button type="button" class="tp-pill-btn ${voted ? 'voted' : ''}" data-act="vote">👍 ${item.likes || 1}</button>
            <button type="button" class="tp-pill-btn" data-act="challenge" title="Write a funnier trick for this word">⚔️</button>
            <button type="button" class="tp-pill-btn" data-act="card" title="Share 4:5 Post / 9:16 Story Card">🎨 Share</button>
            ${isCommunityEntry ? '<button type="button" class="tp-pill-btn" data-act="report" title="Report spam or inappropriate content">🚩</button>' : ''}
          </div>
        </div>
      `;
      card.querySelector('.tp-meme-hz').addEventListener('click', () => speakZh(item.hanzi));
      const cmpBtn = card.querySelector('[data-compare-hz]');
      if (cmpBtn) {
        cmpBtn.addEventListener('click', () => {
          searchKeyword = cmpBtn.getAttribute('data-compare-hz') || '';
          activeCategory = 'All';
          activeSort = 'top';
          renderActiveSubTab();
        });
      }
      card.querySelector('[data-act="vote"]').addEventListener('click', async (e) => {
        if (await voteMnemonic(item.id)) {
          item.likes = (item.likes || 1) + 1;
          e.currentTarget.textContent = `👍 ${item.likes}`;
          e.currentTarget.classList.add('voted');
        }
      });
      card.querySelector('[data-act="challenge"]').addEventListener('click', () => openSubmitMemeModal(item.hanzi, item.meaning));
      card.querySelector('[data-act="card"]').addEventListener('click', () => exportMnemonicMemeCard(item));
      const repBtn = card.querySelector('[data-act="report"]');
      if (repBtn) {
        repBtn.addEventListener('click', async () => {
          if (!window.confirm('Report this community entry as spam or inappropriate?')) return;
          await reportMnemonic(item.id);
          card.remove();
        });
      }
      grid.appendChild(card);
    });
  }

  // =========================================================================
  // 4. 😂 Tone Traps（聲調鬧笑話防踩雷小劇場）
  // =========================================================================
  function renderToneTraps(container) {
    const traps = (global.TreesFunData && global.TreesFunData.TONE_TRAPS) || [];
    container.innerHTML = `
      <div style="background:#fff; border:1px solid #c8e6c9; border-left:5px solid #2e7d32; border-radius:12px; padding:14px 18px; margin-bottom:14px; font-size:13.5px; color:#222;">
        😂 <b>Mandarin Tone Traps:</b> Tap either side of any card to hear how ONE tiny tone slip turns a polite phrase into a comedy disaster — laugh once, never mix them up again!
      </div>
      <div class="tp-trap-grid" id="tpTrapsGrid"></div>
    `;

    const grid = container.querySelector('#tpTrapsGrid');
    traps.forEach(trap => {
      const card = document.createElement('div');
      card.className = 'tp-trap-card';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <strong style="font-size:14.5px; color:#111;">${esc(trap.title)}</strong>
          <button type="button" class="tp-pill-btn" data-act="trapcard">🎨 Meme Card</button>
        </div>
        <div class="tp-trap-vs">
          <div class="tp-trap-side tp-trap-safe" data-speak="${esc(trap.safe.hz)}">
            <div style="font-size:11px; font-weight:800; color:#047857;">😇 WHAT YOU MEANT</div>
            <div style="font-size:26px; font-weight:800; color:#065f46; margin:4px 0;">🔊 ${esc(trap.safe.hz)}</div>
            <div style="font-size:14.5px; font-style:italic; font-weight:800; color:#111;">${esc(trap.safe.trees)}</div>
            <div style="font-size:12px; color:#047857; margin-top:3px; font-weight:600;">${esc(trap.safe.en)}</div>
          </div>
          <div class="tp-trap-side tp-trap-bad" data-speak="${esc(trap.trap.hz)}">
            <div style="font-size:11px; font-weight:800; color:#b91c1c;">😱 WHAT YOU SAID</div>
            <div style="font-size:26px; font-weight:800; color:#991b1b; margin:4px 0;">🔊 ${esc(trap.trap.hz)}</div>
            <div style="font-size:14.5px; font-style:italic; font-weight:800; color:#111;">${esc(trap.trap.trees)}</div>
            <div style="font-size:12px; color:#b91c1c; margin-top:3px; font-weight:600;">${esc(trap.trap.en)}</div>
          </div>
        </div>
        <div style="font-size:12.5px; color:#475569; line-height:1.45; background:#f8fafc; padding:8px 10px; border-radius:8px;">${esc(trap.joke)}</div>
      `;
      card.querySelectorAll('[data-speak]').forEach(el => {
        el.addEventListener('click', () => speakZh(el.getAttribute('data-speak')));
      });
      card.querySelector('[data-act="trapcard"]').addEventListener('click', () => exportToneTrapCard(trap));
      grid.appendChild(card);
    });
  }

  // =========================================================================
  // 5. 🎤 30 秒「李白 / 點餐」即時語音通關卡（零成本 Web Speech API 音節評分）
  // =========================================================================
  function getPinyinSyllablesNoTone(zhStr) {
    const clean = String(zhStr || '').replace(/[^\u4e00-\u9fa5]/g, '');
    if (!clean) return [];
    const simp = global.TreesTextUtils ? global.TreesTextUtils.toSimplified(clean) : clean;
    if (typeof pinyinPro !== 'undefined' && pinyinPro.pinyin) {
      return pinyinPro.pinyin(simp, { toneType: 'none', type: 'array' }).map(s => String(s).toLowerCase());
    }
    return simp.split('');
  }

  function computeSyllableMatchScore(targetZh, spokenZh) {
    const targetSyl = getPinyinSyllablesNoTone(targetZh);
    const spokenSyl = getPinyinSyllablesNoTone(spokenZh);
    if (targetSyl.length === 0 || spokenSyl.length === 0) return 0;

    // 計算同音音節覆蓋率（允許聲母/韻母極近音容錯，聚焦「母語者聽得懂」）
    const pool = spokenSyl.slice();
    let matched = 0;
    for (const t of targetSyl) {
      const idx = pool.findIndex(s => s === t || (t.length >= 2 && s.length >= 2 && s.slice(0, 2) === t.slice(0, 2)));
      if (idx !== -1) {
        matched++;
        pool.splice(idx, 1);
      }
    }
    return Math.min(100, Math.round((matched / targetSyl.length) * 100));
  }

  function stopChallengeRecording() {
    if (challengeTimer) { clearInterval(challengeTimer); challengeTimer = null; }
    if (challengeRec) {
      try { challengeRec.stop(); } catch (e) {}
      challengeRec = null;
    }
  }

  function render30sChallenge(container) {
    stopChallengeRecording();
    const list = (global.TreesFunData && global.TreesFunData.CHALLENGES_30S) || [];
    const current = list.find(c => c.id === activeChallengeId) || list[0];
    if (!current) return;

    const fullZh = current.lines.map(l => l.zh).join('');

    container.innerHTML = `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
        ${list.map(ch => `
          <button type="button" class="tp-cat-pill ${ch.id === current.id ? 'active' : ''}" data-chid="${ch.id}" style="padding:7px 13px; font-size:12.5px;">
            ${esc(ch.badge)}
          </button>
        `).join('')}
      </div>

      <div class="tp-challenge-box">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div>
            <h3 style="margin:0; font-size:19px; color:#1b5e20;">${esc(current.title)}</h3>
            <div style="font-size:13px; color:#475569; margin-top:4px;">${esc(current.subtitle)}</div>
          </div>
          <span id="tpChTimer" style="font-family:monospace; font-size:18px; font-weight:800; background:#f1f8e9; color:#1b5e20; padding:6px 14px; border-radius:10px; border:1px solid #c5e1a5;">⏱️ 30s</span>
        </div>

        <div id="tpChLines" style="display:flex; flex-direction:column; gap:10px;">
          ${current.lines.map(l => `
            <div class="tp-challenge-line">
              <div style="font-size:14.5px; font-weight:700; color:#334155; margin-bottom:4px;">${esc(l.en)}</div>
              <div style="font-size:18px; font-style:italic; font-weight:800; color:#111;">${esc(compileHanziToTrees(l.zh))}</div>
              <div style="font-size:21px; font-weight:700; color:#1b5e20; margin-top:2px;">${esc(l.zh)}</div>
            </div>
          `).join('')}
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" id="tpChDemoBtn" class="btn-main btn-soft" style="flex:0.6;">🔊 Listen Demo</button>
          <button type="button" id="tpChStartBtn" class="btn-main btn-green">🎙️ Start 30s Voice Challenge</button>
          <button type="button" id="tpChVideoBtn" class="btn-main btn-blue" style="flex:0.8;">🎬 Record 9:16 TikTok Video</button>
        </div>

        <div id="tpChLiveTranscript" style="font-size:13.5px; color:#475569; text-align:center; min-height:22px;"></div>
        <div id="tpChResultBox" class="tp-challenge-result"></div>
      </div>
    `;

    container.querySelectorAll('[data-chid]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeChallengeId = btn.getAttribute('data-chid');
        render30sChallenge(container);
      });
    });

    container.querySelector('#tpChDemoBtn').addEventListener('click', () => speakZh(fullZh));

    // 一鍵導入主工作台並啟動內建 9:16 分屏錄影工坊
    container.querySelector('#tpChVideoBtn').addEventListener('click', () => {
      if (global.__tpStudioBridge && typeof global.__tpStudioBridge.loadChallengeIntoVideoStudio === 'function') {
        global.__tpStudioBridge.loadChallengeIntoVideoStudio(current.lines);
      }
    });

    const startBtn = container.querySelector('#tpChStartBtn');
    const timerEl = container.querySelector('#tpChTimer');
    const liveEl = container.querySelector('#tpChLiveTranscript');
    const resultEl = container.querySelector('#tpChResultBox');

    startBtn.addEventListener('click', () => {
      if (challengeRec) {
        stopChallengeRecording();
        startBtn.textContent = '🎙️ Start 30s Voice Challenge';
        return;
      }

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        resultEl.className = 'tp-challenge-result retry';
        resultEl.innerHTML = '⚠️ Voice recognition requires Chrome or Edge desktop browser.';
        return;
      }

      resultEl.className = 'tp-challenge-result';
      resultEl.innerHTML = '';
      liveEl.textContent = '🎙️ Listening... Read the Trees Pinyin lines aloud now!';
      startBtn.textContent = '⏹️ Finish & Grade Now';

      challengeSecondsLeft = 30;
      timerEl.textContent = '⏱️ 30s';

      let transcriptAll = '';
      const rec = new SR();
      rec.lang = 'zh-CN';
      rec.continuous = true;
      rec.interimResults = true;
      challengeRec = rec;

      const finishAndScore = () => {
        stopChallengeRecording();
        startBtn.textContent = '🎙️ Try Again';
        const score = computeSyllableMatchScore(fullZh, transcriptAll);
        lastPassedScore = score;
        if (score >= 65) {
          resultEl.className = 'tp-challenge-result pass';
          resultEl.innerHTML = `
            <div style="font-size:20px; font-weight:800;">🎉 PASSED! ${score}% Match — Native Speakers Understood You!</div>
            <div style="font-size:13.5px; margin:6px 0 12px 0;">You unlocked <b>${esc(current.badge)}</b>! Save your certificate or record a 9:16 TikTok flex video!</div>
            <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
              <button type="button" id="tpBtnDownloadCert" class="tp-pill-btn primary" style="padding:8px 16px; font-size:13px;">🏆 Download Pass Card (PNG)</button>
              <button type="button" id="tpBtnFlexVideo" class="tp-pill-btn" style="padding:8px 16px; font-size:13px; background:#1565c0; color:#fff; border-color:#1565c0;">🎬 Record 9:16 TikTok Video</button>
            </div>
          `;
          resultEl.querySelector('#tpBtnDownloadCert').addEventListener('click', () => {
            const nick = localStorage.getItem('tp_user_nickname') || 'Mandarin Challenger';
            exportChallengeCertCard(current, score, nick);
          });
          resultEl.querySelector('#tpBtnFlexVideo').addEventListener('click', () => {
            if (global.__tpStudioBridge && typeof global.__tpStudioBridge.loadChallengeIntoVideoStudio === 'function') {
              global.__tpStudioBridge.loadChallengeIntoVideoStudio(current.lines);
            }
          });
        } else {
          resultEl.className = 'tp-challenge-result retry';
          resultEl.innerHTML = `
            <div style="font-size:16px; font-weight:800;">Almost there! (${score}% match — hit 65%+ to pass!)</div>
            <div style="font-size:13px; margin-top:4px;">Heard: "${esc(transcriptAll || 'No speech detected')}" — Tap <b>🔊 Listen Demo</b> once and try reading slowly with Trees Pinyin!</div>
          `;
        }
      };

      rec.onresult = (ev) => {
        let combined = '';
        for (let i = 0; i < ev.results.length; i++) {
          combined += ev.results[i][0].transcript;
        }
        transcriptAll = combined.trim();
        const liveScore = computeSyllableMatchScore(fullZh, transcriptAll);
        liveEl.textContent = `🗣️ Heard: "${transcriptAll}" (${liveScore}% match)`;
        if (liveScore >= 85) {
          finishAndScore();
        }
      };

      rec.onerror = () => finishAndScore();
      rec.onend = () => {
        if (challengeRec === rec) finishAndScore();
      };

      challengeTimer = setInterval(() => {
        challengeSecondsLeft--;
        timerEl.textContent = `⏱️ ${Math.max(0, challengeSecondsLeft)}s`;
        if (challengeSecondsLeft <= 0) finishAndScore();
      }, 1000);

      try { rec.start(); } catch (e) { finishAndScore(); }
    });
  }

  let escKeyBound = false;

  function initFunHub() {
    injectFunStyles();
    ensureBottomBarAndSubmitModal();
    if (!escKeyBound) {
      escKeyBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closeShareCardMenus();
        const shareModal = document.getElementById('tpShareCardModal');
        const submitModal = document.getElementById('tpSubmitMemeModal');
        const termsModal = document.getElementById('tpContribTermsModal');
        if (termsModal && termsModal.style.display === 'flex') { termsModal.style.display = 'none'; return; }
        if (shareModal && shareModal.style.display === 'flex') shareModal.style.display = 'none';
        if (submitModal && submitModal.style.display === 'flex') submitModal.style.display = 'none';
      });
    }
  }

  async function openShareCardById(id = '', hanzi = '') {
    let all = getAllMnemonics();
    let match = (id && all.find(it => it.id === id)) || (hanzi && all.find(it => normHanziKey(it.hanzi) === normHanziKey(hanzi)));
    if (!match) {
      await syncCommunityFromCloud(true);
      all = getAllMnemonics();
      match = (id && all.find(it => it.id === id)) || (hanzi && all.find(it => normHanziKey(it.hanzi) === normHanziKey(hanzi)));
    }
    if (match) exportMnemonicMemeCard(match);
  }

  global.TreesFunHub = {
    init: initFunHub,
    render: renderFunHubRoot,
    showCharBar,
    getActiveCharBarState: () => activeCharBarSnapshot,
    exportMnemonicMemeCard,
    exportToneTrapCard,
    openSubmitMemeModal,
    openShareCardById
  };
})(typeof window !== 'undefined' ? window : self);
