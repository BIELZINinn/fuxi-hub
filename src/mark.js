// Marca do Fuxi Hub: o fone inteiro, desenhado a partir do Fuxi H3 — o arco do headband ligando as duas conchas arredondadas,
// as 3 fendas diagonais que o fone tem na lateral (recortadas como vazado, e que também leem como barras de equalizador)
// e a hastezinha do microfone. fuxiMark(uid, classe) devolve o SVG (uid evita conflito de ids quando há várias cópias).
(function (g) {
  const rr = (x, y, w, h, r) => `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  g.fuxiMark = function (uid, cls) {
    uid = uid || 'm';
    const L = rr(6, 58, 30, 56, 15), R = rr(92, 58, 30, 56, 15);
    // fendas: direita sobe para a direita (como no fone); esquerda é o espelho
    const sl = (cx, y, len, mirror) => { const h = len / 2, dx = h * .883, dy = h * .469, a = cx - dx, b = cx + dx; return mirror ? `M${a.toFixed(1)} ${(y - dy).toFixed(1)}L${b.toFixed(1)} ${(y + dy).toFixed(1)}` : `M${a.toFixed(1)} ${(y + dy).toFixed(1)}L${b.toFixed(1)} ${(y - dy).toFixed(1)}`; };
    const slots = (cx, mirror, base) => [[76, 15], [87, 24], [98, 15]].map(([y, len], i) =>
      `<path class="m-s m-s${base + i}" d="${sl(cx, y, len, mirror)}" pathLength="100" stroke="#000" stroke-width="4.6" stroke-linecap="round" fill="none"/>`).join('');
    return `<svg class="${cls || ''}" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="fg${uid}" x1="6" y1="13" x2="122" y2="126" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2ef2ff"/><stop offset="1" stop-color="#8a6dff"/></linearGradient>
<mask id="mf${uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="128" height="128"><rect width="128" height="128" fill="#fff"/>${slots(21, true, 1)}${slots(107, false, 4)}</mask>
<clipPath id="cp${uid}"><path d="${L}"/><path d="${R}"/></clipPath>
</defs>
<path class="m-arc" d="M21 62V56A43 43 0 0 1 107 56V62" fill="none" stroke="url(#fg${uid})" stroke-width="9" stroke-linecap="round" pathLength="100"/>
<g mask="url(#mf${uid})"><path class="m-cup m-cl" d="${L}" fill="url(#fg${uid})"/><path class="m-cup m-cr" d="${R}" fill="url(#fg${uid})"/></g>
<g class="m-mic"><path d="M15 112C12 124 22 124 29 121" fill="none" stroke="url(#fg${uid})" stroke-width="4" stroke-linecap="round"/><rect x="27" y="116.5" width="13" height="9" rx="4.5" fill="url(#fg${uid})"/></g>
<g clip-path="url(#cp${uid})"><path class="m-glint" d="M-6 40L8 40L-10 130L-24 130Z" fill="#fff" opacity="0"/></g>
</svg>`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
