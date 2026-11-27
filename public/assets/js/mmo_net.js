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
  const HEARTBEAT_MS = 2000, PEER_TIMEOUT_MS = 9000, CONNECT_TIMEOUT_MS = 15000;
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

  function MeshTransport(room, selfId, cb, signal) {
    const links = new Map();                // id -> { pc, dc, open, lastSeen, timer }
    let hb = null, closed = false;

    const drop = (id, why) => {
      const L = links.get(id); if (!L) return;
      links.delete(id);
      clearTimeout(L.timer);
      try { L.dc && L.dc.close(); } catch (e) { /* closed */ }
      try { L.pc.close(); } catch (e) { /* closed */ }
      if (L.open) cb.onClose(id); else if (why) cb.onFail(id, why);
      log('drop', id, why || '');
    };
    const wireChannel = (id, L, dc) => {
      L.dc = dc;
      dc.onopen = () => { L.open = true; L.lastSeen = Date.now(); clearTimeout(L.timer); log('open', id); cb.onOpen(id); };
      dc.onclose = () => drop(id);
      dc.onmessage = (e) => {
        L.lastSeen = Date.now();
        if (typeof e.data !== 'string' || e.data.length > MAX_MSG) return;
        let obj; try { obj = JSON.parse(e.data); } catch (err) { return; }
        if (obj && obj.t === '_hb') return;
        cb.onMessage(id, obj);
      };
    };
    const link = (id, initiator) => {
      if (links.has(id) || closed) return links.get(id);
      if (links.size + 1 >= ROOM_CAP) { signal.send(id, { k: 'full' }); return null; }
      const pc = new RTCPeerConnection({ iceServers: ICE });
      const L = { pc, dc: null, open: false, lastSeen: Date.now(), timer: 0 };
      links.set(id, L);
      L.timer = setTimeout(() => { if (!L.open) drop(id, 'timeout'); }, CONNECT_TIMEOUT_MS);
      pc.onicecandidate = (e) => { if (e.candidate) signal.send(id, { k: 'ice', c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') drop(id, 'failed'); else if (pc.connectionState === 'closed') drop(id); };
      if (initiator) {
        wireChannel(id, L, pc.createDataChannel('cr', { ordered: true }));
        pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => signal.send(id, { k: 'offer', sdp: plainSdp(pc.localDescription) })).catch((e) => drop(id, 'offer ' + e));
      } else {
        pc.ondatachannel = (e) => wireChannel(id, L, e.channel);
      }
      return L;
    };
    const onSignal = async (from, msg) => {
      if (!msg || closed) return;
      try {
        if (msg.k === 'hello' || msg.k === 'here') {
          // the lower id makes the offer, so two peers never both offer at once
          if (msg.k === 'hello') signal.send(from, { k: 'here' });
          if (selfId < from) link(from, true);
        } else if (msg.k === 'offer') {
          const L = link(from, false); if (!L) return;
          await L.pc.setRemoteDescription(msg.sdp);
          const a = await L.pc.createAnswer(); await L.pc.setLocalDescription(a);
          signal.send(from, { k: 'answer', sdp: plainSdp(L.pc.localDescription) });
          (L.pendingIce || []).forEach((c) => L.pc.addIceCandidate(c).catch(() => {})); L.pendingIce = null;
        } else if (msg.k === 'answer') {
          const L = links.get(from); if (!L) return;
          await L.pc.setRemoteDescription(msg.sdp);
          (L.pendingIce || []).forEach((c) => L.pc.addIceCandidate(c).catch(() => {})); L.pendingIce = null;
        } else if (msg.k === 'ice') {
          const L = links.get(from); if (!L) return;
          if (!L.pc.remoteDescription) (L.pendingIce = L.pendingIce || []).push(msg.c);
          else L.pc.addIceCandidate(msg.c).catch(() => {});
        } else if (msg.k === 'bye') drop(from);
        else if (msg.k === 'full') cb.onFail(from, 'room full');
      } catch (e) { drop(from, 'signal ' + e); }
    };
    const sendRaw = (L, s) => {
      if (!L.open || !L.dc || L.dc.readyState !== 'open') return;
      if (L.dc.bufferedAmount > 4 * 1024 * 1024) return;          // a stalled link: skip rather than pile up
      try { L.dc.send(s); } catch (e) { /* closing */ }
    };
    return {
      connect() {
        signal.join(room, selfId, onSignal);
        hb = setInterval(() => {
          const now = Date.now(), ping = JSON.stringify({ t: '_hb' });
          links.forEach((L, id) => { if (L.open) { sendRaw(L, ping); if (now - L.lastSeen > PEER_TIMEOUT_MS) drop(id); } });
        }, HEARTBEAT_MS);
      },
      close() { closed = true; clearInterval(hb); [...links.keys()].forEach((id) => drop(id)); signal.leave(); },
      broadcast(obj) { const s = JSON.stringify(obj); if (s.length > MAX_MSG) return false; links.forEach((L) => sendRaw(L, s)); return true; },
      sendTo(id, obj) { const L = links.get(id); if (!L) return; const s = JSON.stringify(obj); if (s.length <= MAX_MSG) sendRaw(L, s); },
      peers() { return [...links.entries()].filter(([, L]) => L.open).map(([id]) => id); }
    };
  }

  // ---------------------------------------------------------------------------------------------
  // The channel stand-in (same surface the game uses on a Supabase RealtimeChannel)
  // ---------------------------------------------------------------------------------------------
  function PeerChannel(name, opts) {
    const selfId = (opts && opts.config && opts.config.presence && opts.config.presence.key) || ('peer_' + Math.random().toString(36).slice(2));
    const room = String(name).replace(/[^A-Za-z0-9_-]/g, '');
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
      unsubscribe() { ch.state = 'closed'; if (ch.transport) ch.transport.close(); ch.transport = null; presence.clear(); return Promise.resolve('ok'); },
      peers() { return ch.transport ? ch.transport.peers() : []; }
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
        const s = presence.get(id);
        if (s) { presence.delete(id); emitPresence('leave', { key: id, leftPresences: [s], currentPresences: [] }); emitPresence('sync', {}); }
      },
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
    signal: (q.get('sig') || 'local').toLowerCase(),
    ROOM_CAP,
    enabled() { return !!CR_NET.mode; },
    makeSignal() {
      if (CR_NET.signalFactory) return CR_NET.signalFactory();       // phase 2: WebSocket signaling plugs in here
      return LocalSignal();
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
