// Início: botão do celular no canto superior esquerdo; ao clicar, abre o QR code do controle pelo celular (e liga o controle se estiver desligado).
(function () {
  const Q = s => document.querySelector(s);
  let box = null, open = false, timer = null, lastK = '';
  function build() {
    const home = Q('#p-home'); if (box || !home) return;
    box = document.createElement('div'); box.id = 'qrHome'; box.className = 'qrh';
    box.innerHTML = `<button class="qrb" id="qrBtn" title="Controle pelo celular"><svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.4"/><path d="M11 18.5h2"/></svg><span>Celular</span></button>
      <div class="qrp" id="qrPanel"><b id="qrT">Controle pelo celular</b><small id="qrS"></small><div class="qrbox" id="qrBox"></div><code id="qrU"></code>
        <div class="qrbtns"><button class="ghost" id="qrOn" hidden>Ligar</button><button class="ghost" id="qrCopy" hidden>Copiar link</button><button class="ghost" id="qrOff" hidden>Desligar</button></div></div>`;
    home.appendChild(box);
    Q('#qrBtn').onclick = () => { open = !open; box.classList.toggle('open', open); refresh(true); };
    document.addEventListener('pointerdown', e => { if (open && !box.contains(e.target)) { open = false; box.classList.remove('open'); } });
    Q('#qrOn').onclick = async () => { await hub.remoteSet({ enabled: true }); setTimeout(() => refresh(true), 900); };
    Q('#qrOff').onclick = async () => { await hub.remoteSet({ enabled: false }); setTimeout(() => refresh(true), 400); };
    Q('#qrCopy').onclick = () => { const u = Q('#qrU').textContent; if (u) navigator.clipboard.writeText(u).then(() => toast('Link copiado')).catch(() => {}); };
  }
  async function refresh(force) {
    if (!box || !S) return; const on = !!(S.remoteCfg && S.remoteCfg.enabled);
    box.classList.toggle('live', on);
    if (!open) return;
    Q('#qrOn').hidden = on; Q('#qrOff').hidden = !on; Q('#qrCopy').hidden = !on;
    if (!on) { Q('#qrT').textContent = 'Controle pelo celular'; Q('#qrS').textContent = 'Está desligado. Ligue para controlar preset, volume e microfone do celular, na mesma rede Wi-Fi.'; Q('#qrBox').innerHTML = ''; Q('#qrU').textContent = ''; lastK = ''; return; }
    const i = await hub.remoteInfo(), k = JSON.stringify([i.enabled, i.urls]);
    if (k !== lastK || force) { lastK = k; Q('#qrBox').innerHTML = i.svg || ''; Q('#qrU').textContent = i.urls[0] || ''; }
    Q('#qrT').textContent = 'Aponte a câmera do celular';
    Q('#qrS').textContent = i.urls[0] ? (i.clients ? i.clients + (i.clients === 1 ? ' celular conectado' : ' celulares conectados') : 'Mesma rede Wi-Fi do PC. Se o Windows perguntar sobre o Firewall, permita em “Redes privadas”.') : 'Sem rede encontrada. Conecte o PC ao Wi-Fi.';
  }
  function render() { if (!S) return; build(); refresh(false); if (!timer) timer = setInterval(() => { if (open && typeof page !== 'undefined' && page === 'home') refresh(false); }, 3000); }
  window.QrHome = { render };
})();
