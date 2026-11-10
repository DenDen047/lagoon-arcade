'use strict';
/* カマキリ採集飼育帳 — ゲームの進み方と画面 */

const SAVE_KEY = 'mantis-field.save';
const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, T = 0;

let game = null;      // セーブされる中身
let scene = 'title';  // title | shelf | field
let field = null;     // さがしに行っている間だけ使う
let modalAnim = null; // ダイアログの中で動かす絵 { cv, draw }

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (e) { /* 保存しない */ } }
function load() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

function weighted(list) {
  const sum = list.reduce((a, o) => a + o.w, 0);
  let r = Math.random() * sum;
  for (const o of list) { r -= o.w; if (r <= 0) return o; }
  return list[list.length - 1];
}

/* ---------------- 生き物 ---------------- */
const len = (m) => Math.max(3, Math.round(m.adultLen * STAGES[m.stage].frac));
const look = (m) => ({ stage: m.stage, color: m.color, sp: SP[m.sp], ind: m });
const regionName = (id) => REGIONS.find((r) => r.id === id).name;

const COLOR_NAMES = { green: '緑色', brown: '褐色', pale: 'うすい緑色', darkBrown: '濃い茶色', satsuma: '緑がかった褐色', kokaGreen: '緑色' };
function newMantis(spId, stage, from) {
  const sp = SP[spId];
  let kind = pick(sp.colors), k = Math.random();
  if (kind === 'koka' && Math.random() < 0.08) kind = 'kokaGreen'; // 稀に緑色型
  let colorName = COLOR_NAMES[kind];
  if (kind === 'koka') colorName = k < 0.33 ? '濃い茶色 (褐色型)' : k < 0.66 ? '褐色 (褐色型)' : 'クリーム色のような薄い色 (褐色型)';
  // ハラビロカマキリのイボ状突起は3対が多く、2個や4個のことも、左右で数が違うこともある
  const bumps = () => { const r = Math.random(); return r < 0.7 ? 3 : r < 0.85 ? 2 : 4; };
  const bumpsL = bumps(), bumpsR = Math.random() < 0.75 ? bumpsL : bumps();
  return {
    no: 0, sp: spId, stage, color: Art.bodyColor(kind, k), colorName,
    adultLen: Math.round(rand(sp.len[0], sp.len[1])), bumpsL, bumpsR,
    health: 80, toMolt: MOLT_WEEKS, setup: null, from, raised: false, shed: false,
  };
}

function feetOf(setup) {
  if (setup.kind === 'cup') return LID[setup.lid].feet;
  return CASE[setup.kind].feet ? setup.feet : 'none';
}

// 脱皮のときのつかまりやすさ (0〜3)
function gripOf(m) {
  const c = CASE[m.setup.kind];
  if (c.grip !== null) return c.grip;
  let g = FOOT[feetOf(m.setup)].grip[len(m) <= SMALL_LEN ? 0 : 1];
  if (c.stand && m.setup.lidNet) g = Math.max(g, LID_NET[m.setup.stand]);
  return g;
}

/* 縦置きと横置き・ケースの大きさ・エサの与え方 (スライド「縦置きと横置き」) */
const standCase = (setup) => !!CASE[setup.kind].stand;
const sizeOf = (setup) => CASE_SIZE[setup.size || 'S'];
// ケースの中の高さ (mm)。縦置きにすると、横置きの横幅が高さになる
const roofMM = (setup) => sizeOf(setup).mm[setup.stand === 'tate' ? 0 : 1];
const nextLen = (m) => Math.round(m.adultLen * STAGES[Math.min(ADULT, m.stage + 1)].frac);
const needRoof = (m) => nextLen(m) * MOLT_HEIGHT;
const lowRoof = (m) => standCase(m.setup) && m.stage < ADULT && roofMM(m.setup) < needRoof(m);
const feedOf = (setup) => (standCase(setup) ? setup.feed || 'direct' : 'direct');
// エサの虫を見張る必要があるか。tate: 縦置きでフタまですぐ行ける / feet: 底からフタまで足場がある
function watchReason(setup) {
  if (!standCase(setup) || feedOf(setup) === 'dish') return null;
  if (setup.stand === 'tate') return 'tate';
  if (setup.feet && setup.feet !== 'none') return 'feet';
  return null;
}
const WATCH_TEXT = {
  tate: '縦置きなので、エサの虫がすぐにフタの位置まで移動できる。フタの穴から脱走したり、足場に隠れたりしやすい。',
  feet: '底からフタまで足場があるので、エサの虫が足場をつたってフタまで行ける。',
};

// ケースの気になるところ。どれもスライドに書かれていること
function issues(m) {
  const c = CASE[m.setup.kind], L = len(m), feet = feetOf(m.setup);
  const list = [];
  if (c.humid) list.push({ k: 'humid', text: 'ケースの中がしめっぽい。日本産カマキリは、そこまで湿った環境を好むわけではない。' });
  if (m.setup.soil && c.soil) list.push({ k: 'soil', text: '土からコバエが増えている。土は入れなくていい。' });
  if (c.small && L > CUP_MAX_LEN) list.push({ k: 'cramped', text: 'カップがせまそう。プラカップは小さい種類や幼虫の飼育で便利。' });
  if (lowRoof(m)) list.push({ k: 'lowRoof', text: `カマキリは脱皮に高さが必要。このケースの高さ (約${roofMM(m.setup)}mm) では、次の脱皮には足りないかも。縦置きにするか、大きめのケースにしよう。` });
  if (c.grip === null) {
    const lidFoot = c.stand && m.setup.lidNet && LID_NET[m.setup.stand] > 0;
    if (feet === 'none' && !lidFoot) list.push({ k: 'noGrip', text: 'つかまりやすい場所が少ない。足場を入れよう。' });
    else if (feet === 'hachi' && L <= SMALL_LEN) list.push({ k: 'hardNet', text: '小さい幼虫や小さい種には、やわらかくて爪が傷みにくい排水溝ネットが適している。' });
  }
  return list;
}

function setupText(setup) {
  const c = CASE[setup.kind];
  if (setup.kind === 'cup') return `${c.short}・${LID[setup.lid].name}`;
  let s = c.short;
  if (c.stand) s += ` (${sizeOf(setup).name}・${setup.stand === 'tate' ? '縦置き' : '横置き'})`;
  if (c.feet) s += `・足場: ${FOOT[setup.feet].id === 'none' ? 'なし' : FOOT[setup.feet].name}`;
  if (c.stand && setup.lidNet) s += '・フタにネット';
  if (c.stand) s += `・エサ: ${FEED[feedOf(setup)].name}`;
  if (setup.soil && c.soil) s += '・土あり';
  return s;
}

/* ---------------- ゲームの記録 ---------------- */
function newGame() {
  const dex = {};
  for (const s of SPECIES) dex[s.id] = { seen: false, ided: false, raised: false, wintered: false };
  const eggDex = {};
  for (const o of OOTHECAE) eggDex[o.id] = { seen: false, ided: false };
  return { year: 1, season: 0, week: 0, searched: false, nextNo: 1, shelf: Array(SHELF_SLOTS).fill(null), eggs: [], dex, eggDex, log: [], hatchQueue: [] };
}

function say(text) {
  game.log.push(text);
  if (game.log.length > 30) game.log.shift();
  renderHUD();
}

const dateText = () => `${game.year}年目 ${SEASONS[Math.min(game.season, WINTER)].name} ${game.week + 1}週目`;
const freeSlot = () => game.shelf.findIndex((s) => !s);
const starCount = () => SPECIES.filter((s) => game.dex[s.id].ided).length;

/* ---------------- 1週間すすめる ---------------- */
function actNext() {
  const hungry = game.season !== WINTER && game.shelf.filter((m) => m && !m.fed);
  if (hungry && hungry.length) {
    modal('まだエサをあげていない', `<p>${hungry.map((m) => `No.${m.no}`).join('、')} は、今週まだエサを食べていない。エサを食べられなかった週は育たず、げんきが減る。</p>`, [
      { label: 'エサをあげる', cls: 'next', onClick: actFeed },
      { label: 'このまま1週間すすめる', onClick: advanceWeek },
    ]);
    return;
  }
  advanceWeek();
}

function advanceWeek() {
  const events = [];
  const winterNow = game.season === WINTER;
  game.shelf.forEach((m, i) => {
    if (!m) return;
    m.shed = false;
    m.moltFail = false;
    const iss = issues(m);
    const before = m.health;
    const hurt = iss.filter((x) => HEALTH[x.k]);
    m.health = clamp(m.health + (hurt.length ? hurt.reduce((a, x) => a + HEALTH[x.k], 0) : HEALTH.rest));
    const sp = SP[m.sp];
    if (before >= 40 && m.health < 40 && m.health > 0 && CASE[m.setup.kind].see > 0) {
      events.push(`No.${m.no} ${sp.name}が弱ってきた。ケースをタップして、気になることを見てみよう。`);
    }
    // エサを食べられなかった週は育たない
    const ate = winterNow || m.fed;
    if (!ate) {
      m.health = clamp(m.health + HUNGRY);
      events.push(`No.${m.no} ${sp.name}は、今週エサを食べられなかった。`);
    }
    m.fed = false;
    // 冬は育たない (幼虫で冬を越すサツマヒメカマキリも、春まで脱皮しない)
    if (m.stage < ADULT && !winterNow && ate) {
      m.toMolt--;
      if (m.toMolt <= 0) {
        const roof = lowRoof(m);
        if (Math.random() < MOLT_OK[gripOf(m)] * (roof ? LOW_ROOF_MOLT : 1)) {
          m.stage++;
          m.toMolt = MOLT_WEEKS;
          m.shed = true;
          if (m.stage === ADULT) {
            m.raised = true;
            game.dex[m.sp].raised = true;
            events.push(`No.${m.no} ${sp.name}が脱皮して、成虫になった！`);
          } else {
            events.push(`No.${m.no} ${sp.name}が脱皮して、${STAGES[m.stage].name}になった。`);
          }
        } else {
          m.health = clamp(m.health + HEALTH.moltFail);
          m.toMolt = 1;
          m.moltFail = true;
          events.push(roof ? `No.${m.no} ${sp.name}は、ケースの高さが足りず脱皮に失敗した…。` : `No.${m.no} ${sp.name}は、うまくつかまれず脱皮に失敗した…。`);
        }
      }
    }
    if (m.health <= 0) {
      events.push(`No.${m.no} ${sp.name}は、力つきてしまった。`);
      game.shelf[i] = null;
    }
  });
  events.forEach((e) => say(e));
  game.week++;
  game.searched = false;
  if (game.week >= SEASONS[game.season].weeks) {
    game.week = 0;
    game.season++;
    if (game.season === WINTER) { save(); winterComes(); return; }
    if (game.season > WINTER) { save(); yearEnd(); return; }
    say(`${SEASONS[game.season].name}になった。`);
  }
  say(`${dateText()}。`);
  save();
  if (events.some((e) => e.includes('力つき') || e.includes('失敗') || e.includes('弱って'))) modal('この1週間のできごと', events.map((e) => `<p>${esc(e)}</p>`).join(''));
}

// 冬。国産カマキリはほとんどの種で卵で冬を越す。サツマヒメカマキリは一部地域を除き幼虫で越冬する
function winterComes() {
  const lines = [];
  game.shelf.forEach((m, i) => {
    if (!m) return;
    const sp = SP[m.sp];
    if (sp.overwinter === 'nymph' && m.stage < ADULT) {
      lines.push(`No.${m.no} ${sp.name}は、幼虫のまま冬を越す。`);
      return;
    }
    lines.push(m.stage >= ADULT
      ? `No.${m.no} ${sp.name}は、成虫のまま冬をむかえ、一生を終えた。`
      : `No.${m.no} ${sp.name}は、成虫になれないまま冬をむかえ、一生を終えた。`);
    game.shelf[i] = null;
  });
  say('冬になった。');
  save();
  modal('冬が来た<small>WINTER</small>',
    `<p>国産カマキリはほとんどの種で卵で冬を越します。サツマヒメカマキリの場合は、一部地域を除き幼虫で越冬します。</p>
     ${lines.length ? lines.map((l) => `<p class="sub">${esc(l)}</p>`).join('') : ''}
     <p>冬のあいだは、卵鞘をさがしてみよう。春になると、連れて帰った卵鞘から幼虫が生まれる。</p>`);
}

function yearEnd() {
  for (const m of game.shelf) if (m && SP[m.sp].overwinter === 'nymph') game.dex[m.sp].wintered = true;
  const raised = SPECIES.filter((s) => game.dex[s.id].raised).map((s) => s.name);
  const wintered = SPECIES.filter((s) => game.dex[s.id].wintered).map((s) => s.name);
  const html = `
    <p>図鑑の★ (見分けられた種類): <b>${starCount()} / ${SPECIES.length}</b></p>
    <p>成虫まで育てた種類: <b>${raised.length ? raised.join('、') : 'まだない'}</b></p>
    <p>幼虫で冬を越した: <b>${wintered.length ? wintered.join('、') : 'まだない'}</b></p>
    <p>連れて帰った卵鞘: <b>${game.eggs.length}個</b></p>
    <p class="sub">次の春へ進むと、卵鞘から幼虫が生まれる。図鑑の記録はそのまま引きつぐ。</p>`;
  modal(`${game.year}年目のまとめ<small>YEAR ${game.year}</small>`, html, [
    { label: '次の春へ', cls: 'next', onClick: nextSpring },
    { label: '図鑑を見る', onClick: () => showDex(yearEnd) },
  ]);
}

function nextSpring() {
  game.year++;
  game.season = 0;
  game.week = 0;
  game.searched = false;
  game.hatchQueue = game.eggs.map((e) => e.kind);
  game.eggs = [];
  say(`${dateText()}。春になった。`);
  save();
  hatchNext();
}

// 卵鞘から幼虫が生まれる。1つの卵鞘から1匹を育てる
function hatchNext() {
  scene = 'shelf';
  showHUD(true);
  if (!game.hatchQueue.length) { renderHUD(); return; }
  // 途中で閉じても生まれた幼虫が消えないように、棚に置いてから列から外す
  const kind = game.hatchQueue[0];
  const done = () => { game.hatchQueue.shift(); save(); hatchNext(); };
  const sp = SP[kind];
  if (freeSlot() < 0) {
    modal('卵鞘から幼虫が生まれた', `<p>${sp.name}の幼虫が生まれたけど、棚がいっぱいで育てられない。</p>`, [{ label: 'つぎへ', onClick: done }]);
    return;
  }
  const m = newMantis(kind, 0, '卵鞘から生まれた');
  modal('卵鞘から幼虫が生まれた<small>HATCH</small>', `<p>${sp.name}の卵鞘から、小さい幼虫が生まれた！1匹を育てよう。</p>`, [
    { label: '飼育ケースを用意する', cls: 'next', onClick: () => buildCase(m, null, (setup) => { placeMantis(m, setup); done(); }) },
  ]);
}

function placeMantis(m, setup) {
  const i = freeSlot();
  if (i < 0) return;
  m.no = game.nextNo++;
  m.setup = setup;
  game.shelf[i] = m;
  say(`No.${m.no} ${SP[m.sp].name}を棚に置いた。`);
  save();
}

/* ---------------- エサをあげる ---------------- */
function feedLine(m) {
  const head = `No.${m.no} ${SP[m.sp].name}`;
  if (feedOf(m.setup) === 'dish') return `${head}: エサの虫をカップに入れて置いた。脱走も隠れることもなく、入れたままで食べてくれた。`;
  if (standCase(m.setup)) return `${head}: ツルツルした壁をエサの虫は登れないので、見張らなくても食べてくれた。`;
  return `${head}: エサの虫を入れたら、食べてくれた。`;
}

function actFeed() {
  if (game.season === WINTER) { modal('エサをあげる', '<p>このゲームでは、冬のあいだは育たないので、エサはあげなくていいことにしている。</p>'); return; }
  const todo = game.shelf.map((m, i) => ({ m, i })).filter((o) => o.m && !o.m.fed);
  if (!todo.length) { modal('エサをあげる', `<p>${game.shelf.some(Boolean) ? '今週は、みんなもうエサを食べた。' : '棚にカマキリがいない。'}</p>`); return; }
  const lines = [], watch = [];
  for (const { m, i } of todo) {
    if (watchReason(m.setup)) watch.push(i);
    else { m.fed = true; lines.push(feedLine(m)); }
  }
  save();
  renderHUD();
  let html = lines.map((l) => `<p>${esc(l)}</p>`).join('');
  if (watch.length) {
    html += `<h3>見張りが必要なケース</h3><ul>${watch.map((i) => `<li>No.${game.shelf[i].no} ${esc(SP[game.shelf[i].sp].name)}: ${esc(WATCH_TEXT[watchReason(game.shelf[i].setup)])}</li>`).join('')}</ul>
      <p class="sub">エサの虫をカップやタッパーに入れて置くか、横置きで底からフタまでの足場をなくすと、見張らなくてよくなる。</p>`;
  }
  modal('エサをあげる<small>FEED</small>', html, watch.length
    ? [{ label: '見張ってエサをあげる', cls: 'next', onClick: () => watchQueue(watch) }, { label: 'あとで' }]
    : [{ label: 'とじる' }]);
}

function watchQueue(list) {
  if (!list.length) return;
  feedWatch(list[0], () => watchQueue(list.slice(1)));
}

/* 見張ってエサをあげる。エサの虫はフタのほうへ逃げたり足場に隠れたりするので、
   タップしてカマキリの前に移動させる (スライド「縦置きと横置き」の、餌の虫を移動させる・見張る) */
function feedWatch(i, next) {
  const m = game.shelf[i];
  if (!m) { if (next) next(); return; }
  const sp = SP[m.sp], reason = watchReason(m.setup), food = pick(FOODS);
  const card = openModal();
  card.innerHTML = `<h2>見張ってエサをあげる<small>No.${m.no} ${esc(sp.name)}・エサ: ${esc(food)}</small></h2>
    <p class="sub">${esc(WATCH_TEXT[reason])}エサの虫をタップして、カマキリの前に移動させよう。</p>
    <div class="panelBox"></div><p class="feat"></p><div class="btns"></div>`;
  const pw = Math.min(340, window.innerWidth - 80), ph = Math.round(pw * (m.setup.stand === 'tate' ? 1.05 : 0.8));
  const { cv, c2 } = makeCanvas(pw, ph);
  cv.style.touchAction = 'none';
  card.querySelector('.panelBox').append(cv);
  const feat = card.querySelector('.feat');
  const btns = card.querySelector('.btns');
  // 小さめのケースも大きく見えるように、枠を広げて描く
  const zoom = (m.setup.size || 'S') === 'S' ? 1.25 : 1;
  const bw = pw * 0.9 * zoom, bh = (ph * 0.96 - 12) * zoom;
  const box = { x: (pw - bw) / 2, y: ph * 0.96 - 12 - bh, w: bw, h: bh };
  const geo = Art.caseGeom(box, m.setup, len(m));
  const bugR = Math.max(7, geo.inner.w * 0.045);
  const floorY = geo.floorY - bugR * 0.5;
  // エサの虫が向かう道すじ。最後の点まで行くと脱走する (または足場に隠れる)
  let path;
  if (reason === 'tate') {
    const lx = geo.lid.x - bugR;
    path = [{ x: lx, y: floorY }, { x: lx, y: geo.lid.y + geo.lid.h * 0.35 }];
  } else {
    const sx = geo.sheet.x + geo.sheet.w * 0.5;
    path = [{ x: sx, y: floorY }, { x: sx, y: geo.inner.y + bugR }, { x: geo.inner.x + geo.inner.w * 0.85, y: geo.inner.y + bugR }];
  }
  const hideSpot = geo.sheet ? { x: geo.sheet.x + geo.sheet.w * 0.3, y: floorY - geo.sheet.h * 0.15 } : null;
  // 足場があると、しばらく走ったあと足場に隠れることがある
  const hideAt = (t) => (hideSpot && Math.random() < 0.45 ? t + rand(1.5, 3.5) : Infinity);
  const st = { t: 0, x: geo.inner.x + geo.inner.w * (reason === 'tate' ? 0.3 : 0.8), y: floorY, seg: 0, phase: 'run', near: 0, hideAt: hideAt(0), flash: 0, dir: 0 };
  const speed = geo.inner.w * (reason === 'tate' ? 0.32 : 0.26);
  const front = geo.front;
  let over = false;
  const finish = (ok, why) => {
    over = true;
    if (ok) {
      m.fed = true;
      say(`No.${m.no} ${sp.name}がエサの${food}を食べた。`);
      save();
      renderHUD();
      feat.textContent = 'パクッ！ カマキリがエサの虫をつかまえて食べた。';
    } else {
      feat.textContent = why;
    }
    btns.innerHTML = '';
    const list = ok ? [] : [{ label: 'もう一度エサの虫を入れて見張る', cls: 'next', onClick: () => feedWatch(i, next) }];
    list.push({ label: next ? 'つぎへ' : 'とじる', cls: ok ? 'next' : '', onClick: next });
    addButtons(btns, list);
  };
  feat.textContent = `のこり ${FEED_TIME} 秒`;
  addButtons(btns, [{ label: 'やめる', onClick: next }]);
  cv.addEventListener('pointerdown', (e) => {
    if (over || st.phase === 'near' || st.phase === 'gone') return;
    const r = cv.getBoundingClientRect();
    // 画面の向きが変わって canvas が縮んでも、描いた座標でタップを判定する
    const x = (e.clientX - r.left) * pw / r.width, y = (e.clientY - r.top) * ph / r.height;
    if (Math.hypot(x - st.x, y - st.y) > bugR * 3) return;
    // カマキリの前に移動させる
    st.x = front.x + (Math.random() - 0.5) * bugR;
    st.y = front.y;
    st.phase = 'near';
    st.near = 0;
  });
  let lastT = T;
  modalAnim = {
    draw: () => {
      const dt = Math.min(0.05, Math.max(0, T - lastT));
      lastT = T;
      if (!over) {
        st.t += dt;
        const left = Math.max(0, FEED_TIME - st.t);
        if (st.phase === 'near') {
          st.near += dt;
          if (st.near > 0.8) {
            st.flash = 0.4;
            if (Math.random() < 0.7) { st.phase = 'gone'; finish(true); }
            else { st.phase = 'run'; st.seg = 0; st.hideAt = hideAt(st.t); st.x += bugR * 2; }
          }
        } else if (st.phase === 'run') {
          const hiding = st.t >= st.hideAt;
          const goal = hiding ? hideSpot : path[st.seg];
          const dx = goal.x - st.x, dy = goal.y - st.y, d = Math.hypot(dx, dy);
          const v = speed * dt;
          st.dir = Math.atan2(dy, dx);
          if (d <= v) {
            st.x = goal.x; st.y = goal.y;
            if (hiding) st.phase = 'hidden';
            else if (++st.seg >= path.length) {
              st.phase = 'gone';
              finish(false, m.setup.kind === 'plastic' ? `エサの${food}が、フタの穴から脱走してしまった。` : `エサの${food}がフタのところまで逃げて、カマキリが捕食できる位置に出てこなかった。`);
            }
          } else { st.x += dx / d * v; st.y += dy / d * v; }
        }
        if (!over && left <= 0) {
          finish(false, st.phase === 'hidden' ? `エサの${food}が足場に隠れて、カマキリが捕食できる位置に出てこなかった。` : `エサの${food}を、カマキリがつかまえられなかった。`);
        } else if (!over) {
          feat.textContent = `${st.phase === 'hidden' ? 'エサの虫が足場に隠れた！ ' : ''}のこり ${Math.ceil(left)} 秒`;
        }
      }
      c2.clearRect(0, 0, pw, ph);
      c2.fillStyle = '#efe7d4';
      c2.fillRect(0, 0, pw, ph);
      c2.fillStyle = '#c9a97a';
      c2.fillRect(0, ph - 12, pw, 12);
      Art.cage(c2, box, m.setup, { look: look(m), len: len(m) }, { T, seed: m.no });
      // カマキリの前 (ここに移動させると、つかまえる)
      c2.save();
      c2.setLineDash([4, 4]);
      c2.strokeStyle = 'rgba(181,71,106,0.55)';
      c2.lineWidth = 1.5;
      c2.beginPath();
      c2.arc(front.x, front.y, bugR * 2, 0, Math.PI * 2);
      c2.stroke();
      c2.restore();
      if (st.phase !== 'gone') {
        const wob = st.phase === 'run' ? Math.sin(T * 30) * 0.15 : 0;
        Art.bug(c2, st.x, st.y, bugR, food, st.phase === 'near' ? 0 : st.dir + wob, st.phase === 'hidden' ? 0.4 : 1);
      }
      if (st.flash > 0) {
        st.flash -= dt;
        c2.fillStyle = '#b5476a';
        c2.font = `bold ${Math.round(bugR * 2.2)}px sans-serif`;
        c2.textAlign = 'center';
        c2.fillText(st.phase === 'gone' ? 'パクッ！' : 'にげた！', front.x, front.y - bugR * 2.6);
      }
    },
  };
}

/* ---------------- さがしに行く ---------------- */
function actSearch() {
  if (game.searched) { modal('さがしに行く', '<p>今週はもう、さがしに行った。「1週間すすめる」で次の週へ。</p>'); return; }
  const card = openModal();
  card.innerHTML = `<h2>どこをさがす？<small>${esc(dateText())}</small></h2><div class="placeList"></div><div class="btns"></div>`;
  const list = card.querySelector('.placeList');
  for (const r of REGIONS) {
    const h = document.createElement('h3');
    h.textContent = r.name;
    list.append(h);
    for (const p of PLACES.filter((q) => q.region === r.id)) {
      const b = document.createElement('button');
      b.innerHTML = `<b>${esc(p.name)}</b><small>${esc(p.note)}${p.night ? '・夜' : ''}</small>`;
      b.onclick = () => { closeModal(); goPlace(p); };
      list.append(b);
    }
  }
  addButtons(card.querySelector('.btns'), [{ label: 'やめる' }]);
}

function seasonStage() {
  const r = Math.random();
  if (game.season === 0) return 0;
  if (game.season === 1) return r < 0.6 ? 1 : 2;
  return r < 0.3 ? 2 : 3;
}

function encounter(place) {
  const winter = game.season === WINTER;
  const opts = [];
  for (const f of winter ? place.winter : place.finds) {
    if (f.none) { opts.push({ w: f.none, none: true }); continue; }
    if (f.egg) { opts.push({ w: f.w, egg: f.egg }); continue; }
    let stage;
    if (winter) stage = Math.random() < 0.5 ? 0 : 1;
    else if (f.light) { if (game.season !== 2) continue; stage = ADULT; }
    else stage = seasonStage();
    if (f.maxStage !== undefined && stage > f.maxStage) continue;
    if (f.minStage !== undefined && stage < f.minStage) continue;
    opts.push({ w: f.w, sp: f.sp, stage, light: !!f.light });
  }
  return weighted(opts);
}

function goPlace(place) {
  game.searched = true;
  const f = encounter(place);
  const fd = { place, find: f, seed: Math.floor(Math.random() * 1e9) };
  if (f.sp) {
    fd.m = newMantis(f.sp, f.stage, `${regionName(place.region)}の${place.name}`);
    game.dex[f.sp].seen = true;
  }
  if (f.egg) game.eggDex[f.egg].seen = true;
  game.field = fd;
  save();
  enterField(fd);
}

function enterField(fd) {
  field = fd;
  const place = fd.place, f = fd.find;
  scene = 'field';
  showHUD(false);
  $('fieldUI').classList.remove('hidden');
  let text, btns;
  if (f.none) {
    text = place.night ? `${place.name}を見てまわったけど、何も飛んできていなかった。` : `${place.name}をさがしたけど、何も見つからなかった。`;
    if (game.season === WINTER && !place.winter.some((x) => !x.none)) text += '<br>冬は、ほとんどのカマキリが卵で冬を越している。';
    btns = [{ label: '帰る', cls: 'next', onClick: leaveField }];
  } else if (f.egg) {
    text = '<span class="big">卵鞘を見つけた！</span><br>どのカマキリの卵鞘だろう？';
    btns = [{ label: 'そっとしておく', onClick: leaveField }, { label: '見分ける', cls: 'next', onClick: identifyEgg }];
  } else {
    const what = f.light ? '照明にカマキリのオスが飛んできた！' : f.stage >= ADULT ? 'カマキリの成虫を見つけた！' : 'カマキリの幼虫を見つけた！';
    text = `<span class="big">${what}</span><br>何カマキリだろう？よく見て見分けよう。`;
    btns = [{ label: 'そっとしておく', onClick: leaveField }, { label: '見分ける', cls: 'next', onClick: identify }];
  }
  $('fieldInfo').innerHTML = `<small>${esc(regionName(place.region))}・${esc(place.name)}</small><br>${text}`;
  const box = $('fieldBtns');
  box.innerHTML = '';
  for (const bt of btns) {
    const b = document.createElement('button');
    b.textContent = bt.label;
    if (bt.cls) b.className = bt.cls;
    b.onclick = bt.onClick;
    box.append(b);
  }
}

function leaveField() {
  closeModal();
  field = null;
  game.field = null;
  save();
  scene = 'shelf';
  $('fieldUI').classList.add('hidden');
  showHUD(true);
  renderHUD();
}

/* ---------------- 見分ける ---------------- */
const TABS = [
  { id: 'coxa', name: '前脚' },
  { id: 'wings', name: '翅' },
  { id: 'sternum', name: 'おなか側' },
  { id: 'legs', name: '中脚・後脚' },
  { id: 'size', name: '大きさ・色' },
  { id: 'place', name: '場所' },
];

function featureText(m, tab) {
  const sp = SP[m.sp];
  if (tab === 'coxa') {
    let t;
    if (sp.coxa) t = `前脚の付け根あたりが${{ yellow: '黄色い', orange: 'オレンジ色', cream: '薄いクリーム色' }[sp.coxa]}。`;
    else if (sp.bumps === 'yellow') t = `前脚基節に黄色いイボ状突起がある (左${m.bumpsL}個・右${m.bumpsR}個)。`;
    else if (sp.bumps === 'small') t = '前脚基節に、小さいイボ状突起が10個くらいある。';
    else if (sp.bumps === 'none') t = '前脚基節にイボ状突起がなく、その部分が白銀色。';
    else t = sp.armPattern ? '' : '前脚の付け根には、見分けるポイントは見つからない。';
    if (sp.armPattern) t += '前脚に白と黒の模様がある。';
    return t;
  }
  if (tab === 'wings') {
    if (m.stage < ADULT) return m.stage >= 2 ? '幼虫なので、まだ翅がない。翅のもとが見える。' : '幼虫なので、まだ翅がない。';
    if (sp.wings === 'short') return '翅が小さい。';
    const t = [];
    if (sp.spots) t.push('前翅に白い紋が一対ある。');
    t.push(sp.hind === 'halfDark' ? '後翅が半分くらい黒っぽい。' : sp.hind === 'clear' ? '後翅は透明。' : '後翅には、見分けるポイントは見つからない。');
    return t.join('');
  }
  if (tab === 'sternum') {
    if (sp.sternum === 'yellowPurple') return '前胸腹板 (前胸のおなか側) は黄色く、紫の模様が入る。';
    if (sp.sternum === 'red') return '前胸腹板 (前胸のおなか側) が赤っぽい。';
    return '前胸腹板 (前胸のおなか側) には、見分けるポイントは見つからない。';
  }
  if (tab === 'legs') return sp.flaps ? '中脚・後脚に、ヒレのような突起がある。' : '中脚・後脚には、見分けるポイントは見つからない。';
  if (tab === 'size') return `体長 約${len(m)}mm (${STAGES[m.stage].name})。体の色は${m.colorName}。${sp.slender ? '体が細長い。' : ''}`;
  return `${m.from}で見つけた。${field && field.find.light ? '夜、照明に飛んできたオス。' : ''}季節は${SEASONS[game.season].name}。`;
}

function drawFeature(c2, w, h, m, tab) {
  if (tab === 'coxa') Art.panelCoxa(c2, w, h, m);
  else if (tab === 'wings') Art.panelWings(c2, w, h, m);
  else if (tab === 'sternum') Art.panelSternum(c2, w, h, m);
  else if (tab === 'legs') Art.panelLegs(c2, w, h, m);
  else if (tab === 'size') Art.panelSize(c2, w, h, m, len(m));
  else {
    c2.save();
    c2.beginPath();
    c2.rect(0, 0, w, h);
    c2.clip();
    const p = Art.field(c2, w, h, field.place.id, 0, field.seed);
    c2.restore();
    return p;
  }
}

function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = w * dpr;
  cv.height = h * dpr;
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  const c2 = cv.getContext('2d');
  c2.scale(dpr, dpr);
  return { cv, c2 };
}

function identify(tab) {
  const m = field.m;
  tab = typeof tab === 'string' ? tab : 'coxa';
  const card = openModal();
  card.innerHTML = `<h2>よく見て見分けよう<small>IDENTIFY</small></h2>
    <div class="tabs"></div><div class="panelBox"></div><p class="feat"></p>
    <h3>これは…</h3><div class="choices"></div><div class="btns"></div>`;
  const tabs = card.querySelector('.tabs');
  const box = card.querySelector('.panelBox');
  const pw = Math.min(340, window.innerWidth - 80), ph = Math.round(pw * 0.56);
  const { cv, c2 } = makeCanvas(pw, ph);
  box.append(cv);
  const show = (id) => {
    tab = id;
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === id)));
    c2.clearRect(0, 0, pw, ph);
    drawFeature(c2, pw, ph, m, id);
    if (id === 'place') {
      c2.fillStyle = 'rgba(255,255,255,0.85)';
      Art.roundRect(c2, 8, ph - 34, pw - 16, 26, 8);
      c2.fill();
      c2.fillStyle = '#2f3a2a';
      c2.font = '13px sans-serif';
      c2.textAlign = 'center';
      c2.textBaseline = 'middle';
      c2.fillText(field.place.name, pw / 2, ph - 21);
    }
    card.querySelector('.feat').textContent = featureText(m, id);
  };
  for (const t of TABS) {
    const b = document.createElement('button');
    b.textContent = t.name;
    b.dataset.tab = t.id;
    b.onclick = () => show(t.id);
    tabs.append(b);
  }
  const choices = card.querySelector('.choices');
  for (const s of SPECIES) {
    const b = document.createElement('button');
    b.textContent = s.name;
    b.onclick = () => answer(s.id);
    choices.append(b);
  }
  addButtons(card.querySelector('.btns'), [{ label: '図鑑を見る', onClick: () => showDex(() => identify(tab)) }, { label: 'あとで (そっとしておく)', onClick: leaveField }]);
  show(tab);
}

function answer(spId) {
  const m = field.m, sp = SP[m.sp], ok = spId === m.sp;
  const first = ok && !game.dex[m.sp].ided;
  if (ok) game.dex[m.sp].ided = true;
  save();
  const keys = (s) => `<ul>${s.keys.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>`;
  let html;
  if (ok) {
    html = `<p class="big">正解！ ${esc(sp.name)}だ。</p>${first ? '<p>図鑑に★がついた。</p>' : ''}<p class="sub">見分けるポイント</p>${keys(sp)}`;
  } else {
    html = `<p class="big">ちがうみたい…</p><p>正しくは<b>${esc(sp.name)}</b>。</p><p class="sub">${esc(sp.name)}の見分けるポイント</p>${keys(sp)}
      <p class="sub">${esc(SP[spId].name)}の見分けるポイント</p>${keys(SP[spId])}`;
  }
  const btns = [];
  if (freeSlot() >= 0) btns.push({ label: '連れて帰って育てる', cls: 'next', onClick: () => buildCase(m, null, (setup) => { placeMantis(m, setup); leaveField(); }) });
  else html += '<p class="sub">棚がいっぱいなので、連れて帰れない。</p>';
  btns.push({ label: 'そっとしておく', onClick: leaveField });
  modal(ok ? '見分けられた！' : '見分けられなかった', html, btns);
}

function identifyEgg() {
  const egg = OOTHECAE.find((o) => o.id === field.find.egg);
  const card = openModal();
  card.innerHTML = `<h2>どのカマキリの卵鞘？<small>OOTHECA</small></h2><div class="panelBox"></div>
    <p class="feat">${esc(regionName(field.place.region))}の${esc(field.place.name)}で見つけた。</p><div class="choices"></div><div class="btns"></div>`;
  const pw = Math.min(340, window.innerWidth - 80), ph = Math.round(pw * 0.56);
  const { cv, c2 } = makeCanvas(pw, ph);
  Art.panelOotheca(c2, pw, ph, egg.shape);
  card.querySelector('.panelBox').append(cv);
  for (const o of OOTHECAE) {
    const b = document.createElement('button');
    b.textContent = o.name;
    b.onclick = () => {
      const ok = o.id === egg.id;
      if (ok) game.eggDex[egg.id].ided = true;
      save();
      const html = `<p class="big">${ok ? '正解！' : 'ちがうみたい…'}</p><p>これは<b>${esc(egg.name)}</b>。</p>
        <p class="sub">マエモンカマキリの卵鞘はオオカマキリのと似ているが、全体的にオオカマキリよりやや丸っこい。マエモンカマキリは南西諸島に生息していて、オオカマキリは沖縄には生息していない。</p>`;
      modal(ok ? '見分けられた！' : '見分けられなかった', html, [
        { label: '連れて帰る (春に幼虫が生まれる)', cls: 'next', onClick: () => { game.eggs.push({ kind: egg.id }); say(`${egg.name}を連れて帰った。`); save(); leaveField(); } },
        { label: 'そっとしておく', onClick: leaveField },
      ]);
    };
    card.querySelector('.choices').append(b);
  }
  addButtons(card.querySelector('.btns'), [{ label: '図鑑を見る', onClick: () => showDex(identifyEgg) }, { label: 'あとで (そっとしておく)', onClick: leaveField }]);
}

/* ---------------- 飼育ケースを用意する ---------------- */
function buildCase(m, initial, done) {
  const setup = { kind: 'plastic', size: 'S', feet: 'none', lid: 'plain', stand: 'yoko', lidNet: false, feed: 'direct', soil: false, ...(initial || {}) };
  const card = openModal();
  card.innerHTML = `<h2>飼育ケースを用意する<small>${esc(SP[m.sp].name)}・体長 約${len(m)}mm</small></h2>
    <div class="panelBox"></div><p class="feat"></p><div class="opts"></div><div class="btns sticky"></div>`;
  const pw = Math.min(340, window.innerWidth - 80), ph = Math.round(pw * 0.66);
  const { cv, c2 } = makeCanvas(pw, ph);
  card.querySelector('.panelBox').append(cv);
  modalAnim = {
    draw: () => {
      c2.clearRect(0, 0, pw, ph);
      c2.fillStyle = '#efe7d4';
      c2.fillRect(0, 0, pw, ph);
      c2.fillStyle = '#c9a97a';
      c2.fillRect(0, ph - 12, pw, 12);
      Art.cage(c2, { x: pw * 0.1, y: ph * 0.06, w: pw * 0.8, h: ph * 0.94 - 12 }, setup, { look: look(m), len: len(m) }, { T, seed: 5 });
    },
  };
  const opts = card.querySelector('.opts');
  const group = (title, items, key, note) => {
    const g = document.createElement('div');
    g.className = 'optGroup';
    g.innerHTML = `<h3>${title}</h3><div class="optBtns"></div>${note ? `<p class="sub">${esc(note)}</p>` : ''}`;
    for (const it of items) {
      const b = document.createElement('button');
      b.textContent = it.name;
      b.setAttribute('aria-pressed', String(setup[key] === it.id));
      b.onclick = () => { setup[key] = it.id; render(); };
      g.querySelector('.optBtns').append(b);
    }
    opts.append(g);
  };
  const feat = card.querySelector('.feat');
  const render = () => {
    opts.innerHTML = '';
    const c = CASE[setup.kind];
    group('ケース', CASES.map((x) => ({ id: x.id, name: x.short })), 'kind', c.text);
    if (c.stand) {
      group('ケースの大きさ', CASE_SIZES, 'size');
      group('置き方', [{ id: 'yoko', name: '横置き' }, { id: 'tate', name: '縦置き' }], 'stand', STAND_TEXT[setup.stand]);
    }
    if (c.feet) group('足場', FEETS_LABELED, 'feet', FOOT[setup.feet].text);
    if (c.stand) {
      group('フタにネット', [{ id: false, name: 'はさまない' }, { id: true, name: 'はさむ' }], 'lidNet', setup.lidNet ? LID_NET_TEXT : '');
      group('エサの与え方', FEEDS, 'feed', FEED[setup.feed].text);
    }
    if (c.lids) group('フタと足場', LIDS, 'lid', LID[setup.lid].text);
    if (c.soil) group('土', [{ id: false, name: '入れない' }, { id: true, name: '入れる' }], 'soil');
    // いまの組み合わせだとどうなるか
    const t = { ...m, setup: { ...setup } };
    const notes = [];
    if (c.stand) {
      notes.push(m.stage < ADULT ? `高さ 約${roofMM(setup)}mm (次の脱皮に 約${needRoof(t)}mm ほしい)` : `高さ 約${roofMM(setup)}mm`);
      const w = watchReason(setup);
      notes.push(w ? 'エサ: 見張りが必要' : 'エサ: 見張らなくていい');
    }
    notes.push(`つかまりやすさ ${'●'.repeat(gripOf(t))}${'○'.repeat(3 - gripOf(t))}`);
    feat.textContent = notes.join(' / ');
  };
  render();
  addButtons(card.querySelector('.btns'), [{ label: 'これでOK', cls: 'next', onClick: () => done({ ...setup }) }]);
}
const FEETS_LABELED = FEET.map((f) => ({ id: f.id, name: f.id === 'none' ? 'なし' : f.name }));

/* ---------------- ケースを見る ---------------- */
function openCase(i) {
  const m = game.shelf[i];
  if (!m) return;
  const sp = SP[m.sp], c = CASE[m.setup.kind];
  const card = openModal();
  const visible = c.see > 0;
  const iss = issues(m);
  // 脱皮に失敗した週は、げんきがまだ高くても失敗したことがわかるようにする
  const healthText = m.moltFail && m.health >= 40 ? '脱皮に失敗して、少し弱っている' : m.health >= 70 ? '元気そう' : m.health >= 40 ? 'ちょっと元気がない' : 'かなり弱っている';
  card.innerHTML = `<h2>No.${m.no} ${esc(sp.name)}<small>${esc(STAGES[m.stage].name)}・体長 約${len(m)}mm</small></h2>
    <div class="panelBox"></div>
    <p class="sub">${esc(setupText(m.setup))}</p>
    ${visible ? `<p>ようす: <b>${healthText}</b>${m.stage >= ADULT ? (m.raised ? '・成虫まで育った' : '') : ''}</p>
      <h3>気になること</h3>${iss.length ? `<ul>${iss.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>` : '<p>とくにない。落ち着いてすごしている。</p>'}`
      : '<p>洗濯ネットごしで、中のようすがよく見えない。全体がメッシュなので脱皮はしやすい。</p>'}
    ${c.see === 1 ? '<p class="sub">メッシュで観察しにくいけど、1面が透明なのでそこから見える。</p>' : ''}
    ${game.season === WINTER ? '' : `<p>エサ: <b>${m.fed ? '今週はもう食べた' : 'まだ食べていない'}</b>${!m.fed && watchReason(m.setup) ? '・見張りが必要' : ''}</p>`}
    <p class="sub">${esc(m.from)}</p><div class="btns"></div>`;
  const pw = Math.min(340, window.innerWidth - 80), ph = Math.round(pw * 0.66);
  const { cv, c2 } = makeCanvas(pw, ph);
  card.querySelector('.panelBox').append(cv);
  modalAnim = {
    draw: () => {
      c2.clearRect(0, 0, pw, ph);
      c2.fillStyle = '#efe7d4';
      c2.fillRect(0, 0, pw, ph);
      c2.fillStyle = '#c9a97a';
      c2.fillRect(0, ph - 12, pw, 12);
      Art.cage(c2, { x: pw * 0.1, y: ph * 0.06, w: pw * 0.8, h: ph * 0.94 - 12 }, m.setup, { look: look(m), len: len(m) }, { T, seed: m.no });
    },
  };
  const feedBtn = game.season !== WINTER && !m.fed ? [{
    label: watchReason(m.setup) ? '見張ってエサをあげる' : 'エサをあげる', cls: 'next',
    onClick: () => {
      if (watchReason(m.setup)) { feedWatch(i, () => openCase(i)); return; }
      m.fed = true;
      say(feedLine(m));
      save();
      openCase(i);
    },
  }] : [];
  addButtons(card.querySelector('.btns'), [
    ...feedBtn,
    { label: 'ケースを作りなおす', onClick: () => buildCase(m, m.setup, (setup) => { m.setup = setup; say(`No.${m.no}のケースを作りなおした (${setupText(setup)})。`); save(); openCase(i); }) },
    { label: 'とじる' },
  ]);
}

/* ---------------- 図鑑 ---------------- */
function showDex(back) {
  const card = openModal();
  const mark = (d) => `${d.ided ? '★' : d.seen ? '・' : '　'}${d.raised ? ' 🏅' : ''}${d.wintered ? ' ❄' : ''}`;
  card.innerHTML = `<h2>カマキリ図鑑<small>★見分けた 🏅成虫まで育てた ❄幼虫で冬を越した</small></h2><div class="dex"></div>
    <h3>卵鞘</h3><div class="dexEggs"></div><h3>飼い方メモ</h3><div class="dexCare"></div><div class="btns"></div>`;
  const dex = card.querySelector('.dex');
  for (const s of SPECIES) {
    const d = game ? game.dex[s.id] : { seen: false, ided: false };
    const det = document.createElement('details');
    const lenText = s.lenNote === undefined ? `体長 約${s.len[0]}〜${s.len[1]}mm` : s.lenNote;
    det.innerHTML = `<summary><span class="mk">${mark(d)}</span><b>${esc(s.name)}</b> <small>${[s.sci ? `<i>${esc(s.sci)}</i>` : '', esc(lenText)].filter(Boolean).join('・')}</small></summary>
      ${s.family ? `<p class="sub">${esc(s.family)}</p>` : ''}${s.text.map((t) => `<p>${esc(t)}</p>`).join('')}
      <p class="sub">見分けるポイント: ${s.keys.map(esc).join(' / ')}</p>`;
    dex.append(det);
  }
  card.querySelector('.dexEggs').innerHTML = OOTHECAE.map((o) => {
    const d = game ? game.eggDex[o.id] : { seen: false, ided: false };
    return `<p><span class="mk">${d.ided ? '★' : d.seen ? '・' : '　'}</span><b>${esc(o.name)}</b>: ${esc(o.note)}</p>`;
  }).join('');
  card.querySelector('.dexCare').innerHTML = [
    ...CASES.map((c) => `<details><summary><b>${esc(c.name)}</b></summary><p>${esc(c.text)}</p></details>`),
    ...FEET.filter((f) => f.id !== 'none').map((f) => `<details><summary><b>足場: ${esc(f.name)}</b></summary><p>${esc(f.text)}</p></details>`),
    `<details><summary><b>プラカップのフタ</b></summary>${LIDS.map((l) => `<p>${esc(l.name)}: ${esc(l.text)}</p>`).join('')}</details>`,
    `<details><summary><b>縦置きと横置き</b></summary><p>プラスチック製飼育ケースを使う場合、縦置きと横置きがあります。カマキリは脱皮に高さが必要で、プラケースのサイズによっては高さが確保しにくいこともあるので縦置きが適している場合が多いです。</p>
      <p>縦置き: ${esc(STAND_TEXT.tate)}</p><p>横置き: ${esc(STAND_TEXT.yoko)}</p><p>${esc(LID_NET_TEXT)}</p></details>`,
    `<details><summary><b>エサの与え方</b></summary><p>エサの虫はレッドローチやコオロギ。</p>${FEEDS.map((f) => `<p>${esc(f.name)}: ${esc(f.text)}</p>`).join('')}
      <p>縦置きと横置きは、使うケースの大きさや足場、餌の与え方などの目的に適しているのを選びましょう。</p></details>`,
  ].join('');
  addButtons(card.querySelector('.btns'), [{ label: 'とじる', onClick: back }]);
}

/* ---------------- タイトル ---------------- */
function titleScreen() {
  scene = 'title';
  showHUD(false);
  $('fieldUI').classList.add('hidden');
  const saved = load();
  const btns = [];
  if (saved) btns.push({ label: 'つづきから', cls: 'next', onClick: () => resume(saved) });
  btns.push({ label: 'はじめから', onClick: saved ? confirmNew : startNew });
  btns.push({ label: '図鑑を見る', onClick: () => { game = saved; showDex(titleScreen); } });
  modal('カマキリ採集飼育帳<small>MANTIS FIELD</small>',
    '<p>いろいろな場所でカマキリをさがして、種類を見分けよう。連れて帰ったら、ケースと足場と置き方を選んで飼育ケースを用意し、エサをあげて成虫まで育てよう。</p>', btns);
  $('modal').classList.add('low');
}

function confirmNew() {
  modal('はじめから', '<p>いまの記録 (図鑑も) は消える。いい？</p>', [{ label: 'はじめから遊ぶ', onClick: startNew }, { label: 'やめる', onClick: titleScreen }]);
}

function startNew() {
  game = newGame();
  save();
  scene = 'shelf';
  showHUD(true);
  say(`${dateText()}。`);
  modal('1年目の春<small>SPRING</small>', '<p>カマキリをさがしに行こう。見つけたら種類を見分けて、飼育ケースを用意して育てよう。</p><p class="sub">1週間に1回、さがしに行ける。エサは1週間に1回あげる。ケースの棚には6つまで置ける。冬が来る前に成虫まで育てよう。</p>');
}

function resume(saved) {
  game = saved;
  scene = 'shelf';
  showHUD(true);
  renderHUD();
  if (game.season > WINTER) yearEnd();
  else if (game.field) enterField(game.field);
  else if (game.hatchQueue && game.hatchQueue.length) hatchNext();
}

/* ---------------- 画面の部品 ---------------- */
function openModal() {
  modalAnim = null;
  $('modal').classList.remove('hidden', 'low');
  const card = $('modalCard');
  card.innerHTML = '';
  card.scrollTop = 0;
  return card;
}
function closeModal() { modalAnim = null; $('modal').classList.add('hidden'); }

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

function showHUD(on) { $('hud').classList.toggle('hidden', !on); }

function renderHUD() {
  if (!game) return;
  $('mDate').textContent = dateText();
  $('mStars').textContent = `図鑑★ ${starCount()}/${SPECIES.length}`;
  $('mEggs').textContent = `卵鞘 ${game.eggs.length}`;
  $('mEggs').classList.toggle('hidden', !game.eggs.length);
  $('log').innerHTML = game.log.slice(-3).map((t) => `<p>${esc(t)}</p>`).join('');
  const sb = document.querySelector('#actions [data-act="search"]');
  sb.disabled = game.searched;
  sb.querySelector('small').textContent = game.searched ? '今週は行った' : 'さがしに行く';
  const hungry = game.season !== WINTER && game.shelf.some((m) => m && !m.fed);
  document.querySelector('#actions [data-act="feed"]').classList.toggle('due', hungry);
}

/* ---------------- 描画 ---------------- */
let cells = [];

function shelfLayout() {
  let top = 20, bottom = H - 20;
  if (!$('hud').classList.contains('hidden')) {
    top = $('top').getBoundingClientRect().bottom + 8;
    bottom = $('log').getBoundingClientRect().top - 6;
  } else if ($('modal').classList.contains('low')) {
    bottom = $('modalCard').getBoundingClientRect().top - 6;
  }
  const availW = Math.min(W - 16, 900), availH = Math.max(120, bottom - top);
  const cols = availW / availH > 1.1 ? 3 : 2, rows = SHELF_SLOTS / cols;
  const cw = availW / cols, ch = availH / rows, board = Math.max(8, ch * 0.07);
  const x0 = (W - availW) / 2;
  const out = [];
  for (let i = 0; i < SHELF_SLOTS; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    out.push({ x: x0 + c * cw + cw * 0.08, y: top + r * ch + ch * 0.08, w: cw * 0.84, h: ch * 0.92 - board, board, row: r });
  }
  return { cells: out, cols, rows, top, ch, x0, availW };
}

const DEMO = [
  { sp: 'oo', stage: 3, color: '#7cb342', adultLen: 85, setup: { kind: 'plastic', size: 'L', feet: 'hachi', stand: 'tate', feed: 'dish' } },
  { sp: 'koka', stage: 2, color: '#a1804f', adultLen: 50, setup: { kind: 'mesh' } },
  { sp: 'hina', stage: 3, color: '#6b4f33', adultLen: 15, setup: { kind: 'cup', lid: 'drainTop' } },
  { sp: 'harabiro', stage: 3, color: '#7cb342', adultLen: 60, bumpsL: 3, bumpsR: 3, setup: { kind: 'plastic', feet: 'drain', stand: 'yoko' } },
  null,
  { sp: 'satsuma', stage: 1, color: '#8c8a58', adultLen: 30, setup: { kind: 'cup', lid: 'flipWood' } },
];

function drawShelf() {
  const L = shelfLayout();
  cells = L.cells;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f1ece0');
  g.addColorStop(1, '#e3dac6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const list = scene === 'title' || !game ? DEMO : game.shelf;
  for (let r = 0; r < L.rows; r++) {
    const y = L.top + (r + 1) * L.ch - L.cells[0].board;
    ctx.fillStyle = '#b48a58';
    ctx.fillRect(L.x0 - 4, y, L.availW + 8, L.cells[0].board);
    ctx.fillStyle = '#8f6a3f';
    ctx.fillRect(L.x0 - 4, y + L.cells[0].board - 3, L.availW + 8, 3);
  }
  L.cells.forEach((cell, i) => {
    const m = list[i];
    if (!m) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(120,100,70,0.45)';
      ctx.lineWidth = 2;
      Art.roundRect(ctx, cell.x + cell.w * 0.2, cell.y + cell.h * 0.3, cell.w * 0.6, cell.h * 0.7, 10);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(120,100,70,0.6)';
      ctx.font = `${Math.max(11, cell.w * 0.07)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('あき', cell.x + cell.w / 2, cell.y + cell.h * 0.65);
      return;
    }
    const demo = list === DEMO;
    const c = CASE[m.setup.kind];
    let mark = null;
    if (!demo) mark = c.see === 0 ? '#b8b8b0' : m.health >= 70 ? '#5cb85c' : m.health >= 40 ? '#f0ad4e' : '#d9534f';
    const tags = [];
    if (m.shed) tags.push(['脱皮した！', '#b5476a']);
    if (!demo && !m.fed && game.season !== WINTER) tags.push(['エサまだ', '#b06a12']);
    Art.cage(ctx, cell, m.setup, { look: look(m), len: len(m) }, { T: T + i * 1.3, seed: i + 3, label: demo ? `${[14, 7, 3, 13, 0, 5][i]}` : `No.${m.no}`, mark, tags });
  });
}

function drawField() {
  const f = field;
  ctx.save();
  const perch = Art.field(ctx, W, H, f.place.id, T, f.seed);
  ctx.restore();
  if (f.m) {
    const L = len(f.m);
    const px = Math.min(W * 0.62, H * 0.55) * (0.35 + 0.65 * Math.min(1, L / 105));
    const s = px / Art.BODY_UNITS;
    ctx.save();
    ctx.translate(perch.x, perch.y);
    ctx.rotate(perch.angle);
    Art.mantis(ctx, px * 0.1, 0, s, { ...look(f.m), t: T, aim: Math.sin(T * 0.6) * 0.3 });
    ctx.restore();
  } else if (f.find.egg) {
    const egg = OOTHECAE.find((o) => o.id === f.find.egg);
    Art.ootheca(ctx, perch.x, perch.y + Math.min(W, H) * 0.06, Math.min(W, H) * 0.08, egg.shape);
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
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame); // 描画中にエラーが出ても、次のフレームは止めない
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  T += dt;
  ctx.clearRect(0, 0, W, H);
  if (scene === 'field' && field) drawField();
  else drawShelf();
  if (modalAnim && !$('modal').classList.contains('hidden')) modalAnim.draw();
}

/* ---------------- 入力 ---------------- */
const ACTIONS = { search: actSearch, feed: actFeed, dex: () => showDex(), next: actNext };
document.querySelectorAll('#actions button').forEach((b) => b.addEventListener('click', () => {
  if (game && scene === 'shelf') ACTIONS[b.dataset.act]();
}));
canvas.addEventListener('pointerdown', (e) => {
  if (scene !== 'shelf' || !game || !$('modal').classList.contains('hidden')) return;
  const i = cells.findIndex((c) => e.clientX >= c.x && e.clientX <= c.x + c.w && e.clientY >= c.y && e.clientY <= c.y + c.h + c.board);
  if (i >= 0) openCase(i);
});
window.addEventListener('resize', resize);

resize();
titleScreen();
requestAnimationFrame(frame);
