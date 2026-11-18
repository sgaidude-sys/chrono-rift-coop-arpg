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

### 🎮 Camera, HUD & Environment Detail (`mmo_hud.js`, `mmo_realism.js`)
- **Camera.** The camera follows with a critically damped spring, so it neither lags nor overshoots.
  - It checks for collisions along the hero-to-camera line against the terrain and world obstacles (rocks, boulders, trunks, town props). It pulls in quickly when blocked, eases back out, and never comes closer than 20% of its normal distance.
  - The field of view widens by about 5.5° while sprinting.
- **Sprint and stamina.** After about 1 s of continuous movement the hero sprints automatically: 35% faster, with the `Sprint_Loop` animation. Sprinting drains stamina; dodges, vaults, leaps and skills spend some but are never blocked. Stamina regenerates after a short pause.
  - A curved gold SVG stamina ring floats beside the hero. It fades in while sprinting or acting and fades out when full; it turns orange when low and red when empty.
- **HUD.** Panels are translucent dark glass with a thin gold hairline, diamond studs and diamond button bullets. Headings use Cinzel, and the bars are slimmer and glossy. The restyle changes colour, border and type only; positioning is untouched.
- **Region banner.** An animated title card appears on zone entry: tracked-in Cinzel title, gold rules and gems, and a subtitle. It reads "Region Discovered" the first time and "Entering" afterwards.
- **Environment.**
  - The ground gets sunlit micro-relief, pebbles on dirt and roads, brush strokes in grass, and cavity darkening. These are baked into the ground colour so the cel shading stays clean, and fade by about 90 m.
  - Screen-space sun shafts (24 samples on High, 12 on Medium, off on Low) appear when looking toward the sun.
  - Grass is backlit-translucent, and there are 24k tufts on desktop.
- **Fixes.**
  - Monster nameplates now sit above each model's real animated top. Measured once per model with CPU skinning, this fixes rats and flyers whose nameplates sat inside or below their bodies.
  - The Ranger fires real arrows (wood, steel, red fletching, a thin wind streak) instead of green plasma balls.
  - Character shadows keep about 40% of the sunlight, tinted violet, plus an albedo fill, so dark outfits and backlit heroes stay readable.

### 🪨 Chiseled Rocks, Spline Trees & Lush Meadows (`mmo_rocks.js`, `mmo_foliage.js`)
- **Rocks, boulders, cliffs and lava rocks.**
  - **Geometry:** each starts as an icosphere (detail 3 for 320 triangles, detail 4 for 500). It is displaced with seeded ridged multifractal noise (1 − |noise|), carved by random flattening planes into sharp facets, and given gentle strata terraces and a flat seated base.
  - **Normals:** crease-angle normals (32°) keep flat faces crisp and curves smooth, and a per-vertex convex-edge attribute drives edge wear.
  - **Shader:** a toon shader with a soft ramp adds triplanar grain and strata bands, moss on up-facing faces (normal.y > ~0.7, less in sandy or red zones), lighter edge wear along ridges and contact darkening at the base.
  - **Collision:** each shape is rescaled to the old prop's footprint, so the collision circles are unchanged.
- **Broadleaf trees** (pines, snow pines and dead trees are unchanged).
  - **Trunk and branches:** a tapered CatmullRom spline tube with flared roots and bark grooves, plus 4–5 spline branches.
  - **Canopy:** layered outward-facing leaf cards with a procedural seven-leaf silhouette cut out at alphaTest 0.5, around a small core per cluster.
  - **Shading:** normals point out from the canopy centre on both sides, so there are no dark backfaces. The vertical teal-to-emerald-to-lime gradient and wind are kept.
  - **Shadows:** a matching depth material gives leaf-shaped shadows.
  - **Size:** about 720–840 triangles per tree. The root flare stays inside the trunk collision radius.
- **Grass.**
  - **Clumps:** each clump has 6 tapered, curved blades with 3 segments each, plus an optional tiny wildflower: 34 triangles.
  - **Density:** 40k clumps sit in a deterministic world grid wrapped around the hero within 55 m, fading out between 45 and 55 m. The same rules apply: slope, water, roads and town are kept clear. Quality presets scale the count (35%, 65%, 100%).
  - **Colour:** noise patches vary height, lushness and colour (emerald base, lime tips, dry golden-green patches).
  - **Movement:** wind comes as layered gust bands with a sheen on the tips. Blades part around the hero's feet. Normals are bent upward to blend with the terrain.
  - **Shadows:** grass casts no shadows, but receives the sun's shadow map through a light-enabled shader.
- **Performance.** All of this stays in the same instanced meshes, so draw calls are unchanged. Frames take about 3.3 ms median (95th percentile up to 6 ms) in meadows and forests on High.

### 🍄 Full Stylized Prop Set (`mmo_props.js`)
Every environment prop now uses the same crisp, stylized pipeline as the rocks and broadleaf trees. Each type is still one instanced mesh, culled per chunk, and its footprint matches the old collision radius.

| Prop | New look |
|---|---|
| Pines and snow pines | Tapered spline trunk with root flare and 5 drooping tiers of alpha-cut, serrated needle-spray cards around small cores. Leaf-shaped shadows; snow settles in bands on the upper part of each tier. |
| Dead trees | Gnarled spline trunk with forking spline branches and twisted grey bark. |
| Mushrooms | Bulbous curved stem, lathe-turned dome cap with a curled rim, procedural spots that glow softly at night, cream radial gills, plus two baby mushrooms. |
| Cacti | Ribbed saguaro column with two curved arms and spines. |
| Crystals and ice spikes | Clusters of hard-faceted hexagonal prisms whose inner glow rises toward the tips. |
| Pillars and graves | Fluted, broken ruin column on a chipped plinth; bevelled arched headstone with a chiseled burial mound. Both use the rock shader (grain, moss, edge wear). |
| Bones and pylons | Curved ivory ribcage; tapered obelisk with glowing rune bands and a floating crystal. |
| Mesas | Flat-topped, chiseled sandstone plateaus with strata. |

- **Lakes:** only rocks may stand in lakes now (shared world gen, identical for every client).
- **Shader cache keys:** custom materials have unique program cache keys. The see-through occluder wraps every hook in identical source, which previously made three.js share one compiled shader across different materials.

### 🗣️ Hero Voices (`scripts/build_audio.py`, `mmo_audio.js`)
- **Voices:** each class has a blended Kokoro voice, two style vectors mixed into one distinct timbre:

| Class | Blend |
|---|---|
| Vanguard | michael + onyx |
| Ranger | bella + heart |
| Arcanist | emma + isabella |
| Berserker | fenrir + onyx, pitched down |

- **Vocal chain:** rumble cut, mud cut, presence lift, compression, short room and loudness normalisation.
- **Lines:** about 23 lines per class (92 total) plus 8 grunts per class. That covers spawn, ultimate, 4 skill calls, level-up, low HP and revive, plus new kill, boss-engage, new-region and quest-complete moments. Every request picks a random take, never the same one twice in a row.
- **Rebuild only hero audio:**

```
python scripts/build_audio.py voice --redo=hero_,grunt_
```

### ⚔️ Souls-like Action Combat (`mmo_combat.js`)

| Input | Action |
|---|---|
| `Space` (or 💨 on touch) | **Dodge roll** in the movement direction, or a short backstep when standing still. |
| Hold `RMB` / `G` (or 🛡️ on touch) | **Block.** Pressing it just before a hit lands is a **Perfect Parry**. A right-drag still orbits the camera and drops the guard. |
| `Alt` | Jump |
| `2` / `K` | Heavy skill (moved off the right mouse button) |

- **Dodge roll:**
  - a 0.55 s, 5.6 m eased roll; with no movement input you roll the way the hero faces;
  - the whole 1.46 s Roll clip (dive, tumble, stand-up) is time-scaled into the dodge, and idle or run clips can't cut it off; attacks may cancel the last 20%;
  - 0.25 s of i-frames, honoured by melee, projectiles and boss AoEs;
  - three class-coloured afterimages;
  - costs 20 stamina and is refused below 10.
- **Input buffer:** attacks and dodges pressed up to 0.3 s early (mid-roll, mid-swing, guard-broken or at the end of a cooldown) are queued and fire on the first frame the hero can act.
- **Block:**
  - the guard pose (`Sword_Block`) replaces every idle and locomotion clip while held, including class idles like `Sword_Idle`;
  - takes 25% damage and costs 10–38 stamina by hit size; stamina doesn't regenerate and you move at 45% speed while guarding;
  - if a hit needs more stamina than you have, your guard breaks: a 0.9 s stun, 60% damage and stamina emptied.
- **Perfect Parry:** a block pressed ≤ 0.18 s before impact.
  - The hit deals no damage.
  - Effects: a golden spark burst, a double metallic shockwave ring, a **50 ms hit-stop**, a sharp shake and a metallic clang.
  - The attacker takes 45–52 posture damage, and you get 12 stamina back.
  - Arrows are reflected at their shooter for 1.6× damage.
  - The window stays open, so a pack's simultaneous strikes are all deflected. Spamming the button doesn't work because of a 0.32 s lockout between parry windows.
  - Boss parries: only weapon moves (swipe, cleave, charge, slam) can be parried or blocked; spells and shockwaves must be dodged.
- **Posture:**
  - every enemy has a golden posture bar under its HP bar, and bosses show one under the boss HP bar;
  - maximum: 70 normal, 120 elite, 220 boss;
  - fills from hits (+5, heavy +12, ×0.6 on bosses), blocks and parries, and drains after 2.5 s without pressure.
- **Stagger:** when posture is full, the enemy is stunned for **3 s** with a flashing bar and dizzy stars. The next hit is a **CRITICAL RIPOSTE**: ×3 damage (×2.5 on bosses), forced crit, a big hit-stop and a shockwave.
- **Telegraphs:**
  - every enemy attack has a wind-up: the attack clip is slowed and the body squats into a coil, then snaps through the strike with a stretch;
  - **0.25 s before the hitbox is live**, a golden star glint flashes on the enemy, together with a 0.14 s emissive flash and a positional chime. That is your parry cue;
  - boss abilities get the same glint against their telegraph timers.
- **Multiplayer:**
  - Block, parry and dodge resolve on the defending client, with no added latency; each client already resolves enemy hits against itself.
  - Clients batch posture gains to the host (`mob_posture`, 4/s, sent immediately when a bar fills).
  - The host alone decides staggers and broadcasts them (`mob_stagger`), and every client applies them.
  - Riposte damage goes through the normal `mob_hit` event.
- **Timing:** all combat timers run on a game-time clock, so hit-stop and frame hitches never shift the parry window.

### 💥 Procedural Skill VFX & Camera Juice (`mmo_skillvfx.js`)
Every effect is a pooled mesh with a custom additive GLSL shader. No texture files are used. Each effect sits on the terrain by sampling the same heightmap the ground uses.

| Layer | How it's drawn |
|---|---|
| **Core flash** | A camera-facing quad with a white-hot core, a coloured halo and 6–8 star rays. |
| **Sparks** | One instanced draw of up to 2,200 particles (900 on phones or Low quality). Physics run in the vertex shader (exponential drag plus gravity), and each spark is stretched along its screen-space velocity into a streak. |
| **Slash arc** | A crescent strip that sweeps head to tail, with a thickness profile, scrolling energy noise and a thin hot outer edge. It can be tilted for diagonal cuts. |
| **Rune ring** | A ground sigil drawn in polar space: concentric rings, a rotating band of procedural glyphs and a counter-rotating hexagram. It grows outward, then fades. |
| **Shockwave wall** | An expanding open cylinder with a Fresnel edge and noise flicker. When aligned to the cast direction it becomes a directional "sonic boom" ring for projectile bursts. |
| **Energy pillars** | Open cylinders that rise with upward-scrolling streaks, in a staggered ring around the impact. |
| **Ribbon trails** | An energy sheet that follows the hero through leaps and vaults, or lies along the path of instant dashes and blinks. |
| **VFX lights** | 4 pooled lights evaluated only in the ground and grass shaders, so skills tint the meadow around them (strongest at night). The scene still has no `THREE.PointLight`, so other materials pay nothing. |

**Three archetypes, coloured by class and skill element:**

| Archetype | Layers | Skills |
|---|---|---|
| Elemental dash-slash | Ribbon, sparks along the path, a crossed pair of arcs at the end, flash, small shockwave and light. Ranger's vault is an evade variant: a rune and flash at the take-off point. | Vanguard Shield Dash, Arcanist blink, Berserker leap, Ranger vault |
| AoE ground slam | Flash, rune ring, double shockwave, 4–10 rising pillars plus a central column, an upward spark fountain plus a ground-skimming spray, and a big light | Vanguard heavy, Berserker whirlwind (with spinning arcs per tick) and leap landing, every class skill 4 that hits an area, and ultimates (×2.1) |
| Charged projectile burst | Muzzle flash, two directional boom rings, a cone of sparks, lingering embers and a light. Targeted casts add a rune ring and light at the target. | Ranger dagger fan and arrow rain (each volley wave also lands with pillars), Arcanist anima orb |

Remote peers' and AI allies' skills play the same effects. Camera juice applies only to your own casts.

**Combat feel:**
- **Camera kick:** a damped spring (underdamped, so it overshoots once) pushes the camera away from the impact and down. The offset is layered on top of the camera rig, so it never drifts.
- **FOV punch:** a spring-driven widening on heavy casts: about 3–7° on skill and ultimate casts, plus a smaller one when dash-slashes land. It is layered on the sprint FOV.
- **Hit-stop:** heavy skill impacts freeze for 70 ms, once per cast. Ordinary heavy and crit hits keep the throttled 40 ms freeze.
- **Enemy rim flash:** a per-material `uHitRim` uniform is chained onto the mob's anime shader, giving a 0.1 s Fresnel rim plus a slight body tint. It is white for plain hits, the element colour for elemental hits and the reaction colour for reactions.
- **Damage numbers:** the pooled, colour-coded, crit-marked screen-space numbers from `mmo_combatfx.js` now stack into lanes when several land on the same target at once, and heavy-skill hits read 20% bigger.

**Cost:** at most 44 small draw calls; idle effects are hidden (only the single spark draw always runs). No measurable CPU change when skills fire every 20 frames. One shader program per effect type.

### ✦ Talent Constellations (`mmo_talents.js`)
Press **T** (or click **✦ Talents** next to Inventory) to open a full-screen glass constellation. You earn **1 talent point per hero level** (cap 50; the tree holds 43 ranks). Talents are stored **per class**. **↺ Reset** refunds every point for free.

| Constellation | Passive nodes | Keystones (need 5 points in the branch) |
|---|---|---|
| 🛡️ **Parry Mastery** | Steady Guard (block stamina −12%/rank), Keen Timing (parry window +30 ms/rank), Iron Posture (posture damage +15%/rank), Bulwark (blocked damage −20%/rank), Executioner (riposte damage +25%/rank) | **Retribution Wave:** a Perfect Parry unleashes an elemental shockwave (5.5 m, 150% weapon damage). **Counter Stance:** a Perfect Parry resets your Heavy Skill and gives it +30% damage for 3 s. |
| 🔮 **Elemental Arts** | Sharpened Focus (crit rate +3%/rank), Ruinous Edge (crit damage +15%/rank), Attunement (skill damage +8%/rank), Weapon Mastery (basic attack damage +7%/rank), Swift Incantation (cooldowns −5%/rank) | **Chain Arcana:** critical skill hits arc lightning to 2 more enemies for 35% damage. **Elemental Resonance:** every 3rd skill cast releases a 6 m nova. |
| 💨 **Agility & Stamina** | Second Wind (stamina regen +15%/rank), Light Feet (roll cost −15%/rank), Fleet (move speed +4%/rank), Ghost Step (i-frames +40 ms/rank), Momentum (+12%/rank damage for 1.5 s after a dodge) | **Mirage Step:** dodging leaves a clone that detonates after 0.6 s (3.5 m, 120% damage). **Perfect Evasion:** dodging *through* an attack refunds 20 stamina, and your next hit within 3 s crits for +30%. |

- **Data:** branches and nodes are plain config objects (`window.CR_TALENTS`). Each node has an id, max rank, a `mods` map of per-rank stat changes, prerequisites, a points gate for keystones, and its position in the constellation. Adding a node means adding one entry.
- **Combat hooks:**
  - `mmo_combat.js` reads `tv(key)`: parry window, block cost and damage, posture, riposte, i-frames and roll cost.
  - `mmo_hud.js` uses it for stamina regen.
  - This module wraps crit rate and damage (it pre-rolls the crit so bonus crit damage is exact), skill and basic damage, cooldowns, move speed, `perfectParry` and `bossHit`.
  - It adds `onRollStart`, plus `onPerfectEvade`, which both mob-strike paths in `index.html` now call when a strike lands inside your i-frames.
- **Saving and sync:**
  - `player.talents` (`{ nodeId: rank }`) is saved to localStorage per hero token and class, and mirrored into `mmoState.talents`.
  - Your keystones go out in the co-op player-state payload.
  - It is also synced to Supabase after unlocks and on hero saves. The sync is skipped silently until the column exists:

```sql
alter table arpg_heroes add column if not exists talents jsonb default '{}'::jsonb;
```

- **UI:**
  - Dark translucent glass panels sit over a generated starfield. Owned paths glow gold, paths you can buy pulse as dashed cyan lines, and keystones are larger rotated-frame nodes.
  - Tooltips show the rank, current and next effect, and any missing requirement.
  - Unlocking a node plays a radial burst (flash, double ring, 14 light rays), draws the connecting line in, and pulses the point counter.
  - On phones the constellations become swipeable cards: tap a node to inspect it, tap again to buy.

### 🖼️ AAA HUD Design System (`mmo_ui.js`)
- **Tokens:**
  - text is warm ivory `#F5F2EB`;
  - champagne gold `#D4AF37` is used only for 1px hairlines (`rgba(212,175,55,.35)`) and diamond accents;
  - obsidian glass `rgba(14,17,23,.72)` + `blur(12px)` is used **only** for modal windows (inventory, talents, settings, controls, quests).
- **Type:** Cinzel for titles (regions, bosses, modal headers) and Plus Jakarta Sans for numbers, labels and tooltips.
- **No boxes over the viewport.** HUD glyphs and numbers float on the 3D scene with soft text-shadows. Skill emoji are rendered as uniform white glyphs.
- **Desktop layout:**
  - **Top-left:** circular minimap with gold compass ticks (N/E/S/W). The circular avatar sits on its edge with an HP ring and a gold level badge. Name, class and currencies sit beside it.
  - **Top-right:** an icon-only quick menu (Talents, Inventory, Map, Audio, Settings) with hover scale, glow and labels. A diamond marks unspent talent points. A one-line status (room, heroes, FPS) sits underneath.
  - **Top-centre:** a hairline zone label. The boss bar fades in when you engage a boss: a wide thin HP line under its Cinzel title, with the posture/stagger bar underneath.
  - **Bottom-centre:** a slim 10-segment HP bar with a damage catch-up trail, plus Aether and Synergy hairlines. Circular skills sit on either side: `1 2 3 4 · R SPACE RMB C`. Each has a keycap badge, a conic cooldown sweep and a gold SVG progress ring, and flashes when ready. The ultimate's ring fills with Synergy.
  - **Settings (gear icon):** a glass modal that hosts the original network panel. It has Rooms, Invite, AI Squad, Forge, Hall of Legends, Switch Class, Story, Graphics, Audio, Controls and **Replay Tutorial**.
- **Micro-interactions:**
  - every modal opens and closes with a 180 ms scale/fade;
  - **Escape** or clicking the backdrop closes it (except the start screen);
  - empty HUD wrappers use `pointer-events: none`, so camera drags and combat clicks reach the game (the chat log only takes clicks while you're typing).
- **Phones:** the touch layout from `mmo_mobile.js` is kept and restyled with the same tokens. Skill buttons are round with white glyphs.

### 🎓 In-Play Tutorial (`mmo_tutorial.js`)
A glass objective pill under the minimap teaches the game during play. It has animated keycaps and no pauses:

| Step | Prompt | Completes when |
|---|---|---|
| 1 | `W A S D` move · `RMB` drag to look | you have walked 10 m |
| 2 | Hold `W` to break into a sprint (the stamina arc pulses gold) | you have sprinted for 1 s |
| 3 | `SPACE` dodge roll | you roll |
| 4 | `RMB` right as it glints | you land a Perfect Parry on the **Training Sentinel**: a local practice dummy that walks into range, winds up, glints 0.25 s before striking, and coaches you when you are early or late |
| 5 | Cast `1` / `2`, then open `T` Talents | both are done |

- **Progress** is saved in `localStorage` (`cr_tutorial_v1_<hero>`) and mirrored into `mmoState.tutorial`, so reloads resume at the same step. Existing heroes at level 5+ skip it automatically.
- **Skip ✕** is in the pill. **Replay Tutorial** is in Settings.
- **[F1] / [H]** opens the Controls sheet at any time. `H` no longer drinks an Elixir; use **C**.

### 📜 Town Quest Review
- **Zone quest chains** (Warden Elric and the 7 other givers): audited against the seeded world. Every zone has its giver, both explore sites, both named elites, its boss, and at least one camp for every kill and collect target, so all 13 quests per zone can be completed. Kill credit needs you within 75 m (personal loot range).
- **Kaelen's bounty** is now the **Forge Bounty: Slay 5 Worthy Foes**.
  - Any monster of level *(your level − 3)* or higher counts, anywhere in the realm.
  - The reward scales with your level: 60 + 14 × level gold, and 3 + level ÷ 6 shards.
  - Before this, it was labelled "Catacomb monsters" but counted any kill, and paid a flat 180 gold.
- **Aldous's boss quest** now completes only when **Malakor** (the Citadel's final boss) dies. Before, any boss counted, even the level-1 Mycelord Fungaron. The card shows where Malakor is, his level and the recommended level.
- **Both town quests are saved** with your hero (`mmoState.town`), so accepted or finished quests survive a reload. Before, they reset every session.
- **Story Chapter I ("Outskirts Cleared")** now completes after your first 3 kills in the open world. It used to wait for legacy rift-wave mob ids that no longer exist, so it could never finish.
- **The town portal's prompt** now reads *Fast Travel*. It already opened the world map; the old "Summon Next Rift Wave" text was out of date.

### 💎 Loot Loop, Social Presence & Live Title (`mmo_social.js`)
- **Loot orbs:**
  - every drop (mobs, elites, bosses, chests) bursts out as a glowing orb that arcs, bounces up to 3 times, settles with an idle bob, and raises an additive light pillar coloured and sized by rarity (Common 1.2 m … Legendary 6.2 m, Mythic 7.5 m);
  - within **4 m** it magnetises into your chest with a chime pitched by rarity (Epic and above add the fanfare);
  - pickups land in a slim **side-screen loot feed** on the right, which replaces the centred toast stack;
  - if your bag is full the orb pops back out and waits, so the item is never lost.
- **Remote heroes are drawn from a snapshot buffer:**
  - packets carry a sender timestamp, and each peer gets a clock-offset estimate;
  - rendering runs **110 ms** behind, with cubic Hermite interpolation using the sent velocities, shortest-arc yaw smoothing and up to 250 ms of extrapolation;
  - in a jittery 95 ms / 60–100 ms latency test, frame-to-frame motion variation fell from **14.7% → 2.6%**;
  - remote dodge rolls play at the local roll speed, and remote Perfect Parries spark (parry counter in the state payload).
- **Chat bubbles** are translucent obsidian pills (gold edge for you, ice-blue for others) that pop in, bob, then drift up and fade.
- **Emote wheel — hold [T], aim, release** (or click; 😊 in the phone quick column):
  - **Wave:** a procedural arm pose on the skeleton;
  - **Cheer:** both arms up, hops and confetti;
  - **Sit:** `LayToIdle` reversed into a seated hold;
  - moving, attacking, blocking or rolling cancels an emote, and emotes sync to the room through the player-state payload.
- **Key changes:** **T** = emotes, **K** = Talents (moved from T), and the heavy skill is on **2** only.
- **Live title screen:**
  - before you spawn, the camera glides around the real world with slight mouse parallax, behind a minimalist "CHRONO-RIFT / Click to Enter World" title;
  - click, **Enter** or **Space** reveals the class picker;
  - meanwhile `renderer.compile()` pre-warms every combat effect. Sparks, rings, slash arcs, all flipbooks, the skill VFX pools, loot pillars and projectiles are spawned under the world and compiled, so the first cast never hitches.
