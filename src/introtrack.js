// Trilha da abertura "Projeto" (7,1 s), toda sintetizada (sem arquivo de áudio). 100 BPM, tom de A menor que abre em A maior no fim.
// draft(ctx, dest, T): agenda a trilha inteira a partir do instante T do contexto (serve para AudioContext ao vivo e OfflineAudioContext nos testes).
// Linha do tempo (casa com a animação):  0-3,0 desenho (pad que abre, tiquetaques do lápis, coração grave, subida)  ·  3,0 acende + varredura de luz (esquerda → direita)
//  3,6 barras do equalizador (arpejo)  ·  4,3 a marca (impacto, acorde, sino)  ·  4,7-5,7 falha nas 3 cores (corte em gate, bits esmagados)  ·  5,35 brilho passa pelas letras
//  6,2 segunda falha  ·  6,45 resolve em A maior com cauda de reverb.
(function () {
  const BPM = 100, B = 60 / BPM, SX = B / 4;
  const K = .72;                                              // a trilha inteira (e a animação) corre a 72% do tempo original: 6 s no máximo, com a cauda
  const SWITCH = [4.78, 4.86, 4.94, 5.0, 5.07, 5.15, 5.22, 5.29, 5.31, 5.37, 5.40, 5.47, 5.52, 5.58, 5.64];     // instantes em que a cor do fone troca na falha

  function impulse(ctx, secs, decay, rnd) {                    // resposta de impulso de reverb: ruído estéreo que decai (bem escuro no fim)
    const n = Math.floor(ctx.sampleRate * secs), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const t = i / n, w = (rnd() * 2 - 1) * Math.pow(1 - t, decay); lp += (w - lp) * (.9 - .78 * t); d[i] = lp * 1.6; } }
    return buf;
  }
  const stepCurve = steps => { const c = new Float32Array(2048); for (let i = 0; i < c.length; i++) { const x = i / (c.length - 1) * 2 - 1; c[i] = Math.round(x * steps) / steps; } return c; };     // "bit crusher"
  const softCurve = k => { const c = new Float32Array(2048); for (let i = 0; i < c.length; i++) { const x = i / (c.length - 1) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); } return c; };               // saturação suave (grave com corpo)

  function draft(ctx, dest, T) {
    let seed = 20261111; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };   // sorteio fixo: soa igual toda vez
    const mix = ctx.createGain(), comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -13; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = .003; comp.release.value = .16;
    // equalização final: tira o caixote das médias (~600 Hz), reforça o grave e dá brilho no topo (som moderno)
    const eq1 = ctx.createBiquadFilter(), eq2 = ctx.createBiquadFilter(), eq3 = ctx.createBiquadFilter();
    eq1.type = 'peaking'; eq1.frequency.value = 600; eq1.Q.value = 1.1; eq1.gain.value = -4.5;
    eq2.type = 'lowshelf'; eq2.frequency.value = 90; eq2.gain.value = 2.5;
    eq3.type = 'highshelf'; eq3.frequency.value = 7500; eq3.gain.value = 3;
    mix.gain.value = .5; mix.connect(eq1); eq1.connect(eq2); eq2.connect(eq3); eq3.connect(comp); comp.connect(dest);
    // reverb e eco ping-pong compartilhados
    const conv = ctx.createConvolver(); conv.buffer = impulse(ctx, 2.8, 2.6, rnd); const vOut = ctx.createGain(); vOut.gain.value = .5; conv.connect(vOut); vOut.connect(mix);
    const vIn = ctx.createGain(); vIn.connect(conv);
    const eIn = ctx.createGain(), dL = ctx.createDelay(1), dR = ctx.createDelay(1), f1 = ctx.createGain(), f2 = ctx.createGain(), pL = ctx.createStereoPanner(), pR = ctx.createStereoPanner(), eOut = ctx.createGain();
    dL.delayTime.value = SX * 3 * K; dR.delayTime.value = SX * 3 * K; f1.gain.value = .38; f2.gain.value = .38; pL.pan.value = -.75; pR.pan.value = .75; eOut.gain.value = .5;
    const eLp = ctx.createBiquadFilter(); eLp.type = 'lowpass'; eLp.frequency.value = 3800;
    eIn.connect(dL); dL.connect(pL); pL.connect(eOut); dL.connect(f1); f1.connect(dR); dR.connect(pR); pR.connect(eOut); dR.connect(f2); f2.connect(eLp); eLp.connect(dL); eOut.connect(mix);
    // bus de bits esmagados (falhas) e de grave saturado
    const crush = ctx.createWaveShaper(); crush.curve = stepCurve(7); const crOut = ctx.createGain(); crOut.gain.value = .9; crush.connect(crOut); crOut.connect(mix);
    const sat = ctx.createWaveShaper(); sat.curve = softCurve(2.6); sat.connect(mix);
    // pad: passa por "sidechain" (abaixa a cada batida) e por um portão que gagueja na falha
    const duck = ctx.createGain(), gate = ctx.createGain(); duck.connect(gate); gate.connect(mix);
    const padSend = ctx.createGain(); padSend.gain.value = .35; gate.connect(padSend); padSend.connect(vIn);

    const at = t => T + t, A = t => T + t * K;                       // at: tempo absoluto já escalado · A: tempo em segundos da linha do tempo original
    // voz: oscilador com envelope, filtro, pan, envios (reverb/eco)
    function voice(type, f, t, dur, g, o = {}) {
      t *= K; dur *= K; o = { ...o }; if (o.atk != null) o.atk *= K; if (o.fd) o.fd *= K; if (o.hold) o.hold *= K;
      const os = ctx.createOscillator(), ga = ctx.createGain(); os.type = type; os.frequency.setValueAtTime(f, at(t));
      if (o.f2) os.frequency.exponentialRampToValueAtTime(o.f2, at(t + (o.fd || dur)));
      if (o.det) os.detune.value = o.det;
      const atk = o.atk == null ? .006 : o.atk, hold = o.hold || 0;
      ga.gain.setValueAtTime(.0001, at(t)); ga.gain.exponentialRampToValueAtTime(g, at(t + atk));
      if (hold) ga.gain.setValueAtTime(g, at(t + atk + hold));
      ga.gain.exponentialRampToValueAtTime(.0001, at(t + dur));
      os.connect(ga); let n = ga;
      if (o.lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.lp, at(t)); fl.Q.value = o.q || .7; if (o.lp2) fl.frequency.exponentialRampToValueAtTime(o.lp2, at(t + dur)); n.connect(fl); n = fl; }
      if (o.pan != null) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; n.connect(p); n = p; }
      n.connect(o.out || mix);
      if (o.verb) { const s = ctx.createGain(); s.gain.value = o.verb; n.connect(s); s.connect(vIn); }
      if (o.echo) { const s = ctx.createGain(); s.gain.value = o.echo; n.connect(s); s.connect(eIn); }
      os.start(at(t)); os.stop(at(t + dur + .05)); return os;
    }
    const NB = (() => { const n = Math.floor(ctx.sampleRate * 2.5), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1; return b; })();
    // ruído filtrado com varredura de frequência e de pan
    function noise(t, dur, g, o = {}) {
      t *= K; dur *= K; o = { ...o }; if (o.atk != null) o.atk *= K; if (o.peak) o.peak *= K;
      const s = ctx.createBufferSource(); s.buffer = NB; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = o.type || 'bandpass'; fl.Q.value = o.q || 1;
      fl.frequency.setValueAtTime(o.f1 || 1000, at(t)); if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, at(t + dur));
      const ga = ctx.createGain(), atk = o.atk == null ? .004 : o.atk;
      ga.gain.setValueAtTime(.0001, at(t)); ga.gain.exponentialRampToValueAtTime(g, at(t + atk)); if (o.peak) { ga.gain.exponentialRampToValueAtTime(g, at(t + o.peak)); }
      ga.gain.exponentialRampToValueAtTime(.0001, at(t + dur));
      s.connect(fl); fl.connect(ga); let n = ga;
      if (o.pan1 != null) { const p = ctx.createStereoPanner(); p.pan.setValueAtTime(o.pan1, at(t)); p.pan.linearRampToValueAtTime(o.pan2 == null ? o.pan1 : o.pan2, at(t + dur)); n.connect(p); n = p; }
      n.connect(o.out || mix);
      if (o.verb) { const v = ctx.createGain(); v.gain.value = o.verb; n.connect(v); v.connect(vIn); }
      s.start(at(t), rnd() * 1.5); s.stop(at(t + dur + .05));
    }
    // pad "supersaw": 3 serras levemente desafinadas por nota, filtro que abre, espalhado no estéreo
    function pad(freqs, t, dur, g, lp1, lp2, atk, o = {}) {
      t *= K; dur *= K; atk *= K; o = { ...o }; if (o.rel) o.rel *= K;
      freqs.forEach((f, i) => [-11, 0, 11].forEach((det, j) => {
        const os = ctx.createOscillator(), ga = ctx.createGain(), fl = ctx.createBiquadFilter(), p = ctx.createStereoPanner();
        os.type = 'sawtooth'; os.frequency.value = f; os.detune.value = det + (i % 2 ? 3 : -3);
        fl.type = 'lowpass'; fl.Q.value = o.q || 1.2; fl.frequency.setValueAtTime(lp1, at(t)); fl.frequency.exponentialRampToValueAtTime(lp2, at(t + dur));
        ga.gain.setValueAtTime(.0001, at(t)); ga.gain.exponentialRampToValueAtTime(g, at(t + atk)); ga.gain.setValueAtTime(g, at(t + dur - (o.rel || .5))); ga.gain.exponentialRampToValueAtTime(.0001, at(t + dur));
        p.pan.value = (j - 1) * .55 * (i % 2 ? -1 : 1);
        os.connect(fl); fl.connect(ga); ga.connect(p); p.connect(o.to || duck);
        os.start(at(t)); os.stop(at(t + dur + .05));
      }));
    }
    const bell = (f, t, dur, g, pan) => {                           // sino de FM (carrier + modulador inarmônico)
      t *= K; dur *= K;
      const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), ga = ctx.createGain(), p = ctx.createStereoPanner();
      c.frequency.value = f; m.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 1.6, at(t)); mg.gain.exponentialRampToValueAtTime(f * .05, at(t + dur * .6));
      ga.gain.setValueAtTime(.0001, at(t)); ga.gain.exponentialRampToValueAtTime(g, at(t + .004)); ga.gain.exponentialRampToValueAtTime(.0001, at(t + dur));
      p.pan.value = pan || 0; m.connect(mg); mg.connect(c.frequency); c.connect(ga); ga.connect(p); p.connect(mix);
      const s = ctx.createGain(); s.gain.value = .6; p.connect(s); s.connect(vIn); const e = ctx.createGain(); e.gain.value = .3; p.connect(e); e.connect(eIn);
      c.start(at(t)); m.start(at(t)); c.stop(at(t + dur + .05)); m.stop(at(t + dur + .05));
    };

    // ===== 0 – 3,0 s · desenho =====
    pad([110, 164.81, 261.63, 329.63], 0, 3.25, .02, 180, 2600, 2.3, { rel: .25 });                 // Am9 que vai abrindo
    pad([55, 82.41], 0, 3.25, .03, 140, 600, 1.8, { rel: .25 });
    [[.6, .08], [1.2, .11], [1.8, .15], [2.4, .2]].forEach(([t, g]) => voice('sine', 62, t, .38, g, { f2: 38, fd: .3, out: sat }));    // coração grave, cada vez mais forte
    for (let i = 0, t = .45; t < 2.9; i++, t += SX) {                                                  // tiquetaques do lápis de luz + notas curtas que formam uma melodia digital
      const prog = t / 2.9;
      if (rnd() < .5 + .45 * prog) noise(t, .028, .05 + .05 * prog, { type: 'highpass', f1: 5200, pan1: rnd() * 1.6 - .8, verb: .12 });
      if (i % 3 === 0) { const sc = [440, 523.25, 659.25, 783.99, 880, 1046.5]; voice('triangle', sc[Math.floor(rnd() * sc.length)], t, .16, .02 + .018 * prog, { pan: rnd() - .5, echo: .5, verb: .25, lp: 4200 }); }
    }
    noise(1.8, 1.14, .15, { f1: 350, f2: 9500, q: 2.2, atk: .9, pan1: -.4, pan2: .4, verb: .25 });     // subida de ruído
    voice('sine', 180, 1.85, 1.1, .05, { f2: 2600, fd: 1.1, atk: .8, pan: 0 });
    voice('sawtooth', 90, 1.85, 1.1, .02, { f2: 900, fd: 1.1, atk: .9, lp: 2000 });
    duck.gain.setValueAtTime(1, A(0)); duck.gain.setValueAtTime(1, A(2.9)); duck.gain.linearRampToValueAtTime(0, A(2.96));     // silêncio de uma fração antes do impacto

    // ===== 3,0 s · acende =====
    duck.gain.setValueAtTime(1, A(3.0));
    voice('sine', 96, 3.0, 1.2, .5, { f2: 35, fd: .75, out: sat });                                      // 808 de impacto
    voice('square', 1900, 3.0, .025, .08);                                                                // estalo
    noise(3.0, 1.6, .26, { type: 'lowpass', f1: 1400, f2: 160, q: .7, atk: .003, verb: .55 });         // estrondo
    voice('sawtooth', 7000, 3.0, .4, .04, { f2: 180, lp: 6000, lp2: 300, pan: 0 });
    pad([220, 329.63, 392, 493.88, 523.25], 3.0, 1.65, .02, 7500, 650, .004, { rel: 1.0, q: .8 });       // acorde em stab (Am9), abre e fecha
    const beats = []; for (let t = 3.0; t < 4.35; t += B) beats.push(t);
    beats.forEach(t => { duck.gain.setTargetAtTime(.3, A(t + .004), .006); duck.gain.setTargetAtTime(1, A(t + .05), .09); });   // bombeamento no ritmo
    noise(3.0, 1.65, .12, { f1: 400, f2: 7200, q: 5, atk: .05, pan1: -.9, pan2: .9, verb: .3 });          // varredura de luz da esquerda para a direita
    voice('sine', 320, 3.0, 1.6, .02, { f2: 3200, fd: 1.6, atk: .05, pan: 0 });

    // ===== 3,6 s · equalizador =====
    const ar = [440, 523.25, 659.25, 783.99, 880, 1046.5, 1318.5, 1568, 1760, 2093];
    ar.forEach((f, i) => { const t = 3.6 + i * .075; voice('triangle', f, t, .38, .045, { pan: i % 2 ? .5 : -.5, echo: .45, verb: .3, lp: 6000 }); voice('sine', f * 2, t, .25, .012, { pan: i % 2 ? -.4 : .4, echo: .3 }); });

    // ===== 4,3 s · a marca =====
    voice('sine', 130, 4.3, .55, .36, { f2: 42, fd: .4, out: sat });                                     // pancada
    voice('sine', 55, 4.3, 2.8, .2, { atk: .02, out: sat });                                              // grave sustentado (A)
    pad([110, 164.81, 220, 277.18, 329.63, 493.88], 4.3, 2.8, .017, 600, 3600, .45, { rel: .8 });        // A maior add9, abre devagar
    noise(4.3, .9, .12, { type: 'highpass', f1: 3000, q: .7, atk: .002, verb: .5 });
    bell(880, 4.3, 2.4, .05, -.2); bell(1318.5, 4.34, 2.1, .03, .3);
    duck.gain.setTargetAtTime(.35, A(4.3), .005); duck.gain.setTargetAtTime(1, A(4.34), .1);

    // ===== 4,7 – 5,7 s · falha nas três cores =====
    for (let t = 4.7, k = 0; t < 5.7; t += SX / 2, k++) {                                                 // portão: o pad gagueja
      const closed = rnd() < .4 && k > 0; gate.gain.setValueAtTime(closed ? .06 : 1, A(t));
    }
    gate.gain.setValueAtTime(1, A(5.72));
    SWITCH.forEach((s, i) => {                                                                            // um estalo de bits esmagados a cada troca de cor
      voice(i % 2 ? 'square' : 'sawtooth', 500 + rnd() * 1700, s, .06, .07, { f2: 110, fd: .06, out: crush, pan: rnd() - .5 });
      noise(s, .035, .1, { type: 'highpass', f1: 2200, out: crush, pan1: rnd() * 1.6 - .8 });
    });
    noise(4.7, 1.0, .06, { f1: 900, f2: 2800, q: 6, atk: .3, pan1: .8, pan2: -.8, out: crush });

    // ===== 5,35 s · brilho passa pelas letras =====
    noise(5.35, 1.0, .09, { f1: 2400, f2: 9500, q: 2.5, atk: .35, pan1: -.85, pan2: .85, verb: .5 });
    bell(1760, 5.35, 1.6, .02, .5); bell(2349.3, 5.45, 1.4, .014, -.5);

    // ===== 6,2 s · segunda falha e resolução =====
    [6.2, 6.28, 6.36].forEach((t, i) => { voice('sawtooth', 220 * (1 + i), t, .07, .08, { f2: 90, fd: .07, out: crush }); noise(t, .04, .12, { type: 'highpass', f1: 1800, out: crush }); });
    for (let t = 6.2; t < 6.6; t += SX / 2) gate.gain.setValueAtTime(rnd() < .45 ? .06 : 1, A(t));
    gate.gain.setValueAtTime(1, A(6.62));
    voice('sine', 110, 6.45, 1.6, .16, { atk: .03, out: sat });
    pad([220, 277.18, 329.63, 440, 554.37], 6.45, 1.9, .016, 3200, 800, .05, { rel: 1.2, to: gate });   // A maior, com cauda de reverb
    mix.gain.setValueAtTime(.5, at(5.25)); mix.gain.linearRampToValueAtTime(0, at(5.9));                // a trilha inteira (com a cauda) termina antes de 6 s
    bell(1108.7, 6.48, 1.8, .03, 0); voice('sine', 2637, 6.5, .9, .008, { echo: .6, verb: .5 });
  }
  window.INTRO_TRACK = { draft, scale: K, duration: 6 };
})();
