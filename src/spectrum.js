// Espectro do áudio que está tocando no PC (captura "loopback" do Windows, sem microfone). Uma captura só, compartilhada.
(function (root) {
  let ctx = null, an = null, data = null, starting = null, ok = null;
  function start() {
    if (starting) return starting;
    starting = (async () => {
      try {
        const st = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        st.getVideoTracks().forEach(t => t.stop());                                  // só o áudio interessa
        const at = st.getAudioTracks(); if (!at.length) throw new Error('sem áudio');
        ctx = new AudioContext(); const src = ctx.createMediaStreamSource(new MediaStream(at));
        an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = .8; src.connect(an);
        data = new Uint8Array(an.frequencyBinCount); ok = true;
      } catch (e) { ok = false; }
    })();
    return starting;
  }
  // n faixas espaçadas em escala logarítmica entre lo e hi (Hz), valores de 0 a 1
  function bins(n, lo = 30, hi = 16000) {
    if (!an) return null;
    an.getByteFrequencyData(data);
    const sr = ctx.sampleRate, k = data.length / (sr / 2), out = new Array(n);
    for (let i = 0; i < n; i++) {
      const f0 = lo * Math.pow(hi / lo, i / n), f1 = lo * Math.pow(hi / lo, (i + 1) / n);
      let a = Math.max(0, Math.floor(f0 * k)), b = Math.min(data.length - 1, Math.max(a, Math.ceil(f1 * k))), m = 0;
      for (let j = a; j <= b; j++) if (data[j] > m) m = data[j];
      out[i] = m / 255;
    }
    return out;
  }
  root.Spectrum = { start, bins, get ok() { return ok; } };
})(window);
