/* =============================================================================
 * Chrono-Rift — combat feel & world FX (zero external assets)
 *
 *  1) Floating damage numbers: pooled HTML overlay (no per-number rAF loops, no
 *     DOM churn), world-anchored, colour-coded by element with a soft glow, and
 *     a springy upward bounce. Crits pop bigger, reactions get a coloured label.
 *  2) Elemental statuses & reactions: every hero skill carries an element
 *     (Pyro / Hydro / Electro / Cryo). Hits leave an aura on the enemy, shown
 *     as a glowing icon above it; a second element triggers a reaction burst:
 *        Hydro+Electro  Electro-Charged  chain lightning to nearby foes
 *        Pyro+Electro   Overload         explosion + knockback
 *        Cryo+Electro   Superconduct     AoE + enemy takes +25% dmg (8 s)
 *        Hydro+Cryo     Freeze           encased / stunned
 *        Pyro+Cryo      Melt             x2 / x1.5 damage
 *        Pyro+Hydro     Vaporize         x2 / x1.5 damage
 *     Enemies standing in lakes are soaked (Hydro) automatically.
 *  3) Weapon trails: a dynamic ribbon that tracks the base and tip of the
 *     hero's weapon bone during attacks and fades out over 0.2 s (Catmull-Rom
 *     smoothed, additive, element-tinted). Pooled; no per-frame allocation.
 *  4) Waypoint shrines: floating crystal pillars, rotating rune rings, a
 *     vertical light beam and a pulsing ground ring. Walk up to unlock; unlocked
 *     shrines bless you with their element (weapon infusion) every 90 s.
 *  5) Impact: 40 ms hit-stop + smooth trauma camera shake (with slight roll)
 *     on heavy hits, crits and boss skills landing. Throttled so multi-hit
 *     skills never feel sluggish.
 * ============================================================================= */
(function () {
  'use strict';
  const M = window.MMO;
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  // ---------------------------------------------------------------------------
  // Elements
  // ---------------------------------------------------------------------------
  const ELEM = {
    pyro:    { name: 'Pyro',    color: 0xff6a3d, css: '#ff7a45', text: '#ffd0b5' },
    hydro:   { name: 'Hydro',   color: 0x35b8ff, css: '#3ec5ff', text: '#c9efff' },
    electro: { name: 'Electro', color: 0xc070ff, css: '#c77dff', text: '#ecd6ff' },
    cryo:    { name: 'Cryo',    color: 0x9cf2ff, css: '#a8f4ff', text: '#e9fdff' }
  };
  // element per hero class and skill slot (1 = basic, 2-4 = skills, 5 = ultimate)
  const SKILL_ELEM = {
    vanguard:  { 1: 'electro', 2: 'electro', 3: 'electro', 4: 'hydro', 5: 'electro' },
    ranger:    { 1: 'hydro', 2: 'cryo', 3: 'hydro', 4: 'electro', 5: 'hydro' },
    arcanist:  { 1: 'cryo', 2: 'electro', 3: 'electro', 4: 'cryo', 5: 'cryo' },
    berserker: { 1: 'pyro', 2: 'pyro', 3: 'electro', 4: 'pyro', 5: 'pyro' }
  };
  // shrine blessing per zone theme (falls back to a rotation for new zones)
  const SHRINE_ELEM = { meadows: 'hydro', whisperwood: 'electro', catacombs: 'cryo', badlands: 'pyro',
    frostpeak: 'cryo', breach: 'electro', infernal: 'pyro', citadel: 'electro' };
  const SHRINE_ROT = ['hydro', 'electro', 'pyro', 'cryo'];
  const AURA_TIME = 9.0;
  const REACT = {
    'electro+hydro': { key: 'electro_charged', label: 'ELECTRO-CHARGED', css: '#b98cff', color: 0xa070ff },
    'electro+pyro':  { key: 'overload',        label: 'OVERLOADED',      css: '#ff6fa0', color: 0xff4f8a },
    'cryo+electro':  { key: 'superconduct',    label: 'SUPERCONDUCT',    css: '#b8b8ff', color: 0x9aa8ff },
    'cryo+hydro':    { key: 'freeze',          label: 'FROZEN',          css: '#9cf2ff', color: 0x8fe8ff },
    'cryo+pyro':     { key: 'melt',            label: 'MELT',            css: '#ffc46b', color: 0xffb347 },
    'hydro+pyro':    { key: 'vaporize',        label: 'VAPORIZE',        css: '#ffd27a', color: 0xffc860 }
  };
  const reactionOf = (a, b) => REACT[[a, b].sort().join('+')];

  // Procedural element glyphs (shared canvas textures -> shared sprite materials)
  function makeIconTexture(el) {
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const col = ELEM[el].css;
    const halo = g.createRadialGradient(64, 64, 8, 64, 64, 62);
    halo.addColorStop(0, col + 'aa'); halo.addColorStop(0.55, col + '33'); halo.addColorStop(1, col + '00');
    g.fillStyle = halo; g.fillRect(0, 0, S, S);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineJoin = 'round'; g.lineCap = 'round';
    g.shadowColor = col; g.shadowBlur = 14;
    g.beginPath();
    if (el === 'pyro') {
      g.moveTo(64, 20); g.bezierCurveTo(88, 46, 96, 62, 90, 82); g.bezierCurveTo(84, 100, 70, 108, 64, 108);
      g.bezierCurveTo(44, 108, 34, 92, 38, 76); g.bezierCurveTo(42, 62, 54, 58, 52, 44);
      g.bezierCurveTo(60, 52, 64, 60, 62, 70); g.bezierCurveTo(70, 58, 70, 40, 64, 20); g.fill();
    } else if (el === 'hydro') {
      g.moveTo(64, 18); g.bezierCurveTo(78, 44, 96, 62, 96, 80); g.arc(64, 80, 32, 0, Math.PI, false);
      g.bezierCurveTo(32, 62, 50, 44, 64, 18); g.fill();
    } else if (el === 'electro') {
      g.moveTo(74, 14); g.lineTo(36, 70); g.lineTo(60, 70); g.lineTo(50, 114); g.lineTo(94, 52); g.lineTo(68, 52); g.closePath(); g.fill();
    } else {
      g.lineWidth = 8;
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI / 3;
        const dx = Math.cos(a) * 42, dy = Math.sin(a) * 42;
        g.moveTo(64 - dx, 64 - dy); g.lineTo(64 + dx, 64 + dy);
        for (const s of [-1, 1]) {
          const bx = 64 + dx * 0.62 * s, by = 64 + dy * 0.62 * s;
          const px = -Math.sin(a) * 12, py = Math.cos(a) * 12;
          g.moveTo(bx, by); g.lineTo(bx + dx * 0.25 * s + px, by + dy * 0.25 * s + py);
          g.moveTo(bx, by); g.lineTo(bx + dx * 0.25 * s - px, by + dy * 0.25 * s - py);
        }
      }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  // ---------------------------------------------------------------------------
  // Weapon trail ribbon (one pooled mesh per swinging hero)
  // ---------------------------------------------------------------------------
  const TRAIL_LIFE = 200;           // ms a trail point lives (0.2 s fade)
  const TRAIL_MAX_SAMPLES = 24;
  const TRAIL_SUB = 3;              // Catmull-Rom sub-steps between samples
  const TRAIL_MAX_VERTS = (TRAIL_MAX_SAMPLES - 1) * TRAIL_SUB + 1;
  const TRAIL_VERT = `
    #include <common>
    attribute float aAge;
    attribute float aSide;
    varying float vAge;
    varying float vSide;
    void main() {
      vAge = aAge; vSide = aSide;
      vec3 transformed = position;
      #include <project_vertex>
    }`;
  const TRAIL_FRAG = `
    uniform vec3 uColor;
    uniform float uAlpha;
    varying float vAge;
    varying float vSide;
    void main() {
      float life = 1.0 - clamp(vAge, 0.0, 1.0);
      float a = pow(life, 1.6) * mix(0.15, 1.0, smoothstep(0.0, 0.85, vSide)) * uAlpha;
      // crescent: white-hot leading edge near the tip, element colour inward
      vec3 col = mix(uColor, vec3(1.0), smoothstep(0.7, 1.0, vSide) * life * 0.85);
      gl_FragColor = vec4(col * 1.9, a);
    }`;

  function catmull(p0, p1, p2, p3, t, out) {
    const t2 = t * t, t3 = t2 * t;
    out.x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
    out.y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
    out.z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
    return out;
  }

  class WeaponTrail {
    constructor(scene) {
      const geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(TRAIL_MAX_VERTS * 2 * 3);
      this.age = new Float32Array(TRAIL_MAX_VERTS * 2);
      const side = new Float32Array(TRAIL_MAX_VERTS * 2);
      for (let i = 0; i < TRAIL_MAX_VERTS; i++) { side[i * 2] = 0; side[i * 2 + 1] = 1; }
      const idx = [];
      for (let i = 0; i < TRAIL_MAX_VERTS - 1; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
      geo.setIndex(idx);
      this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
      this.ageAttr = new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', this.posAttr);
      geo.setAttribute('aAge', this.ageAttr);
      geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
      geo.setDrawRange(0, 0);
      this.uniforms = { uColor: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 1 } };
      const mat = new THREE.ShaderMaterial({
        uniforms: this.uniforms, vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
      });
      this.mesh = new THREE.Mesh(geo, mat);
      this.mesh.frustumCulled = false;
      this.mesh.castShadow = false;
      this.mesh.renderOrder = 8;
      this.mesh.visible = false;
      scene.add(this.mesh);
      // ring buffer of samples
      this.samples = [];
      for (let i = 0; i < TRAIL_MAX_SAMPLES; i++) this.samples.push({ b: new THREE.Vector3(), t: new THREE.Vector3(), time: 0 });
      this.count = 0;
      this.owner = null;
      this._p = [new THREE.Vector3(), new THREE.Vector3()];
    }
    push(base, tip, now) {
      if (this.count === TRAIL_MAX_SAMPLES) { this.samples.push(this.samples.shift()); this.count--; }
      const s = this.samples[this.count++];
      s.b.copy(base); s.t.copy(tip); s.time = now;
    }
    rebuild(now) {
      // drop expired
      let drop = 0;
      while (drop < this.count && now - this.samples[drop].time > TRAIL_LIFE) drop++;
      if (drop) {
        for (let i = 0; i < drop; i++) this.samples.push(this.samples.shift());
        this.count -= drop;
      }
      if (this.count < 2) { this.mesh.visible = false; this.mesh.geometry.setDrawRange(0, 0); return false; }
      const S = this.samples, n = this.count;
      let v = 0;
      const P = this.pos, A = this.age;
      const write = (b, t, time) => {
        const o = v * 6;
        P[o] = b.x; P[o + 1] = b.y; P[o + 2] = b.z;
        P[o + 3] = t.x; P[o + 4] = t.y; P[o + 5] = t.z;
        const age = Math.min(1, (now - time) / TRAIL_LIFE);
        A[v * 2] = age; A[v * 2 + 1] = age;
        v++;
      };
      for (let i = 0; i < n - 1; i++) {
        const s0 = S[Math.max(0, i - 1)], s1 = S[i], s2 = S[i + 1], s3 = S[Math.min(n - 1, i + 2)];
        for (let k = 0; k < TRAIL_SUB; k++) {
          const u = k / TRAIL_SUB;
          catmull(s0.b, s1.b, s2.b, s3.b, u, this._p[0]);
          catmull(s0.t, s1.t, s2.t, s3.t, u, this._p[1]);
          write(this._p[0], this._p[1], s1.time + (s2.time - s1.time) * u);
        }
      }
      write(S[n - 1].b, S[n - 1].t, S[n - 1].time);
      this.posAttr.updateRange.count = v * 6;
      this.ageAttr.updateRange.count = v * 2;
      this.posAttr.needsUpdate = true;
      this.ageAttr.needsUpdate = true;
      this.mesh.geometry.setDrawRange(0, (v - 1) * 6);
      this.mesh.visible = true;
      return true;
    }
    reset() { this.count = 0; this.mesh.visible = false; this.owner = null; }
  }

  // ---------------------------------------------------------------------------
  // Shrine shaders (include <common> so the global terrain hook lifts them)
  // ---------------------------------------------------------------------------
  const FX_VERT = `
    #include <common>
    varying vec2 vUv;
    varying vec3 vLocal;
    void main() {
      vUv = uv; vLocal = position;
      vec3 transformed = position;
      #include <project_vertex>
    }`;
  const BEAM_FRAG = `
    uniform float uTime; uniform float uOn; uniform float uFlare; uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      float h = vUv.y;                                     // 0 bottom -> 1 top
      float streak = 0.55 + 0.45 * sin(vUv.x * 37.7 + h * 18.0 - uTime * 3.0);
      float fade = (1.0 - smoothstep(0.0, 1.0, h)) * smoothstep(0.0, 0.02, h);
      float a = fade * mix(0.08, 0.5, uOn) * streak + uFlare * fade * 0.9;
      gl_FragColor = vec4(uColor * (1.2 + uFlare * 2.5), a);
    }`;
  const RING_FRAG = `
    uniform float uTime; uniform float uOn; uniform vec3 uColor; uniform vec3 uAccent;
    varying vec2 vUv; varying vec3 vLocal;
    void main() {
      float r = length(vLocal.xz);                         // metres from the shrine
      float band = smoothstep(0.08, 0.0, abs(r - 3.4)) * 0.9;
      float pulse = fract(uTime * 0.45);
      float wave = smoothstep(0.35, 0.0, abs(r - pulse * 3.6)) * (1.0 - pulse);
      float inner = smoothstep(3.4, 0.0, r) * 0.08;
      float a = (band + wave * 0.8 + inner) * mix(0.35, 1.0, uOn);
      vec3 col = mix(uColor, uAccent, wave * 0.6);
      gl_FragColor = vec4(col * 1.4, a);
    }`;
  const RUNE_FRAG = `
    uniform float uOn; uniform vec3 uColor; uniform sampler2D uRunes;
    varying vec2 vUv;
    void main() {
      float m = texture2D(uRunes, vUv).a;
      gl_FragColor = vec4(uColor * (1.0 + uOn * 1.4), m * mix(0.25, 0.95, uOn));
    }`;

  function makeRuneTexture() {
    const S = 512, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.arc(0, 0, 236, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 176, 0, Math.PI * 2); g.stroke();
    const rng = (window.ChronoWorld && window.ChronoWorld.mulberry32) ? window.ChronoWorld.mulberry32(31337) : Math.random;
    const N = 16;
    g.lineWidth = 7;
    for (let i = 0; i < N; i++) {
      g.save();
      g.rotate(i / N * Math.PI * 2);
      g.translate(0, -206);
      g.beginPath();
      // procedural rune: 3-4 strokes on a small grid
      const strokes = 3 + Math.floor(rng() * 2);
      for (let s = 0; s < strokes; s++) {
        const x0 = (Math.floor(rng() * 3) - 1) * 9, y0 = (Math.floor(rng() * 3) - 1) * 12;
        const x1 = (Math.floor(rng() * 3) - 1) * 9, y1 = (Math.floor(rng() * 3) - 1) * 12;
        g.moveTo(x0, y0); g.lineTo(x1 === x0 && y1 === y0 ? x1 + 9 : x1, y1);
      }
      g.stroke();
      g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  // ---------------------------------------------------------------------------
  // Game integration
  // ---------------------------------------------------------------------------
  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld,
    updateMMOWorld: GP.updateMMOWorld,
    applyDamageToMonster: GP.applyDamageToMonster,
    useSkill: GP.useSkill,
    bossHit: GP.bossHit
  };
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _proj = new THREE.Vector3();
  const _inv = new THREE.Matrix4();

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      this.initCombatFX();
    },

    initCombatFX() {
      // ---- damage popups: CSS + pooled nodes ----
      if (!document.getElementById('cfx-style')) {
        const st = document.createElement('style');
        st.id = 'cfx-style';
        st.textContent = `
          .dmg-pop { position: absolute; left: 0; top: 0; font-family: 'Cinzel', serif; font-weight: 900;
            white-space: nowrap; pointer-events: none; will-change: transform, opacity; opacity: 0;
            letter-spacing: 0.5px; line-height: 1; }
          .dmg-pop small { display: block; font-size: 0.55em; letter-spacing: 1.5px; margin-bottom: 2px; text-align: center; }`;
        document.head.appendChild(st);
      }
      this._popLayer = document.getElementById('floating-combat-text') || document.body;
      this._pops = [];
      const POOL = isTouch ? 36 : 56;
      for (let i = 0; i < POOL; i++) {
        const el = document.createElement('div');
        el.className = 'dmg-pop';
        el.style.display = 'none';
        this._popLayer.appendChild(el);
        this._pops.push({ el, active: false, t: 0, life: 1, wx: 0, wy: 0, wz: 0, dx: 0, rise: 50, size: 16, born: 0 });
      }
      // ---- element icons (4 shared sprite materials) ----
      this._elemMats = {};
      Object.keys(ELEM).forEach((k) => {
        this._elemMats[k] = new THREE.SpriteMaterial({ map: makeIconTexture(k), transparent: true, depthWrite: false, depthTest: false });
      });
      this._elemTick = 0;
      // ---- weapon trails (pool of 6) ----
      this._trails = [];
      for (let i = 0; i < 6; i++) this._trails.push(new WeaponTrail(this.scene));
      // ---- lightning arcs (pool of 8 jagged lines) ----
      this._arcs = [];
      const arcMat = new THREE.LineBasicMaterial({ color: 0xd2a8ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
      for (let i = 0; i < 8; i++) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3).setUsage(THREE.DynamicDrawUsage));
        const line = new THREE.Line(g, arcMat.clone());
        line.frustumCulled = false; line.visible = false; line.renderOrder = 9;
        this.scene.add(line);
        this._arcs.push({ line, t: 0 });
      }
      this._lastImpactAt = 0;
    },

    // =====================================================================
    // 5) Impact: hit-stop + trauma shake
    // =====================================================================
    triggerImpact(shake = 0.3, freeze = 0.04) {
      this.screenShake = Math.min(1.0, Math.max(this.screenShake || 0, shake));
      const now = performance.now();
      // throttle the freeze: multi-hit skills would otherwise stutter
      if (freeze > 0 && now - (this._lastImpactAt || 0) > 120) {
        this._lastImpactAt = now;
        this.hitStopTimer = Math.max(this.hitStopTimer || 0, freeze);
      }
    },

    // Smooth (noise-based) camera shake with a little roll; applied AFTER the
    // camera's own smoothing so it isn't damped away.
    applyCameraShake(dt) {
      const tr = this.screenShake || 0;
      if (tr <= 0) return;
      this._shakeT = (this._shakeT || 0) + dt * 32;
      const t = this._shakeT;
      const n = (a, b) => Math.sin(t * a + b) * 0.6 + Math.sin(t * a * 2.31 + b * 1.7) * 0.4;
      const k = tr * tr;                                    // trauma^2: small hits stay subtle
      const cam = this.camera;
      _v.set(1, 0, 0).applyQuaternion(cam.quaternion).multiplyScalar(n(1.0, 0.3) * k * 0.42);
      _v2.set(0, 1, 0).applyQuaternion(cam.quaternion).multiplyScalar(n(1.13, 2.1) * k * 0.32);
      cam.position.add(_v).add(_v2);
      cam.rotateZ(n(0.87, 4.2) * k * 0.03);
      this.screenShake = Math.max(0, tr - dt * 2.0);
    },

    bossHit(m, mult, label) {
      const dodging = this.player.dodgeTimer > 0;
      const r = orig.bossHit.call(this, m, mult, label);
      if (!dodging) this.triggerImpact(0.5, 0.04);
      return r;
    },

    // =====================================================================
    // 1) Floating damage numbers
    // =====================================================================
    spawnFloatingText(worldPos, text, color = '#ffe599', size = 16) {
      if (!this._pops) return;
      const ctx = this._dmgCtx;
      const s = String(text);
      const m = /^(\d+)( CRIT!)?$/.exec(s);
      let html, glow, textCol, sz = size, life = 0.95, rise = 54;
      if (m && ctx) {
        const el = ctx.element ? ELEM[ctx.element] : null;
        const crit = !!m[2];
        glow = el ? el.css : (crit ? '#ffb030' : '#ffffff');
        textCol = crit ? (el ? el.text : '#ffe08a') : (el ? el.text : '#ffffff');
        sz = (crit ? 25 : 17) * (ctx.reaction ? 1.15 : 1);
        html = m[1] + (crit ? '<span style="font-size:0.6em"> ✦</span>' : '');
        if (ctx.reaction) html = `<small style="color:${ctx.reaction.css}">${ctx.reaction.label}</small>` + html;
        life = crit ? 1.15 : 0.95;
        rise = crit ? 70 : 54;
      } else if (/^-\d+$/.test(s)) {                     // damage taken by the hero
        glow = '#ff2a4a'; textCol = '#ffb3be'; sz = 19; html = s; rise = 46;
      } else {
        glow = color; textCol = color; html = s.replace(/[<>&]/g, ''); life = 1.25; rise = 60; sz = size;
      }
      // recycle: free node, else the oldest
      let p = null, oldest = null;
      for (let i = 0; i < this._pops.length; i++) {
        const q = this._pops[i];
        if (!q.active) { p = q; break; }
        if (!oldest || q.born < oldest.born) oldest = q;
      }
      p = p || oldest;
      p.active = true; p.t = 0; p.life = life; p.rise = rise; p.born = performance.now();
      p.wx = worldPos.x; p.wz = worldPos.z;
      p.wy = (worldPos.y || 0) + 1.9 + (this.terrainVisualHeight ? this.terrainVisualHeight(worldPos.x, worldPos.z) : 0);
      p.dx = (Math.random() - 0.5) * 44;
      p.ox = (Math.random() - 0.5) * 22;
      p.size = sz * (isTouch ? 0.9 : 1);
      const e = p.el;
      e.innerHTML = html;
      e.style.fontSize = p.size + 'px';
      e.style.color = textCol;
      e.style.textShadow = `0 1px 0 #000, 0 0 3px #000, 0 2px 6px rgba(0,0,0,0.85), 0 0 10px ${glow}, 0 0 22px ${glow}`;
      e.style.display = 'block';
      this.updateDamagePopup(p, 0);
    },

    updateDamagePopup(p, dt) {
      p.t += dt;
      if (p.t >= p.life) { p.active = false; p.el.style.display = 'none'; return; }
      _proj.set(p.wx, p.wy, p.wz).project(this.camera);
      if (_proj.z > 1) { p.el.style.opacity = '0'; return; }
      const x = (_proj.x * 0.5 + 0.5) * window.innerWidth + p.ox;
      const y = (-_proj.y * 0.5 + 0.5) * window.innerHeight;
      const t = p.t;
      // springy bounce: fast pop upward, overshoot, settle, then drift
      const k = Math.min(1, t / 0.38);
      const up = p.rise * (1 - Math.pow(1 - k, 3)) + Math.max(0, t - 0.38) * 26;
      const bob = Math.exp(-t * 9) * Math.sin(t * 22) * 7;
      const sc = t < 0.07 ? 0.5 + (t / 0.07) * 1.05 : 1 + 0.55 * Math.exp(-(t - 0.07) * 13) * Math.cos((t - 0.07) * 24);
      const op = t > p.life - 0.3 ? (p.life - t) / 0.3 : 1;
      p.el.style.transform = `translate3d(${(x + p.dx * k).toFixed(1)}px, ${(y - up - bob).toFixed(1)}px, 0) translate(-50%, -50%) scale(${sc.toFixed(3)})`;
      p.el.style.opacity = op.toFixed(2);
    },

    // =====================================================================
    // 2) Elements & reactions
    // =====================================================================
    useSkill(slot, isRemoteOrAI, actor) {
      const ent = actor || this.player;
      if (ent && ent.classId) {
        const tbl = SKILL_ELEM[ent.classId] || SKILL_ELEM.vanguard;
        let el = tbl[slot] || null;
        if (slot === 1 && ent === this.player && this.player._infusion && this.player._infusion.until > performance.now()) el = this.player._infusion.el;
        ent._elemCast = { el, t: performance.now() };
        if (ent.classId !== 'ranger') ent._swingUntil = performance.now() + (slot === 1 ? 340 : (slot === 5 ? 900 : 700));
      }
      return orig.useSkill.apply(this, arguments);
    },

    elementForHit(attacker, opts) {
      if (opts && opts.element !== undefined) return opts.element;
      const ent = attacker || this.player;
      const c = ent && ent._elemCast;
      if (c && performance.now() - c.t < 2600) return c.el;
      if (ent && ent.classId) {
        if (ent === this.player && this.player._infusion && this.player._infusion.until > performance.now()) return this.player._infusion.el;
        return (SKILL_ELEM[ent.classId] || {})[1] || null;
      }
      return null;
    },

    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork, netData, opts) {
      if (!mob || mob.dead || fromNetwork || this._inReaction || !this._pops) {
        return orig.applyDamageToMonster.apply(this, arguments);
      }
      const el = this.elementForHit(attacker, opts);
      let reaction = null, mult = 1;
      const now = performance.now();
      const aura = mob._elAura && mob._elAura.until > now ? mob._elAura.el : null;
      if (el && aura && aura !== el) {
        reaction = reactionOf(aura, el);
        if (reaction.key === 'melt') mult = el === 'pyro' ? 2.0 : 1.5;
        else if (reaction.key === 'vaporize') mult = el === 'hydro' ? 2.0 : 1.5;
        this.setMobAura(mob, null);
      } else if (el) {
        this.setMobAura(mob, el);
      }
      if (mob._shredUntil && mob._shredUntil > now) mult *= 1.25;
      const args = Array.prototype.slice.call(arguments);
      args[1] = Math.max(1, Math.round(baseDmg * mult));
      if (reaction && (reaction.key === 'melt' || reaction.key === 'vaporize')) args[2] = true; // amplified = heavy hit
      this._dmgCtx = { element: el, reaction };
      try { orig.applyDamageToMonster.apply(this, args); } finally { this._dmgCtx = null; }
      if (reaction) this.triggerReaction(reaction, mob, el, aura, baseDmg, attacker);
      return undefined;
    },

    setMobAura(mob, el) {
      if (!el) {
        mob._elAura = null;
        if (mob._elIcon) mob._elIcon.visible = false;
        return;
      }
      mob._elAura = { el, until: performance.now() + AURA_TIME * 1000 };
      if (!mob.meshRoot) return;
      if (!mob._elIcon) {
        const sp = new THREE.Sprite(this._elemMats[el]);
        sp.scale.setScalar(0.85);
        sp.renderOrder = 12;
        mob.meshRoot.add(sp);
        mob._elIcon = sp;
      }
      mob._elIcon.material = this._elemMats[el];
      mob._elIcon.position.set(0, (mob.desiredHeight || 2) + 1.35 + (mob.hover || 0), 0);
      mob._elIcon.visible = true;
      mob._elIcon.userData.born = performance.now();
    },

    triggerReaction(R, mob, el, aura, baseDmg, attacker) {
      const pos = mob.pos;
      const nearby = (r) => this.monsters.filter(m => !m.dead && m !== mob && m.pos.distanceToSquared(pos) < r * r);
      const hitOthers = (list, dmg, heavy) => {
        this._inReaction = true;
        try {
          list.forEach((m) => {
            this._dmgCtx = { element: null, reaction: R };
            this.applyDamageToMonster(m, dmg, heavy, attacker, false, null, { noKnockback: !heavy });
          });
        } finally { this._inReaction = false; this._dmgCtx = null; }
      };
      // shared burst: two-tone shockwave + label
      this.spawnShockwaveRing(pos, 5.2, R.color, 0.42);
      this.spawnShockwaveRing(pos, 3.4, ELEM[el].color, 0.3);
      this.spawnVFXFlipbook('impact', pos, 3.2, 0.32, R.color, false, { depthTest: false });
      this.spawnHitSparks(pos, new THREE.Vector3(0, 1, 0), R.color, 22);
      if (this.audio && this.audio.playSample) this.audio.playSample(R.key === 'freeze' || R.key === 'superconduct' ? 'ice_freeze' : (R.key === 'overload' ? 'fire_impact' : 'chime'), 1.0, 0.55);
      const dmg = Math.max(1, Math.round(baseDmg * 0.8));
      switch (R.key) {
        case 'electro_charged': {
          const chain = nearby(7).sort((a, b) => a.pos.distanceToSquared(pos) - b.pos.distanceToSquared(pos)).slice(0, 3);
          let from = pos;
          chain.forEach((m) => { this.spawnLightningArc(from, m.pos, 0xc9a0ff); from = m.pos; });
          this.spawnLightningArc(pos, _v.copy(pos).add(new THREE.Vector3(0, 3, 0)), 0xffffff);
          hitOthers(chain, Math.round(baseDmg * 0.6), false);
          mob.stunTimer = Math.max(mob.stunTimer || 0, 0.6);
          this.triggerImpact(0.32, 0.04);
          break;
        }
        case 'overload':
          hitOthers(nearby(4.8), dmg, true);
          this.spawnVFXFlipbook('explosion', pos, 6.0, 0.5, 0xff6a3d, false, { depthTest: false });
          this.triggerImpact(0.55, 0.05);
          break;
        case 'superconduct':
          [mob].concat(nearby(4.5)).forEach(m => { m._shredUntil = performance.now() + 8000; });
          hitOthers(nearby(4.5), Math.round(baseDmg * 0.5), false);
          this.triggerImpact(0.3, 0.04);
          break;
        case 'freeze':
          [mob].concat(nearby(2.5)).forEach((m) => { m.stunTimer = Math.max(m.stunTimer || 0, m.isBoss ? 0.9 : 2.6); });
          this.spawnShockwaveRing(pos, 2.4, 0xdffcff, 0.6);
          this.triggerImpact(0.28, 0.04);
          break;
        default: // melt / vaporize: the amplified hit already landed
          this.triggerImpact(0.4, 0.04);
      }
    },

    spawnLightningArc(a, b, color) {
      const slot = this._arcs.find(s => !s.line.visible) || this._arcs[0];
      const arr = slot.line.geometry.attributes.position.array;
      const ay = 1.2, by = 1.2;
      for (let i = 0; i < 10; i++) {
        const k = i / 9;
        const j = (i === 0 || i === 9) ? 0 : 0.55;
        arr[i * 3] = a.x + (b.x - a.x) * k + (Math.random() - 0.5) * j;
        arr[i * 3 + 1] = (a.y || 0) + ay + ((b.y || 0) + by - (a.y || 0) - ay) * k + (Math.random() - 0.5) * j;
        arr[i * 3 + 2] = a.z + (b.z - a.z) * k + (Math.random() - 0.5) * j;
      }
      slot.line.geometry.attributes.position.needsUpdate = true;
      slot.line.material.color.setHex(color);
      slot.line.material.opacity = 1;
      slot.line.visible = true;
      slot.t = 0.28;
    },

    updateElements(dt) {
      const now = performance.now();
      // lakes soak enemies (Hydro) — checked twice a second
      this._elemTick += dt;
      const soak = this._elemTick > 0.5;
      if (soak) this._elemTick = 0;
      const getDepth = window.ChronoWorld && window.ChronoWorld.getWaterDepth;
      const p = this.player.pos;
      const ms = this.monsters;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        const ic = m._elIcon;
        if (m._elAura && (m.dead || m._elAura.until < now)) { m._elAura = null; if (ic) ic.visible = false; }
        else if (ic && ic.visible) {
          const age = (now - (ic.userData.born || now)) / 1000;
          const left = (m._elAura.until - now) / 1000;
          ic.scale.setScalar(0.85 * (age < 0.15 ? 0.6 + age / 0.15 * 0.6 : 1 + 0.06 * Math.sin(age * 6)));
          ic.material.opacity = left < 1.5 ? 0.35 + 0.65 * Math.abs(Math.sin(left * 9)) : 1;
        }
        if (soak && getDepth && !m.dead && (!m._elAura || m._elAura.el === 'hydro')) {
          const dx = m.pos.x - p.x, dz = m.pos.z - p.z;
          if (dx * dx + dz * dz < 3600 && getDepth(m.pos.x, m.pos.z) > 0.15) this.setMobAura(m, 'hydro');
        }
      }
      // lightning arcs flicker out
      for (let i = 0; i < this._arcs.length; i++) {
        const s = this._arcs[i];
        if (!s.line.visible) continue;
        s.t -= dt;
        if (s.t <= 0) { s.line.visible = false; continue; }
        s.line.material.opacity = Math.min(1, s.t / 0.12) * (0.6 + Math.random() * 0.4);
      }
      // the hero's own infusion icon
      const inf = this.player._infusion;
      if (inf && inf.until > now && this.player.meshRoot) {
        if (!this._infIcon) {
          this._infIcon = new THREE.Sprite(this._elemMats[inf.el]);
          this._infIcon.renderOrder = 12;
          this.player.meshRoot.add(this._infIcon);
        }
        if (this._infIcon.parent !== this.player.meshRoot) this.player.meshRoot.add(this._infIcon);
        this._infIcon.material = this._elemMats[inf.el];
        this._infIcon.visible = true;
        this._infIcon.position.set(0, 3.05, 0);
        this._infIcon.scale.setScalar(0.62 + 0.04 * Math.sin(now * 0.006));
      } else if (this._infIcon) this._infIcon.visible = false;
    },

    // =====================================================================
    // 3) Weapon trails
    // =====================================================================
    findTrailHolder(ent) {
      if (!ent.meshRoot) return null;
      let best = null;
      ent.meshRoot.traverse((o) => {
        if (best || !o.userData || !o.userData.isAttachedWeapon) return;
        const id = String(o.userData.weaponId || '');
        if (/shield|bow|arrow/i.test(id)) return;
        best = o;
      });
      if (!best) return null;
      // holder-space extent of the weapon -> base/tip points along its long axis
      best.updateMatrixWorld(true);
      _inv.copy(best.matrixWorld).invert();
      const box = new THREE.Box3(), tmp = new THREE.Box3();
      best.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).applyMatrix4(_inv);
        box.union(tmp);
      });
      if (box.isEmpty()) return null;
      const size = box.getSize(new THREE.Vector3());
      const axis = size.x >= size.y && size.x >= size.z ? 'x' : (size.y >= size.z ? 'y' : 'z');
      const c = box.getCenter(new THREE.Vector3());
      const e0 = c.clone(), e1 = c.clone();
      e0[axis] = box.min[axis]; e1[axis] = box.max[axis];
      const tip = e0.lengthSq() > e1.lengthSq() ? e0 : e1;
      const grip = tip === e0 ? e1 : e0;
      best.userData.trailTip = tip;
      best.userData.trailBase = grip.clone().lerp(tip, 0.3);
      return best;
    },

    updateWeaponTrails() {
      const now = performance.now();
      const ents = [this.player];
      for (let i = 0; i < this.aiAllies.length; i++) ents.push(this.aiAllies[i]);
      if (this.remotePeers) this.remotePeers.forEach(p => ents.push(p));
      const p0 = this.player.pos;
      for (let i = 0; i < ents.length; i++) {
        const ent = ents[i];
        if (!ent || !(ent._swingUntil > now) || !ent.meshRoot || !ent.meshRoot.visible) continue;
        if (ent !== this.player && ent.pos && ent.pos.distanceToSquared(p0) > 1600) continue;
        if (!ent._trailHolder || !ent._trailHolder.parent || now - (ent._trailHolderAt || 0) > 2000) {
          ent._trailHolder = this.findTrailHolder(ent);
          ent._trailHolderAt = now;
        }
        const h = ent._trailHolder;
        if (!h) continue;
        let tr = this._trails.find(t => t.owner === ent);
        if (!tr) {
          tr = this._trails.find(t => !t.owner) || this._trails.reduce((a, b) => (a.count <= b.count ? a : b));
          tr.reset();
          tr.owner = ent;
        }
        const c = ent._elemCast;
        const col = c && c.el ? ELEM[c.el].color : 0xfff2cc;
        tr.uniforms.uColor.value.setHex(col);
        h.updateWorldMatrix(true, false);
        _v.copy(h.userData.trailBase).applyMatrix4(h.matrixWorld);
        _v2.copy(h.userData.trailTip).applyMatrix4(h.matrixWorld);
        tr.push(_v, _v2, now);
      }
      for (let i = 0; i < this._trails.length; i++) {
        const tr = this._trails[i];
        if (!tr.owner) continue;
        if (!tr.rebuild(now) && !(tr.owner._swingUntil > now)) tr.reset();
      }
    },

    // =====================================================================
    // 4) Waypoint shrines (called by mmo_world while building the world)
    // =====================================================================
    buildWaypointShrine(wp, group, zoneIdx) {
      if (!this._shrineShared) {
        const stone = new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.85, metalness: 0.05, flatShading: true });
        const trim = new THREE.MeshStandardMaterial({ color: 0x8c95ad, roughness: 0.6, metalness: 0.3, flatShading: true });
        const crystalGeo = new THREE.CylinderGeometry(0, 0.32, 0.9, 6, 1, false);  // top spike
        const shaft = new THREE.CylinderGeometry(0.32, 0.22, 1.9, 6, 1, false);
        shaft.translate(0, -1.4, 0);
        const merged = [crystalGeo, shaft];
        this._shrineShared = {
          stone, trim,
          dais: new THREE.CylinderGeometry(1.9, 2.2, 0.45, 6),
          step: new THREE.CylinderGeometry(1.35, 1.55, 0.3, 6),
          crystalTop: merged[0], crystalShaft: merged[1],
          core: new THREE.OctahedronGeometry(0.55, 0),
          beam: new THREE.CylinderGeometry(0.45, 0.9, 70, 16, 1, true).translate(0, 35, 0),
          ring: new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2),
          runeGeo: new THREE.PlaneGeometry(4.6, 4.6).rotateX(-Math.PI / 2),
          runeSmall: new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2),
          runeTex: makeRuneTexture(),
          uTime: { value: 0 }
        };
        this.shrines = [];
      }
      const S = this._shrineShared;
      const el = SHRINE_ELEM[wp.zone] || SHRINE_ROT[(zoneIdx || 0) % SHRINE_ROT.length];
      const accent = new THREE.Color(ELEM[el].color);
      const cyan = new THREE.Color(0x48e6ff);
      const U = { uTime: S.uTime, uOn: { value: 0 }, uFlare: { value: 0 }, uColor: { value: cyan.clone() }, uAccent: { value: accent }, uRunes: { value: S.runeTex } };
      const mk = (frag) => new THREE.ShaderMaterial({ uniforms: U, vertexShader: FX_VERT, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      // stone dais
      const dais = new THREE.Mesh(S.dais, S.stone); dais.position.y = 0.22; dais.receiveShadow = true; dais.castShadow = true;
      const step = new THREE.Mesh(S.step, S.trim); step.position.y = 0.56; step.castShadow = true;
      group.add(dais, step);
      // floating crystals: one tall core + 3 orbiting shards
      const crystalMat = new THREE.MeshStandardMaterial({ color: 0x9fefff, emissive: 0x2ad2ff, emissiveIntensity: 0.25, roughness: 0.15, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.9 });
      const crystals = [];
      const mkCrystal = (sc) => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(S.crystalTop, crystalMat), new THREE.Mesh(S.crystalShaft, crystalMat));
        g.scale.setScalar(sc);
        g.children.forEach(c => { c.castShadow = true; });
        return g;
      };
      const core = mkCrystal(1.25); core.position.y = 3.3; group.add(core); crystals.push({ g: core, r: 0, a: 0, y: 3.3, s: 1.25 });
      for (let i = 0; i < 3; i++) {
        const c = mkCrystal(0.62); group.add(c);
        crystals.push({ g: c, r: 1.25, a: i / 3 * Math.PI * 2, y: 2.0 + (i % 2) * 0.35, s: 0.62 });
      }
      const gem = new THREE.Mesh(S.core, new THREE.MeshBasicMaterial({ color: accent }));
      gem.position.y = 1.55; group.add(gem);
      // rune rings (rotate in opposite directions), beam, ground ring
      const runeA = new THREE.Mesh(S.runeGeo, mk(RUNE_FRAG)); runeA.position.y = 0.74;
      const runeB = new THREE.Mesh(S.runeSmall, mk(RUNE_FRAG)); runeB.position.y = 3.3;
      const beam = new THREE.Mesh(S.beam, mk(BEAM_FRAG));
      const ring = new THREE.Mesh(S.ring, mk(RING_FRAG)); ring.position.y = 0.06;
      [runeA, runeB, beam, ring].forEach(m => { m.castShadow = false; m.renderOrder = 6; });
      group.add(runeA, runeB, beam, ring);
      const shrine = { wp, group, U, crystals, crystalMat, gem, runeA, runeB, el, on: 0, flareT: 0, blessAt: -1e9 };
      this.shrines.push(shrine);
      return shrine;
    },

    onShrineUnlocked(wp) {
      const s = (this.shrines || []).find(x => x.wp.id === wp.id);
      if (!s) return;
      s.flareT = 1.6;
      const pos = new THREE.Vector3(wp.x, 0, wp.z);
      this.spawnShockwaveRing(pos, 7, 0x48e6ff, 0.6);
      this.spawnShockwaveRing(pos, 4, ELEM[s.el].color, 0.45);
      this.spawnVFXFlipbook('vortex', pos, 5.0, 0.7, 0x48e6ff);
      this.triggerImpact(0.25, 0);
      this.spawnFloatingText(pos, 'WAYPOINT UNLOCKED', '#7ff0ff', 17);
      this.blessFromShrine(s, true);
    },

    blessFromShrine(s, silentToast) {
      const now = performance.now();
      if (now - s.blessAt < 90000) return;
      s.blessAt = now;
      this.player._infusion = { el: s.el, until: now + 60000 };
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.round(this.player.maxHp * 0.25));
      this.spawnFloatingText(this.player.pos, `${ELEM[s.el].name.toUpperCase()} BLESSING`, ELEM[s.el].css, 16);
      if (!silentToast) this.showLootToast(`✨ ${ELEM[s.el].name} blessing: basic attacks infused for 60s, +25% HP`);
      else this.addChatMessage('Shrine', `✨ ${ELEM[s.el].name} blessing — basic attacks are infused for 60s.`, 'sys-synergy');
      if (this.audio && this.audio.playSample) this.audio.playSample('chime', 1.2, 0.5);
      s.flareT = Math.max(s.flareT, 0.8);
    },

    updateShrines(dt) {
      if (!this.shrines || !this.shrines.length) return;
      const S = this._shrineShared;
      const t = this.clock.getElapsedTime();
      S.uTime.value = t;
      const p = this.player.pos;
      const known = this.mmoState && this.mmoState.waypoints;
      for (let i = 0; i < this.shrines.length; i++) {
        const s = this.shrines[i];
        const dx = s.wp.x - p.x, dz = s.wp.z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 160 * 160) continue;                       // far away: frozen (beam still draws)
        const unlocked = !!(known && known.has(s.wp.id));
        s.on += ((unlocked ? 1 : 0) - s.on) * Math.min(1, dt * 1.5);
        s.flareT = Math.max(0, s.flareT - dt);
        s.U.uOn.value = s.on;
        s.U.uFlare.value = Math.min(1, s.flareT);
        s.crystalMat.emissiveIntensity = 0.25 + s.on * 1.6 + s.U.uFlare.value * 2.5;
        for (let k = 0; k < s.crystals.length; k++) {
          const c = s.crystals[k];
          const a = c.a + t * (k === 0 ? 0 : 0.6);
          c.g.position.set(Math.cos(a) * c.r, c.y + Math.sin(t * 1.6 + k * 1.7) * 0.18, Math.sin(a) * c.r);
          c.g.rotation.y = t * (k === 0 ? 0.5 : -0.9) + k;
        }
        s.gem.rotation.y = t * 2.0; s.gem.rotation.x = t * 1.3;
        s.runeA.rotation.y = t * 0.35;
        s.runeB.rotation.y = -t * 0.8;
        if (unlocked && d2 < 3.4 * 3.4) this.blessFromShrine(s);
      }
    },

    // =====================================================================
    // per-frame
    // =====================================================================
    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (!this._pops) return;
      for (let i = 0; i < this._pops.length; i++) if (this._pops[i].active) this.updateDamagePopup(this._pops[i], dt);
      this.updateElements(dt);
      this.updateWeaponTrails();
      this.updateShrines(dt);
    }
  });
})();
