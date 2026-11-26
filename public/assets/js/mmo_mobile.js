// =============================================================================
// CHRONO-RIFT TOUCH UI — phone & tablet layout, thumb action cluster, aim assist,
// hold-to-attack, pinch zoom, slide-out menu & chat.
// Active on touch devices or windows narrower than 900px.
// =============================================================================
(function () {
  'use strict';
  const GP = ChronoRiftCoOpGame.prototype;
  const origInit = GP.initMMOWorld;
  const origUseSkill = GP.useSkill;
  const origOpenModal = GP.openModal;
  const origUpdateMMOWorld = GP.updateMMOWorld;
  const origApplyDamage = GP.applyDamageToMonster;
  const origGainXP = GP.gainXP;

  const css = `
  body.touch-ui #hud-top { top: 6px; left: 6px; right: 6px; gap: 6px; }
  body.touch-ui #party-panel { width: 188px !important; min-width: 0 !important; max-width: 46vw; padding: 7px 8px !important; gap: 4px !important; }
  body.touch-ui #party-panel .hero-name-line { font-size: 12.5px !important; }
  body.touch-ui #party-panel .hero-sub-line { font-size: 10px !important; }
  body.touch-ui #hud-weapon-label, body.touch-ui #party-panel .hero-sub-line > span:nth-child(2) { display: none !important; }
  body.touch-ui #party-panel .class-badge { width: 26px !important; height: 26px !important; font-size: 13px !important; }
  body.touch-ui #party-panel .currency-pills { transform: scale(0.72); transform-origin: top right; }
  body.touch-ui #party-panel .stat-bar { height: 11px !important; }
  body.touch-ui #party-panel .stat-bar-label { font-size: 8.5px !important; }
  body.touch-ui #coop-roster { display: none !important; }
  body.touch-ui #party-panel .stat-bar:has(#hud-xp-fill) { height: 5px !important; }
  body.touch-ui #party-panel .stat-bar:has(#hud-xp-fill) .stat-bar-label { display: none !important; }
  body.touch-ui .mmo-trk-t { font-size: 10.5px !important; }
  body.touch-ui .mmo-trk-p { font-size: 9.5px !important; }
  body.touch-ui #story-tracker { display: block !important; width: 188px !important; max-width: 46vw; padding: 6px 8px !important; }
  body.touch-ui #story-tracker .story-tracker-head button, body.touch-ui #story-tracker .story-chapters-row { display: none !important; }
  body.touch-ui #story-tracker .story-tracker-title { font-size: 10.5px !important; }
  body.touch-ui #story-tracker .mmo-trk:nth-child(n+3) { display: none; }
  body.touch-ui #story-tracker .story-obj-line { font-size: 10.5px !important; }
  body.touch-ui .zone-pill { display: none !important; }
  body.touch-ui #center-banner { position: fixed !important; top: 112px; left: 50%; transform: translateX(-50%); width: min(92vw, 420px); }
  body.touch-ui #boss-hud { padding: 6px 10px !important; }
  body.touch-ui #boss-name-label { font-size: 12px !important; }
  body.touch-ui #network-panel { display: none !important; }
  body.touch-ui.menu-open #network-panel { display: flex !important; position: fixed; top: 0; right: 0; bottom: 0; width: min(320px, 86vw); z-index: 60; overflow-y: auto; border-radius: 0; padding-top: 48px !important; }
  body.touch-ui.menu-open #mmo-menu-close { display: block; }
  #mmo-menu-close { display: none; position: fixed; top: 8px; right: 10px; z-index: 61; }
  body.touch-ui #minimap-wrap { top: 6px !important; right: 6px !important; bottom: auto !important; padding: 4px !important; }
  body.touch-ui #minimap-canvas { width: 92px !important; height: 92px !important; }
  body.touch-ui .minimap-caption { font-size: 8px !important; max-width: 96px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #mmo-quick { display: none; }
  body.touch-ui #mmo-quick { display: flex; position: fixed; right: 8px; top: 128px; flex-direction: column; gap: 7px; z-index: 12; }
  #mmo-quick button { width: 42px; height: 42px; border-radius: 50%; font-size: 19px; padding: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(12,16,28,0.82); border: 1.5px solid rgba(243,200,107,0.55); color: #F5F2EB; box-shadow: 0 3px 10px rgba(0,0,0,0.5); }
  #mmo-quick button svg { width: 19px; height: 19px; fill: none; stroke: #F5F2EB; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; display: block; }
  #mmo-quick button:active { transform: scale(0.92); }
  body.touch-ui #chat-panel { display: none !important; }
  body.touch-ui.chat-open #chat-panel { display: flex !important; position: fixed; left: 8px; right: 8px; top: 120px; bottom: auto; width: auto; max-height: 45vh; z-index: 55; }
  body.touch-ui #hud-bottom { left: auto; right: 8px; bottom: 14px; transform: none; }
  body.touch-ui #skill-tooltip { display: none !important; }
  body.touch-ui #skill-bar { position: relative; width: 240px; height: 200px; padding: 0 !important; background: none !important; border: none !important; box-shadow: none !important; display: block !important; }
  body.touch-ui #skill-bar .skill-slot { position: absolute; width: 56px; height: 56px; border-radius: 50%; padding: 0 !important; justify-content: center; }
  body.touch-ui #skill-bar .skill-name, body.touch-ui #skill-bar .skill-key { display: none !important; }
  body.touch-ui #skill-bar .skill-icon { font-size: 24px !important; margin: 0 !important; }
  body.touch-ui #skill-bar .skill-cd-overlay { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; }
  body.touch-ui #slot-1 { width: 84px !important; height: 84px !important; right: 4px; bottom: 6px; border-width: 2.5px !important; }
  body.touch-ui #slot-1 .skill-icon { font-size: 36px !important; }
  body.touch-ui #slot-2 { right: 98px; bottom: 4px; }
  body.touch-ui #slot-3 { right: 90px; bottom: 72px; }
  body.touch-ui #slot-4 { right: 34px; bottom: 102px; }
  body.touch-ui #slot-jump { right: 0; width: 50px !important; height: 50px !important; bottom: 164px; }
  body.touch-ui #slot-potion { right: 162px; bottom: 4px; width: 48px !important; height: 48px !important; }
  body.touch-ui #slot-5 { right: 154px; bottom: 64px; }
  body.touch-ui #touch-joystick { display: block !important; left: 18px; bottom: 26px; width: 128px; height: 128px; pointer-events: none;
    opacity: 0.42; transition: opacity 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
    border: 1.5px solid rgba(212,175,55,0.45); background: radial-gradient(circle, rgba(20,26,42,0.35), rgba(8,11,20,0.55)); }
  body.touch-ui #touch-joystick.active { opacity: 0.96; border-color: rgba(255,213,107,0.9);
    box-shadow: 0 0 22px rgba(212,175,55,0.32), inset 0 0 14px rgba(255,213,107,0.14); }
  body.touch-ui #touch-knob { width: 52px; height: 52px; top: 36px; left: 36px;
    background: radial-gradient(circle at 38% 32%, #fff3c4, #D4AF37 65%, #9a7420); box-shadow: 0 2px 10px rgba(0,0,0,0.55); }
  @media (max-width: 430px) and (orientation: portrait) {
    body.touch-ui #skill-bar { transform: scale(0.88); transform-origin: bottom right; }
    body.touch-ui #touch-joystick { width: 112px; height: 112px; }
    body.touch-ui #touch-knob { width: 46px; height: 46px; top: 31px; left: 31px; }
  }
  body.touch-ui #mmo-xpbar { width: 100vw; bottom: 0; height: 7px; border-radius: 0; border-left: 0; border-right: 0; }
  body.touch-ui #mmo-xp-text { display: none; }
  body.touch-ui #interact-prompt { bottom: 240px !important; left: 50% !important; transform: translateX(-50%) !important; font-size: 14px; padding: 10px 16px !important; }
  body.touch-ui #loot-toast-container { top: 210px !important; }
  body.touch-ui #mmo-zone-banner .zb-title { font-size: 25px; }
  body.touch-ui #mmo-zone-banner .zb-sub { font-size: 11px; }
  body.touch-ui .modal-backdrop { padding: 6px !important; }
  body.touch-ui .modal-box { padding: 12px 12px !important; max-height: 96vh !important; border-radius: 12px !important; }
  body.touch-ui .modal-hero-banner { flex-wrap: wrap; gap: 8px; padding: 10px !important; }
  body.touch-ui .modal-title { font-size: 15px !important; }
  body.touch-ui .mmo-equip-grid { grid-template-columns: repeat(2, 1fr); }
  body.touch-ui #inv-backpack-grid { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)) !important; }
  body.touch-ui #mmo-item-tip { left: 8px !important; right: 8px; max-width: none; top: auto !important; bottom: 12px; }
  /* landscape phones: shrink the cluster and the cards */
    @media (max-height: 500px) {
    body.touch-ui #skill-bar { transform: scale(0.8); transform-origin: bottom right; }
    body.touch-ui #touch-joystick { width: 110px; height: 110px; bottom: 18px; }
    body.touch-ui #touch-knob { top: 29px; left: 29px; }
    body.touch-ui #story-tracker { display: none !important; }
    body.touch-ui #center-banner { top: 8px; width: min(40vw, 360px); }
    body.touch-ui #mmo-quick { top: 112px; flex-direction: row; right: 6px; top: auto; bottom: 186px; }
    body.touch-ui #mmo-quick button { width: 38px; height: 38px; font-size: 17px; }
    body.touch-ui #mmo-quick button svg { width: 17px; height: 17px; }
    body.touch-ui #interact-prompt { bottom: 150px !important; }
  }
  /* tablets: bigger targets */
  @media (min-width: 700px) and (min-height: 700px) {
    body.touch-ui #skill-bar { transform: scale(1.18); transform-origin: bottom right; }
    body.touch-ui #party-panel, body.touch-ui #story-tracker { width: 240px !important; }
    body.touch-ui #minimap-canvas { width: 124px !important; height: 124px !important; }
    body.touch-ui #mmo-quick { top: 160px; }
    body.touch-ui #center-banner { top: 14px; width: min(46vw, 460px); }
  }
  body.touch-ui #game-canvas { touch-action: none; }
  /* start screen: 2x2 class picker, keyboard help hidden, Enter button pinned */
  body.touch-ui #hero-modal .class-grid { grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
  body.touch-ui #hero-modal .class-card { padding: 10px 9px !important; }
  body.touch-ui #hero-modal .class-card h3 { font-size: 13px !important; margin: 0 !important; }
  body.touch-ui #hero-modal .class-card p, body.touch-ui #hero-modal .class-weapons-tag { display: none !important; }
  body.touch-ui #hero-modal .modal-box > div:last-child > div:first-child { display: none !important; }
  body.touch-ui #hero-modal .modal-box > div:last-child { position: sticky; bottom: -12px; background: rgba(9,12,22,0.97); padding: 10px 0 4px !important; margin-top: 8px; }
  body.touch-ui #hero-modal .modal-box > div:last-child .cta-btn { width: 100%; padding: 14px !important; font-size: 15px !important; }
  `;

  function isTouchUI() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return coarse || window.innerWidth < 900;
  }

  Object.assign(GP, {
    initMMOWorld() {
      origInit.call(this);
      this.initTouchUI();
    },

    initTouchUI() {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      const apply = () => {
        const on = isTouchUI();
        document.body.classList.toggle('touch-ui', on);
        this.touchUI = on;
        if (on && window.innerHeight > window.innerWidth && !this._userZoomed) this.cameraZoom = 21;
      };
      apply();
      window.addEventListener('resize', apply);

      // quick buttons
      const qSvg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
      const quick = document.createElement('div');
      quick.id = 'mmo-quick';
      quick.innerHTML = `
        <button aria-label="Menu" data-a="menu">${qSvg('<path d="M4 7h16M4 12h16M4 17h16"/>')}</button>
        <button aria-label="World map" data-a="map">${qSvg('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>')}</button>
        <button aria-label="Gear" data-a="gear">${qSvg('<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>')}</button>
        <button aria-label="Quests" data-a="quests">${qSvg('<path d="M6 4h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M8 9h7M8 13h7M8 17h4"/>')}</button>
        <button aria-label="Chat" data-a="chat">${qSvg('<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 3z"/>')}</button>`;
      document.body.appendChild(quick);
      quick.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.audio.init();
        const a = b.getAttribute('data-a');
        if (a === 'menu') document.body.classList.toggle('menu-open');
        else if (a === 'map') this.openWorldMap(this.isAtWaypoint ? this.isAtWaypoint() : false);
        else if (a === 'gear') this.openModal('inventory-modal');
        else if (a === 'quests') this.openQuestLog();
        else if (a === 'chat') {
          document.body.classList.toggle('chat-open');
          if (document.body.classList.contains('chat-open')) setTimeout(() => document.getElementById('chat-input')?.focus(), 50);
        }
      });
      const close = document.createElement('button');
      close.id = 'mmo-menu-close';
      close.className = 'mini-btn';
      close.textContent = '✕ Close';
      close.addEventListener('click', () => document.body.classList.remove('menu-open'));
      document.body.appendChild(close);
      // closing the menu after picking an action from it
      document.getElementById('network-panel')?.addEventListener('click', (e) => {
        if (e.target.closest('button') && this.touchUI) setTimeout(() => document.body.classList.remove('menu-open'), 120);
      });

      // hold-to-attack on the big attack button (pointerId-scoped)
      const atk = document.getElementById('slot-1');
      let atkPid = null;
      if (atk) {
        atk.addEventListener('pointerdown', (e) => {
          if (!this.touchUI) return;
          e.preventDefault();
          e.stopPropagation();
          if (this.audio) this.audio.init();
          atkPid = e.pointerId;
          try { atk.setPointerCapture && atk.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          this._touchAttack = true;
          this.mouseDownLeft = true;
        });
        const stopAtk = (e) => {
          if (atkPid !== null && e && e.pointerId !== undefined && e.pointerId !== atkPid) return;
          atkPid = null;
          if (this._touchAttack) { this._touchAttack = false; this.mouseDownLeft = false; }
        };
        atk.addEventListener('pointerup', stopAtk);
        atk.addEventListener('pointercancel', stopAtk);
        atk.addEventListener('pointerleave', (e) => {
          if (atk.hasPointerCapture && atk.hasPointerCapture(e.pointerId)) return;
          stopAtk(e);
        });
      }
      // skill buttons should not leak taps to the 3D canvas
      document.querySelectorAll('#skill-bar .skill-slot').forEach((el) => {
        el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      });

      // unified multi-touch canvas controller: floating left thumbstick + right-half orbit + 2-finger pinch/tilt
      this._floatingJoy = true;
      const joy = document.getElementById('touch-joystick');
      const knob = document.getElementById('touch-knob');
      const touches = new Map();
      let joyPid = null, joyOrigin = { x: 0, y: 0 }, pinchStart = 0, zoomStart = 0;

      const resetJoystick = () => {
        joyPid = null;
        this.touchVec.set(0, 0);
        if (joy) {
          joy.classList.remove('active');
          joy.style.left = ''; joy.style.top = ''; joy.style.bottom = '';
        }
        if (knob) knob.style.transform = 'translate(0px, 0px)';
      };
      this.resetTouchControls = () => {
        resetJoystick();
        atkPid = null;
        this._touchAttack = false;
        this.mouseDownLeft = false;
        touches.clear();
        pinchStart = 0;
        this._pinchMidY = undefined;
      };
      const getCamTouches = () => [...touches.values()].filter(t => t.role === 'cam');
      const syncPinch = () => {
        const cam = getCamTouches();
        if (cam.length >= 2) {
          cam.forEach(c => { c.moved = true; });
          pinchStart = Math.hypot(cam[0].x - cam[1].x, cam[0].y - cam[1].y);
          zoomStart = this.cameraZoom;
          this._pinchMidY = (cam[0].y + cam[1].y) / 2;
        } else {
          pinchStart = 0;
          this._pinchMidY = undefined;
        }
      };

      this.canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch' || !this.touchUI || e.target !== this.canvas) return;
        if (this.isAnyModalOpen || this.cutsceneActive || !this.isInWorld) return;
        if (this.audio) this.audio.init();
        let role = 'cam';
        if (joyPid === null && e.clientX < window.innerWidth * 0.48 && e.clientY > 88) {
          role = 'joy';
          joyPid = e.pointerId;
          const half = ((joy && joy.offsetWidth) || 128) * 0.5;
          const ox = Math.max(half + 10, Math.min(window.innerWidth * 0.48, e.clientX));
          const oy = Math.max(100, Math.min(window.innerHeight - half - 12, e.clientY));
          joyOrigin = { x: ox, y: oy };
          if (joy) {
            joy.style.left = Math.round(ox - half) + 'px';
            joy.style.top = Math.round(oy - half) + 'px';
            joy.style.bottom = 'auto';
            joy.classList.add('active');
          }
          const maxR = 44;
          let dx = e.clientX - ox, dy = e.clientY - oy;
          const dist = Math.hypot(dx, dy);
          if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
          if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.touchVec.set(dx / maxR, dy / maxR);
        }
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, role, moved: false });
        if (role === 'cam') syncPinch();
      });

      window.addEventListener('pointermove', (e) => {
        const t = touches.get(e.pointerId);
        if (!t) return;
        t.x = e.clientX; t.y = e.clientY;
        if (t.role === 'joy' && e.pointerId === joyPid) {
          const maxR = 44;
          let dx = e.clientX - joyOrigin.x, dy = e.clientY - joyOrigin.y;
          const dist = Math.hypot(dx, dy);
          if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
          if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.touchVec.set(dx / maxR, dy / maxR);
        } else if (t.role === 'cam') {
          const cam = getCamTouches();
          if (cam.length >= 2 && pinchStart > 0) {
            const d = Math.hypot(cam[0].x - cam[1].x, cam[0].y - cam[1].y);
            this.cameraZoom = Math.max(10, Math.min(30, zoomStart * pinchStart / Math.max(20, d)));
            this._userZoomed = true;
            const midY = (cam[0].y + cam[1].y) / 2;
            if (this._pinchMidY !== undefined) {
              const dy = midY - this._pinchMidY;
              if (this.cameraPitch === undefined) this.cameraPitch = 0.6454;
              this.cameraPitch = Math.max(0.08, Math.min(1.28, this.cameraPitch + dy * 0.006));
            }
            this._pinchMidY = midY;
            t.moved = true;
            t.lastX = e.clientX; t.lastY = e.clientY;
          } else if (cam.length === 1) {
            const dx = e.clientX - t.lastX, dy = e.clientY - t.lastY;
            t.lastX = e.clientX; t.lastY = e.clientY;
            if (!t.moved && Math.hypot(e.clientX - t.startX, e.clientY - t.startY) > 6) t.moved = true;
            if (t.moved) {
              this.cameraYaw -= dx * 0.0068;
              if (this.cameraPitch === undefined) this.cameraPitch = 0.6454;
              this.cameraPitch = Math.max(0.12, Math.min(1.25, this.cameraPitch + dy * 0.0042));
            }
          }
        }
      });

      const endTouch = (e) => {
        const t = touches.get(e.pointerId);
        if (!t) return;
        const wasSingleCamTap = t.role === 'cam' && !t.moved && pinchStart === 0 && e.type === 'pointerup';
        touches.delete(e.pointerId);
        if (t.role === 'joy' && e.pointerId === joyPid) resetJoystick();
        else if (t.role === 'cam') {
          syncPinch();
          if (wasSingleCamTap) this.tryTouchTapNPC(e.clientX, e.clientY);
        }
      };
      window.addEventListener('pointerup', endTouch);
      window.addEventListener('pointercancel', endTouch);
      window.addEventListener('blur', () => this.resetTouchControls && this.resetTouchControls());
    },

    haptic(pattern) {
      if (!this.touchUI || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
      if (window.CR_COMFORT && window.CR_COMFORT.get().haptics === false) return;
      const now = performance.now();
      if (now - (this._lastHapticAt || 0) < 45) return;
      this._lastHapticAt = now;
      try { navigator.vibrate(pattern); } catch (e) { /* unsupported */ }
    },

    tryTouchTapNPC(clientX, clientY) {
      if (!this.townNPCs || !this.townNPCs.length || !this.raycaster || !this.camera || !this.openNPCModal) return false;
      this.mouseNDC.x = (clientX / window.innerWidth) * 2 - 1;
      this.mouseNDC.y = -(clientY / window.innerHeight) * 2 + 1;
      if (this.updateMouseWorld) this.updateMouseWorld();
      const npcRoots = this.townNPCs.map(n => n.meshRoot).filter(Boolean);
      if (npcRoots.length) {
        this.raycaster.setFromCamera(this.mouseNDC, this.camera);
        const hits = this.raycaster.intersectObjects(npcRoots, true);
        if (hits.length > 0) {
          let obj = hits[0].object;
          while (obj && !obj.userData?.npcId) obj = obj.parent;
          if (obj && obj.userData?.npcId) { this.openNPCModal(obj.userData.npcId); return true; }
        }
      }
      if (this.mouseWorld) {
        for (let i = 0; i < this.townNPCs.length; i++) {
          const npc = this.townNPCs[i];
          if (Math.hypot(this.mouseWorld.x - npc.pos.x, this.mouseWorld.z - npc.pos.z) < 1.6) {
            this.openNPCModal(npc.id); return true;
          }
        }
      }
      return false;
    },

    // Aim assist on touch: skills target the nearest enemy (or straight ahead)
    touchAim() {
      const p = this.player;
      let best = null, bd = 16 * 16;
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (m.dead || (m.meshRoot && !m.meshRoot.visible)) continue;
        const d = (m.pos.x - p.pos.x) ** 2 + (m.pos.z - p.pos.z) ** 2;
        if (d < bd) { bd = d; best = m; }
      }
      this._touchTarget = best;
      const target = best
        ? new THREE.Vector3(best.pos.x, 0, best.pos.z)
        : new THREE.Vector3(p.pos.x + Math.sin(p.yaw) * 6, 0, p.pos.z + Math.cos(p.yaw) * 6);
      if (this.terrainVisualHeight) target.y = this.terrainVisualHeight(target.x, target.z);
      const v = target.project(this.camera);
      this.mouseNDC.set(v.x, v.y);
    },

    updateTouchAssist(dt) {
      if (!this.touchUI || !this.isInWorld || !this.player || this.player.dead) {
        if (this._touchRing) this._touchRing.visible = false;
        return;
      }
      const p = this.player;
      let best = null, bd = 15 * 15;
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (m.dead || (m.meshRoot && !m.meshRoot.visible)) continue;
        const dSq = (m.pos.x - p.pos.x) ** 2 + (m.pos.z - p.pos.z) ** 2;
        if (dSq < bd) { bd = dSq; best = m; }
      }
      this._touchTarget = best;

      // Ground target lock-on ring
      if (best && this.scene) {
        if (!this._touchRing) {
          const geo = new THREE.RingGeometry(0.92, 1.18, 32);
          geo.rotateX(-Math.PI / 2);
          this._touchRing = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: 0xffd56b, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
          }));
          this.scene.add(this._touchRing);
        }
        const hy = this.terrainVisualHeight ? this.terrainVisualHeight(best.pos.x, best.pos.z) : 0;
        this._touchRing.position.set(best.pos.x, hy + 0.09, best.pos.z);
        this._touchRing.scale.setScalar(best.isBoss ? 2.2 : (best.isElite ? 1.35 : 1.0));
        this._touchRing.material.color.setHex(best.isBoss ? 0xff4b6e : 0xffd56b);
        this._touchRing.rotation.z += dt * 1.6;
        this._touchRing.visible = true;
      } else if (this._touchRing) {
        this._touchRing.visible = false;
      }

      // Magnetic melee step-in when holding Attack without steering
      const joyMag = this.touchVec ? Math.hypot(this.touchVec.x, this.touchVec.y) : 0;
      if (this._touchAttack && !this.isAnyModalOpen && !this.cutsceneActive && best && joyMag < 0.15
          && p.leapTimer <= 0 && p.dodgeTimer <= 0 && p.spinTimer <= 0
          && (p.classId === 'vanguard' || p.classId === 'berserker')) {
        const dx = best.pos.x - p.pos.x, dz = best.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.1 && d <= 6.0) {
          const nx = dx / d, nz = dz / d;
          const clsSpd = (typeof HERO_CLASSES !== 'undefined' && HERO_CLASSES[p.classId] ? HERO_CLASSES[p.classId].speed : 8.5)
            * (this.getMoveSpeedMult ? this.getMoveSpeedMult() : 1) * 0.85;
          const step = Math.min(d - 1.9, clsSpd * dt);
          const half = (window.MMO && window.MMO.WORLD ? window.MMO.WORLD.half : 500) - 10;
          const px = p.pos.x, pz = p.pos.z;
          p.pos.x = Math.max(-half, Math.min(half, p.pos.x + nx * step));
          p.pos.z = Math.max(-half, Math.min(half, p.pos.z + nz * step));
          if (this.worldClampMove) this.worldClampMove(p.pos, px, pz);
          if (this.resolveObstacleCollisions) this.resolveObstacleCollisions(p.pos, 0.55);
          p.yaw = Math.atan2(nx, nz);
          if (p.meshRoot) { p.meshRoot.position.x = p.pos.x; p.meshRoot.position.z = p.pos.z; p.meshRoot.rotation.y = p.yaw; }
          this.touchAim();
        }
      }
    },

    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork) {
      const local = this.touchUI && !fromNetwork && (!attacker || attacker === this.player) && mob && !mob.dead;
      const r = origApplyDamage ? origApplyDamage.apply(this, arguments) : undefined;
      if (local) this.haptic(mob.dead ? 26 : (isHeavy ? 20 : 10));
      return r;
    },

    gainXP(amount, showText) {
      const lv0 = this.player ? this.player.level : 0;
      const r = origGainXP ? origGainXP.apply(this, arguments) : undefined;
      if (this.player && this.player.level > lv0) this.haptic([20, 32, 46]);
      return r;
    },

    updateMMOWorld(dt) {
      if (origUpdateMMOWorld) origUpdateMMOWorld.call(this, dt);
      try { this.updateTouchAssist(dt); } catch (e) { /* keep loop alive */ }
    },

    useSkill(slot, isRemoteOrAI = false, actor = null) {
      if (this.touchUI && !isRemoteOrAI && (!actor || actor === this.player) && slot >= 1 && slot <= 4) this.touchAim();
      return origUseSkill.call(this, slot, isRemoteOrAI, actor);
    },

    openModal(id) {
      if (this.touchUI) {
        document.body.classList.remove('menu-open', 'chat-open');
        if (this.resetTouchControls) this.resetTouchControls();
      }
      return origOpenModal.call(this, id);
    }
  });
})();
