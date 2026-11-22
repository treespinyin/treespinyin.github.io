/**
 * Trees Pinyin 本地純前端 PDF 文字提取與智慧排版重排引擎 (js/pdf-local.js - v5.2)
 * - 零外部依賴、零網路流量、不依賴 api.ocr.space 測試 Key
 * - 利用瀏覽器原生 DecompressionStream('deflate') 解壓 FlateDecode 內容流
 * - 支援 ToUnicode CMap (bfchar / bfrange)、UTF-16BE、八進位轉義
 * - 座標感知行重組 (Tm / Td / TD / T* / TJ 字距空格還原) + 智慧段落重排（去頁碼、接連字號、去中文雜散空格）
 */
(function(global) {
  if (global.TreesLocalPdf) return;

  async function inflateBytes(compressed) {
    if (typeof DecompressionStream === 'undefined') return null;
    for (const fmt of ['deflate', 'deflate-raw']) {
      try {
        const ds = new DecompressionStream(fmt);
        const writer = ds.writable.getWriter();
        writer.write(compressed);
        writer.close();
        const out = await new Response(ds.readable).arrayBuffer();
        return new Uint8Array(out);
      } catch (e) {}
    }
    return null;
  }

  function bytesToLatin1(bytes) {
    let out = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return out;
  }

  function decodeHexToUnicode(hex) {
    const clean = hex.replace(/\s+/g, '');
    if (!clean || clean.length % 2 !== 0) return '';
    if (clean.length === 4 || clean.length % 4 === 0) {
      let s = '';
      for (let i = 0; i < clean.length; i += 4) {
        const code = parseInt(clean.slice(i, i + 4), 16);
        if (!isNaN(code) && code !== 0xfeff) s += String.fromCharCode(code);
      }
      return s;
    }
    let s = '';
    for (let i = 0; i < clean.length; i += 2) {
      const code = parseInt(clean.slice(i, i + 2), 16);
      if (!isNaN(code)) s += String.fromCharCode(code);
    }
    return s;
  }

  function parseCMap(text, cmap) {
    if (!text.includes('beginbfchar') && !text.includes('beginbfrange')) return;

    const bfCharBlocks = text.match(/beginbfchar[\s\S]*?endbfchar/g) || [];
    for (const block of bfCharBlocks) {
      const reg = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
      let m;
      while ((m = reg.exec(block)) !== null) {
        cmap.set(m[1].toUpperCase(), decodeHexToUnicode(m[2]));
      }
    }

    const bfRangeBlocks = text.match(/beginbfrange[\s\S]*?endbfrange/g) || [];
    for (const block of bfRangeBlocks) {
      const reg = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]+)>|\[([^\]]+)\])/g;
      let m;
      while ((m = reg.exec(block)) !== null) {
        const start = parseInt(m[1], 16);
        const end = parseInt(m[2], 16);
        const padLen = m[1].length;
        if (isNaN(start) || isNaN(end) || end - start > 4096) continue;

        if (m[4]) {
          let dstCode = parseInt(m[4], 16);
          for (let code = start; code <= end; code++, dstCode++) {
            const key = code.toString(16).toUpperCase().padStart(padLen, '0');
            cmap.set(key, String.fromCharCode(dstCode));
          }
        } else if (m[5]) {
          const arr = m[5].match(/<([0-9a-fA-F]+)>/g) || [];
          for (let idx = 0; idx < arr.length && start + idx <= end; idx++) {
            const key = (start + idx).toString(16).toUpperCase().padStart(padLen, '0');
            cmap.set(key, decodeHexToUnicode(arr[idx].slice(1, -1)));
          }
        }
      }
    }
  }

  function decodePdfLiteralString(raw) {
    const bytes = [];
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '\\') {
        i++;
        if (i >= raw.length) break;
        const next = raw[i];
        if (next === 'n') bytes.push(10);
        else if (next === 'r') bytes.push(13);
        else if (next === 't') bytes.push(9);
        else if (next === 'b') bytes.push(8);
        else if (next === 'f') bytes.push(12);
        else if (next === '(' || next === ')' || next === '\\') bytes.push(next.charCodeAt(0));
        else if (next === '\r' || next === '\n') {
          if (next === '\r' && raw[i + 1] === '\n') i++;
        } else if (/[0-7]/.test(next)) {
          let oct = next;
          if (/[0-7]/.test(raw[i + 1] || '')) oct += raw[++i];
          if (/[0-7]/.test(raw[i + 1] || '')) oct += raw[++i];
          bytes.push(parseInt(oct, 8) & 0xff);
        } else {
          bytes.push(next.charCodeAt(0));
        }
      } else {
        bytes.push(ch.charCodeAt(0) & 0xff);
      }
    }

    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      let s = '';
      for (let i = 2; i + 1 < bytes.length; i += 2) {
        s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      }
      return s;
    }

    // 嘗試 UTF-8 解碼，否則退回 Latin1
    try {
      const dec = new TextDecoder('utf-8', { fatal: true });
      return dec.decode(new Uint8Array(bytes));
    } catch (e) {
      return bytes.map(b => (b >= 32 || b === 9 || b === 10) ? String.fromCharCode(b) : '').join('');
    }
  }

  function decodePdfHexString(hexRaw, cmap) {
    const hex = hexRaw.replace(/\s+/g, '').toUpperCase();
    if (!hex) return '';

    if (hex.startsWith('FEFF') && hex.length >= 8) {
      return decodeHexToUnicode(hex.slice(4));
    }

    if (cmap && cmap.size > 0) {
      let out = '';
      let matched = 0;
      let total = 0;
      // 優先嘗試 4 位 hex (CID / CJK)
      if (hex.length % 4 === 0) {
        for (let i = 0; i < hex.length; i += 4) {
          total++;
          const k4 = hex.slice(i, i + 4);
          if (cmap.has(k4)) {
            out += cmap.get(k4);
            matched++;
          } else {
            const k2a = k4.slice(0, 2);
            const k2b = k4.slice(2, 4);
            if (cmap.has(k2a)) { out += cmap.get(k2a); matched++; }
            if (cmap.has(k2b)) { out += cmap.get(k2b); matched++; }
          }
        }
        if (matched > 0) return out;
      }
      // 嘗試 2 位 hex (單字節字型)
      out = '';
      for (let i = 0; i < hex.length; i += 2) {
        const k2 = hex.slice(i, i + 2);
        if (cmap.has(k2)) {
          out += cmap.get(k2);
          matched++;
        } else {
          const code = parseInt(k2, 16);
          if (code >= 32 && code < 127) out += String.fromCharCode(code);
        }
      }
      if (matched > 0) return out;
    }

    // 無 CMap 時：若大部分為 ASCII 可見字元，當作單字節解析
    let asciiOut = '';
    let printable = 0;
    for (let i = 0; i + 1 < hex.length; i += 2) {
      const code = parseInt(hex.slice(i, i + 2), 16);
      if (code >= 32 && code < 127) {
        asciiOut += String.fromCharCode(code);
        printable++;
      } else if (code === 10 || code === 13 || code === 9) {
        asciiOut += ' ';
        printable++;
      }
    }
    if (hex.length >= 2 && printable / (hex.length / 2) > 0.75) {
      return asciiOut;
    }
    return '';
  }

  function estimateTextWidth(text, fontSize) {
    let w = 0;
    const fs = fontSize || 12;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0x2E80 && code <= 0x9FFF) w += fs * 0.95;
      else if (code === 32) w += fs * 0.28;
      else w += fs * 0.50;
    }
    return w;
  }

  function joinLineRuns(runs) {
    if (!runs || runs.length === 0) return '';
    const sorted = runs.slice().sort((a, b) => {
      if (a.hasCoords && b.hasCoords && Math.abs(a.x - b.x) > 0.5) return a.x - b.x;
      return a.order - b.order;
    });
    let out = '';
    let prev = null;
    for (const run of sorted) {
      const txt = run.text;
      if (!txt) continue;
      if (prev && out.length > 0) {
        const endsSpace = /\s$/.test(out);
        const startsSpace = /^\s/.test(txt);
        if (!endsSpace && !startsSpace) {
          const lastCh = out[out.length - 1];
          const firstCh = txt[0];
          const lastCjk = /[\u4e00-\u9fa5，。！？、；：（）《》「」『』]/.test(lastCh);
          const firstCjk = /[\u4e00-\u9fa5，。！？、；：（）《》「」『』]/.test(firstCh);
          const fs = Math.max(6, Math.min(prev.fontSize || 12, run.fontSize || 12));
          const gap = (prev.hasCoords && run.hasCoords)
            ? (run.x - (prev.x + estimateTextWidth(prev.text, prev.fontSize)))
            : 0;

          if (lastCjk && firstCjk) {
            if (gap > fs * 1.6) out += ' ';
          } else if (/[.,!?;:]/.test(lastCh) && /[A-Za-z0-9]/.test(firstCh)) {
            out += ' ';
          } else if (prev.hasCoords && run.hasCoords) {
            if (gap > fs * 0.16) out += ' ';
          } else if (/[A-Za-z0-9]/.test(lastCh) && /[A-Za-z0-9]/.test(firstCh) && prev.blockId !== run.blockId) {
            out += ' ';
          }
        }
      }
      out += txt;
      prev = run;
    }
    return out.replace(/[ \t]{2,}/g, ' ').trim();
  }

  function mulPdfMatrix(m1, m2) {
    return [
      m1[0] * m2[0] + m1[1] * m2[2],
      m1[0] * m2[1] + m1[1] * m2[3],
      m1[2] * m2[0] + m1[3] * m2[2],
      m1[2] * m2[1] + m1[3] * m2[3],
      m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
      m1[4] * m2[1] + m1[5] * m2[3] + m2[5]
    ];
  }

  function extractTextFromContentStream(streamText, cmap) {
    if (!streamText.includes('BT') || !streamText.includes('ET')) return '';
    const runs = [];
    let runOrder = 0;
    let blockId = 0;

    const readLiteral = (body, start) => {
      let depth = 1;
      let j = start + 1;
      while (j < body.length && depth > 0) {
        if (body[j] === '\\') { j += 2; continue; }
        if (body[j] === '(') depth++;
        else if (body[j] === ')') depth--;
        j++;
      }
      return { text: decodePdfLiteralString(body.slice(start + 1, j - 1)), next: j };
    };

    const readHex = (body, start) => {
      const end = body.indexOf('>', start + 1);
      if (end === -1) return { text: '', next: start + 1 };
      return { text: decodePdfHexString(body.slice(start + 1, end), cmap), next: end + 1 };
    };

    // 全串流線性掃描：完整追蹤外層 q / Q / cm 座標矩陣堆疊，徹底修復 Google Docs / Chrome 匯出 PDF 的跨行錯亂問題
    let ctm = [1, 0, 0, 1, 0, 0];
    const ctmStack = [];
    let inText = false;
    let tm = [1, 0, 0, 1, 0, 0];
    let tlm = [1, 0, 0, 1, 0, 0];
    let fontSize = 12;
    let leading = 14;
    let hasCoords = false;
    let numStack = [];
    let pendingStr = '';
    let pendingHasStr = false;
    let i = 0;

    const emitRun = (str) => {
      if (!str) return;
      const trm = mulPdfMatrix(tm, ctm);
      const effFs = Math.max(6, Math.min(72, Math.abs(Math.hypot(trm[2], trm[3]) * fontSize) || 12));
      runs.push({
        x: trm[4],
        y: trm[5],
        fontSize: effFs,
        text: str,
        hasCoords,
        order: runOrder++,
        blockId
      });
      const localScale = Math.hypot(tm[0], tm[1]) || 1;
      const ctmScale = Math.hypot(ctm[0], ctm[1]) || 1;
      const advLocal = estimateTextWidth(str, effFs) / Math.max(0.01, localScale * ctmScale);
      tm = mulPdfMatrix([1, 0, 0, 1, advLocal, 0], tm);
    };

    const body = streamText;
    while (i < body.length) {
      const ch = body[i];

      // 跳過空白與註解
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '%') {
        const nl = body.indexOf('\n', i);
        i = nl === -1 ? body.length : nl + 1;
        continue;
      }

      // 字串 (...)
      if (ch === '(') {
        const lit = readLiteral(body, i);
        if (inText) {
          pendingStr = lit.text;
          pendingHasStr = true;
        }
        i = lit.next;
        continue;
      }

      // 十六進位字串 <...>（跳過字典 <<...>>）
      if (ch === '<') {
        if (body[i + 1] === '<') {
          const dictEnd = body.indexOf('>>', i + 2);
          i = dictEnd === -1 ? i + 2 : dictEnd + 2;
          continue;
        }
        const hx = readHex(body, i);
        if (inText) {
          pendingStr = hx.text;
          pendingHasStr = true;
        }
        i = hx.next;
        continue;
      }

      // TJ 陣列 [ (Hel) -15 (lo) -250 (world) ]
      if (ch === '[') {
        let j = i + 1;
        let arrText = '';
        while (j < body.length && body[j] !== ']') {
          const c = body[j];
          if (/\s/.test(c)) { j++; continue; }
          if (c === '(') {
            const lit = readLiteral(body, j);
            if (inText) arrText += lit.text;
            j = lit.next;
          } else if (c === '<' && body[j + 1] !== '<') {
            const hx = readHex(body, j);
            if (inText) arrText += hx.text;
            j = hx.next;
          } else if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) {
            let k = j + 1;
            while (k < body.length && /[0-9.eE+-]/.test(body[k])) k++;
            const kern = parseFloat(body.slice(j, k));
            if (inText && !isNaN(kern) && arrText.length > 0 && !/\s$/.test(arrText)) {
              const lastCh = arrText[arrText.length - 1];
              const isCjk = /[\u4e00-\u9fa5，。！？、；：（）《》]/.test(lastCh);
              if ((!isCjk && kern < -130) || (isCjk && kern < -300)) {
                arrText += ' ';
              }
            }
            j = k;
          } else {
            j++;
          }
        }
        if (inText) {
          pendingStr = arrText;
          pendingHasStr = true;
        }
        i = (j < body.length && body[j] === ']') ? j + 1 : j;
        continue;
      }

      // 數字運算元（支援科學記號與負數）
      if (ch === '-' || ch === '+' || ch === '.' || (ch >= '0' && ch <= '9')) {
        let k = i + 1;
        while (k < body.length && /[0-9.eE+-]/.test(body[k])) k++;
        const num = parseFloat(body.slice(i, k));
        if (!isNaN(num)) {
          numStack.push(num);
          if (numStack.length > 12) numStack.shift();
        }
        i = k;
        continue;
      }

      // 名稱物件 /F1
      if (ch === '/') {
        let k = i + 1;
        while (k < body.length && !/[\s()<>\[\]{}\/%]/.test(body[k])) k++;
        i = k;
        continue;
      }

      // 單雙引號算子 ' 與 "（換到下一行並輸出文字）
      if (ch === '\'' || ch === '"') {
        if (inText) {
          tlm = mulPdfMatrix([1, 0, 0, 1, 0, -(leading || fontSize * 1.2)], tlm);
          tm = tlm.slice();
          hasCoords = true;
          if (pendingHasStr) {
            emitRun(pendingStr);
            pendingStr = '';
            pendingHasStr = false;
          }
        }
        numStack = [];
        i++;
        continue;
      }

      // 英文算子（q, Q, cm, BT, ET, Tm, Td, TD, T*, TL, Tf, Tj, TJ 等）
      if (/[a-zA-Z*]/.test(ch)) {
        let k = i + 1;
        while (k < body.length && /[a-zA-Z0-9*]/.test(body[k])) k++;
        const op = body.slice(i, k);

        if (op === 'q') {
          ctmStack.push(ctm.slice());
        } else if (op === 'Q') {
          if (ctmStack.length > 0) ctm = ctmStack.pop();
        } else if (op === 'cm') {
          if (numStack.length >= 6) {
            const m = numStack.slice(-6);
            ctm = mulPdfMatrix(m, ctm);
          }
        } else if (op === 'BT') {
          inText = true;
          blockId++;
          tm = [1, 0, 0, 1, 0, 0];
          tlm = [1, 0, 0, 1, 0, 0];
          hasCoords = false;
          pendingStr = '';
          pendingHasStr = false;
        } else if (op === 'ET') {
          if (inText && pendingHasStr && pendingStr) {
            emitRun(pendingStr);
          }
          inText = false;
          pendingStr = '';
          pendingHasStr = false;
        } else if (inText) {
          if (op === 'Tj' || op === 'TJ') {
            if (pendingHasStr) {
              emitRun(pendingStr);
              pendingStr = '';
              pendingHasStr = false;
            }
          } else if (op === 'Tf') {
            if (numStack.length >= 1) {
              const fs = Math.abs(numStack[numStack.length - 1]);
              if (fs > 0 && fs < 200) fontSize = fs;
            }
          } else if (op === 'TL') {
            if (numStack.length >= 1) {
              const tl = Math.abs(numStack[numStack.length - 1]);
              if (tl > 0) leading = tl;
            }
          } else if (op === 'Tm') {
            if (numStack.length >= 6) {
              const m = numStack.slice(-6);
              tm = m.slice();
              tlm = m.slice();
              hasCoords = true;
            }
          } else if (op === 'Td' || op === 'TD') {
            if (numStack.length >= 2) {
              const tx = numStack[numStack.length - 2];
              const ty = numStack[numStack.length - 1];
              if (op === 'TD' && ty !== 0) leading = Math.abs(ty);
              tlm = mulPdfMatrix([1, 0, 0, 1, tx, ty], tlm);
              tm = tlm.slice();
              hasCoords = true;
            }
          } else if (op === 'T*') {
            tlm = mulPdfMatrix([1, 0, 0, 1, 0, -(leading || fontSize * 1.2)], tlm);
            tm = tlm.slice();
            hasCoords = true;
          }
        }

        numStack = [];
        i = k;
        continue;
      }

      i++;
    }

    if (runs.length === 0) return '';

    // 依視覺 Y 座標把同一行的文字段（含跨 BT/ET 的粗體、不同字型段）合併為完整視覺行
    const lines = [];
    for (const run of runs) {
      let targetLine = null;
      if (run.hasCoords && lines.length > 0) {
        const tol = Math.max(2.5, run.fontSize * 0.45);
        // 優先比對當前行與最近 4 行，容忍上標/粗體微幅位移且不打亂雙欄閱讀順序
        for (let idx = lines.length - 1; idx >= Math.max(0, lines.length - 4); idx--) {
          if (lines[idx].hasCoords && Math.abs(lines[idx].y - run.y) <= tol) {
            targetLine = lines[idx];
            break;
          }
        }
      } else if (!run.hasCoords && lines.length > 0 && !lines[lines.length - 1].hasCoords && lines[lines.length - 1].blockId === run.blockId) {
        targetLine = lines[lines.length - 1];
      }

      if (targetLine) {
        targetLine.runs.push(run);
        targetLine.fontSize = Math.max(targetLine.fontSize, run.fontSize);
      } else {
        lines.push({
          y: run.y,
          fontSize: run.fontSize,
          hasCoords: run.hasCoords,
          blockId: run.blockId,
          runs: [run]
        });
      }
    }

    // 計算中位行距，用來精準分辨「自然段間距」與「同段折行」
    const ySteps = [];
    for (let idx = 1; idx < lines.length; idx++) {
      if (lines[idx - 1].hasCoords && lines[idx].hasCoords) {
        const dy = lines[idx - 1].y - lines[idx].y;
        if (dy > 2 && dy < 70) ySteps.push(dy);
      }
    }
    ySteps.sort((a, b) => a - b);
    const medianStep = ySteps.length > 0 ? ySteps[Math.floor(ySteps.length / 2)] : 15;

    const outParts = [];
    let prevLine = null;
    for (const ln of lines) {
      const text = joinLineRuns(ln.runs);
      if (!text) continue;
      if (prevLine) {
        let isParaGap = false;
        if (prevLine.hasCoords && ln.hasCoords) {
          const dy = prevLine.y - ln.y;
          if (dy > Math.max(prevLine.fontSize * 1.65, medianStep * 1.38) || dy < -40) {
            isParaGap = true;
          }
        }
        outParts.push(isParaGap ? '\n\n' : '\n');
      }
      outParts.push(text);
      prevLine = ln;
    }

    return outParts.join('');
  }

  // 智慧 PDF 排版重排：去頁碼、接英文連字號、去中文雜散空格、還原自然段落與完整句子
  function reflowPdfText(rawText) {
    if (!rawText) return '';
    const cleaned = String(rawText)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u00A0\u200B\uFEFF]/g, ' ')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    const PAGE_NUM_REG = /^[-–—·•\s]*(?:page|p\.|第)?\s*\d{1,4}(?:\s*(?:of|\/|-)\s*\d{1,4})?\s*(?:頁|页)?[-–—·•\s]*$/i;
    const BULLET_REG = /^(?:[•●▪◦◆◇▸▹►\-\*]\s+|(?:\d{1,2}|[A-Za-z])[.)、]\s+|[（(][一二三四五六七八九十\d]+[）)]\s*|第[一二三四五六七八九十百\d]+[章節课課回條篇])/;
    const HEADING_REG = /^(?:chapter|section|lesson|part|unit|appendix|table of contents|introduction|summary|conclusion)\b/i;
    const isStandalonePinyinRubyLine = (line) => {
      if (!line || /[\u4e00-\u9fa5]/.test(line)) return false;
      if (!/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(line)) return false;
      if (!/^[a-zA-ZāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜ\s,.'’\-!?0-9()]+$/.test(line)) return false;
      if (/\b(?:the|and|for|with|that|this|have|from|your|please|cafe|café|resume|résumé|cliche|cliché|fiance|fiancé)\b/i.test(line)) return false;
      const words = line.trim().split(/\s+/).filter(Boolean);
      const toneWords = words.filter(w => /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(w)).length;
      return (toneWords >= 2 && toneWords / words.length >= 0.45) || (words.length === 1 && toneWords === 1 && line.length <= 7);
    };

    const rawParas = cleaned.split(/\n{2,}/);
    const finalParas = [];

    for (const rawPara of rawParas) {
      const lines = rawPara
        .split('\n')
        .map(l => l
          .replace(/([\u4e00-\u9fa5，。！？、；：（）《》「」『』])\s+(?=[\u4e00-\u9fa5，。！？、；：（）《》「」『』])/g, '$1')
          .replace(/[ \t]{2,}/g, ' ')
          .trim()
        )
        .filter(l => l && !PAGE_NUM_REG.test(l) && !isStandalonePinyinRubyLine(l));

      if (lines.length === 0) continue;

      // 偵測詩詞或對仗（連續 3 行以上、每行 4-18 字且句尾有完整中文標點），保留原有分行美感，不誤傷折行殘句
      const shortCjkLines = lines.filter(l => {
        const s = l.replace(/\s+/g, '');
        return /[\u4e00-\u9fa5]/.test(s) && s.length >= 4 && s.length <= 18 && /[，。！？；：、]$/.test(s);
      }).length;
      if (lines.length >= 3 && shortCjkLines / lines.length >= 0.8) {
        finalParas.push(lines.join('\n'));
        continue;
      }

      const merged = [];
      for (let i = 0; i < lines.length; i++) {
        const cur = lines[i];
        if (merged.length === 0) {
          merged.push(cur);
          continue;
        }
        const prev = merged[merged.length - 1];
        const prevEndsTerm = /[。！？.!?：:；;]$/.test(prev);
        const curIsBulletOrHeading = BULLET_REG.test(cur) || HEADING_REG.test(cur);
        const prevIsShortHeading = (
          !prevEndsTerm &&
          prev.length <= 42 &&
          (HEADING_REG.test(prev) || (i === 1 && cur.length > prev.length * 1.4 && /^[A-Z\u4e00-\u9fa5《「]/.test(cur)))
        );

        // 1. 英文行尾連字號（e.g. "learn-" + "ing" -> "learning"）
        if (/[A-Za-z]{2,}-$/.test(prev) && /^[a-z]/.test(cur)) {
          merged[merged.length - 1] = prev.slice(0, -1) + cur;
          continue;
        }

        // 2. 雙語對照行 (|||)、清單條目、標題或上行已完整結束的句子 → 保留乾淨換行
        if (prev.includes('|||') || cur.includes('|||') || curIsBulletOrHeading || prevIsShortHeading || prevEndsTerm) {
          merged.push(cur);
          continue;
        }

        // 3. PDF 欄寬導致的句中折行 → 智慧接回同一句
        const prevEndsCjk = /[\u4e00-\u9fa5，、；：（《「『—…]$/.test(prev);
        const curStartsCjk = /^[\u4e00-\u9fa5，。！？、；：）》」』]/.test(cur);
        merged[merged.length - 1] = (prevEndsCjk || curStartsCjk) ? (prev + cur) : (prev + ' ' + cur);
      }

      if (merged.length > 0) {
        finalParas.push(merged.join('\n'));
      }
    }

    return finalParas.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function looksLikeReadableText(str) {
    if (!str || str.trim().length < 6) return false;
    const clean = str.replace(/\s+/g, '');
    if (clean.length < 4) return false;
    const goodChars = (clean.match(/[\u4e00-\u9fa5a-zA-Z0-9.,!?;:'"()\-，。！？；：、（）《》]/g) || []).length;
    return (goodChars / clean.length) >= 0.55;
  }

  async function extractPdfTextLocal(arrayBuffer) {
    try {
      const bytes = new Uint8Array(arrayBuffer);
      const rawLatin1 = bytesToLatin1(bytes);
      const decodedStreams = [];
      const cmap = new Map();

      let pos = 0;
      const streamToken = 'stream';
      const endToken = 'endstream';

      while (pos < rawLatin1.length) {
        const sIdx = rawLatin1.indexOf(streamToken, pos);
        if (sIdx === -1) break;

        // 確認 stream 前面不是 endstream
        if (sIdx >= 3 && rawLatin1.slice(sIdx - 3, sIdx) === 'end') {
          pos = sIdx + 6;
          continue;
        }

        let dataStart = sIdx + 6;
        if (rawLatin1[dataStart] === '\r' && rawLatin1[dataStart + 1] === '\n') dataStart += 2;
        else if (rawLatin1[dataStart] === '\n' || rawLatin1[dataStart] === '\r') dataStart += 1;
        else {
          pos = sIdx + 6;
          continue;
        }

        const eIdx = rawLatin1.indexOf(endToken, dataStart);
        if (eIdx === -1) break;

        let dataEnd = eIdx;
        while (dataEnd > dataStart && (bytes[dataEnd - 1] === 10 || bytes[dataEnd - 1] === 13)) {
          dataEnd--;
        }

        const dictWindow = rawLatin1.slice(Math.max(0, sIdx - 420), sIdx);
        const isFlate = /\/FlateDecode\b/.test(dictWindow);
        const isImage = /\/Subtype\s*\/Image\b/.test(dictWindow);

        if (!isImage && dataEnd > dataStart && (dataEnd - dataStart) < 8 * 1024 * 1024) {
          let textStr = '';
          if (isFlate) {
            const inflated = await inflateBytes(bytes.subarray(dataStart, dataEnd));
            if (inflated) textStr = bytesToLatin1(inflated);
          } else {
            textStr = rawLatin1.slice(dataStart, dataEnd);
          }

          if (textStr) {
            if (textStr.includes('beginbfchar') || textStr.includes('beginbfrange')) {
              parseCMap(textStr, cmap);
            }
            if (textStr.includes('BT') && textStr.includes('ET')) {
              decodedStreams.push(textStr);
            }
          }
        }

        pos = eIdx + endToken.length;
      }

      const extractedParts = [];
      for (const st of decodedStreams) {
        const t = extractTextFromContentStream(st, cmap);
        if (t && t.trim()) extractedParts.push(t.trim());
      }

      const finalText = reflowPdfText(extractedParts.join('\n\n'));

      if (looksLikeReadableText(finalText)) {
        return { text: finalText, isScanned: false };
      }
      return { text: '', isScanned: true };
    } catch (e) {
      return { text: '', isScanned: true };
    }
  }

  global.TreesLocalPdf = {
    extractPdfTextLocal,
    extractTextFromContentStream,
    reflowPdfText
  };
})(typeof window !== 'undefined' ? window : self);
