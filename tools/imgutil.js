// Funções de imagem compartilhadas pelas ferramentas de arte (Lanczos-3 separável e desfoque de caixa).
const lanczos = (x, a = 3) => x === 0 ? 1 : Math.abs(x) >= a ? 0 : a * Math.sin(Math.PI * x) * Math.sin(Math.PI * x / a) / (Math.PI * Math.PI * x * x);
function resize1(src, sw, sh, dw, dh) {                  // canal único, Float32 0..1, Lanczos-3 separável (com filtro alargado ao reduzir)
  const pass = (inp, w, h, nw, horiz) => {
    const out = new Float32Array(horiz ? nw * h : w * nw), len = horiz ? w : h, n = nw, sc = len / n, f = Math.max(1, sc), r = Math.ceil(3 * f);
    const outer = horiz ? h : w;
    for (let i = 0; i < n; i++) {
      const c = (i + .5) * sc - .5, lo = Math.floor(c) - r + 1, hi = Math.floor(c) + r, ws = [], idx = [];
      let sum = 0;
      for (let k = lo; k <= hi; k++) { const wk = lanczos((k - c) / f), kk = Math.min(len - 1, Math.max(0, k)); ws.push(wk); idx.push(kk); sum += wk; }
      for (let o = 0; o < outer; o++) {
        let v = 0;
        for (let j = 0; j < ws.length; j++) v += ws[j] * (horiz ? inp[o * w + idx[j]] : inp[idx[j] * w + o]);
        if (horiz) out[o * n + i] = v / sum; else out[i * w + o] = v / sum;
      }
    }
    return out;
  };
  return pass(pass(src, sw, sh, dw, true), dw, sh, dh, false);
}
function boxBlur(a, w, h, r) {                            // desfoque de caixa 2 passadas (para a sombra suave)
  let cur = a;
  for (let p = 0; p < 2; p++) {
    const t = new Float32Array(w * h), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += cur[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[y * w + x] = s / (2 * r + 1); s += cur[y * w + Math.min(w - 1, x + r + 1)] - cur[y * w + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { o[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
    cur = o;
  }
  return cur;
}
module.exports = { lanczos, resize1, boxBlur };
