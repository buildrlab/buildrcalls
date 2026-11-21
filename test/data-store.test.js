const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readData, saveData } = require('../data-store');

const temp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'buildrcalls-')), 'calls.json');
const good = { calls: [{ id: 'a' }], timezone: 'Europe/Dublin' };

test('a missing file is a fresh install with no notice', () => {
  assert.deepEqual(readData(temp()), { data: { calls: [], timezone: 'Etc/GMT' }, notice: '' });
});
test('saved data round-trips', () => {
  const file = temp(); saveData(file, good);
  assert.deepEqual(readData(file), { data: good, notice: '' });
});
test('a corrupt file is set aside, not overwritten, and the empty default is used without a backup', () => {
  const file = temp(); fs.writeFileSync(file, '{"calls": [');
  const { data, notice } = readData(file, new Date('2026-01-02T03:04:05.678Z'));
  assert.deepEqual(data, { calls: [], timezone: 'Etc/GMT' });
  assert.match(notice, /calls\.json\.corrupt-2026-01-02T03-04-05-678Z/);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(file + '.corrupt-2026-01-02T03-04-05-678Z', 'utf8'), '{"calls": [');
});
test('valid JSON of the wrong shape is treated as corrupt', () => {
  const file = temp(); fs.writeFileSync(file, '[]');
  assert.match(readData(file).notice, /set aside/);
});
test('a corrupt file falls back to the last backup', () => {
  const file = temp(); saveData(file, good); saveData(file, { ...good, calls: [] });
  fs.writeFileSync(file, 'garbage');
  const { data, notice } = readData(file);
  assert.deepEqual(data, good);
  assert.match(notice, /backup was restored/);
});
test('saving never backs up a corrupt file', () => {
  const file = temp(); saveData(file, good); saveData(file, good); fs.writeFileSync(file, 'garbage'); saveData(file, { ...good, calls: [] });
  assert.deepEqual(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')), good);
});
test('errors other than missing or unparsable are thrown', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildrcalls-'));
  assert.throws(() => readData(dir), { code: 'EISDIR' });
});
