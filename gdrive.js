'use strict';
// Login com a conta Google e sincronização automática do backup do Fuxi Hub na pasta oculta do app no Google Drive (escopo drive.appdata:
// o hub só enxerga o próprio arquivo, nunca os outros arquivos do Drive). Sem dependências externas: OAuth "app para computador" com PKCE.
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata openid email';
const FILE = 'fuxi-hub-backup.json';
const DEFAULT_CLIENT = { id: '', secret: '' };                 // opcional: embutir aqui as credenciais do app; senão o usuário cola em Ajustes

let D = null, store = {}, access = null, accessExp = 0, busy = false, timer = null, poll = null, lastError = null, started = false;

const storeFile = () => path.join(D.app.getPath('userData'), 'gdrive.json');
const loadStore = () => { try { store = JSON.parse(fs.readFileSync(storeFile(), 'utf8')) || {}; } catch { store = {}; } };
const saveStore = () => { try { fs.writeFileSync(storeFile(), JSON.stringify(store, null, 2)); } catch {} };
const enc = s => { try { if (D.safeStorage.isEncryptionAvailable()) return 'e:' + D.safeStorage.encryptString(s).toString('base64'); } catch {} return 'p:' + Buffer.from(s, 'utf8').toString('base64'); };
const dec = s => { try { if (typeof s !== 'string') return ''; const b = Buffer.from(s.slice(2), 'base64'); return s[0] === 'e' ? D.safeStorage.decryptString(b) : b.toString('utf8'); } catch { return ''; } };
const clientId = () => store.clientId || DEFAULT_CLIENT.id;
const clientSecret = () => (store.secretEnc ? dec(store.secretEnc) : '') || DEFAULT_CLIENT.secret;
const configured = () => !!(clientId() && clientSecret());
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ---- hash estável do conteúdo (ordem das chaves não importa) ----
const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v);
const hashOf = b => crypto.createHash('sha1').update(canon((b && b.settings) || {})).digest('hex');

function status() {
  return { configured: configured(), clientId: clientId() ? clientId().slice(0, 18) + '…' : '', email: store.refreshEnc ? (store.email || '') : '', loggedIn: !!store.refreshEnc, busy, last: store.last || null, error: lastError };
}
const changed = () => { try { D.onChange(); } catch {} };
const fail = (m) => { lastError = m; changed(); return { ok: false, error: m }; };

// ---- tokens ----
async function tokenCall(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error_description || j.error || ('HTTP ' + r.status)); e.code = j.error; throw e; }
  return j;
}
async function getToken() {
  if (access && Date.now() < accessExp - 60000) return access;
  const rt = store.refreshEnc ? dec(store.refreshEnc) : '';
  if (!rt) throw Object.assign(new Error('Sem login'), { code: 'no_login' });
  const j = await tokenCall({ grant_type: 'refresh_token', refresh_token: rt });
  access = j.access_token; accessExp = Date.now() + (j.expires_in || 3600) * 1000; return access;
}
async function api(method, url, body, headers) {
  for (let i = 0; i < 2; i++) {
    const t = await getToken();
    const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + t, ...(headers || {}) }, body });
    if (r.status === 401 && i === 0) { access = null; continue; }
    if (!r.ok) throw Object.assign(new Error('Drive HTTP ' + r.status), { status: r.status });
    return r;
  }
}

// ---- login (navegador padrão + servidor local temporário) ----
async function login() {
  if (!configured()) return fail('Cole primeiro o Client ID e o Client Secret do Google.');
  lastError = null;
  const verifier = b64u(crypto.randomBytes(48)), challenge = b64u(crypto.createHash('sha256').update(verifier).digest()), st = b64u(crypto.randomBytes(16));
  let srv;
  try {
    const code = await new Promise((resolve, reject) => {
      srv = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
        const ok = u.searchParams.get('state') === st && u.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<meta charset="utf-8"><body style="font-family:Segoe UI,sans-serif;background:#0b0f14;color:#e8f1f8;text-align:center;padding-top:20vh"><h2>' + (ok ? 'Pronto! Pode fechar esta aba e voltar ao Fuxi Hub.' : 'Não foi possível entrar. Volte ao Fuxi Hub e tente de novo.') + '</h2>');
        if (ok) resolve(u.searchParams.get('code')); else reject(new Error(u.searchParams.get('error') || 'Login cancelado'));
      });
      srv.on('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        const redirect = 'http://127.0.0.1:' + srv.address().port;
        store._redirect = redirect;
        const q = new URLSearchParams({ client_id: clientId(), redirect_uri: redirect, response_type: 'code', scope: SCOPE, code_challenge: challenge, code_challenge_method: 'S256', state: st, access_type: 'offline', prompt: 'consent' });
        D.shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + q);
      });
      setTimeout(() => reject(new Error('Tempo esgotado. Tente entrar de novo.')), 180000);
    });
    const j = await tokenCall({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: store._redirect });
    delete store._redirect;
    if (!j.refresh_token) throw new Error('O Google não devolveu a permissão offline. Tente de novo.');
    access = j.access_token; accessExp = Date.now() + (j.expires_in || 3600) * 1000;
    store.refreshEnc = enc(j.refresh_token); store.baseLocal = null; store.baseRemote = null;
    try { store.email = JSON.parse(Buffer.from(j.id_token.split('.')[1], 'base64').toString('utf8')).email || ''; } catch { store.email = ''; }
    saveStore(); changed();
  } catch (e) { delete store._redirect; return fail(e.message || 'Falha no login'); }
  finally { try { srv && srv.close(); } catch {} }
  return sync({ first: true });
}

async function logout() {
  try { const rt = store.refreshEnc ? dec(store.refreshEnc) : ''; if (rt) await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: rt }) }); } catch {}
  for (const k of ['refreshEnc', 'email', 'baseLocal', 'baseRemote', 'last']) delete store[k];
  access = null; lastError = null; clearTimeout(timer); clearInterval(poll); poll = null; started = false; saveStore(); changed(); return { ok: true };
}

function setClient(id, secret) {
  id = String(id || '').trim(); secret = String(secret || '').trim();
  if (!/^[\w.\-]{10,200}\.apps\.googleusercontent\.com$/.test(id)) return fail('Client ID inválido (termina em .apps.googleusercontent.com).');
  if (!/^[\w\-]{8,100}$/.test(secret)) return fail('Client Secret inválido.');
  store.clientId = id; store.secretEnc = enc(secret); lastError = null; saveStore(); changed(); return { ok: true };
}

// ---- Drive ----
async function findRemote() {
  const q = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${FILE}'`, fields: 'files(id,modifiedTime)', pageSize: '1' });
  const j = await (await api('GET', 'https://www.googleapis.com/drive/v3/files?' + q)).json();
  return (j.files && j.files[0]) || null;
}
async function download(id) { const r = await api('GET', 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media'); const t = await r.text(); if (t.length > 3 * 1024 * 1024) throw new Error('Backup grande demais'); return JSON.parse(t); }
async function upload(obj, id) {
  const body = JSON.stringify(obj);
  if (id) { await api('PATCH', 'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(id) + '?uploadType=media', body, { 'Content-Type': 'application/json' }); return id; }
  const bd = 'fuxi' + crypto.randomBytes(8).toString('hex');
  const mp = `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: FILE, parents: ['appDataFolder'] })}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${bd}--`;
  const j = await (await api('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', mp, { 'Content-Type': 'multipart/related; boundary=' + bd })).json();
  return j.id;
}

const fmtDate = s => { try { return new Date(s).toLocaleString(D.lang() === 'en' ? 'en-US' : D.lang() === 'es' ? 'es-ES' : 'pt-BR'); } catch { return String(s || ''); } };
async function ask(remoteInfo, first) {
  const tm = D.tm, when = remoteInfo && remoteInfo.exportedAt ? fmtDate(remoteInfo.exportedAt) : '';
  const r = await D.dialog.showMessageBox(D.getWin(), {
    type: 'question', buttons: [tm('Usar o do Drive'), tm('Usar o deste PC'), tm('Decidir depois')], defaultId: first ? 0 : 2, cancelId: 2, title: tm('Google Drive'),
    message: first ? tm('Encontrei um backup do Fuxi Hub no seu Google Drive.') : tm('Este PC e o Google Drive têm configurações diferentes.'),
    detail: (when ? tm('Backup no Drive: ') + when + '\n\n' : '') + tm('“Usar o do Drive” restaura o backup do Drive neste PC. “Usar o deste PC” substitui o do Drive pelo que está aqui.')
  });
  return r.response === 0 ? 'drive' : r.response === 1 ? 'local' : 'skip';
}

// ---- sincronização ----
async function sync(opt) {
  opt = opt || {};
  if (!store.refreshEnc) return { ok: false, error: 'Sem login' };
  if (busy) return { ok: true, busy: true };
  busy = true; lastError = null; changed();
  try {
    const file = await findRemote(), localObj = D.makeBackup(), lh = hashOf(localObj);
    const markDone = (rh) => { store.baseLocal = lh2(); store.baseRemote = rh; store.last = new Date().toISOString(); saveStore(); };
    const lh2 = () => hashOf(D.makeBackup());
    const push = async () => { const o = D.makeBackup(); const id = await upload(o, file && file.id); store.fileId = id; store.baseLocal = hashOf(o); store.baseRemote = hashOf(o); store.last = new Date().toISOString(); saveStore(); };
    const pull = async (rem) => { if (!D.applyBackup(rem)) throw new Error('O backup do Drive não é válido'); store.baseLocal = lh2(); store.baseRemote = hashOf(rem); store.last = new Date().toISOString(); saveStore(); };
    if (!file) { await push(); return { ok: true, action: 'enviado' }; }
    const rem = await download(file.id), rh = hashOf(rem);
    if (opt.forcePull) { await pull(rem); return { ok: true, action: 'restaurado' }; }
    if (rh === lh) { markDone(rh); return { ok: true, action: 'igual' }; }
    const hasBase = !!(store.baseLocal && store.baseRemote), localChanged = !hasBase || lh !== store.baseLocal, remoteChanged = !hasBase || rh !== store.baseRemote;
    if (hasBase && localChanged && !remoteChanged) { await push(); return { ok: true, action: 'enviado' }; }
    if (hasBase && remoteChanged && !localChanged) { await pull(rem); return { ok: true, action: 'restaurado' }; }
    const c = await ask(rem, !hasBase);                          // primeiro login, ou os dois lados mudaram
    if (c === 'drive') { await pull(rem); return { ok: true, action: 'restaurado' }; }
    if (c === 'local') { await push(); return { ok: true, action: 'enviado' }; }
    return { ok: true, action: 'adiado' };
  } catch (e) {
    if (e.code === 'invalid_grant') { for (const k of ['refreshEnc', 'email']) delete store[k]; access = null; saveStore(); lastError = 'O acesso ao Google expirou. Entre de novo.'; }
    else lastError = e.status === 403 ? 'O Google bloqueou o acesso ao Drive. Confira se a Google Drive API está ativada no projeto.' : (/fetch failed|ENOTFOUND|ETIMEDOUT/i.test(String(e.message)) ? 'Sem conexão com o Google. Tento de novo mais tarde.' : (e.message || 'Falha ao sincronizar'));
    return { ok: false, error: lastError };
  } finally { busy = false; changed(); }
}

function schedule() {                                           // chamado a cada saveSettings: envia ~45 s depois da última mudança
  if (!store.refreshEnc) return;
  clearTimeout(timer); timer = setTimeout(() => { sync().catch(() => {}); }, 45000); if (timer.unref) timer.unref();
}
function start() {                                              // ao abrir o app: confere o Drive e passa a conferir a cada 15 min
  if (!store.refreshEnc || started) return; started = true;
  setTimeout(() => sync().catch(() => {}), 8000);
  poll = setInterval(() => sync().catch(() => {}), 15 * 60000); if (poll.unref) poll.unref();
}
function init(deps) { D = deps; loadStore(); }

module.exports = { init, start, schedule, status, login, logout, sync, setClient, hashOf };
