const { fs, path, root, settings, pg, stamp, assertPlainTree } = require('./local-data.cjs');
try {
  const { storage, env } = settings();
  const backupRoot = path.join(root, 'backups');
  if (backupRoot === storage || backupRoot.startsWith(storage + path.sep) || storage.startsWith(backupRoot + path.sep))
    throw new Error('Multimedia y backups deben estar separados.');
  pg('pg_dump', ['--version'], env);
  assertPlainTree(storage);
  const destination = path.join(backupRoot, stamp());
  fs.mkdirSync(destination, { recursive: true });
  pg('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--schema=public', '--file', path.join(destination, 'database.dump')], env);
  const media = path.join(destination, 'storage');
  if (fs.existsSync(storage)) fs.cpSync(storage, media, { recursive: true });
  else fs.mkdirSync(media);
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), schema: 'public' }, null, 2));
  console.log(`Backup completo: ${destination}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
