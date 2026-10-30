'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Each recording owns its own output stream. Capture isolation is a separate concern.
class RecordingStore {
  constructor(onError = () => {}) { this.sessions = new Map(); this.onError = onError; }
  async start(id, title, dir) {
    if (this.sessions.has(id)) throw new Error('This recording is already in progress.');
    await fs.promises.mkdir(dir, {recursive:true});
    const safe = String(title).replace(/[^a-z0-9 -]/gi, '').trim().slice(0,60) || 'Call';
    const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g,'-')} - ${safe} - ${randomUUID().slice(0,8)}.webm`);
    const stream = fs.createWriteStream(file, {flags:'wx'});
    const session = {file, stream, error:null};
    this.sessions.set(id, session);
    stream.on('error', error => { session.error = error; this.onError(id,error); });
    try { await new Promise((resolve,reject)=>{stream.once('open',resolve);stream.once('error',reject)}); }
    catch (error) { this.sessions.delete(id); throw error; }
    return file;
  }
  async write(id, bytes) {
    const session=this.sessions.get(id);
    if (!session || session.error) throw session?.error || new Error('Recording is not active');
    await new Promise((resolve,reject)=>session.stream.write(Buffer.from(bytes), error=>error?reject(error):resolve()));
  }
  async stop(id) {
    const session=this.sessions.get(id); if (!session) throw new Error('Recording is not active');
    this.sessions.delete(id);
    if (session.error) { session.stream.destroy(); throw session.error; }
    await new Promise((resolve,reject)=>session.stream.end(error=>error?reject(error):resolve()));
  }
}
module.exports = { RecordingStore };
