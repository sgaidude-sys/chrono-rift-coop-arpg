"""
Convert the Quaternius monster packs (CC0) into game-ready GLBs.

  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b --python scripts/blender_build_monsters.py

Sources (gitignored, repo root):
  Basic Monsters/FBX/*.fbx, More Monsters/FBX/*.fbx, Ultimate Monsters/{Big,Blob,Flying}/glTF/*.gltf
Output:
  public/assets/models/monsters/qm/<pack>_<name>.glb

Animations are renamed to the game's clip vocabulary so the engine's AI can drive them:
  Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Sword_Attack, Sword_Heavy_Combo, Hit_Chest, Death01, Taunt, Spawn
"""
import glob
import os
import re

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "models", "monsters", "qm")
os.makedirs(OUT, exist_ok=True)


def clip_name(raw):
    n = raw.split("|")[-1].lower()
    n = re.sub(r"\.\d+$", "", n)
    if "fast_flying" in n or n.endswith("_run") or n.endswith("running") or n == "run":
        return "Jog_Fwd_Loop"
    if "idle" in n and "jump" not in n:
        return "Idle_Loop"
    if n.endswith("flying"):
        return "Idle_Loop"
    if n.endswith("walk") or n == "walk":
        return "Walk_Loop"
    if "attack2" in n or n == "weapon" or "headbutt" in n:
        return "Sword_Heavy_Combo"
    if "attack" in n or n == "punch" or "bite" in n:
        return "Sword_Attack"
    if "hit" in n:
        return "Hit_Chest"
    if "death" in n:
        return "Death01"
    if n == "wave":
        return "Taunt"
    if "spawn" in n:
        return "Spawn"
    return None


def build(src, out_name):
    out_path = os.path.join(OUT, out_name + ".glb")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if src.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=src)
    else:
        bpy.ops.import_scene.gltf(filepath=src)

    # FBX imports come in with alpha 0 + alpha-clip, which exports as an invisible
    # MASK material (only the shadow renders). Force every material opaque.
    for mat in bpy.data.materials:
        if mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED" and "Alpha" in n.inputs:
                    for link in list(n.inputs["Alpha"].links):
                        mat.node_tree.links.remove(link)
                    n.inputs["Alpha"].default_value = 1.0
        for attr, val in (("blend_method", "OPAQUE"), ("surface_render_method", "DITHERED")):
            if hasattr(mat, attr):
                try:
                    setattr(mat, attr, val)
                except Exception:
                    pass

    seen = set()
    for act in list(bpy.data.actions):
        new = clip_name(act.name)
        if not new or new in seen:
            bpy.data.actions.remove(act)
            continue
        seen.add(new)
        act.name = new
        act.use_fake_user = True

    # Make sure every kept action is reachable for the exporter (stash on the armature's NLA)
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if arm is not None:
        if arm.animation_data is None:
            arm.animation_data_create()
        ad = arm.animation_data
        for tr in list(ad.nla_tracks):
            ad.nla_tracks.remove(tr)
        for act in bpy.data.actions:
            tr = ad.nla_tracks.new()
            tr.name = act.name
            strip = tr.strips.new(act.name, int(act.frame_range[0]), act)
            tr.mute = True
        ad.action = None

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_apply=False,
        export_yup=True,
    )
    print(f"MONSTER {out_name}: {sorted(seen)}")


jobs = []
for f in sorted(glob.glob(os.path.join(ROOT, "Basic Monsters", "FBX", "*.fbx"))):
    jobs.append((f, "basic_" + os.path.splitext(os.path.basename(f))[0].lower()))
for f in sorted(glob.glob(os.path.join(ROOT, "More Monsters", "FBX", "*.fbx"))):
    jobs.append((f, "more_" + os.path.splitext(os.path.basename(f))[0].lower()))
for pack, prefix in (("Big", "big"), ("Blob", "blob"), ("Flying", "fly")):
    for f in sorted(glob.glob(os.path.join(ROOT, "Ultimate Monsters", pack, "glTF", "*.gltf"))):
        jobs.append((f, f"{prefix}_" + os.path.splitext(os.path.basename(f))[0].lower()))

only = os.environ.get("ONLY")
for src, name in jobs:
    if only and only not in name:
        continue
    try:
        build(src, name)
    except Exception as e:  # keep going; report at the end
        print(f"MONSTER-FAIL {name}: {e}")
