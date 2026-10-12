const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync(__dirname+'/../SSF2-iOS/Web/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function load({native=false,saved=false,blocked=false,dpr=3,search=''}={}){
 const window={devicePixelRatio:dpr,SSF2Native:{lowMemory:native}},frames=[],events=[],player={style:{width:'100%'}};let persisted;
 vm.runInNewContext(script,{window,location:{search},URLSearchParams,document:{querySelector:()=>player},localStorage:{getItem(){if(blocked)throw Error('Denied');return saved?'1':null;},setItem(k,v){if(blocked)throw Error('Denied');persisted=v;}},requestAnimationFrame:fn=>frames.push(fn),dispatchEvent:e=>events.push(e.type),Event:class{constructor(type){this.type=type;}}});
 return {window,frames,events,player,persisted:()=>persisted};
}
assert.equal(load().window.devicePixelRatio,1.5,'Retina render buffers have a bounded default resolution');
assert.equal(load({dpr:1}).window.devicePixelRatio,1,'Lower-resolution displays retain their native ratio');
for(const options of [{native:true,blocked:true},{saved:true}]){const {window}=load(options);assert.equal(window.devicePixelRatio,1);assert.equal(window.RufflePlayer.config.quality,'low','Recovery survives app restarts and unavailable web storage');}
const recovery=load();recovery.window.SSF2Rendering.lowerMemory();assert.equal(recovery.window.devicePixelRatio,1);assert.equal(recovery.persisted(),'1');assert.deepEqual(recovery.events,['ssf2-lowmemory']);
assert.equal(recovery.player.style.width,'calc(100% - 1px)');recovery.frames.shift()();assert.equal(recovery.player.style.width,'calc(100% - 1px)','Resize spans a rendered frame');recovery.frames.shift()();assert.equal(recovery.player.style.width,'100%');
assert.doesNotThrow(()=>load({blocked:true}).window.SSF2Rendering.lowerMemory());
console.log('PASS: rendering resolution cap, persistent native/web recovery, blocked storage, memory event and resize');
