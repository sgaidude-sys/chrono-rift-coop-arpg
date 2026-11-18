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
    background: rgba(12,16,28,0.82); border: 1.5px solid rgba(243,200,107,0.55); color: #fff; box-shadow: 0 3px 10px rgba(0,0,0,0.5); }
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
  body.touch-ui #slot-4 { right: 38px; bottom: 108px; }
  body.touch-ui #slot-jump { right: 0; width: 50px !important; height: 50px !important; bottom: 160px; }
  body.touch-ui #slot-potion { right: 158px; bottom: 4px; width: 48px !important; height: 48px !important; }
  body.touch-ui #slot-5 { right: 150px; bottom: 62px; }
  body.touch-ui #touch-joystick { display: block !important; left: 18px; bottom: 26px; width: 128px; height: 128px; }
  body.touch-ui #touch-knob { width: 52px; height: 52px; top: 36px; left: 36px; }
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
      const quick = document.createElement('div');
      quick.id = 'mmo-quick';
      quick.innerHTML = `
        <button aria-label="Menu" data-a="menu">☰</button>
        <button aria-label="World map" data-a="map">🗺️</button>
        <button aria-label="Gear" data-a="gear">🎒</button>
        <button aria-label="Quests" data-a="quests">📜</button>
        <button aria-label="Chat" data-a="chat">💬</button>`;
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

      // hold-to-attack on the big attack button
      const atk = document.getElementById('slot-1');
      if (atk) {
        atk.addEventListener('pointerdown', (e) => {
          if (!this.touchUI) return;
          e.preventDefault();
          this.audio.init();
          this._touchAttack = true;
          this.mouseDownLeft = true;
        });
        const stop = () => { if (this._touchAttack) { this._touchAttack = false; this.mouseDownLeft = false; } };
        atk.addEventListener('pointerup', stop);
        atk.addEventListener('pointercancel', stop);
        atk.addEventListener('pointerleave', stop);
      }
      // skill buttons should not leak taps to the 3D canvas
      document.querySelectorAll('#skill-bar .skill-slot').forEach((el) => {
        el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      });

      // pinch zoom on the canvas
      const touches = new Map();
      let pinchStart = 0, zoomStart = 0;
      this.canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          const [a, b] = [...touches.values()];
          pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
          zoomStart = this.cameraZoom;
          this.mouseDownLeft = false;
        }
      });
      this.canvas.addEventListener('pointermove', (e) => {
        if (!touches.has(e.pointerId)) return;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2 && pinchStart > 0) {
          const [a, b] = [...touches.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          this.cameraZoom = Math.max(10, Math.min(30, zoomStart * pinchStart / Math.max(20, d)));
          this._userZoomed = true;
          // two fingers dragged up/down together tilt the camera (to look at the sky)
          const midY = (a.y + b.y) / 2;
          if (this._pinchMidY !== undefined) {
            const dy = midY - this._pinchMidY;
            if (this.cameraPitch === undefined) this.cameraPitch = 0.6454;
            this.cameraPitch = Math.max(0.04, Math.min(1.3, this.cameraPitch + dy * 0.006));
          }
          this._pinchMidY = midY;
        }
      });
      const endT = (e) => { touches.delete(e.pointerId); if (touches.size < 2) { pinchStart = 0; this._pinchMidY = undefined; } };
      this.canvas.addEventListener('pointerup', endT);
      this.canvas.addEventListener('pointercancel', endT);
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
      const target = best
        ? new THREE.Vector3(best.pos.x, 0, best.pos.z)
        : new THREE.Vector3(p.pos.x + Math.sin(p.yaw) * 6, 0, p.pos.z + Math.cos(p.yaw) * 6);
      if (this.terrainVisualHeight) target.y = this.terrainVisualHeight(target.x, target.z);
      const v = target.project(this.camera);
      this.mouseNDC.set(v.x, v.y);
    },

    useSkill(slot, isRemoteOrAI = false, actor = null) {
      if (this.touchUI && !isRemoteOrAI && (!actor || actor === this.player) && slot >= 1 && slot <= 4) this.touchAim();
      return origUseSkill.call(this, slot, isRemoteOrAI, actor);
    },

    openModal(id) {
      if (this.touchUI) document.body.classList.remove('menu-open', 'chat-open');
      return origOpenModal.call(this, id);
    }
  });
})();
