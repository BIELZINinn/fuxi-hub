// Procura jogos instalados no PC (Steam, Epic Games e Riot). Só leitura: lê os arquivos de controle das próprias lojas, não mexe em nada.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const NOT_GAME = /redist|steamworks|proton|soundtrack|wallpaper|linux runtime|steam controller|directx|vcredist|benchmark|sdk|server$|dedicated|^steam$|runtime|tool$|demo$/i;
const BAD_EXE = /^(unins|uninst|crash|unitycrash|vc_?redist|dxsetup|dxwebsetup|dotnet|easyanticheat|eac|beservice|battleye|launcher_|setup|installer|cef|helper|updater|webhelper|oalinst|physx|notification_helper|report|bootstrap|ue4prereq|ueprereq|crs-)/i;

const BAD_ANY = /vconsole|bootstrap|launcher|crashhandler|crashreport|prereq|redist|benchmark|editor|server|installer/i;
const rd = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const ls = d => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
const isDir = d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } };
const reg = (key, val) => new Promise(res => execFile('reg', ['query', key, '/v', val], { windowsHide: true, timeout: 4000, encoding: 'utf8' }, (e, out) => {
  const m = !e && String(out).match(new RegExp(val + '\\s+REG_\\w+\\s+(.+)', 'i')); res(m ? m[1].trim() : '');
}));

// procura o .exe principal dentro da pasta de instalação: prefere "*-Shipping.exe" (Unreal) e senão o maior arquivo que não seja instalador/auxiliar
function mainExe(dir, hint) {
  if (hint) { const b = path.basename(hint); if (/\.exe$/i.test(b) && !BAD_EXE.test(b) && !BAD_ANY.test(b)) return b; }
  let best = null, count = 0;
  (function walk(d, depth) {
    for (const e of ls(d)) {
      if (++count > 600) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 5 && !/^(_commonredist|redist|redistributables|__installer|engine|crashreportclient|mono|monobleedingedge|data|launcher)$/i.test(e.name)) walk(p, depth + 1); continue; }
      if (!/\.exe$/i.test(e.name) || BAD_EXE.test(e.name) || BAD_ANY.test(e.name)) continue;
      let sz = 0; try { sz = fs.statSync(p).size; } catch {}
      const score = (/-shipping\.exe$/i.test(e.name) ? 1e12 : 0) + sz - depth * 1e5;
      if (!best || score > best.score) best = { name: e.name, score };
    }
  })(dir, 0);
  return best ? best.name : '';
}

async function steam() {
  const out = [];
  let root = (await reg('HKCU\\Software\\Valve\\Steam', 'SteamPath')).replace(/\//g, '\\');
  const roots = [root, 'C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'].filter(r => r && isDir(r));
  const libs = new Set();
  for (const r of roots) {
    libs.add(path.join(r, 'steamapps'));
    const v = rd(path.join(r, 'steamapps', 'libraryfolders.vdf'));
    for (const m of v.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps'));
  }
  for (const lib of libs) for (const f of ls(lib)) {
    if (!/^appmanifest_\d+\.acf$/i.test(f.name)) continue;
    const t = rd(path.join(lib, f.name)), g = k => ((t.match(new RegExp('"' + k + '"\\s+"([^"]*)"', 'i')) || [])[1] || '');
    const name = g('name'), dir = path.join(lib, 'common', g('installdir'));
    if (!name || NOT_GAME.test(name) || !isDir(dir)) continue;
    out.push({ store: 'Steam', name, dir, id: 'steam' + g('appid') });
  }
  return out;
}

function epic() {
  const out = [], base = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  for (const f of ls(base)) {
    if (!/\.item$/i.test(f.name)) continue;
    let j; try { j = JSON.parse(rd(path.join(base, f.name)).replace(/^\uFEFF/, '')); } catch { continue; }
    if (!j.DisplayName || !j.InstallLocation || !isDir(j.InstallLocation)) continue;
    if (j.MainGameAppName && j.AppName && j.MainGameAppName !== j.AppName) continue;                 // extra (DLC)
    if (NOT_GAME.test(j.DisplayName)) continue;
    out.push({ store: 'Epic', name: j.DisplayName, dir: j.InstallLocation, hint: j.LaunchExecutable, id: 'epic' + (j.AppName || j.DisplayName) });
  }
  return out;
}

function riot() {
  const out = [], meta = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Riot Games', 'Metadata');
  const NAMES = { valorant: 'VALORANT', league_of_legends: 'League of Legends', bacon: 'Legends of Runeterra', lion: '2XKO' };
  for (const d of ls(meta)) {
    if (!d.isDirectory() || !/\.live$/i.test(d.name)) continue;
    const key = d.name.replace(/\.live$/i, '').toLowerCase();
    for (const f of ls(path.join(meta, d.name))) {
      if (!/\.product_settings\.yaml$/i.test(f.name)) continue;
      const m = rd(path.join(meta, d.name, f.name)).match(/product_install_full_path:\s*"?([^"\r\n]+)"?/i);
      const dir = m && m[1].trim().replace(/\\\\/g, '\\').replace(/\//g, '\\');
      if (dir && isDir(dir)) out.push({ store: 'Riot', name: NAMES[key] || path.basename(dir), dir, id: 'riot' + key });
    }
  }
  return out;
}

// devolve a lista de jogos instalados (sem repetir). Cada item: { id, store, name, dir, exe }
async function scan() {
  const all = [...await steam().catch(() => []), ...epic(), ...riot()], seen = new Set(), res = [];
  for (const g of all) {
    const k = g.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!k || seen.has(k)) continue; seen.add(k);
    res.push({ id: g.id, store: g.store, name: g.name, dir: g.dir, exe: mainExe(g.dir, g.hint) });
  }
  return res.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { scan, mainExe };
