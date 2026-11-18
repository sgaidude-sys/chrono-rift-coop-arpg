/* =============================================================================
 * Chrono-Rift — Talent Constellations
 *
 *  Data:   3 branches (Parry Mastery / Elemental Arts / Agility & Stamina), each a
 *          small constellation of passive stat nodes and 2 KEYSTONES that change
 *          how combat plays. 1 talent point per hero level (cap 50; 43 ranks total).
 *  State:  unlocked node ranks live per class in `player.talents` ({ nodeId: rank }),
 *          persisted to localStorage, mirrored into mmoState, best-effort synced to
 *          Supabase (`arpg_heroes.talents` jsonb, see README) and announced to co-op
 *          peers in the player-state payload.
 *  Hooks:  stat mods feed `this._talentMods` (read by mmo_combat.js via `tv(key)`):
 *          parry window, block cost/damage, posture, riposte, i-frames, roll cost,
 *          stamina regen; this file adds crit rate/damage, skill/basic damage,
 *          cooldowns, move speed and the keystone behaviours.
 *  UI:     T (or the ✦ Talents button) opens a full-screen glass constellation.
 * ============================================================================= */
(function () {
  'use strict';
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  // ---------------------------------------------------------------------------
  // Tree configuration (positions are % inside each branch field; y=100 bottom)
  // ---------------------------------------------------------------------------
  const BRANCHES = [
    {
      id: 'guard', name: 'Parry Mastery', icon: '🛡️', color: '#ffd56b', glow: 'rgba(255,213,107,0.55)',
      blurb: 'Hold the line. Turn every blow back on its owner.',
      nodes: [
        { id: 'g_steady', name: 'Steady Guard', icon: '🛡️', max: 3, x: 50, y: 88, mods: { blockCost: 0.12 }, desc: (r) => `Blocking costs <b>${pct(0.12 * r)}</b> less stamina.` },
        { id: 'g_timing', name: 'Keen Timing', icon: '⏱️', max: 2, x: 24, y: 66, req: ['g_steady'], mods: { parryWindow: 0.03 }, desc: (r) => `Perfect Parry window <b>+${(30 * r)} ms</b> (base 180 ms).` },
        { id: 'g_posture', name: 'Iron Posture', icon: '🔨', max: 3, x: 76, y: 66, req: ['g_steady'], mods: { postureDmg: 0.15 }, desc: (r) => `Hits, blocks and parries deal <b>${pct(0.15 * r)}</b> more posture damage.` },
        { id: 'g_bulwark', name: 'Bulwark', icon: '🏰', max: 2, x: 18, y: 42, req: ['g_timing'], mods: { blockDmg: 0.2 }, desc: (r) => `Damage taken while blocking <b>−${pct(0.2 * r)}</b>.` },
        { id: 'g_exec', name: 'Executioner', icon: '⚔️', max: 2, x: 82, y: 42, req: ['g_posture'], mods: { riposte: 0.25 }, desc: (r) => `Critical Riposte damage <b>+${pct(0.25 * r)}</b>.` },
        { id: 'gk_wave', name: 'Retribution Wave', icon: '🌟', max: 1, ks: true, x: 32, y: 14, req: ['g_bulwark'], need: 5, desc: () => `<b>Keystone.</b> A Perfect Parry unleashes an <b>elemental shockwave</b> (5.5 m, 150% weapon damage, heavy).` },
        { id: 'gk_counter', name: 'Counter Stance', icon: '♻️', max: 1, ks: true, x: 68, y: 14, req: ['g_exec'], need: 5, desc: () => `<b>Keystone.</b> A Perfect Parry <b>resets your Heavy Skill</b> and empowers it: +30% damage for 3 s.` }
      ]
    },
    {
      id: 'arts', name: 'Elemental Arts', icon: '🔮', color: '#7fe3ff', glow: 'rgba(127,227,255,0.55)',
      blurb: 'Bend the elements. Every skill a storm.',
      nodes: [
        { id: 'e_focus', name: 'Sharpened Focus', icon: '🎯', max: 3, x: 50, y: 88, mods: { critRate: 0.03 }, desc: (r) => `Crit rate <b>+${pct(0.03 * r)}</b>.` },
        { id: 'e_edge', name: 'Ruinous Edge', icon: '🗡️', max: 3, x: 24, y: 66, req: ['e_focus'], mods: { critDmg: 0.15 }, desc: (r) => `Crit damage <b>+${pct(0.15 * r)}</b> (base 165%).` },
        { id: 'e_attune', name: 'Attunement', icon: '✨', max: 3, x: 76, y: 66, req: ['e_focus'], mods: { skillDmg: 0.08 }, desc: (r) => `Skill damage <b>+${pct(0.08 * r)}</b>.` },
        { id: 'e_mastery', name: 'Weapon Mastery', icon: '🗡', max: 2, x: 18, y: 42, req: ['e_edge'], mods: { basicDmg: 0.07 }, desc: (r) => `Basic attack damage <b>+${pct(0.07 * r)}</b>.` },
        { id: 'e_swift', name: 'Swift Incantation', icon: '⌛', max: 3, x: 82, y: 42, req: ['e_attune'], mods: { cdr: 0.05 }, desc: (r) => `Skill cooldowns <b>−${pct(0.05 * r)}</b>.` },
        { id: 'ek_chain', name: 'Chain Arcana', icon: '⚡', max: 1, ks: true, x: 32, y: 14, req: ['e_mastery'], need: 5, desc: () => `<b>Keystone.</b> Critical skill hits <b>arc lightning</b> to 2 nearby enemies for 35% of the damage.` },
        { id: 'ek_reso', name: 'Elemental Resonance', icon: '🌀', max: 1, ks: true, x: 68, y: 14, req: ['e_swift'], need: 5, desc: () => `<b>Keystone.</b> Every <b>3rd skill</b> cast releases an elemental nova (6 m, 120% weapon damage).` }
      ]
    },
    {
      id: 'agile', name: 'Agility & Stamina', icon: '💨', color: '#6dffb0', glow: 'rgba(109,255,176,0.5)',
      blurb: 'Never be where the blade lands.',
      nodes: [
        { id: 'a_wind', name: 'Second Wind', icon: '🌬️', max: 3, x: 50, y: 88, mods: { stamRegen: 0.15 }, desc: (r) => `Stamina regeneration <b>+${pct(0.15 * r)}</b>.` },
        { id: 'a_light', name: 'Light Feet', icon: '🍃', max: 2, x: 24, y: 66, req: ['a_wind'], mods: { rollCost: 0.15 }, desc: (r) => `Dodge rolls cost <b>${pct(0.15 * r)}</b> less stamina.` },
        { id: 'a_fleet', name: 'Fleet', icon: '👟', max: 2, x: 76, y: 66, req: ['a_wind'], mods: { moveSpeed: 0.04 }, desc: (r) => `Movement speed <b>+${pct(0.04 * r)}</b>.` },
        { id: 'a_ghost', name: 'Ghost Step', icon: '👻', max: 2, x: 18, y: 42, req: ['a_light'], mods: { iframes: 0.04 }, desc: (r) => `Dodge invulnerability <b>+${40 * r} ms</b> (base 250 ms).` },
        { id: 'a_moment', name: 'Momentum', icon: '🏃', max: 2, x: 82, y: 42, req: ['a_fleet'], mods: { momentum: 0.12 }, desc: (r) => `For 1.5 s after a dodge, your attacks deal <b>+${pct(0.12 * r)}</b> damage.` },
        { id: 'ak_mirage', name: 'Mirage Step', icon: '👥', max: 1, ks: true, x: 32, y: 14, req: ['a_ghost'], need: 5, desc: () => `<b>Keystone.</b> Dodging leaves a <b>mirage clone</b> that detonates after 0.6 s (3.5 m, 120% weapon damage).` },
        { id: 'ak_evade', name: 'Perfect Evasion', icon: '🌙', max: 1, ks: true, x: 68, y: 14, req: ['a_moment'], need: 5, desc: () => `<b>Keystone.</b> Dodging <i>through</i> an attack refunds <b>20 stamina</b>; your next hit within 3 s is a guaranteed crit with +30% damage.` }
      ]
    }
  ];
  const NODE = {};
  BRANCHES.forEach(b => b.nodes.forEach(n => { n.branch = b.id; NODE[n.id] = n; }));
  function pct(v) { return Math.round(v * 100) + '%'; }

  // ---------------------------------------------------------------------------
  const CSS = `
  #talent-modal.modal-backdrop { background: rgba(3, 6, 14, 0.55); backdrop-filter: blur(3px); padding: 0; }
  #talent-modal .tal-wrap { position: relative; width: 100vw; height: 100vh; overflow: hidden; display: flex; flex-direction: column;
    background: radial-gradient(ellipse at 50% 30%, rgba(30, 40, 82, 0.72), rgba(6, 9, 20, 0.9) 70%);
    color: #e9eefc; font-family: Inter, system-ui, sans-serif; animation: talIn .28s ease-out; }
  @keyframes talIn { from { opacity: 0; transform: scale(1.02); } to { opacity: 1; transform: none; } }
  #talent-modal .tal-stars { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: .9; }
  #talent-modal .tal-head { position: relative; z-index: 2; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    padding: 16px 26px; border-bottom: 1px solid rgba(232, 196, 118, 0.22);
    background: linear-gradient(180deg, rgba(14, 18, 36, 0.85), rgba(14, 18, 36, 0.35)); backdrop-filter: blur(10px); }
  #talent-modal .tal-title { font-family: 'Cinzel', Georgia, serif; font-size: 24px; letter-spacing: 3px; color: #f6e2b0; text-shadow: 0 0 18px rgba(255, 213, 107, .45); }
  #talent-modal .tal-title small { font-family: Inter, sans-serif; font-size: 12px; letter-spacing: 2px; color: #9fb3d9; margin-left: 10px; text-transform: uppercase; }
  #talent-modal .tal-points { margin-left: auto; display: flex; align-items: baseline; gap: 8px; padding: 8px 16px; border-radius: 999px;
    background: rgba(255, 213, 107, 0.08); border: 1px solid rgba(255, 213, 107, 0.35); box-shadow: inset 0 0 18px rgba(255, 213, 107, .08); }
  #talent-modal .tal-points b { font-size: 22px; color: #ffd56b; text-shadow: 0 0 12px rgba(255, 213, 107, .8); }
  #talent-modal .tal-points span { font-size: 12px; color: #9fb3d9; }
  #talent-modal .tal-points.pulse b { animation: talPulse .6s ease-out; }
  @keyframes talPulse { 0% { transform: scale(1.6); } 100% { transform: scale(1); } }
  #talent-modal .tal-actions { display: flex; gap: 8px; }
  #talent-modal .tal-actions .mini-btn { white-space: nowrap; }
  #talent-modal .tal-branches { position: relative; z-index: 1; flex: 1; display: flex; gap: 18px; padding: 18px 22px 22px; min-height: 0; }
  #talent-modal .tal-branch { flex: 1; min-width: 0; display: flex; flex-direction: column; border-radius: 18px;
    background: linear-gradient(180deg, rgba(16, 22, 44, 0.55), rgba(8, 11, 24, 0.55)); border: 1px solid rgba(255, 255, 255, 0.07);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 18px 40px rgba(0,0,0,.35); backdrop-filter: blur(6px); }
  #talent-modal .tal-bhead { display: flex; align-items: center; gap: 12px; padding: 14px 16px 6px; }
  #talent-modal .tal-bicon { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-size: 20px;
    background: radial-gradient(circle, rgba(255,255,255,.12), rgba(0,0,0,.2)); border: 1px solid var(--bc); box-shadow: 0 0 16px var(--bg); }
  #talent-modal .tal-bhead h3 { margin: 0; font-family: 'Cinzel', Georgia, serif; font-size: 16px; letter-spacing: 1.5px; color: var(--bc); }
  #talent-modal .tal-bhead p { margin: 2px 0 0; font-size: 11.5px; color: #93a4c8; }
  #talent-modal .tal-bspent { margin-left: auto; font-size: 13px; color: var(--bc); background: rgba(0,0,0,.3); border-radius: 999px; padding: 3px 10px; border: 1px solid rgba(255,255,255,.08); }
  #talent-modal .tal-field { position: relative; flex: 1; margin: 6px 12px 12px; min-height: 280px; }
  #talent-modal .tal-lines { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  #talent-modal .tal-edge { stroke: rgba(150, 170, 220, 0.18); stroke-width: 2; vector-effect: non-scaling-stroke; fill: none; transition: stroke .3s; }
  #talent-modal .tal-edge.avail { stroke: rgba(120, 230, 255, 0.55); stroke-dasharray: 5 6; animation: talDash 1.2s linear infinite; }
  #talent-modal .tal-edge.lit { stroke: var(--bc); stroke-width: 2.6; filter: drop-shadow(0 0 4px var(--bc)) drop-shadow(0 0 10px var(--bc)); }
  #talent-modal .tal-edge.draw { stroke-dasharray: 400; stroke-dashoffset: 400; animation: talDraw .7s ease-out forwards; }
  @keyframes talDash { to { stroke-dashoffset: -22; } }
  @keyframes talDraw { to { stroke-dashoffset: 0; } }
  #talent-modal .tal-node { position: absolute; transform: translate(-50%, -50%); width: 54px; height: 54px; border-radius: 50%; padding: 0; cursor: pointer;
    display: grid; place-items: center; color: #fff; font-size: 22px; border: 2px solid rgba(150, 170, 220, 0.25);
    background: radial-gradient(circle at 50% 35%, rgba(60, 72, 110, 0.9), rgba(12, 16, 30, 0.95)); transition: transform .15s, box-shadow .3s, border-color .3s, filter .3s;
    filter: grayscale(.85) brightness(.6); outline: none; }
  #talent-modal .tal-node .tal-ico { pointer-events: none; }
  #talent-modal .tal-node .tal-rank { position: absolute; bottom: -9px; left: 50%; transform: translateX(-50%); font-size: 10.5px; font-weight: 700;
    padding: 1px 6px; border-radius: 999px; background: rgba(5, 8, 18, .92); border: 1px solid rgba(255,255,255,.15); color: #b8c4e4; white-space: nowrap; pointer-events: none; }
  #talent-modal .tal-node.ks { width: 68px; height: 68px; border-radius: 16px; font-size: 28px; }
  #talent-modal .tal-node.ks::before { content: ''; position: absolute; inset: -7px; border-radius: 20px; border: 1px dashed rgba(255,255,255,.18); transform: rotate(45deg); pointer-events: none; }
  #talent-modal .tal-node.avail { filter: none; border-color: rgba(120, 230, 255, 0.85); box-shadow: 0 0 0 4px rgba(120, 230, 255, 0.08), 0 0 18px rgba(120, 230, 255, 0.45); animation: talBreath 1.8s ease-in-out infinite; }
  @keyframes talBreath { 50% { box-shadow: 0 0 0 7px rgba(120, 230, 255, 0.05), 0 0 26px rgba(120, 230, 255, 0.7); } }
  #talent-modal .tal-node.owned { filter: none; border-color: var(--bc); background: radial-gradient(circle at 50% 35%, rgba(255, 238, 190, 0.35), rgba(30, 24, 10, 0.95));
    box-shadow: 0 0 14px var(--bg), 0 0 34px var(--bg), inset 0 0 14px rgba(255, 230, 160, 0.35); }
  #talent-modal .tal-node.owned .tal-rank { color: var(--bc); border-color: var(--bc); }
  #talent-modal .tal-node.owned.avail { animation: none; }
  #talent-modal .tal-node.maxed .tal-rank { background: var(--bc); color: #1a1406; }
  #talent-modal .tal-node:hover, #talent-modal .tal-node.sel { transform: translate(-50%, -50%) scale(1.1); }
  #talent-modal .tal-node.deny { animation: talShake .3s; }
  @keyframes talShake { 25% { margin-left: -4px; } 75% { margin-left: 4px; } }
  #talent-modal .tal-burst { position: absolute; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; }
  #talent-modal .tal-burst i { position: absolute; left: 0; top: 0; border-radius: 50%; transform: translate(-50%, -50%); }
  #talent-modal .tal-burst .ring { width: 54px; height: 54px; border: 3px solid var(--bc); box-shadow: 0 0 22px var(--bc); animation: talRing .8s ease-out forwards; }
  #talent-modal .tal-burst .ring.r2 { animation-delay: .1s; border-width: 2px; opacity: 0; }
  #talent-modal .tal-burst .flash { width: 90px; height: 90px; background: radial-gradient(circle, #fff 0%, var(--bc) 30%, transparent 70%); animation: talFlash .55s ease-out forwards; }
  #talent-modal .tal-burst .ray { width: 4px; height: 4px; background: #fff; box-shadow: 0 0 8px var(--bc), 0 0 14px var(--bc); animation: talRay .75s cubic-bezier(.15,.7,.3,1) forwards; }
  @keyframes talRing { 0% { width: 40px; height: 40px; opacity: 1; } 100% { width: 190px; height: 190px; opacity: 0; } }
  @keyframes talFlash { 0% { opacity: 1; transform: translate(-50%,-50%) scale(.4); } 100% { opacity: 0; transform: translate(-50%,-50%) scale(1.6); } }
  @keyframes talRay { 0% { opacity: 1; transform: translate(-50%,-50%) rotate(var(--a)) translateY(0); } 100% { opacity: 0; transform: translate(-50%,-50%) rotate(var(--a)) translateY(-86px) scale(.4); } }
  #talent-modal .tal-tip { position: absolute; z-index: 5; width: 270px; padding: 12px 14px; border-radius: 12px; pointer-events: none; opacity: 0; transition: opacity .12s;
    background: rgba(8, 11, 24, 0.94); border: 1px solid rgba(232, 196, 118, 0.4); box-shadow: 0 12px 30px rgba(0,0,0,.5), 0 0 24px rgba(255, 213, 107, 0.12); font-size: 12.5px; line-height: 1.45; }
  #talent-modal .tal-tip.show { opacity: 1; }
  #talent-modal .tal-tip h4 { margin: 0 0 2px; font-family: 'Cinzel', Georgia, serif; font-size: 15px; color: #ffd56b; }
  #talent-modal .tal-tip .tt-sub { font-size: 11px; color: #8fa0c4; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; }
  #talent-modal .tal-tip .tt-next { margin-top: 6px; color: #9ff0ff; }
  #talent-modal .tal-tip .tt-req { margin-top: 6px; color: #ff9a8a; font-size: 11.5px; }
  #talent-modal .tal-tip .tt-cta { margin-top: 8px; font-size: 11px; color: #ffd56b; letter-spacing: 1px; text-transform: uppercase; }
  #talent-modal .tal-tip b { color: #fff; }
  #btn-talents .tal-badge { display: inline-block; min-width: 16px; padding: 0 5px; margin-left: 4px; border-radius: 999px; background: #ffd56b; color: #1a1406; font-weight: 800; font-size: 11px; line-height: 16px; }
  #btn-talents.has-pts { box-shadow: 0 0 12px rgba(255, 213, 107, 0.55); border-color: #ffd56b; }
  @media (max-width: 900px) {
    #talent-modal .tal-head { padding: 10px 12px; gap: 8px; }
    #talent-modal .tal-title { font-size: 18px; }
    #talent-modal .tal-points { margin-left: 0; }
    #talent-modal .tal-branches { overflow-x: auto; scroll-snap-type: x mandatory; padding: 10px; gap: 10px; }
    #talent-modal .tal-branch { flex: 0 0 86vw; scroll-snap-align: center; }
    #talent-modal .tal-node { width: 48px; height: 48px; font-size: 19px; }
    #talent-modal .tal-node.ks { width: 58px; height: 58px; }
    #talent-modal .tal-tip { width: 230px; }
  }`;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, loadMMOState: GP.loadMMOState,
    applyDamageToMonster: GP.applyDamageToMonster, getWeaponStats: GP.getWeaponStats, useSkill: GP.useSkill,
    getMoveSpeedMult: GP.getMoveSpeedMult, perfectParry: GP.perfectParry, bossHit: GP.bossHit,
    buildPlayerStatePayload: GP.buildPlayerStatePayload, saveHeroToSupabase: GP.saveHeroToSupabase,
    loadOrInitHeroFromSupabase: GP.loadOrInitHeroFromSupabase
  };

  Object.assign(GP, {
    // =========================================================================
    // State
    // =========================================================================
    talentKey() { return `arpg_talents_v1_${this.heroSaveToken}`; },

    loadTalentStore() {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(this.talentKey()) || 'null'); } catch (e) { s = null; }
      this._talentStore = (s && typeof s === 'object') ? s : {};
    },

    saveTalentStore(remote) {
      try { localStorage.setItem(this.talentKey(), JSON.stringify(this._talentStore)); } catch (e) { /* storage blocked */ }
      if (this.mmoState) this.mmoState.talents = Object.assign({}, this.player.talents);
      if (remote) {
        clearTimeout(this._talentSyncT);
        this._talentSyncT = setTimeout(() => this.syncTalentsRemote(), 1500);
      }
    },

    bindClassTalents() {
      if (!this._talentStore) this.loadTalentStore();
      const cls = this.player.classId || 'vanguard';
      if (!this._talentStore[cls] || typeof this._talentStore[cls] !== 'object') this._talentStore[cls] = {};
      // drop unknown ids (renamed nodes) so they can't hold points
      Object.keys(this._talentStore[cls]).forEach((k) => { if (!NODE[k]) delete this._talentStore[cls][k]; });
      this.player.talents = this._talentStore[cls];
      this.recomputeTalents();
    },

    talentRank(id) { return (this.player.talents && this.player.talents[id]) || 0; },
    talentPointsTotal() { return Math.max(1, this.player.level || 1); },
    talentPointsSpent() { return Object.values(this.player.talents || {}).reduce((a, b) => a + b, 0); },
    branchSpent(bid) { return Object.keys(this.player.talents || {}).reduce((a, k) => a + (NODE[k] && NODE[k].branch === bid ? this.player.talents[k] : 0), 0); },

    recomputeTalents() {
      const mods = {}, set = new Set();
      Object.entries(this.player.talents || {}).forEach(([id, r]) => {
        const n = NODE[id];
        if (!n || !r) return;
        if (n.ks) set.add(id);
        Object.entries(n.mods || {}).forEach(([k, v]) => { mods[k] = (mods[k] || 0) + v * r; });
      });
      this._talentMods = mods;
      this._talentSet = set;
    },

    // why a node can't be bought right now (null = it can)
    talentBlocker(n) {
      const r = this.talentRank(n.id);
      if (r >= n.max) return 'Fully unlocked';
      if (this.talentPointsSpent() >= this.talentPointsTotal()) return 'No talent points left (earn 1 per level)';
      if (n.req && !n.req.some(id => this.talentRank(id) > 0)) return 'Requires ' + n.req.map(id => NODE[id].name).join(' or ');
      if (n.need && this.branchSpent(n.branch) < n.need) return `Requires ${n.need} points in this constellation (${this.branchSpent(n.branch)}/${n.need})`;
      return null;
    },

    unlockTalent(id) {
      const n = NODE[id];
      if (!n || this.talentBlocker(n)) return false;
      this.player.talents[id] = this.talentRank(id) + 1;
      this.recomputeTalents();
      this.saveTalentStore(true);
      if (this.audio) {
        this.audio.playSample && this.audio.playSample('chime', n.ks ? 0.85 : 1.2, n.ks ? 0.7 : 0.5);
        if (n.ks && this.audio.playLootChime) this.audio.playLootChime();
      }
      return true;
    },

    resetTalents() {
      Object.keys(this.player.talents).forEach(k => delete this.player.talents[k]);
      this.recomputeTalents();
      this.saveTalentStore(true);
    },

    // ---- backend (best effort: needs an `arpg_heroes.talents jsonb` column) ----
    async syncTalentsRemote() {
      if (!this.supabase || this._talentsNoColumn || !this.heroSaveToken) return;
      try {
        const { error } = await this.supabase.from('arpg_heroes').update({ talents: this._talentStore }).eq('player_token', this.heroSaveToken);
        if (error) {
          if (/column|talents/i.test(error.message || '')) {
            this._talentsNoColumn = true;
            console.info('[Talents] Supabase column arpg_heroes.talents missing; talents are saved locally. See README for the one-line migration.');
          }
        }
      } catch (e) { /* offline */ }
    },

    async saveHeroToSupabase() {
      const r = await orig.saveHeroToSupabase.apply(this, arguments);
      this.syncTalentsRemote();
      return r;
    },

    async loadOrInitHeroFromSupabase() {
      const r = await orig.loadOrInitHeroFromSupabase.apply(this, arguments);
      if (!this.supabase || this._talentsNoColumn) return r;
      try {
        const { data, error } = await this.supabase.from('arpg_heroes').select('talents').eq('player_token', this.heroSaveToken).maybeSingle();
        if (error) { if (/column|talents/i.test(error.message || '')) this._talentsNoColumn = true; return r; }
        const remote = data && data.talents;
        if (remote && typeof remote === 'object') {
          if (!this._talentStore) this.loadTalentStore();
          const sum = (o) => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
          Object.keys(remote).forEach((cls) => {           // per class: keep whichever save has more invested
            if (sum(remote[cls]) > sum(this._talentStore[cls])) this._talentStore[cls] = Object.assign({}, remote[cls]);
          });
          this.bindClassTalents();
          this.saveTalentStore(false);
          this.refreshTalentUI();
        }
      } catch (e) { /* offline */ }
      return r;
    },

    loadMMOState(classId) {
      const r = orig.loadMMOState.apply(this, arguments);
      if (this.player) { this.bindClassTalents(); this.refreshTalentUI(); }
      return r;
    },

    buildPlayerStatePayload() {
      const p = orig.buildPlayerStatePayload.apply(this, arguments);
      if (p && this._talentSet) p.talents = Array.from(this._talentSet);     // keystones (peers can show them)
      return p;
    },

    // =========================================================================
    // Combat hooks
    // =========================================================================
    getWeaponStats() {
      const r = orig.getWeaponStats.apply(this, arguments);
      if (r && this._talentMods) {
        r.crit = Math.min(0.9, (r.crit || 0) + (this._talentMods.critRate || 0));
        if (this._forceCrit !== undefined) r.crit = this._forceCrit;
      }
      return r;
    },

    getMoveSpeedMult() {
      const b = orig.getMoveSpeedMult ? orig.getMoveSpeedMult.apply(this, arguments) : 1;
      return b * (1 + this.tv('moveSpeed'));
    },

    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork) {
      const local = mob && !mob.dead && !fromNetwork && (!attacker || attacker === this.player) && this._talentMods;
      if (!local) return orig.applyDamageToMonster.apply(this, arguments);
      const now = this.cNow();
      let mult = 1;
      const skill = now < (this._skillWindowUntil || 0);
      mult *= 1 + (skill ? this.tv('skillDmg') : this.tv('basicDmg'));
      if (now < (this._momentumUntil || 0)) mult *= 1 + this.tv('momentum');
      if (now < (this._counterUntil || 0) && skill) mult *= 1.3;
      let forced = false;
      if (now < (this._evadeCritUntil || 0)) {
        forced = true; mult *= 1.3;
        if (!this._evadeConsumeAt) this._evadeConsumeAt = now + 0.15;   // whole swing / cone benefits
      }
      // pre-roll the crit so bonus crit damage can be applied exactly
      let crit;
      if (mob.huntersMarkTimer > 0) crit = undefined;                    // the mark forces its own crit
      else crit = !!isHeavy || forced || Math.random() < this.getWeaponStats().crit;
      if (crit) mult *= (1.65 + this.tv('critDmg')) / 1.65;
      const args = Array.prototype.slice.call(arguments);
      args[1] = baseDmg * mult;
      const hp0 = mob.hp;
      if (crit !== undefined) this._forceCrit = crit ? 1 : 0;
      try { orig.applyDamageToMonster.apply(this, args); } finally { this._forceCrit = undefined; }
      // Chain Arcana: critical skill hits arc to 2 more foes
      if (crit && skill && this.hasTalent('ek_chain') && !this._chainGuard) {
        const dealt = Math.max(1, hp0 - mob.hp);
        const near = this.monsters.filter(m => m !== mob && !m.dead && m.pos.distanceToSquared(mob.pos) < 49)
          .sort((a, b) => a.pos.distanceToSquared(mob.pos) - b.pos.distanceToSquared(mob.pos)).slice(0, 2);
        if (near.length) {
          this._chainGuard = true;
          try {
            let from = mob.pos;
            near.forEach((m) => {
              if (this.spawnLightningArc) this.spawnLightningArc(from, m.pos, 0x9ff0ff);
              orig.applyDamageToMonster.call(this, m, Math.round(dealt * 0.35), false, this.player);
              from = m.pos;
            });
          } finally { this._chainGuard = false; }
        }
      }
      return undefined;
    },

    useSkill(slot, isRemoteOrAI, actor) {
      const ent = actor || this.player;
      const local = ent === this.player && !isRemoteOrAI && this._talentMods;
      if (!local) return orig.useSkill.apply(this, arguments);
      const cd = this.player.cooldowns || {};
      const before = cd[slot] || 0;
      const prevWin = this._skillWindowUntil;
      // damage dealt inside the cast (and its delayed ticks) counts as skill damage
      this._skillWindowUntil = slot >= 2 ? this.cNow() + 1.1 : 0;
      const r = orig.useSkill.apply(this, arguments);
      const cast = before <= 0 && (cd[slot] || 0) > 0;
      if (!cast) { this._skillWindowUntil = prevWin; return r; }
      if (slot >= 2 && slot <= 4 && this.tv('cdr') > 0) cd[slot] *= 1 - this.tv('cdr');
      if (slot === 2 && this.cNow() < (this._counterUntil || 0)) this.spawnFloatingText(this.player.pos, 'COUNTER!', '#ffd56b', 18);
      if (slot >= 2 && this.hasTalent('ek_reso')) {
        this._resoCount = (this._resoCount || 0) + 1;
        if (this._resoCount % 3 === 0) this.vfxLater ? this.vfxLater(0.18, () => this.resonanceNova()) : this.resonanceNova();
      }
      return r;
    },

    resonanceNova() {
      const p = this.player;
      if (!p || p.dead) return;
      const C = this.skillColors ? this.skillColors(p, 4) : null;
      if (C && this.fxGroundSlam) this.fxGroundSlam(p.pos, C, 1.4, true, { pillars: 8, camera: false });
      this.spawnFloatingText(p.pos, 'RESONANCE!', '#7fe3ff', 19);
      const dmg = Math.round(this.getWeaponStats().dmg * 1.2);
      this._skillWindowUntil = this.cNow() + 0.2;
      this.monsters.forEach((m) => { if (!m.dead && m.pos.distanceTo(p.pos) <= 6 + (m.isBoss ? 1.2 : 0)) this.applyDamageToMonster(m, dmg, true, p); });
    },

    perfectParry(attacker) {
      const r = orig.perfectParry.apply(this, arguments);
      const p = this.player;
      if (this.hasTalent('gk_wave')) {
        const C = this.skillColors ? this.skillColors(p, 2) : null;
        if (C && this.fxGroundSlam) this.fxGroundSlam(p.pos, C, 0.95, true, { pillars: 5, camera: false });
        this.spawnFloatingText(p.pos, 'RETRIBUTION!', '#ffd56b', 18);
        const dmg = Math.round(this.getWeaponStats().dmg * 1.5);
        const at = p.pos.clone();
        // after the parry freeze, so the hits get their own impact frames
        const go = () => this.monsters.forEach((m) => { if (!m.dead && m.pos.distanceTo(at) <= 5.5 + (m.isBoss ? 1.2 : 0)) this.applyDamageToMonster(m, dmg, true, p); });
        if (this.vfxLater) this.vfxLater(0.06, go); else go();
      }
      if (this.hasTalent('gk_counter') && p.cooldowns) {
        p.cooldowns[2] = 0;
        this._counterUntil = this.cNow() + 3;
        const el = document.getElementById('slot-2');
        if (el) { el.classList.add('triggered'); setTimeout(() => el.classList.remove('triggered'), 220); }
        this.spawnFloatingText(p.pos, 'COUNTER READY!', '#fff2c4', 15);
      }
      return r;
    },

    // called by mmo_combat.js when a dodge roll starts
    onRollStart(origin) {
      const p = this.player;
      const t = this.cNow();
      if (this.tv('momentum') > 0) this._momentumUntil = t + 0.55 + 1.5;
      if (this.hasTalent('ak_mirage')) {
        const C = this.skillColors ? this.skillColors(p, 3) : { main: 0x6dffb0, elem: 0x6dffb0, core: 0xffffff };
        const yaw = p.yaw;
        if (this.spawnHeroAfterimage) this.spawnHeroAfterimage(p, origin.clone(), yaw, C.main, 0.75);
        const boom = () => {
          if (this.vfxFlash) {
            this.vfxFlash(new THREE.Vector3(origin.x, 1.0, origin.z), 3.2, C.elem, C.core, 0.26);
            this.vfxRune(origin, 3.4, C.main, C.core, 0.7);
            this.vfxSparks(new THREE.Vector3(origin.x, 0.9, origin.z), 40, { cols: [C.core, C.main, C.elem], speed: [6, 14], life: [0.25, 0.5], grav: 8 });
            this.vfxShock(new THREE.Vector3(origin.x, 0, origin.z), 3.6, 1.0, C.elem, C.core, { dur: 0.35 });
            this.vfxLight(origin, 8, C.elem, 1.3, 0.4);
          } else this.spawnShockwaveRing(origin, 3.6, C.main, 0.35);
          const dmg = Math.round(this.getWeaponStats().dmg * 1.2);
          this.monsters.forEach((m) => { if (!m.dead && m.pos.distanceTo(origin) <= 3.5 + (m.isBoss ? 1 : 0)) this.applyDamageToMonster(m, dmg, true, p); });
        };
        if (this.vfxLater) this.vfxLater(0.6, boom); else setTimeout(boom, 600);
      }
    },

    // called when an enemy attack connects with you inside your i-frames
    onPerfectEvade(src) {
      if (!this.hasTalent('ak_evade')) return;
      const t = this.cNow();
      if (t < (this._evadeCd || 0)) return;
      this._evadeCd = t + 0.5;
      const p = this.player;
      if (this.stamina !== undefined) this.stamina = Math.min(100, this.stamina + 20);
      this._evadeCritUntil = t + 3;
      this._evadeConsumeAt = 0;
      this.spawnFloatingText(p.pos, 'PERFECT DODGE!', '#9ff0ff', 19);
      if (this.vfxFlash) {
        this.vfxFlash(new THREE.Vector3(p.pos.x, 1.1, p.pos.z), 2.6, 0x9ff0ff, 0xffffff, 0.22);
        this.vfxSparks(new THREE.Vector3(p.pos.x, 1.0, p.pos.z), 22, { cols: [0x9ff0ff, 0xffffff], speed: [3, 8], life: [0.3, 0.6], grav: -1 });
      }
      if (this.audio && this.audio.playSample) this.audio.playSample('chime', 1.6, 0.45);
    },

    bossHit(m, mult, label) {
      if (this.player.dodgeTimer > 0) this.onPerfectEvade(m);
      return orig.bossHit.apply(this, arguments);
    },

    // =========================================================================
    // UI
    // =========================================================================
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initTalents(); } catch (e) { console.warn('[Talents] init failed', e); }
    },

    initTalents() {
      this.bindClassTalents();
      if (!document.getElementById('talent-css')) {
        const st = document.createElement('style'); st.id = 'talent-css'; st.textContent = CSS; document.head.appendChild(st);
      }
      this.buildTalentModal();
      // HUD button next to Inventory
      if (!document.getElementById('btn-talents')) {
        const b = document.createElement('button');
        b.id = 'btn-talents'; b.className = 'mini-btn';
        b.innerHTML = '✦ Talents [T]<span class="tal-badge" style="display:none"></span>';
        b.onclick = () => this.toggleTalents();
        const inv = Array.from(document.querySelectorAll('.net-actions .mini-btn')).find(x => /Inventory/.test(x.textContent));
        if (inv && inv.parentNode) inv.parentNode.insertBefore(b, inv.nextSibling); else document.body.appendChild(b);
      }
      window.addEventListener('keydown', (e) => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        if (this.cutsceneActive || e.repeat) return;
        if (e.key.toLowerCase() === 't') {
          const open = document.getElementById('talent-modal').classList.contains('active');
          if (open) this.closeModals(true);
          else if (!this.isAnyModalOpen && this.isInWorld) this.toggleTalents();
        }
      });
      this._lastTalentLevel = this.player.level;
      this.refreshTalentUI();
    },

    toggleTalents() {
      const el = document.getElementById('talent-modal');
      if (el.classList.contains('active')) { this.closeModals(true); return; }
      this.openModal('talent-modal');
      this.renderTalentStars();
      this.refreshTalentUI();
    },

    buildTalentModal() {
      if (document.getElementById('talent-modal')) return;
      const m = document.createElement('div');
      m.id = 'talent-modal'; m.className = 'modal-backdrop';
      const branchHtml = BRANCHES.map((b) => {
        const lines = [];
        b.nodes.forEach((n) => (n.req || []).forEach((rid) => {
          const a = NODE[rid];
          lines.push(`<line class="tal-edge" data-from="${rid}" data-to="${n.id}" x1="${a.x}" y1="${a.y}" x2="${n.x}" y2="${n.y}"/>`);
        }));
        const nodes = b.nodes.map(n => `<button class="tal-node${n.ks ? ' ks' : ''}" data-id="${n.id}" style="left:${n.x}%;top:${n.y}%" aria-label="${n.name}">
            <span class="tal-ico">${n.icon}</span><span class="tal-rank">0/${n.max}</span></button>`).join('');
        return `<section class="tal-branch" data-b="${b.id}" style="--bc:${b.color};--bg:${b.glow}">
          <div class="tal-bhead"><span class="tal-bicon">${b.icon}</span><div><h3>${b.name}</h3><p>${b.blurb}</p></div><b class="tal-bspent">0</b></div>
          <div class="tal-field"><svg class="tal-lines" viewBox="0 0 100 100" preserveAspectRatio="none">${lines.join('')}</svg>${nodes}</div>
        </section>`;
      }).join('');
      m.innerHTML = `<div class="tal-wrap">
          <canvas class="tal-stars"></canvas>
          <header class="tal-head">
            <div class="tal-title">✦ Constellations <small id="tal-class"></small></div>
            <div class="tal-points" id="tal-points"><b id="tal-avail">0</b><span>talent points · <span id="tal-spent"></span></span></div>
            <div class="tal-actions"><button class="mini-btn" id="tal-reset" title="Refund every point (free)">↺ Reset</button>
              <button class="mini-btn" id="tal-close">✕ Close [T / ESC]</button></div>
          </header>
          <div class="tal-branches">${branchHtml}</div>
          <div class="tal-tip" id="tal-tip"></div>
        </div>`;
      document.body.appendChild(m);
      m.querySelector('#tal-close').onclick = () => this.closeModals(true);
      m.querySelector('#tal-reset').onclick = () => {
        if (this.talentPointsSpent() === 0) return;
        if (!confirm('Refund all talent points for this class?')) return;
        this.resetTalents(); this.refreshTalentUI();
      };
      const tip = m.querySelector('#tal-tip');
      m.querySelectorAll('.tal-node').forEach((el) => {
        const id = el.dataset.id;
        el.addEventListener('mouseenter', () => this.showTalentTip(el, id));
        el.addEventListener('mouseleave', () => { if (!isTouch) tip.classList.remove('show'); });
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          // touch: first tap inspects, second tap buys
          if (isTouch && this._talSel !== id) {
            this._talSel = id;
            m.querySelectorAll('.tal-node.sel').forEach(x => x.classList.remove('sel'));
            el.classList.add('sel');
            this.showTalentTip(el, id);
            return;
          }
          if (this.unlockTalent(id)) {
            this.talentBurst(el, id);
            this.refreshTalentUI(id);
            this.showTalentTip(el, id);
          } else {
            el.classList.remove('deny'); void el.offsetWidth; el.classList.add('deny');
            this.showTalentTip(el, id);
          }
        });
      });
      m.querySelector('.tal-wrap').addEventListener('click', () => { this._talSel = null; tip.classList.remove('show'); m.querySelectorAll('.tal-node.sel').forEach(x => x.classList.remove('sel')); });
    },

    showTalentTip(el, id) {
      const n = NODE[id], tip = document.getElementById('tal-tip'), wrap = tip.parentNode;
      const r = this.talentRank(id);
      const block = this.talentBlocker(n);
      const b = BRANCHES.find(x => x.id === n.branch);
      let html = `<h4>${n.icon} ${n.name}</h4><div class="tt-sub">${n.ks ? 'Keystone' : 'Passive'} · ${b.name} · Rank ${r}/${n.max}</div>`;
      html += r > 0 ? `<div>${n.desc(r)}</div>` : `<div>${n.desc(1)}</div>`;
      if (r > 0 && r < n.max) html += `<div class="tt-next">Next rank: ${n.desc(r + 1)}</div>`;
      if (block && r < n.max) html += `<div class="tt-req">${block}</div>`;
      else if (!block) html += `<div class="tt-cta">${isTouch ? 'Tap again' : 'Click'} to unlock · 1 point</div>`;
      tip.innerHTML = html;
      const er = el.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      let x = er.right - wr.left + 12, y = er.top - wr.top - 8;
      if (x + 280 > wr.width) x = er.left - wr.left - 282;
      if (x < 8) x = Math.max(8, er.left - wr.left - 120);
      y = Math.max(70, Math.min(wr.height - 180, y));
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
      tip.classList.add('show');
    },

    talentBurst(el, id) {
      const b = document.createElement('div');
      b.className = 'tal-burst';
      let html = '<i class="flash"></i><i class="ring"></i><i class="ring r2"></i>';
      for (let i = 0; i < 14; i++) html += `<i class="ray" style="--a:${Math.round(i * 360 / 14 + Math.random() * 10)}deg;animation-delay:${(Math.random() * 0.06).toFixed(2)}s"></i>`;
      b.innerHTML = html;
      el.appendChild(b);
      setTimeout(() => b.remove(), 950);
      // draw the newly lit constellation lines in
      document.querySelectorAll(`#talent-modal .tal-edge[data-to="${id}"]`).forEach((ln) => {
        if (this.talentRank(ln.dataset.from) > 0) { ln.classList.remove('draw'); void ln.getBoundingClientRect(); ln.classList.add('draw'); setTimeout(() => ln.classList.remove('draw'), 800); }
      });
      const pts = document.getElementById('tal-points');
      if (pts) { pts.classList.remove('pulse'); void pts.offsetWidth; pts.classList.add('pulse'); }
    },

    refreshTalentUI() {
      const total = this.talentPointsTotal(), spent = this.talentPointsSpent(), avail = Math.max(0, total - spent);
      const btn = document.getElementById('btn-talents');
      if (btn) {
        const badge = btn.querySelector('.tal-badge');
        badge.style.display = avail > 0 ? 'inline-block' : 'none';
        badge.textContent = avail;
        btn.classList.toggle('has-pts', avail > 0);
      }
      const m = document.getElementById('talent-modal');
      if (!m) return;
      const HC = typeof HERO_CLASSES !== 'undefined' ? HERO_CLASSES : null;
      const cls = HC && HC[this.player.classId] ? (HC[this.player.classId].title || HC[this.player.classId].name) : this.player.classId;
      m.querySelector('#tal-class').textContent = `${cls || ''} · Lv.${this.player.level}`;
      m.querySelector('#tal-avail').textContent = avail;
      m.querySelector('#tal-spent').textContent = `${spent} / ${total} spent`;
      BRANCHES.forEach((b) => {
        const sec = m.querySelector(`.tal-branch[data-b="${b.id}"]`);
        sec.querySelector('.tal-bspent').textContent = this.branchSpent(b.id);
        b.nodes.forEach((n) => {
          const el = sec.querySelector(`.tal-node[data-id="${n.id}"]`);
          const r = this.talentRank(n.id);
          el.querySelector('.tal-rank').textContent = `${r}/${n.max}`;
          el.classList.toggle('owned', r > 0);
          el.classList.toggle('maxed', r >= n.max);
          el.classList.toggle('avail', !this.talentBlocker(n));
        });
        sec.querySelectorAll('.tal-edge').forEach((ln) => {
          const a = this.talentRank(ln.dataset.from) > 0, z = this.talentRank(ln.dataset.to) > 0;
          ln.classList.toggle('lit', a && z);
          ln.classList.toggle('avail', a && !z && !this.talentBlocker(NODE[ln.dataset.to]));
        });
      });
    },

    renderTalentStars() {
      const c = document.querySelector('#talent-modal .tal-stars');
      if (!c) return;
      const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
      if (c.width === w && c.height === h) return;
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.clearRect(0, 0, w, h);
      let seed = 1337;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < Math.round(w * h / 2600); i++) {
        const x = rnd() * w, y = rnd() * h, r = rnd() < 0.92 ? rnd() * 1.1 + 0.2 : rnd() * 1.8 + 1;
        g.globalAlpha = 0.25 + rnd() * 0.6;
        g.fillStyle = rnd() < 0.2 ? '#ffe7b0' : (rnd() < 0.3 ? '#bfe9ff' : '#ffffff');
        g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
      }
      // faint nebula wash
      g.globalAlpha = 1;
      const grd = g.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, w * 0.6);
      grd.addColorStop(0, 'rgba(90, 120, 255, 0.08)'); grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    },

    // =========================================================================
    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (!this._talentMods) return;
      const now = this.cNow ? this.cNow() : 0;
      if (this._evadeConsumeAt && now > this._evadeConsumeAt) { this._evadeCritUntil = 0; this._evadeConsumeAt = 0; }
      // level up -> new talent point
      if (this.player.level > (this._lastTalentLevel || 0)) {
        if (this._lastTalentLevel) {
          this.spawnFloatingText(this.player.pos, '+1 TALENT POINT  [T]', '#7fe3ff', 17);
          if (this.addChatMessage) this.addChatMessage('System', '✦ You earned a talent point. Press T to open your Constellations.', 'sys-synergy');
        }
        this._lastTalentLevel = this.player.level;
        this.refreshTalentUI();
      } else if (this.player.level < this._lastTalentLevel) {
        this._lastTalentLevel = this.player.level;
        this.refreshTalentUI();
      }
    }
  });

  window.CR_TALENTS = { BRANCHES, NODE };
})();
