const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const events={},posts=[];
class AudioContext {
 constructor(){this.state='suspended';this.calls=0;this.events={};}
 addEventListener(type,fn){this.events[type]=fn;}
 resume(){this.calls++;this.state='running';return Promise.resolve();}
 close(){this.state='closed';this.events.statechange?.();}
}
const window={AudioContext,webkit:{messageHandlers:{audioSession:{postMessage:m=>posts.push(m)}}}};
const navigator={audioSession:{type:'auto'}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../SSF2-iOS/Web/audio.js','utf8'),{window,navigator,document:{addEventListener:(type,fn,capture)=>{assert(capture);events[type]=fn;}},Proxy,Reflect,Set,WeakSet,Promise});
(async()=>{
 const ctx=new window.AudioContext();assert(ctx instanceof AudioContext,'Native constructor identity is preserved');
 await events.pointerdown();assert.equal(ctx.state,'running');assert.equal(ctx.calls,1);assert.equal(posts[0],'activate');assert.equal(navigator.audioSession.type,'playback');
 await events.keydown();assert.equal(ctx.calls,1,'Running contexts are not repeatedly resumed');
 ctx.state='interrupted';await window.SSF2Audio.unlock();assert.equal(ctx.calls,2,'Headphone/interruption recovery resumes the existing context');
 ctx.close();await events.pointerdown();assert.equal(ctx.calls,2,'Closed contexts are released');
 const blocked=new window.AudioContext();blocked.resume=()=>Promise.reject(Error('Gesture required'));await window.SSF2Audio.unlock();
 blocked.resume=()=>{blocked.state='running';return Promise.resolve();};await events.pointerdown();assert.equal(blocked.state,'running','A blocked programmatic resume can retry on the next user tap');
 console.log('PASS: audio unlock on user input, native activation, context identity, interruptions, closed contexts and gesture retry');
})();
