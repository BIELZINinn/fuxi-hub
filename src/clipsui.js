// Aba Clipes: ligar o buffer de replay, ajustar qualidade, ver e editar os clipes salvos.
window.ClipsUI = (() => {
  const ENC = { h264_nvenc: 'NVIDIA NVENC', h264_amf: 'AMD AMF', h264_qsv: 'Intel Quick Sync', libx264: 'Processador (x264)' };
  let built = false, galleryAt = 0, cur = null;
  const fmtSize = b => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : (b / 1e6).toFixed(0) + ' MB';
  const fmtDate = ms => new Date(ms).toLocaleString();
  const opt = (v, cur, label) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${label}</option>`;

  function build() {
    built = true;
    $('#clipsBox').innerHTML = `
      <div class="card" id="clCfg"></div>
      <div id="clGrid"></div>
      <div id="clEmpty" class="clempty" hidden>Nenhum clipe ainda. Com o buffer ligado, aperte o atalho durante o jogo e o clipe aparece aqui.</div>
      <div id="clModal"><div class="box">
        <video id="clVid" controls></video>
        <div class="tools"><input type="text" id="clName"><button class="ghost" id="clRen">Renomear</button><button class="ghost" id="clShow">Mostrar na pasta</button><button class="ghost danger" id="clDel">Excluir</button><button class="ghost" id="clClose">Fechar</button></div>
        <div class="trim">Cortar: início <input type="number" id="clA" min="0" step="0.1" value="0"> s <button class="ghost" id="clSetA">usar ponto atual</button> fim <input type="number" id="clB" min="0" step="0.1" value="0"> s <button class="ghost" id="clSetB">usar ponto atual</button> <button class="solid" id="clCut">Salvar corte</button></div>
      </div></div>`;
    $('#clSave').onclick = async () => { const r = await hub.clipsSave(); if (r && r.ok) loadGallery(); };
    $('#clFolder').onclick = () => hub.clipsOpenFolder();
    const m = $('#clModal'), v = $('#clVid');
    const close = () => { v.pause(); v.removeAttribute('src'); v.load(); m.classList.remove('on'); cur = null; };
    $('#clClose').onclick = close; m.onclick = e => { if (e.target === m) close(); };
    $('#clShow').onclick = () => cur && hub.clipsShow(cur.name);
    $('#clDel').onclick = async () => { if (!cur || !confirm('Excluir este clipe? Ele vai para a Lixeira.')) return; const n = cur.name; close(); await hub.clipsDelete(n); setTimeout(loadGallery, 600); };
    $('#clRen').onclick = async () => { if (!cur) return; const ok = await hub.clipsRename(cur.name, $('#clName').value); if (ok) { toast('Clipe renomeado'); close(); loadGallery(); } else toast('Não consegui renomear (nome já existe?)'); };
    $('#clSetA').onclick = () => { $('#clA').value = v.currentTime.toFixed(1); };
    $('#clSetB').onclick = () => { $('#clB').value = v.currentTime.toFixed(1); };
    $('#clCut').onclick = async () => { if (!cur) return; const r = await hub.clipsTrim(cur.name, $('#clA').value, $('#clB').value); if (r && r.ok) { toast('Corte salvo: ' + r.name); close(); loadGallery(); } else toast((r && r.error) || 'Falha ao cortar'); };
    v.addEventListener('loadedmetadata', () => { $('#clA').value = 0; $('#clB').value = v.duration.toFixed(1); });
  }

  function open(c) {
    cur = c; const v = $('#clVid'); v.src = c.url; $('#clName').value = c.name.replace(/\.mp4$/i, ''); $('#clModal').classList.add('on'); v.play().catch(() => {});
  }

  async function loadGallery() {
    if (!built) return;
    const list = await hub.clipsList(); galleryAt = Date.now();
    $('#clGrid').innerHTML = list.map((c, i) => `<div class="clcard" data-i="${i}"><div class="clthumb"${c.thumb ? ` style="background-image:url('${c.thumb}')"` : ''}></div><div class="clmeta"><b>${esc(c.name.replace(/\.mp4$/i, ''))}</b><small>${fmtDate(c.mtime)} · ${fmtSize(c.size)}</small></div></div>`).join('');
    $('#clEmpty').hidden = list.length > 0;
    $('#clGrid').querySelectorAll('.clcard').forEach(el => el.onclick = () => open(list[+el.dataset.i]));
  }

  let cap = null;                                                   // captura de tecla do atalho (reusa accelFrom e kbds do app.js)
  function stopCap() { if (cap) { document.removeEventListener('keydown', cap, true); cap = null; } }
  function startCap() {
    if (cap) { stopCap(); return render(); }
    cap = e => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { stopCap(); return render(); }
      const acc = accelFrom(e); if (!acc) return;
      stopCap(); hub.setHotkeys({ keys: { clip: acc } }); render();
    };
    document.addEventListener('keydown', cap, true); render();
  }

  function render() {
    if (!S || !S.clips) return; if (!built) build();
    const st = S.clips, c = S.clipsCfg, key = (S.hotkeys && S.hotkeys.keys && S.hotkeys.keys.clip) || 'Alt+F10', box = $('#clCfg');
    const hkErr = !!(S.hotkeyErrors && S.hotkeyErrors.clip && S.hotkeys.enabled), hkOn = S.hotkeys.enabled !== false, capKey = !!cap;
    const sig = JSON.stringify([st.installed, st.dl, st.running, st.encoder, st.error, st.bufSeconds, c, key, st.dir, hkErr, hkOn, capKey]);
    if (box.dataset.sig === sig) return;
    if (box.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName) && box.dataset.built) { box.dataset.sig = sig; return; }   // não atrapalha quem está digitando
    box.dataset.sig = sig; box.dataset.built = '1';
    const dl = st.dl || {};
    let h = '<h3>Gravação</h3>';
    if (!st.installed) {
      h += `<div class="srow"><div class="lb"><b>Falta o motor de captura</b><small>Para gravar, o hub baixa uma vez o ffmpeg (cerca de 190 MB) direto do repositório oficial. Ele fica só neste PC e usa a placa de vídeo, sem pesar no jogo.</small></div>
        <button class="solid" id="clInst"${dl.state && dl.state !== 'idle' ? ' disabled' : ''}>${dl.state === 'downloading' ? 'Baixando… ' + (dl.pct || 0) + '%' : dl.state === 'extracting' ? 'Instalando…' : 'Baixar e ativar'}</button></div>`;
      if (dl.state && dl.state !== 'idle') h += `<div class="bar"><i style="width:${dl.pct || 0}%"></i></div>`;
    } else {
      h += `<div class="stat"><span class="dot${st.running ? ' on' : ''}"></span><span>${st.running ? `Gravando · buffer de ${st.bufSeconds}s · ${esc(ENC[st.encoder] || st.encoder || '')}` : c.enabled ? (c.onlyGame ? 'Pronto — liga sozinho quando um jogo abrir' : 'Iniciando…') : 'Desligado'}</span></div>
        <div class="srow"><div class="lb"><b>Gravar os últimos segundos do jogo</b><small>Aperte <span style="color:var(--tx);font-weight:600">${esc(key)}</span> a qualquer momento e o hub salva um clipe dos últimos ${c.seconds} segundos, sem sair do jogo.</small></div>
          <label class="switch"><span>Ligado</span><input type="checkbox" id="clEn"${c.enabled ? ' checked' : ''}><i></i></label></div>
        <div class="srow"><div class="lb"><b>Atalho para salvar o clipe</b><small>Clique no botão e aperte as teclas que quiser (pode ser só uma tecla F, como F9). Esc cancela.</small>${hkErr ? '<div class="err">Atalho já usado por outro programa — escolha outro.</div>' : ''}${!hkOn ? '<div class="warn">Os atalhos globais estão desligados em Configurações → Atalhos.</div>' : ''}</div>
          <div class="hk"><div class="hkb${hkErr ? ' err' : ''}${capKey ? ' cap' : ''}" id="clKey" title="Clique e aperte as teclas">${capKey ? '<em>Aperte as teclas…</em>' : kbds(key)}</div></div></div>
        <div class="srow"><div class="lb"><b>Só enquanto um jogo estiver aberto</b><small>Economiza disco e processamento, mas só grava se o hub reconhecer o jogo. Desligado, o buffer roda o tempo todo e o atalho sempre funciona.</small></div>
          <label class="switch"><span>Só em jogo</span><input type="checkbox" id="clOnly"${c.onlyGame ? ' checked' : ''}><i></i></label></div>
        <div class="cfgrow">
          <div class="fld"><label>Duração do clipe</label><select id="clSec">${[15, 30, 60, 120, 180].map(v => opt(v, c.seconds, v >= 60 ? v / 60 + ' min' : v + ' s')).join('')}</select></div>
          <div class="fld"><label>Resolução</label><select id="clRes">${opt('native', c.res, 'Original da tela')}${opt('1440', c.res, '1440p')}${opt('1080', c.res, '1080p')}${opt('720', c.res, '720p')}</select></div>
          <div class="fld"><label>Quadros por segundo</label><select id="clFps">${opt(60, c.fps, '60 fps')}${opt(30, c.fps, '30 fps')}</select></div>
          <div class="fld"><label>Qualidade (Mbps)</label><input type="number" id="clBr" min="4" max="60" value="${c.bitrate}"></div>
          <div class="fld"><label>Monitor</label><select id="clMon">${[0, 1, 2, 3].map(v => opt(v, c.monitor, 'Tela ' + (v + 1))).join('')}</select></div>
          <div class="fld"><label>Codificador</label><select id="clEnc">${opt('auto', c.encoder, 'Automático')}${Object.keys(ENC).map(k => opt(k, c.encoder, ENC[k])).join('')}</select></div>
          <div class="fld"><label>Limite de espaço (GB, 0 = sem)</label><input type="number" id="clMax" min="0" max="500" value="${c.maxGB}"></div>
        </div>
        <div class="srow"><div class="lb"><b>Gravar o microfone junto</b><small>O som do jogo sempre entra. Com isto ligado, a sua voz é misturada no clipe.</small></div>
          <label class="switch"><span>Microfone</span><input type="checkbox" id="clMic"${c.mic ? ' checked' : ''}><i></i></label></div>
        <div class="srow"><div class="lb"><b>Pasta dos clipes</b><small>${esc(st.dir || '')}</small></div><button class="ghost" id="clDir">Trocar pasta</button></div>`;
    }
    if (st.error) h += `<div class="err">${esc(st.error)}</div>`;
    box.innerHTML = h;
    const set = (id, fn) => { const e = $('#' + id); if (e) e.onchange = ev => hub.clipsSet(fn(ev.target)); };
    set('clEn', e => ({ enabled: e.checked })); set('clOnly', e => ({ onlyGame: e.checked }));
    if ($('#clKey')) $('#clKey').onclick = startCap; set('clSec', e => ({ seconds: +e.value })); set('clRes', e => ({ res: e.value }));
    set('clFps', e => ({ fps: +e.value })); set('clBr', e => ({ bitrate: +e.value })); set('clMon', e => ({ monitor: +e.value })); set('clEnc', e => ({ encoder: e.value }));
    set('clMax', e => ({ maxGB: +e.value })); set('clMic', e => ({ mic: e.checked }));
    if ($('#clInst')) $('#clInst').onclick = async () => { const r = await hub.clipsInstall(); if (r && !r.ok && r.error) toast(r.error); else if (r && r.ok) toast('Pronto! Ligue os clipes'); };
    if ($('#clDir')) $('#clDir').onclick = async () => { const d = await hub.clipsChooseDir(); if (d) toast('Pasta trocada'); };
    if (st.last && st.last.at > galleryAt) loadGallery();
  }

  function enter() { if (!built) render(); loadGallery(); }
  return { render, enter };
})();
