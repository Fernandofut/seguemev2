// Wrapper: executa validate_etapa5.js e salva saída em arquivo
const { spawnSync } = require('child_process');
const fs = require('fs');
const r = spawnSync(process.execPath, ['validate_etapa5.js'], { encoding: 'utf8', timeout: 90000 });
fs.writeFileSync('saida_etapa5.txt',
  `EXIT_CODE: ${r.status}\n--- STDOUT ---\n${r.stdout || ''}\n--- STDERR ---\n${r.stderr || ''}`, 'utf8');
console.log('FIM');