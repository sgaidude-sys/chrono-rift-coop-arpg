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
OUT_PROPS = os.path.join(ROOT, "public", "assets", "models", "props")
OUT_MONSTERS = os.path.join(ROOT, "public", "assets", "models", "monsters")
OUT_VFX = os.path.join(ROOT, "public", "assets", "vfx")

os.makedirs(OUT_PROPS, exist_ok=True)
os.makedirs(OUT_MONSTERS, exist_ok=True)
os.makedirs(OUT_VFX, exist_ok=True)

VILLAGE_DIR = os.path.join(ROOT, "Medieval Village MegaKit[Standard]", "Medieval Village MegaKit[Standard]")
VILLAGE_GLTF = os.path.join(VILLAGE_DIR, "glTF")
VILLAGE_TEX = os.path.join(VILLAGE_DIR, "Textures")

FANTASY_DIR = os.path.join(ROOT, "Fantasy Props MegaKit[Standard]")
FANTASY_GLTF = os.path.join(FANTASY_DIR, "Exports", "glTF")
FANTASY_TEX = os.path.join(FANTASY_DIR, "Textures")

SCIFI_DIR = os.path.join(ROOT, "Modular SciFi MegaKit[Standard]", "Modular SciFi MegaKit[Standard]")
SCIFI_GLTF = os.path.join(SCIFI_DIR, "glTF")
SCIFI_TEX = os.path.join(SCIFI_DIR, "Textures")

ALL_TEX_DIRS = [
    VILLAGE_TEX,
    VILLAGE_GLTF,
    FANTASY_TEX,
    FANTASY_GLTF,
    SCIFI_TEX,
    os.path.join(ROOT, "Universal Base Characters[Standard]", "Universal Base Characters[Standard]", "Base Characters", "Textures"),
    os.path.join(ROOT, "Universal Base Characters[Standard]", "Universal Base Characters[Standard]", "Hairstyles", "Textures"),
    os.path.join(ROOT, "Modular Character Outfits - Fantasy[Standard]", "Modular Character Outfits - Fantasy[Standard]", "Textures", "Ranger"),
    os.path.join(ROOT, "Modular Character Outfits - Fantasy[Standard]", "Modular Character Outfits - Fantasy[Standard]", "Textures", "Ranger", "Base Chars"),
]


# ==============================================================================
# IMAGE / TEXTURE UTILITIES (Blender 5.2 + NumPy)
# ==============================================================================

def load_rgba_resized(path, size=512):
    """Load an image via Blender, resize to (size, size), and return float32 numpy array (H, W, 4) top-down."""
    img = bpy.data.images.load(path, check_existing=False)
    if img.size[0] != size or img.size[1] != size:
        img.scale(size, size)
    arr = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)
    return arr.reshape((size, size, 4))


def save_rgba_png(arr, out_path):
    """Save a (H, W, 4) float32 [0..1] array as an 8-bit PNG via Blender."""
    h, w, _ = arr.shape
    clamped = np.clip(arr, 0.0, 1.0).astype(np.float32)
    img = bpy.data.images.new(name=os.path.basename(out_path), width=w, height=h, alpha=True)
    img.colorspace_settings.name = "sRGB"
    img.pixels.foreach_set(clamped.ravel())
    img.filepath_raw = out_path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    print(f"[TEXTURE] Saved {os.path.basename(out_path)} ({w}x{h}, {os.path.getsize(out_path)/1024:.1f} KB)")


def periodic_fbm(size, octaves=4, seed=42, base_freq=2):
    """Exact toroidal periodic 2D FBM noise in [0..1] using random Fourier harmonics (zero edge seams)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / float(size)
    u = 2.0 * np.pi * xx
    v = 2.0 * np.pi * yy
    acc = np.zeros((size, size), dtype=np.float32)
    amp = 1.0
    norm = 0.0
    for oct_i in range(octaves):
        freq = base_freq * (2 ** oct_i)
        layer = np.zeros((size, size), dtype=np.float32)
        for _ in range(4):
            kx = int(rng.integers(1, freq + 1)) * (1 if rng.random() < 0.5 else -1)
            ky = int(rng.integers(1, freq + 1)) * (1 if rng.random() < 0.5 else -1)
            phase = float(rng.uniform(0.0, 2.0 * np.pi))
            layer += np.sin(kx * u + ky * v + phase)
        acc += amp * (layer / 4.0)
        norm += amp
        amp *= 0.5
    acc = acc / max(norm, 1e-5)
    acc = (acc - acc.min()) / max(acc.max() - acc.min(), 1e-5)
    return acc


def normal_relief_and_ao(normal_rgba, rough_rgba):
    """Compute crisp directional bevel relief and mortar cavity factor from a kit Normal + Roughness map."""
    nx = normal_rgba[:, :, 0] * 2.0 - 1.0
    ny = normal_rgba[:, :, 1] * 2.0 - 1.0
    nz = normal_rgba[:, :, 2] * 2.0 - 1.0
    light = np.array([-0.42, 0.45, 0.78], dtype=np.float32)
    light /= np.linalg.norm(light)
    ndotl = np.clip(nx * light[0] + ny * light[1] + nz * light[2], 0.0, 1.0)
    slope = np.sqrt(np.clip(nx * nx + ny * ny, 0.0, 1.0))
    rough = rough_rgba[:, :, 0]
    return ndotl, slope, rough


def build_floor_textures():
    """Generate 5 true seamless 512x512 tileable floor textures in public/assets/vfx/."""
    print("=== Generating 5 Seamless 512x512 Floor Textures ===")
    size = 512
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 1. floor_plaza.png: Warm crisp medieval sandstone/red-brick sanctuary plaza tiles
    red_brick = load_rgba_resized(os.path.join(VILLAGE_TEX, "T_RedBrick_BaseColor.png"), size)
    grey_brick = load_rgba_resized(os.path.join(VILLAGE_TEX, "T_Brick_BaseColor.png"), size)
    brick_nrm = load_rgba_resized(os.path.join(VILLAGE_TEX, "T_Brick_Normal.png"), size)
    brick_rgh = load_rgba_resized(os.path.join(VILLAGE_TEX, "T_Brick_Roughness.png"), size)

    ndotl, slope, rough = normal_relief_and_ao(brick_nrm, brick_rgh)
    var_n = periodic_fbm(size, octaves=4, seed=11, base_freq=3)
    # Blend warm terracotta brick with sandstone grey brick for balanced warm sanctuary plaza
    plaza_rgb = red_brick[:, :, :3] * 0.54 + grey_brick[:, :, :3] * 0.46
    # Enhance sandstone warmth & crisp bevel shading
    warm_tint = np.array([1.06, 0.99, 0.88], dtype=np.float32)[None, None, :]
    plaza_rgb = plaza_rgb * warm_tint
    # Detect mortar vs brick face via luminance + roughness
    luma = 0.299 * grey_brick[:, :, 0] + 0.587 * grey_brick[:, :, 1] + 0.114 * grey_brick[:, :, 2]
    mortar_mask = np.clip((0.40 - luma) * 5.0 + (rough - 0.78) * 1.8, 0.0, 1.0)
    bevel_boost = 0.88 + 0.24 * ndotl + 0.08 * (var_n - 0.5)
    plaza_rgb = plaza_rgb * bevel_boost[:, :, None]
    mortar_col = np.array([0.21, 0.18, 0.15], dtype=np.float32)[None, None, :]
    plaza_rgb = plaza_rgb * (1.0 - mortar_mask[:, :, None] * 0.55) + mortar_col * (mortar_mask[:, :, None] * 0.55)
    plaza = np.ones((size, size, 4), dtype=np.float32)
    plaza[:, :, :3] = np.clip(plaza_rgb, 0.03, 0.95)
    save_rgba_png(plaza, os.path.join(OUT_VFX, "floor_plaza.png"))

    # 2. floor_cobble.png: Rich dark-slate & mossy cobblestone road tiles
    cob_base = load_rgba_resized(os.path.join(VILLAGE_TEX, "T_UnevenBrick_BaseColor.png"), size)
    cob_nrm = load_rgba_resized(os.path.join(VILLAGE_TEX, "T_UnevenBrick_Normal.png"), size)
    cob_rgh = load_rgba_resized(os.path.join(VILLAGE_TEX, "T_UnevenBrick_Roughness.png"), size)

    c_ndotl, c_slope, c_rough = normal_relief_and_ao(cob_nrm, cob_rgh)
    moss_noise = periodic_fbm(size, octaves=4, seed=23, base_freq=3)
    stone_var = periodic_fbm(size, octaves=3, seed=29, base_freq=4)

    # Shift warm tan cobble into rich cool dark-slate cobblestones
    cob_luma = 0.299 * cob_base[:, :, 0] + 0.587 * cob_base[:, :, 1] + 0.114 * cob_base[:, :, 2]
    # Mortar crevices in T_UnevenBrick are slightly darker & browner/warmer than stone edge highlights
    warm_gap = np.clip((cob_base[:, :, 0] - cob_base[:, :, 2]) * 4.5, 0.0, 1.0)
    crevice = np.clip((0.46 - cob_luma) * 3.2 + warm_gap * 0.45 + (c_rough - 0.72) * 1.4, 0.0, 1.0)

    slate_rgb = np.stack([
        cob_luma * 0.62 + 0.04,
        cob_luma * 0.68 + 0.05,
        cob_luma * 0.78 + 0.07,
    ], axis=-1)
    slate_rgb *= (0.82 + 0.34 * c_ndotl + 0.10 * (stone_var - 0.5))[:, :, None]

    # Deep dark mortar + organic moss inside crevices
    dark_mortar = np.array([0.11, 0.12, 0.13], dtype=np.float32)[None, None, :]
    moss_col = np.array([0.16, 0.28, 0.13], dtype=np.float32)[None, None, :]
    moss_amt = np.clip(crevice * np.clip((moss_noise - 0.38) * 2.5, 0.0, 1.0), 0.0, 0.85)

    cob_out = slate_rgb * (1.0 - crevice[:, :, None] * 0.62) + dark_mortar * (crevice[:, :, None] * 0.62)
    cob_out = cob_out * (1.0 - moss_amt[:, :, None]) + moss_col * moss_amt[:, :, None]

    cobble = np.ones((size, size, 4), dtype=np.float32)
    cobble[:, :, :3] = np.clip(cob_out, 0.03, 0.90)
    save_rgba_png(cobble, os.path.join(OUT_VFX, "floor_cobble.png"))

    # 3. floor_grass.png: Lush natural dark-emerald & clover meadow turf (zero repetitive circles!)
    f1 = periodic_fbm(size, octaves=5, seed=101, base_freq=2)
    f2 = periodic_fbm(size, octaves=4, seed=202, base_freq=5)
    f3 = periodic_fbm(size, octaves=3, seed=303, base_freq=10)

    deep_emerald = np.array([0.08, 0.16, 0.07], dtype=np.float32)
    mid_meadow = np.array([0.14, 0.25, 0.11], dtype=np.float32)
    clover_olive = np.array([0.18, 0.27, 0.12], dtype=np.float32)

    grass_rgb = deep_emerald * (1.0 - f1[:, :, None]) + mid_meadow * f1[:, :, None]
    clover_mask = np.clip((f2 - 0.52) * 2.2, 0.0, 1.0) * 0.55
    grass_rgb = grass_rgb * (1.0 - clover_mask[:, :, None]) + clover_olive * clover_mask[:, :, None]
    grass_rgb *= (0.85 + 0.30 * f3)[:, :, None]

    # Add hundreds of wrapped organic directional grass-blade strokes (toroidal wrap)
    rng = np.random.default_rng(777)
    n_blades = 2600
    for _ in range(n_blades):
        bx = float(rng.uniform(0, size))
        by = float(rng.uniform(0, size))
        ang = float(rng.uniform(-0.7, 0.7) + 1.15)
        blen = int(rng.integers(5, 13))
        dx = math.cos(ang)
        dy = math.sin(ang)
        is_bright = rng.random() < 0.58
        col = np.array([0.21, 0.36, 0.15], dtype=np.float32) if is_bright else np.array([0.05, 0.11, 0.05], dtype=np.float32)
        for s in range(blen):
            t = s / float(max(blen - 1, 1))
            px = int(round(bx + dx * s)) % size
            py = int(round(by + dy * s)) % size
            alpha = 0.42 * (1.0 - abs(t - 0.45))
            grass_rgb[py, px] = grass_rgb[py, px] * (1.0 - alpha) + col * alpha

    grass = np.ones((size, size, 4), dtype=np.float32)
    grass[:, :, :3] = np.clip(grass_rgb, 0.03, 0.85)
    save_rgba_png(grass, os.path.join(OUT_VFX, "floor_grass.png"))

    # 4. floor_catacomb.png: Dark ancient obsidian-slate dungeon flagstones with subtle mossy/runic cracks
    # Staggered chiselled flagstone courses with multi-width slabs + mineral stone grain + mossy mortar
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / float(size)
    rows = 4.0
    row_f = yy * rows
    row_i = np.floor(row_f).astype(np.int32)
    row_y = row_f - row_i
    cols_per_row = np.array([3.0, 4.0, 3.0, 4.0], dtype=np.float32)
    row_shift = np.array([0.15, 0.50, 0.72, 0.05], dtype=np.float32)
    cols = cols_per_row[row_i % 4]
    col_f = ((xx + row_shift[row_i % 4]) % 1.0) * cols
    col_i = np.floor(col_f).astype(np.int32)
    col_x = col_f - col_i

    # Subtle hand-hewn chip wobble along flagstone edges (crisp, not wavy)
    edge_wobble = (periodic_fbm(size, octaves=3, seed=505, base_freq=8) - 0.5) * 0.014
    dy_edge = np.minimum(row_y, 1.0 - row_y) / rows
    dx_edge = np.minimum(col_x, 1.0 - col_x) / cols
    edge_dist = np.minimum(dx_edge, dy_edge) + edge_wobble

    grout = np.clip((0.012 - edge_dist) / 0.008, 0.0, 1.0)
    bevel = np.clip((edge_dist - 0.009) / 0.018, 0.0, 1.0)
    gx_grad = np.roll(bevel, -1, axis=1) - np.roll(bevel, 1, axis=1)
    gy_grad = np.roll(bevel, -1, axis=0) - np.roll(bevel, 1, axis=0)
    slab_light = np.clip(0.96 + (-gx_grad * 3.4 + gy_grad * 3.4), 0.58, 1.35)

    # Per-flagstone slate shade + rich mineral stone grain
    slab_hash = (((row_i * 7 + col_i * 13) % 11) - 5) * 0.014
    grain_coarse = periodic_fbm(size, octaves=4, seed=606, base_freq=5)
    grain_fine = periodic_fbm(size, octaves=4, seed=607, base_freq=14)
    moss_cat = periodic_fbm(size, octaves=4, seed=707, base_freq=3)

    # Subtle hairline stone cracks inside slabs
    ridge_a = periodic_fbm(size, octaves=3, seed=811, base_freq=7)
    ridge_b = periodic_fbm(size, octaves=3, seed=812, base_freq=7)
    crack_field = np.abs(ridge_a - ridge_b)
    hairline_crack = np.clip((0.009 - crack_field) / 0.009, 0.0, 1.0) * (1.0 - grout) * np.clip((grain_coarse - 0.44) * 3.0, 0.0, 1.0)

    obsidian_base = np.array([0.165, 0.18, 0.225], dtype=np.float32)[None, None, :]
    cat_rgb = obsidian_base + slab_hash[:, :, None] + (grain_coarse[:, :, None] - 0.5) * 0.055 + (grain_fine[:, :, None] - 0.5) * 0.030
    cat_rgb *= slab_light[:, :, None]

    grout_col = np.array([0.065, 0.070, 0.088], dtype=np.float32)[None, None, :]
    cat_moss_col = np.array([0.13, 0.23, 0.14], dtype=np.float32)[None, None, :]
    cat_moss_amt = np.clip(grout * np.clip((moss_cat - 0.42) * 2.4, 0.0, 1.0), 0.0, 0.72)
    cat_rgb = cat_rgb * (1.0 - grout[:, :, None]) + grout_col * grout[:, :, None]
    cat_rgb = cat_rgb * (1.0 - cat_moss_amt[:, :, None]) + cat_moss_col * cat_moss_amt[:, :, None]

    # Subtle cool-cyan runic/mineral hairline crack tint
    crack_col = np.array([0.09, 0.22, 0.28], dtype=np.float32)[None, None, :]
    cat_rgb = cat_rgb * (1.0 - hairline_crack[:, :, None] * 0.55) + crack_col * (hairline_crack[:, :, None] * 0.55)

    catacomb = np.ones((size, size, 4), dtype=np.float32)
    catacomb[:, :, :3] = np.clip(cat_rgb, 0.04, 0.85)
    save_rgba_png(catacomb, os.path.join(OUT_VFX, "floor_catacomb.png"))

    # 5. floor_scifi.png: Sleek dark gunmetal futuristic hexagonal/beveled astral deck plates
    hex_cols = 4
    hex_rows = 4
    centers = []
    for r in range(hex_rows):
        for c in range(hex_cols):
            cx = (c + (0.5 if r % 2 == 1 else 0.0)) / float(hex_cols)
            cy = (r + 0.5) / float(hex_rows)
            centers.append((cx % 1.0, cy % 1.0, (r * hex_cols + c)))

    hd1 = np.full((size, size), 999.0, dtype=np.float32)
    hd2 = np.full((size, size), 999.0, dtype=np.float32)
    hid = np.zeros((size, size), dtype=np.int32)
    for cx, cy, cid in centers:
        dx = xx - cx
        dx = dx - np.round(dx)
        dy = yy - cy
        dy = dy - np.round(dy)
        adx = np.abs(dx)
        ady = np.abs(dy)
        hdist = np.maximum(adx, adx * 0.5 + ady * 0.8660254)
        closer = hdist < hd1
        hd2 = np.where(closer, hd1, np.minimum(hd2, hdist))
        hd1 = np.where(closer, hdist, hd1)
        hid = np.where(closer, cid, hid)

    hex_edge = hd2 - hd1
    seam = np.clip((0.011 - hex_edge) / 0.005, 0.0, 1.0)
    inner_bevel = np.clip((hex_edge - 0.008) / 0.018, 0.0, 1.0)
    inner_ring = np.exp(-((hex_edge - 0.036) / 0.0042) ** 2)

    sx_grad = np.roll(inner_bevel, -1, axis=1) - np.roll(inner_bevel, 1, axis=1)
    sy_grad = np.roll(inner_bevel, -1, axis=0) - np.roll(inner_bevel, 1, axis=0)
    metal_spec = np.clip(0.95 + (-sx_grad * 3.8 + sy_grad * 3.8), 0.58, 1.45)

    brushed = periodic_fbm(size, octaves=4, seed=909, base_freq=8)
    plate_var = ((hid % 3) - 1) * 0.018

    gunmetal = np.array([0.17, 0.20, 0.26], dtype=np.float32)[None, None, :]
    scifi_rgb = gunmetal + plate_var[:, :, None] + (brushed[:, :, None] - 0.5) * 0.032
    scifi_rgb *= metal_spec[:, :, None]

    seam_col = np.array([0.06, 0.075, 0.105], dtype=np.float32)[None, None, :]
    steel_rim = np.array([0.36, 0.43, 0.52], dtype=np.float32)[None, None, :]
    cyan_accent = np.array([0.14, 0.62, 0.82], dtype=np.float32)[None, None, :]

    is_cyan_hex = ((hid % 4) == 0).astype(np.float32)
    scifi_rgb = scifi_rgb * (1.0 - inner_ring[:, :, None] * 0.62) + (
        cyan_accent * is_cyan_hex[:, :, None] + steel_rim * (1.0 - is_cyan_hex[:, :, None])
    ) * (inner_ring[:, :, None] * 0.62)
    scifi_rgb = scifi_rgb * (1.0 - seam[:, :, None]) + seam_col * seam[:, :, None]

    scifi = np.ones((size, size, 4), dtype=np.float32)
    scifi[:, :, :3] = np.clip(scifi_rgb, 0.04, 0.90)
    save_rgba_png(scifi, os.path.join(OUT_VFX, "floor_scifi.png"))


# ==============================================================================
# BLENDER MESH & MATERIAL HELPERS
# ==============================================================================

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


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


def import_piece(gltf_path, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    if not os.path.exists(gltf_path):
        raise FileNotFoundError(f"Missing kit asset: {gltf_path}")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=gltf_path)
    added = [o for o in bpy.data.objects if o not in before]
    kept = []
    for o in added:
        if o.name.startswith("Icosphere"):
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        if o.parent is None:
            o.location = (o.location.x + loc[0], o.location.y + loc[1], o.location.z + loc[2])
            o.rotation_euler = (rot[0], rot[1], rot[2])
            o.scale = (o.scale.x * scale[0], o.scale.y * scale[1], o.scale.z * scale[2])
        kept.append(o)
    return kept


def box_project_uv(obj, scale=0.45):
    """Assign clean box-projected UVs onto obj so tiled textures map smoothly without stretching."""
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers[0].data
    for poly in mesh.polygons:
        n = poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            v = mesh.vertices[mesh.loops[li].vertex_index].co
            if az >= ax and az >= ay:
                uv = (v.x * scale + 0.5, v.y * scale + 0.5)
            elif ax >= ay and ax >= az:
                uv = (v.y * scale + 0.5, v.z * scale + 0.5)
            else:
                uv = (v.x * scale + 0.5, v.z * scale + 0.5)
            uv_layer[li].uv = uv


def make_textured_pbr_mat(name, image_path, tint=(1.0, 1.0, 1.0, 1.0), metallic=0.05, roughness=0.78, tex_dim=256):
    """Create a clean 1-texture BaseColor PBR material with optional RGB tint."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    # Load, resize, and bake tint directly into a packed image so glTF exports cleanly without extra shader nodes
    arr = load_rgba_resized(image_path, tex_dim)
    arr[:, :, 0] *= tint[0]
    arr[:, :, 1] *= tint[1]
    arr[:, :, 2] *= tint[2]
    arr = np.clip(arr, 0.0, 1.0)
    packed_img = bpy.data.images.new(name=f"Tex_{name}", width=tex_dim, height=tex_dim, alpha=True)
    packed_img.colorspace_settings.name = "sRGB"
    packed_img.pixels.foreach_set(arr.ravel())
    packed_img.pack()

    tex_node = tree.nodes.new("ShaderNodeTexImage")
    tex_node.image = packed_img
    tree.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def make_pbr_mat(name, base_color=(0.8, 0.8, 0.8, 1.0), metallic=0.9, roughness=0.25, emit_color=(0, 0, 0, 1), emit_strength=0.0):
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


def optimize_and_export_static_prop(filepath, max_dim=256, max_verts=2800):
    relink_missing_textures()
    # Deduplicate materials by base name
    canonical_mats = {}
    for mat in list(bpy.data.materials):
        base = mat.name.split(".")[0]
        if base not in canonical_mats:
            canonical_mats[base] = mat

    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith("Icosphere")]
    for obj in meshes:
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")
        obj.data.uv_layers[0].name = "UVMap"
        obj.data.uv_layers[0].active = True
        obj.data.uv_layers[0].active_render = True
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
        if joined.data.uv_layers:
            joined.data.uv_layers[0].name = "UVMap"
            joined.data.uv_layers[0].active = True
            joined.data.uv_layers[0].active_render = True
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bpy.ops.object.material_slot_remove_unused()
        if len(joined.data.vertices) > max_verts:
            mod = joined.modifiers.new(name="PerfDecimate", type='DECIMATE')
            mod.ratio = max(0.18, float(max_verts) / float(len(joined.data.vertices)))
            bpy.ops.object.modifier_apply(modifier=mod.name)

    for obj in list(bpy.data.objects):
        if obj.type != 'MESH' or obj.name.startswith("Icosphere"):
            bpy.data.objects.remove(obj, do_unlink=True)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)

    for mat in bpy.data.materials:
        for clean_name in ("M_Archon_Obsidian", "M_Archon_Gold", "M_Archon_Core"):
            if mat.name.startswith(clean_name + "."):
                mat.name = clean_name

    # Strip Normal/ORM/Roughness image bindings so each material uses clean 1-texture BaseColor + scalar PBR
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

    # Deduplicate and downscale packed images
    canonical_img = {}
    remap_img = {}
    for img in list(bpy.data.images):
        base = img.name.split(".")[0]
        if base in canonical_img:
            remap_img[img] = canonical_img[base]
        else:
            canonical_img[base] = img
    for mat in bpy.data.materials:
        if mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image in remap_img:
                    node.image = remap_img[node.image]
    used_imgs = {
        n.image
        for mat in bpy.data.materials if mat.users > 0 and mat.node_tree
        for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image
    }
    for img in list(bpy.data.images):
        if img not in used_imgs:
            bpy.data.images.remove(img)
    for img in bpy.data.images:
        w0, h0 = img.size[0], img.size[1]
        if w0 > max_dim or h0 > max_dim:
            img.scale(min(w0, max_dim), min(h0, max_dim))
        if img.packed_file is None:
            img.pack()

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
    print(f"[EXPORTED PROP] {os.path.basename(filepath)} ({os.path.getsize(filepath)/1024:.1f} KB)")


# ==============================================================================
# 2A. PROP_ASTRAL_PORTAL.GLB (Textured Stone Dais + Column_Astra + Bronze/Gold Arch, OPEN Center!)
# ==============================================================================

def build_prop_astral_portal():
    print("=== Building prop_astral_portal.glb ===")
    clear_scene()

    stone_mat = make_textured_pbr_mat(
        "M_Portal_SlateStone",
        os.path.join(OUT_VFX, "floor_cobble.png"),
        tint=(1.25, 1.28, 1.38, 1.0),
        metallic=0.06,
        roughness=0.76,
        tex_dim=256,
    )
    column_mat = make_textured_pbr_mat(
        "M_Portal_AstraColumn",
        os.path.join(SCIFI_TEX, "T_Trim_01_BaseColor.png"),
        tint=(0.95, 1.0, 1.10, 1.0),
        metallic=0.55,
        roughness=0.38,
        tex_dim=256,
    )
    bronze_gold_mat = make_pbr_mat(
        "M_Portal_BrushedBronzeGold",
        base_color=(0.76, 0.56, 0.22, 1.0),
        metallic=0.90,
        roughness=0.26,
        emit_color=(0.70, 0.48, 0.14, 1.0),
        emit_strength=0.28,
    )

    # 1. Stepped textured octagonal stone dais (z = 0.0 .. 0.34)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=2.65, depth=0.18, location=(0, 0, 0.09), rotation=(0, 0, math.pi / 8.0))
    dais_low = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    box_project_uv(dais_low, scale=0.36)
    dais_low.data.materials.append(stone_mat)

    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=2.12, depth=0.16, location=(0, 0, 0.26), rotation=(0, 0, math.pi / 8.0))
    dais_top = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    box_project_uv(dais_top, scale=0.40)
    dais_top.data.materials.append(stone_mat)

    # Brushed bronze-gold trim ring inlaid around the upper dais rim
    bpy.ops.mesh.primitive_torus_add(major_radius=2.08, minor_radius=0.04, major_segments=32, minor_segments=10, location=(0, 0, 0.34))
    bpy.context.active_object.data.materials.append(bronze_gold_mat)

    # 2. Two flanking Column_Astra pillars with dark gunmetal/blue astral stone trim + stone plinths
    col_gltf = os.path.join(SCIFI_GLTF, "Columns", "Column_Astra.gltf")
    for side in (-1.0, 1.0):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 1.78, 0.0, 0.50))
        plinth = bpy.context.active_object
        plinth.scale = (0.80, 0.80, 0.34)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        box_project_uv(plinth, scale=0.55)
        plinth.data.materials.append(stone_mat)

        cols = import_piece(col_gltf, loc=(side * 1.78, 0.0, 0.30), rot=(0, 0, (math.pi / 2.0) if side < 0 else (-math.pi / 2.0)), scale=(1.05, 1.05, 0.62))
        for obj in cols:
            if obj.type == 'MESH':
                # Re-map Column_Astra cleanly so its main shaft uses dark gunmetal sci-fi panels & blue trim
                for si, slot in enumerate(obj.material_slots):
                    if slot.material and "MI_Trim_02" in slot.material.name:
                        if slot.material.node_tree:
                            for n in slot.material.node_tree.nodes:
                                if n.type == 'TEX_IMAGE' and n.image and "BaseColor" in n.image.name:
                                    n.image.filepath = os.path.join(SCIFI_TEX, "T_Trim_02_BaseColor_Blue.png")
                                    n.image.reload()
                    elif slot.material and "MI_Trim_01" in slot.material.name:
                        if slot.material.node_tree:
                            for n in slot.material.node_tree.nodes:
                                if n.type == 'TEX_IMAGE' and n.image and "BaseColor" in n.image.name:
                                    n.image.filepath = os.path.join(SCIFI_TEX, "T_Trim_01_BaseColor.png")
                                    n.image.reload()
                    elif slot.material and "MI_Trim_03" in slot.material.name:
                        obj.material_slots[si].material = column_mat

    # 3. Smooth swept stone & brushed-bronze/gold crown archway (upper semicircle ONLY so center is 100% OPEN!)
    def add_smooth_arch_ring(name, r_outer, r_inner, half_depth, z_center, segs, mat, add_uv=False):
        bm = bmesh.new()
        rings = []
        for i in range(segs + 1):
            ang = math.pi * (i / float(segs))
            ca, sa = math.cos(ang), math.sin(ang)
            v0 = bm.verts.new((ca * r_inner, -half_depth, z_center + sa * r_inner))
            v1 = bm.verts.new((ca * r_outer, -half_depth, z_center + sa * r_outer))
            v2 = bm.verts.new((ca * r_outer, half_depth, z_center + sa * r_outer))
            v3 = bm.verts.new((ca * r_inner, half_depth, z_center + sa * r_inner))
            rings.append((v0, v1, v2, v3))
        for i in range(segs):
            a = rings[i]
            b = rings[i + 1]
            for k in range(4):
                kn = (k + 1) % 4
                bm.faces.new((a[k], a[kn], b[kn], b[k]))
        bm.faces.new((rings[0][0], rings[0][3], rings[0][2], rings[0][1]))
        bm.faces.new((rings[-1][0], rings[-1][1], rings[-1][2], rings[-1][3]))
        bm.normal_update()
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        bmesh_obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(bmesh_obj)
        bmesh_obj.data.materials.append(mat)
        if add_uv:
            box_project_uv(bmesh_obj, scale=0.45)
        return bmesh_obj

    arch_z0 = 1.82
    add_smooth_arch_ring("Arch_Stone", r_outer=1.96, r_inner=1.50, half_depth=0.22, z_center=arch_z0, segs=24, mat=stone_mat, add_uv=True)
    add_smooth_arch_ring("Arch_BronzeTrim", r_outer=1.52, r_inner=1.42, half_depth=0.25, z_center=arch_z0, segs=24, mat=bronze_gold_mat, add_uv=False)

    # Keystone crest at apex
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.28, radius2=0.04, depth=0.44, location=(0, 0, arch_z0 + 1.96 + 0.20), rotation=(0, 0, math.pi / 4.0))
    keystone = bpy.context.active_object
    keystone.data.materials.append(bronze_gold_mat)

    optimize_and_export_static_prop(os.path.join(OUT_PROPS, "prop_astral_portal.glb"), max_dim=256, max_verts=3600)


# ==============================================================================
# 2B. PROP_REVIVE_SHRINE.GLB (Textured Stone Pedestal + Chalice + Emerald Crystal + Halo)
# ==============================================================================

def build_prop_revive_shrine():
    print("=== Building prop_revive_shrine.glb ===")
    clear_scene()

    stone_mat = make_textured_pbr_mat(
        "M_Shrine_BrickStone",
        os.path.join(VILLAGE_TEX, "T_Brick_BaseColor.png"),
        tint=(0.88, 0.90, 0.94, 1.0),
        metallic=0.04,
        roughness=0.80,
        tex_dim=256,
    )
    gold_mat = make_pbr_mat(
        "M_Shrine_BrushedGold",
        base_color=(0.88, 0.68, 0.24, 1.0),
        metallic=0.92,
        roughness=0.22,
        emit_color=(0.85, 0.60, 0.16, 1.0),
        emit_strength=0.35,
    )
    emerald_mat = make_pbr_mat(
        "M_Shrine_EmeraldCrystal",
        base_color=(0.14, 0.95, 0.58, 1.0),
        metallic=0.15,
        roughness=0.10,
        emit_color=(0.18, 1.0, 0.64, 1.0),
        emit_strength=2.8,
    )

    # 1. Textured stepped octagonal stone pedestal (z = 0.0 .. 1.06)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=1.22, depth=0.22, location=(0, 0, 0.11), rotation=(0, 0, math.pi / 8.0))
    base_plinth = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    box_project_uv(base_plinth, scale=0.52)
    base_plinth.data.materials.append(stone_mat)

    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.72, radius2=0.56, depth=0.70, location=(0, 0, 0.57), rotation=(0, 0, math.pi / 8.0))
    shaft = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    box_project_uv(shaft, scale=0.65)
    shaft.data.materials.append(stone_mat)

    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.76, depth=0.16, location=(0, 0, 0.98), rotation=(0, 0, math.pi / 8.0))
    altar_cap = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    box_project_uv(altar_cap, scale=0.60)
    altar_cap.data.materials.append(stone_mat)

    # Thin gold collar inlaid at altar top
    bpy.ops.mesh.primitive_torus_add(major_radius=0.72, minor_radius=0.024, major_segments=24, minor_segments=8, location=(0, 0, 1.06))
    bpy.context.active_object.data.materials.append(gold_mat)

    # 2. Golden Chalice seated flush on altar cap (z = 1.06)
    chalice_objs = import_piece(os.path.join(FANTASY_GLTF, "Chalice.gltf"), loc=(0, 0, 1.06), scale=(2.2, 2.2, 2.2))
    for obj in chalice_objs:
        if obj.type == 'MESH':
            obj.data.materials.clear()
            obj.data.materials.append(gold_mat)

    # 3. Faceted glowing emerald bipyramid crystal hovering above chalice (z = 2.08)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.22, radius2=0.0, depth=0.38, location=(0, 0, 2.27))
    top_pyr = bpy.context.active_object
    top_pyr.data.materials.append(emerald_mat)

    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.22, radius2=0.0, depth=0.34, location=(0, 0, 1.91), rotation=(math.pi, 0, 0))
    bot_pyr = bpy.context.active_object
    bot_pyr.data.materials.append(emerald_mat)

    # 4. Thin brushed-gold halo ring tilted cleanly around crystal
    bpy.ops.mesh.primitive_torus_add(major_radius=0.52, minor_radius=0.022, major_segments=28, minor_segments=10, location=(0, 0, 2.08), rotation=(math.radians(34), math.radians(18), 0))
    bpy.context.active_object.data.materials.append(gold_mat)

    optimize_and_export_static_prop(os.path.join(OUT_PROPS, "prop_revive_shrine.glb"), max_dim=256, max_verts=2600)


# ==============================================================================
# 2C. BG_DUNGEON_CAGE_ARCH.GLB (Stone Wall_Arch + Corner Pillars + Grounded Props)
# ==============================================================================

def build_bg_dungeon_cage_arch():
    print("=== Building bg_dungeon_cage_arch.glb ===")
    clear_scene()

    arch_stone_mat = make_textured_pbr_mat(
        "M_DungeonArch_Stone",
        os.path.join(VILLAGE_TEX, "T_Brick_BaseColor.png"),
        tint=(0.66, 0.68, 0.74, 1.0),
        metallic=0.05,
        roughness=0.84,
        tex_dim=256,
    )

    # 1. Stone-textured Wall_Arch (replace MI_WoodTrim with dark dungeon stone + box UVs)
    arch_objs = import_piece(os.path.join(VILLAGE_GLTF, "Wall_Arch.gltf"), loc=(0, 0, 0), scale=(1.25, 1.45, 1.25))
    for obj in arch_objs:
        if obj.type == 'MESH':
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            box_project_uv(obj, scale=0.45)
            obj.data.materials.clear()
            obj.data.materials.append(arch_stone_mat)

    # 2. Flanking Corner_Exterior_Brick stone pillars (properly grounded at z = 0)
    import_piece(os.path.join(VILLAGE_GLTF, "Corner_Exterior_Brick.gltf"), loc=(-1.28, 0.05, 0.01), rot=(0, 0, 0), scale=(1.15, 1.15, 1.24))
    import_piece(os.path.join(VILLAGE_GLTF, "Corner_Exterior_Brick.gltf"), loc=(1.28, 0.05, 0.01), rot=(0, 0, -math.pi / 2.0), scale=(1.15, 1.15, 1.24))

    # 3. Grounded dungeon accessories: CandleStick_Stand, Vase_Rubble_Medium, Cage_Small (all seated at z=0!)
    import_piece(os.path.join(FANTASY_GLTF, "CandleStick_Stand.gltf"), loc=(1.42, 0.52, 0.01), rot=(0, 0, -0.3), scale=(1.18, 1.18, 1.18))
    import_piece(os.path.join(FANTASY_GLTF, "Vase_Rubble_Medium.gltf"), loc=(-1.12, -0.45, 0.0), rot=(0, 0, 0.4), scale=(1.25, 1.25, 1.25))
    # Cage_Small local z=[-0.04, 0.76], so at scale 1.15, loc z = 0.046 seats its base flush on z=0!
    import_piece(os.path.join(FANTASY_GLTF, "Cage_Small.gltf"), loc=(-1.68, 0.54, 0.046), rot=(0, 0, 0.35), scale=(1.15, 1.15, 1.15))

    optimize_and_export_static_prop(os.path.join(OUT_PROPS, "bg_dungeon_cage_arch.glb"), max_dim=256, max_verts=5600)


# ==============================================================================
# 2D. BOSS_CHRONO_ARCHON.GLB (Grounded Dark Obsidian Armor, Brushed Gold, Cyan Core, All 9 Anims)
# ==============================================================================

def polish_boss_chrono_archon():
    print("=== Polishing boss_chrono_archon.glb ===")
    clear_scene()
    boss_path = os.path.join(OUT_MONSTERS, "boss_chrono_archon.glb")
    bpy.ops.import_scene.gltf(filepath=boss_path)
    relink_missing_textures()

    # Clear custom bone widget Icosphere safely without touching skeleton or animations
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            for pb in obj.pose.bones:
                if pb.custom_shape and pb.custom_shape.name.startswith("Icosphere"):
                    pb.custom_shape = None
    for obj in list(bpy.data.objects):
        if obj.name.startswith("Icosphere"):
            bpy.data.objects.remove(obj, do_unlink=True)

    # Create refined, balanced materials (no blown-out neon magenta or solid yellow!)
    # Subtle violet rim emission keeps armor sleek dark gunmetal/obsidian without purple washout
    obsidian_mat = make_pbr_mat(
        "M_Archon_Obsidian",
        base_color=(0.08, 0.08, 0.11, 1.0),
        metallic=0.85,
        roughness=0.32,
        emit_color=(0.06, 0.02, 0.12, 1.0),
        emit_strength=0.35,
    )
    gold_mat = make_pbr_mat(
        "M_Archon_Gold",
        base_color=(0.86, 0.66, 0.24, 1.0),
        metallic=0.92,
        roughness=0.22,
        emit_color=(0.76, 0.50, 0.12, 1.0),
        emit_strength=0.60,
    )
    core_mat = make_pbr_mat(
        "M_Archon_Core",
        base_color=(0.04, 0.86, 1.0, 1.0),
        metallic=0.10,
        roughness=0.10,
        emit_color=(0.04, 0.88, 1.0, 1.0),
        emit_strength=3.0,
    )

    arm_obj = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)

    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        oname = obj.name
        if "superhero" in oname.lower():
            # Remove vertex color attribute so Base Color exports as (0.10, 0.09, 0.14), not overridden white
            while len(obj.data.color_attributes) > 0:
                obj.data.color_attributes.remove(obj.data.color_attributes[0])
            obj.data.materials.clear()
            obj.data.materials.append(obsidian_mat)
        elif oname.startswith("Archon_Crown"):
            # Open spiked royal circlet centered on rest-pose Head (0.0, -0.02, z=1.74..1.93)
            if arm_obj:
                bm = bmesh.new()
                n_pts = 8
                cx, cy = 0.0, 0.005
                r_in, r_out = 0.086, 0.106
                z_bot, z_top = 1.755, 1.805
                ring_verts = []
                for i in range(n_pts):
                    ang = 2.0 * math.pi * i / float(n_pts)
                    ca, sa = math.cos(ang), math.sin(ang)
                    ring_verts.append((
                        bm.verts.new((cx + ca * r_in, cy + sa * r_in, z_bot)),
                        bm.verts.new((cx + ca * r_out, cy + sa * r_out, z_bot)),
                        bm.verts.new((cx + ca * r_out, cy + sa * r_out, z_top)),
                        bm.verts.new((cx + ca * r_in, cy + sa * r_in, z_top)),
                    ))
                for i in range(n_pts):
                    a = ring_verts[i]
                    b = ring_verts[(i + 1) % n_pts]
                    for k in range(4):
                        kn = (k + 1) % 4
                        bm.faces.new((a[k], a[kn], b[kn], b[k]))
                    ang_m = 2.0 * math.pi * (i + 0.5) / float(n_pts)
                    cm, sm = math.cos(ang_m), math.sin(ang_m)
                    r_mid = 0.5 * (r_in + r_out)
                    spike_h = 1.94 if (i % 2 == 0) else 1.87
                    tip = bm.verts.new((cx + cm * r_mid * 1.08, cy + sm * r_mid * 1.08, spike_h))
                    bm.faces.new((a[2], b[2], tip))
                    bm.faces.new((b[3], a[3], tip))
                    bm.faces.new((a[3], a[2], tip))
                    bm.faces.new((b[2], b[3], tip))
                bm.normal_update()
                bm.to_mesh(obj.data)
                bm.free()
                obj.vertex_groups.clear()
                vg = obj.vertex_groups.new(name="Head")
                vg.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')
            obj.data.materials.clear()
            obj.data.materials.append(gold_mat)
        elif oname.startswith("Archon_Chrono_Halo") or oname.startswith("Archon_Wing_"):
            obj.data.materials.clear()
            obj.data.materials.append(gold_mat)
        elif oname.startswith("Archon_Chest_Core"):
            # Slightly tighter faceted chest crystal core
            for v in obj.data.vertices:
                c_off = mathutils.Vector((-0.04, -0.06, 1.25))
                v.co = c_off + (v.co - c_off) * 0.72
            obj.data.materials.clear()
            obj.data.materials.append(core_mat)

    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)

    for mat in bpy.data.materials:
        for clean_name in ("M_Archon_Obsidian", "M_Archon_Gold", "M_Archon_Core"):
            if mat.name.startswith(clean_name + "."):
                mat.name = clean_name

    # Ensure all packed images stay non-WebP and <=512
    for img in bpy.data.images:
        w0, h0 = img.size[0], img.size[1]
        if w0 > 512 or h0 > 512:
            img.scale(min(w0, 512), min(h0, 512))
        if img.packed_file is None:
            img.pack()

    bpy.ops.export_scene.gltf(
        filepath=boss_path,
        export_format='GLB',
        export_image_format='AUTO',
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT'
    )
    print(f"[EXPORTED BOSS] {os.path.basename(boss_path)} ({os.path.getsize(boss_path)/1024:.1f} KB)")


# ==============================================================================
# VERIFICATION
# ==============================================================================

def verify_outputs():
    print("=== Verifying Outputs ===")
    # 1. Verify all 5 floor_*.png are 512x512
    for fn in ["floor_plaza.png", "floor_cobble.png", "floor_grass.png", "floor_catacomb.png", "floor_scifi.png"]:
        p = os.path.join(OUT_VFX, fn)
        assert os.path.exists(p), f"Missing {p}"
        img = bpy.data.images.load(p, check_existing=False)
        assert img.size[0] == 512 and img.size[1] == 512, f"{fn} size={img.size[:]}"
        bpy.data.images.remove(img)
        print(f"  [OK TEX] {fn}: 512x512")

    # 2. Verify zero EXT_texture_webp across all modified GLBs + verify boss animations
    targets = [
        os.path.join(OUT_PROPS, "prop_astral_portal.glb"),
        os.path.join(OUT_PROPS, "prop_revive_shrine.glb"),
        os.path.join(OUT_PROPS, "bg_dungeon_cage_arch.glb"),
        os.path.join(OUT_MONSTERS, "boss_chrono_archon.glb"),
    ]
    for p in targets:
        assert os.path.exists(p), f"Missing {p}"
        with open(p, "rb") as f:
            raw = f.read()
        magic, _, _ = struct.unpack("<III", raw[:12])
        assert magic == 0x46546C67, f"Bad GLB magic in {p}"
        clen, _ = struct.unpack("<II", raw[12:20])
        gltf = json.loads(raw[20:20 + clen].decode("utf-8"))
        exts = gltf.get("extensionsUsed", []) + gltf.get("extensionsRequired", [])
        assert "EXT_texture_webp" not in exts, f"EXT_texture_webp found in {p}: {exts}"
        assert b"image/webp" not in raw, f"image/webp mime found in {p}"
        anims = [a.get("name") for a in gltf.get("animations", [])]
        mats = [m.get("name") for m in gltf.get("materials", [])]
        for m in gltf.get("materials", []):
            bct = m.get("pbrMetallicRoughness", {}).get("baseColorTexture")
            if bct is not None:
                assert bct.get("texCoord", 0) == 0, f"Invalid texCoord in {p} material {m.get('name')}: {bct}"
        print(f"  [OK GLB] {os.path.basename(p)}: {len(raw)/1024:.1f} KB, mats={mats}, anims={len(anims)}")
        if os.path.basename(p) == "boss_chrono_archon.glb":
            assert len(anims) == 9, f"Expected 9 boss animations, got {len(anims)}: {anims}"


if __name__ == "__main__":
    build_floor_textures()
    build_prop_astral_portal()
    build_prop_revive_shrine()
    build_bg_dungeon_cage_arch()
    polish_boss_chrono_archon()
    verify_outputs()
    print("=== BLENDER WORLD POLISH COMPLETE ===")
