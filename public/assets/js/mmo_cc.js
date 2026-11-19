/* =============================================================================
 * Chrono-Rift — shared crowd-control physics (combat upgrade, phase 1)
 *
 *  Four tags any skill can apply to enemies:
 *    VACUUM    pull every enemy in a radius toward a point (or a moving caster)
 *              over a short time, so AoE follow-ups hit a tight cluster
 *    LAUNCH    knock an enemy into the air -> AIRBORNE
 *    AIR_STALL every hit on an AIRBORNE enemy refreshes its lift (a juggle);
 *              each juggle hit adds gravity so juggles can't last forever, and
 *              an airborne hero hitting it hangs in the air too ("SKY JUGGLE!")
 *    SLAM_DOWN drive an enemy into the ground -> KNOCKED_DOWN; the next hits
 *              deal +30% ("DOWN ATTACK!")
 *
 *  Resistances: normal enemies take everything; elites get a short, weak
 *  version; bosses are immune and take posture damage instead (so the boss
 *  balance — no stun-lock — holds).
 *
 *  Authority & sync: CC is applied from the cast itself (useSkill), which already
 *  runs on every client (remote casts arrive through 'combat_action'), and juggle
 *  stalls come from hits, which every client sees through 'mob_hit'. So no new
 *  network messages are needed. Each client simulates the vertical arc locally;
 *  the room host owns enemy ground positions (vacuum) and pauses their AI while
 *  they are airborne / down, and its snapshots carry the result to everyone.
 *
 *  API: this.ccApply(mob, 'vacuum'|'launch'|'stall'|'slam', opts, caster)
 *       this.ccArea(center, radius, tag, opts, caster)   (center: {x,z})
 *       this.ccState(mob) -> 'ground' | 'air' | 'down'
 * ============================================================================= */
(function () {
  'use strict';
  const GRAV = 26;                // m/s², matches the hero jump
  const LAUNCH_VY = 9.5;          // ~1.7 m apex
  const STALL_VY = 6.8;           // lift from a juggle hit
  const JUGGLE_GRAV = 0.1;        // +10% gravity per juggle hit
  const MAX_AIR = 3.2;            // s, hard cap on a juggle
  const DOWN_T = 1.3, ELITE_DOWN_T = 0.6;
  const DOWN_BONUS = 1.3;
  const ST_GROUND = 0, ST_AIR = 1, ST_DOWN = 2;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    useSkill: GP.useSkill, applyDamageToMonster: GP.applyDamageToMonster,
    updateMMOWorld: GP.updateMMOWorld, updateMobVisualsPost: GP.updateMobVisualsPost
  };
  const _v = new THREE.Vector3();

  function cc(m) { return m.cc || (m.cc = { st: ST_GROUND, y: 0, vy: 0, air: 0, down: 0, jug: 0, slam: false, pull: null, tilt: 0 }); }

  Object.assign(GP, {
    isSimHost() { return !!(this.isRoomHost || !this.remotePeers || this.remotePeers.size === 0); },

    ccState(m) { const c = m && m.cc; return !c ? 'ground' : (c.st === ST_AIR ? 'air' : (c.st === ST_DOWN ? 'down' : 'ground')); },

    // ---- apply one tag to one enemy ------------------------------------------
    ccApply(m, tag, o, caster) {
      if (!m || m.dead || m.hp <= 0) return false;
      o = o || {};
      const local = !caster || caster === this.player;
      if (m.isBoss) {                                   // bosses: posture instead of CC
        if (local && this.addPosture && (tag === 'launch' || tag === 'slam')) this.addPosture(m, tag === 'slam' ? 30 : 22);
        return false;
      }
      const c = cc(m), elite = !!m.isElite;
      if (tag === 'vacuum') {
        c.pull = { x: o.x, z: o.z, follow: o.follow || null, t: o.dur || 0.6, str: (o.str || 16) * (elite ? 0.5 : 1), stop: o.stop || 1.4 };
        return true;
      }
      if (tag === 'launch') {
        if (c.st === ST_AIR) return this.ccApply(m, 'stall', o, caster);
        c.st = ST_AIR; c.vy = (o.vy || LAUNCH_VY) * (elite ? 0.55 : 1); c.air = 0; c.jug = 0; c.slam = false;
        this.ccInterrupt(m);
        this.ccFx(m, 'launch');
        return true;
      }
      if (tag === 'stall') {
        if (c.st !== ST_AIR || c.slam) return false;
        c.jug++;
        c.vy = Math.max(c.vy, STALL_VY * Math.pow(0.94, c.jug) * (elite ? 0.6 : 1));
        if (local && this.player && !this.player.grounded && this.player.pos.y > 0.4) {
          this.player.vy = Math.max(this.player.vy || 0, 2.6);        // the hero hangs in the air with it
        }
        if (local && c.jug >= 2) this.ccText(m, c.jug >= 6 ? `SKY JUGGLE ×${c.jug}!` : 'SKY JUGGLE!', '#7fe3ff', 15);
        return true;
      }
      if (tag === 'slam') {
        if (c.st === ST_AIR) { c.slam = true; c.vy = -30; this.ccInterrupt(m); return true; }
        this.ccKnockDown(m, o.down);
        return true;
      }
      return false;
    },

    ccArea(center, radius, tag, o, caster) {
      let n = 0;
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (m.dead) continue;
        const dx = m.pos.x - center.x, dz = m.pos.z - center.z;
        if (dx * dx + dz * dz > (radius + (m.isBoss ? 1.2 : 0.4)) ** 2) continue;
        if (this.ccApply(m, tag, Object.assign({ x: center.x, z: center.z }, o), caster)) n++;
      }
      return n;
    },

    ccInterrupt(m) {
      m.windupTimer = 0; m._windup = false;
      if (this.isSimHost()) m.stunTimer = Math.max(m.stunTimer || 0, 0.15);
    },

    ccKnockDown(m, dur) {
      const c = cc(m);
      c.st = ST_DOWN; c.y = 0; c.vy = 0; c.slam = false;
      c.down = dur || (m.isElite ? ELITE_DOWN_T : DOWN_T);
      this.ccInterrupt(m);
    },

    ccText(m, txt, col, size) {
      const now = performance.now();
      if (now - (m._ccTxtAt || 0) < 650) return;
      m._ccTxtAt = now;
      this.spawnFloatingText(_v.set(m.pos.x, (m.desiredHeight || 1.6) + (m.cc ? m.cc.y : 0) + 0.4, m.pos.z).clone(), txt, col, size);
    },

    ccFx(m, kind) {
      const y = (m.cc ? m.cc.y : 0);
      if (kind === 'launch') {
        if (this.vfxSparks) this.vfxSparks(_v.set(m.pos.x, 0.3, m.pos.z), 10, { cols: [0xffffff, 0x9fe8ff], speed: [3, 7], life: [0.25, 0.5], grav: 6, width: 0.05 });
      } else if (kind === 'slam') {
        if (this.spawnShockwaveRing) this.spawnShockwaveRing(_v.set(m.pos.x, 0.05, m.pos.z).clone(), 2.6, 0xffc46b, 0.3);
        if (this.vfxSparks) this.vfxSparks(_v.set(m.pos.x, 0.2 + y, m.pos.z), 14, { cols: [0xffd56b, 0xff7a3c], speed: [4, 9], life: [0.25, 0.55], grav: -9, width: 0.06 });
        const p = this.player;
        if (p && Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z) < 14) {
          if (this.triggerImpact) this.triggerImpact(0.42, 0.05); else this.screenShake = Math.max(this.screenShake || 0, 0.35);
        }
      }
    },

    // ---- hits: juggle stalls + down-attack bonus ----------------------------------
    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork) {
      const c = mob && !mob.dead && mob.cc;
      if (c && c.st === ST_DOWN && !fromNetwork && (!attacker || attacker === this.player)) {
        arguments[1] = baseDmg * DOWN_BONUS;
        this.ccText(mob, 'DOWN ATTACK!', '#ffb347', 15);
      }
      const r = orig.applyDamageToMonster.apply(this, arguments);
      if (c && c.st === ST_AIR && !mob.dead) this.ccApply(mob, 'stall', null, fromNetwork ? null : (attacker || this.player));
      return r;
    },

    // ---- per frame: arcs, pulls, AI pause -------------------------------------------
    updateCC(dt) {
      const host = this.isSimHost();
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        const c = m.cc;
        if (!c) continue;
        // pull
        if (c.pull && !m.dead) {
          const P = c.pull;
          P.t -= dt;
          const tx = P.follow ? P.follow.pos.x : P.x, tz = P.follow ? P.follow.pos.z : P.z;
          const dx = tx - m.pos.x, dz = tz - m.pos.z, d = Math.hypot(dx, dz);
          if (d > P.stop) {
            const step = Math.min(d - P.stop, P.str * dt);
            m.pos.x += dx / d * step; m.pos.z += dz / d * step;
            if (m.targetPos) m.targetPos.set(m.pos.x, m.targetPos.y, m.pos.z);   // non-hosts: predicted until the next snapshot
          }
          if (P.t <= 0) c.pull = null;
        }
        // vertical arc
        if (c.st === ST_AIR || (m.dead && c.y > 0)) {
          c.air += dt;
          const g = GRAV * (1 + c.jug * JUGGLE_GRAV) * (c.air > MAX_AIR ? 2.5 : 1);
          c.vy -= g * dt;
          c.y += c.vy * dt;
          if (c.y <= 0) {
            const wasSlam = c.slam, fall = -c.vy;
            c.y = 0; c.vy = 0; c.slam = false;
            if (m.dead) { c.st = ST_GROUND; continue; }
            if (wasSlam) { this.ccFx(m, 'slam'); this.ccText(m, 'SLAMMED!', '#ffc46b', 16); this.ccKnockDown(m); }
            else if (fall > 7 || c.jug > 0) this.ccKnockDown(m, m.isElite ? 0.45 : 0.9);
            else c.st = ST_GROUND;
          }
        } else if (c.st === ST_DOWN) {
          c.down -= dt;
          if (c.down <= 0 || m.dead) c.st = ST_GROUND;
        }
        // the host's AI waits while the enemy is airborne / down / being pulled
        if (host && !m.dead && (c.st !== ST_GROUND || c.pull)) {
          m.stunTimer = Math.max(m.stunTimer || 0, 0.06);
          m.windupTimer = 0;
        }
        if (c.st === ST_GROUND && !c.pull && c.tilt < 0.01 && !m.dead) m.cc = null;   // idle again: drop the record
      }
    },

    updateMobVisualsPost(dt) {
      orig.updateMobVisualsPost.call(this, dt);
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i], c = m.cc;
        if (!c || !m.meshRoot) continue;
        const wantTilt = c.st === ST_DOWN ? 1.25 : (c.st === ST_AIR ? 0.45 + Math.min(0.5, c.jug * 0.08) : 0);
        c.tilt += (wantTilt - c.tilt) * Math.min(1, dt * (c.st === ST_DOWN ? 14 : 8));
        m.meshRoot.position.y += c.y + (c.st === ST_DOWN ? 0.12 : 0);
        if (c.tilt > 0.01) m.meshRoot.rotation.x = -c.tilt;
      }
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (this.isInWorld) this.updateCC(dt);
    },

    // ---- first skill hooks (more kits arrive in later phases) ---------------------------
    useSkill(slot, isRemoteOrAI, actor) {
      const ent = actor || this.player;
      const local = ent === this.player && !isRemoteOrAI;
      const before = local && this.player.cooldowns ? this.player.cooldowns[slot] || 0 : 0;
      const r = orig.useSkill.apply(this, arguments);
      const fired = !local || ((this.player.cooldowns ? this.player.cooldowns[slot] || 0 : 0) > before + 0.01);
      if (!fired || !ent || !ent.pos || this._skillEmitterWrap || this._ccInSkill) return r;
      this._ccInSkill = true;
      try { this.ccSkillHooks(slot, ent); } finally { this._ccInSkill = false; }
      return r;
    },

    ccSkillHooks(slot, ent) {
      const cls = ent.classId;
      const at = (ms, fn) => setTimeout(() => { if (this.isInWorld && !ent.dead) fn(); }, ms);
      const fwd = (d) => ({ x: ent.pos.x + Math.sin(ent.yaw) * d, z: ent.pos.z + Math.cos(ent.yaw) * d });
      if (cls === 'berserker' && slot === 2) {
        // Blood Whirlwind drags the pack into the tornado
        this.ccArea(ent.pos, 8.5, 'vacuum', { follow: ent, dur: 0.75, str: 18, stop: 1.6 }, ent);
      } else if (cls === 'berserker' && slot === 3) {
        // Crusher Leap: the landing slams everything down (airborne foes are spiked)
        at(360, () => { this.ccArea(ent.pos, 4.9, 'slam', {}, ent); });
      } else if (cls === 'vanguard' && slot === 2) {
        // Seismic Slam: gather, then pop the cluster up for the party
        const c = fwd(2.1);
        this.ccArea(c, 9, 'vacuum', { dur: 0.22, str: 34, stop: 1.2 }, ent);
        at(230, () => { this.ccArea(c, 5.2, 'launch', {}, ent); });
      } else if (cls === 'arcanist' && slot === 2) {
        // Anima Vortex: a real singularity pull, then the implosion throws them up
        const c = this.getClampedAimPos ? this.getClampedAimPos(ent, 10.5, 5.5) : fwd(8);
        this.ccArea(c, 7.5, 'vacuum', { dur: 0.55, str: 14, stop: 0.9 }, ent);
        at(560, () => { this.ccArea(c, 3.6, 'launch', { vy: 7.5 }, ent); });
      } else if (cls === 'ranger' && slot === 4) {
        // Starfall Rain hammers airborne targets back down
        const c = this.getClampedAimPos ? this.getClampedAimPos(ent, 12, 6) : fwd(8);
        at(700, () => {
          for (let i = 0; i < this.monsters.length; i++) {
            const m = this.monsters[i];
            if (!m.dead && m.cc && m.cc.st === ST_AIR && Math.hypot(m.pos.x - c.x, m.pos.z - c.z) < 6) this.ccApply(m, 'slam', {}, ent);
          }
        });
      }
    }
  });

  window.CR_CC = { GRAV, LAUNCH_VY, DOWN_BONUS };
})();
