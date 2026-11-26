/* =============================================================================
 * Chrono-Rift — phone & tablet HUD controls
 *
 *  • ⛶ FULL SCREEN button (top, next to the hero card). Uses the Fullscreen API
 *    on Android / iPad; on iPhone (where Safari has no fullscreen for pages) it
 *    explains how to add the game to the Home Screen, which then launches full
 *    screen (see the apple-mobile-web-app meta tags + manifest).
 *  • 👁 HUD button cycles three layouts, remembered on this device:
 *      Full    – everything
 *      Clean   – hides the tutorial card, quest tracker and chat; the quick
 *                buttons fold down to ☰ + 💬; smaller minimap
 *      Combat  – only the hero's bars, the joystick, the skills and the mounts
 *  • the quest tracker and the minimap each get a small – button to fold away
 *    (tap the folded chip to bring them back).
 *  • landscape phones: the quick buttons become one row under the minimap and
 *    the mount buttons sit above the joystick, so nothing stacks on the skills.
 * ============================================================================= */
(function () {
  'use strict';
  const MODES = ['full', 'clean', 'combat'];
  const LABEL = { full: 'Full HUD', clean: 'Clean HUD', combat: 'Combat only' };
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  };

  const ICON_SYS = {
    fsEnter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    fsExit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
    hud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.8"/></svg>',
    map: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><polygon points="15.5,8.5 13.4,13.4 8.5,15.5 10.6,10.6"/></svg>'
  };

  const css = `
  #hud-sys { display: none; position: fixed; top: 6px; left: 158px; z-index: 14; gap: 4px; }
  body.touch-ui #hud-sys { display: flex; }
  body.cr-title-on #hud-sys, body.cr-acct-on #hud-sys, body.epic-cine #hud-sys { display: none !important; }
  #hud-sys button { all: unset; box-sizing: border-box; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
    background: rgba(12,16,28,.78); border: 1.5px solid rgba(243,200,107,.5); color: #f5f2eb; font: 700 14px/1 Inter, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.45); }
  #hud-sys button svg, #minimap-wrap.folded .hud-fold svg { width: 14px; height: 14px; fill: none; stroke: #f5f2eb; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; display: block; }
  #hud-sys button:active { transform: scale(.92); }
  #hud-sys button.pulse { animation: hudPulse 1.6s ease-in-out 4; }
  @keyframes hudPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(243,200,107,.0); } 50% { box-shadow: 0 0 0 7px rgba(243,200,107,.35); } }
  #hud-toast { position: fixed; left: 50%; top: 52px; transform: translateX(-50%); z-index: 70; pointer-events: none; opacity: 0; transition: opacity .25s;
    background: rgba(10,14,24,.92); color: #f5f2eb; border: 1px solid rgba(243,200,107,.5); border-radius: 10px; padding: 8px 12px; font: 600 12.5px/1.4 Inter, sans-serif; max-width: min(86vw, 420px); text-align: center; }
  #hud-toast.on { opacity: 1; }
  /* fold buttons */
  .hud-fold { all: unset; cursor: pointer; font: 800 12px/1 Inter, sans-serif; color: #f3c86b; padding: 2px 6px; border-radius: 6px; background: rgba(0,0,0,.35); margin-left: auto; }
  #story-tracker.folded > :not(.story-tracker-head) { display: none !important; }
  #minimap-wrap .hud-fold { position: absolute; top: 2px; left: 2px; z-index: 2; font-size: 11px; padding: 1px 4px; }
  #minimap-wrap.folded { padding: 0 !important; background: transparent !important; border: none !important; box-shadow: none !important; }
  #minimap-wrap.folded > :not(.hud-fold) { display: none !important; }
  #minimap-wrap.folded .hud-fold { position: static; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; font-size: 14px;
    background: rgba(12,16,28,.78); border: 1.5px solid rgba(243,200,107,.5); }
  /* clean */
  body.touch-ui.hud-clean #tut-pill, body.touch-ui.hud-clean #story-tracker, body.touch-ui.hud-clean #style-rank .hits,
  body.touch-ui.hud-clean #party-panel .currency-pills, body.touch-ui.hud-clean #travel-bar button.locked,
  body.touch-ui.hud-clean #mmo-quick button:not([data-a="menu"]):not([data-a="chat"]) { display: none !important; }
  body.touch-ui.hud-clean #minimap-canvas { width: 64px !important; height: 64px !important; }
  body.touch-ui.hud-clean .minimap-caption { display: none !important; }
  body.touch-ui.hud-clean #mmo-quick { top: 82px !important; }
  /* combat only */
  body.touch-ui.hud-combat #tut-pill, body.touch-ui.hud-combat #story-tracker, body.touch-ui.hud-combat #minimap-wrap,
  body.touch-ui.hud-combat #mmo-quick button:not([data-a="menu"]), body.touch-ui.hud-combat #style-rank,
  body.touch-ui.hud-combat #party-panel .hero-name-line, body.touch-ui.hud-combat #party-panel .hero-sub-line,
  body.touch-ui.hud-combat #party-panel .currency-pills, body.touch-ui.hud-combat #party-panel .class-badge { display: none !important; }
  body.touch-ui.hud-combat #party-panel { width: 126px !important; padding: 4px 6px !important; }
  body.touch-ui.hud-combat #mmo-quick { top: 6px !important; }
  body.touch-ui.hud-clean:not(.chat-open) #chat-panel, body.touch-ui.hud-combat:not(.chat-open) #chat-panel { display: none !important; }
  /* landscape phones: compact quick buttons in one row under the minimap, mounts above the joystick */
  @media (max-height: 500px) {
    body.touch-ui #mmo-quick { flex-direction: row-reverse !important; top: 82px !important; bottom: auto !important; right: 6px !important; gap: 5px !important; }
    body.touch-ui #mmo-quick button { width: 30px !important; height: 30px !important; font-size: 14px !important; }
    body.touch-ui #mmo-quick button svg { width: 15px !important; height: 15px !important; }
    body.touch-ui.hud-clean #minimap-canvas { width: 56px !important; height: 56px !important; }
    body.touch-ui.hud-clean #mmo-quick, body.touch-ui.hud-combat #mmo-quick { top: 70px !important; }
    body.touch-ui.hud-combat #mmo-quick { top: 6px !important; }
    body.touch-ui #travel-bar { right: auto !important; left: 12px !important; top: auto !important; bottom: 118px !important; flex-direction: row !important; gap: 6px !important; }
    body.touch-ui #travel-bar button { width: 30px !important; height: 30px !important; }
  }`;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld };

  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function fsSupported() {
    const el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen) && document.fullscreenEnabled !== false;
  }
  const isIOS = /iP(hone|od|ad)/.test(navigator.platform) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initMobileHud(); } catch (e) { console.warn('[MobileHud]', e); }
    },

    initMobileHud() {
      if (document.getElementById('hud-sys')) return;
      const st = document.createElement('style'); st.id = 'hud-sys-css'; st.textContent = css; document.head.appendChild(st);
      const bar = document.createElement('div'); bar.id = 'hud-sys';
      bar.innerHTML = `<button data-a="fs" aria-label="Full screen">${ICON_SYS.fsEnter}</button><button data-a="hud" aria-label="HUD layout">${ICON_SYS.hud}</button>`;
      document.body.appendChild(bar);
      const toast = document.createElement('div'); toast.id = 'hud-toast'; document.body.appendChild(toast);
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (this.audio) this.audio.init();
        if (b.dataset.a === 'fs') this.toggleFullscreen();
        else this.cycleHudMode();
      });
      this._hudBar = bar;
      // first visit on a touch device: draw the eye to the full-screen button
      if (!standalone() && !ls.get('cr_fs_hinted')) { ls.set('cr_fs_hinted', '1'); bar.firstChild.classList.add('pulse'); }
      ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => this.refreshFsButton()));
      const isCoarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      this.setHudMode(ls.get('cr_hud_mode') || (isCoarse ? 'clean' : 'full'), true);
      this.addHudFolds();
      this.refreshFsButton();
      window.addEventListener('resize', () => setTimeout(() => this.hudSysPlace(), 60));
    },

    hudToast(msg, ms) {
      const t = document.getElementById('hud-toast'); if (!t) return;
      t.innerHTML = msg; t.classList.add('on');
      clearTimeout(this._hudToastT);
      this._hudToastT = setTimeout(() => t.classList.remove('on'), ms || 1600);
    },

    // ---- full screen ---------------------------------------------------------------
    toggleFullscreen() {
      if (fsElement()) {
        (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
        return;
      }
      if (!fsSupported()) {
        if (standalone()) { this.hudToast('Already running full screen.'); return; }
        this.hudToast(isIOS
          ? 'iPhone can’t go full screen inside Safari.<br>Tap <b>Share</b> ↑ then <b>Add to Home Screen</b> — the game then opens full screen.'
          : 'Full screen isn’t available in this browser. Try Chrome, or add the game to your Home Screen.', 6000);
        return;
      }
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      try {
        const p = req.call(el, { navigationUI: 'hide' });
        if (p && p.catch) p.catch(() => this.hudToast('Full screen was blocked. Tap ⛶ again.'));
      } catch (e) { this.hudToast('Full screen was blocked. Tap ⛶ again.'); }
    },

    refreshFsButton() {
      const b = this._hudBar && this._hudBar.querySelector('[data-a="fs"]'); if (!b) return;
      const on = !!fsElement();
      b.innerHTML = on ? ICON_SYS.fsExit : ICON_SYS.fsEnter;
      b.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
      if (on) b.classList.remove('pulse');
      setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
    },

    // ---- HUD layouts ---------------------------------------------------------------
    cycleHudMode() {
      const cur = MODES.indexOf(this._hudMode || 'full');
      this.setHudMode(MODES[(cur + 1) % MODES.length]);
    },

    setHudMode(m, silent) {
      if (!MODES.includes(m)) m = 'full';
      this._hudMode = m;
      MODES.forEach(k => document.body.classList.toggle('hud-' + k, k === m && k !== 'full'));
      requestAnimationFrame(() => this.hudSysPlace());
      if (m !== 'full') document.body.classList.remove('chat-open');
      ls.set('cr_hud_mode', m);
      if (!silent) this.hudToast(`✦ ${LABEL[m]}${m === 'full' ? '' : ' — tap layout button again to change'}`);
    },

    // ---- fold buttons on the quest tracker and the minimap ---------------------------------
    addHudFolds() {
      const tr = document.getElementById('story-tracker');
      const head = tr && tr.querySelector('.story-tracker-head');
      if (head && !head.querySelector('.hud-fold')) {
        const b = document.createElement('span'); b.className = 'hud-fold'; b.setAttribute('role', 'button'); b.setAttribute('aria-label', 'Fold quests');
        head.style.display = 'flex'; head.style.alignItems = 'center';
        head.appendChild(b);
        const set = (f) => { tr.classList.toggle('folded', f); b.textContent = f ? '+' : '–'; ls.set('cr_fold_quests', f ? '1' : ''); };
        b.addEventListener('click', (e) => { e.stopPropagation(); set(!tr.classList.contains('folded')); });
        set(ls.get('cr_fold_quests') === '1');
      }
      const mm = document.getElementById('minimap-wrap');
      if (mm && !mm.querySelector('.hud-fold')) {
        const b = document.createElement('button'); b.className = 'hud-fold'; b.setAttribute('aria-label', 'Fold minimap');
        if (getComputedStyle(mm).position === 'static') mm.style.position = 'relative';
        mm.appendChild(b);
        const set = (f) => { mm.classList.toggle('folded', f); b.innerHTML = f ? ICON_SYS.map : '–'; ls.set('cr_fold_map', f ? '1' : ''); };
        b.addEventListener('click', (e) => { e.stopPropagation(); set(!mm.classList.contains('folded')); });
        set(ls.get('cr_fold_map') === '1');
      }
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      // keep the system buttons just right of the hero card (its width differs on tablets)
      this._hudSysT = (this._hudSysT || 0) - dt;
      if (this._hudSysT <= 0) { this._hudSysT = 0.5; this.hudSysPlace(); }
    },

    hudSysPlace() {
      if (!this._hudBar || !this.touchUI) return;
      const pp = document.getElementById('party-panel');
      if (!pp || !pp.offsetParent) return;
      const rect = pp.getBoundingClientRect();
      const left = Math.round(rect.right + 5) + 'px';
      if (this._hudBar.style.left !== left) this._hudBar.style.left = left;
      const chip = document.getElementById('cr-obj-chip');
      if (chip) {
        const top = Math.round(rect.bottom + 5) + 'px';
        if (chip.style.top !== top) chip.style.top = top;
      }
    }
  });
})();
