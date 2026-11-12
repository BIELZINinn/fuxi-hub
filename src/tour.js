// Tutorial de primeira abertura. Só começa depois que o Fuxi H3 for reconhecido (antes disso mostra o pedido para conectar o fone).
// Cada etapa abre a aba de verdade por trás, destaca o botão da aba e o elemento principal dela, e mostra uma ilustração animada.
(function () {
  const $$ = s => document.querySelector(s);
  const svg = inner => `<svg viewBox="0 0 230 124">${inner}</svg>`;
  const HP = (x = 115, y = 62, k = 1) => `<g transform="translate(${x} ${y}) scale(${k}) translate(-40 -34)"><path class="tw" d="M6 44V38a34 34 0 0168 0v6"/><rect class="tw" x="2" y="42" width="14" height="28" rx="6"/><rect class="tw" x="64" y="42" width="14" height="28" rx="6"/></g>`;
  const rings = (x = 115, y = 62) => [0, 1, 2].map(() => `<circle class="tw t-ring" cx="${x}" cy="${y}" r="46"/>`).join('');
  const gear = () => { let t = ''; for (let i = 0; i < 8; i++) t += `<rect class="tf" x="112" y="30" width="6" height="12" rx="2" transform="rotate(${i * 45} 115 62)"/>`; return `<g class="t-spin">${t}<circle class="tw" cx="115" cy="62" r="22"/><circle class="tw" cx="115" cy="62" r="9"/></g>`; };
  const ART = {
    gate: svg(`${rings(84, 62)}${HP(84, 62, 1.1)}<g class="t-slide"><rect class="tf" x="150" y="55" width="26" height="14" rx="4"/><path class="tw" d="M176 62h40"/></g><circle class="tf t-blink" cx="150" cy="62" r="3"/>`),
    welcome: svg(`${rings()}<g class="t-float">${HP(115, 62, 1.25)}</g>`),
    home: svg(`<g class="t-float">${HP(115, 50, .9)}</g>${[[88, '#e6e6ea', 0], [115, '#f4f4f6', .5], [142, '#2a2a30', 1]].map(([x, c, d]) => `<circle class="t-pop" cx="${x}" cy="108" r="7" fill="${c}" stroke="#2c3a3d" style="animation-delay:${d}s"/>`).join('')}`),
    eq: svg(`<path class="tm" d="M10 62h210"/>${[30, 56, 70, 40, 28, 48, 66, 38, 58, 34].map((h, i) => `<rect class="tf t-bar" x="${14 + i * 21}" y="${112 - h * 1.3}" width="11" height="${h * 1.3}" rx="5" opacity=".85" style="animation-delay:${(i * .17).toFixed(2)}s"/>`).join('')}`),
    mixer: svg([0, 1, 2, 3].map(i => `<path class="tm" d="M30 ${24 + i * 24}h170"/><circle class="tf t-knob" cx="${60 + i * 8}" cy="${24 + i * 24}" r="7" style="--kx:${70 - i * 12}px;animation-delay:${i * .45}s"/>`).join('')),
    games: svg([0, 1, 2].map(i => `<g class="t-slide" style="animation-delay:${i * .35}s"><rect class="tw" x="${22 + i * 68}" y="26" width="58" height="72" rx="12"/><path class="tm" d="M${32 + i * 68} 82h38"/><circle class="tg t-blink" cx="${34 + i * 68}" cy="40" r="3.5" style="animation-delay:${i * .4}s"/></g>`).join('')),
    cloud: svg(`<g class="t-float"><path class="tw" d="M80 84a18 18 0 01-2-35.8A26 26 0 01128 44a20 20 0 0117 40z"/></g>${[0, 1, 2].map(i => `<path class="tw t-up" d="M${100 + i * 22} 92v-18M${94 + i * 22} 80l6-6 6 6" style="animation-delay:${i * .5}s"/>`).join('')}<circle class="tg t-pop" cx="176" cy="40" r="6"/><circle class="tf t-pop" cx="54" cy="44" r="5" style="animation-delay:.8s;fill:#76b900"/>`),
    settings: svg(`${gear()}${[0, 1, 2].map(i => `<g class="t-slide" style="animation-delay:${i * .5}s"><rect class="tw" x="176" y="${28 + i * 26}" width="30" height="14" rx="7"/><circle class="tf" cx="${i % 2 ? 183 : 199}" cy="${35 + i * 26}" r="4"/></g>`).join('')}`),
    device: svg(`${rings()}<circle class="tf" cx="115" cy="62" r="7"/><circle class="tg t-blink" cx="168" cy="38" r="4"/>`),
    stats: svg(`${[22, 44, 36, 62, 52, 80].map((h, i) => `<rect class="tf t-bar" x="${30 + i * 28}" y="${112 - h}" width="16" height="${h}" rx="6" opacity=".85" style="animation-delay:${i * .2}s"/>`).join('')}<path class="tw t-pop" d="M176 24l4 8 9 1.4-6.5 6.2 1.6 9L176 44l-8.1 4.6 1.6-9L163 33.4l9-1.4z"/>`),
    done: svg(`<circle class="tw" cx="115" cy="62" r="34" opacity=".5"/><path class="tw t-draw" d="M98 63l12 12 24-26"/>${[[60, 40], [170, 36], [78, 96], [160, 98], [38, 70], [196, 66]].map(([x, y], i) => `<circle class="tf t-conf" cx="${x}" cy="${y}" r="3.5" style="animation-delay:${i * .3}s"/>`).join('')}`)
  };
  const STEPS = [
    { art: 'welcome', title: 'Bem-vindo ao Fuxi Hub', text: 'Seu Fuxi H3 foi reconhecido. Vamos fazer uma volta rápida, de cerca de 1 minuto, por tudo o que o app faz. Você pode pular quando quiser e rever depois em Configurações → Sobre.', mid: true, next: 'Começar' },
    { art: 'home', page: 'home', nav: 'home', sel: '#hcols', title: 'Início', text: 'O seu fone e o preset em uso. Troque a cor do fone nas bolinhas e escolha um preset rápido embaixo.', tips: ['Bolinhas: branco, preto e branco ou preto', 'Padrão, Música, Filmes, Chamadas e Jogos: um toque para trocar'] },
    { art: 'eq', page: 'eq', nav: 'eq', sel: '.eqwrap', title: 'Equalizador', text: 'Equalização de verdade, aplicada pelo Equalizer APO em todo o som do Windows. São 10 faixas que você ajusta como quiser.', tips: ['Arraste o ponto: frequência e ganho. Roda do mouse: Q', 'Ouça ao vivo e compare A (sem EQ) com B (com EQ)', 'Salve como novo preset, exporte ou importe'] },
    { art: 'mixer', page: 'mixer', nav: 'mixer', sel: '#masterRow', title: 'Mixer por app', text: 'O volume de cada programa separado, mais o volume geral e o microfone. Ótimo para baixar o Discord sem mexer no jogo.', tips: ['Os apps aparecem quando estão tocando som', 'Botão Mudo para silenciar na hora'] },
    { art: 'games', page: 'games', nav: 'games', sel: '#p-games .ph .actions', title: 'Jogos', text: 'O hub percebe o jogo que você abre e troca o preset sozinho. Já vêm 20 jogos prontos, e qualquer outro jogo instalado também é reconhecido.', tips: ['Troca automática liga e desliga aqui em cima', 'Busca, favoritos e filtros por gênero', 'Clique em um jogo para editar o preset dele'] },
    { art: 'cloud', page: 'cloud', nav: 'cloud', sel: '#clNow', title: 'Cloud gaming', text: 'Reconhece jogos do Xbox Cloud Gaming e do GeForce NOW, no navegador e nos apps do Windows, e aplica o preset com um toque especial para streaming.', tips: ['Instale a extensão do navegador para identificar o jogo com precisão', 'O toque cloud compensa o som comprimido do streaming', 'Se o app não mostrar o jogo, use a sessão manual'] },
    { art: 'stats', page: 'stats', nav: 'stats', sel: '#stTiles', title: 'Seu perfil', text: 'Horas de jogo, sequência de dias, os jogos que você mais joga e conquistas para desbloquear.', tips: ['Calendário de atividade dos últimos meses', 'Conquistas aparecem com um aviso animado ao desbloquear'] },
    { art: 'settings', page: 'settings', nav: 'settings', sel: '#cfgNav', title: 'Configurações', text: 'Tudo o que dá para personalizar, separado por seção.', tips: ['Surround virtual em 3 níveis de intensidade', 'Regras por programa, atalhos globais e avisos na tela', 'Backup, início com o Windows e “não incomodar jogando”'] },
    { art: 'device', page: 'device', nav: 'device', sel: '#devcards', title: 'Dispositivo', text: 'O estado do fone e do motor de equalização, com atalhos para o configurador do fabricante e para o diagnóstico.', tips: ['Conferir se o Equalizer APO está registrado no fone', 'Monitor de dados do fone, para quem gosta de ver os bastidores'] },
    { art: 'done', page: 'home', title: 'Tudo pronto!', text: 'O hub fica na bandeja, perto do relógio, e segue trocando o preset por jogo. Clique com o botão direito no ícone para sair de vez.', tips: ['Rever este tutorial: Configurações → Sobre', 'Bom jogo!'], mid: true, next: 'Concluir' }
  ];
  let el = null, idx = -1, active = false, gate = false, spotTimer = null;

  function build() {
    if (el) return;
    el = document.createElement('div'); el.id = 'tour';
    el.innerHTML = `<div class="tsp none"></div><div class="tcard"><div class="tart"></div><div class="tbody"></div><div class="tfoot"><div class="tdots"></div><div class="tbtns"></div></div></div>`;
    document.body.appendChild(el);
    document.addEventListener('keydown', e => {
      if (!active || gate) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
      else if (e.key === 'Escape') finish(false);
    });
    addEventListener('resize', () => { if (active && !gate) place(); });
  }
  const spot = (r, pad = 10) => {
    const s = el.querySelector('.tsp');
    if (!r) { s.classList.add('none'); s.style.cssText = `left:${innerWidth / 2}px;top:${innerHeight / 2}px;width:0;height:0`; return; }
    s.classList.remove('none');
    s.style.left = (r.left - pad) + 'px'; s.style.top = (r.top - pad) + 'px'; s.style.width = (r.width + pad * 2) + 'px'; s.style.height = (r.height + pad * 2) + 'px';
  };
  function place() {
    const st = STEPS[idx]; if (!st) return;
    document.querySelectorAll('.nav.tourhl').forEach(n => n.classList.remove('tourhl'));
    const nav = st.nav && document.querySelector(`.nav[data-page="${st.nav}"]`);
    clearTimeout(spotTimer);
    if (nav) { nav.classList.add('tourhl'); spot(nav.getBoundingClientRect(), 8); }
    else spot(null);
    const q = st.sel && document.querySelector(st.sel);
    if (q) spotTimer = setTimeout(() => { if (!active || STEPS[idx] !== st) return; q.scrollIntoView({ block: 'nearest' }); spot(q.getBoundingClientRect(), 10); }, 700);   // espera a aba terminar de entrar
  }
  function dots() {
    el.querySelector('.tdots').innerHTML = STEPS.map((_, i) => `<i class="${i === idx ? 'on' : i < idx ? 'done' : ''}" data-i="${i}"></i>`).join('');
    el.querySelectorAll('.tdots i').forEach(d => d.onclick = () => show(+d.dataset.i));
  }
  function show(i) {
    if (i < 0) i = 0;
    if (i >= STEPS.length) return finish(true);
    gate = false; idx = i; const st = STEPS[i], card = el.querySelector('.tcard');
    card.classList.toggle('mid', !!st.mid);
    if (st.page && window.go) go(st.page);
    const art = el.querySelector('.tart'), body = el.querySelector('.tbody');
    art.innerHTML = ART[st.art]; body.innerHTML = `<div class="tstep">${i === 0 || i === STEPS.length - 1 ? 'Fuxi Hub' : `Etapa ${i} de ${STEPS.length - 2}`}</div><h2>${st.title}</h2><p>${st.text}</p>${st.tips ? `<ul class="ttips">${st.tips.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}`;
    body.classList.remove('tswap'); void body.offsetWidth; body.classList.add('tswap');
    const last = i === STEPS.length - 1;
    el.querySelector('.tbtns').innerHTML = `${last ? '' : '<button class="tskip" id="tSkip">Pular</button>'}${i > 0 && !last ? '<button class="ghost" id="tBack">Voltar</button>' : ''}<button class="solid" id="tNext">${st.next || 'Próximo'}</button>`;
    const sk = $$('#tSkip'); if (sk) sk.onclick = () => finish(false);
    const bk = $$('#tBack'); if (bk) bk.onclick = () => show(idx - 1);
    $$('#tNext').onclick = next;
    dots(); place();
  }
  const next = () => show(idx + 1);
  function finish(done) {
    active = false; gate = false; clearTimeout(spotTimer);
    document.querySelectorAll('.nav.tourhl').forEach(n => n.classList.remove('tourhl'));
    el.classList.remove('on'); if (window.go) go('home');
    if (done) hub.setTutorial(true);
  }
  // tela de espera: o tutorial só começa quando o Fuxi H3 for reconhecido
  function showGate() {
    gate = true; idx = -1; spot(null);
    const card = el.querySelector('.tcard'); card.classList.add('mid');
    el.querySelector('.tart').innerHTML = ART.gate;
    el.querySelector('.tbody').innerHTML = `<div class="tstep">Primeiro passo</div><h2>Conecte o seu Fuxi H3</h2><p>Ligue o fone ao PC (cabo USB ou o adaptador 2.4G). O tutorial começa sozinho assim que o hub reconhecer o fone.</p><ul class="ttips"><li id="tGateSt">Procurando o Fuxi H3…</li></ul>`;
    el.querySelector('.tbody').classList.remove('tswap'); void el.querySelector('.tbody').offsetWidth; el.querySelector('.tbody').classList.add('tswap');
    el.querySelector('.tdots').innerHTML = '';
    el.querySelector('.tbtns').innerHTML = '<button class="tskip" id="tGateSkip">Fazer isso depois</button>';
    $$('#tGateSkip').onclick = () => { active = false; gate = false; el.classList.remove('on'); };    // não marca como feito: o pedido volta na próxima abertura
  }
  function start(force) {
    build(); if (active && !force) return;
    active = true; el.classList.add('on');
    if (typeof S !== 'undefined' && S && S.device && S.device.known) show(0); else showGate();
  }
  function onState() {
    if (!active || !gate) return;
    const d = S && S.device, st = $$('#tGateSt');
    if (st) st.textContent = d && d.connected && !d.known ? 'Um fone foi encontrado, mas não é um Fuxi H3.' : 'Procurando o Fuxi H3…';
    if (d && d.known) setTimeout(() => { if (active && gate) show(0); }, 900);       // pequena pausa para o usuário ver que conectou
  }
  window.Tour = { start, onState, isActive: () => active, replay: () => start(true), steps: STEPS };
})();
