/* =============================================================================
 * Chrono-Rift — procedural skill VFX & combat juice (zero texture files)
 *
 *  VFX manager (all pooled, additive GLSL, terrain-aware):
 *    • core flash      — camera-facing star burst with a white-hot core
 *    • sparks          — 1 GPU instanced draw; velocity-stretched streaks with drag + gravity
 *    • slash arc       — sweeping crescent with scrolling energy noise and a hot edge
 *    • rune ring       — ground sigil (rings, rotating glyph band, hexagram) drawn in polar space
 *    • shockwave wall  — expanding open cylinder (also used as a directional "sonic boom")
 *    • energy pillars  — rising cylinders with upward-scrolling streaks
 *    • ribbon trails   — energy sheet following the hero through dashes / leaps / blinks
 *    • VFX lights      — 4 pooled "lights" evaluated only in the ground + grass shaders
 *                        (the scene deliberately has no THREE.PointLights)
 *
 *  Three signature archetypes per class: elemental DASH-SLASH, AoE GROUND SLAM with
 *  rising pillars, CHARGED PROJECTILE BURST. Effects play for remote peers too.
 *
 *  Combat juice: damped-spring directional camera kick, FOV punch on heavy casts,
 *  70 ms hit-stop on heavy skill impacts, 0.1 s Fresnel rim flash on hit enemies
 *  (white or elemental), stacked + scaled damage numbers.
 * ============================================================================= */
(function () {
  'use strict';
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const TERR = window.TERRAIN_GLSL || 'float terrainHeightAt(vec2 p){ return 0.0; }';
  const TU = window.TERRAIN_UNIFORMS || {};

  // element colours (match mmo_combatfx.js)
  const ELEMC = { pyro: 0xff6a3d, hydro: 0x35b8ff, electro: 0xc070ff, cryo: 0x9cf2ff };
  const SKILL_ELEM = {
    vanguard: { 2: 'electro', 3: 'electro', 4: 'hydro', 5: 'electro' },
    ranger: { 2: 'cryo', 3: 'hydro', 4: 'electro', 5: 'hydro' },
    arcanist: { 2: 'electro', 3: 'electro', 4: 'cryo', 5: 'cryo' },
    berserker: { 2: 'pyro', 3: 'electro', 4: 'pyro', 5: 'pyro' }
  };
  const PAL = {
    vanguard: { core: 0xffe9b0, main: 0xffa818 },
    ranger: { core: 0xc8ffe6, main: 0x1fd67a },
    arcanist: { core: 0xe4ccff, main: 0x9a4dff },
    berserker: { core: 0xffd2a8, main: 0xff2a3c }
  };

  // ---------------------------------------------------------------------------
  // GLSL
  // ---------------------------------------------------------------------------
  const NOISE = `
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }`;

  const V_TERRAIN_MESH = `
    ${TERR}
    vec4 crWorld(vec3 p) { vec4 w = modelMatrix * vec4(p, 1.0); w.y += terrainHeightAt(w.xz); return w; }`;

  const FLASH_V = `
    ${TERR}
    uniform float uScale;
    varying vec2 vL;
    void main() {
      vec4 c = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      c.y += terrainHeightAt(c.xz);
      vec4 mv = viewMatrix * c;
      mv.xy += position.xy * uScale;
      vL = position.xy * 2.0;
      gl_Position = projectionMatrix * mv;
    }`;
  const FLASH_F = `
    uniform float uT; uniform float uSeed; uniform vec3 uColor; uniform vec3 uCore;
    varying vec2 vL;
    void main() {
      float d = length(vL);
      float a = atan(vL.y, vL.x);
      float k = 1.0 - uT;
      float core = exp(-d * d * 22.0) * k;
      float glow = exp(-d * 5.0) * k * k;
      float rays = pow(max(0.0, 1.0 - abs(sin(a * 3.0 + uSeed))), 26.0) + 0.6 * pow(max(0.0, 1.0 - abs(sin(a * 4.0 - uSeed * 1.7))), 40.0);
      rays *= exp(-d * 2.2) * k * k;
      vec3 col = uCore * core * 1.6 + uColor * (glow * 0.6 + rays * 1.5);
      gl_FragColor = vec4(col * smoothstep(1.0, 0.7, d), 1.0);
    }`;

  const SPARK_V = `
    ${TERR}
    uniform float uTime;
    attribute vec4 aP0B; attribute vec4 aVL; attribute vec4 aColW; attribute vec2 aPhys;
    varying float vA; varying vec3 vCol; varying float vU; varying float vV;
    vec3 posAt(float t) {
      float k = max(aPhys.x, 0.001);
      vec3 p = aP0B.xyz + aVL.xyz * ((1.0 - exp(-k * t)) / k);
      p.y -= 0.5 * aPhys.y * t * t;
      p.y += terrainHeightAt(p.xz);
      return p;
    }
    void main() {
      float age = uTime - aP0B.w;
      if (age < 0.0 || age > aVL.w) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
      float k = age / aVL.w;
      vec4 va = viewMatrix * vec4(posAt(age), 1.0);
      vec4 vb = viewMatrix * vec4(posAt(max(0.0, age - 0.05)), 1.0);
      vec2 dd = va.xy - vb.xy;
      float L = length(dd);
      vec2 d2 = L > 1e-4 ? dd / L : vec2(0.0, 1.0);
      vec2 perp = vec2(-d2.y, d2.x);
      vec3 p = mix(vb.xyz, va.xyz, position.x);
      p.xy += d2 * (position.x - 0.5) * 0.05;
      p.xy += perp * position.y * aColW.w * (1.0 - k * 0.6);
      vA = (1.0 - k) * (1.0 - k);
      vCol = aColW.rgb; vU = position.x; vV = position.y;
      gl_Position = projectionMatrix * vec4(p, 1.0);
    }`;
  const SPARK_F = `
    varying float vA; varying vec3 vCol; varying float vU; varying float vV;
    void main() {
      float across = 1.0 - vV * vV;
      float b = vA * (0.25 + 0.75 * vU) * across;
      vec3 col = vCol * b * 2.2 + vec3(1.0) * pow(across, 8.0) * vU * vA * 0.55;
      gl_FragColor = vec4(col, 1.0);
    }`;

  const ARC_V = `
    ${V_TERRAIN_MESH}
    uniform float uArc; uniform float uR0;
    attribute float aA; attribute float aR;
    varying float vA; varying float vR;
    void main() {
      float ang = (aA - 0.5) * uArc;
      float r = mix(uR0, 1.0, aR);
      vec3 p = vec3(sin(ang) * r, 0.0, cos(ang) * r);
      vA = aA; vR = aR;
      gl_Position = projectionMatrix * viewMatrix * crWorld(p);
    }`;
  const ARC_F = `
    ${NOISE}
    uniform float uT; uniform float uTime; uniform float uSeed; uniform float uDir;
    uniform vec3 uColor; uniform vec3 uCore;
    varying float vA; varying float vR;
    void main() {
      float a = uDir > 0.0 ? vA : 1.0 - vA;
      float head = 1.0 - pow(1.0 - clamp(uT * 2.2, 0.0, 1.0), 3.0);
      float tail = head - 0.8;
      float m = clamp((a - tail) / max(0.001, head - tail), 0.0, 1.0);
      m *= 1.0 - smoothstep(head, head + 0.05, a);
      float thick = 0.16 + 0.5 * sin(3.14159 * vA);
      float band = smoothstep(1.0 - thick, 1.0 - thick + 0.3, vR) * smoothstep(1.0, 0.88, vR);
      float n = vn(vec2(vA * 11.0 - uTime * 10.0 + uSeed, vR * 4.0));
      float streak = smoothstep(0.2, 0.85, n) * 0.85 + 0.15;
      float edge = smoothstep(0.86, 0.96, vR) * smoothstep(1.0, 0.965, vR);
      float fade = 1.0 - smoothstep(0.45, 1.0, uT);
      vec3 col = uColor * m * band * streak * fade * 1.15 + uCore * edge * m * fade * 1.3;
      gl_FragColor = vec4(col, 1.0);
    }`;

  const RUNE_V = `
    ${V_TERRAIN_MESH}
    varying vec2 vL;
    void main() {
      vL = position.xz;
      vec4 w = crWorld(position);
      w.y += 0.07;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const RUNE_F = `
    ${NOISE}
    uniform float uT; uniform float uRot; uniform float uSeed; uniform vec3 uColor; uniform vec3 uCore;
    varying vec2 vL;
    float ring(float r, float rad, float w) { return smoothstep(w, 0.0, abs(r - rad)); }
    void main() {
      float r = length(vL);
      if (r > 1.0) discard;
      float ang = atan(vL.y, vL.x);
      float grow = 1.0 - pow(1.0 - clamp(uT * 3.2, 0.0, 1.0), 3.0);
      float vis = smoothstep(grow + 0.03, grow - 0.03, r);
      float rings = ring(r, 0.965, 0.014) + ring(r, 0.905, 0.006) + ring(r, 0.64, 0.010) * 0.8 + ring(r, 0.33, 0.008) * 0.6;
      // glyph band
      float a01 = fract((ang + uRot) / 6.28318);
      float cells = 26.0;
      float ci = floor(a01 * cells), cf = fract(a01 * cells);
      float rb = (r - 0.68) / 0.19;
      float inBand = step(0.12, cf) * step(cf, 0.88) * step(0.0, rb) * step(rb, 1.0);
      float gx = floor(cf * 3.0), gy = floor(rb * 3.0);
      float sv = smoothstep(0.2, 0.0, abs(fract(cf * 3.0) - 0.5)) * step(0.45, h21(vec2(ci * 7.0 + gx, gy + uSeed)));
      float sh = smoothstep(0.2, 0.0, abs(fract(rb * 3.0) - 0.5)) * step(0.55, h21(vec2(ci * 3.0 + gy, gx + uSeed * 2.0)));
      float glyph = inBand * max(sv, sh);
      // hexagram
      float hex = 0.0;
      for (int k = 0; k < 6; k++) {
        float th = float(k) * 1.0472 - uRot * 1.6;
        hex += smoothstep(0.012, 0.0, abs(dot(vL, vec2(cos(th), sin(th))) - 0.3)) * step(r, 0.62);
      }
      float fill = smoothstep(0.97, 0.0, r) * 0.05 + smoothstep(0.35, 0.0, r) * 0.08;
      float fade = 1.0 - smoothstep(0.45, 1.0, uT);
      float I = (rings + glyph * 0.85 + min(hex, 1.0) * 0.7 + fill) * vis * fade;
      vec3 col = uColor * I * 1.9 + uCore * rings * vis * fade * 0.45;
      gl_FragColor = vec4(col, 1.0);
    }`;

  const CYL_V = `
    ${V_TERRAIN_MESH}
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main() {
      vUv = uv;
      vec4 w = crWorld(position);
      vec4 mv = viewMatrix * w;
      vN = normalize(normalMatrix * normal);
      vV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const SHOCK_F = `
    ${NOISE}
    uniform float uT; uniform float uTime; uniform float uSeed; uniform vec3 uColor; uniform vec3 uCore;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main() {
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.4);
      float prof = pow(1.0 - vUv.y, 2.2) * smoothstep(0.0, 0.06, vUv.y + 0.02);
      float n = vn(vec2(vUv.x * 40.0 + uSeed, vUv.y * 3.0 - uTime * 4.0));
      float fade = (1.0 - uT) * (1.0 - uT);
      float I = prof * (0.5 + 0.5 * n) * (0.35 + fres) * fade;
      vec3 col = mix(uColor, uCore, pow(1.0 - vUv.y, 8.0) * 0.5) * I * 1.15;
      gl_FragColor = vec4(col, 1.0);
    }`;
  const PILLAR_F = `
    ${NOISE}
    uniform float uT; uniform float uTime; uniform float uSeed; uniform vec3 uColor; uniform vec3 uCore;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main() {
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.3);
      float s = vn(vec2(vUv.x * 12.0 + uSeed, vUv.y * 2.5 - uTime * 6.0));
      float streak = smoothstep(0.35, 0.95, s);
      float prof = smoothstep(0.0, 0.1, vUv.y) * pow(1.0 - vUv.y, 1.4);
      float fade = 1.0 - smoothstep(0.35, 1.0, uT);
      float I = (0.3 + streak * 1.2) * prof * (0.35 + fres) * fade;
      vec3 col = mix(uColor, uCore, streak * 0.2) * I * 1.1;
      gl_FragColor = vec4(col, 1.0);
    }`;

  const RIB_V = `
    ${TERR}
    attribute float aT; attribute float aS;
    varying float vT; varying float vS;
    void main() {
      vT = aT; vS = aS;
      vec3 p = position;
      p.y += terrainHeightAt(p.xz);
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`;
  const RIB_F = `
    ${NOISE}
    uniform float uFade; uniform float uTime; uniform vec3 uColor; uniform vec3 uCore;
    varying float vT; varying float vS;
    void main() {
      float edge = pow(abs(vS - 0.5) * 2.0, 2.5);
      float n = vn(vec2(vT * 9.0 - uTime * 7.0, vS * 3.0));
      float I = pow(1.0 - vT, 1.6) * (0.25 + 0.75 * edge) * (0.6 + 0.4 * n) * uFade;
      vec3 col = uColor * I * 1.1 + uCore * edge * pow(1.0 - vT, 5.0) * uFade * 0.7;
      gl_FragColor = vec4(col, 1.0);
    }`;

  // VFX "lights" evaluated in the ground + grass shaders only
  const VL_PARS = `
    uniform vec4 uCrLP[4];
    uniform vec3 uCrLC[4];
    vec3 crVfxLight(vec3 wp) {
      vec3 s = vec3(0.0);
      for (int i = 0; i < 4; i++) {
        vec3 d = uCrLP[i].xyz - wp;
        float a = max(0.0, 1.0 - dot(d, d) / (uCrLP[i].w * uCrLP[i].w));
        s += uCrLC[i] * a * a;
      }
      return s;
    }`;

  function addMat(vs, fs, uniforms, opts) {
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, TU, uniforms),
      vertexShader: vs, fragmentShader: fs,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: (opts && opts.side) || THREE.FrontSide,
      depthTest: !(opts && opts.noDepth)
    });
    m.userData.noTerrain = true;                    // we displace onto the terrain ourselves
    m.customProgramCacheKey = () => 'cr-skillvfx-' + opts.key;
    return m;
  }
  const col3 = (hex) => new THREE.Color(hex);
  const rnd = (a, b) => a + Math.random() * (b - a);

  // arc strip: 48 segments along x 4 rings across
  function arcGeometry() {
    const SA = 48, SR = 4;
    const pos = [], aA = [], aR = [], idx = [];
    for (let i = 0; i <= SA; i++) {
      for (let j = 0; j <= SR; j++) { pos.push(0, 0, 0); aA.push(i / SA); aR.push(j / SR); }
    }
    for (let i = 0; i < SA; i++) {
      for (let j = 0; j < SR; j++) {
        const a = i * (SR + 1) + j, b = a + SR + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(aA, 1));
    g.setAttribute('aR', new THREE.Float32BufferAttribute(aR, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.5);
    return g;
  }

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, useSkill: GP.useSkill,
    cameraRig: GP.cameraRig, upgradeEntityToGLB: GP.upgradeEntityToGLB,
    triggerEntityHitFlash: GP.triggerEntityHitFlash, applyDamageToMonster: GP.applyDamageToMonster,
    spawnFloatingText: GP.spawnFloatingText
  };
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

  // shared Fresnel hit-rim hook (per-material uniform, chained after the anime hook)
  function rimHook(shader, r) {
    const prev = this.userData._rimPrev;
    if (prev) prev.call(this, shader, r);
    shader.uniforms.uHitRim = this.userData.hitRim;
    const OUT = 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );';
    if (shader.fragmentShader.indexOf(OUT) < 0 || shader.fragmentShader.indexOf('vViewPosition') < 0) return;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uHitRim;')
      .replace(OUT, `if (uHitRim.a > 0.001) {
          float hrF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.0);
          outgoingLight = mix(outgoingLight, uHitRim.rgb, uHitRim.a * (0.15 + 0.45 * hrF));
          outgoingLight += uHitRim.rgb * uHitRim.a * hrF * 1.3;
        }
        ${OUT}`);
  }

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initSkillVfx(); } catch (e) { console.warn('[SkillVFX] init failed', e); }
    },

    initSkillVfx() {
      const S = this.scene;
      const V = this._svx = { t: 0, flashes: [], arcs: [], runes: [], shocks: [], pillars: [], ribbons: [], lights: [], rims: [], timers: [] };
      // flashes
      const quad = new THREE.PlaneGeometry(1, 1);
      for (let i = 0; i < 8; i++) {
        const mat = addMat(FLASH_V, FLASH_F, { uScale: { value: 1 }, uT: { value: 0 }, uSeed: { value: 0 }, uColor: { value: col3(0xffffff) }, uCore: { value: col3(0xffffff) } }, { key: 'flash', noDepth: true });
        const m = new THREE.Mesh(quad, mat);
        m.frustumCulled = false; m.visible = false; m.renderOrder = 16;
        S.add(m); V.flashes.push({ m, t: 0, dur: 0.3, s0: 1, s1: 2 });
      }
      // arcs
      const ag = arcGeometry();
      for (let i = 0; i < 6; i++) {
        const mat = addMat(ARC_V, ARC_F, { uArc: { value: 2.4 }, uR0: { value: 0.55 }, uT: { value: 0 }, uTime: { value: 0 }, uSeed: { value: 0 }, uDir: { value: 1 }, uColor: { value: col3(0xffffff) }, uCore: { value: col3(0xffffff) } }, { key: 'arc', side: THREE.DoubleSide });
        const m = new THREE.Mesh(ag, mat);
        m.frustumCulled = false; m.visible = false; m.renderOrder = 15;
        S.add(m); V.arcs.push({ m, t: 0, dur: 0.42 });
      }
      // rune rings
      const rg = new THREE.PlaneGeometry(2, 2, 24, 24); rg.rotateX(-Math.PI / 2);
      for (let i = 0; i < 4; i++) {
        const mat = addMat(RUNE_V, RUNE_F, { uT: { value: 0 }, uRot: { value: 0 }, uSeed: { value: 0 }, uColor: { value: col3(0xffffff) }, uCore: { value: col3(0xffffff) } }, { key: 'rune' });
        const m = new THREE.Mesh(rg, mat);
        m.frustumCulled = false; m.visible = false; m.renderOrder = 12;
        S.add(m); V.runes.push({ m, t: 0, dur: 0.9, spin: 1 });
      }
      // shock walls (open cylinder, base at y = 0)
      const cg = new THREE.CylinderGeometry(1, 1, 1, 56, 1, true); cg.translate(0, 0.5, 0);
      for (let i = 0; i < 6; i++) {
        const mat = addMat(CYL_V, SHOCK_F, { uT: { value: 0 }, uTime: { value: 0 }, uSeed: { value: 0 }, uColor: { value: col3(0xffffff) }, uCore: { value: col3(0xffffff) } }, { key: 'shock', side: THREE.DoubleSide });
        const m = new THREE.Mesh(cg, mat);
        m.frustumCulled = false; m.visible = false; m.renderOrder = 13;
        S.add(m); V.shocks.push({ m, t: 0, dur: 0.45, r0: 0.5, r1: 5, h: 1 });
      }
      // pillars
      const pg = new THREE.CylinderGeometry(1, 0.7, 1, 20, 1, true); pg.translate(0, 0.5, 0);
      for (let i = 0; i < 16; i++) {
        const mat = addMat(CYL_V, PILLAR_F, { uT: { value: 0 }, uTime: { value: 0 }, uSeed: { value: 0 }, uColor: { value: col3(0xffffff) }, uCore: { value: col3(0xffffff) } }, { key: 'pillar', side: THREE.DoubleSide });
        const m = new THREE.Mesh(pg, mat);
        m.frustumCulled = false; m.visible = false; m.renderOrder = 13;
        S.add(m); V.pillars.push({ m, t: 0, dur: 0.7, delay: 0, h: 4, r: 0.4 });
      }
      // ribbons
      const N = 22;
      for (let i = 0; i < 3; i++) {
        const pos = new Float32Array(N * 2 * 3), aT = new Float32Array(N * 2), aS = new Float32Array(N * 2), idx = [];
        for (let k = 0; k < N; k++) { aT[k * 2] = aT[k * 2 + 1] = k / (N - 1); aS[k * 2] = 0; aS[k * 2 + 1] = 1; }
        for (let k = 0; k < N - 1; k++) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
        g.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
        g.setIndex(idx);
        const mat = addMat(RIB_V, RIB_F, { uFade: { value: 0 }, uTime: { value: 0 }, uColor: { value: col3(0xffffff) }, uCore: { value: col3(0xffffff) } }, { key: 'ribbon', side: THREE.DoubleSide });
        const m = new THREE.Mesh(g, mat);
        m.frustumCulled = false; m.visible = false; m.renderOrder = 14;
        S.add(m); V.ribbons.push({ m, N, hist: [], ent: null, follow: 0, fade: 0, active: false });
      }
      // sparks: one instanced draw
      const MAX = this.gfxQuality === 'low' ? 900 : (isTouch ? 1500 : 2200);
      const sq = new THREE.InstancedBufferGeometry();
      sq.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
      sq.setIndex([0, 1, 2, 0, 2, 3]);
      const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
      V.sp = { MAX, head: 0, dirty: false, P0B: mk(4), VL: mk(4), CW: mk(4), PH: mk(2) };
      for (let i = 0; i < MAX; i++) V.sp.P0B.array[i * 4 + 3] = -1e4;
      sq.setAttribute('aP0B', V.sp.P0B); sq.setAttribute('aVL', V.sp.VL); sq.setAttribute('aColW', V.sp.CW); sq.setAttribute('aPhys', V.sp.PH);
      sq.instanceCount = MAX;
      V.sparkU = { uTime: { value: 0 } };
      const sm = addMat(SPARK_V, SPARK_F, V.sparkU, { key: 'spark', side: THREE.DoubleSide });
      V.sparkU = sm.uniforms;
      const spm = new THREE.Mesh(sq, sm);
      spm.frustumCulled = false; spm.renderOrder = 17;
      S.add(spm); V.sparkMesh = spm;
      // VFX lights
      V.LU = { uCrLP: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -999, 0, 1)) }, uCrLC: { value: [0, 1, 2, 3].map(() => new THREE.Color(0, 0, 0)) } };
      for (let i = 0; i < 4; i++) V.lights.push({ t: 1, dur: 1, x: 0, y: 0, z: 0, r: 8, col: new THREE.Color(), peak: 0 });
      this.patchVfxLitMaterials();
      // camera juice state
      V.kick = new THREE.Vector3(); V.kickV = new THREE.Vector3();
      V.fov = 0; V.fovV = 0; V.fovApplied = 0;
    },

    // ---- ground + grass receive the VFX lights --------------------------------
    patchVfxLitMaterials() {
      const V = this._svx, LU = V.LU;
      const g = this.groundMesh && this.groundMesh.material;
      if (g && !g.userData.crVfx) {
        g.userData.crVfx = true;
        const prev = g.onBeforeCompile;
        const prevKey = g.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey ? prev.toString() : g.customProgramCacheKey();
        g.onBeforeCompile = function (shader, r) {
          prev.call(this, shader, r);
          Object.assign(shader.uniforms, LU);
          const OUT = 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );';
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\n' + VL_PARS)
            .replace(OUT, `outgoingLight += crVfxLight((viewMatrixInverseCR * vec4(-vViewPosition, 1.0)).xyz) * (diffuseColor.rgb * 0.9 + 0.08);\n${OUT}`)
            .replace('uniform vec4 uCrLP[4];', 'uniform vec4 uCrLP[4];\nuniform mat4 viewMatrixInverseCR;');
          shader.uniforms.viewMatrixInverseCR = V.viewInv || (V.viewInv = { value: new THREE.Matrix4() });
        };
        g.customProgramCacheKey = () => prevKey + '|crvfx1';
        g.needsUpdate = true;
      }
      const gm = this.grassMesh && this.grassMesh.material;
      if (gm && !gm.userData.crVfx && gm.vertexShader.indexOf('vAmbPart = albedo * uAmbCol') >= 0) {
        gm.userData.crVfx = true;
        Object.assign(gm.uniforms, LU);
        gm.vertexShader = gm.vertexShader
          .replace('varying vec3 vSunPart;', VL_PARS + '\nvarying vec3 vSunPart;')
          .replace(/(vAmbPart = albedo \* uAmbCol[^;]*;)/, '$1\n      vAmbPart += crVfxLight(world) * (albedo * 0.9 + 0.09) * (0.6 + 0.6 * aH);');
        gm.needsUpdate = true;
      }
    },

    // =========================================================================
    // Primitive emitters
    // =========================================================================
    vfxFlash(pos, size, color, core, dur = 0.26) {
      const V = this._svx; if (!V) return;
      const f = V.flashes.find(x => !x.m.visible) || V.flashes[0];
      f.m.position.copy(pos);
      f.t = 0; f.dur = dur; f.s0 = size * 0.35; f.s1 = size;
      const u = f.m.material.uniforms;
      u.uColor.value.setHex(color); u.uCore.value.setHex(core || 0xffffff); u.uSeed.value = Math.random() * 6.28;
      f.m.visible = true;
    },

    vfxArc(pos, yaw, radius, color, core, opts = {}) {
      const V = this._svx; if (!V) return;
      const a = V.arcs.find(x => !x.m.visible) || V.arcs[0];
      a.m.position.copy(pos);
      a.m.rotation.set(0, 0, 0);
      a.m.rotateY(yaw);
      if (opts.tilt) a.m.rotateZ(opts.tilt);
      a.m.scale.setScalar(radius);
      a.t = 0; a.dur = opts.dur || 0.42;
      const u = a.m.material.uniforms;
      u.uArc.value = opts.arc || 2.4; u.uR0.value = opts.r0 || 0.55;
      u.uDir.value = opts.dir || (Math.random() < 0.5 ? 1 : -1);
      u.uColor.value.setHex(color); u.uCore.value.setHex(core || 0xffffff); u.uSeed.value = Math.random() * 50;
      a.m.visible = true;
    },

    vfxRune(pos, radius, color, core, dur = 0.95) {
      const V = this._svx; if (!V) return;
      const r = V.runes.find(x => !x.m.visible) || V.runes[0];
      r.m.position.set(pos.x, 0, pos.z);
      r.m.scale.setScalar(radius);
      r.t = 0; r.dur = dur; r.spin = Math.random() < 0.5 ? 1 : -1;
      const u = r.m.material.uniforms;
      u.uColor.value.setHex(color); u.uCore.value.setHex(core || 0xffffff); u.uSeed.value = Math.floor(Math.random() * 97);
      r.m.visible = true;
    },

    vfxShock(pos, r1, h, color, core, opts = {}) {
      const V = this._svx; if (!V) return;
      const s = V.shocks.find(x => !x.m.visible) || V.shocks[0];
      s.m.position.copy(pos);
      s.m.quaternion.identity();
      if (opts.axis) s.m.quaternion.setFromUnitVectors(_up, opts.axis);
      s.t = 0; s.dur = opts.dur || 0.45; s.r0 = opts.r0 || r1 * 0.12; s.r1 = r1; s.h = h;
      const u = s.m.material.uniforms;
      u.uColor.value.setHex(color); u.uCore.value.setHex(core || 0xffffff); u.uSeed.value = Math.random() * 40;
      s.m.visible = true;
    },

    vfxPillar(pos, h, r, color, core, delay = 0) {
      const V = this._svx; if (!V) return;
      const p = V.pillars.find(x => !x.m.visible && !x.pending) || V.pillars[0];
      p.m.position.set(pos.x, 0, pos.z);
      p.t = -delay; p.dur = 0.75; p.h = h; p.r = r; p.pending = true;
      const u = p.m.material.uniforms;
      u.uColor.value.setHex(color); u.uCore.value.setHex(core || 0xffffff); u.uSeed.value = Math.random() * 40;
      p.m.scale.set(r, 0.01, r);
    },

    // sparks: o = {dir, cone (0..1 = cos half-angle), speed:[a,b], cols:[hex..], life:[a,b], width, drag, grav, jitter}
    vfxSparks(pos, n, o = {}) {
      const V = this._svx; if (!V) return;
      const S = V.sp;
      n = Math.round(n * (this.gfxQuality === 'low' ? 0.45 : (isTouch ? 0.85 : 1)));
      const cols = (o.cols || [0xffffff]).map(h => col3(h));
      const sp = o.speed || [6, 14], lf = o.life || [0.25, 0.55];
      const cone = o.cone === undefined ? -1 : o.cone;
      for (let i = 0; i < n; i++) {
        const k = S.head; S.head = (S.head + 1) % S.MAX;
        // random direction in a cone around o.dir (or a sphere biased upward)
        let dx, dy, dz;
        for (let tries = 0; tries < 8; tries++) {
          dx = Math.random() * 2 - 1; dy = Math.random() * 2 - 1; dz = Math.random() * 2 - 1;
          const l = Math.hypot(dx, dy, dz); if (l < 0.05 || l > 1) continue;
          dx /= l; dy /= l; dz /= l;
          if (!o.dir) { dy = Math.abs(dy) * (o.upBias || 0.8) + 0.15; break; }
          if (dx * o.dir.x + dy * o.dir.y + dz * o.dir.z >= cone) break;
        }
        const s = rnd(sp[0], sp[1]);
        const j = o.jitter || 0.15;
        const c = cols[(Math.random() * cols.length) | 0];
        S.P0B.array.set([pos.x + (Math.random() - 0.5) * j, pos.y + (Math.random() - 0.5) * j, pos.z + (Math.random() - 0.5) * j, V.t], k * 4);
        S.VL.array.set([dx * s, dy * s, dz * s, rnd(lf[0], lf[1])], k * 4);
        S.CW.array.set([c.r, c.g, c.b, (o.width || 0.05) * rnd(0.6, 1.3)], k * 4);
        S.PH.array.set([o.drag === undefined ? 3.2 : o.drag, o.grav === undefined ? 9 : o.grav], k * 2);
      }
      S.dirty = true;
    },

    vfxLight(pos, radius, color, intensity, dur = 0.45, height = 1.3) {
      const V = this._svx; if (!V) return;
      let L = V.lights.find(l => l.t >= l.dur);
      if (!L) L = V.lights.reduce((a, b) => (a.dur - a.t < b.dur - b.t ? a : b));
      const ty = this.terrainVisualHeight ? this.terrainVisualHeight(pos.x, pos.z) : 0;
      L.x = pos.x; L.y = ty + height; L.z = pos.z; L.r = radius; L.col.setHex(color); L.peak = intensity; L.t = 0; L.dur = dur;
    },

    vfxRibbon(ent, color, core, opts = {}) {
      const V = this._svx; if (!V) return;
      const R = V.ribbons.find(x => !x.active) || V.ribbons[0];
      R.active = true; R.ent = ent; R.follow = opts.follow || 0; R.fade = 1; R.fadeDur = opts.fadeDur || 0.35;
      R.lo = opts.lo === undefined ? 0.2 : opts.lo; R.hi = opts.hi === undefined ? 1.8 : opts.hi;
      R.hist.length = 0;
      if (opts.from && opts.to) {                       // instant moves (dash / blink): lay the sheet along the path
        for (let k = 0; k < R.N; k++) R.hist.push(new THREE.Vector3().lerpVectors(opts.to, opts.from, k / (R.N - 1)));
      } else {
        for (let k = 0; k < R.N; k++) R.hist.push(ent.pos.clone());
      }
      const u = R.m.material.uniforms;
      u.uColor.value.setHex(color); u.uCore.value.setHex(core || 0xffffff); u.uFade.value = 1;
      this.writeRibbon(R);
      R.m.visible = true;
    },

    writeRibbon(R) {
      const arr = R.m.geometry.attributes.position.array;
      for (let k = 0; k < R.N; k++) {
        const p = R.hist[k];
        arr[k * 6] = p.x; arr[k * 6 + 1] = p.y + R.lo; arr[k * 6 + 2] = p.z;
        arr[k * 6 + 3] = p.x; arr[k * 6 + 4] = p.y + R.hi; arr[k * 6 + 5] = p.z;
      }
      R.m.geometry.attributes.position.needsUpdate = true;
    },

    // run a callback after `sec` of game time (pauses with hit-stop)
    vfxLater(sec, fn) { if (this._svx) this._svx.timers.push({ t: sec, fn }); },

    // =========================================================================
    // Camera juice
    // =========================================================================
    cameraKick(fromPos, strength) {
      const V = this._svx; if (!V || !this.camera) return;
      _v.copy(this.camera.position).sub(fromPos); _v.y = 0;
      const d = _v.length();
      if (d < 1e-3) _v.set(0, 0, 1); else _v.divideScalar(d);
      const fall = 1 / (1 + Math.max(0, d - 6) / 10);
      _v.y = -0.55;                                          // push away and down
      V.kickV.addScaledVector(_v, strength * fall);
    },
    fovPunch(deg) { if (this._svx) this._svx.fovV += deg * 32; },

    cameraRig(dt, heroModalOpen) {
      const V = this._svx, cam = this.camera;
      if (V && V.fovApplied) cam.fov -= V.fovApplied;
      orig.cameraRig.call(this, dt, heroModalOpen);
      if (!V) return;
      const sdt = Math.min(dt, 0.05);
      // damped spring (underdamped -> one or two decaying oscillations)
      const K = 240, C = 13;
      V.kickV.addScaledVector(V.kick, -K * sdt).multiplyScalar(Math.max(0, 1 - C * sdt));
      V.kick.addScaledVector(V.kickV, sdt);
      if (V.kick.lengthSq() > 1e-6 || V.kickV.lengthSq() > 1e-6) cam.position.add(V.kick);
      const FK = 170, FC = 15;
      V.fovV += -FK * V.fov * sdt; V.fovV *= Math.max(0, 1 - FC * sdt);
      V.fov += V.fovV * sdt;
      V.fov = Math.max(-3, Math.min(14, V.fov));
      if (Math.abs(V.fov) > 0.01 || V.fovApplied) {
        cam.fov += V.fov; V.fovApplied = V.fov;
        cam.updateProjectionMatrix();
      }
    },

    heavyImpact(pos, power, local) {
      if (!local) return;
      this.cameraKick(pos, 4.6 * power);
      if (this.triggerImpact) this.triggerImpact(0.32 * power, 0);
      // once per cast: bypasses the per-hit freeze throttle so the heavy freeze always lands
      this.hitStopTimer = Math.max(this.hitStopTimer || 0, 0.07);
    },

    // =========================================================================
    // Skill archetypes
    // =========================================================================
    skillColors(ent, slot) {
      const pal = PAL[ent.classId] || PAL.vanguard;
      const el = (SKILL_ELEM[ent.classId] || {})[slot];
      return { core: pal.core, main: pal.main, elem: el ? ELEMC[el] : pal.main };
    },

    fxDashSlash(ent, from, to, C, local, opts = {}) {
      const progressive = ent.leapTimer > 0;
      this.vfxRibbon(ent, C.main, C.core, progressive ? { follow: ent.leapTimer + 0.05 } : { from, to });
      // sparks peel off along the path
      const steps = 5;
      for (let i = 0; i <= steps; i++) {
        _v.lerpVectors(from, to, i / steps); _v.y += 1.0;
        this.vfxSparks(_v, 6, { cols: [C.main, C.elem, C.core], speed: [3, 8], life: [0.2, 0.45], grav: 4, width: 0.04 });
      }
      if (opts.evade) {
        this.vfxFlash(_v2.set(from.x, 1.0, from.z), 2.4, C.elem, C.core, 0.22);
        this.vfxRune(from, 2.4, C.main, C.core, 0.7);
        this.vfxLight(from, 7, C.elem, 1.1, 0.35);
        return;
      }
      const end = progressive ? ent.leapEnd || to : to;
      const fwd = _v2.set(Math.sin(ent.yaw), 0, Math.cos(ent.yaw));
      this.vfxArc(_v.set(end.x, 1.05, end.z), ent.yaw, 3.6, C.main, C.core, { tilt: 0.42, arc: 2.6 });
      this.vfxArc(_v.set(end.x, 0.85, end.z), ent.yaw, 3.0, C.elem, C.core, { tilt: -0.3, arc: 2.0, dur: 0.38 });
      this.vfxFlash(_v.set(end.x, 1.1, end.z), 3.4, C.elem, C.core, 0.26);
      this.vfxSparks(_v.set(end.x, 1.1, end.z), 46, { dir: fwd.clone(), cone: 0.15, cols: [C.core, C.main, C.elem], speed: [8, 19], life: [0.22, 0.5], grav: 6, width: 0.055 });
      this.vfxShock(_v.set(end.x, 0, end.z), 3.4, 0.9, C.elem, C.core, { dur: 0.35 });
      this.vfxLight(end, 9, C.elem, 1.4, 0.4);
      if (local) { this.fovPunch(4); this.cameraKick(end, 1.4); }
    },

    fxGroundSlam(pos, C, scale, local, opts = {}) {
      const p = new THREE.Vector3(pos.x, 0, pos.z);
      this.vfxFlash(_v2.set(p.x, 0.7, p.z), 3.4 * scale, C.elem, C.core, 0.28);
      this.vfxRune(p, 4.3 * scale, C.main, C.core, 1.0);
      this.vfxShock(p, 5.4 * scale, 1.5 * Math.sqrt(scale), C.elem, C.core, { dur: 0.5 });
      this.vfxShock(p, 3.2 * scale, 0.6, C.core, C.core, { dur: 0.3 });
      const n = opts.pillars === undefined ? 6 : opts.pillars;
      const a0 = Math.random() * 6.28;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * 6.28, rr = (1.6 + Math.random() * 1.4) * scale;
        this.vfxPillar(_v2.set(p.x + Math.cos(a) * rr, 0, p.z + Math.sin(a) * rr), rnd(3.0, 5.0) * Math.sqrt(scale), rnd(0.28, 0.45) * Math.sqrt(scale), i % 2 ? C.main : C.elem, C.core, i * 0.035);
      }
      this.vfxPillar(p, 6.0 * Math.sqrt(scale), 0.55 * Math.sqrt(scale), C.elem, C.core, 0);
      this.vfxSparks(_v2.set(p.x, 0.4, p.z), 60 * Math.min(1.6, scale), { dir: new THREE.Vector3(0, 1, 0), cone: 0.25, cols: [C.core, C.main, C.elem], speed: [7, 17], life: [0.35, 0.8], grav: 14, width: 0.06, jitter: 1.2 * scale });
      this.vfxSparks(_v2.set(p.x, 0.25, p.z), 34 * Math.min(1.6, scale), { dir: new THREE.Vector3(0, 0.15, 0).normalize(), cone: -0.2, cols: [C.main, C.elem], speed: [10, 20], life: [0.2, 0.4], grav: 3, drag: 5, width: 0.045 });
      this.vfxLight(p, 12 * scale, C.elem, 1.6, 0.55);
      if (opts.camera !== false) this.heavyImpact(p, Math.min(1.6, scale), local);
      if (local && opts.fov) this.fovPunch(opts.fov);
    },

    fxChargedBurst(ent, dir, C, local, opts = {}) {
      const muzzle = _v.copy(ent.pos).addScaledVector(dir, 0.9); muzzle.y = (ent.pos.y || 0) + 1.2;
      const m = muzzle.clone();
      this.vfxFlash(m, 3.2, C.elem, C.core, 0.24);
      this.vfxShock(m, 2.2, 0.5, C.elem, C.core, { axis: dir.clone().normalize(), dur: 0.3, r0: 0.2 });
      this.vfxShock(m.clone().addScaledVector(dir, 1.2), 1.4, 0.35, C.core, C.core, { axis: dir.clone().normalize(), dur: 0.26, r0: 0.1 });
      this.vfxSparks(m, 54, { dir: dir.clone().normalize(), cone: opts.cone === undefined ? 0.82 : opts.cone, cols: [C.core, C.elem, C.main], speed: [14, 30], life: [0.18, 0.42], grav: 2, drag: 4, width: 0.05 });
      this.vfxSparks(m, 18, { cols: [C.elem], speed: [3, 7], life: [0.3, 0.6], grav: -1.5, width: 0.035 });     // lingering embers
      this.vfxLight(m, 8, C.elem, 1.3, 0.32);
      if (opts.target) {
        this.vfxRune(opts.target, opts.targetR || 4.2, C.main, C.core, 1.1);
        this.vfxLight(opts.target, 10, C.main, 1.0, 0.8, 0.6);
      }
      if (local) {
        this.fovPunch(3);
        // recoil: the camera kicks back along the cast direction
        _v2.copy(ent.pos).addScaledVector(dir, 6);
        this.cameraKick(_v2, 1.1);
      }
    },

    // =========================================================================
    // Hook skills
    // =========================================================================
    useSkill(slot, isRemoteOrAI, actor) {
      const ent = actor || this.player;
      if (!this._svx || slot < 2 || !ent || !ent.pos) return orig.useSkill.apply(this, arguments);
      const from = ent.pos.clone();
      const local = ent === this.player && !isRemoteOrAI;
      const cdBefore = local && this.player.cooldowns ? (this.player.cooldowns[slot] || 0) : 0;
      // aim targets (computed the same way the skill does, before it runs)
      let aim = null;
      try {
        if (ent.classId === 'ranger' && slot === 4) aim = this.getClampedAimPos(ent, 11.5, 6.0);
        else if (ent.classId === 'arcanist' && slot === 2) aim = this.getClampedAimPos(ent, 10.5, 5.5);
      } catch (e) { aim = null; }
      const r = orig.useSkill.apply(this, arguments);
      const cast = local ? (cdBefore <= 0 && (this.player.cooldowns[slot] || 0) > 0) : true;
      if (!cast) return r;
      try { this.playSkillVfx(ent, slot, from, aim, local); } catch (e) { console.warn('[SkillVFX]', e); }
      return r;
    },

    playSkillVfx(ent, slot, from, aim, local) {
      const C = this.skillColors(ent, slot);
      const fwd = new THREE.Vector3(Math.sin(ent.yaw), 0, Math.cos(ent.yaw));
      const cls = ent.classId;
      if (!aim) aim = ent.pos.clone().addScaledVector(fwd, 8);
      if (slot === 5) {
        this.fxGroundSlam(ent.pos, C, 2.1, local, { pillars: 10, fov: 7 });
        return;
      }
      if (cls === 'vanguard') {
        if (slot === 2) { this.fxGroundSlam(ent.pos.clone().addScaledVector(fwd, 2.1), C, 1.1, local, { fov: 5 }); this.vfxArc(_v.set(ent.pos.x, 1.0, ent.pos.z), ent.yaw, 3.4, C.main, C.core, { tilt: 0.9, arc: 2.0 }); }
        else if (slot === 3) this.fxDashSlash(ent, from, ent.pos.clone(), C, local);
        else if (slot === 4) this.fxGroundSlam(ent.pos, C, 1.25, local, { pillars: 8, camera: false });
      } else if (cls === 'ranger') {
        if (slot === 2) this.fxChargedBurst(ent, fwd, C, local, { cone: 0.9 });
        else if (slot === 3) this.fxDashSlash(ent, from, ent.leapEnd ? ent.leapEnd.clone() : ent.pos.clone(), C, local, { evade: true });
        else if (slot === 4) {
          this.fxChargedBurst(ent, new THREE.Vector3(fwd.x * 0.35, 1, fwd.z * 0.35).normalize(), C, local, { target: aim, targetR: 5.2, cone: 0.9 });
          // the volley's three waves land with pillars of light
          [0.14, 0.43, 0.72].forEach((d, i) => this.vfxLater(d, () => this.fxGroundSlam(aim, C, 0.75, local && i === 2, { pillars: 3, camera: i === 2 })));
        }
      } else if (cls === 'arcanist') {
        if (slot === 2) this.fxChargedBurst(ent, fwd, C, local, { target: aim, targetR: 5.0 });
        else if (slot === 3) this.fxDashSlash(ent, from, ent.pos.clone(), C, local);
        else if (slot === 4) this.fxGroundSlam(ent.pos, C, 1.6, local, { pillars: 9, fov: 4 });
      } else if (cls === 'berserker') {
        if (slot === 2) {
          this.fxGroundSlam(ent.pos, C, 1.05, local, { pillars: 4 });
          this.vfxArc(_v.set(ent.pos.x, 0.9, ent.pos.z), ent.yaw, 4.6, C.main, C.core, { arc: 3.1, dir: 1 });
          this.vfxArc(_v.set(ent.pos.x, 1.1, ent.pos.z), ent.yaw + Math.PI, 4.4, C.elem, C.core, { arc: 3.1, dir: 1 });
          [0.24, 0.48].forEach(d => this.vfxLater(d, () => {
            if (ent.dead) return;
            this.vfxArc(_v.set(ent.pos.x, 1.0, ent.pos.z), ent.yaw + Math.random() * 6.28, 4.5, C.main, C.core, { arc: 3.2, dir: 1, dur: 0.32 });
            this.vfxSparks(_v.set(ent.pos.x, 0.8, ent.pos.z), 22, { cols: [C.main, C.elem], speed: [8, 15], life: [0.2, 0.4], grav: 6, upBias: 0.3 });
          }));
        } else if (slot === 3) {
          this.fxDashSlash(ent, from, ent.leapEnd ? ent.leapEnd.clone() : ent.pos.clone(), C, local);
          this.vfxLater(0.36, () => this.fxGroundSlam(ent.pos, C, 1.15, local, { fov: 6 }));
        } else if (slot === 4) this.fxGroundSlam(ent.pos, C, 1.15, local, { pillars: 6, fov: 3 });
      }
    },

    // =========================================================================
    // Enemy rim flash + damage numbers
    // =========================================================================
    upgradeEntityToGLB(entity, modelKey, scale) {
      const r = orig.upgradeEntityToGLB.apply(this, arguments);
      if (entity && entity !== this.player && entity.typeKey && entity.materials) {
        entity.materials.forEach((mat) => {
          if (!mat || mat.userData.hitRim || !mat.isMeshStandardMaterial) return;
          mat.userData.hitRim = { value: new THREE.Vector4(1, 1, 1, 0) };
          const prev = mat.onBeforeCompile;
          const prevKey = mat.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey ? prev.toString() : mat.customProgramCacheKey();
          mat.userData._rimPrev = prev;
          mat.onBeforeCompile = rimHook;
          mat.customProgramCacheKey = () => prevKey + '|crrim1';
          mat.needsUpdate = true;
        });
        entity._hasRim = true;
      }
      return r;
    },

    triggerEntityHitFlash(entity) {
      if (!entity || !entity._hasRim || !this._svx) return orig.triggerEntityHitFlash.call(this, entity);
      const ctx = this._dmgCtx;
      const hex = ctx && ctx.reaction ? ctx.reaction.color : (ctx && ctx.element ? ELEMC[ctx.element] : 0xffffff);
      entity.materials.forEach((mat) => {
        const u = mat.userData.hitRim;
        if (u) { u.value.set(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, 1); }
      });
      entity._rimT = 0.1;
      if (this._svx.rims.indexOf(entity) < 0) this._svx.rims.push(entity);
    },

    applyDamageToMonster(mob, baseDmg, isHeavy) {
      const prev = this._heavyHitCtx;
      this._heavyHitCtx = !!isHeavy;
      try { return orig.applyDamageToMonster.apply(this, arguments); } finally { this._heavyHitCtx = prev; }
    },

    spawnFloatingText(worldPos, text, color, size) {
      const r = orig.spawnFloatingText.apply(this, arguments);
      const pops = this._pops;
      if (!pops || !worldPos) return r;
      let p = null;
      for (let i = 0; i < pops.length; i++) if (pops[i].active && (!p || pops[i].born > p.born)) p = pops[i];
      if (!p) return r;
      // stack simultaneous numbers on the same target into clean lanes
      let n = 0;
      for (let i = 0; i < pops.length; i++) {
        const q = pops[i];
        if (q === p || !q.active || p.born - q.born > 260) continue;
        if (Math.abs(q.wx - p.wx) < 1.3 && Math.abs(q.wz - p.wz) < 1.3) n++;
      }
      if (n) { p.wy += Math.min(n, 4) * 0.45; p.dx *= 0.5; }
      // heavy-skill hits read bigger
      if (this._heavyHitCtx && /^\d/.test(String(text))) { p.size *= 1.2; p.el.style.fontSize = p.size + 'px'; }
      return r;
    },

    // =========================================================================
    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      const V = this._svx;
      if (!V) return;
      V.t += dt;
      const T = V.t;
      if (this.groundMesh && this.groundMesh.material && !this.groundMesh.material.userData.crVfx) this.patchVfxLitMaterials();
      if (this.grassMesh && this.grassMesh.material && !this.grassMesh.material.userData.crVfx) this.patchVfxLitMaterials();
      if (V.viewInv && this.camera) V.viewInv.value.copy(this.camera.matrixWorld);
      // timers
      for (let i = V.timers.length - 1; i >= 0; i--) {
        const tm = V.timers[i];
        tm.t -= dt;
        if (tm.t <= 0) { V.timers.splice(i, 1); try { tm.fn(); } catch (e) { console.warn('[SkillVFX] timer', e); } }
      }
      // flashes
      V.flashes.forEach((f) => {
        if (!f.m.visible) return;
        f.t += dt; const k = f.t / f.dur;
        if (k >= 1) { f.m.visible = false; return; }
        const u = f.m.material.uniforms;
        u.uT.value = k; u.uScale.value = f.s0 + (f.s1 - f.s0) * (1 - Math.pow(1 - Math.min(1, k * 2.5), 3));
      });
      V.arcs.forEach((a) => {
        if (!a.m.visible) return;
        a.t += dt; const k = a.t / a.dur;
        if (k >= 1) { a.m.visible = false; return; }
        const u = a.m.material.uniforms; u.uT.value = k; u.uTime.value = T;
      });
      V.runes.forEach((r) => {
        if (!r.m.visible) return;
        r.t += dt; const k = r.t / r.dur;
        if (k >= 1) { r.m.visible = false; return; }
        const u = r.m.material.uniforms; u.uT.value = k; u.uRot.value = r.spin * (r.t * 1.4 + (1 - Math.exp(-r.t * 6)) * 1.2);
      });
      V.shocks.forEach((s) => {
        if (!s.m.visible) return;
        s.t += dt; const k = s.t / s.dur;
        if (k >= 1) { s.m.visible = false; return; }
        const e = 1 - Math.pow(1 - k, 3);
        const rr = s.r0 + (s.r1 - s.r0) * e;
        s.m.scale.set(rr, s.h * (1 - 0.6 * k), rr);
        const u = s.m.material.uniforms; u.uT.value = k; u.uTime.value = T;
      });
      V.pillars.forEach((p) => {
        if (!p.pending && !p.m.visible) return;
        p.t += dt;
        if (p.t < 0) return;
        if (p.pending) { p.pending = false; p.m.visible = true; }
        const k = p.t / p.dur;
        if (k >= 1) { p.m.visible = false; return; }
        const rise = 1 - Math.pow(1 - Math.min(1, k * 3.2), 3);
        p.m.scale.set(p.r * (1 + 0.5 * k), p.h * rise, p.r * (1 + 0.5 * k));
        const u = p.m.material.uniforms; u.uT.value = k; u.uTime.value = T;
      });
      V.ribbons.forEach((R) => {
        if (!R.active) return;
        R.m.material.uniforms.uTime.value = T;
        if (R.follow > 0 && R.ent) {
          R.follow -= dt;
          const last = R.hist.pop();
          last.copy(R.ent.pos);
          R.hist.unshift(last);
          this.writeRibbon(R);
        } else {
          R.fade -= dt / R.fadeDur;
          R.m.material.uniforms.uFade.value = Math.max(0, R.fade);
          if (R.fade <= 0) { R.active = false; R.m.visible = false; R.ent = null; }
        }
      });
      // sparks
      V.sparkU.uTime.value = T;
      if (V.sp.dirty) {
        V.sp.dirty = false;
        V.sp.P0B.needsUpdate = V.sp.VL.needsUpdate = V.sp.CW.needsUpdate = V.sp.PH.needsUpdate = true;
      }
      // VFX lights
      for (let i = 0; i < 4; i++) {
        const L = V.lights[i];
        const P = V.LU.uCrLP.value[i], Cc = V.LU.uCrLC.value[i];
        if (L.t >= L.dur) { Cc.setRGB(0, 0, 0); P.set(0, -999, 0, 1); continue; }
        L.t += dt;
        const k = Math.min(1, L.t / L.dur);
        const env = L.t < 0.05 ? L.t / 0.05 : Math.pow(1 - k, 1.6);
        const flicker = 0.9 + 0.1 * Math.sin(L.t * 70 + i);
        P.set(L.x, L.y, L.z, L.r);
        Cc.copy(L.col).multiplyScalar(L.peak * env * flicker);
      }
      // enemy rim flashes (0.1 s)
      for (let i = V.rims.length - 1; i >= 0; i--) {
        const e = V.rims[i];
        e._rimT -= dt;
        const a = Math.max(0, e._rimT / 0.1);
        (e.materials || []).forEach((mat) => { const u = mat.userData.hitRim; if (u) u.value.w = a; });
        if (e._rimT <= 0 || e.dead) {
          (e.materials || []).forEach((mat) => { const u = mat.userData.hitRim; if (u) u.value.w = 0; });
          V.rims.splice(i, 1);
        }
      }
    }
  });
})();
