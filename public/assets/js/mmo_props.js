/* =============================================================================
 * Chrono-Rift — stylized prop set (same pipeline as the new rocks / broadleaf)
 *
 *  Conifers  (pine, snowpine): tapered spline trunk + 5 drooping tiers of
 *            alpha-cut needle-spray cards around small cores; snow on the
 *            up-facing needles for snow pines; leaf-shaped shadows.
 *  Deadtree: gnarled spline trunk with forking spline branches (grey bark).
 *  Mushroom: curved bulbous stem, lathe-turned domed cap with a curled rim,
 *            procedural spots (softly glowing at night) and radial gills,
 *            plus two baby mushrooms.
 *  Cactus:   ribbed saguaro column + two curved arms, domed tips, spines.
 *  Crystal / icespike: clusters of hard-faceted hexagonal prisms with
 *            pointed tips; inner glow rising toward the tips (blooms).
 *  Pillar:   fluted, broken ruin column on a chipped plinth (chiseled rock
 *            shader: grain, moss caps, edge wear).
 *  Grave:    bevelled arched headstone + chiseled burial mound (rock shader).
 *  Bones:    curved ribcage + spine (ivory).   Pylon: tapered rune obelisk
 *            with glowing rune bands + floating crystal.
 *
 *  Every type keeps its existing InstancedMesh (1 draw call each, chunk-culled)
 *  and its footprint matches the old collision radius.
 * ============================================================================= */
(function () {
  'use strict';
  const CW = window.ChronoWorld;

  // ---------------------------------------------------------------------------
  // geometry helpers
  // ---------------------------------------------------------------------------
  function foliageOut() {
    const P = [], N = [], C = [], F = [], H = [], UV = [];
    return {
      P, N, C, F, H, UV,
      push(p, n, c, f, h, u, w) { P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); C.push(c[0], c[1], c[2]); F.push(f); H.push(h); UV.push(u, w); },
      build() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        g.setAttribute('aFoliage', new THREE.Float32BufferAttribute(F, 1));
        g.setAttribute('aCanopyH', new THREE.Float32BufferAttribute(H, 1));
        g.setAttribute('aLeafUv', new THREE.Float32BufferAttribute(UV, 2));
        g.computeBoundingSphere();
        return g;
      }
    };
  }

  // Non-indexed tube with radius function + recomputed normals (so ribs / flutes shade)
  function tubeGeo(curve, tub, rad, rFn) {
    const tube = new THREE.TubeGeometry(curve, tub, 1, rad, false);
    const tp = tube.attributes.position;
    const c = new THREE.Vector3(), v = new THREE.Vector3();
    const tA = new Float32Array(tp.count);
    for (let k = 0; k < tp.count; k++) {
      const i = Math.floor(k / (rad + 1)), j = k % (rad + 1);
      const t = i / tub, ang = (j / rad) * Math.PI * 2;
      curve.getPointAt(t, c);
      v.fromBufferAttribute(tp, k).sub(c).multiplyScalar(rFn(t, ang)).add(c);
      tp.setXYZ(k, v.x, v.y, v.z);
      tA[k] = t;
    }
    tube.setAttribute('aT', new THREE.BufferAttribute(tA, 1));
    tube.computeVertexNormals();
    const g = tube.toNonIndexed();
    tube.dispose();
    return g;
  }

  // Generic part-tagged geometry builder (position, normal, color, aPart, aH01, aGlow)
  function partOut() {
    const P = [], N = [], C = [], PT = [], H = [], GL = [];
    return {
      add(g, part, col, hFn, glow) {
        const p = g.attributes.position, n = g.attributes.normal;
        const t = g.attributes.aT;
        let yMin = Infinity, yMax = -Infinity;
        for (let i = 0; i < p.count; i++) { yMin = Math.min(yMin, p.getY(i)); yMax = Math.max(yMax, p.getY(i)); }
        for (let i = 0; i < p.count; i++) {
          P.push(p.getX(i), p.getY(i), p.getZ(i));
          N.push(n.getX(i), n.getY(i), n.getZ(i));
          C.push(col[0], col[1], col[2]);
          PT.push(part);
          H.push(hFn ? hFn(p.getY(i), yMin, yMax, t ? t.getX(i) : 0) : (p.getY(i) - yMin) / Math.max(0.01, yMax - yMin));
          GL.push(glow || 0);
        }
        g.dispose();
      },
      build() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        g.setAttribute('aPart', new THREE.Float32BufferAttribute(PT, 1));
        g.setAttribute('aH01', new THREE.Float32BufferAttribute(H, 1));
        g.setAttribute('aGlow', new THREE.Float32BufferAttribute(GL, 1));
        g.computeBoundingSphere();
        return g;
      }
    };
  }

  function nonIndexed(g) { if (!g.index) return g; const n = g.toNonIndexed(); g.dispose(); return n; }

  function mergeRockParts(geos) {
    // all non-indexed with position / normal / color / aEdge
    let total = 0;
    geos.forEach(g => { total += g.attributes.position.count; });
    const out = new THREE.BufferGeometry();
    const names = ['position', 'normal', 'color', 'aEdge'];
    const sizes = [3, 3, 3, 1];
    names.forEach((nm, k) => {
      const arr = new Float32Array(total * sizes[k]);
      let o = 0;
      geos.forEach((g) => { arr.set(g.attributes[nm].array, o); o += g.attributes[nm].array.length; });
      out.setAttribute(nm, new THREE.BufferAttribute(arr, sizes[k]));
    });
    geos.forEach(g => g.dispose());
    out.computeBoundingSphere();
    return out;
  }

  function withColor(g, rgb) {
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  }

  // ---------------------------------------------------------------------------
  // conifers
  // ---------------------------------------------------------------------------
  function buildConifer(seed) {
    const F = window.CR_FLORA;
    const rng = CW.mulberry32(seed >>> 0);
    const out = foliageOut();
    const H = 4.7 + rng() * 0.6;
    const lean = (rng() - 0.5) * 0.25;
    const trunk = new THREE.CatmullRomCurve3([0, 0.33, 0.66, 1].map(t => new THREE.Vector3(lean * t * t, t * H, Math.sin(t * 2.2 + seed) * 0.05)));
    F.addTube(out, trunk, 8, 7, (t, a) => {
      let r = 0.26 * (1 - 0.82 * t);
      if (t < 0.12) r *= 1 + 0.7 * Math.pow(1 - t / 0.12, 2) * (0.7 + 0.3 * Math.cos(a * 4 + seed));
      return r * (1 + 0.05 * Math.sin(a * 7 + t * 4));
    }, () => [1, 1, 1]);
    const canopyStart = out.H.length;
    const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
    const TIERS = 5;
    for (let k = 0; k < TIERS; k++) {
      const f = k / TIERS;
      const yk = 1.15 + f * (H - 1.5);
      const Rk = 1.6 * (1 - f * 0.78);
      const axis = trunk.getPointAt(Math.min(1, yk / H));
      for (let layer = 0; layer < 2; layer++) {
        const M = 9 - k + layer;
        const rr = Rk * (layer ? 0.78 : 1.0);
        const yy = yk + layer * 0.32;
        for (let j = 0; j < M; j++) {
          const a = (j + layer * 0.5) / M * Math.PI * 2 + k * 0.45 + (rng() - 0.5) * 0.3;
          const ca = Math.cos(a), sa = Math.sin(a);
          const inner = new THREE.Vector3(axis.x + ca * 0.12, yy + 0.28, axis.z + sa * 0.12);
          const outer = new THREE.Vector3(axis.x + ca * rr, yy - rr * 0.38, axis.z + sa * rr);
          const T = new THREE.Vector3(-sa, 0.18, ca).normalize().multiplyScalar(rr * 0.5);
          const quad = [[inner.clone().sub(T), 0, 0], [inner.clone().add(T), 0, 1], [outer.clone().add(T.clone().multiplyScalar(0.55)), 1, 1],
                        [inner.clone().sub(T), 0, 0], [outer.clone().add(T.clone().multiplyScalar(0.55)), 1, 1], [outer.clone().sub(T.clone().multiplyScalar(0.55)), 1, 0]];
          const v = 0.9 + rng() * 0.14;
          quad.forEach(([p, u, w]) => {
            const n = tmp.set(p.x - axis.x, 0, p.z - axis.z).normalize().multiplyScalar(0.7).add(up.clone().multiplyScalar(0.75)).normalize().clone();
            out.push(p, n, [v, v, v], 1, p.y, 2 + u, w);
          });
        }
      }
      // inner core cone keeps the tier solid from below
      const core = new THREE.ConeGeometry(Rk * 0.5, Rk * 0.85, 6, 1, true);
      const cp = core.attributes.position, idx = core.index ? core.index.array : null;
      const pushV = (i) => {
        const p = new THREE.Vector3().fromBufferAttribute(cp, i).add(new THREE.Vector3(axis.x, yk + Rk * 0.15, axis.z));
        const n = tmp.set(p.x - axis.x, 0.6, p.z - axis.z).normalize().clone();
        out.push(p, n, [0.85, 0.85, 0.85], 1, p.y, -1, -1);
      };
      if (idx) for (let q = 0; q < idx.length; q++) pushV(idx[q]); else for (let i = 0; i < cp.count; i++) pushV(i);
      core.dispose();
    }
    // crown tip
    const tipBase = trunk.getPointAt(1);
    const tip = new THREE.ConeGeometry(0.32, 0.9, 6, 1, true);
    const tp = tip.attributes.position, ti = tip.index.array;
    for (let q = 0; q < ti.length; q++) {
      const p = new THREE.Vector3().fromBufferAttribute(tp, ti[q]).add(new THREE.Vector3(tipBase.x, tipBase.y + 0.25, tipBase.z));
      out.push(p, tmp.set(p.x - tipBase.x, 0.7, p.z - tipBase.z).normalize().clone(), [0.92, 0.92, 0.92], 1, p.y, -1, -1);
    }
    tip.dispose();
    let hMin = Infinity, hMax = -Infinity;
    for (let i = canopyStart; i < out.H.length; i++) { hMin = Math.min(hMin, out.H[i]); hMax = Math.max(hMax, out.H[i]); }
    for (let i = canopyStart; i < out.H.length; i++) out.H[i] = (out.H[i] - hMin) / Math.max(0.01, hMax - hMin);
    return out.build();
  }

  function buildDeadTree(seed) {
    const F = window.CR_FLORA;
    const rng = CW.mulberry32(seed >>> 0);
    const out = foliageOut();
    const H = 3.3;
    const pts = [0, 0.3, 0.6, 1].map((t, i) => new THREE.Vector3(Math.sin(i * 1.7 + seed) * 0.18 * t, t * H, Math.cos(i * 1.3 + seed) * 0.18 * t));
    const trunk = new THREE.CatmullRomCurve3(pts);
    const ph = rng() * 6;
    F.addTube(out, trunk, 10, 7, (t, a) => {
      let r = 0.27 * (1 - 0.78 * t);
      if (t < 0.15) r *= 1 + 0.8 * Math.pow(1 - t / 0.15, 2) * (0.6 + 0.4 * Math.cos(a * 4 + ph));
      return r * (1 + 0.09 * Math.sin(a * 6 + t * 9 + ph));         // twisted, cracked bark
    }, () => [1, 1, 1]);
    const NB = 4;
    for (let b = 0; b < NB; b++) {
      const tb = 0.42 + b * 0.14 + rng() * 0.05;
      const S = trunk.getPointAt(tb);
      const a = b * 2.1 + rng();
      const d = new THREE.Vector3(Math.cos(a), 0.5 + rng() * 0.5, Math.sin(a)).normalize();
      const L = 0.9 + rng() * 0.6;
      const M = S.clone().addScaledVector(d, L * 0.5).add(new THREE.Vector3((rng() - 0.5) * 0.3, 0.1, (rng() - 0.5) * 0.3));
      const E = S.clone().addScaledVector(d, L);
      const br = new THREE.CatmullRomCurve3([S, M, E]);
      F.addTube(out, br, 5, 5, t => 0.1 * (1 - 0.8 * t), () => [1, 1, 1]);
      // fork
      const S2 = br.getPointAt(0.55);
      const d2 = d.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (rng() < 0.5 ? 1 : -1) * 0.9).setY(d.y + 0.3).normalize();
      const E2 = S2.clone().addScaledVector(d2, L * 0.55);
      F.addTube(out, new THREE.CatmullRomCurve3([S2, S2.clone().lerp(E2, 0.5).add(new THREE.Vector3(0, 0.08, 0)), E2]), 4, 4, t => 0.055 * (1 - 0.8 * t), () => [1, 1, 1]);
    }
    return out.build();
  }

  // ---------------------------------------------------------------------------
  // mushroom, cactus, crystals, bones, pylon (generic part-shaded toon material)
  // ---------------------------------------------------------------------------
  const PART = { CAP: 1, GILL: 2, CACTUS: 3, CRYSTAL: 4, BONE: 5, STEM: 6, OBELISK: 7 };

  function mushroomInto(o, ox, oz, s, bend) {
    const H = 1.15 * s;
    const stemC = new THREE.CatmullRomCurve3([new THREE.Vector3(ox, 0, oz), new THREE.Vector3(ox + bend * 0.5 * s, H * 0.5, oz), new THREE.Vector3(ox + bend * s, H, oz + bend * 0.3 * s)]);
    o.add(tubeGeo(stemC, 6, 8, (t) => 0.24 * s * (1 - 0.18 * t) * (t < 0.22 ? 1 + 0.45 * Math.pow(1 - t / 0.22, 2) : 1)), PART.STEM, [1, 1, 1]);
    const top = stemC.getPointAt(1);
    const R = 0.98 * s;
    const prof = [[0.001, 0.62], [0.32, 0.6], [0.62, 0.52], [0.86, 0.36], [1.0, 0.18], [1.06, 0.04], [1.0, -0.02]].map(([r, y]) => new THREE.Vector2(r * R, y * R));
    const cap = new THREE.LatheGeometry(prof, 16);
    cap.translate(top.x, top.y - 0.06 * s, top.z);
    o.add(nonIndexed(cap), PART.CAP, [1, 1, 1], (y, a, b) => (y - a) / Math.max(0.01, b - a));
    const under = [[1.0, -0.02], [0.75, 0.04], [0.45, 0.07], [0.2, 0.065], [0.001, 0.07]].map(([r, y]) => new THREE.Vector2(r * R, y * R));
    const gill = new THREE.LatheGeometry(under, 16);
    gill.translate(top.x, top.y - 0.06 * s, top.z);
    o.add(nonIndexed(gill), PART.GILL, [1, 1, 1]);
  }

  function buildMushroom() {
    const o = partOut();
    mushroomInto(o, 0, 0, 1.0, 0.12);
    mushroomInto(o, 0.75, 0.35, 0.42, -0.1);
    mushroomInto(o, -0.55, 0.6, 0.32, 0.15);
    return o.build();
  }

  function buildCactus() {
    const o = partOut();
    const rib = (base) => (t, a) => base * (0.86 + 0.14 * Math.abs(Math.cos(a * 4))) * (t > 0.9 ? Math.sqrt(Math.max(0.05, 1 - Math.pow((t - 0.9) / 0.1, 2))) : 1);
    const main = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.03, 1.5, 0), new THREE.Vector3(0, 3.1, 0.02)]);
    o.add(tubeGeo(main, 14, 16, rib(0.36)), PART.CACTUS, [1, 1, 1]);
    const arm = (side, y0, out, h) => new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.2, y0, 0), new THREE.Vector3(side * (out * 0.7), y0 + 0.05, 0),
      new THREE.Vector3(side * out, y0 + 0.35, 0), new THREE.Vector3(side * out, y0 + h, 0)]);
    o.add(tubeGeo(arm(1, 1.25, 0.62, 1.05), 12, 12, rib(0.2)), PART.CACTUS, [1, 1, 1]);
    o.add(tubeGeo(arm(-1, 1.75, 0.52, 0.85), 12, 12, rib(0.18)), PART.CACTUS, [1, 1, 1]);
    return o.build();
  }

  function prismInto(o, rng, x, z, r, h, tiltX, tiltZ, glow) {
    const body = new THREE.CylinderGeometry(r, r * 1.08, h, 6, 1, false);
    body.translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(r, r * 1.7, 6, 1, true);
    tip.translate(0, h + r * 0.85, 0);
    const parts = [nonIndexed(body), nonIndexed(tip)];
    const top = h + r * 1.7;
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tiltX, rng() * 6.28, tiltZ)).setPosition(x, 0, z);
    parts.forEach((g) => {
      g.applyMatrix4(m);
      g.computeVertexNormals();         // non-indexed -> flat facets
      o.add(g, PART.CRYSTAL, [1, 1, 1], (y) => Math.min(1, Math.max(0, y / (top * Math.cos(Math.max(Math.abs(tiltX), Math.abs(tiltZ)))))), glow);
    });
  }

  function buildCrystalCluster(seed, glow, scale) {
    const rng = CW.mulberry32(seed >>> 0);
    const o = partOut();
    prismInto(o, rng, 0, 0, 0.36 * scale, 2.0 * scale, 0.05, -0.04, glow);
    const n = 4;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + rng() * 0.6;
      const d = 0.38 + rng() * 0.18;
      prismInto(o, rng, Math.cos(a) * d * scale, Math.sin(a) * d * scale, (0.16 + rng() * 0.12) * scale, (0.7 + rng() * 0.8) * scale,
        Math.sin(a) * 0.45, -Math.cos(a) * 0.45, glow);
    }
    return o.build();
  }

  function buildBones() {
    const o = partOut();
    const spine = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.12, -0.6), new THREE.Vector3(0, 0.2, 0.4), new THREE.Vector3(0.05, 0.15, 1.6)]);
    o.add(tubeGeo(spine, 10, 6, t => 0.1 * (1 - 0.3 * t) * (1 + 0.25 * Math.abs(Math.sin(t * 30)))), PART.BONE, [1, 1, 1]);
    for (let k = 0; k < 5; k++) {
      const z = -0.35 + k * 0.42, R = 0.95 - k * 0.1;
      [1, -1].forEach((side) => {
        const rib = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.2, z), new THREE.Vector3(side * R * 0.75, 0.75 * R, z + 0.06),
          new THREE.Vector3(side * R, 0.35 * R, z + 0.12), new THREE.Vector3(side * R * 0.85, 0.02, z + 0.16)]);
        o.add(tubeGeo(rib, 8, 5, t => 0.065 * (1 - 0.45 * t)), PART.BONE, [1, 1, 1]);
      });
    }
    return o.build();
  }

  function buildPylon() {
    const o = partOut();
    const ob = new THREE.CylinderGeometry(0.42, 0.62, 4.5, 4, 6, false);
    ob.rotateY(Math.PI / 4);
    ob.translate(0, 2.25, 0);
    const g = nonIndexed(ob);
    g.computeVertexNormals();
    o.add(g, PART.OBELISK, [1, 1, 1]);
    const rng = CW.mulberry32(77);
    const before = o.build();     // (build is cheap; we just need to continue adding below)
    before.dispose();
    prismInto(o, rng, 0, 0, 0.3, 0.6, 0, 0, 1.0);
    // lift the floating crystal: last added verts are the crystal -> rebuild with offset
    const geo = o.build();
    const pos = geo.attributes.position, part = geo.attributes.aPart;
    for (let i = 0; i < pos.count; i++) if (part.getX(i) === PART.CRYSTAL) pos.setY(i, pos.getY(i) + 4.85);
    geo.computeBoundingSphere();
    return geo;
  }

  const PROP_VERT_PARS = `
    attribute float aPart;
    attribute float aH01;
    attribute float aGlow;
    varying float vPart;
    varying float vH01;
    varying float vGlow;
    varying vec3 vObj;
  `;
  const PROP_FRAG_PARS = `
    uniform float uNight;
    uniform float uPropAlbedo;
    varying float vPart;
    varying float vH01;
    varying float vGlow;
    varying vec3 vObj;
    float pH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  `;
  const PROP_COLOR = `
    vec3 propGlow = vec3(0.0);
    {
      vec3 tint = diffuseColor.rgb;
      float part = floor(vPart + 0.5);
      vec3 col = tint;
      if (part == 1.0) {                       // mushroom cap: tint + procedural spots
        // spots projected from above onto the dome (2D cells on xz)
        vec2 q = vObj.xz * 2.4;
        vec2 cid = floor(q), f = fract(q);
        vec2 c = vec2(pH(vec3(cid, 1.0)), pH(vec3(cid, 7.0))) * 0.5 + 0.25;
        float spot = smoothstep(0.24, 0.17, length(f - c)) * step(0.3, pH(vec3(cid, 3.0))) * smoothstep(0.1, 0.3, vH01);
        col = tint * (0.82 + 0.25 * vH01);
        col = mix(col, vec3(0.97, 0.94, 0.86), spot);
        propGlow = mix(tint, vec3(1.0), 0.3) * spot * (0.06 + 0.5 * uNight);
      } else if (part == 2.0) {                // gills
        float a = atan(vObj.z, vObj.x);
        col = vec3(0.86, 0.8, 0.66) * (0.7 + 0.3 * abs(sin(a * 26.0)));
      } else if (part == 6.0) {                // stem
        col = vec3(0.93, 0.89, 0.79) * (0.82 + 0.18 * vH01);
      } else if (part == 3.0) {                // cactus: lighter tips + spines
        col = tint * (0.78 + 0.3 * vH01);
        float sp = step(0.9, pH(floor(vObj * vec3(10.0, 7.0, 10.0))));
        col = mix(col, vec3(0.96, 0.93, 0.8), sp * 0.85);
      } else if (part == 4.0) {                // crystal: deep base, glow rising to the tips
        col = tint * (0.45 + 0.35 * vH01);
        propGlow = tint * (0.18 + 1.25 * vH01 * vH01) * vGlow;
      } else if (part == 5.0) {                // bone
        col = vec3(0.94, 0.9, 0.8) * tint * (0.86 + 0.14 * pH(floor(vObj * 14.0)));
      } else if (part == 7.0) {                // rune obelisk
        col = vec3(0.16, 0.18, 0.27);
        float band = smoothstep(0.08, 0.0, abs(fract(vObj.y * 1.1) - 0.5) - 0.38);
        float rune = step(0.55, pH(floor(vec3(vObj.x * 6.0 + vObj.z * 6.0, vObj.y * 6.0, 1.0))));
        propGlow = tint * band * rune * 1.3;
      }
      diffuseColor.rgb = col * uPropAlbedo;
    }
  `;

  function makePropMaterial(SU) {
    const F = window.CR_FLORA;
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: F.softRamp() });
    const U = { uNight: SU && SU.uNight ? SU.uNight : { value: 0 }, uPropAlbedo: { value: 0.62 } };
    mat.customProgramCacheKey = () => 'cr-prop-v1';
    mat.onBeforeCompile = function (shader) {
      if (window.injectTerrain) window.injectTerrain(shader, mat);
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + PROP_VERT_PARS)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vPart = aPart; vH01 = aH01; vGlow = aGlow; vObj = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + PROP_FRAG_PARS)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + PROP_COLOR)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += propGlow;');
    };
    return mat;
  }

  // ---------------------------------------------------------------------------
  // stone props (chiseled rock shader)
  // ---------------------------------------------------------------------------
  function buildPillar() {
    const R = window.CR_ROCKS;
    const rng = CW.mulberry32(611);
    const col = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(0.02, 2.0, 0), new THREE.Vector3(0.05, 3.6, 0.03)]);
    const shaft = tubeGeo(col, 10, 24, (t, a) => 0.46 * (1 - 0.1 * t) * (1 - 0.07 * Math.abs(Math.sin(a * 8))));
    // broken, jagged top
    const p = shaft.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 3.2) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        p.setY(i, p.getY(i) - 0.35 * (0.5 + 0.5 * Math.sin(a * 3 + 1.3)) - 0.15 * Math.abs(Math.sin(a * 7)));
      }
    }
    const plinth = nonIndexed(new THREE.BoxGeometry(1.3, 0.45, 1.3, 2, 1, 2));
    plinth.translate(0, 0.22, 0);
    const pp = plinth.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
      const chip = 0.06 * Math.sin(x * 9.1 + z * 7.3 + y * 5.0);
      pp.setXYZ(i, x * (1 + chip), y, z * (1 - chip));
    }
    const geos = [shaft, plinth].map((g) => { g.deleteAttribute && g.deleteAttribute('aT'); g.deleteAttribute('uv'); R.creaseNormals(g, 38); return withColor(g, [1, 1, 1]); });
    return mergeRockParts(geos);
  }

  function buildGrave() {
    const R = window.CR_ROCKS;
    const sh = new THREE.Shape();
    sh.moveTo(-0.375, 0); sh.lineTo(0.375, 0); sh.lineTo(0.375, 0.85);
    sh.absarc(0, 0.85, 0.375, 0, Math.PI, false);
    sh.lineTo(-0.375, 0);
    let slab = new THREE.ExtrudeGeometry(sh, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 8 });
    slab = nonIndexed(slab);
    slab.translate(0, 0, -0.09);
    slab.rotateX(-0.08); slab.rotateZ(0.05);       // settled, slightly leaning
    if (slab.attributes.uv) slab.deleteAttribute('uv');
    R.creaseNormals(slab, 35);
    withColor(slab, [1, 1, 1]);
    const mound = R.buildChiseledRock(707, { detail: 3, cuts: 4, freq: 1.4, amp: 0.25, strata: 3, sx: 1.0, sy: 0.3, sz: 1.5, sink: 0.05, footprint: 0.6, crease: 34 });
    mound.translate(0, -0.02, 0.62);
    return mergeRockParts([slab, mound]);
  }

  // ---------------------------------------------------------------------------
  // install
  // ---------------------------------------------------------------------------
  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { initMMOWorld: GP.initMMOWorld };
  GP.initMMOWorld = function () {
    orig.initMMOWorld.call(this);
    try { this.upgradeProps(); } catch (e) { console.warn('[Props] upgrade failed', e); }
  };

  GP.upgradeProps = function () {
    const PI = this.propInst;
    const F = window.CR_FLORA, R = window.CR_ROCKS;
    if (!PI || !F || !R || !this.foliageU) return;
    const swap = (type, geo, mat, depth) => {
      const inst = PI[type];
      if (!inst) { geo.dispose(); return; }
      const oldG = inst.geometry, oldM = inst.material;
      inst.geometry = geo;
      inst.material = mat;
      if (depth) inst.customDepthMaterial = depth;
      oldG.dispose();
      if (oldM && oldM !== mat && oldM !== this.rockMaterial && oldM.dispose) oldM.dispose();
    };
    const FU = this.foliageU;
    const leafDepth = F.makeFoliageDepthMaterial(FU);
    swap('pine', buildConifer(5101), F.makeFoliageMaterial(FU, { bark: 0x4f3626, leafDark: true }), leafDepth);
    swap('snowpine', buildConifer(5303), F.makeFoliageMaterial(FU, { bark: 0x4a3628, leafDark: true, snow: true }), leafDepth);
    swap('deadtree', buildDeadTree(5507), F.makeFoliageMaterial(FU, { bark: 0x6e6056 }));
    const pm = makePropMaterial(this.skyUniforms);
    this.propMaterial = pm;
    swap('mushroom', buildMushroom(), pm);
    swap('cactus', buildCactus(), pm);
    swap('crystal', buildCrystalCluster(6101, 1.0, 1.0), pm);
    swap('icespike', buildCrystalCluster(6203, 0.18, 1.2), pm);
    swap('bones', buildBones(), pm);
    swap('pylon', buildPylon(), pm);
    const rm = this.rockMaterial || R.makeRockMaterial();
    swap('pillar', buildPillar(), rm);
    swap('grave', buildGrave(), rm);
    this.upgradeTownDecor(leafDepth, rm);
  };

  // The decorative tree ring + perimeter boulders around Ashenvale Bastion were built
  // from primitives in index.html; re-create them with the stylized pieces.
  GP.upgradeTownDecor = function (leafDepth, rockMat) {
    const ring = this.townTreeRing;
    const PI = this.propInst;
    if (ring && PI && PI.pine && PI.tree1) {
      const pines = ring.placements.filter(tp => !tp.isGold);
      const autumn = ring.placements.filter(tp => tp.isGold);
      const d = new THREE.Object3D(), c = new THREE.Color();
      const make = (src, list, colorFn) => {
        if (!list.length) return null;
        const inst = new THREE.InstancedMesh(src.geometry, src.material, list.length);
        list.forEach((tp, i) => {
          d.position.set(tp.tx, 0, tp.tz);
          d.rotation.set(0, i * 1.37 + tp.tx * 0.1, 0);
          d.scale.setScalar(tp.s * 1.05);
          d.updateMatrix();
          inst.setMatrixAt(i, d.matrix);
          inst.setColorAt(i, colorFn(tp, i));
        });
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        inst.castShadow = true;
        inst.receiveShadow = false;
        if (leafDepth) inst.customDepthMaterial = leafDepth;
        this.scene.add(inst);
        return inst;
      };
      // evergreen ring -> new conifers; golden ring -> broadleaf trees in autumn colours
      this.townPines = make(PI.pine, pines, (tp, i) => c.setHex(i % 3 ? 0x2f6e3a : 0x3f7a3a));
      this.townAutumn = make(PI.tree1, autumn, (tp, i) => c.setHex([0xd9822b, 0xe0a030, 0xc8642a][i % 3]));
      ring.meshes.forEach((m) => {
        this.scene.remove(m);
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => mt.dispose());
      });
      this.townTreeRing = null;
    }
    // perimeter boulders -> chiseled rocks, seated on the ground
    const rk = this.townRockInst;
    if (rk && PI && PI.boulder) {
      const old = rk.geometry;
      rk.geometry = PI.boulder.geometry;
      const om = rk.material;
      rk.material = rockMat;
      if (om && om !== rockMat) om.dispose();
      old.dispose();
      const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      for (let i = 0; i < rk.count; i++) {
        rk.getMatrixAt(i, m);
        m.decompose(p, q, s);
        p.y = 0;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.1);   // upright: the chiseled shape has a seated base
        s.set(s.x * 0.62, s.y * 0.75, s.z * 0.62);                 // boulder geometry is ~1.75 m across vs the old 1 m blob
        m.compose(p, q, s);
        rk.setMatrixAt(i, m);
      }
      rk.instanceMatrix.needsUpdate = true;
      rk.castShadow = true;
      this.townRockInst = null;
    }
  };
})();
