'use strict';
/* ハラビロカマキリ飼育日記 — 生き物とエサと季節の数値。ゲームの手ざわりを変えるときはまずここを触る。
   1ターン = 3日。出典のある値と、ゲームのために決めた値を分けて書いてある。
   主な出典:
   - Wu & Chang (2011) 闊腹螳螂之生物特性初步觀察。苗栗區農業改良場 研究彙報 第2期。27±1℃ で飼育した記録
     (各齢の体長、幼虫期間 62.5日、成虫寿命 メス138日・オス118日、卵鞘はメス1匹で4〜5個・1個に卵157個ほど)
     https://kmweb.moa.gov.tw/redirect_files.php?id=544210&theme=knowledgebase
   - 環境省 指標種の生態情報 (樹上性、前翅の白斑、前脚基節の黄色い突起、卵鞘は褐色の楕円形)
     https://www.env.go.jp/content/000283612.pdf
   - 気象庁 東京の平年値 1991〜2020年 https://www.data.jma.go.jp/stats/etrn/view/nml_sfc_ym.php?prec_no=44&block_no=47662 */

const TURN_DAYS = 3;
const START_DOY = 139;              // 5月20日ごろ孵化する (1月1日 = 0)。本州では5月ごろ孵化する

// 成長段階。length は体長 (mm) で、Wu & Chang (2011) の各齢の平均を丸めた値。
// 文献では7〜9齢と報告が割れるので、ゲームでは7齢のあと成虫になるとする。
// need は次の脱皮までに要る「育ち」で、ちょうどいい大きさのエサ1匹がおよそ 1。
// dev は次の脱皮までに要る「発育」(℃・日)。発育零点をこえた温度を日数ぶん足していく。
// 合計は、27℃ で幼虫期間が約63日 (Wu & Chang 2011 の 62.5日) になるようにしてある
const STAGES = [
  { name: '1齢', length: 7, need: 2.5, dev: 115 },
  { name: '2齢', length: 12, need: 2.5, dev: 120 },
  { name: '3齢', length: 15, need: 3, dev: 125 },
  { name: '4齢', length: 19, need: 3, dev: 130 },
  { name: '5齢', length: 25, need: 3.5, dev: 140 },
  { name: '6齢', length: 38, need: 3.5, dev: 150 },
  { name: '7齢', length: 43, need: 4, dev: 160 },
  { name: '成虫', length: 62, adult: true },
];
const ADULT_LENGTH = { F: 64, M: 59 };
const SEX_VISIBLE_STAGE = 4;        // 5齢からおなかの節が数えられる (オス8節・メス6節)
// 緑色になる割合。海南島由来の飼育個体で褐色型は11.6% (Wang et al. 2017, doi:10.18474/JES16-22.1)。
// 日本の野外の割合はわかっていないので、参考値として使う
const GREEN_SHARE = 0.88;
const COLOR_CHANGE = 0.05;          // 脱皮のときに体の色が変わる確率 (ゲームの設定)

// 季節の気温。東京の平年値 (1991〜2020年) の月平均気温 (℃)
const MONTH_TEMP = [5.4, 6.1, 9.4, 14.3, 18.8, 21.9, 25.7, 26.9, 23.3, 18.0, 12.5, 7.7];
const INDOOR_PLUS = 3;              // 家の中は外より少しあたたかい (ゲームの設定)
const PLACES = [
  { id: 'window', name: '日の当たる窓ぎわ', icon: '🪟', plus: 6, note: '日なたで、部屋より6℃くらい高い。夏は暑くなりすぎる。' },
  { id: 'room', name: '部屋のなか', icon: '🏠', plus: 0, note: 'ふつうの部屋。' },
  { id: 'north', name: '北側のすずしい部屋', icon: '🌥️', plus: -3, note: '日が当たらず、3℃くらい低い。真夏はここがいい。' },
  { id: 'heater', name: 'パネルヒーターの上', icon: '🔥', plus: 8, note: 'ケースの下からあたためる。秋や冬に使う。' },
];
// 温度のしきい値。研究では25〜27℃くらいで飼育されているが、何℃で弱るか・食べなくなるかを
// 調べた値はハラビロカマキリでは見つからなかった。ここから下はゲームの設定
const TEMP_GOOD = [24, 30];         // 元気に育つ温度
const TEMP_HOT = 35;                // これ以上だと弱る
const TEMP_EAT_MIN = 15;            // これより寒いとエサを食べない
const TEMP_COLD = 10;               // これ以下だと弱る
const DEV_ZERO = 12;                // 発育零点。これより寒いと育たない
const DEV_MAX = 32;                 // これより暑くても、育つ速さは上がらない

// エサ。size は体長 (mm)。move は動き方 (crawl 歩く / fly 飛ぶ / flutter ひらひら飛ぶ / hop 跳ねる)。
// season があるのは野外でとる虫で、とれる時期 (1月1日 = 0 の日数) が決まっている。
// worm は1匹食べたときにハリガネムシに寄生される確率 (ゲームの設定)。神奈川などの調査では
// ハラビロカマキリ32匹中6匹 (19%) が寄生されていた (永田・安倍 2018)
const PREY = [
  { id: 'fruitfly', name: 'ショウジョウバエ', size: 3, move: 'crawl', note: '飛べない種類。ペットショップで売っている。小さい幼虫の定番' },
  { id: 'aphid', name: 'アブラムシ', size: 2, move: 'crawl', season: [90, 212], when: '4〜7月', note: '草や木の新芽にむらがる小さな虫' },
  { id: 'housefly', name: 'イエバエ', size: 7, move: 'fly', note: 'さなぎを買ってきて羽化させる。すばやく飛び回る' },
  { id: 'cricketS', name: 'コオロギ (S)', size: 8, move: 'hop', note: 'ヨーロッパイエコオロギの子ども。ペットショップで売っている' },
  { id: 'mayfly', name: 'カゲロウ', size: 12, move: 'flutter', season: [120, 288], when: '5〜10月', worm: 0.2, note: '川の水の中で育った虫。夜、川べりの明かりに集まる' },
  { id: 'cricketM', name: 'コオロギ (M)', size: 15, move: 'hop', note: 'ペットショップでよく売っている' },
  { id: 'moth', name: 'ガ', size: 20, move: 'fly', season: [120, 300], when: '5〜10月', note: 'ひらひら飛ぶ。夜に明かりに集まる' },
  { id: 'cricketL', name: 'コオロギ (L)', size: 24, move: 'hop', note: '大きくて力が強い' },
  { id: 'cicada', name: 'アブラゼミ', size: 36, move: 'crawl', season: [196, 263], when: '7月中ごろ〜9月中ごろ', note: '木の幹にとまって鳴く。木の上でくらすハラビロカマキリは、セミもつかまえる' },
];

// エサの体長 ÷ カマキリの体長 (ゲームの設定)。小さいうちは小さいエサ、育ったら大きいエサにする
const IDEAL_RATIO = 0.3;
const SMALL_RATIO = 0.15;           // これより小さいと、少ししかおなかがふくれない
const BIG_RATIO = 0.5;              // これを超えると、暴れて押さえきれないことがある
const HUGE_RATIO = 0.65;            // これを超えると押さえきれない
const MEAL_FULL = 35;               // ちょうどいいエサ1匹で増えるおなか

// 1ターンで減る量 (26℃ のとき。暑いほど多く、寒いほど少なくなる)
const HUNGER_DECAY = { nymph: 22, F: 28, M: 18 };
const MOIST_DECAY = 20;
const MIST_AMOUNT = 30;
const CLEAN_DECAY = 8;
const LEFTOVER_DIRT = 12;           // 残ったエサの虫1匹あたり

// しめり気の目安。乾きすぎると脱皮に失敗し、湿りすぎるとカビが生える。
const MOIST_MOLT_MIN = 35;
const MOIST_MOLD = 85;

// 成虫になってからの日々 (ターン数)
// 交尾できるようになるまで。カマキリの飼育では羽化から2〜3週間あとが目安とされる (Amateur Entomologists' Society)
const MATE_READY = { F: 7, M: 5 };
const LAY_FIRST = 3;                // 交尾してから最初の卵鞘まで (約9日。Wu & Chang 2011 の産卵前期間 8.3日に寄せた)
const LAY_INTERVAL = 4;             // 卵鞘と卵鞘のあいだ (約12日。同じく 13.4日に寄せた)
const LAY_VIRGIN = 12;              // 交尾していないメスが卵鞘を産みはじめるまで (ゲームの設定)
// 卵鞘は産むほど産みにくくなる。LAY_FADE 個に近づくほど産む確率が下がり、そこから先は LAY_MIN_CHANCE だけ残る。
// メス1匹が産む卵鞘は4〜5個 (Wu & Chang 2011) なので、5個くらいで頭打ちにする
const LAY_FADE = 5;
const LAY_MIN_CHANCE = 0.05;
const ADULT_LIFE = { F: 46, M: 39 }; // 寿命。飼育下でメス138日・オス118日。外では寒さで秋の終わりまで
const EGGS_TEXT = '150個ほど';       // 1つの卵鞘に100〜250個、平均157個
const HATCH_COUNT = [100, 200];
const WARM_ROOM_TEXT = 'あたたかい部屋に置いた卵鞘から、真冬なのに幼虫が生まれてきてしまった。外には、幼虫が食べられる小さな虫がいない…';

// ハリガネムシ (ゲームの設定)
const WORM_EXIT = 10;               // 寄生されてから外へ出ていくまでのターン数 (成虫になってから)
const WORM_SIGN = 5;                // 観察で様子がおかしいと気づけるターン数
const WORM_HUNGER = 6;              // 寄生されていると、1ターンでおなかがよけいに減る

const NAME_IDEAS = ['ハラビー', 'みどり', 'わかば', 'キリ丸', 'ソラ', 'クスノキ', 'ハヤテ', 'モエギ', 'サクラ', 'ケヤキ'];
