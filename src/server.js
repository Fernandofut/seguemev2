// ============================================================
// 🚀 Segue-me V2 — Servidor Principal (Express)
// Ponto de entrada da aplicação: middlewares, rotas e startup
// ============================================================

const path = require('path');

// ⚠️ O dotenv DEVE ser carregado antes de qualquer módulo que leia
// process.env (ex.: config do banco). Caminho explícito para o .env
// na raiz do projeto: independe do diretório de execução (CWD).
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { sequelize, initDatabase, Usuario } = require('./models');
const { DataTypes } = require('sequelize');
const { aplicarMigracoes } = require('./migrations/migracoes');
const authRoutes = require('./routes/authRoutes');
const fichaRoutes = require('./routes/fichaRoutes');
const candidatoRoutes = require('./routes/candidatoRoutes');
const arquivosRoutes = require('./routes/arquivosRoutes');
const { descreverErro } = require('./utils/logSeguro');

const app = express();
const PORT = process.env.PORT || 3000;

// Referência ao servidor HTTP, atribuída no bootstrap() e usada pelo
// encerramento gracioso (SIGINT/SIGTERM) para parar de aceitar conexões.
let servidorHttp = null;
// Trava anti-reentrada: evita executar o shutdown duas vezes se mais de
// um sinal chegar durante o fechamento.
let encerrando = false;

// ------------------------------------------------------------
// 🧭 Trust proxy — obrigatório para o rate limiting por IP funcionar
// atrás de Nginx/Cloudflare/Heroku. O padrão é 1 (um proxy à frente),
// que é a topologia de produção. Ajuste pelo número de proxies reais
// via TRUST_PROXY no .env (ex.: TRUST_PROXY=2 com CDN + Nginx).
//
// ⚠️ Sem isso, req.ip é o IP do proxy: TODOS os usuários compartilham
// o mesmo bucket e o limite de login (10/15min) derruba o sistema.
// ⚠️ O valor só é seguro se o app estiver MESMO atrás de um proxy que
// sobrescreve X-Forwarded-For. Em exposição direta (sem proxy), um
// atacante forja o header e contorna o rate limiting de login — nesse
// caso defina TRUST_PROXY=0 para desligar.
// ------------------------------------------------------------
app.set('trust proxy', process.env.TRUST_PROXY || 1);

// ------------------------------------------------------------
// 🛡️ HELMET — cabeçalhos de hardening HTTP (BLOQUEADOR 4)
// ------------------------------------------------------------
// A política padrão do helmet (sem diretivas customizadas) seria
// letal para o frontend: o Tailwind é carregado do CDN e o painel
// admin abre arquivos via URL.createObjectURL (blob:). As diretivas
// abaixo liberam EXATAMENTE o necessário e mantêm o resto fechado.
//
// 'unsafe-eval' mantido temporariamente para suporte ao Tailwind Play CDN. Remover ao configurar build local de CSS.
// Motivo: cdn.tailwindcss.com compila o CSS em runtime com new Function.
// Para endurecer: gere o CSS localmente (ex.: Tailwind CLI -> public/css/tailwind.css)
// e remova 'unsafe-eval' e o host do CDN de scriptSrc.
const CSP = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  scriptSrc: ["'self'", "https://cdn.tailwindcss.com", "'unsafe-eval'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  // 'blob:' é obrigatório: o painel admin exibe/baixa os arquivos
  // protegidos convertidos em Blob (URL.createObjectURL).
  imgSrc: ["'self'", 'data:', 'blob:'],
  fontSrc: ["'self'", 'data:'],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
  // Não forçar HTTPS no ambiente local (http://localhost:3000)
  upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
};

app.use(
  helmet({
    contentSecurityPolicy: { useDefaults: true, directives: CSP },
    // Upload/download autenticado não deve ser embeddado por terceiros
    crossOriginEmbedderPolicy: false,
    // Permite que o painel abra o PDF/imagem em nova aba sem quebrar
    // o isolamento de origem para os demais recursos.
    referrerPolicy: { policy: 'no-referrer' },
  })
);

// ------------------------------------------------------------
// CORS — origem única, definida no .env (FRONTEND_URL)
// ⚠️ Fallback '*' mantém o desenvolvimento local funcionando, mas
// em PRODUÇÃO a variável OBRIGATORIAMENTE deve ser a URL real do
// frontend; com '*' qualquer site poderia consumir a API autenticada.
// ------------------------------------------------------------
const ORIGEM_CORS = process.env.FRONTEND_URL || '*';

if (process.env.NODE_ENV === 'production' && ORIGEM_CORS === '*') {
  console.warn(
    '⚠️  [CORS] FRONTEND_URL não definida e NODE_ENV=production — CORS liberado para "*". Defina FRONTEND_URL no .env.'
  );
}

// exposedHeaders: garante que o frontend consiga ler o nome do arquivo
// (Content-Disposition) ao baixar PDF/fotos programaticamente via fetch+Blob.
// Sem isso, o navegador esconde o header em requisições cross-origin e o
// download fica sem nome amigável.
const CABECALHOS_EXPOSTOS = ['Content-Disposition'];

const opcoesCors =
  ORIGEM_CORS === '*'
    ? { origin: ORIGEM_CORS, exposedHeaders: CABECALHOS_EXPOSTOS }
    : {
        origin: ORIGEM_CORS.split(',').map((o) => o.trim()).filter(Boolean),
        credentials: true,
        exposedHeaders: CABECALHOS_EXPOSTOS,
      };

app.use(cors(opcoesCors));

// 🏷️ Vary: Origin — sinaliza a caches/proxies que a resposta varia
// conforme a origem da requisição. Evita que uma resposta liberada para
// uma origem seja reaproveitada (cacheada) indevidamente para outra.
// (O pacote cors já o define quando a origem é dinâmica; aqui garantimos
// de forma explícita e normalizada para TODOS os casos.)
app.use((req, res, next) => {
  const atual = res.getHeader('Vary');
  const valores = String(atual || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (!valores.includes('origin')) {
    res.setHeader('Vary', atual ? `${atual}, Origin` : 'Origin');
  }
  next();
});

// Payload elevado (50mb) para prepararmos o envio/recebimento de
// PDFs (ex.: base64) nas próximas etapas do projeto.
app.use(express.json({ limit: '50mb' }));

// 🖥️ Frontend estático (Tailwind via CDN) — Etapa 6
// ⚠️ Serve APENAS a pasta public/. As pastas de uploads NÃO são
// expostas aqui: contêm PII (fotos 3x4, assinaturas e fichas com
// dados sensíveis) e só podem ser acessadas via /api/arquivos
// (verificarToken + isAdmin) — ver LGPD.
app.use(
  express.static(path.resolve(__dirname, '..', 'public'), {
    dotfiles: 'deny',
    index: 'index.html',
  })
);

// ------------------------------------------------------------
// Rotas
// ------------------------------------------------------------

// ❤️ Health check — monitoramento do serviço e validação de deploy
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'Segue-me V2' });
});

// 🔐 Autenticação (RF01): login e registro de usuários
app.use('/api/auth', authRoutes);

// 📝 Fichas de inscrição (RF02/RF03): salvar (auth) e listar (admin)
app.use('/api/fichas', fichaRoutes);

// 🧑‍🎓 Inscrição de candidatos (fluxo separado da ficha de equipes):
// rota PÚBLICA (sem JWT) com upload de foto/assinatura via multer
app.use('/api/candidatos', candidatoRoutes);

// 🔒 Entrega AUTENTICADA dos arquivos de PII (BLOQUEADOR 1 — LGPD)
// ------------------------------------------------------------
// ⚠️ REMOVIDO (vazamento de dados pessoais — qualquer pessoa,
// sem login, baixava as fichas e as fotos/assinaturas):
//   app.use('/downloads',                    express.static(.../uploads/fichas_pdf));
//   app.use('/uploads/fichas_pdf',          express.static(.../uploads/fichas_pdf));
//   app.use('/uploads/candidatos_img',      express.static(.../uploads/candidatos_img));
//
// AGORA: uploads/fichas_pdf e uploads/candidatos_img são servidos
// apenas por /api/arquivos, que exige JWT (verificarToken) e, nos
// arquivos confidenciais, perfil admin (isAdmin). Os downloads usam
// res.download() — sem cache público, sem indexação, com o arquivo
// entregue com no-store.
app.use('/api/arquivos', arquivosRoutes);

// ------------------------------------------------------------
// 🧯 Tratamento de erros global (rede de segurança) — garante que
// NENHUMA falha inesperada devolva HTML/stack do Express: toda rota
// de API responde SEMPRE em JSON, sem quebrar o fluxo do cliente.
// ------------------------------------------------------------

// 404 — rota de API desconhecida (as rotas estáticas já foram tentadas antes)
app.use('/api', (req, res) => {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
});

// Middleware final de erro (4 argumentos). Cobre, entre outros:
//   • body-parser: JSON malformado (400) e payload acima do limite (413);
//   • erros síncronos/assíncronos não tratados nas rotas (500).
// Nunca expõe stack trace ou detalhes internos ao cliente.
app.use((erro, req, res, next) => {
  const tipo = erro.type || erro.code;

  if (tipo === 'entity.too.large') {
    return res.status(413).json({ erro: 'Requisição muito grande. Reduza o tamanho do envio.' });
  }
  if (tipo === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'Corpo da requisição em JSON inválido.' });
  }

  console.error('❌ [SERVER] Erro não tratado em', `${req.method} ${req.originalUrl}:`, descreverErro(erro));
  if (res.headersSent) return next(erro);
  return res.status(500).json({ erro: 'Erro interno do servidor.' });
});

// ------------------------------------------------------------
// 🌱 Seed: garante a existência de um usuário Admin padrão (Etapa 3)
// Cria o admin APENAS se não existir nenhum usuário com role 'admin'
// (rotina idempotente — segura em múltiplas reinicializações)
// ------------------------------------------------------------
// 🔒 BLOQUEADOR 2 — BACKDOOR DE CREDENCIAL: a senha padrão do admin é
// pública no repositório. Se o seed rodar em produção, qualquer um poderia
// autenticar como admin. A criação é BLOQUEADA quando NODE_ENV=production;
// em produção o admin é provisionado manualmente.
// A senha NÃO fica mais hardcoded aqui — vem do ambiente
// (ADMIN_PADRAO_SENHA), com o valor padrão apenas para o dev local.
// ------------------------------------------------------------------
const ADMIN_PADRAO = {
  email: 'admin@segueme.com.br',
  role: 'admin',
};

async function seedAdminPadrao() {
  const adminExistente = await Usuario.findOne({
    where: { role: ADMIN_PADRAO.role },
  });

  if (adminExistente) {
    console.log(`👤 [SEED] Admin já existente (${adminExistente.email}) — seed ignorado.`);
    return;
  }

  // Trava de segurança: jamais criar credencial padrão em produção
  if (process.env.NODE_ENV === 'production') {
    console.log('──────────────────────────────────────────────');
    console.log('🔒 [SEED] NODE_ENV=production — criação do Admin padrão BLOQUEADA.');
    console.log('   Crie o administrador manualmente (veja README) ou defina as credenciais via ambiente.');
    console.log('──────────────────────────────────────────────');
    return;
  }

  // Senha lida do ambiente — fallback apenas para desenvolvimento local
  const senhaAdmin = process.env.ADMIN_PADRAO_SENHA || 'admin123';

  // O hook beforeCreate do model aplica o hash bcrypt automaticamente
  await Usuario.create({ ...ADMIN_PADRAO, senha: senhaAdmin });

  console.log('──────────────────────────────────────────────');
  console.log('🌱 [SEED] Usuário Admin padrão criado com sucesso!');
  console.log(`📧 [SEED] E-mail: ${ADMIN_PADRAO.email}`);
  // 🔒 A senha NÃO é impressa em log (evita vazamento de credencial).
  console.log('🔑 [SEED] Senha: definida via ADMIN_PADRAO_SENHA (.env) — não exibida por segurança.');
  console.log('──────────────────────────────────────────────');
}

// ------------------------------------------------------------
// Inicialização: banco primeiro, servidor HTTP depois
// ------------------------------------------------------------
async function bootstrap() {
  try {
    console.log('⚙️  [SERVER] Inicializando o Segue-me V2...');

    // 1) Valida a conexão com o banco de dados
    await initDatabase();

    // 2) Sincroniza os models com o banco (cria tabelas faltantes)
    await sequelize.sync();
    console.log('✅ [DATABASE] Modelos sincronizados com o banco de dados.');

    // 2.1) Migração leve: sync() NÃO adiciona colunas novas em tabelas
    // existentes — garante foto_url/assinatura_url em 'fichas' (idempotente)
    const queryInterface = sequelize.getQueryInterface();
    const colunasFichas = await queryInterface.describeTable('fichas');
    for (const coluna of ['foto_url', 'assinatura_url']) {
      if (!colunasFichas[coluna]) {
        await queryInterface.addColumn('fichas', coluna, {
          type: DataTypes.STRING(255),
          allowNull: true,
        });
        console.log(`🧱 [DATABASE] Coluna adicionada em 'fichas': ${coluna}`);
      }
    }

    // 2.1) Migrações incrementais: o sync() NÃO adiciona colunas a
    //     tabelas já existentes — sem esta etapa, um model novo
    //     quebra o INSERT com "no such column".
    const colunasNovas = await aplicarMigracoes();
    if (colunasNovas.length > 0) {
      console.log(`✅ [MIGRATION] ${colunasNovas.length} coluna(s) adicionada(s): ${colunasNovas.join(', ')}`);
    } else {
      console.log('✅ [MIGRATION] Schema atualizado — nenhuma coluna nova a aplicar.');
    }

    // 3) Seed: garante o usuário Admin padrão
    //    🔒 Só em desenvolvimento — em produção a credencial padrão
    //    é bloqueada dentro de seedAdminPadrao() (BLOQUEADOR 2).
    if (process.env.NODE_ENV !== 'production') {
      await seedAdminPadrao();
    } else {
      console.log('🔒 [SEED] NODE_ENV=production — seed do Admin padrão desativado.');
    }

    // 4) Sobe o servidor HTTP
    servidorHttp = app.listen(PORT, () => {
      console.log('──────────────────────────────────────────────');
      console.log('🚀 [SERVER] Segue-me V2 está no ar!');
      console.log(`🟢 [SERVER] Escutando em:  http://localhost:${PORT}`);
      console.log(`❤️  [SERVER] Health check:  http://localhost:${PORT}/api/health`);
      console.log('──────────────────────────────────────────────');
    });

    // Erros de escuta (ex.: porta já em uso)
    servidorHttp.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ [SERVER] A porta ${PORT} já está em uso. Encerre o processo que a ocupa ou altere o PORT no .env.`);
      } else {
        console.error('❌ [SERVER] Erro no servidor HTTP:', error.message);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ [SERVER] Falha crítica durante a inicialização:', error.message);
    console.error('🛑 [SERVER] Encerrando o processo...');
    process.exit(1);
  }
}

// ------------------------------------------------------------
// 🛑 Encerramento gracioso (SIGINT / SIGTERM)
// Ordem correta para não abortar requisições em andamento:
//   1. para de aceitar NOVAS conexões (server.close());
//   2. aguarda as requisições EM ANDAMENTO terminarem;
//   3. fecha a conexão com o banco (sequelize.close());
//   4. encerra o processo.
// Um timeout de segurança força a saída caso algo trave, para que o
// orquestrador (PM2/Docker/systemd) não fique preso num stop pendurado.
// ------------------------------------------------------------
const TIMEOUT_SHUTDOWN_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000;

async function encerrarServidor(sinal) {
  if (encerrando) return;
  encerrando = true;

  console.log(`\n🛑 [SERVER] Sinal ${sinal} recebido — iniciando encerramento gracioso...`);

  // Failsafe: se o fechamento travar, sai à força dentro do limite
  const forcado = setTimeout(() => {
    console.error(`⏱️  [SERVER] Tempo limite de ${TIMEOUT_SHUTDOWN_MS}ms excedido — encerrando à força.`);
    process.exit(1);
  }, TIMEOUT_SHUTDOWN_MS);
  forcado.unref();

  try {
    // 1 + 2) Para de aceitar novas conexões e aguarda as em andamento
    if (servidorHttp) {
      await new Promise((resolve) => {
        servidorHttp.close((erro) => {
          if (erro) console.error('❌ [SERVER] Erro ao fechar o servidor HTTP:', erro.message);
          else console.log('✅ [SERVER] Servidor HTTP fechado — nenhuma requisição pendente.');
          resolve();
        });
      });
    }

    // 3) Fecha a conexão com o banco
    await sequelize.close();
    console.log('✅ [DATABASE] Conexão encerrada com sucesso.');

    clearTimeout(forcado);
    process.exit(0);
  } catch (error) {
    console.error('❌ [SERVER] Erro durante o encerramento:', error.message);
    clearTimeout(forcado);
    process.exit(1);
  }
}

process.on('SIGINT', () => encerrarServidor('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => encerrarServidor('SIGTERM')); // Docker/PM2/systemd

// 🧯 Rede de segurança (auditoria QA): registra rejeições de promessa
// sem tratamento — loga com contexto e mantém o serviço no ar.
process.on('unhandledRejection', (reason) => {
  console.error('🧯 [SERVER] Promise rejeitada sem tratamento:', descreverErro(reason));
});

bootstrap();

// Exporta o app para facilitar testes automatizados futuros (supertest)
module.exports = app;
