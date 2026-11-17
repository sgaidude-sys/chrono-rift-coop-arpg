import bpy
import bmesh
import os
import math

ROOT = r"c:\Users\Desmond\Documents\Co Op ARPG"
OUT_DIR = os.path.join(ROOT, "public", "assets", "models")

for sub in ["", "heroes", "monsters", "weapons", "props"]:
    os.makedirs(os.path.join(OUT_DIR, sub), exist_ok=True)

ALL_TEX_DIRS = [
    os.path.join(ROOT, "Universal Base Characters[Standard]", "Universal Base Characters[Standard]", "Base Characters", "Textures"),
    os.path.join(ROOT, "Universal Base Characters[Standard]", "Universal Base Characters[Standard]", "Base Characters", "Godot - UE"),
    os.path.join(ROOT, "Universal Base Characters[Standard]", "Universal Base Characters[Standard]", "Hairstyles", "Textures"),
    os.path.join(ROOT, "Modular Character Outfits - Fantasy[Standard]", "Modular Character Outfits - Fantasy[Standard]", "Textures", "Base"),
    os.path.join(ROOT, "Modular Character Outfits - Fantasy[Standard]", "Modular Character Outfits - Fantasy[Standard]", "Textures", "Peasant"),
    os.path.join(ROOT, "Modular Character Outfits - Fantasy[Standard]", "Modular Character Outfits - Fantasy[Standard]", "Textures", "Ranger"),
    os.path.join(ROOT, "Modular Character Outfits - Fantasy[Standard]", "Modular Character Outfits - Fantasy[Standard]", "Textures", "Ranger", "Base Chars"),
    os.path.join(ROOT, "Modular Character Outfits - Fantasy[Standard]", "Modular Character Outfits - Fantasy[Standard]", "Exports", "glTF (Godot-Unreal)", "Outfits"),
    os.path.join(ROOT, "Bestiary - Dungeon Monsters Kit[Standard]", "Bestiary - Dungeon Monsters Kit[Standard]", "Textures"),
    os.path.join(ROOT, "Fantasy Props MegaKit[Standard]", "Textures"),
    os.path.join(ROOT, "Fantasy Props MegaKit[Standard]", "Exports", "glTF"),
    os.path.join(ROOT, "Medieval Village MegaKit[Standard]", "Medieval Village MegaKit[Standard]", "Textures"),
    os.path.join(ROOT, "Medieval Village MegaKit[Standard]", "Medieval Village MegaKit[Standard]", "glTF"),
    os.path.join(ROOT, "Modular SciFi MegaKit[Standard]", "Modular SciFi MegaKit[Standard]", "Textures"),
]

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def remove_icospheres():
    for obj in list(bpy.data.objects):
        if obj.name.startswith("Icosphere"):
            bpy.data.objects.remove(obj, do_unlink=True)

def relink_missing_textures(search_dirs=None):
    dirs = list(search_dirs or []) + [d for d in ALL_TEX_DIRS if d not in (search_dirs or [])]
    for img in bpy.data.images:
        if img.packed_file is not None and img.size[0] > 0:
            continue
        abs_p = bpy.path.abspath(img.filepath) if img.filepath else ""
        if img.size[0] == 0 or not abs_p or not os.path.exists(abs_p):
            raw_base = os.path.basename(img.filepath.replace("\\", "/")) if img.filepath else img.name
            stem = img.name.split(".")[0]
            candidates = []
            for c in [raw_base, raw_base.replace("_png.png", ".png"), f"{stem}.png", stem.replace("_png", "") + ".png"]:
                if c and c not in candidates:
                    candidates.append(c)
            for d in dirs:
                found = False
                for cand_name in candidates:
                    cand = os.path.join(d, cand_name)
                    if os.path.exists(cand):
                        img.filepath = cand
                        img.reload()
                        found = True
                        break
                if found:
                    break

def optimize_and_dedup_images(max_dim=512):
    # Remap duplicate images (.001, .002) to canonical image by filepath or base name
    canonical = {}
    remap = {}
    for img in list(bpy.data.images):
        base = img.name.split(".")[0]
        if base in canonical:
            remap[img] = canonical[base]
        else:
            canonical[base] = img

    for mat in bpy.data.materials:
        if mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image in remap:
                    node.image = remap[node.image]

    for dup_img in remap.keys():
        if dup_img.users == 0:
            bpy.data.images.remove(dup_img)

    # Downscale oversized 4K/2K textures to max_dim and pack so glTF AUTO exports the downscaled PNG
    for img in bpy.data.images:
        w0, h0 = img.size[0], img.size[1]
        if w0 > max_dim or h0 > max_dim:
            w = min(w0, max_dim)
            h = min(h0, max_dim)
            img.scale(w, h)
            img.pack()

def create_emissive_mat(name, base_color=(0.1, 0.8, 1.0, 1.0), emit_color=(0.2, 0.9, 1.0, 1.0), emit_strength=4.5, metallic=0.8, roughness=0.2):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = base_color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emit_color
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emit_strength
    return mat

def export_glb(filepath, export_animations=False, max_tex=512):
    relink_missing_textures()
    optimize_and_dedup_images(max_dim=max_tex)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        export_image_format='AUTO',
        export_animations=export_animations,
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT'
    )
    size_kb = os.path.getsize(filepath) / 1024.0
    print(f"[EXPORTED] {os.path.basename(filepath)} ({size_kb:.1f} KB)")

# ==============================================================================
# 1. EXPORT CURATED ARPG SKELETAL ANIMATION PACK (animations_arpg.glb)
# ==============================================================================
print("=== Building animations_arpg.glb ===")
clear_scene()
ual1 = os.path.join(ROOT, "Universal Animation Library[Standard]", "Universal Animation Library[Standard]", "Unreal-Godot", "UAL1_Standard.glb")
ual2 = os.path.join(ROOT, "Universal Animation Library 2[Standard]", "Universal Animation Library 2[Standard]", "Unreal-Godot", "UAL2_Standard.glb")

bpy.ops.import_scene.gltf(filepath=ual1)
bpy.ops.import_scene.gltf(filepath=ual2)

arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
main_arm = arms[0]
main_arm.name = "Armature"

for obj in list(bpy.data.objects):
    if obj != main_arm:
        bpy.data.objects.remove(obj, do_unlink=True)

mesh_data = bpy.data.meshes.new("AnimCarrierMesh")
mesh_data.from_pydata([(0,0,0), (0.001,0,0), (0,0.001,0)], [], [(0,1,2)])
carrier = bpy.data.objects.new("AnimCarrier", mesh_data)
bpy.context.collection.objects.link(carrier)
carrier.parent = main_arm
vg = carrier.vertex_groups.new(name="root")
vg.add([0, 1, 2], 1.0, 'REPLACE')
mod = carrier.modifiers.new(name="Armature", type='ARMATURE')
mod.object = main_arm

wanted_actions = {
    'Idle_Loop', 'Sword_Idle', 'Idle_Shield_Loop', 'Spell_Simple_Idle_Loop',
    'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Roll',
    'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Regular_Combo',
    'Sword_Heavy_Combo', 'Sword_Attack', 'Sword_Dash', 'Sword_Block',
    'Shield_Dash', 'Shield_OneShot', 'Spell_Simple_Enter', 'Spell_Simple_Shoot',
    'OverhandThrow', 'Melee_Hook', 'Hit_Chest', 'Hit_Knockback',
    'Death01', 'LayToIdle', 'Interact', 'Chest_Open', 'Dance_Loop',
    'Zombie_Idle_Loop', 'Zombie_Walk_Fwd_Loop', 'Zombie_Scratch'
}

for act in list(bpy.data.actions):
    base_name = act.name.split(".")[0]
    if act.name not in wanted_actions:
        if base_name in wanted_actions and base_name not in [a.name for a in bpy.data.actions]:
            act.name = base_name
        else:
            bpy.data.actions.remove(act)

if not main_arm.animation_data:
    main_arm.animation_data_create()

for track in list(main_arm.animation_data.nla_tracks):
    main_arm.animation_data.nla_tracks.remove(track)

for act in bpy.data.actions:
    track = main_arm.animation_data.nla_tracks.new()
    track.name = act.name
    strip = track.strips.new(act.name, int(act.frame_range[0]), act)
    strip.name = act.name

export_glb(os.path.join(OUT_DIR, "animations_arpg.glb"), export_animations=True)

# ==============================================================================
# 2. BUILD 4 PLAYABLE HERO CLASSES (WITH BLENDER KITBASHING & PBR ENHANCEMENTS)
# ==============================================================================
outfits_dir = os.path.join(ROOT, "Modular Character Outfits - Fantasy[Standard]", "Modular Character Outfits - Fantasy[Standard]", "Exports", "glTF (Godot-Unreal)")
hair_dir = os.path.join(ROOT, "Universal Base Characters[Standard]", "Universal Base Characters[Standard]", "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)")
base_char_dir = os.path.join(ROOT, "Universal Base Characters[Standard]", "Universal Base Characters[Standard]", "Base Characters", "Godot - UE")

def merge_armatures_to_primary():
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if not arms:
        return None
    primary = bpy.data.objects.get("Armature") or arms[0]
    primary.name = "Armature"
    for extra in [a for a in arms if a != primary]:
        for child in list(extra.children):
            mw = child.matrix_world.copy()
            child.parent = primary
            child.matrix_world = mw
            for mod in child.modifiers:
                if mod.type == 'ARMATURE':
                    mod.object = primary
        bpy.data.objects.remove(extra, do_unlink=True)
    remove_icospheres()
    for child in primary.children:
        if child.type == 'MESH' and child.data:
            child.data.name = child.name
    return primary

def prepare_base_character(is_male=True):
    base_file = "Superhero_Male_FullBody.gltf" if is_male else "Superhero_Female_FullBody.gltf"
    bpy.ops.import_scene.gltf(filepath=os.path.join(base_char_dir, base_file))
    relink_missing_textures()
    body_name = "SuperHero_Male" if is_male else "Superhero_Female"
    body = bpy.data.objects.get(body_name)
    if body and body.type == 'MESH':
        skin_tex_dir = os.path.join(ROOT, "Modular Character Outfits - Fantasy[Standard]", "Modular Character Outfits - Fantasy[Standard]", "Textures", "Base")
        bc_file = "T_Regular_Male_Dark_BaseColor.png" if is_male else "T_Regular_Female_Dark_BaseColor.png"
        nrm_file = "T_Regular_Male_Normal.png" if is_male else "T_Regular_Female_Normal.png"
        rgh_file = "T_Regular_Male_Roughness.png" if is_male else "T_Regular_Female_Roughness.png"
        for mat in body.data.materials:
            if mat and mat.node_tree:
                for node in mat.node_tree.nodes:
                    if node.type == 'TEX_IMAGE' and node.image:
                        iname = node.image.name.lower()
                        if "dark" in iname or "basecolor" in iname:
                            node.image.filepath = os.path.join(skin_tex_dir, bc_file)
                            node.image.name = bc_file.replace(".png", "")
                            node.image.reload()
                        elif "normal" in iname:
                            node.image.filepath = os.path.join(skin_tex_dir, nrm_file)
                            node.image.name = nrm_file.replace(".png", "")
                            node.image.reload()
                        elif "roughness" in iname:
                            node.image.filepath = os.path.join(skin_tex_dir, rgh_file)
                            node.image.name = rgh_file.replace(".png", "")
                            node.image.reload()
        keep_vgs = {body.vertex_groups[vg_name].index for vg_name in ("Head", "neck_01") if vg_name in body.vertex_groups}
        verts_to_delete = [
            v.index for v in body.data.vertices
            if sum(g.weight for g in v.groups if g.group in keep_vgs) <= 0.05
        ]
        bm = bmesh.new()
        bm.from_mesh(body.data)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.verts[i] for i in verts_to_delete], context='VERTS')
        bm.to_mesh(body.data)
        bm.free()
        body.data.update()

# 2A. Vanguard Knight
print("=== Building hero_vanguard.glb ===")
clear_scene()
prepare_base_character(is_male=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Outfits", "Male_Ranger.gltf"))
bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_Beard.gltf"))
arm = merge_armatures_to_primary()
export_glb(os.path.join(OUT_DIR, "heroes", "hero_vanguard.glb"), export_animations=False)

# 2B. Shadow Ranger
print("=== Building hero_ranger.glb ===")
clear_scene()
prepare_base_character(is_male=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Outfits", "Female_Ranger.gltf"))
bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_Buns.gltf"))
arm = merge_armatures_to_primary()
export_glb(os.path.join(OUT_DIR, "heroes", "hero_ranger.glb"), export_animations=False)

# 2C. Reaper Arcanist (Custom Blender Kitbash + Arcane Halo)
print("=== Building hero_arcanist.glb ===")
clear_scene()
prepare_base_character(is_male=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Outfits", "Female_Peasant.gltf"))
bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Modular Parts", "Female_Ranger_Head_Hood.gltf"))
bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Modular Parts", "Female_Ranger_Acc_Pauldrons.gltf"))
bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_Long.gltf"))
arm = merge_armatures_to_primary()

bpy.ops.mesh.primitive_torus_add(major_radius=0.38, minor_radius=0.022, major_segments=32, minor_segments=12, location=(0, -0.22, 1.38), rotation=(math.radians(90), 0, 0))
halo = bpy.context.active_object
halo.name = "Arcanist_Halo"
halo.data.name = "Arcanist_Halo"
halo.data.materials.append(create_emissive_mat("M_Arcane_Halo", (0.4, 0.1, 0.9, 1.0), (0.55, 0.2, 1.0, 1.0), 5.0))
halo.parent = arm
vg = halo.vertex_groups.new(name="spine_03")
vg.add([v.index for v in halo.data.vertices], 1.0, 'REPLACE')
mod = halo.modifiers.new(name="Armature", type='ARMATURE')
mod.object = arm
export_glb(os.path.join(OUT_DIR, "heroes", "hero_arcanist.glb"), export_animations=False)

# 2D. Berserker Warlord (Custom Blender Kitbash)
print("=== Building hero_berserker.glb ===")
clear_scene()
prepare_base_character(is_male=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Outfits", "Male_Peasant.gltf"))
bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Modular Parts", "Male_Ranger_Acc_Pauldron.gltf"))
bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Modular Parts", "Male_Ranger_Feet_Boots.gltf"))
bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_Beard.gltf"))
bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_SimpleParted.gltf"))
arm = merge_armatures_to_primary()
export_glb(os.path.join(OUT_DIR, "heroes", "hero_berserker.glb"), export_animations=False)

# ==============================================================================
# 3. BUILD BESTIARY, ALIENS & CUSTOM BLENDER RAID BOSS
# ==============================================================================
bestiary_dir = os.path.join(ROOT, "Bestiary - Dungeon Monsters Kit[Standard]", "Bestiary - Dungeon Monsters Kit[Standard]")

# 3A. Imp
print("=== Building monster_imp.glb ===")
clear_scene()
bpy.ops.import_scene.gltf(filepath=os.path.join(bestiary_dir, "Exports", "GLB (Godot-Unreal)", "Imp.glb"))
merge_armatures_to_primary()
export_glb(os.path.join(OUT_DIR, "monsters", "monster_imp.glb"), export_animations=False)

# 3B. Frost-Rift Imp
print("=== Building monster_imp_frost.glb ===")
clear_scene()
bpy.ops.import_scene.gltf(filepath=os.path.join(bestiary_dir, "Exports", "GLB (Godot-Unreal)", "Imp.glb"))
arm = merge_armatures_to_primary()
for img in bpy.data.images:
    if "BaseColor" in img.name:
        img.filepath = os.path.join(bestiary_dir, "Textures", "T_Imp_BaseColor_2.png")
        img.reload()
cryo_mat = create_emissive_mat("M_Cryo_Crystal", (0.1, 0.85, 1.0, 1.0), (0.1, 0.9, 1.0, 1.0), 4.0, metallic=0.2, roughness=0.1)
for idx, (ox, oz, rx, ry) in enumerate([(-0.12, 0.95, -0.4, -0.3), (0.12, 0.95, -0.4, 0.3), (0.0, 1.08, -0.5, 0.0)]):
    bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=0.055, radius2=0.0, depth=0.28, location=(ox, -0.14, oz), rotation=(rx, ry, 0))
    spike = bpy.context.active_object
    spike.name = f"CryoSpike_{idx}"
    spike.data.materials.append(cryo_mat)
    spike.parent = arm
    vg = spike.vertex_groups.new(name="spine_02")
    vg.add([v.index for v in spike.data.vertices], 1.0, 'REPLACE')
    mod = spike.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = arm
export_glb(os.path.join(OUT_DIR, "monsters", "monster_imp_frost.glb"), export_animations=False)

# 3C. Puglin
print("=== Building monster_puglin.glb ===")
clear_scene()
bpy.ops.import_scene.gltf(filepath=os.path.join(bestiary_dir, "Exports", "GLB (Godot-Unreal)", "Puglin.glb"))
merge_armatures_to_primary()
export_glb(os.path.join(OUT_DIR, "monsters", "monster_puglin.glb"), export_animations=False)

# 3D. Puglin Warlord Chieftain
print("=== Building monster_puglin_chieftain.glb ===")
clear_scene()
bpy.ops.import_scene.gltf(filepath=os.path.join(bestiary_dir, "Exports", "GLB (Godot-Unreal)", "Puglin.glb"))
arm = merge_armatures_to_primary()
for img in bpy.data.images:
    if "BaseColor" in img.name:
        img.filepath = os.path.join(bestiary_dir, "Textures", "T_Puglin_BaseColor_3.png")
        img.reload()
crown_mat = create_emissive_mat("M_Warlord_Crown", (1.0, 0.78, 0.15, 1.0), (1.0, 0.45, 0.05, 1.0), 2.5, metallic=0.95, roughness=0.18)
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.16, depth=0.12, location=(0, 0.02, 1.48))
crown = bpy.context.active_object
crown.name = "Warlord_Crown"
crown.data.materials.append(crown_mat)
crown.parent = arm
vg = crown.vertex_groups.new(name="Head")
vg.add([v.index for v in crown.data.vertices], 1.0, 'REPLACE')
mod = crown.modifiers.new(name="Armature", type='ARMATURE')
mod.object = arm
export_glb(os.path.join(OUT_DIR, "monsters", "monster_puglin_chieftain.glb"), export_animations=False)

# 3E. Sci-Fi Rift Aliens
scifi_dir = os.path.join(ROOT, "Modular SciFi MegaKit[Standard]", "Modular SciFi MegaKit[Standard]")
for alien_file, out_name, emit_col in [
    ("Alien_Scolitex.gltf", "monster_alien_scolitex.glb", (0.1, 1.0, 0.55, 1.0)),
    ("Alien_Oculichrysalis.gltf", "monster_alien_oculichrysalis.glb", (1.0, 0.15, 0.35, 1.0)),
    ("Alien_Cyclop.gltf", "monster_alien_cyclop.glb", (0.15, 0.75, 1.0, 1.0)),
]:
    print(f"=== Building {out_name} ===")
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(scifi_dir, "glTF", "Aliens", alien_file))
    remove_icospheres()
    for mat in bpy.data.materials:
        if mat.use_nodes:
            bsdf = mat.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                if "Eye" in mat.name or "Light" in mat.name:
                    if "Emission Color" in bsdf.inputs:
                        bsdf.inputs["Emission Color"].default_value = emit_col
                    if "Emission Strength" in bsdf.inputs:
                        bsdf.inputs["Emission Strength"].default_value = 6.0
                else:
                    bsdf.inputs["Metallic"].default_value = 0.65
                    bsdf.inputs["Roughness"].default_value = 0.28
    export_glb(os.path.join(OUT_DIR, "monsters", out_name), export_animations=True)

# 3F. CUSTOM BLENDER RAID BOSS: Malakor, The Chrono-Fused Archon
print("=== Building Custom Blender Raid Boss: boss_chrono_archon.glb ===")
clear_scene()
bpy.ops.import_scene.gltf(filepath=os.path.join(base_char_dir, "Superhero_Male_FullBody.gltf"))
bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Modular Parts", "Male_Ranger_Acc_Pauldron.gltf"))
bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Modular Parts", "Male_Ranger_Feet_Boots.gltf"))
bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Modular Parts", "Male_Ranger_Arms.gltf"))
arm = merge_armatures_to_primary()

boss_armor_mat = create_emissive_mat("M_Archon_Obsidian", (0.08, 0.05, 0.14, 1.0), (0.45, 0.1, 0.95, 1.0), 1.8, metallic=0.92, roughness=0.2)
boss_gold_mat = create_emissive_mat("M_Archon_Gold", (1.0, 0.78, 0.22, 1.0), (1.0, 0.55, 0.1, 1.0), 3.2, metallic=0.98, roughness=0.15)
boss_core_mat = create_emissive_mat("M_Archon_Core", (0.2, 0.95, 1.0, 1.0), (0.2, 0.95, 1.0, 1.0), 8.0, metallic=0.1, roughness=0.1)

for obj in bpy.data.objects:
    if obj.type == 'MESH' and "Superhero" in obj.name:
        obj.data.materials.clear()
        obj.data.materials.append(boss_armor_mat)

bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.16, radius2=0.24, depth=0.22, location=(0, 0, 1.78))
helm = bpy.context.active_object
helm.name = "Archon_Crown"
helm.data.materials.append(boss_gold_mat)
helm.parent = arm
vg = helm.vertex_groups.new(name="Head")
vg.add([v.index for v in helm.data.vertices], 1.0, 'REPLACE')
mod = helm.modifiers.new(name="Armature", type='ARMATURE')
mod.object = arm

bpy.ops.mesh.primitive_torus_add(major_radius=0.62, minor_radius=0.035, major_segments=36, minor_segments=12, location=(0, -0.28, 1.48), rotation=(math.radians(90), 0, 0))
boss_halo = bpy.context.active_object
boss_halo.name = "Archon_Chrono_Halo"
boss_halo.data.materials.append(boss_gold_mat)

wing_objs = [boss_halo]
for i in range(6):
    ang = math.radians(30 + i * 30)
    wx = math.cos(ang) * 0.85 * (1 if i >= 3 else -1)
    wz = 1.25 + math.sin(ang) * 0.55
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.07, radius2=0.0, depth=0.65, location=(wx, -0.32, wz), rotation=(0, math.radians(45 if i >= 3 else -45), 0))
    w = bpy.context.active_object
    w.name = f"Archon_Wing_{i}"
    w.data.materials.append(boss_core_mat if i % 2 == 0 else boss_gold_mat)
    wing_objs.append(w)

bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.11, location=(0, 0.16, 1.36))
core = bpy.context.active_object
core.name = "Archon_Chest_Core"
core.data.materials.append(boss_core_mat)
wing_objs.append(core)

for wo in wing_objs:
    wo.parent = arm
    vg = wo.vertex_groups.new(name="spine_03")
    vg.add([v.index for v in wo.data.vertices], 1.0, 'REPLACE')
    mod = wo.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = arm

export_glb(os.path.join(OUT_DIR, "monsters", "boss_chrono_archon.glb"), export_animations=False)

# ==============================================================================
# 4. EXPORT 12 WEAPONS & SHIELDS FROM BLEND FILES
# ==============================================================================
weapons_list = [
    "Sword_Golden", "Claymore", "Scythe", "Hammer_Double", "Axe_Double",
    "Bow_Golden", "Bow_Evil", "Spear", "Dagger_2",
    "Shield_Celtic_Golden", "Shield_Heater_2", "Arrow"
]
pbr_presets = {
    "Gold": ((1.0, 0.78, 0.18, 1.0), 0.95, 0.18, (0.3, 0.2, 0.0, 1.0), 0.4),
    "LightGold": ((1.0, 0.86, 0.42, 1.0), 0.9, 0.22, (0.2, 0.15, 0.0, 1.0), 0.3),
    "Steel": ((0.78, 0.82, 0.88, 1.0), 0.92, 0.22, (0,0,0,1), 0.0),
    "LightSteel": ((0.88, 0.91, 0.96, 1.0), 0.95, 0.15, (0.05, 0.1, 0.2, 1.0), 0.2),
    "DarkSteel": ((0.22, 0.25, 0.30, 1.0), 0.88, 0.32, (0,0,0,1), 0.0),
    "Wood": ((0.38, 0.22, 0.10, 1.0), 0.05, 0.75, (0,0,0,1), 0.0),
    "DarkWood": ((0.22, 0.12, 0.06, 1.0), 0.05, 0.8, (0,0,0,1), 0.0),
    "LightWood": ((0.52, 0.34, 0.18, 1.0), 0.05, 0.7, (0,0,0,1), 0.0),
    "Red": ((0.85, 0.12, 0.15, 1.0), 0.3, 0.35, (0.8, 0.05, 0.1, 1.0), 1.2),
    "LightRed": ((1.0, 0.25, 0.25, 1.0), 0.3, 0.3, (1.0, 0.15, 0.15, 1.0), 1.8),
    "Green": ((0.12, 0.72, 0.38, 1.0), 0.4, 0.3, (0.05, 0.5, 0.2, 1.0), 0.8),
    "LightBlue": ((0.2, 0.8, 1.0, 1.0), 0.5, 0.2, (0.1, 0.7, 1.0, 1.0), 2.2),
    "Black": ((0.08, 0.08, 0.10, 1.0), 0.6, 0.4, (0,0,0,1), 0.0),
    "DarkBrown": ((0.18, 0.10, 0.05, 1.0), 0.1, 0.75, (0,0,0,1), 0.0),
    "White": ((0.92, 0.94, 0.98, 1.0), 0.1, 0.4, (0.2, 0.2, 0.3, 1.0), 0.3),
}

for wname in weapons_list:
    blend_path = os.path.join(ROOT, "Weapons", "Blends", f"{wname}.blend")
    if os.path.exists(blend_path):
        bpy.ops.wm.open_mainfile(filepath=blend_path)
        for obj in list(bpy.data.objects):
            if obj.type not in {'MESH'}:
                bpy.data.objects.remove(obj, do_unlink=True)
        for mat in bpy.data.materials:
            mat.use_nodes = True
            bsdf = mat.node_tree.nodes.get("Principled BSDF")
            if bsdf and mat.name in pbr_presets:
                bc, met, rgh, emc, ems = pbr_presets[mat.name]
                bsdf.inputs["Base Color"].default_value = bc
                bsdf.inputs["Metallic"].default_value = met
                bsdf.inputs["Roughness"].default_value = rgh
                if "Emission Color" in bsdf.inputs:
                    bsdf.inputs["Emission Color"].default_value = emc
                if "Emission Strength" in bsdf.inputs:
                    bsdf.inputs["Emission Strength"].default_value = ems
        export_glb(os.path.join(OUT_DIR, "weapons", f"{wname}.glb"), export_animations=False)

# ==============================================================================
# 5. EXPORT ENVIRONMENT PROPS & CUSTOM BLENDER CENTERPIECE STRUCTURES
# ==============================================================================
fantasy_gltf_dir = os.path.join(ROOT, "Fantasy Props MegaKit[Standard]", "Exports", "glTF")
village_gltf_dir = os.path.join(ROOT, "Medieval Village MegaKit[Standard]", "Medieval Village MegaKit[Standard]", "glTF")
scifi_tex_dir = os.path.join(scifi_dir, "Textures")

prop_jobs = [
    (os.path.join(fantasy_gltf_dir, "Anvil.gltf"), "prop_anvil.glb", [fantasy_gltf_dir]),
    (os.path.join(fantasy_gltf_dir, "Chest_Wood.gltf"), "prop_chest.glb", [fantasy_gltf_dir]),
    (os.path.join(fantasy_gltf_dir, "Barrel.gltf"), "prop_barrel.glb", [fantasy_gltf_dir]),
    (os.path.join(fantasy_gltf_dir, "Crate_Wooden.gltf"), "prop_crate.glb", [fantasy_gltf_dir]),
    (os.path.join(fantasy_gltf_dir, "Banner_1.gltf"), "prop_banner.glb", [fantasy_gltf_dir]),
    (os.path.join(fantasy_gltf_dir, "Torch_Metal.gltf"), "prop_torch.glb", [fantasy_gltf_dir]),
    (os.path.join(fantasy_gltf_dir, "Cauldron.gltf"), "prop_cauldron.glb", [fantasy_gltf_dir]),
    (os.path.join(fantasy_gltf_dir, "BookStand.gltf"), "prop_bookstand.glb", [fantasy_gltf_dir]),
    (os.path.join(fantasy_gltf_dir, "WeaponStand.gltf"), "prop_weaponstand.glb", [fantasy_gltf_dir]),
    (os.path.join(village_gltf_dir, "Prop_Wagon.gltf"), "prop_wagon.glb", [village_gltf_dir]),
    (os.path.join(village_gltf_dir, "Wall_Arch.gltf"), "prop_wall_arch.glb", [village_gltf_dir]),
    (os.path.join(village_gltf_dir, "Corner_ExteriorWide_Brick.gltf"), "prop_house_corner.glb", [village_gltf_dir]),
    (os.path.join(scifi_dir, "glTF", "Columns", "Column_Astra.gltf"), "prop_column_astra.glb", [scifi_tex_dir]),
    (os.path.join(scifi_dir, "glTF", "Columns", "Column_Pipes.gltf"), "prop_column_pipes.glb", [scifi_tex_dir]),
    (os.path.join(scifi_dir, "glTF", "Props", "Prop_AccessPoint.gltf"), "prop_access_point.glb", [scifi_tex_dir]),
]

for src_path, out_name, tex_dirs in prop_jobs:
    if os.path.exists(src_path):
        clear_scene()
        bpy.ops.import_scene.gltf(filepath=src_path)
        remove_icospheres()
        relink_missing_textures(tex_dirs)
        export_glb(os.path.join(OUT_DIR, "props", out_name), export_animations=False)

# 5B. Custom Blender Centerpiece 1: Astral Co-Op Rift Portal (prop_astral_portal.glb)
print("=== Building Custom Blender Astral Portal: prop_astral_portal.glb ===")
clear_scene()
col_path = os.path.join(scifi_dir, "glTF", "Columns", "Column_Astra.gltf")
bpy.ops.import_scene.gltf(filepath=col_path)
for obj in bpy.context.selected_objects:
    obj.location.x -= 1.85
bpy.ops.import_scene.gltf(filepath=col_path)
for obj in bpy.context.selected_objects:
    obj.location.x += 1.85
relink_missing_textures([scifi_tex_dir])

ped_mat = create_emissive_mat("M_Portal_Obsidian", (0.09, 0.08, 0.15, 1.0), (0.2, 0.05, 0.4, 1.0), 0.6, metallic=0.8, roughness=0.3)
ring_mat = create_emissive_mat("M_Portal_GoldRing", (1.0, 0.78, 0.25, 1.0), (1.0, 0.6, 0.1, 1.0), 3.0, metallic=0.95, roughness=0.15)
vortex_mat = create_emissive_mat("M_Portal_Vortex", (0.15, 0.85, 1.0, 1.0), (0.35, 0.65, 1.0, 1.0), 6.5, metallic=0.1, roughness=0.1)

bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=2.6, depth=0.28, location=(0, 0, 0.14))
bpy.context.active_object.data.materials.append(ped_mat)

bpy.ops.mesh.primitive_torus_add(major_radius=1.65, minor_radius=0.12, major_segments=48, minor_segments=16, location=(0, 0, 2.15), rotation=(math.radians(90), 0, 0))
bpy.context.active_object.data.materials.append(ring_mat)

bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1.52, depth=0.06, location=(0, 0, 2.15), rotation=(math.radians(90), 0, 0))
bpy.context.active_object.data.materials.append(vortex_mat)

export_glb(os.path.join(OUT_DIR, "props", "prop_astral_portal.glb"), export_animations=False)

# 5C. Custom Blender Centerpiece 2: Sanctuary Revival & Blessing Shrine (prop_revive_shrine.glb)
print("=== Building Custom Blender Sanctuary Shrine: prop_revive_shrine.glb ===")
clear_scene()
chalice_path = os.path.join(fantasy_gltf_dir, "Chalice.gltf")
if os.path.exists(chalice_path):
    bpy.ops.import_scene.gltf(filepath=chalice_path)
    for obj in bpy.context.selected_objects:
        obj.location = (0, 0, 1.05)
        obj.scale = (1.8, 1.8, 1.8)
relink_missing_textures([fantasy_gltf_dir])

shrine_stone = create_emissive_mat("M_Shrine_Stone", (0.24, 0.26, 0.32, 1.0), (0.05, 0.25, 0.35, 1.0), 0.4, metallic=0.3, roughness=0.6)
shrine_crystal = create_emissive_mat("M_Shrine_Crystal", (0.2, 1.0, 0.75, 1.0), (0.2, 1.0, 0.75, 1.0), 7.0, metallic=0.2, roughness=0.1)
shrine_gold = create_emissive_mat("M_Shrine_GoldRing", (1.0, 0.78, 0.25, 1.0), (1.0, 0.6, 0.1, 1.0), 3.0, metallic=0.95, roughness=0.15)

bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=1.25, depth=0.25, location=(0, 0, 0.125))
bpy.context.active_object.data.materials.append(shrine_stone)
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.75, depth=0.8, location=(0, 0, 0.65))
bpy.context.active_object.data.materials.append(shrine_stone)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.32, location=(0, 0, 2.15))
crys = bpy.context.active_object
crys.scale = (0.75, 0.75, 1.45)
crys.data.materials.append(shrine_crystal)
bpy.ops.mesh.primitive_torus_add(major_radius=0.58, minor_radius=0.03, major_segments=32, minor_segments=12, location=(0, 0, 2.15), rotation=(math.radians(35), math.radians(20), 0))
bpy.context.active_object.data.materials.append(shrine_gold)

export_glb(os.path.join(OUT_DIR, "props", "prop_revive_shrine.glb"), export_animations=False)
print("=== ALL BLENDER 5.2 ASSET ENHANCEMENTS COMPLETE ===")
