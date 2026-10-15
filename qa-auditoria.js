// ============================================================
// 🔍 QA — Auditoria estrutural da base de código (bug hunt)
// node qa-auditoria.js   (a partir da raiz do projeto)
// Verifica: sintaxe dos JS, balanceamento de tags dos HTML,
// IDs usados nos scripts x existentes nas páginas, URLs de API,
// proteção das rotas admin, idempotência dos mkdirSync e model.
// ============================================================

const fs = require('fs');
const path = require('path');

let ok = 0;
let falha = 0;

function verificar(nome, cond, detalhe = '') {
  console.log((cond ? '[OK]    ' : '[FALHA] ') + nome + (cond ? '' : ` => ${detalhe}`));
  if (cond) ok += 1; else falha += 1;
}

/** Compila o código sem executá-lo (detecta erros de sintaxe). */
function sintaxeOk(codigo) {
  try {
    new Function(codigo);
    return null;
  } catch (e) {
    return e.message;
  }
}

const PUBLIC = path.join(__dirname, 'public');
const JS_PUBLICO = ['api.js', 'login.js', 'formulario.js', 'inscricao.js', 'admin.js'];
const JS_BACKEND = [
  'server.js',
  'controllers/fichaController.js',
  'controllers/candidatoController.js',
  'controllers/authController.js',
  'middlewares/authMiddleware.js',
  'middlewares/uploadMiddleware.js',
  'utils/caminhoSeguro.js',
  'utils/anexosFicha.js',
  'utils/pdfGenerator.js',
  'utils/logSeguro.js',
  'routes/fichaRoutes.js',
  'routes/candidatoRoutes.js',
  'routes/authRoutes.js',
  'routes/arquivosRoutes.js',
  'models/Ficha.js',
  'models/Candidato.js',
  'models/index.js',
];

// ---------- 1. Sintaxe de todos os arquivos JS ----------
for (const arquivo of JS_PUBLICO) {
  const codigo = fs.readFileSync(path.join(PUBLIC, 'js', arquivo), 'utf8');
  const erro = sintaxeOk(codigo);
  verificar(`Sintaxe JS: public/js/${arquivo}`, erro === null, erro || '');
}
for (const rel of JS_BACKEND) {
  const codigo = fs.readFileSync(path.join('src', rel), 'utf8');
  const erro = sintaxeOk(codigo);
  verificar(`Sintaxe JS: src/${rel}`, erro === null, erro || '');
}

// ---------- 2. HTML: balanceamento de tags + IDs usados no JS ----------
const PAGINAS = {
  'index.html': ['login.js'],
  'formulario.html': ['formulario.js'],
  'inscricao.html': ['inscricao.js'],
  'admin.html': ['admin.js'],
};
const TAGS = ['section', 'div', 'form', 'label', 'select', 'textarea', 'table', 'thead', 'tbody', 'tr', 'a', 'button', 'span', 'main', 'header'];

for (const [pagina, scripts] of Object.entries(PAGINAS)) {
  const html = fs.readFileSync(path.join(PUBLIC, pagina), 'utf8');
  const jsPagina = scripts
    .map((s) => fs.readFileSync(path.join(PUBLIC, 'js', s), 'utf8'))
    .join('\n');

  const desbalanceadas = [];
  for (const tag of TAGS) {
    const abre = (html.match(new RegExp(`<${tag}(?=[\\s>])`, 'gi')) || []).length;
    const fecha = (html.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    if (abre !== fecha) desbalanceadas.push(`${tag} (${abre}/${fecha})`);
  }
  verificar(`${pagina}: tags balanceadas`, desbalanceadas.length === 0, desbalanceadas.join(', '));

  const ids = new Set([...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
  const names = new Set([...html.matchAll(/name="([\w-]+)"/g)].map((m) => m[1]));
  const refsId = new Set();
  const refsName = new Set();
  for (const m of jsPagina.matchAll(/\$\(\s*['"]([\w-]+)['"]\s*\)/g)) refsId.add(m[1]);
  for (const m of jsPagina.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)) refsId.add(m[1]);
  for (const m of jsPagina.matchAll(/\bel\(\s*['"]([\w-]+)['"]\s*\)/g)) refsId.add(m[1]);
  for (const m of jsPagina.matchAll(/texto\(\s*['"]([\w-]+)['"]\s*\)/g)) refsId.add(m[1]);
  for (const m of jsPagina.matchAll(/simNao\(\s*['"]([\w-]+)['"]\s*\)/g)) refsName.add(m[1]);
  const faltandoId = [...refsId].filter((id) => !ids.has(id));
  const faltandoName = [...refsName].filter((n) => !names.has(n));
  verificar(`${pagina}: IDs usados em ${scripts.join('+')} existem no HTML`, faltandoId.length === 0, faltandoId.join(', '));
  verificar(`${pagina}: radios (simNao) existem no HTML (name)`, faltandoName.length === 0, faltandoName.join(', '));
}

// ---------- 3. URLs de API usadas no frontend ----------
const jsTodos = JS_PUBLICO.map((s) => fs.readFileSync(path.join(PUBLIC, 'js', s), 'utf8'));
const urls = new Set();
for (const codigo of jsTodos) {
  for (const m of codigo.matchAll(/['"`](\/api\/[\w\-/]+)['"`]/g)) urls.add(m[1]);
}
const ROTAS_VALIDAS = ['/api/auth/login', '/api/auth/registrar', '/api/fichas', '/api/candidatos', '/api/arquivos'];
const invalidas = [...urls].filter((u) => !ROTAS_VALIDAS.some((r) => u === r || u.startsWith(r + '/')));
verificar('Frontend: URLs de API batem com as rotas do backend', invalidas.length === 0, invalidas.join(', '));
verificar('Frontend: sem localhost hardcoded nos JS', !jsTodos.join('\n').includes('localhost'), '');

// ---------- 4. Barras duplicadas em links/URLs ----------
const htmlTodos = Object.keys(PAGINAS).map((p) => fs.readFileSync(path.join(PUBLIC, p), 'utf8'));
const tudo = [...htmlTodos, ...jsTodos].join('\n');
verificar('Barras duplicadas: nenhuma ocorrencia de //uploads ou //api', !tudo.includes('//uploads') && !tudo.includes('//api'), '');

// ---------- 5. Backend: proteção das rotas (isAdmin) ----------
const fichaRoutes = fs.readFileSync(path.join('src', 'routes', 'fichaRoutes.js'), 'utf8');
const candidatoRoutes = fs.readFileSync(path.join('src', 'routes', 'candidatoRoutes.js'), 'utf8');
verificar('Backend: GET /api/fichas com verificarToken + isAdmin', /router\.get\([^)]*verificarToken[^)]*isAdmin/.test(fichaRoutes), '');
verificar('Backend: GET /api/candidatos com verificarToken + isAdmin', /router\.get\([^)]*verificarToken[^)]*isAdmin/.test(candidatoRoutes), '');
verificar('Backend: POST /api/fichas exige verificarToken', /router\.post\([^)]*verificarToken/.test(fichaRoutes), '');
verificar('Backend: POST /api/candidatos é público (sem verificarToken)', !/router\.post\([^)]*verificarToken/.test(candidatoRoutes), '');

// ---------- 6. Pastas de upload criadas de forma idempotente ----------
const uploadMiddleware = fs.readFileSync(path.join('src', 'middlewares', 'uploadMiddleware.js'), 'utf8');
const fichaController = fs.readFileSync(path.join('src', 'controllers', 'fichaController.js'), 'utf8');
const pdfGenerator = fs.readFileSync(path.join('src', 'utils', 'pdfGenerator.js'), 'utf8');
verificar('Pastas: mkdirSync recursive em candidatos_img (nao lança se existe)', uploadMiddleware.includes('recursive: true'), '');
verificar('Pastas: mkdirSync recursive em fichas_pdf (nao lança se existe)', pdfGenerator.includes('recursive: true'), '');

// ---------- 7. Models alinhados com o frontend ----------
const fichaModel = fs.readFileSync(path.join('src', 'models', 'Ficha.js'), 'utf8');
const camposConjuge = ['nome_conjuge', 'idade_conjuge', 'telefone_conjuge', 'origem_movimento', 'tem_filhos', 'qtd_filhos', 'meio_transporte'];
const conjugeFaltando = camposConjuge.filter((campo) => {
  const linha = fichaModel.split('\n').find((l) => l.includes(`${campo}:`));
  return !linha || !linha.includes('allowNull: true');
});
verificar('Model Ficha: campos do conjuge com allowNull: true (jovem nao trava o banco)', conjugeFaltando.length === 0, conjugeFaltando.join(', '));

const candidatoModel = fs.readFileSync(path.join('src', 'models', 'Candidato.js'), 'utf8');
verificar('Model Candidato: apenas nome é obrigatório (allowNull: false)', /nome: \{[\s\S]*?allowNull: false[\s\S]*?tableName: 'candidatos'/.test(candidatoModel), '');

// ---------- 8. Unhandled promise rejections nos controllers ----------
const codigoAuth = fs.readFileSync(path.join('src', 'controllers', 'authController.js'), 'utf8');
const codigoCandidato = fs.readFileSync(path.join('src', 'controllers', 'candidatoController.js'), 'utf8');
for (const [nome, codigo] of [['fichaController', fichaController], ['candidatoController', codigoCandidato], ['authController', codigoAuth]]) {
  const funcoesAsync = (codigo.match(/async function \w+/g) || []).length;
  const catches = (codigo.match(/catch \(/g) || []).length + (codigo.match(/\} catch \{/g) || []).length;
  verificar(`Backend: ${nome} — async functions com try/catch (${funcoesAsync} async / ${catches} catch)`, catches >= funcoesAsync, `${funcoesAsync} async vs ${catches} catch`);
}
const serverJs = fs.readFileSync(path.join('src', 'server.js'), 'utf8');
verificar('Backend: rede de segurança unhandledRejection no server.js', serverJs.includes("process.on('unhandledRejection'"), '');

// ---------- 9. HARDENING (BLOQUEADORES 1-4) ----------
const authRoutes = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'authRoutes.js'), 'utf8');
const arquivosRoutes = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'arquivosRoutes.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(PUBLIC, 'js', 'admin.js'), 'utf8');

// BLOQUEADOR 4 — helmet + CORS restrito
verificar('Helmet: app.use(helmet()) presente no server.js', /app\.use\(\s*helmet\(/.test(serverJs), '');
verificar('CORS: origem vem de FRONTEND_URL do .env', /process\.env\.FRONTEND_URL/.test(serverJs), '');

// BLOQUEADOR 3 — rate limit somente no login
verificar('Rate limit: importado em routes/authRoutes.js', authRoutes.includes("require('express-rate-limit')"), '');
verificar('Rate limit: aplicado na rota POST /login',
  /router\.post\(\s*['"]\/login['"]\s*,\s*limiteLogin/.test(authRoutes), '');
const rotaRegistrar = /router\.post\(\s*['"]\/registrar['"]\s*,\s*([^,)]+)/.exec(authRoutes);
verificar('Rate limit: NAO aplicado na rota /registrar',
  Boolean(rotaRegistrar) && !rotaRegistrar[1].includes('limiteLogin'),
  rotaRegistrar ? rotaRegistrar[1].trim() : 'rota /registrar não encontrada');

// BLOQUEADOR 2 — backdoor de credencial padrão
verificar('Seed: seedAdminPadrao() so executa fora de production',
  /NODE_ENV\s*!==\s*['"]production['"]\s*\)\s*\{\s*await seedAdminPadrao\(\)/.test(serverJs), '');
verificar('Seed: trava interna de seguranca em production',
  /NODE_ENV\s*===\s*['"]production['"][\s\S]{0,400}?return;/.test(serverJs), '');

// BLOQUEADOR 1 — PII/LGPD
const semExpressStatic = serverJs.replace(/\/\/.*$/gm, ''); // ignora comentarios
verificar('LGPD: sem express.static servindo uploads/',
  !/express\.static\(\s*path\.resolve\([^)]*['"]uploads['"]/.test(semExpressStatic), '');
verificar('LGPD: sem rota publica /downloads', !/app\.use\(\s*['"]\/downloads['"]/.test(semExpressStatic), '');
verificar('LGPD: /api/arquivos montada no servidor', /app\.use\(\s*['"]\/api\/arquivos['"]\s*,\s*arquivosRoutes\)/.test(serverJs), '');
verificar('LGPD: rota de ficha exige verificarToken',
  /router\.get\(\s*['"]\/fichas\/:usuarioId['"]\s*,\s*verificarToken/.test(arquivosRoutes), '');
verificar('LGPD: rota de candidatos exige verificarToken + isAdmin',
  /router\.get\(\s*['"]\/candidatos\/:arquivo['"]\s*,\s*verificarToken\s*,\s*isAdmin/.test(arquivosRoutes), '');
verificar('LGPD: allow-list de nome de arquivo (anti path traversal)',
  /path\.basename/.test(arquivosRoutes) && /candidato_\(foto\|assinatura\)/.test(arquivosRoutes), '');
verificar('LGPD: entrega do arquivo via res.download', /res\.download\(/.test(arquivosRoutes), '');
verificar('LGPD: resposta sem cache publico (no-store)', /no-store/.test(arquivosRoutes), '');

// Frontend: nenhum link estatico para PII + fluxo autenticado
verificar('Frontend: sem <a href> apontando para /uploads ou /downloads',
  !/<a\s[^>]*href=["'][^"']*(\/uploads|\/downloads)/.test(adminJs + fs.readFileSync(path.join(PUBLIC, 'admin.html'), 'utf8')), '');
verificar('Frontend: botoes de arquivo usam data-arquivo (downloadArquivo)',
  /data-arquivo=/.test(adminJs) && /function downloadArquivo\(/.test(adminJs), '');
verificar('Frontend: fetch autenticado com header Authorization + Blob',
  /apiFetch\(/.test(adminJs) && /\.blob\(\)/.test(adminJs) && /URL\.createObjectURL\(/.test(adminJs), '');

console.log('');
console.log(`========== AUDITORIA: ${ok} OK / ${falha} FALHAS ==========`);
process.exit(falha > 0 ? 1 : 0);
