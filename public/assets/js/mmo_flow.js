/* =============================================================================
 * Chrono-Rift — combat flow: cancels, flinch, super armor, Perfect Guard
 * (combat upgrade, phase 3)
 *
 *  • Flinch: a heavy hit on the hero (10%+ of max HP) knocks them off balance for
 *    0.35 s: the current swing / spin is interrupted and skills can't be used.
 *    Small hits from trash mobs never flinch.
 *  • Dash-cancel (SPACE): the roll now cancels attack recovery, spins and flinches
 *    (mmo_combat.js dodgeRoll), with the roll's usual i-frames. A cancel flashes
 *    a quick afterimage and is worth a little style.
 *  • Super armor: heavy skills (2, 3, 4) and the ultimate make the hero immune to
 *    flinch while they play out ("SUPER ARMOR" pops when it saves you). Damage
 *    is still taken: super armor is about keeping your combo, not tanking.
 *  • Perfect Guard: the parry window is 0.22 s (was 0.18). A Perfect Guard also
 *    refills 15% Aether and 8% Convergence, and lifts the style rank one tier
 *    (mmo_style.js).
 * ============================================================================= */
(function () {
  'use strict';
  const FLINCH_AT = 0.10, FLINCH_T = 0.35;
  const SA_SKILL = { 2: 0.75, 3: 0.7, 4: 0.9, 5: 1.4 };    // s of super armor per slot (extended by leaps / spins)

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { useSkill: GP.useSkill, damagePlayer: GP.damagePlayer, perfectParry: GP.perfectParry, updateMMOWorld: GP.updateMMOWorld };
  const _v = new THREE.Vector3();

  Object.assign(GP, {
    hasSuperArmor() {
      const p = this.player;
      return !!p && ((p._saUntil || 0) > performance.now() || (p.leapTimer || 0) > 0 || (p.spinTimer || 0) > 0 || (p._overdriveT || 0) > 0);
    },

    useSkill(slot, isRemoteOrAI, actor) {
      const p = this.player;
      const local = (!actor || actor === p) && !isRemoteOrAI;
      if (local && (p._flinchT || 0) > 0) return;                 // off balance: dash out of it instead
      const before = local && p.cooldowns ? p.cooldowns[slot] || 0 : 0;
      const r = orig.useSkill.apply(this, arguments);
      if (local && SA_SKILL[slot] && p.cooldowns && (p.cooldowns[slot] || 0) > before + 0.001) {
        p._saUntil = Math.max(p._saUntil || 0, performance.now() + SA_SKILL[slot] * 1000);
      }
      return r;
    },

    damagePlayer(dmg) {
      const p = this.player, before = p ? p.hp : 0;
      const r = orig.damagePlayer.apply(this, arguments);
      if (!p || p.dead || p.hp <= 0 || before <= p.hp) return r;
      const f = (before - p.hp) / Math.max(1, p.maxHp);
      if (f < FLINCH_AT || p._mount) return r;
      if (this.hasSuperArmor()) {
        const now = performance.now();
        if (now - (this._saTxtAt || 0) > 900) {
          this._saTxtAt = now;
          this.spawnFloatingText(p.pos.clone().add(_v.set(0, 2.5, 0)), 'SUPER ARMOR', '#ffd56b', 15);
          if (this.spawnShockwaveRing) this.spawnShockwaveRing(new THREE.Vector3(p.pos.x, 1.0, p.pos.z), 1.6, 0xffd56b, 0.22);
        }
        return r;
      }
      // flinch: lose the current action for a moment
      p._flinchT = FLINCH_T;
      p.attackTimer = 0; p.spinTimer = 0;
      if (this.playEntityAnim) this.playEntityAnim(p, 'Hit_Chest', true);
      return r;
    },

    perfectParry(attacker) {
      const r = orig.perfectParry.apply(this, arguments);
      const p = this.player;
      if (p) {
        if (p.maxMp) p.mp = Math.min(p.maxMp, (p.mp || 0) + p.maxMp * 0.15);
        p.synergy = Math.min(100, (p.synergy || 0) + 8);
      }
      return r;
    },

    onDashCancel() {
      const p = this.player;
      const col = p.classId === 'ranger' ? 0x2ee68a : p.classId === 'arcanist' ? 0xb266ff : p.classId === 'berserker' ? 0xff3b5c : 0xf3c86b;
      if (this.spawnHeroAfterimage) this.spawnHeroAfterimage(p, p.pos.clone(), p.yaw, col, 0.4);
      if (this.styleAdd && performance.now() - (this._cancelStyleAt || 0) > 700) { this._cancelStyleAt = performance.now(); this.styleAdd(6); }
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      const p = this.player;
      if (p && p._flinchT > 0) p._flinchT = Math.max(0, p._flinchT - dt);
    }
  });

  window.CR_FLOW = { FLINCH_AT, FLINCH_T, SA_SKILL };
})();
