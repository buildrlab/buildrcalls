'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const fields = ['firstName','email','country','region'];
function cleanProfile(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid attendee profile.');
  const result = Object.fromEntries(fields.map(k => [k, String(value[k] || '').trim().slice(0,200)]));
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error('Enter a valid email address.');
  return result;
}
async function readProfile(file) {
  try { return cleanProfile(JSON.parse(await fs.readFile(file,'utf8'))); }
  catch (error) { if (error.code==='ENOENT') return cleanProfile({}); throw error; }
}
async function saveProfile(file,value) {
  const profile=cleanProfile(value);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(profile,null,2),{mode:0o600});await fs.chmod(tmp,0o600);await fs.rename(tmp,file);return profile;
}
module.exports={readProfile,saveProfile,cleanProfile};
