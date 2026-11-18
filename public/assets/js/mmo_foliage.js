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

  function buildTreeGeometry(seed) {
    const rng = CW.mulberry32(seed >>> 0);
    const pos = [], nrm = [], col = [], fol = [];
    const trunkH = 2.3 + rng() * 1.1;
    const twist = 0.5 + rng() * 0.8;
    const leanX = (rng() - 0.5) * 0.5, leanZ = (rng() - 0.5) * 0.5;
    const bend = (t) => [leanX * t * t * trunkH * 0.35, leanZ * t * t * trunkH * 0.35];
    // ---- twisted, tapered trunk with a flared base ----
    const trunk = new THREE.CylinderGeometry(0.17, 0.36, trunkH, 7, 6, true).toNonIndexed();
    trunk.translate(0, trunkH / 2, 0);
    const tp = trunk.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      let x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i);
      const t = y / trunkH;
      const flare = 1 + Math.pow(1 - t, 3) * 0.45;
      x *= flare; z *= flare;
      const a = twist * t;
      const ca = Math.cos(a), sa = Math.sin(a);
      const rx = x * ca - z * sa, rz = x * sa + z * ca;
      const b = bend(t);
      tp.setXYZ(i, rx + b[0], y, rz + b[1]);
    }
    trunk.computeVertexNormals();
    const tn = trunk.attributes.normal;
    for (let i = 0; i < tp.count; i++) {
      pos.push(tp.getX(i), tp.getY(i), tp.getZ(i));
      nrm.push(tn.getX(i), tn.getY(i), tn.getZ(i));
      const shade = 0.75 + 0.25 * (tp.getY(i) / trunkH);
      col.push(0.42 * shade, 0.28 * shade, 0.17 * shade);
      fol.push(0);
    }
    // ---- clustered, displaced icosahedron canopy ----
    const top = bend(1);
    const C = [top[0], trunkH + 0.9, top[1]];
    const clusters = 5 + Math.floor(rng() * 3);
    for (let k = 0; k < clusters; k++) {
      const r = (k === 0 ? 1.45 : 0.95 + rng() * 0.55);
      const a = rng() * Math.PI * 2;
      const up = k === 0 ? 0.25 : rng() * 0.9 - 0.15;
      const spread = k === 0 ? 0 : 0.9 + rng() * 0.6;
      const cc = [C[0] + Math.cos(a) * spread, C[1] + up * 1.2, C[2] + Math.sin(a) * spread];
      const ico = new THREE.IcosahedronGeometry(r, 1);
      const ip = ico.attributes.position;
      for (let i = 0; i < ip.count; i++) {
        let x = ip.getX(i), y = ip.getY(i), z = ip.getZ(i);
        // deterministic displacement keyed on the vertex position (no cracks)
        const d = 1 + (hash3(x * 3.1 + seed, y * 3.1, z * 3.1) - 0.5) * 0.32;
        x *= d; y *= d * 0.88; z *= d;
        const wx = cc[0] + x, wy = cc[1] + y, wz = cc[2] + z;
        pos.push(wx, wy, wz);
        // blob normals: blend the cluster normal with the whole canopy's normal
        const n1 = [x, y, z], n2 = [wx - C[0], wy - C[1] + 0.4, wz - C[2]];
        const l1 = Math.hypot(...n1) || 1, l2 = Math.hypot(...n2) || 1;
        const nx = n1[0] / l1 * 0.4 + n2[0] / l2 * 0.6, ny = n1[1] / l1 * 0.4 + n2[1] / l2 * 0.6, nz = n1[2] / l1 * 0.4 + n2[2] / l2 * 0.6;
        const ln = Math.hypot(nx, ny, nz) || 1;
        nrm.push(nx / ln, ny / ln, nz / ln);
        const v = 0.9 + hash3(wx, wy, wz) * 0.2;
        col.push(0.72 * v, 0.95 * v, 0.6 * v);
        fol.push(1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aFoliage', new THREE.Float32BufferAttribute(fol, 1));
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

  // Cel foliage: toon bands + warm tops / teal undersides + rim + wind rustle
  function makeFoliageMaterial(FU) {
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: bandMap(78, 128, 170) });
    mat.onBeforeCompile = (shader) => {
      if (window.injectTerrain) window.injectTerrain(shader, mat);
      Object.assign(shader.uniforms, FU);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aFoliage;
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
          #ifdef USE_INSTANCING
            vec3 treeRoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          #else
            vec3 treeRoot = vec3(0.0);
          #endif
          float tPhase = treeRoot.x * 0.21 + treeRoot.z * 0.17;
          float gust = 0.55 + 0.45 * sin(uTime * 0.7 + dot(treeRoot.xz, uWindDir) * 0.02);
          float sway = sin(uTime * 1.5 + tPhase) * 0.05 * gust * max(0.0, position.y - 0.6);
          float rustle = sin(uTime * 4.2 + position.x * 2.3 + position.z * 1.9 + tPhase) * 0.045 * aFoliage;
          transformed.x += uWindDir.x * sway + rustle;
          transformed.z += uWindDir.y * sway + rustle * 0.7;
          transformed.y += rustle * 0.4;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uRimColor;
          uniform float uFolAlbedo;
          varying float vFoliage;
          varying vec3 vFolN;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // canopy: deep teal-green underside -> bright warm sunlit top
          float upF = smoothstep(-0.45, 0.85, vFolN.y);
          vec3 under = diffuseColor.rgb * vec3(0.32, 0.6, 0.58);
          vec3 topC = diffuseColor.rgb * vec3(1.12, 1.1, 0.8) + vec3(0.03, 0.035, 0.0);
          vec3 leaf = mix(under, topC, upF);
          vec3 bark = vec3(0.40, 0.27, 0.17);   // trunks ignore the zone's leaf tint
          diffuseColor.rgb = mix(bark, leaf, vFoliage) * uFolAlbedo;`)
        .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', `
          float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);
          outgoingLight += uRimColor * rimF * 0.28 * vFoliage;
          gl_FragColor = vec4( outgoingLight, diffuseColor.a );`);
    };
    return mat;
  }

  // ---------------------------------------------------------------------------
  // Wind grass
  // ---------------------------------------------------------------------------
  function buildTuftGeometry() {
    // 3 tapered, slightly curved blades around the tuft centre (5 verts / blade)
    const pos = [], hgt = [], side = [];
    const idx = [];
    for (let b = 0; b < 3; b++) {
      const a = (b / 3) * Math.PI * 2 + 0.4;
      const ox = Math.cos(a) * 0.09, oz = Math.sin(a) * 0.09;
      const dx = Math.cos(a + 1.57), dz = Math.sin(a + 1.57);
      const lean = 0.18 + b * 0.06;
      const base = pos.length / 3;
      const rows = [[0, 0.07], [0.5, 0.045], [1, 0]];
      rows.forEach(([t, w], r) => {
        const cx = ox + Math.cos(a) * lean * t * t, cz = oz + Math.sin(a) * lean * t * t;
        if (w > 0) {
          pos.push(cx - dx * w, t, cz - dz * w, cx + dx * w, t, cz + dz * w);
          hgt.push(t, t); side.push(-1, 1);
        } else {
          pos.push(cx, t, cz); hgt.push(t); side.push(0);
        }
      });
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(hgt, 1));
    g.setIndex(idx);
    return g;
  }

  const GRASS_VERT = `
    attribute float aH;
    attribute vec3 aOffset;           // xz = position inside the tile, y = random
    uniform vec2 uCenter;
    uniform float uTile;
    uniform float uTime;
    uniform vec2 uWindDir;
    uniform vec2 uFade;
    uniform vec3 uCamPos;
    uniform sampler2D uCtrlA;
    uniform sampler2D uCtrlB;
    uniform float uWorldHalf;
    uniform vec3 uSunDir;
    uniform vec3 uSunCol;
    uniform vec3 uAmbCol;
    uniform float uAlbedoScale;
    uniform float uWaterLevel;
    varying vec3 vCol;
    #include <fog_pars_vertex>
    __TERRAIN__
    float gh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float gn(vec2 p) {
      vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), u.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    void main() {
      // wrap this tuft into the tile copy nearest the camera -> infinite field, no CPU work
      vec2 w = aOffset.xz + floor((uCenter - aOffset.xz) / uTile + 0.5) * uTile;
      float rnd = gh(w * 1.37);
      float rnd2 = gh(w.yx * 2.11 + 4.0);
      vec4 ts = terrSample(w);
      float th = uTerrOn > 0.5 ? ts.r : 0.0;
      vec3 tn = normalize(vec3(ts.g, 1.0, ts.b));
      vec2 cUv = w / (2.0 * uWorldHalf) + 0.5;
      vec4 ca = texture2D(uCtrlA, cUv);
      vec4 cb = texture2D(uCtrlB, cUv);
      float grassW = cb.r / (cb.r + cb.g + cb.b + cb.a + 0.0001);
      // only on flat, grassy ground: no roads, cliffs, town paving, peaks or lava
      float mask = smoothstep(0.45, 0.75, grassW) * (1.0 - smoothstep(0.22, 0.45, ca.a));
      mask *= smoothstep(0.86, 0.93, tn.y) * (1.0 - smoothstep(14.0, 18.0, th));
      mask *= smoothstep(uWaterLevel + 0.3, uWaterLevel + 0.9, th);   // no grass in lakes / on beaches
      float dPlaza = length(w - vec2(0.0, 9.5));
      mask *= smoothstep(15.0, 19.0, dPlaza) * smoothstep(5.0, 7.0, abs(w.x)) + step(60.0, length(w));
      mask = clamp(mask, 0.0, 1.0);
      mask *= step(0.12, gn(w * 0.09) + rnd * 0.35);             // natural patchiness
      float dist = length(w - uCamPos.xz);
      float fade = 1.0 - smoothstep(uFade.x, uFade.y, dist);     // shrink away 55-70 m out
      float sc = mask * fade * (0.65 + 0.7 * rnd);
      if (sc < 0.04) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0);
        #ifdef USE_FOG
          fogDepth = 0.0;
        #endif
        return;
      }
      // per-tuft rotation / size
      float ang = rnd2 * 6.2831;
      float c = cos(ang), s = sin(ang);
      vec3 p = position;
      p.xz = mat2(c, -s, s, c) * p.xz * (0.9 + rnd * 0.4);
      float bladeH = 0.55 + rnd2 * 0.45;
      p.y *= bladeH * sc;
      // sweeping gusts + per-blade flutter, bending the tips
      float gust = sin(dot(w, uWindDir) * 0.085 - uTime * 1.7) * 0.5 + 0.5;
      gust *= 0.55 + 0.45 * sin(dot(w, vec2(0.031, 0.047)) + uTime * 0.37);
      float bendAmt = (0.18 + 0.85 * gust) * aH * aH * bladeH;
      p.xz += uWindDir * bendAmt;
      p.xz += vec2(sin(uTime * 6.0 + rnd * 40.0), cos(uTime * 5.3 + rnd2 * 40.0)) * 0.035 * aH;
      p.y -= bendAmt * 0.35;
      vec3 world = vec3(w.x + p.x, th + p.y, w.y + p.z);
      vec4 mvPosition = viewMatrix * vec4(world, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      // colour: base = the terrain's grass albedo (same palette) -> lighter, warmer tips
      float n1 = gn(w * 0.045), n2 = gn(w * 0.37 + 7.1);
      vec3 grassC = mix(vec3(0.16, 0.52, 0.21), vec3(0.34, 0.70, 0.24), clamp(n1 * 0.75 + n2 * 0.35, 0.0, 1.0));
      grassC *= mix(vec3(1.0), ca.rgb * 1.6, 0.85);
      vec3 baseC = grassC * uAlbedoScale;
      vec3 tipC = baseC * vec3(1.3, 1.28, 0.95) + vec3(0.035, 0.04, 0.0);
      vec3 albedo = mix(baseC * 0.82, tipC, aH);
      // toon-banded light matching the ground's 3 bands
      float ndl = dot(tn, uSunDir) * 0.5 + 0.5;
      float band = ndl < 0.42 ? 0.26 : (ndl < 0.62 ? 0.45 : 0.62);
      vCol = albedo * (uSunCol * band + uAmbCol) * (0.92 + 0.16 * aH);
    }`;

  const GRASS_FRAG = `
    varying vec3 vCol;
    #include <fog_pars_fragment>
    void main() {
      gl_FragColor = vec4(vCol, 1.0);
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
      const COUNT = LOW ? 7000 : 18000;
      const TILE = LOW ? 110 : 140;
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
      this.grassU = Object.assign({}, THREE.UniformsLib.fog, {
        uCenter: { value: new THREE.Vector2() },
        uTile: { value: TILE },
        uTime: this.foliageU.uTime,
        uWindDir: this.foliageU.uWindDir,
        uFade: { value: new THREE.Vector2(LOW ? 40 : 55, LOW ? 52 : 70) },
        uCamPos: { value: new THREE.Vector3() },
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
        fog: true
      });
      mat.userData.noTerrain = true; // positions are already terrain-relative
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.castShadow = false;      // grass never touches the shadow map
      mesh.receiveShadow = false;
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
        this.grassU.uCenter.value.set(this.camera.position.x, this.camera.position.z);
        this.grassU.uCamPos.value.copy(this.camera.position);
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
