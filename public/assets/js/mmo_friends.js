/* =============================================================================
 * Chrono-Rift — "Play with friends" for portal builds (CrazyGames / offline edition)
 *
 *  Free peer-to-peer co-op on top of mmo_net.js:
 *   • 👥 button (desktop quick menu / mobile top bar) opens the panel
 *   • Create a room -> 5-character code + invite link (CrazyGames SDK invite link when
 *     available, otherwise this page's address with ?join=CODE)
 *   • Join with a code, or arrive through an invite link: the room is joined automatically once
 *     the player is in the world (a brand-new player finishes Lyra's prologue first)
 *   • ⚡ Quick Play: join the busiest public room with space (or open a new public one), and a
 *     list of open public rooms. "Friends only" rooms are never listed.
 *   • Up to 4 players; the panel lists who is connected. Offensive hero names show as "Hero".
 *   • Anything going wrong (room full, multiplayer switched off, a network that blocks direct
 *     connections) shows a short note and the player simply keeps playing solo
 *  Solo players never connect anywhere: the network is only used once a room is created/joined.
 *
 *  CrazyGames integration (docs.crazygames.com/requirements/multiplayer):
 *   • updateRoom({ roomId, isJoinable, inviteParams }) on join, isJoinable:false while full,
 *     leftRoom() on leave, so friends can Join / Invite from the CrazyGames UI
 *   • addJoinRoomListener: "join friend" while the game is already running
 *   • isInstantMultiplayer: started from the CrazyGames multiplayer UI -> a new private room
 *   • CrazyGames usernames (when logged in) are shown in the room's player list
 * ============================================================================= */
(function () {
  'use strict';
  if (!window.CR_OFFLINE || !window.CR_NET || typeof ChronoRiftCoOpGame === 'undefined') return;
  const GP = ChronoRiftCoOpGame.prototype;
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* blocked */ } }
  };
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => { let s = ''; const r = new Uint32Array(5); (crypto.getRandomValues ? crypto.getRandomValues(r) : r.forEach((_, i) => { r[i] = Math.random() * 1e9; })); r.forEach((n) => { s += CODE_CHARS[n % CODE_CHARS.length]; }); return s; };
  const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const CG = () => (window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.environment !== 'disabled') ? window.CrazyGames.SDK : null;
  const BAD = /(fuck|shit|cunt|nigg|fag|rape|nazi|hitler|porn|sex|dick|pussy|whore|slut|bitch|kill\s*your)/i;
  const safeName = (n) => { n = String(n || '').trim().slice(0, 20); return !n || BAD.test(n) ? 'Hero' : n; };
  const api = (path) => fetch(CR_NET.SIGNAL_URL.replace(/\/$/, '') + path, { cache: 'no-store' }).then((r) => r.json());
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2c2.4-.2 4.4 1.3 5 4.3"/></svg>';

  const CSS = `
  #cr-fr { position: fixed; inset: 0; z-index: 4100; display: none; align-items: center; justify-content: center; background: rgba(6,8,14,.6); backdrop-filter: blur(3px); }
  #cr-fr.on { display: flex; }
  #cr-fr .card { width: min(420px, calc(100vw - 28px)); padding: 18px 18px 16px; border-radius: 16px; color: #F5F2EB; font-family: 'Plus Jakarta Sans', Inter, sans-serif;
    background: linear-gradient(180deg, rgba(26,22,42,.97), rgba(14,14,24,.97)); border: 1px solid rgba(127,227,255,.45); box-shadow: 0 18px 50px rgba(0,0,0,.6); }
  #cr-fr h3 { margin: 0 0 4px; font: 900 19px 'Cinzel', serif; letter-spacing: .08em; text-align: center; }
  #cr-fr .sub { font-size: 12.5px; color: rgba(245,242,235,.75); text-align: center; margin-bottom: 14px; line-height: 1.45; }
  #cr-fr button { all: unset; box-sizing: border-box; cursor: pointer; text-align: center; touch-action: manipulation; border-radius: 999px; font: 800 13px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .08em; padding: 11px 16px; }
  #cr-fr .pri { display: block; width: 100%; color: #06121a; background: linear-gradient(180deg, #a6f0ff, #5fd2f2); box-shadow: 0 6px 18px rgba(95,210,242,.3); }
  #cr-fr .sec { color: #F5F2EB; border: 1px solid rgba(255,255,255,.3); }
  #cr-fr .row { display: flex; gap: 8px; margin-top: 10px; }
  #cr-fr input { flex: 1; min-width: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(127,227,255,.5); background: rgba(6,10,20,.8); color: #7fe3ff;
    font: 800 16px 'JetBrains Mono', monospace; letter-spacing: .2em; text-transform: uppercase; }
  #cr-fr .or { text-align: center; font-size: 11px; letter-spacing: .2em; color: rgba(245,242,235,.5); margin: 14px 0 0; }
  #cr-fr .code { text-align: center; font: 900 34px 'JetBrains Mono', monospace; letter-spacing: .25em; color: #7fe3ff; margin: 4px 0 2px; user-select: all; }
  #cr-fr .quick { display: block; width: 100%; color: #1a1406; background: linear-gradient(180deg, #ffe7a3, #ffc94a); box-shadow: 0 6px 18px rgba(255,200,90,.3); font-size: 14px; }
  #cr-fr .rooms { margin-top: 10px; max-height: 168px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
  #cr-fr .rooms .r { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 8px 7px 12px; border-radius: 10px; background: rgba(255,255,255,.06); font-size: 12.5px; }
  #cr-fr .rooms .r b { color: #ffd56b; font-weight: 800; }
  #cr-fr .rooms .r button { padding: 6px 12px; font-size: 11px; }
  #cr-fr .rooms .none { font-size: 12px; color: rgba(245,242,235,.55); text-align: center; padding: 6px; }
  #cr-fr .two { display: flex; gap: 8px; margin-top: 10px; }
  #cr-fr .two button { flex: 1; font-size: 11.5px; padding: 10px 8px; }
  #cr-fr .tag { display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 999px; font: 800 9.5px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .1em; vertical-align: middle;
    background: rgba(127,227,255,.15); color: #7fe3ff; border: 1px solid rgba(127,227,255,.4); }
  #cr-fr .who { margin: 12px 0 4px; display: flex; flex-direction: column; gap: 6px; }
  #cr-fr .who div { display: flex; justify-content: space-between; padding: 8px 12px; border-radius: 10px; background: rgba(255,255,255,.06); font-size: 13px; }
  #cr-fr .who .me { color: #ffd56b; }
  #cr-fr .who .empty { color: rgba(245,242,235,.4); font-style: italic; }
  #cr-fr .st { min-height: 17px; text-align: center; font-size: 12px; color: #9fe7b8; margin-top: 8px; }
  #cr-fr .st.warn { color: #ffb48a; }
  #cr-fr .diag { margin-top: 8px; font: 600 10px/1.35 'JetBrains Mono', monospace; color: rgba(245,242,235,.45); text-align: center; word-break: break-word; }
  #cr-fr .foot { margin-top: 12px; display: flex; justify-content: space-between; gap: 8px; }
  #cr-mp-pill { position: fixed; z-index: 47; left: 50%; top: calc(6px + env(safe-area-inset-top)); transform: translateX(-50%); display: none; cursor: pointer;
    padding: 5px 12px; border-radius: 999px; background: rgba(10,16,26,.82); border: 1px solid rgba(127,227,255,.55); color: #bdf3ff;
    font: 800 11.5px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .06em; pointer-events: auto; }
  #cr-mp-pill.on { display: block; }
  #cr-mp-toast { position: fixed; z-index: 4150; left: 50%; bottom: calc(120px + env(safe-area-inset-bottom)); transform: translateX(-50%); max-width: min(90vw, 420px);
    padding: 9px 14px; border-radius: 12px; background: rgba(12,14,24,.92); border: 1px solid rgba(255,180,138,.6); color: #F5F2EB; font: 700 12.5px/1.4 'Plus Jakarta Sans', Inter, sans-serif;
    text-align: center; display: none; pointer-events: none; }
  #cr-mp-toast.on { display: block; animation: crFrIn .3s ease; }
  @keyframes crFrIn { from { opacity: 0; transform: translate(-50%, 8px); } }
  #ui-quick [data-a="friends"] svg, #mmo-quick [data-a="friends"] svg { width: 20px; height: 20px; }
  .cr-offline #mmo-quick [data-a="chat"] { display: none !important; }
  html.cr-offline body.touch-ui.hud-clean #mmo-quick button[data-a="friends"][aria-label], html.cr-offline body.touch-ui #mmo-quick button[data-a="friends"][aria-label] { display: inline-flex !important; }
  body.cr-prologue #cr-mp-pill, body.cr-lyra-call #cr-mp-pill, body.cr-acct-on #cr-mp-pill, body.cr-title-on #cr-mp-pill { display: none !important; }
  `;

  // drop ?join / ?room from the address bar so a reload doesn't rejoin a room the player left
  function stripUrl() {
    try { const u = new URL(location.href); let ch = false; ['join', 'room'].forEach((k) => { if (u.searchParams.has(k)) { u.searchParams.delete(k); ch = true; } }); if (ch) history.replaceState(history.state, '', u.toString()); } catch (e) { /* ignore */ }
  }

  let toastT = 0;
  function toast(text, secs) {
    const el = document.getElementById('cr-mp-toast'); if (!el) return;
    el.textContent = text; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), (secs || 5) * 1000);
  }

  Object.assign(GP, {
    mpUi() {
      if (document.getElementById('cr-fr')) return;
      const st = document.createElement('style'); st.id = 'cr-fr-css'; st.textContent = CSS; document.head.appendChild(st);
      const el = document.createElement('div'); el.id = 'cr-fr'; el.innerHTML = '<div class="card"></div>';
      const pill = document.createElement('div'); pill.id = 'cr-mp-pill';
      const t = document.createElement('div'); t.id = 'cr-mp-toast';
      document.body.append(el, pill, t);
      ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));   // the game ignores input aimed at the panel
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const b = e.target.closest('button');
        if (e.target === el) { this.mpClose(); return; }
        if (!b) return;
        const a = b.dataset.a;
        if (a === 'quick') this.mpQuick();
        else if (a === 'create-pub') this.mpJoin(newCode(), true, true);
        else if (a === 'create') this.mpJoin(newCode(), true, false);
        else if (a === 'room') this.mpJoin(b.dataset.code, false, true);
        else if (a === 'join') { const c = cleanCode(el.querySelector('input') && el.querySelector('input').value); if (c.length >= 4) this.mpJoin(c, false); else this.mpRender('Enter the 5-character room code your friend shared.'); }
        else if (a === 'copy') this.mpCopyInvite();
        else if (a === 'leave') { this.mpLeave(); this.mpRender(); }
        else if (a === 'close') this.mpClose();
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') el.querySelector('[data-a="join"]').click(); });
      pill.addEventListener('click', (e) => { e.stopPropagation(); this.mpOpen(); });
      // the 👥 button: desktop quick menu and the mobile top bar
      const addBtn = () => {
        [['ui-quick', 'Play with friends'], ['mmo-quick', 'Play with friends']].forEach(([id, tip]) => {
          const bar = document.getElementById(id);
          if (!bar || bar.querySelector('[data-a="friends"]')) return;
          const b = document.createElement('button');
          b.dataset.a = 'friends'; b.setAttribute('aria-label', tip); b.dataset.tip = tip; b.innerHTML = ICON;
          b.addEventListener('click', (e) => { e.stopPropagation(); if (this.audio) this.audio.init(); this.mpOpen(); });
          if (id === 'mmo-quick') bar.insertBefore(b, bar.querySelector('[data-a="chat"]') || null); else bar.insertBefore(b, bar.firstChild);
        });
      };
      addBtn(); setTimeout(addBtn, 1500); setTimeout(addBtn, 5000);
      // failures from the network layer -> a short note, then solo play continues
      CR_NET.onPeerFail = (id, why) => {
        if (!(this._mp && this._mp.code)) return;
        this._mp.fails = (this._mp.fails || 0) + 1;
        toast(why === 'room full' ? 'That room is full (4 heroes).'
          : why === 'blocked' ? 'Your network needs a relay bridge, and today\'s bridges are all in use. Keep exploring solo and try again later.'
          : 'Couldn\'t link up with that hero: some networks block direct links. Keep exploring and try again in a moment.', 7);
        this.mpRender();
      };
      CR_NET.onBusy = () => {
        toast('All realms are busy right now. Join an open realm, or keep exploring solo and try again in a few minutes.', 8);
        this._mpNote = { text: 'All realms are busy right now. Join an open realm below, or try again in a few minutes.', until: Date.now() + 30000 };
        this.mpLeave(true); this.mpRender(); this.mpRefreshRooms(true);
      };
      CR_NET.onRoomFull = () => { toast('That room is full (4 players). Playing solo.', 6); this.mpLeave(true); this.mpRender(); };
      CR_NET.onOff = () => { toast('Multiplayer is resting right now. Playing solo.', 6); this.mpLeave(true); this.mpRender(); };
      CR_NET.onSignalDown = () => { toast('Lost the matchmaking link. Players already with you stay connected.', 6); this.mpRender(); };
    },

    mpOpen() { this.mpUi(); this.mpRender(); document.getElementById('cr-fr').classList.add('on'); this.mpRefreshRooms(true); },

    // open public rooms (the server caches the list for 10 s)
    async mpRefreshRooms(force) {
      const now = Date.now();
      if (!force && now - (this._mpRoomsAt || 0) < 10000) return;
      this._mpRoomsAt = now;
      try { const j = await api('/rooms'); this._mpRooms = Array.isArray(j.rooms) ? j.rooms : []; } catch (e) { this._mpRooms = []; }
      if (!this._mp) this.mpRender();
    },

    async mpQuick() {
      if (!this.mpReady()) { toast('Quick Play opens once your hero is in the world.', 5); return; }
      this.mpRender('Finding a room...');
      let code = null;
      try { const j = await api('/quick'); if (j.off) { toast('Multiplayer is resting right now. Playing solo.', 6); this.mpRender(); return; } code = j.code; } catch (e) { /* unreachable: start our own */ }
      if (code) this.mpJoin(code, false, true);
      else this.mpJoin(newCode(), true, true);                               // nobody around yet: open a public room others can find
    },
    mpClose() { const el = document.getElementById('cr-fr'); if (el) el.classList.remove('on'); },

    mpInviteLink(code) {
      const sdk = CG();
      if (sdk) { try { const l = sdk.game.inviteLink({ roomId: code }); if (typeof l === 'string' && l) return l; } catch (e) { /* older SDK */ } }
      const u = new URL(location.href);
      ['room', 'join', 'fresh', 'net', 'netlog', 'sig', 'sigurl'].forEach((k) => u.searchParams.delete(k));
      u.searchParams.set('join', code);
      return u.toString();
    },

    async mpCopyInvite() {
      const M = this._mp; if (!M || !M.code) return;
      const link = this.mpInviteLink(M.code);
      let ok = false;
      try { await navigator.clipboard.writeText(link); ok = true; } catch (e) { /* no clipboard permission */ }
      if (!ok) { try { const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (e) { /* ignore */ } }
      this.mpRender(ok ? 'Invite link copied! Send it to a friend.' : link);
    },

    mpRender(note) {
      const card = document.querySelector('#cr-fr .card'); if (!card) return;
      if (!note && this._mpNote && Date.now() < this._mpNote.until && !this._mp) note = this._mpNote.text;   // e.g. "realms are busy" stays visible a while
      const M = this._mp;
      if (!M || !M.code) {
        const list = this._mpRooms;
        const rooms = list == null ? '<div class="none">Looking for open rooms...</div>'
          : list.length ? list.map((r) => `<div class="r"><span>${esc(r.title || 'A Hero\'s Realm')} · <b>${r.n}/${CR_NET.ROOM_CAP}</b></span><button class="sec" data-a="room" data-code="${esc(r.code)}">JOIN</button></div>`).join('')
          : '<div class="none">No open rooms right now. Quick Play opens one others can join.</div>';
        card.innerHTML = `<h3>PLAY TOGETHER</h3>
          <div class="sub">Explore Ashenvale with other heroes, up to 4 per room. Free, no account needed.</div>
          <button class="quick" data-a="quick">⚡ QUICK PLAY</button>
          <div class="or">OPEN ROOMS</div>
          <div class="rooms">${rooms}</div>
          <div class="or">OR MAKE YOUR OWN</div>
          <div class="two"><button class="sec" data-a="create-pub">PUBLIC ROOM</button><button class="sec" data-a="create">FRIENDS ONLY</button></div>
          <div class="or">JOIN A FRIEND'S CODE</div>
          <div class="row"><input maxlength="8" placeholder="CODE" autocomplete="off" spellcheck="false"><button class="sec" data-a="join">JOIN</button></div>
          <div class="st ${note ? 'warn' : ''}">${esc(note || '')}</div>
          <div class="foot"><span></span><button class="sec" data-a="close">CLOSE</button></div>`;
        return;
      }
      const peers = [...(this.remotePeers || new Map()).values()];
      const cg = (n) => (n ? ` <small style="opacity:.7">@${esc(safeName(n))}</small>` : '');
      const me = `<div class="me"><span>${esc(this.player.name || 'You')}${cg(this._cgName)} (you)</span><span>Lv ${this.player.level || 1}</span></div>`;
      const rows = peers.map((p) => `<div><span>${esc(safeName(p.name))}${cg(p.cgName)}</span><span>Lv ${p.level || 1}</span></div>`).join('');
      const empty = Array.from({ length: Math.max(0, CR_NET.ROOM_CAP - 1 - peers.length) }, () => '<div class="empty"><span>Open slot</span><span></span></div>').join('');
      const sig = CR_NET.signalState;
      const status = note || (sig === 'connecting' ? 'Connecting to matchmaking…' : sig === 'retrying' ? 'Reconnecting to matchmaking…' : sig === 'down' ? 'Matchmaking unreachable: friends already here stay connected.'
        : peers.length ? `${peers.length + 1} of ${CR_NET.ROOM_CAP} heroes together` : (M.created ? 'Room ready. Share the code or the invite link!' : 'Waiting for your friend…'));
      card.innerHTML = `<h3>YOUR ROOM<span class="tag">${M.pub ? 'PUBLIC' : 'FRIENDS ONLY'}</span></h3>
        <div class="code">${esc(M.code)}</div>
        <div class="sub">${M.pub ? 'Listed in Open Rooms, so other heroes can join. ' : ''}Friends can also enter this code, or open your invite link.</div>
        <button class="pri" data-a="copy">COPY INVITE LINK</button>
        <div class="who">${me}${rows}${empty}</div>
        <div class="st ${note || sig === 'down' || (M.fails && !peers.length) ? 'warn' : ''}">${esc(status)}</div>
        <div class="diag">${this.mpDiag()}</div>
        <div class="foot"><button class="sec" data-a="leave">LEAVE ROOM</button><button class="sec" data-a="close">CLOSE</button></div>`;
    },

    // tell CrazyGames which room the player is in and whether friends can still join
    mpCgRoom(kind) {
      const sdk = CG(); if (!sdk || !sdk.game) return;
      const M = this._mp;
      try {
        if (kind === 'left') { if (sdk.game.leftRoom) sdk.game.leftRoom(); else if (sdk.game.hideInviteButton) sdk.game.hideInviteButton(); return; }
        if (!M || !M.code) return;
        const open = ((this.remotePeers ? this.remotePeers.size : 0) + 1) < CR_NET.ROOM_CAP;
        if (sdk.game.updateRoom) sdk.game.updateRoom({ roomId: M.code, isJoinable: open, inviteParams: { roomId: M.code } });
        else if (open && sdk.game.showInviteButton) sdk.game.showInviteButton({ roomId: M.code });
        else if (sdk.game.hideInviteButton) sdk.game.hideInviteButton();
        this._mpCgOpen = open;
      } catch (e) { /* older SDK */ }
    },

    // small connection readout: version, matchmaking state, each link (direct / relay / connecting / failed)
    mpDiag() {
      const ch = this.channel, links = ch && ch.diag ? ch.diag() : [];
      const fails = ch && ch.stats ? ch.stats.failed.slice(-3).map((f) => f.why) : [];
      const l = links.map((d, i) => `P${i + 2}: ${d.state}${d.state === 'relay' ? ` ↑${d.sent} ↓${d.got}` : ''}`).join(' · ');
      return esc(`net v${CR_NET.VERSION || '?'} · match: ${CR_NET.signalState}${l ? ' · ' + l : ' · no links yet'}${fails.length ? ' · failed: ' + fails.join(', ') : ''}`);
    },

    mpPill() {
      const pill = document.getElementById('cr-mp-pill'); if (!pill) return;
      const M = this._mp;
      if (!M || !M.code) { pill.classList.remove('on'); return; }
      const n = (this.remotePeers ? this.remotePeers.size : 0) + 1;
      const txt = `👥 ${M.code} · ${n}/${CR_NET.ROOM_CAP}`;
      if (pill.textContent !== txt) pill.textContent = txt;
      pill.classList.add('on');
    },

    // can the player join a room right now? (not during Lyra's prologue, a cutscene or the title screens)
    mpReady() {
      if (!this.isInWorld || this.cutsceneActive) return false;
      const b = document.body.classList;
      if (b.contains('cr-prologue') || b.contains('cr-lyra-call') || b.contains('cr-acct-on') || b.contains('cr-title-on')) return false;
      if (window.CR_ACCOUNT && CR_ACCOUNT.playing && CR_ACCOUNT.playing.prologue) return false;
      return true;
    },

    async mpJoin(code, created, pub) {
      code = cleanCode(code); if (code.length < 4) return;
      if (this._mp && this._mp.code === code) { this.mpRender(); return; }
      if (this._mp && this._mp.code) this.mpLeave(true);
      if (!this.mpReady()) {
        ss.set('cr_mp_room', code);
        this.mpRender(); toast(`You'll join room ${code} as soon as your hero is in the world.`, 6);
        return;
      }
      this._mp = { code, created: !!created, pub: !!pub, fails: 0, at: Date.now() };
      ss.set('cr_mp_room', code); ss.set('cr_mp_pub', pub ? '1' : null);
      // only matters if this player is first in the room: it decides whether the room is listed
      CR_NET.roomMeta = { pub: !!pub, title: `${safeName(this.player && this.player.name)}'s Realm` };
      CR_NET.enable('p2p');
      if (!this.supabase || !this.supabase.__p2p) { this.supabase = CR_NET.client(); this.supabase.__p2p = true; }
      await CR_NET.fetchTurn();                                           // relay pass first, so blocked networks can still link up
      try { await this.joinRealtimeRoom(code); } catch (e) { console.warn('[friends] join failed', e); toast('Couldn\'t open the room. Playing solo.', 5); this.mpLeave(true); }
      const sdk = CG();
      if (sdk && this._mp) this.mpCgRoom('join');
      this.mpRender(); this.mpPill();
    },

    mpLeave(quiet) {
      const M = this._mp; this._mp = null;
      ss.set('cr_mp_room', null); ss.set('cr_mp_pub', null);
      stripUrl();
      if (M) this.mpCgRoom('left');
      if (this.channel && this.supabase && this.supabase.__p2p) { try { this.supabase.removeChannel(this.channel); } catch (e) { /* closed */ } }
      this.channel = null; this.channelSubscribed = false;
      if (this.remotePeers) { this.remotePeers.forEach((p) => { if (p.meshRoot) this.scene.remove(p.meshRoot); }); this.remotePeers.clear(); }
      if (this.supabase && this.supabase.__p2p) this.supabase = null;
      CR_NET.disable();
      if (this.updateRoomHost) this.updateRoomHost();
      if (this.updatePartyRosterUI) { try { this.updatePartyRosterUI(); } catch (e) { /* offline UI */ } }
      this.mpPill();
      if (M && !quiet) toast('You left the room. Playing solo.', 3);
    },

    // invite links / pending joins / pill refresh
    mpTick(dt) {
      this._mpT = (this._mpT || 0) + dt;
      if (this._mpT < 0.5) return;
      this._mpT = 0;
      this.mpUi();
      if (!this._mpPending) {
        this._mpPending = true;
        let code = null;
        const sdk = CG();
        if (sdk) {
          try { code = (sdk.game.inviteParams && sdk.game.inviteParams.roomId) || sdk.game.getInviteParam('roomId'); } catch (e) { /* older SDK */ }
          // a friend's invite accepted while the game is already running
          try { if (sdk.game.addJoinRoomListener) sdk.game.addJoinRoomListener((p) => { if (p && p.roomId) { ss.set('cr_mp_room', cleanCode(p.roomId)); ss.set('cr_mp_pub', null); } }); } catch (e) { /* older SDK */ }
          // started from CrazyGames' multiplayer UI: straight into a new private room, joinable at once
          try { if (!code && sdk.game.isInstantMultiplayer && !ss.get('cr_mp_instant')) { ss.set('cr_mp_instant', '1'); code = newCode(); this._mpInstant = true; } } catch (e) { /* older SDK */ }
          // the CrazyGames username, shown to the others in the room
          try { if (sdk.user && sdk.user.isUserAccountAvailable) sdk.user.getUser().then((u) => { if (u && u.username) this._cgName = String(u.username).slice(0, 20); }).catch(() => {}); } catch (e) { /* no user module */ }
        }
        if (!code) code = new URLSearchParams(location.search).get('join');
        if (code) ss.set('cr_mp_room', cleanCode(code));
        stripUrl();                                                         // an invite is used once
      }
      const pending = ss.get('cr_mp_room');
      if (pending && (!this._mp || this._mp.code !== pending) && this.mpReady() && !this._mpJoining) {
        this._mpJoining = true;
        this.mpJoin(pending, !!this._mpInstant, ss.get('cr_mp_pub') === '1').finally(() => { this._mpJoining = false; this._mpInstant = false; });
      }
      this.mpPill();
      if (this._mp && CG()) { const open = ((this.remotePeers ? this.remotePeers.size : 0) + 1) < CR_NET.ROOM_CAP; if (open !== this._mpCgOpen) this.mpCgRoom('update'); }
      const el = document.getElementById('cr-fr');
      if (el && el.classList.contains('on') && !this._mp) this.mpRefreshRooms(false);
      if (el && el.classList.contains('on') && this._mp) {
        const sig = (this.remotePeers ? this.remotePeers.size : 0) + '|' + CR_NET.signalState + '|' + (this._mp.fails || 0) + '|' + this.mpDiag();
        if (sig !== this._mpSig) { this._mpSig = sig; this.mpRender(); }
      }
    }
  });

  // a stranger's offensive hero name shows as "Hero"
  const hrs0 = GP.handleRemotePlayerState;
  if (hrs0) GP.handleRemotePlayerState = function (entry) {
    if (entry && entry.name) entry.name = safeName(entry.name);
    const r = hrs0.apply(this, arguments);
    if (entry && entry.cg && this.remotePeers && this.remotePeers.has(entry.id)) this.remotePeers.get(entry.id).cgName = safeName(entry.cg);
    return r;
  };
  const bps0 = GP.buildPlayerStatePayload;
  if (bps0) GP.buildPlayerStatePayload = function () { const p = bps0.apply(this, arguments); if (p && this._cgName) p.cg = this._cgName; return p; };

  const upd0 = GP.updateMMOWorld;
  GP.updateMMOWorld = function (dt) {
    const r = upd0.apply(this, arguments);
    try { this.mpTick(dt); } catch (e) { if (!this._mpErr) { this._mpErr = 1; console.warn('[friends]', e); } }
    return r;
  };
})();
