/* =============================================================================
 * Chrono-Rift — loot loop, social presence, live title screen
 *
 *  1) Loot orbs: every drop (mobs, elites, bosses, chests) bursts out as a glowing
 *     orb that arcs, bounces and settles, then raises a rarity light pillar
 *     (Common → Mythic). Within 4 m it magnetises into the hero with a rarity-pitched
 *     chime; pickups land in a slim side-screen loot feed.
 *  2) Social: remote heroes are rendered from a snapshot buffer (sender timestamps,
 *     per-peer clock offset, ~110 ms interpolation delay, Hermite position, shortest-arc
 *     yaw, short extrapolation) so movement, rolls and parries look smooth. Remote rolls
 *     play at the local roll speed and remote Perfect Parries spark. Chat bubbles are
 *     translucent, pop in and drift away. Emote wheel on [T] (hold, aim, release):
 *     Wave / Sit / Cheer, synced through the player-state payload. Talents move to [K].
 *  3) Title screen: before you spawn, the camera glides around the live world behind a
 *     minimalist title ("Click to Enter World"); meanwhile every VFX shader is compiled
 *     with renderer.compile() so the first skill cast never hitches.
 * ============================================================================= */
(function () {
  'use strict';
  const M = window.MMO || {};
  const TERR = window.TERRAIN_GLSL || 'float terrainHeightAt(vec2 p){ return 0.0; }';
  const TU = window.TERRAIN_UNIFORMS || {};
  const RAR = {};
  (M.RARITIES || []).forEach((r, i) => { RAR[r.id] = Object.assign({ idx: i }, r); });
  const PILLAR_H = { common: 1.2, uncommon: 2.2, rare: 3.4, epic: 4.6, legendary: 6.2, mythic: 7.5 };
  const CHIME = { gold: 1.5, common: 1.35, uncommon: 1.25, rare: 1.12, epic: 1.0, legendary: 0.9, mythic: 0.82 };
  const INTERP_MS = 110;

  const CSS = `
  #loot-feed { position: fixed; right: 18px; top: 34%; z-index: 40; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; pointer-events: none; width: 340px; }
  #loot-feed .lf { position: relative; max-width: 340px; padding: 6px 14px 6px 16px; color: #F5F2EB; font: 600 12.5px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .2px;
    text-shadow: 0 1px 2px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.55); background: linear-gradient(270deg, rgba(14,17,23,.62), rgba(14,17,23,0));
    border-right: 2px solid var(--lc, rgba(212,175,55,.6)); animation: lfIn .26s cubic-bezier(.2,.7,.2,1); text-align: right; }
  #loot-feed .lf b { color: var(--lc, #F5F2EB); font-weight: 800; }
  #loot-feed .lf { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #loot-feed .lf small { overflow: hidden; text-overflow: ellipsis; }
  #loot-feed .lf small { display: block; font-size: 10.5px; font-weight: 600; color: rgba(245,242,235,.62); margin-top: 1px; }
  #loot-feed .lf.out { animation: lfOut .35s ease-in forwards; }
  #loot-feed .lf.hi { box-shadow: inset -40px 0 40px -30px var(--lc); }
  @keyframes lfIn { from { opacity: 0; transform: translateX(26px); } to { opacity: 1; transform: none; } }
  @keyframes lfOut { to { opacity: 0; transform: translateX(16px); } }
  body.touch-ui #loot-feed { top: 200px; right: 62px; width: min(62vw, 300px); }
  body.touch-ui #loot-feed .lf { font-size: 11px; }
  #loot-toast-container { display: none !important; }

  /* emote wheel */
  #emote-wheel { position: fixed; left: 50%; top: 50%; width: 300px; height: 300px; margin: -150px 0 0 -150px; z-index: 45; pointer-events: none; opacity: 0; transform: scale(.9);
    transition: opacity .16s ease-out, transform .16s cubic-bezier(.2,.7,.2,1); }
  #emote-wheel.open { opacity: 1; transform: none; pointer-events: auto; }
  #emote-wheel .ew-ring { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle, rgba(14,17,23,0) 30%, rgba(14,17,23,.55) 31%, rgba(14,17,23,.5) 70%, rgba(14,17,23,0) 71%);
    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); -webkit-mask: radial-gradient(circle, transparent 30%, #000 31%, #000 70%, transparent 71%); mask: radial-gradient(circle, transparent 30%, #000 31%, #000 70%, transparent 71%); }
  #emote-wheel .ew-hair { position: absolute; inset: 0; border-radius: 50%; border: 1px solid rgba(212,175,55,.35); }
  #emote-wheel .ew-hair.in { inset: 90px; }
  #emote-wheel .ew-opt { position: absolute; width: 84px; height: 84px; margin: -42px 0 0 -42px; display: grid; place-items: center; text-align: center; border-radius: 50%; cursor: pointer;
    color: #F5F2EB; font: 700 11px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 1.2px; text-transform: uppercase; text-shadow: 0 1px 2px #000; transition: transform .15s, background-color .15s; }
  #emote-wheel .ew-opt span { display: block; font-size: 26px; letter-spacing: 0; filter: drop-shadow(0 2px 4px rgba(0,0,0,.6)); margin-bottom: 2px; }
  #emote-wheel .ew-opt.sel { transform: scale(1.12); background: radial-gradient(circle, rgba(212,175,55,.22), transparent 70%); color: #F3D98A; }
  #emote-wheel .ew-center { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); font: 700 10px 'Cinzel', serif; letter-spacing: 3px; color: rgba(245,242,235,.7); text-shadow: 0 1px 2px #000; }
  #emote-wheel .ew-ptr { position: absolute; left: 50%; top: 50%; width: 2px; height: 58px; margin-left: -1px; transform-origin: 50% 0; background: linear-gradient(180deg, transparent, #D4AF37); opacity: .8; }

  /* title screen */
  #cr-title { position: fixed; inset: 0; z-index: 80; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; color: #F5F2EB;
    background: radial-gradient(ellipse at 50% 55%, rgba(5,7,12,0) 30%, rgba(5,7,12,.55) 100%), linear-gradient(180deg, rgba(5,7,12,.45), rgba(5,7,12,0) 30%, rgba(5,7,12,0) 70%, rgba(5,7,12,.6));
    transition: opacity .6s ease; user-select: none; }
  #cr-title.out { opacity: 0; pointer-events: none; }
  #cr-title > div { white-space: nowrap; text-align: center; }
  #cr-title .t-cta, #cr-title .t-warm, #cr-title .t-foot { left: 0; right: 0; }
  body.cr-title-on #interact-prompt, body.cr-title-on #loot-feed, body.cr-title-on #tut-pill { visibility: hidden !important; }
  #cr-title .t-kick { font: 700 11px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 8px; color: #D4AF37; text-transform: uppercase; text-shadow: 0 0 12px rgba(212,175,55,.5); animation: tUp 1.2s .2s both; }
  #cr-title .t-name { font: 700 clamp(30px, 8vw, 96px) 'Cinzel', serif; letter-spacing: clamp(3px, 1.6vw, 22px); margin: 10px 0 6px; text-shadow: 0 2px 0 rgba(0,0,0,.35), 0 0 30px rgba(255,220,150,.35), 0 0 70px rgba(120,170,255,.2); animation: tTrack 1.8s cubic-bezier(.2,.8,.2,1) both; white-space: nowrap; }
  #cr-title .t-sub { font: 600 13px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 4px; color: rgba(245,242,235,.72); animation: tUp 1.2s .7s both; }
  #cr-title .t-line { display: flex; align-items: center; gap: 12px; margin-top: 16px; animation: tUp 1.2s .5s both; }
  #cr-title .t-line i { width: min(22vw, 200px); height: 1px; background: linear-gradient(90deg, transparent, rgba(212,175,55,.8)); }
  #cr-title .t-line i:last-child { background: linear-gradient(270deg, transparent, rgba(212,175,55,.8)); }
  #cr-title .t-line b { width: 8px; height: 8px; transform: rotate(45deg); border: 1px solid #F3D98A; box-shadow: 0 0 10px rgba(212,175,55,.8); }
  #cr-title .t-cta { position: absolute; bottom: 14%; font: 700 13px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 5px; text-transform: uppercase; text-shadow: 0 1px 3px #000; animation: tUp 1s 1.2s both, tPulse 2.2s 2.2s ease-in-out infinite; }
  #cr-title .t-foot { position: absolute; bottom: 22px; font: 600 10.5px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 1.5px; color: rgba(245,242,235,.45); }
  #cr-title .t-warm { position: absolute; bottom: 9%; font: 600 10px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 2px; color: rgba(245,242,235,.45); text-transform: uppercase; }
  @keyframes tTrack { from { letter-spacing: 40px; opacity: 0; filter: blur(8px); } }
  @keyframes tUp { from { opacity: 0; transform: translateY(10px); } }
  @keyframes tPulse { 50% { opacity: .45; } }
  body.cr-title-on #hero-modal { visibility: hidden !important; }
  body.cr-title-on #hud-top, body.cr-title-on #hud-bottom, body.cr-title-on #chat-panel, body.cr-title-on #minimap-wrap, body.cr-title-on #ui-quick,
  body.cr-title-on #ui-status, body.cr-title-on #ui-avatar, body.cr-title-on #touch-joystick, body.cr-title-on #emote-wheel, body.cr-title-on #ui-ident, body.cr-title-on #mmo-quick, body.cr-title-on #mmo-xpbar { visibility: hidden !important; }
  #hero-modal.cr-reveal .modal-box { animation: uiPop .35s cubic-bezier(.2,.7,.2,1); }
  `;

  // ---------------------------------------------------------------------------
  const PILLAR_V = `
    ${TERR}
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec4 w = modelMatrix * vec4(position, 1.0);
      w.y += terrainHeightAt(w.xz);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const PILLAR_F = `
    uniform vec3 uColor; uniform float uT; uniform float uA;
    varying vec2 vUv;
    void main() {
      float y = vUv.y;
      float body = pow(1.0 - y, 1.6) * smoothstep(0.0, 0.04, y);
      float streak = 0.75 + 0.25 * sin(vUv.x * 37.7 + uT * 2.0) * sin(y * 9.0 - uT * 3.0);
      vec3 col = uColor * body * streak * 1.6 + uColor * pow(1.0 - y, 10.0) * 0.6 + vec3(1.0) * pow(1.0 - y, 14.0) * 0.12;
      gl_FragColor = vec4(col * uA, 1.0);
    }`;

  function glowTexture() {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.85)'); r.addColorStop(0.45, 'rgba(255,255,255,0.22)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; return t;
  }

  const EMOTES = [
    { id: 'wave', label: 'Wave', icon: '👋', dur: 2.6 },
    { id: 'cheer', label: 'Cheer', icon: '🎉', dur: 2.6 },
    { id: 'sit', label: 'Sit', icon: '🪑', dur: 0 }       // until you move
  ];

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, spawnItemDrop: GP.spawnItemDrop,
    showLootToast: GP.showLootToast, handleRemotePlayerState: GP.handleRemotePlayerState,
    buildPlayerStatePayload: GP.buildPlayerStatePayload, showPlayerChatBubble: GP.showPlayerChatBubble,
    updateEntityChatBubble: GP.updateEntityChatBubble, playEntityAnim: GP.playEntityAnim, renderFrame: GP.renderFrame,
    perfectParry: GP.perfectParry, useSkill: GP.useSkill, dodgeRoll: GP.dodgeRoll
  };
  const _v = new THREE.Vector3();

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initSocial(); } catch (e) { console.warn('[Social] init failed', e); }
    },

    initSocial() {
      if (this._soc) return;
      this._soc = { orbs: [], t: 0, glow: glowTexture(), feed: null, wheel: null, emoteSel: 0 };
      const st = document.createElement('style'); st.id = 'social-css'; st.textContent = CSS; document.head.appendChild(st);
      const feed = document.createElement('div'); feed.id = 'loot-feed'; document.body.appendChild(feed); this._soc.feed = feed;
      this.buildEmoteWheel();
      this.bindSocialKeys();
      this.relabelTalentKey();
      if (!this.isInWorld && document.getElementById('hero-modal')?.classList.contains('active')) this.showTitleScreen();
    },

    // =========================================================================
    // 1) LOOT ORBS
    // =========================================================================
    spawnItemDrop(pos, item, gold, trophy) {
      if (!this._soc) return orig.spawnItemDrop.apply(this, arguments);
      const rid = item ? item.rarity : (trophy ? 'uncommon' : 'gold');
      const R = RAR[rid];
      const color = new THREE.Color(R ? R.color : '#f3c86b');
      const big = item ? 1 + (R ? R.idx : 0) * 0.08 : 0.75;
      const group = new THREE.Group();
      group.position.set(pos.x, 1.1, pos.z);
      // core gem + additive halo
      const core = new THREE.Mesh(item ? new THREE.OctahedronGeometry(0.17 * big, 0) : new THREE.IcosahedronGeometry(0.12, 0),
        new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.2) }));
      group.add(core);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._soc.glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 }));
      halo.scale.setScalar((item ? 1.25 : 0.9) * big);
      group.add(halo);
      // rarity pillar (grows once the orb settles)
      let pillar = null;
      if (item || trophy) {
        pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 1, 16, 1, true).translate(0, 0.5, 0),
          new THREE.ShaderMaterial({ uniforms: Object.assign({ uColor: { value: color }, uT: { value: 0 }, uA: { value: 0 } }, TU), vertexShader: PILLAR_V, fragmentShader: PILLAR_F,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        pillar.material.userData.noTerrain = true;
        pillar.material.customProgramCacheKey = () => 'cr-loot-pillar';
        pillar.scale.set(1, 0.01, 1);
        pillar.frustumCulled = false;
        this.scene.add(pillar);
      }
      this.scene.add(group);
      // burst: arc outward and up
      const a = Math.random() * Math.PI * 2, out = 2.2 + Math.random() * 2.4;
      const orb = {
        group, core, halo, pillar, item, gold: gold || 0, trophy, rid, color, big,
        vel: new THREE.Vector3(Math.cos(a) * out, 6.5 + Math.random() * 3.5, Math.sin(a) * out),
        settled: false, age: 0, bounces: 0, magnet: false, pillarH: item ? (PILLAR_H[rid] || 2) : 1.6, spin: (Math.random() - 0.5) * 6
      };
      this._soc.orbs.push(orb);
      // keep the legacy list consistent for other code that counts drops (never picked up there)
      return orb;
    },

    updateLootOrbs(dt) {
      const S = this._soc, p = this.player, orbs = S.orbs;
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i], g = o.group;
        o.age += dt;
        const dx = p.pos.x - g.position.x, dz = p.pos.z - g.position.z;
        const dy = (p.pos.y + 1.0) - g.position.y;
        const d = Math.hypot(dx, dy, dz);
        if (!o.magnet && o.age > 0.45 && d < 4 && !p.dead && o.age > (o.blockUntil || 0)) {
          o.magnet = true;
          if (o.pillar) o.pillarFade = true;
        }
        if (o.magnet) {
          // accelerate into the hero's chest
          const sp = Math.min(26, 6 + o.age * 3 + (4 - Math.min(4, d)) * 6);
          const k = Math.min(1, (sp * dt) / Math.max(0.001, d));
          g.position.x += dx * k; g.position.y += dy * k; g.position.z += dz * k;
          g.scale.setScalar(Math.max(0.4, Math.min(1, d / 1.2)));
          if (d < 0.55) {
            if (this.collectLootOrb(o)) { this.disposeLootOrb(o); orbs.splice(i, 1); continue; }
            // bag full: the orb pops back out and waits (the item is never lost)
            o.magnet = false; o.settled = false; o.blockUntil = o.age + 4; o.pillarFade = false;
            const a = Math.random() * Math.PI * 2;
            o.vel.set(Math.cos(a) * 3, 5, Math.sin(a) * 3); g.scale.setScalar(1);
          }
        } else if (!o.settled) {
          o.vel.y -= 22 * dt;
          g.position.addScaledVector(o.vel, dt);
          const floor = 0.42;
          if (g.position.y <= floor) {
            g.position.y = floor;
            if (Math.abs(o.vel.y) > 2.2 && o.bounces < 3) {
              o.vel.y = -o.vel.y * 0.42; o.vel.x *= 0.6; o.vel.z *= 0.6; o.bounces++;
              if (o.bounces === 1 && this.vfxSparks) this.vfxSparks(new THREE.Vector3(g.position.x, 0.2, g.position.z), 6, { cols: [o.color.getHex()], speed: [1.5, 3.5], life: [0.2, 0.4], grav: 6, width: 0.03 });
            } else { o.vel.set(0, 0, 0); o.settled = true; o.restT = 0; }
          }
          if (this.resolveObstacleCollisions && (o.vel.x || o.vel.z)) this.resolveObstacleCollisions(g.position, 0.25);
        } else {
          o.restT += dt;
          g.position.y = 0.42 + Math.sin(o.age * 2.4 + o.spin) * 0.09;     // idle bob
        }
        o.core.rotation.y += dt * (2.2 + o.spin * 0.2); o.core.rotation.x += dt * 0.7;
        o.halo.material.opacity = 0.75 + 0.25 * Math.sin(o.age * 5);
        if (o.pillar) {
          const pl = o.pillar;
          pl.position.set(g.position.x, 0, g.position.z);
          const u = pl.material.uniforms;
          u.uT.value = o.age;
          if (o.pillarFade) { u.uA.value = Math.max(0, u.uA.value - dt * 5); }
          else if (o.settled) {
            const k = Math.min(1, o.restT / 0.5);
            const e = 1 - Math.pow(1 - k, 3);
            pl.scale.set(1, Math.max(0.01, o.pillarH * e), 1);
            u.uA.value = Math.min(1, k * 1.4) * (0.85 + 0.15 * Math.sin(o.age * 3));
          }
        }
        // despawn very old, never-collected drops (5 min) so they can't pile up
        if (o.age > 300) { this.disposeLootOrb(o); orbs.splice(i, 1); }
      }
    },

    collectLootOrb(o) {
      const p = this.player;
      const rate = CHIME[o.rid] || 1.2;
      if (this.audio) {
        if (this.audio.playSample) this.audio.playSample('chime', rate, o.item ? 0.55 : 0.32);
        if (o.item && RAR[o.rid] && RAR[o.rid].idx >= 3 && this.audio.playLootChime) this.audio.playLootChime();
      }
      if (this.vfxSparks) this.vfxSparks(new THREE.Vector3(p.pos.x, 1.1, p.pos.z), o.item ? 14 : 5, { cols: [o.color.getHex(), 0xffffff], speed: [2, 5], life: [0.2, 0.4], grav: -2, width: 0.03 });
      if (o.item && this.mmoState && this.mmoState.bag && this.mmoState.bag.length >= (window.MMO.BAG_SIZE || 80)) {
        if (this.pickupItem) this.pickupItem(o.item);       // shows the 'bag full' notice, returns false
        return false;
      }
      if (o.gold) {
        p.gold += o.gold;
        if (!o.item) this.feedEntry(`<b>+${o.gold}</b> gold`, '#D4AF37');
      }
      if (o.trophy) {
        if (!p.bagItems) p.bagItems = {};
        p.bagItems[o.trophy.id] = (p.bagItems[o.trophy.id] || 0) + 1;
        this.feedEntry(`<b>${o.trophy.name}</b><small>Trophy</small>`, '#2ee68a');
      }
      if (o.item && this.pickupItem) {
        this._feedCtx = { color: RAR[o.rid] ? RAR[o.rid].color : '#F5F2EB', item: o.item, gold: o.gold };
        let ok = true;
        try { ok = this.pickupItem(o.item) !== false; } finally { this._feedCtx = null; }
        if (!ok) return false;
      }
      return true;
    },

    disposeLootOrb(o) {
      this.scene.remove(o.group);
      o.core.geometry.dispose(); o.core.material.dispose(); o.halo.material.dispose();
      if (o.pillar) { this.scene.remove(o.pillar); o.pillar.geometry.dispose(); o.pillar.material.dispose(); }
    },

    // side-screen loot feed (replaces the centred toast stack)
    showLootToast(msg) {
      if (!this._soc) return orig.showLootToast.apply(this, arguments);
      const ctx = this._feedCtx;
      if (ctx && ctx.item) {
        const it = ctx.item, R = RAR[it.rarity] || {};
        const up = /UPGRADE/.test(msg);
        this.feedEntry(`${it.icon || ''} <b>${it.name}</b>${up ? ' <b style="color:#5be39b">▲</b>' : ''}<small>${R.name || ''} · iLvl ${it.ilvl}${ctx.gold ? ` · +${ctx.gold} gold` : ''}</small>`, ctx.color, R.idx >= 3);
        return;
      }
      const clean = String(msg).replace(/[<>&]/g, '');
      this.feedEntry(clean, null);
    },

    feedEntry(html, color, hi) {
      const f = this._soc && this._soc.feed; if (!f) return;
      const el = document.createElement('div');
      el.className = 'lf' + (hi ? ' hi' : '');
      if (color) el.style.setProperty('--lc', color);
      el.innerHTML = html;
      f.appendChild(el);
      while (f.children.length > 6) f.firstChild.remove();
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 360); }, hi ? 6000 : 4200);
    },

    // =========================================================================
    // 2a) SNAPSHOT INTERPOLATION FOR REMOTE HEROES
    // =========================================================================
    buildPlayerStatePayload() {
      const pl = orig.buildPlayerStatePayload.apply(this, arguments);
      if (!pl) return pl;
      pl.ts = Math.round(performance.now());
      pl.pc = this._parries || 0;
      if (this._emote) pl.emote = this._emote.id;
      return pl;
    },

    handleRemotePlayerState(p, fromPresence) {
      const r = orig.handleRemotePlayerState.apply(this, arguments);
      if (!p || fromPresence || typeof p.ts !== 'number' || typeof p.x !== 'number') return r;
      const peer = this.remotePeers && this.remotePeers.get(p.id);
      if (!peer) return r;
      // events first (independent of position ordering)
      // remote Perfect Parry -> sparks on their shield
      if (typeof p.pc === 'number') {
        if (peer._pc !== undefined && p.pc > peer._pc) this.remoteParryFx(peer);
        peer._pc = p.pc;
      }
      // remote emotes
      const em = p.emote || null;
      if (em !== (peer._emoteId || null)) { peer._emoteId = em; this.startEmote(peer, em, true); }
      const now = performance.now();
      const off = now - p.ts;
      // clock offset: track the fastest delivery, relax slowly toward the current one
      if (peer._off === undefined || off < peer._off) peer._off = off; else peer._off += (off - peer._off) * 0.02;
      const t = p.ts + peer._off;
      const snaps = peer._snaps || (peer._snaps = []);
      if (snaps.length && t <= snaps[snaps.length - 1].t) return r;           // out of order / duplicate
      const last = snaps[snaps.length - 1];
      if (last && Math.hypot(p.x - last.x, p.z - last.z) > 25) snaps.length = 0;   // teleport / warp
      snaps.push({ t, x: p.x, y: p.y || 0, z: p.z, vx: p.vx || 0, vy: p.vy || 0, vz: p.vz || 0, yaw: typeof p.yaw === 'number' ? p.yaw : (last ? last.yaw : 0) });
      if (snaps.length > 24) snaps.shift();
      return r;
    },

    interpolatePeers() {
      if (!this.remotePeers || !this.remotePeers.size) return;
      const now = performance.now();
      const rt = now - INTERP_MS;
      this.remotePeers.forEach((peer) => {
        const s = peer._snaps;
        if (!s || !s.length || !peer.meshRoot) return;
        let x, y, z, yaw;
        if (rt <= s[0].t) { x = s[0].x; y = s[0].y; z = s[0].z; yaw = s[0].yaw; }
        else if (rt >= s[s.length - 1].t) {
          const L = s[s.length - 1];
          const ex = Math.min(0.25, (rt - L.t) / 1000);                       // brief extrapolation
          x = L.x + L.vx * ex; z = L.z + L.vz * ex; y = Math.max(0, L.y + L.vy * ex); yaw = L.yaw;
        } else {
          let i = s.length - 2;
          while (i > 0 && s[i].t > rt) i--;
          const a = s[i], b = s[i + 1];
          const span = Math.max(1, b.t - a.t), u = (rt - a.t) / span, sp = span / 1000;
          // cubic Hermite with the sent velocities: smooth through every snapshot
          const h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
          x = h00 * a.x + h10 * a.vx * sp + h01 * b.x + h11 * b.vx * sp;
          z = h00 * a.z + h10 * a.vz * sp + h01 * b.z + h11 * b.vz * sp;
          y = Math.max(0, a.y + (b.y - a.y) * u);
          let dyaw = b.yaw - a.yaw; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
          yaw = a.yaw + dyaw * u;
        }
        peer.pos.set(x, y, z);
        peer.targetPos.set(x, y, z);
        // smooth the facing a touch more so packet-rate yaw steps never read
        let dy = yaw - (peer._ry === undefined ? yaw : peer._ry); while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        peer._ry = (peer._ry === undefined ? yaw : peer._ry + dy * 0.5);
        peer.yaw = peer._ry;
        peer.meshRoot.position.set(x, y, z);
        peer.meshRoot.rotation.y = peer._ry;
        // remote rolls play the whole tumble at the local roll speed
        const ra = peer.actions && peer.actions.Roll;
        if (ra) {
          const want = peer.animState === 'Roll' ? ra.getClip().duration / 0.58 : 1;
          if (Math.abs(ra.getEffectiveTimeScale() - want) > 0.01) ra.setEffectiveTimeScale(want);
        }
      });
    },

    remoteParryFx(peer) {
      const at = new THREE.Vector3(peer.pos.x + Math.sin(peer.yaw) * 0.7, 1.25, peer.pos.z + Math.cos(peer.yaw) * 0.7);
      const dir = new THREE.Vector3(Math.sin(peer.yaw), 0, Math.cos(peer.yaw));
      if (this.spawnHitSparks) this.spawnHitSparks(at, dir, 0xffd56b, 22);
      if (this.spawnShockwaveRing) this.spawnShockwaveRing(new THREE.Vector3(at.x, 0.9, at.z), 2.6, 0xffe08a, 0.28);
      if (this.audio && this.audio.playAt) this.audio.playAt('mecha_impact', peer.pos, 1.6, 0.5, 40);
    },

    // =========================================================================
    // 2b) CHAT BUBBLES (translucent, pop-in, drift + fade)
    // =========================================================================
    showPlayerChatBubble(entity, message, durationMs = 4800) {
      if (!this._soc || !entity || !entity.meshRoot) return orig.showPlayerChatBubble.apply(this, arguments);
      const msg = String(message || '').trim();
      if (!msg) return;
      if (!entity._bub) {
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
        const tex = new THREE.CanvasTexture(canvas); tex.minFilter = THREE.LinearFilter;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
        sp.renderOrder = 15;
        entity._bub = { sp, canvas, ctx: canvas.getContext('2d'), tex };
        if (entity.chatBubbleSprite) entity.chatBubbleSprite.visible = false;
      }
      const B = entity._bub;
      if (B.sp.parent !== entity.meshRoot) entity.meshRoot.add(B.sp);
      const ctx = B.ctx, W = 512, H = 160;
      ctx.clearRect(0, 0, W, H);
      ctx.font = '700 27px "Plus Jakarta Sans", Inter, sans-serif';
      const words = msg.slice(0, 120).split(/\s+/), lines = [];
      let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (ctx.measureText(t).width > 420 && cur) { lines.push(cur); cur = w; if (lines.length >= 2) break; } else cur = t;
      }
      if (cur && lines.length < 3) lines.push(cur);
      if (lines.length === 3 && words.join(' ').length > lines.join(' ').length) lines[2] = lines[2].replace(/.{0,2}$/, '…');
      const lh = 31, bw = Math.min(480, Math.max(120, Math.max(...lines.map(l => ctx.measureText(l).width)) + 48));
      const bh = lines.length * lh + 26, bx = (W - bw) / 2, by = H - bh - 16, rr = bh / 2 > 26 ? 22 : bh / 2;
      const self = entity === this.player;
      ctx.beginPath();
      ctx.moveTo(bx + rr, by); ctx.arcTo(bx + bw, by, bx + bw, by + bh, rr); ctx.arcTo(bx + bw, by + bh, bx, by + bh, rr);
      ctx.lineTo(W / 2 + 9, by + bh); ctx.lineTo(W / 2, by + bh + 11); ctx.lineTo(W / 2 - 9, by + bh);
      ctx.arcTo(bx, by + bh, bx, by, rr); ctx.arcTo(bx, by, bx + bw, by, rr); ctx.closePath();
      ctx.fillStyle = 'rgba(14, 17, 23, 0.64)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = self ? 'rgba(212, 175, 55, 0.65)' : 'rgba(150, 215, 255, 0.55)'; ctx.stroke();
      ctx.fillStyle = '#F5F2EB'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
      lines.forEach((l, i) => ctx.fillText(l, W / 2, by + 13 + lh / 2 + i * lh));
      ctx.shadowBlur = 0;
      B.tex.needsUpdate = true;
      B.sp.visible = true;
      B.born = performance.now(); B.until = B.born + durationMs;
      B.baseY = (entity.plateY || 2.3) + 0.4;
      this.updateBubble(entity, B.born);
    },

    updateBubble(entity, now) {
      const B = entity._bub;
      if (!B || !B.sp.visible) return;
      const t = (now - B.born) / 1000, rem = (B.until - now) / 1000;
      if (rem <= 0) { B.sp.visible = false; return; }
      const pop = t < 0.18 ? 0.6 + 0.4 * (1 - Math.pow(1 - t / 0.18, 3)) : 1;
      const fade = rem < 0.7 ? rem / 0.7 : Math.min(1, t / 0.12);
      B.sp.material.opacity = fade;
      B.sp.scale.set(4.4 * pop, 1.375 * pop, 1);
      B.sp.position.set(0, B.baseY + Math.sin(t * 2.2) * 0.04 + (rem < 0.7 ? (0.7 - rem) * 0.5 : 0), 0);
    },

    updateEntityChatBubble(entity, nowMs) {
      if (entity && entity._bub) { this.updateBubble(entity, nowMs); return; }
      return orig.updateEntityChatBubble.apply(this, arguments);
    },

    // =========================================================================
    // 2c) EMOTES
    // =========================================================================
    buildEmoteWheel() {
      const w = document.createElement('div'); w.id = 'emote-wheel';
      let h = '<div class="ew-ring"></div><div class="ew-hair"></div><div class="ew-hair in"></div><div class="ew-ptr"></div><div class="ew-center">EMOTE</div>';
      EMOTES.forEach((e, i) => {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / EMOTES.length);
        h += `<div class="ew-opt" data-i="${i}" style="left:${150 + Math.cos(a) * 100}px;top:${150 + Math.sin(a) * 100}px"><div><span>${e.icon}</span>${e.label}</div></div>`;
      });
      w.innerHTML = h;
      document.body.appendChild(w);
      this._soc.wheel = w;
      w.addEventListener('mousemove', (e) => this.aimEmoteWheel(e.clientX, e.clientY));
      w.querySelectorAll('.ew-opt').forEach((el) => {
        el.addEventListener('mouseenter', () => this.selectEmote(+el.dataset.i));
        el.addEventListener('click', (e) => { e.stopPropagation(); this.selectEmote(+el.dataset.i); this.closeEmoteWheel(true); });
      });
      // phones: an emote button in the quick column
      const quick = document.getElementById('mmo-quick');
      if (quick && !quick.querySelector('[data-a="emote"]')) {
        const b = document.createElement('button'); b.setAttribute('aria-label', 'Emotes'); b.dataset.a = 'emote'; b.textContent = '😊';
        b.addEventListener('click', (e) => { e.stopPropagation(); this._soc.wheel.classList.contains('open') ? this.closeEmoteWheel(false) : this.openEmoteWheel(); });
        quick.appendChild(b);
      }
    },

    openEmoteWheel() {
      if (!this.isInWorld || this.isAnyModalOpen || this.player.dead) return;
      this._soc.wheel.classList.add('open');
      this._soc.wheelOpen = true;
      this.selectEmote(this._soc.emoteSel || 0);
    },

    closeEmoteWheel(perform) {
      const S = this._soc;
      if (!S.wheelOpen) return;
      S.wheel.classList.remove('open');
      S.wheelOpen = false;
      if (perform) this.performEmote(EMOTES[S.emoteSel].id);
    },

    aimEmoteWheel(cx, cy) {
      const dx = cx - window.innerWidth / 2, dy = cy - window.innerHeight / 2;
      if (Math.hypot(dx, dy) < 28) return;
      let a = Math.atan2(dy, dx) + Math.PI / 2;
      if (a < 0) a += Math.PI * 2;
      this.selectEmote(Math.round(a / (Math.PI * 2 / EMOTES.length)) % EMOTES.length);
    },

    selectEmote(i) {
      const S = this._soc;
      S.emoteSel = i;
      S.wheel.querySelectorAll('.ew-opt').forEach(el => el.classList.toggle('sel', +el.dataset.i === i));
      const ptr = S.wheel.querySelector('.ew-ptr');
      ptr.style.transform = `rotate(${180 + i * 360 / EMOTES.length}deg)`;
    },

    performEmote(id) {
      const p = this.player;
      if (!p || p.dead || this._roll || this._blocking) return;
      this.startEmote(p, id, false);
      if (this.broadcastPlayerState) this.broadcastPlayerState(false);
    },

    startEmote(ent, id, remote) {
      const prev = ent._emote;
      if (prev) this.endEmote(ent, true);
      if (!id) return;
      const E = EMOTES.find(e => e.id === id);
      if (!E) return;
      ent._emote = { id, t: 0, dur: E.dur, remote };
      if (ent === this.player) this._emote = ent._emote;
      if (id === 'sit') {
        const a = ent.actions && ent.actions.LayToIdle;
        if (a) {
          orig.playEntityAnim.call(this, ent, 'LayToIdle', true);
          a.time = 0.05; a.setEffectiveTimeScale(1);
          ent._emote.sitA = a;
        }
      } else {
        orig.playEntityAnim.call(this, ent, ent.actions && ent.actions.Idle_Loop ? 'Idle_Loop' : this.getEntityIdleAnim(ent), true);
      }
      if (id === 'cheer' && this.vfxSparks) {
        this.vfxSparks(new THREE.Vector3(ent.pos.x, 2.2, ent.pos.z), 30, { cols: [0xffd56b, 0x7fe3ff, 0xff7aa8, 0xb8ff8a], speed: [3, 7], life: [0.6, 1.1], grav: 7, drag: 1.5, width: 0.06, upBias: 1.2 });
      }
    },

    endEmote(ent, silent) {
      const e = ent._emote;
      if (!e) return;
      ent._emote = null;
      if (ent === this.player) { this._emote = null; if (!silent && this.broadcastPlayerState) this.broadcastPlayerState(false); }
      if (e.sitA) e.sitA.setEffectiveTimeScale(1);
      if (ent.meshRoot) ent.meshRoot.position.y = ent.pos.y || 0;
    },

    // hold the emote pose against idle / locomotion requests
    playEntityAnim(entity, name, force) {
      const e = entity && entity._emote;
      if (e && (name === this.getEntityIdleAnim(entity) || /^(Idle|Jog|Walk|Sprint)/.test(name))) {
        const moving = entity === this.player ? this.isMoveInputHeld() : /^(Jog|Walk|Sprint)/.test(name);
        if (!moving) return;
        this.endEmote(entity);
      } else if (e && name !== 'LayToIdle') this.endEmote(entity);
      return orig.playEntityAnim.apply(this, arguments);
    },

    isMoveInputHeld() {
      const k = this.keys || {};
      return !!(k.w || k.a || k.s || k.d || k.arrowup || k.arrowdown || k.arrowleft || k.arrowright || (this.touchVec && (Math.abs(this.touchVec.x) + Math.abs(this.touchVec.y) > 0.15)));
    },

    useSkill(slot, isRemoteOrAI, actor) {
      const ent = actor || this.player;
      if (ent && ent._emote) this.endEmote(ent);
      return orig.useSkill.apply(this, arguments);
    },

    // procedural layer on top of the mixer (runs after mixers update, before render)
    applyEmotePose(ent, dt) {
      const e = ent._emote;
      if (!e) return;
      e.t += dt;
      if (e.dur && e.t >= e.dur && !e.remote) { this.endEmote(ent); return; }
      if (e.dur && e.t >= e.dur + 1.5 && e.remote) { this.endEmote(ent, true); return; }
      if (!ent._bones) {
        ent._bones = {};
        if (ent.meshRoot) ent.meshRoot.traverse((o) => { if (o.isBone) ent._bones[o.name] = o; });
      }
      const B = ent._bones;
      const ease = Math.min(1, e.t / 0.25) * (e.dur ? Math.min(1, Math.max(0, (e.dur - e.t) / 0.3)) : 1);
      if (e.id === 'wave' && B.upperarm_r && B.lowerarm_r) {
        B.upperarm_r.rotation.z -= 1.55 * ease;
        B.upperarm_r.rotation.y -= 0.35 * ease;
        B.lowerarm_r.rotation.z -= (0.9 + Math.sin(e.t * 9) * 0.45) * ease;
        if (B.Head) B.Head.rotation.z += Math.sin(e.t * 4.5) * 0.06 * ease;
      } else if (e.id === 'cheer' && B.upperarm_r && B.upperarm_l) {
        const pump = 0.25 * Math.sin(e.t * 10);
        B.upperarm_r.rotation.z -= (1.75 + pump) * ease;
        B.upperarm_l.rotation.z += (1.75 + pump) * ease;
        if (B.lowerarm_r) B.lowerarm_r.rotation.z -= 0.4 * ease;
        if (B.lowerarm_l) B.lowerarm_l.rotation.z += 0.4 * ease;
        if (ent.meshRoot) ent.meshRoot.position.y = (ent.pos.y || 0) + Math.abs(Math.sin(e.t * 5.2)) * 0.32 * ease;
      } else if (e.id === 'sit' && e.sitA) {
        // play the get-up clip backwards into a seated pose, then hold it
        const target = 0.72;
        if (e.sitA.time < target) e.sitA.time = Math.min(target, e.sitA.time + dt * 1.1);
        e.sitA.setEffectiveTimeScale(0);
      }
    },

    bindSocialKeys() {
      // capture phase: T = emote wheel (hold, aim, release), K = talents (instead of heavy-skill alias)
      window.addEventListener('keydown', (e) => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        const k = e.key.toLowerCase();
        if (k === 't') {
          e.preventDefault(); e.stopImmediatePropagation();
          if (!e.repeat && !this._soc.wheelOpen && !this.cutsceneActive) { this.openEmoteWheel(); this._soc.wheelAt = performance.now(); }
        } else if (k === 'k') {
          e.preventDefault(); e.stopImmediatePropagation();
          if (e.repeat || this.cutsceneActive) return;
          const open = document.getElementById('talent-modal')?.classList.contains('active');
          if (open) this.closeModals();
          else if (!this.isAnyModalOpen && this.isInWorld && this.toggleTalents) this.toggleTalents();
        } else if (k === 'escape' && this._soc.wheelOpen) {
          e.stopImmediatePropagation(); this.closeEmoteWheel(false);
        }
      }, true);
      window.addEventListener('keyup', (e) => {
        if (e.key.toLowerCase() === 't' && this._soc.wheelOpen) {
          // a quick tap keeps the wheel open for mouse picking; a hold+release performs the aimed emote
          if (performance.now() - (this._soc.wheelAt || 0) > 260) this.closeEmoteWheel(true);
        }
      }, true);
      window.addEventListener('mousemove', (e) => { if (this._soc.wheelOpen) this.aimEmoteWheel(e.clientX, e.clientY); });
      window.addEventListener('mousedown', (e) => {
        if (this._soc.wheelOpen && !e.target.closest('#emote-wheel')) { e.stopPropagation(); this.closeEmoteWheel(e.button === 0); }
      }, true);
    },

    relabelTalentKey() {
      const tb = document.getElementById('btn-talents');
      if (tb && tb.firstChild && tb.firstChild.nodeType === 3) tb.firstChild.textContent = '✦ Talents [K]';
      const q = document.querySelector('#ui-quick [data-a="talents"]');
      if (q) q.dataset.tip = 'Talents [K]';
      const close = document.getElementById('tal-close');
      if (close) close.textContent = '✕ Close [K / ESC]';
    },

    // =========================================================================
    // 3) LIVE TITLE SCREEN + SHADER PRE-WARM
    // =========================================================================
    showTitleScreen() {
      if (document.getElementById('cr-title')) return;
      const t = document.createElement('div');
      t.id = 'cr-title';
      t.innerHTML = `<div class="t-kick">A Co-Op Action RPG</div><div class="t-name">CHRONO-RIFT</div><div class="t-sub">CHRONICLES OF ASHENVALE</div>
        <div class="t-line"><i></i><b></b><i></i></div><div class="t-cta">Click to Enter World</div><div class="t-warm" id="cr-warm"></div>
        <div class="t-foot">WASD move · Space dodge · RMB parry · F1 controls</div>`;
      document.body.appendChild(t);
      document.body.classList.add('cr-title-on');
      this._title = { t: 0, mx: 0, my: 0, cx: this.player.pos.x, cz: this.player.pos.z };
      const go = () => this.dismissTitleScreen();
      t.addEventListener('click', go);
      this._titleKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
      window.addEventListener('keydown', this._titleKey, true);
      t.addEventListener('mousemove', (e) => { this._title.mx = e.clientX / window.innerWidth - 0.5; this._title.my = e.clientY / window.innerHeight - 0.5; });
      // compile every shader while the player is looking at the title
      setTimeout(() => this.prewarmShaders(), 400);
    },

    dismissTitleScreen() {
      const t = document.getElementById('cr-title');
      if (!t || t.classList.contains('out')) return;
      if (this.audio) this.audio.init();
      t.classList.add('out');
      window.removeEventListener('keydown', this._titleKey, true);
      document.body.classList.remove('cr-title-on');
      const hm = document.getElementById('hero-modal');
      if (hm) { hm.classList.add('cr-reveal'); setTimeout(() => hm.classList.remove('cr-reveal'), 400); }
      this._title = null;
      setTimeout(() => t.remove(), 650);
      if (this.audio && this.audio.playSample) this.audio.playSample('ui_open', 1.0, 0.35);
    },

    prewarmShaders() {
      const r = this.renderer;
      if (!r || this._prewarmed) return;
      this._prewarmed = true;
      const t0 = performance.now(), before = r.info.programs ? r.info.programs.length : 0;
      const far = new THREE.Vector3(this.player.pos.x, -400, this.player.pos.z);     // under the world: compiled, never seen
      try {
        if (this.spawnHitSparks) this.spawnHitSparks(far, new THREE.Vector3(0, 1, 0), 0xffd56b, 4);
        if (this.spawnShockwaveRing) this.spawnShockwaveRing(far, 2, 0xffd56b, 0.2);
        if (this.spawnSlashArc) { this.spawnSlashArc(far, 0, 3, 0xffd56b, 0, false); this.spawnSlashArc(far, 0, 3, 0xffd56b, 2, true); }
        if (this.spawnVFXFlipbook) ['impact', 'bighit', 'smallhit', 'eldenring', 'vortex', 'charged', 'explosion', 'anima'].forEach(k => { try { this.spawnVFXFlipbook(k, far, 1, 0.1, 0xffffff, false, { depthTest: false }); this.spawnVFXFlipbook(k, far, 1, 0.1, 0xffffff, true); } catch (e) { /* missing atlas */ } });
        if (this.vfxFlash) { this.vfxFlash(far, 1, 0xffffff, 0xffffff, 0.05); this.vfxSparks(far, 2, {}); this.vfxRune(far, 1, 0xffffff, 0xffffff, 0.05); this.vfxShock(far, 1, 1, 0xffffff, 0xffffff, { dur: 0.05 }); this.vfxArc(far, 0, 1, 0xffffff, 0xffffff, { dur: 0.05 }); this.vfxPillar(far, 1, 0.3, 0xffffff, 0xffffff, 0); }
        const orb = orig.spawnItemDrop ? this.spawnItemDrop(far, { rarity: 'epic', name: 'x', ilvl: 1 }, 0, null) : null;
        if (this.spawnProjectile) this.spawnProjectile(far.clone(), new THREE.Vector3(0, 0, 1), 1, 0, 0xffffff, true, true, { life: 0.05 });
        r.compile(this.scene, this.camera);
        if (orb) { const i = this._soc.orbs.indexOf(orb); if (i >= 0) this._soc.orbs.splice(i, 1); this.disposeLootOrb(orb); }
      } catch (e) { console.warn('[Social] prewarm', e); }
      const after = r.info.programs ? r.info.programs.length : 0;
      this._prewarmInfo = { ms: Math.round(performance.now() - t0), programsBefore: before, programsAfter: after };
      const w = document.getElementById('cr-warm');
      if (w) w.textContent = `${after} shaders ready`;
    },

    renderFrame() {
      const T = this._title;
      if (T && this.camera) {
        // slow cinematic orbit over the live world, with a little mouse parallax
        T.t += 1 / 60;
        const a = T.t * 0.07 + 0.6, R = 46 + Math.sin(T.t * 0.11) * 8;
        const cx = T.cx, cz = T.cz;
        const th = this.terrainVisualHeight ? this.terrainVisualHeight(cx + Math.sin(a) * R, cz + Math.cos(a) * R) : 0;
        this.camera.position.set(cx + Math.sin(a) * R, Math.max(th + 6, 17 + Math.sin(T.t * 0.17) * 4 + (T.my || 0) * -6), cz + Math.cos(a) * R);
        _v.set(cx + Math.sin(a + 1.9) * 14 + (T.mx || 0) * 10, 4 + (T.my || 0) * 3, cz + Math.cos(a + 1.9) * 14);
        this.camera.lookAt(_v);
        if (Math.abs(this.camera.fov - 52) > 0.1) { this.camera.fov = 52; this.camera.updateProjectionMatrix(); }
      }
      return orig.renderFrame.apply(this, arguments);
    },

    // =========================================================================
    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (!this._soc) return;
      this._soc.t += dt;
      this.updateLootOrbs(dt);
      this.interpolatePeers();
      if (this.player._emote) this.applyEmotePose(this.player, dt);
      if (this.remotePeers) this.remotePeers.forEach(pe => { if (pe._emote) this.applyEmotePose(pe, dt); });
      if (this._emote && (this.isMoveInputHeld() || this._roll || this._blocking || this.player.dead)) this.endEmote(this.player);
      if (this._title && this.isInWorld) this.dismissTitleScreen();
    }
  });

  window.CR_SOCIAL = { EMOTES };
})();
