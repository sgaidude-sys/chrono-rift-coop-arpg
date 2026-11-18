/* =============================================================================
 * Chrono-Rift — chiseled stylized rocks & cliffs (zero assets)
 *
 * Geometry (built once per variant, then shared by the existing InstancedMesh):
 *   icosphere (detail 3/4) -> ridged multifractal displacement (1 - |noise|)
 *   -> planar flattening cuts (sharp faceted planes) -> gentle strata terraces
 *   -> flat seated base -> crease-angle normals (faces folded more than ~32°
 *   keep hard edges, gentle curvature stays smooth) + a per-vertex "convex edge"
 *   attribute for edge wear. Each variant is rescaled to the old prop's
 *   footprint so the existing collision circles still match.
 * Shader (MeshToonMaterial + onBeforeCompile, soft 3-tone ramp):
 *   triplanar procedural grain + strata bands, moss on up-facing normals
 *   (normal.y > ~0.7, less in sandy/red zones), crisp lighter edge wear along
 *   convex ridges, darker contact at the base. Terrain lift + occluder cutout
 *   keep working (hooks are chained).
 * ============================================================================= */
(function () {
  'use strict';
  const CW = window.ChronoWorld;

  // ---- seeded 3D gradient noise ---------------------------------------------
  function makeNoise3(seed) {
    const rng = CW.mulberry32(seed >>> 0);
    const p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const G = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const grad = (h, x, y, z) => { const g = G[h % 12]; return g[0] * x + g[1] * y + g[2] * z; };
    return function (x, y, z) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
      x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
      const u = fade(x), v = fade(y), w = fade(z);
      const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
      const l = (a, b, t) => a + (b - a) * t;
      return l(l(l(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u), l(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
               l(l(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u), l(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
    };
  }
  // Ridged multifractal (Musgrave): sharp creases where noise crosses zero
  function ridged(n3, x, y, z, oct) {
    let sum = 0, amp = 0.5, freq = 1, weight = 1;
    for (let o = 0; o < oct; o++) {
      let s = 1 - Math.abs(n3(x * freq, y * freq, z * freq));
      s *= s;
      s *= weight;
      weight = Math.min(1, Math.max(0, s * 2));
      sum += s * amp;
      freq *= 2.1; amp *= 0.5;
    }
    return sum;
  }

  // ---- geometry ----------------------------------------------------------------
  function buildChiseledRock(seed, o) {
    const rng = CW.mulberry32(seed >>> 0);
    const n3 = makeNoise3(seed * 7 + 3);
    const base = new THREE.IcosahedronGeometry(1, o.detail);      // non-indexed in r128
    const pos = base.attributes.position;
    const cnt = pos.count;
    // cutting planes -> flat chiseled faces
    const planes = [];
    for (let k = 0; k < o.cuts; k++) {
      const th = rng() * Math.PI * 2, ph = Math.acos(rng() * 1.6 - 0.6);  // biased to sides/top
      planes.push({ n: new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)), d: 0.6 + rng() * 0.22 });
    }
    const v = new THREE.Vector3();
    const out = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const r = ridged(n3, v.x * o.freq + 11.3, v.y * o.freq * 1.4 + 2.1, v.z * o.freq - 5.7, 4);
      v.multiplyScalar(0.78 + r * o.amp);
      for (let k = 0; k < planes.length; k++) {
        const P = planes[k];
        const dd = v.dot(P.n) - P.d;
        if (dd > 0) v.addScaledVector(P.n, -dd * 0.92);           // carve the facet (tiny bevel left)
      }
      // gentle strata terraces
      const st = Math.round(v.y * o.strata) / o.strata;
      v.y += (st - v.y) * 0.32;
      v.x *= o.sx; v.y *= o.sy; v.z *= o.sz;
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    }
    // seat it: flat base slightly below ground
    let minY = Infinity;
    for (let i = 0; i < cnt; i++) minY = Math.min(minY, out[i * 3 + 1]);
    const cut = minY + (o.sy * 0.28);
    for (let i = 0; i < cnt; i++) {
      if (out[i * 3 + 1] < cut) out[i * 3 + 1] = cut + (out[i * 3 + 1] - cut) * 0.15;
      out[i * 3 + 1] -= cut + o.sink;
    }
    // rescale to the old prop footprint (keeps collision radii valid)
    let rMax = 0;
    for (let i = 0; i < cnt; i++) rMax = Math.max(rMax, Math.hypot(out[i * 3], out[i * 3 + 2]));
    const k = o.footprint / rMax;
    for (let i = 0; i < cnt * 3; i++) out[i] *= k;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    creaseNormals(g, o.crease);
    const col = new Float32Array(cnt * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    base.dispose();
    return g;
  }

  // Crease-angle normals for a non-indexed triangle soup + convex-edge attribute
  function creaseNormals(g, creaseDeg) {
    const P = g.attributes.position.array;
    const tris = P.length / 9;
    const fn = new Float32Array(tris * 3), fc = new Float32Array(tris * 3), fa = new Float32Array(tris);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let t = 0; t < tris; t++) {
      a.fromArray(P, t * 9); b.fromArray(P, t * 9 + 3); c.fromArray(P, t * 9 + 6);
      e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
      const area = e1.length() || 1e-6;
      fa[t] = area;
      e1.divideScalar(area);
      fn[t * 3] = e1.x; fn[t * 3 + 1] = e1.y; fn[t * 3 + 2] = e1.z;
      fc[t * 3] = (a.x + b.x + c.x) / 3; fc[t * 3 + 1] = (a.y + b.y + c.y) / 3; fc[t * 3 + 2] = (a.z + b.z + c.z) / 3;
    }
    const key = (i) => Math.round(P[i * 3] * 1e4) + ',' + Math.round(P[i * 3 + 1] * 1e4) + ',' + Math.round(P[i * 3 + 2] * 1e4);
    const groups = new Map();
    for (let i = 0; i < tris * 3; i++) {
      const k = key(i);
      let L = groups.get(k);
      if (!L) groups.set(k, L = []);
      L.push(i);
    }
    const cosT = Math.cos(creaseDeg * Math.PI / 180);
    const N = new Float32Array(P.length), E = new Float32Array(tris * 3);
    for (const L of groups.values()) {
      for (let q = 0; q < L.length; q++) {
        const vi = L[q], t = (vi / 3) | 0;
        let nx = 0, ny = 0, nz = 0, edge = 0;
        for (let r = 0; r < L.length; r++) {
          const u = (L[r] / 3) | 0;
          const d = fn[t * 3] * fn[u * 3] + fn[t * 3 + 1] * fn[u * 3 + 1] + fn[t * 3 + 2] * fn[u * 3 + 2];
          if (d >= cosT) { nx += fn[u * 3] * fa[u]; ny += fn[u * 3 + 1] * fa[u]; nz += fn[u * 3 + 2] * fa[u]; }
          // convex fold? (the neighbour's centroid lies behind this face's plane)
          const cx = fc[u * 3] - fc[t * 3], cy = fc[u * 3 + 1] - fc[t * 3 + 1], cz = fc[u * 3 + 2] - fc[t * 3 + 2];
          if (cx * fn[t * 3] + cy * fn[t * 3 + 1] + cz * fn[t * 3 + 2] < -1e-5) edge = Math.max(edge, 1 - d);
        }
        const l = Math.hypot(nx, ny, nz) || 1;
        N[vi * 3] = nx / l; N[vi * 3 + 1] = ny / l; N[vi * 3 + 2] = nz / l;
        E[vi] = Math.min(1, edge * 2.2);
      }
    }
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('aEdge', new THREE.BufferAttribute(E, 1));
  }

  // ---- material ----------------------------------------------------------------
  function softRamp() {
    const n = 32, data = new Uint8Array(n * 4);
    const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      const v = Math.round(78 + 50 * ss(0.32, 0.44, x) + 44 * ss(0.6, 0.72, x));
      data.set([v, v, v, 255], i * 4);
    }
    const t = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }

  const ROCK_VERT_PARS = `
    attribute float aEdge;
    varying float vEdge;
    varying vec3 vRockW;
    varying vec3 vRockN;
    varying float vRockLocalY;
  `;
  const ROCK_FRAG_PARS = `
    varying float vEdge;
    varying vec3 vRockW;
    varying vec3 vRockN;
    varying float vRockLocalY;
    float rH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float rN(vec3 x) {
      vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(rH(i), rH(i + vec3(1,0,0)), f.x), mix(rH(i + vec3(0,1,0)), rH(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(rH(i + vec3(0,0,1)), rH(i + vec3(1,0,1)), f.x), mix(rH(i + vec3(0,1,1)), rH(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float rN2(vec2 p) { return rN(vec3(p, 0.5)); }
  `;
  const ROCK_COLOR = `
    {
      vec3 Nw = normalize(vRockN);
      vec3 w3 = pow(abs(Nw), vec3(4.0)); w3 /= (w3.x + w3.y + w3.z + 1e-4);
      vec3 p = vRockW;
      // triplanar grain (two scales) projected along the dominant axes
      float gx = rN2(p.yz * 2.3) * 0.6 + rN2(p.yz * 7.1) * 0.4;
      float gy = rN2(p.xz * 2.3) * 0.6 + rN2(p.xz * 7.1) * 0.4;
      float gz = rN2(p.xy * 2.3) * 0.6 + rN2(p.xy * 7.1) * 0.4;
      float grain = gx * w3.x + gy * w3.y + gz * w3.z;
      // albedo calibrated like the ground/foliage (HDR sun + ACES): keeps detail out of the glare
      vec3 rock = diffuseColor.rgb * 0.58 * (0.7 + 0.55 * grain);
      // sediment strata bands on the sides
      rock *= 0.9 + 0.14 * sin(p.y * 7.5 + rN(p * 0.7) * 3.0) * (1.0 - w3.y);
      // moss / grass caps on up-facing planes (less in sandy, red or snowy tints)
      float greenish = smoothstep(-0.06, 0.06, diffuseColor.g - diffuseColor.r) * (1.0 - smoothstep(0.82, 0.95, min(diffuseColor.r, diffuseColor.b)));
      float moss = smoothstep(0.66, 0.86, Nw.y) * smoothstep(0.38, 0.62, rN(p * 1.3) * 0.7 + grain * 0.5) * mix(0.25, 1.0, greenish);
      vec3 mossC = mix(vec3(0.16, 0.30, 0.11), vec3(0.27, 0.42, 0.14), rN(p * 3.1));
      rock = mix(rock, mossC, moss * 0.9);
      // crisp lighter edge wear along convex ridges
      float wear = smoothstep(0.28, 0.55, vEdge) * (1.0 - moss);
      rock = mix(rock, rock * 1.32 + vec3(0.04, 0.036, 0.028), wear * 0.8);
      // contact darkening near the ground
      rock *= 0.72 + 0.28 * smoothstep(-0.05, 0.55, vRockLocalY);
      diffuseColor.rgb = rock;
    }
  `;

  function makeRockMaterial() {
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: softRamp() });
    mat.onBeforeCompile = function (shader) {
      if (window.injectTerrain) window.injectTerrain(shader, mat);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + ROCK_VERT_PARS)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vEdge = aEdge;
          vRockLocalY = position.y;
          #ifdef USE_INSTANCING
            vRockW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
            vRockN = normalize((modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz);
          #else
            vRockW = (modelMatrix * vec4(position, 1.0)).xyz;
            vRockN = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          #endif`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + ROCK_FRAG_PARS)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + ROCK_COLOR);
    };
    return mat;
  }

  // ---- variants (footprints match the old props -> collision unchanged) -------
  const VARIANTS = {
    rock:     { detail: 3, cuts: 6, freq: 1.5, amp: 0.32, strata: 5, sx: 1.0, sy: 0.7, sz: 0.88, sink: 0.08, footprint: 0.9, crease: 34, seed: 101 },
    boulder:  { detail: 4, cuts: 8, freq: 1.3, amp: 0.36, strata: 6, sx: 1.15, sy: 0.85, sz: 1.0, sink: 0.12, footprint: 1.75, crease: 32, seed: 202 },
    lavarock: { detail: 3, cuts: 7, freq: 1.8, amp: 0.4, strata: 4, sx: 1.0, sy: 0.75, sz: 0.95, sink: 0.08, footprint: 1.0, crease: 30, seed: 303 },
    ridge:    { detail: 4, cuts: 9, freq: 1.2, amp: 0.42, strata: 8, sx: 1.0, sy: 1.0, sz: 0.85, sink: 0.25, footprint: 1.0, crease: 30, seed: 404 }
  };

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { initMMOWorld: GP.initMMOWorld };
  GP.initMMOWorld = function () {
    orig.initMMOWorld.call(this);
    try { this.upgradeRocks(); } catch (e) { console.warn('[Rocks] upgrade failed', e); }
  };

  GP.upgradeRocks = function () {
    if (!this.propInst) return;
    const mat = makeRockMaterial();
    this.rockMaterial = mat;
    Object.keys(VARIANTS).forEach((t) => {
      const inst = this.propInst[t];
      if (!inst) return;
      const o = VARIANTS[t];
      const old = inst.geometry;
      const geo = buildChiseledRock(o.seed, o);
      inst.geometry = geo;
      // lava rocks keep their glowing emissive material; the rest share the chiseled one
      if (t === 'lavarock') {
        const lm = makeRockMaterial();
        lm.emissive.setHex(0xff4a10); lm.emissiveIntensity = 0.45;
        const om = inst.material; inst.material = lm; if (om && om.dispose) om.dispose();
      } else {
        const om = inst.material; inst.material = mat; if (om && om !== mat && om.dispose) om.dispose();
      }
      old.dispose();
    });
  };
})();
