'use strict';
// Main-process-only settings. The renderer can ask for the transcription tools to be chosen (through a native file
// dialog) but can never write their paths: they live here, outside calls.json, which the renderer may overwrite.
const fs = require('node:fs/promises');
const path = require('node:path');
const { SETUP_KINDS, validateSetupFile } = require('./transcription');

function pickTranscription(value) {
  const picked = {};
  for (const kind of SETUP_KINDS) if (value && typeof value[kind] === 'string' && value[kind]) picked[kind] = value[kind];
  return picked;
}
// Returns null when the settings file does not exist yet, so the caller can run the one-off migration.
async function readSettings(file) {
  let text;
  try { text = await fs.readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  try { return { transcription: pickTranscription(JSON.parse(text).transcription) }; }
  catch { return { transcription: {} }; }
}
async function writeSettings(file, settings) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  await fs.writeFile(temp, JSON.stringify({ version: 1, transcription: pickTranscription(settings.transcription) }, null, 2), { mode: 0o600 });
  await fs.rename(temp, file);
}
// Earlier versions kept the tool paths inside calls.json. Adopt them once, and only the ones that still pass
// validation, then stop reading that location.
async function loadSettings(file, legacyTranscription) {
  const existing = await readSettings(file);
  if (existing) return existing;
  const transcription = {}, legacy = pickTranscription(legacyTranscription);
  for (const kind of Object.keys(legacy)) { try { transcription[kind] = await validateSetupFile(kind, legacy[kind]); } catch { /* not usable any more */ } }
  const migrated = { transcription };
  await writeSettings(file, migrated);
  return migrated;
}
async function setTranscriptionPath(file, legacyTranscription, kind, value) {
  const settings = await loadSettings(file, legacyTranscription);
  settings.transcription[kind] = await validateSetupFile(kind, value);
  await writeSettings(file, settings);
  return settings.transcription[kind];
}
// Strip main-only settings from anything the renderer reads or writes.
function withoutPrivateSettings(data) {
  const rest = { ...data };
  delete rest.transcription;
  return rest;
}
// New installs use ~/Movies/BuildrCalls. An existing ~/Movies/Callkeeper folder is kept so recordings stay together.
async function defaultRecordingsFolder(videos) {
  const exists = dir => fs.stat(dir).then(stat => stat.isDirectory(), () => false);
  const current = path.join(videos, 'BuildrCalls'), legacy = path.join(videos, 'Callkeeper');
  return !(await exists(current)) && await exists(legacy) ? legacy : current;
}
function isRecordingFile(file) { return typeof file === 'string' && path.isAbsolute(file) && path.extname(file).toLowerCase() === '.webm'; }

module.exports = { readSettings, writeSettings, loadSettings, setTranscriptionPath, withoutPrivateSettings, defaultRecordingsFolder, isRecordingFile };
