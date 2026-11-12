const { app, BrowserWindow, ipcMain, shell, dialog, screen, Tray, Menu, globalShortcut, nativeImage, desktopCapturer, session, net } = require('electron');
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const EQMath = require('./src/eqmath.js');
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'games.json'), 'utf8'));
const BANDS = DATA.bands;

// Identidade USB do Fuxi H3 (descoberta no PC do usuário)
const FUXI = { vid: '040B', pid: '0897', name: 'Fuxi H3' };

const APO_ROOT = process.env.FUXI_APO_ROOT || 'C:\\Program Files\\EqualizerAPO';   // a variável só serve para testar sem tocar no equalizador real
const APO_DIR = APO_ROOT + '\\config';
const APO_FILE = 'fuxi-hub.txt';

let win, settingsPath;
// ---- configuração dos avisos no canto da tela ----
const NOTIFY_DEFAULT = { enabled: true, types: { game: true, gameEnd: true, summary: true, device: true, preset: true, mic: true }, position: 'top-right', duration: 5, sound: true, volume: 0.7, style: 'full', anim: 'slide',
  gameSounds: true,                                                           // som de entrada com a "assinatura" de cada jogo
  dnd: true, dndAllow: { preset: false, mic: false, device: false } };       // "não incomodar jogando": com um jogo aberto, só avisa entrada/saída do jogo (e o que você permitir)
const POSITIONS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
function mergeNotify(n) {                    // completa o que falta e corrige valores inválidos
  const d = NOTIFY_DEFAULT, m = { ...d, ...(n || {}), types: { ...d.types, ...((n && n.types) || {}) } };
  m.enabled = !!m.enabled; m.sound = !!m.sound;
  for (const k of Object.keys(m.types)) m.types[k] = !!m.types[k];
  m.duration = Math.max(2, Math.min(12, Number(m.duration) || d.duration));
  const v = Number(m.volume); m.volume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : d.volume));
  if (!POSITIONS.includes(m.position)) m.position = d.position;
  if (!['full', 'compact'].includes(m.style)) m.style = d.style;
  if (!['slide', 'fade', 'none'].includes(m.anim)) m.anim = d.anim;
  m.gameSounds = !(n && n.gameSounds === false);
  m.dnd = !(n && n.dnd === false);
  m.dndAllow = { ...d.dndAllow }; if (n && n.dndAllow) for (const k of Object.keys(d.dndAllow)) m.dndAllow[k] = !!n.dndAllow[k];
  return m;
}
// ---- atalhos globais e bandeja ----
const HOTKEY_DEFAULT = { enabled: true, keys: { micMute: 'Ctrl+Alt+M', nextPreset: 'Ctrl+Alt+Right', prevPreset: 'Ctrl+Alt+Left', bypass: 'Ctrl+Alt+B', show: 'Ctrl+Alt+F', mini: 'Ctrl+Alt+V' } };
const HOTKEY_ACTIONS = Object.keys(HOTKEY_DEFAULT.keys);
const ACCEL_OK = /^((Ctrl|Alt|Shift|Super)\+)+([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Left|Right|Up|Down|Space|Home|End|PageUp|PageDown|Insert|Delete|Plus|Tab)$/;
function mergeHotkeys(h) {
  const d = HOTKEY_DEFAULT, m = { enabled: !(h && h.enabled === false), keys: { ...d.keys } };
  if (h && h.keys) for (const a of HOTKEY_ACTIONS) if (a in h.keys) m.keys[a] = (h.keys[a] === '' || ACCEL_OK.test(h.keys[a])) ? h.keys[a] : d.keys[a];
  return m;
}
// ---- abertura (animação ao abrir o app) ----
const INTRO_STYLES = ['off', 'pulse', 'scanner', 'waves', 'neon', 'cinema', 'draft'];
const mergeIntro = i => ({ style: INTRO_STYLES.includes(i && i.style) ? i.style : 'draft', sound: !(i && i.sound === false) });
// ao iniciar com o Windows: abre na tela com a abertura; depois fica aberto ('stay') ou vai para a bandeja ('tray') após `delay` segundos
// ---- cloud gaming (xCloud / GeForce NOW) e regras por programa ----
const UI_THEMES = ['auto', 'cyan', 'green', 'purple', 'red', 'amber'];
const mergeUi = u => { u = u || {}; return { reduceMotion: !!u.reduceMotion, cardFx: u.cardFx !== false, headset: ['white', 'bw', 'black'].includes(u.headset) ? u.headset : 'white',
  theme: UI_THEMES.includes(u.theme) ? u.theme : 'auto', style: ['amoled', 'glass', 'neon', 'paper'].includes(u.style) ? u.style : 'amoled', lang: ['pt', 'en', 'es'].includes(u.lang) ? u.lang : 'pt', spectrum: u.spectrum !== false, uiSounds: u.uiSounds !== false, presetWash: u.presetWash !== false, view3d: u.view3d === true, gameTheme: u.gameTheme !== false, gameMode: u.gameMode !== false,
  gmAlways: exeNames(u.gmAlways), gmIgnore: Array.isArray(u.gmIgnore) ? exeNames(u.gmIgnore) : GM_IGNORE_DEFAULT.slice() }; };
// Modo jogo: nomes de programa (sem .exe, minúsculos). "gmAlways" = sempre ativa o modo quando está na frente; "gmIgnore" = tela cheia dele não ativa (vídeo, navegador)
const GM_IGNORE_DEFAULT = ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'vlc', 'mpv', 'mpc-hc64', 'potplayermini64', 'netflix', 'spotify', 'wmplayer', 'video.ui'];
function exeNames(a) { const out = []; for (const s of Array.isArray(a) ? a : []) { const n = String(s || '').trim().toLowerCase().replace(/\.exe$/, ''); if (/^[\w .()+\-]{1,60}$/.test(n) && !out.includes(n)) out.push(n); if (out.length >= 40) break; } return out; }
// Música e vídeo: Spotify (app e web) e YouTube (web) trocam o preset sozinhos. "when": open = assim que abrir · play = só enquanto estiver tocando.
const mergeMedia = m => { m = m || {}; const one = (x, preset, when) => ({ enabled: !(x && x.enabled === false), preset: /^[\w-]{1,40}$/.test((x && x.preset) || '') ? x.preset : preset, when: ['open', 'play'].includes(x && x.when) ? x.when : when });
  return { enabled: m.enabled !== false, spotify: one(m.spotify, 'music', 'play'), youtube: one(m.youtube, 'movies', 'play') }; };
// Selo de jogo ativo: ícone pequeno num canto da tela enquanto o jogo roda (ou música/vídeo, se ligado)
const mergeBadge = b => { b = b || {}; return { enabled: b.enabled !== false, pos: POSITIONS.includes(b.pos) ? b.pos : 'bottom-left', style: ['pulse', 'blink', 'steady'].includes(b.style) ? b.style : 'pulse',
  size: b.size === 'small' ? 'small' : 'normal', media: !!b.media }; };
// textos do tray e das caixas de diálogo (a interface usa o tradutor do DOM)
const I18N_MAIN = { en: require('./src/i18n-en.js'), es: require('./src/i18n-es.js') };
const tm = s => { const d = I18N_MAIN[settings && settings.ui && settings.ui.lang]; return (d && d.D[s]) || s; };
// Tocando agora: disco pequeno girando no canto da tela enquanto o Spotify (ou o YouTube) toca
const mergeNp = n => { n = n || {}; return { enabled: n.enabled !== false, pos: POSITIONS.includes(n.pos) ? n.pos : 'bottom-right', size: n.size === 'small' ? 'small' : 'normal', showTitle: n.showTitle !== false, youtube: !!n.youtube }; };
// Microfone: o hub aplica um ajuste (ganho, corte de graves, presença...) ao microfone do Fuxi pelo Equalizer APO, sem mexer na saída de som.
const MIC_PRESETS = {
  natural: { gain: 0, hp: 0, warm: 0, presence: 0, air: 0, deess: 0 },
  clear:   { gain: 3, hp: 90, warm: -2, presence: 3, air: 2, deess: -2 },
  radio:   { gain: 3, hp: 70, warm: 3, presence: 2, air: 0, deess: -1 },
  soft:    { gain: 2, hp: 100, warm: 0, presence: 1, air: -2, deess: -4 }
};
const clampN = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
const mergeMic = m => { m = m || {}; const preset = ['natural', 'clear', 'radio', 'soft', 'custom'].includes(m.preset) ? m.preset : 'clear', base = MIC_PRESETS[preset] || MIC_PRESETS.clear, v = k => (preset !== 'custom' ? base[k] : m[k] !== undefined ? m[k] : base[k]);
  return { enabled: !!m.enabled, preset, gain: Math.round(clampN(v('gain'), -12, 18) * 2) / 2, hp: [0, 60, 70, 80, 90, 100, 120, 150].includes(+v('hp')) ? +v('hp') : 0, warm: Math.round(clampN(v('warm'), -6, 6) * 2) / 2,
    presence: Math.round(clampN(v('presence'), -6, 6) * 2) / 2, air: Math.round(clampN(v('air'), -6, 6) * 2) / 2, deess: Math.round(clampN(v('deess'), -8, 0) * 2) / 2 }; };
const mergeUpdate = u => { u = u || {}; return { auto: u.auto !== false, lastCheck: +u.lastCheck || 0, notified: /^[\d.]{1,20}$/.test(u.notified || '') ? u.notified : '' }; };
const mergeRemote = r => { r = r || {}; const port = +r.port; return { enabled: !!r.enabled, port: port >= 1024 && port <= 65535 ? port : 47630, token: /^[0-9a-f]{32}$/.test(r.token || '') ? r.token : require('crypto').randomBytes(16).toString('hex') }; };
const CLOUD_TOUCH = ['off', 'light', 'medium', 'strong', 'custom'];
const CLOUD_ANCHORS = [45, 150, 700, 2500, 5000, 10000];             // pontos (Hz) do toque personalizado: sub-grave, graves, médios, presença, claridade, "ar"
const mergeCloud = c => {
  const x = c || {}, lv = v => (CLOUD_TOUCH.includes(v) ? v : ''), cu = Array.isArray(x.custom) && x.custom.length === 6 ? x.custom : [-1, -.5, 0, .5, 1, 1.5];
  return {
    enabled: x.enabled !== false,
    touch: lv(x.touch) || 'medium',
    custom: cu.map(v => Math.max(-6, Math.min(6, Math.round((Number(v) || 0) * 2) / 2))),
    touchBy: { xcloud: lv(x.touchBy && x.touchBy.xcloud), gfn: lv(x.touchBy && x.touchBy.gfn) },          // '' = igual ao geral
    surround: ['same', 'off', 'light', 'medium', 'strong'].includes(x.surround) ? x.surround : 'same',
    services: { xcloud: !(x.services && x.services.xcloud === false), gfn: !(x.services && x.services.gfn === false) },
    ext: { enabled: !(x.ext && x.ext.enabled === false), windowFallback: !(x.ext && x.ext.windowFallback === false),          // extensão do navegador: liga/desliga e se os títulos de janela continuam valendo como plano B
      token: /^[0-9a-f]{32}$/.test((x.ext && x.ext.token) || '') ? x.ext.token : require('crypto').randomBytes(16).toString('hex') },
    learned: (Array.isArray(x.learned) ? x.learned : []).filter(r => r && /^[\w .\-]{1,40}$/.test(r.proc || '') && (r.svc === 'xcloud' || r.svc === 'gfn')).slice(0, 20)
      .map(r => ({ id: String(r.id || 'l_' + Math.random().toString(36).slice(2, 8)).slice(0, 20), svc: r.svc, proc: r.proc, contains: String(r.contains || '').slice(0, 60) })),
    log: Array.isArray(x.log) ? x.log.filter(e => e && typeof e.name === 'string').slice(0, 100).map(e => ({ svc: e.svc === 'gfn' ? 'gfn' : 'xcloud', name: e.name.slice(0, 60), id: String(e.id || '').slice(0, 40), start: +e.start || 0, ms: Math.max(0, +e.ms || 0) })) : []
  };
};
const mergeRules = r => (Array.isArray(r) ? r : []).filter(x => x && typeof x.exe === 'string' && /^[\w .()+\-]{1,80}\.exe$/i.test(x.exe) && typeof x.preset === 'string' && /^[\w-]{1,40}$/.test(x.preset))
  .slice(0, 40).map(x => ({ id: String(x.id || 'r_' + Math.random().toString(36).slice(2, 8)).slice(0, 20), exe: x.exe, preset: x.preset, label: String(x.label || '').slice(0, 30), enabled: x.enabled !== false }));
const SURROUND_LEVELS = ['off', 'light', 'medium', 'strong'];
const mergeSurround = s => {
  const per = {}; if (s && s.perGame && typeof s.perGame === 'object') for (const [k, v] of Object.entries(s.perGame)) if (/^[\w-]{1,40}$/.test(k) && SURROUND_LEVELS.includes(v)) per[k] = v;
  return { managed: !!(s && s.managed), enabled: !!(s && s.enabled), level: ['light', 'medium', 'strong'].includes(s && s.level) ? s.level : 'medium',
    hrir: /^[\w+\-]{1,24}$/.test((s && s.hrir) || '') ? s.hrir : 'atmos', deviceGuid: /^[0-9a-f-]{36}$/i.test((s && s.deviceGuid) || '') ? s.deviceGuid.toLowerCase() : '', perGame: per };
};
const mergeStartup = s => ({ afterIntro: s && s.afterIntro === 'stay' ? 'stay' : 'tray', delay: Math.max(0, Math.min(30, Math.round(Number(s && s.delay)) || (s && s.delay === 0 ? 0 : 3))) });
let settings = { auto: true, overrides: {}, manual: 'default', custom: [], assign: {}, notify: mergeNotify(), hotkeys: mergeHotkeys(), closeToTray: true, trayHint: false, intro: mergeIntro(), startup: mergeStartup(), cloud: mergeCloud(), rules: [], rulesEnabled: true, surround: mergeSurround() };
let previewActive = false;      // true enquanto o equalizador toca uma prévia (ao vivo / A-B) que ainda não foi salva
let state = { device: { connected: false, known: false, name: null, others: [] }, game: null, active: 'default', engine: null };

const native = n => path.join(app.isPackaged ? path.join(process.resourcesPath, 'native') : path.join(__dirname, 'native'), n);

function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) }; } catch {}
  settings.notify = mergeNotify(settings.notify);
  settings.hotkeys = mergeHotkeys(settings.hotkeys);
  settings.closeToTray = settings.closeToTray !== false;
  if (!settings.exes || typeof settings.exes !== 'object') settings.exes = {};
  settings.ui = mergeUi(settings.ui); settings.media = mergeMedia(settings.media); settings.badge = mergeBadge(settings.badge); settings.nowplaying = mergeNp(settings.nowplaying); settings.micfx = mergeMic(settings.micfx); settings.update = mergeUpdate(settings.update); settings.remote = mergeRemote(settings.remote); settings.gpu = settings.gpu === true;
  if (!/^[\d.]{1,20}$/.test(settings.seenVersion || '')) settings.seenVersion = (settings.tutorial && settings.tutorial.done) ? '0.0.0' : app.getVersion();     // instalação nova não vê as novidades; quem atualiza vê
  settings.detectGeneric = settings.detectGeneric !== false;
  settings.audioSwitch = settings.audioSwitch !== false;
  if (!Array.isArray(settings.favorites)) settings.favorites = [];
  if (!settings.stats || typeof settings.stats !== 'object') settings.stats = {};
  settings.usage = { days: (Array.isArray(settings.usage && settings.usage.days) ? settings.usage.days : []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-400) };
  settings.ach = (settings.ach && typeof settings.ach === 'object') ? Object.fromEntries(Object.entries(settings.ach).filter(([k, v]) => /^[\w-]{1,30}$/.test(k) && Number.isFinite(+v)).slice(0, 80)) : {};
  settings.achSeeded = !!settings.achSeeded;
  settings.intro = mergeIntro(settings.intro);
  settings.startup = mergeStartup(settings.startup);
  settings.tutorial = { done: !!(settings.tutorial && settings.tutorial.done) };
  settings.cloud = mergeCloud(settings.cloud);
  settings.rules = mergeRules(settings.rules); settings.rulesEnabled = settings.rulesEnabled !== false;
  settings.surround = mergeSurround(settings.surround);
  settings.ignoredGames = (Array.isArray(settings.ignoredGames) ? settings.ignoredGames : []).filter(s => /^[a-z0-9]{1,60}$/.test(s)).slice(-300);
  settings.userGames = (Array.isArray(settings.userGames) ? settings.userGames : []).filter(g => g && /^g_[a-z0-9]{1,40}$/.test(g.id) && typeof g.name === 'string' && /^#[0-9a-f]{6}$/i.test(g.color || '')).slice(0, 100)
    .map(g => ({ id: g.id, name: g.name.slice(0, 60), color: g.color, exe: /^[\w .()+\-]{1,80}\.exe$/i.test(g.exe || '') ? g.exe : '', dir: typeof g.dir === 'string' ? g.dir.slice(0, 260) : '', store: String(g.store || '').slice(0, 12) }));
  settings.userGames.forEach(registerUserGame);
}
function saveSettings() { try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); } catch {} }

// ---------- perfis ----------
// suffix: '' = card da aba Jogos · '-banner' = aviso de modo de jogo (largo) · '-icon' = aviso compacto (quadrado). Sem a variante, usa a arte do card.
function artFor(id, suffix = '') {
  const dirs = [path.join(app.getPath('userData'), 'games'), path.join(__dirname, 'assets', 'games')];
  for (const d of dirs) for (const e of ['png', 'jpg', 'jpeg', 'webp']) {
    const f = path.join(d, `${id}${suffix}.${e}`);
    if (fs.existsSync(f)) return pathToFileURL(f).href;
  }
  return null;
}
let THEMES = {}; try { THEMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'themes.json'), 'utf8').replace(/^\uFEFF/, '')); } catch {}
const themeOf = id => { const t = THEMES[id]; if (!t) return null; const f = t.art ? path.join(__dirname, 'assets', 'themes', t.art) : ''; return { ...t, artUrl: f && fs.existsSync(f) ? pathToFileURL(f).href : '' }; };
function allProfiles() {
  const base = [...DATA.profiles, ...DATA.games].map(p => {
    const d = EQMath.normalize(p.f || p.q || p.t ? { g: p.eq, f: p.f, q: p.q, t: p.t } : p.eq, BANDS);   // original de fábrica (em games.json, "f", "q" e "t" são opcionais por jogo)
    const cur = settings.overrides[p.id] ? EQMath.normalize(settings.overrides[p.id], BANDS) : d;   // o que o usuário salvou (aceita formato antigo)
    return { ...p, defaultEq: d.g, defaultF: d.f, defaultQ: d.q, defaultT: d.t, eq: cur.g, f: cur.f, q: cur.q, t: cur.t, art: artFor(p.id), banner: artFor(p.id, '-banner') || artFor(p.id), iconArt: artFor(p.id, '-icon') || artFor(p.id), theme: themeOf(p.id),
      assigned: p.exe ? (settings.assign[p.id] || null) : undefined, userExe: p.exe ? ((settings.exes && settings.exes[p.id]) || []) : undefined };
  });
  const custom = settings.custom.map(c => {
    const n = EQMath.normalize({ g: c.eq, f: c.f, q: c.q, t: c.t }, BANDS);
    return { ...c, custom: true, tag: 'Seu preset', color: c.color || '#2ef2ff', eq: n.g, f: n.f, q: n.q, t: n.t, defaultEq: n.g, defaultF: n.f, defaultQ: n.q, defaultT: n.t };
  });
  return [...base, ...custom];
}
const findProfile = id => allProfiles().find(p => p.id === id) || dynProfile(id);
function dynProfile(id) {                                       // jogo reconhecido sozinho que não está na lista: usa o preset "Jogos" com o nome da pasta
  const d = dynGames[id], b = d && allProfiles().find(p => p.id === 'gaming'); if (!b) return undefined;
  return { ...b, id, name: d.name, tag: 'Jogo detectado', color: d.color, exe: [], art: null, banner: null, iconArt: null };
}

// ---------- Motor de EQ (Equalizer APO) ----------
function engineStatus() {
  const installed = fs.existsSync(APO_DIR);
  let linked = false;
  if (installed) { try { linked = fs.readFileSync(path.join(APO_DIR, 'config.txt'), 'utf8').includes(APO_FILE); } catch {} }
  return { installed, linked };
}
function micBlock() {
  const m = settings.micfx; if (!m || !m.enabled || !state.micApo || !state.micApo.guid) return null;
  const f = [], gains = [], fs_ = [], qs = [], ty = [];
  const add = (type, fc, g, q) => { f.push(`Filter: ON ${type} Fc ${fc} Hz${type === 'HPQ' ? '' : ` Gain ${g.toFixed(1)} dB`} Q ${q}`); if (type !== 'HPQ') { fs_.push(fc); gains.push(g); qs.push(q); ty.push(type); } };
  if (m.hp > 0) add('HPQ', m.hp, 0, 0.707);
  if (m.warm) add('PK', 150, m.warm, 0.8);
  if (m.presence) add('PK', 3000, m.presence, 1.0);
  if (m.air) add('HSC', 9000, m.air, 0.7);
  if (m.deess) add('PK', 7000, m.deess, 3.0);
  const pre = Math.max(-30, Math.min(18, m.gain));                       // o ganho é o que você escolhe; filtros altos + ganho alto podem distorcer
  return [`If: sizeof(regexSearch("capture", stage)) > 0 and sizeof(regexSearch("${state.micApo.guid.toLowerCase()}", tolower(deviceGuid))) > 0`, `Preamp: ${pre.toFixed(1)} dB`, ...f, 'EndIf:'];
}
function buildConfig(p, preampOverride) {
  // preamp pelo pico REAL da curva (faixas vizinhas se somam), não só pelo maior ganho
  const pre = preampOverride !== undefined ? preampOverride : EQMath.preamp(p.f, p.eq, p.q, p.t);
  const lines = [`Preamp: ${pre.toFixed(1)} dB`];
  p.eq.forEach((g, i) => lines.push(`Filter ${i + 1}: ON ${(p.t && p.t[i]) || 'PK'} Fc ${p.f[i]} Hz Gain ${g.toFixed(1)} dB Q ${p.q[i]}`));
  const mb = micBlock();
  if (mb) return ['If: sizeof(regexSearch("capture", stage)) == 0', ...lines, 'EndIf:', ...mb].join('\r\n') + '\r\n';       // a curva de saída não vale para o microfone
  return lines.join('\r\n') + '\r\n';
}
// "Toque cloud": o áudio de streaming é comprimido (Opus) e perde graves profundos e brilho nos agudos. Em sessão cloud o hub ajusta o preset
// do jogo por frequência: menos sub-grave (quase não existe no stream), um pouco mais de presença e de "ar". Nível: leve ×0,5, médio ×1, forte ×1,5.
const CLOUD_SCALE = { off: 0, light: .5, medium: 1, strong: 1.5 };
const cloudDelta = f => (f <= 45 ? -1.5 : f <= 90 ? -1 : f <= 200 ? -.5 : f < 1500 ? 0 : f < 3000 ? .5 : f < 6500 ? 1 : f < 12000 ? 1.5 : .5);
function customDelta(f, arr) {                                        // interpolação (em frequência logarítmica) entre os 6 pontos do toque personalizado
  const A = CLOUD_ANCHORS; if (f <= A[0]) return arr[0]; if (f >= A[5]) return arr[5];
  for (let i = 0; i < 5; i++) if (f <= A[i + 1]) { const t = Math.log(f / A[i]) / Math.log(A[i + 1] / A[i]); return arr[i] + (arr[i + 1] - arr[i]) * t; }
  return 0;
}
function withCloudTouch(p) {
  const svc = state.cloud && state.cloud.svc, c = settings.cloud, lvl = (svc && c.touchBy[svc]) || c.touch;      // cada serviço pode ter o seu nível
  const d = lvl === 'custom' ? f => customDelta(f, c.custom) : (CLOUD_SCALE[lvl] ? f => cloudDelta(f) * CLOUD_SCALE[lvl] : null);
  if (!d) return p;
  return { ...p, eq: p.eq.map((g, i) => Math.max(-12, Math.min(12, Math.round((g + d(p.f[i])) * 2) / 2))) };
}
function applyEq(profileId) {
  const p0 = findProfile(profileId);
  if (!p0) return;
  const p = state.cloud ? withCloudTouch(p0) : p0;
  previewActive = false; state.bypass = false;
  state.active = profileId;
  const eng = engineStatus();
  state.engine = eng;
  if (eng.installed) {
    try {
      fs.writeFileSync(path.join(APO_DIR, APO_FILE), buildConfig(p));
      if (!eng.linked) {
        try { linkConfig(); state.engine = engineStatus(); }
        catch { state.engine = { ...eng, needsAdmin: true }; }
      }
    } catch { state.engine = { ...eng, needsAdmin: true }; }
  }
  push();
}

// O config.txt padrão do APO só tem "Preamp -6 dB + exemplo". Se for o padrão, o hub assume o arquivo
// (com backup); se o usuário já personalizou, apenas acrescenta o Include no fim.
function linkConfig() {
  const cfg = path.join(APO_DIR, 'config.txt');
  const txt = fs.readFileSync(cfg, 'utf8');
  if (txt.includes(APO_FILE)) return;
  const bak = cfg + '.fuxi-backup';
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, txt);
  const stock = /^\s*Preamp:\s*-6 dB\s*Include:\s*example\.txt\s*GraphicEQ:[^\n]*$/i.test(txt.replace(/\r/g, '').trim());
  const out = stock
    ? `# Gerenciado pelo Fuxi Hub (original em config.txt.fuxi-backup)\r\nInclude: ${APO_FILE}\r\n`
    : txt.replace(/\s*$/, '') + `\r\nInclude: ${APO_FILE}\r\n`;
  fs.writeFileSync(cfg, out);
}

// ---------- Dispositivo ----------
const PS = `
$u = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like 'USB\\VID_${FUXI.vid}&PID_${FUXI.pid}*' }
$a = Get-PnpDevice -PresentOnly -Class AudioEndpoint -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -notmatch 'Sonar|Digital Output|AMD|Microphone' } | Select-Object -ExpandProperty FriendlyName
$ep = Get-PnpDevice -PresentOnly -Class AudioEndpoint -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'Fuxi' -and $_.FriendlyName -notmatch 'Microphone' } | Select-Object -First 1 -ExpandProperty InstanceId
$epGuid = if ($ep -match '\\.\\{([0-9A-Fa-f-]{36})\\}$') { $Matches[1] } else { '' }
$apo = @(Get-ChildItem 'HKLM:\\SOFTWARE\\EqualizerAPO\\Child APOs' -ErrorAction SilentlyContinue | ForEach-Object { $_.PSChildName })
$mic = Get-PnpDevice -PresentOnly -Class AudioEndpoint -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'Fuxi' -and $_.FriendlyName -match 'Microphone|Microfone' } | Select-Object -First 1
$micGuid = if ($mic.InstanceId -match '\\.\\{([0-9A-Fa-f-]{36})\\}$') { $Matches[1] } else { '' }
@{ fuxi = [bool]$u; audio = @($a); epGuid = $epGuid; apo = $apo; micGuid = $micGuid; micName = [string]$mic.FriendlyName } | ConvertTo-Json -Compress
`;
// Saída de som: ao ligar o Fuxi ele vira a saída padrão do Windows; ao desligar, volta a que estava antes.
let fuxiEp = null;
const sameId = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
async function switchToFuxi() {
  if (!settings.audioSwitch || !fuxiEp) return true;
  const id = '{0.0.0.00000000}.{' + fuxiEp + '}';
  const r = await run('audiohelper.exe', ['defaults']); let d = null; try { d = JSON.parse(r.out); } catch {}
  if (!d) return false;
  if (sameId(d.render_console, id)) return true;                                // já é a saída padrão
  if (d.render_console) { settings.prevOutput = d.render_console; saveSettings(); }
  const s = await run('audiohelper.exe', ['setdefault', id]);
  return s.out.trim() === 'ok';
}
function trySwitchOutput(tries) {                                                // o dispositivo pode demorar um instante para aparecer: tenta algumas vezes
  switchToFuxi().then(ok => { if (!ok && tries > 0) setTimeout(() => trySwitchOutput(tries - 1), 2500); });
}
async function restoreOutput() {
  if (!settings.audioSwitch || !settings.prevOutput) return;
  const id = settings.prevOutput; settings.prevOutput = null; saveSettings();
  await run('audiohelper.exe', ['setdefault', id]);                             // se o dispositivo anterior sumiu, o helper só devolve erro e nada muda
}
ipcMain.handle('set-audio-switch', (_, v) => { settings.audioSwitch = !!v; saveSettings(); push(); return settings.audioSwitch; });
function pollDevice() {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS], { windowsHide: true, timeout: 15000 }, (err, out) => {
    if (err) return;
    try {
      const r = JSON.parse(out.trim());
      const audio = [].concat(r.audio || []);
      const known = r.fuxi || audio.some(n => /fuxi/i.test(n));
      const next = { connected: known || audio.length > 0, known, name: known ? FUXI.name : (audio[0] || null), others: audio };
      const apo = [].concat(r.apo || []).map(s => s.toLowerCase());
      const reg = { count: apo.length, fuxi: !!r.epGuid && apo.some(n => n.includes(r.epGuid.toLowerCase())) };
      let changed = false;
      if (r.epGuid) { const first = !fuxiEp; fuxiEp = r.epGuid; if (first || settings.surround.deviceGuid !== fuxiEp.toLowerCase()) applySurround(); }
      if (lastKnown !== null && known !== lastKnown) {                          // a primeira leitura só define a base: não avisa nem troca a saída ao abrir o app
        notifyDevice(known);
        if (known) trySwitchOutput(3); else restoreOutput();
      }
      lastKnown = known;
      if (JSON.stringify(next) !== JSON.stringify(state.device)) { state.device = next; changed = true; }
      if (JSON.stringify(reg) !== JSON.stringify(state.apo)) { state.apo = reg; changed = true; }
      const mg = String(r.micGuid || '').toLowerCase(), micApo = { guid: mg, name: r.micName || '', registered: !!mg && apo.some(n => n.includes(mg)) };
      if (JSON.stringify(micApo) !== JSON.stringify(state.micApo)) { const had = state.micApo && state.micApo.guid; state.micApo = micApo; changed = true; if (settings.micfx.enabled && had !== mg) setTimeout(refreshEngineFile, 300); }
      if (changed) push();
    } catch {}
  });
}

// ---------- Jogos ----------
// Reconhecimento automático, em 3 camadas (da mais certa para a mais ampla):
//  1) programa (.exe) conhecido ou vinculado por você;
//  2) o jogo mora numa pasta com o nome dele (ex.: ...\steamapps\common\ELDEN RING\...) — funciona qualquer que seja o nome do .exe e já vale para jogos que você ainda vai instalar;
//  3) qualquer outro jogo instalado por uma loja (Steam, Epic, Riot, Ubisoft, GOG, EA, Xbox, Rockstar, pasta "Games"): entra como "Jogo" genérico, com o nome da pasta.
const ALIAS = {
  fortnite: ['fortnite'], valorant: ['valorant'], cs2: ['counterstrikeglobaloffensive', 'counterstrike2', 'cs2'], pubg: ['pubg', 'pubgbattlegrounds'],
  gow: ['godofwar', 'godofwarragnarok'], apex: ['apexlegends'], warzone: ['callofduty', 'callofdutywarzone', 'warzone', 'callofdutyhq', 'callofdutymodernwarfare'],
  overwatch: ['overwatch', 'overwatch2'], r6: ['rainbowsixsiege', 'tomclancysrainbowsixsiege'], lol: ['leagueoflegends'], gta5: ['grandtheftautov', 'gta5', 'gtav'],
  rocketleague: ['rocketleague'], cyberpunk: ['cyberpunk2077'], eldenring: ['eldenring'], rdr2: ['reddeadredemption2', 'rdr2'], dota2: ['dota2', 'dota2beta'],
  bf2042: ['battlefield2042', 'bf2042'], tarkov: ['escapefromtarkov'], witcher3: ['thewitcher3wildhunt', 'thewitcher3', 'witcher3']
};
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const LIB = [/\\steamapps\\common\\([^\\]+)\\/i, /\\epic games\\(?!launcher|epicgameslauncher|directxredist|portal|epic online services)([^\\]+)\\/i, /\\riot games\\(?!riot client)([^\\]+)\\/i,
  /\\ubisoft game launcher\\games\\([^\\]+)\\/i, /\\gog galaxy\\games\\([^\\]+)\\/i, /\\gog games\\([^\\]+)\\/i, /\\ea games\\([^\\]+)\\/i, /\\origin games\\([^\\]+)\\/i,
  /\\xboxgames\\([^\\]+)\\/i, /\\rockstar games\\(?!launcher|social club)([^\\]+)\\/i, /\\games\\([^\\]+)\\/i];
const NOT_GAME_EXE = /leagueclient|riotclient|crashpad|crashhandler|crashreport|unitycrash|launcher|updater|helper|setup|unins|redist|easyanticheat|beservice|eosoverlay|cef|vcredist|dxsetup|installer|bootstrap|socialclub|overlay|reporter/i;
const NOT_GAME_DIR = /redist|steamworks|proton|soundtrack|wallpaper|common redistributables|steam controller|directx|vcredist|benchmark|sdk|server$|dedicated/i;
const dynGames = {};
const slug = s => 'g_' + (norm(s).slice(0, 40) || 'jogo');
const hashColor = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; const hsl = [h % 360, 78, 62], k = n => (n + hsl[0] / 30) % 12, a = hsl[1] / 100 * Math.min(hsl[2] / 100, 1 - hsl[2] / 100), f = n => hsl[2] / 100 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); };
function dynGame(folder) {
  const id = slug(folder);
  if (!dynGames[id]) dynGames[id] = { name: folder.replace(/[_]+/g, ' ').trim(), color: hashColor(folder) };
  return id;
}
const effective = gameId => (gameId && settings.assign[gameId]) || (gameId && dynGames[gameId] ? 'gaming' : gameId);
// programas que o hub procura por jogo = os conhecidos (games.json) + os que você vinculou
const exeList = g => [...g.exe, ...((settings.exes && settings.exes[g.id]) || [])].map(s => s.toLowerCase());
function detectGame(procs) {
  const names = new Set(procs.map(p => p.name.toLowerCase() + '.exe'));
  const hit = DATA.games.find(g => exeList(g).some(e => names.has(e)));                                   // 1) .exe conhecido/vinculado
  if (hit) return hit.id;
  const cand = procs.filter(p => p.path && !NOT_GAME_EXE.test(p.name)).sort((a, b) => b.mb - a.mb);        // o jogo costuma ser o processo mais pesado
  for (const p of cand) {                                                                                  // 2) pasta com o nome de um jogo conhecido
    const segs = p.path.split('\\').slice(1, -1).map(norm);
    for (const [id, al] of Object.entries(ALIAS)) if (segs.some(s => al.includes(s))) return id;
  }
  if (settings.detectGeneric === false) return null;                                                       // reconhecimento de jogos "fora da lista" desligado
  for (const p of cand) for (const re of LIB) {                                                            // 3) qualquer jogo instalado por uma loja
    const m = p.path.match(re);
    if (m && !NOT_GAME_DIR.test(m[1]) && p.mb >= 150) return dynGame(m[1]);
  }
  return null;
}
// estatísticas de uso por jogo (para ordenar por "mais jogados" e "recentes"): quantas vezes abriu, quando, e tempo total
let playStart = 0;
function trackPlay(prev, id) {
  const now = Date.now();
  if (prev && DATA.games.some(g => g.id === prev) && playStart) {
    const s = settings.stats[prev] = settings.stats[prev] || { count: 0, last: 0, ms: 0 };
    s.ms += now - playStart; s.last = now;
  }
  playStart = id ? now : 0;
  if (id && DATA.games.some(g => g.id === id)) {
    const s = settings.stats[id] = settings.stats[id] || { count: 0, last: 0, ms: 0 };
    s.count++; s.last = now;
  }
  saveSettings();
}
ipcMain.handle('set-ui', (_, p) => { settings.ui = mergeUi({ ...settings.ui, ...(p || {}) }); saveSettings(); push(); return settings.ui; });
ipcMain.handle('set-detect', (_, v) => { settings.detectGeneric = !!v; saveSettings(); push(); pollGames(); return settings.detectGeneric; });
// dias de uso (sequência) e conquistas: o renderer calcula o que foi alcançado; aqui só se guarda quando
function markToday() { const d = new Date().toLocaleDateString('sv'), a = settings.usage.days; if (a[a.length - 1] !== d) { a.push(d); if (a.length > 400) a.shift(); saveSettings(); } }
ipcMain.handle('ach-unlock', (_, ids) => {
  const out = [], now = Date.now(), silent = !settings.achSeeded;
  for (const id of (Array.isArray(ids) ? ids : [])) if (/^[\w-]{1,30}$/.test(id) && !settings.ach[id]) { settings.ach[id] = now; out.push(id); }
  settings.achSeeded = true; saveSettings(); push(); return { fresh: out, silent };
});
ipcMain.handle('reset-stats', () => { settings.stats = {}; saveSettings(); push(); return true; });
ipcMain.handle('open-data-folder', () => shell.openPath(app.getPath('userData')));

// ---------- Backup e restauração ----------
// O backup guarda tudo que é seu: presets (editados e criados), preset por jogo, avisos, atalhos, abertura, favoritos, estatísticas e programas vinculados.
let lastBackup = null;
const BACKUP_KEYS = ['auto', 'overrides', 'manual', 'custom', 'assign', 'notify', 'hotkeys', 'closeToTray', 'intro', 'exes', 'favorites', 'stats', 'ui', 'detectGeneric', 'audioSwitch', 'micVol', 'startup', 'cloud', 'media', 'badge', 'nowplaying', 'micfx', 'rules', 'rulesEnabled', 'surround'];
const ID_OK = /^[\w-]{1,40}$/;
const makeBackup = () => { const s = {}; for (const k of BACKUP_KEYS) if (k in settings) s[k] = settings[k]; return { app: 'fuxi-hub', version: app.getVersion(), exportedAt: new Date().toISOString(), settings: s }; };
const backupDir = () => { const d = path.join(app.getPath('userData'), 'backups'); fs.mkdirSync(d, { recursive: true }); return d; };
function autoBackup() {                                                         // 1 cópia por dia, guarda as 7 últimas
  try {
    const d = backupDir(), day = new Date().toISOString().slice(0, 10), f = path.join(d, `fuxi-hub-${day}.json`);
    if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(makeBackup(), null, 2));
    const files = fs.readdirSync(d).filter(x => /^fuxi-hub-\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort();
    while (files.length > 7) fs.unlinkSync(path.join(d, files.shift()));
    lastBackup = files.length ? files[files.length - 1].slice(10, 20) : null;
  } catch {}
}
function applyBackup(b) {                                                       // valida tudo antes de aceitar (arquivo de fora nunca entra cru)
  if (!b || b.app !== 'fuxi-hub' || !b.settings || typeof b.settings !== 'object') return false;
  const s = b.settings, next = { ...settings }, isObj = o => o && typeof o === 'object' && !Array.isArray(o), ids = DATA.games.map(g => g.id);
  if (typeof s.auto === 'boolean') next.auto = s.auto;
  if (isObj(s.overrides)) { next.overrides = {}; for (const [k, v] of Object.entries(s.overrides)) if (ID_OK.test(k) && isObj(v) || (ID_OK.test(k) && Array.isArray(v))) next.overrides[k] = EQMath.normalize(v, BANDS); }
  if (typeof s.manual === 'string' && ID_OK.test(s.manual)) next.manual = s.manual;
  if (Array.isArray(s.custom)) next.custom = s.custom.filter(c => c && typeof c.id === 'string' && ID_OK.test(c.id) && typeof c.name === 'string').slice(0, 100).map(c => {
    const n = EQMath.normalize({ g: c.eq, f: c.f, q: c.q, t: c.t }, BANDS);
    return { id: c.id, name: c.name.slice(0, 40), color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#2ef2ff', eq: n.g, f: n.f, q: n.q, t: n.t };
  });
  if (isObj(s.assign)) { next.assign = {}; for (const [k, v] of Object.entries(s.assign)) if (typeof v === 'string' && ID_OK.test(k) && ID_OK.test(v)) next.assign[k] = v; }
  if (isObj(s.notify)) next.notify = mergeNotify(s.notify);
  if (isObj(s.hotkeys)) next.hotkeys = mergeHotkeys(s.hotkeys);
  if (isObj(s.intro)) next.intro = mergeIntro(s.intro);
  if (isObj(s.startup)) next.startup = mergeStartup(s.startup);
  if (isObj(s.cloud)) next.cloud = mergeCloud(s.cloud);
  if (isObj(s.media)) next.media = mergeMedia(s.media);
  if (isObj(s.badge)) next.badge = mergeBadge(s.badge);
  if (isObj(s.nowplaying)) next.nowplaying = mergeNp(s.nowplaying);
  if (isObj(s.micfx)) next.micfx = mergeMic(s.micfx);
  if (isObj(s.surround)) next.surround = mergeSurround(s.surround);
  if (Array.isArray(s.rules)) next.rules = mergeRules(s.rules);
  if (typeof s.rulesEnabled === 'boolean') next.rulesEnabled = s.rulesEnabled;
  if (typeof s.closeToTray === 'boolean') next.closeToTray = s.closeToTray;
  if (isObj(s.ui)) next.ui = mergeUi(s.ui);
  if (typeof s.detectGeneric === 'boolean') next.detectGeneric = s.detectGeneric;
  if (typeof s.audioSwitch === 'boolean') next.audioSwitch = s.audioSwitch;
  if (Array.isArray(s.favorites)) next.favorites = s.favorites.filter(x => ids.includes(x));
  if (isObj(s.exes)) { next.exes = {}; for (const [k, v] of Object.entries(s.exes)) if (ids.includes(k) && Array.isArray(v)) next.exes[k] = v.filter(x => typeof x === 'string' && EXE_OK.test(x)).slice(0, 20); }
  if (isObj(s.stats)) { next.stats = {}; for (const [k, v] of Object.entries(s.stats)) if (ids.includes(k) && isObj(v)) next.stats[k] = { count: Math.max(0, +v.count || 0), last: Math.max(0, +v.last || 0), ms: Math.max(0, +v.ms || 0) }; }
  if (Number.isFinite(+s.micVol)) next.micVol = Math.max(1, Math.min(100, +s.micVol));
  settings = next; saveSettings(); registerHotkeys(); applyEq(settings.manual || 'default'); push();
  return true;
}
ipcMain.handle('backup-export', async () => {
  const day = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(win, { title: 'Salvar backup do Fuxi Hub', defaultPath: path.join(app.getPath('documents'), `fuxi-hub-backup-${day}.json`), filters: [{ name: 'Backup do Fuxi Hub', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  try { fs.writeFileSync(r.filePath, JSON.stringify(makeBackup(), null, 2)); return path.basename(r.filePath); } catch { return false; }
});
ipcMain.handle('backup-import', async (_, fromAuto) => {
  let file = fromAuto;
  if (!file) {
    const r = await dialog.showOpenDialog(win, { title: 'Restaurar backup do Fuxi Hub', properties: ['openFile'], defaultPath: backupDir(), filters: [{ name: 'Backup do Fuxi Hub', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    file = r.filePaths[0];
  }
  let b; try { if (fs.statSync(file).size > 3 * 1024 * 1024) return false; b = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return false; }
  if (!b || b.app !== 'fuxi-hub') return false;
  const c = await dialog.showMessageBox(win, { type: 'question', buttons: [tm('Restaurar'), tm('Cancelar')], defaultId: 1, cancelId: 1, title: tm('Restaurar backup'), message: tm('Substituir suas configurações atuais por este backup?'), detail: 'Presets, atalhos, avisos, favoritos e o resto voltam ao que estava no arquivo' + (b.exportedAt ? ' (' + String(b.exportedAt).slice(0, 10) + ')' : '') + '.' });
  if (c.response !== 0) return null;
  return applyBackup(b);
});
ipcMain.handle('open-backup-folder', () => shell.openPath(backupDir()));
if (process.env.FUXI_SHOTS) ipcMain.handle('test-hook', async (_, what) => {     // só existe nos testes automáticos
  const out = {};
  if (what === 'backup') {
    const before = JSON.stringify(makeBackup().settings);
    out.roundtrip = applyBackup(JSON.parse(JSON.stringify(makeBackup()))) && JSON.stringify(makeBackup().settings) === before;
    out.badRejected = [null, {}, { app: 'x' }, { app: 'fuxi-hub' }, { app: 'fuxi-hub', settings: 5 }].every(b => applyBackup(b) === false);
    applyBackup({ app: 'fuxi-hub', settings: { favorites: ['fortnite', '../../x', 7], assign: { '../a': 'b', ok: 'default' }, exes: { fortnite: ['a.exe', 'C:\\x\\evil.bat', '<script>.exe'] }, notify: { duration: 9999, position: 'xx', dndAllow: { mic: 1 } }, custom: [{ id: 'bad id!', name: 'x' }, { id: 'c_1', name: 'Ok', eq: [1, 2, 99, 'a'], color: 'red' }], intro: { style: 'hack' } } });
    out.sanitized = { fav: settings.favorites, assign: settings.assign, exes: settings.exes.fortnite, dur: settings.notify.duration, pos: settings.notify.position, mic: settings.notify.dndAllow.mic, custom: settings.custom.map(c => [c.id, c.color]), intro: settings.intro.style };
  }
  if (what === 'cloud') {                                                    // como títulos de janela típicos são interpretados
    const T = [['msedge', 'Fortnite - Xbox Cloud Gaming (Beta) - Microsoft Edge'], ['brave', 'Cyberpunk 2077 | Xbox Cloud Gaming - Brave'], ['chrome', 'Xbox Cloud Gaming (Beta) - Google Chrome'],
      ['chrome', 'Halo Infinite on Xbox Cloud Gaming - Google Chrome'], ['GeForceNOW', 'GeForce NOW'], ['GeForceNOW', 'Counter-Strike 2 on GeForce NOW'], ['GeForceNOW', 'GeForce NOW - Elden Ring'],
      ['msedge', 'Hades II - Xbox Cloud Gaming - Perfil 1 - Microsoft Edge'], ['firefox', 'Notícias de games — Mozilla Firefox'], ['brave', 'Conteúdo do canal - YouTube Studio - Brave'], ['notepad', 'Fortnite on GeForce NOW.txt']];
    out.cases = T.map(([n, t]) => { const c = detectCloud([{ name: n, title: t }]); return { proc: n, title: t, svc: c ? c.svc : null, name: c ? c.name : null, game: c && c.name ? matchGameId(c.name) : null }; });
  }
  if (what === 'surround') { out.fuxiEp = fuxiEp; out.s = settings.surround; out.installed = hesuviInstalled(); out.dir = HESUVI_DIR; out.level = surroundLevelNow(); out.stateLevel = state.surroundLevel; }
  if (what === 'rules') {
    out.before = state.active; out.rule0 = state.rule;
    await new Promise(r => setTimeout(r, 100));
  }
  if (what === 'switch') { out.fuxiEp = fuxiEp; out.ok = await switchToFuxi(); out.prev = settings.prevOutput || null; }
  fs.writeFileSync(path.join(process.env.FUXI_SHOTS, 'hook_' + what + '.json'), JSON.stringify(out));
  return out;
});
ipcMain.handle('toggle-fav',(_, id) => {
  if (!DATA.games.some(g => g.id === id)) return false;
  const i = settings.favorites.indexOf(id);
  if (i >= 0) settings.favorites.splice(i, 1); else settings.favorites.push(id);
  saveSettings(); push(); return i < 0;
});
// ---------- Cloud gaming (xCloud e GeForce NOW) ----------
// O jogo roda em outro lugar, então não há .exe do jogo. O hub lê os TÍTULOS das janelas: no navegador (Edge, Chrome, Brave…) em xbox.com/play, no app do Xbox
// e no cliente GeForce NOW. O nome do jogo é o que sobra do título depois de tirar o nome do serviço e do navegador.
const BROWSER_RE = /^(msedge|chrome|firefox|brave|opera|vivaldi|arc|iexplore|opera_gx)$/i, XBOXAPP_RE = /^(xboxpcapp|gamingapp|xboxapp|xbox)$/i;
const SVC_TOKEN = /geforce\s*now|xbox\s*cloud\s*gaming|xcloud|cloud\s*gaming|microsoft\s*edge|google\s*chrome|mozilla\s*firefox|brave|opera(\s*gx)?|vivaldi|nvidia|\bbeta\b|\bxbox\b|\bmicrosoft\b|perfil\s*\d*|profile\s*\d*|and \d+ more pages?|e mais \d+ p[áa]ginas?|trabalho|pessoal|work|personal/gi;
const LOBBY_RE = /^(home|início|inicio|biblioteca|library|loja|store|jogos|games|configurações|configuracoes|settings|buscar|search|descobrir|discover|catálogo|catalogo|novo|new|play|jogar|entrar|login|sign in|iniciar sessão|sem título|untitled|new tab|nova guia|pesquisar|my library|minha biblioteca)$/i;
const NOT_CLOUD = /(brave search|google search|pesquisa google|bing|duckduckgo|ecosia|yahoo|youtube|wikipedia|reddit|facebook|twitter|instagram|tiktok|twitch|notícias|news|review|análise|tutorial|como instalar|download)/i;
function cleanCloudTitle(title) {
  let t = String(title || '').replace(/\s+(on|no|em|via)\s+(geforce\s*now|xbox\s*cloud\s*gaming)/gi, ' ');
  const tokens = t.split(/\s+[|\-–—•·]\s+|\s*[|•·]\s*|:\s+/).map(s => s.replace(SVC_TOKEN, '').replace(/[()\[\]]/g, ' ').replace(/\s+/g, ' ').trim()).filter(s => s.length >= 2 && !LOBBY_RE.test(s));
  return tokens[0] || '';
}
function detectCloud(wins) {
  const c = settings.cloud; if (!c.enabled) return null;
  const any = !!process.env.FUXI_CLOUD_TEST;                       // teste: aceita qualquer processo
  for (const w of wins) {
    const t = w.title, pn = w.name;
    let svc = null;
    for (const r of c.learned) {                                      // regras que VOCÊ ensinou ao hub (processo + trecho do título)
      if (c.services[r.svc] && pn.toLowerCase() === r.proc.toLowerCase() && (!r.contains || t.toLowerCase().includes(r.contains.toLowerCase())))
        return { svc: r.svc, title: t, proc: pn, name: cleanCloudTitle(r.contains ? t.replace(new RegExp(r.contains.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ') : t), learned: true };
    }
    if (BROWSER_RE.test(pn) && NOT_CLOUD.test(t) && !any) continue;                  // busca, vídeo, notícia ou rede social que só menciona o serviço não é sessão
    if (c.services.gfn && (/^geforcenow(streamer)?$/i.test(pn) || (/geforce\s*now/i.test(t) && (any || BROWSER_RE.test(pn))))) svc = 'gfn';
    else if (c.services.xcloud && /xbox\s*cloud\s*gaming|xcloud|xbox\.com\/play/i.test(t) && (any || BROWSER_RE.test(pn) || XBOXAPP_RE.test(pn))) svc = 'xcloud';
    if (!svc) continue;
    return { svc, title: t, proc: pn, name: cleanCloudTitle(t) };
  }
  return null;
}
function matchGameId(name) {                                       // nome lido do título -> jogo da lista (ou jogo genérico com o nome dele)
  const n = norm(name); if (n.length < 3) return null;
  for (const g of DATA.games) {
    const cands = [norm(g.name), ...(ALIAS[g.id] || [])];
    if (cands.some(a => a === n || (a.length >= 4 && n.includes(a)) || (n.length >= 5 && a.includes(n)))) return g.id;
  }
  return dynGame(name);
}
const SVC_LABEL = { xcloud: 'Xbox Cloud Gaming', gfn: 'GeForce NOW' };

// ---------- Extensão do navegador ----------
// A extensão (Edge/Chrome/Brave) lê a página do xCloud / GeForce NOW e avisa o hub por um servidor LOCAL (127.0.0.1, só esta máquina), com um token secreto.
// Mais preciso que o título da janela. Cada aba manda um sinal a cada ~4 s; sem sinal por 15 s, a sessão é considerada encerrada.
const EXT_PORTS = [47615, 47616, 47617, 47618, 47619];
const extMedia = new Map();                                          // abas de Spotify/YouTube da extensão
const extTabs = new Map();                                            // tabKey -> {svc, game, title, state, url, seen}
let extServer = null, extPort = 0, extLastPing = 0;
const extFresh = () => { const now = Date.now(); for (const [k, v] of extTabs) if (now - v.seen > 15000) extTabs.delete(k); return [...extTabs.values()]; };
function detectExt() {                                                // sessão vinda da extensão (a que está jogando tem prioridade sobre a que só navega)
  const c = settings.cloud; if (!c.enabled || !c.ext.enabled) return null;
  const list = extFresh().filter(v => c.services[v.svc]).sort((a, b) => (b.state === 'playing') - (a.state === 'playing') || b.seen - a.seen);
  const v = list[0]; if (!v) return null;
  const name = v.state === 'playing' ? cleanCloudTitle(v.title || '') || cleanCloudTitle(v.game || '') : '';
  return { svc: v.svc, title: v.title || '', proc: 'extensão', name, ext: true, state: v.state };
}
function startExtServer() {
  const http = require('http');
  const tryPort = i => {
    if (i >= EXT_PORTS.length) return;
    const srv = http.createServer((req, res) => {
      const origin = String(req.headers.origin || '');
      const okOrigin = !origin || /^(chrome|moz)-extension:\/\//.test(origin);                       // páginas da web não podem falar com o hub
      const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': okOrigin && origin ? origin : 'null', 'Access-Control-Allow-Headers': 'Content-Type, X-Fuxi-Token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
      if (!okOrigin) { res.writeHead(403, h); return res.end('{}'); }
      if (req.method === 'OPTIONS') { res.writeHead(204, h); return res.end(); }
      if (req.method === 'GET' && req.url === '/ping') { extLastPing = Date.now(); push(); res.writeHead(200, h); return res.end(JSON.stringify({ app: 'fuxi-hub' })); }
      if (req.method === 'POST' && req.url === '/media') {                                         // Spotify / YouTube na web (extensão)
        if (req.headers['x-fuxi-token'] !== settings.cloud.ext.token) { res.writeHead(401, h); return res.end('{}'); }
        let body = ''; req.on('data', d => { body += d; if (body.length > 4096) req.destroy(); });
        req.on('end', () => {
          try {
            const b = JSON.parse(body), site = b.site === 'spotify' ? 'spotify' : b.site === 'youtube' ? 'youtube' : null, key = String(b.tab || '0').slice(0, 24);
            if (!site) throw 0; extLastPing = Date.now();
            if (b.state === 'closed') extMedia.delete(site + key);
            else extMedia.set(site + key, { site, state: b.state === 'playing' ? 'playing' : 'open', title: String(b.title || '').slice(0, 120), track: String(b.track || '').slice(0, 120), artist: String(b.artist || '').slice(0, 120), art: /^https:\/\/[\w.\-\/%?=&:+~]{4,290}$/.test(b.art || '') ? b.art : '', seen: Date.now() });
            res.writeHead(200, h); res.end('{"ok":true}'); pollGames();
          } catch { res.writeHead(400, h); res.end('{}'); }
        });
        return;
      }
      if (req.method === 'POST' && req.url === '/cloud') {
        if (req.headers['x-fuxi-token'] !== settings.cloud.ext.token) { res.writeHead(401, h); return res.end('{}'); }
        let body = ''; req.on('data', d => { body += d; if (body.length > 8192) req.destroy(); });
        req.on('end', () => {
          try {
            const b = JSON.parse(body), svc = b.svc === 'gfn' ? 'gfn' : b.svc === 'xcloud' ? 'xcloud' : null, key = String(b.tab || '0').slice(0, 24);
            if (!svc) throw 0;
            extLastPing = Date.now();
            if (b.state === 'closed') extTabs.delete(key);
            else extTabs.set(key, { svc, state: b.state === 'playing' ? 'playing' : 'browsing', game: String(b.game || '').slice(0, 90), title: String(b.title || '').slice(0, 140), url: String(b.url || '').slice(0, 160), seen: Date.now() });
            res.writeHead(200, h); res.end('{"ok":true}'); pollGames();
          } catch { res.writeHead(400, h); res.end('{}'); }
        });
        return;
      }
      res.writeHead(404, h); res.end('{}');
    });
    srv.on('error', () => tryPort(i + 1));
    srv.listen(EXT_PORTS[i], '127.0.0.1', () => { extServer = srv; extPort = EXT_PORTS[i]; });
  };
  tryPort(0);
}
// copia a extensão para a pasta de dados (com o token deste PC) e abre a página de extensões do navegador
function prepareExtension() {
  const src = path.join(__dirname, 'extension'), dst = path.join(app.getPath('userData'), 'extension');
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) if (f !== 'config.js') fs.copyFileSync(path.join(src, f), path.join(dst, f));
  fs.writeFileSync(path.join(dst, 'config.js'), `self.FUXI = { token: ${JSON.stringify(settings.cloud.ext.token)}, ports: ${JSON.stringify(EXT_PORTS)} };\n`);
  return dst;
}
ipcMain.handle('ext-install', (_, browser) => {
  const dst = prepareExtension(); shell.openPath(dst);
  const url = browser === 'chrome' ? 'chrome://extensions' : browser === 'brave' ? 'brave://extensions' : 'edge://extensions', exe = browser === 'chrome' ? 'chrome' : browser === 'brave' ? 'brave' : 'msedge';
  try { execFile('cmd.exe', ['/c', 'start', '', exe, url], { windowsHide: true }, () => {}); } catch {}
  return dst;
});
ipcMain.handle('ext-status', () => ({ port: extPort, last: extLastPing, tabs: extFresh().map(v => ({ svc: v.svc, state: v.state, game: v.game, title: v.title, url: v.url })) }));

// App nativo: GeForce NOW (processo GeForceNOW; durante a partida existe também o GeForceNOWStreamer) e app do Xbox (XboxPcApp).
// Não dá para ler o jogo com certeza nesses apps, então: título da janela quando ele traz o nome do jogo + "sessão manual" (você escolhe o jogo).
const GFN_PROCS = ['geforcenow.exe', 'geforcenowstreamer.exe'], XBOX_PROCS = ['xboxpcapp.exe', 'gamingapp.exe', 'xboxapp.exe'];
const NATIVE_GENERIC = /^(xbox|xbox app|app xbox|geforce\s*now|nvidia\s*geforce\s*now)$/i;
const nativeRunning = (svc, names) => (svc === 'gfn' ? GFN_PROCS : XBOX_PROCS).some(n => names.has(n));
function detectNative(wins, names) {
  const c = settings.cloud; if (!c.enabled) return null;
  const one = (svc, procRe) => {
    const w = wins.find(x => procRe.test(x.name) && x.title && !NATIVE_GENERIC.test(x.title.trim()));
    const name = w ? cleanCloudTitle(w.title) : '', streaming = svc === 'gfn' && names.has('geforcenowstreamer.exe');
    if (!name && !streaming) return null;                                         // app só aberto, sem partida: não conta
    return { svc, title: w ? w.title : SVC_LABEL[svc], proc: 'app nativo', name, native: true };
  };
  return (c.services.gfn && one('gfn', /^geforcenow(streamer)?$/i)) || (c.services.xcloud && one('xcloud', XBOXAPP_RE)) || null;
}
let manualCloud = null;
ipcMain.handle('cloud-manual', (_, a) => {
  if (!a || !a.svc) { manualCloud = null; push(); pollGames(); return null; }
  const g = DATA.games.find(x => x.id === a.id); if (!g || (a.svc !== 'gfn' && a.svc !== 'xcloud')) return false;
  manualCloud = { svc: a.svc, id: g.id, name: g.name, since: Date.now(), sawNative: false };
  push(); pollGames(); return true;
});
// ---------- Controle pelo celular ----------
// Servidor local na SUA rede Wi-Fi (desligado por padrão). O celular abre um link com um código secreto (QR code) e controla preset, volume e microfone.
// Quem tiver o link na mesma rede pode controlar o hub; "Novo código" invalida o link antigo.
const os = require('os');
let remoteSrv = null, remotePort = 0, remoteVolCache = { t: 0, v: null };
const remoteSeen = new Map(), remoteHits = new Map();
function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  const pri = a => (/^192\.168\./.test(a) ? 0 : /^10\./.test(a) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a) ? 2 : 3);
  return out.sort((a, b) => pri(a) - pri(b));
}
const remoteUrls = () => (remoteSrv ? lanIps().map(ip => `http://${ip}:${remotePort}/?t=${settings.remote.token}`) : []);
function tokenOk(t) { const a = Buffer.from(String(t || '')), b = Buffer.from(settings.remote.token); return a.length === b.length && require('crypto').timingSafeEqual(a, b); }
async function remoteState() {
  if (Date.now() - remoteVolCache.t > 1500) { const r = await run('audiohelper.exe', ['list']); try { const j = JSON.parse(r.out); remoteVolCache = { t: Date.now(), v: j.master || null }; } catch {} }
  const m = await micState(), np = (typeof npData === 'function') ? npData() : null, g = state.game ? findProfile(state.game) : null;
  return { version: app.getVersion(), presets: cyclable().map(p => ({ id: p.id, name: p.name, color: p.color })), active: state.active, game: g ? g.name : '', gameColor: g ? g.color : '',
    volume: remoteVolCache.v ? Math.round(remoteVolCache.v.volume * 100) : null, mute: remoteVolCache.v ? !!remoteVolCache.v.mute : false, micMute: m ? !!m.mute : null, bypass: !!state.bypass, auto: !!settings.auto,
    now: np ? { title: np.title, artist: np.artist, state: np.state } : null };
}
function startRemote() {
  if (remoteSrv) return; const http = require('http');
  const ports = [settings.remote.port, ...Array.from({ length: 8 }, (_, i) => settings.remote.port + 1 + i)];
  const tryPort = i => {
    if (i >= ports.length) return;
    const srv = http.createServer(async (req, res) => {
      const ip = String(req.socket.remoteAddress || '').replace('::ffff:', ''), now = Date.now(), url = new URL(req.url, 'http://x');
      const hits = (remoteHits.get(ip) || []).filter(x => now - x < 1000); hits.push(now); remoteHits.set(ip, hits);
      if (hits.length > 30) { res.writeHead(429); return res.end(); }
      const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
      try {
        if (req.method === 'GET' && url.pathname === '/') {
          if (!tokenOk(url.searchParams.get('t'))) return send(403, '<meta name=viewport content="width=device-width"><body style="background:#000;color:#aaa;font:16px sans-serif;padding:32px">Abra o link do QR code que aparece no Fuxi Hub (Configurações → Celular).', 'text/html');
          remoteSeen.set(ip, { ts: now, ua: String(req.headers['user-agent'] || '').slice(0, 80) });
          return send(200, fs.readFileSync(path.join(__dirname, 'src', 'remote.html'), 'utf8'), 'text/html');
        }
        if (!url.pathname.startsWith('/api/') || !tokenOk(req.headers['x-fuxi-token'])) return send(401, { error: 'unauthorized' });
        remoteSeen.set(ip, { ts: now, ua: String(req.headers['user-agent'] || '').slice(0, 80) });
        if (req.method === 'GET' && url.pathname === '/api/state') return send(200, await remoteState());
        if (req.method !== 'POST') return send(405, {});
        let body = ''; await new Promise(r => { req.on('data', d => { body += d; if (body.length > 2048) req.destroy(); }); req.on('end', r); });
        const b = JSON.parse(body || '{}');
        switch (url.pathname) {
          case '/api/preset': if (!cyclable().some(p => p.id === b.id)) return send(400, {}); setPreset(b.id); break;
          case '/api/volume': await run('audiohelper.exe', ['master', String(Math.max(0, Math.min(100, Math.round(+b.v || 0))))]); remoteVolCache.t = 0; break;
          case '/api/mute': await run('audiohelper.exe', ['mastermute', b.on ? '1' : '0']); remoteVolCache.t = 0; break;
          case '/api/mic': await setMicMuted(!!b.mute); break;
          case '/api/bypass': toggleBypass(); break;
          case '/api/auto': toggleAuto(!!b.on); break;
          default: return send(404, {});
        }
        return send(200, await remoteState());
      } catch { return send(400, {}); }
    });
    srv.on('error', () => tryPort(i + 1));
    srv.listen(ports[i], '0.0.0.0', () => { remoteSrv = srv; remotePort = ports[i]; push(); });
  };
  tryPort(0);
}
function stopRemote() { if (remoteSrv) { try { remoteSrv.close(); remoteSrv.closeAllConnections && remoteSrv.closeAllConnections(); } catch {} remoteSrv = null; remotePort = 0; remoteSeen.clear(); push(); } }
let CHANGELOG = {}; try { CHANGELOG = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'changelog.json'), 'utf8').replace(/^\uFEFF/, '')); } catch {}
function newsFor(force) { const v = app.getVersion(), n = CHANGELOG[v]; if (!n) return null; return (force || isNewer(v, settings.seenVersion)) ? { version: v, items: n, force: !!force } : null; }
ipcMain.handle('news-seen', () => { settings.seenVersion = app.getVersion(); saveSettings(); push(); return true; });
ipcMain.handle('news-get', () => { const v = app.getVersion(), n = CHANGELOG[v]; return n ? { version: v, items: n } : null; });
ipcMain.handle('set-gpu', (_, v) => { settings.gpu = !!v; saveSettings(); quitting = true; app.relaunch(); app.exit(0); return true; });
ipcMain.handle('remote-set', (_, p) => { settings.remote = mergeRemote({ ...settings.remote, ...(p || {}) }); saveSettings(); if (settings.remote.enabled) { if (!remoteSrv) startRemote(); } else stopRemote(); setTimeout(push, 400); return settings.remote.enabled; });
ipcMain.handle('remote-newtoken', () => { settings.remote.token = require('crypto').randomBytes(16).toString('hex'); remoteSeen.clear(); saveSettings(); push(); return true; });
ipcMain.handle('remote-info', () => {
  const urls = remoteUrls(), qrcode = require('qrcode-generator');
  let svg = '';
  if (urls[0]) { const qr = qrcode(0, 'M'); qr.addData(urls[0]); qr.make(); const n = qr.getModuleCount(), m = 2; let d = ''; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m},${r + m}h1v1h-1z`; svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`; }
  const clients = [...remoteSeen.values()].filter(c => Date.now() - c.ts < 30000).length;
  return { enabled: !!remoteSrv, urls, svg, clients, port: remotePort };
});
app.on('before-quit', stopRemote);

// ---------- Atualização automática ----------
// Consulta a última versão publicada no GitHub, baixa o instalador em segundo plano, confere o SHA-256 que a release informa e instala quando você aceitar.
const UPDATE_REPO = 'BIELZINinn/fuxi-hub';
const UPDATE_API = (!app.isPackaged && process.env.FUXI_UPDATE_API) || `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;      // o desvio só existe fora do app instalado (testes)
const verNum = v => String(v || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
const isNewer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
let updating = false, updateFile = null;
const setUpd = o => { state.update = { ...(state.update || {}), ...o }; push(); };
async function checkUpdate(manual) {
  if (updating || (state.perf && !manual)) return; updating = true;
  try {
    setUpd({ status: 'checking', error: '' });
    const res = await net.fetch(UPDATE_API, { headers: { 'User-Agent': 'FuxiHub-Updater', Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error('GitHub respondeu ' + res.status);
    const rel = await res.json(), ver = String(rel.tag_name || '').replace(/^v/i, ''), cur = app.getVersion();
    settings.update.lastCheck = Date.now(); saveSettings();
    if (!ver || !isNewer(ver, cur)) { setUpd({ status: 'uptodate', version: cur, checkedAt: Date.now() }); return; }
    const asset = (rel.assets || []).find(a => /^Fuxi[. ]Hub[. ]Setup.*\.exe$/i.test(a.name)), sha = ((rel.body || '').match(/\b([A-Fa-f0-9]{64})\b/) || [])[1];
    const info = { version: ver, notes: String(rel.body || '').slice(0, 1200), page: rel.html_url, size: asset ? asset.size : 0, sha: sha ? sha.toLowerCase() : '', url: asset ? asset.browser_download_url : '', checkedAt: Date.now() };
    setUpd({ status: 'available', ...info });
    if (settings.update.notified !== ver) { settings.update.notified = ver; saveSettings(); notify('info', { id: 'update', title: tm('Nova versão disponível') + ' · ' + ver, body: tm('Veja em Configurações → Sobre.'), icon: 'info', color: '#2ef2ff' }, true); }
    if ((settings.update.auto || manual) && info.url && info.sha) await downloadUpdate();
  } catch (e) { setUpd({ status: 'error', error: String(e.message || e).slice(0, 160) }); }
  finally { updating = false; }
}
async function downloadUpdate() {
  const u = state.update; if (!u || !u.url || !u.sha) return;
  const dir = path.join(app.getPath('userData'), 'updates'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `FuxiHub-Setup-${u.version}.exe`), crypto = require('crypto');
  const okFile = f => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') === u.sha; } catch { return false; } };
  if (fs.existsSync(file) && okFile(file)) { updateFile = file; setUpd({ status: 'ready', progress: 1 }); return; }
  setUpd({ status: 'downloading', progress: 0 });
  const res = await net.fetch(u.url, { headers: { 'User-Agent': 'FuxiHub-Updater' } });
  if (!res.ok || !res.body) throw new Error('Download falhou (' + res.status + ')');
  const total = +res.headers.get('content-length') || u.size || 0, out = fs.createWriteStream(file + '.part'), reader = res.body.getReader();
  let got = 0, lastPush = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    out.write(Buffer.from(value)); got += value.length;
    if (total && Date.now() - lastPush > 400) { lastPush = Date.now(); setUpd({ progress: Math.min(.99, got / total) }); }
  }
  await new Promise(r => out.end(r));
  fs.renameSync(file + '.part', file);
  if (!okFile(file)) { try { fs.unlinkSync(file); } catch {} throw new Error('O arquivo baixado não confere com o SHA-256 da release'); }
  updateFile = file; setUpd({ status: 'ready', progress: 1 });
}
ipcMain.handle('update-check', async () => { await checkUpdate(true); return state.update; });
ipcMain.handle('update-install', () => {
  if (!updateFile || !fs.existsSync(updateFile) || !app.isPackaged) return false;                       // instalar só faz sentido no app instalado
  require('child_process').spawn(updateFile, [], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 400); return true;
});
ipcMain.handle('set-gamemode', (_, v) => { settings.ui = mergeUi({ ...settings.ui, gameMode: !!v }); saveSettings(); if (!v) setPerf(false); else checkFullscreen().catch(() => {}); push(); return settings.ui.gameMode; });
ipcMain.handle('set-update', (_, p) => { settings.update = mergeUpdate({ ...settings.update, ...(p || {}) }); saveSettings(); push(); return settings.update; });
ipcMain.handle('open-release-page', () => { const u = state.update && state.update.page; if (u && /^https:\/\/github\.com\//.test(u)) shell.openExternal(u); });
setTimeout(() => { if (!process.env.FUXI_SHOTS || process.env.FUXI_UPDATE_API) checkUpdate(false); }, 20000);
setInterval(() => { if (!process.env.FUXI_SHOTS && Date.now() - settings.update.lastCheck > 6 * 3600e3) checkUpdate(false); }, 30 * 60e3);

// ---------- Música e vídeo ----------
const MEDIA_LABEL = { spotify: 'Spotify', youtube: 'YouTube' };
const SPOTIFY_WEB = /spotify/i, YT_TITLE = /(?:^|\s[-–|•]\s)YouTube(?!\s*(?:Music|Studio|Kids|TV))\s*$|^YouTube$/i;
const BROWSER_PROCS = /^(msedge|chrome|firefox|brave|opera|vivaldi|arc|opera_gx)$/i;
// Mídia do Windows (a do painel de volume): título, artista, capa e estado do Spotify mesmo escondido na bandeja. Só consulta se o Spotify estiver aberto.
let smtc = null, smtcKey = '', smtcAt = 0;
async function readSmtc(hint) {
  const same = smtc && smtcKey;                                                    // a capa só é baixada quando a música muda
  const r = await run('mediactl.exe', ['info', hint, same ? 'noart' : 'art']);
  let j = null; try { j = JSON.parse(r.out); } catch {}
  if (!j || j.error || !j.title) { smtc = null; smtcKey = ''; return null; }
  const key = j.app + '|' + j.title + '|' + j.artist;
  if (key !== smtcKey) { if (r.out && !j.art) { const r2 = await run('mediactl.exe', ['info', hint, 'art']); try { const j2 = JSON.parse(r2.out); if (j2.art) j.art = j2.art; } catch {} } smtc = { ...j }; smtcKey = key; }
  else smtc = { ...smtc, status: j.status, canNext: j.canNext, canPrev: j.canPrev };
  smtcAt = Date.now(); return smtc;
}
let npLastPlay = 0;
async function detectMedia(wins, names) {
  const m = settings.media; if (!m.enabled) { state.media = null; return null; }
  const now = Date.now(), found = { spotify: null, youtube: null };
  const put = (site, state, via, meta) => { const c = found[site]; if (!c || (state === 'playing' && c.state !== 'playing')) found[site] = { state, via, ...(meta || {}) }; };
  for (const [k, v] of extMedia) { if (now - v.seen > 15000) extMedia.delete(k); else put(v.site, v.state, 'extensão', { title: v.track, artist: v.artist, art: v.art }); }
  const spApp = names.has('spotify.exe');
  const webSp = wins.some(w => BROWSER_PROCS.test(w.name) && SPOTIFY_WEB.test(w.title) && !NOT_CLOUD.test(w.title.replace(/spotify/ig, '')));
  const webYt = wins.some(w => BROWSER_PROCS.test(w.name) && YT_TITLE.test(w.title));
  let active = null;                                                                  // quem está com som saindo agora (só consulta se precisar)
  const needAudio = (m.spotify.enabled && m.spotify.when === 'play' && (spApp || webSp) && !found.spotify) || (m.youtube.enabled && m.youtube.when === 'play' && webYt && !found.youtube);
  if (needAudio) { const r = await run('audiohelper.exe', ['list']); try { active = new Set((JSON.parse(r.out).apps || JSON.parse(r.out)).filter(a => a.active).map(a => String(a.name).toLowerCase().replace(/\.exe$/, ''))); } catch { active = new Set(); } }
  const browserActive = active ? [...active].some(n => BROWSER_PROCS.test(n)) : false;
  const spWin = wins.find(w => /^spotify$/i.test(w.name) && w.title && !/^(spotify( (free|premium))?|spotify$|chrome|gdi\+|default ime|msctfime)/i.test(w.title.trim()) && / - /.test(w.title));      // no app do Spotify, a janela mostra "Artista - Música" enquanto toca
  const spMeta = spWin ? (() => { const i = spWin.title.indexOf(' - '); return { artist: spWin.title.slice(0, i).trim(), title: spWin.title.slice(i + 3).trim() }; })() : null;
  let sm = null; if (spApp && settings.nowplaying.enabled !== false) { try { sm = await readSmtc('spotify'); } catch {} }
  if (sm && /spotify/i.test(sm.app)) { put('spotify', sm.status === 'Playing' ? 'playing' : 'open', 'app', { title: sm.title, artist: sm.artist, smtc: true, paused: sm.status !== 'Playing', canNext: sm.canNext, canPrev: sm.canPrev }); if (sm.status === 'Playing') npLastPlay = Date.now(); }
  else if (spApp) put('spotify', spMeta ? 'playing' : (active && active.has('spotify') ? 'playing' : 'open'), 'app', spMeta || {});
  if (webSp && !found.spotify) put('spotify', browserActive ? 'playing' : 'open', 'navegador');
  if (webYt && !found.youtube) put('youtube', browserActive ? 'playing' : 'open', 'navegador');
  const ok = site => { const c = found[site], cfg = m[site]; return cfg.enabled && c && (cfg.when === 'open' || c.state === 'playing') && findProfile(cfg.preset) ? c : null; };
  const sp = ok('spotify'), yt = ok('youtube');
  const pick = yt && (!sp || yt.state === 'playing' || sp.state !== 'playing') ? 'youtube' : sp ? 'spotify' : null;      // vídeo ganha do áudio em caso de empate
  state.media = { spotify: found.spotify, youtube: found.youtube, active: pick };
  return pick ? { id: 'media-' + pick, exe: MEDIA_LABEL[pick], label: MEDIA_LABEL[pick], preset: m[pick].preset, media: true } : null;
}
ipcMain.handle('set-media', (_, p) => { const c = settings.media, n = p || {}; settings.media = mergeMedia({ ...c, ...n, spotify: { ...c.spotify, ...(n.spotify || {}) }, youtube: { ...c.youtube, ...(n.youtube || {}) } }); saveSettings(); push(); pollGames(); return settings.media; });

// ---------- Regras por programa ----------
// Enquanto nenhum jogo está aberto, se um programa da regra estiver rodando, aplica o preset dela (ex.: Spotify -> Música). Quando fecha, volta ao preset de antes.
let curRule = null;
function detectRule(names) {
  if (!settings.rulesEnabled) return null;
  return settings.rules.find(r => r.enabled && names.has(r.exe.toLowerCase())) || null;
}
function notifyRule(r) {
  const p = findProfile(r.preset); if (!p) return;
  notify('preset', { id: 'rule', title: r.label || r.exe.replace(/\.exe$/i, ''), body: r.media ? `Preset ${p.name}` : `Regra: preset ${p.name}`, icon: 'preset', color: p.color, eq: eqOf(p) });
}
const restoreTarget = () => (curRule && findProfile(curRule.preset) ? curRule.preset : null) || settings.manual || 'default';

function handleDetection(id, cloud) {
  const svc = cloud ? cloud.svc : null, prevSvc = state.cloud ? state.cloud.svc : null;
  if (id === state.game && svc === prevSvc) return;
  const prev = state.game, now = Date.now(), sessMs = prev && playStart ? now - playStart : 0, wasCloud = state.cloud ? state.cloud.label : null;
  trackPlay(prev, id);
  if (prev && state.cloud && cloudCur) { cloudCur.ms = now - cloudCur.start; pushCloudLog(cloudCur); cloudCur = null; }       // fecha a sessão cloud anterior
  state.cloud = cloud ? { svc, name: cloud.name, label: SVC_LABEL[svc] } : null;
  state.game = id; state.gameName = id ? ((findProfile(id) || {}).name || cloud && cloud.name || null) : null;
  if (id && cloud) cloudCur = { svc, name: state.gameName || cloud.name, id, start: now, ms: 0 };
  if (settings.auto) applyEq(effective(id) || restoreTarget()); else push();
  applySurround();                                                       // o nível de surround pode mudar por jogo
  if (id) notifyGame(id); else if (prev) { notifyGameEnd(prev); if (sessMs >= 60000) setTimeout(() => notifySummary(prev, sessMs, wasCloud), 3500); }
}
let cloudCur = null;
function pushCloudLog(e) { if (!e.ms || e.ms < 20000) return; settings.cloud.log.unshift({ ...e }); settings.cloud.log = settings.cloud.log.slice(0, 100); saveSettings(); }

const scan = args => new Promise(res => execFile(native('procscan.exe'), args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, out) => res(err ? null : out || '')));
const parseWins = out => (out || '').split('\n').map(l => l.split('\t')).filter(a => a.length >= 3).map(a => ({ pid: +a[0], name: a[1], title: (a[2] || '').trim() }));
// ---------- Modo jogo (economia em tela cheia) ----------
// Quando há um aplicativo em tela cheia na frente (jogo, vídeo, apresentação), o hub fica só com o essencial: troca de preset, atalhos, avisos e microfone.
// A estética (animações, espectro, fone animado, brilhos) pára; ao sair da tela cheia tudo volta sozinho.
let fsHits = 0, fsLast = '';
const OWN_PROC = /^(electron|fuxi hub|fuxihub)$/i;
function setPerf(on) { if (!!state.perf === on) return; state.perf = on; npSig = ''; badgeKey = ''; try { updateNowPlaying(); updateBadge(); } catch {} push(); }
async function checkFullscreen() {
  if (!settings.ui.gameMode) { fsHits = 0; return setPerf(false); }
  const o = await scan(['fs']); const [f, name] = String(o || '0').split('\t'), nm = (name || '').trim().toLowerCase(), ui = settings.ui;
  let on = f === '1' && !OWN_PROC.test(nm);
  if (on && fsLast !== nm) { fsLast = nm; state.fsLast = nm; push(); }                                       // último programa visto em tela cheia (a tela de ajustes oferece "ignorar" / "sempre")
  if (on && !state.game && ui.gmIgnore.includes(nm)) on = false;                                              // vídeo/navegador em tela cheia não ativa (a não ser que um jogo, até na nuvem, esteja aberto)
  if (!on && nm && !OWN_PROC.test(nm) && ui.gmAlways.includes(nm)) on = true;                                // programa da lista "sempre": ativa mesmo em janela
  fsHits = on ? fsHits + 1 : 0;
  if (on && fsHits >= 2) setPerf(true); else if (!on) setPerf(false);                 // entra depois de 2 leituras seguidas (evita piscar); sai na hora
}
// ---------- Bateria do fone ----------
// O Windows guarda o nível que o fone Bluetooth informa (perfil Hands-Free). Lemos a cada 90 s, só enquanto o fone está conectado; sem informação, nada aparece.
let batWarned = 100;
async function checkBattery() {
  if (state.perf) return;
  const o = process.env.FUXI_FAKE_BAT ? 'Fuxi-H3\t' + process.env.FUXI_FAKE_BAT : await scan(['battery', 'fuxi']);   // FUXI_FAKE_BAT: só para testes
  const lv = o ? o.split('\n').map(l => l.split('\t')).filter(a => a.length >= 2).map(a => +a[1]).filter(v => v >= 0 && v <= 100) : [];
  const level = lv.length ? lv[0] : null, prev = state.battery ? state.battery.level : null;
  if (level === null) { if (state.battery) { state.battery = null; badgeKey = ''; push(); } return; }
  if (prev !== level) { state.battery = { level, at: Date.now() }; badgeKey = ''; push(); }
  if (level > 25) batWarned = 100;
  else if (level <= 10 && batWarned > 10) { batWarned = 10; notify('device', { id: 'battery', title: 'Bateria do fone: ' + level + '%', body: 'Muito baixa. Coloque para carregar.', icon: 'device', color: '#ff4655' }, true); }
  else if (level <= 20 && batWarned > 20) { batWarned = 20; notify('device', { id: 'battery', title: 'Bateria do fone: ' + level + '%', body: 'Está acabando. Deixe um carregador por perto.', icon: 'device', color: '#ffb02e' }, true); }
}
// ---------- Jogos instalados (Steam, Epic, Riot) ----------
// Jogos que o usuário adicionou à lista: entram como os da lista (preset "Jogos" como ponto de partida, editável) e já têm tema com a cor do jogo.
const libscan = require('./libscan');
let libCache = { items: [], ts: 0 };
function registerUserGame(g) {
  if (!g || DATA.games.some(x => x.id === g.id)) return;
  const base = DATA.profiles.find(p => p.id === 'gaming') || DATA.profiles[0];
  DATA.games.push({ id: g.id, name: g.name, tag: 'Seu jogo', color: g.color, exe: g.exe ? [g.exe] : [], eq: base.eq, f: base.f, q: base.q, t: base.t, comfort: base.comfort, user: true });
  THEMES[g.id] = { accent: g.color, accent2: g.color, mood: 'vivid', radius: 18, artOpacity: .2 };
  ALIAS[g.id] = [norm(g.name), norm(g.dir ? path.basename(g.dir) : g.name)].filter(Boolean);
}
const knownGame = g => {
  const n = norm(g.name), d = g.dir ? norm(path.basename(g.dir)) : '', ex = (g.exe || '').toLowerCase();
  if ((settings.ignoredGames || []).includes(n)) return true;
  if (DATA.games.some(x => norm(x.name) === n || exeList(x).includes(ex && ex))) return true;
  return Object.values(ALIAS).some(al => al.includes(n) || (d && al.includes(d)));
};
async function scanLibs() {
  try { const all = await libscan.scan(); libCache = { items: all.filter(g => !knownGame(g)).map(g => ({ ...g, key: g.id, color: hashColor(g.name) })), ts: Date.now() }; } catch {}
  state.lib = { items: libCache.items.map(g => ({ key: g.key, name: g.name, store: g.store, exe: g.exe, color: g.color })), ts: libCache.ts };
  push(); return state.lib;
}
ipcMain.handle('lib-scan', () => scanLibs());
ipcMain.handle('lib-add', async (_, key) => {
  const g = libCache.items.find(x => x.key === key); if (!g) return false;
  const u = { id: slug(g.name), name: g.name, color: g.color, exe: g.exe || '', dir: g.dir, store: g.store };
  settings.userGames = (settings.userGames || []).filter(x => x.id !== u.id).concat(u).slice(-100);
  registerUserGame(u); saveSettings(); state.lib = null; await scanLibs(); pollGames(); return u.id;
});
ipcMain.handle('lib-ignore', async (_, key) => {
  const g = libCache.items.find(x => x.key === key); if (!g) return false;
  settings.ignoredGames = [...new Set([...(settings.ignoredGames || []), norm(g.name)])].slice(-300); saveSettings(); await scanLibs(); return true;
});
ipcMain.handle('user-game-remove', (_, id) => {
  settings.userGames = (settings.userGames || []).filter(x => x.id !== id);
  const i = DATA.games.findIndex(x => x.id === id && x.user); if (i >= 0) DATA.games.splice(i, 1);
  delete THEMES[id]; delete ALIAS[id]; delete settings.overrides[id]; delete settings.assign[id];
  saveSettings(); scanLibs(); return true;
});
async function pollGames() {
  checkFullscreen().catch(() => {});
  markToday();
  const [po, wo] = await Promise.all([scan([]), (settings.cloud.enabled || settings.media.enabled) ? scan(['windows']) : Promise.resolve('')]);
  if (!po) return;
  const procs = po.split('\n').map(l => l.split('\t')).filter(a => a.length >= 4).map(a => ({ pid: +a[0], mb: +a[1] || 0, name: a[2], path: (a[3] || '').trim() }));
  const names = new Set(procs.map(p => p.name.toLowerCase() + '.exe'));
  const winsAll = parseWins(wo);
  const userRule = detectRule(names), mediaRule = await detectMedia(winsAll, names), rule = userRule || mediaRule, ruleChanged = (rule ? rule.id : null) !== (curRule ? curRule.id : null);
  curRule = rule; state.rule = rule ? rule.id : null;
  let id = detectGame(procs), cloud = null;
  const wins = winsAll, cc = settings.cloud;
  const cands = cc.enabled ? [detectExt(), cc.ext.windowFallback ? detectCloud(wins) : null, detectNative(wins, names)].filter(Boolean) : [];
  if (manualCloud) {                                                               // sessão manual: termina se você encerrar, se o app nativo fechar ou depois de 8 h
    if (nativeRunning(manualCloud.svc, names)) manualCloud.sawNative = true;
    if (!cc.enabled || !cc.services[manualCloud.svc] || (manualCloud.sawNative && !nativeRunning(manualCloud.svc, names)) || Date.now() - manualCloud.since > 8 * 3600e3) manualCloud = null;
  }
  let seen = cands.find(x => x.name) || (manualCloud ? { svc: manualCloud.svc, title: '', proc: 'manual', name: manualCloud.name, manual: true } : null) || cands[0] || null;
  state.cloudManual = manualCloud ? { svc: manualCloud.svc, id: manualCloud.id, name: manualCloud.name } : null;
  state.cloudApps = { xcloud: nativeRunning('xcloud', names), gfn: nativeRunning('gfn', names), gfnStreaming: names.has('geforcenowstreamer.exe') };      // sessão cloud visível (com ou sem jogo identificado)
  state.cloudSeen = seen ? { svc: seen.svc, label: SVC_LABEL[seen.svc], name: seen.name, title: seen.title, ext: !!seen.ext, native: !!seen.native, manual: !!seen.manual } : null;
  state.extLive = extFresh().length > 0 ? Date.now() : 0;
  try { updateNowPlaying(); } catch {}
  if (!id && seen && seen.name) { id = matchGameId(seen.name); if (id) cloud = seen; }
  handleDetection(id, cloud);
  if (ruleChanged && !state.game) {                                              // regra liga/desliga só quando não há jogo aberto
    applyEq(restoreTarget());
    if (rule) notifyRule(rule);
  }
}

function snapshot() { return { ...state, auto: settings.auto, notify: settings.notify, hotkeys: settings.hotkeys, hotkeyErrors, closeToTray: settings.closeToTray, autostart, intro: settings.intro, startup: settings.startup, favorites: settings.favorites, stats: settings.stats, ui: settings.ui, detectGeneric: settings.detectGeneric, audioSwitch: settings.audioSwitch, lastBackup, surroundCfg: settings.surround, hesuvi: hesuviInfo(), cloudCfg: settings.cloud, mediaCfg: settings.media, badgeCfg: settings.badge, npCfg: settings.nowplaying, packaged: app.isPackaged, news: newsFor(),  gpu: GPU_ON, gpuSaved: settings.gpu === true, remoteCfg: { enabled: settings.remote.enabled, on: !!remoteSrv }, micFx: settings.micfx, updateCfg: settings.update, update: state.update || { status: 'idle' }, micApo: state.micApo || null, tutorial: settings.tutorial, ach: settings.ach, achSeeded: settings.achSeeded, usageDays: settings.usage.days, rules: settings.rules, rulesEnabled: settings.rulesEnabled, version: app.getVersion(), dataDir: app.getPath('userData'),
  skipIntro: process.argv.includes('--hidden') || !!process.env.FUXI_SHOTS || winCreated > 1, noSound: !!process.env.FUXI_NO_SOUND,   /* início escondido (Windows) e testes não tocam a abertura */ profiles: allProfiles(), bands: BANDS, engine: { ...(state.engine || engineStatus()), registered: !!(state.apo && state.apo.fuxi), apoDevices: state.apo ? state.apo.count : 0 } }; }
function push() { try { updateBadge(); } catch {} if (win && !win.isDestroyed()) win.webContents.send('state', snapshot()); if (mini && !mini.isDestroyed() && mini.isVisible()) mini.webContents.send('state', snapshot()); }
let hotkeyErrors = {};

// ---------- Avisos no canto da tela ----------
// Janela transparente, sempre por cima, que não pega foco nem clique (não atrapalha o jogo). Só aparece quando há aviso.
// Observação: jogos em "tela cheia exclusiva" escondem qualquer janela; em "tela cheia sem bordas" o aviso aparece normalmente.
let overlay = null, overlayReady = false, overlayQueue = [], overlayHideTimer = null, lastKnown = null;
const ini = name => String(name).split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();
const hexRgb = h => { h = String(h || '#2ef2ff').replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
function placeOverlay() {
  if (!overlay || overlay.isDestroyed()) return;
  const wa = screen.getPrimaryDisplay().workArea, W = 420, H = Math.min(wa.height, 560), pos = settings.notify.position;
  overlay.setBounds({ x: /right$/.test(pos) ? wa.x + wa.width - W : wa.x, y: /^top/.test(pos) ? wa.y : wa.y + wa.height - H, width: W, height: H });
}
function ensureOverlay() {
  if (overlay && !overlay.isDestroyed()) return overlay;
  overlayReady = false;
  overlay = new BrowserWindow({
    width: 420, height: 560, show: false, frame: false, transparent: true, resizable: false, movable: false, focusable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload-toast.js'), contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true);
  overlay.setMenuBarVisibility(false);
  overlay.webContents.on('did-finish-load', () => { overlayReady = true; overlayQueue.splice(0).forEach(p => overlay.webContents.send('toast', p)); });
  overlay.loadFile(path.join(__dirname, 'src', 'toast.html'));
  return overlay;
}
// ---------- Selo de jogo ativo ----------
let badgeWin = null, badgeReady = false, badgeLast = null, badgeKey = '', badgePreview = 0;
function badgeData() { const d = badgeData0(); if (d) d.bat = state.battery ? state.battery.level : null; return d; }      // + nível de bateria do fone (quando o Windows informa)
function badgeData0() {
  const b = settings.badge; if (!b || !b.enabled) return null;
  let g = null, cloud = null, art = null, color = null, initials = '';
  if (Date.now() < badgePreview) { g = findProfile('fortnite') || findProfile(DATA.games[0].id); cloud = null; }
  else if (state.game) { g = findProfile(state.game); cloud = state.cloud ? state.cloud.svc : null; }
  if (g) return { color: g.color, art: g.iconArt || null, initials: ini(g.name), cloud };
  if (b.media && state.rule && /^media-/.test(state.rule)) {                       // Spotify / YouTube, se você quiser o selo também para eles
    const site = state.rule.slice(6), pr = findProfile(settings.media[site] && settings.media[site].preset);
    return { color: pr ? pr.color : '#2ef2ff', art: pathToFileURL(path.join(__dirname, 'assets', 'services', site + '-badge.png')).href, initials: site === 'spotify' ? 'SP' : 'YT', cloud: null };
  }
  return null;
}
function placeBadge() {
  if (!badgeWin || badgeWin.isDestroyed()) return;
  const wa = screen.getPrimaryDisplay().workArea, S = 96, pos = settings.badge.pos, m = 6;
  badgeWin.setBounds({ x: /right$/.test(pos) ? wa.x + wa.width - S - m : wa.x + m, y: /^top/.test(pos) ? wa.y + m : wa.y + wa.height - S - m, width: S, height: S });
}
function ensureBadge() {
  if (badgeWin && !badgeWin.isDestroyed()) return badgeWin;
  badgeReady = false;
  badgeWin = new BrowserWindow({ width: 96, height: 96, show: false, frame: false, transparent: true, resizable: false, movable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload-badge.js'), contextIsolation: true } });
  badgeWin.setAlwaysOnTop(true, 'screen-saver'); badgeWin.setIgnoreMouseEvents(true); badgeWin.setMenuBarVisibility(false); global.__badge = badgeWin;
  badgeWin.webContents.on('did-finish-load', () => { badgeReady = true; if (badgeLast) badgeWin.webContents.send('badge', badgeLast); });
  badgeWin.loadFile(path.join(__dirname, 'src', 'badge.html'));
  return badgeWin;
}
function updateBadge() {
  if (!settings || !settings.badge) return;
  const d = badgeData(), b = settings.badge, key = JSON.stringify([d, b.pos, b.style, b.size, b.enabled, !!state.perf]);
  if (key === badgeKey) return; badgeKey = key;
  if (!d) {
    badgeLast = { show: false };
    if (badgeWin && !badgeWin.isDestroyed() && badgeWin.isVisible()) { badgeWin.webContents.send('badge', badgeLast); setTimeout(() => { if (badgeWin && !badgeWin.isDestroyed() && !badgeData() && !process.env.FUXI_SHOTS) { badgeWin.destroy(); badgeWin = null; badgeReady = false; } else if (badgeWin && !badgeWin.isDestroyed() && !badgeData()) badgeWin.hide(); }, 1200); }
    return;
  }
  ensureBadge(); placeBadge();
  badgeLast = { show: true, ...d, style: b.style, size: b.size, perf: !!state.perf };
  if (badgeReady) badgeWin.webContents.send('badge', badgeLast);
  if (!badgeWin.isVisible()) badgeWin.showInactive();
}
ipcMain.handle('set-badge', (_, p) => { settings.badge = mergeBadge({ ...settings.badge, ...(p || {}) }); saveSettings(); badgeKey = ''; push(); return settings.badge; });
ipcMain.handle('test-badge', () => { badgePreview = Date.now() + 7000; badgeKey = ''; push(); setTimeout(() => { badgeKey = ''; push(); }, 7200); return true; });
// ---------- Tocando agora ----------
let npWin = null, npReady = false, npLast = null, npSig = '', npPreview = null;
function npData() {
  const c = settings.nowplaying; if (!c || !c.enabled) return null;
  if (npPreview && Date.now() < npPreview.until) return { site: 'spotify', ...npPreview.track };
  const m = state.media; if (!m) return null;
  const opts = ['spotify', c.youtube ? 'youtube' : null].filter(Boolean).map(s => m[s] && m[s].title ? { site: s, state: (m[s].state === 'playing' && !m[s].paused) ? 'playing' : 'paused', title: m[s].title, artist: m[s].artist || '', art: m[s].smtc ? ((smtc && smtc.art) || '') : (m[s].art || ''), ctl: !!m[s].smtc } : null).filter(Boolean);
  const pl = opts.find(o => o.state === 'playing'); if (pl) return pl;
  const pa = opts.find(o => o.ctl); return pa && Date.now() - npLastPlay < 90000 ? pa : null;      // pausado: o disco fica 90 s (para você poder dar play) e some; cada janela é um processo
}
function placeNp() {
  if (!npWin || npWin.isDestroyed()) return;
  const wa = screen.getPrimaryDisplay().workArea, W = 380, H = 130, pos = settings.nowplaying.pos, m = 8;
  npWin.setBounds({ x: /right$/.test(pos) ? wa.x + wa.width - W - m : wa.x + m, y: /^top/.test(pos) ? wa.y + m : wa.y + wa.height - H - m, width: W, height: H });
}
function ensureNp() {
  if (npWin && !npWin.isDestroyed()) return npWin;
  npReady = false;
  npWin = new BrowserWindow({ width: 380, height: 130, show: false, frame: false, transparent: true, resizable: false, movable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload-np.js'), contextIsolation: true } });
  npWin.setAlwaysOnTop(true, 'screen-saver'); npWin.setIgnoreMouseEvents(true, { forward: true }); npWin.setMenuBarVisibility(false); global.__np = npWin;
  npWin.webContents.on('did-finish-load', () => { npReady = true; if (npLast) npWin.webContents.send('np', npLast); });
  npWin.loadFile(path.join(__dirname, 'src', 'np.html'));
  return npWin;
}
function updateNowPlaying() {
  if (!settings || !settings.nowplaying) return;
  const d = npData(), c = settings.nowplaying, sig = JSON.stringify([d && { ...d, art: d.art ? d.art.length : 0 }, c.pos, c.size, c.showTitle, settings.ui.lang, !!state.perf]);
  if (sig === npSig) return; npSig = sig;
  if (!d) {
    npLast = { show: false };
    if (npWin && !npWin.isDestroyed() && npWin.isVisible()) { npWin.webContents.send('np', npLast); setTimeout(() => { if (npWin && !npWin.isDestroyed() && !npData() && !process.env.FUXI_SHOTS) { npWin.destroy(); npWin = null; npReady = false; } else if (npWin && !npWin.isDestroyed() && !npData()) npWin.hide(); }, 1200); }
    return;
  }
  ensureNp(); placeNp();
  npLast = { show: true, ...d, pos: c.pos, size: c.size, showTitle: c.showTitle, lang: settings.ui.lang, perf: !!state.perf };
  if (npReady) npWin.webContents.send('np', npLast);
  if (!npWin.isVisible()) npWin.showInactive();
}
ipcMain.handle('np-cmd', async (_, c) => {
  if (!['prev', 'toggle', 'next', 'play', 'pause'].includes(c)) return false;
  const r = await run('mediactl.exe', ['cmd', c, 'spotify']); npLastPlay = Date.now();
  setTimeout(pollGames, 350); return /ok/.test(r.out);
});
ipcMain.on('np-hover', (_, on) => { if (npWin && !npWin.isDestroyed()) npWin.setIgnoreMouseEvents(!on, { forward: true }); });
ipcMain.handle('set-nowplaying', (_, p) => { settings.nowplaying = mergeNp({ ...settings.nowplaying, ...(p || {}) }); saveSettings(); npSig = ''; updateNowPlaying(); push(); return settings.nowplaying; });
ipcMain.handle('test-np', () => {                                                    // prévia: duas músicas de exemplo, trocando a cada 4 s
  const T = [{ title: 'Midnight City', artist: 'M83' }, { title: 'Blinding Lights', artist: 'The Weeknd' }, { title: 'Levitating', artist: 'Dua Lipa' }];
  const until = Date.now() + 13000; let i = 0;
  const step = () => { if (Date.now() >= until) { npPreview = null; npSig = ''; updateNowPlaying(); return; } npPreview = { until, track: { state: 'playing', ctl: true, ...T[i++ % T.length], art: '' } }; npSig = ''; updateNowPlaying(); setTimeout(step, 4200); };
  step(); return true;
});
// kind: game | gameEnd | device | preset | mic.  force = ignora as chaves de ligar/desligar (usado nos testes da tela Ajustes)
function notify(kind, o, force) {
  const n = settings.notify;
  if (!force && (!n.enabled || !n.types[kind])) return;
  if (!force && n.dnd && state.game && ['preset', 'mic', 'device', 'info'].includes(kind) && !n.dndAllow[kind === 'info' ? 'preset' : kind]) return;   // jogando: não incomoda
  const color = o.color || '#2ef2ff';
  const p = { summary: o.summary || null, id: o.id || kind, kind, soundKey: o.soundKey || kind, soundFile: o.soundFile || null, cloud: o.cloud || null, title: o.title, body: o.body || '', color, rgb: hexRgb(color).join(','),
    art: o.art || null, banner: o.banner || null, initials: o.initials || '', icon: o.icon || null, eq: o.eq || null,
    duration: n.duration * 1000, position: n.position, style: n.style, anim: n.anim, sound: !!n.sound && !process.env.FUXI_NO_SOUND && kind !== 'summary', volume: n.volume };   // FUXI_NO_SOUND: só para testes
  const w = ensureOverlay(); placeOverlay();
  clearTimeout(overlayHideTimer); clearTimeout(overlayIdle);
  if (!w.isVisible()) w.showInactive();
  p.lang = settings.ui.lang; if (overlayReady) w.webContents.send('toast', p); else overlayQueue.push(p);
}
let overlayIdle = null;
ipcMain.on('toast-empty', () => {
  clearTimeout(overlayHideTimer); overlayHideTimer = setTimeout(() => { if (overlay && !overlay.isDestroyed()) overlay.hide(); }, 300);
  clearTimeout(overlayIdle); overlayIdle = setTimeout(() => { if (overlay && !overlay.isDestroyed() && !overlay.isVisible() && !process.env.FUXI_SHOTS) { overlay.destroy(); overlay = null; overlayReady = false; overlayQueue = []; } }, 20000);     // sem aviso por 20 s: libera a janela (volta sozinha no próximo aviso)
});
const eqOf = p => (p ? { f: p.f, g: p.eq, q: p.q, t: p.t } : null);

// som de entrada de cada jogo: se existir um arquivo "<id-do-jogo>.mp3/.wav/.ogg…" na pasta de sons, toca ele; senão, a assinatura sintetizada do jogo
const SOUND_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'webm'];
function soundFileFor(id) {                                                    // 1) o seu (pasta de sons do usuario) vale mais · 2) o som que vem no app (assets/sounds)
  for (const d of [path.join(app.getPath('userData'), 'sounds'), path.join(__dirname, 'assets', 'sounds')]) for (const e of SOUND_EXT) { const f = path.join(d, id + '.' + e); if (fs.existsSync(f)) return pathToFileURL(f).href; }
  return null;
}
const gameSnd = id => (settings.notify.gameSounds === false || !DATA.games.some(g => g.id === id)) ? {} : { soundKey: 'game:' + id, soundFile: soundFileFor(id) };
// ---------- Surround virtual (HeSuVi) ----------
// O hub NÃO leva o HeSuVi dentro dele (os áudios HRIR têm direitos próprios): a pessoa instala o HeSuVi (projeto aberto, licença MIT) e o hub o controla
// escrevendo os pequenos arquivos de configuração dele (matrix, gain, conv, devna, deact). Em estéreo o HeSuVi cria 7 caixas virtuais e convolui com o HRIR.
// Níveis = quanto do som vai para as caixas laterais/traseiras/centro; o ganho de cada nível foi medido em simulação para manter o volume igual ao original.
const HESUVI_DIR = path.join(APO_ROOT, 'config', 'HeSuVi');
const HESUVI_LEVELS = {
  light:  { F: .70, C: .15, SL: [.25, -.10], RL: [.15, -.10], gain: -1.5 },
  medium: { F: .50, C: .20, SL: [.45, -.25], RL: [.30, -.20], gain: -1.9 },
  strong: { F: .40, C: .25, SL: [.60, -.30], RL: [.45, -.30], gain: -3.0 }
};
const HRIR_CHOICES = [['atmos', 'Atmos'], ['dh+', 'DH+'], ['dtshx', 'DTS HX'], ['razer', 'Razer'], ['sbx100', 'SBX 100'], ['gsx', 'GSX'], ['nahimic', 'Nahimic'], ['waves', 'Waves'], ['sonic', 'Sonic']];
const hesuviInstalled = () => { try { return fs.existsSync(path.join(HESUVI_DIR, 'hesuvi.txt')) && fs.existsSync(path.join(HESUVI_DIR, 'hrir')); } catch { return false; } };
const hesuviInfo = () => {
  if (!hesuviInstalled()) return { installed: false };
  let ver = ''; try { ver = fs.readFileSync(path.join(HESUVI_DIR, 'hesuvi.txt'), 'utf8').split(/\r?\n/)[0].replace('#', '').trim(); } catch {}
  return { installed: true, version: ver, hrirs: HRIR_CHOICES.filter(([k]) => fs.existsSync(path.join(HESUVI_DIR, 'hrir', k + '.wav'))).map(([k, n]) => ({ id: k, name: n })) };
};
function writeIf(file, text) {                                              // só grava se mudou (cada gravação faz o Equalizer APO recarregar)
  const f = path.join(HESUVI_DIR, file);
  try { if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === text) return false; fs.writeFileSync(f, text); return true; } catch { return false; }
}
const sgn = v => (v < 0 ? '+-' + Math.abs(v) : '+' + v);                    // o HeSuVi escreve "0.3*L+-0.2*R"
function matrixText(lv) {
  const [a, b] = lv.SL, [c, d] = lv.RL, t = (x, y, nx = 'L', ny = 'R') => `${x}*${nx}${sgn(y)}*${ny}`;
  return `Copy: L=${lv.F}*L R=${lv.F}*R C=${lv.C}*L+${lv.C}*R SUB=0.0 RL=${t(c, d)} RR=${d}*L+${c}*R SL=${t(a, b)} SR=${b}*L+${a}*R\r\n`;
}
const gainText = db => `Copy: ${['L', 'R', 'C', 'SUB', 'RL', 'RR', 'SL', 'SR'].map(c => `${c}=${db < 0 ? db.toFixed(1) : '-' + (+db).toFixed(1)}dB*${c}`).join(' ')}\r\n`;
function ensureHesuviInclude() {
  try {
    const cfg = path.join(APO_DIR, 'config.txt'), txt = fs.readFileSync(cfg, 'utf8');
    if (!/Include:\s*HeSuVi[\\/]hesuvi\.txt/i.test(txt)) fs.writeFileSync(cfg, txt.replace(/\s*$/, '') + '\r\nInclude: HeSuVi\\hesuvi.txt\r\n');
  } catch {}
}
function surroundLevelNow() {
  const s = settings.surround; if (!s.enabled) return 'off';
  const per = state.game && s.perGame[state.game];
  if (per) return per;                                                  // exceção do jogo > ajuste cloud > nível geral
  if (state.cloud && settings.cloud.surround !== 'same') return settings.cloud.surround;
  return s.level;
}
function applySurround() {
  const s = settings.surround;
  if (!s.managed || !hesuviInstalled()) { state.surroundLevel = null; return; }
  const level = surroundLevelNow(), guid = (fuxiEp || s.deviceGuid || '').toLowerCase();
  if (fuxiEp && s.deviceGuid !== fuxiEp.toLowerCase()) { s.deviceGuid = fuxiEp.toLowerCase(); saveSettings(); }
  if (level === 'off' || !HESUVI_LEVELS[level] || !guid) {
    writeIf('deact.txt', 'Eval: active=false\r\n');
    if (state.surroundLevel !== 'off') { state.surroundLevel = 'off'; push(); }
    return;
  }
  const lv = HESUVI_LEVELS[level], hr = fs.existsSync(path.join(HESUVI_DIR, 'hrir', s.hrir + '.wav')) ? s.hrir : 'atmos';
  ensureHesuviInclude();
  writeIf('devna.txt', `Eval: device="${guid}"\r\n`);                     // só no Fuxi: caixas e outros dispositivos ficam como estão
  writeIf('conv.txt', `Convolution: hrir\\${hr}.wav\r\n`);
  if (fs.existsSync(path.join(HESUVI_DIR, 'hrir', '44', hr + '.wav'))) writeIf('conv44.txt', `Convolution: hrir\\44\\${hr}.wav\r\n`);
  writeIf('cfact.txt', 'Eval: usecf=false\r\n');
  writeIf('matrix.txt', matrixText(lv)); writeIf('gain.txt', gainText(lv.gain));
  writeIf('deact.txt', 'Eval: active=true\r\n');
  if (state.surroundLevel !== level) { state.surroundLevel = level; push(); }
}
ipcMain.handle('set-surround', (_, p) => {
  const n = p || {}, cur = settings.surround;
  settings.surround = mergeSurround({ ...cur, ...n, managed: true, perGame: n.perGame !== undefined ? n.perGame : cur.perGame });
  saveSettings(); applySurround(); push(); return settings.surround;
});
ipcMain.handle('open-hesuvi-page', () => shell.openExternal('https://sourceforge.net/projects/hesuvi/'));

// ---- IPC: regras e cloud ----
ipcMain.handle('rules-save', (_, list) => { settings.rules = mergeRules(list).filter(r => !!findProfile(r.preset)); saveSettings(); push(); pollGames(); return settings.rules; });
ipcMain.handle('rules-enabled', (_, v) => { settings.rulesEnabled = !!v; saveSettings(); push(); pollGames(); return settings.rulesEnabled; });
ipcMain.handle('set-cloud', (_, p) => {
  const c = settings.cloud, n = p || {};
  settings.cloud = mergeCloud({ ...c, ...n, services: { ...c.services, ...(n.services || {}) }, ext: { ...c.ext, ...(n.ext || {}), token: c.ext.token }, log: n.clearLog ? [] : c.log });
  saveSettings(); if (state.cloud) applyEq(state.active); applySurround(); push(); pollGames(); return settings.cloud;     // mudou o toque/surround durante uma sessão: vale na hora
});
// ensinar o hub: salva (ou remove) uma regra "processo + trecho do título = sessão deste serviço"; a prévia mostra qual nome de jogo seria lido
const stripContains = (t, c) => (c ? String(t).replace(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ') : String(t));
ipcMain.handle('cloud-preview', (_, title, contains) => cleanCloudTitle(stripContains(title, String(contains || '').slice(0, 60))));
ipcMain.handle('cloud-teach', (_, a) => {
  const c = settings.cloud, n = a || {};
  let learned = c.learned;
  if (n.removeId) learned = learned.filter(r => r.id !== n.removeId);
  else if (n.svc && n.proc) learned = [...learned.filter(r => !(r.svc === n.svc && r.proc.toLowerCase() === String(n.proc).toLowerCase() && r.contains === (n.contains || ''))), { svc: n.svc, proc: String(n.proc), contains: String(n.contains || '').trim() }];
  settings.cloud = mergeCloud({ ...c, learned }); saveSettings(); push(); pollGames();
  return settings.cloud.learned;
});
ipcMain.handle('cloud-windows', async () => {                       // o que o hub está vendo: janelas relevantes e como cada uma foi interpretada
  const wins = parseWins(await scan(['windows']));
  return wins.filter(w => BROWSER_RE.test(w.name) || XBOXAPP_RE.test(w.name) || /^geforcenow(streamer)?$/i.test(w.name) || /geforce\s*now|xbox\s*cloud|xcloud/i.test(w.title))
    .slice(0, 30).map(w => { const c = detectCloud([w]); return { name: w.name, title: w.title.slice(0, 120), svc: c ? SVC_LABEL[c.svc] : null, svcId: c ? c.svc : null, game: c ? c.name : null, learned: !!(c && c.learned) }; });
});
ipcMain.handle('open-sounds-folder', () => { const d = path.join(app.getPath('userData'), 'sounds'); fs.mkdirSync(d, { recursive: true }); shell.openPath(d); });
function notifyGame(id) {
  const g = findProfile(id); if (!g) return;
  const ap = settings.auto ? findProfile(effective(id) || id) : null;
  const cl = state.cloud && settings.cloud.touch !== 'off' ? ' · toque cloud' : '';
  notify('game', { id: 'game', ...gameSnd(id), cloud: state.cloud ? state.cloud.label : null, title: g.name, body: ap ? (state.cloud ? `Preset ${ap.name}${cl}` : `Preset aplicado: ${ap.name}`) : 'Troca automática desligada', color: g.color, art: g.iconArt, banner: g.banner, initials: ini(g.name), eq: eqOf(ap) });
}
function notifyGameEnd(id) {
  const g = findProfile(id), cur = findProfile(state.active); if (!g) return;
  notify('gameEnd', { id: 'game', title: g.name, body: settings.auto && cur ? `Voltando ao preset ${cur.name}` : 'Jogo fechado', color: g.color, art: g.iconArt, banner: g.banner, initials: ini(g.name), eq: settings.auto ? eqOf(cur) : null });
}
// Resumo da sessão: cartão com a arte do jogo, quanto tempo você jogou e o histórico dele (aparece logo depois do aviso de saída; só para sessões de 1 min ou mais)
function notifySummary(id, ms, cloud) {
  const g = findProfile(id); if (!g) return; const st = settings.stats[id] || { count: 0, ms: 0 }, ap = findProfile(state.active);
  notify('summary', { id: 'summary', title: g.name, body: '', color: g.color, art: g.iconArt, banner: g.art || g.banner, initials: ini(g.name), cloud, summary: { ms, total: st.ms || 0, count: st.count || 0, preset: ap ? ap.name : '' } });
}
function notifyDevice(known) {
  notify('device', known
    ? { id: 'device', soundKey: 'deviceOn', title: 'Fuxi H3 conectado', body: 'USB · reconhecido', icon: 'device', color: '#2ef2ff' }
    : { id: 'device', soundKey: 'deviceOff', title: 'Fuxi H3 desconectado', body: 'O som volta para a saída anterior', icon: 'deviceOff', color: '#ff4d6d' });
}
ipcMain.handle('set-notify', (_, patch) => {
  const n = settings.notify;
  settings.notify = mergeNotify({ ...n, ...(patch || {}), types: { ...n.types, ...((patch && patch.types) || {}) } });
  saveSettings(); push(); return settings.notify;
});
ipcMain.handle('test-notify', (_, kind, gameId) => {
  const g = (gameId && findProfile(gameId)) || findProfile('valorant'), cur = findProfile(state.active) || findProfile('default');
  if (kind === 'game') notify('game', { id: 'test-game', ...gameSnd(g.id), title: g.name, body: `Preset aplicado: ${g.name}`, color: g.color, art: g.iconArt, banner: g.banner, initials: ini(g.name), eq: eqOf(g) }, true);
  else if (kind === 'gameEnd') notify('gameEnd', { id: 'test-game', title: g.name, body: `Voltando ao preset ${cur.name}`, color: g.color, art: g.iconArt, banner: g.banner, initials: ini(g.name), eq: eqOf(cur) }, true);
  else if (kind === 'summary') notify('summary', { id: 'test-summary', title: g.name, body: '', color: g.color, art: g.iconArt, banner: g.art || g.banner, initials: ini(g.name), summary: { ms: 5025000, total: 41200000, count: 14, preset: cur.name } }, true);
  else if (kind === 'deviceOn') { notifyDeviceForce(true); }
  else if (kind === 'deviceOff') { notifyDeviceForce(false); }
  else if (kind === 'preset') notify('preset', { id: 'test-preset', title: cur.name, body: 'Preset ativo', icon: 'preset', color: cur.color, eq: eqOf(cur) }, true);
  else if (kind === 'micOff') notify('mic', { id: 'test-mic', soundKey: 'micOff', title: 'Microfone mutado', body: 'Ninguém te ouve agora', icon: 'micOff', color: '#ff4d6d' }, true);
  else if (kind === 'micOn') notify('mic', { id: 'test-mic', soundKey: 'micOn', title: 'Microfone ativo', body: 'Você está no ar', icon: 'mic', color: '#5ee0a0' }, true);
  return true;
});
function notifyDeviceForce(known) {
  notify('device', known
    ? { id: 'test-device', soundKey: 'deviceOn', title: 'Fuxi H3 conectado', body: 'USB · reconhecido', icon: 'device', color: '#2ef2ff' }
    : { id: 'test-device', soundKey: 'deviceOff', title: 'Fuxi H3 desconectado', body: 'O som volta para a saída anterior', icon: 'deviceOff', color: '#ff4d6d' }, true);
}

// ---------- Ações: atalhos globais e bandeja ----------
let tray = null, quitting = false;
const cyclable = () => allProfiles().filter(p => !p.exe);       // presets de uso (Padrão, Música…) + os seus; jogos ficam de fora
// mini-janela flutuante (atalho): volume, preset, microfone e espectro. Some sozinha ao clicar fora ou depois de alguns segundos parada.
let mini = null, miniTimer = null;
function closeMini() { clearTimeout(miniTimer); if (mini && !mini.isDestroyed()) { if (process.env.FUXI_SHOTS) mini.hide(); else { mini.destroy(); mini = null; } } }
function miniKeep() { clearTimeout(miniTimer); if (!process.env.FUXI_SHOTS) miniTimer = setTimeout(closeMini, 9000); }
function toggleMini() { if (mini && !mini.isDestroyed() && mini.isVisible()) closeMini(); else showMini(); }
function showMini() {
  const place = () => { const wa = screen.getPrimaryDisplay().workArea; mini.setBounds({ x: Math.round(wa.x + wa.width / 2 - 200), y: Math.round(wa.y + wa.height - 196 - 40), width: 400, height: 196 }); mini.show(); mini.focus(); miniKeep(); };
  if (!mini || mini.isDestroyed()) {
    mini = new BrowserWindow({ width: 400, height: 196, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, show: false, hasShadow: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' } });
    mini.setAlwaysOnTop(true, 'screen-saver'); global.__mini = mini;
    mini.on('blur', () => { if (!process.env.FUXI_SHOTS) setTimeout(closeMini, 50); });
    mini.webContents.once('did-finish-load', () => { mini.webContents.send('state', snapshot()); place(); });
    mini.loadFile(path.join(__dirname, 'src', 'mini.html'));
  } else { mini.webContents.send('state', snapshot()); place(); }
}
ipcMain.on('mini-keep', miniKeep);
ipcMain.on('mini-hide', closeMini);
ipcMain.handle('mini-open', () => { showMini(); });
function showWin() { if (!win || win.isDestroyed()) { createMainWindow(true); return; } if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function setPreset(id) {
  const p = findProfile(id); if (!p) return;
  settings.manual = id; saveSettings(); applyEq(id);
  notify('preset', { id: 'preset', title: p.name, body: 'Preset ativo', icon: 'preset', color: p.color, eq: eqOf(p) });
}
function cyclePreset(dir) {
  const l = cyclable(); if (!l.length) return;
  let i = l.findIndex(p => p.id === state.active); if (i < 0) i = l.findIndex(p => p.id === settings.manual); if (i < 0) i = 0;
  setPreset(l[(i + dir + l.length) % l.length].id);
}
// Alguns drivers USB aceitam o comando de mute mas não o aplicam. Então o mute é conferido: se não pegou,
// o hub zera o volume do microfone (e guarda o volume anterior para voltar ao reativar).
async function micState() {
  const r = await run('audiohelper.exe', ['mic']);
  try { const m = JSON.parse(r.out); if (typeof m.mute !== 'boolean') return null; return { ...m, mute: m.mute || m.volume < 0.01 }; } catch { return null; }
}
async function setMicMuted(mute) {
  const cur = await micState(); if (!cur) return null;
  if (mute) {
    if (cur.volume >= 0.01) settings.micVol = Math.round(cur.volume * 100), saveSettings();
    await run('audiohelper.exe', ['micmute', '1']);
    const after = await run('audiohelper.exe', ['mic']);
    let m2 = null; try { m2 = JSON.parse(after.out); } catch {}
    if (!m2 || !m2.mute) await run('audiohelper.exe', ['micvol', '0']);
  } else {
    await run('audiohelper.exe', ['micmute', '0']);
    if (cur.volume < 0.01) await run('audiohelper.exe', ['micvol', String(settings.micVol || 100)]);
  }
  return micState();
}
async function toggleMic() {
  const m = await micState();
  if (!m) return notify('mic', { id: 'mic', soundKey: 'micOff', title: 'Microfone não encontrado', body: 'Conecte o Fuxi H3 e tente de novo', icon: 'micOff', color: '#ff4d6d' });
  const mute = !m.mute;
  await setMicMuted(mute);
  notify('mic', mute ? { id: 'mic', soundKey: 'micOff', title: 'Microfone mutado', body: 'Ninguém te ouve agora', icon: 'micOff', color: '#ff4d6d' }
                     : { id: 'mic', soundKey: 'micOn', title: 'Microfone ativo', body: 'Você está no ar', icon: 'mic', color: '#5ee0a0' });
}
// reescreve o arquivo do motor com o que está valendo agora (preset ativo ou som original) — usado quando o ajuste do microfone muda
function refreshEngineFile() {
  const eng = engineStatus(); if (!eng.installed) return;
  if (state.bypass) { try { fs.writeFileSync(path.join(APO_DIR, APO_FILE), buildConfig({ eq: BANDS.map(() => 0), f: BANDS.slice(), q: BANDS.map(() => EQMath.Q) }, 0)); } catch {} }
  else applyEq(state.active);
}
ipcMain.handle('micfx-set', (_, p) => {
  const c = settings.micfx, n = p || {}, preset = n.preset || c.preset;
  settings.micfx = mergeMic(n.preset && n.preset !== 'custom' ? { ...c, ...n, preset } : { ...c, ...n, preset: n.preset || (['gain', 'hp', 'warm', 'presence', 'air', 'deess'].some(k => k in n) ? 'custom' : c.preset) });
  saveSettings(); refreshEngineFile(); push(); return settings.micfx;
});
function toggleBypass() {                                      // liga/desliga o equalizador sem mexer no preset salvo
  if (state.bypass) {
    applyEq(state.active); const p = findProfile(state.active);
    return notify('preset', { id: 'preset', title: 'Equalizador ligado', body: p ? `Preset ${p.name}` : '', icon: 'preset', color: p ? p.color : '#2ef2ff', eq: eqOf(p) });
  }
  const eng = engineStatus();
  if (!eng.installed) return notify('preset', { id: 'preset', title: 'Equalizador indisponível', body: 'O Equalizer APO não está instalado', icon: 'preset', color: '#ff4d6d' });
  try {
    fs.writeFileSync(path.join(APO_DIR, APO_FILE), buildConfig({ eq: BANDS.map(() => 0), f: BANDS.slice(), q: BANDS.map(() => EQMath.Q) }, 0));
    previewActive = true; state.bypass = true; push();
    notify('preset', { id: 'preset', title: 'Equalizador desligado', body: 'Som original, sem ajuste', icon: 'preset', color: '#8a8a96' });
  } catch {}
}
const toggleAuto = v => { settings.auto = v; saveSettings(); if (v && state.game) applyEq(effective(state.game)); else push(); };
const ACTIONS = { micMute: toggleMic, nextPreset: () => cyclePreset(1), prevPreset: () => cyclePreset(-1), bypass: toggleBypass, show: showWin, mini: () => toggleMini() };
ipcMain.handle('run-action', (_, a) => { if (ACTIONS[a]) return ACTIONS[a](); });

function registerHotkeys() {
  globalShortcut.unregisterAll(); hotkeyErrors = {};
  const h = settings.hotkeys; if (!h.enabled) return;
  for (const a of HOTKEY_ACTIONS) {
    const k = h.keys[a]; if (!k) continue;
    let ok = false; try { ok = globalShortcut.register(k, () => ACTIONS[a]()); } catch {}
    if (!ok) hotkeyErrors[a] = true;                              // atalho já usado por outro programa (ou repetido aqui)
  }
}
ipcMain.handle('set-hotkeys', (_, patch) => {
  const h = settings.hotkeys;
  settings.hotkeys = mergeHotkeys({ enabled: patch && 'enabled' in patch ? patch.enabled : h.enabled, keys: { ...h.keys, ...((patch && patch.keys) || {}) } });
  saveSettings(); registerHotkeys(); push(); return hotkeyErrors;
});
ipcMain.handle('set-intro', (_, patch) => { settings.intro = mergeIntro({ ...settings.intro, ...(patch || {}) }); saveSettings(); push(); return settings.intro; });
ipcMain.handle('set-tutorial', (_, done) => { settings.tutorial = { done: !!done }; saveSettings(); push(); return settings.tutorial; });
ipcMain.handle('set-startup', (_, p) => { settings.startup = mergeStartup({ ...settings.startup, ...(p || {}) }); saveSettings(); push(); return settings.startup; });
// início com o Windows (--startup): o renderer avisa quando a abertura termina; depois o hub fica na tela ou vai para a bandeja, como você escolheu.
// Se você mexer no app nesse intervalo, ele entende que quer usar e não esconde.
const STARTUP_MODE = process.argv.includes('--startup');
let startupTimer = null, startupTouched = false;
ipcMain.on('startup-intro-done', () => {
  if (!STARTUP_MODE || startupTimer || startupTouched) return;
  const s = settings.startup; if (s.afterIntro !== 'tray') return;
  startupTimer = setTimeout(() => {
    startupTimer = null;
    if (startupTouched || !win || win.isDestroyed() || !tray) return;
    if (process.env.FUXI_SHOTS) win.hide(); else win.destroy();
    if (!settings.trayHint) { settings.trayHint = true; saveSettings(); notify('info', { id: 'tray', title: 'Fuxi Hub continua ativo', body: 'Ele fica na bandeja, perto do relógio. Clique no ícone para abrir.', icon: 'info', color: '#2ef2ff' }, true); }
  }, s.delay * 1000);
});
ipcMain.on('startup-touched', () => { startupTouched = true; clearTimeout(startupTimer); startupTimer = null; });
ipcMain.handle('set-tray',(_, v) => { settings.closeToTray = !!v; saveSettings(); push(); });

function trayIcon() {                                          // fone ciano desenhado em código (32×32)
  const N = 32, b = Buffer.alloc(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - 15.5, y - 16.5);
    let a = y <= 19 ? Math.max(0, Math.min(1, 1.6 - Math.abs(d - 11.5))) : 0;                 // arco do headband
    if (y >= 15 && y <= 26 && ((x >= 3 && x <= 8) || (x >= 23 && x <= 28))) a = 1;           // conchas
    const i = (y * N + x) * 4; b[i] = 255 * a; b[i + 1] = 242 * a; b[i + 2] = 46 * a; b[i + 3] = 255 * a;   // BGRA
  }
  return nativeImage.createFromBitmap(b, { width: N, height: N });
}
async function popTrayMenu() {
  const m = await micState(), p = findProfile(state.active);
  const menu = Menu.buildFromTemplate([
    { label: tm('Abrir Fuxi Hub'), click: showWin },
    { type: 'separator' },
    { label: tm('Preset'), submenu: cyclable().map(c => ({ label: tm(c.name), type: 'radio', checked: c.id === state.active, click: () => setPreset(c.id) })) },
    { label: tm('Equalizador ligado'), type: 'checkbox', checked: !state.bypass, click: toggleBypass },
    { label: tm('Microfone mutado'), type: 'checkbox', checked: !!(m && m.mute), enabled: !!m, click: toggleMic },
    { type: 'separator' },
    { label: tm('Trocar preset ao abrir jogos'), type: 'checkbox', checked: settings.auto, click: i => toggleAuto(i.checked) },
    { label: tm('Avisos na tela'), type: 'checkbox', checked: settings.notify.enabled, click: i => { settings.notify = mergeNotify({ ...settings.notify, enabled: i.checked }); saveSettings(); push(); } },
    { type: 'separator' },
    { label: tm('Sair do Fuxi Hub'), click: () => app.quit() }
  ]);
  tray.popUpContextMenu(menu);
}
const BRAND = f => path.join(__dirname, 'assets', 'brand', f);
function createTray() {
  let ic = trayIcon();
  try { const b = nativeImage.createFromPath(BRAND('tray.png')); if (!b.isEmpty()) ic = b.resize({ width: 32, height: 32, quality: 'best' }); } catch {}   // marca nova; se faltar o arquivo, usa o ícone desenhado em código
  tray = new Tray(ic);
  tray.setToolTip('Fuxi Hub');
  tray.on('click', showWin);
  tray.on('right-click', popTrayMenu);
}

// ---------- Iniciar com o Windows ----------
// O hub precisa de administrador, e o Windows não deixa a chave "Run" abrir programa elevado sem pedir confirmação.
// Solução: uma tarefa agendada "ao entrar no Windows" com privilégios mais altos (sem janela de permissão).
const TASK = process.env.FUXI_TASK_NAME || 'Fuxi Hub';
const autoAvailable = app.isPackaged || !!process.env.FUXI_TASK_NAME;     // em desenvolvimento não há .exe para registrar
let autostart = { on: false, available: autoAvailable, error: null };
const sch = args => new Promise(res => execFile('schtasks.exe', args, { windowsHide: true, timeout: 20000 }, (e, out, err) => res({ ok: !e, out: String(out || '') + String(err || '') })));
async function refreshAutostart() {
  const r = await sch(['/Query', '/TN', TASK]);
  autostart = { ...autostart, on: r.ok };
  if (r.ok && autoAvailable) {                                    // tarefa da versão 0.4.0 abria escondida (--hidden): atualiza para abrir na tela (--startup)
    const x = await sch(['/Query', '/TN', TASK, '/XML']);
    if (x.ok && x.out.includes('--hidden')) await setAutostart(true);
  }
}
async function setAutostart(on) {
  autostart.error = null;
  if (!autoAvailable) { autostart.error = 'Disponível só na versão instalada.'; return push(); }
  if (on) {
    const user = (process.env.USERDOMAIN ? process.env.USERDOMAIN + '\\' : '') + require('os').userInfo().username;
    const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Abre o Fuxi Hub na bandeja ao entrar no Windows</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>${x(user)}</UserId><Delay>PT8S</Delay></LogonTrigger></Triggers>
  <Principals><Principal id="A"><UserId>${x(user)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Enabled>true</Enabled></Settings>
  <Actions Context="A"><Exec><Command>${x(process.execPath)}</Command><Arguments>--startup</Arguments></Exec></Actions>
</Task>`;
    const f = path.join(app.getPath('temp'), 'fuxi-hub-task.xml');
    try { fs.writeFileSync(f, '﻿' + xml, 'utf16le'); } catch { autostart.error = 'Não consegui preparar a tarefa.'; return push(); }
    const r = await sch(['/Create', '/TN', TASK, '/XML', f, '/F']);
    try { fs.unlinkSync(f); } catch {}
    if (!r.ok) autostart.error = 'O Windows recusou criar a tarefa (abra o hub como administrador).';
  } else {
    const r = await sch(['/Delete', '/TN', TASK, '/F']);
    if (!r.ok && (await sch(['/Query', '/TN', TASK])).ok) autostart.error = 'Não consegui remover a tarefa.';
  }
  await refreshAutostart(); push();
}
ipcMain.handle('set-autostart', (_, v) => setAutostart(!!v));

// ---------- Vincular o programa (.exe) de um jogo ----------
const EXE_OK = /^[\w .()+\-]{1,80}\.exe$/i;
function addExe(id, name) {
  if (!DATA.games.some(g => g.id === id) || !EXE_OK.test(name)) return false;
  const low = name.toLowerCase();
  settings.exes = settings.exes || {};
  for (const k of Object.keys(settings.exes)) settings.exes[k] = settings.exes[k].filter(e => e.toLowerCase() !== low);   // um programa só pertence a um jogo
  const g = DATA.games.find(x => x.id === id);
  if (!g.exe.some(e => e.toLowerCase() === low)) (settings.exes[id] = settings.exes[id] || []).push(name);
  saveSettings(); push(); pollGames(); return true;
}
ipcMain.handle('exe-add', (_, id, name) => addExe(id, String(name || '')));
ipcMain.handle('exe-remove', (_, id, name) => {
  if (settings.exes && settings.exes[id]) { settings.exes[id] = settings.exes[id].filter(e => e !== name); saveSettings(); push(); pollGames(); }
  return true;
});
ipcMain.handle('exe-pick-file', async (_, id) => {
  const r = await dialog.showOpenDialog(win, { title: 'Escolha o programa (.exe) do jogo', properties: ['openFile'], filters: [{ name: 'Programa', extensions: ['exe'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const name = path.basename(r.filePaths[0]);
  return addExe(id, name) ? name : false;
});
// programas com janela aberta agora (para vincular com o jogo já rodando)
const SKIP = new Set(['explorer', 'applicationframehost', 'textinputhost', 'systemsettings', 'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'lockapp', 'widgets', 'electron', 'fuxi hub', 'claude', 'powershell', 'windowsterminal', 'conhost', 'taskmgr']);
ipcMain.handle('exe-open-windows', () => new Promise(res => {
  const cmd = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { [pscustomobject]@{ n=$_.ProcessName; t=$_.MainWindowTitle } } | ConvertTo-Json -Compress";
  execFile('powershell', ['-NoProfile', '-Command', cmd], { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (e, out) => {
    try {
      let a = JSON.parse(out || '[]'); if (!Array.isArray(a)) a = [a];
      const seen = new Set();
      res(a.filter(p => p && p.n && !SKIP.has(String(p.n).toLowerCase())).map(p => ({ exe: p.n + '.exe', title: String(p.t).slice(0, 80) }))
        .filter(p => !seen.has(p.exe.toLowerCase()) && seen.add(p.exe.toLowerCase())));
    } catch { res([]); }
  });
}));

// ---------- Helpers nativos ----------
const run = (exe, args, opts = {}) => new Promise(res => execFile(native(exe), args, { windowsHide: true, timeout: 20000, ...opts }, (e, out, err) => res({ e, out: out || '', err: err || '' })));

ipcMain.handle('mixer-list', async () => { const r = await run('audiohelper.exe', ['list']); try { return JSON.parse(r.out); } catch { return null; } });
ipcMain.handle('mixer-set', (_, pid, v) => run('audiohelper.exe', ['set', String(pid), String(Math.round(v))]).then(() => 1));
ipcMain.handle('mixer-mute', (_, pid, m) => run('audiohelper.exe', ['mute', String(pid), m ? '1' : '0']).then(() => 1));
ipcMain.handle('master-set', (_, v) => run('audiohelper.exe', ['master', String(Math.round(v))]).then(() => 1));
ipcMain.handle('master-mute', (_, m) => run('audiohelper.exe', ['mastermute', m ? '1' : '0']).then(() => 1));
ipcMain.handle('mic-get', async () => { const r = await run('audiohelper.exe', ['mic']); try { const m = JSON.parse(r.out); return m.error ? null : { ...m, mute: m.mute || m.volume < 0.01 }; } catch { return null; } });
ipcMain.handle('mic-set', (_, v) => run('audiohelper.exe', ['micvol', String(Math.round(v))]).then(() => 1));
ipcMain.handle('mic-mute', (_, m) => setMicMuted(!!m).then(() => 1));
ipcMain.handle('hid-list', async () => { const r = await run('hidprobe.exe', ['list', FUXI.vid, FUXI.pid]); try { return JSON.parse(r.out); } catch { return []; } });
ipcMain.handle('hid-monitor', async (_, secs) => { const r = await run('hidprobe.exe', ['monitor', FUXI.vid, FUXI.pid, String(secs || 12)], { timeout: 40000 }); return r.out.split(/\r?\n/).filter(l => l && !l.startsWith('[')); });

// ---------- IPC geral ----------
ipcMain.handle('get-state', () => snapshot());
ipcMain.handle('set-auto', (_, v) => toggleAuto(!!v));
ipcMain.handle('apply', (_, id) => { settings.manual = id; saveSettings(); applyEq(id); });
ipcMain.handle('set-eq', (_, id, d) => {
  const n = EQMath.normalize(d, BANDS);                                  // aceita {g,f,q} ou lista antiga de ganhos
  const c = settings.custom.find(x => x.id === id);
  if (c) { c.eq = n.g; c.f = n.f; c.q = n.q; c.t = n.t; } else settings.overrides[id] = n;
  saveSettings();
  if (state.active === id) applyEq(id); else push();
});
// Prévia temporária (modo "ao vivo" e comparação A/B): grava no equalizador SEM salvar nada no preset.
//   d = { g, f, q }          -> toca a curva em edição (B)
//   d = { flat: true, preamp } -> toca sem EQ, com o MESMO preamp da curva (A), para o volume não enganar a comparação
//   d = null                 -> volta ao preset ativo salvo
ipcMain.handle('preview-eq', (_, d) => {
  if (!d) { applyEq(state.active); return true; }
  const eng = engineStatus();
  if (!eng.installed) return false;
  try {
    let cfg;
    if (d.flat) cfg = buildConfig({ eq: BANDS.map(() => 0), f: BANDS.slice(), q: BANDS.map(() => EQMath.Q) }, Math.min(0, Number(d.preamp) || 0));
    else { const n = EQMath.normalize(d, BANDS); cfg = buildConfig({ eq: n.g, f: n.f, q: n.q, t: n.t }); }
    if (!eng.linked) linkConfig();
    fs.writeFileSync(path.join(APO_DIR, APO_FILE), cfg);
    previewActive = true; state.bypass = false;
    return true;
  } catch { return false; }
});
ipcMain.handle('reset-eq', (_, id) => { delete settings.overrides[id]; saveSettings(); if (state.active === id) applyEq(id); else push(); });
ipcMain.handle('save-custom', (_, name, d, color) => {
  const id = 'c_' + Date.now().toString(36), n = EQMath.normalize(d, BANDS);
  settings.custom.push({ id, name: String(name).slice(0, 28) || 'Meu preset', eq: n.g, f: n.f, q: n.q, t: n.t, color });
  saveSettings(); push(); return id;
});
ipcMain.handle('delete-custom', (_, id) => {
  settings.custom = settings.custom.filter(c => c.id !== id);
  for (const k of Object.keys(settings.assign)) if (settings.assign[k] === id) delete settings.assign[k];
  if (state.active === id) applyEq('default'); else push();
  saveSettings();
});
ipcMain.handle('assign', (_, gameId, presetId) => {
  if (presetId) settings.assign[gameId] = presetId; else delete settings.assign[gameId];
  saveSettings();
  if (state.game === gameId && settings.auto) applyEq(effective(gameId)); else push();
});
ipcMain.handle('export-presets', async () => {
  const r = await dialog.showSaveDialog(win, { defaultPath: 'fuxi-hub-presets.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled) return false;
  fs.writeFileSync(r.filePath, JSON.stringify({ overrides: settings.overrides, custom: settings.custom, assign: settings.assign }, null, 2));
  return true;
});
ipcMain.handle('import-presets', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
  if (r.canceled) return false;
  try {
    const j = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    for (const [k, v] of Object.entries(j.overrides || {})) if (EQMath.valid(v, BANDS.length)) settings.overrides[k] = EQMath.normalize(v, BANDS);
    for (const c of j.custom || []) if (c && c.name && EQMath.valid({ g: c.eq }, BANDS.length) && !settings.custom.some(x => x.id === c.id)) {
      const n = EQMath.normalize({ g: c.eq, f: c.f, q: c.q, t: c.t }, BANDS);
      settings.custom.push({ id: String(c.id || 'c_' + Math.random().toString(36).slice(2)), name: String(c.name).slice(0, 28), eq: n.g, f: n.f, q: n.q, t: n.t, color: c.color });
    }
    Object.assign(settings.assign, j.assign || {});
    saveSettings(); push(); return true;
  } catch { return false; }
});
ipcMain.handle('open-engine-page', () => shell.openExternal('https://sourceforge.net/projects/equalizerapo/'));
ipcMain.handle('open-configurator', () => {
  const exe = path.join(APO_ROOT, 'DeviceSelector.exe');            // no APO 1.4+ o Configurator virou Device Selector
  if (!fs.existsSync(exe)) return false;
  spawn(exe, [], { detached: true, stdio: 'ignore' }).unref(); return true;
});
ipcMain.handle('open-art-folder', () => { const d = path.join(app.getPath('userData'), 'games'); fs.mkdirSync(d, { recursive: true }); shell.openPath(d); });
ipcMain.handle('win', (_, a) => {
  if (!win) return;
  if (a === 'min') win.minimize();
  if (a === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  if (a === 'close') win.close();
});

// O app roda como administrador (precisa gravar a config do equalizador). Nesse modo o sandbox do Chromium
// não consegue iniciar o processo gráfico: a janela fica preta e travada (ou o app fecha). Sem sandbox ele abre
// normal. É seguro aqui porque o app só carrega arquivos locais próprios (nenhum site) e usa contextIsolation.
app.commandLine.appendSwitch('no-sandbox');
// Economia de memória e de processos: GPU dentro do processo principal, áudio e rede sem processo à parte, sem renderizador reserva e sem recursos que o app não usa.
// Aceleração por GPU: DESLIGADA por padrão. Sem ela o app usa ~500 MB a menos de memória (na bandeja, ~90 MB no total) e tem um processo a menos.
// Quem quiser as animações no máximo de fluidez liga em Configurações → Geral (reinicia o app). A escolha é lida aqui, antes do app iniciar.
// Proteção: se o app não conseguir abrir com a GPU ligada (tela cinza/preta, processo gráfico caindo), ele desliga a GPU sozinho e volta a abrir.
//  - "gpu-probe.txt" conta as aberturas com GPU que não chegaram a ficar estáveis; na 3ª, a GPU é desligada antes de iniciar.
//  - o processo gráfico caindo com a GPU ligada também desliga e reinicia. Dá para forçar com o argumento --no-gpu.
let GPU_ON = false, GPU_AUTO_OFF = false;
const USER_DIR = app.getPath('userData'), GPU_SET = path.join(USER_DIR, 'settings.json'), GPU_PROBE = path.join(USER_DIR, 'gpu-probe.txt');
function gpuTurnOff() { try { const s = JSON.parse(fs.readFileSync(GPU_SET, 'utf8')); s.gpu = false; fs.writeFileSync(GPU_SET, JSON.stringify(s, null, 2)); } catch {} try { fs.unlinkSync(GPU_PROBE); } catch {} }
try { GPU_ON = JSON.parse(fs.readFileSync(GPU_SET, 'utf8')).gpu === true; } catch {}
if (process.argv.includes('--no-gpu')) { if (GPU_ON) gpuTurnOff(); GPU_ON = false; }
if (GPU_ON) {
  let n = 0; try { n = parseInt(fs.readFileSync(GPU_PROBE, 'utf8'), 10) || 0; } catch {}
  if (n >= 2) { gpuTurnOff(); GPU_ON = false; GPU_AUTO_OFF = true; } else { try { fs.writeFileSync(GPU_PROBE, String(n + 1)); } catch {} }
}
if (!GPU_ON) { app.disableHardwareAcceleration(); app.commandLine.appendSwitch('enable-unsafe-swiftshader'); app.commandLine.appendSwitch('in-process-gpu'); }   // sem GPU: tudo dentro do processo principal (economiza memória). Com GPU: processo gráfico separado, o mais estável
let gpuFalling = false;
function gpuFail(why) {                                                    // GPU ligada e quebrou: desliga e reinicia
  if (!GPU_ON || gpuFalling || process.env.FUXI_SHOTS) return; gpuFalling = true;
  try { fs.appendFileSync(path.join(USER_DIR, 'gpu-fail.log'), new Date().toISOString() + ' ' + why + '\n'); } catch {}
  gpuTurnOff(); quitting = true; app.relaunch(); app.exit(0);
}
app.on('child-process-gone', (_, d) => { if (d && d.type === 'GPU') gpuFail('gpu process gone: ' + d.reason); });
app.on('render-process-gone', (_, wc, d) => { if (d && d.reason !== 'clean-exit' && d.reason !== 'killed') gpuFail('renderer gone: ' + d.reason); });
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,AudioServiceOutOfProcess,NetworkServiceInProcess2,CalculateNativeWinOcclusion,MediaRouter,Translate,OptimizationHints,AutofillServerCommunication,HardwareMediaKeyHandling');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-default-apps');
app.commandLine.appendSwitch('no-pings');
const shots = process.env.FUXI_SHOTS ? require('./tools/shots.js') : null;   // só em testes
if (shots) shots.early(app);
const gotLock = shots ? true : app.requestSingleInstanceLock();      // segunda abertura só traz a janela para a frente
if (!gotLock) app.quit(); else app.on('second-instance', showWin);
// A janela principal só existe enquanto está na tela: ao ir para a bandeja ela é destruída (libera o renderizador, a maior parte da memória)
// e criada de novo ao abrir. O hub segue trabalhando no processo principal.
let winCreated = 0;
function createMainWindow(forceShow) {
  const first = winCreated++ === 0;
  win = new BrowserWindow({
    width: 1180, height: 760, minWidth: 980, minHeight: 640,
    frame: false, backgroundColor: '#000000', title: 'Fuxi Hub', icon: BRAND('icon-512.png'), show: forceShow || !process.argv.includes('--hidden'),   // --hidden: início com o Windows, fica só na bandeja
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' }
  });
  const w = win;
  w.setMenuBarVisibility(false);
  w.loadFile(path.join(__dirname, 'src', 'index.html'));
  w.webContents.on('did-finish-load', () => { if (first) { pollDevice(); pollGames(); applyEq(settings.manual || 'default'); } else push(); });
  if (GPU_ON) {                                              // abertura com GPU: se a janela fica de pé por alguns segundos, está tudo certo
    w.webContents.once('did-finish-load', () => setTimeout(() => { if (!w.isDestroyed()) { try { fs.unlinkSync(GPU_PROBE); } catch {} } }, 4000));
    w.on('unresponsive', () => gpuFail('window unresponsive'));
  }
  w.on('close', e => {                                       // o X manda o hub para a bandeja: continua trocando preset por jogo
    if (quitting || !settings.closeToTray || !tray) return;
    e.preventDefault();
    if (!process.env.FUXI_SHOTS) { setTimeout(() => { if (!w.isDestroyed()) w.destroy(); }, 0); } else w.hide();
    if (!settings.trayHint) {
      settings.trayHint = true; saveSettings();
      notify('info', { id: 'tray', title: 'Fuxi Hub continua ativo', body: 'Ele fica na bandeja, perto do relógio. Clique no ícone para abrir.', icon: 'info', color: '#2ef2ff' }, true);
    }
  });
  w.on('closed', () => { if (win === w) win = null; });
  return w;
}
app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => { desktopCapturer.getSources({ types: ['screen'] }).then(s => cb({ video: s[0], audio: 'loopback' })).catch(() => cb({})); });     // áudio do sistema para o visualizador
  if (!gotLock) return;
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  loadSettings(); saveSettings(); startExtServer(); if (settings.remote.enabled) setTimeout(startRemote, 1500);
  if (!process.env.FUXI_SHOTS) autoBackup();                                  // testes não mexem na pasta de backups
  createMainWindow(false);
  try { createTray(); } catch {}
  if (GPU_AUTO_OFF) setTimeout(() => notify('info', { id: 'gpu', title: 'Aceleração por GPU desligada', body: 'O app não estava abrindo direito com ela. Você pode tentar ligar de novo em Configurações → Desempenho.', icon: 'info', color: '#ffb02e' }, true), 4000);
  registerHotkeys();
  refreshAutostart().then(push);
  if (shots) shots.run(win, app, () => overlay);
  const loop = (fn, visMs, hidMs) => { let busy = false; const tick = async () => { if (!busy) { busy = true; try { await fn(); } catch {} busy = false; } setTimeout(tick, win && !win.isDestroyed() && win.isVisible() && !state.perf ? visMs : hidMs); }; setTimeout(tick, visMs); };
  loop(() => new Promise(r => { pollDevice(); setTimeout(r, 1500); }), 5000, 10000);       // fone: 5 s com a janela aberta, 10 s na bandeja
  loop(pollGames, 3000, 4000);
  setTimeout(() => checkBattery().catch(() => {}), 6000); loop(checkBattery, 90000, 120000);                 // bateria do fone
  setTimeout(() => { if (!state.perf) scanLibs().catch(() => {}); }, 20000); setInterval(() => { if (!state.perf) scanLibs().catch(() => {}); }, 12 * 3600e3);   // jogos instalados (Steam/Epic/Riot)
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => { quitting = true; if (previewActive) { try { applyEq(state.active); } catch {} } });   // nunca deixa uma prévia não salva no som
app.on('window-all-closed', () => { if (!tray) app.quit(); });
