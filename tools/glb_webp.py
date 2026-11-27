"""Re-encode the PNG/JPEG textures inside .glb models as WebP (EXT_texture_webp).

    python tools/glb_webp.py public/assets/models            # every .glb under the folder
    python tools/glb_webp.py path/to/model.glb --dry          # report only

Geometry, animations and materials are untouched; only image bytes change. A texture keeps its
original image if WebP would not save at least 10% or cannot stay within MIN_PSNR of it.
three.js r128's GLTFLoader reads EXT_texture_webp natively (every current browser decodes WebP).
"""
import io, json, os, struct, sys
import numpy as np
from PIL import Image

EXT = 'EXT_texture_webp'
MIN_PSNR = 36.0     # dB on visible pixels; below this the texture keeps its original image


def pad4(b, fill=b'\x00'):
    return b + fill * ((4 - len(b) % 4) % 4)


def read_glb(path):
    data = open(path, 'rb').read()
    magic, ver, total = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67 and ver == 2, 'not a glTF 2 binary'
    off, js, bin_ = 12, None, b''
    while off < total:
        ln, typ = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + ln]
        if typ == 0x4E4F534A: js = json.loads(chunk.decode('utf-8'))
        elif typ == 0x004E4942: bin_ = chunk
        off += 8 + ln
    return js, bin_


def write_glb(path, js, bin_):
    jb = pad4(json.dumps(js, separators=(',', ':')).encode('utf-8'), b' ')
    bb = pad4(bin_)
    total = 12 + 8 + len(jb) + (8 + len(bb) if bb else 0)
    out = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(jb), 0x4E4F534A) + jb
    if bb: out += struct.pack('<II', len(bb), 0x004E4942) + bb
    open(path, 'wb').write(out)


def convert(path, dry=False):
    js, bin_ = read_glb(path)
    images = js.get('images') or []
    if not images or any(i.get('uri') for i in images) or any(b.get('uri') for b in js.get('buffers', [])):
        return 0, 0
    if EXT in (js.get('extensionsUsed') or []):
        return 0, 0
    normals = set()
    texs = js.get('textures') or []
    for m in js.get('materials') or []:
        nt = m.get('normalTexture')
        if nt and nt.get('index') is not None and nt['index'] < len(texs):
            s = texs[nt['index']].get('source')
            if s is not None: normals.add(s)
    views = js['bufferViews']
    new_data = {}           # bufferView index -> replacement bytes
    converted = set()       # image indices now WebP
    for ii, img in enumerate(images):
        bv = img.get('bufferView')
        if bv is None or img.get('mimeType') not in ('image/png', 'image/jpeg'): continue
        v = views[bv]
        raw = bin_[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
        im = Image.open(io.BytesIO(raw))
        has_a = im.mode in ('RGBA', 'LA', 'PA') or (im.mode == 'P' and 'transparency' in im.info)
        im = im.convert('RGBA' if has_a else 'RGB')
        if has_a and im.getchannel('A').getextrema()[0] == 255:
            im = im.convert('RGB'); has_a = False
        # lowest quality that keeps the visible colours within MIN_PSNR of the original
        ref = np.asarray(im, dtype=np.float32)
        vis = ref[..., 3] > 8 if has_a else None
        wb = None
        for q in ((92, 97) if ii in normals else (85, 92, 97)):
            b = io.BytesIO()
            im.save(b, 'WEBP', quality=q, method=6, **({'alpha_quality': 90} if has_a else {}))
            dec = np.asarray(Image.open(io.BytesIO(b.getvalue())).convert(im.mode), dtype=np.float32)
            d = (ref[..., :3] - dec[..., :3]) ** 2
            mse = float(d[vis].mean()) if vis is not None and vis.any() else float(d.mean())
            if mse == 0 or 10 * np.log10(255 ** 2 / mse) >= MIN_PSNR:
                wb = b.getvalue(); break
        if wb is not None and len(wb) <= len(raw) * 0.9:
            new_data[bv] = wb
            converted.add(ii)
    if not converted: return len(bin_), len(bin_)
    # repack the binary chunk with every buffer view 4-byte aligned
    out = bytearray()
    for i, v in enumerate(views):
        if v.get('buffer', 0) != 0: continue
        chunk = new_data.get(i)
        if chunk is None: chunk = bin_[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
        while len(out) % 4: out.append(0)
        v['byteOffset'] = len(out); v['byteLength'] = len(chunk)
        out += chunk
    while len(out) % 4: out.append(0)
    js['buffers'][0]['byteLength'] = len(out)
    for ii in converted:
        images[ii]['mimeType'] = 'image/webp'
    for t in texs:
        s = t.get('source')
        if s in converted:
            t.setdefault('extensions', {})[EXT] = {'source': s}
            del t['source']
    for k in ('extensionsUsed', 'extensionsRequired'):
        js.setdefault(k, [])
        if EXT not in js[k]: js[k].append(EXT)
    if not dry: write_glb(path, js, bytes(out))
    return len(bin_), len(out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry' in sys.argv
    files = []
    for a in args:
        if os.path.isdir(a):
            for r, _, fs in os.walk(a):
                files += [os.path.join(r, f) for f in fs if f.lower().endswith('.glb')]
        else: files.append(a)
    before = after = 0
    for f in sorted(files):
        try:
            b, n = convert(f, dry)
        except Exception as e:
            print('SKIP', f, e); continue
        if b and n < b:
            print(f'{f}: {b // 1024} KB -> {n // 1024} KB')
        before += b; after += n
    print(f'total {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB' + (' (dry run)' if dry else ''))


if __name__ == '__main__':
    main()
