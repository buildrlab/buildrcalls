'use strict';
// calls.json persistence, free of Electron so it can be unit tested. A missing file is a fresh install. A file that
// cannot be parsed is set aside (never overwritten) and the last good backup is used instead when there is one.
const fs = require('node:fs');
const path = require('node:path');

const defaults = () => ({ calls: [], timezone: 'Etc/GMT' });
const isCallData = value => Boolean(value) && Array.isArray(value.calls) && typeof value.timezone === 'string';
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; if (error instanceof SyntaxError) return null; throw error; }
}
// Returns { data, notice }. Errors other than "missing" or "unparsable" (for example a permissions problem) are thrown
// so that the caller does not treat them as an empty calendar and overwrite the real file.
function readData(file, now = new Date()) {
  const parsed = readJson(file);
  if (parsed === undefined) return { data: defaults(), notice: '' };
  if (isCallData(parsed)) return { data: parsed, notice: '' };
  const aside = `${file}.corrupt-${now.toISOString().replace(/[:.]/g, '-')}`;
  fs.renameSync(file, aside);
  const backup = readJson(file + '.bak');
  if (isCallData(backup)) return { data: backup, notice: `Your calls file was unreadable, so the last backup was restored. The damaged file was kept as ${path.basename(aside)}.` };
  return { data: defaults(), notice: `Your calls file was unreadable and has been set aside as ${path.basename(aside)}. Starting with an empty calendar.` };
}
// Atomic write that first keeps the previous good file as calls.json.bak.
function saveData(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (isCallData(readJson(file))) fs.copyFileSync(file, file + '.bak');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { readData, saveData };
