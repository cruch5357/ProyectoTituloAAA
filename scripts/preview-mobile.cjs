// Lanza el build compilado con el certificado local, sin alterar el sistema.
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const child = spawn(process.execPath, [resolve(__dirname, '../frontend/node_modules/vite/bin/vite.js'), 'preview'], {
  cwd: resolve(__dirname, '../frontend'),
  env: { ...process.env, LOCAL_HTTPS: '1' },
  stdio: 'inherit',
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
