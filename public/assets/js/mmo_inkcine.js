/* =============================================================================
 * Chrono-Rift — ink storybook cinematics
 *
 *  Code-drawn stop-motion: every story chapter plays as a hand-inked sequence on
 *  paper instead of a 3D camera fly-through.
 *   • 10 fps stepped motion; every stroke "boils" (seeded jitter re-rolled every
 *     2 ticks); strokes draw themselves in; paper grain shifts.
 *   • Two moods: "dread" (cool paper, charcoal, slate) and "hope" (warm cream,
 *     gold, terracotta), with blood-red eyes and a violet rift as accents.
 *   • Jagged ink wipes between shots, a hand-drawn dialogue box typing the
 *     chapter's existing voice lines (the Kokoro clips still play), skip button.
 *   • Stingers over gameplay: an ink name band for boss intros and a gold ink
 *     card for Legendary / Mythic loot.
 *  Story progress, voice lines and the Skip/ESC handling are unchanged; only the
 *  picture is new. Nothing is downloaded: it is all drawn on a <canvas>.
 * ============================================================================= */
(function () {
  'use strict';
  const GP = ChronoRiftCoOpGame.prototype;
  const W = 960, H = 540, WIPE = 0.6;
  const INK = '#22201E', SLATE = '#6E757C', GOLD = '#D4A359', TERRA = '#C86D51', EYE = '#B0283A', RIFT = '#6B4BC8';
  const PAL = {
    dread: { paper: '#E8E5DF', ink: INK, a: SLATE, b: SLATE, eye: EYE, rift: RIFT, gold: GOLD },
    hope: { paper: '#F6EFE2', ink: INK, a: GOLD, b: TERRA, eye: EYE, rift: RIFT, gold: GOLD }
  };

  // ---- tiny drawing kit (shared by cutscenes and stingers) ------------------------------------
  function mul(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  let x = null, R = mul(1);
  const j = (n) => (R() - 0.5) * 2 * n;
  const cl = (v) => Math.max(0, Math.min(1, v)), ph = (t, a, b) => cl((t - a) / (b - a));
  const gr = document.createElement('canvas'); gr.width = gr.height = 256;
  { const g = gr.getContext('2d'), r = mul(7); for (let i = 0; i < 6000; i++) { g.fillStyle = 'rgba(40,30,20,' + (r() * 0.07) + ')'; g.fillRect(r() * 256, r() * 256, 1 + r() * 1.6, 1 + r() * 1.6); } }

  function path(pts, p, w, c) {
    if (p <= 0) return;
    let L = 0; const s = [0];
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); s.push(L); }
    const lim = L * cl(p);
    x.strokeStyle = c; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(pts[0][0] + j(1.5), pts[0][1] + j(1.5));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (s[i] <= lim) {
        const n = Math.max(1, Math.round((s[i] - s[i - 1]) / 22));
        for (let k = 1; k <= n; k++) { const t = k / n; x.lineTo(a[0] + (b[0] - a[0]) * t + j(1.4), a[1] + (b[1] - a[1]) * t + j(1.4)); }
      } else { const f = (lim - s[i - 1]) / (s[i] - s[i - 1]); x.lineTo(a[0] + (b[0] - a[0]) * f + j(1.4), a[1] + (b[1] - a[1]) * f + j(1.4)); break; }
    }
    x.stroke();
  }
  function arc(cx, cy, r, a0, a1, p, w, c) { const pts = []; for (let i = 0; i <= 28; i++) { const a = a0 + (a1 - a0) * i / 28; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } path(pts, p, w, c); }
  function dot(cx, cy, r, c) { x.fillStyle = c; x.beginPath(); x.arc(cx + j(1), cy + j(1), r, 0, Math.PI * 2); x.fill(); }
  function hatch(x0, y0, w, h, p, c, gap, lw) { const n = Math.floor((w + h) / gap * cl(p)); x.save(); x.beginPath(); x.rect(x0, y0, w, h); x.clip(); for (let i = 0; i < n; i++) { const o = i * gap; path([[x0 + o, y0], [x0 + o - h, y0 + h]], 1, lw || 1.2, c); } x.restore(); }
  function txt(s, cx, cy, size, p, c, font, al) { const n = Math.floor(s.length * cl(p)); if (!n) return; x.fillStyle = c; x.font = font || ('500 ' + size + 'px Georgia, serif'); x.textAlign = al || 'center'; x.textBaseline = 'middle'; x.fillText(s.slice(0, n), cx + j(0.8), cy + j(0.8)); }
  function grain(tick) { const o = Math.floor(tick / 2) % 4 * 13; for (let yy = -256; yy < H; yy += 256) for (let xx = -256; xx < W; xx += 256) x.drawImage(gr, xx + o, yy + o * 0.7); }
  function wrap(s, maxW, font) { x.font = font; const words = s.split(' '), lines = []; let cur = ''; words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur); return lines.slice(0, 3); }
  function say(P, t, who, line, t0) {
    if (!line || t < t0) return;
    const font = 'italic 19px Georgia, serif', lines = wrap(line, 690, font), h = 40 + lines.length * 25;
    const y0 = H - 18 - h;
    x.fillStyle = P.paper; x.fillRect(118, y0, 724, h);
    path([[118, y0], [842, y0], [842, y0 + h], [118, y0 + h], [118, y0]], 1, 2.5, P.ink);
    txt(who.toUpperCase(), 140, y0 + 17, 13, 1, P.b, '500 13px Arial, sans-serif', 'left');
    const total = line.length, shown = Math.floor(total * ph(t, t0, t0 + total * 0.03));
    let used = 0;
    lines.forEach((ln, i) => { const n = Math.max(0, Math.min(ln.length, shown - used)); used += ln.length + 1; if (n) txt(ln, 140, y0 + 42 + i * 25, 19, n / ln.length, P.ink, font, 'left'); });
  }
  function title(P, t, t0, badge, name, dark) {
    const ink = dark ? '#E8E5DF' : P.ink;
    txt(badge, W / 2, 190, 16, ph(t, t0, t0 + 0.5), dark ? SLATE : P.b, '500 16px Arial, sans-serif');
    txt(name, W / 2, 245, 52, ph(t, t0 + 0.3, t0 + 1.4), ink);
    path([[260, 285], [700, 283]], ph(t, t0 + 1.4, t0 + 2.1), 4, GOLD);
  }
  const riftCore = (P) => P.rift;

  // ---- props -------------------------------------------------------------------------------------
  function skyline(P, p, ox, base) {
    const b0 = base || 380;
    const b = [[100, b0], [100, b0 - 120], [135, b0 - 120], [135, b0 - 155], [165, b0 - 155], [165, b0 - 120], [210, b0 - 120], [210, b0 - 80], [280, b0 - 80], [280, b0 - 170], [305, b0 - 200], [330, b0 - 170], [330, b0 - 80], [400, b0 - 80], [400, b0]].map(q => [q[0] + (ox || 0), q[1]]);
    path(b, p, 3, P.ink);
  }
  function imp(cx, base, s, P) {
    arc(cx, base - 34 * s, 9 * s, 0, Math.PI * 2, 1, 3, P.ink);
    path([[cx - 6 * s, base - 40 * s], [cx - 11 * s, base - 52 * s]], 1, 3, P.ink); path([[cx + 6 * s, base - 40 * s], [cx + 11 * s, base - 52 * s]], 1, 3, P.ink);
    path([[cx, base - 25 * s], [cx - 10 * s, base], [cx + 10 * s, base], [cx, base - 25 * s]], 1, 3, P.ink);
    dot(cx - 3 * s, base - 35 * s, 2 * s, P.eye); dot(cx + 3 * s, base - 35 * s, 2 * s, P.eye);
  }
  function hero(cx, base, P, p, tick, raise, flip) {
    const d = flip ? -1 : 1;
    arc(cx, base - 118, 13, 0, Math.PI * 2, p, 3, P.ink);
    path([[cx, base - 104], [cx, base - 55]], p, 4, P.ink); path([[cx, base - 55], [cx - 14, base]], p, 4, P.ink); path([[cx, base - 55], [cx + 14, base]], p, 4, P.ink);
    const f = (tick % 4) * 4;
    path([[cx - 4 * d, base - 100], [cx - (38 + f) * d, base - 62], [cx - (26 + f) * d, base - 50], [cx - 4 * d, base - 70]], p, 3, P.ink);
    const hx = cx + 22 * d, hy = base - 104 * raise - 30 * (1 - raise);
    path([[cx + 3 * d, base - 92], [hx, hy]], p, 4, P.ink);
    path([[hx, hy], [cx + 40 * d, base - 170 * raise - 40 * (1 - raise)]], p, 5, P.ink);
  }
  function pine(cx, base, h, p, c) { path([[cx, base - h], [cx - h * 0.32, base], [cx + h * 0.32, base], [cx, base - h]], p, 3, c); }
  function rain(tick, P, maxY) { const rr = mul(tick * 31 + 5); for (let i = 0; i < 80; i++) { const a = rr() * W, b = rr() * (maxY || 430); path([[a, b], [a - 8, b + 26]], 1, 1.2, P.a); } }
  function rays(cx, cy, r0, r1, n, p, c, tick) { for (let i = 0; i < n; i++) { const a = Math.PI + Math.PI * (i + 0.5) / n; const w = (tick % 2) * 6; path([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * (r1 + w), cy + Math.sin(a) * (r1 + w)]], ph(p, i / n * 0.6, i / n * 0.6 + 0.4), 3, c); } }

  // ---- chapter sequences: each shot may carry a voice line (index into STORY_CHAPTERS shots) ----
  const SEQ = {
    ch1: { mood: 'dread', badge: 'CHAPTER I · PROLOGUE', name: 'The Shattered Dawn', shots: [
      { dur: 5, draw(t, P, tick) {
        path([[0, 380], [W, 378]], ph(t, 0, 0.8), 3, P.ink); arc(720, 330, 60, Math.PI, Math.PI * 2, ph(t, 0.2, 1.2), 3, P.a);
        skyline(P, ph(t, 0.4, 2.2), 0);
        [135, 305].forEach((fx, i) => { const top = i ? 180 : 225; path([[fx, top], [fx, top - 40]], ph(t, 2, 2.3), 2, P.ink); const w = (tick + i * 2) % 4; path([[fx, top - 40], [fx + 26, top - 34 + w], [fx, top - 28]], ph(t, 2.2, 2.5), 2.5, P.ink); });
        for (let i = 0; i < 4; i++) { const bx = (520 + tick * 9 + i * 60) % W, by = 110 + i * 18 + ((tick + i) % 3) * 3; path([[bx - 8, by - 5], [bx, by], [bx + 8, by - 5]], ph(t, 1, 1.4), 2, P.ink); }
      } },
      { dur: 5, voice: 0, draw(t, P, tick) {
        hatch(0, 0, W, 450, ph(t, 0, 1.5) * 0.6, P.a, 12, 1);
        const c = [[560, 0], [520, 70], [575, 120], [500, 190], [548, 232], [470, 300], [505, 340], [440, 400]];
        path(c, ph(t, 0.6, 2), 12, P.ink); path(c, ph(t, 0.9, 2.2), 4, riftCore(P));
        if (t > 1.6) for (let i = 0; i < 14; i++) { const k = ((tick * 3 + i * 11) % 40); const sx = 500 + ((i * 67) % 160) - 80 + (i % 2 ? k * 2 : -k * 2), sy = 120 + k * 7; path([[sx, sy], [sx + 10, sy + 6], [sx + 3, sy + 14], [sx, sy]], 1, 2, P.ink); }
      } },
      { dur: 5, voice: 1, draw(t, P, tick) {
        path([[0, 390], [W, 388]], ph(t, 0, 0.6), 3, P.ink);
        path([[60, 390], [60, 240], [150, 240], [150, 390]], ph(t, 0.2, 0.9), 4, P.ink); arc(105, 300, 30, Math.PI, Math.PI * 2, ph(t, 0.6, 1), 4, P.ink); hatch(76, 300, 58, 90, ph(t, 0.8, 1.4), P.ink, 6, 1.2);
        const n = Math.min(9, Math.floor(t * 2.2));
        for (let i = 0; i < n; i++) { const ix = W - 40 - ((tick * 6 + i * 70) % (W - 220)); imp(ix, 390, 1 + (i % 3) * 0.15, P); }
      } },
      { dur: 6.5, draw(t, P, tick, S) {
        path([[0, 330], [W, 328]], ph(t, 0, 0.6), 4, P.ink);
        for (let i = 0; i < 12; i++) path([[i * 80 + 10, 330], [i * 80 + 10, 306], [i * 80 + 50, 306], [i * 80 + 50, 330]], ph(t, 0.2 + i * 0.04, 0.6 + i * 0.04), 3, P.ink);
        hatch(0, 330, W, 210, ph(t, 0.4, 1.2) * 0.5, P.a, 10, 1);
        hero(480, 306, P, ph(t, 0.8, 1.8), tick, ph(t, 1.6, 2.4));
        if (t > 2.4) for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + (i - 3.5) * 0.22, l = 50 + (tick % 2) * 8; path([[520 + Math.cos(a) * 30, 136 + Math.sin(a) * 30], [520 + Math.cos(a) * l, 136 + Math.sin(a) * l]], 1, 2, GOLD); }
        if (t > 3) { x.fillStyle = P.paper; x.globalAlpha = 0.88 * ph(t, 3, 3.4); x.fillRect(0, 150, W, 170); x.globalAlpha = 1; title(P, t, 3.2, S.badge, S.name); }
      } }] },

    ch2: { mood: 'dread', badge: 'CHAPTER II · CATACOMBS', name: 'Crypts of the Warlord', shots: [
      { dur: 5, draw(t, P, tick) {
        for (let i = 0; i < 9; i++) { const y = 470 - i * 34, w = 420 - i * 38; path([[480 - w, y], [480 + w, y]], ph(t, i * 0.12, i * 0.12 + 0.5), 3, P.ink); }
        path([[60, 470], [330, 160]], ph(t, 0.4, 1.4), 3, P.ink); path([[900, 470], [630, 160]], ph(t, 0.5, 1.5), 3, P.ink);
        hatch(330, 60, 300, 100, ph(t, 1.2, 2.2), P.ink, 6, 1.4);
        [[230, 300], [730, 300]].forEach(([tx, ty]) => { path([[tx, ty + 60], [tx, ty]], ph(t, 1.6, 2), 4, P.ink); const f = tick % 3; path([[tx - 12, ty - 2], [tx - 4, ty - 30 - f * 6], [tx + 2, ty - 14], [tx + 10, ty - 36 + f * 4], [tx + 12, ty - 2]], ph(t, 2, 2.3), 3, TERRA); });
      } },
      { dur: 5.5, voice: 0, draw(t, P, tick) {
        path([[0, 400], [W, 398]], ph(t, 0, 0.8), 3, P.ink);
        path([[360, 400], [360, 180]], ph(t, 0.3, 1.1), 5, P.ink); path([[600, 400], [600, 180]], ph(t, 0.4, 1.2), 5, P.ink); arc(480, 180, 120, Math.PI, Math.PI * 2, ph(t, 1, 1.9), 5, P.ink);
        x.save(); x.beginPath(); x.moveTo(366, 400); x.lineTo(366, 180); x.arc(480, 180, 114, Math.PI, 0); x.lineTo(594, 400); x.closePath(); x.clip();
        hatch(366, 60, 228, 340, ph(t, 1.6, 2.6), P.ink, 6, 1.4); x.restore();
        if (t > 2.6) { arc(480, 245, 46, Math.PI * 1.1, Math.PI * 1.9, 1, 10, P.paper); path([[420, 360], [440, 290], [520, 290], [540, 360]], ph(t, 2.6, 3.2), 10, P.paper); path([[440, 230], [425, 200]], 1, 8, P.paper); path([[520, 230], [535, 200]], 1, 8, P.paper); }
        if (t > 3.3 && tick % 12 > 0) { dot(468, 244, 6, P.eye); dot(494, 244, 6, P.eye); }
        [300, 660].forEach((tx) => { path([[tx, 400], [tx, 300]], ph(t, 0.8, 1.4), 4, P.ink); const f = tick % 3; path([[tx - 12, 298], [tx - 4, 270 - f * 6], [tx + 2, 286], [tx + 10, 262 + f * 4], [tx + 12, 298]], ph(t, 1.4, 1.8), 3, TERRA); });
      } },
      { dur: 5, voice: 1, draw(t, P, tick) {
        x.fillStyle = INK; x.fillRect(0, 0, W, H);
        const n = Math.min(14, Math.floor(t * 4));
        for (let i = 0; i < n; i++) { const ex = 80 + ((i * 137) % 800), ey = 80 + ((i * 89) % 300), s = 3 + (i % 3) * 2; if ((tick + i) % 11 === 0) continue; dot(ex, ey, s, P.eye); dot(ex + s * 4, ey, s, P.eye); }
        path([[0, 420], [W, 418]], ph(t, 0, 1), 2, SLATE);
      } },
      { dur: 5.5, draw(t, P, tick, S) {
        arc(480, 300, 150, Math.PI, Math.PI * 2, ph(t, 0, 0.9), 4, P.a);
        path([[330, 300], [330, 460]], ph(t, 0.3, 0.8), 4, P.a); path([[630, 300], [630, 460]], ph(t, 0.3, 0.8), 4, P.a);
        title(P, t, 1, S.badge, S.name);
      } }] },

    ch3: { mood: 'dread', badge: 'CHAPTER III · XENO BREACH', name: 'The Xeno Convergence', shots: [
      { dur: 5, draw(t, P, tick) {
        for (let i = 0; i < 24; i++) { const sx = (i * 173) % W, sy = (i * 61) % 260; if ((tick + i) % 7) dot(sx, sy, 1.6, P.a); }
        path([[0, 380], [W, 376]], ph(t, 0, 0.8), 3, P.ink);
        [90, 170, 260, 700, 790, 880].forEach((px, i) => pine(px, 380, 110 + (i % 3) * 30, ph(t, 0.4 + i * 0.15, 1.2 + i * 0.15), P.ink));
        const c = [[480, 20], [470, 70], [495, 95], [465, 150]];
        path(c, ph(t, 2, 3), 8, P.ink); path(c, ph(t, 2.3, 3.2), 3, riftCore(P));
      } },
      { dur: 5.5, voice: 0, draw(t, P, tick) {
        path([[0, 380], [W, 376]], ph(t, 0, 0.8), 3, P.ink);
        arc(480, 270, 170, Math.PI * 1.05, Math.PI * 1.95, ph(t, 0.6, 1.8), 4, P.a);
        arc(480, 190, 44, 0, Math.PI * 2, ph(t, 1.6, 2.4), 4, P.ink);
        if (t > 2.4) { const lx = Math.sin(tick * 0.35) * 14; dot(480 + lx, 190, 15, P.eye); }
        path([[330, 380], [350, 200], [395, 180], [410, 380]], ph(t, 2.2, 3.1), 4, P.ink); hatch(345, 185, 65, 195, ph(t, 3, 3.6), P.ink, 8, 1.2);
        path([[560, 380], [575, 220], [615, 205], [640, 380]], ph(t, 2.5, 3.4), 4, P.ink); hatch(565, 205, 75, 175, ph(t, 3.2, 3.8), P.ink, 8, 1.2);
        [140, 210, 760, 830].forEach((px, i) => pine(px, 380, 120 + (i % 2) * 40, ph(t, 1 + i * 0.2, 1.8 + i * 0.2), P.ink));
      } },
      { dur: 5, voice: 1, draw(t, P, tick) {
        arc(480, 230, 210, 0, Math.PI * 2, ph(t, 0, 0.9), 6, P.ink);
        arc(480, 230, 120, 0, Math.PI * 2, ph(t, 0.6, 1.4), 4, P.a);
        const lx = Math.sin(tick * 0.4) * 40; dot(480 + lx, 230, 55, P.eye); dot(480 + lx, 230, 22, INK);
        if (t > 1.6) for (let i = 0; i < 6; i++) { const a = (tick * 0.12 + i) % (Math.PI * 2); path([[480 + lx, 230], [480 + lx + Math.cos(a) * 480, 230 + Math.sin(a) * 480]], 1, 2, RIFT); }
      } },
      { dur: 5.5, draw(t, P, tick, S) {
        [[330, 150], [620, 150]].forEach(([mx, my]) => path([[mx - 40, 470], [mx - 25, my], [mx + 25, my - 15], [mx + 40, 470]], ph(t, 0, 0.9), 3, P.a));
        title(P, t, 0.8, S.badge, S.name);
      } }] },

    ch4: { mood: 'dread', badge: 'CHAPTER IV · THE ARCHON', name: 'Archon of the Rift', shots: [
      { dur: 5, draw(t, P, tick, S, G) {
        rain(tick, P, 420);
        path([[0, 420], [300, 420], [380, 300], [600, 300], [680, 420], [W, 420]], ph(t, 0, 1.2), 3, P.ink);
        path([[430, 300], [430, 150], [470, 110], [510, 150], [510, 300]], ph(t, 0.8, 2), 4, P.ink); hatch(430, 150, 80, 150, ph(t, 1.8, 2.6), P.ink, 7, 1.2);
        dot(470, 180, 5, P.eye);
        if ((tick === 27 || tick === 28) && !(G && G.noFlash)) { x.fillStyle = INK; x.globalAlpha = 0.85; x.fillRect(0, 0, W, H); x.globalAlpha = 1; path([[700, 0], [660, 90], [690, 110], [640, 220]], 1, 5, P.paper); }
      } },
      { dur: 5.5, voice: 0, draw(t, P, tick) {
        for (let i = 0; i < 5; i++) path([[300 - i * 30, 400 - i * 16], [660 + i * 30, 400 - i * 16]], ph(t, 0, 0.8), 2, P.a);
        path([[380, 320], [380, 120], [480, 80], [580, 120], [580, 320]], ph(t, 0.3, 1.2), 3, P.a);
        arc(480, 170, 48, Math.PI * 1.05, Math.PI * 1.95, ph(t, 0.8, 1.6), 4, P.ink);
        path([[434, 185], [400, 395]], ph(t, 1.2, 2), 4, P.ink); path([[526, 185], [560, 395]], ph(t, 1.3, 2.1), 4, P.ink); hatch(400, 195, 160, 200, ph(t, 1.9, 2.8), P.ink, 8, 1.3);
        path([[600, 90], [580, 400]], ph(t, 2.2, 2.9), 4, P.ink); arc(560, 120, 90, Math.PI * 1.55, Math.PI * 2.15, ph(t, 2.7, 3.5), 4, P.ink);
        if (t > 3.4 && (tick % 14) > 0) { dot(466, 168, 5, P.eye); dot(494, 168, 5, P.eye); }
      } },
      { dur: 3.5, draw(t, P, tick) {
        const p = ph(t, 0.2, 1.1);
        arc(480, 700, 620, Math.PI * 1.12, Math.PI * 1.12 + Math.PI * 0.76 * p, 1, 34, P.ink);
        arc(480, 700, 620, Math.PI * 1.12, Math.PI * 1.12 + Math.PI * 0.76 * p, 1, 8, RIFT);
        txt('KNEEL.', W / 2, 300, 64, ph(t, 1.4, 1.9), P.ink);
      } },
      { dur: 6, voice: 1, draw(t, P, tick, S) {
        x.fillStyle = INK; x.fillRect(0, 0, W, H);
        if (tick % 16 > 0) { dot(455, 120, 7, EYE); dot(505, 120, 7, EYE); }
        title(P, t, 0.6, S.badge, S.name, true);
      } }] },

    ch5: { mood: 'hope', badge: 'CHAPTER V · EPILOGUE', name: 'Dawn of the Endless Rift', shots: [
      { dur: 5.5, voice: 0, draw(t, P, tick) {
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; path([[480 + Math.cos(a) * 40, 220 + Math.sin(a) * 40], [480 + Math.cos(a) * (110 + (tick % 2) * 10), 220 + Math.sin(a) * (110 + (tick % 2) * 10)]], ph(t, 0, 0.8), 3, GOLD); }
        if (t < 2) { arc(480, 170, 40, Math.PI * 1.05, Math.PI * 1.95, 1, 4, P.ink); path([[440, 185], [410, 360]], 1, 4, P.ink); path([[520, 185], [550, 360]], 1, 4, P.ink); }
        else for (let i = 0; i < 26; i++) { const k = (t - 2) * 60; const a = i * 0.9; path([[480 + Math.cos(a) * k, 260 + Math.sin(a) * k], [490 + Math.cos(a) * k, 268 + Math.sin(a) * k]], 1, 3, i % 3 ? P.ink : RIFT); }
      } },
      { dur: 5, draw(t, P, tick) {
        const sy = 300 - Math.floor(ph(t, 0.4, 3) * 10) * 9;
        arc(480, sy + 60, 110, Math.PI, Math.PI * 2, ph(t, 0.3, 1.5), 4, P.a);
        rays(480, sy + 60, 130, 175, 9, ph(t, 1.2, 2.6), P.a, tick);
        x.fillStyle = P.paper; x.fillRect(0, 362, W, H);
        path([[0, 362], [W, 360]], ph(t, 0, 1), 3, P.ink); skyline(P, ph(t, 0.6, 2), 380, 362);
      } },
      { dur: 5.5, voice: 1, draw(t, P, tick) {
        arc(480, 620, 420, Math.PI * 1.2, Math.PI * 1.8, ph(t, 0, 1), 3, P.ink);
        hero(400, 270, P, ph(t, 0.6, 1.6), tick, 0.9);
        hero(560, 270, P, ph(t, 0.9, 1.9), tick, 0.9, true);
        path([[480, 270], [480, 120]], ph(t, 1.6, 2.2), 3, P.ink); const w = tick % 4; path([[480, 120], [540, 130 + w], [480, 150]], ph(t, 2.1, 2.5), 3, TERRA);
      } },
      { dur: 6.5, draw(t, P, tick, S) {
        path([[0, 330], [W, 328]], ph(t, 0, 0.8), 3, P.ink);
        const c = [[820, 330], [810, 300], [826, 286], [812, 260]];
        path(c, ph(t, 0.6, 1.4), 6, P.ink); path(c, ph(t, 0.8, 1.6), 2, RIFT);
        title(P, t, 1, S.badge, S.name);
        txt('The rift remains. So does the light.', W / 2, 372, 18, ph(t, 3.4, 4.8), P.b, 'italic 18px Georgia, serif');
      } }] }
  };

  const orig = { playCutscene: GP.playCutscene, skipCutscene: GP.skipCutscene, epicCard: GP.epicCard, pickupItem: GP.pickupItem, epicCallout: GP.epicCallout };

  function overlay(id, z, blocking) {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div'); el.id = id;
    el.style.cssText = `position:fixed;inset:0;z-index:${z};display:none;align-items:center;justify-content:center;${blocking ? 'background:#16140f;' : 'pointer-events:none;'}`;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.style.cssText = 'width:min(100vw, calc(100vh * 16 / 9));height:auto;max-height:100vh;display:block;';
    el.appendChild(c);
    if (blocking) {
      const b = document.createElement('button');
      b.textContent = 'Skip ⏭'; b.setAttribute('aria-label', 'Skip cinematic');
      b.style.cssText = 'all:unset;position:absolute;right:18px;bottom:16px;padding:8px 16px;border-radius:999px;cursor:pointer;background:rgba(246,239,226,.92);color:#22201E;font:700 13px Georgia,serif;letter-spacing:1px;border:2px solid #22201E;';
      b.onclick = (e) => { e.stopPropagation(); window.game && window.game.skipCutscene(); };
      el.appendChild(b);
    }
    document.body.appendChild(el);
    return el;
  }

  Object.assign(GP, {
    // ---- chapter cinematics --------------------------------------------------------------------
    playCutscene(chapterId = 'ch1', isReplay = false) {
      const S = SEQ[chapterId];
      const chap = (typeof STORY_CHAPTERS !== 'undefined') && STORY_CHAPTERS[chapterId];
      if (!S || !chap) return orig.playCutscene.apply(this, arguments);
      if (!isReplay && this.storyState.seen.has(chapterId)) return;
      if (this._ink) this.inkEnd();
      this.audio && this.audio.init && this.audio.init();
      this.storyState.seen.add(chapterId);
      this.storyState.activeChapter = chapterId;
      this.saveStoryState && this.saveStoryState();
      this.updateStoryTrackerUI && this.updateStoryTrackerUI();
      // stretch shots that carry a voice line so the line is never cut off
      const shots = S.shots.map((s) => {
        let dur = s.dur;
        if (s.voice !== undefined && this.audio && this.audio.voiceDuration) {
          const v = this.audio.voiceDuration(`cs_${chapterId}_${s.voice}`);
          if (v) dur = Math.max(dur, v + 1.2);
        }
        return Object.assign({}, s, { dur });
      });
      if (this.audio && this.audio.preloadVoice) this.audio.preloadVoice(chap.shots.map((_, i) => `cs_${chapterId}_${i}`));
      this.cutsceneActive = true;
      this.mouseDownLeft = false;
      const el = overlay('ink-cine', 5000, true);
      el.style.display = 'flex';
      const ctx = el.querySelector('canvas').getContext('2d');
      const total = shots.reduce((a, s) => a + s.dur, 0);
      const I = this._ink = { id: chapterId, S, shots, total, chap, t0: performance.now(), ctx, el, voiced: {}, raf: 0 };
      const step = (now) => {
        if (this._ink !== I) return;
        const t = (now - I.t0) / 1000;
        if (t >= I.total + 0.3) { this.inkEnd(); return; }
        this.inkFrame(I, t);
        I.raf = requestAnimationFrame(step);
      };
      I.raf = requestAnimationFrame(step);
    },

    inkFrame(I, t) {
      x = I.ctx;
      const shots = I.shots, tick = Math.floor(t * 10), tt = tick / 10;
      let acc = 0, i = 0;
      while (i < shots.length - 1 && tt >= acc + shots[i].dur) { acc += shots[i].dur; i++; }
      const s = shots[i], lt = Math.min(tt - acc, s.dur), lTick = Math.floor(lt * 10);
      if (s.voice !== undefined && !I.voiced[i] && lt >= 0.3) {
        I.voiced[i] = true;
        const id = `cs_${I.id}_${s.voice}`;
        if (!(this.audio && this.audio.playVoice && this.audio.playVoice(id, 3)) && this.audio && this.audio.duckMusic) this.audio.duckMusic(s.dur);
      }
      const P = PAL[I.S.mood];
      R = mul(Math.floor(tick / 2) * 9973 + i * 101);
      x.fillStyle = P.paper; x.fillRect(0, 0, W, H); grain(tick);
      s.draw(lt, P, lTick, I.S, { noFlash: document.body.classList.contains('cr-noflash') });
      if (s.voice !== undefined) {
        const line = I.chap.shots[s.voice];
        if (line) say(P, lt, String(line.speaker || '').replace(/^[^A-Za-z]+/, ''), line.text, 0.4);
      }
      // jagged ink wipes between shots
      x.fillStyle = INK;
      if (i < shots.length - 1 && lt > s.dur - WIPE) { const w = (lt - (s.dur - WIPE)) / WIPE; x.beginPath(); x.moveTo(0, 0); for (let k = 0; k <= 10; k++) x.lineTo(W * w * 1.1 + j(18), k * H / 10); x.lineTo(0, H); x.fill(); }
      if (i > 0 && lt < WIPE * 0.6) { const w = 1 - lt / (WIPE * 0.6); x.beginPath(); x.moveTo(W, 0); for (let k = 0; k <= 10; k++) x.lineTo(W - W * w * 1.1 + j(18), k * H / 10); x.lineTo(W, H); x.fill(); }
    },

    inkEnd() {
      const I = this._ink; if (!I) return;
      this._ink = null;
      cancelAnimationFrame(I.raf);
      I.el.style.display = 'none';
      this.cutsceneActive = false;
      this.cutsceneState = null;
      if (this.audio && this.audio.stopVoice) this.audio.stopVoice(3);
      const ov = document.getElementById('cutscene-overlay'); if (ov) ov.classList.remove('active');
      this.updateStoryTrackerUI && this.updateStoryTrackerUI();
    },

    skipCutscene() {
      if (this._ink) { this.inkEnd(); return; }
      return orig.skipCutscene.apply(this, arguments);
    },

    // ---- stingers over gameplay --------------------------------------------------------------------
    inkSting(kind, data) {
      const el = overlay('ink-sting', 4500, false);
      el.style.display = 'flex';
      const ctx = el.querySelector('canvas').getContext('2d');
      const dur = 3.2, S = this._sting = { kind, data, t0: performance.now(), ctx, el };
      const step = (now) => {
        if (this._sting !== S) return;
        const t = (now - S.t0) / 1000;
        if (t >= dur) { el.style.display = 'none'; this._sting = null; return; }
        x = ctx; const tick = Math.floor(t * 10), tt = tick / 10;
        R = mul(Math.floor(tick / 2) * 7919 + 3);
        x.clearRect(0, 0, W, H);
        if (kind === 'boss') this.inkStingBoss(tt, tick, data); else this.inkStingLoot(tt, tick, data);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },

    inkStingBoss(t, tick, d) {
      const p = ph(t, 0, 0.5);
      x.save(); x.translate(0, j(2));
      x.fillStyle = INK; x.beginPath(); x.moveTo(0, 210); x.lineTo(W * p, 200 + j(4)); x.lineTo(W * p, 330 + j(4)); x.lineTo(0, 320); x.fill();
      x.restore();
      if (t > 0.5 && t < 2.6) {
        txt('☠', 170, 265, 58, 1, d.world ? EYE : '#E8E5DF');
        txt(String(d.name || '').toUpperCase().slice(0, 26), W / 2 + 30, 250, d.name && d.name.length > 16 ? 44 : 60, ph(t, 0.5, 1), '#E8E5DF', `500 ${d.name && d.name.length > 16 ? 44 : 60}px Georgia, serif`);
        txt(String(d.sub || '').toUpperCase().slice(0, 48), W / 2 + 30, 302, 16, ph(t, 0.9, 1.5), '#B9BEC3', '500 16px Arial, sans-serif');
        if (d.world) path([[250, 325], [710, 323]], ph(t, 1.1, 1.6), 3, EYE);
      }
      if (t >= 2.6) {
        const k = (t - 2.6) * 70;
        for (let i = 0; i < 24; i++) { x.fillStyle = INK; x.fillRect((i * 97) % W, 200 + ((i * 37) % 130) + k * (i % 2 ? 1 : -1), 26, 8); }
      }
    },

    inkStingLoot(t, tick, d) {
      const myth = d.rarity === 'mythic', col = myth ? EYE : GOLD;
      const a = Math.min(1, t / 0.25) * (t > 2.8 ? Math.max(0, 1 - (t - 2.8) / 0.4) : 1);
      x.globalAlpha = a;
      x.fillStyle = '#F6EFE2'; x.fillRect(250, 110, 460, 330); grain(tick);
      x.clearRect(0, 0, 250, H); x.clearRect(710, 0, 250, H); x.clearRect(250, 0, 460, 110); x.clearRect(250, 440, 460, 100);
      path([[250, 110], [710, 110], [710, 440], [250, 440], [250, 110]], 1, 3, INK);
      for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2 + (tick % 2) * 0.04; path([[480 + Math.cos(an) * 50, 220 + Math.sin(an) * 50], [480 + Math.cos(an) * (90 + (i % 2) * 26), 220 + Math.sin(an) * (90 + (i % 2) * 26)]], ph(t, 0.1 + i * 0.02, 0.4 + i * 0.02), 3, col); }
      path([[471, 258], [480, 150], [489, 258], [471, 258]], ph(t, 0.3, 0.8), 3, INK);          // blade with a point
      path([[480, 240], [480, 168]], ph(t, 0.6, 0.9), 1.5, INK);                                  // fuller
      path([[448, 262], [512, 262]], ph(t, 0.7, 0.9), 6, INK);                                    // crossguard
      path([[480, 266], [480, 290]], ph(t, 0.8, 1), 5, INK); if (t > 1) dot(480, 296, 6, INK);   // grip + pommel
      txt(myth ? 'MYTHIC' : 'LEGENDARY', W / 2, 335, 40, ph(t, 0.8, 1.3), col, '500 40px Georgia, serif');
      path([[340, 362], [620, 360]], ph(t, 1.2, 1.7), 4, TERRA);
      txt(String(d.name || '').slice(0, 34), W / 2, 392, 19, ph(t, 1.4, 2.2), INK, 'italic 19px Georgia, serif');
      if (d.power) txt('✦ ' + d.power, W / 2, 420, 15, ph(t, 1.9, 2.5), TERRA, '500 15px Arial, sans-serif');
      x.globalAlpha = 1;
    },

    // boss intro: the ink band replaces the old title card
    epicCard(eyebrow, name, sub, ms, red) {
      if (eyebrow === 'BOSS' || eyebrow === 'WORLD BOSS') { this.inkSting('boss', { name, sub, world: eyebrow === 'WORLD BOSS' }); return; }
      return orig.epicCard ? orig.epicCard.apply(this, arguments) : undefined;
    },

    // legendary / mythic pickups get the gold ink card (the text callout is skipped while it shows)
    pickupItem(it) {
      const st = this.mmoState, fits = st && st.bag && st.bag.length < ((window.MMO && window.MMO.BAG_SIZE) || 80);
      if (fits && it && (it.rarity === 'legendary' || it.rarity === 'mythic')) {
        const pw = it.power && window.CR_LEGEND && window.CR_LEGEND.POWERS[it.power];
        this.inkSting('loot', { rarity: it.rarity, name: it.name, power: pw ? pw.name : '' });   // before the reward fanfare so its text callout is skipped
      }
      return orig.pickupItem.apply(this, arguments);
    },

    epicCallout(text, color) {
      if (this._sting && this._sting.kind === 'loot' && /LEGENDARY|MYTHIC/.test(String(text))) return;
      return orig.epicCallout ? orig.epicCallout.apply(this, arguments) : undefined;
    }
  });

  window.CR_INKCINE = { SEQ };
})();
