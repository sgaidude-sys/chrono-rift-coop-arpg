/* =============================================================================
 * Chrono-Rift — environment detail & light
 *  1) Ground micro-relief: two octaves of procedural bumps lit by the real sun
 *     direction (baked into albedo so the cel ramp stays clean), pebble
 *     speckles on dirt / roads, soft cavity darkening; fades out by ~90 m so
 *     there is no distant shimmer.
 *  2) Screen-space sun shafts (god rays): radial blur of the bright sky around
 *     the sun's screen position, added in HDR before bloom. 24 samples on High,
 *     12 on Medium, off on Low. Fades out when the sun is behind the camera or
 *     below the horizon.
 * ============================================================================= */
(function () {
  'use strict';

  const ShaftShader = {
    uniforms: {
      tDiffuse: { value: null },
      uSun: { value: new THREE.Vector2(0.5, 0.5) },
      uSunCol: { value: new THREE.Color(1.0, 0.85, 0.6) },
      uStrength: { value: 0 },
      uAspect: { value: 1.0 }
    },
    defines: { SAMPLES: 24 },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 uSun;
      uniform vec3 uSunCol;
      uniform float uStrength;
      uniform float uAspect;
      varying vec2 vUv;
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        if (uStrength < 0.001) { gl_FragColor = base; return; }
        vec2 toSun = uSun - vUv;
        vec2 stepUv = toSun / float(SAMPLES) * 0.85;
        vec2 uv = vUv;
        float acc = 0.0, w = 1.0;
        for (int i = 0; i < SAMPLES; i++) {
          uv += stepUv;
          vec3 s = texture2D(tDiffuse, uv).rgb;
          float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
          acc += smoothstep(0.9, 1.6, l) * w;     // only the bright sky / sun disk emits rays
          w *= 0.94;
        }
        acc /= float(SAMPLES);
        vec2 d = vec2(toSun.x * uAspect, toSun.y);
        float falloff = 1.0 - smoothstep(0.0, 0.85, length(d));
        gl_FragColor = vec4(base.rgb + uSunCol * acc * falloff * uStrength, base.a);
      }`
  };

  const DETAIL = `
    {
      float camD = length(vTerrW - cameraPosition);
      float detailK = 1.0 - smoothstep(35.0, 90.0, camD);
      if (detailK > 0.0) {
        vec3 sd = normalize(uSunDirG);
        // two octaves of micro bumps, lit by the sun
        const float e = 0.35;
        vec2 p1 = gUv * 1.7, p2 = gUv * 5.3 + 3.1;
        float h0 = gNoise(p1), hx = gNoise(p1 + vec2(e, 0.0)), hz = gNoise(p1 + vec2(0.0, e));
        float k0 = gNoise(p2), kx = gNoise(p2 + vec2(e, 0.0)), kz = gNoise(p2 + vec2(0.0, e));
        vec3 mN = normalize(vec3((h0 - hx) * 1.7 + (k0 - kx) * 0.9, 1.0, (h0 - hz) * 1.7 + (k0 - kz) * 0.9));
        float relief = clamp(dot(mN, sd) / max(0.25, sd.y), 0.62, 1.32);
        col *= mix(1.0, relief, detailK * 0.6 * (1.0 - townPave * 0.6));
        // pebbles & grit on dirt and roads
        vec2 pc = gUv * 2.6;
        vec2 cid = floor(pc), cf = fract(pc) - 0.5;
        vec2 jit = vec2(gHash(cid), gHash(cid + 17.3)) - 0.5;
        float pr = 0.09 + 0.08 * gHash(cid + 41.0);
        float peb = smoothstep(pr, pr * 0.55, length(cf - jit * 0.6));
        float dirtW = clamp(max(low * 0.85, road * 0.95), 0.0, 1.0) * (1.0 - rockW);
        col = mix(col, col * mix(0.72, 1.32, gHash(cid + 5.0)), peb * dirtW * detailK);
        // grass: faint directional brush strokes
        float strokes = gNoise(vec2(gUv.x * 7.0 + gUv.y * 2.0, gUv.y * 1.6));
        col *= mix(1.0, 0.9 + strokes * 0.2, detailK * (1.0 - dirtW) * (1.0 - rockW) * (1.0 - townPave));
      }
      // cavity: low-frequency dips sit a little darker at any distance
      col *= 0.9 + 0.1 * smoothstep(0.2, 0.75, n1);
    }
    diffuseColor.rgb = col * uAlbedoScale;`;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, setGraphicsQuality: GP.setGraphicsQuality };
  const _sp = new THREE.Vector3(), _fw = new THREE.Vector3(), _sd = new THREE.Vector3();

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initRealism(); } catch (e) { console.warn('[Realism] init failed', e); }
    },

    initRealism() {
      // ---- ground micro detail (wraps mmo_terrain's ground shader) ----
      const mat = this.groundMat;
      const U = this.groundUniforms;
      if (mat && U && !mat.userData.detailPatched) {
        mat.userData.detailPatched = true;
        U.uSunDirG = U.uSunDirG || { value: new THREE.Vector3(0.5, 0.6, 0.6) };
        const prev = mat.onBeforeCompile;
        mat.onBeforeCompile = (shader, r) => {
          prev.call(mat, shader, r);
          shader.uniforms.uSunDirG = U.uSunDirG;
          if (shader.fragmentShader.indexOf('diffuseColor.rgb = col * uAlbedoScale;') < 0) return;
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uSunDirG;')
            .replace('diffuseColor.rgb = col * uAlbedoScale;', DETAIL);
        };
        mat.needsUpdate = true;
      }
      // ---- sun shafts: right after the scene render, before bloom ----
      if (this.composer && THREE.ShaderPass) {
        this.shaftPass = new THREE.ShaderPass(ShaftShader);
        this.composer.insertPass ? this.composer.insertPass(this.shaftPass, 1) : this.composer.passes.splice(1, 0, this.shaftPass);
        this.applyShaftQuality();
      }
    },

    applyShaftQuality() {
      if (!this.shaftPass) return;
      const q = this.gfxQuality || 'high';
      const n = q === 'high' ? 24 : 12;
      this.shaftPass.enabled = q !== 'low';
      if (this.shaftPass.material.defines.SAMPLES !== n) {
        this.shaftPass.material.defines.SAMPLES = n;
        this.shaftPass.material.needsUpdate = true;
      }
    },

    setGraphicsQuality(level, silent) {
      const r = orig.setGraphicsQuality ? orig.setGraphicsQuality.call(this, level, silent) : undefined;
      this.applyShaftQuality();
      return r;
    },

    updateRealism() {
      const sl = this.sunLight;
      if (!sl) return;
      // the sky's real sun direction (the key light switches to the moon at night)
      const SU = this.skyUniforms;
      if (SU && SU.uSunDir) _sd.copy(SU.uSunDir.value); else _sd.copy(sl.position).sub(sl.target.position).normalize();
      if (this.groundUniforms && this.groundUniforms.uSunDirG) {
        const g = this.groundUniforms.uSunDirG.value;
        g.copy(sl.position).sub(sl.target.position).normalize();
      }
      const P = this.shaftPass;
      if (!P || !P.enabled) return;
      const cam = this.camera;
      cam.getWorldDirection(_fw);
      const facing = _fw.dot(_sd);
      _sp.copy(cam.position).addScaledVector(_sd, 400).project(cam);
      P.uniforms.uSun.value.set(_sp.x * 0.5 + 0.5, _sp.y * 0.5 + 0.5);
      P.uniforms.uAspect.value = cam.aspect;
      const night = SU && SU.uNight ? SU.uNight.value : 0;
      const sunUp = Math.min(1, Math.max(0, (_sd.y + 0.02) / 0.12));
      // strongest when looking toward a low sun; nothing when it is behind the camera
      const k = Math.max(0, (facing - 0.15) / 0.85) * sunUp * (1 - night);
      P.uniforms.uStrength.value = 0.55 * k * (1.0 + 0.6 * (1 - Math.min(1, _sd.y / 0.5)));
      P.uniforms.uSunCol.value.copy(sl.color);
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      this.updateRealism();
    }
  });
})();
