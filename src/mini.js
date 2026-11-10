// Mini-janela flutuante: preset, volume, microfone e espectro. Fecha com Esc, clicando fora ou depois de alguns segundos sem uso.
(function () {
  const $ = s => document.querySelector(s);
  let S = null, volDrag = false;
  const rgb = h => [0, 2, 4].map(i => parseInt(String(h).replace('#', '').slice(i, i + 2), 16) || 0);
  const keep = () => hub.miniKeep();
  function render() {
    if (!S) return;
    if (window.I18N && S.ui) I18N.setLang(S.ui.lang || 'pt');
    const p = S.profiles.find(x => x.id === S.active) || S.profiles[0], g = S.game && S.profiles.find(x => x.id === S.game), col = (g && g.color) || (p && p.color) || '#2ef2ff';
    document.documentElement.style.setProperty('--ac', col);
    $('#mName').textContent = S.game ? (S.gameName || (g && g.name) || p.name) : p.name;
    $('#mSub').textContent = S.game ? 'Jogando · ' + p.name : 'Preset ativo';
  }
  async function poll() {
    try {
      const m = await hub.mixerList(); if (m && m.master) { const v = Math.round(m.master.volume * 100); if (!volDrag) { $('#mVol').value = v; $('#mVol').style.setProperty('--p', v + '%'); $('#mVv').textContent = v + '%'; } $('#mMute').classList.toggle('on', !!m.master.mute); }
      const mic = await hub.micGet(); $('#mMic').classList.toggle('on', !!(mic && mic.mute));
    } catch {}
  }
  $('#mVol').oninput = e => { volDrag = true; const v = +e.target.value; e.target.style.setProperty('--p', v + '%'); $('#mVv').textContent = v + '%'; hub.masterSet(v); keep(); };
  $('#mVol').onchange = () => { volDrag = false; };
  $('#mMute').onclick = async () => { const on = !$('#mMute').classList.contains('on'); $('#mMute').classList.toggle('on', on); await hub.masterMute(on); keep(); };
  $('#mMic').onclick = async () => { await hub.runAction('micMute'); setTimeout(poll, 250); keep(); };
  $('#mPrev').onclick = () => { hub.runAction('prevPreset'); keep(); };
  $('#mNext').onclick = () => { hub.runAction('nextPreset'); keep(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hub.miniHide(); else keep(); });
  document.addEventListener('pointermove', keep, { passive: true });
  hub.onState(s => { S = s; render(); poll(); });
  hub.getState().then(s => { S = s; render(); poll(); });
  setInterval(() => { if (!document.hidden) poll(); }, 2500);

  // espectro
  const cv = $('#mSp'); let sm = null;
  (function loop() {
    requestAnimationFrame(loop); if (document.hidden) return;
    if (Spectrum.ok === null) Spectrum.start(); if (!Spectrum.ok) return;
    const d = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, w, h);
    const N = 48, v = Spectrum.bins(N) || new Array(N).fill(0), bw = w / N, a = rgb(getComputedStyle(document.documentElement).getPropertyValue('--ac').trim() || '#2ef2ff').join(',');
    sm = sm || new Array(N).fill(0);
    for (let i = 0; i < N; i++) { sm[i] += (v[i] - sm[i]) * (v[i] > sm[i] ? .5 : .12); const hh = 2 + Math.pow(sm[i], 1.4) * h * .85, g = c.createLinearGradient(0, h - hh, 0, h); g.addColorStop(0, `rgba(${a},.85)`); g.addColorStop(1, `rgba(${a},.05)`); c.fillStyle = g; c.beginPath(); c.roundRect(i * bw + bw * .2, h - hh, bw * .6, hh, 3); c.fill(); }
  })();
})();
