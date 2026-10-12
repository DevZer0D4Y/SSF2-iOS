// SSF2 decodes thousands of bitmaps while loading and Ruffle uploads each one to the GPU at once,
// although only a small share is ever drawn (about 1 GB uploaded vs 75 MB drawn at the title screen).
// On iOS that pushes the page past its memory limit and the system kills it. This shim keeps each
// uploaded bitmap run-length compressed in JS (about 3x smaller) and uploads it the first time a
// draw, render-to-texture or partial update needs it.
(() => {
  const TEXTURE_2D = 0x0DE1, TEXTURE0 = 0x84C0, MIN_BYTES = 4096;
  const pending = new WeakMap(); // texture -> {args, packed, length, store}
  let scratch = new Uint32Array(1 << 16);
  const stats = window.SSF2TextureStats = {deferred: 0, uploaded: 0, rawBytes: 0, packedBytes: 0};

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
    return out.slice(0, o);
  }

  function unpack(packed, length) {
    const bytes = new Uint8Array(length), words = new Uint32Array(bytes.buffer, 0, length >> 2);
    let o = 0;
    for (let i = 0; i < packed.length;) {
      const token = packed[i++], count = token & 0x7FFFFFFF;
      if (token & 0x80000000) { words.fill(packed[i++], o, o + count); o += count; }
      else { words.set(packed.subarray(i, i + count), o); i += count; o += count; }
    }
    return bytes;
  }

  function install(proto) {
    const real = {};
    for (const name of ['texImage2D', 'texSubImage2D', 'texStorage2D', 'bindTexture', 'activeTexture', 'pixelStorei', 'deleteTexture', 'framebufferTexture2D', 'copyTexImage2D', 'copyTexSubImage2D', 'generateMipmap', 'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'getParameter']) {
      if (proto[name]) real[name] = proto[name];
    }
    const state = gl => gl.__ssf2 || (gl.__ssf2 = {unit: 0, bound: new Map(), store: new Map()});
    const eligible = data => data instanceof Uint8Array && data.byteLength >= MIN_BYTES && data.byteLength % 4 === 0;

    // A pending texture holds the deferred allocation (texStorage2D, used by the default wgpu renderer)
    // and/or the deferred pixels (a full-size texImage2D or texSubImage2D).
    function upload(gl, texture) {
      const entry = pending.get(texture);
      if (!entry) return;
      pending.delete(texture);
      const s = state(gl), previous = s.bound.get(s.unit) || null;
      real.bindTexture.call(gl, TEXTURE_2D, texture);
      if (entry.storage) real.texStorage2D.apply(gl, entry.storage);
      if (entry.pixels) {
        // Replay with the pixel-store settings that were active when the call was made.
        const changed = [];
        for (const [key, value] of entry.pixels.store) if (s.store.get(key) !== value) { changed.push(key); real.pixelStorei.call(gl, key, value); }
        const args = entry.pixels.args.slice(); args[8] = unpack(entry.pixels.packed, entry.pixels.length);
        real[entry.pixels.call].apply(gl, args);
        for (const key of changed) real.pixelStorei.call(gl, key, s.store.has(key) ? s.store.get(key) : real.getParameter.call(gl, key));
        stats.uploaded++;
      }
      real.bindTexture.call(gl, TEXTURE_2D, previous);
    }
    function defer(gl, texture, entry, call, args) {
      const data = args[8], packed = pack(data);
      entry.pixels = {call, args, packed, length: data.byteLength, store: new Map(state(gl).store)};
      pending.set(texture, entry);
      stats.deferred++; stats.rawBytes += data.byteLength; stats.packedBytes += packed.byteLength;
    }
    function uploadBound(gl) {
      for (const texture of state(gl).bound.values()) if (texture && pending.has(texture)) upload(gl, texture);
    }
    const currentTexture = gl => state(gl).bound.get(state(gl).unit);

    proto.activeTexture = function (unit) { state(this).unit = unit - TEXTURE0; return real.activeTexture.call(this, unit); };
    proto.bindTexture = function (target, texture) {
      if (target === TEXTURE_2D) state(this).bound.set(state(this).unit, texture);
      return real.bindTexture.call(this, target, texture);
    };
    proto.pixelStorei = function (key, value) { state(this).store.set(key, value); return real.pixelStorei.call(this, key, value); };
    proto.texImage2D = function (...args) {
      const texture = currentTexture(this);
      if (args[0] === TEXTURE_2D && texture) pending.delete(texture);
      if (args.length === 9 && args[0] === TEXTURE_2D && args[1] === 0 && texture && eligible(args[8])) return defer(this, texture, {}, 'texImage2D', args);
      return real.texImage2D.apply(this, args);
    };
    if (real.texStorage2D) proto.texStorage2D = function (...args) {
      const texture = currentTexture(this);
      // Single-level 2D storage is allocated when first needed (wgpu fills it with one full-size texSubImage2D).
      if (args[0] === TEXTURE_2D && args[1] === 1 && texture && args[3] * args[4] * 4 >= MIN_BYTES) { pending.set(texture, {storage: args, width: args[3], height: args[4]}); return; }
      return real.texStorage2D.apply(this, args);
    };
    proto.texSubImage2D = function (...args) {
      const texture = currentTexture(this), entry = texture && pending.get(texture);
      // texSubImage2D(target, level, x, y, width, height, format, type, pixels) covering the whole pending storage.
      if (entry && entry.storage && args.length === 9 && args[0] === TEXTURE_2D && args[1] === 0 && args[2] === 0 && args[3] === 0 && args[4] === entry.width && args[5] === entry.height && eligible(args[8])) return defer(this, texture, entry, 'texSubImage2D', args);
      if (texture) upload(this, texture);
      return real.texSubImage2D.apply(this, args);
    };
    proto.copyTexImage2D = function (...args) { const t = currentTexture(this); if (t) pending.delete(t); return real.copyTexImage2D.apply(this, args); };
    proto.copyTexSubImage2D = function (...args) { const t = currentTexture(this); if (t) upload(this, t); return real.copyTexSubImage2D.apply(this, args); };
    proto.generateMipmap = function (...args) { const t = currentTexture(this); if (t) upload(this, t); return real.generateMipmap.apply(this, args); };
    proto.framebufferTexture2D = function (target, attachment, textarget, texture, level) { if (texture) upload(this, texture); return real.framebufferTexture2D.call(this, target, attachment, textarget, texture, level); };
    proto.deleteTexture = function (texture) { if (texture) pending.delete(texture); return real.deleteTexture.call(this, texture); };
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
      this.addEventListener('webglcontextlost', () => console.error(`WebGL context lost (${this.width}x${this.height}, ${JSON.stringify(stats)})`));
    }
    return context;
  };

  if (new URLSearchParams(location.search).get('lazytex') === '0') return;
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) install(C.prototype);
})();
