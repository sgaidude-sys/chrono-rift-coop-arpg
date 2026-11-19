/* =============================================================================
 * Chrono-Rift — roaming bosses ("the hunt")
 *
 *  Zone bosses and world bosses no longer wait in a fixed arena. Each one walks
 *  a long patrol route through its zone: out from its lair through 5–6 far
 *  waypoints and back, pausing to sniff around at each stop. The route and the
 *  boss's place on it are a pure function of the world seed and the wall clock,
 *  so every client agrees where the boss is even before it has been spawned.
 *
 *   • The boss "camp" follows the route, so the boss only spawns (and the world
 *     boss only announces itself) when a hero actually gets close to it.
 *   • When heroes engage, the fight is anchored where it started (bigger leash
 *     than the old arenas). If everyone flees the boss heals, then walks back to
 *     its route.
 *   • The world map shows a "last sighted" circle (refreshed every minute, with
 *     a fuzzed centre) rather than an exact pin: you have to hunt it down. Once
 *     a boss is within sight of you its marker becomes exact.
 *   • Bosses resist crowd control (short flinch, then 6 s stun immunity), so
 *     they can no longer be stun-locked; posture staggers still work.
 *   • World bosses drop richer loot (two epic+ items, better legendary/mythic
 *     odds).
 * ============================================================================= */
(function () {
  'use strict';
  const M = window.MMO, W = M.WORLD;
  const CW = window.ChronoWorld;
  const S = W.scale || 1;
  const SIGHT_EVERY = 60;          // s between map sightings
  const SIGHT_FUZZ = 70 * S;       // m the sighting centre can be off by
  const SIGHT_R = 120 * S;         // m radius of the sighting circle

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, createWorldMob: GP.createWorldMob,
    playEntityAnim: GP.playEntityAnim, rollMobLoot: GP.rollMobLoot, getMobById: GP.getMobById
  };

  // ---- deterministic patrol routes ----------------------------------------------
  function buildRoute(wg, c) {
    const zone = wg.zones[c.zone];
    const world = c.kind === 'worldboss';
    const rng = CW.mulberry32((W.seed * 31 + c.id * 7919 + (world ? 17 : 3)) >>> 0);
    const lair = [c.x, c.z];
    const pts = [lair];
    const K = world ? 6 : 5;
    const okPoint = (x, z, margin) => {
      if (Math.abs(x) > W.half - 120 || Math.abs(z) > W.half - 120) return false;
      if (!wg.insideZone(x, z, zone.idx, margin)) return false;
      if (wg.terrainHeight(x, z) < W.waterLevel + 0.6) return false;
      if (Math.hypot(x, z) < 300 * S) return false;                                  // keep out of town
      if (Math.hypot(x - zone.outpost[0], z - zone.outpost[1]) < 140) return false;   // and the outpost
      return true;
    };
    const okSegment = (a, b) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(2, Math.ceil(len / 15));
      for (let k = 1; k < n; k++) {
        const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        if (!okPoint(x, z, 35)) return false;
        if (wg.terrainSlope(x, z) > 0.75) return false;
      }
      return true;
    };
    for (let k = 0; k < K; k++) {
      const prev = pts[pts.length - 1];
      let best = null, bestS = -1e9;
      for (let tries = 0; tries < 70; tries++) {
        const a = rng() * Math.PI * 2, r = (150 + rng() * 230) * S;
        const p = [prev[0] + Math.cos(a) * r, prev[1] + Math.sin(a) * r];
        if (!okPoint(p[0], p[1], 70) || !okSegment(prev, p)) continue;
        let spread = 1e9;
        for (const q of pts) spread = Math.min(spread, Math.hypot(p[0] - q[0], p[1] - q[1]));
        const s = Math.min(spread, 500 * S) + rng() * 60;
        if (s > bestS) { bestS = s; best = p; }
      }
      if (!best) break;
      pts.push(best);
    }
    // ping-pong: lair → p1 … pK → … p1 → (lair) — every leg was validated
    const seq = pts.slice();
    for (let k = pts.length - 2; k >= 1; k--) seq.push(pts[k]);
    const speed = world ? 2.2 : 2.6, pause = world ? 9 : 6;
    const legs = [];
    let total = 0;
    for (let k = 0; k < seq.length; k++) {
      const a = seq[k], b = seq[(k + 1) % seq.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const walk = len / speed;
      legs.push({ a, b, t0: total, walk, len });
      total += walk + pause;
    }
    return { pts, legs, period: Math.max(1, total), phase: rng() * total, speed };
  }

  // where a route puts its boss at time t (seconds)
  function routeAt(rt, t, out) {
    let u = (t + rt.phase) % rt.period;
    if (u < 0) u += rt.period;
    let L = rt.legs[0];
    for (let i = 0; i < rt.legs.length; i++) { if (rt.legs[i].t0 <= u) L = rt.legs[i]; else break; }
    const k = Math.min(1, (u - L.t0) / (L.walk || 1));
    out.x = L.a[0] + (L.b[0] - L.a[0]) * k;
    out.z = L.a[1] + (L.b[1] - L.a[1]) * k;
    out.moving = k < 1 && L.len > 0.5;
    out.yaw = Math.atan2(L.b[0] - L.a[0], L.b[1] - L.a[1]);
    return out;
  }

  const nowS = () => Date.now() / 1000;

  // Bosses shrug off crowd control: a skill stun is only a short flinch (0.6 s) and
  // then the boss is immune to stuns for 6 s. Posture staggers (earned mostly by
  // parrying) still land in full - that is the real damage window.
  const FLINCH = 0.6, CC_IMMUNE_MS = 6000;
  function bossStunResist(m) {
    let st = +m.stunTimer || 0;
    Object.defineProperty(m, 'stunTimer', {
      configurable: true, enumerable: true,
      get() { return st; },
      set(v) {
        v = +v || 0;
        if (v <= st) { st = Math.max(0, v); return; }                         // ticking down / cleared
        if (m.staggerTimer > 0 && v <= m.staggerTimer + 0.05) { st = v; return; }   // posture stagger
        const now = performance.now();
        if (now < (m._ccImmuneUntil || 0)) return;
        st = Math.min(v, FLINCH);
        m._ccImmuneUntil = now + CC_IMMUNE_MS;
      }
    });
  }
  const _p = { x: 0, z: 0, moving: false, yaw: 0 };

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      const wg = this.worldGen;
      if (!wg || !wg.camps) return;
      const roam = wg.camps.filter(c => (c.kind === 'boss' || c.kind === 'worldboss') && !(c.boss && c.boss.isFinal));   // the final boss keeps its throne
      roam.forEach((c) => { c.lair = [c.x, c.z]; c.route = buildRoute(wg, c); });
      this._roamCamps = roam;
      if (!wg._roamWrapped) {
        wg._roamWrapped = true;
        const near = wg.campsNear.bind(wg);
        wg.campsNear = (x, z, r) => {
          const out = near(x, z, r).filter(c => !c.route);
          for (let i = 0; i < roam.length; i++) {
            const c = roam[i];
            if ((c.x - x) ** 2 + (c.z - z) ** 2 <= r * r) out.push(c);
          }
          return out;
        };
      }
      this.updateRoamCamps(0);
    },

    // camp for a zone's boss (world = world boss)
    roamCampFor(zone, world) {
      return (this._roamCamps || []).find(c => c.zone === zone.idx && (c.kind === 'worldboss') === !!world) || null;
    },

    // world-map position for a boss: exact when it is live near you, otherwise a fuzzed sighting
    bossMapPos(zone, world) {
      const c = this.roamCampFor(zone, world);
      if (!c || !c.route) return { x: (world ? zone.worldBossPos : zone.bossPos)[0], z: (world ? zone.worldBossPos : zone.bossPos)[1], r: 0 };
      const live = this.monsters.find(m => m.campId === c.id && !m.dead);
      const p = this.player.pos;
      if (live && Math.hypot(live.pos.x - p.x, live.pos.z - p.z) < 160) return { x: live.pos.x, z: live.pos.z, r: 0, exact: true };
      const slot = Math.floor(nowS() / SIGHT_EVERY);
      routeAt(c.route, slot * SIGHT_EVERY, _p);
      const h = CW.hash2(slot, c.id, 77), h2 = CW.hash2(c.id, slot, 91);
      const a = h * Math.PI * 2, d = h2 * SIGHT_FUZZ;
      return { x: _p.x + Math.cos(a) * d, z: _p.z + Math.sin(a) * d, r: SIGHT_R };
    },

    createWorldMob(id, spec, x, z, camp) {
      const m = orig.createWorldMob.apply(this, arguments);
      if (m && m.isBoss) bossStunResist(m);
      if (m && m.isBoss && camp && camp.route) {
        m.roamCamp = camp;
        m.arenaR = m.isWorldBoss ? 40 : 30;     // fights are anchored where they start
      }
      return m;
    },

    // a host snapshot may name the boss before we have it: the camp moves, so trust the snapshot
    getMobById(id) {
      const mob = orig.getMobById.call(this, id);
      if (mob || !id || !this._roamCamps) return mob;
      const mm = /^c(\d+)s(\d+)g(\d+)$/.exec(id);
      if (!mm) return mob;
      const c = this.worldGen.camps[+mm[1]];
      if (!c || !c.route) return mob;
      if (Math.hypot(this.player.pos.x - c.x, this.player.pos.z - c.z) > W.activateRadius + 220) return null;
      const st = this.getCampState(c);
      const s = +mm[2], g = +mm[3];
      if (st.slots[s]) { st.slots[s].gen = Math.max(st.slots[s].gen, g); st.slots[s].spawnedOnce = true; }
      return this.spawnCampMob(c, s, g);
    },

    // a roaming boss "idles" by walking its route
    playEntityAnim(entity, name, force) {
      if (entity && entity._roamMoving && name === 'Idle_Loop') name = 'Walk_Loop';
      return orig.playEntityAnim.call(this, entity, name, force);
    },

    updateRoamCamps(dt) {
      const camps = this._roamCamps;
      if (!camps) return;
      const t = nowS();
      const auth = this.isRoomHost || !this.remotePeers || this.remotePeers.size === 0;
      for (let i = 0; i < camps.length; i++) {
        const c = camps[i];
        let m = null;
        for (let j = 0; j < this.monsters.length; j++) {
          const o = this.monsters[j];
          if (o.campId === c.id && !o.dead && !o.isAdd) { m = o; break; }
        }
        routeAt(c.route, t, _p);
        if (!m) { c.x = _p.x; c.z = _p.z; continue; }
        if (auth && dt > 0) this.roamStep(m, _p, dt);
        c.x = m.pos.x; c.z = m.pos.z;
      }
    },

    roamStep(m, rp, dt) {
      const st = m.bossState;
      const busy = (st && (st.engaged || st.cast > 0)) || m._dash || m.stunTimer > 0 || m.hp < m.maxHp;
      if (busy) { m._roamMoving = false; return; }
      const dx = rp.x - m.pos.x, dz = rp.z - m.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 3) {
        // catching up with the route (after a reset / a respawn mid-route)
        const step = Math.min(d, Math.max(m.speed || 3, 3) * 1.15 * dt);
        m.pos.x += dx / d * step; m.pos.z += dz / d * step;
        m.yaw = Math.atan2(dx, dz);
        if (this.resolveObstacleCollisions) this.resolveObstacleCollisions(m.pos, 1.1);
        m._roamMoving = true;
      } else {
        m.pos.x = rp.x; m.pos.z = rp.z;
        if (rp.moving) {
          let dy = rp.yaw - m.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          m.yaw += dy * Math.min(1, dt * 4);
        }
        m._roamMoving = rp.moving;
      }
      m.isMovingNow = m._roamMoving;
      if (m.homePos) m.homePos.set(m.pos.x, 0, m.pos.z);
      if (m.targetPos) m.targetPos.set(m.pos.x, 0, m.pos.z);
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (this.isInWorld) this.updateRoamCamps(dt);
    },

    // world bosses: the reward for the hunt
    rollMobLoot(mob) {
      if (!mob || !mob.isWorldBoss) return orig.rollMobLoot.apply(this, arguments);
      const p = this.player;
      if (Math.hypot(p.pos.x - mob.pos.x, p.pos.z - mob.pos.z) > 110) return;
      const L = mob.level || 1;
      const top = () => (Math.random() < 0.12 ? 'mythic' : (Math.random() < 0.4 ? 'legendary' : 'epic'));
      const drops = [
        this.generateItem({ ilvl: L + 2, minRarity: 'epic', rarity: top(), cls: p.classId }),
        this.generateItem({ ilvl: L + 2, minRarity: 'epic', rarity: top() }),
        this.generateItem({ ilvl: L + 1, minRarity: 'rare', cls: p.classId }),
        this.generateItem({ ilvl: L + 1, minRarity: 'rare' })
      ];
      const gold = Math.round((2 + L * 1.6) * 40 * (0.8 + Math.random() * 0.4));
      drops.forEach((it, i) => this.spawnItemDrop(mob.pos, it, i === 0 ? gold : 0, null));
    }
  });

  window.CR_HUNT = { buildRoute, routeAt };
})();
