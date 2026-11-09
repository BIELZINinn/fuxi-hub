// Refaz a arte de um jogo que é "logo branco sobre fundo degradê liso" (ex.: Fortnite) em qualidade máxima.
// Em vez de ampliar pixels, separa o logo (a máscara vem do canal vermelho, que no fundo azul é ~0 e no logo branco é 255),
// reamostra a máscara com Lanczos e recompõe sobre um degradê reconstruído (ajuste polinomial do fundo). O logo fica nítido em qualquer tamanho.
// Uso: electron tools/logoart.js <id> <png-origem> <pasta-saida>
// Gera: <id>.jpg (card, 1600x1000), <id>-banner.jpg (aviso, 1536x448, logo à direita), <id>-icon.jpg (512x512)
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const [, , ID, SRC, OUT] = process.argv;

const { resize1, boxBlur } = require('./imgutil.js');
// mínimos quadrados para polinômio 2D de grau 4 (15 termos) em coordenadas normalizadas
function polyFit(pts, vals) {
  const terms = []; for (let i = 0; i <= 4; i++) for (let j = 0; i + j <= 4; j++) terms.push([i, j]);
  const n = terms.length, A = Array.from({ length: n }, () => new Float64Array(n + 1));
  pts.forEach(([x, y], k) => { const row = terms.map(([i, j]) => x ** i * y ** j); for (let a = 0; a < n; a++) { for (let b = 0; b < n; b++) A[a][b] += row[a] * row[b]; A[a][n] += row[a] * vals[k]; } });
  for (let c = 0; c < n; c++) {                          // eliminação de Gauss com pivô
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  const co = A.map((r, i) => r[n] / r[i]);
  return (x, y) => terms.reduce((s, [i, j], k) => s + co[k] * x ** i * y ** j, 0);
}

app.whenReady().then(() => {
  const img = nativeImage.createFromPath(SRC), { width: W, height: H } = img.getSize(), b = img.toBitmap();
  const R = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) R[i] = b[i * 4 + 2] / 255;
  // caixa do logo
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (R[y * W + x] > .5) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const M = 8; x0 -= M; y0 -= M; x1 += M; y1 += M;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const logo = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) logo[y * bw + x] = Math.min(1, R[(y + y0) * W + x + x0] * 1.02);
  // fundo: ajusta o degradê com os pixels fora do logo
  const pts = [], vals = [[], [], []];
  for (let y = 0; y < H; y += 6) for (let x = 0; x < W; x += 6) {
    if (x >= x0 - 14 && x <= x1 + 14 && y >= y0 - 14 && y <= y1 + 14) continue;
    pts.push([x / W * 2 - 1, y / H * 2 - 1]); const i = (y * W + x) * 4; vals[0].push(b[i + 2]); vals[1].push(b[i + 1]); vals[2].push(b[i]);
  }
  const fit = vals.map(v => polyFit(pts, v));
  // erro do ajuste nos pontos usados
  let err = 0; pts.forEach(([x, y], k) => { err += Math.abs(fit[1](x, y) - vals[1][k]); }); console.log('erro médio do fundo (G):', (err / pts.length).toFixed(2));
  const bgAt = (u, v) => { const x = Math.max(-1, Math.min(1, u)), y = Math.max(-1, Math.min(1, v)); return fit.map(f => Math.max(0, Math.min(255, f(x, y)))); };

  function render(name, cw, ch, logoW, cx, cy, bgMap) {
    const scale = logoW / bw, lw = Math.round(logoW), lh = Math.round(bh * scale);
    let a = resize1(logo, bw, bh, lw, lh);
    const k = Math.max(1, scale / 1.1);                  // ao ampliar, recupera a borda nítida do logo
    for (let i = 0; i < a.length; i++) a[i] = Math.max(0, Math.min(1, (a[i] - .5) * k + .5));
    const L = new Float32Array(cw * ch), ox = Math.round(cx - lw / 2), oy = Math.round(cy - lh / 2);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) { const X = x + ox, Y = y + oy; if (X >= 0 && X < cw && Y >= 0 && Y < ch) L[Y * cw + X] = a[y * lw + x]; }
    const sh = new Float32Array(cw * ch), off = Math.round(ch * .012);
    for (let y = off; y < ch; y++) for (let x = 0; x < cw; x++) sh[y * cw + x] = L[(y - off) * cw + x];
    const shb = boxBlur(sh, cw, ch, Math.max(2, Math.round(ch * .012)));
    const px = Buffer.alloc(cw * ch * 4);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = y * cw + x, bg = bgMap(x / cw, y / ch), d = (Math.random() - .5) * 1.6;    // ruído mínimo contra "degraus" no degradê
      const s = Math.min(1, shb[i] * .45), al = L[i];
      const c = [0, 1, 2].map(ch2 => { let v = bg[ch2] + d; v = v * (1 - s) + [0, 38, 110][ch2] * s; return v * (1 - al) + 255 * al; });
      px[i * 4] = c[2]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[0]; px[i * 4 + 3] = 255;
    }
    const out = nativeImage.createFromBitmap(px, { width: cw, height: ch }).toJPEG(94);
    fs.writeFileSync(path.join(OUT, name), out); console.log(name, cw + 'x' + ch, (out.length / 1024).toFixed(0) + ' KB');
  }
  // card: logo um pouco acima do centro (o texto do card fica embaixo)
  render(ID + '.jpg', 1600, 1000, 1120, 800, 400, (u, v) => bgAt((u - .5) * 1.0, (v - .5) * 1.0 + .25));
  // banner do aviso: logo à direita (o texto fica à esquerda, sobre a sombra escura); luz mais forte atrás do logo
  render(ID + '-banner.jpg', 1536, 448, 500, 1536 * .70, 448 * .38, (u, v) => bgAt((u - .70) * 1.2, (v - .5) * .5 + .3));
  // ícone quadrado (aviso compacto)
  render(ID + '-icon.jpg', 512, 512, 420, 256, 256, (u, v) => bgAt((u - .5) * 1.1, (v - .5) * 1.1 + .2));
  app.quit();
});
