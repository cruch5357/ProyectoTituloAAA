const { fs, path, settings } = require('./local-data.cjs');

// Read-only reconciliation. Attachment keys are flat; unexpected entries are reported, never followed.
function inspectStorage(storage, attachments) {
  const expected = new Set(attachments.map((a) => a.storageKey));
  const files = new Set();
  const unexpected = [];
  if (fs.existsSync(storage)) {
    if (fs.lstatSync(storage).isSymbolicLink() || !fs.lstatSync(storage).isDirectory())
      throw new Error('El directorio de storage debe ser un directorio real, sin enlaces.');
    for (const entry of fs.readdirSync(storage, { withFileTypes: true })) {
      if (entry.isFile()) files.add(entry.name);
      else unexpected.push(entry.name);
    }
  }
  return {
    mode: 'read-only',
    referencedFiles: expected.size,
    physicalFiles: files.size,
    orphanFiles: [...files].filter((key) => !expected.has(key)).sort(),
    missingFiles: [...expected].filter((key) => !files.has(key)).sort(),
    invalidKeys: [...expected].filter((key) => !/^[a-f0-9-]{36}$/.test(key)).sort(),
    unexpectedEntries: unexpected.sort(),
  };
}

async function main() {
  const { storage } = settings();
  const { PrismaClient } = require('../backend/node_modules/@prisma/client');
  const prisma = new PrismaClient();
  try {
    const attachments = await prisma.messageAttachment.findMany({ select: { storageKey: true } });
    const report = inspectStorage(storage, attachments);
    console.log(JSON.stringify(report, null, 2));
    if (report.orphanFiles.length || report.missingFiles.length || report.invalidKeys.length || report.unexpectedEntries.length)
      process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main().catch(() => {
  console.error('No se pudo comprobar storage. Revisa conexión, ruta y permisos; no se modificaron archivos.');
  process.exitCode = 1;
});
module.exports = { inspectStorage };
