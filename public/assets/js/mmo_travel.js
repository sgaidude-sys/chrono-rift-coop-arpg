/* =============================================================================
 * Chrono-Rift — travel: swimming + mounts
 *
 *  Swimming
 *   • In water deeper than ~1.3 m the hero floats at the surface instead of
 *     walking on the lake bed: body pitches forward while moving (upright and
 *     bobbing while treading water), slower movement, splashes and a splash
 *     sound on entry. No attacks, dodges or jumps while swimming. The camera
 *     stays above the surface. Remote heroes swim too (derived from position).
 *
 *  Mounts (two per player, unlocked by level)
 *   • B  Ashen Steed  (land, Lv 5)  — ×1.9 speed, follows the ground.
 *        (Quaternius CC0 horse, models/mounts/horse.glb)
 *   • N  Ember Drake  (flying, Lv 15) — ×2.7 speed, cruises ~11 m above the
 *        terrain over water and hills (zone borders still apply).
 *        ("Low Poly Flying Dragon" by CarolaBug, CC BY 4.0, models/mounts/ember_drake.glb)
 *   • Mount/dismount with the key again, the HUD buttons, or by attacking.
 *     Can't mount in combat (recently hit / hostile mobs hunting you) or while
 *     swimming (the drake can take off from water). Taking a hit dismounts;
 *     a land mount walking into deep water dismounts and you swim.
 *   • Mount state is shared in player_state, so co-op partners see your mount.
 * ============================================================================= */
(function () {
  'use strict';
  const M = window.MMO || {};
  const W = M.WORLD || {};
  const WL = W.waterLevel !== undefined ? W.waterLevel : -2.0;
  const SWIM_IN = 1.32, SWIM_OUT = 1.18;      // water depth hysteresis (m)
  const MOUNTS = {
    land: { id: 'land', key: 'B', name: 'Ashen Steed', model: 'mount/horse', file: 'models/mounts/horse.glb', clips: { idle: 'Idle', move: 'Gallop' }, unlock: 5, speed: 1.9, height: 2.2, seat: 0.65, seatZ: -0.25, tint: 0xffffff },
    // model units: ~16.5 long, head toward +z; saddle between the wing roots at (0, 2.7, -2)
    fly: { id: 'fly', key: 'N', name: 'Ember Drake', model: 'mount/ember_drake', file: 'models/mounts/ember_drake.glb', clips: { idle: 'Fly 2', move: 'Fly' },
      unlock: 15, speed: 2.7, scale: 0.33, offset: [0, -2.7 * 0.33, 2 * 0.33], seat: -0.41, seatZ: -0.9, alt: 11, idleRate: 0.7, tint: 0xffffff }
  };
  const ICON = {
    land: '<svg viewBox="0 0 24 24"><path d="M4 15c1-4 4-6 8-6h3l3-3 1 4-2 2v3l-2 3M8 15v4M14 17v2M6 9l2-3"/></svg>',
    fly: '<svg viewBox="0 0 24 24"><path d="M12 13c-1-4-4-7-9-7 2 2 3 4 3 7 2-1 4-1 6 0zM12 13c1-4 4-7 9-7-2 2-3 4-3 7-2-1-4-1-6 0zM12 13v6"/></svg>'
  };
  const CSS = `
  #travel-bar { position: fixed; left: 50%; bottom: 108px; transform: translateX(-50%); display: flex; gap: 10px; z-index: 13; pointer-events: none; }
  #travel-bar button { pointer-events: auto; all: unset; box-sizing: border-box; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; position: relative;
    background: rgba(14,17,23,.55); border: 1px solid rgba(212,175,55,.45); box-shadow: 0 2px 10px rgba(0,0,0,.45); transition: transform .18s, border-color .18s, background .18s; pointer-events: auto; }
  #travel-bar button:hover { transform: translateY(-2px); border-color: #D4AF37; }
  #travel-bar button.on { background: rgba(212,175,55,.28); border-color: #F5F2EB; }
  #travel-bar button.locked { opacity: .45; cursor: default; }
  #travel-bar svg { width: 20px; height: 20px; fill: none; stroke: #F5F2EB; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  #travel-bar kbd { position: absolute; bottom: -7px; right: -5px; font: 700 9px 'Plus Jakarta Sans', sans-serif; color: #F5F2EB; background: rgba(14,17,23,.9); border: 1px solid rgba(245,242,235,.4); border-radius: 3px; padding: 0 4px; }
  #travel-bar .lv { position: absolute; top: -8px; left: 50%; transform: translateX(-50%); font: 700 9px 'Plus Jakarta Sans', sans-serif; color: #D4AF37; white-space: nowrap; text-shadow: 0 1px 2px #000; }
  body.touch-ui #travel-bar { left: auto; right: 12px; bottom: auto; top: 46%; flex-direction: column; transform: none; }
  body.touch-ui #travel-bar kbd { display: none; }
  body.cr-title-on #travel-bar, body.hs-open #travel-bar, body.epic-cine #travel-bar { visibility: hidden; }
  `;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, getMoveSpeedMult: GP.getMoveSpeedMult,
    useSkill: GP.useSkill, dodgeRoll: GP.dodgeRoll, cameraRig: GP.cameraRig, renderFrame: GP.renderFrame,
    playEntityAnim: GP.playEntityAnim, damagePlayer: GP.damagePlayer, buildPlayerStatePayload: GP.buildPlayerStatePayload,
    handleRemotePlayerState: GP.handleRemotePlayerState, gainXP: GP.gainXP, attachWeaponsToEntity: GP.attachWeaponsToEntity
  };
  const _v = new THREE.Vector3();
  const depthAt = (g, x, z) => WL - (g.terrainVisualHeight ? g.terrainVisualHeight(x, z) : 0);

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initTravel(); } catch (e) { console.warn('[Travel] init failed', e); }
    },

    initTravel() {
      if (this._trv) return;
      const st = document.createElement('style'); st.id = 'travel-css'; st.textContent = CSS; document.head.appendChild(st);
      const bar = document.createElement('div'); bar.id = 'travel-bar';
      bar.innerHTML = Object.values(MOUNTS).map(d => `<button type="button" data-m="${d.id}" aria-label="${d.name}">${ICON[d.id]}<kbd>${d.key}</kbd><span class="lv"></span></button>`).join('');
      document.body.appendChild(bar);
      bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.toggleMount(b.dataset.m); });
      this._trv = { bar, camLift: 0, camLiftApplied: 0, splashT: 0, lastHitAt: -1e9, unlockedSeen: {} };
      try { this._trv.unlockedSeen = JSON.parse(localStorage.getItem('cr_mounts_seen') || '{}'); } catch (e) { /* storage blocked */ }
      window.addEventListener('keydown', (e) => {
        if (e.repeat || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
        if (!this.isInWorld || this.isAnyModalOpen || this.cutsceneActive) return;
        const k = e.key.toLowerCase();
        if (k === 'b') { e.preventDefault(); e.stopImmediatePropagation(); this.toggleMount('land'); }
        else if (k === 'n') { e.preventDefault(); e.stopImmediatePropagation(); this.toggleMount('fly'); }
      }, true);
      this.refreshTravelBar();
    },

    // ======================================================================
    // Mounts
    // ======================================================================
    mountUnlocked(id) { const d = MOUNTS[id]; return !!d && (this.player.level || 1) >= d.unlock; },

    inCombatForMount() {
      const p = this.player;
      if (performance.now() - this._trv.lastHitAt < 4000) return true;
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (!m.dead && m.hp > 0 && m.aggroTimer > 0 && Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 22) return true;
      }
      return false;
    },

    toggleMount(id) {
      const p = this.player;
      if (!p || p.dead) return;
      if (p._mount && (p._mount.id === id || !id)) { this.dismount(true); return; }
      const d = MOUNTS[id]; if (!d) return;
      if (!this.mountUnlocked(id)) { this.travelToast(`${d.name} unlocks at level ${d.unlock}`); return; }
      if (this.inCombatForMount()) { this.travelToast("Can't mount while in combat"); return; }
      if (p._swim && id === 'land') { this.travelToast("Can't ride the steed while swimming"); return; }
      if (p._mount) this.dismount(false);
      this.mountEntity(p, id, true);
      this.refreshTravelBar();
      if (this.broadcastPlayerState) this.broadcastPlayerState(false);
    },

    dismount(fx) {
      const p = this.player;
      if (!p._mount) return;
      this.unmountEntity(p, fx);
      this.refreshTravelBar();
      if (this.broadcastPlayerState) this.broadcastPlayerState(false);
    },

    mountEntity(ent, id, local) {
      const d = MOUNTS[id]; if (!d || !ent.meshRoot) return;
      const mt = { id, d, root: new THREE.Group(), mixer: null, actions: {}, cur: '', alt: 0, k: 0, ready: false };
      ent._mount = mt;
      this.scene.add(mt.root);
      mt.root.position.copy(ent.pos);
      this.loadMountModel(d, (ok) => {
        if (!ok || ent._mount !== mt) return;
        const tpl = this.modelCache[d.model];
        const c = (typeof cloneSkinnedModel === 'function') ? cloneSkinnedModel(tpl) : tpl.clone();
        if (d.scale) { c.scale.setScalar(d.scale); c.position.set(d.offset[0], d.offset[1], d.offset[2]); }
        else {
          const s = d.height / (tpl.userData.rawHeight || 1);
          c.scale.setScalar(s);
          c.position.y = -(tpl.userData.minY || 0) * s;
        }
        const tc = new THREE.Color(d.tint);
        c.traverse((o) => {
          o.frustumCulled = false;
          if (o.isMesh) {
            o.castShadow = true;
            o.material = o.material.clone();
            if (o.isSkinnedMesh) o.material.skinning = true;
            if (o.material.color && d.tint !== 0xffffff) o.material.color.lerp(tc, 0.3);
          }
        });
        mt.root.add(c); mt.model = c;
        const clips = (this.modelAnimClips && this.modelAnimClips[d.model]) || {};
        mt.mixer = new THREE.AnimationMixer(c);
        ['idle', 'move'].forEach((k) => { const cl = clips[d.clips[k]]; if (cl) mt.actions[k] = mt.mixer.clipAction(cl); });
        mt.ready = true;
      });
      if (local || this.near(ent, 60)) this.mountPuff(ent, d, true);
      if (local) this.travelToast(d.name);
    },

    unmountEntity(ent, fx) {
      const mt = ent._mount; if (!mt) return;
      ent._mount = null;
      if (fx && this.near(ent, 60)) this.mountPuff(ent, mt.d, false);
      this.scene.remove(mt.root);
      if (mt.mixer) mt.mixer.stopAllAction();
      mt.root.traverse((o) => { if (o.isMesh && o.material) o.material.dispose(); });
      if (ent.glbNode) { ent.glbNode.position.z = 0; }
      if (ent.meshRoot) ent.meshRoot.position.y = ent.pos.y || 0;
      this.stowWeapons(ent, false);
    },

    mountPuff(ent, d, on) {
      const y = (ent._mount && ent._mount.alt) || 0;
      _v.set(ent.pos.x, 0.6 + y, ent.pos.z);
      if (this.vfxSparks) this.vfxSparks(_v, 26, { cols: [0xffffff, d.tint, 0xD4AF37], speed: [3, 7], life: [0.3, 0.6], grav: -1, width: 0.05 });
      if (this.vfxFlash) this.vfxFlash(_v, 2.6, d.tint, 0xffffff, 0.24);
      if (this.audio && this.audio.playSample) this.audio.playSample(on ? 'summon' : 'blink', on ? 1.2 : 1.0, 0.35);
    },

    // qm/ monsters reuse the monster loader; standalone mount GLBs load here
    loadMountModel(d, cb) {
      if (!d.file) return this.ensureMobModel(d.model, cb);
      if (this.modelCache[d.model]) { cb(true); return; }
      this._mountWait = this._mountWait || {};
      if (this._mountWait[d.model]) { this._mountWait[d.model].push(cb); return; }
      this._mountWait[d.model] = [cb];
      const done = (ok) => { const w = this._mountWait[d.model]; delete this._mountWait[d.model]; w.forEach(f => f(ok)); };
      const base = (document.querySelector('script[src*="mmo_travel.js"]') || {}).src || '';
      const url = base.replace(/js\/mmo_travel\.js.*$/, '') + d.file;
      this.loader.load(url, (gltf) => {
        const box = new THREE.Box3().setFromObject(gltf.scene), size = new THREE.Vector3();
        box.getSize(size);
        gltf.scene.userData.rawHeight = Math.max(0.05, size.y);
        gltf.scene.userData.minY = box.min.y;
        this.modelCache[d.model] = gltf.scene;
        this.modelAnimClips = this.modelAnimClips || {};
        const clips = {};
        gltf.animations.forEach((cl) => { if (!clips[cl.name]) clips[cl.name] = cl; });
        this.modelAnimClips[d.model] = clips;
        done(true);
      }, undefined, () => done(false));
    },

    near(ent, r) { return Math.hypot(this.player.pos.x - ent.pos.x, this.player.pos.z - ent.pos.z) < r; },

    travelToast(text) {
      if (this.spawnFloatingText) this.spawnFloatingText(this.player.pos.clone().add(_v.set(0, 2.6, 0)), text, '#F5F2EB', 15);
    },

    refreshTravelBar() {
      const T = this._trv; if (!T) return;
      const p = this.player;
      T.bar.querySelectorAll('button').forEach((b) => {
        const d = MOUNTS[b.dataset.m];
        const un = this.mountUnlocked(d.id);
        b.classList.toggle('locked', !un);
        b.classList.toggle('on', !!(p._mount && p._mount.id === d.id));
        b.querySelector('.lv').textContent = un ? '' : `Lv ${d.unlock}`;
        b.title = un ? `${d.name} (${d.key})` : `${d.name} — unlocks at level ${d.unlock}`;
      });
    },

    gainXP() {
      const before = this.player.level;
      const r = orig.gainXP ? orig.gainXP.apply(this, arguments) : undefined;
      if (this._trv && this.player.level !== before) {
        Object.values(MOUNTS).forEach((d) => {
          if (before < d.unlock && this.player.level >= d.unlock && !this._trv.unlockedSeen[d.id]) {
            this._trv.unlockedSeen[d.id] = 1;
            try { localStorage.setItem('cr_mounts_seen', JSON.stringify(this._trv.unlockedSeen)); } catch (e) { /* storage blocked */ }
            if (this.showLootToast) this.showLootToast(`New mount: ${d.name} — press ${d.key} to ride`);
          }
        });
        this.refreshTravelBar();
      }
      return r;
    },

    getMoveSpeedMult() {
      let m = orig.getMoveSpeedMult ? orig.getMoveSpeedMult.call(this) : 1;
      const p = this.player;
      if (p._mount) m *= p._mount.d.speed;
      else if (p._swim) m *= 0.62;
      return m;
    },

    attachWeaponsToEntity(entity) {
      if (entity && entity._mount) this.stowWeapons(entity, false);
      return orig.attachWeaponsToEntity ? orig.attachWeaponsToEntity.apply(this, arguments) : undefined;
    },

    useSkill(slot, isRemoteOrAI, actor) {
      const ent = actor || this.player;
      if (ent === this.player && !isRemoteOrAI) {
        if (this.player._swim && !this.player._mount) return;        // no fighting while swimming
        if (this.player._mount) this.dismount(true);                   // attacking dismounts
      }
      return orig.useSkill.apply(this, arguments);
    },

    dodgeRoll() {
      if (this.player._swim && !this.player._mount) return;
      if (this.player._mount) { this.dismount(true); return; }
      return orig.dodgeRoll.apply(this, arguments);
    },

    damagePlayer() {
      const before = this.player.hp;
      const r = orig.damagePlayer.apply(this, arguments);
      if (this._trv && this.player.hp < before) {
        this._trv.lastHitAt = performance.now();
        if (this.player._mount) this.dismount(true);
      }
      return r;
    },

    // hold a calm idle on the hero while riding / treading water; locomotion clip while swimming
    playEntityAnim(entity, name, force) {
      if (entity && entity._mount && /^(Jog|Walk|Sprint|Idle|Sword_Idle|Jump)/.test(name)) name = 'Idle_Loop';
      return orig.playEntityAnim.call(this, entity, name, force);
    },

    // ---- networking: share the mount -----------------------------------------
    buildPlayerStatePayload() {
      const pl = orig.buildPlayerStatePayload.apply(this, arguments);
      if (pl && this.player) pl.mt = this.player._mount ? this.player._mount.id : '';
      return pl;
    },
    handleRemotePlayerState(payload) {
      const r = orig.handleRemotePlayerState.apply(this, arguments);
      if (payload && payload.id && this.remotePeers) {
        const peer = this.remotePeers.get(payload.id);
        if (peer && this._trv) {
          const want = payload.mt || '';
          const cur = peer._mount ? peer._mount.id : '';
          if (want !== cur) { if (cur) this.unmountEntity(peer, true); if (want && MOUNTS[want]) this.mountEntity(peer, want, false); }
        }
      }
      return r;
    },

    // ======================================================================
    // Per-frame: swim + mount poses (runs after mixers, before render)
    // ======================================================================
    updateTravelEntity(ent, dt, local) {
      if (!ent || !ent.meshRoot || !ent.pos) return;
      const depth = depthAt(this, ent.pos.x, ent.pos.z);
      const mt = ent._mount;
      // land mount walking into deep water -> dismount and swim
      if (mt && mt.id === 'land' && depth > SWIM_IN + 0.2) {
        if (local) { this.dismount(true); this.travelToast('Too deep to ride'); } else this.unmountEntity(ent, true);
      }
      const was = !!ent._swim;
      ent._swim = !ent._mount && (was ? depth > SWIM_OUT : depth > SWIM_IN);
      const vx = ent.vel ? ent.vel.x : 0, vz = ent.vel ? ent.vel.z : 0;
      let moving = Math.hypot(vx, vz) > 0.8;
      if (!local) {   // peers: infer movement from position deltas
        const lx = ent._trvLX === undefined ? ent.pos.x : ent._trvLX, lz = ent._trvLZ === undefined ? ent.pos.z : ent._trvLZ;
        moving = Math.hypot(ent.pos.x - lx, ent.pos.z - lz) / Math.max(dt, 1e-3) > 0.8;
        ent._trvLX = ent.pos.x; ent._trvLZ = ent.pos.z;
      }
      const T = ent._trvT = (ent._trvT || 0) + dt;
      const node = ent.glbNode;
      this.travelGroundDecor(ent, !(ent._mount || ent._swim));
      if (ent._swim) {
        if (!was && this.near(ent, 40)) this.splash(ent, 1);
        const sw = ent._swimK = Math.min(1, (ent._swimK || 0) + dt * 3);
        const pitch = (moving ? 1.0 : 0.22) * sw;
        ent._swimPitch = (ent._swimPitch === undefined ? pitch : ent._swimPitch + (pitch - ent._swimPitch) * Math.min(1, dt * 5));
        const p = ent._swimPitch;
        const bob = Math.sin(T * (moving ? 5.5 : 2.4)) * (moving ? 0.05 : 0.07);
        ent.meshRoot.position.y = Math.max(0, depth - 1.5 * Math.cos(p) + 0.04) + bob;
        if (node) node.rotation.x = p;
        if (ent.activeAction) ent.activeAction.timeScale = moving ? 0.75 : 0.6;
        this.swimArms(ent, T, moving, sw);
        if (moving && local) {
          this._trv.splashT -= dt;
          if (this._trv.splashT <= 0) { this._trv.splashT = 0.22; this.splash(ent, 0); }
        }
      } else if (ent._swimK) {
        ent._swimK = 0; ent._swimPitch = 0;
        if (node) node.rotation.x = 0;
        if (this.near(ent, 40)) this.splash(ent, 1);
      }
      if (mt) {
        const d = mt.d;
        mt.k = Math.min(1, mt.k + dt * 3);
        // flying: cruise above the ground (and the water surface)
        let alt = 0;
        if (d.alt) {
          const ground = Math.max(0, depth);                      // never below the lake surface
          alt = ground + d.alt * (0.5 - 0.5 * Math.cos(Math.min(1, mt.k) * Math.PI)) + Math.sin(T * 1.6) * 0.35;
          alt = Math.max(alt, ground + 1.3);          // never let the belly dip into the ground
        }
        mt.alt += (alt - mt.alt) * Math.min(1, dt * 2.5);
        mt.root.position.set(ent.pos.x, mt.alt, ent.pos.z);
        const yaw = ent.meshRoot.rotation.y;
        mt.root.rotation.set(d.alt ? (moving ? 0.12 : 0) : 0, yaw, 0);
        if (mt.ready) {
          const want = moving ? 'move' : 'idle';
          const a = mt.actions[want] || mt.actions.idle;
          if (a && mt.cur !== want) {
            Object.values(mt.actions).forEach(x => { if (x !== a) x.fadeOut(0.2); });
            a.reset().fadeIn(0.2).play(); mt.cur = want;
          }
          mt.mixer.update(dt * (moving ? 1.25 : (d.idleRate || 1)));
        }
        // hero on the saddle, riding the mount's own body motion (gallop bob / wingbeat heave)
        const bob = this.mountBob(ent, mt);
        ent.meshRoot.position.y = mt.alt + (d.seat + bob) * mt.k;
        if (node) { node.rotation.x = d.alt && moving ? 0.1 : 0; node.position.z = d.seatZ; }
        this.ridePose(ent);
        this.stowWeapons(ent, true);
      }
    },

    // While riding, weapons ride on the hero's back: each hand holder is re-parented to the
    // upper spine, its long axis laid diagonally across the back (two weapons cross in an X),
    // shields flat against it. They return to the hands on dismount.
    stowWeapons(ent, on) {
      const B = this.travelBones(ent);
      const spine = B.spine_03 || B.spine_02;
      if (!spine || !ent.glbNode) return;
      if (!on) {
        spine.children.slice().forEach((h) => {
          const f = h.userData && h.userData.stowFrom;
          if (!f) return;
          f.bone.add(h); h.position.copy(f.pos); h.quaternion.copy(f.quat); h.scale.copy(f.scale);
          h.userData.stowFrom = null;
        });
        return;
      }
      const holders = [];
      [ent.handRightBone, ent.handLeftBone].forEach((hand, side) => {
        if (hand) hand.children.forEach((h) => { if (h.userData && h.userData.isAttachedWeapon) holders.push({ h, hand, side }); });
      });
      if (!holders.length) return;
      ent.glbNode.updateMatrixWorld(true);
      const hero = ent.glbNode.matrixWorld, heroInv = new THREE.Matrix4().copy(hero).invert();
      const spineHero = new THREE.Vector3().setFromMatrixPosition(spine.matrixWorld).applyMatrix4(heroInv);
      const nWeapons = holders.length;
      holders.forEach(({ h, hand, side }, i) => {
        h.userData.stowFrom = { bone: hand, pos: h.position.clone(), quat: h.quaternion.clone(), scale: h.scale.clone() };
        // weapon extent in holder space
        h.updateMatrixWorld(true);
        const hInv = new THREE.Matrix4().copy(h.matrixWorld).invert();
        const box = new THREE.Box3(), tmp = new THREE.Box3();
        h.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          tmp.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(hInv, o.matrixWorld));
          box.union(tmp);
        });
        if (box.isEmpty()) return;
        const sz = new THREE.Vector3(), c = new THREE.Vector3(); box.getSize(sz); box.getCenter(c);
        const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
        const dims = [sz.x, sz.y, sz.z];
        const longI = dims.indexOf(Math.max(...dims)), thinI = dims.indexOf(Math.min(...dims));
        const spec = (typeof WEAPON_ATTACH_SPECS !== 'undefined' && WEAPON_ATTACH_SPECS[h.userData.weaponId]) || {};
        const shield = !!spec.isShield;
        // targets in hero space (+z forward, +y up, +x the hero's left)
        const sgn = side === 0 ? 1 : -1;
        const dLong = shield ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0.62 * sgn, -1, 0).normalize();
        const dThin = new THREE.Vector3(0, 0, -1);
        const aLong = axes[longI], aThin = axes[thinI === longI ? (longI + 1) % 3 : thinI];
        const S = new THREE.Matrix4().makeBasis(aLong, aThin, new THREE.Vector3().crossVectors(aLong, aThin));
        const T = new THREE.Matrix4().makeBasis(dLong, dThin, new THREE.Vector3().crossVectors(dLong, dThin));
        const R = new THREE.Matrix4().multiplyMatrices(T, S.clone().transpose());
        const q = new THREE.Quaternion().setFromRotationMatrix(R);
        const back = spineHero.clone().add(new THREE.Vector3(0, shield ? -0.05 : -0.02, -(0.2 + (shield ? 0 : 0.06 * i))));
        const pos = back.sub(c.clone().applyQuaternion(q));
        // hero-space transform -> world -> spine local
        const mHero = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1));
        const mWorld = new THREE.Matrix4().multiplyMatrices(hero, mHero);
        // keep the weapon's own size (holder lived under the hand with the same hero scale)
        const sc = new THREE.Vector3(); new THREE.Matrix4().copy(hero).decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
        mWorld.scale(new THREE.Vector3(1 / sc.x, 1 / sc.y, 1 / sc.z));
        const mLocal = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().copy(spine.matrixWorld).invert(), mWorld);
        spine.add(h);
        mLocal.decompose(h.position, h.quaternion, h.scale);
      });
    },

    // Vertical motion of the mount's spine under the saddle, relative to its running average,
    // so the rider rises and falls with the gallop / wingbeats instead of floating at a fixed height.
    mountBob(ent, mt) {
      if (!mt.ready || !mt.model) return 0;
      const root = mt.root;
      if (mt.saddleBone === undefined) {
        mt.saddleBone = null;
        root.updateMatrixWorld(true);
        const fwdX = Math.sin(root.rotation.y), fwdZ = Math.cos(root.rotation.y);
        const sx = root.position.x + fwdX * (mt.d.seatZ || 0), sz = root.position.z + fwdZ * (mt.d.seatZ || 0);
        let best = 1e9; const w = new THREE.Vector3();
        mt.model.traverse((o) => {
          if (!o.isBone) return;
          o.getWorldPosition(w);
          const dh = Math.hypot(w.x - sx, w.z - sz) - (w.y - root.position.y) * 0.05;   // nearest, prefer the higher (spine)
          if (dh < best) { best = dh; mt.saddleBone = o; }
        });
        mt.bobAvg = null;
      }
      if (!mt.saddleBone) return 0;
      const w = this._bobV || (this._bobV = new THREE.Vector3());
      mt.saddleBone.getWorldPosition(w);
      const h = w.y - root.position.y;
      mt.bobAvg = mt.bobAvg === null ? h : mt.bobAvg + (h - mt.bobAvg) * 0.02;
      return Math.max(-0.4, Math.min(0.4, h - mt.bobAvg));
    },

    // Seated riding pose, set ABSOLUTELY from the rig's rest pose (solved against the hero
    // skeleton): hips and spine neutral, knees forward and apart around the mount's flanks,
    // feet hanging, hands forward on the reins. Independent of each class's idle stance.
    ridePose(ent) {
      const B = this.travelBones(ent); if (!B.thigh_l || !B.calf_l || !B.pelvis) return;
      const rest = this.travelRestPose(ent); if (!rest) return;
      const RIDE = this._ridePoseQ || (this._ridePoseQ = (() => {
        const P = {
          thigh_l: [-1.6, -0.4, -0.6], calf_l: [1.6, 0.2, -0.6], thigh_r: [-1.6, 0.4, 0.6], calf_r: [1.6, -0.2, 0.6],
          // leaning slightly forward, hands low and forward on the reins / neck
          spine_01: [0.42, 0, 0], spine_02: [0.18, 0, 0],
          upperarm_l: [1.6, -0.4, -0.2], lowerarm_l: [0.6, -1.4, 0.6], upperarm_r: [1.6, 0.4, 0.2], lowerarm_r: [0.6, 1.4, -0.6]
        };
        const out = {}, e = new THREE.Euler();
        Object.keys(P).forEach((k) => { e.set(P[k][0], P[k][1], P[k][2]); out[k] = new THREE.Quaternion().setFromEuler(e); });
        return out;
      })());
      ['pelvis', 'spine_03'].forEach((k) => { if (B[k] && rest[k]) B[k].quaternion.copy(rest[k].q); });
      if (rest.pelvis) B.pelvis.position.copy(rest.pelvis.p);
      Object.keys(RIDE).forEach((k) => { if (B[k] && rest[k]) B[k].quaternion.copy(rest[k].q).multiply(RIDE[k]); });
    },

    // rest (bind) pose of the entity's model, read once from the un-animated template
    travelRestPose(ent) {
      const key = ent.modelKey; if (!key || !this.modelCache[key]) return null;
      this._restPoses = this._restPoses || {};
      if (this._restPoses[key]) return this._restPoses[key];
      const r = {};
      this.modelCache[key].traverse((o) => { if (o.isBone) r[o.name] = { q: o.quaternion.clone(), p: o.position.clone() }; });
      this._restPoses[key] = r;
      return r;
    },

    swimArms(ent, T, moving, k) {
      const B = this.travelBones(ent); if (!B.upperarm_l) return;
      if (moving) {
        const a = T * 6.2;
        B.upperarm_l.rotation.x += Math.sin(a) * 1.3 * k;
        B.upperarm_r.rotation.x += Math.sin(a + Math.PI) * 1.3 * k;
        if (B.thigh_l) { B.thigh_l.rotation.x += Math.sin(a * 1.6) * 0.35 * k; B.thigh_r.rotation.x -= Math.sin(a * 1.6) * 0.35 * k; }
      } else {
        const a = T * 2.6;
        B.upperarm_l.rotation.z += (0.55 + Math.sin(a) * 0.25) * k;
        B.upperarm_r.rotation.z -= (0.55 + Math.sin(a) * 0.25) * k;
      }
    },

    // the hero's ground ring / contact shadow live on meshRoot: hide them while lifted
    travelGroundDecor(ent, show) {
      if (ent._trvDecorShown === show) return;
      ent._trvDecorShown = show;
      ent.meshRoot.children.forEach((o) => {
        if (o.isMesh && o.geometry && (o.geometry.type === 'RingGeometry' || o.material === this.contactShadowMat)) o.visible = show;
      });
    },

    travelBones(ent) {
      if (!ent._trvBones || ent._trvBonesRoot !== ent.glbNode) {
        ent._trvBones = {}; ent._trvBonesRoot = ent.glbNode;
        if (ent.glbNode) ent.glbNode.traverse((o) => { if (o.isBone) ent._trvBones[o.name] = o; });
      }
      return ent._trvBones;
    },

    splash(ent, big) {
      const s = depthAt(this, ent.pos.x, ent.pos.z) > 0 ? 0 : 0;
      _v.set(ent.pos.x, Math.max(0, depthAt(this, ent.pos.x, ent.pos.z)) + 0.1 + s, ent.pos.z);
      if (this.vfxSparks) this.vfxSparks(_v, big ? 34 : 6, { cols: [0xffffff, 0xbfeaff, 0x7fd0ff], speed: big ? [3, 7] : [1.5, 3.5], life: [0.3, 0.6], grav: 12, width: 0.045, upBias: 1.2 });
      if (big && ent === this.player) this.splashSound();
    },

    splashSound() {
      const A = this.audio; if (!A || !A.ctx || A.muted) return;
      try {
        const ctx = A.ctx, t0 = ctx.currentTime, out = A.sfxGain || A.masterGain || ctx.destination;
        const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
        n.buffer = buf;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(1800, t0); bp.frequency.exponentialRampToValueAtTime(500, t0 + 0.4); bp.Q.value = 0.8;
        const g = ctx.createGain(); g.gain.value = 0.35;
        n.connect(bp); bp.connect(g); g.connect(out); n.start(t0);
      } catch (e) { /* audio is optional */ }
    },

    // ---- camera: stay above the water / follow the flying mount ----------------
    cameraRig(dt, heroModalOpen) {
      const T = this._trv, p = this.player;
      if (T && !heroModalOpen && p) {
        const terr = this.terrainVisualHeight ? this.terrainVisualHeight(p.pos.x, p.pos.z) : 0;
        let want = 0;
        if (p._mount) want = p._mount.alt + p._mount.d.seat * 0.6;
        else if (p._swim) want = Math.max(0, (WL - 0.3) - terr);
        T.camLift += (want - T.camLift) * Math.min(1, dt * 4);
        if (T.camLift > 0.01) {
          this._camTerrY = (this._camTerrY || 0) + T.camLift;
          if (this._desiredCam) this._desiredCam.y += T.camLift;
          T.camLiftApplied = T.camLift;
        }
      }
      return orig.cameraRig.apply(this, arguments);
    },

    renderFrame() {
      const T = this._trv;
      const r = orig.renderFrame.apply(this, arguments);
      if (T && T.camLiftApplied) { this._camTerrY -= T.camLiftApplied; T.camLiftApplied = 0; }   // keep the core's smoothing clean
      return r;
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (!this._trv || !this.isInWorld) return;
      this.updateTravelEntity(this.player, dt, true);
      if (this.remotePeers) this.remotePeers.forEach(pe => this.updateTravelEntity(pe, dt, false));
      if (this.player.dead && this.player._mount) this.dismount(false);
      this._trv.barT = (this._trv.barT || 0) - dt;
      if (this._trv.barT <= 0) { this._trv.barT = 1; this.refreshTravelBar(); }
    }
  });

  window.CR_TRAVEL = { MOUNTS, WL };
})();
