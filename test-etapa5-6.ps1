# ============================================================
# Teste automatizado Etapas 5 + 6 - Segue-me V2
# Fluxo completo contra o servidor local (porta 3000)
# (strings ASCII-only para evitar problemas de encoding)
# ============================================================
$ErrorActionPreference = 'Continue'
$Base = 'http://localhost:3000'
$ok = 0; $falha = 0

function Verificar($nome, $condicao, $detalhe) {
  if ($condicao) { Write-Host ("[OK]    {0}" -f $nome); $script:ok++ }
  else { Write-Host ("[FALHA] {0} => {1}" -f $nome, $detalhe); $script:falha++ }
}

# 1. Health check
try {
  $h = Invoke-RestMethod -Uri "$Base/api/health" -Method GET
  Verificar 'GET /api/health' ($h.status -eq 'ok') ($h | ConvertTo-Json -Compress)
} catch { Verificar 'GET /api/health' $false $_.Exception.Message }

# 2. Login do admin padrao (seed)
try {
  $loginAdmin = Invoke-RestMethod -Uri "$Base/api/auth/login" -Method POST -ContentType 'application/json' -Body (@{ email='admin@segueme.com.br'; senha='admin123' } | ConvertTo-Json)
  $tokenAdmin = $loginAdmin.token
  Verificar 'POST /api/auth/login (admin)' ($null -ne $tokenAdmin -and $loginAdmin.usuario.role -eq 'admin') ''
} catch { Verificar 'POST /api/auth/login (admin)' $false $_.Exception.Message; $tokenAdmin = $null }

# 3. Registro de um jovem de teste (409 = ja existe de teste anterior - ok)
$emailTeste = 'teste.etapa6@segueme.com.br'
try {
  $reg = Invoke-RestMethod -Uri "$Base/api/auth/registrar" -Method POST -ContentType 'application/json' -Body (@{ email=$emailTeste; senha='teste123'; role='jovem' } | ConvertTo-Json)
  Verificar 'POST /api/auth/registrar (jovem)' ($reg.usuario.role -eq 'jovem') ''
} catch { Verificar 'POST /api/auth/registrar (jovem; pode ja existir)' $true '' }

# 4. Login do jovem
try {
  $loginJovem = Invoke-RestMethod -Uri "$Base/api/auth/login" -Method POST -ContentType 'application/json' -Body (@{ email=$emailTeste; senha='teste123' } | ConvertTo-Json)
  $tokenJovem = $loginJovem.token
  Verificar 'POST /api/auth/login (jovem)' ($null -ne $tokenJovem -and $loginJovem.usuario.role -eq 'jovem') ''
} catch { Verificar 'POST /api/auth/login (jovem)' $false $_.Exception.Message; $tokenJovem = $null }

# 5. Jovem salva a ficha - POST /api/fichas (201 cria / 200 atualiza por RN03)
$ficha = @{
  nome = 'Maria Silva Santos'; data_nascimento = '2005-03-15'; telefone = '(11) 98888-7777'
  endereco = 'Rua das Flores, 123'; contato_emergencia = 'Joao Santos (11) 97777-6666'
  tamanho_camiseta = 'M'; paroquia_encontro = 'Paroquia Sao Jose'; ano_encontro = '2025/2026'
  origem_movimento = 'Convite de um amigo'; sacramentos = @('Batismo','Eucaristia','Crisma')
  serviu_lideranca = $true; lideranca_igreja = 'Grupo de jovens'; vontade_lideranca = 'Coordenacao'
  segues_trabalhados = '2022, 2023'; equipes_trabalhadas = 'Musica, Liturgia'; ultima_equipe_servida = 'Musica'
  participou_ed = $false; possui_instrumento = $true; toca_instrumento = 'Violao'; canta = $true
  quer_dar_palestra = $false; tem_alergias = $false; tem_filhos = $false; meio_transporte = 'Carona'
}
try {
  $respSalva = Invoke-WebRequest -UseBasicParsing -Uri "$Base/api/fichas" -Method POST -ContentType 'application/json' -Headers @{ Authorization = "Bearer $tokenJovem" } -Body ($ficha | ConvertTo-Json)
  Verificar 'POST /api/fichas (jovem salva -> 201/200)' ($respSalva.StatusCode -eq 201 -or $respSalva.StatusCode -eq 200) ("HTTP {0}" -f $respSalva.StatusCode)
} catch { Verificar 'POST /api/fichas (jovem salva -> 201/200)' $false $_.Exception.Message }

# 6. Jovem tenta LISTAR - 403 esperado (isAdmin)
try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri "$Base/api/fichas" -Method GET -Headers @{ Authorization = "Bearer $tokenJovem" }
  Verificar 'GET /api/fichas (jovem -> 403)' ($r.StatusCode -eq 403) ("HTTP {0}" -f $r.StatusCode)
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Verificar 'GET /api/fichas (jovem -> 403)' ($code -eq 403) ("HTTP {0}" -f $code)
}

# 7. Sem token - 401 esperado (verificarToken)
try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri "$Base/api/fichas" -Method GET
  Verificar 'GET /api/fichas (sem token -> 401)' ($r.StatusCode -eq 401) ''
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Verificar 'GET /api/fichas (sem token -> 401)' ($code -eq 401) ("HTTP {0}" -f $code)
}

# 8. Admin lista - 200 + ficha presente com usuario.email/role
$idFichaJovem = $null
try {
  $lista = Invoke-RestMethod -Uri "$Base/api/fichas" -Method GET -Headers @{ Authorization = "Bearer $tokenAdmin" }
  $encontrada = $lista.fichas | Where-Object { $_.usuario.email -eq $emailTeste }
  Verificar 'GET /api/fichas (admin -> 200 + dados)' ($lista.total -ge 1 -and $null -ne $encontrada -and $encontrada.usuario.role -eq 'jovem') ("total={0}" -f $lista.total)
  if ($encontrada) { $idFichaJovem = $encontrada.usuario_id }
} catch { Verificar 'GET /api/fichas (admin -> 200 + dados)' $false $_.Exception.Message }


# 9. Paginas estaticas (Tailwind via CDN)
try {
  $idx = Invoke-WebRequest -UseBasicParsing -Uri "$Base/index.html" -Method GET
  Verificar 'GET /index.html (abas Entrar/Criar Conta)' ($idx.StatusCode -eq 200 -and $idx.Content -match 'cdn\.tailwindcss\.com' -and $idx.Content -match 'aba-entrar' -and $idx.Content -match 'aba-criar') ''
} catch { Verificar 'GET /index.html' $false $_.Exception.Message }

try {
  $form = Invoke-WebRequest -UseBasicParsing -Uri "$Base/formulario.html" -Method GET
  Verificar 'GET /formulario.html (secoes + modal sucesso)' ($form.StatusCode -eq 200 -and $form.Content -match 'Dados Pessoais' -and $form.Content -match 'modal-sucesso' -and $form.Content -match 'fechar esta') ''
} catch { Verificar 'GET /formulario.html' $false $_.Exception.Message }

try {
  $adm = Invoke-WebRequest -UseBasicParsing -Uri "$Base/admin.html" -Method GET
  Verificar 'GET /admin.html (tabela + botao PDF)' ($adm.StatusCode -eq 200 -and $adm.Content -match 'fichas-tbody' -and $adm.Content -match 'Baixar PDF') ''
} catch { Verificar 'GET /admin.html' $false $_.Exception.Message }

try {
  $apijs = Invoke-WebRequest -UseBasicParsing -Uri "$Base/js/api.js" -Method GET
  Verificar 'GET /js/api.js (Bearer + localStorage)' ($apijs.StatusCode -eq 200 -and $apijs.Content -match 'Authorization' -and $apijs.Content -match 'localStorage') ''
} catch { Verificar 'GET /js/api.js' $false $_.Exception.Message }

# 10. PDF gerado silenciosamente pelo backend
if ($idFichaJovem) {
  try {
    $pdf = Invoke-WebRequest -UseBasicParsing -Uri "$Base/uploads/fichas_pdf/ficha_usuario_$idFichaJovem.pdf" -Method GET
    $ct = $pdf.Headers['Content-Type']
    Verificar "GET PDF ficha_usuario_$idFichaJovem.pdf" ($pdf.StatusCode -eq 200 -and "$ct" -match 'pdf') ("HTTP {0} CT={1}" -f $pdf.StatusCode, $ct)
  } catch { Verificar 'GET PDF da ficha' $false $_.Exception.Message }
} else {
  Verificar 'GET PDF da ficha' $false 'ficha do jovem nao encontrada'
}

# 11. Atualizacao (RN03 - mesma ficha, 200 esperado)
try {
  $ficha2 = $ficha.Clone(); $ficha2.telefone = '(11) 90000-1111'
  $r = Invoke-WebRequest -UseBasicParsing -Uri "$Base/api/fichas" -Method POST -ContentType 'application/json' -Headers @{ Authorization = "Bearer $tokenJovem" } -Body ($ficha2 | ConvertTo-Json)
  Verificar 'POST /api/fichas (atualizacao RN03 -> 200)' ($r.StatusCode -eq 200) ("HTTP {0}" -f $r.StatusCode)
} catch { Verificar 'POST /api/fichas (atualizacao RN03 -> 200)' $false $_.Exception.Message }

Write-Host ''
Write-Host ('========== RESULTADO: {0} OK / {1} FALHAS ==========' -f $ok, $falha)
if ($falha -gt 0) { exit 1 } else { exit 0 }
