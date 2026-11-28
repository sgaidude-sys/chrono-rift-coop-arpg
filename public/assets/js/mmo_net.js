/* =============================================================================
 * Chrono-Rift — swappable network layer (free peer-to-peer co-op for portal builds)
 *
 *  The game's co-op talks to ONE realtime channel object (send / on('broadcast'|'presence') /
 *  presenceState / track / subscribe), first written for Supabase. This module provides a
 *  stand-in client with the same shape, so the game code is untouched:
 *
 *    CR_NET.client()  ->  { channel(name, opts), removeChannel(ch), from(table) }
 *
 *  Transports (chosen by CR_NET.mode):
 *   • 'p2p'   — WebRTC data channels, full mesh (each player connects to each other player, so a
 *               room of 4 is 6 links). Game traffic goes browser-to-browser: no server, no cost.
 *               Peers find each other through a small "signaling" service (just introductions).
 *   • 'local' — BroadcastChannel between tabs of the same browser (development / debugging).
 *  Signaling (for 'p2p'):
 *   • CR_NET.signal = 'local' — BroadcastChannel (two tabs on one computer, no server)
 *   • a WebSocket signaling server can be plugged in later (phase 2) with the same interface.
 *
 *  Safety rails: room cap (4), message size cap, per-peer incoming rate limit, heartbeats, and
 *  'from(...)' database calls are harmless no-ops (the host's browser holds the world state).
 *
 *  Enabled only when asked for: ?net=p2p | ?net=local (portal UI sets it in a later phase).
 * ============================================================================= */
(function () {
  'use strict';
  const ROOM_CAP = 4;                       // players per room (self included)
  const MAX_MSG = 240 * 1024;               // bytes per message (netbatch splits bundles at 200 KB)
  const RATE = 60, BURST = 120;             // incoming messages per second per peer (token bucket)
  const HEARTBEAT_MS = 2000, PEER_TIMEOUT_MS = 9000, CONNECT_TIMEOUT_MS = 6000;   // direct links form in 1-3 s; blocked networks switch to the relay after this
  const NET_VERSION = 13;                     // shown in the Play Together panel (helps when debugging two devices)
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];

  const q = new URLSearchParams(location.search);
  const log = (...a) => { if (q.has('netlog')) console.log('[net]', ...a); };

  // ---------------------------------------------------------------------------------------------
  // Signaling: introduces peers and relays WebRTC offers / answers / ICE candidates
  //   interface: join(room, selfId, onMsg(from, msg)), send(to, msg), leave()
  //   messages: { k:'hello' } broadcast on join, { k:'here' } reply, { k:'offer'|'answer'|'ice'|'full'|'bye' }
  // ---------------------------------------------------------------------------------------------
  function LocalSignal() {
    let bc = null, self = null;
    return {
      join(room, selfId, onMsg) {
        self = selfId;
        bc = new BroadcastChannel('cr-sig-' + room);
        bc.onmessage = (e) => { const d = e.data; if (!d || d.from === self || (d.to && d.to !== self)) return; onMsg(d.from, d.msg); };
        bc.postMessage({ from: self, msg: { k: 'hello' } });
      },
      send(to, msg) { if (bc) bc.postMessage({ from: self, to, msg }); },
      leave() { if (bc) { bc.postMessage({ from: self, msg: { k: 'bye' } }); bc.close(); bc = null; } }
    };
  }

  // Cloud signaling: a free Cloudflare Worker (cloud/signal) relays introductions between players
  // in the same room over a WebSocket. It reconnects on drops (players already linked stay linked).
  function WsSignal(base) {
    let ws = null, self = null, room = null, onMsg = null, queue = [], left = false, tries = 0, timer = 0, ping = 0, everOpen = false;
    // public / title only matter for the first player in an empty room (they decide whether it's listed)
    const url = () => { const m = CR_NET.roomMeta || {}; return base.replace(/^http/, 'ws').replace(/\/$/, '') + '/room/' + encodeURIComponent(room) + '?id=' + encodeURIComponent(self)
      + (m.pub ? '&pub=1' : '') + (m.title ? '&title=' + encodeURIComponent(String(m.title).slice(0, 28)) : ''); };
    const open = () => {
      if (left) return;
      ws = new WebSocket(url());
      ws.onopen = () => {
        tries = 0; everOpen = true; CR_NET.signalState = 'open'; ws.send(JSON.stringify({ msg: { k: 'hello' } })); queue.splice(0).forEach((s) => ws.send(s));
        clearInterval(ping); ping = setInterval(() => { try { if (ws && ws.readyState === 1) ws.send('ping'); } catch (e) { /* closing */ } }, 25000);
      };
      ws.onmessage = (e) => {
        if (e.data === 'pong') return;
        let d; try { d = JSON.parse(e.data); } catch (err) { return; }
        if (!d || !d.msg) return;
        if (d.from === 'server') {
          if (d.msg.k === 'full') { left = true; CR_NET.signalState = 'full'; if (CR_NET.onRoomFull) CR_NET.onRoomFull(); }
          else if (d.msg.k === 'off') { left = true; CR_NET.signalState = 'off'; if (CR_NET.onOff) CR_NET.onOff(); }
          else if (d.msg.k === 'busy') { left = true; CR_NET.signalState = 'busy'; if (CR_NET.onBusy) CR_NET.onBusy(d.msg.why); }
          else onMsg('server', d.msg);                                       // e.g. 'norelay': today's relay budget is used up
          return;
        }
        onMsg(d.from, d.msg);
      };
      ws.onclose = () => {
        if (left) return;
        CR_NET.signalState = 'retrying';
        if (tries++ < (everOpen ? 6 : 3)) timer = setTimeout(open, Math.min(15000, 1000 * Math.pow(2, tries)));
        else { CR_NET.signalState = everOpen ? 'down' : 'busy'; if (everOpen) { if (CR_NET.onSignalDown) CR_NET.onSignalDown(); } else if (CR_NET.onBusy) CR_NET.onBusy('unreachable'); }
      };
    };
    return {
      join(r, selfId, cb) { room = r; self = selfId; onMsg = cb; CR_NET.signalState = 'connecting'; open(); },
      send(to, msg) { const s = JSON.stringify({ to, msg }); if (ws && ws.readyState === 1) ws.send(s); else if (queue.length < 200) queue.push(s); },
      leave() { left = true; clearTimeout(timer); clearInterval(ping); try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ msg: { k: 'bye' } })); ws && ws.close(); } catch (e) { /* closed */ } ws = null; }
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Transports — interface: connect(), close(), broadcast(obj), sendTo(id, obj), peers()
  //   callbacks: onOpen(id), onClose(id), onMessage(id, obj), onFail(id, why)
  // ---------------------------------------------------------------------------------------------
  function LocalTransport(room, selfId, cb) {
    let bc = null, hb = null;
    const seen = new Map();                 // id -> last heard (ms)
    const post = (to, data) => { if (bc) bc.postMessage({ from: selfId, to, data }); };
    const touch = (id) => { const isNew = !seen.has(id); seen.set(id, Date.now()); if (isNew) cb.onOpen(id); };
    return {
      connect() {
        bc = new BroadcastChannel('cr-net-' + room);
        bc.onmessage = (e) => {
          const d = e.data; if (!d || d.from === selfId || (d.to && d.to !== selfId)) return;
          if (d.data && d.data.t === '_bye') { if (seen.delete(d.from)) cb.onClose(d.from); return; }
          if (!seen.has(d.from) && seen.size + 1 >= ROOM_CAP) return;    // room full
          touch(d.from);
          if (d.data && d.data.t === '_hi') { post(d.from, { t: '_hb' }); return; }
          if (d.data && d.data.t !== '_hb') cb.onMessage(d.from, d.data);
        };
        post(null, { t: '_hi' });
        hb = setInterval(() => {
          post(null, { t: '_hb' });
          const now = Date.now();
          seen.forEach((t, id) => { if (now - t > PEER_TIMEOUT_MS) { seen.delete(id); cb.onClose(id); } });
        }, HEARTBEAT_MS);
      },
      close() { clearInterval(hb); post(null, { t: '_bye' }); if (bc) bc.close(); bc = null; seen.clear(); },
      broadcast(obj) { post(null, obj); },
      sendTo(id, obj) { post(id, obj); },
      peers() { return [...seen.keys()]; }
    };
  }

  // descriptions / candidates travel as plain JSON (BroadcastChannel and WebSockets can't carry the objects)
  const plainSdp = (d) => ({ type: d.type, sdp: d.sdp });

  // How a link works: try a direct WebRTC data channel first. If that can't be made (some networks,
  // mostly mobile carriers, block direct links), the pair falls back to relaying through the
  // matchmaking service ({ k: 'r', d }), which the server allows within a free daily budget.
  const RELAY_MAX = 56 * 1024, RELAY_HB_MS = 4000, RELAY_TIMEOUT_MS = 14000;
  function MeshTransport(room, selfId, cb, signal) {
    const links = new Map();                // id -> { pc, dc, open, relay, lastSeen, timer }
    let hb = null, closed = false, relayRefused = false;

    const close = (L) => {
      clearTimeout(L.timer);
      try { L.dc && L.dc.close(); } catch (e) { /* closed */ }
      try { L.pc && L.pc.close(); } catch (e) { /* closed */ }
      L.dc = null; L.pc = null;
    };
    const drop = (id, why) => {
      const L = links.get(id); if (!L) return;
      // a direct link that couldn't be made / broke: keep the player through the relay instead
      if ((why === 'timeout' || why === 'failed') && !relayRefused && !closed && !L.relay) { toRelay(id, L); return; }
      links.delete(id);
      close(L);
      if (L.open) cb.onClose(id); else if (why) cb.onFail(id, why);
      log('drop', id, why || '');
    };
    const toRelay = (id, L) => {
      close(L);
      L.relay = true; L.lastSeen = Date.now();
      signal.send(id, { k: 'r', d: '{"t":"_hb"}' });                    // wakes the other side's relay too
      log('relay', id);
      if (!L.open) { L.open = true; cb.onOpen(id); }
      if (cb.onRelay) cb.onRelay(id);
    };
    const wireChannel = (id, L, dc) => {
      L.dc = dc;
      dc.onopen = () => { if (L.relay) return; L.open = true; L.lastSeen = Date.now(); clearTimeout(L.timer); log('open', id); cb.onOpen(id); };
      dc.onclose = () => { if (!L.relay) drop(id); };
      dc.onmessage = (e) => receive(id, L, e.data);
    };
    const receive = (id, L, data) => {
      L.lastSeen = Date.now(); L.got = (L.got || 0) + 1;
      if (typeof data !== 'string' || data.length > MAX_MSG) return;
      let obj; try { obj = JSON.parse(data); } catch (err) { return; }
      if (obj && obj.t === '_hb') return;
      cb.onMessage(id, obj);
    };
    const link = (id, initiator) => {
      if (links.has(id) || closed) return links.get(id);
      if (links.size + 1 >= ROOM_CAP) { signal.send(id, { k: 'full' }); return null; }
      const L = { pc: null, dc: null, open: false, relay: false, lastSeen: Date.now(), timer: 0 };
      links.set(id, L);
      if (CR_NET.forceRelay) { toRelay(id, L); return L; }             // testing: skip the direct attempt
      // STUN finds a direct route; a TURN relay pass (if configured) is only used when that fails
      const pc = L.pc = new RTCPeerConnection({ iceServers: ICE.concat(CR_NET.turnServers || []), iceTransportPolicy: CR_NET.forceFail ? 'relay' : 'all' });
      L.timer = setTimeout(() => { if (!L.open) drop(id, 'timeout'); }, CONNECT_TIMEOUT_MS);
      pc.onicecandidate = (e) => { if (e.candidate) signal.send(id, { k: 'ice', c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
      pc.onconnectionstatechange = () => { if (L.relay) return; if (pc.connectionState === 'failed') drop(id, 'failed'); else if (pc.connectionState === 'closed') drop(id); };
      if (initiator) {
        wireChannel(id, L, pc.createDataChannel('cr', { ordered: true }));
        pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => signal.send(id, { k: 'offer', sdp: plainSdp(pc.localDescription) })).catch(() => drop(id, 'failed'));
      } else {
        pc.ondatachannel = (e) => wireChannel(id, L, e.channel);
      }
      return L;
    };
    const onSignal = async (from, msg) => {
      if (!msg || closed) return;
      try {
        if (from === 'server') {
          if (msg.k === 'norelay') {
            // over today's relay budget: relayed players can't stay linked
            relayRefused = true;
            [...links.entries()].filter(([, L]) => L.relay).forEach(([id, L]) => { links.delete(id); close(L); if (L.open) cb.onClose(id); cb.onFail(id, 'blocked'); });
          }
          return;
        }
        if (msg.k === 'r') {
          let L = links.get(from);
          if (!L) { if (relayRefused || links.size + 1 >= ROOM_CAP) return; L = { pc: null, dc: null, open: false, relay: false, lastSeen: Date.now(), timer: 0 }; links.set(from, L); }
          if (!L.relay) toRelay(from, L);
          receive(from, L, msg.d);
          return;
        }
        if (msg.k === 'hello' || msg.k === 'here') {
          // the lower id makes the offer, so two peers never both offer at once
          if (msg.k === 'hello') signal.send(from, { k: 'here' });
          if (selfId < from) link(from, true);
        } else if (msg.k === 'offer') {
          const L = link(from, false); if (!L || L.relay) return;
          await L.pc.setRemoteDescription(msg.sdp);
          const a = await L.pc.createAnswer(); await L.pc.setLocalDescription(a);
          signal.send(from, { k: 'answer', sdp: plainSdp(L.pc.localDescription) });
          (L.pendingIce || []).forEach((c) => L.pc.addIceCandidate(c).catch(() => {})); L.pendingIce = null;
        } else if (msg.k === 'answer') {
          const L = links.get(from); if (!L || L.relay) return;
          await L.pc.setRemoteDescription(msg.sdp);
          (L.pendingIce || []).forEach((c) => L.pc.addIceCandidate(c).catch(() => {})); L.pendingIce = null;
        } else if (msg.k === 'ice') {
          const L = links.get(from); if (!L || L.relay) return;
          if (!L.pc.remoteDescription) (L.pendingIce = L.pendingIce || []).push(msg.c);
          else L.pc.addIceCandidate(msg.c).catch(() => {});
        } else if (msg.k === 'bye') { const L = links.get(from); if (L) { links.delete(from); close(L); if (L.open) cb.onClose(from); } }
        else if (msg.k === 'full') cb.onFail(from, 'room full');
      } catch (e) { drop(from, 'failed'); }
    };
    const sendRaw = (id, L, s) => {
      if (!L.open) return;
      if (L.relay) { if (s.length <= RELAY_MAX && JSON.stringify(s).length <= 62 * 1024) { L.sent = (L.sent || 0) + 1; signal.send(id, { k: 'r', d: s }); } return; }
      if (!L.dc || L.dc.readyState !== 'open') return;
      if (L.dc.bufferedAmount > 4 * 1024 * 1024) return;          // a stalled link: skip rather than pile up
      try { L.dc.send(s); } catch (e) { /* closing */ }
    };
    return {
      connect() {
        signal.join(room, selfId, onSignal);
        let tick = 0;
        hb = setInterval(() => {
          const now = Date.now(), ping = JSON.stringify({ t: '_hb' });
          tick++;
          links.forEach((L, id) => {
            if (!L.open) return;
            if (!L.relay) { sendRaw(id, L, ping); if (now - L.lastSeen > PEER_TIMEOUT_MS) drop(id); }
            else { if (tick % Math.round(RELAY_HB_MS / HEARTBEAT_MS) === 0) sendRaw(id, L, ping); if (now - L.lastSeen > RELAY_TIMEOUT_MS) { links.delete(id); close(L); cb.onClose(id); } }
          });
        }, HEARTBEAT_MS);
      },
      close() { closed = true; clearInterval(hb); [...links.keys()].forEach((id) => { const L = links.get(id); links.delete(id); close(L); if (L.open) cb.onClose(id); }); signal.leave(); },
      broadcast(obj) { const s = JSON.stringify(obj); if (s.length > MAX_MSG) return false; links.forEach((L, id) => sendRaw(id, L, s)); return true; },
      sendTo(id, obj) { const L = links.get(id); if (!L) return; const s = JSON.stringify(obj); if (s.length <= MAX_MSG) sendRaw(id, L, s); },
      peers() { return [...links.entries()].filter(([, L]) => L.open).map(([id]) => id); },
      relayed() { return [...links.entries()].filter(([, L]) => L.open && L.relay).map(([id]) => id); },
      diag() { return [...links.entries()].map(([id, L]) => ({ id, state: L.open ? (L.relay ? 'relay' : 'direct') : (L.pc ? 'connecting (' + (L.pc.iceConnectionState || '?') + ')' : 'connecting'), sent: L.sent || 0, got: L.got || 0 })); },
      relayRefused() { return relayRefused; }
    };
  }

  // ---------------------------------------------------------------------------------------------
  // The channel stand-in (same surface the game uses on a Supabase RealtimeChannel)
  // ---------------------------------------------------------------------------------------------
  function PeerChannel(name, opts) {
    const selfId = (opts && opts.config && opts.config.presence && opts.config.presence.key) || ('peer_' + Math.random().toString(36).slice(2));
    const room = String(name).replace(/^coop-room-/i, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
    const presence = new Map();             // id -> latest tracked state
    const buckets = new Map();              // id -> { tokens, at }
    const ch = {
      state: 'closed', topic: name, bindings: { broadcast: [], presence: [] },
      stats: { sent: 0, recv: 0, dropped: 0, failed: [] },
      on(type, filter, callback) { (ch.bindings[type] = ch.bindings[type] || []).push({ type, filter: filter || {}, callback }); return ch; },
      subscribe(statusCb) {
        try {
          ch.transport = CR_NET.makeTransport(room, selfId, handlers);
          ch.transport.connect();
          ch.state = 'joined';
          if (!ch._bye) { ch._bye = () => { if (ch.state === 'joined') ch.unsubscribe(); }; window.addEventListener('pagehide', ch._bye); }
          setTimeout(() => statusCb && statusCb('SUBSCRIBED'), 0);
        } catch (e) {
          console.warn('[net] connect failed', e);
          ch.state = 'errored';
          setTimeout(() => statusCb && statusCb('CHANNEL_ERROR', e), 0);
        }
        return ch;
      },
      send(msg) {
        if (ch.state !== 'joined' || !ch.transport) return Promise.resolve('error');
        if (!msg || msg.type !== 'broadcast') return Promise.resolve('ok');
        ch.stats.sent++;
        ch.transport.broadcast({ t: 'b', e: msg.event, p: msg.payload });
        return Promise.resolve('ok');
      },
      track(state) {
        ch.self = state;
        if (ch.transport) ch.transport.broadcast({ t: 'p', s: state });
        emitPresence('sync', {});
        return Promise.resolve('ok');
      },
      untrack() { ch.self = null; if (ch.transport) ch.transport.broadcast({ t: 'pu' }); return Promise.resolve('ok'); },
      presenceState() {
        const out = {};
        if (ch.self) out[selfId] = [Object.assign({ presence_ref: selfId }, ch.self)];
        presence.forEach((s, id) => { out[id] = [Object.assign({ presence_ref: id }, s)]; });
        return out;
      },
      unsubscribe() { if (ch._bye) { window.removeEventListener('pagehide', ch._bye); ch._bye = null; } ch.state = 'closed'; if (ch.transport) ch.transport.close(); ch.transport = null; presence.clear(); return Promise.resolve('ok'); },
      peers() { return ch.transport ? ch.transport.peers() : []; },
      relayed() { return ch.transport && ch.transport.relayed ? ch.transport.relayed() : []; },
      diag() { return ch.transport && ch.transport.diag ? ch.transport.diag() : []; }
    };
    function emitPresence(event, payload) {
      (ch.bindings.presence || []).forEach((b) => {
        if (b.filter.event && b.filter.event !== event) return;
        try { b.callback(Object.assign({ event }, payload)); } catch (e) { console.warn('[net] presence handler', e); }
      });
    }
    function dispatch(event, payload) {
      (ch.bindings.broadcast || []).forEach((b) => {
        const ev = b.filter.event;
        if (ev !== '*' && (!ev || String(ev).toLowerCase() !== String(event).toLowerCase())) return;
        try { b.callback({ type: 'broadcast', event, payload }); } catch (e) { console.warn('[net] handler', event, e); }
      });
    }
    function allow(id) {
      const now = Date.now(), b = buckets.get(id) || { tokens: BURST, at: now };
      b.tokens = Math.min(BURST, b.tokens + (now - b.at) / 1000 * RATE); b.at = now;
      buckets.set(id, b);
      if (b.tokens < 1) return false;
      b.tokens -= 1; return true;
    }
    const handlers = {
      onOpen(id) { log('peer joined', id); if (ch.self && ch.transport) ch.transport.sendTo(id, { t: 'p', s: ch.self }); },
      onClose(id) {
        buckets.delete(id);
        const s = presence.get(id) || { id };
        presence.delete(id);
        emitPresence('leave', { key: id, leftPresences: [s], currentPresences: [] }); emitPresence('sync', {});
      },
      onRelay(id) { ch.stats.relayed = (ch.stats.relayed || 0) + 1; log('relaying', id); if (CR_NET.onRelay) CR_NET.onRelay(id); },
      onFail(id, why) { ch.stats.failed.push({ id, why, at: Date.now() }); log('peer failed', id, why); if (CR_NET.onPeerFail) CR_NET.onPeerFail(id, why); },
      onMessage(id, m) {
        if (!m || typeof m.t !== 'string') return;
        if (!allow(id)) { ch.stats.dropped++; return; }
        ch.stats.recv++;
        if (m.t === 'b' && typeof m.e === 'string') dispatch(m.e, m.p);
        else if (m.t === 'p' && m.s && typeof m.s === 'object') {
          const isNew = !presence.has(id);
          presence.set(id, m.s);
          if (isNew) emitPresence('join', { key: id, newPresences: [m.s], currentPresences: [] });
          emitPresence('sync', {});
        } else if (m.t === 'pu') {
          const s = presence.get(id);
          if (s) { presence.delete(id); emitPresence('leave', { key: id, leftPresences: [s], currentPresences: [] }); emitPresence('sync', {}); }
        }
      }
    };
    return ch;
  }

  // database calls (room list, world-state persistence) become harmless no-ops
  function noopQuery() {
    const res = Promise.resolve({ data: null, error: null });
    const qb = new Proxy(function () {}, {
      get(t, k) { if (k === 'then') return res.then.bind(res); if (k === 'catch') return res.catch.bind(res); return () => qb; },
      apply() { return qb; }
    });
    return qb;
  }

  const mode = (q.get('net') || '').toLowerCase();
  const CR_NET = window.CR_NET = {
    mode: (mode === 'p2p' || mode === 'local') ? mode : null,
    // 'cloud' (default): the Cloudflare matchmaking Worker; 'local': two tabs on one computer, no server
    signal: (q.get('sig') || 'cloud').toLowerCase(),
    SIGNAL_URL: q.get('sigurl') || 'https://chrono-rift-signal.sgaidude.workers.dev',
    signalState: 'idle',
    VERSION: NET_VERSION,
    ROOM_CAP,
    enabled() { return !!CR_NET.mode; },
    forceRelay: q.has('relay') && q.get('relay') !== 'fail',             // ?relay: test the relay path
    forceFail: q.get('relay') === 'fail',                                // ?relay=fail: direct links fail (like a blocking network)
    enable(m) { CR_NET.mode = m || 'p2p'; },
    // relay pass for networks that block direct links (mobile carriers); reused until it nearly expires
    turnServers: null, turnUntil: 0,
    async fetchTurn() {
      if (CR_NET.turnServers && Date.now() < CR_NET.turnUntil) return CR_NET.turnServers;
      try {
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const t = setTimeout(() => ctl && ctl.abort(), 4000);
        const r = await fetch(CR_NET.SIGNAL_URL.replace(/\/$/, '') + '/turn', { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
        clearTimeout(t);
        const j = await r.json();
        if (Array.isArray(j.iceServers) && j.iceServers.length) {
          CR_NET.turnServers = j.iceServers;
          CR_NET.turnUntil = Date.now() + Math.max(60, (j.ttl || 7200) - 600) * 1000;
        } else log('no relay pass:', j.why);
      } catch (e) { log('relay pass unavailable', e); }
      return CR_NET.turnServers;
    },
    disable() { CR_NET.mode = null; },
    makeSignal() {
      if (CR_NET.signalFactory) return CR_NET.signalFactory();
      return CR_NET.signal === 'local' ? LocalSignal() : WsSignal(CR_NET.SIGNAL_URL);
    },
    makeTransport(room, selfId, cb) {
      if (CR_NET.mode === 'local') return LocalTransport(room, selfId, cb);
      if (typeof RTCPeerConnection === 'undefined') throw new Error('WebRTC unavailable');
      return MeshTransport(room, selfId, cb, CR_NET.makeSignal());
    },
    client() {
      return {
        channel: (name, opts) => PeerChannel(name, opts),
        removeChannel: (c) => (c && c.unsubscribe ? c.unsubscribe() : Promise.resolve('ok')),
        from: () => noopQuery()
      };
    }
  };
})();
