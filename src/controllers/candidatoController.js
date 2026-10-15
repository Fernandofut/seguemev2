// ============================================================
// 🧑‍🎓 Segue-me V2 — Controller de Candidatos (Inscrição pública)
// registrarCandidato: recebe os dados de texto (multipart/form-
// data) + os arquivos (req.files['foto'] / req.files['assinatura'])
// processados pelo uploadMiddleware, e persiste no model Candidato.
// ⚠️ Rota pública: candidatos novos NÃO têm login (sem JWT).
// ============================================================

const fs = require('fs');
const path = require('path');
const { Candidato } = require('../models');
const { descreverErro } = require('../utils/logSeguro');

// Campos de TEXTO do formulário (multipart chega como string)
const CAMPOS_TEXTO = [
  'email',
  'data_nascimento',
  'naturalidade',
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

/** Normaliza um campo de texto: trim; string vazia -> null. */
function textoOuNull(valor) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

/** Sacramentos: aceita array (múltiplos valores do FormData) ou string única. */
function parseSacramentos(valor) {
  const lista = Array.isArray(valor) ? valor : [valor];
  const limpos = lista
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
    .map((v) => String(v).trim());
  return limpos.length ? limpos : [];
}

/**
 * Monta o caminho PÚBLICO-RELATIVO do arquivo gravado pelo multer.
 * ⚠️ LGPD: o valor gravado no banco é apenas um identificador de
 * arquivo — a entrega só acontece pela rota autenticada
 * GET /api/arquivos/candidatos/:arquivo (verificarToken + isAdmin).
 * As pastas de uploads NÃO são mais servidas via express.static.
 */
function urlImagem(arquivo) {
  if (!arquivo) return null;
  return `/uploads/candidatos_img/${arquivo.filename}`;
}

/** Remove arquivos órfãos em caso de falha após o upload. */
function removerArquivosOrfaos(req) {
  const arquivos = [...(req.files?.foto || []), ...(req.files?.assinatura || [])];
  for (const arquivo of arquivos) {
    try {
      fs.unlinkSync(arquivo.path);
    } catch {
      // Loga apenas o nome do arquivo (nunca o caminho absoluto do disco)
      console.warn(`⚠️ [CANDIDATO] Não foi possível remover arquivo órfão: ${path.basename(arquivo.path)}`);
    }
  }
}

// ------------------------------------------------------------
// POST /api/candidatos  (PÚBLICA — sem verificarToken)
// multipart/form-data:
//   textos       -> req.body   (parseados pelo multer)
//   foto         -> req.files['foto'][0]
//   assinatura   -> req.files['assinatura'][0]
// ------------------------------------------------------------
async function registrarCandidato(req, res) {
  try {
    // Validação mínima no servidor (o formulário já exige no cliente)
    const nome = textoOuNull(req.body.nome);
    const telefone = textoOuNull(req.body.telefone);
    if (!nome || !telefone) {
      removerArquivosOrfaos(req);
      return res.status(400).json({ erro: 'Nome e telefone são obrigatórios.' });
    }

    const dados = { nome, telefone };
    for (const campo of CAMPOS_TEXTO) {
      dados[campo] = textoOuNull(req.body[campo]);
    }
    dados.sacramentos = parseSacramentos(req.body.sacramentos);

    // Caminhos públicos das imagens gravadas pelo uploadMiddleware
    dados.foto_url = urlImagem(req.files?.foto?.[0]);
    dados.assinatura_url = urlImagem(req.files?.assinatura?.[0]);

    const candidato = await Candidato.create(dados);

    return res.status(201).json({
      mensagem: 'Inscrição registrada com sucesso! A coordenação entrará em contato.',
      candidato,
    });
  } catch (error) {
    // ⚠️ Falha de validação (ex.: e-mail inválido) -> 400 legível
    if (error.name === 'SequelizeValidationError' || error.name === 'ValidationError') {
      removerArquivosOrfaos(req);
      return res.status(400).json({
        erro: error.errors.map((e) => e.message).join(' '),
      });
    }
    removerArquivosOrfaos(req);
    console.error('❌ [CANDIDATO] Erro ao registrar inscrição:', descreverErro(error));
    return res.status(500).json({ erro: 'Erro interno ao registrar a inscrição.' });
  }
}

// ------------------------------------------------------------
// GET /api/candidatos  (verificarToken + isAdmin — auditoria QA)
// Lista TODAS as inscrições de candidatos para a coordenação,
// incluindo foto_url / assinatura_url (servidas estaticamente).
// ------------------------------------------------------------
async function listarCandidatos(req, res) {
  try {
    const candidatos = await Candidato.findAll({ order: [['id', 'ASC']] });
    return res.json({ total: candidatos.length, candidatos });
  } catch (error) {
    console.error('❌ [CANDIDATO] Erro ao listar candidatos:', descreverErro(error));
    return res.status(500).json({ erro: 'Erro interno ao listar os candidatos.' });
  }
}

module.exports = { registrarCandidato, listarCandidatos };
