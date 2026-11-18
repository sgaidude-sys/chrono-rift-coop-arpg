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

### 🌿 Foliage (`mmo_foliage.js`)
- **Wind grass**: one `InstancedMesh` of 18,000 three-blade tufts, so 54,000 tapered blades (7,000 tufts on phones). The vertex shader wraps the field around the camera, so the CPU never rebuilds it. Grass grows only on flat, grassy terrain (no roads, cliffs, paving or peaks). It bends in sweeping sine-wave gusts, shrinks away between 55 and 70 m, and its base uses the ground's own color. It never casts shadows. Cost: about 1 ms per frame.
- **Procedural trees**: 4 seeded broadleaf variants with twisted, tapered, flared trunks and clustered, noise-displaced icosahedron canopies with soft "blob" normals. The cel-shaded `MeshToonMaterial` gives warm sunlit tops, deep teal undersides, rim light and wind rustle.
- **Clusters**: in `world_core.js`, trees skip slopes steeper than 0.5 rise/run (checked with the shared `getTerrainHeight`) and spawn glowing wildflower clusters and pebble rocks. Trunks and rocks are registered in the existing chunk collision grid. Flowers glow brighter at night.

### 🌊 Water & Atmosphere (`mmo_water.js`)
- **Lakes**: the sea level is `WORLD.waterLevel = -2 m`. The shared `getTerrainHeight` shapes everything below it into a gently sloping lake bed at most about 1.5 m deep, so heroes and monsters wade through it. `getWaterDepth(x, z)` is exported for clients and servers. Trees, flowers, grass and monster camps stay out of the water, and the ground blends into a sand beach and darker wet sand at the waterline.
- **Water shader**: one grid that follows the hero, rendered with a custom `ShaderMaterial`. It has two layers of noise-warped ripples, a Fresnel reflection of the live day-night sky gradient, a stylized sun or moon glint that blooms, and a shallow-to-deep turquoise gradient with caustic shimmer. Wading rings appear around the hero.
- **Shoreline foam**: computed per pixel from `waterLevel − terrain height`, sampled from the same baked heightmap that displaces the ground. It gives a crisp white lip plus broken animated foam lines and needs no depth-buffer pass, so it is reliable at every camera angle and on every GPU.
- **Ambient particles**: 500 GPU points (260 on phones) of glowing motes and dandelion seeds drawn with filaments. They drift on the wind in a box around the hero, and all motion runs in the vertex shader, so the CPU does no per-frame work. Blending is additive, shadows are off, and the motes become green fireflies at night.
- **Cost**: 2 draw calls, 0 shadow draws, 2 geometries, 0 textures, about 0.4 ms per frame.
- **Performance audit**: call `game.perfAudit()` in the console. It reports draw calls and triangles for one full composer frame, GPU geometry, texture and program counts, JS heap, and live entity counts. It found and fixed:
  - town NPCs (12 NPCs, 207 skinned draws plus shadows) still rendering across the map; they are now hidden beyond 80 m, which cut a frame by the lake from 563 to 112 draw calls;
  - leaked geometry and materials from telegraph circles, projectiles and loot drops, now disposed. Shared model-cache data is protected by `userData.ownsGPU` tags.

### 🎵 Scene Music (`mmo_music.js`)
The game picks one of five songs from `public/assets/audio/music/` based on the current scene, checked 4 times per second:

| Song | When it plays |
|---|---|
| `boss_epic` | A zone or world boss is engaged. It stays on for 5 s after the boss disengages. |
| `combat` | You hit or are hit by a monster, or a monster is hunting you within 20 m. It stays on for 7 s after the last of these. |
| `town_day` | You are in Ashenvale Bastion. |
| `explore_day` / `explore_night` | You are out in the world. The song follows the day-night cycle and switches when the sky passes 65% night (or back below 35%). |

- **No overlap.** The current song fades out completely and pauses before the next one fades in. Combat and boss songs cut in faster (0.7–1 s fades) than calm ones (2.4 s out, 3 s in). If the scene changes back during a fade, the fade reverses instead of the song restarting. Town and exploration songs resume where they left off after a fight.
- **No lag.** Songs stream through `<audio>` → `MediaElementSource` instead of being decoded into RAM all at once. Each song loads only when first needed, and the next one starts buffering while the previous fades out. Fades are gain ramps scheduled once per transition and run on the audio thread, so nothing is computed per frame. Paused songs stop decoding, and muting pauses the active song.
- **Files.** The source songs were loudness-normalised to −16 LUFS, trimmed of silence and given click-free loop edges. They are 128 kbps, 44.1 kHz MP3s, 15.6 MB in total (down from 23.6 MB).
- **Debugging.** `game.audio.musicDebug()` shows the wanted song, the current song, the fade state, and each song's volume, position and buffering.

### ⚡ Combat Feel & Shrines (`mmo_combatfx.js`)
- **Damage numbers.** A pool of 56 HTML overlay nodes (36 on phones), anchored to the world and moved only with `transform`. There are no per-number animation loops and no DOM churn.
  - Each number pops upward with a springy bounce, colour-coded and glowing by element.
  - Crits are bigger and marked ✦. Reactions add a coloured label, and damage the hero takes shows in red.
- **Elements.** Every skill carries an element (see `SKILL_ELEM`):
  - **Vanguard:** Electro; Phalanx Banner is Hydro.
  - **Ranger:** Hydro; Fan of Blades is Cryo and Starfall is Electro.
  - **Arcanist:** Cryo; Vortex and Blink are Electro.
  - **Berserker:** Pyro; Crusher Leap is Electro.
- **Statuses and reactions.** A hit leaves a 9 s element status, shown as a glowing icon above the enemy. Enemies standing in lakes get Hydro automatically. Hitting a second element triggers a reaction burst:

| Elements | Reaction | Effect |
|---|---|---|
| Hydro + Electro | Electro-Charged | Lightning chains to 3 nearby enemies |
| Pyro + Electro | Overloaded | Explosion |
| Cryo + Electro | Superconduct | AoE; enemies take +25% damage for 8 s |
| Hydro + Cryo | Frozen | Stun (2.6 s, 0.9 s on bosses) |
| Pyro + Cryo | Melt | Hit deals ×2 or ×1.5 |
| Pyro + Hydro | Vaporize | Hit deals ×2 or ×1.5 |

- **Weapon trails.** A ribbon mesh tracks the base and tip of the hero's weapon bone during attacks. It is smoothed with Catmull-Rom curves, tinted by element, drawn additively, and fades over 0.2 s. A pool of 6 trails serves the hero, AI allies and party members within 40 m.
- **Waypoint shrines.** Each shrine has a hexagonal stone dais, floating crystals, counter-rotating procedural rune rings, a 70 m light beam and a pulsing ground ring.
  - You unlock a shrine by walking right up to it (5 m; it used to be 18 m), which triggers a beam flare and a burst.
  - An unlocked shrine blesses you every 90 s: basic attacks take the zone's element for 60 s, and you heal 25% HP.
- **Hit-stop and camera shake.** Crits, heavy attacks, reactions and boss skills that land freeze the frame for 40 ms, throttled so multi-hit skills stay smooth. They also add smooth camera shake that scales with the square of hit strength (trauma²), with a slight roll. The shake is applied after the camera's smoothing, so it isn't damped away.
- **Co-op note.** Reactions are calculated by the attacker's client. Damage numbers sync as before, but reaction visuals show only for the player who triggered them.

### 🎨 Hand-Painted Foliage & Grounding (`mmo_foliage.js`, `mmo_grounding.js`)
- **Spherized canopy normals.** Each canopy cluster's normals point outward from the cluster centre, using the *undisplaced* sphere direction. They are pulled 20% toward the whole crown, so the canopy shades as one soft mass. The lumpy silhouette stays, but light wraps smoothly across the crown with no dark facet triangles. A feathered 3-tone ramp, linearly filtered, replaces the hard 3-band toon ramp.
- **Vertical canopy gradient.** Each tree stores a normalised canopy height attribute (`aCanopyH`, 0 at the lowest leaves to 1 at the top). The foliage shader blends deep teal at the bottom, rich emerald in the middle and sunlit yellow-green at the top. Zone tints shift the hue without changing brightness.
- **Contact shadows.** Soft ambient-occlusion decals sit under trees, rocks, boulders and other props, and under the hero, allies, party members, monsters and NPCs. They use 2 draw calls in total: the prop decals are streamed and culled with the props, and the character decals are rebuilt each frame. Character decals shrink and fade while airborne and fade out on death.
  - The decal vertex shader rebuilds the ground mesh's exact triangle surface, so decals sit on the visible ground, including slopes. They also fade with the fog.
- **Culling.** Props are cached per 64 m chunk as ready-made matrix and colour blocks.
  - Each frame, chunks are tested against the camera frustum with a 12 m margin, so nothing pops at the screen edges.
  - Chunks within 56 m of the hero always stay in, because they cast into the shadow map.
  - Instance buffers are rebuilt with a fast copy, and only the used range is uploaded, and only when the visible set changes.
  - Grass tufts outside the view are rejected early in the vertex shader.
  - In a Whisperwood forest test, prop instances fell about 60% and triangles 15–25%. Frames take about 3 ms on a desktop GPU, well inside the 16.7 ms budget for 60 FPS.

### 🧑‍🎨 Anime Character Shading (`mmo_anime.js`)
- **Scope.** Every hero, NPC, monster and weapon material (skinned `MeshStandardMaterial`) is patched through one shared `onBeforeCompile` hook. Only fragment lighting changes, so skinning, animation, vertex colours, texture maps, hit-flash emissive and elite tints all keep working.
- **2-step cel ramp.** The direct-light N·L term is replaced by a crisp ramp with a slightly feathered terminator (smoothstep 0.02–0.10). PBR specular is reduced to 30%, and metalness and roughness are clamped so metal reads as painted colour rather than black.
- **Shadow and light tint.** The shadow side's ambient is tinted cool indigo-violet. The lit side gets a subtle warm sunlight multiply. Both follow the day-night cycle: neutral and bluer at night.
- **Rim light.** A Fresnel rim follows the silhouette. It is stronger on the side facing away from the sun and when the character is backlit, and a bit stronger at night.
- **Shadow cleanup.** Characters no longer carry the old flat blob shadow; the terrain-fitted contact shadows replace it.
- **Town paths.** The decorative tree and boulder ring around Ashenvale Bastion now keeps the north and south paths, the east–west road and the procedural main road clear.

### ✨ Cinematic Polish (`mmo_polish.js`)
- **Crystal-shatter deaths.** These replace the old wavy flame sprite. A dying monster bursts into glowing, spinning crystal shards in its death colour; the shards bounce once and shrink away. Elites and bosses also send up a short soul beam. All shards share one pooled instanced mesh (1 draw call), and the body no longer squashes as it fades.
- **Weapon colours.** The weapon models ship with plain white materials whose *names* say their colour (Steel, Gold, DarkWood, Red, LightBlue…). Each part is now coloured from an anime palette by name: cool blue steel, warm gold, rich wood, crimson. Gems and gold glow softly into the bloom.
- **Anime colour grade.** A separate post pass runs after bloom and the ACES tonemap. It adds midtone saturation, teal-shifted shadows, warm golden highlights and a gentle filmic S-curve.
- **Bloom.** The threshold is 1.05 with a soft 0.28 knee, strength 0.62 and radius 0.72. Only HDR elements halo: spells, glowing flowers and gems, the sun disk and the sun-side horizon, and bright rims. Terrain and UI stay crisp.
- **Aerial perspective.** The global fog chunk desaturates and lifts mid-distance terrain, then blends far hills into a luminous sky-blue haze derived from the live fog colour, so it follows the day-night cycle.
- **Graphics quality.** A 🎛️ button in the HUD cycles Low, Medium and High, and the choice is remembered. The default is Low on touch devices, Medium on CPUs with 4 cores or fewer, and High otherwise.

| Setting | Low | Medium | High |
|---|---|---|---|
| Pixel ratio | 0.8× | 1× | up to 2× |
| Shadow map | 512 | 1024 | 2048 |
| Grass density | 35% | 65% | 100% |
| Ambient particles | 40% | 70% | 100% |
| Bloom + grade | off | half-res | full |
