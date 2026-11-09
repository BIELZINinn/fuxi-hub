// Gera os arquivos da marca a partir de src/mark.js: ícone do app (PNG + ICO multi-tamanho), marca transparente e ícone da bandeja.
// Uso: electron tools/brand.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
app.commandLine.appendSwitch('no-sandbox');
app.on('window-all-closed', () => {});                                // senão o app fecha quando a primeira janela de render é destruída
require('../src/mark.js');
const ROOT = path.join(__dirname, '..'), BR = path.join(ROOT, 'assets', 'brand'), BUILD = path.join(ROOT, 'build');
fs.mkdirSync(BR, { recursive: true }); fs.mkdirSync(BUILD, { recursive: true });

const inner = svg => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const mark = globalThis.fuxiMark('b');
const markSvg = mark;                                                // marca sozinha, fundo transparente
const iconSvg = `<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="bgb" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#14181f"/><stop offset="1" stop-color="#050507"/></radialGradient>
  <linearGradient id="bd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2ef2ff" stop-opacity=".75"/><stop offset="1" stop-color="#8a6dff" stop-opacity=".45"/></linearGradient>
  <filter id="gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect x="6" y="6" width="244" height="244" rx="58" fill="url(#bgb)"/>
<rect x="7.5" y="7.5" width="241" height="241" rx="56.5" fill="none" stroke="url(#bd)" stroke-width="3"/>
<g transform="translate(42 34) scale(1.35)">${inner(mark)}</g>
</svg>`;
fs.writeFileSync(path.join(BR, 'mark.svg'), markSvg);
fs.writeFileSync(path.join(BR, 'icon.svg'), iconSvg);

async function render(svg, size, transparent = true) {
  // desenha o SVG num canvas (mantém a transparência) e devolve o PNG
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: false, contextIsolation: false } });
  await w.loadURL('data:text/html,<body></body>');
  const b64 = await w.webContents.executeJavaScript(`new Promise((res, rej) => {
    const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = ${size}; c.height = ${size}; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(i, 0, 0, ${size}, ${size}); res(c.toDataURL('image/png').split(',')[1]); };
    i.onerror = () => rej(new Error('svg')); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)}); })`);
  w.destroy();
  return Buffer.from(b64, 'base64');
}
function makeIco(pngs) {                                              // ICO com PNGs dentro (aceito pelo Windows Vista+)
  const n = pngs.length, head = Buffer.alloc(6 + 16 * n); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(n, 4);
  let off = head.length;
  pngs.forEach(([size, buf], i) => {
    const o = 6 + 16 * i; head[o] = size >= 256 ? 0 : size; head[o + 1] = size >= 256 ? 0 : size; head[o + 2] = 0; head[o + 3] = 0;
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(buf.length, o + 8); head.writeUInt32LE(off, o + 12); off += buf.length;
  });
  return Buffer.concat([head, ...pngs.map(p => p[1])]);
}
app.whenReady().then(async () => {
  const sizes = [256, 128, 64, 48, 32, 24, 16], pngs = [];
  for (const s of sizes) pngs.push([s, await render(iconSvg, s)]);
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), makeIco(pngs));
  fs.writeFileSync(path.join(BR, 'icon-512.png'), await render(iconSvg, 512));
  fs.writeFileSync(path.join(BR, 'mark-512.png'), await render(markSvg, 512));
  fs.writeFileSync(path.join(BR, 'tray.png'), await render(markSvg, 64));           // bandeja: só a marca, sem fundo
  console.log('ok', fs.readdirSync(BR).join(', '), '| build:', fs.readdirSync(BUILD).join(', '));
  app.quit();
});
