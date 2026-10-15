// Run with Node.js: node tests/touch-controls.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class Element {
  constructor(action) { this.dataset={action};this.listeners={};this.style={setProperty(){}};this.children=[];this.open=false;this.captured=new Set();this.classes=new Set();this.classList={add:(...s)=>s.forEach(v=>this.classes.add(v)),remove:(...s)=>s.forEach(v=>this.classes.delete(v)),toggle:(v,b)=>b?this.classes.add(v):this.classes.delete(v)}; }
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  fire(type,params={}){const event={pointerId:1,button:0,clientX:0,clientY:0,preventDefault(){},...params};for(const fn of this.listeners[type]||[])fn(event);}
  setPointerCapture(id){this.captured.add(id);}releasePointerCapture(id){this.captured.delete(id);}hasPointerCapture(id){return this.captured.has(id);}
  getBoundingClientRect(){return{left:0,top:0,width:100,height:100};}
  contains(t){return t===this;}close(){this.open=false;this.fire('close');}querySelector(sel){return elements[sel]??=new Element();}append(...args){this.children.push(...args);}replaceChildren(){this.children=[];}setAttribute(){}add(option){this.children.push(option);}focus(){}showModal(){this.open=true;}
}
const elements={};const actions=['jump','attack','special','grab','shield','taunt','pause','start','menu'];const buttons=actions.map(a=>new Element(a));
const events=[],windowEvents={};const api={isPlaying:false,load:async options=>{api.loadedURL=options.url;},resume(){this.isPlaying=true;},suspend(){this.isPlaying=false;}};const player=new Element();player.ruffle=()=>api;
const document={documentElement:new Element(),hidden:false,querySelector:sel=>elements[sel]??=new Element(),querySelectorAll:sel=>sel==='[data-action]'?buttons:[],addEventListener(type,fn){windowEvents['document-'+type]=fn;},createElement:()=>new Element()};
const window={RufflePlayer:{newest:()=>({createPlayer:()=>player})},addEventListener:(type,fn)=>windowEvents[type]=fn,dispatchEvent:e=>events.push([e.type,e.code])};
if(process.argv.includes('--native'))window.SSF2Native={lowMemory:true,textureCache:true};
const gamepads=[],frames=[];let saved;const initial={keys:{pause:'Enter',jump:'KeyV'},pad:{select:'back'}};document.body=new Element();
if(process.argv.includes('--legacy-stick'))initial.pad={...initial.pad,rup:'none',rdown:'attack',rleft:'none',rright:'jump'};
const context={window,document,localStorage:{getItem(){return JSON.stringify(initial);},setItem(key,value){saved=JSON.parse(value);}},KeyboardEvent:class{constructor(type,opts){this.type=type;Object.assign(this,opts);}},Option:class{constructor(text,value){this.text=text;this.value=value;}},location:{reload(){}},navigator:{getGamepads:()=>gamepads},requestAnimationFrame:fn=>frames.push(fn)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../SSF2-iOS/Web/controls.js'),'utf8'),context);
(async()=>{
 await new Promise(setImmediate);assert.equal(saved.keys.pause,'Space');assert.equal(saved.keys.jump,'KeyV');assert.equal(saved.pad.select,'menu');assert(document.body.classes.has('fullscreen'));
 assert.equal(api.loadedURL,window.SSF2Native?'game/SSF2Portable-ios.swf':'game/SSF2Portable.swf','Native builds use the derived sequential-loader movie');
 assert.equal(saved.controllerVersion,2);assert.equal(saved.pad.rup,'cup');assert.equal(saved.pad.rleft,'cleft');
 if(process.argv.includes('--legacy-stick')){assert.equal(saved.pad.rdown,'attack','Customized actions survive migration');assert.equal(saved.pad.rright,'jump');}
 // A background event before LET'S PLAY must not replace the initial start card.
 window.SSF2Controls.suspend();assert.notEqual(elements['#start'].textContent,'RESUME');
 // Restore jump for the shared-key input checks.
 elements['#settings'].onclick();const jumpRow=elements['#bindings'].children.find(r=>r.children[0]==='Jump / tap jump');jumpRow.children[1].value='KeyW';jumpRow.children[1].onchange();elements['#panel'].close();elements['#start'].onclick();assert.equal(api.isPlaying,true);
 // Synchronous cache dialogs/audio focus can briefly hide a native page; only the
 // native app-background event may show Resume. Browser builds still use visibility.
 for(let i=0;i<100;i++){
   document.hidden=true;windowEvents['document-visibilitychange']();
   assert.equal(api.isPlaying,!!window.SSF2Native,'Native transient visibility must not stop playback');
   document.hidden=false;windowEvents['document-visibilitychange']();
   if(!window.SSF2Native)elements['#start'].onclick();
   windowEvents.blur();assert.equal(api.isPlaying,true,'Blur releases input without pausing playback');
 }
 api.isPlaying=false; // Ruffle may already have paused itself before the native callback.
 window.SSF2Controls.suspend();assert.equal(elements['#loading'].hidden,false,'Backgrounding still offers Resume after Ruffle auto-pauses');
 elements['#start'].onclick();assert.equal(api.isPlaying,true,'A single resume restarts playback');
 const pad=elements['#dpad'],jump=buttons[0],attack=buttons[1];
 for(const action of ['pause','start']){events.length=0;const b=buttons.find(b=>b.dataset.action===action);b.fire('pointerdown');b.fire('pointerup');assert.deepEqual(events,[['keydown','Space'],['keyup','Space']]);}events.length=0;
 buttons.at(-1).fire('pointerdown');assert(elements['#panel'].open);assert.equal(api.isPlaying,false);assert.equal(events.length,0);elements['#panel'].close();
 pad.fire('pointerdown',{pointerId:1,clientX:85,clientY:15});
 assert.deepEqual(events,[['keydown','KeyD'],['keydown','KeyW']],'Diagonal movement presses two keys');
 jump.fire('pointerdown',{pointerId:2});attack.fire('pointerdown',{pointerId:3});
 pad.fire('pointerup',{pointerId:1});
 assert(!events.some(e=>e[0]==='keyup'&&e[1]==='KeyW'),'Jump remains held after releasing D-pad');
 jump.fire('pointerup',{pointerId:2});attack.fire('pointercancel',{pointerId:3});
 assert.deepEqual(events.slice(-2),[['keyup','KeyW'],['keyup','KeyP']]);
 events.length=0;pad.fire('pointerdown',{pointerId:4,clientX:0,clientY:50});pad.fire('pointermove',{pointerId:4,clientX:100,clientY:50});
 assert.deepEqual(events,[['keydown','KeyA'],['keyup','KeyA'],['keydown','KeyD']],'Sliding releases the previous direction');
 windowEvents.blur();assert.deepEqual(events.at(-1),['keyup','KeyD'],'Interruption releases all held keys');
 events.length=0;pad.fire('pointerdown',{pointerId:5,clientX:50,clientY:50});assert.equal(events.length,0,'Center dead zone');
 elements['#settings'].onclick();assert.equal(api.isPlaying,false);assert.equal(elements['#panel'].open,true);
 elements['#panel'].close();assert.equal(api.isPlaying,true,'Closing settings resumes a running game');
 window.SSF2Controls.suspend();assert.equal(api.isPlaying,false);assert.equal(elements['#loading'].hidden,false);assert.equal(elements['#start'].textContent,'RESUME');
 const frame=()=>frames.splice(0).forEach(fn=>fn());
 if(!window.SSF2Native){
 const gamepad={buttons:Array.from({length:17},()=>({pressed:false})),axes:[0,0]};gamepads.push(gamepad);
 elements['#panel'].open=false;events.length=0;windowEvents.gamepadconnected();gamepad.buttons[0].pressed=true;frame();
 assert.equal(api.isPlaying,true,'A controller button resumes from the pause card');assert.equal(elements['#loading'].hidden,true);
 assert(document.body.classes.has('gamepad'),'Touch deck hides while a controller is connected');
 frame();assert.equal(events.length,0,'The resume press is not passed to the game');
 gamepad.buttons[0].pressed=false;frame();gamepad.axes[0]=-1;gamepad.buttons[1].pressed=true;gamepad.buttons[7].pressed=true;frame();
 assert.deepEqual(events,[['keydown','KeyO'],['keydown','KeyI'],['keydown','KeyA']],'Stick, special and shield map to the bound keys');
 gamepad.axes[0]=0;gamepad.buttons[1].pressed=false;gamepad.buttons[7].pressed=false;frame();
 assert.deepEqual(events.slice(-3).map(e=>e[0]),['keyup','keyup','keyup']);
 events.length=0;gamepad.axes=[0,0,.8,-.6];frame();assert.deepEqual(events,[['keydown','KeyH']],'Browser Gamepad API uses the same C-stick mapping');gamepad.axes=[0,0,0,0];frame();assert.deepEqual(events.at(-1),['keyup','KeyH']);
 events.length=0;gamepad.buttons[13].pressed=true;frame();windowEvents.gamepaddisconnected();
 assert.deepEqual(events,[['keydown','KeyS'],['keyup','KeyS']],'Disconnecting releases held controller input');
 gamepads.length=0;frame();assert(!document.body.classes.has('gamepad'));
 }else{elements['#start'].onclick();}
 // Native controller bridge (GameController framework on iOS)
 events.length=0;window.SSF2Pads.update([{id:0,name:'Xbox Wireless Controller',buttons:['south'],axes:[0,0,0,0]}]);
 assert.deepEqual(events,[['keydown','KeyP']],'Native bottom face button attacks');
 assert(elements['#controller-status'].textContent.includes('Xbox Wireless Controller'));
 window.SSF2Pads.update([{id:0,name:'Xbox Wireless Controller',buttons:[],axes:[0,0.9,0,0]}]);
 assert.deepEqual(events.slice(1),[['keyup','KeyP'],['keydown','KeyS']],'Native left stick moves');
 window.SSF2Pads.update([]);assert.deepEqual(events.at(-1),['keyup','KeyS'],'Disconnect releases native input');
 // Remap a controller button from the settings panel
 elements['#settings'].onclick();
 const row=elements['#pad-bindings'].children.find(r=>r.children[0].startsWith('Bottom face'));const select=row.children[1];
 select.value='jump';select.onchange();elements['#panel'].close();
 events.length=0;window.SSF2Pads.update([{id:1,name:'DualSense',buttons:['south'],axes:[0,0,0,0]}]);
 assert.deepEqual(events,[['keydown','KeyW']],'Remapped button sends the new action');window.SSF2Pads.update([]);
 // All game input slots are exposed; C directions are actual distinct key bindings.
 elements['#settings'].onclick();
 const keyRow=name=>elements['#bindings'].children.find(row=>row.children[0]===name).children[1];
 const padRow=name=>elements['#pad-bindings'].children.find(row=>row.children[0]===name).children[1];
 for(const name of ['Jump 2','Shield 2','Dash','C-Up','C-Left','C-Down','C-Right'])assert(keyRow(name),'Missing control slot '+name);
 for(const [name,action] of [['Right stick up','cup'],['Right stick down','cdown'],['Right stick left','cleft'],['Right stick right','cright']]){
  const select=padRow(name);assert(select.children.some(option=>option.value===action));select.value=action;select.onchange();
 }
 elements['#panel'].close();
 const native=(axes,buttons=[])=>window.SSF2Pads.update([{id:10,name:'Controller',axes,buttons}]);
 for(const [axes,key] of [[[0,0,0,-1],'KeyT'],[[0,0,0,1],'KeyG'],[[0,0,-1,0],'KeyF'],[[0,0,1,0],'KeyH']]){
  events.length=0;native(axes);native([0,0,0,0]);assert.deepEqual(events,[['keydown',key],['keyup',key]],'C-stick emits its dedicated key, never neutral Attack');
 }
 events.length=0;native([0,0,.9,-.7]);assert.deepEqual(events,[['keydown','KeyH']],'Diagonal C-stick uses only its dominant direction');native([0,0,0,0]);
 events.length=0;native([.6,0,0,-1]);native([.6,0,0,1]);
 assert.deepEqual(events,[['keydown','KeyD'],['keydown','KeyT'],['keyup','KeyT'],['keydown','KeyG']],'C-stick direction changes preserve independent movement');native([0,0,0,0]);
 elements['#settings'].onclick();keyRow('C-Up').value='KeyY';keyRow('C-Up').onchange();elements['#panel'].close();
 events.length=0;native([0,0,0,-1]);native([0,0,0,0]);assert.deepEqual(events,[['keydown','KeyY'],['keyup','KeyY']],'C-stick respects remapped keys');
 elements['#settings'].onclick();keyRow('C-Up').value='none';keyRow('C-Up').onchange();elements['#panel'].close();
 events.length=0;native([0,0,0,-1]);native([0,0,0,0]);assert.equal(events.length,0,'Unassigned keys emit nothing');
 elements['#settings'].onclick();keyRow('C-Up').value='KeyT';keyRow('C-Up').onchange();
 for(const [label,key] of [['Jump 2','KeyJ'],['Shield 2','KeyK']]){keyRow(label).value=key;keyRow(label).onchange();}
 for(const [label,action] of [['Left bumper (LB / L1 / L)','jump2'],['Right bumper (RB / R1 / R)','shield2'],['Left stick press','dash']]){padRow(label).value=action;padRow(label).onchange();}
 elements['#analog-dash'].checked=true;elements['#analog-dash'].onchange();elements['#panel'].close();
 events.length=0;native([0,0,0,0],['l1','r1','l3']);native([0,0,0,0]);
 assert.deepEqual(events.slice(0,3),[['keydown','KeyJ'],['keydown','KeyK'],['keydown','ShiftLeft']],'Additional jump, shield and dash mappings work together');
 events.length=0;native([.2,0,0,0]);assert.equal(events.length,0,'Resting stick stays in its dead zone');
 native([.4,0,0,0]);assert.deepEqual(events,[['keydown','KeyD']],'A light tilt walks');
 native([.9,0,0,0]);assert.deepEqual(events.at(-1),['keydown','ShiftLeft'],'A strong tilt also presses Dash');
 native([.4,0,0,0]);assert.deepEqual(events.at(-1),['keyup','ShiftLeft'],'A light tilt releases Dash while movement remains held');
 native([.2,0,0,0]);assert.deepEqual(events.at(-1),['keyup','ShiftLeft'],'Hysteresis prevents jitter near the dead zone');
 native([.1,0,0,0]);assert.deepEqual(events.at(-1),['keyup','KeyD']);
 native([.9,0,0,0]);window.SSF2Pads.update([]);assert.deepEqual(events.slice(-2),[['keyup','KeyD'],['keyup','ShiftLeft']],'Disconnect releases movement and Dash');
 // Custom dead zone applies to subsequent polls.
 elements['#settings'].onclick();elements['#stick-deadzone'].value=.45;elements['#stick-deadzone'].oninput();elements['#panel'].close();
 events.length=0;native([.4,0,0,0]);assert.equal(events.length,0);window.SSF2Pads.update([]);
 // Touch layout editor: drag the D-pad; no game input while editing
 elements['#settings'].onclick();elements['#edit-layout'].onclick();assert.equal(elements['#editor'].hidden,false);
 events.length=0;const capture=type=>windowEvents['document-'+type];
 capture('pointerdown')({pointerId:7,target:pad,clientX:10,clientY:10,preventDefault(){},stopPropagation(){}});
 capture('pointermove')({pointerId:8,clientX:90,clientY:90,preventDefault(){},stopPropagation(){}});assert.equal(pad.style.transform,'','A second finger cannot move the selected control');
 capture('pointermove')({pointerId:7,clientX:40,clientY:-30,preventDefault(){},stopPropagation(){}});pad.fire('pointermove',{pointerId:7});capture('pointerup')({pointerId:7});assert(!pad.hasPointerCapture(7),'Editor releases pointer capture');
 assert.equal(pad.style.transform,'translate(30px, -40px) scale(1)','Dragging moves the control');assert.equal(events.length,0,'Editing sends no keys');
 elements['#editor-bigger'].onclick();assert.equal(pad.style.transform,'translate(30px, -40px) scale(1.1)','Resize grows the selected control');
 elements['#editor-hide'].onclick();assert(pad.classes.has('layout-hidden'),'Hide removes the control');
 elements['#editor-hide'].onclick();elements['#editor-done'].onclick();assert.equal(elements['#editor'].hidden,true);
 pad.fire('pointerdown',{pointerId:9,clientX:85,clientY:50});assert.deepEqual(events.at(-1),['keydown','KeyD'],'Controls work again after editing');pad.fire('pointerup',{pointerId:9});
 elements['#settings'].onclick();elements['#edit-layout'].onclick();elements['#editor-reset'].onclick();elements['#editor-done'].onclick();
 assert.equal(pad.style.transform,'','Reset restores the default layout');
 events.length=0;window.SSF2Pads.update([{id:3,name:'Controller',buttons:['select'],axes:[0,0,0,0]}]);assert(elements['#panel'].open,'Controller menu opens the panel');elements['#panel'].close();window.SSF2Pads.update([{id:3,name:'Controller',buttons:['select'],axes:[0,0,0,0]}]);assert(!elements['#panel'].open,'Holding menu does not reopen it');window.SSF2Pads.update([]);assert.equal(events.length,0);
 elements['#settings'].onclick();elements['#fullscreen'].checked=false;elements['#fullscreen'].onchange();assert(!document.body.classes.has('fullscreen'));assert.equal(saved.fullscreen,false);
 console.log('PASS: diagonals, simultaneous actions, shared-key holds, sliding, cancellation, interruptions, settings, resume, controllers, native controllers, remapping, layout editor');
})();
