// ============================================================
// 🛡️ Segue-me V2 — Painel da Coordenação (Etapa 6 / Etapa 5)
// Carrega GET /api/fichas (verificarToken + isAdmin no backend),
// renderiza a tabela (Nome, Telefone, Idade, Papel, Baixar PDF)
// e redireciona ao login qualquer usuário que não seja admin.
//
// 🔒 LGPD: PDFs das fichas, fotos 3x4 e assinaturas saem por
// GET /api/arquivos (autenticado). Não são mais <a href> para
// /uploads/* (rota removida do express.static) — são botões que
// chamam downloadArquivo(), que injeta o JWT no header
// Authorization e entrega o arquivo como Blob.
// ============================================================

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------
// Guarda de acesso: exige token E perfil admin (visual — o
// backend reforça com verificarToken + isAdmin em toda chamada)
// ------------------------------------------------------------
(function guardar() {
  if (!getToken() || getRole() !== 'admin') {
    tratarFalhaSessao(); // limpa a sessão e volta ao login
    return;
  }
  const usuario = getUsuarioSalvo();
  if (usuario?.email) $('admin-email').textContent = usuario.email;
})();

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
/** Idade calculada a partir de data_nascimento (AAAA-MM-DD). */
function calcularIdade(data) {
  if (!data) return null;
  const nascimento = new Date(`${data}T00:00:00`);
  if (Number.isNaN(nascimento.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const mes = hoje.getMonth() - nascimento.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : null;
}

function badgePapel(role) {
  const estilos = {
    jovem: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
    tio: 'bg-amber-100 text-amber-700 ring-amber-200',
    admin: 'bg-violet-100 text-violet-700 ring-violet-200',
  };
  const classe = estilos[role] || 'bg-slate-100 text-slate-600 ring-slate-200';
  const rotulo = role === 'tio' ? 'Tio(a)' : (role || '—');
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${classe}">${esc(rotulo)}</span>`;
}

// ------------------------------------------------------------
// 🔒 Entrega autenticada de arquivos protegidos (LGPD)
// ------------------------------------------------------------
// Os arquivos de PII (fichas, fotos 3x4, assinaturas) saem por
// GET /api/arquivos com header `Authorization: Bearer <token>`.
// O fluxo abaixo: fetch -> Blob -> URL.createObjectURL -> nova
// aba (ou download). O token NUNCA vai para a query string nem
// para a barra de endereços, e o arquivo não fica exposto por
// uma URL estática adivinhável.
// ------------------------------------------------------------
const URLs_TEMPORARIAS = new Set();

/** Extrai o nome do arquivo do Content-Disposition (RFC 5987 / 6266). */
function nomeDoArquivo(contentDisposition, padrao) {
  if (!contentDisposition) return padrao;
  const comCodificacao = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(contentDisposition);
  if (comCodificacao) {
    try {
      return decodeURIComponent(comCodificacao[1].trim());
    } catch {
      /* cai no formato simples abaixo */
    }
  }
  const simples = /filename\s*=\s*"?([^";]+)"?/i.exec(contentDisposition);
  return simples ? simples[1].trim() : padrao;
}

function liberarUrlsTemporarias() {
  for (const url of URLs_TEMPORARIAS) URL.revokeObjectURL(url);
  URLs_TEMPORARIAS.clear();
}
window.addEventListener('beforeunload', liberarUrlsTemporarias);

/**
 * Busca um arquivo protegido e o abre em nova aba (padrão) ou força
 * o download. `alvo` é o parágrafo de erro onde failures aparecem.
 *
 * @param {string} url        rota autenticada (ex.: /api/arquivos/fichas/12)
 * @param {object} [opcoes]   { rotulo, modo: 'abrir'|'baixar', alvo }
 */
async function downloadArquivo(url, opcoes = {}) {
  const { rotulo = 'arquivo', modo = 'abrir', alvo } = opcoes;

  // Abre a aba ANTES de qualquer await: depois do fetch, o navegador
  // já não considera a ação parte do gesto do usuário e o
  // bloqueador de pop-ups descartaria o window.open().
  let aba = null;
  if (modo === 'abrir') {
    aba = window.open('', '_blank');
    if (aba) {
      aba.document.title = 'Carregando…';
      aba.document.body.innerHTML =
        '<p style="font:14px system-ui;padding:24px;color:#475569">Carregando arquivo protegido…</p>';
    }
  }

  try {
    const resposta = await apiFetch(url);

    if (resposta.status === 401 || resposta.status === 403) {
      if (aba) aba.close();
      tratarFalhaSessao();
      return;
    }
    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const blob = await resposta.blob();
    const objectUrl = URL.createObjectURL(blob);
    URLs_TEMPORARIAS.add(objectUrl);

    if (modo === 'abrir' && aba) {
      // Abre o PDF/imagem na aba já aberta (blob: liberado na CSP)
      aba.location.href = objectUrl;
      return;
    }

    // Download forçado (ou fallback quando o pop-up foi bloqueado)
    const nome = nomeDoArquivo(resposta.headers.get('Content-Disposition'), rotulo);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    if (aba) aba.close();
    if (alvo) {
      alvo.textContent = `Não foi possível carregar "${rotulo}". Verifique sua sessão e tente novamente.`;
      alvo.classList.remove('hidden');
    }
  }
}

// Constrói a rota autenticada a partir do valor gravado no banco
// (aceita tanto o caminho legado "/uploads/candidatos_img/arquivo.png"
// quanto o nome puro) — o basename evita barras duplicadas.
function rotaArquivoCandidato(valor) {
  if (!valor) return null;
  const nome = String(valor).split('/').filter(Boolean).pop();
  return nome ? `/api/arquivos/candidatos/${encodeURIComponent(nome)}` : null;
}

// Delegação de eventos: os botões são recriados a cada renderização,
// então o listener fica no <tbody> (uma única vez) em vez de por linha.
function acionarArquivo(botao) {
  const url = botao.dataset.arquivo;
  if (!url) return;
  downloadArquivo(url, {
    rotulo: botao.dataset.rotulo || 'arquivo',
    modo: botao.dataset.modo || 'abrir',
    alvo: botao.closest('body').querySelector(botao.dataset.erro || '#lista-erro'),
  });
}

// ------------------------------------------------------------
// Estado local
// ------------------------------------------------------------
let fichasCache = [];

function linhaFicha(ficha) {
  const idade = calcularIdade(ficha.data_nascimento);
  // 🔒 Rota autenticada: o id do usuário é o único dado enviado —
  // o nome do PDF é derivado no servidor (impede path traversal).
  const rota = `/api/arquivos/fichas/${encodeURIComponent(ficha.usuario_id)}`;

  return (
    '<tr class="hover:bg-slate-50 transition">' +
    `<td class="px-5 py-3 font-medium text-slate-800">${ouTraco(ficha.nome)}</td>` +
    `<td class="px-5 py-3 whitespace-nowrap">${ouTraco(ficha.telefone)}</td>` +
    `<td class="px-5 py-3">${idade ?? '—'}</td>` +
    `<td class="px-5 py-3">${badgePapel(ficha.usuario?.role)}</td>` +
    `<td class="px-5 py-3 text-slate-500">${ouTraco(ficha.usuario?.email)}</td>` +
    '<td class="px-5 py-3 text-right">' +
    `<button type="button" data-arquivo="${esc(rota)}" data-rotulo="PDF da ficha" data-erro="#lista-erro"` +
    ' class="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">' +
    '📄 Baixar PDF</button>' +
    '</td>' +
    '</tr>'
  );
}

function renderizar(fichas) {
  const tbody = $('fichas-tbody');

  // Cards de resumo (sempre com o total geral, mesmo filtrando)
  $('stat-total').textContent = String(fichasCache.length);
  $('stat-jovens').textContent = String(fichasCache.filter((f) => f.usuario?.role === 'jovem').length);
  $('stat-tios').textContent = String(fichasCache.filter((f) => f.usuario?.role === 'tio').length);

  if (fichas.length === 0) {
    tbody.innerHTML = '';
    $('lista-vazio').classList.remove('hidden');
    return;
  }
  $('lista-vazio').classList.add('hidden');
  tbody.innerHTML = fichas.map(linhaFicha).join('');
}

// ------------------------------------------------------------
// Carregamento — GET /api/fichas (somente admin no backend)
// ------------------------------------------------------------
async function carregarFichas() {
  const erro = $('lista-erro');
  erro.classList.add('hidden');
  $('lista-vazio').classList.add('hidden');
  $('fichas-tbody').innerHTML =
    '<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">Carregando fichas…</td></tr>';

  try {
    const resposta = await apiGet('/api/fichas');

    // 401 (sessão inválida/expirada) ou 403 (não é admin) → login
    if (resposta.status === 401 || resposta.status === 403) {
      tratarFalhaSessao();
      return;
    }
    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const dados = await resposta.json();
    fichasCache = dados.fichas || [];
    aplicarBusca();
  } catch {
    erro.textContent = 'Não foi possível carregar as fichas. Tente novamente.';
    erro.classList.remove('hidden');
    $('fichas-tbody').innerHTML = '';
  }
}

// ------------------------------------------------------------
// Busca client-side (nome ou e-mail, sem acento/caixa)
// ------------------------------------------------------------
function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function aplicarBusca() {
  const termo = normalizar($('busca').value.trim());
  if (!termo) {
    renderizar(fichasCache);
    return;
  }
  renderizar(
    fichasCache.filter((f) => normalizar(f.nome).includes(termo) || normalizar(f.usuario?.email).includes(termo))
  );
}

// ------------------------------------------------------------
// Eventos
// ------------------------------------------------------------
$('busca').addEventListener('input', aplicarBusca);
$('btn-atualizar').addEventListener('click', carregarFichas);
$('btn-sair').addEventListener('click', () => {
  limparSessao();
  window.location.replace('/index.html');
});

// ------------------------------------------------------------
// Inscrições de Candidatos (auditoria QA)
// 🔒 Botões "Foto"/"Assinatura" chamam downloadArquivo(): o
// arquivo é buscado em /api/arquivos/candidatos/:arquivo com o
// header Authorization (verificarToken + isAdmin no backend).
// Não há mais <a href> para /uploads/candidatos_img — a rota
// estática foi removida do servidor (vazamento de PII / LGPD).
// O nome do arquivo gravado no banco é normalizado por basename.
// ------------------------------------------------------------
let candidatosCache = [];

function linhaCandidato(candidato) {
  const rotaFoto = rotaArquivoCandidato(candidato.foto_url);
  const rotaAssinatura = rotaArquivoCandidato(candidato.assinatura_url);

  const botaoFoto = rotaFoto
    ? `<button type="button" data-arquivo="${esc(rotaFoto)}" data-rotulo="foto 3x4" data-erro="#lista-erro-candidatos"`
      + ' class="inline-flex items-center gap-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">🖼️ Foto</button>'
    : '<span class="text-xs text-slate-400">sem foto</span>';

  const botaoAssinatura = rotaAssinatura
    ? `<button type="button" data-arquivo="${esc(rotaAssinatura)}" data-rotulo="assinatura" data-erro="#lista-erro-candidatos"`
      + ' class="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">✍️ Assinatura</button>'
    : '<span class="text-xs text-slate-400">sem assinatura</span>';

  return (
    '<tr class="hover:bg-slate-50 transition">'
    + `<td class="px-5 py-3 font-medium text-slate-800">${ouTraco(candidato.nome)}</td>`
    + `<td class="px-5 py-3 whitespace-nowrap">${ouTraco(candidato.telefone)}</td>`
    + `<td class="px-5 py-3 text-slate-500">${ouTraco(candidato.email)}</td>`
    + `<td class="px-5 py-3">${ouTraco(candidato.igreja_frequenta)}</td>`
    + `<td class="px-5 py-3">${botaoFoto}</td>`
    + `<td class="px-5 py-3">${botaoAssinatura}</td>`
    + '</tr>'
  );
}

function renderizarCandidatos(lista) {
  $('stat-candidatos').textContent = String(candidatosCache.length);
  $('stat-candidatos-completos').textContent = String(
    candidatosCache.filter((c) => c.foto_url && c.assinatura_url).length
  );

  const tbody = $('candidatos-tbody');
  if (lista.length === 0) {
    tbody.innerHTML = '';
    $('lista-vazio-candidatos').classList.remove('hidden');
    return;
  }
  $('lista-vazio-candidatos').classList.add('hidden');
  tbody.innerHTML = lista.map(linhaCandidato).join('');
}

function aplicarBuscaCandidatos() {
  const termo = normalizar($('busca-candidatos').value.trim());
  if (!termo) {
    renderizarCandidatos(candidatosCache);
    return;
  }
  renderizarCandidatos(
    candidatosCache.filter(
      (c) => normalizar(c.nome).includes(termo) || normalizar(c.email).includes(termo)
    )
  );
}

async function carregarCandidatos() {
  const erro = $('lista-erro-candidatos');
  erro.classList.add('hidden');
  $('lista-vazio-candidatos').classList.add('hidden');
  $('candidatos-tbody').innerHTML =
    '<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">Carregando candidatos…</td></tr>';

  try {
    const resposta = await apiGet('/api/candidatos');

    // 401 (sessão inválida/expirada) ou 403 (não é admin) → login
    if (resposta.status === 401 || resposta.status === 403) {
      tratarFalhaSessao();
      return;
    }
    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const dados = await resposta.json();
    candidatosCache = dados.candidatos || [];
    aplicarBuscaCandidatos();
  } catch {
    erro.textContent = 'Não foi possível carregar as inscrições de candidatos. Tente novamente.';
    erro.classList.remove('hidden');
    $('candidatos-tbody').innerHTML = '';
  }
}

$('busca-candidatos').addEventListener('input', aplicarBuscaCandidatos);
$('btn-atualizar-candidatos').addEventListener('click', carregarCandidatos);

// ------------------------------------------------------------
// 🔒 Clique nos botões de arquivo (delegação nos <tbody>):
// as linhas são recriadas a cada renderização, então o listener
// fica nos containers estáticos, não em cada botão.
// ------------------------------------------------------------
for (const idTbody of ['fichas-tbody', 'candidatos-tbody']) {
  $(idTbody).addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-arquivo]');
    if (botao) acionarArquivo(botao);
  });
}

carregarFichas();
carregarCandidatos();