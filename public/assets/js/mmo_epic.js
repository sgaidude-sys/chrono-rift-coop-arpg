/* =============================================================================
 * Chrono-Rift — epic combat presentation (loaded after the combat modules)
 *
 *  Everyday fights
 *   • Global slow-motion (this.slowMo(scale, seconds)) that eases back to real time.
 *   • Hit combo counter with grades (Fierce / Savage / Ruthless / Legendary).
 *   • Crits flash anime speed lines; every killing blow lands a slash flash, a
 *     spark burst, a camera kick and a short freeze. Clearing the last enemy of
 *     a pack, or slaying an elite, plays a brief slow-mo finisher.
 *   • Multi-kill callouts (Double / Triple / Quad Slay, Rampage).
 *   • Taking a big hit flashes the screen edge red.
 *
 *  Bosses (zone + world bosses; runs on every client from the boss events)
 *   • Intro: letterbox, slow-mo, title card, roar shockwave, rune sigil and a
 *     glowing arena barrier that holds for the whole fight.
 *   • Phase change: freeze, flash, slow-mo, "PHASE II" card with the boss's line,
 *     a ring of light pillars; enrage turns the barrier and screen edge crimson.
 *   • Big casts pulse a red warning at the screen edge with a low rumble.
 *   • Kill: long slow-mo, white flash, "VANQUISHED" card, pillars + spark fountain.
 * ============================================================================= */
(function () {
  'use strict';
  const TERR = window.TERRAIN_GLSL || 'float terrainHeightAt(vec2 p){ return 0.0; }';
  const TU = window.TERRAIN_UNIFORMS || {};
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const BIG_CASTS = { meteors: 1, quake: 1, nova: 1, barrage: 1, summon: 1, charge: 1, spin: 1 };
  const GRADES = [[100, 'LEGENDARY', '#ff6b8a'], [50, 'RUTHLESS', '#ff9a3c'], [25, 'SAVAGE', '#ffd56b'], [10, 'FIERCE', '#F5F2EB']];
  const STREAK = ['', '', 'DOUBLE SLAY', 'TRIPLE SLAY', 'QUAD SLAY'];

  const CSS = `
  #epic-fx { position: fixed; inset: 0; pointer-events: none; z-index: 60; overflow: hidden; }
  #epic-fx .lb { position: absolute; left: 0; right: 0; height: 0; background: #000; transition: height .55s cubic-bezier(.2,.7,.2,1); }
  #epic-fx .lb.t { top: 0; } #epic-fx .lb.b { bottom: 0; }
  body.epic-cine #epic-fx .lb { height: 10.5vh; }
  body.epic-cine #hud-bottom, body.epic-cine #chat-panel, body.epic-cine #mmo-xpbar, body.epic-cine #story-tracker,
  body.epic-cine #ui-quick, body.epic-cine #mmo-quick, body.epic-cine #minimap-wrap, body.epic-cine #ui-status, body.epic-cine #ui-avatar,
  body.epic-cine #hud-top, body.epic-cine #coop-roster, body.epic-cine #epic-combo, body.epic-cine #tut-hint, body.epic-cine #tut-pill { opacity: 0 !important; transition: opacity .4s; }
  #epic-fx .flash { position: absolute; inset: 0; background: #fff; opacity: 0; mix-blend-mode: screen; }
  #epic-fx .edge { position: absolute; inset: 0; opacity: 0;
    background: radial-gradient(ellipse at 50% 50%, transparent 52%, rgba(190, 14, 34, .55) 88%, rgba(120, 0, 16, .85) 100%); }
  body.epic-enrage #epic-fx .edge.persist { animation: epicEnrage 1.6s ease-in-out infinite; }
  @keyframes epicEnrage { 0%,100% { opacity: .22; } 50% { opacity: .5; } }
  #epic-fx .lines { position: absolute; left: 50%; top: 50%; width: 170vmax; height: 170vmax; margin: -85vmax 0 0 -85vmax; opacity: 0;
    background: repeating-conic-gradient(from 0deg, rgba(255,255,255,0) 0deg 3.1deg, rgba(255,255,255,.9) 3.3deg 3.55deg, rgba(255,255,255,0) 3.75deg 6.2deg);
    -webkit-mask: radial-gradient(circle, transparent 17%, rgba(0,0,0,.25) 24%, #000 36%); mask: radial-gradient(circle, transparent 17%, rgba(0,0,0,.25) 24%, #000 36%); }
  #epic-fx .card { position: absolute; left: 0; right: 0; top: 62%; text-align: center; opacity: 0; transform: translateY(8px);
    transition: opacity .5s ease, transform .9s cubic-bezier(.2,.7,.2,1); color: #F5F2EB; text-shadow: 0 2px 18px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9); }
  #epic-fx .card.on { opacity: 1; transform: none; }
  #epic-fx .card .eb { font: 700 12px 'Plus Jakarta Sans', 'Inter', sans-serif; letter-spacing: 6px; color: #D4AF37; }
  #epic-fx .card .nm { font-family: 'Cinzel', serif; font-weight: 900; font-size: clamp(30px, 6.2vw, 74px); letter-spacing: .14em; line-height: 1.05; margin: 10px 0 6px;
    transition: letter-spacing 2.4s cubic-bezier(.1,.6,.2,1); }
  #epic-fx .card.on .nm { letter-spacing: .2em; }
  #epic-fx .card .rule { width: min(560px, 70vw); height: 1px; margin: 0 auto; transform: scaleX(0); transition: transform 1.1s cubic-bezier(.2,.7,.2,1) .1s;
    background: linear-gradient(90deg, transparent, #D4AF37 30%, #fff3c4 50%, #D4AF37 70%, transparent); }
  #epic-fx .card.on .rule { transform: none; }
  #epic-fx .card .sb { font: italic 600 clamp(13px, 1.5vw, 18px) 'Cinzel', serif; letter-spacing: 2px; color: rgba(245,242,235,.82); margin-top: 10px; }
  #epic-fx .card.red .eb { color: #ff5a6e; } #epic-fx .card.red .rule { background: linear-gradient(90deg, transparent, #b3122a 30%, #ff8a96 50%, #b3122a 70%, transparent); }
  #epic-fx .card.red .nm { color: #ffe9ea; }
  #epic-combo { position: fixed; right: 4.2vw; top: 36%; text-align: right; pointer-events: none; z-index: 59; opacity: 0; transition: opacity .25s;
    color: #F5F2EB; text-shadow: 0 2px 10px rgba(0,0,0,.85), 0 0 2px #000; }
  #epic-combo.on { opacity: 1; }
  #epic-combo .n { font: 800 52px/1 'Plus Jakarta Sans', 'Inter', sans-serif; font-style: italic; letter-spacing: -1px; display: inline-block; transform-origin: 100% 60%; }
  #epic-combo .n.pop { animation: epicPop .16s ease-out; }
  @keyframes epicPop { 0% { transform: scale(1.35); } 100% { transform: scale(1); } }
  #epic-combo .h { font: 700 11px 'Plus Jakarta Sans', 'Inter', sans-serif; letter-spacing: 4px; color: rgba(245,242,235,.7); margin-left: 6px; }
  #epic-combo .g { font: 900 15px 'Cinzel', serif; letter-spacing: 4px; margin-top: 2px; min-height: 18px; }
  #epic-combo .bar { height: 2px; width: 120px; margin: 6px 0 0 auto; background: rgba(245,242,235,.15); }
  #epic-combo .bar i { display: block; height: 100%; width: 100%; background: #D4AF37; transform-origin: 100% 50%; }
  #epic-call { position: fixed; left: 0; right: 0; top: 22%; text-align: center; pointer-events: none; z-index: 59;
    font: 900 clamp(22px, 3.2vw, 38px) 'Cinzel', serif; letter-spacing: .3em; color: #F5F2EB; opacity: 0;
    text-shadow: 0 0 18px rgba(212,175,55,.65), 0 2px 10px rgba(0,0,0,.9); }
  #epic-call.go { animation: epicCall 1.25s cubic-bezier(.2,.7,.2,1) forwards; }
  @keyframes epicCall { 0% { opacity: 0; transform: scale(1.6); letter-spacing: .05em; } 12% { opacity: 1; transform: scale(1); } 75% { opacity: 1; } 100% { opacity: 0; letter-spacing: .42em; } }
  body.touch-ui #epic-fx .card { top: 56%; }
  body.touch-ui #epic-combo { top: 24%; right: 3vw; } body.touch-ui #epic-combo .n { font-size: 38px; }
  body.cr-title-on #epic-combo, body.cr-title-on #epic-call { visibility: hidden; }
  `;

  const BARRIER_V = `
    ${TERR}
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec4 w = modelMatrix * vec4(position, 1.0);
      w.y += terrainHeightAt(w.xz);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const BARRIER_F = `
    uniform vec3 uColor; uniform float uT; uniform float uA;
    varying vec2 vUv;
    void main() {
      float y = vUv.y;
      float fade = pow(1.0 - y, 2.2) * smoothstep(0.0, 0.03, y);
      float s1 = 0.5 + 0.5 * sin(vUv.x * 380.0 + y * 6.0 - uT * 1.4);
      float s2 = 0.5 + 0.5 * sin(vUv.x * 150.0 - y * 18.0 + uT * 3.2);
      float rise = 0.55 + 0.45 * sin(y * 22.0 - uT * 4.0 + vUv.x * 40.0);
      float band = smoothstep(0.1, 0.0, abs(y - 0.06)) * 0.9;
      vec3 col = uColor * (fade * (0.35 + 0.65 * s1 * s2) * rise * 1.4 + band) + vec3(1.0) * band * 0.25;
      gl_FragColor = vec4(col * uA, 1.0);
    }`;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, applyDamageToMonster: GP.applyDamageToMonster,
    spawnFloatingText: GP.spawnFloatingText, damagePlayer: GP.damagePlayer, onBossEngaged: GP.onBossEngaged,
    onBossPhase: GP.onBossPhase, onBossDefeated: GP.onBossDefeated, runBossAbility: GP.runBossAbility
  };
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
  const near = (g, p, r) => Math.hypot(g.player.pos.x - p.x, g.player.pos.z - p.z) < r;

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initEpic(); } catch (e) { console.warn('[Epic] init failed', e); }
    },

    initEpic() {
      if (this._epic) return;
      const st = document.createElement('style'); st.id = 'epic-css'; st.textContent = CSS; document.head.appendChild(st);
      const root = document.createElement('div'); root.id = 'epic-fx';
      root.innerHTML = '<div class="lines"></div><div class="edge"></div><div class="edge persist"></div><div class="flash"></div>' +
        '<div class="lb t"></div><div class="lb b"></div><div class="card"><div class="eb"></div><div class="nm"></div><div class="rule"></div><div class="sb"></div></div>';
      document.body.appendChild(root);
      const combo = document.createElement('div'); combo.id = 'epic-combo';
      combo.innerHTML = '<span class="n">0</span><span class="h">HITS</span><div class="g"></div><div class="bar"><i></i></div>';
      document.body.appendChild(combo);
      const call = document.createElement('div'); call.id = 'epic-call'; document.body.appendChild(call);
      this._epic = {
        root, combo, call, lines: root.querySelector('.lines'), edge: root.querySelector('.edge'), flash: root.querySelector('.flash'),
        card: root.querySelector('.card'), n: combo.querySelector('.n'), g: combo.querySelector('.g'), bar: combo.querySelector('.bar i'),
        hits: 0, comboT: 0, grade: '', kills: [], slow: { scale: 1, until: 0 }, ts: 1, barriers: new Map(),
        cineUntil: 0, cardUntil: 0, t: 0, anims: []
      };
      this.epicInstallClock();
    },

    // global time scale: every system downstream of the main loop's dt slows together.
    // (initMMOWorld can run before the game creates its clock, so this retries per frame)
    epicInstallClock() {
      const clock = this.clock, E = this._epic;
      if (!clock || !E || clock.getDelta._epic) return;
      const gd = clock.getDelta.bind(clock);
      clock.getDelta = () => {
        const real = gd();
        const now = performance.now();
        const want = now < E.slow.until ? E.slow.scale : 1;
        E.ts += (want - E.ts) * Math.min(1, real * (want < E.ts ? 30 : 5));   // snap in, ease out
        if (Math.abs(E.ts - 1) < 0.01) E.ts = 1;
        return real * E.ts;
      };
      clock.getDelta._epic = true;
    },

    // ---- primitives ---------------------------------------------------------
    slowMo(scale, seconds) {
      const S = this._epic && this._epic.slow; if (!S) return;
      const now = performance.now();
      if (now < S.until) { S.scale = Math.min(S.scale, scale); S.until = Math.max(S.until, now + seconds * 1000); }
      else { S.scale = scale; S.until = now + seconds * 1000; }
    },
    epicAnim(el, frames, ms) {
      if (!el || !el.animate) return;
      try { el.getAnimations().forEach(a => a.cancel()); el.animate(frames, { duration: ms, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' }); } catch (e) { /* old browser */ }
    },
    epicFlash(peak = 0.7, ms = 380, color = '#fff') {
      const f = this._epic && this._epic.flash; if (!f) return;
      f.style.background = color;
      this.epicAnim(f, [{ opacity: peak }, { opacity: 0 }], ms);
    },
    epicEdge(peak = 0.8, ms = 520) {
      const e = this._epic && this._epic.edge; if (!e) return;
      this.epicAnim(e, [{ opacity: 0 }, { opacity: peak, offset: 0.18 }, { opacity: 0 }], ms);
    },
    epicLines(peak = 0.5, ms = 260) {
      const l = this._epic && this._epic.lines; if (!l) return;
      const r = Math.random() * 360;
      this.epicAnim(l, [{ opacity: peak, transform: `rotate(${r}deg) scale(1.12)` }, { opacity: 0, transform: `rotate(${r + 4}deg) scale(1)` }], ms);
    },
    epicCard(eyebrow, name, sub, ms, red) {
      const E = this._epic; if (!E) return;
      const c = E.card;
      c.classList.remove('on'); c.classList.toggle('red', !!red);
      c.querySelector('.eb').textContent = eyebrow || '';
      c.querySelector('.nm').textContent = name || '';
      c.querySelector('.sb').textContent = sub || '';
      void c.offsetWidth; c.classList.add('on');
      E.cardUntil = performance.now() + ms;
    },
    epicCinema(ms) {
      const E = this._epic; if (!E) return;
      document.body.classList.add('epic-cine');
      E.cineUntil = Math.max(E.cineUntil, performance.now() + ms);
    },
    epicCallout(text, color) {
      const c = this._epic && this._epic.call; if (!c) return;
      c.textContent = text; c.style.color = color || '#F5F2EB';
      c.classList.remove('go'); void c.offsetWidth; c.classList.add('go');
    },
    epicBoom(low = 1, vol = 0.8) {
      const A = this.audio; if (!A || !A.ctx || A.muted) return;
      try {
        const ctx = A.ctx, t0 = ctx.currentTime, out = A.sfxGain || A.masterGain || ctx.destination;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(95 * low, t0); o.frequency.exponentialRampToValueAtTime(26 * low, t0 + 1.1);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
        o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 1.5);
        const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
        n.buffer = buf;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420 * low;
        const ng = ctx.createGain(); ng.gain.value = vol * 0.55;
        n.connect(lp); lp.connect(ng); ng.connect(out); n.start(t0);
      } catch (e) { /* audio is optional */ }
    },
    epicSample(key, rate, vol) { if (this.audio && this.audio.playSample) this.audio.playSample(key, rate, vol); },
    epicFreeze(sec) { this.hitStopTimer = Math.max(this.hitStopTimer || 0, sec); },

    // ---- everyday combat ----------------------------------------------------
    spawnFloatingText(worldPos, text, color, size) {
      if (this._epicHit && /CRIT/.test(String(text))) this._epicHit.crit = true;
      return orig.spawnFloatingText.apply(this, arguments);
    },

    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork) {
      const E = this._epic;
      const local = E && mob && !mob.dead && !fromNetwork && (!attacker || attacker === this.player);
      if (!local) return orig.applyDamageToMonster.apply(this, arguments);
      const wasAlive = mob.hp > 0;
      const prev = this._epicHit; this._epicHit = { crit: false };
      let r;
      try { r = orig.applyDamageToMonster.apply(this, arguments); } finally { var hit = this._epicHit; this._epicHit = prev; }
      if (!wasAlive) return r;
      this.epicOnHit(mob, !!isHeavy, hit.crit);
      if (mob.hp <= 0 || mob.dead) this.epicOnKill(mob, !!isHeavy, hit.crit);
      return r;
    },

    epicOnHit(mob, heavy, crit) {
      const E = this._epic;
      E.hits++; E.comboT = 3.0;
      E.n.textContent = E.hits;
      E.n.classList.remove('pop'); void E.n.offsetWidth; E.n.classList.add('pop');
      if (E.hits >= 3) E.combo.classList.add('on');
      const gr = GRADES.find(g => E.hits >= g[0]);
      if (gr && gr[1] !== E.grade) {
        E.grade = gr[1]; E.g.textContent = gr[1]; E.g.style.color = gr[2];
        if (E.hits >= 25) { this.epicCallout(gr[1], gr[2]); this.epicSample('ult_swell', 1.3, 0.25); }
      }
      if (crit) {
        this.epicLines(heavy ? 0.55 : 0.32, heavy ? 300 : 200);
        if (this.vfxFlash) this.vfxFlash(_v.set(mob.pos.x, (mob.desiredHeight || 1.4) * 0.55, mob.pos.z), 2.2, 0xffe2a0, 0xffffff, 0.16);
      }
      if (mob.isBoss && (crit || heavy) && this.cameraKick) this.cameraKick(mob.pos, 1.4);
    },

    epicOnKill(mob, heavy, crit) {
      const E = this._epic, p = this.player;
      const h = (mob.desiredHeight || 1.4) * 0.55;
      _v.set(mob.pos.x, h, mob.pos.z);
      // killing-blow slash: a bright crescent across the body, aligned to the swing
      const yaw = Math.atan2(mob.pos.x - p.pos.x, mob.pos.z - p.pos.z);
      if (this.vfxArc) this.vfxArc(_v, yaw + Math.PI / 2, 1.2 + h, 0xfff1c2, 0xffffff, { dur: 0.22, tilt: 0.5 });
      if (this.vfxFlash) this.vfxFlash(_v, 2.8 + h, 0xffd27a, 0xffffff, 0.2);
      if (this.vfxSparks) this.vfxSparks(_v, mob.isElite ? 46 : 26, { cols: [0xffffff, 0xffd56b, 0xff9a3c], speed: [6, 15], life: [0.25, 0.55], grav: 9, width: 0.05, upBias: 0.6 });
      if (this.cameraKick) this.cameraKick(mob.pos, mob.isElite ? 3.2 : 1.8);
      this.epicFreeze(mob.isElite ? 0.09 : 0.055);
      // multi-kill streak
      const now = performance.now();
      E.kills = E.kills.filter(t => now - t < 1400); E.kills.push(now);
      const k = E.kills.length;
      if (k >= 2) {
        this.epicCallout(k < STREAK.length ? STREAK[k] : `RAMPAGE ×${k}`, k >= 4 ? '#ff9a3c' : '#F5F2EB');
        this.epicSample('chime', 0.8 + k * 0.08, 0.3);
      }
      if (mob.isBoss) return;                                   // bosses get their own finale
      // finishers: elites, multi-kills, or the last foe standing in this fight
      let others = 0;
      for (let i = 0; i < this.monsters.length; i++) {
        const o = this.monsters[i];
        if (o !== mob && !o.dead && o.hp > 0 && o.aggroTimer > 0 && Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) < 20) others++;
      }
      if (mob.isElite) {
        this.slowMo(0.25, 0.55); this.epicLines(0.7, 520); this.epicFlash(0.35, 300, '#ffe9b8');
        this.epicCallout('ELITE SLAIN', '#ffd56b'); this.epicBoom(1.4, 0.5);
        if (this.spawnLightPillar) this.spawnLightPillar(mob.pos.clone(), 0xffd56b, 1.6, 1.2, 16);
      } else if (others === 0 || k >= 3 || (crit && heavy)) {
        this.slowMo(0.3, others === 0 ? 0.38 : 0.28); this.epicLines(0.45, 380);
        if (this.fovPunch) this.fovPunch(-1.5);
      }
    },

    damagePlayer(dmg) {
      const p = this.player, before = p.hp;
      const r = orig.damagePlayer.apply(this, arguments);
      const lost = before - p.hp;
      if (this._epic && lost > 0 && lost >= p.maxHp * 0.12) this.epicEdge(Math.min(0.95, 0.45 + lost / p.maxHp), 560);
      return r;
    },

    // ---- bosses ---------------------------------------------------------------
    onBossEngaged(m) {
      const first = !(this._bossEngagedAt && this._bossEngagedAt[m.id]);
      const r = orig.onBossEngaged.apply(this, arguments);
      if (first && this._epic && m && m.bossDef) { try { this.epicBossIntro(m); } catch (e) { console.warn('[Epic] intro', e); } }
      return r;
    },

    epicBossIntro(m) {
      const def = m.bossDef, world = !!m.isWorldBoss;
      this.epicBarrier(m, true);
      if (!near(this, m.pos, 80)) return;
      this.epicCinema(world ? 3600 : 2900);
      this.epicCard(world ? 'WORLD BOSS' : 'BOSS', m.name, def.title || '', world ? 3400 : 2700, world);
      this.slowMo(0.3, world ? 1.5 : 1.1);
      this.epicFreeze(0.08);
      this.epicFlash(world ? 0.5 : 0.32, 600, world ? '#ffb3bd' : '#fff2cf');
      this.epicBoom(world ? 0.75 : 1, world ? 1.0 : 0.8);
      this.epicSample('ult_swell', world ? 0.75 : 0.9, 0.5);
      this.screenShake = Math.max(this.screenShake || 0, world ? 0.85 : 0.6);
      if (this.fovPunch) this.fovPunch(world ? 7 : 5);
      const C = world ? 0xff2a4a : 0xffc75a, base = m.homePos || m.pos;
      if (this.vfxRune) this.vfxRune(_v.set(m.pos.x, 0.05, m.pos.z), 9 + (world ? 4 : 0), C, 0xffffff, 1.8);
      if (this.vfxShock) {
        this.vfxShock(_v.set(m.pos.x, 0, m.pos.z), m.arenaR || 24, 4, C, 0xffffff, { r0: 3, dur: 0.9 });
        this.vfxShock(_v.set(base.x, 0, base.z), m.arenaR || 24, 9, C, 0xffffff, { r0: (m.arenaR || 24) * 0.4, dur: 1.4 });
      }
      if (this.vfxSparks) this.vfxSparks(_v.set(m.pos.x, (m.desiredHeight || 4) * 0.6, m.pos.z), 70, { cols: [0xffffff, C], speed: [8, 22], life: [0.4, 0.9], grav: 6, width: 0.07, upBias: 0.4 });
    },

    onBossPhase(m, phaseIdx) {
      const r = orig.onBossPhase.apply(this, arguments);
      if (this._epic && m && m.bossDef) { try { this.epicBossPhase(m, phaseIdx); } catch (e) { console.warn('[Epic] phase', e); } }
      return r;
    },

    epicBossPhase(m, idx) {
      const ph = m.bossDef.phases[idx]; if (!ph) return;
      const B = this._epic.barriers.get(m.id);
      if (B && (ph.enrage || m.enraged)) B.mat.uniforms.uColor.value.setHex(0xff1e3c);
      if (!near(this, m.pos, 70)) return;
      const red = !!ph.enrage || !!m.isWorldBoss;
      this.epicFreeze(0.13);
      this.epicCinema(2100);
      this.epicCard(ph.enrage ? 'ENRAGED' : `PHASE ${ROMAN[idx] || idx + 1}`, ph.say ? `“${ph.say}”` : m.name, ph.say ? m.name : '', 2100, red);
      const c = this._epic.card.querySelector('.nm'); c.style.fontSize = ph.say ? 'clamp(22px, 3.6vw, 44px)' : '';
      this.slowMo(0.3, 0.9);
      this.epicFlash(0.6, 480, red ? '#ffc2c8' : '#fff');
      this.epicLines(0.6, 600);
      this.epicBoom(0.85, 0.9);
      this.screenShake = Math.max(this.screenShake || 0, 0.75);
      const C = red ? 0xff2a4a : 0xffb347;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        if (this.vfxPillar) this.vfxPillar(_v.set(m.pos.x + Math.cos(a) * 7, 0, m.pos.z + Math.sin(a) * 7), 12, 0.9, C, 0xffffff, i * 0.04);
      }
      if (this.vfxShock) this.vfxShock(_v.set(m.pos.x, 0, m.pos.z), 22, 5, C, 0xffffff, { r0: 2, dur: 0.8 });
    },

    runBossAbility(m, key) {
      const r = orig.runBossAbility.apply(this, arguments);
      if (this._epic && m && m.isBoss && BIG_CASTS[key] && near(this, m.pos, 50)) {
        this.epicEdge(m.enraged ? 0.75 : 0.5, 700);
        this.epicBoom(1.6, 0.35);
        this.screenShake = Math.max(this.screenShake || 0, 0.25);
      }
      return r;
    },

    onBossDefeated(mob, fromNetwork) {
      const r = orig.onBossDefeated.apply(this, arguments);
      if (this._epic && mob && mob.bossDef) { try { this.epicBossDeath(mob); } catch (e) { console.warn('[Epic] death', e); } }
      return r;
    },

    epicBossDeath(m) {
      this.epicBarrier(m, false);
      document.body.classList.remove('epic-enrage');
      if (!near(this, m.pos, 90)) return;
      const world = !!m.isWorldBoss;
      this.epicFreeze(0.16);
      this.slowMo(0.2, world ? 2.2 : 1.7);
      this.epicCinema(world ? 4400 : 3600);
      this.epicCard(world ? 'WORLD BOSS VANQUISHED' : 'VANQUISHED', m.name, (m.bossDef.title || '').split(' — ')[0], world ? 4200 : 3400, false);
      this.epicFlash(0.9, 900, '#fff');
      this.epicLines(0.8, 900);
      this.epicBoom(0.7, 1.0);
      this.epicSample('ult_swell', 1.15, 0.55);
      setTimeout(() => this.epicSample('chime', 0.7, 0.5), 650);
      this.screenShake = Math.max(this.screenShake || 0, 0.9);
      if (this.fovPunch) this.fovPunch(-4);
      const C = world ? 0xff6b8a : 0xffd56b;
      const h = m.desiredHeight || 5;
      if (this.spawnLightPillar) this.spawnLightPillar(m.pos.clone(), C, 3.2, 3.2, 40);
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2;
        if (this.vfxPillar) this.vfxPillar(_v.set(m.pos.x + Math.cos(a) * 9, 0, m.pos.z + Math.sin(a) * 9), 16, 1.0, C, 0xffffff, 0.15 + i * 0.05);
      }
      if (this.vfxSparks) {
        this.vfxSparks(_v.set(m.pos.x, h * 0.6, m.pos.z), 120, { cols: [0xffffff, C, 0xffb347], speed: [10, 26], life: [0.6, 1.3], grav: 9, width: 0.08, upBias: 1.0 });
        this.vfxSparks(_v.set(m.pos.x, 0.4, m.pos.z), 60, { cols: [C, 0xffffff], speed: [4, 9], life: [1.0, 1.8], grav: -2, width: 0.05 });
      }
      if (this.vfxShock) this.vfxShock(_v.set(m.pos.x, 0, m.pos.z), 30, 6, C, 0xffffff, { r0: 3, dur: 1.2 });
      this.epicCombo(true);
    },

    // ---- arena barrier ----------------------------------------------------------
    epicBarrier(m, on) {
      const E = this._epic; if (!E || !m) return;
      let B = E.barriers.get(m.id);
      if (!on) { if (B) B.dying = true; return; }
      if (B) { B.dying = false; return; }
      const R = m.arenaR || 24, base = m.homePos || m.pos;
      const geo = new THREE.CylinderGeometry(R, R, 9, 128, 1, true);
      geo.translate(0, 4.5, 0);
      const mat = new THREE.ShaderMaterial({
        uniforms: Object.assign({ uColor: { value: new THREE.Color(m.isWorldBoss ? 0xff2a4a : 0xffc75a) }, uT: { value: 0 }, uA: { value: 0 } }, TU),
        vertexShader: BARRIER_V, fragmentShader: BARRIER_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(base.x, 0, base.z); mesh.frustumCulled = false; mesh.renderOrder = 5;
      this.scene.add(mesh);
      B = { mesh, mat, a: 0, dying: false, m };
      E.barriers.set(m.id, B);
    },

    epicCombo(reset) {
      const E = this._epic; if (!E) return;
      if (reset) { E.hits = 0; E.grade = ''; E.g.textContent = ''; E.combo.classList.remove('on'); }
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      const E = this._epic; if (!E) return;
      this.epicInstallClock();
      const realDt = E.ts > 0 ? dt / E.ts : dt;
      E.t += realDt;
      const now = performance.now();
      // combo decay
      if (E.hits > 0) {
        E.comboT -= realDt;
        E.bar.style.transform = `scaleX(${Math.max(0, E.comboT / 3).toFixed(3)})`;
        if (E.comboT <= 0 || this.player.dead) this.epicCombo(true);
      }
      if (E.cineUntil && now > E.cineUntil) { E.cineUntil = 0; document.body.classList.remove('epic-cine'); }
      if (E.cardUntil && now > E.cardUntil) { E.cardUntil = 0; E.card.classList.remove('on'); }
      // barriers + enrage edge
      let enrage = false;
      E.barriers.forEach((B, id) => {
        const m = B.m;
        if (!m || m.dead || this.monsters.indexOf(m) < 0) B.dying = true;
        else if (m.bossState && m.bossState.engaged === false && m.hp >= m.maxHp) { B.dying = true; if (this._bossEngagedAt) delete this._bossEngagedAt[m.id]; }
        B.a += ((B.dying ? 0 : 1) - B.a) * Math.min(1, realDt * (B.dying ? 1.6 : 2.5));
        B.mat.uniforms.uT.value = E.t;
        B.mat.uniforms.uA.value = B.a * (0.85 + 0.15 * Math.sin(E.t * 3.1));
        if (B.dying && B.a < 0.02) {
          this.scene.remove(B.mesh); B.mesh.geometry.dispose(); B.mat.dispose(); E.barriers.delete(id);
          return;
        }
        if (!B.dying && m.enraged && near(this, m.pos, (m.arenaR || 24) + 10)) enrage = true;
        if (!B.dying && m.enraged && Math.random() < realDt * 18 && this.vfxSparks) {
          this.vfxSparks(_v2.set(m.pos.x + (Math.random() - 0.5) * 2, (m.desiredHeight || 4) * Math.random(), m.pos.z + (Math.random() - 0.5) * 2), 2,
            { cols: [0xff3b2a, 0xffa040], speed: [1, 3], life: [0.5, 1.0], grav: -3, width: 0.04 });
        }
      });
      document.body.classList.toggle('epic-enrage', enrage);
    }
  });

  window.CR_EPIC = { version: 1, isTouch };
})();
