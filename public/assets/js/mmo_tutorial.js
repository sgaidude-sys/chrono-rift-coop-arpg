/* =============================================================================
 * Chrono-Rift — in-play tutorial + controls sheet
 *
 *  A floating glass objective pill (upper-left, under the minimap) teaches the
 *  game while you play — no pauses, no walls of text:
 *    1. Move [W][A][S][D] + orbit [RMB-drag]  — walk 10 m
 *    2. Sprint (keep moving)                  — sprint ~1 s; the stamina arc pulses
 *    3. Dodge roll [SPACE]                    — roll once
 *    4. Perfect Parry [RMB] on the glint      — a Training Sentinel appears and
 *                                               swings telegraphed strikes at you
 *    5. Skill [1]/[2] + Talents [K]           — cast a skill, open the talent tree
 *  Progress persists (localStorage + mmoState). "Skip" in the pill, "Replay Tutorial"
 *  in Settings, and a keybind sheet on [F1] / [H] at any time.
 * ============================================================================= */
(function () {
  'use strict';
  const isTouch = () => document.body.classList.contains('touch-ui');
  const kc = (k) => `<span class="ui-kc tut-k">${k}</span>`;

  const STEPS = [
    { id: 'move', title: 'Find your footing',
      text: () => isTouch() ? `Drag the joystick to move` : `${kc('W')}${kc('A')}${kc('S')}${kc('D')} Move · ${kc('RMB')} drag to look`,
      goal: 10, unit: 'm' },
    { id: 'sprint', title: 'Sprint & stamina',
      text: () => isTouch() ? `Keep moving to sprint` : `Hold ${kc('W')} to break into a sprint`,
      sub: 'Sprinting drains the golden stamina arc.', goal: 1, unit: 's' },
    { id: 'dodge', title: 'Dodge roll',
      text: () => isTouch() ? `Tap 💨 to dodge roll` : `Press ${kc('SPACE')} to dodge roll`,
      sub: 'You are untouchable for a split second.' },
    { id: 'parry', title: 'Perfect Parry',
      text: () => isTouch() ? `Tap 🛡️ as the Sentinel glints` : `${kc('RMB')} right as it glints`,
      sub: 'Watch for the golden flash, then block.' },
    { id: 'skill', title: 'Skills & talents',
      text: () => isTouch() ? `Tap a skill, then ✦ Talents in ☰` : `Cast ${kc('1')} or ${kc('2')}, then open ${kc('K')} Talents`,
      sub: 'Skills break posture. Talents shape your style.' }
  ];

  const CSS = `
  #tut-pill { position: relative; width: 280px; padding: 10px 14px 11px; border-radius: 14px; pointer-events: auto; color: #F5F2EB;
    background: linear-gradient(180deg, rgba(14,17,23,.62), rgba(14,17,23,.48)); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
    border: 1px solid rgba(212,175,55,.35); box-shadow: 0 10px 28px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.06);
    font-family: 'Plus Jakarta Sans', Inter, sans-serif; animation: tutIn .32s cubic-bezier(.2,.7,.2,1); }
  #tut-pill.out { animation: tutOut .3s ease-in forwards; }
  @keyframes tutIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: none; } }
  @keyframes tutOut { to { opacity: 0; transform: translateX(-12px); } }
  #tut-pill .tp-head { display: flex; align-items: center; gap: 8px; white-space: nowrap; font-size: 9.5px; font-weight: 800; letter-spacing: 1.6px; color: #D4AF37; text-transform: uppercase; }
  #tut-pill .tp-head i { width: 6px; height: 6px; transform: rotate(45deg); background: #D4AF37; box-shadow: 0 0 6px #D4AF37; }
  #tut-pill .tp-skip { white-space: nowrap; margin-left: auto; background: none; border: 0; color: rgba(245,242,235,.55); font: 600 10px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: .5px; cursor: pointer; padding: 2px 4px; text-transform: none; }
  #tut-pill .tp-skip:hover { color: #F5F2EB; }
  #tut-pill .tp-title { font: 700 14px 'Cinzel', serif; letter-spacing: 1px; margin: 5px 0 6px; }
  #tut-pill .tp-text { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 600; line-height: 1.5; }
  #tut-pill .tp-sub { margin-top: 4px; font-size: 11px; color: rgba(245,242,235,.6); }
  #tut-pill .tp-prog { margin-top: 9px; height: 2px; background: rgba(255,255,255,.1); overflow: hidden; }
  #tut-pill .tp-prog > i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, rgba(212,175,55,.6), #F3D98A); box-shadow: 0 0 6px rgba(212,175,55,.8); transition: width .25s ease-out; }
  #tut-pill .tp-checks { display: flex; gap: 12px; margin-top: 6px; font-size: 10.5px; color: rgba(245,242,235,.6); }
  #tut-pill .tp-checks span.ok { color: #F3D98A; }
  #tut-pill .tp-checks span::before { content: '◇ '; } #tut-pill .tp-checks span.ok::before { content: '◆ '; }
  #tut-pill .tut-k { animation: tutKey 1.6s ease-in-out infinite; }
  #tut-pill .tut-k:nth-child(2) { animation-delay: .2s; } #tut-pill .tut-k:nth-child(3) { animation-delay: .4s; } #tut-pill .tut-k:nth-child(4) { animation-delay: .6s; }
  @keyframes tutKey { 0%, 70%, 100% { transform: none; box-shadow: 0 2px 0 rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.25); }
    80% { transform: translateY(2px); box-shadow: 0 0 0 rgba(0,0,0,.45), 0 0 10px rgba(212,175,55,.5); } }
  #tut-pill.done-step .tp-title::after { content: ' ✓'; color: #F3D98A; }
  #tut-pill.done-step { box-shadow: 0 0 0 1px rgba(212,175,55,.7), 0 0 26px rgba(212,175,55,.35); transition: box-shadow .25s; }
  #tut-pill .tp-burst { position: absolute; left: 22px; top: 14px; width: 6px; height: 6px; pointer-events: none; }
  #tut-pill .tp-burst::before { content: ''; position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; transform: translate(-50%,-50%) rotate(45deg); border: 1px solid #F3D98A; animation: tutBurst .6s ease-out forwards; }
  @keyframes tutBurst { to { width: 60px; height: 60px; opacity: 0; } }
  body.touch-ui #tut-pill { width: 188px; max-width: 46vw; padding: 7px 9px; }
  body.touch-ui #tut-pill .tp-title { font-size: 12px; margin: 3px 0 4px; }
  body.touch-ui #tut-pill .tp-text { font-size: 11px; }
  body.touch-ui #tut-pill .tp-sub { display: none; }
  #stamina-ring.tut-hi { opacity: 1 !important; filter: drop-shadow(0 0 8px rgba(212,175,55,.9)); animation: tutRing .9s ease-in-out infinite alternate; }
  @keyframes tutRing { to { filter: drop-shadow(0 0 16px rgba(243,217,138,1)); } }
  #tut-hint { position: fixed; left: 50%; top: 30%; transform: translateX(-50%); z-index: 20; pointer-events: none; font: 700 14px 'Plus Jakarta Sans', Inter, sans-serif;
    color: #F5F2EB; letter-spacing: .5px; text-shadow: 0 1px 2px #000, 0 0 10px rgba(0,0,0,.6); opacity: 0; transition: opacity .25s; }
  #tut-hint.show { opacity: 1; }

  /* controls sheet */
  #controls-modal .modal-box { max-width: 760px; }
  #controls-modal .cs-head { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; margin-bottom: 16px; border-bottom: 1px solid rgba(212,175,55,.35); }
  #controls-modal .cs-head h2 { font: 700 18px 'Cinzel', serif; letter-spacing: 3px; }
  #controls-modal .cs-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px 28px; }
  #controls-modal h4 { font: 800 10px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 2.5px; color: #D4AF37; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
  #controls-modal h4::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(212,175,55,.35), transparent); }
  #controls-modal .cs-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 5px 0; font: 600 12.5px 'Plus Jakarta Sans', Inter, sans-serif; color: rgba(245,242,235,.85); }
  #controls-modal .cs-row .ks { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  @media (max-width: 640px) { #controls-modal .cs-grid { grid-template-columns: 1fr; } }
  `;

  const SHEET = [
    ['Movement', [['Move', ['W', 'A', 'S', 'D']], ['Sprint', ['Hold move']], ['Dodge roll · cancels attacks', ['SPACE']], ['Jump', ['ALT']], ['Orbit / tilt camera', ['RMB drag', 'Q', 'E', 'Z', 'X']], ['Zoom', ['Wheel']]]],
    ['Combat', [['Combo attack', ['LMB', '1']], ['Block · Perfect Guard (tap just before a hit)', ['RMB', 'G']], ['Heavy skill', ['2']], ['Movement skill', ['SHIFT', '3']], ['Class skill', ['4', 'V']], ['Awakened Overdrive (100% synergy)', ['R']]]],
    ['Combo moves', [['Lunge at an enemy ahead', ['W', '+ LMB']], ['Launch into the air', ['S', '+ LMB']], ['Slam down (Breaker)', ['F']], ['Juggle', ['Hit airborne foes']], ['Down attack +30%', ['Hit floored foes']], ['Style rank D→SSS', ['Mix moves', 'Avoid hits']]]],
    ['Class specials', [['Berserker · Meteor Crash', ['3 in mid-air']], ['Vanguard · Shield Counter', ['Perfect Guard']], ['Ranger · Hover Fire', ['Attack in mid-air']], ['Arcanist · Suspend foes', ['4']]]],
    ['Items & world', [['Elixir', ['C']], ['Interact / talk', ['F']], ['World map', ['M']], ['Quest log', ['O']], ['Chat', ['Enter']]]],
    ['Menus', [['Talents', ['K']], ['Emote wheel (hold)', ['T']], ['Inventory', ['I']], ['Controls (this sheet)', ['F1', 'H']], ['Close any window', ['ESC']]]]
  ];

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld };

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initTutorial(); } catch (e) { console.warn('[Tutorial] init failed', e); }
    },

    tutKey() { return `cr_tutorial_v1_${this.heroSaveToken}`; },
    loadTut() { try { return JSON.parse(localStorage.getItem(this.tutKey()) || 'null'); } catch (e) { return null; } },
    saveTut(s) {
      try { localStorage.setItem(this.tutKey(), JSON.stringify(s)); } catch (e) { /* storage blocked */ }
      if (this.mmoState) this.mmoState.tutorial = s.state;
    },

    initTutorial() {
      if (this._tutInit) return;
      this._tutInit = true;
      const st = document.createElement('style'); st.id = 'tut-css'; st.textContent = CSS; document.head.appendChild(st);
      const hint = document.createElement('div'); hint.id = 'tut-hint'; document.body.appendChild(hint);
      this.buildControlsSheet();
      // F1 / H = controls sheet (capture phase: runs before the main key handler)
      window.addEventListener('keydown', (e) => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        if (e.key === 'F1' || e.key === 'h' || e.key === 'H') {
          e.preventDefault(); e.stopImmediatePropagation();
          if (e.repeat || this.cutsceneActive) return;
          const open = document.getElementById('controls-modal').classList.contains('active');
          if (open) this.closeModals(); else if (this.isInWorld && (!this.isAnyModalOpen || open)) this.openControlsSheet();
        }
      }, true);
      // returning players (progress from before the tutorial existed) are never forced through it
      const s = this.loadTut() || (this.mmoState && this.mmoState.tutorial ? { state: this.mmoState.tutorial, step: 0 } : null);
      if (!s && (this.player.level || 1) >= 5) this.saveTut({ state: 'done', step: STEPS.length });
      this._tutWait = 2.5;            // let the region banner play first
    },

    buildControlsSheet() {
      if (document.getElementById('controls-modal')) return;
      const m = document.createElement('div');
      m.id = 'controls-modal'; m.className = 'modal-backdrop';
      const groups = SHEET.map(([g, rows]) => `<div><h4>${g}</h4>${rows.map(([label, keys]) =>
        `<div class="cs-row"><span>${label}</span><span class="ks">${keys.map(k => `<span class="ui-kc">${k}</span>`).join('')}</span></div>`).join('')}</div>`).join('');
      m.innerHTML = `<div class="modal-box"><div class="cs-head"><h2>Controls</h2><button class="mini-btn" data-close>✕ Close [ESC]</button></div><div class="cs-grid">${groups}</div></div>`;
      document.body.appendChild(m);
      m.querySelector('[data-close]').onclick = () => this.closeModals();
    },

    openControlsSheet() { this.openModal('controls-modal'); },

    // =========================================================================
    // Flow
    // =========================================================================
    startTutorial(step) {
      this._tut = { step: step || 0, prog: 0, last: this.player.pos.clone(), parries0: this._parries || 0, skill: false, talents: false, doneT: 0 };
      this.saveTut({ state: 'active', step: this._tut.step });
      this.renderTutPill(true);
    },

    replayTutorial() {
      this.endTutorial(null, true);
      this.startTutorial(0);
    },

    skipTutorial() {
      this.saveTut({ state: 'skipped', step: this._tut ? this._tut.step : 0 });
      this.endTutorial('Tutorial skipped · Controls on [F1]');
    },

    endTutorial(msg, silent) {
      this.removeSentinel();
      const sr = document.getElementById('stamina-ring'); if (sr) sr.classList.remove('tut-hi');
      const pill = document.getElementById('tut-pill');
      this._tut = null;
      if (pill) {
        if (silent) pill.remove();
        else { pill.classList.add('out'); setTimeout(() => pill.remove(), 320); }
      }
      if (msg && !silent) this.tutHint(msg, 2.6);
    },

    tutHint(text, sec) {
      const h = document.getElementById('tut-hint'); if (!h) return;
      h.innerHTML = text; h.classList.add('show');
      clearTimeout(this._tutHintT);
      this._tutHintT = setTimeout(() => h.classList.remove('show'), (sec || 1.6) * 1000);
    },

    renderTutPill(fresh) {
      const T = this._tut; if (!T) return;
      const S = STEPS[T.step];
      let pill = document.getElementById('tut-pill');
      if (!pill) {
        pill = document.createElement('div'); pill.id = 'tut-pill';
        const col = document.getElementById('hud-left-col');
        const party = document.getElementById('party-panel');
        if (col) { if (party && party.parentNode === col) col.insertBefore(pill, party.nextSibling); else col.insertBefore(pill, col.firstChild); }
        else document.body.appendChild(pill);
        pill.addEventListener('click', (e) => { if (e.target.closest('.tp-skip')) this.skipTutorial(); });
      } else if (fresh) { pill.style.animation = 'none'; void pill.offsetWidth; pill.style.animation = ''; }
      pill.classList.remove('done-step');
      const checks = S.id === 'skill' ? `<div class="tp-checks"><span class="${T.skill ? 'ok' : ''}">Skill cast</span><span class="${T.talents ? 'ok' : ''}">Talents opened</span></div>` : '';
      pill.innerHTML = `<div class="tp-head"><i></i>Tutorial · ${T.step + 1} / ${STEPS.length}<button class="tp-skip" title="Skip the tutorial">Skip ✕</button></div>
        <div class="tp-title">${S.title}</div><div class="tp-text">${S.text()}</div>${S.sub ? `<div class="tp-sub">${S.sub}</div>` : ''}${checks}
        <div class="tp-prog"><i></i></div>`;
      this._tutBar = pill.querySelector('.tp-prog > i');
      this.setTutProgress(S.goal ? T.prog / S.goal : (S.id === 'skill' ? ((T.skill ? 0.5 : 0) + (T.talents ? 0.5 : 0)) : 0));
      const sr = document.getElementById('stamina-ring');
      if (sr) sr.classList.toggle('tut-hi', S.id === 'sprint');
      if (S.id === 'parry') this.spawnSentinel();
    },

    setTutProgress(f) { if (this._tutBar) this._tutBar.style.width = Math.round(Math.min(1, f) * 100) + '%'; },

    completeTutStep() {
      const T = this._tut; if (!T || T.doneT > 0) return;
      const pill = document.getElementById('tut-pill');
      this.setTutProgress(1);
      if (pill) {
        pill.classList.add('done-step');
        const b = document.createElement('div'); b.className = 'tp-burst'; pill.appendChild(b);
      }
      if (this.audio && this.audio.playSample) this.audio.playSample('chime', 1.25, 0.4);
      T.doneT = 0.9;
    },

    advanceTut() {
      const T = this._tut; if (!T) return;
      T.step++; T.prog = 0; T.doneT = 0;
      if (T.step >= STEPS.length) {
        this.saveTut({ state: 'done', step: STEPS.length });
        this.endTutorial('<span style="font-family:Cinzel,serif;letter-spacing:3px">YOU ARE READY, HERO</span><br><small style="opacity:.7">Controls any time on [F1]</small>');
        return;
      }
      this.saveTut({ state: 'active', step: T.step });
      if (STEPS[T.step].id === 'parry') T.parries0 = this._parries || 0;
      this.renderTutPill(true);
    },

    updateTutorial(dt) {
      if (!this.isInWorld || this.cutsceneActive) return;
      if (!this._tut) {
        if (this._tutWait > 0) {
          this._tutWait -= dt;
          if (this._tutWait <= 0) {
            const s = this.loadTut();
            if (!s || s.state === 'active') this.startTutorial(s ? Math.min(s.step || 0, STEPS.length - 1) : 0);
          }
        }
        return;
      }
      const T = this._tut, p = this.player, S = STEPS[T.step];
      if (T.doneT > 0) { T.doneT -= dt; if (T.doneT <= 0) this.advanceTut(); this.updateSentinel(dt); return; }
      if (S.id === 'move') {
        const d = Math.hypot(p.pos.x - T.last.x, p.pos.z - T.last.z);
        if (d < 2 && !this._roll) T.prog += d;          // ignore teleports / warps
        T.last.copy(p.pos);
        this.setTutProgress(T.prog / S.goal);
        if (T.prog >= S.goal) this.completeTutStep();
      } else if (S.id === 'sprint') {
        if (this._sprinting) T.prog += dt;
        this.setTutProgress(T.prog / S.goal);
        if (T.prog >= S.goal) this.completeTutStep();
      } else if (S.id === 'dodge') {
        if (this._roll) this.completeTutStep();
      } else if (S.id === 'parry') {
        this.updateSentinel(dt);
        if ((this._parries || 0) > T.parries0) { this.completeTutStep(); this.sentinelDefeated(); }
      } else if (S.id === 'skill') {
        const cds = p.cooldowns || {};
        const casted = [1, 2, 3, 4].some(k => (cds[k] || 0) > 0.05);
        const talOpen = !!document.querySelector('#talent-modal.active');
        let changed = false;
        if (casted && !T.skill) { T.skill = true; changed = true; }
        if (talOpen && !T.talents) { T.talents = true; changed = true; }
        if (changed) {
          const c = document.querySelectorAll('#tut-pill .tp-checks span');
          if (c[0]) c[0].classList.toggle('ok', T.skill);
          if (c[1]) c[1].classList.toggle('ok', T.talents);
          this.setTutProgress((T.skill ? 0.5 : 0) + (T.talents ? 0.5 : 0));
        }
        if (T.skill && T.talents) this.completeTutStep();
      }
    },

    // =========================================================================
    // Training Sentinel: a local practice dummy with telegraphed, parryable swings
    // =========================================================================
    spawnSentinel() {
      if (this._sentinel) return;
      const p = this.player;
      const fwd = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
      const pos = p.pos.clone().addScaledVector(fwd, 3.0); pos.y = 0;
      if (this.resolveObstacleCollisions) this.resolveObstacleCollisions(pos, 0.6);
      const root = new THREE.Group(); root.position.copy(pos);
      const wood = new THREE.MeshStandardMaterial({ color: 0x8a6239, roughness: 0.85 });
      const straw = new THREE.MeshStandardMaterial({ color: 0xd8b56a, roughness: 0.95, emissive: 0x000000 });
      const steel = new THREE.MeshStandardMaterial({ color: 0xb9c2cf, roughness: 0.35, metalness: 0.6, emissive: 0x000000 });
      [straw, steel].forEach(m => { m.userData.origEmissive = m.emissive.clone(); m.userData.origEmissiveIntensity = 1; });
      const add = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; (parent || root).add(m); return m; };
      add(new THREE.CylinderGeometry(0.55, 0.65, 0.18, 18), wood, 0, 0.09, 0);
      add(new THREE.CylinderGeometry(0.07, 0.08, 1.9, 8), wood, 0, 0.95, 0);
      const body = add(new THREE.CylinderGeometry(0.34, 0.28, 0.95, 12), straw, 0, 1.25, 0);
      add(new THREE.SphereGeometry(0.24, 14, 10), straw, 0, 1.95, 0);
      add(new THREE.TorusGeometry(0.3, 0.035, 6, 16), wood, 0, 1.55, 0).rotation.x = Math.PI / 2;
      const shoulder = new THREE.Group(); shoulder.position.set(0.36, 1.55, 0); root.add(shoulder);
      add(new THREE.BoxGeometry(0.1, 0.1, 0.55), wood, 0, 0, 0.22, shoulder);
      const blade = add(new THREE.BoxGeometry(0.06, 0.16, 1.15), steel, 0, 0, 0.95, shoulder);
      body.rotation.y = 0.1;
      this.scene.add(root);
      if (this.spawnShockwaveRing) this.spawnShockwaveRing(new THREE.Vector3(pos.x, 0.05, pos.z), 2.4, 0xd4af37, 0.4);
      this._sentinel = {
        id: 'tutorial_sentinel', name: 'Training Sentinel', pos: root.position, meshRoot: root, shoulder, blade,
        materials: [straw, steel], isBoss: false, isElite: false, dead: false, posture: 0, staggerTimer: 0, level: 1, dmg: 6,
        desiredHeight: 2.1, plateY: 2.6, yaw: 0, phase: 'idle', t: 1.2, glinted: false, flashT: 0, fadeT: 0, hits: 0
      };
      this.tutHint('A <b style="color:#F3D98A">Training Sentinel</b> rises — parry its strike', 2.4);
    },

    updateSentinel(dt) {
      const s = this._sentinel; if (!s) return;
      const p = this.player;
      if (s.fadeT > 0) {
        s.fadeT -= dt;
        const k = Math.max(0, s.fadeT / 0.6);
        s.meshRoot.scale.setScalar(0.2 + 0.8 * k);
        s.meshRoot.position.y = (1 - k) * -0.6;
        if (s.fadeT <= 0) this.removeSentinel();
        return;
      }
      // face the hero
      const dx = p.pos.x - s.pos.x, dz = p.pos.z - s.pos.z;
      const want = Math.atan2(dx, dz);
      let d = want - s.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      s.yaw += d * Math.min(1, dt * 6);
      s.meshRoot.rotation.y = s.yaw;
      const dist = Math.hypot(dx, dz);
      if (s.flashT > 0) { s.flashT -= dt; if (s.flashT <= 0 && this.endGlintFlash) this.endGlintFlash(s); }
      s.t -= dt;
      const sh = s.shoulder;
      if (s.phase === 'idle') {
        sh.rotation.x += (-0.2 - sh.rotation.x) * Math.min(1, dt * 6);
        // shuffle into range (it's a practice partner, it comes to you)
        if (dist > 3.0 && dist < 12) {
          const mv = Math.min(dist - 2.8, 3.2 * dt);
          s.pos.x += dx / dist * mv; s.pos.z += dz / dist * mv;
        }
        if (s.t <= 0) {
          if (dist > 7) { s.t = 0.6; if (!s._farHint) { s._farHint = true; this.tutHint('Get closer to the Sentinel', 1.4); } return; }
          s.phase = 'windup'; s.t = 0.95; s.glinted = false;
        }
      } else if (s.phase === 'windup') {
        // coil: raise the blade high behind the head
        const k = 1 - s.t / 0.95;
        sh.rotation.x = -0.2 - 2.1 * (1 - Math.pow(1 - k, 2));
        s.meshRoot.scale.set(1.02, 0.96 + 0.0 * k, 1.02);
        if (!s.glinted && s.t <= 0.25) {
          s.glinted = true;
          if (this.glintFlash) { this.glintFlash(s); s.flashT = 0.14; }
        }
        if (s.t <= 0) { s.phase = 'strike'; s.t = 0.12; this.sentinelStrike(dist); }
      } else if (s.phase === 'strike') {
        sh.rotation.x += (1.35 - sh.rotation.x) * Math.min(1, dt * 30);
        s.meshRoot.scale.set(1, 1, 1);
        if (s.t <= 0) { s.phase = 'recover'; s.t = 0.5; }
      } else if (s.phase === 'recover') {
        sh.rotation.x += (-0.2 - sh.rotation.x) * Math.min(1, dt * 4);
        if (s.t <= 0) { s.phase = 'idle'; s.t = 1.1; }
      }
    },

    sentinelStrike(dist) {
      const s = this._sentinel, p = this.player;
      if (this.spawnSlashArc) this.spawnSlashArc(s.pos, s.yaw, 3.2, 0xd4af37, 0, false);
      if (dist > 4.2) return;
      if (p.dodgeTimer > 0) { this.tutHint('Dodged! Now try a <b>parry</b> instead', 1.6); return; }
      const r = this.defendStrike ? this.defendStrike(s, s.dmg) : 'hit';
      if (r === 'parry') return;                        // perfectParry already ran (counts this._parries)
      s.hits++;
      if (r === 'block') this.tutHint('Blocked, but too early. Press right on the <b style="color:#F3D98A">glint</b>', 1.8);
      else {
        this.damagePlayer(Math.max(1, Math.round(p.maxHp * 0.02)), 'Training Sentinel', 1);
        this.tutHint(s.hits > 2 ? 'Tip: tap block <b>just as</b> the gold flash appears' : 'Too late! Block on the <b style="color:#F3D98A">glint</b>', 1.8);
      }
    },

    sentinelDefeated() {
      const s = this._sentinel; if (!s) return;
      if (this.spawnShockwaveRing) this.spawnShockwaveRing(new THREE.Vector3(s.pos.x, 0.6, s.pos.z), 3.2, 0xf3d98a, 0.45);
      if (this.vfxSparks) this.vfxSparks(new THREE.Vector3(s.pos.x, 1.3, s.pos.z), 36, { cols: [0xf3d98a, 0xffffff], speed: [5, 12], life: [0.3, 0.6], grav: 8 });
      this.tutHint('<b style="color:#F3D98A">PERFECT PARRY!</b> Parries crush enemy posture', 2.2);
      s.fadeT = 0.6;
    },

    removeSentinel() {
      const s = this._sentinel; if (!s) return;
      this._sentinel = null;
      this.scene.remove(s.meshRoot);
      s.meshRoot.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (this._tutInit) this.updateTutorial(dt);
    }
  });

  window.CR_TUTORIAL = { STEPS };
})();
