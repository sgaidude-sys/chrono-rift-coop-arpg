/* =============================================================================
 * Chrono-Rift — style rank (combat upgrade, phase 2)
 *
 *  Replaces the plain hit counter with a live D → C → B → A → S → SS → SSS gauge.
 *
 *  Scoring (local to each hero):
 *   • every hit you land scores by the move that caused it: basic attack 4,
 *     skills 9, ultimate 14, capped per cast so one AoE can't fill the bar
 *   • variety matters: a move you used recently scores less each time
 *     (1 → 1 → 1 fades to 100% / 60% / 35% / 20% / 12%), mixing moves keeps it fresh
 *   • combat physics add flair: juggling an airborne foe +5, hitting a downed
 *     foe +4, a launch +8, a slam +10, a kill +12
 *   • a Perfect Parry jumps you up one rank
 *   • the gauge drains when you stop fighting (faster at high ranks), and a
 *     heavy hit drops you 1 rank (8%+ of max HP) or 2 ranks (20%+)
 *
 *  Rank bonuses: +3% attack speed and +2.5% move speed per rank above D (SSS:
 *  +18% / +15%), and your weapon trail burns brighter, turning crimson at S.
 * ============================================================================= */
(function () {
  'use strict';
  const RANKS = [
    { l: 'D', name: 'Dauntless', c: '#9fb3d9' },
    { l: 'C', name: 'Cutthroat', c: '#7fe3ff' },
    { l: 'B', name: 'Brutal', c: '#7dffb0' },
    { l: 'A', name: 'Arcane', c: '#ffd56b' },
    { l: 'S', name: 'Savage', c: '#ff9a3c' },
    { l: 'SS', name: 'Sovereign', c: '#ff4f6a' },
    { l: 'SSS', name: 'Rift-Shattering', c: '#ff2a8a' }
  ];
  const PER_RANK = 100, MAX = PER_RANK * RANKS.length - 1;
  const FRESH = [1, 0.6, 0.35, 0.2, 0.12];
  const BASE = { b: 4, s2: 9, s3: 9, s4: 9, ult: 14, mv_lunge: 8, mv_rise: 9, mv_break: 9 };
  const CAST_CAP = 40;
  const SHOW_AT = 6;                         // points before the gauge appears

  const css = `
  #style-rank { position: fixed; right: 4.2vw; top: 33%; text-align: right; pointer-events: none; z-index: 59; opacity: 0; transition: opacity .3s; }
  #style-rank.on { opacity: 1; }
  #style-rank .l { font: 900 64px/0.9 'Cinzel', Georgia, serif; letter-spacing: -2px; display: inline-block; transform-origin: 100% 70%;
    text-shadow: 0 0 18px currentColor, 0 3px 0 rgba(0,0,0,.55); }
  #style-rank .l.up { animation: styleUp .35s cubic-bezier(.2,1.6,.4,1); }
  #style-rank .l.down { animation: styleDown .35s ease-out; }
  @keyframes styleUp { 0% { transform: scale(1.9) rotate(-6deg); filter: brightness(2.2); } 100% { transform: none; filter: none; } }
  @keyframes styleDown { 0% { transform: translateX(-10px); filter: grayscale(1) brightness(.6); } 100% { transform: none; filter: none; } }
  #style-rank .nm { font: 800 12px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 4px; text-transform: uppercase; margin-top: 4px; opacity: .9; }
  #style-rank .gauge { width: 150px; height: 5px; margin: 7px 0 0 auto; background: rgba(245,242,235,.13); border-radius: 3px; overflow: hidden; }
  #style-rank .gauge i { display: block; height: 100%; width: 0; border-radius: 3px; transition: width .12s linear; box-shadow: 0 0 10px currentColor; }
  #style-rank .hits { font: 700 11px 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: 3px; color: rgba(245,242,235,.6); margin-top: 6px; }
  #style-rank .hits b { font-size: 15px; color: #f5f2eb; letter-spacing: 0; margin-right: 4px; }
  #epic-combo { display: none !important; }
  body.epic-cine #style-rank, body.cr-title-on #style-rank { opacity: 0 !important; }
  body.touch-ui #style-rank { top: 22%; right: 3vw; } body.touch-ui #style-rank .l { font-size: 44px; } body.touch-ui #style-rank .gauge { width: 110px; }`;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, useSkill: GP.useSkill,
    applyDamageToMonster: GP.applyDamageToMonster, damagePlayer: GP.damagePlayer, perfectParry: GP.perfectParry,
    getMoveSpeedMult: GP.getMoveSpeedMult, ccApply: GP.ccApply, updateWeaponTrails: GP.updateWeaponTrails,
    epicOnHit: GP.epicOnHit
  };
  const _c = new THREE.Color(), _gold = new THREE.Color(0xfff2cc), _crim = new THREE.Color(0xff2a5a);

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      if (!document.getElementById('style-rank-css')) {
        const st = document.createElement('style'); st.id = 'style-rank-css'; st.textContent = css; document.head.appendChild(st);
      }
      let el = document.getElementById('style-rank');
      if (!el) {
        el = document.createElement('div'); el.id = 'style-rank';
        el.innerHTML = '<span class="l">D</span><div class="nm"></div><div class="gauge"><i></i></div><div class="hits"><b>0</b>HITS</div>';
        document.body.appendChild(el);
      }
      this._style = {
        el, L: el.querySelector('.l'), nm: el.querySelector('.nm'), bar: el.querySelector('.gauge i'), hits: el.querySelector('.hits b'),
        pts: 0, rank: -1, shown: false, hitN: 0, idle: 0, hist: [], cast: null, castPts: 0
      };
      this.styleRender(true);
    },

    styleRank() { const S = this._style; return S ? Math.min(RANKS.length - 1, Math.floor(S.pts / PER_RANK)) : 0; },

    styleAdd(pts) {
      const S = this._style; if (!S || pts <= 0) return;
      S.pts = Math.min(MAX, S.pts + pts);
      S.idle = 0;
      this.styleRender();
    },

    // knock the gauge down n ranks (keeps a little progress so it doesn't feel like a reset)
    styleDrop(n) {
      const S = this._style; if (!S || S.pts <= 0) return;
      const r = Math.max(0, this.styleRank() - n);
      S.pts = Math.min(S.pts, r * PER_RANK + PER_RANK * 0.3);
      this.styleRender();
    },

    styleRender(force) {
      const S = this._style; if (!S) return;
      const r = this.styleRank(), R = RANKS[r];
      if (r !== S.rank || force) {
        const up = r > S.rank;
        S.L.textContent = R.l; S.L.style.color = R.c; S.nm.textContent = R.name; S.nm.style.color = R.c;
        S.bar.style.background = R.c; S.bar.style.color = R.c;
        if (!force) {
          S.L.classList.remove('up', 'down'); void S.L.offsetWidth; S.L.classList.add(up ? 'up' : 'down');
          if (up && r >= 4) {
            if (this.epicCallout) this.epicCallout(`${R.l} · ${R.name.toUpperCase()}`, R.c);
            if (this.epicImpact) this.epicImpact(0.6 + (r - 4) * 0.25, 0.12);
          }
        }
        S.rank = r;
      }
      S.bar.style.width = `${Math.round(((S.pts % PER_RANK) / PER_RANK) * 100)}%`;
      if (r === RANKS.length - 1 && S.pts >= MAX - 1) S.bar.style.width = '100%';
      S.hits.textContent = S.hitN;
      const show = S.pts >= SHOW_AT;
      if (show !== S.shown) { S.shown = show; S.el.classList.toggle('on', show); }
    },

    // ---- scoring -------------------------------------------------------------------
    useSkill(slot, isRemoteOrAI, actor) {
      const local = (!actor || actor === this.player) && !isRemoteOrAI;
      const p = this.player;
      const before = local && p.cooldowns ? p.cooldowns[slot] || 0 : 0;
      const r = orig.useSkill.apply(this, arguments);
      const S = this._style;
      if (!local || !S || this._styleInSkill) return r;
      const after = p.cooldowns ? p.cooldowns[slot] || 0 : 0;
      if (after <= before + 0.001) return r;                       // refused
      this.styleNoteCast(slot === 1 ? 'b' : (slot === 5 ? 'ult' : 's' + slot));
      // rank bonus: faster attacks (the basic attack swing and its cooldown)
      const asp = 1 - this.styleRank() * 0.03;
      if (asp < 1) {
        if (slot === 1) p.cooldowns[1] *= asp;
        if (p.attackTimer > 0) p.attackTimer *= asp;
      }
      return r;
    },

    // a new move started: later hits score by it, with less for recently repeated moves
    styleNoteCast(kind) {
      const S = this._style; if (!S) return;
      const same = S.hist.filter(k => k === kind).length;
      S.hist.push(kind); if (S.hist.length > 5) S.hist.shift();
      S.cast = { kind, fresh: FRESH[Math.min(same, FRESH.length - 1)], at: performance.now() };
      S.castPts = 0;
    },

    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork) {
      const S = this._style;
      const local = !fromNetwork && (!attacker || attacker === this.player);
      if (!S || !local || !mob || mob.dead) return orig.applyDamageToMonster.apply(this, arguments);
      const wasAlive = mob.hp > 0;
      const st = this.ccState ? this.ccState(mob) : 'ground';
      const r = orig.applyDamageToMonster.apply(this, arguments);
      if (!wasAlive) return r;
      const c = S.cast && performance.now() - S.cast.at < 1500 ? S.cast : { kind: 'b', fresh: 0.5 };
      let pts = (BASE[c.kind] || 6) * c.fresh;
      if (st === 'air') pts += 5;
      else if (st === 'down') pts += 4;
      const room = CAST_CAP - S.castPts;
      pts = Math.max(0, Math.min(pts, room));
      S.castPts += pts;
      S.hitN++;
      if (mob.hp <= 0 || mob.dead) pts += 12;
      this.styleAdd(pts);
      return r;
    },

    ccApply(m, tag, o, caster) {
      const r = orig.ccApply ? orig.ccApply.apply(this, arguments) : false;
      if (r && (!caster || caster === this.player)) {
        if (tag === 'launch') this.styleAdd(8);
        else if (tag === 'slam') this.styleAdd(10);
      }
      return r;
    },

    perfectParry(attacker) {
      const r = orig.perfectParry.apply(this, arguments);
      const S = this._style;
      if (S) { S.pts = Math.min(MAX, (this.styleRank() + 1) * PER_RANK + 10); S.idle = 0; this.styleRender(); }
      return r;
    },

    damagePlayer(dmg) {
      const p = this.player, before = p ? p.hp : 0;
      const r = orig.damagePlayer.apply(this, arguments);
      if (p && this._style && before > p.hp) {
        const f = (before - p.hp) / Math.max(1, p.maxHp);
        if (f >= 0.2) this.styleDrop(2); else if (f >= 0.08) this.styleDrop(1);
      }
      return r;
    },

    // the hit counter / grade callouts are replaced by the rank gauge; keep the crit and boss juice
    epicOnHit(mob, heavy, crit) {
      if (!this._style || !orig.epicOnHit) return orig.epicOnHit && orig.epicOnHit.apply(this, arguments);
      const E = this._epic;
      if (E) { const h = E.hits; E.hits = -1e9; try { orig.epicOnHit.apply(this, arguments); } finally { E.hits = h; } return; }
      return orig.epicOnHit.apply(this, arguments);
    },

    // ---- rank bonuses -----------------------------------------------------------------
    getMoveSpeedMult() {
      const b = orig.getMoveSpeedMult ? orig.getMoveSpeedMult.apply(this, arguments) : 1;
      return b * (1 + this.styleRank() * 0.025);
    },

    updateWeaponTrails() {
      if (orig.updateWeaponTrails) orig.updateWeaponTrails.apply(this, arguments);
      const r = this.styleRank();
      if (!this._trails || r <= 0) return;
      const tr = this._trails.find(t => t.owner === this.player);
      if (!tr) return;
      tr.uniforms.uAlpha.value = 1 + r * 0.22;
      if (r >= 4) { _c.copy(tr.uniforms.uColor.value).lerp(_crim, 0.25 + (r - 4) * 0.2); tr.uniforms.uColor.value.copy(_c); }
      else if (r >= 2) { tr.uniforms.uColor.value.lerp(_gold, 0.2); }
    },

    // ---- decay ------------------------------------------------------------------------
    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      const S = this._style; if (!S) return;
      if (this.player.dead && S.pts > 0) { S.pts = 0; S.hitN = 0; S.hist.length = 0; this.styleRender(); return; }
      if (S.pts <= 0) { if (S.hitN) { S.hitN = 0; this.styleRender(); } return; }
      S.idle += dt;
      if (S.idle > 1.4) {
        const rate = 7 + this.styleRank() * 5;           // high ranks need constant pressure
        S.pts = Math.max(0, S.pts - rate * dt * Math.min(2.5, 1 + (S.idle - 1.4) * 0.5));
        if (S.pts <= 0) { S.hitN = 0; S.hist.length = 0; }
        this.styleRender();
      }
    }
  });

  window.CR_STYLE = { RANKS, PER_RANK };
})();
