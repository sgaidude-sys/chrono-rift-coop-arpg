/* =============================================================================
 * Chrono-Rift matchmaking / signaling (Cloudflare Worker + Durable Object, free tier)
 *
 *  Players never send game traffic through here. A room is one Durable Object holding the
 *  WebSockets of the players in it; it only relays the short WebRTC "introduction" messages
 *  (offer / answer / ICE candidates) between them. After that the players talk directly.
 *
 *  GET /status            -> { enabled, cap }
 *  GET /room/<CODE>?id=X[&pub=1&title=T]
 *                         -> WebSocket. Client sends { to?, msg }, receives { from, msg }.
 *                            Server sends { from: 'server', msg: { k: 'full' | 'off' } }.
 *                            The first player in an empty room decides public / title.
 *  GET /rooms             -> { rooms: [{ code, n, title }] } public rooms with space (cached 10 s)
 *  GET /quick             -> { code | null } the busiest public room with space, for Quick Play
 *  Rooms report their player count to one Lobby object whenever someone joins or leaves; empty,
 *  full and stale rooms drop off the list.
 *
 *  Safety rails: MP_ENABLED switch (set it to "false" in the Cloudflare dashboard to turn
 *  multiplayer off without touching the game), 4 players per room, 16 KB per message,
 *  40 messages per 10 s per player, room codes A-Z 0-9 - (3-16 chars).
 *  WebSockets use the hibernation API, so idle rooms cost nothing.
 * ============================================================================= */
const CAP = 4;
const MAX_MSG = 16 * 1024;
const RATE_N = 40, RATE_MS = 10000;

const STALE_MS = 2 * 60 * 60 * 1000;      // a room that stopped reporting for 2 h is dropped
const BAD = /(fuck|shit|cunt|nigg|fag|rape|nazi|hitler|porn|sex|dick|pussy|whore|slut|bitch|kill\s*your)/i;
const cleanTitle = (t) => { t = String(t || '').replace(/[^\p{L}\p{N} '!.,:-]/gu, '').trim().slice(0, 28); return !t || BAD.test(t) ? "A Hero's Realm" : t; };

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...cors } });
const enabled = (env) => String(env.MP_ENABLED ?? 'true').toLowerCase() !== 'false';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (url.pathname === '/status') return json({ enabled: enabled(env), cap: CAP });
    const lobby = () => env.LOBBY.get(env.LOBBY.idFromName('lobby'));
    if (url.pathname === '/rooms' || url.pathname === '/quick') {
      if (!enabled(env)) return json(url.pathname === '/rooms' ? { rooms: [], off: true } : { code: null, off: true });
      if (url.pathname === '/quick') return lobby().fetch('https://lobby/quick');
      // the list is shared by everyone: cache it at the edge for 10 s
      const cache = caches.default, key = new Request('https://lobby/rooms-cache');
      let res = await cache.match(key);
      if (!res) {
        const body = await (await lobby().fetch('https://lobby/list')).text();
        res = new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=10', ...cors } });
        await cache.put(key, res.clone());
      }
      return res;
    }
    const m = /^\/room\/([A-Za-z0-9-]{3,16})$/.exec(url.pathname);
    if (!m) return json({ error: 'not found' }, 404);
    if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket expected' }, 426);
    const id = url.searchParams.get('id') || '';
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return json({ error: 'bad id' }, 400);
    const code = m[1].toUpperCase();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(req);
  }
};

export class Room {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(req) {
    const u = new URL(req.url);
    const id = u.searchParams.get('id');
    this.code = (/^\/room\/([A-Za-z0-9-]{3,16})$/.exec(u.pathname) || [])[1];
    if (this.code) { this.code = this.code.toUpperCase(); await this.ctx.storage.put('code', this.code); }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, n: 0, t0: Date.now() });
    if (!enabled(this.env)) {
      server.serializeAttachment({ id, rejected: true });
      server.send(JSON.stringify({ from: 'server', msg: { k: 'off' } }));
      server.close(4001, 'multiplayer off');
    } else {
      // same player reconnecting: drop the stale socket; otherwise enforce the room cap
      const others = this.ctx.getWebSockets().filter((w) => w !== server);
      others.filter((w) => this.idOf(w) === id).forEach((w) => { try { w.close(4002, 'replaced'); } catch (e) { /* gone */ } });
      const live = others.filter((w) => { const wid = this.idOf(w); return wid && wid !== id; });
      if (live.length >= CAP) {
        server.serializeAttachment({ id, rejected: true });
        server.send(JSON.stringify({ from: 'server', msg: { k: 'full' } }));
        server.close(4003, 'room full');
      } else {
        // the first player in an empty room decides whether it is listed, and its title
        if (!live.length) await this.ctx.storage.put('meta', { pub: u.searchParams.get('pub') === '1', title: cleanTitle(u.searchParams.get('title')) });
        await this.report(null);
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // turned-away sockets (room full / switched off) don't count as players
  idOf(ws) { try { const a = ws.deserializeAttachment() || {}; return a.rejected ? null : a.id; } catch (e) { return null; } }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MSG) return;
    const a = ws.deserializeAttachment() || {};
    if (a.rejected) return;
    const now = Date.now();
    if (now - (a.t0 || 0) > RATE_MS) { a.t0 = now; a.n = 0; }
    a.n = (a.n || 0) + 1;
    ws.serializeAttachment(a);
    if (a.n > RATE_N) { if (a.n === RATE_N + 1) ws.send(JSON.stringify({ from: 'server', msg: { k: 'slow' } })); return; }
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m.msg !== 'object') return;
    const out = JSON.stringify({ from: a.id, msg: m.msg });
    for (const w of this.ctx.getWebSockets()) {
      if (w === ws) continue;
      const wid = this.idOf(w);
      if (m.to && wid !== m.to) continue;
      try { w.send(out); } catch (e) { /* closing */ }
    }
  }

  async webSocketClose(ws) { this.bye(ws); await this.report(ws); }
  async webSocketError(ws) { this.bye(ws); await this.report(ws); }

  // players in the room right now (one per id; turned-away and closing sockets excluded)
  count(except) {
    const ids = new Set();
    for (const w of this.ctx.getWebSockets()) { if (w === except) continue; const id = this.idOf(w); if (id) ids.add(id); }
    return ids.size;
  }

  async report(except) {
    try {
      const code = this.code || (await this.ctx.storage.get('code'));
      if (!code) return;
      const meta = (await this.ctx.storage.get('meta')) || { pub: false, title: '' };
      const n = this.count(except);
      await this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby')).fetch('https://lobby/report', {
        method: 'POST', body: JSON.stringify({ code, n, pub: !!meta.pub, title: meta.title })
      });
    } catch (e) { /* the list is best-effort */ }
  }

  bye(ws) {
    const id = this.idOf(ws);
    if (!id) return;
    const out = JSON.stringify({ from: id, msg: { k: 'bye' } });
    for (const w of this.ctx.getWebSockets()) { if (w !== ws) { try { w.send(out); } catch (e) { /* closing */ } } }
  }
}

// One Lobby object: which public rooms exist, how full they are
export class Lobby {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.rooms = null; }

  async load() {
    if (this.rooms) return;
    this.rooms = new Map();
    const all = await this.ctx.storage.list({ prefix: 'r:' });
    all.forEach((v, k) => this.rooms.set(k.slice(2), v));
  }

  open() {
    const now = Date.now(), out = [];
    this.rooms.forEach((r, code) => {
      if (now - r.at > STALE_MS) { this.rooms.delete(code); this.ctx.storage.delete('r:' + code); return; }
      if (r.pub && r.n > 0 && r.n < CAP) out.push({ code, n: r.n, title: r.title });
    });
    return out.sort((a, b) => b.n - a.n).slice(0, 20);
  }

  async fetch(req) {
    await this.load();
    const path = new URL(req.url).pathname;
    if (path === '/report' && req.method === 'POST') {
      let r; try { r = await req.json(); } catch (e) { return json({ ok: false }, 400); }
      if (!r || !/^[A-Z0-9-]{3,16}$/.test(r.code)) return json({ ok: false }, 400);
      if (!r.n || r.n <= 0) { this.rooms.delete(r.code); await this.ctx.storage.delete('r:' + r.code); }
      else { const v = { n: r.n, pub: !!r.pub, title: cleanTitle(r.title), at: Date.now() }; this.rooms.set(r.code, v); await this.ctx.storage.put('r:' + r.code, v); }
      return json({ ok: true });
    }
    if (path === '/list') return json({ rooms: this.open() });
    if (path === '/quick') { const list = this.open(); return json({ code: list.length ? list[0].code : null }); }
    return json({ error: 'not found' }, 404);
  }
}
