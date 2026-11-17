import bpy
import bmesh
import os
import sys
import math
import json
import struct
import mathutils
import numpy as np

ROOT = r"c:\Users\Desmond\Documents\Co Op ARPG"
OUT_DIR = os.path.join(ROOT, "public", "assets", "models")

for sub in ["", "heroes", "npcs", "monsters", "weapons", "props"]:
    os.makedirs(os.path.join(OUT_DIR, sub), exist_ok=True)

_ONLY_SECTIONS = None
if "--" in sys.argv:
    for arg in sys.argv[sys.argv.index("--") + 1:]:
        if arg.startswith("--only="):
            _ONLY_SECTIONS = {s.strip().lower() for s in arg.split("=", 1)[1].split(",") if s.strip()}

def should_run(section):
    return _ONLY_SECTIONS is None or section.lower() in _ONLY_SECTIONS

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

    # Downscale oversized 4K/2K textures to max_dim (256 for normal/ORM/roughness) and pack
    for img in bpy.data.images:
        w0, h0 = img.size[0], img.size[1]
        iname = img.name.lower()
        lim = min(max_dim, 256) if any(k in iname for k in ("normal", "_orm", "roughness")) else max_dim
        if w0 > lim or h0 > lim:
            w = min(w0, lim)
            h = min(h0, lim)
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

def strip_glb_channels(glb_path, keep_loc_bones=("pelvis",), keep_scale=False):
    """Strip bone translation (except keep_loc_bones) and scale channels from a GLB so animations never warp target bone lengths."""
    with open(glb_path, "rb") as f:
        magic, version, total_len = struct.unpack("<III", f.read(12))
        if magic != 0x46546C67:
            return
        chunks = []
        while f.tell() < total_len:
            clen, ctype = struct.unpack("<II", f.read(8))
            cdata = f.read(clen)
            chunks.append((ctype, cdata))

    if not chunks or chunks[0][0] != 0x4E4F534A:
        return
    gltf = json.loads(chunks[0][1].decode("utf-8"))
    nodes = gltf.get("nodes", [])
    keep_loc_set = set(keep_loc_bones or ())

    for anim in gltf.get("animations", []):
        kept_channels = []
        for ch in anim.get("channels", []):
            tgt = ch.get("target", {})
            path = tgt.get("path")
            ni = tgt.get("node")
            nname = nodes[ni].get("name", "") if ni is not None and ni < len(nodes) else ""
            if path == "scale" and not keep_scale:
                continue
            if path == "translation" and nname not in keep_loc_set:
                continue
            kept_channels.append(ch)
        if len(kept_channels) != len(anim.get("channels", [])):
            # Prune unused samplers and remap channel sampler indices
            used_samplers = sorted({ch["sampler"] for ch in kept_channels})
            remap = {old_i: new_i for new_i, old_i in enumerate(used_samplers)}
            old_samplers = anim.get("samplers", [])
            anim["samplers"] = [old_samplers[i] for i in used_samplers]
            for ch in kept_channels:
                ch["sampler"] = remap[ch["sampler"]]
            anim["channels"] = kept_channels

    new_json = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    pad = (4 - (len(new_json) % 4)) % 4
    new_json += b" " * pad
    chunks[0] = (0x4E4F534A, new_json)

    body = b"".join(struct.pack("<II", len(d), t) + d for t, d in chunks)
    with open(glb_path, "wb") as f:
        f.write(struct.pack("<III", magic, version, 12 + len(body)))
        f.write(body)

def export_glb(filepath, export_animations=False, max_tex=512, strip_loc_except=("pelvis",)):
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
    if export_animations and strip_loc_except is not None:
        strip_glb_channels(filepath, keep_loc_bones=strip_loc_except, keep_scale=False)
    size_kb = os.path.getsize(filepath) / 1024.0
    print(f"[EXPORTED] {os.path.basename(filepath)} ({size_kb:.1f} KB)")

def topo_bone_names(arm):
    ordered = []
    def visit(b):
        ordered.append(b.name)
        for ch in b.children:
            visit(ch)
    for b in arm.data.bones:
        if b.parent is None:
            visit(b)
    return ordered

def retarget_action_to_armature(src_arm, src_act, dst_arm, new_name, zero_xy_pelvis=True, min_pelvis_z_ratio=0.0):
    """Retarget src_act from src_arm onto dst_arm preserving dst_arm rest orientations, bone lengths, and proportional pelvis motion."""
    f0 = int(round(src_act.frame_range[0]))
    f1 = int(round(src_act.frame_range[1]))
    if not src_arm.animation_data:
        src_arm.animation_data_create()
    src_arm.animation_data.action = src_act

    if not dst_arm.animation_data:
        dst_arm.animation_data_create()
    dst_act = bpy.data.actions.new(name=new_name)
    dst_arm.animation_data.action = dst_act

    src_rest = {b.name: b.matrix_local.to_3x3().copy() for b in src_arm.data.bones}
    dst_rest = {b.name: b.matrix_local.to_3x3().copy() for b in dst_arm.data.bones}
    src_pelvis_rest = src_arm.data.bones["pelvis"].head_local.copy()
    dst_pelvis_rest = dst_arm.data.bones["pelvis"].head_local.copy()
    h_ratio = dst_pelvis_rest.z / max(src_pelvis_rest.z, 0.001)

    order = topo_bone_names(dst_arm)
    for pb in dst_arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)

    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        src_p_head = src_arm.pose.bones["pelvis"].head.copy()
        dp = (src_p_head - src_pelvis_rest) * h_ratio
        if zero_xy_pelvis:
            dp.x = 0.0
            dp.y = 0.0
        target_pelvis_head = dst_pelvis_rest + dp
        if min_pelvis_z_ratio > 0.0:
            target_pelvis_head.z = max(target_pelvis_head.z, dst_pelvis_rest.z * min_pelvis_z_ratio)

        pb_dst_pelvis = dst_arm.pose.bones["pelvis"]
        pb_src_pelvis = src_arm.pose.bones["pelvis"]
        delta_p = pb_src_pelvis.matrix.to_3x3() @ src_rest["pelvis"].inverted()
        rot_p = (delta_p @ dst_rest["pelvis"]).to_4x4()
        rot_p.translation = target_pelvis_head
        pb_dst_pelvis.matrix = rot_p
        bpy.context.view_layer.update()
        pb_dst_pelvis.keyframe_insert(data_path="location", frame=f)
        pb_dst_pelvis.keyframe_insert(data_path="rotation_quaternion", frame=f)

        for bname in order:
            if bname in ("root", "pelvis"):
                continue
            if bname not in src_arm.pose.bones:
                continue
            pb_src = src_arm.pose.bones[bname]
            pb_dst = dst_arm.pose.bones[bname]
            delta = pb_src.matrix.to_3x3() @ src_rest[bname].inverted()
            target_r3 = delta @ dst_rest[bname]
            m4 = target_r3.to_4x4()
            m4.translation = pb_dst.matrix.translation.copy()
            pb_dst.matrix = m4
            bpy.context.view_layer.update()
            pb_dst.keyframe_insert(data_path="rotation_quaternion", frame=f)

    return dst_act

# ==============================================================================
# 1. EXPORT CURATED ARPG SKELETAL ANIMATION PACK (animations_arpg.glb)
# ==============================================================================
ual1 = os.path.join(ROOT, "Universal Animation Library[Standard]", "Universal Animation Library[Standard]", "Unreal-Godot", "UAL1_Standard.glb")
ual2 = os.path.join(ROOT, "Universal Animation Library 2[Standard]", "Universal Animation Library 2[Standard]", "Unreal-Godot", "UAL2_Standard.glb")

if should_run("anims"):
    print("=== Building animations_arpg.glb ===")
    clear_scene()
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
        'Idle_Loop', 'Idle_Talking_Loop', 'Idle_FoldArms_Loop',
        'Sword_Idle', 'Idle_Shield_Loop', 'Spell_Simple_Idle_Loop',
        'Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Shoot',
        'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Roll',
        'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Regular_Combo',
        'Sword_Heavy_Combo', 'Sword_Attack', 'Sword_Dash', 'Sword_Block',
        'Shield_Dash', 'Shield_OneShot', 'Spell_Simple_Enter', 'Spell_Simple_Shoot',
        'OverhandThrow', 'Melee_Hook', 'Hit_Chest', 'Idle_Shield_Break',
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

    # Replace flat-on-floor Hit_Knockback with upright Idle_Shield_Break stagger
    if 'Idle_Shield_Break' in bpy.data.actions:
        bpy.data.actions['Idle_Shield_Break'].name = 'Hit_Knockback'

    # Bake clean in-place pelvis (zero horizontal X/Y drift on locomotion/attacks)
    if not main_arm.animation_data:
        main_arm.animation_data_create()

    pelvis_rest = main_arm.data.bones["pelvis"].head_local.copy()
    keep_xy_actions = {'Death01', 'LayToIdle'}
    cleaned_actions = []
    for act in list(bpy.data.actions):
        if act.name in keep_xy_actions:
            cleaned_actions.append(act)
            continue
        f0 = int(round(act.frame_range[0]))
        f1 = int(round(act.frame_range[1]))
        main_arm.animation_data.action = act
        if hasattr(act, "slots") and len(act.slots) > 0:
            main_arm.animation_data.action_slot = act.slots[0]
        pb_pelvis = main_arm.pose.bones["pelvis"]
        samples = []
        for f in range(f0, f1 + 1):
            bpy.context.scene.frame_set(f)
            m = pb_pelvis.matrix.copy()
            m.translation = (pelvis_rest.x, pelvis_rest.y, m.translation.z)
            samples.append((f, m))
        for f, m in samples:
            bpy.context.scene.frame_set(f)
            pb_pelvis.matrix = m
            bpy.context.view_layer.update()
            pb_pelvis.keyframe_insert(data_path="location", frame=f)
        cleaned_actions.append(act)

    main_arm.animation_data.action = None
    for track in list(main_arm.animation_data.nla_tracks):
        main_arm.animation_data.nla_tracks.remove(track)

    for act in cleaned_actions:
        # Remove extra action slots so glTF exporter never appends "-Armature.001"
        if hasattr(act, "slots") and len(act.slots) > 1:
            for extra_slot in list(act.slots)[1:]:
                act.slots.remove(extra_slot)
        track = main_arm.animation_data.nla_tracks.new()
        track.name = act.name
        strip = track.strips.new(act.name, int(act.frame_range[0]), act)
        strip.name = act.name
        if hasattr(strip, "action_slot") and hasattr(act, "slots") and len(act.slots) > 0:
            strip.action_slot = act.slots[0]

    export_glb(os.path.join(OUT_DIR, "animations_arpg.glb"), export_animations=True, strip_loc_except=("pelvis",))

# ==============================================================================
# 2. HEROES & TOWN NPCS HELPERS (WITH BLENDER KITBASHING & PBR ENHANCEMENTS)
# ==============================================================================
outfits_dir = os.path.join(ROOT, "Modular Character Outfits - Fantasy[Standard]", "Modular Character Outfits - Fantasy[Standard]", "Exports", "glTF (Godot-Unreal)")
hair_dir = os.path.join(ROOT, "Universal Base Characters[Standard]", "Universal Base Characters[Standard]", "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)")
base_char_dir = os.path.join(ROOT, "Universal Base Characters[Standard]", "Universal Base Characters[Standard]", "Base Characters", "Godot - UE")
base_tex_dir = os.path.join(ROOT, "Universal Base Characters[Standard]", "Universal Base Characters[Standard]", "Base Characters", "Textures")
outfit_tex_dir = os.path.join(ROOT, "Modular Character Outfits - Fantasy[Standard]", "Modular Character Outfits - Fantasy[Standard]", "Textures")

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

def prepare_base_character(is_male=True, skin_mode="dark", keep_torso_arms=False):
    base_file = "Superhero_Male_FullBody.gltf" if is_male else "Superhero_Female_FullBody.gltf"
    bpy.ops.import_scene.gltf(filepath=os.path.join(base_char_dir, base_file))
    relink_missing_textures()
    body_name = "SuperHero_Male" if is_male else "Superhero_Female"
    body = bpy.data.objects.get(body_name)
    if body and body.type == 'MESH':
        if skin_mode == "light":
            bc_path = os.path.join(base_tex_dir, "T_Superhero_Male_Ligh.png" if is_male else "T_Superhero_Female_Light_BaseColor.png")
            nrm_path = os.path.join(base_tex_dir, "T_Superhero_Male_Normal.png" if is_male else "T_Superhero_Female_Normal.png")
            rgh_path = os.path.join(base_tex_dir, "T_Superhero_Male_Roughness.png" if is_male else "T_Superhero_Female_Roughness.png")
        else:
            skin_dir = os.path.join(outfit_tex_dir, "Base")
            bc_path = os.path.join(skin_dir, "T_Regular_Male_Dark_BaseColor.png" if is_male else "T_Regular_Female_Dark_BaseColor.png")
            nrm_path = os.path.join(skin_dir, "T_Regular_Male_Normal.png" if is_male else "T_Regular_Female_Normal.png")
            rgh_path = os.path.join(skin_dir, "T_Regular_Male_Roughness.png" if is_male else "T_Regular_Female_Roughness.png")

        for mat in body.data.materials:
            if mat and mat.node_tree:
                for node in mat.node_tree.nodes:
                    if node.type == 'TEX_IMAGE' and node.image:
                        iname = node.image.name.lower()
                        if "dark" in iname or "basecolor" in iname or "ligh" in iname:
                            node.image.filepath = bc_path
                            node.image.name = os.path.splitext(os.path.basename(bc_path))[0]
                            node.image.reload()
                        elif "normal" in iname:
                            node.image.filepath = nrm_path
                            node.image.name = os.path.splitext(os.path.basename(nrm_path))[0]
                            node.image.reload()
                        elif "roughness" in iname:
                            node.image.filepath = rgh_path
                            node.image.name = os.path.splitext(os.path.basename(rgh_path))[0]
                            node.image.reload()

        if keep_torso_arms:
            # Keep Head, neck, torso, arms, hands; delete lower pelvis/legs/feet vertices hidden by pants
            leg_vgs = {body.vertex_groups[g].index for g in ("thigh_l", "calf_l", "foot_l", "ball_l", "thigh_r", "calf_r", "foot_r", "ball_r") if g in body.vertex_groups}
            verts_to_delete = [
                v.index for v in body.data.vertices
                if v.co.z < 0.965 or sum(g.weight for g in v.groups if g.group in leg_vgs) > 0.25
            ]
        else:
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

def swap_outfit_basecolor(mat_substr, tex_path, tint_rgb=None, metallic=None, roughness=None, max_dim=512):
    """Replace BaseColor texture on materials matching mat_substr and optionally tint pixels cleanly for Three.js."""
    src_img = bpy.data.images.load(tex_path, check_existing=False)
    if src_img.size[0] > max_dim or src_img.size[1] > max_dim:
        src_img.scale(min(src_img.size[0], max_dim), min(src_img.size[1], max_dim))
    if tint_rgb is not None:
        arr = np.array(src_img.pixels[:], dtype=np.float32).reshape((-1, 4))
        arr[:, 0] = np.clip(arr[:, 0] * tint_rgb[0], 0.0, 1.0)
        arr[:, 1] = np.clip(arr[:, 1] * tint_rgb[1], 0.0, 1.0)
        arr[:, 2] = np.clip(arr[:, 2] * tint_rgb[2], 0.0, 1.0)
        src_img.pixels.foreach_set(arr.ravel())
        src_img.update()
    src_img.pack()
    for mat in bpy.data.materials:
        if mat_substr.lower() not in mat.name.lower():
            continue
        if mat.node_tree:
            bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bsdf:
                if metallic is not None:
                    for lk in list(bsdf.inputs["Metallic"].links):
                        mat.node_tree.links.remove(lk)
                    bsdf.inputs["Metallic"].default_value = metallic
                if roughness is not None:
                    for lk in list(bsdf.inputs["Roughness"].links):
                        mat.node_tree.links.remove(lk)
                    bsdf.inputs["Roughness"].default_value = roughness
            for node in mat.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image:
                    iname = node.image.name.lower()
                    if "basecolor" in iname or "ranger" in iname and "normal" not in iname and "orm" not in iname or "peasant" in iname and "normal" not in iname and "orm" not in iname:
                        node.image = src_img

def tint_material_tex(mat_substr, rgb_mult=(1.0, 1.0, 1.0), metallic=None, roughness=None, max_dim=512):
    for mat in bpy.data.materials:
        if mat_substr.lower() not in mat.name.lower():
            continue
        if mat.node_tree:
            bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bsdf:
                if metallic is not None:
                    for lk in list(bsdf.inputs["Metallic"].links):
                        mat.node_tree.links.remove(lk)
                    bsdf.inputs["Metallic"].default_value = metallic
                if roughness is not None:
                    for lk in list(bsdf.inputs["Roughness"].links):
                        mat.node_tree.links.remove(lk)
                    bsdf.inputs["Roughness"].default_value = roughness
            for node in mat.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image:
                    iname = node.image.name.lower()
                    if "normal" in iname or "orm" in iname or "roughness" in iname:
                        continue
                    img = node.image
                    if img.size[0] > max_dim or img.size[1] > max_dim:
                        img.scale(min(img.size[0], max_dim), min(img.size[1], max_dim))
                    arr = np.array(img.pixels[:], dtype=np.float32).reshape((-1, 4))
                    arr[:, 0] = np.clip(arr[:, 0] * rgb_mult[0], 0.0, 1.0)
                    arr[:, 1] = np.clip(arr[:, 1] * rgb_mult[1], 0.0, 1.0)
                    arr[:, 2] = np.clip(arr[:, 2] * rgb_mult[2], 0.0, 1.0)
                    img.pixels.foreach_set(arr.ravel())
                    img.update()
                    img.pack()

def create_pbr_mat(name, base_color=(0.8, 0.8, 0.8, 1.0), metallic=0.2, roughness=0.45, emit_color=(0, 0, 0, 1), emit_strength=0.0):
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

def bind_to_bone(obj, arm, bone_name):
    obj.parent = arm
    vg = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
    vg.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')
    mod = obj.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = arm
    if obj.data:
        obj.data.name = obj.name

def remove_objs_by_prefix(prefixes):
    for obj in list(bpy.data.objects):
        if any(obj.name.startswith(p) for p in prefixes):
            bpy.data.objects.remove(obj, do_unlink=True)

def build_cloak_mesh(name, mat, arm):
    """Build a sculpted flowing knight cape with folds, rigged smoothly across spine_03 -> spine_02 -> pelvis."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    cols, rows = 9, 8
    verts = []
    for r in range(rows):
        t = r / (rows - 1)  # 0 = top shoulder, 1 = bottom hem
        w = 0.17 + 0.19 * (t ** 0.85)
        z = 1.52 - 1.24 * t
        y = 0.145 + 0.16 * (t ** 1.15)
        row_v = []
        for c in range(cols):
            u = (c / (cols - 1)) * 2.0 - 1.0  # -1..1
            x = u * w
            # Gentle curved shoulder wrap + vertical cape pleats
            arch_y = -0.04 * (u * u) * (1.0 - 0.5 * t)
            ripple = 0.018 * math.sin(u * math.pi * 3.0) * (0.3 + 0.7 * t)
            v = bm.verts.new((x, y + arch_y + ripple, z))
            row_v.append(v)
        verts.append(row_v)
    for r in range(rows - 1):
        for c in range(cols - 1):
            bm.faces.new((verts[r][c], verts[r][c+1], verts[r+1][c+1], verts[r+1][c]))
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    # Give cape physical thickness so back-face is solid from every camera angle
    sol = obj.modifiers.new(name="Solidify", type='SOLIDIFY')
    sol.thickness = 0.014
    sol.offset = 0.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=sol.name)

    obj.parent = arm
    vg_s3 = obj.vertex_groups.new(name="spine_03")
    vg_s2 = obj.vertex_groups.new(name="spine_02")
    vg_pel = obj.vertex_groups.new(name="pelvis")
    for v in obj.data.vertices:
        if v.co.z >= 1.25:
            vg_s3.add([v.index], 1.0, 'REPLACE')
        elif v.co.z >= 0.90:
            w3 = (v.co.z - 0.90) / 0.35
            vg_s3.add([v.index], w3, 'REPLACE')
            vg_s2.add([v.index], 1.0 - w3, 'REPLACE')
        else:
            w2 = max(0.0, (v.co.z - 0.55) / 0.35)
            if w2 > 0.01:
                vg_s2.add([v.index], w2, 'REPLACE')
            vg_pel.add([v.index], 1.0 - w2, 'REPLACE')
    mod = obj.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = arm
    return obj

if should_run("heroes"):
    # --------------------------------------------------------------------------
    # 2A. Vanguard Knight — Golden Paladin
    # --------------------------------------------------------------------------
    print("=== Building hero_vanguard.glb ===")
    clear_scene()
    prepare_base_character(is_male=True, skin_mode="dark")
    bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Outfits", "Male_Ranger.gltf"))
    bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_Beard.gltf"))
    arm = merge_armatures_to_primary()

    # Golden-steel Paladin material tint on Male_Ranger armor
    swap_outfit_basecolor(
        "MI_Ranger",
        os.path.join(outfit_tex_dir, "Ranger", "T_Ranger_BaseColor.png"),
        tint_rgb=(1.42, 1.12, 0.52),
        metallic=0.58,
        roughness=0.30,
    )
    paladin_gold = create_emissive_mat("M_Paladin_Gold", (1.0, 0.78, 0.22, 1.0), (1.0, 0.65, 0.12, 1.0), 0.7, metallic=0.94, roughness=0.20)
    paladin_crimson = create_pbr_mat("M_Paladin_Crimson", (0.68, 0.08, 0.10, 1.0), metallic=0.12, roughness=0.62)

    # Knight Greathelm Crest & Golden Visor Band (Head)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.118, depth=0.045, location=(0, 0.012, 1.755))
    brow = bpy.context.active_object
    brow.name = "Vanguard_Helm_Crown"
    brow.scale = (0.96, 1.14, 1.0)
    brow.data.materials.append(paladin_gold)
    bind_to_bone(brow, arm, "Head")

    for i in range(6):
        ang = math.radians(-22 + i * 18)
        py = -0.05 + math.sin(ang) * 0.14
        pz = 1.88 + math.cos(ang) * 0.09 - (i * 0.012)
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.036, radius2=0.01, depth=0.14, location=(0, py, pz), rotation=(ang, 0, 0))
        plume = bpy.context.active_object
        plume.name = f"Vanguard_Plume_{i}"
        plume.scale = (0.55, 1.35, 1.0)
        plume.data.materials.append(paladin_crimson if i > 0 else paladin_gold)
        bind_to_bone(plume, arm, "Head")

    # Broad Golden Shoulder Pauldrons (clavicle_l / clavicle_r)
    for side, bname, sname in [(1, "clavicle_l", "L"), (-1, "clavicle_r", "R")]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=8, radius=0.125, location=(0.225 * side, 0.045, 1.49))
        pauld = bpy.context.active_object
        pauld.name = f"Vanguard_Pauldron_{sname}"
        pauld.scale = (1.18, 1.08, 0.85)
        pauld.rotation_euler = (0, math.radians(-18 * side), 0)
        pauld.data.materials.append(paladin_gold)
        bind_to_bone(pauld, arm, bname)

        bpy.ops.mesh.primitive_torus_add(major_radius=0.105, minor_radius=0.018, major_segments=18, minor_segments=8, location=(0.245 * side, 0.045, 1.47), rotation=(0, math.radians(-25 * side), 0))
        rim = bpy.context.active_object
        rim.name = f"Vanguard_PauldronRim_{sname}"
        rim.data.materials.append(paladin_crimson)
        bind_to_bone(rim, arm, bname)

    # Flowing Crimson-Gold Back Cloak
    build_cloak_mesh("Vanguard_Paladin_Cloak", paladin_crimson, arm)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.024, depth=0.34, location=(0, 0.145, 1.525), rotation=(0, math.radians(90), 0))
    clasp = bpy.context.active_object
    clasp.name = "Vanguard_Cloak_Clasp"
    clasp.data.materials.append(paladin_gold)
    bind_to_bone(clasp, arm, "spine_03")

    export_glb(os.path.join(OUT_DIR, "heroes", "hero_vanguard.glb"), export_animations=False)

    # --------------------------------------------------------------------------
    # 2B. Shadow Ranger — Emerald Woodland Tracker
    # --------------------------------------------------------------------------
    print("=== Building hero_ranger.glb ===")
    clear_scene()
    prepare_base_character(is_male=False, skin_mode="dark")
    bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Outfits", "Female_Ranger.gltf"))
    bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_Buns.gltf"))
    remove_objs_by_prefix(["Female_Ranger_Head_Hood"])
    arm = merge_armatures_to_primary()

    # Distinct T_Ranger_3_BaseColor.png with emerald woodland leather enrichment
    swap_outfit_basecolor(
        "MI_Ranger",
        os.path.join(outfit_tex_dir, "Ranger", "T_Ranger_3_BaseColor.png"),
        tint_rgb=(0.86, 1.32, 0.88),
        metallic=0.18,
        roughness=0.58,
    )
    tint_material_tex("MI_Hair", rgb_mult=(0.68, 0.38, 0.22))

    quiver_leather = create_pbr_mat("M_Ranger_QuiverLeather", (0.24, 0.14, 0.07, 1.0), metallic=0.08, roughness=0.68)
    quiver_emerald = create_emissive_mat("M_Ranger_EmeraldTrim", (0.10, 0.72, 0.36, 1.0), (0.12, 0.85, 0.42, 1.0), 1.4, metallic=0.35, roughness=0.32)
    arrow_shaft = create_pbr_mat("M_Ranger_ArrowWood", (0.55, 0.36, 0.18, 1.0), metallic=0.05, roughness=0.65)

    # Diagonal Leather Quiver + 5 Fletched Arrows strapped to spine_03 (+Y back!)
    q_rot = (math.radians(8), math.radians(-28), 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.052, depth=0.44, location=(0.04, 0.185, 1.31), rotation=q_rot)
    quiver = bpy.context.active_object
    quiver.name = "Ranger_Quiver"
    quiver.data.materials.append(quiver_leather)
    bind_to_bone(quiver, arm, "spine_03")

    bpy.ops.mesh.primitive_torus_add(major_radius=0.054, minor_radius=0.011, major_segments=16, minor_segments=8, location=(0.135, 0.16, 1.495), rotation=q_rot)
    q_rim = bpy.context.active_object
    q_rim.name = "Ranger_Quiver_Rim"
    q_rim.data.materials.append(quiver_emerald)
    bind_to_bone(q_rim, arm, "spine_03")

    for i, (ox, oy) in enumerate([(-0.02, -0.015), (0.02, -0.015), (0.0, 0.018), (-0.022, 0.014), (0.022, 0.014)]):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.007, depth=0.22, location=(0.145 + ox, 0.16 + oy, 1.54), rotation=q_rot)
        ash = bpy.context.active_object
        ash.name = f"Ranger_QuiverArrow_{i}"
        ash.data.materials.append(arrow_shaft)
        bind_to_bone(ash, arm, "spine_03")

        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.022, radius2=0.004, depth=0.06, location=(0.18 + ox, 0.148 + oy, 1.615), rotation=q_rot)
        fletch = bpy.context.active_object
        fletch.name = f"Ranger_ArrowFletch_{i}"
        fletch.data.materials.append(quiver_emerald)
        bind_to_bone(fletch, arm, "spine_03")

    export_glb(os.path.join(OUT_DIR, "heroes", "hero_ranger.glb"), export_animations=False)

    # --------------------------------------------------------------------------
    # 2C. Reaper Arcanist — Cosmic Violet Archmage
    # --------------------------------------------------------------------------
    print("=== Building hero_arcanist.glb ===")
    clear_scene()
    prepare_base_character(is_male=False, skin_mode="light")
    bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Outfits", "Female_Peasant.gltf"))
    bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Modular Parts", "Female_Ranger_Acc_Pauldrons.gltf"))
    bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_Long.gltf"))
    arm = merge_armatures_to_primary()

    # T_Peasant_2_BaseColor.png with rich cosmic violet-indigo archmage tint
    swap_outfit_basecolor(
        "MI_Peasant",
        os.path.join(outfit_tex_dir, "Peasant", "T_Peasant_2_BaseColor.png"),
        tint_rgb=(1.05, 0.72, 1.55),
        metallic=0.15,
        roughness=0.52,
    )
    swap_outfit_basecolor(
        "MI_Ranger",
        os.path.join(outfit_tex_dir, "Ranger", "T_Ranger_3_BaseColor.png"),
        tint_rgb=(0.95, 0.65, 1.45),
        metallic=0.65,
        roughness=0.28,
    )

    arc_hat_mat = create_pbr_mat("M_Arcanist_Hat", (0.18, 0.08, 0.34, 1.0), metallic=0.22, roughness=0.42)
    arc_gold_mat = create_emissive_mat("M_Arcanist_AstralGold", (1.0, 0.78, 0.25, 1.0), (0.85, 0.55, 1.0, 1.0), 1.6, metallic=0.92, roughness=0.18)
    arc_halo_mat = create_emissive_mat("M_Arcane_Halo", (0.45, 0.15, 1.0, 1.0), (0.55, 0.22, 1.0, 1.0), 5.0, metallic=0.2, roughness=0.15)
    arc_cyan_mat = create_emissive_mat("M_Arcane_CyanRune", (0.15, 0.90, 1.0, 1.0), (0.20, 0.95, 1.0, 1.0), 5.5, metallic=0.15, roughness=0.12)

    # Pointed Archmage Hat / Astral Crown (Head, sitting cleanly above eyes & Hair_Long)
    hat_tilt = (math.radians(8), 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.225, depth=0.018, location=(0, 0.015, 1.745), rotation=hat_tilt)
    brim = bpy.context.active_object
    brim.name = "Arcanist_Hat_Brim"
    brim.data.materials.append(arc_hat_mat)
    bind_to_bone(brim, arm, "Head")

    bpy.ops.mesh.primitive_cone_add(vertices=18, radius1=0.115, radius2=0.015, depth=0.34, location=(0, 0.035, 1.91), rotation=(math.radians(16), 0, 0))
    spire = bpy.context.active_object
    spire.name = "Arcanist_Hat_Spire"
    spire.data.materials.append(arc_hat_mat)
    bind_to_bone(spire, arm, "Head")

    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.032, radius2=0.003, depth=0.14, location=(0, 0.095, 2.09), rotation=(math.radians(36), 0, 0))
    tip = bpy.context.active_object
    tip.name = "Arcanist_Hat_Tip"
    tip.data.materials.append(arc_hat_mat)
    bind_to_bone(tip, arm, "Head")

    bpy.ops.mesh.primitive_torus_add(major_radius=0.112, minor_radius=0.014, major_segments=22, minor_segments=8, location=(0, 0.018, 1.775), rotation=hat_tilt)
    band = bpy.context.active_object
    band.name = "Arcanist_Crown_Band"
    band.data.materials.append(arc_gold_mat)
    bind_to_bone(band, arm, "Head")

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.024, location=(0, -0.102, 1.785))
    gem = bpy.context.active_object
    gem.name = "Arcanist_Crown_Gem"
    gem.scale = (0.7, 0.5, 1.35)
    gem.data.materials.append(arc_cyan_mat)
    bind_to_bone(gem, arm, "Head")

    # Floating Violet-Cyan Arcane Halo BEHIND back (+Y = +0.24!)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.37, minor_radius=0.020, major_segments=32, minor_segments=10, location=(0, 0.24, 1.40), rotation=(math.radians(90), 0, 0))
    halo = bpy.context.active_object
    halo.name = "Arcanist_Halo"
    halo.data.materials.append(arc_halo_mat)
    bind_to_bone(halo, arm, "spine_03")

    bpy.ops.mesh.primitive_torus_add(major_radius=0.24, minor_radius=0.012, major_segments=24, minor_segments=8, location=(0, 0.24, 1.40), rotation=(math.radians(90), 0, 0))
    inner_halo = bpy.context.active_object
    inner_halo.name = "Arcanist_InnerHalo"
    inner_halo.data.materials.append(arc_cyan_mat)
    bind_to_bone(inner_halo, arm, "spine_03")

    # 2 Glowing Shoulder Rune Orbs (spine_03)
    for side, sname in [(1, "L"), (-1, "R")]:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.044, location=(0.245 * side, 0.01, 1.51))
        orb = bpy.context.active_object
        orb.name = f"Arcanist_RuneOrb_{sname}"
        orb.data.materials.append(arc_cyan_mat)
        bind_to_bone(orb, arm, "spine_03")

        bpy.ops.mesh.primitive_torus_add(major_radius=0.068, minor_radius=0.008, major_segments=18, minor_segments=6, location=(0.245 * side, 0.01, 1.51), rotation=(math.radians(55), math.radians(25 * side), 0))
        oring = bpy.context.active_object
        oring.name = f"Arcanist_OrbRing_{sname}"
        oring.data.materials.append(arc_gold_mat)
        bind_to_bone(oring, arm, "spine_03")

    export_glb(os.path.join(OUT_DIR, "heroes", "hero_arcanist.glb"), export_animations=False)

    # --------------------------------------------------------------------------
    # 2D. Berserker Warlord — Crimson Iron Juggernaut
    # --------------------------------------------------------------------------
    print("=== Building hero_berserker.glb ===")
    clear_scene()
    # Keep bare muscular chest, shoulders, arms & head; delete legs under pants
    prepare_base_character(is_male=True, skin_mode="light", keep_torso_arms=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Modular Parts", "Male_Peasant_Legs.gltf"))
    bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Modular Parts", "Male_Peasant_Feet.gltf"))
    bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Outfits", "Male_Ranger.gltf"))
    for obj in list(bpy.data.objects):
        if obj.name in {"Male_Ranger_Body", "Male_Ranger_Legs", "Male_Ranger_Feet_Boots", "Male_Ranger_Head_Hood", "Male_Ranger_Arms", "Male_Ranger_Acc_Pauldron"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_Beard.gltf"))
    bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_Buzzed.gltf"))
    arm = merge_armatures_to_primary()

    swap_outfit_basecolor(
        "MI_Peasant",
        os.path.join(outfit_tex_dir, "Peasant", "T_Peasant_2_BaseColor.png"),
        tint_rgb=(1.35, 0.65, 0.62),
        metallic=0.18,
        roughness=0.58,
    )
    swap_outfit_basecolor(
        "MI_Ranger",
        os.path.join(outfit_tex_dir, "Ranger", "T_Ranger_3_BaseColor.png"),
        tint_rgb=(1.35, 0.55, 0.50),
        metallic=0.72,
        roughness=0.30,
    )

    bers_iron = create_pbr_mat("M_Berserker_DarkIron", (0.16, 0.16, 0.19, 1.0), metallic=0.88, roughness=0.28)
    bers_crimson = create_emissive_mat("M_Berserker_Crimson", (0.72, 0.08, 0.10, 1.0), (0.95, 0.12, 0.15, 1.0), 0.9, metallic=0.65, roughness=0.26)
    bers_horn = create_pbr_mat("M_Berserker_HornBone", (0.86, 0.80, 0.66, 1.0), metallic=0.08, roughness=0.45)

    # Heavy War-Belt around waist seam (pelvis, Z=0.98)
    bpy.ops.mesh.primitive_cylinder_add(vertices=18, radius=0.175, depth=0.12, location=(0, 0.015, 0.98))
    wbelt = bpy.context.active_object
    wbelt.name = "Berserker_WarBelt"
    wbelt.scale = (1.05, 0.84, 1.0)
    wbelt.data.materials.append(bers_iron)
    bind_to_bone(wbelt, arm, "pelvis")

    bpy.ops.mesh.primitive_cube_add(size=0.09, location=(0, -0.145, 0.98))
    buckle = bpy.context.active_object
    buckle.name = "Berserker_BeltSkull"
    buckle.scale = (1.1, 0.45, 1.1)
    buckle.data.materials.append(bers_crimson)
    bind_to_bone(buckle, arm, "pelvis")

    # Horned Iron War-Helm (Head)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.112, location=(0, 0.014, 1.755))
    hcap = bpy.context.active_object
    hcap.name = "Berserker_WarHelm"
    hcap.scale = (0.96, 1.12, 0.92)
    bpy.context.view_layer.update()
    # Trim lower half of sphere above eyes (Z >= 1.74)
    bm = bmesh.new()
    bm.from_mesh(hcap.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if (hcap.matrix_world @ v.co).z < 1.74], context='VERTS')
    bm.to_mesh(hcap.data)
    bm.free()
    hcap.data.materials.append(bers_iron)
    bind_to_bone(hcap, arm, "Head")

    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.114, depth=0.032, location=(0, 0.014, 1.748))
    hbrow = bpy.context.active_object
    hbrow.name = "Berserker_HelmRim"
    hbrow.scale = (0.98, 1.14, 1.0)
    hbrow.data.materials.append(bers_crimson)
    bind_to_bone(hbrow, arm, "Head")

    for side, sname in [(1, "L"), (-1, "R")]:
        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.036, radius2=0.018, depth=0.11, location=(0.125 * side, 0.01, 1.79), rotation=(0, math.radians(65 * side), 0))
        h1 = bpy.context.active_object
        h1.name = f"Berserker_HornBase_{sname}"
        h1.data.materials.append(bers_horn)
        bind_to_bone(h1, arm, "Head")

        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.020, radius2=0.003, depth=0.15, location=(0.205 * side, 0.02, 1.88), rotation=(0, math.radians(22 * side), 0))
        h2 = bpy.context.active_object
        h2.name = f"Berserker_HornTip_{sname}"
        h2.data.materials.append(bers_horn)
        bind_to_bone(h2, arm, "Head")

    # Spiked Crimson-Iron Pauldrons (clavicle_l / clavicle_r)
    for side, bname, sname in [(1, "clavicle_l", "L"), (-1, "clavicle_r", "R")]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.13, location=(0.23 * side, 0.04, 1.50))
        sp = bpy.context.active_object
        sp.name = f"Berserker_Pauldron_{sname}"
        sp.scale = (1.15, 1.08, 0.85)
        sp.rotation_euler = (0, math.radians(-18 * side), 0)
        sp.data.materials.append(bers_iron)
        bind_to_bone(sp, arm, bname)

        for k, (dy, dz, rx, ry) in enumerate([(-0.04, 0.08, -0.3, -0.5), (0.0, 0.10, 0.0, -0.35), (0.04, 0.08, 0.3, -0.5)]):
            bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.022, radius2=0.002, depth=0.14, location=(0.27 * side, 0.04 + dy, 1.51 + dz), rotation=(rx, ry * side, 0))
            spk = bpy.context.active_object
            spk.name = f"Berserker_Spike_{sname}_{k}"
            spk.data.materials.append(bers_crimson if k == 1 else bers_iron)
            bind_to_bone(spk, arm, bname)

    export_glb(os.path.join(OUT_DIR, "heroes", "hero_berserker.glb"), export_animations=False)

if should_run("npcs"):
    # ==========================================================================
    # 2E. BUILD 3 DISTINCT TOWN NPCS (public/assets/models/npcs/)
    # ==========================================================================
    # NPC 1: Blacksmith Kaelen
    print("=== Building npc_blacksmith.glb ===")
    clear_scene()
    prepare_base_character(is_male=True, skin_mode="dark")
    bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Outfits", "Male_Peasant.gltf"))
    bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_Beard.gltf"))
    bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_Buzzed.gltf"))
    arm = merge_armatures_to_primary()

    apron_mat = create_pbr_mat("M_Smith_LeatherApron", (0.20, 0.10, 0.05, 1.0), metallic=0.08, roughness=0.72)
    brass_mat = create_pbr_mat("M_Smith_Brass", (0.92, 0.68, 0.22, 1.0), metallic=0.88, roughness=0.25)
    steel_mat = create_pbr_mat("M_Smith_Steel", (0.70, 0.74, 0.80, 1.0), metallic=0.92, roughness=0.24)

    # Heavy Leather Forge Apron (bib + skirt)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.125, 1.24))
    bib = bpy.context.active_object
    bib.name = "Blacksmith_Apron_Bib"
    bib.scale = (0.28, 0.035, 0.36)
    bib.data.materials.append(apron_mat)
    bind_to_bone(bib, arm, "spine_02")

    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.17, depth=0.38, location=(0, -0.02, 0.86))
    skirt = bpy.context.active_object
    skirt.name = "Blacksmith_Apron_Skirt"
    skirt.scale = (1.02, 0.86, 1.0)
    skirt.data.materials.append(apron_mat)
    bind_to_bone(skirt, arm, "pelvis")

    bpy.ops.mesh.primitive_cube_add(size=0.07, location=(0, -0.155, 1.04))
    abuckle = bpy.context.active_object
    abuckle.name = "Blacksmith_Belt_Buckle"
    abuckle.scale = (1.3, 0.35, 0.8)
    abuckle.data.materials.append(brass_mat)
    bind_to_bone(abuckle, arm, "pelvis")

    # Forge Hammer strapped at right hip
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.016, depth=0.34, location=(-0.21, -0.02, 0.90), rotation=(math.radians(15), 0, 0))
    h_handle = bpy.context.active_object
    h_handle.name = "Blacksmith_Hammer_Handle"
    h_handle.data.materials.append(apron_mat)
    bind_to_bone(h_handle, arm, "pelvis")

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.21, -0.06, 1.04), rotation=(math.radians(15), 0, 0))
    h_head = bpy.context.active_object
    h_head.name = "Blacksmith_Hammer_Head"
    h_head.scale = (0.065, 0.13, 0.065)
    h_head.data.materials.append(steel_mat)
    bind_to_bone(h_head, arm, "pelvis")

    export_glb(os.path.join(OUT_DIR, "npcs", "npc_blacksmith.glb"), export_animations=False)

    # NPC 2: High Cleric Seraphina
    print("=== Building npc_cleric.glb ===")
    clear_scene()
    prepare_base_character(is_male=False, skin_mode="light")
    bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Outfits", "Female_Peasant.gltf"))
    bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_Long.gltf"))
    arm = merge_armatures_to_primary()

    swap_outfit_basecolor(
        "MI_Peasant",
        os.path.join(outfit_tex_dir, "Peasant", "T_Peasant_2_BaseColor.png"),
        tint_rgb=(1.45, 1.38, 1.22),
        metallic=0.10,
        roughness=0.52,
    )
    cleric_gold = create_emissive_mat("M_Cleric_SunGold", (1.0, 0.82, 0.28, 1.0), (1.0, 0.72, 0.20, 1.0), 1.4, metallic=0.95, roughness=0.18)
    cleric_halo = create_emissive_mat("M_Cleric_SunGem", (1.0, 0.94, 0.55, 1.0), (1.0, 0.90, 0.45, 1.0), 4.0, metallic=0.2, roughness=0.15)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.105, minor_radius=0.011, major_segments=24, minor_segments=8, location=(0, 0.01, 1.72), rotation=(math.radians(8), 0, 0))
    circlet = bpy.context.active_object
    circlet.name = "Cleric_Golden_Circlet"
    circlet.data.materials.append(cleric_gold)
    bind_to_bone(circlet, arm, "Head")

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.022, location=(0, -0.095, 1.73))
    sungem = bpy.context.active_object
    sungem.name = "Cleric_Sun_Gem"
    sungem.scale = (0.8, 0.4, 1.2)
    sungem.data.materials.append(cleric_halo)
    bind_to_bone(sungem, arm, "Head")

    for side, sname in [(1, "L"), (-1, "R")]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.075 * side, -0.115, 1.26), rotation=(math.radians(-6), 0, 0))
        stole = bpy.context.active_object
        stole.name = f"Cleric_Stole_{sname}"
        stole.scale = (0.045, 0.018, 0.34)
        stole.data.materials.append(cleric_gold)
        bind_to_bone(stole, arm, "spine_02")

    export_glb(os.path.join(OUT_DIR, "npcs", "npc_cleric.glb"), export_animations=False)

    # NPC 3: Lorekeeper Aldous
    print("=== Building npc_scholar.glb ===")
    clear_scene()
    prepare_base_character(is_male=True, skin_mode="light")
    bpy.ops.import_scene.gltf(filepath=os.path.join(outfits_dir, "Outfits", "Male_Ranger.gltf"))
    bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_Beard.gltf"))
    bpy.ops.import_scene.gltf(filepath=os.path.join(hair_dir, "Hair_SimpleParted.gltf"))
    remove_objs_by_prefix(["Male_Ranger_Head_Hood"])
    arm = merge_armatures_to_primary()

    swap_outfit_basecolor(
        "MI_Ranger",
        os.path.join(outfit_tex_dir, "Ranger", "T_Ranger_3_BaseColor.png"),
        tint_rgb=(0.95, 1.02, 1.32),
        metallic=0.22,
        roughness=0.55,
    )
    tome_leather = create_pbr_mat("M_Scholar_Tome", (0.36, 0.14, 0.12, 1.0), metallic=0.1, roughness=0.58)
    tome_gold = create_emissive_mat("M_Scholar_Brass", (0.95, 0.78, 0.32, 1.0), (0.35, 0.75, 1.0, 1.0), 0.9, metallic=0.88, roughness=0.22)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.19, 0.01, 0.96), rotation=(0, math.radians(10), 0))
    tome = bpy.context.active_object
    tome.name = "Scholar_Tome"
    tome.scale = (0.055, 0.14, 0.19)
    tome.data.materials.append(tome_leather)
    bind_to_bone(tome, arm, "pelvis")

    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.025, depth=0.26, location=(-0.18, 0.03, 0.98), rotation=(math.radians(28), 0, 0))
    scroll = bpy.context.active_object
    scroll.name = "Scholar_ScrollCase"
    scroll.data.materials.append(tome_gold)
    bind_to_bone(scroll, arm, "pelvis")

    bpy.ops.mesh.primitive_torus_add(major_radius=0.105, minor_radius=0.008, major_segments=22, minor_segments=6, location=(0, 0.012, 1.745), rotation=(math.radians(6), 0, 0))
    scirc = bpy.context.active_object
    scirc.name = "Scholar_Circlet"
    scirc.data.materials.append(tome_gold)
    bind_to_bone(scirc, arm, "Head")

    export_glb(os.path.join(OUT_DIR, "npcs", "npc_scholar.glb"), export_animations=False)

# ==============================================================================
# 3. BUILD BESTIARY, ALIENS & CUSTOM BLENDER RAID BOSS
# ==============================================================================
bestiary_dir = os.path.join(ROOT, "Bestiary - Dungeon Monsters Kit[Standard]", "Bestiary - Dungeon Monsters Kit[Standard]")

MONSTER_CLIP_SPECS = [
    ("Idle_Loop", "Idle_Loop", True),
    ("Jog_Fwd_Loop", "Jog_Fwd_Loop", True),
    ("Zombie_Walk_Fwd_Loop", "Zombie_Walk_Fwd_Loop", True),
    ("Sword_Attack", "Sword_Attack", True),
    ("Sword_Heavy_Combo", "Sword_Heavy_Combo", True),
    ("Spell_Simple_Shoot", "Spell_Simple_Shoot", True),
    ("Hit_Chest", "Hit_Chest", True),
    ("Idle_Shield_Break", "Hit_Knockback", True),
    ("Death01", "Death01", False),
]

def bake_retargeted_monster_clips(dst_arm):
    """Import UAL1/UAL2, retarget the 9 ARPG clips onto dst_arm, and push them as NLA tracks."""
    existing_objs = set(bpy.data.objects)
    existing_acts = set(bpy.data.actions)

    bpy.ops.import_scene.gltf(filepath=ual1)
    ual1_arm = next(o for o in bpy.data.objects if o not in existing_objs and o.type == 'ARMATURE')
    ual1_acts = {a.name.split(".")[0]: a for a in bpy.data.actions if a not in existing_acts}

    mid_objs = set(bpy.data.objects)
    mid_acts = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=ual2)
    ual2_arm = next(o for o in bpy.data.objects if o not in mid_objs and o.type == 'ARMATURE')
    ual2_acts = {a.name.split(".")[0]: a for a in bpy.data.actions if a not in mid_acts}

    retargeted = []
    for src_name, dst_name, zero_xy in MONSTER_CLIP_SPECS:
        if src_name in ual1_acts:
            src_arm, src_act = ual1_arm, ual1_acts[src_name]
        elif src_name in ual2_acts:
            src_arm, src_act = ual2_arm, ual2_acts[src_name]
        else:
            continue
        act = retarget_action_to_armature(src_arm, src_act, dst_arm, f"__ret_{dst_name}", zero_xy_pelvis=zero_xy)
        retargeted.append((dst_name, act))

    # Remove imported UAL objects & unused actions before assigning clean names
    for obj in list(bpy.data.objects):
        if obj not in existing_objs:
            bpy.data.objects.remove(obj, do_unlink=True)
    retargeted_set = {act for _, act in retargeted}
    for act in list(bpy.data.actions):
        if act not in existing_acts and act not in retargeted_set:
            bpy.data.actions.remove(act)

    if not dst_arm.animation_data:
        dst_arm.animation_data_create()
    dst_arm.animation_data.action = None
    for tr in list(dst_arm.animation_data.nla_tracks):
        dst_arm.animation_data.nla_tracks.remove(tr)
    for dst_name, act in retargeted:
        act.name = dst_name
        tr = dst_arm.animation_data.nla_tracks.new()
        tr.name = dst_name
        st = tr.strips.new(dst_name, int(act.frame_range[0]), act)
        st.name = dst_name
        if hasattr(st, "action_slot") and hasattr(act, "slots") and len(act.slots) > 0:
            st.action_slot = act.slots[0]

def build_alien_animations(arm, lift_z):
    """Create Idle_Loop, Jog_Fwd_Loop, Sword_Attack, Hit_Chest, Hit_Knockback, Death01 for Alien_Armature."""
    if not arm.animation_data:
        arm.animation_data_create()
    orig_idle = arm.animation_data.action or (bpy.data.actions[0] if bpy.data.actions else None)

    # Sample base pose at frame 0 of Alien_Idle
    if orig_idle:
        arm.animation_data.action = orig_idle
    bpy.context.scene.frame_set(0)
    base_mats = {pb.name: pb.matrix.copy() for pb in arm.pose.bones}
    order = topo_bone_names(arm)
    spine_bones = [b for b in order if b.startswith("Spine_")]
    claw_big_l = [b for b in order if b.startswith("ClawBig") and b.endswith(".L")]
    claw_big_r = [b for b in order if b.startswith("ClawBig") and b.endswith(".R")]

    def apply_pose_deltas(frame, root_dz=0.0, root_dy=0.0, bone_eulers=None):
        bone_eulers = bone_eulers or {}
        for bname in order:
            pb = arm.pose.bones[bname]
            pb.rotation_mode = 'QUATERNION'
            rx, ry, rz = bone_eulers.get(bname, (0.0, 0.0, 0.0))
            delta_r = mathutils.Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ').to_matrix()
            bm = base_mats[bname]
            m4 = (delta_r @ bm.to_3x3()).to_4x4()
            if bname == "Root":
                m4.translation = bm.translation + mathutils.Vector((0.0, root_dy, root_dz))
            else:
                # Preserve parent-relative bone head offset from current posed parent
                if pb.parent:
                    p_rest = arm.data.bones[pb.parent.name].matrix_local.inverted() @ arm.data.bones[bname].matrix_local
                    m4.translation = (arm.pose.bones[pb.parent.name].matrix @ p_rest).translation
                else:
                    m4.translation = bm.translation
            pb.matrix = m4
            bpy.context.view_layer.update()
            if bname == "Root":
                pb.keyframe_insert(data_path="location", frame=frame)
            pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    created = []
    if orig_idle:
        idle_copy = orig_idle.copy()
        idle_copy.name = "Idle_Loop"
        created.append(idle_copy)

    # 1. Jog_Fwd_Loop (30 frames, cyclic hover-slither)
    walk_act = bpy.data.actions.new("Jog_Fwd_Loop")
    arm.animation_data.action = walk_act
    for f in range(0, 31, 3):
        t = (f / 30.0) * math.tau
        eulers = {"Root": (12.0 + 3.0 * math.sin(t), 0.0, 5.0 * math.sin(t))}
        if "Neck" in base_mats:
            eulers["Neck"] = (-8.0, 0.0, -4.0 * math.sin(t))
        if "Head" in base_mats:
            eulers["Head"] = (-4.0, 0.0, -4.0 * math.sin(t))
        for idx, sb in enumerate(spine_bones):
            phase = t - idx * 0.55
            eulers[sb] = (4.0 * math.cos(phase), 0.0, 11.0 * math.sin(phase))
        for cb in claw_big_l:
            eulers[cb] = (10.0 * math.sin(t), 0.0, 8.0 * math.cos(t))
        for cb in claw_big_r:
            eulers[cb] = (-10.0 * math.sin(t), 0.0, -8.0 * math.cos(t))
        apply_pose_deltas(f, root_dz=0.07 * math.sin(t * 2.0), root_dy=0.0, bone_eulers=eulers)
    created.append(walk_act)

    # 2. Sword_Attack (24 frames, windup -> lunge strike -> recover)
    atk_act = bpy.data.actions.new("Sword_Attack")
    arm.animation_data.action = atk_act
    atk_keys = [
        (0, 0.0, 0.0, 0.0, 0.0),
        (7, 0.06, 0.14, -18.0, -25.0),
        (13, -0.04, -0.22, 26.0, 35.0),
        (18, 0.02, -0.06, 10.0, 12.0),
        (24, 0.0, 0.0, 0.0, 0.0),
    ]
    for f, dz, dy, pitch, claw_p in atk_keys:
        eulers = {"Root": (pitch, 0.0, 0.0)}
        if "Neck" in base_mats:
            eulers["Neck"] = (pitch * 0.5, 0.0, 0.0)
        if "Head" in base_mats:
            eulers["Head"] = (pitch * 0.4, 0.0, 0.0)
        for idx, sb in enumerate(spine_bones):
            eulers[sb] = (-pitch * (0.35 + idx * 0.12), 0.0, 0.0)
        for cb in claw_big_l:
            eulers[cb] = (claw_p, 0.0, -claw_p * 0.5)
        for cb in claw_big_r:
            eulers[cb] = (claw_p, 0.0, claw_p * 0.5)
        apply_pose_deltas(f, root_dz=dz, root_dy=dy, bone_eulers=eulers)
    created.append(atk_act)

    # 3. Hit_Chest (12 frames) and Hit_Knockback (18 frames)
    for hname, end_f, recoil_deg, back_dy in [("Hit_Chest", 12, -20.0, 0.10), ("Hit_Knockback", 18, -32.0, 0.22)]:
        hact = bpy.data.actions.new(hname)
        arm.animation_data.action = hact
        for f, k in [(0, 0.0), (int(end_f * 0.28), 1.0), (end_f, 0.0)]:
            eulers = {"Root": (recoil_deg * k, 8.0 * k, 0.0)}
            for sb in spine_bones[:3]:
                eulers[sb] = (recoil_deg * 0.35 * k, 0.0, 0.0)
            if "Head" in base_mats:
                eulers["Head"] = (recoil_deg * 0.5 * k, 0.0, 0.0)
            apply_pose_deltas(f, root_dz=-0.05 * k, root_dy=back_dy * k, bone_eulers=eulers)
        created.append(hact)

    # 4. Death01 (36 frames: drops gently and pitches onto the floor without sinking underground)
    death_act = bpy.data.actions.new("Death01")
    arm.animation_data.action = death_act
    drop_dz = -0.25
    for f, k in [(0, 0.0), (12, 0.35), (24, 0.85), (36, 1.0)]:
        eulers = {"Root": (-72.0 * k, 22.0 * k, 15.0 * k)}
        for idx, sb in enumerate(spine_bones):
            eulers[sb] = (14.0 * k, 0.0, 10.0 * k)
        for cb in claw_big_l + claw_big_r:
            eulers[cb] = (-25.0 * k, 0.0, 0.0)
        apply_pose_deltas(f, root_dz=drop_dz * k, root_dy=0.25 * k, bone_eulers=eulers)
    created.append(death_act)

    arm.animation_data.action = None
    for tr in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(tr)
    if orig_idle and orig_idle not in created:
        bpy.data.actions.remove(orig_idle)
    for act in created:
        tr = arm.animation_data.nla_tracks.new()
        tr.name = act.name
        st = tr.strips.new(act.name, int(act.frame_range[0]), act)
        st.name = act.name
        if hasattr(st, "action_slot") and hasattr(act, "slots") and len(act.slots) > 0:
            st.action_slot = act.slots[0]

if should_run("monsters"):
    # 3A. Imp
    print("=== Building monster_imp.glb ===")
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(bestiary_dir, "Exports", "GLB (Godot-Unreal)", "Imp.glb"))
    arm = merge_armatures_to_primary()
    bake_retargeted_monster_clips(arm)
    export_glb(os.path.join(OUT_DIR, "monsters", "monster_imp.glb"), export_animations=True, strip_loc_except=("pelvis",))

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
    for idx, (ox, oz, rx, ry) in enumerate([(-0.12, 0.98, 0.45, -0.3), (0.12, 0.98, 0.45, 0.3), (0.0, 1.12, 0.55, 0.0)]):
        bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=0.055, radius2=0.0, depth=0.28, location=(ox, 0.11, oz), rotation=(rx, ry, 0))
        spike = bpy.context.active_object
        spike.name = f"CryoSpike_{idx}"
        spike.data.materials.append(cryo_mat)
        spike.parent = arm
        vg = spike.vertex_groups.new(name="spine_02")
        vg.add([v.index for v in spike.data.vertices], 1.0, 'REPLACE')
        mod = spike.modifiers.new(name="Armature", type='ARMATURE')
        mod.object = arm
    bake_retargeted_monster_clips(arm)
    export_glb(os.path.join(OUT_DIR, "monsters", "monster_imp_frost.glb"), export_animations=True, strip_loc_except=("pelvis",))

    # 3C. Puglin
    print("=== Building monster_puglin.glb ===")
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(bestiary_dir, "Exports", "GLB (Godot-Unreal)", "Puglin.glb"))
    arm = merge_armatures_to_primary()
    bake_retargeted_monster_clips(arm)
    export_glb(os.path.join(OUT_DIR, "monsters", "monster_puglin.glb"), export_animations=True, strip_loc_except=("pelvis",))

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
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.15, depth=0.10, location=(0, -0.22, 0.90))
    crown = bpy.context.active_object
    crown.name = "Warlord_Crown"
    crown.data.materials.append(crown_mat)
    crown.parent = arm
    vg = crown.vertex_groups.new(name="Head")
    vg.add([v.index for v in crown.data.vertices], 1.0, 'REPLACE')
    mod = crown.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = arm
    bake_retargeted_monster_clips(arm)
    export_glb(os.path.join(OUT_DIR, "monsters", "monster_puglin_chieftain.glb"), export_animations=True, strip_loc_except=("pelvis",))

    # 3E. Sci-Fi Rift Aliens
    scifi_dir_m = os.path.join(ROOT, "Modular SciFi MegaKit[Standard]", "Modular SciFi MegaKit[Standard]")
    for alien_file, out_name, emit_col, lift_z in [
        ("Alien_Scolitex.gltf", "monster_alien_scolitex.glb", (0.1, 1.0, 0.55, 1.0), 1.40),
        ("Alien_Oculichrysalis.gltf", "monster_alien_oculichrysalis.glb", (1.0, 0.15, 0.35, 1.0), 1.10),
        ("Alien_Cyclop.gltf", "monster_alien_cyclop.glb", (0.15, 0.75, 1.0, 1.0), 1.15),
    ]:
        print(f"=== Building {out_name} ===")
        clear_scene()
        bpy.ops.import_scene.gltf(filepath=os.path.join(scifi_dir_m, "glTF", "Aliens", alien_file))
        remove_icospheres()
        arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
        arm.location.z = lift_z
        build_alien_animations(arm, lift_z)
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
        export_glb(os.path.join(OUT_DIR, "monsters", out_name), export_animations=True, strip_loc_except=None)

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
        if obj.type == 'MESH' and "superhero" in obj.name.lower():
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

    bpy.ops.mesh.primitive_torus_add(major_radius=0.62, minor_radius=0.035, major_segments=36, minor_segments=12, location=(0, 0.24, 1.48), rotation=(math.radians(90), 0, 0))
    boss_halo = bpy.context.active_object
    boss_halo.name = "Archon_Chrono_Halo"
    boss_halo.data.materials.append(boss_gold_mat)

    wing_objs = [boss_halo]
    for i in range(6):
        side = 1 if i >= 3 else -1
        ang = math.radians(25 + (i % 3) * 25)
        wx = math.cos(ang) * 0.85 * side
        wz = 1.25 + math.sin(ang) * 0.55
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.07, radius2=0.0, depth=0.65, location=(wx, 0.28, wz), rotation=(0, math.radians(-45 * side), 0))
        w = bpy.context.active_object
        w.name = f"Archon_Wing_{i}"
        w.data.materials.append(boss_core_mat if i % 2 == 0 else boss_gold_mat)
        wing_objs.append(w)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.11, location=(0, -0.14, 1.32))
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

    bake_retargeted_monster_clips(arm)
    export_glb(os.path.join(OUT_DIR, "monsters", "boss_chrono_archon.glb"), export_animations=True, strip_loc_except=("pelvis",))

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

if should_run("weapons"):
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
scifi_dir = os.path.join(ROOT, "Modular SciFi MegaKit[Standard]", "Modular SciFi MegaKit[Standard]")
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

def optimize_scene_for_static_prop(max_dim=256):
    canonical_mats = {}
    for mat in list(bpy.data.materials):
        base = mat.name.split(".")[0]
        if base not in canonical_mats:
            canonical_mats[base] = mat

    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith("Icosphere")]
    for obj in meshes:
        if obj.data.uv_layers:
            obj.data.uv_layers[0].name = "UVMap"
            while len(obj.data.uv_layers) > 1:
                obj.data.uv_layers.remove(obj.data.uv_layers[-1])
        while len(obj.data.color_attributes) > 0:
            obj.data.color_attributes.remove(obj.data.color_attributes[0])
        for slot in obj.material_slots:
            if slot.material:
                base = slot.material.name.split(".")[0]
                if base in canonical_mats:
                    slot.material = canonical_mats[base]

    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    if meshes:
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
        if len(meshes) > 1:
            bpy.ops.object.join()
        joined = bpy.context.view_layer.objects.active
        joined.name = "PropMesh"
        joined.data.name = "PropMesh"
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bpy.ops.object.material_slot_remove_unused()
        if len(joined.data.vertices) > 1800:
            mod = joined.modifiers.new(name="PerfDecimate", type='DECIMATE')
            mod.ratio = max(0.08, 1500.0 / float(len(joined.data.vertices)))
            bpy.ops.object.modifier_apply(modifier=mod.name)

    for obj in list(bpy.data.objects):
        if obj.type != 'MESH' or obj.name.startswith("Icosphere"):
            bpy.data.objects.remove(obj, do_unlink=True)

    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)

    for mat in bpy.data.materials:
        if not mat.node_tree:
            continue
        tree = mat.node_tree
        bsdf = next((n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf:
            for sock_name in ("Normal", "Metallic", "Roughness"):
                sock = bsdf.inputs.get(sock_name)
                if sock and sock.is_linked:
                    for link in list(sock.links):
                        tree.links.remove(link)
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = max(bsdf.inputs["Roughness"].default_value, 0.65)
            bc_sock = bsdf.inputs.get("Base Color")
            if bc_sock and bc_sock.is_linked:
                from_node = bc_sock.links[0].from_node
                if from_node.type != 'TEX_IMAGE':
                    tex_n = next((n for n in tree.nodes if n.type == 'TEX_IMAGE' and n.image and not any(k in n.image.name.lower() for k in ("normal", "_orm", "roughness"))), None)
                    if tex_n:
                        tree.links.new(tex_n.outputs["Color"], bc_sock)

        out_node = next((n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        keep_nodes = set()
        if out_node:
            stack = [out_node]
            while stack:
                curr = stack.pop()
                if curr in keep_nodes:
                    continue
                keep_nodes.add(curr)
                for inp in curr.inputs:
                    for link in inp.links:
                        stack.append(link.from_node)

        for node in list(tree.nodes):
            if node not in keep_nodes:
                tree.nodes.remove(node)
            elif node.type == 'TEX_IMAGE' and node.image:
                iname = node.image.name.lower()
                if any(k in iname for k in ("normal", "_orm", "roughness", "metallic")):
                    tree.nodes.remove(node)

    used_images = set()
    for mat in bpy.data.materials:
        if mat.users > 0 and mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image:
                    used_images.add(node.image)
    for img in list(bpy.data.images):
        if img not in used_images:
            bpy.data.images.remove(img)

if should_run("props"):
    for src_path, out_name, tex_dirs in prop_jobs:
        if os.path.exists(src_path):
            clear_scene()
            bpy.ops.import_scene.gltf(filepath=src_path)
            remove_icospheres()
            relink_missing_textures(tex_dirs)
            optimize_scene_for_static_prop(256)
            export_glb(os.path.join(OUT_DIR, "props", out_name), export_animations=False, max_tex=256)

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

    bpy.ops.mesh.primitive_torus_add(major_radius=1.65, minor_radius=0.12, major_segments=32, minor_segments=12, location=(0, 0, 2.15), rotation=(math.radians(90), 0, 0))
    bpy.context.active_object.data.materials.append(ring_mat)

    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1.52, depth=0.06, location=(0, 0, 2.15), rotation=(math.radians(90), 0, 0))
    bpy.context.active_object.data.materials.append(vortex_mat)

    optimize_scene_for_static_prop(256)
    export_glb(os.path.join(OUT_DIR, "props", "prop_astral_portal.glb"), export_animations=False, max_tex=256)

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
    bpy.ops.mesh.primitive_torus_add(major_radius=0.58, minor_radius=0.03, major_segments=24, minor_segments=10, location=(0, 0, 2.15), rotation=(math.radians(35), math.radians(20), 0))
    bpy.context.active_object.data.materials.append(shrine_gold)

    optimize_scene_for_static_prop(256)
    export_glb(os.path.join(OUT_DIR, "props", "prop_revive_shrine.glb"), export_animations=False, max_tex=256)
print("=== ALL BLENDER 5.2 ASSET ENHANCEMENTS COMPLETE ===")
