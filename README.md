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
