// ============================================================
// 🧑‍🎓 Segue-me V2 — Model: Candidato
// Ficha de INSCRIÇÃO de candidatos (pessoas que farão o encontro
// pela primeira vez) — fluxo SEPARADO da ficha de equipes de
// trabalho. Baseada na ficha física da coordenação.
// Cada inscrição é um registro independente (sem login):
// o candidato preenche o formulário público e anexa foto 3x4
// e assinatura (arquivos em uploads/candidatos_img/).
// ============================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Candidato = sequelize.define(
  'Candidato',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    // ------------------------------------------------------------
    // 👤 Dados pessoais
    // ------------------------------------------------------------
    nome: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    telefone: { type: DataTypes.STRING(30), allowNull: true },
    endereco: { type: DataTypes.STRING(255), allowNull: true },
    email: {
      type: DataTypes.STRING(150),
      allowNull: true,
      validate: {
        isEmail: { msg: 'Formato de e-mail inválido.' },
      },
    },
    data_nascimento: { type: DataTypes.DATEONLY, allowNull: true }, // AAAA-MM-DD, sem hora
    naturalidade: { type: DataTypes.STRING(150), allowNull: true }, // cidade/estado de nascimento
    nome_pai: { type: DataTypes.STRING(150), allowNull: true },
    nome_mae: { type: DataTypes.STRING(150), allowNull: true },

    // ------------------------------------------------------------
    // 🎓 Formação (escolaridade + curso atual)
    // ------------------------------------------------------------
    escolaridade: { type: DataTypes.STRING(100), allowNull: true }, // ex.: Ensino Médio, Superior…
    situacao: { type: DataTypes.STRING(100), allowNull: true },     // ex.: Cursando, Completo…
    curso: { type: DataTypes.STRING(150), allowNull: true },        // qual curso (se aplicável)
    instituicao: { type: DataTypes.STRING(150), allowNull: true },  // onde estuda/estudou

    // ------------------------------------------------------------
    // 🕊️ Vida cristã
    // ------------------------------------------------------------
    religiao: { type: DataTypes.STRING(100), allowNull: true },
    igreja_frequenta: { type: DataTypes.STRING(150), allowNull: true },
    // ex.: ["Batismo", "Eucaristia", "Crisma"]
    sacramentos: { type: DataTypes.JSON, allowNull: true },
    movimento_igreja: { type: DataTypes.STRING(255), allowNull: true }, // pastorais/movimentos de origem

    // ------------------------------------------------------------
    // 🤝 Indicação — quem convidou o candidato
    // ------------------------------------------------------------
    convidou_nome: { type: DataTypes.STRING(150), allowNull: true },
    convidou_telefone: { type: DataTypes.STRING(30), allowNull: true },
    convidou_endereco: { type: DataTypes.STRING(255), allowNull: true },

    // ------------------------------------------------------------
    // 📎 Documentos anexados (paths públicos servidos por
    // /uploads/candidatos_img — gravados pelo uploadMiddleware)
    // ------------------------------------------------------------
    foto_url: { type: DataTypes.STRING(255), allowNull: true },       // ex.: /uploads/candidatos_img/candidato_foto_...jpg
    assinatura_url: { type: DataTypes.STRING(255), allowNull: true }, // ex.: /uploads/candidatos_img/candidato_assinatura_...png

    // ------------------------------------------------------------
    // 📝 Observações livres da coordenação / candidato
    // ------------------------------------------------------------
    observacoes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: 'candidatos',
  }
);

module.exports = Candidato;
