(() => {
  'use strict';
  const defaults = {up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',jump:'KeyW',attack:'KeyP',special:'KeyO',shield:'KeyI',grab:'KeyU',taunt:'Digit1',start:'Space',pause:'Space'};
  const labels = {up:'Up',down:'Down',left:'Left',right:'Right',jump:'Jump / tap jump',attack:'Attack',special:'Special',shield:'Shield',grab:'Grab',taunt:'Taunt',start:'Start / OK',pause:'Pause'};
  let settings;
  try { settings = JSON.parse(localStorage.getItem('ssf2-touch-v1') || '{}'); } catch { settings = {}; }
  if(!settings || typeof settings!=='object')settings={};
  // Migrate the old Enter pause binding once; preserve other remapped keys.
  if(settings.bindingVersion!==2 && settings.keys?.pause==='Enter')settings.keys.pause='Space';
  if(settings.keys)delete settings.keys.back;
  if(settings.pad)for(const input of Object.keys(settings.pad))if(settings.pad[input]==='back')settings.pad[input]='menu';
  // Controller inputs are named by position, so the same mapping works for Xbox, PlayStation, Nintendo and MFi layouts.
  const padDefaults = {south:'attack',east:'special',west:'jump',north:'jump',l1:'grab',r1:'grab',l2:'shield',r2:'shield',select:'menu',start:'pause',l3:'start',r3:'taunt',dup:'up',ddown:'down',dleft:'left',dright:'right',lup:'up',ldown:'down',lleft:'left',lright:'right',rup:'none',rdown:'none',rleft:'none',rright:'none'};
  const padLabels = {south:'Bottom face button (A / ✕)',east:'Right face button (B / ○)',west:'Left face button (X / □)',north:'Top face button (Y / △)',l1:'Left bumper (LB / L1 / L)',r1:'Right bumper (RB / R1 / R)',l2:'Left trigger (LT / L2 / ZL)',r2:'Right trigger (RT / R2 / ZR)',select:'View / Share / −',start:'Menu / Options / +',l3:'Left stick press',r3:'Right stick press',dup:'D-pad up',ddown:'D-pad down',dleft:'D-pad left',dright:'D-pad right',lup:'Left stick up',ldown:'Left stick down',lleft:'Left stick left',lright:'Left stick right',rup:'Right stick up',rdown:'Right stick down',rleft:'Right stick left',rright:'Right stick right'};
  settings = {bindingVersion:2,fullscreen:settings.fullscreen ?? true,keys:{...defaults,...settings.keys},pad:{...padDefaults,...settings.pad},layout:{landscape:{},portrait:{},...settings.layout},size:settings.size || 1,opacity:settings.opacity || 1,haptics:settings.haptics ?? true,hideDeck:settings.hideDeck ?? true};
  const held = new Map(), pointers = new Map();
  let player, ready = false;
  const panel = document.querySelector('#panel');
  function save() {
    document.documentElement.style.setProperty('--size',settings.size);
    document.documentElement.style.setProperty('--opacity',settings.opacity);
    try { localStorage.setItem('ssf2-touch-v1',JSON.stringify(settings)); } catch {}
    document.body.classList.toggle('fullscreen',settings.fullscreen);
    applyLayout();
  }
  function descriptor(code) {
    if (/^Key[A-Z]$/.test(code)) return {key:code.slice(3).toLowerCase(),keyCode:code.charCodeAt(3)};
    if (/^Digit[0-9]$/.test(code)) return {key:code.slice(5),keyCode:code.charCodeAt(5)};
    return ({Space:{key:' ',keyCode:32},Enter:{key:'Enter',keyCode:13},Escape:{key:'Escape',keyCode:27},Backspace:{key:'Backspace',keyCode:8},ArrowUp:{key:'ArrowUp',keyCode:38},ArrowDown:{key:'ArrowDown',keyCode:40},ArrowLeft:{key:'ArrowLeft',keyCode:37},ArrowRight:{key:'ArrowRight',keyCode:39},ShiftLeft:{key:'Shift',keyCode:16}})[code];
  }
  function emit(code, down) {
    const d = descriptor(code); if (!d) return;
    if (ready) player.focus({preventScroll:true});
    // Ruffle listens on window and reads both the physical code and logical key.
    window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{...d,code,which:d.keyCode,bubbles:true,cancelable:true}));
  }
  function haptic() { if(settings.haptics) window.webkit?.messageHandlers?.haptic?.postMessage('tap'); }
  function setPointer(id, actions) {
    const before = pointers.get(id) || new Set();
    const next = new Set(actions.map(a=>settings.keys[a]).filter(descriptor));
    for (const code of before) if (!next.has(code)) {
      const count=(held.get(code)||1)-1;
      if(count<=0){held.delete(code);emit(code,false);}else held.set(code,count);
    }
    for (const code of next) if (!before.has(code)) {
      const count=held.get(code)||0;held.set(code,count+1);if(count===0)emit(code,true);
    }
    if(next.size)pointers.set(id,next);else pointers.delete(id);
  }
  function releaseAll() {
    for(const code of held.keys())emit(code,false);
    held.clear();pointers.clear();
    document.querySelectorAll('.pressed,.active').forEach(el=>el.classList.remove('pressed','active'));
  }
  window.SSF2Controls = {releaseAll, suspend: suspendGame};
  document.querySelectorAll('[data-action]').forEach(button=>{
    const pressedPointers=new Set();
    button.addEventListener('pointerdown',e=>{
      if(editing || !ready || e.button>0)return;
      if(button.dataset.action==='menu'){e.preventDefault();openMenu();return;}
      if(panel.open)return;
      e.preventDefault();try{button.setPointerCapture(e.pointerId);}catch{}pressedPointers.add(e.pointerId);
      button.classList.add('pressed');setPointer(e.pointerId,[button.dataset.action]);haptic();
    });
    const end=e=>{setPointer(e.pointerId,[]);pressedPointers.delete(e.pointerId);if(!pressedPointers.size)button.classList.remove('pressed');};
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>button.addEventListener(type,end));
    button.addEventListener('click',e=>e.preventDefault());
  });
  const pad=document.querySelector('#dpad');
  const padTouches=new Map();
  function updatePad(e){
    const r=pad.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
    const actions=[];
    if(Math.hypot(x,y)>.13){
      const angle=Math.atan2(y,x),octant=Math.round(angle/(Math.PI/4));
      if([-1,0,1].includes(octant))actions.push('right');
      if([1,2,3].includes(octant))actions.push('down');
      if([3,4,-4,-3].includes(octant))actions.push('left');
      if([-3,-2,-1].includes(octant))actions.push('up');
    }
    padTouches.set(e.pointerId,actions);setPointer(e.pointerId,actions);paintPad();
  }
  function paintPad(){const all=[...padTouches.values()].flat();for(const a of ['up','down','left','right'])pad.querySelector('.'+a).classList.toggle('active',all.includes(a));}
  pad.addEventListener('pointerdown',e=>{if(!ready||panel.open||editing)return;e.preventDefault();try{pad.setPointerCapture(e.pointerId);}catch{}updatePad(e);haptic();});
  pad.addEventListener('pointermove',e=>{if(!editing&&pad.hasPointerCapture(e.pointerId)){e.preventDefault();updatePad(e);}});
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>pad.addEventListener(type,e=>{setPointer(e.pointerId,[]);padTouches.delete(e.pointerId);paintPad();}));
  function suspend(){releaseAll();padTouches.clear();paintPad();}
  window.addEventListener('blur',suspend);
  function suspendGame(){suspend();if(ready){player.ruffle().suspend();loading.hidden=false;status.textContent='Game suspended. Tap to continue.';start.textContent='RESUME';start.hidden=false;}}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendGame();});
  window.addEventListener('orientationchange',suspend);
  window.addEventListener('pagehide',suspend);
  window.addEventListener('contextmenu',e=>e.preventDefault());
  const codes=[...Array.from({length:26},(_,i)=>'Key'+String.fromCharCode(65+i)),...Array.from({length:10},(_,i)=>'Digit'+i),'Space','Enter','Backspace','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft'];
  function renderSettings(){
    const root=document.querySelector('#bindings');root.replaceChildren();
    for(const [action,label] of Object.entries(labels)){
      const row=document.createElement('label');row.append(label);const select=document.createElement('select');select.setAttribute('aria-label',label+' key');
      for(const code of codes){const option=new Option(code.replace('Key','').replace('Digit','').replace('Arrow','').replace('ShiftLeft','Shift'),code);select.add(option);}
      select.value=settings.keys[action];select.onchange=()=>{suspend();settings.keys[action]=select.value;save();};row.append(select);root.append(row);
    }
    const padRoot=document.querySelector('#pad-bindings');padRoot.replaceChildren();
    for(const [input,label] of Object.entries(padLabels)){
      const row=document.createElement('label');row.append(label);const select=document.createElement('select');select.setAttribute('aria-label',label+' action');
      select.add(new Option('—','none'));select.add(new Option('App menu','menu'));for(const [action,name] of Object.entries(labels))select.add(new Option(name,action));
      select.value=settings.pad[input];select.onchange=()=>{suspend();settings.pad[input]=select.value;save();};row.append(select);padRoot.append(row);
    }
    const hide=document.querySelector('#hide-deck');hide.checked=settings.hideDeck;hide.onchange=()=>{settings.hideDeck=hide.checked;save();updateControllerUI();};
    for(const name of ['size','opacity']){const input=document.querySelector('#'+name);input.value=settings[name];input.oninput=()=>{settings[name]=Number(input.value);save();};}
    const fullscreen=document.querySelector('#fullscreen');fullscreen.checked=settings.fullscreen;fullscreen.onchange=()=>{endDrag();settings.fullscreen=fullscreen.checked;save();};
    const input=document.querySelector('#haptics');input.checked=settings.haptics;input.onchange=()=>{settings.haptics=input.checked;save();};
  }
  let wasPlaying=false;
  function openMenu(){if(panel.open||editing)return;suspend();wasPlaying=ready&&player.ruffle().isPlaying;if(ready)player.ruffle().suspend();renderSettings();panel.showModal();}
  document.querySelector('#settings').onclick=openMenu;
  panel.addEventListener('close',()=>{save();if(editing)return;if(wasPlaying)player.ruffle().resume();if(ready)player.focus();});
  document.querySelector('#reset').onclick=()=>{settings={bindingVersion:2,fullscreen:true,keys:{...defaults},pad:{...padDefaults},layout:settings.layout,size:1,opacity:1,haptics:true,hideDeck:true};save();renderSettings();};
  const loading=document.querySelector('#loading'),status=document.querySelector('#status'),start=document.querySelector('#start');
  start.onclick=()=>{window.SSF2Audio?.unlock();player.ruffle().volume=1;player.ruffle().resume();player.focus();loading.hidden=true;};
  document.querySelector('#retry').onclick=()=>location.reload();
  async function boot(){
    try{
      player=window.RufflePlayer.newest().createPlayer();player.tabIndex=0;
      document.querySelector('#player-host').append(player);
      await player.ruffle().load({url:'game/SSF2Portable.swf',base:'game/',autoplay:'off',allowScriptAccess:false});
      ready=true;status.textContent='Ready. Tap to enable sound and play.';start.hidden=false;
    }catch(error){status.textContent='The game could not load. '+String(error.message||error);document.querySelector('#retry').hidden=false;}
  }
  // ---- Game controllers ----
  // The iOS app reports every controller the GameController framework supports (Xbox, PlayStation,
  // Switch Pro / Joy-Con, MFi and clip-on pads) through SSF2Pads.update. In a plain browser the
  // Gamepad API is used instead. Both produce position-named inputs that settings.pad maps to actions.
  const webButtons=['south','east','west','north','l1','r1','l2','r2','select','start','l3','r3','dup','ddown','dleft','dright'];
  const padSources=new Map(); // source id -> {name, inputs}
  const cardHeld=new Map(),menuHeld=new Set();
  function stickInputs(prefix,x=0,y=0){const out=[];if(y<-.5)out.push(prefix+'up');if(y>.5)out.push(prefix+'down');if(x<-.5)out.push(prefix+'left');if(x>.5)out.push(prefix+'right');return out;}
  function applyPad(source,inputs){
    const pressed=inputs.length>0;
    if(inputs.some(input=>settings.pad[input]==='menu')&&!menuHeld.has(source)&&ready&&loading.hidden&&!editing){menuHeld.add(source);openMenu();}
    else if(!inputs.some(input=>settings.pad[input]==='menu'))menuHeld.delete(source);
    // Any button dismisses the "tap to play / resume" card; that press is not passed to the game.
    if(pressed&&!cardHeld.get(source)&&ready&&!loading.hidden&&!start.hidden&&!panel.open&&!editing){start.onclick();cardHeld.set(source,true);}
    else if(!pressed)cardHeld.delete(source);
    const actions=inputs.map(input=>settings.pad[input]).filter(action=>action&&action!=='none'&&action!=='menu');
    setPointer(source,ready&&loading.hidden&&!panel.open&&!editing&&!cardHeld.get(source)?actions:[]);
  }
  function updateControllerUI(){
    const names=[...padSources.values()].map(p=>p.name);
    document.body.classList.toggle('gamepad',names.length>0&&settings.hideDeck);
    const label=document.querySelector('#controller-status');
    label.textContent=names.length?'Connected: '+names.join(' · '):'No controller connected. Pair one in iOS Settings → Bluetooth.';
  }
  function setSources(prefix,pads){
    const seen=new Set();
    for(const pad of pads){const id=prefix+pad.id;seen.add(id);padSources.set(id,{name:pad.name||'Controller'});applyPad(id,pad.inputs);}
    for(const id of [...padSources.keys()])if(id.startsWith(prefix)&&!seen.has(id)){padSources.delete(id);cardHeld.delete(id);menuHeld.delete(id);setPointer(id,[]);}
    updateControllerUI();
  }
  // Native bridge: pads = [{id, name, buttons:[input names], axes:[lx, ly, rx, ry]}] (y positive = down).
  window.SSF2Pads={update(pads){setSources('native',pads.map(p=>({id:p.id,name:p.name,inputs:[...p.buttons,...stickInputs('l',p.axes[0],p.axes[1]),...stickInputs('r',p.axes[2],p.axes[3])]})));}};
  let padFrame=0;
  function pollGamepads(){
    const pads=[...(navigator.getGamepads?.()||[])].filter(Boolean);
    setSources('pad',pads.map((pad,index)=>{
      const inputs=[];pad.buttons.forEach((button,i)=>{if(button.pressed&&webButtons[i])inputs.push(webButtons[i]);});
      return {id:index,name:pad.id,inputs:[...inputs,...stickInputs('l',pad.axes[0],pad.axes[1]),...stickInputs('r',pad.axes[2],pad.axes[3])]};
    }));
    padFrame=pads.length?requestAnimationFrame(pollGamepads):0;
  }
  if(!window.SSF2Native){
    window.addEventListener('gamepadconnected',()=>{if(!padFrame)padFrame=requestAnimationFrame(pollGamepads);});
    window.addEventListener('gamepaddisconnected',()=>{suspend();if(!padFrame)padFrame=requestAnimationFrame(pollGamepads);});
  }

  // ---- Touch layout editor ----
  // Each control keeps an offset, a scale and a hidden flag per orientation, applied on top of the default layout.
  function editables(){
    const items=[['dpad',document.querySelector('#dpad')]];
    document.querySelectorAll('[data-action]').forEach(el=>{if(!el.closest?.('header'))items.push([el.dataset.action,el]);});
    return items;
  }
  const orientation=()=>window.matchMedia?.('(orientation: portrait)').matches?'portrait':'landscape';
  function layoutOf(id){
    const l=settings.layout[orientation()]?.[id]||{};
    const number=(value,fallback)=>Number.isFinite(value)?value:fallback;
    return {x:number(l.x,0),y:number(l.y,0),s:Math.min(2,Math.max(.5,number(l.s,1))),h:l.h===true};
  }
  function applyLayout(){
    for(const [id,el] of editables()){
      const l=layoutOf(id);
      // Use one transform on iOS; independent translate/scale can conflict with flex items.
      el.style.translate='';el.style.scale='';
      el.style.transform=(l.x||l.y||l.s!==1)?`translate(${l.x}px, ${l.y}px) scale(${l.s})`:'';
      el.classList.toggle('layout-hidden',!!l.h);el.classList.toggle('layout-selected',editing&&id===selected);
    }
    const name=document.querySelector('#editor-selected');
    if(name){const el=editables().find(([id])=>id===selected)?.[1];name.textContent=selected?(selected==='dpad'?'D-PAD':(el?.textContent||selected).replace(/\s+/g,' ').trim()):'Tap a control';}
    const hide=document.querySelector('#editor-hide');if(hide)hide.textContent=selected&&layoutOf(selected).h?'SHOW':'HIDE';
  }
  let editing=false,selected=null,drag=null;
  function storeLayout(id,changes){const all=settings.layout[orientation()];all[id]={...layoutOf(id),...changes};save();}
  // Scale between screen pixels and the control's own coordinate space (decks are scaled by the size setting).
  function pixelScale(el,l){const r=el.getBoundingClientRect();return el.offsetWidth?r.width/(el.offsetWidth*l.s):1;}
  function keepOnScreen(id,el){
    const l=layoutOf(id),r=el.getBoundingClientRect(),k=pixelScale(el,l),w=window.innerWidth,h=window.innerHeight;let dx=0,dy=0;
    if(r.left<0)dx=-r.left;else if(r.right>w)dx=w-r.right;if(r.top<0)dy=-r.top;else if(r.bottom>h)dy=h-r.bottom;
    if(dx||dy)storeLayout(id,{x:l.x+dx/k,y:l.y+dy/k});
  }
  document.addEventListener('pointerdown',e=>{
    if(!editing||e.target.closest?.('#editor')||drag)return;
    const hit=editables().find(([,el])=>el.contains(e.target));
    e.preventDefault();e.stopPropagation();
    selected=hit?hit[0]:null;applyLayout();
    if(hit){const l=layoutOf(hit[0]);drag={orientation:orientation(),pointerId:e.pointerId,id:hit[0],el:hit[1],x:e.clientX,y:e.clientY,start:{...l},k:pixelScale(hit[1],l)};try{hit[1].setPointerCapture(e.pointerId);}catch{}}
  },true);
  // Taps outside the editor toolbar only select controls while editing.
  document.addEventListener('click',e=>{if(editing&&!e.target.closest?.('#editor')){e.preventDefault();e.stopPropagation();}},true);
  document.addEventListener('pointermove',e=>{
    if(!editing||!drag||e.pointerId!==drag.pointerId)return;e.preventDefault();e.stopPropagation();
    const l=drag.start;settings.layout[drag.orientation][drag.id]={...l,x:l.x+(e.clientX-drag.x)/drag.k,y:l.y+(e.clientY-drag.y)/drag.k};applyLayout();
  },true);
  const endDrag=e=>{if(!drag||(e&&e.pointerId!==drag.pointerId))return;const current=drag;drag=null;if(current.orientation===orientation())keepOnScreen(current.id,current.el);try{current.el.releasePointerCapture(current.pointerId);}catch{}save();};
  document.addEventListener('pointerup',endDrag,true);document.addEventListener('pointercancel',endDrag,true);
  function resize(step){if(!selected)return;const l=layoutOf(selected);storeLayout(selected,{s:Math.round(Math.min(2,Math.max(.5,l.s+step))*100)/100});keepOnScreen(selected,editables().find(([id])=>id===selected)[1]);}
  function startEditing(){suspend();editing=true;selected=null;document.body.classList.add('editing');document.querySelector('#editor').hidden=false;applyLayout();}
  function stopEditing(){endDrag();editing=false;selected=null;document.body.classList.remove('editing');document.querySelector('#editor').hidden=true;save();if(wasPlaying)player.ruffle().resume();if(ready)player.focus();}
  document.querySelector('#edit-layout').onclick=()=>{startEditing();panel.close();};
  document.querySelector('#editor-smaller').onclick=()=>resize(-.1);
  document.querySelector('#editor-bigger').onclick=()=>resize(.1);
  document.querySelector('#editor-hide').onclick=()=>{if(selected)storeLayout(selected,{h:!layoutOf(selected).h});};
  document.querySelector('#editor-reset').onclick=()=>{endDrag();settings.layout[orientation()]={};selected=null;save();};
  document.querySelector('#editor-done').onclick=stopEditing;
  window.matchMedia?.('(orientation: portrait)').addEventListener?.('change',()=>{endDrag();selected=null;applyLayout();});
  window.SSF2Controls.editLayout=startEditing;
  save();boot();
})();
