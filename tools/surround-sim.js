// Simula, no papel, o caminho de áudio do HeSuVi em estéreo (matriz virtual 7.1 -> convolução com HRIR -> mistura binaural),
// para (1) calcular o ganho que iguala o volume de cada nível de intensidade e (2) gerar WAVs de exemplo para ouvir.
// Só LÊ a pasta do HeSuVi. Uso: node tools/surround-sim.js <pasta HeSuVi\hrir> <hrir sem .wav> <pasta saida>
const fs = require('fs');
const path = require('path');
const [, , HRIR_DIR, HRIR, OUT] = process.argv;
const SR = 48000;

// ---- níveis (iguais aos que o hub grava em matrix.txt) ----
const LEVELS = {
  light:  { F: .70, C: .15, SL: [.25, -.10], RL: [.15, -.10] },
  medium: { F: .50, C: .20, SL: [.45, -.25], RL: [.30, -.20] },
  strong: { F: .40, C: .25, SL: [.60, -.30], RL: [.45, -.30] }
};
function matrix(lv) {            // devolve os 7 canais virtuais a partir de (L,R)
  return (L, R) => ({ L: lv.F * L, R: lv.F * R, C: lv.C * (L + R), SL: lv.SL[0] * L + lv.SL[1] * R, SR: lv.SL[1] * L + lv.SL[0] * R, RL: lv.RL[0] * L + lv.RL[1] * R, RR: lv.RL[1] * L + lv.RL[0] * R });
}

// ---- WAV ----
function readWav(f) {
  const b = fs.readFileSync(f); let p = 12, fmt = null, data = null;
  while (p < b.length - 8) { const id = b.toString('ascii', p, p + 4), n = b.readUInt32LE(p + 4); if (id === 'fmt ') fmt = { tag: b.readUInt16LE(p + 8), ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) }; if (id === 'data') { data = b.subarray(p + 8, p + 8 + n); break; } p += 8 + n + (n & 1); }
  const bytes = fmt.bits / 8, frames = Math.floor(data.length / (fmt.ch * bytes)), ch = Array.from({ length: fmt.ch }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.ch; c++) { const o = (i * fmt.ch + c) * bytes; ch[c][i] = fmt.bits === 32 ? data.readFloatLE(o) : fmt.bits === 16 ? data.readInt16LE(o) / 32768 : data.readIntLE(o, 3) / 8388608; }
  return { sr: fmt.sr, ch };
}
function writeWav(f, chs, sr) {
  const n = chs[0].length, nc = chs.length, buf = Buffer.alloc(44 + n * nc * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * nc * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(nc, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * nc * 2, 28); buf.writeUInt16LE(nc * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * nc * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(chs[c][i] * 32767))), 44 + (i * nc + c) * 2);
  fs.writeFileSync(f, buf);
}
// ---- FFT ----
function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = 2 * Math.PI / len * (inv ? -1 : 1), wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = i + k + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function convolve(x, h) {                      // convolução via FFT; devolve do tamanho de x
  let n = 1; while (n < x.length + h.length) n <<= 1;
  const xr = new Float64Array(n), xi = new Float64Array(n), hr = new Float64Array(n), hi = new Float64Array(n);
  xr.set(x); hr.set(h); fft(xr, xi); fft(hr, hi);
  for (let i = 0; i < n; i++) { const r = xr[i] * hr[i] - xi[i] * hi[i], m = xr[i] * hi[i] + xi[i] * hr[i]; xr[i] = r; xi[i] = m; }
  fft(xr, xi, true); return xr.subarray(0, x.length);
}
// ---- HRIR no formato do HeSuVi: 14 canais (ou 7, repetidos em ordem circular) ----
function loadHrir(name) {
  const w = readWav(path.join(HRIR_DIR, name + '.wav')); if (w.sr !== SR) throw new Error('HRIR não está em 48 kHz');
  return Array.from({ length: 14 }, (_, i) => w.ch[i % w.ch.length]);
}
// quem convolui com quem (índices da lista de canais do HeSuVi: L0 R1 SL0 SR1 RL0 RR1 C0 R0 L1 SR0 SL1 RR0 RL1 C1)
const LEFT_EAR  = [['L', 0], ['SL', 2], ['RL', 4], ['C', 6], ['R', 8], ['SR', 10], ['RR', 12]];
const RIGHT_EAR = [['L', 1], ['SL', 3], ['RL', 5], ['C', 13], ['R', 7], ['SR', 9], ['RR', 11]];
function surround(h, L, R, lv, gainDb) {
  const m = matrix(lv), sp = { L: new Float32Array(L.length), R: new Float32Array(L.length), C: new Float32Array(L.length), SL: new Float32Array(L.length), SR: new Float32Array(L.length), RL: new Float32Array(L.length), RR: new Float32Array(L.length) };
  for (let i = 0; i < L.length; i++) { const v = m(L[i], R[i]); for (const k in v) sp[k][i] = v[k]; }
  const g = Math.pow(10, gainDb / 20), ear = list => { const o = new Float32Array(L.length); for (const [k, ci] of list) { const y = convolve(sp[k], h[ci]); for (let i = 0; i < o.length; i++) o[i] += y[i] * g; } return o; };
  return [ear(LEFT_EAR), ear(RIGHT_EAR)];
}
const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
function noise(n, seed) { let s = seed; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; const o = new Float32Array(n); let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < n; i++) { const w = r(); b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; o[i] = (b0 + b1 + b2 + w * .1848) * .15; } return o; }

if (require.main === module) {
  fs.mkdirSync(OUT, { recursive: true });
  const h = loadHrir(HRIR), N = SR * 6, nl = noise(N, 1), nr = noise(N, 99), mono = noise(N, 7);
  const dryU = (rms(nl) + rms(nr)) / 2, dryM = rms(mono);
  const result = {};
  for (const [name, lv] of Object.entries(LEVELS)) {
    const [a, b] = surround(h, nl, nr, lv, 0), [c, d] = surround(h, mono, mono, lv, 0);
    const outU = (rms(a) + rms(b)) / 2, outM = (rms(c) + rms(d)) / 2;
    const dbU = 20 * Math.log10(outU / dryU), dbM = 20 * Math.log10(outM / dryM);
    result[name] = { semGanhoDb_naoCorrelacionado: +dbU.toFixed(2), semGanhoDb_mono: +dbM.toFixed(2), compensacaoDb: +(-(dbU * .6 + dbM * .4)).toFixed(1) };
  }
  console.log(JSON.stringify(result, null, 1));
  fs.writeFileSync(path.join(OUT, 'ganhos.json'), JSON.stringify(result));
  // ---- cena de exemplo: passos que atravessam, tiros à esquerda/direita e um tom que circula ----
  const T = SR * 9, L = new Float32Array(T), R = new Float32Array(T), nz = noise(T, 5);
  const burst = (t0, dur, pl, pr, f) => { for (let i = 0; i < dur * SR; i++) { const k = Math.floor(t0 * SR) + i; if (k >= T) break; const env = Math.exp(-i / (SR * dur * .22)); const s = nz[k] * env * f; L[k] += s * pl; R[k] += s * pr; } };
  for (let i = 0; i < 12; i++) { const pan = i / 11, t = .5 + i * .22; burst(t, .12, Math.cos(pan * Math.PI / 2), Math.sin(pan * Math.PI / 2), 3.2); }       // passos da esquerda para a direita
  burst(3.6, .35, 1, .15, 2.6); burst(4.4, .35, .15, 1, 2.6); burst(5.2, .35, .7, .7, 2.6);                                                            // tiros: esquerda, direita, centro
  for (let i = 0; i < SR * 3; i++) { const k = 5.9 * SR + i; if (k >= T) break; const a = i / SR * 2 * Math.PI * .9, f = 520 * (1 + .25 * Math.sin(a)), s = Math.sin(2 * Math.PI * f * i / SR) * .22 * Math.min(1, i / 2400) * Math.min(1, (SR * 3 - i) / 2400); L[k] += s * (.5 + .5 * Math.cos(a)); R[k] += s * (.5 + .5 * Math.sin(a)); }   // tom que se move
  let peak = 0; for (let i = 0; i < T; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); for (let i = 0; i < T; i++) { L[i] /= peak * 1.5; R[i] /= peak * 1.5; }
  writeWav(path.join(OUT, '0_sem_surround.wav'), [L, R], SR);
  let idx = 1; for (const [name, lv] of Object.entries(LEVELS)) { const [a, b] = surround(h, L, R, lv, result[name].compensacaoDb); writeWav(path.join(OUT, `${idx++}_${name === 'light' ? 'leve' : name === 'medium' ? 'medio' : 'forte'}.wav`), [a, b], SR); }
  console.log('WAVs gerados em', OUT);
}
module.exports = { LEVELS, matrix };
