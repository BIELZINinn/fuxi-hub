// Aberturas do Fuxi Hub: 5 estilos animados + som sintetizado. playIntro(estilo, { sound, volume, preview, onEnd })
(function () {
  const TS = (window.INTRO_TRACK && window.INTRO_TRACK.scale) || 1;          // escala de tempo da abertura Projeto (animação e trilha andam juntas)
  const INTRO = {
    pulse:   { name: 'Pulso',   desc: 'O fone se desenha em traço de luz, um anel de energia se abre e o nome surge.', ms: 3500 },
    scanner: { name: 'Scanner', desc: 'Uma linha de luz varre a tela e revela a marca, com um clarão no fim.',        ms: 3300 },
    waves:   { name: 'Ondas',   desc: 'Barras de áudio dançam em onda e se fundem na marca.',                         ms: 3700 },
    neon:    { name: 'Neon',    desc: 'Acende piscando como um letreiro, com brilho e um leve glitch.',               ms: 3400 },
    cinema:  { name: 'Cinema',  desc: 'Entrada lenta e elegante: foco suave, uma linha de luz e só o essencial.',     ms: 3000 },
    draft:   { name: 'Projeto', desc: 'O fone é desenhado em traço de luz, acende e o som se espalha até a marca surgir.', ms: Math.round(7100 * TS) }
  };
  window.INTRO_STYLES = INTRO;

  // ---------- som ----------
  let actx = null, bus = null;
  function getBus(vol) {
    if (!actx) actx = new AudioContext();
    if (actx.state === 'suspended') actx.resume();
    if (bus) { try { bus.disconnect(); } catch {} }
    bus = actx.createGain(); bus.gain.value = .9 * Math.max(0, Math.min(1, vol));
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5500;
    const dl = actx.createDelay(1); dl.delayTime.value = .21;
    const fb = actx.createGain(); fb.gain.value = .3;
    const df = actx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 2400;
    bus.connect(lp); lp.connect(actx.destination);
    bus.connect(dl); dl.connect(df); df.connect(fb); fb.connect(dl); df.connect(actx.destination);
    return bus;
  }
  // nota: frequência, início(s), duração(s), ganho, tipo, frequência final (glissando), ataque(s)
  function note(b, f, t0, dur, g, type = 'sine', f2, atk = .012) {
    const t = actx.currentTime + .05 + t0, o = actx.createOscillator(), a = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(g, t + atk); a.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(a); a.connect(b); o.start(t); o.stop(t + dur + .05);
  }
  const SOUND = {
    pulse: b => { note(b, 140, 1.1, .5, .16, 'sine', 42); [440, 659.25, 880, 1318.5].forEach((f, i) => note(b, f, 1.12 + i * .15, .9, .07)); [220, 329.6, 440].forEach(f => note(b, f, 1.5, 1.6, .035, 'sine', 0, .3)); note(b, 2637, 1.75, .8, .012); },
    scanner: b => { note(b, 180, .3, 1.35, .05, 'sine', 2600, .25); note(b, 120, 1.62, .5, .15, 'sine', 40); [1318.5, 1975.5].forEach((f, i) => note(b, f, 1.65 + i * .08, 1.1, .06)); },
    waves: b => { [110, 165, 220].forEach(f => note(b, f, 0, 1.9, .06, 'sine', 0, 1.2)); [523.25, 783.99, 1046.5, 1568].forEach((f, i) => note(b, f, 1.7 + i * .11, 1.0, .065)); note(b, 100, 1.7, .5, .13, 'sine', 40); },
    neon: b => { [.12, .36, .5, .82, 1.0].forEach(t => note(b, 760 + Math.random() * 500, t, .05, .05, 'square')); note(b, 120, .9, 1.4, .035, 'sawtooth', 0, .5); [987.77, 1480, 1975.5].forEach((f, i) => note(b, f, 1.35 + i * .06, 1.0, .05)); },
    cinema: b => { [261.63, 392, 523.25].forEach(f => note(b, f, .2, 2.6, .055, 'sine', 0, 1.1)); note(b, 1046.5, 1.3, 1.4, .05); note(b, 130.8, .2, 2.4, .07, 'sine', 0, 1.2); }
  };

  // ---------- visual ----------
  const el = () => document.getElementById('intro');
  const word = () => `<div class="i-word">${[...'FUXI'].map((l, i) => `<i style="--k:${i}">${l}</i>`).join('')}<span class="gap"></span>${[...'HUB'].map((l, i) => `<i class="hb" style="--k:${i + 4}">${l}</i>`).join('')}</div>`;
  const BUILD = {
    pulse: () => `<div class="i-glow"></div><div class="i-ring"></div><div class="i-ring r2"></div>${window.fuxiMark('ip', 'i-mark')}${word()}<div class="i-sub">Fuxi H3 · Hub de áudio</div>`,
    scanner: () => `<div class="i-bgbars">${Array.from({ length: 40 }, (_, i) => `<i style="--i:${i};--h:${20 + Math.abs(Math.sin(i * .5)) * 70}"></i>`).join('')}</div>
      <div class="i-reveal">${window.fuxiMark('is', 'i-mark')}${word()}<div class="i-sub">Fuxi H3 · Hub de áudio</div></div><div class="i-line"></div><div class="i-flash"></div>`,
    waves: () => `<div class="i-bars">${Array.from({ length: 52 }, (_, i) => `<i style="--i:${i};--h:${.3 + Math.abs(Math.sin(i * .33)) * .7}"></i>`).join('')}</div>
      <div class="i-wlogo">${window.fuxiMark('iw', 'i-mark')}${word()}<div class="i-sub">Fuxi H3 · Hub de áudio</div></div>`,
    neon: () => `<div class="i-nmark">${window.fuxiMark('in', 'i-mark')}</div>${word()}<div class="i-uline"></div><div class="i-sub">Fuxi H3 · Hub de áudio</div>`,
    cinema: () => `<div class="i-bloom"></div><div class="i-cmark">${window.fuxiMark('ic', 'i-mark')}</div><div class="i-cline"></div>${word()}<div class="i-sub">Fuxi H3 · Hub de áudio</div>`,
    draft: () => DRAFT()
  };
  // ---------- "Projeto": o fone desenhado em traço de luz ----------
  // Desenho técnico (vista frontal) com traços que se desenham sozinhos; depois acende, o som se espalha pelas conchas, a curva do equalizador aparece e a marca surge.
  const DRAFT = () => {                                          // o desenho vem da foto real do Fuxi H3 (tools/lineart.js -> herolines.js): contornos da silhueta, casco, almofadas, haste, microfone e aberturas
    const H = window.HERO_LINES || { w: 874, h: 838, paths: [] }, g = 'dg' + Math.random().toString(36).slice(2, 6);
    const ps = H.paths.map((p, i) => ({ ...p, i })), delay = new Map(), diag = (a, b) => (a.cx + a.cy) - (b.cx + b.cy);
    ps.filter(p => p.k === 0).forEach((p, i) => delay.set(p.i, .45 + i * .12));                       // silhueta primeiro
    ps.filter(p => p.k === 1).sort(diag).forEach((p, i) => delay.set(p.i, 1 + i * .05));               // formas principais, do microfone para a concha da frente
    ps.filter(p => p.k === 2).sort(diag).forEach((p, i) => delay.set(p.i, 1.7 + i * .035));            // detalhes
    const dur = p => (p.k === 0 ? 2.1 : p.k === 1 ? 1.1 : .75);
    const lines = ps.map(p => `<path class="d-s k${p.k}" pathLength="100" d="${p.d}" style="animation-delay:${delay.get(p.i).toFixed(2)}s;animation-duration:${dur(p)}s"/>`).join('');
    const bars = Array.from({ length: 46 }, (_, i) => { const x = i / 45, h = .22 + .42 * Math.exp(-Math.pow((x - .16) / .13, 2)) + .3 * Math.exp(-Math.pow((x - .62) / .17, 2)) + .12 * Math.sin(i * 1.7) ** 2; return `<i style="--i:${i};--h:${h.toFixed(3)}"></i>`; }).join('');
    return `<canvas class="d-fx"></canvas><div class="d-vig"></div>
    <div class="d-art" style="aspect-ratio:${H.w}/${H.h}">
      <svg class="d-con" viewBox="0 0 100 100"><circle class="d-ring" cx="50" cy="50" r="49" pathLength="100"/><circle class="d-ticks" cx="50" cy="50" r="51.6"/><path class="d-cross" pathLength="100" d="M 50 -2 V 3 M 50 102 V 97 M -2 50 H 3 M 102 50 H 97"/></svg>
      <img class="d-photo" src="../assets/fuxi/hero.png" alt=""><img class="d-photo d-p2" src="../assets/fuxi/hero-bw.png" alt=""><img class="d-photo d-p3" src="../assets/fuxi/hero-black.png" alt="">
      <svg class="d-svg" viewBox="0 0 ${H.w} ${H.h}"><defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${H.w}" y2="${H.h}"><stop offset="0" stop-color="#2ef2ff"/><stop offset=".55" stop-color="#6fb4ff"/><stop offset="1" stop-color="#9a7bff"/></linearGradient></defs>
        <g class="d-lines" style="--g:url(#${g})">${lines}</g>
        <g class="d-lab"><path class="d-lead" pathLength="100" d="M 132 142 L 196 108 H 262"/><text x="270" y="113">MICROFONE</text>
          <path class="d-lead" pathLength="100" d="M 772 452 H 842"/><text x="850" y="457">HASTE</text></g></svg>
      <div class="d-scan"></div><div class="d-gl"><i></i><i></i></div>
    </div>
    <div class="d-eq"><div class="d-bars">${bars}</div><svg viewBox="0 0 520 60" class="d-curve"><path pathLength="100" d="M 4 40 C 40 40, 52 12, 92 14 S 150 44, 200 38 S 262 22, 300 24 S 360 8, 410 20 S 480 34, 516 26"/></svg></div>
    <div class="i-word d-word">${[...'FUXI'].map((l, i) => `<i style="--k:${i}">${l}</i>`).join('')}<span class="gap"></span>${[...'HUB'].map((l, i) => `<i class="hb" style="--k:${i + 4}">${l}</i>`).join('')}</div>
    <div class="i-sub d-sub">Fuxi H3 · Hub de áudio</div>`;
  };
  function dustFx(root) {                                         // poeira de luz flutuando ao fundo (canvas leve, só enquanto a abertura roda)
    const cv = root.querySelector('canvas.d-fx'); if (!cv) return null;
    const ctx = cv.getContext('2d'); let w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight;
    const P = Array.from({ length: 110 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: .4 + Math.random() * 1.5, v: 6 + Math.random() * 18, a: Math.random() * 6.28, c: Math.random() < .6 ? '46,242,255' : '138,109,255' }));
    let raf = 0, last = performance.now(); const t0 = last;
    const f = now => {
      const dt = Math.min(.05, (now - last) / 1000), e = (now - t0) / 1000; last = now; ctx.clearRect(0, 0, w, h);
      const fade = Math.min(1, e / 1.2) * (e > 6.4 * TS ? Math.max(0, 1 - (e - 6.4 * TS) / (.7 * TS)) : 1);
      for (const p of P) {
        p.y -= p.v * dt; p.x += Math.sin(p.a + e * .4) * 6 * dt; if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
        ctx.globalAlpha = (.35 + .65 * Math.abs(Math.sin(p.a + e * .9))) * .55 * fade; ctx.fillStyle = 'rgb(' + p.c + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }
  const AFTER = { draft: dustFx };
  // trilhas completas (introtrack.js): saem por um canal próprio, que some rápido se a abertura for pulada
  let trackOut = null;
  function playTrack(style, vol) {
    if (!actx) actx = new AudioContext(); if (actx.state === 'suspended') actx.resume();
    stopTrack(true);
    trackOut = actx.createGain(); trackOut.gain.value = Math.max(0, Math.min(1, vol)); trackOut.connect(actx.destination);
    window.INTRO_TRACK[style](actx, trackOut, actx.currentTime + .08);
  }
  function stopTrack(now) {
    if (!trackOut) return; const g = trackOut; trackOut = null;
    try { g.gain.setTargetAtTime(0, actx.currentTime, now ? .01 : .06); } catch {}
    setTimeout(() => { try { g.disconnect(); } catch {} }, 600);
  }
  let timer = null, endCb = null, skipHandler = null, stopFx = null;
  function finish(quick) {
    const root = el(); if (!root || !root.classList.contains('on')) return;
    clearTimeout(timer); document.removeEventListener('keydown', skipHandler, true);
    if (quick) stopTrack(false);
    root.classList.add('out');
    const cb = endCb; endCb = null;
    setTimeout(() => { if (stopFx) { stopFx(); stopFx = null; } root.classList.remove('on', 'out'); root.innerHTML = ''; if (cb) cb(); }, quick ? 250 : 550);
  }
  window.playIntro = function (style, opt = {}) {
    const def = INTRO[style]; if (!def) return;
    const root = el(); if (!root) return;
    if (root.classList.contains('on')) { clearTimeout(timer); document.removeEventListener('keydown', skipHandler, true); }
    if (stopFx) { stopFx(); stopFx = null; }
    root.className = 'on'; root.dataset.style = style;
    root.innerHTML = `<div class="i-stage i-${style}">${BUILD[style]()}</div><div class="i-hint">${opt.preview ? 'Clique ou aperte Esc para fechar' : 'Clique para pular'}</div>`;
    if (AFTER[style]) stopFx = AFTER[style](root);
    if (style === 'draft' && TS !== 1) { void root.offsetWidth; try { root.getAnimations({ subtree: true }).forEach(a => { a.playbackRate = 1 / TS; }); } catch {} }     // a animação inteira roda na mesma escala da trilha
    endCb = opt.onEnd || null;
    skipHandler = e => { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); } };
    document.addEventListener('keydown', skipHandler, true);
    root.onclick = () => finish(true);
    if (opt.sound) { try { const vol = opt.volume == null ? .6 : opt.volume; if (window.INTRO_TRACK && window.INTRO_TRACK[style]) playTrack(style, vol); else SOUND[style](getBus(vol)); } catch {} }
    timer = setTimeout(() => finish(false), def.ms);
  };
})();
