// Renderiza as assinaturas sonoras dos jogos para WAV (sem tocar nada) e mede pico/duração. Uso: electron tools/soundtest.js <pasta-saida>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
app.commandLine.appendSwitch('no-sandbox');
app.on('window-all-closed', () => {});
const IDS = ['gow', 'fortnite', 'valorant', 'cs2', 'pubg', 'apex', 'warzone', 'overwatch', 'r6', 'lol', 'gta5', 'rocketleague', 'cyberpunk', 'eldenring', 'rdr2', 'dota2', 'bf2042', 'tarkov', 'witcher3'];
const wav = (pcm, sr) => { const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]); };
app.whenReady().then(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const w = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, '..', 'preload-toast.js'), contextIsolation: true, sandbox: false, autoplayPolicy: 'no-user-gesture-required' } });
  await w.loadFile(path.join(__dirname, '..', 'src', 'toast.html'));
  for (const id of IDS) {
    try {
      const r = await w.webContents.executeJavaScript(`window.__testSound(${JSON.stringify(id)})`);
      fs.writeFileSync(path.join(out, id + '.wav'), wav(Buffer.from(r.b64, 'base64'), 48000));
      console.log(id.padEnd(13), 'pico', r.peak.toFixed(2), 'rms', r.rms.toFixed(3), 'dur', r.secs.toFixed(2) + 's', r.peak > .98 ? 'CLIPA' : '', r.peak < .05 ? 'MUITO BAIXO' : '');
    } catch (e) { console.log(id.padEnd(13), 'ERRO', String(e).slice(0, 120)); }
  }
  app.quit();
});
