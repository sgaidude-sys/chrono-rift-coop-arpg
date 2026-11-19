/* =============================================================================
 * Chrono-Rift — party roles: Vanguard tank (provoke) + Arcanist semi-healer
 *
 *  Vanguard (Tank)
 *   • Seismic Slam (2) PROVOKES: every enemy within 9 m must attack the Vanguard
 *     for 5 s (bosses 3 s). Applied by whoever simulates the monsters (the room
 *     host, or you when solo) - the host sees remote heroes' casts through the
 *     existing combat_action broadcast - and the core AI targets the taunter.
 *   • Bulwark (passive): the Vanguard takes 12% less damage.
 *
 *  Arcanist (Support caster)
 *   • Time Freeze (4) becomes TIME SANCTUARY: the stasis dome still locks
 *     enemies, and every ally inside (10 m) heals 30% max HP over 4 s. Each
 *     client heals its own hero when it is inside the dome (no extra traffic).
 *   • Lifebloom (passive): 6% of the Arcanist's damage heals the most wounded
 *     ally within 14 m (or the Arcanist). Remote allies are healed through a
 *     small 'heal' broadcast that their own client applies.
 * ============================================================================= */
(function () {
  'use strict';
  const PROVOKE_R = 9, PROVOKE_MS = 5000, PROVOKE_BOSS_MS = 3000;
  const SANCT_R = 10, SANCT_TOTAL = 0.30, SANCT_TICKS = 5, SANCT_EVERY = 0.8;
  const BLOOM = 0.06, BLOOM_R = 14;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, useSkill: GP.useSkill,
    damagePlayer: GP.damagePlayer, applyDamageToMonster: GP.applyDamageToMonster
  };
  const _v = new THREE.Vector3();

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      this._roles = { hots: [], bloom: 0, bloomT: 0 };
      try { this.retextRoleSkills(); } catch (e) { /* data not ready */ }
    },

    // ability text shown on the skill bar / tooltips
    retextRoleSkills() {
      if (typeof HERO_CLASSES === 'undefined') return;
      const v = HERO_CLASSES.vanguard && HERO_CLASSES.vanguard.skills;
      if (v && v[1]) { v[1].mult = '190% AoE + Provoke'; v[1].desc = 'Shatters the earth with golden shock pillars, stunning foes and PROVOKING every enemy within 9 m to attack you for 5 s. Bulwark: you take 12% less damage.'; }
      const a = HERO_CLASSES.arcanist && HERO_CLASSES.arcanist.skills;
      if (a && a[3]) { a[3].name = 'Time Sanctuary'; a[3].mult = '150% + Heal 30%'; a[3].desc = 'A chrono dome locks nearby foes in stasis and heals every ally inside for 30% max HP over 4 s. Lifebloom: 6% of your damage heals the most wounded ally nearby.'; }
      if (HERO_CLASSES.arcanist) HERO_CLASSES.arcanist.role = 'Support';
    },

    isSimulatingMobs() { return !!(this.isRoomHost || !this.remotePeers || this.remotePeers.size === 0); },

    useSkill(slot, isRemoteOrAI, actor) {
      const ent = actor || this.player;
      const local = ent === this.player && !isRemoteOrAI;
      const before = local && this.player.cooldowns ? this.player.cooldowns[slot] || 0 : 0;
      const r = orig.useSkill.apply(this, arguments);
      // did it actually fire? (local casts can be refused by cooldowns / synergy)
      const fired = !local || ((this.player.cooldowns ? this.player.cooldowns[slot] || 0 : 0) > before + 0.01);
      if (fired && ent && ent.pos && !this._skillEmitterWrap) {      // remote casts re-enter once inside an audio emitter
        if (ent.classId === 'vanguard' && slot === 2) this.roleProvoke(ent);
        if (ent.classId === 'arcanist' && slot === 4) this.roleSanctuary(ent);
      }
      return r;
    },

    // ---- Vanguard ------------------------------------------------------------
    roleProvoke(ent) {
      const now = performance.now();
      let n = 0;
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (m.dead || m.hp <= 0) continue;
        if (Math.hypot(m.pos.x - ent.pos.x, m.pos.z - ent.pos.z) > PROVOKE_R + (m.isBoss ? 3 : 0)) continue;
        n++;
        if (this.isSimulatingMobs()) {
          m.tauntedBy = ent; m.tauntUntil = now + (m.isBoss ? PROVOKE_BOSS_MS : PROVOKE_MS);
          m.aggroTimer = Math.max(m.aggroTimer || 0, 8);
        }
        if (this.vfxRune) this.vfxRune(_v.set(m.pos.x, 0.05, m.pos.z), 1.4 + (m.desiredHeight || 1.4) * 0.3, 0xff3b3b, 0xffd0c0, 0.9);
      }
      if (n && ent === this.player) this.spawnFloatingText(this.player.pos.clone().add(_v.set(0, 2.4, 0)), `PROVOKE ×${n}`, '#ff8a6b', 16);
      if (this.vfxShock) this.vfxShock(_v.set(ent.pos.x, 0, ent.pos.z), PROVOKE_R, 2.2, 0xff4a3a, 0xffe0c0, { r0: 1, dur: 0.5 });
    },

    damagePlayer(dmg) {
      if (this.player && this.player.classId === 'vanguard' && typeof dmg === 'number' && dmg > 0) arguments[0] = Math.max(1, Math.round(dmg * 0.88));
      return orig.damagePlayer.apply(this, arguments);
    },

    // ---- Arcanist ----------------------------------------------------------------
    roleSanctuary(caster) {
      if (this.vfxRune) this.vfxRune(_v.set(caster.pos.x, 0.05, caster.pos.z), SANCT_R, 0x7dffb0, 0xffffff, 4.2);
      if (this.vfxPillar) this.vfxPillar(_v.set(caster.pos.x, 0, caster.pos.z), 9, 1.6, 0x7dffb0, 0xffffff, 0);
      const p = this.player;
      if (!p || p.dead || p.hp <= 0) return;
      if (Math.hypot(p.pos.x - caster.pos.x, p.pos.z - caster.pos.z) > SANCT_R) return;
      this._roles.hots.push({ left: SANCT_TICKS, t: 0, amount: Math.round(p.maxHp * SANCT_TOTAL / SANCT_TICKS), from: caster === p ? '' : caster.name });
    },

    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork) {
      const hpBefore = mob && mob.hp;
      const r = orig.applyDamageToMonster.apply(this, arguments);
      if (!fromNetwork && mob && this._roles && this.player.classId === 'arcanist' && (!attacker || attacker === this.player)) {
        const dealt = Math.max(0, (hpBefore || 0) - Math.max(0, mob.hp || 0));
        if (dealt > 0) this._roles.bloom += dealt * BLOOM;
      }
      return r;
    },

    // most wounded hero within range (self included) by health fraction
    roleMostWounded(range) {
      const p = this.player;
      let best = p.hp > 0 && p.hp < p.maxHp ? { ent: p, f: p.hp / p.maxHp, id: this.playerToken } : null;
      if (this.remotePeers) this.remotePeers.forEach((pe, id) => {
        if (!pe.pos || !pe.maxHp || pe.hp <= 0 || pe.hp >= pe.maxHp) return;
        if (Math.hypot(pe.pos.x - p.pos.x, pe.pos.z - p.pos.z) > range) return;
        const f = pe.hp / pe.maxHp;
        if (!best || f < best.f) best = { ent: pe, f, id };
      });
      return best;
    },

    roleHealSelf(amount, fromName) {
      const p = this.player;
      if (!p || p.dead || p.hp <= 0 || amount <= 0) return;
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + amount);
      const got = Math.round(p.hp - before);
      if (got <= 0) return;
      this.spawnFloatingText(p.pos.clone().add(_v.set(0, 2.2, 0)), `+${got}`, '#7dffb0', 15);
      if (this.vfxSparks) this.vfxSparks(_v.set(p.pos.x, 1.2, p.pos.z), 10, { cols: [0x7dffb0, 0xffffff], speed: [1.5, 3.5], life: [0.4, 0.8], grav: -2.5, width: 0.04 });
      if (fromName && !this._roles.thanked) { this._roles.thanked = true; setTimeout(() => { if (this._roles) this._roles.thanked = false; }, 4000); }
    },

    onHealEvent(m) {
      if (!m || m.to !== this.playerToken || m.from === this.playerToken) return;
      this.roleHealSelf(Math.max(0, Math.min(5000, +m.amount || 0)), m.fromName);
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      const R = this._roles; if (!R || !this.isInWorld) return;
      // Time Sanctuary heal-over-time on this hero
      for (let i = R.hots.length - 1; i >= 0; i--) {
        const h = R.hots[i];
        h.t -= dt;
        if (h.t > 0) continue;
        h.t = SANCT_EVERY; h.left--;
        this.roleHealSelf(h.amount, h.from);
        if (h.left <= 0) R.hots.splice(i, 1);
      }
      // Lifebloom: pooled healing from the Arcanist's damage, sent ~3x a second
      R.bloomT -= dt;
      if (R.bloom >= 1 && R.bloomT <= 0) {
        R.bloomT = 0.35;
        const amount = Math.round(R.bloom); R.bloom = 0;
        const w = this.roleMostWounded(BLOOM_R), t = w && w.ent;
        if (t === this.player) this.roleHealSelf(amount, '');
        else if (t) {
          this.broadcastGameEvent && this.broadcastGameEvent('heal', { to: w.id, from: this.playerToken, fromName: this.player.name, amount });
          t.hp = Math.min(t.maxHp, (t.hp || 0) + amount);       // optimistic, corrected by their next state sync
          this.spawnFloatingText(t.pos.clone().add(_v.set(0, 2.2, 0)), `+${amount}`, '#7dffb0', 14);
        }
      }
      // provoke expiry: clear stale taunts so normal targeting resumes
      const now = performance.now();
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (m.tauntedBy && (!(m.tauntUntil > now) || m.dead || (m.tauntedBy.hp !== undefined && m.tauntedBy.hp <= 0))) { m.tauntedBy = null; m.tauntUntil = 0; }
      }
    }
  });

  window.CR_ROLES = { PROVOKE_R, SANCT_R };
})();
