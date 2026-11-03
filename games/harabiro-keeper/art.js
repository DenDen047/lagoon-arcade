'use strict';
/* ハラビロカマキリ飼育日記 — 絵。画像ファイルは使わず、すべて canvas の図形で描く。
   カマキリは「体長 100」の座標で描く。足が乗る線が y = 0、頭が +x 側、上が -y。
   ハラビロカマキリらしさは4つ。おなかが幅広い、前胸 (首のような部分) が短くて太い、
   成虫の前翅に白い紋がある、前脚の付け根に黄色いイボが並ぶ。幼虫はおなかを背中側へ大きく反らせる。 */

const Art = (() => {
  const PALETTE = {
    green: { body: '#8cc63f', dark: '#5b8a22', light: '#c6e47e', eye: '#b9dd72' },
    brown: { body: '#a3814f', dark: '#6c5232', light: '#d2b588', eye: '#cdb07c' },
    hatch: { body: '#b9a27a', dark: '#7d6a4a', light: '#ddd0b2', eye: '#cbb995' }, // 生まれたての1齢
    ghost: { body: 'rgba(236,226,196,0.55)', dark: 'rgba(205,190,150,0.55)', light: 'rgba(250,244,226,0.55)', eye: 'rgba(236,226,196,0.6)' },
  };
  const HEAD = { x: 27, y: -41 };   // 頭の中心
  const REACH = 34;                 // カマがとどく距離 (頭から)
  const COXA = { x: 21, y: -33 };   // 前脚の付け根

  // 前脚の角度 (付け根・腿・すね)。かまえ / 打つ / 食べる
  const ARM_REST = [1.3, -1.2, 1.95];
  const ARM_STRIKE = [0.45, -0.25, 0.2];
  const ARM_EAT = [0.95, -1.5, 2.45];
  const ARM_LEN = [11, 16, 10];

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

  // 前脚 (カマ)。腿の内側にトゲを描く。tubercle が true なら付け根に黄色いイボを並べる
  function arm(ctx, angles, col, spine, tubercle) {
    let x = COXA.x, y = COXA.y;
    const pts = [[x, y]];
    for (let i = 0; i < 3; i++) {
      x += Math.cos(angles[i]) * ARM_LEN[i];
      y += Math.sin(angles[i]) * ARM_LEN[i];
      pts.push([x, y]);
    }
    limb(ctx, pts[0][0], pts[0][1], pts[1][0], pts[1][1], 5, 4.2, col);
    if (tubercle) {
      const cx = pts[1][0] - pts[0][0], cy = pts[1][1] - pts[0][1], cl = Math.hypot(cx, cy);
      const ox = cy / cl * 1.6, oy = -cx / cl * 1.6; // 付け根の前側のふち
      ctx.fillStyle = '#f2d23c';
      for (let i = 1; i <= 4; i++) {
        const k = i / 5.2;
        ctx.beginPath();
        ctx.arc(pts[0][0] + cx * k + ox, pts[0][1] + cy * k + oy, 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    limb(ctx, pts[1][0], pts[1][1], pts[2][0], pts[2][1], 4.8, 3.8, col);
    limb(ctx, pts[2][0], pts[2][1], pts[3][0], pts[3][1], 2.6, 1.6, col);
    // 腿のトゲ
    const fx = pts[2][0] - pts[1][0], fy = pts[2][1] - pts[1][1], fl = Math.hypot(fx, fy);
    const ux = fx / fl, uy = fy / fl, nx = uy, ny = -ux; // 腿の内側 (すねが閉じる側)
    ctx.fillStyle = spine;
    for (let i = 1; i <= 4; i++) {
      const k = i / 5, bx = pts[1][0] + fx * k, by = pts[1][1] + fy * k;
      ctx.beginPath();
      ctx.moveTo(bx - ux * 0.9 - nx * 1.7, by - uy * 0.9 - ny * 1.7);
      ctx.lineTo(bx - nx * 3.6, by - ny * 3.6);
      ctx.lineTo(bx + ux * 0.9 - nx * 1.7, by + uy * 0.9 - ny * 1.7);
      ctx.fill();
    }
    // すねの先のかぎ爪
    const tx = pts[3][0] - pts[2][0], ty = pts[3][1] - pts[2][1], tl = Math.hypot(tx, ty);
    limb(ctx, pts[3][0], pts[3][1], pts[3][0] + tx / tl * 2.5 + ty / tl * 2, pts[3][1] + ty / tl * 2.5 - tx / tl * 2, 1.4, 0.6, col);
    return pts[3];
  }

  // おなかの背骨にあたる曲線。幼虫は小さいうちほど、おなかを背中側へ大きく反らせる
  function abdomenSpine(stage, adult) {
    const p0 = [1, -17];
    if (adult) return { p0, c: [-21, -21], p1: [-45, -14] };
    const curl = Math.max(0, 1 - stage * 0.13);
    return { p0, c: [-22, -21 - 4 * curl], p1: [-26 - stage * 2 + 10 * curl, -22 - 34 * curl] };
  }

  function bez(p0, c, p1, t) {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
  }

  function abdomen(ctx, o, pal) {
    const { p0, c, p1 } = abdomenSpine(o.stage, o.adult);
    // 名前のとおり、おなかの幅が広い。メスは特に広い
    let maxW = 10 + o.stage * 0.7;
    if (o.stage >= 4) maxW += o.sex === 'F' ? 2 : -1;
    if (o.adult) maxW = o.sex === 'F' ? 20 : 12;
    const N = 16, left = [], right = [], mids = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = bez(p0, c, p1, t);
      const q = bez(p0, c, p1, Math.min(1, t + 0.01));
      const r = bez(p0, c, p1, Math.max(0, t - 0.01));
      const dx = q[0] - r[0], dy = q[1] - r[1], d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d, ny = dx / d;
      const w = maxW * (t < 0.45 ? lerp(0.72, 1, t / 0.45) : lerp(1, 0.3, (t - 0.45) / 0.55)) / 2;
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
      tail = o.sex === 'M' ? [-50, -15] : [-40, -20];
      w = o.sex === 'M' ? 9 : 13;
      if (o.crumpled) { tail = [-20, -22]; w = 10; }
    } else {
      tail = [-3 - 3 * (o.stage - 4), -22];
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
    if (o.adult && !o.ghost) {
      // 前翅の白い紋 (翅の前のふちの、付け根から3分の1ほどのところ)
      const k = o.crumpled ? 0.5 : 0.34;
      const sx = lerp(root[0], tail[0], k), sy = lerp(root[1], tail[1], k) - w * 0.42;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 2.6, 1.3, Math.atan2(tail[1] - root[1], tail[0] - root[0]), 0, Math.PI * 2);
      ctx.fillStyle = '#fbfbf2';
      ctx.fill();
    }
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
    const pal = PALETTE[o.ghost ? 'ghost' : o.stage === 0 && !o.adult ? 'hatch' : o.color];
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
    arm(ctx, armA, pal.dark, pal.dark, false);
    ctx.restore();
    abdomen(ctx, o, pal);
    if (o.adult || o.stage >= 4) wing(ctx, o, pal);
    // 中胸・後胸
    limb(ctx, -1, -17, 10, -20, 7.5, 6.5, pal.body);
    // 手前の脚。曲がったあしは脱皮の失敗のあと
    const bent = (o.injury || 0) > 0;
    leg(ctx, [7, -16], bent ? [19, -19] : [17, -27], bent ? [27, -3] : [24, 0], pal.body, 2.3);
    leg(ctx, [0, -16], [-13, -28], [-24, 0], pal.body, 2.3);
    // 前胸。ハラビロカマキリは短くて太い
    limb(ctx, 9, -20, 22, -35, 5.6, 6.8, pal.body);
    limb(ctx, 10, -21.5, 21, -34.5, 1, 1, pal.light);
    head(ctx, o, pal);
    const claw = arm(ctx, armA, pal.body, pal.dark, !o.ghost && (o.adult || o.stage >= 2));
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
      // ヨーロッパイエコオロギ。うすい茶色で、頭に黒い帯がある
      legs('#6b5434', 2, 0.25, 0.1);
      ctx.strokeStyle = '#6b5434';
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(0.58, -0.08);
      ctx.quadraticCurveTo(1.0, -0.6, 1.35 + Math.sin(t * 3) * 0.05, -0.35);
      ctx.moveTo(-0.5, 0);
      ctx.lineTo(-0.72, -0.08);
      ctx.moveTo(-0.5, 0.03);
      ctx.lineTo(-0.72, 0.1);
      ctx.stroke();
      ell(0, 0, 0.5, 0.17, '#b08d5a');
      ell(-0.05, -0.08, 0.36, 0.09, '#8f6f42');
      ell(0.48, -0.02, 0.15, 0.14, '#c29c66');
      ell(0.5, -0.07, 0.13, 0.04, '#3e2a18');
      limb(ctx, -0.05, 0.02, -0.42, -0.2, 0.15, 0.08, '#b9976a');
      limb(ctx, -0.42, -0.2, -0.52, 0.18, 0.05, 0.03, '#6b5434');
    } else if (id === 'mayfly') {
      // カゲロウ。細い体、背中に立てた翅、長い2本の尾
      ctx.strokeStyle = '#8a7a52';
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.moveTo(-0.45, 0);
      ctx.quadraticCurveTo(-0.8, -0.05, -1.05, -0.2);
      ctx.moveTo(-0.45, 0.01);
      ctx.quadraticCurveTo(-0.8, 0.06, -1.05, 0.0);
      ctx.stroke();
      legs('#8a7a52', 3, 0.14, 0.05);
      ell(-0.05, 0, 0.42, 0.07, '#c8b27a', 0.05);
      ell(0.38, -0.02, 0.09, 0.08, '#a8925c');
      const flap = Math.sin(t * 16) * 0.1;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(0.1, -0.05);
      ctx.quadraticCurveTo(0.05, -0.75 - flap, -0.25, -0.62 - flap);
      ctx.lineTo(-0.15, -0.05);
      ctx.closePath();
      ctx.fillStyle = '#eef3f5';
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(120,120,110,0.6)';
      ctx.stroke();
    } else if (id === 'cicada') {
      // アブラゼミ。茶色い不透明な翅と、太い体
      legs('#3c2a1c', 3, 0.16, 0.12);
      ell(0, 0.02, 0.42, 0.19, '#3d3226');
      ell(0.38, -0.01, 0.15, 0.17, '#4a3d2e');
      ell(0.47, -0.12, 0.06, 0.06, '#7a6a52');
      ell(0.47, 0.1, 0.06, 0.06, '#7a6a52');
      const flap = Math.abs(Math.sin(t * 9)) * 0.06;
      ctx.beginPath();
      ctx.moveTo(0.25, -0.1);
      ctx.quadraticCurveTo(-0.3, -0.42 - flap, -0.82, -0.1);
      ctx.quadraticCurveTo(-0.3, 0.02, 0.25, 0.0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(122, 82, 46, 0.88)';
      ctx.fill();
      ctx.strokeStyle = '#4a3220';
      ctx.lineWidth = 0.025;
      ctx.stroke();
      // 翅脈
      ctx.beginPath();
      ctx.moveTo(0.2, -0.07);
      ctx.quadraticCurveTo(-0.25, -0.28 - flap, -0.7, -0.12);
      ctx.moveTo(0.1, -0.03);
      ctx.quadraticCurveTo(-0.3, -0.1, -0.62, -0.06);
      ctx.stroke();
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

  // 木の葉。x, y は付け根、len は長さ、a は向き
  function leaf(ctx, x, y, len, a, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.45, -len * 0.3, len, 0);
    ctx.quadraticCurveTo(len * 0.45, len * 0.3, 0, 0);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 70, 30, 0.35)';
    ctx.lineWidth = Math.max(0.8, len * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len * 0.92, 0);
    ctx.stroke();
    ctx.restore();
  }

  /* 飼育ケース。r = { x, y, w, h }。ケースの中の小枝の両端を返す。
     ハラビロカマキリは木の上でくらすので、葉のついた枝を入れてある */
  function cage(ctx, r, c, t) {
    const lid = Math.max(10, r.h * 0.07);
    // 奥の壁とネット (鉢底ネット)
    ctx.fillStyle = '#e9f1ea';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(60,110,70,0.22)';
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
    // 葉のついた枝
    const b0 = { x: r.x + r.w * 0.08, y: floor + 2 }, b1 = { x: r.x + r.w * 0.88, y: r.y + r.h * 0.5 };
    const twig0 = { x: r.x + r.w * 0.55, y: floor - (floor - b1.y) * 0.55 }, twig1 = { x: r.x + r.w * 0.68, y: r.y + r.h * 0.3 };
    const L = r.w * 0.11;
    const leafCol = ['#6f9f45', '#5f9140', '#7aaa4c'];
    const sway = Math.sin(t * 0.9) * 0.03;
    [[0.78, -2.3], [0.92, -0.6], [1.0, -1.4], [0.62, 0.5]].forEach(([k, a], i) => {
      leaf(ctx, lerp(b0.x, b1.x, k), lerp(b0.y, b1.y, k), L * (0.85 + (i % 2) * 0.25), a + sway, leafCol[i % 3]);
    });
    [[0.7, -2.0], [1.0, -1.1], [0.85, 0.1]].forEach(([k, a], i) => {
      leaf(ctx, lerp(twig0.x, twig1.x, k), lerp(twig0.y, twig1.y, k), L * (0.8 + (i % 2) * 0.3), a - sway, leafCol[(i + 1) % 3]);
    });
    limb(ctx, b0.x, b0.y, b1.x, b1.y, Math.max(5, r.w * 0.018), Math.max(3, r.w * 0.01), '#7a5a3a');
    limb(ctx, twig0.x, twig0.y, twig1.x, twig1.y, Math.max(3, r.w * 0.009), 2, '#7a5a3a');
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

  /* おなかを腹側から見た図。節の数を数えて性別を当てる。ハラビロカマキリなので幅広に描く */
  function belly(ctx, cx, cy, s, sex, color) {
    const pal = PALETTE[color];
    const n = sex === 'M' ? 8 : 6;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, -50);
    ctx.bezierCurveTo(30, -46, 26, 25, 3, 50);
    ctx.lineTo(-3, 50);
    ctx.bezierCurveTo(-26, 25, -30, -46, 0, -50);
    ctx.fillStyle = pal.body;
    ctx.fill();
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // 最後の線より下のとがった部分は節に数えない
    for (let i = 1; i <= n; i++) {
      const y = -50 + (90 * i) / n;
      const half = 22 * Math.sin(Math.PI * (0.12 + 0.8 * (y + 50) / 100)) + 1;
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

  /* ハラビロカマキリの卵鞘。茶色の楕円形のかたまりで、枝や壁にくっついている。
     x, y は中心、w は横の長さ */
  function ootheca(ctx, x, y, w) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-w / 2, w * 0.1);
    ctx.quadraticCurveTo(-w * 0.5, -w * 0.26, -w * 0.1, -w * 0.25);
    ctx.quadraticCurveTo(w * 0.35, -w * 0.24, w * 0.5, -w * 0.02);
    ctx.quadraticCurveTo(w * 0.62, w * 0.06, w * 0.62, w * 0.12);
    ctx.lineTo(-w / 2, w * 0.12);
    ctx.closePath();
    ctx.fillStyle = '#9b7b55';
    ctx.fill();
    ctx.strokeStyle = '#6e5538';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 背中の、卵が出てくる筋
    ctx.beginPath();
    ctx.moveTo(-w * 0.38, -w * 0.12);
    ctx.quadraticCurveTo(0, -w * 0.26, w * 0.42, -w * 0.06);
    ctx.strokeStyle = '#d9c7a4';
    ctx.lineWidth = Math.max(1, w * 0.05);
    ctx.stroke();
    ctx.restore();
  }

  return { HEAD, REACH, mantis, prey, cage, leaf, belly, ootheca, roundRect };
})();
