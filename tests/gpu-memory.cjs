// Checks that deferred textures reach WebGL byte-for-byte, with the right binding and pixel-store state.
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const calls = [];
class FakeGL {
  texImage2D(...a) { calls.push(['texImage2D', this.boundNow, a[8] && Uint8Array.from(a[8]), [...this.storeNow || []]]); }
  texSubImage2D(...a) { calls.push(['texSubImage2D', this.boundNow, a[8] && Uint8Array.from(a[8])]); }
  texStorage2D(t, l, f, w, h) { calls.push(['texStorage2D', this.boundNow, w, h]); }
  bindTexture(t, x) { this.boundNow = x; } activeTexture() {} pixelStorei(k, v) { (this.storeNow ||= new Map()).set(k, v); }
  getParameter() { return 0; } deleteTexture() {} framebufferTexture2D() { calls.push(['fb']); } copyTexImage2D() {} copyTexSubImage2D() {} generateMipmap() {}
  drawArrays() { calls.push(['draw', this.boundNow]); } drawElements() { calls.push(['draw', this.boundNow]); }
}
const window = {WebGLRenderingContext: FakeGL, WebGL2RenderingContext: undefined};
vm.runInNewContext(fs.readFileSync(__dirname + "/../SSF2-iOS/Web/gpu-memory.js", "utf8"), {HTMLCanvasElement: class {}, window, location: {search: ''}, URLSearchParams, Uint8Array, Uint32Array, Map, WeakMap});
const gl = new FakeGL(), T2D = 0x0DE1, a = {id: 'a'}, b = {id: 'b'};
const sprite = new Uint8Array(64 * 64 * 4); for (let i = 0; i < sprite.length; i++) sprite[i] = (i >> 9) % 3 ? 0 : (i * 7) & 255;
const noise = new Uint8Array(32 * 32 * 4).map((_, i) => (i * 2654435761 >>> 13) & 255);
gl.pixelStorei(0x9241, 1);
gl.bindTexture(T2D, a); gl.texImage2D(T2D, 0, 0x1908, 64, 64, 0, 0x1908, 0x1401, sprite);
gl.bindTexture(T2D, b); gl.texImage2D(T2D, 0, 0x1908, 32, 32, 0, 0x1908, 0x1401, noise);
gl.pixelStorei(0x9241, 0);
assert.equal(calls.length, 0, 'uploads are deferred');
gl.drawArrays(4, 0, 3);
assert.deepEqual(calls.map(c => c[0]), ['texImage2D', 'draw'], 'only the bound texture uploads at draw');
assert.equal(calls[0][1], b); assert.deepEqual(calls[0][2], noise); assert.deepEqual(calls[0][3], [[0x9241, 1]], 'upload replays the original pixel-store state');
assert.equal(calls[1][1], b, 'binding is restored');
gl.bindTexture(T2D, b); gl.drawArrays(4, 0, 3); assert.equal(calls.filter(c => c[0] === 'texImage2D').length, 1, 'uploaded once');
gl.bindTexture(T2D, null); calls.length = 0;
gl.framebufferTexture2D(0x8D40, 0x8CE0, T2D, a, 0);
assert.equal(calls[0][1], a); assert.deepEqual(calls[0][2], sprite, 'render-to-texture uploads first');
const c = {}; gl.bindTexture(T2D, c); gl.texImage2D(T2D, 0, 0x1908, 64, 64, 0, 0x1908, 0x1401, sprite); calls.length = 0;
gl.texSubImage2D(T2D, 0, 0, 0, 1, 1, 0x1908, 0x1401, new Uint8Array(4));
assert.deepEqual(calls.map(x => x[0]), ['texImage2D', 'texSubImage2D'], 'partial updates upload first');
// wgpu path: texStorage2D + full-size texSubImage2D are deferred together; partial updates allocate first.
const d = {id: 'd'}; gl.bindTexture(T2D, d); calls.length = 0;
gl.texStorage2D(T2D, 1, 0x8058, 64, 64); gl.texSubImage2D(T2D, 0, 0, 0, 64, 64, 0x1908, 0x1401, sprite);
assert.equal(calls.length, 0, 'storage and pixels are deferred');
gl.drawElements(4, 3, 0x1403, 0);
assert.deepEqual(calls.map(x => x[0]), ['texStorage2D', 'texSubImage2D', 'draw']); assert.deepEqual(calls[1][2], sprite, 'wgpu upload is byte-exact');
const e = {id: 'e'}; gl.bindTexture(T2D, e); calls.length = 0;
gl.texStorage2D(T2D, 1, 0x8058, 64, 64); gl.texSubImage2D(T2D, 0, 8, 8, 4, 4, 0x1908, 0x1401, new Uint8Array(64));
assert.deepEqual(calls.map(x => x[0]), ['texStorage2D', 'texSubImage2D'], 'partial write allocates storage first');
assert.equal(window.SSF2TextureStats.pendingBytes,0,'Draws consume all pending pixel buffers');
// Replacing and deleting deferred allocations must free their packed bytes and logical bindings.
const removed={};gl.bindTexture(T2D,removed);gl.texStorage2D(T2D,1,0x8058,64,64);gl.texSubImage2D(T2D,0,0,0,64,64,0x1908,0x1401,sprite);
const firstSize=window.SSF2TextureStats.pendingBytes;assert(firstSize>0);
gl.texSubImage2D(T2D,0,0,0,64,64,0x1908,0x1401,sprite);assert.equal(window.SSF2TextureStats.pendingBytes,firstSize,'Full replacements do not accumulate packed memory');
gl.deleteTexture(removed);assert.equal(window.SSF2TextureStats.pendingBytes,0);calls.length=0;gl.drawArrays(4,0,3);assert.deepEqual(calls.map(c=>c[0]),['draw'],'Deleted bound textures never upload');
// A small sprite view may point into a huge WASM heap. The deferred texture must not retain that heap.
(async()=>{
 assert.equal(typeof global.gc,'function','Run this suite with node --expose-gc');
 let sourceHeap=new ArrayBuffer(32*1024*1024),view=new Uint8Array(sourceHeap,0,sprite.length);view.set(sprite);
 const heapRef=new WeakRef(sourceHeap),retained={};gl.bindTexture(T2D,retained);gl.texImage2D(T2D,0,0x1908,64,64,0,0x1908,0x1401,view);
 sourceHeap=null;view=null;
 for(let i=0;i<8;i++){await new Promise(setImmediate);global.gc();}
 assert.equal(heapRef.deref(),undefined,'Deferred texture releases the original WASM backing buffer');
 calls.length=0;gl.drawArrays(4,0,3);assert.deepEqual(calls[0][2],sprite,'Upload remains byte-exact after the original heap is collected');
 console.log('PASS: wgpu storage path;  deferral, byte-exact round trip, pixel-store replay, binding restore, render targets, partial updates', JSON.stringify(window.SSF2TextureStats));

})();
