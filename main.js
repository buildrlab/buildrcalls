const { app, BrowserWindow, ipcMain, shell, desktopCapturer, session, systemPreferences, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const transcription = require('./transcription');
const { isWebinarJam, WebinarSession } = require('./webinarjam');
const attendeeProfile = require('./attendee-profile');
const webinarWindows = new Map();
const transcriptionJobs = new Set();
let win, stream, activeId = null;
const dataPath = () => path.join(app.getPath('userData'), 'calls.json');
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
ipcMain.handle('data:read', () => readData());
ipcMain.handle('data:save', (_e, data) => { if (!data || !Array.isArray(data.calls) || typeof data.timezone !== 'string') throw Error('Invalid data'); saveData(data); });
ipcMain.handle('open:link', async (_e, url) => { const parsed = new URL(url); if (parsed.protocol !== 'https:') throw Error('Only HTTPS links are supported'); await shell.openExternal(parsed.href); });
const attendeeProfilePath = () => path.join(app.getPath('appData'), 'BuildrCalls', 'attendee-profile.json');
ipcMain.handle('attendee:read', () => attendeeProfile.readProfile(attendeeProfilePath()));
ipcMain.handle('attendee:save', (_e,profile) => attendeeProfile.saveProfile(attendeeProfilePath(),profile));
ipcMain.handle('webinar:open', async (_e, id) => {
  const call = readData().calls.find(c => c.id === id);
  if (!call || call.platform !== 'WebinarJam' || !isWebinarJam(call.url)) throw Error('Use a WebinarJam HTTPS link for automatic playback.');
  let existing=webinarWindows.get(id);if(existing && !existing.isDestroyed()){existing.show();existing.focus();return;}
  const meeting = new BrowserWindow({width:1200,height:850,title:'BuildrCalls · WebinarJam',webPreferences:{partition:'persist:buildrcalls-webinarjam',sandbox:true,contextIsolation:true,nodeIntegration:false}});
  webinarWindows.set(id,meeting);
  meeting.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  const monitor=new WebinarSession({window:meeting,getProfile:()=>attendeeProfile.readProfile(attendeeProfilePath()),onStatus:status=>win?.webContents.send('webinar:status',id,status)});
  monitor.start();meeting.on('closed',()=>{webinarWindows.delete(id);win?.webContents.send('webinar:status',id,'Webinar window closed');});
  try{await meeting.loadURL(call.url)}catch(error){monitor.stop();meeting.close();throw error;}
});
ipcMain.handle('record:start', (_e, id, title) => {
  if (stream) throw Error('A recording is already in progress');
  const dir = readData().recordingFolder || path.join(app.getPath('videos'), 'Callkeeper'); fs.mkdirSync(dir,{recursive:true});
  const safe = String(title).replace(/[^a-z0-9 -]/gi,'').trim().slice(0,60) || 'Call';
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g,'-')} - ${safe}.webm`);
  stream = fs.createWriteStream(file, {flags:'wx'}); activeId = id; stream.on('error', (err) => { win?.webContents.send('record:error', err.message); stream = null; activeId = null; }); return file;
});
ipcMain.handle('record:chunk', async (_e, id, bytes) => { if (!stream || activeId !== id) throw Error('Recording is not active'); await new Promise((resolve,reject) => stream.write(Buffer.from(bytes), err => err ? reject(err) : resolve())); });
ipcMain.handle('record:stop', async (_e,id) => { if (!stream || activeId !== id) return; const current = stream; stream = null; activeId = null; await new Promise((resolve,reject) => current.end(err => err ? reject(err) : resolve())); });
function findRecording(id) { const call = readData().calls.find(c => c.id === id); if (!call || !call.file || call.status === 'recording') throw Error('Recording is not available yet.'); if (!fs.existsSync(call.file)) throw Error('Recording file is unavailable. Check the folder and Google Drive sync.'); return call.file; }
ipcMain.handle('file:show', (_e,id) => shell.showItemInFolder(findRecording(id)));
ipcMain.handle('file:play', (_e,id) => pathToFileURL(findRecording(id)).href);
ipcMain.handle('folder:choose', async () => { const result = await dialog.showOpenDialog(win, { title:'Choose a recordings folder', properties:['openDirectory','createDirectory'] }); return result.canceled ? null : result.filePaths[0]; });
ipcMain.handle('folder:default', () => path.join(app.getPath('videos'), 'Callkeeper'));
ipcMain.handle('permissions', () => ({screen: process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'unknown', platform:process.platform}));

ipcMain.handle('setup:choose-file', async (_e, kind) => {
  if (!['whisper','model','ffmpeg'].includes(kind)) throw Error('Unknown setup item');
  const result = await dialog.showOpenDialog(win, {title: kind === 'model' ? 'Choose a Whisper GGML model' : `Choose ${kind === 'whisper' ? 'whisper-cli' : 'FFmpeg'}`, properties:['openFile']});
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('transcript:read', async (_e, id) => transcription.readTranscript(findRecording(id)));
ipcMain.handle('transcript:run', async (_e, id) => {
  const recording = findRecording(id), config = readData().transcription || {};
  if (transcriptionJobs.has(id)) throw Error('This recording is already being transcribed.');
  transcriptionJobs.add(id);
  try { return await transcription.transcribe({recording, whisper:config.whisper, model:config.model, ffmpeg:config.ffmpeg}, phase => win?.webContents.send('transcript:phase', id, phase)); }
  finally { transcriptionJobs.delete(id); }
});

ipcMain.handle('setup:detect', () => {
  const first = paths => paths.find(p => fs.existsSync(p)) || '';
  return {
    whisper: process.platform === 'darwin' ? first(['/opt/homebrew/bin/whisper-cli','/usr/local/bin/whisper-cli']) : '',
    ffmpeg: process.platform === 'darwin' ? first(['/opt/homebrew/bin/ffmpeg','/usr/local/bin/ffmpeg']) : '',
    model: first([path.join(__dirname,'.models','ggml-tiny.en.bin')])
  };
});
