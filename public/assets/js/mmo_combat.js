/* =============================================================================
 * Chrono-Rift — Souls-like action combat layer
 *
 *  Controls:  Space = dodge roll (directional; backstep when standing still)
 *             Right mouse / G (hold) = block; press just before a hit = PERFECT PARRY
 *             Alt = jump.   Right-mouse drag still orbits the camera.
 *
 *  1) Dodge roll: 0.42 s dash, 0.25 s of i-frames (player.dodgeTimer, honoured by
 *     every hit check incl. boss AoE), afterimage trail, costs stamina.
 *     Input buffer: attacks / dodges pressed up to 0.3 s early are queued and fire
 *     the moment the hero can act.
 *  2) Block & parry: holding block cuts damage to 25% for stamina (guard breaks at
 *     0 stamina). Pressing block <= 0.18 s before a strike lands = Perfect Parry:
 *     no damage, golden sparks + metallic ring, 50 ms hit-stop, heavy posture
 *     damage to the attacker; parried arrows are reflected.
 *  3) Posture: every enemy/boss has a posture bar (nameplate + boss HUD). Hits and
 *     parries fill it, it drains when left alone; full = 3 s stagger, and the next
 *     hit is a CRITICAL RIPOSTE (x3, bosses x2.5).
 *  4) Telegraphs: enemy wind-ups hold a slowed "coiled" anticipation pose, flash a
 *     golden glint 0.25 s before the hitbox goes live, then snap through.
 *
 *  Multiplayer: parries / blocks / dodges resolve on the defending client (no
 *  added latency). Posture gains are batched to the host (`mob_posture`); the host
 *  decides staggers and broadcasts `mob_stagger`; riposte damage travels through
 *  the normal `mob_hit` path.
 * ============================================================================= */
(function () {
  'use strict';
  const PARRY_WINDOW = 0.18;     // s before impact that a block press counts as a parry
  const PARRY_LOCKOUT = 0.32;    // s before a missed parry press can open a new window
  const IFRAMES = 0.25;
  const ROLL_DUR = 0.55, ROLL_DIST = 5.6, ROLL_COST = 20;
  const BUFFER = 0.3;
  const STAGGER = 3.0;
  const GLINT_LEAD = 0.25;
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  const postureMax = (m) => m.isBoss ? 260 : (m.isElite ? 120 : 70);

  function starTexture() {
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,236,170,0.9)'); grd.addColorStop(0.5, 'rgba(255,200,90,0.25)'); grd.addColorStop(1, 'rgba(255,190,80,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(255,250,225,1)';
    [[64, 4, 6], [4, 64, 6]].forEach(([w, h]) => {
      g.beginPath(); g.ellipse(64, 64, w === 4 ? 4 : 60, w === 4 ? 60 : 4, 0, 0, Math.PI * 2); g.fill();
    });
    g.globalAlpha = 0.6;
    g.save(); g.translate(64, 64); g.rotate(Math.PI / 4);
    g.beginPath(); g.ellipse(0, 0, 34, 2.5, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(0, 0, 2.5, 34, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, updatePlayer: GP.updatePlayer,
    useSkill: GP.useSkill, playEntityAnim: GP.playEntityAnim, getMoveSpeedMult: GP.getMoveSpeedMult,
    applyDamageToMonster: GP.applyDamageToMonster, bossHit: GP.bossHit, runBossAbility: GP.runBossAbility,
    drawMobNameplate: GP.drawMobNameplate, jump: GP.jump
  };
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initCombat(); } catch (e) { console.warn('[Combat] init failed', e); }
    },

    initCombat() {
      this._combat = { buffer: null, postureOut: new Map(), postureFlushAt: 0 };
      // glint sprites (pool of 10)
      const tex = starTexture();
      this._glints = [];
      for (let i = 0; i < 10; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, color: 0xffe2a0 }));
        sp.visible = false; sp.renderOrder = 14;
        this.scene.add(sp);
        this._glints.push({ sp, t: 0 });
      }
      // boss posture bar
      const track = document.querySelector('#boss-hud .boss-hp-track');
      if (track && !document.getElementById('boss-posture-fill')) {
        const pt = document.createElement('div');
        pt.className = 'boss-posture-track';
        pt.style.cssText = 'height:6px;margin-top:4px;border-radius:2px;background:rgba(0,0,0,0.55);border:1px solid rgba(232,196,118,0.35);overflow:hidden;';
        pt.innerHTML = '<div id="boss-posture-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#c98a1c,#ffd56b,#fff2c4);box-shadow:0 0 8px rgba(255,213,107,0.7);transition:width 0.12s ease-out;"></div>';
        track.parentNode.insertBefore(pt, track.nextSibling);
      }
      this._bossPostureFill = document.getElementById('boss-posture-fill');
      // parry slot: hold on touch, tap on desktop click
      const slot = document.getElementById('slot-parry');
      if (slot && !slot._wired) {
        slot._wired = true;
        const down = (e) => { e.preventDefault(); this.startBlock(); };
        const up = (e) => { e.preventDefault(); this.endBlock(); };
        slot.addEventListener('pointerdown', down);
        slot.addEventListener('pointerup', up);
        slot.addEventListener('pointerleave', up);
        slot.addEventListener('pointercancel', up);
      }
      if (!document.getElementById('combat-style')) {
        const st = document.createElement('style');
        st.id = 'combat-style';
        st.textContent = `body.touch-ui #slot-parry { right: 58px; width: 50px !important; height: 50px !important; bottom: 170px; touch-action: none; }
          #slot-parry.blocking { border-color: #ffd56b !important; box-shadow: 0 0 14px rgba(255, 213, 107, 0.6); }`;
        document.head.appendChild(st);
      }
      this.bindCombatInput();
    },

    bindCombatInput() {
      if (this._combatInputBound) return;
      this._combatInputBound = true;
      const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';
      // capture phase: runs before the main handler so Space no longer jumps
      window.addEventListener('keydown', (e) => {
        if (typing() || this.isAnyModalOpen || this.cutsceneActive) return;
        const k = e.key.toLowerCase();
        if (e.code === 'Space' || k === ' ') {
          e.preventDefault(); e.stopImmediatePropagation();
          this.keys[' '] = true;
          if (!e.repeat) this.dodgeRoll();
        } else if (k === 'alt') {
          e.preventDefault(); e.stopImmediatePropagation();
          if (!e.repeat && orig.jump) orig.jump.call(this);
        } else if (k === 'g') {
          if (!e.repeat) this.startBlock();
        }
      }, true);
      window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (k === 'g') this.endBlock();
        if (k === 'alt') e.preventDefault();
      }, true);
      this.canvas.addEventListener('mousedown', (e) => { if (e.button === 2 && !this.isAnyModalOpen) this.startBlock(); });
      this.canvas.addEventListener('mousemove', () => {
        // right-drag = camera orbit: drop the guard as soon as the drag really moves
        if (this._blocking && this.isOrbitDragging && this.orbitDragStart && this.orbitDragStart.moved && this.orbitDragStart.button === 2) this.endBlock();
      });
      window.addEventListener('blur', () => this.endBlock());
    },

    // =========================================================================
    // 1) Dodge roll + input buffer
    // =========================================================================
    // combat clock in game seconds (pauses with hit-stop / frame clamps, unlike wall time)
    cNow() { return this._cTime || 0; },

    // talent modifier lookup (mmo_talents.js fills this._talentMods)
    tv(k) { return (this._talentMods && this._talentMods[k]) || 0; },
    hasTalent(id) { return !!(this._talentSet && this._talentSet.has(id)); },

    canAct() {
      const p = this.player;
      // the last ~20% of a roll is recovery that attacks / dodges may cancel
      const rolling = this._roll && this._roll.t < this._roll.dur * 0.8;
      return !(rolling || this._guardBrokenT > 0 || p.dead || p.leapTimer > 0);
    },

    dodgeRoll(fromBuffer) {
      const p = this.player;
      if (!p || this.isAnyModalOpen || this.cutsceneActive || p.dead || !this.isInWorld) return;
      if (this.audio) this.audio.init();
      // still busy: queue it
      if (!this.canAct() || p.attackTimer > 0.12) {
        if (!fromBuffer) this._combat.buffer = { kind: 'dodge', at: this.cNow() };
        return;
      }
      const stam = this.stamina === undefined ? 100 : this.stamina;
      const cost = ROLL_COST * (1 - this.tv('rollCost'));
      if (stam < cost * 0.5) {                                   // not enough: tell the player
        this.spawnFloatingText(p.pos, 'NO STAMINA', '#ff8a3c', 13);
        if (this.spendStamina) this.spendStamina(0);
        return;
      }
      // direction: movement input (camera-relative), else roll forward the way the hero faces
      let ix = (this.touchVec ? this.touchVec.x : 0), iz = (this.touchVec ? this.touchVec.y : 0);
      if (this.keys['w'] || this.keys['arrowup']) iz -= 1;
      if (this.keys['s'] || this.keys['arrowdown']) iz += 1;
      if (this.keys['a'] || this.keys['arrowleft']) ix -= 1;
      if (this.keys['d'] || this.keys['arrowright']) ix += 1;
      let dx, dz;
      if (Math.hypot(ix, iz) > 0.1) {
        const l = Math.hypot(ix, iz); ix /= l; iz /= l;
        const c = Math.cos(this.cameraYaw), s = Math.sin(this.cameraYaw);
        dx = ix * c + iz * s; dz = -ix * s + iz * c;
      } else {
        dx = Math.sin(p.yaw); dz = Math.cos(p.yaw);
      }
      if (this.spendStamina) this.spendStamina(cost);
      const origin = p.pos.clone();
      this.endBlock(true);
      if (this._roll) this.resetRollAnim();
      this._roll = { t: 0, dx, dz, dist: ROLL_DIST, dur: ROLL_DUR, ghosts: 0, last: 0 };
      p.dodgeTimer = Math.max(p.dodgeTimer || 0, IFRAMES + this.tv('iframes'));
      this._wasDodging = true;                 // the roll already paid: skip mmo_hud's generic dodge charge
      p.yaw = Math.atan2(dx, dz); if (p.meshRoot) p.meshRoot.rotation.y = p.yaw;
      orig.playEntityAnim.call(this, p, p.actions && p.actions.Roll ? 'Roll' : 'Sword_Dash', true);
      // the Roll clip is 1.46 s: play the WHOLE tumble (dive, roll, rise) inside the dodge
      const ra = p.actions && (p.actions.Roll || p.actions.Sword_Dash);
      if (ra) ra.setEffectiveTimeScale(ra.getClip().duration / (ROLL_DUR + 0.03));
      if (this.onRollStart) this.onRollStart(origin);
      this.audio && this.audio.playSwing && this.audio.playSwing(false);
      this.spawnShockwaveRing(new THREE.Vector3(p.pos.x, 0.05, p.pos.z), 1.2, 0xbfe6ff, 0.2);
      const slot = document.getElementById('slot-jump');
      if (slot) { slot.classList.add('triggered'); setTimeout(() => slot.classList.remove('triggered'), 140); }
      this.broadcastPlayerState && this.broadcastPlayerState(false);
    },

    updateRoll(dt) {
      const r = this._roll, p = this.player;
      if (!r) return;
      const prevK = 1 - Math.pow(1 - Math.min(1, r.t / r.dur), 2.2);
      r.t += dt;
      const k = 1 - Math.pow(1 - Math.min(1, r.t / r.dur), 2.2);       // ease-out: fast launch, soft landing
      const step = (k - prevK) * r.dist;
      const px = p.pos.x, pz = p.pos.z;
      p.pos.x = Math.max(-(window.MMO.WORLD.half - 10), Math.min(window.MMO.WORLD.half - 10, p.pos.x + r.dx * step));
      p.pos.z = Math.max(-(window.MMO.WORLD.half - 10), Math.min(window.MMO.WORLD.half - 10, p.pos.z + r.dz * step));
      if (this.worldClampMove) this.worldClampMove(p.pos, px, pz);
      this.resolveObstacleCollisions(p.pos, 0.55);
      p.yaw = Math.atan2(r.dx, r.dz);
      if (p.meshRoot) { p.meshRoot.position.x = p.pos.x; p.meshRoot.position.z = p.pos.z; p.meshRoot.rotation.y = p.yaw; }
      // motion-trail afterimages
      if (r.ghosts < 3 && r.t >= r.ghosts * 0.08) {
        r.ghosts++;
        const cls = p.classId;
        const col = cls === 'ranger' ? 0x2ee68a : cls === 'arcanist' ? 0xb266ff : cls === 'berserker' ? 0xff3b5c : 0xf3c86b;
        if (this.spawnHeroAfterimage) this.spawnHeroAfterimage(p, p.pos.clone(), p.yaw, col, 0.32);
      }
      if (r.t >= r.dur) { this._roll = null; this.resetRollAnim(); }
    },

    resetRollAnim() {
      const p = this.player, a = p && p.actions && (p.actions.Roll || p.actions.Sword_Dash);
      if (a) a.setEffectiveTimeScale(1);
    },

    consumeBuffer() {
      const b = this._combat && this._combat.buffer;
      if (!b) return;
      if (this.cNow() - b.at > BUFFER + 0.12) { this._combat.buffer = null; return; }
      if (!this.canAct()) return;
      const p = this.player;
      if (b.kind === 'dodge') {
        if (p.attackTimer > 0.12) return;
        this._combat.buffer = null;
        this.dodgeRoll(true);
      } else if (b.kind === 'skill') {
        if (p.cooldowns && p.cooldowns[b.slot] > 0) return;
        this._combat.buffer = null;
        this._fromBuffer = true;
        try { this.useSkill(b.slot); } finally { this._fromBuffer = false; }
      }
    },

    useSkill(slot, isRemoteOrAI, actor) {
      const ent = actor || this.player;
      if (ent === this.player && !isRemoteOrAI && this._combat && !this._fromBuffer) {
        const cd = this.player.cooldowns ? this.player.cooldowns[slot] || 0 : 0;
        if (!this.canAct() || (cd > 0 && cd <= BUFFER)) {
          this._combat.buffer = { kind: 'skill', slot, at: this.cNow() };
          return;
        }
        if (this._blocking) this.endBlock(true);         // attacking out of guard drops it
      }
      return orig.useSkill.apply(this, arguments);
    },

    updatePlayer(dt) {
      const busy = this._roll || this._guardBrokenT > 0;
      if (!busy) return orig.updatePlayer.call(this, dt);
      // suppress steering input while rolling / guard-broken (physics, timers etc. still run)
      const saved = { w: this.keys.w, a: this.keys.a, s: this.keys.s, d: this.keys.d, au: this.keys.arrowup, ad: this.keys.arrowdown, al: this.keys.arrowleft, ar: this.keys.arrowright };
      const tv = this.touchVec ? { x: this.touchVec.x, y: this.touchVec.y } : null;
      this.keys.w = this.keys.a = this.keys.s = this.keys.d = false;
      this.keys.arrowup = this.keys.arrowdown = this.keys.arrowleft = this.keys.arrowright = false;
      if (this.touchVec) { this.touchVec.x = 0; this.touchVec.y = 0; }
      try { orig.updatePlayer.call(this, dt); } finally {
        this.keys.w = saved.w; this.keys.a = saved.a; this.keys.s = saved.s; this.keys.d = saved.d;
        this.keys.arrowup = saved.au; this.keys.arrowdown = saved.ad; this.keys.arrowleft = saved.al; this.keys.arrowright = saved.ar;
        if (tv) { this.touchVec.x = tv.x; this.touchVec.y = tv.y; }
      }
    },

    playEntityAnim(entity, name, force) {
      if (entity === this.player) {
        // finish the roll (its recovery frames may be cancelled by an attack)
        if (this._roll && name !== 'Roll' && name !== 'Sword_Dash' && name !== 'Death01') {
          const loco = name === this.getEntityIdleAnim(entity) || /Idle|Jog|Walk|Sprint/.test(name);
          if (loco || this._roll.t < this._roll.dur * 0.8) return;
        }
        // guard up: idle / locomotion clips (incl. class idles like Sword_Idle) become the block pose
        if (this._blocking && entity.actions && entity.actions.Sword_Block &&
            (name === this.getEntityIdleAnim(entity) || /Idle|Jog|Walk|Sprint/.test(name))) name = 'Sword_Block';
      }
      return orig.playEntityAnim.call(this, entity, name, force);
    },

    getMoveSpeedMult() {
      const b = orig.getMoveSpeedMult ? orig.getMoveSpeedMult.call(this) : 1;
      return b * (this._blocking ? 0.45 : 1);
    },

    // =========================================================================
    // 2) Block, Perfect Parry, guard break
    // =========================================================================
    startBlock() {
      const p = this.player;
      if (!p || p.dead || this.isAnyModalOpen || this.cutsceneActive || !this.isInWorld || this._roll || this._guardBrokenT > 0) return;
      if (this._blocking) return;
      this._blocking = true;
      const now = this.cNow();
      if (now >= (this._parryLockUntil || 0)) {
        this._parryPressAt = now;                     // opens the 0.18 s Perfect Parry window
        this._parryLockUntil = now + PARRY_LOCKOUT;
      }
      orig.playEntityAnim.call(this, p, p.actions && p.actions.Sword_Block ? 'Sword_Block' : 'Idle_Shield_Loop', true);
      document.getElementById('slot-parry') && document.getElementById('slot-parry').classList.add('blocking');
    },

    endBlock() {
      if (!this._blocking) return;
      this._blocking = false;
      document.getElementById('slot-parry') && document.getElementById('slot-parry').classList.remove('blocking');
    },

    inParryWindow() {
      return this._parryPressAt && (this.cNow() - this._parryPressAt) <= PARRY_WINDOW + this.tv('parryWindow');
    },

    // Shared defence for every enemy strike that lands on the local hero.
    // Returns 'parry' | 'block' | 'guardbreak' | 'hit'.
    defendStrike(attacker, dmg) {
      const p = this.player;
      if (this.inParryWindow()) { this.perfectParry(attacker); return 'parry'; }
      if (this._blocking && !(this._guardBrokenT > 0)) {
        const cost = Math.min(38, Math.max(10, (dmg / Math.max(1, p.maxHp)) * 130)) * (1 - this.tv('blockCost'));
        const stam = this.stamina === undefined ? 100 : this.stamina;
        if (stam >= cost) {
          if (this.spendStamina) this.spendStamina(cost);
          this.blockFx(attacker);
          if (attacker) this.addPosture(attacker, attacker.isBoss ? 3 : 5);
          return 'block';
        }
        this.guardBreak();
        return 'guardbreak';
      }
      return 'hit';
    },

    mobStrikePlayer(mob) {
      if (this.player.dodgeTimer > 0) { this.spawnFloatingText(this.player.pos, 'EVADED!', '#38e8ff', 15); return; }
      const r = this.defendStrike(mob, mob.dmg);
      if (r === 'parry') return;
      const mult = r === 'block' ? this.blockTakenMult() : (r === 'guardbreak' ? 0.6 : 1);
      this.damagePlayer(Math.max(1, Math.round(mob.dmg * mult)), mob.name, mob.level);
    },

    defendProjectile(pr) {
      const shooter = pr.actor && pr.actor !== this.player ? pr.actor : null;
      const r = this.defendStrike(shooter, pr.dmg);
      if (r === 'parry') {
        // deflect it straight back at the shooter
        if (shooter && !shooter.dead) {
          const dir = _v.copy(shooter.pos).sub(this.player.pos).setY(0);
          if (dir.lengthSq() > 0.01) {
            dir.normalize();
            this.spawnProjectile(this.player.pos.clone().add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(dir, 0.8), dir.clone(), 26,
              Math.round(pr.dmg * 1.6), 0xffd56b, true, false, { pierce: false, actor: this.player, trailColor: 0xffd56b });
          }
        }
        return;
      }
      const mult = r === 'block' ? this.blockTakenMult() : (r === 'guardbreak' ? 0.6 : 1);
      this.damagePlayer(Math.max(1, Math.round(pr.dmg * mult)), 'Projectile', pr.srcLevel);
    },

    bossHit(m, mult, label) {
      if (this.player.dodgeTimer > 0) return orig.bossHit.call(this, m, mult, label);       // i-frames: EVADED
      // only weapon strikes can be blocked / parried; spells and shockwaves must be dodged
      if (!(m._meleeLabels && m._meleeLabels.has(label))) return orig.bossHit.call(this, m, mult, label);
      const r = this.defendStrike(m, (m.dmg || 50) * mult);
      if (r === 'parry') return;
      return orig.bossHit.call(this, m, mult * (r === 'block' ? this.blockTakenMult() : (r === 'guardbreak' ? 0.6 : 1)), label);
    },

    blockTakenMult() { return 0.25 * (1 - this.tv('blockDmg')); },

    perfectParry(attacker) {
      const p = this.player;
      this._parryLockUntil = 0;              // a clean parry may be chained straight into the next one
      // (the window stays open, so simultaneous strikes from a pack are all deflected)
      const at = _v2.set(p.pos.x, 1.25, p.pos.z);
      const dir = attacker ? _v.copy(attacker.pos).sub(p.pos).setY(0).normalize() : _v.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
      const hitPos = at.clone().addScaledVector(dir, 0.7);
      this.spawnHitSparks(hitPos, dir.clone(), 0xffd56b, 30);
      this.spawnHitSparks(hitPos, dir.clone().negate(), 0xfff2c4, 14);
      this.spawnShockwaveRing(new THREE.Vector3(hitPos.x, 0.9, hitPos.z), 3.4, 0xffe08a, 0.3);
      this.spawnShockwaveRing(new THREE.Vector3(hitPos.x, 0.9, hitPos.z), 1.8, 0xffffff, 0.22);
      this.spawnVFXFlipbook && this.spawnVFXFlipbook('impact', hitPos, 2.2, 0.22, 0xffd56b, false, { depthTest: false });
      this.spawnFloatingText(p.pos, 'PARRY!', '#ffd56b', 22);
      // 50 ms freeze frame + a sharp shake
      this.hitStopTimer = Math.max(this.hitStopTimer || 0, 0.05);
      this.screenShake = Math.max(this.screenShake || 0, 0.38);
      if (this.audio) {
        // steel-on-steel (mmo_sfx adds the clash) + a heavy impact underneath; no chime
        if (this.audio.playSample && !this.audio.playSample('fs_impact_mid', 1.2, 0.42)) this.audio.playSample('mecha_impact', 1.65, 0.75);
      }
      if (this.stamina !== undefined) this.stamina = Math.min(100, this.stamina + 12);
      orig.playEntityAnim.call(this, p, p.actions && p.actions.Sword_Block ? 'Sword_Block' : 'Idle_Shield_Loop', true);
      if (attacker && !attacker.dead) {
        this.addPosture(attacker, (attacker.isBoss ? 45 : (attacker.isElite ? 48 : 52)) * (1 + this.tv('postureDmg')));
        // the attacker recoils (local visual; the host also applies it through posture)
        if (!attacker.isBoss) this.playEntityAnim(attacker, 'Hit_Chest', true);
      }
      this._parries = (this._parries || 0) + 1;
    },

    blockFx(attacker) {
      const p = this.player;
      const dir = attacker ? _v.copy(attacker.pos).sub(p.pos).setY(0).normalize() : _v.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
      const at = new THREE.Vector3(p.pos.x, 1.15, p.pos.z).addScaledVector(dir, 0.6);
      this.spawnHitSparks(at, dir.clone(), 0xcfe3ff, 10);
      this.spawnShockwaveRing(new THREE.Vector3(at.x, 0.9, at.z), 1.4, 0xcfe3ff, 0.18);
      this.spawnFloatingText(p.pos, 'BLOCKED', '#cfe3ff', 13);
      if (this.audio && this.audio.playSample && !this.audio.playSample('fs_impact_mid', 1.45, 0.2)) this.audio.playSample('mecha_impact', 1.25, 0.45);
      this.screenShake = Math.max(this.screenShake || 0, 0.18);
    },

    guardBreak() {
      const p = this.player;
      this.endBlock();
      this._guardBrokenT = 0.9;
      if (this.stamina !== undefined) this.stamina = 0;
      this._exhausted = true;
      this.spawnFloatingText(p.pos, 'GUARD BROKEN!', '#ff5a3c', 18);
      this.spawnShockwaveRing(new THREE.Vector3(p.pos.x, 0.9, p.pos.z), 2.4, 0xff5a3c, 0.3);
      orig.playEntityAnim.call(this, p, 'Hit_Knockback', true);
      if (this.triggerImpact) this.triggerImpact(0.5, 0.06);
      if (this.audio && this.audio.playSample) this.audio.playSample('sfx_impact', 0.8, 0.6);
    },

    // =========================================================================
    // 3) Posture, stagger, critical riposte
    // =========================================================================
    addPosture(mob, amt) {
      if (!mob || mob.dead || mob.staggerTimer > 0) return;
      mob.posture = Math.min(postureMax(mob), (mob.posture || 0) + amt);
      mob._postureAt = this.cNow();
      mob._plateDirty = true;
      const solo = !this.remotePeers || this.remotePeers.size === 0;
      if (solo || this.isRoomHost) this.checkStagger(mob);
      if (!solo) {                                          // batch to the host
        const q = this._combat.postureOut;
        q.set(mob.id, (q.get(mob.id) || 0) + amt);
        if (mob.posture >= postureMax(mob)) this._combat.postureFlushAt = 0;   // bar full: tell the host right away
      }
    },

    checkStagger(mob) {
      if ((mob.posture || 0) >= postureMax(mob) && !(mob.staggerTimer > 0)) this.staggerMob(mob, STAGGER, true);
    },

    staggerMob(mob, dur, broadcast) {
      if (!mob || mob.dead) return;
      mob.staggerTimer = dur;
      mob._riposteOpen = dur > 1;          // a real stagger opens one riposte; the 0.35 s close-out does not
      mob.posture = 0;
      mob.stunTimer = Math.max(mob.stunTimer || 0, dur);      // host AI stands down while staggered
      mob._plateDirty = true;
      if (dur > 1) {
        this.playEntityAnim(mob, mob.actions && mob.actions.Hit_Knockback ? 'Hit_Knockback' : 'Hit_Chest', true);
        const top = new THREE.Vector3(mob.pos.x, 0, mob.pos.z);
        this.spawnShockwaveRing(top, mob.isBoss ? 6 : 3.2, 0xffd56b, 0.45);
        this.spawnFloatingText(mob.pos, 'STAGGERED!', '#ffd56b', mob.isBoss ? 26 : 19);
        if (this.audio && this.audio.playAt) this.audio.playAt('sfx_impact', mob.pos, 0.7, 0.6, 60);
        if (this.triggerImpact) this.triggerImpact(mob.isBoss ? 0.45 : 0.25, 0);
      }
      if (broadcast && this.remotePeers && this.remotePeers.size > 0) {
        this.broadcastGameEvent('mob_stagger', { mobId: mob.id, dur, by: this.playerToken });
      }
    },

    onMobPostureNet(payload) {
      if (!payload || payload.by === this.playerToken || !Array.isArray(payload.list)) return;
      payload.list.forEach(([id, amt]) => {
        const mob = this.getMobById ? this.getMobById(id) : this.monsters.find(m => m.id === id);
        if (!mob || mob.dead || mob.staggerTimer > 0) return;
        mob.posture = Math.min(postureMax(mob), (mob.posture || 0) + amt);
        mob._postureAt = this.cNow();
        mob._plateDirty = true;
        if (this.isRoomHost) this.checkStagger(mob);
      });
    },

    onMobStaggerNet(payload) {
      if (!payload || payload.by === this.playerToken) return;
      const mob = this.getMobById ? this.getMobById(payload.mobId) : this.monsters.find(m => m.id === payload.mobId);
      if (mob) this.staggerMob(mob, payload.dur || STAGGER, false);
    },

    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork, netData, opts) {
      const local = mob && !mob.dead && !fromNetwork && (!attacker || attacker === this.player);
      if (local && mob.staggerTimer > 0.05 && mob._riposteOpen && this._combat) {
        // CRITICAL RIPOSTE on a staggered foe - one per stagger
        mob._riposteOpen = false;
        const args = Array.prototype.slice.call(arguments);
        args[1] = Math.round(baseDmg * (mob.isBoss ? 2.5 : 3) * (1 + this.tv('riposte')));
        args[2] = true;
        orig.applyDamageToMonster.apply(this, args);
        this.spawnFloatingText(mob.pos, 'CRITICAL RIPOSTE!', '#fff2c4', mob.isBoss ? 26 : 22);
        this.spawnShockwaveRing(new THREE.Vector3(mob.pos.x, 0.6, mob.pos.z), mob.isBoss ? 7 : 4.5, 0xfff2c4, 0.4);
        this.spawnHitSparks(new THREE.Vector3(mob.pos.x, 1.2, mob.pos.z), new THREE.Vector3(0, 1, 0), 0xffd56b, 34);
        this.hitStopTimer = Math.max(this.hitStopTimer || 0, 0.085);
        this.screenShake = Math.max(this.screenShake || 0, 0.6);
        if (!mob.dead) this.staggerMob(mob, 0.35, true);      // the opening closes after the riposte
        return undefined;
      }
      const r = orig.applyDamageToMonster.apply(this, arguments);
      if (local && this._combat && !mob.dead) this.addPosture(mob, (isHeavy ? 12 : 5) * (mob.isBoss ? 0.3 : 1) * (1 + this.tv('postureDmg')));
      return r;
    },

    updatePosture(dt) {
      const now = this.cNow(), wall = performance.now();
      const ms = this.monsters;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        if (m.staggerTimer > 0) {
          m.staggerTimer = Math.max(0, m.staggerTimer - dt);
          m._plateDirty = true;
          // dizzy stars over a staggered foe
          if (m.staggerTimer > 0.4 && Math.random() < dt * 6) this.glintAt(m, 0.55, 0xffe08a, 0.45);
        }
        if (m.posture > 0 && now - (m._postureAt || 0) > 2.5) {
          m.posture = Math.max(0, m.posture - (m.isBoss ? 9 : 14) * dt);
          m._plateDirty = true;
        }
      }
      // flush batched posture to the host 4x per second
      const C = this._combat;
      if (C.postureOut.size && wall > C.postureFlushAt && this.remotePeers && this.remotePeers.size > 0 && !this.isRoomHost) {
        C.postureFlushAt = wall + 250;
        this.broadcastGameEvent('mob_posture', { by: this.playerToken, list: Array.from(C.postureOut.entries()).map(([id, a]) => [id, Math.round(a)]) });
        C.postureOut.clear();
      } else if (this.isRoomHost || !this.remotePeers || this.remotePeers.size === 0) {
        if (C.postureOut.size && wall > C.postureFlushAt && this.remotePeers && this.remotePeers.size > 0) {
          C.postureFlushAt = wall + 250;
          this.broadcastGameEvent('mob_posture', { by: this.playerToken, list: Array.from(C.postureOut.entries()).map(([id, a]) => [id, Math.round(a)]) });
        }
        C.postureOut.clear();
      }
      // boss HUD posture bar
      if (this._bossPostureFill) {
        let boss = null, bd = 1e9;
        for (let i = 0; i < ms.length; i++) {
          const m = ms[i];
          if (!m.isBoss || m.dead || !(m.bossState && m.bossState.engaged)) continue;
          const d = m.pos.distanceToSquared(this.player.pos);
          if (d < bd) { bd = d; boss = m; }
        }
        const f = boss ? (boss.staggerTimer > 0 ? 1 : (boss.posture || 0) / postureMax(boss)) : 0;
        const w = (f * 100).toFixed(1) + '%';
        if (this._bossPostureFill.style.width !== w) this._bossPostureFill.style.width = w;
        const flash = boss && boss.staggerTimer > 0 && Math.floor(wall / 120) % 2 === 0;
        this._bossPostureFill.style.filter = flash ? 'brightness(1.8)' : '';
      }
    },

    // nameplate + golden posture bar (and a flashing "staggered" state)
    drawMobNameplate(m, sp = m.nameplateSprite) {
      if (!sp) return;
      const pf = Math.max(0, Math.min(1, (m.posture || 0) / postureMax(m)));
      const stag = m.staggerTimer > 0 ? (Math.floor(performance.now() / 140) % 2) + 1 : 0;
      const key = `p${Math.round(pf * 30)}s${stag}`;
      const before = sp.userData.lastKey;
      if (sp.userData.postureKey !== key) sp.userData.lastKey = '';   // posture changed: force a redraw
      orig.drawMobNameplate.call(this, m, sp);
      if (sp.userData.lastKey === before && sp.userData.postureKey === key) return;   // nothing redrawn
      sp.userData.postureKey = key;
      if (pf <= 0.001 && !stag) return;
      const { ctx, tex } = sp.userData;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(38, 50, 180, 6);
      ctx.fillStyle = stag ? (stag === 1 ? '#ffffff' : '#ffd56b') : (pf > 0.75 ? '#ffd56b' : '#e8a23a');
      ctx.fillRect(40, 51, 176 * (stag ? 1 : pf), 4);
      tex.needsUpdate = true;
    },

    // =========================================================================
    // 4) Wind-up anticipation + glint telegraph
    // =========================================================================
    mobWindup(m, windup) {
      if (!m || m.dead || !(windup > 0)) return;
      if (m._windup) this.resetWindup(m);
      const clip = /^(Idle|Jog|Walk|Run|Sprint)/.test(m.animState || '') ? null : m.animState;
      const sx = m.meshRoot ? m.meshRoot.scale.x : 1, sy = m.meshRoot ? m.meshRoot.scale.y : 1;
      m._windup = { t: windup, total: windup, glinted: false, clip, sx, sy };
    },

    runBossAbility(m, key, params) {
      const r = orig.runBossAbility.apply(this, arguments);
      const M = window.MMO;
      if (key === 'swipe' || key === 'cleave' || key === 'charge' || key === 'slam') {
        const def = m.bossDef || {};
        const castName = key === 'swipe' ? '' : ((def.names && def.names[key]) || key.charAt(0).toUpperCase() + key.slice(1));
        (m._meleeLabels = m._meleeLabels || new Set()).add(castName || 'Swipe');
      }
      const ab = key === 'swipe' ? { windup: 0.75 } : (M.ABILITIES && M.ABILITIES[key]);
      if (ab && ab.windup) this.mobWindup(m, ab.windup * (m.enraged ? 0.82 : 1));
      return r;
    },

    glintAt(m, hFrac, color, size) {
      const g = this._glints.find(x => !x.sp.visible) || this._glints[0];
      const h = (m.plateY !== undefined ? m.plateY - 0.6 : (m.desiredHeight || 1.8)) * hFrac / 0.8;
      g.sp.position.set(m.pos.x + (Math.random() - 0.5) * 0.4, Math.max(0.6, h), m.pos.z + (Math.random() - 0.5) * 0.4);
      g.sp.material.color.setHex(color || 0xffe2a0);
      g.base = (size || 1) * (m.isBoss ? 2.4 : 1.4);
      g.t = 0; g.dur = 0.3;
      g.sp.visible = true;
    },

    glintFlash(m) {
      // the telegraph: bright golden glint + a short emissive flash on the attacker
      this.glintAt(m, 0.75, 0xffe2a0, 1);
      if (m.materials) {
        m.materials.forEach((mat) => {
          if (!mat.emissive) return;
          if (!mat.userData.origEmissive) mat.userData.origEmissive = mat.emissive.clone();
          mat.emissive.setRGB(1.0, 0.78, 0.35);
          mat.emissiveIntensity = 1.4;
        });
        m._glintFlashT = 0.14;          // restored on the frame clock (see updateWindups)
      }
      if (this.audio && this.audio.playAt && !this.audio.playAt('fs_parry_1', m.pos, 1.55, 0.3, 45)) this.audio.playAt('chime', m.pos, 1.9, 0.42, 45);
    },

    updateWindups(dt) {
      const ms = this.monsters;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        if (m._glintFlashT > 0) {
          m._glintFlashT -= dt;
          if (m._glintFlashT <= 0) this.endGlintFlash(m);
        }
        const w = m._windup;
        if (!w) continue;
        if (m.dead || m.staggerTimer > 0) { this.resetWindup(m, m.dead); continue; }   // dead: leave the body to the death shatter
        w.t -= dt;
        // coiled anticipation: the attack clip crawls, then snaps through the strike
        const act = m.actions && m.actions[w.clip];
        if (act) act.timeScale = w.t > 0.12 ? 0.35 : (w.t > -0.35 ? 1.7 : 1);
        // procedural coil for every body type: squat down during the wind-up, stretch on the strike
        if (m.meshRoot) {
          let k;
          if (w.t > 0.12) k = -Math.min(1, (w.total - w.t) / Math.max(0.15, w.total - 0.12)) * 0.11;   // coil
          else if (w.t > -0.12) k = 0.08 * (1 - Math.abs(w.t) / 0.12);                                   // strike stretch
          else k = 0;
          m.meshRoot.scale.set(w.sx * (1 - k * 0.5), w.sy * (1 + k), w.sx * (1 - k * 0.5));
        }
        if (!w.glinted && w.t <= GLINT_LEAD) { w.glinted = true; this.glintFlash(m); }
        if (w.t <= -0.45) this.resetWindup(m);
      }
      for (let i = 0; i < this._glints.length; i++) {
        const g = this._glints[i];
        if (!g.sp.visible) continue;
        g.t += dt;
        const k = g.t / g.dur;
        if (k >= 1) { g.sp.visible = false; continue; }
        const s = g.base * (k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65 * 0.6);
        g.sp.scale.set(s, s, 1);
        g.sp.material.rotation = k * 1.2;
        g.sp.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      }
    },

    endGlintFlash(m) {
      m._glintFlashT = 0;
      if (m.dead) return;
      (m.materials || []).forEach((mat) => {
        if (mat.emissive && mat.userData.origEmissive) { mat.emissive.copy(mat.userData.origEmissive); mat.emissiveIntensity = mat.userData.origEmissiveIntensity ?? 1.0; }
      });
    },

    resetWindup(m, keepScale) {
      const w = m._windup;
      if (w && m.actions) {
        Object.keys(m.actions).forEach((k) => { const a = m.actions[k]; if (a && a.timeScale !== 1) a.timeScale = 1; });
      }
      if (w && m.meshRoot && !keepScale) m.meshRoot.scale.set(w.sx, w.sy, w.sx);
      m._windup = null;
    },

    // =========================================================================
    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (!this._combat) return;
      this._cTime = (this._cTime || 0) + dt;
      this.updateRoll(dt);
      if (this._guardBrokenT > 0) this._guardBrokenT = Math.max(0, this._guardBrokenT - dt);
      if (this._blocking) {
        this._stamIdle = 0;                        // no stamina regen while guarding
        this._moveHeld = 0; this._sprinting = false;
        if (this.player.dead) this.endBlock();
      }
      this.consumeBuffer();
      this.updatePosture(dt);
      this.updateWindups(dt);
    }
  });
})();
