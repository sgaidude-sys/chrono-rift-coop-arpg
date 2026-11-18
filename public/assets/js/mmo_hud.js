/* =============================================================================
 * Chrono-Rift — anime action-RPG camera & HUD
 *  1) Camera rig: critically-damped spring follow (no lerp lag / overshoot),
 *     collision against the terrain and world obstacles (rocks, boulders, tree
 *     trunks, town props) along the pivot->camera ray with a fast pull-in and an
 *     eased return, and a subtle FOV widening while sprinting.
 *  2) Light sprint & stamina: auto-sprint after ~1 s of continuous movement
 *     (+35% speed, Sprint_Loop); dodges / vaults / leaps spend stamina but are
 *     never blocked; stamina regenerates after a short pause.
 *  3) HUD restyle: translucent dark glass panels, thin gold hairlines, diamond
 *     corner accents and bullets, Cinzel headings, slimmer glossy bars.
 *  4) Floating curved SVG stamina ring next to the hero: fades in while
 *     sprinting / acting or below full, fades out when full.
 *  5) Region discovery banner: animated gold-ornament title card when entering
 *     a zone ("Region Discovered" the first time).
 * ============================================================================= */
(function () {
  'use strict';
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  // ---------------------------------------------------------------------------
  // 3) HUD styles (colour / border / type only — layout untouched)
  // ---------------------------------------------------------------------------
  const CSS = `
    :root {
      --panel-bg: rgba(10, 13, 24, 0.62);
      --panel-border: rgba(232, 196, 118, 0.34);
      --hud-gold: #e8c476;
      --hud-gold-soft: rgba(232, 196, 118, 0.55);
    }
    /* glass panels: gold hairline + diamond stud drawn as background layers (no positioning changes) */
    .hud-card, #party-panel, #network-panel, #center-banner, #story-tracker, #chat-panel, #minimap-wrap, #boss-hud {
      background:
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M5 0.6L9.4 5L5 9.4L0.6 5Z' fill='%23161a2e' stroke='%23e8c476' stroke-width='1'/%3E%3C/svg%3E") no-repeat 50% 2px / 9px 9px,
        linear-gradient(90deg, transparent, rgba(232,196,118,0.95) 18%, rgba(232,196,118,0.95) 82%, transparent) no-repeat 50% 0 / 92% 1px,
        linear-gradient(180deg, rgba(16, 20, 34, 0.68), rgba(8, 10, 20, 0.6)) !important;
      border: 1px solid var(--panel-border) !important;
      border-radius: 4px !important;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.38), inset 0 0 0 1px rgba(255, 255, 255, 0.04) !important;
      -webkit-backdrop-filter: blur(7px) saturate(1.15);
      backdrop-filter: blur(7px) saturate(1.15);
    }
    .hero-name-line, .zone-pill, .story-tracker-title, .boss-name-row, #hud-zone-title {
      font-family: 'Cinzel', serif !important; letter-spacing: 1.2px;
    }
    .mini-btn {
      background-color: rgba(10, 13, 24, 0.55) !important;
      border: 1px solid var(--hud-gold-soft) !important;
      border-radius: 3px !important;
      color: #f3ead6 !important;
      font-size: 10.5px !important; letter-spacing: 0.6px; text-transform: none;
      padding-left: 15px !important;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M5 1L9 5L5 9L1 5Z' fill='%23e8c476'/%3E%3C/svg%3E") !important;
      background-repeat: no-repeat !important; background-position: 5px 50% !important; background-size: 6px 6px !important;
    }
    .mini-btn:hover { background-color: rgba(232, 196, 118, 0.18) !important; border-color: #ffe7a8 !important; }
    .stat-bar { height: 12px !important; border-radius: 2px !important; background: rgba(0, 0, 0, 0.5) !important; border: 1px solid rgba(232, 196, 118, 0.22) !important; }
    .hp-fill { background: linear-gradient(180deg, rgba(255,255,255,0.26), transparent 50%), linear-gradient(90deg, #8f1830, #e8354f 60%, #ff6a7e) !important; }
    .mp-fill { background: linear-gradient(180deg, rgba(255,255,255,0.26), transparent 50%), linear-gradient(90deg, #1a4fb0, #3aa6ff 60%, #8fd6ff) !important; }
    .xp-fill { background: linear-gradient(180deg, rgba(255,255,255,0.26), transparent 50%), linear-gradient(90deg, #6d34c9, #b77cff 60%, #e3c2ff) !important; }
    .stat-bar-label { font-size: 9.5px !important; letter-spacing: 0.8px; text-shadow: 0 1px 2px #000; }
    .skill-slot {
      background: radial-gradient(circle at 50% 20%, rgba(232, 196, 118, 0.12), transparent 60%), linear-gradient(165deg, rgba(20, 25, 42, 0.8), rgba(8, 10, 20, 0.82)) !important;
      border: 1px solid var(--hud-gold-soft) !important; border-radius: 6px !important;
      -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px);
    }
    .skill-key { border-radius: 2px !important; }
    .key-cap { border-radius: 2px !important; border-color: var(--hud-gold-soft) !important; }
    #minimap-canvas { border-radius: 50% !important; box-shadow: 0 0 0 1px var(--hud-gold), 0 0 0 4px rgba(10, 13, 24, 0.6), 0 0 0 5px rgba(232, 196, 118, 0.4) !important; }
    .loot-toast { border-radius: 3px !important; border: 1px solid var(--hud-gold-soft) !important; background: rgba(10, 13, 24, 0.78) !important; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }

    /* 4) stamina ring */
    #stamina-ring { position: fixed; left: 0; top: 0; width: 46px; height: 46px; pointer-events: none; z-index: 5;
      opacity: 0; transition: opacity 0.35s ease; will-change: transform, opacity; }
    #stamina-ring.show { opacity: 1; }
    #stamina-ring .track { stroke: rgba(10, 13, 24, 0.55); }
    #stamina-ring .fill { stroke: #ffd36b; filter: drop-shadow(0 0 3px rgba(255, 211, 107, 0.8)); transition: stroke 0.25s; }
    #stamina-ring.low .fill { stroke: #ff8a3c; filter: drop-shadow(0 0 4px rgba(255, 120, 60, 0.9)); animation: stamPulse 0.45s infinite alternate; }
    #stamina-ring.empty .fill { stroke: #ff4a4a; }
    @keyframes stamPulse { from { opacity: 0.65; } to { opacity: 1; } }

    /* 5) region banner */
    #region-banner { position: fixed; left: 50%; top: 21%; transform: translateX(-50%); pointer-events: none; z-index: 30;
      text-align: center; opacity: 0; width: min(92vw, 760px); }
    #region-banner .rb-kicker { font-family: 'Cinzel', serif; font-size: 12px; letter-spacing: 6px; color: #f1d692; text-transform: uppercase;
      text-shadow: 0 0 10px rgba(232, 196, 118, 0.6); opacity: 0; }
    #region-banner .rb-title { font-family: 'Cinzel', serif; font-weight: 900; font-size: clamp(26px, 5.2vw, 52px); color: #fff8e6; letter-spacing: 14px;
      text-shadow: 0 2px 0 rgba(0,0,0,0.45), 0 0 22px rgba(255, 214, 140, 0.55), 0 0 48px rgba(120, 180, 255, 0.25); margin: 6px 0 4px; white-space: nowrap; }
    #region-banner .rb-line { display: flex; align-items: center; justify-content: center; gap: 10px; }
    #region-banner .rb-rule { height: 1px; width: 0; background: linear-gradient(90deg, transparent, #e8c476); }
    #region-banner .rb-rule.r { background: linear-gradient(270deg, transparent, #e8c476); }
    #region-banner .rb-gem { width: 9px; height: 9px; transform: rotate(45deg) scale(0); border: 1px solid #ffe7a8; background: #2a2140; box-shadow: 0 0 10px #ffd36b; }
    #region-banner .rb-sub { font-family: 'Inter', sans-serif; font-size: 13px; letter-spacing: 3px; color: #cfd8ec; opacity: 0; margin-top: 8px; text-shadow: 0 1px 3px #000; }
    #region-banner.play { animation: rbFade 4.6s ease forwards; }
    #region-banner.play .rb-kicker { animation: rbUp 0.9s 0.15s ease forwards; }
    #region-banner.play .rb-title { animation: rbTrack 1.6s cubic-bezier(.2,.8,.2,1) forwards; }
    #region-banner.play .rb-rule { animation: rbRule 1.1s 0.35s cubic-bezier(.2,.8,.2,1) forwards; }
    #region-banner.play .rb-gem { animation: rbGem 0.6s 0.25s cubic-bezier(.3,1.6,.5,1) forwards; }
    #region-banner.play .rb-sub { animation: rbUp 0.9s 0.7s ease forwards; }
    @keyframes rbFade { 0% { opacity: 0; } 12% { opacity: 1; } 78% { opacity: 1; } 100% { opacity: 0; } }
    @keyframes rbTrack { from { letter-spacing: 28px; opacity: 0; filter: blur(6px); } to { letter-spacing: 14px; opacity: 1; filter: blur(0); } }
    @keyframes rbRule { from { width: 0; } to { width: min(26vw, 220px); } }
    @keyframes rbGem { to { transform: rotate(45deg) scale(1); } }
    @keyframes rbUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    #mmo-zone-banner { display: none !important; }
  `;

  // ---------------------------------------------------------------------------
  // Camera spring + collision
  // ---------------------------------------------------------------------------
  const SPRING_W = 9.5;          // rad/s: critically damped
  const PULL_W = 22;             // faster when the collision pulls the camera in
  const _pivot = new THREE.Vector3(), _seg = new THREE.Vector3(), _pt = new THREE.Vector3();

  function springAxis(x, v, target, w, dt) {
    // implicit (unconditionally stable) critically-damped spring step
    const f = 1 + 2 * dt * w, oo = w * w, hoo = dt * oo, hhoo = dt * hoo, inv = 1 / (f + hhoo);
    const nx = (f * x + dt * v + hhoo * target) * inv;
    const nv = (v + hoo * (target - x)) * inv;
    return [nx, nv];
  }

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, useSkill: GP.useSkill,
    playEntityAnim: GP.playEntityAnim, getMoveSpeedMult: GP.getMoveSpeedMult, showZoneBanner: GP.showZoneBanner
  };

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      this.initHudFX();
    },

    initHudFX() {
      if (!document.getElementById('hudfx-style')) {
        const st = document.createElement('style');
        st.id = 'hudfx-style';
        st.textContent = CSS;
        document.head.appendChild(st);
      }
      // stamina ring (3/4 arc, opening at the bottom-left)
      if (!document.getElementById('stamina-ring')) {
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.id = 'stamina-ring';
        svg.setAttribute('viewBox', '0 0 46 46');
        const R = 18, C = 2 * Math.PI * R, ARC = C * 0.75;
        const mk = (cls, w) => {
          const c = document.createElementNS(NS, 'circle');
          c.setAttribute('cx', 23); c.setAttribute('cy', 23); c.setAttribute('r', R);
          c.setAttribute('fill', 'none'); c.setAttribute('class', cls); c.setAttribute('stroke-width', w);
          c.setAttribute('stroke-linecap', 'round');
          c.setAttribute('transform', 'rotate(135 23 23)');
          c.setAttribute('stroke-dasharray', `${ARC} ${C}`);
          svg.appendChild(c);
          return c;
        };
        mk('track', 5.5);
        this._stamFill = mk('fill', 3.6);
        this._stamArc = ARC; this._stamC = C;
        document.body.appendChild(svg);
        this._stamEl = svg;
      }
      // region banner
      if (!document.getElementById('region-banner')) {
        const b = document.createElement('div');
        b.id = 'region-banner';
        b.innerHTML = '<div class="rb-kicker"></div><div class="rb-line"><div class="rb-rule"></div><div class="rb-gem"></div><div class="rb-rule r"></div></div>' +
          '<div class="rb-title"></div><div class="rb-line"><div class="rb-rule"></div><div class="rb-gem"></div><div class="rb-rule r"></div></div><div class="rb-sub"></div>';
        document.body.appendChild(b);
        this._regionBanner = b;
      }
      this.stamina = 100;
      this._stamIdle = 0;
      this._moveHeld = 0;
      this._sprinting = false;
      this._baseFov = this.camera.fov;
      this._camVel = new THREE.Vector3();
      this._camColT = 1;
    },

    // =====================================================================
    // 1) Camera rig (called from the main camera block in index.html)
    // =====================================================================
    cameraRig(dt, heroModalOpen) {
      const cam = this.camera;
      if (!this._camBase || this._camBase.distanceToSquared(cam.position) > 64) {
        this._camBase = cam.position.clone();
        this._camVel = new THREE.Vector3();
      }
      const d = this._desiredCam;
      let w = SPRING_W;
      if (!heroModalOpen && this.terrainVisualHeight) {
        const t = this.cameraCollisionT(d);
        // pull in immediately, ease back out
        if (t < this._camColT) this._camColT = t;
        else this._camColT += (t - this._camColT) * Math.min(1, dt * 2.5);
        if (this._camColT < 0.999) {
          _seg.copy(d).sub(_pivot);                       // direction first, then shorten
          d.copy(_pivot).addScaledVector(_seg, this._camColT);
          w = PULL_W;
        }
      }
      const b = this._camBase, v = this._camVel;
      const sdt = Math.min(dt, 0.05);
      let r = springAxis(b.x, v.x, d.x, w, sdt); b.x = r[0]; v.x = r[1];
      r = springAxis(b.y, v.y, d.y, w, sdt); b.y = r[0]; v.y = r[1];
      r = springAxis(b.z, v.z, d.z, w, sdt); b.z = r[0]; v.z = r[1];
      cam.position.copy(b);
      // sprint FOV widening (subtle, eased)
      const targetFov = this._baseFov + (this._sprinting ? 5.5 : 0);
      if (Math.abs(cam.fov - targetFov) > 0.01) {
        cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 5);
        cam.updateProjectionMatrix();
      }
    },

    // Fraction (0..1) of the pivot->camera segment that is free of terrain/obstacles
    cameraCollisionT(desired) {
      const p = this.player.pos;
      const ty = this._camTerrY || 0;
      _pivot.set(p.x, (p.y || 0) + 1.5 + ty, p.z);
      _seg.copy(desired).sub(_pivot);
      let tHit = 1;
      // terrain along the ray (terrain is GPU-displaced; mirror sampled on the CPU)
      const N = 12;
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        _pt.copy(_pivot).addScaledVector(_seg, t);
        if (_pt.y < this.terrainVisualHeight(_pt.x, _pt.z) + 0.6) { tHit = Math.max(0, (i - 1.2) / N); break; }
      }
      // world obstacles (rocks, boulders, trunks, props): vertical cylinders
      const lenXZ = Math.hypot(_seg.x, _seg.z) || 1e-3;
      const test = (ob) => {
        const ox = ob.x - _pivot.x, oz = ob.z - _pivot.z;
        let t = (ox * _seg.x + oz * _seg.z) / (lenXZ * lenXZ);
        if (t <= 0.02 || t >= 1.05) return;
        const cx = _seg.x * t - ox, cz = _seg.z * t - oz;
        const dist = Math.hypot(cx, cz);
        const rr = (ob.r || 0.5) + 0.35;
        if (dist >= rr) return;
        const top = this.terrainVisualHeight(ob.x, ob.z) + Math.min(9, 1.4 + (ob.r || 0.5) * 3.2);
        const tEnter = t - Math.sqrt(rr * rr - dist * dist) / lenXZ;
        if (_pivot.y + _seg.y * tEnter > top) return;          // the ray passes above it
        tHit = Math.min(tHit, Math.max(0, tEnter - 0.04));
      };
      const wg = this.worldGen, cs = window.MMO.WORLD.chunk;
      if (wg) {
        const x0 = Math.floor(Math.min(_pivot.x, desired.x) / cs), x1 = Math.floor(Math.max(_pivot.x, desired.x) / cs);
        const z0 = Math.floor(Math.min(_pivot.z, desired.z) / cs), z1 = Math.floor(Math.max(_pivot.z, desired.z) / cs);
        for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
          const ch = wg.chunk(cx, cz);
          for (let k = 0; k < ch.obstacles.length; k++) test(ch.obstacles[k]);
        }
      }
      const wo = this.worldObstacles || [];
      const minX = Math.min(_pivot.x, desired.x) - 4, maxX = Math.max(_pivot.x, desired.x) + 4;
      const minZ = Math.min(_pivot.z, desired.z) - 4, maxZ = Math.max(_pivot.z, desired.z) + 4;
      for (let k = 0; k < wo.length; k++) {
        const ob = wo[k];
        if (ob.x < minX || ob.x > maxX || ob.z < minZ || ob.z > maxZ) continue;
        test(ob);
      }
      return Math.max(0.2, tHit);          // never closer than 20% of the boom
    },

    // =====================================================================
    // 2) Sprint & stamina
    // =====================================================================
    getMoveSpeedMult() {
      const base = orig.getMoveSpeedMult ? orig.getMoveSpeedMult.call(this) : 1;
      return base * (this._sprinting ? 1.35 : 1);
    },

    playEntityAnim(entity, name, force) {
      if (entity === this.player && this._sprinting && name === 'Jog_Fwd_Loop' && entity.actions && entity.actions.Sprint_Loop) name = 'Sprint_Loop';
      return orig.playEntityAnim.call(this, entity, name, force);
    },

    spendStamina(n) {
      this.stamina = Math.max(0, (this.stamina === undefined ? 100 : this.stamina) - n);
      this._stamIdle = 0;
      this._stamFlash = 1.2;
    },

    useSkill(slot, isRemoteOrAI, actor) {
      const ent = actor || this.player;
      if (ent === this.player && !isRemoteOrAI && this.player.cooldowns && !(this.player.cooldowns[slot] > 0)) {
        if (slot === 3) this.spendStamina(16);      // dashes / blinks / vaults / leaps
        else if (slot >= 2) this.spendStamina(6);
      }
      return orig.useSkill.apply(this, arguments);
    },

    updateSprintStamina(dt) {
      const p = this.player;
      if (this.stamina === undefined) return;
      const moving = p.vel && (p.vel.x * p.vel.x + p.vel.z * p.vel.z) > 0.5 && p.attackTimer <= 0.08;
      this._moveHeld = moving ? this._moveHeld + dt : 0;
      // jumps and dodges cost stamina (rising edges)
      if (p.dodgeTimer > 0 && !this._wasDodging) this.spendStamina(14);
      this._wasDodging = p.dodgeTimer > 0;
      if (p.isJumping && !this._wasJumping) this.spendStamina(8);
      this._wasJumping = !!p.isJumping;
      if (this._exhausted && this.stamina > 35) this._exhausted = false;
      const want = moving && this._moveHeld > 0.9 && !this._exhausted && !p.dead;
      if (want && this.stamina > 0) {
        this._sprinting = true;
        this.stamina = Math.max(0, this.stamina - 15 * dt);
        this._stamIdle = 0;
        if (this.stamina <= 0) { this._exhausted = true; this._sprinting = false; }
      } else {
        this._sprinting = false;
        this._stamIdle += dt;
        if (this._stamIdle > 0.8) this.stamina = Math.min(100, this.stamina + 30 * dt * (1 + (this.tv ? this.tv('stamRegen') : 0)));
      }
      if (!this._sprinting && p.animState === 'Sprint_Loop') this.playEntityAnim(p, 'Jog_Fwd_Loop');
      this._stamFlash = Math.max(0, (this._stamFlash || 0) - dt);
    },

    // =====================================================================
    // 4) Stamina ring placement (screen space, beside the hero)
    // =====================================================================
    updateStaminaRing() {
      const el = this._stamEl;
      if (!el) return;
      const full = this.stamina >= 99.5;
      const show = !full || this._sprinting || this._stamFlash > 0;
      if (show !== this._stamShown) { el.classList.toggle('show', show); this._stamShown = show; }
      if (!show && full) return;
      const k = this.stamina / 100;
      this._stamFill.setAttribute('stroke-dasharray', `${(this._stamArc * k).toFixed(1)} ${this._stamC.toFixed(1)}`);
      el.classList.toggle('low', k < 0.25 && !this._exhausted);
      el.classList.toggle('empty', !!this._exhausted);
      const p = this.player.pos;
      _pt.set(p.x, (p.y || 0) + 1.25 + (this._camTerrY || 0), p.z).project(this.camera);
      const x = (_pt.x * 0.5 + 0.5) * window.innerWidth + (isTouch ? 44 : 54);
      const y = (-_pt.y * 0.5 + 0.5) * window.innerHeight - 23;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    },

    // =====================================================================
    // 5) Region discovery banner (replaces the old plain zone banner)
    // =====================================================================
    showZoneBanner(title, sub) {
      const b = this._regionBanner;
      if (!b) return orig.showZoneBanner ? orig.showZoneBanner.call(this, title, sub) : undefined;
      const key = 'region:' + title;
      this._regionsSeen = this._regionsSeen || new Set();
      const first = !this._regionsSeen.has(key);
      this._regionsSeen.add(key);
      b.querySelector('.rb-kicker').textContent = first ? '◆  Region Discovered  ◆' : 'Entering';
      b.querySelector('.rb-title').textContent = String(title).toUpperCase();
      b.querySelector('.rb-sub').textContent = sub || '';
      b.classList.remove('play');
      void b.offsetWidth;
      b.classList.add('play');
      if (first && this.heroBark && this._regionsSeen.size > 1) this.heroBark('zone', 1.4);   // the hero reacts to new lands
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (this.stamina === undefined) return;
      this.updateSprintStamina(dt);
      this.updateStaminaRing();
    }
  });
})();
