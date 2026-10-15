// ============================================================
// 🧪 Teste: Foto 3x4 na ficha + PDF de JOVEM e TIO
// (1) upload multipart -> /api/fichas/foto
// (2) vínculo da foto na ficha -> PDF com imagem no cabeçalho
// (3) download administrativo do PDF de QUALQUER perfil (jovem/tio)
// (4) LGPD: a foto nunca é servida sem token / fora do dono
// Rodar com o servidor ativo: node test-foto-ficha.js
// Requer Node >= 18.
// ============================================================

const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:3000';

let ok = 0;
let falha = 0;

function verificar(nome, cond, detalhe = '') {
  console.log((cond ? '[OK]    ' : '[FALHA] ') + nome + (cond ? '' : ` => ${detalhe}`));
  if (cond) ok += 1; else falha += 1;
}

/**
 * Gera um PNG 3x4 REAL (2x3 px, RGB) inline — dispensa fixture no repo.
 *
 * ⚠️ Precisa ser um PNG de verdade (CRCs corretos, stream IDAT
 * válido): um base64 "quase PNG" é aceito pelo upload (que só checa
 * o MIME) mas o pdfkit falha ao decodificar. Montamos o arquivo
 * chunk a chunk, com CRC32 calculada.
 */
function png3x4Valido() {
  const zlib = require('zlib');

  const LARGURA = 2;
  const ALTURA = 3;

  // Tabela CRC32 (polinômio 0xEDB88320), calculada uma vez
  const tabelaCrc = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabelaCrc[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = tabelaCrc[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  const chunk = (tipo, dados) => {
    const comprimento = Buffer.alloc(4);
    comprimento.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(corpo));
    return Buffer.concat([comprimento, corpo, crc]);
  };

  // Assinatura PNG
  const assinatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR: largura, altura, profundidade 8, tipo 2 (RGB), sem compressão
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(LARGURA, 0);
  ihdr.writeUInt32BE(ALTURA, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compressão deflate
  ihdr[11] = 0; // filtro adaptativo
  ihdr[12] = 0; // sem entrelaçamento

  // IDAT: cada scanline = 1 byte de filtro (0 = none) + 3 bytes por pixel
  const raw = Buffer.alloc(ALTURA * (1 + LARGURA * 3));
  for (let y = 0; y < ALTURA; y += 1) {
    const offset = y * (1 + LARGURA * 3);
    raw[offset] = 0; // filtro "None"
    for (let x = 0; x < LARGURA; x += 1) {
      const px = offset + 1 + x * 3;
      raw[px] = 40 + y * 40; // R
      raw[px + 1] = 60 + x * 30; // G
      raw[px + 2] = 180; // B
    }
  }
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    assinatura,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Conta os streams de imagem XObject do PDF (foto embutida). */
function contarImagensPDF(buffer) {
  const texto = buffer.toString('latin1');
  return (texto.match(/\/Subtype\s*\/Image/g) || []).length;
}

async function main() {
  // ---------- 0. Setup: usuário jovem de teste ----------
  const email = 'teste.foto.ficha@segueme.com.br';
  const senha = 'teste123';

  await fetch(`${BASE}/api/auth/registrar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha, role: 'jovem' }),
  }); // 409 = já existe (ok)

  const login = await (
    await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    })
  ).json();
  verificar('Login do jovem de teste', Boolean(login.token), '');
  const auth = { Authorization: `Bearer ${login.token}` };

  // ---------- 1. Upload da foto 3x4 (multipart) ----------
  const form = new FormData();
  form.append('foto', new Blob([png3x4Valido()], { type: 'image/png' }), 'minha-foto.png');

  const respFoto = await fetch(`${BASE}/api/fichas/foto`, { method: 'POST', headers: auth, body: form });
  const corpoFoto = await respFoto.json().catch(() => ({}));
  const nomeFoto = corpoFoto.foto_3x4;

  // ⚠️ Testes a seguir dependem do nome válido: sem ele o erro
  // cascateia e o diagnóstico fica inutilizável.
  if (!/^ficha_foto_\d+_\d+_\d+\.png$/.test(nomeFoto || '')) {
    console.error(`\n🛑 Upload da foto falhou (${respFoto.status}): ${JSON.stringify(corpoFoto)}`);
    console.error('   Abortando: os demais testes exigem um nome de arquivo válido.\n');
    process.exit(1);
  }

  verificar('POST /api/fichas/foto -> 201', respFoto.status === 201, String(respFoto.status));
  verificar('Upload devolve o nome do arquivo no padrão da allow-list', true, '');
  verificar('Upload NÃO expõe caminho absoluto do disco',
    !JSON.stringify(corpoFoto).includes('uploads'), JSON.stringify(corpoFoto));

  // ---------- 1.1 Rejeições de upload ----------
  const formRuim = new FormData();
  formRuim.append('foto', new Blob(['nao sou imagem'], { type: 'text/plain' }), 'x.txt');
  const respRuim = await fetch(`${BASE}/api/fichas/foto`, { method: 'POST', headers: auth, body: formRuim });
  verificar('Upload de arquivo não-imagem é rejeitado (400)', respRuim.status === 400, String(respRuim.status));

  const semToken = new FormData();
  semToken.append('foto', new Blob([png3x4Valido()], { type: 'image/png' }), 'x.png');
  const respSemToken = await fetch(`${BASE}/api/fichas/foto`, { method: 'POST', body: semToken });
  verificar('Upload sem token é bloqueado (401)', respSemToken.status === 401, String(respSemToken.status));

  // ---------- 2. Ficha com a foto vinculada ----------
  const fichaBase = {
    nome: 'Camila Ferreira Rocha', data_nascimento: '2003-07-21', telefone: '(11) 98888-7777',
    endereco: 'Rua das Acacias, 120', ano_encontro: '2019/2020', paroquia_encontro: 'Paroquia Nossa Senhora',
    contato_emergencia: 'Maria Rocha — (11) 97777-1111', tamanho_camiseta: 'P',
    sacramentos: ['Batismo', 'Confirmação'],
    segues_trabalhados: '2019, 2020', equipes_trabalhadas: 'Acolhida, Musica',
    ultima_equipe_servida: 'Acolhida',
    serviu_lideranca: false, possui_instrumento: false, canta: true,
  };

  const respFicha = await fetch(`${BASE}/api/fichas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ ...fichaBase, foto_3x4: nomeFoto }),
  });
  const corpoFicha = await respFicha.json().catch(() => ({}));
  verificar('POST /api/fichas com foto_3x4 -> 201/200',
    respFicha.status === 201 || respFicha.status === 200, `${respFicha.status} ${JSON.stringify(corpoFicha).slice(0, 200)}`);
  verificar('Ficha persistiu o nome da foto',
    Boolean(nomeFoto) && corpoFicha.ficha?.foto_3x4 === nomeFoto, String(corpoFicha.ficha?.foto_3x4));

  const usuarioId = corpoFicha.ficha?.usuario_id;
  verificar('Resposta traz o usuario_id da ficha', Number.isInteger(usuarioId), String(usuarioId));

  // ---------- 2.1 Validações de segurança do vínculo ----------
  // Dono divergente: mesmo formato válido, porém com outro usuario_id.
  const nomeDeOutroDono = nomeFoto.replace(/^ficha_foto_\d+_/, `ficha_foto_${usuarioId + 99999}_`);
  const nomesForjados = [
    '../../.env',
    '..\\..\\database.sqlite',
    'foto_usuario_1.pdf',
    'ficha_foto_999999_1_1.jpg', // usuário inexistente
    nomeDeOutroDono, // dono divergente
  ];
  let forjadosBloqueados = true;
  const detalhesForjados = [];
  for (const nome of nomesForjados) {
    const r = await fetch(`${BASE}/api/fichas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ ...fichaBase, foto_3x4: nome }),
    });
    if (r.status < 400) {
      forjadosBloqueados = false;
      detalhesForjados.push(`${nome} => ${r.status}`);
    }
  }
  verificar('Vínculo de foto rejeita path traversal / nome forjado (>=400)',
    forjadosBloqueados, detalhesForjados.join(' | '));

  // ---------- 3. PDF contém a foto ----------
  const loginAdmin = await (
    await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@segueme.com.br', senha: 'admin123' }),
    })
  ).json();
  const authAdmin = { Authorization: `Bearer ${loginAdmin.token}` };

  const pdfResp = await fetch(`${BASE}/api/arquivos/fichas/${usuarioId}`, { headers: authAdmin });
  const pdfBuf = Buffer.from(await pdfResp.arrayBuffer());
  verificar('Admin baixa o PDF da ficha do JOVEM (200 + application/pdf)',
    pdfResp.status === 200 && (pdfResp.headers.get('content-type') || '').includes('pdf'), String(pdfResp.status));

  const imagens = contarImagensPDF(pdfBuf);
  verificar('PDF do jovem CONTÉM a imagem da foto 3x4', imagens >= 1, `streams de imagem: ${imagens}`);

  // Prova de que a imagem é a NOSSA (e não um logo/placeholder):
  // lemos a largura/altura do XObject. O pdfkit RE-CODIFICA a imagem
  // no PDF (os bytes originais do PNG não sobrevivem intactos), então
  // a verificação correta é sobre a geometria, não sobre a assinatura.
  const texto = pdfBuf.toString('latin1');
  const dimensoes = [...texto.matchAll(/\/Width\s+(\d+)[\s\S]{0,80}?\/Height\s+(\d+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
  const tem2x3 = dimensoes.some(([w, h]) => w === 2 && h === 3);
  verificar('XObject da foto tem as dimensões reais da imagem enviada (2x3 px)',
    tem2x3, `dimensões encontradas: ${JSON.stringify(dimensoes)}`);

  // ---------- 4. LGPD: a foto é protegida ----------
  const fotoSemToken = await fetch(`${BASE}/api/arquivos/fichas-foto/${nomeFoto}`);
  verificar('Foto sem token -> 401', fotoSemToken.status === 401, String(fotoSemToken.status));

  const fotoOk = await fetch(`${BASE}/api/arquivos/fichas-foto/${nomeFoto}`, { headers: auth });
  verificar('Dono da ficha acessa a própria foto (200)', fotoOk.status === 200, String(fotoOk.status));

  const fotoTraversal = await fetch(`${BASE}/api/arquivos/fichas-foto/..%2f..%2f..%2f.env`, { headers: auth });
  verificar('Foto com path traversal -> 400/404',
    fotoTraversal.status === 400 || fotoTraversal.status === 404, String(fotoTraversal.status));

  // Nome BEM FORMADO mas de outro usuário: a allow-list passa e quem
  // barra é a checagem de titularidade (403, igual à rota do PDF).
  const fotoDeOutro = await fetch(`${BASE}/api/arquivos/fichas-foto/${nomeDeOutroDono}`, { headers: auth });
  verificar('Foto de OUTRO usuário -> 403 (titularidade)',
    fotoDeOutro.status === 403, String(fotoDeOutro.status));

  // Nome genuinely fora do padrão aceito: reprovado já na allow-list.
  for (const nomeInvalido of ['ficha_foto.png', 'candidato_foto_1_1.png', 'foto.png', 'qualquer_coisa']) {
    const r = await fetch(`${BASE}/api/arquivos/fichas-foto/${nomeInvalido}`, { headers: auth });
    verificar(`Nome fora da allow-list bloqueado: ${nomeInvalido}`, r.status === 400, String(r.status));
  }

  const fotoCandidatos = await fetch(`${BASE}/api/arquivos/fichas-foto/candidato_foto_1_1.png`, { headers: authAdmin });
  verificar('Nome de candidato NÃO serve na rota de fotos da ficha -> 400',
    fotoCandidatos.status === 400, String(fotoCandidatos.status));

  // ---------- 5. Ficha sem foto: PDF continua gerado (legado) ----------
  await fetch(`${BASE}/api/fichas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ ...fichaBase, foto_3x4: null }),
  });
  const pdfSemFoto = await fetch(`${BASE}/api/arquivos/fichas/${usuarioId}`, { headers: authAdmin });
  verificar('PDF é gerado mesmo sem foto (regressão de fichas legadas)',
    pdfSemFoto.status === 200, String(pdfSemFoto.status));

  // ---------- 6. Limpeza ----------
  const { Ficha, Usuario, sequelize } = require('./src/models');
  await Ficha.destroy({ where: { usuario_id: usuarioId } });
  await Usuario.destroy({ where: { email } });
  const arquivosOrfaos = fs.existsSync(path.join(__dirname, 'uploads', 'fichas_foto'))
    ? fs.readdirSync(path.join(__dirname, 'uploads', 'fichas_foto')).filter((n) => n.includes(`_${usuarioId}_`))
    : [];
  for (const a of arquivosOrfaos) fs.unlinkSync(path.join(__dirname, 'uploads', 'fichas_foto', a));

  const sobras = await Usuario.count({ where: { email } });
  verificar('Limpeza do usuário/ficha de teste', sobras === 0, String(sobras));

  await sequelize.close();
  console.log('');
  console.log(`========== RESULTADO: ${ok} OK / ${falha} FALHAS ==========`);
  process.exit(falha > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Erro fatal no teste:', e);
  process.exit(1);
});
