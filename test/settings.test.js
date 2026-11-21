const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { readSettings, loadSettings, setTranscriptionPath, withoutPrivateSettings, defaultRecordingsFolder, isRecordingFile } = require('../settings');
const posix = process.platform === 'win32' ? { skip: 'needs POSIX executables' } : {};
async function withDir(run) { const dir = await fs.mkdtemp(path.join(os.tmpdir(),'buildrcalls-test-')); try { await run(dir); } finally { await fs.rm(dir,{recursive:true,force:true}); } }
async function writeFile(file, mode) { await fs.writeFile(file, '#!/bin/sh\n', {mode}); await fs.chmod(file, mode); return file; }

test('a missing settings file is reported so it can be migrated, and a damaged one is empty', () => withDir(async dir => {
  const file = path.join(dir,'settings.json');
  assert.equal(await readSettings(file), null);
  await fs.writeFile(file,'{not json');
  assert.deepEqual(await readSettings(file), {transcription:{}});
  await fs.writeFile(file,JSON.stringify({transcription:{whisper:'/a',model:5,ffmpeg:'',extra:'/b'}}));
  assert.deepEqual(await readSettings(file), {transcription:{whisper:'/a'}});
}));
test('tool paths from the old calls.json are adopted once and only if they are still valid', posix, () => withDir(async dir => {
  const file = path.join(dir,'settings.json'), whisper = await writeFile(path.join(dir,'whisper-cli'), 0o755), model = await writeFile(path.join(dir,'model.bin'), 0o644);
  const legacy = {whisper, model, ffmpeg:path.join(dir,'gone')};
  assert.deepEqual(await loadSettings(file, legacy), {transcription:{whisper, model}});
  assert.equal(((await fs.stat(file)).mode & 0o777), 0o600);
  assert.deepEqual(await loadSettings(file, {whisper:'/bin/sh', ffmpeg:'/bin/sh'}), {transcription:{whisper, model}});
}));
test('legacy paths that are not executable files are not adopted', posix, () => withDir(async dir => {
  const plain = await writeFile(path.join(dir,'whisper-cli'), 0o644);
  assert.deepEqual(await loadSettings(path.join(dir,'settings.json'), {whisper:plain, ffmpeg:'relative/ffmpeg', model:dir}), {transcription:{}});
  assert.deepEqual(await loadSettings(path.join(dir,'other.json'), undefined), {transcription:{}});
}));
test('a chosen tool is validated and saved', posix, () => withDir(async dir => {
  const file = path.join(dir,'settings.json'), ffmpeg = await writeFile(path.join(dir,'ffmpeg'), 0o755);
  assert.equal(await setTranscriptionPath(file, undefined, 'ffmpeg', ffmpeg), ffmpeg);
  assert.deepEqual(await readSettings(file), {transcription:{ffmpeg}});
  await assert.rejects(setTranscriptionPath(file, undefined, 'whisper', path.join(dir,'missing')), /not accessible/);
  await assert.rejects(setTranscriptionPath(file, undefined, 'whisper', 'whisper-cli'), /absolute path/);
  assert.deepEqual(await readSettings(file), {transcription:{ffmpeg}});
}));
test('main-only settings are stripped from renderer data without changing the input', () => {
  const data = {calls:[], timezone:'Etc/GMT', recordingFolder:'/x', transcription:{whisper:'/bin/sh'}};
  assert.deepEqual(withoutPrivateSettings(data), {calls:[], timezone:'Etc/GMT', recordingFolder:'/x'});
  assert.ok(data.transcription);
});
test('new installs use BuildrCalls while an existing Callkeeper folder keeps being used', () => withDir(async dir => {
  assert.equal(await defaultRecordingsFolder(dir), path.join(dir,'BuildrCalls'));
  await fs.mkdir(path.join(dir,'Callkeeper'));
  assert.equal(await defaultRecordingsFolder(dir), path.join(dir,'Callkeeper'));
  await fs.mkdir(path.join(dir,'BuildrCalls'));
  assert.equal(await defaultRecordingsFolder(dir), path.join(dir,'BuildrCalls'));
}));
test('only absolute .webm paths are treated as recordings', () => {
  assert.equal(isRecordingFile(path.join(os.tmpdir(),'a.webm')), true);
  assert.equal(isRecordingFile(path.join(os.tmpdir(),'a.WEBM')), true);
  for (const value of ['a.webm', path.join(os.tmpdir(),'a.json'), path.join(os.tmpdir(),'a.webm.transcript.json'), '', null, {}]) assert.equal(isRecordingFile(value), false);
});
