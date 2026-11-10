// Configurações → Celular: controle do hub pelo celular, na mesma rede Wi-Fi (QR code com código secreto).
(function () {
  const Q = s => document.querySelector(s);
  let built = false, timer = null, lastInfo = '';
  function build() {
    if (built || !Q('#cePhBox')) return; built = true;
    Q('#cePhBox').innerHTML = `<div class="card"><h3>Controle pelo celular</h3>
      <div class="srow" style="border-top:0"><div class="lb"><b>Ligar o controle pelo celular</b><small>Abre uma página local na sua rede Wi-Fi para trocar preset, volume e microfone sem sair do jogo. Fica desligado até você ligar e só vale na sua rede.</small></div>
        <label class="switch"><span>Celular</span><input type="checkbox" id="rmOn"><i></i></label></div>
      <div id="rmBody" hidden>
        <div class="rmqr"><div class="rmbox" id="rmQr"></div><div class="rmtx"><b>Aponte a câmera do celular para o QR code</b><small>O celular precisa estar na mesma rede Wi-Fi do PC. Se o Windows perguntar sobre o Firewall, permita o acesso em “Redes privadas”.</small>
          <code id="rmUrl"></code><div class="btns" style="margin:10px 0 0"><button class="ghost" id="rmCopy">Copiar link</button><button class="ghost" id="rmNew">Gerar novo código</button></div><div class="rmst" id="rmSt"></div></div></div>
        <div class="mcnote">Qualquer pessoa na sua rede com este link pode controlar o hub (preset, volume e microfone). Não compartilhe o link. “Gerar novo código” invalida o link e o QR code antigos. A conexão é local (HTTP, sem internet).</div></div></div>`;
    Q('#rmOn').onchange = async e => { await hub.remoteSet({ enabled: e.target.checked }); setTimeout(refresh, 700); };
    Q('#rmNew').onclick = async () => { await hub.remoteNewToken(); toast('Novo código gerado: o link antigo parou de funcionar'); lastInfo = ''; setTimeout(refresh, 300); };
    Q('#rmCopy').onclick = () => { const u = Q('#rmUrl').textContent; if (u) { navigator.clipboard.writeText(u).then(() => toast('Link copiado')).catch(() => {}); } };
  }
  async function refresh() {
    if (!built || !S) return; const on = !!(S.remoteCfg && S.remoteCfg.enabled); Q('#rmOn').checked = on; Q('#rmBody').hidden = !on; if (!on) return;
    const i = await hub.remoteInfo(), k = JSON.stringify([i.enabled, i.urls]);
    if (k !== lastInfo) { lastInfo = k; Q('#rmQr').innerHTML = i.svg || ''; Q('#rmUrl').textContent = i.urls[0] || (i.enabled ? 'Sem rede encontrada' : 'Iniciando…'); }
    Q('#rmSt').innerHTML = `<span class="exdot ${i.clients ? 'on' : ''}"></span>${i.clients ? i.clients + (i.clients === 1 ? ' celular conectado' : ' celulares conectados') : 'Nenhum celular conectado agora'}`;
  }
  function render() {
    if (!S) return; build(); refresh();
    if (!timer) timer = setInterval(() => { if (typeof page !== 'undefined' && page === 'settings') refresh(); }, 3000);
  }
  window.RemoteUi = { render };
})();
