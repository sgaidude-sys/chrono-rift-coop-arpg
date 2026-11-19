/* =============================================================================
 * Chrono-Rift — hand-made boss models (Sketchfab, CC BY 4.0)
 *
 *  Swaps selected bosses to richer, textured, fully animated models. Each model
 *  is loaded lazily the first time its boss spawns, normalised to height 1 with
 *  its feet at y = 0 and facing +z (so the existing desiredHeight scaling,
 *  nameplates, hit flashes and anime shading all keep working), and its clips
 *  are mapped onto the names the boss AI plays:
 *      Idle_Loop · Jog_Fwd_Loop/Walk_Loop · Sword_Attack · Sword_Heavy_Combo ·
 *      Taunt · Hit_Chest · Death01
 *  Credits: public/assets/models/bosses/CREDITS.txt
 * ============================================================================= */
(function () {
  'use strict';
  const M = window.MMO;
  const DEFS = {
    'sf/mycelord': {
      file: 'mycelord.glb', zone: 'meadows', rotY: 0, tint: null,
      clips: { Idle_Loop: 'Idle', Jog_Fwd_Loop: 'Walk', Walk_Loop: 'Walk', Sword_Attack: 'Attack', Sword_Heavy_Combo: 'Attack', Taunt: 'Attack', Hit_Chest: 'Idle', Death01: 'Die' }
    },
    'sf/frostmaw': {
      file: 'frostmaw_golem.glb', zone: 'frostpeak', rotY: 0, tint: [0xd6f0ff, 0.35],
      clips: { Idle_Loop: 'Idle', Jog_Fwd_Loop: 'Walk', Walk_Loop: 'Walk', Sword_Attack: 'Attack1', Sword_Heavy_Combo: 'Attack3', Taunt: 'Attack2', Hit_Chest: 'Defence1', Death01: 'Defence3' }
    }
  };
  // point the zone bosses at the new models (every client runs this, so co-op stays in sync)
  if (M && M.ZONES) Object.keys(DEFS).forEach((key) => {
    const z = M.ZONES.find(zz => zz.id === DEFS[key].zone);
    if (z && z.boss && new URLSearchParams(location.search).get('bossmodels') !== 'off') { z.boss.model = key; delete z.boss.legacy; }
  });

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { ensureMobModel: GP.ensureMobModel, playEntityAnim: GP.playEntityAnim };
  // Monsters must never borrow a HERO locomotion clip: its hip height comes from the hero
  // skeleton and lifts bigger rigs off the ground (Gronk floated ~1.5 m while walking).
  const LOCO = { Walk_Loop: ['Walk_Loop', 'Zombie_Walk_Fwd_Loop', 'Jog_Fwd_Loop'], Jog_Fwd_Loop: ['Jog_Fwd_Loop', 'Walk_Loop', 'Zombie_Walk_Fwd_Loop'], Sprint_Loop: ['Jog_Fwd_Loop', 'Walk_Loop'] };

  function skinnedBox(root) {
    root.updateMatrixWorld(true);
    const b = new THREE.Box3(), v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const pos = o.geometry.attributes.position, st = Math.max(1, Math.floor(pos.count / 4000));
      for (let i = 0; i < pos.count; i += st) {
        v.fromBufferAttribute(pos, i);
        if (o.isSkinnedMesh) o.boneTransform(i, v);
        v.applyMatrix4(o.matrixWorld);
        b.expandByPoint(v);
      }
    });
    return b;
  }

  Object.assign(GP, {
    playEntityAnim(entity, name, force) {
      const mk = entity && entity.modelKey;
      if (mk && LOCO[name] && (entity.typeKey || entity.isBoss) && this.modelAnimClips) {
        const own = this.modelAnimClips[mk];
        if (own && !own[name]) {
          const alt = LOCO[name].find(n => own[n]);
          name = alt || (own.Idle_Loop ? 'Idle_Loop' : name);
        }
      }
      return orig.playEntityAnim.call(this, entity, name, force);
    },

    ensureMobModel(key, cb) {
      const d = DEFS[key];
      if (!d) return orig.ensureMobModel.call(this, key, cb);
      if (this.modelCache[key]) { cb(true); return; }
      this._bossModelWait = this._bossModelWait || {};
      if (this._bossModelWait[key]) { this._bossModelWait[key].push(cb); return; }
      this._bossModelWait[key] = [cb];
      const done = (ok) => { const w = this._bossModelWait[key]; delete this._bossModelWait[key]; w.forEach(f => f(ok)); };
      const base = ((document.querySelector('script[src*="mmo_bossmodels.js"]') || {}).src || '').replace(/js\/mmo_bossmodels\.js.*$/, '') + 'models/bosses/';
      (this.loader || new THREE.GLTFLoader()).load(base + d.file, (gltf) => {
        try {
          const scene = gltf.scene;
          scene.traverse((o) => { o.frustumCulled = false; if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
          // measure in the idle pose, then normalise: height 1, feet on y = 0, centred, facing +z
          const byName = {};
          gltf.animations.forEach((c) => { byName[c.name] = c; });
          const idle = byName[d.clips.Idle_Loop] || gltf.animations[0];
          if (idle) { const mx = new THREE.AnimationMixer(scene); mx.clipAction(idle).play(); mx.update(0.2); }
          const norm = new THREE.Group(); norm.name = 'crBossNorm';
          norm.rotation.y = d.rotY || 0;
          norm.add(scene);
          const wrap = new THREE.Group(); wrap.name = 'crBossRoot'; wrap.add(norm);
          let b = skinnedBox(wrap);
          const h = Math.max(1e-4, b.max.y - b.min.y);
          norm.scale.setScalar(1 / h);
          b = skinnedBox(wrap);
          norm.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
          wrap.userData.rawHeight = 1; wrap.userData.minY = 0;
          if (d.tint) {
            const tc = new THREE.Color(d.tint[0]);
            scene.traverse((o) => { if (o.isMesh && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((mt) => { if (mt.color) mt.color.lerp(tc, d.tint[1]); }); });
          }
          this.modelCache[key] = wrap;
          const clips = {};
          Object.keys(d.clips).forEach((k) => { if (byName[d.clips[k]]) clips[k] = byName[d.clips[k]]; });
          clips.idle = clips.Idle_Loop || gltf.animations[0];
          this.modelAnimClips = this.modelAnimClips || {};
          this.modelAnimClips[key] = clips;
          done(true);
        } catch (e) { console.warn('[BossModels]', key, e); done(false); }
      }, undefined, (e) => { console.warn('[BossModels] failed to load', d.file, e); done(false); });
    }
  });

  window.CR_BOSSMODELS = { DEFS };
})();
