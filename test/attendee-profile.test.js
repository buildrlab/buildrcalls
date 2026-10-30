const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {readProfile,saveProfile}=require('../attendee-profile');
const {fillAttendeeForm,WebinarSession}=require('../webinarjam');
test('attendee profile persists locally and rejects malformed email',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'attendee-test-')), file=path.join(dir,'profile.json');
 try{await saveProfile(file,{firstName:' Pat ',email:'pat@example.com',country:'Ireland',region:''});assert.deepEqual(await readProfile(file),{firstName:'Pat',email:'pat@example.com',country:'Ireland',region:''});await assert.rejects(saveProfile(file,{email:'not-an-email'}),/valid email/);if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o600)}finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('fills recognised blank registration inputs without submitting or touching consent',()=>{
 class Input {constructor(type,placeholder){this.type=type;this.placeholder=placeholder;this._value='';this.checked=false;this.events=[];}get value(){return this._value}set value(v){this._value=v}getAttribute(k){return k==='placeholder'?this.placeholder:null}getBoundingClientRect(){return {width:100,height:20}}dispatchEvent(e){this.events.push(e.type)}}
 const name=new Input('text','First name...'),email=new Input('email','Email...'),consent=new Input('checkbox','');let submitted=false;
 const document={body:{innerText:'Enter the webinar room Enter room'},activeElement:null,querySelectorAll:q=>q==='input'?[name,email,consent]:[],submit:()=>{submitted=true}};
 const context={document,location:{protocol:'https:',hostname:'event.webinarjam.com'},getComputedStyle:()=>({display:'block',visibility:'visible'}),HTMLInputElement:Input,Event:class{constructor(type){this.type=type}}};
 const result=vm.runInNewContext(`(${fillAttendeeForm.toString()})({firstName:'Pat',email:'pat@example.com',country:'Ireland',region:''})`,context);
 assert.equal(result.registration,true);assert.equal(result.filled,2);assert.equal(name.value,'Pat');assert.equal(email.value,'pat@example.com');assert.equal(consent.checked,false);assert.deepEqual(consent.events,[]);assert.equal(submitted,false);
 name.value='Already entered';vm.runInNewContext(`(${fillAttendeeForm.toString()})({firstName:'Pat',email:'pat@example.com'})`,context);assert.equal(name.value,'Already entered');
});
test('registration triggers review status without clicking or submitting',async()=>{
 const actions=[],statuses=[];const contents={getURL:()=> 'https://event.webinarjam.com/login',executeJavaScript:async()=>({registration:true,filled:2}),sendInputEvent:()=>actions.push('click')};
 const window={webContents:contents,isDestroyed:()=>false,show:()=>{},focus:()=>{}};
 const session=new WebinarSession({window,getProfile:async()=>({firstName:'Pat'}),onStatus:s=>statuses.push(s)});await session.check();assert.deepEqual(actions,[]);assert.match(statuses[0],/Review registration details and consent/);
});
