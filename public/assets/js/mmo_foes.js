/* =============================================================================
 * Chrono-Rift — enemy archetypes & elite affixes (upgrade phase 3)
 *
 *  PACK ROLES (normal camp monsters, level 4+, packs of 4 or more):
 *   • Charger      — winds up and rushes along an orange line. Sidestep or dodge;
 *                    it is WINDED (stunned) for a moment afterwards.
 *   • Shieldbearer — blocks most damage from the FRONT. Get behind it, or launch /
 *                    slam / stagger it to drop the shield for a few seconds.
 *   • Mender       — stays back and channels a green circle that heals its pack.
 *                    Any heavy hit, skill or CC interrupts it.
 *
 *  ELITE AFFIXES (1 affix, 2 from level 12). Besides the fixed elite camps, about
 *  1 in 8 packs of 6+ monsters (level 6+) is led by a CHAMPION elite.
 *   Molten (fire circles that leave burning ground), Frostbound (frost nova that
 *   chills), Vortex (pulls heroes in), Warded (damage-absorbing ward — launch it
 *   to shatter), Brood (splits off minions at 60% / 30% HP), Hasted (faster),
 *   Unstoppable (immune to CC until its posture breaks).
 *   Each affix adds bonus XP and a chance at an extra item.
 *
 *  Sync: roles and affixes are derived from the monster id, so every client
 *  agrees without extra data. The host decides when abilities fire and sends one
 *  'foe_ability' event; every client draws the telegraph and checks hits on its
 *  OWN hero (same model as normal monster attacks). HP changes (heals) ride the
 *  normal host snapshots.
 * ============================================================================= */
(function () {
  'use strict';
  const GP = ChronoRiftCoOpGame.prototype;
  const M = window.MMO;
  const ROLE_MIN_LV = 4, CHAMP_MIN_LV = 6, CHAMP_CHANCE = 0.12;

  const ROLES = {
    charger: { tag: 'Charger', hp: 1.25, dmg: 1.0, speed: 1.05, col: 0xff7a3c },
    bulwark: { tag: 'Shieldbearer', hp: 1.5, dmg: 0.9, speed: 0.85, col: 0xf3c86b },
    mender: { tag: 'Mender', hp: 0.85, dmg: 0.75, speed: 0.95, col: 0x2ee68a }
  };
  const AFFIX = {
    molten: { tag: 'Molten', col: 0xff6a1a, cd: [5, 6.5] },
    frost: { tag: 'Frostbound', col: 0x7fd8ff, cd: [8, 10] },
    vortex: { tag: 'Vortex', col: 0xb266ff, cd: [9, 11] },
    warded: { tag: 'Warded', col: 0x7fe3ff, cd: [12, 14] },
    brood: { tag: 'Brood', col: 0x9bd94a },
    hasted: { tag: 'Hasted', col: 0xffe066 },
    unstoppable: { tag: 'Unstoppable', col: 0xff3b5c }
  };
  const POOL_LOW = ['molten', 'frost', 'warded', 'brood', 'hasted'];
  const POOL_HIGH = POOL_LOW.concat(['vortex', 'unstoppable']);

  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) >>> 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d) >>> 0; n ^= n >>> 15; return n >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const between = (r, a) => a[0] + r * (a[1] - a[0]);
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');

  function pickRole(cid, slot, gen, count, type) {
    if (slot < 1 || slot > (count >= 7 ? 3 : 2)) return null;
    const r = rng(hash(cid * 131 + gen * 17 + 7));
    const order = ['charger', 'bulwark', 'mender'];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    const r2 = rng(hash(cid * 733 + slot * 97 + gen * 13));
    if (r2() > 0.8) return null;
    let role = order[slot - 1];
    const T = M.MOB_TYPES[type] || {};
    if ((T.ranged || T.hover) && role !== 'mender') role = null;   // flyers / casters can only be menders
    return role;
  }
  function pickAffixes(cid, gen, lv) {
    const r = rng(hash(cid * 389 + gen * 53 + 11));
    const pool = (lv >= 8 ? POOL_HIGH : POOL_LOW).slice();
    const n = lv >= 12 ? 2 : 1, out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return out;
  }

  // shared meshes (never disposed: a handful per colour)
  const GEO = {};
  const MAT = {};
  function ringMat(col, op) {
    const k = col + ':' + op;
    return MAT[k] || (MAT[k] = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  }
  function ring(col, r0, r1, op) {
    const k = 'r' + r0 + ':' + r1;
    const g = GEO[k] || (GEO[k] = new THREE.RingGeometry(r0, r1, 36));
    const m = new THREE.Mesh(g, ringMat(col, op));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.07; m.renderOrder = 5;
    return m;
  }

  const orig = {
    createWorldMob: GP.createWorldMob, updateMonsters: GP.updateMonsters, applyDamageToMonster: GP.applyDamageToMonster,
    ccApply: GP.ccApply, ccInterrupt: GP.ccInterrupt, getMoveSpeedMult: GP.getMoveSpeedMult,
    rollMobLoot: GP.rollMobLoot, grantKillRewards: GP.grantKillRewards, installNetBatch: GP.installNetBatch,
    upgradeEntityToGLB: GP.upgradeEntityToGLB
  };
  const _v = new THREE.Vector3();

  Object.assign(GP, {
    // ---- creation: role / affixes from the id ------------------------------------------------
    createWorldMob(id, spec, x, z, camp) {
      const mm = /^c(\d+)s(\d+)g(\d+)$/.exec(id || '');
      let role = null, affixes = null;
      if (mm && spec && !spec.bossDef) {
        const cid = +mm[1], slot = +mm[2], gen = +mm[3];
        // champions: some bigger packs without an elite get one (slot 0 promoted)
        if (!spec.elite && slot === 0 && camp && !camp.elite && (camp.count || 0) >= 6 && (spec.level || 1) >= CHAMP_MIN_LV &&
          rng(hash(cid * 911 + gen * 29 + 3))() < CHAMP_CHANCE) {
          spec = Object.assign({}, spec, { elite: true, name: '★ ' + spec.name });
        }
        if (spec.elite) {
          affixes = pickAffixes(cid, gen, spec.level || 1);
          spec = Object.assign({}, spec, { name: '★ ' + affixes.map(a => AFFIX[a].tag).join(' ') + ' ' + String(spec.name || '').replace(/^★\s*/, '') });
        } else if ((spec.level || 1) >= ROLE_MIN_LV && camp && (camp.count || 0) >= 4) {
          role = pickRole(cid, slot, gen, camp.count, spec.type);
          if (role) spec = Object.assign({}, spec, { name: ROLES[role].tag + ' ' + spec.name });
        }
      }
      const m = orig.createWorldMob.call(this, id, spec, x, z, camp);
      if (!m || (!role && !affixes)) return m;
      m.foe = { cd: 3 + (hash(String(id).length * 31 + (x | 0)) % 30) / 10, st: null, guardDownT: 0, wardT: 0, sparkT: 0, splits: 0, textT: 0 };
      if (role) {
        const R = ROLES[role];
        m.foeRole = role;
        m.maxHp = Math.round(m.maxHp * R.hp); m.hp = m.maxHp;
        m.dmg = Math.max(1, Math.round(m.dmg * R.dmg));
        m.speed *= R.speed;
        if (role === 'mender') m.ranged = true;
        if (role === 'charger') m.foe.cd = 0.6 + Math.random() * 1.2;   // opens with a charge
      }
      if (affixes) {
        m.affixes = affixes;
        if (affixes.length > 1) { m.maxHp = Math.round(m.maxHp * 1.15); m.hp = m.maxHp; }
        if (affixes.includes('hasted')) m.speed *= 1.3;
      }
      this.foeDress(m);
      if (m.nameplateSprite && this.drawMobNameplate) this.drawMobNameplate(m);
      return m;
    },

    foeDress(m) {
      const root = m.meshRoot; if (!root) return;
      const h = m.desiredHeight || 1.4, s = Math.max(0.6, Math.min(1.15, h / 2.2));
      const col = m.foeRole ? ROLES[m.foeRole].col : AFFIX[m.affixes[0]].col;
      const dress = m.foe.dress = [];
      const add = (o) => { root.add(o); dress.push(o); };
      add(ring(col, 0.8 * s, 0.95 * s, 0.5));
      if (m.affixes && m.affixes[1]) add(ring(AFFIX[m.affixes[1]].col, 1.0 * s, 1.12 * s, 0.42));
      if (m.foeRole === 'bulwark') {
        const g = GEO.shield || (GEO.shield = new THREE.CylinderGeometry(0.62, 0.62, 0.09, 6));
        const mat = MAT.shield || (MAT.shield = new THREE.MeshStandardMaterial({ color: 0xc9a04a, metalness: 0.75, roughness: 0.35, emissive: 0x3a2a08, emissiveIntensity: 0.6 }));
        const sh = new THREE.Mesh(g, mat);
        sh.rotation.x = Math.PI / 2;
        sh.scale.setScalar(s);
        sh.position.set(0, h * 0.45 + (m.hover || 0), 0.75 * s + 0.2);
        sh.castShadow = true;
        add(sh);
        // the guarded side, drawn on the ground (easy to read from the top-down camera)
        const ag = GEO.arc || (GEO.arc = new THREE.RingGeometry(1.05, 1.35, 28, 1, -Math.PI / 2 - 0.95, 1.9));
        const arc = new THREE.Mesh(ag, ringMat(0xf3c86b, 0.55));
        arc.rotation.x = -Math.PI / 2; arc.position.y = 0.09; arc.scale.setScalar(s); arc.renderOrder = 5;
        add(arc);
        m.foe.shield = sh; m.foe.arc = arc;
      }
      if (m.affixes && m.affixes.includes('warded')) {
        const g = GEO.ward || (GEO.ward = new THREE.SphereGeometry(1, 20, 14));
        const mat = MAT.ward || (MAT.ward = new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
        const b = new THREE.Mesh(g, mat);
        b.scale.setScalar(h * 0.75 + 0.6);
        b.position.y = h * 0.5 + (m.hover || 0);
        b.visible = false;
        add(b);
        m.foe.bubble = b;
      }
    },

    // loading the real model clears the placeholder root: put our markers back
    upgradeEntityToGLB(entity, modelKey, scale) {
      const r = orig.upgradeEntityToGLB.apply(this, arguments);
      const F = entity && entity.foe;
      if (F && F.dress && entity.meshRoot) F.dress.forEach(o => { if (o.parent !== entity.meshRoot) entity.meshRoot.add(o); });
      return r;
    },

    // ---- helpers -----------------------------------------------------------------------------
    foeHost() { return !!(this.isRoomHost || !this.remotePeers || this.remotePeers.size === 0); },

    foeGrounded(m) { return !this.ccState || this.ccState(m) === 'ground'; },

    foeGuardUp(m) {
      return m.foeRole === 'bulwark' && !m.dead && this.foeGrounded(m) && !(m.staggerTimer > 0) && !(m.foe.guardDownT > 0);
    },

    foeTargets() {
      const out = [];
      if (this.player && this.player.hp > 0 && this.isInWorld) out.push(this.player);
      if (this.remotePeers) this.remotePeers.forEach(pe => { if (pe && pe.pos && (pe.hp === undefined || pe.hp > 0)) out.push(pe); });
      return out;
    },

    foeText(m, txt, col, size) {
      if (!m || !m.pos) return;
      this.spawnFloatingText(m.pos.clone().add(_v.set(0, (m.desiredHeight || 1.4) + 0.9, 0)), txt, col, size || 15);
    },

    // a monster ability lands on the LOCAL hero
    foeStrike(m, mult, blockable) {
      const p = this.player;
      if (!p || p.dead || p.hp <= 0) return false;
      if (p.dodgeTimer > 0) {
        this.spawnFloatingText(p.pos, 'EVADED!', '#38e8ff', 15);
        if (this.onPerfectEvade) this.onPerfectEvade(m);
        return false;
      }
      let k = 1;
      if (blockable && this.defendStrike) {
        const r = this.defendStrike(m, m.dmg * mult);
        if (r === 'parry') return false;
        k = r === 'block' ? this.blockTakenMult() : (r === 'guardbreak' ? 0.6 : 1);
      }
      this.damagePlayer(Math.max(1, Math.round(m.dmg * mult * k)), m.name, m.level);
      return true;
    },

    foePush(dx, dz, speed, t) {
      const d = Math.hypot(dx, dz) || 1;
      this._foePushV = { vx: dx / d * speed, vz: dz / d * speed, t };
    },

    getMoveSpeedMult() {
      const b = orig.getMoveSpeedMult ? orig.getMoveSpeedMult.call(this) : 1;
      return (this._foeSlow > 0) ? b * 0.55 : b;
    },

    // ---- casting (host decides; everyone draws and checks their own hero) --------------------
    foeCast(m, k, params) {
      const p = Object.assign({ id: m.id, k }, params || {});
      if (this.remotePeers && this.remotePeers.size > 0 && this.isInWorld && this.broadcastGameEvent) {
        this.broadcastGameEvent('foe_ability', Object.assign({ hostId: this.playerToken }, p));
      }
      this.foeRun(m, k, p, false);
    },

    foeRun(m, k, p, fromNet) {
      if (!m || m.dead || !m.foe) return;
      const host = !fromNet && this.foeHost();
      const F = m.foe;
      if (k === 'charge') {
        const w = 0.85, len = p.len || 10;
        const st = F.st = { k, t: 0, w, sx: p.x, sz: p.z, yaw: p.yaw, len };
        m.yaw = p.yaw; m.targetYaw = p.yaw;
        if (host) m.stunTimer = Math.max(m.stunTimer || 0, w + 0.4);
        this.playEntityAnim && this.playEntityAnim(m, 'Sword_Attack', true);
        if (this.mobWindup) this.mobWindup(m, w);
        this.foeText(m, 'CHARGE!', '#ff9a5c', 15);
        this.spawnBossTelegraph('line', { x: p.x, z: p.z, yaw: p.yaw, width: 2.4, length: len }, w, ROLES.charger.col, () => {
          if (F.st !== st || m.dead) return;
          st.dash = 0.3;
          // hit check on the local hero: inside the lane
          const pl = this.player;
          const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
          const rx = pl.pos.x - p.x, rz = pl.pos.z - p.z;
          const along = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
          if (along > -0.5 && along < len + 0.8 && side < 1.6 && pl.pos.y <= 0.9) {
            if (this.foeStrike(m, 1.6, true)) this.foePush(fx, fz, 13, 0.25);
          }
          if (this.vfxShock) this.vfxShock(_v.set(p.x + fx * len, 0, p.z + fz * len), 3, 1.2, ROLES.charger.col, 0xffffff, { r0: 0.5, dur: 0.4 });
        });
      } else if (k === 'mend') {
        const w = 1.6, R = 12;
        const st = F.st = { k, t: 0, w };
        if (host) m.stunTimer = Math.max(m.stunTimer || 0, w);
        this.playEntityAnim && this.playEntityAnim(m, 'Spell_Simple_Shoot', true);
        this.foeText(m, 'MENDING…', '#7dffb0', 15);
        this.spawnBossTelegraph('circle', { x: m.pos.x, z: m.pos.z, radius: R }, w, ROLES.mender.col, () => {
          if (F.st !== st || m.dead) return;
          F.st = null;
          for (let i = 0; i < this.monsters.length; i++) {
            const o = this.monsters[i];
            if (o.dead || o.isBoss) continue;
            if (Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) > R) continue;
            const heal = Math.round(o.maxHp * 0.2);
            if (host) o.hp = Math.min(o.maxHp, o.hp + heal);
            this.foeText(o, `+${heal}`, '#7dffb0', 13);
            if (this.vfxPillar) this.vfxPillar(_v.set(o.pos.x, 0, o.pos.z), 4, 0.6, ROLES.mender.col, 0xffffff, 0);
          }
        });
      } else if (k === 'molten') {
        const R = 3.2, w = 1.1;
        this.spawnBossTelegraph('circle', { x: p.tx, z: p.tz, radius: R }, w, AFFIX.molten.col, () => {
          if (this.vfxShock) this.vfxShock(_v.set(p.tx, 0, p.tz), R, 2, AFFIX.molten.col, 0xffd56b, { r0: 0.4, dur: 0.45 });
          const pl = this.player;
          if (Math.hypot(pl.pos.x - p.tx, pl.pos.z - p.tz) <= R && pl.pos.y <= 0.9) this.foeStrike(m, 1.1, false);
          this.foeFirePatch(m, p.tx, p.tz, R * 0.85, 3.5);
        });
      } else if (k === 'frost') {
        const R = 6.5, w = 1.3;
        this.foeText(m, 'FROST NOVA', '#bfeaff', 14);
        if (host) m.stunTimer = Math.max(m.stunTimer || 0, w);
        const cx = m.pos.x, cz = m.pos.z;
        this.spawnBossTelegraph('circle', { x: cx, z: cz, radius: R }, w, AFFIX.frost.col, () => {
          if (m.dead) return;
          if (this.vfxShock) this.vfxShock(_v.set(m.pos.x, 0, m.pos.z), R, 2.4, AFFIX.frost.col, 0xffffff, { r0: 1, dur: 0.5 });
          const pl = this.player;
          if (Math.hypot(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z) <= R && this.foeStrike(m, 0.9, false)) {
            this._foeSlow = 3;
            this.spawnFloatingText(pl.pos, 'CHILLED', '#bfeaff', 15);
          }
        });
      } else if (k === 'vortex') {
        const R = 14, w = 1.0;
        this.foeText(m, 'VORTEX!', '#d7a6ff', 16);
        this.spawnBossTelegraph('circle', { x: m.pos.x, z: m.pos.z, radius: R }, w, AFFIX.vortex.col, () => {
          if (m.dead) return;
          if (this.vfxShock) this.vfxShock(_v.set(m.pos.x, 0, m.pos.z), 4, 3, AFFIX.vortex.col, 0xffffff, { r0: R, dur: 0.45 });
          const pl = this.player;
          const dx = m.pos.x - pl.pos.x, dz = m.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
          if (d <= R && d > 2.6) {
            if (pl.dodgeTimer > 0) { this.spawnFloatingText(pl.pos, 'RESISTED', '#38e8ff', 14); return; }
            this.foePush(dx, dz, (d - 2.4) / 0.35, 0.35);
            this.spawnFloatingText(pl.pos, 'PULLED!', '#d7a6ff', 14);
          }
        });
        if (host) m.attackCd = 0;
      } else if (k === 'ward') {
        F.wardT = 4;
        this.foeText(m, 'WARDED', '#9ff0ff', 16);
        if (this.vfxShock) this.vfxShock(_v.set(m.pos.x, 0, m.pos.z), 3, 2.5, AFFIX.warded.col, 0xffffff, { r0: 0.5, dur: 0.4 });
      } else if (k === 'brood') {
        this.foeText(m, 'THE BROOD SPLITS!', '#c6f08a', 16);
        if (this.vfxShock) this.vfxShock(_v.set(m.pos.x, 0, m.pos.z), 5, 2, AFFIX.brood.col, 0xffffff, { r0: 0.5, dur: 0.5 });
        if (host && Array.isArray(p.adds) && this.getMobById) p.adds.forEach(aid => this.getMobById(aid));
      }
    },

    foeCancel(m, why) {
      const F = m && m.foe; if (!F || !F.st) return;
      F.st = null;
      if (why) this.foeText(m, why, '#ffd56b', 16);
    },

    foeFirePatch(m, x, z, r, dur) {
      const mesh = new THREE.Mesh(GEO.fire || (GEO.fire = new THREE.CircleGeometry(1, 28)),
        new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.08, z); mesh.scale.setScalar(r); mesh.renderOrder = 4;
      this.scene.add(mesh);
      (this._foeFires || (this._foeFires = [])).push({ mesh, x, z, r, t: dur, dur, tick: 0, m });
    },

    // ---- per-frame -----------------------------------------------------------------------------
    updateMonsters(dt) {
      orig.updateMonsters.call(this, dt);
      if (!this.isInWorld || !this.monsters) return;
      try { this.foeUpdate(dt); } catch (e) { if (!this._foeErr) { this._foeErr = 1; console.warn('[foes]', e); } }
    },

    foeUpdate(dt) {
      const p = this.player;
      const host = this.foeHost();
      const W = (window.MMO && window.MMO.WORLD && window.MMO.WORLD.half) || 2400;
      // hero displacement (charge knock / vortex pull) and chill
      if (this._foePushV && this._foePushV.t > 0 && p && !p.dead) {
        const v = this._foePushV; v.t -= dt;
        p.pos.x = Math.max(-W + 10, Math.min(W - 10, p.pos.x + v.vx * dt));
        p.pos.z = Math.max(-W + 10, Math.min(W - 10, p.pos.z + v.vz * dt));
        if (this.resolveObstacleCollisions) this.resolveObstacleCollisions(p.pos, 0.5);
      }
      if (this._foeSlow > 0) this._foeSlow -= dt;
      // burning ground
      if (this._foeFires) {
        for (let i = this._foeFires.length - 1; i >= 0; i--) {
          const f = this._foeFires[i];
          f.t -= dt; f.tick -= dt;
          f.mesh.material.opacity = 0.18 + 0.22 * Math.min(1, f.t / 0.8) + Math.sin(f.t * 14) * 0.05;
          if (f.tick <= 0 && p && !p.dead && p.hp > 0 && Math.hypot(p.pos.x - f.x, p.pos.z - f.z) <= f.r && p.pos.y <= 0.6 && !(p.dodgeTimer > 0)) {
            f.tick = 0.5;
            this.damagePlayer(Math.max(1, Math.round((f.m.dmg || 10) * 0.18)), 'Burning ground', f.m.level);
          }
          if (f.t <= 0) { this.scene.remove(f.mesh); f.mesh.material.dispose(); this._foeFires.splice(i, 1); }
        }
      }
      const targets = host ? this.foeTargets() : null;
      this._foeTipT = (this._foeTipT || 0) - dt;
      let tipRole = null, tipAffix = false;

      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        const F = m.foe;
        if (!F || m.dead) continue;
        if (F.guardDownT > 0) F.guardDownT -= dt;
        if (m.foeRole === 'bulwark' && (!this.foeGrounded(m) || m.staggerTimer > 0)) F.guardDownT = 4;
        if (F.shield) { const up = this.foeGuardUp(m); F.shield.visible = up; if (F.arc) F.arc.visible = up; }
        if (F.wardT > 0) { F.wardT -= dt; if (F.bubble) { F.bubble.visible = F.wardT > 0; F.bubble.rotation.y += dt; } }
        else if (F.bubble && F.bubble.visible) F.bubble.visible = false;
        if (F.st) {
          F.st.t += dt;
          if (F.st.k === 'charge' && F.st.dash > 0) {
            const step = Math.min(F.st.dash, dt);
            F.st.dash -= step;
            if (host) {
              const sp = F.st.len / 0.3;
              m.pos.x += Math.sin(F.st.yaw) * sp * step; m.pos.z += Math.cos(F.st.yaw) * sp * step;
              if (this.resolveObstacleCollisions) this.resolveObstacleCollisions(m.pos, 0.55);
            }
            if (F.st.dash <= 0) {
              F.st = null;
              if (host) m.stunTimer = Math.max(m.stunTimer || 0, 1.4);
              this.foeText(m, 'WINDED', '#ffd56b', 14);
            }
          } else if (F.st.t > 6) F.st = null;   // safety
        }
        // affix shimmer
        const near = p && Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 40;
        if (m.affixes && near && this.vfxSparks && m.meshRoot && m.meshRoot.visible) {
          F.sparkT -= dt;
          if (F.sparkT <= 0) {
            F.sparkT = 0.3;
            const cols = m.affixes.map(a => AFFIX[a].col);
            this.vfxSparks(_v.set(m.pos.x, 0.4 + (m.hover || 0), m.pos.z), 3, { cols, speed: [1, 2.4], life: [0.5, 0.9], grav: -3, width: 0.05 });
          }
        }
        if (near && p && Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 14) {
          if (m.foeRole) tipRole = tipRole || m.foeRole;
          if (m.affixes) tipAffix = true;
        }
        if (!host) continue;

        // ---------------- host AI ----------------
        if (m.affixes && m.affixes.includes('hasted') && m.attackCd > 0) m.attackCd = Math.max(0, m.attackCd - dt * 0.4);
        if (m.affixes && m.affixes.includes('brood') && m.hp > 0) {
          const f = m.hp / m.maxHp;
          if ((F.splits === 0 && f <= 0.6) || (F.splits === 1 && f <= 0.3)) {
            F.splits++;
            const adds = [];
            for (let k = 0; k < 2; k++) {
              const a = Math.random() * 6.28;
              const x = Math.round(m.pos.x + Math.cos(a) * 3.5), z = Math.round(m.pos.z + Math.sin(a) * 3.5);
              this._addSerial = (this._addSerial || 0) + 1;
              adds.push(`add~${m.typeKey}~${Math.max(1, m.level - 2)}~${this._addSerial}~${x}~${z}`);
            }
            this.foeCast(m, 'brood', { adds });
          }
        }
        F.cd -= dt;
        if (F.st || F.cd > 0) continue;
        if (m.stunTimer > 0 || m.staggerTimer > 0 || m.windupTimer > 0 || m.attackAnimTimer > 0.2 || !this.foeGrounded(m)) continue;
        // nearest hero
        let tgt = null, best = Infinity;
        for (let k = 0; k < targets.length; k++) {
          const d = Math.hypot(targets[k].pos.x - m.pos.x, targets[k].pos.z - m.pos.z);
          if (d < best) { best = d; tgt = targets[k]; }
        }
        const engaged = tgt && (m.aggroTimer > 0 || best < 15.5) && m.pos.distanceTo(m.homePos) < 30;
        if (!engaged) { F.cd = 0.5; continue; }
        if (this.isInTownSafeZone && this.isInTownSafeZone(tgt.pos)) { F.cd = 1; continue; }

        if (m.foeRole === 'charger') {
          if (best >= 4.5 && best <= 13.5) {
            const yaw = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z);
            this.foeCast(m, 'charge', { x: +m.pos.x.toFixed(2), z: +m.pos.z.toFixed(2), yaw: +yaw.toFixed(3), len: +Math.min(13, best + 2.5).toFixed(2) });
            F.cd = 7 + Math.random() * 2;
          } else F.cd = 0.4;
        } else if (m.foeRole === 'mender') {
          let hurt = false;
          for (let k = 0; k < this.monsters.length; k++) {
            const o = this.monsters[k];
            if (!o.dead && !o.isBoss && o.hp < o.maxHp * 0.8 && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) <= 11) { hurt = true; break; }
          }
          if (hurt) { this.foeCast(m, 'mend', {}); F.cd = 7 + Math.random() * 1.5; } else F.cd = 0.6;
        } else if (m.affixes) {
          // rotate through this elite's active affixes
          const act = m.affixes.filter(a => AFFIX[a].cd);
          if (!act.length) { F.cd = 99; continue; }
          F.rot = ((F.rot || 0) + 1) % act.length;
          const a = act[F.rot];
          if (a === 'molten') this.foeCast(m, 'molten', { tx: +tgt.pos.x.toFixed(2), tz: +tgt.pos.z.toFixed(2) });
          else if (a === 'frost') { if (best <= 6) this.foeCast(m, 'frost', {}); else { F.cd = 0.5; continue; } }
          else if (a === 'vortex') { if (best >= 5 && best <= 14) this.foeCast(m, 'vortex', {}); else { F.cd = 0.5; continue; } }
          else if (a === 'warded') this.foeCast(m, 'ward', {});
          F.cd = between(Math.random(), AFFIX[a].cd) / Math.max(1, act.length * 0.75);
        } else F.cd = 99;
      }

      if (this._foeTipT <= 0 && this.teachTip) {
        this._foeTipT = 0.5;
        if (tipRole) this.teachTip('foe_' + tipRole);
        else if (tipAffix) this.teachTip('foe_affix');
      }
    },

    // ---- damage: shieldbearer front guard, ward, mender interrupt ---------------------------------
    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork, netData, opts) {
      const F = mob && mob.foe;
      if (F && !mob.dead) {
        if (!fromNetwork) {
          const src = attacker && attacker.pos ? attacker.pos : (this.player && this.player.pos);
          let k = 1, label = null;
          if (F.wardT > 0) { k = 0.25; label = 'WARD'; }
          else if (this.foeGuardUp(mob) && src) {
            const dx = src.x - mob.pos.x, dz = src.z - mob.pos.z, d = Math.hypot(dx, dz) || 1;
            const front = (dx * Math.sin(mob.yaw) + dz * Math.cos(mob.yaw)) / d;
            if (front > 0.3) {
              k = isHeavy ? 0.5 : 0.3; label = 'GUARDED';
              if (this.addPosture && (!attacker || attacker === this.player)) this.addPosture(mob, isHeavy ? 10 : 5);
            }
          }
          if (k !== 1) {
            arguments[1] = Math.max(1, Math.round(baseDmg * k));
            const now = performance.now();
            if (now - (F.textAt || 0) > 600) { F.textAt = now; this.foeText(mob, label, label === 'WARD' ? '#9ff0ff' : '#ffd56b', 13); }
            if (this.vfxSparks) this.vfxSparks(_v.set(mob.pos.x, (mob.desiredHeight || 1.4) * 0.5, mob.pos.z), 8, { cols: [label === 'WARD' ? 0x9ff0ff : 0xffd56b, 0xffffff], speed: [3, 7], life: [0.2, 0.4], grav: 6, width: 0.04 });
          }
        }
        const heavy = fromNetwork && netData ? !!netData.isHeavy : !!isHeavy;
        if (F.st && F.st.k === 'mend' && heavy) {
          this.foeCancel(mob, 'INTERRUPTED!');
          if (!fromNetwork && this.styleAdd) this.styleAdd(15);
        }
      }
      return orig.applyDamageToMonster.apply(this, arguments);
    },

    // ---- CC: unstoppable, interrupts, ward shatter ---------------------------------------------------
    ccApply(m, tag, o, caster) {
      if (m && m.affixes && m.affixes.includes('unstoppable') && !(m.staggerTimer > 0) && !m.dead) {
        const local = !caster || caster === this.player;
        if (local && this.addPosture && (tag === 'launch' || tag === 'slam')) this.addPosture(m, 14);
        const F = m.foe, now = performance.now();
        if (F && now - (F.textAt || 0) > 700) { F.textAt = now; this.foeText(m, 'UNSTOPPABLE', '#ff8a9c', 13); }
        return false;
      }
      return orig.ccApply.apply(this, arguments);
    },

    ccInterrupt(m) {
      if (orig.ccInterrupt) orig.ccInterrupt.apply(this, arguments);
      const F = m && m.foe; if (!F) return;
      if (F.st) this.foeCancel(m, F.st.k === 'mend' ? 'INTERRUPTED!' : null);
      if (F.wardT > 0) { F.wardT = 0; this.foeText(m, 'WARD SHATTERED!', '#9ff0ff', 16); if (this.styleAdd) this.styleAdd(10); }
    },

    // ---- rewards: affixes and roles pay a little extra -----------------------------------------
    grantKillRewards(mob, fromNetwork) {
      const r = orig.grantKillRewards.apply(this, arguments);
      try {
        if (mob && (mob.affixes || mob.foeRole) && this.player && M.mobXp) {
          const d = (mob.level || 1) - (this.player.level || 1);
          if (d >= -5 && Math.hypot(this.player.pos.x - mob.pos.x, this.player.pos.z - mob.pos.z) <= 75) {
            const bonus = mob.affixes ? 4 * 0.35 * mob.affixes.length : 0.3;
            this.gainXP(Math.max(1, Math.round(M.mobXp(mob.level || 1) * bonus)), true);
          }
        }
      } catch (e) { /* rewards are best-effort */ }
      return r;
    },

    rollMobLoot(mob) {
      const r = orig.rollMobLoot.apply(this, arguments);
      try {
        if (mob && mob.affixes && this.generateItem && this.spawnItemDrop && this.player &&
          Math.hypot(this.player.pos.x - mob.pos.x, this.player.pos.z - mob.pos.z) <= 75) {
          mob.affixes.forEach((a, i) => {
            if (Math.random() < 0.5) {
              const it = this.generateItem({ ilvl: mob.level || 1, minRarity: 'uncommon', rarity: this.rollRarity ? this.rollRarity(1.4) : undefined });
              const at = mob.pos.clone().add(_v.set(Math.cos(i * 2.1) * 1.2, 0, Math.sin(i * 2.1) * 1.2));
              this.spawnItemDrop(at, it, 0, null);
            }
          });
        }
      } catch (e) { /* loot is best-effort */ }
      return r;
    },

    // ---- network ----------------------------------------------------------------------------------
    installNetBatch(ch) {
      if (orig.installNetBatch) orig.installNetBatch.apply(this, arguments);
      if (!ch || ch.__foes) return;
      ch.__foes = true;
      ch.on('broadcast', { event: 'foe_ability' }, ({ payload }) => {
        if (!payload || payload.hostId === this.playerToken || this.channel !== ch) return;
        const mob = this.getMobById ? this.getMobById(payload.id) : this.monsters.find(x => x.id === payload.id);
        if (mob && !mob.dead) this.foeRun(mob, payload.k, payload, true);
      });
    }
  });

  if (GP.teachAddTips) {
    GP.teachAddTips({
      foe_charger: { desk: '<b>Chargers</b> rush along an orange line. Sidestep or dodge (<b>SPACE</b>), then punish them while they are <b>winded</b>.', touch: '<b>Chargers</b> rush along an orange line. Sidestep or dodge, then punish them while they are <b>winded</b>.' },
      foe_bulwark: { desk: '<b>Shieldbearers</b> block hits from the front. Get <b>behind</b> them, or launch / slam them to drop the shield.', touch: '<b>Shieldbearers</b> block hits from the front. Get <b>behind</b> them, or tap ⤴ / ⤓ to drop the shield.' },
      foe_mender: { desk: '<b>Menders</b> heal their pack inside the green circle. <b>Interrupt</b> them with a skill or launch, and kill them first.', touch: '<b>Menders</b> heal their pack inside the green circle. <b>Interrupt</b> them with a skill or launch, and kill them first.' },
      foe_affix: { desk: 'Elites carry <b>affixes</b> (Molten, Frostbound, Vortex…) shown in their name. Watch the coloured telegraphs: each affix means extra loot.', touch: 'Elites carry <b>affixes</b> (Molten, Frostbound, Vortex…) shown in their name. Watch the coloured telegraphs: each affix means extra loot.' }
    });
  }

  window.CR_FOES = { ROLES, AFFIX, pickRole, pickAffixes };
})();
