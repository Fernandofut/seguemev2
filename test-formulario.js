// ============================================================
// 🧪 Teste: Ficha de Equipe de Trabalho — renderização condicional
// (jovem/primo vs tio) + POST /api/fichas intacto.
// Rodar com o servidor ativo: node test-formulario.js
// Requer Node >= 18.
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = 'http://localhost:3000';

let ok = 0;
let falha = 0;

function verificar(nome, cond, detalhe = '') {
  console.log((cond ? '[OK]    ' : '[FALHA] ') + nome + (cond ? '' : ` => ${detalhe}`));
  if (cond) ok += 1; else falha += 1;
}

// ------------------------------------------------------------
// Stub mínimo de DOM p/ executar o formulario.js REAL (vm)
// ------------------------------------------------------------
function criarClassList(inicial = []) {
  const set = new Set(inicial);
  return {
    toggle(nome, force) {
      if (force === undefined) {
        if (set.has(nome)) set.delete(nome); else set.add(nome);
        return set.has(nome);
      }
      if (force) { set.add(nome); return true; }
      set.delete(nome); return false;
    },
    add: (n) => set.add(n),
    remove: (n) => set.delete(n),
    contains: (n) => set.has(n),
  };
}

function criarAmbiente(role) {
  const redirects = [];
  const elementos = new Map();
  const get = (id) => {
    if (!elementos.has(id)) {
      elementos.set(id, {
        id,
        classList: criarClassList(id === 'bloco-conjuge' ? ['hidden'] : []),
        textContent: '',
        innerHTML: '',
        value: '',
        focus() {},
        addEventListener() {},
      });
    }
    return elementos.get(id);
  };
  const sandbox = {
    console,
    document: {
      title: '',
      getElementById: get,
      querySelectorAll: () => [],
    },
    window: { location: { replace: (url) => redirects.push(url) }, scrollTo() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    // api.js "stubado": getToken truthy e role vindo do cache do login
    // (ou do JWT decodificado) — exatamente como o browser faria.
    getToken: () => 'token-fake',
    getRole: () => role,
    getUsuarioSalvo: () => ({ id: 1, email: 'x@y.com', role }),
    fetch: () => {},
  };
  vm.createContext(sandbox);
  return { sandbox, redirects, elementos };
}

function rodarFormularioReal(role, codigo) {
  const { sandbox, redirects, elementos } = criarAmbiente(role);
  vm.runInContext(codigo, sandbox, { filename: 'formulario.js' });
  return {
    redirects,
    elementos,
    title: sandbox.document.title,
    bloco: elementos.get('bloco-conjuge'),
  };
}

async function main() {
  const html = await (await fetch(`${BASE}/formulario.html`)).text();
  const js = await (await fetch(`${BASE}/js/formulario.js`)).text();

  // ---------- 1. Estrutura do HTML (ids = colunas do Ficha.js) ----------
  const idsModel = [
    'nome', 'data_nascimento', 'telefone', 'endereco',
    'ano_encontro', 'paroquia_encontro', 'segues_trabalhados',
    'equipes_trabalhadas', 'ultima_equipe_servida',
    'serviu_lideranca', 'lideranca_igreja', 'vontade_lideranca',
    'possui_instrumento', 'toca_instrumento', 'canta', 'quer_dar_palestra',
    'tem_alergias', 'alergias_restricoes',
    'nome_conjuge', 'idade_conjuge', 'telefone_conjuge', 'origem_movimento',
    'tem_filhos', 'qtd_filhos', 'meio_transporte',
  ];
  const faltando = idsModel.filter((id) => !html.includes(`id="${id}"`) && !html.includes(`name="${id}"`));
  verificar('HTML: todos os 25 campos mapeiam colunas do Ficha.js (id ou name)', faltando.length === 0, faltando.join(', '));

  const radiosModel = ['serviu_lideranca', 'possui_instrumento', 'canta', 'quer_dar_palestra', 'tem_alergias', 'tem_filhos'];
  const radiosFaltando = radiosModel.filter((n) => !html.includes(`name="${n}" value="true"`));
  verificar('HTML: pares Sim/Nao com name = coluna do model', radiosFaltando.length === 0, radiosFaltando.join(', '));

  verificar('HTML: bloco do conjuge nasce com hidden', /id="bloco-conjuge" class="hidden/.test(html), '');
  verificar('HTML: rotulo ECC/Jovens Segue-me no origem_movimento', html.includes('Fizeram ECC ou são Jovens Segue-me?'), '');
  // Campos de PRODUTO (exigência da coordenação): contato_emergencia,
  // tamanho_camiseta e sacramentos DEVEM existir no formulário.
  const produtoHtmlFaltando = [
    html.includes('id="contato_emergencia"') ? null : 'contato_emergencia',
    html.includes('id="tamanho_camiseta"') ? null : 'tamanho_camiseta',
    html.includes('name="sacramento" value="Batismo"') ? null : 'sacramento (Batismo)',
    html.includes('name="sacramento" value="Crisma"') ? null : 'sacramento (Crisma)',
    html.includes('name="sacramento" value="Eucaristia"') ? null : 'sacramento (Eucaristia)',
    html.includes('name="sacramento" value="Confirmação"') ? null : 'sacramento (Confirmação)',
  ].filter(Boolean);
  verificar('HTML: campos de produto presentes (contato_emergencia, tamanho_camiseta, sacramentos)',
    produtoHtmlFaltando.length === 0, produtoHtmlFaltando.join(', '));
  verificar('HTML: bloco ED com nomenclatura correta', html.includes('Já participou da Equipe de Dirigentes (ED)?') && html.includes('name="participou_ed"') && html.includes('id="cargo_pasta_ed"'), '');
  verificar('HTML: idade automatica sem name (nao e coluna)', html.includes('id="idade-valor"') && !/name="idade"/.test(html), '');

  // ---------- 2. JS: perfil + POST intacto ----------
  verificar('JS: usa getRole() (cache do login / payload JWT)', js.includes('getRole()'), '');
  verificar('JS: toggle hidden somente !isTio', js.includes("bloco.classList.toggle('hidden', !isTio)"), '');
  verificar('JS: titulos dinamicos exatos', js.includes("Ficha de Equipe de Trabalho - ${isTio ? 'Tio' : 'Primo'}"), '');
  // ⚠️ O payload é montado por montarFicha() e enviado em
  // apiPost('/api/fichas', payload) — a foto é anexada em separado
  // (POST /api/fichas/foto) e entra no payload antes do envio.
  verificar('JS: POST /api/fichas preservado (via payload)',
    js.includes("apiPost('/api/fichas', payload)") && js.includes('const payload = montarFicha();'), '');
  // Os mesmos campos de produto precisam ser COLETADOS e enviados no POST.
  const produtoJsFaltando = [
    js.includes("contato_emergencia: texto('contato_emergencia')") ? null : 'contato_emergencia no montarFicha()',
    js.includes("tamanho_camiseta: texto('tamanho_camiseta')") ? null : 'tamanho_camiseta no montarFicha()',
    js.includes('input[name="sacramento"]:checked') ? null : 'sacramentos no montarFicha()',
  ].filter(Boolean);
  verificar('JS: campos de produto coletados e enviados no montarFicha()',
    produtoJsFaltando.length === 0, produtoJsFaltando.join(', '));
  verificar('JS: envia participou_ed/cargo_pasta_ed (ED)', js.includes("simNao('participou_ed')") && js.includes("texto('cargo_pasta_ed')"), '');

  // ---------- 2.1 Nomenclatura: Equipe de Dirigentes (ED) ----------
  function coletarFontes(dir, acum = []) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, item.name);
      if (item.isDirectory()) coletarFontes(caminho, acum);
      else if (/\.(html|js)$/.test(item.name)) acum.push(fs.readFileSync(caminho, 'utf8'));
    }
    return acum;
  }
  const fontes = [
    ...coletarFontes('public'),
    ...coletarFontes(path.join('src', 'controllers')),
    ...coletarFontes(path.join('src', 'utils')),
    fs.readFileSync(path.join('src', 'models', 'Ficha.js'), 'utf8'),
  ].join('\n');
  verificar('ED: nenhuma ocorrencia de "Encontro de Dirigentes" no projeto', !fontes.includes('Encontro de Dirigentes'), '');
  verificar('ED: PDF rotula os campos com "Equipe de Dirigentes (ED)"', fontes.includes("['participou_ed', 'Já participou da Equipe de Dirigentes (ED)']") && fontes.includes("['cargo_pasta_ed', 'Cargo / pasta na Equipe de Dirigentes (ED)']"), '');

  // Os campos de produto também existem no BACKEND: colunas no model e
  // rótulos no PDF (sem eles os dados seriam salvos e nunca impressos).
  const produtoBackendFaltando = [
    fontes.includes('contato_emergencia: { type: DataTypes.STRING(150)') ? null : 'coluna contato_emergencia (Ficha.js)',
    fontes.includes('tamanho_camiseta: { type: DataTypes.STRING(20)') ? null : 'coluna tamanho_camiseta (Ficha.js)',
    fontes.includes('sacramentos: { type: DataTypes.JSON') ? null : 'coluna sacramentos (Ficha.js)',
    fontes.includes("['contato_emergencia', 'Contato de Emergência']") ? null : 'rótulo contato_emergencia no PDF',
    fontes.includes("['tamanho_camiseta', 'Tamanho da Camiseta']") ? null : 'rótulo tamanho_camiseta no PDF',
    fontes.includes("['sacramentos', 'Sacramentos']") ? null : 'rótulo sacramentos no PDF',
  ].filter(Boolean);
  verificar('BACKEND: campos de produto mantidos no model e no PDF',
    produtoBackendFaltando.length === 0, produtoBackendFaltando.join(', '));

  // ---------- 3. Alternância visual executando o JS real (vm) ----------
  const tio = rodarFormularioReal('tio', js);
  verificar('TIO: bloco do conjuge EXIBIDO (hidden removido)', !tio.bloco.classList.contains('hidden'), '');
  verificar('TIO: titulo = "Ficha de Equipe de Trabalho - Tio"', tio.title === 'Ficha de Equipe de Trabalho - Tio', tio.title);
  verificar('TIO: sem redirecionamento indevido', tio.redirects.length === 0, tio.redirects.join(','));

  const jovem = rodarFormularioReal('jovem', js);
  verificar('JOVEM: bloco do conjuge OCULTO (hidden mantido)', jovem.bloco.classList.contains('hidden'), '');
  verificar('JOVEM: titulo = "Ficha de Equipe de Trabalho - Primo"', jovem.title === 'Ficha de Equipe de Trabalho - Primo', jovem.title);
  verificar('JOVEM: sem redirecionamento indevido', jovem.redirects.length === 0, jovem.redirects.join(','));

  // ---------- 4. E2E: POST /api/fichas com os dois perfis ----------
  const emails = { tio: 'teste.form.tio@segueme.com.br', jovem: 'teste.form.jovem@segueme.com.br' };
  for (const [tipo, email] of Object.entries(emails)) {
    await fetch(`${BASE}/api/auth/registrar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha: 'teste123', role: tipo }),
    }); // 409 = ja existe (ok)
  }
  const loginTio = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emails.tio, senha: 'teste123' }),
  })).json();
  const loginJovem = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emails.jovem, senha: 'teste123' }),
  })).json();
  verificar('Login dos dois perfis', Boolean(loginTio.token) && Boolean(loginJovem.token), '');

  const baseFicha = {
    nome: 'Roberta Souza Lima', data_nascimento: '1988-04-12', telefone: '(11) 97777-1234',
    endereco: 'Av. Central, 500', ano_encontro: '2018/2019', paroquia_encontro: 'Paroquia Sao Jose',
    contato_emergencia: 'Jose Silva — (11) 90000-0000', tamanho_camiseta: 'M',
    sacramentos: ['Batismo', 'Eucaristia'],
    segues_trabalhados: '2019, 2020', equipes_trabalhadas: 'Liturgia', ultima_equipe_servida: 'Liturgia',
    serviu_lideranca: true, lideranca_igreja: 'Coordenacao de grupo', vontade_lideranca: 'Sim, na musica',
    participou_ed: true, cargo_pasta_ed: 'Coordenadora da ED',
    possui_instrumento: false, toca_instrumento: null, canta: true, quer_dar_palestra: false,
    tem_alergias: false, alergias_restricoes: null,
  };

  // TIO: bloco visivel -> envia campos do conjuge (como o form faria)
  const respTio = await fetch(`${BASE}/api/fichas`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginTio.token}` },
    body: JSON.stringify({
      ...baseFicha,
      nome_conjuge: 'Andre Lima', idade_conjuge: '37', telefone_conjuge: '(11) 96666-4321',
      origem_movimento: 'ECC 2015', tem_filhos: true, qtd_filhos: '2', meio_transporte: 'Carro proprio',
    }),
  });
  verificar('POST tio (com conjuge) -> 201/200', respTio.status === 201 || respTio.status === 200, String(respTio.status));

  // JOVEM: bloco oculto -> campos do conjuge chegam null (como o form faria)
  const respJovem = await fetch(`${BASE}/api/fichas`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginJovem.token}` },
    body: JSON.stringify({
      ...baseFicha, nome: 'Lucas Andrade Primo',
      nome_conjuge: null, idade_conjuge: null, telefone_conjuge: null,
      origem_movimento: null, tem_filhos: null, qtd_filhos: null, meio_transporte: null,
    }),
  });
  verificar('POST jovem (sem conjuge) -> 201/200', respJovem.status === 201 || respJovem.status === 200, String(respJovem.status));

  // ---------- 5. Persistência conferida pela coordenação ----------
  const loginAdmin = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@segueme.com.br', senha: 'admin123' }),
  })).json();
  const lista = await (await fetch(`${BASE}/api/fichas`, {
    headers: { Authorization: `Bearer ${loginAdmin.token}` },
  })).json();
  const fichaTio = (lista.fichas || []).find((f) => f.usuario?.email === emails.tio);
  const fichaJovem = (lista.fichas || []).find((f) => f.usuario?.email === emails.jovem);

  verificar('ADMIN: ficha do tio com dados do conjuge e ED',
    Boolean(fichaTio) &&
    fichaTio.nome_conjuge === 'Andre Lima' &&
    fichaTio.origem_movimento === 'ECC 2015' &&
    fichaTio.tem_filhos === true &&
    fichaTio.qtd_filhos === '2' &&
    fichaTio.meio_transporte === 'Carro proprio' &&
    fichaTio.participou_ed === true &&
    fichaTio.cargo_pasta_ed === 'Coordenadora da ED',
    JSON.stringify(fichaTio || {}).slice(0, 300));

  verificar('ADMIN: ficha do jovem sem dados de casado',
    Boolean(fichaJovem) && fichaJovem.nome_conjuge === null && fichaJovem.origem_movimento === null,
    JSON.stringify(fichaJovem || {}).slice(0, 200));

  // Os campos de produto são gravados no banco (não são descartados pelo backend)
  verificar('ADMIN: campos de produto persistidos (contato_emergencia, tamanho_camiseta, sacramentos)',
    Boolean(fichaTio) &&
    fichaTio.contato_emergencia === 'Jose Silva — (11) 90000-0000' &&
    fichaTio.tamanho_camiseta === 'M' &&
    JSON.stringify(fichaTio.sacramentos) === JSON.stringify(['Batismo', 'Eucaristia']),
    JSON.stringify({ contato_emergencia: fichaTio?.contato_emergencia, tamanho_camiseta: fichaTio?.tamanho_camiseta, sacramentos: fichaTio?.sacramentos }));

  // PDF do tio gerado silenciosamente, entregue pela rota AUTENTICADA
  if (fichaTio) {
    const pdf = await fetch(`${BASE}/api/arquivos/fichas/${fichaTio.usuario_id}`, {
      headers: { Authorization: `Bearer ${loginAdmin.token}` },
    });
    verificar('PDF do tio servido via /api/arquivos (application/pdf)',
      pdf.status === 200 && (pdf.headers.get('content-type') || '').includes('pdf'), String(pdf.status));

    // 🔒 LGPD: sem token a rota protegida NÃO pode entregar o PDF
    const pdfSemToken = await fetch(`${BASE}/api/arquivos/fichas/${fichaTio.usuario_id}`);
    verificar('PDF do tio bloqueado sem token (401)',
      pdfSemToken.status === 401, String(pdfSemToken.status));

    // 🔒 LGPD: a antiga rota estática /uploads/* não pode mais existir
    const pdfEstatico = await fetch(`${BASE}/uploads/fichas_pdf/ficha_usuario_${fichaTio.usuario_id}.pdf`);
    verificar('Rota estatica /uploads/fichas_pdf removida (404)',
      pdfEstatico.status === 404, String(pdfEstatico.status));
  } else {
    verificar('PDF do tio servido', false, 'ficha nao encontrada');
  }

  // ---------- 6. Limpeza dos dados de teste ----------
  const { Ficha, Usuario, sequelize } = require('./src/models');
  const ids = [fichaTio?.usuario_id, fichaJovem?.usuario_id].filter(Boolean);
  await Ficha.destroy({ where: { usuario_id: ids } });
  await Usuario.destroy({ where: { email: Object.values(emails) } });
  const sobras = await Usuario.count({ where: { email: Object.values(emails) } });
  verificar('Limpeza dos usuarios/fichas de teste', sobras === 0, String(sobras));

  await sequelize.close();
  console.log('');
  console.log(`========== RESULTADO: ${ok} OK / ${falha} FALHAS ==========`);
  process.exit(falha > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Erro fatal no teste:', e);
  process.exit(1);
});
