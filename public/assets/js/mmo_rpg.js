// =============================================================================
// CHRONO-RIFT MMO RPG — leveling curve, gear & loot, inventory, quests, saves.
// =============================================================================
(function () {
  'use strict';
  const M = window.MMO;
  const W = M.WORLD;
  const proto = ChronoRiftCoOpGame.prototype;
  const orig = {
    selectClassCard: proto.selectClassCard,
    saveHeroToSupabase: proto.saveHeroToSupabase,
    loadOrInitHeroFromSupabase: proto.loadOrInitHeroFromSupabase,
    applyDamageToMonster: proto.applyDamageToMonster,
    openModal: proto.openModal,
    closeModals: proto.closeModals
  };
  const RAR = {};
  M.RARITIES.forEach((r, i) => { RAR[r.id] = Object.assign({ idx: i }, r); });
  const SLOT = {};
  M.EQUIP_SLOTS.forEach(s => { SLOT[s.id] = s; });
  const SLOT_ORDER = {};
  M.EQUIP_SLOTS.forEach((s, i) => { SLOT_ORDER[s.id] = i; });
  // backpack category tabs
  const INV_CATS = [
    { id: 'all', name: 'All', icon: '🎒', test: () => true },
    { id: 'weapons', name: 'Weapons', icon: '⚔️', test: it => it.slot === 'weapon' || it.slot === 'offhand' },
    { id: 'armor', name: 'Armor', icon: '🥋', test: it => ['head', 'chest', 'hands', 'legs', 'feet'].includes(it.slot) },
    { id: 'jewelry', name: 'Jewelry', icon: '💍', test: it => it.slot === 'neck' || it.slot === 'ring' },
    { id: 'upgrades', name: 'Upgrades', icon: '▲', test: (it, g) => g.isUpgrade(it) },
    { id: 'junk', name: 'Junk', icon: '🪙', test: (it, g) => (it.rarity === 'common' || (it.clsList && !it.clsList.includes(g.player.classId) && RAR[it.rarity].idx < 2)) && !g.isUpgrade(it) }   // what Sell junk sells
  ];
  if (!M.BAG_SIZE) M.BAG_SIZE = 80;
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const uid = () => 'it' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------------------------------------------------------------------------
  // QUEST GENERATION (deterministic per zone)
  // ---------------------------------------------------------------------------
  function buildQuests() {
    const all = [];
    M.ZONES.forEach((z, zi) => {
      const mobs = z.mobs.slice().sort((a, b) => a.lv[0] - b.lv[0]);
      const span = z.lv[1] - z.lv[0];
      const items = M.COLLECT_ITEMS[z.id];
      const sites = M.EXPLORE_SITES[z.id];
      const giver = M.QUEST_GIVERS[z.id].name;
      const lvAt = (tier) => z.lv[0] + Math.round(span * tier / 4);
      const mb = (i) => mobs[Math.min(mobs.length - 1, i)];
      const Q = [];
      const add = (q) => { q.zone = z.id; q.giver = giver; q.id = `${z.id}_${Q.length + 1}`; Q.push(q); };
      add({ tier: 0, kind: 'kill', target: mb(0).type, targetName: mb(0).name, count: 8, title: `Pest Control: ${mb(0).name}s`, text: `The ${mb(0).name}s have overrun the trails near ${z.id === 'meadows' ? 'the Bastion' : 'our outpost'}. Thin their numbers — 8 should do.` });
      add({ tier: 0, kind: 'kill', target: mb(1).type, targetName: mb(1).name, count: 10, title: `${mb(1).name} Cull`, text: `Travellers report ${mb(1).name}s attacking caravans. Slay 10 of them.` });
      add({ tier: 0, kind: 'explore', site: 0, title: `Scout: ${sites[0]}`, text: `Scouts went quiet near the ${sites[0]}. Find it and see what remains.` });
      add({ tier: 1, kind: 'collect', target: mb(2).type, targetName: mb(2).name, item: items[0], count: 8, chance: 0.5, title: `Gather ${items[0]}`, text: `I need ${items[0]} for my work. ${mb(2).name}s carry them. Bring me 8.` });
      add({ tier: 1, kind: 'kill', target: mb(3).type, targetName: mb(3).name, count: 12, title: `Into the Wilds`, text: `Push deeper. ${mb(3).name}s guard the way forward — defeat 12.` });
      add({ tier: 1, kind: 'elite', target: z.elites[0].name, count: 1, title: `Bounty: ${z.elites[0].name}`, text: `A named beast, ${z.elites[0].name}, terrorises these lands. Elites hit hard — bring friends or come prepared.` });
      add({ tier: 2, kind: 'collect', target: mb(4).type, targetName: mb(4).name, item: items[1], count: 8, chance: 0.45, title: `${items[1]} Requisition`, text: `${items[1]} from ${mb(4).name}s. Eight will keep the forge running.` });
      add({ tier: 2, kind: 'explore', site: 1, title: `Scout: ${sites[1]}`, text: `Strange lights over the ${sites[1]}. Go and look.` });
      add({ tier: 2, kind: 'kill', target: mb(mobs.length - 1).type, targetName: mb(mobs.length - 1).name, count: 14, title: `Apex Predators`, text: `The ${mb(mobs.length - 1).name}s are the most dangerous creatures here. Slay 14 to prove yourself.` });
      add({ tier: 3, kind: 'elite', target: z.elites[1].name, count: 1, title: `Bounty: ${z.elites[1].name}`, text: `${z.elites[1].name} must fall. This one is worth a fortune.` });
      add({ tier: 3, kind: 'collect', target: mb(Math.max(0, mobs.length - 2)).type, targetName: mb(Math.max(0, mobs.length - 2)).name, item: items[2], count: 10, chance: 0.4, title: `${items[2]}`, text: `Ten ${items[2]} — the final ingredient for the ward I'm building against ${z.boss.name}.` });
      add({ tier: 4, kind: 'boss', target: z.boss.name, count: 1, title: `☠ ${z.boss.name}, ${z.boss.title}`, text: `It's time. ${z.boss.name} roams the zone; the ☠ on your map marks where it was last seen. Hunt it down, then learn its rotation — every ability has a tell. Watch the cast bar and move.` });
      const next = M.ZONES[zi + 1];
      if (next) {
        add({ tier: 5, kind: 'travel', target: next.id, count: 1, title: `Onward to ${next.name}`, text: `You've outgrown these lands. Follow the road through the mountain pass to ${next.name} and report to ${M.QUEST_GIVERS[next.id].name}. (Recommended level ${next.lv[0]})` });
      }
      Q.forEach((q) => {
        if (!q.count) q.count = 1;
        q.level = lvAt(Math.min(4, q.tier));
        const mult = { kill: 10, collect: 12, explore: 7, elite: 15, boss: 32, travel: 6 }[q.kind];
        q.xp = Math.round(M.mobXp(q.level) * mult);
        q.gold = Math.round((8 + q.level * 4) * (q.kind === 'boss' ? 5 : (q.kind === 'elite' ? 2.5 : 1.2)));
        q.reward = q.kind === 'boss' ? 'epic' : (q.kind === 'elite' ? 'rare' : (q.kind === 'travel' || q.kind === 'explore' ? null : 'uncommon'));
        q.minLevel = Math.max(1, q.level - 3);
      });
      all.push(...Q);
    });
    return all;
  }

  Object.assign(proto, {
    // =========================================================================
    // INIT
    // =========================================================================
    initMMORpg() {
      this.questDefs = buildQuests();
      this.questById = {};
      this.questDefs.forEach(q => { this.questById[q.id] = q; });
      this.mmoState = this.freshMMOState();
      this.loadMMOState(this.player.classId);
      this.injectRpgHud();
      window.addEventListener('keydown', (e) => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        if (this.cutsceneActive) return;
        const k = e.key.toLowerCase();
        if (k === 'm') {
          if (document.getElementById('mmo-map-modal').classList.contains('active')) this.closeModals(true);
          else if (!this.isAnyModalOpen) this.openWorldMap(this.isAtWaypoint());
        } else if (k === 'o') {
          if (document.getElementById('mmo-quest-modal').classList.contains('active')) this.closeModals(true);
          else if (!this.isAnyModalOpen) this.openQuestLog();
        }
      });
      setInterval(() => { if (this.isInWorld) this.saveMMOState(); }, 30000);
    },

    freshMMOState() {
      return {
        v: 1, level: 1, xp: 0, gold: 150, shards: 10, potions: 3,
        equip: {}, bag: [], quests: {}, tracked: [],
        waypoints: new Set(['town']), zonesSeen: new Set(['meadows'])
      };
    },

    mmoKey(classId) { return `arpg_mmo_v1_${this.heroSaveToken}_${classId}`; },

    saveMMOState() {
      if (!this.mmoState) return;
      const s = this.mmoState;
      s.level = this.player.level; s.xp = this.player.xp; s.gold = this.player.gold; s.shards = this.player.shards; s.potions = this.player.potions;
      const out = Object.assign({}, s, { waypoints: [...s.waypoints], zonesSeen: [...s.zonesSeen] });
      try { localStorage.setItem(this.mmoKey(this._mmoClass || this.player.classId), JSON.stringify(out)); } catch (e) {}
    },

    loadMMOState(classId) {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(this.mmoKey(classId)) || 'null'); } catch (e) {}
      const st = this.freshMMOState();
      if (s && s.v === 1) {
        Object.assign(st, s);
        st.waypoints = new Set(s.waypoints || ['town']);
        st.zonesSeen = new Set(s.zonesSeen || ['meadows']);
      }
      // town NPC quests (Kaelen's bounty, Aldous's boss quest) are saved with the hero
      const town = { catacombBounty: { state: 'available', kills: 0, target: 5 }, archonBoss: { state: 'available', kills: 0, target: 1 } };
      Object.keys(town).forEach((k) => { if (st.town && st.town[k]) Object.assign(town[k], st.town[k]); });
      st.town = town;
      this.quests = town;
      this.mmoState = st;
      this._mmoClass = classId;
      const p = this.player;
      p.level = st.level; p.xp = st.xp; p.gold = st.gold; p.shards = st.shards; p.potions = st.potions;
      const pc = document.getElementById('potion-count');
      if (pc) pc.textContent = p.potions;
      if (!st.equip.weapon) {
        const starter = this.generateItem({ ilvl: 1, rarity: 'common', slot: 'weapon', cls: classId });
        starter.name = 'Recruit\'s ' + starter.baseName;
        st.equip.weapon = starter;
        const cls = HERO_CLASSES[classId];
        if (cls && cls.defaultOffhand) {
          const off = this.generateItem({ ilvl: 1, rarity: 'common', slot: 'offhand', cls: classId });
          off.name = 'Recruit\'s ' + off.baseName;
          st.equip.offhand = off;
        }
      }
      this.applyEquipmentVisuals();
      this.recalcPlayerStats(true);
      this.updateStoryTrackerUI && this.updateStoryTrackerUI();
    },

    // =========================================================================
    // STATS
    // =========================================================================
    recalcPlayerStats(fullHeal = false) {
      const p = this.player;
      const cls = HERO_CLASSES[p.classId] || HERO_CLASSES.vanguard;
      const eq = this.mmoState ? this.mmoState.equip : {};
      const s = { vit: 0, power: 0, crit: 0, critdmg: 0, haste: 0, leech: 0, speed: 0, armorpct: 0, armor: 0 };
      Object.values(eq).forEach((it) => {
        if (!it) return;
        s.armor += it.armor || 0;
        Object.entries(it.affixes || {}).forEach(([k, v]) => { s[k] = (s[k] || 0) + v; });
      });
      s.armor = Math.round(s.armor * (1 + s.armorpct / 100));
      const prevRatio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
      p.maxHp = M.heroHp(cls.baseHp, p.level) + s.vit;
      p.maxMp = cls.baseMp + (p.level - 1) * 3;
      p.hp = fullHeal ? p.maxHp : Math.max(1, Math.min(p.maxHp, Math.round(prevRatio * p.maxHp)));
      p.mp = Math.min(p.mp || p.maxMp, p.maxMp);
      p.armor = s.armor;
      p.powerPct = s.power;
      p.critBonus = s.crit / 100;
      p.critMult = 1.65 + s.critdmg / 100;
      p.haste = Math.min(0.4, s.haste / 100);
      p.leech = s.leech / 100;
      p.moveBonus = Math.min(0.3, s.speed / 100);
      const w = eq.weapon;
      p.weaponLevel = 1 + ((w && w.temper) || 0);
      this.statSummary = s;
    },

    getWeaponStats() {
      const p = this.player;
      const eq = this.mmoState ? this.mmoState.equip : {};
      const w = eq.weapon, o = eq.offhand;
      let dmg = w ? w.dmg : M.weaponDmg(p.level) * 0.8;
      if (o && o.dmg) dmg += o.dmg * 0.25;
      const temper = 1 + ((w && w.temper) || 0) * 0.06;
      const blessing = (p.solarBlessingTimer > 0 ? 1.2 : 1.0) * (p.frenzyTimer > 0 ? 1.15 : 1.0) * (p.bannerBuffTimer > 0 ? 1.25 : 1.0);
      return {
        dmg: Math.round(dmg * (1 + (p.powerPct || 0) / 100) * temper * blessing),
        crit: Math.min(0.75, (w ? w.crit : 0.12) + (p.critBonus || 0) + (p.frenzyTimer > 0 ? 0.08 : 0)),
        name: w ? w.name : 'Fists'
      };
    },

    mitigation(srcLevel) {
      const L = srcLevel || this.player.level;
      const a = this.player.armor || 0;
      return Math.min(0.75, a / (a + 40 + 22 * L));
    },

    levelDiffDamageMult(mob) {
      const d = (mob.level || this.player.level) - this.player.level;
      return d <= 0 ? 1 : Math.max(0.25, 1 - d * 0.1);      // 3 levels under: -30%, 5 under: -50%
    },

    getMoveSpeedMult() {
      const p = this.player;
      const travel = (performance.now() - (this._lastCombatTime || 0) > 5000) ? 1.3 : 1.0;
      return (1 + (p.moveBonus || 0)) * travel;
    },

    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork = false, netData = null, opts = {}) {
      if (!fromNetwork && mob && !mob.dead) {
        if (attacker === this.player || !attacker) {
          this._lastCombatTime = performance.now();
          baseDmg = baseDmg * this.levelDiffDamageMult(mob);
        }
      }
      const before = mob ? mob.hp : 0;
      orig.applyDamageToMonster.call(this, mob, baseDmg, isHeavy, attacker, fromNetwork, netData, opts);
      if (!fromNetwork && mob && (attacker === this.player || !attacker) && this.player.leech > 0) {
        const dealt = Math.max(0, before - mob.hp);
        if (dealt > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + dealt * this.player.leech);
      }
    },

    damagePlayer(dmg, sourceName, srcLevel) {
      if (this.cutsceneActive) return;
      const p = this.player;
      if (this.isInTownSafeZone && this.isInTownSafeZone(p.pos)) return;
      this._lastCombatTime = performance.now();
      const L = srcLevel || p.level;
      const diff = L - p.level;
      // out-levelled heroes get punished hard: +45% at 3 levels, +85% at 5, ×2.6 at 8
      let d = dmg * (1 - this.mitigation(L)) * (diff > 0 ? 1 + diff * 0.12 + diff * diff * 0.01 : Math.max(0.6, 1 + diff * 0.04));
      if (p.buffTimer > 0) d *= 0.6;
      d = Math.max(1, Math.round(d));
      p.hp = Math.max(0, p.hp - d);
      this.triggerEntityHitFlash(p);
      this.audio.playHit(false, true);
      this.screenShake = Math.max(this.screenShake, d > p.maxHp * 0.2 ? 0.45 : 0.25);
      this.spawnFloatingText(p.pos, `-${d}`, '#ff3b5c', d > p.maxHp * 0.2 ? 22 : 17);
      if (p.hp <= 0) {
        if (this.aiAllies.length > 0 || this.remotePeers.size > 0) {
          p.hp = Math.round(p.maxHp * 0.65);
          this.spawnVFXFlipbook('eldenring', p.pos, 4.5, 0.6, 0x2ee68a);
          this.spawnFloatingText(p.pos, 'CO-OP ALLY REVIVED YOU!', '#2ee68a', 20);
          this.audio.playVoice(`hero_${p.classId}_revived`, 2);
          this.addChatMessage('Co-Op Revive', `✨ An ally channeled Soul Revival to bring ${p.name} back into battle!`, 'sys-synergy');
        } else {
          this.respawnAtGraveyard(sourceName);
        }
      }
    },

    respawnAtGraveyard(killer) {
      const p = this.player;
      let best = (this.waypoints || [])[0], bd = Infinity;
      (this.waypoints || []).forEach((wp) => {
        if (!wp.isTown && !this.mmoState.waypoints.has(wp.id)) return;
        const x = wp.isTown ? 0 : wp.x, z = wp.isTown ? 0 : wp.z;
        const d = Math.hypot(x - p.pos.x, z - p.pos.z);
        if (d < bd) { bd = d; best = wp; }
      });
      p.hp = p.maxHp;
      p.mp = p.maxMp;
      this.warpToZone(best ? best.id : 'town');
      this.showLootToast(`💀 You were slain${killer ? ' by ' + killer : ''}. Revived at ${best ? best.name : 'Ashenvale'}.`);
      this.addChatMessage('Death', `💀 ${p.name} fell${killer ? ' to ' + killer : ''} and revived at ${best ? best.name : 'the Bastion'}.`, 'sys-boss');
    },

    // Out-of-combat regeneration (MMO style)
    updateRegen(dt) {
      const p = this.player;
      if (!this.isInWorld || p.hp <= 0) return;
      const ooc = performance.now() - (this._lastCombatTime || 0) > 5000;
      if (ooc && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.035 * dt);
      if (p.mp < p.maxMp) p.mp = Math.min(p.maxMp, p.mp + p.maxMp * (ooc ? 0.08 : 0.03) * dt);
    },

    // =========================================================================
    // XP & KILL REWARDS
    // =========================================================================
    onMobDied(mob) {
      mob.diedAt = performance.now();
      if (mob.campId !== undefined && !mob.isAdd && this.campState) {
        const st = this.campState.get(mob.campId);
        if (st && st.slots[mob.slot] && st.slots[mob.slot].gen === mob.gen) {
          st.slots[mob.slot].alive = false;
          st.slots[mob.slot].diedAt = Date.now();
        }
      }
    },

    grantKillRewards(mob, fromNetwork) {
      this.onMobDied(mob);
      const p = this.player;
      const d = Math.hypot(p.pos.x - mob.pos.x, p.pos.z - mob.pos.z);
      if (d > (mob.isBoss ? 110 : 75)) return;
      const L = mob.level || 1;
      const diff = L - p.level;
      let f = diff >= 0 ? Math.min(1.5, 1 + diff * 0.1) : (diff >= -2 ? 1 : (diff >= -5 ? 0.55 : 0.1));
      const mult = mob.isWorldBoss ? 60 : (mob.isBoss ? 25 : (mob.isElite ? 4 : 1));
      const xp = Math.max(1, Math.round(M.mobXp(L) * mult * f));
      this.gainXP(xp, true);
      p.shards += mob.isWorldBoss ? 25 : (mob.isBoss ? 10 : (mob.isElite ? 3 : (Math.random() < 0.15 ? 1 : 0)));
      p.synergy = Math.min(100, p.synergy + 14);
      this.questOnKill(mob);
      if (diff <= -6 && !this._grayWarned) {
        this._grayWarned = true;
        this.addChatMessage('Hint', '⚪ Grey-level monsters give almost no XP. Move on to a zone matching your level!', 'sys-synergy');
      }
    },

    gainXP(amount, showText) {
      const p = this.player;
      if (p.level >= W.levelCap) return;
      p.xp += amount;
      if (showText) this.spawnFloatingText(p.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), `+${amount} XP`, '#b48cff', 14);
      let leveled = false;
      while (p.level < W.levelCap && p.xp >= M.xpToNext(p.level)) {
        p.xp -= M.xpToNext(p.level);
        p.level++;
        leveled = true;
      }
      if (p.level >= W.levelCap) p.xp = 0;
      if (leveled) {
        this.recalcPlayerStats(true);
        this.audio.playLootChime();
        this.spawnVFXFlipbook('eldenring', p.pos, 4.5, 0.7, 0xf3c86b);
        this.spawnFloatingText(p.pos, `LEVEL UP! Lv.${p.level}`, '#ffe599', 24);
        this.audio.playVoice(`hero_${p.classId}_levelup`, 1);
        this.addChatMessage('Level Up', `🎉 ${p.name} reached level ${p.level}! (Max HP ${p.maxHp})`, 'sys-loot');
        this.aiAllies.forEach((a) => { a.maxHp = M.heroHp(480, p.level); a.hp = a.maxHp; });
        (this.monsters || []).forEach(m => { if (m.nameplateSprite) m.nameplateSprite.userData.lastKey = ''; });
        this.saveHeroToSupabase();
        this.updateStoryTrackerUI();
      }
    },

    // =========================================================================
    // ITEMS
    // =========================================================================
    rollRarity(bonus = 0) {
      const pool = M.RARITIES.filter(r => r.weight > 0);
      const weights = pool.map((r, i) => r.weight * (i >= 2 ? (1 + bonus) : 1));
      let tot = weights.reduce((a, b) => a + b, 0), roll = Math.random() * tot;
      for (let i = 0; i < pool.length; i++) { roll -= weights[i]; if (roll <= 0) return pool[i].id; }
      return 'common';
    },

    generateItem({ ilvl, rarity, slot, cls, minRarity }) {
      ilvl = Math.max(1, Math.min(W.levelCap + 2, ilvl));
      rarity = rarity || this.rollRarity();
      if (minRarity && RAR[rarity].idx < RAR[minRarity].idx) rarity = minRarity;
      const R = RAR[rarity];
      cls = cls || (Math.random() < 0.75 ? this.player.classId : pick(Object.keys(HERO_CLASSES)));
      if (!slot) {
        const r = Math.random();
        slot = r < 0.22 ? 'weapon' : (r < 0.32 ? 'offhand' : pick(['head', 'chest', 'hands', 'legs', 'feet', 'neck', 'ring']));
        if (slot === 'offhand' && cls === 'arcanist' && Math.random() < 0.5) slot = 'neck';
      }
      const it = { uid: uid(), slot, rarity, ilvl, req: Math.max(1, ilvl - 1), affixes: {}, cls };
      if (slot === 'weapon' || slot === 'offhand') {
        const bases = M.WEAPON_BASES.filter(b => b.slot === slot && b.cls.includes(cls));
        const b = bases.length ? pick(bases) : M.WEAPON_BASES.find(x => x.slot === slot);
        it.base = b.id; it.model = b.model; it.baseName = pick(b.names); it.clsList = b.cls;
        if (b.dmg) { it.dmg = Math.round(M.weaponDmg(ilvl) * b.dmg * R.mult); it.crit = b.crit || 0.1; }
        if (b.armor) it.armor = Math.round(M.armorBudget(ilvl) * 0.16 * b.armor * R.mult);
        it.icon = slot === 'offhand' ? (b.armor ? '🛡️' : (b.id === 'tome' ? '📕' : '🗡️')) : ({ bow: '🏹', darkbow: '🏹', scythe: '🌙', spear: '🔱', axe: '🪓', maul: '🔨' }[b.id] || '⚔️');
      } else {
        const base = M.ARMOR_BASES.find(a => a.slot === slot);
        const type = (slot === 'neck' || slot === 'ring') ? 'any' : (M.CLASS_ARMOR[cls] || 'leather');
        it.armorType = type;
        it.baseName = base.names[type] || base.names.any;
        it.clsList = type === 'any' ? Object.keys(HERO_CLASSES) : Object.keys(M.CLASS_ARMOR).filter(c => M.CLASS_ARMOR[c] === type);
        if (base.armor) it.armor = Math.round(M.armorBudget(ilvl) * (base.armor / 5.7) * M.ARMOR_TYPE_MULT[type] * R.mult);
        it.icon = SLOT[slot].icon;
      }
      let nAff = R.affixes + ((slot === 'neck' || slot === 'ring') ? 1 : 0);
      const pool = M.AFFIXES.slice();
      while (nAff-- > 0 && pool.length) {
        const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        let v = a.roll(ilvl);
        if (a.id === 'vit') v = Math.round(v * R.mult);
        else v = Math.max(1, Math.round(v * (0.8 + R.idx * 0.12)));
        it.affixes[a.id] = v;
      }
      const pre = pick(M.PREFIXES[rarity]);
      it.name = `${pre} ${it.baseName}${R.idx >= 2 ? ' ' + pick(M.SUFFIXES) : ''}`;
      it.value = Math.round((6 + ilvl * 3) * (1 + R.idx * R.idx * 0.8));
      return it;
    },

    itemScore(it) {
      if (!it) return 0;
      const a = it.affixes || {};
      return (it.dmg || 0) * 1.0 + (it.armor || 0) * 0.7 + (a.vit || 0) * 0.22 + (a.power || 0) * 9 + (a.crit || 0) * 8 + (a.critdmg || 0) * 2.2 +
        (a.haste || 0) * 7 + (a.leech || 0) * 11 + (a.speed || 0) * 4 + (a.armorpct || 0) * 3 + (it.temper || 0) * (it.dmg || 0) * 0.06;
    },

    canEquip(it) {
      if (!it) return false;
      if (this.player.level < it.req) return false;
      return !it.clsList || it.clsList.includes(this.player.classId);
    },

    isUpgrade(it) {
      if (!this.canEquip(it)) return false;
      return this.itemScore(it) > this.itemScore(this.mmoState.equip[it.slot]) * 1.001;
    },

    itemTooltipHtml(it, compare = true) {
      if (!it) return '';
      const R = RAR[it.rarity];
      const lines = [];
      lines.push(`<div style="font-family:'Cinzel',serif;font-weight:700;color:${R.color};font-size:14px;">${esc(it.icon || '')} ${esc(it.name)}${it.temper ? ` +${it.temper}` : ''}</div>`);
      lines.push(`<div style="font-size:11px;color:var(--text-muted);">${R.name} ${SLOT[it.slot].name}${it.armorType && it.armorType !== 'any' ? ' • ' + it.armorType : ''} • Item Level ${it.ilvl}</div>`);
      if (it.dmg) lines.push(`<div>⚔️ <b>${Math.round(it.dmg * (1 + (it.temper || 0) * 0.06))}</b> Damage • ${Math.round((it.crit || 0) * 100)}% Crit</div>`);
      if (it.armor) lines.push(`<div>🛡️ <b>${it.armor}</b> Armor</div>`);
      Object.entries(it.affixes || {}).forEach(([k, v]) => {
        const a = M.AFFIXES.find(x => x.id === k);
        if (a) lines.push(`<div style="color:#2ee68a;">${esc(a.label(v))}</div>`);
      });
      const reqOk = this.player.level >= it.req;
      lines.push(`<div style="font-size:11px;color:${reqOk ? 'var(--text-muted)' : '#ff6a6a'};">Requires Level ${it.req}</div>`);
      if (it.clsList && !it.clsList.includes(this.player.classId)) {
        lines.push(`<div style="font-size:11px;color:#ff6a6a;">Usable by: ${it.clsList.map(c => HERO_CLASSES[c].title).join(', ')}</div>`);
      }
      lines.push(`<div style="font-size:11px;color:#ffd56b;">Sells for ${it.value} 🪙</div>`);
      if (compare) {
        const cur = this.mmoState.equip[it.slot];
        if (cur && cur.uid !== it.uid) {
          const delta = Math.round(this.itemScore(it) - this.itemScore(cur));
          lines.push(`<div style="margin-top:4px;font-size:11px;color:${delta >= 0 ? '#2ee68a' : '#ff6a6a'};">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} item power vs equipped ${esc(cur.name)}</div>`);
        }
      }
      return lines.join('');
    },

    equipItem(uidStr) {
      const st = this.mmoState;
      const idx = st.bag.findIndex(i => i.uid === uidStr);
      if (idx < 0) return;
      const it = st.bag[idx];
      if (!this.canEquip(it)) { this.showLootToast('❌ You cannot equip that yet.'); return; }
      const prev = st.equip[it.slot];
      st.bag.splice(idx, 1);
      if (prev) st.bag.push(prev);
      st.equip[it.slot] = it;
      this.applyEquipmentVisuals();
      this.recalcPlayerStats(false);
      this.audio.playLootChime();
      this.renderInventoryModal();
      this.broadcastPlayerState(true);
      this.saveMMOState();
    },

    unequipItem(slot) {
      const st = this.mmoState;
      const it = st.equip[slot];
      if (!it || slot === 'weapon') return;
      if (st.bag.length >= M.BAG_SIZE) { this.showLootToast('🎒 Bag is full!'); return; }
      delete st.equip[slot];
      st.bag.push(it);
      this.applyEquipmentVisuals();
      this.recalcPlayerStats(false);
      this.renderInventoryModal();
      this.saveMMOState();
    },

    sellItem(uidStr) {
      const st = this.mmoState;
      const idx = st.bag.findIndex(i => i.uid === uidStr);
      if (idx < 0) return;
      const it = st.bag[idx];
      st.bag.splice(idx, 1);
      this.player.gold += it.value;
      if (RAR[it.rarity].idx >= 2) this.player.shards += RAR[it.rarity].idx - 1;
      this.audio.playSample('ui_select', 1.2, 0.3);
      this.renderInventoryModal();
      this.saveMMOState();
    },

    sellJunk() {
      const st = this.mmoState;
      let gold = 0, n = 0;
      st.bag = st.bag.filter((it) => {
        const junk = it.rarity === 'common' || (it.clsList && !it.clsList.includes(this.player.classId) && RAR[it.rarity].idx < 2);
        if (junk && !this.isUpgrade(it)) { gold += it.value; n++; return false; }
        return true;
      });
      this.player.gold += gold;
      if (n) this.showLootToast(`🪙 Sold ${n} junk items for ${gold} gold`);
      this.renderInventoryModal();
      this.saveMMOState();
    },

    applyEquipmentVisuals() {
      const eq = this.mmoState ? this.mmoState.equip : {};
      const p = this.player;
      if (eq.weapon) p.weaponId = eq.weapon.model;
      p.offhandId = eq.offhand ? (eq.offhand.model || '') : '';
      if (p.unlockedWeapons) { if (p.weaponId) p.unlockedWeapons.add(p.weaponId); if (p.offhandId) p.unlockedWeapons.add(p.offhandId); }
      if (p.meshRoot && this.attachWeaponsToEntity) this.attachWeaponsToEntity(p);
    },

    pickupItem(it) {
      const st = this.mmoState;
      if (st.bag.length >= M.BAG_SIZE) {
        const now = performance.now();
        if (now - (this._bagFullToast || 0) > 4000) {
          this._bagFullToast = now;
          this.showLootToast('🎒 Bag full! Sell items in your inventory [I].');
        }
        return false;
      }
      st.bag.push(it);
      const R = RAR[it.rarity];
      const up = this.isUpgrade(it);
      this.spawnFloatingText(this.player.pos, `${it.name}${up ? ' ▲' : ''}`, R.color, R.idx >= 3 ? 20 : 16);
      this.showLootToast(`${it.icon || '🎁'} Looted [${it.name}] — ${R.name} ${SLOT[it.slot].name} (iLvl ${it.ilvl})${up ? ' ▲ UPGRADE' : ''}`);
      if (R.idx >= 3) {
        this.addChatMessage(this.player.name, `🌟 Looted ${R.name.toUpperCase()} [${it.name}]!`, 'sys-loot');
        this.audio.playSpell('ult');
      }
      if (document.getElementById('inventory-modal')?.classList.contains('active')) this.renderInventoryModal();
      this.saveMMOState();
      return true;
    },

    // Personal loot: each hero rolls their own drops
    rollMobLoot(mob) {
      const p = this.player;
      if (Math.hypot(p.pos.x - mob.pos.x, p.pos.z - mob.pos.z) > (mob.isBoss ? 110 : 75)) return;
      const L = mob.level || 1;
      const drops = [];
      if (mob.isWorldBoss) {
        drops.push(this.generateItem({ ilvl: L + 1, minRarity: 'epic', rarity: Math.random() < 0.08 ? 'mythic' : (Math.random() < 0.3 ? 'legendary' : 'epic') }));
        drops.push(this.generateItem({ ilvl: L + 1, minRarity: 'rare' }));
        drops.push(this.generateItem({ ilvl: L + 1, minRarity: 'rare', cls: p.classId }));
      } else if (mob.isBoss) {
        drops.push(this.generateItem({ ilvl: L, cls: p.classId, minRarity: 'rare', rarity: Math.random() < 0.06 ? 'legendary' : (Math.random() < 0.35 ? 'epic' : 'rare') }));
        drops.push(this.generateItem({ ilvl: L, minRarity: 'uncommon' }));
        if (Math.random() < 0.5) drops.push(this.generateItem({ ilvl: L, minRarity: 'uncommon' }));
      } else if (mob.isElite) {
        drops.push(this.generateItem({ ilvl: L, minRarity: 'uncommon', rarity: this.rollRarity(1.2) }));
        if (Math.random() < 0.35) drops.push(this.generateItem({ ilvl: L }));
      } else if (!mob.isAdd && Math.random() < 0.2) {
        drops.push(this.generateItem({ ilvl: L }));
      }
      const gold = Math.round((2 + L * 1.6) * (mob.isWorldBoss ? 30 : (mob.isBoss ? 12 : (mob.isElite ? 4 : 1))) * (0.7 + Math.random() * 0.6));
      const trophy = Math.random() < 0.05 ? TROPHY_CATALOG[0] : null;
      drops.forEach((it, i) => this.spawnItemDrop(mob.pos, it, i === 0 ? gold : 0, null));
      if (!drops.length) this.spawnItemDrop(mob.pos, null, gold, trophy);
      else if (trophy) this.spawnItemDrop(mob.pos, null, 0, trophy);
    },

    spawnItemDrop(pos, item, gold, trophy) {
      const group = new THREE.Group();
      group.position.copy(pos);
      group.position.y = 0;
      group.position.x += (Math.random() - 0.5) * 2.2;
      group.position.z += (Math.random() - 0.5) * 2.2;
      const color = item ? new THREE.Color(RAR[item.rarity].color).getHex() : (trophy ? 0x2ee68a : 0xf3c86b);
      const tall = item ? 1.6 + RAR[item.rarity].idx * 0.7 : 1.2;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.26, tall, 10),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      beam.position.y = tall / 2;
      group.add(beam);
      const orb = new THREE.Mesh(
        item ? new THREE.OctahedronGeometry(0.3, 0) : new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 })
      );
      orb.position.y = 0.45;
      group.add(orb);
      this.scene.add(group);
      this.lootDrops.push({ group, pos: group.position, isWeapon: false, weapon: null, trophy, item, gold, shards: 0 });
    },

    // Legacy chests/destructibles still call this
    spawnLootDrop(pos, guaranteedWeapon = false, isBossDrop = false) {
      const L = Math.max(1, this.player.level);
      const item = (guaranteedWeapon || Math.random() < 0.4) ? this.generateItem({ ilvl: L, minRarity: guaranteedWeapon ? 'uncommon' : null }) : null;
      this.spawnItemDrop(pos, item, Math.round(5 + L * 2), null);
    },

    // =========================================================================
    // QUESTS
    // =========================================================================
    questState(id) {
      return this.mmoState.quests[id] || null;
    },

    questStatus(q) {
      const s = this.questState(q.id);
      if (s) return s.s; // active | ready | done
      // unlock rules: tier N needs 2 completed quests of tier N-1 in the zone (tier 4: both tier-3 bounties etc.)
      const zoneQ = this.questDefs.filter(x => x.zone === q.zone);
      if (q.tier === 0) return 'available';
      const prev = zoneQ.filter(x => x.tier === q.tier - 1);
      const doneN = prev.filter(x => (this.questState(x.id) || {}).s === 'done').length;
      const need = q.tier >= 4 ? prev.length : Math.min(2, prev.length);
      return doneN >= need ? 'available' : 'locked';
    },

    acceptMMOQuest(id) {
      const q = this.questById[id];
      if (!q || this.questStatus(q) !== 'available') return;
      if (this.player.level < q.minLevel) { this.showLootToast(`Requires level ${q.minLevel}`); return; }
      this.mmoState.quests[id] = { s: 'active', n: 0 };
      if (q.kind === 'travel') this.mmoState.quests[id].s = 'active';
      this.audio.playSample('ui_open', 1.1, 0.35);
      this.addChatMessage('Quest', `📜 Accepted: ${q.title}`, 'sys-loot');
      this.saveMMOState();
      this.renderQuestGiver();
      this.updateStoryTrackerUI();
    },

    abandonMMOQuest(id) {
      delete this.mmoState.quests[id];
      this.saveMMOState();
      this.renderQuestLog();
      this.updateStoryTrackerUI();
    },

    advanceQuest(q, by = 1, note) {
      const s = this.questState(q.id);
      if (!s || s.s !== 'active') return;
      s.n = Math.min(q.count, (s.n || 0) + by);
      if (note) this.showLootToast(note);
      if (s.n >= q.count) {
        s.s = 'ready';
        this.audio.playLootChime();
        this.showLootToast(`✅ Quest complete: ${q.title} — return to ${q.kind === 'travel' ? M.QUEST_GIVERS[q.target].name : q.giver}`);
        this.addChatMessage('Quest', `✅ ${q.title} complete! Turn in to ${q.kind === 'travel' ? M.QUEST_GIVERS[q.target].name : q.giver}.`, 'sys-loot');
      }
      this.saveMMOState();
      this.updateStoryTrackerUI();
    },

    questOnKill(mob) {
      this.questDefs.forEach((q) => {
        const s = this.questState(q.id);
        if (!s || s.s !== 'active') return;
        if (q.kind === 'kill' && mob.typeKey === q.target && !mob.isElite && !mob.isBoss) this.advanceQuest(q, 1);
        else if (q.kind === 'elite' && mob.isElite && mob.name.includes(q.target)) this.advanceQuest(q, 1);
        else if (q.kind === 'boss' && mob.isBoss && mob.name === q.target) this.advanceQuest(q, 1);
        else if (q.kind === 'collect' && mob.typeKey === q.target && Math.random() < q.chance) {
          this.advanceQuest(q, 1, `📦 ${q.item} (${Math.min(q.count, s.n + 1)}/${q.count})`);
        }
      });
    },

    questOnExplore() { /* zone discovery hook (travel quests complete when you talk to the next giver) */ },

    updateQuestExplore() {
      if (!this.questDefs || !this.worldGen) return;
      const p = this.player.pos;
      this.questDefs.forEach((q) => {
        if (q.kind !== 'explore') return;
        const s = this.questState(q.id);
        if (!s || s.s !== 'active') return;
        const z = this.worldGen.zoneById[q.zone];
        const site = z.sites[q.site];
        if (site && Math.hypot(p.x - site[0], p.z - site[1]) < 18) this.advanceQuest(q, 1, `🧭 Discovered ${M.EXPLORE_SITES[q.zone][q.site]}`);
      });
      // travel quests: arriving at the next outpost readies them
      this.questDefs.forEach((q) => {
        if (q.kind !== 'travel') return;
        const s = this.questState(q.id);
        if (!s || s.s !== 'active') return;
        const z = this.worldGen.zoneById[q.target];
        if (Math.hypot(p.x - z.outpost[0], p.z - z.outpost[1]) < 30) this.advanceQuest(q, 1);
      });
    },

    turnInMMOQuest(id) {
      const q = this.questById[id];
      const s = this.questState(id);
      if (!q || !s || s.s !== 'ready') return;
      s.s = 'done';
      this.player.gold += q.gold;
      this.gainXP(q.xp, false);
      let rewardTxt = `+${q.xp} XP, +${q.gold} 🪙`;
      if (q.reward) {
        const it = this.generateItem({ ilvl: q.level + 1, cls: this.player.classId, minRarity: q.reward, rarity: q.reward });
        if (this.pickupItem(it)) rewardTxt += `, [${it.name}]`;
      }
      if (q.kind === 'boss') this.player.shards += 5;
      this.audio.playSpell('ult');
      this.spawnVFXFlipbook('eldenring', this.player.pos, 4.2, 0.7, 0xffd56b);
      this.addChatMessage('Quest', `🏅 Turned in ${q.title}: ${rewardTxt}`, 'sys-loot');
      this.saveMMOState();
      this.renderQuestGiver();
      this.updateStoryTrackerUI();
    },

    openQuestGiver(zoneId) {
      this._qgZone = zoneId;
      // arriving at a new giver completes travel quests that point here
      this.questDefs.forEach((q) => {
        if (q.kind === 'travel' && q.target === zoneId) {
          const s = this.questState(q.id);
          if (s && s.s === 'active') { s.n = 1; s.s = 'ready'; }
        }
      });
      this.openModal('mmo-quest-modal');
      this._questView = 'giver';
      this.renderQuestGiver();
      if (zoneId === 'citadel') this.audio.playVoice('lyra_greet', 2);
    },

    openQuestLog() {
      this._questView = 'log';
      this.openModal('mmo-quest-modal');
      this.renderQuestLog();
    },

    questProgressText(q) {
      const s = this.questState(q.id);
      const n = s ? s.n : 0;
      if (q.kind === 'kill') return `${q.targetName}s slain: ${n}/${q.count}`;
      if (q.kind === 'collect') return `${q.item}: ${n}/${q.count}`;
      if (q.kind === 'elite') return `${q.target} slain: ${n}/1`;
      if (q.kind === 'boss') return `${q.target} defeated: ${n}/1`;
      if (q.kind === 'explore') return `${M.EXPLORE_SITES[q.zone][q.site]} discovered: ${n}/1`;
      if (q.kind === 'travel') return `Report to ${M.QUEST_GIVERS[q.target].name}`;
      return '';
    },

    questCard(q, mode) {
      const st = this.questStatus(q);
      const z = this.worldGen.zoneById[q.zone];
      const lvCol = this.conColor(q.level);
      let btn = '';
      if (mode === 'giver') {
        if (st === 'available') btn = this.player.level >= q.minLevel
          ? `<button class="cta-btn" style="padding:6px 14px;font-size:12px;" onclick="window.game.acceptMMOQuest('${q.id}')">Accept</button>`
          : `<span class="room-badge">Requires Lv ${q.minLevel}</span>`;
        else if (st === 'ready' && (q.kind !== 'travel' || q.target === this._qgZone)) btn = `<button class="cta-btn" style="padding:6px 14px;font-size:12px;background:linear-gradient(90deg,#2ee68a,#1fa866);" onclick="window.game.turnInMMOQuest('${q.id}')">Complete Quest</button>`;
        else if (st === 'active') btn = `<span class="room-badge">In progress</span>`;
      } else {
        btn = `<button class="mini-btn" onclick="window.game.abandonMMOQuest('${q.id}')">Abandon</button>`;
      }
      const reward = `${q.xp} XP • ${q.gold} 🪙${q.reward ? ` • ${RAR[q.reward].name} gear` : ''}`;
      return `<div class="mmo-quest-card ${st}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
          <div>
            <div style="font-family:'Cinzel',serif;font-weight:700;color:var(--gold-bright);">${st === 'ready' ? '❓' : (st === 'active' ? '📜' : '❗')} ${esc(q.title)}
              <span style="font-size:11px;color:${lvCol};font-family:Inter,sans-serif;">[${q.level}]</span></div>
            <div style="font-size:11px;color:var(--text-muted);">${z.icon} ${z.name} • ${esc(q.giver)}</div>
          </div>${btn}
        </div>
        <div style="font-size:12px;color:var(--text-main);margin:6px 0 4px;line-height:1.45;">${esc(q.text)}</div>
        <div style="display:flex;justify-content:space-between;font-size:11px;flex-wrap:wrap;gap:6px;">
          <span style="color:#9ef0ff;">${st === 'active' || st === 'ready' ? esc(this.questProgressText(q)) : ''}</span>
          <span style="color:#ffd56b;">Reward: ${reward}</span>
        </div>
      </div>`;
    },

    renderQuestGiver() {
      if (this._questView !== 'giver') { this.renderQuestLog(); return; }
      const zid = this._qgZone;
      const z = this.worldGen.zoneById[zid];
      const head = document.getElementById('mmo-quest-title');
      const sub = document.getElementById('mmo-quest-sub');
      const body = document.getElementById('mmo-quest-body');
      if (!body) return;
      head.textContent = `📜 ${M.QUEST_GIVERS[zid].name.toUpperCase()}`;
      sub.textContent = `${z.icon} ${z.name} Quest Board • Levels ${z.lv[0]}–${z.lv[1]}`;
      const qs = this.questDefs.filter(q => q.zone === zid);
      const incoming = this.questDefs.filter(q => q.kind === 'travel' && q.target === zid && (this.questState(q.id) || {}).s === 'ready');
      const ready = incoming.concat(qs.filter(q => this.questStatus(q) === 'ready' && q.kind !== 'travel'));
      const avail = qs.filter(q => this.questStatus(q) === 'available');
      const active = qs.filter(q => this.questStatus(q) === 'active' || (q.kind === 'travel' && this.questStatus(q) === 'ready'));
      const done = qs.filter(q => this.questStatus(q) === 'done').length;
      const locked = qs.filter(q => this.questStatus(q) === 'locked').length;
      const sec = (t, list) => list.length ? `<div class="mmo-quest-sec">${t}</div>${list.map(q => this.questCard(q, 'giver')).join('')}` : '';
      body.innerHTML = `
        <div class="npc-dialogue-box">"${zid === 'meadows'
          ? `Welcome to Ashenvale, ${esc(this.player.name)}. The Rift has spilled monsters into every corner of the realm. Start here in the Meadows — grow strong, then follow the road.`
          : `You made it to ${esc(z.name)}, ${esc(this.player.name)}. Monsters here are level ${z.lv[0]} to ${z.lv[1]}. ${this.player.level < z.lv[0] ? 'You look a little green for these parts — be careful.' : 'Let\'s put that blade to use.'}`}"</div>
        ${sec('Ready to turn in', ready)}
        ${sec('Available', avail)}
        ${sec('In progress', active)}
        <div style="font-size:11px;color:var(--text-muted);margin-top:10px;">Completed ${done}/${qs.length} quests here${locked ? ` • ${locked} more unlock as you finish these` : ''}.</div>`;
    },

    renderQuestLog() {
      const head = document.getElementById('mmo-quest-title');
      const sub = document.getElementById('mmo-quest-sub');
      const body = document.getElementById('mmo-quest-body');
      if (!body) return;
      head.textContent = '📜 QUEST LOG';
      const active = this.questDefs.filter(q => ['active', 'ready'].includes(this.questStatus(q)));
      const doneN = this.questDefs.filter(q => this.questStatus(q) === 'done').length;
      sub.textContent = `${active.length} active • ${doneN}/${this.questDefs.length} completed across the realm`;
      body.innerHTML = active.length
        ? active.map(q => this.questCard(q, 'log')).join('')
        : `<div class="npc-dialogue-box">No active quests. Visit a quest giver (! on your map) — start with Warden Elric in Ashenvale Bastion.</div>`;
    },

    // HUD tracker (replaces the old story tracker body)
    updateStoryTrackerUI() {
      const body = document.getElementById('story-tracker-body');
      if (!body || !this.questDefs || !this.mmoState) return;
      const title = document.querySelector('#story-tracker .story-tracker-title');
      if (title) title.textContent = '📜 QUESTS [O]';
      const active = this.questDefs.filter(q => ['active', 'ready'].includes(this.questStatus(q))).slice(0, 5);
      const p = this.player;
      const need = M.xpToNext(p.level);
      let html = '';
      if (!active.length) {
        const z = this.worldGen ? this.currentMMOZone() : null;
        html = `<div class="story-obj-line">No active quests. Talk to a quest giver (❗ on the minimap)${z ? ` — ${M.QUEST_GIVERS[z.id].name} in ${z.name}` : ''}.</div>`;
      } else {
        html = active.map((q) => {
          const st = this.questStatus(q);
          return `<div class="mmo-trk ${st}"><div class="mmo-trk-t">${st === 'ready' ? '✅' : '•'} ${esc(q.title)} <span style="color:${this.conColor(q.level)}">[${q.level}]</span></div>
            <div class="mmo-trk-p">${st === 'ready' ? `Return to ${esc(q.kind === 'travel' ? M.QUEST_GIVERS[q.target].name : q.giver)}` : esc(this.questProgressText(q))}</div></div>`;
        }).join('');
      }
      body.innerHTML = html;
      const xpEl = document.getElementById('mmo-xp-text');
      if (xpEl) xpEl.textContent = p.level >= W.levelCap ? `Level ${p.level} (MAX)` : `Level ${p.level} • ${Math.floor(p.xp)} / ${need} XP`;
    },

    drawQuestMarkers(dot, full) {
      if (!this.questDefs || !this.worldGen) return;
      const wg = this.worldGen;
      // givers
      wg.zones.forEach((z) => {
        const pos = z.id === 'meadows' ? [4.5, 15.5] : [z.outpost[0] - 3, z.outpost[1] + 2];
        const qs = this.questDefs.filter(q => q.zone === z.id);
        const hasReady = qs.some(q => this.questStatus(q) === 'ready' && q.kind !== 'travel') ||
          this.questDefs.some(q => q.kind === 'travel' && q.target === z.id && this.questStatus(q) === 'ready');
        const hasAvail = qs.some(q => this.questStatus(q) === 'available' && this.player.level >= q.minLevel);
        if (hasReady) dot(pos[0], pos[1], '#ffd56b', 5, '?');
        else if (hasAvail) dot(pos[0], pos[1], '#ffe599', 5, '!');
      });
      // objectives
      this.questDefs.forEach((q) => {
        const s = this.questState(q.id);
        if (!s || s.s !== 'active') return;
        const z = wg.zoneById[q.zone];
        let t = null;
        if (q.kind === 'explore') t = z.sites[q.site];
        else if (q.kind === 'boss') { const bp = this.bossMapPos ? this.bossMapPos(z, false) : null; t = bp ? [bp.x, bp.z] : z.bossPos; }
        else if (q.kind === 'travel') { const nz = wg.zoneById[q.target]; t = nz.outpost; }
        else if (q.kind === 'elite') {
          const c = wg.camps.find(c => c.elite && c.elite.name === q.target);
          if (c) t = [c.x, c.z];
        } else if (q.kind === 'kill' || q.kind === 'collect') {
          q._near = q._near || {};
          const p = this.player.pos;
          const key = Math.floor(p.x / 60) + ',' + Math.floor(p.z / 60);
          if (q._near.key !== key) {
            let best = null, bd = Infinity;
            wg.camps.forEach((c) => {
              if (!c.mob || c.mob.type !== q.target || c.elite) return;
              const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
              if (d < bd) { bd = d; best = c; }
            });
            q._near = { key, pos: best ? [best.x, best.z] : null };
          }
          t = q._near.pos;
        }
        if (t) dot(t[0], t[1], '#9ef0ff', 5, '✦');
      });
    },

    // =========================================================================
    // INVENTORY UI
    // =========================================================================
    renderInventoryModal() {
      const summaryEl = document.getElementById('inv-hero-summary');
      const slotsEl = document.getElementById('inv-equipped-slots');
      const gridEl = document.getElementById('inv-backpack-grid');
      const countEl = document.getElementById('inv-bag-count');
      if (!summaryEl || !slotsEl || !gridEl || !this.mmoState) return;
      const p = this.player;
      const cls = HERO_CLASSES[p.classId] || HERO_CLASSES.vanguard;
      const w = this.getWeaponStats();
      const st = this.mmoState;
      const need = M.xpToNext(p.level);
      summaryEl.innerHTML = `
        <div class="inv-stat-row"><span>Class</span><b style="color:var(--gold-bright);">${cls.title}</b></div>
        <div class="inv-stat-row"><span>Level</span><b>Lv. ${p.level} <span style="color:var(--text-muted);font-weight:400;">(${Math.floor(p.xp)}/${need} XP)</span></b></div>
        <div class="inv-stat-row"><span>Attack Power</span><b style="color:#ff9966;">${w.dmg}</b></div>
        <div class="inv-stat-row"><span>Critical Strike</span><b style="color:var(--gold);">${Math.round(w.crit * 100)}% <span style="color:var(--text-muted);font-weight:400;">(×${(p.critMult || 1.65).toFixed(2)})</span></b></div>
        <div class="inv-stat-row"><span>Max HP</span><b style="color:var(--emerald);">${Math.round(p.hp)} / ${p.maxHp}</b></div>
        <div class="inv-stat-row"><span>Armor</span><b style="color:#9ef0ff;">${p.armor || 0} <span style="color:var(--text-muted);font-weight:400;">(${Math.round(this.mitigation(p.level) * 100)}% vs Lv ${p.level})</span></b></div>
        <div class="inv-stat-row"><span>Haste • Lifesteal • Speed</span><b>${Math.round((p.haste || 0) * 100)}% • ${Math.round((p.leech || 0) * 100)}% • +${Math.round((p.moveBonus || 0) * 100)}%</b></div>
        <div class="inv-stat-row"><span>Currency</span><span><b style="color:#ffd56b;">${p.gold} 🪙</b> • <b style="color:var(--cyan);">${p.shards} 💠</b> • 🧪 ${p.potions}</span></div>`;
      slotsEl.innerHTML = `<div class="mmo-equip-grid">${M.EQUIP_SLOTS.map((s) => {
        const it = st.equip[s.id];
        if (!it) return `<div class="mmo-eq empty"><div class="mmo-eq-slot">${s.icon} ${s.name}</div><div class="mmo-eq-name" style="color:var(--text-muted);">Empty</div></div>`;
        const R = RAR[it.rarity];
        return `<div class="mmo-eq" style="border-color:${R.color}66;" onmouseenter="window.game.showItemTip('${it.uid}', event)" onmouseleave="window.game.hideItemTip()" ${s.id !== 'weapon' ? `ondblclick="window.game.unequipItem('${s.id}')"` : ''}>
          <div class="mmo-eq-slot">${s.icon} ${s.name}</div>
          <div class="mmo-eq-name" style="color:${R.color};">${esc(it.name)}${it.temper ? ` +${it.temper}` : ''}</div>
          <div class="mmo-eq-stat">${it.dmg ? `${Math.round(it.dmg * (1 + (it.temper || 0) * 0.06))} dmg` : (it.armor ? `${it.armor} armor` : Object.keys(it.affixes).length + ' bonuses')} • iLvl ${it.ilvl}</div>
        </div>`;
      }).join('')}</div>
      <div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;">Hover to inspect • Double-click to unequip • Click a bag item to equip</div>`;
      const cat = INV_CATS.find(c => c.id === this.invCategory()) || INV_CATS[0];
      const sortBy = this.invSort();
      const order = new Map(st.bag.map((it, i) => [it, i]));
      const sorters = {
        rarity: (a, b) => (RAR[b.rarity].idx - RAR[a.rarity].idx) || (b.ilvl - a.ilvl),
        ilvl: (a, b) => (b.ilvl - a.ilvl) || (RAR[b.rarity].idx - RAR[a.rarity].idx),
        slot: (a, b) => (SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]) || (RAR[b.rarity].idx - RAR[a.rarity].idx) || (b.ilvl - a.ilvl),
        newest: (a, b) => order.get(b) - order.get(a)
      };
      const bag = st.bag.filter(it => cat.test(it, this)).sort(sorters[sortBy] || sorters.rarity);
      if (countEl) countEl.textContent = `${st.bag.length}/${M.BAG_SIZE}`;
      const tabs = INV_CATS.map((c) => {
        const n = st.bag.filter(it => c.test(it, this)).length;
        return `<button class="inv-cat${c.id === cat.id ? ' on' : ''}" onclick="window.game.setInvCategory('${c.id}')">${c.icon} ${c.name} <b>${n}</b></button>`;
      }).join('');
      const full = st.bag.length / M.BAG_SIZE;
      gridEl.innerHTML = `<div class="inv-cat-bar">${tabs}</div>
        <div class="inv-tools">
          <div class="inv-fill" title="${st.bag.length} of ${M.BAG_SIZE} slots used"><i style="width:${Math.round(full * 100)}%;background:${full >= 0.9 ? '#ff5c5c' : (full >= 0.7 ? '#ffb347' : 'var(--emerald)')}"></i></div>
          <label class="inv-sort">Sort <select onchange="window.game.setInvSort(this.value)">
            ${[['rarity', 'Rarity'], ['ilvl', 'Item level'], ['slot', 'Slot'], ['newest', 'Newest']].map(([v, l]) => `<option value="${v}"${v === sortBy ? ' selected' : ''}>${l}</option>`).join('')}
          </select></label>
          <button class="mini-btn" onclick="window.game.sellJunk()">🪙 Sell junk</button>
          <button class="mini-btn" onclick="window.game.openModal('forge-modal')">⚒️ Relic Forge</button>
        </div>` + (bag.length ? bag.map((it) => {
        const R = RAR[it.rarity];
        const up = this.isUpgrade(it);
        const usable = this.canEquip(it);
        return `<div class="mmo-bag-item ${usable ? '' : 'unusable'}" style="border-color:${R.color}88;" onmouseenter="window.game.showItemTip('${it.uid}', event)" onmouseleave="window.game.hideItemTip()">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
            <span style="font-size:20px;">${it.icon || '🎁'}</span>
            ${up ? '<span class="mmo-up">▲</span>' : ''}
          </div>
          <div style="font-size:11.5px;font-weight:700;color:${R.color};line-height:1.2;min-height:28px;">${esc(it.name)}</div>
          <div style="font-size:10px;color:var(--text-muted);">${SLOT[it.slot].name} • iLvl ${it.ilvl}</div>
          <div style="display:flex;gap:4px;margin-top:4px;">
            <button class="mini-btn" style="flex:1;padding:3px;font-size:10.5px;" ${usable ? '' : 'disabled'} onclick="window.game.equipItem('${it.uid}')">Equip</button>
            <button class="mini-btn" style="padding:3px 6px;font-size:10.5px;" onclick="window.game.sellItem('${it.uid}')">${it.value}🪙</button>
          </div>
        </div>`;
      }).join('') : `<div style="color:var(--text-muted);font-size:12px;grid-column:1/-1;">${st.bag.length ? `No ${cat.name.toLowerCase()} in your bag.` : 'Your bag is empty. Monsters, elites, bosses and quests drop gear.'}</div>`);
    },

    invCategory() {
      if (!this._invCat) { try { this._invCat = localStorage.getItem('cr_inv_cat') || 'all'; } catch (e) { this._invCat = 'all'; } }
      return this._invCat;
    },
    setInvCategory(id) {
      this._invCat = id;
      try { localStorage.setItem('cr_inv_cat', id); } catch (e) { /* storage blocked */ }
      this.hideItemTip();
      this.renderInventoryModal();
    },
    invSort() {
      if (!this._invSort) { try { this._invSort = localStorage.getItem('cr_inv_sort') || 'rarity'; } catch (e) { this._invSort = 'rarity'; } }
      return this._invSort;
    },
    setInvSort(v) {
      this._invSort = v;
      try { localStorage.setItem('cr_inv_sort', v); } catch (e) { /* storage blocked */ }
      this.renderInventoryModal();
    },

    showItemTip(uidStr, ev) {
      const st = this.mmoState;
      const it = st.bag.find(i => i.uid === uidStr) || Object.values(st.equip).find(i => i && i.uid === uidStr);
      const tip = document.getElementById('mmo-item-tip');
      if (!it || !tip) return;
      tip.innerHTML = this.itemTooltipHtml(it, true);
      tip.style.display = 'block';
      const x = Math.min(window.innerWidth - 300, (ev.clientX || 0) + 16);
      const y = Math.min(window.innerHeight - 220, (ev.clientY || 0) + 10);
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    },

    hideItemTip() {
      const tip = document.getElementById('mmo-item-tip');
      if (tip) tip.style.display = 'none';
    },

    // =========================================================================
    // FORGE (Kaelen): temper the weapon, forge new gear
    // =========================================================================
    renderForgeModal() {
      const grid = document.getElementById('forge-weapons-grid');
      if (!grid || !this.mmoState) return;
      const p = this.player;
      const L = p.level;
      const w = this.mmoState.equip.weapon;
      const t = (w && w.temper) || 0;
      const tg = Math.round((25 + L * 8) * (t + 1)), ts = 2 + t;
      const opts = [
        { id: 'weapon', label: 'Forge a Weapon', icon: '⚔️' },
        { id: 'armor', label: 'Forge Armor', icon: '🥋' },
        { id: 'jewel', label: 'Forge Jewelry', icon: '💍' }
      ];
      const costR = { g: 30 + L * 12, s: 3 + Math.floor(L / 5) };
      const costE = { g: (30 + L * 12) * 3, s: (3 + Math.floor(L / 5)) * 3 };
      grid.innerHTML = `
        <div class="weapon-card" style="grid-column:1/-1;">
          <div style="font-family:'Cinzel',serif;font-weight:700;color:var(--gold-bright);">🔥 Temper ${w ? esc(w.name) : 'weapon'} (+${t} → +${t + 1})</div>
          <div style="font-size:12px;color:var(--text-muted);">Each temper adds +6% weapon damage (max +10).</div>
          <button class="cta-btn" style="margin-top:6px;padding:8px 14px;font-size:12px;" ${t >= 10 ? 'disabled' : ''} onclick="window.game.temperWeapon()">Temper — ${tg} 🪙, ${ts} 💠</button>
        </div>
        ${opts.map(o => `<div class="weapon-card">
          <div style="font-family:'Cinzel',serif;font-weight:700;color:var(--gold-bright);">${o.icon} ${o.label}</div>
          <div style="font-size:12px;color:var(--text-muted);">Item level ${L + 1}, made for your class.</div>
          <div style="display:flex;flex-direction:column;gap:5px;margin-top:auto;padding-top:6px;">
            <button class="mini-btn" onclick="window.game.forgeGear('${o.id}','rare')">Rare — ${costR.g} 🪙, ${costR.s} 💠</button>
            <button class="mini-btn" style="border-color:#b266ff;" onclick="window.game.forgeGear('${o.id}','epic')">Epic — ${costE.g} 🪙, ${costE.s} 💠</button>
          </div>
        </div>`).join('')}`;
    },

    temperWeapon() {
      const w = this.mmoState.equip.weapon;
      if (!w) return;
      const t = w.temper || 0;
      if (t >= 10) return;
      const L = this.player.level;
      const tg = Math.round((25 + L * 8) * (t + 1)), ts = 2 + t;
      if (this.player.gold < tg || this.player.shards < ts) { this.showLootToast(`Need ${tg} 🪙 and ${ts} 💠`); this.audio.playVoice('kaelen_broke', 2); return; }
      this.player.gold -= tg; this.player.shards -= ts;
      w.temper = t + 1;
      this.recalcPlayerStats(false);
      this.audio.playLootChime();
      this.audio.playVoice('kaelen_temper', 2);
      this.spawnVFXFlipbook('bighit', this.player.pos, 3.5, 0.45, 0xf3c86b);
      this.renderForgeModal();
      this.saveMMOState();
    },

    upgradeEquippedWeapon() { this.temperWeapon(); },

    forgeGear(kind, rarity) {
      const L = this.player.level;
      const g = (30 + L * 12) * (rarity === 'epic' ? 3 : 1), s = (3 + Math.floor(L / 5)) * (rarity === 'epic' ? 3 : 1);
      if (this.player.gold < g || this.player.shards < s) { this.showLootToast(`Need ${g} 🪙 and ${s} 💠`); this.audio.playVoice('kaelen_broke', 2); return; }
      if (this.mmoState.bag.length >= M.BAG_SIZE) { this.showLootToast('🎒 Bag is full!'); return; }
      this.player.gold -= g; this.player.shards -= s;
      const slot = kind === 'weapon' ? (Math.random() < 0.8 ? 'weapon' : 'offhand') : (kind === 'jewel' ? pick(['neck', 'ring']) : pick(['head', 'chest', 'hands', 'legs', 'feet']));
      const it = this.generateItem({ ilvl: L + 1, rarity, slot, cls: this.player.classId });
      this.pickupItem(it);
      this.audio.playVoice('kaelen_forge', 2);
      this.renderForgeModal();
    },

    // =========================================================================
    // CLASS SWITCH = separate character progress per class
    // =========================================================================
    selectClassCard(classId, silent = false) {
      if (this.mmoState && this._mmoClass && this._mmoClass !== classId) this.saveMMOState();
      orig.selectClassCard.call(this, classId, silent);
      if (this.mmoState && this._mmoClass !== classId) this.loadMMOState(classId);
      else if (this.mmoState) { this.applyEquipmentVisuals(); this.recalcPlayerStats(!this.isInWorld); }
    },

    async saveHeroToSupabase() {
      this.saveMMOState();
      try { await orig.saveHeroToSupabase.call(this); } catch (e) {}
    },

    async loadOrInitHeroFromSupabase() {
      try { await orig.loadOrInitHeroFromSupabase.call(this); } catch (e) {}
      // Local MMO character data is authoritative for progression
      if (this.questDefs) this.loadMMOState(this.player.classId);
    },

    openModal(id) {
      orig.openModal.call(this, id);
      this.hideItemTip && this.hideItemTip();
    },

    closeModals(fromOpenModal = false) {
      this.hideItemTip && this.hideItemTip();
      return orig.closeModals.call(this, fromOpenModal);
    },

    isAtWaypoint() {
      const p = this.player.pos;
      if (Math.hypot(p.x, p.z) < 14) return true;
      return (this.waypoints || []).some(wp => !wp.isTown && Math.hypot(p.x - wp.x, p.z - wp.z) < 6);
    },

    // =========================================================================
    // HUD
    // =========================================================================
    updateHUDAndMinimap() {
      const p = this.player;
      const ui = this.ui;
      const w = this.mmoState && this.mmoState.equip.weapon;
      this.setUI('heroName', ui.heroName, p.name);
      this.setUI('heroLvl', ui.heroLvl, `Lv. ${p.level}`);
      this.setUI('weaponLabel', ui.weaponLabel, w ? `${w.name}${w.temper ? ' +' + w.temper : ''}` : 'Unarmed');
      this.setUI('gold', ui.gold, String(p.gold));
      this.setUI('shards', ui.shards, String(p.shards));
      this.setUI('hpFill', ui.hpFill, `${Math.round((p.hp / p.maxHp) * 100)}%`, true);
      this.setUI('hpText', ui.hpText, `${Math.round(p.hp)} / ${p.maxHp}`);
      this.setUI('mpFill', ui.mpFill, `${Math.round((p.mp / p.maxMp) * 100)}%`, true);
      this.setUI('mpText', ui.mpText, `${Math.round(p.mp)} / ${p.maxMp}`);
      const synPct = Math.floor(p.synergy);
      this.setUI('xpFill', ui.xpFill, `${synPct}%`, true);
      this.setUI('synergyText', ui.synergyText, synPct >= 100 ? 'CONVERGENCE READY [R]!' : `SYNERGY ${synPct}%`);
      const ultReady = synPct >= 100;
      if (this.uiState.ultReady !== ultReady) {
        this.uiState.ultReady = ultReady;
        if (ui.slot5) ui.slot5.classList.toggle('ult-ready', ultReady);
      }
      [1, 2, 3, 4, 5, 'potion'].forEach((s) => {
        const cd = p.cooldowns[s];
        const el = ui.cd[s];
        if (!el) return;
        const label = cd > 0.05 ? cd.toFixed(1) : '';
        if (this.uiState['cd_' + s] !== label) {
          this.uiState['cd_' + s] = label;
          el.style.height = label ? '100%' : '0%';
          el.textContent = label;
        }
      });
      if (this.remotePeers.size > 0) this.updatePartyRosterUI();
      // XP bar
      const need = M.xpToNext(p.level);
      const pct = p.level >= W.levelCap ? 100 : Math.min(100, (p.xp / need) * 100);
      const xf = document.getElementById('mmo-xp-fill');
      if (xf && this.uiState.mmoXp !== Math.round(pct * 10)) {
        this.uiState.mmoXp = Math.round(pct * 10);
        xf.style.width = pct + '%';
        const xt = document.getElementById('mmo-xp-text');
        if (xt) xt.textContent = p.level >= W.levelCap ? `Level ${p.level} (MAX)` : `Level ${p.level} • ${Math.floor(p.xp)} / ${need} XP (${pct.toFixed(1)}%)`;
      }
      if (this.minimapCtx && this.worldMapCanvas) this.drawMinimap(this.minimapCtx);
      const z = this.worldGen ? this.currentMMOZone() : null;
      this.setUI('minimapCoords', ui.minimapCoords, `${this.timeLabel ? this.timeLabel + ' • ' : ''}${z ? (this._mmoZoneKey === 'town' ? 'BASTION' : z.name.toUpperCase()) : ''} • (${Math.round(p.pos.x)}, ${Math.round(p.pos.z)})`);
      this.updateRegen(0.1);
      this.updateQuestExplore();
    },

    injectRpgHud() {
      const css = document.createElement('style');
      css.textContent = `
        #mmo-xpbar { position: fixed; left: 50%; bottom: 4px; transform: translateX(-50%); width: min(720px, 92vw); height: 12px; background: rgba(6,8,16,0.8); border: 1px solid rgba(180,140,255,0.55); border-radius: 6px; z-index: 18; overflow: hidden; pointer-events: none; }
        #mmo-xp-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #7a4bd8, #b48cff); box-shadow: 0 0 10px rgba(180,140,255,0.6); transition: width 0.3s; }
        #mmo-xp-text { position: absolute; inset: 0; font-size: 9.5px; font-weight: 700; color: #fff; text-align: center; line-height: 12px; text-shadow: 0 1px 2px #000; letter-spacing: 0.5px; }
        #hud-bottom { bottom: 22px !important; }
        .mmo-trk { margin: 3px 0 5px; }
        .mmo-trk-t { font-size: 11.5px; font-weight: 700; color: var(--gold-bright); }
        .mmo-trk.ready .mmo-trk-t { color: #2ee68a; }
        .mmo-trk-p { font-size: 10.5px; color: #9ef0ff; padding-left: 10px; }
        .mmo-quest-card { border: 1px solid rgba(243,200,107,0.35); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; background: rgba(0,0,0,0.28); }
        .mmo-quest-card.ready { border-color: rgba(46,230,138,0.7); box-shadow: 0 0 14px rgba(46,230,138,0.15); }
        .mmo-quest-sec { font-family: 'Cinzel', serif; font-weight: 900; font-size: 12px; color: var(--cyan); margin: 12px 0 6px; letter-spacing: 1px; text-transform: uppercase; }
        .mmo-equip-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        .mmo-eq { border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 6px 7px; background: rgba(0,0,0,0.3); cursor: default; min-height: 56px; }
        .mmo-eq.empty { opacity: 0.55; }
        .mmo-eq-slot { font-size: 9.5px; color: var(--cyan); font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
        .mmo-eq-name { font-size: 11.5px; font-weight: 700; line-height: 1.2; margin-top: 2px; }
        .mmo-eq-stat { font-size: 10px; color: var(--text-muted); margin-top: 2px; }
        #inv-backpack-grid { grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)) !important; }
        .mmo-bag-item { border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; padding: 6px 7px; background: rgba(0,0,0,0.32); display: flex; flex-direction: column; }
        .mmo-bag-item.unusable { opacity: 0.55; }
        .inv-cat-bar { grid-column: 1/-1; display: flex; gap: 5px; flex-wrap: wrap; }
        .inv-cat { font: 600 11.5px Inter, sans-serif; color: #c9d4ea; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; padding: 5px 10px; cursor: pointer; }
        .inv-cat b { margin-left: 3px; color: var(--text-muted); font-weight: 700; }
        .inv-cat:hover { border-color: rgba(255,213,107,0.55); }
        .inv-cat.on { background: rgba(255,213,107,0.16); border-color: var(--gold-bright); color: var(--gold-bright); }
        .inv-cat.on b { color: var(--gold-bright); }
        .inv-tools { grid-column: 1/-1; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 2px 0 6px; }
        .inv-fill { flex: 1 1 90px; min-width: 70px; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; }
        .inv-fill i { display: block; height: 100%; }
        .inv-sort { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
        .inv-sort select { background: rgba(0,0,0,0.45); color: #e8eefc; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; font-size: 11px; padding: 3px 4px; }
        .mmo-bag-item button:disabled { opacity: 0.4; cursor: not-allowed; }
        .mmo-up { color: #2ee68a; font-weight: 900; font-size: 14px; text-shadow: 0 0 6px rgba(46,230,138,0.7); }
        #mmo-item-tip { position: fixed; z-index: 90; display: none; max-width: 290px; background: rgba(8,10,20,0.97); border: 1px solid rgba(243,200,107,0.6); border-radius: 10px; padding: 10px 12px; font-size: 12px; color: var(--text-main); line-height: 1.5; pointer-events: none; box-shadow: 0 10px 30px rgba(0,0,0,0.7); }
        @media (max-width: 640px) { .mmo-equip-grid { grid-template-columns: repeat(2, 1fr); } }
      `;
      document.head.appendChild(css);
      const xp = document.createElement('div');
      xp.id = 'mmo-xpbar';
      xp.innerHTML = '<div id="mmo-xp-fill"></div><div id="mmo-xp-text"></div>';
      document.body.appendChild(xp);
      const tip = document.createElement('div');
      tip.id = 'mmo-item-tip';
      document.body.appendChild(tip);
      const row = document.getElementById('story-chapters-row');
      if (row) row.style.display = 'none';
      const modal = document.createElement('div');
      modal.id = 'mmo-quest-modal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-box" style="max-width: 780px;">
          <div class="modal-hero-banner" style="background: radial-gradient(circle at 80% 30%, rgba(243, 200, 107, 0.15), transparent 55%), linear-gradient(90deg, rgba(16, 18, 34, 0.96), rgba(16, 20, 34, 0.94));">
            <div>
              <div class="modal-title" id="mmo-quest-title">📜 QUEST LOG</div>
              <div id="mmo-quest-sub" style="font-size: 12px; color: var(--cyan);"></div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="mini-btn" onclick="window.game.openQuestLog()">📜 Log [O]</button>
              <button class="mini-btn" onclick="window.game.closeModals(true)">✕ Close (ESC)</button>
            </div>
          </div>
          <div id="mmo-quest-body"></div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModals(true); });
      // Forge modal copy
      const forgeBtns = document.querySelector('#forge-modal .modal-box > div:nth-child(2)');
      if (forgeBtns) forgeBtns.style.display = 'none';
      const ft = document.querySelector('#forge-modal .modal-title');
      if (ft) ft.textContent = '⚒️ KAELEN\'S RELIC FORGE';
      const fs = document.querySelector('#forge-modal .modal-hero-banner div div:nth-child(2)');
      if (fs) fs.textContent = 'Temper your weapon or forge new gear scaled to your level with Gold & Chrono-Shards';
    }
  });
})();
