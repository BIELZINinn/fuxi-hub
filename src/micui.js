// Configurações → Microfone: ganho, corte de graves e equalização da voz do microfone do Fuxi, aplicados pelo Equalizer APO (a saída de som não muda).
(function () {
  const Q = s => document.querySelector(s);
  const PRE = [['natural', 'Natural'], ['clear', 'Voz clara'], ['radio', 'Voz de rádio'], ['soft', 'Voz suave'], ['custom', 'Personalizado']];
  const SL = [['gain', 'Ganho', -12, 18, 'dB'], ['warm', 'Calor (graves)', -6, 6, 'dB'], ['presence', 'Presença', -6, 6, 'dB'], ['air', 'Brilho (ar)', -6, 6, 'dB'], ['deess', 'Sibilância (de-esser)', -8, 0, 'dB']];
  const HP = [0, 60, 70, 80, 90, 100, 120, 150];
  let built = false, timer = null;
  const fmt = (v, u) => (v > 0 ? '+' : '') + Number(v).toFixed(1).replace('.', ',') + ' ' + u;
  function curve(c) {                                                  // resposta da cadeia do microfone (corte de graves + filtros)
    const fr = EQMath.logFreqs(90), W = 320, H = 76, y = d => H / 2 - Math.max(-12, Math.min(12, d)) / 12 * (H / 2 - 4);
    const f = [150, 3000, 9000, 7000], g = [c.warm, c.presence, c.air, c.deess], q = [0.8, 1, 0.7, 3], ty = ['PK', 'PK', 'HSC', 'PK'];
    const sh = EQMath.response(f, g, q, fr, ty), r = fr.map((x, i) => sh[i] + (c.hp ? 20 * Math.log10((x / c.hp) ** 2 / Math.sqrt(1 + (x / c.hp) ** 4)) : 0));
    const p = fr.map((x, i) => (i ? 'L' : 'M') + ((i / (fr.length - 1)) * W).toFixed(1) + ',' + y(r[i]).toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:84px"><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#ffffff1c"/><path d="${p}" fill="none" stroke="var(--ac)" stroke-width="2.2" stroke-linecap="round" style="filter:drop-shadow(0 0 5px var(--acg))"/></svg>`;
  }
  function build() {
    if (built || !Q('#mcBox')) return; built = true;
    Q('#mcBox').innerHTML = `<div class="card"><h3>Ajuste do microfone</h3>
      <div class="srow" style="border-top:0"><div class="lb"><b>Usar o ajuste do hub no microfone</b><small>O hub aplica ganho, corte de graves e equalização à sua voz no microfone do Fuxi H3 (pelo Equalizer APO). A saída de som não muda: o fone continua tocando pela saída que você já usa.</small></div>
        <label class="switch"><span>Microfone</span><input type="checkbox" id="mcOn"><i></i></label></div>
      <div class="mcst" id="mcSt"></div>
      <div class="srow stk"><div class="lb"><b>Estilo da voz</b></div><div class="seg" id="mcPre">${PRE.map(([k, t]) => `<button data-v="${k}">${t}</button>`).join('')}</div></div>
      <div id="mcCv" style="padding:2px 4px 8px"></div>
      <div class="srow"><div class="lb"><b>Corte de graves</b><small>Tira o ronco da mesa e o sopro. Valores mais altos deixam a voz mais fina.</small></div><select id="mcHp" class="sel" style="min-width:130px;padding:6px 10px">${HP.map(v => `<option value="${v}">${v ? v + ' Hz' : 'Desligado'}</option>`).join('')}</select></div>
      ${SL.map(([k, n, a, b]) => `<div class="srow" style="padding:9px 0"><div class="lb"><b>${n}</b></div><div class="ctl"><input type="range" class="rng" id="mc-${k}" min="${a}" max="${b}" step="0.5"><span class="vv" id="mcv-${k}" style="width:62px;text-align:right"></span></div></div>`).join('')}
      <div class="mcnote">O Equalizer APO não tem supressão de ruído nem “noise gate”: o ajuste melhora o timbre e o volume da voz. Dica: grave um áudio no Gravador de Voz do Windows para ouvir o resultado. Ganho muito alto pode distorcer.</div></div>`;
    Q('#mcOn').onchange = e => hub.micFxSet({ enabled: e.target.checked });
    document.querySelectorAll('#mcPre button').forEach(b => b.onclick = () => hub.micFxSet({ preset: b.dataset.v }));
    Q('#mcHp').onchange = e => hub.micFxSet({ hp: +e.target.value });
    SL.forEach(([k]) => { const el = Q('#mc-' + k); el.oninput = () => { Q('#mcv-' + k).textContent = fmt(+el.value, 'dB'); clearTimeout(timer); timer = setTimeout(() => hub.micFxSet({ [k]: +el.value }), 150); }; });
  }
  function render() {
    if (!S || !S.micFx) return; build(); if (!built) return; const c = S.micFx, a = S.micApo || {};
    Q('#mcOn').checked = c.enabled;
    document.querySelectorAll('#mcPre button').forEach(b => b.classList.toggle('on', b.dataset.v === c.preset));
    if (document.activeElement !== Q('#mcHp')) Q('#mcHp').value = String(c.hp);
    SL.forEach(([k]) => { const el = Q('#mc-' + k); if (document.activeElement !== el) el.value = c[k]; Q('#mcv-' + k).textContent = fmt(c[k], 'dB'); });
    Q('#mcCv').innerHTML = curve(c);
    let st;
    if (!c.enabled) st = '<span class="exdot"></span>Desligado: o microfone fica como o Windows entrega.';
    else if (!a.guid) st = '<span class="exdot"></span>Microfone do Fuxi H3 não encontrado. Conecte o fone.';
    else if (!a.registered) st = `<span class="exdot"></span><div>Falta registrar o microfone no Equalizer APO. Abra o Device Selector, vá na aba “Capture devices”, marque o microfone do Fuxi H3 e reinicie o PC.<br><button class="ghost" id="mcDs" style="margin-top:8px;padding:6px 12px;font-size:12px">Abrir Device Selector</button></div>`;
    else st = '<span class="exdot on"></span>Ajuste ativo no microfone do Fuxi H3.';
    const el = Q('#mcSt'); if (el.dataset.k !== st) { el.dataset.k = st; el.innerHTML = st; const b = Q('#mcDs'); if (b) b.onclick = () => hub.openConfigurator(); }
  }
  window.MicUi = { render };
})();
