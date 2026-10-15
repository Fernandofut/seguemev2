// ============================================================
// 🗄️ Segue-me V2 — Configuração da Conexão com o Banco de Dados
// Instância única do Sequelize (SQLite), compartilhada por todos os models
// ============================================================

const { Sequelize } = require('sequelize');
const path = require('path');

// Garante acesso às variáveis de ambiente caso este módulo seja usado
// de forma autônoma (ex.: scripts/migrations). Não sobrescreve valores
// já carregados pelo server.js.
require('dotenv').config();

const DB_DIALECT = process.env.DB_DIALECT || 'sqlite';
const DB_STORAGE = process.env.DB_STORAGE || './database.sqlite';

// Caminhos relativos são resolvidos a partir da RAIZ do projeto,
// independentemente do diretório de onde o Node foi iniciado.
// Caminhos absolutos passados em DB_STORAGE são preservados.
const storagePath = path.resolve(__dirname, '..', '..', DB_STORAGE);

// ------------------------------------------------------------
// Instância do Sequelize
// ------------------------------------------------------------
const sequelize = new Sequelize({
  dialect: DB_DIALECT,
  storage: storagePath,
  // Log de SQL desligado por padrão. Para depurar queries, defina
  // DB_LOG_SQL=true no .env.
  logging:
    process.env.DB_LOG_SQL === 'true'
      ? (sql) => console.log(`[DATABASE][SQL] ${sql}`)
      : false,
  // 🔁 Concorrência (SQLite): reexecuta a query quando o SQLite devolve
  // erro transitório de "banco ocupado" (SQLITE_BUSY) em vez de falhar.
  retry: {
    max: 5,
    match: [/SQLITE_BUSY/, /SQLITE_LOCKED/, /database is locked/i],
  },
  define: {
    underscored: true,     // colunas em snake_case por padrão
    freezeTableName: true, // nome da tabela = nome declarado no model
  },
});

/**
 * Valida a conexão com o banco de dados.
 * Deve ser chamada ANTES de o servidor começar a escutar requisições.
 *
 * @returns {Promise<boolean>} true se a conexão foi estabelecida
 * @throws {Error} propaga o erro para o servidor abortar a inicialização
 */
async function initDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ [DATABASE] Conexão com o banco de dados estabelecida com sucesso!');
    console.log(`📍 [DATABASE] Dialeto: ${DB_DIALECT} | Storage: ${storagePath}`);

    // 🧵 Ajustes de concorrência do SQLite (uma única conexão de escrita):
    //   • WAL  -> leituras não bloqueiam a escrita (e vice-versa);
    //   • busy_timeout -> aguarda até 5s por um lock em vez de falhar na hora;
    //   • foreign_keys -> integridade referencial garantida pelo próprio banco.
    if (DB_DIALECT === 'sqlite') {
      await sequelize.query('PRAGMA journal_mode = WAL;');
      await sequelize.query('PRAGMA busy_timeout = 5000;');
      await sequelize.query('PRAGMA foreign_keys = ON;');
      console.log('🗄️  [DATABASE] SQLite: journal_mode=WAL, busy_timeout=5000ms, foreign_keys=ON.');
    }

    return true;
  } catch (error) {
    console.error('❌ [DATABASE] Não foi possível conectar ao banco de dados:', error.message);
    throw error; // Aborta o startup do servidor em caso de falha
  }
}

module.exports = { sequelize, initDatabase };
