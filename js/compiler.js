/**
 * 模块 5：Trees Pinyin (v25) 官方规则编译器 (js/compiler.js)
 * - 修正 ju/jue/juan/jun 多餘空格，統一為 jee(oo), jee(oo)er, jee(oo)an, jee(oo)n
 * - 鎖定 er ➔ (uh)-er / uh-er4，yi ➔ yee，qie ➔ tseer，xie ➔ seer
 */
const TreesCompiler = {
  INITIALS: {
    "b": "b", "p": "p", "m": "m", "f": "f",
    "d": "d", "t": "t", "n": "n", "l": "L",
    "g": "g", "k": "k", "h": "h",
    "j": "j", "q": "tsee", "x": "see",
    "zh": "(r)ds", "ch": "(r)ts", "sh": "(r)s", "r": "(r)th",
    "z": "ds", "c": "ts", "s": "s",
    "y": "y", "w": "w"
  },

  FINALS: {
    "a": "ah", "o": "ooer", "e": "er", "i": "ee", "u": "oo", "ü": "ee(oo)", "v": "ee(oo)",
    "ai": "ie", "ei": "ay", "ui": "ooay", "ao": "aw", "ou": "oh", "iu": "eeoh",
    "ie": "eer", "üe": "ee(oo)er", "ve": "ee(oo)er",
    "an": "an", "en": "er-n", "in": "een", "un": "oon", "ün": "ee(oo)n", "vn": "ee(oo)n",
    "ang": "ang", "eng": "er-ng", "ing": "ing", "ong": "er-oong",
    "ia": "eeah", "ian": "eean", "iao": "eeaw", "iang": "eeang",
    "iong": "eer-oong", "ua": "ooah", "uai": "ooie", "uan": "ooan",
    "uang": "ooang", "uo": "ooer", "üan": "ee(oo)an", "van": "ee(oo)an"
  },

  compile(pinyin) {
    if (!pinyin) return '';
    if (pinyin === 'Ler') return 'Ler';

    if (pinyin === 'de' || pinyin === 'de5' || pinyin === 'de0' || pinyin === 'de1') {
      return 'der';
    }

    if (pinyin === 'ren' || pinyin === 'ren2' || pinyin === 'ren4' || pinyin === 'ren1' || pinyin === 'ren5' || pinyin === 'ren0') {
      let tMatch = pinyin.match(/[0-5]$/);
      let t = (tMatch && tMatch[0] !== '1' && tMatch[0] !== '5' && tMatch[0] !== '0') ? tMatch[0] : '';
      return `(r)ther-n${t}`;
    }

    let cleanPyLower = pinyin.toLowerCase();
    if (cleanPyLower.startsWith('xing')) {
      const match = pinyin.match(/^([a-z:üv()\-]+)([0-5]?)$/i);
      if (match) {
        let [, py, tone] = match;
        if (tone === '1' || tone === '5' || tone === '0') tone = "";
        let replaced = py.replace(/^xing/i, 'sing');
        return `${replaced}${tone}`;
      }
    }

    const match = pinyin.match(/^([a-z:üv()\-]+)([0-5]?)$/i);
    if (!match) return pinyin;

    let [, py, tone] = match;
    py = py.toLowerCase().replace('u:', 'v');

    if (tone === '1' || tone === '5' || tone === '0') {
      tone = "";
    }

    if (py === 'er') return tone === '4' ? `uh-er4` : `(uh)-er${tone}`;
    if (py === 'yi') return `yee${tone}`;
    if (py === 'i') return `ee${tone}`;
    if (py === 'wen') return `wer-n${tone}`;
    if (py === 'shun') return `soon${tone}`;
    if (py === 'zun') return `dsoon${tone}`;
    if (py === 'yue') return `yee(oo)er${tone}`;
    if (py === 'yu') return `yee(oo)${tone}`;
    if (py === 'yuan') return `yee(oo)an${tone}`;
    if (py === 'yun') return `yee(oo)n${tone}`;
    if (py === 'wo') return `wer${tone}`;
    if (py === 'ye') return `yer${tone}`;

    if (py === 'jiu') return `jeeoh${tone}`;
    if (py === 'qiu') return `tseeoh${tone}`;
    if (py === 'xiu') return `seeoh${tone}`;

    if (py === 'zi') return `ds${tone}`;
    if (py === 'ci') return `ts${tone}`;
    if (py === 'si') return `s${tone}`;
    if (py === 'zhi') return `(r)ds${tone}`;
    if (py === 'chi') return `(r)ts${tone}`;
    if (py === 'shi') return `(r)s${tone}`;
    if (py === 'ri') return `(r)th${tone}`;

    if (py === 'lv' || py === 'lü') return `Lee(oo)${tone}`;
    if (py === 'nv' || py === 'nü') return `nee(oo)${tone}`;
    if (py === 'lve' || py === 'lüe') return `Lee(oo)er${tone}`;

    if (py === 'ju') return `jee(oo)${tone}`;
    if (py === 'qu') return `tsee(oo)${tone}`;
    if (py === 'xu') return `see(oo)${tone}`;
    if (py === 'jue') return `jee(oo)er${tone}`;
    if (py === 'que') return `tsee(oo)er${tone}`;
    if (py === 'xue') return `see(oo)er${tone}`;
    if (py === 'juan') return `jee(oo)an${tone}`;
    if (py === 'quan') return `tsee(oo)an${tone}`;
    if (py === 'xuan') return `see(oo)an${tone}`;
    if (py === 'jun') return `jee(oo)n${tone}`;
    if (py === 'qun') return `tsee(oo)n${tone}`;
    if (py === 'xun') return `see(oo)n${tone}`;

    let initial = '';
    let final = py;
    const initialsList = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'z', 'c', 's', 'r', 'y', 'w'];
    for (const init of initialsList) {
      if (py.startsWith(init)) {
        initial = init;
        final = py.slice(init.length);
        break;
      }
    }

    let mappedInitial = (initial && this.INITIALS[initial]) ? this.INITIALS[initial] : (initial || "");
    let mappedFinal = this.FINALS[final] || final;

    if (initial === 'w') {
      mappedInitial = 'w';
      if (final === 'u') mappedFinal = 'oo';
    }

    if (initial === 'g' && final === 'uo') return `gooer${tone}`;
    if (initial === 'j' && final === 'ia') return `jeeah${tone}`;

    if (final === 'ai') {
      mappedFinal = 'ie';
    } else if (final === 'ie') {
      mappedFinal = 'eer';
    }

    if (['q', 'x'].includes(initial)) {
      if (final === 'i') return `${mappedInitial}${tone}`;
      if (final === 'ing') return `${initial === 'q' ? 'ts' : 's'}ing${tone}`;
      if (final === 'ie') return `${initial === 'q' ? 'ts' : 's'}eer${tone}`;
      if (mappedFinal.startsWith('ee')) mappedFinal = mappedFinal.replace(/^ee/, '');
    } else if (initial === 'j') {
      if (final === 'i') mappedFinal = 'ee';
      else if (mappedFinal.startsWith('ee') && mappedFinal !== 'eeah') {
        return `${mappedInitial}${mappedFinal}${tone}`;
      }
    }

    return `${mappedInitial}${mappedFinal}${tone}`;
  }
};