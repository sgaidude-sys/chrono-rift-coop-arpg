/* =============================================================================
 * Chrono-Rift — RIFT CACHE (gacha, no real money)
 *
 *  Open with the 💎 button (top right) or U.
 *  • Pay with RIFT SIGILS (earned: daily free pull, jackpots, bounty boards, rift
 *    clears, daily first win; 10 to start) or CHRONO-SHARDS (10 per pull, 90 for ten).
 *  • Odds: ★3 79% · ★4 18% · ★5 3%. A ★4 or better is guaranteed every 10 pulls.
 *    ★5 odds climb from pull 45 and a ★5 is guaranteed by pull 60.
 *  • Weekly banner: one featured legendary power. A ★5 is the featured legendary
 *    50% of the time; lose the 50/50 and the next ★5 is guaranteed featured.
 *  • Rewards: gear, gold, potions, Fortune charms, and cosmetics — weapon TRAIL
 *    DYES, hero AURAS and TITLES (equip them in the Collection tab; partners see
 *    them). Duplicate cosmetics turn into shards.
 *  • Pull show: a crystal glows in the colour of the best result, shakes, cracks,
 *    and the cards flip one by one (★5 cards get a flash and slow-mo).
 * ============================================================================= */
(function () {
  'use strict';
  const GP = ChronoRiftCoOpGame.prototype;
  const M = window.MMO;

  const COST1 = 10, COST10 = 90, START_SIGILS = 10;
  const RATE5 = 0.03, SOFT5 = 45, HARD5 = 60, PITY4 = 10, RATE4 = 0.18;
  const STAR_COL = { 3: '#5aa9ff', 4: '#c07bff', 5: '#ffcf5a' };

  const COS = {
    // trail dyes
    tr_solar: { kind: 'trail', star: 4, name: 'Solar Trail', col: 0xffd56b, icon: '☀️' },
    tr_void: { kind: 'trail', star: 4, name: 'Void Trail', col: 0x7a3cff, icon: '🌌' },
    tr_frost: { kind: 'trail', star: 4, name: 'Frost Trail', col: 0x7fe3ff, icon: '❄️' },
    tr_sakura: { kind: 'trail', star: 4, name: 'Sakura Trail', col: 0xff8ad8, icon: '🌸' },
    tr_verdant: { kind: 'trail', star: 4, name: 'Verdant Trail', col: 0x5be39b, icon: '🍃' },
    tr_prism: { kind: 'trail', star: 5, name: 'Prismatic Trail', col: -1, icon: '🌈' },
    tr_abyss: { kind: 'trail', star: 5, name: 'Abyssal Trail', col: 0xff2244, icon: '🩸' },
    // auras
    au_fireflies: { kind: 'aura', star: 4, name: 'Firefly Aura', icon: '✨', c: [0xd8ff6b, 0xfff6a0], at: 'orbit', grav: -0.4, sp: [0.2, 0.6], life: [0.8, 1.4] },
    au_snow: { kind: 'aura', star: 4, name: 'Snowfall Aura', icon: '🌨️', c: [0xffffff, 0xcfefff], at: 'above', grav: 2, sp: [0.1, 0.4], life: [0.9, 1.4] },
    au_embers: { kind: 'aura', star: 4, name: 'Ember Aura', icon: '🔥', c: [0xff7a2e, 0xffd56b], at: 'feet', grav: -3, sp: [0.4, 1.2], life: [0.6, 1.0] },
    au_petals: { kind: 'aura', star: 4, name: 'Petal Aura', icon: '🌺', c: [0xff9ad8, 0xffd1ec], at: 'above', grav: 1.4, sp: [0.3, 0.8], life: [0.9, 1.4] },
    au_stardust: { kind: 'aura', star: 5, name: 'Stardust Aura', icon: '💫', c: [0xffd56b, 0x9fd8ff, 0xff9ad8, 0xffffff], at: 'orbit', grav: -0.8, sp: [0.3, 1.0], life: [0.7, 1.2] },
    au_voidwisp: { kind: 'aura', star: 5, name: 'Voidwisp Aura', icon: '🕳️', c: [0x7a3cff, 0x2a0a55, 0xd7a6ff], at: 'body', grav: -1.5, sp: [0.4, 1.0], life: [0.6, 1.1] },
    // titles
    ti_walker: { kind: 'title', star: 4, name: 'Rift Walker', icon: '🏷️' },
    ti_jackpot: { kind: 'title', star: 4, name: 'Jackpot Junkie', icon: '🏷️' },
    ti_dadofwar: { kind: 'title', star: 4, name: 'Dad of War', icon: '🏷️' },
    ti_weekend: { kind: 'title', star: 4, name: 'Weekend Warrior', icon: '🏷️' },
    ti_sovereign: { kind: 'title', star: 5, name: 'Chrono Sovereign', icon: '👑' },
    ti_unbroken: { kind: 'title', star: 5, name: 'The Unbroken', icon: '👑' }
  };
  const cosOf = (star, kind) => Object.keys(COS).filter(k => COS[k].star === star && (!kind || COS[k].kind === kind));

  const POWERS = () => (window.CR_LEGEND && window.CR_LEGEND.POWERS) || {};
  function weekNo() { return Math.floor((Date.now() / 86400000 + 3) / 7); }            // weeks since epoch (Mon-ish)
  function featured() { const ks = Object.keys(POWERS()); return ks.length ? ks[weekNo() % ks.length] : null; }
  function weekLeft() { const ms = (weekNo() + 1) * 7 * 86400000 - 3 * 86400000 - Date.now(); return Math.max(0, ms); }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const _v = new THREE.Vector3(), _c = new THREE.Color();

  const css = `
  #gacha-modal .modal-box { max-width: 760px; width: min(96vw, 760px); padding: 18px 20px; background: radial-gradient(120% 90% at 50% 0%, rgba(70,30,120,.55), rgba(10,12,24,.96) 60%); }
  #gacha-modal h2 { font: 700 19px 'Cinzel', serif; letter-spacing: 3px; margin: 0; color: #f3e3ff; }
  #gacha-modal .gc-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
  #gacha-modal .gc-cur { display: flex; gap: 10px; font: 800 13px 'JetBrains Mono', monospace; color: #fff; }
  #gacha-modal .gc-cur span { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 999px; padding: 4px 10px; }
  #gacha-modal .gc-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
  #gacha-modal .gc-tabs button, #gacha-modal .gc-btn { all: unset; cursor: pointer; padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18); font: 700 12px 'Plus Jakarta Sans', Inter, sans-serif; color: #dcd3f0; }
  #gacha-modal .gc-tabs button.on { background: rgba(178,102,255,.25); border-color: #c07bff; color: #fff; }
  #gacha-modal .gc-banner { border-radius: 14px; padding: 14px 16px; border: 1px solid rgba(255,207,90,.45); background: linear-gradient(120deg, rgba(255,154,46,.16), rgba(178,102,255,.18)); position: relative; overflow: hidden; }
  #gacha-modal .gc-banner::after { content: ''; position: absolute; inset: -40% auto -40% -30%; width: 30%; background: linear-gradient(100deg, transparent, rgba(255,255,255,.18), transparent); transform: rotate(12deg); animation: gcSweep 3.5s ease-in-out infinite; }
  @keyframes gcSweep { 0% { left: -30%; } 60%, 100% { left: 130%; } }
  #gacha-modal .gc-banner .t { font: 800 10px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 2.5px; color: #ffcf5a; }
  #gacha-modal .gc-banner .n { font: 700 22px 'Cinzel', serif; color: #fff; margin: 2px 0 4px; text-shadow: 0 0 18px rgba(255,154,46,.6); }
  #gacha-modal .gc-banner .d { font: 500 12.5px/1.4 'Plus Jakarta Sans', Inter, sans-serif; color: #f3e6d6; max-width: 520px; }
  #gacha-modal .gc-banner .w { font: 600 11px Inter, sans-serif; color: rgba(255,255,255,.55); margin-top: 6px; }
  #gacha-modal .gc-pity { margin: 12px 0; font: 600 12px 'Plus Jakarta Sans', Inter, sans-serif; color: #e6dcf5; }
  #gacha-modal .gc-pity .bar { height: 8px; border-radius: 6px; background: rgba(255,255,255,.08); overflow: hidden; margin-top: 5px; }
  #gacha-modal .gc-pity .bar i { display: block; height: 100%; background: linear-gradient(90deg, #c07bff, #ffcf5a); box-shadow: 0 0 10px rgba(255,207,90,.6); }
  #gacha-modal .gc-pulls { display: flex; gap: 10px; flex-wrap: wrap; }
  #gacha-modal .gc-pull { all: unset; cursor: pointer; flex: 1 1 180px; text-align: center; padding: 12px 10px; border-radius: 12px; font: 800 14px 'Plus Jakarta Sans', Inter, sans-serif; color: #1a1030;
    background: linear-gradient(180deg, #ffe39a, #ffb84a); box-shadow: 0 4px 18px rgba(255,184,74,.35); }
  #gacha-modal .gc-pull small { display: block; font: 700 11px Inter, sans-serif; opacity: .75; margin-top: 2px; }
  #gacha-modal .gc-pull.free { background: linear-gradient(180deg, #a6ffcf, #3fd98a); box-shadow: 0 4px 18px rgba(63,217,138,.35); }
  #gacha-modal .gc-pull.off { filter: grayscale(.8) brightness(.6); cursor: default; }
  #gacha-modal .gc-note { font: 500 11px/1.45 Inter, sans-serif; color: rgba(230,220,245,.6); margin-top: 10px; }
  #gacha-modal .gc-coll { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; max-height: 52vh; overflow: auto; }
  #gacha-modal .gc-ci { border-radius: 10px; padding: 8px 10px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); font: 600 12px 'Plus Jakarta Sans', Inter, sans-serif; color: #eee; }
  #gacha-modal .gc-ci.lock { opacity: .35; }
  #gacha-modal .gc-ci.on { border-color: #ffcf5a; box-shadow: 0 0 10px rgba(255,207,90,.35); }
  #gacha-modal .gc-ci .k { font-size: 10px; color: rgba(255,255,255,.5); letter-spacing: 1px; text-transform: uppercase; }
  #gacha-modal .gc-ci button { all: unset; cursor: pointer; margin-top: 5px; font: 700 11px Inter, sans-serif; color: #ffcf5a; }
  /* pull stage */
  #gacha-stage { position: fixed; inset: 0; z-index: 2000; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 18px;
    background: radial-gradient(60% 60% at 50% 45%, rgba(60,20,110,.92), rgba(4,4,12,.97)); }
  #gacha-stage.on { display: flex; }
  #gacha-stage .crystal { width: 120px; height: 170px; clip-path: polygon(50% 0, 100% 35%, 80% 100%, 20% 100%, 0 35%); background: linear-gradient(160deg, #fff, var(--gc, #5aa9ff) 45%, #120a2a);
    box-shadow: 0 0 60px var(--gc); filter: drop-shadow(0 0 30px var(--gc)); animation: gcFloat 1.6s ease-in-out infinite; }
  #gacha-stage .crystal.shake { animation: gcShake .09s linear infinite; }
  #gacha-stage .crystal.crack { animation: gcCrack .35s ease-out forwards; }
  @keyframes gcFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
  @keyframes gcShake { 0% { transform: translate(-3px,1px) rotate(-2deg); } 50% { transform: translate(3px,-1px) rotate(2deg); } 100% { transform: translate(-2px,2px) rotate(-1deg); } }
  @keyframes gcCrack { to { transform: scale(2.4); opacity: 0; filter: brightness(3) drop-shadow(0 0 60px var(--gc)); } }
  #gacha-stage .flash { position: fixed; inset: 0; background: var(--gc); opacity: 0; pointer-events: none; }
  #gacha-stage .flash.go { animation: gcFlash .6s ease-out; }
  @keyframes gcFlash { 0% { opacity: .85; } 100% { opacity: 0; } }
  #gacha-stage .cards { display: grid; grid-template-columns: repeat(5, minmax(0, 132px)); gap: 10px; max-width: 96vw; }
  #gacha-stage .cards.one { grid-template-columns: minmax(0, 220px); }
  #gacha-stage .card { perspective: 600px; height: 168px; }
  #gacha-stage .cards.one .card { height: 260px; }
  #gacha-stage .card .in { position: relative; width: 100%; height: 100%; transition: transform .45s; transform-style: preserve-3d; }
  #gacha-stage .card.flip .in { transform: rotateY(180deg); }
  #gacha-stage .card .f, #gacha-stage .card .b { position: absolute; inset: 0; backface-visibility: hidden; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 8px; }
  #gacha-stage .card .f { background: linear-gradient(160deg, #241446, #0d0820); border: 1px solid rgba(255,255,255,.15); font: 700 26px Cinzel, serif; color: rgba(255,255,255,.25); }
  #gacha-stage .card .b { transform: rotateY(180deg); background: linear-gradient(170deg, rgba(255,255,255,.08), rgba(0,0,0,.4)), #120c24; border: 2px solid var(--sc); box-shadow: 0 0 18px var(--sc), inset 0 0 22px var(--sc); color: #fff; }
  #gacha-stage .card .b .ic { font-size: 34px; }
  #gacha-stage .cards.one .card .b .ic { font-size: 54px; }
  #gacha-stage .card .b .st { color: var(--sc); font-size: 13px; letter-spacing: 2px; margin-top: 4px; }
  #gacha-stage .card .b .nm { font: 700 12px/1.25 'Plus Jakarta Sans', Inter, sans-serif; margin-top: 4px; }
  #gacha-stage .cards.one .card .b .nm { font-size: 15px; }
  #gacha-stage .card .b .sub { font: 500 10.5px/1.3 Inter, sans-serif; color: rgba(255,255,255,.65); margin-top: 3px; }
  #gacha-stage .card .b .new { position: absolute; top: 6px; right: 8px; font: 800 9px Inter, sans-serif; color: #1a1030; background: #5be39b; border-radius: 6px; padding: 1px 5px; }
  #gacha-stage .card.s5 .b { animation: gcGold 1s ease-in-out infinite alternate; }
  @keyframes gcGold { from { box-shadow: 0 0 18px var(--sc), inset 0 0 22px var(--sc); } to { box-shadow: 0 0 42px var(--sc), inset 0 0 36px var(--sc); } }
  #gacha-stage .acts { display: flex; gap: 10px; }
  #gacha-stage .acts button { all: unset; cursor: pointer; padding: 9px 18px; border-radius: 999px; font: 800 13px 'Plus Jakarta Sans', Inter, sans-serif; color: #1a1030; background: linear-gradient(180deg, #ffe39a, #ffb84a); }
  #gacha-stage .acts button.ghost { background: rgba(255,255,255,.1); color: #fff; border: 1px solid rgba(255,255,255,.25); }
  @media (max-width: 640px) { #gacha-stage .cards { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; } #gacha-stage .card { height: 116px; } #gacha-stage .card .b .ic { font-size: 22px; } #gacha-stage .card .b .nm { font-size: 9.5px; } #gacha-stage .card .b .sub { display: none; } }
  #ui-ident .ttl { font: 700 10px 'Plus Jakarta Sans', Inter, sans-serif; color: #ffcf5a; letter-spacing: 1px; margin-top: 1px; text-shadow: 0 0 8px rgba(255,207,90,.5); }
  `;

  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, updateWeaponTrails: GP.updateWeaponTrails,
    buildPlayerStatePayload: GP.buildPlayerStatePayload, handleRemotePlayerState: GP.handleRemotePlayerState,
    jackpot: GP.jackpot, bountyBoard: GP.bountyBoard, riftReward: GP.riftReward, grantKillRewards: GP.grantKillRewards
  };

  Object.assign(GP, {
    gc() {
      const st = this.mmoState; if (!st) return null;
      if (!st.gacha) st.gacha = { sigils: START_SIGILS, p5: 0, p4: 0, guar: false, free: '', pulls: 0, own: [], trail: '', aura: '', title: '', log: [] };
      return st.gacha;
    },

    sigilAdd(n, why) {
      const G = this.gc(); if (!G || n <= 0) return;
      G.sigils += n;
      if (why) this.showLootToast && this.showLootToast(`💎 +${n} Rift Sigil${n > 1 ? 's' : ''} (${why}) — press U to pull`);
      this.gcBadge();
    },

    // earn sigils from the reward loop
    jackpot() { const r = orig.jackpot ? orig.jackpot.apply(this, arguments) : undefined; this.sigilAdd(1, 'jackpot'); return r; },
    bountyBoard() { const r = orig.bountyBoard ? orig.bountyBoard.apply(this, arguments) : undefined; this.sigilAdd(2, 'bounty board'); return r; },
    grantKillRewards(mob, fromNetwork) {
      const R = this.mmoState && this.mmoState.rw, d0 = R ? R.daily : null;
      const r = orig.grantKillRewards.apply(this, arguments);
      if (R && R.daily !== d0) this.sigilAdd(1, 'daily first win');
      return r;
    },
    riftReward(rf) { const r = orig.riftReward ? orig.riftReward.apply(this, arguments) : undefined; this.sigilAdd(1 + Math.floor(((rf && rf.tier) || 1) / 3), 'rift cleared'); return r; },

    initMMOWorld() {
      const r = orig.initMMOWorld ? orig.initMMOWorld.apply(this, arguments) : undefined;
      if (!document.getElementById('cr-gacha-css')) {
        const s = document.createElement('style'); s.id = 'cr-gacha-css'; s.textContent = css; document.head.appendChild(s);
      }
      if (!document.getElementById('gacha-modal')) {
        const m = document.createElement('div'); m.id = 'gacha-modal'; m.className = 'modal-backdrop';
        m.innerHTML = '<div class="modal-box"><div class="gc-head"><h2>💎 Rift Cache</h2><div class="gc-cur"></div><button class="mini-btn" data-close>✕ Close</button></div><div class="gc-tabs"><button data-tab="banner" class="on">Banner</button><button data-tab="coll">Collection</button><button data-tab="odds">Odds</button></div><div class="gc-body"></div></div>';
        document.body.appendChild(m);
        m.querySelector('[data-close]').onclick = () => this.closeModals();
        m.addEventListener('click', (e) => {
          const t = e.target.closest('[data-tab]');
          if (t) { this._gcTab = t.dataset.tab; this.gcRender(); return; }
          const pb = e.target.closest('[data-pull]');
          if (pb && !pb.classList.contains('off')) { this.gcPull(pb.dataset.pull); return; }
          const wb = e.target.closest('[data-wing]');
          if (wb) { const G = this.gc(); G.wing = wb.dataset.wing; this.saveMMOState && this.saveMMOState(); this.gcRender(); this.broadcastPlayerState && this.broadcastPlayerState(false); return; }
          const eqb = e.target.closest('[data-equip]');
          if (eqb) { this.gcEquip(eqb.dataset.equip); return; }
        });
      }
      if (!document.getElementById('gacha-stage')) {
        const s = document.createElement('div'); s.id = 'gacha-stage';
        document.body.appendChild(s);
      }
      if (!this._gcKeys) {
        this._gcKeys = true;
        window.addEventListener('keydown', (e) => {
          const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
          if ((e.key === 'u' || e.key === 'U') && !e.repeat && this.isInWorld) {
            if (document.getElementById('gacha-modal').classList.contains('active')) this.closeModals();
            else if (!this.isAnyModalOpen) this.openGacha();
          }
        });
      }
      return r;
    },

    gcQuickBtn() {
      const q = document.getElementById('ui-quick');
      if (!q || q.querySelector('[data-a="gacha"]')) return;
      const b = document.createElement('button');
      b.dataset.a = 'gacha'; b.dataset.tip = 'Rift Cache [U]'; b.setAttribute('aria-label', 'Rift Cache');
      b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2.5l6.5 6-6.5 13-6.5-13z"/><path d="M5.5 8.5h13M12 2.5l-2.5 6L12 21.5l2.5-13z"/></svg><span class="badge"></span>';
      b.addEventListener('click', (e) => { e.stopPropagation(); if (this.audio) this.audio.init(); this.openGacha(); });
      const sep = q.querySelector('.sep');
      q.insertBefore(b, sep || null);
      this.gcBadge();
    },

    gcBadge() {
      const b = document.querySelector('#ui-quick [data-a="gacha"]'); const G = this.gc && this.gc();
      if (b && G) b.classList.toggle('has', G.free !== today() || G.sigils > 0);
    },

    openGacha() { this.gc(); this._gcTab = this._gcTab || 'banner'; this.gcRender(); this.openModal('gacha-modal'); },

    gcRender() {
      const G = this.gc(); const m = document.getElementById('gacha-modal'); if (!G || !m) return;
      const p = this.player;
      m.querySelector('.gc-cur').innerHTML = `<span>💎 ${G.sigils} sigils</span><span>💠 ${p.shards || 0} shards</span>`;
      m.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === this._gcTab));
      const body = m.querySelector('.gc-body');
      if (this._gcTab === 'coll') {
        const kinds = [['trail', 'Trail dyes'], ['aura', 'Auras'], ['title', 'Titles']];
        const wg = G.wing || 'auto';
        const wopt = [['auto', 'By class', 'Feathered: Vanguard, Arcanist · Demon: Berserker, Ranger'], ['angel', '🪽 Feathered wings', 'Eagle-style feathered wings'], ['demon', '🦇 Demon wings', 'Leathery bat-like wings']];
        body.innerHTML = `<div style="font:800 10px Inter,sans-serif;letter-spacing:2px;color:#c9b6ea;margin:4px 0 6px;">WING STYLE <span style="letter-spacing:0;font-weight:600;color:rgba(230,220,245,.55);">· shown on Legendary &amp; Mythic chest armor</span></div><div class="gc-coll">` +
          wopt.map(([v, n, d]) => `<div class="gc-ci ${wg === v ? 'on' : ''}" data-wing="${v}" style="cursor:pointer"><div class="k">${wg === v ? 'selected' : 'tap to choose'}</div>${n}<br><span style="font-size:10.5px;color:rgba(255,255,255,.55);font-weight:500">${d}</span></div>`).join('') + '</div>' + kinds.map(([k, label]) => `<div style="font:800 10px Inter,sans-serif;letter-spacing:2px;color:#c9b6ea;margin:8px 0 6px;">${label.toUpperCase()}</div><div class="gc-coll">` +
          Object.keys(COS).filter(id => COS[id].kind === k).map((id) => {
            const c = COS[id], own = G.own.includes(id), on = G[k] === id;
            return `<div class="gc-ci ${own ? '' : 'lock'} ${on ? 'on' : ''}"><div class="k">${'★'.repeat(c.star)} ${k}</div>${c.icon} ${esc(c.name)}${own ? `<br><button data-equip="${id}">${on ? 'Unequip' : 'Equip'}</button>` : ''}</div>`;
          }).join('') + '</div>').join('');
        return;
      }
      if (this._gcTab === 'odds') {
        body.innerHTML = `<div class="gc-note" style="font-size:12.5px;color:#e6dcf5;">
          <b>★5 — 3%</b> (rises from pull ${SOFT5}, guaranteed by pull ${HARD5}): the featured legendary (50%, guaranteed after a miss), another legendary or a Mythic, or a ★5 cosmetic.<br>
          <b>★4 — 18%</b> (guaranteed every ${PITY4} pulls): Epic gear, trail dyes, auras, titles, a big Fortune charm.<br>
          <b>★3 — 79%</b>: Rare gear, gold pouches, potions, small Fortune charms.<br><br>
          Duplicate cosmetics become shards (★4: 8, ★5: 30). Sigils come from the daily free pull, jackpots (+1), bounty boards (+2), rift clears and your first win of the day.</div>`;
        return;
      }
      const fid = featured(), F = POWERS()[fid];
      const days = Math.ceil(weekLeft() / 86400000);
      const left5 = HARD5 - G.p5;
      const can = (n) => G.sigils >= n || (p.shards || 0) >= (n === 1 ? COST1 : COST10);
      const lab = (n) => G.sigils >= n ? `${n} sigil${n > 1 ? 's' : ''}` : `${n === 1 ? COST1 : COST10} 💠 shards`;
      const freeOk = G.free !== today();
      body.innerHTML = `
        <div class="gc-banner"><div class="t">FEATURED THIS WEEK · ★5 LEGENDARY POWER</div><div class="n">✦ ${F ? esc(F.name) : '—'}</div>
          <div class="d">${F ? esc(F.desc(1)) : ''}</div><div class="w">Banner rotates in ${days} day${days === 1 ? '' : 's'} · ${G.guar ? '<b style="color:#ffcf5a">Next ★5 is GUARANTEED featured</b>' : '50/50 on your next ★5'}</div></div>
        <div class="gc-pity">★5 guaranteed in <b>${left5}</b> pull${left5 === 1 ? '' : 's'} · ★4 in <b>${PITY4 - G.p4}</b><div class="bar"><i style="width:${Math.round(100 * G.p5 / HARD5)}%"></i></div></div>
        <div class="gc-pulls">
          ${freeOk ? `<button class="gc-pull free" data-pull="free">Daily free pull<small>once per day</small></button>` : ''}
          <button class="gc-pull ${can(1) ? '' : 'off'}" data-pull="1">Pull ×1<small>${lab(1)}</small></button>
          <button class="gc-pull ${can(10) ? '' : 'off'}" data-pull="10">Pull ×10<small>${lab(10)} · ★4+ guaranteed</small></button>
        </div>
        <div class="gc-note">Total pulls: ${G.pulls}. ${G.log.length ? 'Last ★5: ' + esc(G.log[G.log.length - 1]) : ''}</div>`;
    },

    // ---- rolling -------------------------------------------------------------------------------------
    gcRollOne() {
      const G = this.gc();
      G.p5++; G.p4++; G.pulls++;
      const r5 = G.p5 >= HARD5 ? 1 : RATE5 + Math.max(0, G.p5 - SOFT5) * 0.06;
      let star = 3;
      if (Math.random() < r5) star = 5;
      else if (G.p4 >= PITY4 || Math.random() < RATE4) star = 4;
      if (star === 5) { G.p5 = 0; G.p4 = 0; } else if (star === 4) G.p4 = 0;
      return this.gcPrize(star);
    },

    gcPrize(star) {
      const G = this.gc(), p = this.player, L = p.level || 1;
      const gear = (o) => { const it = this.generateItem(Object.assign({ ilvl: L, cls: p.classId }, o)); return { star, kind: 'gear', item: it, icon: it.icon || '🎁', name: it.name, sub: `${M.RARITIES.find(r => r.id === it.rarity).name}${it.power && POWERS()[it.power] ? ' · ✦ ' + POWERS()[it.power].name : ''}` }; };
      const cos = (id) => ({ star, kind: 'cos', id, icon: COS[id].icon, name: COS[id].name, sub: COS[id].kind === 'title' ? 'Title' : (COS[id].kind === 'aura' ? 'Hero aura' : 'Weapon trail dye') });
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      if (star === 5) {
        const fid = featured();
        const win = G.guar || Math.random() < 0.5;
        if (win && fid) {
          G.guar = false;
          const pr = gear({ ilvl: L + 1, rarity: Math.random() < 0.15 ? 'mythic' : 'legendary' });
          pr.item.power = fid; pr.sub = `${pr.item.rarity === 'mythic' ? 'Mythic' : 'Legendary'} · ✦ ${POWERS()[fid].name} (FEATURED)`;
          return pr;
        }
        G.guar = true;
        const r = Math.random();
        if (r < 0.35) return cos(pick(cosOf(5)));
        if (r < 0.5) return gear({ ilvl: L + 1, rarity: 'mythic' });
        return gear({ ilvl: L + 1, rarity: 'legendary' });
      }
      if (star === 4) {
        const r = Math.random();
        if (r < 0.5) return gear({ rarity: 'epic' });
        if (r < 0.92) return cos(pick(cosOf(4)));
        return { star, kind: 'charm', pts: 50, icon: '🍀', name: 'Grand Fortune Charm', sub: '+50% Fortune' };
      }
      const r = Math.random();
      if (r < 0.5) return gear({ rarity: 'rare', cls: Math.random() < 0.7 ? p.classId : undefined });
      if (r < 0.75) { const g = Math.round(40 + L * 30); return { star, kind: 'gold', gold: g, icon: '💰', name: `${g} Gold`, sub: 'Gold pouch' }; }
      if (r < 0.9) return { star, kind: 'potion', n: 2, icon: '🧪', name: '2 Potions', sub: 'Healing potions' };
      return { star, kind: 'charm', pts: 15, icon: '☘️', name: 'Fortune Charm', sub: '+15% Fortune' };
    },

    gcGrant(pr) {
      const G = this.gc(), p = this.player;
      if (pr.kind === 'gear') {
        const st = this.mmoState;
        if (st.bag.length < M.BAG_SIZE) { st.bag.push(pr.item); }
        else { this.spawnItemDrop(p.pos.clone(), pr.item, 0, null); pr.sub += ' (bag full: dropped at your feet)'; }
        if (pr.item.rarity === 'legendary' || pr.item.rarity === 'mythic') { const S = this.rwSess && this.rwSess(); if (S) S.legend++; }
      } else if (pr.kind === 'cos') {
        if (G.own.includes(pr.id)) { const n = pr.star === 5 ? 30 : 8; p.shards = (p.shards || 0) + n; pr.sub = `Duplicate → +${n} 💠`; pr.dup = true; }
        else { G.own.push(pr.id); pr.isNew = true; }
      } else if (pr.kind === 'gold') p.gold = (p.gold || 0) + pr.gold;
      else if (pr.kind === 'potion') { p.potions = (p.potions || 0) + pr.n; const pc = document.getElementById('potion-count'); if (pc) pc.textContent = p.potions; }
      else if (pr.kind === 'charm' && this.fortuneAdd) this.fortuneAdd(pr.pts);
      if (pr.star === 5) G.log.push(pr.name);
      if (G.log.length > 20) G.log.shift();
    },

    gcPull(kind) {
      const G = this.gc(), p = this.player;
      if (this._gcBusy) return;
      let n = 1;
      if (kind === 'free') { if (G.free === today()) return; G.free = today(); }
      else {
        n = kind === '10' ? 10 : 1;
        if (G.sigils >= n) G.sigils -= n;
        else { const cost = n === 1 ? COST1 : COST10; if ((p.shards || 0) < cost) return; p.shards -= cost; }
      }
      const res = [];
      for (let i = 0; i < n; i++) res.push(this.gcRollOne());
      if (n === 10 && !res.some(r => r.star >= 4)) { res[9] = this.gcPrize(4); }     // 10-pull always has a ★4+
      res.forEach(r => this.gcGrant(r));
      this.saveMMOState && this.saveMMOState();
      this.gcBadge();
      this.gcShow(res);
    },

    // ---- the show -----------------------------------------------------------------------------------------
    gcShow(res) {
      const S = document.getElementById('gacha-stage'); if (!S) return;
      this._gcBusy = true;
      const best = Math.max(...res.map(r => r.star));
      S.style.setProperty('--gc', STAR_COL[best]);
      S.innerHTML = `<div class="flash"></div><div class="crystal"></div><div class="acts"><button class="ghost" data-skip>Skip ▸</button></div>`;
      S.classList.add('on');
      const cr = S.querySelector('.crystal'), fl = S.querySelector('.flash');
      const timers = [];
      const later = (ms, fn) => timers.push(setTimeout(fn, ms));
      const sfx = (k) => { try { if (k === 'chime' && this.audio && this.audio.playLootChime) this.audio.playLootChime(); if (k === 'big' && this.audio && this.audio.playSpell) this.audio.playSpell('ult'); } catch (e) { /* audio optional */ } };
      let revealed = false;
      const reveal = () => {
        if (revealed) return; revealed = true;
        timers.forEach(clearTimeout);
        S.innerHTML = `<div class="flash"></div><div class="cards ${res.length === 1 ? 'one' : ''}">${res.map((r, i) => `<div class="card s${r.star}" style="--sc:${STAR_COL[r.star]}"><div class="in"><div class="f">✦</div><div class="b">${r.isNew ? '<span class="new">NEW</span>' : ''}<div class="ic">${r.icon}</div><div class="st">${'★'.repeat(r.star)}</div><div class="nm">${esc(r.name)}</div><div class="sub">${esc(r.sub || '')}</div></div></div></div>`).join('')}</div><div class="acts"><button class="ghost" data-again>${'Pull again'}</button><button data-done>Collect</button></div>`;
        const cards = [...S.querySelectorAll('.card')];
        const fl2 = S.querySelector('.flash');
        let t = 0;
        cards.forEach((c, i) => {
          const r = res[i];
          t += r.star === 5 ? 650 : (r.star === 4 ? 260 : 150);
          setTimeout(() => {
            c.classList.add('flip');
            if (r.star >= 4) sfx('chime');
            if (r.star === 5) { sfx('big'); fl2.style.setProperty('--gc', STAR_COL[5]); fl2.classList.remove('go'); void fl2.offsetWidth; fl2.classList.add('go'); }
          }, t);
        });
        S.querySelector('[data-done]').onclick = () => this.gcClose();
        S.querySelector('[data-again]').onclick = () => { this.gcClose(); this.gcRender(); };
      };
      S.querySelector('[data-skip]').onclick = reveal;
      sfx('chime');
      later(700, () => cr.classList.add('shake'));
      later(best === 5 ? 2100 : 1400, () => { cr.classList.remove('shake'); cr.classList.add('crack'); fl.classList.add('go'); sfx(best === 5 ? 'big' : 'chime'); });
      later(best === 5 ? 2500 : 1750, reveal);
    },

    gcClose() {
      const S = document.getElementById('gacha-stage');
      if (S) { S.classList.remove('on'); S.innerHTML = ''; }
      this._gcBusy = false;
      if (document.getElementById('inventory-modal')?.classList.contains('active')) this.renderInventoryModal();
      this.gcRender();
    },

    // ---- cosmetics ------------------------------------------------------------------------------------------
    gcEquip(id) {
      const G = this.gc(), c = COS[id]; if (!c || !G.own.includes(id)) return;
      G[c.kind] = G[c.kind] === id ? '' : id;
      this.saveMMOState && this.saveMMOState();
      this.gcRender();
      this.broadcastPlayerState && this.broadcastPlayerState(false);
    },

    cosOf(ent) {
      if (ent === this.player) { const G = this.mmoState && this.mmoState.gacha; return G ? { tr: G.trail, au: G.aura, ti: G.title, wg: G.wing || 'auto' } : null; }
      return ent._cosNet || null;
    },

    updateWeaponTrails() {
      if (orig.updateWeaponTrails) orig.updateWeaponTrails.apply(this, arguments);
      if (!this._trails) return;
      for (let i = 0; i < this._trails.length; i++) {
        const tr = this._trails[i], ent = tr.owner;
        if (!ent || (ent._elemCast && ent._elemCast.el)) continue;
        const C = this.cosOf(ent); const c = C && COS[C.tr];
        if (!c) continue;
        if (c.col < 0) _c.setHSL((performance.now() / 1600) % 1, 0.9, 0.62); else _c.setHex(c.col);
        tr.uniforms.uColor.value.copy(_c);
        if (tr.uniforms.uAlpha) tr.uniforms.uAlpha.value = Math.max(tr.uniforms.uAlpha.value || 1, c.star >= 5 ? 1.6 : 1.3);
      }
    },

    gcAuraTick(ent, dt, t) {
      const C = this.cosOf(ent); const A = C && COS[C.au];
      if (!A || !ent.meshRoot || !ent.meshRoot.visible || ent.dead || !this.vfxSparks) return;
      ent._gcAura = (ent._gcAura || 0) - dt;
      if (ent._gcAura > 0) return;
      ent._gcAura = A.star >= 5 ? 0.16 : 0.22;
      const p = ent.pos, y = p.y || 0;
      if (A.at === 'orbit') { const a = t * 1.8 + Math.random() * 6.28; _v.set(p.x + Math.cos(a) * (0.6 + Math.random() * 0.5), y + 0.4 + Math.random() * 1.4, p.z + Math.sin(a) * (0.6 + Math.random() * 0.5)); }
      else if (A.at === 'above') _v.set(p.x + (Math.random() - 0.5) * 1.6, y + 2.4 + Math.random() * 0.4, p.z + (Math.random() - 0.5) * 1.6);
      else if (A.at === 'feet') _v.set(p.x + (Math.random() - 0.5) * 1.0, y + 0.1, p.z + (Math.random() - 0.5) * 1.0);
      else _v.set(p.x + (Math.random() - 0.5) * 0.7, y + 0.5 + Math.random() * 1.2, p.z + (Math.random() - 0.5) * 0.7);
      this.vfxSparks(_v, A.star >= 5 ? 3 : 2, { cols: A.c, speed: A.sp, life: A.life, grav: A.grav, width: 0.05 });
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (!this.isInWorld || !this.player || !this.mmoState) return;
      this.gcQuickBtn();
      const t = performance.now() / 1000;
      try {
        this.gcAuraTick(this.player, dt, t);
        if (this.remotePeers) { const p0 = this.player.pos; this.remotePeers.forEach(pe => { if (pe && pe.pos && pe.pos.distanceToSquared(p0) < 1600) this.gcAuraTick(pe, dt, t); }); }
      } catch (e) { if (!this._gcErr) { this._gcErr = 1; console.warn('[gacha]', e); } }
      // own title under the name
      const id = document.getElementById('ui-ident');
      if (id) {
        let el = id.querySelector('.ttl');
        const G = this.mmoState.gacha, ti = G && COS[G.title] ? COS[G.title].name : '';
        if (!el && ti) { el = document.createElement('div'); el.className = 'ttl'; const sub = id.querySelector('.sub'); if (sub) sub.after(el); else id.appendChild(el); }
        if (el && el._t !== ti) { el._t = ti; el.textContent = ti ? `« ${ti} »` : ''; }
      }
      this._gcBadgeT = (this._gcBadgeT || 0) - dt;
      if (this._gcBadgeT <= 0) { this._gcBadgeT = 5; this.gcBadge(); }
    },

    // ---- co-op ---------------------------------------------------------------------------------------------
    buildPlayerStatePayload() {
      const p = orig.buildPlayerStatePayload.apply(this, arguments);
      const G = this.mmoState && this.mmoState.gacha;
      if (p && G) p.cos = { tr: G.trail || '', au: G.aura || '', ti: G.title || '', wg: G.wing || 'auto' };
      return p;
    },

    handleRemotePlayerState(p, fromPresence) {
      const r = orig.handleRemotePlayerState.apply(this, arguments);
      if (p && p.id && this.remotePeers && p.cos !== undefined) {
        const peer = this.remotePeers.get(p.id);
        if (peer) {
          peer._cosNet = p.cos;
          const ti = p.cos && COS[p.cos.ti] ? COS[p.cos.ti].name : '';
          const key = `${peer.name}|${ti}`;
          if (peer.nameplateSprite && peer._cosKey !== key && this.drawPeerNameplateCanvas) {
            peer._cosKey = key;
            this.drawPeerNameplateCanvas(peer.nameplateSprite, ti ? `${peer.name} «${ti}»` : peer.name);
          }
        }
      }
      return r;
    }
  });

  window.CR_GACHA = { COS, featured, RATE5, HARD5 };
})();
