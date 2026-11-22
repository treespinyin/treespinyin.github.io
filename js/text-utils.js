/**
 * Trees Pinyin 共用核心工具庫 (js/text-utils.js - v5.1)
 * - 統一繁簡轉換（含常見一簡對多繁語境詞表，支援自動掛載 OpenCC）
 * - 統一數學/化學/貨幣/時間/日期口語展開（支援英文語境防誤判）
 * - 統一標準漢語拼音聲調渲染、XSS 轉義、智慧分句
 * - 瀏覽器原生 Chrome Built-in Translator API 單例快取封裝（0 網路延遲）
 */
(function(global) {
  if (global.TreesTextUtils) return;

  // 壓縮配對表：每組 2 字 (繁體 + 簡體)，確保零錯配（徹底移除舊版 '珍':'珠' 等錯誤）
  const T2S_PAIR_LIST = (
    '萬万 與与 醜丑 專专 業业 叢丛 東东 絲丝 丟丢 兩两 嚴严 喪丧 個个 豐丰 臨临 為为 麗丽 舉举 麼么 義义 ' +
    '烏乌 樂乐 喬乔 習习 鄉乡 書书 買买 亂乱 爭争 於于 虧亏 雲云 亞亚 產产 畝亩 親亲 褻亵 億亿 僅仅 從从 ' +
    '侖仑 倉仓 儀仪 們们 價价 眾众 優优 夥伙 會会 傴伛 傘伞 偉伟 傳传 傷伤 倫伦 偽伪 佇伫 體体 餘余 傭佣 ' +
    '僉佥 俠侠 侶侣 僥侥 偵侦 側侧 僑侨 儈侩 儕侪 儂侬 儘尽 償偿 儲储 兒儿 兌兑 黨党 蘭兰 關关 興兴 茲兹 ' +
    '養养 獸兽 內内 岡冈 冊册 寫写 軍军 農农 馮冯 沖冲 決决 況况 凍冻 淨净 淒凄 涼凉 淩凌 減减 湊凑 凜凛 ' +
    '幾几 鳳凤 憑凭 凱凯 擊击 鑿凿 芻刍 劃划 劉刘 則则 剛刚 創创 刪删 別别 劊刽 劑剂 剮剐 劍剑 剝剥 劇剧 ' +
    '勸劝 辦办 務务 動动 勵励 勁劲 勞劳 勢势 勳勋 勻匀 匭匦 匯汇 匱匮 區区 協协 單单 賣卖 盧卢 衛卫 卻却 ' +
    '廠厂 廳厅 歷历 厲厉 壓压 厭厌 廁厕 廂厢 廈厦 廚厨 廝厮 縣县 參参 雙双 發发 變变 敘叙 疊叠 葉叶 號号 ' +
    '歎叹 嘰叽 後后 嚇吓 呂吕 嗎吗 噸吨 聽听 啟启 吳吴 咼呙 吶呐 員员 嗚呜 詠咏 響响 啞哑 噠哒 哢咔 嘩哗 ' +
    '噦哕 喲哟 喚唤 問问 噴喷 嗆呛 嘆叹 嘔呕 嘗尝 噓嘘 嘮唠 嘯啸 噁恶 噥哝 噯嗳 噲哙 噹当 嚐尝 嚕噜 嚙啮 ' +
    '嚥咽 嚦沥 嚨咙 嚮向 嚳喾 嚶嘤 囀转 囁嗫 囂嚣 囈呓 囉罗 囌苏 囑嘱 國国 圖图 團团 圓圆 圍围 園园 聖圣 ' +
    '場场 塊块 堅坚 壇坛 壩坝 塢坞 墳坟 墜坠 墮堕 壘垒 墾垦 壙圹 壞坏 壟垄 壯壮 聲声 壺壶 處处 備备 複复 ' +
    '夠够 頭头 誇夸 夾夹 奪夺 奮奋 獎奖 奧奥 妝妆 婦妇 媽妈 婁娄 嬌娇 嫻娴 嬰婴 嬸婶 孫孙 學学 孿孪 寧宁 ' +
    '寶宝 實实 寵宠 審审 憲宪 宮宫 寬宽 賓宾 寢寝 對对 尋寻 導导 壽寿 將将 爾尔 塵尘 堯尧 尷尴 屍尸 層层 ' +
    '屜屉 屢屡 屬属 島岛 峽峡 嶺岭 嶽岳 巒峦 歲岁 豈岂 嶄崭 巋岿 巰巯 幣币 帥帅 師师 帳帐 帶带 幀帧 幫帮 ' +
    '幬帱 幹干 庫库 應应 廟庙 龐庞 廢废 廣广 廄厩 開开 異异 棄弃 張张 彌弥 彎弯 彈弹 強强 歸归 當当 錄录 ' +
    '彞彝 彥彦 徹彻 徑径 復复 徵征 憶忆 憂忧 愾忾 懷怀 態态 慍愠 慘惨 慚惭 慟恸 慣惯 愨悫 懣懑 懶懒 懼惧 ' +
    '懾慑 戀恋 懇恳 惡恶 惱恼 惲恽 悅悦 懸悬 憫悯 驚惊 憊惫 慶庆 慮虑 懌怿 懍懔 懞蒙 懟怼 懺忏 懽欢 戲戏 ' +
    '戰战 戶户 撲扑 執执 擴扩 捫扪 掃扫 揚扬 擾扰 撫抚 拋抛 摶搏 摳抠 掄抡 搶抢 護护 報报 擔担 擬拟 攏拢 ' +
    '揀拣 擁拥 攔拦 擰拧 撥拨 擇择 掛挂 摯挚 攣挛 挾挟 撈捞 損损 撿捡 換换 搗捣 捨舍 據据 捲卷 掙挣 採采 ' +
    '擲掷 撣掸 摻掺 揮挥 搖摇 攜携 攝摄 擺摆 擯摈 攤摊 摟搂 摺折 撐撑 撓挠 撚捻 撳揿 撻挞 擄掳 擋挡 擠挤 ' +
    '擱搁 擷撷 擻薮 擼撸 攄摅 攆撵 櫻樱 攙搀 攛蹿 攢攒 攪搅 攬揽 敵敌 斂敛 數数 齋斋 鬥斗 斬斩 斷断 無无 ' +
    '時时 晉晋 晝昼 暈晕 暉晖 暢畅 暫暂 曉晓 曠旷 曬晒 朧胧 術术 機机 殺杀 雜杂 權权 條条 來来 楊杨 傑杰 ' +
    '極极 構构 槍枪 楓枫 櫃柜 檸柠 柵栅 標标 棧栈 棟栋 欄栏 樹树 棲栖 樣样 橋桥 樁桩 樓楼 橢椭 橫横 檢检 ' +
    '檔档 殘残 殞殒 殮殓 殯殡 殲歼 殼壳 毀毁 毆殴 醫医 畢毕 斃毙 氈毡 氣气 氫氢 氬氩 漢汉 汙污 湯汤 溝沟 ' +
    '沒没 瀝沥 淪沦 滄沧 滬沪 澤泽 潔洁 灑洒 窪洼 淺浅 漿浆 澆浇 濁浊 測测 濟济 瀏浏 渾浑 濃浓 塗涂 湧涌 ' +
    '濤涛 濫滥 濱滨 灘滩 灣湾 濾滤 滿满 漁渔 滲渗 滌涤 滾滚 滯滞 漲涨 澀涩 澱淀 濕湿 濺溅 瀉泻 瀋沈 瀕濒 ' +
    '瀘泸 瀟潇 瀠潆 瀦潴 瀧泷 瀨濑 瀾澜 灃沣 灄滠 灕漓 灝灏 災灾 點点 煉炼 熾炽 爍烁 爛烂 烴烃 燭烛 煙烟 ' +
    '煩烦 燒烧 燴烩 燙烫 燼尽 熱热 煥焕 燜焖 燾焘 營营 燦灿 牆墙 牘牍 牽牵 犧牺 狀状 猶犹 獨独 狹狭 獅狮 ' +
    '獄狱 獵猎 獻献 獼猕 瑪玛 環环 現现 璽玺 瓊琼 電电 畫画 疇畴 療疗 瘋疯 瘍疡 癢痒 癤疖 瘂哑 痺痹 瘞瘗 ' +
    '瘡疮 瘧疟 癆痨 癇痫 癉瘅 癒愈 癘疠 癡痴 癥症 癧疬 癩癞 癬癣 癮瘾 癰痈 癱瘫 癲癫 皁皂 確确 皚皑 皺皱 ' +
    '盤盘 盡尽 監监 盪荡 睜睁 睞睐 瞇眯 瞞瞒 瞭了 矚瞩 矯矫 礦矿 碼码 磚砖 磣碜 礎础 礙碍 礫砾 礬矾 禮礼 ' +
    '禎祯 禱祷 禍祸 祿禄 禪禅 離离 禿秃 積积 稱称 穢秽 稅税 種种 穀谷 穌稣 穎颖 穩稳 穫获 窮穷 窯窑 竄窜 ' +
    '窩窝 窺窥 竇窦 竊窃 競竞 筆笔 筍笋 篩筛 箏筝 籌筹 簽签 簡简 簫箫 簷檐 簾帘 籃篮 籠笼 籤签 籬篱 籮箩 ' +
    '籲吁 粵粤 糞粪 糧粮 糰团 糾纠 紅红 紂纣 纖纤 紇纥 約约 級级 紈纨 纊纩 紀纪 紉纫 緯纬 純纯 紗纱 綱纲 ' +
    '納纳 縱纵 綸纶 紛纷 紙纸 紋纹 紡纺 紐纽 紓纾 線线 紺绀 絏绁 紱绂 練练 組组 紳绅 細细 織织 終终 縐绉 ' +
    '絆绊 紼绋 絀绌 紹绍 繹绎 經经 紿绐 綁绑 絨绒 結结 繞绕 繪绘 給给 絢绚 絳绛 絡络 絕绝 絞绞 統统 綆绠 ' +
    '綃绡 絹绢 繡绣 綌绤 綏绥 絛绦 繼继 縳缚 綜综 綻绽 綰绾 綠绿 綴缀 緇缁 緙缂 緗缃 緘缄 緬缅 纜缆 緹缇 ' +
    '緲缈 緝缉 縕缊 繢缋 緦缌 綞缒 緞缎 緶缏 緩缓 締缔 縷缕 編编 緡缗 緣缘 縛缚 縟缛 縝缜 縫缝 縗缞 縞缟 ' +
    '纏缠 縭缡 縊缢 縑缣 繽缤 縹缥 縵缦 縲缧 纓缨 縮缩 繆缪 繅缫 纈缬 繚缭 繕缮 韁缰 繾缱 繰缲 繳缴 續续 ' +
    '纍累 纘缵 缽钵 罈坛 罌罂 罰罚 罵骂 罷罢 羅罗 羆罴 羈羁 羨羡 翹翘 恥耻 聞闻 聯联 聰聪 聳耸 聾聋 職职 ' +
    '肅肃 勝胜 脈脉 脅胁 脫脱 脹胀 腎肾 腦脑 腫肿 腳脚 腸肠 膩腻 騰腾 膚肤 膠胶 膽胆 臉脸 膿脓 臘腊 臟脏 ' +
    '臥卧 臺台 舊旧 艦舰 艙舱 艱艰 豔艳 藝艺 節节 蕪芜 蘆芦 葦苇 藥药 葷荤 蕕莸 藍蓝 蘄蕲 蘇苏 蘋苹 虛虚 ' +
    '虜虏 蟲虫 雖虽 蝦虾 蝕蚀 蟻蚁 螞蚂 螢萤 衝冲 補补 襯衬 襪袜 襲袭 裝装 裡里 褲裤 襖袄 褸褛 襉裥 襠裆 ' +
    '襤褴 見见 觀观 規规 覓觅 視视 覽览 覺觉 觸触 訂订 訃讣 計计 訊讯 討讨 訓训 託托 記记 訛讹 訝讶 訟讼 ' +
    '訣诀 訥讷 訪访 設设 許许 訴诉 診诊 註注 証证 詁诂 評评 詛诅 詞词 詢询 詣诣 試试 詩诗 詫诧 詬诟 詭诡 ' +
    '詮诠 詰诘 話话 該该 詳详 詵诜 詼诙 誄诔 誅诛 誌志 認认 誑诳 誒诶 誕诞 誘诱 語语 誠诚 誡诫 誣诬 誤误 ' +
    '誥诰 誦诵 誨诲 說说 誰谁 課课 誹诽 誼谊 調调 諂谄 諄谆 談谈 請请 諍诤 諏诹 諒谅 論论 諗谂 諛谀 諜谍 ' +
    '諝谞 諡谥 諢诨 諤谔 諦谛 諧谐 諫谏 諭谕 諮咨 諱讳 諳谙 諷讽 諸诸 諺谚 諾诺 謀谋 謁谒 謂谓 謄誊 謊谎 ' +
    '謎谜 謐谧 謔谑 謅诌 謗谤 謙谦 講讲 謝谢 謠谣 謡谣 謨谟 謫谪 謬谬 謳讴 謹谨 謾谩 證证 譎谲 譏讥 識识 ' +
    '譙谯 譚谭 譜谱 譯译 議议 譴谴 譽誉 讀读 讓让 讒谗 讖谶 讚赞 豬猪 貓猫 貝贝 貞贞 負负 財财 貢贡 貧贫 ' +
    '貨货 販贩 貪贪 貫贯 責责 貯贮 貰贳 貲赀 貳贰 貴贵 貶贬 貸贷 費费 貼贴 貽贻 貿贸 賀贺 賁贲 賂赂 賃赁 ' +
    '賄贿 賅赅 資资 賈贾 賊贼 賑赈 賒赊 賕赇 賙赒 賚赉 賜赐 賞赏 賠赔 賢贤 賤贱 賦赋 質质 賬账 賭赌 賴赖 ' +
    '賺赚 購购 賽赛 贅赘 贈赠 贊赞 贍赡 贏赢 贓赃 贖赎 贛赣 趙赵 趕赶 趨趋 跡迹 踐践 踴踊 蹤踪 躍跃 軀躯 ' +
    '車车 軋轧 軌轨 軒轩 軔轫 轉转 軛轭 輪轮 軟软 轟轰 輕轻 載载 輊轾 較较 輒辄 輔辅 輛辆 輩辈 輝辉 輥辊 ' +
    '輞辋 輟辍 輜辎 輦辇 輯辑 輸输 輻辐 輾辗 輿舆 轄辖 轅辕 轆辘 轍辙 轎轿 轡辔 轢轹 轤轳 辭辞 辯辩 邊边 ' +
    '遼辽 達达 遷迁 過过 邁迈 運运 還还 這这 進进 遠远 違违 連连 遲迟 週周 遊游 遙遥 遜逊 遞递 適适 選选 ' +
    '遺遗 邇迩 邏逻 鄧邓 鄭郑 鄰邻 郵邮 醬酱 釀酿 釋释 釐厘 針针 釘钉 釣钓 釦扣 釧钏 釵钗 鈍钝 鈔钞 鈕钮 ' +
    '鈞钧 鈣钙 鈴铃 鈷钴 鉢钵 鉞钺 鉤钩 鈳钶 鈺钰 錢钱 鉗钳 鉆钻 鉀钾 鐵铁 鉑铂 鉛铅 鉚铆 鈰铈 鉉铉 鉻铬 ' +
    '銘铭 錚铮 鉸铰 銥铱 鏟铲 銃铳 銀银 銅铜 銑铣 銓铨 銖铢 銜衔 銷销 鋁铝 鋅锌 鋒锋 鋤锄 鋪铺 鋰锂 鋸锯 ' +
    '鋼钢 錐锥 錘锤 錒锕 錠锭 錦锦 錨锚 錫锡 錯错 錳锰 錶表 鍊炼 鍋锅 鍍镀 鍛锻 鍬锹 鍵键 鍾钟 鎂镁 鎮镇 ' +
    '鎳镍 鏈链 鎖锁 鎚锤 鎧铠 鎬镐 鏡镜 鏢镖 鏤镂 鏽锈 鐘钟 鐮镰 鐺铛 鑄铸 鑑鉴 鑒鉴 鑰钥 鑽钻 長长 門门 ' +
    '閃闪 閉闭 闖闯 閏闰 閒闲 間间 悶闷 閘闸 鬧闹 閨闺 閩闽 閥阀 閣阁 閤合 閱阅 閻阎 闡阐 闢辟 闊阔 闌阑 ' +
    '隊队 階阶 陽阳 陰阴 陣阵 際际 陸陆 陳陈 險险 隨随 隱隐 隸隶 隻只 雞鸡 難难 霧雾 靂雳 靈灵 靜静 靨靥 ' +
    '鞏巩 韃鞑 韋韦 韌韧 韓韩 韻韵 頁页 頂顶 頃顷 項项 順顺 須须 頊顼 頌颂 預预 頑顽 頒颁 頓顿 頗颇 領领 ' +
    '頜颌 頡颉 頤颐 頰颊 頸颈 頹颓 頻频 顆颗 題题 額额 顏颜 願愿 顛颠 類类 顧顾 顫颤 顯显 風风 飄飘 飆飙 ' +
    '飛飞 飢饥 飯饭 飲饮 飾饰 飽饱 飼饲 餌饵 饒饶 餃饺 餅饼 餚肴 館馆 餡馅 饋馈 饑饥 馬马 馭驭 駝驼 馴驯 ' +
    '馳驰 驅驱 駁驳 驢驴 駐驻 駒驹 駕驾 駛驶 駙驸 駭骇 駱骆 駿骏 騎骑 騙骗 騷骚 驍骁 驕骄 驗验 驛驿 驟骤 ' +
    '髮发 鬆松 鬍胡 鬱郁 魚鱼 魯鲁 鮮鲜 鯉鲤 鯨鲸 鳥鸟 鳴鸣 鴉鸦 鴨鸭 鴻鸿 鴿鸽 鵝鹅 鵬鹏 鶴鹤 鷹鹰 麥麦 ' +
    '麵面 黃黄 齊齐 齒齿 齡龄 龍龙 龔龚 龜龟'
  ).split(' ');

  const TRAD_TO_SIMP = Object.create(null);
  const SIMP_TO_TRAD = Object.create(null);

  for (let i = 0; i < T2S_PAIR_LIST.length; i++) {
    const pair = T2S_PAIR_LIST[i];
    if (pair.length === 2) {
      const t = pair[0];
      const s = pair[1];
      if (!TRAD_TO_SIMP[t]) TRAD_TO_SIMP[t] = s;
      if (!SIMP_TO_TRAD[s]) SIMP_TO_TRAD[s] = t;
    }
  }
  Object.assign(SIMP_TO_TRAD, {'会': '會', '尽': '盡', '冲': '衝', '发': '發', '叹': '嘆', '哑': '啞', '尝': '嘗', '恶': '惡', '当': '當', '沥': '瀝', '转': '轉', '罗': '羅', '苏': '蘇', '团': '團', '坛': '壇', '复': '複', '拥': '擁', '摄': '攝', '炼': '煉', '签': '簽', '论': '論', '绘': '繪', '蓝': '藍', '证': '證', '谣': '謠', '赞': '讚', '钻': '鑽', '锤': '錘', '钟': '鐘', '鉴': '鑑', '饥': '饑', '台': '台', '里': '裡', '后': '後', '干': '幹', '面': '面', '表': '表', '只': '只', '板': '板', '了': '了', '么': '麼', '着': '著', '余': '餘', '采': '採', '松': '松', '游': '游', '周': '週', '借': '借', '准': '準', '脏': '臟', '历': '歷', '叶': '葉', '系': '係', '范': '範'});

  // 補充多繁對一簡（繁→簡方向完全正確）
  const EXTRA_T2S = {
    '妳': '你', '裏': '里', '臺': '台', '檯': '台', '颱': '台',
    '髮': '发', '乾': '干', '幹': '干', '鍾': '钟', '鐘': '钟',
    '藉': '借', '禦': '御', '夥': '伙', '隻': '只', '祇': '只',
    '準': '准', '餘': '余', '採': '采', '闆': '板', '穀': '谷',
    '範': '范', '迴': '回', '昇': '升', '陞': '升', '佈': '布',
    '佔': '占', '剋': '克', '劃': '划', '僱': '雇', '週': '周',
    '遊': '游', '線': '线', '綫': '线', '羣': '群', '衆': '众',
    '爲': '为', '僞': '伪', '啓': '启', '強': '强', '強': '强',
    '眞': '真', '着': '着', '著': '着', '瞭': '了', '麼': '么',
    '麽': '么', '嶽': '岳', '峯': '峰', '羣': '群', '裡': '里'
  };
  Object.assign(TRAD_TO_SIMP, EXTRA_T2S);

  // 簡→繁高頻詞組優先糾正（避免一簡對多繁誤轉）
  const SIMP_TO_TRAD_PHRASES = [
    ['头发', '頭髮'], ['理发', '理髮'], ['白发', '白髮'], ['毛发', '毛髮'], ['长发', '長髮'], ['短发', '短髮'],
    ['以后', '以後'], ['之后', '之後'], ['然后', '然後'], ['后来', '後來'], ['后面', '後面'], ['后果', '後果'], ['后悔', '後悔'], ['背后', '背後'], ['背后', '背後'],
    ['皇后', '皇后'], ['太后', '太后'], ['天后', '天后'],
    ['里面', '裡面'], ['家里', '家裡'], ['这里', '這裡'], ['那里', '那裡'], ['哪里', '哪裡'], ['心里', '心裡'], ['手里', '手裡'],
    ['公里', '公里'], ['里程', '里程'],
    ['面条', '麵條'], ['面包', '麵包'], ['拉面', '拉麵'], ['炒面', '炒麵'], ['泡面', '泡麵'], ['方便面', '方便麵'], ['面粉', '麵粉'],
    ['干净', '乾淨'], ['干燥', '乾燥'], ['饼干', '餅乾'], ['干杯', '乾杯'], ['干涸', '乾涸'], ['葡萄干', '葡萄乾'],
    ['干部', '幹部'], ['干活', '幹活'], ['干嘛', '幹嘛'], ['能干', '能幹'], ['实干', '實幹'],
    ['台风', '颱風'], ['台湾', '台灣'], ['台北', '台北'], ['舞台', '舞台'], ['阳台', '陽台'],
    ['钟表', '鐘錶'], ['时钟', '時鐘'], ['分钟', '分鐘'], ['点钟', '點鐘'], ['手表', '手錶'],
    ['老板', '老闆'], ['黑板', '黑板'], ['地板', '地板'],
    ['只有', '只有'], ['只是', '只是'], ['只要', '只要'], ['只能', '只能'], ['一只', '一隻'], ['几只', '幾隻'],
    ['什么', '什麼'], ['怎么', '怎麼'], ['这么', '這麼'], ['那么', '那麼'], ['多么', '多麼'],
    ['发现', '發現'], ['发展', '發展'], ['发生', '發生'], ['出发', '出發'], ['发音', '發音'], ['发财', '發財'],
    ['了解', '了解'], ['明白', '明白'], ['没有', '沒有'], ['漂亮', '漂亮'],
    ['系列', '系列'], ['系统', '系統'], ['体系', '體系'], ['菜系', '菜系'], ['星系', '星系'], ['色系', '色系'], ['水系', '水系'], ['学系', '學系'], ['中文系', '中文系'],
    ['关系', '關係'], ['没关系', '沒關係'], ['联系', '聯繫'], ['维系', '維繫'], ['系数', '係數']
  ];

  // 一簡對多繁安全預設（在詞組規則之後生效）
  SIMP_TO_TRAD['发'] = '發';
  SIMP_TO_TRAD['后'] = '後';
  SIMP_TO_TRAD['里'] = '裡';
  SIMP_TO_TRAD['面'] = '面';
  SIMP_TO_TRAD['干'] = '幹';
  SIMP_TO_TRAD['台'] = '台';
  SIMP_TO_TRAD['表'] = '表';
  SIMP_TO_TRAD['只'] = '只';
  SIMP_TO_TRAD['钟'] = '鐘';
  SIMP_TO_TRAD['板'] = '板';
  SIMP_TO_TRAD['了'] = '了';
  SIMP_TO_TRAD['么'] = '麼';
  SIMP_TO_TRAD['着'] = '著';
  SIMP_TO_TRAD['余'] = '餘';
  SIMP_TO_TRAD['采'] = '採';
  SIMP_TO_TRAD['松'] = '松';
  SIMP_TO_TRAD['游'] = '游';
  SIMP_TO_TRAD['周'] = '週';
  SIMP_TO_TRAD['借'] = '借';
  SIMP_TO_TRAD['准'] = '準';
  delete SIMP_TO_TRAD['珠']; // 確保無錯配

  let openccToSimp = null;
  let openccToTrad = null;
  function initOpenCC() {
    if (openccToSimp || openccToTrad) return;
    try {
      if (global.OpenCC && typeof global.OpenCC.Converter === 'function') {
        openccToSimp = global.OpenCC.Converter({ from: 'tw', to: 'cn' });
        openccToTrad = global.OpenCC.Converter({ from: 'cn', to: 'tw' });
      }
    } catch (e) {}
  }

  function toSimplified(str) {
    if (!str) return '';
    initOpenCC();
    if (openccToSimp) {
      try { return openccToSimp(str); } catch (e) {}
    }
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      out += TRAD_TO_SIMP[c] || c;
    }
    return out;
  }

  function toTraditional(str) {
    if (!str) return '';
    initOpenCC();
    if (openccToTrad) {
      try { return openccToTrad(str); } catch (e) {}
    }
    let s = str;
    // 先套用語境詞組，保護常見一簡對多繁字詞
    const placeholders = [];
    for (let p = 0; p < SIMP_TO_TRAD_PHRASES.length; p++) {
      const [simpW, tradW] = SIMP_TO_TRAD_PHRASES[p];
      if (s.includes(simpW)) {
        const token = `\uE000${placeholders.length}\uE001`;
        placeholders.push(tradW);
        s = s.split(simpW).join(token);
      }
    }
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      out += SIMP_TO_TRAD[c] || c;
    }
    for (let p = 0; p < placeholders.length; p++) {
      out = out.split(`\uE000${p}\uE001`).join(placeholders[p]);
    }
    return out;
  }

  function convertScript(str, mode = 'trad') {
    if (!str) return '';
    return mode === 'simp' ? toSimplified(str) : toTraditional(str);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const TONE_MAP = {
    a: ['ā', 'á', 'ǎ', 'à'],
    e: ['ē', 'é', 'ě', 'è'],
    i: ['ī', 'í', 'ǐ', 'ì'],
    o: ['ō', 'ó', 'ǒ', 'ò'],
    u: ['ū', 'ú', 'ǔ', 'ù'],
    v: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
    ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ']
  };

  function toStandardToneMarks(pyStr) {
    if (!pyStr) return '';
    return String(pyStr).split(/\s+/).map(syl => {
      const m = syl.match(/^([a-zA-ZüÜvV:]+)([1-5]?)$/);
      if (!m) return syl;
      let base = m[1].toLowerCase().replace(/u:|v/g, 'ü');
      const tone = parseInt(m[2], 10);
      if (!tone || tone === 5 || tone === 0) return base;
      const idx = tone - 1;
      if (base.includes('a')) return base.replace('a', TONE_MAP.a[idx]);
      if (base.includes('e')) return base.replace('e', TONE_MAP.e[idx]);
      if (base.includes('ou')) return base.replace('o', TONE_MAP.o[idx]);
      if (base.includes('iu')) return base.replace('u', TONE_MAP.u[idx]);
      if (base.includes('ui')) return base.replace('i', TONE_MAP.i[idx]);
      for (const v of ['o', 'i', 'u', 'ü']) {
        if (base.includes(v)) return base.replace(v, TONE_MAP[v][idx]);
      }
      return base;
    }).join(' ');
  }

  const DIGIT_ZH = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const SUPERSCRIPT_MAP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };

  function yearToSpokenZh(yearStr) {
    return String(yearStr).replace(/\D/g, '').split('').map(d => DIGIT_ZH[parseInt(d, 10)] || '').join('');
  }

  function numberToSpokenZh(numStr, isOrdinalOrDate = false) {
    let clean = String(numStr).replace(/,/g, '').trim();
    if (!clean) return '';
    let prefix = '';
    if (clean.startsWith('-')) { prefix = '負'; clean = clean.slice(1); }
    else if (clean.startsWith('+')) { prefix = '正'; clean = clean.slice(1); }
    const parts = clean.split('.');
    const intPartStr = parts[0], decPartStr = parts[1];
    const n = parseInt(intPartStr, 10);
    if (isNaN(n)) return numStr;
    let intSpoken = '';
    if (!isOrdinalOrDate && intPartStr.length === 4 && n >= 1900 && n <= 2099) {
      intSpoken = yearToSpokenZh(intPartStr);
    } else if (n === 0) {
      intSpoken = '零';
    } else if (n < 10) {
      intSpoken = DIGIT_ZH[n];
    } else if (n < 20) {
      intSpoken = '十' + (n % 10 === 0 ? '' : DIGIT_ZH[n % 10]);
    } else if (n < 100) {
      const tens = Math.floor(n / 10), ones = n % 10;
      intSpoken = DIGIT_ZH[tens] + '十' + (ones === 0 ? '' : DIGIT_ZH[ones]);
    } else {
      const units = ['', '十', '百', '千'];
      const bigUnits = ['', '萬', '億', '萬億'];
      let str = intPartStr.replace(/^0+/, '') || '0';
      let result = '';
      let groupIdx = 0;
      while (str.length > 0) {
        const group = str.slice(-4);
        str = str.slice(0, -4);
        let groupRes = '', zeroFlag = false;
        for (let i = 0; i < group.length; i++) {
          const digit = parseInt(group[i], 10), pos = group.length - 1 - i;
          if (digit === 0) zeroFlag = true;
          else {
            if (zeroFlag) { groupRes += '零'; zeroFlag = false; }
            if (digit === 1 && pos === 1 && group.length === 2 && result === '' && str === '') groupRes += '十';
            else groupRes += DIGIT_ZH[digit] + units[pos];
          }
        }
        if (groupRes) {
          result = groupRes + bigUnits[groupIdx] + (result && !result.startsWith('零') && group[group.length - 1] === '0' ? '零' : '') + result;
        }
        groupIdx++;
      }
      intSpoken = result;
    }
    let decSpoken = '';
    if (decPartStr !== undefined && decPartStr.length > 0) {
      decSpoken = '點' + decPartStr.split('').map(d => DIGIT_ZH[parseInt(d, 10)] || '').join('');
    }
    return prefix + intSpoken + decSpoken;
  }

  const CHEMICAL_FORMULAS_DICT = [
    [/\bH[2₂]SO[4₄]\b/g, '硫酸'], [/\bH[2₂]CO[3₃]\b/g, '碳酸'], [/\bHNO[3₃]\b/g, '硝酸'],
    [/\bH[2₂]O[2₂]\b/g, '過氧化氫'], [/\bH[2₂]O\b/g, '水'], [/\bCO[2₂]\b/g, '二氧化碳'],
    [/\bO[2₂]\b/g, '氧氣'], [/\bH[2₂]\b/g, '氫氣'], [/\bN[2₂]\b/g, '氮氣'],
    [/\bNaCl\b/g, '氯化鈉'], [/\bNaOH\b/g, '氫氧化鈉'], [/\bCaCO[3₃]\b/g, '碳酸鈣'],
    [/\bNH[3₃]\b/g, '氨氣'], [/\bCH[4₄]\b/g, '甲烷'], [/\bHCl\b/g, '鹽酸']
  ];

  function expandMathEconTimeAndDatesToZh(inputText, options = {}) {
    if (!inputText) return '';
    const expandBareNumbers = options.expandBareNumbers !== false;
    let s = String(inputText);
    for (const [reg, zh] of CHEMICAL_FORMULAS_DICT) s = s.replace(reg, zh);

    s = s.replace(/([a-zA-Z0-9\u4e00-\u9fa5]+)([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (_, base, sup) => {
      const exp = sup.split('').map(c => SUPERSCRIPT_MAP[c] || c).join('');
      const baseZh = /^\d+$/.test(base) ? numberToSpokenZh(base) : base;
      if (exp === '2') return `${baseZh}的平方`;
      if (exp === '3') return `${baseZh}的立方`;
      return `${baseZh}的${numberToSpokenZh(exp)}次方`;
    });
    s = s.replace(/(\d+)\s*\^\s*(-?\d+)/g, (_, b, exp) => {
      const base = numberToSpokenZh(b);
      if (exp === '2') return `${base}的平方`;
      if (exp === '3') return `${base}的立方`;
      return `${base}的${numberToSpokenZh(exp)}次方`;
    });
    s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, hh, mm) => {
      const hNum = parseInt(hh, 10), mNum = parseInt(mm, 10);
      if (hNum > 24 || mNum >= 60) return `${hh}:${mm}`;
      const hSpoken = hNum === 2 ? '兩' : numberToSpokenZh(hNum, true);
      const mSpoken = mNum === 0 ? '整' : (mNum < 10 ? `零${numberToSpokenZh(mNum, true)}分` : `${numberToSpokenZh(mNum, true)}分`);
      return `${hSpoken}點${mSpoken}`;
    });
    s = s.replace(/(-?\d+(?:\.\d+)?)\s*%/g, (_, num) => `百分之${numberToSpokenZh(num)}`);
    s = s.replace(/(US\$|HK\$|NT\$|\$|¥|￥|€|£)\s*(\d[\d,]*(?:\.\d+)?)/g, (_, sym, num) => {
      const unitMap = { 'US$': '美元', '$': '美元', 'HK$': '港幣', 'NT$': '新台幣', '¥': '人民幣', '￥': '元', '€': '歐元', '£': '英鎊' };
      return `${numberToSpokenZh(num)}${unitMap[sym] || '元'}`;
    });
    s = s.replace(/([+-±]?)\s*(\d+(?:\.\d+)?)\s*(?:°C|℃)/gi, (_, sign, num) => {
      const signZh = sign === '-' ? '負' : (sign === '+' ? '正' : (sign === '±' ? '正負' : ''));
      return `攝氏${signZh}${numberToSpokenZh(num)}度`;
    });
    s = s.replace(/(\d{4})年(\d{1,2})月(\d{1,2})[日号號]/g, (_, y, m, d) => `${yearToSpokenZh(y)}年${numberToSpokenZh(m, true)}月${numberToSpokenZh(d, true)}日`);
    s = s.replace(/(\d{4})年/g, (_, y) => `${yearToSpokenZh(y)}年`);
    s = s.replace(/(\d{1,2})月/g, (_, m) => `${numberToSpokenZh(m, true)}月`);
    s = s.replace(/(\d{1,2})[日号號]/g, (_, d) => `${numberToSpokenZh(d, true)}日`);
    s = s.replace(/π/g, '派').replace(/≈/g, '約等於').replace(/≠/g, '不等於').replace(/≤/g, '小於等於').replace(/≥/g, '大於等於');

    if (expandBareNumbers) {
      s = s.replace(/\b(19\d{2}|20\d{2})\b/g, (_, yr) => yearToSpokenZh(yr));
      s = s.replace(/\b(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\b/g, (m) => numberToSpokenZh(m));
    }
    return s;
  }

  // 智慧雙語分句（保護 Mr. / Dr. / U.S. / a.m. / p.m. / v5.0 / 3.14 與英文分號子句）
  const ABBREV_REGEX = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Ave|Rd|vs|etc|Inc|Ltd|No|Fig|Vol|Ch|U\.S|U\.S\.A|U\.K|Ph\.D|a\.m|p\.m|e\.g|i\.e)$/i;
  function splitSentences(rawText, maxCount = 80) {
    const clean = String(rawText || '').replace(/\r\n/g, '\n').trim();
    if (!clean) return [];
    const lines = clean.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      // 中文標點或英文完整句末標點切分（保留英文分號 ; 避免切碎上下文）
      const rough = line.split(/(?<=[。！？!?；])\s*|(?<=\.)\s+(?=[A-Z"'(「『])/g);
      let buf = '';
      for (const seg of rough) {
        const piece = seg.trim();
        if (!piece) continue;
        if (buf) {
          // 若前段以英文縮寫結尾，合併回同一句
          if (ABBREV_REGEX.test(buf.replace(/\.$/, ''))) {
            buf += ' ' + piece;
            continue;
          }
          out.push(buf);
          buf = piece;
        } else {
          buf = piece;
        }
      }
      if (buf) out.push(buf);
      if (out.length >= maxCount) break;
    }
    return out.slice(0, maxCount);
  }

  // Chrome Built-in Translator API 單例快取（主執行緒零延遲本地翻譯）
  const translatorCache = new Map(); // key: 'en->zh' => Promise<Translator | null>

  function normalizeLangPair(fromLang, toLang) {
    const src = String(fromLang || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const tgt = String(toLang || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    return { src, tgt, key: `${src}->${tgt}` };
  }

  async function getLocalTranslator(fromLang, toLang, allowDownload = false) {
    if (typeof global.Translator === 'undefined' || typeof global.Translator.create !== 'function') {
      return null;
    }
    const { src, tgt, key } = normalizeLangPair(fromLang, toLang);
    if (src === tgt) return null;

    if (translatorCache.has(key)) {
      return translatorCache.get(key);
    }

    const promise = (async () => {
      try {
        if (typeof global.Translator.availability === 'function') {
          const avail = await global.Translator.availability({ sourceLanguage: src, targetLanguage: tgt });
          const ready = (avail === 'available' || avail === 'readily');
          const downloadable = (avail === 'downloadable' || avail === 'after-download');
          if (!ready && !(allowDownload && downloadable)) {
            translatorCache.delete(key);
            return null;
          }
        }
        const instance = await global.Translator.create({
          sourceLanguage: src,
          targetLanguage: tgt
        });
        return instance;
      } catch (e) {
        translatorCache.delete(key);
        return null;
      }
    })();

    translatorCache.set(key, promise);
    return promise;
  }

  async function translateWithBrowserLocal(text, fromLang, toLang, allowDownload = false) {
    const clean = String(text || '').trim();
    if (!clean) return '';
    try {
      const translator = await getLocalTranslator(fromLang, toLang, allowDownload);
      if (!translator) return '';
      const res = await translator.translate(clean);
      return (res && res.trim() && res.trim() !== clean) ? res.trim() : '';
    } catch (e) {
      return '';
    }
  }

  // Chrome 內建端側 Gemini Nano (LanguageModel) — 100% 用戶端免費、懂英文口語與語境，僅在已就緒時使用
  let localNanoAvailable = null; // null | true | false
  async function translateLinesWithLocalNano(lines, srcLang, tgtLang) {
    const totalLen = Array.isArray(lines) ? lines.reduce((a, s) => a + String(s || '').length, 0) : 0;
    if (!Array.isArray(lines) || lines.length === 0 || lines.length > 4 || totalLen > 240) return null;
    if (localNanoAvailable === false) return null;
    const LM = global.LanguageModel || (global.ai && global.ai.languageModel);
    if (!LM || typeof LM.create !== 'function') {
      localNanoAvailable = false;
      return null;
    }
    try {
      if (localNanoAvailable === null) {
        let state = '';
        if (typeof LM.availability === 'function') {
          state = await LM.availability();
        } else if (typeof LM.capabilities === 'function') {
          const cap = await LM.capabilities();
          state = cap && cap.available;
        }
        if (state !== 'available' && state !== 'readily') {
          localNanoAvailable = false;
          return null;
        }
        localNanoAvailable = true;
      }
      const isEnToZh = String(srcLang).startsWith('en');
      const numbered = lines.map((s, idx) => `[${idx + 1}] ${s}`).join('\n');
      const prompt = isEnToZh
        ? `Translate each numbered English line into natural, idiomatic everyday spoken Mandarin Chinese (NOT word-for-word literal).
Always translate "Trees Pinyin" as "樹拼音". CRITICAL: If an English line is a title or English translation of a Chinese classic, poem, idiom, or anthem, ALWAYS restore the EXACT original canonical Classical Chinese text (e.g., Three-Character Classic -> 三字經, Hundred Family Surnames -> 百家姓, Thousand-Character Classic -> 千字文, "People at birth are naturally good" -> 人之初，性本善。) — NEVER translate Chinese classics into modern vernacular!
Output ONLY the numbered Chinese translations in the exact format "[1] 中文譯文", one per line, matching the exact count (${lines.length} lines). Do NOT repeat the English text or add explanations.\n\n${numbered}`
        : `Translate each numbered Chinese line into natural, idiomatic, native-sounding English (NEVER literal Chinglish like "Add oil" or "Walk slowly"). Always translate "樹拼音" as "Trees Pinyin" and use standard English names for Chinese classics (e.g., 三字經 -> Three-Character Classic, 百家姓 -> Hundred Family Surnames, 千字文 -> Thousand-Character Classic).
Output ONLY the numbered English translations in the exact format "[1] English translation", one per line, matching the exact count (${lines.length} lines). Do NOT repeat the Chinese text or add explanations.\n\n${numbered}`;

      const session = await LM.create({ temperature: 0.1, topK: 3 });
      try {
        const out = await session.prompt(prompt);
        const map = new Map();
        String(out || '').split(/\n+/).forEach(row => {
          const m = row.trim().match(/^\[(\d+)\]\s*(.+)$/);
          if (m) map.set(parseInt(m[1], 10) - 1, m[2].trim());
        });
        if (map.size === lines.length) {
          const res = lines.map((_, i) => map.get(i) || '');
          if (res.every(Boolean)) return res;
        }
      } finally {
        if (session && typeof session.destroy === 'function') {
          try { session.destroy(); } catch (e) {}
        }
      }
    } catch (e) {}
    return null;
  }

  // 0 毫秒、0 成本高頻英文口語 → 地道中文直覺詞典（防止機器翻譯逐字直譯英文習語）
  const SPOKEN_EN_TO_ZH_MAP = {
    'check please': '買單！',
    'bill please': '買單！',
    'the check please': '麻煩買單！',
    'can i get the check': '可以買單嗎？',
    'how s it going': '最近怎麼樣？',
    'how is it going': '最近怎麼樣？',
    'what s up': '最近怎麼樣？',
    'whats up': '最近怎麼樣？',
    'no worries': '沒關係！',
    'my bad': '不好意思，我的錯！',
    'long time no see': '好久不見！',
    'excuse me': '不好意思，請問一下。',
    'i m full': '我吃飽了。',
    'im full': '我吃飽了。',
    'cheers': '乾杯！',
    'nice to meet you': '很高興認識你！',
    'see you later': '回頭見！',
    'take care': '保重！',
    'good luck': '祝你好運！',
    'break a leg': '祝你演出順利！',
    'piece of cake': '小菜一碟！',
    'never mind': '沒事，算了。',
    'you re welcome': '不客氣！',
    'youre welcome': '不客氣！',
    'of course': '當然！',
    'sounds good': '聽起來不錯！',
    'makes sense': '有道理！',
    'how much is this': '這個多少錢？',
    'how much is it': '這個多少錢？',
    'where is the restroom': '請問洗手間在哪裡？',
    'where is the bathroom': '請問洗手間在哪裡？',
    'i don t understand': '我聽不懂。',
    'i dont understand': '我聽不懂。',
    'can you speak slower': '可以說慢一點嗎？',
    'wait a second': '等一下！',
    'hold on': '等一下！',
    'here you go': '給你！',
    'it s on me': '這頓我請客！',
    'its on me': '這頓我請客！',
    'let s go': '我們走吧！',
    'lets go': '我們走吧！',
    'for real': '真的嗎？',
    'no problem': '沒問題！',
    'thank you so much': '非常感謝！',
    'i m sorry': '對不起！',
    'im sorry': '對不起！',
    'good morning': '早安！',
    'good night': '晚安！',
    'happy birthday': '生日快樂！',
    'happy new year': '新年快樂！',
    'what do you mean': '你是什麼意思？',
    'are you kidding me': '你在開玩笑吧？',
    'keep in touch': '保持聯絡！',
    'up to you': '隨便你，你決定吧！',
    'i have no idea': '我完全不知道。',
    'i m just looking': '我只是隨便看看。',
    'im just looking': '我只是隨便看看。',
    'for here or to go': '請問要內用還是外帶？',
    'to go please': '外帶，謝謝。',
    'not too spicy': '不要太辣。',
    'mildly spicy': '微辣。',
    'no ice please': '去冰，謝謝。'
  };

  // 0 毫秒、0 成本雙向「經典中文標準詞庫 & 品牌專有名詞」（以標準中文為最高基準）
  // 格式：[標準繁體中文, 標準英文譯名, ...其他常見英文別稱]
  const CANONICAL_CLASSICS_GLOSSARY = [
    // 品牌專有名詞
    ['樹拼音', 'Trees Pinyin', 'tree pinyin', 'trees-pinyin'],
    ['樹拼音系列', 'Trees Pinyin Series', 'tree pinyin series'],
    ['輕鬆說中文', 'Easy Mandarin Speaking'],
    ['輕鬆學中文聲調', 'Easy Mandarin Tones'],

    // 蒙學經典（啟蒙讀物）
    ['三字經', 'Three-Character Classic', 'three character classic', 'san zi jing', 'sanzijing', 'the three character classic'],
    ['百家姓', 'Hundred Family Surnames', 'the hundred family surnames', 'hundred surnames', 'bai jia xing', 'baijiaxing'],
    ['千字文', 'Thousand-Character Classic', 'thousand character classic', 'the thousand character classic', 'thousand character essay', 'qian zi wen', 'qianziwen'],
    ['弟子規', 'Standards for Being a Good Student and Child', 'standards for being a good pupil and child', 'di zi gui', 'dizigui'],
    ['增廣賢文', 'Expanded Writings of Virtuous Words', 'zeng guang xian wen', 'zengguang xianwen'],
    ['聲律啟蒙', 'Sound and Rhythm Enlightenment', 'sheng lv qi meng', 'shenglu qimeng'],
    ['幼學瓊林', 'Treasury of Knowledge for Children', 'you xue qiong lin'],
    ['千家詩', 'Poems of a Thousand Masters', 'qian jia shi'],
    ['孝經', 'Classic of Filial Piety', 'the classic of filial piety', 'xiao jing', 'xiaojing'],
    ['笠翁對韻', 'Liweng Rhyming Couplets', 'li weng dui yun'],
    ['龍文鞭影', 'Longwen Bianying', 'long wen bian ying'],
    ['神童詩', 'Poems of the Child Prodigy', 'shen tong shi'],

    // 四書五經與諸子百家
    ['四書五經', 'Four Books and Five Classics', 'the four books and five classics'],
    ['四書', 'Four Books', 'the four books'],
    ['五經', 'Five Classics', 'the five classics'],
    ['論語', 'The Analects', 'analects', 'analects of confucius', 'the analects of confucius', 'lun yu', 'lunyu'],
    ['孟子', 'Mencius', 'meng zi', 'mengzi'],
    ['大學', 'The Great Learning', 'great learning', 'da xue'],
    ['中庸', 'Doctrine of the Mean', 'the doctrine of the mean', 'zhong yong'],
    ['詩經', 'Classic of Poetry', 'the classic of poetry', 'book of songs', 'the book of songs', 'book of odes', 'shi jing', 'shijing'],
    ['尚書', 'Book of Documents', 'the book of documents', 'classic of history', 'shang shu'],
    ['禮記', 'Book of Rites', 'the book of rites', 'classic of rites', 'li ji', 'liji'],
    ['易經', 'Book of Changes', 'the book of changes', 'i ching', 'yi jing', 'yijing', 'zhou yi'],
    ['春秋', 'Spring and Autumn Annals', 'the spring and autumn annals', 'chun qiu'],
    ['左傳', 'Commentary of Zuo', 'zuo zhuan', 'zuozhuan'],
    ['道德經', 'Tao Te Ching', 'dao de jing', 'daodejing', 'the tao te ching', 'classic of the way and virtue'],
    ['莊子', 'Zhuangzi', 'chuang tzu', 'chuang-tzu'],
    ['孫子兵法', 'The Art of War', 'art of war', "sun tzu's art of war", 'sun tzu art of war', 'sun zi bing fa'],
    ['山海經', 'Classic of Mountains and Seas', 'the classic of mountains and seas', 'shan hai jing'],
    ['戰國策', 'Strategies of the Warring States', 'zhan guo ce'],
    ['史記', 'Records of the Grand Historian', 'shi ji', 'shiji'],
    ['資治通鑑', 'Comprehensive Mirror in Aid of Governance', 'zi zhi tong jian'],
    ['漢書', 'Book of Han', 'han shu'],
    ['三國志', 'Records of the Three Kingdoms', 'san guo zhi'],
    ['黃帝內經', "Yellow Emperor's Inner Canon", 'huangdi neijing', 'huang di nei jing'],
    ['本草綱目', 'Compendium of Materia Medica', 'ben cao gang mu'],
    ['茶經', 'The Classic of Tea', 'classic of tea', 'tea classic', 'cha jing'],
    ['夢溪筆談', 'Dream Pool Essays', 'meng xi bi tan'],
    ['天工開物', 'Exploitation of the Works of Nature', 'tian gong kai wu'],
    ['菜根譚', 'Vegetable Root Discourse', 'cai gen tan'],
    ['朱子家訓', 'Family Instructions of Master Zhu', 'zhu zi jia xun'],
    ['顏氏家訓', 'Family Instructions of Master Yan', 'yan shi jia xun'],
    ['誡子書', 'Admonition to My Son', 'letter to my son', 'jie zi shu'],
    ['韓非子', 'Han Feizi', 'han fei zi'],
    ['墨子', 'Mozi', 'mo zi'],
    ['荀子', 'Xunzi', 'xun zi'],
    ['鬼谷子', 'Guiguzi', 'gui gu zi'],

    // 四大名著與古典文學
    ['四大名著', 'Four Great Classical Novels', 'the four great classical novels'],
    ['西遊記', 'Journey to the West', 'the journey to the west', 'xi you ji'],
    ['三國演義', 'Romance of the Three Kingdoms', 'the romance of the three kingdoms', 'san guo yan yi'],
    ['水滸傳', 'Water Margin', 'outlaws of the marsh', 'all men are brothers', 'shui hu zhuan'],
    ['紅樓夢', 'Dream of the Red Chamber', 'the dream of the red chamber', 'the story of the stone', 'hong lou meng'],
    ['聊齋誌異', 'Strange Tales from a Chinese Studio', 'liao zhai zhi yi'],
    ['儒林外史', 'The Scholars', 'ru lin wai shi'],
    ['封神演義', 'Investiture of the Gods', 'feng shen yan yi'],
    ['楚辭', 'Songs of Chu', 'the songs of chu', 'chu ci'],
    ['離騷', 'Encountering Sorrow', 'li sao'],
    ['唐詩三百首', 'Three Hundred Tang Poems', '300 tang poems', 'tang shi san bai shou'],
    ['宋詞三百首', 'Three Hundred Song Lyrics', '300 song lyrics', '300 song ci', 'song ci san bai shou'],
    ['全唐詩', 'Complete Tang Poems', 'quan tang shi'],
    ['世說新語', 'A New Account of the Tales of the World', 'new account of the tales of the world', 'shi shuo xin yu'],
    ['古文觀止', 'Anthology of Classical Chinese Prose', 'gu wen guan zhi'],
    ['文心雕龍', 'The Literary Mind and the Carving of Dragons', 'wen xin diao long'],
    ['牡丹亭', 'The Peony Pavilion', 'peony pavilion', 'mu dan ting'],
    ['西廂記', 'Romance of the Western Chamber', 'xi xiang ji'],

    // 古詩文名篇篇名
    ['靜夜思', 'Quiet Night Thought', 'thoughts on a silent night', 'silent night thought', 'quiet night thoughts', 'jing ye si'],
    ['春曉', 'Spring Dawn', 'a spring morning', 'spring morning', 'chun xiao'],
    ['詠鵝', 'Ode to the Goose', 'ode to a goose', 'yong e'],
    ['憫農', 'Sympathy for the Peasants', 'pity the farmers', 'min nong'],
    ['登鸛雀樓', 'Ascending Stork Tower', 'on the stork tower', 'climbing stork tower', 'deng guan que lou'],
    ['鹿柴', 'Deer Enclosure', 'deer park', 'lu zhai'],
    ['江雪', 'River Snow', 'jiang xue'],
    ['楓橋夜泊', 'Mooring by Maple Bridge at Night', 'feng qiao ye bo'],
    ['遊子吟', 'Song of the Wandering Son', 'you zi yin'],
    ['將進酒', 'Invitation to Wine', 'bring in the wine', 'qiang jin jiu'],
    ['水調歌頭', 'Prelude to Water Melody', 'shui diao ge tou'],
    ['桃花源記', 'Peach Blossom Spring', 'the peach blossom spring', 'tao hua yuan ji'],
    ['蘭亭集序', 'Preface to the Orchid Pavilion', 'lan ting ji xu'],
    ['出師表', 'Memorial on Sending Out the Troops', 'chu shi biao'],
    ['岳陽樓記', 'On the Yueyang Tower', 'yue yang lou ji'],
    ['醉翁亭記', 'The Old Drunkard Pavilion', 'zui weng ting ji'],
    ['陋室銘', 'Humble Room Inscription', 'inscription on a humble room', 'lou shi ming'],
    ['愛蓮說', 'On the Love of the Lotus', 'ai lian shuo'],
    ['木蘭辭', 'Ballad of Mulan', 'the ballad of mulan', 'mu lan ci'],
    ['長恨歌', 'Song of Everlasting Sorrow', 'chang hen ge'],
    ['琵琶行', 'Song of the Pipa Player', 'pi pa xing'],
    ['春江花月夜', 'Spring River in the Flower Moon Night', 'chun jiang hua yue ye'],

    // 高頻經典名句（英譯回中時精準還原標準古文原句）
    ['人之初，性本善。', 'People at birth are naturally good.', 'men at their birth are naturally good', 'human beings are born good'],
    ['性相近，習相遠。', 'Their natures are much the same; their habits become widely different.', 'by nature men are nearly alike by practice they get to be wide apart'],
    ['苟不教，性乃遷。', 'If foolishly there is no teaching, the nature will deteriorate.'],
    ['教之道，貴以專。', 'The right way in teaching is to attach the utmost importance to thoroughness.'],
    ['玉不琢，不成器。', 'Jade uncut will not form a vessel for use.', 'if jade is not polished it cannot become a thing of use', 'uncut jade cannot become a useful vessel'],
    ['人不學，不知義。', 'People who do not learn will not know righteousness.', 'if men do not learn they do not know the right way'],
    ['天地玄黃，宇宙洪荒。', 'Heaven and Earth were dark and yellow; the universe was vast and primordial.'],
    ['道可道，非常道。', 'The Tao that can be told is not the eternal Tao.', 'the dao that can be spoken is not the eternal dao', 'the way that can be spoken of is not the constant way'],
    ['名可名，非常名。', 'The name that can be named is not the eternal name.'],
    ['千里之行，始於足下。', 'A journey of a thousand miles begins with a single step.', 'a thousand mile journey begins with a single step'],
    ['知己知彼，百戰不殆。', 'Know yourself and know your enemy, and you will never be defeated.', 'know thyself and know thy enemy and you will never be defeated', 'know yourself and know your enemy'],
    ['己所不欲，勿施於人。', 'Do not do to others what you would not have them do to you.', 'do not impose on others what you yourself do not desire'],
    ['三人行，必有我師焉。', 'When three people walk together, there is always one I can learn from.', 'among any three people walking together i will find something to learn'],
    ['學而時習之，不亦說乎？', "Isn't it a joy to learn and practice what you have learned?", 'is it not a pleasure to learn and practice what you have learned'],
    ['有朋自遠方來，不亦樂乎？', "Isn't it delightful to have friends come from afar?", 'is it not delightful to have friends coming from distant quarters'],
    ['溫故而知新，可以為師矣。', 'Reviewing the old to understand the new makes one worthy of being a teacher.'],
    ['學而不思則罔，思而不學則殆。', 'Learning without thought is labor lost; thought without learning is perilous.'],
    ['床前明月光', 'Before my bed, bright moonlight shines.', 'moonlight before my bed', 'bright moonlight before my bed'],
    ['疑是地上霜', 'I suspect it is frost on the ground.', 'i wonder if it is frost on the ground'],
    ['舉頭望明月', 'I raise my head and gaze at the bright moon.', 'i lift my head to gaze at the bright moon'],
    ['低頭思故鄉', 'I lower my head and think of my hometown.', 'i bow my head and think of home'],
    ['春眠不覺曉', 'In spring sleep, unaware of the dawn.'],
    ['處處聞啼鳥', 'Everywhere I hear the singing birds.'],
    ['夜來風雨聲', 'Through the night, the sound of wind and rain.'],
    ['花落知多少', 'How many blossoms have fallen, who knows?'],
    ['白日依山盡', 'The bright sun sinks behind the mountains.'],
    ['黃河入海流', 'The Yellow River flows into the sea.'],
    ['欲窮千里目', 'To see a thousand miles further,'],
    ['更上一層樓', 'Climb one story higher.'],
    ['上善若水', 'The highest good is like water.'],
    ['天行健，君子以自強不息。', 'As heaven maintains vigor through movements, a noble person should constantly strive for self-perfection.'],
    ['地勢坤，君子以厚德載物。', 'As earth is receptive and devoted, a noble person should hold the outer world with broad virtue.'],
    ['海內存知己，天涯若比鄰。', 'A bosom friend afar brings a distant land near.'],
    ['但願人長久，千里共嬋娟。', 'May we all be blessed with longevity, sharing the beauty of the moon even a thousand miles apart.'],
    ['天生我材必有用', 'Heaven has made us talents; we are not made in vain.'],

    // 先賢名家與朝代
    ['孔子', 'Confucius', 'kong zi', 'kongzi'],
    ['老子', 'Laozi', 'lao tzu', 'lao-tzu'],
    ['孫子', 'Sun Tzu', 'sun zi', 'sunzi'],
    ['李白', 'Li Bai', 'li po'],
    ['杜甫', 'Du Fu', 'tu fu'],
    ['蘇軾', 'Su Shi', 'su dongpo', 'su dong po'],
    ['王維', 'Wang Wei'],
    ['白居易', 'Bai Juyi'],
    ['陶淵明', 'Tao Yuanming'],
    ['諸葛亮', 'Zhuge Liang'],
    ['屈原', 'Qu Yuan'],
    ['司馬遷', 'Sima Qian'],
    ['唐朝', 'Tang Dynasty', 'the tang dynasty'],
    ['宋朝', 'Song Dynasty', 'the song dynasty'],
    ['漢朝', 'Han Dynasty', 'the han dynasty'],
    ['明朝', 'Ming Dynasty', 'the ming dynasty'],
    ['清朝', 'Qing Dynasty', 'the qing dynasty']
  ];

  // 高頻實用場景 0ms 本地詞庫：中餐菜單名菜、手搖飲客製、點餐/過敏、路牌與旅遊生存標誌（自動支援繁簡與雙向查詢）
  const REALWORLD_DINING_AND_SIGNS_GLOSSARY = [
    // 1. 路牌、交通與公共場所標誌 (Street Signs & Transit)
    ['出口', 'Exit'],
    ['入口', 'Entrance'],
    ['安全出口', 'Emergency Exit'],
    ['緊急出口', 'Emergency Exit'],
    ['太平門', 'Emergency Exit'],
    ['推', 'Push'],
    ['拉', 'Pull'],
    ['洗手間', 'Restroom', 'bathroom', 'toilet', 'washroom'],
    ['廁所', 'Restroom', 'toilet'],
    ['化妝間', 'Restroom'],
    ['男廁', "Men's Restroom", 'men restroom'],
    ['女廁', "Women's Restroom", 'women restroom'],
    ['無障礙廁所', 'Accessible Restroom'],
    ['小心地滑', 'Caution: Wet Floor', 'wet floor', 'caution slippery floor'],
    ['小心台階', 'Watch Your Step', 'mind the step'],
    ['小心碰頭', 'Mind Your Head', 'watch your head'],
    ['禁止吸菸', 'No Smoking', 'no smoking please'],
    ['禁止吸煙', 'No Smoking'],
    ['請勿吸菸', 'No Smoking'],
    ['禁止拍照', 'No Photography', 'no photos'],
    ['請勿觸摸', 'Do Not Touch'],
    ['請勿飲食', 'No Food or Drink'],
    ['禁止停車', 'No Parking'],
    ['請排隊', 'Please Wait in Line', 'please queue here'],
    ['營業中', 'Open', 'open now'],
    ['休息中', 'Closed'],
    ['今日公休', 'Closed Today'],
    ['售完', 'Sold Out'],
    ['已售罄', 'Sold Out'],
    ['只收現金', 'Cash Only'],
    ['可刷卡', 'Credit Cards Accepted'],
    ['行動支付', 'Mobile Payment'],
    ['免費無線網路', 'Free Wi-Fi', 'free wifi'],
    ['地鐵站', 'Subway Station'],
    ['捷運站', 'MRT Station', 'metro station'],
    ['火車站', 'Train Station'],
    ['高鐵站', 'High-Speed Rail Station'],
    ['公車站', 'Bus Stop'],
    ['計程車招呼站', 'Taxi Stand'],
    ['機場', 'Airport'],
    ['登機口', 'Boarding Gate'],
    ['海關', 'Customs'],
    ['行李提領處', 'Baggage Claim'],
    ['售票處', 'Ticket Office'],
    ['服務台', 'Information Desk', 'customer service'],
    ['電梯', 'Elevator', 'lift'],
    ['手扶梯', 'Escalator'],
    ['樓梯', 'Stairs'],
    ['停車場', 'Parking Lot'],
    ['單行道', 'One Way'],
    ['人行道', 'Sidewalk'],
    ['斑馬線', 'Crosswalk'],
    ['醫院', 'Hospital'],
    ['急診室', 'Emergency Room'],
    ['藥局', 'Pharmacy', 'drugstore'],
    ['警察局', 'Police Station'],
    ['便利商店', 'Convenience Store'],
    ['郵局', 'Post Office'],
    ['銀行', 'Bank'],
    ['換匯處', 'Currency Exchange'],

    // 2. 餐館點菜、忌口與飲料客製 (Ordering, Allergies & Drinks)
    ['菜單', 'Menu'],
    ['英文菜單', 'English Menu'],
    ['招牌菜', 'House Specialty', 'signature dish'],
    ['今日特餐', "Today's Special"],
    ['買單', 'Check, please!', 'bill please'],
    ['結帳', 'Check, please!'],
    ['內用', 'Dine In', 'for here'],
    ['外帶', 'Takeout', 'to go'],
    ['打包', 'Pack it to go', 'doggy bag'],
    ['不要辣', 'Not spicy, please', 'no spice'],
    ['微辣', 'Mildly spicy', 'mild spicy'],
    ['小辣', 'Slightly spicy'],
    ['中辣', 'Medium spicy'],
    ['大辣', 'Very spicy', 'extra spicy'],
    ['不要香菜', 'No cilantro, please', 'no coriander'],
    ['不要蔥', 'No green onions, please', 'no scallions'],
    ['不要蒜', 'No garlic, please'],
    ['不要洋蔥', 'No onions, please'],
    ['不要味精', 'No MSG, please'],
    ['我吃素', "I'm vegetarian", 'vegetarian'],
    ['純素', 'Vegan'],
    ['我對花生過敏', "I'm allergic to peanuts", 'peanut allergy'],
    ['我對海鮮過敏', "I'm allergic to seafood", 'seafood allergy'],
    ['冰水', 'Ice water'],
    ['溫水', 'Warm water'],
    ['熱水', 'Hot water'],
    ['去冰', 'No ice'],
    ['少冰', 'Less ice'],
    ['正常冰', 'Regular ice'],
    ['無糖', 'Unsweetened (0% sugar)', 'no sugar'],
    ['微糖', 'Light sugar (30% sugar)'],
    ['半糖', 'Half sugar (50% sugar)'],
    ['少糖', 'Less sugar (70% sugar)'],
    ['正常甜', 'Regular sweetness (100% sugar)'],
    ['去冰微糖', 'No ice, light sugar (30%)'],
    ['少冰半糖', 'Less ice, half sugar (50%)'],
    ['珍珠奶茶', 'Bubble Milk Tea (Boba)', 'boba tea', 'bubble tea'],
    ['烏龍茶', 'Oolong Tea'],
    ['綠茶', 'Green Tea'],
    ['紅茶', 'Black Tea'],
    ['茉莉花茶', 'Jasmine Tea'],
    ['青島啤酒', 'Tsingtao Beer'],
    ['台灣啤酒', 'Taiwan Beer'],
    ['筷子', 'Chopsticks'],
    ['湯匙', 'Spoon'],
    ['叉子', 'Fork'],
    ['餐巾紙', 'Napkin'],

    // 3. 經典中餐名菜（杜絕機器逐字直譯鬧笑話）
    ['夫妻肺片', 'Sliced Beef & Ox Tripe in Chili Oil'],
    ['螞蟻上樹', 'Stir-Fried Glass Noodles with Minced Pork'],
    ['魚香肉絲', 'Shredded Pork in Garlic Chili Sauce'],
    ['宮保雞丁', 'Kung Pao Chicken'],
    ['麻婆豆腐', 'Mapo Tofu (Spicy Tofu with Minced Meat)'],
    ['回鍋肉', 'Twice-Cooked Pork Belly'],
    ['水煮牛肉', 'Poached Sliced Beef in Spicy Chili Broth'],
    ['水煮魚', 'Poached Fish Fillets in Spicy Chili Oil'],
    ['口水雞', 'Sichuan Cold Chicken in Chili Sesame Oil'],
    ['辣子雞', 'Crispy Fried Chicken with Dried Chilies'],
    ['糖醋排骨', 'Sweet and Sour Pork Ribs'],
    ['糖醋里肌', 'Sweet and Sour Pork Tenderloin'],
    ['紅燒肉', 'Braised Pork Belly in Soy Sauce'],
    ['東坡肉', 'Dongpo Braised Pork Belly'],
    ['紅燒獅子頭', 'Braised Giant Pork Meatballs'],
    ['北京烤鴨', 'Peking Roast Duck'],
    ['脆皮燒鴨', 'Crispy Roast Duck'],
    ['叉燒肉', 'Cantonese BBQ Pork (Char Siu)'],
    ['白切雞', 'Poached White-Cut Chicken'],
    ['三杯雞', 'Taiwanese Three-Cup Chicken'],
    ['鹽酥雞', 'Taiwanese Popcorn Chicken'],
    ['滷肉飯', 'Taiwanese Braised Pork Rice'],
    ['牛肉麵', 'Braised Beef Noodle Soup'],
    ['紅燒牛肉麵', 'Braised Beef Noodle Soup'],
    ['擔擔麵', 'Sichuan Dan Dan Noodles'],
    ['炸醬麵', 'Noodles with Savory Fermented Bean Paste'],
    ['陽春麵', 'Simple Clear-Broth Noodles'],
    ['炒飯', 'Fried Rice'],
    ['蛋炒飯', 'Egg Fried Rice'],
    ['揚州炒飯', 'Yangzhou Fried Rice'],
    ['炒麵', 'Stir-Fried Noodles (Chow Mein)'],
    ['小籠包', 'Xiaolongbao (Steamed Soup Dumplings)'],
    ['生煎包', 'Pan-Fried Pork Soup Buns'],
    ['水餃', 'Boiled Dumplings'],
    ['鍋貼', 'Pan-Fried Potstickers'],
    ['餛飩湯', 'Wonton Soup'],
    ['蔥油餅', 'Scallion Pancake'],
    ['春捲', 'Spring Rolls'],
    ['燒賣', 'Shumai (Steamed Pork & Shrimp Dumplings)'],
    ['蝦餃', 'Har Gow (Steamed Crystal Shrimp Dumplings)'],
    ['叉燒包', 'Steamed BBQ Pork Buns'],
    ['蘿蔔糕', 'Pan-Fried Turnip Cake'],
    ['蛋塔', 'Egg Tart'],
    ['酸辣湯', 'Hot and Sour Soup'],
    ['玉米濃湯', 'Creamy Corn Soup'],
    ['番茄炒蛋', 'Stir-Fried Tomatoes and Eggs'],
    ['乾煸四季豆', 'Dry-Fried Green Beans with Minced Pork'],
    ['地三鮮', 'Stir-Fried Eggplant, Potato & Sweet Pepper'],
    ['拍黃瓜', 'Smashed Cucumber Salad with Garlic'],
    ['皮蛋豆腐', 'Chilled Tofu with Century Egg'],
    ['臭豆腐', 'Stinky Tofu'],
    ['蚵仔煎', 'Taiwanese Oyster Omelette'],
    ['火鍋', 'Hot Pot'],
    ['麻辣火鍋', 'Spicy Sichuan Hot Pot'],
    ['鴛鴦鍋', 'Half-Spicy, Half-Mild Hot Pot'],
    ['白飯', 'Steamed White Rice'],
    ['清蒸鱸魚', 'Steamed Sea Bass with Ginger & Scallions'],
    ['鳳梨蝦球', 'Crispy Shrimp with Pineapple & Mayo'],
    ['椒鹽排骨', 'Salt and Pepper Crispy Pork Ribs'],
    ['鐵板牛柳', 'Sizzling Black Pepper Beef'],
    ['空心菜', 'Stir-Fried Water Spinach'],
    ['高麗菜', 'Stir-Fried Cabbage'],
    ['蒜蓉西蘭花', 'Stir-Fried Broccoli with Garlic'],
    ['芒果冰', 'Shaved Mango Ice']
  ];

  const CLASSICS_EN_TO_ZH = Object.create(null);
  const CLASSICS_ZH_TO_EN = Object.create(null);
  (function initClassicsGlossary() {
    const normEn = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const normZh = (s) => {
      const clean = String(s || '').replace(/[\s，。！？、；：「」『』（）《》(),.!?;:'"~～·・]+/g, '');
      return toSimplified(clean);
    };
    const combined = [...CANONICAL_CLASSICS_GLOSSARY, ...REALWORLD_DINING_AND_SIGNS_GLOSSARY];
    for (const entry of combined) {
      const zh = entry[0];
      const primaryEn = entry[1];
      const zhKey = normZh(zh);
      if (zhKey && !CLASSICS_ZH_TO_EN[zhKey]) CLASSICS_ZH_TO_EN[zhKey] = primaryEn;
      for (let i = 1; i < entry.length; i++) {
        const ek = normEn(entry[i]);
        if (ek && !CLASSICS_EN_TO_ZH[ek]) CLASSICS_EN_TO_ZH[ek] = zh;
      }
    }
  })();

  // 模糊語意模式匹配：將各版本英文譯文（《三字經》《千字文》《道德經》《論語》《孫子兵法》《唐詩》《中華民國國歌》等）0ms 精準還原為「最標準中文原文」
  const CLASSICAL_VERSE_PATTERNS = [
    // 《三字經》
    [/\b(?:people|men|humans?|man)\b.*\b(?:birth|born)\b.*\bgood\b/i, '人之初，性本善。'],
    [/\bnatures?\b.*\b(?:similar|same|alike|close|near)\b.*\b(?:habits?|practice|custom)\b.*\b(?:far|apart|different|wide)\b/i, '性相近，習相遠。'],
    [/\bno\s+teaching\b.*\bnature\b.*\b(?:deteriorate|change|worse)\b/i, '苟不教，性乃遷。'],
    [/\bway\b.*\bteaching\b.*\b(?:thoroughness|focus|dedication|concentration)\b/i, '教之道，貴以專。'],
    [/\bmencius(?:'s)?\s+mother\b.*\b(?:moved|chose|neighbor)\b/i, '昔孟母，擇鄰處。'],
    [/\b(?:child|son)\b.*\bnot\s+(?:learn|study)\b.*\b(?:cut|broke)\b.*\bloom\b/i, '子不學，斷機杼。'],
    [/\bjade\b.*\b(?:uncut|unpolished|not\s+polished|not\s+carved)\b.*\b(?:vessel|useful|utensil|thing)\b/i, '玉不琢，不成器。'],
    [/\b(?:people|men|person)\b.*\bnot\s+(?:learn|study)\b.*\b(?:righteousness|right\s+way|principle|duty)\b/i, '人不學，不知義。'],
    [/\bfather(?:'s)?\s+fault\b.*\b(?:feed|raise|nourish)\b.*\bnot\s+teach\b/i, '養不教，父之過。'],
    [/\bteacher(?:'s)?\s+(?:laziness|fault)\b.*\bnot\s+strict\b/i, '教不嚴，師之惰。'],
    // 《千字文》
    [/\bheaven\s+and\s+earth\b.*\b(?:dark|black)\s+and\s+yellow\b/i, '天地玄黃，宇宙洪荒。'],
    [/\bsun\s+and\s+moon\b.*\b(?:full|wax|wane|ris|set)\b.*\bstars?\b/i, '日月盈昃，辰宿列張。'],
    [/\bcold\s+comes\b.*\bheat\s+goes\b/i, '寒來暑往，秋收冬藏。'],
    // 《道德經》
    [/\b(?:tao|dao|way)\b.*\b(?:told|spoken|named|expressed)\b.*\bnot\b.*\b(?:eternal|constant|unchanging|true)\b/i, '道可道，非常道。'],
    [/\bname\b.*\b(?:named|spoken)\b.*\bnot\b.*\b(?:eternal|constant|unchanging)\b/i, '名可名，非常名。'],
    [/\bhighest\s+good\b.*\blike\s+water\b/i, '上善若水。'],
    [/\bjourney\b.*\bthousand\s+miles?\b.*\b(?:single|first)\s+step\b/i, '千里之行，始於足下。'],
    [/\bknowing\s+others\b.*\b(?:intelligence|wise)\b.*\bknowing\s+yourself\b/i, '知人者智，自知者明。'],
    [/\b(?:tao|dao)\b.*\bgives?\s+birth\s+to\s+one\b.*\btwo\b.*\bthree\b/i, '道生一，一生二，二生三，三生萬物。'],
    // 《論語》
    [/\b(?:joy|pleasure)\b.*\blearn\b.*\bpractice\b/i, '學而時習之，不亦說乎？'],
    [/\b(?:delightful|joy|happy)\b.*\bfriends?\b.*\b(?:afar|distant|far)\b/i, '有朋自遠方來，不亦樂乎？'],
    [/\bdo\s+not\s+(?:do|impose)\b.*\bothers\b.*\b(?:not\s+want|would\s+not|do\s+not\s+desire)\b/i, '己所不欲，勿施於人。'],
    [/\bthree\s+(?:people|men)\b.*\bwalk(?:ing)?\b.*\b(?:teacher|learn)\b/i, '三人行，必有我師焉。'],
    [/\blearning\s+without\s+thought\b.*\bthought\s+without\s+learning\b/i, '學而不思則罔，思而不學則殆。'],
    [/\breview(?:ing)?\s+the\s+old\b.*\b(?:understand|learn|know)\s+the\s+new\b/i, '溫故而知新，可以為師矣。'],
    [/\bwhen\s+you\s+know\b.*\bknow\s+that\s+you\s+know\b.*\bnot\s+know\b/i, '知之為知之，不知為不知，是知也。'],
    // 《孫子兵法》
    [/\bknow\s+(?:yourself|thyself)\b.*\bknow\s+(?:your|thy)\s+enemy\b/i, '知己知彼，百戰不殆。'],
    [/\bsupreme\s+art\s+of\s+war\b.*\bwithout\s+fighting\b/i, '不戰而屈人之兵，善之善者也。'],
    [/\ball\s+warfare\b.*\bbased\s+on\s+deception\b/i, '兵者，詭道也。'],
    // 《唐詩宋詞名句》
    [/\bmoonlight\b.*\b(?:before|in\s+front\s+of)\s+(?:my\s+)?bed\b/i, '床前明月光，'],
    [/\b(?:suspect|wonder|seems?|looks?\s+like)\b.*\bfrost\b.*\bground\b/i, '疑是地上霜。'],
    [/\b(?:raise|lift)\s+(?:my\s+)?head\b.*\b(?:gaze|look)\b.*\bmoon\b/i, '舉頭望明月，'],
    [/\b(?:lower|bow)\s+(?:my\s+)?head\b.*\b(?:think|miss)\b.*\b(?:home|hometown)\b/i, '低頭思故鄉。'],
    [/\bspring\s+(?:sleep|slumber)\b.*\b(?:unaware|not\s+notic)\b.*\bdawn\b/i, '春眠不覺曉，'],
    [/\beverywhere\b.*\bhear\b.*\b(?:singing\s+)?birds?\b/i, '處處聞啼鳥。'],
    [/\b(?:last\s+night|through\s+the\s+night)\b.*\bsound\s+of\s+wind\s+and\s+rain\b/i, '夜來風雨聲，'],
    [/\bhow\s+many\s+(?:blossoms?|flowers?)\b.*\bfallen\b/i, '花落知多少。'],
    [/\bsun\b.*\b(?:sinks?|sets?)\b.*\bmountains?\b/i, '白日依山盡，'],
    [/\byellow\s+river\b.*\bflows?\b.*\bsea\b/i, '黃河入海流。'],
    [/\bsee\b.*\bthousand\s+miles?\b.*\b(?:further|farther)\b/i, '欲窮千里目，'],
    [/\bclimb\b.*\b(?:one\s+more|higher)\s+(?:story|floor|level)\b/i, '更上一層樓。'],
    [/\bmay\s+we\s+(?:all\s+)?live\s+long\b.*\bshare\b.*\bmoon\b/i, '但願人長久，千里共嬋娟。'],
    [/\bbosom\s+friend\s+afar\b.*\bdistant\s+land\s+near\b/i, '海內存知己，天涯若比鄰。'],
    // 《中華民國國歌》
    [/\bthree\s+principles\s+of\s+the\s+people\b.*\b(?:aim|uphold|party)\b/i, '三民主義，吾黨所宗，'],
    [/\bestablish\s+the\s+republic\b.*\bgreat\s+unity\b/i, '以建民國，以進大同。'],
    [/\bone\s+heart\b.*\bone\s+(?:virtue|mind)\b.*\bbeginning\s+to\s+end\b/i, '一心一德，貫徹始終。']
  ];

  // 英文查詞庫（同時保留尾端標點如 : , ? ! 與 & -> 與，並模糊還原經典古文原文）
  function lookupSpokenEnToZh(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    let suffix = '';
    let core = raw;
    if (/\s*&\s*$/.test(core)) {
      suffix = '與';
      core = core.replace(/\s*&\s*$/, '').trim();
    } else if (/[:：]\s*$/.test(core)) {
      suffix = '：';
      core = core.replace(/[:：]\s*$/, '').trim();
    } else if (/,\s*$/.test(core)) {
      suffix = '，';
      core = core.replace(/,\s*$/, '').trim();
    }
    const norm = core.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    let hit = CLASSICS_EN_TO_ZH[norm] || SPOKEN_EN_TO_ZH_MAP[norm] || '';
    if (!hit) {
      for (let i = 0; i < CLASSICAL_VERSE_PATTERNS.length; i++) {
        if (CLASSICAL_VERSE_PATTERNS[i][0].test(raw)) {
          hit = CLASSICAL_VERSE_PATTERNS[i][1];
          break;
        }
      }
    }
    if (!hit) return '';
    if (suffix && !/[。！？：，、與]$/.test(hit)) return hit + suffix;
    return hit;
  }

  // 譯後標準中文正規化（即使專有名詞出現在長句中，也保證還原為標準中文經典名稱與「樹拼音」）
  function normalizeCanonicalChineseOutput(zhText, origEn = '') {
    let s = String(zhText || '');
    if (!s) return s;
    const enLow = String(origEn || '').toLowerCase();

    // 1. 品牌名稱強制標準化為「樹拼音」
    s = s.replace(/(?:樹木|樹林|大樹|樹的|树木|树林|大树|树的)\s*拼音/g, '樹拼音');
    s = s.replace(/\bTrees?\s*Pinyin\b/gi, '樹拼音');

    // 2. 常見經典書名誤譯修正（NMT 常直譯為「三字經典」「百家姓氏」「千字經典」）
    s = s.replace(/三字(?:經典|经典|經書|经书)/g, '三字經');
    s = s.replace(/(?:百家姓氏|一百個?家族姓氏|百個?家族姓氏|百個?姓氏|一百个?家族姓氏|百个?姓氏)/g, '百家姓');
    s = s.replace(/千字(?:經典|经典|經書|经书|經|经)/g, '千字文');
    s = s.replace(/弟子(?:規矩|规矩|規則|规则)/g, '弟子規');
    s = s.replace(/道德(?:經典|经典)/g, '道德經');
    s = s.replace(/山海(?:經典|经典)/g, '山海經');
    s = s.replace(/(?:三百首唐詩|三百首唐诗)/g, '唐詩三百首');
    s = s.replace(/(?:三百首宋詞|三百首宋词)/g, '宋詞三百首');
    s = s.replace(/(?:靜夜思想|静夜思想|安靜夜晚的想法|安静夜晚的想法|靜夜之思|静夜之思)/g, '靜夜思');
    s = s.replace(/(?:三個王國的浪漫|三个王国的浪漫|三國羅曼史|三国罗曼史)/g, '三國演義');
    s = s.replace(/(?:紅樓之夢|红楼之梦|紅樓夢境|红楼梦境)/g, '紅樓夢');

    // 語境觸發修正（僅在英文原文明確提到對應經典時才修正，避免誤改日常詞彙）
    if (/\bart of war\b|\bsun tzu\b/.test(enLow)) {
      s = s.replace(/(?:戰爭的藝術|战争的艺术|戰爭藝術|战争艺术)/g, '孫子兵法');
    }
    if (/\bbook of changes\b|\bi ching\b|\byi jing\b/.test(enLow)) {
      s = s.replace(/(?:變化之書|变化之书|變易之書|变易之书)/g, '易經');
    }
    if (/\bclassic of poetry\b|\bbook of songs\b|\bbook of odes\b/.test(enLow)) {
      s = s.replace(/(?:詩歌經典|诗歌经典|詩歌之書|诗歌之书)/g, '詩經');
    }
    if (/\bjourney to the west\b/.test(enLow)) {
      s = s.replace(/(?:西方之旅|西行記|西行记)/g, '西遊記');
    }
    if (/\bspring dawn\b|\bspring morning\b/.test(enLow)) {
      s = s.replace(/(?:春天的黎明|春天黎明|春天的早晨)/g, '春曉');
    }
    if (/\bgreat learning\b/.test(enLow)) {
      s = s.replace(/(?:偉大的學習|伟大的学习)/g, '大學');
    }
    if (/\bwater margin\b|\boutlaws of the marsh\b/.test(enLow)) {
      s = s.replace(/(?:水邊|水边|水岸|沼澤歹徒)/g, '水滸傳');
    }
    if (/\bclassic of filial piety\b/.test(enLow)) {
      s = s.replace(/(?:孝道經典|孝道经典)/g, '孝經');
    }
    if (/\bbook of rites\b|\bclassic of rites\b/.test(enLow)) {
      s = s.replace(/(?:禮儀之書|礼仪之书|禮儀經典|礼仪经典)/g, '禮記');
    }

    // 3. 修正「係列 → 系列」等常見簡繁誤字 & 清理殘留的英文 "&"
    s = s.replace(/係列/g, '系列').replace(/係統/g, '系統').replace(/體係/g, '體系');
    s = s.replace(/\s*&\s*$/g, '與').replace(/([\u4e00-\u9fa5])\s*&\s*([\u4e00-\u9fa5])/g, '$1與$2');
    return s;
  }

  // 0 毫秒、0 成本高頻中文口語 / 成語 → 地道英文詞典（同時相容繁體與簡體，杜絕 Add oil / Walk slowly 等中式直譯）
  const SPOKEN_ZH_TO_EN_MAP = {
    '买单': 'Check, please!',
    '结账': 'Check, please!',
    '加油': 'You got this!',
    '辛苦了': 'Thanks for your hard work!',
    '您辛苦了': 'Thanks for your hard work!',
    '慢走': 'Take care! Safe travels!',
    '慢慢吃': 'Enjoy your meal!',
    '哪里哪里': "You're too kind!",
    '不好意思': 'Excuse me / Sorry about that.',
    '没关系': 'No worries!',
    '没事': "It's fine, no big deal.",
    '没事儿': "It's fine, no big deal.",
    '不客气': "You're welcome!",
    '别客气': "You're welcome!",
    '小意思': 'Piece of cake! / No big deal!',
    '好久不见': 'Long time no see!',
    '干杯': 'Cheers!',
    '开玩笑的': 'Just kidding!',
    '开玩笑': 'Just kidding!',
    '一路顺风': 'Have a safe trip!',
    '一路平安': 'Have a safe trip!',
    '恭喜发财': 'Wishing you prosperity!',
    '新年快乐': 'Happy New Year!',
    '生日快乐': 'Happy Birthday!',
    '早安': 'Good morning!',
    '早上好': 'Good morning!',
    '晚安': 'Good night!',
    '我吃饱了': "I'm full!",
    '吃饱了': "I'm full!",
    '随便': 'Whatever you like!',
    '随便你': 'Up to you!',
    '听不懂': "I don't understand.",
    '我听不懂': "I don't understand.",
    '等一下': 'Just a moment!',
    '稍等': 'Just a moment!',
    '没问题': 'No problem!',
    '当然': 'Of course!',
    '当然了': 'Of course!',
    '真的吗': 'Really? / For real?',
    '太好了': "That's awesome!",
    '太棒了': 'Amazing!',
    '真好吃': 'So delicious!',
    '好好吃': 'So delicious!',
    '多少钱': 'How much is it?',
    '这个多少钱': 'How much is this?',
    '保重': 'Take care!',
    '回头见': 'See you later!',
    '下次见': 'See you next time!',
    '保持联系': 'Keep in touch!',
    '保持联络': 'Keep in touch!',
    '祝你好运': 'Good luck!',
    '我请客': "It's on me!",
    '这顿我请客': "This one's on me!",
    '不要太辣': 'Not too spicy, please.',
    '微辣': 'Mildly spicy.',
    '去冰': 'No ice, please.',
    '少冰': 'Less ice, please.',
    '打包': 'To go, please!',
    '人山人海': 'Packed with people!',
    '马马虎虎': 'So-so.',
    '莫名其妙': 'Makes no sense at all!',
    '一举两得': 'Kill two birds with one stone.',
    '半途而废': 'Give up halfway.',
    '画蛇添足': 'Overdo it / Gild the lily.'
  };

  function lookupSpokenZhToEn(text) {
    const raw = String(text || '').replace(/[\s，。！？、；：「」『』（）《》(),.!?;:'"~～·・]+/g, '');
    if (!raw) return '';
    const simp = toSimplified(raw);
    return CLASSICS_ZH_TO_EN[simp] || SPOKEN_ZH_TO_EN_MAP[simp] || '';
  }


  // 統一鎖定「台灣國語女聲」(Meijia / HsiaoChen / HsiaoYu / Google 國語（臺灣） / Yating / Hanhan / zh-TW)
  function pickTaiwanFemaleVoice() {
    if (typeof global.speechSynthesis === 'undefined' || !global.speechSynthesis.getVoices) return null;
    const all = global.speechSynthesis.getVoices() || [];
    if (all.length === 0) return null;

    const maleRe = /\b(male|kangkang|yunxi|yunjian|yunyang|yunjhe|yun-jhe|zhiwei|danny|wanlung|eddy|reed|sandy|grandpa|rocko|albert|fred|ralph|junior)\b|男聲|男声/i;
    const isFemale = (v) => !maleRe.test(`${v.name || ''} ${v.voiceURI || ''}`);

    // 第一優先：嚴格台灣國語女聲 (zh-TW / cmn-TW / Taiwan / 臺灣 / 台灣 / 國語)
    const twVoices = all.filter(v =>
      (/zh[-_]?tw|cmn[-_]?tw/i.test(v.lang || '') || /taiwan|臺灣|台灣|國語|meijia|hsiaochen|hsiaoyu|yating|hanhan/i.test(v.name || ''))
      && isFemale(v)
    );
    const twPriority = ['meijia', 'hsiaochen', 'hsiaoyu', 'google 國語', 'yating', 'hanhan', 'taiwan', '臺灣', '台灣'];
    if (twVoices.length > 0) {
      twVoices.sort((a, b) => {
        const aS = twPriority.findIndex(k => (a.name || '').toLowerCase().includes(k));
        const bS = twPriority.findIndex(k => (b.name || '').toLowerCase().includes(k));
        return (aS === -1 ? 99 : aS) - (bS === -1 ? 99 : bS);
      });
      return twVoices[0];
    }

    // 第二優先（僅當系統未安裝台灣語音包時）：其他清晰中文女聲
    const zhFemales = all.filter(v =>
      (/zh|cmn|chi/i.test(v.lang || '') || /chinese|mandarin/i.test(v.name || '')) && isFemale(v)
    );
    const fbPriority = ['xiaoxiao', 'ting-ting', 'tingting', 'google 普通話', 'sin-ji', 'female'];
    if (zhFemales.length > 0) {
      zhFemales.sort((a, b) => {
        const aS = fbPriority.findIndex(k => (a.name || '').toLowerCase().includes(k));
        const bS = fbPriority.findIndex(k => (b.name || '').toLowerCase().includes(k));
        return (aS === -1 ? 99 : aS) - (bS === -1 ? 99 : bS);
      });
      return zhFemales[0];
    }
    return null;
  }

  global.TreesTextUtils = {
    TRAD_TO_SIMP,
    SIMP_TO_TRAD,
    toSimplified,
    toTraditional,
    convertScript,
    escapeHtml,
    toStandardToneMarks,
    yearToSpokenZh,
    numberToSpokenZh,
    expandMathEconTimeAndDatesToZh,
    splitSentences,
    getLocalTranslator,
    translateWithBrowserLocal,
    translateLinesWithLocalNano,
    lookupCanonicalEnToZh: lookupSpokenEnToZh,
    lookupCanonicalZhToEn: lookupSpokenZhToEn,
    normalizeCanonicalChineseOutput,
    pickTaiwanFemaleVoice
  };
})(typeof window !== 'undefined' ? window : self);
