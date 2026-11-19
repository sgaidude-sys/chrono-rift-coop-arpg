/* =============================================================================
 * Chrono-Rift — parties (groups of up to 4 inside a realm)
 *
 *  A realm (room code) is the shared world; a party is a group inside it.
 *   • P (or the party icon) opens the Party window:
 *       - your party: members, leader crown, Travel / Kick, Leave
 *       - players in this realm with an Invite button
 *       - invite friends: copy a link that opens your realm and drops the
 *         friend straight into your party; create / join a private realm
 *   • Invites pop up as a card with Accept / Decline (30 s).
 *   • Party frames (top right): class sigil, name, level, live HP, distance;
 *     click one to travel to that member (out of combat).
 *   • Perks: +10% XP per party member fighting nearby, "/p message" party chat.
 *
 *  Network: one broadcast event 'party' {t: invite|accept|decline|state|leave|kick|
 *  join_req|chat}. The leader is the authority: it owns the member list and
 *  re-broadcasts 'state' on every change and whenever someone new appears.
 * ============================================================================= */
(function () {
  'use strict';
  const MAX = 4;
  const CLS = { vanguard: ['V', '#f3c86b'], ranger: ['R', '#2ee68a'], arcanist: ['A', '#b266ff'], berserker: ['B', '#ff3b5c'] };
  const ICON = '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 13.9c2.5.1 4.6 1.7 5.1 4.6"/></svg>';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CSS = `
  #party-frames { position: fixed; right: 18px; top: 74px; z-index: 12; display: flex; flex-direction: column; gap: 6px; width: 210px; }
  #party-frames .pf { all: unset; box-sizing: border-box; display: grid; grid-template-columns: 30px 1fr; gap: 2px 9px; align-items: center; cursor: pointer;
    padding: 6px 9px; border-radius: 8px; background: rgba(14,17,23,.42); border: 1px solid rgba(212,175,55,.18); color: #F5F2EB; text-shadow: 0 1px 2px #000; transition: border-color .2s, background .2s; }
  #party-frames .pf:hover { border-color: rgba(212,175,55,.6); background: rgba(14,17,23,.6); }
  #party-frames .pf .bd { grid-row: span 2; width: 30px; height: 30px; display: grid; place-items: center; font: 900 13px 'Cinzel', serif; border-radius: 50%; border: 1.5px solid var(--c); color: var(--c); background: rgba(0,0,0,.35); position: relative; }
  #party-frames .pf .bd i { position: absolute; top: -9px; left: 50%; transform: translateX(-50%); font-style: normal; font-size: 10px; color: #D4AF37; }
  #party-frames .pf .nm { display: flex; justify-content: space-between; font: 700 12px 'Plus Jakarta Sans', sans-serif; white-space: nowrap; overflow: hidden; }
  #party-frames .pf .nm small { font-weight: 600; color: rgba(245,242,235,.55); margin-left: 6px; }
  #party-frames .pf .hp { height: 4px; background: rgba(245,242,235,.14); border-radius: 2px; overflow: hidden; }
  #party-frames .pf .hp b { display: block; height: 100%; background: linear-gradient(90deg, #c8323f, #ff6b6b); transition: width .25s; }
  #party-frames .pf.far { opacity: .62; } #party-frames .pf.dead .hp b { background: #555; }
  #party-frames .ph { font: 700 9.5px 'Plus Jakarta Sans', sans-serif; letter-spacing: .3em; color: rgba(245,242,235,.55); text-shadow: 0 1px 2px #000; padding-left: 2px; }
  #party-invite { position: fixed; left: 50%; top: 14%; transform: translateX(-50%); z-index: 70; min-width: 320px; padding: 16px 18px; text-align: center; color: #F5F2EB;
    background: rgba(14,17,23,.86); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border: 1px solid rgba(212,175,55,.45); border-radius: 12px; box-shadow: 0 18px 50px rgba(0,0,0,.5);
    font-family: 'Plus Jakarta Sans', sans-serif; animation: pInvIn .3s cubic-bezier(.2,.7,.2,1); }
  @keyframes pInvIn { from { opacity: 0; transform: translate(-50%, -8px); } }
  #party-invite h4 { margin: 0 0 4px; font: 700 10px 'Plus Jakarta Sans', sans-serif; letter-spacing: .32em; color: #D4AF37; }
  #party-invite p { margin: 0 0 14px; font-size: 15px; } #party-invite p b { font-family: 'Cinzel', serif; }
  #party-invite .row { display: flex; gap: 10px; justify-content: center; }
  #party-invite .bar { height: 2px; background: rgba(212,175,55,.6); margin-top: 12px; transform-origin: left; animation: pInvBar 30s linear forwards; }
  @keyframes pInvBar { to { transform: scaleX(0); } }
  .pt-btn { all: unset; cursor: pointer; padding: 8px 16px; border-radius: 6px; font: 700 12px 'Plus Jakarta Sans', sans-serif; letter-spacing: .06em; color: #F5F2EB; border: 1px solid rgba(245,242,235,.3); transition: background .2s, border-color .2s; text-align: center; }
  .pt-btn:hover { border-color: #D4AF37; background: rgba(212,175,55,.12); }
  .pt-btn.gold { background: linear-gradient(180deg, #f6dc8c, #D4AF37 55%, #a8842a); color: #17120a; border-color: transparent; }
  .pt-btn.gold:hover { filter: brightness(1.1); }
  .pt-btn.sm { padding: 5px 10px; font-size: 11px; }
  .pt-btn[disabled] { opacity: .4; pointer-events: none; }
  #party-modal .modal-box { max-width: 620px; }
  #party-modal .pt-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  #party-modal h2 { margin: 0; font-size: 22px; }
  #party-modal h3 { margin: 18px 0 8px; font: 700 10.5px 'Plus Jakarta Sans', sans-serif !important; letter-spacing: .3em; color: rgba(245,242,235,.55) !important; }
  #party-modal .pt-row { display: grid; grid-template-columns: 34px 1fr auto; gap: 12px; align-items: center; padding: 9px 4px; border-bottom: 1px solid rgba(245,242,235,.08); }
  #party-modal .pt-row .bd { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; border: 1.5px solid var(--c); color: var(--c); font: 900 13px 'Cinzel', serif; }
  #party-modal .pt-row .nm { font: 700 14px 'Plus Jakarta Sans', sans-serif; } #party-modal .pt-row .nm small { display: block; font-weight: 500; font-size: 11.5px; color: rgba(245,242,235,.55); margin-top: 2px; }
  #party-modal .pt-row .act { display: flex; gap: 6px; }
  #party-modal .pt-empty { font-size: 13px; color: rgba(245,242,235,.55); padding: 8px 4px; line-height: 1.55; }
  #party-modal .pt-realm { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  #party-modal .pt-code { font: 700 15px 'JetBrains Mono', monospace; letter-spacing: .08em; padding: 7px 12px; border: 1px solid rgba(212,175,55,.4); border-radius: 6px; }
  #party-modal input.pt-in { all: unset; box-sizing: border-box; width: 150px; padding: 7px 10px; font: 700 13px 'JetBrains Mono', monospace; letter-spacing: .06em; color: #F5F2EB; border: 1px solid rgba(245,242,235,.3); border-radius: 6px; text-transform: uppercase; }
  #party-modal .pt-note { font-size: 12px; color: rgba(245,242,235,.55); margin-top: 10px; line-height: 1.5; }
  .chat-party { color: #8fe3ff !important; }
  body.touch-ui #party-frames { right: 8px; top: 64px; width: 168px; } body.touch-ui #party-frames .ph { display: none; }
  body.cr-title-on #party-frames, body.hs-open #party-frames, body.epic-cine #party-frames, body.cr-title-on #party-invite { visibility: hidden; }
  `;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, grantKillRewards: GP.grantKillRewards,
    gainXP: GP.gainXP, sendChat: GP.sendChat, copyInviteLink: GP.copyInviteLink, handleRemotePlayerState: GP.handleRemotePlayerState
  };
  const _v = new THREE.Vector3();

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initParty(); } catch (e) { console.warn('[Party] init failed', e); }
    },

    initParty() {
      if (this._pty) return;
      const st = document.createElement('style'); st.id = 'party-css'; st.textContent = CSS; document.head.appendChild(st);
      const frames = document.createElement('div'); frames.id = 'party-frames'; document.body.appendChild(frames);
      const modal = document.createElement('div'); modal.id = 'party-modal'; modal.className = 'modal-backdrop';
      modal.innerHTML = '<div class="modal-box"><div class="pt-head"><h2>Party</h2><button class="mini-btn" data-close>✕ Close [ESC]</button></div><div class="pt-body"></div></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => this.onPartyModalClick(e));
      frames.addEventListener('click', (e) => { const f = e.target.closest('.pf'); if (f) this.partyTravelTo(f.dataset.id); });
      this._pty = { party: null, parties: new Map(), frames, modal, invite: null, lastState: 0, seen: new Set(), joinReq: null, frameT: 0 };
      // invite link: ?party=<id>&leader=<token> -> ask that leader to let us in once we're connected
      const q = new URLSearchParams(location.search);
      if (q.get('party') && q.get('leader')) this._pty.joinReq = { partyId: q.get('party'), leader: q.get('leader'), tries: 0, next: 0 };
      window.addEventListener('keydown', (e) => {
        if (e.repeat || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
        if (e.key.toLowerCase() !== 'p' || !this.isInWorld || this.cutsceneActive) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (modal.classList.contains('active')) this.closeModals(); else if (!this.isAnyModalOpen) this.openPartyWindow();
      }, true);
      this.addPartyQuickButton();
    },

    addPartyQuickButton() {
      const tryAdd = () => {
        const bar = document.getElementById('ui-quick');
        if (!bar) return false;
        if (bar.querySelector('[data-a="party"]')) return true;
        const b = document.createElement('button');
        b.setAttribute('aria-label', 'Party'); b.dataset.a = 'party'; b.title = 'Party (P)'; b.innerHTML = ICON;
        b.addEventListener('click', (e) => { e.stopPropagation(); this.openPartyWindow(); });
        bar.insertBefore(b, bar.firstChild);
        return true;
      };
      if (!tryAdd()) { let n = 0; const iv = setInterval(() => { if (tryAdd() || ++n > 40) clearInterval(iv); }, 500); }
    },

    // ======================================================================
    // Networking
    // ======================================================================
    partySend(t, data) {
      if (this.broadcastGameEvent) this.broadcastGameEvent('party', Object.assign({ t, from: this.playerToken, fromName: this.player.name }, data || {}));
    },

    onPartyEvent(m) {
      const P = this._pty;
      if (!P || !m || m.from === this.playerToken) return;
      const me = this.playerToken, party = P.party;
      switch (m.t) {
        case 'invite':
          if (m.to !== me) return;
          if (party && party.members.length > 1) { this.partySend('decline', { to: m.from, reason: 'busy' }); return; }
          this.showPartyInvite(m);
          break;
        case 'accept':
        case 'join_req':
          if (m.to !== me) return;
          if (!party || party.leader !== me || party.id !== m.partyId) { this.partySend('decline', { to: m.from, reason: 'gone' }); return; }
          if (party.members.length >= MAX) { this.partySend('decline', { to: m.from, reason: 'full' }); return; }
          if (!party.members.some(x => x.id === m.from)) party.members.push({ id: m.from, name: m.fromName });
          this.partyBroadcastState();
          this.partyNotice(`${m.fromName} joined the party`);
          break;
        case 'decline':
          if (m.to !== me) return;
          this.partyNotice(m.reason === 'full' ? 'That party is full' : (m.reason === 'busy' ? `${m.fromName} is already in a party` : (m.reason === 'gone' ? 'That party no longer exists' : `${m.fromName} declined your invite`)));
          if (P.joinReq) P.joinReq = null;
          break;
        case 'state': {
          P.parties.set(m.partyId, { id: m.partyId, leader: m.leader, members: m.members || [], at: performance.now() });
          const mine = (m.members || []).some(x => x.id === me);
          if (mine) {
            const was = P.party;
            P.party = { id: m.partyId, leader: m.leader, members: m.members };
            if (!was || was.id !== m.partyId) this.partyNotice('You joined the party');
            if (P.joinReq) P.joinReq = null;
            if (P.invite) this.hidePartyInvite();
          } else if (party && party.id === m.partyId) {
            P.party = null; this.partyNotice('You are no longer in the party');
          }
          if (!(m.members || []).length) P.parties.delete(m.partyId);
          this.renderPartyFrames(); this.refreshPartyWindow();
          break;
        }
        case 'leave':
          if (party && party.leader === me && party.id === m.partyId) {
            party.members = party.members.filter(x => x.id !== m.from);
            this.partyNotice(`${m.fromName} left the party`);
            this.partyBroadcastState();
          }
          break;
        case 'kick':
          if (m.to === me && party && party.id === m.partyId) { P.party = null; this.partyNotice('You were removed from the party'); this.renderPartyFrames(); this.refreshPartyWindow(); }
          break;
        case 'chat':
          if (party && party.id === m.partyId) this.addChatMessage(`[Party] ${m.fromName}`, m.text, 'chat-party');
          break;
      }
    },

    partyBroadcastState() {
      const P = this._pty, party = P.party;
      if (!party || party.leader !== this.playerToken) return;
      if (party.members.length <= 1) {
        // just the leader (e.g. invites still pending): nothing to show the realm yet
        if (party.announced) { this.partySend('state', { partyId: party.id, leader: party.leader, members: [] }); party.announced = false; }
        P.parties.delete(party.id);
      } else {
        this.partySend('state', { partyId: party.id, leader: party.leader, members: party.members });
        party.announced = true;
        P.parties.set(party.id, { id: party.id, leader: party.leader, members: party.members, at: performance.now() });
      }
      P.lastState = performance.now();
      this.renderPartyFrames(); this.refreshPartyWindow();
    },

    ensureOwnParty() {
      const P = this._pty;
      if (!P.party) P.party = { id: 'pt' + Math.random().toString(36).slice(2, 8), leader: this.playerToken, members: [{ id: this.playerToken, name: this.player.name }] };
      return P.party;
    },

    partyInvite(token) {
      const P = this._pty, peer = this.remotePeers && this.remotePeers.get(token);
      if (!peer) return;
      if (P.party && P.party.leader !== this.playerToken) { this.partyNotice('Only the party leader can invite'); return; }
      const party = this.ensureOwnParty();
      if (party.members.length >= MAX) { this.partyNotice('Your party is full'); return; }
      this.partySend('invite', { to: token, partyId: party.id });
      this.partyNotice(`Invite sent to ${peer.name}`);
      (P.sent = P.sent || {})[token] = performance.now();
      this.refreshPartyWindow();
    },

    partyLeave() {
      const P = this._pty, party = P.party;
      if (!party) return;
      if (party.leader === this.playerToken && party.members.length > 1) {
        // hand leadership to the next member, then leave
        const rest = party.members.filter(x => x.id !== this.playerToken);
        if (rest.length >= 2) this.partySend('state', { partyId: party.id, leader: rest[0].id, members: rest });
        else this.partySend('state', { partyId: party.id, leader: party.leader, members: [] });
      } else if (party.leader !== this.playerToken) {
        this.partySend('leave', { partyId: party.id });
      }
      P.party = null;
      this.partyNotice('You left the party');
      this.renderPartyFrames(); this.refreshPartyWindow();
    },

    partyKick(token) {
      const P = this._pty, party = P.party;
      if (!party || party.leader !== this.playerToken) return;
      party.members = party.members.filter(x => x.id !== token);
      this.partySend('kick', { to: token, partyId: party.id });
      this.partyBroadcastState();
    },

    partyTravelTo(token) {
      const peer = this.remotePeers && this.remotePeers.get(token);
      if (!peer || !peer.pos) return;
      const p = this.player;
      if (p.dead) return;
      const busy = this.inCombatForMount ? this.inCombatForMount() : false;
      if (busy) { this.partyNotice("Can't travel while in combat"); return; }
      if (Math.hypot(peer.pos.x - p.pos.x, peer.pos.z - p.pos.z) < 12) return;
      if (p._mount && this.dismount) this.dismount(false);
      const a = Math.random() * Math.PI * 2;
      if (this.vfxPillar) this.vfxPillar(_v.set(p.pos.x, 0, p.pos.z), 10, 0.9, 0x8fe3ff, 0xffffff, 0);
      p.pos.set(peer.pos.x + Math.cos(a) * 2.5, 0, peer.pos.z + Math.sin(a) * 2.5);
      if (this.vfxPillar) this.vfxPillar(_v.set(p.pos.x, 0, p.pos.z), 10, 0.9, 0x8fe3ff, 0xffffff, 0.05);
      if (this.vfxSparks) this.vfxSparks(_v.set(p.pos.x, 1, p.pos.z), 30, { cols: [0xffffff, 0x8fe3ff], speed: [3, 8], life: [0.3, 0.6], grav: -1 });
      if (this.audio && this.audio.playSample) this.audio.playSample('blink', 1.0, 0.4);
      if (this.detectZoneFromPosition) this.detectZoneFromPosition();
      if (this.broadcastPlayerState) this.broadcastPlayerState(false);
      this.partyNotice(`Travelled to ${peer.name}`);
    },

    partyNotice(text) { this.addChatMessage('Party', text, 'chat-party'); },

    // ======================================================================
    // Invite card
    // ======================================================================
    showPartyInvite(m) {
      this.hidePartyInvite();
      const el = document.createElement('div'); el.id = 'party-invite';
      el.innerHTML = `<h4>PARTY INVITE</h4><p><b>${esc(m.fromName)}</b> invites you to their party</p><div class="row"><button class="pt-btn gold" data-a="yes">Accept</button><button class="pt-btn" data-a="no">Decline</button></div><div class="bar"></div>`;
      document.body.appendChild(el);
      const P = this._pty;
      P.invite = { el, m, timer: setTimeout(() => this.answerPartyInvite(false), 30000) };
      el.addEventListener('click', (e) => { const a = e.target.dataset && e.target.dataset.a; if (a) this.answerPartyInvite(a === 'yes'); });
      if (this.audio && this.audio.playSample) this.audio.playSample('chime', 1.2, 0.35);
    },
    hidePartyInvite() {
      const P = this._pty; if (!P.invite) return;
      clearTimeout(P.invite.timer); P.invite.el.remove(); P.invite = null;
    },
    answerPartyInvite(yes) {
      const P = this._pty; if (!P.invite) return;
      const m = P.invite.m;
      this.hidePartyInvite();
      if (yes) {
        if (P.party) this.partyLeave();
        this.partySend('accept', { to: m.from, partyId: m.partyId });
      } else this.partySend('decline', { to: m.from });
    },

    // ======================================================================
    // Party window
    // ======================================================================
    openPartyWindow() {
      this.openModal('party-modal');
      this.refreshPartyWindow();
    },

    peerInfo(id) {
      if (id === this.playerToken) return { name: this.player.name, classId: this.player.classId, level: this.player.level, hp: this.player.hp, maxHp: this.player.maxHp, pos: this.player.pos, self: true };
      const pe = this.remotePeers && this.remotePeers.get(id);
      return pe ? { name: pe.name, classId: pe.classId, level: pe.level, hp: pe.hp, maxHp: pe.maxHp, pos: pe.pos } : null;
    },

    refreshPartyWindow() {
      const P = this._pty; if (!P) return;
      const body = P.modal.querySelector('.pt-body');
      if (!P.modal.classList.contains('active')) return;
      const me = this.playerToken, party = P.party;
      const badge = (c) => { const k = CLS[c] || ['?', '#F5F2EB']; return `<span class="bd" style="--c:${k[1]}">${k[0]}</span>`; };
      const dist = (pos) => pos ? Math.round(Math.hypot(pos.x - this.player.pos.x, pos.z - this.player.pos.z)) + ' m' : '';
      let h = '<h3>YOUR PARTY</h3>';
      if (!party || party.members.length <= 1) h += `<div class="pt-empty">You're adventuring solo. Invite players below to share XP (+10% per member nearby), see each other's health and travel to one another.</div>`;
      else {
        party.members.forEach((mb) => {
          const inf = this.peerInfo(mb.id) || { name: mb.name };
          const lead = mb.id === party.leader ? ' 👑' : '';
          let act = '';
          if (mb.id === me) act = `<button class="pt-btn sm" data-a="leave">Leave</button>`;
          else {
            act = `<button class="pt-btn sm" data-a="travel" data-id="${esc(mb.id)}"${inf.pos ? '' : ' disabled'}>Travel</button>`;
            if (party.leader === me) act += `<button class="pt-btn sm" data-a="kick" data-id="${esc(mb.id)}">Remove</button>`;
          }
          h += `<div class="pt-row">${badge(inf.classId)}<div class="nm">${esc(inf.name || mb.name)}${lead}<small>${inf.pos ? 'Level ' + (inf.level || 1) : 'Not in this area'}${inf.pos && mb.id !== me ? ' · ' + dist(inf.pos) : ''}${mb.id === me ? ' · You' : ''}</small></div><div class="act">${act}</div></div>`;
        });
      }
      h += '<h3>PLAYERS IN THIS REALM</h3>';
      const others = [];
      if (this.remotePeers) this.remotePeers.forEach((pe, id) => { if (!party || !party.members.some(x => x.id === id)) others.push([id, pe]); });
      if (!others.length) h += `<div class="pt-empty">Nobody else is in realm <b>${esc(this.roomCode)}</b> right now. Send a friend the invite link below.</div>`;
      others.forEach(([id, pe]) => {
        let inOther = false; P.parties.forEach(pt => { if (pt.members.some(x => x.id === id)) inOther = true; });
        const sent = P.sent && P.sent[id] && performance.now() - P.sent[id] < 30000;
        const canInvite = !inOther && !sent && (!party || (party.leader === me && party.members.length < MAX));
        const label = inOther ? 'In a party' : (sent ? 'Invited' : 'Invite');
        h += `<div class="pt-row">${badge(pe.classId)}<div class="nm">${esc(pe.name)}<small>Level ${pe.level || 1} · ${dist(pe.pos)}</small></div><div class="act"><button class="pt-btn sm${canInvite ? ' gold' : ''}" data-a="invite" data-id="${esc(id)}"${canInvite ? '' : ' disabled'}>${label}</button></div></div>`;
      });
      h += `<h3>INVITE FRIENDS</h3>
        <div class="pt-realm"><span class="pt-code">${esc(this.roomCode)}</span><button class="pt-btn gold" data-a="link">Copy invite link</button><button class="pt-btn" data-a="private">New private realm</button></div>
        <div class="pt-realm" style="margin-top:10px"><input class="pt-in" maxlength="18" placeholder="REALM CODE" /><button class="pt-btn" data-a="join">Join realm</button></div>
        <div class="pt-note">The link opens your realm${party ? ' and puts your friend straight into your party' : ''}. Friends on the same realm code share one world.</div>`;
      body.innerHTML = h;
    },

    onPartyModalClick(e) {
      const P = this._pty;
      if (e.target === P.modal || (e.target.closest && e.target.closest('[data-close]'))) { this.closeModals(); return; }
      const b = e.target.closest && e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a, id = b.dataset.id;
      if (a === 'invite') this.partyInvite(id);
      else if (a === 'leave') this.partyLeave();
      else if (a === 'kick') this.partyKick(id);
      else if (a === 'travel') { this.closeModals(); this.partyTravelTo(id); }
      else if (a === 'link') this.copyInviteLink();
      else if (a === 'private') { const code = 'RIFT-' + Math.random().toString(36).slice(2, 6).toUpperCase(); this.partySwitchRealm(code); }
      else if (a === 'join') { const v = (P.modal.querySelector('.pt-in').value || '').trim().toUpperCase(); if (v) this.partySwitchRealm(v); }
    },

    partySwitchRealm(code) {
      if (this._pty.party) this.partyLeave();
      this.joinRealtimeRoom(code).then(() => { this.partyNotice(`Joined realm ${code}`); this.refreshPartyWindow(); });
      this.refreshPartyWindow();
    },

    copyInviteLink() {
      const P = this._pty;
      if (!P) return orig.copyInviteLink.apply(this, arguments);
      const party = P.party && P.party.leader === this.playerToken ? P.party : (P.party ? null : this.ensureOwnParty());
      let url = `${location.origin}${location.pathname}?room=${encodeURIComponent(this.roomCode)}`;
      if (party) url += `&party=${encodeURIComponent(party.id)}&leader=${encodeURIComponent(this.playerToken)}`;
      const done = () => this.partyNotice('Invite link copied — send it to a friend');
      try { navigator.clipboard.writeText(url).then(done, () => this.partyNotice(url)); } catch (e) { this.partyNotice(url); }
    },

    // ======================================================================
    // Party frames + perks
    // ======================================================================
    renderPartyFrames() {
      const P = this._pty; if (!P) return;
      const party = P.party;
      const others = party ? party.members.filter(x => x.id !== this.playerToken) : [];
      if (!others.length) { if (P.frames.innerHTML) P.frames.innerHTML = ''; return; }
      let h = '<div class="ph">PARTY</div>';
      others.forEach((mb) => {
        const inf = this.peerInfo(mb.id);
        const k = CLS[inf && inf.classId] || ['?', '#F5F2EB'];
        const hpk = inf && inf.maxHp ? Math.max(0, Math.min(1, inf.hp / inf.maxHp)) : 0;
        const d = inf && inf.pos ? Math.round(Math.hypot(inf.pos.x - this.player.pos.x, inf.pos.z - this.player.pos.z)) : null;
        h += `<button class="pf${!inf || d > 75 ? ' far' : ''}${inf && inf.hp <= 0 ? ' dead' : ''}" data-id="${esc(mb.id)}" title="Click to travel to ${esc(mb.name)}">
          <span class="bd" style="--c:${k[1]}">${k[0]}${mb.id === party.leader ? '<i>♛</i>' : ''}</span>
          <span class="nm">${esc((inf && inf.name) || mb.name)}<small>${inf ? 'Lv ' + (inf.level || 1) + (d !== null ? ' · ' + d + 'm' : '') : 'away'}</small></span>
          <span class="hp"><b style="width:${(hpk * 100).toFixed(0)}%"></b></span></button>`;
      });
      P.frames.innerHTML = h;
    },

    partyMembersNear(r) {
      const P = this._pty; if (!P || !P.party) return 0;
      let n = 0;
      P.party.members.forEach((mb) => {
        if (mb.id === this.playerToken) return;
        const pe = this.remotePeers && this.remotePeers.get(mb.id);
        if (pe && pe.pos && Math.hypot(pe.pos.x - this.player.pos.x, pe.pos.z - this.player.pos.z) < r) n++;
      });
      return n;
    },

    grantKillRewards(mob) {
      this._ptyKill = true;
      try { return orig.grantKillRewards.apply(this, arguments); } finally { this._ptyKill = false; }
    },
    gainXP(amount, showText) {
      if (this._ptyKill && this._pty) {
        const n = this.partyMembersNear(75);
        if (n > 0) arguments[0] = Math.round(amount * (1 + 0.1 * n));
      }
      return orig.gainXP.apply(this, arguments);
    },

    sendChat(e) {
      const input = document.getElementById('chat-input');
      const msg = input ? input.value.trim() : '';
      const P = this._pty;
      if (P && /^\/p\s+/i.test(msg)) {
        if (e && e.preventDefault) e.preventDefault();
        input.value = ''; input.blur();
        const text = msg.replace(/^\/p\s+/i, '').slice(0, 200);
        if (!P.party) { this.partyNotice("You're not in a party. Press P to invite players."); return; }
        this.addChatMessage(`[Party] ${this.player.name}`, text, 'chat-party');
        this.partySend('chat', { partyId: P.party.id, text });
        return;
      }
      return orig.sendChat.apply(this, arguments);
    },

    handleRemotePlayerState(payload) {
      const r = orig.handleRemotePlayerState.apply(this, arguments);
      if (payload && payload.id && this.remotePeers) {
        const pe = this.remotePeers.get(payload.id);
        if (pe && typeof payload.level === 'number') pe.level = payload.level;
      }
      return r;
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      const P = this._pty; if (!P || !this.isInWorld) return;
      const now = performance.now();
      const party = P.party;
      if (party && party.leader === this.playerToken) {
        // drop members who left the realm; re-announce state for newcomers / late joiners
        const before = party.members.length;
        party.members = party.members.filter(mb => mb.id === this.playerToken || (this.remotePeers && this.remotePeers.has(mb.id)) || now - (mb.missingSince || (mb.missingSince = now)) < 15000);
        party.members.forEach((mb) => { if (this.remotePeers && this.remotePeers.has(mb.id)) mb.missingSince = 0; });
        let newcomer = false;
        if (this.remotePeers) this.remotePeers.forEach((pe, id) => { if (!P.seen.has(id)) { P.seen.add(id); newcomer = true; } });
        if (party.members.length !== before || newcomer || now - P.lastState > 20000) this.partyBroadcastState();
      } else if (party && !(this.remotePeers && this.remotePeers.has(party.leader)) && party.leader !== this.playerToken) {
        party.leaderMissing = party.leaderMissing || now;
        if (now - party.leaderMissing > 20000) { P.party = null; this.partyNotice('The party leader left the realm'); this.renderPartyFrames(); }
      } else if (party) party.leaderMissing = 0;
      // invite-link join request, once the leader is visible in the realm
      const J = P.joinReq;
      if (J && this.channelSubscribed && now > J.next && this.remotePeers && this.remotePeers.has(J.leader)) {
        J.next = now + 4000; J.tries++;
        this.partySend('join_req', { to: J.leader, partyId: J.partyId });
        if (J.tries > 4) P.joinReq = null;
      }
      P.frameT -= dt;
      if (P.frameT <= 0) { P.frameT = 0.25; this.renderPartyFrames(); }
      P.winT = (P.winT || 0) - dt;
      if (P.winT <= 0 && P.modal.classList.contains('active')) { P.winT = 1.5; this.refreshPartyWindow(); }
    }
  });

  window.CR_PARTY = { MAX };
})();
