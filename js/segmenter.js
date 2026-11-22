/**
 * 模块 4：高速中文分词、多音字消歧与轻声语法规则引擎 (js/segmenter.js)
 */
const TreesSegmenter = {
  _polyRegex: null,
  DI4_PREV: new Set('土天地大田山林草空場场工基陣阵營营領领聖圣墓墳坟質质產产房本外內内各隨随遍滿满落著着入下上中陸陆海極极球面方區区帶带界址點点位圖图鐵铁道雷震動动毯板磚砖皮殼壳層层心步處处目'),
  DI4_NEXT: new Set('方區区球面鐵铁圖图址點点位帶带界震雷毯板磚砖皮殼壳層层質质產产主下上中內内外表形勢势貌獄狱道穴基'),
  
  // 「得」讀作 de2 的常見前後綴
  DE2_PREV: new Set('獲获取贏赢奪夺博爭争謀谋所應应難难易幸免深相自哭笑不該该'),
  DE2_NEXT: new Set('到知益意分罪病逞志寵宠失當当法力體体人心手寸進进勝胜以道功度果'),

  // 「得」讀作 dei3（必須、需要）的前置副詞/代詞與後置介詞
  DEI3_PREV: new Set('就都更還还必須须總总非也又可全光真你我他她它人咱們们'),
  DEI3_NEXT: new Set('把按在往向用從从給给跟對对靠由替為为去修煉炼有是吃打看說说講讲做學学放'),

  // 「難/难」讀作四聲 nan4（災禍、劫難）的前綴
  NAN4_PREV: new Set('魔祛災灾苦大一劫遇落逃死受遭蒙救避難难這这那多百千萬万'),

  ZI3_PREV: new Set('孔孟老莊庄孫孙荀墨韓韩曾列淮鬼天太王皇世公君女男才孝弟學学游遊赤驕骄獨独長长次犬父母夫妻逆浪敗败愛爱義义養养原分電电粒光質质中離离量因種种甲乙丙丁戊己庚辛壬癸'),
  ZHANG3_PREV: new Set('成生家校班船市院部隊队組组廠厂村鎮镇縣县省局廳厅處处科股館馆長长兄尊師师首團团營营連连排軍军警會会董亭屯助'),
  ZHANG3_NEXT: new Set('大高進进輩辈子孫孙女兄姐弟妹幼老少相見见識识勢势官臉脸肉毛草發发芽功上'),
  ZHAO2_VERBS: new Set('睡找摸猜見见看聽听買买賣卖借抓捉逮拿打踢碰撞挨夠够犯管用合數数算說说談谈問问想記记忘點点燒烧燃穿吃喝聞闻嗅頂顶靠沾黏粘'),

  getPolyRegex() {
    if (!this._polyRegex && typeof TREES_DICT !== 'undefined' && TREES_DICT.POLYPHONE_CONTEXT) {
      const keys = Object.keys(TREES_DICT.POLYPHONE_CONTEXT).sort((a, b) => b.length - a.length);
      if (keys.length > 0) {
        this._polyRegex = new RegExp(keys.join('|'), 'g');
      }
    }
    return this._polyRegex;
  },

  processChinese(chineseStr, fragment, fullText, startIndex, renderCallback) {
    const len = chineseStr.length;
    let simplifiedStr = '';
    const hasUtils = typeof TreesTextUtils !== 'undefined' && typeof TreesTextUtils.toSimplified === 'function';
    const hasT2S = typeof TREES_DICT !== 'undefined' && TREES_DICT.T2S_MAP;

    for (let k = 0; k < len; k++) {
      let ch = chineseStr[k];
      if (ch === '妳') ch = '你';
      if (hasT2S && TREES_DICT.T2S_MAP[ch]) {
        simplifiedStr += TREES_DICT.T2S_MAP[ch];
      } else if (hasUtils) {
        simplifiedStr += TreesTextUtils.toSimplified(ch);
      } else {
        simplifiedStr += ch;
      }
    }

    let pyArray = (typeof pinyinPro !== 'undefined' && pinyinPro.pinyin)
      ? pinyinPro.pinyin(simplifiedStr, { toneType: 'num', type: 'array' })
      : new Array(len).fill('');

    const locked = new Uint8Array(len);
    const polyRegex = this.getPolyRegex();
    if (polyRegex) {
      const applyPolyOn = (targetStr) => {
        polyRegex.lastIndex = 0;
        let match;
        while ((match = polyRegex.exec(targetStr)) !== null) {
          const word = match[0];
          const pos = match.index;
          const rule = TREES_DICT.POLYPHONE_CONTEXT[word];
          if (rule) {
            for (let m = 0; m < word.length; m++) {
              if (!locked[pos + m] && rule[m] && rule[m].pinyin) {
                pyArray[pos + m] = rule[m].pinyin;
                locked[pos + m] = 1;
              }
            }
          }
        }
      };
      applyPolyOn(chineseStr);
      if (simplifiedStr !== chineseStr) {
        applyPolyOn(simplifiedStr);
      }
    }

    for (let j = 0; j < len; j++) {
      if (locked[j]) continue;

      const char = chineseStr[j];
      const prevChar = j > 0 ? chineseStr[j - 1] : (startIndex > 0 ? fullText[startIndex - 1] : '');
      const prev2Char = j > 1 ? chineseStr[j - 2] : (startIndex > 1 ? fullText[startIndex - 2] : '');
      const nextChar = j < len - 1 ? chineseStr[j + 1] : (startIndex + j + 1 < fullText.length ? fullText[startIndex + j + 1] : '');
      const isEndOfClause = !nextChar || /[，。！？、；：“”‘’（）《》〈〉【】—…·,.!?;:"'()\s]/.test(nextChar);

      // 1. 「嚇 / 吓」：強制四聲 xia4
      if (char === '嚇' || char === '吓') {
        pyArray[j] = 'xia4';
      }
      // 2. 「妳」：強制三聲 ni3
      else if (char === '妳') {
        pyArray[j] = 'ni3';
      }
      // 3. 「祛」：強制一聲 qu1（編譯為 tsee(oo)）
      else if (char === '祛') {
        pyArray[j] = 'qu1';
      }
      // 4. 「難 / 难」：區分名詞四聲 nan4 與形容詞二聲 nan2
      else if (char === '難' || char === '难') {
        if (this.NAN4_PREV.has(prevChar) && !/[受過过看聽听做辦办解免以得道怪堪言保測测度信]/.test(nextChar)) {
          pyArray[j] = 'nan4';
        }
      }
      // 5. 「長 / 长」：區分 zhang3 與 chang2
      else if (char === '長' || char === '长') {
        if ((prevChar === '長' || prevChar === '长') || (nextChar === '長' || nextChar === '长')) {
          pyArray[j] = 'chang2';
        } else if (this.ZHANG3_PREV.has(prevChar) || this.ZHANG3_NEXT.has(nextChar)) {
          pyArray[j] = 'zhang3';
        } else {
          pyArray[j] = 'chang2';
        }
      }
      // 6. 「的」：常見助詞強制輕聲 de5
      else if (char === '的' && pyArray[j] !== 'di2' && pyArray[j] !== 'di4') {
        pyArray[j] = 'de5';
      }
      // 7. 「地」：在形容詞/副詞後作助詞時讀輕聲 de5（「目地」讀 di4）
      else if (char === '地') {
        if (prevChar === '目') {
          pyArray[j] = 'di4';
        } else if (j > 0 && !this.DI4_PREV.has(prevChar) && !this.DI4_NEXT.has(nextChar)) {
          pyArray[j] = 'de5';
        }
      }
      // 8. 「得」：精準區分 dei3（必須）、de2（獲得）與 de5（輕聲補語助詞）
      else if (char === '得') {
        if (this.DE2_PREV.has(prevChar) || this.DE2_NEXT.has(nextChar)) {
          pyArray[j] = 'de2';
        } else if (this.DEI3_PREV.has(prevChar) || this.DEI3_NEXT.has(nextChar) || j === 0) {
          pyArray[j] = 'dei3';
        } else {
          pyArray[j] = 'de5';
        }
      }
      // 9. 「了」：精準區分 liao3（能夠/完畢）與 le5（輕聲助詞）
      else if (char === '了') {
        // A. 「動詞 + 不/得/的 + 了」（如：修不了、傳的了、受得了）➔ 讀 liao3
        if ((prevChar === '不' || prevChar === '得' || prevChar === '的') && prev2Char && /[\u4e00-\u9fa5]/.test(prev2Char) && prev2Char !== '不' && prev2Char !== '了') {
          pyArray[j] = 'liao3';
        }
        // B. 其餘所有情況（含「不了了」的第2個了、引號後的「”了」、句尾或動詞後的了）➔ 統一強制為輕聲 le5 (Ler)
        else if (pyArray[j] === 'le3' || pyArray[j] === 'liao3') {
          pyArray[j] = 'le5';
        }
      }
      // 10. 「子」：在名詞詞尾時轉為輕聲 zi5
      else if (char === '子') {
        if (j > 0 && !this.ZI3_PREV.has(prevChar) && (isEndOfClause || !/[女孫孙弟彈弹民爵夜時时]/.test(nextChar))) {
          pyArray[j] = 'zi5';
        }
      }
      // 11. 「著 / 着」：支援「睡不着/睡不著」等 zhao2 結構與 zhe5 輕聲助詞
      else if (char === '著' || char === '着') {
        if ((prevChar === '不' || prevChar === '得') && (!prev2Char || this.ZHAO2_VERBS.has(prev2Char))) {
          pyArray[j] = 'zhao2';
          if (j > 0 && !locked[j - 1]) {
            pyArray[j - 1] = (prevChar === '不') ? 'bu5' : 'de5';
          }
        } else if (this.ZHAO2_VERBS.has(prevChar) && (nextChar === '了' || isEndOfClause)) {
          pyArray[j] = 'zhao2';
        } else if (j > 0 && !/[名作書书述論论稱称重見见手眼陸陆落實实衣穿執执土原專专顯显昭卓沉]/.test(prevChar) && !/[名作書书述論论稱称重見见手眼陸陆落實实衣穿急迷火涼凉手慌忙落想]/.test(nextChar)) {
          pyArray[j] = 'zhe5';
        }
      }
      // 12. 常見語氣詞與詞尾（嗎、呢、吧、們、麼）：強制輕聲
      else if (char === '吗' || char === '嗎') {
        pyArray[j] = 'ma5';
      } else if (char === '呢' && isEndOfClause) {
        pyArray[j] = 'ne5';
      } else if (char === '吧' && isEndOfClause) {
        pyArray[j] = 'ba5';
      } else if ((char === '们' || char === '們') && j > 0) {
        pyArray[j] = 'men5';
      } else if ((char === '么' || char === '麼') && j > 0) {
        pyArray[j] = 'me5';
      } else if (j > 0 && char === prevChar && /[媽妈爸哥姐弟妹奶爺爷叔姑舅嬸婶娃寶宝星謝谢看聽听说說走想試试問问笑]/.test(char)) {
        pyArray[j] = pyArray[j].replace(/[1-4]$/, '5');
      }
    }

    for (let j = 0; j < len; j++) {
      renderCallback(chineseStr[j], pyArray[j], true, fragment);
    }
  }
};