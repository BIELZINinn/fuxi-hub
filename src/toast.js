// Avisos do Fuxi Hub no canto da tela: entrada/saída animadas, som discreto, pilha de até 3.
const stack = document.getElementById('stack');
const MAX = 3;
const KICK = { game: 'Jogo detectado', gameEnd: 'Jogo encerrado', device: 'Fone', preset: 'Preset', mic: 'Microfone', info: 'Fuxi Hub' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const svg = d => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICONS = {
  device: svg('<path d="M4 12a8 8 0 0116 0v6a2 2 0 01-2 2h-1v-7h3M4 12v1M4 13h3v7H6a2 2 0 01-2-2z"/>'),
  deviceOff: svg('<path d="M4 12a8 8 0 0116 0v6a2 2 0 01-2 2h-1v-7h3M4 12v1M4 13h3v7H6a2 2 0 01-2-2z"/><path d="M3 3l18 18"/>'),
  preset: svg('<path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="14" r="2"/><circle cx="12" cy="8" r="2"/><circle cx="19" cy="16" r="2"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'),
  micOff: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/><path d="M3 3l18 18"/>'),
  game: svg('<rect x="3" y="7" width="18" height="11" rx="5"/><path d="M8 10v5M5.5 12.5h5M16 11h.01M18 14h.01"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>')
};

// ---------- sons (sintetizados, discretos) ----------
let actx = null, bus = null;
const SOUNDS = {                       // [frequência, atraso(s), duração(s), ganho]
  // modo de jogo: batida grave + arpejo subindo + brilho no fim (entrada); o espelho descendo, mais suave (saída)
  game: [[150, 0, .45, .16, 46], [440, .02, .3, .07], [659.25, .1, .35, .08], [880, .2, .45, .085], [1318.5, .32, .9, .06], [2637, .34, .6, .014]],
  gameEnd: [[1174.7, 0, .3, .06], [880, .11, .35, .065], [659.25, .22, .45, .06], [440, .34, .8, .055], [110, .34, .7, .1, 55]],
  deviceOn: [[659.25, 0, .55, .1], [987.77, .11, .6, .09], [1318.5, .23, 1, .075], [2637, .23, .5, .014]],
  deviceOff: [[1318.5, 0, .45, .08], [987.77, .12, .5, .07], [659.25, .25, .9, .06], [329.6, .25, .8, .03]],
  preset: [[880, 0, .4, .07], [1318.5, .07, .55, .045]],
  micOff: [[523.25, 0, .2, .08], [392, .09, .45, .07]],
  micOn: [[523.25, 0, .2, .07], [784, .09, .5, .075]],
  info: [[880, 0, .4, .06]]
};
function getBus() {
  if (!actx) actx = new AudioContext();
  if (actx.state === 'suspended' && !(window.OfflineAudioContext && actx instanceof OfflineAudioContext)) actx.resume();
  if (!bus) {
    bus = actx.createGain();
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    const dl = actx.createDelay(1); dl.delayTime.value = .19;
    const fb = actx.createGain(); fb.gain.value = .26;
    const df = actx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 2600;
    bus.connect(lp); lp.connect(actx.destination);
    bus.connect(dl); dl.connect(df); df.connect(fb); fb.connect(dl); df.connect(actx.destination);
  }
  return bus;
}
// ---------- assinaturas sonoras de cada jogo (originais, sintetizadas: lembram o "clima" do jogo, não copiam o áudio dele) ----------
const m = n => 440 * Math.pow(2, (n - 69) / 12);                        // nota MIDI -> Hz
function note(b, f, t0, dur, g, type = 'sine', f2, atk = .012) {         // nota simples: frequência, início(s), duração(s), ganho, tipo, glissando, ataque
  const t = actx.currentTime + .05 + t0, o = actx.createOscillator(), a = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(g, t + atk); a.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(a); a.connect(b); o.start(t); o.stop(t + dur + .05);
}
let noiseBuf = null;
function noise(b, t0, dur, g, type, f1, f2, atk = .01) {                 // rajada de ruído filtrada (whoosh, estática, clique, impacto)
  if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = actx.currentTime + .05 + t0, s = actx.createBufferSource(), fl = actx.createBiquadFilter(), a = actx.createGain();
  s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f1, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = type === 'bandpass' ? 1.2 : .7;
  a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(g, t + atk); a.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(fl); fl.connect(a); a.connect(b); s.start(t, Math.random()); s.stop(t + dur + .05);
}
function voice(b, f, t0, dur, g, type, lp, o = {}) {                      // nota com filtro, ataque lento opcional, vibrato e glissando
  const t = actx.currentTime + .05 + t0, os = actx.createOscillator(), fl = actx.createBiquadFilter(), a = actx.createGain();
  os.type = type || 'sawtooth'; os.frequency.setValueAtTime(f, t); if (o.f2) os.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
  fl.type = 'lowpass'; fl.frequency.setValueAtTime(lp || 2000, t); if (o.lp2) fl.frequency.exponentialRampToValueAtTime(o.lp2, t + dur);
  const atk = o.atk || .02; a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(g, t + atk); a.gain.exponentialRampToValueAtTime(.0001, t + dur);
  if (o.vib) { const l = actx.createOscillator(), lg = actx.createGain(); l.frequency.value = o.vib; lg.gain.value = f * .012; l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(t + dur + .05); }
  if (o.det) os.detune.value = o.det;
  os.connect(fl); fl.connect(a); a.connect(b); os.start(t); os.stop(t + dur + .05);
}
const pl = (b, f, t, g = .09, d = .5) => voice(b, f, t, d, g, 'triangle', 3200, { atk: .004 });   // nota "dedilhada"
const bell = (b, f, t, g = .05, d = 1.4) => { note(b, f, t, d, g); note(b, f * 2.76, t, d * .5, g * .35); note(b, f * 5.4, t, d * .25, g * .12); };
const boom = (b, t, g = .2, f = 90, f2 = 34) => { note(b, f, t, .55, g, 'sine', f2); noise(b, t, .35, g * .5, 'lowpass', 300, 80); };
const GAME_SND = {
  gow: b => { voice(b, m(38), 0, 2.2, .1, 'sawtooth', 300, { atk: .5, lp2: 700 }); voice(b, m(45), 0, 2.2, .08, 'sawtooth', 300, { atk: .6, lp2: 800 });   // metais graves de épico nórdico
    voice(b, m(50), .3, 1.0, .09, 'sawtooth', 900, { atk: .12 }); voice(b, m(57), .95, 1.4, .09, 'sawtooth', 1100, { atk: .1 }); boom(b, .9, .22, 80, 32); bell(b, m(88), 1.0, .035, 1.6); },
  fortnite: b => { [72, 76, 79, 84].forEach((n, i) => pl(b, m(n), i * .085, .09, .5)); noise(b, 0, .06, .05, 'highpass', 5000); note(b, m(96), .36, .5, .03); note(b, m(91), .42, .5, .025); },
  valorant: b => { voice(b, 280, 0, .38, .05, 'sawtooth', 500, { f2: 1800, lp2: 4000, atk: .05 }); pl(b, m(88), .36, .1, .6); pl(b, m(81), .45, .07, .5); boom(b, .36, .12, 120, 50); note(b, m(100), .5, .5, .02); },
  cs2: b => { [0, .13, .26].forEach(t => note(b, 1000, t, .07, .06, 'square')); boom(b, .42, .2, 100, 40); noise(b, .4, .05, .08, 'highpass', 3000); },
  pubg: b => { noise(b, 0, 1.1, .1, 'bandpass', 200, 1800, .4); voice(b, m(50), .5, 1.1, .08, 'sawtooth', 700, { atk: .25 }); boom(b, .95, .2, 70, 32); },
  apex: b => { boom(b, 0, .24, 100, 36); [52, 56, 59].forEach((n, i) => voice(b, m(n), .12 + i * .02, .6, .08, 'sawtooth', 1300, { atk: .04 })); noise(b, 0, .7, .06, 'bandpass', 500, 3500, .2); note(b, m(95), .5, .8, .025); },
  warzone: b => { noise(b, 0, .28, .1, 'bandpass', 2200, 1800); [.32, .44].forEach(t => note(b, 1500, t, .04, .05)); voice(b, m(33), .1, 1.6, .1, 'sawtooth', 220, { atk: .3 }); boom(b, .6, .2, 85, 34); },
  overwatch: b => { [72, 76, 79, 84, 88].forEach((n, i) => { note(b, m(n), i * .07, .55, .075); note(b, m(n + 12), i * .07, .3, .02, 'triangle'); }); [72, 76, 79].forEach(n => note(b, m(n + 12), .38, 1.2, .04)); },
  r6: b => { voice(b, m(33), 0, 1.5, .1, 'sawtooth', 160, { atk: .1 }); [.4, .55, .7].forEach(t => noise(b, t, .03, .09, 'highpass', 4000)); noise(b, .95, .35, .14, 'lowpass', 900, 200); boom(b, .95, .2, 110, 40); },
  lol: b => { [76, 83, 88, 92, 95].forEach((n, i) => bell(b, m(n), i * .1, .05, 1.5)); voice(b, m(64), 0, 1.4, .04, 'sine', 1200, { atk: .6, f2: m(76) }); },
  gta5: b => { [0, .2].forEach((t, i) => { voice(b, m(i ? 28 : 33), t, .3, .13, 'sawtooth', 450, { atk: .01 }); [57, 61, 64].forEach(n => voice(b, m(n), t, .22, .06, 'sawtooth', 1600, { atk: .01 })); }); noise(b, .2, .08, .05, 'highpass', 6000); },
  rocketleague: b => { voice(b, 70, 0, .95, .1, 'sawtooth', 500, { f2: 340, lp2: 2200, atk: .2 }); noise(b, 0, .95, .07, 'bandpass', 400, 2600, .3); pl(b, m(93), .92, .1, .8); note(b, m(100), .95, .6, .03); },
  cyberpunk: b => { voice(b, m(45), 0, 1.6, .06, 'sawtooth', 400, { atk: .3, lp2: 2500 }); voice(b, m(45), 0, 1.6, .06, 'sawtooth', 400, { atk: .3, lp2: 2500, det: 18 }); [.5, .58, .66, .74].forEach(t => note(b, 1200, t, .04, .05, 'square')); voice(b, 900, .85, .3, .06, 'square', 2500, { f2: 90 }); },
  eldenring: b => { [62, 65, 69].forEach((n, i) => voice(b, m(n), i * .05, 2.2, .06, 'triangle', 1800, { atk: 1.0, vib: 5 })); bell(b, m(81), .8, .06, 2.0); [93, 97].forEach((n, i) => note(b, m(n), 1.0 + i * .12, 1.0, .02)); },
  rdr2: b => { [40, 47, 52, 55].forEach((n, i) => pl(b, m(n), i * .14, .11, .7)); boom(b, 0, .12, 80, 40); voice(b, m(71), .6, .9, .06, 'sawtooth', 1500, { atk: .1, vib: 5.5 }); },
  dota2: b => { boom(b, 0, .26, 95, 35); voice(b, m(55), .2, .8, .09, 'sawtooth', 900, { atk: .1 }); voice(b, m(62), .85, 1.2, .09, 'sawtooth', 1100, { atk: .1 }); bell(b, m(86), 1.0, .03, 1.4); },
  bf2042: b => { boom(b, 0, .28, 60, 28); for (let i = 0; i < 7; i++) noise(b, .25 + i * .1, .08, .09, 'lowpass', 350); pl(b, m(88), .95, .07, .7); },
  tarkov: b => { noise(b, 0, 1.6, .06, 'lowpass', 140, 90, .5); [.5, .62].forEach((t, i) => { note(b, 2400, t, .05, .05, 'square'); noise(b, t, .04, .08, 'highpass', 3000); }); noise(b, 1.0, .7, .04, 'bandpass', 800, 500, .3); },
  witcher3: b => { [50, 57, 62, 65, 69].forEach((n, i) => pl(b, m(n), i * .1, .1, .8)); voice(b, m(38), 0, 1.8, .06, 'sine', 400, { atk: .4 }); bell(b, m(81), .7, .035, 1.6); }
};
// só para testes: renderiza a assinatura sonora de um jogo "no papel" (sem tocar) e devolve PCM 16-bit em base64
window.__testSound = async id => {
  const real = actx, realBus = bus, sr = 48000;
  actx = new OfflineAudioContext(1, sr * 3.5, sr); bus = null;
  try {
    runGame(id, getBus(.8));
    const d = (await actx.startRendering()).getChannelData(0), pcm = new Int16Array(d.length); let pk = 0, e = 0, last = 0;
    for (let i = 0; i < d.length; i++) { const v = Math.max(-1, Math.min(1, d[i])); pcm[i] = v * 32767; pk = Math.max(pk, Math.abs(d[i])); e += d[i] * d[i]; if (Math.abs(d[i]) > .004) last = i; }
    let s = ''; const u = new Uint8Array(pcm.buffer); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
    return { peak: pk, rms: Math.sqrt(e / d.length), secs: last / sr, b64: btoa(s) };
  } finally { actx = real; bus = realBus; }
};
// o "toque cloud" também no som: uma cauda aérea que desce, como um sinal vindo da nuvem
function cloudShimmer(volume) {
  const b = getBus(volume);
  note(b, 2637, .5, 1.1, .025, 'sine', 1568, .05); note(b, 3136, .62, 1.0, .018, 'sine', 1975, .05); note(b, 1976, .75, 1.2, .02, 'triangle', 1318, .08);
  noise(b, .5, .9, .018, 'bandpass', 5200, 2600, .15);
}
// nivelação: as assinaturas foram medidas e ajustadas para todas soarem no mesmo volume
const GAME_GAIN = { gow: .62, fortnite: 1.45, valorant: 1.3, cs2: 1.2, pubg: 1.1, apex: .93, warzone: 1.04, overwatch: 1.04, r6: 1.04, lol: 1.09, gta5: 2.1, rocketleague: 1.5, cyberpunk: 2.1, eldenring: 1.14, rdr2: .9, dota2: .83, bf2042: .86, tarkov: 4, witcher3: .83 };
function runGame(id, bus0) { const g = actx.createGain(); g.gain.value = GAME_GAIN[id] || 1; g.connect(bus0); GAME_SND[id](g); }
function playFile(url, volume) { try { const a = new Audio(url); a.volume = Math.max(0, Math.min(1, volume)); a.play().catch(() => {}); } catch {} }
function playSound(key, volume, file) {
  if (file) return playFile(file, volume);                                  // arquivo de som que você colocou na pasta de sons
  const gid = /^game:(.+)$/.exec(key || ''); if (gid && GAME_SND[gid[1]]) { try { runGame(gid[1], getBus(volume)); } catch {} return; }
  if (gid) key = 'game';
  const seq = SOUNDS[key]; if (!seq) return;
  try {
    const b = getBus(); b.gain.value = .85 * Math.max(0, Math.min(1, volume));
    const t = actx.currentTime + .03;
    seq.forEach(([f, d, dur, g, f2]) => {
      const o = actx.createOscillator(), a = actx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f, t + d);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d + dur);       // 5º valor: desliza até essa frequência (batida grave)
      a.gain.setValueAtTime(.0001, t + d); a.gain.exponentialRampToValueAtTime(g, t + d + .012); a.gain.exponentialRampToValueAtTime(.0001, t + d + dur);
      o.connect(a); a.connect(b); o.start(t + d); o.stop(t + d + dur + .05);
    });
  } catch {}
}

// ---------- mini curva do equalizador ----------
function spark(eq, rgb) {
  if (!eq || !eq.g) return '';
  const fr = EQMath.logFreqs(90), r = EQMath.response(eq.f, eq.g, eq.q, fr, eq.t), W = 88, H = 34;
  const y = d => H / 2 - Math.max(-6, Math.min(6, d)) / 6 * (H / 2 - 3);          // escala ±6 dB: o formato da curva fica bem visível
  const pts = fr.map((f, i) => [(i / (fr.length - 1)) * W, y(r[i])]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}"><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#2a2a32" stroke-width="1"/>
    <path d="${line}" fill="none" stroke="rgb(${rgb})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px rgba(${rgb},.7))"/></svg>`;
}

// ---------- aviso ----------
function show(p) {
  const top = /^top/.test(p.position), left = /left$/.test(p.position);
  stack.className = top ? 'top' : 'bottom';
  // mesmo id = substitui o aviso que já está na tela
  const old = stack.querySelector(`[data-id="${CSS.escape(p.id)}"]`); if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.className = 'wrap'; wrap.dataset.id = p.id;
  wrap.style.setProperty('--dx', (left ? -60 : 60) + 'px');
  wrap.style.alignSelf = left ? 'flex-start' : 'flex-end';
  if (p.kind === 'gameEnd' && p.style !== 'compact') {         // saída: aparece quieta (sem deslizar) e vai embora para o lado
    wrap.style.setProperty('--dx', '0px'); wrap.style.setProperty('--dxo', (left ? -60 : 60) + 'px');
  }
  const an = p.anim || 'slide';                                  // animação dos avisos: deslizar (padrão), suave (só aparece/some) ou nenhuma
  wrap.classList.add('anim-' + an);
  if (an !== 'slide') { wrap.style.setProperty('--dx', '0px'); wrap.style.setProperty('--dxo', '0px'); }
  const icon = p.art ? `<img src="${esc(p.art)}" alt="">` : (p.icon && ICONS[p.icon]) ? ICONS[p.icon] : `<span class="ini">${esc(p.initials || '')}</span>`;
  const compact = p.style === 'compact';
  if ((p.kind === 'game' || p.kind === 'gameEnd') && !compact) {
    wrap.classList.add('gmw');
    const end = p.kind === 'gameEnd';
    const bn = p.banner || p.art;
    const art = bn ? `<div class="gm-art" style="background-image:url('${esc(bn)}')"></div>` : `<div class="gm-art ph"><span>${esc(p.initials || '')}</span></div>`;
    const bars = [0, 1, 2, 3, 4, 5, 6].map(i => `<i style="--i:${i}"></i>`).join('');
    wrap.innerHTML = `<div class="clip"><div class="card gm ${end ? 'end' : ''}" style="--cr:${esc(p.rgb)};--dur:${p.duration}ms">
      ${art}<div class="gm-shade"></div><div class="gm-scan"></div>
      ${p.cloud ? `<div class="gm-cloud"><svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 01-.6-7.95A6 6 0 0118 9.5 4 4 0 0117 18z"/></svg>${esc(p.cloud)}</div>` : ''}
      <div class="gm-body"><div class="gm-kick"><i></i>${end ? 'Jogo encerrado' : (p.cloud ? 'Modo cloud' : 'Modo de jogo')}</div>
        <b class="gm-title${String(p.title).length > 19 ? ' xs' : String(p.title).length > 14 ? ' sm' : ''}">${esc(p.title)}</b><div class="gm-sub">${esc(p.body)}</div></div>
      <div class="gm-eq">${bars}</div><i class="bar"></i></div></div>`;
  } else
  wrap.innerHTML = `<div class="clip"><div class="card ${compact ? 'compact' : ''}" style="--cr:${esc(p.rgb)};--dur:${p.duration}ms">
    <div class="ic">${icon}</div>
    <div class="tx"><div class="kick">${esc(KICK[p.kind] || KICK.info)} · Fuxi Hub</div><b>${esc(p.title)}</b><span>${esc(p.body)}</span></div>
    ${compact ? '' : spark(p.eq, p.rgb)}<i class="bar"></i></div></div>`;
  if (top) stack.insertBefore(wrap, stack.firstChild); else stack.appendChild(wrap);
  while (stack.children.length > MAX) hide(top ? stack.lastElementChild : stack.firstElementChild, true);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('in')));
  if (p.sound) { playSound(p.soundKey || 'info', p.volume, p.soundFile); if (p.cloud) { try { cloudShimmer(p.volume); } catch {} } }
  wrap._t = setTimeout(() => hide(wrap), p.duration);
}
function hide(w, quick) {
  if (!w || w.classList.contains('out')) return;
  clearTimeout(w._t); w.classList.remove('in'); w.classList.add('out');
  setTimeout(() => { w.remove(); if (!stack.children.length) window.toast.empty(); }, quick ? 350 : (w.classList.contains('anim-none') ? 60 : w.classList.contains('gmw') ? 1050 : 520));
}
window.toast.onShow(show);
window.toast.onClear(() => [...stack.children].forEach(w => hide(w, true)));
