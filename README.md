# 📖 Segue-me V2

Sistema web de cadastro de **jovens** e **tio(a)s** para **encontros de jovens**, com autenticação de usuários, preenchimento de fichas de inscrição e geração de PDF das fichas no backend.

> **Status:** 🚧 Em construção — **Etapa 1 (fundação)** e **Etapa 2 (servidor + banco)** concluídas. Modelos, rotas e telas serão implementados nas próximas etapas.

---

## 🎯 Objetivo

Digitalizar e organizar o processo de inscrição em encontros de jovens, substituindo fichas de papel por um sistema web que permite:

- Cadastro e autenticação de participantes (jovens) e acompanhantes (tio(a)s);
- Preenchimento padronizado da ficha de inscrição;
- Emissão e arquivamento da ficha em **PDF gerado no backend**;
- Administração centralizada dos inscritos pela equipe organizadora.

---

## ✅ Requisitos Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| **RF01** | Login / Autenticação | O usuário (Jovem, Tio ou Admin) deve autenticar-se com credenciais próprias (e-mail + senha) para acessar o sistema. Sessões/tokens devem identificar o perfil do usuário. |
| **RF02** | Cadastro de Ficha | O usuário deve poder preencher e salvar a ficha de inscrição do encontro (dados pessoais, contato, saúde/restrições, autorizações e dados do encontro), com possibilidade de edição enquanto a inscrição estiver aberta. |
| **RF03** | Geração de PDF (Backend) | O sistema deve gerar a **ficha em PDF no servidor**, a partir dos dados da ficha cadastrada, armazenando o arquivo em `uploads/fichas_pdf` e disponibilizando o download ao usuário autorizado. |

---

## 📜 Regras de Negócio (base)

### Tipos de usuários (perfis)

| Perfil | Descrição | Capacidades (base) |
|--------|-----------|--------------------|
| **Jovem** | Participante do encontro | Criar/editar a própria ficha; gerar/baixar o próprio PDF; acompanhar o status da inscrição. |
| **Tio(a)** | Acompanhante/liderança responsável por um grupo de jovens | Além das capacidades do Jovem: visualizar as fichas dos jovens do seu grupo e acompanhar pendências. |
| **Admin** | Equipe organizadora do encontro | Acesso administrativo: gerenciar usuários, aprovar/alterar status de fichas, gerar/exportar PDFs de todas as fichas e configurações do encontro. |

### Regras gerais

- **RN01** — Todo usuário possui exatamente **um** perfil (`jovem`, `tio`, `admin`), definido no cadastro e alterável apenas por um Admin.
- **RN02** — Apenas usuários autenticados acessam qualquer funcionalidade (não há área pública além do login).
- **RN03** — Cada usuário pode possuir **uma ficha por encontro** (unicidade usuário × encontro).
- **RN04** — O PDF da ficha é gerado **exclusivamente no backend**, a partir dos dados persistidos no banco — nunca a partir de conteúdo enviado pelo cliente — garantindo a integridade do documento.
- **RN05** — Um usuário só pode visualizar/baixar PDFs de fichas às quais seu perfil dá acesso (Jovem: a própria; Tio: do seu grupo; Admin: todas).
- **RN06** — Fichas com dados obrigatórios incompletos não podem ser finalizadas nem geram PDF definitivo.

> ⚠️ Estas regras são a base inicial e poderão ser refinadas junto à coordenação do encontro durante o desenvolvimento.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia | Versão | Função |
|--------|-----------|--------|--------|
| Runtime | **Node.js** | ≥ 18 | Ambiente de execução do backend |
| Framework web | **Express** | 5.x | API e servidor de arquivos estáticos |
| ORM | **Sequelize** | 6.x | Modelagem e acesso ao banco de dados |
| Banco de dados | **SQLite 3** | 6.x (driver) | Persistência local, sem servidor externo |
| Frontend | **HTML + Tailwind CSS** | — | Interface web servida a partir de `public/` |
| Autenticação | (a definir: JWT ou sessões) | — | RF01 — Login |
| Geração de PDF | (a definir: pdfkit / puppeteer) | — | RF03 — Fichas em PDF |
| Dev | **Nodemon** | 3.x | Auto-restart do servidor em desenvolvimento |
| Config | **dotenv** | 17.x | Variáveis de ambiente (`.env`) |
| Integrações | **cors** | 2.x | Controle de acesso entre origens |
| Segurança | **helmet** | 8.x | Cabeçalhos HTTP de hardening + Content Security Policy |
| Segurança | **express-rate-limit** | 8.x | Limitação de tentativas de login (anti-força-bruta) |

---

## 🔒 Segurança (hardening de produção)

Os quatro bloqueadores apontados na auditoria QA foram corrigidos.

### 1. CORS e Helmet (`src/server.js`)

- `app.use(helmet())` no início da cadeia de middlewares.
- CORS restrito à origem de `FRONTEND_URL` (aceita lista separada por vírgula).
  Sem a variável, o CORS cai para `*` **e emite aviso** quando `NODE_ENV=production`.
- CSP configurada para permitir o Tailwind CDN e `blob:` (necessário ao painel
  admin, que abre os arquivos protegidos via `URL.createObjectURL`).

> ⚠️ `'unsafe-eval'` está em `script-src` porque o **Tailwind Play CDN**
> compila o CSS em runtime. Para endurecer, gere o CSS localmente
> (Tailwind CLI → `public/css/tailwind.css`), remova o CDN e o `'unsafe-eval'`.

### 2. Rate limiting (`src/routes/authRoutes.js`)

Aplicado **somente** em `POST /login`: **10 tentativas por IP a cada 15 minutos**
(excedente → `429`). Registro, listagens e uploads não são limitados.

Em produção atrás de proxy reverso, defina `TRUST_PROXY` no `.env` — sem isso
todos os usuários compartilham o IP do proxy e o limite dispara por engano.

| Variável | Padrão | Função |
|----------|--------|--------|
| `LOGIN_RATE_LIMIT_MAX` | `10` | Tentativas por janela |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Tamanho da janela |

### 3. Backdoor de credencial padrão (`src/server.js`)

O seed criava `admin@segueme.com.br / admin123` em **todas** as execuções.
Agora a criação é duplamente bloqueada quando `NODE_ENV=production`
(guarda na chamada + trava dentro de `seedAdminPadrao()`).

**Como criar o admin em produção** (sem a credencial padrão):

```bash
NODE_ENV=production node -e "
const { Usuario } = require('./src/models');
Usuario.create({ nome:'Coordenacao', email:'admin@seudominio.com', senha:'<SENHA_FORTE>', role:'admin' })
  .then(() => { console.log('admin criado'); process.exit(0); });
"
```

### 4. Vazamento de PII / LGPD — arquivos protegidos

**Antes:** `uploads/fichas_pdf` e `uploads/candidatos_img` eram servidos por
`express.static`. Qualquer pessoa — sem login — baixava fichas com dados de
contato e de contato de emergência, fotos 3x4 e assinaturas de candidatos
(muitos menores de idade).

**Agora:** as três rotas estáticas foram removidas. Os arquivos saem apenas por:

| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `GET` | `/api/arquivos/fichas/:usuarioId` | `verificarToken` (dono ou admin) | PDF da ficha. O cliente envia **só o id**; o nome do arquivo é derivado no servidor |
| `GET` | `/api/arquivos/candidatos/:arquivo` | `verificarToken` + `isAdmin` | Foto 3x4 / assinatura dos candidatos |

Travas de segurança na rota (`src/routes/arquivosRoutes.js`):

- `path.basename()` + allow-list de nomenclatura
  (`^candidato_(foto|assinatura)_\d+_\d+\.(jpg|png)$`) — bloqueia path traversal;
- conferência de que o caminho resolvido está **dentro** da pasta base;
- `Cache-Control: no-store` e `X-Robots-Tag: noindex` — sem cache de proxy
  nem indexação de PII;
- nome de download derivado no servidor (nunca do input do cliente).

**No painel admin** os botões de PDF/foto/assinatura viraram `<button>` que
chamam `downloadArquivo(url)` (`public/js/admin.js`): `fetch` com
`Authorization: Bearer <token>` → `Blob` → `URL.createObjectURL` → nova aba ou
download. Não há mais `<a href>` para `/uploads/*`, e o token nunca vai para a
URL.

> Compatibilidade: `foto_url`/`assinatura_url` já gravados no banco no formato
> legado continuam funcionando — o frontend normaliza pelo *basename*.

### Variáveis de segurança no `.env`

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `NODE_ENV` | `development` | `production` bloqueia o seed e exige `FRONTEND_URL` |
| `FRONTEND_URL` | `http://localhost:3000` | Origem liberada no CORS (lista separada por vírgula) |
| `TRUST_PROXY` | *(vazio)* | Nº de proxies à frente do app — **ative em produção** |

---

## 🔐 Endpoints de Autenticação (RF01)

Base: `http://localhost:3000/api/auth`

| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `POST` | `/login` | Público | Autentica e retorna token JWT (válido por 24h) + dados do usuário |
| `POST` | `/registrar` | Público | Cria usuário com role `jovem` ou `tio` (criação de `admin` é bloqueada → 403) |

**Exemplo — Login:**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@segueme.com.br", "senha": "admin123"}'
```

Resposta (200):

```json
{
  "mensagem": "Login realizado com sucesso.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "usuario": { "id": 1, "email": "admin@segueme.com.br", "role": "admin" }
}
```

**Códigos de resposta:** `201` criado · `400` payload inválido · `401` credenciais inválidas/token ausente·inválido·expirado · `403` sem permissão (ex.: tentar registrar `admin`) · `409` e-mail duplicado · `500` erro interno.

> 🔒 Em rotas protegidas (próximas etapas), envie o header `Authorization: Bearer <token>`. As senhas são armazenadas apenas como hash bcrypt e **nunca** retornadas pela API.

## 📁 Estrutura de Pastas (padrão MVC)

```
seguemev2/
├── src/
│   ├── server.js          # 🚀 Servidor Express (ponto de entrada + seed Admin)
│   ├── controllers/
│   │   └── authController.js  # 🔑 Login e registro com JWT (RF01)
│   ├── middlewares/
│   │   └── authMiddleware.js  # 🔐 verificarToken (JWT) e isAdmin
│   ├── models/
│   │   ├── index.js       # 🗂️ Centralizador de models e associações (1:1)
│   │   ├── Usuario.js     # 👤 Acessos (jovem | tio | admin) + bcrypt
│   │   └── Ficha.js       # 📝 Ficha de inscrição (campos legados + coordenação)
│   ├── routes/
│   │   ├── authRoutes.js    # 🛣️ POST /api/auth/login (rate limited) | /registrar
│   │   ├── fichaRoutes.js   # 🛣️ POST /api/fichas (auth) | GET /api/fichas (admin)
│   │   └── arquivosRoutes.js# 🔒 GET /api/arquivos/** (PII autenticada — LGPD)
│   └── config/
│       └── database.js    # 🗄️ Instância Sequelize + inicialização
├── public/                # Frontend estático (Tailwind CSS via CDN)
│   ├── index.html         # 🔑 Login / registro (abas Entrar | Criar Conta)
│   ├── formulario.html    # 📝 Ficha de inscrição (jovem/tio) + modal de sucesso
│   ├── admin.html         # 🛡️ Painel da coordenação (tabela + Baixar PDF)
│   └── js/
│       ├── api.js         # 🌐 JWT no localStorage + header Authorization Bearer
│       ├── login.js       # abas, login e redirecionamento por perfil
│       ├── formulario.js  # coleta/envio da ficha (POST /api/fichas)
│       └── admin.js       # listagem, busca e download autenticado de arquivos
├── uploads/               # 🔒 NÃO servido estaticamente — só via /api/arquivos
│   ├── fichas_pdf/        # PDFs das fichas gerados pelo backend (runtime)
│   └── candidatos_img/    # Foto 3x4 e assinatura dos candidatos (PII)
├── .env.example           # Modelo de variáveis de ambiente (versionado)
├── .env                   # Variáveis de ambiente (NÃO versionado)
├── package.json
└── README.md
```

> Os arquivos `.gitkeep` existem apenas para manter as pastas vazias versionadas no Git.

---

## ▶️ Como Executar

```bash
# 1. Instalar dependências
npm install

# 2. Ambiente de desenvolvimento (nodemon)
npm run dev

# 3. Produção
npm start
```

Ao subir, o servidor valida a conexão com o banco (`authenticate`), sincroniza os modelos (`sync`), executa o **seed do Admin padrão** (apenas fora de produção) e expõe o health check `GET /api/health` → `{ "status": "ok", "server": "Segue-me V2" }`.

> **🌱 Seed do Admin:** no primeiro start de **desenvolvimento** (ou se nenhum admin existir) é criado o usuário `admin@segueme.com.br` com senha `admin123`. 🔒 Com `NODE_ENV=production` essa criação é **bloqueada** — provisione o admin manualmente (ver [Segurança](#-segurança-hardening-de-produção)).

### ⚙️ Variáveis de Ambiente

O projeto usa `dotenv`. Copie `.env.example` para `.env` e ajuste conforme o ambiente:

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3000` | Porta HTTP em que o servidor Express escuta |
| `DB_DIALECT` | `sqlite` | Dialeto do Sequelize |
| `DB_STORAGE` | `./database.sqlite` | Caminho do arquivo do banco (relativos são resolvidos a partir da raiz do projeto) |
| `DB_LOG_SQL` | `false` | Opcional: `true` exibe no console todas as queries SQL executadas |
| `JWT_SECRET` | `segueme_secret_key_2026` | Segredo de assinatura dos tokens JWT (24h) — **troque em produção** |
| `NODE_ENV` | `development` | `production` bloqueia o seed do admin e exige `FRONTEND_URL` |
| `FRONTEND_URL` | `http://localhost:3000` | Origem liberada no CORS (lista separada por vírgula) |
| `TRUST_PROXY` | *(vazio)* | Nº de proxies à frente do app — **ative em produção** |
| `LOGIN_RATE_LIMIT_MAX` | `10` | Tentativas de login por janela de 15 min |

> O arquivo `.env` **não é versionado** (ver `.gitignore`); mantenha o `.env.example` sempre atualizado.

---

## 🧪 Testes

| Script | Escopo | Requer servidor |
|--------|--------|-----------------|
| `node qa-auditoria.js` | Auditoria estrutural (sintaxe, HTML, rotas, hardening) | Não |
| `node test-frontend-unit.js` | Lógica do painel admin (rota de arquivo, botões) | Não |
| `node test-formulario.js` | Fluxo da ficha de inscrição (jovem/tio) | Sim |
| `node test-candidatos.js` | Inscrição de candidatos + entrega de imagem | Sim |
| `node test-seguranca.js` | **Os 4 bloqueadores** (LGPD, seed, rate limit, helmet/CORS) | Sim |

O rate limit de login (10/15 min por IP) é compartilhado entre as suítes. Para
rodá-las em sequência sem colidir, suba um servidor de teste com o limite ampliado:

```bash
LOGIN_RATE_LIMIT_MAX=200 npm start
LOGIN_RATE_LIMIT_MAX=200 node test-seguranca.js
```


### ⚠️ Solução de Problemas — `sqlite3` (Windows/npm recente)

O `sqlite3` possui um binário nativo compilado/baixado no `postinstall`. Em versões recentes do npm com a política de `allowScripts`, a instalação pode exibir o aviso `install scripts not yet covered by allowScripts`. Se o SQLite falhar ao carregar, execute:

```bash
npm approve-scripts sqlite3
npm rebuild sqlite3
```

Validação rápida:

```bash
node -e "require('sqlite3'); console.log('sqlite3 OK')"
```

---

## 🗺️ Roadmap

- [x] **Etapa 1 — Fundação:** `npm init`, dependências, estrutura de pastas MVC e documentação
- [x] **Etapa 2 — Configuração:** servidor Express, conexão Sequelize/SQLite, `.env.example`
- [x] **Etapa 3 — Modelos:** `Usuario` (hooks bcrypt), `Ficha` (1:1 com `usuario_id` único) e seed do Admin padrão. *(Model `Encontro` ficou para etapa futura — fichas atualmente avulsas)*
- [x] **Etapa 4 — Autenticação:** JWT (24h), login, registro (`jovem`/`tio`, admin bloqueado) e middlewares `verificarToken`/`isAdmin` (RF01)
- [x] **Etapa 5 — Fichas:** `POST /api/fichas` (upsert, RN03) + `GET /api/fichas` com listagem administrativa (`listarTodasFichas`, RF02)
- [x] **Etapa 6 — PDF:** geração com `pdfkit` no backend (RN04), gravados em `uploads/fichas_pdf/` e servidos em `/uploads/fichas_pdf` e `/downloads`
- [x] **Etapa 7 — Frontend:** telas com Tailwind CSS (CDN) em `public/` — login/registro com abas, ficha seccionada com modal de sucesso e painel da coordenação com tabela + "Baixar PDF" (RF01/RF02/RF03)

