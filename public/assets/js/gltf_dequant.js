/* Chrono-Rift — expand quantized glTF vertex data after loading.
 *
 * The model files store normals, bone weights, colours and UVs as small integers
 * (KHR_mesh_quantization / normalized attributes) so they download faster. The GPU
 * reads those fine, but three.js r128 helpers that read attributes on the CPU
 * (getX/boneTransform, used for cape fitting and model measuring) do not convert them
 * back. So right after a model loads, every normalized integer attribute is turned back
 * into plain floats: the game behaves exactly as with the original files.
 * Must load right after GLTFLoader.js and before any model is requested.
 */
(function () {
  'use strict';
  if (!window.THREE || !THREE.GLTFLoader) return;
  const SCALE = (arr) => {
    if (arr instanceof Int8Array) return (v) => Math.max(v / 127, -1);
    if (arr instanceof Uint8Array || arr instanceof Uint8ClampedArray) return (v) => v / 255;
    if (arr instanceof Int16Array) return (v) => Math.max(v / 32767, -1);
    if (arr instanceof Uint16Array) return (v) => v / 65535;
    return null;
  };
  // padded attributes (e.g. int8 normals stored 4 bytes apart) arrive as InterleavedBufferAttribute
  function expand(attr) {
    if (!attr || !attr.normalized) return attr;
    const inter = !!attr.isInterleavedBufferAttribute;
    const src = inter ? attr.data.array : attr.array;
    if (src instanceof Float32Array) return attr;
    const f = SCALE(src); if (!f) return attr;
    const n = attr.itemSize, count = attr.count, out = new Float32Array(count * n);
    const stride = inter ? attr.data.stride : n, off = inter ? attr.offset : 0;
    for (let i = 0; i < count; i++) for (let c = 0; c < n; c++) out[i * n + c] = f(src[i * stride + off + c]);
    const a = new THREE.BufferAttribute(out, n, false);
    a.name = attr.name;
    return a;
  }
  function fix(root) {
    root.traverse((o) => {
      const g = o.geometry; if (!g || !g.attributes) return;
      Object.keys(g.attributes).forEach((k) => {
        const a = g.attributes[k];
        if (a && a.normalized) { const e = expand(a); if (e !== a) g.setAttribute(k, e); }
      });
    });
  }
  const parse = THREE.GLTFLoader.prototype.parse;
  THREE.GLTFLoader.prototype.parse = function (data, path, onLoad, onError) {
    return parse.call(this, data, path, (gltf) => {
      try { (gltf.scenes || [gltf.scene]).forEach((s) => s && fix(s)); } catch (e) { console.warn('[gltf_dequant]', e); }
      onLoad(gltf);
    }, onError);
  };

  // Models the page <head> already started downloading (window.CR_PREFETCH: absolute URL ->
  // Promise<ArrayBuffer>) are parsed from memory instead of being requested a second time.
  const load = THREE.GLTFLoader.prototype.load;
  THREE.GLTFLoader.prototype.load = function (url, onLoad, onProgress, onError) {
    const P = window.CR_PREFETCH;
    let abs = null; try { abs = new URL(url, location.href).href; } catch (e) { /* odd url */ }
    const pending = P && abs && P[abs];
    if (!pending) return load.apply(this, arguments);
    delete P[abs];
    const dir = abs.slice(0, abs.lastIndexOf('/') + 1);
    pending.then((buf) => {
      if (!buf) throw new Error('prefetch failed');
      this.parse(buf, dir, onLoad, onError);
    }).catch(() => load.call(this, url, onLoad, onProgress, onError));
  };
})();
