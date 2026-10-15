// ============================================================
// 📝 Segue-me V2 — Ficha de Equipe de Trabalho (jovem/primo | tio)
// Lê o perfil do usuário logado (api.js: prioriza o role da
// resposta do login; fallback decodifica o payload do JWT) e
// renderiza condicionalmente: título dinâmico + bloco
// "Dados do Cônjuge e Família" exibido SOMENTE para tio.
// Envio: POST /api/fichas (backend gera o PDF em silêncio — RN04).
// ============================================================

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------
// Guarda de sessão/perfil (visual — o backend reforça de verdade)
// ------------------------------------------------------------
(function guardar() {
  if (!getToken()) {
    window.location.replace('/index.html');
    return;
  }
  if (getRole() === 'admin') {
    // Admin não preenche ficha — vai direto ao painel
    window.location.replace('/admin.html');
    return;
  }
  const usuario = getUsuarioSalvo();
  if (usuario?.email) $('usuario-email').textContent = usuario.email;
})();

// ------------------------------------------------------------
// 1. LEITURA DE PERFIL + 2. RENDERIZAÇÃO CONDICIONAL
//    'jovem' -> título "…- Primo"; bloco do cônjuge fica hidden
//    'tio'   -> título "…- Tio";   bloco do cônjuge é exibido
// ------------------------------------------------------------
function aplicarPerfil() {
  const isTio = getRole() === 'tio';

  // Bloco de casados: no HTML ele já nasce com class="hidden";
  // aqui removemos o hidden APENAS para tio (jovem mantém oculto).
  const bloco = $('bloco-conjuge');
  if (bloco) bloco.classList.toggle('hidden', !isTio);

  // Título dinâmico (aba do navegador + cabeçalho da página)
  const titulo = `Ficha de Equipe de Trabalho - ${isTio ? 'Tio' : 'Primo'}`;
  document.title = titulo;
  const h2 = $('titulo-ficha');
  if (h2) h2.textContent = titulo;
  const sub = $('header-sub');
  if (sub) sub.textContent = titulo;

  const desc = $('subtitulo-ficha');
  if (desc) {
    desc.innerHTML = isTio
      ? 'Ficha para a equipe de trabalho. Como <strong>tio(a)</strong>, preencha também o bloco destacado do cônjuge e família. Já enviou antes? Pode reenviar — a ficha será <strong>atualizada</strong>.'
      : 'Ficha para a equipe de trabalho (<strong>primos</strong>). Preencha com atenção. Já enviou antes? Pode reenviar — a ficha será <strong>atualizada</strong>. O bloco do cônjuge é exclusivo para tio(a)s.';
  }
}

aplicarPerfil();

// ------------------------------------------------------------
// Idade (exibição automática) — calculada a partir de
// data_nascimento. NÃO é coluna do model Ficha: é apenas leitura
// na tela e NÃO é enviada no POST.
// ------------------------------------------------------------
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

function atualizarIdade() {
  const idade = calcularIdade($('data_nascimento').value);
  $('idade-valor').textContent = idade === null ? '—' : `${idade} anos`;
}

$('data_nascimento').addEventListener('input', atualizarIdade);

// ------------------------------------------------------------
// Campos condicionais: exibir sub-perguntas quando a resposta é "Sim"
// ------------------------------------------------------------
const CONDICIONAIS = {
  serviu_lideranca: ['row-lideranca_igreja'],
  participou_ed: ['row-cargo_pasta_ed'],
  possui_instrumento: ['row-toca_instrumento'],
  tem_alergias: ['row-alergias_restricoes'],
  tem_filhos: ['row-qtd_filhos'],
};

function atualizarCondicionais() {
  for (const [nome, ids] of Object.entries(CONDICIONAIS)) {
    const marcado = document.querySelector(`input[name="${nome}"]:checked`);
    const sim = marcado?.value === 'true';
    ids.forEach((id) => $(id).classList.toggle('hidden', !sim));
  }
}

Object.keys(CONDICIONAIS).forEach((nome) => {
  document.querySelectorAll(`input[name="${nome}"]`).forEach((radio) => {
    radio.addEventListener('change', atualizarCondicionais);
  });
});

// ------------------------------------------------------------
// Leitura dos campos
// ------------------------------------------------------------
function texto(id) {
  const v = $(id).value.trim();
  return v === '' ? null : v;
}

/** Lê o par Sim/Não: true | false | null (não respondido). */
function simNao(nome) {
  const marcado = document.querySelector(`input[name="${nome}"]:checked`);
  return marcado ? marcado.value === 'true' : null;
}

function montarFicha() {
  return {
    // 1. Dados pessoais (todos)
    nome: texto('nome'),
    data_nascimento: texto('data_nascimento'),
    telefone: texto('telefone'),
    endereco: texto('endereco'),
    contato_emergencia: texto('contato_emergencia'),
    tamanho_camiseta: texto('tamanho_camiseta'),

    // 2. Trajetória no Segue-me (todos)
    ano_encontro: texto('ano_encontro'),
    paroquia_encontro: texto('paroquia_encontro'),
    segues_trabalhados: texto('segues_trabalhados'),
    equipes_trabalhadas: texto('equipes_trabalhadas'),
    ultima_equipe_servida: texto('ultima_equipe_servida'),
    ano_que_fez_segueme: texto('ano_que_fez_segueme'),
    equipe_que_trabalhou: texto('equipe_que_trabalhou'),

    // 2.1 Sacramentos recebidos (todos) — coluna JSON no model
    sacramentos: [...document.querySelectorAll('input[name="sacramento"]:checked')].map((c) => c.value),

    // 3. Liderança & serviço (todos)
    serviu_lideranca: simNao('serviu_lideranca'),
    lideranca_igreja: texto('lideranca_igreja'),
    vontade_lideranca: texto('vontade_lideranca'),

    // 3.1 Pastoral — Equipe de Dirigentes (ED) (todos)
    participou_ed: simNao('participou_ed'),
    cargo_pasta_ed: texto('cargo_pasta_ed'),

    // 4. Música & talento (todos)
    possui_instrumento: simNao('possui_instrumento'),
    toca_instrumento: texto('toca_instrumento'),
    canta: simNao('canta'),
    quer_dar_palestra: simNao('quer_dar_palestra'),

    // 5. Saúde (todos)
    tem_alergias: simNao('tem_alergias'),
    alergias_restricoes: texto('alergias_restricoes'),

    // 6. Cônjuge & família (bloco do TIO — para jovem o bloco está
    //    hidden e os campos vazios chegam como null no JSON)
    nome_conjuge: texto('nome_conjuge'),
    idade_conjuge: texto('idade_conjuge'),
    telefone_conjuge: texto('telefone_conjuge'),
    origem_movimento: texto('origem_movimento'),
    tem_filhos: simNao('tem_filhos'),
    qtd_filhos: texto('qtd_filhos'),
    meio_transporte: texto('meio_transporte'),
  };
}

// ------------------------------------------------------------
// 📸 FOTO 3x4 — preview local + envio para /api/fichas/foto
// Fluxo em 2 etapas (por isso o upload é separado do POST da ficha):
//   1. POST /api/fichas/foto  (multipart) -> devolve o nome do arquivo
//   2. POST /api/fichas       (JSON)      -> recebe `foto_3x4` e gera o PDF
// Manter o passo 2 em JSON evita breaking change no contrato já
// usado pelo app e pelos testes.
// ------------------------------------------------------------
const TIPOS_ACEITOS = ['image/jpeg', 'image/png'];
const TAMANHO_MAX_FOTO = 5 * 1024 * 1024; // 5 MB (mesmo limite do backend)

/**
 * Foto já enviada ao servidor na tentativa atual.
 * Evita reenviar a MESMA imagem a cada retentativa: se o POST da
 * ficha falhar depois do upload, o retry reaproveita o arquivo já
 * gravado em disco (senão cada tentativa órfã um novo upload).
 * @type {{ arquivo: File, nome: string }|null}
 */
let fotoJaEnviada = null;

function mostrarStatusFoto(texto, tipo = 'erro') {
  const el = $('foto-status');
  if (!el) return;
  el.textContent = texto;
  el.classList.remove('hidden');
  el.className = `text-xs mt-2 ${tipo === 'erro' ? 'text-red-600' : 'text-emerald-600'}`;
}

function limparStatusFoto() {
  const el = $('foto-status');
  if (el) el.classList.add('hidden');
}

function validarFoto(arquivo) {
  if (!arquivo) return null;
  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    return 'Formato inválido. Envie apenas imagens JPEG ou PNG.';
  }
  if (arquivo.size > TAMANHO_MAX_FOTO) {
    return 'Arquivo muito grande. O tamanho máximo é 5 MB.';
  }
  return null;
}

$('foto').addEventListener('change', (evento) => {
  const arquivo = evento.target.files[0];
  limparStatusFoto();

  const erro = validarFoto(arquivo);
  if (erro) {
    fotoJaEnviada = null;
    evento.target.value = ''; // permite reescolher o mesmo arquivo
    mostrarStatusFoto(erro);
    $('foto-preview').classList.add('hidden');
    $('foto-preview-vazio').classList.remove('hidden');
    return;
  }

  if (!arquivo) return;

  // Pré-visualização local (object URL, liberada no próximo envio)
  const img = $('foto-preview');
  const url = URL.createObjectURL(arquivo);
  img.src = url;
  img.onload = () => URL.revokeObjectURL(url);
  img.classList.remove('hidden');
  $('foto-preview-vazio').classList.add('hidden');
  mostrarStatusFoto('Foto selecionada. Ela será enviada ao salvar a ficha.', 'ok');
});

/**
 * Envia a foto escolhida para /api/fichas/foto e devolve o nome
 * do arquivo no servidor (ou null se não houver foto nova).
 * @returns {Promise<string|null>}
 */
async function enviarFoto(arquivo) {
  if (!arquivo) return null;

  const dados = new FormData();
  dados.append('foto', arquivo);

  // ⚠️ NÃO definir Content-Type manualmente: o navegador gera o
  // boundary do multipart. apiFetch só injeta JSON quando há body
  // e o header não existe — com FormData, nenhum dos dois ocorre.
  const resposta = await apiFetch('/api/fichas/foto', { method: 'POST', body: dados });
  const corpo = await resposta.json().catch(() => ({}));

  if (resposta.status === 401 || resposta.status === 403) {
    tratarFalhaSessao();
    throw new Error('sessão inválida');
  }
  if (!resposta.ok) {
    throw new Error(corpo.erro || 'Não foi possível enviar a foto.');
  }
  return corpo.foto_3x4 || null;
}

// ------------------------------------------------------------
// Envio — POST /api/fichas (JWT injetado pelo api.js)
// ------------------------------------------------------------
$('form-ficha').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const erro = $('form-erro');
  erro.classList.add('hidden');

  // Validação mínima no cliente (o nome é essencial para a coordenação)
  if (!texto('nome')) {
    erro.textContent = 'Preencha pelo menos o seu nome completo.';
    erro.classList.remove('hidden');
    $('nome').focus();
    return;
  }

  // Valida a foto ANTES de desabilitar o botão (falha rápida, sem upload)
  const arquivoFoto = $('foto').files[0];
  const erroFoto = validarFoto(arquivoFoto);
  if (erroFoto) {
    mostrarStatusFoto(erroFoto);
    $('foto').focus();
    return;
  }

  const botao = $('btn-salvar');
  botao.disabled = true;
  botao.textContent = 'Salvando…';

  try {
    // Passo 1: foto (só quando há arquivo novo escolhido).
    // Reaproveita o upload anterior se for a mesma imagem.
    let nomeFoto = null;
    if (arquivoFoto) {
      if (fotoJaEnviada && fotoJaEnviada.arquivo === arquivoFoto) {
        nomeFoto = fotoJaEnviada.nome;
      } else {
        botao.textContent = 'Enviando foto…';
        nomeFoto = await enviarFoto(arquivoFoto);
        if (nomeFoto) fotoJaEnviada = { arquivo: arquivoFoto, nome: nomeFoto };
      }
    }

    // Passo 2: ficha. `foto_3x4` ausente = mantém a foto já gravada
    // (reenvio da ficha sem escolher uma nova imagem).
    const payload = montarFicha();
    if (nomeFoto) payload.foto_3x4 = nomeFoto;

    const resposta = await apiPost('/api/fichas', payload);
    const dados = await resposta.json().catch(() => ({}));

    if (resposta.status === 401 || resposta.status === 403) {
      tratarFalhaSessao();
      return;
    }
    if (!resposta.ok) {
      erro.textContent = dados.erro || 'Não foi possível salvar a ficha. Tente novamente.';
      erro.classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // ✅ Sucesso (201 criada / 200 atualizada): modal verde.
    // O PDF já foi gerado no backend, silenciosamente (RN04).
    $('modal-sucesso').classList.remove('hidden');
  } catch (e) {
    const mensagem =
      e?.message && e.message !== 'sessão inválida'
        ? e.message
        : 'Erro de conexão com o servidor. Verifique sua internet e tente novamente.';
    erro.textContent = mensagem;
    erro.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar ficha';
  }
});

// ------------------------------------------------------------
// Modal e sessão
// ------------------------------------------------------------
$('btn-modal-fechar').addEventListener('click', () => {
  // Fecha o modal mantendo os dados: o usuário pode revisar a ficha
  // ou simplesmente fechar a página, como sugere a mensagem.
  $('modal-sucesso').classList.add('hidden');
});

$('btn-sair').addEventListener('click', () => {
  limparSessao();
  window.location.replace('/index.html');
});
