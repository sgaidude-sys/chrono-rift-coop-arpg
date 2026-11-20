/* =============================================================================
 * Chrono-Rift — teaching the combat + comfort settings
 *
 *  • Skill tooltips mention the crowd-control each skill now carries.
 *  • One-time COMBAT TIPS appear the first time each situation comes up
 *    (a pack nearby, the first launch, the first stagger, a heavy hit, synergy
 *    full, the style rank climbing). Remembered per device; one at a time.
 *  • Phones / tablets get three small buttons next to the skills for the combo
 *    moves (Lunge, Launch, Breaker), which otherwise need W / S / F.
 *  • COMFORT settings (Settings → 🧘 Comfort): screen shake Full / Reduced / Off,
 *    freeze frames, slow motion, and reduced flashing. Saved per device.
 * ============================================================================= */
(function () {
  'use strict';
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  };
  const COMFORT_KEY = 'cr_comfort_v1';
  const DEF = { shake: 'full', freeze: true, slowmo: true, flash: true };
  const SHAKE_F = { full: 1, reduced: 0.4, off: 0 };
  let C = Object.assign({}, DEF);
  try { C = Object.assign({}, DEF, JSON.parse(ls.get(COMFORT_KEY) || '{}')); } catch (e) { /* keep defaults */ }

  const TIPS = {
    launch: { desk: 'Hold <b>S</b> + attack to <b>LAUNCH</b> an enemy, then keep hitting it to juggle it in the air.', touch: 'Tap <b>⤴</b> to <b>LAUNCH</b> an enemy, then keep hitting it to juggle it in the air.' },
    slam: { desk: 'Press <b>F</b> to <b>SLAM</b> airborne foes into the ground. Floored foes take <b>+30%</b> damage.', touch: 'Tap <b>⤓</b> to <b>SLAM</b> airborne foes into the ground. Floored foes take <b>+30%</b> damage.' },
    lunge: { desk: 'Enemy ahead? Hold <b>W</b> + attack to <b>LUNGE</b> straight into it.', touch: 'Enemy ahead? Tap <b>➶</b> to <b>LUNGE</b> straight into it.' },
    dash: { desk: 'Staggered? <b>SPACE</b> cancels any attack or stagger into a dodge roll.', touch: 'Staggered? The <b>dodge</b> button cancels any attack or stagger into a roll.' },
    guard: { desk: 'Tap <b>RMB</b> just before a hit lands for a <b>PERFECT GUARD</b>: no damage, +1 style rank.', touch: 'Tap the <b>shield</b> just before a hit lands for a <b>PERFECT GUARD</b>: no damage, +1 style rank.' },
    ult: { desk: 'Synergy full! Press <b>R</b> to <b>AWAKEN</b>: 12 s of super armor and faster skills.', touch: 'Synergy full! Tap the <b>R</b> button to <b>AWAKEN</b>: 12 s of super armor and faster skills.' },
    style: { desk: 'Your <b>style rank</b> rises as you mix different moves. Higher ranks mean faster attacks and movement.', touch: 'Your <b>style rank</b> rises as you mix different moves. Higher ranks mean faster attacks and movement.' }
  };
  const TIP_GAP = 20;           // s between tips

  const css = `
  #combat-tip { position: fixed; left: 50%; bottom: 150px; transform: translate(-50%, 10px); z-index: 45; pointer-events: auto; opacity: 0; transition: opacity .3s, transform .3s;
    max-width: min(92vw, 460px); background: rgba(10,14,24,.9); border: 1px solid rgba(243,200,107,.55); border-radius: 12px; padding: 10px 34px 10px 14px;
    color: #f5f2eb; font: 500 13px/1.45 'Plus Jakarta Sans', Inter, sans-serif; box-shadow: 0 8px 26px rgba(0,0,0,.45); }
  #combat-tip.on { opacity: 1; transform: translate(-50%, 0); }
  #combat-tip .ct-h { font: 800 10px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 2.5px; color: #D4AF37; text-transform: uppercase; margin-bottom: 3px; }
  #combat-tip b { color: #ffd56b; }
  #combat-tip .ct-x { all: unset; position: absolute; top: 6px; right: 8px; cursor: pointer; color: rgba(245,242,235,.6); font: 700 14px Inter, sans-serif; padding: 2px 6px; }
  body.touch-ui #combat-tip { bottom: auto; top: 118px; left: 8px; right: 56px; max-width: none; transform: none; font-size: 12px; }
  body.touch-ui #combat-tip.on { transform: none; }
  @media (max-height: 500px) {
    body.touch-ui #combat-tip { top: auto; bottom: 10px; left: 50%; right: auto; max-width: min(44vw, 370px); transform: translate(-50%, 10px); }
    body.touch-ui #combat-tip.on { transform: translate(-50%, 0); }
  }
  body.cr-title-on #combat-tip, body.epic-cine #combat-tip { display: none; }
  /* touch combo-move buttons (inside the skill cluster so they scale with it) */
  #touch-moves { display: none; }
  body.touch-ui #touch-moves { display: flex; position: absolute; left: 0; bottom: 156px; gap: 6px; }
  #touch-moves button { all: unset; box-sizing: border-box; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
    background: rgba(12,16,28,.8); border: 1.5px solid rgba(243,200,107,.55); color: #f5f2eb; font: 800 17px/1 Inter, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.45); }
  #touch-moves button:active { transform: scale(.9); }
  #touch-moves button.cd { opacity: .4; }
  /* comfort */
  #comfort-modal .modal-box { max-width: 440px; }
  #comfort-modal h2 { font: 700 17px 'Cinzel', serif; letter-spacing: 3px; margin: 0; }
  #comfort-modal .cf-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  #comfort-modal .cf-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.07);
    font: 600 13px 'Plus Jakarta Sans', Inter, sans-serif; color: rgba(245,242,235,.9); }
  #comfort-modal .cf-row small { display: block; font-weight: 500; font-size: 11px; color: rgba(245,242,235,.55); margin-top: 2px; }
  #comfort-modal .cf-seg { display: flex; gap: 4px; flex-shrink: 0; }
  #comfort-modal .cf-seg button { all: unset; cursor: pointer; padding: 5px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18); font: 700 11.5px Inter, sans-serif; color: #c9d4ea; }
  #comfort-modal .cf-seg button.on { background: rgba(255,213,107,.18); border-color: #ffd56b; color: #ffd56b; }
  body.cr-noflash #screen-fx.synergy-flash { animation: none !important; opacity: 0 !important; }`;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, applyCameraShake: GP.applyCameraShake,
    cameraKick: GP.cameraKick, slowMo: GP.slowMo, epicFlash: GP.epicFlash, epicEdge: GP.epicEdge, epicLines: GP.epicLines,
    ccApply: GP.ccApply, damagePlayer: GP.damagePlayer
  };

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try {
        if (!document.getElementById('teach-css')) { const st = document.createElement('style'); st.id = 'teach-css'; st.textContent = css; document.head.appendChild(st); }
        this.teachRetextSkills();
        this.teachInitTips();
        this.teachTouchMoves();
        this.comfortInit();
      } catch (e) { console.warn('[Teach]', e); }
    },

    // ---- skill descriptions ----------------------------------------------------------
    teachRetextSkills() {
      if (typeof HERO_CLASSES === 'undefined' || this._teachRetexted) return;
      this._teachRetexted = true;
      const add = (cls, i, extra) => {
        const s = HERO_CLASSES[cls] && HERO_CLASSES[cls].skills[i];
        if (s && s.desc && !s.desc.includes(extra)) s.desc = s.desc + ' ' + extra;
      };
      add('vanguard', 1, 'Pulls nearby foes together, then launches them for the party.');
      add('vanguard', 2, 'PLOUGH: foes along the charge are knocked aside and down. A Perfect Guard releases a SHIELD COUNTER shockwave.');
      add('berserker', 1, 'Drags the whole pack into the tornado.');
      add('berserker', 2, 'The landing slams foes into the ground. Used in mid-air: METEOR CRASH (6.5 m).');
      add('ranger', 0, 'Fired in mid-air: HOVER FIRE keeps you aloft and pops foes into the air.');
      add('ranger', 3, 'Slams airborne foes back into the ground.');
      add('arcanist', 1, 'Pulls foes into the singularity, then launches them.');
      add('arcanist', 3, 'Foes inside the dome are lifted and suspended in mid-air for 2.5 s.');
    },

    // ---- one-time combat tips ------------------------------------------------------------
    teachInitTips() {
      if (document.getElementById('combat-tip')) return;
      const el = document.createElement('div'); el.id = 'combat-tip';
      el.innerHTML = '<div class="ct-h">Combat tip</div><div class="ct-b"></div><button class="ct-x" aria-label="Dismiss">✕</button>';
      document.body.appendChild(el);
      el.querySelector('.ct-x').addEventListener('click', () => this.teachHideTip());
      let seen = {};
      try { seen = JSON.parse(ls.get('cr_tips_seen') || '{}'); } catch (e) { /* none */ }
      this._tips = { el, seen, gap: 8, showing: 0, check: 0 };
    },

    teachTip(id) {
      const T = this._tips;
      if (!T || T.seen[id] || T.showing > 0 || T.gap > 0 || !TIPS[id]) return false;
      if (this.cutsceneActive || this.isAnyModalOpen || !this.isInWorld) return false;
      const tut = document.getElementById('tut-pill');
      if (tut && tut.offsetParent && getComputedStyle(tut).display !== 'none' && getComputedStyle(tut).visibility !== 'hidden') return false;   // tutorial first
      T.seen[id] = 1; ls.set('cr_tips_seen', JSON.stringify(T.seen));
      T.el.querySelector('.ct-b').innerHTML = this.touchUI ? TIPS[id].touch : TIPS[id].desk;
      T.el.classList.add('on');
      T.showing = 9; T.gap = TIP_GAP;
      return true;
    },

    teachHideTip() { const T = this._tips; if (!T) return; T.el.classList.remove('on'); T.showing = 0; },

    // the first launch the hero lands unlocks the slam tip
    ccApply(m, tag, o, caster) {
      const r = orig.ccApply ? orig.ccApply.apply(this, arguments) : false;
      if (r && tag === 'launch' && (!caster || caster === this.player)) this._teachLaunched = true;
      return r;
    },

    teachUpdate(dt) {
      const T = this._tips; if (!T) return;
      if (T.showing > 0) { T.showing -= dt; if (T.showing <= 0) this.teachHideTip(); }
      if (T.gap > 0) T.gap -= dt;
      T.check -= dt; if (T.check > 0) return;
      T.check = 0.5;
      const p = this.player; if (!p || p.dead) return;
      let packN = 0, ahead = false;
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (m.dead || m.isBoss) continue;
        const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, d = Math.hypot(dx, dz);
        if (d < 9) packN++;
        if (d > 4 && d < 10 && (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / d > 0.7) ahead = true;
      }
      if (this._teachLaunched && this.teachTip('slam')) return;
      if ((p._flinchT || 0) > 0 && this.teachTip('dash')) return;
      if ((p.synergy || 0) >= 100 && this.teachTip('ult')) return;
      if (this.styleRank && this.styleRank() >= 2 && this.teachTip('style')) return;
      if (this._teachHurt && this.teachTip('guard')) return;
      if (packN >= 3 && this.teachTip('launch')) return;
      if (ahead && T.seen.launch && this.teachTip('lunge')) return;
    },

    // ---- touch combo-move buttons -----------------------------------------------------------
    teachTouchMoves() {
      const bar = document.getElementById('skill-bar');
      if (!bar || document.getElementById('touch-moves')) return;
      const box = document.createElement('div'); box.id = 'touch-moves';
      box.innerHTML = '<button data-mv="mv_lunge" aria-label="Lunge">➶</button><button data-mv="mv_rise" aria-label="Launch">⤴</button><button data-mv="mv_break" aria-label="Breaker">⤓</button>';
      bar.appendChild(box);
      box.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        e.preventDefault(); e.stopPropagation();
        if (this.audio) this.audio.init();
        if (this.touchAim) this.touchAim();
        if (this.dirMoveTry && !this.dirMoveTry(b.dataset.mv)) b.animate && b.animate([{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], { duration: 160 });
      });
      box.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      this._touchMoveBtns = [...box.querySelectorAll('button')];
    },

    // ---- comfort ---------------------------------------------------------------------------
    comfortInit() {
      // freeze frames: a setter that ignores new freezes while they are switched off
      if (!Object.getOwnPropertyDescriptor(this, 'hitStopTimer') || !Object.getOwnPropertyDescriptor(this, 'hitStopTimer').set) {
        let hs = this.hitStopTimer || 0;
        Object.defineProperty(this, 'hitStopTimer', {
          configurable: true, enumerable: true,
          get() { return hs; },
          set(v) { hs = (!C.freeze && v > 0) ? 0 : v; }
        });
      }
      document.body.classList.toggle('cr-noflash', !C.flash);
      // settings button next to Audio / Graphics
      if (!document.getElementById('btn-comfort')) {
        const anchor = document.getElementById('btn-gfx') || document.getElementById('btn-mute');
        const b = document.createElement('button');
        b.id = 'btn-comfort'; b.className = 'mini-btn'; b.textContent = '🧘 Comfort';
        b.title = 'Screen shake, freeze frames, slow motion, flashing';
        b.onclick = () => this.openComfort();
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(b, anchor.nextSibling); else document.body.appendChild(b);
      }
      if (!document.getElementById('comfort-modal')) {
        const m = document.createElement('div'); m.id = 'comfort-modal'; m.className = 'modal-backdrop';
        m.innerHTML = '<div class="modal-box"><div class="cf-head"><h2>Comfort</h2><button class="mini-btn" data-close>✕ Close</button></div><div class="cf-body"></div></div>';
        document.body.appendChild(m);
        m.querySelector('[data-close]').onclick = () => this.closeModals();
        m.addEventListener('click', (e) => {
          const b = e.target.closest('.cf-seg button'); if (!b) return;
          const k = b.dataset.k, v = b.dataset.v;
          C[k] = (v === 'true') ? true : (v === 'false' ? false : v);
          ls.set(COMFORT_KEY, JSON.stringify(C));
          document.body.classList.toggle('cr-noflash', !C.flash);
          if (k === 'freeze' && !C.freeze) this.hitStopTimer = 0;
          this.renderComfort();
        });
      }
    },

    openComfort() { this.renderComfort(); this.openModal('comfort-modal'); },

    renderComfort() {
      const body = document.querySelector('#comfort-modal .cf-body'); if (!body) return;
      const seg = (k, opts) => `<div class="cf-seg">${opts.map(([v, l]) => `<button data-k="${k}" data-v="${v}" class="${String(C[k]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      body.innerHTML = `
        <div class="cf-row"><div>Screen shake<small>Camera shake and kicks on hits</small></div>${seg('shake', [['full', 'Full'], ['reduced', 'Reduced'], ['off', 'Off']])}</div>
        <div class="cf-row"><div>Freeze frames<small>Brief pause on heavy hits and parries</small></div>${seg('freeze', [['true', 'On'], ['false', 'Off']])}</div>
        <div class="cf-row"><div>Slow motion<small>Boss phases, kills and Dual Convergence</small></div>${seg('slowmo', [['true', 'On'], ['false', 'Off']])}</div>
        <div class="cf-row"><div>Flashing effects<small>Screen flashes, speed lines and edge pulses</small></div>${seg('flash', [['true', 'On'], ['false', 'Reduce']])}</div>`;
    },

    applyCameraShake(dt) {
      const f = SHAKE_F[C.shake] === undefined ? 1 : SHAKE_F[C.shake];
      const tr = this.screenShake || 0;
      if (f >= 1 || !orig.applyCameraShake) return orig.applyCameraShake ? orig.applyCameraShake.call(this, dt) : undefined;
      if (f <= 0) { this.screenShake = Math.max(0, tr - dt * 2.0); return; }
      this.screenShake = tr * f;
      orig.applyCameraShake.call(this, dt);
      this.screenShake = Math.max(0, tr - dt * 2.0);
    },
    cameraKick(fromPos, strength) {
      const f = SHAKE_F[C.shake] === undefined ? 1 : SHAKE_F[C.shake];
      if (f <= 0 || !orig.cameraKick) return;
      return orig.cameraKick.call(this, fromPos, strength * f);
    },
    slowMo(scale, seconds) { if (C.slowmo && orig.slowMo) return orig.slowMo.apply(this, arguments); },
    epicFlash() { if (C.flash && orig.epicFlash) return orig.epicFlash.apply(this, arguments); },
    epicEdge() { if (C.flash && orig.epicEdge) return orig.epicEdge.apply(this, arguments); },
    epicLines() { if (C.flash && orig.epicLines) return orig.epicLines.apply(this, arguments); },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (!this.isInWorld) return;
      this.teachUpdate(dt);
      // touch move buttons dim while recharging
      if (this._touchMoveBtns && this._moves && this.touchUI) {
        this._tmT = (this._tmT || 0) - dt;
        if (this._tmT <= 0) { this._tmT = 0.15; this._touchMoveBtns.forEach(b => b.classList.toggle('cd', (this._moves.cd[b.dataset.mv] || 0) > 0)); }
      }
    },

    // a heavy hit (8%+) unlocks the Perfect Guard tip
    damagePlayer(dmg) {
      const p = this.player, before = p ? p.hp : 0;
      const r = orig.damagePlayer.apply(this, arguments);
      if (p && before - p.hp >= p.maxHp * 0.08) this._teachHurt = true;
      return r;
    }
  });

  window.CR_COMFORT = { get: () => Object.assign({}, C) };
})();
