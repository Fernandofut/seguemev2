// ============================================================
// 🛣️ Segue-me V2 — Rotas de Autenticação (RF01)
// POST /api/auth/login      -> autentica e retorna o token JWT (24h)
// POST /api/auth/registrar  -> cria usuário (jovem | tio)
// ============================================================

const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');

const router = express.Router();

// ------------------------------------------------------------
// 🛡️ Rate limiting anti-força-bruta (BLOQUEADOR 3)
// Aplicado APENAS em POST /login: no máximo 10 tentativas por IP
// a cada 15 minutos. As demais rotas (registro, listagens, uploads)
// NÃO são limitadas, para não penalizar o uso legítimo da coordenação.
//
// Os valores são configuráveis por ambiente para os testes de
// regressão (que disparam vários logins seguidos), mas o DEFAULT é
// o valor seguro — não os remova em produção.
// ------------------------------------------------------------
const JANELA_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutos
const MAX_TENTATIVAS = Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10;

const limiteLogin = rateLimit({
  windowMs: JANELA_MS,
  max: MAX_TENTATIVAS,
  standardHeaders: 'draft-7', // RateLimit + RateLimit-Policy
  legacyHeaders: false,
  // ⚠️ Contagem por IP. Em produção atrás de proxy reverso, defina
  // app.set('trust proxy', ...) NO server.js — caso contrário todos
  // os usuários compartilhariam o mesmo IP (proxy) e o limite seria
  // disparado por engano.
  handler: (req, res) => {
    console.warn(
      `🚫 [RATE-LIMIT] Limite de ${MAX_TENTATIVAS} tentativas excedido para ${req.ip}.`
    );
    const minutos = Math.ceil(JANELA_MS / 60000);
    return res.status(429).json({
      erro: `Muitas tentativas de login. Aguarde ${minutos} minutos e tente novamente.`,
    });
  },
});

router.post('/login', limiteLogin, authController.login);
router.post('/registrar', authController.registrar);

module.exports = router;
