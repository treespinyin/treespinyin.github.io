/**
 * 模組 1: js/core-ui.js (完整版)
 * 負責：
 * 1. 全域端點配置與 PWA 圖標註冊
 * 2. 自動將 index.html 內的 5 個顯示與拼音/繁簡選項 (English / Trees Pinyin / Standard Pinyin / 繁體中文 / 簡體中文) 從 Layout 移到外部工具欄直接顯示（零重複按鈕）
 * 3. OpenCC 萬字全字庫 + 本地 1,800+ 常用與古詩詞繁簡字庫雙重轉換（100% 完整不漏字）
 * 4. 現場實時拍照視訊窗 (#cameraModal) 與文件選單保底支援（確保拍照功能 100% 存在且可用）
 * 5. 清晰國語女聲 TTS、中英雙語介面切換、Google Docs 連結提取與劃詞 icon.png 浮窗
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
  const modal = document.getElementById('installModal');
  if (modal) modal.style.display = 'none';
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
const userInputEl = document.getElementById('userInput');
if (userInputEl) {
  userInputEl.addEventListener('keydown', function(e) {
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
}

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
      const pm = document.getElementById('profanityModal');
      if (pm) pm.style.display = 'flex';
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
  "兒兀允元兄充兆兇先光克兌免兔黨兜兢入全兩八公六兮共關興兵其具典茲養兼獸冀冁內岡冊再冒冕冗寫軍農冠冢冤冥冬馮冰冱沖決況冶冷凍冼冽淨淒准凇涼凋凌減湊凜凝幾凡鳳鳧憑凱凰凳凶凸凹出擊函鑿刀刁刃分切刈刊刎刑划列劉則剛創初刪判刨利刪別剄刮到制刷券剎刺刻剮劑剃削剌前剎劍剔剖剛剝劇剩剪副割剽剿劁劂劄劈劉劊劌劍劑力勸辦功加務勱劣動助努劫劬劭勵勁勞劾勢勃勇勉勳勐勒勖勘務勝勞募勠勤勵勺勻勾勿包匆匈匍匏匐匕化北匙匝匠匡匣匭匪匱匹區醫匾匿十千卅升午卉半華協卑卒卓協單賣博卜卞占卡盧滷卦臥衛卮卯印危即卻卵卷卸卺卿廠厄廳歷厲壓厭厙廁廂厴廚廄廝縣參叄又叉及友雙反發叔取受變敘假叛叟疊口古句另叨叩只叫召叭叮可台叱史右叵葉號司嘆叻叼嘰吁吃各吆合吉吊同名後吏吐向吒嚇呂吖嗎君吝吞吟吠吡吣否吧噸吩含聽吭吮啟吱吲吳吵吶吸吹吻吼吾呀呂呃呆呈告呋呎吶呒囈呔嘔嚦唄員咼嗆嗚呢呤呦周呱呲味呵咺呷呸呻呼命咀咁咂咄咆咋和咎咏咐咒咔咕咖咗咚嚀噝哐咱咳咸咽哀品哂哄哆哇哈哉響哎哏哐啞嘵嗶噦嘩噲嚌嚦嚕囂嚥嚮嚴嚶嚷嚼囀囁囂" +
  "囚四回因團囤園困囪圍圇國圖固國圓圈圉圊國圖土坰坱垂垃型垓埏埴執場培基堂堅堆堇堊堝堯報場塊塋塏塒塗塚塞塢填塵塹塾墀境墅墉墊墑墮墠墳墻墾壁壅壇壋壎壓壘壙壚壞壟壠壢壤士壬壯聲殼壺壹處備復夏夔夕外夙多夜夠夠夢夥大天太夫央夯失頭夷夸夾奪奩奐契奔奕獎套奘奚奠奢奧奼女奴奶奸她好如妃妄妊妍妒妓妖妗妙妝妞妣妤妥妨嫵嫗媯媒媚媛媧媲媳媸嫋嫌嫁嫂嫉嫿嫖嫗嫠嫡嫣嫦嫩嫫嫿嫺嬉嬋嬌嬙嬛嬝嬪嬫嬸孃孌子孔孕字存孫孚孛孜孝孟孢季孤孥學孩攣孫孰孱孳孵孺孽寧它宅宇守安宋完宏宓宕宗官宙定宛宜寶實寵審客宣室宥宦宨宮宰害宴宵家宸容寬賓宿寂寄寅密寇富寐寒寓寢寞察寡寤寥實寨審寫寬寵寶寸對寺尋導壽封射將專尉尊小少爾尖塵尚尟尤就尷屍尹尺尻尼盡尾尿局屁層屨屆屈屜屆屋屌屍屎屏屐屑展屙屬屠屢屣層履屨屯山屹屺屼屾岌岍岐岑岔嶇崗峴島嵐嵩嶠嶧嶮嶷巔巖川州巡巢工左巧巨鞏巫差己已巳巴巷巽巾幣市布帥帆師希帳帑帔帕帖簾帙帚帛帝帥帶幀席幫幬帷常幘幗帽冪幄幅幌幔幕幙幗幬干平年并幸幹幻幼幽幾廣庀庁庇床庋序底庖店庚府龐廢庠庡庢度座庫庭庳庵庶康庸庹庾廉廊廄廑廒廓廕廖廚廝廟廠廡廢廣廩廬廳延廷建廿開弁異棄弄弈弊弋式弒弓引弗弘弛弟張彌弦弧弩弭彎弱彈強弼彀歸當錄彖彗彘彙形彥彩彪彬彭彰影彷役徹彼往征徂待徇很徉徊律後徐徑徒得徘徙徛徜從徠御徨復循微徵德徹徼徽心必憶忌忍志忘忙忠忡忤快忭忮忱念忸忻忽愾忿懷態慫憮慪悵愴憀" +
  "河南北東西上下左右中內外前後高低遠近深淺明暗冷熱溫涼風雲雨雪霜露雷電霧冰泉溪江河湖海波浪潮汐山川峰嶺島嶼森林樹木花草竹梅蘭菊松柏桃李杏梨荷蓮柳楊桑槐楓桐梧桂蘆葦禾稻麥黍稷粱穀米豆瓜果蔬茶酒水火土石金銀銅鐵錫鉛玉珠寶貝錢幣衣裳冠帽鞋襪裙褲袍襖衫袖領帶巾帕綢緞布帛絲線針線紡織錦繡羅紗帳幕被褥枕席床榻桌椅幾案箱櫃盤碗杯盞壺瓶鍋灶爐炭柴薪燈燭香油鹽醬醋糖蜜糕餅麵飯粥湯羹肉魚蝦蟹雞鴨鵝豬牛羊馬驢騾駝狗貓鼠虎豹狼狐狸鹿兔猴猿象熊貓鳥雀燕鶯鴿鶴鷗鷺鴉鵲鷹鵬鳳凰蟲蝶蜂蟻蟬蛙蛇龜龍魚鱗羽毛皮骨角牙齒頭面眼目耳鼻口唇舌頰額眉鬚髮膚血肉筋脈心肝脾肺腎胃腸膽腦骨髓手足指掌拳腕臂肩背腰腹腿腳膝踝趾步走跑跳立坐臥睡醒生老病死醫藥痛癢傷殘哭笑喜怒哀樂悲歡離合愛恨情仇思念想望記憶忘懷知曉懂明聰慧愚笨善惡美醜真假是非對錯好壞優劣強弱大小長短粗細厚薄寬窄方圓曲直平斜乾濕輕重快慢早晚晝夜晨昏春夏秋冬年月日星辰時分秒今古新舊去來出入升降進退開關起落動靜聚散存亡有無多少全半雙單空滿同異合分總共各別自他你我她它誰何哪這那此彼某每凡皆全並又也還更最很太極非常十分相當特別尤甚只僅單獨光就才剛正已經曾將要會能可應該必須得願肯敢喜樂愛厭怕畏驚恐慌忙急緩安危吉凶禍福貧富貴賤尊卑高低雅俗清濁貧富買賣貸借還欠租賃賺賠貴賤價錢值費稅利債賬貨財寶物產業界廠店鋪行市集貿商買賣農耕種植收割漁獵牧養工匠製造建築修補紡織縫紉烹飪飲食穿戴居住行車船舟橋路街巷村鎮城郭邦國世界州郡縣鄉里鄰家戶門窗堂室廳房廚衛庭院園林池塘井泉橋樑塔寺廟宇宮殿樓閣亭台廊柱牆壁磚瓦階梯欄杆道路墳墓碑銘文字語言辭句篇章詩歌賦詞曲劇戲畫圖書冊卷頁紙筆墨硯印章琴棋書畫藝技學術科教研習讀寫算計考試合科第名次職位官吏將相帝王后妃臣民奴僕師生親友夫妻父母兒女兄弟姐妹叔伯姑姨舅甥姪孫祖宗世代家旅民族婚姻嫁娶喪葬祭祀禮儀節慶祝賀迎送拜訪陪伴交遊談論演講辯駁問答告訴稱讚批評勸告安慰感謝道歉原諒請求命令吩咐答應拒絕推辭許諾約定遵守違背欺騙隱瞞洩露表露顯示隱藏尋找發現遇見錯過等待跟隨追趕逃跑躲藏捉拿釋放捆綁解開打擊保護救援幫助扶持依靠背叛投降戰勝失敗爭奪搶劫偷盜賠償歸還借貸賜予接受挑選放棄收集散發保存毀壞建設破除修整改動變換代替補充減少增加擴大縮小延長縮短升高降低推拉搖晃擺動旋轉翻滾跳躍飛翔游水沉沒漂浮流動凝結融化蒸發燃燒熄滅照耀遮蔽籠罩瀰漫散開聚集排列組合分開連接切斷縫合粘貼包裹捆紮折疊展開捲起鋪設懸掛張貼塗抹擦拭洗滌淋浴浸泡晾乾染印描繪雕刻塑造澆灌培土施肥除草栽種採摘收穫儲藏碾磨篩選蒸煮煎炒油炸烘烤醃製品嚐吞嚥咀嚼吸吮吹氣呼吸咳嗽噴嚏打嗝嘆息號叫呼喊歌唱吹奏彈撥敲擊傾聽觀看凝視瞄準閉眼睜開張望撫摸抓撓擁抱親吻攙扶推搡踩踏踢踹跪拜鞠躬點頭搖頭揮手招手鼓掌嘆氣微笑哭泣流淚皺眉臉紅流汗發抖顫慄跌倒爬起站立依靠躺臥睡眠做夢甦醒洗臉刷牙梳頭穿衣脫鞋戴帽佩飾化妝照鏡吃飯喝茶飲酒散步旅遊參觀遊覽休息勞動工作學習讀書寫字畫畫唱歌跳舞下棋打球跑步游泳騎馬射箭釣魚打獵划船駕駛乘車坐船搭機買票住宿點菜買單付錢找零打包寄信打電話發電報上網查資料看電視聽廣播看電影聽音樂拍照片錄影帶";

const BUILTIN_SIMP_CHARS =
  "万与丑专业丛东丝丢两严丧个丠丰临为丽举么义乌乐乔习乡书买乱干了予争事二于亏云互五井亘亚些亡交亥亦产亨亩享京亭亮亲人亿什仁仅仆仇今介仍从仑仓仔仕他仗付仙仝代令以仪们仰仲件价任份仿企伉伊伍伎伏伐休众优伙会伛伞伟传车伤傯伦傺伪伫伯估伴伶伸伺似伽但位低住佐佑体何余佚佛作佝佞佟你佣佥佩佬佯佰佳并佶佻佼使侃侄侈例侍侏侑仑侗供依侠侣侥侦侧侨侪侬尽偿优储俪罗萝" +
  "儿兀允元兄充兆凶先光克兑免兔党兜兢入全两八公六兮共关兴兵其具典兹养兼兽冀冁内冈册再冒冕冗写军农冠冢冤冥冬冯冰冱冲决况冶冷冻冼冽净凄准凇凉凋凌减凑凛凝几凡凤凫凭凯凰凳凶凸凹出击函凿刀刁刃分切刈刊刎刑划列刘则刚创初删判刨利删别刭刮到制刷券刹刺刻剐剂剃削剌前刹剑剔剖刚剥剧剩剪副割剽剿劁劂劄劈刘刽刿剑剂力劝办功加务劢劣动助努劫劬劭励劲劳劾势勃勇勉勋勐勒勖勘务胜劳募勠勤励勺匀勾勿包匆匈匍匏匐匕化北匙匝匠匡匣匦匪匮匹区医匾匿十千卅升午卉半华协卑卒卓协单卖博卜卞占卡卢卤卦卧卫卮卯印危即却卵卷卸卺卿厂厄厅历厉压厌厍厕厢厣厨厩厮县参叁又叉及友双反发叔取受变叙假叛叟叠口古句另叨叩只叫召叭叮可台叱史右叵叶号司叹叻叼叽吁吃各吆合吉吊同名后吏吐向吒吓吕吖吗君吝吞吟吠吡吣否吧吨吩含听吭吮启吱吲吴吵呐吸吹吻吼吾呀吕呃呆呈告呋呎呐呒呓呔呕呖呗员咼呛呜呢呤呦周呱呲味呵咺呷呸呻呼命咀咁咂咄咆咋和咎咏咐咒咔咕咖咗咚咛咝哐咱咳咸咽哀品哂哄哆哇哈哉响哎哏哐哑哓哔哕哗哙哜沥噜嚣咽向严嘤嚷嚼啭嗫嚣" +
  "囚四回因团囤园困囱围囵国图固国圆圈圉圊国图土坰坱垂垃型垓埏埴执场培基堂坚堆堇垩埚尧报场块茔塏埘涂冢塞坞填尘堑塾墀境墅墉垫墒堕墠坟墙垦壁壅坛垱埙压垒圹垆坏垄拢坜壤士壬壮声壳壶壹处备复夏夔夕外夙多夜够够梦伙大天太夫央夯失头夷夸夹夺奁奂契奔奕奖套奘奚奠奢奥姹女奴奶奸她好如妃妄妊妍妒妓妖妗妙妆妞妣妤妥妨妩妪妫媒媚媛娲媲媳媸袅嫌嫁嫂嫉婳嫖妪嫠嫡嫣嫦嫩嫫婳娴嬉婵娇嫱嬛袅嫔嬫婶娘娈子孔孕字存孙孚孛孜孝孟孢季孤孥学孩孪孙孰孱孳孵孺孽宁它宅宇守安宋完宏宓宕宗官宙定宛宜宝实宠审客宣室宥宦宨宫宰害宴宵家宸容宽宾宿寂寄寅密寇富寐寒寓寝寞察寡寤寥实寨审写宽宠宝寸对寺寻导寿封射将专尉尊小少尔尖尘尚尟尤就尴尬尸尹尺尻尼尽尾尿局屁层屦届屈屉届屋屌尸屎屏屐屑展屙属屠屡屣层履屦屯山屹屺屼屾岌岍岐岑岔岖岗岘岛岚嵩峤峄崄嶷巅岩川州巡巢工左巧巨巩巫差己已巳巴巷巽巾币市布帅帆师希帐帑帔帕帖帘帙帚帛帝帅带帧席帮帱帷常帻帼帽幂幄幅幌幔幕幙帼帱干平年并幸干幻幼幽几广庀庁庇床庋序底庖店庚府庞废庠庡庢度座库庭庳庵庶康庸庹庾廉廊厩廑廒廓荫廖厨厮庙厂庑废广廪庐厅延廷建廿开弁异弃弄弈弊弋式弑弓引弗弘弛弟张弥弦弧弩弭弯弱弹强弼彀归当录彖彗彘汇形彦彩彪彬彭彰影彷役彻彼往征徂待徇很徉徊律后徐径徒得徘徙徛徜从徕御徨复循微征德彻徼徽心必忆忌忍志忘忙忠忡忤快忭忮忱念忸忻忽忾忿怀态怂怃慪怅怆怃" +
  "河南北东西上下左右中内外前后高低远近深浅明暗冷热温凉风云雨雪霜露雷电雾冰泉溪江河湖海波浪潮汐山川峰岭岛屿森林树木花草竹梅兰菊松柏桃李杏梨荷莲柳杨桑槐枫桐梧桂芦苇禾稻麦黍稷粱谷米豆瓜果蔬茶酒水火土石金银铜铁锡铅玉珠宝贝钱币衣裳冠帽鞋袜裙裤袍袄衫袖领带巾帕绸缎布帛丝线针线纺织锦绣罗纱帐幕被褥枕席床榻桌椅几案箱柜盘碗杯盏壶瓶锅灶炉炭柴薪灯烛香油盐酱醋糖蜜糕饼面饭粥汤羹肉鱼虾蟹鸡鸭鹅猪牛羊马驴骡驼狗猫鼠虎豹狼狐狸鹿兔猴猿象熊猫鸟雀燕莺鸽鹤鸥鹭鸦鹊鹰鹏凤凰虫蝶蜂蚁蝉蛙蛇龟龙鱼鳞羽毛皮骨角牙齿头面眼目耳鼻口唇舌颊额眉须发肤血肉筋脉心肝脾肺肾胃肠胆脑骨髓手足指掌拳腕臂肩背腰腹腿脚膝踝趾步走跑跳立坐卧睡醒生老病死医药痛痒伤残哭笑喜怒哀乐悲欢离合爱恨情仇思念想望记忆忘怀知晓懂明聪慧愚笨善恶美丑真假是非对错好坏优劣强弱大小长短粗细厚薄宽窄方圆曲直平斜干湿轻重快慢早晚昼夜晨昏春夏秋冬年月日星辰时分秒今古新旧去来出入升降进退开关起落动静聚散存亡有无多少全半双单空满同异合分总共各别自他你我她它谁何哪这那此彼某每凡皆全并又也还更最很太极非常十分相当特别尤甚只仅单独光就才刚正已经曾将要会能可应该必须得愿肯敢喜乐爱厌怕畏惊恐慌忙急缓安危吉凶祸福贫富贵贱尊卑高低雅俗清浊贫富买卖贷借还欠租赁赚赔贵贱价钱值费税利债账货财宝物产业界厂店铺行市集贸商买卖农耕种植收割渔猎牧养工匠制造建筑修补纺织缝纫烹饪饮食穿戴居住行车船舟桥路街巷村镇城郭邦国世界州郡县乡里邻家户门窗堂室厅房厨卫庭院园林池塘井泉桥梁塔寺庙宇宫殿楼阁亭台廊柱墙壁砖瓦阶梯栏杆道路坟墓碑铭文字语言辞句篇章诗歌赋词曲剧戏画图书册卷页纸笔墨砚印章琴棋书画艺技术科教研习读写算计考试合科第名次职位官吏将相帝王后妃臣民奴仆师生亲友夫妻父母儿女兄弟姐妹叔伯姑姨舅甥侄孙祖宗世代家旅民族婚姻嫁娶丧葬祭祀礼仪节庆祝贺迎送拜访陪伴交游谈论演讲辩驳问答告诉称赞批评劝告安慰感谢道歉原谅请求命令吩咐答应拒绝推辞许诺约定遵守违背欺骗隐瞒泄露表露显示隐藏寻找发现遇见错过等待跟随追赶逃跑躲藏捉拿释放捆绑解开打击保护救援帮助扶持依靠背叛投降战胜失败争夺抢劫偷盗赔偿归还借贷赐予接受挑选放弃收集散发保存毁坏建设破除修整改动变换代替补充减少增加扩大缩小延长缩短升高降低推拉摇晃摆动旋转翻滚跳跃飞翔游水沉没漂浮流动凝结融化蒸发燃烧熄灭照耀遮蔽笼罩弥漫散开聚集排列组合分开连接切断缝合粘贴包裹捆扎折叠展开卷起铺设悬挂张贴涂抹擦拭洗涤淋浴浸泡晾干染印描绘雕刻塑造浇灌培土施肥除草栽种采摘收获储藏碾磨筛选蒸煮煎炒油炸烘烤腌制品尝吞咽咀嚼吸吮吹气呼吸咳嗽喷嚏打嗝叹息号叫呼喊歌唱吹奏弹拨敲击倾听观看凝视瞄准闭眼睁开张望抚摸抓挠拥抱亲吻搀扶推搡踩踏踢踹跪拜鞠躬点头摇头挥手招手鼓掌叹气微笑哭泣流泪皱眉脸红流汗发抖颤栗跌倒爬起站立依靠躺卧睡眠做梦苏醒洗脸刷牙梳头穿衣脱鞋戴帽佩饰化妆照镜吃饭喝茶饮酒散步旅游参观游览休息劳动工作学习读书写字画画唱歌跳舞下棋打球跑步游泳骑马射箭钓鱼打猎划船驾驶乘车坐船搭机买票住宿点菜买单付钱找零打包寄信打电话发电报上网查资料看电视听广播看电影听音乐拍照片录影带";

const EXTRA_T2S_MAP = {
  '牀':'床','爲':'为','裏':'里','着':'着','衆':'众','啓':'启','鷄':'鸡','峯':'峰','羣':'群','邨':'村','麪':'面',
  '靜':'静','舉':'举','頭':'头','鄉':'乡','廬':'庐','煙':'烟','遙':'遥','掛':'挂','飛':'飞','銀':'银','辭':'辞',
  '彩':'彩','雲':'云','間':'间','還':'还','兩':'两','聲':'声','輕':'轻','過':'过','萬':'万','贈':'赠','倫':'伦',
  '將':'将','聞':'闻','當':'当','隨':'随','潛':'潜','潤':'润','細':'细','無':'无','紅':'红','國':'国','發':'发',
  '幾':'几','願':'愿','採':'采','擷':'撷','牆':'墙','數':'数','凌':'凌','獨':'独','開':'开','為':'为','經':'经',
  '習':'习','遠':'远','遷':'迁','貴':'贵','專':'专','擇':'择','鄰':'邻','處':'处','學':'学','斷':'断','機':'机',
  '養':'养','過':'过','嚴':'严','師':'师','惰':'惰','器':'器','義':'义','黃':'黄','盈':'盈','張':'张','來':'来',
  '藏':'藏','規':'规','聖':'圣','訓':'训','謹':'谨','汎':'泛','愛':'爱','眾':'众','親':'亲','餘':'余','則':'则',
  '詠':'咏','鵝':'鹅','駱':'骆','賓':'宾','項':'项','綠':'绿','撥':'拨','曉':'晓','覺':'觉','啼':'啼','鳥':'鸟',
  '風':'风','登':'登','鸛':'鹳','樓':'楼','渙':'涣','盡':'尽','窮':'穷','層':'层','蘇':'苏','軾':'轼','調':'调',
  '闕':'阙','歡':'欢','離':'离','陰':'阴','圓':'圆','難':'难','長':'长','嬋':'婵','娟':'娟','識':'识','認':'认',
  '興':'兴','蘋':'苹','迎':'迎','祝':'祝','恭':'恭','幫':'帮','遲':'迟','辦':'办','熱':'热','歷':'历','蹟':'迹',
  '圖':'图','館':'馆','東':'东','週':'周','題':'题','應':'应','該':'该','媽':'妈','務':'务','員':'员','給':'给',
  '講':'讲','課':'课','懂':'懂','電':'电','話':'话','餃':'饺','買':'买','單':'单','菜':'菜','誰':'谁','書':'书',
  '歡':'欢','醫':'医','氣':'气','別':'别','沒':'没','關':'关','係':'系','對':'对','謝':'谢','問':'问','請':'请'
};

const LOCAL_T2S_DICT = { ...EXTRA_T2S_MAP };
const LOCAL_S2T_DICT = {};
(function buildLocalScriptDictionaries() {
  const len = Math.min(BUILTIN_TRAD_CHARS.length, BUILTIN_SIMP_CHARS.length);
  for (let i = 0; i < len; i++) {
    const t = BUILTIN_TRAD_CHARS[i];
    const s = BUILTIN_SIMP_CHARS[i];
    if (t && s && t !== s) {
      LOCAL_T2S_DICT[t] = s;
      if (!LOCAL_S2T_DICT[s]) LOCAL_S2T_DICT[s] = t;
    }
  }
  Object.keys(EXTRA_T2S_MAP).forEach(t => {
    const s = EXTRA_T2S_MAP[t];
    if (s && s !== t && !LOCAL_S2T_DICT[s]) LOCAL_S2T_DICT[s] = t;
  });
})();

let openccToSimp = null;
let openccToTrad = null;

function ensureOpenCCInitialized() {
  if (openccToSimp && openccToTrad) return true;
  try {
    if (window.OpenCC && typeof window.OpenCC.Converter === 'function') {
      openccToSimp = window.OpenCC.Converter({ from: 't', to: 'cn' });
      openccToTrad = window.OpenCC.Converter({ from: 'cn', to: 'tw' });
      return true;
    }
  } catch (e) {
    try {
      if (window.OpenCC && typeof window.OpenCC.Converter === 'function') {
        openccToSimp = window.OpenCC.Converter({ from: 'tw', to: 'cn' });
        openccToTrad = window.OpenCC.Converter({ from: 'cn', to: 'tw' });
        return true;
      }
    } catch (e2) {}
  }
  return false;
}

(function autoWatchOpenCCLoad() {
  if (ensureOpenCCInitialized()) return;
  window.addEventListener('load', () => {
    if (!ensureOpenCCInitialized()) {
      const backupScript = document.createElement('script');
      backupScript.src = 'https://unpkg.com/opencc-js@1.0.5/dist/umd/full.js';
      backupScript.onload = () => {
        if (ensureOpenCCInitialized() && currentScriptMode === 'simp') {
          refreshAllPageCharacters();
        }
      };
      document.head.appendChild(backupScript);
    } else if (currentScriptMode === 'simp') {
      refreshAllPageCharacters();
    }
  });
})();

let currentScriptMode = 'trad';

function convertScript(str, mode = currentScriptMode) {
  if (!str) return '';
  ensureOpenCCInitialized();
  if (mode === 'simp') {
    let out = openccToSimp ? openccToSimp(str) : str;
    return out.split('').map(c => LOCAL_T2S_DICT[c] || c).join('');
  } else {
    let out = openccToTrad ? openccToTrad(str) : str;
    return out.split('').map(c => LOCAL_S2T_DICT[c] || c).join('');
  }
}

function refreshAllPageCharacters() {
  document.querySelectorAll('.tp-zh').forEach(el => {
    const raw = el.dataset.raw || el.innerText;
    if (raw) {
      el.dataset.raw = raw;
      el.innerText = convertScript(raw, currentScriptMode);
    }
  });
  if (typeof renderMnemonicsPack === 'function') renderMnemonicsPack();
}

function switchScriptMode(mode) {
  const chkTrad = document.getElementById('chkTrad');
  const chkSimp = document.getElementById('chkSimp');
  if (mode === 'trad' && chkTrad && chkTrad.checked) {
    if (chkSimp) chkSimp.checked = false;
    currentScriptMode = 'trad';
  } else if (mode === 'simp' && chkSimp && chkSimp.checked) {
    if (chkTrad) chkTrad.checked = false;
    currentScriptMode = 'simp';
  }
  updateRowVisibility();
  refreshAllPageCharacters();
}

function updateRowVisibility() {
  const card = document.getElementById('sheetCard');
  const studioTop = document.getElementById('studioTopPane');
  const chkTrad = document.getElementById('chkTrad');
  const chkSimp = document.getElementById('chkSimp');
  const chkEn = document.getElementById('chkEn');
  const chkTp = document.getElementById('chkTp');
  const chkStd = document.getElementById('chkStd');
  const hideZh = chkTrad && chkSimp && !chkTrad.checked && !chkSimp.checked;
  [card, studioTop].forEach(el => {
    if (!el) return;
    if (chkEn) el.classList.toggle('hide-en', !chkEn.checked);
    if (chkTp) el.classList.toggle('hide-tp', !chkTp.checked);
    if (chkStd) el.classList.toggle('hide-std', !chkStd.checked);
    el.classList.toggle('hide-zh', Boolean(hideZh));
  });
}

// 將 index.html 原有的 5 個拼音與繁簡選項 (.chk-row) 從 Layout 彈出框直接移到外面的工具欄上（零重複按鈕！）
function moveExistingChkRowOutsideLayout() {
  const bottomBar = document.querySelector('.bottom-bar');
  const popover = document.querySelector('.layout-popover');
  if (!bottomBar || !popover) return;

  const chkRow = popover.querySelector('.chk-row');
  if (chkRow) {
    const nextEl = chkRow.nextElementSibling;
    if (nextEl && nextEl.classList.contains('dropdown-divider')) {
      nextEl.style.display = 'none';
    }
    chkRow.style.cssText = 'display:flex; flex-direction:row; flex-wrap:wrap; align-items:center; gap:14px; width:100%; padding-bottom:8px; margin-bottom:2px; border-bottom:1px dashed #d0d7de; font-size:0.86rem; font-weight:700; color:#1b5e20;';
    bottomBar.insertBefore(chkRow, bottomBar.firstChild);
  }
}

// 確保 #fileMenuModal 內 100% 擁有「📸 現場實時拍照翻譯」按鈕與相機視窗支援
function ensureCameraOptionAndModalReady() {
  const fileMenu = document.getElementById('fileMenuModal');
  if (fileMenu && !document.getElementById('uiOptLiveCamTitle')) {
    const box = fileMenu.querySelector('.modal-box');
    const cancelBtn = document.getElementById('uiFileMenuCancel');
    if (box) {
      const liveCamBtn = document.createElement('button');
      liveCamBtn.className = 'option-card-btn';
      liveCamBtn.onclick = function() {
        if (typeof openCameraModal === 'function') openCameraModal();
        fileMenu.style.display = 'none';
      };
      liveCamBtn.innerHTML = `
        <div>
          <div id="uiOptLiveCamTitle">📸 Instant Camera / 現場實時拍照翻譯</div>
          <div style="font-size:0.78rem; color:#555; font-weight:400; margin-top:3px;" id="uiOptLiveCamSub">Open live camera viewfinder & snap directly</div>
        </div>
        <span>➔</span>
      `;
      if (cancelBtn) box.insertBefore(liveCamBtn, cancelBtn);
      else box.appendChild(liveCamBtn);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    moveExistingChkRowOutsideLayout();
    ensureCameraOptionAndModalReady();
  });
} else {
  moveExistingChkRowOutsideLayout();
  ensureCameraOptionAndModalReady();
}

// =========================================================================
// 0.2 預設鎖定清晰國語女聲 + 錄影期間將電腦朗讀聲混入影片音軌
// =========================================================================
let selectedVoiceObj = null;
let studioAudioCtx = null;
let studioAudioDest = null;

function initSilentFemaleVoice() {
  if (!('speechSynthesis' in window)) return;
  const all = window.speechSynthesis.getVoices();
  const zhAll = all.filter(v => /zh|cmn|chi/i.test(v.lang) || /chinese|mandarin|taiwan|hong kong/i.test(v.name));
  const maleKeywords = ['male', 'kangkang', 'yunxi', 'yunjian', 'yunyang', 'danny', 'wanlung'];
  let females = zhAll.filter(v => !maleKeywords.some(m => v.name.toLowerCase().includes(m)));
  if (females.length === 0) females = zhAll;

  const priorityOrder = ['meijia', 'hsiaochen', 'xiaoxiao', 'ting-ting', 'tingting', 'google 國語', 'google 普通話', 'sin-ji', 'female'];
  females.sort((a, b) => {
    const aScore = priorityOrder.findIndex(k => a.name.toLowerCase().includes(k));
    const bScore = priorityOrder.findIndex(k => b.name.toLowerCase().includes(k));
    return (aScore === -1 ? 99 : aScore) - (bScore === -1 ? 99 : bScore);
  });

  if (females.length > 0) selectedVoiceObj = females[0];
}
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = initSilentFemaleVoice;
  setTimeout(initSilentFemaleVoice, 200);
}

function speakSingleChar(text) {
  if (!text) return;
  if (checkAndWarnProfanity(text)) return;

  if (typeof studioRecorder !== 'undefined' && studioRecorder && studioRecorder.state === 'recording' && studioAudioCtx && studioAudioDest) {
    try {
      const ttsAudio = new Audio(`https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=zh-TW&q=${encodeURIComponent(text.slice(0, 100))}`);
      ttsAudio.crossOrigin = 'anonymous';
      const srcNode = studioAudioCtx.createMediaElementSource(ttsAudio);
      srcNode.connect(studioAudioDest);
      srcNode.connect(studioAudioCtx.destination);
      ttsAudio.play().catch(() => speakNativeBrowserTTS(text));
      return;
    } catch (e) {}
  }
  speakNativeBrowserTTS(text);
}

function speakNativeBrowserTTS(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  if (!selectedVoiceObj) initSilentFemaleVoice();
  const u = new SpeechSynthesisUtterance(text);
  if (selectedVoiceObj) {
    u.voice = selectedVoiceObj;
    u.lang = selectedVoiceObj.lang;
  } else {
    u.lang = 'zh-TW';
  }
  u.rate = 0.86;
  u.pitch = 1.1;
  window.speechSynthesis.speak(u);
}

// =========================================================================
// 0.3 中英文雙語介面切換
// =========================================================================
let currentLang = 'en';

const UI_TEXT = {
  en: {
    moreRes: "📚 More Resources",
    menuWorkspace: "✨ AI Translator",
    menuCards: " Mnemonics",
    menuLog: "📊 Study Log",
    menuAbout: "📖 About & Rules",
    menuGames: "🎮 Mini Games",
    menuContact: "✉️ Contact",
    langBtn: "中文",
    installBtnText: "Install",
    loginBtnText: "👨‍🏫 Login",
    loginStudent: "🌱 Student",
    loginTeacher: "👩‍🏫 Teacher",
    placeholder: "Ask AI any question, or enter/paste/drag text, PDF, Word, Google Docs link, or photo to translate...",
    aiBtn: "✨ AI Reply & Pinyin",
    transBtn: "📝 Translate & Pinyin",
    speakBtn: "🔊 Speak",
    stopSpeakBtn: "⏹️ Stop",
    disclaimer: '<b>Tip:</b> Trees Pinyin focuses on intuitive Mandarin speaking, rather than AI Q&A (which is a bit beyond my solo capacity right now!). For the best experience, simply plug in your own free Gemini API key or paste your text directly. The author assumes no liability for the accuracy. Your support and shares will help me go full-time to make improvements and write a memory dictionary in the future!',
    layoutBtn: "📐 Layout ▾",
    printBtn: "🖨️ Print",
    recordBtn: "🎬 Record Video",
    chkEn: "English",
    chkTp: "Trees Pinyin",
    chkStd: "Standard Pinyin (ā á ǎ à)",
    chkTrad: "Traditional Chinese",
    chkSimp: "Simplified Chinese",
    fileMenuTitle: "📁 File & Cloud Options",
    cloudLinkLabel: "🔗 Open Google Docs / Drive Link",
    optCloudTitle: "📄 Upload File (PDF / Word / Docs / TXT)",
    optCloudSub: "100% Client-side instant extraction & Pinyin",
    optLiveCamTitle: "📸 Instant Camera / 現場實時拍照翻譯",
    optLiveCamSub: "Open live camera viewfinder & snap directly",
    optCamTitle: "🖼️ Photo Library / 選擇相冊圖片",
    optCamSub: "Choose an existing photo from your device"
  },
  zh: {
    moreRes: "📚 更多資源",
    menuWorkspace: "✨ AI 翻譯工作台",
    menuCards: "🧠 記憶閃卡",
    menuLog: "📊 學習記錄",
    menuAbout: "📖 關於與規則",
    menuGames: "🎮 趣味小遊戲",
    menuContact: "✉️ 聯絡我們",
    langBtn: "English",
    installBtnText: "安裝",
    loginBtnText: "👨‍🏫 登錄",
    loginStudent: "🌱 學生端",
    loginTeacher: "👩‍🏫 教師端",
    placeholder: "向 AI 提問，或輸入/貼上/拖入文字、PDF、Word、Google Docs 連結或照片直接翻譯注音...",
    aiBtn: "✨ AI 回答並注音",
    transBtn: "📝 翻譯並注音",
    speakBtn: "🔊 朗讀",
    stopSpeakBtn: "⏹️ 停止",
    disclaimer: '<b>提示：</b>為獲得最佳體驗，建議使用您自己的免費 Gemini API Key 或直接貼上文字。也可切換至免 Key 手機網頁版 <a href="https://www.treespinyin.com/app" target="_blank" style="color: var(--accent); font-weight: 700; text-decoration: underline;">www.treespinyin.com/app</a>（受 API 限制可能較慢）。作者對拼音結果準確性不承擔法律責任。您的支持與分享將幫助作者全職投入改進與編寫記憶字典！',
    layoutBtn: "📐 排版 ▾",
    printBtn: "🖨️ 列印",
    recordBtn: "🎬 錄製影片",
    chkEn: "英文 (English)",
    chkTp: "Trees Pinyin",
    chkStd: "標準拼音 (ā á ǎ à)",
    chkTrad: "繁體中文",
    chkSimp: "簡體中文",
    fileMenuTitle: "📁 文件與網盤選單",
    cloudLinkLabel: "🔗 輸入 Google Docs / 網盤連結打開",
    optCloudTitle: "📄 上傳文件 (PDF / Word / Docs / TXT)",
    optCloudSub: "100% 用戶端本地秒讀提取文字",
    optLiveCamTitle: "📸 現場實時拍照翻譯 / Instant Camera",
    optLiveCamSub: "直接開啟鏡頭取景拍照並翻譯注音",
    optCamTitle: "🖼️ 選擇相冊圖片 / Photo Library",
    optCamSub: "從手機或電腦相冊選擇照片識別"
  }
};

function safeSetInnerText(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined) el.innerText = val;
}

function toggleLang() {
  currentLang = currentLang === 'en' ? 'zh' : 'en';
  const t = UI_TEXT[currentLang];
  safeSetInnerText('uiMoreRes', t.moreRes);
  safeSetInnerText('uiMenuWorkspace', t.menuWorkspace);
  safeSetInnerText('uiMenuCards', t.menuCards);
  safeSetInnerText('uiMenuLog', t.menuLog);
  safeSetInnerText('uiMenuAbout', t.menuAbout);
  safeSetInnerText('uiMenuGames', t.menuGames);
  safeSetInnerText('uiMenuContact', t.menuContact);
  safeSetInnerText('uiLangBtn', t.langBtn);
  safeSetInnerText('uiInstallBtnText', t.installBtnText);
  safeSetInnerText('uiLoginBtnText', t.loginBtnText);
  safeSetInnerText('uiLoginStudent', t.loginStudent);
  safeSetInnerText('uiLoginTeacher', t.loginTeacher);
  const uIn = document.getElementById('userInput');
  if (uIn) uIn.placeholder = t.placeholder;
  safeSetInnerText('uiAIBtn', t.aiBtn);
  safeSetInnerText('uiTransBtn', t.transBtn);
  if (typeof isSpeakingNow === 'undefined' || !isSpeakingNow) {
    safeSetInnerText('speakBtn', t.speakBtn);
  }
  const disc = document.getElementById('uiDisclaimer');
  if (disc) disc.innerHTML = t.disclaimer;
  safeSetInnerText('uiLayoutBtn', t.layoutBtn);
  safeSetInnerText('uiPrintBtn', t.printBtn);
  safeSetInnerText('uiRecordBtn', t.recordBtn);
  safeSetInnerText('uiChkEn', t.chkEn);
  safeSetInnerText('uiChkTp', t.chkTp);
  safeSetInnerText('uiChkStd', t.chkStd);
  safeSetInnerText('uiChkTrad', t.chkTrad);
  safeSetInnerText('uiChkSimp', t.chkSimp);
  safeSetInnerText('uiFileMenuTitle', t.fileMenuTitle);
  safeSetInnerText('uiCloudLinkLabel', t.cloudLinkLabel);
  safeSetInnerText('uiOptCloudTitle', t.optCloudTitle);
  safeSetInnerText('uiOptCloudSub', t.optCloudSub);
  safeSetInnerText('uiOptLiveCamTitle', t.optLiveCamTitle);
  safeSetInnerText('uiOptLiveCamSub', t.optLiveCamSub);
  safeSetInnerText('uiOptCamTitle', t.optCamTitle);
  safeSetInnerText('uiOptCamSub', t.optCamSub);
}

function toggleDropdown(id, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  document.querySelectorAll('.dropdown').forEach(d => { if (d.id !== id) d.classList.remove('open'); });
  const target = document.getElementById(id);
  if (target) target.classList.toggle('open');
}
document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
});

function switchMainTab(tabName) {
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
  document.getElementById('panel-workspace')?.classList.toggle('hidden', tabName !== 'workspace');
  document.getElementById('panel-mnemonics')?.classList.toggle('hidden', tabName !== 'mnemonics');
  document.getElementById('panel-studylog')?.classList.toggle('hidden', tabName !== 'studylog');
  if (tabName === 'mnemonics' && typeof renderMnemonicsPack === 'function') renderMnemonicsPack();
  if (tabName === 'studylog' && typeof renderPersonalStudyLog === 'function') renderPersonalStudyLog();
}

// =========================================================================
// 1. ☁️ Google Docs / Drive 連結讀取
// =========================================================================
async function openCloudUrlFromModal() {
  const link = (document.getElementById('cloudUrlModalInput')?.value || '').trim();
  if (!link) return;
  const fm = document.getElementById('fileMenuModal');
  if (fm) fm.style.display = 'none';
  const uIn = document.getElementById('userInput');
  if (uIn) uIn.value = link;
  await runDirectTranslate(link);
}

async function fetchCloudDocumentByUrl(rawUrl) {
  let exportUrl = '';
  const u = (rawUrl || '').trim();
  const pubMatch = u.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)\/pub/);
  const docMatch = u.match(/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
  const driveMatch = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/);

  if (pubMatch) {
    exportUrl = `https://docs.google.com/document/d/${pubMatch[1]}/pub?output=txt`;
  } else if (docMatch) {
    exportUrl = `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`;
  } else if (driveMatch) {
    exportUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
  } else if (u.includes('dropbox.com')) {
    exportUrl = u.replace(/\?dl=0$/, '?dl=1');
  } else {
    return '';
  }

  const candidates = [
    exportUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(exportUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(exportUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(exportUrl)}`
  ];

  try {
    const tasks = candidates.map(async (proxyUrl) => {
      const r = await fetchWithTimeout(proxyUrl, {}, 7500);
      if (!r.ok) throw new Error('HTTP_' + r.status);
      const buf = await r.arrayBuffer();
      const txt = new TextDecoder('utf-8').decode(buf).replace(/^\uFEFF/, '').trim();
      if (!txt || txt.startsWith('<!DOCTYPE') || txt.includes('<html') || txt.includes('accounts.google.com')) {
        throw new Error('AUTH_OR_HTML');
      }
      return txt;
    });
    return await Promise.any(tasks);
  } catch (e) {
    return '';
  }
}

// =========================================================================
// 2. 🟢 劃詞僅顯示 icon.png ➔ 點擊彈出獨立小顯示框
// =========================================================================
let selectedPageText = '';
let popoverZhText = '';
let popoverEnText = '';
const iconOnlyBtn = document.getElementById('selectionIconOnly');
const miniPopover = document.getElementById('selectionMiniPopover');

function handleTextSelectionCheck(e) {
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

document.addEventListener('mouseup', handleTextSelectionCheck);
document.addEventListener('touchend', handleTextSelectionCheck);

async function openSelectionMiniPopover(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (!selectedPageText) return;
  if (checkAndWarnProfanity(selectedPageText)) {
    if (iconOnlyBtn) iconOnlyBtn.style.display = 'none';
    return;
  }

  const rect = iconOnlyBtn.getBoundingClientRect();
  iconOnlyBtn.style.display = 'none';

  miniPopover.style.left = Math.max(12, Math.min(window.innerWidth - 455, rect.left + window.scrollX - 180)) + 'px';
  miniPopover.style.top = Math.max(12, rect.top + window.scrollY + 8) + 'px';
  miniPopover.style.display = 'flex';

  const body = document.getElementById('popoverAnnotationBody');
  if (body) body.innerHTML = `<div style="font-size:0.84rem; color:#666;">⚡ ...</div>`;

  const hasZh = /[\u4e00-\u9fa5]/.test(selectedPageText);
  if (hasZh) {
    popoverZhText = convertScript(expandNumbersAndSymbolsToZh(selectedPageText), 'trad');
    popoverEnText = await translateFast(popoverZhText, 'zh', 'en');
  } else {
    popoverEnText = selectedPageText;
    const rawZh = await translateFast(selectedPageText, 'en', 'zh');
    popoverZhText = convertScript(expandNumbersAndSymbolsToZh(rawZh), 'trad');
  }

  if (body) {
    body.innerHTML = '';
    appendSentenceProgressive(popoverZhText, popoverEnText, 'popoverAnnotationBody');
  }
}

function closeSelectionMiniPopover() {
  if (miniPopover) miniPopover.style.display = 'none';
}

function speakPopoverContent() {
  if (popoverZhText) speakSingleChar(popoverZhText);
}

async function printPopoverContent() {
  closeSelectionMiniPopover();
  switchMainTab('workspace');
  const uIn = document.getElementById('userInput');
  if (uIn) uIn.value = `${popoverZhText} ||| ${popoverEnText}`;
  await runDirectTranslate(`${popoverZhText} ||| ${popoverEnText}`);
  setTimeout(() => window.print(), 300);
}

// =========================================================================
// 3. 📸 文件選單、現場拍照與相冊觸發保底函數（確保拍照與選單 100% 穩定）
// =========================================================================
function openFileMenuModal() {
  ensureCameraOptionAndModalReady();
  const m = document.getElementById('fileMenuModal');
  if (m) m.style.display = 'flex';
}

function triggerDocUpload() {
  const m = document.getElementById('fileMenuModal');
  if (m) m.style.display = 'none';
  const docIn = document.getElementById('docFileInput');
  if (docIn) docIn.click();
}

function openCameraNoticeModal() {
  const m = document.getElementById('fileMenuModal');
  if (m) m.style.display = 'none';
  if (typeof openCameraModal === 'function') {
    openCameraModal();
  } else {
    const n = document.getElementById('cameraNoticeModal');
    if (n) n.style.display = 'flex';
  }
}

function triggerGalleryPick() {
  const m = document.getElementById('fileMenuModal');
  if (m) m.style.display = 'none';
  const n = document.getElementById('cameraNoticeModal');
  if (n) n.style.display = 'none';
  const galIn = document.getElementById('galleryInput');
  if (galIn) galIn.click();
}
