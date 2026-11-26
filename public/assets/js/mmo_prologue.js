/* =============================================================================
 * Chrono-Rift — first 90 seconds: one-tap start, playable prologue, first mission
 *
 *  A brand-new player's opening, in order (portal builds, window.CR_OFFLINE):
 *   1. Cold open as Rift Gatekeeper Lyra: no title, hero list or creation screen. The page
 *      boots straight into the world with a temporary "Lyra" guest record (Ranger).
 *      Returning players (any hero saved, or a pending character switch) are untouched.
 *   2. Prologue skirmish "Hold the Rift Breach": just outside Ashenvale, two waves of rift
 *      monsters close in around a violet breach. Fading prompts (move / attack), a 0/6
 *      banner, Lyra can't fall here.
 *   2b. The breach surges, Lyra calls across time ("Answer my call!"), and the hero-select
 *      screen opens as "Lyra's call echoes across time": pick a class, name auto-filled,
 *      ANSWER THE CALL. The champion is created, Lyra's temporary record is deleted.
 *   3. The champion enters: the existing Chapter I intro plays, unchanged (skip with
 *      SPACE / ESC / the top-right button).
 *  Heroes created on the online site (no Lyra prologue) play the skirmish as themselves, get a
 *  Rare weapon on the last kill, then the intro.
 *   4. First mission: the hero arrives at the Rift Gate in town (Lyra greets the champion who
 *      answered her and gives a Rare weapon) with a pulsing ring, a gold
 *      beacon over the nearest Meadows pack and a tracker "Defeat 10 monsters (0/10)",
 *      rewarded with an Epic item. Levels 1-2 need less XP (mmo_data.js), so the first
 *      level-up and talent point land in the first minute or two.
 *  Runs once per hero (mmoState.opening). Heroes that already saw Chapter I skip it all.
 * ============================================================================= */
(function () {
  'use strict';
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* blocked */ } }
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* blocked */ } }
  };

  // ---------------------------------------------------------------------------------------------
  // 1. One-tap start (called by the page right before the game is created, after the portal SDK
  //    restored any saved data)
  // ---------------------------------------------------------------------------------------------
  // The prologue is played as Rift Gatekeeper Lyra (Ranger class, the same model as the town NPC),
  // using a temporary guest record marked prologue:true. It never appears in the hero list and is
  // deleted the moment the player's own champion is created ("Answer the call").
  const wipeChar = (c) => {
    const tok = 'g_' + c.id;
    ['vanguard', 'ranger', 'arcanist', 'berserker'].forEach((k) => ls.set(`arpg_mmo_v1_${tok}_${k}`, null));
    ls.set(`arpg_talents_v1_${tok}`, null); ls.set(`cr_tutorial_v1_${tok}`, null);
  };
  window.CR_PRESTART = function () {
    if (!window.CR_OFFLINE) return;
    try {
      if (ss.get('cr_char') || ss.get('cr_goto')) return;                  // already playing / switching heroes
      let chars = []; try { chars = JSON.parse(ls.get('cr_guest_chars') || '[]'); } catch (e) { chars = []; }
      const leftovers = chars.filter(c => c.prologue);                      // tab closed before choosing a champion
      if (leftovers.length) { leftovers.forEach(wipeChar); chars = chars.filter(c => !c.prologue); ls.set('cr_guest_chars', JSON.stringify(chars)); }
      if (chars.length) return;                                             // returning player: normal hero list
      const tok0 = ls.get('arpg_player_token');
      if (tok0 && !/^(char_|g_)/.test(tok0)) {                              // pre-accounts save on this device: let them import it
        for (const cls of ['vanguard', 'ranger', 'arcanist', 'berserker']) if (ls.get(`arpg_mmo_v1_${tok0}_${cls}`)) return;
      }
      const id = 'lyra-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
      const name = 'Lyra', cls = 'ranger', now = new Date().toISOString();
      ls.set('cr_guest_chars', JSON.stringify([{ id, name, cls, level: 1, updated: now, save: {}, prologue: true }]));
      const tok = 'g_' + id;
      ls.set('arpg_player_token', tok);
      ls.set('arpg_hero_name', name);
      ls.set('arpg_story_state', null);
      ls.set('cr_last_mode', 'guest');
      ss.set('cr_mode', 'guest');
      ss.set('cr_char', JSON.stringify({ id, tok, name, cls, mode: 'guest', local: true, prologue: true }));
      window.CR_FIRST_RUN = true;
    } catch (e) { /* storage blocked: the normal flow still works */ }
  };

  if (typeof ChronoRiftCoOpGame === 'undefined') return;                   // a class declaration, not a window property
  const GP = ChronoRiftCoOpGame.prototype;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const isTouch = () => document.body.classList.contains('touch-ui');
  const KILLS = 6, MISSION = 10;

  const CSS = `
  #cr-op-banner { position: fixed; top: calc(14px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); z-index: 45; pointer-events: none;
    display: none; text-align: center; color: #F5F2EB; padding: 9px 22px 10px; border-radius: 12px; min-width: 260px;
    background: linear-gradient(180deg, rgba(20,14,34,.82), rgba(14,12,24,.7)); border: 1px solid rgba(180,140,255,.55);
    box-shadow: 0 6px 24px rgba(0,0,0,.45), 0 0 22px rgba(140,90,255,.25); font-family: 'Plus Jakarta Sans', Inter, sans-serif; }
  #cr-op-banner.on { display: block; animation: crOpIn .35s cubic-bezier(.2,.8,.2,1); }
  #cr-op-banner .t { font: 900 15px 'Cinzel', serif; letter-spacing: .14em; }
  #cr-op-banner .c { font: 800 12px 'Plus Jakarta Sans', Inter, sans-serif; color: #d8c2ff; margin-top: 3px; letter-spacing: .06em; }
  #cr-op-banner .bar { height: 4px; border-radius: 4px; background: rgba(255,255,255,.12); margin-top: 6px; overflow: hidden; }
  #cr-op-banner .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #b48cff, #ffd56b); transition: width .25s; }
  #cr-op-banner.gold { border-color: rgba(255,213,107,.7); box-shadow: 0 6px 24px rgba(0,0,0,.45), 0 0 26px rgba(255,200,90,.35); }
  #cr-op-banner.done .t { color: #ffd56b; }
  #cr-op-banner.pop { animation: crOpPop .35s ease; }
  @keyframes crOpIn { from { opacity: 0; transform: translate(-50%, -10px); } }
  @keyframes crOpPop { 50% { transform: translateX(-50%) scale(1.07); } }
  #cr-op-hints { position: fixed; left: 50%; bottom: calc(22% + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 44; pointer-events: none;
    display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 92vw; }
  #cr-op-hints .h { padding: 8px 14px; border-radius: 999px; color: #F5F2EB; font: 700 13px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .03em;
    background: rgba(12,14,22,.72); border: 1px solid rgba(255,255,255,.22); transition: opacity .6s, transform .6s; }
  #cr-op-hints .h.gone { opacity: 0; transform: translateY(8px); }
  #cr-op-hints kbd { display: inline-block; min-width: 18px; padding: 1px 6px; margin: 0 2px; border-radius: 5px; background: rgba(255,255,255,.14);
    border: 1px solid rgba(255,255,255,.3); font: 800 11px 'JetBrains Mono', monospace; text-align: center; }
  #cr-op-tip { position: fixed; right: calc(16px + env(safe-area-inset-right)); bottom: calc(150px + env(safe-area-inset-bottom)); z-index: 44; pointer-events: none;
    padding: 9px 14px; border-radius: 12px; color: #1a1406; background: linear-gradient(180deg, #ffe7a3, #ffd56b); font: 800 12.5px 'Plus Jakarta Sans', Inter, sans-serif;
    box-shadow: 0 6px 20px rgba(0,0,0,.4); display: none; }
  #cr-op-tip.on { display: block; animation: crOpIn .35s ease; }
  #cr-op-banner.danger { border-color: rgba(255,90,110,.7); box-shadow: 0 6px 24px rgba(0,0,0,.45), 0 0 26px rgba(255,60,90,.35); }
  #cr-op-banner.danger .t { color: #ff9cab; }
  /* non-blocking story dialogue: portrait, name, typed line (the player keeps full control) */
  #cr-op-talk { position: fixed; left: calc(16px + env(safe-area-inset-left)); bottom: calc(168px + env(safe-area-inset-bottom)); z-index: 44; pointer-events: none;
    display: none; align-items: flex-start; gap: 11px; max-width: min(420px, calc(100vw - 32px)); padding: 11px 15px 12px 11px; border-radius: 14px;
    background: linear-gradient(180deg, rgba(16,14,28,.86), rgba(12,12,22,.78)); border: 1px solid rgba(255,213,107,.45); box-shadow: 0 8px 26px rgba(0,0,0,.45); }
  #cr-op-talk.on { display: flex; animation: crTalkIn .3s ease; }
  @keyframes crTalkIn { from { opacity: 0; transform: translateX(-12px); } }
  #cr-op-talk .pf { flex: none; width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; font-size: 22px;
    background: radial-gradient(circle at 40% 35%, #6a4bd0, #241a4a); border: 2px solid #ffd56b; }
  #cr-op-talk .nm { font: 800 11px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .14em; color: #ffd56b; text-transform: uppercase; }
  #cr-op-talk .tx { font: 600 14px/1.45 'Plus Jakarta Sans', Inter, sans-serif; color: #F5F2EB; margin-top: 3px; min-height: 20px; }
  body.cr-lyra-call #hero-modal .hs-back { display: none !important; }
  /* playing Lyra's prologue: no quests, bounties or rift surges, just the fight */
  body.cr-prologue #story-tracker { visibility: hidden !important; }
  /* nothing but the champion choice while Lyra's call is on screen */
  body.cr-lyra-call #combat-tip, body.cr-lyra-call #epic-call, body.cr-lyra-call #cr-op-tip, body.cr-lyra-call #hud-top, body.cr-lyra-call #hud-bottom,
  body.cr-lyra-call #chat-panel, body.cr-lyra-call #minimap-wrap, body.cr-lyra-call #ui-quick, body.cr-lyra-call #ui-status, body.cr-lyra-call #ui-avatar,
  body.cr-lyra-call #mmo-quick, body.cr-lyra-call #mmo-xpbar, body.cr-lyra-call #story-tracker, body.cr-lyra-call #travel-bar, body.cr-lyra-call #party-frames,
  body.cr-lyra-call #touch-joystick, body.cr-lyra-call #tut-hint, body.cr-lyra-call #tut-pill, body.cr-lyra-call #floating-combat-text { visibility: hidden !important; }
  #cr-call { position: fixed; top: calc(18px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); z-index: 90; pointer-events: none; text-align: center;
    color: #F5F2EB; text-shadow: 0 2px 14px rgba(0,0,0,.85); display: none; width: min(92vw, 640px); }
  body.cr-lyra-call #cr-call { display: block; animation: crOpIn .5s ease; }
  #cr-call .t { font: 900 clamp(17px, 2.4vw, 26px) 'Cinzel', serif; letter-spacing: .16em; color: #ffd56b; }
  #cr-call .s { font: 600 clamp(12px, 1.4vw, 14px) 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .08em; margin-top: 6px; color: rgba(245,242,235,.85); }
  /* compact mobile layout for opening banners, dialogue & hints */
  #cr-op-banner.runnable { pointer-events: auto; cursor: pointer; }
  #cr-op-banner.running { border-color: #2ee68a; box-shadow: 0 4px 18px rgba(0,0,0,.45), 0 0 18px rgba(46,230,138,.35); }
  body.touch-ui #cr-op-banner { top: calc(56px + env(safe-area-inset-top)); min-width: 0; max-width: min(86vw, 270px); padding: 5px 12px 6px; border-radius: 10px; }
  body.touch-ui #cr-op-banner .t { font-size: 11.5px; letter-spacing: .09em; }
  body.touch-ui #cr-op-banner .c { font-size: 10px; margin-top: 2px; }
  body.touch-ui #cr-op-banner .bar { height: 3px; margin-top: 4px; }
  body.touch-ui #cr-op-talk { left: 50%; transform: translateX(-50%); bottom: calc(174px + env(safe-area-inset-bottom)); max-width: min(88vw, 340px); padding: 7px 11px; gap: 8px; border-radius: 11px; animation: none; }
  body.touch-ui #cr-op-talk .pf { width: 28px; height: 28px; font-size: 14px; border-width: 1.5px; }
  body.touch-ui #cr-op-talk .nm { font-size: 9.5px; }
  body.touch-ui #cr-op-talk .tx { font-size: 11.5px; line-height: 1.35; margin-top: 1px; min-height: 16px; }
  body.touch-ui #cr-op-hints { bottom: calc(146px + env(safe-area-inset-bottom)); gap: 6px; }
  body.touch-ui #cr-op-hints .h { padding: 5px 10px; font-size: 11px; }
  body.touch-ui #cr-op-tip { right: auto; left: 50%; transform: translateX(-50%); bottom: calc(142px + env(safe-area-inset-bottom)); padding: 6px 11px; font-size: 11px; max-width: 84vw; text-align: center; }
  @media (max-height: 500px) {
    body.touch-ui #cr-op-banner { top: calc(5px + env(safe-area-inset-top)); max-width: min(44vw, 250px); padding: 4px 11px 5px; }
    body.touch-ui #cr-op-banner .t { font-size: 10.5px; }
    body.touch-ui #cr-op-banner .c { font-size: 9.5px; }
    body.touch-ui #cr-op-talk { bottom: calc(8px + env(safe-area-inset-bottom)); max-width: min(48vw, 310px); padding: 5px 9px; gap: 7px; }
    body.touch-ui #cr-op-talk .pf { width: 24px; height: 24px; font-size: 12px; }
    body.touch-ui #cr-op-talk .tx { font-size: 10.5px; line-height: 1.3; }
    body.touch-ui #cr-op-hints { bottom: calc(10px + env(safe-area-inset-bottom)); }
    body.touch-ui #cr-op-tip { bottom: calc(10px + env(safe-area-inset-bottom)); max-width: min(48vw, 300px); }
    #cr-call { top: calc(6px + env(safe-area-inset-top)); left: calc(50% - 30px); width: min(36vw, 290px); }
    #cr-call .t { font-size: 13px; letter-spacing: .1em; }
    #cr-call .s { display: none; }
  }`;

  function ensureUi() {
    if (document.getElementById('cr-op-banner')) return;
    const st = document.createElement('style'); st.id = 'cr-op-css'; st.textContent = CSS; document.head.appendChild(st);
    const b = document.createElement('div'); b.id = 'cr-op-banner'; b.innerHTML = '<div class="t"></div><div class="c"></div><div class="bar"><i></i></div>';
    b.addEventListener('click', (e) => {
      if (!b.classList.contains('runnable')) return;
      e.stopPropagation();
      if (window.game && window.game.toggleAutoRun) {
        if (window.game.audio) window.game.audio.init();
        window.game.toggleAutoRun();
      }
    });
    const h = document.createElement('div'); h.id = 'cr-op-hints';
    const t = document.createElement('div'); t.id = 'cr-op-tip';
    const k = document.createElement('div'); k.id = 'cr-op-talk'; k.innerHTML = '<div class="pf"></div><div><div class="nm"></div><div class="tx"></div></div>';
    const c = document.createElement('div'); c.id = 'cr-call'; c.innerHTML = '<div class="t">WHO ANSWERS LYRA\'S CALL?</div><div class="s">Choose your champion. You\'ll play as them from now on, while Lyra guards the Rift Gate.</div>';
    document.body.append(b, h, t, k, c);
  }
  // typed dialogue line in the corner; hides itself after `secs`
  let talkTimer = 0, typeTimer = 0;
  function talk(who, icon, text, secs) {
    ensureUi();
    const el = document.getElementById('cr-op-talk');
    el.querySelector('.pf').textContent = icon; el.querySelector('.nm').textContent = who;
    const tx = el.querySelector('.tx'); tx.textContent = '';
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearInterval(typeTimer); clearTimeout(talkTimer);
    let i = 0; typeTimer = setInterval(() => { i += 2; tx.textContent = text.slice(0, i); if (i >= text.length) clearInterval(typeTimer); }, 28);
    talkTimer = setTimeout(() => el.classList.remove('on'), (secs || 5) * 1000);
  }
  function hideTalk() { clearInterval(typeTimer); clearTimeout(talkTimer); const el = document.getElementById('cr-op-talk'); if (el) el.classList.remove('on'); }
  const LYRA = ['Rift Gatekeeper Lyra', '🌀'];
  // a large centred caption ("PROLOGUE · You are Lyra…") that fades in and out
  function caption(small, big, secs) {
    let el = document.getElementById('cr-op-cap');
    if (!el) {
      el = document.createElement('div'); el.id = 'cr-op-cap';
      el.style.cssText = "position:fixed;left:50%;top:26%;transform:translateX(-50%);z-index:46;pointer-events:none;text-align:center;color:#F5F2EB;text-shadow:0 2px 16px rgba(0,0,0,.9);opacity:0;transition:opacity .8s;width:min(92vw,680px);";
      document.body.appendChild(el);
    }
    el.innerHTML = `<div style="font:800 12px 'Plus Jakarta Sans',Inter,sans-serif;letter-spacing:.42em;color:#ffd56b">${small}</div><div style="font:900 clamp(20px,3vw,34px) 'Cinzel',serif;letter-spacing:.08em;margin-top:8px">${big}</div>`;
    setTimeout(() => { el.style.opacity = '1'; }, 30);
    setTimeout(() => { el.style.opacity = '0'; }, (secs || 4) * 1000);
  }
  // voice line + matching typed text; browsers keep audio locked until the first click/key, so a line
  // asked for before that waits for the player's first input (instead of playing silently)
  function voiced(game, id, who, icon, text, secs) {
    const A = game.audio;
    const play = () => { talk(who, icon, text, secs || Math.max(4, (A && A.voiceDuration ? A.voiceDuration(id) : 0) + 1.5)); if (A && A.playVoice) A.playVoice(id, 3); };
    if (A && A.ctx && A.ctx.state === 'running') { play(); return; }
    const once = () => { window.removeEventListener('pointerdown', once, true); window.removeEventListener('keydown', once, true); setTimeout(play, 120); };
    window.addEventListener('pointerdown', once, true); window.addEventListener('keydown', once, true);
  }
  // dissolve the game into the storybook's paper before an ink scene starts
  function paperFade(then) {
    let el = document.getElementById('cr-op-fade');
    if (!el) { el = document.createElement('div'); el.id = 'cr-op-fade'; el.style.cssText = 'position:fixed;inset:0;z-index:4999;pointer-events:none;background:#E8E5DF;opacity:0;transition:opacity .9s ease;'; document.body.appendChild(el); }
    setTimeout(() => { el.style.opacity = '1'; }, 30);
    setTimeout(() => { then();setTimeout(() => { el.style.transition = 'none'; el.style.opacity = '0'; void el.offsetWidth; el.style.transition = 'opacity .9s ease'; }, 300); }, 950);
  }
  function banner(title, count, frac, cls) {
    ensureUi();
    const b = document.getElementById('cr-op-banner');
    b.querySelector('.t').textContent = title;
    b.querySelector('.c').textContent = count || '';
    b.querySelector('i').style.width = Math.round(Math.max(0, Math.min(1, frac || 0)) * 100) + '%';
    b.className = 'on' + (cls ? ' ' + cls : '');
    void b.offsetWidth; if (cls && /pop/.test(cls)) b.classList.add('pop');
  }
  function hideBanner() { const b = document.getElementById('cr-op-banner'); if (b) b.className = ''; }
  function hints(list) {
    ensureUi();
    const h = document.getElementById('cr-op-hints');
    h.innerHTML = list.map(x => `<div class="h" data-k="${x.k}">${x.html}</div>`).join('');
  }
  function clearHint(k) { const el = document.querySelector(`#cr-op-hints .h[data-k="${k}"]`); if (el && !el.classList.contains('gone')) { el.classList.add('gone'); setTimeout(() => el.remove(), 700); } }
  let tipTimer = 0;
  function tip(text, secs) { ensureUi(); const t = document.getElementById('cr-op-tip'); t.textContent = text; t.classList.add('on'); clearTimeout(tipTimer); tipTimer = setTimeout(() => t.classList.remove('on'), (secs || 6) * 1000); }

  // ?perf in the URL: time each start-up step of the game build (window.CR_PERF.steps)
  if (/[?&]perf\b/.test(location.search)) {
    window.CR_PERF && (CR_PERF.steps = {});
    ['initThreeScene', 'initSkyDomeAndHorizonScenery', 'initEnvironmentAndZones', 'spawnTownNPCs', 'initMMOWorld', 'initMMORpg', 'initInputHandlers',
      'loadAllAssets', 'initSupabaseCoOp', 'spawnAICompanions', 'spawnZoneMonsters', 'renderForgeModal', 'initMMOTerrain', 'initFoliage', 'buildWorldGround', 'initTerrain'].forEach((k) => {
      const f = GP[k]; if (typeof f !== 'function') return;
      GP[k] = function () { const t = performance.now(); try { return f.apply(this, arguments); } finally { const d = performance.now() - t; CR_PERF.steps[k] = Math.round((CR_PERF.steps[k] || 0) + d); } };
    });
  }

  // First run & mobile load diet: download just what the opening scene needs immediately.
  // Remaining heroes, weapons, NPCs, props and later-zone monsters stream smoothly in the background.
  const loadAll0 = GP.loadAllAssets;
  GP.loadAllAssets = function () {
    const isCoarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if ((!window.CR_FIRST_RUN && !isCoarse) || !this.loader) return loadAll0.apply(this, arguments);
    const L = this.loader, real = L.load.bind(L);
    const cls = (window.CR_ACCOUNT && CR_ACCOUNT.playing && CR_ACCOUNT.playing.cls) || (this.player && this.player.classId) || 'vanguard';
    if (window.CR_FIRST_RUN && this.player && this.player.classId !== cls) this.player.classId = cls;
    const hc = typeof HERO_CLASSES !== 'undefined' ? HERO_CLASSES[cls] : null;
    const keepW = new Set(['Arrow', (this.player && this.player.weaponId) || (hc && hc.defaultWeapon) || '', (this.player && this.player.offhandId) || (hc && hc.defaultOffhand) || ''].filter(Boolean));
    const q = this._deferredLoads = [];
    L.load = function (url) {
      const u = String(url);
      if (window.CR_FIRST_RUN) {
        const hm = /heroes\/hero_(\w+)\.glb/.exec(u);
        const wm = /models\/weapons\/([^/?]+)\.glb/.exec(u);
        if (/models\/npcs\//.test(u) || /models\/props\//.test(u) || /models\/monsters\/(monster_|boss_)/.test(u)
            || (hm && hm[1] !== cls) || (wm && !keepW.has(wm[1]))) {
          q.push(Array.prototype.slice.call(arguments));
          return undefined;
        }
      } else if (isCoarse) {
        if (/models\/monsters\/(monster_|boss_)/.test(u)) {
          q.push(Array.prototype.slice.call(arguments));
          return undefined;
        }
      }
      return real.apply(null, arguments);
    };
    try { return loadAll0.apply(this, arguments); } finally { L.load = real; }
  };
  GP.releaseDeferredLoads = function (immediate) {
    if (this._startDeferredEnvModels) this._startDeferredEnvModels();
    const q = this._deferredLoads || [];
    this._deferredLoads = null;
    const sq = this._staggerQueue || [];
    this._staggerQueue = null;
    const all = q.concat(sq);
    if (!all.length) return;
    if (window.crMark) crMark('deferred_released');
    if (immediate) {
      all.forEach((a) => this.loader.load.apply(this.loader, a));
      return;
    }
    const prio = (u) => (/heroes\//.test(u) ? 0 : (/weapons\//.test(u) ? 1 : (/npcs\/|props\//.test(u) ? 2 : 3)));
    all.sort((a, b) => prio(String(a[0])) - prio(String(b[0])));
    this._staggerQueue = all;
    const step = () => {
      if (!this._staggerQueue || !this._staggerQueue.length) { this._staggerQueue = null; return; }
      const batch = this._staggerQueue.splice(0, 5);
      batch.forEach((a) => this.loader.load.apply(this.loader, a));
      if (this._staggerQueue && this._staggerQueue.length) setTimeout(step, 350);
      else this._staggerQueue = null;
    };
    step();
  };

  // first rendered frame (start-up timing)
  const animate0 = GP.animate;
  GP.animate = function () { if (window.crMark && !this._crFirstFrame) { this._crFirstFrame = true; crMark('first_frame'); } return animate0.apply(this, arguments); };

  const orig = {
    triggerStoryChapter: GP.triggerStoryChapter, updateMMOWorld: GP.updateMMOWorld, onMobDied: GP.onMobDied,
    damagePlayer: GP.damagePlayer, updateTutorial: GP.updateTutorial, gainXP: GP.gainXP, initMMOWorld: GP.initMMOWorld,
    acctPlay: GP.acctPlay, acctLoadChars: GP.acctLoadChars
  };

  Object.assign(GP, {
    initMMOWorld() {
      const r = orig.initMMOWorld.apply(this, arguments);
      // Lyra's temporary saves can be written back as the page unloads (after her record was
      // deleted): sweep any that don't belong to a Lyra currently being played
      const asLyra = !!(window.CR_ACCOUNT && CR_ACCOUNT.playing && CR_ACCOUNT.playing.prologue);
      try {
        if (!asLyra) Object.keys(localStorage).filter(k => k.indexOf('g_lyra-') >= 0).forEach(k => localStorage.removeItem(k));
      } catch (e) { /* storage blocked */ }
      // Lyra only speaks with her own voice: the Ranger class's combat barks stay quiet in her prologue
      if (asLyra && this.audio && this.audio.playVoice && !this.audio._lyraMuted) {
        const A = this.audio, pv = A.playVoice.bind(A); A._lyraMuted = true;
        A.playVoice = (id, ...rest) => (/^hero_/.test(String(id)) ? false : pv(id, ...rest));
      }
      // SPACE skips cinematics too (ESC and the button already do)
      window.addEventListener('keydown', (e) => {
        if (!this.cutsceneActive || (e.key !== ' ' && e.code !== 'Space')) return;
        const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return;
        e.preventDefault(); e.stopPropagation();
        if (this.skipCutscene) this.skipCutscene();
      }, true);
      // prompts fade as soon as the player does the thing
      const moved = (e) => { if (!this._op) return; const k = (e.key || '').toLowerCase(); if ('wasd'.includes(k) && k) clearHint('move'); if (k === '1' || k === 'j') clearHint('attack'); };
      window.addEventListener('keydown', moved, true);
      window.addEventListener('pointerdown', (e) => { if (this._op && e.button === 0 && e.target && e.target.tagName === 'CANVAS') clearHint('attack'); }, true);
      return r;
    },

    openingState() {
      const st = this.mmoState; if (!st) return null;
      return st.opening || (st.opening = { stage: 0, kills: 0 });
    },

    // A hero that never saw Chapter I and never started the opening gets the prologue first.
    triggerStoryChapter(chapterId) {
      const O = this.openingState();
      const asLyra = !!(window.CR_ACCOUNT && CR_ACCOUNT.playing && CR_ACCOUNT.playing.prologue);
      // Lyra never plays the intro herself: past her skirmish she goes back to the champion call
      if (chapterId === 'ch1' && asLyra && O && O.stage >= 2) {
        this._opResumed = true;
        setTimeout(() => this.openChampionCall(), 400);
        return;
      }
      // the champion who answered Lyra's call: straight to the Chapter I intro, then the first hunt
      if (chapterId === 'ch1' && !asLyra && ss.get('cr_after_lyra') && O && O.stage === 0 && this.storyState && !this.storyState.seen.has('ch1')) {
        ss.set('cr_after_lyra', null);
        O.stage = 2; O.fromLyra = true;
        this._opResumed = true; this._opAfterIntro = true;
        this.saveMMOState && this.saveMMOState();
        return orig.triggerStoryChapter.apply(this, arguments);
      }
      if (chapterId === 'ch1' && O && O.stage <= 1 && !this._op && this.storyState && !this.storyState.seen.has('ch1') && (this.player.level || 1) <= 1) {
        O.stage = 1;
        this._opResumed = true;
        window.crMark && crMark('world_enter');
        this.saveMMOState && this.saveMMOState();
        setTimeout(() => this.startPrologue(), 250);
        return;
      }
      return orig.triggerStoryChapter.apply(this, arguments);
    },

    // ---------------------------------------------------------------------------------------------
    // 2. Prologue skirmish
    // ---------------------------------------------------------------------------------------------
    startPrologue() {
      window.crMark && crMark('prologue');
      const p = this.player;
      // a clear spot just outside the town wall, on the road toward the Meadows
      const toward = V(40, 0, 330).normalize();
      const P = toward.clone().multiplyScalar(64);
      const C = P.clone().addScaledVector(toward, 7);                        // the breach, ahead of the hero
      p.pos.set(P.x, 0, P.z); p.vy = 0; p.yaw = Math.atan2(C.x - P.x, C.z - P.z);
      this.cameraYaw = Math.atan2(-toward.x, -toward.z);
      if (this.updatePropStreaming) this.updatePropStreaming(true);
      const hy = this.terrainVisualHeight ? this.terrainVisualHeight(C.x, C.z) : 0;

      // the breach: a violet ring and light (removed afterwards)
      const g = new THREE.Group(); g.position.set(C.x, hy + 0.06, C.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.0, 48), new THREE.MeshBasicMaterial({ color: 0xa070ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; g.add(ring);
      const core = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), new THREE.MeshBasicMaterial({ color: 0x3a1a7a, transparent: true, opacity: 0.55, depthWrite: false }));
      core.rotation.x = -Math.PI / 2; g.add(core);
      // no extra light: adding one would recompile every material's shader (a visible hitch)
      const glow = new THREE.Mesh(new THREE.CircleGeometry(4.2, 40), new THREE.MeshBasicMaterial({ color: 0x8a5cff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.03; g.add(glow);
      const light = glow;
      this.scene.add(g);
      setTimeout(() => this.releaseDeferredLoads && this.releaseDeferredLoads(false), 4500);

      this._op = { t: 0, kills: 0, wave: 1, mobs: [], g, ring, light, C, P, vfxT: 0, done: false };
      // wave 1: three right in front of the hero
      this.prologueWave([['meadow_slime', 1], ['field_rat', 1], ['meadow_slime', 1]], 2.4);
      banner('HOLD THE RIFT BREACH', `0 / ${KILLS} defeated`, 0);
      hints(isTouch()
        ? [{ k: 'move', html: 'Drag the joystick to move' }, { k: 'attack', html: 'Tap ⚔ to attack' }]
        : [{ k: 'move', html: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move' }, { k: 'attack', html: '<kbd>Click</kbd> / <kbd>1</kbd> Attack · <kbd>2</kbd> Skill' }]);
      setTimeout(() => clearHint('move'), 12000);
      setTimeout(() => clearHint('attack'), 16000);
      if (this.spawnVFXFlipbook) this.spawnVFXFlipbook('vortex', C, 5, 0.8, 0x9a6bff);
      if (this.audio && this.audio.playSpell) this.audio.playSpell('warp');
      // played as Lyra: set the scene in her voice
      this._opLyra = !!(window.CR_ACCOUNT && CR_ACCOUNT.playing && CR_ACCOUNT.playing.prologue);
      if (this._opLyra) {
        // make it clear up front: this is a prologue, and you are Lyra (your own hero comes later)
        ensureUi(); document.body.classList.add('cr-prologue');
        caption('PROLOGUE', 'You are Lyra, keeper of the Rift Gate', 5);
        const A = this.audio;
        if (A && A.preloadVoice) A.preloadVoice(['pro_open', 'pro_lyra_0', 'pro_lyra_1', 'pro_lyra_surge', 'call_0', 'call_1', 'call_2', 'answer_0']);
        voiced(this, 'pro_open', 'Lorekeeper Aldous', '📜', 'Ashenvale. The night the sky tore open… and the Rift Gatekeeper stood alone.');
        const next = () => voiced(this, 'pro_lyra_0', LYRA[0], LYRA[1], 'I\'m Lyra, keeper of the Rift Gate. The breach is right outside the walls. I have to hold it!');
        setTimeout(next, ((A && A.voiceDuration && A.voiceDuration('pro_open')) || 5.4) * 1000 + 900);
      }
    },

    // ---------------------------------------------------------------------------------------------
    // 2b. Played as Lyra: the breach surges, she calls across time, the player chooses who answers
    // ---------------------------------------------------------------------------------------------
    lyraTurn() {
      const O = this._op; if (!O) return;
      const p = this.player;
      banner('THE BREACH IS TEARING WIDER!', 'Too many to hold alone…', 1, 'danger pop');
      clearHint('move'); clearHint('attack');
      O.wave = 3;
      this.prologueWave([['meadow_slime', 1], ['field_rat', 1], ['cluckbeast', 2], ['field_rat', 1], ['meadow_slime', 1]], 4);
      this.screenShake = Math.max(this.screenShake || 0, 0.6);
      if (this.spawnVFXFlipbook) this.spawnVFXFlipbook('vortex', O.C, 9, 1.2, 0xb070ff);
      voiced(this, 'pro_lyra_surge', LYRA[0], LYRA[1], 'No… the breach is tearing wider!', 3);
      // a moment of the surge in-world, then the game dissolves into the storybook: Lyra calls across
      // time and four champions turn toward the light ("Who answers?"); the choice screen follows
      setTimeout(() => {
        if (this._op !== O) return;
        if (this.spawnVFXFlipbook) this.spawnVFXFlipbook('eldenring', p.pos, 6, 1.0, 0xffd56b);
        if (this.audio && this.audio.playSpell) this.audio.playSpell('ult');
        const go = () => { if (this._op === O) this.openChampionCall(); };
        paperFade(() => { hideBanner(); hideTalk(); if (this.inkPlayBeat) this.inkPlayBeat('call', {}, go); else go(); });
      }, 2300);
    },

    // the hero-select screen, framed as the champions Lyra's call reaches; picks a class + name
    openChampionCall() {
      const O = this._op;
      if (O) { O.mobs.forEach(m => { if (!m.dead) { const i = this.monsters.indexOf(m); if (i >= 0) this.removeMob(m, i); } }); this.scene.remove(O.g); }
      this._op = null; this._lyraPick = true;
      hideBanner(); hideTalk();
      const st = this.openingState(); if (st) { st.stage = 2; this.saveMMOState && this.saveMMOState(); }
      this.releaseDeferredLoads && this.releaseDeferredLoads(true);             // all four hero models for the previews
      ensureUi();
      document.body.classList.add('cr-lyra-call');
      this._lockedClass = null;                                             // Lyra's class lock no longer applies
      this.acctOpenCreate();
      const ni = document.getElementById('hero-name-input');
      if (ni) { ni.value = 'Rifter ' + (1000 + Math.floor(Math.random() * 9000)); ni.placeholder = 'Name your champion'; }
      const go = document.querySelector('#hero-modal .hs-go'); if (go) go.textContent = 'ANSWER THE CALL';
    },

    // the champion is created: drop Lyra's temporary record, then enter as the champion
    acctPlay(c) {
      if (this._lyraPick && c && !c.prologue) {
        try {
          const list = JSON.parse(ls.get('cr_guest_chars') || '[]');
          list.filter(x => x.prologue).forEach(wipeChar);
          ls.set('cr_guest_chars', JSON.stringify(list.filter(x => !x.prologue)));
        } catch (e) { /* storage blocked */ }
        if (this._acct) this._acct.chars = (this._acct.chars || []).filter(x => !x.prologue);
        ss.set('cr_after_lyra', '1');
        // the champion steps out of the rift beside Lyra, then the game continues as them
        this._lyraPick = false;
        document.body.classList.remove('cr-lyra-call', 'cr-create');
        const hm = document.getElementById('hero-modal'); if (hm) hm.classList.remove('active');
        const args = arguments, cls = String(c.cls || '');
        const title = `${c.name}, the ${cls.charAt(0).toUpperCase() + cls.slice(1)}`;
        const go = () => orig.acctPlay.apply(this, args);
        if (this.inkPlayBeat) { this.inkPlayBeat('answer', { title, kind: cls }, go); return undefined; }
        return go();
      }
      return orig.acctPlay.apply(this, arguments);
    },

    // Lyra's temporary record never shows in the hero list
    async acctLoadChars() {
      const list = await orig.acctLoadChars.apply(this, arguments);
      return (list || []).filter(c => !c.prologue);
    },

    // monsters pour out of the breach toward the hero
    prologueWave(list, hpMul) {
      const O = this._op; if (!O) return;
      const names = { meadow_slime: 'Rift Slime', field_rat: 'Rift Rat', cluckbeast: 'Rift Cluckbeast' };
      const base = Math.atan2(O.P.x - O.C.x, O.P.z - O.C.z);
      list.forEach(([type, level], i) => {
        const a = base + (i - (list.length - 1) / 2) * 0.55;
        const r = 2.4 + (i % 2) * 1.2;
        const x = O.C.x + Math.sin(a) * r, z = O.C.z + Math.cos(a) * r;
        const m = this.createWorldMob(`op_${O.wave}_${i}_${Date.now().toString(36)}`, { type, name: names[type] || 'Rift Spawn', level }, x, z, null);
        m.maxHp = Math.max(8, Math.round(m.maxHp * hpMul)); m.hp = m.maxHp;
        m.dmg = Math.max(1, Math.round(m.dmg * 0.5));
        m.aggroTimer = 40; m.isAdd = true; m._prologue = true;
        O.mobs.push(m);
      });
      if (this.spawnVFXFlipbook) this.spawnVFXFlipbook('vortex', O.C, 5, 0.8, 0x9a6bff);
    },

    finishPrologue() {
      const O = this._op; if (!O || O.done) return;
      O.done = true;
      if (this._opLyra) { this.lyraTurn(); return; }
      const p = this.player;
      banner('BREACH HELD!', 'The rift is collapsing…', 1, 'gold done pop');
      clearHint('move'); clearHint('attack');
      // first loot: a Rare weapon for this class, straight into the bag
      try {
        const it = this.generateItem({ ilvl: Math.max(2, p.level || 1), rarity: 'rare', slot: 'weapon', cls: p.classId });
        it.req = 1;
        if (this.spawnVFXFlipbook) this.spawnVFXFlipbook('eldenring', p.pos, 4, 0.6, 0x4aa8ff);
        this.pickupItem(it);
      } catch (e) { /* inventory full or not ready */ }
      O.mobs.forEach(m => { if (!m.dead) { const i = this.monsters.indexOf(m); if (i >= 0) this.removeMob(m, i); } });
      const st = this.openingState(); st.stage = 2; this.saveMMOState && this.saveMMOState();
      setTimeout(() => {
        this.scene.remove(O.g);
        this._op = null;
        hideBanner();
        this._opAfterIntro = true;
        orig.triggerStoryChapter.call(this, 'ch1');                         // the existing intro, unchanged
      }, 1800);
    },

    // ---------------------------------------------------------------------------------------------
    // 4. First mission in town
    // ---------------------------------------------------------------------------------------------
    startFirstMission() {
      const p = this.player;
      p.pos.set(0, 0, 6.5); p.vy = 0; p.yaw = Math.PI;                          // at the Rift Gate, beside Lyra
      if (this.aiAllies) this.aiAllies.forEach((a) => a.pos.copy(p.pos).add(a.offset));
      if (this.updatePropStreaming) this.updatePropStreaming(true);
      const st = this.openingState(); st.stage = 3; st.kills = 0; this.saveMMOState && this.saveMMOState();
      // pulsing ring where the hero stands
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 40), new THREE.MeshBasicMaterial({ color: 0xffd56b, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.pos.x, 0.06, p.pos.z); this.scene.add(ring);
      this._opRing = { mesh: ring, t: 0 };
      this.placeMissionBeacon();
      this.updateMissionBanner(true);
      if (st.fromLyra && !st.gifted) {
        // the Lyra the player just was is standing at the gate: she recognises who answered
        st.gifted = true; this.saveMMOState && this.saveMMOState();
        voiced(this, 'town_lyra_0', LYRA[0], LYRA[1], 'You came… then the rift chose well. Take my reserve weapon, and clear the Meadows before more break through.', 7.5);
        setTimeout(() => {
          try {
            const it = this.generateItem({ ilvl: 2, rarity: 'rare', slot: 'weapon', cls: p.classId });
            it.req = 1; it.name = `Lyra's ${it.baseName || 'Gift'}`;
            if (this.spawnVFXFlipbook) this.spawnVFXFlipbook('eldenring', p.pos, 4, 0.6, 0x4aa8ff);
            this.pickupItem(it);
          } catch (e) { /* bag full */ }
          tip(isTouch() ? 'Follow the gold beacon into the Meadows' : 'Follow the gold beacon into the Meadows  ·  [Shift] sprint', 7);
        }, 2600);
      } else {
        tip(isTouch() ? 'Follow the gold beacon into the Meadows' : 'Follow the gold beacon into the Meadows  ·  [Shift] sprint', 7);
      }
    },

    // a tall gold beam over the nearest pack of Meadows monsters (moves on as packs are cleared)
    placeMissionBeacon() {
      const p = this.player;
      let best = null, bd = Infinity;
      (this.monsters || []).forEach((m) => {
        if (m.dead || m.isBoss || m._prologue) return;
        const r = Math.hypot(m.pos.x, m.pos.z); if (r < 50 || r > 260) return;
        const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
        if (d < bd) { bd = d; best = m; }
      });
      const target = best ? best.pos.clone() : V(40, 0, 120);
      if (!this._opBeacon) {
        const g = new THREE.Group();
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd56b, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.y = 20; g.add(beam);
        const disc = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.0, 40), new THREE.MeshBasicMaterial({ color: 0xffd56b, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        disc.rotation.x = -Math.PI / 2; disc.position.y = 0.08; g.add(disc);
        this.scene.add(g);
        this._opBeacon = { g, target };
      }
      this._opBeacon.target = target;
      const hy = this.terrainVisualHeight ? this.terrainVisualHeight(target.x, target.z) : 0;
      this._opBeacon.g.position.set(target.x, hy, target.z);
    },

    updateMissionBanner(fresh) {
      const st = this.openingState(); if (!st || st.stage !== 3) return;
      const p = this.player, B = this._opBeacon;
      const d = B ? Math.round(Math.hypot(B.target.x - p.pos.x, B.target.z - p.pos.z)) : 0;
      const where = this.isInTownSafeZone && this.isInTownSafeZone(p.pos) ? `Head into the Meadows · ${d} m` : (d > 14 ? `Beacon ${d} m away` : 'Monsters nearby!');
      const runHint = isTouch() ? (this._autoRun ? ' · Running… (tap stop)' : ' · Tap to Auto-Run') : '';
      const cls = 'gold' + (fresh ? ' pop' : '') + (isTouch() ? (' runnable' + (this._autoRun ? ' running' : '')) : '');
      banner('FIRST HUNT: DEFEAT 10 MONSTERS', `${st.kills} / ${MISSION} · ${where}${runHint}`, st.kills / MISSION, cls);
    },

    finishFirstMission() {
      const st = this.openingState(); st.stage = 4; this.saveMMOState && this.saveMMOState();
      const p = this.player;
      banner('FIRST HUNT COMPLETE!', 'Reward: Epic gear + 1 Free Rift Cache Pull!', 1, 'gold done pop');
      try {
        const it = this.generateItem({ ilvl: Math.max(3, p.level || 1), rarity: 'epic', cls: p.classId });
        it.req = 1;
        if (this.spawnVFXFlipbook) this.spawnVFXFlipbook('eldenring', p.pos, 4.5, 0.7, 0xc07bff);
        this.pickupItem(it);
      } catch (e) { /* bag full */ }
      if (this.grantFreeRiftPull) this.grantFreeRiftPull('First Hunt');
      else if (this.sigilAdd) this.sigilAdd(1, 'First Hunt');
      if (this._opBeacon) { this.scene.remove(this._opBeacon.g); this._opBeacon = null; }
      setTimeout(() => { hideBanner(); tip(isTouch() ? 'Equip your Epic in ☰ → Gear · Claim your free Rift Cache pull in ☰!' : 'Equip your Epic [I] · Press [U] for your free Rift Cache pull!', 8); }, 3500);
    },

    // ---------------------------------------------------------------------------------------------
    // hooks
    // ---------------------------------------------------------------------------------------------
    onMobDied(mob) {
      const r = orig.onMobDied.apply(this, arguments);
      const O = this._op;
      if (O && mob && mob._prologue && !O.done) {
        O.kills++;
        if (O.kills >= KILLS) { banner('HOLD THE RIFT BREACH', `${O.kills} / ${KILLS} defeated`, 1, 'gold pop'); this.finishPrologue(); }
        else if (O.wave === 1 && O.kills >= 3) {
          O.wave = 2;
          banner('MORE ARE COMING THROUGH!', `${O.kills} / ${KILLS} defeated`, O.kills / KILLS, 'pop');
          if (this._opLyra) voiced(this, 'pro_lyra_1', LYRA[0], LYRA[1], 'More of them! They\'re pouring through!', 3.5);
          setTimeout(() => { if (this._op === O && !O.done) this.prologueWave([['field_rat', 1], ['cluckbeast', 2], ['meadow_slime', 1]], 2.8); }, 900);
        } else banner('HOLD THE RIFT BREACH', `${O.kills} / ${KILLS} defeated`, O.kills / KILLS, 'pop');
      } else {
        const st = this.openingState();
        if (st && st.stage === 3 && mob && !mob._prologue && !mob.fromNetwork) {
          st.kills++;
          this.updateMissionBanner(true);
          if (st.kills >= MISSION) this.finishFirstMission();
          else this.placeMissionBeacon();
        }
      }
      return r;
    },

    // the hero can't fall during the prologue
    damagePlayer(dmg) {
      if (this._lyraPick) return undefined;                                 // choosing a champion: nothing can hurt Lyra
      if (this._op) {
        const p = this.player;
        if (p.hp < p.maxHp * 0.4) p.hp = Math.round(p.maxHp * 0.7);
        arguments[0] = Math.min(dmg, Math.round(p.maxHp * 0.12));
      }
      return orig.damagePlayer.apply(this, arguments);
    },

    // keep the tutorial pill out of the way until the first mission is under way
    updateTutorial(dt) {
      const st = this.openingState && this.openingState();
      if (this._op || this._opAfterIntro || (st && (st.stage === 1 || st.stage === 2))) return;
      return orig.updateTutorial ? orig.updateTutorial.apply(this, arguments) : undefined;
    },

    gainXP(amount) {
      const before = this.player.level;
      const r = orig.gainXP.apply(this, arguments);
      const asLyra = !!(window.CR_ACCOUNT && CR_ACCOUNT.playing && CR_ACCOUNT.playing.prologue);
      if (this.player.level > before && before === 1 && !asLyra) {
        tip(isTouch() ? '✦ Talent point earned! Open ☰ → Talents' : '✦ Talent point earned! Press [K] to spend it', 7);
      }
      return r;
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      const O = this._op;
      if (O) {
        O.t += dt; O.vfxT -= dt;
        O.ring.rotation.z += dt * 0.8; O.ring.material.opacity = 0.55 + Math.sin(O.t * 4) * 0.2;
        O.light.material.opacity = 0.14 + Math.sin(O.t * 3) * 0.06;
        if (O.vfxT <= 0 && this.spawnVFXFlipbook) { O.vfxT = 1.6; this.spawnVFXFlipbook('vortex', O.C, 4, 0.6, 0x9a6bff); }
        O.mobs.forEach((m) => { if (!m.dead) m.aggroTimer = Math.max(m.aggroTimer || 0, 5); });
        // safety net: never get stuck in the prologue
        if (O.t > 75 && !O.done) this.finishPrologue();
      }
      // safety net for the deferred downloads (e.g. returning mobile session or skipped prologue)
      if ((this._deferredLoads || (this._envm && !this._envmStarted)) && this.isInWorld) {
        this._deferT = (this._deferT || 0) + dt;
        if (this._deferT > (this._op ? 10 : 3)) this.releaseDeferredLoads(false);
      }
      if (this._opAfterIntro && !this.cutsceneActive && !this._op) {
        this._opAfterIntro = false;
        this.startFirstMission();
      }
      // returning mid-opening (closed the tab during the intro or the hunt)
      if (!this._opResumed && this.isInWorld && !this.cutsceneActive) {
        this._opResumed = true;
        const st = this.openingState();
        if (st && st.stage === 2 && this.storyState && this.storyState.seen.has('ch1')) this.startFirstMission();
        else if (st && st.stage === 2) { this._opAfterIntro = true; orig.triggerStoryChapter.call(this, 'ch1'); }
        else if (st && st.stage === 3) { this.placeMissionBeacon(); this.updateMissionBanner(true); }
      }
      if (this._opRing) {
        const R = this._opRing; R.t += dt;
        R.mesh.scale.setScalar(1 + (R.t % 1.2) * 0.6); R.mesh.material.opacity = 0.9 * (1 - (R.t % 1.2) / 1.2);
        if (R.t > 9) { this.scene.remove(R.mesh); this._opRing = null; }
      }
      if (this._opBeacon) {
        const st = this.openingState();
        this._opBeacon.g.children[1].rotation.z += dt;
        this._opBannerT = (this._opBannerT || 0) + dt;
        if (this._opBannerT > 0.5 && st && st.stage === 3) { this._opBannerT = 0; this.updateMissionBanner(false); }
        if (this._opBannerT === 0 && Math.random() < 0.1) this.placeMissionBeacon();
      }
    }
  });
})();
