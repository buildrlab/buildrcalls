const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {isWebinarJam,inspectScript,WebinarSession} = require('../webinarjam');
test('only WebinarJam HTTPS origins are eligible for automatic interaction',()=>{
 assert.equal(isWebinarJam('https://event.webinarjam.com/t/click/example'),true);
 assert.equal(isWebinarJam('https://room.webinarjam.net/live'),true);
 assert.equal(isWebinarJam('https://webinarjam.com.attacker.example/'),false);
 assert.equal(isWebinarJam('http://event.webinarjam.com/'),false);
});
test('finds one visible labelled broadcast control and returns its position',()=>{
 const button={textContent:'START THE BROADCAST',getAttribute:()=>null,contains:e=>e===button,getBoundingClientRect:()=>({left:100,top:200,width:200,height:40})};
 const document={querySelectorAll:q=>q.startsWith('button')?[button]:[],elementFromPoint:()=>button};
 const result=vm.runInNewContext(inspectScript,{document,getComputedStyle:()=>({display:'block',visibility:'visible'})});
 assert.equal(result.button.x,200);assert.equal(result.button.y,220);assert.equal(result.ambiguous,false);
});
test('clicks once, reports video only after time advances, and does not invent audible audio',async()=>{
 const events=[],statuses=[];let frame=0;const frames=[{button:{x:20,y:40},media:[]},{button:null,media:[{time:1,playing:true,muted:false,hasAudio:null}]},{button:null,media:[{time:2,playing:true,muted:false,hasAudio:null}]}];
 const contents={getURL:()=> 'https://event.webinarjam.com/room',executeJavaScript:async script=>script.includes('fillAttendeeForm')?{registration:false}:frames[frame++],sendInputEvent:e=>events.push(e),on:()=>{}};
 const window={webContents:contents,isDestroyed:()=>false,show:()=>{},focus:()=>{},on:()=>{}};
 const session=new WebinarSession({window,onStatus:s=>statuses.push(s)});
 await session.check();await session.check();await session.check();
 assert.deepEqual(events.map(e=>e.type),['mouseDown','mouseUp']);assert.equal(statuses.at(-1),'Video playing; audio not verified');
});
test('never clicks a page outside WebinarJam',async()=>{
 let inspected=false;const statuses=[];const window={isDestroyed:()=>false,webContents:{getURL:()=> 'https://elsewhere.example/',executeJavaScript:()=>{inspected=true}}};
 const session=new WebinarSession({window,onStatus:s=>statuses.push(s)});await session.check();assert.equal(inspected,false);assert.match(statuses[0],/Waiting/);
});
