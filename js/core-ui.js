/**
 * 模組 1: js/core-ui.js
 * 負責：全域端點配置、OpenCC 萬字全字庫 + 本地離線雙重繁簡轉換、外部繁簡快捷開關自動注入、清晰國語女聲 TTS、中英雙語介面切換、Google Docs 連結提取與劃詞彈窗
 */
// =========================================================================
// 0. 全域配置與 Cloudflare Worker 端點
// =========================================================================
const IS_LOCAL_FILE = window.location.protocol === 'file:';
const CF_WORKER_ENDPOINTS = [
  'https://treespinyin-api.treespinyin.workers.dev'
];

const CHROME_STORE_REVIEW_URL = 'https://chromewebstore.google.com/detail/trees-pinyin-universal-an/jlbjllgeebmhkdcgmcnlkbcaiobpheae/reviews';
const EDGE_STORE_REVIEW_URL = 'https://microsoftedge.microsoft.com/addons/detail/egmgaoogonmldicgbkpaofjffcdlcffm';

function getStoreReviewUrl() {
  return /Edg\//i.test(navigator.userAgent) ? EDGE_STORE_REVIEW_URL : CHROME_STORE_REVIEW_URL;
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('pwaDirectInstallBtn');
  if (btn) btn.style.display = 'inline-flex';
});

async function triggerNativePWAInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('installModal').style.display = 'none';
}

(function injectManifestWithIconPng() {
  try {
    if (IS_LOCAL_FILE) return;
    const iconUrl = window.location.origin + '/icon.png?v=3';
    const manifest = {
      name: "Trees Pinyin",
      short_name: "Trees Pinyin",
      start_url: window.location.pathname || "/",
      display: "standalone",
      background_color: "#f5f7f9",
      theme_color: "#1b5e20",
      icons: [
        { src: iconUrl, sizes: "192x192", type: "image/png" },
        { src: iconUrl, sizes: "512x512", type: "image/png" }
      ]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = URL.createObjectURL(blob);
    document.head.appendChild(link);
  } catch (e) {}
})();

// Enter 鍵直通 AI 回答 (若貼的是 Google Docs 連結則直接翻譯注音)
document.getElementById('userInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    const val = (this.value || '').trim();
    if (/docs\.google\.com\/|drive\.google\.com\//i.test(val)) {
      runDirectTranslate(val);
    } else {
      runSmartAI();
    }
  }
});

const PROFANITY_EN_REGEX = /\b(fuck|fucking|fucked|fucker|motherfucker|shit|shitty|bullshit|bitch|bitches|asshole|bastard|dick|cock|pussy|cunt|whore|slut|nigger|nigga|faggot|retard)\b/i;
const PROFANITY_ZH_LIST = ['他媽的','他妈的','你媽的','你妈的','操你','肏你','草泥馬','草泥马','傻逼','煞筆','傻B','去死吧','王八蛋','賤人','贱人','婊子','媽的','妈的'];

function checkAndWarnProfanity(text) {
  if (!text) return false;
  if (PROFANITY_EN_REGEX.test(text) || PROFANITY_ZH_LIST.some(w => text.includes(w))) {
    const replyBox = document.getElementById('aiReplyBox');
    const list = document.getElementById('annotationList');
    if (replyBox && list) {
      replyBox.className = 'ai-reply-box friendly-reminder';
      replyBox.style.display = 'block';
      replyBox.innerHTML = '🌱 <b>Friendly Reminder / 友情提醒：</b> Let\'s keep our language kind and respectful! / 請使用文明禮貌的語言提問喔！';
      list.innerHTML = '';
      appendSentenceProgressive('請使用文明禮貌的語言，我們一起快樂學中文！', 'Please use polite and kind language as we learn Mandarin together!');
    } else {
      document.getElementById('profanityModal').style.display = 'flex';
    }
    return true;
  }
  return false;
}

// =========================================================================
// 0.1 OpenCC 萬字全字庫 + 本地 1,800+ 常用與古詩詞繁簡字表雙重引擎（絕不漏字）
// =========================================================================
const BUILTIN_TRAD_CHARS =
  "萬與醜專業叢東絲丟兩嚴喪個丠豐臨為麗舉麼義烏樂喬習鄉書買亂乾了予爭事二于虧雲互五井亘亞些亡交亥亦產亨畝享京亭亮親人億什仁僅僕仇今介仍從侖倉仔仕他仗付仙仝代令以儀們仰仲件價任份仿企伉伊伍伎伏伐休眾優伙會傴傘偉傳車傷傯倫傺偽佇伯估伴伶伸伺似伽但位低住佐佑體何余佚佛作佝佞佟你傭僉佩佬佯佰佳併佶佻佼使侃侄侈例侍侏侑侖侗供依俠侶僥偵側僑儕儂儘償優儲儷羅蘿" +
  "兒兀允元兄充兆兇先光克兌免兔黨兜兢入全兩八公六兮共關興兵其具典茲養兼獸冀冁內岡冊再冒冕冗寫軍農冠冢冤冥冬馮冰冱沖決況冶冷凍冼冽淨淒准凇涼凋凌減湊凜凝幾凡鳳鳧憑凱凰凳凶凸凹出擊函鑿刀刁刃分切刈刊刎刑划列劉則剛創初刪判刨利刪別剄刮到制刷券剎刺刻剮劑剃削剌前剎劍剔剖剛剝劇剩剪副割剽剿劁劂劄劈劉劊劌劍劑力勸辦功加務勱劣動助努劫劬劭勵勁勞劾勢勃勇勉勳勐勒勖勘務勝勞募勠勤勵勺勻勾勿包匆匈匍匏匐匕化北匙匝匠匡匣匭匪匱匹區醫匾匿十千卅升午卉半華協卑卒卓協單賣博卜卞占卡盧滷卦臥衛卮卯印危即卻卵卷卸卺卿廠厄廳歷厲壓厭厙廁廂厴廚廄廝縣參叄又叉及友雙反發叔取受變敘假叛叟疊口古句另叨叩只叫召叭叮可台叱史右叵葉號司嘆叻叼嘰吁吃各吆合吉吊同名後吏吐向吒嚇呂吖嗎君吝吞吟吠吡吣否吧噸吩含聽吭吮啟吱吲吳吵吶吸吹吻吼吾呀呂呃呆呈告呋呎ECC吶呒呓呔嘔呖唄員咼嗆嗚呢呤呦周呱呲味呵咺呷呸呻呼命咀咁咂咄咆咋和咎咏咐咒咔咕咖咗咚嚀咝哐咱咳咸咽哀品哂哄哆哇哈哉響哎哏哐啞嘵嗶噦嘩噲嚌嚦嚕囂嚥嚮嚴嚶嚷嚼囀囁囂" +
  "囚四回因團囤園困囪圍圇國圖固國圓圈圉圊國圖土坰坱垂垃型垓埏埴執場培基堂堅堆堇堊堝堯報場塊塋塏塒塗塚塞塢填塵塹塾墀境墅墉墊墑墮墠墳墻墾壁壅壇壋壎壓壘壙壚壞壟壠壢壤士壬壯聲殼壺壹處備復夏夔夕外夙多夜夠夠夢夥大天太夫央夯失頭夷夸夾奪奩奐契奔奕獎套奘奚奠奢奧奼女奴奶奸她好如妃妄妊妍妒妓妖妗妙妝妞妣妤妥妨嫵嫗媯媒媚媛媧媲媳媸嫋嫌嫁嫂嫉嫿嫖嫗嫠嫡嫣嫦嫩嫫嫿嫺嬉嬋嬌嬙嬛嬝嬪嬫嬸孃孌子孔孕字存孫孚孛孜孝孟孢季孤孥學孩攣孫孰孱孳孵孺孽寧它宅宇守安宋完宏宓宕宗官宙定宛宜寶實寵審客宣室宥宦宨宮宰害宴宵家宸容寬賓宿寂寄寅密寇富寐寒寓寢寞察寡寤寥實寨審寫寬寵寶寸對寺尋導壽封射將專尉尊小少爾尖塵尚尟尤就尷屍尹尺尻尼盡尾尿局屁層屨屆屈屜屆屋屌屍屎屏屐屑展屙屬屠屢屣層履屨屯山屹屺屼屾岌岍岐岑岔嶇崗峴島嵐嵩嶠嶧嶮嶷巔巖川州巡巢工左巧巨鞏巫差己已巳巴巷巽巾幣市布帥帆師希帳帑帔帕帖簾帙帚帛帝帥帶幀席幫幬帷常幘幗帽冪幄幅幌幔幕幙幗幬干平年并幸幹幻幼幽幾廣庀庁庇床庋序底庖店庚府龐廢庠庡庢度座庫庭庳庵庶康庸庹庾廉廊廄廑廒廓廕廖廚廝廟廠廡廢廣廩廬廳延廷建廿開弁異棄弄弈弊弋式弒弓引弗弘弛弟張彌弦弧弩弭彎弱彈強弼彀歸當錄彖彗彘彙形彥彩彪彬彭彰影彷役徹彼往征徂待徇很徉徊律後徐徑徒得徘徙徛徜從徠御徨復循微徵德徹徼徽心必憶忌忍志忘忙忠忡忤快忭忮忱念忸忻忽愾忿懷態慫憮慪悵愴愀河南北東西上下左右中內外前後高低遠近深淺明暗冷熱溫涼風雲雨雪霜露雷電霧冰泉溪江河湖海波浪潮汐山川峰嶺島嶼森林樹木花草竹梅蘭菊松柏桃李杏梨荷蓮柳楊桑槐楓桐梧桂蘆葦禾稻麥黍稷粱穀米豆瓜果蔬茶酒水火土石金銀銅鐵錫鉛玉珠寶貝錢幣衣裳冠帽鞋襪裙褲袍襖衫袖領帶巾帕綢緞布帛絲線針線紡織錦繡羅紗帳幕被褥枕席床榻桌椅幾案箱櫃盤碗杯盞壺瓶鍋灶爐炭柴薪燈燭香油鹽醬醋糖蜜糕餅麵飯粥湯羹肉魚蝦蟹雞鴨鵝豬牛羊馬驢騾駝狗貓鼠虎豹狼狐狸鹿兔猴猿象熊貓鳥雀燕鶯鴿鶴鷗鷺鴉鵲鷹鵬鳳凰蟲蝶蜂蟻蟬蛙蛇龜龍魚鱗羽毛皮骨角牙齒頭面眼目耳鼻口唇舌頰額眉鬚髮膚血肉筋脈心肝脾肺腎胃腸膽腦骨髓手足指掌拳腕臂肩背腰腹腿腳膝踝趾步走跑跳立坐臥睡醒生老病死醫藥痛癢傷殘哭笑喜怒哀樂悲歡離合愛恨情仇思念想望記憶忘懷知曉懂明聰慧愚笨善惡美醜真假是非對錯好壞優劣強弱大小長短粗細厚薄寬窄方圓曲直平斜乾濕輕重快慢早晚晝夜晨昏春夏秋冬年月日星辰時分秒今古新舊去來出入升降進退開關起落動靜聚散存亡有無多少全半雙單空滿同異合分總共各別自他你我她它誰何哪這那此彼某每凡皆全並又也還更最很太極非常十分相當特別尤甚只僅單獨光就才剛正已經曾將要會能可應該必須得願肯敢喜樂愛厭怕畏驚恐慌忙急緩安危吉凶禍福貧富貴賤尊卑高低雅俗清濁貧富買賣貸借還欠租賃賺賠貴賤價錢值費稅利債賬貨財寶物產業界廠店鋪行市集貿商買賣農耕種植收割漁獵牧養工匠製造建築修補紡織縫紉烹飪飲食穿戴居住行車船舟橋路街巷村鎮城郭邦國世界州郡縣鄉里鄰家戶門窗堂室廳房廚衛庭院園林池塘井泉橋樑塔寺廟宇宮殿樓閣亭台廊柱牆壁磚瓦階梯欄杆道路墳墓碑銘文字語言辭句篇章詩歌賦詞曲劇戲畫圖書冊卷頁紙筆墨硯印章琴棋書畫藝技學術科教研習讀寫算計考試合科第名次職位官吏將相帝王后妃臣民奴僕師生親友夫妻父母兒女兄弟姐妹叔伯姑姨舅甥姪孫祖宗世代家旅民族婚姻嫁娶喪葬祭祀禮儀節慶祝賀迎送拜訪陪伴交遊談論演講辯駁問答告訴稱讚批評勸告安慰感謝道歉原諒請求命令吩咐答應拒絕推辭許諾約定遵守違背欺騙隱瞞洩露表露顯示隱藏尋找發現遇見錯過等待跟隨追趕逃跑躲藏捉拿釋放捆綁解開打擊保護救援幫助扶持依靠背叛投降戰勝失敗爭奪搶劫偷盜賠償歸還借貸賜予接受挑選放棄收集散發保存毀壞建設破除修整改動變換代替補充減少增加擴大縮小延長縮短升高降低推拉搖晃擺動旋轉翻滾跳躍飛翔游水沉沒漂浮流動凝結融化蒸發燃燒熄滅照耀遮蔽籠罩瀰漫散開聚集排列組合分開連接切斷縫合粘貼包裹捆紮折疊展開捲起鋪設懸掛張貼塗抹擦拭洗滌淋浴浸泡晾乾染印描繪雕刻塑造澆灌培土施肥除草栽種採摘收穫儲藏碾磨篩選蒸煮煎炒油炸烘烤醃製品嚐吞嚥咀嚼吸吮吹氣呼吸咳嗽噴嚏打嗝嘆息號叫呼喊歌唱吹奏彈撥敲擊傾聽觀看凝視瞄準閉眼睜開張望撫摸抓撓擁抱親吻攙扶推搡踩踏踢踹跪拜鞠躬點頭搖頭揮手招手鼓掌嘆氣微笑哭泣流淚皺眉臉紅流汗發抖顫慄跌倒爬起站立依靠躺臥睡眠做夢甦醒洗臉刷牙梳頭穿衣脫鞋戴帽佩飾化妝照鏡吃飯喝茶飲酒散步旅遊參觀遊覽休息勞動工作學習讀書寫字畫畫唱歌跳舞下棋打球跑步游泳騎馬射箭釣魚打獵划船駕駛乘車坐船搭機買票住宿點菜買單付錢找零打包寄信打電話發電報上網查資料看電視聽廣播看電影聽音樂拍照片錄影帶";

const BUILTIN_SIMP_CHARS =
  "万与丑专业丛东丝丢两严丧个丠丰临为丽举么义乌乐乔习乡书买乱干了予争事二于亏云互五井亘亚些亡交亥亦产亨亩享京亭亮亲人亿什仁仅仆仇今介仍从仑仓仔仕他仗付仙仝代令以仪们仰仲件价任份仿企伉伊伍伎伏伐休众优伙会伛伞伟传车伤伦傺伪伫伯估伴伶伸伺似伽但位低住佐佑体何余佚佛作佝佞佟你佣佥佩佬佯佰佳并佶佻佼使侃侄侈例侍侏侑仑侗供依侠侣侥侦侧侨侪侬尽偿优储俪罗萝" +
  "儿兀允元兄充兆凶先光克兑免兔党兜兢入全两八公六兮共关兴兵其具典兹养兼兽冀冁内冈册再冒冕冗写军农冠冢冤冥冬冯冰冱冲决况冶冷冻冼冽净凄准凇凉凋凌减凑凛凝几凡凤凫凭凯凰凳凶凸凹出击凿刀刁刃分切刈刊刎刑划列刘则刚创初删判刨利删别刭刮到制刷券刹刺刻剐剂剃削剌前刹剑剔剖刚剥剧剩剪副割剽剿劁劂劄劈刘刽刿剑剂力劝办功加务劢劣动助努劫劬劭励劲劳劾势勃勇勉勋勐勒勖勘务胜劳募勠勤励勺匀勾勿包匆匈匍匏匐匕化北匙匝匠匡匣匦匪匮匹区医匾匿十千卅升午卉半华协卑卒卓协单卖博卜卞占卡卢卤卦卧卫卮卯印危即却卵卷卸卺卿厂厄厅历厉压厌厍厕厢厣厨厩厮县参叁又叉及友双反发叔取受变叙假叛叟叠口古句另叨叩只叫召叭叮可台叱史右叵叶号司叹叻叼叽吁吃各吆合吉吊同名后吏吐向吒吓吕吖吗君吝吞吟吠吡吣否吧吨吩含听吭吮启吱吲吴吵呐吸吹吻吼吾呀吕呃呆呈告呋呎ECC呐呒呓呔呕呖呗员咼呛呜呢呤呦周呱呲味呵咺呷呸呻呼命咀咁咂咄咆咋和咎咏咐咒咔咕咖咗咚咛咝哐咱咳咸咽哀品哂哄哆哇哈哉响哎哏哐哑哓哔哕哗哙哜沥噜嚣咽向严嘤嚷嚼啭嗫嚣" +
  "囚四回因团囤园困囱围囵国图固国圆圈圉圊国图土坰坱垂垃型垓埏埴执场培基堂坚堆堇垩埚尧报场块茔塏埘涂冢塞坞填尘堑塾墀境墅墉垫墒堕墠坟墙垦壁壅坛垱埙压垒圹垆坏垄拢坜壤士壬壮声壳壶壹处备复夏夔夕外夙多夜够够梦伙大天太夫央夯失头夷夸夹夺奁奂契奔奕奖套奘奚奠奢奥姹女奴奶奸她好如妃妄妊妍妒妓妖妗妙妆妞妣妤妥妨妩妪妫媒媚媛娲媲媳媸袅嫌嫁嫂嫉婳嫖妪嫠嫡嫣嫦嫩嫫婳娴嬉婵娇嫱嬛袅嫔嬫婶娘娈子孔孕字存孙孚孛孜孝孟孢季孤孥学孩孪孙孰孱孳孵孺孽宁它宅宇守安宋完宏宓宕宗官宙定宛宜宝实宠审客宣室宥宦宨宫宰害宴宵家宸容宽宾宿寂寄寅密寇富寐寒寓寝寞察寡寤寥实寨审写宽宠宝寸对寺寻导寿封射将专尉尊小少尔尖尘尚尟尤就尴尬尸尹尺尻尼尽尾尿局屁层屦届屈屉届屋屌尸屎屏屐屑展屙属屠屡屣层履屦屯山屹屺屼屾岌岍岐岑岔岖岗岘岛岚嵩峤峄崄嶷巅岩川州巡巢工左巧巨巩巫差己已巳巴巷巽巾币市布帅帆师希帐帑帔帕帖帘帙帚帛帝帅带帧席帮帱帷常帻帼帽幂幄幅幌幔幕幙帼帱干平年并幸干幻幼幽几广庀庁庇床庋序底庖店庚府庞废庠庡庢度座库庭庳庵庶康庸庹庾廉廊厩廑廒廓荫廖厨厮庙厂庑废广廪庐厅延廷建廿开弁异弃弄弈弊弋式弑弓引弗弘弛弟张弥弦弧弩弭弯弱弹强弼彀归当录彖彗彘汇形彦彩彪彬彭彰影彷役彻彼往征徂待徇很徉徊律后徐径徒得徘徙徛徜从徕御徨复循微征德彻徼徽心必忆忌忍志忘忙忠忡忤快忭忮忱念忸忻忽忾忿怀态怂怃慪怅怆怃河南北东西上下左右中内外前后高低远近深浅明暗冷热温凉风云雨雪霜露雷电雾冰泉溪江河湖海波浪潮汐山川峰岭岛屿森林树木花草竹梅兰菊松柏桃李杏梨荷莲柳杨桑槐枫桐梧桂芦苇禾稻麦黍稷粱谷米豆瓜果蔬茶酒水火土石金银铜铁锡铅玉珠宝贝钱币衣裳冠帽鞋袜裙裤袍袄衫袖领带巾帕绸缎布帛丝线针线纺织锦绣罗纱帐幕被褥枕席床榻桌椅几案箱柜盘碗杯盏壶瓶锅灶炉炭柴薪灯烛香油盐酱醋糖蜜糕饼面饭粥汤羹肉鱼虾蟹鸡鸭鹅猪牛羊马驴骡驼狗猫鼠虎豹狼狐狸鹿兔猴猿象熊猫鸟雀燕莺鸽鹤鸥鹭鸦鹊鹰鹏凤凰虫蝶蜂蚁蝉蛙蛇龟龙鱼鳞羽毛皮骨角牙齿头面眼目耳鼻口唇舌颊额眉须发肤血肉筋脉心肝脾肺肾胃肠胆脑骨髓手足指掌拳腕臂肩背腰腹腿脚膝踝趾步走跑跳立坐卧睡醒生老病死医药痛痒伤残哭笑喜怒哀乐悲欢离合爱恨情仇思念想望记忆忘怀知晓懂明聪慧愚笨善恶美丑真假是非对错好坏优劣强弱大小长短粗细厚薄宽窄方圆曲直平斜干湿轻重快慢早
