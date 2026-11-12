// Gera o "desenho técnico" do Fuxi H3 a partir da foto (assets/fuxi/hero.png): contornos da silhueta e das regiões de tom (casco, almofadas, faixa, microfone, aberturas).
// Uso: electron tools/lineart.js [saida.js] [preview.png]
// Saída: src/herolines.js  ->  window.HERO_LINES = { w, h, paths: [ { d, len, k } ] }  (k: 0 silhueta · 1 forma principal · 2 detalhe)
const { app, nativeImage, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(root, 'src', 'herolines.js');
const PREV = process.argv[3] || '';
const SC = 0.5;                                                   // trabalha em meia resolução (o desenho é vetorial, a escala não importa)

function blur(src, w, h, s) {                                     // gaussiana separável
  const r = Math.ceil(s * 3), k = []; let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-i * i / (2 * s * s)); k.push(v); sum += v; } for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) { const xx = Math.min(w - 1, Math.max(0, x + i)); a += src[y * w + xx] * k[i + r]; } tmp[y * w + x] = a; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) { const yy = Math.min(h - 1, Math.max(0, y + i)); a += tmp[yy * w + x] * k[i + r]; } out[y * w + x] = a; }
  return out;
}

function contours(f, w, h, t) {                                   // marching squares com interpolação linear -> polilinhas (abertas ou fechadas)
  const pts = new Map(), segs = [];
  const P = (id, fn) => { if (!pts.has(id)) pts.set(id, fn()); return id; };
  const fr = (a, b) => (t - a) / (b - a);
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const tl = f[y * w + x], tr = f[y * w + x + 1], br = f[(y + 1) * w + x + 1], bl = f[(y + 1) * w + x];
    const c = (tl >= t ? 8 : 0) | (tr >= t ? 4 : 0) | (br >= t ? 2 : 0) | (bl >= t ? 1 : 0); if (c === 0 || c === 15) continue;
    const T = () => P((y * w + x) * 2, () => [x + fr(tl, tr), y]), B = () => P(((y + 1) * w + x) * 2, () => [x + fr(bl, br), y + 1]);
    const L = () => P((y * w + x) * 2 + 1, () => [x, y + fr(tl, bl)]), R = () => P((y * w + x + 1) * 2 + 1, () => [x + 1, y + fr(tr, br)]);
    const mid = (tl + tr + br + bl) / 4 >= t, add = (a, b) => segs.push([a(), b()]);
    switch (c) {
      case 1: case 14: add(L, B); break; case 2: case 13: add(B, R); break; case 3: case 12: add(L, R); break;
      case 4: case 11: add(T, R); break; case 6: case 9: add(T, B); break; case 7: case 8: add(T, L); break;
      case 5: if (mid) { add(T, L); add(B, R); } else { add(T, R); add(L, B); } break;
      case 10: if (mid) { add(T, R); add(L, B); } else { add(T, L); add(B, R); } break;
    }
  }
  const adj = new Map(); segs.forEach((s, i) => { for (const e of s) { if (!adj.has(e)) adj.set(e, []); adj.get(e).push(i); } });
  const used = new Uint8Array(segs.length), lines = [];
  const walk = (start, e) => { const out = []; let cur = e; for (;;) { const nx = (adj.get(cur) || []).find(i => !used[i]); if (nx === undefined) break; used[nx] = 1; const s = segs[nx]; cur = s[0] === cur ? s[1] : s[0]; out.push(cur); } return out; };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = 1;
    const [a, b] = segs[i], fwd = walk(i, b), back = walk(i, a);
    lines.push([...back.reverse(), a, b, ...fwd].map(id => pts.get(id)));
  }
  return lines;
}
function simplify(p, eps) {                                       // Douglas-Peucker
  if (p.length < 3) return p; const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
  const st = [[0, p.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let m = 0, mi = -1; const [ax, ay] = p[a], [bx, by] = p[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((p[i][0] - ax) * dy - (p[i][1] - ay) * dx) / L; if (d > m) { m = d; mi = i; } }
    if (m > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return p.filter((_, i) => keep[i]);
}
const plen = p => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; };
function smoothPath(p) {                                          // curva suave por pontos médios (quadráticas)
  if (p.length < 3) return 'M' + p.map(q => q.map(v => +v.toFixed(1)).join(' ')).join('L');
  const f = v => +v.toFixed(1); let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; d += `Q${f(p[i][0])} ${f(p[i][1])} ${f(mx)} ${f(my)}`; }
  const e = p[p.length - 1]; return d + `L${f(e[0])} ${f(e[1])}`;
}

app.whenReady().then(async () => {
  const img = nativeImage.createFromPath(path.join(root, 'assets', 'fuxi', 'hero.png'));
  const full = img.getSize(), w = Math.round(full.width * SC), h = Math.round(full.height * SC);
  const bm = img.resize({ width: w, height: h, quality: 'best' }).toBitmap();                 // BGRA
  const A = new Float32Array(w * h), Lm = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const a = bm[i * 4 + 3] / 255; A[i] = a; Lm[i] = (0.114 * bm[i * 4] + 0.587 * bm[i * 4 + 1] + 0.299 * bm[i * 4 + 2]) * a; }
  const Ab = blur(A, w, h, 1.4), Lb = blur(Lm, w, h, 4.2), Ld = blur(Lm, w, h, 2.0);
  const out = [];
  // sem linhas duplicadas: cada trecho só entra se não estiver colado (< 4 px) numa linha já aceita; trechos ruidosos (muito tortuosos) são descartados
  const grid = new Map(), G = 4, key = (x, y) => ((x / G) | 0) + ',' + ((y / G) | 0);
  const near = (x, y) => { const gx = (x / G) | 0, gy = (y / G) | 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const c = grid.get((gx + i) + ',' + (gy + j)); if (c) for (const q of c) if (Math.hypot(q[0] - x, q[1] - y) < 4.2) return true; } return false; };
  const put = (x, y) => { const k = key(x, y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, y]); };
  const resample = (p, step) => { const o = [p[0]]; let acc = 0; for (let i = 1; i < p.length; i++) { let [x0, y0] = p[i - 1]; const [x1, y1] = p[i], d = Math.hypot(x1 - x0, y1 - y0); let r = d; while (acc + r >= step) { const t = (step - acc) / r; x0 += (x1 - x0) * t; y0 += (y1 - y0) * t; o.push([x0, y0]); r = Math.hypot(x1 - x0, y1 - y0); acc = 0; } acc += r; } o.push(p[p.length - 1]); return o; };
  const tort = p => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return plen(p) / Math.max(20, 2 * ((x1 - x0) + (y1 - y0))); };
  const cand = [];
  const take = (lines, minLen, eps, k) => {
    for (const l of lines) {
      const closed = l.length > 8 && Math.hypot(l[0][0] - l[l.length - 1][0], l[0][1] - l[l.length - 1][1]) < 1e-6;     // laço fechado: simplifica em duas metades
      let s; if (closed) { const m = l.length >> 1, a = simplify(l.slice(0, m + 1), eps), b = simplify(l.slice(m), eps); s = [...a, ...b.slice(1)]; } else s = simplify(l, eps);
      const len = plen(s); if (len >= minLen && (k === 0 || tort(s) < 1.45)) cand.push({ pts: l, len, k, closed });
    }
  };
  take(contours(Ab, w, h, 0.5), 60, 1.1, 0);                                                    // silhueta
  for (const t of [50, 100, 150]) take(contours(Lb, w, h, t), 100, 1.6, 1);                      // formas de tom (grandes e suaves)
  for (const t of [70, 105, 140, 175]) take(contours(Ld, w, h, t), 42, 1.2, 2);                            // detalhes menores (aberturas, logo, microfone)
  cand.sort((a, b) => a.k - b.k || b.len - a.len);
  for (const c of cand) {
    const r = resample(c.pts, 2.5); let run = [];
    const simp = (p, e) => { if (p.length > 8 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 1e-6) { const m = p.length >> 1; return [...simplify(p.slice(0, m + 1), e), ...simplify(p.slice(m), e).slice(1)]; } return simplify(p, e); };
    const flush = () => { if (run.length > 1) { const s = simp(run, c.k === 0 ? 1.1 : 1.5), len = plen(s); if (len >= (c.k === 0 ? 40 : 45)) { out.push({ pts: s, len, k: c.k }); for (const q of run) put(q[0], q[1]); } } run = []; };
    for (const q of r) { if (near(q[0], q[1])) flush(); else run.push(q); }
    flush();
  }
  const paths = out.map(o => ({ d: smoothPath(o.pts), len: Math.round(o.len), k: o.k, cx: Math.round(o.pts.reduce((s, p) => s + p[0], 0) / o.pts.length), cy: Math.round(o.pts.reduce((s, p) => s + p[1], 0) / o.pts.length) }));
  fs.writeFileSync(OUT, `// gerado por tools/lineart.js a partir de assets/fuxi/hero.png\nwindow.HERO_LINES = ${JSON.stringify({ w, h, paths })};\n`);
  console.log('caminhos:', paths.length, 'k0:', paths.filter(p => p.k === 0).length, 'k1:', paths.filter(p => p.k === 1).length, 'k2:', paths.filter(p => p.k === 2).length, 'bytes:', fs.statSync(OUT).size);
  if (PREV) {
    const cols = ['#ffffff', '#2ef2ff', '#a07bff'];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="background:#000">${paths.map(p => `<path d="${p.d}" fill="none" stroke="${cols[p.k]}" stroke-width="${p.k === 0 ? 2 : 1.3}" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}</svg>`;
    const win = new BrowserWindow({ show: false, width: w, height: h, webPreferences: { offscreen: true } });
    await win.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:#000">${svg}</body>`));
    await new Promise(r => setTimeout(r, 600));
    fs.writeFileSync(PREV, (await win.webContents.capturePage()).toPNG());
  }
  app.quit();
});
