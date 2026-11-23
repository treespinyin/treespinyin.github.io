/**
 * Trees Pinyin 趣味社群記憶庫、聲調防踩雷劇場與 30 秒通關挑戰資料 (js/fun-data.js - v5.2.1)
 * - 100% 原樣保留作者原書中的底線 (<u>...</u>) 與靜音括弧 ((l), (d), (r), (s), (te)...) 教學標記
 * - 精選 100 組最貼近英文諧音、最爆笑的單詞/短語記憶法（精選自《Easy Mandarin Speaking》與《Easy Mandarin Tones》，其餘完整 300+ 詞彙與聲調群組保留予亞馬遜實體書）
 * - 18 組西方學員最愛笑的「聲調鬧笑話」(Tone Traps)
 * - 6 組零成本「30 秒李白 / 點餐」即時語音通關挑戰
 */
(function(global) {
  if (global.TreesFunData) return;

  const AMAZON_BOOK_URL = 'https://www.amazon.com/dp/B0HCXLCK3K';

  // 精選 15 張官方試讀樣卡（涵蓋 6 大分類，嚴格控制在亞馬遜電子書試讀安全比例內，完整詞庫請見 Amazon 電子書）
  const SEED_MNEMONICS = [
    // === 1. Food & Dining (爆笑美食篇) ===
    { id: 'm001', hanzi: '買單', trees: 'Mie3 dan', pinyin: 'mǎi dān', meaning: 'Check, please!', hook: '<u>My</u> <u>done</u>', mnemonic: 'Sounds like "<u>My</u> <u>done</u>". Check, please. I\'m all <u>done</u>!', category: 'Food', author: 'Author Pick', likes: 248 },
    { id: 'm002', hanzi: '麻婆豆腐', trees: 'mah2 pooer2 doh4 foo', pinyin: 'má pó dòu fu', meaning: 'Mapo Tofu', hook: '<u>Ma</u> <u>poor</u> <u>dough</u> <u>foo</u>(d)', mnemonic: '<u>Ma</u>\'s <u>poor</u> <u>dough</u> <u>foo</u>(d) was our daily staple.', category: 'Food', author: 'Author Pick', likes: 231 },
    { id: 'm008', hanzi: '一杯', trees: 'yee4 bay', pinyin: 'yì bēi', meaning: 'A cup of', hook: '<u>eBay</u>', mnemonic: 'Sounds like "<u>eBay</u>". Your cup and coffee are all from <u>eBay</u>!', category: 'Food', author: 'Author Pick', likes: 236 },

    // === 2. Everyday & Viral Phrases (爆笑日常篇) ===
    { id: 'm023', hanzi: '來自', trees: 'Lie2 ds4', pinyin: 'lái zì', meaning: 'Come from', hook: '<u>Lies</u>', mnemonic: 'The truth <u>LIES</u> in where you come FROM.', category: 'Everyday', author: 'Author Pick', likes: 267 },
    { id: 'm024', hanzi: '哪裡', trees: 'nah3 Lee3', pinyin: 'nǎ lǐ', meaning: 'Where', hook: '(G)<u>narly</u>', mnemonic: 'Sounds like "G<u>narly</u>" without "G". If you don\'t know WHERE you are, things are getting G<u>NARLY</u>.', category: 'Everyday', author: 'Author Pick', likes: 254 },
    { id: 'm025', hanzi: '不客氣', trees: 'Boo2 ker4 tsee', pinyin: 'bú kè qi', meaning: 'You\'re welcome', hook: '<u>Boo Cur—tsy</u>', mnemonic: 'When someone thanks you, imagine she is performing a graceful curtsy and you say "<u>Boo Curtsy</u>" ("Don\'t do this curtsy!").', category: 'Everyday', author: 'Author Pick', likes: 242 },

    // === 3. Travel, Places & Survival (旅遊實用篇) ===
    { id: 'm061', hanzi: '遊客', trees: 'yoh2 ker4', pinyin: 'yóu kè', meaning: 'Tourist', hook: '<u>Yogur</u>(t)', mnemonic: 'Sounds like "<u>Yogur</u>(t)". The tourists with <u>yogur</u>(t) lined up for Kobe beef!', category: 'Travel', author: 'Author Pick', likes: 259 },
    { id: 'm064', hanzi: '拍照', trees: 'pie (r)dsaw4', pinyin: 'pāi zhào', meaning: 'Take a photo', hook: '<u>pie</u> + <u>jaw</u>', mnemonic: 'Before eating the <u>pie</u>, take a photo. After eating the <u>pie</u>, you\'ll be looking for your <u>jaw</u> on the floor.', category: 'Travel', author: 'Author Pick', likes: 208 },
    { id: 'm066', hanzi: '地址', trees: 'dee4 (r)ds3', pinyin: 'dì zhǐ', meaning: 'Address', hook: '<u>deeds</u>', mnemonic: 'Sounds like "<u>deeds</u>". Different <u>deeds</u>, different addresses.', category: 'Travel', author: 'Author Pick', likes: 214 },

    // === 4. People, Pronouns & Relationships (人物社交篇) ===
    { id: 'm079', hanzi: '朋友', trees: 'per-ng2 yoh3', pinyin: 'péng you', meaning: 'Friend', hook: '<u>peng</u>(uin) <u>you</u>', mnemonic: 'Sounds like the underlined parts of "<u>peng</u>uin <u>you</u>"!', category: 'People', author: 'Author Pick', likes: 221 },
    { id: 'm083', hanzi: '姓名', trees: 'sing4 ming2', pinyin: 'xìng míng', meaning: 'Full Name', hook: '<u>Sing</u> + Yao <u>Ming</u>', mnemonic: '<u>Sing</u> one\'s name out like "Yao <u>Ming</u>".', category: 'People', author: 'Author Pick', likes: 193 },

    // === 5. Culture, History & Landmarks (文化古蹟篇) ===
    { id: 'm089', hanzi: '龍椅', trees: 'Ler-oong2 yee3', pinyin: 'lóng yǐ', meaning: 'Emperor\'s Dragon Throne', hook: '<u>LONE</u>(L)<u>Y</u>', mnemonic: 'Sounds like <u>LONE</u>(L)<u>Y</u> without "L". The One on the Throne is <u>lone</u>(l)<u>y</u>.', category: 'Culture', author: 'Author Pick', likes: 244 },
    { id: 'm090', hanzi: '午門', trees: 'woo3 mer-n2', pinyin: 'wǔ mén', meaning: 'The Meridian Gate', hook: '<u>woman</u>', mnemonic: 'Sounds like "<u>woman</u>". A <u>woman</u> at her meridian is both the navigator and the destination.', category: 'Culture', author: 'Author Pick', likes: 217 },

    // === 6. Numbers & Power Anchors (數字神錨篇) ===
    { id: 'm097', hanzi: '六', trees: 'Leeoh4', pinyin: 'liù', meaning: 'Six (6) / Awesome!', hook: '<u>Leo</u>', mnemonic: 'Sounds like "<u>Leo</u>". If somebody shouts "666" at you in China, it means you are awesome / a pro / a <u>Leo</u>!', category: 'Numbers', author: 'Author Pick', likes: 226 },
    { id: 'm098', hanzi: '八', trees: 'bah', pinyin: 'bā', meaning: 'Eight (8) / Lucky', hook: '<u>ba</u>(r)', mnemonic: 'Sounds like "<u>ba</u>(r)" without "r". Imagine a <u>ba</u>(r) full of lucky people drinking and celebrating!', category: 'Numbers', author: 'Author Pick', likes: 210 }
  ];

  // 18 組西方人最爆笑的「聲調鬧笑話」防踩雷小劇場 (Tone Traps)
  const TONE_TRAPS = [
    {
      id: 'tt1',
      title: 'Ordering Dumplings... or Asking to Sleep Together?!',
      safe: { hz: '水餃', trees: '(r)sooay3 jeeaw3', py: 'shuǐ jiǎo', en: 'Dumplings 🥟' },
      trap: { hz: '睡覺', trees: '(r)sooay4 jeeaw4', py: 'shuì jiào', en: 'Go to sleep / Sleep together 😳' },
      joke: 'At a restaurant: "How much for one night of sleep?" vs "How much for dumplings?" Watch that falling tone 4!'
    },
    {
      id: 'tt2',
      title: 'Excuse Me... or Can I Kiss You?!',
      safe: { hz: '請問', trees: 'tsing3 wer-n4', py: 'qǐng wèn', en: 'Excuse me / May I ask 🙋' },
      trap: { hz: '親吻', trees: 'tseen wer-n3', py: 'qīn wěn', en: 'Kiss / French kiss 😘' },
      joke: 'Walking up to a stranger in Beijing: "Excuse me..." accidentally becomes "Can I kiss you?!"'
    },
    {
      id: 'tt3',
      title: 'Do You Want to BUY It or SELL It?',
      safe: { hz: '買', trees: 'mie3', py: 'mǎi', en: 'Buy 🛍️' },
      trap: { hz: '賣', trees: 'mie4', py: 'mài', en: 'Sell 🏷️' },
      joke: 'Low dipping tone 3 = "MY" (buy). Sharp falling tone 4 = "Bye-bye" (sell)!'
    },
    {
      id: 'tt4',
      title: 'Mom Scolds the Horse (The Classic Tone Boss)',
      safe: { hz: '媽媽', trees: 'mah mah', py: 'mā ma', en: 'Mom 👩' },
      trap: { hz: '罵馬', trees: 'mah4 mah3', py: 'mà mǎ', en: 'Scold a horse 🐴🤬' },
      joke: 'Flat high tone = sweet Mom. Angry dropping tone 4 + dipping 3 = yelling at a horse!'
    },
    {
      id: 'tt5',
      title: 'Cute Panda... or Hairy Chest?!',
      safe: { hz: '熊貓', trees: 'seer-oong2 maw', py: 'xióng māo', en: 'Giant Panda 🐼' },
      trap: { hz: '胸毛', trees: 'seer-oong maw2', py: 'xiōng máo', en: 'Chest hair 🧔' },
      joke: 'Never tell a zoo guide "I flew all the way to China to touch your chest hair!"'
    },
    {
      id: 'tt6',
      title: 'I Want Hot Soup... or Pure Sugar?',
      safe: { hz: '湯', trees: 'tang', py: 'tāng', en: 'Soup 🍜' },
      trap: { hz: '糖', trees: 'tang2', py: 'táng', en: 'Sugar / Candy 🍬' },
      joke: 'High level "tang" = piping hot soup. Rising "tang2" = sweet candy!'
    },
    {
      id: 'tt7',
      title: 'My Stomach Hurts... or My Rabbit Hurts?',
      safe: { hz: '肚子', trees: 'doo4 ds', py: 'dù zi', en: 'Stomach / Belly 🫃' },
      trap: { hz: '兔子', trees: 'too4 ds', py: 'tù zi', en: 'Rabbit 🐰' },
      joke: 'At the doctor: "Doctor, my rabbit hurts!" — check the puff of air on "t" vs "d"!'
    },
    {
      id: 'tt8',
      title: 'Pass Me a Cup... or a Quilt?!',
      safe: { hz: '杯子', trees: 'bay ds', py: 'bēi zi', en: 'Cup / Mug ☕' },
      trap: { hz: '被子', trees: 'bay4 ds', py: 'bèi zi', en: 'Quilt / Blanket 🛏️' },
      joke: 'Asking the waiter for a blanket to pour your coffee into will definitely get laughs.'
    },
    {
      id: 'tt9',
      title: 'I Lost My Glasses... or My Eyeballs?!',
      safe: { hz: '眼鏡', trees: 'yan3 jing4', py: 'yǎn jìng', en: 'Eyeglasses 👓' },
      trap: { hz: '眼睛', trees: 'yan3 jing', py: 'yǎn jing', en: 'Eyes 👀' },
      joke: '"Wait, I dropped my eyeballs on the subway!" Tone 4 on "jing4" saves you from horror-movie vibes.'
    },
    {
      id: 'tt10',
      title: 'Calling Your Boss... Your Spouse?!',
      safe: { hz: '老闆', trees: 'Law3 ban3', py: 'lǎo bǎn', en: 'Boss 👔' },
      trap: { hz: '老伴', trees: 'Law3 ban4', py: 'lǎo bàn', en: 'Old spouse / Lifelong partner 💑' },
      joke: 'Drop that second tone from 3 to 4 and you just proposed to your boss in front of HR!'
    },
    {
      id: 'tt11',
      title: 'Buy New Shoes... or Buy Kids?!',
      safe: { hz: '鞋子', trees: 'seer2 ds', py: 'xié zi', en: 'Shoes 👟' },
      trap: { hz: '孩子', trees: 'hie2 ds', py: 'hái zi', en: 'Children 👶' },
      joke: '"I want to buy two pairs of children, size 10 please!"'
    },
    {
      id: 'tt12',
      title: 'Give a Report... or Hug a Dog?',
      safe: { hz: '報告', trees: 'baw4 gaw4', py: 'bào gào', en: 'Report / Presentation 📊' },
      trap: { hz: '抱狗', trees: 'baw4 goh3', py: 'bào gǒu', en: 'Hug a dog 🐶' },
      joke: '"Boss, I need to hug a dog in the meeting at 3 PM!"'
    },
    {
      id: 'tt13',
      title: 'A Ferocious Lion... or a Sweet Persimmon?',
      safe: { hz: '獅子', trees: '(r)s ds', py: 'shī zi', en: 'Lion 🦁' },
      trap: { hz: '柿子', trees: '(r)s4 ds', py: 'shì zi', en: 'Persimmon fruit 🍅' },
      joke: 'Eating lions for dessert vs petting persimmons at the safari!'
    },
    {
      id: 'tt14',
      title: 'My Wife... or a Bottle Opener?!',
      safe: { hz: '妻子', trees: 'tsee ds', py: 'qī zi', en: 'Wife 💍' },
      trap: { hz: '起子', trees: 'tsee3 ds', py: 'qǐ zi', en: 'Bottle opener 🍾' },
      joke: 'Never introduce your wife at a dinner party as "my favorite bottle opener"!'
    },
    {
      id: 'tt15',
      title: 'Four (4) vs Ten (10) — The Price Tag Trap!',
      safe: { hz: '四', trees: 's4', py: 'sì', en: 'Four (4) 4️⃣' },
      trap: { hz: '十', trees: '(r)s2', py: 'shí', en: 'Ten (10) 🔟' },
      joke: 'Confuse 44 and 10 at a street market and you might accidentally pay 2.5x the price!'
    },
    {
      id: 'tt16',
      title: 'Eight (8) vs Dad (爸)',
      safe: { hz: '八', trees: 'bah', py: 'bā', en: 'Eight (8) 8️⃣' },
      trap: { hz: '爸', trees: 'bah4', py: 'bà', en: 'Dad 👨' },
      joke: 'High flat "bah" = lucky 8 at the bar. Falling "bah4" = calling your Dad!'
    },
    {
      id: 'tt17',
      title: 'My Husband... or Manual Laborer?',
      safe: { hz: '老公', trees: 'Law3 ger-oong', py: 'lǎo gōng', en: 'Husband 🤵' },
      trap: { hz: '勞工', trees: 'Law2 ger-oong', py: 'láo gōng', en: 'Laborer 👷' },
      joke: 'Switch tone 3 to tone 2 and your romantic "hubby" instantly turns into "workforce"!'
    },
    {
      id: 'tt18',
      title: 'Take a Rest... or Fix My Shoes?',
      safe: { hz: '休息', trees: 'seeoh see3', py: 'xiū xi', en: 'Take a rest 🛋️' },
      trap: { hz: '修鞋', trees: 'seeoh seer2', py: 'xiū xié', en: 'Repair shoes 👞' },
      joke: '"I\'m exhausted, I\'m going home to repair shoes!"'
    }
  ];

  // 6 組「30 秒即時通關挑戰卡」(零伺服器成本，瀏覽器 Web Speech API 音節比對)
  const CHALLENGES_30S = [
    {
      id: 'ch_libai',
      badge: '🏆 Li Bai Poet Badge',
      title: '30s Li Bai Challenge: 《靜夜思》',
      subtitle: 'Read China\'s most famous poem in 30 seconds — native speakers will understand you!',
      lines: [
        { zh: '床前明月光，', en: 'Before my bed, the bright moonlight shines,' },
        { zh: '疑是地上霜。', en: 'I wonder if it is frost upon the ground.' },
        { zh: '舉頭望明月，', en: 'I raise my head to gaze at the bright moon,' },
        { zh: '低頭思故鄉。', en: 'I lower my head and think of my hometown.' }
      ]
    },
    {
      id: 'ch_boba',
      badge: '🧋 Boba Master Badge',
      title: '30s Restaurant Boss: Boba & Dumplings',
      subtitle: 'Order milk tea, mildly spicy dumplings, and ask for the check like a local!',
      lines: [
        { zh: '請問，我要一杯奶茶。', en: 'Excuse me, I would like one cup of milk tea.' },
        { zh: '還要一盤微辣的餃子。', en: 'And also a plate of mildly spicy dumplings.' },
        { zh: '非常好吃，謝謝！買單！', en: 'So delicious, thank you! Check please!' }
      ]
    },
    {
      id: 'ch_chunxiao',
      badge: '🌸 Tang Poet Badge',
      title: '30s Tang Poem: 《春曉》Spring Dawn',
      subtitle: 'Master Meng Haoran\'s classic spring morning poem in one take!',
      lines: [
        { zh: '春眠不覺曉，', en: 'Sleeping in spring, unaware of the dawn,' },
        { zh: '處處聞啼鳥。', en: 'Everywhere I hear birds singing.' },
        { zh: '夜來風雨聲，', en: 'In the night came the sound of wind and rain,' },
        { zh: '花落知多少。', en: 'How many blossoms have fallen?' }
      ]
    },
    {
      id: 'ch_goose',
      badge: '🦢 Viral Classic Badge',
      title: '30s Kid Prodigy Poem: 《詠鵝》',
      subtitle: 'Written by a 7-year-old poet — super fun rhythm for TikTok!',
      lines: [
        { zh: '鵝，鵝，鵝，', en: 'Goose, goose, goose,' },
        { zh: '曲項向天歌。', en: 'Curving your neck, singing toward the sky.' },
        { zh: '白毛浮綠水，', en: 'White feathers float on emerald water,' },
        { zh: '紅掌撥清波。', en: 'Red webbed feet paddle clear ripples.' }
      ]
    },
    {
      id: 'ch_travel',
      badge: '✈️ China Traveler Badge',
      title: '30s Travel Survival: Beijing & Roast Duck',
      subtitle: 'Essential lines to impress everyone on your trip to China!',
      lines: [
        { zh: '你好，我來自美國。', en: 'Hello, I come from the United States.' },
        { zh: '我非常喜歡中國美食和烤鴨。', en: 'I really love Chinese cuisine and roast duck.' },
        { zh: '請問，可以幫我拍張照嗎？', en: 'Excuse me, could you help take a photo for me?' }
      ]
    },
    {
      id: 'ch_social',
      badge: '🤝 Smooth Talker Badge',
      title: '30s Instant Icebreaker: Make Chinese Friends',
      subtitle: 'Go from zero to instant smiles in 30 seconds!',
      lines: [
        { zh: '很高興認識你，我的朋友！', en: 'So glad to meet you, my friend!' },
        { zh: '你的中文說得真好，不客氣。', en: 'Your Chinese is great — you\'re welcome.' },
        { zh: '我們加個微信吧，再見！', en: 'Let\'s add each other on WeChat, see you!' }
      ]
    }
  ];

  const DAILY_DUEL_WORDS = [
    { hanzi: '買單', trees: 'Mie3 dan', pinyin: 'mǎi dān', meaning: 'Check, please!' },
    { hanzi: '遊客', trees: 'yoh2 ker4', pinyin: 'yóu kè', meaning: 'Tourist' },
    { hanzi: '不客氣', trees: 'Boo2 ker4 tsee', pinyin: 'bú kè qi', meaning: 'You\'re welcome' },
    { hanzi: '龍椅', trees: 'Ler-oong2 yee3', pinyin: 'lóng yǐ', meaning: 'Dragon Throne' },
    { hanzi: '麻婆豆腐', trees: 'mah2 pooer2 doh4 foo', pinyin: 'má pó dòu fu', meaning: 'Mapo Tofu' },
    { hanzi: '哪裡', trees: 'nah3 Lee3', pinyin: 'nǎ lǐ', meaning: 'Where' },
    { hanzi: '微信', trees: 'way seen4', pinyin: 'wēi xìn', meaning: 'WeChat' },
    { hanzi: '烤鴨', trees: 'kaw3 yah', pinyin: 'kǎo yā', meaning: 'Roast Duck' },
    { hanzi: '臥室', trees: 'wer4 (r)s4', pinyin: 'wò shì', meaning: 'Bedroom' },
    { hanzi: '來自', trees: 'Lie2 ds4', pinyin: 'lái zì', meaning: 'Come from' },
    { hanzi: '一杯', trees: 'yee4 bay', pinyin: 'yì bēi', meaning: 'A cup of' },
    { hanzi: '別生氣', trees: 'Beer2 (r)ser-ng tsee4', pinyin: 'bié shēng qì', meaning: 'Don\'t be angry' },
    { hanzi: '午門', trees: 'woo3 mer-n2', pinyin: 'wǔ mén', meaning: 'The Meridian Gate' },
    { hanzi: '朋友', trees: 'per-ng2 yoh3', pinyin: 'péng you', meaning: 'Friend' }
  ];

  function getTodayDuelWord() {
    const dayIdx = Math.floor(Date.now() / 86400000) % DAILY_DUEL_WORDS.length;
    return DAILY_DUEL_WORDS[dayIdx];
  }

  function getForestBadge(totalLikes) {
    if (totalLikes >= 500) return { label: 'Forest Builder', icon: '🌳', color: '#1b5e20' };
    if (totalLikes >= 150) return { label: 'Sapling', icon: '🌿', color: '#2e7d32' };
    return { label: 'Seedling', icon: '🌱', color: '#558b2f' };
  }

  global.TreesFunData = {
    AMAZON_BOOK_URL,
    SEED_MNEMONICS,
    TONE_TRAPS,
    CHALLENGES_30S,
    DAILY_DUEL_WORDS,
    getTodayDuelWord,
    getForestBadge
  };
})(typeof window !== 'undefined' ? window : self);
