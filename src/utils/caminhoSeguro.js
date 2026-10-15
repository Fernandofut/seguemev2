// ============================================================
// 🔒 Segue-me V2 — Utilitário de caminho seguro
// Resolve um nome de arquivo DENTRO de uma pasta base, garantindo
// que o resultado final não escape dela.
//
// Usado por arquivosRoutes (entrega de arquivos) e fichaController
// (leitura da foto 3x4 ao montar o PDF) — mesma regra nos dois
// lados evita divergência de validação.
// ============================================================

const path = require('path');

/**
 * Resolve `nome` dentro de `pastaBase` garantindo que o resultado
 * final NÃO escape da pasta (defesa em profundidade contra
 * path traversal — "../../etc/passwd", symlinks, etc.).
 *
 * @param {string} pastaBase pasta raiz (ex.: uploads/fichas_foto)
 * @param {string} nome      nome do arquivo vindo do cliente/banco
 * @returns {string|null} caminho absoluto seguro ou null se inválido
 */
function caminhoSeguro(pastaBase, nome) {
  // basename derruba qualquer tentativa de travessia de diretórios
  const seguro = path.basename(String(nome || ''));
  if (!seguro || seguro === '.' || seguro === '..') return null;

  const absoluto = path.resolve(pastaBase, seguro);
  const base = path.resolve(pastaBase);

  // O arquivo precisa estar DENTRO da pasta base (path prefix + sep
  // evita o erro clássico de "/uploads" vs "/uploads_evil")
  if (absoluto !== base && !absoluto.startsWith(base + path.sep)) return null;

  return absoluto;
}

module.exports = { caminhoSeguro };
