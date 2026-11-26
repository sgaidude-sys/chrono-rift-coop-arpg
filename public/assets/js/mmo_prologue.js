/* =============================================================================
 * Chrono-Rift — first 90 seconds: one-tap start, playable prologue, first mission
 *
 *  A brand-new hero's opening, in order:
 *   1. One-tap start (portal builds only, window.CR_OFFLINE): a player with no heroes on
 *      this device gets a guest Vanguard created before the game boots, so the page goes
 *      straight into the world: no title, hero list, creation screen or reload.
 *      Returning players (any hero saved, or a pending character switch) are untouched.
 *   2. Prologue skirmish "Hold the Rift Breach": just outside Ashenvale, six weakened rift
 *      monsters close in around a violet breach. Fading prompts (move / attack), a 0/6
 *      banner, the hero can't fall here, and the last kill drops a Rare weapon.
 *   3. Then the existing Chapter I intro plays, unchanged (skip with SPACE / ESC / the
 *      top-right button).
 *   4. First mission: the hero arrives at the Rift Gate in town with a pulsing ring, a gold
 *      beacon over the nearest Meadows pack and a tracker "Defeat 10 monsters (0/10)",
 *      rewarded with an Epic item. Levels 1-2 need less XP (mmo_data.js), so the first
 *      level-up and talent point land in the first minute or two.
 *  Runs once per hero (mmoState.opening). Heroes that already saw Chapter I skip it all.
 * ============================================================================= */
(function () {
  'use strict';
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* blocked */ } }
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* blocked */ } }
  };

  // ---------------------------------------------------------------------------------------------
  // 1. One-tap start (called by the page right before the game is created, after the portal SDK
  //    restored any saved data)
  // ---------------------------------------------------------------------------------------------
  window.CR_PRESTART = function () {
    if (!window.CR_OFFLINE) return;
    try {
      if (ss.get('cr_char') || ss.get('cr_goto')) return;                  // already playing / switching heroes
      let chars = []; try { chars = JSON.parse(ls.get('cr_guest_chars') || '[]'); } catch (e) { chars = []; }
      if (chars.length) return;                                             // returning player: normal hero list
      const tok0 = ls.get('arpg_player_token');
      if (tok0 && !/^(char_|g_)/.test(tok0)) {                              // pre-accounts save on this device: let them import it
        for (const cls of ['vanguard', 'ranger', 'arcanist', 'berserker']) if (ls.get(`arpg_mmo_v1_${tok0}_${cls}`)) return;
      }
      const id = (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
      const name = 'Rifter ' + (1000 + Math.floor(Math.random() * 9000));
      const cls = 'vanguard';
      const now = new Date().toISOString();
      ls.set('cr_guest_chars', JSON.stringify([{ id, name, cls, level: 1, updated: now, save: {} }]));
      const tok = 'g_' + id;
      ls.set('arpg_player_token', tok);
      ls.set('arpg_hero_name', name);
      ls.set('arpg_story_state', null);
      ls.set('cr_last_mode', 'guest');
      ss.set('cr_mode', 'guest');
      ss.set('cr_char', JSON.stringify({ id, tok, name, cls, mode: 'guest', local: true }));
      window.CR_FIRST_RUN = true;
    } catch (e) { /* storage blocked: the normal flow still works */ }
  };

  if (typeof ChronoRiftCoOpGame === 'undefined') return;                   // a class declaration, not a window property
  const GP = ChronoRiftCoOpGame.prototype;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const isTouch = () => document.body.classList.contains('touch-ui');
  const KILLS = 6, MISSION = 10;

  const CSS = `
  #cr-op-banner { position: fixed; top: calc(14px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); z-index: 45; pointer-events: none;
    display: none; text-align: center; color: #F5F2EB; padding: 9px 22px 10px; border-radius: 12px; min-width: 260px;
    background: linear-gradient(180deg, rgba(20,14,34,.82), rgba(14,12,24,.7)); border: 1px solid rgba(180,140,255,.55);
    box-shadow: 0 6px 24px rgba(0,0,0,.45), 0 0 22px rgba(140,90,255,.25); font-family: 'Plus Jakarta Sans', Inter, sans-serif; }
  #cr-op-banner.on { display: block; animation: crOpIn .35s cubic-bezier(.2,.8,.2,1); }
  #cr-op-banner .t { font: 900 15px 'Cinzel', serif; letter-spacing: .14em; }
  #cr-op-banner .c { font: 800 12px 'Plus Jakarta Sans', Inter, sans-serif; color: #d8c2ff; margin-top: 3px; letter-spacing: .06em; }
  #cr-op-banner .bar { height: 4px; border-radius: 4px; background: rgba(255,255,255,.12); margin-top: 6px; overflow: hidden; }
  #cr-op-banner .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #b48cff, #ffd56b); transition: width .25s; }
  #cr-op-banner.gold { border-color: rgba(255,213,107,.7); box-shadow: 0 6px 24px rgba(0,0,0,.45), 0 0 26px rgba(255,200,90,.35); }
  #cr-op-banner.done .t { color: #ffd56b; }
  #cr-op-banner.pop { animation: crOpPop .35s ease; }
  @keyframes crOpIn { from { opacity: 0; transform: translate(-50%, -10px); } }
  @keyframes crOpPop { 50% { transform: translateX(-50%) scale(1.07); } }
  #cr-op-hints { position: fixed; left: 50%; bottom: calc(22% + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 44; pointer-events: none;
    display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 92vw; }
  #cr-op-hints .h { padding: 8px 14px; border-radius: 999px; color: #F5F2EB; font: 700 13px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .03em;
    background: rgba(12,14,22,.72); border: 1px solid rgba(255,255,255,.22); transition: opacity .6s, transform .6s; }
  #cr-op-hints .h.gone { opacity: 0; transform: translateY(8px); }
  #cr-op-hints kbd { display: inline-block; min-width: 18px; padding: 1px 6px; margin: 0 2px; border-radius: 5px; background: rgba(255,255,255,.14);
    border: 1px solid rgba(255,255,255,.3); font: 800 11px 'JetBrains Mono', monospace; text-align: center; }
  #cr-op-tip { position: fixed; right: calc(16px + env(safe-area-inset-right)); bottom: calc(150px + env(safe-area-inset-bottom)); z-index: 44; pointer-events: none;
    padding: 9px 14px; border-radius: 12px; color: #1a1406; background: linear-gradient(180deg, #ffe7a3, #ffd56b); font: 800 12.5px 'Plus Jakarta Sans', Inter, sans-serif;
    box-shadow: 0 6px 20px rgba(0,0,0,.4); display: none; }
  #cr-op-tip.on { display: block; animation: crOpIn .35s ease; }`;

  function ensureUi() {
    if (document.getElementById('cr-op-banner')) return;
    const st = document.createElement('style'); st.id = 'cr-op-css'; st.textContent = CSS; document.head.appendChild(st);
    const b = document.createElement('div'); b.id = 'cr-op-banner'; b.innerHTML = '<div class="t"></div><div class="c"></div><div class="bar"><i></i></div>';
    const h = document.createElement('div'); h.id = 'cr-op-hints';
    const t = document.createElement('div'); t.id = 'cr-op-tip';
    document.body.append(b, h, t);
  }
  function banner(title, count, frac, cls) {
    ensureUi();
    const b = document.getElementById('cr-op-banner');
    b.querySelector('.t').textContent = title;
    b.querySelector('.c').textContent = count || '';
    b.querySelector('i').style.width = Math.round(Math.max(0, Math.min(1, frac || 0)) * 100) + '%';
    b.className = 'on' + (cls ? ' ' + cls : '');
    void b.offsetWidth; if (cls && /pop/.test(cls)) b.classList.add('pop');
  }
  function hideBanner() { const b = document.getElementById('cr-op-banner'); if (b) b.className = ''; }
  function hints(list) {
    ensureUi();
    const h = document.getElementById('cr-op-hints');
    h.innerHTML = list.map(x => `<div class="h" data-k="${x.k}">${x.html}</div>`).join('');
  }
  function clearHint(k) { const el = document.querySelector(`#cr-op-hints .h[data-k="${k}"]`); if (el && !el.classList.contains('gone')) { el.classList.add('gone'); setTimeout(() => el.remove(), 700); } }
  let tipTimer = 0;
  function tip(text, secs) { ensureUi(); const t = document.getElementById('cr-op-tip'); t.textContent = text; t.classList.add('on'); clearTimeout(tipTimer); tipTimer = setTimeout(() => t.classList.remove('on'), (secs || 6) * 1000); }

  const orig = {
    triggerStoryChapter: GP.triggerStoryChapter, updateMMOWorld: GP.updateMMOWorld, onMobDied: GP.onMobDied,
    damagePlayer: GP.damagePlayer, updateTutorial: GP.updateTutorial, gainXP: GP.gainXP, initMMOWorld: GP.initMMOWorld
  };

  Object.assign(GP, {
    initMMOWorld() {
      const r = orig.initMMOWorld.apply(this, arguments);
      // SPACE skips cinematics too (ESC and the button already do)
      window.addEventListener('keydown', (e) => {
        if (!this.cutsceneActive || (e.key !== ' ' && e.code !== 'Space')) return;
        const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return;
        e.preventDefault(); e.stopPropagation();
        if (this.skipCutscene) this.skipCutscene();
      }, true);
      // prompts fade as soon as the player does the thing
      const moved = (e) => { if (!this._op) return; const k = (e.key || '').toLowerCase(); if ('wasd'.includes(k) && k) clearHint('move'); if (k === '1' || k === 'j') clearHint('attack'); };
      window.addEventListener('keydown', moved, true);
      window.addEventListener('pointerdown', (e) => { if (this._op && e.button === 0 && e.target && e.target.tagName === 'CANVAS') clearHint('attack'); }, true);
      return r;
    },

    openingState() {
      const st = this.mmoState; if (!st) return null;
      return st.opening || (st.opening = { stage: 0, kills: 0 });
    },

    // A hero that never saw Chapter I and never started the opening gets the prologue first.
    triggerStoryChapter(chapterId) {
      const O = this.openingState();
      if (chapterId === 'ch1' && O && O.stage <= 1 && !this._op && this.storyState && !this.storyState.seen.has('ch1') && (this.player.level || 1) <= 1) {
        O.stage = 1;
        this._opResumed = true;
        this.saveMMOState && this.saveMMOState();
        setTimeout(() => this.startPrologue(), 250);
        return;
      }
      return orig.triggerStoryChapter.apply(this, arguments);
    },

    // ---------------------------------------------------------------------------------------------
    // 2. Prologue skirmish
    // ---------------------------------------------------------------------------------------------
    startPrologue() {
      const p = this.player;
      // a clear spot just outside the town wall, on the road toward the Meadows
      const toward = V(40, 0, 330).normalize();
      const P = toward.clone().multiplyScalar(64);
      const C = P.clone().addScaledVector(toward, 7);                        // the breach, ahead of the hero
      p.pos.set(P.x, 0, P.z); p.vy = 0; p.yaw = Math.atan2(C.x - P.x, C.z - P.z);
      this.cameraYaw = Math.atan2(-toward.x, -toward.z);
      if (this.updatePropStreaming) this.updatePropStreaming(true);
      const hy = this.terrainVisualHeight ? this.terrainVisualHeight(C.x, C.z) : 0;

      // the breach: a violet ring and light (removed afterwards)
      const g = new THREE.Group(); g.position.set(C.x, hy + 0.06, C.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.0, 48), new THREE.MeshBasicMaterial({ color: 0xa070ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; g.add(ring);
      const core = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), new THREE.MeshBasicMaterial({ color: 0x3a1a7a, transparent: true, opacity: 0.55, depthWrite: false }));
      core.rotation.x = -Math.PI / 2; g.add(core);
      const light = new THREE.PointLight(0x9a6bff, 2.2, 22); light.position.y = 2.5; g.add(light);
      this.scene.add(g);

      this._op = { t: 0, kills: 0, wave: 1, mobs: [], g, ring, light, C, P, vfxT: 0, done: false };
      // wave 1: three right in front of the hero
      this.prologueWave([['meadow_slime', 1], ['field_rat', 1], ['meadow_slime', 1]], 2.4);
      banner('HOLD THE RIFT BREACH', `0 / ${KILLS} defeated`, 0);
      hints(isTouch()
        ? [{ k: 'move', html: 'Drag the joystick to move' }, { k: 'attack', html: 'Tap ⚔ to attack' }]
        : [{ k: 'move', html: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move' }, { k: 'attack', html: '<kbd>Click</kbd> / <kbd>1</kbd> Attack · <kbd>2</kbd> Skill' }]);
      setTimeout(() => clearHint('move'), 12000);
      setTimeout(() => clearHint('attack'), 16000);
      if (this.spawnVFXFlipbook) this.spawnVFXFlipbook('vortex', C, 5, 0.8, 0x9a6bff);
      if (this.audio && this.audio.playSpell) this.audio.playSpell('warp');
    },

    // monsters pour out of the breach toward the hero
    prologueWave(list, hpMul) {
      const O = this._op; if (!O) return;
      const names = { meadow_slime: 'Rift Slime', field_rat: 'Rift Rat', cluckbeast: 'Rift Cluckbeast' };
      const base = Math.atan2(O.P.x - O.C.x, O.P.z - O.C.z);
      list.forEach(([type, level], i) => {
        const a = base + (i - (list.length - 1) / 2) * 0.55;
        const r = 2.4 + (i % 2) * 1.2;
        const x = O.C.x + Math.sin(a) * r, z = O.C.z + Math.cos(a) * r;
        const m = this.createWorldMob(`op_${O.wave}_${i}_${Date.now().toString(36)}`, { type, name: names[type] || 'Rift Spawn', level }, x, z, null);
        m.maxHp = Math.max(8, Math.round(m.maxHp * hpMul)); m.hp = m.maxHp;
        m.dmg = Math.max(1, Math.round(m.dmg * 0.5));
        m.aggroTimer = 40; m.isAdd = true; m._prologue = true;
        O.mobs.push(m);
      });
      if (this.spawnVFXFlipbook) this.spawnVFXFlipbook('vortex', O.C, 5, 0.8, 0x9a6bff);
    },

    finishPrologue() {
      const O = this._op; if (!O || O.done) return;
      O.done = true;
      const p = this.player;
      banner('BREACH HELD!', 'The rift is collapsing…', 1, 'gold done pop');
      clearHint('move'); clearHint('attack');
      // first loot: a Rare weapon for this class, straight into the bag
      try {
        const it = this.generateItem({ ilvl: Math.max(2, p.level || 1), rarity: 'rare', slot: 'weapon', cls: p.classId });
        it.req = 1;
        if (this.spawnVFXFlipbook) this.spawnVFXFlipbook('eldenring', p.pos, 4, 0.6, 0x4aa8ff);
        this.pickupItem(it);
      } catch (e) { /* inventory full or not ready */ }
      O.mobs.forEach(m => { if (!m.dead) { const i = this.monsters.indexOf(m); if (i >= 0) this.removeMob(m, i); } });
      const st = this.openingState(); st.stage = 2; this.saveMMOState && this.saveMMOState();
      setTimeout(() => {
        this.scene.remove(O.g);
        this._op = null;
        hideBanner();
        this._opAfterIntro = true;
        orig.triggerStoryChapter.call(this, 'ch1');                         // the existing intro, unchanged
      }, 1800);
    },

    // ---------------------------------------------------------------------------------------------
    // 4. First mission in town
    // ---------------------------------------------------------------------------------------------
    startFirstMission() {
      const p = this.player;
      p.pos.set(0, 0, 6.5); p.vy = 0; p.yaw = Math.PI;                          // at the Rift Gate, beside Lyra
      if (this.aiAllies) this.aiAllies.forEach((a) => a.pos.copy(p.pos).add(a.offset));
      if (this.updatePropStreaming) this.updatePropStreaming(true);
      const st = this.openingState(); st.stage = 3; st.kills = 0; this.saveMMOState && this.saveMMOState();
      // pulsing ring where the hero stands
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 40), new THREE.MeshBasicMaterial({ color: 0xffd56b, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.pos.x, 0.06, p.pos.z); this.scene.add(ring);
      this._opRing = { mesh: ring, t: 0 };
      this.placeMissionBeacon();
      this.updateMissionBanner(true);
      tip(isTouch() ? 'Follow the gold beacon into the Meadows' : 'Follow the gold beacon into the Meadows  ·  [Shift] sprint', 7);
    },

    // a tall gold beam over the nearest pack of Meadows monsters (moves on as packs are cleared)
    placeMissionBeacon() {
      const p = this.player;
      let best = null, bd = Infinity;
      (this.monsters || []).forEach((m) => {
        if (m.dead || m.isBoss || m._prologue) return;
        const r = Math.hypot(m.pos.x, m.pos.z); if (r < 50 || r > 260) return;
        const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
        if (d < bd) { bd = d; best = m; }
      });
      const target = best ? best.pos.clone() : V(40, 0, 120);
      if (!this._opBeacon) {
        const g = new THREE.Group();
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd56b, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.y = 20; g.add(beam);
        const disc = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.0, 40), new THREE.MeshBasicMaterial({ color: 0xffd56b, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        disc.rotation.x = -Math.PI / 2; disc.position.y = 0.08; g.add(disc);
        this.scene.add(g);
        this._opBeacon = { g, target };
      }
      this._opBeacon.target = target;
      const hy = this.terrainVisualHeight ? this.terrainVisualHeight(target.x, target.z) : 0;
      this._opBeacon.g.position.set(target.x, hy, target.z);
    },

    updateMissionBanner(fresh) {
      const st = this.openingState(); if (!st || st.stage !== 3) return;
      const p = this.player, B = this._opBeacon;
      const d = B ? Math.round(Math.hypot(B.target.x - p.pos.x, B.target.z - p.pos.z)) : 0;
      const where = this.isInTownSafeZone && this.isInTownSafeZone(p.pos) ? `Head into the Meadows · ${d} m` : (d > 14 ? `Beacon ${d} m away` : 'Monsters nearby!');
      banner('FIRST HUNT: DEFEAT 10 MONSTERS', `${st.kills} / ${MISSION} · ${where}`, st.kills / MISSION, 'gold' + (fresh ? ' pop' : ''));
    },

    finishFirstMission() {
      const st = this.openingState(); st.stage = 4; this.saveMMOState && this.saveMMOState();
      const p = this.player;
      banner('FIRST HUNT COMPLETE!', 'Reward: an Epic item', 1, 'gold done pop');
      try {
        const it = this.generateItem({ ilvl: Math.max(3, p.level || 1), rarity: 'epic', cls: p.classId });
        it.req = 1;
        if (this.spawnVFXFlipbook) this.spawnVFXFlipbook('eldenring', p.pos, 4.5, 0.7, 0xc07bff);
        this.pickupItem(it);
      } catch (e) { /* bag full */ }
      if (this._opBeacon) { this.scene.remove(this._opBeacon.g); this._opBeacon = null; }
      setTimeout(() => { hideBanner(); tip('Open your bag [I] to equip your new gear', 6); }, 3500);
    },

    // ---------------------------------------------------------------------------------------------
    // hooks
    // ---------------------------------------------------------------------------------------------
    onMobDied(mob) {
      const r = orig.onMobDied.apply(this, arguments);
      const O = this._op;
      if (O && mob && mob._prologue && !O.done) {
        O.kills++;
        if (O.kills >= KILLS) { banner('HOLD THE RIFT BREACH', `${O.kills} / ${KILLS} defeated`, 1, 'gold pop'); this.finishPrologue(); }
        else if (O.wave === 1 && O.kills >= 3) {
          O.wave = 2;
          banner('MORE ARE COMING THROUGH!', `${O.kills} / ${KILLS} defeated`, O.kills / KILLS, 'pop');
          setTimeout(() => { if (this._op === O && !O.done) this.prologueWave([['field_rat', 1], ['cluckbeast', 2], ['meadow_slime', 1]], 2.8); }, 900);
        } else banner('HOLD THE RIFT BREACH', `${O.kills} / ${KILLS} defeated`, O.kills / KILLS, 'pop');
      } else {
        const st = this.openingState();
        if (st && st.stage === 3 && mob && !mob._prologue && !mob.fromNetwork) {
          st.kills++;
          this.updateMissionBanner(true);
          if (st.kills >= MISSION) this.finishFirstMission();
          else this.placeMissionBeacon();
        }
      }
      return r;
    },

    // the hero can't fall during the prologue
    damagePlayer(dmg) {
      if (this._op) {
        const p = this.player;
        if (p.hp < p.maxHp * 0.4) p.hp = Math.round(p.maxHp * 0.7);
        arguments[0] = Math.min(dmg, Math.round(p.maxHp * 0.12));
      }
      return orig.damagePlayer.apply(this, arguments);
    },

    // keep the tutorial pill out of the way until the first mission is under way
    updateTutorial(dt) {
      const st = this.openingState && this.openingState();
      if (this._op || this._opAfterIntro || (st && (st.stage === 1 || st.stage === 2))) return;
      return orig.updateTutorial ? orig.updateTutorial.apply(this, arguments) : undefined;
    },

    gainXP(amount) {
      const before = this.player.level;
      const r = orig.gainXP.apply(this, arguments);
      if (this.player.level > before && before === 1) {
        tip(isTouch() ? '✦ Talent point earned! Open ☰ → Talents' : '✦ Talent point earned! Press [K] to spend it', 7);
      }
      return r;
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      const O = this._op;
      if (O) {
        O.t += dt; O.vfxT -= dt;
        O.ring.rotation.z += dt * 0.8; O.ring.material.opacity = 0.55 + Math.sin(O.t * 4) * 0.2;
        O.light.intensity = 2 + Math.sin(O.t * 3) * 0.6;
        if (O.vfxT <= 0 && this.spawnVFXFlipbook) { O.vfxT = 1.6; this.spawnVFXFlipbook('vortex', O.C, 4, 0.6, 0x9a6bff); }
        O.mobs.forEach((m) => { if (!m.dead) m.aggroTimer = Math.max(m.aggroTimer || 0, 5); });
        // safety net: never get stuck in the prologue
        if (O.t > 75 && !O.done) this.finishPrologue();
      }
      if (this._opAfterIntro && !this.cutsceneActive && !this._op) {
        this._opAfterIntro = false;
        this.startFirstMission();
      }
      // returning mid-opening (closed the tab during the intro or the hunt)
      if (!this._opResumed && this.isInWorld && !this.cutsceneActive) {
        this._opResumed = true;
        const st = this.openingState();
        if (st && st.stage === 2 && this.storyState && this.storyState.seen.has('ch1')) this.startFirstMission();
        else if (st && st.stage === 2) { this._opAfterIntro = true; orig.triggerStoryChapter.call(this, 'ch1'); }
        else if (st && st.stage === 3) { this.placeMissionBeacon(); this.updateMissionBanner(true); }
      }
      if (this._opRing) {
        const R = this._opRing; R.t += dt;
        R.mesh.scale.setScalar(1 + (R.t % 1.2) * 0.6); R.mesh.material.opacity = 0.9 * (1 - (R.t % 1.2) / 1.2);
        if (R.t > 9) { this.scene.remove(R.mesh); this._opRing = null; }
      }
      if (this._opBeacon) {
        const st = this.openingState();
        this._opBeacon.g.children[1].rotation.z += dt;
        this._opBannerT = (this._opBannerT || 0) + dt;
        if (this._opBannerT > 0.5 && st && st.stage === 3) { this._opBannerT = 0; this.updateMissionBanner(false); }
        if (this._opBannerT === 0 && Math.random() < 0.1) this.placeMissionBeacon();
      }
    }
  });
})();
