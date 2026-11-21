const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { assertCallData, externalLink, recordingFolder, recordingFileName } = require('../ipc-validation');

test('call data must have a calls array and a time zone string', () => {
  const ok = { calls: [], timezone: 'Etc/GMT' };
  assert.equal(assertCallData(ok), ok);
  for (const bad of [null, undefined, 'x', {}, { calls: {}, timezone: 'Etc/GMT' }, { calls: [] }, { calls: [], timezone: 5 }]) assert.throws(() => assertCallData(bad), /Invalid data/);
});
test('only HTTPS links can be opened externally', () => {
  assert.equal(externalLink('https://example.com/a b?x=1'), 'https://example.com/a%20b?x=1');
  for (const bad of ['http://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'ms-msdt:/x', 'smb://host/share']) assert.throws(() => externalLink(bad), /Only HTTPS/, bad);
  for (const bad of ['not a url', '', undefined]) assert.throws(() => externalLink(bad), TypeError);
});
test('a relative or non-string recordings folder falls back to the default', () => {
  const abs = path.join(os.tmpdir(), 'rec');
  assert.equal(recordingFolder(abs, '/d'), abs);
  for (const bad of ['rec', '../rec', '', null, undefined, 5, {}]) assert.equal(recordingFolder(bad, '/d'), '/d');
});
test('recording file names are sanitised, bounded and always end in .webm', () => {
  const now = new Date('2026-11-21T10:20:30.456Z');
  assert.equal(recordingFileName('Weekly sync', now), '2026-11-21T10-20-30-456Z - Weekly sync.webm');
  assert.equal(recordingFileName('../../etc/passwd\\x:*?', now), '2026-11-21T10-20-30-456Z - etcpasswdx.webm');
  assert.equal(recordingFileName('///', now), '2026-11-21T10-20-30-456Z - Call.webm');
  assert.equal(recordingFileName(undefined, now).endsWith('- undefined.webm'), true);
  assert.equal(recordingFileName('a'.repeat(100), now), `2026-11-21T10-20-30-456Z - ${'a'.repeat(60)}.webm`);
  assert.doesNotMatch(recordingFileName('a/b\\c', now), /[\\/:]\s*[^ ]*\.webm$/);
});
