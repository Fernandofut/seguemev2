// ⚠️ SCRIPT TEMPORÁRIO DE VALIDAÇÃO (Etapa 5) — remove após o teste
const { spawn } = require('child_process');
const { sequelize, Usuario, Ficha } = require('./src/models');

const BASE = 'http://localhost:3000';
const EMAIL = 'admin@segueme.com.br';
const TUSER = 'teste.etapa5@segueme.com.br';
const resultados = [];

function check(nome, cond, extra = '') {
  resultados.push(`${cond ? 'PASS' : 'FAIL'} | ${nome}${extra ? ' | ' + extra : ''}`);
}

(async () => {
  let child;
  try {
    await Usuario.destroy({ where: { email: TUSER } });

    child = spawn('node', ['src/server.js'], { stdio: 'pipe' });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    await new Promise((r) => setTimeout(r, 2500));

    // ---- Estáticos ----
    const home = await fetch(BASE + '/');
    const homeHtml = await home.text();
    check('GET / -> 200 HTML', home.status === 200 && homeHtml.includes('login-form'));
    const appJs = await fetch(BASE + '/app.js');
    check('GET /app.js -> 200', appJs.status === 200 && (await appJs.text()).includes('apiFetch'));
    const tailwind = homeHtml.includes('cdn.tailwindcss.com');
    check('index.html usa Tailwind CDN', tailwind);

    // ---- Login admin ----
    const login = await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, senha: 'admin123' }),
    });
    const loginJson = await login.json();
    check('login admin -> 200 + token', login.status === 200 && !!loginJson.token);

    // ---- Listagem admin ----
    const listaVazia = await fetch(BASE + '/api/fichas', {
      headers: { Authorization: 'Bearer ' + loginJson.token },
    });
    const lvJson = await listaVazia.json();
    check('GET /api/fichas (admin, vazia) -> 200', listaVazia.status === 200 && Array.isArray(lvJson.fichas));

    // ---- Sem token -> 401 ----
    const semToken = await fetch(BASE + '/api/fichas');
    check('GET /api/fichas sem token -> 401', semToken.status === 401);

    // ---- Ciclo completo: registrar jovem, criar ficha, listar ----
    const reg = await fetch(BASE + '/api/auth/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TUSER, senha: 'senha123', role: 'jovem' }),
    });
    check('registrar jovem de teste -> 201', reg.status === 201);

    const loginJ = await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TUSER, senha: 'senha123' }),
    });
    const tokenJovem = (await loginJ.json()).token;

    const novaFicha = await fetch(BASE + '/api/fichas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokenJovem },
      body: JSON.stringify({ nome: 'Teste Etapa 5', email: 'nao-deve-salvar@x.com' }),
    });
    const nfJson = await novaFicha.json();
    check('POST /api/fichas -> 201', novaFicha.status === 201);
    check('ficha salva tem id', Number.isInteger(nfJson.ficha?.id));

    const lista2 = await fetch(BASE + '/api/fichas', {
      headers: { Authorization: 'Bearer ' + loginJson.token },
    });
    const l2Json = await lista2.json();
    const achou = (l2Json.fichas || []).some((f) => f.id === nfJson.ficha.id);
    check('ficha recém-criada aparece na listagem admin', achou);
    check('createdAt presente para exibição', !!nfJson.ficha?.createdAt);

    // ---- JWT persistido entre sessões (simulação localStorage no server) ----
    check('token admin é JWT de 3 partes', loginJson.token.split('.').length === 3);

    child.kill();
  } catch (e) {
    resultados.push('FAIL | exceção: ' + e.message);
    if (child) child.kill();
  }

  await new Promise((r) => setTimeout(r, 1200));

  // ---- Limpeza ----
  const u = await Usuario.findOne({ where: { email: TUSER } });
  if (u) {
    await Ficha.destroy({ where: { usuario_id: u.id } });
    await u.destroy();
  }
  console.log('LIMPEZA_OK');
  await sequelize.close();

  console.log('\n===== RESULTADOS ETAPA 5 =====');
  resultados.forEach((r) => console.log(r));
  const falhas = resultados.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\nRESUMO: ${resultados.length - falhas}/${resultados.length} PASS | ${falhas} FAIL`);
  process.exit(falhas > 0 ? 1 : 0);
})();
