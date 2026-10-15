// ============================================================
// 🛣️ Segue-me V2 — Rotas de Fichas (RF02 / RF03 — Etapas 5 e 6)
// POST /api/fichas/anexos -> receberAnexosFicha (verificarToken + multer:
//                           foto 3x4 e/ou assinatura)
// POST /api/fichas        -> salvarFicha       (verificarToken: jovem | tio | admin)
// GET  /api/fichas        -> listarTodasFichas (verificarToken + isAdmin)
// ============================================================

const express = require('express');
const { verificarToken, isAdmin } = require('../middlewares/authMiddleware');
const {
  anexosFicha,
  TAMANHO_MAX_ARQUIVO,
  apagarArquivosDoRequest,
  validarImagens,
} = require('../middlewares/uploadMiddleware');
const { descreverErro } = require('../utils/logSeguro');
const fichaController = require('../controllers/fichaController');

const router = express.Router();

// 📎 Anexos em multipart/form-data: campos "foto" e "assinatura"
// (1 arquivo cada, opcionalmente nenhum — o multer só exige o que vier).
// ⚠️ Registrar ANTES de POST '/' para que '/foto' e '/anexos' não sejam
// interpretados como corpo de ficha pelo roteamento.
// ⚠️ '/foto' é o endpoint usado pelo formulário (formulario.js) e pelos
// testes; '/anexos' é o alias semântico (foto + assinatura). Ambos apontam
// para o mesmo controller para não quebrar nenhum cliente.
router.post('/foto', verificarToken, anexosFicha, validarImagens, fichaController.receberAnexosFicha);
router.post('/anexos', verificarToken, anexosFicha, validarImagens, fichaController.receberAnexosFicha);

router.post('/', verificarToken, fichaController.salvarFicha);

// ⚠️ Ordem importa: verificarToken primeiro (injeta req.usuario_role),
// depois isAdmin (consome req.usuario_role).
// 🛡️ Listagem administrativa: somente a coordenação (admin) vê todas as
// fichas — listarTodasFichas é alias semântico de listarFichas no controller.
// Alias de compatibilidade — mesma listagem administrativa
router.get('/', verificarToken, isAdmin, fichaController.listarTodasFichas);

// ------------------------------------------------------------
// 🛡️ Handler de ERROS do multer (upload da foto 3x4) —
// devolve JSON amigável em vez do HTML de erro padrão do Express.
// Só é acionado na montagem do multipart de POST /ficha/foto;
// o POST /api/fichas (JSON) trata os erros no próprio controller.
// ------------------------------------------------------------
router.use((erro, req, res, next) => {
  // 🧹 Se o multer rejeitou um campo depois de já gravar outro, os
  // arquivos parciais ficariam órfãos no disco — removemos todos.
  apagarArquivosDoRequest(req);
  console.error('❌ [FICHA] Erro no upload da foto:', descreverErro(erro));

  const MENSAGENS_MULTER = {
    LIMIT_FILE_SIZE: `Arquivo muito grande. Tamanho máximo: ${Math.round(
      TAMANHO_MAX_ARQUIVO / (1024 * 1024)
    )} MB por imagem.`,
    LIMIT_UNEXPECTED_FILE: 'Campo de arquivo inesperado no formulário.',
    LIMIT_FILE_COUNT: 'Envie apenas uma foto.',
  };

  return res.status(400).json({
    erro: MENSAGENS_MULTER[erro.code] || erro.message || 'Falha ao processar o envio da foto.',
  });
});

module.exports = router;
