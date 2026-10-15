// ============================================================
// 🔒 Segue-me V2 — Rotas de Arquivos Protegidos (BLOQUEADOR 1 / LGPD)
// GET /api/arquivos/fichas/:usuarioId      -> PDF da ficha
// GET /api/arquivos/fichas-foto/:arquivo   -> foto 3x4 da ficha
// GET /api/arquivos/candidatos/:arquivo    -> foto 3x4 / assinatura
//
// ⚠️ SUBSTITUI o antigo express.static em /uploads/*, que servia
// fichas, fotos 3x4 e assinaturas (dados pessoais sensíveis de
// menores) para QUALQUER visitante, sem autenticação.
//
// Regras de segurança aplicadas aqui:
//   1. verificarToken  — exige JWT válido em todas as rotas;
//   2. isAdmin         — exigido para os arquivos confidenciais
//                        (fotos/assinaturas de candidatos);
//   3. dono do arquivo — um usuário só baixa o PDF da própria ficha
//                        (a coordenação/admin vê todas);
//   4. nome de arquivo NUNCA é usado como path livre: os PDFs são
//      derivados do id numérico e as imagens passam por uma
//      allow-list de nomenclatura (regex ancorada);
//   5. o caminho resolvido é conferido contra a pasta base
//      (defesa em profundidade contra path traversal);
//   6. resposta com Cache-Control: no-store e sem indexação;
//   7. 🧾 TRILHA DE AUDITORIA: todo download bem-sucedido gera um
//      registro de auditoria (quem, quando, IP mascarado, recurso).
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const { verificarToken, isAdmin } = require('../middlewares/authMiddleware');
const { caminhoSeguro } = require('../utils/caminhoSeguro');
const { registrarAcessoPII } = require('../utils/auditLog');
const { Usuario } = require('../models');

const router = express.Router();

// Pastas ABSOLUTAS, resolvidas a partir da raiz do projeto
// (independem do diretório de execução / CWD).
const PASTA_PDFS = path.resolve(__dirname, '..', '..', 'uploads', 'fichas_pdf');
const PASTA_IMAGENS = path.resolve(__dirname, '..', '..', 'uploads', 'candidatos_img');
const PASTA_FOTOS_FICHA = path.resolve(__dirname, '..', '..', 'uploads', 'fichas_foto');

// Nomenclatura gerada por uploadMiddleware (multer):
//   candidato_<campo>_<timestamp>_<random>.<jpg|png>
// Qualquer nome fora deste formato é REJEITADO.
const REGEX_IMAGEM_CANDIDATO =
  /^candidato_(foto|assinatura)_\d+_\d+\.(jpg|png)$/;

// Foto 3x4 das fichas (uploadMiddleware -> fotoFicha):
//   ficha_foto_<usuario_id>_<timestamp>_<random>.<jpg|png>
// O usuario_id embutido no nome é a PROVA DE TITULARIDADE usada
// na rota abaixo: o dono declarado tem de bater com o usuário logado.
const REGEX_FOTO_FICHA = /^ficha_foto_(\d+)_\d+_\d+\.(jpg|png)$/;

// PDFs gerados por fichaController:
//   ficha_usuario_<usuario_id>.pdf
const REGEX_PDF_FICHA = /^ficha_usuario_(\d+)\.pdf$/;

/** Cabeçalhos anti-cache/anti-indexação aplicados a todo arquivo entregue. */
function cabecalhosPrivados(res) {
  res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
}

/**
 * Busca o e-mail do ator de auditoria quando ele é admin.
 * ⚠️ O JWT carrega apenas id/role — o e-mail é resolvido sob demanda
 * (e apenas para admins) para não inflar o token com PII.
 * Falha de lookup nunca impede a entrega: retorna null.
 */
async function emailDoAtor(req) {
  if (req.usuario_role !== 'admin') return null;
  try {
    const admin = await Usuario.findByPk(req.usuario_id, { attributes: ['email'] });
    return admin?.email || null;
  } catch {
    return null;
  }
}

/**
 * Entrega um arquivo protegido via res.download, aplicando os
 * cabeçalhos privados e registrando a auditoria no SUCESSO.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} opcoes
 * @param {string} opcoes.caminho       caminho absoluto já validado
 * @param {string} opcoes.nomeDownload  nome amigável do download
 * @param {string} opcoes.recurso       rótulo do recurso p/ auditoria
 * @param {number|string} [opcoes.alvoId] id do titular do recurso
 * @param {string|null} [opcoes.emailAtor] e-mail do admin (mascarado no log)
 * @param {string} opcoes.mensagemErro  mensagem JSON em falha de entrega
 * @param {string} opcoes.rotuloErro    rótulo p/ log de streaming
 */
function entregarProtegido(req, res, opcoes) {
  const { caminho, nomeDownload, recurso, alvoId = null, emailAtor = null, mensagemErro, rotuloErro } = opcoes;

  cabecalhosPrivados(res);

  return res.download(caminho, nomeDownload, (erro) => {
    if (erro && !res.headersSent) {
      console.error(`❌ [ARQUIVOS] Falha ao enviar ${rotuloErro}:`, erro.message);
      return res.status(500).json({ erro: mensagemErro });
    }
    if (erro) {
      console.error(`❌ [ARQUIVOS] Streaming de ${rotuloErro} interrompido:`, erro.message);
      return;
    }

    // ✅ Download concluído — registra a trilha de auditoria (LGPD)
    registrarAcessoPII(req, {
      recurso,
      usuarioIdAlvo: alvoId,
      adminId: req.usuario_role === 'admin' ? req.usuario_id : null,
      adminEmail: emailAtor,
      arquivo: path.basename(caminho),
    });
  });
}

// ------------------------------------------------------------
// 📄 GET /api/arquivos/fichas/:usuarioId
// PDF da ficha de inscrição (dados pessoais + contato de emergência).
//
// Autorização: admin (coordenação) OU o próprio dono da ficha.
// O cliente envia APENAS o id numérico — o nome do arquivo é
// derivado no servidor, portanto não há como pedir outro PDF.
// ------------------------------------------------------------
router.get('/fichas/:usuarioId', verificarToken, async (req, res) => {
  const usuarioId = Number(req.params.usuarioId);

  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({ erro: 'Identificador de usuário inválido.' });
  }

  // Autorização: admin vê todas; demais, somente a própria ficha
  const ehAdmin = req.usuario_role === 'admin';
  if (!ehAdmin && Number(req.usuario_id) !== usuarioId) {
    return res.status(403).json({ erro: 'Você só pode acessar a ficha da sua própria inscrição.' });
  }

  const nomeArquivo = `ficha_usuario_${usuarioId}.pdf`;
  if (!REGEX_PDF_FICHA.test(nomeArquivo)) {
    return res.status(400).json({ erro: 'Arquivo solicitado é inválido.' });
  }

  const caminho = caminhoSeguro(PASTA_PDFS, nomeArquivo);
  if (!caminho) {
    return res.status(400).json({ erro: 'Arquivo solicitado é inválido.' });
  }

  if (!fs.existsSync(caminho) || !fs.statSync(caminho).isFile()) {
    return res.status(404).json({ erro: 'PDF da ficha não encontrado para este usuário.' });
  }

  const emailAtor = await emailDoAtor(req);

  return entregarProtegido(req, res, {
    caminho,
    nomeDownload: `ficha_inscricao_${usuarioId}.pdf`,
    recurso: 'ficha_pdf',
    alvoId: usuarioId,
    emailAtor,
    mensagemErro: 'Erro interno ao entregar o PDF.',
    rotuloErro: 'o PDF da ficha',
  });
});

// ------------------------------------------------------------
// 📸 GET /api/arquivos/fichas-foto/:arquivo
// Foto 3x4 enviada na ficha (jovem OU tio).
//
// 🔒 Confidencial (LGPD): biometria é dado pessoal sensível.
// Autorização: admin (coordenação) OU o próprio dono.
//
// 🛡️ A titularidade vem do PRÓPRIO NOME do arquivo, que o servidor
// gerou no upload embutindo o usuario_id. Antes de tocar o disco:
//   1. allow-list ancorada (REGEX_FOTO_FICHA);
//   2. o <id> capturado precisa ser o do usuário logado (ou admin);
//   3. caminhoSeguro() garante que o path não escapa da pasta.
// ------------------------------------------------------------
router.get('/fichas-foto/:arquivo', verificarToken, async (req, res) => {
  const nome = path.basename(String(req.params.arquivo || ''));
  const match = REGEX_FOTO_FICHA.exec(nome);

  if (!match) {
    return res.status(400).json({ erro: 'Nome de arquivo inválido.' });
  }

  // Titularidade: dono declarado no nome === usuário logado (ou admin)
  const donoDeclarado = Number(match[1]);
  const ehAdmin = req.usuario_role === 'admin';
  if (!ehAdmin && donoDeclarado !== Number(req.usuario_id)) {
    return res.status(403).json({ erro: 'Você só pode acessar a foto da sua própria ficha.' });
  }

  const caminho = caminhoSeguro(PASTA_FOTOS_FICHA, nome);
  if (!caminho) {
    return res.status(400).json({ erro: 'Arquivo solicitado é inválido.' });
  }

  if (!fs.existsSync(caminho) || !fs.statSync(caminho).isFile()) {
    return res.status(404).json({ erro: 'Foto não encontrada.' });
  }

  const emailAtor = await emailDoAtor(req);

  return entregarProtegido(req, res, {
    caminho,
    nomeDownload: `foto_3x4_${donoDeclarado}.${match[2]}`,
    recurso: 'foto_ficha',
    alvoId: donoDeclarado,
    emailAtor,
    mensagemErro: 'Erro interno ao entregar a foto.',
    rotuloErro: 'a foto da ficha',
  });
});

// ------------------------------------------------------------
// 🖼️ GET /api/arquivos/candidatos/:arquivo
// Foto 3x4 e assinatura dos candidatos.
//
// Confidencial: candidatos não têm login e são frequentemente
// MENORES DE IDADE. Acesso restrito à coordenação (isAdmin).
// Aceita tanto o nome puro quanto o caminho legado salvo no banco
// ("/uploads/candidatos_img/candidato_foto_...png") — o basename
// normaliza os dois formatos.
// ------------------------------------------------------------
router.get('/candidatos/:arquivo', verificarToken, isAdmin, async (req, res) => {
  const nome = path.basename(String(req.params.arquivo || ''));
  const match = REGEX_IMAGEM_CANDIDATO.exec(nome);

  if (!match) {
    return res.status(400).json({ erro: 'Nome de arquivo inválido.' });
  }

  const caminho = caminhoSeguro(PASTA_IMAGENS, nome);
  if (!caminho) {
    return res.status(400).json({ erro: 'Arquivo solicitado é inválido.' });
  }

  if (!fs.existsSync(caminho) || !fs.statSync(caminho).isFile()) {
    return res.status(404).json({ erro: 'Arquivo não encontrado.' });
  }

  const campo = match[1]; // 'foto' | 'assinatura'
  const rotulo = campo === 'foto' ? 'foto_3x4' : 'assinatura';
  const emailAtor = await emailDoAtor(req);

  return entregarProtegido(req, res, {
    caminho,
    nomeDownload: `${rotulo}_${Date.now()}.${match[2]}`,
    recurso: campo === 'foto' ? 'foto_candidato' : 'assinatura_candidato',
    alvoId: null,
    emailAtor,
    mensagemErro: 'Erro interno ao entregar o arquivo.',
    rotuloErro: 'a imagem do candidato',
  });
});

module.exports = router;
