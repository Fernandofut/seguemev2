#!/usr/bin/env node
// ============================================================
// 💾 Segue-me V2 — Backup consistente do banco + uploads
// Uso:  npm run backup [-- --keep 7]
//
// Gera um snapshot em backups/<AAAA-MM-DD_HH-MM-SS>/ com:
//   • database.sqlite  -> cópia CONSISTENTE (VACUUM INTO, segura com
//                         o servidor no ar e em modo WAL);
//   • uploads/         -> PDFs das fichas, fotos 3x4/assinaturas
//                         (candidatos e fichas de equipe).
//
// 🔁 ROTAÇÃO (--keep N): mantém apenas os N backups mais recentes e
// apaga automaticamente os mais antigos, evitando lotar o disco.
// Sem o parâmetro, nenhum backup é removido.
//
// ⚠️ LGPD: o backup contém dados pessoais sensíveis. Armazene em local
// criptografado, com acesso restrito, e respeite o prazo de retenção
// definido pela coordenação (ver docs/BACKUP.md).
// ============================================================

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const RAIZ = path.resolve(__dirname, '..');
const DB_STORAGE = process.env.DB_STORAGE || './database.sqlite';
const DB_PATH = path.isAbsolute(DB_STORAGE) ? DB_STORAGE : path.resolve(RAIZ, DB_STORAGE);

// Pastas com dados de runtime que precisam entrar no backup.
const PASTAS_UPLOADS = [
  'uploads/fichas_pdf',
  'uploads/fichas_foto',
  'uploads/candidatos_img',
];

const DESTINO_RAIZ = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.resolve(RAIZ, 'backups');

/** Timestamp local no formato AAAA-MM-DD_HH-MM-SS (ordenável). */
function carimbo() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

/** Recria o snapshot do banco via VACUUM INTO (atômico e consistente). */
function copiarBanco(destinoArquivo) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(DB_PATH)) {
      return reject(new Error(`Banco não encontrado em ${DB_PATH}`));
    }
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (erro) => {
      if (erro) return reject(erro);
      // VACUUM INTO cria uma cópia íntegra sem travar o servidor em produção
      db.run('VACUUM INTO ?', [destinoArquivo], (erroVacuum) => {
        db.close(() => {
          if (erroVacuum) return reject(erroVacuum);
          return resolve();
        });
      });
    });
  });
}

/** Copia uma pasta de uploads recursivamente (ignora se não existir). */
function copiarPasta(relativa, destinoBase) {
  const origem = path.resolve(RAIZ, relativa);
  if (!fs.existsSync(origem)) return 0;
  const destino = path.join(destinoBase, relativa);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.cpSync(origem, destino, { recursive: true });
  return contarArquivos(origem);
}

/** Conta arquivos regulares em uma árvore de diretórios. */
function contarArquivos(pasta) {
  let total = 0;
  for (const entrada of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) total += contarArquivos(caminho);
    else total += 1;
  }
  return total;
}

// Formato EXATO das pastas geradas por carimbo(): AAAA-MM-DD_HH-MM-SS.
// Usado como trava de segurança para NUNCA apagar algo que não seja um
// backup nosso (evita remover pastas alheias por engano).
const REGEX_PASTA_BACKUP = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;

/** Lê os argumentos de linha de comando (--keep N | --keep=N | --help). */
function parseArgs(argv) {
  const opcoes = { keep: null, ajuda: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opcoes.ajuda = true;
    } else if (arg === '--keep') {
      opcoes.keep = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--keep=')) {
      opcoes.keep = arg.slice('--keep='.length);
    }
  }

  if (opcoes.keep !== null) {
    const n = Number.parseInt(opcoes.keep, 10);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error('Valor inválido para --keep. Use um inteiro >= 1 (ex.: --keep 7).');
    }
    opcoes.keep = n;
  }

  return opcoes;
}

/**
 * Rotação: mantém as `limite` pastas de backup mais recentes e remove as
 * demais. Ordena pelo NOME (carimbo ordenável lexicograficamente), o que
 * dispensa consultar mtime e é imune a cópias que alterem timestamps.
 */
function rotacionarBackups(limite) {
  if (!fs.existsSync(DESTINO_RAIZ)) return { mantidos: 0, removidos: [] };

  const backups = fs
    .readdirSync(DESTINO_RAIZ, { withFileTypes: true })
    .filter((e) => e.isDirectory() && REGEX_PASTA_BACKUP.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse(); // mais recente primeiro

  const expirados = backups.slice(limite);
  const removidos = [];

  for (const nome of expirados) {
    const alvo = path.join(DESTINO_RAIZ, nome);
    // Defesa extra: só remove se realmente estiver DENTRO de DESTINO_RAIZ
    if (path.dirname(alvo) !== DESTINO_RAIZ) continue;
    fs.rmSync(alvo, { recursive: true, force: true });
    removidos.push(nome);
  }

  return { mantidos: Math.min(backups.length, limite), removidos };
}

function exibirAjuda() {
  console.log([
    '💾 Segue-me V2 — Backup',
    '',
    'Uso:',
    '  npm run backup                     # gera o backup (sem rotação)',
    '  node scripts/backup.js --keep 7    # gera e mantém os 7 mais recentes',
    '  node scripts/backup.js --keep=7    # forma equivalente',
    '',
    'Opções:',
    '  --keep N   Mantém apenas os N backups mais recentes; remove os demais.',
    '  --help     Exibe esta ajuda.',
    '',
    'Variáveis de ambiente: DB_STORAGE, BACKUP_DIR (ver docs/BACKUP.md).',
  ].join('\n'));
}

async function main(opcoes) {
  const destino = path.join(DESTINO_RAIZ, carimbo());
  fs.mkdirSync(destino, { recursive: true });

  console.log('💾 [BACKUP] Iniciando backup do Segue-me V2...');
  console.log(`📂 [BACKUP] Destino: ${destino}`);

  const destinoBanco = path.join(destino, path.basename(DB_PATH));
  await copiarBanco(destinoBanco);
  const tamanhoBanco = fs.statSync(destinoBanco).size;
  console.log(`✅ [BACKUP] Banco: ${path.basename(destinoBanco)} (${(tamanhoBanco / 1024).toFixed(1)} KB)`);

  let totalArquivos = 0;
  for (const pasta of PASTAS_UPLOADS) {
    const quantidade = copiarPasta(pasta, destino);
    totalArquivos += quantidade;
    if (quantidade > 0) console.log(`✅ [BACKUP] ${pasta}: ${quantidade} arquivo(s)`);
  }
  console.log(`✅ [BACKUP] Uploads copiados: ${totalArquivos} arquivo(s)`);

  // 🔁 Rotação opcional — só executa se --keep foi informado
  if (opcoes.keep !== null) {
    console.log(`🔁 [BACKUP] Rotação ativa: mantendo os ${opcoes.keep} backups mais recentes...`);
    const { removidos } = rotacionarBackups(opcoes.keep);
    if (removidos.length === 0) {
      console.log('👍 [BACKUP] Nenhum backup antigo para remover.');
    } else {
      for (const nome of removidos) console.log(`🗑️  [BACKUP] Backup antigo removido: ${nome}`);
      console.log(`🧹 [BACKUP] ${removidos.length} backup(s) antigo(s) removido(s).`);
    }
  }

  console.log('🔐 [BACKUP] Lembrete: o backup contém dados pessoais — armazene com acesso restrito/criptografado.');
  console.log('🏁 [BACKUP] Concluído com sucesso.');
}

let opcoes;
try {
  opcoes = parseArgs(process.argv.slice(2));
} catch (erro) {
  console.error(`❌ [BACKUP] ${erro.message}`);
  process.exit(1);
}

if (opcoes.ajuda) {
  exibirAjuda();
  process.exit(0);
}

main(opcoes).catch((erro) => {
  console.error(`❌ [BACKUP] Falha: ${erro.message}`);
  process.exit(1);
});
