/* Build the standalone offline edition for game portals (CrazyGames, itch.io).
 *
 *   node tools/build_offline.js                 -> dist/chrono-rift-offline/    (itch.io, any portal)
 *   node tools/build_offline.js --crazygames    -> dist/chrono-rift-crazygames/ (adds the CrazyGames SDK)
 *
 * index.html sits at the root of the folder — upload it as an HTML5 game. Then zip it:
 *   powershell -File tools/zip_offline.ps1 [-Flavor crazygames]
 *
 * What it does
 *   • copies public/ (the live game) into dist/chrono-rift-offline/
 *   • turns on window.CR_OFFLINE (solo, guest saves on the device, no online UI)
 *   • removes the Supabase library, so the game never contacts your Supabase project
 *   • bundles three.js, its loaders/post-processing and the fonts into vendor/, so the
 *     game makes no requests outside its own folder (no Vercel, no CDNs)
 *   • --crazygames: loads https://sdk.crazygames.com/crazygames-sdk-v3.js (the one external
 *     script, required by CrazyGames); mmo_crazy.js then handles saves, ads and events
 * Vendor files are downloaded once from the public CDNs the game already uses and cached
 * in tools/vendor_cache/.
 */
const fs = require('fs'), path = require('path');
const CRAZY = process.argv.includes('--crazygames');
const CG_SDK = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'public'), OUT = path.join(ROOT, 'dist', CRAZY ? 'chrono-rift-crazygames' : 'chrono-rift-offline');
const CACHE = path.join(__dirname, 'vendor_cache');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const SCRIPTS = {
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js': 'three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js': 'GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/EffectComposer.js': 'EffectComposer.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/RenderPass.js': 'RenderPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/ShaderPass.js': 'ShaderPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/UnrealBloomPass.js': 'UnrealBloomPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/CopyShader.js': 'CopyShader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/LuminosityHighPassShader.js': 'LuminosityHighPassShader.js'
};
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap';
const FONT_CSS_UI = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap';

async function cached(url, name, binary) {
  const f = path.join(CACHE, name);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`download failed ${r.status}: ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(f, buf);
  return buf;
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.cpSync(SRC, OUT, { recursive: true });
  const V = path.join(OUT, 'vendor');
  fs.mkdirSync(path.join(V, 'fonts'), { recursive: true });

  // scripts
  for (const [url, name] of Object.entries(SCRIPTS)) fs.writeFileSync(path.join(V, name), await cached(url, name));

  // fonts: keep only the latin subsets (the game's text), point the CSS at local files
  let i = 0, kept = 0;
  async function localFonts(cssUrl, cacheName, outName) {
    const css = (await cached(cssUrl, cacheName)).toString('utf8');
    const keep = [];
    for (const block of css.split('}').filter(b => b.includes('@font-face'))) {
      const subset = (block.match(/\/\*\s*([\w-]+)\s*\*\//) || [])[1];
      if (subset && subset !== 'latin') continue;
      const url = (block.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
      if (!url) continue;
      const name = `font${i++}.woff2`;
      fs.writeFileSync(path.join(V, 'fonts', name), await cached(url, name));
      keep.push(block.replace(url, `fonts/${name}`) + '}');
    }
    fs.writeFileSync(path.join(V, outName), keep.join('\n'));
    kept += keep.length;
  }
  await localFonts(FONT_CSS, 'fonts.css', 'fonts.css');
  await localFonts(FONT_CSS_UI, 'fonts-ui.css', 'fonts-ui.css');   // loaded at runtime by mmo_ui.js

  // index.html: offline switch on, Supabase out, CDNs -> vendor/
  const idxF = path.join(OUT, 'index.html');
  let html = fs.readFileSync(idxF, 'utf8');
  const before = html.length;
  html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>\s*/g, '');
  for (const [url, name] of Object.entries(SCRIPTS)) html = html.split(`src="${url}"`).join(`src="vendor/${name}"`);
  html = html.replace(/<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"[^>]*>\s*/g, '');
  html = html.split(`href="${FONT_CSS.replace(/&/g, '&amp;')}"`).join('href="vendor/fonts.css"').split(`href="${FONT_CSS}"`).join('href="vendor/fonts.css"');
  html = html.replace('<head>', '<head>\n  <script>window.CR_OFFLINE = true;</script>' + (CRAZY ? `\n  <script src="${CG_SDK}"></script>` : ''));
  // the offline edition never talks to Supabase: don't ship the project address or key
  html = html.replace(/const SUPABASE_URL = "[^"]*";/, 'const SUPABASE_URL = "";').replace(/const SUPABASE_KEY = "[^"]*";/, 'const SUPABASE_KEY = "";');
  fs.writeFileSync(idxF, html);

  // report anything still pointing outside the folder
  const ext = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map(m => m[1]).filter(u => u !== CG_SDK);
  if (CRAZY) console.log('CrazyGames SDK: ' + (html.includes(CG_SDK) ? 'added' : 'MISSING'));
  const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
  const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
  console.log(`built ${path.relative(ROOT, OUT)}: ${count(OUT)} files, ${(size(OUT) / 1048576).toFixed(1)} MB`);
  console.log(`index.html ${before} -> ${html.length} bytes; fonts kept: ${kept}`);
  console.log(ext.length ? 'still external: ' + ext.join(', ') : 'no external URLs left in index.html');
})().catch((e) => { console.error(e); process.exit(1); });
