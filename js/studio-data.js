/**
 * Trees Pinyin Studio — Module 1: Static Data (Classics, 45 Mnemonic Cards, Bilingual UI Text)
 */
// =========================================================================
// 1. 精準名家古詩文與經典庫 (14 篇完整離線秒回)
// =========================================================================
const VERIFIED_CLASSICS = [
  {
    match: /靜夜思|静夜思|床前明月光|\bquiet night thoughts\b/i,
    title: "《靜夜思》唐·李白 · 'Quiet Night Thoughts' by Li Bai",
    lines: [
      { zh: "床前明月光，", en: "Bright moonlight shines right before my bed," },
      { zh: "疑是地上霜。", en: "Looking just like a layer of white frost on the ground." },
      { zh: "舉頭望明月，", en: "I raise my head to gaze at the glowing moon," },
      { zh: "低頭思故鄉。", en: "Then lower my head, thinking of my hometown." }
    ]
  },
  {
    match: /望廬山瀑布|望庐山瀑布|飛流直下三千尺/i,
    title: "《望廬山瀑布》唐·李白 · 'Viewing the Lushan Waterfall' by Li Bai",
    lines: [
      { zh: "日照香爐生紫煙，", en: "Sunlight shines on Incense Burner Peak, kindling purple mist," },
      { zh: "遙看瀑布掛前川。", en: "From afar I watch the waterfall hanging like a river before the cliff." },
      { zh: "飛流直下三千尺，", en: "Its flying torrent plunges straight down three thousand feet," },
      { zh: "疑是銀河落九天。", en: "As if the Milky Way were falling from the highest heavens." }
    ]
  },
  {
    match: /早發白帝城|早发白帝城|朝辭白帝彩雲間|兩岸猿聲啼不住/i,
    title: "《早發白帝城》唐·李白 · 'Departing from Baidi City at Dawn' by Li Bai",
    lines: [
      { zh: "朝辭白帝彩雲間，", en: "At dawn I leave Baidi City amidst the glowing clouds," },
      { zh: "千里江陵一日還。", en: "A thousand miles to Jiangling I return in a single day." },
      { zh: "兩岸猿聲啼不住，", en: "The cries of monkeys along both banks never cease," },
      { zh: "輕舟已過萬重山。", en: "While my light boat has already slipped past ten thousand mountains." }
    ]
  },
  {
    match: /贈汪倫|赠汪伦|桃花潭水深千尺/i,
    title: "《贈汪倫》唐·李白 · 'To Wang Lun' by Li Bai",
    lines: [
      { zh: "李白乘舟將欲行，", en: "I, Li Bai, sit aboard a boat about to set off," },
      { zh: "忽聞岸上踏歌聲。", en: "When suddenly I hear the sound of singing and dancing on the shore." },
      { zh: "桃花潭水深千尺，", en: "The Peach Blossom Pool is a thousand feet deep," },
      { zh: "不及汪倫送我情。", en: "Yet not as deep as the farewell love Wang Lun shows to me." }
    ]
  },
  {
    match: /春夜喜雨|好雨知時節/i,
    title: "《春夜喜雨》唐·杜甫 · 'Happy Rain on a Spring Night' by Du Fu",
    lines: [
      { zh: "好雨知時節，", en: "The good rain knows its proper season," },
      { zh: "當春乃發生。", en: "Right in spring it comes to bring new life." },
      { zh: "隨風潛入夜，", en: "With the breeze it steals in softly by night," },
      { zh: "潤物細無聲。", en: "Moistening all things gently and without a sound." }
    ]
  },
  {
    match: /相思|紅豆生南國/i,
    title: "《相思》唐·王維 · 'Love Seeds' by Wang Wei",
    lines: [
      { zh: "紅豆生南國，", en: "Red beans grow in the southern lands," },
      { zh: "春來發幾枝。", en: "When spring arrives, how many new branches will sprout?" },
      { zh: "願君多採擷，", en: "I wish you would gather plenty of them," },
      { zh: "此物最相思。", en: "For these fond tokens best awaken longing." }
    ]
  },
  {
    match: /梅花|詠梅|咏梅|王安石|暗香|\bplum blossom\b/i,
    title: "《梅花》宋·王安石 · 'Plum Blossoms' by Wang Anshi",
    lines: [
      { zh: "牆角數枝梅，", en: "At the corner of the wall stand several branches of plum blossoms," },
      { zh: "凌寒獨自開。", en: "Braving the winter chill, blooming all on their own." },
      { zh: "遙知不是雪，", en: "From afar I know they are not snow," },
      { zh: "為有暗香來。", en: "For a subtle, delicate fragrance drifts through the air." }
    ]
  },
  {
    match: /三字經|三字经|\bthree character classic\b/i,
    title: "《三字經》 · Three Character Classic",
    lines: [
      { zh: "人之初，性本善。性相近，習相遠。", en: "Men at their birth are naturally good. Their natures are much the same; their habits become wide apart." },
      { zh: "苟不教，性乃遷。教之道，貴以專。", en: "If foolishly there is no teaching, the nature will deteriorate. The right way in teaching is to attach the utmost importance to thoroughness." },
      { zh: "昔孟母，擇鄰處。子不學，斷機杼。", en: "Of old, the mother of Mencius chose a neighborhood; when her child would not learn, she broke the shuttle from the loom." },
      { zh: "養不教，父之過。教不嚴，師之惰。", en: "To feed without teaching is the father's fault; to teach without severity is the teacher's laziness." },
      { zh: "玉不琢，不成器。人不學，不知義。", en: "If jade is not polished, it cannot become a thing of use. If a person does not learn, he cannot know righteousness." }
    ]
  },
  {
    match: /千字文|天地玄黃|天地玄黄|\bthousand character classic\b/i,
    title: "《千字文》 · Thousand Character Classic",
    lines: [
      { zh: "天地玄黃，宇宙洪荒。", en: "The sky was dark and the earth yellow; space and time were vast and boundless." },
      { zh: "日月盈昃，辰宿列張。", en: "The sun shines and sets, the moon waxes and wanes; stars and constellations are spread across the sky." },
      { zh: "寒來暑往，秋收冬藏。", en: "Cold comes and summer goes; autumn is for harvesting and winter for storing." }
    ]
  },
  {
    match: /弟子規|弟子规/i,
    title: "《弟子規》 · Standards for Being a Good Student and Child",
    lines: [
      { zh: "弟子規，聖人訓。首孝悌，次謹信。", en: "Standards for students are taught by the sages: first be filial and fraternal, next be cautious and trustworthy." },
      { zh: "汎愛眾，而親仁。有餘力，則學文。", en: "Love all equally and be close to the humane; if you have energy to spare, study literature and arts." }
    ]
  },
  {
    match: /詠鵝|咏鹅|\bode to the goose\b/i,
    title: "《詠鵝》唐·駱賓王 · 'Ode to the Goose' by Luo Binwang",
    lines: [
      { zh: "鵝，鵝，鵝，", en: "Goose, goose, goose," },
      { zh: "曲項向天歌。", en: "You curve your neck and sing toward the sky." },
      { zh: "白毛浮綠水，", en: "Your white feathers float on the green water," },
      { zh: "紅掌撥清波。", en: "While your red webbed feet paddle the clear waves." }
    ]
  },
  {
    match: /春曉|春晓|春眠不覺曉|孟浩然|\bspring morning\b/i,
    title: "《春曉》唐·孟浩然 · 'Spring Morning' by Meng Haoran",
    lines: [
      { zh: "春眠不覺曉，", en: "In spring I sleep soundly without noticing the dawn," },
      { zh: "處處聞啼鳥。", en: "Everywhere I hear the joyful singing of birds." },
      { zh: "夜來風雨聲，", en: "Last night came the sound of wind and rain," },
      { zh: "花落知多少。", en: "Who knows how many blossoms have fallen?" }
    ]
  },
  {
    match: /登鸛雀樓|登鹳雀楼|白日依山盡|王之渙/i,
    title: "《登鸛雀樓》唐·王之渙 · 'On the Stork Tower' by Wang Zhihuan",
    lines: [
      { zh: "白日依山盡，", en: "The bright sun sets behind the mountains," },
      { zh: "黃河入海流。", en: "And the Yellow River flows into the sea." },
      { zh: "欲窮千里目，", en: "To see a thousand miles further," },
      { zh: "更上一層樓。", en: "Climb up one more story of the tower." }
    ]
  },
  {
    match: /水調歌頭|水调歌头|明月幾時有|明月几时有/i,
    title: "《水調歌頭·明月幾時有》宋·蘇軾 · Su Shi's Mid-Autumn Lyric",
    lines: [
      { zh: "明月幾時有？把酒問青天。", en: "When did the bright moon first appear? Raising my cup, I ask the blue sky." },
      { zh: "不知天上宮闕，今夕是何年。", en: "I wonder what year it is tonight in the palaces of heaven." },
      { zh: "人有悲歡離合，月有陰晴圓缺，此事古難全。", en: "People have sorrow and joy, parting and reunion; the moon is dim or bright, waxing or waning—nothing has been perfect since ancient times." },
      { zh: "但願人長久，千里共嬋娟。", en: "May we all live long and share the beauty of the moon, though a thousand miles apart." }
    ]
  },
  {
    match: /中華民國國歌|中华民国国歌|台灣國歌|台湾国歌|三民主義吾黨所宗|\b(?:roc|taiwan|republic of china)\s+national\s+anthem\b/i,
    title: "《中華民國國歌》· National Anthem of the Republic of China",
    lines: [
      { zh: "三民主義，吾黨所宗，", en: "Three Principles of the People, the aim we uphold," },
      { zh: "以建民國，以進大同。", en: "To establish the Republic, to advance into a state of Great Unity." },
      { zh: "咨爾多士，為民前鋒；", en: "Oh, you warriors, be the vanguard for the people;" },
      { zh: "夙夜匪懈，主義是從。", en: "Day and night without slackening, follow the Principles." },
      { zh: "矢勤矢勇，必信必忠；", en: "Swear to be diligent and brave, trustworthy and loyal;" },
      { zh: "一心一德，貫徹始終。", en: "With one heart and one virtue, carry through from beginning to end." }
    ]
  },
  {
    match: /茉莉花|\bjasmine flower\b/i,
    title: "《茉莉花》中國傳統民歌 · 'Jasmine Flower' Traditional Folk Song",
    lines: [
      { zh: "好一朵美麗的茉莉花，", en: "What a beautiful jasmine flower," },
      { zh: "好一朵美麗的茉莉花，", en: "What a beautiful jasmine flower," },
      { zh: "芬芳美麗滿枝椏，", en: "Sweet and lovely, blooming all over the branches," },
      { zh: "又香又白人人誇。", en: "Fragrant and snow-white, praised by everyone." },
      { zh: "讓我來將你摘下，", en: "Let me come and pluck you down," },
      { zh: "送給別人家，", en: "To give as a gift to someone's home," },
      { zh: "茉莉花呀茉莉花。", en: "Oh, jasmine flower, jasmine flower." }
    ]
  },
  {
    match: /三字經|三字经|人之初性本善|\bthree[-\s]character classic\b/i,
    title: "《三字經》開篇 · 'Three-Character Classic' (Opening)",
    lines: [
      { zh: "人之初，性本善。", en: "People at birth are naturally good." },
      { zh: "性相近，習相遠。", en: "Their natures are much the same; their habits grow widely different." },
      { zh: "苟不教，性乃遷。", en: "If foolishly there is no teaching, one's nature deteriorates." },
      { zh: "教之道，貴以專。", en: "The right way in teaching is to value thoroughness and focus." },
      { zh: "玉不琢，不成器。", en: "Jade uncut will not form a useful vessel." },
      { zh: "人不學，不知義。", en: "People who do not learn will not know what is right." }
    ]
  }
];

// =========================================================================
// 2. 原書《Easy Mandarin Speaking》前 45 個核心詞條（含完整雙語例句 exZh / exEn）
// =========================================================================
const EXACT_BOOK_MNEMONICS = {
  packs: [
    {
      packId: 1,
      title: "Pack 1: Everyday Greetings & Polite Expressions (15 Words · Free)",
      free: true,
      cards: [
        { meaning: "Hello / How are you?", trees: "Nee3 haw3", hanzi: "你好", pinyin: "nǐ hǎo", sound: "Similar to '<b><u>knee</u> <u>how</u></b>'.", mnemonic: "<b>Knee</b>ling to show <b>how</b> much respect you have in serious moments. How could you <b><u>knee</u></b>(l) down just to say <b>hello</b>?", exZh: "你好，很高興認識你！", exEn: "Hello, nice to meet you!" },
        { meaning: "You (Second Person Singular)", trees: "nee3", hanzi: "你", pinyin: "nǐ", sound: "Sounds like '<b><u>Knee</u></b>'.", mnemonic: "Imagine '<b><u>Knee</u></b>(l) down while greeting <b>you</b>.'", exZh: "請問你叫什麼名字？", exEn: "May I ask what your name is?" },
        { meaning: "Good", trees: "haw3", hanzi: "好", pinyin: "hǎo", sound: "Similar to '<b><u>how</u></b>'.", mnemonic: "'<b>Good</b>' is a standard response to a greeting ('<i><b>Nee3 haw3</b></i>' literally means '<b>You good</b>').", exZh: "今天天氣真好！", exEn: "The weather is really good today!" },
        { meaning: "Good morning.", trees: "Dsaw3 (r)sang4 haw3", hanzi: "早上好", pinyin: "zǎo shang hǎo", sound: "'<i><b>dsaw3 (r)sang4</b></i>' (morning) sounds like '<b><u>jaw</u> <u>sang</u></b>'.", mnemonic: "The <b>morning</b> movements of yawning: your <b><u>jaw</u> <u>sang</u></b>!", exZh: "老師早上好！", exEn: "Good morning, teacher!" },
        { meaning: "Big", trees: "dah4", hanzi: "大", pinyin: "dà", sound: "'<i><b>dah4</b></i>' is similar to the first part of '<b><u>do</u></b>zen'.", mnemonic: "Our <b>big</b> family eats a <b><u>do</u></b>zen eggs every morning.", exZh: "這個蘋果非常大。", exEn: "This apple is very big." },
        { meaning: "Home / Family", trees: "jeeah", hanzi: "家", pinyin: "jiā", sound: "'<i><b>jeeah</b></i>' is a rapid contraction of '<b><u>Gee</u></b>' and '<b><u>Ah</u></b>', which is similar to '<b>jar</b>'.", mnemonic: "<b>Ah, gee</b>, our <b>big family</b> (<i><b>dah4 jeeah</b></i>) eats a <b><u>do</u></b>zen eggs in a <b>jar</b> every morning.", exZh: "歡迎來到我家！", exEn: "Welcome to my home!" },
        { meaning: "Happy", trees: "kooie4 Ler4", hanzi: "快樂", pinyin: "kuài lè", sound: "Similar to the underlined parts: '<b><u>qui</u></b>(te) <b><u>lo</u></b>(vely)'.", mnemonic: "<b>Happy</b> kids are <b><u>qui</u></b>(te) <b><u>lo</u></b>(vely)!", exZh: "祝你生日快樂！", exEn: "Wish you a happy birthday!" },
        { meaning: "New", trees: "seen", hanzi: "新", pinyin: "xīn", sound: "Sounds like English '<b><u>seen</u></b>'.", mnemonic: "Never <b><u>seen</u></b> before, so it's <b>new</b>!", exZh: "這是一本新書。", exEn: "This is a new book." },
        { meaning: "Year", trees: "neean2", hanzi: "年", pinyin: "nián", sound: "Same as '<b><u>Knee</u> <u>an</u></b>', or similar to '<b>Neon</b>'.", mnemonic: "Chinese New <b>Year</b> traditionally involves the kowtow (<b><u>knee</u> <u>an</u></b>) ritual and the vibrant glow of <b>neon</b> lights.", exZh: "祝大家新年快樂！", exEn: "Happy New Year, everyone!" },
        { meaning: "To be rich / Make a fortune", trees: "fah tsie2", hanzi: "發財", pinyin: "fā cái", sound: "Sounds like the underlined parts of \"<b><u>far</u></b> i<b><u>t's I</u></b>\". Similar to '<b>far try</b>'.", mnemonic: "Not <b><u>far</u></b> ago, i<b><u>t's I</u></b> who had a <b>far try</b> (bold attempt) to <b>make a fortune</b>.", exZh: "恭喜發財，萬事如意！", exEn: "Wishing you prosperity and all the best!" },
        { meaning: "Could you tell me…? / Excuse me", trees: "Tsing3 wer-n4", hanzi: "請問", pinyin: "qǐng wèn", sound: "Le<b><u>t's sing</u></b> <b><u>when</u></b> we're happy. Sounds like the underlined parts.", mnemonic: "Associate '<i><b>tsing3</b></i>' (please) with \"Le<b><u>t's sing</u></b> happily\", and connect '<i><b>wer-n4</b></i>' (to ask) with '<b><u>when</u></b>'.", exZh: "請問洗手間在哪裡？", exEn: "Excuse me, where is the restroom?" },
        { meaning: "Thank you! / I appreciate it.", trees: "Seer4 seer", hanzi: "謝謝", pinyin: "xiè xie", sound: "Sounds like '<b><u>See</u> <u>ye</u></b>(s), <b><u>See</u> <u>ye</u></b>(s)' (don't pronounce the 's' in 'yes').", mnemonic: "Use '<b>See ya</b>' as the bridge: in real life, '<i><b>seer4 seer</b></i>' (<b>Thank you</b>) and '<b>See ya</b>' always go hand in hand!", exZh: "非常謝謝你的幫忙！", exEn: "Thank you very much for your help!" },
        { meaning: "See you / Good-bye", trees: "Dsie4 jeean4", hanzi: "再見", pinyin: "zài jiàn", sound: "Same as the underlined parts of '<b><u>Xy</u></b>lophone, <b><u>Gee</u> <u>an</u></b>'.", mnemonic: "In ancient China, friends didn't just wave <b>goodbye</b>; they played the '<b><u>Xy</u></b>lophone' to express their deep emotions!", exZh: "我們明天見，再見！", exEn: "See you tomorrow, goodbye!" },
        { meaning: "You are welcome.", trees: "Boo2 ker4 tsee", hanzi: "不客氣", pinyin: "bú kè qi", sound: "Sounds like '<b><u>Boo</u> <u>Cur</u>—<u>tsy</u></b>'.", mnemonic: "When someone thanks you, imagine she is performing a graceful curtsy and you say '<b><u>Boo</u> <u>Curtsy</u></b>' (\"Don't do this curtsy\").", exZh: "不客氣，這是我應該做的。", exEn: "You're welcome, it's my pleasure." },
        { meaning: "I'm sorry. / Pardon me.", trees: "Dooay4 boo4 tsee3", hanzi: "對不起", pinyin: "duì bù qǐ", sound: "Sounds like: <b><u>Dway</u></b>ne says '<b><u>boo</u> <u>qi</u></b>'.", mnemonic: "<b><u>Dway</u></b>ne found the <b>right</b> way (<i><b>dooay4</b></i>); Don't get angry (<i><b>boo2 tsee4</b></i>); <b>I am sorry</b> (<i><b>dooay4 boo4 tsee3</b></i>).", exZh: "對不起，我今天遲到了。", exEn: "I'm sorry, I am late today." }
      ]
    },
    {
      packId: 2,
      title: "Pack 2: Core Conversation, Pronouns & Countries (15 Words · Free)",
      free: true,
      cards: [
        { meaning: "It doesn't matter / It's OK.", trees: "May2 gooan see", hanzi: "沒關係", pinyin: "méi guān xi", sound: "Sounds like \"<b><u>May</u></b> 'gwon' <b><u>see</u></b>\". Similar to '<b><u>May</u></b> la<b><u>goon</u></b> <b><u>see</u></b>.'", mnemonic: "Dwayne's wife would forgive him if they could see the lagoon. <b><u>May</u></b> the la<b><u>goon</u></b> be <b><u>see</u></b>n when the tide goes out.", exZh: "沒關係，下次注意就好了。", exEn: "It's OK, just be careful next time." },
        { meaning: "Don't get angry.", trees: "Beer2 (r)ser-ng tsee4", hanzi: "別生氣", pinyin: "bié shēng qì", sound: "Sounds like '<b><u>Beer</u> <u>sung</u> <u>qi</u></b>'.", mnemonic: "With <b><u>beer</u></b>, Dwayne had <b><u>sung</u></b> the song full of <b><u>qi</u></b> (Vital Energy) to cheer his lover up.", exZh: "別生氣，我們一起想辦法。", exEn: "Don't get angry, let's figure it out together." },
        { meaning: "Doctor", trees: "yee (r)ser-ng", hanzi: "醫生", pinyin: "yī shēng", sound: "'<i><b>yee</b></i>' (homophone of one) + '<i><b>(r)ser-ng</b></i>' (similar to '<b><u>sung</u></b>' / birth / sound).", mnemonic: "If you're born in a hospital, the very <b>first</b> person you come into contact with is a <b>doctor</b>.", exZh: "他是一位非常有名的醫生。", exEn: "He is a very famous doctor." },
        { meaning: "Day / Sun", trees: "(r)th4", hanzi: "日", pinyin: "rì", sound: "Maintain the tongue position of '<b><u>r</u></b>ain' while making the first part of '<b><u>th</u></b>en'.", mnemonic: "Imagine it's your birthday (<i><b>(r)ser-ng</b></i> = sung), and <b>(r)<u>th</u>en</b>... the <b>day</b> begins!", exZh: "今天是個好日子。", exEn: "Today is a great day." },
        { meaning: "I / Me", trees: "wer3", hanzi: "我", pinyin: "wǒ", sound: "Similar to the underlined part of '<b><u>wor</u></b>d' or '<b><u>wor</u></b>ld'.", mnemonic: "<b><u>Wor</u></b>d is the core of language, as <b>I</b> am the core of humanity. <b><u>Wor</u></b>d gives Life to the <b><u>Wor</u></b>ld.", exZh: "我非常喜歡學習中文。", exEn: "I really like learning Chinese." },
        { meaning: "My / Mine", trees: "wer3 der", hanzi: "我的", pinyin: "wǒ de", sound: "Similar to '<b><u>word</u></b>' or '<b><u>wor</u>(l)<u>d</u></b>'.", mnemonic: "<b>My</b> <b><u>wor</u>(l)<u>d</u></b>! Adding '<i><b>der</b></i>' (sounds like '<b><u>d</u></b>' in wor<b><u>d</u></b>) after '<i><b>wer3</b></i>' (I) forms '<b>my / mine</b>'.", exZh: "這本書是我的。", exEn: "This book is mine." },
        { meaning: "Your / Yours (Singular)", trees: "nee3 der", hanzi: "你的", pinyin: "nǐ de", sound: "Sounds like '<b><u>need</u></b>'.", mnemonic: "<b>Yours</b> is what you <b><u>need</u></b>.", exZh: "你的發音非常標準！", exEn: "Your pronunciation is very accurate!" },
        { meaning: "It / He / She / Him / Her", trees: "tah", hanzi: "它 / 他 / 她", pinyin: "tā", sound: "Sounds like the first part of '<b><u>Ta</u></b>rget'.", mnemonic: "This product (<b>it</b>) is exclusive to <b><u>Ta</u></b>rget. <b>She</b> and <b>he</b> have to buy it at <b><u>Ta</u></b>rget.", exZh: "他是我們班的好學生。", exEn: "He is a good student in our class." },
        { meaning: "Its / Her / Hers / His", trees: "tah der", hanzi: "它的 / 她的 / 他的", pinyin: "tā de", sound: "Similar to '<b><u>tard</u></b>(y)'.", mnemonic: "<b>He</b> was <b><u>tard</u></b>(y) for <b>his</b> English class.", exZh: "他的中文說得很好。", exEn: "He speaks Chinese very well." },
        { meaning: "Friend", trees: "per-ng2 yoh", hanzi: "朋友", pinyin: "péng yǒu", sound: "Sounds like the underlined parts of '<b><u>peng</u></b>uin <b><u>you</u></b>'.", mnemonic: "A cute <b><u>peng</u></b>uin is <b><u>you</u></b>r best <b>friend</b>!", exZh: "我們是最好的朋友。", exEn: "We are best friends." },
        { meaning: "Younger brother & Elder brother", trees: "dee4 dee / ger ger", hanzi: "弟弟 / 哥哥", pinyin: "dì di / gē ge", sound: "The first part of '<b><u>di</u></b>g' is '<i><b>dee4</b></i>' (younger brother), and the last '<b><u>g</u></b>' is '<i><b>ger</b></i>' (elder brother).", mnemonic: "'<b><u>dig</u></b>' is the teamwork of a <b>younger brother</b> (<i><b>dee4</b></i>) and an <b>elder brother</b> (<i><b>ger</b></i>)!", exZh: "哥哥和弟弟一起去公園。", exEn: "The brothers go to the park together." },
        { meaning: "Country & The United States", trees: "gooer2 / may3 gooer2", hanzi: "國 / 美國", pinyin: "guó / měi guó", sound: "Rapid contraction of '<i><b>ger</b></i>' (brother) and '<i><b>wer3</b></i>' (me) ➔ '<i><b>gooer2</b></i>'. '<i><b>may3</b></i>' = <b><u>May</u></b>flower.", mnemonic: "No <b><u>May</u></b>flower, no <b>United States</b> (<i><b>may3 gooer2</b></i>).", exZh: "我來自美國加州。", exEn: "I come from California, USA." },
        { meaning: "Human / People / Person", trees: "(r)ther-n2", hanzi: "人", pinyin: "rén", sound: "Maintain the '<b><u>r</u></b>' tongue position of '<b><u>r</u></b>ain' while making the weak form of '<b><u>then</u></b>'. Also like 'human vi<b><u>sion</u></b>'.", mnemonic: "Placing '<i><b>(r)ther-n2</b></i>' (<b>people</b>) at the end of a country name turns it into the word for its people.", exZh: "這裡的人都非常熱情。", exEn: "The people here are very warm." },
        { meaning: "China", trees: "(r)dser-oong gooer2", hanzi: "中國", pinyin: "zhōng guó", sound: "'<i><b>(r)dser-oong</b></i>' sounds like '<b><u>drone</u></b>'.", mnemonic: "Fly a <b><u>drone</u></b> across the country (<i><b>gooer2</b></i>) of <b>China</b>.", exZh: "中國有很多歷史古蹟。", exEn: "China has many historical sites." },
        { meaning: "Like / Love", trees: "see3 hooan", hanzi: "喜歡", pinyin: "xǐ huān", sound: "Sounds like: '<b><u>see</u> <u>Juan</u></b>' (Spanish).", mnemonic: "<b>Like</b> him when you <b><u>see</u></b> a Don <b><u>Juan</u></b>!", exZh: "你喜歡吃什麼水果？", exEn: "What fruit do you like to eat?" }
      ]
    },
    {
      packId: 3,
      title: "Pack 3: Questions, Dining, Doctor & Public Services (15 Words · Free)",
      free: true,
      cards: [
        { meaning: "Can / Be able to", trees: "hooay4", hanzi: "會", pinyin: "huì", sound: "Sounds like '<b><u>hoo</u></b>(r)<b><u>ay</u></b>' without 'r'.", mnemonic: "If you <b>can</b> do it, we'll shout '<b><u>hoo</u></b>(r)<b><u>ay</u></b>'!", exZh: "我會說一點點中文。", exEn: "I can speak a little bit of Chinese." },
        { meaning: "Book", trees: "(r)soo", hanzi: "書", pinyin: "shū", sound: "Sounds like '<b><u>sue</u></b>'.", mnemonic: "If you copy this <b>book</b>, <b><u>Sue</u></b> will <b><u>sue</u></b> you!", exZh: "我喜歡在圖書館看書。", exEn: "I like reading books in the library." },
        { meaning: "Who & Water", trees: "(r)sooay2 / (r)sooay3", hanzi: "誰 / 水", pinyin: "shuí / shuǐ", sound: "Contract '<b><u>sway</u></b>' into a single monosyllabic sound.", mnemonic: "<b>Who</b> (<i><b>(r)sooay2</b></i>) is gazing at the mermaid <b><u>sway</u></b>ing in the <b>water</b> (<i><b>(r)sooay3</b></i>)?", exZh: "請問誰想喝水？", exEn: "Excuse me, who would like to drink water?" },
        { meaning: "Look for / Be looking for", trees: "(r)dsaw3", hanzi: "找", pinyin: "zhǎo", sound: "Similar to '<b><u>jowl</u></b>' or '<b><u>jaw</u></b>'.", mnemonic: "I'll be <b>looking for</b> my <b><u>jaw</u></b> on the floor after seeing that performance!", exZh: "你在找什麼東西？", exEn: "What are you looking for?" },
        { meaning: "From", trees: "Lie2 ds4", hanzi: "來自", pinyin: "lái zì", sound: "'<i><b>Lie2 ds4</b></i>' is similar to '<b><u>lies</u></b>'.", mnemonic: "The truth <b><u>LIES</u></b> in where you come <b>FROM</b>.", exZh: "我的老師來自台灣。", exEn: "My teacher comes from Taiwan." },
        { meaning: "Where", trees: "nah3 Lee3", hanzi: "哪裡", pinyin: "nǎ lǐ", sound: "Sounds like 'G<b><u>narly</u></b>' without 'G'.", mnemonic: "If you don't know <b>WHERE</b> you are, things are getting G<b><u>NARLY</u></b>.", exZh: "你週末想去哪裡玩？", exEn: "Where do you want to go this weekend?" },
        { meaning: "How", trees: "dser-n3 mer", hanzi: "怎麼", pinyin: "zěn me", sound: "Sounds like the underlined parts of 'Confi<b><u>sion</u></b>? <b><u>Mer</u></b>maid.'", mnemonic: "His confu<b><u>sion</u></b> is <b>how</b> the <b><u>mer</u></b>maid falls in love with a human.", exZh: "這道題應該怎麼做？", exEn: "How should we solve this question?" },
        { meaning: "Supermarket", trees: "(r)tsaw (r)s4", hanzi: "超市", pinyin: "chāo shì", sound: "Sounds like an r-colored '<b><u>cho</u></b>(i)<b><u>ce</u></b>' without 'i'.", mnemonic: "So many <b><u>cho</u></b>(i)<b><u>ce</u></b>s in the <b>supermarket</b>!", exZh: "媽媽去超市買水果了。", exEn: "Mom went to the supermarket to buy fruit." },
        { meaning: "(the) Menu & Check, please", trees: "tsie4 dan / mie3 dan", hanzi: "菜單 / 買單", pinyin: "cài dān / mǎi dān", sound: "'<i><b>tsie4</b></i>' = \"I<b><u>t's I</u></b>\"; '<i><b>dan</b></i>' = '<b><u>done</u></b>'; '<i><b>mie3 dan</b></i>' = '<b><u>My</u> <u>done</u></b>'.", mnemonic: "I<b><u>t's I</u></b> who have <b><u>done</u></b> the <b>menu</b> (<i><b>tsie4 dan</b></i>). <b>Check, please</b>—I'm all <b><u>done</u></b> (<i><b>mie3 dan</b></i>)!", exZh: "服務員，請給我菜單。", exEn: "Waiter, please give me the menu." },
        { meaning: "Would like / Want", trees: "seeang3 yaw4", hanzi: "想要", pinyin: "xiǎng yào", sound: "Blend '<b><u>see</u></b>' and '<b><u>young</u></b>' into '<i><b>seeang3</b></i>'; '<i><b>yaw4</b></i>' sounds like '<b><u>your</u></b>'.", mnemonic: "I <b>want</b> to <b><u>see</u> <u>Young</u></b>'s Ordinary (a popular British beer).", exZh: "我想要一杯熱咖啡。", exEn: "I would like a cup of hot coffee." },
        { meaning: "Milk tea", trees: "nie3 (r)tsah2", hanzi: "奶茶", pinyin: "nǎi chá", sound: "'<i><b>nie3</b></i>' = first part of '<b><u>ni</u></b>ce'; '<i><b>(r)tsah2</b></i>' = underlined part of '<b><u>char</u></b>ge'.", mnemonic: "A cup of <b>milk tea</b> gives her a <b><u>ni</u></b>ce <b><u>char</u></b>ge!", exZh: "珍珠奶茶非常好喝。", exEn: "Boba milk tea is very delicious." },
        { meaning: "Dumplings", trees: "jeeaw3 ds", hanzi: "餃子", pinyin: "jiǎo zi", sound: "Similar to the underlined parts of '<b><u>Gee, aw</u></b>esome foo<b><u>ds</u></b>.'", mnemonic: "<b><u>Gee, aw</u></b>esome foo<b><u>ds</u></b>—everyone loves <b>dumplings</b>!", exZh: "我們今天晚上吃餃子。", exEn: "We are eating dumplings tonight." },
        { meaning: "Cold (Illness)", trees: "gan3 maw4", hanzi: "感冒", pinyin: "gǎn mào", sound: "Sounds like '<b><u>gun</u> <u>mall</u></b>'.", mnemonic: "Leo witnessed a <b><u>gun</u></b>fight at the <b><u>mall</u></b>; the shock weakened his immune system and he caught a <b>cold</b>.", exZh: "天冷了，小心別感冒。", exEn: "It's cold, be careful not to catch a cold." },
        { meaning: "Telephone", trees: "deean4 hooah4", hanzi: "電話", pinyin: "diàn huà", sound: "'<i><b>deean4</b></i>' = rapid blend of '<b><u>the end</u></b>'; '<i><b>hooah4</b></i>' = '<b><u>who are</u></b>' linked together.", mnemonic: "Call on the <b>telephone</b> to ask: \"At <b><u>the end</u></b> of the movie, <b><u>who are</u></b> they?\"", exZh: "請給我打個電話。", exEn: "Please give me a phone call." },
        { meaning: "Got it.", trees: "Ting der-oong3 Ler", hanzi: "聽懂了", pinyin: "tīng dǒng le", sound: "Sounds like the underlined parts: He is shou<b><u>ting</u></b>, \"I <b><u>don't</u></b> <b><u>love</u></b> math!\"", mnemonic: "Once you hear it, you've <b>got it</b> (<i><b>Ting der-oong3 Ler</b></i>)!", exZh: "老師講的課我都聽懂了！", exEn: "I understood everything the teacher taught!" }
      ]
    }
  ]
};

// =========================================================================
// 3. 雙語介面文字
// =========================================================================
const UI_TEXT = {
  en: {
    title: "Trees Pinyin",
    subTitle: "Fast AI Q&A · Instant Docs/PDF/Photo/YouTube Translator · Read English, Speak Chinese",
    tabWorkspace: "✨ AI & File Translator",
    tabMnemonics: "Mnemonic Cards (15/Pack)",
    langBtn: "中文",
    keyBtn: "🔑 API Key",
    placeholder: "Ask AI any question (e.g. 李白的詩, 梅花古詩), or enter/paste/drag text, PDF, Word, Google Docs link, or photo...",
    aiBtn: "✨ AI Reply & Pinyin",
    transBtn: "📝 Translate & Pinyin",
    speakBtn: "🔊 Speak",
    stopSpeakBtn: "⏹️ Stop",
    authorNote: "<b>Tip:</b> Built by a former teacher now working a manual job, so I assume no liability for accuracy. For best results, paste your browser AI's reply above. Trees Pinyin is a beginner's bridge to help you speak and remember Mandarin—please use standard Hanyu Pinyin for formal study. Your share and support help me build this full-time!",
    hint: "🔊 Tap character to speak · ✍️ Right-click or Long-press (0.5s) to edit polyphone",
    bigBtn: "🔄 Big Screen",
    saveBtn: "💾 Save Photo",
    printBtn: "🖨️ Print / PDF",
    recordBtn: "🎬 Record Video",
    exitBig: "✕ Exit Fullscreen",
    fileMenuTitle: "📁 Upload File, Photo, or Google Docs/Drive Link",
    optDocTitle: "📄 Choose Local File or Photo (PDF / Word / TXT / SRT / JPG / PNG)",
    optDocSub: "Instant local extraction & OCR · Or drag & drop / press Ctrl+V anywhere",
    cloudTitle: "☁️ Paste Google Docs / Google Drive / Dropbox Link:",
    fileMenuCancel: "Cancel"
  },
  zh: {
    title: "Trees Pinyin",
    subTitle: "瀏覽器 AI 問答 · Docs/PDF/圖片/YouTube 秒速翻譯注音 · 讀英語說中文",
    tabWorkspace: "✨ AI 問答與文件翻譯",
    tabMnemonics: "記憶閃卡 (15字/包)",
    langBtn: "English",
    keyBtn: "🔑 API Key",
    placeholder: "向 AI 提問（如：李白的詩、梅花古詩），或將您從瀏覽器 AI 獲得的回答/文字/PDF/Word/Google Docs 連結貼上直接翻譯注音...",
    aiBtn: "✨ AI 回答並注音",
    transBtn: "📝 翻譯並注音",
    speakBtn: "🔊 朗讀",
    stopSpeakBtn: "⏹️ 停止",
    authorNote: "<b>提示：</b>為獲得最佳體驗，建議使用您自己的免費 Gemini API Key 或直接貼上文字。作者對拼音結果準確性不承擔法律責任。您的支持與分享將幫助作者全職投入改進與編寫記憶字典！",
    hint: "🔊 點擊漢字朗讀發音 · ✍️ 右鍵或手機長按 0.5 秒修改多音字",
    bigBtn: "🔄 橫屏大字",
    saveBtn: "💾 保存圖片",
    printBtn: "🖨️ 列印 / PDF",
    recordBtn: "🎬 錄製影片",
    exitBig: "✕ 退出全螢幕",
    fileMenuTitle: "📁 上傳文件、圖片或 Google 網盤連結",
    optDocTitle: "📄 選擇本地文件或圖片 (PDF / Word / TXT / SRT / JPG / PNG)",
    optDocSub: "本地秒速提取文字與視覺 OCR · 亦可直接拖拽或按 Ctrl+V 貼圖",
    cloudTitle: "☁️ 貼上 Google Docs / Google Drive / Dropbox 網盤連結：",
    fileMenuCancel: "取消"
  }
};

