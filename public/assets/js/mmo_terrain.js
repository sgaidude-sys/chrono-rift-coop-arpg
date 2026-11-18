// =============================================================================
// CHRONO-RIFT STYLIZED TERRAIN (Three.js r128)
// - Heights come from the shared, pure-math getTerrainHeight() in world_core.js,
//   baked into a float heightmap (+ normals) for the GPU.
// - Gameplay stays in flat logical coordinates (y = height above ground), so
//   movement, AI, networking and world coordinates are unchanged. Every material's
//   vertex stage lifts geometry onto the terrain via a TERRAIN_DISPLACE hook in
//   r128's project_vertex / worldpos_vertex / sprite chunks, so heroes, monsters,
//   props, VFX, nameplates and shadows all sit on the same ground — nobody floats.
// - Ground: MeshToonMaterial (3-band cel shading, real shadows) patched with
//   onBeforeCompile for rim light and procedural grass / dirt / cliff-rock blending.
// No external textures. Must load before the game is constructed.
// =============================================================================
(function () {
  'use strict';
  const M = window.MMO;
  const W = M.WORLD;

  // ---------------------------------------------------------------------------
  // 1) Global vertex hook (all built-in materials, incl. shadow depth + sprites)
  // ---------------------------------------------------------------------------
  const TU = {
    uTerrMap: { value: null },
    uTerrOn: { value: 0 },
    uTerrHalf: { value: W.half },
    uTerrN: { value: 768 }
  };
  const TERRAIN_GLSL = `
    uniform sampler2D uTerrMap;
    uniform float uTerrOn;
    uniform float uTerrHalf;
    uniform float uTerrN;
    vec4 terrSample(vec2 xz) {
      vec2 g = (xz / (2.0 * uTerrHalf) + 0.5) * uTerrN - 0.5;
      vec2 i0 = floor(g);
      vec2 f = g - i0;
      float inv = 1.0 / uTerrN;
      vec2 c = (i0 + 0.5) * inv;
      vec4 a = texture2D(uTerrMap, c);
      vec4 b = texture2D(uTerrMap, c + vec2(inv, 0.0));
      vec4 d = texture2D(uTerrMap, c + vec2(0.0, inv));
      vec4 e = texture2D(uTerrMap, c + vec2(inv, inv));
      return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
    }
    float terrainHeightAt(vec2 xz) { return uTerrOn > 0.5 ? terrSample(xz).r : 0.0; }
  `;

  const SC = THREE.ShaderChunk;
  SC.project_vertex = `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
#ifdef TERRAIN_DISPLACE
	vec4 terrW = modelMatrix * mvPosition;
	terrW.y += terrainHeightAt( terrW.xz );
	mvPosition = viewMatrix * terrW;
#else
	mvPosition = modelViewMatrix * mvPosition;
#endif
gl_Position = projectionMatrix * mvPosition;`;
  SC.worldpos_vertex += `
#if defined( TERRAIN_DISPLACE ) && ( defined( USE_ENVMAP ) || defined( DISTANCE ) || defined( USE_SHADOWMAP ) )
	worldPosition.y += terrainHeightAt( worldPosition.xz );
#endif`;
  const SPRITE_FROM = 'vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );';
  const SPRITE_TO = `#ifdef TERRAIN_DISPLACE
	vec4 terrC = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
	terrC.y += terrainHeightAt( terrC.xz );
	vec4 mvPosition = viewMatrix * terrC;
#else
	vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
#endif`;
  SC.sprite_vert = SC.sprite_vert.replace(SPRITE_FROM, SPRITE_TO);
  if (THREE.ShaderLib.sprite) THREE.ShaderLib.sprite.vertexShader = THREE.ShaderLib.sprite.vertexShader.replace(SPRITE_FROM, SPRITE_TO);

  function injectTerrain(shader, mat) {
    if (mat && (mat.isRawShaderMaterial || (mat.userData && mat.userData.noTerrain))) return;
    if (!shader.vertexShader || shader.vertexShader.indexOf('#include <common>') < 0) return;
    if (shader.vertexShader.indexOf('TERRAIN_DISPLACE') >= 0) return;
    shader.vertexShader = '#define TERRAIN_DISPLACE\n' + shader.vertexShader.replace('#include <common>', '#include <common>\n' + TERRAIN_GLSL);
    Object.assign(shader.uniforms, TU);
  }
  // Default hook for every material that doesn't define its own onBeforeCompile
  // (custom ones in this project chain to the previous hook, which is this one).
  THREE.Material.prototype.onBeforeCompile = function terrainInject(shader) { injectTerrain(shader, this); };
  window.injectTerrain = injectTerrain;
  window.TERRAIN_GLSL = TERRAIN_GLSL;
  window.TERRAIN_UNIFORMS = TU;

  // Culling: bounding spheres live in logical (flat) space; lift them onto the terrain
  const _sph = new THREE.Sphere();
  THREE.Frustum.prototype.intersectsObject = function (object) {
    const g = object.geometry;
    if (g.boundingSphere === null) g.computeBoundingSphere();
    _sph.copy(g.boundingSphere).applyMatrix4(object.matrixWorld);
    if (window.__terrainH) { _sph.center.y += window.__terrainH(_sph.center.x, _sph.center.z); _sph.radius += 1.5; }
    return this.intersectsSphere(_sph);
  };
  const origSprite = THREE.Frustum.prototype.intersectsSprite;
  THREE.Frustum.prototype.intersectsSprite = function (sprite) {
    if (!window.__terrainH) return origSprite.call(this, sprite);
    _sph.center.set(0, 0, 0);
    _sph.radius = 0.7071067811865476 + 1.5;
    _sph.applyMatrix4(sprite.matrixWorld);
    _sph.center.y += window.__terrainH(_sph.center.x, _sph.center.z);
    return this.intersectsSphere(_sph);
  };

  // ---------------------------------------------------------------------------
  // 2) Ground material: 3-band toon + rim + procedural biome blending
  // ---------------------------------------------------------------------------
  const GROUND_VERT_PARS = `
    varying vec3 vTerrW;
    varying vec3 vTerrN;
  `;
  const GROUND_FRAG_PARS = `
    uniform float uTime;
    uniform vec3 uPlayerPos;
    uniform float uWorldHalf;
    uniform sampler2D uCtrlA;
    uniform sampler2D uCtrlB;
    uniform vec4 uArenas[12];
    uniform vec3 uRimColor;
    uniform float uRimStrength;
    uniform float uAlbedoScale;
    varying vec3 vTerrW;
    varying vec3 vTerrN;
    float gHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float gNoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
  `;
  const GROUND_ALBEDO = `
    vec2 gUv = vTerrW.xz;
    vec2 cUv = gUv / (2.0 * uWorldHalf) + 0.5;
    vec4 ca = texture2D(uCtrlA, cUv);
    vec4 cb = texture2D(uCtrlB, cUv);
    vec3 zoneTint = ca.rgb * 1.6;
    float n1 = gNoise(gUv * 0.045);
    float n2 = gNoise(gUv * 0.37 + 7.1);
    float n3 = gNoise(gUv * 2.1 - 3.7);
    float terrH = vTerrW.y;

    // flat ground per zone (weights from the generated control map)
    vec3 grassC = mix(vec3(0.16, 0.52, 0.21), vec3(0.34, 0.70, 0.24), clamp(n1 * 0.75 + n2 * 0.35, 0.0, 1.0));
    vec3 stoneC = mix(vec3(0.34, 0.36, 0.36), vec3(0.46, 0.46, 0.43), n2);
    vec3 scifiC = mix(vec3(0.30, 0.36, 0.52), vec3(0.42, 0.50, 0.66), n2);
    vec3 sandC  = mix(vec3(0.86, 0.71, 0.48), vec3(0.95, 0.82, 0.58), n1);
    float wsum = cb.r + cb.g + cb.b + cb.a + 0.0001;
    vec3 flatC = (grassC * cb.r + stoneC * cb.g + scifiC * cb.b + sandC * cb.a) / wsum;
    flatC *= mix(vec3(1.0), zoneTint, 0.85);

    // warm dirt in low areas and along roads
    vec3 dirtC = mix(vec3(0.46, 0.30, 0.16), vec3(0.58, 0.41, 0.23), n2) * (0.9 + n3 * 0.16);
    float low = smoothstep(-1.2, -4.8, terrH + (n2 - 0.5) * 1.2);
    float road = smoothstep(0.3, 0.75, ca.a + (n3 - 0.5) * 0.25);

    // faceted grey-brown cliff rock on steep slopes
    float slope = 1.0 - clamp(vTerrN.y, 0.0, 1.0);
    rockW = smoothstep(0.15, 0.29, slope + (n2 - 0.5) * 0.07);
    rockW = max(rockW, smoothstep(17.0, 28.0, terrH + (n1 - 0.5) * 6.0) * 0.85); // border mountains read as cliffs
    vec3 rockC = mix(vec3(0.27, 0.23, 0.20), vec3(0.40, 0.35, 0.29), n2);
    rockC *= 0.84 + 0.16 * sin(terrH * 1.6 + n1 * 4.0);   // strata bands

    vec3 col = mix(flatC, dirtC, max(low * 0.85, road * 0.95));
    col = mix(col, rockC, rockW);
    // pale sand beach at the waterline, darker wet sand + lake bed below it
    float wl = ${(W.waterLevel !== undefined ? W.waterLevel : -2.0).toFixed(2)};
    float beach = smoothstep(wl + 0.95, wl + 0.2, terrH + (n2 - 0.5) * 0.5) * (1.0 - rockW);
    col = mix(col, mix(vec3(0.80, 0.70, 0.50), vec3(0.90, 0.80, 0.60), n1), beach * 0.85);
    col *= 1.0 - smoothstep(wl + 0.15, wl - 0.35, terrH) * 0.38;
    float snow = smoothstep(40.0, 48.0, terrH + n1 * 4.0) * (1.0 - rockW * 0.4);   // only the tallest peaks
    col = mix(col, vec3(0.93, 0.95, 1.0), snow);
    col *= 0.94 + n3 * 0.12;

    // Ashenvale Bastion plaza: procedural flagstones + carved rune rings
    float dPlaza = length(gUv - vec2(0.0, 9.5));
    float roadNS = smoothstep(3.8, 2.2, abs(gUv.x)) * smoothstep(-60.0, -44.0, gUv.y) * smoothstep(60.0, 40.0, gUv.y);
    float roadEW = smoothstep(3.5, 2.0, abs(gUv.y - 9.5)) * smoothstep(-28.0, -21.0, gUv.x) * smoothstep(28.0, 21.0, gUv.x);
    float townPave = clamp(smoothstep(13.2, 10.6, dPlaza) + roadNS + roadEW, 0.0, 1.0);
    vec2 fq = gUv * 0.62;
    fq.x += mod(floor(fq.y), 2.0) * 0.5;
    vec2 fid = floor(fq), ff = fract(fq);
    float grout = smoothstep(0.0, 0.07, min(min(ff.x, 1.0 - ff.x), min(ff.y, 1.0 - ff.y)));
    vec3 flag = mix(vec3(0.60, 0.56, 0.50), vec3(0.74, 0.69, 0.60), gHash(fid)) * mix(0.72, 1.0, grout);
    flag = mix(flag, vec3(0.70, 0.66, 0.58), clamp(smoothstep(0.55, 0.08, abs(dPlaza - 11.4)) * 0.65 + smoothstep(0.36, 0.05, abs(dPlaza - 7.4)) * 0.55, 0.0, 0.75));
    float townW = smoothstep(70.0, 48.0, length(gUv));
    col = mix(col, flag, smoothstep(0.26, 0.76, townPave) * townW);

    lavaW = smoothstep(0.08, 0.16, ca.r - ca.g) * smoothstep(0.32, 0.22, ca.g);
    // albedo calibrated for the HDR sun + sky fill so ACES keeps colours saturated (not washed out)
    diffuseColor.rgb = col * uAlbedoScale;
  `;
  const GROUND_EMISSIVE = `
    float dSanct = length(gUv - vec2(0.0, 8.0));
    totalEmissiveRadiance += vec3(0.92, 0.68, 0.22) * (smoothstep(0.2, 0.0, abs(dSanct - 7.4)) + smoothstep(0.13, 0.0, abs(dSanct - 4.2))) * 0.42;
    for (int k = 0; k < 12; k++) {
      vec4 ar = uArenas[k];
      float dA = length(gUv - ar.xy);
      float ringA = smoothstep(0.35, 0.0, abs(dA - ar.z)) + smoothstep(0.25, 0.0, abs(dA - ar.z * 0.55)) * 0.7;
      totalEmissiveRadiance += mix(vec3(1.0, 0.3, 0.22), vec3(0.85, 0.3, 1.0), ar.w) * ringA * (0.55 + 0.25 * sin(uTime * 2.0 + float(k)));
    }
    float cracks = smoothstep(0.62, 0.95, gNoise(gUv * 0.9 + vec2(uTime * 0.05, 0.0)));
    totalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * lavaW * cracks * (0.7 + 0.3 * sin(uTime * 1.7 + gUv.x * 0.1));
    float dPlr = length(gUv - uPlayerPos.xz);
    float torchGlow = max(0.0, 1.0 - dPlr * 0.075);
    totalEmissiveRadiance += vec3(0.05, 0.034, 0.014) * torchGlow * torchGlow;
  `;

  function makeGradientMap() {
    // 3 cel bands: shadow / mid / lit
    const data = new Uint8Array([66, 66, 70, 255, 116, 116, 116, 255, 158, 156, 150, 255]);
    const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }

  // ---------------------------------------------------------------------------
  // 3) Game integration
  // ---------------------------------------------------------------------------
  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld,
    updateMMOWorld: GP.updateMMOWorld,
    updateMouseWorld: GP.updateMouseWorld,
    spawnFloatingText: GP.spawnFloatingText
  };

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      this.initTerrain();
    },

    initTerrain() {
      const N = this.terrainN, H = this.terrainHeights;
      if (!H) return;
      const half = W.half;
      const cell = (2 * half) / N;
      // RGBA float: height, -dh/dx, -dh/dz (normal components), 1
      const data = new Float32Array(N * N * 4);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const h = H[j * N + i];
          const hl = H[j * N + Math.max(0, i - 1)], hr = H[j * N + Math.min(N - 1, i + 1)];
          const hd = H[Math.max(0, j - 1) * N + i], hu = H[Math.min(N - 1, j + 1) * N + i];
          const o = (j * N + i) * 4;
          data[o] = h;
          data[o + 1] = -(hr - hl) / (2 * cell);
          data[o + 2] = -(hu - hd) / (2 * cell);
          data[o + 3] = 1;
        }
      }
      const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType);
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      TU.uTerrMap.value = tex;
      TU.uTerrN.value = N;
      TU.uTerrHalf.value = half;
      TU.uTerrOn.value = 1;
      this.terrainTex = tex;
      // exact CPU mirror of the GPU sampling (camera, aiming, culling, text)
      window.__terrainH = (x, z) => this.terrainVisualHeight(x, z);
      // shared pure-math helper (same seed + layout as every other client / a server)
      window.getTerrainHeight = (x, z) => this.worldGen.terrainHeight(x, z);
      this.buildTerrainGround();
    },

    // Bilinear sample of the baked grid — identical to terrSample() in the shader.
    terrainVisualHeight(x, z) {
      const H = this.terrainHeights;
      if (!H) return 0;
      const N = this.terrainN, half = W.half;
      let gx = (x / (2 * half) + 0.5) * N - 0.5;
      let gz = (z / (2 * half) + 0.5) * N - 0.5;
      const ix = Math.floor(gx), iz = Math.floor(gz);
      const fx = gx - ix, fz = gz - iz;
      const cx = (v) => Math.max(0, Math.min(N - 1, v));
      const x0 = cx(ix), x1 = cx(ix + 1), z0 = cx(iz), z1 = cx(iz + 1);
      const a = H[z0 * N + x0], b = H[z0 * N + x1], c = H[z1 * N + x0], d = H[z1 * N + x1];
      return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
    },

    buildTerrainGround() {
      const SIZE = 1100, SEG = 300;
      this._groundStep = SIZE / SEG;
      const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
      geo.rotateX(-Math.PI / 2);
      const U = this.groundUniforms;
      U.uRimColor = U.uRimColor || { value: new THREE.Color(0xffd9a8) };
      U.uRimStrength = U.uRimStrength || { value: 0.22 };
      U.uAlbedoScale = U.uAlbedoScale || { value: 0.5 };
      const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: makeGradientMap() });
      mat.extensions = { derivatives: true };
      mat.onBeforeCompile = (shader) => {
        injectTerrain(shader, mat);
        Object.assign(shader.uniforms, U);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\n' + GROUND_VERT_PARS)
          .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
            vec4 terrSmp = terrSample((modelMatrix * vec4(position, 1.0)).xz);
            objectNormal = normalize(vec3(terrSmp.g, 1.0, terrSmp.b));
            vTerrN = objectNormal;`)
          .replace('#include <project_vertex>', '#include <project_vertex>\n            vTerrW = terrW.xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\n' + GROUND_FRAG_PARS)
          .replace('#include <color_fragment>', '#include <color_fragment>\n float rockW = 0.0; float lavaW = 0.0;\n' + GROUND_ALBEDO)
          .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
            vec3 facetW = normalize(cross(dFdx(vTerrW), dFdy(vTerrW)));
            if (facetW.y < 0.0) facetW = -facetW;
            vec3 facetV = normalize((viewMatrix * vec4(facetW, 0.0)).xyz);
            normal = normalize(mix(normal, facetV, rockW * 0.85));`)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GROUND_EMISSIVE)
          .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', `
            float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
            outgoingLight += uRimColor * rimF * uRimStrength * (1.0 - rockW * 0.4);
            gl_FragColor = vec4( outgoingLight, diffuseColor.a );`);
      };
      const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      this.groundMesh.geometry.dispose();
      this.groundMesh.material.dispose();
      this.groundMesh.geometry = geo;
      this.groundMesh.material = mat;
      this.groundMesh.frustumCulled = false;
      this.groundMesh.receiveShadow = true;
      this.groundMesh.castShadow = !isTouch; // hills cast shadows on desktop
      this.groundMat = mat;
      this.updateTerrainGround(true);
    },

    // The ground grid follows the hero, snapped to whole cells so vertices never "swim"
    updateTerrainGround() {
      if (!this.groundMesh || !this._groundStep) return;
      const s = this._groundStep * 2;
      this.groundMesh.position.set(Math.round(this.player.pos.x / s) * s, 0, Math.round(this.player.pos.z / s) * s);
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      this.updateTerrainGround();
    },

    updateMouseWorld() {
      // aim against the ground plane at the hero's terrain height, keep logical y = 0
      const h = this.terrainVisualHeight ? this.terrainVisualHeight(this.player.pos.x, this.player.pos.z) : 0;
      this.groundPlane.constant = -h;
      orig.updateMouseWorld.call(this);
      this.groundPlane.constant = 0;
      this.mouseWorld.y = 0;
    },

    spawnFloatingText(worldPos, text, color, size) {
      const p = worldPos.clone();
      if (this.terrainVisualHeight) p.y += this.terrainVisualHeight(p.x, p.z);
      return orig.spawnFloatingText.call(this, p, text, color, size);
    }
  });
})();
