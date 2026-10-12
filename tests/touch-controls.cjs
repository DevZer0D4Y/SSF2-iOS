// Run with Node.js: node tests/touch-controls.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class Element {
  constructor(action) { this.dataset={action};this.listeners={};this.style={setProperty(){}};this.children=[];this.open=false;this.captured=new Set();this.classes=new Set();this.classList={add:(...s)=>s.forEach(v=>this.classes.add(v)),remove:(...s)=>s.forEach(v=>this.classes.delete(v)),toggle:(v,b)=>b?this.classes.add(v):this.classes.delete(v)}; }
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  fire(type,params={}){const event={pointerId:1,button:0,clientX:0,clientY:0,preventDefault(){},...params};for(const fn of this.listeners[type]||[])fn(event);}
  setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}
  getBoundingClientRect(){return{left:0,top:0,width:100,height:100};}
  contains(t){return t===this;}close(){this.open=false;this.fire('close');}querySelector(sel){return elements[sel]??=new Element();}append(...args){this.children.push(...args);}replaceChildren(){this.children=[];}setAttribute(){}add(){}focus(){}showModal(){this.open=true;}
}
const elements={};const actions=['jump','attack','special','grab','shield','taunt','pause','start','back'];const buttons=actions.map(a=>new Element(a));
const events=[],windowEvents={};const api={isPlaying:false,load:async()=>{},resume(){this.isPlaying=true;},suspend(){this.isPlaying=false;}};const player=new Element();player.ruffle=()=>api;
const document={documentElement:new Element(),hidden:false,querySelector:sel=>elements[sel]??=new Element(),querySelectorAll:sel=>sel==='[data-action]'?buttons:[],addEventListener(type,fn){windowEvents['document-'+type]=fn;},createElement:()=>new Element()};
const window={RufflePlayer:{newest:()=>({createPlayer:()=>player})},addEventListener:(type,fn)=>windowEvents[type]=fn,dispatchEvent:e=>events.push([e.type,e.code])};
const gamepads=[],frames=[];document.body=new Element();
const context={window,document,localStorage:{getItem(){return null;},setItem(){}},KeyboardEvent:class{constructor(type,opts){this.type=type;Object.assign(this,opts);}},Option:class{},location:{reload(){}},navigator:{getGamepads:()=>gamepads},requestAnimationFrame:fn=>frames.push(fn)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../SSF2-iOS/Web/controls.js'),'utf8'),context);
(async()=>{
 await new Promise(setImmediate);elements['#start'].onclick();assert.equal(api.isPlaying,true);
 const pad=elements['#dpad'],jump=buttons[0],attack=buttons[1];
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
 elements['#panel'].fire('close');assert.equal(api.isPlaying,true,'Closing settings resumes a running game');
 window.SSF2Controls.suspend();assert.equal(api.isPlaying,false);assert.equal(elements['#loading'].hidden,false);assert.equal(elements['#start'].textContent,'RESUME');
 const frame=()=>frames.splice(0).forEach(fn=>fn());
 const gamepad={buttons:Array.from({length:17},()=>({pressed:false})),axes:[0,0]};gamepads.push(gamepad);
 elements['#panel'].open=false;events.length=0;windowEvents.gamepadconnected();gamepad.buttons[0].pressed=true;frame();
 assert.equal(api.isPlaying,true,'A controller button resumes from the pause card');assert.equal(elements['#loading'].hidden,true);
 assert(document.body.classes.has('gamepad'),'Touch deck hides while a controller is connected');
 frame();assert.equal(events.length,0,'The resume press is not passed to the game');
 gamepad.buttons[0].pressed=false;frame();gamepad.axes[0]=-1;gamepad.buttons[1].pressed=true;gamepad.buttons[7].pressed=true;frame();
 assert.deepEqual(events,[['keydown','KeyO'],['keydown','KeyI'],['keydown','KeyA']],'Stick, special and shield map to the bound keys');
 gamepad.axes[0]=0;gamepad.buttons[1].pressed=false;gamepad.buttons[7].pressed=false;frame();
 assert.deepEqual(events.slice(-3).map(e=>e[0]),['keyup','keyup','keyup']);
 events.length=0;gamepad.buttons[13].pressed=true;frame();windowEvents.gamepaddisconnected();
 assert.deepEqual(events,[['keydown','KeyS'],['keyup','KeyS']],'Disconnecting releases held controller input');
 gamepads.length=0;frame();assert(!document.body.classes.has('gamepad'));
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
 // Touch layout editor: drag the D-pad; no game input while editing
 elements['#settings'].onclick();elements['#edit-layout'].onclick();assert.equal(elements['#editor'].hidden,false);
 events.length=0;const capture=type=>windowEvents['document-'+type];
 capture('pointerdown')({target:pad,clientX:10,clientY:10,preventDefault(){},stopPropagation(){}});
 capture('pointermove')({clientX:40,clientY:30,preventDefault(){}});capture('pointerup')({});
 assert.equal(pad.style.translate,'30px 20px','Dragging moves the control');assert.equal(events.length,0,'Editing sends no keys');
 elements['#editor-bigger'].onclick();assert.equal(pad.style.scale,'1.1','Resize grows the selected control');
 elements['#editor-hide'].onclick();assert(pad.classes.has('layout-hidden'),'Hide removes the control');
 elements['#editor-hide'].onclick();elements['#editor-done'].onclick();assert.equal(elements['#editor'].hidden,true);
 pad.fire('pointerdown',{pointerId:9,clientX:85,clientY:50});assert.deepEqual(events.at(-1),['keydown','KeyD'],'Controls work again after editing');pad.fire('pointerup',{pointerId:9});
 elements['#settings'].onclick();elements['#edit-layout'].onclick();elements['#editor-reset'].onclick();elements['#editor-done'].onclick();
 assert.equal(pad.style.translate,'','Reset restores the default layout');
 console.log('PASS: diagonals, simultaneous actions, shared-key holds, sliding, cancellation, interruptions, settings, resume, controllers, native controllers, remapping, layout editor');
})();
