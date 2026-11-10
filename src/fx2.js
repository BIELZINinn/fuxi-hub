// Camada visual extra: tema de cor, transição de preset, fone reativo, espectro, sons da interface, brilho do cursor, contagem animada.
(function () {
  const Q = s => document.querySelector(s);
  const PAL = { cyan: '#2ef2ff', green: '#3ddc5a', purple: '#a78bfa', red: '#ff4d6d', amber: '#ffb347' };
  const rgb = h => { h = String(h).replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
  const rm = () => document.body.classList.contains('rm');
  const t0 = performance.now();
  let lastAcc = '', lastKey = null, lastGame = null, firstState = true, micDot = null;

  // ---------- tema: cor fixa ou seguindo o preset / jogo ----------
  function accentNow() {
    const t = (S.ui && S.ui.theme) || 'auto';
    if (t !== 'auto') return PAL[t] || PAL.cyan;
    const g = S.game && prof(S.game), a = prof(S.active);
    return (g && g.color) || (a && a.color) || PAL.cyan;
  }
  function applyTheme() {
    const h = accentNow(); if (h === lastAcc) return; lastAcc = h;
    const s = document.documentElement.style; s.setProperty('--ac', h); s.setProperty('--acg', `rgba(${rgb(h)},.35)`);
  }

  // ---------- transição ao trocar de preset ----------
  function wash(name, sub, color) {
    if (!S.ui || S.ui.presetWash === false || document.visibilityState !== 'visible' || rm()) return;
    if (window.Tour && Tour.isActive && Tour.isActive()) return;
    document.querySelectorAll('.wash').forEach(w => w.remove());
    const w = document.createElement('div'); w.className = 'wash'; w.style.setProperty('--wc', color || '#2ef2ff');
    w.innerHTML = `<i></i><div><small>${esc(sub)}</small><b>${esc(name)}</b></div>`;
    document.body.appendChild(w); setTimeout(() => w.remove(), 1900);
  }

  // ---------- sons discretos da interface ----------
  let ac = null;
  function snd(kind) {
    if (!S || !S.ui || S.ui.uiSounds === false || S.noSound || rm() || document.visibilityState !== 'visible') return;
    const P = { on: [520, 800, .1, .05], off: [520, 330, .1, .05], tab: [640, 900, .08, .04], tick: [440, 440, .035, .03], ach: [660, 1320, .5, .07] }[kind]; if (!P) return;
    try {
      ac = ac || new AudioContext(); const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = kind === 'ach' ? 'triangle' : 'sine'; o.frequency.setValueAtTime(P[0], t); o.frequency.exponentialRampToValueAtTime(P[1], t + P[2]);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(P[3], t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + P[2] + .05);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + P[2] + .08);
    } catch {}
  }
  document.addEventListener('change', e => { if (e.target.matches && e.target.matches('.switch input')) snd(e.target.checked ? 'on' : 'off'); });
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('.nav,.ghost,.solid,.seg button,.q,.hcols button'); if (!b) return;
    snd(b.classList.contains('nav') ? 'tab' : 'tick');
  });

  // ---------- brilho que acompanha o cursor nos cartões ----------
  document.addEventListener('pointermove', e => {
    const c = e.target.closest && e.target.closest('.card,.mrow,.svc,.cmc,.ach'); if (!c) return;
    const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  // ---------- contagem animada de números ----------
  function count(el, to, o = {}) {
    if (!el) return; const dec = o.dec || 0, suf = o.suffix || '', from = el._cv != null ? el._cv : 0, dur = rm() ? 1 : (o.dur || 1000), st = performance.now();
    el._cv = to; cancelAnimationFrame(el._raf);
    const f = now => { const p = Math.min(1, (now - st) / dur), e = 1 - Math.pow(1 - p, 3), v = from + (to - from) * e; el.textContent = v.toFixed(dec).replace('.', ',') + suf; if (p < 1) el._raf = requestAnimationFrame(f); };
    el._raf = requestAnimationFrame(f);
  }

  // ---------- fone reativo (Início) ----------
  function homeSetup() {
    const viewer = Q('#viewer'), hp = Q('.hp'); if (!viewer || !hp || viewer.dataset.fx) return; viewer.dataset.fx = '1';
    const gb = document.createElement('div'); gb.className = 'gbg'; viewer.prepend(gb);
    const sp = document.createElement('canvas'); sp.id = 'spHome'; viewer.insertBefore(sp, viewer.querySelector('.hero3d'));
    const wv = document.createElement('div'); wv.className = 'hwave'; hp.appendChild(wv);
    micDot = document.createElement('div'); micDot.className = 'hmic'; hp.appendChild(micDot);
  }
  function homeFx(presetChanged, gameStarted) {
    homeSetup();
    const gb = Q('.gbg'), gp = S.game && prof(S.game), url = gp && gp.banner ? gp.banner : '';
    if (gb) { if (gb.dataset.u !== url) { gb.dataset.u = url; gb.style.backgroundImage = url ? `url('${url}')` : ''; } gb.classList.toggle('on', !!url); }
    const img = Q('.hp img'), wv = Q('.hwave');
    if (img && wv) { const m = `url("${img.src}")`; wv.style.webkitMaskImage = m; wv.style.maskImage = m; }
    if (presetChanged && wv && !rm()) { wv.classList.remove('go'); void wv.offsetWidth; wv.classList.add('go'); }
    if (gameStarted && !rm()) {
      const hp = Q('.hp'), ring = Q('.pulse'); hp.classList.remove('pop'); void hp.offsetWidth; hp.classList.add('pop');
      if (ring) { ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go'); }
    }
  }
  setInterval(async () => {                                              // luz vermelha no microfone quando está mutado
    if (typeof page === 'undefined' || page !== 'home' || !S || !S.device || !S.device.known || !micDot) return;
    try { const m = await hub.micGet(); micDot.classList.toggle('on', !!(m && m.mute)); } catch {}
  }, 3500);

  // ---------- espectro ao vivo ----------
  function fit(cv, w, h) { const d = devicePixelRatio || 1; if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); } const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, w, h); return c; }
  const accRGB = () => rgb(lastAcc || '#2ef2ff').join(',');
  let smooth = null;
  function drawHome() {
    const cv = Q('#spHome'); if (!cv) return; const w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
    const c = fit(cv, w, h), N = 64, v = Spectrum.bins(N) || new Array(N).fill(0), bw = w / N, a = accRGB();
    smooth = smooth || new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      smooth[i] += (v[i] - smooth[i]) * (v[i] > smooth[i] ? .5 : .12);
      const hh = 2 + Math.pow(smooth[i], 1.4) * (h * .8), x = i * bw + bw * .18, ww = bw * .64, fade = Math.sin(Math.PI * (i + .5) / N) * .7 + .3;
      const g = c.createLinearGradient(0, h - hh, 0, h); g.addColorStop(0, `rgba(${a},${.75 * fade})`); g.addColorStop(1, `rgba(${a},${.06 * fade})`);
      c.fillStyle = g; c.beginPath(); c.roundRect(x, h - hh, ww, hh, 3); c.fill();
    }
  }
  function drawEqSp() {
    const wrap = Q('.eqwrap'); if (!wrap || typeof eqGeom === 'undefined' || !eqGeom) return;
    let cv = Q('#spEq'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'spEq'; wrap.insertBefore(cv, wrap.firstChild); }
    const { W, H, pw, ph } = eqGeom, c = fit(cv, W, H), N = 110, v = Spectrum.bins(N, 20, 20000) || new Array(N).fill(0), a = accRGB(), base = EQ.mt + ph;
    const pts = v.map((m, i) => { const f = 20 * Math.pow(1000, (i + .5) / N); return [eqGeom.X(f), base - Math.pow(m, 1.3) * ph * .8]; });
    c.beginPath(); c.moveTo(EQ.ml, base); pts.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(EQ.ml + pw, base); c.closePath();
    const g = c.createLinearGradient(0, EQ.mt, 0, base); g.addColorStop(0, `rgba(${a},.28)`); g.addColorStop(1, `rgba(${a},.02)`); c.fillStyle = g; c.fill();
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.strokeStyle = `rgba(${a},.5)`; c.lineWidth = 1.2; c.stroke();
  }
  function loop() {
    requestAnimationFrame(loop);
    if (document.hidden || !S || !S.ui || S.ui.spectrum === false || rm()) return;
    if (page !== 'home' && page !== 'eq') return;
    if (Spectrum.ok === null) Spectrum.start();
    if (!Spectrum.ok) return;
    if (page === 'home') drawHome(); else drawEqSp();
  }
  requestAnimationFrame(loop);

  // ---------- estilo do app (AMOLED / Vidro / Neon / Papel), com transição circular ----------
  let lastStyle = null;
  function applyStyle() {
    const s = (S.ui && S.ui.style) || 'amoled'; if (s === lastStyle) return;
    const first = lastStyle === null; lastStyle = s;
    const set = () => { document.documentElement.dataset.style = s; };
    if (first || !document.startViewTransition || rm()) { set(); return; }
    const r = document.documentElement.style; r.setProperty('--vx', (window.__vtX != null ? window.__vtX : innerWidth / 2) + 'px'); r.setProperty('--vy', (window.__vtY != null ? window.__vtY : innerHeight / 2) + 'px');
    document.startViewTransition(set);
  }
  // ---------- chamado a cada novo estado ----------
  function onState() {
    if (!S) return;
    if (window.I18N && S.ui) I18N.setLang(S.ui.lang || 'pt');
    applyTheme(); applyStyle();
    const key = S.active + '|' + (S.game || ''), early = performance.now() - t0 < 7000;
    const presetChanged = !firstState && key !== lastKey, gameStarted = !firstState && S.game && S.game !== lastGame;
    if (presetChanged && !early) {
      const p = prof(S.active) || prof('default');
      wash(S.game ? (S.gameName || p.name) : p.name, S.game ? 'Jogando · ' + p.name : 'Preset', accentNow());
      if (page === 'eq' && typeof Q('#eqline') !== 'undefined') { const l = Q('#eqline'); if (l && l.getTotalLength) { const L = l.getTotalLength(); l.style.transition = 'none'; l.style.strokeDasharray = L; l.style.strokeDashoffset = L; void l.getBoundingClientRect(); l.style.transition = 'stroke-dashoffset .9s cubic-bezier(.3,.8,.2,1)'; l.style.strokeDashoffset = 0; setTimeout(() => { l.style.strokeDasharray = ''; l.style.strokeDashoffset = ''; l.style.transition = ''; }, 1000); } }
    }
    homeFx(presetChanged && !early, gameStarted);
    lastKey = key; lastGame = S.game || null; firstState = false;
  }
  window.Fx2 = { onState, count, sound: snd, accent: accentNow };
})();
