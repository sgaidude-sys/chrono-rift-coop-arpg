/* =============================================================================
 * Chrono-Rift — realtime message bundling (keeps co-op inside Supabase's free tier)
 *
 *  Supabase counts every broadcast once per send plus once per player who
 *  receives it, so traffic grows with players². Instead of one broadcast per
 *  event (each sword swing, each hit, each position update...), every client
 *  now collects its outgoing events and sends them as ONE 'bundle' message at
 *  most every 200 ms (≤ 5 messages/s per player, and nothing while idle).
 *
 *   • player_state: only the newest position/state in a bundle is kept
 *   • mobs_snapshot (host): merged, later entries win per monster id
 *   • everything else keeps its order
 *   • time-critical events (boss telegraphs, enemy attacks, staggers) flush
 *     within ~60 ms so dodge timing is unchanged
 *
 *  Receivers unpack a bundle and hand each event to the same listeners as
 *  before, so the rest of the game code is untouched.
 *  (Everyone in a room must be on this version; older clients ignore bundles.)
 * ============================================================================= */
(function () {
  'use strict';
  const FLUSH_MS = 200, URGENT_MS = 60, MAX_BYTES = 200 * 1024;
  const URGENT = { boss_cast: 1, mob_attack: 1, mob_stagger: 1, portal_wave: 1, wave_sync: 1 };
  const LATEST_ONLY = { player_state: 1 };

  const GP = ChronoRiftCoOpGame.prototype;

  function dispatch(ch, event, payload) {
    const list = (ch.bindings && (ch.bindings.broadcast || ch.bindings.BROADCAST)) || [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const ev = b.filter && b.filter.event;
      if (ev !== '*' && (!ev || String(ev).toLowerCase() !== event.toLowerCase())) continue;
      try { b.callback({ type: 'broadcast', event, payload }); } catch (e) { console.warn('[NetBatch] handler', event, e); }
    }
  }

  Object.assign(GP, {
    installNetBatch(ch) {
      if (!ch || ch.__netBatch) return;
      const game = this;
      const origSend = ch.send.bind(ch);
      const B = ch.__netBatch = { q: [], timer: null, last: 0, sent: 0, events: 0 };

      const flush = () => {
        B.timer = null;
        if (!B.q.length) return;
        if (game.channel !== ch || ch.state !== 'joined') { B.q.length = 0; return; }
        let items = B.q; B.q = [];
        // split very large bundles (big host snapshots) to stay well under the 256 KB payload cap
        while (items.length) {
          let n = items.length, body = JSON.stringify(items);
          while (body.length > MAX_BYTES && n > 1) { n = Math.ceil(n / 2); body = JSON.stringify(items.slice(0, n)); }
          const part = items.slice(0, n); items = items.slice(n);
          B.sent++;
          const r = origSend({ type: 'broadcast', event: 'bundle', payload: { v: 1, m: part } });
          if (r && r.catch) r.catch(() => {});
        }
        B.last = performance.now();
      };
      const schedule = (urgent) => {
        const wait = urgent ? Math.max(0, Math.min(URGENT_MS, FLUSH_MS - (performance.now() - B.last))) : FLUSH_MS;
        if (B.timer && !urgent) return;
        if (B.timer) clearTimeout(B.timer);
        B.timer = setTimeout(flush, wait);
      };

      ch.send = function (msg, opts) {
        if (!msg || msg.type !== 'broadcast' || msg.event === 'bundle') return origSend(msg, opts);
        B.events++;
        const e = msg.event, p = msg.payload;
        if (LATEST_ONLY[e]) {
          // keep its place in the queue, just refresh the payload
          const prev = B.q.find(it => it.e === e);
          if (prev) prev.p = p; else B.q.push({ e, p });
        } else if (e === 'combat_action' && p && game.player && game.player.pos) {
          // stamp where the caster stood, so partners replay it from the right spot
          const pl = game.player;
          B.q.push({ e, p: Object.assign({}, p, { cx: +pl.pos.x.toFixed(2), cz: +pl.pos.z.toFixed(2), cy: +(pl.pos.y || 0).toFixed(2), cyaw: +(pl.yaw || 0).toFixed(3) }) });
        } else if (e === 'mobs_snapshot' && p && Array.isArray(p.mobs)) {
          const prev = B.q.find(it => it.e === 'mobs_snapshot');
          if (prev) {
            const byId = new Map(prev.p.mobs.map(m => [m.id, m]));
            p.mobs.forEach(m => byId.set(m.id, m));
            prev.p = Object.assign({}, p, { mobs: [...byId.values()] });
          } else B.q.push({ e, p });
        } else B.q.push({ e, p });
        schedule(!!URGENT[e]);
        return Promise.resolve('ok');
      };

      ch.on('broadcast', { event: 'bundle' }, ({ payload }) => {
        if (!payload || !Array.isArray(payload.m) || game.channel !== ch) return;
        for (let i = 0; i < payload.m.length; i++) {
          const it = payload.m[i];
          if (!it || typeof it.e !== 'string' || it.e === 'bundle') continue;
          if (it.e === 'combat_action' && it.p && typeof it.p.cx === 'number' && game.remotePeers) {
            const peer = game.remotePeers.get(it.p.id);
            if (peer && peer.pos) {
              peer.pos.set(it.p.cx, it.p.cy || 0, it.p.cz);
              if (peer.targetPos) peer.targetPos.set(it.p.cx, it.p.cy || 0, it.p.cz);
              if (typeof it.p.cyaw === 'number') { peer.yaw = it.p.cyaw; if (typeof peer.targetYaw === 'number') peer.targetYaw = it.p.cyaw; }
            }
          }
          dispatch(ch, it.e, it.p);
        }
      });
    },

    netBatchStats() {
      const B = this.channel && this.channel.__netBatch;
      return B ? { bundlesSent: B.sent, eventsQueued: B.events } : null;
    }
  });

  window.CR_NETBATCH = { FLUSH_MS };
})();
