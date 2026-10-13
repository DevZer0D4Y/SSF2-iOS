const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const failures=[],logs=[];
class Canvas {
 constructor(){this.events={};this.width=640;this.height=360;}
 getContext(type){return type.startsWith('webgl')?{}:null;}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
 lose(){for(const fn of this.events.webglcontextlost??[])fn();}
}
const window={webkit:{messageHandlers:{gameFailure:{postMessage:reason=>failures.push(reason)}}}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../SSF2-iOS/Web/gpu-memory.js','utf8'),{window,HTMLCanvasElement:Canvas,location:{search:''},URLSearchParams,Uint8Array,Uint32Array,Map,WeakMap,Set,console:{error:text=>logs.push(text)}});
const first=new Canvas();first.getContext('webgl2');first.getContext('webgl2');
assert.equal(first.events.webglcontextlost.length,1,'A canvas has one failure listener');
first.lose();first.lose();const second=new Canvas();second.getContext('webgl');second.lose();
assert.deepEqual(failures,['graphics-lost'],'A graphics failure reaches native recovery once per page');assert(logs[0].includes('640x360'));
const plain=new Canvas();plain.getContext('2d');assert.equal(plain.events.webglcontextlost,undefined,'Unrelated canvases do not trigger recovery');
console.log('PASS: graphics context loss notifies native recovery; duplicate callbacks and unrelated canvases are handled');
// A native cache read failure must also reach recovery rather than only throwing inside WebGL.
class CacheGL {
 bindTexture(){}activeTexture(){}pixelStorei(){}getParameter(){return 0;}
 texImage2D(){}texSubImage2D(){}deleteTexture(){}framebufferTexture2D(){}
 copyTexImage2D(){}copyTexSubImage2D(){}generateMipmap(){}drawArrays(){}drawElements(){}
}
const cacheFailures=[],cacheWindow={SSF2Native:{textureCache:true},WebGLRenderingContext:CacheGL,webkit:{messageHandlers:{gameFailure:{postMessage:r=>cacheFailures.push(r)}}},prompt(name,body){const r=JSON.parse(body);return r.op==='reset'?'ok':r.op==='put'?'1':null;}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../SSF2-iOS/Web/gpu-memory.js','utf8'),{window:cacheWindow,HTMLCanvasElement:class{},location:{search:''},URLSearchParams,Uint8Array,Uint32Array,Map,WeakMap,Set,btoa:s=>Buffer.from(s,'binary').toString('base64')});
const gl=new CacheGL();gl.bindTexture(0x0DE1,{});gl.texImage2D(0x0DE1,0,0x1908,32,32,0,0x1908,0x1401,new Uint8Array(4096));
assert.throws(()=>gl.drawArrays(4,0,3),/Sprite cache read failed/);assert.deepEqual(cacheFailures,['sprite-cache-read']);
console.log('PASS: sprite-cache read failure notifies native recovery');
