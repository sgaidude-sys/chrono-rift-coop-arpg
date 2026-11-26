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
const fs = require('fs'), path = require('path'), vm = require('vm');
const CRAZY = process.argv.includes('--crazygames');
const CG_SDK = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'public'), OUT = path.join(ROOT, 'dist', CRAZY ? 'chrono-rift-crazygames' : 'chrono-rift-offline');
const CACHE = path.join(__dirname, 'vendor_cache');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
// Kept as standalone files alongside game.bundle.js: head loader + ground_worker.js (which uses importScripts)
const KEEP_JS = new Set(['game.bundle.js', 'gltf_dequant.js', 'ground_worker.js', 'mmo_data.js', 'world_core.js']);

const REGEX_KW = new Set(['return', 'throw', 'case', 'default', 'delete', 'void', 'typeof', 'in', 'instanceof', 'new', 'else', 'do', 'yield', 'await', 'of']);
const REGEX_PREV = new Set(['', '(', '[', '{', ',', ';', ':', '?', '=', '!', '&', '|', '^', '~', '+', '-', '*', '/', '%', '<', '>', '=>', 'KW_REGEX']);
const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
const isIdChar = (c) => isIdStart(c) || (c >= '0' && c <= '9');

function minifyJS(src) {
  let out = '';
  let lineStart = true, pendingSpace = false, lastOut = '', prevTok = '';
  const tmplStack = [];
  const emitChar = (c) => { out += c; lastOut = c; lineStart = (c === '\n'); };
  const flushSpace = (next) => {
    if (!pendingSpace || lineStart) { pendingSpace = false; return; }
    pendingSpace = false;
    if (
      (isIdChar(lastOut) && isIdChar(next)) ||
      (lastOut === '+' && next === '+') ||
      (lastOut === '-' && next === '-') ||
      (lastOut === '/' && (next === '/' || next === '*')) ||
      (lastOut === '*' && next === '/') ||
      (lastOut >= '0' && lastOut <= '9' && next === '.')
    ) emitChar(' ');
  };
  const scanTemplateText = (i) => {
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { emitChar(c); if (i + 1 < src.length) emitChar(src[i + 1]); i += 2; continue; }
      if (c === '`') { emitChar(c); prevTok = 'LIT'; return i + 1; }
      if (c === '$' && src[i + 1] === '{') {
        out += '${'; lastOut = '{'; lineStart = false;
        tmplStack.push(1);
        prevTok = '{';
        return i + 2;
      }
      if (c !== '\r') emitChar(c);
      i++;
    }
    return i;
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '\r') { i++; continue; }
    if (c === '\n') {
      if (!lineStart) { out += '\n'; lastOut = '\n'; lineStart = true; }
      pendingSpace = false; i++; continue;
    }
    if (c === ' ' || c === '\t' || c === '\f' || c === '\v') {
      if (!lineStart) pendingSpace = true;
      i++; continue;
    }
    // line comment
    if (c === '/' && n === '/') {
      i += 2;
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    // block comment
    if (c === '/' && n === '*') {
      i += 2;
      let hadNL = false;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') hadNL = true;
        i++;
      }
      i += 2;
      if (hadNL) {
        if (!lineStart) { out += '\n'; lastOut = '\n'; lineStart = true; }
        pendingSpace = false;
      } else if (!lineStart) {
        pendingSpace = true;
      }
      continue;
    }
    // template literal
    if (c === '`') {
      flushSpace('`');
      emitChar('`');
      i = scanTemplateText(i + 1);
      continue;
    }
    // closing brace of template ${...}
    if (c === '}' && tmplStack.length && tmplStack[tmplStack.length - 1] === 1) {
      tmplStack.pop();
      flushSpace('}');
      emitChar('}');
      i = scanTemplateText(i + 1);
      continue;
    }
    // string literal
    if (c === '\'' || c === '"') {
      flushSpace(c);
      const q = c;
      emitChar(q); i++;
      while (i < src.length) {
        const sc = src[i];
        if (sc === '\\') { emitChar(sc); if (i + 1 < src.length) emitChar(src[i + 1]); i += 2; continue; }
        if (sc === q) { emitChar(sc); i++; break; }
        if (sc !== '\r') emitChar(sc);
        i++;
      }
      prevTok = 'LIT';
      continue;
    }
    // regex literal vs division
    if (c === '/' && REGEX_PREV.has(prevTok)) {
      flushSpace('/');
      emitChar('/'); i++;
      let inClass = false;
      while (i < src.length) {
        const rc = src[i];
        if (rc === '\\') { emitChar(rc); if (i + 1 < src.length) emitChar(src[i + 1]); i += 2; continue; }
        if (rc === '[') { inClass = true; emitChar(rc); i++; continue; }
        if (rc === ']' && inClass) { inClass = false; emitChar(rc); i++; continue; }
        if (rc === '/' && !inClass) { emitChar(rc); i++; break; }
        if (rc === '\n') break;
        if (rc !== '\r') emitChar(rc);
        i++;
      }
      while (i < src.length && isIdChar(src[i])) { emitChar(src[i]); i++; }
      prevTok = 'LIT';
      continue;
    }
    // identifier / keyword
    if (isIdStart(c)) {
      flushSpace(c);
      let w = '';
      while (i < src.length && isIdChar(src[i])) { w += src[i]; i++; }
      out += w; lastOut = w[w.length - 1]; lineStart = false;
      prevTok = (prevTok !== '.' && REGEX_KW.has(w)) ? 'KW_REGEX' : 'ID';
      continue;
    }
    // number literal
    if ((c >= '0' && c <= '9') || (c === '.' && n >= '0' && n <= '9')) {
      flushSpace(c);
      let num = '';
      while (i < src.length && (isIdChar(src[i]) || src[i] === '.' || ((src[i] === '+' || src[i] === '-') && (src[i - 1] === 'e' || src[i - 1] === 'E')))) {
        num += src[i]; i++;
      }
      out += num; lastOut = num[num.length - 1]; lineStart = false;
      prevTok = 'LIT';
      continue;
    }
    // operators & punctuation
    flushSpace(c);
    if (c === '{' && tmplStack.length) tmplStack[tmplStack.length - 1]++;
    else if (c === '}' && tmplStack.length) tmplStack[tmplStack.length - 1]--;
    if ((c === '+' || c === '-') && n === c) {
      out += c + n; lastOut = n; lineStart = false; prevTok = 'POST'; i += 2; continue;
    }
    if (c === '=' && n === '>') {
      out += '=>'; lastOut = '>'; lineStart = false; prevTok = '=>'; i += 2; continue;
    }
    emitChar(c);
    prevTok = c;
    i++;
  }
  return out.trim();
}

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
  html = html.replace('<head>', '<head>\n  <script>window.CR_OFFLINE = true; window.CR_VENDOR_FONTS = true;</script>' + (CRAZY ? `\n  <script src="${CG_SDK}"></script>` : ''));
  // the offline edition never talks to Supabase: don't ship the project address or key
  html = html.replace(/const SUPABASE_URL = "[^"]*";/, 'const SUPABASE_URL = "";').replace(/const SUPABASE_KEY = "[^"]*";/, 'const SUPABASE_KEY = "";');

  // bundle & minify the 55 game scripts into a single game.bundle.js (eliminates 54 sequential requests)
  const jsDir = path.join(OUT, 'assets', 'js');
  const scriptRe = /[ \t]*<script src="assets\/js\/([^"?]+)(?:\?[^"]*)?"><\/script>[ \t]*\r?\n?/g;
  const bundled = [];
  let rawBytes = 0, firstIdx = -1;
  html = html.replace(scriptRe, (tag, file, offset) => {
    if (file === 'gltf_dequant.js') return tag;
    if (firstIdx < 0) firstIdx = offset;
    const p = path.join(jsDir, file);
    const code = fs.readFileSync(p, 'utf8');
    rawBytes += Buffer.byteLength(code, 'utf8');
    bundled.push({ file, min: minifyJS(code) });
    return '__CR_BUNDLE_PLACEHOLDER__';
  });
  if (bundled.length) {
    const bundleCode = bundled.map((b) => b.min).join('\n;\n');
    new vm.Script(bundleCode, { filename: 'game.bundle.js' });
    fs.writeFileSync(path.join(jsDir, 'game.bundle.js'), bundleCode);
    let replaced = false;
    html = html.replace(/__CR_BUNDLE_PLACEHOLDER__/g, () => {
      if (replaced) return '';
      replaced = true;
      return '  <script src="assets/js/game.bundle.js"></script>\n';
    });
    for (const { file } of bundled) {
      if (!KEEP_JS.has(file)) fs.rmSync(path.join(jsDir, file), { force: true });
    }
    const minBytes = Buffer.byteLength(bundleCode, 'utf8');
    console.log(`bundled ${bundled.length} scripts -> assets/js/game.bundle.js (${(rawBytes / 1024).toFixed(1)} KB -> ${(minBytes / 1024).toFixed(1)} KB)`);
  }

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
