const bd = document.getElementById('bd'), img = document.getElementById('bImg'), ini = document.getElementById('bIni');
window.badge.onUpdate(p => {
  if (!p.show) { bd.classList.remove('on'); return; }
  bd.className = 'bd ' + (p.style || 'pulse') + (p.size === 'small' ? ' sm' : '') + (p.cloud ? ' cloud' : '');
  bd.style.setProperty('--c', p.color || '#2ef2ff');
  if (p.art) { img.src = p.art; ini.textContent = ''; } else { img.removeAttribute('src'); ini.textContent = p.initials || ''; }
  void bd.offsetWidth; bd.classList.add('on');
});
