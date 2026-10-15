// ============================================================
// 🗃️ Segue-me V2 — Migrações incrementais (SQLite)
// Por que este arquivo existe: o `sequelize.sync()` SÓ cria tabelas
// que ainda não existem — ele NUNCA adiciona colunas novas a uma
// tabela já criada. Sem uma migração, um model novo derruba o
// servidor com "no such column" (SQLITE_ERROR) no primeiro INSERT.
//
// ⚠️ Por que NÃO `sequelize.sync({ alter: true })`: em SQLite o
// `alter` reconstrói a tabela e pode PERDER DADOS de colunas
// existentes. Este arquivo faz o oposto — só ADICIONA o que falta,
// de forma idempotente (pode rodar em todo boot, sem efeito colateral).
//
// Como adicionar uma migração:
//   1. liste a coluna nova em COLUNAS_POR_TABELA, com o DDL do SQLite;
//   2. ao rodar, a função compara com o schema atual e só executa
//      o ADD COLUMN que ainda faltar.
// ============================================================

const { sequelize } = require('../config/database');

/**
 * Colunas que precisam existir, por tabela.
 * O DDL é written para SQLite (único dialeto suportado hoje).
 */
const COLUNAS_POR_TABELA = {
  // Anexos da ficha (model Ficha) — ver uploadMiddleware.anexosFicha
  // foto_3x4   -> desenhada no cabeçalho do PDF
  // assinatura -> desenhada no rodapé do PDF (termo de concordância)
  fichas: [
    'foto_3x4 VARCHAR(255)',
    'assinatura VARCHAR(255)',
    'ano_que_fez_segueme VARCHAR(50)',
    'equipe_que_trabalhou VARCHAR(150)',
  ],
};

/**
 * Adiciona as colunas declaradas que ainda não existem na tabela.
 * Idempotente: rodar várias vezes não faz nada na segunda vez.
 *
 * @returns {Promise<string[]>} DDLs efetivamente executados
 */
async function aplicarMigracoes() {
  const aplicadas = [];

  for (const [tabela, colunas] of Object.entries(COLUNAS_POR_TABELA)) {
    // Tabela ainda não existe (primeiro boot): o sync() vai criá-la
    // completa com todas as colunas do model — nada a fazer aqui.
    const [existe] = await sequelize.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = :tabela`,
      { replacements: { tabela } }
    );
    if (!existe) continue;

    // Schema atual da tabela
    const [info] = await sequelize.query(`PRAGMA table_info(${tabela})`);
    const existentes = new Set(info.map((c) => c.name));

    for (const ddl of colunas) {
      // "foto_3x4 VARCHAR(255)" -> "foto_3x4"
      const nome = ddl.trim().split(/\s+/)[0].replace(/^["`]|["`]$/g, '');
      if (existentes.has(nome)) continue;

      // ⚠️ Identificadores vêm desta constante do código, nunca de
      // entrada do usuário. Still assim, AddColumn fica para quem
      // preferir o helper declarativo do Sequelize.
      await sequelize.query(`ALTER TABLE ${tabela} ADD COLUMN ${ddl}`);
      aplicadas.push(`${tabela}.${nome}`);
      console.log(`🗃️  [MIGRATION] Coluna adicionada: ${tabela}.${nome}`);
    }
  }

  return aplicadas;
}

module.exports = { aplicarMigracoes, COLUNAS_POR_TABELA };
