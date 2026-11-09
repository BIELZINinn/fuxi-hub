// Emblemas originais dos dois serviços (inspirados nas cores de cada um; não são as logos oficiais).
// Para usar as oficiais: coloque xcloud.png / gfn.png na pasta de imagens do hub (Jogos > Pasta de imagens > pasta "services").
(function (root) {
  const COL = { xcloud: '#3ddc5a', gfn: '#76b900' };
  const xcloud = (s = 48) => `<svg class="cmk" viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true">
    <defs><radialGradient id="xg1" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="#8dff9e"/><stop offset=".55" stop-color="#1fb83c"/><stop offset="1" stop-color="#0a5a1c"/></radialGradient>
    <linearGradient id="xg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#d8ffe0" stop-opacity=".8"/></linearGradient></defs>
    <circle cx="32" cy="32" r="29" fill="url(#xg1)"/><circle cx="32" cy="32" r="29" fill="none" stroke="#b6ffc2" stroke-opacity=".35" stroke-width="1.2"/>
    <path d="M17 22c5 3 9 8 15 14s11 11 15 15" fill="none" stroke="url(#xg2)" stroke-width="5.6" stroke-linecap="round"/>
    <path d="M47 22c-5 3-9 8-15 14s-10 11-15 15" fill="none" stroke="url(#xg2)" stroke-width="5.6" stroke-linecap="round"/>
    <path d="M20 17.5a8 8 0 0113.5-3.5 6.5 6.5 0 0111 4" fill="none" stroke="#eaffee" stroke-width="2.4" stroke-linecap="round" opacity=".9"/></svg>`;
  const gfn = (s = 48) => `<svg class="cmk" viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true">
    <defs><linearGradient id="gg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b5ee3b"/><stop offset=".5" stop-color="#76b900"/><stop offset="1" stop-color="#3f6a00"/></linearGradient></defs>
    <rect x="3" y="3" width="58" height="58" rx="17" fill="#0b0d08"/><rect x="3" y="3" width="58" height="58" rx="17" fill="none" stroke="url(#gg1)" stroke-width="2.4"/>
    <path d="M19 43a9 9 0 01-1.4-17.9A12.5 12.5 0 0142 22.5 9.5 9.5 0 0144 43z" fill="url(#gg1)"/>
    <path d="M34.5 25.5 26 37h6.2l-2 8.5L40 33.6h-6.3z" fill="#0b0d08"/></svg>`;
  // logos reais (recortadas das imagens que você enviou); se o arquivo faltar, cai nos emblemas desenhados acima
const real = (svc, s) => `<img class="cmk real ${svc}" src="../assets/services/${svc === 'gfn' ? 'gfn' : 'xcloud'}-badge.png" width="${s}" height="${s}" alt="" onerror="this.outerHTML=CLOUDMARK.drawn('${svc}',${s})">`;
  const drawn = (svc, s) => (svc === 'gfn' ? gfn(s) : xcloud(s));
  const mark = real;
  root.CLOUDMARK = { xcloud: s => real('xcloud', s), gfn: s => real('gfn', s), drawn, mark, COL };
})(typeof window !== 'undefined' ? window : globalThis);
