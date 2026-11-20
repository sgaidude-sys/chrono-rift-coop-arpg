/* =============================================================================
 * Chrono-Rift — flashy gear
 *
 *  • Weapons glow by rarity: Rare a soft glow, Epic a stronger glow and drifting
 *    sparks, Legendary a pulsing glow with embers, Mythic a hot pulsing core with
 *    crackling sparks. Swing trails take the weapon's rarity colour (Epic+).
 *  • Legendary auras: every equipped legendary power adds its own small visual
 *    signature around the hero (e.g. Meteor Heart smoulders at the feet, Chain
 *    Storm crackles), plus a slow rune ring under the feet (orange, red for Mythic).
 *  • Equipping a Legendary / Mythic plays a short flourish.
 *  • Inventory: Epic / Legendary / Mythic items get animated, shining borders.
 *  • Co-op: weapon rarities and active powers ride along in the normal player
 *    state, so partners see your glow, trails and auras too.
 * ============================================================================= */
(function () {
  'use strict';
  const GP = ChronoRiftCoOpGame.prototype;
  const M = window.MMO;
  const RIDX = {}; const RCOL = {};
  M.RARITIES.forEach((r, i) => { RIDX[r.id] = i; RCOL[r.id] = new THREE.Color(r.color).getHex(); });
  const R_RARE = RIDX.rare, R_EPIC = RIDX.epic, R_LEG = RIDX.legendary, R_MYTH = RIDX.mythic;
  const RID = M.RARITIES.map(r => r.id);
  const ARMOR_SLOTS = ['head', 'chest', 'hands', 'legs', 'feet'];
  const SKIP_MESH = /^(Eyes|Eyebrows|Hair_|Super[Hh]ero_)/;
  // which armor slot a hero mesh belongs to (by its part name)
  function meshSlot(n) {
    if (!n || SKIP_MESH.test(n)) return -1;
    if (/Helm|Horn|Hood|Hat|Crown|Halo|Plume/i.test(n)) return 0;
    if (/Belt|Legs/i.test(n)) return 3;
    if (/Feet|Boot/i.test(n)) return 4;
    if (/Arms|Bracer|Orb/i.test(n)) return 2;
    if (/Pauldron|Spike|Body|Cloak|Clasp|Quiver|Arrow|Fletch|Acc_/i.test(n)) return 1;
    return -1;
  }
  // cape cloth: dark body fading to the rarity colour, a bright trim at the hem and a faint sigil
  const CAPE_TEX = {};
  function capeTexture(col, rich) {
    const k = col + (rich ? 'r' : '');
    if (CAPE_TEX[k]) return CAPE_TEX[k];
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
    const x = cv.getContext('2d');
    const c = '#' + col.toString(16).padStart(6, '0');
    const gr = x.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#0d0a14'); gr.addColorStop(0.55, '#1c1428'); gr.addColorStop(0.92, c); gr.addColorStop(1, c);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 128);
    x.globalAlpha = 0.9; x.fillStyle = c; x.fillRect(0, 116, 64, 3);
    x.globalAlpha = 0.6; x.fillRect(4, 0, 2, 120); x.fillRect(58, 0, 2, 120);
    if (rich) { x.globalAlpha = 0.55; x.strokeStyle = c; x.lineWidth = 2; x.beginPath(); x.moveTo(32, 40); x.lineTo(44, 58); x.lineTo(32, 76); x.lineTo(20, 58); x.closePath(); x.stroke(); }
    const t = new THREE.CanvasTexture(cv);
    if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    CAPE_TEX[k] = t;
    return t;
  }
  const SLOT_BONES = [['Head'], ['spine_03', 'clavicle_l', 'clavicle_r'], ['hand_l', 'hand_r'], ['thigh_l', 'thigh_r'], ['foot_l', 'foot_r']];
  const ARMOR_TUNE = [
    null, { lerp: 0.06, em: 0.05, metal: 0.05 },                     // common, uncommon
    { lerp: 0.2, em: 0.16, metal: 0.15 },                             // rare
    { lerp: 0.32, em: 0.32, metal: 0.35, rough: 0.4 },                // epic
    { lerp: 0.42, em: 0.45, metal: 0.5, rough: 0.32, pulse: 0.2 },    // legendary
    { lerp: 0.5, em: 0.6, metal: 0.55, rough: 0.28, pulse: 0.35 }     // mythic
  ];


  // per-power aura signature: colour, where the particles appear, how they move
  const AURA = {
    skybreaker: { c: [0x9fd8ff, 0xffffff], at: 'body', grav: -4, sp: [1, 2.5] },
    meteorheart: { c: [0xff5a1a, 0xffb35c], at: 'feet', grav: -2.5, sp: [0.5, 1.6] },
    juggler: { c: [0x7fe3ff, 0xffffff], at: 'orbit', grav: -1, sp: [0.4, 1] },
    executioner: { c: [0x8a0f1f, 0xff3b5c], at: 'feet', grav: -1.5, sp: [0.3, 1] },
    chainstorm: { c: [0x8fd8ff, 0xe8f6ff], at: 'body', grav: 0, sp: [3, 6], crackle: true },
    phantomstep: { c: [0xb266ff, 0xe0c2ff], at: 'feet', grav: -1.5, sp: [0.5, 1.5] },
    aegis: { c: [0xf3c86b, 0xfff1c2], at: 'orbit', grav: -0.5, sp: [0.3, 0.8] },
    secondwind: { c: [0x7dffb0, 0xffffff], at: 'body', grav: -2, sp: [0.4, 1.2] },
    stormrunner: { c: [0x6fc8ff, 0xffffff], at: 'feet', grav: 0, sp: [2.5, 5], crackle: true },
    bloodthirst: { c: [0xc4142c, 0xff6a7a], at: 'body', grav: 3, sp: [0.5, 1.5] },
    overclock: { c: [0xff9a2e, 0xffe066], at: 'orbit', grav: -2, sp: [0.8, 2] },
    synergist: { c: [0x38e8ff, 0xb9f6ff], at: 'orbit', grav: -1, sp: [0.4, 1] },
    echocaster: { c: [0xc9a6ff, 0xffffff], at: 'body', grav: -1.5, sp: [0.4, 1.1] },
    huntersfocus: { c: [0xffd56b, 0xffffff], at: 'body', grav: -1, sp: [0.3, 0.9] }
  };

  const css = `
  .fl-epic { box-shadow: inset 0 0 10px rgba(178,102,255,.35), 0 0 8px rgba(178,102,255,.25) !important; }
  .fl-legendary, .fl-mythic { position: relative; overflow: hidden; }
  .fl-legendary { animation: flLeg 1.8s ease-in-out infinite alternate; }
  .fl-mythic { animation: flMyth 1.2s ease-in-out infinite alternate; }
  @keyframes flLeg { from { box-shadow: inset 0 0 8px rgba(255,154,46,.35), 0 0 6px rgba(255,154,46,.35); } to { box-shadow: inset 0 0 16px rgba(255,154,46,.6), 0 0 16px rgba(255,154,46,.65); } }
  @keyframes flMyth { from { box-shadow: inset 0 0 10px rgba(255,59,92,.45), 0 0 8px rgba(255,59,92,.4); } to { box-shadow: inset 0 0 20px rgba(255,90,209,.7), 0 0 20px rgba(255,59,92,.75); } }
  .fl-legendary::after, .fl-mythic::after { content: ''; position: absolute; top: -50%; left: -60%; width: 40%; height: 200%; pointer-events: none;
    background: linear-gradient(100deg, transparent, rgba(255,255,255,.28), transparent); transform: rotate(12deg); animation: flSweep 2.8s ease-in-out infinite; }
  .fl-mythic::after { animation-duration: 1.9s; background: linear-gradient(100deg, transparent, rgba(255,200,230,.38), transparent); }
  @keyframes flSweep { 0% { left: -60%; } 55%, 100% { left: 130%; } }
  `;

  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, updateWeaponTrails: GP.updateWeaponTrails,
    renderInventoryModal: GP.renderInventoryModal, equipItem: GP.equipItem,
    buildPlayerStatePayload: GP.buildPlayerStatePayload, handleRemotePlayerState: GP.handleRemotePlayerState
  };
  const _v = new THREE.Vector3(), _b = new THREE.Box3(), _c = new THREE.Color();

  Object.assign(GP, {
    initMMOWorld() {
      const r = orig.initMMOWorld ? orig.initMMOWorld.apply(this, arguments) : undefined;
      if (!document.getElementById('cr-flair-css')) {
        const s = document.createElement('style'); s.id = 'cr-flair-css'; s.textContent = css; document.head.appendChild(s);
      }
      return r;
    },

    // what an entity is wearing: { w: rarity idx, o: rarity idx, wm: model, om: model, pw: [powers], myth: bool }
    flairOf(ent) {
      if (ent === this.player) {
        const eq = (this.mmoState && this.mmoState.equip) || {};
        const w = eq.weapon, o = eq.offhand;
        const pw = this._legend ? Object.keys(this._legend) : [];
        const myth = !!(this._legend && Object.values(this._legend).some(k => k > 1));
        const a = ARMOR_SLOTS.map(sl => (eq[sl] ? RIDX[eq[sl].rarity] : 0));
        return { w: w ? RIDX[w.rarity] : 0, o: o ? RIDX[o.rarity] : 0, wm: w ? w.model : '', om: o ? o.model : '', pw, myth, a };
      }
      const f = ent._flairNet;
      if (!f) return null;
      return { w: f.w || 0, o: f.o || 0, wm: ent.weaponId || '', om: ent.offhandId || '', pw: f.pw || [], myth: !!f.m, a: Array.isArray(f.a) ? f.a : [0, 0, 0, 0, 0] };
    },

    // ---- weapons ----------------------------------------------------------------------------------
    flairScan(ent, F) {
      const st = ent._flair || (ent._flair = { holders: [], ring: null, emb: 0, aura: 0, key: '' });
      const key = `${F.w}|${F.o}|${F.wm}|${F.om}|${F.pw.join(',')}|${F.myth}`;
      const fresh = st.holders.length && st.holders.every(h => h.holder.parent);
      if (st.key === key && fresh) return st;
      st.key = key;
      st.holders = [];
      if (!ent.meshRoot) return st;
      const found = [];
      ent.meshRoot.traverse((o) => { if (o.userData && o.userData.isAttachedWeapon) found.push(o); });
      found.forEach((holder) => {
        const wid = holder.userData.weaponId;
        const r = wid && wid === F.wm ? F.w : (wid && wid === F.om ? F.o : 0);
        const mats = [];
        holder.traverse((c) => {
          if (!c.isMesh || !c.material) return;
          if (!c.userData.flairOwn) {
            c.material = Array.isArray(c.material) ? c.material.map(m => m.clone()) : c.material.clone();
            c.userData.flairOwn = true;
          }
          (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => {
            if (!m.emissive) return;
            if (!m.userData.flBase) m.userData.flBase = { e: m.emissive.getHex(), i: m.emissiveIntensity };
            mats.push(m);
          });
        });
        if (r >= R_RARE) {
          const col = RCOL[RID[r]];
          mats.forEach((m) => { m.emissive.setHex(col); m.emissiveIntensity = r >= R_LEG ? 0.8 : (r >= R_EPIC ? 0.55 : 0.35); });
        } else mats.forEach((m) => { m.emissive.setHex(m.userData.flBase.e); m.emissiveIntensity = m.userData.flBase.i; });
        st.holders.push({ holder, mats, r });
      });
      // rune ring under the feet for any legendary power
      if (st.ring) { if (st.ring.parent) st.ring.parent.remove(st.ring); st.ring.geometry.dispose(); st.ring.material.dispose(); st.ring = null; }
      if (F.pw.length && ent.meshRoot) {
        const g = new THREE.RingGeometry(1.0, 1.12, 6, 1);
        const ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: F.myth ? 0xff3b5c : 0xff9a2e, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.renderOrder = 5;
        ent.meshRoot.add(ring);
        st.ring = ring;
      }
      return st;
    },

    flairTick(ent, dt, t) {
      const F = this.flairOf(ent);
      if (!F || !ent.meshRoot || !ent.meshRoot.visible || ent.dead) return;
      const st = (ent._flair && ent._flairScanT > 0) ? ent._flair : this.flairScan(ent, F);
      ent._flairScanT = (ent._flairScanT || 0) - dt;
      if (ent._flairScanT <= 0) { ent._flairScanT = 0.5; this.flairScan(ent, F); }
      // pulsing glow + embers from the weapon
      st.emb -= dt;
      const emit = st.emb <= 0;
      if (emit) st.emb = 0.16;
      for (let i = 0; i < st.holders.length; i++) {
        const h = st.holders[i];
        if (h.r < R_EPIC) continue;
        const myth = h.r >= R_MYTH;
        if (h.r >= R_LEG) {
          const k = myth ? 0.75 + 0.45 * Math.abs(Math.sin(t * 5.5)) : 0.55 + 0.3 * Math.sin(t * 3);
          for (let j = 0; j < h.mats.length; j++) h.mats[j].emissiveIntensity = k;
        }
        if (emit && this.vfxSparks && (h.r >= R_LEG || Math.random() < 0.5)) {
          _b.setFromObject(h.holder);
          if (_b.isEmpty()) continue;
          _b.getCenter(_v);
          _v.x += (Math.random() - 0.5) * 0.3; _v.y += (Math.random() - 0.3) * 0.5; _v.z += (Math.random() - 0.5) * 0.3;
          const col = RCOL[RID[h.r]];
          this.vfxSparks(_v, myth ? 3 : 2, { cols: myth ? [col, 0xff9ad8, 0xffffff] : [col, 0xffffff], speed: myth ? [1.5, 3.5] : [0.5, 1.6], life: [0.35, 0.7], grav: myth ? 0 : -2.5, width: 0.035 });
        }
      }
      this.armorTick(ent, F, dt, t);
      // legendary ring + power auras
      if (st.ring) { st.ring.rotation.z += dt * 0.8; st.ring.material.opacity = 0.5 + 0.2 * Math.sin(t * 2.4); }
      if (F.pw.length && this.vfxSparks) {
        st.aura -= dt;
        if (st.aura <= 0) {
          st.aura = 0.3;
          const pw = F.pw[Math.floor(Math.random() * F.pw.length)];
          const A = AURA[pw];
          if (A) {
            const p = ent.pos, h = (ent.desiredHeight || 1.8);
            if (A.at === 'feet') _v.set(p.x + (Math.random() - 0.5) * 0.9, (p.y || 0) + 0.1, p.z + (Math.random() - 0.5) * 0.9);
            else if (A.at === 'orbit') { const a = t * 2.2 + Math.random() * 0.4; _v.set(p.x + Math.cos(a) * 0.8, (p.y || 0) + 1.1, p.z + Math.sin(a) * 0.8); }
            else _v.set(p.x + (Math.random() - 0.5) * 0.6, (p.y || 0) + 0.6 + Math.random() * h * 0.6, p.z + (Math.random() - 0.5) * 0.6);
            this.vfxSparks(_v, A.crackle ? 4 : 3, { cols: A.c, speed: A.sp, life: A.crackle ? [0.12, 0.25] : [0.5, 0.9], grav: A.grav, width: A.crackle ? 0.03 : 0.045 });
          }
        }
      }
    },

    // ---- armor: each hero part takes the look of the item worn in its slot ------------------------
    armorScan(ent, F) {
      const A = ent._armor || (ent._armor = { parts: [], bones: {}, key: '', cape: null, halo: null, emit: 0 });
      const glb = ent.glbNode || ent.meshRoot;
      const key = F.a.join(',') + '|' + (glb ? glb.uuid : '');
      if (A.key === key && A.parts.every(pt => pt.mesh.parent)) return A;
      A.key = key; A.parts = []; A.bones = {};
      if (!ent.meshRoot) return A;
      let hasCloak = false;
      ent.meshRoot.traverse((o) => {
        if (o.isBone) A.bones[o.name] = o;
        if (!o.isMesh || !o.material) return;
        let q = o.parent, inWeapon = false;
        while (q && q !== ent.meshRoot) { if (q.userData && q.userData.isAttachedWeapon) { inWeapon = true; break; } q = q.parent; }
        if (inWeapon || o.userData.flairFx) return;
        const sl = meshSlot(o.name);
        if (sl < 0) return;
        if (/Cloak/i.test(o.name)) hasCloak = true;
        if (!o.userData.flairOwn) { o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); o.userData.flairOwn = true; }
        const mats = (Array.isArray(o.material) ? o.material : [o.material]).filter(m => m && m.color);
        mats.forEach((m) => {
          if (!m.userData.arBase) m.userData.arBase = { c: m.color.getHex(), e: m.emissive ? m.emissive.getHex() : 0, ei: m.emissiveIntensity || 1, mt: m.metalness, rg: m.roughness };
          const b = m.userData.arBase, r = F.a[sl] || 0, T = ARMOR_TUNE[r];
          m.color.setHex(b.c);
          if (m.emissive) { m.emissive.setHex(b.e); m.emissiveIntensity = b.ei; }
          if (m.metalness !== undefined) m.metalness = b.mt;
          if (m.roughness !== undefined) m.roughness = b.rg;
          if (T) {
            const col = RCOL[RID[r]];
            m.color.lerp(_c.setHex(col), T.lerp);
            if (m.emissive) { m.emissive.setHex(col); m.emissiveIntensity = T.em; }
            if (m.metalness !== undefined) m.metalness = Math.max(b.mt || 0, T.metal);
            if (T.rough !== undefined && m.roughness !== undefined) m.roughness = Math.min(b.rg === undefined ? 1 : b.rg, T.rough);
          }
        });
        A.parts.push({ mesh: o, mats, sl });
      });
      // cape for an epic+ chest (heroes that already wear a cloak keep theirs)
      const chest = F.a[1] || 0;
      if (A.cape) { this.scene.remove(A.cape); A.cape.geometry.dispose(); A.cape.material.dispose(); A.cape = null; }
      if (chest >= R_EPIC && !hasCloak && A.bones.spine_03) {
        const g = new THREE.PlaneGeometry(0.62, 1.0, 4, 10); g.translate(0, -0.5, 0);
        const gp = g.attributes.position;
        for (let i = 0; i < gp.count; i++) { const d = -gp.getY(i); gp.setX(i, gp.getX(i) * (0.62 + 0.5 * d)); }   // narrow at the shoulders, flared hem
        const col = RCOL[RID[chest]];
        const tex = capeTexture(col, chest >= R_LEG);
        const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: chest >= R_LEG ? 0.55 : 0.3, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
        A.cape = new THREE.Mesh(g, mat); A.cape.userData.flairFx = true; A.cape.castShadow = true;
        A.cape.userData.base = Float32Array.from(g.attributes.position.array);
        this.scene.add(A.cape);
      }
      // floating crown halo for a legendary+ helm
      const head = F.a[0] || 0;
      if (A.halo) { this.scene.remove(A.halo); A.halo.geometry.dispose(); A.halo.material.dispose(); A.halo = null; }
      if (head >= R_LEG && A.bones.Head) {
        const col = RCOL[RID[head]];
        A.halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        A.halo.rotation.x = Math.PI / 2; A.halo.userData.flairFx = true;
        this.scene.add(A.halo);
      }
      return A;
    },

    armorTick(ent, F, dt, t) {
      if (!F.a) return;
      const A = this.armorScan(ent, F);
      // pulse legendary / mythic pieces
      for (let i = 0; i < A.parts.length; i++) {
        const pt = A.parts[i], r = F.a[pt.sl] || 0, T = ARMOR_TUNE[r];
        if (!T || !T.pulse) continue;
        const k = T.em + T.pulse * Math.sin(t * (r >= R_MYTH ? 5 : 2.6) + pt.sl);
        for (let j = 0; j < pt.mats.length; j++) if (pt.mats[j].emissive) pt.mats[j].emissiveIntensity = k;
      }
      // sparks from legendary+ pieces
      A.emit -= dt;
      if (A.emit <= 0 && this.vfxSparks) {
        A.emit = 0.22;
        const hot = [];
        for (let s = 0; s < 5; s++) if ((F.a[s] || 0) >= R_LEG) hot.push(s);
        if (hot.length) {
          const s = hot[Math.floor(Math.random() * hot.length)];
          const names = SLOT_BONES[s], bone = A.bones[names[Math.floor(Math.random() * names.length)]];
          if (bone) {
            bone.getWorldPosition(_v);
            const col = RCOL[RID[F.a[s]]];
            this.vfxSparks(_v, F.a[s] >= R_MYTH ? 3 : 2, { cols: [col, 0xffffff], speed: [0.4, 1.4], life: [0.4, 0.8], grav: -2.5, width: 0.04 });
          }
        }
      }
      // cape follows the back and sways (lifts while moving)
      if (A.cape && A.bones.spine_03) {
        A.bones.spine_03.getWorldPosition(_v);
        const fx = Math.sin(ent.yaw || 0), fz = Math.cos(ent.yaw || 0);
        A.cape.position.set(_v.x - fx * 0.17, _v.y + 0.12, _v.z - fz * 0.17);
        A.cape.rotation.set(0, ent.yaw || 0, 0);
        A.cape.visible = !!(ent.meshRoot && ent.meshRoot.visible) && !ent.dead && !ent._mount;
        const moving = !!(ent.isMovingNow || ent.isMoving || (ent === this.player && this.keys && (this.keys.w || this.keys.a || this.keys.s || this.keys.d)));
        const lift = moving ? 0.55 : 0.12;
        A._lift = (A._lift || 0) + (lift - (A._lift || 0)) * Math.min(1, dt * 4);
        const pos = A.cape.geometry.attributes.position, base = A.cape.userData.base;
        for (let i = 0; i < pos.count; i++) {
          const y = base[i * 3 + 1], d = -y;                         // 0 at the shoulders, ~1 at the hem
          const wave = Math.sin(t * (moving ? 9 : 3) + d * 4 + base[i * 3] * 3) * 0.05 * d;
          pos.setZ(i, -(A._lift * d * d * 0.9) + wave);
          pos.setY(i, y * (1 - A._lift * 0.25 * d));
        }
        pos.needsUpdate = true;
        A.cape.geometry.computeVertexNormals();
      }
      if (A.halo && A.bones.Head) {
        A.bones.Head.getWorldPosition(_v);
        A.halo.position.set(_v.x, _v.y + 0.42 + Math.sin(t * 2) * 0.03, _v.z);
        A.halo.rotation.z += dt * 1.5;
        A.halo.visible = !!(ent.meshRoot && ent.meshRoot.visible) && !ent.dead;
      }
    },

    // swing trails take the weapon's rarity colour (Epic and up)
    updateWeaponTrails() {
      if (orig.updateWeaponTrails) orig.updateWeaponTrails.apply(this, arguments);
      if (!this._trails) return;
      for (let i = 0; i < this._trails.length; i++) {
        const tr = this._trails[i], ent = tr.owner;
        if (!ent || (ent._elemCast && ent._elemCast.el)) continue;
        const F = this.flairOf(ent);
        if (!F || F.w < R_EPIC) continue;
        _c.setHex(RCOL[RID[F.w]]);
        tr.uniforms.uColor.value.lerp(_c, F.w >= R_LEG ? 0.75 : 0.5);
        if (tr.uniforms.uAlpha) tr.uniforms.uAlpha.value = Math.max(tr.uniforms.uAlpha.value || 1, F.w >= R_MYTH ? 1.7 : (F.w >= R_LEG ? 1.45 : 1.2));
      }
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (!this.isInWorld || !this.player) return;
      const t = performance.now() / 1000;
      try {
        this.flairTick(this.player, dt, t);
        if (this.remotePeers) {
          const p0 = this.player.pos;
          this.remotePeers.forEach((pe) => { if (pe && pe.pos && pe.pos.distanceToSquared(p0) < 1600) this.flairTick(pe, dt, t); });
        }
      } catch (e) { if (!this._flairErr) { this._flairErr = 1; console.warn('[flair]', e); } }
    },

    // ---- equip flourish -------------------------------------------------------------------------------
    equipItem(uidStr) {
      const st = this.mmoState;
      const it = st && st.bag.find(i => i.uid === uidStr);
      const r = orig.equipItem.apply(this, arguments);
      if (it && st.equip[it.slot] === it && RIDX[it.rarity] >= R_LEG) {
        const p = this.player, myth = it.rarity === 'mythic';
        const col = RCOL[it.rarity];
        if (this.vfxPillar) this.vfxPillar(_v.set(p.pos.x, 0, p.pos.z), 12, 1.3, col, 0xffffff, 0);
        if (this.vfxShock) this.vfxShock(_v.set(p.pos.x, 0, p.pos.z), 4, 2, col, 0xffffff, { r0: 0.5, dur: 0.5 });
        if (this.vfxSparks) this.vfxSparks(_v.set(p.pos.x, 1.2, p.pos.z), 30, { cols: [col, 0xffffff], speed: [3, 8], life: [0.4, 0.8], grav: 5, width: 0.05, upBias: 0.7 });
        const pw = it.power && window.CR_LEGEND && window.CR_LEGEND.POWERS[it.power];
        this.spawnFloatingText(p.pos.clone().add(_v.set(0, 2.8, 0)), `${myth ? 'MYTHIC' : 'LEGENDARY'} EQUIPPED${pw ? ' — ' + pw.name : ''}`, myth ? '#ff6a8a' : '#ffb35c', 17);
        if (this.audio && this.audio.playLootChime) this.audio.playLootChime();
        if (this.player._flair) this.player._flair.key = '';
      }
      return r;
    },

    // ---- inventory shine ------------------------------------------------------------------------------
    renderInventoryModal() {
      const r = orig.renderInventoryModal.apply(this, arguments);
      const st = this.mmoState; if (!st) return r;
      const byUid = {};
      st.bag.forEach(i => { byUid[i.uid] = i; });
      Object.values(st.equip || {}).forEach(i => { if (i) byUid[i.uid] = i; });
      document.querySelectorAll('#inventory-modal [onmouseenter*="showItemTip"]').forEach((el) => {
        const m = /showItemTip\('([^']+)'/.exec(el.getAttribute('onmouseenter') || '');
        const it = m && byUid[m[1]];
        el.classList.remove('fl-epic', 'fl-legendary', 'fl-mythic');
        if (it && RIDX[it.rarity] >= R_EPIC) el.classList.add('fl-' + it.rarity);
      });
      return r;
    },

    // ---- co-op: share rarities and powers -------------------------------------------------------------------
    buildPlayerStatePayload() {
      const p = orig.buildPlayerStatePayload.apply(this, arguments);
      try {
        const F = this.flairOf(this.player);
        if (p && F) p.fl = { w: F.w, o: F.o, pw: F.pw.slice(0, 6), m: F.myth ? 1 : 0, a: F.a };
      } catch (e) { /* cosmetic only */ }
      return p;
    },

    handleRemotePlayerState(p, fromPresence) {
      const r = orig.handleRemotePlayerState.apply(this, arguments);
      if (p && p.fl && p.id && this.remotePeers) {
        const peer = this.remotePeers.get(p.id);
        if (peer) peer._flairNet = p.fl;
      }
      return r;
    }
  });
})();
