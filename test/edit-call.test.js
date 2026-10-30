const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../renderer.js'),'utf8');
const start = source.indexOf("$('callForm').onsubmit=");
const end = source.indexOf("\n$('platform').onchange",start);
function setup(status='scheduled') {
 const startTime='2099-11-01T12:00:00.000Z';
 const call={id:'existing',status,title:'Old',platform:'Zoom',url:'https://example.com/old',start:startTime,duration:60};
 const fields={callForm:{},url:{value:call.url},platform:{value:'Zoom'},customPlatform:{value:''},date:{value:'2099-11-01'},time:{value:'12:00'},title:{value:'Updated'},duration:{value:'90'},modal:{close(){}},formError:{textContent:''}};
 const data={calls:[call]};const ctx={data,editingId:'existing',$:id=>fields[id],URL,Date,crypto:{randomUUID:()=>{throw Error('Should not create a new call')}},dateKey:()=> '2099-11-01',timeOf:()=> '12:00',localToUtc:()=>{throw Error('Unchanged time should not be converted')},save:async()=>{},render:()=>{},toast:()=>{},selected:null,current:null};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);return {call,fields,data,ctx};
}
test('editing keeps the original call identity and time and saves updated fields',async()=>{
 const {call,fields,data}=setup();await fields.callForm.onsubmit({preventDefault(){}});assert.equal(data.calls.length,1);assert.equal(call.id,'existing');assert.equal(call.title,'Updated');assert.equal(call.duration,90);assert.equal(call.start,'2099-11-01T12:00:00.000Z');assert.equal(fields.formError.textContent,'');
});
test('editing an opening call with a new link resets its scheduled state',async()=>{
 const {call,fields}=setup('opening');fields.url.value='https://example.com/new';await fields.callForm.onsubmit({preventDefault(){}});assert.equal(call.status,'scheduled');assert.equal(call.url,'https://example.com/new');
});
test('a call that started while the form was open is not edited',async()=>{
 const {call,fields}=setup('recording');await fields.callForm.onsubmit({preventDefault(){}});assert.equal(call.title,'Old');assert.match(fields.formError.textContent,/no longer be edited/);
});
