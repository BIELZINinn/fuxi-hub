const $ = s => document.querySelector(s);
let S = null, editId = 'default', draft = null, lastMode = null, page = 'home';

const fmtHz = f => f >= 1000 ? (f / 1000) + 'k' : f;
const prof = id => S.profiles.find(p => p.id === id);
const themed = c => (S && S.ui && S.ui.theme && S.ui.theme !== 'auto' && window.Fx2 ? Fx2.accent() : c);     // cor fixa escolhida em Configurações vale para o app todo
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 2400); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const scene = window.FuxiViewer.create($('#viewer'));
window.fuxiViewer = scene;
// ---------- navegação ----------
document.querySelectorAll('.nav').forEach(b => b.onclick = () => go(b.dataset.page));
function go(p) {
  const prevPage = page; page = p;
  if (window.fxPage) fxPage(prevPage, p);
  document.querySelectorAll('.nav').forEach(n => n.classList.toggle('on', n.dataset.page === p));
  document.querySelectorAll('.page').forEach(n => n.classList.toggle('on', n.id === 'p-' + p));
  if (p === 'eq') requestAnimationFrame(drawEq);
  else if (typeof stopPreview === 'function') { $('#liveSw').checked = false; stopPreview(); }   // sair da aba EQ encerra qualquer prévia
  if (p === 'mixer') pollMixer();
  if (p === 'device') loadHid();
  if (p === 'games' && typeof replayGames === 'function') replayGames();
  if (p === 'cloud' && typeof loadCloudWins === 'function') loadCloudWins();
  if (p === 'stats' && window.Stats) { Stats.render(); setTimeout(Stats.enter, 450); }
}
document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => hub.win(b.dataset.w));

// ---------- início ----------
function renderHome() {
  const d = S.device;
  const mode = d.known ? 'fuxi' : d.connected ? 'generic' : 'none';
  scene.setMode(mode);
  if (lastMode !== null && mode !== lastMode) {
    if (mode === 'fuxi') toast('Fuxi H3 conectado');             // o som e o aviso no canto da tela vêm do processo principal
    else if (lastMode === 'fuxi') toast('Fuxi H3 desconectado');
  }
  lastMode = mode;
  $('#devname').textContent = d.known ? 'Fuxi H3' : d.connected ? (d.name || 'Fone genérico') : 'Nenhum fone';
  $('#devsub').textContent = d.known ? 'USB · conectado · reconhecido' : d.connected ? 'Fone genérico · modo compatível' : 'Conecte um fone para começar';
  const a = prof(S.active) || prof('default');
  $('#activeName').textContent = (S.game ? 'Jogando · ' : '') + a.name;
  $('#activePill').style.setProperty('--pc', themed(a.color));
  scene.setAccent(themed(a.color));                       // a linha e o halo do fone mudam para a cor do preset
  const hc = (S.ui && S.ui.headset) || 'white', hsrc = '../assets/fuxi/' + (hc === 'white' ? 'hero.png' : 'hero-' + hc + '.png'), him = document.querySelector('.hp img');
  if (!him.src.endsWith(hsrc.slice(2))) him.src = hsrc;
  document.querySelectorAll('#hcols button').forEach(b => { b.classList.toggle('on', b.dataset.c === hc); b.title = b.dataset.n; b.onclick = () => hub.setUi({ headset: b.dataset.c }); });
  const hb = $('#h3btn'); if (hb) { hb.classList.toggle('on', S.ui.view3d === true); hb.onclick = () => hub.setUi({ view3d: S.ui.view3d !== true }); }
  const q = $('#quick'); q.innerHTML = '';
  S.profiles.filter(p => !p.exe).slice(0, 6).forEach(p => {
    const b = document.createElement('button');
    b.className = 'q' + (S.active === p.id ? ' on' : ''); b.textContent = p.name; b.style.setProperty('--c', themed(p.color));
    b.onclick = () => hub.apply(p.id);
    q.appendChild(b);
  });
}

// ---------- jogos ----------
function renderGames() {
  $('#autoSw').checked = S.auto;
  renderNow();
  if (!$('#gFilters').children.length) {
    $('#gFilters').innerHTML = GENRES.map(([k, t]) => `<button data-g="${k}" class="${k === gFilter ? 'on' : ''}">${t}</button>`).join('');
    document.querySelectorAll('#gFilters button').forEach(b => b.onclick = () => { gFilter = b.dataset.g; document.querySelectorAll('#gFilters button').forEach(x => x.classList.toggle('on', x === b)); applyGameFilter(); });
    $('#gSearch').oninput = e => { gQuery = e.target.value; applyGameFilter(); };
    $('#gSort').value = gSort;
    $('#gSort').onchange = e => { gSort = e.target.value; try { localStorage.setItem('fuxi.gSort', gSort); } catch {} applyGameFilter(); };
  }
  const g = $('#grid');
  S.profiles.filter(p => p.exe).forEach((p, idx) => {
    let el = gEls[p.id];
    if (!el) {
      el = gEls[p.id] = document.createElement('div');
      el.className = 'gc'; el.style.setProperty('--i', idx);
      el.innerHTML = `<div class="bg"></div><div class="ini"></div><div class="sh"></div><div class="gl"></div>
        <div class="live"><i></i>NO AR</div>
        <div class="fvb">★</div>
        <div class="acts"><button class="fv" title="Favoritar"><svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z"/></svg></button>
          <button class="ap" title="Aplicar o preset agora"><svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg></button>
          <button class="eq" title="Editar equalizador"><svg viewBox="0 0 24 24"><path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="14" r="2"/><circle cx="12" cy="8" r="2"/><circle cx="19" cy="16" r="2"/></svg></button>
          <button class="lk" title="Vincular programa (.exe) do jogo"><svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/></svg></button></div>
        <div class="gp"><div class="t"><b></b><small></small></div><svg viewBox="0 0 58 24"><line x1="0" y1="12" x2="58" y2="12" stroke="#ffffff22" stroke-width="1"/><path fill="none" stroke="var(--c)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
      el.querySelector('.fv').onclick = e => { e.stopPropagation(); hub.toggleFav(el.dataset.id); };
      el.querySelector('.ap').onclick = e => { e.stopPropagation(); const q = prof(el.dataset.id); hub.apply(q.assigned || q.id); toast('Preset aplicado: ' + q.name); };
      el.querySelector('.eq').onclick = e => { e.stopPropagation(); editId = el.dataset.id; loadDraft(editId); renderEq(); go('eq'); };
      el.querySelector('.lk').onclick = e => { e.stopPropagation(); openLink(el.dataset.id); };
      el.onclick = () => { const q = prof(el.dataset.id); hub.apply(q.assigned || q.id); toast('Preset aplicado: ' + q.name); };
      el.onmousemove = e => {                                         // inclina de leve e move o brilho acompanhando o mouse
        const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--ry', ((px - .5) * 7).toFixed(2) + 'deg'); el.style.setProperty('--rx', ((.5 - py) * 7).toFixed(2) + 'deg');
        el.style.setProperty('--mx', (px * 100).toFixed(0) + '%'); el.style.setProperty('--my', (py * 100).toFixed(0) + '%');
      };
      el.onmouseleave = () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); };
      g.appendChild(el);
    }
    el.dataset.id = p.id; el.dataset.name = p.name.toLowerCase(); el.dataset.genre = GENRE[p.id] || 'outros';
    el.style.setProperty('--c', p.color);
    el.classList.toggle('live-on', S.game === p.id);
    const bg = el.querySelector('.bg'), key = p.art || '';
    if (bg.dataset.art !== key) { bg.dataset.art = key; bg.style.backgroundImage = p.art ? `url('${p.art}')` : ''; el.querySelector('.ini').textContent = p.art ? '' : p.name.split(' ').map(w => w[0]).join('').slice(0, 3); }
    el.querySelector('b').textContent = p.name;
    const fav = (S.favorites || []).includes(p.id); el.classList.toggle('fav', fav); el.dataset.fav = fav ? 1 : 0;
    const st = (S.stats || {})[p.id]; el.dataset.count = st ? st.count : 0; el.dataset.last = st ? st.last : 0; el.dataset.idx = idx;
    el.querySelector('small').textContent = cardSub(p, st);
    el.querySelector('.gp path').setAttribute('d', gameSpark(p));
  });
  applyGameFilter();
}
const fmtTime = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : (m / 60).toFixed(m < 600 ? 1 : 0).replace('.', ',') + ' h'; };
function ago(ts) {
  const m = (Date.now() - ts) / 60000;
  if (m < 2) return 'agora há pouco'; if (m < 60) return 'há ' + Math.round(m) + ' min'; const h = m / 60;
  if (h < 24) return 'há ' + Math.round(h) + ' h'; const d = h / 24; return d < 2 ? 'ontem' : 'há ' + Math.round(d) + ' dias';
}
function cardSub(p, st) {                                              // o subtítulo muda conforme a ordenação escolhida
  if (gSort === 'most' && st && st.count) return st.count + (st.count === 1 ? ' vez' : ' vezes') + (st.ms > 60000 ? ' · ' + fmtTime(st.ms) : '');
  if (gSort === 'recent' && st && st.last) return 'Jogou ' + ago(st.last);
  return p.assigned ? 'Preset: ' + ((prof(p.assigned) || {}).name || '—') : p.tag;
}
const GENRE = { fortnite: 'tiro', valorant: 'tiro', cs2: 'tiro', pubg: 'tiro', apex: 'tiro', warzone: 'tiro', overwatch: 'tiro', r6: 'tiro', tarkov: 'tiro', bf2042: 'tiro',
  gow: 'aventura', gta5: 'aventura', cyberpunk: 'aventura', eldenring: 'aventura', rdr2: 'aventura', witcher3: 'aventura', lol: 'esports', dota2: 'esports', rocketleague: 'esports' };
const GENRES = [['all', 'Todos'], ['fav', '★ Favoritos'], ['tiro', 'Tiro'], ['aventura', 'Aventura'], ['esports', 'Esports']];
let gFilter = 'all', gQuery = '', gEls = {}, gSort = 'fav';
try { gSort = localStorage.getItem('fuxi.gSort') || 'fav'; } catch {}
const norm0 = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function gameSpark(p, W = 58, H = 24) {                                // mini curva do equalizador do jogo
  if (!p || !p.eq) return '';
  const fr = EQMath.logFreqs(40), r = EQMath.response(p.f, p.eq, p.q, fr, p.t);
  return fr.map((f, i) => (i ? 'L' : 'M') + ((i / (fr.length - 1)) * W).toFixed(1) + ',' + (H / 2 - Math.max(-6, Math.min(6, r[i])) / 6 * (H / 2 - 2)).toFixed(1)).join(' ');
}
function applyGameFilter() {
  const q = norm0(gQuery).trim(); let n = 0;
  const els = Object.values(gEls), byName = (a, b) => a.dataset.name.localeCompare(b.dataset.name, 'pt-BR');
  const sorters = {
    fav: (a, b) => (b.dataset.fav - a.dataset.fav) || (a.dataset.idx - b.dataset.idx),
    az: byName,
    most: (a, b) => (b.dataset.count - a.dataset.count) || (b.dataset.fav - a.dataset.fav) || (a.dataset.idx - b.dataset.idx),
    recent: (a, b) => (b.dataset.last - a.dataset.last) || (b.dataset.fav - a.dataset.fav) || (a.dataset.idx - b.dataset.idx)
  };
  els.slice().sort(sorters[gSort] || sorters.fav).forEach((el, i) => { el.style.order = i; });     // reordena sem recriar os cards
  els.forEach(el => {
    const ok = (gFilter === 'all' || (gFilter === 'fav' ? el.dataset.fav === '1' : el.dataset.genre === gFilter)) && (!q || norm0(el.dataset.name).includes(q));
    el.hidden = !ok; if (ok) n++;
    const p = prof(el.dataset.id); if (p) el.querySelector('small').textContent = cardSub(p, (S.stats || {})[p.id]);
  });
  $('#gCount').textContent = n + (n === 1 ? ' JOGO' : ' JOGOS');
  let e = $('#grid .gempty');
  if (!n) { if (!e) { e = document.createElement('div'); e.className = 'gempty'; e.style.order = 999; $('#grid').appendChild(e); } e.textContent = gFilter === 'fav' && !q ? 'Nenhum favorito ainda. Passe o mouse num card e clique na estrela.' : 'Nenhum jogo encontrado. Tente outro nome.'; } else if (e) e.remove();
}
function replayGames() {                                               // anima os cards de novo toda vez que a aba abre
  const els = Object.values(gEls); els.forEach(el => el.classList.remove('enter'));
  void $('#grid').offsetWidth; els.forEach(el => el.classList.add('enter'));
}
let nowKey = '';
function renderNow() {
  const box = $('#nowBox'), id = S.game, p = id && prof(id), name = p ? p.name : S.gameName, act = prof(S.active);
  const key = [id, name, p && p.banner, act && act.id].join('|');
  if (key === nowKey) return; nowKey = key;
  if (!id) {
    box.innerHTML = `<div class="now idle"><span class="rad"><i></i></span><div><b>Nenhum jogo aberto</b><small>O hub reconhece sozinho quando você abrir um jogo — pelo nome da pasta dele ou pelo programa vinculado. Abra um e o aviso aparece aqui.</small></div></div>`;
    return;
  }
  const color = p ? p.color : '#2ef2ff', art = p && p.banner ? `<div class="nbg" style="background-image:url('${p.banner}')"></div>` : '';
  box.innerHTML = `<div class="now live" style="--c:${color}">${art}<div class="nsh"></div>
    <div class="ntx"><span class="nb"><i></i>NO AR AGORA</span><b>${esc(name || 'Jogo')}</b><small>Preset aplicado: ${esc(act ? act.name : '—')}</small></div>
    <svg class="nsp" viewBox="0 0 150 44"><line x1="0" y1="22" x2="150" y2="22" stroke="#ffffff22"/><path d="${gameSpark(act, 150, 44)}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 5px ${color})"/></svg></div>`;
}
// ---- vincular o programa (.exe) de um jogo ----
let lk = null;
function openLink(id) {
  lk = { id };
  if (!$('#lkModal')) {
    const m = document.createElement('div'); m.id = 'lkModal'; m.className = 'mdl';
    m.innerHTML = `<div class="mbox"><h3 id="lkT"></h3>
      <p class="mp">Abra o jogo e escolha abaixo o programa dele: o hub passa a reconhecer o jogo por ele e, ao abrir, troca o preset e mostra o aviso. Se o jogo ainda não está aberto, use "Escolher arquivo".</p>
      <div class="sec" style="padding-top:2px">Programas abertos agora</div>
      <div class="mlist" id="lkList"></div>
      <div class="btns"><button class="ghost" id="lkRef">Atualizar lista</button><button class="ghost" id="lkFile">Escolher arquivo .exe…</button></div>
      <div class="sec">Reconhecidos para este jogo</div><div class="mchips" id="lkChips"></div>
      <div class="btns" style="justify-content:flex-end"><button class="ghost" id="lkClose">Fechar</button></div></div>`;
    document.body.appendChild(m);
    m.onclick = e => { if (e.target === m) closeLink(); };
    $('#lkClose').onclick = closeLink; $('#lkRef').onclick = loadLinkList;
    $('#lkFile').onclick = async () => { const r = await hub.exePickFile(lk.id); if (r) toast('Vinculado: ' + r); else if (r === false) toast('Não consegui vincular esse arquivo'); };
  }
  $('#lkModal').classList.add('on');
  renderLinkChips(); loadLinkList();
}
function closeLink() { lk = null; $('#lkModal').classList.remove('on'); }
function renderLinkChips() {
  if (!lk) return;
  const p = prof(lk.id); if (!p) return;
  $('#lkT').textContent = 'Vincular programa · ' + p.name;
  $('#lkChips').innerHTML = (p.exe || []).map(x => `<span class="chip k">${esc(x)}</span>`).join('') +
    (p.userExe || []).map(x => `<span class="chip u">${esc(x)}<button data-rm="${esc(x)}" title="Remover">×</button></span>`).join('');
  document.querySelectorAll('#lkChips [data-rm]').forEach(b => b.onclick = () => hub.exeRemove(lk.id, b.dataset.rm));
}
async function loadLinkList() {
  const box = $('#lkList'); box.innerHTML = '<div class="mem">Procurando…</div>';
  const l = await hub.exeOpenWindows();
  if (!lk) return;
  const have = new Set([...(prof(lk.id).exe || []), ...(prof(lk.id).userExe || [])].map(s => s.toLowerCase()));
  box.innerHTML = l.length ? l.map(x => `<button class="mi" data-e="${esc(x.exe)}" ${have.has(x.exe.toLowerCase()) ? 'disabled' : ''}><b>${esc(x.exe)}</b><small>${esc(x.title)}</small></button>`).join('') : '<div class="mem">Nenhum programa com janela encontrado.</div>';
  box.querySelectorAll('[data-e]').forEach(b => b.onclick = async () => { await hub.exeAdd(lk.id, b.dataset.e); toast('Vinculado: ' + b.dataset.e); loadLinkList(); });
}
$('#autoSw').onchange = e => { hub.setAuto(e.target.checked); toast(e.target.checked ? 'Troca automática ligada' : 'Troca automática desligada'); };
$('#artBtn').onclick = () => hub.openArtFolder();

// ---------- EQ ----------
function renderEq() {
  const c = $('#eqChips'); c.innerHTML = '';
  S.profiles.forEach(p => {
    const b = document.createElement('button');
    b.className = 'q' + (editId === p.id ? ' on' : ''); b.textContent = p.name; b.style.setProperty('--c', p.color);
    b.onclick = () => { editId = p.id; loadDraft(p.id); renderEq(); };
    c.appendChild(b);
  });
  const p = prof(editId) || prof('default');
  $('#eqDel').hidden = !p.custom;
  $('#eqReset').hidden = !!p.custom;
  const isGame = !!p.exe;
  $('#assignRow').hidden = !isGame;
  if (isGame) {
    const sel = $('#assignSel');
    sel.innerHTML = `<option value="">Este próprio preset do jogo</option>` + S.profiles.filter(x => !x.exe).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
    sel.value = p.assigned || '';
  }
}
function loadDraft(id) {
  const p = prof(id) || prof('default');
  comfortSnap = null;                                                // recarregou o preset: o "modo conforto" volta a não estar aplicado
  draft = { g: p.eq.slice(), f: p.f.slice(), q: p.q.slice(), t: (p.t || p.eq.map(() => 'PK')).slice() };      // ganho (dB), frequência (Hz), Q e tipo (pico/shelf) de cada faixa
  eqSel = Math.min(eqSel, draft.g.length - 1);
  $('#eqTitle').textContent = 'Equalizador · ' + p.name;
  drawEq();
}

// ---- gráfico de frequência real: eixo X logarítmico (20 Hz–20 kHz), eixo Y em dB (±12) ----
const EQ = { ml: 46, mr: 16, mt: 16, mb: 28, lo: Math.log10(20), hi: Math.log10(20000), db: 12, qmin: 0.3, qmax: 8 };
let eqGeom = null, eqSel = 3;
const eqColor = () => themed((prof(editId) || prof('default')).color);
const sgn = v => (v > 0 ? '+' : '') + v.toFixed(1);
const fmtF = f => f >= 1000 ? String(Number((f / 1000).toPrecision(3))) + 'k' : String(Math.round(f));
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

function drawEq() {                                   // monta a estrutura (grade, curvas, pontos); updateEq() só atualiza valores
  if (!draft) return;
  const wrap = $('.eqwrap'), svg = $('#eqgraph');
  const W = wrap.clientWidth, H = wrap.clientHeight; if (!W || !H) return;
  const pw = W - EQ.ml - EQ.mr, ph = H - EQ.mt - EQ.mb;
  const X = f => EQ.ml + (Math.log10(f) - EQ.lo) / (EQ.hi - EQ.lo) * pw;
  const Y = d => EQ.mt + (EQ.db - d) / (2 * EQ.db) * ph;
  const freqOf = x => Math.pow(10, EQ.lo + (x - EQ.ml) / pw * (EQ.hi - EQ.lo));
  eqGeom = { X, Y, freqOf, W, H, pw, ph, freqs: EQMath.logFreqs(260) };
  const col = eqColor();
  let grid = '';
  [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(f => {
    grid += `<line x1="${X(f)}" y1="${EQ.mt}" x2="${X(f)}" y2="${EQ.mt + ph}" class="gl"/><text x="${X(f)}" y="${H - 9}" class="gt" text-anchor="middle">${f >= 1000 ? f / 1000 + 'k' : f}</text>`;
  });
  [-12, -6, 0, 6, 12].forEach(d => {
    grid += `<line x1="${EQ.ml}" y1="${Y(d)}" x2="${W - EQ.mr}" y2="${Y(d)}" class="${d === 0 ? 'gl z' : 'gl'}"/><text x="${EQ.ml - 8}" y="${Y(d) + 4}" class="gt" text-anchor="end">${d > 0 ? '+' : ''}${d}</text>`;
  });
  const nodes = draft.g.map((_, i) => `<g class="nd" data-i="${i}"><circle r="17" class="hit"/><circle r="9" class="ring" style="stroke:${col}"/><circle r="6.5" class="dot" style="stroke:${col}"/></g>`).join('');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `<defs><linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".32"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient>
    <clipPath id="eqclip"><rect x="${EQ.ml}" y="${EQ.mt}" width="${pw}" height="${ph}"/></clipPath></defs>
    ${grid}
    <g clip-path="url(#eqclip)"><path id="eqsel" fill="${col}" fill-opacity=".10" stroke="${col}" stroke-opacity=".55" stroke-dasharray="4 4" stroke-width="1.4"/>
    <path id="eqarea" fill="url(#eqg)"/><path id="eqline" fill="none" stroke="${col}" stroke-width="2.6" stroke-linejoin="round" style="filter:drop-shadow(0 0 6px ${col}aa)"/></g>
    ${nodes}
    <g id="eqtip" style="display:none"><rect rx="8" height="24" fill="#050507" stroke="${col}" stroke-width="1"/><text y="16" class="tip" text-anchor="middle"></text></g>`;
  bindNodes(svg);
  updateEq();
}

function updateEq(skipPanel) {                        // recalcula a curva real e reposiciona os pontos (sem recriar o SVG)
  if (!draft || !eqGeom) return;
  const { X, Y, freqs } = eqGeom;
  const cl = d => Y(clampN(d, -EQ.db - 1, EQ.db + 1));
  const path = r => freqs.map((f, i) => (i ? 'L' : 'M') + X(f).toFixed(1) + ',' + cl(r[i]).toFixed(1)).join(' ');
  const resp = EQMath.response(draft.f, draft.g, draft.q, freqs, draft.t);
  const line = path(resp), y0 = Y(0).toFixed(1);
  const xl = X(freqs[freqs.length - 1]).toFixed(1), xf = X(freqs[0]).toFixed(1);
  $('#eqline').setAttribute('d', line);
  $('#eqarea').setAttribute('d', `${line} L${xl},${y0} L${xf},${y0} Z`);
  // contribuição só da faixa selecionada (mostra a largura do filtro)
  const one = EQMath.response([draft.f[eqSel]], [draft.g[eqSel]], [draft.q[eqSel]], freqs, [draft.t[eqSel]]);
  $('#eqsel').setAttribute('d', `${path(one)} L${xl},${y0} L${xf},${y0} Z`);
  document.querySelectorAll('#eqgraph .nd').forEach((g, i) => {
    g.setAttribute('transform', `translate(${X(draft.f[i]).toFixed(1)},${Y(draft.g[i]).toFixed(1)})`);
    g.classList.toggle('sel', i === eqSel);
  });
  // cartões das faixas
  $('#bandrow').innerHTML = draft.g.map((_, i) => `<div class="bc${i === eqSel ? ' on' : ''}" data-i="${i}"><b>${fmtF(draft.f[i])}</b><span>${sgn(draft.g[i])}</span><em>${draft.t[i] === 'LSC' ? 'Shelf grave · ' : draft.t[i] === 'HSC' ? 'Shelf agudo · ' : ''}Q ${draft.q[i]}</em></div>`).join('');
  document.querySelectorAll('.bc').forEach(el => { el.onclick = () => { eqSel = +el.dataset.i; updateEq(); }; el.ondblclick = () => { draft.g[+el.dataset.i] = 0; updateEq(); }; });
  if (typeof previewing !== 'undefined') { if (previewing) sendPreview(); markPreview(); }   // qualquer ajuste atualiza o som na hora
  const pk = Math.max(...resp), pre = pk > 0 ? -(pk + 0.5) : 0;
  renderComfort();
  $('#eqinfo').innerHTML = `Pico da curva: <b>${sgn(pk)} dB</b> · Preamp automático: <b>${pre.toFixed(1)} dB</b> <span class="mut">(reduz o volume geral o suficiente para o som não estourar)</span>`;
  if (!skipPanel) {                                  // painel numérico da faixa selecionada
    $('#bpTitle').textContent = `Faixa ${eqSel + 1}`;
    $('#bpF').value = Math.round(draft.f[eqSel]); $('#bpG').value = draft.g[eqSel].toFixed(1); $('#bpQ').value = draft.q[eqSel]; $('#bpT').value = draft.t[eqSel] || 'PK';
  }
}

// ---- "Se cansar o ouvido": dicas por jogo de quais faixas aliviar, com botão para aplicar (no rascunho; só salva se você clicar em Aplicar) ----
let comfortSnap = null, comfortFor = null;
function renderComfort() {
  const el = $('#comfort'); if (!el || !draft) return;
  const p = prof(editId);
  if (comfortFor !== editId) { comfortSnap = null; comfortFor = editId; }               // trocou de preset: zera o "desfazer"
  document.querySelectorAll('.bc').forEach(b => b.classList.remove('tip'));
  if (!p || !Array.isArray(p.comfort)) { el.innerHTML = ''; return; }
  const list = p.comfort, applied = !!comfortSnap;
  const rows = list.map(c => {
    const base = applied ? comfortSnap[c.i] : draft.g[c.i], now = applied ? draft.g[c.i] : clampN(Math.round((draft.g[c.i] + c.d) * 2) / 2, -12, 12);
    return `<div class="cmr" data-i="${c.i}"><div class="cmf1"><b>Faixa ${c.i + 1} · ${fmtF(draft.f[c.i])} Hz</b><span>${sgn(base)} → <i>${sgn(now)} dB</i>${applied ? ' ✓' : ''}</span></div><small>${esc(c.why)}</small></div>`;
  }).join('');
  el.innerHTML = `<div class="cmc"><div class="cmh"><b>Se cansar o ouvido</b><small>${list.length ? 'Ajustes sugeridos para este jogo, do mais importante ao menos.' : 'Este preset já é suave nos agudos: não há faixa para aliviar.'}</small></div>
    ${rows}
    <div class="cmg">Se mesmo assim cansar: baixe o volume geral do fone e faça uma pausa a cada hora de jogo.</div>
    ${list.length ? `<div class="cmb"><button class="ghost" id="cmApply" ${applied ? 'hidden' : ''}>Aplicar modo conforto</button><button class="ghost" id="cmUndo" ${applied ? '' : 'hidden'}>Desfazer</button></div>` : ''}</div>`;
  list.forEach(c => { const b = document.querySelector(`.bc[data-i="${c.i}"]`); if (b) b.classList.add('tip'); });
  el.querySelectorAll('.cmr').forEach(r => r.onclick = () => { eqSel = +r.dataset.i; updateEq(); });
  const ap = $('#cmApply'), un = $('#cmUndo');
  if (ap) ap.onclick = () => { comfortSnap = draft.g.slice(); list.forEach(c => { draft.g[c.i] = clampN(Math.round((draft.g[c.i] + c.d) * 2) / 2, -12, 12); }); updateEq(); toast('Modo conforto aplicado — ouça e clique em Aplicar para salvar'); };
  if (un) un.onclick = () => { draft.g = comfortSnap.slice(); comfortSnap = null; updateEq(); };
}

function bindNodes(svg) {
  const tipEl = () => svg.querySelector('#eqtip');
  svg.querySelectorAll('.nd').forEach(g => {
    const i = +g.dataset.i;
    const showTip = () => {
      const { X, Y, W } = eqGeom, t = tipEl(), tx = t.querySelector('text'), r = t.querySelector('rect');
      tx.textContent = `${fmtF(draft.f[i])}Hz · ${sgn(draft.g[i])} dB · Q ${draft.q[i]}`;
      const w = tx.textContent.length * 6.6 + 20, px = clampN(X(draft.f[i]), w / 2 + 4, W - w / 2 - 4);
      r.setAttribute('width', w); r.setAttribute('x', -w / 2); tx.setAttribute('x', 0);
      t.setAttribute('transform', `translate(${px},${Math.max(4, Y(draft.g[i]) - 42)})`); t.style.display = '';
    };
    g.onpointerenter = showTip;
    g.onpointerleave = () => { if (!g.drag) tipEl().style.display = 'none'; };
    g.onpointerdown = e => { g.setPointerCapture(e.pointerId); g.drag = true; eqSel = i; e.preventDefault(); updateEq(); showTip(); };
    g.onpointermove = e => {
      if (!g.drag) return;
      const r = svg.getBoundingClientRect(), k = eqGeom.W / r.width;
      const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * (eqGeom.H / r.height);
      draft.f[i] = Number(clampN(eqGeom.freqOf(x), 20, 20000).toPrecision(3));                       // horizontal = frequência
      draft.g[i] = clampN(Math.round((EQ.db - (y - EQ.mt) / eqGeom.ph * 2 * EQ.db) * 2) / 2, -EQ.db, EQ.db);   // vertical = ganho
      updateEq(); showTip();
    };
    const end = () => { g.drag = false; tipEl().style.display = 'none'; };
    g.onpointerup = end; g.onpointercancel = end;
    g.ondblclick = () => { draft.g[i] = 0; updateEq(); showTip(); };
    g.addEventListener('wheel', e => {                                                              // roda = largura (Q)
      e.preventDefault(); eqSel = i;
      draft.q[i] = Math.round(clampN(draft.q[i] * (e.deltaY < 0 ? 1.12 : 1 / 1.12), EQ.qmin, EQ.qmax) * 100) / 100;
      updateEq(); showTip();
    }, { passive: false });
  });
}

// painel numérico: digitar valores exatos
function bindPanel() {
  const num = (id, key, lo, hi, rnd) => $(id).addEventListener('input', e => {
    const v = parseFloat(e.target.value); if (!Number.isFinite(v)) return;
    draft[key][eqSel] = rnd(clampN(v, lo, hi)); updateEq(true);
  });
  num('#bpF', 'f', 20, 20000, v => Number(v.toPrecision(3)));
  num('#bpG', 'g', -12, 12, v => Math.round(v * 2) / 2);
  num('#bpQ', 'q', EQ.qmin, EQ.qmax, v => Math.round(v * 100) / 100);
  ['#bpF', '#bpG', '#bpQ'].forEach(id => $(id).addEventListener('change', () => updateEq()));   // ao sair do campo, normaliza o texto
  $('#bpT').addEventListener('change', e => { draft.t[eqSel] = e.target.value; updateEq(); });   // tipo: pico, shelf de graves ou shelf de agudos
  $('#bpReset').onclick = () => {
    const p = prof(editId) || prof('default');
    draft.f[eqSel] = p.defaultF[eqSel]; draft.g[eqSel] = p.defaultEq[eqSel]; draft.q[eqSel] = p.defaultQ[eqSel]; draft.t[eqSel] = (p.defaultT || [])[eqSel] || 'PK';
    updateEq();
  };
}
bindPanel();
window.addEventListener('resize', drawEq);

// ---- ouvir ao vivo + comparação A/B (prévia temporária; só "Aplicar" salva) ----
let previewing = false, ab = 'B', pvTimer = null, pvLast = 0;
const sameAsSaved = () => { const p = prof(editId); return !!p && JSON.stringify([draft.g, draft.f, draft.q, draft.t]) === JSON.stringify([p.eq, p.f, p.q, p.t || draft.t.map(() => 'PK')]); };
function sendPreview() {                                // no máximo ~9 gravações por segundo
  clearTimeout(pvTimer);
  pvTimer = setTimeout(() => {
    pvLast = Date.now(); if (!previewing || !draft) return;
    if (ab === 'A') hub.previewEq({ flat: true, preamp: EQMath.preamp(draft.f, draft.g, draft.q, draft.t) });
    else hub.previewEq({ g: draft.g, f: draft.f, q: draft.q, t: draft.t });
  }, Math.max(0, 110 - (Date.now() - pvLast)));
}
function markPreview() {
  const tag = $('#pvTag'), stop = $('#pvStop');
  document.querySelectorAll('#abSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === ab));
  if (!previewing) { tag.textContent = ''; tag.className = 'pvtag'; stop.hidden = true; return; }
  if (ab === 'A') { tag.textContent = '● Ouvindo A: sem equalização (mesmo volume)'; tag.className = 'pvtag warn'; }
  else if (sameAsSaved()) { tag.textContent = '● Ouvindo o preset salvo'; tag.className = 'pvtag ok'; }
  else { tag.textContent = '● Ouvindo a sua edição — ainda não salva'; tag.className = 'pvtag warn'; }
  stop.hidden = $('#liveSw').checked;                   // com "ao vivo" ligado, desligar a chave já encerra
}
function startPreview() { previewing = true; markPreview(); sendPreview(); }
async function stopPreview() {
  if (!previewing) return;
  previewing = false; ab = 'B'; clearTimeout(pvTimer);
  await hub.previewEq(null);                            // volta ao preset ativo salvo
  markPreview();
}
$('#liveSw').onchange = e => { if (e.target.checked) { ab = 'B'; startPreview(); } else stopPreview(); };
document.querySelectorAll('#abSeg button').forEach(b => b.onclick = () => { ab = b.dataset.v; startPreview(); });
$('#pvStop').onclick = () => { $('#liveSw').checked = false; stopPreview(); };
// atalhos na aba EQ: A e B alternam a comparação (não vale enquanto você digita num campo)
window.addEventListener('keydown', e => {
  if (page !== 'eq' || e.ctrlKey || e.altKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName)) return;
  const k = e.key.toLowerCase(); if (k === 'a' || k === 'b') { ab = k.toUpperCase(); startPreview(); }
});

$('#eqApply').onclick = async () => {
  await hub.setEq(editId, draft); await hub.apply(editId);       // salva e passa a ser o som oficial desse preset
  ab = 'B'; markPreview();
  toast('EQ aplicado e salvo: ' + prof(editId).name);
};
$('#eqReset').onclick = async () => { await hub.resetEq(editId); loadDraft(editId); toast('Restaurado ao original'); };
$('#eqDel').onclick = async () => { await hub.deleteCustom(editId); editId = 'default'; toast('Preset excluído'); };
$('#saveNew').onclick = async () => {
  const name = $('#saveName').value.trim();
  if (!name) { toast('Dê um nome ao preset'); $('#saveName').focus(); return; }
  const id = await hub.saveCustom(name, draft, '#2ef2ff');
  $('#saveName').value = ''; editId = id; toast('Preset salvo: ' + name);
};
$('#assignSel').onchange = e => { hub.assign(editId, e.target.value || null); toast('Associação atualizada'); };
$('#exp').onclick = async () => { if (await hub.exportPresets()) toast('Presets exportados'); };
$('#imp').onclick = async () => { toast(await hub.importPresets() ? 'Presets importados' : 'Nada importado'); };

// ---------- mixer ----------
function slider(init, onInput) {
  const el = document.createElement('div'); el.className = 'sld';
  el.innerHTML = '<div class="bar"><div class="peak"></div><div class="fill"></div></div><div class="th"></div>';
  let v = init, drag = false;
  const draw = () => { el.querySelector('.fill').style.width = v + '%'; el.querySelector('.th').style.left = v + '%'; };
  const at = e => { const r = el.getBoundingClientRect(); v = Math.round(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100))); draw(); onInput(v); };
  el.onpointerdown = e => { drag = true; el.setPointerCapture(e.pointerId); at(e); };
  el.onpointermove = e => { if (drag) at(e); };
  el.onpointerup = () => { drag = false; };
  el.set = x => { if (!drag) { v = x; draw(); } };
  el.peak = p => { el.querySelector('.peak').style.width = Math.min(100, p * 100 * v / 100) + '%'; };
  el.isDrag = () => drag; draw();
  return el;
}
let mixKey = '', rows = {}, masterUi = null, mixBusy = false;
async function pollMixer() {
  if (page !== 'mixer' || mixBusy) return;
  mixBusy = true;
  const r = await hub.mixerList();
  mixBusy = false;
  if (!r) return;
  if (!masterUi) {
    const row = $('#masterRow');
    row.innerHTML = `<div class="nm">Volume geral<small>Saída padrão do Windows</small></div><span class="slot"></span><div class="vv"></div><button title="Mutar">Mudo</button>`;
    masterUi = { vv: row.querySelector('.vv'), btn: row.querySelector('button'), muted: false };
    masterUi.sl = slider(0, v => { hub.masterSet(v); masterUi.vv.textContent = v + '%'; });
    row.querySelector('.slot').replaceWith(masterUi.sl);
    masterUi.btn.onclick = () => { masterUi.muted = !masterUi.muted; hub.masterMute(masterUi.muted); masterUi.btn.classList.toggle('on', masterUi.muted); };
  }
  if (!masterUi.sl.isDrag()) { const m = Math.round(r.master.volume * 100); masterUi.sl.set(m); masterUi.vv.textContent = m + '%'; }
  masterUi.muted = r.master.mute; masterUi.btn.classList.toggle('on', r.master.mute);

  pollMic();
  const list = r.sessions;
  const key = list.map(s => s.pid + s.name).join('|');
  const box = $('#mixer');
  if (key !== mixKey) {
    mixKey = key; box.innerHTML = ''; rows = {};
    list.forEach(s => {
      const row = document.createElement('div'); row.className = 'mrow';
      row.innerHTML = `<div class="nm">${esc(s.name)}<small></small></div><span class="slot"></span><div class="vv"></div><button title="Mutar">Mudo</button>`;
      const u = { row, vv: row.querySelector('.vv'), btn: row.querySelector('button'), sub: row.querySelector('small'), muted: s.mute };
      u.sl = slider(Math.round(s.volume * 100), v => { hub.mixerSet(s.pid, v); u.vv.textContent = v + '%'; });
      row.querySelector('.slot').replaceWith(u.sl);
      u.btn.onclick = () => { u.muted = !u.muted; hub.mixerMute(s.pid, u.muted); u.btn.classList.toggle('on', u.muted); };
      rows[s.pid] = u; box.appendChild(row);
    });
  }
  list.forEach(s => {
    const u = rows[s.pid]; if (!u) return;
    u.sl.set(Math.round(s.volume * 100)); u.vv.textContent = Math.round(s.volume * 100) + '%';
    u.sl.peak(s.peak); u.sub.textContent = s.active ? 'tocando' : 'em silêncio';
    u.muted = s.mute; u.btn.classList.toggle('on', s.mute);
  });
  $('#mixHint').hidden = list.length > 0;
}
let micUi = null;
async function pollMic() {
  const m = await hub.micGet();
  const row = $('#micRow');
  if (!m || m.error) { row.hidden = true; return; }
  row.hidden = false;
  if (!micUi) {
    row.innerHTML = `<div class="nm">Microfone<small>Entrada padrão do Windows</small></div><span class="slot"></span><div class="vv"></div><button title="Mutar">Mudo</button>`;
    micUi = { vv: row.querySelector('.vv'), btn: row.querySelector('button'), muted: false };
    micUi.sl = slider(0, v => { hub.micSet(v); micUi.vv.textContent = v + '%'; });
    row.querySelector('.slot').replaceWith(micUi.sl);
    micUi.btn.onclick = () => { micUi.muted = !micUi.muted; hub.micMute(micUi.muted); micUi.btn.classList.toggle('on', micUi.muted); };
  }
  if (!micUi.sl.isDrag()) { const v = Math.round(m.volume * 100); micUi.sl.set(v); micUi.vv.textContent = v + '%'; }
  micUi.sl.peak(m.mute ? 0 : Math.min(1, m.peak * 1.6));            // medidor ao vivo: fale e veja a barra clara
  micUi.muted = m.mute; micUi.btn.classList.toggle('on', m.mute);
}
setInterval(pollMixer, 1200);

// ---------- dispositivo ----------
let hidOut = '';
function renderDevice() {
  const d = S.device, e = S.engine || {};
  const engine = !e.installed
    ? `<span class="bad">Equalizador (Equalizer APO) não instalado.</span> Sem ele o hub reconhece o fone, mas não altera o som.`
    : !d.known ? `<span class="ok">Motor instalado.</span> Conecte o Fuxi para continuar.`
    : !e.registered ? `<span class="bad">Falta ativar o motor no Fuxi.</span> Abra o Device Selector, marque <b>Headphones (Fuxi-H3)</b> em "Playback devices", clique OK e reinicie o PC.`
    : e.needsAdmin ? `<span class="bad">Sem permissão para gravar.</span> Abra o hub como administrador.`
    : e.linked ? `<span class="ok">Motor ativo no Fuxi.</span> Os presets são enviados ao motor assim que você troca de preset ou abre um jogo. Se o som não mudar, reinicie o PC uma vez.`
    : `<span class="ok">Motor encontrado.</span> Ligando o hub ao motor…`;
  $('#devcards').innerHTML = `
    <div class="card"><h3>Fone</h3><p>${d.known ? '<span class="ok">Fuxi H3</span> · USB (VID 040B / PID 0897)' : d.connected ? 'Genérico: ' + esc(d.name || '—') : '<span class="bad">Nenhum fone detectado</span>'}</p></div>
    <div class="card"><h3>Motor de equalização</h3><p>${engine}</p>
      <div class="btns">${e.installed ? '<button class="ghost" id="bCfg">Abrir Device Selector</button>' : '<button class="solid" id="bEng" style="margin:0">Baixar Equalizer APO</button>'}</div></div>
    <div class="card"><h3>Canal HID do fone</h3><p id="hidInfo">Lendo…</p>
      <div class="btns"><button class="ghost" id="bHid">Atualizar</button><button class="ghost" id="bMon">Escutar 12s (aperte botões do fone)</button></div><pre id="hidOut">${esc(hidOut)}</pre></div>
    <div class="card"><h3>Saídas de áudio detectadas</h3><p>${(d.others || []).map(esc).join('<br>') || '—'}</p></div>`;
  const b = id => document.getElementById(id);
  if (b('bEng')) b('bEng').onclick = () => hub.openEnginePage();
  if (b('bCfg')) b('bCfg').onclick = async () => { if (!await hub.openConfigurator()) toast('Device Selector não encontrado'); };
  b('bHid').onclick = loadHid;
  b('bMon').onclick = async () => {
    hidOut = 'Escutando… aperte botões, gire a roda de volume, ligue/desligue o microfone.'; b('hidOut').textContent = hidOut;
    const lines = await hub.hidMonitor(12);
    hidOut = lines.length ? lines.join('\n') : 'Nenhum relatório recebido neste período.'; b('hidOut').textContent = hidOut;
  };
}
async function loadHid() {
  const el = document.getElementById('hidInfo'); if (!el) return;
  const l = await hub.hidList();
  el.innerHTML = l.length ? l.map(x => `<b>${esc(x.usagePage)}</b> / ${esc(x.usage)} · entrada ${x.inputLen}B · saída ${x.outputLen}B · feature ${x.featureLen}B`).join('<br>') : 'Nenhuma interface HID encontrada.';
}

// ---------- ajustes: atalhos e bandeja ----------
const HK = [
  ['micMute', 'Mutar / ativar microfone', 'Funciona com o jogo em primeiro plano'],
  ['nextPreset', 'Próximo preset', 'Padrão → Música → Filmes → Chamadas → os seus'],
  ['prevPreset', 'Preset anterior', ''],
  ['bypass', 'Equalizador ligado / desligado', 'Ouça o som original sem perder o preset'],
  ['show', 'Abrir o Fuxi Hub', 'Traz a janela para a frente'],
  ['mini', 'Mini-janela', 'Volume, preset, microfone e espectro numa janela flutuante que some sozinha']
];
const HK_DEFAULT = { micMute: 'Ctrl+Alt+M', nextPreset: 'Ctrl+Alt+Right', prevPreset: 'Ctrl+Alt+Left', bypass: 'Ctrl+Alt+B', show: 'Ctrl+Alt+F', mini: 'Ctrl+Alt+V' };
const KEYCODE = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Space: 'Space', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete', Tab: 'Tab' };
const NICE = { Left: '←', Right: '→', Up: '↑', Down: '↓', Space: 'Espaço', Super: 'Win' };
const kbds = a => a ? a.split('+').map(k => `<kbd>${esc(NICE[k] || k)}</kbd>`).join('') : '<em>Sem atalho</em>';
function accelFrom(e) {
  let k = null;
  if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) k = e.code.slice(5);
  else if (/^F([1-9]|1\d|2[0-4])$/.test(e.code)) k = e.code;
  else if (KEYCODE[e.code]) k = KEYCODE[e.code];
  if (!k) return null;
  const m = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
  return m.length ? m.concat(k).join('+') : null;              // atalho global precisa de pelo menos um modificador
}
let hkUi = null, hkCap = null;
function stopCap() { if (hkCap) { document.removeEventListener('keydown', hkCap.fn, true); hkCap = null; } }
function renderHotkeys() {
  const h = S && S.hotkeys; if (!h) return;
  if (!hkUi) {
    $('#hkBox').innerHTML = `
      <div class="card"><h3>Atalhos globais</h3>
        <div class="srow"><div class="lb"><b>Atalhos globais</b><small>Valem em qualquer programa ou jogo (em tela cheia sem bordas). Use sempre Ctrl, Alt ou Shift junto.</small></div>
          <label class="switch"><span>Atalhos</span><input type="checkbox" id="hkEn"><i></i></label></div>
        ${HK.map(([a, t, d]) => `<div class="srow"><div class="lb"><b>${t}</b>${d ? `<small>${d}</small>` : ''}<div class="hkerr" data-e="${a}" hidden>Atalho já usado por outro programa — escolha outro.</div></div>
          <div class="hk"><div class="hkb" data-a="${a}" title="Clique e aperte as teclas"></div><button class="hkx" data-x="${a}" title="Remover atalho">×</button></div></div>`).join('')}
        <div class="btns"><button class="ghost" id="hkReset">Restaurar padrão</button></div>
      </div>`;
    $('#hkEn').onchange = e => hub.setHotkeys({ enabled: e.target.checked });
    $('#hkReset').onclick = () => { stopCap(); hub.setHotkeys({ enabled: true, keys: HK_DEFAULT }); };
    document.querySelectorAll('#hkBox [data-x]').forEach(b => b.onclick = () => hub.setHotkeys({ keys: { [b.dataset.x]: '' } }));
    document.querySelectorAll('#hkBox .hkb').forEach(b => b.onclick = () => {
      const a = b.dataset.a; if (hkCap && hkCap.a === a) return stopCap();
      stopCap();
      const fn = e => {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') { stopCap(); return renderHotkeys(); }
        if (e.key === 'Backspace') { stopCap(); return hub.setHotkeys({ keys: { [a]: '' } }); }
        const acc = accelFrom(e);
        if (acc) { stopCap(); hub.setHotkeys({ keys: { [a]: acc } }); }
      };
      hkCap = { a, fn }; document.addEventListener('keydown', fn, true);
      renderHotkeys();
    });
    hkUi = true;
  }
  $('#hkEn').checked = h.enabled;
  document.querySelectorAll('#hkBox .hkb').forEach(b => {
    const a = b.dataset.a, cap = hkCap && hkCap.a === a, err = h.enabled && S.hotkeyErrors && S.hotkeyErrors[a];
    b.classList.toggle('cap', !!cap); b.classList.toggle('err', !!err);
    b.innerHTML = cap ? '<em>Aperte as teclas…  (Esc cancela · Backspace remove)</em>' : kbds(h.keys[a]);
    $(`#hkBox [data-e="${a}"]`).hidden = !err;
    $(`#hkBox [data-x="${a}"]`).style.visibility = h.keys[a] ? 'visible' : 'hidden';
  });
  document.querySelectorAll('#hkBox .srow:not(:first-of-type)').forEach(r => r.style.opacity = h.enabled ? 1 : .45);
}

// ---------- regras por programa ----------
const RULE_TEMPLATES = [['Spotify', 'spotify.exe', 'music'], ['VLC', 'vlc.exe', 'movies'], ['PotPlayer', 'PotPlayerMini64.exe', 'movies'], ['Teams', 'ms-teams.exe', 'voice'], ['Zoom', 'Zoom.exe', 'voice'], ['OBS Studio', 'obs64.exe', 'default']];
let rlUi = null, rlRunning = [];
function renderRules() {
  if (!S || !S.rules) return;
  const presets = S.profiles.filter(p => !p.exe);
  const opts = sel => presets.map(p => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  if (!rlUi) {
    const mdRow = (site, name, desc) => `<div class="mdsv ${site}" id="md-${site}"><img class="mdlogo" src="../assets/services/${site}.png" alt="${name}"><div class="mdtx"><small>${desc}</small>
        <div class="mdctl"><select class="sel" id="md-${site}-pre" style="min-width:140px;padding:6px 10px"></select><div class="seg" id="md-${site}-wh"><button data-w="open">Ao abrir</button><button data-w="play">Ao tocar</button></div><label class="switch"><span>${name}</span><input type="checkbox" id="md-${site}-on"><i></i></label></div></div></div>`;
    $('#rlBox').innerHTML = `<div class="card"><h3>Música e vídeo</h3>
      <div class="srow" style="border-top:0"><div class="lb"><b>Reconhecer Spotify e YouTube</b><small>O hub troca o preset sozinho quando o Spotify (app ou web) ou o YouTube (web) abrem ou começam a tocar, e volta ao anterior quando param. Jogos e as suas regras abaixo têm prioridade. Para a versão web, instale a extensão (aba Cloud gaming); sem ela o hub tenta pelo título da janela.</small></div>
        <label class="switch"><span>Mídia</span><input type="checkbox" id="mdEn"><i></i></label></div>
      ${mdRow('spotify', 'Spotify', 'Aplicativo e versão web.')}${mdRow('youtube', 'YouTube', 'Versão web, no navegador.')}
      <div class="mdnow" id="mdNow"></div></div>
      <div class="card"><h3>Regras por programa</h3>
      <div class="srow"><div class="lb"><b>Usar regras</b><small>Quando um programa da lista abre e nenhum jogo está aberto, o hub troca para o preset dele. Ao fechar, volta ao que estava. Jogos sempre têm prioridade sobre as regras.</small></div>
        <label class="switch"><span>Regras</span><input type="checkbox" id="rlEn"><i></i></label></div>
      <div class="sec">Suas regras</div><div id="rlList"></div></div>
      <div class="card"><h3>Adicionar regra</h3>
        <div class="srow stk"><div class="lb"><b>Programa</b><small>Escolha um programa aberto agora ou digite o nome do arquivo (por exemplo spotify.exe).</small></div>
          <div class="ctl" style="flex-wrap:wrap;justify-content:flex-start"><select id="rlPick" class="sel" style="min-width:170px"></select><input id="rlExe" class="inp" style="width:150px" placeholder="ou digite o .exe" spellcheck="false"><button class="ghost" id="rlRef" style="padding:6px 12px;font-size:12px">Atualizar</button></div></div>
        <div class="srow"><div class="lb"><b>Preset</b></div><div class="ctl"><select id="rlPre" class="sel" style="min-width:170px"></select></div></div>
        <div class="srow"><div class="lb"><b>Nome (opcional)</b><small>Aparece no aviso quando a regra liga.</small></div><div class="ctl"><input id="rlLbl" class="inp" style="width:170px" maxlength="30" placeholder="ex.: Spotify"></div></div>
        <div class="btns"><button class="ghost use" id="rlAdd" style="background:var(--ac);color:#001;border-color:var(--ac);font-weight:600">Adicionar</button></div>
        <div class="sec">Sugestões</div><div class="mchips" id="rlTpl"></div></div>`;
    $('#rlEn').onchange = e => hub.rulesEnabled(e.target.checked);
    const refresh = async () => { rlRunning = await hub.exeOpenWindows(); $('#rlPick').innerHTML = '<option value="">Programas abertos…</option>' + rlRunning.map(x => `<option value="${esc(x.exe)}">${esc(x.exe)} — ${esc(x.title.slice(0, 40))}</option>`).join(''); };
    $('#rlRef').onclick = refresh; refresh();
    $('#rlPick').onchange = e => { if (e.target.value) { $('#rlExe').value = e.target.value; if (!$('#rlLbl').value) $('#rlLbl').value = e.target.value.replace(/\.exe$/i, ''); } };
    $('#rlAdd').onclick = async () => {
      let exe = $('#rlExe').value.trim(); if (!exe) return toast('Escolha ou digite o programa');
      if (!/\.exe$/i.test(exe)) exe += '.exe';
      const list = [...S.rules.filter(r => r.exe.toLowerCase() !== exe.toLowerCase()), { exe, preset: $('#rlPre').value, label: $('#rlLbl').value.trim(), enabled: true }];
      const r = await hub.rulesSave(list); if (r.some(x => x.exe.toLowerCase() === exe.toLowerCase())) { toast('Regra adicionada'); $('#rlExe').value = ''; $('#rlLbl').value = ''; $('#rlPick').value = ''; } else toast('Não consegui adicionar essa regra');
    };
    $('#mdEn').onchange = e => hub.setMedia({ enabled: e.target.checked });
    for (const site of ['spotify', 'youtube']) {
      $(`#md-${site}-on`).onchange = e => hub.setMedia({ [site]: { enabled: e.target.checked } });
      $(`#md-${site}-pre`).onchange = e => hub.setMedia({ [site]: { preset: e.target.value } });
      document.querySelectorAll(`#md-${site}-wh button`).forEach(b => b.onclick = () => hub.setMedia({ [site]: { when: b.dataset.w } }));
    }
    rlUi = true;
  }
  if (S.mediaCfg) {
    const mc = S.mediaCfg; $('#mdEn').checked = mc.enabled;
    for (const site of ['spotify', 'youtube']) {
      const c = mc[site]; $(`#md-${site}-on`).checked = c.enabled; $(`#md-${site}`).classList.toggle('off', !mc.enabled || !c.enabled);
      const sel = $(`#md-${site}-pre`); if (document.activeElement !== sel) sel.innerHTML = opts(c.preset);
      document.querySelectorAll(`#md-${site}-wh button`).forEach(b => b.classList.toggle('on', b.dataset.w === c.when));
    }
    const md = S.media && S.media.active ? S.media[S.media.active] : null, p = md && prof(mc[S.media.active].preset);
    $('#mdNow').innerHTML = md ? `<span class="exdot on"></span><b>${S.media.active === 'spotify' ? 'Spotify' : 'YouTube'}</b> ${md.state === 'playing' ? 'tocando' : 'aberto'} (${esc(md.via)}) → preset <b>${esc(p ? p.name : '')}</b>` : `<span class="exdot"></span>Nada tocando agora.`;
  }
  $('#rlEn').checked = S.rulesEnabled !== false;
  $('#rlPre').innerHTML = opts($('#rlPre').value || 'music');
  $('#rlTpl').innerHTML = RULE_TEMPLATES.map(([n, exe, pre], i) => `<button class="chip k" data-t="${i}" ${S.rules.some(r => r.exe.toLowerCase() === exe.toLowerCase()) ? 'disabled' : ''} style="cursor:pointer;border:1px solid #23232b;color:#cfcfd6">${esc(n)} → ${esc((prof(pre) || {}).name || pre)}</button>`).join('');
  document.querySelectorAll('#rlTpl [data-t]').forEach(b => b.onclick = () => { const [n, exe, pre] = RULE_TEMPLATES[+b.dataset.t]; hub.rulesSave([...S.rules, { exe, preset: pre, label: n, enabled: true }]); });
  $('#rlList').innerHTML = S.rules.length ? S.rules.map(r => `<div class="lkrow" data-id="${esc(r.id)}"><div style="min-width:0"><b>${esc(r.label || r.exe.replace(/\.exe$/i, ''))}</b> <em>${esc(r.exe)}</em>${S.rule === r.id ? ' <span style="color:var(--ac);font-size:11px;letter-spacing:.14em">· ATIVA</span>' : ''}</div>
      <div class="ctl" style="gap:8px"><select class="sel rlSel" style="min-width:140px;padding:6px 10px">${opts(r.preset)}</select><label class="switch"><span>Ativa</span><input type="checkbox" class="rlOn" ${r.enabled ? 'checked' : ''}><i></i></label><button class="hkx" title="Remover">×</button></div></div>`).join('')
    : '<div class="lkrow"><em>Nenhuma regra ainda. Use as sugestões abaixo ou adicione a sua.</em></div>';
  const upd = (id, patch) => hub.rulesSave(S.rules.map(r => r.id === id ? { ...r, ...patch } : r));
  document.querySelectorAll('#rlList .lkrow[data-id]').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('.rlSel').onchange = e => upd(id, { preset: e.target.value });
    row.querySelector('.rlOn').onchange = e => upd(id, { enabled: e.target.checked });
    row.querySelector('.hkx').onclick = () => hub.rulesSave(S.rules.filter(r => r.id !== id));
  });
}

// ---------- surround virtual (HeSuVi) ----------
let svUi = null, svTest = null;
const SV_LEVELS = [['light', 'Leve', 'Palco um pouco mais aberto, mantém o som natural.'], ['medium', 'Médio', 'Equilíbrio entre direção e naturalidade (recomendado).'], ['strong', 'Forte', 'Efeito mais marcante: sensação de sons ao redor.']];
function stopSpatialTest() { if (svTest) { try { svTest.close(); } catch {} svTest = null; } const b = $('#svTest'); if (b) b.textContent = '▶ Tocar teste de direção'; }
function playSpatialTest() {                                         // cena de teste: passos cruzando, tiros esquerda/direita/centro e um tom que circula (passa pelo seu equalizador e pelo surround)
  if (svTest) return stopSpatialTest();
  const ac = svTest = new AudioContext(), out = ac.createGain(); out.gain.value = .35; out.connect(ac.destination);
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const burst = (t, dur, pan, g) => { const s = ac.createBufferSource(), f = ac.createBiquadFilter(), a = ac.createGain(), p = ac.createStereoPanner(); s.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = .8; p.pan.value = pan;
    a.gain.setValueAtTime(g, ac.currentTime + t); a.gain.exponentialRampToValueAtTime(.001, ac.currentTime + t + dur); s.connect(f); f.connect(a); a.connect(p); p.connect(out); s.start(ac.currentTime + t, Math.random()); s.stop(ac.currentTime + t + dur + .05); };
  for (let i = 0; i < 12; i++) burst(.4 + i * .22, .12, -1 + i * 2 / 11, .9);                // passos: esquerda -> direita
  burst(3.4, .35, -1, 1.1); burst(4.2, .35, 1, 1.1); burst(5.0, .35, 0, 1.1);                // tiros
  const o = ac.createOscillator(), og = ac.createGain(), pn = ac.createStereoPanner(), lf = ac.createOscillator(), lg = ac.createGain();   // tom que circula
  o.frequency.value = 520; lf.frequency.value = .45; lg.gain.value = 1; lf.connect(lg); lg.connect(pn.pan);
  og.gain.setValueAtTime(.0001, ac.currentTime + 5.8); og.gain.exponentialRampToValueAtTime(.25, ac.currentTime + 6.0); og.gain.setValueAtTime(.25, ac.currentTime + 8.6); og.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + 8.9);
  o.connect(og); og.connect(pn); pn.connect(out); o.start(ac.currentTime + 5.8); lf.start(ac.currentTime + 5.8); o.stop(ac.currentTime + 9); lf.stop(ac.currentTime + 9);
  $('#svTest').textContent = '■ Parar o teste'; setTimeout(() => { if (svTest === ac) stopSpatialTest(); }, 9300);
}
function renderSurround() {
  if (!S || !S.surroundCfg) return;
  const c = S.surroundCfg, hs = S.hesuvi || {};
  if (!svUi) {
    $('#svBox').innerHTML = '<div id="svMain"></div><div id="svGames"></div>';
    svUi = { key: '' };
  }
  const key = JSON.stringify([c, hs, S.surroundLevel, S.game]);
  if (key === svUi.key) return; svUi.key = key;
  if (!hs.installed) {
    $('#svMain').innerHTML = `<div class="card"><h3>Surround virtual</h3>
      <p style="font-size:13px;line-height:1.55;color:#cfcfd6">Cria a sensação de sons vindo de todos os lados num fone estéreo, útil para saber de onde vêm passos e tiros. O hub controla tudo, mas o efeito usa o <b>HeSuVi</b>, um programa gratuito e aberto que se instala uma vez.</p>
      <div class="sec">Como ativar</div>
      <div class="lkrow"><div><b>1.</b> Abra a página oficial e baixe o <b>HeSuVi_2.0.0.1.exe</b> (27 MB).</div></div>
      <div class="lkrow"><div><b>2.</b> Instale (o Windows pede permissão de administrador). O Equalizer APO já está instalado.</div></div>
      <div class="lkrow"><div><b>3.</b> Volte aqui: o hub reconhece sozinho e libera os controles de intensidade.</div></div>
      <div class="btns"><button class="ghost use" id="svPage" style="background:var(--ac);color:#001;border-color:var(--ac);font-weight:600">Abrir a página do HeSuVi</button><button class="ghost" id="svCheck">Já instalei: verificar</button></div></div>`;
    $('#svPage').onclick = () => hub.openHesuviPage();
    $('#svCheck').onclick = async () => { await hub.getState().then(onState); toast(S.hesuvi && S.hesuvi.installed ? 'HeSuVi encontrado!' : 'Ainda não encontrei o HeSuVi'); };
    $('#svGames').innerHTML = ''; return;
  }
  const now = S.surroundLevel;
  const unm = !c.managed ? `<div class="srow" style="border-top:0;background:#0d1114;border-radius:12px;padding:12px 14px;margin-bottom:6px"><div class="lb"><b>O HeSuVi está instalado, mas ainda não está sob controle do hub</b><small>Na configuração de fábrica dele, o efeito pode estar ligado para todos os dispositivos. Assuma o controle: o surround começa desligado e passa a valer só no Fuxi H3, quando você ligar.</small></div><button class="ghost use" id="svTake" style="background:var(--ac);color:#001;border-color:var(--ac);font-weight:600;white-space:nowrap">Assumir o controle</button></div>` : '';
  $('#svMain').innerHTML = `<div class="card"><h3>Surround virtual <span style="color:var(--mut);font-weight:400;letter-spacing:0">· HeSuVi ${esc(hs.version || '')}</span></h3>${unm}
    <div class="srow"><div class="lb"><b>Ligar o surround</b><small>Vale só para o Fuxi H3 (caixas e outros dispositivos ficam como estão). O equalizador continua funcionando antes dele.</small></div>
      <label class="switch"><span>Surround</span><input type="checkbox" id="svEn" ${c.enabled ? 'checked' : ''}><i></i></label></div>
    <div class="srow stk"><div class="lb"><b>Intensidade</b><small id="svDesc">${esc((SV_LEVELS.find(x => x[0] === c.level) || [0, 0, ''])[2])}</small></div>
      <div class="seg" id="svLv">${SV_LEVELS.map(([k, t]) => `<button data-v="${k}" class="${k === c.level ? 'on' : ''}">${t}</button>`).join('')}</div></div>
    <div class="srow"><div class="lb"><b>Estilo do som</b><small>Cada estilo é um conjunto de medidas do HeSuVi. Experimente e fique com o que soar mais natural para você.</small></div>
      <select id="svHr" class="sel" style="min-width:150px">${(hs.hrirs || []).map(h => `<option value="${esc(h.id)}" ${h.id === c.hrir ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></div>
    <div class="srow"><div class="lb"><b>Agora</b><small>${c.enabled ? (now && now !== 'off' ? 'Surround <b>' + esc((SV_LEVELS.find(x => x[0] === now) || [0, now])[1]) + '</b> aplicado' + (S.game && c.perGame[S.game] ? ' (exceção deste jogo)' : '') : 'Desligado neste momento') : 'Desligado'}.</small></div>
      <button class="ghost" id="svTest" style="padding:7px 14px;font-size:12.5px">${svTest ? '■ Parar o teste' : '▶ Tocar teste de direção'}</button></div>
    <div class="lkrow"><em>Dica: com o teste tocando, alterne entre Desligado e os níveis. Você deve ouvir passos cruzando, tiros à esquerda, direita e ao centro, e um tom que circula.</em></div></div>
    <div class="card"><div class="lkrow" style="border-top:0"><em>Deixe a janela do HeSuVi fechada: se você salvar algo nela, ela sobrescreve estes ajustes. Para voltar, é só mexer aqui de novo.</em></div></div>`;
  if ($('#svTake')) $('#svTake').onclick = () => hub.setSurround({ enabled: false });          // marca como "sob controle do hub" e grava o estado desligado
  $('#svEn').onchange = e => hub.setSurround({ enabled: e.target.checked });
  document.querySelectorAll('#svLv button').forEach(b => b.onclick = () => hub.setSurround({ level: b.dataset.v, enabled: true }));
  $('#svHr').onchange = e => hub.setSurround({ hrir: e.target.value });
  $('#svTest').onclick = playSpatialTest;
  const games = S.profiles.filter(p => p.exe), ov = Object.entries(c.perGame);
  $('#svGames').innerHTML = `<div class="card"><h3>Exceções por jogo</h3>
    <div class="srow"><div class="lb"><b>Nível diferente para um jogo</b><small>Por exemplo: Forte no Valorant e Desligado no God of War. Os outros jogos usam o nível geral acima.</small></div>
      <div class="ctl"><select id="svG" class="sel" style="min-width:150px">${games.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select>
        <select id="svGl" class="sel" style="min-width:110px"><option value="off">Desligado</option>${SV_LEVELS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
        <button class="ghost" id="svGa" style="padding:6px 12px;font-size:12px">Definir</button></div></div>
    ${ov.length ? ov.map(([id, lv]) => `<div class="lkrow"><div><b>${esc((prof(id) || {}).name || id)}</b> <em>${lv === 'off' ? 'Desligado' : esc((SV_LEVELS.find(x => x[0] === lv) || [0, lv])[1])}</em></div><button class="hkx" data-rm="${esc(id)}" title="Remover exceção">×</button></div>`).join('') : '<div class="lkrow"><em>Nenhuma exceção.</em></div>'}</div>`;
  $('#svGa').onclick = () => hub.setSurround({ perGame: { ...c.perGame, [$('#svG').value]: $('#svGl').value } });
  document.querySelectorAll('#svGames [data-rm]').forEach(b => b.onclick = () => { const p = { ...c.perGame }; delete p[b.dataset.rm]; hub.setSurround({ perGame: p }); });
}

// ---------- aba Cloud gaming ----------
let clUi = null, clTeach = null, clWins = [];
const CL_LEVELS = [['off', 'Desligado'], ['light', 'Leve'], ['medium', 'Médio'], ['strong', 'Forte'], ['custom', 'Personalizado']];
const CL_SCALE = { off: 0, light: .5, medium: 1, strong: 1.5 };
const clDelta = f => (f <= 45 ? -1.5 : f <= 90 ? -1 : f <= 200 ? -.5 : f < 1500 ? 0 : f < 3000 ? .5 : f < 6500 ? 1 : f < 12000 ? 1.5 : .5);
const CL_ANCH = [45, 150, 700, 2500, 5000, 10000];
const CL_REG = [['Sub-grave', 'até 90 Hz'], ['Graves', '90–250 Hz'], ['Médios', '250 Hz–1,5 kHz'], ['Presença', '1,5–3,5 kHz'], ['Claridade', '3,5–7 kHz'], ['“Ar”', 'acima de 7 kHz']];
function clCustom(f, a) { if (f <= CL_ANCH[0]) return a[0]; if (f >= CL_ANCH[5]) return a[5]; for (let i = 0; i < 5; i++) if (f <= CL_ANCH[i + 1]) { const t = Math.log(f / CL_ANCH[i]) / Math.log(CL_ANCH[i + 1] / CL_ANCH[i]); return a[i] + (a[i + 1] - a[i]) * t; } return 0; }
function clCurve(c) {                                                  // no preset do Fortnite: pontilhado = original, azul = com o toque cloud
  const p = prof('fortnite'); if (!p) return '';
  const fr = EQMath.logFreqs(80), W = 300, H = 70, y = d => H / 2 - Math.max(-8, Math.min(8, d)) / 8 * (H / 2 - 4);
  const d = c.touch === 'custom' ? f => clCustom(f, c.custom) : f => clDelta(f) * (CL_SCALE[c.touch] || 0);
  const base = EQMath.response(p.f, p.eq, p.q, fr, p.t), tch = EQMath.response(p.f, p.eq.map((g, i) => Math.max(-12, Math.min(12, g + d(p.f[i])))), p.q, fr, p.t);
  const path = r => fr.map((f, i) => (i ? 'L' : 'M') + ((i / (fr.length - 1)) * W).toFixed(1) + ',' + y(r[i]).toFixed(1)).join(' ');
  const on = c.touch !== 'off';
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:78px"><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#ffffff1c"/><path d="${path(base)}" fill="none" stroke="#6a6a78" stroke-width="1.6" stroke-dasharray="3 3"/>${on ? `<path d="${path(tch)}" fill="none" stroke="#8cc8ff" stroke-width="2.2" stroke-linecap="round" style="filter:drop-shadow(0 0 5px #8cc8ff88)"/>` : ''}</svg>`;
}
function fmtDur(ms) { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''); }
const svcName = s => (s === 'gfn' ? 'GeForce NOW' : 'Xbox Cloud Gaming');

async function loadCloudWins() {
  const box = $('#clWins'); if (!box || clTeach) return;
  clWins = await hub.cloudWindows();
  box.innerHTML = clWins.length ? clWins.map((w, i) => `<div class="lkrow"><div style="min-width:0"><b>${esc(w.name)}</b> <em>${esc(w.title)}</em></div>
      <div class="ctl" style="gap:10px"><span style="font-size:12px;white-space:nowrap;color:${w.svc ? '#8cc8ff' : 'var(--mut)'}">${w.svc ? esc(w.svc) + (w.game ? ' · ' + esc(w.game) : ' · sem jogo no título') + (w.learned ? ' · ensinada' : '') : 'não é cloud'}</span>
      <button class="ghost" data-teach="${i}" style="padding:5px 11px;font-size:11.5px">Ensinar</button></div></div>`).join('')
    : '<div class="lkrow"><em>Nenhuma janela de navegador, do app do Xbox ou do GeForce NOW aberta agora.</em></div>';
  box.querySelectorAll('[data-teach]').forEach(b => b.onclick = () => openTeach(clWins[+b.dataset.teach]));
}
function openTeach(w) {
  const hint = /xbox\s*cloud\s*gaming/i.test(w.title) ? 'Xbox Cloud Gaming' : /geforce\s*now/i.test(w.title) ? 'GeForce NOW' : '';
  clTeach = { w, svc: w.svcId || (/geforce/i.test(w.title) || /geforcenow/i.test(w.name) ? 'gfn' : 'xcloud'), contains: hint };
  renderTeach();
}
async function renderTeach() {
  const box = $('#clTeach'); if (!box) return;
  if (!clTeach) { box.innerHTML = ''; return; }
  const t = clTeach, browser = /^(msedge|chrome|firefox|brave|opera|vivaldi|arc|iexplore|opera_gx)$/i.test(t.w.name);
  box.innerHTML = `<div class="cmc" style="margin-top:12px"><div class="cmh"><b>Ensinar o hub sobre esta janela</b><small>“${esc(t.w.name)}” · ${esc(t.w.title)}</small></div>
    <div class="srow" style="border-top:0"><div class="lb"><b>É uma sessão de</b></div><div class="seg" id="tcSvc"><button data-v="xcloud" class="${t.svc === 'xcloud' ? 'on' : ''}">xCloud</button><button data-v="gfn" class="${t.svc === 'gfn' ? 'on' : ''}">GeForce NOW</button></div></div>
    <div class="srow"><div class="lb"><b>O título contém</b><small>${browser ? 'Em navegador é obrigatório: um trecho que só aparece em sessões cloud (por exemplo “Xbox Cloud Gaming”).' : 'Opcional: deixe vazio para valer para qualquer janela deste programa.'}</small></div><input id="tcCt" class="inp" style="width:210px" value="${esc(t.contains)}" spellcheck="false"></div>
    <div class="srow"><div class="lb"><b>Nome do jogo que o hub vai ler</b><small>Se estiver errado, ajuste o trecho acima.</small></div><b id="tcPv" style="color:#8cc8ff;font-weight:600"></b></div>
    <div class="cmb"><button class="ghost use" id="tcSave" style="background:var(--ac);color:#001;border-color:var(--ac);font-weight:600">Salvar</button><button class="ghost" id="tcCancel">Cancelar</button></div></div>`;
  const pv = async () => { $('#tcPv').textContent = (await hub.cloudPreview(t.w.title, t.contains)) || '— (nenhum jogo no título)'; };
  document.querySelectorAll('#tcSvc button').forEach(b => b.onclick = () => { t.svc = b.dataset.v; document.querySelectorAll('#tcSvc button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#tcCt').oninput = e => { t.contains = e.target.value; pv(); };
  $('#tcCancel').onclick = () => { clTeach = null; renderTeach(); loadCloudWins(); };
  $('#tcSave').onclick = async () => {
    if (browser && !t.contains.trim()) return toast('Em navegador, informe um trecho do título');
    await hub.cloudTeach({ svc: t.svc, proc: t.w.name, contains: t.contains.trim() });
    toast('Pronto: o hub aprendeu essa janela'); clTeach = null; renderTeach(); loadCloudWins();
  };
  pv();
}
let exLast = null;
async function refreshExt() {                                           // status da extensão: conectada / aguardando, e o que cada serviço está fazendo agora
  if (!$('#exSt')) return;
  const st = await hub.extStatus(), ok = st.last && Date.now() - st.last < 20000; exLast = st;
  $('#exSt').innerHTML = `<span class="exdot ${ok ? 'on' : ''}"></span>${ok ? 'Extensão conectada' : 'Extensão não conectada'}`;
  for (const [k, id] of [['xcloud', 'svsX'], ['gfn', 'svsG']]) {
    const t = st.tabs.find(v => v.svc === k && v.state === 'playing') || st.tabs.find(v => v.svc === k);
    $('#' + id).textContent = !t ? (S && S.cloudApps && S.cloudApps[k] ? (k === 'gfn' && S.cloudApps.gfnStreaming ? 'App nativo · em partida' : 'App nativo aberto') : 'Nenhuma aba aberta') : t.state === 'playing' ? 'Jogando' + (t.game ? ': ' + t.game : '') : 'Aberto, navegando';
    $('#' + id).classList.toggle('live', !!t && t.state === 'playing');
  }
}
function renderCloud() {
  if (!S || !S.cloudCfg) return;
  const c = S.cloudCfg, lvlOpts = (sel, withSame) => (withSame ? `<option value="">Igual ao geral</option>` : '') + CL_LEVELS.map(([k, t]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${t}</option>`).join('');
  if (!clUi) {
    $('#clBox').innerHTML = `<div id="clNow"></div>
      <div class="cards"><div class="card"><h3>Resumo</h3><div id="clSum"></div></div>
      <div class="card"><h3>Serviços</h3><div class="svcs">
        <div class="svc x" id="svcX"><div class="svh">${CLOUDMARK.xcloud(54)}<div><b>Xbox Cloud Gaming</b><small id="svsX"></small></div><label class="switch"><input type="checkbox" id="clX"><i></i></label></div>
          <div class="svf"><span>Toque cloud</span><select id="clTbX" class="sel" style="min-width:140px;padding:6px 10px"></select></div></div>
        <div class="svc g" id="svcG"><div class="svh">${CLOUDMARK.gfn(54)}<div><b>NVIDIA GeForce NOW</b><small id="svsG"></small></div><label class="switch"><input type="checkbox" id="clG"><i></i></label></div>
          <div class="svf"><span>Toque cloud</span><select id="clTbG" class="sel" style="min-width:140px;padding:6px 10px"></select></div></div></div></div>
      <div class="card"><h3>Extensão do navegador</h3>
        <div class="srow stk" style="border-top:0"><div class="lb"><b id="exSt"></b><small>A extensão (Edge, Chrome ou Brave) lê a página do xCloud e do GeForce NOW e avisa o hub, neste PC, qual jogo está aberto. É mais preciso que ler o título da janela e não envia nada para a internet.</small></div>
          <div class="btns" style="margin:0"><button class="ghost" data-ext="edge">Instalar no Edge</button><button class="ghost" data-ext="chrome">Chrome</button><button class="ghost" data-ext="brave">Brave</button></div></div>
        <ol class="exsteps"><li>Clique no botão do seu navegador: o hub abre a pasta e a página de extensões.</li><li>Ative o <b>Modo do desenvolvedor</b> (canto da página).</li><li>Clique em <b>Carregar sem pacote</b> e escolha a pasta <b>extension</b> que o hub abriu.</li><li>Abra um jogo no xCloud ou no GeForce NOW: o status acima fica “conectada”.</li></ol>
        <div class="srow"><div class="lb"><b>Usar a extensão</b><small>Quando ela está ativa, vale mais que o título da janela.</small></div><label class="switch"><input type="checkbox" id="exOn"><i></i></label></div>
        <div class="srow"><div class="lb"><b>Plano B: título da janela</b><small>Se a extensão não estiver instalada ou o navegador estiver fechado, o hub ainda tenta pelo título das janelas.</small></div><label class="switch"><input type="checkbox" id="exFb"><i></i></label></div></div>
      <div class="card mancard"><h3>App nativo e sessão manual</h3>
        <div class="lb"><small style="font-size:12.5px;line-height:1.55;color:#a8a8b4">O hub também reconhece o app do GeForce NOW e o app do Xbox no Windows. Esses apps nem sempre mostram o nome do jogo: se o hub não souber qual é, diga aqui e ele aplica o preset do jogo com o toque cloud até você encerrar ou fechar o app.</small></div>
        <div id="manNow"></div>
        <div class="manrow" id="manForm"><select id="manSvc" class="sel" style="min-width:170px;flex:none"><option value="gfn">GeForce NOW</option><option value="xcloud">Xbox Cloud Gaming</option></select><select id="manGame" class="sel"></select><button class="ghost use" id="manGo" style="background:var(--ac);color:#001;border-color:var(--ac);font-weight:600">Iniciar</button></div></div>
      <div class="card"><h3>Toque cloud</h3>
        <div class="srow stk"><div class="lb"><b>Ajuste do preset em sessão cloud</b><small>O som do streaming é comprimido: perde sub-grave e brilho. Em sessão cloud o hub aplica o preset do jogo com um acerto por cima. A linha azul mostra o efeito no preset do Fortnite; a pontilhada é o original. Cada serviço pode ter o seu nível (listas acima).</small></div>
          <div class="seg" id="clTouch">${CL_LEVELS.map(([k, t]) => `<button data-v="${k}">${t}</button>`).join('')}</div></div>
        <div id="clCurve" style="padding:2px 4px 6px"></div>
        <div id="clCustom" hidden>${CL_REG.map(([n, r], i) => `<div class="srow" style="padding:9px 0"><div class="lb"><b>${n}</b><small>${r}</small></div><div class="ctl"><span id="clCs${i}"></span><span class="vv" id="clCv${i}" style="width:54px"></span></div></div>`).join('')}</div>
        <div class="srow"><div class="lb"><b>Surround em cloud</b><small>Nível do surround virtual durante sessões cloud. “Igual ao geral” usa o nível das Configurações → Surround; exceções por jogo continuam valendo.</small></div>
          <select id="clSur" class="sel" style="min-width:150px"><option value="same">Igual ao geral</option><option value="off">Desligado</option><option value="light">Leve</option><option value="medium">Médio</option><option value="strong">Forte</option></select></div></div>
      <div class="card"><h3>O que o hub está vendo</h3>
        <div class="srow" style="border-top:0"><div class="lb"><small>Janelas de navegador, do app do Xbox e do GeForce NOW, atualizadas a cada poucos segundos, e como cada título foi entendido. Se o seu jogo não é reconhecido, clique em “Ensinar” na janela dele.</small></div><button class="ghost" id="clRef" style="padding:6px 12px;font-size:12px">Atualizar</button></div>
        <div id="clWins"></div><div id="clTeach"></div>
        <div class="sec">Janelas ensinadas</div><div id="clLearn"></div></div>
      <div class="card"><h3>Histórico</h3><div id="clLog"></div><div class="btns"><button class="ghost" id="clClear" style="font-size:12px">Limpar histórico</button></div></div></div>`;
    $('#clX').onchange = e => hub.setCloud({ services: { xcloud: e.target.checked } });
    $('#clG').onchange = e => hub.setCloud({ services: { gfn: e.target.checked } });
    const tb = () => hub.setCloud({ touchBy: { xcloud: $('#clTbX').value, gfn: $('#clTbG').value } });
    $('#clTbX').onchange = tb; $('#clTbG').onchange = tb;
    document.querySelectorAll('#clTouch button').forEach(b => b.onclick = () => hub.setCloud({ touch: b.dataset.v }));
    $('#clSur').onchange = e => hub.setCloud({ surround: e.target.value });
    let tCu = null; clUi = { key: '', sl: [], vals: [0,0,0,0,0,0] };
    CL_REG.forEach((_, i) => {
      const s = slider(0, v => { clUi.vals[i] = v; const g = Math.round((v / 100 * 8 - 4) * 2) / 2; $(`#clCv${i}`).textContent = (g > 0 ? '+' : '') + g.toFixed(1) + ' dB'; clearTimeout(tCu);
        tCu = setTimeout(() => hub.setCloud({ touch: 'custom', custom: clUi.vals.map(x => Math.round((x / 100 * 8 - 4) * 2) / 2) }), 160); });
      $(`#clCs${i}`).replaceWith(s); clUi.sl.push(s);
    });
    document.querySelectorAll('[data-ext]').forEach(b => b.onclick = async () => { await hub.extInstall(b.dataset.ext); toast('Pasta da extensão aberta: siga os passos abaixo'); });
    $('#manGo').onclick = () => hub.cloudManual({ svc: $('#manSvc').value, id: $('#manGame').value });
    $('#exOn').onchange = e => hub.setCloud({ ext: { enabled: e.target.checked } });
    $('#exFb').onchange = e => hub.setCloud({ ext: { windowFallback: e.target.checked } });
    $('#clRef').onclick = loadCloudWins; $('#clClear').onclick = () => hub.setCloud({ clearLog: true });
    $('#clEn').onchange = e => hub.setCloud({ enabled: e.target.checked });
    loadCloudWins();
  }
  $('#clEn').checked = c.enabled; $('#clX').checked = c.services.xcloud; $('#clG').checked = c.services.gfn;
  $('#clTbX').innerHTML = lvlOpts(c.touchBy.xcloud, true); $('#clTbG').innerHTML = lvlOpts(c.touchBy.gfn, true);
  $('#clSur').value = c.surround;
  const mg = $('#manGame'), mgames = S.profiles.filter(p => p.exe);
  if (mg.options.length !== mgames.length) mg.innerHTML = mgames.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  const mn = S.cloudManual;
  $('#manNow').innerHTML = mn ? `<div class="lkrow" style="border-top:0"><span class="mantag"><span class="exdot on"></span>Sessão manual: <b>${esc(mn.name)}</b> em ${esc(svcName(mn.svc))}</span><button class="ghost" id="manEnd" style="padding:6px 14px;font-size:12px">Encerrar</button></div>` : '';
  if (mn) $('#manEnd').onclick = () => hub.cloudManual(null);
  $('#manForm').style.display = mn ? 'none' : 'flex';
  $('#exOn').checked = c.ext.enabled; $('#exFb').checked = c.ext.windowFallback;
  $('#svcX').classList.toggle('off', !c.services.xcloud); $('#svcG').classList.toggle('off', !c.services.gfn);
  refreshExt();
  document.querySelectorAll('#clTouch button').forEach(b => b.classList.toggle('on', b.dataset.v === c.touch));
  $('#clCurve').innerHTML = clCurve(c);
  $('#clCustom').hidden = c.touch !== 'custom';
  clUi.sl.forEach((s, i) => { if (!s.isDrag()) { s.set(Math.round((c.custom[i] + 4) / 8 * 100)); $(`#clCv${i}`).textContent = (c.custom[i] > 0 ? '+' : '') + c.custom[i].toFixed(1) + ' dB'; } });
  // sessão agora
  const cur = S.cloud, seen = S.cloudSeen, p = S.game && prof(S.game);
  const lv = cur && ((c.touchBy[cur.svc]) || c.touch), lvName = (CL_LEVELS.find(x => x[0] === lv) || [0, ''])[1].toLowerCase();
  const key = JSON.stringify([c.enabled, cur, seen && seen.title, p && p.banner, lv]);
  if (key !== clUi.key) {
    clUi.key = key;
    $('#clNow').innerHTML = !c.enabled ? '<div class="now idle"><div><b>Reconhecimento cloud desligado</b><small>Ligue a chave no canto para o hub identificar jogos do xCloud e do GeForce NOW.</small></div></div>'
      : cur && S.game ? `<div class="now live" style="--c:${CLOUDMARK.COL[cur.svc]}">${p && p.banner ? `<div class="nbg" style="background-image:url('${p.banner}')"></div>` : ''}<div class="nsh"></div>
          <div class="nmk">${CLOUDMARK.mark(cur.svc, 72)}</div><div class="ntx"><span class="nb"><i></i>CLOUD · ${esc(cur.label)}${cur.ext ? " · EXTENSÃO" : ""}</span><b>${esc((p && p.name) || S.gameName || cur.name)}</b><small>Preset do jogo com toque cloud ${esc(lvName)}${S.surroundLevel && S.surroundLevel !== 'off' ? ' · surround ' + esc(S.surroundLevel === 'light' ? 'leve' : S.surroundLevel === 'strong' ? 'forte' : 'médio') : ''}</small></div></div>`
      : seen ? `<div class="now idle"><span class="nmk s">${CLOUDMARK.mark(seen.svc, 46)}</span><div><b>${esc(seen.label)} aberto</b><small>Nenhum jogo identificado no título da janela (“${esc(seen.title.slice(0, 70))}”). Se o jogo está rodando, clique em “Ensinar” na lista abaixo ou inicie uma sessão manual em “App nativo e sessão manual”.</small></div></div>`
      : '<div class="now idle"><span class="rad"><i></i></span><div><b>Nenhuma sessão cloud detectada</b><small>Abra um jogo no Xbox Cloud Gaming ou no GeForce NOW e o hub aplica o preset dele, com o toque cloud.</small></div></div>';
  }
  // resumo: sessões e tempo por serviço + jogos mais jogados na nuvem
  const by = { xcloud: { n: 0, ms: 0 }, gfn: { n: 0, ms: 0 } }, games = {};
  c.log.forEach(e => { const b = by[e.svc] || by.xcloud; b.n++; b.ms += e.ms; games[e.name] = (games[e.name] || 0) + e.ms; });
  const top = Object.entries(games).sort((a, b) => b[1] - a[1]).slice(0, 3);
  $('#clSum').innerHTML = c.log.length ? `<div class="cltiles">${['xcloud', 'gfn'].map(k => `<div class="cltile"><small>${svcName(k)}</small><b>${fmtDur(by[k].ms) || '0 min'}</b><span>${by[k].n} ${by[k].n === 1 ? 'sessão' : 'sessões'}</span></div>`).join('')}</div>
      <div class="sec" style="padding-top:10px">Mais jogados na nuvem</div>${top.map(([n, ms]) => `<div class="lkrow"><div><b>${esc(n)}</b></div><span style="font-size:12px;color:var(--mut)">${fmtDur(ms)}</span></div>`).join('')}`
    : '<div class="lkrow" style="border-top:0"><em>Ainda sem sessões. O tempo jogado na nuvem aparece aqui.</em></div>';
  $('#clLearn').innerHTML = c.learned.length ? c.learned.map(r => `<div class="lkrow"><div style="min-width:0"><b>${esc(r.proc)}</b> <em>${r.contains ? 'título contém “' + esc(r.contains) + '”' : 'qualquer janela'} → ${svcName(r.svc)}</em></div><button class="hkx" data-rl="${esc(r.id)}" title="Esquecer">×</button></div>`).join('')
    : '<div class="lkrow"><em>Nenhuma ainda.</em></div>';
  document.querySelectorAll('#clLearn [data-rl]').forEach(b => b.onclick = () => hub.cloudTeach({ removeId: b.dataset.rl }));
  $('#clLog').innerHTML = c.log.length ? c.log.slice(0, 15).map(e => `<div class="lkrow"><div><b>${esc(e.name)}</b> <em>${svcName(e.svc)}</em></div><span style="font-size:12px;color:var(--mut)">${new Date(e.start).toLocaleDateString('pt-BR')} · ${fmtDur(e.ms)}</span></div>`).join('') : '<div class="lkrow"><em>As sessões cloud de mais de 20 segundos aparecem aqui.</em></div>';
}
setInterval(() => { if (typeof page !== 'undefined' && page === 'cloud') { loadCloudWins(); refreshExt(); } }, 3500);        // lista "o que o hub está vendo" ao vivo enquanto a aba está aberta

// ---------- configurações: seções ----------
let cfgUi = null, stDelEl = null;
function renderConfig() {
  if (!S || !S.ui) return;
  document.body.classList.toggle('rm', !!S.ui.reduceMotion); document.body.classList.toggle('nofx', S.ui.cardFx === false);
  if (!cfgUi) {
    // navegação entre seções (lembra a última)
    let last = 'geral'; try { last = localStorage.getItem('fuxi.cfg') || 'geral'; } catch {}
    const show = s => { document.querySelectorAll('#cfgNav button').forEach(b => b.classList.toggle('on', b.dataset.s === s)); document.querySelectorAll('.cfgsec').forEach(x => x.classList.toggle('on', x.dataset.s === s)); try { localStorage.setItem('fuxi.cfg', s); } catch {} };
    document.querySelectorAll('#cfgNav button').forEach(b => b.onclick = () => show(b.dataset.s));
    if (document.querySelector(`#cfgNav [data-s="${last}"]`)) show(last);

    $('#sgBox').innerHTML = `<div class="card"><h3>Sistema</h3>
      <div class="srow"><div class="lb"><b>Iniciar com o Windows</b><small id="asSub">Abre o hub na tela, com a abertura animada, ao ligar o PC — sem pedir permissão.</small><div class="hkerr" id="asErr" hidden></div></div>
        <label class="switch"><span>Iniciar</span><input type="checkbox" id="asEn"><i></i></label></div>
      <div class="srow stup"><div class="lb"><b>Depois da abertura</b><small>O que o hub faz depois de abrir sozinho com o Windows.</small></div>
        <div class="seg" id="stAfter"><button data-v="tray">Ir para a bandeja</button><button data-v="stay">Ficar aberto</button></div></div>
      <div class="srow stup" id="stDelayRow"><div class="lb"><b>Esconder depois de</b><small>Tempo após o fim da abertura. Se você mexer no app antes, ele não esconde.</small></div><div class="ctl"><span id="stDelSl"></span><span class="vv" id="stDelV"></span></div></div>
      <div class="srow"><div class="lb"><b>Fechar na bandeja</b><small>O X da janela só esconde o hub, que segue trocando o preset por jogo. Para sair de vez: clique direito no ícone perto do relógio → Sair.</small></div>
        <label class="switch"><span>Bandeja</span><input type="checkbox" id="trayEn"><i></i></label></div></div>`;
    $('#asEn').onchange = e => hub.setAutostart(e.target.checked);
    $('#trayEn').onchange = e => hub.setTray(e.target.checked);
    document.querySelectorAll('#stAfter button').forEach(b => b.onclick = () => hub.setStartup({ afterIntro: b.dataset.v }));
    let tSt = null;
    stDelEl = slider(0, v => { const s = Math.round(v / 100 * 30); $('#stDelV').textContent = s === 0 ? 'na hora' : s + ' s'; clearTimeout(tSt); tSt = setTimeout(() => hub.setStartup({ delay: s }), 180); });
    $('#stDelSl').replaceWith(stDelEl);
    $('#sgBox').insertAdjacentHTML('afterbegin', `<div class="card"><h3>Idioma</h3>
      <div class="srow" style="border-top:0"><div class="lb"><b>Idioma do app</b><small>Português, inglês ou espanhol. A troca vale na hora para todas as telas e avisos.</small></div>
        <div class="seg" id="lgSw"><button data-l="pt">Português</button><button data-l="en">English</button><button data-l="es">Español</button></div></div></div>`);
    document.querySelectorAll('#lgSw button').forEach(b => b.onclick = () => hub.setUi({ lang: b.dataset.l }));
    $('#sgBox').insertAdjacentHTML('beforeend', `<div class="card"><h3>Áudio</h3>
      <div class="srow"><div class="lb"><b>Usar o Fuxi como saída ao conectar</b><small>Quando o fone liga, ele vira a saída de som padrão do Windows. Ao desligar, o som volta para a saída que estava antes (caixas, por exemplo).</small></div>
        <label class="switch"><span>Saída</span><input type="checkbox" id="asw"><i></i></label></div></div>
      <div class="card"><h3>Backup</h3>
      <div class="srow"><div class="lb"><b>Exportar e restaurar</b><small>Salva num arquivo seus presets, preset por jogo, avisos, atalhos, abertura, favoritos e estatísticas. Útil para formatar o PC ou levar para outro.</small></div>
        <div class="btns" style="margin:0"><button class="ghost" id="bkOut">Exportar</button><button class="ghost" id="bkIn">Restaurar</button></div></div>
      <div class="srow"><div class="lb"><b>Backup automático</b><small id="bkAuto">O hub guarda sozinho uma cópia por dia (as 7 últimas).</small></div>
        <button class="ghost" id="bkDir">Abrir pasta</button></div></div>`);
    $('#asw').onchange = e => hub.setAudioSwitch(e.target.checked);
    $('#bkOut').onclick = async () => { const r = await hub.backupExport(); if (r) toast('Backup salvo: ' + r); else if (r === false) toast('Não consegui salvar o backup'); };
    $('#bkIn').onclick = async () => { const r = await hub.backupImport(); if (r === true) toast('Backup restaurado'); else if (r === false) toast('Esse arquivo não é um backup válido do Fuxi Hub'); };
    $('#bkDir').onclick = () => hub.openBackupFolder();
    $('#anBox').innerHTML = `<div class="card"><h3>Animações do app</h3>
      <div class="srow"><div class="lb"><b>Reduzir animações</b><small>Desliga os movimentos da interface (transições, brilhos e entradas). Bom para PCs mais fracos ou se movimento te incomoda.</small></div>
        <label class="switch"><span>Reduzir</span><input type="checkbox" id="uiRm"><i></i></label></div>
      <div class="srow"><div class="lb"><b>Efeitos nos cards de jogos</b><small>Inclinação, zoom da arte e reflexo de luz ao passar o mouse.</small></div>
        <label class="switch"><span>Efeitos</span><input type="checkbox" id="uiFx"><i></i></label></div>
      <div class="srow"><div class="lb"><b>Visualizador de áudio</b><small>Espectro ao vivo atrás do fone (Início) e sobre a curva do equalizador. Lê o som que está saindo no PC, sem usar o microfone.</small></div>
        <label class="switch"><span>Espectro</span><input type="checkbox" id="uiSp"><i></i></label></div>
      <div class="srow"><div class="lb"><b>Transição ao trocar de preset</b><small>A tela se pinta com a cor do preset e mostra o nome por um instante.</small></div>
        <label class="switch"><span>Transição</span><input type="checkbox" id="uiWs"><i></i></label></div>
      <div class="srow"><div class="lb"><b>Sons da interface</b><small>Cliques e tons bem baixinhos ao ligar chaves, trocar de aba e desbloquear conquistas.</small></div>
        <label class="switch"><span>Sons</span><input type="checkbox" id="uiSn"><i></i></label></div>
      <div class="srow stk"><div class="lb"><b>Cor do app</b><small>“Automático” acompanha a cor do preset ou do jogo em uso; as outras ficam fixas.</small></div>
        <div class="thsw" id="thSw"><button data-t="auto" title="Automático"><i class="auto"></i></button><button data-t="cyan" title="Ciano"><i style="--c:#2ef2ff"></i></button><button data-t="green" title="Verde"><i style="--c:#3ddc5a"></i></button><button data-t="purple" title="Roxo"><i style="--c:#a78bfa"></i></button><button data-t="red" title="Vermelho"><i style="--c:#ff4d6d"></i></button><button data-t="amber" title="Âmbar"><i style="--c:#ffb347"></i></button></div></div>
      <div class="srow stk"><div class="lb"><b>Estilo do app</b><small>Muda o visual de todas as telas, com uma transição animada a partir do ponto em que você clicou.</small></div>
        <div class="stylesw" id="stSw"><button data-s="amoled"><i class="p amoled"></i><span>AMOLED</span></button><button data-s="glass"><i class="p glass"></i><span>Vidro</span></button><button data-s="neon"><i class="p neon"></i><span>Neon</span></button><button data-s="paper"><i class="p paper"></i><span>Papel</span></button></div></div>
      <div class="srow"><div class="lb"><b>Animação dos avisos</b><small>Como o aviso entra e sai no canto da tela.</small></div>
        <div class="seg" id="nfAnim"><button data-v="slide">Deslizar</button><button data-v="fade">Suave</button><button data-v="none">Nenhuma</button></div></div></div>`;
    $('#uiRm').onchange = e => hub.setUi({ reduceMotion: e.target.checked });
    $('#uiFx').onchange = e => hub.setUi({ cardFx: e.target.checked });
    $('#uiSp').onchange = e => hub.setUi({ spectrum: e.target.checked });
    $('#uiWs').onchange = e => hub.setUi({ presetWash: e.target.checked });
    $('#uiSn').onchange = e => hub.setUi({ uiSounds: e.target.checked });
    document.querySelectorAll('#thSw button').forEach(b => b.onclick = () => hub.setUi({ theme: b.dataset.t }));
    document.querySelectorAll('#stSw button').forEach(b => b.onclick = e => { window.__vtX = e.clientX; window.__vtY = e.clientY; hub.setUi({ style: b.dataset.s }); });
    document.querySelectorAll('#nfAnim button').forEach(b => b.onclick = () => hub.setNotify({ anim: b.dataset.v }).then(() => hub.testNotify('game')));

    $('#jgBox').innerHTML = `<div class="card"><h3>Reconhecimento de jogos</h3>
      <div class="srow"><div class="lb"><b>Reconhecer qualquer jogo instalado</b><small>Além dos 19 da lista, o hub identifica jogos de Steam, Epic, Riot, Ubisoft, GOG, EA, Xbox e Rockstar pela pasta e aplica o preset "Jogos". Desligado, só vale a lista e o que você vinculou.</small></div>
        <label class="switch"><span>Reconhecer</span><input type="checkbox" id="jgDet"><i></i></label></div>
      <div class="sec">Programas que você vinculou</div><div id="jgLinks"></div></div>
      <div class="card"><h3>Uso e dados</h3>
      <div class="srow"><div class="lb"><b>Estatísticas de uso</b><small>Quantas vezes e por quanto tempo você jogou cada jogo (usadas em "Mais jogados" e "Recentes"). Ficam só neste computador.</small></div>
        <button class="ghost" id="jgReset">Zerar</button></div>
      <div class="srow"><div class="lb"><b>Imagens dos jogos</b><small>Pasta para trocar a arte de um jogo (nome do arquivo = id do jogo, por exemplo fortnite.png).</small></div>
        <button class="ghost" id="jgArt">Abrir pasta</button></div></div>`;
    $('#jgDet').onchange = e => hub.setDetect(e.target.checked);
    let armed = 0;
    $('#jgReset').onclick = () => { const b = $('#jgReset'); if (!armed) { armed = 1; b.textContent = 'Confirmar?'; setTimeout(() => { armed = 0; b.textContent = 'Zerar'; }, 3500); } else { armed = 0; b.textContent = 'Zerar'; hub.resetStats(); toast('Estatísticas zeradas'); } };
    $('#jgArt').onclick = () => hub.openArtFolder();

    $('#sbBox').innerHTML = `<div class="card"><div class="sbrow">${fuxiMark('sb', 'bm')}<div><b>Fuxi Hub</b><small id="sbVer"></small></div></div>
      <div class="kv"><span>Fone</span><b id="sbDev"></b></div>
      <div class="kv"><span>Motor de equalização</span><b id="sbEng"></b></div>
      <div class="kv"><span>Dados e configurações</span><b><button class="ghost" id="sbData" style="padding:5px 12px;font-size:12px">Abrir pasta</button></b></div>
      <div class="kv"><span>Tutorial</span><b><button class="ghost" id="sbTour" style="padding:5px 12px;font-size:12px">Rever tutorial</button></b></div></div>`;
    $('#sbData').onclick = () => hub.openDataFolder();
    $('#sbTour').onclick = () => { go('home'); setTimeout(() => Tour.replay(), 300); };
    cfgUi = true;
  }
  $('#uiRm').checked = !!S.ui.reduceMotion; $('#uiFx').checked = S.ui.cardFx !== false;
  $('#uiSp').checked = S.ui.spectrum !== false; $('#uiWs').checked = S.ui.presetWash !== false; $('#uiSn').checked = S.ui.uiSounds !== false;
  document.querySelectorAll('#thSw button').forEach(b => b.classList.toggle('on', b.dataset.t === (S.ui.theme || 'auto')));
  document.querySelectorAll('#stSw button').forEach(b => b.classList.toggle('on', b.dataset.s === (S.ui.style || 'amoled')));
  document.querySelectorAll('#lgSw button').forEach(b => b.classList.toggle('on', b.dataset.l === (S.ui.lang || 'pt')));
  document.querySelectorAll('#nfAnim button').forEach(b => b.classList.toggle('on', b.dataset.v === (S.notify.anim || 'slide')));
  const as = S.autostart || {};
  $('#asEn').checked = !!as.on; $('#asEn').disabled = !as.available; $('#trayEn').checked = !!S.closeToTray;
  const st = S.startup || { afterIntro: 'tray', delay: 3 };
  document.querySelectorAll('#stAfter button').forEach(b => b.classList.toggle('on', b.dataset.v === st.afterIntro));
  $('#stDelayRow').style.display = st.afterIntro === 'tray' ? '' : 'none';
  if (stDelEl && !stDelEl.isDrag()) stDelEl.set(Math.round(st.delay / 30 * 100)); $('#stDelV').textContent = st.delay === 0 ? 'na hora' : st.delay + ' s';
  document.querySelectorAll('#sgBox .stup').forEach(r => r.style.opacity = as.on || !as.available ? 1 : .5);
  $('#asSub').textContent = as.available ? 'Abre o hub na tela, com a abertura animada, ao ligar o PC — sem pedir permissão.' : 'Disponível na versão instalada (aqui você está em modo de desenvolvimento).';
  $('#asErr').hidden = !as.error; $('#asErr').textContent = as.error || '';
  $('#jgDet').checked = S.detectGeneric !== false;
  $('#asw').checked = S.audioSwitch !== false;
  $('#bkAuto').textContent = 'O hub guarda sozinho uma cópia por dia (as 7 últimas).' + (S.lastBackup ? ' Última: ' + S.lastBackup.split('-').reverse().join('/') + '.' : '');
  const links = S.profiles.filter(p => p.userExe && p.userExe.length);
  $('#jgLinks').innerHTML = links.length ? links.map(p => `<div class="lkrow"><div><b>${esc(p.name)}</b> <em>${p.userExe.map(esc).join(', ')}</em></div><button class="ghost" data-open="${p.id}" style="padding:5px 12px;font-size:12px">Gerenciar</button></div>`).join('')
    : '<div class="lkrow"><em>Nenhum ainda. Use o botão de corrente no card de um jogo (aba Jogos) se algum não for reconhecido sozinho.</em></div>';
  document.querySelectorAll('#jgLinks [data-open]').forEach(b => b.onclick = () => openLink(b.dataset.open));
  $('#sbVer').textContent = 'Versão ' + (S.version || '');
  $('#sbDev').textContent = S.device && S.device.connected ? (S.device.name || 'Fuxi H3') + ' · conectado' : 'Fuxi H3 · desconectado';
  const en = S.engine || {}; $('#sbEng').textContent = en.installed ? (en.linked ? 'Equalizer APO · ativo' : 'Equalizer APO · instalado') : 'Equalizer APO · não instalado';
}

// ---------- ajustes: avisos no canto da tela ----------
const NF_TYPES = [
  ['game', 'Jogo detectado', 'Nome do jogo e o preset aplicado, com a mini curva do equalizador'],
  ['gameEnd', 'Jogo encerrado', 'Mostra para qual preset o som voltou'],
  ['device', 'Fuxi conectado ou desconectado', 'Quando você pluga ou desplugua o fone'],
  ['preset', 'Troca de preset', 'Quando o preset muda por atalho ou pela bandeja'],
  ['mic', 'Microfone', 'Quando o microfone é mutado ou reativado']
];
let nfUi = null;
function renderSettings() {
  const n = S && S.notify; if (!n) return;
  if (!nfUi) {
    $('#nfBox').innerHTML = `
      <div class="card"><h3>Avisos no canto da tela</h3>
        <div class="srow"><div class="lb"><b>Mostrar avisos</b><small>Aparecem por cima do jogo (em tela cheia sem bordas) e não roubam o clique nem o foco.</small></div>
          <label class="switch"><span>Avisos</span><input type="checkbox" id="nfEnabled"><i></i></label></div>
        <div class="sec">Quando avisar</div>
        ${NF_TYPES.map(([k, t, d]) => `<div class="srow"><div class="lb"><b>${t}</b><small>${d}</small></div><label class="switch"><span>${t}</span><input type="checkbox" data-t="${k}"><i></i></label></div>`).join('')}
        <div class="sec">Durante o jogo</div>
        <div class="srow"><div class="lb"><b>Não incomodar jogando</b><small>Com um jogo aberto, só aparecem a entrada e a saída do jogo. Os outros avisos ficam escondidos, exceto os que você permitir abaixo.</small></div>
          <label class="switch"><span>Não incomodar</span><input type="checkbox" id="nfDnd"><i></i></label></div>
        ${[['mic', 'Microfone mutado ou ativo'], ['preset', 'Troca de preset'], ['device', 'Fuxi conectado ou desconectado']].map(([k, t]) => `<div class="srow dndrow"><div class="lb"><b>Ainda mostrar: ${t}</b></div><label class="switch"><span>${t}</span><input type="checkbox" data-da="${k}"><i></i></label></div>`).join('')}
        <div class="sec">Aparência</div>
        <div class="srow"><div class="lb"><b>Posição</b><small>Canto da tela principal</small></div>
          <div class="posbox"><button data-p="top-left" title="Superior esquerdo"></button><button data-p="top-right" title="Superior direito"></button><button data-p="bottom-left" title="Inferior esquerdo"></button><button data-p="bottom-right" title="Inferior direito"></button></div></div>
        <div class="srow"><div class="lb"><b>Estilo</b><small>Completo mostra imagem do jogo e a mini curva; compacto é só texto</small></div>
          <div class="seg" id="nfStyle"><button data-v="full">Completo</button><button data-v="compact">Compacto</button></div></div>
        <div class="srow"><div class="lb"><b>Tempo na tela</b></div><div class="ctl"><span id="nfDurSl"></span><span class="vv" id="nfDurV"></span></div></div>
        <div class="sec">Som</div>
        <div class="srow"><div class="lb"><b>Som nos avisos</b><small>Notas curtas e suaves, diferentes para cada tipo de aviso</small></div>
          <label class="switch"><span>Som</span><input type="checkbox" id="nfSound"><i></i></label></div>
        <div class="srow"><div class="lb"><b>Som de entrada de cada jogo</b><small>Cada jogo abre com uma assinatura sonora própria (inspirada no clima dele). Para usar um som seu, ponha um arquivo com o nome do jogo (por exemplo gow.mp3) na pasta de sons.</small></div>
          <div class="ctl"><button class="ghost" id="nfSndDir" style="padding:6px 12px;font-size:12px">Pasta de sons</button><label class="switch"><span>Som por jogo</span><input type="checkbox" id="nfGameSnd"><i></i></label></div></div>
        <div class="srow"><div class="lb"><b>Volume dos avisos</b></div><div class="ctl"><span id="nfVolSl"></span><span class="vv" id="nfVolV"></span></div></div>
        <div class="sec">Testar</div>
        <div class="tests">
          <button class="ghost" data-test="game">Jogo detectado</button><button class="ghost" data-test="gameEnd">Jogo encerrado</button>
          <button class="ghost" data-test="deviceOn">Fuxi conectado</button><button class="ghost" data-test="deviceOff">Fuxi desconectado</button>
          <button class="ghost" data-test="preset">Troca de preset</button><button class="ghost" data-test="micOff">Mic mutado</button><button class="ghost" data-test="micOn">Mic ativo</button>
        </div>
      </div>`;
    const set = p => hub.setNotify(p);
    nfUi = { en: $('#nfEnabled'), snd: $('#nfSound') };
    nfUi.en.onchange = e => set({ enabled: e.target.checked });
    nfUi.snd.onchange = e => set({ sound: e.target.checked });
    document.querySelectorAll('#nfBox [data-t]').forEach(c => c.onchange = e => set({ types: { [c.dataset.t]: e.target.checked } }));
    $('#nfDnd').onchange = e => set({ dnd: e.target.checked });
    $('#nfGameSnd').onchange = e => set({ gameSounds: e.target.checked });
    $('#nfSndDir').onclick = () => hub.openSoundsFolder();
    document.querySelectorAll('#nfBox [data-da]').forEach(c => c.onchange = e => set({ dndAllow: { ...S.notify.dndAllow, [c.dataset.da]: e.target.checked } }));
    document.querySelectorAll('#nfBox [data-p]').forEach(b => b.onclick = () => { set({ position: b.dataset.p }); hub.testNotify('preset'); });
    document.querySelectorAll('#nfStyle button').forEach(b => b.onclick = () => { set({ style: b.dataset.v }).then(() => hub.testNotify('game')); });
    $('#gmBox').innerHTML = `<div class="card"><h3>Prévia do modo de jogo</h3>
        <div class="srow"><div class="lb"><b>Escolha um jogo e veja a entrada e a saída</b><small>Com a foto do jogo, quando ela estiver na pasta de imagens; senão aparece a sigla colorida. O aviso surge no canto da tela.</small></div>
          <div class="ctl"><select id="gmPick" class="sel"></select></div></div>
        <div class="tests"><button class="ghost" id="gmIn">▶ Entrada</button><button class="ghost" id="gmOut">▶ Saída</button><button class="ghost" id="gmBoth">▶ Entrada e saída</button></div></div>`;
    const gm = $('#gmPick'), gid = () => gm.value;
    gm.innerHTML = S.profiles.filter(p => p.exe).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    document.querySelectorAll('#nfBox [data-test]').forEach(b => b.onclick = () => hub.testNotify(b.dataset.test, gid()));
    $('#gmIn').onclick = () => hub.testNotify('game', gid());
    $('#gmOut').onclick = () => hub.testNotify('gameEnd', gid());
    $('#gmBoth').onclick = () => { hub.testNotify('game', gid()); setTimeout(() => hub.testNotify('gameEnd', gid()), Math.max(3500, S.notify.duration * 1000 - 500)); };
    let tDur = null;
    nfUi.dur = slider(0, v => { const s = Math.round(2 + v / 100 * 10); $('#nfDurV').textContent = s + ' s'; clearTimeout(tDur); tDur = setTimeout(() => set({ duration: s }), 150); });
    nfUi.vol = slider(0, v => { $('#nfVolV').textContent = v + '%'; clearTimeout(tDur); tDur = setTimeout(() => { set({ volume: v / 100 }); hub.testNotify('preset'); }, 250); });
    $('#nfDurSl').replaceWith(nfUi.dur); $('#nfVolSl').replaceWith(nfUi.vol);
  }
  nfUi.en.checked = n.enabled; nfUi.snd.checked = n.sound;
  document.querySelectorAll('#nfBox [data-t]').forEach(c => { c.checked = !!n.types[c.dataset.t]; });
  $('#nfDnd').checked = n.dnd !== false; $('#nfGameSnd').checked = n.gameSounds !== false;
  document.querySelectorAll('#nfBox [data-da]').forEach(c => { c.checked = !!(n.dndAllow && n.dndAllow[c.dataset.da]); });
  document.querySelectorAll('#nfBox .dndrow').forEach(r => r.style.opacity = n.dnd !== false ? 1 : .4);
  document.querySelectorAll('#nfBox [data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === n.position));
  document.querySelectorAll('#nfStyle button').forEach(b => b.classList.toggle('on', b.dataset.v === n.style));
  nfUi.dur.set(Math.round((n.duration - 2) / 10 * 100)); $('#nfDurV').textContent = n.duration + ' s';
  nfUi.vol.set(Math.round(n.volume * 100)); $('#nfVolV').textContent = Math.round(n.volume * 100) + '%';
}

// ---------- abertura: escolha e prévia ----------
$('#brandMark').innerHTML = fuxiMark('hd', 'bm');
let inUi = null;
function renderIntro() {
  const cur = S && S.intro; if (!cur) return;
  if (!inUi) {
    const tiles = Object.entries(window.INTRO_STYLES).map(([k, d]) => `<div class="itile" data-k="${k}"><b>${d.name}<em>Em uso</em></b><small>${d.desc}</small>
      <div class="irow"><button class="ghost" data-play="${k}">▶ Prévia</button><button class="ghost use" data-use="${k}">Usar</button></div></div>`).join('') +
      `<div class="itile" data-k="off"><b>Nenhuma<em>Em uso</em></b><small>O app abre direto, sem animação.</small><div class="irow"><button class="ghost use" data-use="off">Usar</button></div></div>`;
    $('#inBox').innerHTML = `<div class="card"><h3>Abertura do app</h3>
      <div class="srow"><div class="lb"><b>Animação ao abrir o Fuxi Hub</b><small>Escolha um estilo e veja a prévia. Clique na tela ou aperte Esc para pular na hora. Quando o hub abre sozinho com o Windows, a abertura não toca.</small></div>
        <label class="switch"><span>Som</span><input type="checkbox" id="inSound"><i></i></label></div>
      <div class="itiles">${tiles}</div></div>`;
    $('#inSound').onchange = e => hub.setIntro({ sound: e.target.checked });
    document.querySelectorAll('#inBox [data-use]').forEach(b => b.onclick = () => { hub.setIntro({ style: b.dataset.use }); if (b.dataset.use !== 'off') playIntro(b.dataset.use, { preview: true, sound: S.intro.sound && !S.noSound, volume: S.notify.volume }); });
    document.querySelectorAll('#inBox [data-play]').forEach(b => b.onclick = () => playIntro(b.dataset.play, { preview: true, sound: S.intro.sound && !S.noSound, volume: S.notify.volume }));
    inUi = true;
  }
  $('#inSound').checked = cur.sound;
  document.querySelectorAll('#inBox .itile').forEach(t => t.classList.toggle('on', t.dataset.k === cur.style));
}

// ---------- estado ----------
let introDone = false;
function onState(s) {
  const editing = page === 'eq';
  const keep = draft;
  S = s;
  if (!prof(editId)) editId = 'default';
  if (window.Tour) Tour.onState();
  renderHome(); renderGames(); renderEq(); renderSettings(); renderHotkeys(); renderLinkChips(); renderIntro(); renderConfig(); renderRules(); renderCloud(); renderSurround();
  if (window.Fx2) Fx2.onState(); if (window.Stats) Stats.render(); if (window.BadgeUi) BadgeUi.render(); if (window.MicUi) MicUi.render(); if (window.UpdUi) UpdUi.render(); if (window.RemoteUi) RemoteUi.render();
  if (!introDone) {                                              // abertura: só na primeira vez que o estado chega
    introDone = true;
    // quando a abertura termina (ou não há abertura), avisa o main: se o hub abriu com o Windows, ele decide se fica na tela ou vai para a bandeja
    const after = () => {
      hub.startupIntroDone();
      if (S.tutorial && !S.tutorial.done && !S.skipIntro && window.Tour && !window.__noTour) setTimeout(() => Tour.start(), 500);     // primeira abertura: tutorial (espera o Fuxi H3 ser reconhecido)
      const touch = () => { hub.startupTouched(); document.removeEventListener('pointerdown', touch, true); document.removeEventListener('keydown', touch, true); };
      setTimeout(() => { document.addEventListener('pointerdown', touch, true); document.addEventListener('keydown', touch, true); }, 80);
    };
    if (S.intro && S.intro.style !== 'off' && !S.skipIntro && !(S.ui && S.ui.reduceMotion)) playIntro(S.intro.style, { sound: S.intro.sound && !S.noSound, volume: S.notify.volume, onEnd: after });
    else after();
  }
  if (page !== 'device' || !$('#bHid')) renderDevice(); else { /* evita apagar o log do HID */ }
  if (!keep || !editing) loadDraft(editId); else draft = keep;
}
hub.onState(onState);
hub.getState().then(onState);
