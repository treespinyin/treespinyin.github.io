/**
 * 模組 6: js/mnemonics-app.js
 * 負責：原書 45 個記憶詞庫 (含雙語例句)、打分/分享解鎖、個人學習記錄、朗讀與 API Key 驗證管理
 */
// =========================================================================
// 8. 原書 45 個記憶詞庫 (含雙語例句) 與分享解鎖
// =========================================================================
const FULL_45_BOOK_MNEMONICS = [
  { pack: 1, meaning: "Hello / How are you?", trees: "Nee3 haw3", hanzi: "你好", pinyin: "nǐ hǎo", sound: "Similar to '<b><u>knee</u> <u>how</u></b>'.", mnemonic: "<b>Knee</b>ling to show <b>how</b> much respect you have.", exZh: "你好，很高興認識你！", exEn: "Hello, nice to meet you!" },
  { pack: 1, meaning: "You (Singular)", trees: "nee3", hanzi: "你", pinyin: "nǐ", sound: "Sounds like '<b><u>Knee</u></b>'.", mnemonic: "<b><u>Knee</u></b>(l) down while greeting <b>you</b>.", exZh: "請問你叫什麼名字？", exEn: "May I ask what your name is?" },
  { pack: 1, meaning: "Good", trees: "haw3", hanzi: "好", pinyin: "hǎo", sound: "Similar to '<b><u>how</u></b>'.", mnemonic: "'Nee3 haw3' literally means 'You good'.", exZh: "今天天氣真好！", exEn: "The weather is really good today!" },
  { pack: 1, meaning: "Good morning.", trees: "Dsaw3 (r)sang4 haw3", hanzi: "早上好", pinyin: "zǎo shang hǎo", sound: "Sounds like '<b><u>jaw</u> <u>sang</u></b>'.", mnemonic: "Morning yawning: your <b><u>jaw</u> <u>sang</u></b>!", exZh: "老師早上好！", exEn: "Good morning, teacher!" },
  { pack: 1, meaning: "Big", trees: "dah4", hanzi: "大", pinyin: "dà", sound: "First part of '<b><u>do</u></b>zen'.", mnemonic: "Our <b>big</b> family eats a <b><u>do</u></b>zen eggs.", exZh: "這個蘋果非常大。", exEn: "This apple is very big." },
  { pack: 1, meaning: "Home / Family", trees: "jeeah", hanzi: "家", pinyin: "jiā", sound: "Contraction of '<b><u>Gee</u></b>' and '<b><u>Ah</u></b>'.", mnemonic: "Our <b>big family</b> eats eggs in a <b>jar</b>.", exZh: "歡迎來到我家！", exEn: "Welcome to my home!" },
  { pack: 1, meaning: "Happy", trees: "kooie4 Ler4", hanzi: "快樂", pinyin: "kuài lè", sound: "'<b><u>qui</u></b>(te) <b><u>lo</u></b>(vely)'.", mnemonic: "<b>Happy</b> kids are <b><u>qui</u></b>(te) <b><u>lo</u></b>(vely)!", exZh: "祝你生日快樂！", exEn: "Wish you a happy birthday!" },
  { pack: 1, meaning: "New", trees: "seen", hanzi: "新", pinyin: "xīn", sound: "Sounds like '<b><u>seen</u></b>'.", mnemonic: "Never <b><u>seen</u></b> before, so it's <b>new</b>!", exZh: "這是一本新書。", exEn: "This is a new book." },
  { pack: 1, meaning: "Year", trees: "neean2", hanzi: "年", pinyin: "nián", sound: "'<b><u>Knee</u> <u>an</u></b>' or '<b>Neon</b>'.", mnemonic: "New <b>Year</b> involves kowtow and <b>neon</b> lights.", exZh: "祝大家新年快樂！", exEn: "Happy New Year, everyone!" },
  { pack: 1, meaning: "Make a fortune", trees: "fah tsie2", hanzi: "發財", pinyin: "fā cái", sound: "\"<b><u>far</u></b> i<b><u>t's I</u></b>\".", mnemonic: "A bold 'far try' to <b>make a fortune</b>.", exZh: "恭喜發財，萬事如意！", exEn: "Wishing you prosperity and all the best!" },
  { pack: 1, meaning: "Excuse me / Could you tell me...?", trees: "Tsing3 wer-n4", hanzi: "請問", pinyin: "qǐng wèn", sound: "Le<b><u>t's sing</u></b> <b><u>when</u></b> happy.", mnemonic: "tsing3 = Let's sing; wer-n4 = when.", exZh: "請問洗手間在哪裡？", exEn: "Excuse me, where is the restroom?" },
  { pack: 1, meaning: "Thank you!", trees: "Seer4 seer", hanzi: "謝謝", pinyin: "xiè xie", sound: "'<b><u>See</u> <u>ye</u></b>(s)' / 'See ya'.", mnemonic: "'Thank you' and 'See ya' go hand in hand!", exZh: "非常謝謝你的幫忙！", exEn: "Thank you very much for your help!" },
  { pack: 1, meaning: "See you / Good-bye", trees: "Dsie4 jeean4", hanzi: "再見", pinyin: "zài jiàn", sound: "'<b><u>Xy</u></b>lophone, <b><u>Gee</u> <u>an</u></b>'.", mnemonic: "Playing the <b><u>Xy</u></b>lophone to say <b>goodbye</b>.", exZh: "我們明天見，再見！", exEn: "See you tomorrow, goodbye!" },
  { pack: 1, meaning: "You are welcome.", trees: "Boo2 ker4 tsee", hanzi: "不客氣", pinyin: "bú kè qi", sound: "'<b><u>Boo</u> <u>Cur</u>—<u>tsy</u></b>'.", mnemonic: "No need to do a curtsy ('Boo Curtsy').", exZh: "不客氣，這是我應該做的。", exEn: "You're welcome, it's my pleasure." },
  { pack: 1, meaning: "I'm sorry.", trees: "Dooay4 boo4 tsee3", hanzi: "對不起", pinyin: "duì bù qǐ", sound: "<b><u>Dway</u></b>ne says '<b><u>boo</u> <u>qi</u></b>'.", mnemonic: "Dwayne apologizes: I'm sorry!", exZh: "對不起，我今天遲到了。", exEn: "I'm sorry, I am late today." },
  { pack: 2, meaning: "It doesn't matter / It's OK.", trees: "May2 gooan see", hanzi: "沒關係", pinyin: "méi guān xi", sound: "'<b><u>May</u></b> la<b><u>goon</u></b> <b><u>see</u></b>.'", mnemonic: "May the lagoon be seen.", exZh: "沒關係，下次注意就好了。", exEn: "It's OK, just be careful next time." },
  { pack: 2, meaning: "Don't get angry.", trees: "Beer2 (r)ser-ng tsee4", hanzi: "別生氣", pinyin: "bié shēng qì", sound: "'<b><u>Beer</u> <u>sung</u> <u>qi</u></b>'.", mnemonic: "With beer, Dwayne sung a song full of qi.", exZh: "別生氣，我們一起想辦法。", exEn: "Don't get angry, let's figure it out together." },
  { pack: 2, meaning: "Doctor", trees: "yee (r)ser-ng", hanzi: "醫生", pinyin: "yī shēng", sound: "yee + (r)ser-ng.", mnemonic: "The very first person you see at birth is a doctor.", exZh: "他是一位非常有名的醫生。", exEn: "He is a very famous doctor." },
  { pack: 2, meaning: "Day / Sun", trees: "(r)th4", hanzi: "日", pinyin: "rì", sound: "'<b><u>r</u></b>ain' + '<b><u>th</u></b>en'.", mnemonic: "And (r)then... the day begins!", exZh: "今天是個好日子。", exEn: "Today is a great day." },
  { pack: 2, meaning: "I / Me", trees: "wer3", hanzi: "我", pinyin: "wǒ", sound: "Part of '<b><u>wor</u></b>d'.", mnemonic: "I am the core of my world.", exZh: "我非常喜歡學習中文。", exEn: "I really like learning Chinese." },
  { pack: 2, meaning: "My / Mine", trees: "wer3 der", hanzi: "我的", pinyin: "wǒ de", sound: "Similar to '<b><u>word</u></b>'.", mnemonic: "Adding 'der' after 'wer3'.", exZh: "這本書是我的。", exEn: "This book is mine." },
  { pack: 2, meaning: "Your / Yours", trees: "nee3 der", hanzi: "你的", pinyin: "nǐ de", sound: "Sounds like '<b><u>need</u></b>'.", mnemonic: "Yours is what you need.", exZh: "你的發音非常標準！", exEn: "Your pronunciation is very accurate!" },
  { pack: 2, meaning: "It / He / She", trees: "tah", hanzi: "他", pinyin: "tā", sound: "First part of '<b><u>Ta</u></b>rget'.", mnemonic: "He and she buy it at Target.", exZh: "他是我們班的好學生。", exEn: "He is a good student in our class." },
  { pack: 2, meaning: "His / Her / Its", trees: "tah der", hanzi: "他的", pinyin: "tā de", sound: "Similar to '<b><u>tard</u></b>(y)'.", mnemonic: "He was tardy for his class.", exZh: "他的中文說得很好。", exEn: "He speaks Chinese very well." },
  { pack: 2, meaning: "Friend", trees: "per-ng2 yoh", hanzi: "朋友", pinyin: "péng yǒu", sound: "'<b><u>peng</u></b>uin <b><u>you</u></b>'.", mnemonic: "A cute penguin is your best friend!", exZh: "我們是最好的朋友。", exEn: "We are best friends." },
  { pack: 2, meaning: "Younger & Elder Brother", trees: "dee4 dee / ger ger", hanzi: "弟弟哥哥", pinyin: "dì di gē ge", sound: "'<b><u>di</u></b>g' = dee4 + ger.", mnemonic: "'dig' is teamwork of brothers!", exZh: "哥哥和弟弟一起去公園。", exEn: "The brothers go to the park together." },
  { pack: 2, meaning: "Country & USA", trees: "may3 gooer2", hanzi: "美國", pinyin: "měi guó", sound: "<b><u>May</u></b>flower + gooer2.", mnemonic: "No Mayflower, no USA.", exZh: "我來自美國加州。", exEn: "I come from California, USA." },
  { pack: 2, meaning: "Human / People", trees: "(r)ther-n2", hanzi: "人", pinyin: "rén", sound: "'r' tongue + weak '<b><u>then</u></b>'.", mnemonic: "Add (r)ther-n2 for people.", exZh: "這裡的人都非常熱情。", exEn: "The people here are very warm." },
  { pack: 2, meaning: "China", trees: "(r)dser-oong gooer2", hanzi: "中國", pinyin: "zhōng guó", sound: "Sounds like '<b><u>drone</u></b>'.", mnemonic: "Fly a drone across China.", exZh: "中國有很多歷史古蹟。", exEn: "China has many historical sites." },
  { pack: 2, meaning: "Like / Love", trees: "see3 hooan", hanzi: "喜歡", pinyin: "xǐ huān", sound: "'<b><u>see</u> <u>Juan</u></b>'.", mnemonic: "Like him when you see Don Juan!", exZh: "你喜歡吃什麼水果？", exEn: "What fruit do you like to eat?" },
  { pack: 3, meaning: "Can / Be able to", trees: "hooay4", hanzi: "會", pinyin: "huì", sound: "'<b><u>hoo</u></b>(r)<b><u>ay</u></b>'.", mnemonic: "If you can do it, shout hooray!", exZh: "我會說一點點中文。", exEn: "I can speak a little bit of Chinese." },
  { pack: 3, meaning: "Book", trees: "(r)soo", hanzi: "書", pinyin: "shū", sound: "Sounds like '<b><u>sue</u></b>'.", mnemonic: "Copy this book and Sue will sue you!", exZh: "我喜歡在圖書館看書。", exEn: "I like reading books in the library." },
  { pack: 3, meaning: "Who & Water", trees: "(r)sooay2 / (r)sooay3", hanzi: "誰喝水", pinyin: "shuí hē shuǐ", sound: "Contract '<b><u>sway</u></b>'.", mnemonic: "Mermaid swaying in the water.", exZh: "請問誰想喝水？", exEn: "Excuse me, who would like to drink water?" },
  { pack: 3, meaning: "Look for", trees: "(r)dsaw3", hanzi: "找", pinyin: "zhǎo", sound: "Similar to '<b><u>jaw</u></b>'.", mnemonic: "Looking for my jaw on the floor!", exZh: "你在找什麼東西？", exEn: "What are you looking for?" },
  { pack: 3, meaning: "From", trees: "Lie2 ds4", hanzi: "來自", pinyin: "lái zì", sound: "Similar to '<b><u>lies</u></b>'.", mnemonic: "Truth lies in where you come from.", exZh: "我的老師來自台灣。", exEn: "My teacher comes from Taiwan." },
  { pack: 3, meaning: "Where", trees: "nah3 Lee3", hanzi: "哪裡", pinyin: "nǎ lǐ", sound: "G<b><u>narly</u></b>.", mnemonic: "Don't know where you are? Gnarly!", exZh: "你週末想去哪裡玩？", exEn: "Where do you want to go this weekend?" },
  { pack: 3, meaning: "How", trees: "dser-n3 mer", hanzi: "怎麼", pinyin: "zěn me", sound: "Confu<b><u>sion</u></b> <b><u>Mer</u></b>maid.", mnemonic: "How the mermaid falls in love.", exZh: "這道題應該怎麼做？", exEn: "How should we solve this question?" },
  { pack: 3, meaning: "Supermarket", trees: "(r)tsaw (r)s4", hanzi: "超市", pinyin: "chāo shì", sound: "r-colored '<b><u>cho</u></b>(i)<b><u>ce</u></b>'.", mnemonic: "So many choices in the supermarket!", exZh: "媽媽去超市買水果了。", exEn: "Mom went to the supermarket to buy fruit." },
  { pack: 3, meaning: "Menu & Check, please", trees: "tsie4 dan / mie3 dan", hanzi: "菜單買單", pinyin: "cài dān mǎi dān", sound: "I<b><u>t's I</u></b> <b><u>done</u></b>.", mnemonic: "Done with the menu; check, please!", exZh: "服務員，請給我菜單。", exEn: "Waiter, please give me the menu." },
  { pack: 3, meaning: "Would like / Want", trees: "seeang3 yaw4", hanzi: "想要", pinyin: "xiǎng yào", sound: "'<b><u>see</u> <u>young</u></b>' + '<b><u>your</u></b>'.", mnemonic: "Want to see Young's beer.", exZh: "我想要一杯熱咖啡。", exEn: "I would like a cup of hot coffee." },
  { pack: 3, meaning: "Milk tea", trees: "nie3 (r)tsah2", hanzi: "奶茶", pinyin: "nǎi chá", sound: "'<b><u>ni</u></b>ce <b><u>char</u></b>ge'.", mnemonic: "Milk tea gives a nice charge!", exZh: "珍珠奶茶非常好喝。", exEn: "Boba milk tea is very delicious." },
  { pack: 3, meaning: "Dumplings", trees: "jeeaw3 ds", hanzi: "餃子", pinyin: "jiǎo zi", sound: "'<b><u>Gee, aw</u></b>esome foo<b><u>ds</u></b>.'", mnemonic: "Everyone loves dumplings!", exZh: "我們今天晚上吃餃子。", exEn: "We are eating dumplings tonight." },
  { pack: 3, meaning: "Cold (Illness)", trees: "gan3 maw4", hanzi: "感冒", pinyin: "gǎn mào", sound: "'<b><u>gun</u> <u>mall</u></b>'.", mnemonic: "Shock at the mall caused a cold.", exZh: "天冷了，小心別感冒。", exEn: "It's cold, be careful not to catch a cold." },
  { pack: 3, meaning: "Telephone", trees: "deean4 hooah4", hanzi: "電話", pinyin: "diàn huà", sound: "'<b><u>the end</u></b>' + '<b><u>who are</u></b>'.", mnemonic: "Call on the telephone.", exZh: "請給我打個電話。", exEn: "Please give me a phone call." },
  { pack: 3, meaning: "Got it.", trees: "Ting der-oong3 Ler", hanzi: "聽懂了", pinyin: "tīng dǒng le", sound: "Shou<b><u>ting</u></b> '<b><u>don't</u></b> <b><u>love</u></b>'.", mnemonic: "Once you hear it, you've got it!", exZh: "老師講的課我都聽懂了！", exEn: "I understood everything the teacher taught!" }
];

let unlockState = {
  rateUnlocked: localStorage.getItem('tp_rate_unlocked') === 'true',
  shareUnlocked: localStorage.getItem('tp_share_unlocked') === 'true',
  vipUnlocked: localStorage.getItem('tp_vip_pro_unlocked') === 'true',
  myInviteCode: localStorage.getItem('tp_my_invite_code') || ''
};
if (!/^PIN[A-Z0-9]{4}$/.test(unlockState.myInviteCode)) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = 'PIN';
  for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  unlockState.myInviteCode = code;
  localStorage.setItem('tp_my_invite_code', code);
}
document.getElementById('myInviteCodeText').innerText = unlockState.myInviteCode;

function getShareMessage() {
  return `Learn Chinese pronunciation effortlessly with English phonics! Use my referral code ${unlockState.myInviteCode} on Trees Pinyin: https://www.treespinyin.com`;
}

function renderMnemonicsPack() {
  const selEl = document.getElementById('packSelect');
  if (!selEl) return;
  const packVal = selEl.value;
  const query = (document.getElementById('mnemonicSearchInput')?.value || '').trim().toLowerCase();
  const grid = document.getElementById('mnemonicCardsContainer');
  const lockedBox = document.getElementById('mnemonicLockedBox');
  if (!grid || !lockedBox) return;
  grid.innerHTML = '';

  if (!query && packVal !== 'all') {
    const packId = parseInt(packVal, 10) || 1;
    const isLocked = (packId === 2 && !unlockState.rateUnlocked && !unlockState.vipUnlocked) ||
                     (packId === 3 && !unlockState.shareUnlocked && !unlockState.vipUnlocked);
    if (isLocked) {
      grid.classList.add('hidden');
      lockedBox.classList.remove('hidden');
      lockedBox.innerHTML = `<h3 style="margin:0 0 8px 0; color:#bf360c;">🔒 Pack ${packId} Locked</h3><p style="margin:0; font-size:0.9rem;">Click Rate or Share above to unlock!</p>`;
      return;
    }
  }

  lockedBox.classList.add('hidden');
  grid.classList.remove('hidden');

  const filtered = FULL_45_BOOK_MNEMONICS.filter(c => {
    if (query) {
      return c.meaning.toLowerCase().includes(query) || c.hanzi.includes(query) ||
             convertScript(c.hanzi, 'simp').includes(query) || c.exZh.includes(query) ||
             c.exEn.toLowerCase().includes(query) || c.trees.toLowerCase().includes(query);
    }
    if (packVal === 'all') return true;
    return c.pack === parseInt(packVal, 10);
  });

  filtered.forEach((card, i) => {
    const dispHanzi = convertScript(card.hanzi, currentScriptMode);
    const dispExZh = convertScript(card.exZh, currentScriptMode);
    const el = document.createElement('div');
    el.className = 'mnemonic-card';
    el.innerHTML = `
      <div class="mc-top">
        <div class="mc-meaning">#${i + 1} ${card.meaning}</div>
        <div style="display:flex; justify-content:space-between; width:100%; align-items:baseline;">
          <span class="mc-trees"><i><b>${card.trees}</b></i></span>
          <span class="mc-hanzi" style="cursor:pointer;" onclick="speakSingleChar('${card.hanzi}')">🔊 (${dispHanzi} / ${card.pinyin})</span>
        </div>
      </div>
      <div class="mc-sound"><b>Sound:</b> ${card.sound}</div>
      <div class="mc-tip"><b>Mnemonic:</b> ${card.mnemonic}</div>
      <div style="background:#f8fafc; padding:8px 10px; border-radius:10px; border:1px dashed #cbd5e1; font-size:0.83rem; margin-top:auto;">
        <div style="font-weight:700; cursor:pointer;" onclick="speakSingleChar('${card.exZh}')">🔊 ${dispExZh}</div>
        <div style="color:#444;">${card.exEn}</div>
      </div>
    `;
    grid.appendChild(el);
  });
}

function handleRateUnlock() {
  unlockState.rateUnlocked = true;
  localStorage.setItem('tp_rate_unlocked', 'true');
  document.getElementById('packSelect').value = '2';
  renderMnemonicsPack();
  window.open(getStoreReviewUrl(), '_blank');
}

function openShareAppModal() {
  const msg = getShareMessage();
  navigator.clipboard.writeText(msg).catch(() => {});
  unlockState.shareUnlocked = true;
  localStorage.setItem('tp_share_unlocked', 'true');
  document.getElementById('packSelect').value = '3';
  renderMnemonicsPack();

  document.getElementById('modalShareCode').innerText = unlockState.myInviteCode;
  const encMsg = encodeURIComponent(msg);
  const encUrl = encodeURIComponent('https://www.treespinyin.com');
  document.getElementById('shareWhatsApp').href = `https://api.whatsapp.com/send?text=${encMsg}`;
  document.getElementById('shareTwitter').href = `https://twitter.com/intent/tweet?text=${encMsg}`;
  document.getElementById('shareFacebook').href = `https://www.facebook.com/sharer/sharer.php?u=${encUrl}`;
  document.getElementById('shareTelegram').href = `https://t.me/share/url?url=${encUrl}&text=${encMsg}`;
  document.getElementById('shareEmail').href = `mailto:?subject=${encodeURIComponent('Learn Mandarin with Trees Pinyin')}&body=${encMsg}`;
  document.getElementById('shareAppModal').style.display = 'flex';
}

async function triggerNativeSystemShare() {
  const msg = getShareMessage();
  if (navigator.share) {
    try { await navigator.share({ title: 'Trees Pinyin', text: msg, url: 'https://www.treespinyin.com' }); } catch (e) {}
  } else { copyShareTextOnly(); }
}

function copyShareTextOnly() {
  navigator.clipboard.writeText(getShareMessage()).catch(() => {});
  alert(currentLang === 'en' ? 'Copied!' : '已複製！');
}

function handleActivateFriendCode() {
  unlockState.rateUnlocked = true;
  unlockState.shareUnlocked = true;
  unlockState.vipUnlocked = true;
  localStorage.setItem('tp_rate_unlocked', 'true');
  localStorage.setItem('tp_share_unlocked', 'true');
  localStorage.setItem('tp_vip_pro_unlocked', 'true');
  document.getElementById('packSelect').value = 'all';
  renderMnemonicsPack();
}

function renderPersonalStudyLog() {
  const log = JSON.parse(localStorage.getItem('tp_personal_tricky_log_v1') || '[]');
  const box = document.getElementById('personalTrickyList');
  box.innerHTML = '';
  if (log.length === 0) {
    box.innerHTML = `<div style="padding:14px; color:#888; text-align:center;">No records yet.</div>`;
    return;
  }
  log.forEach(item => appendSentenceProgressive(item.zh, item.en, 'personalTrickyList'));
}

function activateVipProCode() {
  unlockState.vipUnlocked = true;
  localStorage.setItem('tp_vip_pro_unlocked', 'true');
  document.getElementById('vipStatusBadge').innerText = '💎 VIP Pro';
}

function clearPersonalStudyLog() {
  localStorage.removeItem('tp_personal_tricky_log_v1');
  renderPersonalStudyLog();
}

// =========================================================================
// 9. 朗讀與彈窗控制
// =========================================================================
let isSpeakingNow = false;
function toggleSpeak() {
  if (!('speechSynthesis' in window)) return;
  const btn = document.getElementById('speakBtn');
  const t = UI_TEXT[currentLang];
  if (window.speechSynthesis.speaking || isSpeakingNow) {
    window.speechSynthesis.cancel();
    isSpeakingNow = false;
    btn.innerText = t.speakBtn;
    return;
  }
  const blocks = document.querySelectorAll('#annotationList .sentence-block');
  let allZh = Array.from(blocks).map(b => b.dataset.zh).join('。');
  if (!allZh) allZh = document.getElementById('userInput').value;
  if (!allZh) return;
  if (checkAndWarnProfanity(allZh)) return;

  speakSingleChar(allZh);
}

function updateFontSize(val) {
  document.getElementById('fontValDisplay').innerText = val + 'px';
  document.getElementById('sheetCard').style.setProperty('--user-font-size', val + 'px');
}
function updateLayoutMode() {
  document.getElementById('sheetCard').classList.toggle('align-left', document.getElementById('layoutSelect').value === 'left');
}
function updatePrintTitle(val) {
  const el = document.getElementById('printHeaderTitle');
  const v = (val || '').trim();
  el.innerText = v;
  el.classList.toggle('has-title', Boolean(v));
  el.style.display = v ? 'block' : 'none';
}
function openFileMenuModal() { document.getElementById('fileMenuModal').style.display = 'flex'; }
function triggerDocUpload() { document.getElementById('fileMenuModal').style.display = 'none'; document.getElementById('docFileInput').click(); }
function openCameraNoticeModal() { document.getElementById('fileMenuModal').style.display = 'none'; document.getElementById('cameraNoticeModal').style.display = 'flex'; }
function triggerGalleryPick() { document.getElementById('cameraNoticeModal').style.display = 'none'; document.getElementById('galleryInput').click(); }
function triggerDirectCamera() {
  document.getElementById('cameraNoticeModal').style.display = 'none';
  if (typeof openLiveCameraModal === 'function') {
    openLiveCameraModal();
  } else {
    document.getElementById('cameraInput').click();
  }
}

function openInstallModal() { document.getElementById('installModal').style.display = 'flex'; }
function openKeyModal() {
  document.getElementById('apiKeyInput').value = backupKey;
  const st = document.getElementById('keyTestStatus');
  if (st) st.style.display = 'none';
  document.getElementById('keyModal').style.display = 'flex';
}
async function saveBackupKey() {
  const rawVal = (document.getElementById('apiKeyInput').value || '').replace(/\s+/g, '');
  const st = document.getElementById('keyTestStatus');
  if (st) st.style.display = 'block';

  if (!rawVal) {
    clearBackupKey();
    if (st) st.innerText = 'Cleared.';
    return;
  }

  if (st) {
    st.style.color = '#1e40af';
    st.innerText = '🔍 Verifying Key with Google AI Studio...';
  }

  backupKey = rawVal;
  modelsDiscoveredForKey = '';
  try {
    localStorage.setItem('tp_v22_backup_key', backupKey);
    localStorage.setItem('tp_test_gemini_key', backupKey);
  } catch (e) {}
  refreshKeyBtnStyle();

  const models = await discoverAuthorizedModels(backupKey);
  if (modelsDiscoveredForKey === backupKey && models.length > 0) {
    if (st) {
      st.style.color = '#166534';
      st.innerText = `✅ Key Verified! Active models: ${models.slice(0, 3).join(', ')}`;
    }
    setTimeout(() => {
      document.getElementById('keyModal').style.display = 'none';
      const pendingQ = document.getElementById('userInput').value.trim();
      if (pendingQ) runSmartAI(pendingQ);
    }, 600);
  } else {
    if (st) {
      st.style.color = '#b91c1c';
      st.innerText = '⚠️ Could not verify key (check if key is valid or network blocks googleapis.com).';
    }
  }
}
function clearBackupKey() {
  backupKey = '';
  modelsDiscoveredForKey = '';
  try {
    localStorage.removeItem('tp_v22_backup_key');
    localStorage.removeItem('tp_test_gemini_key');
    localStorage.removeItem('tp_v15_discovered_models');
  } catch (e) {}
  document.getElementById('apiKeyInput').value = '';
  const st = document.getElementById('keyTestStatus');
  if (st) st.style.display = 'none';
  refreshKeyBtnStyle();
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    const savedLang = localStorage.getItem('tp_spoken_lang');
    if (savedLang === 'zh' || savedLang === 'en') setVoiceLangMode(savedLang);
  } catch (e) {}
});
