// Lê a página do xCloud / GeForce NOW e manda um resumo para o background (que fala com o Fuxi Hub, neste PC).
(() => {
  const host = location.hostname, svc = /xbox\.com$/.test(host) ? 'xcloud' : 'gfn';
  const pretty = s => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
  function read() {
    const v = [...document.querySelectorAll('video')].find(x => x.videoWidth > 300 && !x.paused && !x.ended && x.readyState > 2);   // há vídeo de jogo rodando
    let game = '', playing = !!v;
    if (svc === 'xcloud') {
      const m = location.pathname.match(/\/play\/(launch|games)\/([^\/]+)\/([A-Za-z0-9]{8,14})/);
      if (m) { game = pretty(decodeURIComponent(m[2])); if (m[1] === 'launch') playing = playing || !!v; }
      if (m && m[1] === 'games') playing = false;                                        // página do jogo na biblioteca: só navegando
    } else {
      const og = document.querySelector('meta[property="og:title"]');
      game = (og && og.content) || '';
    }
    return { svc, state: playing ? 'playing' : 'browsing', game, title: document.title, url: location.origin + location.pathname };
  }
  const send = () => { try { chrome.runtime.sendMessage({ type: 'state', data: read() }); } catch {} };
  send(); setInterval(send, 4000);
  addEventListener('pagehide', () => { try { chrome.runtime.sendMessage({ type: 'closed', svc }); } catch {} });
})();
