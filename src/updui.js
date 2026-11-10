// Atualização automática: card em Configurações → Sobre e um aviso discreto no Início quando há versão nova.
(function () {
  const Q = s => document.querySelector(s);
  let built = false;
  function build() {
    const box = Q('#sbBox'); if (built || !box || !box.children.length) return; built = true;
    box.insertAdjacentHTML('beforeend', `<div class="card" id="updCard"><h3>Atualizações</h3>
      <div class="srow" style="border-top:0"><div class="lb"><b id="updTitle">Versão</b><small id="updMsg"></small></div>
        <div class="btns" style="margin:0"><button class="ghost" id="updCheck">Verificar agora</button><button class="ghost use" id="updGo" hidden style="background:var(--ac);color:#001;border-color:var(--ac);font-weight:600">Instalar agora</button></div></div>
      <div class="updbar" id="updBar" hidden><u id="updFill"></u></div>
      <div class="srow"><div class="lb"><b>Baixar atualizações automaticamente</b><small>O hub confere o GitHub de tempos em tempos, baixa a versão nova em segundo plano e confere o SHA-256. Você escolhe quando instalar.</small></div>
        <label class="switch"><span>Automático</span><input type="checkbox" id="updAuto"><i></i></label></div>
      <div class="srow" id="updNotesRow" hidden><div class="lb"><b>Novidades</b><small id="updNotes" style="white-space:pre-wrap"></small></div><button class="ghost" id="updPage">Ver no GitHub</button></div></div>`);
    Q('#updCheck').onclick = () => hub.updateCheck();
    Q('#updGo').onclick = async () => { if (S.update.status === 'ready') { const ok = await hub.updateInstall(); if (!ok) toast(S.packaged ? 'Não consegui iniciar o instalador' : 'Só no app instalado: aqui você está em modo de desenvolvimento'); } else hub.updateCheck(); };
    Q('#updAuto').onchange = e => hub.setUpdate({ auto: e.target.checked });
    Q('#updPage').onclick = () => hub.openReleasePage();
    const chip = document.createElement('button'); chip.id = 'updChip'; chip.hidden = true; chip.className = 'updchip'; chip.innerHTML = '<i></i><span id="updChipT"></span>';
    chip.onclick = () => { go('settings'); document.querySelector('#cfgNav [data-s=sobre]').click(); };
    Q('#p-home').appendChild(chip);
  }
  function render() {
    if (!S || !S.update) return; build(); if (!built) return;
    const u = S.update, c = S.updateCfg || { auto: true }, v = S.version || '';
    Q('#updTitle').textContent = 'Versão ' + v;
    const msg = { idle: 'Ainda não verificado.', checking: 'Verificando…', uptodate: 'Você está na versão mais recente.', available: `Nova versão ${u.version} disponível.`, downloading: `Baixando a versão ${u.version}… ${Math.round((u.progress || 0) * 100)}%`, ready: `Versão ${u.version} pronta para instalar.`, error: 'Não consegui verificar agora: ' + (u.error || '') }[u.status] || '';
    Q('#updMsg').textContent = msg;
    Q('#updAuto').checked = c.auto !== false;
    const go2 = Q('#updGo'); go2.hidden = !(u.status === 'ready' || (u.status === 'available' && u.url && u.sha && !c.auto)); go2.textContent = u.status === 'ready' ? 'Instalar agora' : 'Baixar agora';
    Q('#updCheck').disabled = u.status === 'checking' || u.status === 'downloading';
    Q('#updBar').hidden = u.status !== 'downloading'; Q('#updFill').style.width = Math.round((u.progress || 0) * 100) + '%';
    const showN = ['available', 'downloading', 'ready'].includes(u.status) && u.notes; Q('#updNotesRow').hidden = !showN; if (showN) Q('#updNotes').textContent = u.notes.replace(/[#*`]/g, '').replace(/\n{2,}/g, '\n').slice(0, 420);
    const chip = Q('#updChip'), show = ['available', 'downloading', 'ready'].includes(u.status); chip.hidden = !show;
    if (show) Q('#updChipT').textContent = u.status === 'ready' ? `Versão ${u.version} pronta · instalar` : `Nova versão ${u.version}`;
  }
  window.UpdUi = { render };
})();
