/* =============================================================================
 * Chrono-Rift — hand-made environment models (Sketchfab, CC BY 4.0)
 *
 *  Replaces procedural props with stylized, textured models while keeping the
 *  existing pipeline: world_core still decides WHERE every prop goes (and its
 *  collision circle), mmo_grounding still streams / frustum-culls the instance
 *  blocks. Each model variant is simply another instanced prop type, chosen
 *  per prop through this.propKeyFor(p) (seeded by the prop's own c value, so
 *  every client sees the same variant at the same spot).
 *
 *    broadleaf trees  -> "Stylized Low Poly Fantasy Oak Tree" (Specter_1)
 *    pines            -> 5 pines from "Free Pack - Tree" (polyone)
 *    rocks / boulders -> "Free Pack - Rocks Stylized" (polyone)
 *    bushes (new)     -> "Stylized Bush" (danielpetrov), placed by world_core
 *
 *  Each variant is fitted to the size of the procedural shape it replaces, so
 *  footprints and collisions still match. Trees and bushes sway in the wind
 *  (vertex shader, height-weighted, per-instance phase and gusts); the zone
 *  colour tint is softened so the painted textures keep their look.
 *  Credits: public/assets/models/env/CREDITS.txt
 * ============================================================================= */
(function () {
  'use strict';
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const SET = {
    oak: { file: 'oak.glb', fitFrom: 'tree0', fit: 'height', nodes: null, sway: 0.0042, tint: 0.35, shadow: true, cap: 1800, sizeMul: 1.08, simplify: 0.5 },
    pine: { file: 'pines.glb', fitFrom: 'pine', fit: 'height', nodes: ['SM_FreeTree_05', 'SM_FreeTree_08', 'SM_FreeTree_06', 'SM_FreeTree_02', 'SM_FreeTree_07'], sway: 0.0035, tint: 0.3, shadow: true, cap: 900, sizeMul: 1.12 },
    rock: { file: 'rocks.glb', fitFrom: 'rock', fit: 'blend', nodes: ['SM_Rocks_01', 'SM_Rocks_02', 'SM_Rocks_04', 'SM_Rocks_06', 'SM_Rocks_07'], sway: 0, tint: 0.55, shadow: false, cap: 1200, sizeMul: 1.0 },
    boulder: { file: 'rocks.glb', fitFrom: 'boulder', fit: 'blend', nodes: ['SM_Rocks_03', 'SM_Rocks_05', 'SM_Rocks_04'], sway: 0, tint: 0.55, shadow: true, cap: 900, sizeMul: 1.0 },
    bush: { file: 'bush.glb', fitFrom: null, size: { h: 1.15 }, fit: 'height', nodes: null, sway: 0.03, tint: 0.3, shadow: false, cap: isTouch ? 1200 : 2200, sizeMul: 1.0 }
  };

  // Vertex-clustering simplification: snap vertices to a grid, merge each cell into one
  // representative vertex (keeps its uv / normal), drop collapsed triangles. Grows the
  // cell until the triangle count is at or below `ratio` of the original.
  function simplifyGeometry(geo, ratio) {
    const g0 = geo.index ? geo.toNonIndexed() : geo;
    const pos = g0.attributes.position, n = pos.count, triIn = n / 3;
    g0.computeBoundingBox();
    const sz = new THREE.Vector3(); g0.boundingBox.getSize(sz);
    const diag = sz.length();
    let cell = diag * 0.004, best = null;
    for (let iter = 0; iter < 14; iter++) {
      const map = new Map(), rep = [], idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) {
        const k = Math.round(pos.getX(i) / cell) + ',' + Math.round(pos.getY(i) / cell) + ',' + Math.round(pos.getZ(i) / cell);
        let r = map.get(k);
        if (r === undefined) { r = rep.length; rep.push(i); map.set(k, r); }
        idx[i] = r;
      }
      const tris = [];
      for (let t = 0; t < n; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        if (a !== b && b !== c && a !== c) tris.push(a, b, c);
      }
      best = { rep, tris };
      if (tris.length / 3 <= triIn * ratio) break;
      cell *= 1.35;
    }
    const out = new THREE.BufferGeometry();
    Object.keys(g0.attributes).forEach((name) => {
      const src = g0.attributes[name], isz = src.itemSize;
      const arr = new Float32Array(best.rep.length * isz);
      best.rep.forEach((vi, j) => { for (let c = 0; c < isz; c++) arr[j * isz + c] = src.array[vi * isz + c]; });
      out.setAttribute(name, new THREE.BufferAttribute(arr, isz));
    });
    out.setIndex(best.tris);
    if (!out.attributes.normal) out.computeVertexNormals();   // keep the authored (faceted) normals
    return out;
  }

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld };
  const U = { uWindT: { value: 0 } };

  function makeMaterial(src, cfg, key) {
    const mat = new THREE.MeshStandardMaterial({
      map: src.map || null, color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
      roughness: 0.88, metalness: 0, side: src.side || THREE.FrontSide,
      alphaTest: src.alphaTest || (src.transparent ? 0.5 : 0), transparent: false
    });
    if (mat.map) { mat.map.anisotropy = 4; mat.map.needsUpdate = true; }
    const tintMix = { value: cfg.tint }, sway = { value: cfg.sway };
    mat.onBeforeCompile = (shader) => {
      if (window.injectTerrain) window.injectTerrain(shader, mat);
      shader.uniforms.uWindT = U.uWindT; shader.uniforms.uTintMix = tintMix; shader.uniforms.uSway = sway;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWindT; uniform float uTintMix; uniform float uSway;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float envPh = instanceMatrix[3][0] * 0.21 + instanceMatrix[3][2] * 0.17;
          #else
            float envPh = 0.0;
          #endif
          float envH = max(transformed.y, 0.0);
          float envBend = uSway * envH * envH;
          float envGust = 0.55 + 0.45 * sin(uWindT * 0.33 + envPh * 0.25);
          transformed.x += sin(uWindT * 1.35 + envPh) * envBend * envGust;
          transformed.z += cos(uWindT * 1.05 + envPh * 1.3) * envBend * 0.6 * envGust;`)
        .replace('#include <color_vertex>', `#include <color_vertex>
          #ifdef USE_INSTANCING_COLOR
            vColor.xyz = mix(vec3(1.0), vColor.xyz, uTintMix);
          #endif`);
    };
    mat.customProgramCacheKey = () => 'envmodel-' + key;
    return mat;
  }

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initEnvModels(); } catch (e) { console.warn('[EnvModels] init failed', e); }
    },

    propKeyFor(p) {
      const v = this.propVariants && this.propVariants[p.t];
      if (v) return v[Math.min(v.length - 1, Math.floor(p.c * v.length))];
      if (p.t === 'oak' && this.treeVariants) return this.treeVariants[Math.min(this.treeVariants.length - 1, Math.floor(p.c * this.treeVariants.length))];
      return p.t;
    },

    initEnvModels() {
      if (this._envm || !this.propInst || new URLSearchParams(location.search).get('envmodels') === 'off') return;
      this._envm = { loaded: 0 };
      this.propVariants = this.propVariants || {};
      const src = (document.querySelector('script[src*="mmo_envmodels.js"]') || document.querySelector('script[src*="game.bundle.js"]') || {}).src || '';
      const base = (src ? src.replace(/js\/[^/]+$/, '') : 'assets/') + 'models/env/';
      const loader = this.loader || new THREE.GLTFLoader();
      const files = {};
      Object.keys(SET).forEach((t) => { if (SET[t].desktopOnly && isTouch) return; (files[SET[t].file] = files[SET[t].file] || []).push(t); });
      this._startDeferredEnvModels = () => {
        if (this._envmStarted) return;
        this._envmStarted = true;
        Object.keys(files).forEach((file) => {
          loader.load(base + file, (gltf) => {
            files[file].forEach((t) => { try { this.installEnvType(t, gltf); } catch (e) { console.warn('[EnvModels]', t, e); } });
          }, undefined, (e) => console.warn('[EnvModels] failed to load', file, e));
        });
      };
      if (isTouch && window.CR_FIRST_RUN) {
        setTimeout(() => this._startDeferredEnvModels && this._startDeferredEnvModels(), 3000);
      } else {
        this._startDeferredEnvModels();
      }
    },

    // size of the procedural shape a model replaces (so footprints / collisions keep matching)
    envFitTarget(cfg) {
      if (cfg.size) return { h: cfg.size.h, r: cfg.size.h * 0.6 };
      const inst = this.propInst[cfg.fitFrom];
      if (!inst) return null;
      const g = inst.geometry; g.computeBoundingBox();
      const b = g.boundingBox;
      return { h: b.max.y - Math.max(0, b.min.y), r: Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2 };
    },

    installEnvType(t, gltf) {
      const cfg = SET[t];
      const target = this.envFitTarget(cfg);
      if (!target) return;
      gltf.scene.updateMatrixWorld(true);
      const meshes = [];
      gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
      const picked = cfg.nodes ? cfg.nodes.map(n => meshes.find(m => m.name.indexOf(n) === 0)).filter(Boolean) : [meshes.reduce((a, b) => (b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a))];
      if (!picked.length) return;
      const keys = [];
      picked.forEach((m, vi) => {
        let geo = m.geometry.clone();
        geo.applyMatrix4(m.matrixWorld);
        if (cfg.simplify) geo = simplifyGeometry(geo, cfg.simplify);
        geo.computeBoundingBox();
        const b = geo.boundingBox;
        geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
        const h = b.max.y - b.min.y, r = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
        let k = target.h / Math.max(h, 1e-4);
        if (cfg.fit === 'blend') k = 0.5 * k + 0.5 * (target.r / Math.max(r, 1e-4));
        k *= cfg.sizeMul;
        geo.scale(k, k, k);
        geo.computeBoundingSphere();
        if (!geo.attributes.normal) geo.computeVertexNormals();
        const key = 'env_' + t + vi;
        const mat = makeMaterial(m.material, cfg, key);
        const inst = new THREE.InstancedMesh(geo, mat, cfg.cap);
        inst.setColorAt(0, new THREE.Color(1, 1, 1));
        inst.count = 0;
        inst.frustumCulled = false;
        inst.userData.envShadow = !!cfg.shadow;
        inst.castShadow = !!(cfg.shadow && (this.gfxQuality ? this.gfxQuality !== 'low' : true));
        inst.receiveShadow = false;
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(inst);
        this.propInst[key] = inst;
        keys.push(key);
      });
      // retire the procedural meshes this type used to draw with
      const retire = (k) => { const old = this.propInst[k]; if (!old) return; this.scene.remove(old); delete this.propInst[k]; };   // geometry may be shared by town decor
      if (t === 'oak') { (this.treeVariants || []).forEach(retire); this.treeVariants = null; }
      else retire(t);
      this.propVariants[t] = keys;
      this._envm.loaded++;
      this._propChunkKey = '';           // rebuild the culling blocks with the new types
      if (this.updatePropStreaming) this.updatePropStreaming(true);
      const want = Object.keys(SET).filter(k => !(SET[k].desktopOnly && isTouch)).length;
      if (this._envm.loaded >= want) { try { this.rebuildTownDecor(); } catch (e) { console.warn('[EnvModels] town decor', e); } }
    },

    // The decorative ring around Ashenvale Bastion used the old procedural trees on a fixed
    // circle that ran into the houses. Re-plant it with the new models, seeded (same for every
    // player), clear of every building, road and path, with collision for trees and rocks.
    rebuildTownDecor() {
      if (this._townDecorDone || !this.propVariants) return;
      this._townDecorDone = true;
      ['townPines', 'townAutumn', 'townRockInst'].forEach((k) => { const m = this[k]; if (m) { this.scene.remove(m); this[k] = null; } });
      let seed = 0x5eed1234;
      const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      const buildings = (this.worldObstacles || []).filter(o => Math.hypot(o.x, o.z) < 60 && o.r >= 0.7);
      const wg = this.worldGen;
      const clearOf = (x, z, pad) => {
        if (Math.abs(x) < 8 + pad) return false;                       // north & south paths
        if (Math.abs(z - 9.5) < 6.5 + pad) return false;               // east-west road
        if (wg && wg.roadDist && wg.roadDist(x, z) < 8 + pad) return false;
        for (let i = 0; i < buildings.length; i++) { const o = buildings[i]; if (Math.hypot(x - o.x, z - o.z) < o.r + 4.5 + pad) return false; }
        return true;
      };
      const placed = [];
      const spaced = (x, z, d) => placed.every(q => Math.hypot(q.x - x, q.z - z) >= d);
      const V = this.propVariants;
      const oaks = V.oak || [], pines = V.pine || [], rocks = V.rock || [], bushes = V.bush || [];
      const groups = {};
      const put = (key, x, z, s, r) => { if (!key || !this.propInst[key]) return; (groups[key] = groups[key] || []).push({ x, z, s, r }); };
      // trees: a loose grove ring 28-48 m out
      for (let k = 0; k < 220 && placed.filter(q => q.tree).length < 30; k++) {
        const a = rnd() * Math.PI * 2, rr = 28 + rnd() * 20;
        const x = Math.cos(a) * rr, z = 9 + Math.sin(a) * rr;
        if (!clearOf(x, z, 1.5) || !spaced(x, z, 6.5)) continue;
        const useOak = oaks.length && rnd() < 0.55;
        const list = useOak ? oaks : pines; if (!list.length) continue;
        const s = useOak ? 0.9 + rnd() * 0.35 : 0.95 + rnd() * 0.35;
        put(list[Math.floor(rnd() * list.length)], x, z, s, rnd() * 6.28);
        placed.push({ x, z, tree: true, s });
        if (this.worldObstacles) this.worldObstacles.push({ x, z, r: 0.55 * s });
        // undergrowth around the trunk
        const nb = bushes.length ? Math.floor(rnd() * 3) : 0;
        for (let b = 0; b < nb; b++) {
          const ba = rnd() * 6.28, br = 2.4 + rnd() * 1.6;
          const bx = x + Math.cos(ba) * br, bz = z + Math.sin(ba) * br;
          if (clearOf(bx, bz, 0)) put(bushes[0], bx, bz, 0.75 + rnd() * 0.5, rnd() * 6.28);
        }
      }
      // rocks: small groups between the trees
      for (let k = 0; k < 160 && placed.filter(q => q.rock).length < 14; k++) {
        const a = rnd() * Math.PI * 2, rr = 26 + rnd() * 24;
        const x = Math.cos(a) * rr, z = 9 + Math.sin(a) * rr;
        if (!clearOf(x, z, 0.5) || !spaced(x, z, 3.2) || !rocks.length) continue;
        const s = 0.55 + rnd() * 0.5;
        put(rocks[Math.floor(rnd() * rocks.length)], x, z, s, rnd() * 6.28);
        placed.push({ x, z, rock: true });
        if (this.worldObstacles) this.worldObstacles.push({ x, z, r: 0.6 * s });
      }
      const d = new THREE.Object3D(), white = new THREE.Color(1, 1, 1);
      this.townDecor = Object.keys(groups).map((key) => {
        const src = this.propInst[key], list = groups[key];
        const inst = new THREE.InstancedMesh(src.geometry, src.material, list.length);
        list.forEach((q, i) => {
          d.position.set(q.x, 0, q.z); d.rotation.set(0, q.r, 0); d.scale.setScalar(q.s); d.updateMatrix();
          inst.setMatrixAt(i, d.matrix); inst.setColorAt(i, white);
        });
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        inst.userData.envShadow = !!(src.userData && src.userData.envShadow);
        inst.castShadow = src.castShadow; inst.receiveShadow = false;
        this.scene.add(inst);
        return inst;
      });
    },

    applyEnvShadowQuality(level) {
      const on = level !== 'low';
      if (this.propInst) {
        Object.values(this.propInst).forEach((inst) => {
          if (inst && inst.userData && inst.userData.envShadow) inst.castShadow = on;
        });
      }
      if (this.townDecor) {
        this.townDecor.forEach((inst) => {
          if (inst && inst.userData && inst.userData.envShadow) inst.castShadow = on;
        });
      }
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      U.uWindT.value += dt;
    }
  });
})();
