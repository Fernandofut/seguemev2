// ============================================================
// 📝 Segue-me V2 — Controller de Fichas (RF02 / RF03)
// salvarFicha: upsert (RN03) + geração de PDF no backend (RN04)
// listarFichas: listagem completa (restrita a admin)
//
// A renderização do PDF vive em src/utils/pdfGenerator.js e as
// regras de nomenclatura/validação dos anexos em
// src/utils/anexosFicha.js — este controller apenas orquestra.
// ============================================================

const path = require('path');
const { Ficha, Usuario } = require('../models');
const { apagarAnexoFicha } = require('../middlewares/uploadMiddleware');
const { validarAnexoFicha } = require('../utils/anexosFicha');
const { gerarPDF } = require('../utils/pdfGenerator');
const { descreverErro } = require('../utils/logSeguro');

// ------------------------------------------------------------
// POST /api/fichas/anexos  (verificarToken: jovem | tio)
// Recebe os anexos (foto 3x4 e/ou assinatura) em multipart e
// devolve o NOME de cada arquivo gravado.
// Os nomes NÃO são salvos aqui: o frontend os envia no POST
// /api/fichas seguinte, que é quem faz o upsert (a ficha pode
// ainda não existir). Separar as duas etapas mantém POST
// /api/fichas em JSON, sem breaking change no contrato existente.
// ------------------------------------------------------------
async function receberAnexosFicha(req, res) {
  try {
    const arquivos = { ...(req.files || {}) };
    const foto = arquivos.foto?.[0];
    const assinatura = arquivos.assinatura?.[0];

    if (!foto && !assinatura) {
      return res.status(400).json({ erro: 'Nenhuma imagem foi enviada.' });
    }

    // Reenvio: os anexos anteriores do mesmo usuário são descartados
    // para não deixar PII órfã na pasta de uploads.
    const ficha = await Ficha.findOne({ where: { usuario_id: req.usuario_id } });
    if (foto && ficha?.foto_3x4 && ficha.foto_3x4 !== foto.filename) {
      apagarAnexoFicha(ficha.foto_3x4);
    }
    if (assinatura && ficha?.assinatura && ficha.assinatura !== assinatura.filename) {
      apagarAnexoFicha(ficha.assinatura);
    }

    const resposta = {
      mensagem: 'Anexo(s) recebido(s). Agora salve a ficha para vincular ao PDF.',
    };
    // Nomes derivados no servidor: nunca ecoamos caminho absoluto do disco
    if (foto) resposta.foto_3x4 = foto.filename;
    if (assinatura) resposta.assinatura = assinatura.filename;

    return res.status(201).json(resposta);
  } catch (error) {
    console.error('❌ [FICHA] Erro ao receber os anexos:', descreverErro(error));
    return res.status(500).json({ erro: 'Erro interno ao receber os anexos.' });
  }
}

// ------------------------------------------------------------
// POST /api/fichas  (verificarToken: jovem | tio | admin)
// RN03: 1 ficha por usuário (update se existir, create se não).
// RN04: PDF gerado a partir da instância JÁ persistida no banco.
// ------------------------------------------------------------
async function salvarFicha(req, res) {
  try {
    const usuarioId = req.usuario_id; // injetado pelo verificarToken

    const usuario = await Usuario.findByPk(usuarioId);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário autenticado não encontrado no banco.' });
    }

    // Sanitiza o body: remove campos de controle que não pertencem à ficha
    const { id, usuario_id, createdAt, updatedAt, ...dados } = req.body;

    // 🔒 Foto e assinatura vêm por NOME do cliente: validamos
    // allow-list + tipo + existência + titularidade antes de qualquer
    // uso (ver validarAnexoFicha). `undefined` = reenvio da ficha sem
    // reenviar a imagem, o que mantém o anexo já gravado.
    for (const [campo, tipo] of [
      ['foto_3x4', 'foto'],
      ['assinatura', 'assinatura'],
    ]) {
      const anexo = validarAnexoFicha(dados[campo], usuarioId, tipo);
      if (!anexo.ok) {
        return res.status(400).json({ erro: anexo.erro });
      }
      if (anexo.valor === undefined) {
        delete dados[campo];
      } else {
        dados[campo] = anexo.valor;
      }
    }

    const fichaExistente = await Ficha.findOne({ where: { usuario_id: usuarioId } });

    let ficha;
    if (fichaExistente) {
      await fichaExistente.update(dados);
      ficha = fichaExistente;
    } else {
      ficha = await Ficha.create({ ...dados, usuario_id: usuarioId });
    }

    const caminhoPDF = await gerarPDF(ficha, usuario.email);
    const nomeArquivo = path.basename(caminhoPDF);

    const resposta = {
      mensagem: fichaExistente
        ? 'Ficha atualizada e PDF gerado com sucesso.'
        : 'Ficha cadastrada e PDF gerado com sucesso.',
      ficha,
      pdf: {
        arquivo: nomeArquivo,
        // ⚠️ Não expõe o caminho absoluto do disco (vazamento da
        // topologia do servidor). Entrega apenas pela rota autenticada.
        url_download: `/api/arquivos/fichas/${usuarioId}`,
      },
    };

    return res.status(fichaExistente ? 200 : 201).json(resposta);
  } catch (error) {
    console.error('❌ [FICHA] Erro ao salvar ficha:', descreverErro(error));
    return res.status(500).json({ erro: 'Erro interno ao salvar a ficha.' });
  }
}

// ------------------------------------------------------------
// GET /api/fichas  (verificarToken + isAdmin — Etapa 5)
// Lista TODAS as fichas da coordenação, com o e-mail e o perfil
// (role) do usuário associado. Nunca expõe a senha.
// ------------------------------------------------------------
async function listarTodasFichas(req, res) {
  try {
    const fichas = await Ficha.findAll({
      include: [{ model: Usuario, as: 'usuario', attributes: ['email', 'role'] }],
      order: [['id', 'ASC']],
    });

    return res.json({ total: fichas.length, fichas });
  } catch (error) {
    console.error('❌ [FICHA] Erro ao listar fichas:', descreverErro(error));
    return res.status(500).json({ erro: 'Erro interno ao listar as fichas.' });
  }
}

// Alias de compatibilidade — mesma listagem administrativa
const listarFichas = listarTodasFichas;

module.exports = { salvarFicha, receberAnexosFicha, listarFichas, listarTodasFichas };
