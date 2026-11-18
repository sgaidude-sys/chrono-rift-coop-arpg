// =============================================================================
// CHRONO-RIFT WORLD CORE — pure math, no DOM / Three.js.
// Seeded world layout (zones, roads, camps, props) + terrain heights.
// Usable from the browser (<script>, exposes window.ChronoWorld) and from Node:
//   const { getTerrainHeight } = require('./world_core.js');
//   getTerrainHeight(120.5, -340.2)  // identical on every client and server
// Deterministic: everything derives from MMO.WORLD.seed; Math.random is never used.
// =============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mmo_data.js'));
  else root.ChronoWorld = factory(root.MMO);
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';
  const W = M.WORLD;

  // ---------------------------------------------------------------------------
  // Deterministic RNG + noise
  // ---------------------------------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash2(x, z, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, z, s) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, z, s, oct) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * f, z * f, s + i * 17); norm += amp; f *= 2; amp *= 0.5; }
    return sum / norm;
  }
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

  // ---------------------------------------------------------------------------
  // WORLD GENERATOR (pure data, identical on every client from the seed)
  // ---------------------------------------------------------------------------
  class WorldGen {
    constructor() {
      this.seed = W.seed;
      this.zones = M.ZONES.map((z, i) => Object.assign({}, z, { idx: i }));
      this.zoneById = {};
      this.zones.forEach(z => { this.zoneById[z.id] = z; });
      this.segments = [];
      this.segGrid = new Map();
      this.chunkCache = new Map();
      this._zr = { i: 0, j: 0, f: 0 };
      this.buildLayout();
    }

    // Weighted, domain-warped Voronoi. f ≈ distance (world units) to the zone border.
    zoneAt(x, z, out = this._zr) {
      const wx = x + (fbm(x * 0.0032, z * 0.0032, 11, 3) - 0.5) * 190;
      const wz = z + (fbm(x * 0.0032 + 50, z * 0.0032 - 30, 23, 3) - 0.5) * 190;
      let b1 = 1e9, b2 = 1e9, i1 = 0, i2 = 0;
      for (let i = 0; i < this.zones.length; i++) {
        const zn = this.zones[i];
        const d = Math.hypot(wx - zn.center[0], wz - zn.center[1]) / zn.weight;
        if (d < b1) { b2 = b1; i2 = i1; b1 = d; i1 = i; } else if (d < b2) { b2 = d; i2 = i; }
      }
      out.i = i1; out.j = i2; out.f = (b2 - b1) * 0.5;
      const tr = Math.hypot(x, z);
      if (tr < 260) { out.i = 0; out.f = Math.max(out.f, 260 - tr); }
      const edge = W.half - Math.max(Math.abs(x), Math.abs(z));
      if (edge < out.f) out.f = edge;
      return out;
    }

    zoneIdAt(x, z) { return this.zones[this.zoneAt(x, z).i].id; }

    addRoad(points) {
      for (let k = 0; k < points.length - 1; k++) {
        const s = { ax: points[k][0], az: points[k][1], bx: points[k + 1][0], bz: points[k + 1][1] };
        const id = this.segments.length;
        this.segments.push(s);
        const minX = Math.min(s.ax, s.bx) - 30, maxX = Math.max(s.ax, s.bx) + 30;
        const minZ = Math.min(s.az, s.bz) - 30, maxZ = Math.max(s.az, s.bz) + 30;
        for (let cx = Math.floor(minX / 100); cx <= Math.floor(maxX / 100); cx++) {
          for (let cz = Math.floor(minZ / 100); cz <= Math.floor(maxZ / 100); cz++) {
            const key = cx + ',' + cz;
            if (!this.segGrid.has(key)) this.segGrid.set(key, []);
            this.segGrid.get(key).push(id);
          }
        }
      }
    }

    curvedPath(ax, az, bx, bz, seed, wobble = 70) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(2, Math.ceil(len / 45));
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const off = (fbm(t * 3.1, seed * 0.37, seed, 2) - 0.5) * 2 * wobble * Math.sin(Math.PI * t);
        pts.push([ax + (bx - ax) * t + nx * off, az + (bz - az) * t + nz * off]);
      }
      return pts;
    }

    roadDist(x, z) {
      const ids = this.segGrid.get(Math.floor(x / 100) + ',' + Math.floor(z / 100));
      if (!ids) return 999;
      let best = 999;
      for (let k = 0; k < ids.length; k++) {
        const s = this.segments[ids[k]];
        const vx = s.bx - s.ax, vz = s.bz - s.az;
        const l2 = vx * vx + vz * vz || 1;
        let t = ((x - s.ax) * vx + (z - s.az) * vz) / l2;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(x - (s.ax + vx * t), z - (s.az + vz * t));
        if (d < best) best = d;
      }
      return best;
    }

    insideZone(x, z, zoneIdx, margin) {
      const r = this.zoneAt(x, z);
      return r.i === zoneIdx && r.f > margin;
    }

    pickSite(zone, rng, rMin, rMax, margin, avoid, minAvoid, preferFarFromRoad, minTown = 380) {
      let best = null, bestScore = -1e9;
      for (let k = 0; k < 90; k++) {
        const a = rng() * Math.PI * 2;
        const r = rMin + rng() * (rMax - rMin);
        const x = zone.center[0] + Math.cos(a) * r, z = zone.center[1] + Math.sin(a) * r;
        if (Math.abs(x) > W.half - 120 || Math.abs(z) > W.half - 120) continue;
        if (!this.insideZone(x, z, zone.idx, margin)) continue;
        let minA = 1e9;
        for (const p of avoid) minA = Math.min(minA, Math.hypot(x - p[0], z - p[1]));
        if (minA < minAvoid) continue;
        if (Math.hypot(x, z) < minTown) continue;
        const rd = this.roadDist(x, z);
        const score = (preferFarFromRoad ? Math.min(rd, 300) : 0) + Math.min(minA, 600) * 0.5 + rng() * 40;
        if (score > bestScore) { bestScore = score; best = [x, z]; }
      }
      return best;
    }

    buildLayout() {
      const rng = mulberry32(this.seed);
      // 1) Main road: town → each zone's outpost in level order
      const nodes = [[0, 0]].concat(this.zones.map(z => z.center));
      for (let k = 0; k < nodes.length - 1; k++) {
        this.addRoad(this.curvedPath(nodes[k][0], nodes[k][1], nodes[k + 1][0], nodes[k + 1][1], 101 + k, 90));
      }
      this.zones.forEach((z) => {
        z.outpost = z.id === 'meadows' ? [0, 0] : [z.center[0], z.center[1]];
        z.waypoint = z.id === 'meadows' ? [6, 4] : [z.center[0] + 8, z.center[1] + 6];
      });
      // 2) Boss arenas / world boss lairs / explore sites (far from the road)
      this.zones.forEach((z) => {
        const zr = mulberry32(this.seed * 7 + z.idx * 131);
        const avoid = [z.outpost, [0, 0]];
        z.bossPos = this.pickSite(z, zr, 230, 470, 95, avoid, 230, true, z.id === 'meadows' ? 450 : 650) || [z.center[0] + 200, z.center[1]];
        avoid.push(z.bossPos);
        if (z.worldBoss) {
          z.worldBossPos = this.pickSite(z, zr, 180, 520, 95, avoid, 320, true, 800) || [z.center[0] - 220, z.center[1]];
          avoid.push(z.worldBossPos);
        }
        z.sites = [];
        for (let s = 0; s < 2; s++) {
          const site = this.pickSite(z, zr, 140, 420, 60, avoid, 170, false);
          if (site) { z.sites.push(site); avoid.push(site); }
        }
      });
      // 3) Branch roads to the arenas
      this.zones.forEach((z, k) => {
        this.addRoad(this.curvedPath(z.center[0], z.center[1], z.bossPos[0], z.bossPos[1], 300 + k, 45));
        if (z.worldBossPos) this.addRoad(this.curvedPath(z.center[0], z.center[1], z.worldBossPos[0], z.worldBossPos[1], 400 + k, 45));
      });
      // 4) Monster camps
      this.camps = [];
      this.campGrid = new Map();
      const spacing = 36;
      for (let gx = -W.half + 60; gx < W.half - 60; gx += spacing) {
        for (let gz = -W.half + 60; gz < W.half - 60; gz += spacing) {
          const x = gx + (rng() - 0.5) * 24, z = gz + (rng() - 0.5) * 24;
          if (rng() < 0.08) continue;
          if (Math.hypot(x, z) < 80) continue;
          const zr = this.zoneAt(x, z);
          if (zr.f < 30) continue;
          const zone = this.zones[zr.i];
          if (this.roadDist(x, z) < 12) continue;
          if (dist2(x, z, zone.outpost[0], zone.outpost[1]) < 60 * 60) continue;
          if (dist2(x, z, zone.bossPos[0], zone.bossPos[1]) < 95 * 95) continue;
          if (zone.worldBossPos && dist2(x, z, zone.worldBossPos[0], zone.worldBossPos[1]) < 110 * 110) continue;
          if (zone.sites.some(s => dist2(x, z, s[0], s[1]) < 30 * 30)) continue;
          this.camps.push({ x, z, zone: zone.idx });
        }
      }
      // Level each camp by distance from the zone's entrance (outpost) toward the far edge
      this.zones.forEach((zone) => {
        const own = this.camps.filter(c => c.zone === zone.idx);
        const ex = zone.id === 'meadows' ? 0 : zone.outpost[0];
        const ez = zone.id === 'meadows' ? 0 : zone.outpost[1];
        let maxD = 1;
        own.forEach(c => { c._d = Math.hypot(c.x - ex, c.z - ez); maxD = Math.max(maxD, c._d); });
        own.forEach((c) => {
          const t = Math.min(1, c._d / (maxD * 0.92));
          const span = zone.lv[1] - zone.lv[0];
          c.level = Math.max(zone.lv[0], Math.min(zone.lv[1], zone.lv[0] + Math.round(t * span + (rng() - 0.5) * 1.2)));
          const cands = zone.mobs.filter(m => c.level >= m.lv[0] && c.level <= m.lv[1]);
          const pick = (cands.length ? cands : zone.mobs)[Math.floor(rng() * (cands.length || zone.mobs.length))];
          c.mob = pick;
          c.count = 3 + Math.floor(rng() * 3);
        });
        // Named elites: take the farthest-from-road camp near their level
        zone.elites.forEach((el, ei) => {
          let best = null, bestS = -1;
          own.forEach((c) => {
            if (c.elite) return;
            const s = 100 - Math.abs(c.level - el.lv) * 30 + Math.min(this.roadDist(c.x, c.z), 120) + rng() * 20;
            if (s > bestS) { bestS = s; best = c; }
          });
          if (best) { best.elite = el; best.level = el.lv; best.count = 3; }
        });
      });
      // Boss "camps"
      this.zones.forEach((zone) => {
        this.camps.push({ x: zone.bossPos[0], z: zone.bossPos[1], zone: zone.idx, boss: zone.boss, level: zone.boss.lv, count: 1, kind: 'boss' });
        if (zone.worldBoss) {
          this.camps.push({ x: zone.worldBossPos[0], z: zone.worldBossPos[1], zone: zone.idx, boss: zone.worldBoss, level: zone.worldBoss.lv, count: 1, kind: 'worldboss' });
        }
      });
      this.camps.forEach((c, i) => {
        c.id = i;
        const key = Math.floor(c.x / 128) + ',' + Math.floor(c.z / 128);
        if (!this.campGrid.has(key)) this.campGrid.set(key, []);
        this.campGrid.get(key).push(c);
      });
    }

    campsNear(x, z, r) {
      const out = [];
      const r2 = r * r;
      for (let cx = Math.floor((x - r) / 128); cx <= Math.floor((x + r) / 128); cx++) {
        for (let cz = Math.floor((z - r) / 128); cz <= Math.floor((z + r) / 128); cz++) {
          const list = this.campGrid.get(cx + ',' + cz);
          if (!list) continue;
          for (let k = 0; k < list.length; k++) {
            const c = list[k];
            if (dist2(c.x, c.z, x, z) <= r2) out.push(c);
          }
        }
      }
      return out;
    }

    // Is (x,z) inside an impassable ridge (zone border away from a road pass) or off the map?
    blockedAt(x, z) {
      if (Math.abs(x) > W.half - 18 || Math.abs(z) > W.half - 18) return true;
      if (Math.hypot(x, z) < 300) return false;
      const zr = this.zoneAt(x, z);
      if (zr.f > W.borderBand * 0.5) return false;
      return this.roadDist(x, z) > W.gateWidth;
    }

    // ---- prop scatter per chunk (deterministic) ----
    chunk(cx, cz) {
      const key = cx + ',' + cz;
      let ch = this.chunkCache.get(key);
      if (ch) return ch;
      ch = { props: [], obstacles: [] };
      const size = W.chunk;
      const rng = mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ this.seed) >>> 0);
      const x0 = cx * size, z0 = cz * size;
      const czr = this.zoneAt(x0 + size / 2, z0 + size / 2, {});
      const zone = this.zones[czr.i];
      const props = zone.props;
      const keys = Object.keys(props);
      let total = 0;
      keys.forEach(k => { total += props[k]; });
      const attempts = Math.round(8 + total * 5);
      const zr = {};
      for (let a = 0; a < attempts + 10; a++) {
        const x = x0 + rng() * size, z = z0 + rng() * size;
        if (Math.abs(x) > W.half + 40 || Math.abs(z) > W.half + 40) continue;
        const tr = Math.hypot(x, z);
        if (tr < 78) continue;
        this.zoneAt(x, z, zr);
        const rd = this.roadDist(x, z);
        const edge = W.half - Math.max(Math.abs(x), Math.abs(z));
        if ((zr.f < W.borderBand * 0.62 && tr > 300 && rd > W.gateWidth + 4) || edge < 30) {
          const s = 7 + rng() * 9;
          ch.props.push({ t: 'ridge', x, z, r: rng() * 6.28, s, c: rng(), zone: zr.i });
          ch.obstacles.push({ x, z, r: s * 0.55 });
          continue;
        }
        if (a >= attempts) continue;
        if (rd < 9) continue;
        const pz = this.zones[zr.i];
        if (dist2(x, z, pz.outpost[0], pz.outpost[1]) < 42 * 42) continue;
        if (dist2(x, z, pz.bossPos[0], pz.bossPos[1]) < 52 * 52) continue;
        if (pz.worldBossPos && dist2(x, z, pz.worldBossPos[0], pz.worldBossPos[1]) < 64 * 64) continue;
        if (pz.sites.some(s => dist2(x, z, s[0], s[1]) < 16 * 16)) continue;
        // choose prop type from that point's zone weights
        const pp = pz.props;
        const pk = Object.keys(pp);
        let tw = 0; pk.forEach(k => { tw += pp[k]; });
        let roll = rng() * tw, t = pk[0];
        for (let q = 0; q < pk.length; q++) { roll -= pp[pk[q]]; if (roll <= 0) { t = pk[q]; break; } }
        const near = this.campsNear(x, z, 9);
        if (near.length && t !== 'flower') continue;
        const s = PROP_SCALE[t] ? PROP_SCALE[t][0] + rng() * (PROP_SCALE[t][1] - PROP_SCALE[t][0]) : 1;
        ch.props.push({ t, x, z, r: rng() * 6.28, s, c: rng(), zone: zr.i });
        const or = PROP_COLLIDE[t];
        if (or) ch.obstacles.push({ x, z, r: or * s });
      }
      // Decorative ruins at explore sites
      this.zones.forEach((pz) => {
        pz.sites.forEach((s, si) => {
          if (Math.floor(s[0] / size) !== cx || Math.floor(s[1] / size) !== cz) return;
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2;
            const px = s[0] + Math.cos(a) * 9, pzz = s[1] + Math.sin(a) * 9;
            ch.props.push({ t: 'pillar', x: px, z: pzz, r: a, s: 0.9 + (k % 3) * 0.25, c: 0.3, zone: pz.idx });
            ch.obstacles.push({ x: px, z: pzz, r: 0.75 });
          }
        });
      });
      this.chunkCache.set(key, ch);
      return ch;
    }
  }

  const PROP_SCALE = {
    pine: [0.9, 1.5], snowpine: [0.9, 1.6], oak: [0.85, 1.4], deadtree: [0.8, 1.3], rock: [0.7, 1.6],
    boulder: [1.2, 2.2], flower: [0.8, 1.3], mushroom: [0.8, 1.8], cactus: [0.8, 1.4], grave: [0.8, 1.2],
    pillar: [0.8, 1.4], crystal: [0.8, 1.8], icespike: [0.8, 1.9], lavarock: [0.8, 1.7], bones: [0.9, 1.5],
    mesa: [0.9, 1.6], pylon: [0.9, 1.3]
  };
  const PROP_COLLIDE = {
    pine: 0.45, snowpine: 0.45, oak: 0.5, deadtree: 0.35, rock: 0.75, boulder: 1.5, mushroom: 0.4,
    cactus: 0.45, grave: 0.35, pillar: 0.7, crystal: 0.55, icespike: 0.6, lavarock: 0.85, mesa: 7.5, pylon: 0.75
  };


  // ---------------------------------------------------------------------------
  // Seeded 2D simplex noise (Gustavson). The permutation table is shuffled by a
  // seeded PRNG, so the same seed gives the same terrain everywhere.
  // ---------------------------------------------------------------------------
  const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  function buildPerm(seed) {
    const rng = mulberry32(seed >>> 0);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    return perm;
  }
  function simplex2(perm, xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = GRAD[perm[ii + perm[jj]] & 7]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = GRAD[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = GRAD[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * (n0 + n1 + n2); // ~[-1, 1]
  }

  // ---------------------------------------------------------------------------
  // TERRAIN. Rolling hills + two-tier plateaus with cliff edges + carved valleys,
  // flattened around the town spawn, roads, outposts and arenas (so navigation and
  // boss fights stay on level ground), with mountain ranges along zone borders.
  // ---------------------------------------------------------------------------
  WorldGen.prototype.initTerrain = function () {
    this.perm = buildPerm(this.seed * 7919 + 17);
  };

  WorldGen.prototype.terrainBase = function (x, z) {
    const P = this.perm || (this.initTerrain(), this.perm);
    // rolling hills (3 octaves)
    let hills = 0, amp = 1, f = 1 / 360, norm = 0;
    for (let o = 0; o < 3; o++) { hills += amp * simplex2(P, x * f + o * 31.7, z * f - o * 17.3); norm += amp; amp *= 0.5; f *= 2.1; }
    hills = (hills / norm) * 9;
    const swell = simplex2(P, x / 1150 + 5.1, z / 1150 - 2.7) * 5;
    // plateaus: terraced steps with steep (rocky) edges
    const p = simplex2(P, x / 640 + 13.1, z / 640 - 7.7);
    const plateau = smooth(0.36, 0.385, p) * 7 + smooth(0.6, 0.62, p) * 5;
    // valleys: ridged noise carves long winding lowlands
    const v = 1 - Math.abs(simplex2(P, x / 520 - 3.3, z / 520 + 9.2));
    const valley = smooth(0.84, 0.98, v) * 7.5;
    return hills + swell + plateau - valley;
  };

  // zr = zoneAt(x,z) result, rd = roadDist(x,z). Split out so bulk baking can reuse them.
  WorldGen.prototype.heightFromParts = function (x, z, zr, rd) {
    const base = this.terrainBase(x, z);
    const d0 = Math.hypot(x, z);
    const near = (pt, a, b) => (pt ? 1 - smooth(a, b, Math.hypot(x - pt[0], z - pt[1])) : 0);
    const roadFlat = 1 - smooth(8, 40, rd);
    let flat = Math.max(1 - smooth(85, 170, d0), roadFlat);
    const zone = this.zones[zr.i];
    flat = Math.max(flat, near(zone.outpost, 55, 110), near(zone.bossPos, 42, 90), near(zone.worldBossPos, 50, 100), near(zone.waypoint, 20, 40));
    for (let k = 0; k < zone.sites.length; k++) flat = Math.max(flat, near(zone.sites[k], 16, 38));
    // mountain ranges on impassable zone borders and the world rim (never across a road pass)
    const edge = W.half - Math.max(Math.abs(x), Math.abs(z));
    let mtn = d0 > 300 ? 1 - smooth(W.borderBand * 0.15, W.borderBand * 1.9, zr.f) : 0;
    mtn = Math.max(mtn, 1 - smooth(15, 110, edge)) * (1 - roadFlat);
    const peaks = 22 + 10 * simplex2(this.perm, x / 90, z / 90);
    return (base + mtn * peaks) * (1 - flat);
  };

  WorldGen.prototype.terrainHeight = function (x, z) {
    const zr = this.zoneAt(x, z, {});
    return this.heightFromParts(x, z, zr, this.roadDist(x, z));
  };

  // Shared, lazily built world for code that only needs heights (e.g. a server)
  let shared = null;
  function sharedWorld() { return shared || (shared = new WorldGen()); }
  function getTerrainHeight(x, z) { return sharedWorld().terrainHeight(x, z); }

  return { mulberry32, hash2, vnoise, fbm, smooth, dist2, WorldGen, PROP_SCALE, PROP_COLLIDE, buildPerm, simplex2, getTerrainHeight, sharedWorld };
});
