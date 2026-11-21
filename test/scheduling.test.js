const {test} = require('node:test');
const assert = require('node:assert/strict');
const {overlaps} = require('../scheduling');
test('detects overlapping calls and allows calls that touch at an endpoint',()=>{
 const base={start:'2026-11-01T10:00:00Z',duration:60};
 assert.equal(overlaps(base,{start:'2026-11-01T10:30:00Z',duration:60}),true);
 assert.equal(overlaps(base,{start:'2026-11-01T09:00:00Z',duration:60}),false);
 assert.equal(overlaps(base,{start:'2026-11-01T11:00:00Z',duration:60}),false);
 assert.equal(overlaps(base,{start:'not a date',duration:60}),false);
});
