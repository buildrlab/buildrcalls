const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { normalize, readTranscript, transcriptPath, transcribe, validateSetupFile } = require('../transcription');
const posix = process.platform === 'win32' ? { skip: 'needs POSIX executables' } : {};
test('converts Whisper segment offsets to seconds and drops invalid or empty segments', () => {
  assert.deepEqual(normalize({transcription:[{offsets:{from:1250,to:2500},text:'  hello  '},{offsets:{from:2,to:3},text:' '},{offsets:{},text:'invalid'}]}),[{start:1.25,end:2.5,text:'hello'}]);
  assert.throws(()=>normalize({}), /invalid transcript/);
});
test('saved transcripts can be read next to a recording', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'buildrcalls-test-'));
  try { const recording=path.join(dir,'recording.webm');assert.equal(await readTranscript(recording),null);await fs.writeFile(transcriptPath(recording),JSON.stringify({version:1,segments:[{start:1,end:2,text:'Hello'}]}));assert.deepEqual(await readTranscript(recording),[{start:1,end:2,text:'Hello'}]); }
  finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('a missing executable fails before creating a transcript', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buildrcalls-test-'));
  try { const recording=path.join(dir,'r.webm');await fs.writeFile(recording,'x');await assert.rejects(transcribe({recording,whisper:path.join(dir,'missing'),model:'missing',ffmpeg:'missing'}),/whisper is not accessible/);assert.equal(await readTranscript(recording),null); }
  finally { await fs.rm(dir,{recursive:true,force:true}); }
});

async function withDir(run) { const dir = await fs.mkdtemp(path.join(os.tmpdir(),'buildrcalls-test-')); try { await run(dir); } finally { await fs.rm(dir,{recursive:true,force:true}); } }
async function writeTool(file, body, mode = 0o755) { await fs.writeFile(file, body, {mode}); await fs.chmod(file, mode); return file; }
const stubFfmpeg = '#!/bin/sh\nfor last; do :; done\n: > "$last"\n';
const stubWhisper = '#!/bin/sh\nwhile [ $# -gt 0 ]; do if [ "$1" = "-of" ]; then out="$2"; fi; shift; done\nprintf \'{"transcription":[{"offsets":{"from":0,"to":1500},"text":" hi there "}]}\' > "$out.json"\n';
test('setup paths must be absolute files, and tools must be executable', posix, () => withDir(async dir => {
  const tool = await writeTool(path.join(dir,'tool'), '#!/bin/sh\n'), plain = await writeTool(path.join(dir,'model.bin'), 'x', 0o644);
  assert.equal(await validateSetupFile('ffmpeg', path.join(dir,'sub','..','tool')), tool);
  assert.equal(await validateSetupFile('model', plain), plain);
  await assert.rejects(validateSetupFile('whisper', 'tool'), /absolute path/);
  await assert.rejects(validateSetupFile('whisper', ''), /Choose the whisper path/);
  await assert.rejects(validateSetupFile('whisper', {}), /Choose the whisper path/);
  await assert.rejects(validateSetupFile('whisper', path.join(dir,'missing')), /whisper is not accessible/);
  await assert.rejects(validateSetupFile('whisper', dir), /must be a file/);
  await assert.rejects(validateSetupFile('ffmpeg', plain), /ffmpeg is not executable/);
  await assert.rejects(validateSetupFile('model', dir), /must be a file/);
  await assert.rejects(validateSetupFile('shell', tool), /Unknown setup item/);
}));
test('on Windows only .exe files can be chosen as tools', async () => withDir(async dir => {
  const exe = await writeTool(path.join(dir,'whisper-cli.EXE'), 'x'), other = await writeTool(path.join(dir,'run.cmd'), 'x');
  assert.equal(await validateSetupFile('whisper', exe, 'win32'), exe);
  await assert.rejects(validateSetupFile('whisper', other, 'win32'), /must be an \.exe file/);
  assert.equal(await validateSetupFile('model', other, 'win32'), other);
}));
test('transcribing runs the chosen tools and saves the transcript next to the recording', posix, () => withDir(async dir => {
  const recording = path.join(dir,'r.webm'), phases = [];
  await fs.writeFile(recording,'x');
  const ffmpeg = await writeTool(path.join(dir,'ffmpeg'), stubFfmpeg), whisper = await writeTool(path.join(dir,'whisper-cli'), stubWhisper), model = await writeTool(path.join(dir,'model.bin'), 'x', 0o644);
  assert.deepEqual(await transcribe({recording,whisper,model,ffmpeg}, phase => phases.push(phase)), [{start:0,end:1.5,text:'hi there'}]);
  assert.deepEqual(phases, ['Extracting audio','Transcribing on this computer']);
  assert.deepEqual(await readTranscript(recording), [{start:0,end:1.5,text:'hi there'}]);
}));
test('a tool that is not an executable file is never spawned', posix, () => withDir(async dir => {
  const recording = path.join(dir,'r.webm'), marker = path.join(dir,'ran');
  await fs.writeFile(recording,'x');
  const whisper = await writeTool(path.join(dir,'whisper-cli'), stubWhisper), model = await writeTool(path.join(dir,'model.bin'), 'x', 0o644);
  const ffmpeg = await writeTool(path.join(dir,'ffmpeg'), `#!/bin/sh\ntouch "${marker}"\n`, 0o644);
  await assert.rejects(transcribe({recording,whisper,model,ffmpeg}), /ffmpeg is not executable/);
  await assert.rejects(transcribe({recording,whisper,model,ffmpeg:'ffmpeg'}), /ffmpeg must be an absolute path/);
  await assert.rejects(transcribe({recording:'r.webm',whisper,model,ffmpeg}), /recording/);
  await assert.rejects(fs.access(marker));
  assert.equal(await readTranscript(recording), null);
}));
