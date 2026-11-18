/* =============================================================================
 * Chrono-Rift — anime character shading (Three.js r128, onBeforeCompile)
 *
 * Patches every hero / NPC / monster material (all skinned MeshStandardMaterial,
 * with or without texture maps and vertex colours). Only FRAGMENT lighting is
 * touched, so skinning, morphs, vertex colours, maps, hit-flash emissive, elite
 * tints and the terrain vertex hook keep working unchanged.
 *
 *  1) Crisp 2-step cel ramp: the direct-light N·L term is replaced by a
 *     smoothstep with a narrow, slightly feathered terminator (no PBR falloff).
 *     PBR specular is toned way down so surfaces read as flat painted colour.
 *  2) Shadow side is tinted cool indigo/violet (ambient multiplied by a violet
 *     tint where the ramp is dark); the lit side gets a subtle warm sunlight
 *     multiply that fades out at night.
 *  3) View-dependent Fresnel rim along the silhouette, brighter on the side
 *     facing AWAY from the sun and when the hero is backlit.
 *
 * All patched materials share ONE hook function (same program cache key) and
 * one uniform block updated once per frame.
 * ============================================================================= */
(function () {
  'use strict';
  const AU = {
    uAnimeSunV: { value: new THREE.Vector3(0, 1, 0) },     // key light direction, view space
    uAnimeSunCol: { value: new THREE.Color(1, 1, 1) },
    uAnimeShadow: { value: new THREE.Color(0.66, 0.60, 1.0) },  // indigo / violet shadow tint
    uAnimeWarm: { value: new THREE.Color(1.08, 1.0, 0.9) },     // warm sunlight multiply
    uAnimeRim: { value: new THREE.Color(1.0, 0.86, 0.66) },
    uAnimeRimK: { value: 0.55 }
  };
  window.ANIME_UNIFORMS = AU;

  const DOT_DIRECT = 'float dotNL = saturate( dot( geometry.normal, directLight.direction ) );';
  const RAMP_DIRECT = 'float dotNL = animeRamp( dot( geometry.normal, directLight.direction ) );';

  const PARS = `
    uniform vec3 uAnimeSunV;
    uniform vec3 uAnimeSunCol;
    uniform vec3 uAnimeShadow;
    uniform vec3 uAnimeWarm;
    uniform vec3 uAnimeRim;
    uniform float uAnimeRimK;
    // 2-step cel ramp with a slightly softened terminator
    float animeRamp(float ndl) { return smoothstep(0.02, 0.10, ndl); }
  `;

  const POST = `
    #include <aomap_fragment>
    {
      vec3 nV = normalize(normal);
      vec3 vV = normalize(vViewPosition);                // surface -> camera (view space)
      float lit = animeRamp(dot(nV, uAnimeSunV));
      // painted look: very little PBR sheen
      reflectedLight.directSpecular *= 0.3;
      reflectedLight.indirectSpecular *= 0.4;
      // lit side: subtle warm sunlight; shadow side: cool indigo ambient
      reflectedLight.directDiffuse *= uAnimeWarm;
      reflectedLight.indirectDiffuse *= mix(uAnimeShadow, vec3(1.0), lit);
      // Fresnel rim: stronger on the side turned away from the sun and when backlit
      float fres = pow(1.0 - clamp(dot(nV, vV), 0.0, 1.0), 3.0);
      float awayFromSun = 1.0 - lit;
      float backlit = clamp(-dot(vV, uAnimeSunV), 0.0, 1.0);
      float rimMask = smoothstep(0.35, 0.75, fres) * (0.35 + 0.65 * awayFromSun) * (0.7 + 0.8 * backlit);
      totalEmissiveRadiance += (uAnimeRim * 0.6 + uAnimeSunCol * 0.4) * rimMask * uAnimeRimK;
    }`;

  // one shared hook -> one shared program per material variant
  function animeHook(shader, renderer) {
    if (window.injectTerrain) window.injectTerrain(shader, this);
    Object.assign(shader.uniforms, AU);
    const physPars = THREE.ShaderChunk.lights_physical_pars_fragment;
    if (physPars.indexOf(DOT_DIRECT) < 0) return;          // unexpected three.js build: leave untouched
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <lights_physical_pars_fragment>', physPars.replace(DOT_DIRECT, RAMP_DIRECT))
      .replace('#include <aomap_fragment>', POST);
  }

  function makeAnime(mat) {
    if (!mat || !mat.isMeshStandardMaterial || mat.userData.anime) return;
    mat.userData.anime = true;
    const prev = mat.onBeforeCompile;
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) {
      // a custom hook already exists: chain it (separate program, still correct)
      mat.onBeforeCompile = function (shader, r) { prev.call(this, shader, r); animeHook.call(this, shader, r); };
    } else {
      mat.onBeforeCompile = animeHook;
    }
    // PBR values that fight a cel look
    mat.roughness = Math.max(mat.roughness, 0.7);
    mat.metalness = Math.min(mat.metalness, 0.25);
    mat.needsUpdate = true;
  }

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { upgradeEntityToGLB: GP.upgradeEntityToGLB, updateMMOWorld: GP.updateMMOWorld, attachWeaponsToEntity: GP.attachWeaponsToEntity };
  const _d = new THREE.Vector3();

  Object.assign(GP, {
    upgradeEntityToGLB(entity, modelKey, scale) {
      const r = orig.upgradeEntityToGLB.apply(this, arguments);
      if (entity && entity.materials) entity.materials.forEach(makeAnime);
      // characters use the terrain-fitted contact shadows (mmo_grounding.js) now;
      // drop the old flat blob so they don't double up
      if (entity && entity.meshRoot && this.contactShadowMat && this.charAO) {
        for (let i = entity.meshRoot.children.length - 1; i >= 0; i--) {
          const c = entity.meshRoot.children[i];
          if (c.material === this.contactShadowMat) entity.meshRoot.remove(c);
        }
      }
      return r;
    },

    // Weapons/shields are clones of shared cache models (materials shared across
    // every hero holding them): patch those shared materials once.
    attachWeaponsToEntity(entity) {
      const r = orig.attachWeaponsToEntity.apply(this, arguments);
      if (entity && entity.meshRoot) {
        entity.meshRoot.traverse((o) => {
          if (!o.userData || !o.userData.isAttachedWeapon) return;
          o.traverse((c) => {
            if (c.isMesh && c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(makeAnime);
          });
        });
      }
      return r;
    },

    updateAnimeShading() {
      const sl = this.sunLight;
      if (!sl || !this.camera) return;
      _d.copy(sl.position).sub(sl.target.position);
      if (_d.lengthSq() < 1e-6) _d.set(0, 1, 0);
      _d.normalize().transformDirection(this.camera.matrixWorldInverse);
      AU.uAnimeSunV.value.copy(_d);
      AU.uAnimeSunCol.value.copy(sl.color).multiplyScalar(Math.min(1.5, sl.intensity * 0.6));
      const night = this.skyUniforms && this.skyUniforms.uNight ? this.skyUniforms.uNight.value : 0;
      // warm multiply fades to neutral at night; shadows a touch bluer
      AU.uAnimeWarm.value.setRGB(1.08 - 0.08 * night, 1.0, 0.9 + 0.1 * night);
      AU.uAnimeShadow.value.setRGB(0.66 - 0.08 * night, 0.60 - 0.04 * night, 1.0);
      AU.uAnimeRimK.value = 0.55 + 0.25 * night;            // silhouettes pop more under moonlight
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      this.updateAnimeShading();
    }
  });

  // Entities built before this script loaded (unlikely) get patched on first update
  const origInit = GP.initMMOWorld;
  GP.initMMOWorld = function () {
    origInit.call(this);
    const all = [this.player].concat(this.townNPCs || [], this.monsters || [], this.aiAllies || []);
    all.forEach((e) => {
      if (!e) return;
      if (e.materials) e.materials.forEach(makeAnime);
      if (e.meshRoot && this.contactShadowMat && this.charAO) {
        for (let i = e.meshRoot.children.length - 1; i >= 0; i--) {
          if (e.meshRoot.children[i].material === this.contactShadowMat) e.meshRoot.remove(e.meshRoot.children[i]);
        }
      }
    });
  };
})();
