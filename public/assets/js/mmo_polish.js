/* =============================================================================
 * Chrono-Rift — polish pass
 *  1) Crystal-shatter monster deaths (replaces the wavy "anima" flame sprite):
 *     the body bursts into glowing elongated shards that fly out, spin, bounce
 *     and shrink away; elites/bosses also send up a short soul beam. One pooled
 *     InstancedMesh for every shard in the world (1 draw call).
 *  2) Weapon colours: the weapon GLBs ship with plain white materials whose
 *     NAMES describe their colour (Steel, Gold, DarkWood, Red, LightBlue...).
 *     Each part is coloured from its name with an anime palette; gems and gold
 *     get a soft emissive glow so they catch the bloom.
 *  3) Anime colour grade pass after bloom: midtone saturation, cool teal
 *     shadows, warm golden highlights, gentle S-curve.
 *  4) Bloom retune: soft-knee threshold just above 1.0 so only HDR emissives
 *     (spells, flowers, sun-side horizon, bright rims) halo; wider dreamy radius.
 *  5) Aerial perspective: the global fog chunk blends distance toward a
 *     luminous sky-blue haze (derived from the live fog colour).
 *  6) Graphics quality toggle Low / Medium / High (pixel ratio, shadow map,
 *     grass density, ambient particles, bloom). Remembered per browser.
 * ============================================================================= */
(function () {
  'use strict';
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  // ---------------------------------------------------------------------------
  // 5) Aerial perspective — patched before any program compiles
  // ---------------------------------------------------------------------------
  THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDepth * fogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, fogDepth );
	#endif
	// luminous sky-blue haze that takes over with distance (aerial perspective)
	vec3 aerialCol = fogColor * vec3( 0.9, 1.0, 1.15 ) * 1.12 + vec3( 0.0, 0.015, 0.04 );
	vec3 hazeCol = mix( fogColor, aerialCol, smoothstep( 40.0, 220.0, fogDepth ) );
	// before the fog fully swallows it, distant terrain loses contrast + saturation
	float pre = smoothstep( 30.0, 190.0, fogDepth ) * 0.32 * ( 1.0 - fogFactor );
	vec3 fogBase = gl_FragColor.rgb;
	float fogLum = dot( fogBase, vec3( 0.299, 0.587, 0.114 ) );
	fogBase = mix( fogBase, mix( vec3( fogLum ), fogBase, 0.7 ) * 0.85 + hazeCol * 0.3, pre );
	gl_FragColor.rgb = mix( fogBase, hazeCol, fogFactor );
#endif`;

  // ---------------------------------------------------------------------------
  // 3) Anime grade (display-referred, runs after ACES)
  // ---------------------------------------------------------------------------
  const AnimeGradeShader = {
    uniforms: {
      tDiffuse: { value: null },
      uMidSat: { value: 0.28 },
      uSat: { value: 1.06 },
      uShadowTint: { value: new THREE.Vector3(0.86, 0.98, 1.08) },
      uHighTint: { value: new THREE.Vector3(1.0, 0.78, 0.42) },
      uSplit: { value: 1.0 },
      uContrast: { value: 0.18 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uMidSat, uSat, uSplit, uContrast;
      uniform vec3 uShadowTint, uHighTint;
      varying vec2 vUv;
      void main() {
        vec4 src = texture2D(tDiffuse, vUv);
        vec3 c = src.rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        // saturation peaks in the midtones (skin, foliage, sky), not in near-black / near-white
        float mid = smoothstep(0.05, 0.4, l) * (1.0 - smoothstep(0.65, 0.98, l));
        c = mix(vec3(l), c, uSat + uMidSat * mid);
        // split toning: cool teal shadows, warm golden highlights
        float sh = 1.0 - smoothstep(0.0, 0.45, l);
        float hi = smoothstep(0.55, 1.0, l);
        c = mix(c, c * uShadowTint, sh * uSplit);
        c += uHighTint * hi * 0.055 * uSplit;
        // gentle filmic S-curve
        vec3 cc = clamp(c, 0.0, 1.0);
        c = mix(c, cc * cc * (3.0 - 2.0 * cc), uContrast);
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
      }`
  };

  // ---------------------------------------------------------------------------
  // 2) Weapon palette (keyed by GLB material names)
  // ---------------------------------------------------------------------------
  const WEAPON_PAL = {
    steel:      { c: 0x6f84a2, e: 0x000000, ei: 0 },      // cool blue steel
    lightsteel: { c: 0x8e9fb6, e: 0x000000, ei: 0 },      // polished edge (no glow, avoids bloom glare)
    darksteel:  { c: 0x4a5670, e: 0x000000, ei: 0 },
    gold:       { c: 0xf2b53c, e: 0x7a4a08, ei: 0.55 },
    lightgold:  { c: 0xffd978, e: 0x9a6a10, ei: 0.6 },
    lightwood:  { c: 0xc28d55, e: 0x000000, ei: 0 },
    darkwood:   { c: 0x6e4529, e: 0x000000, ei: 0 },
    darkbrown:  { c: 0x4c3020, e: 0x000000, ei: 0 },
    red:        { c: 0xd8303f, e: 0x6a0812, ei: 0.5 },
    lightred:   { c: 0xff6f6f, e: 0x7a1a1a, ei: 0.5 },
    black:      { c: 0x2a2633, e: 0x000000, ei: 0 },
    white:      { c: 0xf1ece0, e: 0x000000, ei: 0 },
    lightblue:  { c: 0x5fd0ff, e: 0x1a8cff, ei: 1.6 },    // gems glow -> bloom
    green:      { c: 0x45d985, e: 0x0e8a48, ei: 1.3 },
    blue:       { c: 0x3d7cff, e: 0x1a3cff, ei: 1.2 },
    purple:     { c: 0xa86bff, e: 0x5a1cff, ei: 1.2 }
  };
  function colorizeWeaponMat(mat) {
    if (!mat || mat.userData.wpColored) return;
    mat.userData.wpColored = true;
    const key = String(mat.name || '').toLowerCase().replace(/[^a-z]/g, '');
    const pal = WEAPON_PAL[key];
    const isWhite = mat.color && mat.color.r > 0.9 && mat.color.g > 0.9 && mat.color.b > 0.9 && !mat.map;
    if (!pal || !isWhite) return;
    mat.color.setHex(pal.c);
    // these GLBs are fully metallic with no env map -> render black; read as painted metal
    if (typeof mat.metalness === 'number') mat.metalness = Math.min(mat.metalness, 0.3);
    if (typeof mat.roughness === 'number') mat.roughness = Math.max(mat.roughness, 0.6);
    if (mat.emissive) { mat.emissive.setHex(pal.e); mat.emissiveIntensity = pal.ei; }
    mat.userData.origEmissive = mat.emissive ? mat.emissive.clone() : null;
    mat.userData.origEmissiveIntensity = pal.ei;
    mat.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // 6) Quality presets
  // ---------------------------------------------------------------------------
  const QUALITY = {
    low:    { label: 'Low',    pr: 0.8,  prCap: 1.0, shadow: 512,  grass: 0.35, motes: 0.4, bloom: 0 },
    medium: { label: 'Medium', pr: 1.0,  prCap: 1.25, shadow: 1024, grass: 0.65, motes: 0.7, bloom: 0.5 },
    high:   { label: 'High',   pr: 1.0,  prCap: 2.0, shadow: 2048, grass: 1.0,  motes: 1.0, bloom: 1.0 }
  };
  const ORDER = ['low', 'medium', 'high'];
  function defaultQuality() {
    try { const s = localStorage.getItem('cr_gfx_quality'); if (QUALITY[s]) return s; } catch (e) { /* storage blocked */ }
    if (isTouch || new URLSearchParams(location.search).get('fx') === 'low') return 'low';
    return (navigator.hardwareConcurrency || 8) <= 4 ? 'medium' : 'high';
  }

  // ---------------------------------------------------------------------------
  // Game integration
  // ---------------------------------------------------------------------------
  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, attachWeaponsToEntity: GP.attachWeaponsToEntity };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3();
  const _c = new THREE.Color();

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initPolish(); } catch (e) { console.warn('[Polish] init failed', e); }
    },

    initPolish() {
      // ---- shard pool ----
      const geo = new THREE.OctahedronGeometry(1, 0);
      geo.scale(0.45, 1.35, 0.45);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      mat.userData.noOcclude = true;
      const inst = new THREE.InstancedMesh(geo, mat, 320);
      inst.setColorAt(0, new THREE.Color(1, 1, 1));
      inst.count = 0;
      inst.frustumCulled = false;
      inst.castShadow = false;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(inst);
      this._shardMesh = inst;
      this._shards = [];
      // ---- post: anime grade after bloom + bloom retune ----
      if (this.composer && THREE.ShaderPass) {
        if (this.finalPass && this.finalPass.uniforms.uSat) this.finalPass.uniforms.uSat.value = 1.0;   // grading moved to its own pass
        this.gradePass = new THREE.ShaderPass(AnimeGradeShader);
        this.composer.addPass(this.gradePass);                  // after bloom + ACES final
        if (this.finalPass) this.finalPass.renderToScreen = false;
        this.gradePass.renderToScreen = true;
      }
      if (this.bloomPass) {
        this.bloomPass.threshold = this.hdrPipeline ? 1.1 : 0.92;
        this.bloomPass.strength = 0.62;
        this.bloomPass.radius = 0.72;
        if (this.bloomPass.highPassUniforms && this.bloomPass.highPassUniforms.smoothWidth) {
          this.bloomPass.highPassUniforms.smoothWidth.value = 0.12;   // narrow soft knee: sunlit armour/steel stays crisp
        }
      }
      // already-compiled programs pick up the new fog chunk
      this.scene.traverse((o) => {
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        ms.forEach((m) => { if (m.fog !== false) m.needsUpdate = true; });
      });
      // ---- grass: shuffle offsets once so any prefix is an even random subset ----
      if (this.grassMesh) {
        const a = this.grassMesh.geometry.attributes.aOffset;
        if (a && !a.userData) a.userData = {};
        if (a && !a.userData.shuffled) {
          const arr = a.array, n = arr.length / 3;
          const rng = (window.ChronoWorld && window.ChronoWorld.mulberry32) ? window.ChronoWorld.mulberry32(9917) : Math.random;
          for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            for (let k = 0; k < 3; k++) { const t = arr[i * 3 + k]; arr[i * 3 + k] = arr[j * 3 + k]; arr[j * 3 + k] = t; }
          }
          a.needsUpdate = true;
          a.userData.shuffled = true;
        }
      }
      this.setGraphicsQuality(defaultQuality(), true);
      this.buildQualityButton();
      this.colorizeAllWeapons();
    },

    // =====================================================================
    // 1) Crystal shatter death
    // =====================================================================
    spawnDeathShatter(mob, color) {
      if (!this._shardMesh) return false;
      const h = mob.desiredHeight || 1.8;
      const big = mob.isBoss ? 2.2 : (mob.isElite ? 1.4 : 1);
      const n = Math.round((mob.isBoss ? 36 : (mob.isElite ? 22 : 13)));
      const base = new THREE.Color(color);
      for (let i = 0; i < n; i++) {
        if (this._shards.length >= 320) this._shards.shift();
        const a = Math.random() * Math.PI * 2;
        const out = (2.6 + Math.random() * 3.4) * Math.sqrt(big);
        const s = {
          x: mob.pos.x + Math.cos(a) * h * 0.18, y: h * (0.25 + Math.random() * 0.55), z: mob.pos.z + Math.sin(a) * h * 0.18,
          vx: Math.cos(a) * out, vy: 3.2 + Math.random() * 4.2, vz: Math.sin(a) * out,
          ax: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
          rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 18,
          size: (0.1 + Math.random() * 0.14) * Math.min(2.2, 0.6 + h * 0.25) * big,
          t: 0, life: 0.85 + Math.random() * 0.45,
          col: new THREE.Color().copy(base).lerp(new THREE.Color(1, 1, 1), Math.random() * 0.3).multiplyScalar(1.15 + Math.random() * 0.55) // just over the bloom knee
        };
        this._shards.push(s);
      }
      if ((mob.isBoss || mob.isElite) && this.spawnLightPillar) this.spawnLightPillar(mob.pos, color, mob.isBoss ? 1.6 : 0.9, mob.isBoss ? 1.2 : 0.6, mob.isBoss ? 22 : 12);
      this.spawnShockwaveRing(mob.pos, (mob.isBoss ? 5.5 : 2.4) * 0.8, color, 0.25);
      return true;
    },

    updateShards(dt) {
      const S = this._shards, mesh = this._shardMesh;
      if (!mesh) return;
      let n = 0;
      for (let i = S.length - 1; i >= 0; i--) {
        const s = S[i];
        s.t += dt;
        if (s.t >= s.life) { S.splice(i, 1); continue; }
        s.vy -= 15 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        if (s.y < s.size * 0.6) { s.y = s.size * 0.6; s.vy = Math.abs(s.vy) * 0.32; s.vx *= 0.6; s.vz *= 0.6; s.spin *= 0.5; }
        s.rot += s.spin * dt;
        const k = s.t / s.life;
        const sc = s.size * (k < 0.08 ? k / 0.08 : (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1));
        _p.set(s.x, s.y, s.z);
        _q.setFromAxisAngle(s.ax, s.rot);
        _s.set(sc, sc, sc);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(n, _m);
        _c.copy(s.col).multiplyScalar(k > 0.5 ? 1 - (k - 0.5) * 0.9 : 1);
        mesh.setColorAt(n, _c);
        n++;
      }
      mesh.count = n;
      if (n) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    },

    // =====================================================================
    // 2) Weapons
    // =====================================================================
    colorizeAllWeapons() {
      const mc = this.modelCache || {};
      Object.keys(mc).forEach((k) => {
        if (!k.startsWith('weapon_') || !mc[k]) return;
        mc[k].traverse((o) => {
          if (o.isMesh && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(colorizeWeaponMat);
        });
      });
    },

    attachWeaponsToEntity(entity) {
      const r = orig.attachWeaponsToEntity.apply(this, arguments);
      if (entity && entity.meshRoot) {
        entity.meshRoot.traverse((o) => {
          if (!o.userData || !o.userData.isAttachedWeapon) return;
          o.traverse((c) => { if (c.isMesh && c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(colorizeWeaponMat); });
        });
      }
      return r;
    },

    // =====================================================================
    // 6) Quality
    // =====================================================================
    setGraphicsQuality(level, silent) {
      const Q = QUALITY[level] || QUALITY.high;
      this.gfxQuality = level;
      try { localStorage.setItem('cr_gfx_quality', level); } catch (e) { /* storage blocked */ }
      const r = this.renderer;
      const pr = Math.min(Q.prCap, (window.devicePixelRatio || 1) * Q.pr);
      r.setPixelRatio(pr);
      r.setSize(window.innerWidth, window.innerHeight);
      if (this.composer) {
        if (this.composer.setPixelRatio) this.composer.setPixelRatio(pr);
        this.composer.setSize(window.innerWidth, window.innerHeight);
      }
      // bloom: off on Low (direct render), half-res on Medium, full on High
      if (this.composer) {
        this.fxOn = Q.bloom > 0;
        if (this.bloomPass) {
          this.bloomPass.enabled = Q.bloom > 0;
          this.bloomPass.setSize(window.innerWidth * 0.5 * Q.bloom, window.innerHeight * 0.5 * Q.bloom);
        }
      }
      // shadow map resolution
      const sun = this.sunLight;
      if (sun && sun.shadow.mapSize.x !== Q.shadow) {
        sun.shadow.mapSize.set(Q.shadow, Q.shadow);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
      // grass density / ambient particles
      if (this.grassMesh && this.grassCount) this.grassMesh.geometry.instanceCount = Math.max(500, Math.round(this.grassCount * Q.grass));
      if (this.moteMesh && this.moteCount) this.moteMesh.geometry.setDrawRange(0, Math.round(this.moteCount * Q.motes));
      if (this._gfxBtn) this._gfxBtn.textContent = `🎛️ Graphics: ${Q.label}`;
      if (!silent && this.showLootToast) this.showLootToast(`🎛️ Graphics quality: ${Q.label}`);
    },

    cycleGraphicsQuality() {
      const i = ORDER.indexOf(this.gfxQuality || 'high');
      this.setGraphicsQuality(ORDER[(i + 1) % ORDER.length]);
    },

    buildQualityButton() {
      if (this._gfxBtn) return;
      const audioBtn = document.getElementById('btn-mute');
      const b = document.createElement('button');
      b.id = 'btn-gfx';
      b.className = 'mini-btn';
      b.title = 'Graphics quality: Low / Medium / High';
      b.onclick = () => this.cycleGraphicsQuality();
      b.textContent = `🎛️ Graphics: ${(QUALITY[this.gfxQuality] || QUALITY.high).label}`;
      if (audioBtn && audioBtn.parentNode) audioBtn.parentNode.insertBefore(b, audioBtn.nextSibling);
      else document.body.appendChild(b);
      this._gfxBtn = b;
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      this.updateShards(dt);
      this._wpColorTick = (this._wpColorTick || 0) + dt;
      if (this._wpColorTick > 2) { this._wpColorTick = 0; this.colorizeAllWeapons(); }   // late-loading weapon models
    }
  });
})();
