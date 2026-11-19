// =============================================================================
// CHRONO-RIFT MMO WORLD — procedural 3.2 km world, zone streaming, camps,
// boss AI with learnable ability rotations, world bosses, world map/minimap.
// Mixed into ChronoRiftCoOpGame.prototype (loaded after the main script).
// =============================================================================
(function () {
  'use strict';
  const M = window.MMO;
  const W = M.WORLD;
  const ASSET = (typeof ASSET_ROOT !== 'undefined') ? ASSET_ROOT : 'assets/';

  // Seeded layout, noise and terrain math live in world_core.js (shared with any server)
  const { mulberry32, hash2, vnoise, fbm, smooth, dist2, WorldGen, PROP_SCALE, PROP_COLLIDE } = window.ChronoWorld;

  // ---------------------------------------------------------------------------
  // Low-poly prop geometry (merged, vertex coloured) — no external deps
  // ---------------------------------------------------------------------------
  function part(geo, colorHex, tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(tx, ty, tz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz)
    );
    g.applyMatrix4(m);
    const col = new THREE.Color(colorHex);
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  }
  function merge(parts) {
    let total = 0;
    parts.forEach(p => { total += p.attributes.position.count; });
    const pos = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    parts.forEach((p) => {
      pos.set(p.attributes.position.array, o * 3);
      col.set(p.attributes.color.array, o * 3);
      o += p.attributes.position.count;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  function buildPropGeometries() {
    const T = THREE;
    const G = {};
    G.pine = merge([
      part(new T.CylinderGeometry(0.16, 0.26, 1.6, 6), 0x5a3a22, 0, 0.8, 0),
      part(new T.ConeGeometry(1.45, 2.6, 7), 0xffffff, 0, 2.3, 0),
      part(new T.ConeGeometry(1.08, 2.1, 7), 0xf2f2f2, 0, 3.4, 0, 0, 0.4),
      part(new T.ConeGeometry(0.68, 1.6, 7), 0xe8e8e8, 0, 4.35, 0, 0, 0.9)
    ]);
    G.snowpine = merge([
      part(new T.CylinderGeometry(0.16, 0.26, 1.6, 6), 0x4a3426, 0, 0.8, 0),
      part(new T.ConeGeometry(1.45, 2.6, 7), 0x2f5a46, 0, 2.3, 0),
      part(new T.ConeGeometry(1.08, 2.1, 7), 0x3a6a54, 0, 3.4, 0, 0, 0.4),
      part(new T.ConeGeometry(0.7, 1.7, 7), 0xf4f8ff, 0, 4.35, 0, 0, 0.9),
      part(new T.ConeGeometry(1.5, 0.5, 7), 0xeef4ff, 0, 1.25, 0)
    ]);
    G.oak = merge([
      part(new T.CylinderGeometry(0.22, 0.34, 2.0, 6), 0x5c3c24, 0, 1.0, 0),
      part(new T.IcosahedronGeometry(1.55, 0), 0xffffff, 0, 2.9, 0),
      part(new T.IcosahedronGeometry(1.1, 0), 0xf0f0f0, 0.95, 2.4, 0.3),
      part(new T.IcosahedronGeometry(1.05, 0), 0xe6e6e6, -0.8, 2.6, -0.45),
      part(new T.IcosahedronGeometry(0.9, 0), 0xf5f5f5, 0.1, 3.75, 0.2)
    ]);
    G.deadtree = merge([
      part(new T.CylinderGeometry(0.12, 0.28, 3.2, 5), 0xffffff, 0, 1.6, 0),
      part(new T.CylinderGeometry(0.05, 0.11, 1.5, 4), 0xe0e0e0, 0.5, 2.5, 0, 0, 0, -0.9),
      part(new T.CylinderGeometry(0.05, 0.1, 1.3, 4), 0xe0e0e0, -0.45, 2.1, 0.2, 0.3, 0, 0.95),
      part(new T.CylinderGeometry(0.04, 0.08, 1.0, 4), 0xd0d0d0, 0.1, 3.3, -0.35, -0.7, 0, 0.2)
    ]);
    G.rock = merge([part(new T.DodecahedronGeometry(0.85, 0), 0xffffff, 0, 0.35, 0, 0, 0, 0, 1, 0.62, 1)]);
    G.boulder = merge([
      part(new T.DodecahedronGeometry(1.5, 1), 0xffffff, 0, 0.75, 0, 0, 0, 0, 1, 0.75, 1),
      part(new T.DodecahedronGeometry(0.8, 0), 0xe8e8e8, 1.1, 0.4, 0.5)
    ]);
    G.ridge = merge([
      part(new T.ConeGeometry(1, 1.9, 6), 0xffffff, 0, 0.75, 0),
      part(new T.DodecahedronGeometry(0.7, 0), 0xdddddd, 0.55, 0.3, 0.2, 0, 0, 0, 1, 0.8, 1),
      part(new T.ConeGeometry(0.55, 1.2, 5), 0xf4f4f4, -0.5, 0.55, -0.3)
    ]);
    G.flower = merge([
      part(new T.ConeGeometry(0.06, 0.5, 3), 0x3b8a3a, 0, 0.25, 0),
      part(new T.OctahedronGeometry(0.16, 0), 0xffffff, 0, 0.55, 0),
      part(new T.ConeGeometry(0.05, 0.4, 3), 0x3b8a3a, 0.3, 0.2, 0.15),
      part(new T.OctahedronGeometry(0.13, 0), 0xffffff, 0.3, 0.42, 0.15),
      part(new T.ConeGeometry(0.05, 0.45, 3), 0x3b8a3a, -0.25, 0.22, -0.2),
      part(new T.OctahedronGeometry(0.14, 0), 0xffffff, -0.25, 0.48, -0.2)
    ]);
    G.mushroom = merge([
      part(new T.CylinderGeometry(0.22, 0.3, 1.2, 7), 0xf2ead8, 0, 0.6, 0),
      part(new T.SphereGeometry(0.95, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, 0, 1.15, 0, 0, 0, 0, 1, 0.7, 1),
      part(new T.CylinderGeometry(0.9, 0.9, 0.12, 9), 0xf2ead8, 0, 1.12, 0)
    ]);
    G.cactus = merge([
      part(new T.CylinderGeometry(0.32, 0.38, 3.0, 7), 0xffffff, 0, 1.5, 0),
      part(new T.CylinderGeometry(0.2, 0.22, 1.1, 6), 0xf0f0f0, 0.55, 1.6, 0, 0, 0, 0),
      part(new T.CylinderGeometry(0.2, 0.2, 0.6, 6), 0xf0f0f0, 0.36, 1.15, 0, 0, 0, Math.PI / 2),
      part(new T.CylinderGeometry(0.18, 0.2, 0.9, 6), 0xf0f0f0, -0.5, 2.1, 0),
      part(new T.CylinderGeometry(0.18, 0.18, 0.5, 6), 0xf0f0f0, -0.33, 1.72, 0, 0, 0, Math.PI / 2)
    ]);
    G.grave = merge([
      part(new T.BoxGeometry(0.75, 1.05, 0.2), 0xffffff, 0, 0.52, 0),
      part(new T.CylinderGeometry(0.375, 0.375, 0.2, 10, 1, false, 0, Math.PI), 0xffffff, 0, 1.05, 0, Math.PI / 2, 0, Math.PI / 2),
      part(new T.BoxGeometry(1.1, 0.12, 1.6), 0x6a5a48, 0, 0.06, 0.7)
    ]);
    G.pillar = merge([
      part(new T.BoxGeometry(1.3, 0.4, 1.3), 0xdedede, 0, 0.2, 0),
      part(new T.CylinderGeometry(0.42, 0.48, 3.4, 8), 0xffffff, 0, 2.1, 0),
      part(new T.BoxGeometry(1.1, 0.3, 1.1), 0xe6e6e6, 0, 3.9, 0, 0.05, 0.4, 0.08)
    ]);
    G.crystal = merge([
      part(new T.OctahedronGeometry(0.6, 0), 0xffffff, 0, 1.3, 0, 0, 0, 0, 0.7, 2.2, 0.7),
      part(new T.OctahedronGeometry(0.4, 0), 0xffffff, 0.5, 0.75, 0.2, 0, 0, 0.4, 0.6, 1.6, 0.6),
      part(new T.OctahedronGeometry(0.32, 0), 0xffffff, -0.4, 0.6, -0.25, 0, 0, -0.5, 0.6, 1.5, 0.6)
    ]);
    G.icespike = merge([
      part(new T.ConeGeometry(0.6, 3.0, 5), 0xffffff, 0, 1.5, 0),
      part(new T.ConeGeometry(0.4, 1.8, 5), 0xf0f8ff, 0.55, 0.9, 0.2, 0, 0, -0.25),
      part(new T.ConeGeometry(0.35, 1.5, 5), 0xf0f8ff, -0.45, 0.75, -0.2, 0, 0, 0.3)
    ]);
    G.lavarock = merge([
      part(new T.DodecahedronGeometry(0.95, 0), 0xffffff, 0, 0.45, 0, 0, 0, 0, 1, 0.7, 1),
      part(new T.DodecahedronGeometry(0.5, 0), 0xffffff, 0.8, 0.25, 0.3)
    ]);
    G.bones = merge([
      part(new T.TorusGeometry(1.0, 0.08, 4, 8, Math.PI), 0xf4ead6, 0, 0.0, 0, 0, 0, 0),
      part(new T.TorusGeometry(0.9, 0.08, 4, 8, Math.PI), 0xf4ead6, 0, 0.0, 0.5, 0, 0, 0),
      part(new T.TorusGeometry(0.75, 0.08, 4, 8, Math.PI), 0xf4ead6, 0, 0.0, 1.0, 0, 0, 0),
      part(new T.CylinderGeometry(0.1, 0.1, 2.4, 5), 0xece0c8, 0, 0.1, 0.5, Math.PI / 2, 0, 0)
    ]);
    G.mesa = merge([
      part(new T.CylinderGeometry(6.5, 8, 7, 9), 0xffffff, 0, 3.5, 0),
      part(new T.CylinderGeometry(7.2, 7.6, 0.6, 9), 0xe6d0b0, 0, 7.1, 0)
    ]);
    G.pylon = merge([
      part(new T.BoxGeometry(1.2, 4.5, 1.2), 0x2a3150, 0, 2.25, 0),
      part(new T.OctahedronGeometry(0.55, 0), 0xffffff, 0, 5.2, 0, 0, 0, 0, 1, 1.8, 1)
    ]);
    return G;
  }
  const EMISSIVE_PROPS = { crystal: 0x2a6fff, lavarock: 0xff4a10, pylon: 0x38e8ff };
  const SHADOW_PROPS = new Set(['pine', 'snowpine', 'oak', 'deadtree', 'boulder', 'pillar', 'cactus', 'mushroom', 'mesa']);
  // Per-zone instance colours
  const PROP_TINT = {
    default: { pine: 0x3f7a3a, snowpine: 0xffffff, oak: 0x5f9a3c, deadtree: 0x5a4a3c, rock: 0x7a7e86, boulder: 0x6f747c, ridge: 0x5d5a58, flower: 0xffd06b, mushroom: 0xd8433a, cactus: 0x4f8a3e, grave: 0x8a8f96, pillar: 0xb8b4aa, crystal: 0x6fb8ff, icespike: 0xbfe6ff, lavarock: 0x2a1c1a, bones: 0xffffff, mesa: 0xc98a54, pylon: 0x5ff0ff },
    meadows: { oak: 0x6aa83e, ridge: 0x6e6a60 },
    whisperwood: { pine: 0x2c5e34, oak: 0x3e7a32, mushroom: 0x8a4fd8, ridge: 0x4a4f44 },
    catacombs: { deadtree: 0x3e3a36, rock: 0x5a6466, ridge: 0x3a4044, crystal: 0x2ee68a, pillar: 0x8a948e },
    badlands: { rock: 0xb07a4a, boulder: 0xa86c3e, ridge: 0x9a5e36, deadtree: 0x7a5a3c },
    frostpeak: { rock: 0xc8d6e6, boulder: 0xb8c8dc, ridge: 0xdde8f4 },
    breach: { rock: 0x4a4e6a, boulder: 0x3c4060, ridge: 0x2e2c48, crystal: 0x38e8ff },
    infernal: { deadtree: 0x2a1a16, rock: 0x3a2a26, ridge: 0x2a1614, crystal: 0xff6a2a, bones: 0xd8c8b0 },
    citadel: { pillar: 0xc8b8e8, crystal: 0xc84bff, rock: 0x6a5a7a, ridge: 0x3a2c48 }
  };
  const FLOWER_COLORS = [0xffd06b, 0xff7aa8, 0xb48cff, 0xffffff, 0x7ad0ff];

  // ---------------------------------------------------------------------------
  // MIXIN
  // ---------------------------------------------------------------------------
  const proto = ChronoRiftCoOpGame.prototype;
  const orig = {
    spawnAICompanions: proto.spawnAICompanions,
    openNPCModal: proto.openNPCModal,
    resolveObstacleCollisions: proto.resolveObstacleCollisions,
    upgradeEntityToGLB: proto.upgradeEntityToGLB,
    playCutscene: proto.playCutscene,
    skipCutscene: proto.skipCutscene
  };

  Object.assign(proto, {
    // =========================================================================
    // BOOT
    // =========================================================================
    initMMOWorld() {
      this.worldGen = new WorldGen();
      this.mmoZone = null;
      this.campState = new Map();     // campId -> { slots: [{gen, alive, diedAt}] }
      this.bossFx = [];
      this._addSerial = 0;
      this._lastCampTick = 0;
      this._lastCombatTime = 0;
      this.scene.fog.density = 0.0062;
      this.camera.far = 420;
      this.camera.updateProjectionMatrix();
      this.buildWorldGround();
      this.buildPropInstancing();
      this.relocateLegacyBossDecor();
      this.buildOutpostsAndArenas();
      this.anchorStoryCutscenes();
      this.injectMMOHud();
    },

    // ---- terrain ground: control textures from the world layout -------------
    buildWorldGround() {
      const wg = this.worldGen;
      const N = 768;
      const half = W.half;
      const ctrlA = new Uint8Array(N * N * 4);
      const ctrlB = new Uint8Array(N * N * 4);
      const map = new Uint8ClampedArray(N * N * 4);
      const heights = new Float32Array(N * N); // baked from the shared getTerrainHeight math
      const zr = {};
      const BASE = [[0.36, 0.58, 0.27], [0.5, 0.52, 0.52], [0.36, 0.42, 0.62], [0.84, 0.72, 0.52]];
      for (let j = 0; j < N; j++) {
        const z = ((j + 0.5) / N) * 2 * half - half;
        for (let i = 0; i < N; i++) {
          const x = ((i + 0.5) / N) * 2 * half - half;
          wg.zoneAt(x, z, zr);
          const zA = wg.zones[zr.i], zB = wg.zones[zr.j];
          const blend = 0.5 * (1 - smooth(0, 40, zr.f));
          const mN = fbm(x * 0.012, z * 0.012, 5, 2);
          const tA = [0, 1, 2].map(k => zA.tint[k] + (zA.tint2[k] - zA.tint[k]) * mN);
          const tB = [0, 1, 2].map(k => zB.tint[k] + (zB.tint2[k] - zB.tint[k]) * mN);
          let tint = [0, 1, 2].map(k => tA[k] * (1 - blend) + tB[k] * blend);
          let wts = [0, 1, 2, 3].map(k => zA.ground[k] * (1 - blend) + zB.ground[k] * blend);
          const rd = wg.roadDist(x, z);
          heights[j * N + i] = wg.heightFromParts(x, z, zr, rd);
          const edge = half - Math.max(Math.abs(x), Math.abs(z));
          const ridge = (Math.hypot(x, z) > 300 && rd > W.gateWidth) ? 1 - smooth(W.borderBand * 0.3, W.borderBand * 1.1, Math.min(zr.f, edge)) : 1 - smooth(10, 40, edge);
          if (ridge > 0) {
            wts = wts.map((w, k) => w * (1 - ridge) + (k === 1 ? ridge : 0));
            tint = tint.map(t => t * (1 - ridge * 0.45));
          }
          const road = 1 - smooth(4.5, 8.5, rd);
          const o = (j * N + i) * 4;
          ctrlA[o] = Math.min(255, tint[0] / 1.6 * 255);
          ctrlA[o + 1] = Math.min(255, tint[1] / 1.6 * 255);
          ctrlA[o + 2] = Math.min(255, tint[2] / 1.6 * 255);
          ctrlA[o + 3] = road * 255;
          const ws = wts[0] + wts[1] + wts[2] + wts[3] || 1;
          for (let k = 0; k < 4; k++) ctrlB[o + k] = (wts[k] / ws) * 255;
          // map colour
          let r = 0, g = 0, b = 0;
          for (let k = 0; k < 4; k++) { const w = wts[k] / ws; r += BASE[k][0] * w; g += BASE[k][1] * w; b += BASE[k][2] * w; }
          r *= tint[0]; g *= tint[1]; b *= tint[2];
          if (ridge > 0.5) { r *= 0.55; g *= 0.5; b *= 0.5; }
          if (road > 0.4) { r = r * 0.4 + 0.72 * 0.6; g = g * 0.4 + 0.62 * 0.6; b = b * 0.4 + 0.46 * 0.6; }
          if (zr.f < 2.5 && ridge < 0.5) { r *= 0.75; g *= 0.75; b *= 0.75; }
          const mo = ((N - 1 - j) * N + i) * 4; // map canvas: north (−z) at the top
          map[mo] = r * 255; map[mo + 1] = g * 255; map[mo + 2] = b * 255; map[mo + 3] = 255;
        }
      }
      const mk = (data) => {
        const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearFilter;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.needsUpdate = true;
        return t;
      };
      this.worldCtrlA = mk(ctrlA);
      this.worldCtrlB = mk(ctrlB);
      // map canvas (north up). z = +half is the bottom row.
      const mc = document.createElement('canvas');
      mc.width = N; mc.height = N;
      const mctx = mc.getContext('2d');
      const img = mctx.createImageData(N, N);
      // flip vertically so −z (north) sits at the top
      for (let j = 0; j < N; j++) {
        const src = (N - 1 - j) * N * 4;
        img.data.set(map.subarray(src, src + N * 4), j * N * 4);
      }
      mctx.putImageData(img, 0, 0);
      this.worldMapCanvas = mc;
      this.worldMapRes = N;
      this.terrainHeights = heights;
      this.terrainN = N;

      // Arenas glow rings on the ground
      const arenas = [];
      wg.zones.forEach((z) => {
        arenas.push(new THREE.Vector4(z.bossPos[0], z.bossPos[1], 22, 0));
        if (z.worldBossPos) arenas.push(new THREE.Vector4(z.worldBossPos[0], z.worldBossPos[1], 30, 1));
      });
      while (arenas.length < 12) arenas.push(new THREE.Vector4(99999, 99999, 1, 0));

      const U = this.groundUniforms;
      U.uCtrlA = { value: this.worldCtrlA };
      U.uCtrlB = { value: this.worldCtrlB };
      U.uWorldHalf = { value: half };
      U.uArenas = { value: arenas.slice(0, 12) };

      this.groundMesh.geometry.dispose();
      const gg = new THREE.PlaneGeometry(2 * half + 400, 2 * half + 400, 1, 1);
      gg.rotateX(-Math.PI / 2);
      this.groundMesh.geometry = gg;

      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.06 });
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, U);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vGroundWorldPos;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvGroundWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
            uniform float uTime; uniform vec3 uPlayerPos; uniform float uWorldHalf;
            uniform sampler2D uTexPlaza; uniform sampler2D uTexCobble; uniform sampler2D uTexGrass;
            uniform sampler2D uTexCatacomb; uniform sampler2D uTexScifi; uniform sampler2D uCtrlA; uniform sampler2D uCtrlB;
            uniform vec4 uArenas[12];
            varying vec3 vGroundWorldPos;
            float gN(vec2 p) { return sin(p.x * 0.37 + sin(p.y * 0.29)) * 0.5 + cos(p.y * 0.41 - sin(p.x * 0.23)) * 0.5; }`)
          .replace('#include <map_fragment>', `#include <map_fragment>
            vec2 gUv = vGroundWorldPos.xz;
            vec2 cUv = gUv / (2.0 * uWorldHalf) + 0.5;
            vec4 ca = texture2D(uCtrlA, cUv);
            vec4 cb = texture2D(uCtrlB, cUv);
            float macroN = gN(gUv * 0.21) * 0.5 + 0.5;
            float microN = gN(gUv * 1.85) * 0.5 + 0.5;
            vec3 sGrass = texture2D(uTexGrass, gUv * 0.32).rgb;
            vec3 sStone = texture2D(uTexCatacomb, gUv * 0.3).rgb;
            vec3 sScifi = texture2D(uTexScifi, gUv * 0.34).rgb;
            vec3 sSand = texture2D(uTexPlaza, gUv * 0.19).rgb * vec3(1.05, 0.95, 0.8);
            vec3 sCobble = texture2D(uTexCobble, gUv * 0.38).rgb * vec3(0.92, 0.88, 0.82);
            float wsum = cb.r + cb.g + cb.b + cb.a + 0.0001;
            vec3 biome = (sGrass * cb.r + sStone * cb.g + sScifi * cb.b + sSand * cb.a) / wsum;
            biome *= ca.rgb * 1.6 * (0.9 + macroN * 0.14) * (0.93 + microN * 0.12);
            float roadM = smoothstep(0.3, 0.75, ca.a + (microN - 0.5) * 0.25);
            vec3 col = mix(biome, sCobble, roadM);
            // Ashenvale Bastion plaza (hand-built town core)
            float dPlaza = length(gUv - vec2(0.0, 9.5));
            float roadNS = smoothstep(3.8, 2.2, abs(gUv.x)) * smoothstep(-60.0, -44.0, gUv.y) * smoothstep(60.0, 40.0, gUv.y);
            float roadEW = smoothstep(3.5, 2.0, abs(gUv.y - 9.5)) * smoothstep(-28.0, -21.0, gUv.x) * smoothstep(28.0, 21.0, gUv.x);
            float plazaCore = smoothstep(13.2, 10.6, dPlaza);
            float townRoad = clamp(plazaCore + roadNS + roadEW, 0.0, 1.0);
            vec3 plazaCol = mix(sCobble, pow(texture2D(uTexPlaza, gUv * 0.36).rgb, vec3(1.03)) * vec3(0.98, 0.93, 0.86), smoothstep(12.2, 8.8, dPlaza));
            float outerCurb = smoothstep(0.55, 0.08, abs(dPlaza - 11.4));
            float innerCurb = smoothstep(0.36, 0.05, abs(dPlaza - 7.4));
            plazaCol = mix(plazaCol, vec3(0.76, 0.72, 0.64), clamp(outerCurb * 0.65 + innerCurb * 0.55, 0.0, 0.75));
            float townW = smoothstep(70.0, 48.0, length(gUv));
            col = mix(col, mix(col, plazaCol * 0.84, smoothstep(0.26, 0.76, townRoad)), townW);
            float scifiW = cb.b / wsum;
            float lava = smoothstep(0.08, 0.16, ca.r - ca.g) * smoothstep(0.32, 0.22, ca.g);
            diffuseColor.rgb *= col;`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            roughnessFactor = clamp(mix(0.9, 0.42, scifiW) - roadM * 0.06, 0.25, 0.95);`)
          .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
            metalnessFactor = clamp(0.04 + scifiW * 0.5, 0.0, 0.6);`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float dSanct = length(gUv - vec2(0.0, 8.0));
            totalEmissiveRadiance += vec3(0.92, 0.68, 0.22) * (smoothstep(0.2, 0.0, abs(dSanct - 7.4)) + smoothstep(0.13, 0.0, abs(dSanct - 4.2))) * 0.48;
            for (int k = 0; k < 12; k++) {
              vec4 ar = uArenas[k];
              float dA = length(gUv - ar.xy);
              float ringA = smoothstep(0.35, 0.0, abs(dA - ar.z)) + smoothstep(0.25, 0.0, abs(dA - ar.z * 0.55)) * 0.7;
              vec3 aCol = mix(vec3(1.0, 0.3, 0.22), vec3(0.85, 0.3, 1.0), ar.w);
              totalEmissiveRadiance += aCol * ringA * (0.55 + 0.25 * sin(uTime * 2.0 + float(k)));
            }
            float cracks = smoothstep(0.62, 0.95, gN(gUv * 0.9 + vec2(uTime * 0.05, 0.0)) * 0.5 + 0.5);
            totalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * lava * cracks * (0.7 + 0.3 * sin(uTime * 1.7 + gUv.x * 0.1));
            float dPlr = length(gUv - uPlayerPos.xz);
            float torchGlow = max(0.0, 1.0 - dPlr * 0.075);
            totalEmissiveRadiance += vec3(0.05, 0.034, 0.014) * (torchGlow * torchGlow);`);
      };
      this.groundMesh.material.dispose();
      this.groundMesh.material = mat;
      this.groundMat = mat;
    },

    // ---- instanced, streamed props ------------------------------------------
    propTintTables() { return { byZone: PROP_TINT, def: PROP_TINT.default, flowers: FLOWER_COLORS }; },

    buildPropInstancing() {
      const geos = buildPropGeometries();
      this.propInst = {};
      Object.keys(geos).forEach((t) => {
        const emis = EMISSIVE_PROPS[t];
        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.86, metalness: t === 'pylon' ? 0.5 : 0.05, flatShading: true,
          emissive: emis || 0x000000, emissiveIntensity: emis ? (t === 'lavarock' ? 0.55 : 0.75) : 0
        });
        const cap = t === 'ridge' ? 2200 : (t === 'flower' ? 2600 : 2400);
        const inst = new THREE.InstancedMesh(geos[t], mat, cap);
        inst.setColorAt(0, new THREE.Color(1, 1, 1)); // allocates the colour buffer for the full capacity
        inst.count = 0;
        inst.frustumCulled = false;
        inst.castShadow = SHADOW_PROPS.has(t);
        inst.receiveShadow = false;
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(inst);
        this.propInst[t] = inst;
      });
      this._propChunkKey = '';
      this._propDummy = new THREE.Object3D();
      this._propColor = new THREE.Color();
    },

    updatePropStreaming(force = false) {
      const cs = W.chunk;
      const pcx = Math.floor(this.player.pos.x / cs);
      const pcz = Math.floor(this.player.pos.z / cs);
      const key = pcx + ',' + pcz;
      if (!force && key === this._propChunkKey) return;
      this._propChunkKey = key;
      const counts = {};
      Object.keys(this.propInst).forEach(t => { counts[t] = 0; });
      const d = this._propDummy;
      const col = this._propColor;
      const R = 3, RR = 6;
      for (let dx = -RR; dx <= RR; dx++) {
        for (let dz = -RR; dz <= RR; dz++) {
          const far = Math.abs(dx) > R || Math.abs(dz) > R;
          const ch = this.worldGen.chunk(pcx + dx, pcz + dz);
          for (let k = 0; k < ch.props.length; k++) {
            const p = ch.props[k];
            if (far && p.t !== 'ridge' && p.t !== 'mesa') continue;
            // procedural tree variants (mmo_foliage.js) replace the old oak prop
            const pk = this.propKeyFor ? this.propKeyFor(p) : ((p.t === 'oak' && this.treeVariants) ? this.treeVariants[Math.min(this.treeVariants.length - 1, Math.floor(p.c * this.treeVariants.length))] : p.t);
            const inst = this.propInst[pk];
            if (!inst) continue;
            const n = counts[pk];
            if (n >= inst.instanceMatrix.count) continue;
            d.position.set(p.x, 0, p.z);
            d.rotation.set(0, p.r, 0);
            if (p.t === 'ridge') d.scale.set(p.s, p.s * (1.2 + p.c * 0.9), p.s);
            else d.scale.setScalar(p.s);
            d.updateMatrix();
            inst.setMatrixAt(n, d.matrix);
            const zid = this.worldGen.zones[p.zone].id;
            const tint = (PROP_TINT[zid] && PROP_TINT[zid][p.t]) || PROP_TINT.default[p.t] || 0xffffff;
            if (p.t === 'flower') col.setHex(FLOWER_COLORS[Math.floor(p.c * FLOWER_COLORS.length)]);
            else col.setHex(tint).multiplyScalar(0.86 + p.c * 0.28);
            inst.setColorAt(n, col);
            counts[pk] = n + 1;
          }
        }
      }
      Object.keys(this.propInst).forEach((t) => {
        const inst = this.propInst[t];
        inst.count = counts[t];
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      });
    },

    // Old hand-built boss pylons sat 50 m north of town; move them to Malakor's arena.
    relocateLegacyBossDecor() {
      const z = this.worldGen.zoneById.citadel;
      const ox = z.bossPos[0] - 0, oz = z.bossPos[1] - (-50);
      (this.bossCrystalPylons || []).forEach((py) => {
        const g = py.crystal.parent;
        if (g) { g.position.x += ox; g.position.z += oz; }
      });
      this.worldObstacles = (this.worldObstacles || []).filter(o => !(o.z < -36 && o.z > -62 && Math.abs(o.x) < 20));
      (this.flameGlowSprites || []).forEach((fg) => {
        if (fg.sprite.position.z < -36 && fg.sprite.position.z > -62) {
          fg.sprite.position.x += ox; fg.sprite.position.z += oz;
        }
      });
    },

    mmoLoadProp(file, cb) {
      this._mmoProps = this._mmoProps || {};
      const c = this._mmoProps[file];
      if (c && c.scene) { cb(c.scene); return; }
      if (c) { c.waiters.push(cb); return; }
      this._mmoProps[file] = { scene: null, waiters: [cb] };
      this.loader.load(ASSET + 'models/props/' + file, (gltf) => {
        gltf.scene.traverse((n) => { if (n.isMesh) { n.castShadow = false; n.receiveShadow = false; } });
        const entry = this._mmoProps[file];
        entry.scene = gltf.scene;
        entry.waiters.forEach(w => w(gltf.scene));
        entry.waiters = [];
      }, undefined, () => {});
    },

    placeMMOProp(file, x, z, scale, yaw, obstacleR) {
      this.mmoLoadProp(file, (tpl) => {
        const o = tpl.clone();
        o.position.set(x, 0, z);
        o.scale.setScalar(scale);
        o.rotation.y = yaw;
        o.visible = false;
        this.scene.add(o);
        this.worldProps.push(o);
      });
      if (obstacleR) this.worldObstacles.push({ x, z, r: obstacleR });
    },

    buildOutpostsAndArenas() {
      const wg = this.worldGen;
      const glowTex = this.createGlowSpriteTex('#ffd27a', 'rgba(255,140,40,0.55)');
      const blueTex = this.createGlowSpriteTex('#9ef0ff', 'rgba(56,232,255,0.5)');
      this.waypoints = [{ id: 'town', name: 'Ashenvale Bastion', zone: 'meadows', x: 0, z: 4, isTown: true }];
      wg.zones.forEach((z) => {
        if (z.id !== 'meadows') {
          const [cx, cz] = z.outpost;
          // Outpost: watchtower, palisade, banners, torches, stall, campfire
          this.placeMMOProp('bg_medieval_tower.glb', cx - 14, cz - 10, 1.2, 0.3, 2.6);
          this.placeMMOProp('bg_market_stall.glb', cx + 12, cz - 6, 1.15, -0.7, 2.0);
          this.placeMMOProp('prop_banner.glb', cx - 4, cz - 4, 1.2, 0, 0);
          this.placeMMOProp('prop_banner.glb', cx + 4, cz - 4, 1.2, 0, 0);
          this.placeMMOProp('prop_torch.glb', cx - 6, cz + 6, 1.3, 0, 0.3);
          this.placeMMOProp('prop_torch.glb', cx + 6, cz + 6, 1.3, 0, 0.3);
          this.placeMMOProp('prop_wagon.glb', cx - 10, cz + 4, 1.1, 0.8, 1.6);
          this.placeMMOProp('prop_barrel.glb', cx + 9, cz + 3, 1.2, 0, 0.5);
          this.placeMMOProp('prop_crate.glb', cx + 10, cz + 4.5, 1.2, 0.4, 0.5);
          this.addFlameGlowSprite(cx - 6, 2.3, cz + 6, 1.8, glowTex, 0.4);
          this.addFlameGlowSprite(cx + 6, 2.3, cz + 6, 1.8, glowTex, 1.7);
          this.waypoints.push({ id: 'wp_' + z.id, name: z.name, zone: z.id, x: z.waypoint[0], z: z.waypoint[1] });
        } else {
          this.waypoints.push({ id: 'wp_meadows', name: 'Meadow Watch', zone: 'meadows', x: z.center[0] + 8, z: z.center[1] + 6 });
          this.placeMMOProp('prop_torch.glb', z.center[0] + 2, z.center[1], 1.3, 0, 0.3);
          this.placeMMOProp('prop_banner.glb', z.center[0] + 14, z.center[1] + 2, 1.2, 0, 0);
          this.addFlameGlowSprite(z.center[0] + 2, 2.3, z.center[1], 1.8, glowTex, 0.9);
        }
        // Boss arena: ring of ruined pillars + braziers
        const [bx, bz] = z.bossPos;
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const px = bx + Math.cos(a) * 25, pz = bz + Math.sin(a) * 25;
          if (k % 2 === 0) {
            this.placeMMOProp('prop_torch.glb', px, pz, 1.6, 0, 0.35);
            this.addFlameGlowSprite(px, 2.8, pz, 2.2, glowTex, k);
          } else {
            this.placeMMOProp('prop_column_astra.glb', px, pz, 1.2, a, 0.9);
          }
        }
        if (z.worldBossPos) {
          const [wx, wz] = z.worldBossPos;
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            const px = wx + Math.cos(a) * 33, pz = wz + Math.sin(a) * 33;
            this.placeMMOProp(k % 3 === 0 ? 'prop_column_pipes.glb' : 'prop_column_astra.glb', px, pz, 1.5, a, 1.0);
            if (k % 3 === 0) this.addFlameGlowSprite(px, 3.4, pz, 2.6, blueTex, k);
          }
        }
      });
      // Waypoint obelisks (interactable fast travel)
      const obMat = new THREE.MeshStandardMaterial({ color: 0x1b2236, roughness: 0.5, metalness: 0.5 });
      const runeMat = new THREE.MeshStandardMaterial({ color: 0x38e8ff, emissive: 0x38e8ff, emissiveIntensity: 1.4 });
      this.waypointMeshes = [];
      this.waypoints.forEach((wp) => {
        if (wp.isTown) {
          this.interactables.push({ id: 'wp_town', pos: new THREE.Vector3(-1.4, 0, -0.5), radius: 0.01, label: '', action: () => {} });
          return;
        }
        const g = new THREE.Group();
        g.position.set(wp.x, 0, wp.z);
        const zIdx = Math.max(0, wg.zones.findIndex(zz => zz.id === wp.zone));
        if (this.buildWaypointShrine) {
          // crystal shrine: floating pillars, rune rings, light beam, pulsing ring (mmo_combatfx.js)
          this.buildWaypointShrine(wp, g, zIdx);
        } else {
          const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.6, 6), obMat);
          base.position.y = 0.3;
          const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 3.6, 6), obMat);
          pillar.position.y = 2.2;
          const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), runeMat);
          rune.position.y = 4.6;
          g.add(base, pillar, rune);
          this.waypointMeshes.push(rune);
          this.addFlameGlowSprite(wp.x, 4.6, wp.z, 2.4, blueTex, wp.x);
        }
        this.scene.add(g);
        this.worldProps.push(g);
        this.worldObstacles.push({ x: wp.x, z: wp.z, r: 1.6 });
        this.interactables.push({
          id: wp.id, pos: new THREE.Vector3(wp.x, 0, wp.z), radius: 4.0,
          label: `Waypoint: ${wp.name} — Fast Travel`, action: () => this.openWorldMap(true)
        });
      });
      // Quest givers at each outpost (meadows giver stands in town)
      wg.zones.forEach((z) => {
        const qg = M.QUEST_GIVERS[z.id];
        const pos = z.id === 'meadows' ? [4.5, 15.5] : [z.outpost[0] - 3, z.outpost[1] + 2];
        this.spawnQuestGiverNPC('qg_' + z.id, qg.name, qg.model, pos[0], pos[1], z.id);
      });
    },

    spawnQuestGiverNPC(id, name, modelKey, x, z, zoneId) {
      const root = new THREE.Group();
      root.position.set(x, 0, z);
      this.scene.add(root);
      const plate = this.createNPCNameplateSprite(name, '!');
      root.add(plate);
      const npc = {
        id, name, title: 'Quest Giver', badge: '!', modelKey, isNPC: true, isAlly: true, pos: root.position,
        baseYaw: Math.PI, yaw: Math.PI, weaponId: '', offhandId: '', meshRoot: root, nameplateSprite: plate,
        mixer: null, actions: {}, activeAction: null, animState: 'Idle_Loop', talking: false, questZone: zoneId
      };
      root.userData.npcId = id;
      if (this.modelCache[modelKey]) this.upgradeEntityToGLB(npc, modelKey, 1.05);
      else root.add(this.createArticulatedFallback(0x38e8ff, 1.0));
      this.townNPCs.push(npc);
      this.worldObstacles.push({ x, z, r: 0.8 });
      this.interactables.push({
        id, pos: new THREE.Vector3(x, 0, z), radius: 3.4,
        label: `Talk to ${name} (Quests)`, action: () => this.openQuestGiver(zoneId)
      });
    },

    anchorStoryCutscenes() {
      if (typeof STORY_CHAPTERS === 'undefined') return;
      const wg = this.worldGen;
      const anchors = {
        ch2: { from: [-22, -36], to: wg.zoneById.catacombs.bossPos },
        ch3: { from: [26, -34], to: wg.zoneById.breach.bossPos },
        ch4: { from: [0, -50], to: wg.zoneById.citadel.bossPos },
        ch5: { from: [0, -50], to: wg.zoneById.citadel.bossPos }
      };
      Object.entries(anchors).forEach(([cid, a]) => {
        const ch = STORY_CHAPTERS[cid];
        if (!ch || ch._anchored) return;
        ch._anchored = true;
        const ox = a.to[0] - a.from[0], oz = a.to[1] - a.from[1];
        ch.shots.forEach((s) => {
          ['camStart', 'camEnd', 'lookStart', 'lookEnd'].forEach((k) => { s[k][0] += ox; s[k][2] += oz; });
        });
      });
      STORY_CHAPTERS.ch1.objective = 'Speak with Warden Elric in Ashenvale Bastion and begin your journey.';
      STORY_CHAPTERS.ch2.objective = 'Defeat Gronk, Puglin Warlord, deep in the Bestiary Catacombs.';
      STORY_CHAPTERS.ch3.objective = 'Purge the Astral Cyclops Juggernaut in the Astral Breach.';
      STORY_CHAPTERS.ch4.objective = 'Vanquish Malakor atop the Chrono Citadel.';
    },

    // =========================================================================
    // PER-FRAME
    // =========================================================================
    updateMMOWorld(dt) {
      if (!this.worldGen) return;
      this.updatePropStreaming(false);
      this.updateZoneTracking(dt);
      const now = performance.now();
      if (now - this._lastCampTick > 400) {
        this._lastCampTick = now;
        this.updateCamps();
      }
      this.updateMobVisualsPost(dt);
      this.updatePlayerFootsteps(dt);
      this.updateBossFx(dt);
      if (this.waypointMeshes) {
        const t = this.clock.getElapsedTime();
        for (let i = 0; i < this.waypointMeshes.length; i++) {
          this.waypointMeshes[i].rotation.y = t * 1.2 + i;
          this.waypointMeshes[i].position.y = 4.6 + Math.sin(t * 2 + i) * 0.18;
        }
      }
      this.updateBossCastBar();
    },

    // Footsteps from the animation itself: a step plays when a foot bone plants
    // (reaches the bottom of its swing). The run cycle also speeds up with move speed
    // so feet don't slide during the faster out-of-combat travel pace.
    updatePlayerFootsteps(dt) {
      const p = this.player;
      if (!p.glbNode || !p.meshRoot) return;
      const cls = HERO_CLASSES[p.classId] || HERO_CLASSES.vanguard;
      const locomotion = p.animState === 'Jog_Fwd_Loop' || p.animState === 'Walk_Loop' || p.animState === 'Sprint_Loop';
      const moving = p.grounded && locomotion && p.vel && (p.vel.x * p.vel.x + p.vel.z * p.vel.z) > 1;
      if (locomotion && p.activeAction) {
        const sp = Math.hypot(p.vel.x, p.vel.z);
        p.activeAction.timeScale = moving ? Math.max(0.8, Math.min(1.6, sp / cls.speed)) : 1;
      }
      if (!this._feet || this._feet.root !== p.glbNode) {
        const feet = [];
        p.glbNode.traverse((n) => { if (n.isBone && (n.name === 'foot_l' || n.name === 'foot_r')) feet.push({ bone: n, prev: null, desc: false, minY: Infinity, cool: 0 }); });
        this._feet = { root: p.glbNode, list: feet };
        this.footstepsFromBones = feet.length === 2;
      }
      if (!this.footstepsFromBones) return;
      const v = this._v3;
      const baseY = p.meshRoot.position.y;
      for (let i = 0; i < this._feet.list.length; i++) {
        const f = this._feet.list[i];
        f.cool -= dt;
        f.bone.getWorldPosition(v);
        const y = v.y - baseY;
        f.minY = Math.min(f.minY + dt * 0.02, y); // slowly forget, so the floor adapts to the clip
        if (f.prev !== null) {
          const goingDown = y < f.prev - 0.0005;
          if (f.desc && !goingDown && moving && f.cool <= 0 && y < f.minY + 0.07) {
            f.cool = 0.16;
            this.audio.playFootstep(this.footstepSurface || this.currentZone);
          }
          f.desc = goingDown;
        }
        f.prev = y;
      }
    },

    // Called by the player movement code: keep heroes out of ridges and inside the world.
    worldClampMove(pos, prevX, prevZ) {
      if (!this.worldGen || !this.worldGen.blockedAt(pos.x, pos.z)) return;
      const nx = pos.x, nz = pos.z;
      if (this.worldGen.blockedAt(prevX, prevZ)) {
        // already inside a ridge (e.g. after a blink): only allow moves that lead back out
        const fPrev = this.worldGen.zoneAt(prevX, prevZ, {}).f;
        const fNew = this.worldGen.zoneAt(nx, nz, {}).f;
        if (fNew >= fPrev) return;
        pos.x = prevX; pos.z = prevZ;
        return;
      }
      if (!this.worldGen.blockedAt(nx, prevZ)) { pos.z = prevZ; return; }
      if (!this.worldGen.blockedAt(prevX, nz)) { pos.x = prevX; return; }
      pos.x = prevX; pos.z = prevZ;
    },

    resolveObstacleCollisions(pos, entityRadius = 0.55) {
      orig.resolveObstacleCollisions.call(this, pos, entityRadius);
      if (!this.worldGen) return;
      const cs = W.chunk;
      const cx = Math.floor(pos.x / cs), cz = Math.floor(pos.z / cs);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const obs = this.worldGen.chunk(cx + dx, cz + dz).obstacles;
          for (let i = 0; i < obs.length; i++) {
            const o = obs[i];
            const ddx = pos.x - o.x, ddz = pos.z - o.z;
            const minD = o.r + entityRadius;
            const dSq = ddx * ddx + ddz * ddz;
            if (dSq < minD * minD) {
              const d = Math.sqrt(dSq) || 0.001;
              const push = (minD - d) / d;
              pos.x += ddx * push;
              pos.z += ddz * push;
            }
          }
        }
      }
    },

    isInTownSafeZone(pos) {
      return Math.hypot(pos.x, pos.z) < W.townRadius;
    },

    // ---- zone tracking, atmosphere, discovery -------------------------------
    currentMMOZone() {
      return this.worldGen.zones[this.worldGen.zoneAt(this.player.pos.x, this.player.pos.z).i];
    },

    updateZoneTracking(dt) {
      const p = this.player.pos;
      const inTown = Math.hypot(p.x, p.z) < W.townRadius + 10;
      const zone = this.currentMMOZone();
      const key = inTown ? 'town' : zone.id;
      if (key !== this._mmoZoneKey) {
        const prev = this._mmoZoneKey;
        this._mmoZoneKey = key;
        this.mmoZone = zone;
        this.onZoneEntered(zone, inTown, prev);
      }
      // waypoint discovery
      if (this.waypoints && this.mmoState) {
        for (let i = 0; i < this.waypoints.length; i++) {
          const wp = this.waypoints[i];
          if (this.mmoState.waypoints.has(wp.id)) continue;
          // walk right up to the shrine to attune it
          if (dist2(p.x, p.z, wp.x, wp.z) < 5 * 5) {
            this.mmoState.waypoints.add(wp.id);
            if (this.onShrineUnlocked) this.onShrineUnlocked(wp);
            this.showLootToast(`🌀 Waypoint discovered: ${wp.name}`);
            this.addChatMessage('Waypoint', `🌀 ${wp.name} waypoint attuned. Fast travel unlocked!`, 'sys-synergy');
            this.audio.playSpell('warp');
            this.saveMMOState && this.saveMMOState();
          }
        }
      }
      // atmosphere lerp
      if (!this.cutsceneActive && this.skyUniforms) {
        const sky = inTown ? M.ZONES[0].sky : zone.sky;
        const k = Math.min(1, dt * 0.9);
        this._skyTmp = this._skyTmp || new THREE.Color();
        // Blend the zone's daytime palette; the day-night cycle (mmo_sky.js) turns it into final colours
        const zs = this.zoneSky || (this.zoneSky = {
          horizon: new THREE.Color(sky.horizon), zenith: new THREE.Color(sky.zenith), nebula: new THREE.Color(sky.nebula),
          fog: new THREE.Color(sky.fog), density: sky.density
        });
        const lerpC = (c, hex) => { this._skyTmp.setHex(hex); c.lerp(this._skyTmp, k); };
        lerpC(zs.horizon, sky.horizon);
        lerpC(zs.zenith, sky.zenith);
        lerpC(zs.nebula, sky.nebula);
        lerpC(zs.fog, sky.fog);
        zs.density += (sky.density - zs.density) * k;
        if (!this.applyDayNight) {
          this.skyUniforms.uHorizonColor.value.copy(zs.horizon);
          this.skyUniforms.uZenithColor.value.copy(zs.zenith);
          this.skyUniforms.uNebulaColor.value.copy(zs.nebula);
          this.scene.fog.color.copy(zs.fog);
          this.scene.fog.density = zs.density;
        }
      }
    },

    onZoneEntered(zone, inTown, prevKey) {
      const title = document.getElementById('hud-zone-title');
      const label = inTown ? '🏰 ASHENVALE BASTION' : `${zone.icon} ${zone.name.toUpperCase()}`;
      if (title) title.textContent = label;
      const lvEl = document.getElementById('hud-zone-level');
      if (lvEl) lvEl.textContent = inTown ? 'Sanctuary • Safe Zone' : `Levels ${zone.lv[0]}–${zone.lv[1]}`;
      this.currentZone = inTown ? 'ashenvale_bastion' : zone.id;
      this.audio.setZoneAudio && this.audio.setZoneAudio(inTown ? 'town' : zone.music, inTown ? 'town' : zone.amb);
      this.footstepSurface = inTown ? 'grass' : zone.step;
      if (prevKey !== undefined) this.showZoneBanner(inTown ? 'Ashenvale Bastion' : zone.name, inTown ? 'Sanctuary — you are safe here' : `Levels ${zone.lv[0]} – ${zone.lv[1]}`);
      if (this.mmoState && !inTown && !this.mmoState.zonesSeen.has(zone.id)) {
        this.mmoState.zonesSeen.add(zone.id);
        this.addChatMessage('World', `${zone.icon} Discovered ${zone.name} (Lv ${zone.lv[0]}–${zone.lv[1]}). Zone boss: ${zone.boss.name}.`, 'sys-synergy');
        if (zone.lv[0] > this.player.level + 4) {
          this.addChatMessage('World', `⚠️ ${zone.name} is dangerous for a level ${this.player.level} hero. Turn back!`, 'sys-boss');
        }
        if (this.questOnExplore) this.questOnExplore('zone:' + zone.id);
      }
      // story chapters now trigger by zone
      if (this.isInWorld && !inTown) {
        if (zone.id === 'catacombs') this.triggerStoryChapter('ch2');
        else if (zone.id === 'breach') this.triggerStoryChapter('ch3');
        else if (zone.id === 'citadel') this.triggerStoryChapter('ch4');
      }
    },

    showZoneBanner(title, sub) {
      let el = document.getElementById('mmo-zone-banner');
      if (!el) return;
      el.querySelector('.zb-title').textContent = title;
      el.querySelector('.zb-sub').textContent = sub;
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
    },

    // =========================================================================
    // CAMPS → MONSTERS (streamed; host-authoritative in co-op)
    // =========================================================================
    getCampState(c) {
      let st = this.campState.get(c.id);
      if (!st) {
        st = { slots: [] };
        for (let s = 0; s < c.count; s++) st.slots.push({ gen: 0, alive: false, diedAt: 0, spawnedOnce: false });
        this.campState.set(c.id, st);
      }
      return st;
    },

    campRespawnMs(c) {
      if (c.kind === 'worldboss') return (c.boss.respawnMin || 12) * 60000;
      if (c.kind === 'boss') return 4 * 60000;
      if (c.elite) return 3 * 60000;
      return 55000 + (c.id % 7) * 5000;
    },

    updateCamps() {
      if (!this.isInWorld) return;
      const wg = this.worldGen;
      const anchors = [this.player.pos];
      const isAuthority = this.isRoomHost || this.remotePeers.size === 0;
      if (isAuthority) this.remotePeers.forEach((pp) => { if (pp.pos) anchors.push(pp.pos); });
      const R = W.activateRadius;
      const active = new Set();
      const now = Date.now();
      anchors.forEach((a) => {
        wg.campsNear(a.x, a.z, R).forEach((c) => active.add(c));
      });
      if (isAuthority) {
        active.forEach((c) => {
          const st = this.getCampState(c);
          for (let s = 0; s < st.slots.length; s++) {
            const slot = st.slots[s];
            if (slot.alive) continue;
            const id = `c${c.id}s${s}g${slot.gen}`;
            if (this.monsters.some(m => m.id === id && !m.dead)) { slot.alive = true; continue; }
            const ready = !slot.spawnedOnce || (now - slot.diedAt >= this.campRespawnMs(c));
            if (!ready) continue;
            if (slot.spawnedOnce) {
              // don't pop monsters in right next to a hero
              const tooClose = anchors.some(a => dist2(a.x, a.z, c.x, c.z) < 30 * 30);
              if (tooClose) continue;
              slot.gen++;
            }
            slot.spawnedOnce = true;
            this.spawnCampMob(c, s, slot.gen);
          }
        });
      }
      // despawn mobs whose camp is far from every anchor (keep fights & corpses briefly)
      const keepR2 = (R + 45) * (R + 45);
      for (let i = this.monsters.length - 1; i >= 0; i--) {
        const m = this.monsters[i];
        let near = false;
        for (let a = 0; a < anchors.length; a++) {
          if (dist2(anchors[a].x, anchors[a].z, m.homePos.x, m.homePos.z) < keepR2) { near = true; break; }
        }
        if (!isAuthority) near = near || dist2(this.player.pos.x, this.player.pos.z, m.pos.x, m.pos.z) < keepR2;
        if (near) {
          // clear old corpses so long sessions don't accumulate dead monsters
          if (m.dead && m.diedAt && performance.now() - m.diedAt > 12000) this.removeMob(m, i);
          continue;
        }
        if (!m.dead && m.aggroTimer > 0) continue;
        this.removeMob(m, i);
      }
    },

    removeMob(m, idx) {
      if (idx === undefined) idx = this.monsters.indexOf(m);
      if (idx < 0) return;
      if (m.meshRoot) this.scene.remove(m.meshRoot);
      if (m.mixer) m.mixer.stopAllAction();
      if (m.nameplateSprite) {
        m.nameplateSprite.material.map.dispose();
        m.nameplateSprite.material.dispose();
      }
      if (m.campId !== undefined && !m.isAdd) {
        const st = this.campState.get(m.campId);
        if (st && st.slots[m.slot] && st.slots[m.slot].gen === m.gen) {
          if (!m.dead) st.slots[m.slot].alive = false;
          if (!m.dead && !st.slots[m.slot].diedAt) st.slots[m.slot].spawnedOnce = false;
        }
      }
      this.monsters.splice(idx, 1);
    },

    spawnCampMob(c, slotIdx, gen) {
      const zone = this.worldGen.zones[c.zone];
      const id = `c${c.id}s${slotIdx}g${gen}`;
      let spec;
      const rng = mulberry32((c.id * 977 + slotIdx * 31 + gen * 7) >>> 0);
      const ang = (slotIdx / Math.max(1, c.count)) * Math.PI * 2 + rng();
      const rad = c.count > 1 ? 3 + rng() * 4 : 0;
      const x = c.x + Math.cos(ang) * rad, z = c.z + Math.sin(ang) * rad;
      if (c.kind === 'boss' || c.kind === 'worldboss') {
        spec = { type: c.boss.type, name: c.boss.name, level: c.boss.lv, bossDef: c.boss, worldBoss: c.kind === 'worldboss' };
      } else if (c.elite && slotIdx === 0) {
        spec = { type: c.elite.type, name: '★ ' + c.elite.name, level: c.elite.lv, elite: true };
      } else {
        const lvl = Math.max(zone.lv[0], Math.min(zone.lv[1], c.level + (rng() < 0.3 ? (rng() < 0.5 ? -1 : 1) : 0)));
        spec = { type: c.mob.type, name: c.mob.name, level: lvl };
      }
      const m = this.createWorldMob(id, spec, x, z, c);
      m.campId = c.id; m.slot = slotIdx; m.gen = gen;
      const st = this.getCampState(c);
      st.slots[slotIdx].alive = true;
      st.slots[slotIdx].gen = gen;
      if (spec.worldBoss && (this.isRoomHost || this.remotePeers.size === 0)) {
        this.addChatMessage('World Boss', `🐉 ${spec.name}, ${c.boss.title.split(' — ')[0]}, stirs in ${zone.name}! (Lv ${spec.level}) Gather a party!`, 'sys-boss');
      }
      return m;
    },

    // Rebuild a mob from a network id (snapshot / hit from the host)
    getMobById(id) {
      if (!id) return null;
      let mob = this.monsters.find(m => m.id === id);
      if (mob) return mob;
      if (!this.worldGen) return null;
      let mm = /^c(\d+)s(\d+)g(\d+)$/.exec(id);
      if (mm) {
        const c = this.worldGen.camps[+mm[1]];
        if (!c) return null;
        if (dist2(this.player.pos.x, this.player.pos.z, c.x, c.z) > (W.activateRadius + 80) ** 2) return null;
        const s = +mm[2], g = +mm[3];
        // replace any older generation in the same slot
        for (let i = this.monsters.length - 1; i >= 0; i--) {
          const o = this.monsters[i];
          if (o.campId === c.id && o.slot === s && o.gen !== g && !o.isAdd) this.removeMob(o, i);
        }
        const st = this.getCampState(c);
        if (st.slots[s]) { st.slots[s].gen = Math.max(st.slots[s].gen, g); st.slots[s].spawnedOnce = true; }
        return this.spawnCampMob(c, s, g);
      }
      mm = /^add~([a-z_]+)~(\d+)~(\d+)~(-?\d+)~(-?\d+)$/.exec(id);
      if (mm) {
        const x = +mm[4], z = +mm[5];
        if (dist2(this.player.pos.x, this.player.pos.z, x, z) > (W.activateRadius + 80) ** 2) return null;
        const m = this.createWorldMob(id, { type: mm[1], name: this.addDisplayName(mm[1]), level: +mm[2] }, x, z, null);
        m.isAdd = true;
        return m;
      }
      return null;
    },

    addDisplayName(type) {
      for (const z of M.ZONES) {
        const hit = z.mobs.find(m => m.type === type);
        if (hit) return hit.name;
      }
      return type.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
    },

    createWorldMob(id, spec, x, z, camp) {
      const type = M.MOB_TYPES[spec.type] || M.MOB_TYPES.meadow_slime;
      const bossDef = spec.bossDef || null;
      const L = spec.level;
      const root = new THREE.Group();
      root.position.set(x, 0, z);
      this.scene.add(root);
      let hpMult = type.hp, dmgMult = type.dmg;
      if (spec.elite) { hpMult *= 3.4; dmgMult *= 1.45; }
      if (bossDef) { hpMult = spec.worldBoss ? 62 : 17; dmgMult = spec.worldBoss ? 1.9 : 1.6; }
      const maxHp = Math.round(M.mobHp(L) * hpMult);
      const modelKey = bossDef ? (bossDef.model || type.model) : type.model;
      const legacy = bossDef ? !!bossDef.legacy : !!type.legacy;
      const m = {
        id,
        modelKey,
        typeKey: spec.type,
        name: spec.name,
        level: L,
        pos: root.position,
        homePos: new THREE.Vector3(x, 0, z),
        targetPos: new THREE.Vector3(x, 0, z),
        yaw: Math.random() * 6.28,
        targetYaw: 0,
        hp: maxHp,
        maxHp,
        dmg: Math.round(M.mobDmg(L) * dmgMult),
        speed: type.speed * (bossDef ? 0.95 : 1),
        scale: legacy ? (bossDef ? (bossDef.scale || type.scale) : (type.scale || 1) * (spec.elite ? 1.35 : 1)) : 1,
        desiredHeight: bossDef ? (bossDef.height || 5) : (type.height || 1.4) * (spec.elite ? 1.4 : 1),
        hover: bossDef ? (bossDef.hover || 0) : (type.hover || 0),
        tint: bossDef ? (bossDef.tint || 0) : (type.tint || 0),
        xp: 0,
        ranged: !!type.ranged && !bossDef,
        isElite: !!spec.elite,
        hops: !!type.hop && !bossDef,
        isBoss: !!bossDef,
        isWorldBoss: !!spec.worldBoss,
        bossDef,
        isLegacyModel: legacy,
        weaponId: (bossDef && bossDef.weaponId) || type.weaponId || '',
        offhandId: (bossDef && bossDef.offhandId) || type.offhandId || '',
        meshRoot: root,
        state: 'idle', animState: 'Idle_Loop', netAnimState: 'Idle_Loop',
        isMovingNow: false, _lastNetSnap: null,
        attackCd: 1.5 + Math.random(), windupTimer: 0, attackAnimTimer: 0, stunTimer: 0, aggroTimer: 0,
        kbVel: new THREE.Vector3(), procBobY: 0, procTiltX: 0, dead: false, deathTimer: 0,
        arenaR: bossDef ? (spec.worldBoss ? 32 : 24) : 0
      };
      m.nameplateSprite = this.createMobNameplate(m);
      root.add(m.nameplateSprite);
      this.monsters.push(m);
      this.ensureMobModel(modelKey, (ok) => {
        if (!ok || !this.monsters.includes(m)) return;
        this.applyMobModel(m);
      });
      if (!this.modelCache[modelKey]) {
        root.add(this.createArticulatedFallback(bossDef ? 0xb266ff : 0xff3b5c, Math.min(2.5, m.desiredHeight / 1.8)));
      }
      return m;
    },

    applyMobModel(m) {
      const tpl = this.modelCache[m.modelKey];
      if (!tpl) return;
      if (!m.isLegacyModel) {
        const raw = tpl.userData.rawHeight || 1;
        m.scale = m.desiredHeight / raw;
      }
      this.upgradeEntityToGLB(m, m.modelKey, m.scale);
    },

    ensureMobModel(key, cb) {
      if (this.modelCache[key]) { cb(true); return; }
      this._mobModelWaiters = this._mobModelWaiters || {};
      if (this._mobModelWaiters[key]) { this._mobModelWaiters[key].push(cb); return; }
      if (!key.startsWith('qm/')) {
        // legacy models are loaded at boot by loadAllAssets(); poll until present
        this._mobModelWaiters[key] = [cb];
        const poll = setInterval(() => {
          if (this.modelCache[key]) {
            clearInterval(poll);
            const w = this._mobModelWaiters[key]; delete this._mobModelWaiters[key];
            w.forEach(f => f(true));
          }
        }, 500);
        return;
      }
      this._mobModelWaiters[key] = [cb];
      this.loader.load(ASSET + 'models/monsters/' + key + '.glb?v=2', (gltf) => {
        gltf.scene.traverse((c) => {
          c.frustumCulled = false;
          if (c.isMesh) {
            c.castShadow = true; c.receiveShadow = false;
            // safety net: never let a cut-out / zero-alpha material hide a monster
            (Array.isArray(c.material) ? c.material : [c.material]).forEach((mt) => {
              if (!mt) return;
              if (mt.alphaTest > 0 || mt.opacity < 0.05 || (mt.transparent && !mt.map)) {
                mt.alphaTest = 0; mt.opacity = 1; mt.transparent = false; mt.needsUpdate = true;
              }
            });
          }
        });
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        gltf.scene.userData.rawHeight = Math.max(0.05, size.y);
        gltf.scene.userData.minY = box.min.y;
        this.modelCache[key] = gltf.scene;
        const clips = {};
        gltf.animations.forEach((clip) => this.registerAnimClip(clip.name, clip, clips));
        if (!clips.Jog_Fwd_Loop) clips.Jog_Fwd_Loop = clips.Walk_Loop || clips.Idle_Loop;
        if (!clips.Sword_Heavy_Combo) clips.Sword_Heavy_Combo = clips.Sword_Attack;
        if (!clips.Spell_Simple_Shoot) clips.Spell_Simple_Shoot = clips.Sword_Attack;
        if (!clips.Hit_Knockback && clips.Hit_Chest) clips.Hit_Knockback = clips.Hit_Chest;
        clips.idle = clips.Idle_Loop || gltf.animations[0];
        Object.keys(clips).forEach(k => { if (!clips[k]) delete clips[k]; });
        this.modelAnimClips[key] = clips;
        const w = this._mobModelWaiters[key]; delete this._mobModelWaiters[key];
        w.forEach(f => f(true));
      }, undefined, () => {
        const w = this._mobModelWaiters[key]; delete this._mobModelWaiters[key];
        (w || []).forEach(f => f(false));
      });
    },

    upgradeEntityToGLB(entity, modelKey, scale) {
      orig.upgradeEntityToGLB.call(this, entity, modelKey, scale);
      if (!entity.glbNode || !entity.typeKey) return;
      if (entity.tint && entity.materials) {
        const tc = new THREE.Color(entity.tint);
        entity.materials.forEach((mat) => {
          if (mat.color) mat.color.lerp(tc, 0.45);
          if (mat.emissive) { mat.emissive.copy(tc).multiplyScalar(0.18); mat.userData.origEmissive = mat.emissive.clone(); }
        });
      }
      if (entity.isElite || entity.isBoss) {
        entity.materials.forEach((mat) => {
          if (mat.emissive && !entity.tint) {
            mat.emissive.setHex(entity.isWorldBoss ? 0x5a2a88 : (entity.isBoss ? 0x55220e : 0x3a2a08));
            mat.emissiveIntensity = 0.5;
            mat.userData.origEmissive = mat.emissive.clone();
            mat.userData.origEmissiveIntensity = 0.5;
          }
        });
      }
      // Nameplate height follows the model's REAL animated top (several rigs render much
      // taller than their bind-pose box, and flyers lift themselves in their idle clip)
      const top = this.measureModelTop(modelKey) * (entity.scale || scale || 1);
      entity.plateY = Math.max(entity.desiredHeight || 2, top) + (entity.hover || 0) + 0.45;
      if (entity.nameplateSprite) entity.nameplateSprite.position.y = entity.plateY;
    },

    // Highest point of a model (template units) in its idle pose, sampled with CPU skinning.
    // Cached per model key, so each monster type is measured once.
    measureModelTop(key) {
      this._modelTopCache = this._modelTopCache || {};
      if (this._modelTopCache[key] !== undefined) return this._modelTopCache[key];
      const t = this.modelCache[key];
      let top = 0;
      if (t) {
        try {
          const c = (typeof cloneSkinnedModel === 'function') ? cloneSkinnedModel(t) : t.clone();
          const clips = (this.modelAnimClips && this.modelAnimClips[key]) || {};
          const clip = clips.idle || clips.Idle_Loop;
          if (clip) { const mx = new THREE.AnimationMixer(c); mx.clipAction(clip).play(); mx.update(0.4); }
          c.updateMatrixWorld(true);
          const v = new THREE.Vector3();
          top = -Infinity;
          c.traverse((o) => {
            if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
            const pos = o.geometry.attributes.position;
            const step = Math.max(1, Math.floor(pos.count / 300));
            for (let i = 0; i < pos.count; i += step) {
              v.fromBufferAttribute(pos, i);
              if (o.isSkinnedMesh) o.boneTransform(i, v);
              v.applyMatrix4(o.matrixWorld);
              if (v.y > top) top = v.y;
            }
          });
          if (!isFinite(top)) top = t.userData.rawHeight || 0;
        } catch (e) { top = t.userData.rawHeight || 0; }
      }
      this._modelTopCache[key] = top;
      return top;
    },

    // ---- nameplates -----------------------------------------------------------
    conColor(level) {
      const d = level - this.player.level;
      if (d <= -6) return '#9aa0a6';
      if (d <= -3) return '#2ee68a';
      if (d <= 2) return '#ffe599';
      if (d <= 4) return '#ff9a2e';
      return '#ff3b5c';
    },

    createMobNameplate(m) {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 56;
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sp = new THREE.Sprite(mat);
      const w = m.isBoss ? 4.2 : 2.6;
      sp.scale.set(w, w * 56 / 256, 1);
      sp.position.y = (m.desiredHeight || 2) + (m.hover || 0) + 0.55;
      sp.renderOrder = 11;
      sp.userData = { canvas, ctx: canvas.getContext('2d'), tex, lastKey: '' };
      this.drawMobNameplate(m, sp);
      return sp;
    },

    drawMobNameplate(m, sp = m.nameplateSprite) {
      if (!sp) return;
      const frac = Math.max(0, m.hp / m.maxHp);
      const key = `${Math.round(frac * 60)}|${this.player.level}|${m.dead ? 1 : 0}`;
      if (sp.userData.lastKey === key) return;
      sp.userData.lastKey = key;
      const { ctx, canvas, tex } = sp.userData;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const col = this.conColor(m.level);
      const lvTxt = m.isBoss ? `☠ ${m.level}` : (m.isElite ? `★${m.level}` : String(m.level));
      ctx.font = 'bold 19px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const label = `${lvTxt}  ${m.name.replace(/^★ /, '')}`;
      ctx.strokeText(label, 128, 16);
      ctx.fillStyle = m.isElite || m.isBoss ? '#ffd56b' : '#ffffff';
      ctx.fillText(label, 128, 16);
      // level pip colour underline
      ctx.fillStyle = col;
      ctx.fillRect(40, 30, 176, 3);
      // hp bar
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(38, 37, 180, 13);
      ctx.fillStyle = frac > 0.5 ? '#e0453e' : (frac > 0.25 ? '#f07a2a' : '#ff2a2a');
      ctx.fillRect(40, 39, 176 * frac, 9);
      tex.needsUpdate = true;
    },

    // ---- per-frame mob visuals (hover, plates, spin) --------------------------
    updateMobVisualsPost(dt) {
      const t = this.clock.getElapsedTime();
      const px = this.player.pos.x, pz = this.player.pos.z;
      const plateTick = (this._plateAccum = (this._plateAccum || 0) + dt) > 0.12;
      if (plateTick) this._plateAccum = 0;
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (!m.meshRoot || !m.meshRoot.visible) continue;
        if (m.glbNode && m.hover) {
          const target = m.dead ? 0 : m.hover + Math.sin(t * 2.2 + i) * 0.18;
          m._hy = (m._hy === undefined ? target : m._hy + (target - m._hy) * Math.min(1, dt * (m.dead ? 3 : 8)));
          m.glbNode.position.y = m._hy;
        }
        if (m._spinT > 0) {
          m._spinT -= dt;
          m.meshRoot.rotation.y += dt * 14;
        }
        if (m.hops && m.glbNode) this.updateMobHop(m, dt);
        if (m.nameplateSprite) {
          const d2 = dist2(px, pz, m.pos.x, m.pos.z);
          const show = !m.dead && (d2 < 34 * 34 || (m.isBoss && d2 < 70 * 70));
          m.nameplateSprite.visible = show;
          if (show && plateTick) this.drawMobNameplate(m);
        }
      }
    },

    // Procedural hopping for creatures without a walk clip (frogs): driven by the
    // mob's real ground speed, so it also plays on co-op clients from snapshots.
    updateMobHop(m, dt) {
      const node = m.glbNode, root = m.meshRoot;
      const lx = m._hopLX === undefined ? m.pos.x : m._hopLX, lz = m._hopLZ === undefined ? m.pos.z : m._hopLZ;
      m._hopLX = m.pos.x; m._hopLZ = m.pos.z;
      const sp = Math.hypot(m.pos.x - lx, m.pos.z - lz) / Math.max(dt, 1e-3);
      m._hopSpd = (m._hopSpd || 0) + (Math.min(sp, 20) - (m._hopSpd || 0)) * Math.min(1, dt * 8);
      const busy = m.dead || m._windup || m.stunTimer > 0 || m.staggerTimer > 0;
      const moving = !busy && m._hopSpd > 0.6;
      let ph = m._hopPh || 0;
      if (moving) ph += dt * Math.max(1.5, Math.min(3.0, m._hopSpd / 2.0));
      else if (ph % 1 > 0.001 && !m.dead) ph = Math.min(Math.ceil(ph), ph + dt * 2.6);   // finish the current hop, then rest
      m._hopPh = ph;
      const f = ph % 1;
      const H = 0.55 * (m.desiredHeight || 1);
      const active = !m.dead && (moving || f > 0.001);
      if (!active) {                                  // resting: hand the transform back (hit bounce etc.)
        if (m._hopOn) { m._hopOn = false; node.position.y = m.hover ? node.position.y : 0; node.rotation.x = 0; if (!m._windup && root) root.scale.set(1, 1, 1); }
        return;
      }
      m._hopOn = true;
      let y = 0, sy = 1, tilt = 0;
      {
        if (f < 0.16) { const k = f / 0.16; sy = 1 - 0.22 * Math.sin(k * Math.PI * 0.5); }                 // crouch
        else if (f < 0.84) {                                                                                     // airborne arc
          const k = (f - 0.16) / 0.68;
          y = Math.sin(k * Math.PI) * H;
          sy = 1 + 0.14 * Math.sin(k * Math.PI);
          tilt = (0.5 - k) * 0.5;                                                                                // nose up on take-off, down on landing
        } else { const k = (f - 0.84) / 0.16; sy = 1 - 0.2 * Math.sin(k * Math.PI); }                         // landing squash
      }
      node.position.y = (m.hover ? node.position.y : 0) + y;
      node.rotation.x = -tilt;
      if (!m._windup && root) { const sx = 1 + (1 - sy) * 0.55; root.scale.set(sx, sy, sx); }
    },

    // =========================================================================
    // BOSS AI — phases + fixed ability rotations (learnable!)
    // =========================================================================
    updateBossAI(m, dt, target, dist, alivePlayers) {
      const def = m.bossDef;
      const st = m.bossState || (m.bossState = { phase: 0, rot: 0, cd: 2.2, cast: 0, engaged: false, resetT: 0, swing: 1.5 });
      const home = m.homePos;
      const res = { moving: false, engaged: st.engaged };
      const arenaR = m.arenaR || 24;
      let anyIn = false;
      for (let i = 0; i < alivePlayers.length; i++) {
        const p = alivePlayers[i];
        if (dist2(p.pos.x, p.pos.z, home.x, home.z) < (arenaR + 16) ** 2) { anyIn = true; break; }
      }
      if (!st.engaged) {
        if ((dist < 20 && anyIn) || m.hp < m.maxHp) {
          st.engaged = true; st.cd = 2.0; st.rot = 0;
          this.broadcastBossEvent(m, 'engage', {});
          this.onBossEngaged(m);
        } else {
          if (m.attackAnimTimer <= 0) this.playEntityAnim(m, 'Idle_Loop');
          return res;
        }
      }
      res.engaged = true;
      if (!anyIn) {
        st.resetT += dt;
        if (st.resetT > 5) {
          st.engaged = false; st.phase = 0; st.rot = 0; st.resetT = 0; m.enraged = false;
          m.hp = m.maxHp;
          m.pos.copy(home);
          this.broadcastBossEvent(m, 'reset', {});
          this.addChatMessage(m.name, `${m.name} returns to its lair, fully restored.`, 'sys-boss');
          return { moving: false, engaged: false };
        }
      } else st.resetT = 0;

      // Phase transitions
      const phases = def.phases;
      const frac = m.hp / m.maxHp;
      while (st.phase + 1 < phases.length && frac <= phases[st.phase + 1].hp) {
        st.phase++; st.rot = 0; st.cd = 1.4; st.cast = 0;
        this.broadcastBossEvent(m, 'phase', { phase: st.phase });
        this.onBossPhase(m, st.phase);
      }
      const ph = phases[st.phase];

      if (m._dash) {
        const d = m._dash;
        d.t += dt;
        const k = Math.min(1, d.t / d.dur);
        m.pos.x = d.fx + (d.tx - d.fx) * k;
        m.pos.z = d.fz + (d.tz - d.fz) * k;
        if (k >= 1) m._dash = null;
        this.playEntityAnim(m, 'Jog_Fwd_Loop');
        return { moving: true, engaged: true };
      }
      if (st.cast > 0) {
        st.cast -= dt;
        return res;
      }
      st.cd -= dt;
      const toX = target.pos.x - m.pos.x, toZ = target.pos.z - m.pos.z;
      m.yaw = Math.atan2(toX, toZ);
      if (st.cd <= 0 && dist < 36) {
        let key = ph.rotation[st.rot % ph.rotation.length];
        st.rot++;
        if (key === 'summon') {
          // never let adds pile up: if the last wave is still alive, slam instead
          const liveAdds = this.monsters.filter(o => o.isAdd && !o.dead && dist2(o.pos.x, o.pos.z, m.pos.x, m.pos.z) < 60 * 60).length;
          if (liveAdds >= 3) key = 'slam';
        }
        const params = this.buildBossParams(m, key, target, alivePlayers);
        const ab = M.ABILITIES[key];
        const wind = ab.windup * (m.enraged ? 0.82 : 1);
        this.castBossAbility(m, key, params, false);
        st.cast = wind + (key === 'spin' ? ab.duration : 0.5) + (key === 'quake' ? ab.rings * ab.gap : 0);
        st.cd = ph.gap * (m.enraged ? 0.85 : 1);
        return res;
      }
      // Chase + basic swipes between abilities
      const reach = 2.4 + (m.desiredHeight || 4) * 0.35;
      const fromHome = Math.hypot(m.pos.x - home.x, m.pos.z - home.z);
      if (dist > reach && fromHome < arenaR + 6) {
        const inv = 1 / (dist || 1);
        m.pos.x += toX * inv * m.speed * dt;
        m.pos.z += toZ * inv * m.speed * dt;
        this.playEntityAnim(m, 'Jog_Fwd_Loop');
        res.moving = true;
      } else if (fromHome >= arenaR + 6) {
        const hx = home.x - m.pos.x, hz = home.z - m.pos.z;
        const hl = Math.hypot(hx, hz) || 1;
        m.pos.x += hx / hl * m.speed * dt;
        m.pos.z += hz / hl * m.speed * dt;
        res.moving = true;
      } else {
        st.swing -= dt;
        if (st.swing <= 0) {
          st.swing = m.enraged ? 1.6 : 2.2;
          this.castBossAbility(m, 'swipe', { yaw: m.yaw }, false);
        } else if (m.attackAnimTimer <= 0) this.playEntityAnim(m, 'Idle_Loop');
      }
      return res;
    },

    buildBossParams(m, key, target, alivePlayers) {
      const p = { yaw: Number(m.yaw.toFixed(3)), tx: +target.pos.x.toFixed(2), tz: +target.pos.z.toFixed(2) };
      const ab = M.ABILITIES[key];
      if (key === 'meteors') {
        p.pts = [];
        alivePlayers.forEach((pl) => {
          if (dist2(pl.pos.x, pl.pos.z, m.pos.x, m.pos.z) < 45 * 45) p.pts.push([+pl.pos.x.toFixed(2), +pl.pos.z.toFixed(2)]);
        });
        const extra = ab.extra + (m.isWorldBoss ? 4 : 0) + (m.enraged ? 2 : 0);
        for (let k = 0; k < extra; k++) {
          const a = Math.random() * 6.28, r = 4 + Math.random() * 14;
          p.pts.push([+(m.pos.x + Math.cos(a) * r).toFixed(2), +(m.pos.z + Math.sin(a) * r).toFixed(2)]);
        }
      } else if (key === 'barrage') {
        p.a0 = +(Math.random() * 6.28).toFixed(3);
      } else if (key === 'summon') {
        const type = m.bossDef.adds || 'meadow_slime';
        const n = ab.count + (m.isWorldBoss ? 2 : 0);
        p.adds = [];
        for (let k = 0; k < n; k++) {
          const a = (k / n) * 6.28 + Math.random();
          const x = Math.round(m.pos.x + Math.cos(a) * 7), z = Math.round(m.pos.z + Math.sin(a) * 7);
          p.adds.push(`add~${type}~${Math.max(1, m.level - 2)}~${++this._addSerial}~${x}~${z}`);
        }
      }
      return p;
    },

    broadcastBossEvent(m, ev, data) {
      if (this.remotePeers.size === 0) return;
      this.broadcastGameEvent('boss_cast', Object.assign({ hostId: this.playerToken, mobId: m.id, key: '@' + ev }, data));
    },

    castBossAbility(m, key, params, fromNet) {
      if (!fromNet && this.remotePeers.size > 0) {
        this.broadcastGameEvent('boss_cast', { hostId: this.playerToken, mobId: m.id, key, params });
      }
      this.runBossAbility(m, key, params);
    },

    onBossCastEvent(payload) {
      if (!payload || payload.hostId === this.playerToken) return;
      const m = this.getMobById(payload.mobId);
      if (!m || m.dead) return;
      const key = payload.key || '';
      if (key[0] === '@') {
        const ev = key.slice(1);
        m.bossState = m.bossState || { phase: 0 };
        if (ev === 'phase') { m.bossState.phase = payload.phase; this.onBossPhase(m, payload.phase); }
        else if (ev === 'engage') this.onBossEngaged(m);
        else if (ev === 'reset') { m.enraged = false; m.bossState.phase = 0; }
        return;
      }
      this.runBossAbility(m, key, payload.params || {});
    },

    onBossEngaged(m) {
      const def = m.bossDef;
      if (!def) return;
      this._bossEngagedAt = this._bossEngagedAt || {};
      if (this._bossEngagedAt[m.id]) return;
      this._bossEngagedAt[m.id] = true;
      this.addChatMessage(m.name, `☠️ ${m.name}, ${def.title}, engages! Learn its pattern — watch the cast bar.`, 'sys-boss');
      if (m.desiredHeight > 4) this.screenShake = Math.max(this.screenShake, 0.4);
      this.spawnShockwaveRing(m.pos, 12, 0xff3b5c, 0.6);
    },

    onBossPhase(m, phaseIdx) {
      const def = m.bossDef;
      const ph = def && def.phases[phaseIdx];
      if (!ph) return;
      if (ph.enrage) m.enraged = true;
      const say = ph.say || 'grows furious!';
      this.addChatMessage(m.name, `🔥 Phase ${phaseIdx + 1}: "${say}"${ph.enrage ? ' — ENRAGED!' : ''}`, 'sys-boss');
      this.spawnFloatingText(m.pos.clone().add(new THREE.Vector3(0, m.desiredHeight || 3, 0)), ph.enrage ? 'ENRAGED!' : `PHASE ${phaseIdx + 1}`, '#ff3b5c', 26);
      this.spawnShockwaveRing(m.pos, 14, ph.enrage ? 0xff2a2a : 0xffb347, 0.7);
      this.screenShake = Math.max(this.screenShake, 0.5);
      this.audio.playSpell('ult');
      if (ph.enrage && m.materials) {
        m.materials.forEach((mat) => { if (mat.emissive) { mat.emissive.setHex(0x8a1010); mat.emissiveIntensity = 0.9; } });
      }
    },

    // ---- ability execution (runs on host AND clients; each client damages itself)
    bossHit(m, mult, label) {
      if (this.player.dodgeTimer > 0) { this.spawnFloatingText(this.player.pos, 'EVADED!', '#38e8ff', 15); return; }
      const dmg = Math.round(m.dmg * mult * (m.enraged ? 1.25 : 1));
      this.damagePlayer(dmg, `${m.name}: ${label}`, m.level);
    },

    runBossAbility(m, key, params) {
      const ab = key === 'swipe' ? { shape: 'cone', radius: 4.5 + (m.desiredHeight || 4) * 0.35, arc: 1.7, windup: 0.75, mult: 1.0 } : M.ABILITIES[key];
      if (!ab) return;
      const def = m.bossDef || {};
      const castName = key === 'swipe' ? '' : ((def.names && def.names[key]) || key.charAt(0).toUpperCase() + key.slice(1));
      const wind = ab.windup * (m.enraged ? 0.82 : 1);
      if (typeof params.yaw === 'number') { m.yaw = params.yaw; m.targetYaw = params.yaw; }
      m.attackAnimTimer = Math.max(m.attackAnimTimer || 0, wind + 0.4);
      this.playEntityAnim(m, key === 'swipe' || key === 'cleave' ? 'Sword_Attack' : (key === 'summon' || key === 'nova' ? 'Taunt' : 'Sword_Heavy_Combo'), true);
      if (castName) this.showBossCast(m, castName, ab.hint, wind);
      const ox = m.pos.x, oz = m.pos.z;
      const yaw = m.yaw;
      const red = 0xff3b5c;
      switch (ab.shape) {
        case 'cone': {
          this.spawnBossTelegraph('cone', { x: ox, z: oz, radius: ab.radius, arc: ab.arc, yaw }, wind, red, () => {
            const dx = this.player.pos.x - ox, dz = this.player.pos.z - oz;
            const d = Math.hypot(dx, dz);
            let diff = Math.atan2(dx, dz) - yaw;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            this.spawnSlashArc(new THREE.Vector3(ox, 0, oz), yaw, ab.radius, 0xff6a3a, 0, true);
            if (d <= ab.radius && Math.abs(diff) <= ab.arc / 2) this.bossHit(m, ab.mult, castName || 'Swipe');
          });
          break;
        }
        case 'circle': {
          this.spawnBossTelegraph('circle', { x: ox, z: oz, radius: ab.radius }, wind, red, () => {
            this.spawnVFXFlipbook('explosion', new THREE.Vector3(ox, 0, oz), ab.radius * 1.4, 0.55, 0xff7a3a, true);
            this.spawnShockwaveRing(new THREE.Vector3(ox, 0, oz), ab.radius, 0xff7a3a, 0.4);
            this.screenShake = Math.max(this.screenShake, 0.45);
            if (Math.hypot(this.player.pos.x - ox, this.player.pos.z - oz) <= ab.radius) this.bossHit(m, ab.mult, castName);
          });
          break;
        }
        case 'donut': {
          this.spawnBossTelegraph('donut', { x: ox, z: oz, inner: ab.inner, radius: ab.radius }, wind, 0xc84bff, () => {
            this.spawnShockwaveRing(new THREE.Vector3(ox, 0, oz), ab.radius, 0xc84bff, 0.6);
            this.spawnVFXFlipbook('eldenring', new THREE.Vector3(ox, 0, oz), ab.radius * 1.6, 0.7, 0xc84bff, true);
            this.screenShake = Math.max(this.screenShake, 0.5);
            const d = Math.hypot(this.player.pos.x - ox, this.player.pos.z - oz);
            if (d > ab.inner && d <= ab.radius) this.bossHit(m, ab.mult, castName);
          });
          break;
        }
        case 'line': {
          const tx = params.tx, tz = params.tz;
          const dir = Math.atan2(tx - ox, tz - oz);
          m.yaw = dir;
          this.spawnBossTelegraph('line', { x: ox, z: oz, width: ab.width, length: ab.length, yaw: dir }, wind, red, () => {
            const ex = ox + Math.sin(dir) * (ab.length - 2), ez = oz + Math.cos(dir) * (ab.length - 2);
            if (this.isRoomHost || this.remotePeers.size === 0) m._dash = { fx: ox, fz: oz, tx: ex, tz: ez, t: 0, dur: 0.38 };
            const dx = this.player.pos.x - ox, dz = this.player.pos.z - oz;
            const along = dx * Math.sin(dir) + dz * Math.cos(dir);
            const side = dx * Math.cos(dir) - dz * Math.sin(dir);
            this.spawnShockwaveRing(new THREE.Vector3(ex, 0, ez), 4, 0xff3b5c, 0.35);
            if (along >= -1 && along <= ab.length && Math.abs(side) <= ab.width / 2) this.bossHit(m, ab.mult, castName);
          });
          break;
        }
        case 'meteors': {
          (params.pts || []).forEach((pt) => {
            this.spawnBossTelegraph('circle', { x: pt[0], z: pt[1], radius: ab.radius }, wind, 0xff8a2a, () => {
              const c = new THREE.Vector3(pt[0], 0, pt[1]);
              this.spawnVFXFlipbook('explosion', c, ab.radius * 1.5, 0.5, 0xff8a2a, true);
              this.spawnShockwaveRing(c, ab.radius, 0xffb347, 0.3);
              if (Math.hypot(this.player.pos.x - pt[0], this.player.pos.z - pt[1]) <= ab.radius) this.bossHit(m, ab.mult, castName);
            });
          });
          break;
        }
        case 'rings': {
          this.spawnBossTelegraph('circle', { x: ox, z: oz, radius: 3.5 }, wind, 0xffd56b, () => {
            for (let k = 0; k < ab.rings; k++) {
              this.bossFx.push({ kind: 'ring', x: ox, z: oz, r: 1.5, speed: ab.speed, reach: ab.reach, delay: k * ab.gap, hit: false, m, mult: ab.mult, label: castName, mesh: null });
            }
            this.screenShake = Math.max(this.screenShake, 0.4);
          });
          break;
        }
        case 'barrage': {
          const n = ab.bolts + (m.isWorldBoss ? 6 : 0);
          const a0 = params.a0 || 0;
          const lines = [];
          for (let k = 0; k < n; k++) lines.push(a0 + (k / n) * Math.PI * 2);
          this.spawnBossTelegraph('rays', { x: ox, z: oz, angles: lines, length: 22 }, wind, 0xff3b5c, () => {
            lines.forEach((a) => {
              const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
              this.spawnProjectile(new THREE.Vector3(ox, 1.1, oz), dir, ab.speed, Math.round(m.dmg * ab.mult * (m.enraged ? 1.25 : 1)), 0xff5a3a, false, false, { life: 1.9, srcLevel: m.level });
            });
          });
          break;
        }
        case 'spin': {
          this.spawnBossTelegraph('circle', { x: ox, z: oz, radius: ab.radius }, wind, 0xff3b5c, () => {
            m._spinT = ab.duration;
            const ticks = Math.floor(ab.duration / ab.tick);
            for (let k = 0; k < ticks; k++) {
              this.bossFx.push({ kind: 'pulse', delay: k * ab.tick, m, radius: ab.radius, mult: ab.mult, label: castName });
            }
          });
          break;
        }
        case 'summon': {
          (params.adds || []).forEach((id) => {
            const mm = /~(-?\d+)~(-?\d+)$/.exec(id);
            if (!mm) return;
            const x = +mm[1], z = +mm[2];
            this.spawnBossTelegraph('circle', { x, z, radius: 1.8 }, wind, 0xb266ff, () => {
              this.spawnVFXFlipbook('vortex', new THREE.Vector3(x, 0, z), 3.5, 0.5, 0xb266ff, true);
              if (this.isRoomHost || this.remotePeers.size === 0) {
                const add = this.getMobById(id);
                if (add) { add.aggroTimer = 10; add.isAdd = true; }
              }
            });
          });
          break;
        }
      }
    },

    // ---- telegraph meshes --------------------------------------------------------
    spawnBossTelegraph(shape, o, duration, color, onDone) {
      const group = new THREE.Group();
      group.position.set(o.x, 0.06, o.z);
      const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
      const edgeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
      let fill = null;
      if (shape === 'circle') {
        const g = new THREE.CircleGeometry(o.radius, 40); g.rotateX(-Math.PI / 2);
        group.add(new THREE.Mesh(g, fillMat));
        const e = new THREE.RingGeometry(o.radius * 0.94, o.radius, 40); e.rotateX(-Math.PI / 2);
        group.add(new THREE.Mesh(e, edgeMat));
        const f = new THREE.CircleGeometry(o.radius, 40); f.rotateX(-Math.PI / 2);
        fill = new THREE.Mesh(f, fillMat.clone()); fill.material.opacity = 0.32; fill.scale.setScalar(0.02);
      } else if (shape === 'donut') {
        const g = new THREE.RingGeometry(o.inner, o.radius, 56); g.rotateX(-Math.PI / 2);
        group.add(new THREE.Mesh(g, fillMat));
        const e = new THREE.RingGeometry(o.inner - 0.25, o.inner, 40); e.rotateX(-Math.PI / 2);
        group.add(new THREE.Mesh(e, new THREE.MeshBasicMaterial({ color: 0x2ee68a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })));
        const f = new THREE.RingGeometry(o.radius - 0.4, o.radius, 56); f.rotateX(-Math.PI / 2);
        fill = new THREE.Mesh(f, edgeMat.clone());
        fill.userData.shrink = true;
      } else if (shape === 'cone') {
        const g = new THREE.CircleGeometry(o.radius, 28, -o.arc / 2, o.arc); g.rotateX(-Math.PI / 2);
        group.add(new THREE.Mesh(g, fillMat));
        const f = new THREE.CircleGeometry(o.radius, 28, -o.arc / 2, o.arc); f.rotateX(-Math.PI / 2);
        fill = new THREE.Mesh(f, fillMat.clone()); fill.material.opacity = 0.34; fill.scale.setScalar(0.02);
        group.rotation.y = o.yaw - Math.PI / 2;
      } else if (shape === 'line') {
        const g = new THREE.PlaneGeometry(o.width, o.length); g.rotateX(-Math.PI / 2); g.translate(0, 0, o.length / 2);
        group.add(new THREE.Mesh(g, fillMat));
        const f = new THREE.PlaneGeometry(o.width, o.length); f.rotateX(-Math.PI / 2); f.translate(0, 0, o.length / 2);
        fill = new THREE.Mesh(f, fillMat.clone()); fill.material.opacity = 0.34; fill.scale.set(1, 1, 0.02);
        fill.userData.lineFill = true;
        group.rotation.y = o.yaw;
      } else if (shape === 'rays') {
        o.angles.forEach((a) => {
          const g = new THREE.PlaneGeometry(0.55, o.length); g.rotateX(-Math.PI / 2); g.translate(0, 0, o.length / 2);
          const mesh = new THREE.Mesh(g, edgeMat);
          mesh.rotation.y = a;
          group.add(mesh);
        });
      }
      if (fill) group.add(fill);
      this.scene.add(group);
      this.bossFx.push({ kind: 'tele', group, fill, elapsed: 0, duration, onDone, mats: [fillMat, edgeMat] });
    },

    updateBossFx(dt) {
      for (let i = this.bossFx.length - 1; i >= 0; i--) {
        const fx = this.bossFx[i];
        if (fx.kind === 'tele') {
          fx.elapsed += dt;
          const k = Math.min(1, fx.elapsed / fx.duration);
          if (fx.fill) {
            if (fx.fill.userData.lineFill) fx.fill.scale.set(1, 1, Math.max(0.02, k));
            else if (fx.fill.userData.shrink) { const s = 1 - k * (1 - 0.2); fx.fill.scale.setScalar(Math.max(0.2, s)); }
            else fx.fill.scale.setScalar(Math.max(0.02, k));
          }
          if (fx.elapsed >= fx.duration && !fx.done) {
            fx.done = true;
            try { fx.onDone && fx.onDone(); } catch (e) { console.warn(e); }
          }
          if (fx.elapsed >= fx.duration + 0.18) {
            this.scene.remove(fx.group);
            fx.group.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
            this.bossFx.splice(i, 1);
          }
        } else if (fx.kind === 'ring') {
          if (fx.delay > 0) { fx.delay -= dt; continue; }
          if (!fx.mesh) {
            const g = new THREE.RingGeometry(0.86, 1.0, 64); g.rotateX(-Math.PI / 2);
            fx.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffd56b, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
            fx.mesh.position.set(fx.x, 0.12, fx.z);
            this.scene.add(fx.mesh);
          }
          fx.r += fx.speed * dt;
          fx.mesh.scale.setScalar(fx.r);
          fx.mesh.material.opacity = Math.max(0, 0.95 - fx.r / fx.reach * 0.6);
          if (!fx.hit) {
            const d = Math.hypot(this.player.pos.x - fx.x, this.player.pos.z - fx.z);
            if (Math.abs(d - fx.r) < 0.9) {
              fx.hit = true;
              if (this.player.pos.y > 0.55) this.spawnFloatingText(this.player.pos, 'VAULTED!', '#38e8ff', 15);
              else if (!fx.m.dead) this.bossHit(fx.m, fx.mult, fx.label);
            }
          }
          if (fx.r >= fx.reach) {
            this.scene.remove(fx.mesh);
            fx.mesh.geometry.dispose(); fx.mesh.material.dispose();
            this.bossFx.splice(i, 1);
          }
        } else if (fx.kind === 'pulse') {
          fx.delay -= dt;
          if (fx.delay <= 0) {
            const m = fx.m;
            if (!m.dead) {
              this.spawnShockwaveRing(m.pos, fx.radius, 0xff3b5c, 0.25);
              if (Math.hypot(this.player.pos.x - m.pos.x, this.player.pos.z - m.pos.z) <= fx.radius) this.bossHit(m, fx.mult, fx.label);
            }
            this.bossFx.splice(i, 1);
          }
        }
      }
    },

    // ---- cast bar ------------------------------------------------------------------
    showBossCast(m, name, hint, dur) {
      const d = Math.hypot(this.player.pos.x - m.pos.x, this.player.pos.z - m.pos.z);
      if (d > 60) return;
      this._bossCast = { name, hint, dur, start: performance.now(), mob: m };
    },

    updateBossCastBar() {
      const wrap = document.getElementById('boss-cast');
      if (!wrap) return;
      const c = this._bossCast;
      if (!c) { wrap.style.opacity = '0'; return; }
      const k = (performance.now() - c.start) / 1000 / c.dur;
      if (k > 1.25 || c.mob.dead) { this._bossCast = null; wrap.style.opacity = '0'; return; }
      wrap.style.opacity = '1';
      wrap.querySelector('.bc-name').textContent = c.name;
      wrap.querySelector('.bc-hint').textContent = c.hint || '';
      wrap.querySelector('.bc-fill').style.width = `${Math.min(100, k * 100)}%`;
      const ph = document.getElementById('boss-phase-label');
      if (ph && c.mob.bossState) ph.textContent = `PHASE ${(c.mob.bossState.phase || 0) + 1}${c.mob.enraged ? ' • ENRAGED' : ''}`;
    },

    // ---- legacy hooks replaced ------------------------------------------------------
    spawnZoneMonsters() {
      if (!this.worldGen) return;
      for (let i = this.monsters.length - 1; i >= 0; i--) this.removeMob(this.monsters[i], i);
      this.campState = new Map();
    },

    updateBossVoiceBarks() { /* boss voices are driven by onBossEngaged / onBossPhase */ },

    detectZoneFromPosition() { /* replaced by updateZoneTracking */ },

    checkStoryMilestonesOnDeath(mob) {
      if (!mob) return;
      // Chapter I (legacy "clear the outskirts" wave): your first three kills in the open world
      if (!this.storyState.completed.has('ch1')) {
        this._storyKills = (this._storyKills || 0) + 1;
        if (this._storyKills >= 3) {
          this.storyState.completed.add('ch1');
          this.showLootToast('📖 Chapter I Complete: Outskirts Cleared!');
          this.saveStoryState();
        }
      }
      if (!mob.bossDef) return;
      const story = mob.bossDef.story;
      if (story === 'ch2' && !this.storyState.completed.has('ch2')) {
        this.storyState.completed.add('ch2');
        this.showLootToast('📖 Chapter II Complete: Gronk Vanquished!');
      } else if (story === 'ch3' && !this.storyState.completed.has('ch3')) {
        this.storyState.completed.add('ch3');
        this.showLootToast('📖 Chapter III Complete: Xeno Juggernaut Purged!');
      } else if (mob.bossDef.isFinal) {
        this.storyState.completed.add('ch4');
        this.storyState.completed.add('ch5');
      }
      this.saveStoryState();
    },

    onBossDefeated(mob, fromNetwork) {
      const def = mob.bossDef;
      if (!def) return;
      const where = this.worldGen.zones[this.worldGen.zoneAt(mob.pos.x, mob.pos.z).i].name;
      this.addChatMessage(mob.isWorldBoss ? 'World Boss' : 'Boss Slain', `🏆 ${mob.name}, ${def.title.split(' — ')[0]}, has fallen in ${where}!`, 'sys-boss');
      if (!fromNetwork && (def.isFinal || mob.isWorldBoss) && this.recordLeaderboardVictory) this.recordLeaderboardVictory();
      if (def.isFinal) this.triggerStoryChapter('ch5');
      if (this._bossEngagedAt) delete this._bossEngagedAt[mob.id];
      this._bossCast = null;
    },

    activateAstralPortal(fromNetwork = false) {
      if (fromNetwork) return;
      this.openWorldMap(true);
    },

    openNPCModal(npcId) {
      if (typeof npcId === 'string' && npcId.startsWith('qg_')) { this.openQuestGiver(npcId.slice(3)); return; }
      if (npcId === 'gatekeeper') { this.audio.playVoice('lyra_greet', 2); this.openWorldMap(true); return; }
      return orig.openNPCModal.call(this, npcId);
    },

    // Warp to town or a discovered waypoint
    warpToZone(zoneId) {
      this.audio.init();
      let wp = null;
      const legacy = { ashenvale_bastion: 'town', bestiary_catacombs: 'wp_catacombs', astral_breach: 'wp_breach', boss_citadel: 'wp_citadel' };
      const wid = legacy[zoneId] || (zoneId && zoneId.startsWith('wp_') ? zoneId : (zoneId === 'town' ? 'town' : 'wp_' + zoneId));
      wp = (this.waypoints || []).find(w => w.id === wid) || (this.waypoints || [])[0];
      if (!wp) return;
      const tx = wp.isTown ? 0 : wp.x - 3, tz = wp.isTown ? 10 : wp.z + 3;
      this.player.pos.set(tx, 0, tz);
      this.player.vy = 0; this.player.grounded = true; this.player.jumpTimer = 0; this.player.isJumping = false;
      this.aiAllies.forEach((a) => a.pos.copy(this.player.pos).add(a.offset));
      this.audio.playSpell('warp');
      this.spawnVFXFlipbook('vortex', this.player.pos, 4.0, 0.5, 0x38e8ff);
      this.updatePropStreaming(true);
      this.broadcastPlayerState(true);
    },

    // ---- world-state persistence: camps respawn on their own, keep it light ----------
    buildWorldStatePayload() {
      return {
        waveId: this.riftWave, riftWave: this.riftWave, deadMobs: [], mobHps: {},
        deadDestructibles: this.destructibles.filter(d => d.dead).map(d => d.id),
        updatedAt: Date.now()
      };
    },

    applyWorldStatePayload(ws) {
      if (!ws || typeof ws !== 'object') return;
      const ts = typeof ws.updatedAt === 'number' ? ws.updatedAt : 0;
      if (ts && ts < (this._worldStateUpdatedAt || 0)) return;
      if (ts) this._worldStateUpdatedAt = ts;
      if (Array.isArray(ws.deadDestructibles)) {
        const dead = new Set(ws.deadDestructibles);
        this.destructibles.forEach((d) => {
          if (dead.has(d.id) && !d.dead) { d.dead = true; if (d.group) this.scene.remove(d.group); }
        });
      }
      this.updateStoryTrackerUI();
    },

    // Host only streams monsters that some remote hero can actually see
    mobFarFromPeers(m) {
      if (this.remotePeers.size === 0) return false;
      let far = true;
      this.remotePeers.forEach((pp) => {
        if (pp.pos && dist2(pp.pos.x, pp.pos.z, m.pos.x, m.pos.z) < 150 * 150) far = false;
      });
      return far;
    },

    spawnAICompanions(count) {
      orig.spawnAICompanions.call(this, count);
      const L = this.player.level || 1;
      this.aiAllies.forEach((a) => { a.maxHp = M.heroHp(480, L); a.hp = a.maxHp; });
    },

    // =========================================================================
    // MINIMAP + WORLD MAP
    // =========================================================================
    worldToMap(x, z, size) {
      const h = W.half;
      return [((x + h) / (2 * h)) * size, ((z + h) / (2 * h)) * size];
    },

    drawMinimap(ctx) {
      const p = this.player.pos;
      const S = 140;
      const viewR = 110; // world units visible from centre to edge
      const N = this.worldMapRes;
      const [mx, mz] = this.worldToMap(p.x, p.z, N);
      const srcR = viewR / (2 * W.half) * N;
      ctx.save();
      ctx.clearRect(0, 0, S, S);
      ctx.beginPath(); ctx.arc(70, 70, 68, 0, Math.PI * 2); ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.worldMapCanvas, mx - srcR, mz - srcR, srcR * 2, srcR * 2, 0, 0, S, S);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 0, S, S);
      const sc = (S / 2) / viewR;
      const dot = (wx, wz, col, r, glyph) => {
        const dx = (wx - p.x) * sc, dz = (wz - p.z) * sc;
        if (dx * dx + dz * dz > 66 * 66) return;
        if (glyph) {
          ctx.font = `bold ${r * 3}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(glyph, 70 + dx, 70 + dz);
          ctx.fillStyle = col; ctx.fillText(glyph, 70 + dx, 70 + dz);
          return;
        }
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(70 + dx, 70 + dz, r, 0, Math.PI * 2); ctx.fill();
      };
      (this.waypoints || []).forEach(wp => dot(wp.x, wp.z, '#38e8ff', 4, '◆'));
      this.drawQuestMarkers && this.drawQuestMarkers(dot);
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (m.dead) continue;
        if (m.isBoss) dot(m.pos.x, m.pos.z, '#ff3b5c', 5, '☠');
        else dot(m.pos.x, m.pos.z, m.isElite ? '#ffb347' : '#ff5a5a', m.isElite ? 3.5 : 2.2);
      }
      this.aiAllies.forEach(a => dot(a.pos.x, a.pos.z, '#2ee68a', 3));
      this.remotePeers.forEach(pp => dot(pp.pos.x, pp.pos.z, '#38e8ff', 4));
      // player arrow
      ctx.translate(70, 70);
      ctx.rotate(-this.player.yaw + Math.PI);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(243,200,107,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(70, 70, 68, 0, Math.PI * 2); ctx.stroke();
    },

    openWorldMap(travelMode = false) {
      this._mapTravelMode = !!travelMode;
      this.openModal('mmo-map-modal');
      this.renderWorldMap();
    },

    renderWorldMap() {
      const cv = document.getElementById('mmo-map-canvas');
      if (!cv) return;
      const S = cv.width;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(this.worldMapCanvas, 0, 0, S, S);
      const wg = this.worldGen;
      const P = (x, z) => this.worldToMap(x, z, S);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const seen = this.mmoState ? this.mmoState.zonesSeen : new Set();
      wg.zones.forEach((z) => {
        const [cx, cz] = P(z.center[0], z.center[1] - 120);
        const known = seen.has(z.id) || z.id === 'meadows';
        ctx.font = 'bold 15px Cinzel, serif';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        const t = `${z.icon} ${known ? z.name : '???'}`;
        ctx.strokeText(t, cx, cz); ctx.fillStyle = '#ffe599'; ctx.fillText(t, cx, cz);
        ctx.font = 'bold 12px Inter, sans-serif';
        const lv = `Lv ${z.lv[0]}–${z.lv[1]}`;
        ctx.strokeText(lv, cx, cz + 17); ctx.fillStyle = this.conColor(Math.round((z.lv[0] + z.lv[1]) / 2)); ctx.fillText(lv, cx, cz + 17);
        // boss markers
        const [bx, bz] = P(z.bossPos[0], z.bossPos[1]);
        ctx.font = 'bold 16px Inter, sans-serif';
        ctx.strokeText('☠', bx, bz); ctx.fillStyle = '#ff6a6a'; ctx.fillText('☠', bx, bz);
        if (known) {
          ctx.font = 'bold 10px Inter, sans-serif';
          const bl = `${z.boss.name} (${z.boss.lv})`;
          ctx.strokeText(bl, bx, bz + 13); ctx.fillStyle = '#ffb0b0'; ctx.fillText(bl, bx, bz + 13);
        }
        if (z.worldBossPos) {
          const [wx, wz] = P(z.worldBossPos[0], z.worldBossPos[1]);
          ctx.font = 'bold 20px Inter, sans-serif';
          ctx.strokeText('🐉', wx, wz); ctx.fillStyle = '#c84bff'; ctx.fillText('🐉', wx, wz);
          ctx.font = 'bold 10px Inter, sans-serif';
          const wl = `WORLD BOSS ${z.worldBoss.name} (${z.worldBoss.lv})`;
          ctx.strokeText(wl, wx, wz + 15); ctx.fillStyle = '#e0a8ff'; ctx.fillText(wl, wx, wz + 15);
        }
      });
      // town
      const [tx, tz] = P(0, 0);
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.strokeText('🏰', tx, tz); ctx.fillText('🏰', tx, tz);
      this.drawQuestMarkers && this.drawQuestMarkers((x, z, col, r, glyph) => {
        const [qx, qz] = P(x, z);
        ctx.font = 'bold 16px Inter, sans-serif';
        ctx.strokeText(glyph || '•', qx, qz); ctx.fillStyle = col; ctx.fillText(glyph || '•', qx, qz);
      }, true);
      // waypoints
      const list = document.getElementById('mmo-map-waypoints');
      const canTravel = this._mapTravelMode;
      const html = [];
      (this.waypoints || []).forEach((wp) => {
        const known = wp.isTown || (this.mmoState && this.mmoState.waypoints.has(wp.id));
        const [x, z] = P(wp.isTown ? 0 : wp.x, wp.isTown ? 0 : wp.z);
        if (!wp.isTown) {
          ctx.font = 'bold 13px Inter, sans-serif';
          ctx.strokeText('◆', x, z); ctx.fillStyle = known ? '#38e8ff' : '#55606e'; ctx.fillText('◆', x, z);
        }
        const zone = this.worldGen.zoneById[wp.zone];
        html.push(`<button class="mini-btn mmo-wp-btn" ${known && canTravel ? '' : 'disabled'} onclick="window.game.travelToWaypoint('${wp.id}')">
          ${known ? '🌀' : '🔒'} ${wp.name} <span style="color:var(--text-muted)">${wp.isTown ? 'Hub' : `Lv ${zone.lv[0]}–${zone.lv[1]}`}</span></button>`);
      });
      if (list) list.innerHTML = html.join('') + (canTravel ? '' : '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Stand at a waypoint ◆ or the town Rift Gate to fast travel.</div>');
      // party & player
      this.remotePeers.forEach((pp) => {
        const [x, z] = P(pp.pos.x, pp.pos.z);
        ctx.fillStyle = '#38e8ff'; ctx.beginPath(); ctx.arc(x, z, 5, 0, Math.PI * 2); ctx.fill();
      });
      const [px, pz] = P(this.player.pos.x, this.player.pos.z);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, pz, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const info = document.getElementById('mmo-map-info');
      if (info) {
        const z = this.currentMMOZone();
        info.textContent = `You are in ${Math.hypot(this.player.pos.x, this.player.pos.z) < W.townRadius + 10 ? 'Ashenvale Bastion' : z.name} (${Math.round(this.player.pos.x)}, ${Math.round(this.player.pos.z)})`;
      }
    },

    travelToWaypoint(id) {
      if (!this._mapTravelMode) return;
      const wp = (this.waypoints || []).find(w => w.id === id);
      if (!wp) return;
      if (!wp.isTown && !(this.mmoState && this.mmoState.waypoints.has(id))) return;
      if (performance.now() - (this._lastCombatTime || 0) < 4000) {
        this.showLootToast('⚔️ Cannot fast travel while in combat!');
        return;
      }
      this.closeModals(true);
      this.isAnyModalOpen = false;
      this.warpToZone(id);
      this.showLootToast(`🌀 Travelled to ${wp.name}`);
    },

    // =========================================================================
    // HUD INJECTION
    // =========================================================================
    injectMMOHud() {
      const css = document.createElement('style');
      css.textContent = `
        #mmo-zone-banner { position: fixed; top: 22%; left: 50%; transform: translateX(-50%); text-align: center; pointer-events: none; z-index: 40; opacity: 0; }
        #mmo-zone-banner.show { animation: zbShow 4.2s ease forwards; }
        #mmo-zone-banner .zb-title { font-family: 'Cinzel', serif; font-size: 40px; font-weight: 700; color: #ffe599; text-shadow: 0 3px 18px rgba(0,0,0,0.9), 0 0 24px rgba(243,200,107,0.4); letter-spacing: 2px; }
        #mmo-zone-banner .zb-sub { font-size: 15px; color: #d8dde8; letter-spacing: 3px; text-transform: uppercase; text-shadow: 0 2px 8px #000; margin-top: 4px; }
        @keyframes zbShow { 0% { opacity: 0; transform: translate(-50%, 12px); } 12% { opacity: 1; transform: translate(-50%, 0); } 78% { opacity: 1; } 100% { opacity: 0; } }
        #hud-zone-level { display:block; font-size: 10.5px; color: var(--text-muted); letter-spacing: 1px; margin-top: 2px; text-align:center; }
        #boss-cast { margin-top: 6px; opacity: 0; transition: opacity 0.2s; }
        #boss-cast .bc-row { display:flex; justify-content:space-between; font-size: 12px; font-weight: 700; color: #ffd56b; letter-spacing: 0.5px; }
        #boss-cast .bc-track { height: 8px; background: rgba(0,0,0,0.6); border-radius: 4px; overflow: hidden; margin-top: 3px; border: 1px solid rgba(255,213,107,0.4); }
        #boss-cast .bc-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #ff9a2e, #ffd56b); }
        #boss-cast .bc-hint { font-size: 11px; color: #9ef0ff; margin-top: 2px; text-align: center; letter-spacing: 0.5px; }
        #boss-phase-label { font-size: 10px; color: #ff99a8; letter-spacing: 1px; }
        .mmo-wp-btn { display:block; width:100%; text-align:left; margin-bottom:4px; }
        .mmo-wp-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        
      `;
      document.head.appendChild(css);
      const banner = document.createElement('div');
      banner.id = 'mmo-zone-banner';
      banner.innerHTML = '<div class="zb-title"></div><div class="zb-sub"></div>';
      document.body.appendChild(banner);
      // Zone pill: replace the 4 legacy warp buttons with map + quest buttons
      const pill = document.querySelector('.zone-warp-btns');
      if (pill) {
        pill.innerHTML = `
          <button class="mini-btn" onclick="window.game.openWorldMap(false)">🗺️ World Map [M]</button>
          <button class="mini-btn" onclick="window.game.openQuestLog()">📜 Quest Log [O]</button>
          <button class="mini-btn" onclick="window.game.openModal('inventory-modal')">🎒 Gear [I]</button>`;
        const lv = document.createElement('span');
        lv.id = 'hud-zone-level';
        lv.textContent = 'Sanctuary • Safe Zone';
        pill.parentNode.insertBefore(lv, pill);
      }
      const bossHud = document.getElementById('boss-hud');
      if (bossHud) {
        const cast = document.createElement('div');
        cast.id = 'boss-cast';
        cast.innerHTML = '<div class="bc-row"><span class="bc-name"></span><span id="boss-phase-label"></span></div><div class="bc-track"><div class="bc-fill"></div></div><div class="bc-hint"></div>';
        bossHud.appendChild(cast);
      }
      // World map modal
      const modal = document.createElement('div');
      modal.id = 'mmo-map-modal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-box" style="display:flex; gap:16px; flex-wrap:wrap; max-width:1060px;">
          <div style="flex: 1 1 560px; min-width: 300px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <h2 style="margin:0; font-family:'Cinzel',serif; color:var(--gold-bright);">🗺️ Realm of Ashenvale</h2>
              <span id="mmo-map-info" style="font-size:12px; color:var(--text-muted);"></span>
            </div>
            <canvas id="mmo-map-canvas" width="720" height="720" style="width:100%; max-width:720px; aspect-ratio:1; border-radius:10px; border:1px solid rgba(243,200,107,0.4); background:#0b0f1a;"></canvas>
          </div>
          <div style="flex: 0 1 260px; min-width: 220px;">
            <h3 style="font-family:'Cinzel',serif; color:var(--cyan); margin:4px 0 8px;">Waypoints</h3>
            <div id="mmo-map-waypoints"></div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:10px; line-height:1.5;">
              ☠ Zone boss • 🐉 World boss (party recommended)<br>◆ Waypoint • ! Quest • ? Turn in • ✦ Objective<br>Zones are walled by mountain ridges — follow the roads to cross passes.
            </div>
            <button class="cta-btn" style="margin-top:12px; width:100%;" onclick="window.game.closeModals(true)">Close</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModals(true); });
    }
  });

  // Audio: let zones choose music/ambience directly
  if (typeof ChronoAudioEngine !== 'undefined') {
    const ap = ChronoAudioEngine.prototype;
    ap.setZoneAudio = function (music, amb) {
      const map = { town: 'ashenvale_bastion', catacombs: 'bestiary_catacombs', breach: 'astral_breach', citadel: 'boss_citadel' };
      this._forcedMusic = music;
      this.setZone(map[amb] || 'ashenvale_bastion');
      if (this.ctx && !this.bossActive) this._crossfadeMusic(music);
    };
    const origZoneTrack = ap._zoneTrack;
    ap._zoneTrack = function (zone) { return this._forcedMusic || origZoneTrack.call(this, zone); };
    const origStep = ap.playFootstep;
    ap.playFootstep = function (zone) {
      const surf = ['grass', 'stone', 'metal', 'gravel'].includes(zone) ? zone : null;
      if (!surf) return origStep.call(this, zone);
      if (!this.ctx || this.muted) return;
      const idx = this._lastStepIdx[surf] === 1 ? 2 : 1;
      this._lastStepIdx[surf] = idx;
      this.playSample(`step_${surf}_${idx}`, 0.92 + Math.random() * 0.16, 0.3 + Math.random() * 0.06);
    };
  }

  window.MMOWorldGen = WorldGen;
})();
