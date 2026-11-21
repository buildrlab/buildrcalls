'use strict';
const fs = require('node:fs/promises');
const { constants: fsConstants } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const SETUP_KINDS = ['whisper', 'model', 'ffmpeg'];

// Tool paths must be absolute and point at a real file; whisper and ffmpeg must also be executable. The result is
// the normalised absolute path to use. This runs both when a path is chosen and again right before it is spawned.
async function validateSetupFile(kind, value, platform = process.platform) {
  if (!SETUP_KINDS.includes(kind)) throw new Error('Unknown setup item');
  const label = kind;
  if (!value || typeof value !== 'string' || value.includes('\0')) throw new Error(`Choose the ${label} path in Settings first.`);
  if (!path.isAbsolute(value)) throw new Error(`${label} must be an absolute path: ${value}`);
  const resolved = path.resolve(value);
  const stat = await fs.stat(resolved).catch(() => { throw new Error(`${label} is not accessible: ${value}`); });
  if (!stat.isFile()) throw new Error(`${label} must be a file: ${value}`);
  if (kind !== 'model') {
    if (platform === 'win32') { if (path.extname(resolved).toLowerCase() !== '.exe') throw new Error(`${label} must be an .exe file: ${value}`); }
    else await fs.access(resolved, fsConstants.X_OK).catch(() => { throw new Error(`${label} is not executable: ${value}`); });
  }
  return resolved;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.once('error', error => reject(new Error(`Unable to start ${path.basename(command)}: ${error.message}`)));
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed (${code}): ${stderr.trim().slice(-600)}`)));
  });
}
function normalize(raw) {
  if (!Array.isArray(raw?.transcription)) throw new Error('Whisper returned an invalid transcript.');
  return raw.transcription.map(segment => ({ start: Number(segment.offsets?.from) / 1000, end: Number(segment.offsets?.to) / 1000, text: String(segment.text || '').trim() })).filter(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.text);
}
function transcriptPath(recording) { return recording + '.transcript.json'; }
async function readTranscript(recording) {
  try { const value=JSON.parse(await fs.readFile(transcriptPath(recording),'utf8')); if (!Array.isArray(value.segments)) throw new Error('Invalid transcript'); return value.segments; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function transcribe({recording, whisper, model, ffmpeg}, onPhase = () => {}) {
  if (!recording || typeof recording !== 'string' || !path.isAbsolute(recording)) throw new Error('Choose the recording path in Settings first.');
  await fs.access(recording).catch(() => { throw new Error(`recording is not accessible: ${recording}`); });
  whisper = await validateSetupFile('whisper', whisper); model = await validateSetupFile('model', model); ffmpeg = await validateSetupFile('ffmpeg', ffmpeg);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buildrcalls-transcribe-'));
  try {
    const wav=path.join(temp,'audio.wav'), output=path.join(temp,'result');
    onPhase('Extracting audio');
    await run(ffmpeg, ['-hide_banner','-loglevel','error','-nostdin','-y','-i',recording,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',wav]);
    onPhase('Transcribing on this computer');
    await run(whisper, ['-m',model,'-f',wav,'-oj','-of',output,'-l','auto']);
    const segments=normalize(JSON.parse(await fs.readFile(output+'.json','utf8')));
    const destination=transcriptPath(recording), tempOutput=destination+'.tmp';
    await fs.writeFile(tempOutput, JSON.stringify({version:1,segments},null,2), {mode:0o600});
    await fs.rename(tempOutput,destination);
    return segments;
  } finally { await fs.rm(temp,{recursive:true,force:true}); }
}
module.exports = { transcribe, readTranscript, transcriptPath, normalize, validateSetupFile, SETUP_KINDS };
