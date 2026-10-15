# 💾 Backup e restauração — Segue-me V2

Guia para preservar e restaurar os dois conjuntos de dados do sistema.
Todo o conteúdo abaixo é gerado em runtime e **não** é versionado no Git
(ver `.gitignore`).

## 1. O que precisa ser salvo

| Item | Caminho | Conteúdo |
|------|---------|----------|
| Banco SQLite | `database.sqlite` (ou `DB_STORAGE`) | usuários, fichas e candidatos |
| PDFs das fichas | `uploads/fichas_pdf/` | ficha de inscrição em PDF |
| Fotos/assinaturas das fichas | `uploads/fichas_foto/` | foto 3x4 e assinatura (biometria) |
| Fotos/assinaturas dos candidatos | `uploads/candidatos_img/` | documentos da inscrição |

> ⚠️ **LGPD:** o backup contém dados pessoais sensíveis (inclusive de
> menores). Armazene-o em local **criptografado**, com **acesso restrito**,
> e descarte-o ao fim do prazo de retenção definido pela coordenação.

## 2. Backup

O script `scripts/backup.js` cria um snapshot com carimbo de data/hora em
`backups/<AAAA-MM-DD_HH-MM-SS>/`:

```bash
npm run backup
```

Por padrão gera `backups/` na raiz do projeto. Para escolher outro destino:

```bash
BACKUP_DIR=/mnt/backup-externo npm run backup
```

### Rotação automática (retenção)

Use `--keep N` para manter apenas os **N backups mais recentes**; os mais
antigos são apagados automaticamente ao fim de cada execução (evita lotar o
disco do servidor):

```bash
npm run backup -- --keep 7        # mantém os 7 snapshots mais recentes
node scripts/backup.js --keep=7   # forma equivalente
node scripts/backup.js --help     # exibe a ajuda
```

- A ordenação usa o **nome** do snapshot (`AAAA-MM-DD_HH-MM-SS`), que é
  lexicograficamente ordenável — dispensa consultar `mtime`.
- Por segurança, **só pastas com o formato exato de carimbo** são removidas;
  qualquer outro diretório em `backups/` é preservado.
- Sem `--keep`, **nenhum** backup é removido (comportamento anterior).

Saída típica com rotação:

```
🔁 [BACKUP] Rotação ativa: mantendo os 7 backups mais recentes...
🗑️  [BACKUP] Backup antigo removido: 2025-01-24_02-00-00
🧹 [BACKUP] 1 backup(s) antigo(s) removido(s).
🏁 [BACKUP] Concluído com sucesso.
```

**Por que é seguro com o servidor no ar:** o banco é copiado com
`VACUUM INTO`, que produz uma cópia **íntegra e consistente** mesmo com o
servidor escrevendo (e em modo WAL), sem travar as requisições. Os arquivos
de uploads são copiados recursivamente.

Saída esperada:

```
💾 [BACKUP] Destino: .../backups/2025-01-31_09-30-00
✅ [BACKUP] Banco: database.sqlite (180.4 KB)
✅ [BACKUP] uploads/fichas_pdf: 42 arquivo(s)
✅ [BACKUP] uploads/fichas_foto: 40 arquivo(s)
✅ [BACKUP] uploads/candidatos_img: 18 arquivo(s)
🏁 [BACKUP] Concluído com sucesso.
```

### Automatizando (cron)

```cron
# Todo dia às 02:00, mantendo os 7 backups mais recentes
0 2 * * * cd /caminho/do/projeto && npm run backup -- --keep 7 >> logs/backup.log 2>&1
```

Depois de gerar, mova o snapshot para um destino externo/criptografado. A
retenção local fica garantida pelo `--keep 7`; para políticas mais completas
(ex.: 7 diários + 4 semanais) use `BACKUP_DIR` apontando para o destino
externo e a rotação do próprio sistema de arquivos/armazenamento.

## 3. Restauração

Pare o servidor antes de restaurar (evita escrita concorrente no banco).

1. **Banco**: substitua `database.sqlite` pelo snapshot.
   ```bash
   cp backups/<carimbo>/database.sqlite ./database.sqlite
   # remova os arquivos de WAL antigos, se existirem
   rm -f database.sqlite-wal database.sqlite-shm
   ```
2. **Uploads**: restaure as pastas preservando a estrutura.
   ```bash
   cp -r backups/<carimbo>/uploads/. ./uploads/
   ```
3. Suba o servidor (`npm start`). As migrações leves são idempotentes e
   aplicam automaticamente colunas faltantes.

> Os **nomes dos arquivos** de anexos são gravados no banco e referenciam os
> arquivos em `uploads/`. Restaure **banco e uploads do mesmo snapshot** para
> não deixar referências quebradas.

## 4. Verificação

Confira a integridade do snapshot do banco antes de confiar nele:

```bash
node -e "const s=require('sqlite3');const d=new s.Database('backups/<carimbo>/database.sqlite',s.OPEN_READONLY,()=>d.get('PRAGMA integrity_check;',(e,r)=>console.log(r)))"
```

Deve imprimir `{ integrity_check: 'ok' }`.
