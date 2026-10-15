// ============================================================
// 👤 Segue-me V2 — Model: Usuario
// Gerencia os acessos ao sistema (perfis: jovem | tio | admin)
// RN01: todo usuário possui exatamente um perfil
// ============================================================

const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const { sequelize } = require('../config/database');

// Custo do hash bcrypt (recomendado atual: >= 10)
const SALT_ROUNDS = 10;

const Usuario = sequelize.define(
  'Usuario',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: {
        msg: 'Já existe um usuário cadastrado com este e-mail.',
      },
      validate: {
        isEmail: { msg: 'Formato de e-mail inválido.' },
      },
    },
    senha: {
      type: DataTypes.STRING,
      allowNull: false,
      // ⚠️ Armazenada SEMPRE como hash bcrypt — nunca em texto puro
    },
    role: {
      type: DataTypes.ENUM('jovem', 'tio', 'admin'),
      allowNull: false,
      defaultValue: 'jovem',
    },
  },
  {
    tableName: 'usuarios',
    hooks: {
      // 🔐 Hash da senha antes de CRIAR o usuário
      beforeCreate: async (usuario) => {
        if (usuario.senha) {
          usuario.senha = await bcrypt.hash(usuario.senha, SALT_ROUNDS);
        }
      },
      // 🔐 Hash da senha antes de ATUALIZAR — apenas se a senha mudou
      beforeUpdate: async (usuario) => {
        if (usuario.changed('senha') && usuario.senha) {
          usuario.senha = await bcrypt.hash(usuario.senha, SALT_ROUNDS);
        }
      },
    },
  }
);

/**
 * Compara uma senha em texto puro com o hash armazenado no banco.
 * Será utilizada na autenticação (RF01 — Etapa 4).
 *
 * @param {string} senhaPura senha digitada pelo usuário
 * @returns {Promise<boolean>} true se a senha confere
 */
Usuario.prototype.verificarSenha = function (senhaPura) {
  return bcrypt.compare(senhaPura, this.senha);
};

module.exports = Usuario;
