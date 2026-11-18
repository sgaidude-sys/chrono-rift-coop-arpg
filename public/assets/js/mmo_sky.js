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
      if (elev < 0.0) sky = mix(sky, uHorizonColor * 0.85, smoothstep(0.0, -0.25, elev));

      // sun: broad warm glow + halo + HDR disk (only the disk exceeds 1.0 -> blooms)
      float sd = max(dot(dir, uSunDir), 0.0);
      sky += vec3(1.0, 0.72, 0.42) * pow(sd, 12.0) * 0.26;
      sky += vec3(1.0, 0.86, 0.62) * pow(sd, 90.0) * 0.5;
      sky += vec3(1.0, 0.95, 0.82) * smoothstep(0.99935, 0.99965, sd) * 5.0;

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
        vec3 shade = mix(vec3(0.82, 0.88, 1.0), uZenithColor, 0.22);
        vec3 cloud = mix(lit, shade, thick * 0.5);
        cloud += vec3(1.0, 0.78, 0.5) * pow(sd, 8.0) * (0.5 - thick * 0.3); // sun-lit rims
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
      if (isTouch) this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    },

    addStarfield() { /* daytime sky: no stars */ },

    buildGenshinSky() {
      const U = this.skyUniforms;
      U.uSunDir = { value: SUN_DIR.clone() };
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
        this.bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(w * 0.5, h * 0.5), 0.55, 0.42, hdr ? 1.0 : 0.94);
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
})();
