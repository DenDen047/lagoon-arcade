'use strict';
/* カマキリ飼育日記 — 絵。画像ファイルは使わず、すべて canvas の図形で描く。
   カマキリは「体長 100」の座標で描く。足が乗る線が y = 0、頭が +x 側、上が -y。 */

const Art = (() => {
  const PALETTE = {
    green: { body: '#7cb342', dark: '#4e7d23', light: '#b5d977', eye: '#a5d46a' },
    brown: { body: '#a1804f', dark: '#6b5131', light: '#cfb184', eye: '#c9ab78' },
    ghost: { body: 'rgba(236,226,196,0.55)', dark: 'rgba(205,190,150,0.55)', light: 'rgba(250,244,226,0.55)', eye: 'rgba(236,226,196,0.6)' },
  };
  const HEAD = { x: 29, y: -44 };   // 頭の中心
  const REACH = 36;                 // カマがとどく距離 (頭から)
  const COXA = { x: 23, y: -36 };   // 前脚の付け根

  // 前脚の角度 (付け根・腿・すね)。かまえ / 打つ / 食べる
  const ARM_REST = [1.3, -1.2, 1.95];
  const ARM_STRIKE = [0.45, -0.25, 0.2];
  const ARM_EAT = [0.95, -1.5, 2.45];
  const ARM_LEN = [12, 17, 11];

  const lerp = (a, b, k) => a + (b - a) * k;

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

  function leg(ctx, hip, knee, foot, col, w) {
    limb(ctx, hip[0], hip[1], knee[0], knee[1], w, w * 0.85, col);
    limb(ctx, knee[0], knee[1], foot[0], foot[1], w * 0.8, w * 0.6, col);
    limb(ctx, foot[0], foot[1], foot[0] + 4, foot[1] + 0.2, w * 0.5, w * 0.4, col);
  }

  // 前脚 (カマ)。腿の内側にトゲを描く
  function arm(ctx, angles, col, spine) {
    let x = COXA.x, y = COXA.y;
    const pts = [[x, y]];
    for (let i = 0; i < 3; i++) {
      x += Math.cos(angles[i]) * ARM_LEN[i];
      y += Math.sin(angles[i]) * ARM_LEN[i];
      pts.push([x, y]);
    }
    limb(ctx, pts[0][0], pts[0][1], pts[1][0], pts[1][1], 4.6, 4, col);
    limb(ctx, pts[1][0], pts[1][1], pts[2][0], pts[2][1], 4.4, 3.6, col);
    limb(ctx, pts[2][0], pts[2][1], pts[3][0], pts[3][1], 2.6, 1.6, col);
    // 腿のトゲ
    const fx = pts[2][0] - pts[1][0], fy = pts[2][1] - pts[1][1], fl = Math.hypot(fx, fy);
    const ux = fx / fl, uy = fy / fl, nx = uy, ny = -ux; // 腿の内側 (すねが閉じる側)
    ctx.fillStyle = spine;
    for (let i = 1; i <= 4; i++) {
      const k = i / 5, bx = pts[1][0] + fx * k, by = pts[1][1] + fy * k;
      ctx.beginPath();
      ctx.moveTo(bx - ux * 0.9 - nx * 1.6, by - uy * 0.9 - ny * 1.6);
      ctx.lineTo(bx - nx * 3.6, by - ny * 3.6);
      ctx.lineTo(bx + ux * 0.9 - nx * 1.6, by + uy * 0.9 - ny * 1.6);
      ctx.fill();
    }
    // すねの先のかぎ爪
    const tx = pts[3][0] - pts[2][0], ty = pts[3][1] - pts[2][1], tl = Math.hypot(tx, ty);
    limb(ctx, pts[3][0], pts[3][1], pts[3][0] + tx / tl * 2.5 + ty / tl * 2, pts[3][1] + ty / tl * 2.5 - tx / tl * 2, 1.4, 0.6, col);
    return pts[3];
  }

  // おなかの背骨にあたる曲線。幼虫はおなかを上に反らせる
  function abdomenSpine(stage, adult) {
    const p0 = [1, -17];
    if (adult) return { p0, c: [-24, -20], p1: [-49, -13] };
    const curl = 1 - stage * 0.06;
    return { p0, c: [-26, -19], p1: [-32 - stage, -16 - 30 * curl] };
  }

  function bez(p0, c, p1, t) {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
  }

  function abdomen(ctx, o, pal) {
    const { p0, c, p1 } = abdomenSpine(o.stage, o.adult);
    let maxW = 8 + o.stage * 0.4;
    if (o.stage >= 4) maxW += o.sex === 'F' ? 1.5 : -1;
    if (o.adult) maxW = o.sex === 'F' ? 15 : 9;
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
    // 背中側の明るい筋
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const m = mids[i];
      const x = m.p[0] + m.nx * m.w * 0.45, y = m.p[1] + m.ny * m.w * 0.45;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = pal.light;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // 腹の節。5齢からはオス8節・メス6節が見分けられる
    const segs = o.stage >= 4 || o.adult ? (o.sex === 'M' ? 8 : 6) : 7;
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 0.7;
    for (let i = 1; i <= segs; i++) {
      const k = Math.round((0.06 + 0.86 * i / (segs + 1)) * N);
      const m = mids[k];
      ctx.beginPath();
      ctx.moveTo(m.p[0] + m.nx * m.w * 0.95, m.p[1] + m.ny * m.w * 0.95);
      ctx.lineTo(m.p[0] - m.nx * m.w * 0.95, m.p[1] - m.ny * m.w * 0.95);
      ctx.stroke();
    }
    // 尾毛
    const tip = mids[N].p, pre = mids[N - 1].p;
    const tx = tip[0] - pre[0], ty = tip[1] - pre[1], tl = Math.hypot(tx, ty) || 1;
    limb(ctx, tip[0], tip[1], tip[0] + tx / tl * 4 - ty / tl * 1.5, tip[1] + ty / tl * 4 + tx / tl * 1.5, 1, 0.4, pal.dark);
  }

  function wing(ctx, o, pal) {
    const root = [9, -23];
    let tail, w;
    if (o.adult) {
      tail = o.sex === 'M' ? [-58, -15] : [-46, -19];
      w = o.sex === 'M' ? 8 : 10;
      if (o.crumpled) { tail = [-22, -21]; w = 9; }
    } else {
      tail = [-3 - 3 * (o.stage - 4), -21];
      w = 5;
    }
    const mx = (root[0] + tail[0]) / 2, my = (root[1] + tail[1]) / 2;
    ctx.beginPath();
    ctx.moveTo(root[0], root[1]);
    ctx.quadraticCurveTo(mx, my - w, tail[0], tail[1]);
    if (o.crumpled) {
      for (let i = 1; i <= 4; i++) {
        const k = i / 4;
        ctx.lineTo(lerp(tail[0], root[0], k), lerp(tail[1], root[1], k) + (i % 2 ? 3 : 0.5));
      }
    } else {
      ctx.quadraticCurveTo(mx, my + w * 0.35, root[0], root[1]);
    }
    ctx.closePath();
    ctx.fillStyle = o.adult ? pal.body : pal.light;
    ctx.fill();
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  function head(ctx, o, pal) {
    ctx.save();
    ctx.translate(HEAD.x, HEAD.y);
    ctx.rotate((o.aim || 0) * 0.7);
    // 触角
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 0.7;
    const sway = Math.sin((o.t || 0) * 2.1) * 2;
    ctx.beginPath();
    ctx.moveTo(1, -6);
    ctx.quadraticCurveTo(10, -22, 22 + sway, -28);
    ctx.moveTo(-1, -6);
    ctx.quadraticCurveTo(5, -22, 13 + sway * 0.7, -32);
    ctx.stroke();
    // 頭 (逆三角形)
    ctx.beginPath();
    ctx.moveTo(-6.5, -3);
    ctx.quadraticCurveTo(0, -9, 7.5, -4);
    ctx.quadraticCurveTo(7, 1, 3.5, 6.5);
    ctx.quadraticCurveTo(-2, 4, -6.5, -3);
    ctx.fillStyle = pal.body;
    ctx.fill();
    // 口ひげ
    limb(ctx, 3, 5.5, 5.5, 8, 0.9, 0.5, pal.dark);
    // 複眼と、こちらを見ているように見える黒い点 (偽瞳孔)
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
     o: { stage, adult, sex, color, aim, strike (0〜1), eat, crumpled, injury, ghost, t } */
  function mantis(ctx, x, y, s, o) {
    const pal = PALETTE[o.ghost ? 'ghost' : o.color];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // 奥側の脚
    const far = pal.dark;
    leg(ctx, [6, -17], [13, -26], [16, 0], far, 2);
    leg(ctx, [-1, -17], [-8, -27], [-15, 0], far, 2);
    const k = o.strike || 0;
    const armA = o.eat ? ARM_EAT : ARM_REST.map((v, i) => lerp(v, ARM_STRIKE[i], k));
    ctx.save();
    ctx.translate(-1.5, -0.8);
    arm(ctx, armA, pal.dark, pal.dark);
    ctx.restore();
    abdomen(ctx, o, pal);
    if (o.adult || o.stage >= 4) wing(ctx, o, pal);
    // 中胸・後胸
    limb(ctx, -1, -17, 10, -20, 7, 6, pal.body);
    // 手前の脚。曲がったあしは脱皮の失敗のあと
    const bent = (o.injury || 0) > 0;
    leg(ctx, [7, -16], bent ? [19, -19] : [17, -27], bent ? [27, -3] : [24, 0], pal.body, 2.3);
    leg(ctx, [0, -16], [-13, -28], [-24, 0], pal.body, 2.3);
    // 前胸 (首のように長い部分)
    limb(ctx, 9, -20, 25, -39, 4.6, 5.6, pal.body);
    limb(ctx, 10, -21.5, 24, -38.5, 1, 1, pal.light);
    head(ctx, o, pal);
    const claw = arm(ctx, armA, pal.body, pal.dark);
    ctx.restore();
    return { x: x + claw[0] * s, y: y + claw[1] * s };
  }

  /* エサの虫。x, y は体の中心、L は体長 (px)、facing は 1 で右向き */
  function prey(ctx, id, x, y, L, t, facing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale((facing || 1) * L, L);
    const legs = (col, n, spread, y0) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.045;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const bx = (i - (n - 1) / 2) * spread, w = Math.sin(t * 18 + i * 2) * 0.05;
        ctx.moveTo(bx, y0);
        ctx.lineTo(bx + 0.08 + w, y0 + 0.22);
      }
      ctx.stroke();
    };
    const ell = (cx, cy, rx, ry, col, rot) => {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, rot || 0, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    };
    if (id === 'aphid') {
      legs('#5f8a2e', 3, 0.22, 0.12);
      ell(-0.05, 0, 0.45, 0.33, '#8bc34a');
      ell(0.42, -0.04, 0.15, 0.13, '#7cb342');
      ell(0.47, -0.08, 0.05, 0.05, '#33402a');
      ell(-0.3, -0.16, 0.12, 0.05, '#6a9a35', -0.6);
    } else if (id === 'fruitfly' || id === 'housefly') {
      const fly = id === 'housefly';
      const body = fly ? '#4f4f4f' : '#c49a5c', eye = fly ? '#8d2b1f' : '#c62828';
      legs(fly ? '#2d2d2d' : '#8a6a3a', 3, 0.16, 0.12);
      ell(-0.2, 0.03, 0.3, 0.2, body);
      ctx.strokeStyle = fly ? '#2b2b2b' : '#7a5a2a';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { ctx.moveTo(-0.32 + i * 0.1, -0.15); ctx.lineTo(-0.34 + i * 0.1, 0.2); }
      ctx.stroke();
      ell(0.12, -0.01, 0.2, 0.17, body);
      ell(0.37, -0.02, 0.13, 0.13, body);
      ell(0.4, -0.04, 0.09, 0.1, eye);
      const flap = fly ? Math.sin(t * 60) * 0.35 : 0;
      ctx.globalAlpha = 0.55;
      ell(-0.15, -0.22 - flap * 0.2, fly ? 0.4 : 0.32, 0.12, '#e6eef5', -0.25 - flap);
      ctx.globalAlpha = 1;
    } else if (id.startsWith('cricket')) {
      legs('#3e2a18', 2, 0.25, 0.1);
      ctx.strokeStyle = '#3e2a18';
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(0.58, -0.08);
      ctx.quadraticCurveTo(1.0, -0.6, 1.35 + Math.sin(t * 3) * 0.05, -0.35);
      ctx.moveTo(-0.5, 0);
      ctx.lineTo(-0.72, -0.08);
      ctx.moveTo(-0.5, 0.03);
      ctx.lineTo(-0.72, 0.1);
      ctx.stroke();
      ell(0, 0, 0.5, 0.17, '#5d4026');
      ell(-0.05, -0.08, 0.36, 0.09, '#3f2b19');
      ell(0.48, -0.02, 0.15, 0.14, '#3e2a18');
      limb(ctx, -0.05, 0.02, -0.42, -0.2, 0.15, 0.08, '#6e4d2e');
      limb(ctx, -0.42, -0.2, -0.52, 0.18, 0.05, 0.03, '#3e2a18');
    } else if (id === 'grasshopper') {
      legs('#4f7a22', 2, 0.25, 0.08);
      ell(0, 0, 0.5, 0.13, '#7aa83c');
      ell(-0.08, -0.07, 0.4, 0.06, '#5f8a2e');
      ctx.beginPath();
      ctx.moveTo(0.42, -0.12);
      ctx.lineTo(0.62, -0.02);
      ctx.lineTo(0.44, 0.1);
      ctx.closePath();
      ctx.fillStyle = '#86b545';
      ctx.fill();
      ell(0.5, -0.06, 0.04, 0.04, '#2f3a1c');
      ctx.strokeStyle = '#4f7a22';
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(0.5, -0.1);
      ctx.lineTo(0.75, -0.3);
      ctx.stroke();
      limb(ctx, 0, 0.02, -0.4, -0.22, 0.13, 0.06, '#86b545');
      limb(ctx, -0.4, -0.22, -0.5, 0.15, 0.04, 0.03, '#4f7a22');
    } else if (id === 'moth') {
      const flap = 0.6 + Math.abs(Math.sin(t * 14)) * 0.4;
      ctx.fillStyle = '#9c8263';
      ctx.beginPath();
      ctx.moveTo(0.1, 0);
      ctx.lineTo(-0.35, -0.55 * flap);
      ctx.lineTo(-0.5, -0.1);
      ctx.closePath();
      ctx.moveTo(0.1, 0);
      ctx.lineTo(-0.35, 0.55 * flap);
      ctx.lineTo(-0.5, 0.1);
      ctx.closePath();
      ctx.fill();
      ell(-0.3, -0.25 * flap, 0.06, 0.06, '#6e5a42');
      ell(-0.3, 0.25 * flap, 0.06, 0.06, '#6e5a42');
      ell(0, 0, 0.32, 0.08, '#7a6248');
      ell(0.3, 0, 0.07, 0.07, '#5c4835');
    }
    ctx.restore();
  }

  /* 飼育ケース。r = { x, y, w, h }。ケースの中の小枝の両端を返す */
  function cage(ctx, r, c, t) {
    const lid = Math.max(10, r.h * 0.07);
    // 奥の壁とネット (鉢底ネット)
    ctx.fillStyle = '#e9f1ea';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(60,110,70,0.28)';
    ctx.lineWidth = 1;
    const step = Math.max(8, r.w / 28);
    ctx.beginPath();
    for (let x = r.x + r.w * 0.06; x <= r.x + r.w * 0.94; x += step) { ctx.moveTo(x, r.y + lid); ctx.lineTo(x, r.y + r.h * 0.9); }
    for (let y = r.y + lid + step; y <= r.y + r.h * 0.9; y += step) { ctx.moveTo(r.x + r.w * 0.06, y); ctx.lineTo(r.x + r.w * 0.94, y); }
    ctx.stroke();
    // 床のキッチンペーパー
    const floor = r.y + r.h * 0.9;
    ctx.fillStyle = '#fbfaf5';
    ctx.fillRect(r.x, floor, r.w, r.h - (floor - r.y));
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    for (let x = r.x + 6; x < r.x + r.w; x += 10) { ctx.moveTo(x, floor + 3); ctx.lineTo(x + 4, r.y + r.h - 3); }
    ctx.stroke();
    // フン・食べかす。汚れるほど増える
    const dirt = Math.floor((100 - c.clean) / 7);
    ctx.fillStyle = '#3b3328';
    for (let i = 0; i < dirt; i++) {
      const px = r.x + r.w * (0.08 + ((i * 0.37) % 0.84)), py = floor + (r.h - (floor - r.y)) * (0.25 + ((i * 0.53) % 0.6));
      ctx.beginPath();
      ctx.ellipse(px, py, 2.2, 1.4, i, 0, Math.PI * 2);
      ctx.fill();
    }
    // カビ
    if (c.moldy) {
      ctx.fillStyle = 'rgba(210,225,200,0.85)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(r.x + r.w * (0.05 + i * 0.035), floor + 4 + (i % 2) * 5, 6 + (i % 3) * 2, 0, Math.PI * 2);
        ctx.arc(r.x + r.w * (0.9 - i * 0.03), floor + 3 + (i % 2) * 6, 5 + (i % 2) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 小枝
    const b0 = { x: r.x + r.w * 0.08, y: floor + 2 }, b1 = { x: r.x + r.w * 0.88, y: r.y + r.h * 0.5 };
    limb(ctx, b0.x, b0.y, b1.x, b1.y, Math.max(5, r.w * 0.018), Math.max(3, r.w * 0.01), '#7a5a3a');
    limb(ctx, r.x + r.w * 0.55, floor - (floor - b1.y) * 0.55, r.x + r.w * 0.66, r.y + r.h * 0.42, Math.max(3, r.w * 0.009), 2, '#7a5a3a');
    // 壁の水滴。しめり気が多いほど増える
    const drops = Math.max(0, Math.floor((c.moist - 30) / 4));
    for (let i = 0; i < drops; i++) {
      const px = r.x + r.w * (0.04 + ((i * 0.61) % 0.92)), py = r.y + lid + (floor - r.y - lid) * ((i * 0.37 + 0.1) % 0.9);
      ctx.beginPath();
      ctx.ellipse(px, py, 1.6, 2.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,180,230,0.55)';
      ctx.fill();
    }
    // ケースのふちとふた
    ctx.strokeStyle = 'rgba(150,180,200,0.9)';
    ctx.lineWidth = 3;
    roundRect(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(r.x + r.w * 0.04, r.y + lid + 6, r.w * 0.03, r.h * 0.7);
    ctx.fillStyle = '#2f5d34';
    roundRect(ctx, r.x - 4, r.y - 2, r.w + 8, lid, 6);
    ctx.fill();
    ctx.fillStyle = '#244a29';
    for (let x = r.x + 12; x < r.x + r.w - 8; x += 9) {
      for (let y = r.y + 3; y < r.y + lid - 4; y += 6) ctx.fillRect(x, y, 4, 2.5);
    }
    return { b0, b1, floor, lid: r.y + lid - 2 };
  }

  function roundRect(ctx, x, y, w, h, rr) {
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* おなかを腹側から見た図。節の数を数えて性別を当てる */
  function belly(ctx, cx, cy, s, sex, color) {
    const pal = PALETTE[color];
    const n = sex === 'M' ? 8 : 6;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, -50);
    ctx.bezierCurveTo(22, -46, 20, 25, 3, 50);
    ctx.lineTo(-3, 50);
    ctx.bezierCurveTo(-20, 25, -22, -46, 0, -50);
    ctx.fillStyle = pal.body;
    ctx.fill();
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // 最後の線より下のとがった部分は節に数えない
    for (let i = 1; i <= n; i++) {
      const y = -50 + (90 * i) / n;
      const half = 17 * Math.sin(Math.PI * (0.12 + 0.8 * (y + 50) / 100)) + 1;
      ctx.beginPath();
      ctx.moveTo(-half, y);
      ctx.quadraticCurveTo(0, y + 4, half, y);
      ctx.stroke();
    }
    // 尾毛
    limb(ctx, -2, 48, -7, 62, 1.6, 0.6, pal.dark);
    limb(ctx, 2, 48, 7, 62, 1.6, 0.6, pal.dark);
    ctx.restore();
  }

  /* オオカマキリの卵鞘。いなり寿司のような丸い泡のかたまり。x, y は中心、w は横の長さ */
  function ootheca(ctx, x, y, w) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, w * 0.36, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#d8c296';
    ctx.fill();
    ctx.strokeStyle = '#a88c5c';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 卵が並んでいる背中の筋と、泡の模様
    ctx.beginPath();
    ctx.moveTo(-w * 0.38, -w * 0.05);
    ctx.quadraticCurveTo(0, -w * 0.2, w * 0.38, -w * 0.05);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(-w * 0.3 + i * w * 0.12, w * 0.08 + (i % 2) * w * 0.06, w * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  return { HEAD, REACH, mantis, prey, cage, belly, ootheca, roundRect };
})();
