// Imprime a grade de "canal mínimo" (0-255) de uma região da imagem original, para diagnóstico de recorte.
// Uso: electron tools/probe.js <arquivo> <x> <y> <largura> <altura>
const { app, nativeImage } = require('electron');
const [, , file, X, Y, W, H] = process.argv;
app.whenReady().then(() => {
  const img = nativeImage.createFromPath(file), { width: w } = img.getSize(), px = Buffer.from(img.toBitmap());
  const lines = [];
  for (let y = +Y; y < +Y + +H; y++) {
    let row = String(y).padStart(3) + ' ';
    for (let x = +X; x < +X + +W; x++) { const i = (y * w + x) * 4; row += String(Math.min(px[i], px[i + 1], px[i + 2])).padStart(4); }
    lines.push(row);
  }
  console.log('    ' + Array.from({ length: +W }, (_, k) => String(+X + k).padStart(4)).join('') + '\n' + lines.join('\n'));
  app.quit();
});
