'use strict';
/* カマキリ飼育日記 — 本体。セーブ、1ターン (3日) の進み方、狩りのミニゲーム、画面の切り替え。 */

const SAVE_KEY = 'mantis-keeper.save';
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

function dateText(doy) {
  let d = ((doy % 365) + 365) % 365, m = 0;
  while (d >= MONTH_DAYS[m]) { d -= MONTH_DAYS[m]; m++; }
  return `${m + 1}月${d + 1}日`;
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
const canMateFemale = (m) => isAdult(m) && m.sex === 'F' && !m.mated && m.adultTurns >= 3 && m.malesLeft > 0;
const canMateMale = (m) => isAdult(m) && m.sex === 'M' && !m.mated && m.adultTurns >= 2;
const canWatch = (m) => isAdult(m) && (m.laid > 0 || m.fertileLaid > 0);
const look = (m) => ({ stage: m.stage, adult: isAdult(m), sex: m.sex, color: m.color, crumpled: m.crumpled, injury: m.injury });

function newGame() {
  return { year: 1, doy: START_DOY, line: 1, gen: 1, m: null, cage: newCage(), oothecae: [], lineage: [], log: [], hatchFrom: null };
}
function newCage() { return { moist: 60, clean: 100, leftover: [], moldy: false }; }
function newMantis(name, color, from) {
  return {
    name, color, from, sex: Math.random() < 0.5 ? 'F' : 'M',
    stage: 0, growth: 0, stageTurns: 0, state: 'normal', // normal | premolt (脱皮前) | postmolt (脱皮直後)
    hunger: 70, health: 100, injury: 0, crumpled: false, sexKnown: false, shed: false,
    mated: false, malesLeft: 2, adultTurns: 0, eggProgress: 0, laid: 0, fertileLaid: 0, partnerTimer: 0,
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
  else say(m.state === 'premolt' ? '霧吹きをした。壁に水滴がついた。' : `霧吹きをした。${m.name}が壁の水滴をなめている。`);
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

function actFeed() {
  const m = game.m;
  if (m.state === 'postmolt') return say('脱皮したばかりで体がやわらかい。体がかたまるまではエサを食べない。');
  if (m.hunger >= 95) return say(`${m.name}はおなかいっぱいで、エサに見向きもしない。`);
  choosePrey(`${esc(m.name)}（体長 約${bodyLength(m)}mm）にどのエサをあげる？`,
    'エサは、カマキリの首（前胸）くらいの長さがちょうどいい。大きすぎると暴れて、小さすぎるとおなかがふくれない。',
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
    if (m.growth >= st.need && m.stageTurns >= st.minTurns) { m.state = 'premolt'; say(`${m.name}がエサを食べなくなり、上のほうでじっとぶら下がっている…`); }
  }
  if (!g.m) return;

  // 3日ぶん時間がたつ
  g.doy += TURN_DAYS;
  m.stageTurns++;
  if (c.moist >= MOIST_MOLD) { c.moldy = true; c.clean = clamp(c.clean - 25); say('ジメジメしすぎて、ケースにカビが生えてきた。'); }
  m.hunger = clamp(m.hunger - (isAdult(m) ? HUNGER_DECAY[m.sex] : HUNGER_DECAY.nymph));
  c.moist = clamp(c.moist - MOIST_DECAY);
  c.clean = clamp(c.clean - CLEAN_DECAY - LEFTOVER_DIRT * c.leftover.length);
  let bad = false;
  if (m.hunger <= 0) { m.health -= 20; bad = true; say(`${m.name}はおなかがぺこぺこで弱っている。`); }
  if (c.moist < 15) { m.health -= 15; bad = true; say('ケースがカラカラで、水が飲めずに弱っている。'); }
  if (c.clean < 25) { m.health -= 15; bad = true; say('ケースが汚れていて、具合が悪そうだ。'); }
  if (!bad) m.health += 8;
  m.health = clamp(m.health);
  if (m.health <= 0) {
    return endLife(m.hunger <= 0 ? 'おなかをすかせて死んでしまった' : c.moist < 15 ? '水分が足りずに死んでしまった' : c.clean < 25 ? 'よごれたケースで病気になってしまった' : '弱って死んでしまった');
  }
  if (isAdult(m)) adultTurn();

  // 季節
  if (!isAdult(m) && g.doy >= NYMPH_COLD_DOY) return endLife('寒さがきびしくなり、成虫になれないまま力つきた');
  if (isAdult(m) && g.doy >= (m.sex === 'F' ? FEMALE_END_DOY : MALE_END_DOY)) return endLife('寿命をまっとうした');
  save();
  renderHUD();
  if (emerged) {
    modal('羽化！', `<p>${esc(m.name)}は${sexName(m.sex)}の成虫になった。</p><p class="sub">${m.sex === 'F'
      ? 'メスは成虫になって10日ほどたつと、オスを迎えて交尾できる。よく食べさせると、数回に分けて卵鞘を産む。'
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
  // 脱皮のときに体の色が変わることがある
  if (Math.random() < 0.25) {
    m.color = before === 'green' ? 'brown' : 'green';
    say(`体の色が${before === 'green' ? '緑から茶色' : '茶色から緑'}に変わった。`);
  }
  return false;
}

function adultTurn() {
  const g = game, m = g.m;
  m.adultTurns++;
  if (m.sex === 'F') {
    // 交尾していなくても卵鞘は産む。ただし幼虫は生まれない
    const ready = m.adultTurns >= (m.mated ? 4 : 8);
    if (ready && m.hunger >= 40 && ++m.eggProgress >= 3) {
      m.eggProgress = 0;
      m.laid++;
      if (m.mated) m.fertileLaid++;
      g.oothecae.push({ fertile: m.mated, mother: m.name });
      say(m.mated ? `${m.name}が卵鞘を産んだ！ この中に200個ほどの卵が入っている。` : `${m.name}が卵鞘を産んだ。でも交尾していないので、この卵鞘から幼虫は生まれない。`);
    }
  } else if (m.partnerTimer > 0 && --m.partnerTimer === 0) {
    g.oothecae.push({ fertile: true, mother: 'お見合い相手のメス' });
    m.fertileLaid++;
    say('お見合い相手のメスが卵鞘を産んだ。ひとつゆずってもらった！');
  }
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
    say('交尾に成功した！ 終わったので、オスは別のケースにもどした。');
    modal('交尾成功！', `<p>${esc(m.name)}は交尾に成功した。これから産む卵鞘からは、春に幼虫が生まれる。</p><p class="sub">よく食べさせると、数回に分けて卵鞘を産む。</p>`);
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
  modal('冬まで見守る', '<p>残りの日々を静かに見守る。季節を冬まで進める。</p>', [
    { label: '見守る', onClick: () => { game.doy = Math.max(game.doy, m.sex === 'F' ? FEMALE_END_DOY : MALE_END_DOY); endLife('寿命をまっとうした'); } },
    { label: 'やめておく' },
  ]);
}

/* ---------------- 一生の終わりと次の世代 ---------------- */
function endLife(cause, note) {
  const g = game, m = g.m;
  g.lineage.push({
    line: g.line, gen: g.gen, name: m.name, sex: sexKnown(m) ? sexName(m.sex) : '性別不明',
    stage: STAGES[m.stage].name, from: m.from, year: g.year, end: dateText(g.doy), cause, left: offspringText(m),
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
    modal('冬', `<p>${g.oothecae.length ? '残った卵鞘は、交尾していないメスが産んだものだけ。この卵鞘から幼虫は生まれない。' : '幼虫が生まれる卵鞘は残らなかった。'}</p><p>春になったら、野外で卵鞘をさがしに行こう。</p>`,
      [{ label: '春になった（野外で卵鞘をさがす）', onClick: () => spring(null) }]);
    return;
  }
  modal('卵鞘の冬越し', `<p>幼虫が生まれる卵鞘が${fertile.length}個ある。春まで、どこに置いておく？</p>`, [
    { label: '🌿 ベランダ（外）に置く', onClick: () => spring(fertile[0]) },
    { label: '🏠 あたたかい部屋に置く', onClick: warmRoom },
  ]);
}

function warmRoom() {
  const g = game;
  g.oothecae.splice(g.oothecae.findIndex((o) => o.fertile), 1);
  save();
  modal('1月', '<p>あたたかい部屋に置いた卵鞘から、真冬なのに幼虫が生まれてきてしまった。外には、幼虫が食べられる小さな虫がいない…</p><p class="sub">卵鞘は冬の寒さに当てておくと、春になってから孵化する。</p>',
    [{ label: '次へ', onClick: winter }]);
}

function spring(ootheca) {
  const g = game;
  if (ootheca) g.gen++;
  else { g.line++; g.gen = 1; }
  g.year++;
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
  const count = Math.round(rand(100, 200));
  const colors = Array.from({ length: 5 }, () => (Math.random() < 0.6 ? 'green' : 'brown'));
  const card = modal(`${g.year}年目の春`, `<p>${esc(from)}から、${count}匹の幼虫が生まれた！</p><p class="sub">カマキリは共食いするので、1匹ずつ分けて育てる。育てる1匹を選んで、残りは卵鞘があった場所の近くの草むらに放そう。</p><canvas id="larvae" width="640" height="200" style="width:320px;height:100px"></canvas><div class="grid5"></div>`, []);
  const c2 = card.querySelector('#larvae').getContext('2d');
  c2.scale(2, 2);
  c2.fillStyle = '#7a5a3a';
  c2.fillRect(4, 78, 312, 5);
  colors.forEach((color, i) => {
    Art.mantis(c2, 30 + i * 64, 78, 0.5, { stage: 0, adult: false, sex: 'F', color, aim: Math.sin(i * 1.7) * 0.5 });
    const b = document.createElement('button');
    b.textContent = `${i + 1}`;
    b.onclick = () => { closeModal(); nameMantis(color, from); };
    card.querySelector('.grid5').append(b);
  });
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
  say(`${name}を育てはじめた。生まれたての1齢幼虫は、体長1cmくらい。`);
  say('小さい幼虫には、小さいエサ（アブラムシやショウジョウバエ）をあげよう。');
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
  const ax = 16 + 62 * s; // オスのはねの先 (体長 100 のうち 58) まで画面に入れる
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
  const v = (mv === 'fly' ? 2.2 : 0.5) * L.reach * fast;
  const dx = h.tx - h.x, dy = h.ty - h.y, d = Math.hypot(dx, dy);
  if (d < v * dt) {
    h.x = h.tx; h.y = h.ty;
    h.wait = mv === 'fly' ? rand(0.3, 1.2) : rand(0.4, 1.4);
  } else {
    const jit = mv === 'fly' ? v * 0.15 : 0;
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

/* ---------------- 観察・記録 ---------------- */
function actLook() {
  const m = game.m, c = game.cage, tips = [];
  if (m.state === 'premolt') tips.push('エサを食べずに、上のほうでじっとぶら下がっている。脱皮が近いサイン。ケースを乾かさないようにして、エサの虫は取り出しておこう。');
  if (m.state === 'postmolt') tips.push('脱皮したばかりで、体がまだやわらかい。かたまるまではエサを食べない。');
  if (c.leftover.length) tips.push(`ケースにエサの虫が${c.leftover.length}匹残っている。`);
  if (c.moist < MOIST_MOLT_MIN) tips.push('ケースが乾いている。脱皮の前は特に気をつけよう。');
  if (c.moist >= MOIST_MOLD) tips.push('ジメジメしすぎている。カビが生えやすい。');
  if (m.hunger < 30) tips.push('おなかがすいているようだ。');
  if (!isAdult(m) && m.state === 'normal' && m.growth >= STAGES[m.stage].need) tips.push('よく食べている。そろそろ脱皮しそうだ。');
  if (m.injury) tips.push('脱皮の失敗であしが曲がっていて、カマのとどく範囲がせまい。次の脱皮がうまくいけば、少しよくなる。');
  if (!sexKnown(m)) tips.push(m.stage >= SEX_VISIBLE_STAGE ? 'おなかの節が数えられる大きさになった。' : '性別は、5齢くらいになるとおなかの節の数でわかる。');
  if (isAdult(m) && m.sex === 'F') tips.push(m.mated ? `交尾ずみ。よく食べさせると卵鞘を産む（いままでに${m.laid}個）。` : m.adultTurns >= 3 ? 'オスを迎えられる。' : '成虫になって10日ほどたつと、オスを迎えられる。');
  if (isAdult(m) && m.sex === 'M') tips.push(m.mated ? '交尾ずみ。' : m.adultTurns >= 2 ? 'お見合いに行ける。' : 'もう少ししたら、お見合いに行ける。');
  const btns = [];
  if (!sexKnown(m) && m.stage >= SEX_VISIBLE_STAGE) btns.push({ label: 'おなかの節を数える', cls: 'pink', onClick: sexQuiz });
  btns.push({ label: '家系の記録', onClick: () => showLineage(actLook) }, { label: 'タイトルにもどる', onClick: titleScreen }, { label: 'とじる' });
  modal(`${esc(m.name)}のようす`, `<p>${STAGES[m.stage].name}・体長 約${bodyLength(m)}mm・${m.color === 'green' ? '緑色' : '茶色'}・${sexLabel(m)}</p>${tips.map((t) => `<p class="sub">${t}</p>`).join('')}`, btns);
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
  const rows = game.lineage.map((e) => `<div class="lineage"><span class="gen">${e.line > 1 ? `${e.line}系統 ` : ''}第${e.gen}世代</span><b>${esc(e.name)}</b>（${e.sex}・${e.stage}）<small>${esc(e.from)}から生まれた。${e.year}年目の${e.end}に${esc(e.cause)}。</small><small>のこしたもの: ${e.left}</small></div>`).join('');
  modal('家系の記録', rows || '<p>まだ記録はない。</p>', [{ label: 'とじる', onClick: back }]);
}

/* ---------------- タイトル ---------------- */
function titleScreen() {
  scene = 'title';
  showHUD(false);
  const saved = load();
  const btns = [];
  if (saved) btns.push({ label: 'つづきから', cls: 'next', onClick: () => resume(saved) });
  btns.push({ label: 'はじめから', onClick: saved ? confirmNew : startNew });
  if (saved && saved.lineage.length) btns.push({ label: '家系の記録', onClick: () => { game = saved; showLineage(titleScreen); } });
  modal('カマキリ飼育日記<small>MANTIS KEEPER</small>', '<p>オオカマキリを1齢の幼虫から育てよう。エサの大きさ、ケースのしめり気、脱皮のタイミングに気をつけて成虫まで育てたら、卵鞘を産ませて次の世代へつなごう。</p>', btns);
  $('modal').classList.add('low'); // ケースの中のカマキリが見えるように、下に寄せる
}

function confirmNew() {
  modal('はじめから', '<p>いまの記録（家系も）は消える。いい？</p>', [{ label: 'はじめから遊ぶ', onClick: startNew }, { label: 'やめる', onClick: titleScreen }]);
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
    Art.prey(c2, p.id, 17, 17, 22, 0, 1);
    const txt = document.createElement('div');
    txt.innerHTML = `<b>${p.name} <small>${p.size}mm</small></b><small>${p.note}</small>`;
    b.append(cv, txt);
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
  const g = game, m = g.m, c = g.cage;
  $('mName').textContent = m.name;
  $('mStage').textContent = `${STAGES[m.stage].name}・${bodyLength(m)}mm`;
  $('mSex').textContent = sexLabel(m);
  $('mDate').textContent = `${g.line > 1 ? `${g.line}系統 ` : ''}第${g.gen}世代・${g.year}年目 ${dateText(g.doy)}`;
  setGauge('gHunger', m.hunger, m.hunger < 25);
  setGauge('gMoist', c.moist, c.moist < MOIST_MOLT_MIN || c.moist >= MOIST_MOLD);
  setGauge('gClean', c.clean, c.clean < 30);
  setGauge('gHealth', m.health, m.health < 30);
  $('log').innerHTML = g.log.slice(-3).map((t) => `<p>${esc(t)}</p>`).join('');
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
  // 横長の画面では 4:3、縦長のスマホでは少し背の高いケースにする
  const w = Math.min(availW, availH * 4 / 3, 820), h = Math.min(availH, w * 1.05);
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
    const L = Math.max(5, p.size / 88 * r.w * 0.4);
    Art.prey(ctx, id, r.x + r.w * (0.15 + 0.7 * (Math.sin(ph) + 1) / 2), geo.floor + 6 + (i % 3) * 4, L, T, Math.cos(ph) > 0 ? 1 : -1);
  });
  // この季節に産んだ卵鞘は、小枝やネットにくっついている
  if (!demo) {
    game.oothecae.forEach((o, i) => {
      const spot = OOTHECA_SPOTS[i % OOTHECA_SPOTS.length];
      Art.ootheca(ctx, r.x + r.w * spot[0], r.y + r.h * spot[1], r.w * 0.04);
    });
  }
  if (!m) return;
  const len = m === DEMO_MANTIS ? ADULT_LENGTH.F : bodyLength(m);
  const s = r.w * (0.12 + 0.28 * len / ADULT_LENGTH.F) / 100;
  const lk = m === DEMO_MANTIS ? { stage: m.stage, adult: true, sex: 'F', color: 'green' } : look(m);
  if (m.shed) {
    // ふたにぶら下がった、ぬけがら
    ctx.save();
    ctx.translate(r.x + r.w * 0.8, geo.lid);
    ctx.scale(1, -1);
    Art.mantis(ctx, 0, 0, r.w * (0.12 + 0.28 * STAGES[m.stage - 1].length / ADULT_LENGTH.F) / 100, { stage: m.stage - 1, adult: false, sex: m.sex, ghost: true });
    ctx.restore();
  }
  if (m.state === 'premolt') {
    ctx.save();
    ctx.translate(r.x + r.w * 0.5, geo.lid + 2);
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

function drawHunt() {
  const h = hunt, L = h.lay, m = game.m;
  ctx.fillStyle = '#e9f1ea';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(60,110,70,0.2)';
  ctx.lineWidth = 2;
  const step = Math.max(24, L.s * 14);
  ctx.beginPath();
  for (let x = 0; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, L.floor); }
  for (let y = 0; y < L.floor; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.fillStyle = '#fbfaf5';
  ctx.fillRect(0, L.floor + L.s * 6, W, H);
  // 止まっている枝
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
const ACTIONS = { feed: actFeed, mist: actMist, clean: actClean, look: actLook, mate: actMate, watch: actWatch, next: actNext };
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

resize();
titleScreen();
requestAnimationFrame(frame);
