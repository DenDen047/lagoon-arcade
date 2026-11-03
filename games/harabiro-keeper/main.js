'use strict';
/* ハラビロカマキリ飼育日記 — 本体。セーブ、1ターン (3日) の進み方、置き場所と温度、狩りのミニゲーム、
   ハリガネムシ、家系図、画面の切り替え。 */

const SAVE_KEY = 'harabiro-keeper.save';
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, T = 0;

let game = null;     // セーブされる中身
let scene = 'title'; // title | case | hunt
let hunt = null;     // 狩りの最中だけ使う

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const lerp = (a, b, k) => a + (b - a) * k;
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const dayOfYear = (doy) => ((doy % 365) + 365) % 365;
const yearOf = (g) => g.year + Math.floor(g.doy / 365); // 冬を越して年が明けたら1年すすめて数える

function dateText(doy) {
  let d = dayOfYear(doy), m = 0;
  while (d >= MONTH_DAYS[m]) { d -= MONTH_DAYS[m]; m++; }
  return `${m + 1}月${d + 1}日`;
}

/* ---------------- 季節と温度 ---------------- */
// 月の平年気温を、各月のまんなかの日どうしで直線につなぐ
const MONTH_MID = MONTH_DAYS.map((n, i) => MONTH_DAYS.slice(0, i).reduce((a, b) => a + b, 0) + n / 2);
function outdoorTemp(doy) {
  const d = dayOfYear(doy);
  let i = MONTH_MID.findIndex((mid) => mid > d) - 1;
  if (i === -2) i = 11; // 12月の半ばより後
  const j = (i + 1) % 12;
  const d0 = i < 0 ? MONTH_MID[11] - 365 : MONTH_MID[i], d1 = j === 0 && i >= 0 ? MONTH_MID[0] + 365 : MONTH_MID[j];
  const t0 = MONTH_TEMP[(i + 12) % 12], t1 = MONTH_TEMP[j];
  return lerp(t0, t1, (d - d0) / (d1 - d0));
}
const placeOf = (c, id) => PLACES.find((p) => p.id === (id || c.place)) || PLACES[1];
// ケースの中の温度 (℃、整数)。家の中は外より少しあたたかく、置き場所でさらに変わる
function caseTemp(c, doy, placeId) {
  return Math.round(outdoorTemp(doy) + INDOOR_PLUS + placeOf(c, placeId).plus + (c.noise || 0));
}
const nowTemp = () => caseTemp(game.cage, game.doy);
// 体の動き (おなかのへり方) は、あたたかいほど速い。26℃ くらいで 1
const metabolism = (t) => clamp((t - 8) / 18, 0.2, 1.4);
// 1ターンにたまる「発育」。発育が止まる温度 (発育零点) をこえたぶんだけ、日数ぶんたまる
const devGain = (t) => Math.max(0, Math.min(t, DEV_MAX) - DEV_ZERO) * TURN_DAYS;
function tempWord(t) {
  if (t >= TEMP_HOT) return '暑すぎる';
  if (t > TEMP_GOOD[1]) return '少し暑い';
  if (t >= TEMP_GOOD[0]) return 'ちょうどいい';
  if (t >= TEMP_EAT_MIN) return '少し寒い';
  return '寒すぎる';
}

/* ---------------- セーブ ---------------- */
// 保存できない環境 (プライベートブラウズなど) でも、その場では遊べるようにする
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (e) { /* 保存しない */ } }
function load() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

/* ---------------- カマキリとケース ---------------- */
const isAdult = (m) => !!STAGES[m.stage].adult;
const bodyLength = (m) => (isAdult(m) ? ADULT_LENGTH[m.sex] : STAGES[m.stage].length);
const sexKnown = (m) => m.sexKnown || isAdult(m);
const sexName = (sex) => (sex === 'F' ? 'メス' : 'オス');
const sexLabel = (m) => (sexKnown(m) ? sexName(m.sex) : '性別？');
const canMateFemale = (m) => isAdult(m) && m.sex === 'F' && !m.mated && m.adultTurns >= MATE_READY.F && m.malesLeft > 0;
const canMateMale = (m) => isAdult(m) && m.sex === 'M' && !m.mated && m.adultTurns >= MATE_READY.M;
const canWatch = (m) => isAdult(m) && (m.laid > 0 || m.fertileLaid > 0);
const look = (m) => ({ stage: m.stage, adult: isAdult(m), sex: m.sex, color: m.color, crumpled: m.crumpled, injury: m.injury });
const preyInSeason = (p, doy) => !p.season || (dayOfYear(doy) >= p.season[0] && dayOfYear(doy) <= p.season[1]);

function newGame() {
  return { year: 1, doy: START_DOY, line: 1, gen: 1, m: null, cage: newCage(), oothecae: [], lineage: [], log: [], hatchFrom: null };
}
function newCage() { return { moist: 60, clean: 100, leftover: [], moldy: false, place: 'room', noise: 0 }; }
function newMantis(name, color, from) {
  return {
    name, color, from, sex: Math.random() < 0.5 ? 'F' : 'M',
    stage: 0, growth: 0, dev: 0, stageTurns: 0, state: 'normal', // normal | premolt (脱皮前) | postmolt (脱皮直後)
    hunger: 70, health: 100, injury: 0, crumpled: false, sexKnown: false, shed: false,
    mated: false, malesLeft: 2, adultTurns: 0, eggProgress: 0, laid: 0, fertileLaid: 0, partnerTimer: 0,
    worm: 0, wormOut: false, // ハリガネムシ。worm は寄生されてからのターン数
  };
}

function offspringText(m) {
  if (m.sex === 'F' && m.laid) return m.fertileLaid === m.laid ? `卵鞘 ${m.laid}個` : `卵鞘 ${m.laid}個（幼虫が生まれるのは ${m.fertileLaid}個）`;
  if (m.sex === 'M' && m.fertileLaid) return 'お見合い相手の卵鞘 1個';
  return 'なし';
}

function say(text) {
  game.log.push(text);
  if (game.log.length > 40) game.log.splice(0, game.log.length - 40);
  renderHUD();
}

/* ---------------- お世話 ---------------- */
function actMist() {
  const c = game.cage, m = game.m;
  c.moist = clamp(c.moist + MIST_AMOUNT);
  if (c.moist >= MOIST_MOLD) say('霧吹きをした。かなりジメジメしている。やりすぎるとカビが生える。');
  else say(m.state === 'premolt' ? '霧吹きをした。壁に水滴がついた。' : `霧吹きをした。${m.name}が葉っぱの水滴をなめている。`);
  save();
}

function actClean() {
  const c = game.cage, m = game.m, n = c.leftover.length;
  c.leftover = [];
  if (m.state === 'premolt') {
    // 脱皮前はケースを動かさず、エサの虫だけそっと取り出す
    say(n ? `脱皮の前なので、ケースは動かさずにエサの虫だけ${n}匹そっと取り出した。` : '脱皮の前なので、ケースは動かさずにそっとしておいた。');
  } else {
    c.clean = 100;
    c.moldy = false;
    say(n ? `そうじをして、残っていたエサの虫${n}匹も取り出した。` : 'フンや食べかすをそうじした。');
  }
  save();
}

function actPlace() {
  const c = game.cage, card = openModal();
  card.innerHTML = `<h2>ケースの置き場所</h2><p class="sub">ハラビロカマキリは${TEMP_GOOD[0]}〜${TEMP_GOOD[1]}℃くらいでよく育つ。あたたかいほど早く育つけれど、${TEMP_HOT}℃をこえると弱ってしまう。${TEMP_EAT_MIN}℃より寒いとエサを食べなくなる。</p><div class="preyList"></div><div class="btns"></div>`;
  for (const p of PLACES) {
    const t = caseTemp(c, game.doy, p.id);
    const b = document.createElement('button');
    if (p.id === c.place) b.className = 'here';
    b.innerHTML = `<span class="ico">${p.icon}</span><div><b>${p.name}${p.id === c.place ? '（いまここ）' : ''}</b><small><strong>約${t}℃・${tempWord(t)}</strong>　${p.note}</small></div>`;
    b.onclick = () => {
      closeModal();
      if (p.id === c.place) return;
      c.place = p.id;
      say(`ケースを${p.name}に動かした。ケースの中は約${t}℃（${tempWord(t)}）。`);
      save();
    };
    card.querySelector('.preyList').append(b);
  }
  addButtons(card.querySelector('.btns'), [{ label: 'やめる' }]);
}

function actFeed() {
  const m = game.m, t = nowTemp();
  if (m.state === 'postmolt') return say('脱皮したばかりで体がやわらかい。体がかたまるまではエサを食べない。');
  if (t < TEMP_EAT_MIN) return say(`ケースの中は${t}℃。寒くて${m.name}は動きがにぶく、エサに見向きもしない。`);
  if (m.hunger >= 95) return say(`${m.name}はおなかいっぱいで、エサに見向きもしない。`);
  choosePrey(`${esc(m.name)}（体長 約${bodyLength(m)}mm）にどのエサをあげる？`,
    '体が小さいうちは小さいエサ、大きくなったら大きいエサにかえていこう。大きすぎると暴れて、小さすぎるとおなかがふくれない。野外の虫は、とれる季節が決まっている。',
    (prey) => {
      if (m.state === 'premolt') {
        game.cage.leftover.push(prey.id);
        say(`${prey.name}を入れたけれど、${m.name}はぶら下がったまま動かない。エサの虫がケースに残った。`);
        save();
        return;
      }
      startHunt(prey);
    });
}

function actNext() {
  const g = game, m = g.m, c = g.cage;
  // 脱皮がうまくいくかは、いまのケースの状態 (しめり気・残ったエサ) で決まる
  let emerged = false;
  if (m.state === 'premolt') emerged = molt();
  else if (m.state === 'postmolt') { m.state = 'normal'; m.shed = false; say('体がかたまって、またエサを食べられるようになった。'); }
  else if (!isAdult(m)) {
    const st = STAGES[m.stage];
    if (m.growth >= st.need && m.dev >= st.dev) { m.state = 'premolt'; say(`${m.name}がエサを食べなくなり、上のほうでじっとぶら下がっている…`); }
  }
  if (!g.m) return;

  // 3日ぶん時間がたつ。この3日間の温度は、いま表示している温度
  const t = nowTemp();
  g.doy += TURN_DAYS;
  m.stageTurns++;
  if (!isAdult(m)) m.dev += devGain(t);
  if (c.moist >= MOIST_MOLD) { c.moldy = true; c.clean = clamp(c.clean - 25); say('ジメジメしすぎて、ケースにカビが生えてきた。'); }
  m.hunger = clamp(m.hunger - (isAdult(m) ? HUNGER_DECAY[m.sex] : HUNGER_DECAY.nymph) * metabolism(t) - (m.worm ? WORM_HUNGER : 0));
  c.moist = clamp(c.moist - MOIST_DECAY * (t >= 30 ? 1.4 : t < 18 ? 0.7 : 1));
  c.clean = clamp(c.clean - CLEAN_DECAY - LEFTOVER_DIRT * c.leftover.length);
  let bad = '';
  if (m.hunger <= 0) { m.health -= 20; bad = bad || 'おなかをすかせて死んでしまった'; say(`${m.name}はおなかがぺこぺこで弱っている。`); }
  if (c.moist < 15) { m.health -= 15; bad = bad || '水分が足りずに死んでしまった'; say('ケースがカラカラで、水が飲めずに弱っている。'); }
  if (c.clean < 25) { m.health -= 15; bad = bad || 'よごれたケースで病気になってしまった'; say('ケースが汚れていて、具合が悪そうだ。'); }
  if (t >= TEMP_HOT) { m.health -= 22; bad = bad || '暑さで弱って死んでしまった'; say(`ケースの中が${t}℃になり、${m.name}がぐったりしている。`); }
  if (t <= TEMP_COLD) { m.health -= 12; bad = bad || '寒さで弱って死んでしまった'; say(`ケースの中が${t}℃しかなく、${m.name}は寒さで弱っている。`); }
  if (!bad) m.health += 8;
  m.health = clamp(m.health);
  if (m.health <= 0) return endLife(bad || '弱って死んでしまった');
  if (m.worm && wormTurn()) return;
  if (isAdult(m) && adultTurn()) return;

  // 次の3日間の温度。暑すぎ・寒すぎなら知らせる
  c.noise = rand(-1.5, 1.5);
  const t2 = nowTemp();
  if (t2 >= TEMP_HOT) say(`いまケースの中は${t2}℃。このままだと暑すぎる。置き場所を変えよう。`);
  else if (t2 < TEMP_EAT_MIN) say(`いまケースの中は${t2}℃。寒くてエサを食べられない。あたたかい場所へ動かそう。`);
  save();
  renderHUD();
  if (emerged) {
    modal('羽化！', `<p>${esc(m.name)}は${sexName(m.sex)}の成虫になった。前翅に白い紋がある。</p><p class="sub">${m.sex === 'F'
      ? `メスは成虫になって${MATE_READY.F * TURN_DAYS}日ほどたつと、オスを迎えて交尾できる。羽化してすぐの交尾は、メスの体にさわる。`
      : 'オスは、お見合い相手のメスに会いに行ける。メスはオスをエサと思って食べてしまうことがあるので、気をつけよう。'}</p>`);
  }
}

// 脱皮する。成虫になったら true を返す
function molt() {
  const m = game.m, c = game.cage;
  let why = '';
  if (c.moist < MOIST_MOLT_MIN) why = 'ケースが乾いていて、古い皮がうまくぬげなかった';
  else if (c.leftover.length) why = 'ケースに残っていたエサの虫にじゃまされた';
  const toAdult = m.stage === STAGES.length - 2;
  const before = m.color;
  m.dev = Math.max(0, m.dev - STAGES[m.stage].dev); // 発育の余りは次の齢へ持ちこす
  m.stage++;
  m.growth = 0;
  m.stageTurns = 0;
  m.state = 'postmolt';
  m.shed = true;
  if (toAdult) {
    if (why) { m.crumpled = true; say(`羽化はしたけれど、${why}。はねがのびきらなかった。`); }
    else say(`羽化した！ ${m.name}は成虫になった。`);
    return true;
  }
  if (why) {
    m.injury++;
    m.health = clamp(m.health - 25);
    if (m.injury >= 3) { endLife('脱皮に失敗して死んでしまった', `${why}。脱皮の前は、ケースのしめり気を保って、エサの虫を取り出しておこう。`); return false; }
    say(`脱皮はしたけれど、${why}。あしが曲がってしまった。`);
  } else {
    say(`脱皮して${STAGES[m.stage].name}になった！`);
    if (m.injury > 0) { m.injury--; say('脱皮して、曲がっていたあしが少しよくなった。'); }
  }
  if (m.stage > 1 && Math.random() < COLOR_CHANGE) {
    m.color = before === 'green' ? 'brown' : 'green';
    say(`体の色が${before === 'green' ? '緑から茶色' : '茶色から緑'}に変わった。`);
  }
  return false;
}

// ハリガネムシ。体の中で育ち、宿主が成虫になると水を求めさせて外へ出ていく。
// 終わったら true を返す (カマキリが死んだとき)
function wormTurn() {
  const m = game.m;
  m.worm++;
  if (m.worm < WORM_EXIT || !isAdult(m) || m.state === 'postmolt') return false; // 羽化した直後は待つ
  m.worm = 0;
  m.wormOut = true;
  m.health = clamp(m.health - 45);
  say(`${m.name}のおしりから、細長いハリガネムシが出てきた！`);
  if (m.health <= 0) { endLife('ハリガネムシが出ていったあと、弱って死んでしまった', WORM_NOTE); return true; }
  modal('ハリガネムシ', `<p>${esc(m.name)}のおしりから、体よりずっと長い、針金のようなハリガネムシが出てきた。${esc(m.name)}はすっかり弱ってしまった。${m.sex === 'F' ? 'おなかの中の卵も育たなくなってしまった。' : ''}</p><p class="sub">${WORM_NOTE}</p>`);
  return false;
}
const WORM_NOTE = 'ハリガネムシの子どもは川の中で生まれ、水の中で育つカゲロウなどの幼虫に入りこむ。その虫が大人になって陸に飛んできたのをカマキリが食べると、カマキリの体の中で大きくなる。大きくなると、カマキリを水べに引きよせて外へ出ていく。寄生されたメスは卵が育たない。水の中で育たないペットショップのコオロギやハエなら、この道すじで寄生されることはない。';

// 卵鞘を産む確率。はじめはほぼ確実で、産むほど下がる (1個目 100%・3個目 84%・5個目 36%・6個目から 5%)
const layChance = (laid) => Math.max(LAY_MIN_CHANCE, 1 - (laid / LAY_FADE) ** 2);

// 成虫の1ターン。一生を終えたら true を返す
function adultTurn() {
  const g = game, m = g.m;
  m.adultTurns++;
  if (m.sex === 'F') {
    // 交尾していなくても卵鞘は産む。ただし幼虫は生まれない。ハリガネムシに寄生されると卵が育たない
    const ready = m.mated || m.adultTurns >= LAY_VIRGIN;
    // LAY_INTERVAL ターンごとに産む機会がある。産んだ数が多いほど、産まずに終わることが増える
    if (ready && !m.worm && !m.wormOut && m.hunger >= 40 && ++m.eggProgress >= LAY_INTERVAL) {
      m.eggProgress = 0;
      if (Math.random() < layChance(m.laid)) {
        m.laid++;
        if (m.mated) m.fertileLaid++;
        g.oothecae.push({ fertile: m.mated, mother: m.name });
        say(m.mated ? `${m.name}が卵鞘を産んだ！ この中に${EGGS_TEXT}の卵が入っている。` : `${m.name}が卵鞘を産んだ。でも交尾していないので、この卵鞘から幼虫は生まれない。`);
      }
    }
  } else if (m.partnerTimer > 0 && --m.partnerTimer === 0) {
    g.oothecae.push({ fertile: true, mother: 'お見合い相手のメス' });
    m.fertileLaid++;
    say('お見合い相手のメスが卵鞘を産んだ。ひとつゆずってもらった！');
  }
  if (m.adultTurns >= ADULT_LIFE[m.sex]) { endLife('寿命をまっとうした'); return true; }
  return false;
}

/* ---------------- 交尾 ---------------- */
function actMate() {
  const m = game.m;
  if (m.sex === 'F') {
    modal('オスを迎える', `<p>オスをケースに入れる。おなかをすかせたメスは、オスをエサだと思ってつかまえてしまうことがある。</p><p class="sub">メスがエサを食べている最中に入れると安全。エサをあげて、食べている間に「今だ！オスを入れる」を押そう。お迎えできるオスはあと${m.malesLeft}匹。</p>`,
      [{ label: 'このまま入れる', cls: 'pink', onClick: () => mateFemale(false) }, { label: 'やめておく' }]);
  } else {
    choosePrey(`お見合い相手のメス（体長 約${ADULT_LENGTH.F}mm）に、先にどのエサをあげる？`,
      'メスが食事に夢中になっているあいだに、そっと近づいて交尾する。すぐに食べ終わるエサだと、オスがつかまってしまう。',
      (prey) => mateMale(prey),
      [{ label: 'エサをあげずに近づく', onClick: () => mateMale(null) }]);
  }
}

function mateFemale(duringMeal) {
  const m = game.m;
  m.malesLeft--;
  if (duringMeal || m.hunger >= 85) {
    m.mated = true;
    m.eggProgress = Math.max(m.eggProgress, LAY_INTERVAL - LAY_FIRST); // 交尾から約9日で最初の卵鞘
    say('交尾に成功した！ 終わったので、オスは別のケースにもどした。');
    modal('交尾成功！', `<p>${esc(m.name)}は交尾に成功した。これから産む卵鞘からは、春に幼虫が生まれる。</p><p class="sub">よく食べさせると、10日あまりおきに卵鞘を産む。産むほど産みにくくなり、${LAY_FADE}個くらいでほとんど産まなくなる。</p>`);
  } else {
    say('メスはオスをエサだと思ってつかまえてしまった…');
    modal('あっ…', `<p>おなかをすかせた${esc(m.name)}は、オスをエサだと思ってつかまえてしまった。</p><p class="sub">メスがエサを食べている最中か、おなかいっぱいのときに入れるとうまくいく。お迎えできるオスはあと${m.malesLeft}匹。</p>`);
  }
  save();
  renderHUD();
}

function mateMale(prey) {
  const m = game.m;
  const r = prey ? prey.size / ADULT_LENGTH.F : 0;
  if (r >= 0.28 || (r >= SMALL_RATIO && Math.random() < 0.5)) {
    m.mated = true;
    m.partnerTimer = 3;
    say(`メスが${prey.name}に夢中になっているあいだに、交尾に成功した！`);
    modal('交尾成功！', `<p>メスが${prey.name}を食べているあいだに、${esc(m.name)}はそっと近づいて交尾できた。</p><p class="sub">しばらくすると、お見合い相手のメスが卵鞘を産む。ひとつゆずってもらえる。</p>`);
    save();
    renderHUD();
    return;
  }
  endLife('交尾のときに、メスに食べられてしまった', prey
    ? `${prey.name}は、すぐに食べ終わってしまった。メスが長く食事に夢中になる大きめのエサなら、うまくいったかもしれない。`
    : 'エサをあげずに近づくと、オスはエサだと思われてしまう。');
}

function actWatch() {
  const m = game.m;
  modal('最後まで見守る', '<p>残りの日々を静かに見守る。寿命が来るまで時間を進める。</p>', [
    { label: '見守る', onClick: () => { game.doy += Math.max(0, ADULT_LIFE[m.sex] - m.adultTurns) * TURN_DAYS; endLife('寿命をまっとうした'); } },
    { label: 'やめておく' },
  ]);
}

/* ---------------- 一生の終わりと次の世代 ---------------- */
function endLife(cause, note) {
  const g = game, m = g.m;
  g.lineage.push({
    line: g.line, gen: g.gen, name: m.name, sex: sexKnown(m) ? sexName(m.sex) : '性別不明',
    stage: STAGES[m.stage].name, from: m.from, born: g.year, year: yearOf(g), end: dateText(g.doy), cause, left: offspringText(m),
    // 家系図に描くための記録。卵鞘のゆくえ (next / winter) は冬と春に書き足す
    color: m.color, mate: mateText(m), eggs: eggCount(g.oothecae), done: false,
  });
  g.m = null;
  save();
  showHUD(false);
  modal('おわかれ', `<p>${esc(m.name)}（${STAGES[m.stage].name}）は、${dateText(g.doy)}に${cause}。</p>${note ? `<p class="sub">${note}</p>` : ''}<p>のこしたもの: ${offspringText(m)}</p>`,
    [{ label: '次へ', onClick: winter }]);
}

function winter() {
  const g = game;
  const fertile = g.oothecae.filter((o) => o.fertile);
  if (!fertile.length) {
    modal('冬', `<p>${g.oothecae.length ? '残った卵鞘は、交尾していないメスが産んだものだけ。この卵鞘から幼虫は生まれない。' : '幼虫が生まれる卵鞘は残らなかった。'}</p><p>春になったら、野外で卵鞘をさがしに行こう。木の枝や、建物の壁についていることが多い。</p>`,
      [{ label: '春になった（野外で卵鞘をさがす）', onClick: () => spring(null) }]);
    return;
  }
  modal('卵鞘の冬越し', `<p>幼虫が生まれる卵鞘が${fertile.length}個ある。春まで、どこに置いておく？</p>`, [
    { label: '🌿 ベランダ（外）に置く', onClick: () => spring(fertile[0]) },
    { label: '🏠 あたたかい部屋に置く', onClick: warmRoom },
  ]);
}

function warmRoom() {
  const g = game, last = g.lineage[g.lineage.length - 1];
  g.oothecae.splice(g.oothecae.findIndex((o) => o.fertile), 1);
  if (last && last.eggs) last.eggs.winter++;
  save();
  modal('真冬', `<p>${WARM_ROOM_TEXT}</p><p class="sub">卵鞘は冬の寒さに当てておくと、春になってから孵化する。</p>`,
    [{ label: '次へ', onClick: winter }]);
}

function spring(ootheca) {
  const g = game, last = g.lineage[g.lineage.length - 1];
  if (last && last.eggs) { if (ootheca) last.eggs.next = 1; last.done = true; }
  if (ootheca) g.gen++;
  else { g.line++; g.gen = 1; }
  g.year = yearOf(g) + (dayOfYear(g.doy) >= START_DOY ? 1 : 0);
  g.doy = START_DOY;
  g.oothecae = [];
  g.cage = newCage();
  hatch(ootheca ? `${ootheca.mother}の卵鞘` : '野外で見つけた卵鞘');
}

function hatch(from) {
  const g = game;
  g.hatchFrom = from;
  save();
  scene = 'case';
  const count = Math.round(rand(HATCH_COUNT[0], HATCH_COUNT[1]));
  const card = modal(`${g.year}年目の${dateText(g.doy).split('月')[0]}月`, `<p>${esc(from)}から、${count}匹の幼虫が生まれた！</p><p class="sub">カマキリは共食いするので、1匹ずつ分けて育てる。育てる1匹を選んで、残りは卵鞘があった場所の近くの木に放そう。生まれたての1齢幼虫は、すぐに茶色っぽい色になる。おなかを背中のほうへ反らせているのが、ハラビロカマキリの幼虫らしい姿。</p><canvas id="larvae" width="640" height="200" style="width:320px;height:100px"></canvas><div class="grid5"></div>`, []);
  const c2 = card.querySelector('#larvae').getContext('2d');
  c2.scale(2, 2);
  c2.fillStyle = '#7a5a3a';
  c2.fillRect(4, 78, 312, 5);
  for (let i = 0; i < 5; i++) {
    Art.mantis(c2, 30 + i * 64, 78, 0.5, { stage: 0, adult: false, sex: 'F', color: 'green', aim: Math.sin(i * 1.7) * 0.5 });
    const b = document.createElement('button');
    b.textContent = `${i + 1}`;
    // 体の色は2齢になるまでわからない。ハラビロカマキリはほとんどが緑色になる
    b.onclick = () => { closeModal(); nameMantis(Math.random() < GREEN_SHARE ? 'green' : 'brown', from); };
    card.querySelector('.grid5').append(b);
  }
}

function nameMantis(color, from) {
  const card = modal('名前をつけよう', `<input type="text" id="nameIn" maxlength="10" value="${esc(pick(NAME_IDEAS))}"><div class="ideas"></div>`,
    [{ label: '決定', cls: 'next', onClick: () => startRaising(card.querySelector('#nameIn').value.trim() || NAME_IDEAS[0], color, from) }]);
  const input = card.querySelector('#nameIn');
  for (const idea of NAME_IDEAS.slice().sort(() => Math.random() - 0.5).slice(0, 5)) {
    const b = document.createElement('button');
    b.textContent = idea;
    b.onclick = () => { input.value = idea; };
    card.querySelector('.ideas').append(b);
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') card.querySelector('.btns button').click(); });
}

function startRaising(name, color, from) {
  const g = game;
  g.m = newMantis(name, color, from);
  g.cage = newCage();
  g.hatchFrom = null;
  g.log = [];
  scene = 'case';
  showHUD(true);
  say(`${name}を育てはじめた。生まれたての1齢幼虫は、体長${STAGES[0].length}mmくらい。`);
  say('小さい幼虫には、小さいエサ（ショウジョウバエやアブラムシ）をあげよう。ケースの温度にも気をつけよう。');
  save();
}

/* ---------------- 狩り ---------------- */
function startHunt(prey) {
  const m = game.m;
  hunt = {
    prey, ratio: prey.size / bodyLength(m), phase: 'stalk', x: 0, y: 0, tx: 0, ty: 0, wait: 0.8, hop: null,
    misses: 0, strikeT: 0, checked: false, eatT: 0, eatDur: 1.6, flee: 0, facing: -1, aim: 0, flash: '', flashT: 0,
    mateReady: canMateFemale(m), matedNow: false,
  };
  if (hunt.mateReady) hunt.eatDur = 3.5;
  scene = 'hunt';
  hunt.lay = huntLayout();
  hunt.x = W - 30 - hunt.lay.preyLen;
  hunt.y = lerp(hunt.lay.top, hunt.lay.floor, 0.6);
  newTarget();
  showHUD(false);
  $('hunt').classList.remove('hidden');
  $('mateNow').classList.add('hidden');
  $('strikeBtn').classList.remove('hidden');
  $('huntQuit').classList.remove('hidden');
  renderHuntInfo();
}

function huntLayout() {
  const m = game.m;
  const top = $('huntInfo').getBoundingClientRect().bottom + 16 || 110;
  const floor = H - 100;
  const s = Math.min(W * 0.55 / 100, (floor - top) * 0.75 / 80);
  const ax = 16 + 56 * s; // オスのはねの先 (体長 100 のうち 50) まで画面に入れる
  const head = { x: ax + Art.HEAD.x * s, y: floor + Art.HEAD.y * s };
  return { top, floor, s, ax, head, reach: Art.REACH * s * (1 - 0.15 * m.injury), preyLen: Math.max(5, hunt.ratio * 100 * s) };
}

function inZone(x, y) {
  const L = hunt.lay, dx = x - L.head.x, dy = y - L.head.y, a = Math.atan2(dy, dx);
  return Math.hypot(dx, dy) <= L.reach + L.preyLen * 0.3 && a > -1.1 && a < 1.2;
}

function newTarget() {
  const h = hunt, L = h.lay;
  if (Math.random() < 0.45) {
    const a = rand(-0.9, 1.0), r = rand(0.3, 0.85) * L.reach;
    h.tx = L.head.x + Math.cos(a) * r;
    h.ty = L.head.y + Math.sin(a) * r;
  } else {
    for (let i = 0; i < 12; i++) {
      h.tx = rand(L.head.x - L.reach * 0.2, W - 24);
      h.ty = rand(L.top + 10, L.floor - 6);
      if (!inZone(h.tx, h.ty)) break;
    }
  }
  h.ty = clamp(h.ty, L.top + 10, L.floor - 4);
}

function fleeTarget() {
  const h = hunt, L = h.lay;
  h.tx = rand(Math.min(W - 40, Math.max(L.head.x + L.reach * 1.4, W * 0.6)), W - 20);
  h.ty = rand(L.top + 10, Math.max(L.top + 20, L.head.y));
  h.wait = 0;
  if (h.prey.move === 'hop') h.hop = { x0: h.x, y0: h.y, t: 0 };
}

// 動き方ごとの速さ (カマのとどく距離の何倍/秒) と、まっすぐ飛ばないゆらぎ
const MOVE = { crawl: { v: 0.5, jit: 0 }, fly: { v: 2.2, jit: 0.15 }, flutter: { v: 1.1, jit: 0.35 } };

function movePrey(dt) {
  const h = hunt, L = h.lay, mv = h.prey.move;
  const fast = h.flee > 0 ? 1.8 : 1;
  if (h.wait > 0) {
    h.wait -= dt * fast;
    if (h.wait <= 0) {
      newTarget();
      if (mv === 'hop') h.hop = { x0: h.x, y0: h.y, t: 0 };
    }
    return;
  }
  if (mv === 'hop') {
    if (!h.hop) h.hop = { x0: h.x, y0: h.y, t: 0 };
    h.hop.t += dt / 0.35 * fast;
    const k = Math.min(1, h.hop.t);
    h.facing = h.tx < h.hop.x0 ? -1 : 1;
    h.x = lerp(h.hop.x0, h.tx, k);
    h.y = lerp(h.hop.y0, h.ty, k) - Math.sin(k * Math.PI) * L.reach * 0.35;
    if (k >= 1) { h.hop = null; h.wait = rand(0.7, 1.8); }
    return;
  }
  const spec = MOVE[mv] || MOVE.crawl;
  const v = spec.v * L.reach * fast;
  const dx = h.tx - h.x, dy = h.ty - h.y, d = Math.hypot(dx, dy);
  if (d < v * dt) {
    h.x = h.tx; h.y = h.ty;
    h.wait = mv === 'crawl' ? rand(0.4, 1.4) : rand(0.3, 1.2);
  } else {
    const jit = v * spec.jit;
    h.x += (dx / d * v + Math.sin(T * 23) * jit) * dt;
    h.y += (dy / d * v + Math.cos(T * 17) * jit) * dt;
    h.facing = dx < 0 ? -1 : 1;
  }
  h.x = clamp(h.x, 8, W - 8);
  h.y = clamp(h.y, L.top, L.floor - 2);
}

function strike() {
  if (scene !== 'hunt' || !hunt || hunt.phase !== 'stalk') return;
  hunt.phase = 'strike';
  hunt.strikeT = 0;
  hunt.checked = false;
}

function flash(text) { hunt.flash = text; hunt.flashT = 1.2; }

function resolveStrike() {
  const h = hunt, m = game.m;
  if (!inZone(h.x, h.y)) {
    h.misses++;
    flash('すかっ！');
  } else if (h.ratio > HUGE_RATIO || (h.ratio > BIG_RATIO && Math.random() < 0.5)) {
    // 大きすぎるエサは暴れて、カマキリがけがをする
    m.health = clamp(m.health - 12);
    h.misses++;
    flash('大きすぎて押さえきれない！');
  } else {
    h.phase = 'eat';
    h.eatT = 0;
    flash('パクッ！');
    if (h.mateReady) $('mateNow').classList.remove('hidden');
    $('strikeBtn').classList.add('hidden');
    $('huntQuit').classList.add('hidden');
    renderHuntInfo();
    return;
  }
  h.flee = 1.5;
  fleeTarget();
  renderHuntInfo();
  if (h.misses >= 3) preyLeft(`${h.prey.name}はケースのすみに逃げてしまった。`);
}

function updateHunt(dt) {
  const h = hunt, L = h.lay;
  const want = Math.max(-0.8, Math.min(0.8, Math.atan2(h.y - L.head.y, h.x - L.head.x)));
  h.aim += (want - h.aim) * Math.min(1, dt * 6);
  if (h.flee > 0) h.flee -= dt;
  if (h.flashT > 0) h.flashT -= dt;
  if (h.phase === 'stalk') movePrey(dt);
  else if (h.phase === 'strike') {
    h.strikeT += dt;
    if (!h.checked && h.strikeT >= 0.09) { h.checked = true; resolveStrike(); }
    if (hunt && h.phase === 'strike' && h.strikeT >= 0.3) h.phase = 'stalk';
  } else if (h.phase === 'eat') {
    h.eatT += dt;
    if (h.eatT >= h.eatDur) finishMeal();
  }
}

function endHuntView() {
  scene = 'case';
  hunt = null;
  $('hunt').classList.add('hidden');
  showHUD(true);
}

// エサの虫を食べずに終わった。虫はケースに残る
function preyLeft(text) {
  const prey = hunt.prey, m = game.m;
  game.cage.leftover.push(prey.id);
  endHuntView();
  say(text);
  if (m.health <= 0) return endLife('大きすぎるエサと格闘して弱り、死んでしまった');
  save();
}

function finishMeal() {
  const m = game.m, h = hunt;
  const nut = Math.round(clamp(h.ratio / IDEAL_RATIO * MEAL_FULL, 4, 55));
  m.hunger = clamp(m.hunger + nut);
  if (!isAdult(m)) m.growth += nut / MEAL_FULL;
  game.cage.clean = clamp(game.cage.clean - 4);
  // 水辺の虫は、ハリガネムシの子どもを体に持っていることがある。食べてもすぐには何も起きない
  if (h.prey.worm && !m.worm && !m.wormOut && Math.random() < h.prey.worm) m.worm = 1;
  const note = h.ratio < SMALL_RATIO ? '小さすぎて、少ししかおなかがふくれない。' : h.ratio > BIG_RATIO ? '大きなエサを、なんとか食べきった！' : 'ちょうどいい大きさだった。';
  endHuntView();
  say(`${m.name}は${h.prey.name}を食べた。${note}`);
  if (m.health <= 0) return endLife('大きすぎるエサと格闘して弱り、死んでしまった');
  if (h.matedNow) return mateFemale(true);
  save();
  modal('パクッ！', `<p>${esc(m.name)}は${h.prey.name}を食べた（おなか +${nut}）。</p><p class="sub">${note}</p>`,
    [{ label: 'もう1匹あげる', onClick: actFeed }, { label: 'もどる' }]);
}

function renderHuntInfo() {
  const h = hunt, m = game.m, left = 3 - h.misses;
  if (h.phase === 'eat') {
    $('huntInfo').innerHTML = `<div class="big">パクッ！</div>${h.mateReady && !h.matedNow ? 'メスが食べている今なら、オスを入れても安全！' : 'むしゃむしゃ食べている…'}`;
    return;
  }
  $('huntInfo').innerHTML = `<b>${h.prey.name}</b>（${h.prey.size}mm）をねらえ！<br><small>カマキリは約${bodyLength(m)}mm・チャンス ${'●'.repeat(left)}${'○'.repeat(3 - left)}</small><br>黄色い範囲にエサが入ったら「カマ！」`;
}

/* ---------------- 観察 ---------------- */
function actLook() {
  const m = game.m, c = game.cage, tips = [], t = nowTemp();
  if (m.state === 'premolt') tips.push('エサを食べずに、上のほうでじっとぶら下がっている。脱皮が近いサイン。ケースを乾かさないようにして、エサの虫は取り出しておこう。');
  if (m.state === 'postmolt') tips.push('脱皮したばかりで、体がまだやわらかい。かたまるまではエサを食べない。');
  tips.push(`ケースの中は約${t}℃（${tempWord(t)}）。${t >= TEMP_HOT ? '暑すぎて弱ってしまう。すずしい場所へ動かそう。' : t < TEMP_EAT_MIN ? '寒くてエサを食べない。あたたかい場所へ動かそう。' : t < TEMP_GOOD[0] ? '寒いと、育つのがおそくなる。' : ''}`);
  if (c.leftover.length) tips.push(`ケースにエサの虫が${c.leftover.length}匹残っている。`);
  if (c.moist < MOIST_MOLT_MIN) tips.push('ケースが乾いている。脱皮の前は特に気をつけよう。');
  if (c.moist >= MOIST_MOLD) tips.push('ジメジメしすぎている。カビが生えやすい。');
  if (m.hunger < 30) tips.push('おなかがすいているようだ。');
  if (!isAdult(m) && m.state === 'normal') {
    const st = STAGES[m.stage];
    if (m.growth >= st.need && m.dev >= st.dev) tips.push('よく食べて、体も育った。そろそろ脱皮しそうだ。');
    else if (m.growth >= st.need) tips.push('エサは十分に食べている。脱皮できるまで体が育つには、もう少し日数がかかる。あたたかいほど早い。');
  }
  if (m.worm >= WORM_SIGN) tips.push('よく食べるのに、なんだか元気がない。おなかが妙にふくらんでいる…');
  if (m.wormOut) tips.push('ハリガネムシに寄生されていた。体が弱っていて、卵は育たない。');
  if (m.injury) tips.push('脱皮の失敗であしが曲がっていて、カマのとどく範囲がせまい。次の脱皮がうまくいけば、少しよくなる。');
  if (!sexKnown(m)) tips.push(m.stage >= SEX_VISIBLE_STAGE ? 'おなかの節が数えられる大きさになった。' : '性別は、5齢くらいになるとおなかの節の数でわかる。');
  if (isAdult(m) && m.sex === 'F') tips.push(m.mated ? `交尾ずみ。よく食べさせると卵鞘を産む（いままでに${m.laid}個）。${m.laid >= LAY_FADE - 2 ? 'たくさん産んだので、だんだん産まなくなってきた。' : ''}` : m.adultTurns >= MATE_READY.F ? 'オスを迎えられる。' : `成虫になって${MATE_READY.F * TURN_DAYS}日ほどたつと、オスを迎えられる。`);
  if (isAdult(m) && m.sex === 'M') tips.push(m.mated ? '交尾ずみ。' : m.adultTurns >= MATE_READY.M ? 'お見合いに行ける。' : 'もう少ししたら、お見合いに行ける。');
  const btns = [];
  if (!sexKnown(m) && m.stage >= SEX_VISIBLE_STAGE) btns.push({ label: 'おなかの節を数える', cls: 'pink', onClick: sexQuiz });
  btns.push({ label: 'タイトルにもどる', onClick: titleScreen }, { label: 'とじる' });
  const card = modal(`${esc(m.name)}のようす`, `<p>${STAGES[m.stage].name}・体長 約${bodyLength(m)}mm・${m.stage === 0 ? 'うすい茶色' : m.color === 'green' ? '緑色' : '茶色'}・${sexLabel(m)}</p>${tips.map((s) => `<p class="sub">${s}</p>`).join('')}<h3>家系図</h3><div class="tree"><canvas></canvas></div>`, btns);
  drawFamilyTree(card.querySelector('.tree canvas'));
}

function sexQuiz() {
  const m = game.m;
  const answer = (sex) => {
    if (sex !== m.sex) return modal('もう一度', '<p>もう一度、節を数えてみよう。</p>', [{ label: 'もう一度見る', onClick: sexQuiz }, { label: 'とじる' }]);
    m.sexKnown = true;
    save();
    renderHUD();
    modal('正解！', `<p>${esc(m.name)}は${sexName(m.sex)}だ。</p>`);
  };
  const card = modal('おなかの節を数える', '<p>おなかを腹側から見た。頭の側から節（ふし）を数えよう。いちばん下のとがった部分は数えない。</p><canvas id="bellyCv" width="300" height="380" style="width:150px;height:190px"></canvas><p class="sub">オスは8節、メスは6節。</p>',
    [{ label: '♂ オス', onClick: () => answer('M') }, { label: '♀ メス', onClick: () => answer('F') }, { label: 'あとで' }]);
  const c2 = card.querySelector('#bellyCv').getContext('2d');
  c2.scale(2, 2);
  Art.belly(c2, 75, 88, 1.45, m.sex, m.color);
}

function showLineage(back) {
  const card = modal('家系図', '<div class="tree"><canvas></canvas></div>', [{ label: 'とじる', onClick: back }]);
  drawFamilyTree(card.querySelector('.tree canvas'));
}

/* ---------------- 家系図 ---------------- */
// 系統ごとに、野外で見つけた卵鞘を根にして「親 → 卵鞘 → 子」と下へのばす。
// 次の世代につながった卵鞘は左の幹に置き、ほかの卵鞘は右へ枝分かれさせる。
const EGG_LABEL = { winter: ['真冬に', '孵化した'], spring: ['春に', '孵化した'], wait: ['春を', '待っている'], dud: ['幼虫は', '生まれない'] };
const SEX_CODE = { メス: 'F', オス: 'M' };

function mateText(m) {
  if (!m.mated) return null;
  return m.sex === 'F' ? '迎えたオス' : 'お見合い相手のメス';
}
function eggCount(list) {
  const fertile = list.filter((o) => o.fertile).length;
  return { fertile, dud: list.length - fertile, winter: 0, next: 0 };
}

// いま育てている1匹も、家系図のいちばん下に足す
function treeNodes() {
  const g = game, nodes = g.lineage.map((e) => ({ ...e, now: false }));
  if (g.m) {
    const m = g.m;
    nodes.push({ line: g.line, gen: g.gen, name: m.name, sex: sexKnown(m) ? sexName(m.sex) : '性別？', sexCode: m.sex, stage: STAGES[m.stage].name,
      born: g.year, year: yearOf(g), color: m.color, mate: mateText(m), eggs: eggCount(g.oothecae), done: false, now: true });
  }
  return nodes;
}

// 卵鞘をゆくえごとにまとめる
function eggGroups(n, hasChild) {
  if (!n.eggs) return hasChild ? [{ kind: 'next', n: 1 }] : [];
  const e = n.eggs, out = [], next = hasChild || e.next ? 1 : 0;
  if (next) out.push({ kind: 'next', n: 1 });
  if (e.winter) out.push({ kind: 'winter', n: e.winter });
  const rest = e.fertile - next - e.winter;
  if (rest > 0) out.push({ kind: n.done ? 'spring' : 'wait', n: rest });
  if (e.dud) out.push({ kind: 'dud', n: e.dud });
  return out;
}

function wrapText(c2, s, maxW) {
  const out = [];
  let cur = '';
  for (const ch of s) {
    if (cur && c2.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function nodeLines(c2, n, maxW) {
  const out = [{ s: `${n.sex}・${n.stage}`, c: '#45573f' }];
  const life = n.now ? 'いま育てている' : `${n.year}年目の${n.end}に${n.cause}`;
  for (const s of wrapText(c2, life, maxW)) out.push({ s, c: n.now ? '#b5476a' : '#5d6b57' });
  if (n.mate) out.push({ s: `交尾の相手: ${n.mate}`, c: '#b5476a' });
  return out;
}

function drawFamilyTree(cv) {
  const nodes = treeNodes();
  const font = getComputedStyle(document.body).fontFamily;
  const cw = Math.max(260, Math.floor(cv.parentElement.clientWidth));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const c2 = cv.getContext('2d');
  const SPINE = 34, BX = 4, BW = cw - 8, TX = BX + 64, GAP = Math.min(76, (cw - SPINE - 40) / 3);
  const lineIds = [...new Set(nodes.map((n) => n.line))];

  // 1. 並べる場所を決める
  c2.font = `12px ${font}`;
  const items = [];
  let y = 4;
  lineIds.forEach((ln, li) => {
    const row = nodes.filter((n) => n.line === ln).sort((a, b) => a.gen - b.gen);
    if (li) y += 18;
    items.push({ t: 'root', y, ln, year: row[0].born || row[0].year }); // 系統が始まった年 (最初の1匹が生まれた年)
    y += 44;
    row.forEach((n, i) => {
      const child = row[i + 1] && row[i + 1].gen === n.gen + 1;
      const text = nodeLines(c2, n, BW - (TX - BX) - 8);
      const h = Math.max(60, 30 + text.length * 16);
      items.push({ t: 'box', y, h, n, text });
      y += h;
      const groups = eggGroups(n, child);
      if (!groups.length) return;
      const sides = groups.length > 1 || groups[0].kind !== 'next';
      const h2 = sides ? 66 : 36;
      items.push({ t: 'eggs', y, h: h2, groups, cont: child, sides });
      y += h2;
    });
  });
  if (!nodes.length) y = 40;

  // 2. 描く
  cv.width = Math.round(cw * dpr);
  cv.height = Math.round(y * dpr);
  cv.style.width = `${cw}px`;
  cv.style.height = `${y}px`;
  c2.setTransform(dpr, 0, 0, dpr, 0, 0);
  c2.textBaseline = 'middle';
  const LINE = '#8fa384';
  const vline = (x, y0, y1) => { c2.strokeStyle = LINE; c2.lineWidth = 2; c2.beginPath(); c2.moveTo(x, y0); c2.lineTo(x, y1); c2.stroke(); };
  if (!nodes.length) {
    c2.fillStyle = '#5d6b57';
    c2.font = `14px ${font}`;
    c2.fillText('まだ記録はない。', 4, 20);
    return;
  }
  for (const it of items) {
    if (it.t === 'root') {
      vline(SPINE, it.y + 20, it.y + 44);
      Art.ootheca(c2, SPINE, it.y + 14, 26);
      c2.textAlign = 'left';
      c2.fillStyle = '#1f2a1c';
      c2.font = `bold 13px ${font}`;
      c2.fillText('野外で見つけた卵鞘', SPINE + 22, it.y + 9);
      c2.fillStyle = '#5d6b57';
      c2.font = `11px ${font}`;
      c2.fillText(`${lineIds.length > 1 ? `${it.ln}系統め・` : ''}${it.year}年目の春`, SPINE + 22, it.y + 25);
    } else if (it.t === 'box') {
      const n = it.n;
      Art.roundRect(c2, BX, it.y, BW, it.h, 12);
      c2.fillStyle = n.now ? '#fff1f5' : '#fffdf4';
      c2.fill();
      c2.strokeStyle = n.now ? '#b5476a' : '#2f5d34';
      c2.lineWidth = 2;
      c2.stroke();
      // 一生を終えたときのすがた
      let idx = STAGES.findIndex((s) => s.name === n.stage);
      if (idx < 0) idx = 0;
      const adult = !!STAGES[idx].adult, sex = n.sexCode || SEX_CODE[n.sex] || 'F';
      const len = adult ? ADULT_LENGTH[sex] : STAGES[idx].length;
      const px = BX + 32, py = it.y + it.h / 2 + 14;
      c2.fillStyle = '#7a5a3a';
      c2.fillRect(px - 24, py, 48, 2.5);
      Art.mantis(c2, px, py, 0.44 * (0.45 + 0.55 * len / ADULT_LENGTH.F), { stage: idx, adult, sex, color: n.color || 'green', aim: 0, t: 0 });
      // 名前と世代
      c2.textAlign = 'left';
      c2.font = `bold 11px ${font}`;
      const badge = `${n.line > 1 ? `${n.line}系統 ` : ''}第${n.gen}世代`, bw = c2.measureText(badge).width + 12;
      Art.roundRect(c2, TX, it.y + 8, bw, 18, 9);
      c2.fillStyle = '#2f5d34';
      c2.fill();
      c2.fillStyle = '#fff';
      c2.fillText(badge, TX + 6, it.y + 17.5);
      c2.fillStyle = '#1f2a1c';
      c2.font = `bold 15px ${font}`;
      c2.fillText(n.name, TX + bw + 6, it.y + 17.5);
      c2.font = `12px ${font}`;
      it.text.forEach((l, i) => { c2.fillStyle = l.c; c2.fillText(l.s, TX, it.y + 36 + i * 16); });
    } else {
      const busY = it.y + 12, iconY = it.sides ? it.y + 26 : it.y + 18;
      const xs = it.groups.map((_, i) => SPINE + i * GAP);
      vline(SPINE, it.y, it.cont ? it.y + it.h : busY);
      if (it.groups.length > 1) {
        c2.beginPath();
        c2.moveTo(SPINE, busY);
        c2.lineTo(xs[xs.length - 1], busY);
        c2.stroke();
      }
      it.groups.forEach((gr, i) => {
        vline(xs[i], busY, iconY);
        Art.ootheca(c2, xs[i], iconY, 24);
        c2.textAlign = 'left';
        if (gr.n > 1) {
          c2.fillStyle = '#1f2a1c';
          c2.font = `bold 11px ${font}`;
          c2.fillText(`×${gr.n}`, xs[i] + 18, iconY + 1);
        }
        if (gr.kind === 'next') return;
        c2.textAlign = 'center';
        c2.fillStyle = gr.kind === 'dud' ? '#8a8a80' : '#45573f';
        c2.font = `11px ${font}`;
        EGG_LABEL[gr.kind].forEach((s, k) => c2.fillText(s, xs[i], iconY + 17 + k * 13));
      });
    }
  }
}

/* ---------------- タイトル ---------------- */
function titleScreen() {
  scene = 'title';
  showHUD(false);
  const saved = load();
  const btns = [];
  if (saved) btns.push({ label: 'つづきから', cls: 'next', onClick: () => resume(saved) });
  btns.push({ label: 'はじめから', onClick: saved ? confirmNew : startNew });
  if (saved && saved.lineage.length) btns.push({ label: '家系図', onClick: () => { game = saved; showLineage(titleScreen); } });
  modal('ハラビロカマキリ飼育日記<small>HARABIRO KEEPER</small>', '<p>木の上でくらすハラビロカマキリを、1齢の幼虫から育てよう。エサの大きさと季節、ケースの温度としめり気、脱皮のタイミングに気をつけて成虫まで育てたら、卵鞘を産ませて次の世代へつなごう。</p>', btns);
  $('modal').classList.add('low'); // ケースの中のカマキリが見えるように、下に寄せる
}

function confirmNew() {
  modal('はじめから', '<p>いまの記録（家系図も）は消える。いい？</p>', [{ label: 'はじめから遊ぶ', onClick: startNew }, { label: 'やめる', onClick: titleScreen }]);
}

function startNew() {
  game = newGame();
  hatch('野外で見つけた卵鞘');
}

function resume(saved) {
  game = saved;
  scene = 'case';
  if (game.m) { showHUD(true); renderHUD(); }
  else if (game.hatchFrom) hatch(game.hatchFrom);
  else winter();
}

/* ---------------- 画面の部品 ---------------- */
function openModal() {
  $('modal').classList.remove('hidden', 'low');
  const card = $('modalCard');
  card.innerHTML = '';
  card.scrollTop = 0;
  return card;
}
function closeModal() { $('modal').classList.add('hidden'); }

// buttons: [{ label, cls, onClick }]。押すとダイアログを閉じてから onClick を呼ぶ
function addButtons(box, buttons) {
  for (const bt of buttons) {
    const b = document.createElement('button');
    b.textContent = bt.label;
    if (bt.cls) b.className = bt.cls;
    b.onclick = () => { closeModal(); if (bt.onClick) bt.onClick(); };
    box.append(b);
  }
}

function modal(title, html, buttons) {
  const card = openModal();
  card.innerHTML = `<h2>${title}</h2>${html}<div class="btns"></div>`;
  addButtons(card.querySelector('.btns'), buttons || [{ label: 'とじる' }]);
  return card;
}

function choosePrey(title, tip, cb, extra) {
  const card = openModal();
  card.innerHTML = `<h2>${title}</h2><p class="sub">${tip}</p><div class="preyList"></div><div class="btns"></div>`;
  for (const p of PREY) {
    const b = document.createElement('button');
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 64;
    cv.style.width = '48px'; cv.style.height = '32px';
    const c2 = cv.getContext('2d');
    c2.scale(2, 2);
    Art.prey(c2, p.id, p.id === 'mayfly' ? 20 : 17, 17, 22, 0, 1);
    const txt = document.createElement('div');
    const ok = preyInSeason(p, game.doy);
    txt.innerHTML = `<b>${p.name} <small>${p.size}mm・${p.season ? '野外' : 'お店'}</small></b><small>${ok ? p.note : `この季節にはいない（${p.when}）`}</small>`;
    b.append(cv, txt);
    b.disabled = !ok;
    b.onclick = () => { closeModal(); cb(p); };
    card.querySelector('.preyList').append(b);
  }
  addButtons(card.querySelector('.btns'), [...(extra || []), { label: 'やめる' }]);
}

function showHUD(on) { $('hud').classList.toggle('hidden', !on); }

function setGauge(id, v, low) {
  const el = $(id);
  el.querySelector('b').style.width = `${v}%`;
  el.classList.toggle('low', low);
}

function renderHUD() {
  if (!game || !game.m) return;
  const g = game, m = g.m, c = g.cage, t = nowTemp();
  $('mName').textContent = m.name;
  $('mStage').textContent = `${STAGES[m.stage].name}・${bodyLength(m)}mm`;
  $('mSex').textContent = sexLabel(m);
  $('mDate').textContent = `${g.line > 1 ? `${g.line}系統 ` : ''}第${g.gen}世代・${yearOf(g)}年目 ${dateText(g.doy)}`;
  setGauge('gHunger', m.hunger, m.hunger < 25);
  setGauge('gMoist', c.moist, c.moist < MOIST_MOLT_MIN || c.moist >= MOIST_MOLD);
  setGauge('gClean', c.clean, c.clean < 30);
  setGauge('gHealth', m.health, m.health < 30);
  // 温度は 0〜40℃ の目盛り。ちょうどいい範囲に色の帯を敷く
  setGauge('gTemp', clamp(t / 40 * 100), t >= TEMP_HOT || t < TEMP_EAT_MIN);
  $('gTemp').querySelector('b').style.background = t >= TEMP_HOT ? '' : t > TEMP_GOOD[1] ? '#f08a30' : t >= TEMP_GOOD[0] ? '#5cb85c' : '#5a9bd5';
  $('tempText').textContent = `${t}℃・${placeOf(c).name}`;
  $('log').innerHTML = g.log.slice(-3).map((s) => `<p>${esc(s)}</p>`).join('');
  document.querySelector('#actions [data-act="mate"]').classList.toggle('hidden', !(canMateFemale(m) || canMateMale(m)));
  $('mateLabel').textContent = m.sex === 'F' ? 'お迎え' : 'お見合い';
  document.querySelector('#actions [data-act="watch"]').classList.toggle('hidden', !canWatch(m));
}

/* ---------------- 描画 ---------------- */
const DEMO_CAGE = { moist: 55, clean: 100, leftover: [], moldy: false };
const OOTHECA_SPOTS = [[0.78, 0.47], [0.2, 0.28], [0.4, 0.2], [0.66, 0.24], [0.88, 0.34], [0.3, 0.42]];
const DEMO_MANTIS = { stage: STAGES.length - 1, sex: 'F', color: 'green', state: 'normal', injury: 0, crumpled: false, shed: false };

function caseRect() {
  let top = 24, bottom = 24;
  if (!$('hud').classList.contains('hidden')) {
    top = $('top').getBoundingClientRect().bottom + 10;
    bottom = H - $('log').getBoundingClientRect().top + 10;
  } else if ($('modal').classList.contains('low')) {
    bottom = H - $('modalCard').getBoundingClientRect().top + 10;
  }
  const availW = W - 24, availH = Math.max(120, H - top - bottom);
  // 木の上でくらすので、背の高いケースにする
  const w = Math.min(availW, availH * 1.1, 760), h = Math.min(availH, w * 1.2);
  return { x: (W - w) / 2, y: top + (availH - h) / 2, w, h };
}

function drawRoom(r) {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#eef3e6');
  grd.addColorStop(1, '#d8e3cc');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#cdb58c';
  ctx.fillRect(0, r.y + r.h - 4, W, H);
  ctx.fillStyle = '#b89c6e';
  ctx.fillRect(0, r.y + r.h - 4, W, 4);
}

function drawCase() {
  const r = caseRect();
  drawRoom(r);
  const demo = scene === 'title' || !game;
  const c = demo ? DEMO_CAGE : game.cage;
  const geo = Art.cage(ctx, r, c, T);
  const m = demo ? DEMO_MANTIS : game.m;
  // 残ったエサの虫は床をうろうろする
  c.leftover.forEach((id, i) => {
    const p = PREY.find((q) => q.id === id), ph = T * 0.35 + i * 1.7;
    const L = Math.max(5, p.size / ADULT_LENGTH.F * r.w * 0.4);
    Art.prey(ctx, id, r.x + r.w * (0.15 + 0.7 * (Math.sin(ph) + 1) / 2), geo.floor + 6 + (i % 3) * 4, L, T, Math.cos(ph) > 0 ? 1 : -1);
  });
  // この季節に産んだ卵鞘は、ネットや壁にくっついている
  if (!demo) {
    game.oothecae.forEach((o, i) => {
      const spot = OOTHECA_SPOTS[i % OOTHECA_SPOTS.length];
      Art.ootheca(ctx, r.x + r.w * spot[0], r.y + r.h * spot[1], r.w * 0.06);
    });
  }
  if (!m) return;
  const len = m === DEMO_MANTIS ? ADULT_LENGTH.F : bodyLength(m);
  const s = r.w * (0.14 + 0.3 * len / ADULT_LENGTH.F) / 100;
  const lk = m === DEMO_MANTIS ? { stage: m.stage, adult: true, sex: 'F', color: 'green' } : look(m);
  if (m.shed) {
    // ふたにぶら下がった、ぬけがら
    ctx.save();
    ctx.translate(r.x + r.w * 0.8, geo.lid);
    ctx.scale(1, -1);
    Art.mantis(ctx, 0, 0, r.w * (0.14 + 0.3 * STAGES[m.stage - 1].length / ADULT_LENGTH.F) / 100, { stage: m.stage - 1, adult: false, sex: m.sex, ghost: true });
    ctx.restore();
  }
  if (m.state === 'premolt') {
    ctx.save();
    ctx.translate(r.x + r.w * 0.45, geo.lid + 2);
    ctx.scale(1, -1);
    ctx.rotate(Math.sin(T * 0.8) * 0.02);
    Art.mantis(ctx, 0, 0, s, { ...lk, t: T });
    ctx.restore();
    return;
  }
  const k = 0.42;
  const px = lerp(geo.b0.x, geo.b1.x, k), py = lerp(geo.b0.y, geo.b1.y, k);
  ctx.save();
  ctx.translate(px, py - Math.max(2, r.w * 0.006));
  // カマキリは木の葉のように体を左右にゆらす
  ctx.rotate(Math.atan2(geo.b1.y - geo.b0.y, geo.b1.x - geo.b0.x) + Math.sin(T * 1.4) * 0.035);
  Art.mantis(ctx, 0, 0, s, { ...lk, aim: Math.sin(T * 0.5) * 0.4, t: T });
  ctx.restore();
}

// 狩りの背景。木の葉のしげみ
const HUNT_LEAVES = [[0.62, 0.12, 0.5], [0.9, 0.3, 2.6], [0.75, 0.55, -0.4], [0.45, 0.35, 2.2], [0.95, 0.75, 3.4], [0.55, 0.8, 0.9], [0.3, 0.1, 1.4]];

function drawHunt() {
  const h = hunt, L = h.lay, m = game.m;
  ctx.fillStyle = '#e4efdc';
  ctx.fillRect(0, 0, W, H);
  const big = Math.max(70, Math.min(W, L.floor) * 0.32);
  HUNT_LEAVES.forEach(([fx, fy, a], i) => Art.leaf(ctx, W * fx, L.top + (L.floor - L.top) * fy, big * (0.8 + (i % 3) * 0.2), a, i % 2 ? 'rgba(120,170,90,0.35)' : 'rgba(100,150,80,0.28)'));
  ctx.fillStyle = '#fbfaf5';
  ctx.fillRect(0, L.floor + L.s * 6, W, H);
  // 止まっている枝と、そこから出た葉
  Art.leaf(ctx, L.ax + 20 * L.s, L.floor + L.s * 2, L.s * 34, 0.35, '#6f9f45');
  ctx.fillStyle = '#7a5a3a';
  Art.roundRect(ctx, -10, L.floor, L.ax + 40 * L.s, L.s * 5, L.s * 2.5);
  ctx.fill();
  // カマがとどく範囲
  ctx.beginPath();
  ctx.moveTo(L.head.x, L.head.y);
  ctx.arc(L.head.x, L.head.y, L.reach, -1.1, 1.2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 214, 70, 0.22)';
  ctx.fill();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(200, 150, 20, 0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  let strikeK = 0;
  if (h.phase === 'strike') strikeK = h.strikeT < 0.09 ? h.strikeT / 0.09 : Math.max(0, 1 - (h.strikeT - 0.09) / 0.21);
  const claw = Art.mantis(ctx, L.ax, L.floor, L.s, { ...look(m), aim: h.aim, strike: strikeK, eat: h.phase === 'eat', t: T });
  if (h.phase === 'eat') {
    const k = 1 - 0.6 * Math.min(1, h.eatT / h.eatDur);
    Art.prey(ctx, h.prey.id, claw.x, claw.y + Math.sin(T * 20) * 1.5, L.preyLen * k, T, -1);
  } else {
    Art.prey(ctx, h.prey.id, h.x, h.y, L.preyLen, T, h.facing);
  }
  if (h.flashT > 0) {
    ctx.globalAlpha = Math.min(1, h.flashT * 2);
    ctx.font = `bold ${Math.max(20, L.s * 9)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#fff';
    const ty = L.head.y - L.reach - 10 - (1.2 - h.flashT) * 20;
    ctx.strokeText(h.flash, L.head.x + L.reach * 0.5, ty);
    ctx.fillStyle = '#b5476a';
    ctx.fillText(h.flash, L.head.x + L.reach * 0.5, ty);
    ctx.globalAlpha = 1;
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (hunt) hunt.lay = huntLayout();
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame); // 描画中にエラーが出ても、次のフレームは止めない
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  T += dt;
  if (scene === 'hunt' && hunt) updateHunt(dt);
  ctx.clearRect(0, 0, W, H);
  if (scene === 'hunt' && hunt) drawHunt();
  else drawCase();
}

/* ---------------- 入力 ---------------- */
const ACTIONS = { feed: actFeed, mist: actMist, clean: actClean, place: actPlace, look: actLook, mate: actMate, watch: actWatch, next: actNext };
document.querySelectorAll('#actions button').forEach((b) => b.addEventListener('click', () => {
  if (game && game.m) ACTIONS[b.dataset.act]();
}));
$('strikeBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); strike(); });
canvas.addEventListener('pointerdown', () => strike());
document.addEventListener('keydown', (e) => {
  if (scene === 'hunt' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); strike(); }
});
$('huntQuit').addEventListener('click', () => { if (hunt && hunt.phase !== 'eat') preyLeft(`${hunt.prey.name}がケースに残った。残ったエサの虫は、脱皮のじゃまになることがある。`); });
$('mateNow').addEventListener('click', () => {
  if (!hunt || hunt.phase !== 'eat') return;
  hunt.matedNow = true;
  $('mateNow').classList.add('hidden');
  flash('オスを入れた！');
  renderHuntInfo();
});
window.addEventListener('resize', resize);
$('gTemp').style.setProperty('--good-lo', `${TEMP_GOOD[0] / 40 * 100}%`);
$('gTemp').style.setProperty('--good-hi', `${(40 - TEMP_GOOD[1]) / 40 * 100}%`);

resize();
titleScreen();
requestAnimationFrame(frame);
