// Recorta uma região de um PNG com transparência e compõe sobre preto (para comparar nitidez).
// Uso: electron tools/crop.js <png> <x> <y> <w> <h> <saida.png>
const { app, nativeImage } = require('electron');
const fs = require('fs');
const [, , file, X, Y, W, H, out] = process.argv;
app.whenReady().then(() => {
  const img = nativeImage.createFromPath(file).crop({ x: +X, y: +Y, width: +W, height: +H });
  const { width: w, height: h } = img.getSize(), src = Buffer.from(img.toBitmap()), pv = Buffer.alloc(src.length);
  const bg = (process.env.BG || '0,0,0').split(',').map(Number);          // fundo de teste (R,G,B), padrão preto
  for (let i = 0; i < src.length; i += 4) { const k = 1 - src[i + 3] / 255; pv[i] = src[i] + bg[2] * k; pv[i + 1] = src[i + 1] + bg[1] * k; pv[i + 2] = src[i + 2] + bg[0] * k; pv[i + 3] = 255; }   // pré-multiplicado
  fs.writeFileSync(out, nativeImage.createFromBitmap(pv, { width: w, height: h }).toPNG());
  app.quit();
});
