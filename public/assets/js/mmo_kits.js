/* =============================================================================
 * Chrono-Rift — class kits (combat upgrade, phase 5)
 *
 *  Builds each class's signature combo tools on top of the shared crowd-control
 *  physics (mmo_cc.js) and the directional moves (mmo_moves.js):
 *
 *  Berserker  • METEOR CRASH: Crusher Leap (3) used while airborne (after a
 *               Rising Strike or a jump) plummets and detonates a bigger slam
 *               that spikes everything in 6.5 m.
 *  Vanguard   • Aegis Rush (3) PLOUGHS through: every enemy along the charge is
 *               knocked aside and down.
 *             • SHIELD COUNTER: a Perfect Guard releases a counter-shockwave
 *               (5 m, 120% damage, knocks foes down, posture damage to bosses).
 *  Ranger     • HOVER FIRE: basic shots fired in mid-air keep the Ranger aloft
 *               for a moment (1.6 s per jump) and pop grounded targets up into a
 *               juggle.
 *  Arcanist   • SUSPENDED IN TIME: Time Sanctuary (4) lifts the foes inside the
 *               dome and freezes them in mid-air for 2.5 s, a free juggle window
 *               for the whole party.
 *
 *  Sync: kit effects ride on the casts every client already replays
 *  ('combat_action'); the Shield Counter is announced the same way.
 * ============================================================================= */
(function () {
  'use strict';
  const HOVER_BUDGET = 1.6;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    useSkill: GP.useSkill, perfectParry: GP.perfectParry, applyDamageToMonster: GP.applyDamageToMonster,
    updateMMOWorld: GP.updateMMOWorld
  };
  const _v = new THREE.Vector3();

  Object.assign(GP, {
    useSkill(slot, isRemoteOrAI, actor) {
      const ent = actor || this.player;
      if (slot === 'kit_counter') { if (actor && actor !== this.player) this.kitShieldCounter(actor, false); return; }
      const local = ent === this.player && !isRemoteOrAI;
      const p = this.player;
      const before = local && p.cooldowns ? p.cooldowns[slot] || 0 : 0;
      const start = ent && ent.pos ? ent.pos.clone() : null;
      const airborne = local && p.pos.y > 0.8;
      // Ranger hover fire: firing in mid-air buys a little hang time
      if (local && slot === 1 && p.classId === 'ranger' && p.pos.y > 0.4 && (p.cooldowns[1] || 0) <= 0 && (p._hoverBudget === undefined || p._hoverBudget > 0)) {
        if (p._hoverBudget === undefined) p._hoverBudget = HOVER_BUDGET;
        p.vy = Math.max(p.vy || 0, 2.4);
        p._hoverBudget -= 0.3;
        p._hoverUntil = performance.now() + 450;
        if (!this._hoverTxt || performance.now() - this._hoverTxt > 1500) { this._hoverTxt = performance.now(); this.spawnFloatingText(p.pos.clone().add(_v.set(0, 2.4, 0)), 'HOVER FIRE', '#2ee68a', 14); }
      }
      const r = orig.useSkill.apply(this, arguments);
      if (typeof slot !== 'number' || !ent || !ent.pos) return r;
      const fired = !local || ((p.cooldowns ? p.cooldowns[slot] || 0 : 0) > before + 0.01);
      if (!fired || this._skillEmitterWrap) return r;
      const cls = ent.classId;
      if (cls === 'berserker' && slot === 3 && airborne) this.kitMeteor(ent);
      else if (cls === 'vanguard' && slot === 3 && start) this.kitPlough(ent, start);
      else if (cls === 'arcanist' && slot === 4) this.kitStasis(ent);
      return r;
    },

    // ---- Berserker: Meteor Crash --------------------------------------------------------
    kitMeteor(ent) {
      const p = this.player;
      p.leapHeight = 0.8;                 // flatten the hop: it is a dive, not a jump
      p.vy = -26;
      this.spawnFloatingText(p.pos.clone().add(_v.set(0, 2.6, 0)), 'METEOR CRASH!', '#ff5a3c', 20);
      setTimeout(() => {
        if (!this.isInWorld || p.dead) return;
        const at = p.pos.clone(); at.y = 0;
        if (this.ccArea) this.ccArea(at, 6.5, 'slam', {}, p);
        this.damageEnemiesInRadius(at, 6.5, Math.round(this.getWeaponStats().dmg * 1.3), true, p);
        if (this.vfxShock) this.vfxShock(_v.set(at.x, 0, at.z), 7.5, 2.4, 0xff3b5c, 0xffd56b, { r0: 1, dur: 0.5 });
        if (this.spawnShockPillars) this.spawnShockPillars(at, 9, 4.2, 0xff3b5c, 0xff8a22);
        if (this.triggerImpact) this.triggerImpact(0.8, 0.06); else this.screenShake = Math.max(this.screenShake || 0, 0.7);
        if (this.styleAdd) this.styleAdd(10);
      }, 380);
    },

    // ---- Vanguard: Aegis Rush ploughs through ---------------------------------------------
    kitPlough(ent, start) {
      const fx = Math.sin(ent.yaw), fz = Math.cos(ent.yaw);
      const len = 5.4;
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (m.dead || m.isBoss) continue;
        const rx = m.pos.x - start.x, rz = m.pos.z - start.z;
        const along = rx * fx + rz * fz, side = rx * fz - rz * fx;
        if (along < -0.5 || along > len + 1 || Math.abs(side) > 2.4) continue;
        // shove them clear of the lane, then floor them
        const push = (side >= 0 ? 1 : -1) * (2.6 - Math.abs(side) * 0.4);
        m.pos.x += fz * push; m.pos.z -= fx * push;
        if (m.targetPos) m.targetPos.set(m.pos.x, m.targetPos.y, m.pos.z);
        if (this.ccApply) this.ccApply(m, 'slam', { down: m.isElite ? 0.5 : 1.0 }, ent);
      }
      if (ent === this.player) this.spawnFloatingText(ent.pos.clone().add(_v.set(0, 2.4, 0)), 'PLOUGH!', '#f3c86b', 15);
    },

    // ---- Vanguard: Shield Counter on a Perfect Guard --------------------------------------
    perfectParry(attacker) {
      const r = orig.perfectParry.apply(this, arguments);
      if (this.player && this.player.classId === 'vanguard') {
        const now = performance.now();
        if (now - (this._counterAt || 0) > 600) {            // a pack's simultaneous strikes trigger one counter
          this._counterAt = now;
          this.kitShieldCounter(this.player, true);
          if (this.broadcastCombatAction) this.broadcastCombatAction('kit_counter');
        }
      }
      return r;
    },

    kitShieldCounter(ent, local) {
      const at = ent.pos.clone(); at.y = 0;
      if (this.vfxShock) this.vfxShock(_v.set(at.x, 0, at.z), 5.5, 1.8, 0xf3c86b, 0xffffff, { r0: 0.8, dur: 0.4 });
      if (this.spawnShockwaveRing) this.spawnShockwaveRing(new THREE.Vector3(at.x, 0.9, at.z), 5, 0xffe08a, 0.3);
      if (this.ccArea) this.ccArea(at, 5, 'slam', {}, ent);
      if (local) {
        this.damageEnemiesInRadius(at, 5, Math.round(this.getWeaponStats().dmg * 1.2), true, ent);
        this.spawnFloatingText(at.clone().add(_v.set(0, 2.8, 0)), 'SHIELD COUNTER!', '#ffd56b', 19);
        if (this.triggerImpact) this.triggerImpact(0.55, 0.05);
      }
    },

    // ---- Arcanist: suspended in time --------------------------------------------------------
    kitStasis(ent) {
      if (!this.ccArea) return;
      const at = ent.pos.clone();
      this.ccArea(at, 7.2, 'launch', { vy: 6.5 }, ent);
      setTimeout(() => {
        if (!this.isInWorld) return;
        this.ccArea(at, 7.6, 'hold', { dur: 2.5 }, ent);
        if (ent === this.player) this.spawnFloatingText(at.clone().add(_v.set(0, 3, 0)), 'SUSPENDED IN TIME', '#7fe3ff', 16);
      }, 280);
    },

    // Ranger hover shots pop grounded targets into a juggle
    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork) {
      const p = this.player;
      const hover = !fromNetwork && p && p.classId === 'ranger' && (!attacker || attacker === p) && (p._hoverUntil || 0) > performance.now();
      const r = orig.applyDamageToMonster.apply(this, arguments);
      if (hover && mob && !mob.dead && this.ccState && this.ccState(mob) === 'ground' && this.ccApply) this.ccApply(mob, 'launch', { vy: 5.5 }, p);
      return r;
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      const p = this.player;
      if (p && p.classId === 'ranger' && p.pos.y <= 0.05 && p.grounded) p._hoverBudget = HOVER_BUDGET;   // refills on landing
    }
  });
})();
