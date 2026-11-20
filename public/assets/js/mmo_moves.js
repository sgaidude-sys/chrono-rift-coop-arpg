/* =============================================================================
 * Chrono-Rift — directional moves (combat upgrade, phase 4)
 *
 *  A small input layer on top of the hotbar. Plain attacks are unchanged; the
 *  directional moves only fire when they make sense, so walking while attacking
 *  still just attacks:
 *
 *   W + attack  RIFT LUNGE    — melee: dash into an enemy 3–10 m ahead and cut
 *                               through it. Ranger: Slide Shot (slide in, point-
 *                               blank blast that slams foes down). Arcanist:
 *                               Blink Burst (blink forward, small pull + blast).
 *   S + attack  RISING STRIKE — a launcher when an enemy is in reach: knocks it
 *                               into the air and the hero hops up with it (melee).
 *                               Ranger: Vault Glyph (backflip, the glyph left
 *                               behind erupts and launches). Arcanist: Gravity
 *                               Rise (launch at the aim point).
 *   F           RIFT BREAKER  — when there is nothing to interact with: an
 *                               overhead smash that SLAMS airborne foes into the
 *                               ground and knocks standing ones down. Used in
 *                               the air, the hero dives down with it.
 *
 *  Each move has its own short cooldown (shown above the hotbar), counts as a
 *  heavy action (super armor while it plays), can be dash-cancelled like any
 *  attack, and scores style as its own move. Co-op: the move name goes out
 *  through the existing 'combat_action' event, so partners see it and the
 *  crowd control lands on every client (mmo_cc.js).
 * ============================================================================= */
(function () {
  'use strict';
  const MOVES = {
    mv_lunge: { name: 'Rift Lunge', key: 'W + Attack', cd: 3.0 },
    mv_rise: { name: 'Rising Strike', key: 'S + Attack', cd: 4.0 },
    mv_break: { name: 'Rift Breaker', key: 'F', cd: 5.0 }
  };
  const RANGED = { ranger: 1, arcanist: 1 };
  const COL = { vanguard: 0xf3c86b, berserker: 0xff3b5c, ranger: 0x2ee68a, arcanist: 0xb266ff };

  const css = `
  #dir-moves { position: fixed; left: 50%; bottom: 112px; transform: translateX(-50%); display: none; gap: 6px; z-index: 40; pointer-events: none; }
  #dir-moves .mv { font: 700 10px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .5px; color: #f5f2eb; background: rgba(8,12,22,.62);
    border: 1px solid rgba(255,213,107,.35); border-radius: 999px; padding: 3px 9px; white-space: nowrap; transition: opacity .15s, border-color .15s; }
  #dir-moves .mv b { color: #ffd56b; margin-right: 4px; }
  #dir-moves .mv.cd { opacity: .45; border-color: rgba(255,255,255,.12); }
  #dir-moves .mv.fire { border-color: #ffd56b; box-shadow: 0 0 10px rgba(255,213,107,.6); }
  body.touch-ui #dir-moves, body.cr-title-on #dir-moves, body.epic-cine #dir-moves { display: none; }`;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { initMMOWorld: GP.initMMOWorld, useSkill: GP.useSkill, triggerInteract: GP.triggerInteract, updateMMOWorld: GP.updateMMOWorld };
  const _v = new THREE.Vector3(), _f = new THREE.Vector3();

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      this._moves = { cd: { mv_lunge: 0, mv_rise: 0, mv_break: 0 }, dash: null, uiT: 0 };
      if (!document.getElementById('dir-moves-css')) {
        const st = document.createElement('style'); st.id = 'dir-moves-css'; st.textContent = css; document.head.appendChild(st);
      }
      if (!document.getElementById('dir-moves')) {
        const el = document.createElement('div'); el.id = 'dir-moves';
        el.innerHTML = Object.keys(MOVES).map(k => `<span class="mv" data-mv="${k}"><b>${MOVES[k].key}</b>${MOVES[k].name}</span>`).join('');
        document.body.appendChild(el);
      }
      this._moves.ui = {};
      document.querySelectorAll('#dir-moves .mv').forEach((e) => { this._moves.ui[e.dataset.mv] = e; });
    },

    // ---- input ------------------------------------------------------------------------
    useSkill(slot, isRemoteOrAI, actor) {
      // a partner's directional move arriving over the network
      if (typeof slot === 'string' && MOVES[slot]) {
        if (actor && actor !== this.player) this.dirMovePlay(slot, actor, false);
        return;
      }
      const p = this.player;
      const local = (!actor || actor === p) && !isRemoteOrAI;
      if (local && slot === 1 && this._moves && !this.isAnyModalOpen && !this.cutsceneActive) {
        const k = this.keys || {};
        const fwd = k['w'] || k['arrowup'], back = k['s'] || k['arrowdown'];
        if (fwd && !back && this.dirMoveTry('mv_lunge')) return;
        if (back && !fwd && this.dirMoveTry('mv_rise')) return;
      }
      return orig.useSkill.apply(this, arguments);
    },

    triggerInteract() {
      if (this.activeInteractable) return orig.triggerInteract.apply(this, arguments);
      if (this.isInWorld && !this.isAnyModalOpen && !this.cutsceneActive) this.dirMoveTry('mv_break');
    },

    // nearest live enemy within range in front of the hero (dot >= minDot)
    dirMoveTarget(range, minDot, minDist) {
      const p = this.player;
      _f.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
      let best = null, bd = 1e9;
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (m.dead || m.hp <= 0) continue;
        const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, d = Math.hypot(dx, dz);
        if (d > range || d < (minDist || 0)) continue;
        if (minDot > -1 && d > 0.5 && (dx * _f.x + dz * _f.z) / d < minDot) continue;
        if (d < bd) { bd = d; best = m; }
      }
      return best;
    },

    dirMoveTry(id) {
      const p = this.player, M = this._moves;
      if (!p || p.dead || p._mount || (p._flinchT || 0) > 0 || (p.leapTimer || 0) > 0 || M.cd[id] > 0) return false;
      if (this._roll) return false;
      // face the aim point first so "ahead" means where the player is pointing
      if (this.updateMouseWorld && this.mouseWorld) {
        this.updateMouseWorld();
        const dx = this.mouseWorld.x - p.pos.x, dz = this.mouseWorld.z - p.pos.z;
        if (dx * dx + dz * dz > 0.04) p.yaw = Math.atan2(dx, dz);
      }
      const ranged = !!RANGED[p.classId];
      if (id === 'mv_lunge') {
        const t = ranged ? this.dirMoveTarget(6, 0.35) : this.dirMoveTarget(10, 0.55, 3);
        if (!t) return false;
        if (!ranged) p.yaw = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
      } else if (id === 'mv_rise') {
        if (!this.dirMoveTarget(ranged ? 6.5 : 4.5, -1)) return false;
      }
      M.cd[id] = MOVES[id].cd * (1 - (p.haste || 0) * 0.5);
      if (p.meshRoot) p.meshRoot.rotation.y = p.yaw;
      this.dirMovePlay(id, p, true);
      if (this.broadcastCombatAction) this.broadcastCombatAction(id);
      if (this.styleNoteCast) this.styleNoteCast(id);
      p._saUntil = Math.max(p._saUntil || 0, performance.now() + 550);
      const ui = M.ui && M.ui[id];
      if (ui) { ui.classList.add('fire'); setTimeout(() => ui.classList.remove('fire'), 220); }
      return true;
    },

    // ---- the moves (runs for the local hero and, visually, for partners) ---------------------
    dirMovePlay(id, ent, local) {
      const cls = ent.classId || 'vanguard', col = COL[cls] || 0xffd56b;
      const ranged = !!RANGED[cls];
      const w = local ? this.getWeaponStats() : { dmg: 0 };
      const fwd = new THREE.Vector3(Math.sin(ent.yaw), 0, Math.cos(ent.yaw));
      const anim = (n) => { if (this.playEntityAnim) this.playEntityAnim(ent, n, true); };
      ent._swingUntil = performance.now() + 380;
      if (local) ent.attackTimer = 0.42;
      if (this.audio && this.audio.playSwing) this.audio.playSwing(true);

      if (id === 'mv_lunge') {
        if (!ranged) {
          // dash to just in front of the target (or 7 m), cutting everything on the way
          let dist = 7;
          const t = local ? this.dirMoveTarget(10, 0.55, 0) : null;
          if (t) dist = Math.max(1.5, Math.min(9.5, Math.hypot(t.pos.x - ent.pos.x, t.pos.z - ent.pos.z) - 1.4));
          anim('Sword_Dash');
          if (local) this.dirDash(ent, fwd, dist, 0.2, () => {
            this.damageEnemiesInCone(ent.pos, fwd, 3.4, 0.2, Math.round(w.dmg * 1.4), true, ent);
            this.dirImpact(ent.pos, col, 0.3);
          });
          if (this.vfxArc) setTimeout(() => this.vfxArc(_v.set(ent.pos.x, 1.0, ent.pos.z), ent.yaw, 3.2, col, 0xffffff, { tilt: 0.25, arc: 2.2 }), 190);
          if (this.spawnHeroAfterimage) this.spawnHeroAfterimage(ent, ent.pos.clone(), ent.yaw, col, 0.35);
        } else if (cls === 'ranger') {
          // Slide Shot: slide in, then a point-blank blast that spikes foes down
          anim('Spell_Simple_Shoot');
          if (local) this.dirDash(ent, fwd, 3.5, 0.18, () => {
            this.damageEnemiesInCone(ent.pos, fwd, 5, 0.45, Math.round(w.dmg * 1.5), true, ent);
            this.dirImpact(ent.pos.clone().addScaledVector(fwd, 2), col, 0.28);
          });
          setTimeout(() => {
            const c = ent.pos.clone().addScaledVector(fwd, 2.2);
            if (this.ccArea) this.ccArea(c, 3.2, 'slam', {}, ent);
            if (this.vfxArc) this.vfxArc(_v.set(c.x, 0.9, c.z), ent.yaw, 3.6, col, 0xffffff, { arc: 1.4 });
          }, 200);
        } else {
          // Blink Burst: blink forward, a small pull and an arcane blast
          anim('Spell_Simple_Enter');
          const from = ent.pos.clone();
          if (local) { this.dirDash(ent, fwd, 5.5, 0.08); ent.dodgeTimer = Math.max(ent.dodgeTimer || 0, 0.2); }
          if (this.spawnShockwaveRing) this.spawnShockwaveRing(new THREE.Vector3(from.x, 0.05, from.z), 1.8, col, 0.25);
          setTimeout(() => {
            if (this.ccArea) this.ccArea(ent.pos, 6, 'vacuum', { dur: 0.3, str: 22, stop: 1.2 }, ent);
            if (local) this.damageEnemiesInRadius(ent.pos, 3.6, Math.round(w.dmg * 1.25), true, ent);
            this.dirImpact(ent.pos, col, 0.3);
          }, 120);
        }
      } else if (id === 'mv_rise') {
        if (!ranged) {
          // Rising Strike: an upward cut that launches, and the hero hops up after it
          anim('Sword_Regular_C');
          setTimeout(() => {
            if (local) this.damageEnemiesInCone(ent.pos, fwd, 4.2, 0.25, Math.round(w.dmg * 1.15), false, ent);
            if (this.ccArea) this.ccArea(ent.pos.clone().addScaledVector(fwd, 1.8), 3.2, 'launch', {}, ent);
            if (this.vfxArc) this.vfxArc(_v.set(ent.pos.x, 1.2, ent.pos.z).addScaledVector(fwd, 1.2), ent.yaw, 2.6, col, 0xffffff, { tilt: 1.35, arc: 2.0 });
            if (local && ent.grounded !== false) { ent.vy = 8.2; ent.grounded = false; ent.isJumping = true; ent.jumpTimer = 0; }
          }, 110);
        } else if (cls === 'ranger') {
          // Vault Glyph: backflip away; the glyph left behind erupts and launches
          anim('Roll');
          const at = ent.pos.clone();
          if (local) { this.dirDash(ent, fwd.clone().negate(), 4.5, 0.32, null, true); ent.dodgeTimer = Math.max(ent.dodgeTimer || 0, 0.3); }
          if (this.vfxRune) this.vfxRune(_v.set(at.x, 0.05, at.z), 3.2, col, 0xffffff, 0.6);
          setTimeout(() => {
            if (this.ccArea) this.ccArea(at, 3.4, 'launch', {}, ent);
            if (local) this.damageEnemiesInRadius(at, 3.4, Math.round(w.dmg * 1.35), true, ent);
            this.dirImpact(at, col, 0.35);
          }, 520);
        } else {
          // Gravity Rise: lift everything at the aim point
          anim('Spell_Simple_Shoot');
          const c = this.getClampedAimPos ? this.getClampedAimPos(ent, 7, 4.5) : ent.pos.clone().addScaledVector(fwd, 4.5);
          if (this.vfxRune) this.vfxRune(_v.set(c.x, 0.05, c.z), 3, col, 0xffffff, 0.45);
          setTimeout(() => {
            if (this.ccArea) { this.ccArea(c, 4.2, 'vacuum', { dur: 0.15, str: 30, stop: 0.6 }, ent); this.ccArea(c, 3.4, 'launch', {}, ent); }
            if (local) this.damageEnemiesInRadius(c, 3.4, Math.round(w.dmg * 1.2), false, ent);
            if (this.vfxPillar) this.vfxPillar(_v.set(c.x, 0, c.z), 6, 1.4, col, 0xffffff, 0);
          }, 260);
        }
      } else if (id === 'mv_break') {
        // Rift Breaker: an overhead smash that spikes airborne foes and floors the rest
        const airborne = local ? (ent.pos.y > 0.5) : false;
        anim(ranged ? 'Spell_Simple_Shoot' : 'Sword_Heavy_Combo');
        if (local && airborne) ent.vy = -22;                         // dive with it
        const c = ranged ? (this.getClampedAimPos ? this.getClampedAimPos(ent, 8, 5) : ent.pos.clone().addScaledVector(fwd, 5)) : null;
        setTimeout(() => {
          const at = c || ent.pos.clone().addScaledVector(fwd, 2);
          if (this.ccArea) this.ccArea(at, 3.6, 'slam', {}, ent);
          if (local) this.damageEnemiesInRadius(at, 3.6, Math.round(w.dmg * 1.55), true, ent);
          this.dirImpact(at, col, 0.45);
          if (this.spawnShockPillars) this.spawnShockPillars(at, 5, 2.2, col, 0xffffff);
        }, airborne ? 140 : 230);
      }
    },

    dirImpact(at, col, kick) {
      if (this.spawnShockwaveRing) this.spawnShockwaveRing(new THREE.Vector3(at.x, 0.06, at.z), 3.2, col, 0.28);
      if (this.vfxSparks) this.vfxSparks(_v.set(at.x, 0.9, at.z), 16, { cols: [0xffffff, col], speed: [4, 9], life: [0.2, 0.45], grav: 6, width: 0.05 });
      const p = this.player;
      if (Math.hypot(at.x - p.pos.x, at.z - p.pos.z) < 16) {
        if (this.triggerImpact) this.triggerImpact(kick, 0.045); else this.screenShake = Math.max(this.screenShake || 0, kick);
      }
    },

    // short eased dash for the local hero (collides with props, ends with an optional hit)
    dirDash(ent, dir, dist, dur, onEnd, keepYaw) {
      this._moves.dash = { ent, dx: dir.x, dz: dir.z, dist, dur, t: 0, done: 0, onEnd, keepYaw };
      ent.dodgeTimer = Math.max(ent.dodgeTimer || 0, Math.min(0.15, dur));
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      const M = this._moves; if (!M) return;
      for (const k in M.cd) if (M.cd[k] > 0) M.cd[k] = Math.max(0, M.cd[k] - dt);
      const D = M.dash;
      if (D) {
        const e = D.ent;
        D.t += dt;
        const k = 1 - Math.pow(1 - Math.min(1, D.t / D.dur), 2);
        const step = (k - D.done) * D.dist; D.done = k;
        const px = e.pos.x, pz = e.pos.z;
        const lim = window.MMO.WORLD.half - 10;
        e.pos.x = Math.max(-lim, Math.min(lim, e.pos.x + D.dx * step));
        e.pos.z = Math.max(-lim, Math.min(lim, e.pos.z + D.dz * step));
        if (this.worldClampMove) this.worldClampMove(e.pos, px, pz);
        if (this.resolveObstacleCollisions) this.resolveObstacleCollisions(e.pos, 0.55);
        if (!D.keepYaw) e.yaw = Math.atan2(D.dx, D.dz);
        if (e.meshRoot) { e.meshRoot.position.x = e.pos.x; e.meshRoot.position.z = e.pos.z; }
        if (D.t >= D.dur) { M.dash = null; if (D.onEnd) D.onEnd(); if (this.broadcastPlayerState) this.broadcastPlayerState(false); }
      }
      // hotbar chips
      M.uiT -= dt;
      if (M.uiT <= 0 && M.ui) {
        M.uiT = 0.1;
        for (const k in M.ui) M.ui[k].classList.toggle('cd', M.cd[k] > 0);
        const show = this.isInWorld && !this.cutsceneActive && !document.body.classList.contains('cr-acct-on');
        const el = document.getElementById('dir-moves');
        if (el && el._show !== show) { el._show = show; el.style.display = show ? 'flex' : 'none'; }
      }
    }
  });

  window.CR_MOVES = { MOVES };
})();
