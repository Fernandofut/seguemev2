// ============================================================
// 🗂️ Segue-me V2 — Centralizador de Models e Associações
// Ponto ÚNICO de importação no restante da aplicação:
//   const { sequelize, Usuario, Ficha } = require('./models');
// ============================================================

const { sequelize, initDatabase } = require('../config/database');
const Usuario = require('./Usuario');
const Ficha = require('./Ficha');
const Candidato = require('./Candidato');

// ------------------------------------------------------------
// Associações — Usuario 1:1 Ficha (FK: usuario_id na tabela fichas)
// Aliases ('as') deixam os includes legíveis: Usuario.include 'ficha'
// ------------------------------------------------------------
Usuario.hasOne(Ficha, {
  foreignKey: 'usuario_id',
  as: 'ficha',
});

Ficha.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

module.exports = {
  sequelize,
  initDatabase,
  Usuario,
  Ficha,
  Candidato,
};
