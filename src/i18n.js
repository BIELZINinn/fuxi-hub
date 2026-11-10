// Tradutor de interface: o app é escrito em português; em inglês/espanhol cada texto na tela é trocado pelo dicionário (i18n-en.js / i18n-es.js).
// Funciona também para o que a interface cria depois (observa o DOM) e volta ao português sem recarregar.
(function () {
  const ATTRS = ['title', 'placeholder', 'aria-label'];
  let lang = 'pt';
  try { lang = localStorage.getItem('fuxi.lang') || 'pt'; } catch {}
  const origText = new WeakMap(), setText = new WeakMap(), attrState = new WeakMap();

  function tr(s) {
    if (lang === 'pt') return null;
    const d = (window.I18N_DICT || {})[lang]; if (!d) return null;
    const t = String(s).replace(/\s+/g, ' ').trim(); if (!t) return null;
    const r = d.D[t]; if (r !== undefined) return r;
    for (const [re, fn] of d.P) { const m = t.match(re); if (m) return fn(m, x => { const y = tr(x); return y == null ? x : y; }); }
    return null;
  }
  const wrap = (cur, r) => (cur.match(/^\s*/)[0]) + r + (cur.match(/\s*$/)[0]);

  function doText(n) {                                       // um nó de texto novo, ou que o app reescreveu
    const cur = n.nodeValue;
    if (setText.get(n) === cur) return;                       // fomos nós que escrevemos isso
    origText.set(n, cur); setText.delete(n);
    if (lang === 'pt') return;
    const r = tr(cur); if (r != null) { const out = wrap(cur, r); setText.set(n, out); n.nodeValue = out; }
  }
  function doAttr(el, a) {
    const cur = el.getAttribute(a); if (cur == null) return;
    let st = attrState.get(el); if (!st) { st = {}; attrState.set(el, st); }
    if (st[a] && st[a].set === cur) return;
    st[a] = { orig: cur, set: null };
    if (lang === 'pt') return;
    const r = tr(cur); if (r != null) { st[a].set = r; el.setAttribute(a, r); }
  }
  const skip = el => !el || /^(SCRIPT|STYLE|TEXTAREA)$/.test(el.tagName) || el.closest && el.closest('[data-no-i18n]');
  function walk(root) {
    if (root.nodeType === 3) { if (!skip(root.parentElement)) doText(root); return; }
    if (root.nodeType !== 1 || skip(root)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n = w.currentNode;
    const handle = x => { if (x.nodeType === 3) { if (!skip(x.parentElement)) doText(x); } else ATTRS.forEach(a => doAttr(x, a)); };
    handle(n);
    while ((n = w.nextNode())) handle(n);
  }
  function refresh() {                                       // troca de idioma: refaz tudo a partir dos textos originais
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n = w.currentNode;
    const handle = x => {
      if (x.nodeType === 3) {
        if (skip(x.parentElement)) return;
        const base = (setText.get(x) === x.nodeValue && origText.has(x)) ? origText.get(x) : x.nodeValue;
        origText.set(x, base); setText.delete(x);
        if (lang === 'pt') { if (x.nodeValue !== base) x.nodeValue = base; return; }
        const r = tr(base); if (r != null) { const out = wrap(base, r); setText.set(x, out); x.nodeValue = out; } else if (x.nodeValue !== base) x.nodeValue = base;
      } else {
        ATTRS.forEach(a => {
          const cur = x.getAttribute(a); if (cur == null) return;
          const st = attrState.get(x) || {}, base = (st[a] && st[a].set === cur) ? st[a].orig : cur; st[a] = { orig: base, set: null }; attrState.set(x, st);
          if (lang === 'pt') { if (cur !== base) x.setAttribute(a, base); return; }
          const r = tr(base); if (r != null) { st[a].set = r; x.setAttribute(a, r); } else if (cur !== base) x.setAttribute(a, base);
        });
      }
    };
    handle(n); while ((n = w.nextNode())) handle(n);
  }
  let obs = null;
  function start() {
    if (obs || !document.body) return;
    obs = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') { if (!skip(m.target.parentElement)) doText(m.target); }
        else if (m.type === 'attributes') doAttr(m.target, m.attributeName);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    if (lang !== 'pt') refresh();
  }
  function setLang(l) {
    if (!['pt', 'en', 'es'].includes(l) || l === lang) return;
    lang = l; try { localStorage.setItem('fuxi.lang', l); } catch {}
    document.documentElement.lang = l === 'pt' ? 'pt-BR' : l; refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.I18N = { setLang, tr: s => { const r = tr(s); return r == null ? s : r; }, get lang() { return lang; } };
})();
