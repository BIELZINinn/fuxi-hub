// Avisa o Fuxi Hub (neste PC) quando o Spotify Web ou o YouTube estão abertos, se estão tocando e o que está tocando.
(() => {
  const site = location.hostname === 'open.spotify.com' ? 'spotify' : 'youtube';
  function playing() {
    if (site === 'youtube') {
      if (!/^\/(watch|shorts|live)/.test(location.pathname)) return false;           // prévias mudas da página inicial não contam
      const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
      return !!v && !v.paused && !v.ended && v.readyState > 2;
    }
    const b = document.querySelector('[data-testid="control-button-playpause"]');      // no Spotify Web o botão vira "Pausar" quando está tocando
    return !!b && /paus/i.test(b.getAttribute('aria-label') || '');
  }
  function meta() {                                                                    // título, artista e capa que o próprio site publica para o Windows
    try {
      const md = navigator.mediaSession && navigator.mediaSession.metadata; if (!md) return {};
      const art = (md.artwork || []).filter(a => /^https:\/\//.test(a.src || '')).sort((a, b) => (parseInt(b.sizes) || 0) - (parseInt(a.sizes) || 0))[0];
      return { track: String(md.title || '').slice(0, 120), artist: String(md.artist || '').slice(0, 120), art: art ? art.src.slice(0, 300) : '' };
    } catch { return {}; }
  }
  const send = () => { try { chrome.runtime.sendMessage({ type: 'media', data: { site, state: playing() ? 'playing' : 'open', title: document.title, ...meta() } }); } catch {} };
  send(); setInterval(send, 3000);
  addEventListener('pagehide', () => { try { chrome.runtime.sendMessage({ type: 'mediaClosed', site }); } catch {} });
})();