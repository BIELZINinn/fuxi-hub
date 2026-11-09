// Mede cores de fundo e do logo de uma imagem. Uso: electron tools/probe-logo.js <png>
const { app, nativeImage } = require('electron');
app.whenReady().then(() => {
  const img = nativeImage.createFromPath(process.argv[2]), { width: w, height: h } = img.getSize(), b = img.toBitmap();
  const at = (x, y) => { const i = (Math.round(y) * w + Math.round(x)) * 4; return [b[i + 2], b[i + 1], b[i]]; };
  console.log('size', w, h);
  for (const [n, x, y] of [['TL', 5, 5], ['TR', w - 6, 5], ['BL', 5, h - 6], ['BR', w - 6, h - 6], ['C', w / 2, h * .8], ['top mid', w / 2, 40], ['mid L', 20, h / 2], ['text', 400, 360], ['text2', 120, 340]])
    console.log(n, at(x, y).join(','));
  // caixa do logo: pixels com R>150
  let x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (b[(y * w + x) * 4 + 2] > 150) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  console.log('logo box', x0, y0, x1, y1);
  app.quit();
});
