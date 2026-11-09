// Efeitos visuais: fundo vivo, indicador da barra lateral, transição entre abas (com sentido) e ondinha nos botões.
(function () {
  const amb = document.createElement('div'); amb.className = 'amb'; amb.innerHTML = '<i></i><i></i>'; document.body.prepend(amb);
  const navs = () => [...document.querySelectorAll('.nav')];
  function placeInd(p) {
    const rind = document.getElementById('rind'), n = navs().find(x => x.dataset.page === p); if (!rind || !n) return;
    rind.style.top = (n.offsetTop + (n.offsetHeight - 24) / 2) + 'px';
  }
  const SEL = '.ph,.cards>.card,.cards>div,.abrow,.eqwrap,.bandpanel,.bandrow,.mrow,.gtools,.quick>*,.cfgnav,.hero,.now,.lkrow:first-child';
  let tm = null;
  window.fxPage = function (prev, next) {
    placeInd(next);
    const el = document.getElementById('p-' + next); if (!el || prev === next) return;
    const order = navs().map(n => n.dataset.page), dir = order.indexOf(next) >= order.indexOf(prev) ? 1 : -1;
    el.style.setProperty('--dir', dir);
    let i = 0; el.querySelectorAll(SEL).forEach(x => { x.style.setProperty('--i', Math.min(i++, 9)); });
    el.classList.remove('enter', 'stag'); void el.offsetWidth; el.classList.add('enter', 'stag');
    clearTimeout(tm); tm = setTimeout(() => el.classList.remove('enter', 'stag'), 1500);
  };
  addEventListener('resize', () => { const on = document.querySelector('.nav.on'); if (on) placeInd(on.dataset.page); });
  requestAnimationFrame(() => placeInd('home'));
  document.addEventListener('pointerdown', e => {                       // ondinha nos botões
    const b = e.target.closest && e.target.closest('.ghost,.solid,.seg button'); if (!b || document.body.classList.contains('rm')) return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2, d = document.createElement('span');
    d.className = 'fxr'; d.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.appendChild(d); setTimeout(() => d.remove(), 650);
  });
})();
