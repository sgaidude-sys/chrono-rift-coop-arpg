/* =============================================================================
 * Chrono-Rift — game feel pass (combat upgrade, phase 7)
 *
 *  • Lethal hits send normal enemies flying: the corpse is thrown up and back
 *    along the killing blow (higher and further for heavy / critical finishers)
 *    and tumbles as it dissolves. Elites get a smaller toss; bosses keep their
 *    own death sequence.
 *  • Heavy finishers freeze the frame for 55 ms (on top of the existing kill
 *    juice), and heavy hits give a small directional camera kick from the
 *    target, throttled so multi-hit skills never feel sluggish.
 *  • Pack density lives in world_core.js (camps of 6–9 in the open zones).
 * ============================================================================= */
(function () {
  'use strict';
  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { applyDamageToMonster: GP.applyDamageToMonster, handleMonsterDeath: GP.handleMonsterDeath };

  Object.assign(GP, {
    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork) {
      const local = !fromNetwork && (!attacker || attacker === this.player);
      const alive = mob && !mob.dead && mob.hp > 0;
      if (local && alive) { this._feelHeavy = !!isHeavy; this._feelCrit = false; }
      const r = orig.applyDamageToMonster.apply(this, arguments);
      if (!local || !alive || !mob) return r;
      const now = performance.now();
      if (isHeavy && !mob.isBoss && this.cameraKick && now - (this._feelKickAt || 0) > 120) {
        this._feelKickAt = now;
        this.cameraKick(mob.pos, mob.dead ? 0.7 : 0.4);
      }
      if (mob.dead && isHeavy && this.triggerImpact && now - (this._feelStopAt || 0) > 160) {
        this._feelStopAt = now;
        this.triggerImpact(0.45, 0.055);
      }
      return r;
    },

    handleMonsterDeath(mob, fromNetwork, hitDir) {
      const wasDead = !mob || mob.dead;
      const r = orig.handleMonsterDeath.apply(this, arguments);
      if (wasDead || !mob || mob.isBoss) return r;
      // throw the corpse: up (mmo_cc arc) and further back along the blow
      const heavy = !fromNetwork && this._feelHeavy;
      const up = (heavy ? 8.5 : 5.5) * (mob.isElite ? 0.55 : 1);
      const c = mob.cc || (mob.cc = { st: 0, y: 0, vy: 0, air: 0, down: 0, jug: 0, slam: false, pull: null, tilt: 0 });
      if (c.st !== 1) { c.st = 1; c.y = Math.max(c.y, 0.05); c.air = 0; c.jug = 0; c.slam = false; }
      c.vy = Math.max(c.vy, up);
      c.pull = null; c.hold = 0;
      if (mob.kbVel) mob.kbVel.multiplyScalar(heavy ? 1.6 : 1.25);
      return r;
    }
  });
})();
