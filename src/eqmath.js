// Matemática do equalizador (compartilhada entre a interface e o processo principal).
// Resposta em frequência de filtros "peaking" (fórmulas RBJ), a mesma família que o Equalizer APO usa em "PK".
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FS = 48000, Q = 1.41;

  // tipos de filtro: PK = pico (sino), LSC = prateleira de graves (low shelf), HSC = prateleira de agudos (high shelf) — os mesmos nomes do Equalizer APO
  const TYPES = ['PK', 'LSC', 'HSC'];
  function coefs(fc, gainDb, q, type) {
    const A = Math.pow(10, gainDb / 40), w0 = 2 * Math.PI * fc / FS, alpha = Math.sin(w0) / (2 * q), cw = Math.cos(w0);
    if (type === 'LSC' || type === 'HSC') {                                   // fórmulas RBJ de shelving, com Q
      const s = 2 * Math.sqrt(A) * alpha;
      if (type === 'LSC') {
        const a0 = (A + 1) + (A - 1) * cw + s;
        return [A * ((A + 1) - (A - 1) * cw + s) / a0, 2 * A * ((A - 1) - (A + 1) * cw) / a0, A * ((A + 1) - (A - 1) * cw - s) / a0, -2 * ((A - 1) + (A + 1) * cw) / a0, ((A + 1) + (A - 1) * cw - s) / a0];
      }
      const a0 = (A + 1) - (A - 1) * cw + s;
      return [A * ((A + 1) + (A - 1) * cw + s) / a0, -2 * A * ((A - 1) + (A + 1) * cw) / a0, A * ((A + 1) + (A - 1) * cw - s) / a0, 2 * ((A - 1) - (A + 1) * cw) / a0, ((A + 1) - (A - 1) * cw - s) / a0];
    }
    const a0 = 1 + alpha / A;
    return [(1 + alpha * A) / a0, (-2 * cw) / a0, (1 - alpha * A) / a0, (-2 * cw) / a0, (1 - alpha / A) / a0];   // b0 b1 b2 a1 a2
  }
  function magDb(c, f) {
    const w = 2 * Math.PI * f / FS, cw = Math.cos(w), sw = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = c[0] + c[1] * cw + c[2] * c2, ni = -(c[1] * sw + c[2] * s2);
    const dr = 1 + c[3] * cw + c[4] * c2, di = -(c[3] * sw + c[4] * s2);
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  function logFreqs(n, lo = 20, hi = 20000) {
    const out = [], a = Math.log10(lo), b = Math.log10(hi);
    for (let i = 0; i < n; i++) out.push(Math.pow(10, a + (b - a) * i / (n - 1)));
    return out;
  }
  // soma (em dB) das respostas de todas as faixas, em cada frequência
  // bands = frequências centrais; q pode ser um número (igual para todas) ou uma lista (um Q por faixa)
  function response(bands, gains, q, freqs, types) {                         // types (opcional): 'PK' | 'LSC' | 'HSC' por faixa
    const cs = gains.map((g, i) => (g === 0 ? null : coefs(bands[i], g, Array.isArray(q) ? q[i] : q, types && types[i])));
    return freqs.map(f => cs.reduce((s, c) => (c ? s + magDb(c, f) : s), 0));
  }
  const peak = (bands, gains, q, types) => Math.max(...response(bands, gains, q, logFreqs(600), types));
  // preamp que impede o som de estourar: -(pico real) com 0,5 dB de folga; sem reforço não precisa de preamp
  const preamp = (bands, gains, q, types) => { const p = peak(bands, gains, q, types); return p > 0 ? -(p + 0.5) : 0; };

  // Normaliza um preset: aceita o formato antigo (lista de 10 ganhos) ou {g, f, q}; sempre devolve valores válidos
  const LIM = { g: [-12, 12], f: [20, 20000], q: [0.3, 8] };
  function normalize(x, defBands) {
    const arr = Array.isArray(x), n = defBands.length;
    const g = (arr ? x : (x && x.g)) || [], f = (!arr && x && x.f) || [], q = (!arr && x && x.q) || [], t = (!arr && x && x.t) || [];
    const num = (v, d, lim) => { v = Number(v); return Number.isFinite(v) ? Math.max(lim[0], Math.min(lim[1], v)) : d; };
    return {
      g: defBands.map((_, i) => Math.round(num(g[i], 0, LIM.g) * 2) / 2),
      f: defBands.map((b, i) => Number(num(f[i], b, LIM.f).toPrecision(3))),
      q: defBands.map((_, i) => Math.round(num(q[i], Q, LIM.q) * 100) / 100),
      t: defBands.map((_, i) => (TYPES.includes(t[i]) ? t[i] : 'PK'))
    };
  }
  const valid = (x, n) => { const g = Array.isArray(x) ? x : x && x.g; return Array.isArray(g) && g.length === n && g.every(Number.isFinite); };

  return { response, logFreqs, peak, preamp, coefs, magDb, normalize, valid, LIM, Q, FS, TYPES };
});
