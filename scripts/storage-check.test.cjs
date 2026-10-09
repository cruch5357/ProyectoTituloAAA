const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspectStorage } = require('./storage-check.cjs');
const key = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const missing = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aaa-storage-test-'));
  t.after(() => {
    const target = path.resolve(dir);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('aaa-storage-test-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  return dir;
}

test('reports missing and orphan files without changing their contents', (t) => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, key), 'private attachment');
  fs.writeFileSync(path.join(dir, 'orphan'), 'keep this');
  const result = inspectStorage(dir, [{ storageKey: key }, { storageKey: missing }]);
  assert.deepEqual(result.orphanFiles, ['orphan']);
  assert.deepEqual(result.missingFiles, [missing]);
  assert.equal(fs.readFileSync(path.join(dir, 'orphan'), 'utf8'), 'keep this');
  assert.equal(fs.readFileSync(path.join(dir, key), 'utf8'), 'private attachment');
});

test('missing storage directory reports all referenced files', (t) => {
  const dir = fixture(t);
  assert.deepEqual(inspectStorage(path.join(dir, 'absent'), [{ storageKey: key }]).missingFiles, [key]);
});

test('unexpected directories and invalid metadata paths are not traversed', (t) => {
  const dir = fixture(t);
  fs.mkdirSync(path.join(dir, 'nested'));
  fs.writeFileSync(path.join(dir, 'nested', 'private'), 'untouched');
  const result = inspectStorage(dir, [{ storageKey: '../outside' }]);
  assert.deepEqual(result.unexpectedEntries, ['nested']);
  assert.deepEqual(result.invalidKeys, ['../outside']);
  assert.equal(result.physicalFiles, 0);
});
