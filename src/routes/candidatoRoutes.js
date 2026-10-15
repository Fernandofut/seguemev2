// ============================================================
// 🛣️ Segue-me V2 — Rotas de Candidatos (Inscrição pública)
// POST /api/candidatos -> registrarCandidato
//   multipart/form-data com campos de arquivo:
//   foto (1) e assinatura (1) — via uploadMiddleware (multer)
// ⚠️ Rota PÚBLICA (sem verificarToken): candidatos novos não
// têm login — a inscrição é o primeiro contato com o sistema.
// ============================================================

const express = require('express');
const {
  camposInscricao,
  TAMANHO_MAX_ARQUIVO,
  apagarArquivosDoRequest,
  validarImagens,
} = require('../middlewares/uploadMiddleware');
const { verificarToken, isAdmin } = require('../middlewares/authMiddleware');
const candidatoController = require('../controllers/candidatoController');
const { descreverErro } = require('../utils/logSeguro');

const router = express.Router();

// POST público (candidatos novos não têm login)
router.post('/', camposInscricao, validarImagens, candidatoController.registrarCandidato);

// 🛡️ Listagem administrativa: somente a coordenação (admin) vê os candidatos
router.get('/', verificarToken, isAdmin, candidatoController.listarCandidatos);

// ------------------------------------------------------------
// 🛡️ Handler de ERROS do multer/validação de arquivos —
// devolve JSON amigável (em vez do HTML de erro padrão do Express)
// ------------------------------------------------------------
router.use((erro, req, res, next) => {
  // 🧹 Limpa arquivos parcialmente gravados antes de responder o erro.
  apagarArquivosDoRequest(req);
  console.error('❌ [CANDIDATO] Erro no upload/formulário:', descreverErro(erro));

  // Mensagens traduzidas para os erros nativos do multer
  const MENSAGENS_MULTER = {
    LIMIT_FILE_SIZE: `Arquivo muito grande. Tamanho máximo: ${Math.round(TAMANHO_MAX_ARQUIVO / (1024 * 1024))} MB por imagem.`,
    LIMIT_UNEXPECTED_FILE: 'Campo de arquivo inesperado no formulário.',
    LIMIT_FILE_COUNT: 'Envie apenas uma foto e uma assinatura.',
  };

  return res.status(400).json({
    erro: MENSAGENS_MULTER[erro.code] || erro.message || 'Falha ao processar o formulário de inscrição.',
  });
});

module.exports = router;
