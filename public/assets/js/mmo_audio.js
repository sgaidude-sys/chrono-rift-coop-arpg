// =============================================================================
// CHRONO-RIFT MMO AUDIO — spatial SFX, voice limiting, creature voices (Kokoro),
// hero grunts, boss voices & ability sounds, quest-giver voices.
// =============================================================================
(function () {
  'use strict';
  const M = window.MMO;
  const AP = ChronoAudioEngine.prototype;
  const GP = ChronoRiftCoOpGame.prototype;

  // ---------------------------------------------------------------------------
  // Engine: spatial playback + per-sound limits
  // ---------------------------------------------------------------------------
  const origPlaySample = AP.playSample;
  AP.playSample = function (key, rate = 1.0, vol = 0.5, delay = 0) {
    if (!this.ctx) return false;
    this._lim = this._lim || {};
    const L = this._lim[key] || (this._lim[key] = { last: 0, active: 0 });
    const now = this.ctx.currentTime;
    if (delay === 0 && (L.active >= 5 || now - L.last < 0.03)) return false; // stop identical sounds stacking
    L.last = now;
    L.active++;
    setTimeout(() => { L.active = Math.max(0, L.active - 1); }, 700);
    return origPlaySample.call(this, key, rate, vol, delay);
  };

  // listener = hero position + camera yaw (set by the game every frame)
  AP.spatial = function (pos, maxDist) {
    const l = this.listener;
    if (!l || !pos) return { gain: 1, pan: 0 };
    const dx = pos.x - l.x, dz = pos.z - l.z;
    const d = Math.hypot(dx, dz);
    const md = maxDist || 45;
    if (d >= md) return { gain: 0, pan: 0 };
    const k = 1 - d / md;
    // camera looks toward -Z rotated by yaw; right vector = (cos yaw, -sin yaw)
    const rx = Math.cos(l.yaw), rz = -Math.sin(l.yaw);
    const pan = d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / Math.max(6, d))) : 0;
    return { gain: k * k, pan };
  };

  AP._spatialOut = function (gain, pan) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.sfxGain);
    } else g.connect(this.sfxGain);
    return g;
  };

  AP.playAt = function (key, pos, rate = 1, vol = 0.5, maxDist = 45, delay = 0) {
    if (!this.ctx || this.muted || !this.buffers[key]) return false;
    const s = this.spatial(pos, maxDist);
    if (s.gain * vol < 0.01) return false;
    this._lim = this._lim || {};
    const L = this._lim[key] || (this._lim[key] = { last: 0, active: 0 });
    const now = this.ctx.currentTime;
    if (L.active >= 4 || now - L.last < 0.035) return false;
    L.last = now; L.active++;
    setTimeout(() => { L.active = Math.max(0, L.active - 1); }, 800);
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[key];
    src.playbackRate.value = rate;
    src.connect(this._spatialOut(vol * s.gain, s.pan));
    src.start(now + delay);
    return true;
  };

  // Hero lines & grunts come in several takes: any request for hero_<cls>_<key>[_n] or
  // grunt_<cls>_<kind>_<n> plays a random take of that moment (never the same twice running).
  AP.pickTake = function (id) {
    if (!/^(hero_|grunt_)/.test(id) || !this.voiceManifest) return id;
    const base = id.replace(/_\d+$/, '');
    this._takeCache = this._takeCache || {};
    let list = this._takeCache[base];
    if (!list) {
      const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(_\\d+)?$');
      list = Object.keys(this.voiceManifest).filter(k => re.test(k));
      if (list.length) this._takeCache[base] = list;
    }
    if (!list || list.length < 2) return list && list.length ? list[0] : id;
    this._lastTake = this._lastTake || {};
    let pick;
    do { pick = list[Math.floor(Math.random() * list.length)]; } while (pick === this._lastTake[base] && list.length > 1);
    this._lastTake[base] = pick;
    return pick;
  };
  const origPlayVoice = AP.playVoice;
  // bosses and the world announcer no longer speak (their synthesized lines sounded robotic);
  // boss fights keep their roars / slams / telegraph sound effects and the chat call-outs
  // the hero's own call-outs (kills, skills, low HP, zones, level-ups…) and the narrator
  // ("ann_*") are muted too: they fired randomly and read as a commentator. NPCs,
  // quest-givers and cutscenes still speak.
  const SILENT = /^(boss_|wb_|ann_|hero_|gronk_|xeno_)/;
  AP.playVoice = function (id, priority, vol) {
    if (SILENT.test(id)) return false;
    return origPlayVoice.call(this, this.pickTake(id), priority, vol);
  };

  // Short voice clips (creatures, grunts) that should NOT duck the music or block dialogue
  AP.playClipAt = function (id, pos, vol = 0.6, rate = 1, maxDist = 40) {
    id = this.pickTake(id);
    if (!this.ctx || this.muted || !this.hasVoice(id)) return;
    const s = pos ? this.spatial(pos, maxDist) : { gain: 1, pan: 0 };
    if (s.gain * vol < 0.015) return;
    const now = this.ctx.currentTime;
    this._clipActive = this._clipActive || 0;
    if (this._clipActive >= 3) return; // never more than 3 creature/grunt voices at once
    this.loadBuffer('vo_' + id, `${this.base}voice/${id}.mp3?${this.voiceVer}`).then((buf) => {
      if (!buf || this.muted) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const out = this._spatialOut(vol * s.gain, s.pan);
      src.connect(out);
      this._clipActive++;
      src.onended = () => { this._clipActive = Math.max(0, this._clipActive - 1); };
      src.start(Math.max(now, this.ctx.currentTime));
    });
  };

  // Deaths are played positionally by the game (see handleMonsterDeath wrapper)
  const origDeath = AP.playMonsterDeath;
  AP.playMonsterDeath = function (modelKey, isBig, pos) {
    if (this._suppressDeath) return;
    if (!pos) return origDeath.call(this, modelKey, isBig);
    if (!this.ctx || this.muted) return;
    if (modelKey.includes('alien')) {
      this.playAt('xeno_death', pos, 1 + Math.random() * 0.15, 0.4);
      this.playAt('mecha_impact', pos, 0.9, 0.35, 45, 0.1);
    } else if (modelKey.includes('imp') || modelKey.includes('blob') || modelKey.includes('slime')) {
      this.playAt('goo_death', pos, 0.9 + Math.random() * 0.2, 0.42);
    } else {
      this.playAt('rock_crumble', pos, 1.0 + Math.random() * 0.15, 0.36);
    }
    if (isBig) this.playAt('sfx_impact', pos, 0.7, 0.55, 70);
  };

  // ---------------------------------------------------------------------------
  // Creature voice families
  // ---------------------------------------------------------------------------
  const FAMILY = {
    critter: ['field_rat', 'cluckbeast', 'glade_pecker', 'birbling', 'crypt_bat'],
    slime: ['meadow_slime', 'bubble_ooze', 'grave_ooze', 'xeno_blob', 'prickleblob', 'sporecap', 'sporecap_brute', 'frozen_gulper', 'bog_hopper'],
    beast: ['prowler', 'thicket_hound', 'thumper', 'monkroose', 'dustclaw', 'snow_yeti', 'yeti_brute', 'hellfire_alpaca'],
    insect: ['thornwing', 'webspinner', 'moss_viper', 'venomfang', 'dune_armabee', 'armabee_queen'],
    undead: ['restless_bones', 'wailing_spirit', 'skullwraith', 'chrono_revenant', 'archon_sentinel'],
    brute: ['puglin', 'puglin_chief', 'sandscar', 'ironjaw', 'skullcrusher', 'cactoro', 'chrono_assassin', 'shade_initiate', 'goleling', 'goleling_elder', 'malakor'],
    demon: ['flame_imp', 'inferno_imp', 'cryo_imp', 'pit_fiend', 'azure_hellion', 'timeworn_magus'],
    alien: ['scolitex', 'oculi', 'xeno_stalker', 'void_squidle', 'cyclops', 'frost_glub'],
    drake: ['ember_drake', 'lava_whelp', 'ember_wyrm', 'storm_sovereign', 'leviathan']
  };
  const FAM_OF = {};
  Object.entries(FAMILY).forEach(([f, list]) => list.forEach(t => { FAM_OF[t] = f; }));
  const VARIANTS = { aggro: 2, hurt: 1, death: 1 };

  // Boss voice packs generated by scripts/build_audio.py
  const BOSS_VOICE = {
    'Mycelord Fungaron': 'mycelord', 'Grimtooth': 'grimtooth', 'Warchief Skullcrusher': 'skullcrusher', 'Frostmaw': 'frostmaw',
    'Azhazel': 'azhazel', 'Ignaroth': 'ignaroth', 'Hywirl': 'hywirl', 'The Abyssal Leviathan': 'leviathan', 'Gronk': 'gronk',
    'Astral Cyclops Juggernaut': 'xeno'
  };
  const GIVER_VOICE = { meadows: 'elric', whisperwood: 'sylwen', catacombs: 'moss', badlands: 'rhaz', frostpeak: 'ylva', breach: 'ozen', infernal: 'ashka' };
  // Boss ability sounds: [windup, impact]
  const ABILITY_SFX = {
    cleave: [['sfx_swipe', 0.75, 0.5], ['sfx_impact', 1.1, 0.45]],
    swipe: [null, ['sfx_swipe', 0.85, 0.45]],
    slam: [['ult_swell', 0.8, 0.35], ['sfx_impact', 0.7, 0.7], ['rock_crumble', 0.9, 0.5]],
    quake: [['ult_swell', 0.7, 0.35], ['rock_crumble', 0.8, 0.6], ['sfx_impact', 0.6, 0.6]],
    charge: [['fire_whoosh', 0.8, 0.35], ['sfx_impact', 0.85, 0.6]],
    meteors: [['fire_whoosh', 0.7, 0.4], ['fire_impact', 0.9, 0.55]],
    nova: [['summon', 0.8, 0.5], ['sfx_fire', 0.75, 0.6], ['ult_swell', 0.9, 0.4]],
    barrage: [['arcane_orb', 0.8, 0.4], ['fire_sizzle', 1.0, 0.5]],
    spin: [['fire_whoosh', 1.1, 0.4], ['fire_whoosh', 0.9, 0.45]],
    summon: [['summon', 1.0, 0.5], ['blink', 0.8, 0.4]]
  };

  function pickVariant(fam, kind) {
    const n = VARIANTS[kind] || 1;
    return `cr_${fam}_${kind}_${Math.floor(Math.random() * n)}`;
  }

  const origUpdateMMOWorld = GP.updateMMOWorld;
  const origHandleDeath = GP.handleMonsterDeath;
  const origApplyDmg = GP.applyDamageToMonster;
  const origDamagePlayer = GP.damagePlayer;
  const origUseSkill = GP.useSkill;
  const origRunBoss = GP.runBossAbility;
  const origOpenQG = GP.openQuestGiver;
  const origTurnIn = GP.turnInMMOQuest;
  const origSpawnCampMob = GP.spawnCampMob;
  const origInitWorld = GP.initMMOWorld;

  Object.assign(GP, {
    initMMOWorld() {
      origInitWorld.call(this);
      // give every boss its generated voice pack
      M.ZONES.forEach((z) => {
        [z.boss, z.worldBoss].forEach((b) => {
          if (!b) return;
          const k = BOSS_VOICE[b.name];
          if (!k || b.isFinal) return;
          const v = Object.assign({}, b.voice || {});
          if (!v.engage) v.engage = `boss_${k}_engage`;
          if (!v.death) v.death = `boss_${k}_death`;
          v.half = `boss_${k}_p2`;
          v.quarter = `boss_${k}_p3`;
          b.voice = v;
        });
      });
    },

    updateMMOWorld(dt) {
      origUpdateMMOWorld.call(this, dt);
      const a = this.audio;
      if (!a) return;
      a.listener = { x: this.player.pos.x, z: this.player.pos.z, yaw: this.cameraYaw || 0 };
      if (!a.ctx) return;
      this.updateCreatureVoices(dt);
      // the hero reacts when a boss fight starts (once per fight)
      if (a.bossActive && !this._heroSawBoss) { this._heroSawBoss = true; this.heroBark('boss', 0.9); }
      else if (!a.bossActive && this._heroSawBoss) this._heroBossClear = (this._heroBossClear || 0) + dt;
      if (this._heroBossClear > 20) { this._heroSawBoss = false; this._heroBossClear = 0; }
    },

    // A short in-character line from the player's hero (random take, low priority:
    // never interrupts dialogue, respects the bark cooldown)
    heroBark(key, delaySec = 0) {
      const cls = this.player && this.player.classId;
      if (!cls || !this.audio || !this.audio.ctx) return;
      const fire = () => { if (!this.player.dead) this.audio.playVoice(`hero_${cls}_${key}_0`, 1); };
      if (delaySec > 0) setTimeout(fire, delaySec * 1000); else fire();
    },

    mobVoiceRate(m) {
      const h = m.desiredHeight || 1.5;
      return Math.max(0.72, Math.min(1.3, 1.22 - (h - 1.2) * 0.1)) * (0.94 + Math.random() * 0.12);
    },

    mobVoice(m, kind, vol = 0.55) {
      const fam = FAM_OF[m.typeKey] || 'beast';
      const now = performance.now();
      if (m._voiceAt && now - m._voiceAt < 2500) return;
      if (this._anyVoiceAt && now - this._anyVoiceAt < 220) return;
      m._voiceAt = now; this._anyVoiceAt = now;
      this.audio.playClipAt(pickVariant(fam, kind), m.pos, vol * (m.isElite ? 1.2 : 1), this.mobVoiceRate(m), m.isBoss ? 70 : 38);
    },

    updateCreatureVoices() {
      const px = this.player.pos.x, pz = this.player.pos.z;
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (m.dead) continue;
        const d2 = (m.pos.x - px) ** 2 + (m.pos.z - pz) ** 2;
        if (d2 > 45 * 45) { m._aggroVoiced = false; m._lastAnimSnd = m.animState; continue; }
        if (!m._aggroVoiced && d2 < 15 * 15 && !m.isBoss) {
          m._aggroVoiced = true;
          if (Math.random() < 0.7) this.mobVoice(m, 'aggro', 0.55);
        } else if (m._aggroVoiced && d2 > 30 * 30) m._aggroVoiced = false;
        const anim = m.animState;
        if (anim !== m._lastAnimSnd) {
          if (anim === 'Sword_Attack' || anim === 'Sword_Heavy_Combo' || anim === 'Spell_Simple_Shoot') {
            const heavy = (m.desiredHeight || 1.5) > 2.2;
            this.audio.playAt('sfx_swipe', m.pos, heavy ? 0.72 : 1.05 + Math.random() * 0.2, heavy ? 0.42 : 0.3, 35);
            if (Math.random() < 0.3 && !m.isBoss) this.mobVoice(m, 'aggro', 0.42);
          }
          m._lastAnimSnd = anim;
        }
      }
    },

    handleMonsterDeath(mob, fromNetwork = false, hitDir = null) {
      const was = !mob || mob.dead;
      this.audio._suppressDeath = true;
      try { origHandleDeath.call(this, mob, fromNetwork, hitDir); } finally { this.audio._suppressDeath = false; }
      if (was || !mob.dead) return;
      this.audio.playMonsterDeath(mob.modelKey || '', mob.isBoss || mob.isElite, mob.pos);
      if (!mob.isBoss) { mob._voiceAt = 0; this.mobVoice(mob, 'death', 0.6); }
      // the hero comments on their own kills: always for elites, sometimes for regular foes
      if (!fromNetwork && mob._lastHitLocal && !mob.isBoss && (mob.isElite || Math.random() < 0.14)) this.heroBark('kill', 0.35);
      else if (!fromNetwork && mob._lastHitLocal && mob.isBoss) this.heroBark('kill', 3.2);
    },

    applyDamageToMonster(mob, baseDmg, isHeavy, attacker, fromNetwork = false, netData = null, opts = {}) {
      const remote = fromNetwork || (attacker && attacker !== this.player);
      if (mob && remote && this.audio.ctx) {
        const s = this.audio.spatial(mob.pos, 40);
        this.audio.withEmitter(Math.max(0, s.gain * 0.8), () => origApplyDmg.call(this, mob, baseDmg, isHeavy, attacker, fromNetwork, netData, opts));
      } else {
        origApplyDmg.call(this, mob, baseDmg, isHeavy, attacker, fromNetwork, netData, opts);
      }
      if (mob) mob._lastHitLocal = !fromNetwork && (!attacker || attacker === this.player);
      if (mob && !mob.dead && !mob.isBoss && Math.random() < 0.22) this.mobVoice(mob, 'hurt', 0.45);
    },

    damagePlayer(dmg, sourceName, srcLevel) {
      const before = this.player.hp;
      origDamagePlayer.call(this, dmg, sourceName, srcLevel);
      const lost = before - this.player.hp;
      const now = performance.now();
      if (lost > this.player.maxHp * 0.07 && now - (this._hurtGruntAt || 0) > 1600 && this.player.hp > 0) {
        this._hurtGruntAt = now;
        this.audio.playClipAt(`grunt_${this.player.classId}_hurt_0`, null, 0.55);
      }
    },

    useSkill(slot, isRemoteOrAI = false, actor = null) {
      const ent = actor || this.player;
      const cdBefore = this.player.cooldowns[slot];
      origUseSkill.call(this, slot, isRemoteOrAI, actor);
      if (ent !== this.player || isRemoteOrAI) return;
      const fired = !(cdBefore > 0) && this.player.cooldowns[slot] > 0;
      if (!fired) return;
      const now = performance.now();
      const chance = slot === 1 ? 0.14 : (slot === 5 ? 0 : 0.55);
      if (Math.random() < chance && now - (this._gruntAt || 0) > 650) {
        this._gruntAt = now;
        this.audio.playClipAt(`grunt_${this.player.classId}_attack_0`, null, 0.5, 0.96 + Math.random() * 0.08);
      }
    },

    runBossAbility(m, key, params) {
      origRunBoss.call(this, m, key, params);
      const sfx = ABILITY_SFX[key];
      if (!sfx || !this.audio.ctx) return;
      const ab = key === 'swipe' ? { windup: 0.75 } : M.ABILITIES[key];
      const wind = (ab ? ab.windup : 1) * (m.enraged ? 0.82 : 1);
      const big = (m.desiredHeight || 4) > 6 ? 0.85 : 1;
      if (sfx[0]) this.audio.playAt(sfx[0][0], m.pos, sfx[0][1] * big, sfx[0][2], 80);
      const pos = m.pos.clone();
      setTimeout(() => {
        for (let i = 1; i < sfx.length; i++) this.audio.playAt(sfx[i][0], pos, sfx[i][1] * big, sfx[i][2], 85, i * 0.05);
      }, wind * 1000);
      if (m.isBoss && key !== 'swipe' && Math.random() < 0.35) this.mobVoice(m, 'aggro', 0.7);
    },

    openQuestGiver(zoneId) {
      origOpenQG.call(this, zoneId);
      const g = GIVER_VOICE[zoneId];
      if (g) this.audio.playVoice(`qg_${g}_greet`, 2);
    },

    turnInMMOQuest(id) {
      const q = this.questById && this.questById[id];
      origTurnIn.call(this, id);
      const g = q && GIVER_VOICE[this._qgZone || q.zone];
      if (g) this.audio.playVoice(`qg_${g}_thanks`, 2);
      else this.audio.playVoice('ann_quest_done', 2);
      // the hero answers once the quest giver has finished speaking
      const said = g ? `qg_${g}_thanks` : 'ann_quest_done';
      this.heroBark('quest', (this.audio.voiceDuration(said) || 1.5) + 0.5);
    },

    spawnCampMob(c, slotIdx, gen) {
      const m = origSpawnCampMob.call(this, c, slotIdx, gen);
      return m;
    }
  });
})();
