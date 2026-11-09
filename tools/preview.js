// Compõe os recortes sobre fundos de teste (magenta, cinza, preto) para achar franjas e falhas.
// Uso: electron tools/preview.js <pasta-dos-recortes> <pasta-de-saida> [zoomX,zoomY,w,h,escala,arquivo]
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const [, , dir, out, crop] = process.argv;
const BGS = { magenta: [255, 0, 255], gray: [128, 128, 128], black: [0, 0, 0] };

app.whenReady().then(() => {
  fs.mkdirSync(out, { recursive: true });
  for (const name of ['view-3q', 'view-side', 'view-front']) {
    const img = nativeImage.createFromPath(path.join(dir, name + '.png'));
    const { width: w, height: h } = img.getSize();
    const src = Buffer.from(img.toBitmap());
    for (const [bn, c] of Object.entries(BGS)) {
      const pv = Buffer.alloc(src.length);
      for (let i = 0; i < src.length; i += 4) {
        const a = src[i + 3] / 255;                              // BGRA pré-multiplicado
        pv[i] = src[i] + c[2] * (1 - a); pv[i + 1] = src[i + 1] + c[1] * (1 - a); pv[i + 2] = src[i + 2] + c[0] * (1 - a); pv[i + 3] = 255;
      }
      let o = nativeImage.createFromBitmap(pv, { width: w, height: h });
      fs.writeFileSync(path.join(out, `${name}-${bn}.png`), o.toPNG());
      if (crop) {                                                // recorte ampliado de uma região
        const [cx, cy, cw, ch, sc, only] = crop.split(',');
        if (only && only !== name + '-' + bn) continue;
        const piece = o.crop({ x: +cx, y: +cy, width: +cw, height: +ch }).resize({ width: +cw * +sc, height: +ch * +sc, quality: 'good' });
        fs.writeFileSync(path.join(out, `zoom-${name}-${bn}.png`), piece.toPNG());
      }
    }
  }
  app.quit();
});
