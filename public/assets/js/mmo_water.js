/* =============================================================================
 * Chrono-Rift — Genshin-style water + ambient atmosphere particles (zero assets)
 *
 *  - Stylized lakes: one grid that follows the hero at sea level (WORLD.waterLevel).
 *    Depth = waterLevel - terrain height, read from the SAME baked heightmap the
 *    ground is displaced with -> shallow/deep colour + crisp animated shoreline foam
 *    without any depth-buffer pass (works at every camera angle, on every GPU).
 *    Dual-layer scrolling ripples, Fresnel sky reflection (live day-night sky
 *    colours), toon sun/moon glint that blooms, wading rings around the hero.
 *  - 500 GPU particles (fewer on phones): glowing motes of light + dandelion seeds
 *    drifting on the wind. Positions are computed entirely in the vertex shader
 *    (wrapped in a box around the hero) -> zero per-frame CPU / buffer uploads.
 *
 *  Cost: 2 draw calls, 0 shadow-map draws, 2 geometries, 0 textures.
 * ============================================================================= */
(function () {
  'use strict';
  const M = window.MMO;
  const W = M.WORLD;
  const WATER_LEVEL = W.waterLevel !== undefined ? W.waterLevel : -2.0;
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const LOW = isTouch || new URLSearchParams(location.search).get('fx') === 'low';
  const NO_TERRAIN_GLSL = 'uniform float uTerrOn; vec4 terrSample(vec2 p){ return vec4(0.0, 0.0, 0.0, 1.0); }';

  // ---------------------------------------------------------------------------
  // Water shader
  // ---------------------------------------------------------------------------
  const WATER_VERT = `
    uniform float uWaterLevel;
    varying vec3 vW;
    varying float vDepth;
    #include <fog_pars_vertex>
    __TERRAIN__
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      float th = uTerrOn > 0.5 ? terrSample(w.xz).r : 0.0;
      vDepth = uWaterLevel - th;
      // far from any lake: tuck the vertex under the ground so those triangles
      // are rejected cheaply (interpolated vDepth < -1 -> early discard)
      w.y = vDepth < -6.0 ? th - 4.0 : uWaterLevel;
      vW = w.xyz;
      vec4 mvPosition = viewMatrix * w;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;

  const WATER_FRAG = `
    uniform float uWaterLevel;
    uniform float uTime;
    uniform vec3 uCamPos;
    uniform vec3 uPlayerPos;
    uniform float uWade;
    uniform vec3 uKeyDir;
    uniform vec3 uKeyCol;
    uniform vec3 uAmbCol;
    uniform vec3 uHorizonColor;
    uniform vec3 uZenithColor;
    uniform float uNight;
    varying vec3 vW;
    varying float vDepth;
    #include <fog_pars_fragment>
    __TERRAIN__
    float wh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float wn(vec2 p) {
      vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(wh(i), wh(i + vec2(1.0, 0.0)), u.x), mix(wh(i + vec2(0.0, 1.0)), wh(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    // analytic gradient of one travelling sine wave (amplitude a, frequency f, speed s)
    vec2 wv(vec2 p, vec2 d, float f, float s, float a, float ph) {
      return d * (a * f * cos(dot(p, d) * f + uTime * s + ph));
    }
    void main() {
      if (vDepth < -1.0) discard;                       // cheap reject (interpolated)
      vec2 p = vW.xz;
      float depth = uWaterLevel - terrSample(p).r;      // exact per-pixel depth
      if (depth < 0.0) discard;

      // ---- dual-layer ripples (two scrolling sets of waves, noise-warped) ----
      float warp = wn(p * 0.07 + uTime * 0.02) * 6.2831;
      vec2 g = vec2(0.0);
      g += wv(p, normalize(vec2(0.8, 0.6)), 0.55, 1.10, 0.060, warp);
      g += wv(p, normalize(vec2(-0.5, 0.86)), 0.83, 1.45, 0.040, warp * 0.7);
      g += wv(p, normalize(vec2(0.95, -0.3)), 0.37, 0.80, 0.070, 1.3);
      float warp2 = wn(p * 0.31 - uTime * 0.07) * 6.2831;
      g += wv(p, normalize(vec2(-0.9, -0.42)), 2.6, 3.10, 0.012, warp2);
      g += wv(p, normalize(vec2(0.2, -0.98)), 3.4, 3.70, 0.009, warp2 * 1.3);
      g += wv(p, normalize(vec2(0.66, 0.75)), 4.7, 4.40, 0.006, 2.1);
      // wading rings around the hero
      vec2 dp = p - uPlayerPos.xz;
      float dl = length(dp) + 0.0001;
      float ringA = uWade * exp(-dl * 0.55);
      g += (dp / dl) * cos(dl * 7.0 - uTime * 6.0) * 0.16 * ringA;
      g *= smoothstep(0.0, 0.5, depth) * 0.75 + 0.25;   // calmer right at the shore
      vec3 N = normalize(vec3(-g.x, 1.0, -g.y));

      vec3 V = normalize(uCamPos - vW);
      float ndv = clamp(dot(N, V), 0.0, 1.0);
      float fres = 0.04 + 0.96 * pow(1.0 - ndv, 4.0);   // Fresnel

      // ---- reflection: the same gradient the sky dome uses ----
      vec3 R = reflect(-V, N);
      float ry = max(R.y, 0.0);
      vec3 skyC = mix(uHorizonColor, uZenithColor, pow(smoothstep(-0.03, 0.42, ry), 0.5));
      float sd = max(dot(R, uKeyDir), 0.0);
      skyC += uKeyCol * (pow(sd, 24.0) * 0.12 + pow(sd, 6.0) * 0.04);  // warm halo around the sun
      // stylised (banded) sun / moon glint -> HDR, picked up by the bloom pass
      float glint = smoothstep(0.9955, 0.9975, sd) * 5.0 + smoothstep(0.975, 0.99, sd) * 0.6;
      glint *= smoothstep(0.0, 0.08, uKeyDir.y);

      // ---- body colour: shallow turquoise -> deep teal ----
      float dk = smoothstep(0.0, 1.4, depth);
      vec3 shallowC = vec3(0.25, 0.85, 0.80);
      vec3 deepC = vec3(0.03, 0.30, 0.45);
      vec3 bodyC = mix(shallowC, deepC, dk);
      float ndl = clamp(dot(N, uKeyDir), 0.0, 1.0);
      vec3 light = uKeyCol * (0.35 + 0.25 * ndl) + uAmbCol;
      vec3 col = bodyC * (light * 0.72 + 0.05);
      // caustic shimmer in the shallows
      float caus = smoothstep(0.62, 0.95, wn(p * 1.3 + g * 9.0 + uTime * 0.25)) * (1.0 - dk);
      col += uKeyCol * caus * 0.10;
      col = mix(col, skyC, fres * 0.75);
      col += uKeyCol * glint;

      // ---- shoreline foam from (waterLevel - terrain height): no depth buffer ----
      float n = wn(p * 0.45 + vec2(uTime * 0.12, -uTime * 0.09));
      float edge = 1.0 - smoothstep(0.03, 0.11 + n * 0.05, depth);           // crisp lip
      float lines = smoothstep(0.86, 0.96, sin(depth * 18.0 - uTime * 2.5 + n * 3.0));
      lines *= 1.0 - smoothstep(0.12, 0.7, depth);                            // only near shore
      lines *= smoothstep(0.32, 0.5, wn(p * 0.9 - uTime * 0.15));             // broken, not rings
      float wake = smoothstep(0.82, 0.95, cos(dl * 7.0 - uTime * 6.0)) * ringA * 0.9;
      float foam = clamp(max(edge, max(lines, wake)), 0.0, 1.0);
      vec3 foamC = vec3(0.96, 0.99, 1.0) * (uKeyCol * 0.45 + uAmbCol * 0.9 + 0.08);
      col = mix(col, foamC, foam);

      // shallow water lets the lake bed show through
      float alpha = mix(0.52, 0.9, dk);
      alpha = max(alpha, fres * 0.9);
      alpha = max(alpha, foam);
      alpha *= smoothstep(0.0, 0.02, depth);
      gl_FragColor = vec4(col, alpha);
      #include <tonemapping_fragment>
      #include <fog_fragment>
    }`;

  // ---------------------------------------------------------------------------
  // Ambient particles: motes of light + dandelion seeds (all in the vertex shader)
  // ---------------------------------------------------------------------------
  const MOTE_VERT = `
    attribute vec4 aRnd;            // xyz: position in box / phase, w: kind + variation
    uniform float uTime;
    uniform vec3 uCenter;
    uniform float uBox;
    uniform vec2 uWind;
    uniform float uScale;
    uniform float uWaterLevel;
    uniform float uNight;
    varying float vKind;
    varying float vAlpha;
    varying float vRot;
    varying float vTw;
    __TERRAIN__
    void main() {
      vec3 r = aRnd.xyz;
      vKind = step(0.55, aRnd.w);                               // 45% seeds, 55% motes
      float spd = 0.55 + r.y * 0.9;
      // drift with the wind + lazy curling, wrapped into the box nearest the hero
      vec2 drift = uWind * uTime * spd * mix(0.35, 1.0, vKind);
      drift += vec2(sin(uTime * 0.31 + r.x * 37.0), cos(uTime * 0.27 + r.z * 41.0)) * 2.5;
      vec2 local = r.xz * uBox + drift;
      vec2 w = local + floor((uCenter.xz - local) / uBox + 0.5) * uBox;
      float th = uTerrOn > 0.5 ? terrSample(w).r : 0.0;
      th = max(th, uWaterLevel);
      float hgt = mix(0.4, 3.2, r.y * r.y) + vKind * 1.6;
      hgt += sin(uTime * (0.45 + r.x * 0.5) + r.z * 30.0) * 0.55;  // bob
      vec3 pos = vec3(w.x, th + hgt, w.y);
      vec4 mv = viewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mv;
      // fade at the box edge (no popping when wrapping) and very close to the lens
      vec2 e = abs(w - uCenter.xz) / (uBox * 0.5);
      float edge = 1.0 - smoothstep(0.65, 0.98, max(e.x, e.y));
      float near = smoothstep(1.2, 3.0, -mv.z);
      vTw = 0.6 + 0.4 * sin(uTime * (1.5 + r.z * 2.5) + aRnd.w * 50.0);   // twinkle
      // seeds read in daylight, motes (fireflies) glow brighter at night
      float vis = mix(0.55 + 0.75 * uNight, 0.9 - 0.45 * uNight, vKind);
      vAlpha = edge * near * vis;
      vRot = uTime * (0.3 + r.x) * (r.z > 0.5 ? 1.0 : -1.0) + aRnd.w * 20.0;
      float size = mix(0.22 + 0.16 * fract(aRnd.w * 13.0), 0.36 + 0.2 * fract(aRnd.w * 7.0), vKind);
      gl_PointSize = clamp(size * uScale / max(-mv.z, 0.1), 1.0, 64.0);
      if (vAlpha < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    }`;

  const MOTE_FRAG = `
    uniform float uNight;
    uniform vec3 uKeyCol;
    varying float vKind;
    varying float vAlpha;
    varying float vRot;
    varying float vTw;
    void main() {
      vec2 pc = gl_PointCoord - 0.5;
      float r = length(pc);
      if (r > 0.5) discard;
      vec3 col;
      float a;
      if (vKind < 0.5) {
        // glowing mote: hot core + soft halo; gold by day, green-cyan fireflies at night
        float core = exp(-r * r * 90.0);
        float halo = exp(-r * r * 14.0) * 0.45;
        col = mix(vec3(1.0, 0.86, 0.5), vec3(0.55, 1.0, 0.75), uNight) * (core * 2.4 + halo);
        a = (core + halo) * vTw;
      } else {
        // dandelion seed: thin radial filaments, fluffy tips, tiny seed body
        float c = cos(vRot), s = sin(vRot);
        vec2 q = mat2(c, -s, s, c) * pc;
        float ang = atan(q.y, q.x);
        float rays = pow(abs(cos(ang * 6.0)), 40.0) * smoothstep(0.42, 0.08, r) * smoothstep(0.02, 0.07, r);
        float tips = smoothstep(0.1, 0.0, abs(r - 0.36)) * (0.35 + 0.65 * pow(abs(cos(ang * 6.0)), 6.0));
        float body = smoothstep(0.07, 0.03, r);
        a = clamp(rays * 0.8 + tips * 0.55 + body, 0.0, 1.0);
        col = vec3(1.0, 0.98, 0.92) * (0.55 + uKeyCol * 0.35) * a;
      }
      gl_FragColor = vec4(col, a * vAlpha);
      #include <tonemapping_fragment>
    }`;

  // ---------------------------------------------------------------------------
  // Game integration
  // ---------------------------------------------------------------------------
  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld };

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initWaterAndAtmosphere(); } catch (e) { console.warn('[Water] disabled', e); }
    },

    initWaterAndAtmosphere() {
      const TU = window.TERRAIN_UNIFORMS || {};
      const SU = this.skyUniforms || {};
      const terrGLSL = window.TERRAIN_GLSL || NO_TERRAIN_GLSL;
      this.waterLevel = WATER_LEVEL;
      // shared light uniforms (updated once per frame for both effects)
      this.atmoU = {
        uTime: { value: 0 },
        uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
        uKeyCol: { value: new THREE.Color(1, 1, 1) },
        uAmbCol: { value: new THREE.Color(0.5, 0.6, 0.7) },
        uNight: SU.uNight || { value: 0 },
        uWaterLevel: { value: WATER_LEVEL }
      };
      const A = this.atmoU;

      // ---- water ----
      const SIZE = LOW ? 760 : 900, SEG = LOW ? 150 : 180;
      this._waterStep = SIZE / SEG;
      const wGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
      wGeo.rotateX(-Math.PI / 2);
      wGeo.deleteAttribute('normal');
      wGeo.deleteAttribute('uv');
      this.waterU = Object.assign({}, THREE.UniformsLib.fog, TU, {
        uWaterLevel: A.uWaterLevel,
        uTime: A.uTime,
        uCamPos: { value: new THREE.Vector3() },
        uPlayerPos: { value: new THREE.Vector3() },
        uWade: { value: 0 },
        uKeyDir: A.uKeyDir,
        uKeyCol: A.uKeyCol,
        uAmbCol: A.uAmbCol,
        uHorizonColor: SU.uHorizonColor || { value: new THREE.Color(0xbfe3ff) },
        uZenithColor: SU.uZenithColor || { value: new THREE.Color(0x4a8fe0) },
        uNight: A.uNight
      });
      const wMat = new THREE.ShaderMaterial({
        uniforms: this.waterU,
        vertexShader: WATER_VERT.replace('__TERRAIN__', terrGLSL),
        fragmentShader: WATER_FRAG.replace('__TERRAIN__', terrGLSL),
        transparent: true,
        depthWrite: false,
        fog: true
      });
      wMat.userData.noTerrain = true;          // positions are already world-space
      const water = new THREE.Mesh(wGeo, wMat);
      water.name = 'water';
      water.frustumCulled = false;             // follows the hero; always relevant
      water.castShadow = false;
      water.receiveShadow = false;
      water.renderOrder = 2;                   // after opaque world + grass
      this.scene.add(water);
      this.waterMesh = water;

      // ---- ambient motes + dandelion seeds ----
      const COUNT = LOW ? 380 : 500;
      const BOX = LOW ? 60 : 80;
      const rnd = new Float32Array(COUNT * 4);
      const rng = (window.ChronoWorld && window.ChronoWorld.mulberry32) ? window.ChronoWorld.mulberry32(777) : Math.random;
      for (let i = 0; i < rnd.length; i++) rnd[i] = rng();
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3)); // unused, required by WebGL
      pGeo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
      this.moteU = Object.assign({}, TU, {
        uTime: A.uTime,
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: BOX },
        uWind: { value: new THREE.Vector2(0.8, 0.6).normalize().multiplyScalar(0.9) },
        uScale: { value: 400 },
        uWaterLevel: A.uWaterLevel,
        uNight: A.uNight,
        uKeyCol: A.uKeyCol
      });
      const pMat = new THREE.ShaderMaterial({
        uniforms: this.moteU,
        vertexShader: MOTE_VERT.replace('__TERRAIN__', terrGLSL),
        fragmentShader: MOTE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
      });
      pMat.userData.noTerrain = true;
      const motes = new THREE.Points(pGeo, pMat);
      motes.name = 'ambientMotes';
      motes.frustumCulled = false;             // positions only exist on the GPU
      motes.castShadow = false;
      motes.receiveShadow = false;
      motes.renderOrder = 3;
      this.scene.add(motes);
      this.moteMesh = motes;
      this.moteCount = COUNT;
    },

    updateWaterAndAtmosphere() {
      const A = this.atmoU;
      if (!A) return;
      A.uTime.value = this.clock.getElapsedTime();
      const sl = this.sunLight;
      const d = A.uKeyDir.value.copy(sl.position).sub(sl.target.position).normalize();
      if (!isFinite(d.x)) d.set(0, 1, 0);
      A.uKeyCol.value.copy(sl.color).multiplyScalar(Math.min(sl.intensity, 2.4) * 0.6);
      A.uAmbCol.value.copy(this.hemiLight.color).multiplyScalar(this.hemiLight.intensity * 0.55);
      const p = this.player.pos;
      if (this.waterMesh) {
        const s = this._waterStep * 2;          // snap to whole cells: no vertex swimming
        this.waterMesh.position.set(Math.round(p.x / s) * s, 0, Math.round(p.z / s) * s);
        const U = this.waterU;
        U.uCamPos.value.copy(this.camera.position);
        U.uPlayerPos.value.set(p.x, 0, p.z);
        // wading rings only while the hero stands in water (and fade in/out)
        const depth = WATER_LEVEL - (this.terrainVisualHeight ? this.terrainVisualHeight(p.x, p.z) : 0);
        const want = depth > 0.05 ? Math.min(1, 0.4 + depth) : 0;
        U.uWade.value += (want - U.uWade.value) * 0.08;
      }
      if (this.moteMesh) {
        this.moteU.uCenter.value.set(p.x, 0, p.z);
        // point size in pixels at 1 m: follows the viewport height + pixel ratio
        const h = this.renderer.domElement.height || window.innerHeight;
        this.moteU.uScale.value = h * 0.9;
      }
    },

    // Frees every GPU resource owned by this module (zone reloads / teardown).
    disposeWaterAndAtmosphere() {
      for (const k of ['waterMesh', 'moteMesh']) {
        const m = this[k];
        if (!m) continue;
        this.scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
        this[k] = null;
      }
      this.atmoU = null;
    },

    // Console helper: game.perfAudit() -> draw calls / triangles / GPU memory for ONE full
    // frame (the composer resets renderer.info per pass, so counters are accumulated here).
    perfAudit() {
      const r = this.renderer, info = r.info;
      const prevAuto = info.autoReset;
      info.autoReset = false;
      info.reset();
      const t0 = performance.now();
      if (this.renderFrame) this.renderFrame(); else r.render(this.scene, this.camera);
      const ms = performance.now() - t0;
      const out = {
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        points: info.render.points,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs ? info.programs.length : 0,
        sceneObjects: this.scene.children.length,
        renderMs: +ms.toFixed(2),
        jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : undefined,
        live: {
          monsters: (this.monsters || []).length,
          projectiles: (this.projectiles || []).length,
          vfx: (this.vfxSprites || []).length,
          telegraphs: (this.telegraphs || []).length,
          loot: (this.lootDrops || []).length,
          motes: this.moteCount || 0,
          grassTufts: this.grassCount || 0
        }
      };
      info.autoReset = prevAuto;
      info.reset();
      return out;
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      this.updateWaterAndAtmosphere();
    }
  });
})();
