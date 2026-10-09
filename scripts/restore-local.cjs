const { fs, path, settings, pg, stamp, assertPlainTree } = require('./local-data.cjs');
try {
  const [source, confirmation] = process.argv.slice(2);
  if (!source || confirmation !== '--confirm') throw new Error('ADVERTENCIA: modifica la DB y multimedia de destino. Detén la aplicación. Uso: npm run restore:local -- <backup> --confirm');
  const { storage, env } = settings();
  const backup = fs.realpathSync(path.resolve(source));
  if (backup === storage || backup.startsWith(storage + path.sep) || storage.startsWith(backup + path.sep)) throw new Error('Backup y destino deben estar separados.');
  const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.schema !== 'public') throw new Error('Backup incompatible.');
  const dump = path.join(backup, 'database.dump');
  const media = path.join(backup, 'storage');
  if (!fs.statSync(dump).isFile() || !fs.statSync(media).isDirectory()) throw new Error('Backup incompleto.');
  assertPlainTree(media);
  assertPlainTree(storage);
  pg('pg_restore', ['--list', dump], env);
  const staged = storage + '.restore-' + stamp();
  fs.cpSync(media, staged, { recursive: true, errorOnExist: true, force: false });
  console.log('Restaurando DB local de destino; la aplicación debe permanecer detenida.');
  pg('pg_restore', ['--dbname', env.PGDATABASE, '--single-transaction', '--exit-on-error', '--clean', '--if-exists', '--no-owner', '--no-acl', dump], env);
  if (fs.existsSync(storage)) fs.renameSync(storage, storage + '.before-restore-' + stamp());
  fs.renameSync(staged, storage);
  console.log('Restauración completada. Multimedia anterior conservada junto al directorio de destino.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
