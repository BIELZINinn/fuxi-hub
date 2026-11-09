// Converte imagens (webp etc.) para PNG usando o decodificador do Chromium. Uso: electron tools/webp2png.js <entrada> <saida.png>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const { pathToFileURL } = require('url');
app.commandLine.appendSwitch('no-sandbox');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: false, contextIsolation: false, webSecurity: false } });
  await w.loadURL('data:text/html,<body></body>');
  const url = pathToFileURL(process.argv[2]).href;
  const b64 = await w.webContents.executeJavaScript(`new Promise((res, rej) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); res(c.toDataURL('image/png').split(',')[1] + '|' + i.naturalWidth + 'x' + i.naturalHeight); }; i.onerror = () => rej('erro'); i.src = ${JSON.stringify(url)}; })`).catch(e => { console.log('falhou', e); return null; });
  if (b64) { const [d, s] = b64.split('|'); fs.writeFileSync(process.argv[3], Buffer.from(d, 'base64')); console.log('ok', s); }
  app.quit();
});
