// ============================================================
// 📎 Segue-me V2 — Utilitário de anexos da Ficha
// Resolve e valida os anexos (foto 3x4 / assinatura) da ficha,
// isolando as regras de nomenclatura, contenção de caminho e
// propriedade do arquivo do restante da aplicação.
// ============================================================

const fs = require('fs');
const path = require('path');
const { caminhoSeguro } = require('./caminhoSeguro');
const { PASTA_FOTOS_FICHA } = require('../middlewares/uploadMiddleware');

// Nomenclatura gerada por uploadMiddleware para os anexos da ficha:
//   ficha_foto_<usuario_id>_<timestamp>_<random>.<jpg|png>
//   ficha_assinatura_<usuario_id>_<timestamp>_<random>.<jpg|png>
// O user_id embutido no nome é conferido contra o dono do arquivo
// (rota de leitura) e contra o usuário logado (ao salvar a ficha).
// Grupos capturados: 1=tipo, 2=dono, 3=timestamp, 4=random, 5=extensão.
const REGEX_ANEXO_FICHA = /^ficha_(foto|assinatura)_(\d+)_\d+_\d+\.(jpg|png)$/;

/** Rótulos amigáveis por tipo, para as mensagens de erro. */
const ROTULO_ANEXO = { foto: 'foto 3x4', assinatura: 'assinatura' };

/**
 * Resolve o caminho ABSOLUTO de um anexo da ficha (foto ou assinatura),
 * aplicando em sequência:
 *   1. allow-list de nomenclatura (REGEX_ANEXO_FICHA);
 *   2. path.basename + verificação de contenção (caminhoSeguro);
 *   3. existência do arquivo e de que é um arquivo regular.
 *
 * ⚠️ Sincrônica por design (existsSync/statSync): o PDF é montado em
 * memória e precisa do caminho resolvido no mesmo tick, sem I/O
 * assíncrono no meio do stream. Não há corrida — o multer já gravou
 * o arquivo em disco antes desta chamada.
 *
 * @param {string} nomeArquivo nome gravado no banco
 * @param {'foto'|'assinatura'} [tipoEsperado] se informado, exige o tipo
 * @returns {string|null} caminho absoluto legível, ou null
 */
function caminhoAnexoFicha(nomeArquivo, tipoEsperado) {
  const nome = path.basename(String(nomeArquivo || ''));
  const match = REGEX_ANEXO_FICHA.exec(nome);
  if (!match) return null;

  // Impede apontar foto_3x4 no slot da assinatura (e vice-versa)
  if (tipoEsperado && match[1] !== tipoEsperado) return null;

  const caminho = caminhoSeguro(PASTA_FOTOS_FICHA, nome);
  if (!caminho) return null;

  try {
    if (!fs.existsSync(caminho) || !fs.statSync(caminho).isFile()) return null;
  } catch {
    return null;
  }

  return caminho;
}

/**
 * Valida um campo de anexo (`foto_3x4` ou `assinatura`) do POST /api/fichas.
 *
 * ⚠️ O nome vem do CLIENTE, então nunca é confiado: precisa casar com a
 * allow-list, ter o TIPO esperado, apontar para um arquivo existente na
 * pasta protegida e pertencer ao usuário logado — isso impede que alguém
 * "aponte" a ficha para o anexo de outra pessoa (IDOR), para o slot
 * trocado (foto no lugar da assinatura) ou para um caminho forjado.
 *
 * @param {string|undefined} nomeArquivo
 * @param {number} usuarioId usuário logado (do JWT)
 * @param {'foto'|'assinatura'} tipo
 * @returns {{ ok: boolean, valor: string|null|undefined, erro?: string }}
 */
function validarAnexoFicha(nomeArquivo, usuarioId, tipo) {
  const rotulo = ROTULO_ANEXO[tipo] || 'anexo';
  const rotuloCap = rotulo.charAt(0).toUpperCase() + rotulo.slice(1);

  // Ausente = mantém o anexo já gravado (reenvio sem reenviar a imagem)
  if (nomeArquivo === undefined || nomeArquivo === null || nomeArquivo === '') {
    return { ok: true, valor: undefined };
  }

  if (typeof nomeArquivo !== 'string') {
    return { ok: false, valor: null, erro: `Referência de ${rotulo} inválida.` };
  }

  const nome = path.basename(nomeArquivo);
  const match = REGEX_ANEXO_FICHA.exec(nome);
  if (!match || match[1] !== tipo) {
    return { ok: false, valor: null, erro: `${rotuloCap} inválida: envie a imagem pelo formulário.` };
  }

  // O dono declarado no nome tem de ser o usuário logado
  if (Number(match[2]) !== Number(usuarioId)) {
    return { ok: false, valor: null, erro: `A ${rotulo} não pertence a este usuário.` };
  }

  if (!caminhoAnexoFicha(nome, tipo)) {
    return { ok: false, valor: null, erro: `${rotuloCap} não encontrada. Envie a imagem novamente.` };
  }

  return { ok: true, valor: nome };
}

module.exports = {
  REGEX_ANEXO_FICHA,
  ROTULO_ANEXO,
  caminhoAnexoFicha,
  validarAnexoFicha,
};
