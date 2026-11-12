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
// · arrastar o disco com o botão esquerdo leva a janela para qualquer lugar da tela · roda do mouse sobre ele: maior / menor · botões − e + no cartão
let hovT = null, inside = false, dragging = false, moved = false, blockClick = false;
function setHover(on) {
  clearTimeout(hovT);
  if (on) { if (!inside) { inside = true; window.np.hover(true); npEl.classList.add('hov'); pill.classList.add('on'); clearTimeout(pillTimer); } }
  else hovT = setTimeout(() => { if (dragging) return; inside = false; window.np.hover(false); npEl.classList.remove('hov'); pillTimer = setTimeout(() => pill.classList.remove('on'), 1200); }, 450);
}
for (const el of [$('disc'), pill]) { el.addEventListener('mouseenter', () => setHover(true)); el.addEventListener('mouseleave', () => setHover(false)); }
for (const el of [$('disc'), pill]) el.addEventListener('wheel', e => { e.preventDefault(); window.np.scale(e.deltaY < 0 ? .1 : -.1); }, { passive: false });
const disc = $('disc'); let sx = 0, sy = 0;
// o arrasto escuta a janela inteira (e não só o disco): assim continua mesmo se o ponteiro sair do disco por um instante
const onMove = e => { if (!dragging) return; if (!moved && Math.abs(e.screenX - sx) + Math.abs(e.screenY - sy) > 4) moved = true; if (moved) window.np.drag('move'); };
const endDrag = e => {
  if (!dragging) return; dragging = false; npEl.classList.remove('drag');
  window.removeEventListener('pointermove', onMove, true); window.removeEventListener('pointerup', endDrag, true); window.removeEventListener('pointercancel', endDrag, true);
  try { disc.releasePointerCapture(e.pointerId); } catch {}
  if (moved) { window.np.drag('end'); blockClick = true; setTimeout(() => { blockClick = false; }, 80); } else window.np.drag('cancel');
};
disc.addEventListener('pointerdown', e => {
  if (e.button !== 0 || dragging) return; dragging = true; moved = false; sx = e.screenX; sy = e.screenY;
  try { disc.setPointerCapture(e.pointerId); } catch {} window.np.drag('start'); npEl.classList.add('drag');
  window.addEventListener('pointermove', onMove, true); window.addEventListener('pointerup', endDrag, true); window.addEventListener('pointercancel', endDrag, true);
});document.querySelectorAll('#npCtl button').forEach(b => b.onclick = e => { e.stopPropagation(); window.np.cmd(b.dataset.c); });
document.querySelectorAll('#npSz button').forEach(b => b.onclick = e => { e.stopPropagation(); window.np.scale(+b.dataset.d); });
$('disc').onclick = () => { if (!blockClick && npEl.classList.contains('cmd')) window.np.cmd('toggle'); };