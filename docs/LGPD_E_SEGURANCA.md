# LGPD e Segurança — Segue-me V2

Documento de arquitetura de segurança e conformidade com a **LGPD (Lei nº 13.709/2018)** do sistema **Segue-me V2**. Descreve os controles implementados no código, o tratamento de dados pessoais (PII) e o ciclo de vida dos arquivos enviados.

> Referências de código: `src/server.js`, `src/middlewares/`, `src/routes/`, `src/controllers/`, `src/utils/caminhoSeguro.js`, `src/models/`, `.gitignore`, `.env.example`.

---

## 1. Classificação dos dados tratados

O sistema trata dados de **jovens, tios e candidatos**, frequentemente **menores de idade**.

| Categoria | Exemplos | Natureza |
|-----------|----------|----------|
| Identificação | nome, data de nascimento, naturalidade, nome do pai/mãe | Pessoal |
| Contato | telefone, e-mail, endereço, contato de emergência | Pessoal |
| **Dado sensível** | `religiao`, `igreja_frequenta`, `sacramentos`, `movimento_igreja` | Convicção religiosa (art. 5º, II) |
| **Dado sensível** | `tem_alergias`, `alergias_restricoes` | Dados referentes à saúde (art. 5º, II) |
| **Biometria / imagem** | foto 3x4 e assinatura digitalizada | Imagem — alto risco |
| Credenciais | e-mail e senha (hash bcrypt) | Autenticação |

> O sistema lida com **dados sensíveis** e de **menores**. Isso amplia as obrigações legais (art. 11 e art. 14 da LGPD) e exige acesso restrito à coordenação.

---

## 2. Proteção contra ataques

### 2.1 Helmet / Content Security Policy

`src/server.js` aplica `helmet` com CSP customizada:

| Diretiva | Valor | Motivo |
|----------|-------|--------|
| `defaultSrc` | `'self'` | Bloqueia origens não declaradas |
| `baseUri` | `'self'` | Evita injeção de `<base>` |
| `scriptSrc` | `'self'`, `https://cdn.tailwindcss.com`, `'unsafe-eval'` | Tailwind Play CDN compila em runtime |
| `styleSrc` | `'self'`, `'unsafe-inline'` | Estilos inline do frontend |
| `imgSrc` | `'self'`, `data:`, `blob:` | Preview e arquivos convertidos em Blob |
| `fontSrc` | `'self'`, `data:` | Fontes |
| `connectSrc` | `'self'` | Bloqueia exfiltração via fetch/XHR |
| `objectSrc` | `'none'` | Bloqueia plugins/embeds |
| `frameAncestors` | `'none'` | Anti-clickjacking |
| `formAction` | `'self'` | Impede post para terceiros |
| `upgradeInsecureRequests` | só em produção | Não força HTTPS local |

Complementos: `crossOriginEmbedderPolicy: false` (necessário ao painel) e `referrerPolicy: 'no-referrer'`.

> **Dívida técnica documentada no código:** `'unsafe-eval'` e o CDN existem apenas por causa do *Play CDN*. Recomenda-se compilar o Tailwind localmente (`public/css/tailwind.css`) e então remover `'unsafe-eval'` e o host do CDN de `scriptSrc`.

### 2.2 CORS

- Origem definida por `FRONTEND_URL` (aceita lista separada por vírgula).
- Origem explícita habilita `credentials: true`; `*` desabilita credenciais.
- Em `NODE_ENV=production` sem `FRONTEND_URL`, o servidor **avisa e libera `*`** — evitar em produção.

### 2.3 Rate limiting

- Aplicado **somente** em `POST /api/auth/login` (`src/routes/authRoutes.js`).
- Padrão: **10 tentativas por IP a cada 15 minutos**; configurável via `LOGIN_RATE_LIMIT_MAX` e `LOGIN_RATE_LIMIT_WINDOW_MS`.
- Resposta `429` amigável; cabeçalhos `RateLimit` e `RateLimit-Policy` (draft-7).
- `trust proxy` (`TRUST_PROXY || 1`) garante o IP real atrás de proxy. Em exposição direta, usar `TRUST_PROXY=0` (senão `X-Forwarded-For` forjado contorna o limite).

### 2.4 Sanitização de entradas e anti-injeção

- **SQL Injection:** acesso ao banco via Sequelize (consultas parametrizadas). Migrações usam identificadores de **constantes do código**.
- **Path traversal:** `src/utils/caminhoSeguro.js` aplica `path.basename` + verificação de contenção (`startsWith(base + path.sep)`).
- **Allow-list de nomes de arquivo** (regex ancoradas):
  - `/^ficha_(foto|assinatura)_\d+_\d+_\d+\.(jpg|png)$/`
  - `/^ficha_foto_(\d+)_\d+_\d+\.(jpg|png)$/`
  - `/^candidato_(foto|assinatura)_\d+_\d+\.(jpg|png)$/`
- **Upload:** `multer` com `fileFilter` por `mimetype` (`image/jpeg`, `image/jpg`, `image/png`) e limite de **5 MB** por arquivo.
- **Payload JSON:** `express.json({ limit: '50mb' })` — valor alto, herdado de etapas futuras; recomenda-se reduzir se desnecessário.

### 2.5 Hardening de headers nas respostas de arquivos

Aplicado por `cabecalhosPrivados` em toda entrega de arquivo:

```
Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0
Pragma: no-cache
X-Content-Type-Options: nosniff
X-Robots-Tag: noindex, nofollow, noarchive
```

---

## 3. Gestão de identidade e autenticação

### 3.1 Hash de senhas (bcrypt)

- `src/models/Usuario.js` usa **`SALT_ROUNDS = 10`**.
- Hash aplicado nos hooks `beforeCreate` e `beforeUpdate` (apenas se a senha mudou).
- Conferência por `bcrypt.compare` (`verificarSenha`).
- A senha em texto puro **nunca** é gravada nem retornada (respostas expõem só `id`, `email`, `role`).

### 3.2 JWT

- Emitido no login com **expiração de 24 h** (`expiresIn: '24h'`).
- Assinado com `JWT_SECRET` (variável de ambiente; sem ela o servidor retorna erro).
- Payload mínimo: `{ id, role }` — sem dados pessoais desnecessários.
- `verificarToken` valida `Authorization: Bearer <token>` e distingue token expirado de inválido (ambos `401`).
- Não há refresh token: expirado, exige novo login.

### 3.3 Autorização por perfil (RBAC)

- Perfis: `jovem`, `tio`, `admin`. O `role` **vem do JWT**, jamais do corpo da requisição.
- `isAdmin` protege listagens administrativas e o download de imagens de candidatos.

### 3.4 Proteções específicas de identidade

| Ameaça | Mitigação | Local |
|--------|-----------|-------|
| Enumeração de usuários | Erro genérico `Credenciais inválidas.` | `authController.login` |
| Escalonamento de privilégio | Criação de `admin` bloqueada na rota pública | `authController.registrar` |
| Backdoor de credencial padrão | Seed do admin **bloqueado em produção**; senha via env | `server.js` |
| Força bruta | Rate limit no login | `authRoutes.js` |
| IDOR em arquivos | Titularidade pelo `<id>` no nome/token; admin vê tudo | `arquivosRoutes.js` |
| Path traversal | basename + allow-list + contenção | `caminhoSeguro.js` |

> **CSRF:** a API usa Bearer token no header (não cookie de sessão), então o risco clássico de CSRF é reduzido — o token não é anexado automaticamente pelo navegador.

---

## 4. Ciclo de vida dos arquivos (fotos, assinaturas e PDFs)

### 4.1 Onde os arquivos ficam

| Tipo | Diretório | Rota de entrega |
|------|-----------|-----------------|
| Foto/assinatura de **candidato** | `uploads/candidatos_img/` | `GET /api/arquivos/candidatos/:arquivo` (admin) |
| Foto/assinatura da **ficha** | `uploads/fichas_foto/` | `GET /api/arquivos/fichas-foto/:arquivo` (admin/dono) |
| **PDF** da ficha | `uploads/fichas_pdf/` | `GET /api/arquivos/fichas/:usuarioId` (admin/dono) |

Nenhum diretório de `uploads/` é exposto por `express.static`: o servidor serve **apenas** `public/`. As antigas rotas estáticas (`/uploads/fichas_pdf`, `/uploads/candidatos_img`, `/downloads`) foram removidas.

### 4.2 Fluxo de armazenamento

1. **Nome gerado no servidor** (`uploadMiddleware`): `<prefixo>_<id>_<timestamp>_<random numérico>.<ext>`. O cliente não escolhe o nome.
2. **Validação:** `mimetype` na allow-list + limite de 5 MB.
3. **Vínculo seguro:** ao salvar a ficha, o nome é validado (formato, tipo e **titularidade**) contra o arquivo real em disco (`validarAnexoFicha`).
4. **Geração do PDF:** imagens renderizadas por `pdfkit` (foto no cabeçalho, assinatura no rodapé); ausência/corrupção cai em **placeholder** sem quebrar a geração.
5. **Entrega:** somente por rota autenticada, via `res.download()`, com `no-store`/`nosniff`/`noindex`.

### 4.3 Eliminação e minimização

- **Reenvio:** novo anexo do mesmo usuário remove o anterior do disco (`apagarAnexoFicha`), evitando PII órfã.
2. **Falha após upload:** arquivos recém-gravados são removidos (`removerArquivosOrfaos`).
3. **Versionamento:** `.gitignore` exclui `.env`, banco SQLite, logs e **todo o conteúdo de `uploads/`** (mantendo só `.gitkeep`), impedindo PII no repositório.

### 4.4 Lacunas conhecidas

- Sem **expiração automática** dos PDFs/imagens ao fim da finalidade (encerramento do encontro).
- Sem **criptografia em repouso** para SQLite e `uploads/`.
- Sem **trilha de auditoria** de acesso a PII (quem baixou o quê e quando).

---

## 5. Conformidade com a LGPD

### 5.1 Princípios aplicados

| Princípio | Como é atendido |
|-----------|-----------------|
| Finalidade | Dados usados apenas para inscrição/coordenação do encontro |
| Necessidade/minimização | Campos definidos pela ficha física; anexos opcionais |
| Transparência | UI comunica o uso da foto ("aparece no topo do PDF") |
| Segurança | JWT, RBAC, allow-lists, downloads protegidos, `no-store` |
| Prevenção | Rate limit, RBAC, bloqueio de escalonamento, `trust proxy` |
| Responsabilização | Este documento e a auditoria automatizada |

### 5.2 Dados sensíveis e de menores

Dados de **religião/sacramentos** e **saúde/alergias** são sensíveis (art. 5º, II). Fotos e assinaturas são dados de imagem com risco elevado. Tratando-se frequentemente de **menores**, aplica-se o art. 14 (melhor interesse da criança) e, quando cabível, consentimento do responsável. Por isso, o acesso às imagens de candidatos é restrito a `admin`.

### 5.3 Direitos do titular

| Direito | Situação atual |
|---------|----------------|
| Confirmação/acesso | Atendido via rotas autenticadas / painel admin |
| Correção | Via `POST /api/fichas` (upsert pelo próprio dono) |
| Eliminação | Reenvio remove o anexo anterior; **não há fluxo dedicado de exclusão** |
| Portabilidade | **Não implementado** |

### 5.4 Segurança de incidentes

O servidor registra rejeições de promessa não tratadas (`unhandledRejection`) e erros de streaming. Recomenda-se formalizar plano de resposta a incidentes e avaliar comunicação à ANPD/titulares (art. 48) quando aplicável.

---

## 6. Matriz de controles

| # | Controle | Status | Local |
|---|----------|--------|-------|
| 1 | Helmet / CSP | Implementado | `server.js` |
| 2 | CORS configurável | Implementado | `server.js` |
| 3 | Rate limit no login | Implementado | `authRoutes.js` |
| 4 | `trust proxy` | Implementado | `server.js` |
| 5 | Hash bcrypt (custo 10) | Implementado | `Usuario.js` |
| 6 | JWT 24 h | Implementado | `authController.js` |
| 7 | RBAC (jovem/tio/admin) | Implementado | `authMiddleware.js` |
| 8 | Bloqueio de escalonamento | Implementado | `authController.registrar` |
| 9 | Seed admin bloqueado em produção | Implementado | `server.js` |
| 10 | Allow-list + anti-path-traversal | Implementado | `caminhoSeguro.js`, rotas |
| 11 | Upload validado (MIME + extensão + assinatura/magic bytes) | Implementado | `uploadMiddleware.js` |
| 12 | Downloads autenticados (`no-store`) | Implementado | `arquivosRoutes.js` |
| 13 | Remoção de PII órfã | Implementado | `uploadMiddleware.js` |
| 14 | `.env`/uploads fora do Git | Implementado | `.gitignore` |
| 15 | Retenção/exclusão programada | **Pendente** | — |
| 16 | Criptografia em repouso | **Pendente** | — |
| 17 | Trilha de auditoria de acesso a PII | Implementado | `utils/auditLog.js`, `arquivosRoutes.js` |
| 18 | Logs sem PII (e-mail mascarado, sem senha/token) | Implementado | `logSeguro.js` |
| 19 | Falhas de autenticação registradas (sem credenciais) | Implementado | `authController.js`, `authMiddleware.js` |
| 20 | Erros sempre em JSON (sem stack/HTML) | Implementado | `server.js` |
| 21 | Backup consistente do banco + uploads | Implementado | `scripts/backup.js` |

### 6.1 Backup e retenção

O script `npm run backup` gera um snapshot **consistente** do banco
(`VACUUM INTO`, seguro com o servidor no ar e em modo WAL) e dos uploads.
O snapshot contém PII e deve ser armazenado criptografado, com acesso
restrito e retenção definida. A retenção local pode ser automatizada com
`npm run backup -- --keep N` (mantém os N snapshots mais recentes e apaga os
demais). Instruções completas em [Backup e restauração](./BACKUP.md).

---

## 7. Recomendações para produção

- Definir `NODE_ENV=production`, `JWT_SECRET` forte e `FRONTEND_URL` real.
- Provisionar o admin manualmente (seed bloqueado em produção).
- Compilar o Tailwind localmente e remover `'unsafe-eval'`/CDN do CSP.
- Reduzir o limite de `express.json` se não for necessário.
- Habilitar **criptografia em repouso** (volume/banco) e backups seguros.
- Definir **política de retenção** e exclusão após o encerramento do encontro.
- Implementar **trilha de auditoria** de acesso a PII.
- Publicar **política de privacidade** e nomear **Encarregado (DPO)**.
- Formalizar processo de atendimento aos **direitos do titular**.

---

## 8. Referências

- Lei nº 13.709/2018 (LGPD) — arts. 5º, 6º, 7º, 11, 14, 15–18, 46–49.
- [Documentação da API](./API.md)
- [Backup e restauração](./BACKUP.md)
- OWASP: *Authentication Cheat Sheet*, *REST Security Cheat Sheet*, *File Upload Cheat Sheet*.
