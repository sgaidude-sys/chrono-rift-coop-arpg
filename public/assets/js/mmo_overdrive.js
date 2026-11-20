/* =============================================================================
 * Chrono-Rift — Awakened Overdrive (combat upgrade, phase 6)
 *
 *  R (Convergence, 100% synergy, 45 s cooldown) now awakens the hero for 12 s:
 *   • activation: a radial LAUNCH shockwave (8 m) and a minor heal (15% max HP)
 *     on top of the existing Convergence blast
 *   • while awakened: permanent super armor, skills 1–4 recharge 40% faster,
 *     a glowing class-coloured aura, and every basic attack throws an extra
 *     phantom strike (melee: a phantom slash wave; ranged: a phantom bolt) for
 *     50% damage
 *   • synergy does not build while awakened
 *
 *  Co-op DUAL CONVERGENCE: if two heroes awaken within 3 s of each other, both
 *  screens get a short slow-motion burst, a flash and a callout, a big launch
 *  shockwave erupts between them, and both Overdrives gain 4 s.
 *
 *  Sync: the ultimate is already replayed on every client ('combat_action'
 *  slot 5), so partners' auras, phantom strikes (visual) and the dual
 *  detection all run locally from that.
 * ============================================================================= */
(function () {
  'use strict';
  const DUR = 12, CDR = 0.4, HEAL = 0.15, DUAL_WINDOW = 3000, DUAL_BONUS = 4;
  const COL = { vanguard: 0xf3c86b, berserker: 0xff3b5c, ranger: 0x2ee68a, arcanist: 0xb266ff };
  const RANGED = { ranger: 1, arcanist: 1 };

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { useSkill: GP.useSkill, updateMMOWorld: GP.updateMMOWorld };
  const _v = new THREE.Vector3();

  Object.assign(GP, {
    useSkill(slot, isRemoteOrAI, actor) {
      const ent = actor || this.player;
      const p = this.player;
      const local = ent === p && !isRemoteOrAI;
      const before = local && p.cooldowns ? p.cooldowns[slot] || 0 : 0;
      const r = orig.useSkill.apply(this, arguments);
      if (typeof slot !== 'number' || !ent || !ent.pos) return r;
      const fired = !local || ((p.cooldowns ? p.cooldowns[slot] || 0 : 0) > before + 0.01);
      if (!fired || this._skillEmitterWrap) return r;
      if (slot === 5) this.odAwaken(ent, local);
      else if (slot === 1 && (ent._overdriveT || 0) > 0) this.odPhantom(ent, local);
      return r;
    },

    odAwaken(ent, local) {
      const col = COL[ent.classId] || 0xffd56b;
      ent._overdriveT = DUR;
      this.odAura(ent, true);
      if (this.ccArea) this.ccArea(ent.pos, 8, 'launch', {}, ent);
      if (this.vfxShock) this.vfxShock(_v.set(ent.pos.x, 0, ent.pos.z), 9, 3, col, 0xffffff, { r0: 1, dur: 0.6 });
      if (this.vfxPillar) this.vfxPillar(_v.set(ent.pos.x, 0, ent.pos.z), 14, 1.8, col, 0xffffff, 0);
      if (local) {
        const p = this.player;
        const heal = Math.round(p.maxHp * HEAL);
        p.hp = Math.min(p.maxHp, p.hp + heal);
        this.spawnFloatingText(p.pos.clone().add(_v.set(0, 2.2, 0)), `+${heal}`, '#7dffb0', 16);
        this.spawnFloatingText(p.pos.clone().add(_v.set(0, 3.1, 0)), 'AWAKENED OVERDRIVE', '#' + new THREE.Color(col).getHexString(), 22);
        if (this.epicCallout) this.epicCallout('AWAKENED', '#' + new THREE.Color(col).getHexString());
        if (this.styleAdd) this.styleAdd(30);
      }
      // dual convergence: another hero awakened within the window
      const now = performance.now();
      this._odLast = this._odLast || new Map();
      const id = ent === this.player ? 'me' : (ent.id || 'peer');
      let partner = null;
      this._odLast.forEach((t, k) => { if (k !== id && now - t <= DUAL_WINDOW) partner = k; });
      this._odLast.set(id, now);
      if (partner) {
        const other = partner === 'me' ? this.player : (this.remotePeers && this.remotePeers.get(partner));
        if (other) this.odDual(ent, other);
        this._odLast.clear();
      }
    },

    odDual(a, b) {
      const mid = new THREE.Vector3((a.pos.x + b.pos.x) / 2, 0, (a.pos.z + b.pos.z) / 2);
      if (this.slowMo) this.slowMo(0.3, 0.9);
      if (this.epicFlash) this.epicFlash(0.75, 520, '#fff');
      if (this.epicCallout) this.epicCallout('DUAL CONVERGENCE', '#7fe3ff');
      if (this.vfxShock) this.vfxShock(_v.set(mid.x, 0, mid.z), 14, 5, 0x7fe3ff, 0xffffff, { r0: 2, dur: 0.9 });
      if (this.vfxPillar) { this.vfxPillar(_v.set(a.pos.x, 0, a.pos.z), 18, 1.6, 0x7fe3ff, 0xffffff, 0); this.vfxPillar(_v.set(b.pos.x, 0, b.pos.z), 18, 1.6, 0x7fe3ff, 0xffffff, 0.08); }
      if (this.ccArea) this.ccArea(mid, 12, 'launch', { vy: 11 }, this.player);
      [a, b].forEach((e) => { if ((e._overdriveT || 0) > 0) e._overdriveT += DUAL_BONUS; });
      if (this.triggerImpact) this.triggerImpact(1.0, 0.08);
      if (this.styleAdd) this.styleAdd(60);
      this.addChatMessage && this.addChatMessage('Convergence', '⚡ DUAL CONVERGENCE! Both heroes are empowered.', 'sys-synergy');
    },

    // extra phantom strike on every basic attack while awakened
    odPhantom(ent, local) {
      const col = COL[ent.classId] || 0xffd56b;
      const fwd = new THREE.Vector3(Math.sin(ent.yaw), 0, Math.cos(ent.yaw));
      const dmg = local ? Math.round(this.getWeaponStats().dmg * 0.5) : 0;
      setTimeout(() => {
        if (!this.isInWorld || ent.dead) return;
        if (RANGED[ent.classId]) {
          if (this.spawnProjectile) this.spawnProjectile(ent.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.2), 30, dmg, col, true, !local,
            { pierce: true, maxPierces: 3, trailColor: col, actor: ent });
        } else {
          const at = ent.pos.clone().addScaledVector(fwd, 2.2);
          if (this.vfxArc) this.vfxArc(_v.set(at.x, 1.0, at.z), ent.yaw + (Math.random() - 0.5) * 0.6, 3.4, col, 0xffffff, { tilt: (Math.random() - 0.5) * 0.9, arc: 2.4, dur: 0.3 });
          if (local) this.damageEnemiesInCone(ent.pos, fwd, 4.8, 0.25, dmg, false, ent);
        }
      }, 90);
    },

    // glowing aura: a ground ring + rising embers, parented to the hero
    odAura(ent, on) {
      if (ent._odAura) { if (ent._odAura.parent) ent._odAura.parent.remove(ent._odAura); ent._odAura.geometry.dispose(); ent._odAura.material.dispose(); ent._odAura = null; }
      if (!on || !ent.meshRoot) return;
      const col = COL[ent.classId] || 0xffd56b;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.15, 40),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.renderOrder = 6;
      ent.meshRoot.add(ring);
      ent._odAura = ring;
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      const ents = [this.player];
      if (this.remotePeers) this.remotePeers.forEach(pe => ents.push(pe));
      const t = performance.now() / 1000;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (!e || !((e._overdriveT || 0) > 0)) continue;
        e._overdriveT = Math.max(0, e._overdriveT - dt);
        if (e === this.player) e.synergy = 0;                       // no synergy builds while awakened
        if (e === this.player && e.cooldowns) {
          for (let s = 1; s <= 4; s++) if (e.cooldowns[s] > 0) e.cooldowns[s] = Math.max(0, e.cooldowns[s] - dt * CDR);   // 40% faster
        }
        if (e._odAura) {
          const k = 1 + Math.sin(t * 7) * 0.08;
          e._odAura.scale.set(k, k, k);
          e._odAura.material.opacity = e._overdriveT < 2 ? 0.25 + 0.35 * Math.abs(Math.sin(t * 10)) : 0.6;
        }
        e._odEmb = (e._odEmb || 0) - dt;
        if (e._odEmb <= 0 && this.vfxSparks && e.pos) {
          e._odEmb = 0.14;
          const col = COL[e.classId] || 0xffd56b;
          this.vfxSparks(_v.set(e.pos.x, 0.4 + (e.pos.y || 0), e.pos.z), 4, { cols: [col, 0xffffff], speed: [1, 2.5], life: [0.5, 0.9], grav: -3.5, width: 0.04 });
        }
        if (e._overdriveT <= 0) {
          this.odAura(e, false);
          if (e === this.player) this.spawnFloatingText(e.pos.clone().add(_v.set(0, 2.4, 0)), 'OVERDRIVE FADES', '#9fb3d9', 13);
        }
      }
      if (this.player && this.player.dead && this.player._overdriveT > 0) { this.player._overdriveT = 0; this.odAura(this.player, false); }
    }
  });

  window.CR_OVERDRIVE = { DUR, CDR };
})();
