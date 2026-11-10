// Configurações → Avisos: selo de jogo ativo (ícone discreto no canto da tela enquanto o jogo roda)
(function () {
  const Q = s => document.querySelector(s);
  const POS = [['top-left', 'Superior esquerdo'], ['top-right', 'Superior direito'], ['bottom-left', 'Inferior esquerdo'], ['bottom-right', 'Inferior direito']];
  let built = false;
  function build() {
    if (built || !Q('#bgBox')) return; built = true;
    Q('#bgBox').innerHTML = `<div class="card"><h3>Selo de jogo ativo</h3>
      <div class="srow" style="border-top:0"><div class="lb"><b>Mostrar um selo enquanto o jogo roda</b><small>Depois do aviso de entrada, um ícone pequeno e discreto fica num canto da tela, só para você saber que o Fuxi Hub está ativo. Não pega clique nem foco e some quando o jogo fecha.</small></div>
        <label class="switch"><span>Selo</span><input type="checkbox" id="bgOn"><i></i></label></div>
      <div class="srow stk"><div class="lb"><b>Canto da tela</b></div><div class="bgpos" id="bgPos">${POS.map(([k, t]) => `<button data-p="${k}" title="${t}"><i></i></button>`).join('')}</div></div>
      <div class="srow"><div class="lb"><b>Animação</b><small>Pulso: ondas suaves de tempos em tempos · Piscar: some e volta devagar · Fixo: parado.</small></div>
        <div class="seg" id="bgSt"><button data-v="pulse">Pulso</button><button data-v="blink">Piscar</button><button data-v="steady">Fixo</button></div></div>
      <div class="srow"><div class="lb"><b>Tamanho</b></div><div class="seg" id="bgSz"><button data-v="small">Pequeno</button><button data-v="normal">Normal</button></div></div>
      <div class="srow"><div class="lb"><b>Também para Spotify e YouTube</b><small>Mostra o logo do serviço quando o preset de música ou vídeo está ativo.</small></div>
        <label class="switch"><span>Mídia</span><input type="checkbox" id="bgMd"><i></i></label></div>
      <div class="btns"><button class="ghost" id="bgTest">Testar por 7 segundos</button></div></div>
      <div class="card"><h3>Tocando agora</h3>
      <div class="srow" style="border-top:0"><div class="lb"><b>Disco girando no canto da tela</b><small>Quando o Spotify está tocando, um disco pequeno gira num canto da tela. A cada música nova ele dá uma voltinha, troca a capa e mostra o nome por alguns segundos. No app do Spotify mostra o logo; na versão web (com a extensão) mostra a capa do álbum.</small></div>
        <label class="switch"><span>Disco</span><input type="checkbox" id="npOn"><i></i></label></div>
      <div class="srow stk"><div class="lb"><b>Canto da tela</b></div><div class="bgpos" id="npPos">${POS.map(([k, t]) => `<button data-p="${k}" title="${t}"><i></i></button>`).join('')}</div></div>
      <div class="srow"><div class="lb"><b>Tamanho</b></div><div class="seg" id="npSz"><button data-v="small">Pequeno</button><button data-v="normal">Normal</button></div></div>
      <div class="srow"><div class="lb"><b>Mostrar o nome da música</b><small>Artista e título aparecem ao lado do disco quando a música muda.</small></div>
        <label class="switch"><span>Nome</span><input type="checkbox" id="npTi"><i></i></label></div>
      <div class="srow"><div class="lb"><b>Também para o YouTube</b><small>Mostra o disco com o vídeo que está tocando (precisa da extensão do navegador).</small></div>
        <label class="switch"><span>YouTube</span><input type="checkbox" id="npYt"><i></i></label></div>
      <div class="btns"><button class="ghost" id="npTest">Testar por 13 segundos</button></div></div>`;
    Q('#bgOn').onchange = e => hub.setBadge({ enabled: e.target.checked });
    Q('#bgMd').onchange = e => hub.setBadge({ media: e.target.checked });
    document.querySelectorAll('#bgPos button').forEach(b => b.onclick = () => { hub.setBadge({ pos: b.dataset.p }).then(() => hub.testBadge()); });
    document.querySelectorAll('#bgSt button').forEach(b => b.onclick = () => { hub.setBadge({ style: b.dataset.v }).then(() => hub.testBadge()); });
    document.querySelectorAll('#bgSz button').forEach(b => b.onclick = () => { hub.setBadge({ size: b.dataset.v }).then(() => hub.testBadge()); });
    Q('#bgTest').onclick = () => hub.testBadge();
    Q('#npOn').onchange = e => hub.setNowPlaying({ enabled: e.target.checked });
    Q('#npTi').onchange = e => hub.setNowPlaying({ showTitle: e.target.checked });
    Q('#npYt').onchange = e => hub.setNowPlaying({ youtube: e.target.checked });
    document.querySelectorAll('#npPos button').forEach(b => b.onclick = () => hub.setNowPlaying({ pos: b.dataset.p }).then(() => hub.testNp()));
    document.querySelectorAll('#npSz button').forEach(b => b.onclick = () => hub.setNowPlaying({ size: b.dataset.v }).then(() => hub.testNp()));
    Q('#npTest').onclick = () => hub.testNp();
  }
  function render() {
    if (!S || !S.badgeCfg) return; build(); if (!built) return; const c = S.badgeCfg;
    Q('#bgOn').checked = c.enabled; Q('#bgMd').checked = c.media;
    document.querySelectorAll('#bgPos button').forEach(b => b.classList.toggle('on', b.dataset.p === c.pos));
    document.querySelectorAll('#bgSt button').forEach(b => b.classList.toggle('on', b.dataset.v === c.style));
    document.querySelectorAll('#bgSz button').forEach(b => b.classList.toggle('on', b.dataset.v === c.size));
    const n = S.npCfg; if (n) {
      Q('#npOn').checked = n.enabled; Q('#npTi').checked = n.showTitle; Q('#npYt').checked = n.youtube;
      document.querySelectorAll('#npPos button').forEach(b => b.classList.toggle('on', b.dataset.p === n.pos));
      document.querySelectorAll('#npSz button').forEach(b => b.classList.toggle('on', b.dataset.v === n.size));
    }
  }
  window.BadgeUi = { render };
})();
