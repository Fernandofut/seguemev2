// ============================================================
// 🔒 QA — Teste de fumaça de SEGURANÇA (BLOQUEADORES 1 a 4)
// node test-seguranca.js   (com o servidor rodando em $BASE_URL)
//
// Cobre, contra o servidor REAL:
//   1. LGPD  — /uploads/* e /downloads/* não servem mais nada sem token;
//              /api/arquivos exige JWT, restringe ao dono/admin e
//              bloqueia path traversal;
//   2. Seed  — Admin padrão criado em dev, BLOQUEADO em produção;
//   3. Rate  — 11ª tentativa de login em 15 min devolve 429, e as
//              demais rotas NÃO são limitadas;
//   4. Helmet/CORS — cabeçalhos de hardening e origem restrita.
//
// ⚠️ Cada execução consome o rate limit de login (10/15 min por IP),
// que é compartilhado entre os testes. Para rodar as suítes em
// sequência sem colidir, suba um servidor de teste com o limite
// ampliado:   LOGIN_RATE_LIMIT_MAX=200 npm start
// (o DEFAULT em produção permanece 10).
// ============================================================

const fs = require('fs');
const path = require('path');

// Carrega o MESMO .env do servidor para que os testes reflitam a
// configuração real (origem do CORS e limite de login).
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const LOG_SERVIDOR = process.env.SERVER_LOG || path.resolve(__dirname, 'server.log');
const LIMITE_LOGIN = Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10;

let ok = 0;
let falha = 0;

function verificar(nome, condicao, detalhe = '') {
  console.log((condicao ? '[OK]    ' : '[FALHA] ') + nome + (condicao ? '' : ` => ${detalhe}`));
  if (condicao) ok += 1;
  else falha += 1;
}

const req = (p, o = {}) => fetch(BASE + p, o);
const post = (p, corpo, o = {}) =>
  req(p, {
    method: 'POST',
    body: JSON.stringify(corpo),
    ...o,
    headers: { 'Content-Type': 'application/json', ...(o.headers || {}) },
  });

// Contador de tentativas de login: o rate limit é por IP e compartilhado
// com as chamadas do próprio setup — necessário para calcular onde o 429 cai.
let tentativasDeLogin = 0;
const tentarLogin = (corpo) => {
  tentativasDeLogin += 1;
  return post('/api/auth/login', corpo);
};

const emailUnico = `seg${Date.now()}@teste.com`;

// PNG 1x1 válido, usado como foto/assinatura de teste
const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360' +
    '00000002000154a24f9f0000000049454e44ae426082',
  'hex'
);

(async () => {
  // ---------- BLOQUEADOR 4: HELMET ----------
  const saude = await req('/api/health');
  const csp = saude.headers.get('content-security-policy') || '';

  verificar('Helmet: X-Content-Type-Options: nosniff',
    saude.headers.get('x-content-type-options') === 'nosniff', saude.headers.get('x-content-type-options'));
  verificar('Helmet: X-Powered-By removido', saude.headers.get('x-powered-by') === null, String(saude.headers.get('x-powered-by')));
  verificar('Helmet: Strict-Transport-Security', saude.headers.get('strict-transport-security') !== null, 'ausente');
  verificar('Helmet: frame-ancestors / X-Frame-Options',
    saude.headers.get('x-frame-options') !== null || /frame-ancestors/.test(csp), 'ausente');
  verificar('Helmet: CSP permite blob: (obrigatorio p/ o painel admin)', /blob:/.test(csp), csp);
  verificar('Helmet: CSP mantem o CDN do Tailwind (frontend nao quebra)',
    /cdn\.tailwindcss\.com/.test(csp), 'CDN bloqueado');

  // ---------- BLOQUEADOR 4: CORS ----------
  const origemDoEnv = (process.env.FRONTEND_URL || '').trim();
  if (origemDoEnv && origemDoEnv !== '*') {
    const cEvil = await req('/api/health', { headers: { Origin: 'https://evil.example.com' } });
    verificar('CORS: origem nao autorizada NAO recebe Access-Control-Allow-Origin',
      cEvil.headers.get('access-control-allow-origin') === null, cEvil.headers.get('access-control-allow-origin'));

    const cBom = await req('/api/health', { headers: { Origin: origemDoEnv } });
    verificar('CORS: FRONTEND_URL do .env e aceita',
      cBom.headers.get('access-control-allow-origin') === origemDoEnv, cBom.headers.get('access-control-allow-origin'));
  } else {
    console.log('[AVISO] FRONTEND_URL vazio ou "*" — CORS liberado para qualquer origem. Defina FRONTEND_URL para testar a restricao.');
  }

  // ---------- BLOQUEADOR 2: seed ----------
  if (fs.existsSync(LOG_SERVIDOR)) {
    const log = fs.readFileSync(LOG_SERVIDOR, 'utf8');
    if (process.env.NODE_ENV === 'production') {
      verificar('Seed: Admin padrao BLOQUEADO com NODE_ENV=production',
        /seed do Admin padrão desativado|BLOQUEADA/.test(log), 'seedExecutado em production!');
    } else {
      verificar('Seed: Admin padrao criado fora de production',
        /Admin padrão criado|Admin já existente/.test(log), 'sem registro no log');
    }
  } else {
    console.log(`[AVISO] Log do servidor não encontrado (${LOG_SERVIDOR}) — checagem de seed pulada.`);
  }

  // ---------- Setup: usuários, ficha e candidato ----------
  await post('/api/auth/registrar', { nome: 'Jovem Sec', email: emailUnico, senha: 'Senha@123', role: 'jovem' });
  const loginJovem = await (await tentarLogin({ email: emailUnico, senha: 'Senha@123' })).json();
  verificar('Setup: jovem registrado e autenticado', Boolean(loginJovem.token), JSON.stringify(loginJovem).slice(0, 120));
  const tokenJovem = loginJovem.token;

  const emailTio = emailUnico.replace('@', 'tio@');
  await post('/api/auth/registrar', { nome: 'Tio Sec', email: emailTio, senha: 'Senha@123', role: 'tio' });
  const loginTio = await (await tentarLogin({ email: emailTio, senha: 'Senha@123' })).json();
  const tokenTio = loginTio.token;

  const loginAdmin = await (await tentarLogin({ email: 'admin@segueme.com.br', senha: 'admin123' })).json();
  const tokenAdmin = loginAdmin.token;
  verificar('Setup: admin autenticado', Boolean(tokenAdmin), JSON.stringify(loginAdmin).slice(0, 120));
  if (!tokenAdmin) {
    console.log('\n[ERRO] Sem token de admin — a maioria dos testes não pode rodar. Execute com NODE_ENV=development.');
    process.exit(1);
  }

  await post('/api/fichas', { nome: 'Jovem Sec', telefone: '11988887777' }, { headers: { Authorization: `Bearer ${tokenJovem}` } });
  await post('/api/fichas', { nome: 'Tio Sec', telefone: '11966665555' }, { headers: { Authorization: `Bearer ${tokenTio}` } });
  const lista = await (await req('/api/fichas', { headers: { Authorization: `Bearer ${tokenAdmin}` } })).json();
  const fJovem = (lista.fichas || []).find((f) => f.nome === 'Jovem Sec');
  const fTio = (lista.fichas || []).find((f) => f.nome === 'Tio Sec');
  verificar('Setup: fichas criadas e PDF gerado no backend', Boolean(fJovem && fTio), 'fichas ausentes');

  const fd = new FormData();
  fd.append('nome', 'Candidato Sec');
  fd.append('telefone', '11955554444');
  fd.append('foto', new Blob([PNG_1x1], { type: 'image/png' }), 'foto.png');
  fd.append('assinatura', new Blob([PNG_1x1], { type: 'image/png' }), 'assin.png');
  const respCandidato = await fetch(BASE + '/api/candidatos', { method: 'POST', body: fd });
  const candidatoCriado = await respCandidato.json();
  const nomeArquivo = String(candidatoCriado.candidato.foto_url).split('/').pop();
  verificar('Setup: candidato inscrito com foto + assinatura', respCandidato.status === 201, String(respCandidato.status));

  // ---------- BLOQUEADOR 1: vazamento de PII ----------
  verificar('LGPD: /uploads/fichas_pdf/x.pdf sem token -> 404',
    (await req(`/uploads/fichas_pdf/ficha_usuario_${fTio.usuario_id}.pdf`)).status === 404, 'ainda servido!');
  verificar('LGPD: /downloads/x.pdf sem token -> 404',
    (await req(`/downloads/ficha_usuario_${fTio.usuario_id}.pdf`)).status === 404, 'ainda servido!');
  verificar('LGPD: /uploads/candidatos_img/x.png sem token -> 404',
    (await req(`/uploads/candidatos_img/${nomeArquivo}`)).status === 404, 'ainda servido!');
  verificar('LGPD: /uploads/ nao lista diretorio', (await req('/uploads/')).status === 404, 'listagem exposta');

  // ---------- Autorizacao da rota nova ----------
  verificar('LGPD: /api/arquivos/fichas/:id sem token -> 401',
    (await req(`/api/arquivos/fichas/${fTio.usuario_id}`)).status === 401, 'sem token!');
  verificar('LGPD: /api/arquivos/candidatos/:arq sem token -> 401',
    (await req(`/api/arquivos/candidatos/${nomeArquivo}`)).status === 401, 'sem token!');
  verificar('LGPD: JWT forjado -> 401',
    (await req(`/api/arquivos/fichas/${fTio.usuario_id}`, { headers: { Authorization: 'Bearer token.forjado' } })).status === 401, 'aceitou token invalido');

  const tioVeJovem = await req(`/api/arquivos/fichas/${fJovem.usuario_id}`, { headers: { Authorization: `Bearer ${tokenTio}` } });
  verificar('LGPD: usuario comum nao acessa ficha alheia -> 403', tioVeJovem.status === 403, String(tioVeJovem.status));

  const propria = await req(`/api/arquivos/fichas/${fJovem.usuario_id}`, { headers: { Authorization: `Bearer ${tokenJovem}` } });
  verificar('LGPD: usuario acessa a PROPRIA ficha -> 200', propria.status === 200, String(propria.status));
  verificar('LGPD: PDF servido como application/pdf',
    (propria.headers.get('content-type') || '').includes('pdf'), propria.headers.get('content-type'));
  verificar('LGPD: resposta com Cache-Control: no-store (sem cache publico)',
    /no-store/.test(propria.headers.get('cache-control') || ''), propria.headers.get('cache-control'));
  verificar('LGPD: X-Robots-Tag: noindex (nao indexar PII)',
    /noindex/.test(propria.headers.get('x-robots-tag') || ''), propria.headers.get('x-robots-tag'));

  verificar('LGPD: admin acessa qualquer ficha -> 200',
    (await req(`/api/arquivos/fichas/${fTio.usuario_id}`, { headers: { Authorization: `Bearer ${tokenAdmin}` } })).status === 200, 'negado');

  verificar('LGPD: nao-admin nao acessa foto de candidato -> 403',
    (await req(`/api/arquivos/candidatos/${nomeArquivo}`, { headers: { Authorization: `Bearer ${tokenJovem}` } })).status === 403, 'permitido!');

  const fotoAdmin = await req(`/api/arquivos/candidatos/${nomeArquivo}`, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
  verificar('LGPD: admin acessa foto de candidato -> 200', fotoAdmin.status === 200, String(fotoAdmin.status));
  verificar('LGPD: imagem servida como image/png',
    (fotoAdmin.headers.get('content-type') || '').includes('png'), fotoAdmin.headers.get('content-type'));

  // ---------- Path traversal ----------
  const tentativas = [
    '..%2f..%2f..%2f.env',
    '....//....//database.sqlite',
    '%2e%2e%2f.env',
    'candidato_foto_1_1.png', // nome válido, arquivo inexistente
    'candidato_foto_1_1.exe', // extensão proibida
    'etc%2fpasswd',
  ];
  for (const tentativa of tentativas) {
    const r = await req(`/api/arquivos/candidatos/${tentativa}`, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
    verificar(`Traversal bloqueado: "${tentativa}"`, r.status !== 200 && r.status !== 500, `obtido ${r.status}`);
  }
  verificar('ID invalido: :usuarioId nao numerico -> 400',
    (await req('/api/arquivos/fichas/abc', { headers: { Authorization: `Bearer ${tokenAdmin}` } })).status === 400, '');
  verificar('ID invalido: :usuarioId negativo -> 400',
    (await req('/api/arquivos/fichas/-1', { headers: { Authorization: `Bearer ${tokenAdmin}` } })).status === 400, '');

  // ---------- BLOQUEADOR 3: rate limit ----------
  // O setup já consumiu `tentativasDeLogin` tentativas do MESMO IP.
  // Dispara o suficiente para ultrapassar o limite e confirmar que:
  //   (a) antes do limite, credenciais erradas respondem 401;
  //   (b) ao estourar, a resposta vira 429;
  //   (c) as rotas fora do /login NÃO são limitadas.
  const restantes = Math.max(1, LIMITE_LOGIN - tentativasDeLogin);
  const statusVistos = new Set();
  for (let i = 0; i < restantes + 2; i += 1) {
    const r = await tentarLogin({ email: 'inexistente@x.com', senha: 'errada' });
    statusVistos.add(r.status);
  }
  verificar(`Rate limit: credencial errada responde 401 ate o limite (${LIMITE_LOGIN}/15min)`,
    statusVistos.has(401), [...statusVistos].join(','));
  verificar(`Rate limit: tentativas alem do limite (${LIMITE_LOGIN}) recebem 429`,
    statusVistos.has(429), [...statusVistos].join(','));

  const registro = await post('/api/auth/registrar', { nome: 'Livre', email: `livre${Date.now()}@t.com`, senha: 'Senha@123', role: 'jovem' });
  verificar('Rate limit: /registrar NAO e bloqueado apos estourar o login',
    registro.status === 200 || registro.status === 201, String(registro.status));
  const ficha = await post('/api/fichas', { nome: 'Livre' }, { headers: { Authorization: `Bearer ${tokenJovem}` } });
  verificar('Rate limit: POST /api/fichas NAO e bloqueado', ficha.status < 400, String(ficha.status));
  const listar = await req('/api/fichas', { headers: { Authorization: `Bearer ${tokenAdmin}` } });
  verificar('Rate limit: GET /api/fichas NAO e bloqueado', listar.status === 200, String(listar.status));

  console.log('');
  console.log(`========== SEGURANÇA: ${ok} OK / ${falha} FALHAS ==========`);
  process.exit(falha > 0 ? 1 : 0);
})();
