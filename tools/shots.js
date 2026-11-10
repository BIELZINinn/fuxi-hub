// Só para testes: captura a janela do próprio app (não a tela do usuário) e sai.
// Uso: $env:FUXI_SHOTS="pasta"; $env:FUXI_STEPS='[[ms, nome, js, alvo?, atraso?], ...]'; electron .
//   alvo "ovl" = captura a janela dos avisos (transparente, composta sobre um fundo escuro); atraso em ms (padrão 300)
const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

function flatten(img, bg = [14, 14, 18]) {
  const { width, height } = img.getSize(), px = Buffer.from(img.toBitmap());
  for (let i = 0; i < px.length; i += 4) {
    const k = 1 - px[i + 3] / 255;                                  // BGRA pré-multiplicado sobre o fundo
    px[i] = px[i] + bg[2] * k; px[i + 1] = px[i + 1] + bg[1] * k; px[i + 2] = px[i + 2] + bg[0] * k; px[i + 3] = 255;
  }
  return nativeImage.createFromBitmap(px, { width, height });
}

module.exports = {
  early(app) {
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
    app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
    app.commandLine.appendSwitch('disable-background-timer-throttling');
  },
  run(win, app, getOverlay) {
    const dir = process.env.FUXI_SHOTS;
    win.setIgnoreMouseEvents(true); win.setFocusable(false); win.setSkipTaskbar(true);
    const steps = JSON.parse(process.env.FUXI_STEPS || '[]');
    const lastName = steps.length ? steps[steps.length - 1][1] : '';
    steps.forEach(([t, name, js, target, delay]) => setTimeout(async () => {
      if (js) { const r = await win.webContents.executeJavaScript(js); if (/^dump_/.test(name)) fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(r, null, 1)); }
      setTimeout(async () => {
        const w = target === 'ovl' ? (getOverlay && getOverlay()) : target === 'mini' ? global.__mini : target === 'badge' ? global.__badge : target === 'np' ? global.__np : win;
        if (w && !w.isDestroyed()) {
          let img = await w.webContents.capturePage();
          if (target === 'ovl' || target === 'badge' || target === 'np') img = flatten(img);
          fs.writeFileSync(path.join(dir, name + '.png'), img.toPNG());
        }
        if (name === lastName) app.quit();
      }, delay || 300);
    }, t));
  }
};
