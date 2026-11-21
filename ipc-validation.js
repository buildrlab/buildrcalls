'use strict';
// Pure input checks for the main-process IPC handlers, kept free of Electron so they can be unit tested.
const path = require('node:path');

function assertCallData(data) {
  if (!data || !Array.isArray(data.calls) || typeof data.timezone !== 'string') throw Error('Invalid data');
  return data;
}
// Only HTTPS links may be handed to the operating system. Throws for anything else, including unparsable input.
function externalLink(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw Error('Only HTTPS links are supported');
  return parsed.href;
}
// A user-chosen recordings folder is honoured only when it is an absolute path; otherwise use the default.
function recordingFolder(chosen, fallback) { return typeof chosen === 'string' && path.isAbsolute(chosen) ? chosen : fallback; }
function recordingFileName(title, now = new Date()) {
  const safe = String(title).replace(/[^a-z0-9 -]/gi, '').trim().slice(0, 60) || 'Call';
  return `${now.toISOString().replace(/[:.]/g, '-')} - ${safe}.webm`;
}

module.exports = { assertCallData, externalLink, recordingFolder, recordingFileName };
