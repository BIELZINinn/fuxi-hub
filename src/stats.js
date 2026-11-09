// Aba "Seu perfil": números de uso, atividade dos últimos meses, jogos mais jogados e conquistas (com aviso animado ao desbloquear).
(function () {
  const Q = s => document.querySelector(s);
  const TIER = { 1: '#cd8a4a', 2: '#c3cbd6', 3: '#ffcf4d' };
  const STAR = 'M12 3.2l2.5 5.3 5.8.8-4.2 4.1 1 5.8L12 16.4l-5.1 2.8 1-5.8-4.2-4.1 5.8-.8z';
  const ACH = [
    { id: 'first_game', n: 'Primeira partida', d: 'Abra um jogo com o hub ligado', cur: c => c.games > 0 ? 1 : 0, max: 1, tier: 1 },
    { id: 'hours10', n: 'Esquentando', d: '10 horas de jogo', cur: c => c.hours, max: 10, tier: 1 },
    { id: 'hours50', n: 'Veterano', d: '50 horas de jogo', cur: c => c.hours, max: 50, tier: 2 },
    { id: 'hours100', n: 'Lenda', d: '100 horas de jogo', cur: c => c.hours, max: 100, tier: 3 },
    { id: 'games5', n: 'Explorador', d: 'Jogue 5 jogos diferentes', cur: c => c.games, max: 5, tier: 1 },
    { id: 'games10', n: 'Colecionador', d: 'Jogue 10 jogos diferentes', cur: c => c.games, max: 10, tier: 2 },
    { id: 'cloud_first', n: 'Cabeça na nuvem', d: 'Jogue uma sessão no cloud', cur: c => c.cloudSessions > 0 ? 1 : 0, max: 1, tier: 1 },
    { id: 'cloud10', n: 'Nuvem constante', d: '10 horas no cloud', cur: c => c.cloudHours, max: 10, tier: 2 },
    { id: 'streak3', n: 'Em sequência', d: '3 dias seguidos usando o hub', cur: c => c.streak, max: 3, tier: 1 },
    { id: 'streak7', n: 'Semana perfeita', d: '7 dias seguidos', cur: c => c.streak, max: 7, tier: 2 },
    { id: 'streak30', n: 'Hábito de ouro', d: '30 dias seguidos', cur: c => c.streak, max: 30, tier: 3 },
    { id: 'surround', n: 'Som em volta', d: 'Ative o surround virtual', cur: () => (S.surroundCfg && S.surroundCfg.enabled ? 1 : 0), max: 1 },
    { id: 'fav', n: 'Favorito', d: 'Favorite um jogo', cur: () => ((S.favorites || []).length ? 1 : 0), max: 1 },
    { id: 'tour', n: 'Bem-informado', d: 'Conclua o tutorial', cur: () => (S.tutorial && S.tutorial.done ? 1 : 0), max: 1 },
    { id: 'ext', n: 'Conectado ao navegador', d: 'Conecte a extensão do cloud', cur: () => (S.extLive ? 1 : 0), max: 1 }
  ];
  const ymd = d => d.toLocaleDateString('sv');
  function ctx() {
    const st = S.stats || {}, ids = Object.keys(st), ms = ids.reduce((a, k) => a + (st[k].ms || 0), 0), log = (S.cloudCfg && S.cloudCfg.log) || [];
    const days = new Set(S.usageDays || []); let streak = 0, d = new Date(); if (!days.has(ymd(d))) d.setDate(d.getDate() - 1);
    while (days.has(ymd(d))) { streak++; d.setDate(d.getDate() - 1); }
    return { hours: ms / 3600000, games: ids.filter(k => st[k].count > 0).length, cloudHours: log.reduce((a, e) => a + e.ms, 0) / 3600000, cloudSessions: log.length, streak, days, total: days.size, st, ids };
  }
  const badge = (a, on) => `<svg viewBox="0 0 48 48" width="46" height="46"><circle cx="24" cy="24" r="21" fill="${on ? '#0a0a0d' : '#0c0c0f'}" stroke="${on ? (TIER[a.tier] || 'var(--ac)') : '#26262d'}" stroke-width="2"/><circle cx="24" cy="24" r="16" fill="none" stroke="${on ? (TIER[a.tier] || 'var(--ac)') : '#1d1d23'}" stroke-width="1" stroke-dasharray="2 3"/><path transform="translate(12 12)" d="${STAR}" fill="${on ? (TIER[a.tier] || 'var(--ac)') : '#2a2a31'}"/></svg>`;

  let built = false, key = '', pending = false, queue = [], showing = false;
  function build() {
    if (built) return; built = true;
    Q('#stBox').innerHTML = `<div class="cards">
      <div class="stk" id="stTiles"></div>
      <div class="card"><h3>Atividade</h3><div id="stHeat"></div></div>
      <div class="card"><h3>Mais jogados</h3><div id="stTop"></div></div>
      <div class="card"><h3>Conquistas <span id="stAchN" class="stn"></span></h3><div class="achgrid" id="stAch"></div></div></div>`;
  }
  function render() {
    if (!S || !S.stats) return; build();
    const c = ctx(), done = ACH.filter(a => a.cur(c) >= a.max), k = JSON.stringify([c.hours.toFixed(2), c.games, c.streak, c.total, done.map(a => a.id), Object.keys(S.ach || {}).length, c.cloudHours.toFixed(2)]);
    if (k !== key) {
      key = k;
      Q('#stTiles').innerHTML = [['Horas jogadas', c.hours, 1, 'h'], ['Jogos diferentes', c.games, 0, ''], ['Horas no cloud', c.cloudHours, 1, 'h'], ['Dias seguidos', c.streak, 0, '']].map(([n, v, dec, s], i) => `<div class="stt" style="--i:${i}"><small>${n}</small><b data-to="${v}" data-dec="${dec}" data-suf="${s}">0${s}</b></div>`).join('');
      // calendário: 18 semanas, uma coluna por semana (segunda a domingo)
      const today = new Date(), end = new Date(today); end.setDate(end.getDate() + (6 - ((today.getDay() + 6) % 7)));
      let cells = ''; for (let w = 17; w >= 0; w--) { let col = ''; for (let d = 0; d < 7; d++) { const dt = new Date(end); dt.setDate(end.getDate() - w * 7 - (6 - d)); const f = dt > today, on = c.days.has(ymd(dt)); col += `<i class="${f ? 'fut' : on ? 'on' : ''}" title="${dt.toLocaleDateString('pt-BR')}"></i>`; } cells += `<div>${col}</div>`; }
      Q('#stHeat').innerHTML = `<div class="heat">${cells}</div><small class="stsub">${c.total} ${c.total === 1 ? 'dia' : 'dias'} de uso registrados · sequência atual de ${c.streak}</small>`;
      const top = c.ids.filter(k2 => c.st[k2].ms > 0).sort((a, b) => c.st[b].ms - c.st[a].ms).slice(0, 5), mx = top.length ? c.st[top[0]].ms : 1;
      Q('#stTop').innerHTML = top.length ? top.map((id, i) => { const p = prof(id); return `<div class="stb" style="--i:${i}"><span>${esc(p ? p.name : id)}</span><div><u style="--w:${Math.max(4, Math.round(c.st[id].ms / mx * 100))}%;--c:${p ? p.color : 'var(--ac)'}"></u></div><em>${(c.st[id].ms / 3600000).toFixed(1).replace('.', ',')} h</em></div>`; }).join('') : '<div class="lkrow" style="border-top:0"><em>Os jogos que você abrir aparecem aqui, com o tempo de cada um.</em></div>';
      Q('#stAchN').textContent = done.length + ' / ' + ACH.length;
      Q('#stAch').innerHTML = ACH.map(a => { const v = Math.min(a.max, a.cur(c)), on = v >= a.max, ts = (S.ach || {})[a.id]; return `<div class="ach ${on ? 'on' : ''}">${badge(a, on)}<div><b>${a.n}</b><small>${a.d}</small>${on ? `<em>${ts ? 'Desbloqueada em ' + new Date(ts).toLocaleDateString('pt-BR') : 'Desbloqueada'}</em>` : `<div class="apb"><u style="width:${Math.round(v / a.max * 100)}%"></u></div>`}</div></div>`; }).join('');
      if (page === 'stats') enter();
    }
    // desbloqueios novos: avisa o main (que guarda a data) e anima
    const fresh = done.filter(a => !(S.ach || {})[a.id]).map(a => a.id);
    if (fresh.length && !pending) { pending = true; hub.achUnlock(fresh).then(r => { pending = false; if (r && !r.silent) r.fresh.forEach(id => queue.push(ACH.find(a => a.id === id))); next(); }).catch(() => { pending = false; }); }
  }
  function enter() {                                                     // números contam de 0 até o valor ao abrir a aba
    document.querySelectorAll('#stTiles b').forEach(b => { b._cv = 0; Fx2.count(b, +b.dataset.to, { dec: +b.dataset.dec, suffix: b.dataset.suf, dur: 1100 }); });
    document.querySelectorAll('#stTop u').forEach(u => { u.style.animation = 'none'; void u.offsetWidth; u.style.animation = ''; });
  }
  function next() {
    if (showing || !queue.length) return; const a = queue.shift(); if (!a) return next(); showing = true;
    const t = document.createElement('div'); t.className = 'achtoast';
    t.innerHTML = badge(a, true) + `<div><small>Conquista desbloqueada</small><b>${a.n}</b></div>` + Array.from({ length: 10 }, (_, i) => { const an = i / 10 * 6.283, r = 40 + (i % 3) * 14; return `<i class="spk" style="left:32px;top:50%;--dx:${Math.cos(an) * r}px;--dy:${Math.sin(an) * r}px;animation-delay:${(i % 4) * .08}s"></i>`; }).join('');
    document.body.appendChild(t); Fx2.sound('ach'); setTimeout(() => { t.remove(); showing = false; next(); }, 4800);
  }
  window.Stats = { render, enter };
})();
