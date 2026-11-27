/* =============================================================================
 * Chrono-Rift — CrazyGames SDK v3 integration (loaded last)
 *
 *  Only active in the CrazyGames build (tools/build_offline.js --crazygames), which adds
 *  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"> to the page. Everywhere
 *  else window.CrazyGames is missing (or the SDK reports "disabled") and this file does
 *  nothing.
 *
 *  • Boot: SDK.init() runs before the game is created (window.CR_BOOT gate), then saves are
 *    restored from the Data module so progress follows the player's CrazyGames account.
 *  • Saves: every localStorage write of a game key (arpg_* / cr_*) is mirrored into
 *    SDK.data. A revision counter decides which side is newer on the next boot.
 *  • Gameplay events: loadingStart/Stop, gameplayStart/Stop (in the world, no menu,
 *    cutscene or ad open), happytime on boss kills and ★5 pulls.
 *  • Audio: respects SDK settings.muteAudio, mutes while an ad plays.
 *  • Ads (SDK only, all optional for the player):
 *      - midgame: after a death, or after fast travel. Never in the first 6 minutes of a
 *        session; the SDK also enforces its own cooldown.
 *      - rewarded: "+1 Rift Sigil" in the Rift Cache (3 per day, 4 min apart) and
 *        "return to where you fell" after a death (not shown together with a midgame).
 *      With an adblocker the rewarded buttons are hidden; the game plays normally.
 * ============================================================================= */
(function () {
  'use strict';
  const CG = window.CrazyGames && window.CrazyGames.SDK;
  if (!CG) return;

  const KEY_RE = /^(arpg_|cr_)/;
  const SKIP = new Set(['cr_mode', 'cr_char', 'cr_goto']);         // session-only keys
  const IDX = 'cr__keys', REV = 'cr__rev';
  const NO_ADS_MS = 6 * 60000;                                      // no ads in the first minutes
  const RW_SIGIL_PER_DAY = 3, RW_SIGIL_GAP = 4 * 60000;
  const log = (...a) => { if (window.CR_CG && window.CR_CG.env === 'local') console.log('[CrazyGames]', ...a); };
  const today = () => new Date().toISOString().slice(0, 10);

  const S = window.CR_CG = { env: 'disabled', ready: false, playing: false, adOn: false, adblock: false, muted: false, t0: performance.now() };
  const on = () => S.env === 'local' || S.env === 'crazygames';
  const safe = (fn) => { try { return fn(); } catch (e) { console.warn('[CrazyGames]', e); return undefined; } };

  // ---------------------------------------------------------------------------------------------
  // Saves: localStorage <-> Data module
  // ---------------------------------------------------------------------------------------------
  let LS = null;
  try { LS = window.localStorage; } catch (e) { LS = null; }
  const SP = typeof Storage !== 'undefined' && Storage.prototype;
  const rawSet = SP && SP.setItem, rawRemove = SP && SP.removeItem;
  const lsGet = (k) => { if (!LS) return null; try { return LS.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { if (!LS || !rawSet) return; try { rawSet.call(LS, k, v); } catch (e) { /* storage blocked */ } };
  let keys = new Set(), rev = 0, mirror = false;

  function gameKeys() {
    const out = [];
    if (!LS) return out;
    try { for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k && KEY_RE.test(k) && !SKIP.has(k) && k !== IDX && k !== REV) out.push(k); } } catch (e) { /* blocked */ }
    return out;
  }
  function pushAll() {
    keys = new Set(gameKeys());
    keys.forEach((k) => { const v = lsGet(k); if (v != null) CG.data.setItem(k, v); });
    CG.data.setItem(IDX, JSON.stringify([...keys]));
    CG.data.setItem(REV, String(rev));
  }
  function restore() {
    if (!LS) { mirror = false; return; }
    const dRev = +(CG.data.getItem(REV) || 0), lRev = +(lsGet(REV) || 0);
    let dKeys = []; try { dKeys = JSON.parse(CG.data.getItem(IDX) || '[]'); } catch (e) { dKeys = []; }
    if (dKeys.length && dRev > lRev) {
      // the account copy is newer (other device, or this device's local copy was cleared)
      gameKeys().forEach((k) => { if (!dKeys.includes(k)) { try { rawRemove.call(LS, k); } catch (e) { /* blocked */ } } });
      dKeys.forEach((k) => { const v = CG.data.getItem(k); if (v != null) lsSet(k, v); });
      keys = new Set(dKeys); rev = dRev;
      lsSet(REV, String(rev));
      log('restored', dKeys.length, 'keys from the Data module, rev', rev);
    } else {
      // first run on CrazyGames, or the local copy is ahead (a save the SDK had not flushed yet)
      rev = Math.max(dRev, lRev);
      pushAll();
      lsSet(REV, String(rev));
      log('pushed', keys.size, 'local keys to the Data module, rev', rev);
    }
    mirror = true;
  }
  let idxDirty = false;
  function bump() {
    rev++; lsSet(REV, String(rev));
    safe(() => CG.data.setItem(REV, String(rev)));
    if (idxDirty) { idxDirty = false; safe(() => CG.data.setItem(IDX, JSON.stringify([...keys]))); }
  }
  if (LS && rawSet && rawRemove) {
    try {
      Storage.prototype.setItem = function (k, v) {
        rawSet.call(this, k, v);
        if (mirror && this === LS && KEY_RE.test(k) && !SKIP.has(k) && k !== IDX && k !== REV) {
          if (!keys.has(k)) { keys.add(k); idxDirty = true; }
          safe(() => CG.data.setItem(k, String(v)));
          bump();
        }
      };
      Storage.prototype.removeItem = function (k) {
        rawRemove.call(this, k);
        if (mirror && this === LS && keys.has(k)) {
          keys.delete(k); idxDirty = true;
          safe(() => CG.data.removeItem(k));
          bump();
        }
      };
    } catch (e) { /* storage prototype immutable */ }
  }

  // ---------------------------------------------------------------------------------------------
  // Boot gate: the page's DOMContentLoaded handler awaits window.CR_BOOT before creating the game
  // ---------------------------------------------------------------------------------------------
  window.CR_BOOT = (async () => {
    try {
      await Promise.race([CG.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('init timeout')), 12000))]);
      S.env = CG.environment;
    } catch (e) { console.warn('[CrazyGames] SDK init failed, playing without it', e); S.env = 'disabled'; }
    if (!on()) return;
    S.ready = true;
    safe(() => CG.game.loadingStart());
    safe(restore);
    safe(() => { S.muted = !!(CG.game.settings && CG.game.settings.muteAudio); });
    safe(() => CG.game.addSettingsChangeListener((st) => { S.muted = !!(st && st.muteAudio); applyMute(); }));
    CG.ad.hasAdblock().then((b) => { S.adblock = !!b; }).catch(() => {});
    watchBootReady();
    log('ready, env', S.env);
  })();

  // ---------------------------------------------------------------------------------------------
  // Audio
  // ---------------------------------------------------------------------------------------------
  function applyMute() {
    const A = window.game && window.game.audio; if (!A || !A.ctx || !A.masterGain) return;
    const off = A.muted || S.muted || S.adOn;
    A.masterGain.gain.setTargetAtTime(off ? 0 : 0.85, A.ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------------------------------------
  // Ads
  // ---------------------------------------------------------------------------------------------
  function requestAd(type, done) {
    if (!S.ready || S.adOn) { done && done(false, 'busy'); return; }
    S.adOn = true; setPlaying(false);
    let ended = false;
    const end = (ok, why) => {
      if (ended) return; ended = true;
      S.adOn = false; applyMute();
      if (!ok) log(type, 'ad not shown:', why);
      done && done(ok, why);
    };
    try {
      CG.ad.requestAd(type, {
        adStarted: () => { applyMute(); },
        adFinished: () => end(true),
        adError: (err) => end(false, err && err.code)
      });
    } catch (e) { end(false, 'other'); }
  }
  const adsAllowed = () => S.ready && performance.now() - S.t0 > NO_ADS_MS;
  const midgame = () => { if (adsAllowed()) requestAd('midgame'); };

  // ---------------------------------------------------------------------------------------------
  // Small UI: rewarded offer panel
  // ---------------------------------------------------------------------------------------------
  const css = document.createElement('style');
  css.textContent = `
  body { -webkit-user-select: none; user-select: none; }
  #cg-offer { position: fixed; left: 50%; bottom: 22%; transform: translateX(-50%); z-index: 70; display: none; gap: 10px; align-items: center;
    padding: 12px 14px; border-radius: 12px; background: rgba(12,14,22,.92); border: 1px solid rgba(212,175,55,.5); color: #F5F2EB;
    font: 600 13px 'Plus Jakarta Sans', Inter, sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,.5); }
  #cg-offer.on { display: flex; animation: cgIn .3s ease; }
  @keyframes cgIn { from { opacity: 0; transform: translate(-50%, 10px); } }
  #cg-offer button { all: unset; cursor: pointer; padding: 8px 12px; border-radius: 8px; font: 700 12px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .04em; }
  #cg-offer .yes { background: linear-gradient(180deg, #f6dc8c, #D4AF37 55%, #a8842a); color: #17120a; }
  #cg-offer .no { border: 1px solid rgba(245,242,235,.3); color: rgba(245,242,235,.8); }
  #cg-offer .t { font-variant-numeric: tabular-nums; color: rgba(245,242,235,.5); font-size: 11px; }
  .gc-pull.cg-ad small { color: #9ff0c4; }`;
  (document.head || document.documentElement).appendChild(css);
  let offerTimer = null;
  function offer(text, yesLabel, secs, onYes) {
    let el = document.getElementById('cg-offer');
    if (!el) { el = document.createElement('div'); el.id = 'cg-offer'; document.body.appendChild(el); }
    el.innerHTML = `<span>${text}</span><button class="yes">▶ ${yesLabel}</button><button class="no">No thanks</button><span class="t"></span>`;
    el.classList.add('on');
    const close = () => { el.classList.remove('on'); clearInterval(offerTimer); offerTimer = null; };
    el.querySelector('.no').onclick = (e) => { e.stopPropagation(); close(); };
    el.querySelector('.yes').onclick = (e) => { e.stopPropagation(); close(); onYes(); };
    let left = secs; const t = el.querySelector('.t'); t.textContent = left + 's';
    clearInterval(offerTimer);
    offerTimer = setInterval(() => { left--; t.textContent = left + 's'; if (left <= 0) close(); }, 1000);
  }

  // ---------------------------------------------------------------------------------------------
  // Gameplay start / stop (polled, so every menu, cutscene and screen is covered)
  // ---------------------------------------------------------------------------------------------
  let loadingDone = false, bootObs = null;
  function stopLoading() {
    if (loadingDone || !S.ready) return;
    loadingDone = true;
    if (bootObs) { bootObs.disconnect(); bootObs = null; }
    safe(() => CG.game.loadingStop());
    log('loadingStop');
  }
  function isBootReady() {
    const b = document.body && document.body.classList;
    const g = window.game;
    return !!(b && (b.contains('cr-booted') || b.contains('cr-title-on') || b.contains('cr-acct-on'))) || !!(g && g.isInWorld);
  }
  function watchBootReady() {
    if (loadingDone || !S.ready) return;
    if (isBootReady()) { stopLoading(); return; }
    if (document.body && typeof MutationObserver !== 'undefined' && !bootObs) {
      bootObs = new MutationObserver(() => { if (isBootReady()) stopLoading(); });
      bootObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  }
  function setPlaying(v) {
    if (!S.ready || v === S.playing) return;
    S.playing = v;
    if (v && !loadingDone) stopLoading();
    if (v && window.crMark) crMark('gameplay_start');
    safe(() => v ? CG.game.gameplayStart() : CG.game.gameplayStop());
    log(v ? 'gameplayStart' : 'gameplayStop');
  }
  function tick() {
    const g = window.game;
    if (!g || !S.ready) return;
    if (!loadingDone && isBootReady()) stopLoading();
    const b = document.body.classList;
    setPlaying(!!(g.isInWorld && !g.isAnyModalOpen && !g.cutsceneActive && !S.adOn && !b.contains('cr-acct-on') && !b.contains('cr-create')
      && !document.querySelector('#gacha-stage.on')));
  }
  setInterval(tick, 400);

  // arrow keys / space never scroll the portal page
  window.addEventListener('keydown', (e) => {
    const t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA') return;
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(e.key)) e.preventDefault();
  }, { passive: false });

  // ---------------------------------------------------------------------------------------------
  // Game hooks
  // ---------------------------------------------------------------------------------------------
  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    damagePlayer: GP.damagePlayer, respawnAtGraveyard: GP.respawnAtGraveyard, travelToWaypoint: GP.travelToWaypoint,
    grantKillRewards: GP.grantKillRewards, gcRender: GP.gcRender, gcShow: GP.gcShow, initMMOWorld: GP.initMMOWorld
  };
  Object.assign(GP, {
    initMMOWorld() {
      const r = orig.initMMOWorld.apply(this, arguments);
      watchBootReady();
      // keep the player's own mute toggle working alongside the SDK's mute setting
      const A = this.audio;
      if (A && !A._cgWrapped) {
        A._cgWrapped = true;
        const setMuted = A.setMuted.bind(A);
        A.setMuted = (m) => { setMuted(m); applyMute(); };
        const init = A.init.bind(A);
        A.init = () => { init(); applyMute(); };
      }
      return r;
    },

    damagePlayer() {
      if (S.adOn || (this._cgShield && performance.now() < this._cgShield)) return;
      return orig.damagePlayer.apply(this, arguments);
    },

    respawnAtGraveyard(killer) {
      const p = this.player, fell = p.pos.clone();
      const r = orig.respawnAtGraveyard.apply(this, arguments);
      if (!S.ready) return r;
      const G = this._cgRw || (this._cgRw = { back: -Infinity });
      // rewarded "return to where you fell" (at most every 3 minutes), otherwise a midgame break
      if (adsAllowed() && !S.adblock && performance.now() - G.back > 3 * 60000) {
        G.back = performance.now();
        setTimeout(() => offer('💀 Return to where you fell, full health?', 'Watch ad', 12, () => requestAd('rewarded', (ok) => {
          if (!ok) { this.showLootToast('No ad available right now. You stay at the waypoint.'); return; }
          p.pos.copy(fell); p.vy = 0; p.hp = p.maxHp; p.mp = p.maxMp;
          this._cgShield = performance.now() + 3000;
          this.aiAllies.forEach((a) => a.pos.copy(p.pos).add(a.offset));
          if (this.updatePropStreaming) this.updatePropStreaming(true);
          this.spawnVFXFlipbook('vortex', p.pos, 4.0, 0.5, 0x38e8ff);
          this.showLootToast('🌀 Back where you fell. 3 s of protection!');
        })), 900);
      } else {
        setTimeout(midgame, 700);
      }
      return r;
    },

    travelToWaypoint(id) {
      const before = this.player.pos.clone();
      const r = orig.travelToWaypoint.apply(this, arguments);
      if (this.player.pos.distanceTo(before) > 1) setTimeout(midgame, 400);
      return r;
    },

    grantKillRewards(mob) {
      const r = orig.grantKillRewards.apply(this, arguments);
      if (S.ready && mob && (mob.isBoss || mob.isWorldBoss)) safe(() => CG.game.happytime());
      return r;
    },

    // ★5 pull → celebration
    gcShow(res) {
      if (S.ready && Array.isArray(res) && res.some((x) => x && x.star >= 5)) setTimeout(() => safe(() => CG.game.happytime()), 1500);
      return orig.gcShow ? orig.gcShow.apply(this, arguments) : undefined;
    },

    // Rift Cache: optional "watch an ad for a sigil"
    gcRender() {
      const r = orig.gcRender.apply(this, arguments);
      if (!S.ready || S.adblock || this._gcTab !== 'banner') return r;
      const row = document.querySelector('#gacha-modal .gc-pulls'); const G = this.gc && this.gc();
      if (!row || !G) return r;
      const A = G.cgAd && G.cgAd.d === today() ? G.cgAd : (G.cgAd = { d: today(), n: 0, at: 0 });
      const wait = Math.max(0, RW_SIGIL_GAP - (Date.now() - A.at));
      const b = document.createElement('button');
      b.className = 'gc-pull cg-ad';
      if (A.n >= RW_SIGIL_PER_DAY) { b.classList.add('off'); b.innerHTML = 'Watch ad: +1 sigil<small>done for today</small>'; }
      else if (wait > 0) { b.classList.add('off'); b.innerHTML = `Watch ad: +1 sigil<small>ready in ${Math.ceil(wait / 60000)} min</small>`; }
      else {
        b.innerHTML = `▶ Watch ad: +1 sigil<small>${RW_SIGIL_PER_DAY - A.n} left today</small>`;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          requestAd('rewarded', (ok) => {
            if (ok) { A.n++; A.at = Date.now(); this.sigilAdd(1, 'ad reward'); if (this.saveMMOState) this.saveMMOState(); }
            else this.showLootToast('No ad available right now. Try again later.');
            this.gcRender();
          });
        });
      }
      row.appendChild(b);
      return r;
    }
  });
})();
