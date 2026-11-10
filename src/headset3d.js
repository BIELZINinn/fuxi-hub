// Modelo 3D do Havit Fuxi H3 montado em código (three.js), seguindo as fotos do produto:
//  - arco largo de malha, hastes com a janela triangular e a faixa diagonal "GAMENOTE" com o logo de garras;
//  - conchas ovais brilhantes com o aro prateado, as 3 aberturas inclinadas e o furo do botão;
//  - almofadas fundas de tecido hexagonal; microfone destacável com haste fina e espuma grande.
// Reage ao áudio (anel de luz), ao microfone mutado (LED vermelho) e à cor do preset.
import * as THREE from './vendor/three.module.min.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const COLORS = {                                                      // shell = concha · arm = haste/faixa · band = arco · cushion = almofada · foam = espuma · boom = haste do mic
  white: { shell: 0xb4b4b9, plate: 0xc0c0c5, arm: 0x45454b, band: 0x303035, cushion: 0x343439, foam: 0x3a3a3f, boom: 0x4a4a50, rim: 0xa9a9af, text: '#cfcfd4' },
  bw: { shell: 0xf0f0f3, plate: 0xf8f8fa, arm: 0xeeeef1, band: 0x121214, cushion: 0x101012, foam: 0xdcdce0, boom: 0xf0f0f3, rim: 0xb4b4ba, text: '#55555c' },
  black: { shell: 0x15151a, plate: 0x1b1b20, arm: 0x121216, band: 0x111114, cushion: 0x101013, foam: 0x1c1c20, boom: 0x141418, rim: 0x6c6c74, text: '#9a9aa2' }
};

function canvasTex(w, h, draw, repeat, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const weave = () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { g.fillStyle = ((x + y) / 4) % 2 ? '#9c9c9c' : '#666'; g.fillRect(x, y, 4, 4); } }, [26, 4], false);
const hexBump = () => canvasTex(128, 111, (g, w, h) => {
  g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, w, h); const r = 13, dx = r * 1.732, dy = r * 1.5;
  for (let row = -1; row < h / dy + 1; row++) for (let col = -1; col < w / dx + 1; col++) {
    const cx = col * dx + (row % 2 ? dx / 2 : 0), cy = row * dy; g.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(cx + (r - 1) * Math.cos(a), cy + (r - 1) * Math.sin(a)); } g.closePath();
    const gr = g.createRadialGradient(cx, cy, 1, cx, cy, r); gr.addColorStop(0, '#f2f2f2'); gr.addColorStop(1, '#8c8c8c'); g.fillStyle = gr; g.fill(); g.strokeStyle = '#2a2a2a'; g.lineWidth = 2.2; g.stroke();
  }
}, [6, 6], false);
function stripTex(textColor) {                                         // faixa diagonal: logo de garras + "GAMENOTE"
  return canvasTex(1024, 192, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = textColor; g.strokeStyle = textColor; g.lineCap = 'round'; g.lineWidth = 9;
    [[150, 0], [178, 6], [206, 12]].forEach(([x, o]) => { g.beginPath(); g.moveTo(x - 60, 150 - o); g.bezierCurveTo(x - 40, 110, x + 5, 80 + o, x + 20, 38 + o); g.stroke(); });
    g.font = '600 94px "Times New Roman", Georgia, serif'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('GAMENOTE', 300, h / 2 + 4);
  });
}
function ovalShape(w, h, n = 2.4, steps = 96) {
  const s = new THREE.Shape();
  for (let i = 0; i <= steps; i++) { const t = (i / steps) * Math.PI * 2, c = Math.cos(t), si = Math.sin(t); const x = (w / 2) * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y = (h / 2) * Math.sign(si) * Math.pow(Math.abs(si), 2 / n); i ? s.lineTo(x, y) : s.moveTo(x, y); }
  return s;
}
function ringShape(w, h, iw, ih, n = 2.4) { const s = ovalShape(w, h, n); s.holes.push(ovalShape(iw, ih, n)); return s; }
function roundRect(w, h, r) { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }

export function createHeadset(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.88; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  cam.position.set(0, 0.45, 8.6); cam.lookAt(0, -0.45, 0);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture; scene.environmentIntensity = 1.0;
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(3.5, 5, 6); scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.5); fill.position.set(-5, 1, 3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x2ef2ff, 0.7); rim.position.set(-4, 2, -5); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0x2ef2ff, 0.4); rim2.position.set(5, -1, -4); scene.add(rim2);
  const root = new THREE.Group(); scene.add(root);

  // ---- materiais ----
  const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 });
  const plateMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  const armMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, bumpMap: weave(), bumpScale: 1.1 });
  const cushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, bumpMap: hexBump(), bumpScale: 3.2 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 1.0 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.65 });
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, bumpMap: weave(), bumpScale: 0.5 });
  const boomMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.4, clearcoat: 0.5 });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x2ef2ff });
  const micLedMat = new THREE.MeshBasicMaterial({ color: 0xff3b4d, transparent: true, opacity: 0 });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x2ef2ff, transparent: true, opacity: 0.5 });
  const stripMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

  // ---- arco (malha larga) ----
  const R_OUT = 1.2, R_IN = 1.04;
  const bandShape = new THREE.Shape(); bandShape.absarc(0, 0, R_OUT, 0, Math.PI, false); bandShape.absarc(0, 0, R_IN, Math.PI, 0, true); bandShape.closePath();
  const bandGeo = new THREE.ExtrudeGeometry(bandShape, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 6, curveSegments: 80 }); bandGeo.translate(0, 0, -0.21);
  const band = new THREE.Mesh(bandGeo, bandMat); band.position.y = 0.02; root.add(band);

  // ---- conchas (side = -1 esquerda · +1 direita) ----
  for (const side of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(side * 1.2, -0.66, 0.0); g.rotation.z = -side * 0.07; g.scale.setScalar(1.22); root.add(g);
    const face = side; // sinal da direção para fora
    // casca
    const shellGeo = new THREE.ExtrudeGeometry(ovalShape(0.52, 0.76, 2.2), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.17, bevelSize: 0.16, bevelSegments: 16, curveSegments: 72 }); shellGeo.center(); shellGeo.rotateY(Math.PI / 2);
    g.add(new THREE.Mesh(shellGeo, shellMat));
    // frisos da face externa
    const groove = new THREE.Mesh(new THREE.ExtrudeGeometry(ringShape(0.70, 0.96, 0.66, 0.92, 2.3), { depth: 0.004, bevelEnabled: false }), darkMat); groove.geometry.center(); groove.geometry.rotateY(Math.PI / 2); groove.position.x = face * 0.218; g.add(groove);
    // faixa diagonal com GAMENOTE
    const strip = new THREE.Group(); strip.position.set(face * 0.232, 0.0, 0.02); g.add(strip);
    const sGeo = new THREE.ExtrudeGeometry(roundRect(0.17, 0.98, 0.04), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3 }); sGeo.center();
    const sMesh = new THREE.Mesh(sGeo, armMat); sMesh.rotation.y = face * Math.PI / 2; strip.add(sMesh);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.17), stripMat); lab.rotation.set(0, face * Math.PI / 2, Math.PI / 2); lab.position.x = face * 0.03; strip.add(lab);
    strip.rotation.x = -0.52 * face;                                    // a faixa desce do fundo-alto para a frente-baixo
    // aberturas inclinadas e furo do botão
    [[0.34, -0.12], [0.29, -0.22], [0.24, -0.32]].forEach(([len, yy], i) => { const slot = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, len, 4, 10), darkMat); slot.position.set(face * 0.226, yy, -0.2 - i * 0.012); slot.rotation.x = -0.55 * face; g.add(slot); });
    const hole = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.07, 4, 10), darkMat); hole.position.set(face * 0.232, -0.3, 0.2); g.add(hole);
    // aro prateado entre casca e almofada
    const rg = new THREE.ExtrudeGeometry(ringShape(0.86, 1.1, 0.66, 0.9, 2.3), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.016, bevelSegments: 5 }); rg.center(); rg.rotateY(Math.PI / 2);
    const rimM = new THREE.Mesh(rg, rimMat); rimM.position.x = -face * 0.215; g.add(rimM);
    // almofada funda de tecido hexagonal
    const cg = new THREE.ExtrudeGeometry(ringShape(0.8, 1.04, 0.38, 0.58, 2.2), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.13, bevelSize: 0.1, bevelSegments: 14, curveSegments: 64 }); cg.center(); cg.rotateY(Math.PI / 2);
    const cush = new THREE.Mesh(cg, cushMat); cush.position.x = -face * 0.44; g.add(cush);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.28, 48), darkMat); inner.scale.set(0.82, 1.1, 1); inner.rotation.y = -face * Math.PI / 2; inner.position.x = -face * 0.36; g.add(inner);
    // haste com a janela triangular (do arco até o alto da concha)
    const armShape = new THREE.Shape(); armShape.moveTo(-0.13, -0.3); armShape.lineTo(0.13, -0.3); armShape.lineTo(0.16, 0.34); armShape.quadraticCurveTo(0, 0.42, -0.16, 0.34); armShape.closePath();
    const hole2 = new THREE.Path(); hole2.moveTo(0, -0.02); hole2.lineTo(0.075, 0.2); hole2.lineTo(-0.075, 0.2); hole2.closePath(); armShape.holes.push(hole2);
    const aGeo = new THREE.ExtrudeGeometry(armShape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 4 }); aGeo.center();
    const arm = new THREE.Mesh(aGeo, armMat); arm.position.set(face * 0.12, 0.52, 0); arm.rotation.y = Math.PI / 2; g.add(arm);
    if (side === 1) { const led = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.05, 4, 8), ledMat); led.position.set(face * 0.234, -0.4, -0.02); g.add(led); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.006, 8, 100), ringMat); ring.scale.set(0.78, 1.1, 1); ring.rotation.y = Math.PI / 2; ring.position.x = face * 0.224; g.add(ring); }
    else {                                                                // base do microfone e encaixe USB-C no lado esquerdo
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.09, 24), armMat); base.position.set(-0.02, -0.5, 0.2); base.rotation.x = 0.4; g.add(base);
      const usb = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.07, 4, 8), darkMat); usb.position.set(-0.04, -0.54, -0.1); usb.rotation.z = Math.PI / 2; g.add(usb);
    }
  }
  // ---- microfone ----
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.26, -1.12, 0.34), new THREE.Vector3(-1.58, -1.2, 0.72), new THREE.Vector3(-1.8, -0.88, 1.1), new THREE.Vector3(-1.64, -0.46, 1.42), new THREE.Vector3(-1.3, -0.26, 1.58)]);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.014, 12, false), boomMat));
  const foam = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 20), foamMat); foam.position.copy(curve.getPoint(1)).add(new THREE.Vector3(-0.02, 0.02, 0.0)); foam.scale.set(1, 1, 0.85); foam.rotation.set(0.3, 0.2, 0.15); root.add(foam);
  const micLed = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 14), micLedMat); micLed.position.copy(curve.getPoint(0.04)); root.add(micLed);

  // ---- controle ----
  let color = 'white', accent = new THREE.Color(0x2ef2ff), level = 0, muted = false, t = 0;
  const labelTex = {};
  function setColor(c) {
    color = COLORS[c] ? c : 'white'; const k = COLORS[color];
    shellMat.color.set(k.shell); plateMat.color.set(k.plate); armMat.color.set(k.arm); bandMat.color.set(k.band); cushMat.color.set(k.cushion); foamMat.color.set(k.foam); boomMat.color.set(k.boom); rimMat.color.set(k.rim);
    stripMat.map = labelTex[color] || (labelTex[color] = stripTex(k.text)); stripMat.needsUpdate = true;
  }
  function setAccent(hex) { accent.set(hex); ledMat.color.copy(accent); ringMat.color.copy(accent); rim.color.copy(accent); rim2.color.copy(accent); }
  function resize() { const w = canvas.clientWidth || 400, h = canvas.clientHeight || 400, d = Math.min(devicePixelRatio || 1, 2); renderer.setPixelRatio(d); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  function frame(dt, lv) {
    t += dt; level += ((lv || 0) - level) * Math.min(1, dt * 8);
    root.rotation.y = -0.62 + Math.sin(t * 0.4) * 0.3; root.rotation.x = 0.1 + Math.sin(t * 0.31) * 0.04; root.position.y = 0.05 + Math.sin(t * 1.05) * 0.035; root.scale.setScalar(0.9);
    ringMat.opacity = 0.3 + level * 0.7; ringMat.color.copy(accent).multiplyScalar(0.8 + level * 1.4);
    ledMat.color.copy(accent).multiplyScalar(0.6 + 0.4 * Math.sin(t * 3) ** 2 + level);
    rim.intensity = 0.7 + level * 1.6;
    micLedMat.opacity = muted ? 0.65 + 0.35 * Math.sin(t * 6) : 0;
    renderer.render(scene, cam);
  }
  setColor('white');
  return { setColor, setAccent, setMuted: m => { muted = !!m; }, resize, frame, dispose: () => renderer.dispose() };
}
