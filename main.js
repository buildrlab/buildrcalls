const { app, BrowserWindow, ipcMain, shell, desktopCapturer, session, systemPreferences, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const transcription = require('./transcription');
const settings = require('./settings');
const transcriptionJobs = new Set();
let win, stream, activeId = null;
const dataPath = () => path.join(app.getPath('userData'), 'calls.json');
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
// Settings are loaded, migrated and written one at a time so concurrent handlers cannot race on settings.json.
let settingsQueue = Promise.resolve();
function serialSettings(task) { const run = settingsQueue.then(task); settingsQueue = run.catch(() => {}); return run; }
const loadSettings = () => serialSettings(() => settings.loadSettings(settingsPath(), readData().transcription));
function detectSetup() {
  const first = paths => paths.find(p => fs.existsSync(p)) || '';
  return {
    whisper: process.platform === 'darwin' ? first(['/opt/homebrew/bin/whisper-cli','/usr/local/bin/whisper-cli']) : '',
    ffmpeg: process.platform === 'darwin' ? first(['/opt/homebrew/bin/ffmpeg','/usr/local/bin/ffmpeg']) : '',
    model: first([path.join(__dirname,'.models','ggml-tiny.en.bin')])
  };
}
// A tool the user chose (kept in main-process settings) wins over the usual install locations.
async function effectiveSetup() { const chosen = (await loadSettings()).transcription, detected = detectSetup(); return Object.fromEntries(transcription.SETUP_KINDS.map(kind => [kind, chosen[kind] || detected[kind] || ''])); }
function readData() { try { return JSON.parse(fs.readFileSync(dataPath(), 'utf8')); } catch { return { calls: [], timezone: 'Etc/GMT' }; } }
function saveData(data) { fs.mkdirSync(path.dirname(dataPath()), { recursive: true }); const tmp = dataPath() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); fs.renameSync(tmp, dataPath()); }
function createWindow() {
  win = new BrowserWindow({width: 1440, height: 920, minWidth: 1020, minHeight: 700, backgroundColor:'#f6f5f0', title:'BuildrCalls', webPreferences:{preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false, sandbox:true}});
  win.loadFile('index.html');
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
}
app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try { const sources = await desktopCapturer.getSources({types:['screen'], thumbnailSize:{width:0,height:0}}); if (!sources.length) return callback({}); callback({video:sources[0], audio:'loopback'}); } catch { callback({}); }
  });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
ipcMain.handle('data:read', () => settings.withoutPrivateSettings(readData()));
ipcMain.handle('data:save', async (_e, data) => { if (!data || !Array.isArray(data.calls) || typeof data.timezone !== 'string') throw Error('Invalid data'); await loadSettings(); saveData(settings.withoutPrivateSettings(data)); });
ipcMain.handle('open:link', async (_e, url) => { const parsed = new URL(url); if (parsed.protocol !== 'https:') throw Error('Only HTTPS links are supported'); await shell.openExternal(parsed.href); });
ipcMain.handle('record:start', async (_e, id, title) => {
  const chosen = readData().recordingFolder, dir = typeof chosen === 'string' && path.isAbsolute(chosen) ? chosen : await settings.defaultRecordingsFolder(app.getPath('videos'));
  if (stream) throw Error('A recording is already in progress');
  fs.mkdirSync(dir,{recursive:true});
  const safe = String(title).replace(/[^a-z0-9 -]/gi,'').trim().slice(0,60) || 'Call';
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g,'-')} - ${safe}.webm`);
  stream = fs.createWriteStream(file, {flags:'wx'}); activeId = id; stream.on('error', (err) => { win?.webContents.send('record:error', err.message); stream = null; activeId = null; }); return file;
});
ipcMain.handle('record:chunk', async (_e, id, bytes) => { if (!stream || activeId !== id) throw Error('Recording is not active'); await new Promise((resolve,reject) => stream.write(Buffer.from(bytes), err => err ? reject(err) : resolve())); });
ipcMain.handle('record:stop', async (_e,id) => { if (!stream || activeId !== id) return; const current = stream; stream = null; activeId = null; await new Promise((resolve,reject) => current.end(err => err ? reject(err) : resolve())); });
function findRecording(id) { const call = readData().calls.find(c => c.id === id); if (!call || !call.file || call.status === 'recording') throw Error('Recording is not available yet.'); if (!settings.isRecordingFile(call.file)) throw Error('Recording file path is not valid.'); if (!fs.existsSync(call.file)) throw Error('Recording file is unavailable. Check the folder and Google Drive sync.'); return call.file; }
ipcMain.handle('file:show', (_e,id) => shell.showItemInFolder(findRecording(id)));
ipcMain.handle('file:play', (_e,id) => pathToFileURL(findRecording(id)).href);
ipcMain.handle('folder:choose', async () => { const result = await dialog.showOpenDialog(win, { title:'Choose a recordings folder', properties:['openDirectory','createDirectory'] }); return result.canceled ? null : result.filePaths[0]; });
ipcMain.handle('folder:default', () => settings.defaultRecordingsFolder(app.getPath('videos')));
ipcMain.handle('permissions', () => ({screen: process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'unknown', platform:process.platform}));

ipcMain.handle('setup:choose-file', async (_e, kind) => {
  if (!['whisper','model','ffmpeg'].includes(kind)) throw Error('Unknown setup item');
  const result = await dialog.showOpenDialog(win, {title: kind === 'model' ? 'Choose a Whisper GGML model' : `Choose ${kind === 'whisper' ? 'whisper-cli' : 'FFmpeg'}`, properties:['openFile']});
  if (result.canceled) return null;
  return serialSettings(() => settings.setTranscriptionPath(settingsPath(), readData().transcription, kind, result.filePaths[0]));
});
ipcMain.handle('transcript:read', async (_e, id) => transcription.readTranscript(findRecording(id)));
ipcMain.handle('transcript:run', async (_e, id) => {
  const recording = findRecording(id), config = await effectiveSetup();
  if (transcriptionJobs.has(id)) throw Error('This recording is already being transcribed.');
  transcriptionJobs.add(id);
  try { return await transcription.transcribe({recording, whisper:config.whisper, model:config.model, ffmpeg:config.ffmpeg}, phase => win?.webContents.send('transcript:phase', id, phase)); }
  finally { transcriptionJobs.delete(id); }
});

ipcMain.handle('setup:detect', () => effectiveSetup());
