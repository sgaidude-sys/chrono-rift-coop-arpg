// =============================================================================
// CHRONO-RIFT MMO DATA — zones, bestiary, bosses, loot tables, quests.
// Everything here is plain data; mmo_world.js / mmo_rpg.js consume it.
// =============================================================================
(function () {
  'use strict';

  const WORLD = {
    seed: 1337,
    half: 1600,          // world spans [-1600, 1600] on X and Z  (3.2 km across)
    chunk: 64,           // prop/obstacle chunk size
    borderBand: 26,      // impassable ridge thickness between zones
    gateWidth: 14,       // half-width of the pass where a road crosses a ridge
    townRadius: 46,      // Ashenvale Bastion safe area around the origin
    activateRadius: 115, // camps within this radius of any hero are simulated
    levelCap: 50
  };

  // ---------------------------------------------------------------------------
  // BESTIARY — model key, size and combat profile. Stats scale from level.
  // qm/* models are self-animated Quaternius rigs; legacy keys use the hero rig.
  // ---------------------------------------------------------------------------
  const Q = (k) => 'qm/' + k;
  const MOB_TYPES = {
    // Meadows
    meadow_slime:   { model: Q('blob_greenblob'), height: 1.15, speed: 4.2, hp: 0.85, dmg: 0.8 },
    field_rat:      { model: Q('basic_rat'), height: 0.58, speed: 6.2, hp: 0.7, dmg: 0.85, death: 'flop' },
    cluckbeast:     { model: Q('blob_chicken'), height: 1.25, speed: 5.0, hp: 0.9, dmg: 0.9 },
    bog_hopper:     { model: Q('basic_frog'), height: 1.0, speed: 4.6, hp: 1.0, dmg: 1.0 },
    bubble_ooze:    { model: Q('blob_pinkblob'), height: 1.35, speed: 4.0, hp: 1.15, dmg: 0.95 },
    thornwing:      { model: Q('basic_wasp'), height: 1.0, speed: 6.6, hp: 0.75, dmg: 1.05, hover: 1.2, ranged: true },
    sporecap:       { model: Q('blob_mushnub'), height: 1.3, speed: 4.4, hp: 1.1, dmg: 1.0 },
    sporecap_brute: { model: Q('blob_mushnub_evolved'), height: 1.9, speed: 4.4, hp: 1.3, dmg: 1.2 },
    // Whisperwood
    prowler:        { model: Q('blob_cat'), height: 1.25, speed: 6.4, hp: 0.95, dmg: 1.1 },
    thicket_hound:  { model: Q('blob_dog'), height: 1.25, speed: 6.6, hp: 1.0, dmg: 1.05 },
    webspinner:     { model: Q('basic_spider'), height: 1.0, speed: 5.6, hp: 1.0, dmg: 1.1, ranged: true },
    moss_viper:     { model: Q('basic_snake'), height: 1.0, speed: 5.0, hp: 0.95, dmg: 1.15 },
    venomfang:      { model: Q('basic_snake_angry'), height: 1.5, speed: 5.4, hp: 1.2, dmg: 1.25 },
    thumper:        { model: Q('big_bunny'), height: 2.4, speed: 5.0, hp: 1.35, dmg: 1.2 },
    glade_pecker:   { model: Q('fly_pigeon'), height: 1.2, speed: 6.0, hp: 0.85, dmg: 1.0, hover: 1.3 },
    birbling:       { model: Q('blob_birb'), height: 1.2, speed: 5.2, hp: 0.95, dmg: 1.0 },
    monkroose:      { model: Q('big_monkroose'), height: 2.6, speed: 5.4, hp: 1.3, dmg: 1.2 },
    // Catacombs
    restless_bones: { model: Q('more_skeleton'), height: 1.9, speed: 5.0, hp: 1.05, dmg: 1.1 },
    crypt_bat:      { model: Q('more_bat'), height: 1.1, speed: 6.8, hp: 0.8, dmg: 1.0, hover: 1.4 },
    grave_ooze:     { model: Q('more_slime'), height: 1.2, speed: 4.2, hp: 1.25, dmg: 1.0 },
    flame_imp:      { model: 'monster_imp', scale: 1.0, speed: 5.6, hp: 0.9, dmg: 1.05, ranged: true, legacy: true },
    puglin:         { model: 'monster_puglin', scale: 1.15, speed: 4.8, hp: 1.25, dmg: 1.15, legacy: true },
    wailing_spirit: { model: Q('fly_ghost'), height: 1.7, speed: 5.4, hp: 0.95, dmg: 1.1, hover: 0.9, ranged: true },
    skullwraith:    { model: Q('fly_ghost_skull'), height: 2.2, speed: 5.4, hp: 1.2, dmg: 1.25, hover: 1.0, ranged: true },
    puglin_chief:   { model: 'monster_puglin_chieftain', scale: 1.55, speed: 4.9, hp: 1.4, dmg: 1.3, legacy: true, weaponId: 'Axe_Double' },
    // Badlands
    cactoro:        { model: Q('big_cactoro'), height: 2.3, speed: 4.6, hp: 1.3, dmg: 1.1 },
    prickleblob:    { model: Q('blob_cactoro'), height: 1.3, speed: 4.6, hp: 1.0, dmg: 1.0 },
    dustclaw:       { model: Q('big_dino'), height: 2.4, speed: 6.2, hp: 1.1, dmg: 1.2 },
    sandscar:       { model: Q('big_tribal'), height: 2.4, speed: 5.2, hp: 1.1, dmg: 1.15, ranged: true },
    ironjaw:        { model: Q('big_orc'), height: 2.5, speed: 5.0, hp: 1.3, dmg: 1.25 },
    dune_armabee:   { model: Q('fly_armabee'), height: 1.6, speed: 6.4, hp: 0.9, dmg: 1.05, hover: 1.1 },
    armabee_queen:  { model: Q('fly_armabee_evolved'), height: 2.4, speed: 6.0, hp: 1.3, dmg: 1.2, hover: 1.1 },
    skullcrusher:   { model: Q('big_orc_skull'), height: 2.6, speed: 5.2, hp: 1.4, dmg: 1.3 },
    // Frostpeak
    snow_yeti:      { model: Q('blob_yeti'), height: 1.45, speed: 4.6, hp: 1.15, dmg: 1.05 },
    cryo_imp:       { model: 'monster_imp_frost', scale: 1.1, speed: 6.0, hp: 0.95, dmg: 1.1, ranged: true, legacy: true },
    frost_glub:     { model: Q('fly_glub'), height: 1.5, speed: 5.0, hp: 0.95, dmg: 1.05, hover: 1.2, ranged: true },
    goleling:       { model: Q('fly_goleling'), height: 1.7, speed: 4.6, hp: 1.3, dmg: 1.1, hover: 0.8 },
    goleling_elder: { model: Q('fly_goleling_evolved'), height: 2.4, speed: 4.6, hp: 1.4, dmg: 1.25, hover: 0.8 },
    frozen_gulper:  { model: Q('blob_fish'), height: 1.35, speed: 4.6, hp: 1.05, dmg: 1.05 },
    yeti_brute:     { model: Q('big_yeti'), height: 2.6, speed: 5.0, hp: 1.35, dmg: 1.25 },
    // Astral Breach
    scolitex:       { model: 'monster_alien_scolitex', scale: 0.62, speed: 6.8, hp: 0.95, dmg: 1.1, legacy: true, alien: true },
    oculi:          { model: 'monster_alien_oculichrysalis', scale: 1.15, speed: 5.2, hp: 1.15, dmg: 1.15, ranged: true, legacy: true, alien: true },
    xeno_blob:      { model: Q('blob_alien'), height: 1.35, speed: 4.8, hp: 1.0, dmg: 1.05 },
    xeno_stalker:   { model: Q('big_alien'), height: 2.5, speed: 5.6, hp: 1.25, dmg: 1.2 },
    void_squidle:   { model: Q('fly_squidle'), height: 1.8, speed: 5.0, hp: 1.0, dmg: 1.1, hover: 1.3, ranged: true },
    cyclops:        { model: 'monster_alien_cyclop', scale: 1.35, speed: 4.6, hp: 1.4, dmg: 1.3, legacy: true, alien: true },
    // Infernal Rift
    pit_fiend:      { model: Q('big_demon'), height: 2.6, speed: 5.2, hp: 1.3, dmg: 1.25 },
    inferno_imp:    { model: 'monster_imp', scale: 1.15, speed: 6.0, hp: 1.0, dmg: 1.15, ranged: true, legacy: true, tint: 0xff5522 },
    ember_drake:    { model: Q('fly_dragon'), height: 1.9, speed: 5.8, hp: 1.05, dmg: 1.2, hover: 1.4, ranged: true },
    lava_whelp:     { model: Q('more_dragon'), height: 1.7, speed: 5.4, hp: 1.0, dmg: 1.15, hover: 1.2 },
    hellfire_alpaca:{ model: Q('fly_alpaking_evolved'), height: 2.4, speed: 5.4, hp: 1.4, dmg: 1.3, hover: 1.0 },
    azure_hellion:  { model: Q('big_bluedemon'), height: 2.7, speed: 5.4, hp: 1.4, dmg: 1.3 },
    // Chrono Citadel
    chrono_assassin:{ model: Q('big_ninja'), height: 2.4, speed: 6.6, hp: 1.1, dmg: 1.3 },
    timeworn_magus: { model: Q('blob_wizard'), height: 1.5, speed: 4.8, hp: 0.95, dmg: 1.25, ranged: true },
    shade_initiate: { model: Q('blob_ninja'), height: 1.4, speed: 6.4, hp: 0.95, dmg: 1.2 },
    chrono_revenant:{ model: Q('fly_ghost_skull'), height: 2.0, speed: 5.6, hp: 1.1, dmg: 1.25, hover: 1.0, ranged: true, tint: 0xb266ff },
    archon_sentinel:{ model: Q('more_skeleton'), height: 2.6, speed: 5.0, hp: 1.35, dmg: 1.3, tint: 0xf3c86b },
    malakor:        { model: 'boss_chrono_archon', scale: 1.65, speed: 5.2, hp: 1.6, dmg: 1.4, legacy: true, weaponId: 'Scythe', offhandId: 'Sword_Golden' },
    // World bosses
    ember_wyrm:     { model: Q('fly_dragon_evolved'), height: 2.4, speed: 5.0, hp: 1, dmg: 1, hover: 2.2 },
    storm_sovereign:{ model: Q('fly_hywirl'), height: 2.2, speed: 5.0, hp: 1, dmg: 1, hover: 1.8 },
    leviathan:      { model: Q('fly_squidle'), height: 2.2, speed: 4.6, hp: 1, dmg: 1, hover: 1.8, tint: 0x8844ff }
  };

  // ---------------------------------------------------------------------------
  // BOSS ABILITY LIBRARY (shapes are resolved in mmo_world.js)
  //  cleave: frontal cone · slam: circle on boss · quake: expanding rings (JUMP)
  //  charge: line dash · meteors: circles under heroes · nova: donut (stand close)
  //  barrage: radial bolts (find a gap) · spin: pulsing aura (back off) · summon: adds
  // ---------------------------------------------------------------------------
  const ABILITIES = {
    cleave:  { shape: 'cone', radius: 8, arc: 2.1, windup: 1.3, mult: 2.2, hint: 'Step out of the cone' },
    slam:    { shape: 'circle', radius: 6.5, windup: 1.5, mult: 2.6, hint: 'Get away from the boss' },
    quake:   { shape: 'rings', rings: 3, gap: 0.75, speed: 10, reach: 26, windup: 1.0, mult: 1.8, hint: 'JUMP over the shockwaves' },
    charge:  { shape: 'line', width: 4.5, length: 26, windup: 1.15, mult: 2.4, hint: 'Sidestep the charge' },
    meteors: { shape: 'meteors', radius: 4.2, extra: 3, windup: 1.8, mult: 2.0, hint: 'Move out of the circles' },
    nova:    { shape: 'donut', inner: 5.5, radius: 28, windup: 2.4, mult: 3.0, hint: 'Get IN close to the boss' },
    barrage: { shape: 'barrage', bolts: 14, speed: 15, windup: 1.0, mult: 1.4, hint: 'Stand in the gaps' },
    spin:    { shape: 'spin', radius: 6, duration: 3.2, tick: 0.5, windup: 0.8, mult: 0.7, hint: 'Back away while it spins' },
    summon:  { shape: 'summon', count: 3, windup: 1.2, mult: 0, hint: 'Kill the adds' }
  };

  // ---------------------------------------------------------------------------
  // ZONES — huge Voronoi regions laid out as a leveling ring around the hub.
  // ground: weights for [grass, stone, scifi, sand] textures; tint is RGB 0..1.
  // ---------------------------------------------------------------------------
  const ZONES = [
    {
      id: 'meadows', name: 'Ashenvale Meadows', icon: '🌾', lv: [1, 6], center: [40, 330], weight: 1.12,
      ground: [1, 0.05, 0, 0], tint: [0.95, 1.02, 0.86], tint2: [1.06, 1.0, 0.78],
      sky: { horizon: 0xffc98a, zenith: 0x2f7fe0, nebula: 0xfff1e0, fog: 0xc9d6df, density: 0.0042 },
      music: 'town', amb: 'town', step: 'grass',
      props: { oak: 0.9, pine: 0.35, rock: 0.5, flower: 1.2, mushroom: 0.25, boulder: 0.12 },
      mobs: [
        { type: 'meadow_slime', name: 'Meadow Slime', lv: [1, 2] },
        { type: 'field_rat', name: 'Field Rat', lv: [1, 3] },
        { type: 'cluckbeast', name: 'Feral Cluckbeast', lv: [2, 4] },
        { type: 'bog_hopper', name: 'Bog Hopper', lv: [3, 5] },
        { type: 'bubble_ooze', name: 'Bubblegum Ooze', lv: [4, 6] },
        { type: 'thornwing', name: 'Thornwing Wasp', lv: [4, 6] },
        { type: 'sporecap', name: 'Sporecap', lv: [3, 6] }
      ],
      elites: [{ type: 'sporecap_brute', name: 'Old Mossbelly', lv: 6 }, { type: 'thumper', name: 'Thumper the Unruly', lv: 5 }],
      boss: {
        type: 'big_mushroomking', model: Q('big_mushroomking'), name: 'Mycelord Fungaron', title: 'Tyrant of the Meadows', lv: 7, height: 5.0,
        phases: [
          { hp: 1.0, gap: 3.2, rotation: ['cleave', 'slam', 'cleave', 'summon'] },
          { hp: 0.5, gap: 2.8, rotation: ['cleave', 'meteors', 'slam', 'summon'], say: 'Spores... everywhere!' }
        ],
        names: { meteors: 'Spore Rain', summon: 'Call Sporelings', slam: 'Fungal Stomp', cleave: 'Cap Sweep' },
        adds: 'sporecap'
      }
    },
    {
      id: 'whisperwood', name: 'Whisperwood Forest', icon: '🌲', lv: [6, 12], center: [-760, 520], weight: 1.0,
      ground: [0.85, 0.25, 0, 0], tint: [0.66, 0.84, 0.62], tint2: [0.58, 0.72, 0.5],
      sky: { horizon: 0xf2d79e, zenith: 0x2d86cc, nebula: 0xf2fff0, fog: 0xb6cfbf, density: 0.0058 },
      music: 'town', amb: 'town', step: 'grass',
      props: { pine: 2.2, oak: 1.2, mushroom: 0.5, rock: 0.4, deadtree: 0.15, boulder: 0.1 },
      mobs: [
        { type: 'birbling', name: 'Glade Birbling', lv: [6, 8] },
        { type: 'prowler', name: 'Shadowpaw Prowler', lv: [7, 10] },
        { type: 'thicket_hound', name: 'Thicket Hound', lv: [6, 9] },
        { type: 'webspinner', name: 'Webspinner', lv: [8, 11] },
        { type: 'moss_viper', name: 'Moss Viper', lv: [9, 12] },
        { type: 'glade_pecker', name: 'Glade Pecker', lv: [8, 12] },
        { type: 'thumper', name: 'Thumper Brute', lv: [10, 12] }
      ],
      elites: [{ type: 'venomfang', name: 'Venomfang Matriarch', lv: 11 }, { type: 'monkroose', name: 'Banana Bandit Kroo', lv: 10 }],
      boss: {
        type: 'big_monkroose', model: Q('big_monkroose'), name: 'Grimtooth', title: 'The Monkroose King', lv: 13, height: 5.2,
        phases: [
          { hp: 1.0, gap: 3.0, rotation: ['charge', 'cleave', 'charge', 'slam'] },
          { hp: 0.5, gap: 2.6, rotation: ['charge', 'quake', 'cleave', 'meteors'], say: 'The canopy trembles!' }
        ],
        names: { charge: 'Savage Pounce', quake: 'Treetop Crash', meteors: 'Coconut Barrage', slam: 'Ground Pound' },
        adds: 'thicket_hound'
      }
    },
    {
      id: 'catacombs', name: 'Bestiary Catacombs', icon: '💀', lv: [12, 18], center: [-960, -300], weight: 1.0,
      ground: [0.15, 1, 0, 0], tint: [0.74, 0.8, 0.82], tint2: [0.56, 0.66, 0.64],
      sky: { horizon: 0xd2bf94, zenith: 0x3c6390, nebula: 0xe2ebe6, fog: 0x93a7a3, density: 0.0068 },
      music: 'catacombs', amb: 'catacombs', step: 'stone',
      props: { grave: 1.3, deadtree: 0.8, pillar: 0.45, rock: 0.6, boulder: 0.15, crystal: 0.08 },
      mobs: [
        { type: 'restless_bones', name: 'Restless Bones', lv: [12, 15] },
        { type: 'crypt_bat', name: 'Crypt Bat', lv: [12, 14] },
        { type: 'grave_ooze', name: 'Grave Ooze', lv: [13, 16] },
        { type: 'flame_imp', name: 'Catacomb Flame Imp', lv: [14, 17] },
        { type: 'puglin', name: 'Catacomb Puglin', lv: [15, 18] },
        { type: 'wailing_spirit', name: 'Wailing Spirit', lv: [16, 18] }
      ],
      elites: [{ type: 'skullwraith', name: 'Skullwraith Morvane', lv: 17 }, { type: 'puglin', name: 'Puglin Bonegnawer', lv: 16 }],
      boss: {
        type: 'puglin_chief', model: 'monster_puglin_chieftain', name: 'Gronk', title: 'Puglin Warlord', lv: 19, scale: 3.0, legacy: true, weaponId: 'Axe_Double',
        story: 'ch2', voice: { engage: 'gronk_engage', death: 'gronk_death' },
        phases: [
          { hp: 1.0, gap: 3.0, rotation: ['cleave', 'charge', 'slam'] },
          { hp: 0.6, gap: 2.7, rotation: ['summon', 'quake', 'cleave', 'charge'], say: 'Puglins! To Gronk!' },
          { hp: 0.25, gap: 2.0, rotation: ['charge', 'slam', 'quake', 'cleave'], enrage: true, say: 'GRONK SMASH!' }
        ],
        names: { cleave: 'Bone Cleaver', charge: 'Warlord Rush', slam: 'Crypt Breaker', quake: 'Catacomb Collapse', summon: 'Rally the Pack' },
        adds: 'puglin'
      }
    },
    {
      id: 'badlands', name: 'Scorched Badlands', icon: '🏜️', lv: [18, 25], center: [-330, -920], weight: 1.05,
      ground: [0.1, 0.25, 0, 1], tint: [1.12, 0.9, 0.66], tint2: [1.0, 0.72, 0.5],
      sky: { horizon: 0xffb578, zenith: 0x3b8fe0, nebula: 0xfff1de, fog: 0xe2c6a0, density: 0.0040 },
      music: 'town', amb: 'citadel', step: 'gravel',
      props: { cactus: 1.0, rock: 1.0, boulder: 0.3, deadtree: 0.35, bones: 0.4, mesa: 0.08 },
      mobs: [
        { type: 'prickleblob', name: 'Prickleblob', lv: [18, 20] },
        { type: 'cactoro', name: 'Spined Cactoro', lv: [19, 22] },
        { type: 'dustclaw', name: 'Dustclaw Raptor', lv: [20, 23] },
        { type: 'dune_armabee', name: 'Dune Armabee', lv: [19, 24] },
        { type: 'sandscar', name: 'Sandscar Raider', lv: [21, 25] },
        { type: 'ironjaw', name: 'Ironjaw Orc', lv: [22, 25] }
      ],
      elites: [{ type: 'armabee_queen', name: 'Armabee Queen Zzyra', lv: 23 }, { type: 'ironjaw', name: 'Ironjaw Pitboss', lv: 24 }],
      boss: {
        type: 'skullcrusher', model: Q('big_orc_skull'), name: 'Warchief Skullcrusher', title: 'Lord of the Dunes', lv: 26, height: 5.6,
        phases: [
          { hp: 1.0, gap: 2.9, rotation: ['slam', 'charge', 'cleave', 'quake'] },
          { hp: 0.5, gap: 2.5, rotation: ['meteors', 'charge', 'nova', 'cleave'], say: 'Beat the war drums!' }
        ],
        names: { meteors: 'War Drums', nova: 'Sandstorm Fury', quake: 'Earthshaker', charge: 'Bull Rush' },
        adds: 'sandscar'
      },
      worldBoss: {
        type: 'ember_wyrm', model: Q('fly_dragon_evolved'), name: 'Ignaroth', title: 'The Ember Wyrm — World Boss', lv: 28, height: 9.0, hover: 3.5, respawnMin: 12,
        phases: [
          { hp: 1.0, gap: 2.6, rotation: ['barrage', 'meteors', 'charge', 'quake'] },
          { hp: 0.6, gap: 2.3, rotation: ['nova', 'barrage', 'meteors', 'charge', 'quake'], say: 'Burn beneath my wings!' },
          { hp: 0.25, gap: 1.8, rotation: ['meteors', 'quake', 'barrage', 'nova', 'charge'], enrage: true, say: 'The sky itself ignites!' }
        ],
        names: { barrage: 'Flame Breath', meteors: 'Firestorm', nova: 'Inferno Ring', quake: 'Wing Buffet', charge: 'Diving Strike' }
      }
    },
    {
      id: 'frostpeak', name: 'Frostpeak Tundra', icon: '❄️', lv: [25, 32], center: [640, -820], weight: 1.0,
      ground: [0.25, 0.9, 0, 0.2], tint: [1.2, 1.25, 1.35], tint2: [0.92, 1.0, 1.15],
      sky: { horizon: 0xffd9b4, zenith: 0x58a8f2, nebula: 0xffffff, fog: 0xdbe7f3, density: 0.0058 },
      music: 'catacombs', amb: 'town', step: 'stone',
      props: { snowpine: 1.6, icespike: 0.6, rock: 0.6, boulder: 0.2 },
      mobs: [
        { type: 'snow_yeti', name: 'Snowball Yeti', lv: [25, 27] },
        { type: 'frozen_gulper', name: 'Frozen Gulper', lv: [25, 28] },
        { type: 'cryo_imp', name: 'Cryo-Rift Imp', lv: [26, 30] },
        { type: 'frost_glub', name: 'Frost Glub', lv: [27, 31] },
        { type: 'goleling', name: 'Icebound Goleling', lv: [28, 32] },
        { type: 'yeti_brute', name: 'Yeti Brute', lv: [30, 32] }
      ],
      elites: [{ type: 'goleling_elder', name: 'Elder Goleling Krag', lv: 30 }, { type: 'yeti_brute', name: 'Old Snowbeard', lv: 31 }],
      boss: {
        type: 'yeti_brute', model: Q('big_yeti'), name: 'Frostmaw', title: 'The Avalanche', lv: 33, height: 6.0, tint: 0xbfe6ff,
        phases: [
          { hp: 1.0, gap: 2.8, rotation: ['quake', 'cleave', 'barrage', 'slam'] },
          { hp: 0.5, gap: 2.4, rotation: ['nova', 'meteors', 'quake', 'charge'], say: 'The mountain answers me!' }
        ],
        names: { nova: 'Blizzard', meteors: 'Avalanche', barrage: 'Ice Shards', quake: 'Glacial Stomp' },
        adds: 'snow_yeti'
      },
      worldBoss: {
        type: 'storm_sovereign', model: Q('fly_hywirl'), name: 'Hywirl', title: 'The Storm Sovereign — World Boss', lv: 36, height: 8.5, hover: 3.0, respawnMin: 14, tint: 0xa8e0ff,
        phases: [
          { hp: 1.0, gap: 2.5, rotation: ['spin', 'quake', 'barrage', 'meteors'] },
          { hp: 0.55, gap: 2.2, rotation: ['nova', 'spin', 'barrage', 'quake', 'meteors'], say: 'Feel the gale!' },
          { hp: 0.25, gap: 1.7, rotation: ['quake', 'barrage', 'spin', 'nova', 'meteors'], enrage: true, say: 'THE STORM IS ENDLESS!' }
        ],
        names: { spin: 'Cyclone', quake: 'Thunderclap', barrage: 'Hailstorm', meteors: 'Lightning Strikes', nova: 'Eye of the Storm' }
      }
    },
    {
      id: 'breach', name: 'The Astral Breach', icon: '🛸', lv: [32, 39], center: [1080, 40], weight: 1.0,
      ground: [0, 0.2, 1, 0], tint: [0.84, 0.92, 1.12], tint2: [0.72, 0.78, 1.0],
      sky: { horizon: 0xdca8ff, zenith: 0x2c52b4, nebula: 0xeae2ff, fog: 0xa4a4dc, density: 0.0052 },
      music: 'catacombs', amb: 'breach', step: 'metal',
      props: { crystal: 1.2, pylon: 0.25, rock: 0.5, boulder: 0.15 },
      mobs: [
        { type: 'xeno_blob', name: 'Xeno Blobling', lv: [32, 34] },
        { type: 'scolitex', name: 'Xeno-Scolitex Swarmer', lv: [32, 36] },
        { type: 'oculi', name: 'Oculichrysalis Watcher', lv: [34, 38] },
        { type: 'void_squidle', name: 'Void Squidle', lv: [35, 39] },
        { type: 'xeno_stalker', name: 'Xeno Stalker', lv: [36, 39] }
      ],
      elites: [{ type: 'xeno_stalker', name: 'Prime Stalker Vex', lv: 37 }, { type: 'oculi', name: 'Overseer Eye', lv: 38 }],
      boss: {
        type: 'cyclops', model: 'monster_alien_cyclop', name: 'Astral Cyclops Juggernaut', title: 'Purger of Timelines', lv: 40, scale: 2.8, legacy: true,
        story: 'ch3', voice: { engage: 'xeno_engage', death: 'xeno_death' },
        phases: [
          { hp: 1.0, gap: 2.7, rotation: ['barrage', 'charge', 'slam'] },
          { hp: 0.6, gap: 2.4, rotation: ['quake', 'barrage', 'nova', 'meteors'], say: 'Escalating purge protocol.' },
          { hp: 0.25, gap: 1.9, rotation: ['charge', 'quake', 'barrage', 'meteors', 'nova'], enrage: true, say: 'Critical. Overclocking.' }
        ],
        names: { barrage: 'Photon Volley', charge: 'Juggernaut Drive', nova: 'Singularity Pulse', meteors: 'Orbital Strike', quake: 'Gravity Quake' },
        adds: 'scolitex'
      }
    },
    {
      id: 'infernal', name: 'Infernal Rift', icon: '🔥', lv: [39, 46], center: [760, 860], weight: 1.0,
      ground: [0, 1, 0.15, 0.25], tint: [0.62, 0.36, 0.32], tint2: [0.42, 0.24, 0.24],
      sky: { horizon: 0xff9152, zenith: 0x6a3c8e, nebula: 0xffd4b4, fog: 0xb88070, density: 0.0060 },
      music: 'catacombs', amb: 'citadel', step: 'gravel',
      props: { lavarock: 1.1, deadtree: 0.6, rock: 0.6, crystal: 0.2, boulder: 0.2, bones: 0.3 },
      mobs: [
        { type: 'inferno_imp', name: 'Inferno Imp', lv: [39, 42] },
        { type: 'lava_whelp', name: 'Lava Whelp', lv: [39, 43] },
        { type: 'ember_drake', name: 'Ember Drake', lv: [41, 45] },
        { type: 'pit_fiend', name: 'Pit Fiend', lv: [42, 46] },
        { type: 'hellfire_alpaca', name: 'Hellfire Alpaking', lv: [44, 46] }
      ],
      elites: [{ type: 'pit_fiend', name: 'Fiendlord Baal-Zoth', lv: 44 }, { type: 'hellfire_alpaca', name: 'Scorchmane', lv: 45 }],
      boss: {
        type: 'azure_hellion', model: Q('big_bluedemon'), name: 'Azhazel', title: 'The Azure Tyrant', lv: 47, height: 6.2,
        phases: [
          { hp: 1.0, gap: 2.6, rotation: ['meteors', 'cleave', 'charge', 'spin'] },
          { hp: 0.6, gap: 2.3, rotation: ['nova', 'summon', 'quake', 'meteors'], say: 'Rise, children of the rift!' },
          { hp: 0.25, gap: 1.8, rotation: ['spin', 'meteors', 'quake', 'charge', 'nova'], enrage: true, say: 'BURN WITH ME!' }
        ],
        names: { meteors: 'Hellfire Rain', spin: 'Infernal Vortex', nova: 'Azure Cataclysm', summon: 'Open the Pits' },
        adds: 'inferno_imp'
      },
      worldBoss: {
        type: 'leviathan', model: Q('fly_squidle'), name: 'The Abyssal Leviathan', title: 'Devourer of Rifts — World Boss', lv: 46, height: 10.0, hover: 3.5, respawnMin: 16, tint: 0x8844ff,
        phases: [
          { hp: 1.0, gap: 2.4, rotation: ['nova', 'barrage', 'quake', 'meteors'] },
          { hp: 0.6, gap: 2.1, rotation: ['summon', 'barrage', 'nova', 'meteors', 'quake'], say: 'The abyss hungers.' },
          { hp: 0.25, gap: 1.6, rotation: ['quake', 'meteors', 'barrage', 'nova', 'spin'], enrage: true, say: 'ALL RIFTS END IN ME!' }
        ],
        names: { nova: 'Abyssal Maw', barrage: 'Tentacle Lash', quake: 'Rift Tremor', meteors: 'Void Rain', summon: 'Spawn of the Deep' },
        adds: 'void_squidle'
      }
    },
    {
      id: 'citadel', name: 'Chrono Citadel', icon: '⏳', lv: [46, 50], center: [60, 1300], weight: 0.85,
      ground: [0, 0.6, 0.6, 0.2], tint: [0.8, 0.72, 0.96], tint2: [0.64, 0.56, 0.82],
      sky: { horizon: 0xf2b4da, zenith: 0x4a4cbc, nebula: 0xf6e6ff, fog: 0xbcabd8, density: 0.0054 },
      music: 'town', amb: 'citadel', step: 'stone',
      props: { pillar: 1.0, crystal: 0.8, pylon: 0.25, rock: 0.4, boulder: 0.1 },
      mobs: [
        { type: 'shade_initiate', name: 'Shade Initiate', lv: [46, 48] },
        { type: 'timeworn_magus', name: 'Timeworn Magus', lv: [46, 49] },
        { type: 'chrono_revenant', name: 'Chrono Revenant', lv: [47, 50] },
        { type: 'chrono_assassin', name: 'Chrono Assassin', lv: [48, 50] },
        { type: 'archon_sentinel', name: 'Archon Sentinel', lv: [48, 50] }
      ],
      elites: [{ type: 'chrono_assassin', name: 'Blade of the Archon', lv: 49 }, { type: 'archon_sentinel', name: 'Throne Warden', lv: 50 }],
      boss: {
        type: 'malakor', model: 'boss_chrono_archon', name: 'MALAKOR', title: 'The Chrono-Fused Archon', lv: 50, scale: 2.6, legacy: true, weaponId: 'Scythe', offhandId: 'Sword_Golden',
        story: 'ch4', isFinal: true, voice: { engage: 'malakor_engage', half: 'malakor_half', quarter: 'malakor_quarter', death: 'malakor_death' },
        phases: [
          { hp: 1.0, gap: 2.6, rotation: ['cleave', 'charge', 'slam', 'barrage'] },
          { hp: 0.66, gap: 2.3, rotation: ['quake', 'meteors', 'summon', 'nova', 'cleave'], say: 'Every age bows to me!' },
          { hp: 0.33, gap: 1.7, rotation: ['quake', 'charge', 'meteors', 'spin', 'nova'], enrage: true, say: 'Let time collapse!' }
        ],
        names: { cleave: 'Void Reap', charge: 'Temporal Lunge', slam: 'Throne Crush', barrage: 'Chrono Shards', quake: 'Age Fracture', meteors: 'Falling Epochs', nova: 'Paradox Nova', spin: 'Scythe Maelstrom', summon: 'Echoes of the Past' },
        adds: 'archon_sentinel'
      }
    }
  ];

  // ---------------------------------------------------------------------------
  // LOOT
  // ---------------------------------------------------------------------------
  const RARITIES = [
    { id: 'common', name: 'Common', color: '#c8ccd6', mult: 1.0, affixes: 0, weight: 52 },
    { id: 'uncommon', name: 'Uncommon', color: '#2ee68a', mult: 1.12, affixes: 1, weight: 30 },
    { id: 'rare', name: 'Rare', color: '#4b9eff', mult: 1.26, affixes: 2, weight: 13 },
    { id: 'epic', name: 'Epic', color: '#b266ff', mult: 1.42, affixes: 3, weight: 4 },
    { id: 'legendary', name: 'Legendary', color: '#ff9a2e', mult: 1.62, affixes: 4, weight: 0.9 },
    { id: 'mythic', name: 'Mythic', color: '#ff3b5c', mult: 1.85, affixes: 5, weight: 0 }
  ];

  const EQUIP_SLOTS = [
    { id: 'weapon', name: 'Main Hand', icon: '⚔️' },
    { id: 'offhand', name: 'Off Hand', icon: '🛡️' },
    { id: 'head', name: 'Head', icon: '⛑️' },
    { id: 'chest', name: 'Chest', icon: '🥋' },
    { id: 'hands', name: 'Hands', icon: '🧤' },
    { id: 'legs', name: 'Legs', icon: '👖' },
    { id: 'feet', name: 'Feet', icon: '🥾' },
    { id: 'neck', name: 'Amulet', icon: '📿' },
    { id: 'ring', name: 'Ring', icon: '💍' }
  ];

  // Weapon bases → 3D model ids. cls = classes that can equip.
  const WEAPON_BASES = [
    { id: 'sword', slot: 'weapon', model: 'Sword_Golden', names: ['Broadsword', 'Longsword', 'Arming Sword'], dmg: 1.0, crit: 0.12, cls: ['vanguard'] },
    { id: 'claymore', slot: 'weapon', model: 'Claymore', names: ['Claymore', 'Greatsword', 'Zweihander'], dmg: 1.18, crit: 0.14, cls: ['vanguard', 'berserker'] },
    { id: 'maul', slot: 'weapon', model: 'Hammer_Double', names: ['Maul', 'Warhammer', 'Earthbreaker'], dmg: 1.16, crit: 0.1, cls: ['vanguard', 'berserker'] },
    { id: 'axe', slot: 'weapon', model: 'Axe_Double', names: ['Battleaxe', 'Twin Axe', 'Cleaver'], dmg: 1.12, crit: 0.16, cls: ['berserker'] },
    { id: 'bow', slot: 'weapon', model: 'Bow_Golden', names: ['Longbow', 'Recurve Bow', 'Warbow'], dmg: 1.05, crit: 0.2, cls: ['ranger'] },
    { id: 'darkbow', slot: 'weapon', model: 'Bow_Evil', names: ['Shadowbow', 'Dread Bow', 'Thornbow'], dmg: 1.1, crit: 0.22, cls: ['ranger'] },
    { id: 'scythe', slot: 'weapon', model: 'Scythe', names: ['Scythe', 'Reaper', 'Harvester'], dmg: 1.12, crit: 0.18, cls: ['arcanist'] },
    { id: 'spear', slot: 'weapon', model: 'Spear', names: ['Spear', 'Glaive', 'Lance'], dmg: 1.06, crit: 0.17, cls: ['arcanist', 'vanguard'] },
    { id: 'shield', slot: 'offhand', model: 'Shield_Celtic_Golden', names: ['Kite Shield', 'Aegis', 'Bulwark'], armor: 1.6, cls: ['vanguard'] },
    { id: 'heater', slot: 'offhand', model: 'Shield_Heater_2', names: ['Heater Shield', 'Tower Shield', 'Ward'], armor: 1.8, cls: ['vanguard'] },
    { id: 'dagger', slot: 'offhand', model: 'Dagger_2', names: ['Kris', 'Dirk', 'Stiletto'], dmg: 0.35, crit: 0.08, cls: ['ranger'] },
    { id: 'offhammer', slot: 'offhand', model: 'Hammer_Double', names: ['Hand Maul', 'Skullsplitter'], dmg: 0.4, crit: 0.05, cls: ['berserker'] },
    { id: 'tome', slot: 'offhand', model: '', names: ['Grimoire', 'Chrono Tome', 'Focus Orb'], dmg: 0.3, crit: 0.06, cls: ['arcanist'] }
  ];
  const ARMOR_BASES = [
    { slot: 'head', armor: 1.0, names: { plate: 'Helm', leather: 'Hood', cloth: 'Circlet' } },
    { slot: 'chest', armor: 1.8, names: { plate: 'Cuirass', leather: 'Jerkin', cloth: 'Robe' } },
    { slot: 'hands', armor: 0.7, names: { plate: 'Gauntlets', leather: 'Grips', cloth: 'Wraps' } },
    { slot: 'legs', armor: 1.4, names: { plate: 'Greaves', leather: 'Leggings', cloth: 'Trousers' } },
    { slot: 'feet', armor: 0.8, names: { plate: 'Sabatons', leather: 'Boots', cloth: 'Slippers' } },
    { slot: 'neck', armor: 0, names: { any: 'Amulet' } },
    { slot: 'ring', armor: 0, names: { any: 'Ring' } }
  ];
  const CLASS_ARMOR = { vanguard: 'plate', berserker: 'plate', ranger: 'leather', arcanist: 'cloth' };
  const ARMOR_TYPE_MULT = { plate: 1.25, leather: 1.0, cloth: 0.8 };

  // Affix pool: value(ilvl) returns the rolled magnitude before rarity scaling.
  const AFFIXES = [
    { id: 'vit', label: (v) => `+${v} Vitality (HP)`, roll: (L) => Math.round(18 * Math.pow(1.08, L - 1) * (0.7 + Math.random() * 0.6)) },
    { id: 'power', label: (v) => `+${v}% Power`, roll: () => Math.round(3 + Math.random() * 5) },
    { id: 'crit', label: (v) => `+${v}% Critical Strike`, roll: () => Math.round(2 + Math.random() * 3) },
    { id: 'critdmg', label: (v) => `+${v}% Critical Damage`, roll: () => Math.round(8 + Math.random() * 14) },
    { id: 'haste', label: (v) => `+${v}% Cooldown Haste`, roll: () => Math.round(3 + Math.random() * 5) },
    { id: 'leech', label: (v) => `+${v}% Lifesteal`, roll: () => Math.round(1 + Math.random() * 2) },
    { id: 'speed', label: (v) => `+${v}% Move Speed`, roll: () => Math.round(2 + Math.random() * 4) },
    { id: 'armorpct', label: (v) => `+${v}% Armor`, roll: () => Math.round(5 + Math.random() * 10) }
  ];
  const PREFIXES = {
    common: ['Worn', 'Plain', 'Sturdy', 'Rough'],
    uncommon: ['Fine', 'Tempered', 'Hunter\'s', 'Soldier\'s'],
    rare: ['Gleaming', 'Runed', 'Stormforged', 'Moonlit'],
    epic: ['Chrono-Bound', 'Astral', 'Dreadforged', 'Sunsteel'],
    legendary: ['Ashenvale', 'Godslayer\'s', 'Eternal', 'Rift-Touched'],
    mythic: ['Archon\'s', 'Worldender\'s', 'Timeless']
  };
  const SUFFIXES = ['of the Bear', 'of the Hawk', 'of Embers', 'of the Tundra', 'of Echoes', 'of the Rift', 'of Valor', 'of Shadows', 'of the Sun', 'of Ruin'];

  // ---------------------------------------------------------------------------
  // QUESTS — generated per zone from these templates (see mmo_rpg.js)
  // ---------------------------------------------------------------------------
  const QUEST_GIVERS = {
    meadows: { name: 'Warden Elric', model: 'npc_blacksmith' },
    whisperwood: { name: 'Ranger Sylwen', model: 'hero_ranger' },
    catacombs: { name: 'Gravekeeper Moss', model: 'npc_scholar' },
    badlands: { name: 'Caravan Master Rhaz', model: 'npc_blacksmith' },
    frostpeak: { name: 'Seer Ylva', model: 'npc_cleric' },
    breach: { name: 'Riftwatcher Ozen', model: 'npc_scholar' },
    infernal: { name: 'Flamewarden Ashka', model: 'npc_cleric' },
    citadel: { name: 'Lyra, Rift Gatekeeper', model: 'hero_ranger' }
  };
  const COLLECT_ITEMS = {
    meadows: ['Gooey Slime Jelly', 'Rat Tail', 'Fluffy Plume'],
    whisperwood: ['Shadowpaw Pelt', 'Silken Web Gland', 'Viper Fang'],
    catacombs: ['Ancient Bone Fragment', 'Grave Dust', 'Ectoplasm Wisp'],
    badlands: ['Cactoro Needle', 'Raptor Claw', 'Orcish War Totem'],
    frostpeak: ['Everfrost Shard', 'Yeti Fur Tuft', 'Glub Ink'],
    breach: ['Xeno-Prism Fragment', 'Void Ink Sac', 'Stalker Carapace'],
    infernal: ['Brimstone Core', 'Drake Scale', 'Fiend Horn'],
    citadel: ['Chrono Dust', 'Shattered Hourglass', 'Archon Sigil']
  };
  const EXPLORE_SITES = {
    meadows: ['Old Windmill Ruins', 'Fungal Fairy Ring'],
    whisperwood: ['The Hollow Oak', 'Moonwell Glade'],
    catacombs: ['Ossuary Gate', 'Sunken Crypt'],
    badlands: ['Bleached Titan Bones', 'Mirage Oasis'],
    frostpeak: ['Frozen Shrine', 'Shattered Glacier'],
    breach: ['Crashed Xeno Pod', 'Gravity Well'],
    infernal: ['Brimstone Caldera', 'Gate of Cinders'],
    citadel: ['Hall of Broken Ages', 'Clocktower Spire']
  };

  const MMO_EXPORT = {
    WORLD, MOB_TYPES, ABILITIES, ZONES, RARITIES, EQUIP_SLOTS, WEAPON_BASES, ARMOR_BASES,
    CLASS_ARMOR, ARMOR_TYPE_MULT, AFFIXES, PREFIXES, SUFFIXES, QUEST_GIVERS, COLLECT_ITEMS, EXPLORE_SITES,
    // ---- shared stat curves ----
    mobHp: (L) => Math.round(150 * Math.pow(1.09, L - 1)),
    mobDmg: (L) => Math.round(19 * Math.pow(1.085, L - 1)),
    mobXp: (L) => Math.round(12 + 6 * L),
    xpToNext: (L) => Math.round((12 + 6 * L) * (8 + 1.2 * L) * 1.05),
    weaponDmg: (ilvl) => 42 * Math.pow(1.085, ilvl - 1),
    armorBudget: (ilvl) => (40 + 22 * ilvl) * 0.45,
    heroHp: (base, L) => Math.round(base * Math.pow(1.08, L - 1))
  };
  if (typeof window !== 'undefined') window.MMO = MMO_EXPORT;
  if (typeof module === 'object' && module.exports) module.exports = MMO_EXPORT;
})();
