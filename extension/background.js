importScripts('config.js');                                    // define self.FUXI = { token, ports } (o hub escreve este arquivo para este PC)
let port = null;
async function hub(path, body) {
  const ports = port ? [port] : self.FUXI.ports;
  for (const p of ports) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fuxi-Token': self.FUXI.token }, body: JSON.stringify(body) } : {});
      if (r.ok) { port = p; return true; }
    } catch {}
  }
  port = null; return false;                                    // hub fechado: tenta de novo no próximo sinal
}
chrome.runtime.onMessage.addListener((m, sender) => {
  if (!sender.tab) return;
  const tab = String(sender.tab.id);
  if (m.type === 'state') hub('/cloud', { tab, ...m.data });
  if (m.type === 'closed') hub('/cloud', { tab, svc: m.svc, state: 'closed' });
  if (m.type === 'media') hub('/media', { tab, ...m.data });
  if (m.type === 'mediaClosed') hub('/media', { tab, site: m.site, state: 'closed' });
});
chrome.tabs.onRemoved.addListener(id => { for (const svc of ['xcloud', 'gfn']) hub('/cloud', { tab: String(id), svc, state: 'closed' }); for (const site of ['spotify', 'youtube']) hub('/media', { tab: String(id), site, state: 'closed' }); });
