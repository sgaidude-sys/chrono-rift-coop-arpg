// =============================================================================
// CHRONO-RIFT "GENSHIN" LOOK — procedural golden-hour sky with wispy clouds,
// matching sun / hemisphere / fog, HDR bloom + ACES Filmic final pass.
// Zero external assets. Targets Three.js r128 (loaded from CDN in index.html).
// Loaded after mmo_vfx.js and overrides its initEpicVFX / renderFrame.
// =============================================================================
(function () {
  'use strict';
  const GP = ChronoRiftCoOpGame.prototype;

  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const params = new URLSearchParams(location.search);
  const FX_LOW = params.get('fx') === 'low' || (isTouch && Math.min(screen.width, screen.height) < 820);

  // Sun direction shared by the sky disk and the shadow-casting light (golden hour, ~28° up)
  const SUN_DIR = new THREE.Vector3(0.48, 0.47, 0.74).normalize();
  const EXPOSURE = 1.05;
  const DAY_MS = 20 * 60 * 1000;
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const _c1 = new THREE.Color(), _c2 = new THREE.Color();
  const C = {
    noonHorizon: new THREE.Color(0xbfe0ff), sunsetHot: new THREE.Color(0xff7a3c),
    nightHorizon: new THREE.Color(0x1c2850), nightZenith: new THREE.Color(0x060b22), nightCloud: new THREE.Color(0x6a78a8),
    nightFog: new THREE.Color(0x141c36), goldenFog: new THREE.Color(0xf0c090),
    noonSun: new THREE.Color(0xfff3e0), goldenSun: new THREE.Color(0xffb26a), moonLight: new THREE.Color(0x8fa8ff),
    daySkyFill: new THREE.Color(0x9cd2ff), nightSkyFill: new THREE.Color(0x2c3c70),
    dayGroundFill: new THREE.Color(0x8a6a48), nightGroundFill: new THREE.Color(0x1a1a2c),
    goldenRim: new THREE.Color(0xffd9a8), nightRim: new THREE.Color(0x88aaff)
  };
  const pt = new URLSearchParams(location.search).get('time');

  // ---------------------------------------------------------------------------
  // Sky dome: gradient + horizon haze + sun glow/disk (HDR) + procedural clouds
  // ---------------------------------------------------------------------------
  const SKY_VERT = `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_Position = p.xyww; // pin to the far plane
    }`;
  const SKY_FRAG = `
    uniform float uTime;
    uniform vec3 uHorizonColor;
    uniform vec3 uZenithColor;
    uniform vec3 uNebulaColor;
    uniform vec3 uSunDir;
    uniform vec3 uMoonDir;
    uniform vec3 uFogColor;
    uniform float uNight;
    uniform float uDay;
    varying vec3 vDir;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
                 mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float s = 0.0, a = 0.5;
      mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
      return s;
    }

    void main() {
      vec3 dir = normalize(vDir);
      float elev = dir.y;
      float h = clamp(elev, 0.0, 1.0);

      // golden horizon -> azure zenith
      vec3 sky = mix(uHorizonColor, uZenithColor, pow(smoothstep(-0.03, 0.42, h), 0.5));
      // warm haze hugging the horizon, a little deeper below it
      float band = exp(-abs(elev) * 11.0);
      sky = mix(sky, uHorizonColor * 1.1, band * 0.5);
      if (elev < 0.0) sky = mix(sky, uFogColor, smoothstep(0.0, -0.18, elev));

      // sun: broad warm glow + halo + HDR disk (only the disk exceeds 1.0 -> blooms)
      float sd = max(dot(dir, uSunDir), 0.0);
      float sunVis = smoothstep(-0.08, 0.03, uSunDir.y);
      sky += vec3(1.0, 0.72, 0.42) * pow(sd, 12.0) * 0.26 * sunVis;
      sky += vec3(1.0, 0.86, 0.62) * pow(sd, 90.0) * 0.5 * sunVis;
      // luminous sun-side horizon: crosses the bloom threshold for a soft dreamy halo
      sky += vec3(1.0, 0.84, 0.6) * band * pow(sd, 3.0) * 0.55 * sunVis;
      sky += vec3(1.0, 0.95, 0.82) * smoothstep(0.99935, 0.99965, sd) * 5.0 * sunVis * step(-0.02, elev);

      // night: twinkling stars + moon
      float cloudMask = 0.0;
      if (uNight > 0.01 && elev > 0.0) {
        vec3 sp = floor(dir * 260.0);
        float st = hash12(sp.xy + sp.z * 17.3);
        float star = smoothstep(0.9972, 1.0, st) * smoothstep(0.05, 0.35, elev);
        star *= 0.6 + 0.4 * sin(uTime * (1.3 + st * 5.0) + st * 50.0);
        sky += vec3(0.85, 0.92, 1.0) * star * 1.8 * uNight;
      }
      float md = max(dot(dir, uMoonDir), 0.0);
      float moonVis = uNight * step(-0.02, elev);
      sky += vec3(0.55, 0.68, 1.0) * pow(md, 40.0) * 0.22 * moonVis;
      sky += vec3(0.92, 0.95, 1.0) * smoothstep(0.99905, 0.99935, md) * 2.4 * moonVis;

      // soft wispy clouds on a virtual cloud plane
      if (elev > 0.0) {
        vec2 uv = dir.xz / (elev + 0.18);
        vec2 drift = vec2(uTime * 0.0045, uTime * 0.0016);
        float base = fbm(uv * 0.9 + drift);
        float detail = fbm(uv * 2.6 - drift * 1.7 + 5.3);
        float wisps = fbm(vec2(uv.x * 0.6, uv.y * 2.4) + drift * 0.6);
        float d = base * 0.62 + detail * 0.28 + wisps * 0.25;
        float cover = smoothstep(0.64, 0.9, d);
        cover *= smoothstep(0.02, 0.22, elev) * (1.0 - smoothstep(0.85, 1.0, elev) * 0.4);
        float thick = smoothstep(0.72, 1.0, d);
        vec3 lit = mix(vec3(1.0), uNebulaColor, 0.35) * 1.05;
        lit = mix(mix(uZenithColor, vec3(0.45, 0.5, 0.7), 0.5) * 1.6, lit, uDay);   // moonlit clouds at night
        vec3 shade = mix(vec3(0.82, 0.88, 1.0), uZenithColor, 0.22) * mix(0.35, 1.0, uDay);
        vec3 cloud = mix(lit, shade, thick * 0.5);
        cloud += vec3(1.0, 0.78, 0.5) * pow(sd, 8.0) * (0.5 - thick * 0.3) * sunVis; // sun-lit rims
        sky = mix(sky, cloud, cover * 0.92);
      }
      gl_FragColor = vec4(sky, 1.0);
    }`;

  // ---------------------------------------------------------------------------
  // Final pass: exposure -> ACES Filmic (same fit as Three.js) -> anime grade
  // ---------------------------------------------------------------------------
  const FinalShader = {
    uniforms: {
      tDiffuse: { value: null },
      uExposure: { value: EXPOSURE },
      uSat: { value: 1.16 },
      uVignette: { value: 0.22 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uExposure; uniform float uSat; uniform float uVignette;
      varying vec2 vUv;
      vec3 RRTAndODTFit(vec3 v) {
        vec3 a = v * (v + 0.0245786) - 0.000090537;
        vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
        return a / b;
      }
      vec3 ACESFilmic(vec3 color) {
        const mat3 ACESInputMat = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        const mat3 ACESOutputMat = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        color *= uExposure / 0.6;
        color = ACESInputMat * color;
        color = RRTAndODTFit(color);
        color = ACESOutputMat * color;
        return clamp(color, 0.0, 1.0);
      }
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        c = ACESFilmic(c);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat);                                   // vivid, anime-style saturation
        c += vec3(0.025, 0.012, -0.015) * smoothstep(0.5, 1.0, l);   // warm highlights
        c += vec3(-0.01, 0.0, 0.025) * (1.0 - smoothstep(0.0, 0.3, l)); // cool shadows
        vec2 d = vUv - 0.5;
        c *= 1.0 - uVignette * smoothstep(0.3, 0.9, dot(d, d) * 2.2);
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`
  };

  Object.assign(GP, {
    // Replaces mmo_vfx.js's version (called from its initMMOWorld wrapper)
    initEpicVFX() {
      this.fxLow = FX_LOW;
      this._fpsWindow = [];
      if (!this._dotTex) {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.25, 'rgba(255,255,255,0.8)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        this._dotTex = new THREE.CanvasTexture(c);
      }
      if (this.buildZoneParticles) this.buildZoneParticles();
      this.buildGenshinSky();
      this.setupGenshinLighting();
      this.setupHDRPipeline();
      if (pt !== null && !isNaN(parseFloat(pt))) this.setTimeOfDay(parseFloat(pt));
      this.applyDayNight(0);
      if (isTouch) this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    },

    addStarfield() { /* daytime sky: no stars */ },

    buildGenshinSky() {
      const U = this.skyUniforms;
      U.uSunDir = { value: SUN_DIR.clone() };
      U.uMoonDir = { value: SUN_DIR.clone().negate() };
      U.uFogColor = { value: new THREE.Color(window.MMO.ZONES[0].sky.fog) };
      U.uNight = { value: 0 };
      U.uDay = { value: 1 };
      const mat = new THREE.ShaderMaterial({
        uniforms: U,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false
      });
      this.skyDome.material.dispose();
      this.skyDome.material = mat;
      this.skyDome.renderOrder = -1000;
      this.skyDome.frustumCulled = false;
      // start in the town palette
      const s = window.MMO.ZONES[0].sky;
      U.uHorizonColor.value.setHex(s.horizon);
      U.uZenithColor.value.setHex(s.zenith);
      U.uNebulaColor.value.setHex(s.nebula);
      this.scene.background = null;
    },

    setupGenshinLighting() {
      const r = this.renderer;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      // warm golden-hour key light
      const sun = this.sunLight;
      sun.color.setHex(0xffdcb0);
      sun.intensity = 2.15;
      const size = isTouch ? 1024 : 2048; // capped at 2048x2048
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      const d = 38;
      sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
      sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.03;
      this.sunOffset = { x: SUN_DIR.x * 70, y: SUN_DIR.y * 70, z: SUN_DIR.z * 70 };
      this.lastShadowAnchor.set(99999, 0, 99999); // force a re-anchor next frame
      // vibrant sky / ground bounce fill
      this.hemiLight.color.setHex(0x9cd2ff);
      this.hemiLight.groundColor.setHex(0x8a6a48);
      this.hemiLight.intensity = 0.95;
      // exponential distance fog tinted to the horizon haze
      const s = window.MMO.ZONES[0].sky;
      this.scene.fog.color.setHex(s.fog);
      this.scene.fog.density = s.density;
    },

    setupHDRPipeline() {
      this.composer = null;
      this.fxOn = false;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = EXPOSURE;
      if (FX_LOW || !THREE.EffectComposer || !THREE.UnrealBloomPass) return;
      try {
        const w = window.innerWidth, h = window.innerHeight;
        const pr = this.renderer.getPixelRatio();
        const hdr = this.renderer.capabilities.isWebGL2;
        const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, {
          minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
          type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType
        });
        this.composer = new THREE.EffectComposer(this.renderer, rt);
        this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
        // HDR scene: threshold 1.0 means only true highlights (sun disk, spells, emissives) glow
        this.bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(w * 0.5, h * 0.5), 0.55, 0.42, hdr ? 1.15 : 0.94);
        this.composer.addPass(this.bloomPass);
        this.finalPass = new THREE.ShaderPass(FinalShader);
        this.composer.addPass(this.finalPass);
        this.hdrPipeline = hdr;
        this.fxOn = true;
        window.addEventListener('resize', () => {
          if (!this.composer) return;
          this.composer.setSize(window.innerWidth, window.innerHeight);
          this.bloomPass.setSize(window.innerWidth * 0.5, window.innerHeight * 0.5);
        });
      } catch (e) {
        console.warn('[VFX] HDR pipeline unavailable, using direct ACES', e);
        this.composer = null;
        this.fxOn = false;
      }
    },

    // =========================================================================
    // DAY-NIGHT CYCLE — one shared clock (Date.now) so every hero in a room sees
    // the same time of day. 20 real minutes per day. ?time=0..1 or
    // game.setTimeOfDay(t) freezes it (0.25 sunrise, 0.5 noon, 0.75 sunset, 0 midnight).
    // =========================================================================
    setTimeOfDay(t) { this._forcedTime = (t === null || t === undefined) ? undefined : ((t % 1) + 1) % 1; },

    timeOfDay() {
      if (this._forcedTime !== undefined) return this._forcedTime;
      return ((Date.now() / DAY_MS) + 0.27) % 1;
    },

    applyDayNight(dt) {
      if (!this.skyUniforms || !this.skyUniforms.uSunDir || this.cutsceneActive) return;
      const t = this.timeOfDay();
      const a = t * Math.PI * 2 - Math.PI / 2;            // 0.25 -> sunrise, 0.5 -> noon, 0.75 -> sunset
      const sun = _v.set(Math.cos(a) * 0.86, Math.sin(a) * 0.9, 0.42).normalize();
      sun.applyAxisAngle(_up, 0.35);
      const moon = _v2.set(-sun.x * 0.9, -sun.y, -sun.z * 0.6 + 0.25).normalize();
      const sm = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
      const day = sm(-0.1, 0.2, sun.y);
      const night = 1 - sm(-0.2, 0.04, sun.y);
      const golden = (1 - sm(0.06, 0.42, sun.y)) * sm(-0.14, 0.02, sun.y);
      const zs = this.zoneSky || {
        horizon: new THREE.Color(window.MMO.ZONES[0].sky.horizon), zenith: new THREE.Color(window.MMO.ZONES[0].sky.zenith),
        nebula: new THREE.Color(window.MMO.ZONES[0].sky.nebula), fog: new THREE.Color(window.MMO.ZONES[0].sky.fog), density: window.MMO.ZONES[0].sky.density
      };
      const U = this.skyUniforms;
      // horizon: noon pale-blue -> golden-hour zone colour -> deep twilight
      _c1.copy(zs.horizon).lerp(C.noonHorizon, 0.55 * (1 - golden)).lerp(C.sunsetHot, golden * 0.28 * (t > 0.5 ? 1 : 0.5));
      _c2.copy(C.nightHorizon).lerp(zs.horizon, 0.12);
      U.uHorizonColor.value.copy(_c2).lerp(_c1, day);
      _c1.copy(zs.zenith).multiplyScalar(1.04);
      U.uZenithColor.value.copy(C.nightZenith).lerp(_c1, day);
      U.uNebulaColor.value.copy(C.nightCloud).lerp(zs.nebula, day);
      U.uSunDir.value.copy(sun);
      U.uMoonDir.value.copy(moon);
      U.uNight.value = night;
      U.uDay.value = day;
      // fog follows the sky
      _c1.copy(zs.fog).lerp(C.goldenFog, golden * 0.35);
      this.scene.fog.color.copy(C.nightFog).lerp(_c1, day);
      this.scene.fog.density = zs.density * (1 + night * 0.12);
      U.uFogColor.value.copy(this.scene.fog.color);
      // key light: sun by day, cool moonlight by night (re-aimed every ~0.4 s to avoid shadow crawl)
      const sunUp = sun.y > -0.02;
      const keyDir = sunUp ? sun : moon;
      this._dnLightT = (this._dnLightT || 0) + (dt || 0);
      if (!this._keyDir || this._dnLightT > 0.4 || sunUp !== this._keyWasSun) {
        this._dnLightT = 0;
        this._keyWasSun = sunUp;
        this._keyDir = (this._keyDir || new THREE.Vector3()).copy(keyDir);
        this.sunOffset = { x: keyDir.x * 70, y: Math.max(8, keyDir.y * 70), z: keyDir.z * 70 };
        const ty = this._camTerrY || 0;
        this.sunLight.position.set(this.player.pos.x + this.sunOffset.x, this.sunOffset.y + ty, this.player.pos.z + this.sunOffset.z);
        this.sunLight.target.position.set(this.player.pos.x, ty, this.player.pos.z);
        this.sunLight.target.updateMatrixWorld();
        this.lastShadowAnchor.copy(this.player.pos);
      }
      if (sunUp) {
        this.sunLight.color.copy(C.noonSun).lerp(C.goldenSun, golden);
        this.sunLight.intensity = 2.35 * (0.55 + 0.45 * sm(0.0, 0.55, sun.y)) * sm(-0.02, 0.06, sun.y) + 0.0001;
      } else {
        this.sunLight.color.copy(C.moonLight);
        this.sunLight.intensity = 0.55 * sm(-0.02, 0.15, moon.y);
      }
      this.hemiLight.color.copy(C.nightSkyFill).lerp(C.daySkyFill, day);
      this.hemiLight.groundColor.copy(C.nightGroundFill).lerp(C.dayGroundFill, day);
      this.hemiLight.intensity = 0.42 + 0.53 * day;
      const G = this.groundUniforms;
      if (G && G.uRimColor) G.uRimColor.value.copy(C.nightRim).lerp(C.goldenRim, day);
      const exposure = EXPOSURE + night * 0.22;
      if (this.finalPass) this.finalPass.uniforms.uExposure.value = exposure;
      this.renderer.toneMappingExposure = exposure;
      // HUD clock
      const mins = Math.floor(t * 24 * 60);
      const hh = String(Math.floor(mins / 60)).padStart(2, '0'), mm = String(mins % 60).padStart(2, '0');
      this.timeLabel = `${sunUp ? '☀' : '☾'} ${hh}:${mm}`;
    },

    // HDR path: materials render linear (no tone mapping) and the final pass applies ACES.
    // Fallback (phones / slow GPUs): renderer applies ACES directly in each material.
    renderFrame() {
      const r = this.renderer;
      if (this.composer && this.fxOn) {
        if (r.toneMapping !== THREE.NoToneMapping) r.toneMapping = THREE.NoToneMapping;
        this.composer.render();
      } else {
        if (r.toneMapping !== THREE.ACESFilmicToneMapping) {
          r.toneMapping = THREE.ACESFilmicToneMapping;
          r.toneMappingExposure = EXPOSURE;
        }
        r.render(this.scene, this.camera);
      }
    }
  });

  const origUpdate = GP.updateMMOWorld;
  GP.updateMMOWorld = function (dt) {
    origUpdate.call(this, dt);
    this.applyDayNight(dt);
  };
})();
