const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {RecordingStore} = require('../recording-store');
test('simultaneous recording outputs remain separate and can stop independently',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buildrcalls-test-'));const store=new RecordingStore();
 try {
  const [first,second]=await Promise.all([store.start('a','same title',dir),store.start('b','same title',dir)]);
  assert.notEqual(first,second);
  await Promise.all([store.write('a',Buffer.from('audio A')),store.write('b',Buffer.from('audio B'))]);
  await store.stop('a');await store.write('b',Buffer.from(' more'));await store.stop('b');
  assert.equal(await fs.readFile(first,'utf8'),'audio A');assert.equal(await fs.readFile(second,'utf8'),'audio B more');
  await assert.rejects(store.write('a',Buffer.from('late')),/not active/);
 } finally {await fs.rm(dir,{recursive:true,force:true})}
});
