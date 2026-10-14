// SSF2 decodes thousands of bitmaps while loading and Ruffle uploads each one to the GPU at once,
// although only a small share is ever drawn (about 1 GB uploaded vs 75 MB drawn at the title screen).
// On iOS that pushes the page past its memory limit and the system kills it. This shim keeps each
// uploaded bitmap run-length compressed in JS (about 3x smaller) and uploads it the first time a
// draw, render-to-texture or partial update needs it. Static sprites use a bounded GPU cache;
// evicted sprites retain compressed pixels and transparently restore through stable logical handles.
(() => {
  const TEXTURE_2D = 0x0DE1, TEXTURE0 = 0x84C0, MIN_BYTES = 4096;
  const pending = new WeakMap(); // texture -> {args, packed, length, store}
  let scratch = new Uint32Array(1 << 16), decodeScratch = new Uint8Array(1 << 16);
  const stats = window.SSF2TextureStats = {deferred: 0, uploaded: 0, rawBytes: 0, packedBytes: 0, pendingBytes: 0, diskBytes:0, residentBytes: 0, evictions: 0, restored: 0};

  // Words are 32-bit pixels. Tokens: count | 0x80000000 followed by one repeated word, or count followed by count literal words.
  function pack(bytes) {
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2), n = words.length;
    if (scratch.length < n + (n >> 1) + 4) scratch = new Uint32Array(n + (n >> 1) + 4);
    const out = scratch;
    let o = 0, i = 0;
    while (i < n) {
      const value = words[i];
      let j = i + 1;
      while (j < n && words[j] === value) j++;
      if (j - i >= 3) { out[o++] = (j - i) | 0x80000000; out[o++] = value; i = j; continue; }
      let k = i + 1;
      while (k < n && !(k + 2 < n && words[k] === words[k + 1] && words[k] === words[k + 2])) k++;
      out[o++] = k - i;
      out.set(words.subarray(i, k), o); o += k - i; i = k;
    }
    const result=out.slice(0, o);
    if(scratch.byteLength>4*1024*1024)scratch=new Uint32Array(1<<16);
    return result;
  }

  function unpack(packed, length) {
    // Reuse a bounded staging buffer instead of allocating another full sprite on every upload.
    let bytes;
    if(length<=8*1024*1024){
      if(decodeScratch.length<length)decodeScratch=new Uint8Array(length);
      bytes=decodeScratch.subarray(0,length);
    }else bytes=new Uint8Array(length);
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, length >> 2);
    let o = 0;
    for (let i = 0; i < packed.length;) {
      const token = packed[i++], count = token & 0x7FFFFFFF;
      if (token & 0x80000000) { words.fill(packed[i++], o, o + count); o += count; }
      else { words.set(packed.subarray(i, i + count), o); i += count; o += count; }
    }
    return bytes;
  }

  // Move compressed sprites out of WebKit's heap on iOS. Reads remain synchronous because
  // WebGL draw calls cannot await an asynchronous database lookup.
  let disk=false;
  try{disk=window.SSF2Native?.textureCache && window.prompt?.('SSF2TextureCache',JSON.stringify({op:'reset'}))==='ok';}catch{}
  function cacheRequest(request){return window.prompt('SSF2TextureCache',JSON.stringify(request));}
  function storePixels(packed){
    if(disk){
      try{
        const bytes=new Uint8Array(packed.buffer,packed.byteOffset,packed.byteLength),chunks=[];
        for(let i=0;i<bytes.length;i+=16384)chunks.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
        const id=cacheRequest({op:'put',data:btoa(chunks.join(''))});
        if(id && /^\d+$/.test(id)){stats.diskBytes+=packed.byteLength;return {packed:null,diskId:id,packedLength:packed.byteLength};}
      }catch{}
    }
    return {packed,diskId:null,packedLength:packed.byteLength};
  }
  let failureReported=false;
  function reportFailure(reason){
    if(failureReported)return;failureReported=true;
    window.webkit?.messageHandlers?.gameFailure?.postMessage(reason);
  }
  function readPixels(pixels){
    if(!pixels.diskId)return pixels.packed;
    const encoded=cacheRequest({op:'get',id:pixels.diskId});
    if(encoded===null){reportFailure('sprite-cache-read');throw new Error('Sprite cache read failed. Restart the game.');}
    const text=atob(encoded),bytes=new Uint8Array(text.length);
    for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);
    return new Uint32Array(bytes.buffer);
  }
  function releasePixels(entry){
    const pixels=entry?.pixels;
    if(pixels?.diskId){cacheRequest({op:'drop',id:pixels.diskId});stats.diskBytes-=pixels.packedLength;pixels.diskId=null;}
  }
  function dropPending(texture,discard=false){
    const entry=pending.get(texture);
    if(entry?.pixels)stats.pendingBytes-=entry.pixels.packedLength;
    if(discard)releasePixels(entry);
    pending.delete(texture);
  }
  function setPending(texture,entry){
    dropPending(texture,true);
    pending.set(texture,entry);
    if(entry.pixels)stats.pendingBytes+=entry.pixels.packedLength;
  }
  window.addEventListener?.('ssf2-lowmemory',()=>{
    scratch=new Uint32Array(1<<16);decodeScratch=new Uint8Array(1<<16);
  });

  function install(proto) {
    const real = {};
    for (const name of ['createTexture','texParameteri','texParameterf','isTexture','getFramebufferAttachmentParameter','texImage2D', 'texSubImage2D', 'texStorage2D', 'bindTexture', 'activeTexture', 'pixelStorei', 'deleteTexture', 'framebufferTexture2D', 'copyTexImage2D', 'copyTexSubImage2D', 'generateMipmap', 'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'getParameter']) {
      if (proto[name]) real[name] = proto[name];
    }
    const state = gl => gl.__ssf2 || (gl.__ssf2 = {unit: 0, bound: new Map(), store: new Map(), resident:new Map(), residentBytes:0});
    const eligible = data => data instanceof Uint8Array && data.byteLength >= MIN_BYTES && data.byteLength % 4 === 0 && data.byteOffset % 4 === 0;
    // Keep logical handles stable for Ruffle while replacing evicted physical GL objects.
    // Weak maps let discarded movie handles and their compressed copies be collected.
    const cache = new WeakMap(), aliases = new WeakMap(), reverse = new WeakMap(), parameters = new WeakMap();
    // Each WebGL context owns its own resident set; handles cannot move between contexts.
    let budget = (window.SSF2Native?.lowMemory ? 64 : 128) * 1024 * 1024;
    function physical(gl,texture){
      if(!texture||!aliases.has(texture))return texture;
      let actual=aliases.get(texture);
      if(!actual){actual=real.createTexture.call(gl);aliases.set(texture,actual);reverse.set(actual,texture);state(gl).rebind=true;}
      return actual;
    }
    function discardCached(gl,texture){
      const s=state(gl),resident=s.resident,entry=cache.get(texture);
      if(resident.delete(texture)){s.residentBytes-=entry.pixels.length;stats.residentBytes-=entry.pixels.length;}
      releasePixels(entry);cache.delete(texture);
    }
    function trim(gl,extra=0){
      const s=state(gl),resident=s.resident,protectedTextures=new Set(s.bound.values());
      for(const [texture,entry] of resident){
        if(s.residentBytes+extra<=budget)break;
        if(protectedTextures.has(texture))continue;
        real.deleteTexture.call(gl,aliases.has(texture)?aliases.get(texture):texture);
        aliases.set(texture,null);resident.delete(texture);
        s.residentBytes-=entry.pixels.length;stats.residentBytes-=entry.pixels.length;stats.evictions++;
      }
    }
    window.addEventListener?.('ssf2-lowmemory',()=>{budget=64*1024*1024;});
    function upload(gl, texture) {
      const s=state(gl),resident=s.resident,entry = pending.get(texture) || cache.get(texture);
      if (!entry) return;
      if(resident.has(texture)){resident.delete(texture);resident.set(texture,entry);return;}
      const restoring=cache.has(texture);
      trim(gl,entry.pixels?.length||0);
      dropPending(texture);
      const previous = s.bound.get(s.unit) || null, changed=[];
      real.bindTexture.call(gl, TEXTURE_2D, physical(gl,texture));
      try{
        if (entry.storage) real.texStorage2D.apply(gl, entry.storage);
        for(const [name,key,value] of parameters.get(texture)||[])real[name].call(gl,TEXTURE_2D,key,value);
        if (entry.pixels) {
          for (const [key, value] of entry.pixels.store) if (s.store.get(key) !== value) { changed.push([key,s.store.has(key)?s.store.get(key):real.getParameter.call(gl,key)]); real.pixelStorei.call(gl, key, value); }
          const args = entry.pixels.args.slice(); args[8] = unpack(readPixels(entry.pixels), entry.pixels.length);
          real[entry.pixels.call].apply(gl, args);
          cache.set(texture,entry);resident.set(texture,entry);
          s.residentBytes+=entry.pixels.length;stats.residentBytes+=entry.pixels.length;
          stats.uploaded++;if(restoring)stats.restored++;
        }
      }finally{
        for (const [key,value] of changed) real.pixelStorei.call(gl, key, value);
        real.bindTexture.call(gl, TEXTURE_2D, physical(gl,previous));
      }
    }
    function defer(gl, texture, entry, call, args) {
      const data = args[8], packed = pack(data), metadata=args.slice();
      // Never retain the source view: it may keep an entire old WASM heap alive.
      metadata[8]=null;
      dropPending(texture,true);
      if(cache.has(texture)){discardCached(gl,texture);real.deleteTexture.call(gl,aliases.has(texture)?aliases.get(texture):texture);aliases.set(texture,null);state(gl).rebind=true;}
      entry.pixels = {call, args:metadata, ...storePixels(packed), length: data.byteLength, store: new Map(state(gl).store)};
      setPending(texture, entry);
      stats.deferred++; stats.rawBytes += data.byteLength; stats.packedBytes += packed.byteLength;
    }
    function uploadBound(gl) {
      for (const texture of new Set(state(gl).bound.values())) if (texture) upload(gl, texture);
      const s=state(gl);
      if(s.rebind){
        // A replaced texture can be sampled on another unit than the active upload unit.
        // Rebind every logical slot before drawing, then restore the active unit.
        for(const [unit,texture] of s.bound){real.activeTexture.call(gl,TEXTURE0+unit);real.bindTexture.call(gl,TEXTURE_2D,physical(gl,texture));}
        real.activeTexture.call(gl,TEXTURE0+s.unit);s.rebind=false;
      }
      trim(gl);
    }
    const currentTexture = gl => state(gl).bound.get(state(gl).unit);
    // Render targets, mipmaps and GPU/partial writes cannot be reconstructed from the original pixels.
    // Materialize them and remove them from eviction rather than risk restoring stale contents.
    function pin(gl,texture){if(texture){upload(gl,texture);discardCached(gl,texture);}}
    proto.activeTexture = function (unit) { state(this).unit = unit - TEXTURE0; return real.activeTexture.call(this, unit); };
    proto.bindTexture = function (target, texture) {
      if (target === TEXTURE_2D) state(this).bound.set(state(this).unit, texture);
      return real.bindTexture.call(this, target, physical(this,texture));
    };
    proto.getParameter = function(key){const value=real.getParameter.call(this,key);return value && typeof value==='object' ? reverse.get(value)||value : value;};
    if(real.getFramebufferAttachmentParameter)proto.getFramebufferAttachmentParameter=function(...args){const value=real.getFramebufferAttachmentParameter.apply(this,args);return value && typeof value==='object'?reverse.get(value)||value:value;};
    if(real.isTexture)proto.isTexture=function(texture){return cache.has(texture)&&aliases.get(texture)===null?true:real.isTexture.call(this,physical(this,texture));};
    for(const name of ['texParameteri','texParameterf'])if(real[name])proto[name]=function(target,key,value){
      const texture=target===TEXTURE_2D&&currentTexture(this);
      if(texture){let list=parameters.get(texture)||[];list=list.filter(item=>item[1]!==key);list.push([name,key,value]);parameters.set(texture,list);}
      return real[name].call(this,target,key,value);
    };
    proto.pixelStorei = function (key, value) { state(this).store.set(key, value); return real.pixelStorei.call(this, key, value); };
    proto.texImage2D = function (...args) {
      const texture = args[0]===TEXTURE_2D&&currentTexture(this);
      if (args.length === 9 && args[1] === 0 && texture && eligible(args[8])) return defer(this, texture, {}, 'texImage2D', args);
      if(texture){if(args[1]!==0)pin(this,texture);dropPending(texture,true);discardCached(this,texture);}
      return real.texImage2D.apply(this, args);
    };
    if (real.texStorage2D) proto.texStorage2D = function (...args) {
      const texture = args[0]===TEXTURE_2D&&currentTexture(this);
      if(texture){dropPending(texture,true);discardCached(this,texture);}
      if (args[1] === 1 && texture && args[3] * args[4] * 4 >= MIN_BYTES) { setPending(texture, {storage: args.slice(), width: args[3], height: args[4]}); return; }
      return real.texStorage2D.apply(this, args);
    };
    proto.texSubImage2D = function (...args) {
      const texture = args[0]===TEXTURE_2D&&currentTexture(this), entry = texture && pending.get(texture);
      if (entry && entry.storage && args.length === 9 && args[1] === 0 && args[2] === 0 && args[3] === 0 && args[4] === entry.width && args[5] === entry.height && eligible(args[8])) return defer(this, texture, entry, 'texSubImage2D', args);
      pin(this,texture);return real.texSubImage2D.apply(this, args);
    };
    proto.copyTexImage2D = function (...args) { const t = currentTexture(this); if (t) {dropPending(t,true);discardCached(this,t);} return real.copyTexImage2D.apply(this, args); };
    proto.copyTexSubImage2D = function (...args) { pin(this,currentTexture(this)); return real.copyTexSubImage2D.apply(this, args); };
    proto.generateMipmap = function (...args) { pin(this,currentTexture(this)); return real.generateMipmap.apply(this, args); };
    proto.framebufferTexture2D = function (target, attachment, textarget, texture, level) { pin(this,texture); return real.framebufferTexture2D.call(this, target, attachment, textarget, physical(this,texture), level); };
    proto.deleteTexture = function (texture) {
      if(texture){dropPending(texture,true);discardCached(this,texture);parameters.delete(texture);for(const [unit,bound] of state(this).bound)if(bound===texture)state(this).bound.set(unit,null);}
      const actual=texture&&aliases.has(texture)?aliases.get(texture):texture;
      aliases.delete(texture);if(actual)reverse.delete(actual);
      return real.deleteTexture.call(this, actual);
    };
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      if (real[name]) proto[name] = function (...args) { uploadBound(this); return real[name].apply(this, args); };
    }
  }

  // Report WebGL context loss (the GPU dropping the game's context leaves a frozen or gray picture while audio keeps playing).
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const context = getContext.call(this, type, ...rest);
    if (context && /webgl/.test(type) && !this.__ssf2Watched) {
      this.__ssf2Watched = true;
      this.addEventListener('webglcontextlost', () => {
        reportFailure('graphics-lost');
        console.error(`WebGL context lost (${this.width}x${this.height}, ${JSON.stringify(stats)})`);
      });
    }
    return context;
  };

  if (new URLSearchParams(location.search).get('lazytex') === '0') return;
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) install(C.prototype);
})();
