// ============================================================
// 🧪 Teste do módulo de INSCRIÇÃO DE CANDIDATOS — Segue-me V2
// multipart/form-data REAL via FormData do Node (fiel ao browser)
// Requer Node >= 18 (fetch, FormData e Blob globais).
// Rodar com o servidor ativo: node test-candidatos.js
// ============================================================

const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:3000';

let ok = 0;
let falha = 0;

function verificar(nome, cond, detalhe) {
  console.log((cond ? '[OK]    ' : '[FALHA] ') + nome + (cond ? '' : ` => ${detalhe}`));
  if (cond) ok += 1; else falha += 1;
}

// Imagens 1x1 válidas (bytes reais)
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmgA//9k==';

const PASTA_IMAGENS = path.resolve(__dirname, 'uploads', 'candidatos_img');

function blobBase64(b64, mime) {
  return new Blob([Buffer.from(b64, 'base64')], { type: mime });
}

/** Monta o FormData como o navegador faria, com variações p/ testes de erro. */
function montarFD(opcoes = {}) {
  const fd = new FormData();
  if (opcoes.semNome !== true) fd.append('nome', 'Pedro Henrique Souza');
  fd.append('telefone', '(11) 91234-5678');
  // E-mail: padrao do teste; sobrescrito nos cenarios de erro
  fd.append('email', opcoes.email !== undefined ? opcoes.email : 'pedro.souza@email.com');
  fd.append('data_nascimento', '2007-08-25');
  fd.append('naturalidade', 'Sao Paulo - SP');
  fd.append('endereco', 'Rua Verde, 10 - Centro');
  fd.append('nome_pai', 'Carlos Souza');
  fd.append('nome_mae', 'Ana Souza');
  fd.append('escolaridade', 'Medio - Cursando');
  fd.append('situacao', 'Cursando');
  fd.append('curso', 'Ensino Medio');
  fd.append('instituicao', 'Escola Estadual Central');
  fd.append('religiao', 'Catolica');
  fd.append('igreja_frequenta', 'Paroquia Sao Jose');
  fd.append('sacramentos', 'Batismo');
  fd.append('sacramentos', 'Eucaristia');
  fd.append('movimento_igreja', 'Grupo de jovens');
  fd.append('convidou_nome', 'Ana Paula Lima');
  fd.append('convidou_telefone', '(11) 95555-4444');
  fd.append('convidou_endereco', 'Rua Azul, 20 - Centro');
  fd.append('observacoes', 'Nenhuma observacao.');

  if (opcoes.semArquivos !== true) {
    fd.append('foto', blobBase64(PNG_B64, opcoes.tipoFoto || 'image/png'), 'foto-3x4.png');
    fd.append('assinatura', blobBase64(JPG_B64, 'image/jpeg'), 'assinatura.jpg');
  }
  return fd;
}

async function main() {
  // 0. Health + regressão das fichas (rota protegida continua ativa)
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  verificar('GET /api/health', health.status === 'ok', JSON.stringify(health));

  const semToken = await fetch(`${BASE}/api/fichas`);
  verificar('Regressao: GET /api/fichas sem token -> 401', semToken.status === 401, String(semToken.status));

  // 1. Limpeza: remove candidatos/lixeira de testes anteriores
  const { Candidato, Usuario, sequelize } = require('./src/models');
  await Candidato.destroy({ where: {} });
  const arquivosAntigos = fs.readdirSync(PASTA_IMAGENS).filter((f) => f !== '.gitkeep');
  arquivosAntigos.forEach((f) => fs.unlinkSync(path.join(PASTA_IMAGENS, f)));
  // Verifica a limpeza DEPOIS de apagar (a pasta precisa estar vazia)
  const residuos = fs.readdirSync(PASTA_IMAGENS).filter((f) => f !== '.gitkeep');
  verificar('Limpeza inicial (pasta sem residuos)', residuos.length === 0, residuos.join(', '));

  // 2. Inscrição completa e bem-sucedida
  const resp = await fetch(`${BASE}/api/candidatos`, { method: 'POST', body: montarFD() });
  const dados = await resp.json().catch(() => ({}));
  verificar('POST /api/candidatos -> 201', resp.status === 201, JSON.stringify(dados).slice(0, 300));

  const c = dados.candidato || {};
  verificar(
    'Campos de texto persistidos',
    c.nome === 'Pedro Henrique Souza' &&
      c.telefone === '(11) 91234-5678' &&
      c.email === 'pedro.souza@email.com' &&
      c.data_nascimento === '2007-08-25' &&
      c.nome_pai === 'Carlos Souza' &&
      c.nome_mae === 'Ana Souza' &&
      c.escolaridade === 'Medio - Cursando' &&
      c.situacao === 'Cursando' &&
      c.religiao === 'Catolica' &&
      c.convidou_nome === 'Ana Paula Lima' &&
      c.observacoes === 'Nenhuma observacao.',
    JSON.stringify(c).slice(0, 400)
  );

  verificar(
    'Sacramentos como JSON array',
    JSON.stringify(c.sacramentos) === JSON.stringify(['Batismo', 'Eucaristia']),
    JSON.stringify(c.sacramentos)
  );

  const reFoto = /^\/uploads\/candidatos_img\/candidato_foto_\d+_\d+\.png$/;
  const reAss = /^\/uploads\/candidatos_img\/candidato_assinatura_\d+_\d+\.jpg$/;
  verificar(
    'foto_url / assinatura_url no padrao',
    reFoto.test(c.foto_url || '') && reAss.test(c.assinatura_url || ''),
    `${c.foto_url} / ${c.assinatura_url}`
  );

  // 2.1 Listagem administrativa (GET /api/candidatos — verificarToken + isAdmin)
  const respSemTokenC = await fetch(`${BASE}/api/candidatos`);
  verificar('GET /api/candidatos sem token -> 401', respSemTokenC.status === 401, String(respSemTokenC.status));

  const emailJovemED = 'teste.qa.jovem@segueme.com.br';
  await fetch(`${BASE}/api/auth/registrar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailJovemED, senha: 'teste123', role: 'jovem' }),
  }); // 409 = ja existe de teste anterior (ok)
  const loginJovemED = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailJovemED, senha: 'teste123' }),
  })).json();
  const respJovemC = await fetch(`${BASE}/api/candidatos`, {
    headers: { Authorization: `Bearer ${loginJovemED.token}` },
  });
  verificar('GET /api/candidatos como jovem -> 403 (isAdmin)', respJovemC.status === 403, String(respJovemC.status));

  const loginAdminC = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@segueme.com.br', senha: 'admin123' }),
  })).json();
  const respAdminC = await fetch(`${BASE}/api/candidatos`, {
    headers: { Authorization: `Bearer ${loginAdminC.token}` },
  });
  const listaC = await respAdminC.json().catch(() => ({}));
  const candidatoLista = (listaC.candidatos || []).find((x) => x.email === 'pedro.souza@email.com');
  verificar('GET /api/candidatos como admin -> 200 + candidato presente', respAdminC.status === 200 && Boolean(candidatoLista), JSON.stringify(listaC).slice(0, 200));
  verificar('URL de imagem sem barras duplicadas', Boolean(candidatoLista) && candidatoLista.foto_url.startsWith('/uploads/candidatos_img/') && !candidatoLista.foto_url.includes('//'), candidatoLista?.foto_url);

  const admHtml = await (await fetch(`${BASE}/admin.html`)).text();
  verificar('admin.html: secao de candidatos (Foto/Assinatura)', admHtml.includes('candidatos-tbody') && admHtml.includes('Foto 3x4') && admHtml.includes('Assinatura'), '');

  // 3. Arquivos gravados em disco (nao vazios)
  const nomeFoto = (c.foto_url || '').split('/').pop();
  const nomeAss = (c.assinatura_url || '').split('/').pop();
  const existeFoto = fs.existsSync(path.join(PASTA_IMAGENS, nomeFoto));
  const existeAss = fs.existsSync(path.join(PASTA_IMAGENS, nomeAss));
  const naoVazios = existeFoto && existeAss &&
    fs.statSync(path.join(PASTA_IMAGENS, nomeFoto)).size > 0 &&
    fs.statSync(path.join(PASTA_IMAGENS, nomeAss)).size > 0;
  verificar('Arquivos gravados em uploads/candidatos_img', naoVazios, `${nomeFoto} / ${nomeAss}`);

  // 4. Imagem entregue pela rota AUTENTICADA (LGPD)
  //    A antiga rota estática /uploads/candidatos_img foi REMOVIDA
  //    do express.static: as imagens só saem por /api/arquivos.
  const img = await fetch(`${BASE}/api/arquivos/candidatos/${nomeFoto}`, {
    headers: { Authorization: `Bearer ${loginAdminC.token}` },
  });
  const ct = img.headers.get('content-type') || '';
  verificar('GET foto via /api/arquivos + admin (image/png)', img.status === 200 && ct.includes('image/png'), `${img.status} ${ct}`);

  const imgSemToken = await fetch(`${BASE}/api/arquivos/candidatos/${nomeFoto}`);
  verificar('LGPD: GET foto sem token -> 401', imgSemToken.status === 401, String(imgSemToken.status));

  const imgJovem = await fetch(`${BASE}/api/arquivos/candidatos/${nomeFoto}`, {
    headers: { Authorization: `Bearer ${loginJovemED.token}` },
  });
  verificar('LGPD: GET foto como jovem (nao admin) -> 403', imgJovem.status === 403, String(imgJovem.status));

  const imgEstatica = await fetch(`${BASE}${c.foto_url}`);
  verificar('LGPD: rota estatica /uploads/candidatos_img removida (404)', imgEstatica.status === 404, String(imgEstatica.status));

  // 5. Erros de validação
  const respTipo = await fetch(`${BASE}/api/candidatos`, {
    method: 'POST',
    body: montarFD({ tipoFoto: 'text/plain' }),
  });
  const dadosTipo = await respTipo.json().catch(() => ({}));
  verificar(
    'Foto com tipo invalido (text/plain) -> 400',
    respTipo.status === 400 && /JPEG ou PNG/i.test(dadosTipo.erro || ''),
    JSON.stringify(dadosTipo)
  );

  const respSemNome = await fetch(`${BASE}/api/candidatos`, {
    method: 'POST',
    body: montarFD({ semNome: true }),
  });
  const dadosSemNome = await respSemNome.json().catch(() => ({}));
  verificar(
    'Sem nome -> 400',
    respSemNome.status === 400 && /Nome e telefone/i.test(dadosSemNome.erro || ''),
    JSON.stringify(dadosSemNome)
  );

  const respEmail = await fetch(`${BASE}/api/candidatos`, {
    method: 'POST',
    body: montarFD({ email: 'sem-arroba' }),
  });
  const dadosEmail = await respEmail.json().catch(() => ({}));
  verificar(
    'Email invalido -> 400',
    respEmail.status === 400 && /e-mail/i.test(dadosEmail.erro || ''),
    JSON.stringify(dadosEmail)
  );

  // 6. Frontend
  const idx = await (await fetch(`${BASE}/index.html`)).text();
  verificar(
    'index.html: botao de inscricao -> /inscricao.html',
    idx.includes('Fazer Inscrição no Encontro (Novos Candidatos)') && idx.includes('/inscricao.html'),
    ''
  );

  const ins = await (await fetch(`${BASE}/inscricao.html`)).text();
  verificar(
    'inscricao.html: inputs file (foto + assinatura)',
    ins.includes('id="foto"') &&
      ins.includes('id="assinatura"') &&
      ins.includes('accept="image/*"') &&
      ins.includes('form-inscricao') &&
      ins.includes('modal-sucesso'),
    ''
  );

  const js = await (await fetch(`${BASE}/js/inscricao.js`)).text();
  verificar(
    'inscricao.js: envio via FormData (sem JSON)',
    js.includes('FormData') && js.includes('/api/candidatos'),
    ''
  );

  // 7. Limpeza final: remove o candidato de teste e seus arquivos
  await Candidato.destroy({ where: {} });
  await Usuario.destroy({ where: { email: emailJovemED } });
  [nomeFoto, nomeAss].forEach((f) => {
    if (f) {
      try { fs.unlinkSync(path.join(PASTA_IMAGENS, f)); } catch { /* já removido */ }
    }
  });
  const restantes = await Candidato.count();
  verificar('Limpeza final (0 candidatos)', restantes === 0, String(restantes));

  await sequelize.close();
  console.log('');
  console.log(`========== RESULTADO: ${ok} OK / ${falha} FALHAS ==========`);
  process.exit(falha > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Erro fatal no teste:', e);
  process.exit(1);
});
