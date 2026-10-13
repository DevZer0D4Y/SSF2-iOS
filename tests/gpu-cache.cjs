// Exercise stable handles and a bounded GPU working set across character/stage changes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const T=0x0DE1,U=0x84C0,BINDING=0x8069,RGBA=0x1908,BYTE=0x1401,events={};
class GL{
 constructor(){this.unit=0;this.bindings=new Map();this.textures=new Map();this.next=0;this.deletes=0;}
 createTexture(){const t={id:++this.next};this.textures.set(t,{bytes:null,immutable:false,params:new Map()});return t;}
 bindTexture(target,t){assert(!t||this.textures.has(t),'Binding uses a live physical texture');this.bindings.set(this.unit,t);}
 activeTexture(unit){this.unit=unit-U;}
 current(){const t=this.bindings.get(this.unit);assert(t&&this.textures.has(t),'Writes require live storage');return this.textures.get(t);}
 texImage2D(...args){const t=this.current();assert(!t.immutable);t.bytes=args[8]?Uint8Array.from(args[8]):new Uint8Array(args[3]*args[4]*4);}
 texStorage2D(target,levels,format,width,height){const t=this.current();assert(!t.immutable,'Immutable storage is allocated once per physical texture');t.immutable=true;t.bytes=new Uint8Array(width*height*4);}
 texSubImage2D(...args){const t=this.current();assert(t.bytes);if(args[2]===0&&args[3]===0&&args[8].length===t.bytes.length)t.bytes.set(args[8]);else t.bytes.set(args[8],0);}
 texParameteri(target,key,value){this.current().params.set(key,value);}texParameterf(...args){this.texParameteri(...args);}
 deleteTexture(t){if(!t)return;assert(this.textures.has(t));this.textures.delete(t);this.deletes++;for(const [unit,bound]of this.bindings)if(bound===t)this.bindings.set(unit,null);}
 isTexture(t){return this.textures.has(t);}
 getParameter(key){return key===BINDING?this.bindings.get(this.unit)||null:0;}
 getFramebufferAttachmentParameter(){return this.attached;}
 pixelStorei(){}framebufferTexture2D(target,attachment,textarget,texture){this.attached=texture;}
 copyTexImage2D(){}copyTexSubImage2D(){this.current().bytes[0]=91;}generateMipmap(){this.current().mipmaps=true;}
 drawArrays(){for(const t of this.bindings.values())if(t)assert(this.textures.get(t)?.bytes,'All draw inputs are materialized');}drawElements(){this.drawArrays();}
 bytes(){return [...this.textures.values()].reduce((sum,t)=>sum+(t.bytes?.length||0),0);}
}
const diskMode=process.argv.includes('--disk'),blobs=new Map();let serial=0;
const window={SSF2Native:{textureCache:diskMode},prompt(name,message){assert.equal(name,'SSF2TextureCache');const r=JSON.parse(message);if(r.op==='reset'){blobs.clear();return 'ok';}if(r.op==='put'){const id=String(++serial);blobs.set(id,r.data);return id;}if(r.op==='get')return blobs.get(r.id)??null;if(r.op==='drop'){blobs.delete(r.id);return 'ok';}},WebGLRenderingContext:GL,addEventListener:(name,fn)=>(events[name]??=[]).push(fn)};
vm.runInNewContext(fs.readFileSync(__dirname+'/../SSF2-iOS/Web/gpu-memory.js','utf8'),{window,HTMLCanvasElement:class{},location:{search:''},URLSearchParams,Uint8Array,Uint32Array,Map,WeakMap,Set,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary')});
const gl=new GL(),textures=[],pixels=new Uint8Array(1024*1024*4);pixels.fill(23);
for(let i=0;i<48;i++){
 const t=gl.createTexture();textures.push(t);gl.bindTexture(T,t);gl.texParameteri(T,0x2801,0x2600);
 gl.texStorage2D(T,1,0x8058,1024,1024);gl.texSubImage2D(T,0,0,0,1024,1024,RGBA,BYTE,pixels);gl.drawArrays();
 assert(gl.bytes()<=128*1024*1024,'Changing sprites never grows the cached GPU working set past 128 MB');
}
assert(window.SSF2TextureStats.evictions>=16);assert(gl.isTexture(textures[0]),'Eviction preserves the logical handle');
gl.bindTexture(T,textures[0]);gl.drawArrays();const restored=gl.bindings.get(0);
assert.notEqual(restored,textures[0],'Restoration creates a fresh physical object');assert.equal(gl.getParameter(BINDING),textures[0],'Binding queries expose the original logical handle');
assert.deepEqual(gl.textures.get(restored).bytes,pixels,'Restored pixels match exactly');assert.equal(gl.textures.get(restored).params.get(0x2801),0x2600,'Sampler parameters survive eviction');
// A restored render target or partial update must keep its modified pixels, never replay stale data.
gl.framebufferTexture2D(0x8D40,0x8CE0,T,textures[0],0);assert.equal(gl.getFramebufferAttachmentParameter(),textures[0]);
gl.copyTexSubImage2D();const pinned=gl.bindings.get(0);assert.equal(gl.textures.get(pinned).bytes[0],91);
for(const fn of events['ssf2-lowmemory'])fn();gl.bindTexture(T,textures[47]);gl.drawArrays();
assert(window.SSF2TextureStats.residentBytes<=64*1024*1024,'Memory warning shrinks the cache');assert(gl.textures.has(pinned));assert.equal(gl.textures.get(pinned).bytes[0],91,'Render targets are excluded from eviction');
// Both texture units used by a draw must survive trimming and restore correctly.
gl.activeTexture(U+1);gl.bindTexture(T,textures[1]);gl.activeTexture(U);gl.bindTexture(T,textures[2]);gl.drawElements();
assert.equal(gl.getParameter(BINDING),textures[2]);gl.activeTexture(U+1);assert.equal(gl.getParameter(BINDING),textures[1]);
// Redefining a cached sprite while another unit is active restores both physical bindings.
gl.activeTexture(U);gl.bindTexture(T,textures[2]);gl.texImage2D(T,0,RGBA,1024,1024,0,RGBA,BYTE,pixels);
gl.activeTexture(U+1);gl.drawArrays();assert(gl.bindings.get(0));assert.deepEqual(gl.textures.get(gl.bindings.get(0)).bytes,pixels);assert.equal(gl.getParameter(BINDING),textures[1]);
for(const t of textures)gl.deleteTexture(t);assert.equal(gl.bytes(),0);assert.equal(window.SSF2TextureStats.residentBytes,0);assert.equal(window.SSF2TextureStats.pendingBytes,0);
console.log('PASS: 48 character/stage sprite changes, bounded GPU memory, byte-exact restoration, sampler state, logical handles, render-target preservation, multi-texture draws and deletion');

// Separate canvases must not evict each other's GL objects.
const contexts=[new GL(),new GL()],owned=[[],[]];
for(let j=0;j<2;j++)for(let i=0;i<20;i++){const g=contexts[j],t=g.createTexture();owned[j].push(t);g.bindTexture(T,t);g.texImage2D(T,0,RGBA,1024,1024,0,RGBA,BYTE,pixels);g.drawArrays();assert(g.bytes()<=64*1024*1024);}
for(let j=0;j<2;j++)for(const t of owned[j])contexts[j].deleteTexture(t);
assert.equal(window.SSF2TextureStats.residentBytes,0);

assert.equal(blobs.size,0,'Deleting textures removes all native compressed blobs');assert.equal(window.SSF2TextureStats.diskBytes,0);console.log('PASS: '+(diskMode?'native disk paging':'browser memory fallback'));
