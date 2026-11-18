# ⚔️ CHRONO-RIFT: Chronicles of Ashenvale — 3D Co-Op ARPG

A complete, browser-playable **3D Co-Op Action RPG** built from the workspace's Fantasy, Medieval Village, Bestiary Dungeon Monsters, Modular Sci-Fi, Weapons, VFX, and Foley Audio packs—enhanced via **Blender 5.2** and **Godot 4.7**, and deployed on **free Vercel** + **free Supabase** (Realtime Broadcast, Presence, and Postgres).

---

## 🌟 Highlights & Creative Architecture

1. **Blender 5.2 Automated Kitbash & PBR Optimization Pipeline (`scripts/blender_enhance_pipeline.py`)**:
   - Merges modular character outfits, hairstyles, and armatures into **4 Playable 3D Hero Classes**:
     - 🛡️ **Vanguard Knight** (`hero_vanguard.glb`)
     - 🏹 **Shadow Ranger** (`hero_ranger.glb`)
     - 🔮 **Reaper Arcanist** (`hero_arcanist.glb` — custom Blender kitbash with a levitating emissive Arcane Halo)
     - 🪓 **Berserker Warlord** (`hero_berserker.glb` — custom Blender kitbash with armored pauldrons & warlord trim)
   - Extracts and packs **32 Skeletal Combat & Locomotion Animations** from `UAL1_Standard.glb` & `UAL2_Standard.glb` into `animations_arpg.glb`.
   - Builds **8 Bestiary & Sci-Fi Monsters + Custom Raid Boss**:
     - `monster_imp.glb` & custom cryo-spiked `monster_imp_frost.glb`
     - `monster_puglin.glb` & custom crowned `monster_puglin_chieftain.glb`
     - `monster_alien_scolitex.glb`, `monster_alien_oculichrysalis.glb`, `monster_alien_cyclop.glb`
     - **☠️ Custom Blender Raid Boss (`boss_chrono_archon.glb`)**: *Malakor, The Chrono-Fused Archon*, sculpted with an obsidian-gold armored rig, 6 levitating astral wing-blades, and a dual chrono-halo.
   - Exports **12 3D Weapons & Shields** (`Sword_Golden`, `Claymore`, `Scythe`, `Hammer_Double`, `Axe_Double`, `Bow_Golden`, `Bow_Evil`, `Spear`, `Dagger_2`, `Shield_Celtic_Golden`, `Shield_Heater_2`, `Arrow`) that attach dynamically to the hero's `hand_r` and `hand_l` bones.
   - Exports **17 Environment Props & Custom Blender Centerpieces**, including the **Astral Co-Op Rift Gate (`prop_astral_portal.glb`)** and **Sanctuary Revival Shrine (`prop_revive_shrine.glb`)**.

2. **Godot 4.7 Companion Project (`godot_project/`)**:
   - Includes `scenes/AshenvaleCoOpArena.tscn` and `scripts/CoOpArenaController.gd` created with Godot 4.7.2.

3. **Real-Time Drop-In Co-Op Multiplayer (`Supabase Realtime + Postgres`)**:
   - **Live Room Browser & Shareable Invite Links (`?room=CODE`)**: Friends can join public Sanctuary/Raid rooms (`ASHEN-1`, `CATACOMB-7`, `RIFT-OMEGA`) or custom party rooms.
   - **Co-Op Synergy Tethers & Aether Convergence Ultimate**: Fighting near allies links heroes with a glowing resonance tether, charging the party's **Convergence Ultimate (`R`)**.
   - **AI Wingman Companions**: Toggle 0–3 autonomous AI Co-Op heroes who patrol, fight, cast skills, and revive downed players alongside human peers.

---

## 🎙️ Audio & Voice Pipeline (`scripts/build_audio.py`)

All voice acting is pre-rendered offline with **Kokoro-82M** (`kokoro-onnx`) — no browser text-to-speech.

- **61 voiced lines, 11 characters**: each one has its own Kokoro voice plus an ffmpeg effects chain. Malakor gets a lowered pitch, an octave double and hall reverb. The Xeno-Harbinger is robotized. Gronk gets a gritty growl. Each of the 4 hero classes has its own barks (spawn, ultimate, signature skill, level-up, low HP, revive).
- Cutscene shots stretch to fit their voice line, so dialogue is never cut off. Voices use priorities (cutscene > NPC/boss > combat bark), duck the music, and skip the low-HP muffle.
- **Zone music & ambience**: seamless loops built from the raw music/Gregor Quendel packs, crossfaded as you walk between Sanctuary, Catacombs, Astral Breach and the Archon Citadel. The boss fight switches to the battle track.
- **SFX**: per-class skill layers (fire, ice, blink, summon, rock), monster-type death sounds, alternating footstep variants per surface, and distance falloff for other heroes' skills.

Rebuild the audio with `python scripts/build_audio.py [voice|music|sfx] [--force]` (needs `pip install kokoro-onnx soundfile` and ffmpeg).

---

## 🌍 MMO World (v3): procedural realm, zones, bosses, loot & quests

- **A 3.2 × 3.2 km procedural world** (`public/assets/js/mmo_world.js`, seeded, so every client builds the same world). There are 8 large zones around the Ashenvale Bastion hub. Mountain ridges separate them, and you cross only at road passes:
  Meadows (Lv 1–6) → Whisperwood (6–12) → Catacombs (12–18) → Badlands (18–25) → Frostpeak (25–32) → Astral Breach (32–39) → Infernal Rift (39–46) → Chrono Citadel (46–50).
  - Terrain blends per biome. Trees, rocks, cacti, graves, crystals, ice and lava rocks are instanced and stream in around you. Each zone has its own sky, fog, music and ambience.
  - About 2,400 monster camps get harder the deeper you go into a zone. Each zone has named elites, and waypoint outposts give fast travel ([M] world map).
- **60+ monster types**, including about 50 new Quaternius rigs (`scripts/blender_build_monsters.py` → `public/assets/models/monsters/qm/`). Camps simulate only near heroes and respawn on timers. In co-op the host runs the AI, and clients rebuild monsters from their network IDs.
- **Bosses you have to learn.** Every zone boss and world boss has HP phases and a fixed ability rotation (cleave cone, slam, jump-over shockwaves, charge line, meteors, "get in close" nova, radial barrage, spin, summon adds). A cast bar tells you what is coming. Bosses enrage at low HP and reset if everyone leaves the arena.
  - **World bosses**: Ignaroth (Badlands), Hywirl (Frostpeak), the Abyssal Leviathan (Infernal). They respawn on long timers. Bring a party.
- **Slower MMO leveling** to a level cap of 50. Mob XP falls off for grey (much lower-level) monsters, higher-level monsters hit harder and resist your damage, and you regenerate health out of combat.
- **Gear**: 9 slots (weapon, off-hand, head, chest, hands, legs, feet, amulet, ring) and 6 rarities from Common to Mythic. Items have random affixes (Vitality, Power, Crit, Crit Damage, Haste, Lifesteal, Move Speed, Armor %). Armor reduces damage taken. Loot is personal, rolled per hero. Kaelen's forge tempers weapons and crafts Rare or Epic gear.
- **103 quests**: kill, collect, explore, elite bounty, zone boss and travel quests, unlocked in tiers per zone. There's a quest log on [O], a HUD tracker, and map markers (! available, ? turn in, ✦ objective).
- Each class keeps its own MMO character progress, saved locally per browser.

---

## 🏔️ Stylized Terrain & Day-Night (v4)

- **Shared terrain math (`public/assets/js/world_core.js`)**: a UMD module with no DOM or Three.js. It holds the seeded world layout plus `getTerrainHeight(x, z)`, built from seeded 2D simplex noise: rolling hills, two-tier plateaus with cliff edges, carved valleys, and mountain ranges on zone borders. Town, roads, outposts and boss arenas stay flat. It's identical in the browser and in Node:
  ```js
  const { getTerrainHeight } = require('./public/assets/js/world_core.js');
  getTerrainHeight(120.5, -340.2);
  ```
- **No desync, no floating (`mmo_terrain.js`)**: gameplay and networking keep using flat coordinates, where y is height above ground. The heights are baked into a float heightmap, and a `TERRAIN_DISPLACE` hook in Three.js r128's vertex chunks lifts every mesh, monster, prop, VFX, nameplate and shadow onto that same surface on the GPU.
- **Cel-shaded ground**: `MeshToonMaterial` with a 3-band gradient (it keeps real shadows), plus rim lighting and procedural blending: emerald grass on flat ground, warm dirt in lowlands and on roads, faceted grey-brown cliff rock on steep slopes and peaks, and flagstones in town. No texture files.
- **Day-night cycle (`mmo_sky.js`)**: a 20-minute day shared through the wall clock, so everyone in a room sees the same time. The sun and moon move across the sky, with golden dawns and dusks, a starry night, and moonlit shadows. Fog and light follow the time of day, and the clock shows on the minimap. To test, add `?time=0.75` to the URL or call `game.setTimeOfDay(0.5)`.
