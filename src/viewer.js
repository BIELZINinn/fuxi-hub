// Visualizador do Fuxi H3: um único recorte da foto original, animado (sem trocar de imagem).
//  - entrada: o fone gira e é "escaneado" por uma linha de luz, de baixo para cima
//  - parado: flutua, balança em 3D, acompanha o mouse e recebe um brilho que passa sobre o recorte
//  - saída: a linha de luz apaga o fone de cima para baixo, enquanto ele gira para o outro lado
//  - a cor da linha, do brilho e do halo acompanha o preset ativo (setAccent)
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOutC = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const hex = h => { h = String(h).replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const RED = [255, 77, 109];

  function create(root) {
    const stage = root.querySelector('.hero3d');
    const img = stage.querySelector('.hp img');
    const maskBox = stage.querySelector('.hpm');
    const shine = stage.querySelector('.shine');
    const scan = stage.querySelector('.scan');
    const generic = stage.querySelector('.generic');
    const line = root.querySelector('.baseline');
    const glow = root.querySelector('.glow');
    const ring = root.querySelector('.pulse');

    let target = 'none', mode = 'none', phase = 'none';
    let p = 0, time = 0, nextShine = 0, shineT = -1;
    let drag = 0, dragging = false, lastX = 0;
    let accent = [46, 242, 255], accentTarget = [46, 242, 255];
    const mouse = { x: 0, y: 0 }, tilt = { x: 0, y: 0 };
    let last = performance.now();

    // arrastar gira o fone; ao soltar ele volta suavemente
    root.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; root.setPointerCapture(e.pointerId); });
    root.addEventListener('pointermove', e => {
      const r = root.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width - .5) * 2; mouse.y = ((e.clientY - r.top) / r.height - .5) * 2;
      if (dragging) { drag = clamp(drag + (e.clientX - lastX) * .3, -45, 45); lastX = e.clientX; }
    });
    const release = () => { dragging = false; };
    root.addEventListener('pointerup', release); root.addEventListener('pointercancel', release);

    const setMode = m => { target = m; };
    const setAccent = h => { accentTarget = hex(h); };

    function step(dt) {
      if (phase === 'none' && target !== 'none') { mode = target; phase = 'entering'; p = 0; nextShine = 0; shineT = -1; }
      else if ((phase === 'present' || phase === 'entering') && target !== mode) { phase = 'leaving'; }
      if (phase === 'entering') {
        p += dt / 2.2;
        if (p >= 1) { p = 1; phase = 'present'; shineT = 0; nextShine = time + 7; ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go'); }
      }
      if (phase === 'leaving') { p -= dt / 1.6; if (p <= 0) { p = 0; phase = 'none'; } }
    }

    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (!root.offsetParent) return;                         // aba escondida: não gasta processamento
      time += dt; step(dt);

      // cor de destaque: segue o preset (vermelho durante a saída)
      const tg = phase === 'leaving' ? RED : accentTarget, k = Math.min(1, dt * 5);
      accent = accent.map((v, i) => v + (tg[i] - v) * k);
      root.style.setProperty('--va', accent.map(Math.round).join(','));

      const isFuxi = mode === 'fuxi';
      const e = easeInOut(p);                                  // 0 = apagado, 1 = pleno

      // pose do fone
      let rotY = 0, ty = 0, sc = 1;
      if (phase === 'entering') { const q = easeOutC(p); rotY = -55 * (1 - q); ty = 36 * (1 - q); sc = .9 + .1 * q; }
      else if (phase === 'leaving') { rotY = 55 * (1 - e); ty = -24 * (1 - e); sc = .92 + .08 * e; }
      if (!dragging) drag *= .93;
      tilt.x += (mouse.x * 7 - tilt.x) * .06; tilt.y += (-mouse.y * 5 - tilt.y) * .06;
      const sway = Math.sin(time * .55) * 7, bob = Math.sin(time * 1.3) * 6, nod = Math.cos(time * .4) * 2;
      stage.style.transform = `translateY(${(ty + bob).toFixed(2)}px) rotateX(${(tilt.y + nod).toFixed(2)}deg) rotateY(${(rotY + sway + tilt.x + drag).toFixed(2)}deg) scale(${sc.toFixed(4)})`;

      // revelação por varredura (de baixo para cima na entrada; de cima para baixo na saída)
      const scanning = phase === 'entering' || phase === 'leaving';
      if (scanning && isFuxi) {
        // a máscara fica numa caixa 80px maior em cima/baixo; converte para porcentagens dessa caixa
        const H = stage.clientHeight || 480, Hm = H + 160;
        const yb = 80 / Hm * 100, yt = (80 + H) / Hm * 100;            // base e topo da imagem dentro da caixa
        const t = yb + e * (yt - yb + 9);
        const m = `linear-gradient(to top,#000 ${(t - 8).toFixed(1)}%,transparent ${t.toFixed(1)}%)`;
        maskBox.style.webkitMaskImage = m; maskBox.style.maskImage = m;
        scan.style.bottom = (((t - 4) - yb) / (yt - yb) * 100).toFixed(1) + '%';
        scan.style.opacity = clamp(Math.min(e, 1 - e) * 9, 0, 1).toFixed(2);
      } else { maskBox.style.webkitMaskImage = ''; maskBox.style.maskImage = ''; scan.style.opacity = 0; }
      img.style.opacity = isFuxi ? clamp(p * 5, 0, 1).toFixed(2) : 0;
      const bright = 1 + .5 * (1 - e), sat = .4 + .6 * e, blur = (1 - e) * 3;
      img.style.filter = `brightness(${bright.toFixed(2)}) saturate(${sat.toFixed(2)})${blur > .1 ? ` blur(${blur.toFixed(1)}px)` : ''} drop-shadow(0 24px 34px rgba(var(--va),.2))`;

      // brilho que passa sobre o fone (só parado)
      if (phase === 'present' && shineT < 0 && time > nextShine) { shineT = 0; nextShine = time + 7; }
      if (shineT >= 0) {
        shineT += dt / 1.5;
        if (shineT >= 1) { shineT = -1; shine.style.opacity = 0; }
        else { shine.style.opacity = Math.sin(Math.PI * shineT).toFixed(2); shine.style.backgroundPosition = `${(100 * (1 - easeInOut(shineT))).toFixed(1)}% 0`; }
      } else shine.style.opacity = 0;

      // fone genérico: contorno desenhado
      generic.style.opacity = (mode === 'generic' ? clamp(e * 1.3, 0, 1) : 0).toFixed(3);
      generic.style.setProperty('--dash', ((1 - e) * 420).toFixed(1));

      // linha de chão e halo
      root.dataset.state = phase;
      line.style.transform = `translateX(-50%) scaleX(${(phase === 'none' ? .06 : .15 + .85 * e).toFixed(3)})`;
      line.style.opacity = phase === 'none' ? (.25 + .15 * Math.sin(time * 1.4)).toFixed(2) : clamp(e * 1.5, 0, 1).toFixed(2);
      glow.style.opacity = (clamp(e * 1.2, 0, 1) * (.75 + .25 * Math.sin(time * 1.1))).toFixed(3);
    }
    requestAnimationFrame(frame);
    return { setMode, setAccent };
  }
  window.FuxiViewer = { create };
})();
