/* =============================================================================
 * Chrono-Rift — reasons to come back tomorrow (retention phase 3)
 *
 *  • LYRA'S SUPPLY CACHE, a 7-day login track: one step per day played (missing a day never
 *    resets it). Rewards climb from gold and potions to a guaranteed Legendary on day 7, then the
 *    week repeats. The card opens by itself once a day (after the opening), and the quest
 *    tracker always shows today's claim or tomorrow's reward.
 *  • DAILY BOUNTY CHEST: finish 3 bounties in a day for a bonus chest. Days in a row build a
 *    streak; each streak day adds Rift shards (up to 7).
 *  Progress is per player (not per hero) in localStorage `cr_daily_v1`; portal builds mirror
 *  every cr_* key to the CrazyGames Data module, so it follows the player's account.
 * ============================================================================= */
(function () {
  'use strict';
  if (typeof ChronoRiftCoOpGame === 'undefined') return;
  const GP = ChronoRiftCoOpGame.prototype;
  const KEY = 'cr_daily_v1';
  const CHEST_BOUNTIES = 3;

  const dayKey = (d) => { d = d || new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
  const load = () => { try { return Object.assign({ step: 0, claimed: '', shown: '', bDay: '', bCount: 0, chestDay: '', streak: 0 }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { step: 0, claimed: '', shown: '', bDay: '', bCount: 0, chestDay: '', streak: 0 }; } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ } };

  // the week's rewards (scaled by level where it matters)
  const DAYS = [
    { icon: '💰', name: 'Gold & Potions', give(g, L) { const n = 100 + L * 20; g.player.gold += n; g.player.potions = (g.player.potions || 0) + 3; return `+${n} gold · +3 potions`; } },
    { icon: '🗡️', name: 'Rare Gear', give(g, L) { return g.dlyItem('rare', L); } },
    { icon: '🌀', name: 'Free Rift Pull', give(g) { g.grantFreeRiftPull ? g.grantFreeRiftPull('Supply Cache') : (g.sigilAdd && g.sigilAdd(1, 'Supply Cache')); return '+1 free Rift Cache pull'; } },
    { icon: '💠', name: 'Rift Shards', give(g, L) { const n = 150 + L * 25; g.player.shards = (g.player.shards || 0) + 10; g.player.gold += n; return `+10 shards · +${n} gold`; } },
    { icon: '🟣', name: 'Epic Gear', give(g, L) { return g.dlyItem('epic', L); } },
    { icon: '🌀', name: '2 Free Pulls', give(g) { for (let i = 0; i < 2; i++) { if (g.grantFreeRiftPull) g.grantFreeRiftPull(i ? null : 'Supply Cache'); else if (g.sigilAdd) g.sigilAdd(1, 'Supply Cache'); } return '+2 free Rift Cache pulls'; } },
    { icon: '🟠', name: 'LEGENDARY', give(g, L) { return g.dlyItem('legendary', L + 1); } }
  ];

  const CSS = `
  #cr-daily { position: fixed; inset: 0; z-index: 4200; display: none; align-items: center; justify-content: center; background: rgba(6,8,14,.62); backdrop-filter: blur(3px); }
  #cr-daily.on { display: flex; animation: crDlyIn .35s ease; }
  @keyframes crDlyIn { from { opacity: 0; } }
  #cr-daily .card { width: min(560px, calc(100vw - 28px)); padding: 18px 18px 16px; border-radius: 18px; color: #F5F2EB; text-align: center;
    background: linear-gradient(180deg, rgba(28,22,44,.97), rgba(14,14,24,.97)); border: 1px solid rgba(255,213,107,.6);
    box-shadow: 0 18px 50px rgba(0,0,0,.6), 0 0 34px rgba(255,200,90,.22); font-family: 'Plus Jakarta Sans', Inter, sans-serif; }
  #cr-daily .k { font: 800 11px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .32em; color: #ffd56b; }
  #cr-daily h3 { margin: 4px 0 2px; font: 900 22px 'Cinzel', serif; letter-spacing: .08em; }
  #cr-daily .sub { font-size: 12.5px; color: rgba(245,242,235,.75); margin-bottom: 12px; }
  #cr-daily .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 7px; }
  #cr-daily .d { position: relative; padding: 8px 2px 7px; border-radius: 11px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); }
  #cr-daily .d .n { font: 800 9.5px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .12em; color: rgba(245,242,235,.6); }
  #cr-daily .d .i { font-size: 22px; line-height: 1.5; }
  #cr-daily .d .t { font: 700 9.5px/1.2 'Plus Jakarta Sans', Inter, sans-serif; color: rgba(245,242,235,.85); }
  #cr-daily .d.got { opacity: .45; }
  #cr-daily .d.got::after { content: '✓'; position: absolute; top: 3px; right: 6px; font: 900 12px Inter, sans-serif; color: #5be39b; }
  #cr-daily .d.now { border-color: #ffd56b; background: rgba(255,213,107,.14); box-shadow: 0 0 18px rgba(255,213,107,.35); animation: crDlyPulse 1.4s ease-in-out infinite; }
  #cr-daily .d.next { border-color: rgba(127,227,255,.7); }
  #cr-daily .d.next .n { color: #7fe3ff; }
  #cr-daily .d.big .t { color: #ff9a2e; }
  @keyframes crDlyPulse { 50% { box-shadow: 0 0 28px rgba(255,213,107,.6); } }
  #cr-daily .msg { min-height: 18px; margin-top: 12px; font: 700 13px 'Plus Jakarta Sans', Inter, sans-serif; color: #5be39b; }
  #cr-daily .btns { margin-top: 10px; display: flex; gap: 10px; justify-content: center; }
  #cr-daily button { all: unset; cursor: pointer; padding: 11px 26px; border-radius: 999px; font: 900 13px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .14em; touch-action: manipulation; }
  #cr-daily .claim { color: #1a1406; background: linear-gradient(180deg, #ffe7a3, #ffc94a); box-shadow: 0 6px 18px rgba(255,200,90,.35); }
  #cr-daily .close { color: #F5F2EB; border: 1px solid rgba(255,255,255,.3); }
  @media (max-width: 520px) {
    #cr-daily .days { grid-template-columns: repeat(4, 1fr); }
    #cr-daily h3 { font-size: 18px; }
  }
  .cr-daily-trk { margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(243,200,107,.18); font: 600 11px/1.4 'Plus Jakarta Sans', Inter, sans-serif; color: #e9e4d8; }
  .cr-daily-trk .ready { color: #ffd56b; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; pointer-events: auto; }
  .cr-daily-trk .nx { color: #7fe3ff; }
  `;

  const orig = { updateMMOWorld: GP.updateMMOWorld, bountyPay: GP.bountyPay, updateStoryTrackerUI: GP.updateStoryTrackerUI };

  Object.assign(GP, {
    dlyState() { return this._dly || (this._dly = load()); },
    dlySave() { save(this.dlyState()); },
    dlyClaimable() { return this.dlyState().claimed !== dayKey(); },

    dlyItem(rarity, L) {
      const p = this.player;
      const it = this.generateItem({ ilvl: Math.max(2, L), rarity, minRarity: rarity, cls: p.classId });
      it.req = Math.min(it.req || 1, p.level || 1);
      this.pickupItem(it);
      return `${it.name}`;
    },

    // not during the prologue / opening, a cutscene, a menu or a fight
    dlyEligible() {
      if (!this.isInWorld || this.cutsceneActive || this.isAnyModalOpen || this._op || this._opOutro || !this.player || this.player.dead) return false;
      const b = document.body.classList;
      if (b.contains('cr-prologue') || b.contains('cr-lyra-call') || b.contains('cr-acct-on') || b.contains('cr-title-on')) return false;
      if (window.CR_ACCOUNT && CR_ACCOUNT.playing && CR_ACCOUNT.playing.prologue) return false;
      const st = this.mmoState && this.mmoState.opening;
      if (st && st.stage && st.stage < 7 && !(st.stage === 4 && (this.player.level || 1) > 5)) return false;
      const p = this.player.pos;
      if ((this.monsters || []).some(m => !m.dead && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < 16)) return false;
      return true;
    },

    dlyUi() {
      let el = document.getElementById('cr-daily');
      if (el) return el;
      const st = document.createElement('style'); st.id = 'cr-daily-css'; st.textContent = CSS; document.head.appendChild(st);
      el = document.createElement('div'); el.id = 'cr-daily';
      el.innerHTML = '<div class="card"><div class="k">DAILY</div><h3>LYRA\'S SUPPLY CACHE</h3><div class="sub"></div><div class="days"></div><div class="msg"></div><div class="btns"></div></div>';
      document.body.appendChild(el);
      ['pointerdown', 'keydown', 'wheel'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const b = e.target.closest('button');
        if (b && b.dataset.a === 'claim') this.dlyClaim();
        else if ((b && b.dataset.a === 'close') || e.target === el) this.dlyClose();
      });
      return el;
    },

    dlyRender(msg) {
      const S = this.dlyState(), el = this.dlyUi();
      const can = this.dlyClaimable();
      const week = Math.floor((can ? S.step : S.step - 1) / 7);
      const cur = can ? S.step % 7 : (S.step - 1) % 7;          // today's tile
      el.querySelector('.sub').textContent = can
        ? `Day ${S.step + 1}${week ? ` · Week ${week + 1}` : ''} · one reward for every day you play`
        : `Claimed! Come back tomorrow for ${DAYS[S.step % 7].icon} ${DAYS[S.step % 7].name}`;
      const nextIdx = can ? cur + 1 : (cur + 1) % 7;               // 7 = none (today is day 7)
      el.querySelector('.days').innerHTML = DAYS.map((d, i) => {
        const got = (i < cur || (!can && i === cur)) && !(!can && i === nextIdx);
        const cls = ['d', got ? 'got' : '', can && i === cur ? 'now' : '', i === nextIdx ? 'next' : '', i === 6 ? 'big' : ''].join(' ');
        const lbl = can && i === cur ? 'TODAY' : (i === nextIdx ? 'TOMORROW' : `DAY ${i + 1}`);
        return `<div class="${cls}"><div class="n">${lbl}</div><div class="i">${d.icon}</div><div class="t">${d.name}</div></div>`;
      }).join('');
      el.querySelector('.msg').textContent = msg || '';
      el.querySelector('.btns').innerHTML = can
        ? '<button data-a="claim" class="claim">CLAIM</button>'
        : '<button data-a="close" class="close">SEE YOU TOMORROW</button>';
    },

    dlyOpen(opts) {
      this._dlyAfter = (opts && opts.after) || null;
      const S = this.dlyState(); S.shown = dayKey(); this.dlySave();
      this.dlyRender();
      this.dlyUi().classList.add('on');
      if (this.audio && this.audio.playUI) this.audio.playUI('open');
    },

    dlyClose() {
      const el = document.getElementById('cr-daily');
      if (el) el.classList.remove('on');
      const f = this._dlyAfter; this._dlyAfter = null;
      if (f) setTimeout(f, 300);
    },

    dlyClaim() {
      if (!this.dlyClaimable()) return;
      const S = this.dlyState(), d = DAYS[S.step % 7], L = (this.player && this.player.level) || 1;
      let got = '';
      try { got = d.give(this, L); } catch (e) { console.warn('[daily]', e); }
      S.step++; S.claimed = dayKey(); this.dlySave();
      this.saveMMOState && this.saveMMOState();
      this.updateUI && this.updateUI();
      const p = this.player;
      if (this.vfxPillar && p) this.vfxPillar(p.pos.clone(), 12, 1.4, 0xffd56b, 0xffffff, 0);
      if (this.audio && this.audio.playLootChime) this.audio.playLootChime();
      if (this.haptic) this.haptic([16, 30, 40]);
      if (S.step % 7 === 0 && window.CR_HAPPY) window.CR_HAPPY();
      this.dlyRender(`${d.icon} ${got}`);
      this._rwTrk = 0.05;
    },

    // ---- daily bounty chest + streak --------------------------------------------------------------
    bountyPay(b) {
      const r = orig.bountyPay ? orig.bountyPay.apply(this, arguments) : undefined;
      try {
        const S = this.dlyState(), today = dayKey();
        if (S.bDay !== today) { S.bDay = today; S.bCount = 0; }
        S.bCount++;
        if (S.bCount >= CHEST_BOUNTIES && S.chestDay !== today) {
          S.streak = S.chestDay === yesterday() ? (S.streak || 0) + 1 : 1;
          S.chestDay = today;
          const p = this.player, L = p.level || 1, extra = Math.min(7, S.streak);
          const it = this.generateItem({ ilvl: L + 1, minRarity: 'epic', rarity: 'epic', cls: p.classId });
          this.spawnItemDrop ? this.spawnItemDrop(p.pos.clone(), it, Math.round(L * 20), null) : this.pickupItem(it);
          p.shards = (p.shards || 0) + 2 + extra;
          if (this.epicCallout) this.epicCallout(S.streak > 1 ? `DAILY CHEST · ${S.streak}-DAY STREAK!` : 'DAILY CHEST!', '#ffd56b');
          this.addChatMessage && this.addChatMessage('Daily', `☀️ Daily bounty chest! Epic gear + ${2 + extra} shards. Streak: ${S.streak} day${S.streak > 1 ? 's' : ''}. Come back tomorrow to keep it going.`, 'sys-loot');
        }
        this.dlySave();
      } catch (e) { console.warn('[daily]', e); }
      return r;
    },

    // ---- quest tracker lines -----------------------------------------------------------------------
    updateStoryTrackerUI() {
      const r = orig.updateStoryTrackerUI ? orig.updateStoryTrackerUI.apply(this, arguments) : undefined;
      const body = document.getElementById('story-tracker-body');
      if (!body || !this.mmoState) return r;
      const S = this.dlyState(), today = dayKey();
      const can = this.dlyClaimable();
      const nx = DAYS[S.step % 7];
      const bc = S.bDay === today ? S.bCount : 0;
      const chestDone = S.chestDay === today;
      const div = document.createElement('div'); div.className = 'cr-daily-trk';
      div.innerHTML = (can
        ? `<div class="ready" data-dly="1">🎁 Daily reward ready: Day ${S.step + 1}, ${nx.icon} ${nx.name}</div>`
        : `<div>🎁 <span class="nx">Tomorrow: ${nx.icon} ${nx.name}</span> (day ${S.step + 1})</div>`) +
        `<div>☀️ Daily chest: ${chestDone ? '✅ claimed' : `${Math.min(bc, CHEST_BOUNTIES)}/${CHEST_BOUNTIES} bounties`}${S.streak && (chestDone || S.chestDay === yesterday()) ? ` · 🔥 ${S.streak}-day streak` : ''}</div>`;
      const ready = div.querySelector('[data-dly]');
      if (ready) ready.addEventListener('click', (e) => { e.stopPropagation(); this.dlyOpen(); });
      body.appendChild(div);
      return r;
    },

    // ---- opens itself once a day ----------------------------------------------------------------------
    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      this._dlyT = (this._dlyT || 0) + dt;
      if (this._dlyT < 1) return;
      this._dlyT = 0;
      const S = this.dlyState();
      if (S.shown === dayKey() || !this.dlyClaimable()) { this._dlyCalm = 0; return; }
      if (!this.dlyEligible()) { this._dlyCalm = 0; return; }
      this._dlyCalm = (this._dlyCalm || 0) + 1;
      if (this._dlyCalm >= 3) this.dlyOpen();                             // a few calm seconds in the world first
    }
  });

  window.CR_DAILY = { DAYS, dayKey };
})();
