// Recorte + upscale do fone a partir da foto original (fundo branco -> transparente).
// Uso: electron tools/cutout.js <pasta com 1.png> <pasta de saída> [pasta-de-comparação]
// Gera hero.png: recorte com bordas suaves (sem halo branco), ampliado 4x por Lanczos-3 com nitidez em duas escalas.
//
// Recorte (fundo branco puro):
//  1) máscara rígida do fundo: branco ligado à borda + vãos fechados + vãos estreitos entre peças
//  2) nos pixels de borda (1-2 px do fundo) obs = a*F + (1-a)*255  ->  resolve a (opacidade) e F (cor real) por mínimos quadrados
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const [, , inDir, outDir, cmpDir] = process.argv;
const SCALE = 4;

function neighbors4(i, w, h) { const x = i % w, y = (i / w) | 0, r = []; if (x > 0) r.push(i - 1); if (x < w - 1) r.push(i + 1); if (y > 0) r.push(i - w); if (y < h - 1) r.push(i + w); return r; }
function components(mask, w, h) {
  const N = w * h, lab = new Int32Array(N), comps = [];
  for (let s = 0; s < N; s++) {
    if (!mask[s] || lab[s]) continue;
    const id = comps.length + 1, list = [s]; lab[s] = id;
    for (let k = 0; k < list.length; k++) for (const j of neighbors4(list[k], w, h)) if (mask[j] && !lab[j]) { lab[j] = id; list.push(j); }
    comps.push(list);
  }
  return { lab, comps };
}

function matte(file) {
  const img = nativeImage.createFromPath(file);
  const { width: w, height: h } = img.getSize();
  const px = Buffer.from(img.toBitmap());
  const N = w * h;
  const mn = new Uint8Array(N), lum = new Float32Array(N);
  for (let i = 0; i < N; i++) { const b = px[i * 4], g = px[i * 4 + 1], r = px[i * 4 + 2]; mn[i] = Math.min(r, g, b); lum[i] = (r + g + b) / 3; }
  const sat = i => Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) - mn[i];

  const bg = new Uint8Array(N), st = [];
  const seed = i => { if (!bg[i] && mn[i] >= 247 && sat(i) <= 8) { bg[i] = 1; st.push(i); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (st.length) for (const j of neighbors4(st.pop(), w, h)) seed(j);

  const pure = new Uint8Array(N);
  for (let i = 0; i < N; i++) pure[i] = (!bg[i] && mn[i] >= 250) ? 1 : 0;
  for (const list of components(pure, w, h).comps) {
    let isBg = list.length >= 25;
    if (!isBg) { const set = new Set(list); let s = 0, c = 0; for (const i of list) for (const j of neighbors4(i, w, h)) if (!set.has(j) && !bg[j]) { s += lum[j]; c++; } isBg = c > 0 && s / c < 175; }
    if (isBg) list.forEach(i => { bg[i] = 1; });
  }
  // blobs claros colados no fundo
  for (let pass = 0; pass < 2; pass++) {
    const light = new Uint8Array(N);
    for (let i = 0; i < N; i++) light[i] = (!bg[i] && mn[i] >= 222) ? 1 : 0;
    for (const list of components(light, w, h).comps) {
      if (list.length > 700) continue;
      const set = new Set(list); let edge = 0, per = 0;
      for (const i of list) { let tb = false, to = false; for (const j of neighbors4(i, w, h)) { if (set.has(j)) continue; if (bg[j]) tb = true; else to = true; } if (tb || to) per++; if (tb) edge++; }
      if (per && edge / per >= 0.45) list.forEach(i => { bg[i] = 1; });
    }
  }
  // vãos estreitos de fundo entre peças (corpo cinza: pode crescer o fundo por pixels quase brancos)
  for (let step = 0; step < 6; step++) {
    const add = [];
    for (let i = 0; i < N; i++) {
      if (bg[i] || mn[i] < 240 || sat(i) > 10) continue;
      const x = i % w, y = (i / w) | 0; let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && bg[yy * w + xx]) { touch = true; break; } }
      if (touch) add.push(i);
    }
    if (!add.length) break; add.forEach(i => { bg[i] = 1; });
  }
  const fgm = new Uint8Array(N); for (let i = 0; i < N; i++) fgm[i] = bg[i] ? 0 : 1;
  for (const list of components(fgm, w, h).comps) if (list.length < 150) list.forEach(i => { bg[i] = 1; });

  const dist = new Int16Array(N).fill(-1), q = [];
  for (let i = 0; i < N; i++) if (bg[i]) { dist[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); } }
  }
  const F = new Float32Array(N * 3), alpha = new Float32Array(N);
  for (let i = 0; i < N; i++) { F[i * 3] = px[i * 4 + 2]; F[i * 3 + 1] = px[i * 4 + 1]; F[i * 3 + 2] = px[i * 4]; alpha[i] = bg[i] ? 0 : 1; }
  const estimate = (i, minDist) => {
    const x = i % w, y = (i / w) | 0; let r = 0, g = 0, b = 0, c = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (dist[j] >= minDist) { r += F[j * 3]; g += F[j * 3 + 1]; b += F[j * 3 + 2]; c++; } }
    return c ? [r / c, g / c, b / c] : null;
  };
  for (const level of [2, 1]) for (let i = 0; i < N; i++) {
    if (dist[i] !== level) continue;
    const est = estimate(i, level + 1) || [F[i * 3], F[i * 3 + 1], F[i * 3 + 2]];
    let num = 0, den = 0;
    for (let c = 0; c < 3; c++) { const o = 255 - F[i * 3 + c], f = 255 - est[c]; num += o * f; den += f * f; }
    let a = Math.max(0, Math.min(1, num / Math.max(den, 2700)));
    if (a < 0.1) a = 0; else if (a > 0.96) a = 1;
    alpha[i] = a;
    if (a < 1 && a > 0) { F[i * 3] = est[0]; F[i * 3 + 1] = est[1]; F[i * 3 + 2] = est[2]; }
  }
  // suavização leve do contorno
  for (let pass = 0; pass < 1; pass++) {
    const na = alpha.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; let near = false;
      for (let dy = -3; dy <= 3 && !near; dy += 3) for (let dx = -3; dx <= 3; dx += 3) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && alpha[yy * w + xx] < 0.999) { near = true; break; } }
      if (!near) continue;
      let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += alpha[(y + dy) * w + x + dx] * (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
      na[i] = s / 16;
    }
    alpha.set(na);
    for (let i = 0; i < N; i++) if (dist[i] === 0 && alpha[i] > 0.004) { const est = estimate(i, 1); if (est) { F[i * 3] = est[0]; F[i * 3 + 1] = est[1]; F[i * 3 + 2] = est[2]; } else alpha[i] = 0; }
  }
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha[y * w + x] > 0.02) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const pad = 8; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  // RGBA float "reto" (cor não pré-multiplicada em 0..255, alpha em 0..1), recortado
  const rgb = new Float32Array(cw * ch * 3), al = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = (y + y0) * w + (x + x0), o = y * cw + x;
    rgb[o * 3] = F[i * 3]; rgb[o * 3 + 1] = F[i * 3 + 1]; rgb[o * 3 + 2] = F[i * 3 + 2]; al[o] = alpha[i];
  }
  return { cw, ch, rgb, al, x0, y0 };
}

// ---------- reamostragem Lanczos-3 (separável) em canais float ----------
const lanczos = x => { x = Math.abs(x); if (x < 1e-8) return 1; if (x >= 3) return 0; const px = Math.PI * x; return 3 * Math.sin(px) * Math.sin(px / 3) / (px * px); };
function resizeChannels(data, ch, sw, sh, dw, dh) {          // data: Float32Array intercalado com ch canais
  const kx = (dstN, srcN) => {                                 // pesos por coordenada de saída
    const out = [], s = dstN / srcN;
    for (let d = 0; d < dstN; d++) {
      const c = (d + 0.5) / s - 0.5, i0 = Math.floor(c) - 2, idx = [], wt = []; let sum = 0;
      for (let k = 0; k < 6; k++) { const i = i0 + k, wv = lanczos(c - i); idx.push(Math.min(srcN - 1, Math.max(0, i))); wt.push(wv); sum += wv; }
      out.push({ idx, wt: wt.map(v => v / sum) });
    }
    return out;
  };
  const wx = kx(dw, sw), wy = kx(dh, sh);
  const tmp = new Float32Array(dw * sh * ch);
  for (let y = 0; y < sh; y++) for (let x = 0; x < dw; x++) { const { idx, wt } = wx[x]; for (let c = 0; c < ch; c++) { let s = 0; for (let k = 0; k < 6; k++) s += wt[k] * data[(y * sw + idx[k]) * ch + c]; tmp[(y * dw + x) * ch + c] = s; } }
  const out = new Float32Array(dw * dh * ch);
  for (let y = 0; y < dh; y++) { const { idx, wt } = wy[y]; for (let x = 0; x < dw; x++) for (let c = 0; c < ch; c++) { let s = 0; for (let k = 0; k < 6; k++) s += wt[k] * tmp[(idx[k] * dw + x) * ch + c]; out[(y * dw + x) * ch + c] = s; } }
  return out;
}
function gaussBlur(data, ch, w, h, sigma) {
  const r = Math.ceil(sigma * 3), k = []; let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; } for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(data.length), out = new Float32Array(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * data[(y * w + Math.min(w - 1, Math.max(0, x + i))) * ch + c]; tmp[(y * w + x) * ch + c] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * tmp[(Math.min(h - 1, Math.max(0, y + i)) * w + x) * ch + c]; out[(y * w + x) * ch + c] = s; }
  return out;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Cores vindas da IA (foto inteira ampliada 4x, fundo branco): recorta a mesma janela do matte e
// troca as cores das bordas pelas do interior, para não sobrar mistura com o branco do fundo.
function aiColors(aiFile, m, a, dw, dh) {
  const img = nativeImage.createFromPath(aiFile), { width: aw } = img.getSize(), px = Buffer.from(img.toBitmap());
  const N = dw * dh, col = new Float32Array(N * 3);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const s = ((y + m.y0 * SCALE) * aw + (x + m.x0 * SCALE)) * 4, o = (y * dw + x) * 3;
    col[o] = px[s + 2]; col[o + 1] = px[s + 1]; col[o + 2] = px[s];
  }
  // interior seguro = opacidade plena, afastado 3 px do contorno
  const solid = new Uint8Array(N); for (let i = 0; i < N; i++) solid[i] = a[i] >= 0.985 ? 1 : 0;
  let have = new Uint8Array(N);
  for (let y = 3; y < dh - 3; y++) for (let x = 3; x < dw - 3; x++) {
    const i = y * dw + x; if (!solid[i]) continue;
    let ok = true; for (let k = -3; k <= 3 && ok; k += 3) if (!solid[i - 3] || !solid[i + 3] || !solid[i - 3 * dw] || !solid[i + 3 * dw]) ok = false;
    have[i] = ok ? 1 : 0;
  }
  for (let pass = 0; pass < 10; pass++) {                  // espalha as cores do interior para a borda
    const nh = have.slice(), nc = col.slice(); let any = false;
    for (let y = 1; y < dh - 1; y++) for (let x = 1; x < dw - 1; x++) {
      const i = y * dw + x; if (have[i] || a[i] <= 0.004) continue;
      let r = 0, g = 0, b = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = i + dy * dw + dx; if (have[j]) { r += col[j * 3]; g += col[j * 3 + 1]; b += col[j * 3 + 2]; c++; } }
      if (c) { nc[i * 3] = r / c; nc[i * 3 + 1] = g / c; nc[i * 3 + 2] = b / c; nh[i] = 1; any = true; }
    }
    have = nh; col.set(nc); if (!any) break;
  }
  return col;
}

function upscale({ cw, ch, rgb, al }, m, aiFile) {
  const dw = cw * SCALE, dh = ch * SCALE;
  // cor ponderada pela opacidade (evita contaminar a borda), depois divide de volta
  const pm = new Float32Array(cw * ch * 4);
  for (let i = 0; i < cw * ch; i++) { pm[i * 4] = rgb[i * 3] * al[i]; pm[i * 4 + 1] = rgb[i * 3 + 1] * al[i]; pm[i * 4 + 2] = rgb[i * 3 + 2] * al[i]; pm[i * 4 + 3] = al[i]; }
  const up = resizeChannels(pm, 4, cw, ch, dw, dh);
  const N = dw * dh, col = new Float32Array(N * 3), a = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const A = Math.max(0, Math.min(1, up[i * 4 + 3]));
    const d = Math.max(A, 1e-3);
    col[i * 3] = Math.max(0, Math.min(255, up[i * 4] / d)); col[i * 3 + 1] = Math.max(0, Math.min(255, up[i * 4 + 1] / d)); col[i * 3 + 2] = Math.max(0, Math.min(255, up[i * 4 + 2] / d));
    a[i] = A;
  }
  // Lanczos + nitidez em duas escalas (detalhe fino + contraste local): fiel à foto, sem inventar textura
  const fine = gaussBlur(col, 3, dw, dh, 1.4), local = gaussBlur(col, 3, dw, dh, 5);
  for (let i = 0; i < N; i++) {
    if (a[i] < 0.5) continue;
    for (let c = 0; c < 3; c++) {
      const v = col[i * 3 + c], d1 = v - fine[i * 3 + c], d2 = v - local[i * 3 + c];
      col[i * 3 + c] = Math.max(0, Math.min(255, v + 0.9 * d1 + 0.18 * d2));
    }
  }
  if (aiFile) {
    // A IA deixa superfícies lisas e texto muito mais nítidos, mas inventa padrões no tecido escuro
    // (quadrados/rachaduras nas almofadas). Mistura: áreas escuras ficam com o Lanczos fiel, áreas claras com a IA.
    const ai = aiColors(aiFile, m, a, dw, dh);
    const sm = (x0, x1, x) => { const t = Math.max(0, Math.min(1, (x - x0) / (x1 - x0))); return t * t * (3 - 2 * t); };
    const lumL = new Float32Array(N); for (let i = 0; i < N; i++) lumL[i] = (col[i * 3] + col[i * 3 + 1] + col[i * 3 + 2]) / 3;
    const lumB = gaussBlur(lumL, 1, dw, dh, 3);               // luminância local (suave), para decidir por região e não por pixel
    for (let i = 0; i < N; i++) {
      const dark = 1 - sm(100, 150, lumB[i]);                 // 1 = região escura (tecido), 0 = região clara
      const wl = 0.95 * dark;                                 // peso do Lanczos
      for (let c = 0; c < 3; c++) col[i * 3 + c] = ai[i * 3 + c] * (1 - wl) + col[i * 3 + c] * wl;
    }
  }
  // contorno nítido: curva S na opacidade (remove o "borrão" do Lanczos sem serrilhar)
  for (let i = 0; i < N; i++) a[i] = smooth(0.12, 0.88, a[i]);
  const out = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) { const A = a[i]; out[i * 4] = col[i * 3 + 2] * A; out[i * 4 + 1] = col[i * 3 + 1] * A; out[i * 4 + 2] = col[i * 3] * A; out[i * 4 + 3] = A * 255; }
  return { dw, dh, out };
}

app.whenReady().then(() => {
  fs.mkdirSync(outDir, { recursive: true });
  const m = matte(path.join(inDir, '1.png'));
  const aiFile = process.env.AI_X4 && fs.existsSync(process.env.AI_X4) ? process.env.AI_X4 : null;   // foto inteira ampliada 4x pela IA
  const { dw, dh, out } = upscale(m, m, aiFile);
  fs.writeFileSync(path.join(outDir, 'hero.png'), nativeImage.createFromBitmap(out, { width: dw, height: dh }).toPNG());
  console.log('hero.png', `${m.cw}x${m.ch} -> ${dw}x${dh}`, aiFile ? '(cores por IA)' : '(Lanczos)', 'offset', m.x0, m.y0);
  if (cmpDir) {                                            // comparação: ampliação simples do Electron (sem nitidez)
    fs.mkdirSync(cmpDir, { recursive: true });
    const plain = Buffer.alloc(m.cw * m.ch * 4);
    for (let i = 0; i < m.cw * m.ch; i++) { const A = m.al[i]; plain[i * 4] = m.rgb[i * 3 + 2] * A; plain[i * 4 + 1] = m.rgb[i * 3 + 1] * A; plain[i * 4 + 2] = m.rgb[i * 3] * A; plain[i * 4 + 3] = A * 255; }
    const p = nativeImage.createFromBitmap(plain, { width: m.cw, height: m.ch }).resize({ width: dw, height: dh, quality: 'best' });
    fs.writeFileSync(path.join(cmpDir, 'plain.png'), p.toPNG());
  }
  app.quit();
});
