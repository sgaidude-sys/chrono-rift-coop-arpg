/* =============================================================================
 * Chrono-Rift — accounts & characters (loaded last)
 *
 *  Flow:  boot splash -> title screen -> Login -> Character select -> (Create) -> world
 *   • Login: Supabase Auth email + password (sign in, create account with an email
 *     confirmation link, forgot password) or "Play as guest" (characters stay on
 *     this device). A remembered session skips straight to Character select.
 *   • Character select: up to 8 characters per account — name, class sigil, level,
 *     last played; Play / Delete (confirmed); Create opens the hero screen in
 *     "create" mode (name + class, then CREATE HERO). The first time, the hero
 *     already saved on this device can be imported so nobody loses progress.
 *   • A character's class is fixed. There is no class switching in the world; the
 *     quick-menu "Characters" button saves and returns to Character select.
 *
 *  Storage: table public.arpg_characters (supabase/migrations/*_arpg_characters.sql,
 *  RLS: each player only sees their own rows). save_data = { mmo, talents, story }:
 *  the same JSON the game already keeps in localStorage, keyed by the character's
 *  own save token ('char_<id>' / 'g_<id>'). Playing a character restores those keys,
 *  then reloads into the world, so every system loads exactly as it always has.
 *  Saves sync every ~20 s while playing and whenever the tab is hidden.
 *  If the table doesn't exist yet, account characters fall back to this device.
 * ============================================================================= */
(function () {
  'use strict';
  const MAX_CHARS = 8;
  const CLASSES = {
    vanguard: { name: 'Vanguard', accent: '#f3c86b' }, ranger: { name: 'Ranger', accent: '#2ee68a' },
    arcanist: { name: 'Arcanist', accent: '#b266ff' }, berserker: { name: 'Berserker', accent: '#ff3b5c' }
  };
  const SIGIL = {
    vanguard: '<svg viewBox="0 0 32 32"><path d="M16 3.5l10 3.6v7.6c0 6.6-4.3 11.2-10 13.8C10.3 25.9 6 21.3 6 14.7V7.1z"/><path d="M16 8.5v15M11 13.5h10"/></svg>',
    ranger: '<svg viewBox="0 0 32 32"><path d="M9 4c8.5 3.2 12.6 8 12.6 12S17.5 24.8 9 28"/><path d="M9 4v24"/><path d="M4.5 16H27M23 12.5l4 3.5-4 3.5"/></svg>',
    arcanist: '<svg viewBox="0 0 32 32"><path d="M9 28L22 6"/><path d="M22 6c-6.5-.6-12 2.6-14.5 8.2 4.3-2.6 9-3.2 13.2-1.6"/><circle cx="16" cy="16" r="12.5" stroke-dasharray="2 3.4"/></svg>',
    berserker: '<svg viewBox="0 0 32 32"><path d="M16 4v24"/><path d="M16 7c-5-.8-8.6 1.6-10 6 3-1.6 6.6-1.4 10 .6M16 7c5-.8 8.6 1.6 10 6-3-1.6-6.6-1.4-10 .6"/><path d="M12.5 28h7"/></svg>'
  };
  const ICON_CHARS = '<svg viewBox="0 0 24 24"><path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/></svg>';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
    json(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  };
  const ago = (iso) => {
    if (!iso) return 'Never played';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 90) return 'Just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  // the character this page load is playing (set right before the reload)
  // Read again when the game is created: the portal build restores saves (CrazyGames Data
  // module) and may pick a brand-new player's first hero (mmo_prologue.js) after this file loads.
  let PLAY = null, GOTO_CHARS = false;
  const readPlay = () => {
    try { PLAY = JSON.parse(ss.get('cr_char') || 'null'); } catch (e) { PLAY = null; }
    GOTO_CHARS = !PLAY && ss.get('cr_goto') === 'charselect';
  };
  readPlay();

  const CSS = `
  body.cr-acct-on #hero-modal { visibility: hidden !important; }
  body.cr-acct-on #hud-top, body.cr-acct-on #hud-bottom, body.cr-acct-on #chat-panel, body.cr-acct-on #minimap-wrap, body.cr-acct-on #ui-quick,
  body.cr-acct-on #ui-status, body.cr-acct-on #ui-avatar, body.cr-acct-on #mmo-quick, body.cr-acct-on #mmo-xpbar, body.cr-acct-on #story-tracker,
  body.cr-acct-on #travel-bar, body.cr-acct-on #party-frames, body.cr-acct-on #touch-joystick, body.cr-acct-on #tut-hint, body.cr-acct-on #tut-pill { visibility: hidden !important; }
  button[onclick*="openModal('hero-modal')"] { display: none !important; }
  #cr-acct { position: fixed; inset: 0; z-index: 80; display: none; color: #F5F2EB; font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif;
    background: linear-gradient(90deg, rgba(5,7,12,.92) 0%, rgba(5,7,12,.7) 34%, rgba(5,7,12,.18) 62%, rgba(5,7,12,.55) 100%); }
  body.cr-acct-on #cr-acct { display: block; animation: crAIn .45s cubic-bezier(.2,.7,.2,1); }
  @keyframes crAIn { from { opacity: 0; } }
  #cr-acct .pane { position: absolute; left: clamp(20px, 6vw, 96px); top: 50%; transform: translateY(-50%); width: min(430px, calc(100vw - 40px)); max-height: calc(100vh - 40px); overflow-y: auto; }
  #cr-acct .brand { font: 900 26px 'Cinzel', serif; letter-spacing: .32em; }
  #cr-acct .brand small { display: block; font: 600 10px 'Plus Jakarta Sans', sans-serif; letter-spacing: .42em; color: #D4AF37; margin-top: 6px; }
  #cr-acct h2 { margin: 34px 0 6px; font: 700 22px 'Cinzel', serif; letter-spacing: .12em; }
  #cr-acct .sub { font-size: 13px; color: rgba(245,242,235,.62); line-height: 1.55; margin: 0 0 20px; }
  #cr-acct label { display: block; font: 700 9.5px 'Plus Jakarta Sans', sans-serif; letter-spacing: .32em; color: rgba(245,242,235,.5); margin: 14px 0 6px; }
  #cr-acct input { all: unset; box-sizing: border-box; width: 100%; padding: 11px 13px; font: 600 15px 'Plus Jakarta Sans', sans-serif; color: #F5F2EB;
    background: rgba(255,255,255,.05); border: 1px solid rgba(212,175,55,.32); border-radius: 8px; transition: border-color .2s, background .2s; }
  #cr-acct input:focus { border-color: #D4AF37; background: rgba(255,255,255,.08); }
  #cr-acct .row { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
  #cr-acct .btn { all: unset; box-sizing: border-box; cursor: pointer; text-align: center; padding: 12px 16px; border-radius: 8px; flex: 1; min-width: 120px;
    font: 700 12.5px 'Plus Jakarta Sans', sans-serif; letter-spacing: .1em; color: #F5F2EB; border: 1px solid rgba(245,242,235,.28); transition: border-color .2s, background .2s, filter .2s; }
  #cr-acct .btn:hover { border-color: #D4AF37; background: rgba(212,175,55,.1); }
  #cr-acct .btn.gold { background: linear-gradient(180deg, #f6dc8c, #D4AF37 55%, #a8842a); color: #17120a; border-color: transparent; font-family: 'Cinzel', serif; font-weight: 900; letter-spacing: .2em; }
  #cr-acct .btn.gold:hover { filter: brightness(1.1); }
  #cr-acct .btn[disabled] { opacity: .45; pointer-events: none; }
  #cr-acct .link { all: unset; cursor: pointer; font-size: 12px; color: rgba(245,242,235,.6); text-decoration: underline; text-underline-offset: 3px; }
  #cr-acct .link:hover { color: #F5F2EB; }
  #cr-acct .or { display: flex; align-items: center; gap: 12px; margin: 22px 0 4px; font-size: 10px; letter-spacing: .3em; color: rgba(245,242,235,.4); }
  #cr-acct .or::before, #cr-acct .or::after { content: ''; flex: 1; height: 1px; background: rgba(245,242,235,.14); }
  #cr-acct .msg { margin-top: 14px; font-size: 13px; line-height: 1.5; min-height: 1px; }
  #cr-acct .msg.err { color: #ff8f9c; } #cr-acct .msg.ok { color: #9ff0c4; }
  #cr-acct .who { display: flex; justify-content: space-between; align-items: center; margin-top: 28px; padding-bottom: 12px; border-bottom: 1px solid rgba(212,175,55,.22); font-size: 12px; color: rgba(245,242,235,.6); }
  #cr-acct .who b { color: #F5F2EB; font-weight: 600; }
  #cr-acct .chars { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
  #cr-acct .ch { display: grid; grid-template-columns: 46px 1fr auto; gap: 14px; align-items: center; padding: 12px 14px; border-radius: 10px; cursor: pointer;
    background: rgba(255,255,255,.035); border: 1px solid rgba(245,242,235,.1); transition: border-color .2s, background .2s; }
  #cr-acct .ch:hover, #cr-acct .ch.sel { border-color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
  #cr-acct .ch .sg { width: 46px; height: 46px; display: grid; place-items: center; position: relative; }
  #cr-acct .ch .sg::before { content: ''; position: absolute; inset: 7px; transform: rotate(45deg); border: 1px solid var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
  #cr-acct .ch svg { width: 22px; height: 22px; fill: none; stroke: #fff; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; position: relative; }
  #cr-acct .ch .nm { font: 700 16px 'Cinzel', serif; letter-spacing: .06em; }
  #cr-acct .ch .meta { font-size: 11.5px; color: rgba(245,242,235,.55); margin-top: 3px; }
  #cr-acct .ch .meta b { color: var(--c); font-weight: 700; }
  #cr-acct .ch .del { all: unset; cursor: pointer; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 6px; color: rgba(245,242,235,.45); font-size: 16px; }
  #cr-acct .ch .del:hover { color: #ff8f9c; background: rgba(255,80,100,.12); }
  #cr-acct .empty { padding: 18px; border: 1px dashed rgba(245,242,235,.2); border-radius: 10px; font-size: 13px; color: rgba(245,242,235,.6); line-height: 1.55; }
  #cr-acct .note { margin-top: 12px; font-size: 11.5px; color: #f3c86b; line-height: 1.5; }
  #cr-acct .cfm { position: absolute; inset: 0; display: none; place-items: center; background: rgba(4,5,9,.6); }
  #cr-acct .cfm.on { display: grid; }
  #cr-acct .cfm .box { width: min(380px, calc(100vw - 40px)); padding: 22px; border-radius: 12px; background: rgba(14,17,23,.94); border: 1px solid rgba(212,175,55,.4); }
  #cr-acct .cfm h3 { margin: 0 0 8px; font: 700 18px 'Cinzel', serif; }
  #cr-acct .cfm p { margin: 0; font-size: 13px; color: rgba(245,242,235,.7); line-height: 1.55; }
  #cr-acct .btn.danger { border-color: rgba(255,90,110,.6); color: #ffb3bc; }
  #cr-acct .btn.danger:hover { background: rgba(255,80,100,.14); }
  body.cr-create #hero-modal .hs-back { display: inline-block; }
  #hero-modal .hs-back { display: none; all: unset; cursor: pointer; position: absolute; left: clamp(20px, 4.5vw, 72px); bottom: clamp(20px, 5vh, 56px); padding: 6px 0; font: 600 12px 'Plus Jakarta Sans', sans-serif; letter-spacing: .14em; color: rgba(245,242,235,.7); }
  body.cr-create #hero-modal .hs-back { display: block; }
  body.cr-create #hero-modal .hs-hint { display: none; }
  @media (max-width: 900px) { body.cr-create #hero-modal .hs-back { left: 16px; right: auto; top: 12px; bottom: auto; } body.cr-create #hero-modal .hs-brand { visibility: hidden; } }
  #hero-modal .hs-back:hover { color: #F5F2EB; }
  @media (max-width: 760px) {
    #cr-acct { background: linear-gradient(180deg, rgba(5,7,12,.55) 0%, rgba(5,7,12,.88) 40%, rgba(5,7,12,.95) 100%); }
    #cr-acct .pane { left: 16px; right: 16px; width: auto; top: auto; bottom: 16px; transform: none; max-height: calc(100vh - 32px); }
    #cr-acct h2 { margin-top: 20px; }
  }
  @media (max-height: 520px) {
    #cr-acct .pane { top: 10px; bottom: 10px; transform: none; max-height: calc(100vh - 20px); }
    #cr-acct .brand { font-size: 18px; }
    #cr-acct .brand small { display: none; }
    #cr-acct h2 { margin: 12px 0 4px; font-size: 16px; }
    #cr-acct .sub { font-size: 11.5px; margin-bottom: 10px; }
    #cr-acct .who { margin-top: 10px; padding-bottom: 8px; }
    #cr-acct .ch { padding: 8px 10px; gap: 10px; }
    #cr-acct .ch .sg { width: 34px; height: 34px; }
    #cr-acct .ch .nm { font-size: 14px; }
    #cr-acct .btn { padding: 9px 12px; font-size: 11.5px; }
  }`;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld, showTitleScreen: GP.showTitleScreen, dismissTitleScreen: GP.dismissTitleScreen,
    startOrResumeGame: GP.startOrResumeGame, selectClassCard: GP.selectClassCard, openModal: GP.openModal,
    saveHeroToSupabase: GP.saveHeroToSupabase, updateMMOWorld: GP.updateMMOWorld
  };

  Object.assign(GP, {
    initMMOWorld() {
      readPlay();
      orig.initMMOWorld.call(this);
      try { this.initAccount(); } catch (e) { console.warn('[Account] init failed', e); document.body.classList.add('cr-booted'); }
    },

    initAccount() {
      if (this._acct) return;
      const st = document.createElement('style'); st.id = 'account-css'; st.textContent = CSS; document.head.appendChild(st);
      const root = document.createElement('div'); root.id = 'cr-acct';
      root.innerHTML = '<div class="pane"></div><div class="cfm"><div class="box"></div></div>';
      document.body.appendChild(root);
      root.addEventListener('click', (e) => this.onAcctClick(e));
      // hovering a hero card previews that class on the 3D hero behind the menu
      root.addEventListener('mouseover', (e) => {
        const card = e.target.closest && e.target.closest('.ch');
        if (!card || !this._acct || this._acct.previewI === card.dataset.i) return;
        this._acct.previewI = card.dataset.i;
        const c = this._acct.chars[+card.dataset.i];
        if (c && c.cls !== this.player.classId) { try { this.selectClassCard(c.cls, true); } catch (err) { /* preview only */ } }
      });
      root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); const f = root.querySelector('[data-a="signin"], [data-a="submit"]'); if (f) f.click(); } e.stopPropagation(); });
      this._acct = { root, pane: root.querySelector('.pane'), cfm: root.querySelector('.cfm'), mode: null, user: null, chars: [], cloud: null, saveT: 0, dirty: false };
      this.addAcctBackButton();
      this.addCharactersQuickButton();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.acctSaveNow(); });
      window.addEventListener('pagehide', () => this.acctSaveNow());
      if (PLAY) this.acctAutoEnter();
      else if (GOTO_CHARS) {
        ss.set('cr_goto', null);
        document.body.classList.add('cr-booted');
        this.acctStart();
      }
    },

    // ---- title screen hand-off ---------------------------------------------------
    showTitleScreen() {
      if (PLAY || GOTO_CHARS) return;
      const r = orig.showTitleScreen.apply(this, arguments);
      document.body.classList.add('cr-booted');
      return r;
    },
    dismissTitleScreen() {
      const r = orig.dismissTitleScreen.apply(this, arguments);
      if (!PLAY && !this.isInWorld && this._acct && !this._acctStarted) this.acctStart();
      return r;
    },

    // ---- entering the world with the chosen character ------------------------------
    acctAutoEnter() {
      const c = PLAY;
      const msg = document.getElementById('cr-boot-msg');
      if (msg) msg.textContent = `Entering Ashenvale as ${c.name}…`;
      this._acct.mode = c.mode;
      this._lockedClass = c.cls;
      this.player.name = c.name;
      const ni = document.getElementById('hero-name-input'); if (ni) ni.value = c.name;
      let tries = 0;
      const go = () => {
        tries++;
        if ((!this.player.glbNode && tries < 40) || !this.selectClassCard) { setTimeout(go, 150); return; }
        try { this.selectClassCard(c.cls, true); } catch (e) { /* keep going */ }
        this.player.name = c.name;
        if (ni) ni.value = c.name;
        this.startOrResumeGame();
        setTimeout(() => document.body.classList.add('cr-booted'), 600);
      };
      setTimeout(go, 200);
    },

    startOrResumeGame() {
      if (this._acctCreate) { this.acctCreateFromHeroScreen(); return; }
      if (!PLAY && this._acct) return;          // the world is only entered with a chosen hero
      const r = orig.startOrResumeGame.apply(this, arguments);
      if (PLAY) { this.player.name = PLAY.name; }
      return r;
    },

    // a character's class is fixed for life
    selectClassCard(classId, silent) {
      if (this._lockedClass && classId !== this._lockedClass) return;
      return orig.selectClassCard.apply(this, arguments);
    },
    openModal(id) {
      if (id === 'hero-modal' && (this.isInWorld || PLAY) && !this._acctCreate) return;
      return orig.openModal.apply(this, arguments);
    },

    // ======================================================================
    // Account screens
    // ======================================================================
    async acctStart() {
      this._acctStarted = true;
      document.body.classList.add('cr-acct-on', 'cr-booted');
      // a remembered sign-in goes straight to the characters
      const sb = await this.acctClient();
      const mode = ss.get('cr_mode') || ls.get('cr_last_mode');
      if (sb) {
        try {
          const { data } = await sb.auth.getSession();
          if (data && data.session && data.session.user) { this._acct.mode = 'account'; this._acct.user = data.session.user; return this.acctShowChars(); }
        } catch (e) { /* offline */ }
      }
      if (mode === 'guest') { this._acct.mode = 'guest'; return this.acctShowChars(); }
      this.acctShowLogin();
    },

    async acctClient() {
      for (let i = 0; i < 30 && !this.supabase; i++) await new Promise(r => setTimeout(r, 150));
      return this.supabase || null;
    },

    acctShowLogin(view, note) {
      const A = this._acct;
      A.view = view || 'login';
      const reset = A.view === 'reset', signup = A.view === 'signup';
      A.pane.innerHTML = `
        <div class="brand">CHRONO-RIFT<small>CHRONICLES OF ASHENVALE</small></div>
        <h2>${reset ? 'Reset password' : (signup ? 'Create account' : 'Sign in')}</h2>
        <p class="sub">${reset ? "Enter your email and we'll send you a link to choose a new password." : (signup ? 'Your heroes are saved to your account and follow you to any device.' : 'Sign in to continue with your heroes on any device.')}</p>
        <label for="cr-email">EMAIL</label><input id="cr-email" type="email" autocomplete="email" spellcheck="false" value="${esc(ls.get('cr_last_email') || '')}" />
        ${reset ? '' : `<label for="cr-pass">PASSWORD</label><input id="cr-pass" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" />`}
        <div class="row"><button class="btn gold" data-a="${reset ? 'reset' : (signup ? 'signup' : 'signin')}">${reset ? 'SEND LINK' : (signup ? 'CREATE ACCOUNT' : 'SIGN IN')}</button></div>
        <div class="row" style="justify-content:space-between;margin-top:14px">
          ${signup || reset ? '<button class="link" data-a="v-login">I already have an account</button>' : '<button class="link" data-a="v-signup">Create an account</button><button class="link" data-a="v-reset">Forgot password?</button>'}
        </div>
        <div class="msg${note && note.err ? ' err' : (note ? ' ok' : '')}">${note ? esc(note.text) : ''}</div>
        <div class="or">OR</div>
        <div class="row" style="margin-top:8px"><button class="btn" data-a="guest">PLAY AS GUEST</button></div>
        <p class="sub" style="margin-top:10px;font-size:11.5px">Guest heroes are saved on this device only.</p>`;
      const f = A.pane.querySelector(ls.get('cr_last_email') && !reset ? '#cr-pass' : '#cr-email'); if (f) setTimeout(() => f.focus(), 50);
    },

    acctMsg(text, err) {
      const m = this._acct.pane.querySelector('.msg');
      if (m) { m.textContent = text; m.className = 'msg ' + (err ? 'err' : 'ok'); }
    },

    async acctAuth(kind) {
      const A = this._acct, sb = await this.acctClient();
      const email = (A.pane.querySelector('#cr-email') || {}).value || '';
      const pass = (A.pane.querySelector('#cr-pass') || {}).value || '';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { this.acctMsg('Enter a valid email address.', true); return; }
      if (kind !== 'reset' && pass.length < 6) { this.acctMsg('Passwords need at least 6 characters.', true); return; }
      if (!sb) { this.acctMsg("Can't reach the login server right now. You can still play as a guest.", true); return; }
      ls.set('cr_last_email', email.trim());
      const btn = A.pane.querySelector('.btn.gold'); if (btn) btn.setAttribute('disabled', '');
      this.acctMsg(kind === 'signin' ? 'Signing in…' : (kind === 'signup' ? 'Creating your account…' : 'Sending…'), false);
      const redirect = location.origin + location.pathname;
      try {
        if (kind === 'signin') {
          const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
          if (error) throw error;
          A.mode = 'account'; A.user = data.user; ss.set('cr_mode', 'account'); ls.set('cr_last_mode', 'account');
          return this.acctShowChars();
        }
        if (kind === 'signup') {
          const { data, error } = await sb.auth.signUp({ email: email.trim(), password: pass, options: { emailRedirectTo: redirect } });
          if (error) throw error;
          if (data && data.session) { A.mode = 'account'; A.user = data.user; ss.set('cr_mode', 'account'); ls.set('cr_last_mode', 'account'); return this.acctShowChars(); }
          return this.acctShowLogin('login', { text: `Check ${email.trim()} for a confirmation link, then sign in here.` });
        }
        if (kind === 'reset') {
          const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect });
          if (error) throw error;
          return this.acctShowLogin('login', { text: 'If that email has an account, a reset link is on its way.' });
        }
      } catch (e) {
        if (btn) btn.removeAttribute('disabled');
        const m = String((e && e.message) || e || '');
        let text = m;
        if (/invalid login credentials/i.test(m)) text = 'Wrong email or password.';
        else if (/email not confirmed/i.test(m)) text = 'Please confirm your email first — check your inbox for the link.';
        else if (/already registered|already exists/i.test(m)) text = 'That email already has an account. Sign in instead.';
        else if (/fetch|network|failed to/i.test(m)) text = "Can't reach the login server right now. You can still play as a guest.";
        else if (/rate limit/i.test(m)) text = 'Too many attempts. Please wait a minute and try again.';
        this.acctMsg(text || 'Something went wrong. Please try again.', true);
      }
    },

    // ======================================================================
    // Characters: storage
    // ======================================================================
    acctLocalKey() { const A = this._acct; return A.mode === 'guest' ? 'cr_guest_chars' : `cr_local_chars_${A.user && A.user.id}`; },
    acctToken(c) { return (this._acct.mode === 'guest' || c.local ? 'g_' : 'char_') + c.id; },

    async acctLoadChars() {
      const A = this._acct;
      A.cloud = null;
      if (A.mode === 'account') {
        const sb = await this.acctClient();
        try {
          const { data, error } = await sb.from('arpg_characters').select('id,name,class_id,level,updated_at,created_at').order('updated_at', { ascending: false });
          if (error) throw error;
          A.cloud = true;
          return (data || []).map(r => ({ id: r.id, name: r.name, cls: r.class_id, level: r.level, updated: r.updated_at }));
        } catch (e) {
          A.cloud = false;
          A.cloudErr = /PGRST205|does not exist|schema cache/i.test(String(e && (e.code || e.message))) ? 'missing' : 'offline';
        }
      }
      return ls.json(this.acctLocalKey(), []).map(c => Object.assign({ local: true }, c));
    },

    async acctShowChars(note) {
      const A = this._acct;
      A.pane.innerHTML = '<div class="brand">CHRONO-RIFT<small>CHRONICLES OF ASHENVALE</small></div><p class="sub" style="margin-top:30px">Loading your heroes…</p>';
      document.body.classList.remove('cr-create');
      this._acctCreate = false;
      this._lockedClass = null;
      A.chars = await this.acctLoadChars();
      A.previewI = null;
      if (A.chars[0] && A.chars[0].cls !== this.player.classId) { try { this.selectClassCard(A.chars[0].cls, true); } catch (err) { /* preview only */ } }
      const who = A.mode === 'guest' ? 'Playing as <b>Guest</b>' : `Signed in as <b>${esc(A.user && A.user.email)}</b>`;
      const legacy = this.acctLegacySave();
      let list = A.chars.map((c, i) => {
        const k = CLASSES[c.cls] || CLASSES.vanguard;
        return `<div class="ch" data-a="play" data-i="${i}" style="--c:${k.accent}" tabindex="0">
          <span class="sg">${SIGIL[c.cls] || SIGIL.vanguard}</span>
          <span><div class="nm">${esc(c.name)}</div><div class="meta"><b>${k.name}</b> · Level ${c.level || 1} · ${ago(c.updated)}</div></span>
          <button class="del" data-a="del" data-i="${i}" aria-label="Delete ${esc(c.name)}" title="Delete">✕</button></div>`;
      }).join('');
      if (!A.chars.length) list = `<div class="empty">No heroes yet. Create your first one — pick a class and a name.${legacy ? `<div class="row" style="margin-top:12px"><button class="btn" data-a="import">IMPORT ${esc(legacy.name.toUpperCase())} FROM THIS DEVICE</button></div>` : ''}</div>`;
      const full = A.chars.length >= MAX_CHARS;
      A.pane.innerHTML = `
        <div class="brand">CHRONO-RIFT<small>CHRONICLES OF ASHENVALE</small></div>
        <div class="who"><span>${who}</span><button class="link" data-a="signout">${A.mode === 'guest' ? 'Sign in instead' : 'Sign out'}</button></div>
        <h2 style="margin-top:22px">Your heroes</h2>
        <div class="chars">${list}</div>
        <div class="row"><button class="btn gold" data-a="create"${full ? ' disabled' : ''}>CREATE HERO</button></div>
        ${full ? `<p class="note">You have ${MAX_CHARS} heroes, the most allowed. Delete one to make room.</p>` : ''}
        ${A.mode === 'account' && A.cloud === false ? `<p class="note">${A.cloudErr === 'missing' ? "Cloud saves aren't set up on the server yet, so these heroes are saved on this device for now." : "Couldn't reach the save server, so these heroes are saved on this device for now."}</p>` : ''}
        ${note ? `<div class="msg ${note.err ? 'err' : 'ok'}">${esc(note.text)}</div>` : ''}`;
    },

    // the hero saved on this device before accounts existed (offered as a one-time import)
    acctLegacySave() {
      const tok = ls.get('arpg_player_token');
      if (!tok || /^(char_|g_)/.test(tok) || ls.get('cr_legacy_imported_' + tok)) return null;
      let best = null;
      Object.keys(CLASSES).forEach((cls) => {
        const s = ls.json(`arpg_mmo_v1_${tok}_${cls}`, null);
        if (s && ((s.level || 1) > 1 || (s.xp || 0) > 0) && (!best || (s.level || 1) > best.level)) best = { cls, level: s.level || 1, raw: ls.get(`arpg_mmo_v1_${tok}_${cls}`) };
      });
      if (!best) return null;
      best.tok = tok;
      best.name = (ls.get('arpg_hero_name') || 'Hero').slice(0, 22);
      return best;
    },

    async acctInsertChar(name, cls, saveData) {
      const A = this._acct;
      const row = { name, cls, level: (saveData && saveData.level) || 1, updated: new Date().toISOString() };
      if (A.mode === 'account' && A.cloud) {
        const sb = await this.acctClient();
        const { data, error } = await sb.from('arpg_characters').insert({ user_id: A.user.id, name, class_id: cls, level: row.level, save_data: saveData || {} }).select('id').single();
        if (error) throw error;
        row.id = data.id;
      } else {
        row.id = uid(); row.local = true;
        const list = ls.json(this.acctLocalKey(), []);
        list.unshift({ id: row.id, name, cls, level: row.level, updated: row.updated, save: saveData || {} });
        ls.set(this.acctLocalKey(), JSON.stringify(list));
      }
      return row;
    },

    async acctDeleteChar(c) {
      const A = this._acct;
      if (A.mode === 'account' && A.cloud && !c.local) {
        const sb = await this.acctClient();
        const { error } = await sb.from('arpg_characters').delete().eq('id', c.id);
        if (error) throw error;
      } else {
        ls.set(this.acctLocalKey(), JSON.stringify(ls.json(this.acctLocalKey(), []).filter(x => x.id !== c.id)));
      }
      const tok = this.acctToken(c);
      Object.keys(CLASSES).forEach((k) => ls.set(`arpg_mmo_v1_${tok}_${k}`, null));
      ls.set(`arpg_talents_v1_${tok}`, null);
    },

    async acctFetchSave(c) {
      const A = this._acct;
      if (A.mode === 'account' && A.cloud && !c.local) {
        const sb = await this.acctClient();
        const { data, error } = await sb.from('arpg_characters').select('save_data').eq('id', c.id).single();
        if (error) throw error;
        return (data && data.save_data) || {};
      }
      const e = ls.json(this.acctLocalKey(), []).find(x => x.id === c.id);
      return (e && e.save) || {};
    },

    // ======================================================================
    // Characters: actions
    // ======================================================================
    async acctPlay(c) {
      const A = this._acct;
      A.pane.querySelectorAll('.ch').forEach(el => el.classList.toggle('sel', +el.dataset.i === A.chars.indexOf(c)));
      let save = {};
      try { save = await this.acctFetchSave(c); } catch (e) { return this.acctShowChars({ text: "Couldn't load that hero. Please try again.", err: true }); }
      const tok = this.acctToken(c);
      if (save.mmo) ls.set(`arpg_mmo_v1_${tok}_${c.cls}`, typeof save.mmo === 'string' ? save.mmo : JSON.stringify(save.mmo));
      if (save.talents) ls.set(`arpg_talents_v1_${tok}`, typeof save.talents === 'string' ? save.talents : JSON.stringify(save.talents));
      if (save.story) ls.set('arpg_story_state', typeof save.story === 'string' ? save.story : JSON.stringify(save.story));
      else ls.set('arpg_story_state', null);
      ls.set('arpg_player_token', tok);
      ls.set('arpg_hero_name', c.name);
      ss.set('cr_mode', A.mode);
      ss.set('cr_char', JSON.stringify({ id: c.id, tok, name: c.name, cls: c.cls, mode: A.mode, local: !!c.local, uid: A.user && A.user.id }));
      location.reload();
    },

    acctOpenCreate() {
      const A = this._acct;
      this._acctCreate = true;
      document.body.classList.add('cr-create');
      document.body.classList.remove('cr-acct-on');
      const ni = document.getElementById('hero-name-input');
      if (ni) { ni.value = ''; ni.placeholder = 'Name your hero'; setTimeout(() => ni.focus(), 80); }
      const go = document.querySelector('#hero-modal .hs-go'); if (go) go.textContent = 'CREATE HERO';
      const hm = document.getElementById('hero-modal'); if (hm) hm.classList.add('active');
      this.selectClassCard(this.player.classId || 'vanguard', true);     // sync the class details panel
      A.createMsg = null;
    },

    acctCloseCreate() {
      this._acctCreate = false;
      document.body.classList.remove('cr-create');
      document.body.classList.add('cr-acct-on');
      const go = document.querySelector('#hero-modal .hs-go'); if (go) go.textContent = 'ENTER ASHENVALE';
      this.acctShowChars();
    },

    async acctCreateFromHeroScreen() {
      const A = this._acct;
      const ni = document.getElementById('hero-name-input');
      const name = ((ni && ni.value) || '').trim().replace(/\s+/g, ' ');
      const cls = this.player.classId || 'vanguard';
      const fail = (t) => { if (this.spawnFloatingText && this.player) this.spawnFloatingText(this.player.pos.clone().setY(2.6), t, '#ff8f9c', 16); if (ni) { ni.focus(); ni.style.borderBottomColor = '#ff8f9c'; setTimeout(() => { ni.style.borderBottomColor = ''; }, 1500); } this.acctToast(t); };
      if (name.length < 2 || name.length > 22) return fail('Names need 2–22 characters');
      if (!/^[\p{L}\p{N}][\p{L}\p{N} '_-]*$/u.test(name)) return fail('Use letters, numbers, spaces, - or _');
      if (A.chars.some(c => c.name.toLowerCase() === name.toLowerCase())) return fail('You already have a hero with that name');
      if (A.chars.length >= MAX_CHARS) return fail(`You can have up to ${MAX_CHARS} heroes`);
      const room = document.getElementById('room-code-input'); if (room && room.value) ls.set('arpg_room_code', room.value.trim().toUpperCase());
      try {
        const c = await this.acctInsertChar(name, cls, {});
        A.chars.unshift(c);
        this._acctCreate = false;
        document.body.classList.remove('cr-create');
        this.acctPlay(c);
      } catch (e) {
        fail(/duplicate|unique/i.test(String(e && (e.message || e.code))) ? 'You already have a hero with that name' : "Couldn't create the hero. Please try again.");
      }
    },

    acctToast(text) {
      let t = document.getElementById('cr-acct-toast');
      if (!t) {
        t = document.createElement('div'); t.id = 'cr-acct-toast';
        t.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:90;padding:10px 16px;border-radius:8px;background:rgba(14,17,23,.92);border:1px solid rgba(255,143,156,.5);color:#ffd4d9;font:600 13px "Plus Jakarta Sans",sans-serif;transition:opacity .3s;pointer-events:none';
        document.body.appendChild(t);
      }
      t.textContent = text; t.style.opacity = '1';
      clearTimeout(this._acctToastT); this._acctToastT = setTimeout(() => { t.style.opacity = '0'; }, 2600);
    },

    async acctImportLegacy() {
      const L = this.acctLegacySave(); if (!L) return;
      const talents = ls.get(`arpg_talents_v1_${L.tok}`);
      const save = { mmo: L.raw, talents: talents || undefined, story: ls.get('arpg_story_state') || undefined, level: L.level };
      try {
        const c = await this.acctInsertChar(L.name, L.cls, save);
        ls.set('cr_legacy_imported_' + L.tok, '1');
        this.acctShowChars({ text: `${L.name} has been added to your heroes.` });
        return c;
      } catch (e) { this.acctShowChars({ text: "Couldn't import that hero. Please try again.", err: true }); }
    },

    acctConfirm(title, text, okLabel, onOk) {
      const A = this._acct;
      A.cfm.querySelector('.box').innerHTML = `<h3>${esc(title)}</h3><p>${text}</p><div class="row"><button class="btn danger" data-a="cfm-ok">${esc(okLabel)}</button><button class="btn" data-a="cfm-no">Cancel</button></div>`;
      A.cfm.classList.add('on');
      A.cfmOk = onOk;
    },

    async onAcctClick(e) {
      const A = this._acct;
      const el = e.target.closest('[data-a]'); if (!el) return;
      const a = el.dataset.a;
      if (a === 'del') e.stopPropagation();
      if (a === 'signin' || a === 'signup' || a === 'reset') return this.acctAuth(a);
      if (a === 'v-login') return this.acctShowLogin('login');
      if (a === 'v-signup') return this.acctShowLogin('signup');
      if (a === 'v-reset') return this.acctShowLogin('reset');
      if (a === 'guest') { A.mode = 'guest'; A.user = null; ss.set('cr_mode', 'guest'); ls.set('cr_last_mode', 'guest'); return this.acctShowChars(); }
      if (a === 'signout') {
        if (A.mode === 'account') { try { const sb = await this.acctClient(); if (sb) await sb.auth.signOut(); } catch (err) { /* offline */ } }
        A.mode = null; A.user = null; ss.set('cr_mode', null); ls.set('cr_last_mode', null);
        return this.acctShowLogin('login');
      }
      if (a === 'play') return this.acctPlay(A.chars[+el.dataset.i]);
      if (a === 'create') return this.acctOpenCreate();
      if (a === 'import') return this.acctImportLegacy();
      if (a === 'del') {
        const c = A.chars[+el.dataset.i];
        return this.acctConfirm(`Delete ${c.name}?`, `This permanently deletes <b>${esc(c.name)}</b> (Level ${c.level || 1} ${esc((CLASSES[c.cls] || {}).name || '')}) and all their progress. This can't be undone.`, 'DELETE HERO', async () => {
          try { await this.acctDeleteChar(c); this.acctShowChars({ text: `${c.name} was deleted.` }); } catch (err) { this.acctShowChars({ text: "Couldn't delete that hero. Please try again.", err: true }); }
        });
      }
      if (a === 'cfm-no') { A.cfm.classList.remove('on'); A.cfmOk = null; return; }
      if (a === 'cfm-ok') { A.cfm.classList.remove('on'); const f = A.cfmOk; A.cfmOk = null; if (f) f(); }
    },

    addAcctBackButton() {
      const tryAdd = () => {
        const bottom = document.querySelector('#hero-modal .hs-root');
        if (!bottom) return false;
        if (bottom.querySelector('.hs-back')) return true;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'hs-back'; b.textContent = '← BACK TO YOUR HEROES';
        b.addEventListener('click', () => this.acctCloseCreate());
        bottom.appendChild(b);
        return true;
      };
      if (!tryAdd()) setTimeout(tryAdd, 500);
    },

    addCharactersQuickButton() {
      const tryAdd = () => {
        const bar = document.getElementById('ui-quick');
        if (!bar) return false;
        if (bar.querySelector('[data-a="chars"]')) return true;
        const b = document.createElement('button');
        b.setAttribute('aria-label', 'Characters'); b.dataset.a = 'chars'; b.title = 'Characters'; b.innerHTML = ICON_CHARS;
        b.addEventListener('click', (e) => { e.stopPropagation(); this.acctLeaveToCharacters(); });
        bar.appendChild(b);
        return true;
      };
      if (!tryAdd()) { let n = 0; const iv = setInterval(() => { if (tryAdd() || ++n > 40) clearInterval(iv); }, 500); }
    },

    async acctLeaveToCharacters() {
      if (!PLAY) { location.reload(); return; }
      if (this.inCombatForMount && this.inCombatForMount()) { this.acctToast("You can't leave in the middle of a fight"); return; }
      if (!window.confirm('Save and return to your heroes?')) return;
      await this.acctSaveNow(true);
      ss.set('cr_char', null);
      ss.set('cr_goto', 'charselect');
      location.reload();
    },

    // ======================================================================
    // Saving the character
    // ======================================================================
    acctCollectSave() {
      const c = PLAY; if (!c) return null;
      if (this.saveMMOState) { try { this.saveMMOState(); } catch (e) { /* ignore */ } }
      const mmo = ls.get(`arpg_mmo_v1_${c.tok}_${c.cls}`);
      return {
        mmo: mmo || undefined,
        talents: ls.get(`arpg_talents_v1_${c.tok}`) || undefined,
        story: ls.get('arpg_story_state') || undefined,
        level: this.player.level || 1
      };
    },

    async acctSaveNow(wait) {
      const c = PLAY; if (!c || !this._acct || !this.isInWorld) return;
      const save = this.acctCollectSave(); if (!save) return;
      const now = new Date().toISOString();
      if (c.mode === 'account' && !c.local && this.supabase) {
        const p = this.supabase.from('arpg_characters').update({ level: save.level, save_data: save }).eq('id', c.id);
        if (wait) { try { await p; } catch (e) { /* offline: local keys still hold it */ } } else p.then(() => {}, () => {});
      } else {
        const key = c.mode === 'guest' ? 'cr_guest_chars' : `cr_local_chars_${c.uid}`;
        const list = ls.json(key, []);
        const e = list.find(x => x.id === c.id);
        if (e) { e.level = save.level; e.updated = now; e.save = save; ls.set(key, JSON.stringify(list)); }
      }
      this._acct.lastSave = performance.now();
    },

    async saveHeroToSupabase() {
      const r = await (orig.saveHeroToSupabase ? orig.saveHeroToSupabase.apply(this, arguments) : undefined);
      if (PLAY && this._acct) this._acct.dirty = true;
      return r;
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      const A = this._acct; if (!A || !PLAY || !this.isInWorld) return;
      A.saveT += dt;
      if (A.saveT > 20 && (A.dirty || A.saveT > 60)) { A.saveT = 0; A.dirty = false; this.acctSaveNow(false); }
      if (this.player.name !== PLAY.name) this.player.name = PLAY.name;
    }
  });

  window.CR_ACCOUNT = { MAX_CHARS, get playing() { return PLAY; } };
})();
