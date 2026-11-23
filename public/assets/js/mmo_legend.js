/* =============================================================================
 * Chrono-Rift — legendary build effects (upgrade phase 4)
 *
 *  Every Legendary and Mythic item carries ONE legendary power that changes how
 *  the hero plays (Mythic powers are 50% stronger). Weapons / off-hands roll
 *  offensive powers, armor rolls defensive / mobility powers, necks and rings
 *  roll "engine" powers. Different powers stack; the same power twice does not
 *  (the strongest copy counts). Legendaries found before this update get a power
 *  the first time they are looked at (picked from the item's id, so it is stable).
 *
 *  Elites and bosses also build a hidden "legendary pity" counter: every kill
 *  without a legendary raises the chance of a bonus legendary drop.
 *
 *  All effects run on the owner's client; extra damage goes through the normal
 *  hit path, so partners see it like any other hit.
 * ============================================================================= */
(function () {
  'use strict';
  const GP = ChronoRiftCoOpGame.prototype;
  const M = window.MMO;

  const POWERS = {
    // ---- weapon / off-hand -------------------------------------------------
    skybreaker: { g: 'weapon', name: 'Skybreaker', desc: (k) => `Launching an enemy releases a shockwave that launches foes within 4 m and deals ${pct(0.6 * k)} damage.` },
    meteorheart: { g: 'weapon', name: 'Meteor Heart', desc: (k) => `Slamming an airborne enemy erupts a fire nova for ${pct(1.5 * k)} damage.` },
    juggler: { g: 'weapon', name: "Juggler's Edge", desc: (k) => `Hits on airborne enemies deal +${pct(0.35 * k)} damage.` },
    executioner: { g: 'weapon', name: 'Executioner', desc: (k) => `+${pct(0.4 * k)} damage to enemies below 30% HP. Kills cut skill cooldowns by ${(1 * k).toFixed(1)} s.` },
    chainstorm: { g: 'weapon', name: 'Chain Storm', desc: (k) => `Critical hits arc lightning to 2 nearby enemies for ${pct(0.6 * k)} damage.` },
    // ---- armor --------------------------------------------------------------
    phantomstep: { g: 'armor', name: 'Phantom Step', desc: (k) => `Dodging leaves an afterimage that explodes for ${pct(1.2 * k)} damage.` },
    aegis: { g: 'armor', name: 'Aegis of Echoes', desc: (k) => `A Perfect Guard releases a blast (5 m, ${pct(2 * k)} damage) that breaks enemy posture.` },
    secondwind: { g: 'armor', name: 'Second Wind', desc: (k) => `Dropping below 30% HP heals ${pct(0.25 * k)} and makes you immune for 2.5 s (once per minute).` },
    stormrunner: { g: 'armor', name: 'Stormrunner', desc: (k) => `At style rank S or higher: +15% move speed and lightning strikes a nearby foe every 2 s (${pct(1 * k)} damage).` },
    bloodthirst: { g: 'armor', name: 'Bloodthirst', desc: (k) => `Kills heal ${pct(0.05 * k)} of your max HP.` },
    // ---- neck / ring ---------------------------------------------------------
    overclock: { g: 'jewel', name: 'Overclock', desc: (k) => `Awakened Overdrive lasts ${(4 * k).toFixed(0)} s longer and its activation deals ${pct(3 * k)} damage around you.` },
    synergist: { g: 'jewel', name: 'Synergist', desc: (k) => `Synergy builds ${pct(0.3 * k)} faster.` },
    echocaster: { g: 'jewel', name: 'Echo Caster', desc: (k) => `Every ${k > 1 ? '4th' : '5th'} skill you cast is refunded instantly.` },
    huntersfocus: { g: 'jewel', name: "Hunter's Focus", desc: (k) => `+${pct(0.25 * k)} damage to elites and bosses.` }
  };
  const GROUP = { weapon: 'weapon', offhand: 'weapon', head: 'armor', chest: 'armor', hands: 'armor', legs: 'armor', feet: 'armor', neck: 'jewel', ring: 'jewel' };
  const LEG = { legendary: 1, mythic: 1.5 };
  const COL = 0xff9a2e;
  const pct = (x) => Math.round(x * 100) + '%';

  function hashStr(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function poolFor(slot) { const g = GROUP[slot] || 'armor'; return Object.keys(POWERS).filter(k => POWERS[k].g === g); }

  const orig = {
    generateItem: GP.generateItem, itemTooltipHtml: GP.itemTooltipHtml, recalcPlayerStats: GP.recalcPlayerStats,
    renderInventoryModal: GP.renderInventoryModal, applyDamageToMonster: GP.applyDamageToMonster, ccApply: GP.ccApply,
    dodgeRoll: GP.dodgeRoll, perfectParry: GP.perfectParry, damagePlayer: GP.damagePlayer, getMoveSpeedMult: GP.getMoveSpeedMult,
    odAwaken: GP.odAwaken, useSkill: GP.useSkill, updateMMOWorld: GP.updateMMOWorld, rollMobLoot: GP.rollMobLoot
  };
  const _v = new THREE.Vector3();

  Object.assign(GP, {
    // ---- items --------------------------------------------------------------------------------
    legendEnsure(it) {
      if (!it || !LEG[it.rarity]) return null;
      if (!it.power || !POWERS[it.power]) {
        const pool = poolFor(it.slot);
        it.power = pool[hashStr(it.uid || it.name) % pool.length];
      }
      return it.power;
    },

    generateItem(o) {
      const it = orig.generateItem.apply(this, arguments);
      if (it && LEG[it.rarity]) {
        const pool = poolFor(it.slot);
        it.power = pool[Math.floor(Math.random() * pool.length)];
      }
      return it;
    },

    itemTooltipHtml(it, compare) {
      let html = orig.itemTooltipHtml.apply(this, arguments);
      const pw = this.legendEnsure(it);
      if (!pw) return html;
      const P = POWERS[pw], k = LEG[it.rarity];
      const block = `<div style="margin:5px 0 3px;padding:5px 7px;border-left:2px solid #ff9a2e;background:rgba(255,154,46,.08);border-radius:4px;">` +
        `<div style="color:#ffb35c;font-weight:800;font-size:12px;">✦ ${P.name}${k > 1 ? ' <span style="color:#ff3b5c;">(Mythic)</span>' : ''}</div>` +
        `<div style="color:#ffd9a8;font-size:11.5px;line-height:1.35;">${P.desc(k)}</div></div>`;
      // insert after the stat lines (before "Requires Level")
      const req = html.indexOf('Requires Level');
      const at = req > 0 ? html.lastIndexOf('<div', req) : -1;
      return at > 0 ? html.slice(0, at) + block + html.slice(at) : html + block;
    },

    recalcPlayerStats(fullHeal) {
      const r = orig.recalcPlayerStats.apply(this, arguments);
      const act = {};
      const eq = this.mmoState ? this.mmoState.equip : {};
      Object.values(eq || {}).forEach((it) => {
        const pw = this.legendEnsure(it);
        if (pw) act[pw] = Math.max(act[pw] || 0, LEG[it.rarity]);
      });
      this._legend = act;
      return r;
    },

    lg(id) { return (this._legend && this._legend[id]) || 0; },

    renderInventoryModal() {
      const r = orig.renderInventoryModal.apply(this, arguments);
      const el = document.getElementById('inv-hero-summary');
      if (el && this._legend) {
        const ids = Object.keys(this._legend);
        const row = document.createElement('div');
        row.className = 'inv-stat-row';
        row.style.cssText = 'flex-wrap:wrap;gap:4px;';
        row.innerHTML = `<span>Legendary Powers</span>` + (ids.length
          ? `<b style="color:#ffb35c;text-align:right;line-height:1.5;">${ids.map(id => `<div title="${POWERS[id].desc(this._legend[id]).replace(/"/g, '&quot;')}">✦ ${POWERS[id].name}${this._legend[id] > 1 ? ' (Mythic)' : ''}</div>`).join('')}</b>`
          : `<b style="color:var(--text-muted);font-weight:400;">None — Legendary &amp; Mythic gear grant one each</b>`);
        el.appendChild(row);
      }
      return r;
    },

    // ---- helpers ------------------------------------------------------------------------------
    lgDmg(mult) { return Math.max(1, Math.round(this.getWeaponStats().dmg * mult)); },

    lgText(txt, col) {
      const p = this.player;
      this.spawnFloatingText(p.pos.clone().add(_v.set(0, 2.6, 0)), txt, col || '#ffb35c', 15);
    },

    lgBurst(pos, r, mult, heavy, col, label) {
      const c = new THREE.Vector3(pos.x, 0, pos.z);
      if (this.vfxShock) this.vfxShock(c, r, 2.2, col || COL, 0xffffff, { r0: 0.4, dur: 0.45 });
      if (this.vfxSparks) this.vfxSparks(_v.set(c.x, 0.6, c.z), 18, { cols: [col || COL, 0xffffff], speed: [4, 10], life: [0.3, 0.6], grav: 8, width: 0.05 });
      this._lgInner = (this._lgInner || 0) + 1;
      try { this.damageEnemiesInRadius(c, r, this.lgDmg(mult), !!heavy, this.player); } finally { this._lgInner--; }
      if (label) this.lgText(label);
    },

    lgBolt(m, mult) {
      if (!m || m.dead) return;
      if (this.vfxPillar) this.vfxPillar(_v.set(m.pos.x, 0, m.pos.z), 9, 0.35, 0x8fd8ff, 0xffffff, 0);
      if (this.vfxSparks) this.vfxSparks(_v.set(m.pos.x, 1, m.pos.z), 10, { cols: [0x8fd8ff, 0xffffff], speed: [3, 8], life: [0.2, 0.45], grav: 6, width: 0.04 });
      this._lgInner = (this._lgInner || 0) + 1;
      try { this.applyDamageToMonster(m, this.lgDmg(mult), false, this.player); } finally { this._lgInner--; }
    },

    lgNearest(pos, r, n, skip) {
      const out = [];
      for (let i = 0; i < this.monsters.length; i++) {
        const o = this.monsters[i];
        if (o.dead || o === skip) continue;
        const d = Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z);
        if (d <= r) out.push([d, o]);
      }
      return out.sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]);
    },

    lgReady(key, sec) {
      const now = performance.now(), T = this._lgT || (this._lgT = {});
      if (now - (T[key] || 0) < sec * 1000) return false;
      T[key] = now; return true;
    },

    // ---- offensive hooks --------------------------------------------------------------------------
    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork) {
      const local = !fromNetwork && (!attacker || attacker === this.player) && mob && !mob.dead;
      if (!local || !this._legend) return orig.applyDamageToMonster.apply(this, arguments);
      let k = 1;
      const air = this.ccState && this.ccState(mob) === 'air';
      if (this.lg('juggler') && air) k *= 1 + 0.35 * this.lg('juggler');
      if (this.lg('executioner') && mob.hp < mob.maxHp * 0.3) k *= 1 + 0.4 * this.lg('executioner');
      if (this.lg('huntersfocus') && (mob.isElite || mob.isBoss)) k *= 1 + 0.25 * this.lg('huntersfocus');
      if (k !== 1) arguments[1] = Math.round(baseDmg * k);
      const before = mob.hp;
      const r = orig.applyDamageToMonster.apply(this, arguments);
      const dealt = before - mob.hp;
      // chain storm: big hit (a crit) arcs lightning
      if (this.lg('chainstorm') && !this._lgInner && dealt > 0 && (isHeavy || dealt >= arguments[1] * 1.45) && this.lgReady('chain', 0.3)) {   // heavy hits always crit
        this.lgNearest(mob.pos, 7, 2, mob).forEach(o => this.lgBolt(o, 0.6 * this.lg('chainstorm')));
      }
      if (mob.dead && before > 0) {
        if (this.lg('executioner')) {
          const cut = 1 * this.lg('executioner'), cd = this.player.cooldowns || {};
          for (let s = 1; s <= 4; s++) if (cd[s] > 0) cd[s] = Math.max(0, cd[s] - cut);
        }
        if (this.lg('bloodthirst') && this.lgReady('blood', 0.2)) {
          const p = this.player, heal = Math.round(p.maxHp * 0.05 * this.lg('bloodthirst'));
          if (p.hp > 0 && p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + heal); this.spawnFloatingText(p.pos, `+${heal}`, '#7dffb0', 13); }
        }
      }
      return r;
    },

    ccApply(m, tag, o, caster) {
      const local = !caster || caster === this.player;
      const wasAir = local && m && this.ccState && this.ccState(m) === 'air';
      const r = orig.ccApply.apply(this, arguments);
      if (!r || !local || !this._legend || this._lgInner || !m) return r;
      if (tag === 'launch' && !wasAir && this.lg('skybreaker') && this.lgReady('sky', 0.8)) {
        this._lgInner = (this._lgInner || 0) + 1;
        try { if (this.ccArea) this.ccArea({ x: m.pos.x, z: m.pos.z }, 4, 'launch', {}, this.player); } finally { this._lgInner--; }
        this.lgBurst(m.pos, 4, 0.6 * this.lg('skybreaker'), false, 0x9fd8ff, 'SKYBREAKER');
      }
      if (tag === 'slam' && wasAir && this.lg('meteorheart') && this.lgReady('meteor', 0.5)) {
        if (this.vfxPillar) this.vfxPillar(_v.set(m.pos.x, 0, m.pos.z), 6, 1.2, 0xff5a1a, 0xffd56b, 0);
        this.lgBurst(m.pos, 4.5, 1.5 * this.lg('meteorheart'), true, 0xff5a1a, 'METEOR HEART');
      }
      return r;
    },

    // ---- defensive hooks ----------------------------------------------------------------------
    dodgeRoll(fromBuffer) {
      const before = this._roll;
      const r = orig.dodgeRoll.apply(this, arguments);
      if (this._roll && this._roll !== before && this.lg('phantomstep') && this.lgReady('phantom', 1.2)) {
        const p = this.player, at = p.pos.clone(), yaw = p.yaw, k = this.lg('phantomstep');
        if (this.spawnHeroAfterimage) this.spawnHeroAfterimage(p, at.clone(), yaw, 0xb266ff, 0.7);
        setTimeout(() => { if (this.isInWorld && !p.dead) this.lgBurst(at, 3.5, 1.2 * k, true, 0xb266ff, null); }, 600);
      }
      return r;
    },

    perfectParry(attacker) {
      const r = orig.perfectParry.apply(this, arguments);
      if (this.lg('aegis') && this.lgReady('aegis', 0.4)) {
        const p = this.player;
        this.lgBurst(p.pos, 5, 2 * this.lg('aegis'), true, 0xf3c86b, 'AEGIS');
        if (this.addPosture) this.lgNearest(p.pos, 5, 12).forEach(o => this.addPosture(o, 25));
      }
      return r;
    },

    damagePlayer(dmg) {
      if (this._lgImmune > 0) { const p = this.player; if (p && this.lgReady('immtxt', 0.6)) this.spawnFloatingText(p.pos, 'IMMUNE', '#ffd56b', 14); return 0; }
      const r = orig.damagePlayer.apply(this, arguments);
      const p = this.player;
      if (this.lg('secondwind') && p && p.hp > 0 && !p.dead && p.hp < p.maxHp * 0.3 && this.lgReady('wind', 60)) {
        const heal = Math.round(p.maxHp * 0.25 * this.lg('secondwind'));
        p.hp = Math.min(p.maxHp, p.hp + heal);
        this._lgImmune = 2.5;
        this.spawnFloatingText(p.pos, `+${heal}`, '#7dffb0', 16);
        this.lgText('SECOND WIND', '#ffd56b');
        if (this.vfxPillar) this.vfxPillar(_v.set(p.pos.x, 0, p.pos.z), 8, 1.4, 0xffd56b, 0xffffff, 0);
      }
      return r;
    },

    getMoveSpeedMult() {
      const b = orig.getMoveSpeedMult ? orig.getMoveSpeedMult.call(this) : 1;
      return (this.lg('stormrunner') && this.styleRank && this.styleRank() >= 4) ? b * 1.15 : b;
    },

    // ---- engine hooks -------------------------------------------------------------------------------
    odAwaken(ent, local) {
      const r = orig.odAwaken.apply(this, arguments);
      if (local && ent === this.player && this.lg('overclock')) {
        const k = this.lg('overclock');
        ent._overdriveT = (ent._overdriveT || 0) + 4 * k;
        this.lgBurst(ent.pos, 8, 3 * k, true, 0xff9a2e, 'OVERCLOCK');
      }
      return r;
    },

    useSkill(slot, isRemoteOrAI, actor) {
      const p = this.player;
      const local = (!actor || actor === p) && !isRemoteOrAI;
      const before = local && p.cooldowns ? (p.cooldowns[slot] || 0) : 0;
      const r = orig.useSkill.apply(this, arguments);
      if (local && slot >= 1 && slot <= 4 && this.lg('echocaster') && p.cooldowns && (p.cooldowns[slot] || 0) > before + 0.01) {
        const every = this.lg('echocaster') > 1 ? 4 : 5;
        this._lgEcho = (this._lgEcho || 0) + 1;
        if (this._lgEcho >= every) {
          this._lgEcho = 0;
          p.cooldowns[slot] = 0;
          this.lgText('ECHO!', '#c9a6ff');
        }
      }
      return r;
    },

    updateMMOWorld(dt) {
      const p = this.player;
      const syn0 = p ? (p.synergy || 0) : 0;
      orig.updateMMOWorld.call(this, dt);
      if (!p || !this.isInWorld) return;
      if (this._lgImmune > 0) this._lgImmune -= dt;
      // synergist: top up any synergy gained since last frame (hits add it outside this loop too)
      if (this.lg('synergist')) {
        const last = this._lgSyn === undefined ? syn0 : this._lgSyn;
        const gain = (p.synergy || 0) - last;
        if (gain > 0 && gain < 40 && !((p._overdriveT || 0) > 0)) p.synergy = Math.min(100, p.synergy + gain * 0.3 * this.lg('synergist'));
        this._lgSyn = p.synergy || 0;
      }
      // stormrunner: lightning while at S rank
      if (this.lg('stormrunner') && this.styleRank && this.styleRank() >= 4 && !p.dead) {
        this._lgStorm = (this._lgStorm || 0) - dt;
        if (this._lgStorm <= 0) {
          const t = this.lgNearest(p.pos, 9, 1)[0];
          if (t) { this._lgStorm = 2; this.lgBolt(t, 1 * this.lg('stormrunner')); } else this._lgStorm = 0.3;
        }
      }
    },

    // ---- legendary pity on elites / bosses --------------------------------------------------------
    rollMobLoot(mob) {
      const r = orig.rollMobLoot.apply(this, arguments);
      try {
        const p = this.player, st = this.mmoState;
        if (mob && st && p && (mob.isElite || mob.isBoss) && Math.hypot(p.pos.x - mob.pos.x, p.pos.z - mob.pos.z) <= 110) {
          st.lgPity = (st.lgPity || 0) + (mob.isWorldBoss ? 6 : (mob.isBoss ? 3 : 1));
          const chance = 0.008 + st.lgPity * 0.0016;   // economy pass: ~1 bonus legendary per ~25 elite kills
          if (Math.random() < chance) {
            st.lgPity = 0;
            const it = this.generateItem({ ilvl: mob.level || 1, rarity: 'legendary', cls: p.classId });
            this.spawnItemDrop(mob.pos.clone().add(_v.set(0.8, 0, -0.8)), it, 0, null);
            this.addChatMessage && this.addChatMessage('Loot', `✦ A legendary item fell from ${mob.name}: ${it.name} (${POWERS[it.power].name})`, 'sys-synergy');
          }
        }
      } catch (e) { /* loot is best-effort */ }
      return r;
    }
  });

  window.CR_LEGEND = { POWERS, GROUP };
})();
