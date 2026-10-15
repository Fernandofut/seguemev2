// ============================================================
// 🧑‍🎓 Segue-me V2 — Formulário de Inscrição de Candidatos (público)
// Envia os dados + arquivos (foto 3x4 e assinatura) via FormData
// para POST /api/candidatos — multipart/form-data (NÃO é JSON).
// Sem JWT: candidatos novos não têm login.
// ============================================================

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------
// Feedback visual do arquivo escolhido (nome exibido abaixo do input)
// ------------------------------------------------------------
['foto', 'assinatura'].forEach((campo) => {
  $(campo).addEventListener('change', (evento) => {
    const arquivo = evento.target.files[0];
    $(`nome-${campo}`).textContent = arquivo ? arquivo.name : 'Nenhum arquivo selecionado';
  });
});

// ------------------------------------------------------------
// Montagem do FormData
// ------------------------------------------------------------
const CAMPOS_TEXTO = [
  'email',
  'data_nascimento',
  'naturalidade',
  'endereco',
  'nome_pai',
  'nome_mae',
  'escolaridade',
  'situacao',
  'curso',
  'instituicao',
  'religiao',
  'igreja_frequenta',
  'movimento_igreja',
  'convidou_nome',
  'convidou_telefone',
  'convidou_endereco',
  'observacoes',
];

function montarFormData() {
  const fd = new FormData();

  // Dados obrigatórios
  fd.append('nome', $('nome').value.trim());
  fd.append('telefone', $('telefone').value.trim());

  // Campos de texto opcionais (vazios são omitidos)
  CAMPOS_TEXTO.forEach((campo) => {
    const valor = $(campo).value.trim();
    if (valor !== '') fd.append(campo, valor);
  });

  // Sacramentos: cada checkbox marcado vira um valor do array
  document.querySelectorAll('.sacramento:checked').forEach((caixa) => {
    fd.append('sacramentos', caixa.value);
  });

  // ⚠️ Arquivos — obrigatórios nesta ficha
  fd.append('foto', $('foto').files[0]);
  fd.append('assinatura', $('assinatura').files[0]);

  return fd;
}

// ------------------------------------------------------------
// Envio — POST /api/candidatos (multipart/form-data)
// ⚠️ NÃO definir Content-Type manualmente: o navegador gera o
// boundary do multipart automaticamente para o FormData.
// ------------------------------------------------------------
$('form-inscricao').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const erro = $('form-erro');
  erro.classList.add('hidden');

  const nomeFoto = $('foto').files[0];
  const arquivoAssinatura = $('assinatura').files[0];

  if (!nomeFoto || !arquivoAssinatura) {
    erro.textContent = 'Anexe a foto 3x4 e a assinatura para concluir a inscrição.';
    erro.classList.remove('hidden');
    (!nomeFoto ? $('foto') : $('assinatura')).focus();
    return;
  }

  const botao = $('btn-enviar');
  botao.disabled = true;
  botao.textContent = 'Enviando inscrição…';

  try {
    const resposta = await fetch('/api/candidatos', {
      method: 'POST',
      body: montarFormData(),
    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      erro.textContent = dados.erro || 'Não foi possível enviar a inscrição. Tente novamente.';
      erro.classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // ✅ Sucesso: limpa o formulário e mostra o modal verde
    evento.target.reset();
    $('nome-foto').textContent = 'Nenhum arquivo selecionado';
    $('nome-assinatura').textContent = 'Nenhum arquivo selecionado';
    $('modal-sucesso').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    erro.textContent = 'Erro de conexão com o servidor. Verifique sua internet e tente novamente.';
    erro.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    botao.disabled = false;
    botao.textContent = 'Enviar inscrição';
  }
});

// ------------------------------------------------------------
// Modal
// ------------------------------------------------------------
$('btn-modal-fechar').addEventListener('click', () => {
  $('modal-sucesso').classList.add('hidden');
});
