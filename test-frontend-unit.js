// ============================================================
// 🧪 QA — Teste unitário do frontend do painel (sem navegador)
// node test-frontend-unit.js   (a partir da raiz do projeto)
//
// Carrega public/js/api.js + public/js/admin.js num contexto Node
// (sem DOM) e valida a lógica pura do fluxo autenticado de arquivos:
//   - rotaArquivoCandidato: converte o valor gravado no banco
//     (inclusive o formato legado "/uploads/candidatos_img/...")
//     na rota autenticada /api/arquivos/candidatos/:arquivo;
//   - nomeDoArquivo: extrai o nome do header Content-Disposition;
//   - linhaFicha/linhaCandidato: geram <button data-arquivo> e
//     NENHUM <a href> apontando para /uploads (o painel não pode
//     voltar a expor PII por link estático).
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC_JS = path.join(__dirname, 'public', 'js');
const jsAdmin = fs.readFileSync(path.join(PUBLIC_JS, 'admin.js'), 'utf8');

let ok = 0;
let falha = 0;
function v(nome, condicao, detalhe = '') {
  console.log((condicao ? '[OK]    ' : '[FALHA] ') + nome + (condicao ? '' : ' => ' + detalhe));
  if (condicao) ok += 1;
  else falha += 1;
}

// Contexto mínimo (sem DOM) — o sandbox substitui o navegador
const sandbox = {
  document: { getElementById: () => null, addEventListener() {} },
  window: { addEventListener() {}, location: {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  URL: { createObjectURL: () => 'blob:fake', revokeObjectURL() {} },
  Uint8Array,
  TextDecoder,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  setTimeout() {},
  fetch: () => {},
  console,
  alert() {},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Mesma ordem dos <script> do admin.html
try {
  vm.runInContext(fs.readFileSync(path.join(PUBLIC_JS, 'api.js'), 'utf8'), sandbox);
  vm.runInContext(jsAdmin, sandbox);
} catch (erro) {
  // admin.js registra listeners no carregamento; os stubs acima cobrem isso
  if (!/addEventListener|is not a function/.test(erro.message)) throw erro;
}

// ---------- rotaArquivoCandidato ----------
const casos = [
  ['/uploads/candidatos_img/candidato_foto_1789734445776_876394477.png', 'candidato_foto_1789734445776_876394477.png'],
  ['candidato_assinatura_1789734445776_726307312.jpg', 'candidato_assinatura_1789734445776_726307312.jpg'],
  ['/uploads/candidatos_img//barra_duplicada.png', 'barra_duplicada.png'],
];
for (const [entrada, esperado] of casos) {
  const obtido = sandbox.rotaArquivoCandidato(entrada);
  const rotaEsperada = '/api/arquivos/candidatos/' + encodeURIComponent(esperado);
  v(`rotaArquivoCandidato("${entrada}")`, obtido === rotaEsperada, `obtido ${obtido} | esperado ${rotaEsperada}`);
}
v('rotaArquivoCandidato(null) -> null', sandbox.rotaArquivoCandidato(null) === null, String(sandbox.rotaArquivoCandidato(null)));
v('rotaArquivoCandidato("") -> null', sandbox.rotaArquivoCandidato('') === null, String(sandbox.rotaArquivoCandidato('')));

// ---------- nomeDoArquivo (Content-Disposition) ----------
v('nomeDoArquivo: aspas simples',
  sandbox.nomeDoArquivo('attachment; filename="ficha.pdf"', 'x') === 'ficha.pdf',
  sandbox.nomeDoArquivo('attachment; filename="ficha.pdf"', 'x'));
v('nomeDoArquivo: RFC 5987 (UTF-8)',
  sandbox.nomeDoArquivo("attachment; filename*=UTF-8''foto_3x4.png", 'x') === 'foto_3x4.png',
  sandbox.nomeDoArquivo("attachment; filename*=UTF-8''foto_3x4.png", 'x'));
v('nomeDoArquivo: sem header -> padrao', sandbox.nomeDoArquivo(null, 'padrao.pdf') === 'padrao.pdf', '');

// ---------- renderização das linhas ----------
const ficha = { usuario_id: 12, nome: 'Fulano', telefone: '119', data_nascimento: null, usuario: { role: 'admin', email: 'a@b.c' } };
const htmlFicha = sandbox.linhaFicha(ficha);
v('linhaFicha: usa <button data-arquivo> com a rota autenticada',
  htmlFicha.includes('data-arquivo="/api/arquivos/fichas/12"'), htmlFicha.slice(0, 200));
v('linhaFicha: nenhum link estatico para o PDF',
  !/<a\s+href=.*ficha_usuario/.test(htmlFicha), '');

const candidato = {
  nome: 'C', telefone: '1', email: 'c@c.c', igreja_frequenta: 'I',
  foto_url: '/uploads/candidatos_img/candidato_foto_1_2.png',
  assinatura_url: '/uploads/candidatos_img/candidato_assinatura_3_4.jpg',
};
const htmlCandidato = sandbox.linhaCandidato(candidato);
v('linhaCandidato: botoes com a rota autenticada',
  htmlCandidato.includes('data-arquivo="/api/arquivos/candidatos/candidato_foto_1_2.png"') &&
  htmlCandidato.includes('data-arquivo="/api/arquivos/candidatos/candidato_assinatura_3_4.jpg"'), '');
v('linhaCandidato: nenhum href para /uploads',
  !/href=["'][^"']*\/uploads/.test(htmlCandidato), '');
v('linhaCandidato: candidato sem foto mostra "sem foto"',
  sandbox.linhaCandidato({ ...candidato, foto_url: null }).includes('sem foto'), '');

console.log('');
console.log(`========== FRONTEND UNIT: ${ok} OK / ${falha} FALHAS ==========`);
process.exit(falha > 0 ? 1 : 0);
