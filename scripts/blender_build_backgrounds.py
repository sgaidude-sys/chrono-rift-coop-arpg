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

def optimize_and_dedup_images(max_dim=512):
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

    for img in bpy.data.images:
        w0, h0 = img.size[0], img.size[1]
        if w0 > max_dim or h0 > max_dim:
            img.scale(min(w0, max_dim), min(h0, max_dim))
            img.pack()

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
    optimize_and_dedup_images(512)
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

print("=== ALL BACKGROUND BUILDINGS & TEXTURES BUILT ===")
