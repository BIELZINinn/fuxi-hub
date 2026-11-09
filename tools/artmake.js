// Monta a arte de um jogo em 3 formatos: card (1500x1000), banner do aviso (1536x448, assunto à direita) e ícone (512x512).
//   modo "logo": logo claro sobre fundo escuro/liso -> separa o logo (máscara), reamostra com Lanczos e recompõe sobre fundo novo (nítido em qualquer tamanho)
//   modo "foto": amplia a imagem inteira com Real-ESRGAN (x4) e reduz para o tamanho final (supersampling = nitidez + menos ruído);
//                o que sobrar de moldura é preenchido estendendo as bordas com desfoque.
// Uso: electron tools/artmake.js <id> <pasta-origem> <pasta-saida> <pasta-temp>
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { resize1, boxBlur } = require('./imgutil.js');
const [, , ID, SRCDIR, OUT, TMP] = process.argv;
const ESR = process.env.ESRGAN_DIR;
const CW = 1500, CH = 1000, BW = 1536, BH = 448, IS = 512;

// ---- configurações por jogo ----
// logo: rect = região do logo na origem; color = cor fixa [r,g,b] ou null (média dos pixels mais claros); bg = [centro, borda]; glow = cor do brilho
// foto: card/banner = { s: escala (px finais por px da origem), ox, oy (posição da origem no quadro) , mode: 'mirror'|'clamp' }; icon = [x, y, lado] na origem
const CFG = {
  valorant: { mode: 'logo', rect: [185, 140, 370, 315], bg: [[52, 10, 16], [0, 0, 0]], glow: [255, 70, 85],
    card: [520, 750, 400], banner: [250, .72, .5], icon: [380, 256, 256] },
  apex: { mode: 'logo', rect: [0, 0, 1150, 800], bg: [[58, 9, 9], [0, 0, 0]], glow: [229, 72, 59],
    card: [800, 750, 400], banner: [340, .71, .5], icon: [430, 256, 256] },
  warzone: { mode: 'logo', rect: [150, 490, 480, 170], bg: [[26, 38, 24], [0, 0, 0]], glow: [126, 217, 87],
    card: [1000, 750, 390], banner: [380, .765, .46], icon: [440, 256, 256] },
  cs2: { mode: 'foto', model: 'realesrgan-x4plus-anime',
    card: { s: 1.06, ox: 177, oy: 62, mode: 'clamp' }, banner: { s: 1.23, ox: 939, oy: -139, mode: 'solid', fillBox: [300, 470, 220, 110], crop: [700, 0, 380, 608], erase: [700, 180, 66, 112] }, icon: [715, 130, 330] },
  gow: { mode: 'foto', model: 'realesrgan-x4plus',
    card: { s: 2.04, ox: 0, oy: 0, mode: 'mirror' }, banner: { s: 1.49, ox: 561, oy: -156, mode: 'mirror' }, icon: [225, 90, 270] },
  pubg: { mode: 'foto', model: 'realesrgan-x4plus',
    card: { s: 1.465, ox: 0, oy: -270, mode: 'mirror' }, banner: { s: 1.315, ox: 190, oy: -250, mode: 'mirror' }, icon: [150, 90, 740] },
  // ---- lote 2: enquadramento automático por ponto de foco (fx, fy) e zoom; fill = cor lisa para estender o fundo ----
  overwatch: { mode: 'foto', model: 'realesrgan-x4plus', card: { fx: .5, fy: .3, zoom: 1 }, banner: { fx: .55, fy: .45, zoom: 1.6 }, icon: [200, 80, 640] },
  r6: { mode: 'foto', model: 'realesrgan-x4plus', card: { fx: .5, fy: .5, zoom: 1 }, banner: { fx: .8, fy: .5, zoom: 1.5 }, icon: [50, 0, 127] },
  lol: { mode: 'foto', model: 'realesrgan-x4plus', card: { fx: .5, fy: .5, zoom: 1 }, banner: { fx: .41, fy: .45, zoom: 1.3 }, icon: [60, 0, 132] },
  gta5: { mode: 'foto', model: 'realesrgan-x4plus', card: { fx: .5, fy: .5, zoom: 1 }, banner: { fx: .5, fy: .5, zoom: 1.29 }, icon: [200, 0, 200] },
  rocketleague: { mode: 'foto', model: 'realesrgan-x4plus', card: { s: 2.1, ox: 0, oy: -51, mode: 'solid', fill: [0, 0, 0] }, banner: { s: .95, ox: 848, oy: 20, mode: 'solid', fill: [0, 0, 0] }, icon: [120, 84, 330] },
  cyberpunk: { mode: 'foto', model: 'realesrgan-x4plus', card: { fx: .5, fy: .43, zoom: 1 }, banner: { fx: .66, fy: .3, zoom: 1.3 }, icon: [150, 80, 300] },
  eldenring: { mode: 'foto', model: 'realesrgan-x4plus', card: { fx: .5, fy: .5, zoom: 1 }, banner: { fx: .5, fy: .5, zoom: 1 }, icon: [40, 0, 160] },
  rdr2: { mode: 'foto', model: 'realesrgan-x4plus', card: { s: 2.08, ox: 250, oy: 0, mode: 'clamp' }, banner: { fx: .5, fy: .22, zoom: 1.45 }, icon: [90, 10, 300] },
  dota2: { mode: 'foto', model: 'realesrgan-x4plus', card: { fx: .5, fy: .5, zoom: 1 }, banner: { fx: .48, fy: .4, zoom: 1.9 }, icon: [380, 180, 420] },
  bf2042: { mode: 'foto', model: 'realesrgan-x4plus', card: { fx: .5, fy: .5, zoom: 1 }, banner: { fx: .62, fy: .5, zoom: 1.2 }, icon: [30, 0, 130] },
  tarkov: { mode: 'foto', model: 'realesrgan-x4plus', card: { fx: .5, fy: .5, zoom: 1 }, banner: { fx: .5, fy: .5, zoom: 1, mode: 'solid', fill: [8, 8, 8] }, icon: [50, 0, 127] },
  witcher3: { mode: 'foto', model: 'realesrgan-x4plus', card: { fx: .5, fy: .4, zoom: 1 }, banner: { fx: .64, fy: .36, zoom: 1.05 }, icon: [18, 10, 200] }
};

const toJpg = (px, w, h, name) => {
  const out = nativeImage.createFromBitmap(px, { width: w, height: h }).toJPEG(94);
  fs.writeFileSync(path.join(OUT, name), out); console.log(name, w + 'x' + h, (out.length / 1024).toFixed(0) + ' KB');
};
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------- modo logo ----------
function logoMode(c) {
  const img = nativeImage.createFromPath(path.join(SRCDIR, ID + '.png')), { width: W, height: H } = img.getSize(), b = img.toBitmap();
  const [rx, ry, rw, rh] = c.rect;
  const m = new Float32Array(rw * rh); let peak = 0;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { const i = ((y + ry) * W + x + rx) * 4, v = Math.max(b[i], b[i + 1], b[i + 2]); m[y * rw + x] = v; if (v > peak) peak = v; }
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { m[y * rw + x] /= peak; if (m[y * rw + x] > .95) { const i = ((y + ry) * W + x + rx) * 4; sr += b[i + 2]; sg += b[i + 1]; sb += b[i]; n++; } }
  const col = [sr / n, sg / n, sb / n]; console.log('cor do logo', col.map(Math.round).join(','));
  const render = (name, cw, ch, [logoW, cxo, cyo], tint) => {
    const cx = cxo <= 1 ? cxo * cw : cxo, cy = cyo <= 1 ? cyo * ch : cyo;
    const scale = logoW / rw, lw = Math.round(logoW), lh = Math.round(rh * scale);
    const a = resize1(m, rw, rh, lw, lh), k = Math.max(1, scale / 1.1);
    for (let i = 0; i < a.length; i++) a[i] = clamp01((a[i] - .5) * k + .5);
    const L = new Float32Array(cw * ch), ox = Math.round(cx - lw / 2), oy = Math.round(cy - lh / 2);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) { const X = x + ox, Y = y + oy; if (X >= 0 && X < cw && Y >= 0 && Y < ch) L[Y * cw + X] = a[y * lw + x]; }
    const gl = boxBlur(L, cw, ch, Math.max(3, Math.round(ch * .035)));
    const px = Buffer.alloc(cw * ch * 4), [c0, c1] = c.bg;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = y * cw + x, d = Math.hypot((x - cx) / (cw * .55), (y - cy) / (ch * .9)), t = 1 - smooth(0, 1, d), dn = (Math.random() - .5) * 1.4;
      const g = Math.min(1, gl[i] * .5), al = L[i];
      const o = [0, 1, 2].map(j => { let v = c1[j] + (c0[j] - c1[j]) * t + dn; v += c.glow[j] * g * .35; return v * (1 - al) + col[j] * al; });
      px[i * 4] = o[2]; px[i * 4 + 1] = o[1]; px[i * 4 + 2] = o[0]; px[i * 4 + 3] = 255;
    }
    toJpg(px, cw, ch, name);
  };
  render(ID + '.jpg', CW, CH, c.card);
  render(ID + '-banner.jpg', BW, BH, c.banner);
  render(ID + '-icon.jpg', IS, IS, c.icon);
}

// ---------- modo foto ----------
function esrgan(srcPath, model, small) {
  const run = (i, o) => { if (!fs.existsSync(o)) execFileSync(path.join(ESR, 'realesrgan-ncnn-vulkan.exe'), ['-i', i, '-o', o, '-n', model, '-s', '4', '-m', path.join(ESR, 'models')], { cwd: ESR, timeout: 900000 }); return o; };
  const x4 = run(srcPath, path.join(TMP, ID + '_x4.png'));
  return nativeImage.createFromPath(small ? run(x4, path.join(TMP, ID + '_x16.png')) : x4);     // imagem minúscula: duas passadas (16x)
}
// enquadramento "cobrir": recorta a região (aspecto regW:regH) em torno do ponto de foco (fx,fy em 0..1) e leva para o quadro
function cover(W, H, o, regW, regH, regX) {
  const cw0 = Math.min(W, H * regW / regH), cropW = cw0 / (o.zoom || 1), cropH = cropW * regH / regW;
  const cx = Math.max(0, Math.min(W - cropW, o.fx * W - cropW / 2)), cy = Math.max(0, Math.min(H - cropH, o.fy * H - cropH / 2)), s = regW / cropW;
  return { s, ox: regX - cx * s, oy: -cy * s, mode: o.mode || 'mirror', fill: o.fill };
}
const reflect = (t, n) => { const p = ((t % (2 * n)) + 2 * n) % (2 * n); return p < n ? p : 2 * n - 1 - p; };
// coloca a imagem ampliada (escala s, canto em ox,oy) num quadro cw x ch; o que sobrar é estendido (espelho ou borda) e desfocado
function place(big, srcW, srcH, s, ox, oy, cw, ch, mode, fill) {
  ox = Math.round(ox); oy = Math.round(oy);
  const iw = Math.round(srcW * s), ih = Math.round(srcH * s), bm = big.resize({ width: iw, height: ih, quality: 'best' }).toBitmap();
  const ch3 = [new Float32Array(cw * ch), new Float32Array(cw * ch), new Float32Array(cw * ch)], inside = new Float32Array(cw * ch); let outside = 0;
  for (let Y = 0; Y < ch; Y++) for (let X = 0; X < cw; X++) {
    let u = X - ox, v = Y - oy; const ins = u >= 0 && u < iw && v >= 0 && v < ih;
    if (!ins && mode === 'solid') { outside++; ch3[0][Y * cw + X] = fill[0]; ch3[1][Y * cw + X] = fill[1]; ch3[2][Y * cw + X] = fill[2]; continue; }   // cor lisa (inside já é 0)
    if (!ins) { outside++; if (mode === 'mirror') { u = reflect(u, iw); v = reflect(v, ih); } else { u = Math.min(iw - 1, Math.max(0, u)); v = Math.min(ih - 1, Math.max(0, v)); } }
    const i = (v * iw + u) * 4, o = Y * cw + X;
    ch3[0][o] = bm[i + 2]; ch3[1][o] = bm[i + 1]; ch3[2][o] = bm[i];
    // suaviza a emenda só nas bordas da imagem que realmente aparecem dentro do quadro
    const INF = 1e9, d = Math.min(ox > 0 ? u : INF, ox + iw < cw ? iw - 1 - u : INF, oy > 0 ? v : INF, oy + ih < ch ? ih - 1 - v : INF);
    inside[o] = ins ? clamp01(d / 36) : 0;
  }
  if (outside) {
    const r = Math.round(cw * .012);
    for (let k = 0; k < 3; k++) { const bl = boxBlur(ch3[k], cw, ch, r); for (let o = 0; o < cw * ch; o++) ch3[k][o] = ch3[k][o] * inside[o] + bl[o] * (1 - inside[o]); }
  }
  const px = Buffer.alloc(cw * ch * 4);
  for (let o = 0; o < cw * ch; o++) { px[o * 4] = ch3[2][o]; px[o * 4 + 1] = ch3[1][o]; px[o * 4 + 2] = ch3[0][o]; px[o * 4 + 3] = 255; }
  return px;
}
function fotoMode(c) {
  const srcPath = path.join(SRCDIR, ID + '.png'), src = nativeImage.createFromPath(srcPath), { width: W, height: H } = src.getSize();
  const big = esrgan(srcPath, c.model, W * H < 100000);
  const card = c.card.s !== undefined ? c.card : cover(W, H, c.card, CW, CH, 0);
  toJpg(place(big, W, H, card.s, card.ox, card.oy, CW, CH, card.mode, card.fill), CW, CH, ID + '.jpg');
  if (c.banner.s === undefined && !c.banner.crop) {                // banner automático: assunto no lado direito (a esquerda é preenchida e fica sob a sombra do texto)
    const b = cover(W, H, c.banner, BW - 740, BH, 740);                // assunto na metade direita (a partir de ~48%), longe do texto
    toJpg(place(big, W, H, b.s, b.ox, b.oy, BW, BH, b.mode, b.fill), BW, BH, ID + '-banner.jpg');
  } else if (c.banner.crop) {                                           // banner só com um pedaço da arte (ex.: só o "2" do CS2, sem o texto que brigaria com o título)
    const [cx, cy, cw, chh] = c.banner.crop; let bb = big.crop({ x: cx * 4, y: cy * 4, width: cw * 4, height: chh * 4 });
    let fill = null;
    if (c.banner.mode === 'solid') {                              // cor lisa = média de um trecho sem texto
      const sb = src.toBitmap(), [fx, fy, fw, fh] = c.banner.fillBox; let r = 0, g = 0, b2 = 0, n = 0;
      for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) { const i = (y * W + x) * 4; b2 += sb[i]; g += sb[i + 1]; r += sb[i + 2]; n++; }
      fill = [r / n, g / n, b2 / n];
      if (c.banner.erase) {                                       // apaga restos de letras que entraram no recorte (pinta com a cor lisa)
        const px = Buffer.from(bb.toBitmap()), bw = cw * 4, [ex, ey, ew, eh] = c.banner.erase;
        for (let y = (ey - cy) * 4; y < (ey - cy + eh) * 4; y++) for (let x = (ex - cx) * 4; x < (ex - cx + ew) * 4; x++) {
          const i = (y * bw + x) * 4, x0 = (ex - cx) * 4, y0 = (ey - cy) * 4, d = Math.min(x - x0, x0 + ew * 4 - 1 - x, y - y0, y0 + eh * 4 - 1 - y), a = clamp01(d / 48);   // borda macia
          px[i] = px[i] * (1 - a) + fill[2] * a; px[i + 1] = px[i + 1] * (1 - a) + fill[1] * a; px[i + 2] = px[i + 2] * (1 - a) + fill[0] * a;   // BGRA
        }
        bb = nativeImage.createFromBitmap(px, { width: bw, height: chh * 4 });
      }
    }
    toJpg(place(bb, cw, chh, c.banner.s, c.banner.ox, c.banner.oy, BW, BH, c.banner.mode, fill), BW, BH, ID + '-banner.jpg');
  } else toJpg(place(big, W, H, c.banner.s, c.banner.ox, c.banner.oy, BW, BH, c.banner.mode, c.banner.fill), BW, BH, ID + '-banner.jpg');
  const [x, y, side] = c.icon, s = IS / side;
  toJpg(place(big, W, H, s, -x * s, -y * s, IS, IS, 'clamp'), IS, IS, ID + '-icon.jpg');
}

app.whenReady().then(() => {
  const c = CFG[ID]; if (!c) { console.log('sem configuração para', ID); return app.quit(); }
  try { c.mode === 'logo' ? logoMode(c) : fotoMode(c); } catch (e) { console.log('erro:', e && e.message); }
  app.quit();
});
