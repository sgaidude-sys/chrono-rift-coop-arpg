/* =============================================================================
 * Chrono-Rift — reward loop (upgrade phase 5): something to cheer about every
 * 5–10 minutes.
 *
 *  • FORTUNE METER (under the HP bar): every kill fills it (elites, champions and
 *    bosses fill a lot, kills at style rank S+ fill 50% more). At 100% a JACKPOT
 *    bursts open: a loot explosion, a gold shower, and 45 s of FORTUNE FRENZY
 *    (double XP). Each jackpot in the same session pays out MORE than the last.
 *    Active fighting fills it in roughly 5 minutes.
 *  • BOUNTIES: three short goals at a time (5–10 min each) shown in the quest
 *    tracker. Each pays a cache; clearing all three pays a big one (epic+).
 *  • DAILY FIRST WIN: the first elite / boss of the day drops a guaranteed epic
 *    and grants 15 minutes of double XP.
 *  • RIFT SURGE: open a 3-minute, 3-wave rift anywhere outside town (button in the
 *    quest tracker, or Y). Clear it in time for a reward chest and the next tier.
 *    Higher tiers: tougher, more affixed elites, richer chests, better legendary
 *    odds. Co-op: the host runs the waves; everyone nearby gets their own chest.
 *  • LEGENDARY FANFARE: legendary / mythic loot gets a slow-mo beam, a callout
 *    and its power announced.
 * ============================================================================= */
(function () {
  'use strict';
  const GP = ChronoRiftCoOpGame.prototype;
  const M = window.MMO;
  const RAR = {}; M.RARITIES.forEach((r, i) => { RAR[r.id] = Object.assign({ idx: i }, r); });

  const JACKPOT = 100, FRENZY_S = 45, RESTED_MS = 15 * 60 * 1000;
  const RIFT_TIME = 180, RIFT_R = 12;
  const FILL = { kill: 3, role: 4.5, elite: 12, boss: 30, world: 60 };

  const BOUNTY_KINDS = {
    kill: { make: (L) => ({ n: 18 + Math.floor(Math.random() * 9) }), text: (b) => `Slay ${b.n} monsters` },
    elite: { make: () => ({ n: 2 }), text: (b) => `Defeat ${b.n} elites or champions` },
    role: { min: 4, make: () => ({ n: 4 }), text: (b) => `Defeat ${b.n} Chargers, Shieldbearers or Menders` },
    slam: { make: () => ({ n: 6 }), text: (b) => `Slam ${b.n} enemies (${window.game && window.game.touchUI ? '⤓' : 'F'}) — airborne ones count double` },
    guard: { make: () => ({ n: 3 }), text: (b) => `Land ${b.n} Perfect Guards` },
    style: { make: () => ({ n: 1 }), text: () => 'Reach style rank S' },
    rift: { min: 3, make: () => ({ n: 1 }), text: () => 'Clear a Rift Surge' }
  };

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const _v = new THREE.Vector3();

  const css = `
  #ui-vitals .ui-thin.fortune { position: relative; height: 5px; margin-top: 3px; background: rgba(255,213,107,.12); border-radius: 3px; overflow: hidden; }
  #ui-vitals .ui-thin.fortune > i { display: block; height: 100%; width: 0; background: linear-gradient(90deg,#b8862b,#ffd56b,#fff1c2); box-shadow: 0 0 8px rgba(255,213,107,.7); transition: width .25s; }
  #ui-vitals .ui-thin.fortune.hot > i { animation: crFortPulse .6s ease-in-out infinite alternate; }
  @keyframes crFortPulse { from { filter: brightness(1); } to { filter: brightness(1.6); } }
  #ui-vitals .fortl { display: flex; justify-content: space-between; font: 700 8.5px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 1.5px; color: #d9b45a; margin-top: 1px; }
  #ui-vitals .fortl .frz { color: #ff9a2e; }
  .cr-bounty { margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(243,200,107,.18); font: 500 11.5px/1.35 'Plus Jakarta Sans', Inter, sans-serif; }
  .cr-bounty .h { font: 800 9.5px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 2px; color: #D4AF37; display: flex; justify-content: space-between; }
  .cr-bounty .b { display: flex; justify-content: space-between; gap: 6px; color: #e9e4d8; }
  .cr-bounty .b.done { color: #5be39b; }
  .cr-bounty .b span:last-child { color: #ffd56b; font-variant-numeric: tabular-nums; }
  .cr-bounty .buf { color: #ff9a2e; font-size: 10.5px; }
  .cr-bounty .ses { color: rgba(233,228,216,.55); font-size: 10px; margin-top: 3px; }
  .cr-rift-btn { all: unset; display: block; margin-top: 6px; padding: 5px 8px; border-radius: 8px; cursor: pointer; text-align: center;
    background: linear-gradient(90deg, rgba(120,60,200,.35), rgba(60,140,255,.3)); border: 1px solid rgba(178,102,255,.6); color: #efe4ff; font: 800 11px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .5px; }
  .cr-rift-btn:hover { filter: brightness(1.2); }
  .cr-rift-btn.off { opacity: .45; cursor: default; }
  #rift-banner { position: fixed; top: 64px; left: 50%; transform: translateX(-50%); z-index: 44; display: none; pointer-events: none;
    padding: 6px 16px; border-radius: 12px; background: rgba(16,10,32,.82); border: 1px solid rgba(178,102,255,.65); box-shadow: 0 0 22px rgba(178,102,255,.35);
    color: #efe4ff; font: 800 12px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 1.5px; text-align: center; }
  #rift-banner .t { font: 800 18px 'JetBrains Mono', monospace; color: #fff; }
  #rift-banner .t.low { color: #ff6a6a; }
  body.touch-ui #rift-banner { top: 8px; font-size: 10.5px; padding: 4px 10px; }
  body.touch-ui #rift-banner .t { font-size: 14px; }
  `;

  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, grantKillRewards: GP.grantKillRewards,
    gainXP: GP.gainXP, pickupItem: GP.pickupItem, ccApply: GP.ccApply, perfectParry: GP.perfectParry,
    updateStoryTrackerUI: GP.updateStoryTrackerUI, getMobById: GP.getMobById, installNetBatch: GP.installNetBatch,
    loadMMOState: GP.loadMMOState
  };

  Object.assign(GP, {
    // ---- state ------------------------------------------------------------------------------------
    rw() {
      const st = this.mmoState; if (!st) return null;
      if (!st.rw) st.rw = { fortune: 0, bounties: [], boards: 0, daily: '', riftTier: 1, riftBest: 0, restedUntil: 0 };
      const R = st.rw;
      if (!R.bounties || !R.bounties.length) this.rwNewBoard();
      return R;
    },
    rwSess() { return this._rwS || (this._rwS = { jackpots: 0, legend: 0, bounties: 0, rifts: 0, frenzy: 0 }); },

    loadMMOState(classId) {
      const r = orig.loadMMOState.apply(this, arguments);
      this._rwS = null;
      this.rw();
      return r;
    },

    initMMOWorld() {
      const r = orig.initMMOWorld ? orig.initMMOWorld.apply(this, arguments) : undefined;
      if (!document.getElementById('cr-rewards-css')) {
        const s = document.createElement('style'); s.id = 'cr-rewards-css'; s.textContent = css; document.head.appendChild(s);
      }
      if (!document.getElementById('rift-banner')) {
        const b = document.createElement('div'); b.id = 'rift-banner'; document.body.appendChild(b);
      }
      if (!this._rwKeys) {
        this._rwKeys = true;
        window.addEventListener('keydown', (e) => {
          if ((e.key === 'y' || e.key === 'Y') && !e.repeat && this.isInWorld && !this.isAnyModalOpen) {
            const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            this.riftRequest();
          }
        });
      }
      return r;
    },

    rwHud() {
      const v = document.getElementById('ui-vitals');
      if (!v) return null;
      if (!this._rwHud || !this._rwHud.bar.isConnected) {
        const bar = document.createElement('div'); bar.className = 'ui-thin fortune'; bar.innerHTML = '<i></i>';
        const lbl = document.createElement('div'); lbl.className = 'fortl'; lbl.innerHTML = '<span>✦ FORTUNE</span><span class="v">0%</span>';
        v.appendChild(bar); v.appendChild(lbl);
        this._rwHud = { bar, fill: bar.querySelector('i'), v: lbl.querySelector('.v'), last: '' };
      }
      return this._rwHud;
    },

    // ---- fortune -------------------------------------------------------------------------------------
    fortuneAdd(pts, why) {
      const R = this.rw(); if (!R || pts <= 0) return;
      R.fortune = (R.fortune || 0) + pts;
      if (R.fortune >= JACKPOT) { R.fortune -= JACKPOT; this.jackpot(); }
      if (this.teachTip && R.fortune >= 15) this.teachTip('fortune');
    },

    jackpot() {
      const p = this.player, S = this.rwSess();
      const n = ++S.jackpots;
      const L = p.level || 1;
      // escalating payout
      const items = 2 + Math.min(3, Math.floor(n / 2));
      const legendChance = Math.min(0.5, 0.06 + 0.06 * (n - 1));
      const minR = n >= 3 ? 'epic' : 'rare';
      const at = p.pos.clone();
      for (let i = 0; i < items; i++) {
        const leg = i === 0 && Math.random() < legendChance;
        const it = this.generateItem({ ilvl: L + (n >= 4 ? 1 : 0), minRarity: i === 0 ? minR : 'uncommon', rarity: leg ? 'legendary' : this.rollRarity(0.6 + n * 0.25), cls: i === 0 ? p.classId : undefined });
        this.spawnItemDrop(at, it, 0, null);
      }
      const gold = Math.round((60 + L * 25) * (1 + 0.3 * (n - 1)));
      for (let i = 0; i < 6; i++) this.spawnItemDrop(at, null, Math.round(gold / 6), null);
      p.shards = (p.shards || 0) + 2 + n;
      this._rwFrenzy = FRENZY_S;
      S.frenzy++;
      // fanfare
      if (this.slowMo) this.slowMo(0.35, 0.7);
      if (this.epicFlash) this.epicFlash(0.55, 420, '#ffd56b');
      if (this.epicCallout) this.epicCallout(n > 1 ? `JACKPOT ×${n}!` : 'JACKPOT!', '#ffd56b');
      if (this.vfxPillar) { this.vfxPillar(_v.set(at.x, 0, at.z), 16, 2.2, 0xffd56b, 0xffffff, 0); this.vfxPillar(_v.set(at.x, 0, at.z), 10, 1.0, 0xffffff, 0xffd56b, 0.1); }
      if (this.vfxShock) this.vfxShock(_v.set(at.x, 0, at.z), 9, 3, 0xffd56b, 0xffffff, { r0: 1, dur: 0.7 });
      if (this.vfxSparks) this.vfxSparks(_v.set(at.x, 1.2, at.z), 60, { cols: [0xffd56b, 0xfff1c2, 0xffffff], speed: [5, 14], life: [0.6, 1.2], grav: 9, width: 0.06, upBias: 0.8 });
      if (this.audio) { this.audio.playLootChime && this.audio.playLootChime(); this.audio.playSpell && this.audio.playSpell('ult'); }
      this.spawnFloatingText(at.clone().add(_v.set(0, 3.2, 0)), `FORTUNE FRENZY — 2× XP for ${FRENZY_S}s`, '#ffb35c', 17);
      this.addChatMessage && this.addChatMessage('Fortune', `💰 JACKPOT${n > 1 ? ' ×' + n : ''}! ${items} items + ${gold} gold burst open. Next jackpot pays even more.`, 'sys-loot');
      this.saveMMOState && this.saveMMOState();
    },

    // ---- bounties ------------------------------------------------------------------------------------
    rwNewBoard() {
      const st = this.mmoState; if (!st) return;
      const R = st.rw;
      const L = (this.player && this.player.level) || 1;
      const kinds = Object.keys(BOUNTY_KINDS).filter(k => !BOUNTY_KINDS[k].min || L >= BOUNTY_KINDS[k].min);
      const pick = [];
      while (pick.length < 3 && kinds.length) pick.push(kinds.splice(Math.floor(Math.random() * kinds.length), 1)[0]);
      R.bounties = pick.map(k => Object.assign({ k, c: 0, done: false }, BOUNTY_KINDS[k].make(L)));
    },

    bountyAdd(kind, by) {
      const R = this.rw(); if (!R) return;
      let changed = false;
      R.bounties.forEach((b) => {
        if (b.done || b.k !== kind) return;
        b.c = Math.min(b.n, b.c + (by || 1)); changed = true;
        if (b.c >= b.n) { b.done = true; this.bountyPay(b); }
      });
      if (!changed) return;
      if (R.bounties.every(b => b.done)) this.bountyBoard();
      this._rwTrk = 0.05;
    },

    bountyPay(b) {
      const p = this.player, L = p.level || 1;
      this.rwSess().bounties++;
      const it = this.generateItem({ ilvl: L, minRarity: 'rare', rarity: this.rollRarity(1.5), cls: p.classId });
      this.spawnItemDrop(p.pos.clone(), it, Math.round(L * 12), null);
      p.shards = (p.shards || 0) + 2;
      if (this.epicCallout) this.epicCallout('BOUNTY COMPLETE', '#5be39b');
      if (this.vfxPillar) this.vfxPillar(_v.set(p.pos.x, 0, p.pos.z), 8, 1.2, 0x5be39b, 0xffffff, 0);
      if (this.audio && this.audio.playLootChime) this.audio.playLootChime();
      this.addChatMessage && this.addChatMessage('Bounty', `🎯 Bounty complete: ${BOUNTY_KINDS[b.k].text(b)}`, 'sys-loot');
      this.fortuneAdd(15);
    },

    bountyBoard() {
      const p = this.player, L = p.level || 1, R = this.rw();
      R.boards = (R.boards || 0) + 1;
      const leg = Math.random() < 0.25;
      const it = this.generateItem({ ilvl: L + 1, minRarity: 'epic', rarity: leg ? 'legendary' : 'epic', cls: p.classId });
      this.spawnItemDrop(p.pos.clone(), it, Math.round(L * 30), null);
      p.shards = (p.shards || 0) + 5;
      if (this.slowMo) this.slowMo(0.4, 0.5);
      if (this.epicCallout) this.epicCallout('BOUNTY BOARD CLEARED', '#ffd56b');
      this.addChatMessage && this.addChatMessage('Bounty', '🏆 All three bounties done! A bounty chest bursts open — new bounties posted.', 'sys-loot');
      this.fortuneAdd(25);
      this.rwNewBoard();
    },

    // ---- hooks ------------------------------------------------------------------------------------------
    grantKillRewards(mob, fromNetwork) {
      const r = orig.grantKillRewards.apply(this, arguments);
      try {
        const p = this.player;
        if (!mob || !p || Math.hypot(p.pos.x - mob.pos.x, p.pos.z - mob.pos.z) > 75) return r;
        let pts = mob.isWorldBoss ? FILL.world : mob.isBoss ? FILL.boss : mob.isElite ? FILL.elite : mob.foeRole ? FILL.role : FILL.kill;
        if (mob.isAdd && !mob.isRift) pts *= 0.4;
        if (this.styleRank && this.styleRank() >= 4) pts *= 1.5;
        if (((mob.level || 1) - (p.level || 1)) < -5) pts *= 0.25;     // grey mobs barely count
        this.fortuneAdd(pts);
        this.bountyAdd('kill');
        if (mob.isElite || mob.isBoss) {
          this.bountyAdd('elite');
          const R = this.rw();
          if (R && R.daily !== today()) {
            R.daily = today();
            R.restedUntil = Date.now() + RESTED_MS;
            const it = this.generateItem({ ilvl: (p.level || 1) + 1, minRarity: 'epic', rarity: Math.random() < 0.2 ? 'legendary' : 'epic', cls: p.classId });
            this.spawnItemDrop(mob.pos.clone(), it, Math.round((p.level || 1) * 25), null);
            if (this.epicCallout) this.epicCallout('DAILY FIRST WIN', '#7fe3ff');
            this.addChatMessage && this.addChatMessage('Daily', '☀️ Daily first win! A guaranteed epic dropped and you are WELL RESTED: 2× XP for 15 minutes.', 'sys-loot');
          }
        }
        if (mob.foeRole) this.bountyAdd('role');
      } catch (e) { console.warn('[rewards]', e); }
      return r;
    },

    gainXP(amount, showText) {
      const R = this.mmoState && this.mmoState.rw;
      let k = 1;
      if (this._rwFrenzy > 0) k += 1;
      if (R && R.restedUntil > Date.now()) k += 1;
      if (k > 1 && amount > 0) arguments[0] = Math.round(amount * 2);   // bonuses don't stack past 2×
      return orig.gainXP.apply(this, arguments);
    },

    ccApply(m, tag, o, caster) {
      const local = !caster || caster === this.player;
      const wasAir = local && tag === 'slam' && m && this.ccState && this.ccState(m) === 'air';
      const isSlam = local && tag === 'slam' && m && !m.dead;
      const r = orig.ccApply.apply(this, arguments);
      if (r && isSlam) this.bountyAdd('slam', wasAir ? 2 : 1);      // any slam counts; airborne slams count double
      return r;
    },

    perfectParry(attacker) {
      const r = orig.perfectParry.apply(this, arguments);
      this.bountyAdd('guard');
      return r;
    },

    pickupItem(it) {
      const ok = orig.pickupItem.apply(this, arguments);
      if (ok !== false && it && (it.rarity === 'legendary' || it.rarity === 'mythic')) {
        const p = this.player, myth = it.rarity === 'mythic';
        const col = myth ? '#ff3b5c' : '#ff9a2e';
        this.rwSess().legend++;
        if (this.slowMo) this.slowMo(0.3, 0.8);
        if (this.epicFlash) this.epicFlash(0.5, 380, col);
        if (this.epicCallout) this.epicCallout(myth ? 'MYTHIC!' : 'LEGENDARY!', col);
        if (this.vfxPillar) this.vfxPillar(_v.set(p.pos.x, 0, p.pos.z), 18, 1.6, myth ? 0xff3b5c : 0xff9a2e, 0xffffff, 0);
        const pw = it.power && window.CR_LEGEND && window.CR_LEGEND.POWERS[it.power];
        if (pw) this.spawnFloatingText(p.pos.clone().add(_v.set(0, 3.4, 0)), `✦ ${pw.name}`, '#ffb35c', 18);
      }
      return ok;
    },

    // ---- quest tracker block ---------------------------------------------------------------------------
    updateStoryTrackerUI() {
      const r = orig.updateStoryTrackerUI.apply(this, arguments);
      const body = document.getElementById('story-tracker-body');
      const R = this.mmoState && this.rw();
      if (!body || !R) return r;
      const S = this.rwSess();
      const lines = R.bounties.map(b => `<div class="b ${b.done ? 'done' : ''}"><span>${b.done ? '✅' : '🎯'} ${esc(BOUNTY_KINDS[b.k].text(b))}</span><span>${b.c}/${b.n}</span></div>`).join('');
      const buffs = [];
      if (this._rwFrenzy > 0) buffs.push(`💰 Fortune Frenzy 2× XP ${Math.ceil(this._rwFrenzy)}s`);
      if (R.restedUntil > Date.now()) buffs.push(`☀️ Well Rested 2× XP ${Math.ceil((R.restedUntil - Date.now()) / 60000)}m`);
      else if (R.daily !== today()) buffs.push('☀️ Daily first win available: defeat an elite or boss');
      const rift = this._rift;
      const cd = Math.max(0, Math.ceil(((this._riftCdUntil || 0) - performance.now()) / 1000));
      const btn = rift && rift.phase === 'wave'
        ? `<button class="cr-rift-btn off">🌀 Rift Surge in progress…</button>`
        : `<button class="cr-rift-btn ${cd ? 'off' : ''}" onclick="window.game.riftRequest()">🌀 Open Rift Surge — Tier ${R.riftTier || 1}${cd ? ` (${cd}s)` : ' [Y]'}</button>`;
      const div = document.createElement('div');
      div.className = 'cr-bounty';
      div.innerHTML = `<div class="h"><span>BOUNTIES</span><span>${R.boards ? `boards cleared: ${R.boards}` : ''}</span></div>${lines}` +
        (buffs.length ? `<div class="buf">${buffs.join('<br>')}</div>` : '') + btn +
        (S.jackpots || S.legend || S.bounties || S.rifts ? `<div class="ses">This session: ${S.jackpots} jackpots · ${S.legend} legendaries · ${S.bounties} bounties · ${S.rifts} rifts</div>` : '');
      body.appendChild(div);
      return r;
    },

    // ---- rift surge -------------------------------------------------------------------------------------
    riftHost() { return !!(this.isRoomHost || !this.remotePeers || this.remotePeers.size === 0); },

    riftRequest() {
      const p = this.player, R = this.rw();
      if (!p || !R || p.dead || !this.isInWorld) return;
      if (this._rift && this._rift.phase === 'wave') { this.showLootToast && this.showLootToast('🌀 A Rift Surge is already open.'); return; }
      if ((this._riftCdUntil || 0) > performance.now()) { this.showLootToast && this.showLootToast('🌀 The rift is still settling — try again in a moment.'); return; }
      if (this.isInTownSafeZone && this.isInTownSafeZone(p.pos)) { this.showLootToast && this.showLootToast('🌀 Rifts cannot open inside town. Head out into the wilds!'); return; }
      const req = { x: +p.pos.x.toFixed(1), z: +p.pos.z.toFixed(1), tier: R.riftTier || 1, lv: p.level || 1, by: p.name || 'Hero' };
      if (this.riftHost()) this.riftStart(req);
      else if (this.broadcastGameEvent) { this.broadcastGameEvent('rift_req', Object.assign({ from: this.playerToken }, req)); this.showLootToast && this.showLootToast('🌀 Asking the host to open the rift…'); }
    },

    riftStart(req) {
      const zone = this.worldGen ? this.worldGen.zones[this.worldGen.zoneAt(req.x, req.z).i] : null;
      const pool = (zone && zone.mobs && zone.mobs.length ? zone.mobs : [{ type: 'meadow_slime', name: 'Slime' }]);
      const lv = Math.max(1, Math.min((M.WORLD.levelCap || 50) + 5, req.lv + Math.floor((req.tier - 1) / 2)));
      this._riftSerial = (this._riftSerial || 0) + 1;
      const rift = { id: `${Date.now() % 100000}${this._riftSerial}`, x: req.x, z: req.z, tier: req.tier, lv, by: req.by, wave: 0, waves: 3, phase: 'wave', ends: performance.now() + RIFT_TIME * 1000, pool, ids: [], host: true };
      this._rift = rift;
      this.riftNextWave();
    },

    riftNextWave() {
      const rf = this._rift; if (!rf || !rf.host) return;
      rf.wave++;
      const T = rf.tier, ids = [];
      const mk = (type, e) => {
        const a = Math.random() * Math.PI * 2, r = RIFT_R * (0.6 + Math.random() * 0.5);
        const x = Math.round(rf.x + Math.cos(a) * r), z = Math.round(rf.z + Math.sin(a) * r);
        this._addSerial = (this._addSerial || 0) + 1;
        ids.push(`rift~${type}~${rf.lv}~${T}~${e}~${this._addSerial}~${x}~${z}`);
      };
      const rnd = () => rf.pool[Math.floor(Math.random() * rf.pool.length)].type;
      if (rf.wave === 1) { for (let i = 0; i < 6 + Math.min(4, T); i++) mk(rnd(), 0); }
      else if (rf.wave === 2) { for (let i = 0; i < 5 + Math.min(3, T); i++) mk(rnd(), 0); for (let i = 0; i < 1 + Math.min(2, Math.floor(T / 2)); i++) mk(rnd(), 1); }
      else { mk(rnd(), 2); for (let i = 0; i < 3 + Math.min(4, T); i++) mk(rnd(), 0); }
      rf.ids = ids;
      ids.forEach(id => { const m = this.getMobById(id); if (m) m.aggroTimer = 30; });
      this.riftBroadcast();
      this.riftLocalWave(rf);
    },

    riftBroadcast() {
      const rf = this._rift; if (!rf || !this.broadcastGameEvent || !this.remotePeers || !this.remotePeers.size) return;
      this.broadcastGameEvent('rift_state', { hostId: this.playerToken, id: rf.id, x: rf.x, z: rf.z, tier: rf.tier, lv: rf.lv, by: rf.by, wave: rf.wave, waves: rf.waves, phase: rf.phase, left: Math.max(0, Math.round((rf.ends - performance.now()) / 1000)), ids: rf.phase === 'wave' ? rf.ids : [] });
    },

    // visuals / messages for a wave (all clients)
    riftLocalWave(rf) {
      const c = _v.set(rf.x, 0, rf.z);
      if (rf.wave === 1) {
        if (this.epicCallout) this.epicCallout(`RIFT SURGE — TIER ${rf.tier}`, '#b266ff');
        this.addChatMessage && this.addChatMessage('Rift', `🌀 ${rf.by} tore open a Tier ${rf.tier} Rift Surge! Clear 3 waves in ${RIFT_TIME / 60} minutes.`, 'sys-boss');
      } else if (rf.wave === rf.waves) {
        if (this.epicCallout) this.epicCallout('RIFT GUARDIAN', '#ff5ad1');
      } else if (this.epicCallout) this.epicCallout(`WAVE ${rf.wave}`, '#b266ff');
      if (this.vfxShock) this.vfxShock(c, RIFT_R + 3, 4, 0xb266ff, 0x7fe3ff, { r0: 1, dur: 0.9 });
      if (this.vfxPillar) this.vfxPillar(c, 22, 2.4, 0xb266ff, 0xffffff, 0);
      if (this.audio && this.audio.playSpell) this.audio.playSpell('ult');
    },

    riftUpdate(dt) {
      const rf = this._rift;
      const ban = document.getElementById('rift-banner');
      if (!rf) { if (ban && ban.style.display !== 'none') ban.style.display = 'none'; return; }
      const left = Math.max(0, (rf.ends - performance.now()) / 1000);
      if (ban) {
        if (rf.phase === 'wave') {
          ban.style.display = 'block';
          const mm = Math.floor(left / 60), ss = String(Math.floor(left % 60)).padStart(2, '0');
          const key = `${rf.tier}|${rf.wave}|${mm}:${ss}`;
          if (ban._k !== key) { ban._k = key; ban.innerHTML = `🌀 RIFT SURGE · TIER ${rf.tier} · WAVE ${rf.wave}/${rf.waves}<br><span class="t ${left < 30 ? 'low' : ''}">${mm}:${ss}</span>`; }
        } else ban.style.display = 'none';
      }
      // a soft ring marks the rift
      if (!rf.ring && rf.phase === 'wave' && this.scene) {
        const g = new THREE.RingGeometry(RIFT_R + 3.5, RIFT_R + 4.2, 64); g.rotateX(-Math.PI / 2);
        rf.ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xb266ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        rf.ring.position.set(rf.x, 0.1, rf.z); this.scene.add(rf.ring);
      }
      if (rf.ring) rf.ring.material.opacity = 0.25 + 0.15 * Math.sin(performance.now() / 300);
      if (!rf.host || rf.phase !== 'wave') return;
      // host director
      const alive = rf.ids.filter(id => { const m = this.monsters.find(o => o.id === id); return m && !m.dead; });
      rf._chk = (rf._chk || 0) - dt;
      if (rf._chk <= 0) { rf._chk = 1; rf.ids.forEach(id => { const m = this.monsters.find(o => o.id === id); if (m && !m.dead) m.aggroTimer = Math.max(m.aggroTimer || 0, 10); }); }
      if (left <= 0) { this.riftEnd(false); return; }
      if (!alive.length && rf.ids.length) {
        if (rf.wave >= rf.waves) this.riftEnd(true);
        else { this.fortuneAdd(10); this.riftNextWave(); }
      }
    },

    riftEnd(won, fromNet) {
      const rf = this._rift; if (!rf) return;
      rf.phase = won ? 'done' : 'fail';
      if (rf.host) this.riftBroadcast();
      const left = Math.max(0, Math.round((rf.ends - performance.now()) / 1000));
      // clear leftovers
      if (!won) {
        for (let i = this.monsters.length - 1; i >= 0; i--) {
          const m = this.monsters[i];
          if (m.isRift && !m.dead) { if (this.vfxSparks) this.vfxSparks(_v.set(m.pos.x, 1, m.pos.z), 12, { cols: [0xb266ff, 0xffffff], speed: [2, 6], life: [0.3, 0.7], grav: -2, width: 0.05 }); this.removeMob(m, i); }
        }
      }
      if (rf.ring) { this.scene.remove(rf.ring); rf.ring.geometry.dispose(); rf.ring.material.dispose(); rf.ring = null; }
      this._riftCdUntil = performance.now() + 20000;
      const p = this.player, near = p && Math.hypot(p.pos.x - rf.x, p.pos.z - rf.z) < 90;
      if (won && near) this.riftReward(rf, left);
      else if (!won && near) {
        const gold = Math.round((p.level || 1) * 10 * rf.tier);
        this.spawnItemDrop(p.pos.clone(), null, gold, null);
        if (this.epicCallout) this.epicCallout('THE RIFT COLLAPSES', '#9fb3d9');
        this.addChatMessage && this.addChatMessage('Rift', `⌛ Time ran out — the Tier ${rf.tier} rift collapsed. A few coins remain (+${gold}).`, 'sys-synergy');
      }
      this._rift = null;
      this._rwTrk = 0.05;
    },

    riftReward(rf, left) {
      const p = this.player, R = this.rw(), T = rf.tier, L = Math.max(p.level || 1, rf.lv);
      this.rwSess().rifts++;
      const n = Math.min(6, 2 + Math.floor(T / 2) + (left >= 60 ? 1 : 0));
      const legChance = Math.min(0.5, 0.08 + 0.03 * T);
      for (let i = 0; i < n; i++) {
        const leg = i === 0 && Math.random() < legChance;
        const it = this.generateItem({ ilvl: L + (T >= 5 ? 1 : 0), minRarity: i === 0 ? (T >= 4 ? 'epic' : 'rare') : 'uncommon', rarity: leg ? 'legendary' : this.rollRarity(0.5 + T * 0.3), cls: i < 2 ? p.classId : undefined });
        this.spawnItemDrop(p.pos.clone(), it, i === 0 ? Math.round(L * 15 * T) : 0, null);
      }
      p.shards = (p.shards || 0) + 2 * T;
      if (M.mobXp) this.gainXP(Math.round(M.mobXp(L) * (3 + T)), true);
      const prev = R.riftTier || 1;
      if (T >= prev) R.riftTier = T + 1;
      R.riftBest = Math.max(R.riftBest || 0, T);
      if (this.slowMo) this.slowMo(0.35, 0.8);
      if (this.epicFlash) this.epicFlash(0.5, 420, '#b266ff');
      if (this.epicCallout) this.epicCallout(`RIFT CLEARED — TIER ${T}`, '#d7a6ff');
      if (this.vfxPillar) this.vfxPillar(_v.set(p.pos.x, 0, p.pos.z), 18, 2, 0xb266ff, 0xffffff, 0);
      if (this.audio && this.audio.playLootChime) this.audio.playLootChime();
      this.addChatMessage && this.addChatMessage('Rift', `🏆 Tier ${T} Rift cleared with ${left}s to spare! ${n} items burst out.${T >= prev ? ` Tier ${T + 1} unlocked.` : ''}`, 'sys-loot');
      this.fortuneAdd(20);
      this.bountyAdd('rift');
      this.saveMMOState && this.saveMMOState();
    },

    // rift monsters are built from their id, so every client agrees
    getMobById(id) {
      const mm = /^rift~([a-z_]+)~(\d+)~(\d+)~(\d)~(\d+)~(-?\d+)~(-?\d+)$/.exec(id || '');
      if (!mm) return orig.getMobById.apply(this, arguments);
      const ex = this.monsters.find(m => m.id === id);
      if (ex) return ex;
      const type = mm[1], lv = +mm[2], tier = +mm[3], e = +mm[4], serial = +mm[5], x = +mm[6], z = +mm[7];
      if (Math.hypot(this.player.pos.x - x, this.player.pos.z - z) > 220) return null;
      const base = this.addDisplayName ? this.addDisplayName(type) : type;
      const F = window.CR_FOES;
      let affixes = null, name = 'Rift ' + base;
      if (e >= 1 && F) {
        affixes = F.pickAffixes(serial, tier, e === 2 ? Math.max(12, lv) : lv);
        name = (e === 2 ? '☠ ' : '★ ') + affixes.map(a => F.AFFIX[a].tag).join(' ') + (e === 2 ? ' Rift Guardian' : ' Rift ' + base);
      }
      const m = this.createWorldMob(id, { type, name, level: lv, elite: e >= 1 }, x, z, null);
      if (!m) return m;
      m.isAdd = true; m.isRift = true; m.aggroTimer = 30;
      const k = 1 + 0.12 * (tier - 1);
      m.maxHp = Math.round(m.maxHp * k * (e === 2 ? 2.5 : 1)); m.hp = m.maxHp;
      m.dmg = Math.round(m.dmg * (1 + 0.06 * (tier - 1)));
      if (affixes) {
        m.affixes = affixes;
        m.foe = { cd: 2 + Math.random() * 2, st: null, guardDownT: 0, wardT: 0, sparkT: 0, splits: 0, textT: 0 };
        if (affixes.includes('hasted')) m.speed *= 1.3;
        if (this.foeDress) this.foeDress(m);
      }
      if (this.vfxPillar) this.vfxPillar(_v.set(x, 0, z), 6, 0.8, 0xb266ff, 0xffffff, Math.random() * 0.3);
      if (m.nameplateSprite && this.drawMobNameplate) this.drawMobNameplate(m);
      return m;
    },

    installNetBatch(ch) {
      if (orig.installNetBatch) orig.installNetBatch.apply(this, arguments);
      if (!ch || ch.__rewards) return;
      ch.__rewards = true;
      ch.on('broadcast', { event: 'rift_req' }, ({ payload }) => {
        if (!payload || this.channel !== ch || !this.isRoomHost) return;
        if (this._rift && this._rift.phase === 'wave') return;
        this.riftStart(payload);
      });
      ch.on('broadcast', { event: 'rift_state' }, ({ payload }) => {
        if (!payload || this.channel !== ch || payload.hostId === this.playerToken) return;
        const cur = this._rift;
        if (payload.phase === 'wave') {
          const isNewWave = !cur || cur.id !== payload.id || cur.wave !== payload.wave;
          const rf = (cur && cur.id === payload.id) ? cur : { id: payload.id, host: false, ids: [] };
          Object.assign(rf, { x: payload.x, z: payload.z, tier: payload.tier, lv: payload.lv, by: payload.by, wave: payload.wave, waves: payload.waves, phase: 'wave', ends: performance.now() + payload.left * 1000, ids: payload.ids || [] });
          this._rift = rf;
          (payload.ids || []).forEach(id => this.getMobById(id));
          if (isNewWave) this.riftLocalWave(rf);
        } else if (cur && cur.id === payload.id) {
          cur.ends = performance.now() + (payload.left || 0) * 1000;
          this.riftEnd(payload.phase === 'done', true);
        }
      });
    },

    // ---- per frame --------------------------------------------------------------------------------------
    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (!this.isInWorld || !this.mmoState) return;
      const R = this.rw();
      if (this._rwFrenzy > 0) this._rwFrenzy -= dt;
      if (this.styleRank && this.styleRank() >= 4) this.bountyAdd('style');
      try { this.riftUpdate(dt); } catch (e) { if (!this._riftErr) { this._riftErr = 1; console.warn('[rift]', e); } }
      // HUD
      const H = this.rwHud();
      if (H) {
        const pct = Math.floor(Math.min(99, R.fortune || 0));
        const key = pct + '|' + (this._rwFrenzy > 0 ? Math.ceil(this._rwFrenzy) : 0);
        if (H.last !== key) {
          H.last = key;
          H.fill.style.width = pct + '%';
          H.bar.classList.toggle('hot', pct >= 80);
          H.v.innerHTML = this._rwFrenzy > 0 ? `<span class="frz">FRENZY 2× XP ${Math.ceil(this._rwFrenzy)}s</span>` : `${pct}%`;
        }
      }
      // tracker refresh (throttled)
      this._rwTrk = (this._rwTrk === undefined ? 1 : this._rwTrk) - dt;
      if (this._rwTrk <= 0) { this._rwTrk = 1; this.updateStoryTrackerUI && this.updateStoryTrackerUI(); }
    }
  });

  if (GP.teachAddTips) {
    GP.teachAddTips({
      fortune: { desk: 'Every kill fills the gold <b>FORTUNE</b> bar under your HP. At 100% a <b>JACKPOT</b> bursts open, and each jackpot this session pays more. Press <b>Y</b> to open a <b>Rift Surge</b>.', touch: 'Every kill fills the gold <b>FORTUNE</b> bar under your HP. At 100% a <b>JACKPOT</b> bursts open, and each jackpot this session pays more. Open a <b>Rift Surge</b> from the quest tracker.' }
    });
  }

  window.CR_REWARDS = { JACKPOT, FILL, BOUNTY_KINDS };
})();
