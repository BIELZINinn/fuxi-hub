const bd = document.getElementById('bd'), img = document.getElementById('bImg'), ini = document.getElementById('bIni');
window.badge.onUpdate(p => {
  document.body.classList.toggle('rm', !!p.perf);
  if (!p.show) { bd.classList.remove('on'); return; }
  bd.className = 'bd ' + (p.style || 'pulse') + (p.size === 'small' ? ' sm' : '') + (p.cloud ? ' cloud' : '');
  bd.style.setProperty('--c', p.color || '#2ef2ff');
  if (p.art) { img.src = p.art; ini.textContent = ''; } else { img.removeAttribute('src'); ini.textContent = p.initials || ''; }
  const bat = document.getElementById('bBat'), lv = p.bat;                       // bateria do fone: só aparece se o Windows informa o nível
  bat.style.display = typeof lv === 'number' ? 'flex' : 'none';
  if (typeof lv === 'number') { document.getElementById('bPct').textContent = lv + '%'; document.getElementById('bFill').style.width = Math.max(6, lv) + '%'; bat.className = 'bat' + (lv <= 10 ? ' crit' : lv <= 20 ? ' low' : ''); }
  void bd.offsetWidth; bd.classList.add('on');
});
