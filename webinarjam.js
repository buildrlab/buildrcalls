'use strict';
// Restrict automatic clicks to WebinarJam-owned pages. Other pages remain manual.
function isWebinarJam(url) {
  try { const u=new URL(url); return u.protocol==='https:' && /(^|\.)webinarjam\.(com|net)$/i.test(u.hostname); } catch { return false; }
}
// The page is untrusted. This script returns only a button position and coarse player state.
const inspectScript = `(() => {
  const visible = el => { const r=el.getBoundingClientRect(), s=getComputedStyle(el); return r.width>5 && r.height>5 && s.display!=='none' && s.visibility!=='hidden'; };
  const els=[...document.querySelectorAll('button,[role="button"],a,div,span')];
  const matches=els.filter(el=>visible(el) && (el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\\s+/g,' ').toLowerCase()==='start the broadcast');
  const leaf=matches.filter(el=>!matches.some(other=>other!==el && el.contains(other)));
  let button=null;
  if(leaf.length===1){const r=leaf[0].getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;const top=document.elementFromPoint(x,y);if(top&&(top===leaf[0]||leaf[0].contains(top)||top.contains(leaf[0])))button={x,y};}
  const media=[...document.querySelectorAll('video,audio')].filter(visible).map(e=>({time:Number.isFinite(e.currentTime)?e.currentTime:null,playing:!e.paused&&!e.ended&&e.readyState>=2,muted:!!e.muted||e.volume===0,hasAudio:typeof e.mozHasAudio==='boolean'?e.mozHasAudio:(e.audioTracks?e.audioTracks.length>0:null)}));
  return {button, ambiguous:leaf.length>1, media};
})()`;
class WebinarSession {
  constructor({window, onStatus, inspectInterval=2000, maxWait=600000}) { this.window=window;this.onStatus=onStatus;this.interval=inspectInterval;this.maxWait=maxWait;this.last=null;this.clicked=false;this.previous=null;this.started=Date.now();this.running=false;this.timer=null; }
  status(message) {if(this.last!==message){this.last=message;this.onStatus(message)}}
  start(){this.status('Opening webinar; sign-in or admission may be required');this.timer=setInterval(()=>this.check(),this.interval);this.window.on('closed',()=>this.stop());this.window.webContents.on('did-navigate',()=>{this.clicked=false;this.previous=null;});}
  stop(){clearInterval(this.timer);this.timer=null;}
  async check(){
    if(this.running||this.window.isDestroyed())return;this.running=true;
    try {
      const contents=this.window.webContents,url=contents.getURL();
      if(!isWebinarJam(url)){if(Date.now()-this.started>this.maxWait){this.status('Webinar page not reached; please check sign-in or redirects');this.stop();}else this.status('Waiting for a WebinarJam page; check sign-in or redirects');return;}
      const result=await contents.executeJavaScript(inspectScript,true);
      // Media can be hosted inside an iframe. Read only coarse media state there;
      // a button inside a frame is not clicked using unverified coordinates.
      const frames=contents.mainFrame?.framesInSubtree || [];
      for(const frame of frames.slice(1)){try{const child=await frame.executeJavaScript(inspectScript,true);result.media.push(...child.media);}catch{ /* Frames may disappear or deny inspection. */ }}
      const advancing=result.media.some(m=>m.playing && m.time!==null && this.previous?.some(p=>p.playing && p.time!==null && m.time>p.time+0.1));
      if(advancing){const heard=result.media.some(m=>m.playing&&!m.muted&&m.hasAudio===true);this.status(heard?'Video playing; audio track present, sound not verified':'Video playing; audio not verified');this.stop();return;}
      this.previous=result.media;
      if(result.ambiguous){this.status('Multiple broadcast controls found; please start the webinar manually');return;}
      if(result.button&&!this.clicked){
        this.window.show();this.window.focus();
        const {x,y}=result.button;contents.sendInputEvent({type:'mouseDown',x:Math.round(x),y:Math.round(y),button:'left',clickCount:1});contents.sendInputEvent({type:'mouseUp',x:Math.round(x),y:Math.round(y),button:'left',clickCount:1});
        this.clicked=true;this.status('Play clicked; checking video playback');
      } else if(Date.now()-this.started>this.maxWait){this.status('Playback not confirmed; please check the webinar window');this.stop();}
      else if(!this.clicked)this.status('Waiting for the webinar play control');
    } catch {this.status('Unable to inspect the webinar; please check the window');} finally {this.running=false;}
  }
}
module.exports={isWebinarJam,inspectScript,WebinarSession};
