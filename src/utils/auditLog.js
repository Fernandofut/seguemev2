// ============================================================
// 🧾 Segue-me V2 — Log de Auditoria de Acesso a PII (LGPD)
// Registra com precisão quem, quando e qual recurso sensível foi
// acessado. NUNCA registra senhas, tokens ou o conteúdo dos arquivos.
// ============================================================

const { mascararEmail, ipDaRequisicao } = require('./logSeguro');

function registrarAcessoPII(req, opcoes = {}) {
  const {
    recurso = 'desconhecido',      // ex.: 'ficha_pdf', 'foto_ficha', 'foto_candidato', 'assinatura_candidato'
    usuarioIdAlvo = null,          // id do dono/recurso alvo (quando aplicável)
    adminId = null,                // id do administrador que acessou (quando for admin)
    adminEmail = null,             // e-mail do administrador (será mascarado)
    arquivo = null,                // nome do arquivo acessado (basename)
    metodo = req?.method,
    url = req?.originalUrl || req?.url,
  } = opcoes;

  const agora = new Date().toISOString();
  const ip = ipDaRequisicao(req);
  const atorId = adminId ?? req?.usuario_id ?? 'anon';
  const atorEmail = adminEmail ? mascararEmail(adminEmail) : null;

  // Linha compacta e estruturada para fácil grep/parse
  const partes = [
    agora,
    `ip=${ip}`,
    `atorId=${atorId}`,
    atorEmail ? `atorEmail=${atorEmail}` : null,
    `metodo=${metodo}`,
    `url=${url}`,
    `recurso=${recurso}`,
    usuarioIdAlvo !== null ? `alvoId=${usuarioIdAlvo}` : null,
    arquivo ? `arquivo=${arquivo}` : null,
  ].filter(Boolean);

  console.info(`🧾 [AUDIT-PII] ${partes.join(' | ')}`);
}

module.exports = { registrarAcessoPII };
