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

  // 100 組精選高讚種子記憶法（原樣保留作者原書 <u>底線</u> 與 (不發音括弧) 標記）
  const SEED_MNEMONICS = [
    // === 1. Food & Dining (爆笑美食篇) ===
    { id: 'm001', hanzi: '買單', trees: 'Mie3 dan', pinyin: 'mǎi dān', meaning: 'Check, please!', hook: '<u>My</u> <u>done</u>', mnemonic: 'Sounds like "<u>My</u> <u>done</u>". Check, please. I\'m all <u>done</u>!', category: 'Food', author: 'Author Pick', likes: 248 },
    { id: 'm002', hanzi: '麻婆豆腐', trees: 'mah2 pooer2 doh4 foo', pinyin: 'má pó dòu fu', meaning: 'Mapo Tofu', hook: '<u>Ma</u> <u>poor</u> <u>dough</u> <u>foo</u>(d)', mnemonic: '<u>Ma</u>\'s <u>poor</u> <u>dough</u> <u>foo</u>(d) was our daily staple.', category: 'Food', author: 'Author Pick', likes: 231 },
    { id: 'm003', hanzi: '烤鴨', trees: 'kaw3 yah', pinyin: 'kǎo yā', meaning: 'Roast Duck', hook: '<u>cow</u>, <u>yeah</u>', mnemonic: 'Sounds like "<u>cow</u>, <u>yeah</u>". Ducks in a row? Duck <u>yeah</u>!', category: 'Food', author: 'Author Pick', likes: 219 },
    { id: 'm004', hanzi: '烤肉', trees: 'kaw3 (r)thoh4', pinyin: 'kǎo ròu', meaning: 'BBQ / Barbecue', hook: '<u>Cow</u> <u>though</u>', mnemonic: '<u>Cow</u> <u>though</u> it is, it is still used for barbecue.', category: 'Food', author: 'Author Pick', likes: 194 },
    { id: 'm005', hanzi: '餃子', trees: 'jeeaw3 ds', pinyin: 'jiǎo zi', meaning: 'Dumplings', hook: '<u>Gee, awe</u>some foo<u>ds</u>', mnemonic: 'Similar to the underlined parts of "<u>Gee, awe</u>some foo<u>ds</u>."', category: 'Food', author: 'Author Pick', likes: 215 },
    { id: 'm006', hanzi: '辣', trees: 'Lah4', pinyin: 'là', meaning: 'Spicy', hook: '<u>lau</u>gh', mnemonic: 'Same as the first part of "<u>lau</u>gh". We love spicy food and loud <u>lau</u>ghs; that\'s the soul of our restaurant.', category: 'Food', author: 'Author Pick', likes: 188 },
    { id: 'm007', hanzi: '微辣', trees: 'way Lah4', pinyin: 'wēi là', meaning: 'Mildly spicy', hook: '<u>way</u> to <u>lau</u>gh', mnemonic: 'With mildly spicy dumplings and a loud <u>way</u> to <u>lau</u>gh, we had an awesome night. Chinese "<u>way</u>" (mildly) is the opposite of English "way" (much)!', category: 'Food', author: 'Author Pick', likes: 176 },
    { id: 'm008', hanzi: '一杯', trees: 'yee4 bay', pinyin: 'yì bēi', meaning: 'A cup of', hook: '<u>eBay</u>', mnemonic: 'Sounds like "<u>eBay</u>". Your cup and coffee are all from <u>eBay</u>!', category: 'Food', author: 'Author Pick', likes: 236 },
    { id: 'm009', hanzi: '蛋糕', trees: 'dan4 gaw', pinyin: 'dàn gāo', meaning: 'Cake', hook: '<u>dangle</u>', mnemonic: 'A four-year-old <u>dangle</u>s her legs blowing out four candles on a birthday cake.', category: 'Food', author: 'Author Pick', likes: 182 },
    { id: 'm010', hanzi: '牛肉', trees: 'neeoh2 (r)thoh4', pinyin: 'niú ròu', meaning: 'Beef', hook: '<u>new</u> <u>though</u>', mnemonic: '<u>New</u> <u>though</u> the cook is, the beef is delicious.', category: 'Food', author: 'Author Pick', likes: 164 },
    { id: 'm011', hanzi: '羊肉', trees: 'yang2 (r)thoh4', pinyin: 'yáng ròu', meaning: 'Mutton / Lamb', hook: '<u>Young</u> <u>though</u>', mnemonic: '<u>Young</u> <u>though</u> the lamb is, it\'s best for a hotpot.', category: 'Food', author: 'Author Pick', likes: 152 },
    { id: 'm012', hanzi: '水果', trees: '(r)sooay3 gooer3', pinyin: 'shuǐ guǒ', meaning: 'Fruit', hook: '<u>sway</u> <u>goer</u>', mnemonic: 'Heavy fruits hang and <u>sway</u> across the country(side) fields.', category: 'Food', author: 'Author Pick', likes: 171 },
    { id: 'm013', hanzi: '陳皮雞', trees: '(r)tser-n2 pee2 jee', pinyin: 'chén pí jī', meaning: 'Orange Chicken', hook: 'ki<u>tchen pea Gee</u>', mnemonic: '<u>Gee</u>, the ki<u>tchen</u>\'s Snap <u>pea</u>s Orange Chicken is a must-try!', category: 'Food', author: 'Author Pick', likes: 168 },
    { id: 'm014', hanzi: '芥蘭牛', trees: 'Jeer4 Lan2 neeoh2', pinyin: 'jiè lán niú', meaning: 'Beef & Broccoli', hook: '<u>Gee a</u> <u>lan</u>(d) <u>new</u>', mnemonic: 'Similar to the underlined parts of "<u>Gee a</u> <u>lan</u>(d) <u>new</u>". <u>Gee</u>, the broccoli comes from a <u>new</u> <u>lan</u>(d).', category: 'Food', author: 'Author Pick', likes: 147 },
    { id: 'm015', hanzi: '招牌菜', trees: '(r)dsaw pie2 tsie4', pinyin: 'zhāo pái cài', meaning: 'House Specialty', hook: '<u>jaw</u> + <u>pie</u>', mnemonic: 'You\'ll be looking for your <u>jaw</u> on the floor after eating the house specialty <u>pie</u>!', category: 'Food', author: 'Author Pick', likes: 159 },
    { id: 'm016', hanzi: '杯', trees: 'bay', pinyin: 'bēi', meaning: 'Cup', hook: 'Hudson <u>Bay</u>', mnemonic: 'Looking down from the plane, the Hudson <u>Bay</u> looked just like a giant cup of cold blue tea.', category: 'Food', author: 'Author Pick', likes: 143 },
    { id: 'm017', hanzi: '奶', trees: 'nie3', pinyin: 'nǎi', meaning: 'Milk', hook: '<u>ni</u>ce', mnemonic: 'Same as the first part of "<u>ni</u>ce". She is as <u>ni</u>ce as warm milk.', category: 'Food', author: 'Author Pick', likes: 156 },
    { id: 'm018', hanzi: '茶', trees: '(r)tsah2', pinyin: 'chá', meaning: 'Tea', hook: '<u>char</u>ge', mnemonic: 'How much do you <u>char</u>ge for a cup of milk tea? A cup of milk tea gives her a <u>ni</u>ce <u>char</u>ge.', category: 'Food', author: 'Author Pick', likes: 161 },
    { id: 'm019', hanzi: '喝', trees: 'her', pinyin: 'hē', meaning: 'Drink', hook: '<u>her</u> (British)', mnemonic: 'Similar to British English "<u>her</u>". To drink Young\'s Bitter is <u>her</u> hobby.', category: 'Food', author: 'Author Pick', likes: 149 },
    { id: 'm020', hanzi: '飽', trees: 'baw3', pinyin: 'bǎo', meaning: 'Full (from eating)', hook: '<u>ball</u>', mnemonic: 'He is so full that his belly looks like a <u>ball</u>.', category: 'Food', author: 'Author Pick', likes: 185 },
    { id: 'm021', hanzi: '美食', trees: 'may3 (r)s2', pinyin: 'měi shí', meaning: 'Delicious Cuisine', hook: '<u>mace</u>', mnemonic: 'Sounds like "<u>mace</u>" — cuisine so stunning it hits like a flavor <u>mace</u>!', category: 'Food', author: 'Author Pick', likes: 138 },
    { id: 'm022', hanzi: '筷子', trees: 'kooie4 ds', pinyin: 'kuài zi', meaning: 'Chopsticks', hook: '<u>qui</u>et han<u>ds</u>', mnemonic: 'Chopsticks in <u>qui</u>et han<u>ds</u>.', category: 'Food', author: 'Author Pick', likes: 154 },

    // === 2. Everyday & Viral Phrases (爆笑日常篇) ===
    { id: 'm023', hanzi: '來自', trees: 'Lie2 ds4', pinyin: 'lái zì', meaning: 'Come from', hook: '<u>Lies</u>', mnemonic: 'The truth <u>LIES</u> in where you come FROM.', category: 'Everyday', author: 'Author Pick', likes: 267 },
    { id: 'm024', hanzi: '哪裡', trees: 'nah3 Lee3', pinyin: 'nǎ lǐ', meaning: 'Where', hook: '(G)<u>narly</u>', mnemonic: 'Sounds like "G<u>narly</u>" without "G". If you don\'t know WHERE you are, things are getting G<u>NARLY</u>.', category: 'Everyday', author: 'Author Pick', likes: 254 },
    { id: 'm025', hanzi: '不客氣', trees: 'Boo2 ker4 tsee', pinyin: 'bú kè qi', meaning: 'You\'re welcome', hook: '<u>Boo Cur—tsy</u>', mnemonic: 'When someone thanks you, imagine she is performing a graceful curtsy and you say "<u>Boo Curtsy</u>" ("Don\'t do this curtsy!").', category: 'Everyday', author: 'Author Pick', likes: 242 },
    { id: 'm026', hanzi: '別生氣', trees: 'Beer2 (r)ser-ng tsee4', pinyin: 'bié shēng qì', meaning: 'Don\'t be angry', hook: '<u>Beer sung qi</u>', mnemonic: 'With <u>beer</u>, Dwayne had <u>sung</u> the song full of <u>qi</u> (Vital Energy) to cheer his lover up.', category: 'Everyday', author: 'Author Pick', likes: 211 },
    { id: 'm027', hanzi: '微信', trees: 'way seen4', pinyin: 'wēi xìn', meaning: 'WeChat', hook: '<u>way seen</u> / <u>we sin</u>', mnemonic: 'I hate the <u>way</u> I was <u>seen</u> (and ignored) on WeChat. Behind that WeChat screen, <u>we sin</u> in whispers.', category: 'Everyday', author: 'Author Pick', likes: 239 },
    { id: 'm028', hanzi: '臥室', trees: 'wer4 (r)s4', pinyin: 'wò shì', meaning: 'Bedroom', hook: '<u>worse</u>', mnemonic: 'The elephant made the bedroom get <u>worse</u>.', category: 'Everyday', author: 'Author Pick', likes: 205 },
    { id: 'm029', hanzi: '累', trees: 'Lay4', pinyin: 'lèi', meaning: 'Tired', hook: '<u>Lay</u>', mnemonic: '<u>Lay</u> down if you feel tired.', category: 'Everyday', author: 'Author Pick', likes: 224 },
    { id: 'm030', hanzi: '書', trees: '(r)soo', pinyin: 'shū', meaning: 'Book', hook: '<u>Sue</u>', mnemonic: 'Sounds like "<u>Sue</u>". If you copy this book, <u>Sue</u> will <u>sue</u> you!', category: 'Everyday', author: 'Author Pick', likes: 229 },
    { id: 'm031', hanzi: '你好', trees: 'Nee3 haw3', pinyin: 'nǐ hǎo', meaning: 'Hello', hook: '<u>Knee</u>(l) + <u>how</u>', mnemonic: '<u>Knee</u>ling to show <u>how</u> much respect you have in serious moments. How could you <u>knee</u>(l) down just to say hello?', category: 'Everyday', author: 'Author Pick', likes: 218 },
    { id: 'm032', hanzi: '謝謝', trees: 'Seer4 seer', pinyin: 'xiè xie', meaning: 'Thank you', hook: '<u>See ye</u>(s), <u>See ye</u>(s)', mnemonic: 'Sounds like "<u>See ye</u>(s), <u>See ye</u>(s)" (skip the "s" inside parentheses).', category: 'Everyday', author: 'Author Pick', likes: 192 },
    { id: 'm033', hanzi: '請問', trees: 'Tsing3 wer-n4', pinyin: 'qǐng wèn', meaning: 'Excuse me / May I ask', hook: 'Le<u>t\'s sing</u> <u>when</u>', mnemonic: 'Le<u>t\'s sing</u> <u>when</u> we make a polite request!', category: 'Everyday', author: 'Author Pick', likes: 184 },
    { id: 'm034', hanzi: '再見', trees: 'Dsie4 jeean4', pinyin: 'zài jiàn', meaning: 'Goodbye / See you', hook: '<u>Xy</u>lophone, <u>Gee an</u>', mnemonic: 'In ancient China, friends didn\'t just wave goodbye; they often played the "<u>Xy</u>lophone" to express deep emotions.', category: 'Everyday', author: 'Author Pick', likes: 162 },
    { id: 'm035', hanzi: '對', trees: 'dooay4', pinyin: 'duì', meaning: 'Right / Correct', hook: '<u>do way</u> / <u>Dway</u>ne', mnemonic: '<u>Dway</u>ne found the right way to <u>do</u> it. <u>Dway</u>ne is right.', category: 'Everyday', author: 'Author Pick', likes: 179 },
    { id: 'm036', hanzi: '不', trees: 'boo4', pinyin: 'bù', meaning: 'No / Not', hook: '<u>Boo</u>!', mnemonic: 'If "No" is a shake of the head, "<u>Boo</u>" is the sound that goes with it.', category: 'Everyday', author: 'Author Pick', likes: 204 },
    { id: 'm037', hanzi: '喜歡', trees: 'see3 hooan', pinyin: 'xǐ huan', meaning: 'Like / Love', hook: '<u>see</u> <u>Juan</u>', mnemonic: 'Like him when you <u>see</u> Don <u>Juan</u>.', category: 'Everyday', author: 'Author Pick', likes: 213 },
    { id: 'm038', hanzi: '會', trees: 'hooay4', pinyin: 'huì', meaning: 'Can / Know how to', hook: '<u>hoo</u>(r)<u>ay</u>', mnemonic: 'Sounds like <u>hoo</u>(r)<u>ay</u> without "r". If you can, we\'ll say "<u>hoo</u>(r)<u>ay</u>"!', category: 'Everyday', author: 'Author Pick', likes: 196 },
    { id: 'm039', hanzi: '可以', trees: 'ker3 yee3', pinyin: 'kě yǐ', meaning: 'May I / Can', hook: '<u>ka</u>(wa)<u>ii</u>', mnemonic: 'A <u>ka</u>(wa)<u>ii</u> girl asked, "May I…?"', category: 'Everyday', author: 'Author Pick', likes: 189 },
    { id: 'm040', hanzi: '可愛', trees: 'ker3 ie4', pinyin: 'kě ài', meaning: 'Cute / Adorable', hook: '<u>ka</u>(w)<u>aii</u>', mnemonic: 'Similar to the underlined part of "<u>ka</u>(w)<u>aii</u>"!', category: 'Everyday', author: 'Author Pick', likes: 201 },
    { id: 'm041', hanzi: '買', trees: 'Mie3', pinyin: 'mǎi', meaning: 'Buy', hook: '<u>my</u>', mnemonic: 'Once I buy it, it\'s all <u>my</u> own.', category: 'Everyday', author: 'Author Pick', likes: 198 },
    { id: 'm042', hanzi: '快樂', trees: 'kooie4 Ler4', pinyin: 'kuài lè', meaning: 'Happy', hook: '<u>qui</u>(te) <u>lo</u>(vely)', mnemonic: 'Happy kids are <u>qui</u>(te) <u>lo</u>(vely).', category: 'Everyday', author: 'Author Pick', likes: 169 },
    { id: 'm043', hanzi: '新', trees: 'seen', pinyin: 'xīn', meaning: 'New', hook: '<u>seen</u>', mnemonic: 'Never <u>seen</u>, so it\'s new.', category: 'Everyday', author: 'Author Pick', likes: 195 },
    { id: 'm044', hanzi: '年', trees: 'neean2', pinyin: 'nián', meaning: 'Year', hook: '<u>Knee an</u> / <u>Neon</u>', mnemonic: 'Same as "<u>Knee an</u>" (kowtow ritual) and similar to "<u>Neon</u>" — vibrant <u>neon</u> lights of the New Year!', category: 'Everyday', author: 'Author Pick', likes: 173 },
    { id: 'm045', hanzi: '發財', trees: 'fah tsie2', pinyin: 'fā cái', meaning: 'Make a fortune', hook: '<u>far</u> i<u>t\'s I</u> / <u>far try</u>', mnemonic: 'Not <u>far</u> ago, i<u>t\'s I</u> who had a <u>far try</u> (bold attempt) to make a fortune.', category: 'Everyday', author: 'Author Pick', likes: 167 },
    { id: 'm046', hanzi: '看', trees: 'kan4', pinyin: 'kàn', meaning: 'Look / Read / Watch', hook: '<u>can</u>\'t / <u>can</u>dle', mnemonic: 'You <u>can</u>\'t read the book with a <u>can</u>dle.', category: 'Everyday', author: 'Author Pick', likes: 178 },
    { id: 'm047', hanzi: '幫', trees: 'bang', pinyin: 'bāng', meaning: 'Help', hook: '<u>bang</u>', mnemonic: 'A sudden <u>bang</u>, then a call for help.', category: 'Everyday', author: 'Author Pick', likes: 191 },
    { id: 'm048', hanzi: '獨特', trees: 'doo2 ter4', pinyin: 'dú tè', meaning: 'Unique', hook: '<u>do</u> i<u>t</u>', mnemonic: 'Just <u>do</u> i<u>t</u>!', category: 'Everyday', author: 'Author Pick', likes: 148 },
    { id: 'm049', hanzi: '多', trees: 'dooer', pinyin: 'duō', meaning: 'Many / Much / How', hook: '<u>Duo</u>lingo', mnemonic: 'Sounds like the first part of "<u>Duo</u>lingo". How many languages are in <u>Duo</u>lingo?', category: 'Everyday', author: 'Author Pick', likes: 175 },
    { id: 'm050', hanzi: '都', trees: 'doh', pinyin: 'dōu', meaning: 'All / Both', hook: '<u>doe</u> / <u>dough</u>', mnemonic: 'Wild <u>doe</u> or extra <u>dough</u> — give me both!', category: 'Everyday', author: 'Author Pick', likes: 163 },
    { id: 'm051', hanzi: '什麼', trees: '(r)ser-n2 mer', pinyin: 'shén me', meaning: 'What', hook: 'Atten<u>tion</u>: <u>Mer</u>maids', mnemonic: 'Atten<u>tion</u>: <u>Mer</u>maids are coming. What?!', category: 'Everyday', author: 'Author Pick', likes: 186 },
    { id: 'm052', hanzi: '怎麼', trees: 'dser-n3 mer', pinyin: 'zěn me', meaning: 'How', hook: 'Confu<u>sion</u>? <u>Mer</u>maid', mnemonic: 'His confu<u>sion</u> is how the <u>mer</u>maid falls in love with a human.', category: 'Everyday', author: 'Author Pick', likes: 172 },
    { id: 'm053', hanzi: '誰', trees: '(r)sooay2', pinyin: 'shuí', meaning: 'Who', hook: '<u>sway</u> / <u>sha</u>me', mnemonic: 'Who is gazing at the mermaid <u>sway</u>ing in the water [(r)sooay3]?', category: 'Everyday', author: 'Author Pick', likes: 158 },
    { id: 'm054', hanzi: '誰的', trees: '(r)sooay2 der', pinyin: 'shuí de', meaning: 'Whose', hook: 'per<u>suade</u>', mnemonic: 'Sounds like the last part of "per<u>suade</u>". Whose turn is it to per<u>suade</u> the mermaid?', category: 'Everyday', author: 'Author Pick', likes: 166 },
    { id: 'm055', hanzi: '找', trees: '(r)dsaw3', pinyin: 'zhǎo', meaning: 'Look for', hook: '<u>jowl</u> / <u>jaw</u>', mnemonic: 'I\'ll be looking for my <u>jaw</u> on the floor after seeing that performance!', category: 'Everyday', author: 'Author Pick', likes: 177 },
    { id: 'm056', hanzi: '走', trees: 'dsoh3', pinyin: 'zǒu', meaning: 'Go / Walk', hook: '<u>Zo</u>(e)', mnemonic: 'Sounds like the first part of <u>Zo</u>(e) without "e". Where <u>Zo</u>(e) goes, life follows.', category: 'Everyday', author: 'Author Pick', likes: 155 },
    { id: 'm057', hanzi: '洗', trees: 'see3', pinyin: 'xǐ', meaning: 'Wash', hook: '<u>see</u>', mnemonic: 'The rain washes the sky, and now we can <u>see</u> clearly.', category: 'Everyday', author: 'Author Pick', likes: 151 },
    { id: 'm058', hanzi: '手', trees: '(r)soh3', pinyin: 'shǒu', meaning: 'Hand', hook: '<u>show</u>', mnemonic: 'Could you <u>show</u> me your hands after washing?', category: 'Everyday', author: 'Author Pick', likes: 160 },
    { id: 'm059', hanzi: '休息', trees: 'seeoh see3', pinyin: 'xiū xi', meaning: 'Rest / Take a break', hook: '<u>See... Oh</u>, <u>See</u>!', mnemonic: 'Rest and <u>See... Oh</u>, <u>See</u>!', category: 'Everyday', author: 'Author Pick', likes: 146 },
    { id: 'm060', hanzi: '幸福', trees: 'sing4 foo2', pinyin: 'xìng fú', meaning: 'Happiness', hook: '<u>sing</u> + <u>foo</u>d', mnemonic: 'Loud <u>sing</u>ing and good <u>foo</u>d bring us true happiness.', category: 'Everyday', author: 'Author Pick', likes: 187 },

    // === 3. Travel, Places & Survival (旅遊實用篇) ===
    { id: 'm061', hanzi: '遊客', trees: 'yoh2 ker4', pinyin: 'yóu kè', meaning: 'Tourist', hook: '<u>Yogur</u>(t)', mnemonic: 'Sounds like "<u>Yogur</u>(t)". The tourists with <u>yogur</u>(t) lined up for Kobe beef!', category: 'Travel', author: 'Author Pick', likes: 259 },
    { id: 'm062', hanzi: '導遊', trees: 'daw3 yoh2', pinyin: 'dǎo yóu', meaning: 'Tour Guide', hook: '<u>Dow</u>, <u>you</u>', mnemonic: '<u>Dow</u>, <u>you</u> are our guide!', category: 'Travel', author: 'Author Pick', likes: 174 },
    { id: 'm063', hanzi: '旅遊', trees: 'Lee(oo)3 yoh2', pinyin: 'lǚ yóu', meaning: 'Travel', hook: 'Sa<u>lu</u>t + <u>you</u>', mnemonic: 'French "Sa<u>lu</u>t" (Hi) + "<u>you</u>". While traveling, say "Hi" (Sa<u>lu</u>t) to <u>you</u>.', category: 'Travel', author: 'Author Pick', likes: 165 },
    { id: 'm064', hanzi: '拍照', trees: 'pie (r)dsaw4', pinyin: 'pāi zhào', meaning: 'Take a photo', hook: '<u>pie</u> + <u>jaw</u>', mnemonic: 'Before eating the <u>pie</u>, take a photo. After eating the <u>pie</u>, you\'ll be looking for your <u>jaw</u> on the floor.', category: 'Travel', author: 'Author Pick', likes: 208 },
    { id: 'm065', hanzi: '排隊', trees: 'pie2 dooay4', pinyin: 'pái duì', meaning: 'Line up / Queue', hook: '<u>pie</u> + Yes (<u>dooay4</u>)', mnemonic: 'Is this the line for the <u>pie</u>? Yes (<u>dooay4</u>)!', category: 'Travel', author: 'Author Pick', likes: 199 },
    { id: 'm066', hanzi: '地址', trees: 'dee4 (r)ds3', pinyin: 'dì zhǐ', meaning: 'Address', hook: '<u>deeds</u>', mnemonic: 'Sounds like "<u>deeds</u>". Different <u>deeds</u>, different addresses.', category: 'Travel', author: 'Author Pick', likes: 214 },
    { id: 'm067', hanzi: '護照', trees: 'hoo4 (r)dsaw4', pinyin: 'hù zhào', meaning: 'Passport', hook: '<u>who</u> + <u>jaw</u>', mnemonic: '"<u>Who</u>" (hoo4) + "<u>jaw</u>" (photo) — <u>Who</u> is that in your jaw-dropping passport photo?', category: 'Travel', author: 'Author Pick', likes: 183 },
    { id: 'm068', hanzi: '駕照', trees: 'jeeah4 (r)dsaw4', pinyin: 'jià zhào', meaning: 'Driver\'s License', hook: '<u>jar</u> (home) + <u>jaw</u>', mnemonic: '"jeeah4" is a near-homophone of "jeeah" (<u>home</u> / <u>jar</u>). Drive safe, get home safe.', category: 'Travel', author: 'Author Pick', likes: 157 },
    { id: 'm069', hanzi: '電話', trees: 'deean4 hooah4', pinyin: 'diàn huà', meaning: 'Telephone', hook: '<u>the en</u>(d) + <u>who are</u>', mnemonic: 'Call to ask: "At <u>the en</u>(d) of the movie, <u>who are</u> they?"', category: 'Travel', author: 'Author Pick', likes: 170 },
    { id: 'm070', hanzi: '指紋', trees: '(r)ds3 wer-n2', pinyin: 'zhǐ wén', meaning: 'Fingerprint', hook: '"<u>when\'s</u>" backwards', mnemonic: 'If you read "<u>when\'s</u>" backwards, it\'s almost the same. <u>When\'s</u> the fingerprint scan?', category: 'Travel', author: 'Author Pick', likes: 145 },
    { id: 'm071', hanzi: '下午', trees: 'seeah4 woo3', pinyin: 'xià wǔ', meaning: 'Afternoon', hook: '<u>see a</u> <u>wo</u>(lf)', mnemonic: 'To see a doctor is not like to <u>see a</u> <u>wo</u>(lf) this afternoon.', category: 'Travel', author: 'Author Pick', likes: 181 },
    { id: 'm072', hanzi: '頭疼', trees: 'toh2 ter-ng2', pinyin: 'tóu téng', meaning: 'Headache', hook: '<u>toe</u> + <u>tongue</u>', mnemonic: 'Sounds like "<u>toe</u>" + "<u>tongue</u>". <u>Tongue</u>-ache and toothache gave me a headache!', category: 'Travel', author: 'Author Pick', likes: 197 },
    { id: 'm073', hanzi: '體溫', trees: 'tee3 wer-n', pinyin: 'tǐ wēn', meaning: 'Body Temperature', hook: '<u>tea when</u>', mnemonic: 'Is it useful to drink hot <u>tea when</u> one has a cold?', category: 'Travel', author: 'Author Pick', likes: 153 },
    { id: 'm074', hanzi: '天', trees: 'teean', pinyin: 'tiān', meaning: 'Day / Sky', hook: '<u>tea \'n\'</u>', mnemonic: 'What a perfect "day" for <u>tea \'n\'</u> snacks!', category: 'Travel', author: 'Author Pick', likes: 162 },
    { id: 'm075', hanzi: '遠', trees: 'yee(oo)an3', pinyin: 'yuǎn', meaning: 'Far', hook: '<u>Yuan</u>', mnemonic: 'How far will 100 <u>Yuan</u> go in China?', category: 'Travel', author: 'Author Pick', likes: 158 },
    { id: 'm076', hanzi: '房間', trees: 'fang2 jeean', pinyin: 'fáng jiān', meaning: 'Room', hook: '<u>fung</u>us + <u>Gee, an</u>', mnemonic: 'The giant mushroom is a <u>fung</u>us. <u>Gee, an</u> umbrella inside the room!', category: 'Travel', author: 'Author Pick', likes: 144 },
    { id: 'm077', hanzi: '教室', trees: 'jeeaw4 (r)s4', pinyin: 'jiào shì', meaning: 'Classroom', hook: '<u>Gee, awes</u>ome', mnemonic: '<u>Gee, awes</u>ome classroom!', category: 'Travel', author: 'Author Pick', likes: 149 },
    { id: 'm078', hanzi: '順利', trees: 'soon4 Lee4', pinyin: 'shùn lì', meaning: 'Go smoothly', hook: '<u>soonly</u>', mnemonic: 'Sounds like "<u>soonly</u>". I hope to hear from you <u>soon</u>, and may everything go smoothly!', category: 'Travel', author: 'Author Pick', likes: 156 },

    // === 4. People, Pronouns & Relationships (人物社交篇) ===
    { id: 'm079', hanzi: '朋友', trees: 'per-ng2 yoh3', pinyin: 'péng you', meaning: 'Friend', hook: '<u>peng</u>(uin) <u>you</u>', mnemonic: 'Sounds like the underlined parts of "<u>peng</u>uin <u>you</u>"!', category: 'People', author: 'Author Pick', likes: 221 },
    { id: 'm080', hanzi: '陪我', trees: 'pay2 wer3', pinyin: 'péi wǒ', meaning: 'Accompany me', hook: '<u>pay</u> + <u>wer3</u>', mnemonic: 'No <u>pay</u>ment required, join me (<u>wer3</u>) on my journey.', category: 'People', author: 'Author Pick', likes: 168 },
    { id: 'm081', hanzi: '同事', trees: 'ter-oong2 (r)s4', pinyin: 'tóng shì', meaning: 'Colleague', hook: 'car<u>toons</u>', mnemonic: 'My colleague likes car<u>toons</u>.', category: 'People', author: 'Author Pick', likes: 180 },
    { id: 'm082', hanzi: '姐姐', trees: 'jeer3 jeer', pinyin: 'jiě jie', meaning: 'Elder sister', hook: '<u>jeer</u>', mnemonic: 'The crowd, including my elder sister, <u>jeer</u>ed at me.', category: 'People', author: 'Author Pick', likes: 202 },
    { id: 'm083', hanzi: '姓名', trees: 'sing4 ming2', pinyin: 'xìng míng', meaning: 'Full Name', hook: '<u>Sing</u> + Yao <u>Ming</u>', mnemonic: '<u>Sing</u> one\'s name out like "Yao <u>Ming</u>".', category: 'People', author: 'Author Pick', likes: 193 },
    { id: 'm084', hanzi: '簽名', trees: 'tseean ming2', pinyin: 'qiān míng', meaning: 'Signature / Autograph', hook: 'thousand (<u>tseean</u>) + <u>Ming</u>', mnemonic: 'Associate a value of several thousand (<u>tseean</u>) dollars with Yao <u>Ming</u>\'s signature basketball!', category: 'People', author: 'Author Pick', likes: 176 },
    { id: 'm085', hanzi: '我的', trees: 'wer3 der', pinyin: 'wǒ de', meaning: 'My / Mine', hook: '<u>wor</u>(l)<u>d</u>', mnemonic: 'Similar to "<u>word</u>" or <u>wor</u>(l)<u>d</u>. My <u>wor</u>(l)<u>d</u>!', category: 'People', author: 'Author Pick', likes: 184 },
    { id: 'm086', hanzi: '你的', trees: 'nee3 der', pinyin: 'nǐ de', meaning: 'Your / Yours', hook: '<u>need</u>', mnemonic: 'Sounds like "<u>need</u>". Yours is what you <u>need</u>.', category: 'People', author: 'Author Pick', likes: 190 },
    { id: 'm087', hanzi: '它', trees: 'tah', pinyin: 'tā', meaning: 'It / He / She', hook: '<u>Tar</u>get', mnemonic: 'This product (it) is exclusive to <u>Tar</u>get. She has to buy it at <u>Tar</u>get.', category: 'People', author: 'Author Pick', likes: 164 },
    { id: 'm088', hanzi: '老', trees: 'Law3', pinyin: 'lǎo', meaning: 'Old', hook: '<u>law</u>', mnemonic: 'Good old <u>law</u>s last.', category: 'People', author: 'Author Pick', likes: 159 },

    // === 5. Culture, History & Landmarks (文化古蹟篇) ===
    { id: 'm089', hanzi: '龍椅', trees: 'Ler-oong2 yee3', pinyin: 'lóng yǐ', meaning: 'Emperor\'s Dragon Throne', hook: '<u>LONE</u>(L)<u>Y</u>', mnemonic: 'Sounds like <u>LONE</u>(L)<u>Y</u> without "L". The One on the Throne is <u>lone</u>(l)<u>y</u>.', category: 'Culture', author: 'Author Pick', likes: 244 },
    { id: 'm090', hanzi: '午門', trees: 'woo3 mer-n2', pinyin: 'wǔ mén', meaning: 'The Meridian Gate', hook: '<u>woman</u>', mnemonic: 'Sounds like "<u>woman</u>". A <u>woman</u> at her meridian is both the navigator and the destination.', category: 'Culture', author: 'Author Pick', likes: 217 },
    { id: 'm091', hanzi: '椅子', trees: 'yee3 ds', pinyin: 'yǐ zi', meaning: 'Chair', hook: '<u>ease</u>', mnemonic: 'A chair is for <u>ease</u>. Grab a chair and take five (5).', category: 'Culture', author: 'Author Pick', likes: 167 },
    { id: 'm092', hanzi: '歷史', trees: 'Lee4 (r)s3', pinyin: 'lì shǐ', meaning: 'History', hook: '<u>Lease</u>', mnemonic: 'Life is a <u>Lease</u> on History.', category: 'Culture', author: 'Author Pick', likes: 188 },
    { id: 'm093', hanzi: '高', trees: 'gaw', pinyin: 'gāo', meaning: 'High / Tall', hook: '<u>Go</u>(d)', mnemonic: 'Sounds like "<u>Go</u>(d)" without "d". <u>GO</u>(D) is the ultimate High.', category: 'Culture', author: 'Author Pick', likes: 179 },
    { id: 'm094', hanzi: '山', trees: '(r)san', pinyin: 'shān', meaning: 'Mountain', hook: '<u>sun</u>', mnemonic: 'The <u>sun</u> rises over the mountain.', category: 'Culture', author: 'Author Pick', likes: 185 },
    { id: 'm095', hanzi: '美國', trees: 'may3 gooer2', pinyin: 'měi guó', meaning: 'The United States', hook: '<u>May</u>flower + <u>goo</u>se', mnemonic: 'No <u>May</u>flower, no United States!', category: 'Culture', author: 'Author Pick', likes: 194 },
    { id: 'm096', hanzi: '中國', trees: '(r)dser-oong gooer2', pinyin: 'zhōng guó', meaning: 'China', hook: '<u>drone</u> country', mnemonic: '"(r)dser-oong" sounds like "<u>drone</u>" — the world\'s <u>drone</u>-making country!', category: 'Culture', author: 'Author Pick', likes: 172 },

    // === 6. Numbers & Power Anchors (數字神錨篇) ===
    { id: 'm097', hanzi: '六', trees: 'Leeoh4', pinyin: 'liù', meaning: 'Six (6) / Awesome!', hook: '<u>Leo</u>', mnemonic: 'Sounds like "<u>Leo</u>". If somebody shouts "666" at you in China, it means you are awesome / a pro / a <u>Leo</u>!', category: 'Numbers', author: 'Author Pick', likes: 226 },
    { id: 'm098', hanzi: '八', trees: 'bah', pinyin: 'bā', meaning: 'Eight (8) / Lucky', hook: '<u>ba</u>(r)', mnemonic: 'Sounds like "<u>ba</u>(r)" without "r". Imagine a <u>ba</u>(r) full of lucky people drinking and celebrating!', category: 'Numbers', author: 'Author Pick', likes: 210 },
    { id: 'm099', hanzi: '九', trees: 'jeeoh3', pinyin: 'jiǔ', meaning: 'Nine (9) / Long-lasting', hook: '<u>Joe</u>', mnemonic: 'Sounds like "<u>Joe</u>". <u>Leo</u> (6) pours the wine for Uncle <u>Joe</u> (9) at the <u>Ba</u>(r) (8)!', category: 'Numbers', author: 'Author Pick', likes: 207 },
    { id: 'm100', hanzi: '千', trees: 'tseean', pinyin: 'qiān', meaning: 'Thousand (1,000)', hook: 'Le<u>t\'s see an</u>', mnemonic: 'Le<u>t\'s see an</u> Egyptian pyramid! Imagine spending a thousand dollars to sigh<u>tsee an</u> Egyptian pyramid.', category: 'Numbers', author: 'Author Pick', likes: 193 }
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
