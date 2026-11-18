/* =============================================================================
 * Chrono-Rift — grounding & instanced-prop culling
 *
 *  1) Soft contact shadows: blurred ambient-occlusion "blob" decals that hug the
 *     terrain (lifted per-vertex by the shared heightmap hook) under trees,
 *     rocks and every character. Two draw calls total:
 *       - props:      one InstancedMesh filled from the same per-chunk blocks
 *                     as the props themselves (static, culled with them)
 *       - characters: one InstancedMesh refreshed each frame (hero, allies,
 *                     party, visible monsters, nearby NPCs); shrinks and fades
 *                     while airborne so jumps read clearly.
 *  2) Smooth frustum culling for the instanced props/foliage: props are cached
 *     per 64 m chunk as ready-made matrix/colour blocks. Each frame the visible
 *     chunk set is tested against the camera frustum (with a generous margin so
 *     nothing ever pops at the screen edge; chunks near the hero always stay in
 *     for the shadow map). Only when that set changes are the blocks memcpy'd
 *     into the instance buffers and the used range uploaded.
 * ============================================================================= */
(function () {
  'use strict';
  const M = window.MMO;
  const W = M.WORLD;

  // decal radius per prop type (metres at scale 1) and darkness
  // radii reach well past each prop's footprint so the soft falloff shows around it
  const AO_PROPS = {
    tree0: [3.5, 0.6], tree1: [3.5, 0.6], tree2: [3.5, 0.6], tree3: [3.5, 0.6], oak: [3.4, 0.6],
    pine: [2.9, 0.55], snowpine: [2.9, 0.55], deadtree: [2.2, 0.5],
    rock: [1.9, 0.55], boulder: [3.3, 0.6], mushroom: [1.2, 0.4], cactus: [1.4, 0.45], pillar: [1.9, 0.5],
    crystal: [1.6, 0.4], icespike: [1.6, 0.45], lavarock: [1.8, 0.45], grave: [1.4, 0.45], bones: [1.2, 0.35],
    pylon: [1.8, 0.5]
  };
  const SHADOW_KEEP = 56;      // m: chunks this close always render (they cast into the shadow map)
  const MARGIN = 12;           // m: frustum margin -> no popping at screen edges

  // The visible ground is a piecewise-linear triangle grid (mmo_terrain.js, 1100 m /
  // 300 segments, PlaneGeometry split). Decals rebuild that exact surface so they
  // sit ON the rendered ground on slopes too (the smooth heightmap can be 20-50 cm off).
  const AO_VERT = `
    #include <common>
    #include <fog_pars_vertex>
    __TERRAIN__
    uniform float uGroundStep;
    varying vec2 vUv;
    varying float vStr;
    float groundH(vec2 xz) {
      if (uTerrOn < 0.5) return 0.0;
      vec2 g = xz / uGroundStep;
      vec2 c0 = floor(g);
      vec2 f = g - c0;
      vec2 p0 = c0 * uGroundStep;
      float h00 = terrSample(p0).r;
      float h10 = terrSample(p0 + vec2(uGroundStep, 0.0)).r;
      float h01 = terrSample(p0 + vec2(0.0, uGroundStep)).r;
      float h11 = terrSample(p0 + vec2(uGroundStep)).r;
      return (f.x + f.y <= 1.0)
        ? h00 + f.x * (h10 - h00) + f.y * (h01 - h00)
        : h11 + (1.0 - f.x) * (h01 - h11) + (1.0 - f.y) * (h10 - h11);
    }
    void main() {
      vUv = uv * 2.0 - 1.0;
      #ifdef USE_INSTANCING_COLOR
        vStr = instanceColor.r;
      #else
        vStr = 1.0;
      #endif
      #ifdef USE_INSTANCING
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      #else
        vec4 wp = modelMatrix * vec4(position, 1.0);
      #endif
      wp.y = groundH(wp.xz) + 0.03;
      vec4 mvPosition = viewMatrix * wp;
      mvPosition.xyz += normalize(-mvPosition.xyz) * 0.06;   // tiny pull toward the camera vs z-fighting
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  const AO_FRAG = `
    uniform vec3 uTint;
    uniform float uStrength;
    varying vec2 vUv;
    varying float vStr;
    #include <fog_pars_fragment>
    void main() {
      float r = length(vUv);
      if (r > 1.0) discard;
      // wide soft penumbra + a tighter, darker core right at the contact point
      float a = smoothstep(1.0, 0.15, r) * 0.72 + smoothstep(0.5, 0.0, r) * 0.28;
      a *= vStr * uStrength;
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogF = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);
        #else
          float fogF = smoothstep(fogNear, fogFar, fogDepth);
        #endif
        a *= 1.0 - fogF;
      #endif
      gl_FragColor = vec4(uTint, a);
    }`;

  function makeAOMaterial(strength, groundStep) {
    const TU = window.TERRAIN_UNIFORMS || {};
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, THREE.UniformsLib.fog, TU, {
        uTint: { value: new THREE.Color(0.02, 0.05, 0.07) },
        uStrength: { value: strength },
        uGroundStep: { value: groundStep }
      }),
      vertexShader: AO_VERT.replace('__TERRAIN__', window.TERRAIN_GLSL || 'uniform float uTerrOn; vec4 terrSample(vec2 p){ return vec4(0.0); }'),
      fragmentShader: AO_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4
    });
    mat.userData.noTerrain = true;   // heights are computed above
    return mat;
  }

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld };
  const _frustum = new THREE.Frustum();
  const _pm = new THREE.Matrix4();
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _c = new THREE.Color();

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      this.initGrounding();
    },

    initGrounding() {
      // shared decal quad (4x4 grid so it bends with slopes)
      const geo = new THREE.PlaneGeometry(2, 2, 6, 6);
      const step = this._groundStep || (1100 / 300);
      geo.rotateX(-Math.PI / 2);
      this._aoGeo = geo;
      // props: lives in propInst so streaming/culling fill it with everything else
      const pAO = new THREE.InstancedMesh(geo, makeAOMaterial(0.62, step), 6000);
      pAO.setColorAt(0, new THREE.Color(1, 1, 1));
      pAO.count = 0;
      pAO.frustumCulled = false;
      pAO.castShadow = false;
      pAO.receiveShadow = false;
      pAO.renderOrder = 0;
      pAO.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(pAO);
      if (this.propInst) this.propInst._ao = pAO;
      this.propAO = pAO;
      // characters: refreshed every frame
      const cAO = new THREE.InstancedMesh(geo, makeAOMaterial(0.72, step), 256);
      cAO.setColorAt(0, new THREE.Color(1, 1, 1));
      cAO.count = 0;
      cAO.frustumCulled = false;
      cAO.castShadow = false;
      cAO.receiveShadow = false;
      cAO.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(cAO);
      this.charAO = cAO;
      this._chunkCache = new Map();
      this._propChunkKey = '';
    },

    // ---- per-chunk prop blocks ------------------------------------------------
    buildPropChunkBlock(cx, cz, far) {
      const ch = this.worldGen.chunk(cx, cz);
      const lists = {};
      const add = (t, mat, col) => {
        let L = lists[t];
        if (!L) L = lists[t] = { m: [], c: [] };
        for (let i = 0; i < 16; i++) L.m.push(mat.elements[i]);
        L.c.push(col.r, col.g, col.b);
      };
      let hMin = Infinity, hMax = -Infinity, tall = 14;
      for (let k = 0; k < ch.props.length; k++) {
        const p = ch.props[k];
        if (far && p.t !== 'ridge' && p.t !== 'mesa') continue;
        const pk = (p.t === 'oak' && this.treeVariants) ? this.treeVariants[Math.min(this.treeVariants.length - 1, Math.floor(p.c * this.treeVariants.length))] : p.t;
        if (!this.propInst[pk]) continue;
        _p.set(p.x, 0, p.z);
        _q.setFromAxisAngle(_up, p.r);
        if (p.t === 'ridge') _s.set(p.s, p.s * (1.2 + p.c * 0.9), p.s); else _s.set(p.s, p.s, p.s);
        _m.compose(_p, _q, _s);
        const zid = this.worldGen.zones[p.zone].id;
        const T = this._propTints;
        const tint = (T.byZone[zid] && T.byZone[zid][p.t]) || T.def[p.t] || 0xffffff;
        if (p.t === 'flower') _c.setHex(T.flowers[Math.floor(p.c * T.flowers.length)]);
        else _c.setHex(tint).multiplyScalar(0.86 + p.c * 0.28);
        add(pk, _m, _c);
        const ao = AO_PROPS[pk];
        if (ao && this.propAO) {
          const r = ao[0] * p.s;
          _s.set(r, 1, r);
          _q.identity();
          _m.compose(_p, _q, _s);
          _c.setRGB(ao[1], 0, 0);
          add('_ao', _m, _c);
        }
        if (p.t === 'ridge' || p.t === 'mesa') tall = Math.max(tall, 40 * p.s);
      }
      // vertical extent from the terrain under the chunk
      const cs = W.chunk;
      const tv = this.terrainVisualHeight ? (x, z) => this.terrainVisualHeight(x, z) : () => 0;
      for (let i = 0; i <= 2; i++) {
        for (let j = 0; j <= 2; j++) {
          const h = tv(cx * cs + i * cs / 2, cz * cs + j * cs / 2);
          hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
        }
      }
      const blocks = {};
      let total = 0;
      Object.keys(lists).forEach((t) => {
        blocks[t] = { m: new Float32Array(lists[t].m), c: new Float32Array(lists[t].c), n: lists[t].c.length / 3 };
        total += blocks[t].n;
      });
      const box = new THREE.Box3(
        new THREE.Vector3(cx * cs - MARGIN, hMin - MARGIN, cz * cs - MARGIN),
        new THREE.Vector3((cx + 1) * cs + MARGIN, hMax + tall + MARGIN, (cz + 1) * cs + MARGIN)
      );
      return { cx, cz, far, blocks, box, total, mid: new THREE.Vector2((cx + 0.5) * cs, (cz + 0.5) * cs) };
    },

    // Replaces mmo_world's version: chunk set changes -> refresh list; every frame -> cull
    updatePropStreaming(force = false) {
      if (!this.propInst || !this._chunkCache) return;
      if (!this._propTints) this._propTints = this.propTintTables ? this.propTintTables() : { byZone: {}, def: {}, flowers: [0xffffff] };
      const cs = W.chunk;
      const pcx = Math.floor(this.player.pos.x / cs);
      const pcz = Math.floor(this.player.pos.z / cs);
      const key = pcx + ',' + pcz + (this.treeVariants ? 't' : '');
      if (force || this._propChunkKey === '') this._chunkCache.clear();
      if (force || key !== this._propChunkKey) {
        this._propChunkKey = key;
        const R = 3, RR = 6;
        const list = [];
        for (let dx = -RR; dx <= RR; dx++) {
          for (let dz = -RR; dz <= RR; dz++) {
            const far = Math.abs(dx) > R || Math.abs(dz) > R;
            const ck = (pcx + dx) + ',' + (pcz + dz) + (far ? 'f' : 'n');
            let blk = this._chunkCache.get(ck);
            if (!blk) {
              blk = this.buildPropChunkBlock(pcx + dx, pcz + dz, far);
              this._chunkCache.set(ck, blk);
            }
            if (blk.total) list.push(blk);
          }
        }
        if (this._chunkCache.size > 600) {               // bound memory: keep only the active set
          const keep = new Set(list);
          for (const [k, v] of this._chunkCache) if (!keep.has(v)) this._chunkCache.delete(k);
        }
        this._propChunks = list;
        this._propVisSig = null;
      }
      this.cullPropChunks();
    },

    cullPropChunks() {
      const list = this._propChunks;
      if (!list) return;
      const cam = this.camera;
      cam.updateMatrixWorld();
      _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_pm);
      const px = this.player.pos.x, pz = this.player.pos.z;
      let sig = this._visBits || (this._visBits = []);
      let changed = !this._propVisSig || sig.length !== list.length;
      if (sig.length !== list.length) sig.length = list.length;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const dx = Math.max(Math.abs(b.mid.x - px) - W.chunk / 2, 0), dz = Math.max(Math.abs(b.mid.y - pz) - W.chunk / 2, 0);
        const vis = (dx * dx + dz * dz < SHADOW_KEEP * SHADOW_KEEP) || _frustum.intersectsBox(b.box);
        if (sig[i] !== vis) { sig[i] = vis; changed = true; }
      }
      if (!changed) return;
      this._propVisSig = true;
      // rebuild instance buffers from the visible blocks (memcpy, upload used range only)
      const types = Object.keys(this.propInst);
      for (let ti = 0; ti < types.length; ti++) {
        const t = types[ti];
        const inst = this.propInst[t];
        const cap = inst.instanceMatrix.count;
        const MA = inst.instanceMatrix.array, CA = inst.instanceColor ? inst.instanceColor.array : null;
        let n = 0;
        for (let i = 0; i < list.length && n < cap; i++) {
          if (!sig[i]) continue;
          const blk = list[i].blocks[t];
          if (!blk) continue;
          const take = Math.min(blk.n, cap - n);
          MA.set(take === blk.n ? blk.m : blk.m.subarray(0, take * 16), n * 16);
          if (CA) CA.set(take === blk.n ? blk.c : blk.c.subarray(0, take * 3), n * 3);
          n += take;
        }
        inst.count = n;
        inst.instanceMatrix.updateRange.offset = 0;
        inst.instanceMatrix.updateRange.count = n * 16;
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) {
          inst.instanceColor.updateRange.offset = 0;
          inst.instanceColor.updateRange.count = n * 3;
          inst.instanceColor.needsUpdate = true;
        }
      }
    },

    // ---- characters' contact shadows (every frame) ----------------------------
    updateCharacterAO() {
      const ao = this.charAO;
      if (!ao) return;
      const cap = ao.instanceMatrix.count;
      const MA = ao.instanceMatrix.array, CA = ao.instanceColor.array;
      const p0 = this.player.pos;
      let n = 0;
      const put = (x, y, z, r, str) => {
        if (n >= cap) return;
        const air = Math.max(0, y || 0);
        const k = 1 / (1 + air * 0.9);                       // fade + shrink while airborne
        const rr = r * (0.75 + 0.25 * k);
        const o = n * 16;
        MA[o] = rr; MA[o + 1] = 0; MA[o + 2] = 0; MA[o + 3] = 0;
        MA[o + 4] = 0; MA[o + 5] = 1; MA[o + 6] = 0; MA[o + 7] = 0;
        MA[o + 8] = 0; MA[o + 9] = 0; MA[o + 10] = rr; MA[o + 11] = 0;
        MA[o + 12] = x; MA[o + 13] = 0; MA[o + 14] = z; MA[o + 15] = 1;
        CA[n * 3] = str * k; CA[n * 3 + 1] = 0; CA[n * 3 + 2] = 0;
        n++;
      };
      const near = (e, d) => { const dx = e.pos.x - p0.x, dz = e.pos.z - p0.z; return dx * dx + dz * dz < d * d; };
      put(p0.x, p0.y, p0.z, 0.85, 1.0);
      for (let i = 0; i < this.aiAllies.length; i++) { const a = this.aiAllies[i]; if (a.pos && near(a, 60)) put(a.pos.x, a.pos.y, a.pos.z, 0.85, 1.0); }
      if (this.remotePeers) this.remotePeers.forEach((pp) => { if (pp.pos && pp.meshRoot && pp.meshRoot.visible && near(pp, 60)) put(pp.pos.x, pp.pos.y, pp.pos.z, 0.85, 1.0); });
      const ms = this.monsters;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        if (!m.meshRoot || !m.meshRoot.visible || !near(m, 55)) continue;
        const h = m.desiredHeight || 1.8;
        const r = Math.min(5.5, Math.max(0.55, h * 0.36 * (m.isBoss ? 1.15 : 1)));
        const str = m.dead ? Math.max(0, 1 + (m.deathTimer || 0)) * 0.8 : 0.9;
        if (str > 0.02) put(m.pos.x, m.hover || 0, m.pos.z, r, str);
      }
      if (this.townNPCs) {
        for (let i = 0; i < this.townNPCs.length; i++) {
          const npc = this.townNPCs[i];
          if (npc.meshRoot && npc.meshRoot.visible && near(npc, 45)) put(npc.pos.x, 0, npc.pos.z, 0.85, 0.9);
        }
      }
      ao.count = n;
      ao.instanceMatrix.updateRange.offset = 0;
      ao.instanceMatrix.updateRange.count = n * 16;
      ao.instanceMatrix.needsUpdate = true;
      ao.instanceColor.updateRange.offset = 0;
      ao.instanceColor.updateRange.count = n * 3;
      ao.instanceColor.needsUpdate = true;
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      this.updateCharacterAO();
    }
  });
})();
