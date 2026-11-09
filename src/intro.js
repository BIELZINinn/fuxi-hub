// Aberturas do Fuxi Hub: 5 estilos animados + som sintetizado. playIntro(estilo, { sound, volume, preview, onEnd })
(function () {
  const INTRO = {
    pulse:   { name: 'Pulso',   desc: 'O fone se desenha em traço de luz, um anel de energia se abre e o nome surge.', ms: 3500 },
    scanner: { name: 'Scanner', desc: 'Uma linha de luz varre a tela e revela a marca, com um clarão no fim.',        ms: 3300 },
    waves:   { name: 'Ondas',   desc: 'Barras de áudio dançam em onda e se fundem na marca.',                         ms: 3700 },
    neon:    { name: 'Neon',    desc: 'Acende piscando como um letreiro, com brilho e um leve glitch.',               ms: 3400 },
    cinema:  { name: 'Cinema',  desc: 'Entrada lenta e elegante: foco suave, uma linha de luz e só o essencial.',     ms: 3000 }
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
    cinema: () => `<div class="i-bloom"></div><div class="i-cmark">${window.fuxiMark('ic', 'i-mark')}</div><div class="i-cline"></div>${word()}<div class="i-sub">Fuxi H3 · Hub de áudio</div>`
  };
  let timer = null, endCb = null, skipHandler = null;
  function finish(quick) {
    const root = el(); if (!root || !root.classList.contains('on')) return;
    clearTimeout(timer); document.removeEventListener('keydown', skipHandler, true);
    root.classList.add('out');
    const cb = endCb; endCb = null;
    setTimeout(() => { root.classList.remove('on', 'out'); root.innerHTML = ''; if (cb) cb(); }, quick ? 250 : 550);
  }
  window.playIntro = function (style, opt = {}) {
    const def = INTRO[style]; if (!def) return;
    const root = el(); if (!root) return;
    if (root.classList.contains('on')) { clearTimeout(timer); document.removeEventListener('keydown', skipHandler, true); }
    root.className = 'on'; root.dataset.style = style;
    root.innerHTML = `<div class="i-stage i-${style}">${BUILD[style]()}</div><div class="i-hint">${opt.preview ? 'Clique ou aperte Esc para fechar' : 'Clique para pular'}</div>`;
    endCb = opt.onEnd || null;
    skipHandler = e => { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); } };
    document.addEventListener('keydown', skipHandler, true);
    root.onclick = () => finish(true);
    if (opt.sound) { try { SOUND[style](getBus(opt.volume == null ? .6 : opt.volume)); } catch {} }
    timer = setTimeout(() => finish(false), def.ms);
  };
})();
