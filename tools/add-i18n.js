// Acrescenta textos novos aos dicionários EN/ES (só os que ainda não existem). Uso: node tools/add-i18n.js
const fs = require('fs'), path = require('path');
const E = [
  ['Procurar jogos no PC', 'Find games on this PC', 'Buscar juegos en el PC'],
  ['Procurando…', 'Searching…', 'Buscando…'],
  ['jogo instalado sem preset', 'installed game without a preset', 'juego instalado sin preset'],
  ['jogos instalados sem preset', 'installed games without a preset', 'juegos instalados sin preset'],
  ['Ignorar', 'Ignore', 'Ignorar'],
  ['Não sugerir de novo', "Don't suggest again", 'No sugerir de nuevo'],
  ['Ao adicionar, o jogo ganha um card, tema com a cor dele e o preset "Jogos" (você pode editar). O hub passa a reconhecer o programa dele.', 'When you add a game it gets a card, a theme in its color and the "Games" preset (you can edit it). The hub also learns to recognize its program.', 'Al añadirlo, el juego recibe una tarjeta, un tema con su color y el preset "Juegos" (puedes editarlo). El hub también reconoce su programa.'],
  ['Jogo adicionado à lista', 'Game added to the list', 'Juego añadido a la lista'],
  ['Não consegui adicionar', "Couldn't add it", 'No pude añadirlo'],
  ['Não vou sugerir esse de novo', "I won't suggest this one again", 'No volveré a sugerir este'],
  ['Nenhum jogo novo encontrado', 'No new games found', 'No se encontraron juegos nuevos'],
  ['Exceções do Modo jogo', 'Game mode exceptions', 'Excepciones del Modo juego'],
  ['Não ativar com estes programas', "Don't activate for these programs", 'No activar con estos programas'],
  ['Vídeos e navegador em tela cheia não ligam o Modo jogo. Se um jogo estiver aberto (até na nuvem), ele liga mesmo assim.', 'Videos and browsers in fullscreen do not turn on Game mode. If a game is open (even in the cloud), it turns on anyway.', 'Los vídeos y el navegador a pantalla completa no activan el Modo juego. Si hay un juego abierto (incluso en la nube), se activa igualmente.'],
  ['Sempre ativar com estes programas', 'Always activate for these programs', 'Activar siempre con estos programas'],
  ['O Modo jogo liga quando o programa estiver na frente, mesmo em janela.', 'Game mode turns on when the program is in front, even windowed.', 'El Modo juego se activa cuando el programa está al frente, incluso en ventana.'],
  ['Adicionar', 'Add', 'Añadir'],
  ['Nenhum', 'None', 'Ninguno'],
  ['Remover', 'Remove', 'Quitar'],
  ['Último em tela cheia:', 'Last in fullscreen:', 'Último a pantalla completa:'],
  ['Sempre ativar', 'Always activate', 'Activar siempre'],
  ['Nome de programa inválido', 'Invalid program name', 'Nombre de programa no válido'],
  ['Bateria', 'Battery', 'Batería'],
  ['Jogos que você adicionou', 'Games you added', 'Juegos que añadiste'],
  ['Nenhum ainda. Use "Procurar jogos no PC" na aba Jogos.', 'None yet. Use "Find games on this PC" on the Games tab.', 'Ninguno todavía. Usa "Buscar juegos en el PC" en la pestaña Juegos.'],
  ['Bateria do fone: 20%', 'Headset battery: 20%', 'Batería de los auriculares: 20%'],
  ['Está acabando. Deixe um carregador por perto.', 'Running low. Keep a charger nearby.', 'Se está acabando. Ten un cargador cerca.'],
  ['Muito baixa. Coloque para carregar.', 'Very low. Put it on the charger.', 'Muy baja. Ponlos a cargar.'],
  ['Seu jogo', 'Your game', 'Tu juego'],
];
const PAT = [
  ['/^(\\d+) jogo\\(s\\) sem preset encontrado\\(s\\)$/', 'm => `${m[1]} game(s) without a preset found`', 'm => `${m[1]} juego(s) sin preset encontrado(s)`'],
  ['/^Bateria do fone: (\\d+)%$/', 'm => `Headset battery: ${m[1]}%`', 'm => `Batería de los auriculares: ${m[1]}%`'],
];
const q = s => JSON.stringify(s);
for (const [file, idx, anchor] of [['i18n-en.js', 1, '"Reconhecido": "Recognized",'], ['i18n-es.js', 2, '"Reconhecido": "Reconocido",']]) {
  const f = path.join(__dirname, '..', 'src', file); let t = fs.readFileSync(f, 'utf8'), add = '', n = 0;
  for (const e of E) { if (t.includes(q(e[0]) + ':') || add.includes(q(e[0]) + ':')) continue; add += ' ' + q(e[0]) + ': ' + q(e[idx]) + ','; n++; }
  if (!t.includes(anchor)) throw new Error('âncora não achada em ' + file);
  t = t.replace(anchor, anchor + add);
  const pk = PAT.filter(p => !t.includes(p[0])).map(p => `[${p[0]}, ${p[idx]}],\n`).join('');
  t = t.replace('const P = [\n', 'const P = [\n' + pk);
  fs.writeFileSync(f, t); console.log(file, n, 'textos,', PAT.length, 'padrões');
}
