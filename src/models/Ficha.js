// ============================================================
// 📝 Segue-me V2 — Model: Ficha
// Armazena as respostas da ficha de inscrição (relação 1:1 com Usuario)
// RN03: cada usuário possui uma ficha por encontro (garantido via
//       UNIQUE na foreign key usuario_id)
// ============================================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Ficha = sequelize.define(
  'Ficha',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    // ------------------------------------------------------------
    // Relacionamento 1:1 com Usuario (FK na tabela fichas)
    // unique: true => no máximo 1 ficha por usuário, na íntegra do banco
    // ------------------------------------------------------------
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: 'usuarios', key: 'id' },
    },

    // ------------------------------------------------------------
    // 📜 Campos legados — allowNull: true (importação/formulário antigo)
    // Tipagem flexível (STRING/TEXT) onde o legado pode trazer texto livre
    // ------------------------------------------------------------
    nome: { type: DataTypes.STRING(150), allowNull: true },
    data_nascimento: { type: DataTypes.DATEONLY, allowNull: true },  // AAAA-MM-DD, sem hora
    telefone: { type: DataTypes.STRING(30), allowNull: true },
    endereco: { type: DataTypes.STRING(255), allowNull: true },
    paroquia_encontro: { type: DataTypes.STRING(150), allowNull: true },
    ano_encontro: { type: DataTypes.STRING(20), allowNull: true },    // legado pode conter faixas, ex.: "2022/2023"
    segues_trabalhados: { type: DataTypes.STRING(255), allowNull: true },
    equipes_trabalhadas: { type: DataTypes.STRING(255), allowNull: true },
    ultima_equipe_servida: { type: DataTypes.STRING(150), allowNull: true },
    // Campos para quem já fez o Segue-me (conforme requisitos)
    ano_que_fez_segueme: { type: DataTypes.STRING(50), allowNull: true },
    equipe_que_trabalhou: { type: DataTypes.STRING(150), allowNull: true },
    // Equipe de Dirigentes (ED) — nomenclatura oficial (ver fichaController: CAMPOS_PDF)
    participou_ed: { type: DataTypes.BOOLEAN, allowNull: true },
    cargo_pasta_ed: { type: DataTypes.STRING(150), allowNull: true }, // cargo/pasta ocupada na ED
    sacramentos: { type: DataTypes.JSON, allowNull: true },           // ex.: ["batismo", "crisma"]
    serviu_lideranca: { type: DataTypes.BOOLEAN, allowNull: true },
    lideranca_igreja: { type: DataTypes.STRING(150), allowNull: true }, // qual liderança na igreja
    vontade_lideranca: { type: DataTypes.STRING(255), allowNull: true }, // legado: pode trazer nuance de resposta
    possui_instrumento: { type: DataTypes.BOOLEAN, allowNull: true },
    toca_instrumento: { type: DataTypes.STRING(150), allowNull: true }, // legado: "sim, violão" — qual instrumento
    canta: { type: DataTypes.BOOLEAN, allowNull: true },
    quer_dar_palestra: { type: DataTypes.BOOLEAN, allowNull: true },
    tem_alergias: { type: DataTypes.BOOLEAN, allowNull: true },
    alergias_restricoes: { type: DataTypes.TEXT, allowNull: true },   // descrição longa de restrições
    nome_conjuge: { type: DataTypes.STRING(150), allowNull: true },
    idade_conjuge: { type: DataTypes.STRING(10), allowNull: true },   // legado tolerante (texto)
    telefone_conjuge: { type: DataTypes.STRING(30), allowNull: true },
    origem_movimento: { type: DataTypes.STRING(150), allowNull: true },
    tem_filhos: { type: DataTypes.BOOLEAN, allowNull: true },
    qtd_filhos: { type: DataTypes.STRING(10), allowNull: true },      // legado tolerante (texto)
    meio_transporte: { type: DataTypes.STRING(150), allowNull: true },
    publico: { type: DataTypes.BOOLEAN, allowNull: true },            // ficha visível para outros perfis?

    // ------------------------------------------------------------
    // ✨ Campos novos (coordenação) — Etapa 3
    // ------------------------------------------------------------
    contato_emergencia: { type: DataTypes.STRING(150), allowNull: true }, // nome + telefone de emergência
    tamanho_camiseta: { type: DataTypes.STRING(20), allowNull: true },    // ex.: PP, P, M, G, GG

    // ------------------------------------------------------------
    // 📎 Anexos da ficha — cada um guarda o NOME DO ARQUIVO (não a imagem).
    // As imagens vivem em uploads/fichas_foto/ (fora do public/) e só são
    // entregues por /api/arquivos/fichas-anexo/:arquivo (JWT obrigatório).
    // Nomenclatura gerada pelo uploadMiddleware:
    //   ficha_foto_<usuario_id>_<timestamp>_<random>.<jpg|png>
    //   ficha_assinatura_<usuario_id>_<timestamp>_<random>.<jpg|png>
    // Validado contra allow-list (REGEX_ANEXO_FICHA) antes de qualquer uso.
    // ⚠️ NUNCA concatenar estes valores num path sem passar por caminhoSeguro().
    // ⚠️ NÃO entram em CAMPOS_PDF: no PDF as imagens são desenhadas como
    //    imagem (foto no cabeçalho, assinatura no rodapé), não como texto.
    // ------------------------------------------------------------
    // Foto 3x4 do participante (desenhada no cabeçalho do PDF)
    foto_3x4: { type: DataTypes.STRING(255), allowNull: true },
    // Assinatura /= termo de concordância (desenhada no rodapé do PDF)
    assinatura: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    tableName: 'fichas',
  }
);

module.exports = Ficha;
