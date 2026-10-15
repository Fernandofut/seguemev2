# API — Segue-me V2

Documentação de referência da API REST do sistema **Segue-me V2**.
Este documento descreve os endpoints efetivamente implementados em `src/routes/`, com payloads, respostas e códigos de status.

- **Base URL (dev):** `http://localhost:3000`
- **Prefixo da API:** `/api`
- **Formato de dados:** `application/json` (exceto uploads, que usam `multipart/form-data`)
- **Autenticação:** `Authorization: Bearer <JWT>`
- **Charset:** UTF-8

---

## 1. Convenções gerais

### 1.1 Formato das respostas

Toda resposta de sucesso retorna um objeto JSON. As chaves de negócio são em português (`mensagem`, `ficha`, `candidato`, `token`, `pdf`):

```json
{
  "mensagem": "Ficha cadastrada e PDF gerado com sucesso.",
  "ficha": { "id": 42, "usuario_id": 33, "nome": "Maria Souza" },
  "pdf": {
    "arquivo": "ficha_usuario_33.pdf",
    "url_download": "/api/arquivos/fichas/33"
  }
}
```

### 1.2 Formato dos erros

Todos os erros retornam um objeto com a chave `erro` (string legível, pronta para exibir ao usuário):

```json
{ "erro": "Credenciais inválidas." }
```

### 1.3 Códigos de status utilizados

| Código | Significado |
|--------|-------------|
| `200` | OK — leitura/atualização bem-sucedida |
| `201` | Criado — recurso criado (inscrição, ficha, upload) |
| `400` | Requisição inválida — payload/parâmetros/arquivo inválidos |
| `401` | Não autenticado — token ausente, inválido ou expirado |
| `403` | Sem permissão (perfil não-admin ou arquivo de outro dono) |
| `404` | Recurso não encontrado |
| `409` | Conflito — e-mail já cadastrado |
| `429` | Muitas tentativas (rate limit no login) |
| `500` | Erro interno do servidor |

### 1.4 Autenticação por perfil (RBAC)

Três perfis (`role`): **`jovem`**, **`tio`** e **`admin`**.

- `verificarToken` (`src/middlewares/authMiddleware.js`): valida o JWT e injeta `req.usuario_id` / `req.usuario_role`.
- `isAdmin`: exige `role === 'admin'`.

> O `role` **nunca** vem do corpo da requisição: é lido **do token JWT**. Não é possível "forjar" o próprio perfil.

### 1.5 Visão geral dos endpoints

| Método | URL | Acesso | Descrição |
|--------|-----|--------|-----------|
| `POST` | `/api/auth/registrar` | Público | Cadastra usuário (`jovem`/`tio`) |
| `POST` | `/api/auth/login` | Público (rate limit) | Autentica e emite o JWT |
| `GET` | `/api/health` | Público | Health check |
| `POST` | `/api/candidatos` | Público | Inscrição pública (multipart, sem login) |
| `GET` | `/api/candidatos` | Admin | Lista inscrições de candidatos |
| `POST` | `/api/fichas/foto` | Autenticado | Upload da foto 3x4 (alias de `/anexos`) |
| `POST` | `/api/fichas/anexos` | Autenticado | Upload de foto e/ou assinatura |
| `POST` | `/api/fichas` | Autenticado | Cria/atualiza a ficha e gera o PDF |
| `GET` | `/api/fichas` | Admin | Lista todas as fichas |
| `GET` | `/api/arquivos/fichas/:usuarioId` | Admin ou dono | Baixa o PDF da ficha por ID |
| `GET` | `/api/arquivos/fichas-foto/:arquivo` | Admin ou dono | Baixa a foto 3x4 da ficha |
| `GET` | `/api/arquivos/candidatos/:arquivo` | Admin | Baixa foto/assinatura de candidato |

> ⚠️ **Observação de nomenclatura.** Os endpoints `/api/fichas/jovens` e `/api/fichas/tios` citados no escopo **não existem** como rotas separadas: o perfil é derivado do JWT em `POST /api/fichas` (endpoint único). A inscrição **pública sem login** é `POST /api/candidatos`. Ver seção 8 (Mapeamento).

---

## 2. Autenticação

### 2.1 `POST /api/auth/registrar`

Cria um usuário com perfil `jovem` ou `tio`. **Não é permitido** criar `admin` por esta rota (bloqueio de escalonamento de privilégio).

- **Autenticação:** não
- **Content-Type:** `application/json`

**Corpo (JSON):**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `email` | string | Sim | E-mail válido e único |
| `senha` | string | Sim | Mínimo de 6 caracteres (armazenada como hash bcrypt) |
| `role` | string | Não | `jovem` (padrão) ou `tio`. `admin` é rejeitado |

**Exemplo de requisição:**

```bash
curl -X POST http://localhost:3000/api/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@exemplo.com","senha":"segredo123","role":"jovem"}'
```

**Resposta de sucesso — `201 Created`:**

```json
{
  "mensagem": "Usuário registrado com sucesso.",
  "usuario": { "id": 12, "email": "maria@exemplo.com", "role": "jovem" }
}
```

**Erros:**

| Status | `erro` |
|--------|--------|
| `400` | `E-mail e senha são obrigatórios.` |
| `400` | `A senha deve ter no mínimo 6 caracteres.` |
| `400` | `Role inválida. Permitidas: jovem, tio.` |
| `400` | `Formato de e-mail inválido.` |
| `403` | `Não é permitido criar usuários admin por esta rota.` |
| `409` | `Já existe um usuário cadastrado com este e-mail.` |

---

### 2.2 `POST /api/auth/login`

Autentica o usuário e emite um **JWT válido por 24 horas**.

- **Autenticação:** não
- **Rate limit:** máx. **10 tentativas por IP a cada 15 minutos** (configurável por `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_MS`).
- **Content-Type:** `application/json`

**Corpo (JSON):**

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| `email` | string | Sim |
| `senha` | string | Sim |

**Exemplo de requisição:**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@exemplo.com","senha":"segredo123"}'
```

**Resposta de sucesso — `200 OK`:**

```json
{
  "mensagem": "Login realizado com sucesso.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": { "id": 12, "email": "maria@exemplo.com", "role": "jovem" }
}
```

**Payload do JWT (decodificado):**

```json
{ "id": 12, "role": "jovem", "iat": 1730000000, "exp": 1730086400 }
```

**Erros:**

| Status | `erro` |
|--------|--------|
| `400` | `E-mail e senha são obrigatórios.` |
| `401` | `Credenciais inválidas.` (mensagem genérica: não revela se o e-mail existe) |
| `429` | `Muitas tentativas de login. Aguarde 15 minutos e tente novamente.` |

---

## 3. Inscrição pública (candidatos)

Fluxo **sem login**: pessoas que farão o encontro pela primeira vez preenchem o formulário e anexam foto 3x4 e assinatura. As imagens são gravadas em `uploads/candidatos_img/` e entregues apenas pela rota protegida `GET /api/arquivos/candidatos/:arquivo`.

### 3.1 `POST /api/candidatos`

- **Autenticação:** não (rota pública)
- **Content-Type:** `multipart/form-data`
- **Limite de arquivo:** 5 MB por imagem; tipos aceitos: `image/jpeg`, `image/jpg`, `image/png`

**Campos de texto (form-data):**

`nome` (**obrigatório**), `telefone` (**obrigatório**), `email`, `data_nascimento` (`AAAA-MM-DD`), `naturalidade`, `nome_pai`, `nome_mae`, `escolaridade`, `situacao`, `curso`, `instituicao`, `religiao`, `igreja_frequenta`, `movimento_igreja`, `convidou_nome`, `convidou_telefone`, `convidou_endereco`, `observacoes`.

`sacramentos` pode ser enviado múltiplas vezes (array): `Batismo`, `Eucaristia`, `Crisma`, `Confirmação`.

**Arquivos:**

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `foto` | Não | Foto 3x4 |
| `assinatura` | Não | Assinatura digitalizada |

**Exemplo de requisição:**

```bash
curl -X POST http://localhost:3000/api/candidatos \
  -F "nome=João Pedro Alves" \
  -F "telefone=(11) 99999-0000" \
  -F "email=joao@exemplo.com" \
  -F "data_nascimento=2005-03-14" \
  -F "sacramentos=Batismo" \
  -F "sacramentos=Crisma" \
  -F "foto=@/caminho/foto.png" \
  -F "assinatura=@/caminho/assinatura.png"
```

**Resposta de sucesso — `201 Created`:**

```json
{
  "mensagem": "Inscrição registrada com sucesso! A coordenação entrará em contato.",
  "candidato": {
    "id": 7,
    "nome": "Maria Souza",
    "telefone": "(11) 91234-5678",
    "sacramentos": ["Batismo", "Eucaristia"],
    "foto_url": "/uploads/candidatos_img/candidato_foto_1730000000000_123456789.png",
    "assinatura_url": "/uploads/candidatos_img/candidato_assinatura_1730000000001_987654321.png"
  }
}
```

> 💡 `foto_url` / `assinatura_url` são **identificadores internos** (nome do arquivo). O download real só ocorre pela rota autenticada `GET /api/arquivos/candidatos/:arquivo`.

**Erros:**

| Status | `erro` |
|--------|--------|
| `400` | `Nome e telefone são obrigatórios.` |
| `400` | `Formato de imagem inválido. Envie JPEG ou PNG.` |
| `400` | `Arquivo muito grande. Tamanho máximo: 5 MB por imagem.` |
| `400` | `Formato de e-mail inválido.` |

---

### 3.2 `GET /api/candidatos`

Lista todas as inscrições de candidatos (painel da coordenação).

- **Autenticação:** `verificarToken` + `isAdmin`
- **Resposta — `200 OK`:**

```json
{
  "total": 1,
  "candidatos": [
    {
      "id": 12,
      "nome": "Ana Lima",
      "telefone": "(11) 91234-5678",
      "email": "ana@exemplo.com",
      "sacramentos": ["Batismo"],
      "foto_url": "/uploads/candidatos_img/candidato_foto_...png",
      "assinatura_url": "/uploads/candidatos_img/candidato_assinatura_...png"
    }
  ]
}
```

**Erros:** `401` (sem token) · `403` (`Acesso restrito a administradores.`)

---

## 4. Fichas de Equipe de Trabalho (jovem/tio autenticados)

O perfil (`jovem`/`tio`) vem do JWT. O envio acontece em **duas etapas**: primeiro os anexos (multipart), depois a ficha em JSON (que vincula os nomes dos arquivos e dispara a geração do PDF).

### 4.1 `POST /api/fichas/foto` (alias de `/api/fichas/anexos`)

Envia a foto 3x4. Endpoint usado pelo formulário e pelos testes.

- **Autenticação:** `verificarToken`
- **Content-Type:** `multipart/form-data`

| Campo | Obrigatório | Tipo |
|-------|-------------|------|
| `foto` | Sim | `image/jpeg` ou `image/png` (≤ 5 MB) |

**Exemplo:**

```bash
curl -X POST http://localhost:3000/api/fichas/foto \
  -H "Authorization: Bearer $TOKEN" \
  -F "foto=@minha-foto.png"
```

**Resposta — `201 Created`:**

```json
{
  "mensagem": "Anexo(s) recebido(s). Agora salve a ficha para vincular ao PDF.",
  "foto_3x4": "ficha_foto_33_1730000000000_123456789.png"
}
```

> O nome do arquivo é gerado **no servidor** (nunca ecoa caminho absoluto do disco). Formato: `ficha_foto_<usuario_id>_<timestamp>_<random>.<ext>`.

---

### 4.2 `POST /api/fichas/anexos`

Envia **foto e/ou assinatura** de uma vez.

- **Autenticação:** `verificarToken`
- **Content-Type:** `multipart/form-data`

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `foto` | Não* | Foto 3x4 |
| `assinatura` | Não* | Assinatura digitalizada (termo de concordância) |

\* É necessário enviar **ao menos um** dos dois.

**Resposta — `201 Created`:**

```json
{
  "mensagem": "Anexo(s) recebido(s). Agora salve a ficha para vincular ao PDF.",
  "foto_3x4": "ficha_foto_33_1730000000000_123456789.png",
  "assinatura": "ficha_assinatura_33_1730000000001_987654321.png"
}
```

**Erros:** `400` (`Nenhuma imagem foi enviada.`) · `401` · `400` (formato/tamanho inválido)

> Ao reenviar um anexo, o arquivo anterior do mesmo usuário é removido do disco para não deixar PII órfã.

---

### 4.3 `POST /api/fichas`

Cria (ou atualiza) a ficha do usuário autenticado e **gera o PDF** em `uploads/fichas_pdf/ficha_usuario_<id>.pdf`.

- **Autenticação:** `verificarToken`
- **Regra de negócio (RN03):** 1 ficha por usuário — `create` se não existir, `update` se existir (upsert).
- **Content-Type:** `application/json`

**Corpo (JSON) — campos principais:**

```json
{
  "nome": "Maria Souza",
  "data_nascimento": "2003-07-21",
  "telefone": "(11) 98888-7777",
  "endereco": "Rua das Acácias, 120",
  "paroquia_encontro": "Paróquia Nossa Senhora",
  "ano_encontro": "2019/2020",
  "contato_emergencia": "Joana Souza — (11) 97777-1111",
  "tamanho_camiseta": "P",
  "sacramentos": ["Batismo", "Confirmação"],
  "segues_trabalhados": "2019, 2020",
  "equipes_trabalhadas": "Acolhida, Música",
  "ultima_equipe_servida": "Acolhida",
  "participou_ed": false,
  "serviu_lideranca": false,
  "possui_instrumento": false,
  "canta": true,
  "quer_dar_palestra": false,
  "tem_alergias": false,
  "foto_3x4": "ficha_foto_33_1730000000000_123456789.png",
  "assinatura": "ficha_assinatura_33_1730000000001_987654321.png"
}
```

**Regras sobre os anexos (`foto_3x4` / `assinatura`):**

- Devem ser nomes no padrão `ficha_(foto|assinatura)_<id>_<timestamp>_<random>.<ext>`.
- O `<id>` embutido precisa ser **do próprio usuário logado** (bloqueia IDOR).
- O tipo tem de casar (foto no campo foto, assinatura no campo assinatura).
- O arquivo precisa existir em `uploads/fichas_foto/`.
- **Ausente** (`null`/`""`/omitido) = mantém o anexo já gravado (reenvio sem reenviar imagem).

**Exemplo:**

```bash
curl -X POST http://localhost:3000/api/fichas \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Maria Souza","foto_3x4":"ficha_foto_33_1730000000000_123456789.png"}'
```

**Resposta — `201 Created` (nova) ou `200 OK` (atualizada):**

```json
{
  "mensagem": "Ficha cadastrada e PDF gerado com sucesso.",
  "ficha": { "id": 42, "usuario_id": 33, "nome": "Maria Souza", "foto_3x4": "ficha_foto_33_....png" },
  "pdf": {
    "arquivo": "ficha_usuario_33.pdf",
    "url_download": "/api/arquivos/fichas/33"
  }
}
```

**Erros:**

| Status | `erro` |
|--------|--------|
| `400` | `Foto inválida: envie a imagem pelo formulário.` |
| `400` | `A foto não pertence a este usuário.` |
| `400` | `Foto não encontrada. Envie a imagem novamente.` |
| `404` | `Usuário autenticado não encontrado no banco.` |
| `401` | `Token inválido.` / `Token expirado. Faça login novamente.` |

---

### 4.4 `GET /api/fichas`

Lista todas as fichas (painel da coordenação), com o e-mail e o perfil do usuário associado.

- **Autenticação:** `verificarToken` + `isAdmin`
- **Resposta — `200 OK`:**

```json
{
  "total": 2,
  "fichas": [
    {
      "id": 42,
      "usuario_id": 33,
      "nome": "Maria Souza",
      "usuario": { "email": "maria@exemplo.com", "role": "jovem" }
    }
  ]
}
```

**Erros:** `401` · `403`

> Não há endpoint `PUT`/`DELETE` de ficha nem `GET /api/fichas/:id`. A edição ocorre pelo próprio dono via `POST /api/fichas` (upsert).

---

## 5. Arquivos protegidos (LGPD)

PII (PDFs das fichas, fotos 3x4 e assinaturas) **não é servida** por `express.static`. Todo download passa por estas rotas, com JWT obrigatório, validação de titularidade, `no-store` e `noindex`.

### 5.1 `GET /api/arquivos/fichas/:usuarioId`

Baixa o **PDF da ficha por ID** de usuário.

- **Autenticação:** `verificarToken` — admin ou o próprio dono da ficha
- **Parâmetro de rota:** `usuarioId` (inteiro positivo)
- **Resposta — `200 OK`:** `application/pdf` (via `res.download`, com `Content-Disposition: attachment`)

**Exemplo:**

```bash
curl -X GET "http://localhost:3000/api/arquivos/fichas/33" \
  -H "Authorization: Bearer $TOKEN" \
  -o ficha_inscricao_33.pdf
```

**Erros:**

| Status | `erro` |
|--------|--------|
| `400` | `Arquivo solicitado é inválido.` |
| `401` | Token ausente/inválido/expirado |
| `403` | `Você só pode baixar o PDF da sua própria ficha.` / `Você só pode acessar o PDF da sua própria ficha.` |
| `404` | `PDF da ficha não encontrado para este usuário.` |

---

### 5.2 `GET /api/arquivos/fichas-foto/:arquivo`

Baixa a **foto 3x4** vinculada à ficha.

- **Autenticação:** `verificarToken` — admin ou dono (titularidade inferida do `<id>` no nome do arquivo)
- **Parâmetro de rota:** `arquivo` = `ficha_foto_<usuario_id>_<timestamp>_<random>.<jpg|png>`
- **Resposta — `200 OK`:** `image/jpeg` ou `image/png`

**Erros:** `400` (nome fora da allow-list) · `401` · `403` (`Você só pode acessar a foto da sua própria ficha.`) · `404`

---

### 5.3 `GET /api/arquivos/candidatos/:arquivo`

Baixa **foto** ou **assinatura** de um candidato (inscrição pública).

- **Autenticação:** `verificarToken` + `isAdmin` (dados frequentemente de menores — acesso restrito à coordenação)
- **Parâmetro de rota:** `arquivo` = `candidato_(foto|assinatura)_<timestamp>_<random>.<jpg|png>`
- **Resposta — `200 OK`:** `image/jpeg` ou `image/png`

**Erros:** `400` · `401` · `403` · `404`

---

## 6. Health check

### `GET /api/health`

- **Autenticação:** não
- **Uso:** monitoramento/uptime e validação de deploy.
- **Resposta — `200 OK`:**

```json
{ "status": "ok", "server": "Segue-me V2" }
```

---

## 7. Uploads em `multipart/form-data`

Requisitos comuns a todos os uploads:

- Tamanho máximo por arquivo: **5 MB** (`TAMANHO_MAX_ARQUIVO`).
- Tipos aceitos: **JPEG** e **PNG** (validados pelo `mimetype`, não pela extensão).
- Nominação gerada no servidor; o cliente **nunca** informa o nome do arquivo.
- Rejeição com JSON amigável para erro do multer (`LIMIT_FILE_SIZE`, `LIMIT_UNEXPECTED_FILE`, `LIMIT_FILE_COUNT`).
- Nomes seguem allow-list numérica: `ficha_foto_<id>_<ts>_<rand>.<ext>`, `ficha_assinatura_<id>_<ts>_<rand>.<ext>` e `candidato_(foto|assinatura)_<ts>_<rand>.<ext>`.

---

## 8. Mapeamento com o escopo solicitado

Alguns nomes citados no escopo não correspondem a rotas separadas na implementação atual. Mapeamento:

| Pedido | Implementado como |
|--------|-------------------|
| `POST /api/fichas/jovens` | `POST /api/fichas` (perfil `jovem` derivado do JWT) |
| `POST /api/fichas/tios` | `POST /api/fichas` (perfil `tio` derivado do JWT) |
| Inscrição pública sem login | `POST /api/candidatos` |
| Listagem administrativa de fichas | `GET /api/fichas` (`isAdmin`) |
| Download do PDF por ID | `GET /api/arquivos/fichas/:usuarioId` |
| CRUD de equipe/voluntários | **Não implementado** (apenas listagem via `GET /api/fichas`) |

---

## 9. Segurança

Consulte o documento complementar **[LGPD_E_SEGURANCA.md](./LGPD_E_SEGURANCA.md)** para detalhes de Helmet/CSP, rate limiting, JWT, bcrypt e ciclo de vida dos arquivos.
