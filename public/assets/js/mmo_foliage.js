// =============================================================================
// CHRONO-RIFT STYLIZED FOLIAGE (Three.js r128, zero external assets)
// 1. Wind grass: one InstancedMesh of 3-blade tufts (18k desktop = 54k blades)
//    wrapped around the camera in the vertex shader — no CPU rebuilds, one draw
//    call, no shadow casting. Grows only on flat grassy terrain, sways in gusts,
//    shrinks away 55-70 m from the camera and matches the ground colour at its base.
// 2. Procedural broadleaf trees: seeded, twisted tapered trunks + clustered,
//    noise-displaced icosahedron canopies with "blob" normals, rendered with a
//    cel-shaded MeshToonMaterial (warm sunlit tops, teal undersides, rim, wind).
// 3. Glowing wildflower petals (brighter at night).
// Placement/collision of trees, flower clusters and rocks lives in world_core.js
// (uses the shared getTerrainHeight for slopes); this file only builds visuals.
// =============================================================================
(function () {
  'use strict';
  const CW = window.ChronoWorld;
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const LOW = isTouch || new URLSearchParams(location.search).get('fx') === 'low';

  // ---------------------------------------------------------------------------
  // Procedural tree generator
  // ---------------------------------------------------------------------------
  function hash3(x, y, z) {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return s - Math.floor(s);
  }

  // Tapered tube along a CatmullRom spline; rFn(t, angle) gives the radius.
  function addTube(out, curve, tubular, radial, rFn, colFn) {
    const tube = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
    const tp = tube.attributes.position, tn = tube.attributes.normal, idx = tube.index.array;
    const center = new THREE.Vector3(), v = new THREE.Vector3(), nv = new THREE.Vector3();
    const verts = [];
    for (let k = 0; k < tp.count; k++) {
      const i = Math.floor(k / (radial + 1)), j = k % (radial + 1);
      const t = i / tubular, ang = (j / radial) * Math.PI * 2;
      curve.getPointAt(t, center);
      v.fromBufferAttribute(tp, k).sub(center).multiplyScalar(rFn(t, ang)).add(center);
      nv.fromBufferAttribute(tn, k);
      verts.push({ p: v.clone(), n: nv.clone(), c: colFn(t) });
    }
    for (let q = 0; q < idx.length; q++) {
      const V = verts[idx[q]];
      out.push(V.p, V.n, V.c, 0, 0, -1, -1);
    }
    tube.dispose();
  }

  function buildTreeGeometry(seed) {
    const rng = CW.mulberry32(seed >>> 0);
    const P = [], N = [], C = [], F = [], H = [], UV = [];
    const out = { push(p, n, c, f, h, u, w) { P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); C.push(c[0], c[1], c[2]); F.push(f); H.push(h); UV.push(u, w); } };
    // ---- trunk: tapered spline tube with flared roots + bark grooves ----
    const H0 = 2.5 + rng() * 1.0;
    const lx = (rng() - 0.5) * 0.7, lz = (rng() - 0.5) * 0.7;
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      pts.push(new THREE.Vector3(lx * t * t + Math.sin(t * 3.1 + seed) * 0.12 * t, t * H0, lz * t * t + Math.cos(t * 2.7 + seed) * 0.12 * t));
    }
    const trunk = new THREE.CatmullRomCurve3(pts);
    const ph = rng() * 6.28;
    addTube(out, trunk, 12, 10, (t, a) => {
      let r = 0.3 * (1 - 0.52 * t);
      if (t < 0.2) r *= 1 + 0.95 * Math.pow(1 - t / 0.2, 2) * (0.62 + 0.38 * Math.cos(a * 5 + ph));   // roots
      return r * (1 + 0.075 * Math.sin(a * 9 + t * 5.5 + ph));                                         // bark grooves
    }, (t) => { const s = 0.72 + 0.28 * t; return [0.40 * s, 0.27 * s, 0.17 * s]; });
    // ---- branches + leaf clusters ----
    const top = trunk.getPointAt(1);
    const CC = top.clone().add(new THREE.Vector3(0, 0.7, 0));      // canopy centre
    const clusters = [{ c: top.clone().add(new THREE.Vector3(0, 0.9, 0)), r: 1.25 + rng() * 0.25 }];
    const nb = 4 + Math.floor(rng() * 2);
    for (let b = 0; b < nb; b++) {
      const tb = 0.52 + (b / nb) * 0.4 + rng() * 0.05;
      const S = trunk.getPointAt(tb);
      const a = (b / nb) * Math.PI * 2 + rng() * 0.9;
      const dir = new THREE.Vector3(Math.cos(a), 0.55 + rng() * 0.45, Math.sin(a)).normalize();
      const len = 1.0 + rng() * 0.8;
      const E = S.clone().addScaledVector(dir, len);
      const M = S.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3(0, 0.22, 0));
      const br = new THREE.CatmullRomCurve3([S, M, E]);
      addTube(out, br, 5, 6, (t) => 0.12 * (1 - 0.68 * t), () => [0.38, 0.26, 0.16]);
      clusters.push({ c: E.clone().add(new THREE.Vector3(0, 0.25, 0)), r: 0.85 + rng() * 0.35 });
    }
    // ---- canopy: small solid core + layered outward leaf cards per cluster ----
    const canopyStart = P.length / 3;
    const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3();
    const outward = (p) => tmp.copy(p).sub(CC).normalize();
    const nrmFor = (p, n) => outward(p).multiplyScalar(0.75).addScaledVector(n, 0.25).normalize().clone();
    clusters.forEach((cl) => {
      // core (keeps the crown from looking hollow); flagged uv = -1 -> never cut out
      const core = new THREE.IcosahedronGeometry(cl.r * 0.6, 0);
      const cp = core.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(cp, i).add(cl.c);
        const v = 0.86 + hash3(p.x, p.y, p.z) * 0.1;
        out.push(p, nrmFor(p, outward(p).clone()), [v, v, v], 1, p.y, -1, -1);
      }
      core.dispose();
      // leaf cards
      const M = 13 + Math.floor(rng() * 4);
      for (let k = 0; k < M; k++) {
        const d = new THREE.Vector3(rng() * 2 - 1, rng() * 1.6 - 0.45, rng() * 2 - 1).normalize();
        const cpos = cl.c.clone().addScaledVector(d, cl.r * (0.5 + rng() * 0.45));
        const n = d.clone().lerp(outward(cpos), 0.5).normalize();
        tA.crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
        tB.crossVectors(n, tA).normalize();
        const rot = rng() * 6.28, cr = Math.cos(rot), sr = Math.sin(rot);
        const T1 = tA.clone().multiplyScalar(cr).addScaledVector(tB, sr);
        const T2 = tB.clone().multiplyScalar(cr).addScaledVector(tA, -sr);
        const sz = (0.95 + rng() * 0.6) * 0.5;
        const corner = (u, w) => cpos.clone().addScaledVector(T1, (u - 0.5) * 2 * sz).addScaledVector(T2, (w - 0.5) * 2 * sz);
        const q = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
        const v = 0.9 + rng() * 0.16;
        q.forEach(([u, w]) => { const p = corner(u, w); out.push(p, nrmFor(p, n), [v, v, v], 1, p.y, u, w); });
      }
    });
    // normalise canopy heights 0..1 for the vertical gradient
    let hMin = Infinity, hMax = -Infinity;
    for (let i = canopyStart; i < H.length; i++) { hMin = Math.min(hMin, H[i]); hMax = Math.max(hMax, H[i]); }
    for (let i = canopyStart; i < H.length; i++) H[i] = (H[i] - hMin) / Math.max(0.01, hMax - hMin);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aFoliage', new THREE.Float32BufferAttribute(F, 1));
    g.setAttribute('aCanopyH', new THREE.Float32BufferAttribute(H, 1));
    g.setAttribute('aLeafUv', new THREE.Float32BufferAttribute(UV, 2));
    g.computeBoundingSphere();
    return g;
  }

  function bandMap(a, b, c) {
    const t = new THREE.DataTexture(new Uint8Array([a, a, a, 255, b, b, b, 255, c, c, c, 255]), 3, 1, THREE.RGBAFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }

  // Soft "hand-painted" cel ramp: 3 tones with feathered transitions (linear-filtered)
  function softRamp() {
    const N = 32, data = new Uint8Array(N * 4);
    const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1);
      const v = Math.round(84 + 46 * ss(0.30, 0.46, x) + 42 * ss(0.58, 0.74, x));
      data.set([v, v, v, 255], i * 4);
    }
    const t = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }

  // Procedural leaf-cluster silhouette (7 pointed leaves around a centre) for alpha cut-out
  const LEAF_GLSL = `
    float leafMask(vec2 uv) {
      if (uv.x < -0.5) return 1.0;
      vec2 p = uv - 0.5;
      float m = smoothstep(0.22, 0.19, length(p));
      for (int k = 0; k < 7; k++) {
        float a = float(k) * 0.8976 + 0.35;
        vec2 d = vec2(cos(a), sin(a));
        vec2 q = p - d * 0.23;
        float al = dot(q, d), ac = dot(q, vec2(-d.y, d.x));
        float len = 0.25;
        float wid = 0.15 * (1.0 - clamp(abs(al) / len, 0.0, 1.0) * 0.6) + 0.004;   // broad, soft-tipped leaves
        float e = (al * al) / (len * len) + (ac * ac) / (wid * wid);
        m = max(m, 1.0 - step(1.0, e));
      }
      return m;
    }`;
  const TREE_WIND = `
          #ifdef USE_INSTANCING
            vec3 treeRoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          #else
            vec3 treeRoot = vec3(0.0);
          #endif
          float tPhase = treeRoot.x * 0.21 + treeRoot.z * 0.17;
          float gust = 0.55 + 0.45 * sin(uTime * 0.7 + dot(treeRoot.xz, uWindDir) * 0.02);
          float sway = sin(uTime * 1.5 + tPhase) * 0.05 * gust * max(0.0, position.y - 0.6);
          float rustle = sin(uTime * 4.2 + position.x * 2.3 + position.z * 1.9 + tPhase) * 0.06 * aFoliage;
          transformed.x += uWindDir.x * sway + rustle;
          transformed.z += uWindDir.y * sway + rustle * 0.7;
          transformed.y += rustle * 0.4;`;

  // Foliage: soft cel ramp + vertical canopy gradient + rim + wind; leaf cards cut out at 0.5
  function makeFoliageMaterial(FU) {
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: softRamp(), alphaTest: 0.5, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      if (window.injectTerrain) window.injectTerrain(shader, mat);
      Object.assign(shader.uniforms, FU);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aFoliage;
          attribute float aCanopyH;
          attribute vec2 aLeafUv;
          varying float vCanopyH;
          varying vec2 vLeafUv;
          uniform float uTime;
          uniform vec2 uWindDir;
          varying float vFoliage;
          varying vec3 vFolN;`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          #ifdef USE_INSTANCING
            vFolN = normalize((modelMatrix * instanceMatrix * vec4(objectNormal, 0.0)).xyz);
          #else
            vFolN = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
          #endif`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vFoliage = aFoliage;
          vCanopyH = aCanopyH;
          vLeafUv = aLeafUv;` + TREE_WIND);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uRimColor;
          uniform float uFolAlbedo;
          varying float vFoliage;
          varying float vCanopyH;
          varying vec2 vLeafUv;
          varying vec3 vFolN;` + LEAF_GLSL)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // crisp leaf silhouettes (alphaTest 0.5) on the cards; trunks/cores stay solid
          diffuseColor.a = mix(1.0, leafMask(vLeafUv), step(0.5, vFoliage));
          // vertical canopy gradient: deep teal (bottom) -> rich emerald -> sunlit yellow-green (top)
          float h = vCanopyH;
          vec3 deepTeal = vec3(0.10, 0.40, 0.42);
          vec3 emerald  = vec3(0.20, 0.66, 0.40);
          vec3 sunlit   = vec3(0.66, 0.90, 0.34);
          vec3 grad = mix(deepTeal, emerald, smoothstep(0.0, 0.5, h));
          grad = mix(grad, sunlit, smoothstep(0.55, 1.0, h) * 0.85);
          float upF = smoothstep(-0.5, 0.9, vFolN.y);
          grad *= mix(0.88, 1.04, upF);
          float brush = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
          vec3 tintN = diffuseColor.rgb / max(1e-3, brush);
          vec3 leaf = grad * mix(vec3(1.0), tintN * 1.18, 0.5) * (0.92 + 0.12 * fract(brush * 13.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, leaf, vFoliage) * uFolAlbedo;`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          // leaves use the transferred outward normal on BOTH sides (no dark backfaces)
          if (vFoliage > 0.5) normal = normalize(vNormal);`)
        .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', `
          float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);
          outgoingLight += uRimColor * rimF * 0.28 * vFoliage;
          gl_FragColor = vec4( outgoingLight, diffuseColor.a );`);
    };
    return mat;
  }

  // Shadow-map pass with the same leaf cut-out + wind, so shadows are crisp leaf shapes
  function makeFoliageDepthMaterial(FU) {
    const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      if (window.injectTerrain) window.injectTerrain(shader, mat);
      Object.assign(shader.uniforms, FU);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aFoliage;
          attribute vec2 aLeafUv;
          varying vec2 vLeafUv;
          varying float vFoliage;
          uniform float uTime;
          uniform vec2 uWindDir;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vFoliage = aFoliage;
          vLeafUv = aLeafUv;` + TREE_WIND);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec2 vLeafUv;
          varying float vFoliage;` + LEAF_GLSL)
        .replace('#include <alphatest_fragment>', `diffuseColor.a = mix(1.0, leafMask(vLeafUv), step(0.5, vFoliage));
          #include <alphatest_fragment>`);
    };
    return mat;
  }

  // ---------------------------------------------------------------------------
  // Wind grass
  // ---------------------------------------------------------------------------
  // 6 tapered, curved blades x 3 segments (+ a tiny optional wildflower head)
  function buildTuftGeometry() {
    const rng = CW.mulberry32(77031);
    const pos = [], hgt = [], part = [];
    const idx = [];
    const BLADES = 6;
    let tip0 = null;
    for (let b = 0; b < BLADES; b++) {
      const a = (b / BLADES) * Math.PI * 2 + (rng() - 0.5) * 0.7;
      const r0 = b === 0 ? 0.02 : 0.05 + rng() * 0.08;
      const ox = Math.cos(a) * r0, oz = Math.sin(a) * r0;
      const lx = Math.cos(a), lz = Math.sin(a);
      const px = Math.cos(a + 1.57 + (rng() - 0.5) * 0.6), pz = Math.sin(a + 1.57 + (rng() - 0.5) * 0.6);
      const h = b === 0 ? 1.0 : 0.62 + rng() * 0.38;
      const w = 0.05 + rng() * 0.028;
      const curve = 0.16 + rng() * 0.22;
      const base = pos.length / 3;
      const rows = [[0, 1], [0.34, 0.82], [0.68, 0.52]];
      rows.forEach(([t, ws]) => {
        const cx = ox + lx * curve * t * t * h, cz = oz + lz * curve * t * t * h;
        pos.push(cx - px * w * ws, t * h, cz - pz * w * ws, cx + px * w * ws, t * h, cz + pz * w * ws);
        hgt.push(t, t); part.push(0, 0);
      });
      const tx = ox + lx * curve * h, tz = oz + lz * curve * h;
      pos.push(tx, h, tz); hgt.push(1); part.push(0);
      if (b === 0) tip0 = [tx, h, tz];
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2,
               base + 2, base + 3, base + 4, base + 3, base + 5, base + 4,
               base + 4, base + 5, base + 6);
    }
    // wildflower head: two crossed petal quads on the tallest blade's tip
    const fs = 0.075;
    [[1, 0], [0, 1]].forEach(([ax, az]) => {
      const base = pos.length / 3;
      pos.push(tip0[0] - ax * fs, tip0[1] - fs * 0.4, tip0[2] - az * fs, tip0[0] + ax * fs, tip0[1] - fs * 0.4, tip0[2] + az * fs,
               tip0[0] + ax * fs, tip0[1] + fs * 1.2, tip0[2] + az * fs, tip0[0] - ax * fs, tip0[1] + fs * 1.2, tip0[2] - az * fs);
      for (let k = 0; k < 4; k++) { hgt.push(1); part.push(1); }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(hgt, 1));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
    g.setIndex(idx);
    return g;
  }

  const GRASS_VERT = `
    attribute float aH;
    attribute float aPart;
    attribute vec3 aOffset;           // xz = position inside the tile, y = random
    uniform vec2 uCenter;
    uniform float uTile;
    uniform float uTime;
    uniform vec2 uWindDir;
    uniform vec2 uFade;
    uniform vec3 uCamPos;
    uniform vec3 uPlayerPos;
    uniform sampler2D uCtrlA;
    uniform sampler2D uCtrlB;
    uniform float uWorldHalf;
    uniform vec3 uSunDir;
    uniform vec3 uSunCol;
    uniform vec3 uAmbCol;
    uniform float uAlbedoScale;
    uniform float uWaterLevel;
    varying vec3 vSunPart;
    varying vec3 vAmbPart;
    #include <fog_pars_vertex>
    #include <shadowmap_pars_vertex>
    __TERRAIN__
    float gh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float gn(vec2 p) {
      vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), u.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    void collapse() {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vSunPart = vec3(0.0); vAmbPart = vec3(0.0);
    }
    void main() {
      // deterministic world-space grid: wrap this clump into the tile copy nearest the hero
      vec2 w = aOffset.xz + floor((uCenter - aOffset.xz) / uTile + 0.5) * uTile;
      float rnd = gh(w * 1.37);
      float rnd2 = gh(w.yx * 2.11 + 4.0);
      vec4 ts = terrSample(w);
      float th = uTerrOn > 0.5 ? ts.r : 0.0;
      vec3 tn = normalize(vec3(ts.g, 1.0, ts.b));
      vec4 cRoot = projectionMatrix * viewMatrix * vec4(w.x, th + 0.4, w.y, 1.0);
      if (cRoot.w < 0.05 || abs(cRoot.x) > cRoot.w * 1.2 || cRoot.y < -cRoot.w * 1.35 || cRoot.y > cRoot.w * 1.2) {
        collapse();
        #ifdef USE_FOG
          fogDepth = 0.0;
        #endif
        return;
      }
      vec2 cUv = w / (2.0 * uWorldHalf) + 0.5;
      vec4 ca = texture2D(uCtrlA, cUv);
      vec4 cb = texture2D(uCtrlB, cUv);
      float grassW = cb.r / (cb.r + cb.g + cb.b + cb.a + 0.0001);
      float mask = smoothstep(0.45, 0.75, grassW) * (1.0 - smoothstep(0.22, 0.45, ca.a));
      mask *= smoothstep(0.84, 0.92, tn.y) * (1.0 - smoothstep(14.0, 18.0, th));          // slope + peaks
      mask *= smoothstep(uWaterLevel + 0.3, uWaterLevel + 0.9, th);                       // lakes / beaches
      float dPlaza = length(w - vec2(0.0, 9.5));
      mask *= smoothstep(15.0, 19.0, dPlaza) * smoothstep(5.0, 7.0, abs(w.x)) + step(60.0, length(w));
      mask = clamp(mask, 0.0, 1.0);
      // natural clumping / lushness patches (very few bald spots)
      float patchN = gn(w * 0.055);
      float lush = smoothstep(0.12, 0.85, patchN * 0.8 + gn(w * 0.19) * 0.35);
      mask *= step(0.05, patchN * 0.6 + rnd * 0.5);
      float dist = length(w - uCenter);
      float fade = 1.0 - smoothstep(uFade.x, uFade.y, dist);                              // 45-55 m ring
      float hgt = 0.42 + 0.55 * lush + 0.22 * rnd2;
      float sc = mask * fade;
      if (sc < 0.03) {
        collapse();
        #ifdef USE_FOG
          fogDepth = 0.0;
        #endif
        return;
      }
      float flowerOn = step(0.955, gh(w * 3.7 + 1.3)) * step(0.35, lush);
      if (aPart > 0.5 && flowerOn < 0.5) {
        collapse();
        #ifdef USE_FOG
          fogDepth = 0.0;
        #endif
        return;
      }
      float ang = rnd2 * 6.2831;
      float c = cos(ang), s = sin(ang);
      vec3 p = position;
      p.xz = mat2(c, -s, s, c) * p.xz * (0.85 + rnd * 0.4);
      p.y *= hgt * sc;
      // layered wind: broad gust bands sweeping across the field + finer ripples + flutter
      vec2 wd = uWindDir, wp = vec2(-wd.y, wd.x);
      float band1 = sin(dot(w, wd) * 0.075 - uTime * 1.6 + gn(w * 0.03) * 4.0);
      float band2 = sin(dot(w, wd) * 0.21 - uTime * 2.7 + dot(w, wp) * 0.05);
      float gust = clamp(band1 * 0.6 + band2 * 0.3 + 0.35, 0.0, 1.0);
      gust = gust * gust * (3.0 - 2.0 * gust);
      float flutter = sin(uTime * 5.2 + rnd * 40.0 + aH * 2.0) * 0.04;
      float bendAmt = (0.12 + 0.75 * gust) * aH * aH * hgt;
      p.xz += wd * bendAmt + vec2(flutter, flutter * 0.7) * aH;
      p.y -= bendAmt * 0.3;
      // blades part around the hero's feet
      vec2 dp = (w + p.xz) - uPlayerPos.xz;
      float dl = length(dp);
      float push = 1.0 - smoothstep(0.35, 1.7, dl);
      p.xz += (dp / (dl + 0.001)) * push * 0.55 * aH * aH * hgt;
      p.y -= push * 0.32 * aH * hgt;
      vec3 world = vec3(w.x + p.x, th + p.y, w.y + p.z);
      vec4 mvPosition = viewMatrix * vec4(world, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        vDirectionalShadowCoord[ 0 ] = directionalShadowMatrix[ 0 ] * vec4(world + tn * 0.06, 1.0);
      #endif
      // colour: rich emerald base -> sun-kissed lime tips, dry golden-green patches, zone tint
      float n2 = gn(w * 0.37 + 7.1);
      vec3 emerald = vec3(0.12, 0.44, 0.17), rich = vec3(0.21, 0.58, 0.21);
      vec3 lime = vec3(0.60, 0.85, 0.27), dry = vec3(0.58, 0.55, 0.25);
      float dryK = smoothstep(0.58, 0.8, gn(w * 0.017 + 9.0)) * 0.75;
      vec3 baseC = mix(emerald, rich, clamp(lush * 0.6 + n2 * 0.35, 0.0, 1.0));
      baseC = mix(baseC, dry * 0.85, dryK * 0.6);
      baseC *= mix(vec3(1.0), ca.rgb * 1.6, 0.85);
      vec3 tipC = mix(lime, dry * 1.15, dryK) * mix(vec3(1.0), ca.rgb * 1.6, 0.6);
      vec3 albedo = mix(baseC * 0.78, tipC, smoothstep(0.12, 1.0, aH)) * uAlbedoScale * 1.1;
      albedo += vec3(0.05, 0.06, 0.02) * gust * aH;                                        // wind sheen
      if (aPart > 0.5) {
        float fc = gh(w * 9.1);
        vec3 fcol = fc < 0.3 ? vec3(1.0, 0.55, 0.75) : (fc < 0.55 ? vec3(1.0, 0.85, 0.3) : (fc < 0.8 ? vec3(0.96, 0.96, 1.0) : vec3(0.55, 0.7, 1.0)));
        albedo = fcol * 0.5;
      }
      // normals bent upward: blends with the terrain lighting, no harsh dark backfaces
      vec3 nrm = normalize(tn + vec3(0.0, 0.7, 0.0));
      float ndl = dot(nrm, uSunDir) * 0.5 + 0.5;
      float band = mix(0.3, 0.62, smoothstep(0.38, 0.62, ndl));
      vSunPart = albedo * uSunCol * band * (0.9 + 0.18 * aH);
      vec3 toCam = normalize(uCamPos - world);
      float backlit = pow(clamp(dot(-toCam, uSunDir), 0.0, 1.0), 3.0) * smoothstep(0.0, 0.25, uSunDir.y + 0.05);
      vAmbPart = albedo * uAmbCol + tipC * uAlbedoScale * uSunCol * backlit * aH * aH * 0.45;
    }`;

  const GRASS_FRAG = `
    varying vec3 vSunPart;
    varying vec3 vAmbPart;
    #include <common>
    #include <packing>
    #include <fog_pars_fragment>
    #include <shadowmap_pars_fragment>
    void main() {
      float sh = 1.0;
      #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        DirectionalLightShadow ds = directionalLightShadows[ 0 ];
        sh = getShadow( directionalShadowMap[ 0 ], ds.shadowMapSize, ds.shadowBias, ds.shadowRadius, vDirectionalShadowCoord[ 0 ] );
      #endif
      gl_FragColor = vec4(vSunPart * mix(0.42, 1.0, sh) + vAmbPart, 1.0);
      #include <tonemapping_fragment>
      #include <fog_fragment>
    }`;

  // ---------------------------------------------------------------------------
  // Game integration
  // ---------------------------------------------------------------------------
  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld };

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      this.initFoliage();
    },

    initFoliage() {
      const G = this.groundUniforms;
      this.foliageU = {
        uTime: { value: 0 },
        uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
        uRimColor: G.uRimColor || { value: new THREE.Color(0xffd9a8) },
        uFolAlbedo: { value: 0.55 }
      };
      this.buildProceduralTrees();
      this.enhanceWildflowers();
      this.buildGrass();
    },

    buildProceduralTrees() {
      if (!this.propInst || !this.propInst.oak) return;
      const mat = makeFoliageMaterial(this.foliageU);
      const depthMat = makeFoliageDepthMaterial(this.foliageU);
      const old = this.propInst.oak;
      this.treeVariants = [];
      const VARIANTS = 4;
      for (let v = 0; v < VARIANTS; v++) {
        const key = 'tree' + v;
        const geo = buildTreeGeometry(9001 + v * 7919);
        const inst = new THREE.InstancedMesh(geo, mat, 1800);
        inst.setColorAt(0, new THREE.Color(1, 1, 1));
        inst.count = 0;
        inst.frustumCulled = false;
        inst.castShadow = true;
        inst.receiveShadow = false;
        inst.customDepthMaterial = depthMat;      // leaf-shaped shadows
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(inst);
        this.propInst[key] = inst;
        this.treeVariants.push(key);
      }
      // the generic oak mesh is no longer drawn
      this.scene.remove(old);
      delete this.propInst.oak;
      this._propChunkKey = '';
    },

    // Petals glow (stronger at night); stems stay matte
    enhanceWildflowers() {
      const inst = this.propInst && this.propInst.flower;
      if (!inst) return;
      const FU = this.foliageU;
      FU.uFlowerGlow = FU.uFlowerGlow || { value: 0.6 };
      const mat = inst.material;
      const prev = mat.onBeforeCompile;
      mat.onBeforeCompile = (shader, r) => {
        if (prev) prev.call(mat, shader, r);
        shader.uniforms.uFlowerGlow = FU.uFlowerGlow;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uFlowerGlow;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float petal = smoothstep(0.62, 0.9, max(vColor.r, max(vColor.g, vColor.b)));
            totalEmissiveRadiance += vColor * petal * uFlowerGlow;`);
      };
      mat.needsUpdate = true;
    },

    buildGrass() {
      // dense meadow: clumps live in a deterministic world grid within ~55 m of the hero
      const COUNT = LOW ? 14000 : 40000;
      const TILE = LOW ? 90 : 110;
      const geo = buildTuftGeometry();
      const off = new Float32Array(COUNT * 3);
      const rng = CW.mulberry32(424242);
      // jittered grid -> even coverage
      const side = Math.ceil(Math.sqrt(COUNT));
      const cell = TILE / side;
      for (let i = 0; i < COUNT; i++) {
        const gx = i % side, gz = Math.floor(i / side);
        off[i * 3] = (gx + rng()) * cell;
        off[i * 3 + 1] = rng();
        off[i * 3 + 2] = (gz + rng()) * cell;
      }
      geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
      geo.instanceCount = COUNT;
      const G = this.groundUniforms;
      const TU = window.TERRAIN_UNIFORMS || {};
      this.grassU = Object.assign({}, THREE.UniformsLib.lights, THREE.UniformsLib.fog, {
        uCenter: { value: new THREE.Vector2() },
        uTile: { value: TILE },
        uTime: this.foliageU.uTime,
        uWindDir: this.foliageU.uWindDir,
        uFade: { value: new THREE.Vector2(LOW ? 36 : 45, LOW ? 45 : 55) },
        uCamPos: { value: new THREE.Vector3() },
        uPlayerPos: { value: new THREE.Vector3() },
        uCtrlA: G.uCtrlA, uCtrlB: G.uCtrlB, uWorldHalf: G.uWorldHalf,
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color(1, 1, 1) },
        uAmbCol: { value: new THREE.Color(0.5, 0.6, 0.7) },
        uAlbedoScale: G.uAlbedoScale || { value: 0.5 },
        uWaterLevel: { value: window.MMO.WORLD.waterLevel !== undefined ? window.MMO.WORLD.waterLevel : -2.0 }
      }, TU);
      const mat = new THREE.ShaderMaterial({
        uniforms: this.grassU,
        vertexShader: GRASS_VERT.replace('__TERRAIN__', window.TERRAIN_GLSL || 'uniform float uTerrOn; vec4 terrSample(vec2 p){ return vec4(0.0, 0.0, 0.0, 1.0); }'),
        fragmentShader: GRASS_FRAG,
        side: THREE.DoubleSide,
        fog: true,
        lights: true                // gives the shader the sun's shadow map (receiveShadow)
      });
      mat.userData.noTerrain = true; // positions are already terrain-relative
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.castShadow = false;      // grass never casts into the shadow map...
      mesh.receiveShadow = true;    // ...but does receive the trees'/heroes' shadows
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      this.grassMesh = mesh;
      this.grassCount = COUNT;
    },

    updateFoliage(dt) {
      if (!this.foliageU) return;
      const t = this.clock.getElapsedTime();
      this.foliageU.uTime.value = t;
      if (this.grassU) {
        this.grassU.uCenter.value.set(this.player.pos.x, this.player.pos.z);
        this.grassU.uCamPos.value.copy(this.camera.position);
        this.grassU.uPlayerPos.value.copy(this.player.pos);
        const sl = this.sunLight;
        const d = this.grassU.uSunDir.value.copy(sl.position).sub(sl.target.position).normalize();
        if (!isFinite(d.x)) d.set(0, 1, 0);
        this.grassU.uSunCol.value.copy(sl.color).multiplyScalar(sl.intensity);
        this.grassU.uAmbCol.value.copy(this.hemiLight.color).multiplyScalar(this.hemiLight.intensity * 0.85);
      }
      if (this.foliageU.uFlowerGlow && this.skyUniforms && this.skyUniforms.uNight) {
        this.foliageU.uFlowerGlow.value = 0.55 + this.skyUniforms.uNight.value * 1.6;
      }
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      this.updateFoliage(dt);
    }
  });
})();
