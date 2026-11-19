/* =============================================================================
 * Chrono-Rift — combat sound effects from Freesound (all CC0)
 *
 *  Loaded when the audio engine starts (assets/audio/sfx/fs/, ~380 KB total):
 *    hit_0..2        weapon hits on monsters (slash / cut / RPG slash)
 *    crit_0..2       crits & heavy hits (big slashes, body punch) + the old low thump
 *    swing_0..2      sword whooshes; swing_heavy for heavy attacks
 *    body_fall_0..1  monster drops on death (replaces the generic rock crumble)
 *    bone_snap       extra layer when skeletons die
 *    parry_0..1      metal clang on perfect parry / blocked hits
 *    cr_<family>_hurt_0 / cr_<family>_death_0   creature voices for the nine
 *        monster families (critter, slime, beast, insect, undead, brute, demon,
 *        alien, drake) — they replace the old generated clips under the SAME
 *        keys, so mmo_audio's spatial creature-voice system plays them as-is.
 *  Every override falls back to the previous sound if a file failed to load.
 *  Credits: assets/audio/sfx/fs/CREDITS.txt
 * ============================================================================= */
(function () {
  'use strict';
  const AP = ChronoAudioEngine.prototype;
  const GP = ChronoRiftCoOpGame.prototype;
  const FAMS = ['critter', 'slime', 'beast', 'insect', 'undead', 'brute', 'demon', 'alien', 'drake'];
  const SFX = ['hit_0', 'hit_1', 'hit_2', 'crit_0', 'crit_1', 'crit_2', 'swing_0', 'swing_1', 'swing_2', 'swing_heavy',
    'body_fall_0', 'body_fall_1', 'parry_0', 'parry_1', 'bone_snap'];
  const VOICES = [];
  FAMS.forEach((f) => { VOICES.push(`cr_${f}_hurt_0`, `cr_${f}_death_0`); });
  const rnd = (a, b) => a + Math.random() * (b - a);

  const orig = {
    preloadSamples: AP.preloadSamples, playHit: AP.playHit, playSwing: AP.playSwing, playMonsterDeath: AP.playMonsterDeath
  };
  const gorig = { perfectParry: GP.perfectParry, blockFx: GP.blockFx };

  // Load a file into a buffer key, replacing whatever is (or will be) cached there.
  AP.loadSfxOverride = function (key, url) {
    if (!this.ctx) return;
    const p = fetch(url)
      .then(r => (r.ok ? r.arrayBuffer() : null))
      .then(buf => (buf ? new Promise((res, rej) => this.ctx.decodeAudioData(buf, res, rej)) : null))
      .then((d) => { if (d) this.buffers[key] = d; return d || this.buffers[key] || null; })
      .catch(() => this.buffers[key] || null);
    this._loading[key] = p;          // a later loadBuffer(key) waits for this instead of the old file
  };

  AP.preloadSamples = function () {
    orig.preloadSamples.call(this);
    const b = this.base + 'sfx/fs/';
    SFX.forEach(k => this.loadSfxOverride('fs_' + k, b + k + '.mp3'));
    VOICES.forEach(k => this.loadSfxOverride('vo_' + k, b + k + '.mp3'));
  };

  AP.fsKey = function (base, n) {
    if (n) {
      const start = Math.floor(Math.random() * n);
      for (let i = 0; i < n; i++) { const k = `fs_${base}_${(start + i) % n}`; if (this.buffers[k]) return k; }
      return null;
    }
    return this.buffers['fs_' + base] ? 'fs_' + base : null;
  };

  AP.playHit = function (isCrit = false, isHeavy = false) {
    if (!this.ctx || this.muted) return;
    const big = isCrit || isHeavy;
    const k = big ? this.fsKey('crit', 3) : this.fsKey('hit', 3);
    if (!k) return orig.playHit.call(this, isCrit, isHeavy);
    this.playSample(k, rnd(0.93, 1.08), big ? (isCrit ? 0.55 : 0.48) : 0.38);
    if (big) this._thump('sine', isCrit ? 150 : 110, 40, 0.09, isCrit ? 0.2 : 0.14);
  };

  AP.playSwing = function (isHeavy = false) {
    if (!this.ctx || this.muted) return;
    const k = isHeavy ? (this.fsKey('swing_heavy') || this.fsKey('swing', 3)) : this.fsKey('swing', 3);
    if (!k) return orig.playSwing.call(this, isHeavy);
    this.playSample(k, isHeavy ? rnd(0.86, 0.96) : rnd(0.98, 1.14), isHeavy ? 0.42 : 0.3);
  };

  // positional deaths (mmo_audio passes pos); the creature's own death cry is played separately
  AP.playMonsterDeath = function (modelKey = '', isBig = false, pos) {
    if (this._suppressDeath) return;
    if (!pos || !this.ctx || this.muted) return orig.playMonsterDeath.apply(this, arguments);
    const mk = modelKey || '';
    const fall = isBig ? (this.fsKey('body_fall_1') || this.fsKey('body_fall_0')) : this.fsKey('body_fall_0');
    if (mk.includes('alien') || mk.includes('imp') || mk.includes('blob') || mk.includes('slime') || !fall) {
      orig.playMonsterDeath.apply(this, arguments);          // goo / xeno layers already suit these
      return;
    }
    this.playAt(fall, pos, isBig ? 0.82 : rnd(0.95, 1.1), isBig ? 0.6 : 0.42, isBig ? 70 : 45, 0.06);
    if (/skeleton|bones/.test(mk) && this.fsKey('bone_snap')) this.playAt('fs_bone_snap', pos, rnd(0.95, 1.1), 0.45, 45);
    if (isBig) this.playAt('sfx_impact', pos, 0.7, 0.45, 70);
  };

  // parries and blocks get a real metal clang on top of the existing ring
  GP.perfectParry = function () {
    const r = gorig.perfectParry ? gorig.perfectParry.apply(this, arguments) : undefined;
    const a = this.audio;
    if (a && a.ctx && !a.muted && a.fsKey('parry_0')) a.playSample('fs_parry_0', rnd(1.0, 1.08), 0.55);
    return r;
  };
  GP.blockFx = function () {
    const r = gorig.blockFx ? gorig.blockFx.apply(this, arguments) : undefined;
    const a = this.audio;
    if (a && a.ctx && !a.muted && a.fsKey('parry_1')) a.playSample('fs_parry_1', rnd(1.05, 1.18), 0.32);
    return r;
  };

  window.CR_SFX = { SFX, VOICES };
})();
