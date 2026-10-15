// upload middleware reconstructed
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const TAMANHO_MAX_ARQUIVO = 5 * 1024 * 1024;

const PASTA_FOTOS_FICHA = path.resolve(__dirname, '..', '..', 'uploads', 'fichas_foto');
const PASTA_CANDIDATOS_IMG = path.resolve(__dirname, '..', '..', 'uploads', 'candidatos_img');

fs.mkdirSync(PASTA_FOTOS_FICHA, { recursive: true });
fs.mkdirSync(PASTA_CANDIDATOS_IMG, { recursive: true });

// ⚠️ O sufixo aleatório é NUMÉRICO de propósito: as allow-lists que
// validam esses nomes (REGEX_ANEXO_FICHA no controller e
// REGEX_FOTO_FICHA / REGEX_IMAGEM_CANDIDATO em arquivosRoutes) só
// aceitam \d+ no segmento aleatório. Um sufixo hex (a-zA-Z) faria o
// arquivo ser gravado, porém jamais vinculado à ficha nem lido pelo
// gerador de PDF.
function randNumerico() {
  return String(crypto.randomInt(1, 1_000_000_000));
}

function gerarNome(prefixo, usuarioId, ext) {
  const rand = randNumerico();
  const ts = Date.now();
  if (usuarioId) {
    return `${prefixo}_${usuarioId}_${ts}_${rand}.${ext}`;
  }
  return `${prefixo}_${ts}_${rand}.${ext}`;
}

const storageFicha = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PASTA_FOTOS_FICHA),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const nome = gerarNome('ficha_' + (file.fieldname === 'foto' ? 'foto' : 'assinatura'), req.usuario_id, ext === 'jpeg' ? 'jpg' : ext);
    cb(null, nome);
  },
});

const storageCandidato = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PASTA_CANDIDATOS_IMG),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const nomeExt = ext === '.jpeg' ? '.jpg' : ext;
    const rand = randNumerico();
    const ts = Date.now();
    const campo = file.fieldname === 'foto' ? 'foto' : 'assinatura';
    cb(null, `candidato_${campo}_${ts}_${rand}${nomeExt}`);
  },
});

// Allow-list dupla: além do MIME declarado pelo cliente (falsificável),
// exigimos também a EXTENSÃO do nome original. Um arquivo .exe/.html com
// MIME "image/png" forjado é barrado aqui — ele nunca seria servido, mas
// ficaria gravado como PII órfã na pasta de uploads.
const MIMES_ACEITOS = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const EXTS_ACEITAS = new Set(['.jpg', '.jpeg', '.png']);

const MENSAGEM_IMAGEM_INVALIDA = 'Formato de imagem inválido. Envie JPEG ou PNG.';

const filtroImagem = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (MIMES_ACEITOS.has(file.mimetype) && EXTS_ACEITAS.has(ext)) cb(null, true);
  else cb(new Error(MENSAGEM_IMAGEM_INVALIDA), false);
};

// Assinaturas (magic bytes) dos formatos aceitos:
//   PNG -> 89 50 4E 47 0D 0A 1A 0A   |   JPEG -> FF D8 FF
const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ASSINATURA_JPEG = Buffer.from([0xff, 0xd8, 0xff]);

/** Confere se o arquivo em `caminho` casa com a assinatura do formato. */
function assinaturaValida(caminho, mimetype) {
  let fd;
  try {
    fd = fs.openSync(caminho, 'r');
    const buffer = Buffer.alloc(8);
    const lidos = fs.readSync(fd, buffer, 0, 8, 0);
    if (lidos < 3) return false;
    if (/png$/i.test(mimetype)) return buffer.subarray(0, 8).equals(ASSINATURA_PNG);
    return buffer.subarray(0, 3).equals(ASSINATURA_JPEG);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

/** Remove do disco TODOS os arquivos que o multer já gravou no request. */
function apagarArquivosDoRequest(req) {
  for (const lista of Object.values(req.files || {})) {
    if (!Array.isArray(lista)) continue;
    for (const arquivo of lista) {
      if (!arquivo?.path) continue;
      try { fs.unlinkSync(arquivo.path); } catch {}
    }
  }
}

// ------------------------------------------------------------
// 🧯 Validação de conteúdo pós-upload (após o multer gravar):
// arquivos corrompidos ou com bytes que não correspondem ao formato
// declarado são rejeitados com JSON claro e removidos do disco, em
// vez de quebrar a geração do PDF mais adiante.
// ------------------------------------------------------------
function validarImagens(req, res, next) {
  const arquivos = [];
  for (const lista of Object.values(req.files || {})) {
    if (Array.isArray(lista)) arquivos.push(...lista);
  }

  const invalido = arquivos.find((arquivo) => !assinaturaValida(arquivo.path, arquivo.mimetype));
  if (!invalido) return next();

  apagarArquivosDoRequest(req);
  console.warn(`⚠️ [UPLOAD] Arquivo rejeitado (conteúdo não corresponde ao formato): ${path.basename(invalido.path)}`);
  return res.status(400).json({ erro: 'Arquivo de imagem inválido ou corrompido. Envie JPEG ou PNG.' });
}

const anexosFicha = multer({
  storage: storageFicha,
  limits: { fileSize: TAMANHO_MAX_ARQUIVO },
  fileFilter: filtroImagem,
}).fields([
  { name: 'foto', maxCount: 1 },
  { name: 'assinatura', maxCount: 1 },
]);

const camposInscricao = multer({
  storage: storageCandidato,
  limits: { fileSize: TAMANHO_MAX_ARQUIVO },
  fileFilter: filtroImagem,
}).fields([
  { name: 'foto', maxCount: 1 },
  { name: 'assinatura', maxCount: 1 },
]);

function apagarAnexoFicha(nome) {
  if (!nome) return;
  const p = path.join(PASTA_FOTOS_FICHA, path.basename(nome));
  try { fs.unlinkSync(p); } catch {}
}

module.exports = {
  anexosFicha,
  camposInscricao,
  PASTA_FOTOS_FICHA,
  PASTA_CANDIDATOS_IMG,
  TAMANHO_MAX_ARQUIVO,
  apagarAnexoFicha,
  apagarArquivosDoRequest,
  validarImagens,
};
