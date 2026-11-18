/* =============================================================================
 * Chrono-Rift — scene music director
 *
 *  Scenes -> tracks (public/assets/audio/music/):
 *    town_day       Ashenvale Bastion (sanctuary)
 *    explore_day    open world by day
 *    explore_night  open world by night (follows the day-night cycle)
 *    combat         fighting regular monsters
 *    boss_epic      zone / world boss engaged
 *
 *  Rules
 *    - Never overlaps: the current song fades OUT completely (and is paused),
 *      only then does the next one fade IN. Changing your mind mid-fade
 *      reverses the fade instead of restarting anything.
 *    - Exploration / town songs resume where they left off after a fight.
 *    - Hysteresis everywhere (combat lingers 7 s, boss 5 s, night switches at
 *      65% / 35%) so the music never flaps between scenes.
 *
 *  Performance
 *    - Songs STREAM through <audio> elements -> MediaElementSource. Nothing is
 *      decoded up front (a decoded 3-minute song would be ~70 MB of RAM and a
 *      long main-thread hitch); each file is fetched only when first needed and
 *      the next one starts buffering as soon as the previous begins fading.
 *    - Fades are Web Audio gain ramps scheduled ONCE per transition and run on
 *      the audio thread: zero per-frame work. The director ticks 4x per second.
 *    - Paused songs stop decoding; when muted the active song pauses entirely.
 *    - Files are loudness-normalised (-16 LUFS, 128 kbps, 44.1 kHz) so fades are
 *      even and no track jumps out.
 * ============================================================================= */
(function () {
  'use strict';
  if (typeof ChronoAudioEngine === 'undefined') return;

  const TRACKS = {
    town_day:      { vol: 0.95, resume: true },
    explore_day:   { vol: 0.95, resume: true },
    explore_night: { vol: 1.0,  resume: true },
    combat:        { vol: 0.9,  resume: false },
    boss_epic:     { vol: 1.0,  resume: false }
  };
  // seconds; urgent scenes cut in faster
  const FADE_OUT = { default: 2.4, combat: 1.0, boss_epic: 0.7 };
  const FADE_IN = { default: 3.0, combat: 1.2, boss_epic: 0.9 };
  const RESUME_WINDOW = 45; // s: re-entering a fight soon continues the combat song

  const AP = ChronoAudioEngine.prototype;
  const origInit = AP.init;
  const origSetMuted = AP.setMuted;

  Object.assign(AP, {
    init() {
      const first = !this.ctx;
      origInit.call(this);
      if (first && this.ctx) {
        this.musicGain.gain.value = this._musicLevel();
        this.requestMusic(this._musicWant || 'town_day');
      }
    },

    // ---- director-facing API -------------------------------------------------
    requestMusic(name) {
      if (!TRACKS[name]) return;
      this._musicWant = name;
      this._musicPump();
    },

    // Old engine entry points (zone changes, per-frame mix) now defer to the director
    _crossfadeMusic() { /* scene director picks tracks */ },

    _musicLevel() {
      const base = 0.3;
      return this.voice && this.voice.src ? base * 0.35 : base;
    },

    // Called every frame by the game: only touches the gain when the level changes
    updateMix() {
      if (!this.ctx || this._ducking) return;
      const lvl = this._musicLevel();
      if (Math.abs(lvl - (this._mixLevel === undefined ? -1 : this._mixLevel)) < 0.005) return;
      this._mixLevel = lvl;
      const g = this.musicGain.gain, now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.setTargetAtTime(lvl, now, 0.5);
    },

    duckMusic(durationSec = 2.2) {
      if (!this.ctx || !this.musicGain) return;
      const now = this.ctx.currentTime;
      const g = this.musicGain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.setTargetAtTime(0.3 * 0.35, now, 0.12);
      g.setTargetAtTime(0.3, now + durationSec, 0.5);
      this.ambGain.gain.setTargetAtTime(0.25, now, 0.12);
      this.ambGain.gain.setTargetAtTime(0.5, now + durationSec, 0.5);
      this._ducking = true;
      this._mixLevel = undefined;
      clearTimeout(this._duckTimer);
      this._duckTimer = setTimeout(() => { this._ducking = false; }, (durationSec + 1.5) * 1000);
    },

    setMuted(m) {
      origSetMuted.call(this, m);
      const cur = this._musicCur && this._musicSlots && this._musicSlots[this._musicCur];
      if (!cur) return;
      if (m) setTimeout(() => { if (this.muted) cur.el.pause(); }, 120);  // stop decoding while muted
      else if (cur.el.paused) {
        cur.el.play().then(() => {
          if (this._musicState === 'in') this._musicRamp(cur, TRACKS[this._musicCur].vol, 1.5);
        }).catch(() => this._musicRetryOnGesture());
      }
    },

    // ---- internals --------------------------------------------------------------
    _musicSlot(name) {
      this._musicSlots = this._musicSlots || {};
      let s = this._musicSlots[name];
      if (s) return s;
      const el = new Audio();
      el.preload = 'auto';
      el.loop = true;
      el.crossOrigin = 'anonymous';
      el.src = `${this.base}music/${name}.mp3`;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      try { this.ctx.createMediaElementSource(el).connect(g); } catch (e) { return null; }
      g.connect(this.musicGain);
      s = { name, el, g, lastStop: -1e9, pos: 0 };
      this._musicSlots[name] = s;
      return s;
    },

    _musicRamp(s, to, dur) {
      const p = s.g.gain, now = this.ctx.currentTime;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(to, now + Math.max(0.05, dur));
    },

    _musicPump() {
      if (!this.ctx) return;
      const want = this._musicWant;
      const curName = this._musicCur;
      const cur = curName ? this._musicSlots[curName] : null;

      if (cur && curName === want) {
        // changed our mind during a fade-out -> fade straight back in
        if (this._musicState === 'out') {
          clearTimeout(this._musicTimer);
          this._musicState = 'in';
          this._musicRamp(cur, TRACKS[curName].vol, (FADE_IN[curName] || FADE_IN.default) * 0.6);
        }
        return;
      }
      if (cur) {
        if (this._musicState === 'out') return;     // already leaving; newest wish starts afterwards
        // 1) fade the current song fully out, THEN start the next one (no overlap)
        const dur = FADE_OUT[want] || FADE_OUT.default;
        this._musicState = 'out';
        this._musicRamp(cur, 0, dur);
        this._musicSlot(want);                       // start buffering the next song now
        clearTimeout(this._musicTimer);
        this._musicTimer = setTimeout(() => {
          cur.pos = cur.el.currentTime || 0;
          cur.lastStop = this.ctx.currentTime;
          cur.el.pause();
          this._musicCur = null;
          this._musicState = 'idle';
          this._musicPump();
        }, dur * 1000 + 80);
        return;
      }
      // 2) nothing playing: start the wanted song and fade it in
      const s = this._musicSlot(want);
      if (!s) return;
      const def = TRACKS[want];
      const sinceStop = this.ctx.currentTime - s.lastStop;
      try {
        const dur = s.el.duration;
        let t = (def.resume || sinceStop < RESUME_WINDOW) ? s.pos : 0;
        if (isFinite(dur) && dur > 0 && t > dur - 3) t = 0;
        if (Math.abs((s.el.currentTime || 0) - t) > 0.25) s.el.currentTime = t;
      } catch (e) { /* not seekable yet: plays from where it is */ }
      s.g.gain.cancelScheduledValues(this.ctx.currentTime);
      s.g.gain.setValueAtTime(0, this.ctx.currentTime);
      this._musicCur = want;
      this._musicState = 'in';
      if (this.muted) return;                        // resumes on unmute
      const startFade = () => {
        if (this._musicCur !== want || this._musicState !== 'in') return;
        this._musicRamp(s, def.vol, FADE_IN[want] || FADE_IN.default);
      };
      const p = s.el.play();
      if (p && p.then) p.then(startFade).catch(() => this._musicRetryOnGesture());
      else startFade();
    },

    // Autoplay policies (mobile Safari etc.): retry on the next tap / key press
    _musicRetryOnGesture() {
      if (this._musicRetryArmed) return;
      this._musicRetryArmed = true;
      const go = () => {
        this._musicRetryArmed = false;
        ['pointerdown', 'keydown', 'touchend'].forEach(e => window.removeEventListener(e, go, true));
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        const s = this._musicCur && this._musicSlots[this._musicCur];
        if (!s) return;
        s.el.play().then(() => {
          if (this._musicState === 'in') this._musicRamp(s, TRACKS[this._musicCur].vol, FADE_IN.default);
        }).catch(() => this._musicRetryOnGesture());
      };
      ['pointerdown', 'keydown', 'touchend'].forEach(e => window.addEventListener(e, go, true));
    },

    musicDebug() {
      const slots = this._musicSlots || {};
      return {
        want: this._musicWant, current: this._musicCur, state: this._musicState,
        tracks: Object.fromEntries(Object.values(slots).map(s => [s.name, {
          gain: +s.g.gain.value.toFixed(3), paused: s.el.paused, t: +(s.el.currentTime || 0).toFixed(1),
          buffered: s.el.buffered.length ? +s.el.buffered.end(s.el.buffered.length - 1).toFixed(1) : 0
        }]))
      };
    }
  });

  // ---------------------------------------------------------------------------
  // Game side: decide the scene (4x per second, no allocations)
  // ---------------------------------------------------------------------------
  const GP = ChronoRiftCoOpGame.prototype;
  const orig = {
    updateMMOWorld: GP.updateMMOWorld,
    applyDamageToMonster: GP.applyDamageToMonster,
    damagePlayer: GP.damagePlayer
  };

  Object.assign(GP, {
    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork) {
      if (!fromNetwork && (!attacker || attacker === this.player)) this._lastCombatAt = performance.now();
      return orig.applyDamageToMonster.apply(this, arguments);
    },

    damagePlayer() {
      this._lastCombatAt = performance.now();
      return orig.damagePlayer.apply(this, arguments);
    },

    updateMusicDirector(dt) {
      const a = this.audio;
      if (!a || !a.ctx || !a.requestMusic) return;
      this._musicTick = (this._musicTick || 0) + dt;
      if (this._musicTick < 0.25) return;
      this._musicTick = 0;
      const now = performance.now();
      if (a.bossActive) this._lastBossAt = now;
      // monsters actively hunting the hero count as combat even before the first hit
      const p = this.player.pos;
      const ms = this.monsters || [];
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        if (m.dead || !(m.aggroTimer > 0)) continue;
        const dx = m.pos.x - p.x, dz = m.pos.z - p.z;
        if (dx * dx + dz * dz < 400) { this._lastCombatAt = now; break; }   // 20 m
      }
      let want;
      if (this.player.dead) want = a._musicWant || 'explore_day';
      else if (now - (this._lastBossAt || -1e9) < 5000) want = 'boss_epic';
      else if (now - (this._lastCombatAt || -1e9) < 7000) want = 'combat';
      else if (this.currentZone === 'ashenvale_bastion') want = 'town_day';
      else {
        const n = this.skyUniforms && this.skyUniforms.uNight ? this.skyUniforms.uNight.value : 0;
        if (this._musicNight) { if (n < 0.35) this._musicNight = false; }
        else if (n > 0.65) this._musicNight = true;
        want = this._musicNight ? 'explore_night' : 'explore_day';
      }
      if (want !== a._musicWant) a.requestMusic(want);
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      this.updateMusicDirector(dt);
    }
  });
})();
