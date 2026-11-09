// Mostra tamanho de imagens. Uso: electron tools/size.js <arquivo>...
const { app, nativeImage } = require('electron');
app.whenReady().then(() => {
  for (const f of process.argv.slice(2)) { const i = nativeImage.createFromPath(f), s = i.getSize(); console.log(f.split('\\').pop(), i.isEmpty() ? 'VAZIA/NAO LIDA' : s.width + 'x' + s.height); }
  app.quit();
});
