// Auditoria dos recortes: acha pixels quase brancos e opacos encostados em transparência (possível resto de fundo).
// Uso: electron tools/audit.js <pasta dos recortes>
const { app, nativeImage } = require('electron');
const path = require('path');
app.whenReady().then(() => {
  for (const name of ['view-3q', 'view-side', 'view-front']) {
    const img = nativeImage.createFromPath(path.join(process.argv[2], name + '.png'));
    const { width: w, height: h } = img.getSize(), px = Buffer.from(img.toBitmap());
    const A = i => px[i * 4 + 3] / 255;
    const un = (i, c) => A(i) > 0 ? px[i * 4 + c] / A(i) : 0;       // desfaz o pré-multiplicado
    const flag = new Uint8Array(w * h);
    let semi = 0, stray = 0;
    for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
      const i = y * w + x, a = A(i);
      if (a > 0.05 && a < 0.95) semi++;
      if (a < 0.5) continue;
      if (Math.min(un(i, 0), un(i, 1), un(i, 2)) < 236) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (A((y + dy) * w + x + dx) < 0.2) { near = true; break; }
      if (near) { flag[i] = 1; stray++; }
    }
    // isolados: componentes de alpha > 0.05 desconectados do maior
    const lab = new Int32Array(w * h), sizes = [];
    for (let s = 0; s < w * h; s++) {
      if (A(s) <= 0.05 || lab[s]) continue;
      const id = sizes.length + 1, st = [s]; lab[s] = id; let n = 0;
      while (st.length) { const i = st.pop(); n++; const x = i % w, y = (i / w) | 0; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !lab[j] && A(j) > 0.05) { lab[j] = id; st.push(j); } }
      sizes.push(n);
    }
    console.log(name, `${w}x${h}`, 'bordas semitransparentes:', semi, '| pixels claros colados no vazio:', stray, '| componentes (px):', sizes.sort((a, b) => b - a).slice(0, 6).join(','));
  }
  app.quit();
});
