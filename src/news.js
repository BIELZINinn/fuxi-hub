// Tela de novidades: aparece uma vez depois de cada atualização (e pode ser reaberta em Configurações → Sobre).
(function () {
  let el = null, shown = false;
  const T = { pt: ['Novidades', 'Versão', 'Entendi'], en: ['What\'s new', 'Version', 'Got it'], es: ['Novedades', 'Versión', 'Entendido'] };
  function open(data) {
    if (el) return; const lang = (S && S.ui && S.ui.lang) || 'pt', items = data.items[lang] || data.items.pt || [], tx = T[lang] || T.pt;
    el = document.createElement('div'); el.id = 'news'; el.setAttribute('data-no-i18n', '');
    el.innerHTML = `<div class="nwc"><div class="nwh"><small>${tx[1]} ${esc(data.version)}</small><h2>${tx[0]}</h2></div>
      <ul>${items.map(([t, d], i) => `<li style="--i:${i}"><i>${i + 1}</i><div><b>${esc(t)}</b><span>${esc(d)}</span></div></li>`).join('')}</ul>
      <div class="nwf"><button class="solid" id="nwOk">${tx[2]}</button></div></div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('on'));
    const close = () => { if (!el) return; el.classList.remove('on'); const e2 = el; el = null; setTimeout(() => e2.remove(), 400); hub.newsSeen(); };
    el.querySelector('#nwOk').onclick = close; el.addEventListener('pointerdown', e => { if (e.target === el) close(); });
    document.addEventListener('keydown', function k(e) { if (!el) { document.removeEventListener('keydown', k); return; } if (e.key === 'Escape' || e.key === 'Enter') { close(); document.removeEventListener('keydown', k); } });
  }
  function render() {
    if (shown || !S || !S.news) return;
    if (window.Tour && Tour.isActive && Tour.isActive()) return;                      // o tutorial vai primeiro
    shown = true; setTimeout(() => { if (S.news) open(S.news); }, 2600);              // espera a abertura animada terminar
  }
  window.News = { render, open, replay: async () => { const d = await hub.newsGet(); if (d) open(d); } };
})();
