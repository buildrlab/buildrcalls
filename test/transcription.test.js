const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { normalize, readTranscript, transcriptPath, transcribe } = require('../transcription');
test('converts Whisper segment offsets to seconds and drops invalid or empty segments', () => {
  assert.deepEqual(normalize({transcription:[{offsets:{from:1250,to:2500},text:'  hello  '},{offsets:{from:2,to:3},text:' '},{offsets:{},text:'invalid'}]}),[{start:1.25,end:2.5,text:'hello'}]);
  assert.throws(()=>normalize({}), /invalid transcript/);
});
test('saved transcripts can be read next to a recording', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'callkeeper-test-'));
  try { const recording=path.join(dir,'recording.webm');assert.equal(await readTranscript(recording),null);await fs.writeFile(transcriptPath(recording),JSON.stringify({version:1,segments:[{start:1,end:2,text:'Hello'}]}));assert.deepEqual(await readTranscript(recording),[{start:1,end:2,text:'Hello'}]); }
  finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('a missing executable fails before creating a transcript', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'callkeeper-test-'));
  try { const recording=path.join(dir,'r.webm');await fs.writeFile(recording,'x');await assert.rejects(transcribe({recording,whisper:path.join(dir,'missing'),model:'missing',ffmpeg:'missing'}),/whisper is not accessible/);assert.equal(await readTranscript(recording),null); }
  finally { await fs.rm(dir,{recursive:true,force:true}); }
});
