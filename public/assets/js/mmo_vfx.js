// =============================================================================
// CHRONO-RIFT EPIC VFX — bloom + cinematic grade, zone atmosphere particles,
// elite/boss auras, level-up light pillars, loot glows, starfield sky.
// Adaptive: bloom is skipped on phones / slow GPUs (or ?fx=low).
// =============================================================================
(function () {
  'use strict';
  const GP = ChronoRiftCoOpGame.prototype;
  const origInit = GP.initMMOWorld;
  const origUpdate = GP.updateMMOWorld;
  const origUpgrade = GP.upgradeEntityToGLB;
  const origGainXP = GP.gainXP;
  const origSpawnItemDrop = GP.spawnItemDrop;

  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const params = new URLSearchParams(location.search);
  const FX_LOW = params.get('fx') === 'low' || (isTouch && Math.min(screen.width, screen.height) < 820);

  // Cinematic grade: contrast, saturation, warm highlights / cool shadows, vignette
  const GradeShader = {
    uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.32 }, uSat: { value: 1.12 }, uContrast: { value: 1.06 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uVignette; uniform float uSat; uniform float uContrast; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 col = c.rgb;
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), col, uSat);
        col = (col - 0.5) * uContrast + 0.5;
        col += vec3(0.035, 0.018, -0.02) * smoothstep(0.45, 1.0, l);
        col += vec3(-0.012, 0.0, 0.03) * (1.0 - smoothstep(0.0, 0.35, l));
        vec2 d = vUv - 0.5;
        col *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
      }`
  };

  const ZONE_PARTICLES = {
    town: { color: 0xffd06b, size: 0.32, count: 160, vy: 0.25, drift: 0.35, twinkle: 1 },
    meadows: { color: 0xd8ff7a, size: 0.3, count: 220, vy: 0.12, drift: 0.5, twinkle: 1 },
    whisperwood: { color: 0x9dff6b, size: 0.34, count: 260, vy: 0.08, drift: 0.6, twinkle: 1 },
    catacombs: { color: 0x5effc2, size: 0.38, count: 220, vy: 0.45, drift: 0.2, twinkle: 0.6 },
    badlands: { color: 0xe8b47a, size: 0.22, count: 320, vy: -0.05, drift: 2.6, twinkle: 0 },
    frostpeak: { color: 0xffffff, size: 0.3, count: 520, vy: -2.2, drift: 0.7, twinkle: 0 },
    breach: { color: 0x6ff0ff, size: 0.32, count: 260, vy: 0.6, drift: 0.3, twinkle: 1 },
    infernal: { color: 0xff7a2a, size: 0.34, count: 360, vy: 1.6, drift: 0.6, twinkle: 0.7 },
    citadel: { color: 0xd28bff, size: 0.34, count: 280, vy: 0.5, drift: 0.4, twinkle: 1 }
  };

  function softDotTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  Object.assign(GP, {
    initMMOWorld() {
      origInit.call(this);
      this.initEpicVFX();
    },

    initEpicVFX() {
      this.fxLow = FX_LOW;
      this._dotTex = softDotTexture();
      this.buildZoneParticles();
      this.addStarfield();
      if (!FX_LOW && THREE.EffectComposer && THREE.UnrealBloomPass) {
        try {
          const w = window.innerWidth, h = window.innerHeight;
          this.composer = new THREE.EffectComposer(this.renderer);
          this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
          this.bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(w * 0.5, h * 0.5), 0.62, 0.42, 0.78);
          this.composer.addPass(this.bloomPass);
          this.gradePass = new THREE.ShaderPass(GradeShader);
          this.composer.addPass(this.gradePass);
          this.fxOn = true;
          window.addEventListener('resize', () => {
            if (!this.composer) return;
            this.composer.setSize(window.innerWidth, window.innerHeight);
            this.bloomPass.setSize(window.innerWidth * 0.5, window.innerHeight * 0.5);
          });
        } catch (e) {
          console.warn('[VFX] bloom unavailable', e);
          this.composer = null;
        }
      }
      if (isTouch) this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
      this._fpsWindow = [];
    },

    renderFrame() {
      if (this.composer && this.fxOn) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    },

    // Auto-disable bloom if the device can't keep up
    adaptiveFX(dt) {
      if (!this.composer || !this.fxOn) return;
      this._fpsWindow.push(dt);
      if (this._fpsWindow.length < 180) return;
      const avg = this._fpsWindow.reduce((a, b) => a + b, 0) / this._fpsWindow.length;
      this._fpsWindow.length = 0;
      if (avg > 1 / 34) {
        this.fxOn = false;
        console.info('[VFX] low frame rate — bloom disabled');
      }
    },

    // ---- starfield on the existing sky dome -----------------------------------
    addStarfield() {
      const mat = this.skyDome && this.skyDome.material;
      if (!mat || !mat.fragmentShader || mat.fragmentShader.includes('starHash')) return;
      mat.fragmentShader = mat.fragmentShader
        .replace('void main() {', `float starHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
            void main() {`)
        .replace('gl_FragColor = vec4(sky, 1.0);', `
              vec3 sp = floor(dir * 220.0);
              float st = starHash(sp);
              float star = smoothstep(0.9965, 1.0, st) * smoothstep(0.12, 0.45, elev);
              star *= 0.6 + 0.4 * sin(uTime * (1.5 + st * 4.0) + st * 40.0);
              sky += vec3(0.9, 0.95, 1.0) * star * 1.6;
              gl_FragColor = vec4(sky, 1.0);`);
      mat.needsUpdate = true;
    },

    // ---- zone atmosphere particles (follow the hero, wrap inside a box) ----------
    buildZoneParticles() {
      const N = 520;
      const pos = new Float32Array(N * 3);
      const seed = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 70;
        pos[i * 3 + 1] = Math.random() * 18;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
        seed[i] = Math.random();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        map: this._dotTex, color: 0xffffff, size: 0.3, transparent: true, opacity: 0.9,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      this.scene.add(pts);
      this.zoneParticles = { pts, geo, mat, seed, N, cfg: ZONE_PARTICLES.town, key: 'town' };
    },

    updateZoneParticles(dt) {
      const zp = this.zoneParticles;
      if (!zp) return;
      const key = this._mmoZoneKey || 'town';
      if (key !== zp.key) {
        zp.key = key;
        zp.cfg = ZONE_PARTICLES[key] || ZONE_PARTICLES.meadows;
        zp.mat.color.setHex(zp.cfg.color);
        zp.mat.size = zp.cfg.size;
      }
      const c = zp.cfg;
      const n = Math.min(zp.N, this.fxLow ? Math.round(c.count * 0.5) : c.count);
      zp.geo.setDrawRange(0, n);
      const arr = zp.geo.attributes.position.array;
      const t = this.clock.getElapsedTime();
      const px = this.player.pos.x, pz = this.player.pos.z;
      zp.pts.position.set(0, 0, 0);
      for (let i = 0; i < n; i++) {
        const s = zp.seed[i];
        const o = i * 3;
        arr[o] += (Math.sin(t * 0.6 + s * 40) * c.drift + (c.drift > 2 ? c.drift : 0)) * dt;
        arr[o + 1] += c.vy * (0.6 + s * 0.8) * dt;
        arr[o + 2] += Math.cos(t * 0.5 + s * 30) * c.drift * 0.6 * dt;
        // wrap around the hero
        let dx = arr[o] - px, dz = arr[o + 2] - pz;
        if (dx > 35) arr[o] -= 70; else if (dx < -35) arr[o] += 70;
        if (dz > 35) arr[o + 2] -= 70; else if (dz < -35) arr[o + 2] += 70;
        if (arr[o + 1] > 18) arr[o + 1] = 0.2; else if (arr[o + 1] < 0.1) arr[o + 1] = 17.5;
      }
      zp.geo.attributes.position.needsUpdate = true;
      if (c.twinkle) zp.mat.opacity = 0.7 + 0.25 * Math.sin(t * 2.3);
      else zp.mat.opacity = 0.85;
    },

    // ---- elite / boss auras ---------------------------------------------------
    upgradeEntityToGLB(entity, modelKey, scale) {
      origUpgrade.call(this, entity, modelKey, scale);
      if (!entity.typeKey || !(entity.isElite || entity.isBoss) || !entity.meshRoot) return;
      const R = entity.isWorldBoss ? 7.5 : (entity.isBoss ? 5 : 1.8);
      const col = entity.isWorldBoss ? 0xc84bff : (entity.isBoss ? 0xff3b3b : 0xffc34a);
      const g = new THREE.RingGeometry(R * 0.82, R, 48);
      g.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.position.y = 0.05;
      const g2 = new THREE.RingGeometry(R * 0.5, R * 0.56, 6);
      g2.rotateX(-Math.PI / 2);
      const rune = new THREE.Mesh(g2, ring.material.clone());
      rune.material.opacity = 0.45;
      rune.position.y = 0.06;
      entity.meshRoot.add(ring, rune);
      entity._aura = { ring, rune };
    },

    updateAuras(dt) {
      const t = this.clock.getElapsedTime();
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (!m._aura) continue;
        const a = m._aura;
        a.ring.visible = a.rune.visible = !m.dead;
        a.rune.rotation.y += dt * (m.enraged ? 2.4 : 0.8);
        a.ring.material.opacity = 0.35 + 0.25 * Math.sin(t * (m.enraged ? 7 : 2.5) + i);
        if (m.enraged) a.ring.material.color.setHex(0xff1a1a);
      }
    },

    // ---- level-up light pillar ----------------------------------------------------
    gainXP(amount, showText) {
      const before = this.player.level;
      origGainXP.call(this, amount, showText);
      if (this.player.level > before) this.spawnLightPillar(this.player.pos, 0xffe08a, 3.2);
    },

    spawnLightPillar(pos, color, dur = 2.5, radius = 1.6, height = 26) {
      const geo = new THREE.CylinderGeometry(radius, radius * 1.4, height, 24, 1, true);
      geo.translate(0, height / 2, 0);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(pos.x, 0, pos.z);
      this.scene.add(m);
      const ringG = new THREE.RingGeometry(0.2, 1.0, 48); ringG.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.position.set(pos.x, 0.1, pos.z);
      this.scene.add(ring);
      this._pillars = this._pillars || [];
      this._pillars.push({ m, ring, t: 0, dur });
    },

    updatePillars(dt) {
      if (!this._pillars) return;
      for (let i = this._pillars.length - 1; i >= 0; i--) {
        const p = this._pillars[i];
        p.t += dt;
        const k = p.t / p.dur;
        p.m.material.opacity = k < 0.15 ? k / 0.15 * 0.32 : Math.max(0, 0.32 * (1 - (k - 0.15) / 0.85));
        p.m.scale.set(1 + k * 0.4, 1, 1 + k * 0.4);
        p.m.rotation.y += dt;
        p.ring.scale.setScalar(1 + k * 9);
        p.ring.material.opacity = Math.max(0, 0.6 * (1 - k * 1.6));
        if (k >= 1) {
          this.scene.remove(p.m); this.scene.remove(p.ring);
          p.m.geometry.dispose(); p.m.material.dispose(); p.ring.geometry.dispose(); p.ring.material.dispose();
          this._pillars.splice(i, 1);
        }
      }
    },

    // ---- loot: epic+ items get a ground halo and a pillar flash ------------------------
    spawnItemDrop(pos, item, gold, trophy) {
      origSpawnItemDrop.call(this, pos, item, gold, trophy);
      if (!item) return;
      const idx = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].indexOf(item.rarity);
      if (idx < 2) return;
      const ld = this.lootDrops[this.lootDrops.length - 1];
      const col = new THREE.Color(window.MMO.RARITIES[idx].color).getHex();
      const g = new THREE.RingGeometry(0.5, 0.9 + idx * 0.15, 32); g.rotateX(-Math.PI / 2);
      const halo = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      halo.position.y = 0.05;
      ld.group.add(halo);
      if (idx >= 3) this.spawnLightPillar(ld.pos, col, 1.6, 0.5, 14);
    },

    updateMMOWorld(dt) {
      origUpdate.call(this, dt);
      this.updateZoneParticles(dt);
      this.updateAuras(dt);
      this.updatePillars(dt);
      this.adaptiveFX(dt);
    }
  });
})();
