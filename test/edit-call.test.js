const {test} = require('node:test');
const assert = require('node:assert/strict');
const {applyCallForm} = require('../call-form');
function setup(status='scheduled', helperOverrides={}) {
 const call={id:'existing',status,title:'Old',platform:'Zoom',url:'https://example.com/old',start:'2099-11-01T12:00:00.000Z',duration:60};
 const data={calls:[call],timezone:'Etc/GMT'};
 const form={title:'Updated',platform:'Zoom',customPlatform:'',url:call.url,date:'2099-11-01',time:'12:00',duration:'90'};
 const helpers={dateKey:()=> '2099-11-01',timeOf:()=> '12:00',localToUtc:()=>{throw Error('Unchanged time should not be converted')},randomUUID:()=>{throw Error('Should not create a new call')},...helperOverrides};
 return {call,data,form,helpers,editingId:'existing'};
}
const submit = context => applyCallForm(context);
test('editing keeps the original call identity and time and saves updated fields',()=>{
 const context=setup();const {call,data}=context;const result=submit(context);assert.equal(result.edited,true);assert.equal(data.calls.length,1);assert.equal(call.id,'existing');assert.equal(call.title,'Updated');assert.equal(call.duration,90);assert.equal(call.start,'2099-11-01T12:00:00.000Z');assert.deepEqual(data.defaults,{platform:'Zoom',duration:90,time:'12:00'});
});
test('editing an opening call with a new link resets its scheduled state',()=>{
 const context=setup('opening');context.call.error='Could not open';context.form.url='https://example.com/new';submit(context);assert.equal(context.call.status,'scheduled');assert.equal(context.call.url,'https://example.com/new');assert.equal('error' in context.call,false);
});
test('editing an opening call without changing time or link keeps it opening',()=>{
 const context=setup('opening');submit(context);assert.equal(context.call.status,'opening');
});
test('a call that started while the form was open is not edited',()=>{
 const context=setup('recording');assert.throws(()=>submit(context),/no longer be edited/);assert.equal(context.call.title,'Old');
});
test('a call that was removed while the form was open is not recreated',()=>{
 const context=setup();context.data.calls=[];assert.throws(()=>submit(context),/no longer be edited/);assert.equal(context.data.calls.length,0);
});
test('changing the time converts it from the calendar time zone',()=>{
 const calls=[];const context=setup('scheduled',{localToUtc:(...args)=>{calls.push(args);return '2099-11-01T13:15:00.000Z'}});context.form.time='13:15';
 submit(context);assert.deepEqual(calls,[['2099-11-01','13:15','Etc/GMT']]);assert.equal(context.call.start,'2099-11-01T13:15:00.000Z');
});
test('a new call is added with a generated id and remembered defaults',()=>{
 const context=setup('scheduled',{localToUtc:()=> '2099-12-01T09:30:00.000Z',randomUUID:()=> 'new-id'});context.editingId=null;context.form.title='  Weekly sync  ';context.form.platform='Other';context.form.customPlatform=' Google Meet ';context.form.time='09:30';
 const result=submit(context);assert.equal(result.edited,false);assert.equal(context.data.calls.length,2);
 assert.deepEqual(context.data.calls[1],{id:'new-id',title:'Weekly sync',platform:'Google Meet',url:'https://example.com/old',start:'2099-12-01T09:30:00.000Z',duration:90,status:'scheduled'});
 assert.deepEqual(context.data.defaults,{platform:'Google Meet',duration:90,time:'09:30'});
});
test('invalid forms are rejected without changing the data',()=>{
 const rejected=(change,message)=>{const context=setup();change(context);assert.throws(()=>submit(context),message);assert.equal(context.call.title,'Old');assert.equal(context.data.defaults,undefined);};
 rejected(c=>{c.form.url='http://example.com/call'},/HTTPS/);
 rejected(c=>{c.form.url='not a link'},/Invalid URL/);
 rejected(c=>{c.form.platform='Other';c.form.customPlatform='   '},/platform name/);
 rejected(c=>{c.form.title='   '},/call name/);
 rejected(c=>{c.helpers.dateKey=()=> 'different';c.helpers.localToUtc=()=> '2000-01-01T00:00:00.000Z'},/future/);
});
