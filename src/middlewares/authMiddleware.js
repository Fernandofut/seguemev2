// ============================================================
// 🔐 Segue-me V2 — Middleware de Autenticação e Autorização (RF01)
// verificarToken: valida o JWT e injeta req.usuario_id / req.usuario_role
// isAdmin: restringe o acesso aos perfis 'admin'
// ============================================================

const jwt = require('jsonwebtoken');
const { ipDaRequisicao } = require('../utils/logSeguro');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * AUTENTICAÇÃO — valida o token JWT do header `Authorization: Bearer <token>`.
 *
 * Em caso de sucesso injeta no request:
 *   req.usuario_id   -> id do usuário autenticado
 *   req.usuario_role -> perfil do usuário autenticado ('jovem' | 'tio' | 'admin')
 *
 * 401: token ausente, inválido ou expirado.
 */
function verificarToken(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(500).json({ erro: 'Servidor sem JWT_SECRET configurado no .env.' });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario_id = decoded.id;
    req.usuario_role = decoded.role;
    return next();
  } catch (error) {
    // 🧾 Auditoria: registra a rejeição pelo MOTIVO — nunca o token em si.
    const expirado = error.name === 'TokenExpiredError';
    console.warn(
      `🔐 [AUTH] Token rejeitado (${expirado ? 'expirado' : 'inválido'}) em ${req.method} ${req.originalUrl} (ip ${ipDaRequisicao(req)}).`
    );
    const mensagem = expirado
      ? 'Token expirado. Faça login novamente.'
      : 'Token inválido.';
    return res.status(401).json({ erro: mensagem });
  }
}

/**
 * AUTORIZAÇÃO — permite apenas usuários com role 'admin'.
 * ⚠️ Deve ser usado SEMPRE após o verificarToken na cadeia de middlewares.
 *
 * 403: usuário autenticado, mas sem permissão de administrador.
 */
function isAdmin(req, res, next) {
  if (req.usuario_role !== 'admin') {
    return res.status(403).json({ erro: 'Acesso restrito a administradores.' });
  }
  return next();
}

module.exports = { verificarToken, isAdmin };
