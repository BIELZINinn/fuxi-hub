const $ = id => document.getElementById(id);
const npEl = $('np'), pop = $('pop'), img = $('npImg'), pill = $('pill');
let curKey = null, pillTimer = null, swapTimer = null;
const COLORS = { spotify: '#1db954', youtube: '#ff3b3b' };
function setArt(p) {
  const fb = '../assets/services/' + p.site + '-badge.png';
  img.onerror = () => { img.onerror = null; img.src = fb; };
  img.src = p.art || fb;
}
function showPill(ms) {
  pill.classList.add('on'); clearTimeout(pillTimer); pillTimer = setTimeout(() => pill.classList.remove('on'), ms);
}
window.np.onUpdate(p => {
  document.body.classList.toggle('rm', !!p.perf);
  if (window.I18N && p.lang) I18N.setLang(p.lang);
  if (!p.show) { npEl.classList.remove('on'); curKey = null; pill.classList.remove('on'); return; }
  npEl.style.setProperty('--c', COLORS[p.site] || '#2ef2ff');
  npEl.classList.toggle('sm', p.size === 'small'); npEl.classList.toggle('right', /right$/.test(p.pos)); npEl.classList.toggle('paused', p.state !== 'playing'); npEl.classList.toggle('cmd', !!p.ctl); npEl.classList.toggle('nocmd', !p.ctl);
  const key = p.site + '|' + p.title + '|' + p.artist, changed = key !== curKey, first = curKey === null;
  const apply = () => { setArt(p); $('npT').textContent = p.title || ''; $('npA').textContent = p.artist || (p.site === 'youtube' ? 'YouTube' : 'Spotify'); };
  if (changed) {
    curKey = key;
    if (first) { apply(); npEl.classList.add('on'); if (p.showTitle && p.title) showPill(5200); }
    else {
      pop.classList.remove('swap'); void pop.offsetWidth; pop.classList.add('swap'); pill.classList.remove('on');
      clearTimeout(swapTimer); swapTimer = setTimeout(() => { apply(); if (p.showTitle && p.title) showPill(5200); }, 380);
      setTimeout(() => pop.classList.remove('swap'), 1100);
    }
  }
  npEl.classList.add('on');
});

// mini player: o mouse só "pega" a janela quando está sobre o disco ou o cartão (no resto ela deixa o clique passar para o jogo)
let hovT = null, inside = false;
function setHover(on) {
  clearTimeout(hovT);
  if (on) { if (!inside) { inside = true; window.np.hover(true); npEl.classList.add('hov'); pill.classList.add('on'); clearTimeout(pillTimer); } }
  else hovT = setTimeout(() => { inside = false; window.np.hover(false); npEl.classList.remove('hov'); pillTimer = setTimeout(() => pill.classList.remove('on'), 1200); }, 450);
}
for (const el of [$('disc'), pill]) { el.addEventListener('mouseenter', () => { if (npEl.classList.contains('cmd')) setHover(true); }); el.addEventListener('mouseleave', () => setHover(false)); }
document.querySelectorAll('#npCtl button').forEach(b => b.onclick = e => { e.stopPropagation(); window.np.cmd(b.dataset.c); });
$('disc').onclick = () => { if (npEl.classList.contains('cmd')) window.np.cmd('toggle'); };