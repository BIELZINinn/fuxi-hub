// Liga o modelo 3D ao Início: cria o canvas dentro do palco do fone, acompanha cor do fone, cor do preset, microfone mutado e o áudio.
import { createHeadset } from './headset3d.js';
let H = null, cv = null, last = performance.now(), failed = false;
function ensure() {
  if (H || failed) return;
  const stage = document.querySelector('.hero3d'); if (!stage) return;
  try {
    cv = document.createElement('canvas'); cv.id = 'h3d'; stage.appendChild(cv);
    H = createHeadset(cv); H.resize(); new ResizeObserver(() => H.resize()).observe(stage);
  } catch (e) { failed = true; if (cv) cv.remove(); document.body.classList.remove('h3d'); }
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const on = typeof S !== 'undefined' && S && S.ui && S.ui.view3d === true && !failed && !S.perf;
  document.body.classList.toggle('h3d', !!on);
  if (!on) { if (cv) cv.style.opacity = 0; return; }
  const root = document.querySelector('#viewer'); if (!root || !root.offsetParent || document.hidden) return;
  ensure(); if (!H) return;
  H.setColor(S.ui.headset || 'white'); H.setAccent(window.Fx2 ? Fx2.accent() : '#2ef2ff');
  const mic = document.querySelector('.hmic'); H.setMuted(!!(mic && mic.classList.contains('on')));
  let lv = 0; if (window.Spectrum && Spectrum.ok && S.ui.spectrum !== false) { const b = Spectrum.bins(12, 40, 6000); if (b) lv = Math.min(1, (b.reduce((s, x) => s + x, 0) / b.length) * 2.4); }
  const img = document.querySelector('.hp img'); cv.style.opacity = img ? (img.style.opacity || 0) : 1;            // acompanha a entrada e a saída da animação
  H.frame(dt, lv);
}
requestAnimationFrame(loop);
