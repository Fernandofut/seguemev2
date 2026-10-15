// ============================================================
// 🧼 Segue-me V2 — Utilitários de log seguro (LGPD / hardening)
// Centraliza a sanitização de dados sensíveis em logs:
//   • e-mails são mascarados (nunca o endereço completo);
//   • senhas e tokens NUNCA são recebidos por estas funções —
//     por contrato, os chamadores só passam metadados;
//   • mensagens de erro são truncadas e sem quebras de linha,
//     evitando despejo de payload/stack nos logs.
// ============================================================

/**
 * Mascara um e-mail preservando apenas o mínimo para correlação:
 *   joao.silva@igreja.com  ->  jo***@ig***.com
 * Valor ausente/malformado vira '(inválido)'.
 *
 * @param {string} valor endereço de e-mail
 * @returns {string} e-mail ofuscado
 */
function mascararEmail(valor) {
  const email = String(valor || '').trim();
  const [usuario, dominio] = email.split('@');
  if (!usuario || !dominio) return '(inválido)';

  const usuarioMascarado = usuario.length <= 2 ? `${usuario[0] || ''}*` : `${usuario.slice(0, 2)}***`;
  const dominioMascarado = dominio.replace(/^([^.]+)/, (parte) =>
    parte.length <= 2 ? `${parte[0] || ''}*` : `${parte.slice(0, 2)}***`
  );

  return `${usuarioMascarado}@${dominioMascarado}`;
}

/**
 * Extrai o IP do cliente respeitando o trust proxy do Express.
 * Usado apenas para correlação em logs de auditoria.
 *
 * @param {import('express').Request} req
 * @returns {string} IP ou 'desconhecido'
 */
function ipDaRequisicao(req) {
  if (!req) return 'desconhecido';
  const encaminhado = req.headers?.['x-forwarded-for'];
  if (encaminhado) return String(encaminhado).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'desconhecido';
}

/**
 * Resume um erro para log sem vazar dados:
 * retorna "<Nome>: <mensagem truncada, sem quebras de linha>".
 * Nunca inclui o payload da requisição.
 *
 * @param {unknown} error
 * @returns {string}
 */
function descreverErro(error) {
  if (error === null || error === undefined) return 'erro desconhecido';
  if (typeof error === 'string') return error.replace(/\s+/g, ' ').slice(0, 200);

  const nome = error.name || 'Error';
  const mensagem = typeof error.message === 'string' ? error.message : '';
  const limpa = mensagem.replace(/\s+/g, ' ').trim().slice(0, 200);
  return limpa ? `${nome}: ${limpa}` : nome;
}

module.exports = { mascararEmail, ipDaRequisicao, descreverErro };
