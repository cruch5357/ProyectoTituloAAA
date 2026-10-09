const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');

function settings() {
  require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env') });
  let url;
  try { url = new URL(process.env.DATABASE_URL); } catch { throw new Error('DATABASE_URL inválida o ausente.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Este script admite solamente PostgreSQL local.');
  if (url.searchParams.get('schema') && url.searchParams.get('schema') !== 'public')
    throw new Error('Este backup cubre el schema public; se requiere schema=public.');
  const storage = path.resolve(backend, process.env.CHAT_STORAGE_DIR || 'storage/chat');
  if (storage === root || root.startsWith(storage + path.sep) || storage === backend || storage.startsWith(path.join(root, 'frontend') + path.sep))
    throw new Error('Directorio de multimedia inseguro.');
  return { storage, env: { ...process.env, PGHOST: url.hostname.replace(/[\[\]]/g, ''), PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)) } };
}

function pg(tool, args, env) {
  const executable = process.env.PG_BIN ? path.join(process.env.PG_BIN, tool + (process.platform === 'win32' ? '.exe' : '')) : tool;
  const result = spawnSync(executable, args, { env, encoding: 'utf8', windowsHide: true });
  if (result.error?.code === 'ENOENT') throw new Error(`${tool} no disponible. Agrega PostgreSQL bin a PATH o define PG_BIN.`);
  if (result.error || result.status !== 0) throw new Error(`${tool} falló; verifica versión, conexión y permisos. No se muestran credenciales.`);
  return result.stdout;
}

function assertPlainTree(directory) {
  if (!fs.existsSync(directory)) return;
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('No se admiten enlaces simbólicos en multimedia.');
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error('No se admiten enlaces simbólicos en multimedia.');
    if (item.isDirectory()) assertPlainTree(child);
  }
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
module.exports = { fs, path, root, settings, pg, stamp, assertPlainTree };
