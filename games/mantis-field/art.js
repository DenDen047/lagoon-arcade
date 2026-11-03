'use strict';
/* カマキリ採集飼育帳 — 絵。画像ファイルは使わず、すべて canvas の図形で描く。
   カマキリは「体長 100」の座標で描く (頭から腹の先までが約 85)。足が乗る線が y = 0、頭が +x 側、上が -y。 */

const Art = (() => {
  const lerp = (a, b, k) => a + (b - a) * k;
  const BODY_UNITS = 85;   // 体長 100 の座標で、頭から腹の先までの長さ

  /* ---------- 色 ---------- */
  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
  }
  function mix(a, b, k) {
    const x = hexToRgb(a), y = hexToRgb(b);
    return rgbToHex(lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k));
  }
  const shade = (c, k) => (k < 0 ? mix(c, '#1a1a10', -k) : mix(c, '#fffbea', k));
  function palette(c) { return { body: c, dark: shade(c, -0.38), light: shade(c, 0.32), eye: shade(c, 0.18) }; }
  const GHOST = { body: 'rgba(236,226,196,0.55)', dark: 'rgba(205,190,150,0.55)', light: 'rgba(250,244,226,0.55)', eye: 'rgba(236,226,196,0.6)' };

  // 体の色の名前 → 色。コカマキリの褐色型は濃い茶色からクリーム色まで個体ごとに変える
  const BASE = { green: '#7cb342', brown: '#a1804f', pale: '#b7c784', darkBrown: '#6b4f33', satsuma: '#8c8a58' };
  function bodyColor(kind, k) {
    if (kind === 'koka') return mix('#5b3f27', '#d9c49b', k);
    if (kind === 'kokaGreen') return '#8fae55';
    return BASE[kind] || BASE.green;
  }
  const COXA_COLOR = { yellow: '#f3d23a', orange: '#f08a24', cream: '#f4ebcc' };

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- カマキリ ---------- */
  const HEAD = { x: 29, y: -44 };
  const COXA = { x: 23, y: -36 };
  const ARM_REST = [1.3, -1.2, 1.95];
  const ARM_LEN = [12, 17, 11];

  // 太さの変わる棒 (脚・胸)
  function limb(ctx, x0, y0, x1, y1, w0, w1, fill) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d;
    const a = Math.atan2(ny, nx);
    ctx.beginPath();
    ctx.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2);
    ctx.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
    ctx.arc(x1, y1, w1 / 2, a, a - Math.PI, true);
    ctx.lineTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2);
    ctx.arc(x0, y0, w0 / 2, a - Math.PI, a - 2 * Math.PI, true);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // 葉のような形 (サツマヒメカマキリの脚のヒレ)
  function lobe(ctx, x0, y0, x1, y1, w, fill, edge) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d * w, ny = dx / d * w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx + nx, my + ny, x1, y1);
    ctx.quadraticCurveTo(mx + nx * 0.2, my + ny * 0.2, x0, y0);
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  function leg(ctx, hip, knee, foot, col, w, flap, edge) {
    limb(ctx, hip[0], hip[1], knee[0], knee[1], w, w * 0.85, col);
    limb(ctx, knee[0], knee[1], foot[0], foot[1], w * 0.8, w * 0.6, col);
    limb(ctx, foot[0], foot[1], foot[0] + 4, foot[1] + 0.2, w * 0.5, w * 0.4, col);
    if (flap) {
      lobe(ctx, lerp(hip[0], knee[0], 0.3), lerp(hip[1], knee[1], 0.3), lerp(hip[0], knee[0], 0.92), lerp(hip[1], knee[1], 0.92), 7, col, edge);
      lobe(ctx, lerp(knee[0], foot[0], 0.12), lerp(knee[1], foot[1], 0.12), lerp(knee[0], foot[0], 0.55), lerp(knee[1], foot[1], 0.55), -5, col, edge);
    }
  }

  function armPoints(angles) {
    let x = COXA.x, y = COXA.y;
    const pts = [[x, y]];
    for (let i = 0; i < 3; i++) {
      x += Math.cos(angles[i]) * ARM_LEN[i];
      y += Math.sin(angles[i]) * ARM_LEN[i];
      pts.push([x, y]);
    }
    return pts;
  }

  // 前脚 (カマ)。手前の脚には、付け根の色・イボ状突起・白と黒の模様を描く
  function arm(ctx, pts, col, spine, near, o) {
    limb(ctx, pts[0][0], pts[0][1], pts[1][0], pts[1][1], 4.6, 4, col);
    if (near && o.sp && !o.ghost) coxaMark(ctx, pts, o);
    limb(ctx, pts[1][0], pts[1][1], pts[2][0], pts[2][1], 4.4, 3.6, col);
    limb(ctx, pts[2][0], pts[2][1], pts[3][0], pts[3][1], 2.6, 1.6, col);
    const fx = pts[2][0] - pts[1][0], fy = pts[2][1] - pts[1][1], fl = Math.hypot(fx, fy);
    const ux = fx / fl, uy = fy / fl, nx = uy, ny = -ux;
    if (near && o.sp && o.sp.armPattern && !o.ghost) {
      // コカマキリ: 前脚に白と黒の模様
      ctx.beginPath();
      ctx.ellipse(pts[1][0] + fx * 0.45, pts[1][1] + fy * 0.45, 3.2, 1.6, Math.atan2(fy, fx), 0, Math.PI * 2);
      ctx.fillStyle = '#1d1a16';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(pts[1][0] + fx * 0.72, pts[1][1] + fy * 0.72, 2.2, 1.3, Math.atan2(fy, fx), 0, Math.PI * 2);
      ctx.fillStyle = '#f7f4ea';
      ctx.fill();
    }
    ctx.fillStyle = spine;
    for (let i = 1; i <= 4; i++) {
      const k = i / 5, bx = pts[1][0] + fx * k, by = pts[1][1] + fy * k;
      ctx.beginPath();
      ctx.moveTo(bx - ux * 0.9 - nx * 1.6, by - uy * 0.9 - ny * 1.6);
      ctx.lineTo(bx - nx * 3.6, by - ny * 3.6);
      ctx.lineTo(bx + ux * 0.9 - nx * 1.6, by + uy * 0.9 - ny * 1.6);
      ctx.fill();
    }
    const tx = pts[3][0] - pts[2][0], ty = pts[3][1] - pts[2][1], tl = Math.hypot(tx, ty);
    limb(ctx, pts[3][0], pts[3][1], pts[3][0] + tx / tl * 2.5 + ty / tl * 2, pts[3][1] + ty / tl * 2.5 - tx / tl * 2, 1.4, 0.6, col);
  }

  function coxaMark(ctx, pts, o) {
    const sp = o.sp, ind = o.ind || {};
    const ax = pts[0][0], ay = pts[0][1], bx = pts[1][0], by = pts[1][1];
    const ang = Math.atan2(by - ay, bx - ax);
    if (sp.coxa) {
      ctx.beginPath();
      ctx.ellipse(lerp(ax, bx, 0.3), lerp(ay, by, 0.3), 3.6, 1.9, ang, 0, Math.PI * 2);
      ctx.fillStyle = COXA_COLOR[sp.coxa];
      ctx.fill();
    } else if (sp.bumps === 'yellow') {
      const n = ind.bumpsR || 3;
      ctx.fillStyle = '#f3d23a';
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc(lerp(ax, bx, 0.18 + 0.62 * i / Math.max(1, n - 1)) + 1.4, lerp(ay, by, 0.18 + 0.62 * i / Math.max(1, n - 1)), 0.95, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (sp.bumps === 'small') {
      ctx.fillStyle = '#f3d23a';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(lerp(ax, bx, 0.15 + 0.17 * i) + 1.4, lerp(ay, by, 0.15 + 0.17 * i), 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (sp.bumps === 'none') {
      ctx.beginPath();
      ctx.ellipse(lerp(ax, bx, 0.4), lerp(ay, by, 0.4), 4.2, 1.7, ang, 0, Math.PI * 2);
      ctx.fillStyle = '#e4ebef';
      ctx.fill();
    }
  }

  function bez(p0, c, p1, t) {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
  }

  // おなか。幼虫はおなかを上に反らせる
  function abdomen(ctx, o, pal) {
    const adult = o.stage >= 3;
    const p0 = [1, -17];
    const c = adult ? [-24, -20] : [-26, -19];
    const p1 = adult ? [-49, -13] : [-32 - o.stage * 2, -16 - 30 * (1 - o.stage * 0.12)];
    let maxW = adult ? 12 : 8 + o.stage;
    if (o.sp && o.sp.wide) maxW *= 1.35;
    const N = 16, left = [], right = [], mids = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = bez(p0, c, p1, t);
      const q = bez(p0, c, p1, Math.min(1, t + 0.01));
      const r = bez(p0, c, p1, Math.max(0, t - 0.01));
      const dx = q[0] - r[0], dy = q[1] - r[1], d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d, ny = dx / d;
      const w = maxW * (t < 0.35 ? lerp(0.7, 1, t / 0.35) : lerp(1, 0.25, (t - 0.35) / 0.65)) / 2;
      left.push([p[0] + nx * w, p[1] + ny * w]);
      right.push([p[0] - nx * w, p[1] - ny * w]);
      mids.push({ p, nx, ny, w });
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const p of left) ctx.lineTo(p[0], p[1]);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fillStyle = pal.body;
    ctx.fill();
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 0.7;
    for (let i = 1; i <= 7; i++) {
      const m = mids[Math.round((0.06 + 0.86 * i / 8) * N)];
      ctx.beginPath();
      ctx.moveTo(m.p[0] + m.nx * m.w * 0.95, m.p[1] + m.ny * m.w * 0.95);
      ctx.lineTo(m.p[0] - m.nx * m.w * 0.95, m.p[1] - m.ny * m.w * 0.95);
      ctx.stroke();
    }
    const tip = mids[N].p, pre = mids[N - 1].p;
    const tx = tip[0] - pre[0], ty = tip[1] - pre[1], tl = Math.hypot(tx, ty) || 1;
    limb(ctx, tip[0], tip[1], tip[0] + tx / tl * 4 - ty / tl * 1.5, tip[1] + ty / tl * 4 + tx / tl * 1.5, 1, 0.4, pal.dark);
  }

  // 翅。成虫は前翅でおなかを覆う。ヒナカマキリは翅が小さい。大きい幼虫は翅のもと (翅芽) だけ
  function wing(ctx, o, pal) {
    const root = [9, -23];
    const adult = o.stage >= 3;
    let tail = [-46, -18], w = 10;
    if (!adult) { tail = [-4, -21]; w = 5; }
    else if (o.sp && o.sp.wings === 'short') { tail = [-9, -22]; w = 6; }
    const mx = (root[0] + tail[0]) / 2, my = (root[1] + tail[1]) / 2;
    ctx.beginPath();
    ctx.moveTo(root[0], root[1]);
    ctx.quadraticCurveTo(mx, my - w, tail[0], tail[1]);
    ctx.quadraticCurveTo(mx, my + w * 0.35, root[0], root[1]);
    ctx.closePath();
    ctx.fillStyle = adult ? pal.body : pal.light;
    ctx.fill();
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    if (adult && o.sp && o.sp.spots && !o.ghost && o.sp.wings !== 'short') {
      // 前翅の白い紋
      ctx.beginPath();
      ctx.ellipse(-6, -26.5, 2.6, 1.5, -0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#fbfbf2';
      ctx.fill();
    }
  }

  function head(ctx, o, pal) {
    ctx.save();
    ctx.translate(HEAD.x, HEAD.y);
    ctx.rotate((o.aim || 0) * 0.7);
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 0.7;
    const sway = Math.sin((o.t || 0) * 2.1) * 2;
    ctx.beginPath();
    ctx.moveTo(1, -6);
    ctx.quadraticCurveTo(10, -22, 22 + sway, -28);
    ctx.moveTo(-1, -6);
    ctx.quadraticCurveTo(5, -22, 13 + sway * 0.7, -32);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6.5, -3);
    ctx.quadraticCurveTo(0, -9, 7.5, -4);
    ctx.quadraticCurveTo(7, 1, 3.5, 6.5);
    ctx.quadraticCurveTo(-2, 4, -6.5, -3);
    ctx.fillStyle = pal.body;
    ctx.fill();
    limb(ctx, 3, 5.5, 5.5, 8, 0.9, 0.5, pal.dark);
    ctx.beginPath();
    ctx.ellipse(3.4, -3.6, 3.6, 3.2, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = pal.eye;
    ctx.fill();
    if (!o.ghost) {
      ctx.beginPath();
      ctx.arc(4.4, -3.3, 1.05, 0, Math.PI * 2);
      ctx.fillStyle = '#1b1b14';
      ctx.fill();
    }
    ctx.restore();
  }

  /* カマキリを1匹描く。x, y は足が乗る線の位置、s は「体長 100」を何 px で描くか。
     o: { stage (0〜3), color (色), sp (種のデータ), ind (個体の特徴), aim, t, ghost } */
  function mantis(ctx, x, y, s, o) {
    const pal = o.ghost ? GHOST : palette(o.color || BASE.green);
    const flap = !!(o.sp && o.sp.flaps);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    if (o.sp && o.sp.slender) ctx.scale(1.08, 0.86);
    leg(ctx, [6, -17], [13, -26], [16, 0], pal.dark, 2, flap, pal.dark);
    leg(ctx, [-1, -17], [-8, -27], [-15, 0], pal.dark, 2, flap, pal.dark);
    const armA = ARM_REST.map((v, i) => v + (i === 0 ? (o.aim || 0) * 0.1 : 0));
    const pts = armPoints(armA);
    ctx.save();
    ctx.translate(-1.5, -0.8);
    arm(ctx, pts, pal.dark, pal.dark, false, o);
    ctx.restore();
    abdomen(ctx, o, pal);
    if (o.stage >= 2) wing(ctx, o, pal);
    limb(ctx, -1, -17, 10, -20, 7, 6, pal.body);
    leg(ctx, [7, -16], [17, -27], [24, 0], pal.body, 2.3, flap, pal.dark);
    leg(ctx, [0, -16], [-13, -28], [-24, 0], pal.body, 2.3, flap, pal.dark);
    limb(ctx, 9, -20, 25, -39, 4.6, 5.6, pal.body);
    limb(ctx, 10, -21.5, 24, -38.5, 1, 1, pal.light);
    head(ctx, o, pal);
    arm(ctx, pts, pal.body, pal.dark, true, o);
    ctx.restore();
  }

  /* 卵鞘。shape: 'oo' (オオカマキリ) / 'round' (マエモンカマキリ、全体的にやや丸っこい)。x, y は中心、r は大きさ */
  function ootheca(ctx, x, y, r, shape) {
    const rx = shape === 'round' ? r * 1.05 : r * 1.25, ry = shape === 'round' ? r * 0.95 : r * 0.82;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#d9c39a';
    ctx.fill();
    ctx.strokeStyle = '#a88c5c';
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.stroke();
    // 中央の筋と、横の層
    ctx.beginPath();
    ctx.moveTo(-rx * 0.85, -ry * 0.1);
    ctx.quadraticCurveTo(0, -ry * 0.35, rx * 0.85, -ry * 0.1);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.6, r * 0.03);
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * rx * 0.22, -ry * 0.25);
      ctx.quadraticCurveTo(i * rx * 0.24 + rx * 0.04, ry * 0.3, i * rx * 0.2, ry * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- 飼育ケース ---------- */
  // ケースの中の幅 (mm)。カマキリをどの大きさで描くかに使う
  const INNER_MM = { plastic: [180, 120], kobae: [180, 120], mesh: [200, 200], net: [220, 220], cup: [75, 75] };

  // ケースの外形。セルの中に収まる長方形を返す
  function caseBox(cell, setup) {
    let aspect = 1.4;
    if (setup.kind === 'plastic' || setup.kind === 'kobae') aspect = setup.stand === 'tate' ? 0.72 : 1.45;
    else if (setup.kind === 'mesh') aspect = 0.9;
    else if (setup.kind === 'net') aspect = 1.05;
    else if (setup.kind === 'cup') aspect = 0.78;
    let w = cell.w, h = w / aspect;
    if (h > cell.h) { h = cell.h; w = h * aspect; }
    if (setup.kind === 'cup') { w *= 0.62; h *= 0.62; }
    return { x: cell.x + (cell.w - w) / 2, y: cell.y + cell.h - h, w, h };
  }

  function grid(ctx, x, y, w, h, step, col, lw) {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let gx = x + step / 2; gx < x + w; gx += step) { ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); }
    for (let gy = y + step / 2; gy < y + h; gy += step) { ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); }
    ctx.stroke();
  }

  // 足場のシート。鉢底ネットは黒い格子、排水溝ネットは白くやわらかい網、木パッキンは木の削りくず
  function foothold(ctx, kind, x, y, w, h, seed) {
    if (kind === 'hachi') {
      ctx.save();
      roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.08);
      ctx.fillStyle = 'rgba(30,30,30,0.18)';
      ctx.fill();
      ctx.clip();
      grid(ctx, x, y, w, h, Math.max(4, Math.min(w, h) * 0.12), '#1f1f1f', Math.max(1.2, w * 0.03));
      ctx.restore();
    } else if (kind === 'drain') {
      ctx.save();
      roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = 'rgba(190,190,190,0.9)';
      ctx.lineWidth = 0.8;
      const st = Math.max(3, Math.min(w, h) * 0.07);
      ctx.beginPath();
      for (let k = -h; k < w + h; k += st) { ctx.moveTo(x + k, y); ctx.lineTo(x + k + h * 0.6, y + h); ctx.moveTo(x + k + h * 0.6, y); ctx.lineTo(x + k, y + h); }
      ctx.stroke();
      ctx.restore();
    } else if (kind === 'wood') {
      const R = rng(seed || 7);
      ctx.strokeStyle = '#c9a66b';
      ctx.lineWidth = Math.max(1, w * 0.025);
      for (let i = 0; i < 16; i++) {
        const sx = x + R() * w, sy = y + R() * h;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(sx + (R() - 0.5) * w * 0.6, sy + (R() - 0.5) * h * 0.6, sx + (R() - 0.5) * w * 0.6, sy + (R() - 0.5) * h * 0.6, x + R() * w, y + R() * h);
        ctx.stroke();
      }
    }
  }

  function soil(ctx, x, y, w, h, T, seed) {
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(x, y, w, h);
    const R = rng(seed || 3);
    ctx.fillStyle = '#87613f';
    for (let i = 0; i < 30; i++) ctx.fillRect(x + R() * w, y + R() * h, 1.5, 1.5);
    // コバエが増える
    ctx.fillStyle = '#26221d';
    for (let i = 0; i < 5; i++) {
      const ph = T * (1.3 + i * 0.3) + i * 2;
      ctx.beginPath();
      ctx.arc(x + w * (0.5 + 0.42 * Math.sin(ph)), y - h * (0.8 + 1.4 * Math.abs(Math.sin(ph * 1.7))), Math.max(1, w * 0.008), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ケースを1つ描く。cell はセルの長方形、setup = { kind, feet, lid, stand, soil }。
     who: { look (mantis に渡すもの), len (体長 mm) } か null。opts: { label, mark, seed, T } */
  function cage(ctx, cell, setup, who, opts) {
    opts = opts || {};
    const T = opts.T || 0;
    const b = caseBox(cell, setup);
    const k = setup.kind;
    const lid = setup.lid ? LID[setup.lid] : null;
    const feetKind = k === 'cup' ? (lid ? lid.feet : 'none') : (CASE[k].feet ? setup.feet : 'none');
    const flip = k === 'cup' && lid && lid.flip;
    const tate = setup.stand === 'tate';
    ctx.save();
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(b.x + b.w / 2, b.y + b.h, b.w * 0.52, Math.max(2, b.h * 0.03), 0, 0, Math.PI * 2);
    ctx.fill();

    // ケースの中の「場所」(カマキリが乗るところ)
    let inner = { x: b.x + b.w * 0.06, y: b.y + b.h * 0.1, w: b.w * 0.88, h: b.h * 0.84 };
    if (k === 'cup') {
      // 上が広い (逆さに置くと下が広い) カップ
      const top = flip ? 0.78 : 1, bot = flip ? 1 : 0.78;
      ctx.beginPath();
      ctx.moveTo(b.x + b.w * (1 - top) / 2, b.y + b.h * 0.08);
      ctx.lineTo(b.x + b.w * (1 + top) / 2, b.y + b.h * 0.08);
      ctx.lineTo(b.x + b.w * (1 + bot) / 2, b.y + b.h);
      ctx.lineTo(b.x + b.w * (1 - bot) / 2, b.y + b.h);
      ctx.closePath();
      ctx.fillStyle = 'rgba(225,240,245,0.45)';
      ctx.fill();
      ctx.strokeStyle = '#8fa9b4';
      ctx.lineWidth = Math.max(1.2, b.w * 0.02);
      ctx.stroke();
      inner = { x: b.x + b.w * 0.18, y: b.y + b.h * 0.16, w: b.w * 0.64, h: b.h * 0.78 };
    } else if (k === 'net') {
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h * 0.55, b.w * 0.5, b.h * 0.45, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(250,250,247,0.5)';
      ctx.fill();
      inner = { x: b.x + b.w * 0.15, y: b.y + b.h * 0.2, w: b.w * 0.7, h: b.h * 0.72 };
    } else {
      roundRect(ctx, b.x, b.y, b.w, b.h, Math.min(b.w, b.h) * 0.06);
      ctx.fillStyle = k === 'mesh' ? 'rgba(250,250,250,0.35)' : 'rgba(225,240,245,0.4)';
      ctx.fill();
    }

    // 足場。sheet はカマキリがつかまる面
    let sheet = null;
    if (feetKind !== 'none') {
      if (k === 'cup') {
        if (flip) sheet = { x: inner.x + inner.w * 0.1, y: inner.y + inner.h * 0.05, w: inner.w * 0.8, h: inner.h * 0.9 };
      } else if (tate) sheet = { x: inner.x + inner.w * 0.08, y: inner.y, w: inner.w * 0.5, h: inner.h };
      else sheet = { x: inner.x + inner.w * 0.05, y: inner.y, w: inner.w * 0.42, h: inner.h };
      if (sheet) foothold(ctx, feetKind, sheet.x, sheet.y, sheet.w, sheet.h, opts.seed);
    }
    if (k === 'mesh' || k === 'net') sheet = inner;
    if (setup.soil && k !== 'cup' && k !== 'net') soil(ctx, b.x + b.w * 0.03, b.y + b.h * 0.86, b.w * 0.94, b.h * 0.11, T, opts.seed);

    // カマキリ。つかまる場所があれば足場やかべに頭を上にしてつかまり、なければ床にいる。
    // 棚の上の小さなケースでも見えるように、実物より少し大きく描く
    const hangLid = k === 'cup' && !flip && lid && lid.feet !== 'none';
    if (who) {
      const pxPerMM = inner.w / INNER_MM[k][tate ? 1 : 0];
      const upright = !!sheet && !hangLid;
      const room = upright ? inner.h * 0.85 : inner.w * 0.85;
      const s = Math.min(room, Math.max(16, who.len * pxPerMM * 1.4)) / BODY_UNITS;
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
      ctx.globalAlpha = k === 'net' ? 0.45 : 1;
      if (hangLid) {
        // フタの網にぶら下がる
        ctx.translate(inner.x + inner.w * 0.55, inner.y + inner.h * 0.05);
        ctx.scale(1, -1);
        ctx.rotate(Math.sin(T * 0.8) * 0.03);
        mantis(ctx, 0, 0, s, { ...who.look, t: T, aim: Math.sin(T * 0.5) * 0.3 });
      } else if (upright) {
        // 体の中心が足場のまん中にくるように置く (頭が上、背中が左)
        ctx.translate(sheet.x + sheet.w / 2 + 25 * s, sheet.y + sheet.h / 2 - 8 * s);
        ctx.rotate(-Math.PI / 2 + Math.sin(T * 1.2) * 0.04);
        mantis(ctx, 0, 0, s, { ...who.look, t: T, aim: Math.sin(T * 0.5) * 0.3 });
      } else {
        const fy = setup.soil && k !== 'cup' ? b.y + b.h * 0.86 : b.y + b.h * 0.95;
        mantis(ctx, inner.x + inner.w * 0.55, fy, s, { ...who.look, t: T, aim: Math.sin(T * 0.5) * 0.3 });
      }
      ctx.restore();
    }

    // 前面 (カマキリより手前に描くもの)
    if (k === 'plastic' || k === 'kobae') {
      roundRect(ctx, b.x, b.y, b.w, b.h, Math.min(b.w, b.h) * 0.06);
      ctx.strokeStyle = '#8fa9b4';
      ctx.lineWidth = Math.max(1.5, b.w * 0.015);
      ctx.stroke();
      // フタ。横置きは上、縦置きは横についている
      const lw = tate ? b.w * 0.14 : b.w, lh = tate ? b.h : b.h * 0.12;
      const lx = tate ? b.x + b.w - lw : b.x, ly = b.y;
      roundRect(ctx, lx, ly, lw, lh, Math.min(lw, lh) * 0.3);
      ctx.fillStyle = '#2d2f31';
      ctx.fill();
      ctx.fillStyle = '#6d7377';
      if (k === 'plastic') {
        // 通気のいい、たくさんの穴
        const n = tate ? 7 : 9;
        for (let i = 0; i < n; i++) {
          if (tate) ctx.fillRect(lx + lw * 0.25, ly + lh * (0.08 + 0.84 * i / n), lw * 0.5, Math.max(1, lh * 0.05));
          else ctx.fillRect(lx + lw * (0.06 + 0.88 * i / n), ly + lh * 0.25, Math.max(1, lw * 0.05), lh * 0.5);
        }
      } else {
        // 小さい穴
        for (let i = 0; i < 14; i++) {
          ctx.beginPath();
          if (tate) ctx.arc(lx + lw / 2, ly + lh * (0.06 + 0.88 * i / 14), Math.max(0.6, lw * 0.05), 0, Math.PI * 2);
          else ctx.arc(lx + lw * (0.05 + 0.9 * i / 14), ly + lh / 2, Math.max(0.6, lh * 0.08), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // ケースのしめり気 (水滴)
      if (k === 'kobae') {
        ctx.fillStyle = 'rgba(150,190,215,0.6)';
        const R = rng(11);
        for (let i = 0; i < 14; i++) {
          ctx.beginPath();
          ctx.arc(b.x + b.w * (0.08 + R() * 0.84), b.y + b.h * (0.2 + R() * 0.6), Math.max(1, b.w * 0.012), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (k === 'mesh') {
      // 全体がメッシュ。手前の1面だけ透明
      ctx.save();
      roundRect(ctx, b.x, b.y, b.w, b.h, Math.min(b.w, b.h) * 0.06);
      ctx.clip();
      ctx.fillStyle = 'rgba(248,248,248,0.75)';
      ctx.fillRect(b.x, b.y, b.w, b.h * 0.1);
      ctx.fillRect(b.x, b.y, b.w * 0.07, b.h);
      ctx.fillRect(b.x + b.w * 0.93, b.y, b.w * 0.07, b.h);
      grid(ctx, b.x, b.y, b.w, b.h * 0.1, Math.max(2, b.w * 0.02), 'rgba(170,170,170,0.7)', 0.6);
      grid(ctx, b.x, b.y, b.w * 0.07, b.h, Math.max(2, b.w * 0.02), 'rgba(170,170,170,0.7)', 0.6);
      grid(ctx, b.x + b.w * 0.93, b.y, b.w * 0.07, b.h, Math.max(2, b.w * 0.02), 'rgba(170,170,170,0.7)', 0.6);
      ctx.restore();
      roundRect(ctx, b.x, b.y, b.w, b.h, Math.min(b.w, b.h) * 0.06);
      ctx.strokeStyle = '#1f2f55';
      ctx.lineWidth = Math.max(2, b.w * 0.025);
      ctx.stroke();
    } else if (k === 'net') {
      // 洗濯ネット。全体が細かい網で、中が見えにくい
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h * 0.55, b.w * 0.5, b.h * 0.45, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(250,250,247,0.55)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      grid(ctx, b.x, b.y, b.w, b.h, Math.max(2, b.w * 0.022), 'rgba(185,185,180,0.8)', 0.7);
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h * 0.55, b.w * 0.5, b.h * 0.45, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#9a9a92';
      ctx.lineWidth = Math.max(1.2, b.w * 0.012);
      ctx.stroke();
      // ファスナー
      ctx.strokeStyle = '#3b3f4a';
      ctx.lineWidth = Math.max(1.5, b.w * 0.018);
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h * 0.55, b.w * 0.5, b.h * 0.45, 0, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (k === 'cup') {
      const top = flip ? 0.78 : 1;
      const tx0 = b.x + b.w * (1 - top) / 2, tx1 = b.x + b.w * (1 + top) / 2, ty = b.y + b.h * 0.08;
      if (!flip && lid) {
        if (lid.id === 'plain' || lid.id === 'cross') {
          roundRect(ctx, tx0 - b.w * 0.03, ty - b.h * 0.06, (tx1 - tx0) + b.w * 0.06, b.h * 0.08, b.h * 0.03);
          ctx.fillStyle = 'rgba(215,232,240,0.9)';
          ctx.fill();
          ctx.strokeStyle = '#8fa9b4';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (lid.id === 'cross') {
          // 十字の穴に排水溝ネット
          foothold(ctx, 'drain', b.x + b.w * 0.4, ty - b.h * 0.06, b.w * 0.2, b.h * 0.16, opts.seed);
          ctx.strokeStyle = '#4c5b62';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(b.x + b.w * 0.45, ty - b.h * 0.02); ctx.lineTo(b.x + b.w * 0.55, ty - b.h * 0.02);
          ctx.moveTo(b.x + b.w * 0.5, ty - b.h * 0.05); ctx.lineTo(b.x + b.w * 0.5, ty + b.h * 0.01);
          ctx.stroke();
        }
        if (lid.id === 'drainTop') {
          // フタのかわりに排水溝ネット、輪ゴムでとめる
          foothold(ctx, 'drain', tx0 - b.w * 0.02, ty - b.h * 0.07, (tx1 - tx0) + b.w * 0.04, b.h * 0.2, opts.seed);
          ctx.strokeStyle = '#d98b4a';
          ctx.lineWidth = Math.max(1.5, b.h * 0.02);
          ctx.beginPath();
          ctx.moveTo(tx0 - b.w * 0.01, ty + b.h * 0.07);
          ctx.lineTo(tx1 + b.w * 0.01, ty + b.h * 0.07);
          ctx.stroke();
        }
      }
      if (flip) {
        // 逆さに置いたカップの底
        ctx.strokeStyle = '#8fa9b4';
        ctx.lineWidth = Math.max(1.2, b.w * 0.02);
        ctx.beginPath();
        ctx.moveTo(tx0, ty + b.h * 0.03);
        ctx.lineTo(tx1, ty + b.h * 0.03);
        ctx.stroke();
      }
    }

    // ラベル (スライドの写真のように、ケースに番号を貼る)
    if (opts.label) {
      const fs = Math.max(10, Math.min(16, cell.w * 0.08));
      ctx.font = `bold ${fs}px sans-serif`;
      const tw = ctx.measureText(opts.label).width + fs * 0.9;
      const lx = b.x + b.w / 2 - tw / 2, ly = b.y + b.h * 0.93 - fs * 1.4;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(lx, ly, tw, fs * 1.4);
      ctx.fillStyle = '#222';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.label, b.x + b.w / 2, ly + fs * 0.72);
      if (opts.mark) {
        ctx.beginPath();
        ctx.arc(lx + tw + fs * 0.5, ly + fs * 0.7, fs * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = opts.mark;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.restore();
    return b;
  }

  /* ---------- 野外 ---------- */
  function sky(ctx, W, H, top, bottom) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function blade(ctx, x, y, h, bend, w, col) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.quadraticCurveTo(x + bend * 0.5, y - h * 0.6, x + bend, y - h);
    ctx.quadraticCurveTo(x + bend * 0.5 + w * 0.2, y - h * 0.6, x + w / 2, y);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }

  /* 場所の背景を描き、カマキリを置く位置 { x, y, angle, s } を返す。
     len は見つけたもの (カマキリ) の体長 (mm)。どの大きさでも見やすいように描く大きさを決める */
  function field(ctx, W, H, id, T, seed) {
    const R = rng(seed || 1);
    const sway = (i) => Math.sin(T * 0.9 + i) * 3;
    let perch = { x: W * 0.5, y: H * 0.6, angle: 0 };
    const ground = H * 0.82;
    if (id === 'goldenrod' || id === 'kuzu' || id === 'ine' || id === 'okiGrass' || id === 'daito') {
      const island = id === 'okiGrass' || id === 'daito';
      sky(ctx, W, H, island ? '#7fc4ef' : '#bfe0f2', island ? '#e8f6ff' : '#f1f7ea');
      if (island) {
        ctx.fillStyle = '#3d9bd1';
        ctx.fillRect(0, H * 0.48, W, H * 0.06);
      }
      ctx.fillStyle = '#9cc26f';
      ctx.fillRect(0, H * 0.54, W, H);
    }
    if (id === 'goldenrod') {
      // 黄色い花の、背の高い草
      for (let i = 0; i < 26; i++) {
        const x = R() * W, h = H * (0.45 + R() * 0.35), b = (R() - 0.5) * 40 + sway(i);
        ctx.strokeStyle = '#5f8a3a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.quadraticCurveTo(x + b * 0.4, H - h * 0.5, x + b, H - h);
        ctx.stroke();
        for (let j = 0; j < 7; j++) {
          ctx.beginPath();
          ctx.ellipse(x + b + (j - 3) * 6, H - h + Math.abs(j - 3) * 5, 5, 4, 0, 0, Math.PI * 2);
          ctx.fillStyle = j % 2 ? '#f2cf2c' : '#e3b81f';
          ctx.fill();
        }
        for (let j = 0; j < 4; j++) blade(ctx, x + b * (0.2 + j * 0.15), H - h * (0.2 + j * 0.15), 26, 22 * (j % 2 ? 1 : -1), 6, '#6f9c45');
      }
      perch = { x: W * 0.5, y: H * 0.62, angle: -0.15 };
      ctx.strokeStyle = '#557d33';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-10, H * 0.66);
      ctx.quadraticCurveTo(W * 0.5, H * 0.6, W + 10, H * 0.5);
      ctx.stroke();
    } else if (id === 'kuzu') {
      // 大きめで丸い葉
      for (let i = 0; i < 34; i++) {
        const x = R() * W, y = H * (0.25 + R() * 0.75), r = 26 + R() * 30;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(R() * 6.28);
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.85, 0, 0, Math.PI * 2);
        ctx.fillStyle = i % 3 ? '#5d9a3c' : '#73ad4c';
        ctx.fill();
        ctx.strokeStyle = 'rgba(30,60,20,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-r * 0.8, 0); ctx.lineTo(r * 0.8, 0);
        ctx.moveTo(0, 0); ctx.lineTo(r * 0.5, -r * 0.5);
        ctx.moveTo(0, 0); ctx.lineTo(-r * 0.4, -r * 0.55);
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = '#6a7a3a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-10, H * 0.7);
      ctx.quadraticCurveTo(W * 0.4, H * 0.58, W + 10, H * 0.64);
      ctx.stroke();
      perch = { x: W * 0.48, y: H * 0.62, angle: -0.05 };
    } else if (id === 'ine' || id === 'okiGrass') {
      // 細長い草が続く
      for (let i = 0; i < 140; i++) {
        const x = R() * W, h = H * (0.25 + R() * 0.4);
        blade(ctx, x, H, h, (R() - 0.5) * 60 + sway(i), 4 + R() * 3, i % 4 ? '#7aa84a' : '#5f8f36');
      }
      ctx.strokeStyle = '#6c9440';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-10, H * 0.7);
      ctx.quadraticCurveTo(W * 0.5, H * 0.6, W + 10, H * 0.56);
      ctx.stroke();
      perch = { x: W * 0.5, y: H * 0.615, angle: -0.08 };
    } else if (id === 'tsutsuji') {
      sky(ctx, W, H, '#cfe6f2', '#eef4e4');
      ctx.fillStyle = '#d8cfb8';
      ctx.fillRect(0, ground, W, H);
      // こんもりした低木
      ctx.fillStyle = '#3f6f35';
      ctx.beginPath();
      ctx.ellipse(W * 0.5, ground, W * 0.62, H * 0.45, 0, Math.PI, 0);
      ctx.fill();
      for (let i = 0; i < 260; i++) {
        const a = Math.PI + R() * Math.PI, rr = Math.sqrt(R());
        const x = W * 0.5 + Math.cos(a) * W * 0.6 * rr, y = ground + Math.sin(a) * H * 0.43 * rr;
        ctx.beginPath();
        ctx.ellipse(x, y, 7, 4, R() * 3, 0, Math.PI * 2);
        ctx.fillStyle = i % 3 ? '#4d8a3f' : '#5f9c4a';
        ctx.fill();
      }
      ctx.strokeStyle = '#6a5034';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(W * 0.15, ground);
      ctx.quadraticCurveTo(W * 0.4, H * 0.62, W * 0.85, H * 0.58);
      ctx.stroke();
      perch = { x: W * 0.55, y: H * 0.605, angle: -0.06 };
    } else if (id === 'tree' || id === 'daito') {
      if (id === 'tree') {
        sky(ctx, W, H, '#bcdff0', '#eaf3e2');
        ctx.fillStyle = '#9cc26f';
        ctx.fillRect(0, ground, W, H);
      }
      // 幹と枝と葉
      ctx.fillStyle = '#6b4d33';
      ctx.fillRect(W * 0.08, 0, W * 0.12, H);
      for (let i = 0; i < 70; i++) {
        ctx.beginPath();
        ctx.ellipse(R() * W, R() * H * 0.45, 30 + R() * 30, 20 + R() * 16, R() * 3, 0, Math.PI * 2);
        ctx.fillStyle = i % 3 ? 'rgba(70,125,55,0.85)' : 'rgba(95,150,70,0.85)';
        ctx.fill();
      }
      ctx.strokeStyle = '#6b4d33';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(W * 0.14, H * 0.66);
      ctx.quadraticCurveTo(W * 0.5, H * 0.6, W + 10, H * 0.5);
      ctx.stroke();
      perch = { x: W * 0.55, y: H * 0.585, angle: -0.12 };
    } else if (id === 'litter') {
      // 林の地面の落ち葉
      sky(ctx, W, H, '#7d6a4c', '#5d4a33');
      for (let i = 0; i < 220; i++) {
        ctx.save();
        ctx.translate(R() * W, R() * H);
        ctx.rotate(R() * 6.28);
        ctx.beginPath();
        ctx.ellipse(0, 0, 18 + R() * 16, 9 + R() * 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = ['#8a6a41', '#a1804f', '#6f5434', '#b89263', '#7c5d3a'][i % 5];
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,25,10,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-14, 0); ctx.lineTo(14, 0);
        ctx.stroke();
        ctx.restore();
      }
      perch = { x: W * 0.5, y: H * 0.62, angle: 0 };
    } else if (id === 'okiLight') {
      // 夜、ホテルの壁と照明
      sky(ctx, W, H, '#0f1a33', '#1c2a46');
      ctx.fillStyle = '#d9cfb6';
      ctx.fillRect(0, H * 0.12, W, H * 0.88);
      const lx = W * 0.5, ly = H * 0.24;
      const g = ctx.createRadialGradient(lx, ly, 4, lx, ly, Math.max(W, H) * 0.6);
      g.addColorStop(0, 'rgba(255,240,190,0.95)');
      g.addColorStop(0.35, 'rgba(255,230,160,0.35)');
      g.addColorStop(1, 'rgba(0,0,30,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff6d6';
      roundRect(ctx, lx - 26, ly - 12, 52, 24, 10);
      ctx.fill();
      ctx.fillStyle = '#5b5446';
      ctx.fillRect(lx - 4, ly - 30, 8, 18);
      // 飛んでくる小さな虫
      ctx.fillStyle = 'rgba(60,50,40,0.7)';
      for (let i = 0; i < 6; i++) {
        const ph = T * (1 + i * 0.2) + i;
        ctx.beginPath();
        ctx.arc(lx + Math.cos(ph) * (40 + i * 8), ly + Math.sin(ph * 1.3) * (20 + i * 4), 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      perch = { x: W * 0.5, y: H * 0.7, angle: 0, wall: true };
    }
    if (id === 'daito') perch = { x: W * 0.55, y: H * 0.585, angle: -0.12 };
    return perch;
  }

  /* ---------- 見分けるときの拡大図 ---------- */
  function panelBg(ctx, w, h) {
    ctx.fillStyle = '#f6f3e8';
    ctx.fillRect(0, 0, w, h);
  }
  function tag(ctx, label) {
    ctx.font = '11px sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(255,253,246,0.9)';
    roundRect(ctx, 4, 4, tw + 10, 18, 6);
    ctx.fill();
    ctx.fillStyle = '#7a6a52';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 9, 13);
  }

  // 前脚の付け根を腹側から見た図。左右の前脚 (基節と腿) を描く
  function panelCoxa(ctx, w, h, m) {
    panelBg(ctx, w, h);
    const sp = SP[m.sp], pal = palette(m.color);
    const cx = w / 2, top = h * 0.12;
    // 前胸
    limb(ctx, cx, top, cx, h * 0.5, w * 0.07, w * 0.08, pal.body);
    for (const side of [-1, 1]) {
      const bx = cx + side * w * 0.05, by = h * 0.3;
      const ex = cx + side * w * 0.2, ey = h * 0.62;
      limb(ctx, bx, by, ex, ey, w * 0.09, w * 0.075, pal.body);
      // 腿
      limb(ctx, ex, ey, ex + side * w * 0.17, h * 0.92, w * 0.08, w * 0.06, pal.body);
      if (sp.armPattern) {
        ctx.beginPath();
        ctx.ellipse(ex + side * w * 0.07, h * 0.75, w * 0.03, h * 0.07, -side * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#1d1a16';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(ex + side * w * 0.12, h * 0.86, w * 0.02, h * 0.045, -side * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f7f4ea';
        ctx.fill();
      }
      const at = (k) => [lerp(bx, ex, k), lerp(by, ey, k)];
      if (sp.coxa) {
        const p = at(0.25);
        ctx.beginPath();
        ctx.ellipse(p[0], p[1], w * 0.045, h * 0.07, -side * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = COXA_COLOR[sp.coxa];
        ctx.fill();
      } else if (sp.bumps === 'yellow') {
        const n = side < 0 ? m.bumpsL : m.bumpsR;
        for (let i = 0; i < n; i++) {
          const p = at(0.15 + 0.7 * i / Math.max(1, n - 1));
          ctx.beginPath();
          ctx.arc(p[0] + side * w * 0.02, p[1], w * 0.016, 0, Math.PI * 2);
          ctx.fillStyle = '#f3d23a';
          ctx.fill();
          ctx.strokeStyle = '#b8951c';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      } else if (sp.bumps === 'small') {
        for (let i = 0; i < 5; i++) {
          const p = at(0.1 + 0.2 * i);
          ctx.beginPath();
          ctx.arc(p[0] + side * w * 0.02, p[1] + (i % 2) * 3, w * 0.007, 0, Math.PI * 2);
          ctx.fillStyle = '#f3d23a';
          ctx.fill();
        }
      } else if (sp.bumps === 'none') {
        const p = at(0.45);
        const g = ctx.createLinearGradient(p[0] - 10, p[1] - 20, p[0] + 10, p[1] + 20);
        g.addColorStop(0, '#f7fafc');
        g.addColorStop(0.5, '#c9d3d9');
        g.addColorStop(1, '#eef3f6');
        ctx.beginPath();
        ctx.ellipse(p[0], p[1], w * 0.04, h * 0.14, -side * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
    }
    // 頭
    ctx.beginPath();
    ctx.ellipse(cx, top - h * 0.02, w * 0.1, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.body;
    ctx.fill();
    tag(ctx, 'おなか側から見た前脚');
  }

  // 翅を広げた図
  function panelWings(ctx, w, h, m) {
    panelBg(ctx, w, h);
    const sp = SP[m.sp], pal = palette(m.color);
    const adult = m.stage >= ADULT;
    const cx = w * 0.62, cy = adult && sp.wings !== 'short' ? h * 0.72 : h * 0.5;
    if (adult && sp.wings !== 'short') {
      // 後翅 (うちわのように上へ広がる)。halfDark は付け根側の半分くらいが黒っぽい
      ctx.save();
      ctx.translate(cx, cy);
      const R = Math.min(w * 0.42, h * 0.62), A0 = Math.PI * 1.0, A1 = Math.PI * 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, A0, A1);
      ctx.closePath();
      ctx.fillStyle = sp.hind ? 'rgba(232,238,240,0.7)' : 'rgba(225,215,190,0.55)';
      ctx.fill();
      if (sp.hind === 'halfDark') {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R * 0.55, A0, A1);
        ctx.closePath();
        ctx.fillStyle = 'rgba(58,40,62,0.85)';
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(110,110,110,0.6)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        const a = A0 + (A1 - A0) * i / 10;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, R, A0, A1);
      ctx.stroke();
      ctx.restore();
    }
    // 胴体 (上から見た図)
    limb(ctx, w * 0.9, cy, w * 0.66, cy, h * 0.12, h * 0.14, pal.body);
    limb(ctx, w * 0.66, cy, w * 0.22, cy + h * 0.02, h * (sp.wide ? 0.28 : 0.2), h * 0.06, pal.body);
    ctx.beginPath();
    ctx.ellipse(w * 0.93, cy, h * 0.08, h * 0.11, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.body;
    ctx.fill();
    if (adult) {
      // 前翅
      const len = sp.wings === 'short' ? 0.12 : 0.44;
      ctx.beginPath();
      ctx.moveTo(w * 0.66, cy - h * 0.02);
      ctx.quadraticCurveTo(w * (0.66 - len / 2), cy - h * 0.2, w * (0.66 - len), cy - h * 0.03);
      ctx.quadraticCurveTo(w * (0.66 - len / 2), cy + h * 0.05, w * 0.66, cy - h * 0.02);
      ctx.fillStyle = pal.body;
      ctx.fill();
      ctx.strokeStyle = pal.dark;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      if (sp.spots && sp.wings !== 'short') {
        ctx.beginPath();
        ctx.ellipse(w * 0.52, cy - h * 0.08, w * 0.025, h * 0.035, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#fbfbf2';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(w * 0.52, cy + h * 0.1, w * 0.025, h * 0.035, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (m.stage >= 2) {
      // 翅のもと
      for (const dy of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(w * 0.6, cy + dy * h * 0.06, w * 0.06, h * 0.04, dy * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = pal.light;
        ctx.fill();
      }
    }
    tag(ctx, '背中側から見た翅');
  }

  // 前胸腹板 (前胸のおなか側)
  function panelSternum(ctx, w, h, m) {
    panelBg(ctx, w, h);
    const sp = SP[m.sp], pal = palette(m.color);
    const cx = w / 2;
    limb(ctx, cx, h * 0.12, cx, h * 0.88, w * 0.16, w * 0.2, pal.body);
    let plate = pal.light;
    if (sp.sternum === 'yellowPurple') plate = '#efd34a';
    if (sp.sternum === 'red') plate = '#d9604a';
    limb(ctx, cx, h * 0.2, cx, h * 0.8, w * 0.1, w * 0.13, plate);
    if (sp.sternum === 'yellowPurple') {
      ctx.fillStyle = '#7d4a8f';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(cx, h * (0.3 + i * 0.13), w * 0.025, h * 0.035, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 前脚の付け根 (位置の目安)
    for (const side of [-1, 1]) limb(ctx, cx + side * w * 0.08, h * 0.82, cx + side * w * 0.22, h * 0.95, w * 0.07, w * 0.06, pal.body);
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.08, w * 0.1, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.body;
    ctx.fill();
    tag(ctx, '前胸をおなか側から見たところ');
  }

  // 中脚と後脚
  function panelLegs(ctx, w, h, m) {
    panelBg(ctx, w, h);
    const sp = SP[m.sp], pal = palette(m.color);
    ctx.save();
    ctx.translate(w * 0.5, h * 0.85);
    const s = Math.min(w, h * 1.6) / 70;
    ctx.scale(s, s);
    limb(ctx, -24, -20, 14, -22, 9, 7, pal.body);
    leg(ctx, [8, -18], [20, -32], [28, 0], pal.body, 3.2, sp.flaps, pal.dark);
    leg(ctx, [-6, -18], [-20, -34], [-32, 0], pal.body, 3.2, sp.flaps, pal.dark);
    ctx.restore();
    tag(ctx, '中脚と後脚');
  }

  // ものさしと実物大のカマキリ
  function panelSize(ctx, w, h, m, len) {
    panelBg(ctx, w, h);
    const x0 = w * 0.08, x1 = w * 0.92, y = h * 0.78;
    // 横にも縦にも収まる目盛りの範囲を選ぶ (触角と反らせたおなかで、高さは体長の 1 倍近くある)
    const need = Math.max(len * 1.15, len * (x1 - x0) / (h * 0.62));
    const maxMM = [20, 30, 50, 80, 120, 150].find((v) => v >= need) || 150;
    const px = (x1 - x0) / maxMM;
    ctx.fillStyle = '#f2dc8c';
    ctx.fillRect(x0 - 6, y, x1 - x0 + 12, h * 0.16);
    ctx.strokeStyle = '#5b4a1c';
    ctx.fillStyle = '#5b4a1c';
    ctx.lineWidth = 1;
    ctx.font = `${Math.max(10, h * 0.07)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const step = maxMM <= 50 ? 1 : maxMM <= 80 ? 2 : 5;
    const labelStep = maxMM <= 30 ? 5 : maxMM <= 80 ? 10 : 20;
    for (let mm = 0; mm <= maxMM; mm += step) {
      const x = x0 + mm * px, big = mm % labelStep === 0;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + (big ? h * 0.07 : h * 0.035));
      ctx.stroke();
      if (big) ctx.fillText(String(mm), x, y + h * 0.075);
    }
    const s = (len * px) / BODY_UNITS;
    // 腹の先 (x ≒ -51) を 0 に合わせる
    mantis(ctx, x0 + 51 * s, y - 2, s, { stage: m.stage, color: m.color, sp: SP[m.sp], ind: m });
    tag(ctx, 'ものさし (mm)');
  }

  function panelOotheca(ctx, w, h, shape) {
    panelBg(ctx, w, h);
    // 枝につく卵鞘
    ctx.strokeStyle = '#7a5a3a';
    ctx.lineWidth = h * 0.06;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.3);
    ctx.lineTo(w, h * 0.38);
    ctx.stroke();
    ootheca(ctx, w * 0.5, h * 0.58, Math.min(w, h) * 0.24, shape);
    tag(ctx, '枝についた卵鞘');
  }

  return {
    mantis, ootheca, cage, caseBox, field, roundRect, bodyColor, palette, rng,
    panelCoxa, panelWings, panelSternum, panelLegs, panelSize, panelOotheca, BODY_UNITS,
  };
})();
