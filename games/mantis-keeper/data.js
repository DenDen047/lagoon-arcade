'use strict';
/* カマキリ飼育日記 — 生き物とエサの数値。ゲームの手ざわりを変えるときはまずここを触る。
   1ターン = 3日。数値は実際の飼育記録 (オオカマキリは1齢から7回脱皮して成虫になる、
   1齢から成虫まで約110日) に寄せてある。 */

const TURN_DAYS = 3;
const START_DOY = 109;              // 4月20日ごろ孵化する (1月1日 = 0)
const NYMPH_COLD_DOY = 333;         // 11月30日。これまでに成虫になれないと冬を越せない
const MALE_END_DOY = 323;           // 11月20日ごろにオスの寿命が来る
const FEMALE_END_DOY = 353;         // 12月20日ごろにメスの寿命が来る

// 成長段階。length は体長 (mm)。need は次の脱皮までに要る「育ち」で、
// ちょうどいい大きさのエサ1匹がおよそ 1。minTurns は脱皮までの最短ターン数。
const STAGES = [
  { name: '1齢', length: 10, need: 2.5, minTurns: 2 },
  { name: '2齢', length: 18, need: 3, minTurns: 3 },
  { name: '3齢', length: 22, need: 3, minTurns: 3 },
  { name: '4齢', length: 30, need: 3.5, minTurns: 3 },
  { name: '5齢', length: 40, need: 4, minTurns: 4 },
  { name: '6齢', length: 50, need: 4, minTurns: 4 },
  { name: '7齢', length: 60, need: 4.5, minTurns: 5 },
  { name: '成虫', length: 80, adult: true },
];
const ADULT_LENGTH = { F: 88, M: 76 };
const SEX_VISIBLE_STAGE = 4;        // 5齢からおなかの節が数えられる (オス8節・メス6節)

// エサ。size は体長 (mm)。move は動き方 (crawl 歩く / fly 飛ぶ / hop 跳ねる)。
const PREY = [
  { id: 'aphid', name: 'アブラムシ', size: 2, move: 'crawl', note: '草の汁を吸う小さな虫' },
  { id: 'fruitfly', name: 'ショウジョウバエ', size: 3, move: 'crawl', note: '飛べない種類。小さい幼虫の定番' },
  { id: 'housefly', name: 'イエバエ', size: 7, move: 'fly', note: 'すばやく飛び回る' },
  { id: 'cricketS', name: 'コオロギ (S)', size: 8, move: 'hop', note: '生まれて間もないコオロギ' },
  { id: 'cricketM', name: 'コオロギ (M)', size: 15, move: 'hop', note: 'ペットショップでよく売っている' },
  { id: 'moth', name: 'ガ', size: 20, move: 'fly', note: 'ひらひら飛ぶ。夜に明かりに集まる' },
  { id: 'cricketL', name: 'コオロギ (L)', size: 25, move: 'hop', note: '大きくて力が強い' },
  { id: 'grasshopper', name: 'バッタ', size: 35, move: 'hop', note: '大きくて跳ねる力が強い' },
];

// エサの体長 ÷ カマキリの体長。前胸 (首のように見える部分) くらいの長さがちょうどいい。
const IDEAL_RATIO = 0.3;
const SMALL_RATIO = 0.15;           // これより小さいと、少ししかおなかがふくれない
const BIG_RATIO = 0.5;              // これを超えると、暴れて押さえきれないことがある
const HUGE_RATIO = 0.65;            // これを超えると押さえきれない
const MEAL_FULL = 35;               // ちょうどいいエサ1匹で増えるおなか

// 1ターンで減る量
const HUNGER_DECAY = { nymph: 22, F: 28, M: 18 };
const MOIST_DECAY = 20;
const MIST_AMOUNT = 30;
const CLEAN_DECAY = 8;
const LEFTOVER_DIRT = 12;           // 残ったエサの虫1匹あたり

// しめり気の目安。乾きすぎると脱皮に失敗し、湿りすぎるとカビが生える。
const MOIST_MOLT_MIN = 35;
const MOIST_MOLD = 85;

const NAME_IDEAS = ['カマ吉', 'みどり', 'かまこ', 'キリ丸', 'ソラ', 'コハク', 'ハヤテ', 'モエギ', 'クヌギ', 'ススキ'];
