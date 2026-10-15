// ============================================================
// 🔑 Segue-me V2 — Controller de Autenticação (RF01)
// login / registrar — tokens JWT com validade de 24h
// ============================================================

const jwt = require('jsonwebtoken');
const { UniqueConstraintError, ValidationError } = require('sequelize');
const { Usuario } = require('../models');
const { mascararEmail, ipDaRequisicao, descreverErro } = require('../utils/logSeguro');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRACAO = '24h'; // exigência RF01: sessão de 24 horas

/**
 * Campos seguros para expor nas respostas da API.
 * ⚠️ NUNCA incluir a senha (nem mesmo o hash) nas respostas.
 */
function dadosPublicosDoUsuario(usuario) {
  return { id: usuario.id, email: usuario.email, role: usuario.role };
}

// ------------------------------------------------------------
// POST /api/auth/login
// body: { email, senha }
// ------------------------------------------------------------
async function login(req, res) {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
    }

    const usuario = await Usuario.findOne({ where: { email } });

    // Mensagem genérica para e-mail inexistente OU senha errada:
    // não revela quais e-mails estão cadastrados (evita enumeração de usuários)
    if (!usuario || !(await usuario.verificarSenha(senha))) {
      // 🧾 Auditoria de falha de autenticação: registra a tentativa sem
      // expor o e-mail completo nem a senha (nunca logamos credenciais).
      console.warn(
        `🔐 [AUTH] Falha de login para ${mascararEmail(email)} (ip ${ipDaRequisicao(req)}).`
      );
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    const token = jwt.sign(
      { id: usuario.id, role: usuario.role },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRACAO }
    );

    return res.json({
      mensagem: 'Login realizado com sucesso.',
      token,
      usuario: dadosPublicosDoUsuario(usuario),
    });
  } catch (error) {
    console.error('❌ [AUTH] Erro no login:', descreverErro(error));
    return res.status(500).json({ erro: 'Erro interno ao realizar login.' });
  }
}

// ------------------------------------------------------------
// POST /api/auth/registrar
// body: { email, senha, role? }  — role aceitas: 'jovem' | 'tio'
// 🔒 Segurança: criação de 'admin' é BLOQUEADA nesta rota pública
//    (RN01: novos admins devem ser criados por um Admin autenticado)
// ------------------------------------------------------------
async function registrar(req, res) {
  try {
    const { email, senha, role } = req.body;

    // 🔒 Bloqueio explícito de escalonamento de privilégio
    if (role === 'admin') {
      return res
        .status(403)
        .json({ erro: 'Não é permitido criar usuários admin por esta rota.' });
    }

    const roleFinal = role || 'jovem';
    if (!['jovem', 'tio'].includes(roleFinal)) {
      return res.status(400).json({ erro: 'Role inválida. Permitidas: jovem, tio.' });
    }

    if (!email || !senha) {
      return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
    }

    if (senha.length < 6) {
      return res.status(400).json({ erro: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    // O hook beforeCreate do model aplica o hash bcrypt automaticamente
    const novoUsuario = await Usuario.create({
      email,
      senha,
      role: roleFinal,
    });

    return res.status(201).json({
      mensagem: 'Usuário registrado com sucesso.',
      usuario: dadosPublicosDoUsuario(novoUsuario),
    });
  } catch (error) {
    // ⚠️ UniqueConstraintError ANTES de ValidationError (é subclasse dela)
    if (error instanceof UniqueConstraintError) {
      return res
        .status(409)
        .json({ erro: 'Já existe um usuário cadastrado com este e-mail.' });
    }
    if (error instanceof ValidationError) {
      return res
        .status(400)
        .json({ erro: error.errors.map((e) => e.message).join(' ') });
    }
    console.error('❌ [AUTH] Erro no registro:', descreverErro(error));
    return res.status(500).json({ erro: 'Erro interno ao registrar usuário.' });
  }
}

module.exports = { login, registrar };
