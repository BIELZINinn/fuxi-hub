'use strict';
// Clipes dos jogos (estilo ShadowPlay / SteelSeries Moments): buffer de replay contínuo que guarda os últimos N segundos e, ao apertar o
// atalho, salva um clipe MP4. Captura da tela pela GPU (DXGI) + codificação por hardware (NVENC / AMF / Quick Sync, ou CPU como último recurso).
// O áudio vem do helper nativo loopcap.exe (sistema e, se quiser, microfone). Tudo roda em processos separados: o app principal só orquestra.
const fs = require('fs'), path = require('path'), cp = require('child_process');

const FF_URL = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
const SEG = 1;                                                      // segundos por pedaço do buffer (também o intervalo de quadros-chave)
const ENCODERS = ['h264_nvenc', 'h264_amf', 'h264_qsv', 'libx264'];
const DEFAULTS = { enabled: false, auto: true, seconds: 60, fps: 60, res: 'native', bitrate: 16, mic: false, micGain: 80, monitor: 0, dir: '', maxGB: 20, encoder: 'auto' };

let D = null, ff = null, helper = null, running = false, starting = false, encoder = null, buf = '', lastErr = null, lastClip = null;
let dl = { state: 'idle', pct: 0 }, stopTimer = null, startedAt = 0, saving = false, restarts = [];

const merge = c => { c = c || {}; const n = v => Number(v);
  return { enabled: !!c.enabled, auto: c.auto !== false, seconds: [15, 30, 60, 120, 180].includes(n(c.seconds)) ? n(c.seconds) : 60, fps: [30, 60].includes(n(c.fps)) ? n(c.fps) : 60,
    res: ['native', '1440', '1080', '720'].includes(c.res) ? c.res : 'native', bitrate: Math.max(4, Math.min(60, Math.round(n(c.bitrate)) || 16)), mic: !!c.mic,
    micGain: Math.max(0, Math.min(200, Math.round(n(c.micGain))) || 80), monitor: Math.max(0, Math.min(7, Math.round(n(c.monitor)) || 0)),
    dir: typeof c.dir === 'string' ? c.dir.slice(0, 260) : '', maxGB: Math.max(0, Math.min(500, Math.round(n(c.maxGB))) || 0), encoder: ['auto', ...ENCODERS].includes(c.encoder) ? c.encoder : 'auto' }; };

const ffDir = () => path.join(D.app.getPath('userData'), 'ffmpeg');
const ffPath = () => path.join(ffDir(), 'ffmpeg.exe');
const bufDir = () => path.join(D.app.getPath('userData'), 'clipbuf');
const thumbDir = () => { const d = path.join(D.app.getPath('userData'), 'clip-thumbs'); fs.mkdirSync(d, { recursive: true }); return d; };
const clipsDir = () => { const c = D.cfg(); const d = c.dir || path.join(D.app.getPath('videos'), 'Fuxi Clips'); try { fs.mkdirSync(d, { recursive: true }); } catch {} return d; };
const hasFfmpeg = () => { try { return fs.statSync(ffPath()).size > 1e6; } catch { return false; } };
const native = n => D.native(n);

function status() {
  return { installed: hasFfmpeg(), dl, running, encoder, error: lastErr, log: buf.slice(-600), last: lastClip, dir: clipsDir(), bufSeconds: running ? Math.min(D.cfg().seconds, Math.floor((Date.now() - startedAt) / 1000)) : 0 };
}
const changed = () => { try { D.onChange(); } catch {} };

// ---- ffmpeg sob demanda (não vai dentro do instalador) ----
async function install() {
  if (hasFfmpeg()) return { ok: true };
  if (dl.state === 'downloading') return { ok: true, busy: true };
  dl = { state: 'downloading', pct: 0 }; lastErr = null; changed();
  const tmp = path.join(D.app.getPath('temp'), 'fuxi-ffmpeg-' + Date.now()); fs.mkdirSync(tmp, { recursive: true });
  try {
    const r = await fetch(FF_URL, { redirect: 'follow' }); if (!r.ok) throw new Error('Download falhou (HTTP ' + r.status + ')');
    const total = +r.headers.get('content-length') || 0, zip = path.join(tmp, 'ff.zip'), out = fs.createWriteStream(zip); let got = 0, lastPush = 0;
    for await (const ch of r.body) { out.write(ch); got += ch.length; const pct = total ? Math.floor(got * 100 / total) : 0; if (pct !== dl.pct && Date.now() - lastPush > 400) { dl.pct = pct; lastPush = Date.now(); changed(); } }
    await new Promise((res, rej) => { out.end(); out.on('finish', res); out.on('error', rej); });
    dl = { state: 'extracting', pct: 100 }; changed();
    await new Promise((res, rej) => cp.execFile('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${path.join(tmp, 'x')}' -Force`], { windowsHide: true, timeout: 300000 }, e => e ? rej(e) : res()));
    const find = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { const f = find(p); if (f) return f; } else if (e.name === 'ffmpeg.exe') return p; } return null; };
    const src = find(path.join(tmp, 'x')); if (!src) throw new Error('ffmpeg.exe não encontrado no pacote');
    fs.mkdirSync(ffDir(), { recursive: true }); fs.copyFileSync(src, ffPath());
    dl = { state: 'idle', pct: 100 }; encoder = null;
  } catch (e) { dl = { state: 'idle', pct: 0 }; lastErr = 'Não consegui baixar o ffmpeg: ' + (e.message || e); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} changed(); }
  return { ok: hasFfmpeg(), error: hasFfmpeg() ? null : lastErr };
}

// ---- escolhe o melhor codificador que realmente funciona neste PC ----
function testEnc(name) {
  return new Promise(res => {
    cp.execFile(ffPath(), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=30', '-frames:v', '5', '-pix_fmt', 'nv12', '-c:v', name, '-f', 'null', '-'], { windowsHide: true, timeout: 15000 }, e => res(!e));
  });
}
async function pickEncoder() {
  const want = D.cfg().encoder; if (want !== 'auto' && await testEnc(want)) return want;
  if (encoder && want === 'auto') return encoder;
  for (const n of ENCODERS) if (await testEnc(n)) return n;
  return 'libx264';
}
function encArgs(name, c) {
  const br = c.bitrate + 'M', g = String(c.fps * SEG), common = ['-b:v', br, '-maxrate', Math.round(c.bitrate * 1.25) + 'M', '-bufsize', Math.round(c.bitrate * 2) + 'M', '-g', g, '-keyint_min', g];
  if (name === 'h264_nvenc') return ['-c:v', name, '-preset', 'p4', '-tune', 'll', '-rc', 'cbr', '-forced-idr', '1', ...common];
  if (name === 'h264_amf') return ['-c:v', name, '-quality', 'speed', '-rc', 'cbr', '-frame_skipping', '0', ...common];
  if (name === 'h264_qsv') return ['-c:v', name, '-preset', 'veryfast', ...common];
  return ['-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', ...common];
}

// ---- buffer de replay ----
async function start() {
  const c = D.cfg();
  if (running || starting) return { ok: true };
  if (!hasFfmpeg()) return { ok: false, error: 'ffmpeg não instalado' };
  starting = true; lastErr = null; clearTimeout(stopTimer); changed();
  try {
    encoder = await pickEncoder();
    try { fs.rmSync(bufDir(), { recursive: true, force: true }); } catch {}
    fs.mkdirSync(bufDir(), { recursive: true });
    const list = path.join(bufDir(), 'live.m3u8'), nseg = Math.ceil(c.seconds / SEG) + 4;
    let srcH = 0; try { srcH = D.screenH ? D.screenH(c.monitor) : 0; } catch {}
    const scale = c.res === 'native' || (srcH && +c.res >= srcH) ? '' : `,scale=-2:${c.res}:flags=fast_bilinear`;        // nunca aumenta a imagem; só reduz quando a tela é maior que o pedido
    const vf = `ddagrab=framerate=${c.fps}:output_idx=${c.monitor}:draw_mouse=1,hwdownload,format=bgra${scale},format=nv12`;
    const mic = c.mic && fs.existsSync(native('loopcap.exe')), ach = mic ? 4 : 2;
    const af = mic ? `pan=stereo|c0=c0+${(c.micGain / 100).toFixed(2)}*c2|c1=c1+${(c.micGain / 100).toFixed(2)}*c3,alimiter=limit=0.95` : 'anull';
    const args = ['-hide_banner', '-loglevel', 'warning', '-nostats', '-nostdin', '-y',
      '-f', 'lavfi', '-i', vf, '-probesize', '32', '-analyzeduration', '0', '-f', 's16le', '-ar', '48000', '-ch_layout', ach === 4 ? 'quad' : 'stereo', '-i', 'pipe:0',
      '-map', '0:v', '-map', '1:a', '-af', af, ...encArgs(encoder, c), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ac', '2',
      '-f', 'hls', '-hls_time', String(SEG), '-hls_list_size', String(nseg - 2), '-hls_flags', 'delete_segments+independent_segments+omit_endlist', '-hls_segment_type', 'mpegts',
      '-hls_segment_filename', path.join(bufDir(), 's%05d.ts'), list];
    helper = cp.spawn(native('loopcap.exe'), [mic ? 'both' : 'sys'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    ff = cp.spawn(ffPath(), args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    try { const os = require('os'); for (const p of [ff, helper]) os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}   // o jogo sempre tem preferência sobre a gravação
    helper.stdout.pipe(ff.stdin); ff.stdin.on('error', () => {}); helper.stdout.on('error', () => {});
    buf = ''; ff.stderr.on('data', d => { buf = (buf + d.toString()).slice(-4000); });
    const me = ff;
    ff.on('exit', code => {
      try { helper && helper.kill(); } catch {}
      if (ff !== me) return; ff = null; helper = null; const was = running; running = false; changed();
      if (!was && Date.now() - startedAt < 5000 || code) { lastErr = 'A gravação parou: ' + (buf.split('\n').filter(Boolean).slice(-2).join(' ') || 'erro desconhecido').slice(0, 220); changed(); }
      if (code && D.cfg().enabled && shouldRun()) autoRestart();
    });
    startedAt = Date.now(); running = true;
  } catch (e) { lastErr = 'Falha ao iniciar: ' + (e.message || e); }
  starting = false; changed(); return { ok: running, error: lastErr };
}
function autoRestart() {                                              // até 3 reinícios por minuto (ex.: monitor trocou); depois desiste e avisa
  const now = Date.now(); restarts = restarts.filter(t => now - t < 60000); if (restarts.length >= 3) { lastErr = (lastErr || 'A gravação parou') + ' (desisti de reiniciar)'; changed(); return; }
  restarts.push(now); setTimeout(() => { if (shouldRun() && !running) start(); }, 2500);
}
function stop() {
  clearTimeout(stopTimer); const p = ff, h = helper; ff = null; helper = null; running = false;
  try { h && h.kill(); } catch {}
  try { if (p) { p.stdin.end(); p.stdin.destroy(); setTimeout(() => { try { p.kill(); } catch {} }, 1500); } } catch {}
  changed(); return { ok: true };
}
const shouldRun = () => { const c = D.cfg(); return c.enabled && (!c.auto || D.inGame()); };
function sync() {                                                     // chamado quando liga/desliga, muda a config ou o jogo abre/fecha
  clearTimeout(stopTimer);
  if (shouldRun()) { if (!running && !starting) start(); else if (running) { /* config mudou: reinicia só se algo do vídeo mudou */ } }
  else if (running) stopTimer = setTimeout(() => { if (!shouldRun()) stop(); }, 4000);   // jogo fechou: espera 4 s (alt-tab, tela de carregamento)
}
function restart() { if (running) { stop(); setTimeout(sync, 800); } else sync(); }

// ---- salvar clipe ----
function readList() {
  try {
    const txt = fs.readFileSync(path.join(bufDir(), 'live.m3u8'), 'utf8'), out = [];
    for (const l of txt.split(/\r?\n/)) if (/^s\d+\.ts$/.test(l.trim())) out.push(path.join(bufDir(), l.trim()));
    return out.filter(f => { try { return fs.statSync(f).size > 0; } catch { return false; } });
  } catch { return []; }
}
const safe = s => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`; };
function run(args) { return new Promise(res => cp.execFile(ffPath(), args, { windowsHide: true, timeout: 120000 }, e => res(!e))); }

async function save(secs) {
  if (!running) return { ok: false, error: 'O buffer não está gravando agora.' };
  if (saving) return { ok: false, error: 'Já estou salvando um clipe.' };
  saving = true;
  try {
    const c = D.cfg(), segs = readList(); if (segs.length < 2) return { ok: false, error: 'Ainda não há vídeo suficiente no buffer.' };
    const want = Math.max(5, Math.min(c.seconds, secs || c.seconds)), use = segs.slice(-Math.ceil(want / SEG));   // a lista só traz pedaços já completos
    const name = (safe(D.gameName()) || 'Clipe') + ' ' + stamp(), outFile = path.join(clipsDir(), name + '.mp4');
    const copies = [];                                                            // copia os pedaços antes de juntar (o ffmpeg do buffer pode apagá-los)
    const tmp = path.join(bufDir(), 'save-' + Date.now()); fs.mkdirSync(tmp, { recursive: true });
    for (const f of use) { const t = path.join(tmp, path.basename(f)); try { fs.copyFileSync(f, t); copies.push(t); } catch {} }
    if (!copies.length) return { ok: false, error: 'Não consegui ler o buffer.' };
    const lst = path.join(tmp, 'list.txt'); fs.writeFileSync(lst, copies.map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
    const ok = await run(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', outFile]);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    if (!ok || !fs.existsSync(outFile)) return { ok: false, error: 'Falha ao montar o clipe.' };
    run(['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.5', '-i', outFile, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', path.join(thumbDir(), path.basename(outFile, '.mp4') + '.jpg')]);
    lastClip = { name: path.basename(outFile), at: Date.now() }; prune(); changed();
    return { ok: true, file: outFile, name: path.basename(outFile), seconds: copies.length * SEG };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
  finally { saving = false; }
}

// ---- galeria ----
function list() {
  const dir = clipsDir(), td = thumbDir(), out = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!/\.mp4$/i.test(f)) continue; const p = path.join(dir, f); let st; try { st = fs.statSync(p); } catch { continue; }
      const th = path.join(td, path.basename(f, '.mp4') + '.jpg');
      out.push({ name: f, size: st.size, mtime: st.mtimeMs, url: D.fileUrl(p), thumb: fs.existsSync(th) ? D.fileUrl(th) : null });
    }
  } catch {}
  return out.sort((a, b) => b.mtime - a.mtime);
}
const inDir = n => { n = path.basename(String(n || '')); return /\.mp4$/i.test(n) ? path.join(clipsDir(), n) : null; };
function remove(n) { const p = inDir(n); if (!p) return false; try { D.trash ? D.trash(p) : fs.unlinkSync(p); } catch { try { fs.unlinkSync(p); } catch { return false; } } try { fs.unlinkSync(path.join(thumbDir(), path.basename(p, '.mp4') + '.jpg')); } catch {} changed(); return true; }
function rename(n, to) {
  const p = inDir(n), nn = safe(String(to || '').replace(/\.mp4$/i, '')); if (!p || !nn) return false; const q = path.join(clipsDir(), nn + '.mp4'); if (fs.existsSync(q)) return false;
  try { fs.renameSync(p, q); const a = path.join(thumbDir(), path.basename(p, '.mp4') + '.jpg'); if (fs.existsSync(a)) fs.renameSync(a, path.join(thumbDir(), nn + '.jpg')); changed(); return true; } catch { return false; }
}
async function trim(n, from, to) {                                                // corta início/fim sem recodificar (rápido, no quadro-chave mais próximo)
  const p = inDir(n); from = Math.max(0, +from || 0); to = +to || 0; if (!p || !(to > from)) return { ok: false, error: 'Intervalo inválido' };
  const o = path.join(clipsDir(), path.basename(p, '.mp4') + ' (cortado).mp4');
  const ok = await run(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(from), '-to', String(to), '-i', p, '-c', 'copy', '-movflags', '+faststart', o]);
  if (!ok) return { ok: false, error: 'Falha ao cortar' };
  run(['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.3', '-i', o, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', path.join(thumbDir(), path.basename(o, '.mp4') + '.jpg')]).then(changed);
  changed(); return { ok: true, name: path.basename(o) };
}
function prune() {                                                                // limite de espaço: apaga os mais antigos
  const gb = D.cfg().maxGB; if (!gb) return; const max = gb * 1024 ** 3; let items = list().sort((a, b) => a.mtime - b.mtime), tot = items.reduce((s, x) => s + x.size, 0);
  while (tot > max && items.length > 1) { const x = items.shift(); if (inDir(x.name) && remove(x.name)) tot -= x.size; else break; }
}

function init(deps) { D = deps; try { fs.rmSync(bufDir(), { recursive: true, force: true }); } catch {} }
module.exports = { init, merge, DEFAULTS, status, install, start, stop, sync, restart, save, list, remove, rename, trim, hasFfmpeg };
