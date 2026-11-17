import bpy
import os
import math
import shutil

ROOT = r"c:\Users\Desmond\Documents\Co Op ARPG"
OUT_PROPS = os.path.join(ROOT, "public", "assets", "models", "props")
OUT_VFX = os.path.join(ROOT, "public", "assets", "vfx")
os.makedirs(OUT_PROPS, exist_ok=True)
os.makedirs(OUT_VFX, exist_ok=True)

village_dir = os.path.join(ROOT, "Medieval Village MegaKit[Standard]", "Medieval Village MegaKit[Standard]")
village_gltf = os.path.join(village_dir, "glTF")
village_tex = os.path.join(village_dir, "Textures")

fantasy_dir = os.path.join(ROOT, "Fantasy Props MegaKit[Standard]")
fantasy_gltf = os.path.join(fantasy_dir, "Exports", "glTF")

scifi_dir = os.path.join(ROOT, "Modular SciFi MegaKit[Standard]", "Modular SciFi MegaKit[Standard]")
scifi_gltf = os.path.join(scifi_dir, "glTF")
scifi_tex = os.path.join(scifi_dir, "Textures")

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def relink_missing_textures(search_dirs):
    for img in bpy.data.images:
        if img.filepath:
            abs_p = bpy.path.abspath(img.filepath)
            if not os.path.exists(abs_p):
                base = os.path.basename(img.filepath.replace("\\", "/"))
                for d in search_dirs:
                    cand = os.path.join(d, base)
                    if os.path.exists(cand):
                        img.filepath = cand
                        img.reload()
                        break

def optimize_and_dedup_images(max_dim=256):
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

    used_images = set()
    for mat in bpy.data.materials:
        if mat.users > 0 and mat.use_nodes and mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image:
                    used_images.add(node.image)

    for img in list(bpy.data.images):
        if img not in used_images:
            bpy.data.images.remove(img)

    for img in bpy.data.images:
        w0, h0 = img.size[0], img.size[1]
        target_dim = 128 if (len(bpy.data.images) >= 6 and any(k in img.name for k in ("Furniture", "MetalOrnaments", "Trim_Metal", "Trim_Cloth"))) else max_dim
        if w0 > target_dim or h0 > target_dim:
            img.scale(min(w0, target_dim), min(h0, target_dim))
            img.pack()

def optimize_scene_for_static_prop(max_dim=256):
    # 1. Deduplicate materials by base name (e.g. MI_Plaster.001 -> MI_Plaster)
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

    # 2. Join all mesh objects into a single combined mesh
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

    # 3. Strip Normal, ORM, and Roughness texture nodes so each material binds at most 1 texture (BaseColor)
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
            # If Base Color goes through a Vertex Color Mix node, connect the BaseColor TEX_IMAGE directly
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

    optimize_and_dedup_images(max_dim)

def import_piece(gltf_path, loc=(0,0,0), rot=(0,0,0), scale=(1,1,1)):
    if not os.path.exists(gltf_path):
        print(f"MISSING PIECE: {gltf_path}")
        return []
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=gltf_path)
    added = [o for o in bpy.data.objects if o not in before]
    for o in added:
        if o.name.startswith("Icosphere"):
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        if o.parent is None:
            o.location = (o.location.x + loc[0], o.location.y + loc[1], o.location.z + loc[2])
            o.rotation_euler = (rot[0], rot[1], rot[2])
            o.scale = (o.scale.x * scale[0], o.scale.y * scale[1], o.scale.z * scale[2])
    return added

def export_glb(filepath, tex_dirs):
    relink_missing_textures(tex_dirs)
    optimize_scene_for_static_prop(256)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        export_image_format='AUTO',
        export_animations=False,
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT'
    )
    print(f"[EXPORTED BG] {os.path.basename(filepath)} ({os.path.getsize(filepath)/1024:.1f} KB)")

# ==============================================================================
# 1. COMPLETE 2-STORY MEDIEVAL VILLAGE HOUSE (bg_medieval_house.glb)
# ==============================================================================
print("=== Building bg_medieval_house.glb ===")
clear_scene()
# Ground floor walls (4m x 6m footprint)
import_piece(os.path.join(village_gltf, "Wall_Plaster_Door_Round.gltf"), loc=(-1.0, 2.0, 0), rot=(0, 0, 0))
import_piece(os.path.join(village_gltf, "Door_1_Round.gltf"), loc=(-1.0, 2.0, 0), rot=(0, 0, 0))
import_piece(os.path.join(village_gltf, "Wall_Plaster_Window_Wide_Round.gltf"), loc=(1.0, 2.0, 0), rot=(0, 0, 0))
import_piece(os.path.join(village_gltf, "Window_Wide_Round1.gltf"), loc=(1.0, 2.0, 0), rot=(0, 0, 0))
import_piece(os.path.join(village_gltf, "Wall_Plaster_Straight.gltf"), loc=(-1.0, -2.0, 0), rot=(0, 0, math.pi))
import_piece(os.path.join(village_gltf, "Wall_Plaster_Straight.gltf"), loc=(1.0, -2.0, 0), rot=(0, 0, math.pi))
import_piece(os.path.join(village_gltf, "Wall_Plaster_Straight.gltf"), loc=(-2.0, 1.0, 0), rot=(0, 0, math.pi/2))
import_piece(os.path.join(village_gltf, "Wall_Plaster_Straight.gltf"), loc=(-2.0, -1.0, 0), rot=(0, 0, math.pi/2))
import_piece(os.path.join(village_gltf, "Wall_Plaster_Straight.gltf"), loc=(2.0, 1.0, 0), rot=(0, 0, -math.pi/2))
import_piece(os.path.join(village_gltf, "Wall_Plaster_Straight.gltf"), loc=(2.0, -1.0, 0), rot=(0, 0, -math.pi/2))
import_piece(os.path.join(village_gltf, "Corner_ExteriorWide_Wood.gltf"), loc=(-2.0, 2.0, 0), rot=(0, 0, 0))
import_piece(os.path.join(village_gltf, "Corner_ExteriorWide_Wood.gltf"), loc=(2.0, 2.0, 0), rot=(0, 0, -math.pi/2))
import_piece(os.path.join(village_gltf, "Balcony_Cross_Straight.gltf"), loc=(1.0, 2.25, 2.8), rot=(0, 0, 0))
import_piece(os.path.join(village_gltf, "Roof_RoundTiles_4x6.gltf"), loc=(0.0, 0.0, 3.0), rot=(0, 0, math.pi/2))
import_piece(os.path.join(village_gltf, "Roof_Front_Brick4.gltf"), loc=(-2.0, 0.0, 3.0), rot=(0, 0, math.pi/2))
import_piece(os.path.join(village_gltf, "Roof_Front_Brick4.gltf"), loc=(2.0, 0.0, 3.0), rot=(0, 0, -math.pi/2))
import_piece(os.path.join(village_gltf, "Prop_Chimney.gltf"), loc=(-1.2, -1.0, 4.8), rot=(0, 0, 0))
import_piece(os.path.join(village_gltf, "Prop_Vine1.gltf"), loc=(1.0, 2.08, 1.2), rot=(0, 0, 0))
export_glb(os.path.join(OUT_PROPS, "bg_medieval_house.glb"), [village_gltf, village_tex])

# ==============================================================================
# 2. MEDIEVAL BASTION WATCHTOWER (bg_medieval_tower.glb)
# ==============================================================================
print("=== Building bg_medieval_tower.glb ===")
clear_scene()
for z_lv in [0.0, 3.0]:
    import_piece(os.path.join(village_gltf, "Wall_Plaster_Straight.gltf"), loc=(0, 1.0, z_lv), rot=(0, 0, 0))
    import_piece(os.path.join(village_gltf, "Wall_Plaster_Straight.gltf"), loc=(0, -1.0, z_lv), rot=(0, 0, math.pi))
    import_piece(os.path.join(village_gltf, "Wall_Plaster_Straight.gltf"), loc=(-1.0, 0, z_lv), rot=(0, 0, math.pi/2))
    import_piece(os.path.join(village_gltf, "Wall_Plaster_Straight.gltf"), loc=(1.0, 0, z_lv), rot=(0, 0, -math.pi/2))
    import_piece(os.path.join(village_gltf, "Corner_Exterior_Brick.gltf"), loc=(-1.0, 1.0, z_lv), rot=(0, 0, 0))
    import_piece(os.path.join(village_gltf, "Corner_Exterior_Brick.gltf"), loc=(1.0, 1.0, z_lv), rot=(0, 0, -math.pi/2))
    import_piece(os.path.join(village_gltf, "Corner_Exterior_Brick.gltf"), loc=(-1.0, -1.0, z_lv), rot=(0, 0, math.pi/2))
    import_piece(os.path.join(village_gltf, "Corner_Exterior_Brick.gltf"), loc=(1.0, -1.0, z_lv), rot=(0, 0, math.pi))
import_piece(os.path.join(village_gltf, "Roof_Tower_RoundTiles.gltf"), loc=(0, 0, 6.0), rot=(0, 0, 0))
import_piece(os.path.join(fantasy_gltf, "Banner_2.gltf"), loc=(0, 1.15, 2.5), rot=(0, 0, 0))
export_glb(os.path.join(OUT_PROPS, "bg_medieval_tower.glb"), [village_gltf, village_tex, fantasy_gltf])

# ==============================================================================
# 3. VILLAGE MARKET BAZAAR STALL (bg_market_stall.glb)
# ==============================================================================
print("=== Building bg_market_stall.glb ===")
clear_scene()
import_piece(os.path.join(fantasy_gltf, "Stall_Empty.gltf"), loc=(0, 0, 0))
import_piece(os.path.join(fantasy_gltf, "Barrel_Apples.gltf"), loc=(-0.9, 0.6, 0))
import_piece(os.path.join(fantasy_gltf, "FarmCrate_Carrot.gltf"), loc=(0.8, 0.5, 0))
import_piece(os.path.join(fantasy_gltf, "Shelf_Small_Bottles.gltf"), loc=(0, 0, 0.85))
import_piece(os.path.join(fantasy_gltf, "Coin_Pile.gltf"), loc=(-0.3, 0.2, 0.88))
import_piece(os.path.join(fantasy_gltf, "Lantern_Wall.gltf"), loc=(0.95, 0.4, 1.8))
export_glb(os.path.join(OUT_PROPS, "bg_market_stall.glb"), [fantasy_gltf])

# ==============================================================================
# 4. DUNGEON CATACOMB CAGE & TORCH ARCHWAY (bg_dungeon_cage_arch.glb)
# ==============================================================================
print("=== Building bg_dungeon_cage_arch.glb ===")
clear_scene()
import_piece(os.path.join(village_gltf, "Wall_Arch.gltf"), loc=(0, 0, 0), scale=(1.3, 1.3, 1.3))
import_piece(os.path.join(fantasy_gltf, "Cage_Small.gltf"), loc=(-1.2, 0.5, 1.6), scale=(1.2, 1.2, 1.2))
import_piece(os.path.join(fantasy_gltf, "CandleStick_Stand.gltf"), loc=(1.3, 0.4, 0), scale=(1.3, 1.3, 1.3))
import_piece(os.path.join(fantasy_gltf, "Vase_Rubble_Medium.gltf"), loc=(-1.3, -0.4, 0), scale=(1.3, 1.3, 1.3))
export_glb(os.path.join(OUT_PROPS, "bg_dungeon_cage_arch.glb"), [village_gltf, village_tex, fantasy_gltf])

# ==============================================================================
# 5. SCI-FI ASTRAL CITADEL WALL BAY (bg_scifi_citadel_wall.glb)
# ==============================================================================
print("=== Building bg_scifi_citadel_wall.glb ===")
clear_scene()
import_piece(os.path.join(scifi_gltf, "Walls", "WallAstra_Straight_Window.gltf"), loc=(-2.0, 0, 0), rot=(0, 0, math.pi/2))
import_piece(os.path.join(scifi_gltf, "Walls", "WallAstra_Straight.gltf"), loc=(2.0, 0, 0), rot=(0, 0, math.pi/2))
import_piece(os.path.join(scifi_gltf, "Columns", "Column_Astra.gltf"), loc=(0.0, 0.2, 0), rot=(0, 0, 0))
import_piece(os.path.join(scifi_gltf, "Tops", "TopCables_Straight_Hanging.gltf"), loc=(0.0, 0.3, 2.8), rot=(0, 0, math.pi/2))
import_piece(os.path.join(scifi_gltf, "Platforms", "Platform_Metal.gltf"), loc=(0.0, 2.0, 0.02), rot=(0, 0, 0))
export_glb(os.path.join(OUT_PROPS, "bg_scifi_citadel_wall.glb"), [scifi_tex])

# ==============================================================================
# 6. FENCES & FLOOR TILES (bg_fence_iron.glb, bg_fence_wood.glb)
# ==============================================================================
clear_scene()
import_piece(os.path.join(village_gltf, "Prop_MetalFence_Ornament.gltf"), loc=(0, 0, 0))
export_glb(os.path.join(OUT_PROPS, "bg_fence_iron.glb"), [village_gltf, village_tex])

clear_scene()
import_piece(os.path.join(village_gltf, "Prop_WoodenFence_Single.gltf"), loc=(0, 0, 0))
export_glb(os.path.join(OUT_PROPS, "bg_fence_wood.glb"), [village_gltf, village_tex])

# ==============================================================================
# 7. EXPORT 512x512 TILEABLE ENVIRONMENT TEXTURES & KIT PREVIEW BACKGROUNDS
# ==============================================================================
tex_jobs = [
    (os.path.join(village_tex, "T_UnevenBrick_BaseColor.png"), os.path.join(OUT_VFX, "tex_cobble.png")),
    (os.path.join(village_tex, "T_RedBrick_BaseColor.png"), os.path.join(OUT_VFX, "tex_redbrick.png")),
    (os.path.join(village_tex, "T_RockTrim_BaseColor.png"), os.path.join(OUT_VFX, "tex_dungeon.png")),
    (os.path.join(scifi_tex, "T_Trim_02_BaseColor_Blue.png"), os.path.join(OUT_VFX, "tex_scifi.png")),
]
for src, dst in tex_jobs:
    if os.path.exists(src):
        img = bpy.data.images.load(src)
        img.scale(512, 512)
        img.filepath_raw = dst
        img.file_format = 'PNG'
        img.save()
        print(f"[SAVED TEX] {os.path.basename(dst)} ({os.path.getsize(dst)/1024:.1f} KB)")

# Copy official kit preview images for UI card/modal backgrounds
preview_copies = [
    (os.path.join(village_dir, "Preview.jpg"), os.path.join(OUT_VFX, "bg_village.jpg")),
    (os.path.join(fantasy_dir, "Preview_1.jpg"), os.path.join(OUT_VFX, "bg_fantasy.jpg")),
    (os.path.join(ROOT, "Bestiary - Dungeon Monsters Kit[Standard]", "Bestiary - Dungeon Monsters Kit[Standard]", "Preview.jpg"), os.path.join(OUT_VFX, "bg_bestiary.jpg")),
]
for src, dst in preview_copies:
    if os.path.exists(src):
        shutil.copy2(src, dst)
        print(f"[COPIED BG ART] {os.path.basename(dst)}")

# ==============================================================================
# 8. OPTIMIZE ALL STATIC ENVIRONMENT PROPS (prop_*.glb):
#    Single combined mesh + strip Normal/ORM maps + 256x256 BaseColor textures
# ==============================================================================
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

prop_jobs = [
    (os.path.join(fantasy_gltf, "Anvil.gltf"), "prop_anvil.glb", [fantasy_gltf]),
    (os.path.join(fantasy_gltf, "Chest_Wood.gltf"), "prop_chest.glb", [fantasy_gltf]),
    (os.path.join(fantasy_gltf, "Barrel.gltf"), "prop_barrel.glb", [fantasy_gltf]),
    (os.path.join(fantasy_gltf, "Crate_Wooden.gltf"), "prop_crate.glb", [fantasy_gltf]),
    (os.path.join(fantasy_gltf, "Banner_1.gltf"), "prop_banner.glb", [fantasy_gltf]),
    (os.path.join(fantasy_gltf, "Torch_Metal.gltf"), "prop_torch.glb", [fantasy_gltf]),
    (os.path.join(fantasy_gltf, "Cauldron.gltf"), "prop_cauldron.glb", [fantasy_gltf]),
    (os.path.join(fantasy_gltf, "BookStand.gltf"), "prop_bookstand.glb", [fantasy_gltf]),
    (os.path.join(fantasy_gltf, "WeaponStand.gltf"), "prop_weaponstand.glb", [fantasy_gltf]),
    (os.path.join(village_gltf, "Prop_Wagon.gltf"), "prop_wagon.glb", [village_gltf, village_tex]),
    (os.path.join(village_gltf, "Wall_Arch.gltf"), "prop_wall_arch.glb", [village_gltf, village_tex]),
    (os.path.join(village_gltf, "Corner_ExteriorWide_Brick.gltf"), "prop_house_corner.glb", [village_gltf, village_tex]),
    (os.path.join(scifi_gltf, "Columns", "Column_Astra.gltf"), "prop_column_astra.glb", [scifi_tex]),
    (os.path.join(scifi_gltf, "Columns", "Column_Pipes.gltf"), "prop_column_pipes.glb", [scifi_tex]),
    (os.path.join(scifi_gltf, "Props", "Prop_AccessPoint.gltf"), "prop_access_point.glb", [scifi_tex]),
]

for src_path, out_name, tex_dirs in prop_jobs:
    if os.path.exists(src_path):
        clear_scene()
        import_piece(src_path)
        export_glb(os.path.join(OUT_PROPS, out_name), tex_dirs)

print("=== Building prop_astral_portal.glb ===")
clear_scene()
col_path = os.path.join(scifi_gltf, "Columns", "Column_Astra.gltf")
import_piece(col_path, loc=(-1.85, 0, 0))
import_piece(col_path, loc=(1.85, 0, 0))
ped_mat = create_emissive_mat("M_Portal_Obsidian", (0.09, 0.08, 0.15, 1.0), (0.2, 0.05, 0.4, 1.0), 0.6, metallic=0.8, roughness=0.3)
ring_mat = create_emissive_mat("M_Portal_GoldRing", (1.0, 0.78, 0.25, 1.0), (1.0, 0.6, 0.1, 1.0), 3.0, metallic=0.95, roughness=0.15)
vortex_mat = create_emissive_mat("M_Portal_Vortex", (0.15, 0.85, 1.0, 1.0), (0.35, 0.65, 1.0, 1.0), 6.5, metallic=0.1, roughness=0.1)
bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=2.6, depth=0.28, location=(0, 0, 0.14))
bpy.context.active_object.data.materials.append(ped_mat)
bpy.ops.mesh.primitive_torus_add(major_radius=1.65, minor_radius=0.12, major_segments=32, minor_segments=12, location=(0, 0, 2.15), rotation=(math.radians(90), 0, 0))
bpy.context.active_object.data.materials.append(ring_mat)
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1.52, depth=0.06, location=(0, 0, 2.15), rotation=(math.radians(90), 0, 0))
bpy.context.active_object.data.materials.append(vortex_mat)
export_glb(os.path.join(OUT_PROPS, "prop_astral_portal.glb"), [scifi_tex])

print("=== Building prop_revive_shrine.glb ===")
clear_scene()
chalice_path = os.path.join(fantasy_gltf, "Chalice.gltf")
if os.path.exists(chalice_path):
    import_piece(chalice_path, loc=(0, 0, 1.05), scale=(1.8, 1.8, 1.8))
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
export_glb(os.path.join(OUT_PROPS, "prop_revive_shrine.glb"), [fantasy_gltf])

print("=== ALL BACKGROUND BUILDINGS, PROPS & TEXTURES BUILT ===")
