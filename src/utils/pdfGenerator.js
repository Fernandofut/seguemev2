// ============================================================
// 📄 Segue-me V2 — Gerador de PDF da Ficha (RN04)
// Renderiza a ficha em PDF (pdfkit) com a foto 3x4 no cabeçalho
// e o termo de assinatura no rodapé, a partir de uma instância
// JÁ PERSISTIDA no Sequelize.
// ============================================================

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { caminhoAnexoFicha } = require('./anexosFicha');

// Caminho ABSOLUTO da pasta de PDFs, resolvido a partir da raiz do
// projeto — independe do diretório de onde o Node foi iniciado (CWD).
const PASTA_PDFS = path.resolve(__dirname, '..', '..', 'uploads', 'fichas_pdf');

// 🖼️ Logo institucional usada no topo da primeira página do PDF.
// Arquivo servido também em /logo-segueme.png (public/).
const CAMINHO_LOGO = path.join(__dirname, '..', '..', 'public', 'logo-segueme.png');
const LARGURA_LOGO = 130;
const ALTURA_LOGO = 70;

/**
 * Campos da ficha exibidos no PDF, em ordem, com rótulo legível.
 */
const CAMPOS_PDF = [
  ['nome', 'Nome'],
  ['data_nascimento', 'Data de Nascimento'],
  ['telefone', 'Telefone'],
  ['endereco', 'Endereço'],
  ['paroquia_encontro', 'Paróquia do Encontro'],
  ['ano_encontro', 'Ano do Encontro'],
  ['contato_emergencia', 'Contato de Emergência'],
  ['tamanho_camiseta', 'Tamanho da Camiseta'],
  ['sacramentos', 'Sacramentos'],
  ['segues_trabalhados', 'Segues Trabalhados'],
  ['equipes_trabalhadas', 'Equipes Trabalhadas'],
  ['ultima_equipe_servida', 'Última Equipe Servida'],
  ['ano_que_fez_segueme', 'Ano em que fez o Segue-me'],
  ['equipe_que_trabalhou', 'Equipe em que trabalhou'],
  ['participou_ed', 'Já participou da Equipe de Dirigentes (ED)'],
  ['cargo_pasta_ed', 'Cargo / pasta na Equipe de Dirigentes (ED)'],
  ['serviu_lideranca', 'Já serviu liderança na igreja'],
  ['lideranca_igreja', 'Qual liderança na igreja'],
  ['vontade_lideranca', 'Vontade de servir liderança'],
  ['possui_instrumento', 'Toca instrumento'],
  ['toca_instrumento', 'Qual instrumento'],
  ['canta', 'Canta'],
  ['quer_dar_palestra', 'Quer dar palestra'],
  ['tem_alergias', 'Tem alergias ou restrições'],
  ['alergias_restricoes', 'Descrição das alergias / restrições'],
  ['nome_conjuge', 'Nome do cônjuge'],
  ['idade_conjuge', 'Idade do cônjuge'],
  ['telefone_conjuge', 'Telefone do cônjuge'],
  ['origem_movimento', 'Origem no movimento (ECC / Jovens Segue-me)'],
  ['tem_filhos', 'Tem filhos'],
  ['qtd_filhos', 'Quantos filhos'],
  ['meio_transporte', 'Meio de transporte'],
];

/**
 * Formata um valor de ficha para exibição no PDF.
 * Booleans viram "Sim"/"Não"; arrays/objetos viram texto; vazio vira "—".
 */
function formatarValor(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (Array.isArray(valor)) return valor.length ? valor.join(', ') : '—';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

/**
 * Desenha a logo institucional centralizada no topo da página atual.
 *
 * ⚠️ Robustez: se o arquivo não existir ou não puder ser decodificado,
 * NÃO derruba a geração do PDF — apenas retorna false e segue o fluxo.
 *
 * @param {import('pdfkit').PDFDocument} doc
 * @returns {boolean} true se a logo foi efetivamente desenhada
 */
function desenharLogo(doc) {
  if (!fs.existsSync(CAMINHO_LOGO)) return false;

  const margemEsq = doc.page.margins.left;
  const larguraUtil = doc.page.width - margemEsq - doc.page.margins.right;
  const x = margemEsq + (larguraUtil - LARGURA_LOGO) / 2;
  const y = doc.y;

  try {
    // fit: preserva a proporção real da imagem dentro da caixa (não distorce)
    doc.image(CAMINHO_LOGO, x, y, {
      fit: [LARGURA_LOGO, ALTURA_LOGO],
      align: 'center',
      valign: 'center',
    });
    doc.y = y + ALTURA_LOGO;
    return true;
  } catch (erro) {
    console.warn(`⚠️ [FICHA] Logo não pôde ser desenhada no PDF: ${erro.message}`);
    doc.y = y;
    return false;
  }
}

// ------------------------------------------------------------
// 📸 Bloco de cabeçalho do PDF — a foto 3x4 é desenhada como
// IMAGEM no alto da página, à direita dos dados de identificação.
// Por isso NÃO entra em CAMPOS_PDF: ali viraria uma linha de
// texto com o nome do arquivo, que não interessa à coordenação.
// Dimensões em pontos PDF, na proporção 3x4 (0,75).
// ------------------------------------------------------------
const LARGURA_FOTO = 90;
const ALTURA_FOTO = 120;
const ESPACO_FOTO = 16;

/** Campos exibidos na coluna esquerda, ao lado da foto. */
const CAMPOS_CABECALHO = ['nome', 'data_nascimento', 'telefone', 'endereco', 'contato_emergencia'];

// ------------------------------------------------------------
// ✍️ Bloco de assinatura — desenhado no RODAPÉ do PDF como termo
// de concordância/responsabilidade. Proporção de uma assinatura
// manuscrita: larga e baixa (180x70 pt).
// ------------------------------------------------------------
const LARGURA_ASSINATURA = 180;
const ALTURA_ASSINATURA = 70;

/**
 * Desenha um anexo de imagem no PDF, com moldura e rótulo.
 *
 * Genérica de propósito: serve para a foto 3x4 (cabeçalho) e para a
 * assinatura (rodapé). Os dois fluxos compartilham as mesmas garantias.
 *
 * ⚠️ Robustez: arquivo ausente, corrompido ou em formato que o pdfkit
 * não decodifica (ex.: WEBP/HEIC renomeado para .jpg) NÃO podem
 * derrubar a geração do PDF — cai no placeholder.
 *
 * @param {import('pdfkit').PDFDocument} doc
 * @param {string|null} caminhoImagem caminho absoluto já validado
 * @param {object} opcoes
 * @param {number} opcoes.x  coordenada X do canto superior esquerdo
 * @param {number} opcoes.y  coordenada Y do canto superior esquerdo
 * @param {number} opcoes.largura
 * @param {number} opcoes.altura
 * @param {string} opcoes.rotulo texto do placeholder quando ausente
 * @param {string} [opcoes.titulo] texto opcional acima da moldura
 * @returns {boolean} true se a imagem foi efetivamente desenhada
 */
function desenharAnexo(doc, caminhoImagem, { x, y, largura, altura, rotulo, titulo }) {
  let topo = y;

  if (titulo) {
    doc.fontSize(8).fillColor('#6b7280').text(titulo.toUpperCase(), x, topo, { width: largura });
    topo = doc.y + 2;
  }

  if (!caminhoImagem) {
    doc.save();
    doc
      .roundedRect(x, topo, largura, altura, 4)
      .lineWidth(1)
      .dash(2, { space: 2 })
      .strokeColor('#cbd5e1')
      .stroke();
    doc.undash();
    doc.restore();
    doc
      .fontSize(8)
      .fillColor('#94a3b8')
      .text(rotulo, x, topo + altura / 2 - 4, { width: largura, align: 'center' });
    return false;
  }

  try {
    // fit: preserva a proporção real dentro da caixa (não distorce)
    doc.image(caminhoImagem, x, topo, {
      fit: [largura, altura],
      align: 'center',
      valign: 'center',
    });
    return true;
  } catch (erro) {
    console.warn(
      `⚠️ [FICHA] Imagem ilegível no PDF (${path.basename(caminhoImagem)}): ${erro.message}`
    );
    return desenharAnexo(doc, null, { x, y, largura, altura, rotulo });
  }
}

/**
 * Desenha a assinatura no rodapé do PDF: moldura, linha de assinatura
 * e o nome do titular, funcionando como termo de concordância.
 *
 * @returns {boolean} true se a assinatura foi desenhada
 */
function desenharAssinatura(doc, caminhoAssinatura, nomeTitular) {
  const margemEsq = doc.page.margins.left;
  const margemDir = doc.page.margins.right;
  const larguraUtil = doc.page.width - margemEsq - margemDir;

  // Linha divisória separando o corpo do termo de assinaturas
  const baseY = doc.y;
  doc
    .moveTo(margemEsq, baseY)
    .lineTo(margemEsq + larguraUtil, baseY)
    .lineWidth(1)
    .strokeColor('#d1d5e1')
    .stroke();

  doc.moveDown(1);

  const x = margemEsq;
  const y = doc.y;

  const ok = desenharAnexo(doc, caminhoAssinatura, {
    x,
    y,
    largura: LARGURA_ASSINATURA,
    altura: ALTURA_ASSINATURA,
    rotulo: 'Sem assinatura',
    titulo: 'Assinatura do participante',
  });

  // Linha + nome sob a imagem (ou sob o placeholder)
  const baseAssinatura = y + 6 + ALTURA_ASSINATURA + 10;
  doc
    .moveTo(x, baseAssinatura)
    .lineTo(x + LARGURA_ASSINATURA, baseAssinatura)
    .lineWidth(0.5)
    .strokeColor('#94a3b8')
    .stroke();
  doc
    .fontSize(9)
    .fillColor('#111827')
    .text(formatarValor(nomeTitular), x, baseAssinatura + 4, {
      width: LARGURA_ASSINATURA,
      align: 'center',
    });

  // Texto de concordância à direita da assinatura
  const xTexto = x + LARGURA_ASSINATURA + 24;
  const larguraTexto = Math.max(180, larguraUtil - LARGURA_ASSINATURA - 24);
  doc
    .fontSize(8)
    .fillColor('#6b7280')
    .text(
      'Declaro que as informações acima são verdadeiras e me responsabilizo ' +
        'pela veracidade dos dados, bem como pelo cumprimento das normas ' +
        'do encontro. Este documento serve como termo de concordância.',
      xTexto,
      y + 6,
      { width: larguraTexto, lineGap: 2 }
    );

  // Cursor abaixo do bloco de assinatura
  doc.x = margemEsq;
  doc.y = Math.max(doc.y, baseAssinatura + 26) + 8;

  return ok;
}

/**
 * Gera o PDF da ficha em memória (pdfkit) e grava em
 * uploads/fichas_pdf/ficha_usuario_[usuario_id].pdf
 * ⚠️ RN04: recebe a instância JÁ PERSISTIDA no Sequelize.
 * @returns {Promise<string>} caminho absoluto do PDF gerado
 */
function gerarPDF(ficha, emailUsuario) {
  return new Promise((resolve, reject) => {
    // Garante que o diretório de destino exista (idempotente)
    fs.mkdirSync(PASTA_PDFS, { recursive: true });

    const caminhoArquivo = path.join(PASTA_PDFS, `ficha_usuario_${ficha.usuario_id}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(caminhoArquivo);

    doc.pipe(stream);

    // ---- 🖼️ Logo institucional (topo da primeira página) ----
    desenharLogo(doc);
    doc.moveDown(0.5);

    // ---- Cabeçalho ----
    doc.fontSize(22).fillColor('#1e3a8a').text('Ficha Segue-me', { align: 'center' });
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .fillColor('#6b7280')
      .text(`E-mail do usuário: ${emailUsuario}  |  Usuário ID: ${ficha.usuario_id}`, {
        align: 'center',
      });
    doc
      .fontSize(9)
      .text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
    doc.moveDown(1);

    // ---- Linha divisória ----
    const margemEsq = doc.page.margins.left;
    const margemDir = doc.page.margins.right;
    const larguraUtil = doc.page.width - margemEsq - margemDir;
    doc
      .moveTo(margemEsq, doc.y)
      .lineTo(margemEsq + larguraUtil, doc.y)
      .lineWidth(1)
      .strokeColor('#d1d5db')
      .stroke();
    doc.moveDown(1);

    // ---- 📸 Identificação (coluna esquerda) + FOTO 3x4 (direita) ----
    const topo = doc.y;
    const larguraTexto = Math.max(200, larguraUtil - LARGURA_FOTO - ESPACO_FOTO);

    for (const [campo, rotulo] of CAMPOS_PDF) {
      if (!CAMPOS_CABECALHO.includes(campo)) continue;
      doc
        .fontSize(9)
        .fillColor('#6b7280')
        .text(rotulo.toUpperCase(), margemEsq, doc.y, { width: larguraTexto });
      doc
        .fontSize(11)
        .fillColor('#111827')
        .text(formatarValor(ficha[campo]), margemEsq, doc.y, {
          width: larguraTexto,
          paragraphGap: 6,
        });
    }
    const fimColunaTexto = doc.y;

    // A foto parte do mesmo topo, encostada na margem direita
    doc.x = margemEsq;
    doc.y = topo;
    const fotoOk = desenharAnexo(
      doc,
      caminhoAnexoFicha(ficha.foto_3x4, 'foto'),
      {
        x: doc.page.width - margemDir - LARGURA_FOTO,
        y: topo,
        largura: LARGURA_FOTO,
        altura: ALTURA_FOTO,
        rotulo: 'Sem foto',
      }
    );

    // Cursor abaixo do maior dos dois blocos
    doc.x = margemEsq;
    doc.y = Math.max(fimColunaTexto, topo + ALTURA_FOTO + 8) + 12;

    // ---- Demais dados da ficha (largura total) ----
    for (const [campo, rotulo] of CAMPOS_PDF) {
      if (CAMPOS_CABECALHO.includes(campo)) continue;
      doc
        .fontSize(9)
        .fillColor('#6b7280')
        .text(rotulo.toUpperCase(), margemEsq, doc.y, { width: larguraUtil });
      doc
        .fontSize(11)
        .fillColor('#111827')
        .text(formatarValor(ficha[campo]), margemEsq, doc.y, { width: larguraUtil, paragraphGap: 8 });
    }

    if (!fotoOk && ficha.foto_3x4) {
      doc
        .fontSize(8)
        .fillColor('#b45309')
        .text('Atenção: a foto 3x4 enviada não pôde ser lida pelo gerador de PDF.', margemEsq, doc.y + 6, {
          width: larguraUtil,
        });
    }

    // ---- ✍️ RODAPÉ: termo de concordância com a assinatura ----
    // ⚠️ addPage: se o corpo da ficha já encheu a página, o rodapé
    // cairia fora da área imprimível. Garantimos a página nova ANTES
    // de desenhar, senão a assinatura seria cortada no papel.
    if (doc.y + ALTURA_ASSINATURA + 80 > doc.page.height - margemDir) {
      doc.addPage();
    }

    doc.moveDown(1);
    const assinaturaOk = desenharAssinatura(
      doc,
      caminhoAnexoFicha(ficha.assinatura, 'assinatura'),
      ficha.nome
    );

    if (!assinaturaOk && ficha.assinatura) {
      doc
        .fontSize(8)
        .fillColor('#b45309')
        .text('Atenção: a assinatura enviada não pôde ser lida pelo gerador de PDF.', margemEsq, doc.y, {
          width: larguraUtil,
        });
    }

    // ---- Nota de rodapé do documento ----
    doc.moveDown(1);
    doc
      .fontSize(8)
      .fillColor('#9ca3af')
      .text('Documento gerado automaticamente pelo sistema Segue-me V2 (backend).', {
        align: 'center',
      });

    doc.end();

    stream.on('finish', () => resolve(caminhoArquivo));
    stream.on('error', reject);
    doc.on('error', reject);
  });
}

module.exports = {
  PASTA_PDFS,
  CAMPOS_PDF,
  gerarPDF,
};
