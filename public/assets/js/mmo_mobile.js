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
  const origPickupItem = GP.pickupItem;

  const css = `
  body.touch-ui #hud-top { top: 6px; left: 6px; right: 6px; gap: 6px; }
  body.touch-ui #party-panel { width: 152px !important; min-width: 0 !important; max-width: 44vw; padding: 5px 7px !important; gap: 3px !important; border-radius: 10px !important; }
  body.touch-ui #party-panel .hero-header { gap: 4px !important; align-items: center !important; }
  body.touch-ui #party-panel .hero-title-wrap { gap: 5px !important; min-width: 0; }
  body.touch-ui #party-panel .hero-name-line { font-size: 11px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 96px; }
  body.touch-ui #party-panel .hero-sub-line { font-size: 9.5px !important; line-height: 1.1; }
  body.touch-ui #hud-weapon-label, body.touch-ui #party-panel .hero-sub-line > span:nth-child(2) { display: none !important; }
  body.touch-ui #party-panel .class-badge { width: 22px !important; height: 22px !important; font-size: 11px !important; flex: none; }
  body.touch-ui #party-panel .currency-pills { transform: scale(0.7); transform-origin: top right; }
  body.touch-ui #party-panel .bar-group { gap: 2px !important; }
  body.touch-ui #party-panel .stat-bar { height: 9px !important; }
  body.touch-ui #party-panel .stat-bar-label { font-size: 8px !important; justify-content: center !important; padding: 0 4px !important; }
  body.touch-ui #party-panel .stat-bar-label > span:first-child { display: none !important; }
  body.touch-ui #coop-roster { display: none !important; }
  body.touch-ui #party-panel .stat-bar:has(#hud-mp-fill) { height: 3px !important; }
  body.touch-ui #party-panel .stat-bar:has(#hud-mp-fill) .stat-bar-label { display: none !important; }
  body.touch-ui #party-panel .stat-bar:has(#hud-xp-fill) { height: 3px !important; }
  body.touch-ui #party-panel .stat-bar:has(#hud-xp-fill) .stat-bar-label { display: none !important; }
  body.touch-ui .mmo-trk-t { font-size: 10.5px !important; }
  body.touch-ui .mmo-trk-p { font-size: 9.5px !important; }
  body.touch-ui #story-tracker { display: block !important; width: 176px !important; max-width: 46vw; padding: 5px 8px !important; }
  body.touch-ui #story-tracker .story-tracker-head button, body.touch-ui #story-tracker .story-chapters-row { display: none !important; }
  body.touch-ui #story-tracker .story-tracker-title { font-size: 10px !important; }
  body.touch-ui #story-tracker .mmo-trk:nth-child(n+3) { display: none; }
  body.touch-ui #story-tracker .story-obj-line { font-size: 10px !important; }
  body.touch-ui .zone-pill { display: none !important; }
  body.touch-ui #center-banner { position: fixed !important; top: 82px; left: 50%; transform: translateX(-50%); width: min(84vw, 340px); }
  body.touch-ui #boss-hud { padding: 4px 8px !important; }
  body.touch-ui #boss-name-label { font-size: 12px !important; letter-spacing: 2px !important; }
  body.touch-ui #network-panel { display: none !important; }
  body.touch-ui.menu-open #network-panel { display: flex !important; position: fixed; top: 0; right: 0; bottom: 0; width: min(320px, 86vw); z-index: 60; overflow-y: auto; border-radius: 0; padding-top: 48px !important; }
  body.touch-ui.menu-open #mmo-menu-close { display: block; }
  #mmo-menu-close { display: none; position: fixed; top: 8px; right: 10px; z-index: 61; }
  body.touch-ui #minimap-wrap { top: 6px !important; right: 6px !important; bottom: auto !important; padding: 3px !important; }
  body.touch-ui #minimap-canvas { width: 78px !important; height: 78px !important; }
  body.touch-ui .minimap-caption { font-size: 8px !important; max-width: 82px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #mmo-quick { display: none; }
  body.touch-ui #mmo-quick { display: flex; position: fixed; right: 6px; top: 104px; flex-direction: column; gap: 6px; z-index: 12; }
  #mmo-quick button { width: 36px; height: 36px; border-radius: 50%; font-size: 17px; padding: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(12,16,28,0.82); border: 1.5px solid rgba(243,200,107,0.55); color: #F5F2EB; box-shadow: 0 3px 10px rgba(0,0,0,0.5); }
  #mmo-quick button svg { width: 17px; height: 17px; fill: none; stroke: #F5F2EB; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; display: block; }
  #mmo-quick button:active { transform: scale(0.92); }
  body.touch-ui #chat-panel { display: none !important; }
  body.touch-ui.chat-open #chat-panel { display: flex !important; position: fixed; left: 8px; right: 8px; top: 96px; bottom: auto; width: auto; max-height: 44vh; z-index: 55; }
  body.touch-ui #hud-bottom { left: auto; right: 8px; bottom: 12px; transform: none; }
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
    opacity: 0.34; transition: opacity 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
    border: 1.5px solid rgba(212,175,55,0.45); background: radial-gradient(circle, rgba(20,26,42,0.35), rgba(8,11,20,0.55)); }
  body.touch-ui #touch-joystick.active { opacity: 0.94; border-color: rgba(255,213,107,0.9);
    box-shadow: 0 0 22px rgba(212,175,55,0.32), inset 0 0 14px rgba(255,213,107,0.14); }
  body.touch-ui #touch-knob { width: 52px; height: 52px; top: 36px; left: 36px;
    background: radial-gradient(circle at 38% 32%, #fff3c4, #D4AF37 65%, #9a7420); box-shadow: 0 2px 10px rgba(0,0,0,0.55); }
  @media (max-width: 430px) and (orientation: portrait) {
    body.touch-ui #skill-bar { transform: scale(0.86); transform-origin: bottom right; }
    body.touch-ui #touch-joystick { width: 108px; height: 108px; }
    body.touch-ui #touch-knob { width: 44px; height: 44px; top: 30px; left: 30px; }
  }
  body.touch-ui #mmo-xpbar { width: 100vw; bottom: 0; height: 4px; border-radius: 0; border-left: 0; border-right: 0; }
  body.touch-ui #mmo-xp-text { display: none; }
  body.touch-ui #interact-prompt { bottom: 214px !important; left: 50% !important; transform: translateX(-50%) !important; font-size: 13px; padding: 8px 14px !important; }
  body.touch-ui #loot-toast-container { top: 104px !important; }
  body.touch-ui #loot-toast-container .loot-toast:not(:last-child) { display: none !important; }
  body.touch-ui .loot-toast { font-size: 11px !important; padding: 5px 9px !important; }
  body.touch-ui #mmo-zone-banner .zb-title { font-size: 22px; }
  body.touch-ui #mmo-zone-banner .zb-sub { font-size: 11px; }
  body.touch-ui .modal-backdrop { padding: 6px !important; }
  body.touch-ui .modal-box { padding: 10px 10px !important; max-height: 95vh !important; border-radius: 12px !important; }
  body.touch-ui .modal-hero-banner { flex-wrap: wrap; gap: 6px; padding: 8px 10px !important; }
  body.touch-ui .modal-title { font-size: 14px !important; }
  body.touch-ui #inventory-modal .modal-hero-banner > div > div:nth-child(2),
  body.touch-ui #inventory-modal .inv-panel:last-child > div:first-child > div:last-child,
  body.touch-ui #inv-equipped-slots > div:last-child { display: none !important; }
  body.touch-ui #inventory-modal .inv-layout { gap: 8px !important; }
  body.touch-ui #inventory-modal .inv-panel { padding: 8px !important; gap: 6px !important; }
  body.touch-ui #inv-hero-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 10px; font-size: 11px; }
  body.touch-ui #inv-hero-summary .inv-stat-row { font-size: 10.5px !important; padding: 2px 4px !important; gap: 4px; background: rgba(255,255,255,.03); border-radius: 6px; }
  body.touch-ui .mmo-equip-grid { grid-template-columns: repeat(2, 1fr); gap: 5px; }
  body.touch-ui .mmo-eq { min-height: 42px !important; padding: 4px 6px !important; }
  body.touch-ui .mmo-eq-name { font-size: 10.5px !important; }
  body.touch-ui .mmo-eq-stat { font-size: 9.5px !important; }
  body.touch-ui .inv-cat { padding: 4px 8px !important; font-size: 10.5px !important; }
  body.touch-ui #inv-backpack-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)) !important; }
  body.touch-ui #mmo-item-tip { left: 8px !important; right: 8px; max-width: none; top: auto !important; bottom: 12px; }
  @media (max-height: 520px) and (min-width: 560px) {
    body.touch-ui #inventory-modal .inv-layout { display: grid !important; grid-template-columns: 44% 56% !important; gap: 8px !important; }
    body.touch-ui #inventory-modal .inv-panel { max-height: calc(92vh - 70px); overflow-y: auto; }
    body.touch-ui .mmo-equip-grid { grid-template-columns: repeat(3, 1fr) !important; }
  }
  /* landscape phones: shrink the cluster and the cards so center gameplay stays wide open */
  @media (max-height: 500px) {
    body.touch-ui #party-panel { width: 138px !important; padding: 4px 6px !important; }
    body.touch-ui #party-panel .currency-pills { display: none !important; }
    body.touch-ui #party-panel .stat-bar { height: 8px !important; }
    body.touch-ui #minimap-canvas { width: 64px !important; height: 64px !important; }
    body.touch-ui #hud-bottom { right: 6px !important; bottom: 8px !important; }
    body.touch-ui #skill-bar { transform: scale(0.75); transform-origin: bottom right; }
    body.touch-ui #touch-joystick { width: 96px !important; height: 96px !important; left: 12px; bottom: 12px; }
    body.touch-ui #touch-knob { width: 40px !important; height: 40px !important; top: 26px !important; left: 26px !important; }
    body.touch-ui #story-tracker { display: none !important; }
    body.touch-ui #center-banner { top: 4px !important; width: min(44vw, 290px) !important; }
    body.touch-ui #loot-toast-container { top: 50px !important; }
    body.touch-ui #interact-prompt { bottom: 104px !important; font-size: 12px !important; padding: 6px 12px !important; }
  }
  @media (max-height: 410px) {
    body.touch-ui #skill-bar { transform: scale(0.68); transform-origin: bottom right; }
  }
  /* tablets: bigger targets */
  @media (min-width: 700px) and (min-height: 700px) {
    body.touch-ui #skill-bar { transform: scale(1.18); transform-origin: bottom right; }
    body.touch-ui #party-panel, body.touch-ui #story-tracker { width: 220px !important; }
    body.touch-ui #minimap-canvas { width: 116px !important; height: 116px !important; }
    body.touch-ui #mmo-quick { top: 152px; }
    body.touch-ui #center-banner { top: 14px; width: min(46vw, 460px); }
  }
  body.touch-ui #game-canvas { touch-action: none; }
  /* start screen fallback (overridden when hs active) */
  body.touch-ui #hero-modal .class-grid { grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
  body.touch-ui #hero-modal .class-card { padding: 10px 9px !important; }
  body.touch-ui #hero-modal .class-card h3 { font-size: 13px !important; margin: 0 !important; }
  body.touch-ui #hero-modal .class-card p, body.touch-ui #hero-modal .class-weapons-tag { display: none !important; }
  body.touch-ui #hero-modal .modal-box > div:last-child > div:first-child { display: none !important; }
  body.touch-ui #hero-modal .modal-box > div:last-child { position: sticky; bottom: -12px; background: rgba(9,12,22,0.97); padding: 10px 0 4px !important; margin-top: 8px; }
  body.touch-ui #hero-modal .modal-box > div:last-child .cta-btn { width: 100%; padding: 14px !important; font-size: 15px !important; }
  /* Phase 2: One-tap Equip Upgrade Card */
  #cr-equip-card { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(214px + env(safe-area-inset-bottom)); z-index: 46; max-width: min(88vw, 300px);
    display: none; align-items: center; gap: 8px; padding: 7px 8px 7px 11px; border-radius: 10px;
    background: rgba(14,17,24,.94); border: 1px solid rgba(212,175,55,.5); border-left: 3px solid var(--rc, #2ee68a);
    box-shadow: 0 8px 24px rgba(0,0,0,.55), 0 0 18px rgba(46,230,138,.18); color: #F5F2EB; font-family: 'Plus Jakarta Sans', Inter, sans-serif; }
  #cr-equip-card.on { display: flex; animation: crEqIn .24s cubic-bezier(.2,.8,.2,1); }
  @keyframes crEqIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translateX(-50%); } }
  #cr-equip-card .eq-info { flex: 1; min-width: 0; }
  #cr-equip-card .eq-nm { font-size: 11px; font-weight: 800; color: var(--rc, #ffd56b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #cr-equip-card .eq-sub { font-size: 9.5px; color: rgba(245,242,235,.72); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #cr-equip-card .eq-sub b { color: #2ee68a; font-weight: 800; }
  #cr-equip-card .eq-btn { all: unset; cursor: pointer; flex: none; padding: 6px 9px; border-radius: 7px; font: 800 10px/1 'Cinzel', serif; letter-spacing: .08em;
    color: #17120a; background: linear-gradient(180deg, #ffe79a, #D4AF37); box-shadow: 0 2px 8px rgba(212,175,55,.35); }
  #cr-equip-card .eq-btn:active { transform: scale(.94); }
  #cr-equip-card .eq-x { all: unset; cursor: pointer; flex: none; padding: 2px 5px; font: 700 12px Inter, sans-serif; color: rgba(245,242,235,.55); }
  @media (max-height: 500px) {
    #cr-equip-card { left: 50%; transform: translateX(-50%); bottom: calc(10px + env(safe-area-inset-bottom)); max-width: min(42vw, 260px); }
    @keyframes crEqIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translateX(-50%); } }
  }
  body:not(.touch-ui) #cr-equip-card, body.cr-title-on #cr-equip-card, body.cr-acct-on #cr-equip-card, body.hs-open #cr-equip-card,
  body.epic-cine #cr-equip-card, body.cr-prologue #cr-equip-card, body.cr-lyra-call #cr-equip-card { display: none !important; }
  /* Phase 2: Tappable Clean-HUD Objective Chip + Auto-Run */
  #cr-obj-chip { position: fixed; left: 6px; top: 62px; z-index: 14; max-width: 210px; display: none; align-items: center; gap: 5px;
    padding: 4px 9px; border-radius: 999px; cursor: pointer; color: #F5F2EB; font: 700 10.5px/1.2 'Plus Jakarta Sans', Inter, sans-serif;
    background: rgba(14,17,23,.72); border: 1px solid rgba(212,175,55,.42); box-shadow: 0 3px 10px rgba(0,0,0,.38);
    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #cr-obj-chip.on { display: inline-flex; }
  #cr-obj-chip.running { border-color: #2ee68a; color: #b9ffd9; box-shadow: 0 0 14px rgba(46,230,138,.35); }
  #cr-obj-chip:active { transform: scale(.96); }
  @media (max-height: 500px) {
    #cr-obj-chip { max-width: 176px; font-size: 10px; padding: 3px 8px; }
  }
  body:not(.touch-ui) #cr-obj-chip, body.cr-title-on #cr-obj-chip, body.cr-acct-on #cr-obj-chip, body.hs-open #cr-obj-chip,
  body.epic-cine #cr-obj-chip, body.cr-prologue #cr-obj-chip, body.cr-lyra-call #cr-obj-chip, body.hud-combat #cr-obj-chip { display: none !important; }
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
      // skill buttons should not leak taps to the 3D canvas (and cancel auto-run immediately)
      document.querySelectorAll('#skill-bar .skill-slot').forEach((el) => {
        el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        el.addEventListener('pointerdown', () => { if (this._autoRun && this.stopAutoRun) this.stopAutoRun(); });
      });

      // Phase 2: Floating Equip Upgrade Card & Tappable Objective Chip
      if (!document.getElementById('cr-equip-card')) {
        const ec = document.createElement('div');
        ec.id = 'cr-equip-card';
        ec.innerHTML = '<div class="eq-info"><div class="eq-nm"></div><div class="eq-sub"></div></div><button type="button" class="eq-btn">EQUIP</button><button type="button" class="eq-x" aria-label="Dismiss">✕</button>';
        document.body.appendChild(ec);
        ec.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
        ec.querySelector('.eq-btn').addEventListener('click', (e) => { e.stopPropagation(); this.equipCurrentCard(); });
        ec.querySelector('.eq-x').addEventListener('click', (e) => { e.stopPropagation(); this.dismissEquipCard(); });
      }
      if (!document.getElementById('cr-obj-chip')) {
        const oc = document.createElement('button');
        oc.id = 'cr-obj-chip';
        oc.type = 'button';
        oc.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
        oc.addEventListener('click', (e) => { e.stopPropagation(); if (this.audio) this.audio.init(); this.toggleAutoRun(); });
        document.body.appendChild(oc);
      }
      this._equipQueue = [];
      this._equipActive = null;

      // unified multi-touch canvas controller: floating left thumbstick + right-half orbit + 2-finger pinch/tilt
      this._floatingJoy = true;
      const joy = document.getElementById('touch-joystick');
      const knob = document.getElementById('touch-knob');
      const touches = new Map();
      let joyPid = null, joyOrigin = { x: 0, y: 0 }, pinchStart = 0, zoomStart = 0;

      const resetJoystick = () => {
        joyPid = null;
        this._joyActive = false;
        if (!this._autoRun) this.touchVec.set(0, 0);
        if (joy) {
          joy.classList.remove('active');
          joy.style.left = ''; joy.style.top = ''; joy.style.bottom = '';
        }
        if (knob) knob.style.transform = 'translate(0px, 0px)';
      };
      this.resetTouchControls = () => {
        if (this.stopAutoRun) this.stopAutoRun();
        resetJoystick();
        atkPid = null;
        this._touchAttack = false;
        this.mouseDownLeft = false;
        touches.clear();
        this._camTouching = false;
        pinchStart = 0;
        this._pinchMidY = undefined;
      };
      const getCamTouches = () => [...touches.values()].filter(t => t.role === 'cam');
      const syncPinch = () => {
        const cam = getCamTouches();
        this._camTouching = cam.length > 0;
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
          this._joyActive = true;
          if (this._autoRun && this.stopAutoRun) this.stopAutoRun();
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
      try {
        this.updateTouchAssist(dt);
        this.updateAutoRun(dt);
      } catch (e) { /* keep loop alive */ }
    },

    pickupItem(it) {
      const r = origPickupItem ? origPickupItem.apply(this, arguments) : false;
      if (r && this.touchUI && it && this.isUpgrade && this.isUpgrade(it) && this.canEquip && this.canEquip(it)) {
        this.queueEquipCard(it);
      }
      return r;
    },

    queueEquipCard(it) {
      const q = this._equipQueue || (this._equipQueue = []);
      const score = this.itemScore ? this.itemScore(it) : (it.ilvl || 1);
      if (this._equipActive && this._equipActive.slot === it.slot) {
        const curS = this.itemScore ? this.itemScore(this._equipActive) : (this._equipActive.ilvl || 1);
        if (score > curS) {
          this._equipActive = null;
          q.unshift(it);
          this.showNextEquipCard();
        }
        return;
      }
      const existingIdx = q.findIndex(x => x.slot === it.slot);
      if (existingIdx >= 0) {
        const exS = this.itemScore ? this.itemScore(q[existingIdx]) : (q[existingIdx].ilvl || 1);
        if (score > exS) q[existingIdx] = it;
      } else {
        if (q.length >= 3) q.shift();
        q.push(it);
      }
      if (!this._equipActive) this.showNextEquipCard();
    },

    showNextEquipCard() {
      const card = document.getElementById('cr-equip-card');
      if (!card) return;
      clearTimeout(this._equipTimer);
      this._equipActive = null;
      const q = this._equipQueue || [];
      const st = this.mmoState;
      while (q.length) {
        const it = q.shift();
        const inBag = st && st.bag && st.bag.some(b => b.uid === it.uid);
        if (inBag && this.canEquip && this.canEquip(it) && this.isUpgrade && this.isUpgrade(it)) {
          this._equipActive = it;
          const M = window.MMO || {};
          const rar = (M.RARITIES || []).find(r => r.id === it.rarity) || { color: '#2ee68a' };
          const slotDef = (M.EQUIP_SLOTS || []).find(s => s.id === it.slot) || { name: it.slot };
          const cur = st.equip && st.equip[it.slot];
          const delta = Math.max(1, Math.round((this.itemScore ? this.itemScore(it) : 0) - (this.itemScore ? this.itemScore(cur) : 0)));
          card.style.setProperty('--rc', rar.color);
          card.querySelector('.eq-nm').textContent = it.name;
          card.querySelector('.eq-sub').innerHTML = `${slotDef.name} · <b>+${delta} ▲</b>`;
          card.classList.add('on');
          this._equipTimer = setTimeout(() => this.dismissEquipCard(), 9000);
          return;
        }
      }
      card.classList.remove('on');
    },

    equipCurrentCard() {
      const it = this._equipActive;
      const card = document.getElementById('cr-equip-card');
      clearTimeout(this._equipTimer);
      if (card) card.classList.remove('on');
      this._equipActive = null;
      if (it && this.mmoState && this.mmoState.bag.some(b => b.uid === it.uid) && this.canEquip && this.canEquip(it)) {
        this.equipItem(it.uid);
        this.haptic([14, 24, 22]);
        if (this.spawnFloatingText && this.player) this.spawnFloatingText(this.player.pos, 'EQUIPPED!', '#2ee68a', 17);
      }
      this.showNextEquipCard();
    },

    dismissEquipCard() {
      const card = document.getElementById('cr-equip-card');
      clearTimeout(this._equipTimer);
      this._equipActive = null;
      if (card) card.classList.remove('on');
      this.showNextEquipCard();
    },

    getMobileObjectiveTarget() {
      const st = this.mmoState, M = window.MMO, wg = this.worldGen, p = this.player;
      if (!st || !M || !wg || !p) return null;
      if (st.opening && st.opening.stage === 3 && this._opBeacon && this._opBeacon.target) {
        return { x: this._opBeacon.target.x, z: this._opBeacon.target.z, label: 'First Hunt', action: 'combat' };
      }
      if (!this.questDefs || !this.questStatus) return null;
      const ready = this.questDefs.find(q => this.questStatus(q) === 'ready');
      if (ready) {
        const z = wg.zoneById[ready.kind === 'travel' ? ready.target : ready.zone];
        if (z) {
          const pos = z.id === 'meadows' ? [4.5, 15.5] : [z.outpost[0] - 3, z.outpost[1] + 2];
          const giver = ready.kind === 'travel' ? (M.QUEST_GIVERS[ready.target] && M.QUEST_GIVERS[ready.target].name) : ready.giver;
          return { x: pos[0], z: pos[1], label: 'Return: ' + (giver || 'Quest Giver'), action: 'npc' };
        }
      }
      const active = this.questDefs.find(q => this.questStatus(q) === 'active');
      if (active) {
        const z = wg.zoneById[active.zone];
        let t = null;
        if (active.kind === 'explore' && z && z.sites) t = z.sites[active.site];
        else if (active.kind === 'boss' && z) { const bp = this.bossMapPos ? this.bossMapPos(z, false) : null; t = bp ? [bp.x, bp.z] : z.bossPos; }
        else if (active.kind === 'travel') { const nz = wg.zoneById[active.target]; t = nz && nz.outpost; }
        else if (active.kind === 'elite') { const c = wg.camps.find(x => x.elite && x.elite.name === active.target); if (c) t = [c.x, c.z]; }
        else if (active.kind === 'kill' || active.kind === 'collect') {
          let bestMob = null, bm = Infinity;
          (this.monsters || []).forEach((m) => {
            if (m.dead || m.typeKey !== active.target || m.isBoss) return;
            const d = (m.pos.x - p.pos.x) ** 2 + (m.pos.z - p.pos.z) ** 2;
            if (d < bm) { bm = d; bestMob = m; }
          });
          if (bestMob) t = [bestMob.pos.x, bestMob.pos.z];
          else {
            let bestCamp = null, bc = Infinity;
            wg.camps.forEach((c) => {
              if (!c.mob || c.mob.type !== active.target || c.elite) return;
              const d = (c.x - p.pos.x) ** 2 + (c.z - p.pos.z) ** 2;
              if (d < bc) { bc = d; bestCamp = c; }
            });
            if (bestCamp) t = [bestCamp.x, bestCamp.z];
          }
        }
        if (t && isFinite(t[0]) && isFinite(t[1])) {
          return { x: t[0], z: t[1], label: active.title, action: active.kind === 'travel' ? 'npc' : 'combat' };
        }
      }
      const curZ = this.currentMMOZone ? this.currentMMOZone() : null;
      const avail = (curZ && this.questDefs.find(q => q.zone === curZ.id && this.questStatus(q) === 'available' && p.level >= q.minLevel))
        || this.questDefs.find(q => q.zone === 'meadows' && this.questStatus(q) === 'available' && p.level >= q.minLevel)
        || this.questDefs.find(q => this.questStatus(q) === 'available' && p.level >= q.minLevel);
      if (avail) {
        const z = wg.zoneById[avail.zone];
        if (z) {
          const pos = z.id === 'meadows' ? [4.5, 15.5] : [z.outpost[0] - 3, z.outpost[1] + 2];
          return { x: pos[0], z: pos[1], label: 'Quest: ' + ((M.QUEST_GIVERS[z.id] && M.QUEST_GIVERS[z.id].name) || 'Giver'), action: 'npc' };
        }
      }
      return null;
    },

    toggleAutoRun() {
      if (this._autoRun) { this.stopAutoRun(); return; }
      const target = this.getMobileObjectiveTarget();
      if (!target) {
        if (this.hudToast) this.hudToast('No active objective nearby', 1400);
        return;
      }
      this.startAutoRun(target);
    },

    startAutoRun(target) {
      if (!target || !this.player) return;
      this._autoRun = { target, stuckT: 0, sidestepT: 0, sidestepDir: 1, lastX: this.player.pos.x, lastZ: this.player.pos.z, retries: 0, refreshT: 0 };
      const chip = document.getElementById('cr-obj-chip');
      if (chip) chip.classList.add('running');
      const ban = document.getElementById('cr-op-banner');
      if (ban && ban.classList.contains('runnable')) {
        ban.classList.add('running');
        if (this.updateMissionBanner) this.updateMissionBanner(false);
      }
      this.haptic(10);
    },

    stopAutoRun() {
      if (!this._autoRun) return;
      this._autoRun = null;
      if (!this._joyActive && this.touchVec) this.touchVec.set(0, 0);
      const chip = document.getElementById('cr-obj-chip');
      if (chip) chip.classList.remove('running');
      const ban = document.getElementById('cr-op-banner');
      if (ban && ban.classList.contains('running')) {
        ban.classList.remove('running');
        if (this.updateMissionBanner) this.updateMissionBanner(false);
      }
    },

    updateAutoRun(dt) {
      if (!this.touchUI) {
        if (this._autoRun) this.stopAutoRun();
        return;
      }
      this._objChipT = (this._objChipT || 0) - dt;
      if (this._objChipT <= 0) {
        this._objChipT = 0.45;
        const chip = document.getElementById('cr-obj-chip');
        const ban = document.getElementById('cr-op-banner');
        const banOn = !!(ban && ban.classList.contains('on'));
        if (chip) {
          const t = (!banOn && this.isInWorld && !this.cutsceneActive && !this._op) ? this.getMobileObjectiveTarget() : null;
          if (t && this.player) {
            const dist = Math.round(Math.hypot(t.x - this.player.pos.x, t.z - this.player.pos.z));
            const short = t.label.length > 18 ? t.label.slice(0, 17) + '…' : t.label;
            chip.textContent = `${this._autoRun ? '➤' : '✦'} ${short} · ${dist}m`;
            chip.classList.add('on');
            chip.classList.toggle('running', !!this._autoRun);
            if (this.hudSysPlace) this.hudSysPlace();
          } else {
            chip.classList.remove('on');
          }
        }
      }

      const ar = this._autoRun;
      if (!ar) return;
      const p = this.player;
      if (!this.isInWorld || !p || p.dead || this.cutsceneActive || this.isAnyModalOpen) {
        this.stopAutoRun();
        return;
      }
      ar.refreshT += dt;
      if (ar.refreshT >= 0.8) {
        ar.refreshT = 0;
        const next = this.getMobileObjectiveTarget();
        if (!next) { this.stopAutoRun(); return; }
        ar.target = next;
      }
      const target = ar.target;
      const dx = target.x - p.pos.x, dz = target.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      const stopDist = target.action === 'npc' ? 3.2 : 4.5;
      if (d < stopDist) {
        this.stopAutoRun();
        if (target.action === 'npc') {
          this.haptic(10);
          if (this.hudToast) this.hudToast(`✦ Arrived at ${target.label}`, 1600);
        }
        return;
      }
      if (target.action === 'combat' && this._touchTarget && !this._touchTarget.dead) {
        const td = Math.hypot(this._touchTarget.pos.x - p.pos.x, this._touchTarget.pos.z - p.pos.z);
        if (td < 9.5) {
          this.stopAutoRun();
          return;
        }
      }
      ar.stuckT += dt;
      if (ar.stuckT >= 0.7) {
        const moved = Math.hypot(p.pos.x - ar.lastX, p.pos.z - ar.lastZ);
        ar.lastX = p.pos.x; ar.lastZ = p.pos.z; ar.stuckT = 0;
        if (moved < 0.45) {
          ar.retries++;
          if (ar.retries > 2) { this.stopAutoRun(); return; }
          ar.sidestepT = 0.65;
          ar.sidestepDir *= -1;
        } else {
          ar.retries = 0;
        }
      }
      let wx = dx / d, wz = dz / d;
      if (ar.sidestepT > 0) {
        ar.sidestepT -= dt;
        const a = ar.sidestepDir * 0.95;
        const ca = Math.cos(a), sa = Math.sin(a);
        const rx = wx * ca - wz * sa, rz = wx * sa + wz * ca;
        wx = rx; wz = rz;
      }
      const cosY = Math.cos(this.cameraYaw), sinY = Math.sin(this.cameraYaw);
      this.touchVec.set(wx * cosY - wz * sinY, wx * sinY + wz * cosY);
      if (!this._camTouching) {
        const wantYaw = Math.atan2(-wx, -wz);
        let delta = wantYaw - this.cameraYaw;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        this.cameraYaw += delta * Math.min(1, dt * 1.1);
      }
    },

    useSkill(slot, isRemoteOrAI = false, actor = null) {
      if (this.touchUI && !isRemoteOrAI && (!actor || actor === this.player)) {
        if (this._autoRun) this.stopAutoRun();
        if (slot >= 1 && slot <= 4) this.touchAim();
      }
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
